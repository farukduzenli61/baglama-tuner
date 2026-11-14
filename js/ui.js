/* Bağlama Akort — Arayüz (Ajan C)
 * Baglama.UI: tamamen görsel katman. Diğer modüllere (Notes/Tunings/AudioEngine) doğrudan
 * bağımlı değildir; app.js ona hazır görünüm verileri (etiketler, sayılar) gönderir.
 *
 * Kullanım:
 *   Baglama.UI.init(rootEl, handlers)
 *     handlers = {
 *       onSettingChange(key, value),  // 'instrumentId'|'duzenId'|'transpose'|'a4'|'notation'|'showKoma'|'mode'|'theme'
 *       onStringSelect(stringId),     // tel butonuna tıklandı
 *       onPlayReference(stringId),    // 🔊 butonuna tıklandı
 *       onMicToggle()                 // mikrofon başlat/durdur
 *     }
 *   setInstruments(list, selectedId)   list: [{id,label,description?}]
 *   setDuzenler(list, selectedId)      list: [{id,label,description?}]
 *   setSettings(settings)              ayar kontrollerini günceller
 *   setStrings(strings, {mode, selectedId})  strings: [{id,label,note,hz,extra?}] pesten tize
 *   setActiveString(id|null, inTune)
 *   setPlaying(id|null)
 *   setReading(reading|null)           reading: {hz, note, octave, cents, koma, targetText}
 *   setLevel(rms)
 *   setMicState('idle'|'starting'|'running'|'unavailable')
 *   showMessage(kind, title, text) / clearMessage()
 *   announce(text)
 *   applyTheme(theme)                  'dark'|'light'|'auto'
 */
