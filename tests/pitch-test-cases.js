/*
 * Baglama.PitchTests — PitchDetector için sentetik sinyal üreteçleri ve test senaryoları.
 * Hem tests/pitch-tests.html (tarayıcı) hem tests/run-pitch-tests.js (Node + vm) kullanır.
 * Ajan A.
 */
(function (B) {
  'use strict';

  // ---------- deterministik rastgele ----------
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gaussFactory(seed) {
    var rnd = mulberry32(seed);
    return function () {
      var u = 1 - rnd(), v = rnd();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
  }

  function rmsOf(b) {
    var s = 0;
    for (var i = 0; i < b.length; i++) s += b[i] * b[i];
    return Math.sqrt(s / b.length);
  }

  // ---------- üreteçler ----------
  function sine(f, sr, n, amp, phase) {
    var b = new Float32Array(n);
    amp = amp == null ? 0.5 : amp;
    phase = phase || 0;
    for (var i = 0; i < n; i++) b[i] = amp * Math.sin(2 * Math.PI * f * i / sr + phase);
    return b;
  }

  // harmonics: [{k, a, decay(saniye, opsiyonel), phase}]
  function additive(f, sr, n, harmonics, offsetSec) {
    var b = new Float32Array(n);
    var t0 = offsetSec || 0;
    for (var h = 0; h < harmonics.length; h++) {
      var H = harmonics[h], fk = f * H.k;
      if (fk >= sr / 2) continue;
      var ph = H.phase || 0;
      for (var i = 0; i < n; i++) {
        var t = t0 + i / sr;
        var env = H.decay ? Math.exp(-t / H.decay) : 1;
        b[i] += H.a * env * Math.sin(2 * Math.PI * fk * t + ph);
      }
    }
    return b;
  }

  // Bant sınırlı testere (1/k genlikli tüm harmonikler)
  function saw(f, sr, n, amp) {
    var hs = [];
    for (var k = 1; f * k < sr / 2; k++) hs.push({ k: k, a: 1 / k });
    return normalize(additive(f, sr, n, hs), amp == null ? 0.5 : amp);
  }

  function normalize(b, peak) {
    var m = 0;
    for (var i = 0; i < b.length; i++) m = Math.max(m, Math.abs(b[i]));
    if (m > 0) for (i = 0; i < b.length; i++) b[i] *= peak / m;
    return b;
  }

  /*
   * Karplus-Strong tel sesi. Gecikme hattı tam sayı L, ikili ortalama filtresi
   * doğrusal fazlı ve tam 0.5 örnek gecikmeli → periyot tam olarak L + 0.5,
   * f0 = sr / (L + 0.5) (gerçek değer kesin bilinir).
   * pluckPos: tezene konumu (0..0.5) — tarak filtresi ile harmonik içeriği değişir.
   * Dönen: { buf, f0 } — buf, startSec'ten itibaren n örnek.
   */
  function karplus(L, sr, n, opts) {
    opts = opts || {};
    var rho = opts.rho == null ? 0.996 : opts.rho;
    var startSec = opts.startSec || 0;
    var seed = opts.seed || 1;
    var rnd = mulberry32(seed);
    var line = new Float64Array(L);
    for (var i = 0; i < L; i++) line[i] = rnd() * 2 - 1;
    // tezene konumu: x[i] - x[i - P] (tarak) → bazı harmonikler zayıflar
    if (opts.pluckPos) {
      var P = Math.max(1, Math.round(L * opts.pluckPos));
      var tmp = new Float64Array(L);
      for (i = 0; i < L; i++) tmp[i] = line[i] - line[(i - P + L) % L];
      line = tmp;
    }
    var skip = Math.round(startSec * sr);
    var total = skip + n;
    var out = new Float32Array(n);
    var idx = 0, prev = line[L - 1];
    for (var t = 0; t < total; t++) {
      var cur = line[idx];
      var y = rho * 0.5 * (cur + prev);
      prev = cur;
      line[idx] = y;
      idx = idx + 1 === L ? 0 : idx + 1;
      if (t >= skip) out[t - skip] = cur;
    }
    // Not: çıkış = hattın okunan değeri; y(t) = rho·(x(t-L)+x(t-L-1))/2 → periyot L+0.5
    return { buf: normalize(out, 0.5), f0: sr / (L + 0.5) };
  }

  function addNoise(b, snrDb, seed) {
    var g = gaussFactory(seed || 7);
    var sig = rmsOf(b);
    var nr = sig / Math.pow(10, snrDb / 20);
    var o = new Float32Array(b.length);
    for (var i = 0; i < b.length; i++) o[i] = b[i] + nr * g();
    return o;
  }

  function mix(a, b, gb) {
    var o = new Float32Array(a.length);
    for (var i = 0; i < a.length; i++) o[i] = a[i] + gb * b[i];
    return o;
  }

  function cents(hz, ref) { return 1200 * Math.log(hz / ref) / Math.LN2; }

  // Bağlama tipik tel sesi: zengin harmonik, üst harmonikler hızlı söner
  function stringHarmonics(count, weakFund) {
    var hs = [];
    for (var k = 1; k <= count; k++) {
      var a = 1 / Math.pow(k, 0.8);
      if (k === 1 && weakFund != null) a = weakFund;
      hs.push({ k: k, a: a, decay: 1.2 / (1 + 0.6 * k), phase: k * 0.7 });
    }
    return hs;
  }

  // ---------- senaryolar ----------
  // Her senaryo: { group, name, sr, n, make() → {buf, f0, accept?:[hz...]} , tol(cent), expectNull? }
  function buildCases() {
    var cases = [];
    var freqs = [60, 73.42, 82.41, 110, 146.83, 196, 220, 293.66, 329.63, 440, 587.33, 880, 1174.66, 1396.91];
    var configs = [{ sr: 48000, n: 4096 }, { sr: 44100, n: 4096 }, { sr: 48000, n: 2048 }];

    configs.forEach(function (c) {
      freqs.forEach(function (f) {
        cases.push({ group: 'Saf sinüs', name: f + ' Hz', sr: c.sr, n: c.n, tol: 1,
          make: function () { return { buf: sine(f, c.sr, c.n, 0.5, 0.3), f0: f }; } });
      });
    });

    [48000, 44100].forEach(function (sr) {
      freqs.forEach(function (f) {
        cases.push({ group: 'Harmonikli testere', name: f + ' Hz', sr: sr, n: 4096, tol: 1,
          make: function () { return { buf: saw(f, sr, 4096), f0: f }; } });
      });
    });

    // Karplus-Strong: farklı L, zaman konumu, tezene konumu
    var ksL = [{ L: 799 }, { L: 582 }, { L: 435 }, { L: 326 }, { L: 244 }, { L: 217 }, { L: 163 }, { L: 108 }, { L: 81 }, { L: 54 }, { L: 40 }];
    [{ s: 0.0, label: 'vuruş anı' }, { s: 0.08, label: '80 ms' }, { s: 0.5, label: '500 ms' }, { s: 1.5, label: '1.5 s' }].forEach(function (w) {
      ksL.forEach(function (k) {
        cases.push({ group: 'Karplus-Strong tel (' + w.label + ')', name: 'L=' + k.L + ' (' + (48000 / (k.L + 0.5)).toFixed(2) + ' Hz)',
          sr: 48000, n: 4096, tol: 3,
          make: function () { return karplus(k.L, 48000, 4096, { startSec: w.s, pluckPos: 0.13, seed: k.L }); } });
      });
    });

    // Temel frekansı zayıf (ve tamamen eksik) sinyal
    [82.41, 146.83, 220, 293.66, 440, 880].forEach(function (f) {
      cases.push({ group: 'Temel frekans zayıf (%5)', name: f + ' Hz', sr: 48000, n: 4096, tol: 3,
        make: function () { return { buf: normalize(additive(f, 48000, 4096, stringHarmonics(12, 0.05), 0.1), 0.5), f0: f }; } });
      cases.push({ group: 'Temel frekans yok (0)', name: f + ' Hz', sr: 48000, n: 4096, tol: 3,
        make: function () { return { buf: normalize(additive(f, 48000, 4096, stringHarmonics(12, 0), 0.1), 0.5), f0: f }; } });
      cases.push({ group: 'Sadece çift harmonikler zayıf tek (2,4,6 güçlü; 1,3,5 %15)', name: f + ' Hz', sr: 48000, n: 4096, tol: 3,
        make: function () {
          var hs = [];
          for (var k = 1; k <= 10; k++) hs.push({ k: k, a: k % 2 === 0 ? 1 / k * 2 : 0.15 / k, decay: 1, phase: k });
          return { buf: normalize(additive(f, 48000, 4096, hs, 0.1), 0.5), f0: f };
        } });
    });

    // Oktav pes bam teli: üst tel f + bam f/2 (tam oktav). f veya f/2 kabul.
    [[146.83, 0.6], [146.83, 1.0], [196, 0.6], [220, 1.0], [293.66, 0.4], [293.66, 1.0], [329.63, 0.8]].forEach(function (p) {
      var f = p[0], g = p[1];
      cases.push({ group: 'Oktav pes bam eklenmiş', name: f + ' Hz + bam ' + (f / 2).toFixed(2) + ' Hz (bam genlik ' + g + ')',
        sr: 48000, n: 4096, tol: 3,
        make: function () {
          var up = additive(f, 48000, 4096, stringHarmonics(10), 0.1);
          var bam = additive(f / 2, 48000, 4096, stringHarmonics(14), 0.1);
          return { buf: normalize(mix(up, bam, g), 0.5), f0: f, accept: [f, f / 2] };
        } });
    });
    // Karplus-Strong üst tel + KS bam. Bam periyodu 2L+1.5 (tam oktav 2L+1 olurdu)
    // → bam birkaç cent pes; gerçek kayıttaki gibi tam periyodik olmayan karışım.
    [163, 108, 217].forEach(function (L) {
      cases.push({ group: 'Oktav pes bam eklenmiş', name: 'KS L=' + L + ' + KS bam L=' + (2 * L + 1) + ' (bam ' + (1200 * Math.log((2 * L + 1.5) / (2 * L + 1)) / Math.LN2).toFixed(1) + ' cent pes)',
        sr: 48000, n: 4096, tol: 3,
        make: function () {
          var up = karplus(L, 48000, 4096, { startSec: 0.1, pluckPos: 0.13, seed: L });
          var bam = karplus(2 * L + 1, 48000, 4096, { startSec: 0.1, pluckPos: 0.2, seed: L + 99 });
          return { buf: normalize(mix(up.buf, bam.buf, 0.7), 0.5), f0: up.f0, accept: [up.f0, bam.f0] };
        } });
    });

    // Gürültü eklenmiş
    [[20, 'KS'], [10, 'KS'], [6, 'KS'], [10, 'sinüs'], [0, 'sinüs']].forEach(function (p) {
      var snr = p[0], kind = p[1];
      [326, 163, 81].forEach(function (L) {
        var f = 48000 / (L + 0.5);
        cases.push({ group: 'Beyaz gürültü SNR ' + snr + ' dB (' + kind + ')', name: f.toFixed(2) + ' Hz', sr: 48000, n: 4096, tol: 3,
          make: function () {
            var base = kind === 'KS' ? karplus(L, 48000, 4096, { startSec: 0.1, pluckPos: 0.13, seed: L }).buf : sine(f, 48000, 4096, 0.4);
            return { buf: addNoise(base, snr, L * 3 + snr), f0: f };
          } });
      });
    });

    // Çift tel (aynı nota, 2 cent ayrık) — ortalama frekans beklenir
    [146.83, 293.66].forEach(function (f) {
      cases.push({ group: 'Çift tel ±1 cent ayrık', name: f + ' Hz', sr: 48000, n: 4096, tol: 3,
        make: function () {
          var r = Math.pow(2, 1 / 1200);
          var a = additive(f * r, 48000, 4096, stringHarmonics(10), 0.1);
          var b = additive(f / r, 48000, 4096, stringHarmonics(10), 0.1);
          return { buf: normalize(mix(a, b, 1), 0.5), f0: f };
        } });
    });

    // Null beklenen
    cases.push({ group: 'Sessizlik / gürültü', name: 'Tam sessizlik', sr: 48000, n: 4096, expectNull: true,
      make: function () { return { buf: new Float32Array(4096) }; } });
    cases.push({ group: 'Sessizlik / gürültü', name: 'Çok düşük seviye (rms 0.002) sinüs', sr: 48000, n: 4096, expectNull: true,
      make: function () { return { buf: sine(440, 48000, 4096, 0.0028) }; } });
    cases.push({ group: 'Sessizlik / gürültü', name: 'Saf beyaz gürültü (null veya clarity<0.5)', sr: 48000, n: 4096, expectNull: true, allowLowClarity: 0.5,
      make: function () {
        var g = gaussFactory(11), b = new Float32Array(4096);
        for (var i = 0; i < b.length; i++) b[i] = 0.1 * g();
        return { buf: b };
      } });

    return cases;
  }

  // ---------- çalıştırıcı ----------
  function runCase(detector, c) {
    var sig = c.make();
    var t0 = now();
    var res = detector.detect(sig.buf, c.sr, { minHz: 60, maxHz: 1400, threshold: 0.12 });
    var ms = now() - t0;
    var out = { group: c.group, name: c.name, sr: c.sr, n: c.n, ms: ms, res: res, f0: sig.f0, pass: false, errCents: null, matched: null, note: '' };
    if (c.expectNull) {
      out.pass = res === null || (c.allowLowClarity != null && res.clarity < c.allowLowClarity);
      out.note = res ? ('hz=' + res.hz.toFixed(2) + ' clarity=' + res.clarity.toFixed(2)) : 'null';
      return out;
    }
    if (!res) { out.note = 'null döndü'; return out; }
    var accept = sig.accept || [sig.f0];
    var best = null;
    accept.forEach(function (a) {
      var e = cents(res.hz, a);
      if (best === null || Math.abs(e) < Math.abs(best.e)) best = { e: e, a: a };
    });
    out.errCents = best.e;
    out.matched = best.a;
    out.pass = Math.abs(best.e) <= c.tol;
    var oct = Math.round(cents(res.hz, sig.f0) / 1200);
    if (oct !== 0 && accept.length === 1) out.note = 'OKTAV HATASI (' + (oct > 0 ? '+' : '') + oct + ')';
    else if (Math.abs(cents(res.hz, sig.f0)) > 600) out.note = 'bam oktavı seçildi';
    return out;
  }

  function now() {
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
    return Date.now();
  }

  function runAll(detector) {
    return buildCases().map(function (c) { return runCase(detector, c); });
  }

  /*
   * Rastgele tarama: count adet rastgele senaryo (frekans 60–1400 Hz, sr 44.1/48 kHz,
   * N 2048/4096, pencere konumu 0–1.5 s, SNR 6–40 dB, tür: KS / zayıf temelli harmonik /
   * bam karışımı). Dönen: { total, pass, octaveErrors, nulls, maxAbsCents, p95AbsCents, fails[] }
   */
  function sweep(detector, count, seed, tol) {
    var rnd = mulberry32(seed || 12345);
    tol = tol || 3;
    var stats = { total: 0, pass: 0, octaveErrors: 0, nulls: 0, maxAbsCents: 0, p95AbsCents: 0, fails: [],
      // AudioEngine'in varsayılan clarity ≥ 0.8 kapısından geçenler
      gated: { accepted: 0, pass: 0, octaveErrors: 0, maxAbsCents: 0 } };
    var errs = [];
    for (var it = 0; it < count; it++) {
      var sr = rnd() < 0.5 ? 44100 : 48000;
      var n = rnd() < 0.5 ? 2048 : 4096;
      var kind = rnd();
      var snr = 6 + rnd() * 34;
      var startSec = rnd() * 1.5;
      var sig, label;
      if (kind < 0.45) {
        var f = 60 * Math.pow(1400 / 60, rnd());
        var L = Math.max(20, Math.round(sr / f - 0.5));
        sig = karplus(L, sr, n, { startSec: startSec, pluckPos: 0.05 + rnd() * 0.4, seed: it + 1, rho: 0.99 + rnd() * 0.009 });
        sig.accept = [sig.f0];
        label = 'KS';
      } else if (kind < 0.75) {
        var f1 = 60 * Math.pow(1400 / 60, rnd());
        var weak = rnd() < 0.5 ? rnd() * 0.1 : null;
        sig = { buf: normalize(additive(f1, sr, n, stringHarmonics(4 + Math.floor(rnd() * 12), weak), startSec), 0.5), f0: f1, accept: [f1] };
        label = 'harmonik' + (weak != null ? ' (zayıf temel ' + weak.toFixed(2) + ')' : '');
      } else {
        var fu = 120 * Math.pow(1400 / 120, rnd());
        var g = 0.2 + rnd() * 0.9;
        var up = additive(fu, sr, n, stringHarmonics(10), startSec);
        var bam = additive(fu / 2, sr, n, stringHarmonics(14), startSec);
        sig = { buf: normalize(mix(up, bam, g), 0.5), f0: fu, accept: [fu, fu / 2] };
        label = 'bam karışımı (g=' + g.toFixed(2) + ')';
      }
      var buf = addNoise(sig.buf, snr, it * 7 + 3);
      var res = detector.detect(buf, sr);
      stats.total++;
      var keep = { buf: buf, sr: sr, f0: sig.f0, accept: sig.accept };
      var desc = label + ' f0=' + sig.f0.toFixed(2) + ' sr=' + sr + ' N=' + n + ' t=' + startSec.toFixed(2) + 's SNR=' + snr.toFixed(1) + 'dB';
      if (!res) { stats.nulls++; stats.fails.push(desc + ' → null'); (stats.failSignals = stats.failSignals || []).push(keep); continue; }
      var best = null;
      sig.accept.forEach(function (a) { var e = cents(res.hz, a); if (best === null || Math.abs(e) < Math.abs(best)) best = e; });
      errs.push(Math.abs(best));
      if (res.clarity >= 0.8) {
        stats.gated.accepted++;
        if (Math.abs(best) <= tol) stats.gated.pass++;
        else if (Math.abs(best) > 600) stats.gated.octaveErrors++;
        stats.gated.maxAbsCents = Math.max(stats.gated.maxAbsCents, Math.abs(best));
      }
      if (Math.abs(best) <= tol) stats.pass++;
      else {
        if (Math.abs(Math.round(best / 1200)) >= 1 || Math.abs(best) > 600) stats.octaveErrors++;
        stats.fails.push(desc + ' → ' + res.hz.toFixed(2) + ' Hz (' + best.toFixed(2) + ' cent, clarity ' + res.clarity.toFixed(2) + ')');
        keep.res = res; keep.desc = desc;
        (stats.failSignals = stats.failSignals || []).push(keep);
      }
    }
    errs.sort(function (a, b) { return a - b; });
    stats.maxAbsCents = errs.length ? errs[errs.length - 1] : 0;
    stats.p95AbsCents = errs.length ? errs[Math.floor(errs.length * 0.95)] : 0;
    return stats;
  }

  // Performans: N örneklik buffer için ortalama ms
  function benchmark(detector, sr, n, iters) {
    var buf = karplus(217, sr, n, { startSec: 0.1, seed: 3 }).buf;
    for (var w = 0; w < 20; w++) detector.detect(buf, sr);
    var t0 = now();
    for (var i = 0; i < iters; i++) detector.detect(buf, sr);
    return (now() - t0) / iters;
  }

  B.PitchTests = {
    gen: { sine: sine, saw: saw, additive: additive, karplus: karplus, addNoise: addNoise, mix: mix, normalize: normalize },
    cents: cents,
    buildCases: buildCases,
    runCase: runCase,
    runAll: runAll,
    sweep: sweep,
    benchmark: benchmark
  };
})(window.Baglama = window.Baglama || {});
