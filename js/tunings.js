/*
 * tunings.js — Baglama.Tunings (Ajan B)
 * Enstrümanlar, düzenler (akort sistemleri) ve tel eşleştirme.
 * Kaynaklar ve doğrulama durumu: docs/DUZENLER.md
 *
 * ADLANDIRMA (bkz. docs/DUZENLER.md §1):
 *   "alt / orta / üst" FİZİKSEL konumdur, ses yüksekliği değil. Saz çalım konumunda tutulduğunda
 *   üst tel = yere en uzak (çalıcının yüzüne yakın) grup, alt tel = yere en yakın grup.
 *   Kaynaklardaki (Emnalar 1998; Kaya 2021; Dursun 2024; Karahan & Doğan 2025) bütün düzen tablolarında
 *   ALT TEL "La" kabul edilir, diğer teller ona göre verilir. Bozuk düzende alt tel en tiz gruptur,
 *   orta tel en pes gruptur (Re, alt telin beşli pesi).
 *
 * MODEL:
 *   Her düzen, alt tele (La = 0) göre yarım ses farkı olarak tutulur: { alt:0, orta:-7, ust:-2 } (Bozuk).
 *   Her enstrümanın altMidi değeri, alt telin GERÇEK sesidir (yazılı "La"nın o sazda tınladığı perde).
 *   Gerçek MIDI = instrument.altMidi + düzen farkı + transpose.
 *   getStrings() sözleşme gereği telleri PESTEN TİZE (midi'ye göre) sıralı döndürür; fiziksel sıra
 *   için her telde `position` (0 = üst, 1 = orta, 2 = alt) alanı ve getStringsPhysical() vardır.
 */