(function (B) {
  'use strict';

  var IN_TUNE_CENTS = 5;
  var RANGE_CENTS = 50;
  var MAX_ANGLE = 65;           // derece, ±50 cent bu açıya karşılık gelir
  var GAUGE_CX = 160, GAUGE_CY = 178, GAUGE_R = 140;
  var STALE_MS = 400;           // sinyal kesildikten sonra okumayı soluklaştır
  var CLEAR_MS = 1800;          // bu süreden sonra "Bir tele vurun"
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var els = {};
  var handlers = {};
  var state = {
    micState: 'idle',
    mode: 'auto',
    selectedId: null,
    activeId: null,
    showKoma: false,
    targetAngle: 0,
    angle: 0,
    lastReadingAt: 0,
    hasReading: false,
    tuneState: 'idle',
    lastAnnounce: '',
    lastAnnounceAt: 0,
    rafId: 0,
    strings: []
  };

  // ---------- yardımcılar ----------
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'text') e.textContent = v;
        else if (k === 'className') e.className = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : String(v));
      }
    }
    appendChildren(e, children);
    return e;
  }
  function svg(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, String(attrs[k]));
    }
    return e;
  }
  function appendChildren(e, children) {
    if (children === null || children === undefined) return;
    if (!Array.isArray(children)) children = [children];
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (c === null || c === undefined || c === false) continue;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
  }
  function call(name) {
    var fn = handlers[name];
    if (typeof fn !== 'function') return;
    var args = Array.prototype.slice.call(arguments, 1);
    try { fn.apply(null, args); } catch (err) {
      if (window.console) console.error('[UI] işleyici hatası (' + name + '):', err);
    }
  }
  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function fmt(n, digits) {
    // Türkçe ondalık ayırıcı: virgül
    return Number(n).toFixed(digits).replace('.', ',');
  }
  function signed(n, digits) {
    var s = fmt(Math.abs(n), digits);
    if (Number(s.replace(',', '.')) === 0) return '±' + s;
    return (n < 0 ? '−' : '+') + s;
  }
  function polar(angleDeg, r) {
    var a = angleDeg * Math.PI / 180;
    return { x: GAUGE_CX + r * Math.sin(a), y: GAUGE_CY - r * Math.cos(a) };
  }
  function centsToAngle(c) {
    return clamp(c, -RANGE_CENTS, RANGE_CENTS) / RANGE_CENTS * MAX_ANGLE;
  }
  function arcPath(fromDeg, toDeg, r) {
    var p1 = polar(fromDeg, r), p2 = polar(toDeg, r);
    var large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
    return 'M ' + p1.x.toFixed(2) + ' ' + p1.y.toFixed(2) +
      ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p2.x.toFixed(2) + ' ' + p2.y.toFixed(2);
  }

  // ---------- gösterge (SVG) ----------
  function buildGauge() {
    var s = svg('svg', {
      viewBox: '0 0 320 196', 'class': 'gauge', role: 'img',
      'aria-label': 'Akort göstergesi, eksi 50 ile artı 50 cent arası'
    });
    s.appendChild(svg('path', {
      d: arcPath(-MAX_ANGLE, MAX_ANGLE, GAUGE_R), 'class': 'g-track',
      fill: 'none', 'stroke-width': 10, 'stroke-linecap': 'round'
    }));
    var z = centsToAngle(IN_TUNE_CENTS);
    s.appendChild(svg('path', {
      d: arcPath(-z, z, GAUGE_R), 'class': 'g-zone', fill: 'none', 'stroke-width': 14
    }));
    for (var c = -RANGE_CENTS; c <= RANGE_CENTS; c += 5) {
      var major = c % 10 === 0;
      var a = centsToAngle(c);
      var p1 = polar(a, GAUGE_R - 12);
      var p2 = polar(a, GAUGE_R - (major ? 26 : 19));
      s.appendChild(svg('line', {
        x1: p1.x.toFixed(2), y1: p1.y.toFixed(2), x2: p2.x.toFixed(2), y2: p2.y.toFixed(2),
        'class': 'g-tick' + (major ? ' major' : ''), 'stroke-width': major ? 2.5 : 1.5,
        'stroke-linecap': 'round'
      }));
      if (major && c % 20 === 0 || c === 0 || Math.abs(c) === 50) {
        var pl = polar(a, GAUGE_R - 40);
        var t = svg('text', {
          x: pl.x.toFixed(2), y: (pl.y + 4).toFixed(2), 'text-anchor': 'middle',
          'class': 'g-label' + (c === 0 ? ' zero' : '')
        });
        t.textContent = c === 0 ? '0' : (c > 0 ? '+' + c : '−' + Math.abs(c));
        s.appendChild(t);
      }
    }
    var lp = polar(-MAX_ANGLE, GAUGE_R + 2), rp = polar(MAX_ANGLE, GAUGE_R + 2);
    var tl = svg('text', { x: (lp.x - 4).toFixed(1), y: (lp.y + 24).toFixed(1), 'text-anchor': 'middle', 'class': 'g-side' });
    tl.textContent = 'PES';
    var tr = svg('text', { x: (rp.x + 4).toFixed(1), y: (rp.y + 24).toFixed(1), 'text-anchor': 'middle', 'class': 'g-side' });
    tr.textContent = 'TİZ';
    s.appendChild(tl); s.appendChild(tr);

    var needle = svg('g', { 'class': 'g-needle-group', transform: 'rotate(0 ' + GAUGE_CX + ' ' + GAUGE_CY + ')' });
    needle.appendChild(svg('line', {
      x1: GAUGE_CX, y1: GAUGE_CY + 6, x2: GAUGE_CX, y2: GAUGE_CY - GAUGE_R + 8,
      'class': 'g-needle', 'stroke-width': 4, 'stroke-linecap': 'round'
    }));
    s.appendChild(needle);
    s.appendChild(svg('circle', { cx: GAUGE_CX, cy: GAUGE_CY, r: 9, 'class': 'g-hub' }));
    els.needle = needle;
    return s;
  }

  function animate() {
    state.rafId = 0;
    var t = now();
    // Sinyal kesildi mi?
    if (state.hasReading) {
      var age = t - state.lastReadingAt;
      if (age > CLEAR_MS) {
        clearReading();
      } else if (age > STALE_MS && state.tuneState !== 'stale') {
        setTuneState('stale');
      }
    }
    var diff = state.targetAngle - state.angle;
    if (Math.abs(diff) > 0.05) {
      state.angle += diff * 0.22;   // üstel yaklaşım (lerp) → yumuşak hareket
    } else {
      state.angle = state.targetAngle;
    }
    if (els.needle) {
      els.needle.setAttribute('transform',
        'rotate(' + state.angle.toFixed(2) + ' ' + GAUGE_CX + ' ' + GAUGE_CY + ')');
    }
    if (state.angle !== state.targetAngle || state.hasReading) scheduleFrame();
  }
  function scheduleFrame() {
    if (state.rafId) return;
    var raf = window.requestAnimationFrame || function (f) { return setTimeout(function () { f(now()); }, 16); };
    state.rafId = raf(animate);
  }

  // ---------- yapı ----------
  function buildField(labelText, control, helpEl, id) {
    return el('div', { className: 'field' }, [
      el('label', { 'for': id, text: labelText }),
      control,
      helpEl || null
    ]);
  }

  function build(root) {
    root.innerHTML = '';

    // Başlık
    els.themeBtn = el('button', {
      type: 'button', className: 'icon-btn', id: 'theme-btn',
      title: 'Temayı değiştir', 'aria-label': 'Temayı değiştir (koyu/açık)',
      onclick: function () {
        var cur = currentTheme();
        call('onSettingChange', 'theme', cur === 'dark' ? 'light' : 'dark');
      }
    }, '◐');
    var top = el('header', { className: 'topbar' }, [
      el('h1', null, [el('span', { text: 'Bağlama' }), ' Akort']),
      els.themeBtn
    ]);

    // Enstrüman + düzen
    els.instrument = el('select', { id: 'sel-instrument', onchange: function () { call('onSettingChange', 'instrumentId', els.instrument.value); } });
    els.instrumentHelp = el('div', { className: 'field-help', id: 'instrument-help' });
    els.duzen = el('select', { id: 'sel-duzen', 'aria-describedby': 'duzen-help', onchange: function () { call('onSettingChange', 'duzenId', els.duzen.value); } });
    els.duzenHelp = el('div', { className: 'field-help', id: 'duzen-help' });
    var selectors = el('section', { className: 'card selectors', 'aria-label': 'Enstrüman ve düzen' }, [
      buildField('Enstrüman', els.instrument, els.instrumentHelp, 'sel-instrument'),
      buildField('Düzen', els.duzen, els.duzenHelp, 'sel-duzen')
    ]);

    // Ayarlar (katlanabilir)
    els.transposeVal = el('output', { className: 'stepper-value', id: 'transpose-val', 'aria-live': 'polite' }, '0');
    var transpose = el('div', { className: 'field' }, [
      el('span', { className: 'field-label', id: 'transpose-label', text: 'Transpoze (yarım ses)' }),
      el('div', { className: 'stepper', role: 'group', 'aria-labelledby': 'transpose-label' }, [
        el('button', { type: 'button', 'aria-label': 'Yarım ses pesleştir', onclick: function () { stepTranspose(-1); } }, '−'),
        els.transposeVal,
        el('button', { type: 'button', 'aria-label': 'Yarım ses tizleştir', onclick: function () { stepTranspose(1); } }, '+')
      ]),
      el('div', { className: 'field-help', text: 'Bütün telleri birlikte kaydırır (−7…+7). Sapın boyuna göre ayarlayın.' })
    ]);

    els.a4 = el('input', {
      type: 'number', id: 'inp-a4', min: 415, max: 466, step: '0.1', inputmode: 'decimal',
      'aria-label': 'La4 referans frekansı (Hz)',
      onchange: function () { commitA4(els.a4.value); }
    });
    var a4 = el('div', { className: 'field' }, [
      el('label', { 'for': 'inp-a4', text: 'Referans La4 (A4) — Hz' }),
      el('div', { className: 'stepper' }, [
        el('button', { type: 'button', 'aria-label': 'A4 bir hertz azalt', onclick: function () { commitA4(Number(String(els.a4.value).replace(',', '.')) - 1); } }, '−'),
        els.a4,
        el('button', { type: 'button', 'aria-label': 'A4 bir hertz artır', onclick: function () { commitA4(Number(String(els.a4.value).replace(',', '.')) + 1); } }, '+')
      ]),
      el('div', { className: 'field-help', text: '415–466 Hz, varsayılan 440.' })
    ]);

    els.notation = el('select', { id: 'sel-notation', onchange: function () { call('onSettingChange', 'notation', els.notation.value); } }, [
      el('option', { value: 'tr', text: 'Türkçe (Do Re Mi)' }),
      el('option', { value: 'en', text: 'ABC (C D E)' })
    ]);
    var notation = buildField('Nota adları', els.notation, null, 'sel-notation');

    els.koma = el('input', { type: 'checkbox', id: 'chk-koma', onchange: function () { call('onSettingChange', 'showKoma', !!els.koma.checked); } });
    var koma = el('div', { className: 'field' }, [
      el('span', { className: 'field-label', text: 'Koma' }),
      el('label', { className: 'switch', 'for': 'chk-koma' }, [els.koma, 'Koma değerini göster (1 koma ≈ 22,6 cent)'])
    ]);

    els.settingsSummary = el('span', { className: 'settings-summary-text' });
    els.settings = el('details', { className: 'card settings', id: 'settings' }, [
      el('summary', null, ['Ayarlar', els.settingsSummary]),
      el('div', { className: 'settings-grid' }, [transpose, a4, notation, koma])
    ]);

    // Mesaj kutusu
    els.msgTitle = el('div', { className: 'message-title' });
    els.msgText = el('div', { className: 'message-text' });
    els.message = el('div', { className: 'message', role: 'alert', hidden: true }, [
      el('div', { className: 'message-body' }, [els.msgTitle, els.msgText]),
      el('button', { type: 'button', className: 'message-close', 'aria-label': 'Mesajı kapat', onclick: function () { clearMessage(); } }, '×')
    ]);

    // Gösterge
    els.noteName = el('span', { className: 'note-name', id: 'note-name' }, '—');
    els.noteOctave = el('span', { className: 'note-octave', id: 'note-octave' });
    els.direction = el('div', { className: 'direction', id: 'direction' });
    els.hz = el('span', { id: 'read-hz' }, [el('b', { text: '—' }), ' Hz']);
    els.cents = el('span', { id: 'read-cents' }, [el('b', { text: '—' }), ' cent']);
    els.komaRead = el('span', { id: 'read-koma', hidden: true }, [el('b', { text: '—' }), ' koma']);
    els.targetLine = el('div', { className: 'target-line', id: 'target-line' });
    els.tuner = el('section', { className: 'card tuner', 'data-state': 'idle', 'aria-label': 'Akort göstergesi' }, [
      buildGauge(),
      el('div', { className: 'note-row', 'aria-hidden': 'true' }, [els.noteName, els.noteOctave]),
      els.direction,
      el('div', { className: 'readouts', 'aria-hidden': 'true' }, [els.hz, els.cents, els.komaRead]),
      els.targetLine
    ]);

    // Mikrofon + seviye
    els.micBtn = el('button', { type: 'button', className: 'mic-btn', id: 'mic-btn', 'data-state': 'idle', onclick: function () { call('onMicToggle'); } });
    els.levelFill = el('div', { className: 'level-fill' });
    els.levelBar = el('div', {
      className: 'level-bar', role: 'meter', 'aria-label': 'Ses seviyesi',
      'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0
    }, els.levelFill);
    var mic = el('section', { className: 'card mic-row', 'aria-label': 'Mikrofon' }, [
      els.micBtn,
      el('div', { className: 'level' }, [el('span', { className: 'level-label', text: 'Ses seviyesi' }), els.levelBar])
    ]);

    // Teller
    els.modeAuto = el('button', { type: 'button', 'aria-pressed': 'true', onclick: function () { call('onSettingChange', 'mode', 'auto'); } }, 'Otomatik');
    els.modeManual = el('button', { type: 'button', 'aria-pressed': 'false', onclick: function () { call('onSettingChange', 'mode', 'manual'); } }, 'Manuel');
    els.stringsHint = el('span', { className: 'hint' });
    els.strings = el('div', { className: 'strings', id: 'strings', role: 'list' });
    var strings = el('section', { className: 'card', 'aria-label': 'Teller' }, [
      el('div', { className: 'strings-head' }, [
        el('div', null, [el('h2', { text: 'Teller' }), els.stringsHint]),
        el('div', { className: 'segmented', role: 'group', 'aria-label': 'Tel seçim modu' }, [els.modeAuto, els.modeManual])
      ]),
      els.strings
    ]);

    // Ekran okuyucu duyuruları
    els.live = el('div', { className: 'visually-hidden', 'aria-live': 'polite', 'aria-atomic': 'true', id: 'live' });

    var footer = el('footer', { className: 'footer' }, [
      el('p', { text: 'Çevrimdışı çalışır · Ses yalnızca tarayıcınızda işlenir, hiçbir yere gönderilmez.' }),
      el('p', { className: 'footer-credit' }, [
        'Bu program, Anthropic\'in yapay zekâ asistanı ',
        el('a', { href: 'https://claude.ai', target: '_blank', rel: 'noopener', text: 'Claude' }),
        ' (Claude Code) ile oluşturulmuştur. · ',
        el('a', { href: 'https://github.com/farukduzenli61/baglama-tuner', target: '_blank', rel: 'noopener', text: 'Kaynak kod' })
      ])
    ]);

    appendChildren(root, [top, selectors, els.settings, els.message, els.tuner, mic, strings, footer, els.live]);
    setMicState('idle');
    renderIdle();
  }

  function stepTranspose(d) {
    var cur = parseInt(els.transposeVal.getAttribute('data-value') || '0', 10) || 0;
    var next = clamp(cur + d, -7, 7);
    if (next !== cur) call('onSettingChange', 'transpose', next);
  }
  function commitA4(v) {
    var n = Number(String(v).replace(',', '.'));
    if (!isFinite(n)) n = 440;
    n = Math.round(clamp(n, 415, 466) * 10) / 10;
    els.a4.value = String(n);
    call('onSettingChange', 'a4', n);
  }

  function fillSelect(select, list, selectedId) {
    select.innerHTML = '';
    (list || []).forEach(function (item) {
      if (!item) return;
      var o = el('option', { value: item.id, text: item.label || item.id, title: item.description || null });
      select.appendChild(o);
    });
    if (selectedId !== undefined && selectedId !== null) select.value = selectedId;
  }
  function describe(list, id) {
    for (var i = 0; i < (list || []).length; i++) {
      if (list[i] && list[i].id === id) return list[i].description || '';
    }
    return '';
  }

  // ---------- genel API ----------
  var instrumentsCache = [], duzenlerCache = [];

  function setInstruments(list, selectedId) {
    instrumentsCache = list || [];
    fillSelect(els.instrument, instrumentsCache, selectedId);
    var d = describe(instrumentsCache, els.instrument.value);
    els.instrumentHelp.textContent = d;
    els.instrument.title = d;
  }
  function setDuzenler(list, selectedId) {
    duzenlerCache = list || [];
    fillSelect(els.duzen, duzenlerCache, selectedId);
    var d = describe(duzenlerCache, els.duzen.value);
    els.duzenHelp.textContent = d;
    els.duzen.title = d;
  }

  function setSettings(s) {
    if (!s) return;
    if (s.instrumentId !== undefined && els.instrument.value !== s.instrumentId) {
      els.instrument.value = s.instrumentId;
      els.instrumentHelp.textContent = describe(instrumentsCache, s.instrumentId);
    }
    if (s.duzenId !== undefined && els.duzen.value !== s.duzenId) {
      els.duzen.value = s.duzenId;
    }
    if (s.duzenId !== undefined) {
      var d = describe(duzenlerCache, s.duzenId);
      els.duzenHelp.textContent = d;
      els.duzen.title = d;
    }
    if (s.transpose !== undefined) {
      var t = parseInt(s.transpose, 10) || 0;
      els.transposeVal.setAttribute('data-value', String(t));
      els.transposeVal.textContent = t === 0 ? '0' : (t > 0 ? '+' + t : '−' + Math.abs(t));
    }
    if (s.a4 !== undefined && document.activeElement !== els.a4) els.a4.value = String(s.a4);
    if (s.notation !== undefined) els.notation.value = s.notation;
    if (s.showKoma !== undefined) {
      state.showKoma = !!s.showKoma;
      els.koma.checked = state.showKoma;
      els.komaRead.hidden = !state.showKoma;
    }
    if (s.mode !== undefined) {
      state.mode = s.mode === 'manual' ? 'manual' : 'auto';
      els.modeAuto.setAttribute('aria-pressed', state.mode === 'auto' ? 'true' : 'false');
      els.modeManual.setAttribute('aria-pressed', state.mode === 'manual' ? 'true' : 'false');
      els.stringsHint.textContent = state.mode === 'auto'
        ? ' Pesten tize · çalınan tel otomatik bulunur'
        : ' Pesten tize · akort edilecek teli seçin';
      updateStringClasses();
    }
    if (s.selectedStringId !== undefined) {
      state.selectedId = s.selectedStringId;
      updateStringClasses();
    }
    if (s.theme !== undefined) applyTheme(s.theme);
    // Ayarlar özetini güncelle
    var parts = [];
    var tv = parseInt(els.transposeVal.getAttribute('data-value') || '0', 10) || 0;
    if (tv) parts.push((tv > 0 ? '+' : '−') + Math.abs(tv) + ' yarım ses');
    parts.push('A4 ' + fmt(Number(els.a4.value || 440), Number(els.a4.value) % 1 ? 1 : 0) + ' Hz');
    parts.push(els.notation.value === 'en' ? 'ABC' : 'Do-Re-Mi');
    els.settingsSummary.textContent = parts.join(' · ');
  }

  function setStrings(list, opts) {
    opts = opts || {};
    state.strings = list || [];
    if (opts.mode !== undefined) state.mode = opts.mode;
    if (opts.selectedId !== undefined) state.selectedId = opts.selectedId;
    els.strings.innerHTML = '';
    if (!state.strings.length) {
      els.strings.appendChild(el('p', { className: 'field-help', text: 'Bu enstrüman/düzen için tel bilgisi bulunamadı.' }));
      return;
    }
    state.strings.forEach(function (s) {
      var main = el('button', {
        type: 'button', className: 'string-main',
        'aria-label': s.label + ', hedef ' + s.note + (s.extra ? ', ' + s.extra : '') + '. Hedef tel olarak seç',
        onclick: function () { call('onStringSelect', s.id); }
      }, [
        el('span', { className: 'string-label', text: s.label }),
        el('span', { className: 'string-note', text: s.note }),
        el('span', { className: 'string-hz', text: fmt(s.hz, 1) + ' Hz' + (s.extra ? ' · ' + s.extra : '') })
      ]);
      var play = el('button', {
        type: 'button', className: 'string-play', title: 'Referans sesi çal',
        'aria-label': s.label + ' referans sesini çal (' + s.note + ')',
        onclick: function () { call('onPlayReference', s.id); }
      }, '🔊');
      var wrap = el('div', { className: 'string', role: 'listitem', 'data-id': s.id }, [main, play]);
      els.strings.appendChild(wrap);
    });
    updateStringClasses();
  }

  var activeInTune = false, playingId = null;
  function updateStringClasses() {
    if (!els.strings) return;
    var nodes = els.strings.querySelectorAll('.string');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], id = n.getAttribute('data-id');
      var isSel = state.mode === 'manual' && id === state.selectedId;
      var isAct = id === state.activeId;
      n.classList.toggle('is-selected', isSel);
      n.classList.toggle('is-active', isAct && !activeInTune);
      n.classList.toggle('is-intune', isAct && activeInTune);
      n.classList.toggle('is-playing', id === playingId);
      var mainBtn = n.querySelector('.string-main');
      if (mainBtn) mainBtn.setAttribute('aria-pressed', isSel ? 'true' : 'false');
    }
  }
  function setActiveString(id, inTune) {
    if (state.activeId === id && activeInTune === !!inTune) return;
    state.activeId = id;
    activeInTune = !!inTune;
    updateStringClasses();
  }
  function setPlaying(id) {
    playingId = id;
    updateStringClasses();
  }

  function setTuneState(s) {
    if (state.tuneState === s) return;
    state.tuneState = s;
    els.tuner.setAttribute('data-state', s);
  }

  function renderIdle() {
    els.noteName.textContent = '—';
    els.noteOctave.textContent = '';
    els.hz.firstChild.textContent = '—';
    els.cents.firstChild.textContent = '—';
    els.komaRead.firstChild.textContent = '—';
    els.targetLine.textContent = '';
    if (state.micState === 'running') {
      els.direction.textContent = 'Bir tele vurun';
    } else if (state.micState === 'starting') {
      els.direction.textContent = 'Mikrofon açılıyor…';
    } else {
      els.direction.textContent = 'Başlamak için “Mikrofonu Aç”a basın';
    }
    state.targetAngle = 0;
    setTuneState('idle');
    setActiveString(null, false);
    scheduleFrame();
  }
  function clearReading() {
    state.hasReading = false;
    renderIdle();
    if (state.micState === 'running') announce('Sinyal yok. Bir tele vurun.');
  }

  /* reading = {
   *   hz:number, note:'La' , octave:4, cents:number (hedefe göre), koma:number|null,
   *   targetText:'Hedef: Alt tel — La3 (220,0 Hz)', stringId?:string
   * }  veya null (sinyal yok)
   */
  function setReading(r) {
    if (!r || !isFinite(r.hz) || !isFinite(r.cents)) {
      // sinyal yok: animate() zaman aşımlarını yönetir
      if (!state.hasReading && state.tuneState !== 'idle') renderIdle();
      scheduleFrame();
      return;
    }
    state.hasReading = true;
    state.lastReadingAt = now();
    var c = r.cents;
    state.targetAngle = centsToAngle(c);

    els.noteName.textContent = r.note || '—';
    els.noteOctave.textContent = (r.octave !== undefined && r.octave !== null) ? String(r.octave) : '';
    els.hz.firstChild.textContent = fmt(r.hz, 1);
    els.cents.firstChild.textContent = signed(c, 1);
    var k = (r.koma !== undefined && r.koma !== null && isFinite(r.koma)) ? r.koma : c / (1200 / 53);
    els.komaRead.firstChild.textContent = signed(k, 2);
    els.targetLine.textContent = r.targetText || '';

    var s, dir;
    if (Math.abs(c) <= IN_TUNE_CENTS) { s = 'intune'; dir = 'AKORTTA ✓'; }
    else if (c < 0) { s = 'flat'; dir = (c < -RANGE_CENTS ? 'Çok pes ↓' : 'Pes ↓') + ' — teli sıkın'; }
    else { s = 'sharp'; dir = (c > RANGE_CENTS ? 'Çok tiz ↑' : 'Tiz ↑') + ' — teli gevşetin'; }
    els.direction.textContent = dir;
    setTuneState(s);
    if (r.stringId !== undefined) setActiveString(r.stringId, s === 'intune');

    var spoken = (r.note || '') + (r.octave !== undefined ? r.octave : '') + ', ' +
      (s === 'intune' ? 'akortta' : (s === 'flat' ? 'pes, teli sıkın' : 'tiz, teli gevşetin'));
    announceThrottled(s + '|' + r.note, spoken);
    scheduleFrame();
  }

  function setLevel(rms) {
    var v = Number(rms) || 0;
    // dB ölçeği: −60 dBFS → %0, 0 dBFS → %100
    var pct = v <= 0 ? 0 : clamp((20 * Math.log(v) / Math.LN10 + 60) / 60 * 100, 0, 100);
    els.levelFill.style.width = pct.toFixed(1) + '%';
    els.levelBar.setAttribute('aria-valuenow', String(Math.round(pct)));
  }

  function setMicState(s) {
    state.micState = s;
    var b = els.micBtn;
    b.setAttribute('data-state', s);
    b.disabled = s === 'starting' || s === 'unavailable';
    if (s === 'running') { b.textContent = '■ Mikrofonu Durdur'; b.setAttribute('aria-pressed', 'true'); }
    else if (s === 'starting') { b.textContent = '… Açılıyor'; b.setAttribute('aria-pressed', 'false'); }
    else if (s === 'unavailable') { b.textContent = '🎤 Mikrofon kullanılamıyor'; b.setAttribute('aria-pressed', 'false'); }
    else { b.textContent = '🎤 Mikrofonu Aç'; b.setAttribute('aria-pressed', 'false'); }
    if (s !== 'running') setLevel(0);
    if (!state.hasReading) renderIdle();
  }

  function showMessage(kind, title, text) {
    els.message.setAttribute('data-kind', kind || 'info');
    els.message.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    els.msgTitle.textContent = title || '';
    els.msgText.textContent = text || '';
    els.message.hidden = false;
  }
  function clearMessage() {
    els.message.hidden = true;
  }

  function announce(text) {
    if (!els.live) return;
    state.lastAnnounce = text;
    state.lastAnnounceAt = now();
    els.live.textContent = text;
  }
  function announceThrottled(key, text) {
    var t = now();
    if (key === state.lastAnnounceKey && t - state.lastAnnounceAt < 4000) return;
    if (t - state.lastAnnounceAt < 1200) return;
    state.lastAnnounceKey = key;
    announce(text);
  }

  function currentTheme() {
    var attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark' || attr === 'light') return attr;
    var prefersLight = false;
    try { prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches; } catch (e) { /* */ }
    return prefersLight ? 'light' : 'dark';
  }
  function applyTheme(theme) {
    var root = document.documentElement;
    if (theme === 'dark' || theme === 'light') root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');
    var eff = currentTheme();
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', eff === 'light' ? '#f4f2ee' : '#14161c');
    if (els.themeBtn) {
      els.themeBtn.textContent = eff === 'light' ? '☾' : '☀';
      els.themeBtn.setAttribute('aria-label', eff === 'light' ? 'Koyu temaya geç' : 'Açık temaya geç');
      els.themeBtn.title = els.themeBtn.getAttribute('aria-label');
    }
  }

  function init(root, h) {
    handlers = h || {};
    if (!root) throw new Error('UI.init: kök öğe yok');
    build(root);
    applyTheme(document.documentElement.getAttribute('data-theme') || 'auto');
    return B.UI;
  }

  B.UI = {
    IN_TUNE_CENTS: IN_TUNE_CENTS,
    init: init,
    setInstruments: setInstruments,
    setDuzenler: setDuzenler,
    setSettings: setSettings,
    setStrings: setStrings,
    setActiveString: setActiveString,
    setPlaying: setPlaying,
    setReading: setReading,
    setLevel: setLevel,
    setMicState: setMicState,
    showMessage: showMessage,
    clearMessage: clearMessage,
    announce: announce,
    applyTheme: applyTheme,
    format: fmt
  };
})(window.Baglama = window.Baglama || {});
