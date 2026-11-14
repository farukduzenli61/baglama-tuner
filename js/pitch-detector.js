/*
 * Baglama.PitchDetector — YIN tabanlı perde (temel frekans) tespiti.
 * Ajan A. DOM / Web Audio bağımsız saf fonksiyon; klasik script + IIFE.
 *
 * Algoritma:
 *   1. DC giderme + RMS (rms < minRms → null).
 *   2. 31 dokulu sıfır fazlı alçak geçiren FIR (kesim ≈ 3.2·maxHz): geniş bantlı
 *      gürültüyü ve tezene "tık"ını bastırır, periyodu değiştirmez.
 *   3. YIN fark fonksiyonu d(τ) FFT ile O(N log N), τ ≤ N/2:
 *        d(τ) = Σ x_j² + Σ x_{j+τ}² − 2·Σ x_j·x_{j+τ}   (j = 0..W-1)
 *   4. Kümülatif ortalama normalize fark (CMNDF) d'(τ).
 *   5. Aday: [sr/maxHz, sr/minHz] içinde d' < eşik olan İLK bölgenin minimumu.
 *      Yoksa eşik global minimuma göre gevşetilip yine ilk çukur alınır
 *      (periyot katlarına = oktav-pes hatalarına kaymaz).
 *   6. Oktav koruması (dip değerleri parabolik interpolasyonla, tam sayı olmayan
 *      periyot yanlılığı olmadan karşılaştırılır):
 *        - oktav-tiz: m·τ (m=2..5) çukuru τ'dakinden çok derinse (<0.35×) m·τ;
 *        - oktav-pes: τ/2'de neredeyse aynı derinlikte çukur varsa τ/2.
 *   7. Hassaslaştırma: d(τ) çukurunda parabolik interpolasyon (gürültülü
 *      geniş çukurda uyarlamalı en küçük kareler parabolü), ardından periyodun
 *      2,4,8… katlarında çukur yeniden bulunup τ = τ_k / k → hata k kat küçülür.
 *
 * Sözleşme:
 *   detect(buffer, sampleRate, opts) → null | { hz, clarity, rms }
 *   opts: { minHz=60, maxHz=1400, threshold=0.12, minRms=0.008, lowpass=true }
 * Ekler (geriye uyumlu): sonuçta `period` (örnek); opts.minRms, opts.lowpass;
 *   Baglama.PitchDetector.DEFAULTS.
 * Not: bam teli + üst tel birlikte çalınınca sonuç üst telin frekansı VEYA bir
 *   oktav pes (bam) olabilir; ikisi de doğru perde sınıfıdır. Tunings.findClosestString
 *   oktav farkını yakalar.
 */