(function (B) {
  'use strict';

  var LABELS = { ust: 'Üst tel', orta: 'Orta tel', alt: 'Alt tel' };
  var POSITION = { ust: 0, orta: 1, alt: 2 };
  var IDS_PHYSICAL = ['ust', 'orta', 'alt'];

  // Gruptaki teller: alt tele göre oktav farkı (0 = gruptaki ana çelik tel, -12 = bir oktav pes bam/sırma).
  // kind: 'celik' | 'bam' | 'ince-bam' | 'kalin-bam' | 'sirma' | 'cim'
  function c(offset, kind) { return { offset: offset, kind: kind, isBam: offset !== 0 }; }

  var INSTRUMENTS = [
    {
      id: 'kisa-sap', label: 'Kısa Sap Bağlama',
      description: 'Kısa saplı (17–19 perde) bağlama. Varsayılan: alt tel Re4 (Bağlama düzeninde alt Re · orta Sol · üst La). Bağlama düzeni için tipik.',
      altMidi: 62, // D4: alt=Re4 -> Bağlama düzeninde orta Sol3, üst La3 (yaygın "alt re, orta sol, üst la" tarifi)
      defaultDuzenId: 'baglama',
      courses: {
        alt: [c(0, 'celik'), c(0, 'celik'), c(-12, 'ince-bam')],
        orta: [c(0, 'celik'), c(0, 'celik')],
        ust: [c(0, 'celik'), c(-12, 'kalin-bam')]
      },
      verified: 'kısmen', // nota adları doğrulandı, oktav ve tel dizilişi doğrulanmadı (bkz. DUZENLER.md §4)
      scaleCm: null
    },
    {
      id: 'uzun-sap', label: 'Uzun Sap Bağlama',
      description: 'Uzun saplı (22–24 perde) bağlama. Varsayılan: alt tel La3 (220 Hz). Bozuk düzen için tipik.',
      altMidi: 57, // A3 = 220 Hz (Wikipedia saz ailesi tablosu: Bağlama 220 Hz A, 88 cm tel boyu)
      defaultDuzenId: 'bozuk',
      courses: {
        alt: [c(0, 'celik'), c(0, 'celik'), c(-12, 'bam')],
        orta: [c(0, 'celik'), c(0, 'celik')],
        ust: [c(0, 'celik'), c(0, 'celik')]
      },
      verified: 'kısmen',
      scaleCm: 88
    },
    {
      id: 'divan', label: 'Divan Sazı',
      description: 'Divan sazı (9 tel, üçerli gruplar, ~102–104 cm). Varsayılan: alt tel Re3 (146 Hz).',
      altMidi: 50, // D3 ≈ 146.8 Hz (Wikipedia saz ailesi tablosu: Divan sazı 146 Hz D, 104 cm)
      defaultDuzenId: 'bozuk',
      courses: {
        alt: [c(0, 'celik'), c(0, 'celik'), c(-12, 'bam')],
        orta: [c(0, 'celik'), c(0, 'celik'), c(0, 'celik')],
        ust: [c(0, 'celik'), c(0, 'celik'), c(0, 'celik')]
      },
      verified: 'kısmen',
      scaleCm: 104
    },
    {
      id: 'cura', label: 'Cura',
      description: 'Cura (bağlama ailesinin en küçüğü). Bağlamanın bir oktav tizi: alt tel La4 (440 Hz). Bazı kaynaklar Re5 verir — transpoze ile +5.',
      altMidi: 69, // A4: "Akordu bağlama düzeninin bir oktav tizidir" (Dursun 2024); Wikipedia tablosu D5 ≈ 586 Hz der
      defaultDuzenId: 'baglama',
      courses: {
        alt: [c(0, 'celik'), c(0, 'celik')],
        orta: [c(0, 'celik'), c(0, 'celik')],
        ust: [c(0, 'celik'), c(0, 'celik')]
      },
      verified: 'kısmen',
      scaleCm: 48
    },
    {
      id: 'tanbura', label: 'Tanbura',
      description: 'Tanbura (bağlamadan bir boy küçük, 3×2 tel, oktavlı). Varsayılan: alt tel Re4 (293 Hz).',
      altMidi: 62, // D4 ≈ 293.7 Hz (Wikipedia saz ailesi tablosu: Tambura 293 Hz D, 80 cm)
      defaultDuzenId: 'bozuk',
      courses: {
        // Dursun 2024: "Her grupta tel oktavlı akort edilir. Alt ve üst tellerin yanına bir sırma, orta telin yanına cim teli takılır."
        alt: [c(0, 'celik'), c(-12, 'sirma')],
        orta: [c(0, 'celik'), c(-12, 'cim')],
        ust: [c(0, 'celik'), c(-12, 'sirma')]
      },
      verified: 'kısmen',
      scaleCm: 80
    },
    {
      id: 'meydan', label: 'Meydan Sazı',
      description: 'Meydan sazı (12 tel, ailenin en büyüğü, ~112 cm). Varsayılan: alt tel La2 (110 Hz).',
      altMidi: 45, // A2 = 110 Hz (Wikipedia saz ailesi tablosu: Meydan sazı 110 Hz A, 112 cm)
      defaultDuzenId: 'bozuk',
      courses: {
        alt: [c(0, 'celik'), c(0, 'celik'), c(0, 'celik'), c(-12, 'bam')],
        orta: [c(0, 'celik'), c(0, 'celik'), c(0, 'celik'), c(0, 'celik')],
        ust: [c(0, 'celik'), c(0, 'celik'), c(0, 'celik'), c(0, 'celik')]
      },
      verified: 'kısmen',
      scaleCm: 112
    }
  ];

  // Düzenler: alt tel = La = 0'a göre yarım ses. karar = alt=La iken karar perdesinin adı (perde sınıfı, yarım ses).
  // verified: nota adları en az iki bağımsız kaynakta (Emnalar 1998 via Dursun 2024, Kaya 2021) aynı mı.
  // octaveSource: 'wikipedia' = oktavlar Wikipedia "Bağlama" tablosundan (A3 · D3 · G3 gibi);
  //               'cikarim'   = kaynakta oktav yok; her grup Bozuk düzendeki perdesine en yakın oktava kondu.
  function dz(id, label, orta, ust, karar, octaveSource, description, aliases) {
    return {
      id: id, label: label,
      offsets: { alt: 0, orta: orta, ust: ust },
      karar: karar, // alt teli La kabul eden yazımda karar perdesi (yarım ses, La=0) — örn. Mi = -5/7
      octaveSource: octaveSource,
      verified: true,
      aliases: aliases || [],
      description: description
    };
  }

  // Not: karar değerleri perde sınıfı olarak (La'ya göre 0..11) tutulur.
  var DUZENLER = [
    dz('baglama', 'Bağlama Düzeni', -7, -5, 7, 'wikipedia',
      'Alt La · Orta Re · Üst Mi, karar Mi. Kısa sapta genelde "alt Re · orta Sol · üst La" diye (bir dörtlü tiz) yazılır.'),
    dz('bozuk', 'Bozuk (Kara) Düzen', -7, -2, 0, 'wikipedia',
      'Alt La · Orta Re · Üst Sol, karar La. En yaygın ana düzen.', ['Kara düzen']),
    dz('misket', 'Misket Düzeni', -7, -3, 9, 'wikipedia',
      'Alt La · Orta Re · Üst Fa#, karar Fa#.'),
    dz('mustezat', 'Müstezat (Fa) Düzeni', -7, -4, 8, 'wikipedia',
      'Alt La · Orta Re · Üst Fa, karar Fa.', ['Fa müstezat', 'Fa düzeni']),
    dz('abdal', 'Abdal Düzeni', 0, -2, 0, 'wikipedia',
      'Alt La · Orta La · Üst Sol, karar La. Neşet Ertaş\'ın aktardığı Çöğür (Saz) düzeni de aynı açık tellerdir.', ['Çöğür düzeni', 'Saz düzeni']),
    dz('kutahya', 'Kütahya Düzeni', -7, -7, 5, 'wikipedia',
      'Alt La · Orta Re · Üst Re, karar Re.'),
    dz('umi', 'Ümmi Düzeni', 0, 5, 0, 'wikipedia',
      'Alt La · Orta La · Üst Re (Re4), karar La.'),
    dz('huseyni', 'Hüseyni Düzeni', 0, -5, 0, 'wikipedia',
      'Alt La · Orta La · Üst Mi, karar La.'),
    dz('acemasiran', 'Acemaşiran Düzeni', 0, -4, 8, 'wikipedia',
      'Alt La · Orta La · Üst Fa, karar Fa.'),
    dz('huzzam', 'Hüzzam Düzeni', 0, -3, 9, 'wikipedia',
      'Alt La · Orta La · Üst Fa#, karar Fa#.'),
    dz('kayseri', 'Kayseri Düzeni', -5, 0, 0, 'wikipedia',
      'Alt La · Orta Mi · Üst La, karar La.', ['Tar düzeni']),
    dz('rast', 'Rast Düzeni', -9, -2, 3, 'cikarim',
      'Alt La · Orta Do · Üst Sol, karar Do. (Orta telin oktavı kaynakta yok; Do3 alındı.)', ['Do müstezat']),
    dz('evic', 'Eviç Düzeni', 2, -2, 2, 'wikipedia',
      'Alt La · Orta Si · Üst Sol, karar Si.'),
    dz('sabahi', 'Sabahi Düzeni', 3, 0, 0, 'wikipedia',
      'Alt La · Orta Do (Do4) · Üst La, karar La.'),
    dz('yeksani', 'Yeksani (Irızva) Düzeni', -7, 0, 0, 'wikipedia',
      'Alt La · Orta Re · Üst La, karar La.', ['Irızva düzeni']),
    dz('zirgule', 'Zirgüle Düzeni', -4, -2, 10, 'wikipedia',
      'Alt La · Orta Fa · Üst Sol, karar Sol.'),
    dz('cargah', 'Çargâh Düzeni', -7, -2, 2, 'wikipedia',
      'Alt La · Orta Re · Üst Sol (Bozuk ile aynı açık teller), karar Si.'),
    dz('segah', 'Segâh Düzeni', -7, 2, 2, 'cikarim',
      'Alt La · Orta Re · Üst Si, karar Si. (Üst telin oktavı kaynakta yok; Si3 alındı.)'),
    dz('sur', 'Şûr Düzeni', -5, 2, 0, 'cikarim',
      'Alt La · Orta Mi · Üst Si, karar La. (Oktavlar kaynakta yok; Mi3 / Si3 alındı.)', ['Kürdi düzeni'])
  ];

  function findIn(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function getInstrument(id) { return findIn(INSTRUMENTS, id) || INSTRUMENTS[0]; }
  function getDuzen(id) {
    if (id && typeof id === 'object') return id;
    return findIn(DUZENLER, id) || null;
  }

  function N() { return B.Notes; }

  function makeTel(id, midi, inst) {
    var notes = N();
    var groups = (inst && inst.courses && inst.courses[id]) || [c(0, 'celik'), c(0, 'celik')];
    var courses = groups.map(function (g) {
      var m = midi + g.offset;
      return {
        midi: m, hz: notes.midiToFreq(m), noteName: notes.noteName(m, 'tr'), noteNameEn: notes.noteName(m, 'en'),
        isBam: g.isBam, kind: g.kind
      };
    });
    return {
      id: id,
      label: LABELS[id],
      position: POSITION[id],
      midi: midi,
      hz: notes.midiToFreq(midi),
      noteName: notes.noteName(midi, 'tr'),
      noteNameEn: notes.noteName(midi, 'en'),
      courses: courses
    };
  }

  function clampTranspose(t) {
    t = Math.round(Number(t) || 0);
    return Math.max(-12, Math.min(12, t));
  }

  /** Tel dizisi, PESTEN TİZE sıralı (eşit perdede fiziksel sıra: üst, orta, alt). */
  function getStrings(instrumentId, duzenId, transposeSemitones) {
    var inst = getInstrument(instrumentId);
    var d = getDuzen(duzenId) || DUZENLER[0];
    var t = clampTranspose(transposeSemitones);
    var list = IDS_PHYSICAL.map(function (id) {
      var base = d.absolute ? d.midis[id] : inst.altMidi + d.offsets[id];
      return makeTel(id, base + t, inst);
    });
    list.sort(function (a, b) { return (a.midi - b.midi) || (a.position - b.position); });
    return list;
  }

  /** Sözleşmeye ek: fiziksel sıra (üst, orta, alt — sazın yukarısından aşağısına). */
  function getStringsPhysical(instrumentId, duzenId, transposeSemitones) {
    return getStrings(instrumentId, duzenId, transposeSemitones).slice().sort(function (a, b) {
      return a.position - b.position;
    });
  }

  var OCTAVE_PENALTY_CENTS = 30; // oktav kaydırılarak bulunan eşleşmeye küçük ceza: aynı oktav tercih edilir

  /**
   * En yakın teli bulur. Frekansı ±1 oktav kaydırarak da dener (bam teli bir oktav pes,
   * dedektörün harmoniğe/alt harmoniğe kayması). Dönen cents, GERÇEK hedefe göredir:
   * hedef = telin o oktavdaki karşılığı (ör. bam teli) — yani her zaman -600..+600 içinde, oktavdan bağımsız.
   * Döner: { string, cents, targetHz, targetMidi, octaveShift (-1|0|1), isBam, course }
   */
  function findClosestString(hz, strings) {
    if (!(hz > 0) || !strings || !strings.length) return null;
    var notes = N();
    var best = null;
    for (var i = 0; i < strings.length; i++) {
      var s = strings[i];
      for (var k = -1; k <= 1; k++) {
        // k: hedefin oktav kaydırması. Hedef = s.hz * 2^k
        var targetHz = s.hz * Math.pow(2, k);
        var cents = notes.centsBetween(hz, targetHz);
        var score = Math.abs(cents) + (k === 0 ? 0 : OCTAVE_PENALTY_CENTS);
        // Gruptaki bam teli tam bu oktavdaysa (ör. k = -1 ve bam -12) ceza yok: o gerçek bir tel.
        var course = null;
        if (s.courses) {
          for (var j = 0; j < s.courses.length; j++) {
            if (Math.abs(s.courses[j].midi - (s.midi + 12 * k)) < 0.01) { course = s.courses[j]; break; }
          }
        }
        if (course && k !== 0) score -= OCTAVE_PENALTY_CENTS;
        if (!best || score < best.score) {
          best = {
            score: score, string: s, cents: cents, targetHz: targetHz,
            targetMidi: s.midi + 12 * k, octaveShift: k,
            isBam: !!(course && course.isBam), course: course
          };
        }
      }
    }
    delete best.score;
    return best;
  }

  /**
   * Kullanıcı düzeni. midiList: 3 MIDI sayısı. Dizi verilirse sazdaki FİZİKSEL sırayla
   * [üst, orta, alt] olarak okunur (sözleşmedeki "pesten tize" ifadesi bam telli üst grubun en pes
   * duyulmasından gelir). Açıkça belirtmek için { alt, orta, ust } nesnesi de verilebilir.
   * Dönen düzen DUZENLER listesine eklenir (aynı id varsa değiştirilir), böylece getStrings(inst, id) çalışır.
   * Mutlak perdedir: enstrümanın altMidi değeri uygulanmaz, transpose uygulanır.
   */
  var customCount = 0;
  function makeCustom(label, midiList, opts) {
    var m;
    if (Array.isArray(midiList)) {
      if (midiList.length !== 3) throw new Error('makeCustom: 3 MIDI değeri gerekli');
      m = { ust: midiList[0], orta: midiList[1], alt: midiList[2] };
    } else if (midiList && typeof midiList === 'object') {
      m = { ust: midiList.ust, orta: midiList.orta, alt: midiList.alt };
    } else {
      throw new Error('makeCustom: geçersiz midiList');
    }
    IDS_PHYSICAL.forEach(function (k) {
      var v = Math.round(Number(m[k]));
      if (!isFinite(v) || v < 24 || v > 108) throw new Error('makeCustom: geçersiz MIDI (' + k + ')');
      m[k] = v;
    });
    var notes = N();
    var id = (opts && opts.id) || ('ozel-' + (++customCount));
    var d = {
      id: id,
      label: label || 'Özel Düzen',
      absolute: true,
      midis: m,
      offsets: { alt: 0, orta: m.orta - m.alt, ust: m.ust - m.alt },
      karar: null,
      custom: true,
      verified: false,
      octaveSource: 'kullanici',
      aliases: [],
      description: 'Kullanıcı düzeni: Alt ' + notes.noteName(m.alt) + ' · Orta ' + notes.noteName(m.orta) +
        ' · Üst ' + notes.noteName(m.ust)
    };
    for (var i = 0; i < DUZENLER.length; i++) {
      if (DUZENLER[i].id === id) { DUZENLER[i] = d; return d; }
    }
    DUZENLER.push(d);
    return d;
  }

  /** Sözleşmeye ek: düzenin karar perdesinin adı (alt tel La kabul edilerek), ör. 'Mi'. */
  function kararName(duzenId, system) {
    var d = getDuzen(duzenId);
    if (!d || d.karar == null) return '';
    return N().pitchClassName(69 + d.karar, system);
  }

  B.Tunings = {
    INSTRUMENTS: INSTRUMENTS,
    DUZENLER: DUZENLER,
    LABELS: LABELS,
    getInstrument: getInstrument,
    getDuzen: getDuzen,
    getStrings: getStrings,
    getStringsPhysical: getStringsPhysical,
    findClosestString: findClosestString,
    makeCustom: makeCustom,
    kararName: kararName,
    TRANSPOSE_MIN: -7,
    TRANSPOSE_MAX: 7
  };
})(window.Baglama = window.Baglama || {});
