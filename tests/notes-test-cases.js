/*
 * notes-test-cases.js — Baglama.Notes / Baglama.Tunings / ReferenceTone._synthPluck testleri (Ajan B)
 * Hem tests/notes-tests.html (tarayıcı) hem tests/run-notes-tests.js (Node + vm) tarafından kullanılır.
 * Kullanım: window.BaglamaNotesTests(B) -> [{ name, pass, detail }]
 */
(function (root) {
  'use strict';

  function runAll(B) {
    var results = [];
    function test(name, fn) {
      try {
        var r = fn();
        results.push({ name: name, pass: r === undefined || r === true, detail: r === undefined || r === true ? '' : String(r) });
      } catch (e) {
        results.push({ name: name, pass: false, detail: (e && e.message) || String(e) });
      }
    }
    function near(a, b, tol, what) {
      if (!(Math.abs(a - b) <= tol)) throw new Error((what || '') + ' beklenen ' + b + ' ±' + tol + ', gelen ' + a);
    }
    function eq(a, b, what) {
      if (a !== b) throw new Error((what || '') + ' beklenen ' + JSON.stringify(b) + ', gelen ' + JSON.stringify(a));
    }
    function ok(cond, what) { if (!cond) throw new Error(what || 'koşul sağlanmadı'); }

    var Nt = B.Notes, T = B.Tunings;

    // ---------------- Notes ----------------
    test('A4 varsayılan 440', function () { eq(Nt.getA4(), 440); });
    test('midiToFreq / freqToMidi', function () {
      near(Nt.midiToFreq(69), 440, 1e-9, 'La4');
      near(Nt.midiToFreq(57), 220, 1e-9, 'La3');
      near(Nt.midiToFreq(60), 261.6255653, 1e-6, 'Do4');
      near(Nt.freqToMidi(440), 69, 1e-12);
      near(Nt.freqToMidi(146.832384), 50, 1e-6, 'Re3');
      ok(isNaN(Nt.freqToMidi(0)), '0 Hz NaN olmalı');
    });
    test('noteName tr/en', function () {
      eq(Nt.noteName(69), 'La4'); eq(Nt.noteName(69, 'en'), 'A4');
      eq(Nt.noteName(60), 'Do4'); eq(Nt.noteName(61), 'Do#4'); eq(Nt.noteName(66, 'en'), 'F#4');
      eq(Nt.noteName(59), 'Si3'); eq(Nt.noteName(50), 'Re3'); eq(Nt.noteName(43), 'Sol2');
      eq(Nt.noteName(21), 'La0'); eq(Nt.noteName(12), 'Do0'); eq(Nt.noteName(11), 'Si-1');
    });
    test('KOMA_CENTS = 1200/53', function () { near(Nt.KOMA_CENTS, 22.6415094, 1e-6); });
    test('centsBetween', function () {
      near(Nt.centsBetween(880, 440), 1200, 1e-9);
      near(Nt.centsBetween(440, 880), -1200, 1e-9);
      near(Nt.centsBetween(440 * Math.pow(2, 1 / 1200), 440), 1, 1e-9);
    });
    test('analyze 445 Hz', function () {
      var a = Nt.analyze(445);
      eq(a.midi, 69); eq(a.name, 'La4'); eq(a.nameEn, 'A4'); eq(a.octave, 4);
      near(a.cents, 1200 * Math.log2(445 / 440), 1e-9, 'cent');
      near(a.koma, a.cents / (1200 / 53), 1e-12, 'koma');
      near(a.koma, 0.8640, 1e-3, 'koma');
    });
    test('analyze sınırları (±50 cent)', function () {
      for (var m = 40; m < 90; m += 0.37) {
        var a = Nt.analyze(Nt.midiToFreq(m));
        ok(a.cents >= -50 - 1e-9 && a.cents <= 50 + 1e-9, 'cent aralık dışı: ' + a.cents);
        near(a.midi + a.cents / 100, m, 1e-9, 'yeniden kurulum');
      }
      eq(Nt.analyze(0), null); eq(Nt.analyze(-5), null); eq(Nt.analyze(NaN), null);
    });
    test('analyze: 1 koma tiz Re3', function () {
      var hz = Nt.midiToFreq(50) * Math.pow(2, (1200 / 53) / 1200);
      var a = Nt.analyze(hz);
      eq(a.name, 'Re3'); near(a.koma, 1, 1e-9);
    });
    test('setA4 sınırlama ve etkisi', function () {
      Nt.setA4(500); eq(Nt.getA4(), 466);
      Nt.setA4(300); eq(Nt.getA4(), 415);
      Nt.setA4('abc'); eq(Nt.getA4(), 415, 'geçersiz değer yoksayılmalı');
      Nt.setA4(442); near(Nt.midiToFreq(69), 442, 1e-9); near(Nt.freqToMidi(442), 69, 1e-12);
      var a = Nt.analyze(442); near(a.cents, 0, 1e-9);
      Nt.setA4(440); eq(Nt.getA4(), 440);
    });
    test('parseNote', function () {
      eq(Nt.parseNote('La4'), 69); eq(Nt.parseNote('Fa#3'), 54); eq(Nt.parseNote('Sib3'), 58);
      eq(Nt.parseNote('C#5'), 73); eq(Nt.parseNote('Bb2'), 46); eq(Nt.parseNote('Sol2'), 43);
      ok(isNaN(Nt.parseNote('Xx4')));
    });

    // ---------------- Tunings ----------------
    test('INSTRUMENTS: kısa sap, uzun sap, divan, cura var', function () {
      var ids = T.INSTRUMENTS.map(function (i) { return i.id; });
      ['kisa-sap', 'uzun-sap', 'divan', 'cura'].forEach(function (id) { ok(ids.indexOf(id) >= 0, id + ' yok'); });
      T.INSTRUMENTS.forEach(function (i) { ok(i.label && typeof i.altMidi === 'number', i.id + ' eksik'); });
    });
    test('DUZENLER: en az 6, id tekil, label/description var', function () {
      ok(T.DUZENLER.length >= 6, 'düzen sayısı ' + T.DUZENLER.length);
      var seen = {};
      T.DUZENLER.forEach(function (d) {
        ok(!seen[d.id], 'tekrar eden id ' + d.id); seen[d.id] = 1;
        ok(d.label && d.description, d.id + ' label/description');
      });
      ['baglama', 'bozuk', 'misket', 'mustezat', 'abdal'].forEach(function (id) { ok(seen[id], id + ' yok'); });
    });
    test('Uzun sap Bozuk: Orta Re3, Üst Sol3, Alt La3 (pesten tize)', function () {
      var s = T.getStrings('uzun-sap', 'bozuk', 0);
      eq(s.length, 3);
      eq(s.map(function (x) { return x.id; }).join(','), 'orta,ust,alt');
      eq(s.map(function (x) { return x.noteName; }).join(','), 'Re3,Sol3,La3');
      near(s[2].hz, 220, 1e-9);
      eq(s[1].label, 'Üst tel');
    });
    test('Kısa sap Bağlama düzeni: alt Re4 · orta Sol3 · üst La3', function () {
      var s = T.getStringsPhysical('kisa-sap', 'baglama', 0);
      eq(s.map(function (x) { return x.id + ':' + x.noteName; }).join(','), 'ust:La3,orta:Sol3,alt:Re4');
      var bam = s[0].courses.filter(function (c) { return c.isBam; });
      eq(bam.length, 1); eq(bam[0].noteName, 'La2');
    });
    test('Düzen nota adları (alt=La normalizasyonu, uzun sap)', function () {
      var exp = {
        baglama: 'La,Re,Mi', bozuk: 'La,Re,Sol', misket: 'La,Re,Fa#', mustezat: 'La,Re,Fa', abdal: 'La,La,Sol',
        kutahya: 'La,Re,Re', umi: 'La,La,Re', huseyni: 'La,La,Mi', acemasiran: 'La,La,Fa', huzzam: 'La,La,Fa#',
        kayseri: 'La,Mi,La', rast: 'La,Do,Sol', evic: 'La,Si,Sol', sabahi: 'La,Do,La', yeksani: 'La,Re,La',
        zirgule: 'La,Fa,Sol', cargah: 'La,Re,Sol', segah: 'La,Re,Si', sur: 'La,Mi,Si'
      };
      Object.keys(exp).forEach(function (id) {
        var s = T.getStringsPhysical('uzun-sap', id, 0);
        var got = [s[2], s[1], s[0]].map(function (x) { return Nt.pitchClassName(x.midi); }).join(',');
        eq(got, exp[id], id + ' (alt,orta,üst)');
      });
    });
    test('Karar adları', function () {
      eq(T.kararName('baglama'), 'Mi'); eq(T.kararName('bozuk'), 'La'); eq(T.kararName('misket'), 'Fa#');
      eq(T.kararName('mustezat'), 'Fa'); eq(T.kararName('rast'), 'Do'); eq(T.kararName('cargah'), 'Si');
      eq(T.kararName('zirgule'), 'Sol'); eq(T.kararName('kutahya'), 'Re');
    });
    test('Tüm enstrüman × düzen: pesten tize sıralı, 3 tel, courses tutarlı', function () {
      T.INSTRUMENTS.forEach(function (inst) {
        T.DUZENLER.forEach(function (d) {
          var s = T.getStrings(inst.id, d.id, 0);
          eq(s.length, 3, inst.id + '/' + d.id);
          for (var i = 1; i < 3; i++) ok(s[i].midi >= s[i - 1].midi, inst.id + '/' + d.id + ' sırasız');
          s.forEach(function (tel) {
            ok(tel.courses.length >= 1, 'courses boş');
            near(tel.hz, Nt.midiToFreq(tel.midi), 1e-9);
            tel.courses.forEach(function (c) {
              ok(c.isBam ? c.midi === tel.midi - 12 : c.midi === tel.midi, 'course midi ' + inst.id + '/' + d.id);
            });
            ok(tel.hz > 50 && tel.hz < 1200, 'makul olmayan perde ' + tel.hz + ' ' + inst.id + '/' + d.id);
          });
        });
      });
    });
    test('Transpoze kaydırır', function () {
      var a = T.getStrings('uzun-sap', 'bozuk', 0), b = T.getStrings('uzun-sap', 'bozuk', 3);
      for (var i = 0; i < 3; i++) eq(b[i].midi - a[i].midi, 3);
      var c = T.getStrings('uzun-sap', 'bozuk', -7);
      eq(c[0].noteName, 'Sol2');
    });
    test('findClosestString: tam isabet', function () {
      var s = T.getStrings('uzun-sap', 'bozuk', 0);
      var r = T.findClosestString(220, s);
      eq(r.string.id, 'alt'); near(r.cents, 0, 1e-9); eq(r.octaveShift, 0); eq(r.isBam, false);
      r = T.findClosestString(146.8324, s); eq(r.string.id, 'orta'); near(r.cents, 0, 0.01);
      r = T.findClosestString(196.0, s); eq(r.string.id, 'ust'); near(r.cents, 0, 0.1);
    });
    test('findClosestString: sapma doğru cent', function () {
      var s = T.getStrings('uzun-sap', 'bozuk', 0);
      var r = T.findClosestString(221, s);
      eq(r.string.id, 'alt'); near(r.cents, 1200 * Math.log2(221 / 220), 1e-9);
      r = T.findClosestString(190, s); eq(r.string.id, 'ust'); near(r.cents, Nt.centsBetween(190, 196), 0.05);
    });
    test('findClosestString: bam teli (bir oktav pes) -> isBam, gerçek hedef', function () {
      var s = T.getStrings('uzun-sap', 'bozuk', 0);
      var r = T.findClosestString(111, s);
      eq(r.string.id, 'alt'); eq(r.octaveShift, -1); eq(r.isBam, true);
      near(r.targetHz, 110, 1e-9); near(r.cents, 1200 * Math.log2(111 / 110), 1e-9);
    });
    test('findClosestString: harmonik (oktav tiz) -> aynı tel', function () {
      var s = T.getStrings('uzun-sap', 'bozuk', 0);
      var r = T.findClosestString(442, s);
      eq(r.string.id, 'alt'); eq(r.octaveShift, 1); eq(r.isBam, false);
      near(r.targetHz, 440, 1e-9); near(r.cents, 1200 * Math.log2(442 / 440), 1e-9);
      r = T.findClosestString(392, s); eq(r.string.id, 'ust'); near(r.cents, Nt.centsBetween(392, 392.0), 0.1);
      r = T.findClosestString(73.4, s); eq(r.string.id, 'orta'); eq(r.octaveShift, -1);
    });
    test('findClosestString: aynı oktav tercih edilir', function () {
      // Kısa sap bağlama düzeni: Sol3, La3, Re4. Re4 (293.66) tam isabet olmalı, Re3 kaydırması değil.
      var s = T.getStrings('kisa-sap', 'baglama', 0);
      var r = T.findClosestString(293.66, s); eq(r.string.id, 'alt'); eq(r.octaveShift, 0);
      r = T.findClosestString(196, s); eq(r.string.id, 'orta'); eq(r.octaveShift, 0);
    });
    test('findClosestString: rastgele frekanslarda tutarlılık', function () {
      var s = T.getStrings('divan', 'misket', 2);
      // Teller ±1 oktav aralığında: aday perdeler arası boşluk ≤ 12 yarım ses -> |cent| ≤ 600 + oktav cezası
      for (var hz = s[0].hz / 2; hz <= s[2].hz * 2; hz *= 1.007) {
        var r = T.findClosestString(hz, s);
        ok(r && r.string, 'sonuç yok');
        near(r.cents, Nt.centsBetween(hz, r.targetHz), 1e-9, 'cent hedefe göre');
        ok(Math.abs(r.cents) <= 630, 'cent çok büyük ' + r.cents + ' @' + hz);
      }
      ok(T.findClosestString(1400, s).string, 'aralık dışı frekans da sonuç vermeli');
      eq(T.findClosestString(0, s), null); eq(T.findClosestString(220, []), null);
    });
    test('makeCustom: dizi [üst, orta, alt] ve nesne biçimi', function () {
      var n0 = T.DUZENLER.length;
      var d = T.makeCustom('Benim Düzenim', [55, 50, 57]);
      eq(T.DUZENLER.length, n0 + 1); ok(d.custom && d.id);
      var s = T.getStrings('uzun-sap', d.id, 0);
      eq(s.map(function (x) { return x.id + ':' + x.noteName; }).join(','), 'orta:Re3,ust:Sol3,alt:La3');
      var s2 = T.getStrings('kisa-sap', d, 2); // nesne de kabul edilir, transpoze uygulanır
      eq(s2[0].noteName, 'Mi3');
      var d2 = T.makeCustom('Nesne', { alt: 69, orta: 62, ust: 64 }, { id: d.id });
      eq(T.DUZENLER.length, n0 + 1, 'aynı id değiştirilmeli');
      eq(T.getStringsPhysical('uzun-sap', d2.id)[2].noteName, 'La4');
      var threw = false; try { T.makeCustom('x', [1, 2]); } catch (e) { threw = true; }
      ok(threw, 'hatalı giriş hata vermeli');
      T.DUZENLER.splice(T.DUZENLER.indexOf(d2), 1);
    });
    test('A4 değişince tel frekansları değişir', function () {
      Nt.setA4(432);
      var s = T.getStrings('uzun-sap', 'bozuk', 0);
      near(s[2].hz, 216, 1e-9);
      Nt.setA4(440);
    });

    // ---------------- ReferenceTone (saf sentez) ----------------
    if (B.ReferenceTone && B.ReferenceTone._synthPluck) {
      var estimate = function (x, sr, hz) {
        // Otokorelasyon + parabolik interpolasyon, beklenen periyot çevresinde
        var P = sr / hz, start = Math.round(0.1 * sr), L = Math.round(0.4 * sr);
        var lo = Math.floor(P * 0.85), hi = Math.ceil(P * 1.15), best = -1e9, bl = lo, ac = {};
        for (var lag = lo - 1; lag <= hi + 1; lag++) {
          var sum = 0;
          for (var n = start; n < start + L; n++) sum += x[n] * x[n + lag];
          ac[lag] = sum;
          if (lag >= lo && lag <= hi && sum > best) { best = sum; bl = lag; }
        }
        var a = ac[bl - 1], b = ac[bl], c = ac[bl + 1];
        var shift = 0.5 * (a - c) / (a - 2 * b + c);
        return sr / (bl + shift);
      };
      [44100, 48000].forEach(function (sr) {
        test('Karplus-Strong perde doğruluğu @' + sr, function () {
          var worst = 0;
          [73.42, 110, 146.83, 196, 220, 293.66, 440, 587.33].forEach(function (hz) {
            var x = B.ReferenceTone._synthPluck(hz, sr, 1.0);
            var f = estimate(x, sr, hz);
            var err = Math.abs(1200 * Math.log2(f / hz));
            if (err > worst) worst = err;
            ok(err < 1.0, hz + ' Hz hata ' + err.toFixed(3) + ' cent');
          });
          return true;
        });
      });
      test('Karplus-Strong: tıkırtısız başlangıç/bitiş, tepe ≤ 0.6', function () {
        var x = B.ReferenceTone._synthPluck(220, 48000, 2.5);
        eq(x.length, 120000);
        ok(Math.abs(x[0]) < 1e-6, 'ilk örnek 0 değil');
        var peak = 0; for (var i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
        ok(peak <= 0.6 + 1e-6 && peak > 0.3, 'tepe ' + peak);
        ok(Math.abs(x[x.length - 1]) < 1e-6, 'son örnek 0 değil');
        var tail = 0; for (i = x.length - 480; i < x.length; i++) tail = Math.max(tail, Math.abs(x[i]));
        ok(tail < 0.01, 'son 10 ms yüksek: ' + tail);
      });
    }
    return results;
  }

  root.BaglamaNotesTests = runAll;
})(typeof window !== 'undefined' ? window : this);
