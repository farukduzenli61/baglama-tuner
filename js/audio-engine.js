/*
 * Baglama.AudioEngine — mikrofon yakalama + perde takibi (Ajan A).
 * Klasik script + IIFE; AudioWorklet ve ES module YOK.
 * Mikrofon → MediaStreamSource → AnalyserNode (→ sessiz Gain → hedef; Safari için)
 * requestAnimationFrame döngüsünde getFloatTimeDomainData + Baglama.PitchDetector.detect.
 *
 * Sözleşme (PLAN.md):
 *   start() → Promise<boolean>   (hata olursa false döner, onError tetiklenir; reddetmez)
 *   stop(), isRunning(), getContext(), onPitch(cb), onLevel(cb), onError(cb), setSmoothing(0..1)
 *   onPitch cb: { hz, clarity, rms, cents?, stable } | null   — her karede
 * Ekler (geriye uyumlu):
 *   on*(cb) bir "abonelikten çık" fonksiyonu döndürür; birden çok dinleyici desteklenir.
 *   pitch nesnesinde ek alanlar: rawHz, midi, noteName, held (kısa kesintide son değer).
 *   setOptions({...}), getOptions(), getSampleRate(), getOrCreateContext().
 */
(function (B) {
  'use strict';

  var LN2 = Math.LN2;
  function centsBetween(a, b) { return 1200 * Math.log(a / b) / LN2; }
  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  var opts = {
    minHz: 60,
    maxHz: 1400,
    threshold: 0.12,     // YIN eşiği
    minRms: 0.006,       // bunun altı sessizlik
    minClarity: 0.8,     // bunun altındaki tespitler yok sayılır
    attackMs: 70,        // tezene vuruşundan sonra yok sayılan süre
    onsetRatio: 2.0,     // kısa süreli seviye bu kat artarsa "yeni vuruş"
    jumpCents: 60,       // bundan büyük sıçrama = yeni nota (filtre sıfırlanır)
    jumpFrames: 2,       // sıçramanın kabulü için ardışık kare sayısı
    octaveJumpFrames: 4, // ~1 oktavlık sıçrama için (oktav hatasına karşı daha temkinli)
    stableMs: 150,       // stable = bu süre boyunca nota sabit
    stableCents: 10,     // "sabit" penceresi (±)
    holdMs: 150,         // kısa kesintide son değeri tut
    fftSize: 0           // 0 = otomatik (~85 ms: 44.1/48 kHz'de 4096)
  };
  var smoothing = 0.5;

  var listeners = { pitch: [], level: [], error: [] };

  var ctx = null, stream = null, source = null, analyser = null, sink = null;
  var floatBuf = null, byteBuf = null;
  var running = false, paused = false, starting = null;
  var rafId = 0, timerId = 0;
  var gestureHooked = false;

  // takip durumu
  var st;
  function resetTracking() {
    st = {
      history: [],        // son ham Hz değerleri (medyan için)
      pending: [],        // sıçrama adayları
      smoothLog: null,    // yumuşatılmış log2(Hz)
      anchorLog: null, stableSince: 0,
      lastOut: null, lastGoodAt: -1e9,
      lastTick: 0,
      shortRmsAvg: 0,     // kısa pencere RMS'in yavaş ortalaması (vuruş tespiti)
      attackUntil: 0,
      lastClarity: 0
    };
  }
  resetTracking();

  // ---------- dinleyiciler ----------
  function addListener(type, cb) {
    if (typeof cb !== 'function') return function () {};
    listeners[type].push(cb);
    return function () {
      var i = listeners[type].indexOf(cb);
      if (i >= 0) listeners[type].splice(i, 1);
    };
  }
  function emit(type, payload) {
    var ls = listeners[type].slice();
    for (var i = 0; i < ls.length; i++) {
      try { ls[i](payload); } catch (e) { if (typeof console !== 'undefined') console.error('[AudioEngine] dinleyici hatası:', e); }
    }
  }
  function emitError(code, message, err) {
    emit('error', { code: code, message: message, cause: err || null });
  }

  // ---------- AudioContext ----------
  function getOrCreateContext() {
    if (ctx && ctx.state !== 'closed') return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC({ latencyHint: 'interactive' }); }
    catch (e) { try { ctx = new AC(); } catch (e2) { ctx = null; } }
    if (ctx) {
      try {
        ctx.onstatechange = function () {
          // iOS: telefon görüşmesi vb. "interrupted"/"suspended" → kullanıcı hareketinde sürdür
          if (running && !paused && ctx && ctx.state !== 'running') hookGestureResume();
        };
      } catch (e3) { /* yok say */ }
    }
    return ctx;
  }

  function resumeContext() {
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return Promise.resolve();
    try {
      var p = ctx.resume();
      return p && p.then ? p.catch(function () {}) : Promise.resolve();
    } catch (e) { return Promise.resolve(); }
  }

  // Bir sonraki kullanıcı hareketinde AudioContext.resume() (iOS Safari)
  function hookGestureResume() {
    if (gestureHooked || typeof document === 'undefined') return;
    gestureHooked = true;
    var evs = ['pointerdown', 'touchend', 'mousedown', 'keydown'];
    function h() {
      resumeContext().then(function () {
        if (ctx && ctx.state === 'running') {
          gestureHooked = false;
          evs.forEach(function (e) { document.removeEventListener(e, h, true); });
        }
      });
    }
    evs.forEach(function (e) { document.addEventListener(e, h, true); });
  }

  // ---------- başlat / durdur ----------
  function insecureContext() {
    if (typeof window.isSecureContext === 'boolean') return !window.isSecureContext;
    var p = (window.location && window.location.protocol) || '';
    var h = (window.location && window.location.hostname) || '';
    return !(p === 'https:' || p === 'file:' || h === 'localhost' || h === '127.0.0.1');
  }

  function mapGumError(err) {
    var name = (err && err.name) || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return { code: 'denied', message: 'Mikrofon izni reddedildi. Tarayıcının adres çubuğundaki kilit/mikrofon simgesinden izin verip tekrar deneyin.' };
    }
    if (name === 'SecurityError') {
      if (insecureContext()) return { code: 'insecure', message: 'Mikrofon yalnızca güvenli bağlantıda (https veya localhost) kullanılabilir. baslat.bat ile http://localhost:8000 üzerinden açın.' };
      return { code: 'denied', message: 'Mikrofon erişimi tarayıcı veya sistem ayarlarınca engellendi.' };
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
      return { code: 'nodevice', message: 'Mikrofon bulunamadı. Bir mikrofon bağlı olduğundan emin olun.' };
    }
    if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
      return { code: 'unknown', message: 'Mikrofon açılamadı; başka bir uygulama kullanıyor olabilir.' };
    }
    return { code: 'unknown', message: 'Mikrofon başlatılamadı: ' + ((err && (err.message || err.name)) || 'bilinmeyen hata') };
  }

  function chooseFftSize(sr) {
    if (opts.fftSize) return opts.fftSize;
    // ~85 ms pencere: 60 Hz (bam / pes teller) için ~5 periyot, sıfır gecikme hedefi değil doğruluk
    return sr > 50000 ? 8192 : 4096;
  }

  function start() {
    if (running) return Promise.resolve(true);
    if (starting) return starting;

    if (!window.navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (insecureContext()) {
        emitError('insecure', 'Mikrofon yalnızca güvenli bağlantıda (https veya localhost) kullanılabilir. baslat.bat ile http://localhost:8000 üzerinden açın.');
      } else {
        emitError('unknown', 'Bu tarayıcı mikrofon erişimini desteklemiyor. Güncel Chrome, Edge, Firefox veya Safari kullanın.');
      }
      return Promise.resolve(false);
    }
    if (!B.PitchDetector || typeof B.PitchDetector.detect !== 'function') {
      emitError('unknown', 'Perde algılayıcı (pitch-detector.js) yüklenmedi.');
      return Promise.resolve(false);
    }

    // Kullanıcı hareketinin içindeyken (await öncesi) bağlamı oluştur ve sürdür → iOS Safari
    var c = getOrCreateContext();
    if (!c) {
      emitError('unknown', 'Bu tarayıcı Web Audio API desteklemiyor.');
      return Promise.resolve(false);
    }
    resumeContext();

    var constraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1
      },
      video: false
    };

    starting = navigator.mediaDevices.getUserMedia(constraints).then(function (s) {
      stream = s;
      return resumeContext().then(function () {
        if (ctx.state !== 'running') hookGestureResume();
        source = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = chooseFftSize(ctx.sampleRate);
        analyser.smoothingTimeConstant = 0;
        // Bazı tarayıcılar (eski Safari) hedefe bağlı olmayan düğümü işlemez:
        // sessiz bir kazanç düğümüyle hedefe bağla (geri besleme olmaz).
        sink = ctx.createGain();
        sink.gain.value = 0;
        source.connect(analyser);
        analyser.connect(sink);
        sink.connect(ctx.destination);
        floatBuf = new Float32Array(analyser.fftSize);
        byteBuf = null;

        var tracks = stream.getAudioTracks ? stream.getAudioTracks() : [];
        tracks.forEach(function (t) {
          t.addEventListener('ended', function () {
            if (!running) return;
            stop();
            emitError('nodevice', 'Mikrofon bağlantısı kesildi.');
          });
        });

        resetTracking();
        running = true;
        paused = typeof document !== 'undefined' && document.hidden === true;
        if (!paused) scheduleLoop();
        starting = null;
        return true;
      });
    }).catch(function (err) {
      starting = null;
      cleanupNodes();
      var m = mapGumError(err);
      emitError(m.code, m.message, err);
      return false;
    });
    return starting;
  }

  function cleanupNodes() {
    cancelLoop();
    try { if (source) source.disconnect(); } catch (e) { /* yok say */ }
    try { if (analyser) analyser.disconnect(); } catch (e) { /* yok say */ }
    try { if (sink) sink.disconnect(); } catch (e) { /* yok say */ }
    if (stream && stream.getTracks) stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* yok say */ } });
    source = analyser = sink = stream = null;
  }

  function stop() {
    var was = running;
    running = false;
    paused = false;
    cleanupNodes();
    resetTracking();
    // AudioContext kapatılmaz: ReferenceTone aynı bağlamı kullanabilir.
    if (was) { emit('pitch', null); emit('level', 0); }
  }

  // ---------- döngü ----------
  function scheduleLoop() {
    cancelLoop();
    if (typeof window.requestAnimationFrame === 'function') {
      rafId = window.requestAnimationFrame(loop);
    } else {
      timerId = setTimeout(function () { loop(nowMs()); }, 16);
    }
  }
  function cancelLoop() {
    if (rafId && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(rafId);
    if (timerId) clearTimeout(timerId);
    rafId = timerId = 0;
  }
  function loop() {
    rafId = timerId = 0;
    if (!running || paused) return;
    try { tick(nowMs()); } catch (e) { if (typeof console !== 'undefined') console.error('[AudioEngine]', e); }
    if (running && !paused) scheduleLoop();
  }

  function readBuffer() {
    if (analyser.getFloatTimeDomainData) {
      analyser.getFloatTimeDomainData(floatBuf);
    } else {
      if (!byteBuf) byteBuf = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(byteBuf);
      for (var i = 0; i < byteBuf.length; i++) floatBuf[i] = (byteBuf[i] - 128) / 128;
    }
    return floatBuf;
  }

  function median(arr) {
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var m = a.length >> 1;
    return a.length % 2 ? a[m] : 0.5 * (a[m - 1] + a[m]);
  }

  function historySize() { return 3 + 2 * Math.round(smoothing * 2); } // 3, 5, 7

  function tick(t) {
    if (!analyser || !ctx || ctx.state !== 'running') return;
    var buf = readBuffer();
    var n = buf.length, sr = ctx.sampleRate, i;

    // tüm pencere RMS (seviye göstergesi) + son ~12 ms RMS (vuruş tespiti)
    var ss = 0;
    for (i = 0; i < n; i++) ss += buf[i] * buf[i];
    var rms = Math.sqrt(ss / n);
    var shortN = Math.min(n, Math.max(256, Math.round(sr * 0.012)));
    var ss2 = 0;
    for (i = n - shortN; i < n; i++) ss2 += buf[i] * buf[i];
    var shortRms = Math.sqrt(ss2 / shortN);
    emit('level', Math.min(1, rms));

    var dt = st.lastTick ? Math.min(200, t - st.lastTick) : 16.7;
    st.lastTick = t;

    // --- tezene vuruşu (onset) ---
    var onset = shortRms > opts.minRms * 2 && st.shortRmsAvg > 0 && shortRms > st.shortRmsAvg * opts.onsetRatio;
    // yavaş ortalama: artışta yavaş, düşüşte hızlı takip (sönümden sonra yeni vuruşu kaçırmamak için)
    var k = shortRms > st.shortRmsAvg ? 0.15 : 0.5;
    st.shortRmsAvg = st.shortRmsAvg ? st.shortRmsAvg + k * (shortRms - st.shortRmsAvg) : shortRms;
    if (onset) {
      st.shortRmsAvg = shortRms;   // aynı vuruşun sonraki karelerde tekrar tetiklemesini önle
      st.attackUntil = t + opts.attackMs;
      st.history = [];
      st.pending = [];
      st.anchorLog = null;          // yeni vuruş: "stable" yeniden kazanılmalı
      if (st.lastOut) { st.lastOut = shallowCopy(st.lastOut); st.lastOut.stable = false; }
    }
    if (t < st.attackUntil) {
      // geçici kısım: yeni ölçüm yapma, (varsa) son değeri tut
      emitHeldOrNull(t, rms);
      return;
    }

    // --- tespit ---
    var res = null;
    if (rms >= opts.minRms) {
      res = B.PitchDetector.detect(buf, sr, { minHz: opts.minHz, maxHz: opts.maxHz, threshold: opts.threshold, minRms: opts.minRms });
      if (res && res.clarity < opts.minClarity) res = null;
    }
    if (!res) { emitHeldOrNull(t, rms); return; }

    var raw = res.hz;
    st.lastClarity = res.clarity;

    // --- sıçrama kontrolü ---
    if (st.smoothLog !== null) {
      var cur = Math.pow(2, st.smoothLog);
      var jump = Math.abs(centsBetween(raw, cur));
      if (jump > opts.jumpCents) {
        var p = st.pending;
        if (p.length && Math.abs(centsBetween(raw, p[p.length - 1])) > opts.jumpCents) p.length = 0;
        p.push(raw);
        var octaveLike = Math.abs(jump - 1200) < 80 || Math.abs(jump - 2400) < 80;
        var need = octaveLike ? opts.octaveJumpFrames : opts.jumpFrames;
        if (p.length < need) { emitHeldOrNull(t, rms, true); return; }
        // yeni nota: filtreyi sıfırla
        st.history = p.slice();
        st.pending = [];
        st.smoothLog = null;
      } else {
        st.pending.length = 0;
      }
    }

    st.history.push(raw);
    var hs = historySize();
    while (st.history.length > hs) st.history.shift();
    var med = median(st.history);
    var medLog = Math.log(med) / LN2;

    // --- üstel yumuşatma (log alanında, kare hızından bağımsız) ---
    if (st.smoothLog === null) {
      st.smoothLog = medLog;
    } else {
      var alpha = 1 - 0.85 * smoothing;                         // 60 fps kare başına
      var diffC = Math.abs(medLog - st.smoothLog) * 1200;
      if (diffC > 15) alpha = Math.max(alpha, 0.5);             // akort burgusu çevrilirken çabuk takip
      var a = 1 - Math.pow(1 - alpha, dt / 16.67);
      st.smoothLog += a * (medLog - st.smoothLog);
    }
    var hz = Math.pow(2, st.smoothLog);

    // --- stable ---
    if (st.anchorLog === null || Math.abs(st.smoothLog - st.anchorLog) * 1200 > opts.stableCents) {
      st.anchorLog = st.smoothLog;
      st.stableSince = t;
    }
    var stable = (t - st.stableSince) >= opts.stableMs && st.history.length >= Math.min(3, hs);

    var out = { hz: hz, clarity: res.clarity, rms: rms, stable: stable, rawHz: raw, held: false };
    addNoteInfo(out);
    st.lastOut = out;
    st.lastGoodAt = t;
    emit('pitch', out);
  }

  function addNoteInfo(out) {
    var N = B.Notes;
    if (!N || typeof N.analyze !== 'function') return;
    try {
      var a = N.analyze(out.hz);
      if (a) { out.cents = a.cents; out.midi = a.midi; out.noteName = a.name; }
    } catch (e) { /* Notes yoksa/bozuksa yok say */ }
  }

  function shallowCopy(o) {
    var c = {};
    for (var key in o) if (Object.prototype.hasOwnProperty.call(o, key)) c[key] = o[key];
    return c;
  }

  function emitHeldOrNull(t, rms, keepFilters) {
    if (st.lastOut && t - st.lastGoodAt <= opts.holdMs) {
      var h = shallowCopy(st.lastOut);
      h.rms = rms;
      h.held = true;
      emit('pitch', h);
      return;
    }
    if (!keepFilters) {
      st.history = [];
      st.pending = [];
      st.smoothLog = null;
      st.anchorLog = null;
    }
    st.lastOut = null;
    emit('pitch', null);
  }

  // ---------- sayfa görünürlüğü ----------
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', function () {
      if (!running) return;
      if (document.hidden) {
        // Arka planda: döngüyü durdur, bağlamı askıya al (pil / CPU tasarrufu)
        paused = true;
        cancelLoop();
        try { if (ctx && ctx.state === 'running') ctx.suspend().catch(function () {}); } catch (e) { /* yok say */ }
        resetTracking();
        emit('pitch', null);
        emit('level', 0);
      } else {
        paused = false;
        resumeContext().then(function () {
          if (ctx && ctx.state !== 'running') hookGestureResume();
          if (running && !paused) scheduleLoop();
        });
      }
    });
  }

  // ---------- genel API ----------
  B.AudioEngine = {
    start: start,
    stop: stop,
    isRunning: function () { return running; },
    getContext: function () { return ctx; },
    getOrCreateContext: getOrCreateContext,
    getSampleRate: function () { return ctx ? ctx.sampleRate : 0; },
    onPitch: function (cb) { return addListener('pitch', cb); },
    onLevel: function (cb) { return addListener('level', cb); },
    onError: function (cb) { return addListener('error', cb); },
    setSmoothing: function (v) {
      v = Number(v);
      if (!isFinite(v)) return;
      smoothing = v < 0 ? 0 : v > 1 ? 1 : v;
    },
    getSmoothing: function () { return smoothing; },
    setOptions: function (o) {
      if (!o) return;
      for (var key in o) if (Object.prototype.hasOwnProperty.call(opts, key) && typeof o[key] === 'number' && isFinite(o[key])) opts[key] = o[key];
      if (analyser && o.fftSize) {
        try { analyser.fftSize = chooseFftSize(ctx.sampleRate); floatBuf = new Float32Array(analyser.fftSize); byteBuf = null; } catch (e) { /* geçersiz boyut */ }
      }
    },
    getOptions: function () {
      var c = {};
      for (var key in opts) c[key] = opts[key];
      return c;
    }
  };
})(window.Baglama = window.Baglama || {});
