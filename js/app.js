/* Bağlama Akort — Uygulama birleştirmesi (Ajan C)
 * Notes / Tunings / AudioEngine / ReferenceTone modüllerini Baglama.UI'ye bağlar.
 * Modüllerden biri eksikse veya hata verirse çökmez; kullanıcıya Türkçe açıklama gösterir.
 */
(function (B) {
  'use strict';

  var STORAGE_KEY = 'baglama-tuner-settings';
  var DEFAULTS = {
    instrumentId: null,     // ilk enstrüman
    duzenId: 'baglama',
    transpose: 0,
    a4: 440,
    notation: 'tr',
    mode: 'auto',
    selectedStringId: null,
    showKoma: false,
    theme: 'auto'           // sözleşmeye ek: 'auto'|'dark'|'light'
  };
  var KOMA = 1200 / 53;

  var UI = null;
  var settings = {};
  var rawStrings = [];      // Tunings.getStrings sonucu (Tel nesneleri)
  var playTimer = 0;
  var missing = [];

  function log() {
    if (window.console && console.warn) console.warn.apply(console, ['[Bağlama]'].concat([].slice.call(arguments)));
  }
  function safe(fn, fallback) {
    try { return fn(); } catch (e) { log(e); return fallback; }
  }
  function has(name) { return !!(B[name] && typeof B[name] === 'object'); }

  // ---------- ayarlar ----------
  function loadSettings() {
    var s = {};
    try {
      var raw = window.localStorage && localStorage.getItem(STORAGE_KEY);
      if (raw) s = JSON.parse(raw) || {};
    } catch (e) { s = {}; }
    var out = {};
    for (var k in DEFAULTS) out[k] = (s[k] !== undefined) ? s[k] : DEFAULTS[k];
    out.transpose = Math.max(-7, Math.min(7, parseInt(out.transpose, 10) || 0));
    out.a4 = Number(out.a4);
    if (!isFinite(out.a4) || out.a4 < 415 || out.a4 > 466) out.a4 = 440;
    if (out.notation !== 'en') out.notation = 'tr';
    if (out.mode !== 'manual') out.mode = 'auto';
    out.showKoma = !!out.showKoma;
    if (out.theme !== 'dark' && out.theme !== 'light') out.theme = 'auto';
    return out;
  }
  function saveSettings() {
    try { if (window.localStorage) localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) { /* gizli mod vb. */ }
  }

  // ---------- nota adları ----------
  function namesArray() {
    var N = B.Notes || {};
    var tr = N.NAMES_TR || ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
    var en = N.NAMES_EN || ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return settings.notation === 'en' ? en : tr;
  }
  function splitMidi(midi) {
    var m = Math.round(midi);
    var names = namesArray();
    return { name: names[((m % 12) + 12) % 12], octave: Math.floor(m / 12) - 1 };
  }
  function midiLabel(midi, fallback) {
    if (!isFinite(midi)) return fallback || '?';
    var p = splitMidi(midi);
    return p.name + p.octave;
  }
  function fmtHz(hz) { return UI.format(hz, 1); }

  function centsBetween(hz, target) {
    if (has('Notes') && typeof B.Notes.centsBetween === 'function') return B.Notes.centsBetween(hz, target);
    return 1200 * Math.log(hz / target) / Math.LN2;
  }

  // ---------- enstrüman / düzen / teller ----------
  function instruments() { return (has('Tunings') && B.Tunings.INSTRUMENTS) || []; }
  function duzenlerFor(instrumentId) {
    var all = (has('Tunings') && B.Tunings.DUZENLER) || [];
    // Sözleşmeye ek, isteğe bağlı: düzen yalnızca bazı enstrümanlar içinse süz.
    var filtered = all.filter(function (d) {
      var list = d && (d.instruments || d.instrumentIds);
      return !Array.isArray(list) || list.indexOf(instrumentId) !== -1;
    });
    return filtered.length ? filtered : all;
  }
  function findById(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }

  function refreshSelectors() {
    var ins = instruments();
    if (!findById(ins, settings.instrumentId)) settings.instrumentId = ins.length ? ins[0].id : null;
    var dz = duzenlerFor(settings.instrumentId);
    if (!findById(dz, settings.duzenId)) settings.duzenId = dz.length ? dz[0].id : null;
    UI.setInstruments(ins, settings.instrumentId);
    UI.setDuzenler(dz.map(withNotes), settings.duzenId);
  }

  // Düzen seçeneğine o anki enstrüman + transpoze ile tel notalarını ekler:
  // "Bağlama Düzeni (Fa# · Mi · Si)" — sıra: üst · orta · alt.
  var PHYS_ORDER = ['ust', 'orta', 'alt'];
  function withNotes(d) {
    if (!d || !has('Tunings') || typeof B.Tunings.getStrings !== 'function') return d;
    var strings = safe(function () {
      return B.Tunings.getStrings(settings.instrumentId, d.id, settings.transpose) || [];
    }, []);
    var byId = {};
    strings.forEach(function (s) { byId[s.id] = s; });
    var ordered = PHYS_ORDER.map(function (id) { return byId[id]; }).filter(Boolean);
    if (ordered.length !== strings.length || !ordered.length) return d;
    var short = ordered.map(function (s) { return splitMidi(s.midi).name; }).join(' · ');
    var full = ordered.map(function (s) { return midiLabel(s.midi, s.noteName); }).join(' · ');
    var copy = {};
    for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) copy[k] = d[k];
    copy.label = (d.label || d.id) + ' (' + short + ')';
    copy.description = 'Teller (üst · orta · alt): ' + full + (d.description ? ' — ' + d.description : '');
    return copy;
  }

  function refreshStrings() {
    rawStrings = [];
    if (has('Notes') && typeof B.Notes.setA4 === 'function') safe(function () { B.Notes.setA4(settings.a4); });
    if (has('Tunings') && typeof B.Tunings.getStrings === 'function' && settings.instrumentId && settings.duzenId) {
      rawStrings = safe(function () {
        return B.Tunings.getStrings(settings.instrumentId, settings.duzenId, settings.transpose) || [];
      }, []);
    }
    if (settings.selectedStringId && !findById(rawStrings, settings.selectedStringId)) {
      settings.selectedStringId = null;
    }
    if (settings.mode === 'manual' && !settings.selectedStringId && rawStrings.length) {
      settings.selectedStringId = rawStrings[0].id;
    }
    // Ekranda soldan sağa fiziksel sıra: üst · orta · alt
    var physical = rawStrings.slice().sort(function (a, b) {
      var ia = PHYS_ORDER.indexOf(a.id), ib = PHYS_ORDER.indexOf(b.id);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    var view = physical.map(function (s) {
      var bams = (s.courses || []).filter(function (c) { return c && c.isBam; });
      var extra = bams.length ? 'bam ' + bams.map(function (c) { return midiLabel(c.midi, c.noteName); }).join(', ') : '';
      return { id: s.id, label: s.label || s.id, note: midiLabel(s.midi, s.noteName), hz: s.hz, extra: extra };
    });
    UI.setStrings(view, { mode: settings.mode, selectedId: settings.selectedStringId });
  }

  function refreshAll() {
    refreshSelectors();
    refreshStrings();
    UI.setSettings(settings);
    saveSettings();
  }

  // ---------- perde işleme ----------
  // Bir tel için en yakın hedef: tel + grubundaki diğer teller (bam teli bir oktav pes).
  function centsToString(hz, s) {
    var best = { cents: centsBetween(hz, s.hz), isBam: false, hz: s.hz, midi: s.midi };
    (s.courses || []).forEach(function (c) {
      if (!c || !isFinite(c.hz)) return;
      var ct = centsBetween(hz, c.hz);
      if (Math.abs(ct) < Math.abs(best.cents)) best = { cents: ct, isBam: !!c.isBam, hz: c.hz, midi: c.midi };
    });
    return best;
  }

  function onPitch(p) {
    if (!UI) return;
    if (has('ReferenceTone') && safe(function () { return B.ReferenceTone.isPlaying(); }, false)) {
      return; // referans ses çalarken mikrofonun onu "duymasını" yok say
    }
    if (!p || !isFinite(p.hz) || p.hz <= 0 || !rawStrings.length) {
      UI.setReading(null);
      return;
    }
    var hz = p.hz;
    var target = null, match = null;
    if (settings.mode === 'manual') {
      target = findById(rawStrings, settings.selectedStringId) || rawStrings[0];
      match = centsToString(hz, target);
    } else {
      var res = null;
      if (has('Tunings') && typeof B.Tunings.findClosestString === 'function') {
        res = safe(function () { return B.Tunings.findClosestString(hz, rawStrings); }, null);
      }
      if (res && res.string) {
        target = res.string;
        match = centsToString(hz, target);
        // findClosestString'in verdiği cent (oktav düzeltmeli olabilir) daha yakınsa onu kullan
        if (isFinite(res.cents) && Math.abs(res.cents) < Math.abs(match.cents)) {
          match = { cents: res.cents, isBam: false, hz: target.hz, midi: target.midi };
        }
      } else {
        rawStrings.forEach(function (s) {
          var m = centsToString(hz, s);
          if (!match || Math.abs(m.cents) < Math.abs(match.cents)) { match = m; target = s; }
        });
      }
    }
    if (!target || !match) { UI.setReading(null); return; }

    // Algılanan notanın adı
    var midi, octave, name;
    var an = has('Notes') && typeof B.Notes.analyze === 'function'
      ? safe(function () { return B.Notes.analyze(hz); }, null) : null;
    if (an && isFinite(an.midi)) midi = an.midi;
    else midi = Math.round(69 + 12 * Math.log(hz / (settings.a4 || 440)) / Math.LN2);
    var sp = splitMidi(midi);
    name = sp.name;
    octave = (an && isFinite(an.octave)) ? an.octave : sp.octave;

    var targetLabel = midiLabel(match.midi, target.noteName);
    var text = 'Hedef: ' + (target.label || target.id) + ' — ' + targetLabel +
      ' (' + fmtHz(match.hz) + ' Hz)' + (match.isBam ? ' · bam teli' : '');

    UI.setReading({
      hz: hz,
      note: name,
      octave: octave,
      cents: match.cents,
      koma: match.cents / ((B.Notes && B.Notes.KOMA_CENTS) || KOMA),
      targetText: text,
      stringId: target.id,
      stable: !!p.stable
    });
  }

  // ---------- hatalar ----------
  var ERRORS = {
    denied: ['Mikrofon izni verilmedi',
      'Adres çubuğundaki kilit veya mikrofon simgesine tıklayıp bu sayfaya mikrofon izni verin, ardından sayfayı yenileyin.\n' +
      'İzin penceresi hiç çıkmıyorsa programı klasördeki baslat.bat ile (http://localhost:8000) açmayı deneyin.'],
    nodevice: ['Mikrofon bulunamadı',
      'Bilgisayarınıza/telefonunuza bir mikrofon bağlı olduğundan emin olun.\n' +
      'Windows\'ta: Ayarlar › Gizlilik ve güvenlik › Mikrofon bölümünden tarayıcının mikrofona erişimine izin verin.'],
    busy: ['Mikrofon kullanılamıyor',
      'Mikrofon başka bir program (Zoom, Teams, Discord vb.) tarafından kullanılıyor olabilir. O programı kapatıp tekrar deneyin.'],
    insecure: ['Tarayıcı burada mikrofona izin vermiyor',
      'Tarayıcılar mikrofonu yalnızca güvenli adreslerde (https:// veya http://localhost) açar; bazı tarayıcılar dosyayı doğrudan açınca (file://) da engeller.\n' +
      'Windows\'ta klasördeki baslat.bat dosyasına çift tıklayın: program http://localhost:8000 adresinde açılır.'],
    unknown: ['Mikrofon başlatılamadı', 'Beklenmeyen bir hata oluştu. Sayfayı yenileyip tekrar deneyin.']
  };
  function mapError(err) {
    if (!err) return { code: 'unknown' };
    if (err.code && ERRORS[err.code]) return err;
    var n = err.name || '';
    if (n === 'NotAllowedError' || n === 'PermissionDeniedError') return { code: 'denied', message: err.message };
    if (n === 'SecurityError') return { code: window.isSecureContext === false ? 'insecure' : 'denied', message: err.message };
    if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') return { code: 'nodevice', message: err.message };
    if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError') return { code: 'busy', message: err.message };
    if (!micSupported() || window.isSecureContext === false) return { code: 'insecure', message: err.message };
    return { code: 'unknown', message: err.message || String(err) };
  }
  function showError(err) {
    var e = mapError(err);
    var m = ERRORS[e.code] || ERRORS.unknown;
    var text = m[1];
    if (e.code === 'unknown' && e.message) text += '\nAyrıntı: ' + e.message;
    UI.showMessage('error', m[0], text);
    UI.announce(m[0]);
  }
  function micSupported() {
    return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
  }

  // ---------- mikrofon ----------
  var micBusy = false;
  function engineRunning() {
    return has('AudioEngine') && safe(function () { return !!B.AudioEngine.isRunning(); }, false);
  }
  function toggleMic() {
    if (!has('AudioEngine')) {
      UI.showMessage('error', 'Ses motoru yüklenemedi', 'js/audio-engine.js dosyası eksik veya hatalı. Program klasörünün tam olduğundan emin olun.');
      return;
    }
    if (micBusy) return;
    if (engineRunning()) {
      safe(function () { B.AudioEngine.stop(); });
      UI.setMicState('idle');
      UI.setReading(null);
      UI.announce('Mikrofon kapatıldı.');
      return;
    }
    // Destek/güvenli bağlam denetimini AudioEngine yapar (onError 'insecure'); burada yalnızca temizle.
    UI.clearMessage();
    UI.setMicState('starting');
    micBusy = true;
    var pr;
    try { pr = B.AudioEngine.start(); } catch (e) { pr = Promise.reject(e); }
    Promise.resolve(pr).then(function () {
      micBusy = false;
      var running = safe(function () { return B.AudioEngine.isRunning(); }, true);
      if (running === false) {
        UI.setMicState('idle');
        return;
      }
      UI.setMicState('running');
      UI.announce('Mikrofon açık. Bir tele vurun.');
    }, function (err) {
      micBusy = false;
      UI.setMicState('idle');
      showError(err);
    });
  }

  // ---------- referans ses ----------
  function playReference(id) {
    var s = findById(rawStrings, id);
    if (!s) return;
    if (!has('ReferenceTone') || typeof B.ReferenceTone.play !== 'function') {
      UI.showMessage('warn', 'Referans ses kullanılamıyor', 'js/reference-tone.js dosyası eksik veya hatalı.');
      return;
    }
    var ok = safe(function () { B.ReferenceTone.play(s.hz); return true; }, false);
    if (!ok) {
      UI.showMessage('warn', 'Referans ses çalınamadı', 'Tarayıcınız ses çalmaya izin vermiyor olabilir. Sayfaya bir kez dokunup tekrar deneyin.');
      return;
    }
    UI.setPlaying(id);
    UI.announce((s.label || '') + ' referans sesi: ' + midiLabel(s.midi, s.noteName));
    clearInterval(playTimer);
    var started = Date.now();
    playTimer = setInterval(function () {
      var playing = safe(function () { return B.ReferenceTone.isPlaying(); }, false);
      if (!playing || Date.now() - started > 8000) {
        clearInterval(playTimer);
        UI.setPlaying(null);
      }
    }, 150);
  }

  // ---------- olaylar ----------
  function onSettingChange(key, value) {
    settings[key] = value;
    if (key === 'theme') {
      UI.applyTheme(value);
      saveSettings();
      return;
    }
    if (key === 'mode' && value === 'manual' && !settings.selectedStringId && rawStrings.length) {
      settings.selectedStringId = rawStrings[0].id;
    }
    if (key === 'instrumentId' || key === 'duzenId' || key === 'transpose' || key === 'a4' || key === 'notation' || key === 'mode') {
      refreshAll();
    } else {
      UI.setSettings(settings);
      saveSettings();
    }
  }
  function onStringSelect(id) {
    // Bir tele tıklamak onu hedef yapar (manuel moda geçer); aynı tele tekrar tıklamak referans sesi çalar.
    if (settings.mode === 'manual' && settings.selectedStringId === id) {
      playReference(id);
      return;
    }
    settings.selectedStringId = id;
    if (settings.mode !== 'manual') {
      settings.mode = 'manual';
      refreshAll();
    } else {
      UI.setSettings(settings);
      saveSettings();
    }
    var s = findById(rawStrings, id);
    if (s) UI.announce('Hedef tel: ' + (s.label || id) + ', ' + midiLabel(s.midi, s.noteName));
  }

  // ---------- başlat ----------
  function boot() {
    var root = document.getElementById('app');
    if (!root) return;
    if (!has('UI')) {
      var msg = document.getElementById('boot-msg') || root;
      msg.textContent = 'Arayüz dosyası (js/ui.js) yüklenemedi. Program klasörünün eksiksiz olduğundan emin olun.';
      return;
    }
    UI = B.UI;
    settings = loadSettings();
    try {
      UI.init(root, {
        onSettingChange: onSettingChange,
        onStringSelect: onStringSelect,
        onPlayReference: playReference,
        onMicToggle: toggleMic
      });
    } catch (e) {
      log(e);
      root.textContent = 'Arayüz başlatılamadı: ' + (e && e.message ? e.message : e);
      return;
    }
    UI.applyTheme(settings.theme);

    ['Notes', 'Tunings', 'PitchDetector', 'AudioEngine', 'ReferenceTone'].forEach(function (n) {
      if (!has(n)) missing.push(n);
    });
    var files = { Notes: 'js/notes.js', Tunings: 'js/tunings.js', PitchDetector: 'js/pitch-detector.js', AudioEngine: 'js/audio-engine.js', ReferenceTone: 'js/reference-tone.js' };

    refreshAll();

    if (missing.length) {
      var critical = missing.filter(function (n) { return n !== 'ReferenceTone'; });
      UI.showMessage(critical.length ? 'error' : 'warn', 'Bazı program dosyaları yüklenemedi',
        'Eksik veya hatalı: ' + missing.map(function (n) { return files[n]; }).join(', ') + '.\n' +
        (critical.length ? 'Akort göstergesi bu dosyalar olmadan çalışamaz. ' : 'Referans ses çalınamayacak. ') +
        'Program klasörünü eksiksiz indirip tekrar açın.');
      if (!has('AudioEngine') || !has('Notes') || !has('Tunings')) UI.setMicState('unavailable');
    } else if (window.isSecureContext === false || !micSupported()) {
      var ins = ERRORS.insecure;
      UI.showMessage('warn', ins[0], ins[1]);
    }

    if (has('AudioEngine')) {
      var AE = B.AudioEngine;
      safe(function () { if (typeof AE.onPitch === 'function') AE.onPitch(onPitch); });
      safe(function () { if (typeof AE.onLevel === 'function') AE.onLevel(function (rms) { UI.setLevel(rms); }); });
      safe(function () {
        if (typeof AE.onError === 'function') AE.onError(function (err) {
          micBusy = false;
          if (!engineRunning()) UI.setMicState('idle');
          showError(err);
        });
      });
    }

    // Klavye kısayolu: Boşluk = mikrofon aç/kapa (bir form öğesi odakta değilken)
    document.addEventListener('keydown', function (ev) {
      if (ev.code !== 'Space' && ev.key !== ' ') return;
      var t = ev.target && ev.target.tagName;
      if (t === 'INPUT' || t === 'SELECT' || t === 'BUTTON' || t === 'TEXTAREA' || t === 'SUMMARY') return;
      ev.preventDefault();
      toggleMic();
    });

    // Sistem teması değişirse (elle seçim yoksa) simgeyi güncelle
    try {
      var mq = window.matchMedia('(prefers-color-scheme: light)');
      var upd = function () { if (settings.theme === 'auto') UI.applyTheme('auto'); };
      if (mq.addEventListener) mq.addEventListener('change', upd); else if (mq.addListener) mq.addListener(upd);
    } catch (e) { /* eski tarayıcı */ }
  }

  // ---------- PWA: service worker + "Ana ekrana ekle" ----------
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  }
  function setupPwa() {
    // file:// altında service worker çalışmaz; yalnızca http(s)
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      var reg = function () {
        navigator.serviceWorker.register('sw.js').catch(function (e) { log('SW kaydı başarısız', e); });
      };
      if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg);
    }
    if (isStandalone()) return;

    var footer = document.querySelector('.footer');
    if (!footer) return;
    var box = document.createElement('p');
    box.className = 'install-box';
    box.hidden = true;
    var credit = footer.querySelector('.footer-credit');
    footer.insertBefore(box, credit || null);

    var deferred = null;
    window.addEventListener('beforeinstallprompt', function (ev) {
      // Android / masaüstü Chrome-Edge: kendi düğmemizle kurulum öner
      ev.preventDefault();
      deferred = ev;
      box.textContent = '';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'install-btn';
      btn.textContent = '📲 Ana ekrana ekle';
      btn.addEventListener('click', function () {
        if (!deferred) return;
        deferred.prompt();
        deferred.userChoice.then(function () { deferred = null; box.hidden = true; }, function () {});
      });
      box.appendChild(btn);
      box.hidden = false;
    });
    window.addEventListener('appinstalled', function () { box.hidden = true; });

    // iOS Safari kurulum olayı vermez: kısa yönerge göster
    var ua = navigator.userAgent || '';
    var isIos = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIos) {
      box.textContent = '📲 Ana ekrana eklemek için: Paylaş düğmesi → "Ana Ekrana Ekle"';
      box.hidden = false;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(setupPwa, 0); });
  else setTimeout(setupPwa, 0);

  B.App = { boot: boot, getSettings: function () { return settings; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.Baglama = window.Baglama || {});
