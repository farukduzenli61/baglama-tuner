/*
 * reference-tone.js — Baglama.ReferenceTone (Ajan B)
 * Referans ses: 'pluck' (Karplus-Strong tel sesi) veya 'sine'.
 * - AudioContext tembel oluşturulur; Baglama.AudioEngine.getContext() bir context döndürüyorsa o kullanılır.
 * - Karplus-Strong örnekleri JS'te bir AudioBuffer'a önceden hesaplanır (AudioWorklet/ScriptProcessor yok).
 *   Döngü gecikmesi kesirli all-pass ile ayarlanır; perde hatası < ~0.5 cent (tests/run-notes-tests.js).
 * - Tıkırtı olmaması için: kısa giriş rampası, sonda yumuşak sönüm, stop() üstel kapanış.
 */
(function (B) {
  'use strict';

  var ownCtx = null;
  var current = null; // { src, gain, endTime, ctx }

  function getCtx() {
    try {
      if (B.AudioEngine && typeof B.AudioEngine.getContext === 'function') {
        var ec = B.AudioEngine.getContext();
        if (ec && ec.state !== 'closed') return ec;
      }
    } catch (e) { /* yoksay */ }
    if (ownCtx && ownCtx.state !== 'closed') return ownCtx;
    var Ctor = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
    if (!Ctor) return null;
    try { ownCtx = new Ctor(); } catch (e) { ownCtx = null; }
    return ownCtx;
  }

  // Basit deterministik gürültü (testlerde tekrarlanabilir olsun diye).
  function makeRng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return (s / 4294967296) * 2 - 1;
    };
  }

  /**
   * Karplus-Strong tel sesi üretir. Döner: Float32Array (mono), tepe genliği ~peak.
   * Saf fonksiyon; DOM/Web Audio gerektirmez (test için dışa açık: _synthPluck).
   */
  function synthPluck(hz, sampleRate, durationSec, opts) {
    opts = opts || {};
    var sr = sampleRate;
    var len = Math.max(1, Math.round(durationSec * sr));
    var out = new Float32Array(len);
    if (!(hz > 20) || hz > sr / 4) return out;

    var P = sr / hz;                       // hedef döngü gecikmesi (örnek)
    var N = Math.floor(P - 0.6);           // tam sayı gecikme hattı
    if (N < 2) N = 2;
    var frac = P - 0.5 - N;                // ortalama filtresi 0.5 örnek geciktirir; kalan all-pass'e
    var C = (1 - frac) / (1 + frac);       // birinci derece all-pass katsayısı (Jaffe & Smith 1983)

    // Sönüm: ~durationSec içinde -60 dB (yalnız döngü kaybı; alçak geçiren ortalamanın kaybı ayrıca var)
    var t60 = Math.max(0.3, opts.t60 || durationSec * 0.9);
    var rho = Math.pow(10, -3 / (t60 * hz));
    if (rho > 0.9995) rho = 0.9995;

    // Uyarım: hafif yumuşatılmış, DC'si alınmış gürültü (tezene vuruşu)
    var rnd = makeRng(opts.seed || 12345);
    var d = new Float32Array(N);
    var prev = 0, mean = 0, i;
    var bright = opts.brightness == null ? 0.6 : opts.brightness; // 0..1
    for (i = 0; i < N; i++) {
      var w = rnd();
      prev = bright * w + (1 - bright) * prev;
      d[i] = prev;
      mean += prev;
    }
    mean /= N;
    for (i = 0; i < N; i++) d[i] -= mean;

    var idx = 0, last = 0, apX1 = 0, apY1 = 0, peak = 0;
    for (var n = 0; n < len; n++) {
      var y = d[idx];
      var avg = 0.5 * (y + last);
      last = y;
      var ap = C * avg + apX1 - C * apY1;
      apX1 = avg; apY1 = ap;
      d[idx] = rho * ap;
      idx++; if (idx >= N) idx = 0;
      out[n] = y;
      var a = y < 0 ? -y : y;
      if (a > peak) peak = a;
    }

    // Zarf: 3 ms giriş rampası + son %15 (en az 0.15 s) kosinüs sönüm -> tıkırtısız bitiş
    var target = opts.peak || 0.6;
    var g = peak > 0 ? target / peak : 0;
    var attack = Math.min(len, Math.round(0.003 * sr));
    var fade = Math.min(len, Math.max(Math.round(0.15 * sr), Math.round(len * 0.15)));
    for (n = 0; n < len; n++) {
      var e = g;
      if (n < attack) e *= n / attack;
      var fromEnd = len - 1 - n;
      if (fromEnd < fade) e *= 0.5 - 0.5 * Math.cos(Math.PI * fromEnd / fade);
      out[n] *= e;
    }
    return out;
  }

  function stopNow(fadeSec) {
    if (!current) return;
    var cur = current;
    current = null;
    try {
      var t = cur.ctx.currentTime;
      cur.gain.gain.cancelScheduledValues(t);
      cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
      cur.gain.gain.setTargetAtTime(0, t, (fadeSec || 0.06) / 4);
      cur.src.stop(t + (fadeSec || 0.06) + 0.02);
    } catch (e) {
      try { cur.src.stop(); } catch (e2) { /* yoksay */ }
    }
  }

  function play(hz, options) {
    var o = options || {};
    var durationSec = o.durationSec > 0 ? Math.min(10, o.durationSec) : 2.5;
    var mode = o.mode === 'sine' ? 'sine' : 'pluck';
    var volume = o.volume >= 0 ? Math.min(1, o.volume) : 0.5;
    if (!(hz > 20 && hz < 5000)) return;

    var ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) { /* yoksay */ } }

    stopNow(0.04);

    var t0 = ctx.currentTime + 0.02;
    var gain = ctx.createGain();
    gain.connect(ctx.destination);
    var src;

    if (mode === 'pluck') {
      var data = synthPluck(hz, ctx.sampleRate, durationSec, { seed: (Math.random() * 1e9) | 0 });
      var buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
      if (buf.copyToChannel) buf.copyToChannel(data, 0); else buf.getChannelData(0).set(data);
      src = ctx.createBufferSource();
      src.buffer = buf;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(volume, t0 + 0.005);
    } else {
      src = ctx.createOscillator();
      src.type = 'sine';
      src.frequency.setValueAtTime(hz, t0);
      var amp = volume * 0.6; // saf sinüs aynı seviyede daha yüksek duyulur
      var rel = Math.min(0.4, durationSec * 0.3);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(amp, t0 + 0.04);
      gain.gain.setValueAtTime(amp, t0 + durationSec - rel);
      gain.gain.linearRampToValueAtTime(0, t0 + durationSec);
    }
    src.connect(gain);
    var entry = { src: src, gain: gain, ctx: ctx, endTime: t0 + durationSec };
    src.onended = function () {
      try { gain.disconnect(); } catch (e) { /* yoksay */ }
      if (current === entry) current = null;
    };
    src.start(t0);
    src.stop(t0 + durationSec + 0.02);
    current = entry;
  }

  function stop() { stopNow(0.06); }

  function isPlaying() {
    if (!current) return false;
    try {
      if (current.ctx.currentTime > current.endTime + 0.05) { current = null; return false; }
    } catch (e) { /* yoksay */ }
    return true;
  }

  B.ReferenceTone = {
    play: play,
    stop: stop,
    isPlaying: isPlaying,
    _synthPluck: synthPluck // test için
  };
})(window.Baglama = window.Baglama || {});