(function (B) {
  'use strict';

  var DEFAULTS = { minHz: 60, maxHz: 1400, threshold: 0.12, minRms: 0.008 };

  // ---------- FFT (radix-2, yerinde, Float64) ----------
  var fftCache = {}; // size -> { cos, sin, rev, re, im, re2, im2 }

  function getFft(n) {
    var c = fftCache[n];
    if (c) return c;
    var bits = 0;
    while ((1 << bits) < n) bits++;
    var rev = new Uint32Array(n);
    for (var i = 0; i < n; i++) {
      var r = 0, v = i;
      for (var b = 0; b < bits; b++) { r = (r << 1) | (v & 1); v >>= 1; }
      rev[i] = r;
    }
    var half = n >> 1;
    var cos = new Float64Array(half), sin = new Float64Array(half);
    for (var k = 0; k < half; k++) {
      cos[k] = Math.cos(2 * Math.PI * k / n);
      sin[k] = Math.sin(2 * Math.PI * k / n);
    }
    c = {
      n: n, rev: rev, cos: cos, sin: sin,
      re: new Float64Array(n), im: new Float64Array(n),
      re2: new Float64Array(n), im2: new Float64Array(n)
    };
    fftCache[n] = c;
    return c;
  }

  // inverse=false → e^{-i}, inverse=true → e^{+i} (ölçekleme yok)
  function fft(re, im, c, inverse) {
    var n = c.n, rev = c.rev, i, j, t;
    for (i = 0; i < n; i++) {
      j = rev[i];
      if (j > i) {
        t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    var sgn = inverse ? 1 : -1;
    for (var size = 2; size <= n; size <<= 1) {
      var halfSize = size >> 1, step = n / size;
      for (var start = 0; start < n; start += size) {
        for (var k = 0; k < halfSize; k++) {
          var wr = c.cos[k * step], wi = sgn * c.sin[k * step];
          var a = start + k, b2 = a + halfSize;
          var xr = re[b2] * wr - im[b2] * wi;
          var xi = re[b2] * wi + im[b2] * wr;
          re[b2] = re[a] - xr; im[b2] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
  }

  // ---------- yardımcılar ----------
  // d dizisinde i etrafında parabolik tepe/çukur kayması (−0.5..0.5)
  function parabolicShift(d, i) {
    var a = d[i - 1], b = d[i], c = d[i + 1];
    var den = a - 2 * b + c;
    if (!(den > 0)) return 0;
    var s = 0.5 * (a - c) / den;
    if (s > 0.5) s = 0.5; else if (s < -0.5) s = -0.5;
    return s;
  }

  // j'deki çukurun ondalıklı konumu. Çukur genişliği (d'nin, yerel aralığın
  // %10'u kadar yükseldiği yere kadar) ölçülür; dar çukurda 3 noktalı parabol,
  // geniş çukurda (düşük nota / gürültü) ±w noktaya en küçük kareler parabolü.
  // Temiz sinyalde (noisy=false) 3 nokta zaten çok doğru; LS yalnız gürültüde.
  function refineMin(d, j, L, dref, noisy) {
    if (!noisy) return j + parabolicShift(d, j);
    var dmin = d[j];
    var level = dmin + 0.1 * (dref - dmin);
    var wl = 0, wr = 0;
    while (wl < 64 && j - wl - 1 >= 1 && d[j - wl - 1] < level) wl++;
    while (wr < 64 && j + wr + 1 <= L && d[j + wr + 1] < level) wr++;
    var w = Math.min(wl, wr);
    if (w <= 1) return j + parabolicShift(d, j);
    var c0 = j, u0 = 0;
    for (var pass = 0; pass < 2; pass++) {
      if (c0 - w < 1 || c0 + w > L) return j + parabolicShift(d, j);
      var S2 = 0, S4 = 0, Sy = 0, Suy = 0, Su2y = 0, n = 2 * w + 1;
      for (var u = -w; u <= w; u++) {
        var y = d[c0 + u], u2 = u * u;
        S2 += u2; S4 += u2 * u2; Sy += y; Suy += u * y; Su2y += u2 * y;
      }
      var cc = (n * Su2y - S2 * Sy) / (n * S4 - S2 * S2);
      if (!(cc > 0)) return j + parabolicShift(d, j);
      var bb = Suy / S2;
      u0 = -bb / (2 * cc);
      if (Math.abs(u0) <= 0.75) break;
      if (Math.abs(u0) > w) return j + parabolicShift(d, j);
      c0 += Math.round(u0);
    }
    return c0 + u0;
  }

  // i'deki çukurun parabolik interpolasyonla tahmini dip değeri. Periyot tam
  // sayı olmayınca tam sayı gecikmedeki değer dibi olduğundan yüksek gösterir;
  // oktav kararlarında bu yanlılığı gidermek için kullanılır.
  function dipValue(d, i) {
    var a = d[i - 1], b = d[i], c = d[i + 1];
    var den = a - 2 * b + c;
    if (!(den > 0)) return b;
    var v = b - (a - c) * (a - c) / (8 * den);
    return v > 0 ? v : 0;
  }

  // [lo, hi] aralığında d'nin en küçük olduğu indeks
  function argminRange(arr, lo, hi) {
    var best = lo, bv = arr[lo];
    for (var i = lo + 1; i <= hi; i++) if (arr[i] < bv) { bv = arr[i]; best = i; }
    return best;
  }

  // Bir indeksten başlayarak yerel minimuma in
  function descend(arr, i, lo, hi) {
    while (i + 1 <= hi && arr[i + 1] < arr[i]) i++;
    while (i - 1 >= lo && arr[i - 1] < arr[i]) i--;
    return i;
  }

  // Sıfır fazlı (simetrik) Hann pencereli sinc alçak geçiren FIR. Geniş bantlı
  // gürültüyü ve tezene "tık"ını bastırır; LTI olduğu için periyodu değiştirmez.
  var firCache = {};
  function getFir(fcNorm, taps) {
    var key = taps + ':' + fcNorm.toFixed(5);
    if (firCache[key]) return firCache[key];
    var h = new Float64Array(taps), m = (taps - 1) / 2, sum = 0;
    for (var i = 0; i < taps; i++) {
      var t = i - m;
      var sinc = t === 0 ? 2 * fcNorm : Math.sin(2 * Math.PI * fcNorm * t) / (Math.PI * t);
      var w = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 1) / (taps + 1));
      h[i] = sinc * w; sum += h[i];
    }
    for (i = 0; i < taps; i++) h[i] /= sum;
    firCache[key] = h;
    return h;
  }

  // t (ondalıklı) civarında (±%4, en az ±2) dn'nin yerel minimumu; yoksa -1
  function nearMin(arr, t, lo, hi) {
    if (t < lo || t > hi) return -1;
    var r = Math.max(2, Math.round(t * 0.04));
    var a = Math.max(lo, Math.floor(t - r)), b = Math.min(hi, Math.ceil(t + r));
    if (b - a < 2) return -1;
    var j = argminRange(arr, a, b);
    if (j === a || j === b) {           // kenarda ise gerçek çukura in, uzaklaşırsa iptal
      j = descend(arr, j, lo, hi);
      if (Math.abs(j - t) > r + 1) return -1;
    }
    return j;
  }

  // dn < thr olan ilk bölgenin (tamamındaki) minimumu; yoksa -1. Gürültülü
  // eğride yalnız "aşağı in" yapmak yerel kıvrımlara takılır.
  function firstDip(dn, lo, hi, thr) {
    for (var t = lo; t <= hi; t++) {
      if (dn[t] < thr) {
        var end = t;
        while (end + 1 <= hi && dn[end + 1] < thr) end++;
        var c = argminRange(dn, t, end);
        if (c === end && end < hi) c = descend(dn, c, lo, hi);
        return c;
      }
    }
    return -1;
  }

  // Tekrar kullanılan çalışma dizileri
  var work = { n: 0, x: null, d: null, dn: null, cum: null };

  function ensureWork(n, L) {
    if (work.n !== n || !work.d || work.d.length < L + 2) {
      work.n = n;
      work.x = new Float64Array(n);
      work.d = new Float64Array(L + 2);
      work.dn = new Float64Array(L + 2);
      work.cum = new Float64Array(n + 1);
    }
    return work;
  }

  /**
   * @param {Float32Array|Float64Array|number[]} buffer
   * @param {number} sampleRate
   * @param {object} [opts]
   */
  function detect(buffer, sampleRate, opts) {
    var o = opts || {};
    var minHz = o.minHz > 0 ? o.minHz : DEFAULTS.minHz;
    var maxHz = o.maxHz > 0 ? o.maxHz : DEFAULTS.maxHz;
    var threshold = o.threshold > 0 ? o.threshold : DEFAULTS.threshold;
    var minRms = typeof o.minRms === 'number' ? o.minRms : DEFAULTS.minRms;
    var N = buffer ? buffer.length : 0;
    if (!N || !(sampleRate > 0)) return null;

    // --- DC + RMS ---
    var mean = 0, i;
    for (i = 0; i < N; i++) mean += buffer[i];
    mean /= N;
    var ss = 0;
    for (i = 0; i < N; i++) { var v0 = buffer[i] - mean; ss += v0 * v0; }
    var rms = Math.sqrt(ss / N);
    if (!(rms >= minRms) || rms === 0) return null;

    // --- gecikme sınırları ---
    var minLag = Math.max(2, Math.floor(sampleRate / maxHz));
    var maxLag = Math.ceil(sampleRate / minHz) + 1;
    // L: hesaplanan en büyük gecikme (katlarla hassaslaştırma için N/2'ye kadar)
    var L = Math.max(maxLag, N >> 1);
    var W = N - L;
    if (W < maxLag) {           // pencere çok kısa: en düşük frekansı yükselt
      L = N >> 1; W = N - L;
      maxLag = Math.min(maxLag, L - 1);
    }
    if (maxLag <= minLag + 2) return null;

    var wk = ensureWork(N, L);
    var x = wk.x, d = wk.d, dn = wk.dn, cum = wk.cum;
    // Alçak geçiren FIR ('valid' kısım → N kısalır). Kesim: ~3.2·maxHz, en çok 0.42·sr.
    var fc = Math.min(0.42 * sampleRate, Math.max(2500, 3.2 * maxHz));
    var taps = 31;
    if (o.lowpass !== false && fc < 0.42 * sampleRate && N > 8 * taps) {
      var h = getFir(fc / sampleRate, taps);
      var Nf = N - taps + 1;
      for (i = 0; i < Nf; i++) {
        var acc = 0;
        for (var q = 0; q < taps; q++) acc += h[q] * buffer[i + q];
        x[i] = acc - mean;
      }
      N = Nf;
      L = Math.max(maxLag, N >> 1); W = N - L;
      if (W < maxLag) { L = N >> 1; W = N - L; maxLag = Math.min(maxLag, L - 1); }
      if (maxLag <= minLag + 2) return null;
    } else {
      for (i = 0; i < N; i++) x[i] = buffer[i] - mean;
    }

    // --- çapraz korelasyon c(τ) = Σ_{j<W} x_j x_{j+τ}, FFT ile ---
    var size = 1;
    while (size < N) size <<= 1;
    var F = getFft(size);
    var ar = F.re, ai = F.im, xr = F.re2, xi = F.im2;
    for (i = 0; i < size; i++) {
      ar[i] = i < W ? x[i] : 0; ai[i] = 0;
      xr[i] = i < N ? x[i] : 0; xi[i] = 0;
    }
    fft(ar, ai, F, false);
    fft(xr, xi, F, false);
    for (i = 0; i < size; i++) {         // conj(A)·X
      var pr = ar[i] * xr[i] + ai[i] * xi[i];
      var pi = ar[i] * xi[i] - ai[i] * xr[i];
      ar[i] = pr; ai[i] = pi;
    }
    fft(ar, ai, F, true);                 // ar[τ]·size = c(τ)

    // --- fark fonksiyonu ---
    cum[0] = 0;
    for (i = 0; i < N; i++) cum[i + 1] = cum[i] + x[i] * x[i];
    var e1 = cum[W];
    var inv = 1 / size;
    d[0] = 0;
    for (var tau = 1; tau <= L; tau++) {
      var e2 = cum[tau + W] - cum[tau];
      var val = e1 + e2 - 2 * ar[tau] * inv;
      d[tau] = val > 0 ? val : 0;
    }

    // --- CMNDF ---
    dn[0] = 1;
    var run = 0;
    for (tau = 1; tau <= L; tau++) {
      run += d[tau];
      dn[tau] = run > 0 ? d[tau] * tau / run : 1;
    }

    // --- aday seçimi (mutlak eşik) ---
    var lo = minLag, hi = Math.min(maxLag, L - 1);
    var cand = firstDip(dn, lo, hi, threshold);
    var relaxed = false;

    if (cand < 0) {
      // Eşik altı çukur yok (gürültü / sönüm): eşiği global minimuma göre
      // gevşet ve yine İLK çukuru al → periyodun katlarına (oktav-pes,
      // yarım/üçte bir frekans) kaymayı önler.
      var g = argminRange(dn, lo, hi);
      cand = firstDip(dn, lo, hi, dipValue(dn, g) * 1.5 + 0.05);
      if (cand < 0) cand = g;
      relaxed = true;
    }
    {
      // Oktav-tiz koruması (çift/dört kat frekans): bir harmonik baskınsa τ
      // periyodun 1/m'i olabilir. Gerçek periyot m·τ'da çukur τ'dakinden çok
      // daha derin olur; τ gerçek periyotsa katlarında ≈ aynı (ya da sönüm ve
      // gürültüden biraz kötü) kalır. En küçük uygun m seçilir.
      var dc = dipValue(dn, cand), up = -1;
      if (dc > 0.01) {
        for (var m = 2; m <= 5 && up < 0; m++) {
          var jm2 = nearMin(dn, cand * m, lo, hi);
          if (jm2 > 0 && dipValue(dn, jm2) < dc * 0.35) up = jm2;
        }
      }
      if (up > 0) {
        cand = up;
      } else if (!relaxed) {
        // Oktav-pes koruması: τ/2'de neredeyse aynı derinlikte çukur varsa
        // kısa periyot doğrudur (vuruş anı, bam teli, gürültü). Tek harmonikleri
        // zayıf sinyalde τ/2 çok daha sığ olduğundan oran şartı onu ayırır.
        while (true) {
          var jh = nearMin(dn, cand / 2, lo, hi);
          if (jh <= 0) break;
          var vh = dipValue(dn, jh);
          if (vh < Math.max(0.2, threshold * 1.6) && vh < dipValue(dn, cand) * 3 + 0.02) cand = jh;
          else break;
        }
      }
    }

    if (cand < 2 || cand >= L) return null;
    var clarity = 1 - dipValue(dn, cand);
    if (clarity < 0) clarity = 0; else if (clarity > 1) clarity = 1;

    // --- hassaslaştırma: parabolik + periyot katları ---
    var dref = run / L;                    // d'nin ortalaması (çukur genişliği referansı)
    var noisy = dipValue(dn, cand) > 0.005;
    var period = refineMin(d, cand, L - 1, dref, noisy);
    var baseDepth = dn[cand];
    var mult = 1;
    while (true) {
      var nextMult = mult * 2;
      var target = period * nextMult;
      if (target + 2 > L - 1) break;
      var ti = Math.round(target);
      var jm = argminRange(d, Math.max(2, ti - 2), Math.min(L - 1, ti + 2));
      if (jm <= 1 || jm >= L - 1) break;
      if (d[jm] > d[jm - 1] || d[jm] > d[jm + 1]) break;     // kenar: gerçek çukur değil
      // çukur yeterince derin değilse (sönüm, gürültü, beat) dur
      if (dn[jm] > Math.max(baseDepth * 3, 0.15)) break;
      var p2 = refineMin(d, jm, L - 1, dref, noisy) / nextMult;
      // tutarlılık: katta beklenen konumdan 1 örnekten fazla sapmasın
      if (Math.abs(p2 - period) * nextMult > 1.0) break;
      period = p2;
      mult = nextMult;
    }

    var hz = sampleRate / period;
    if (hz < minHz * 0.97 || hz > maxHz * 1.03) return null;
    return { hz: hz, clarity: clarity, rms: rms, period: period };
  }

  B.PitchDetector = {
    detect: detect,
    DEFAULTS: DEFAULTS
  };
})(window.Baglama = window.Baglama || {});
