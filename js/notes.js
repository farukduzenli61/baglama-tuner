/*
 * notes.js — Baglama.Notes (Ajan B)
 * Nota adları, frekans <-> MIDI dönüşümü, cent ve koma (53-TET Holder koması) hesabı.
 * Oktav numarası bilimsel gösterimdir: La4 = A4 = MIDI 69 = 440 Hz (varsayılan), Do4 = orta Do = MIDI 60.
 * Klasik script + IIFE; ES module yok.
 */
(function (B) {
  'use strict';

  var NAMES_TR = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
  var NAMES_EN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var KOMA_CENTS = 1200 / 53; // Holder koması ≈ 22.6415 cent
  var A4_MIN = 415, A4_MAX = 466, A4_DEFAULT = 440;

  var a4 = A4_DEFAULT;

  function getA4() { return a4; }

  function setA4(hz) {
    var v = Number(hz);
    if (!isFinite(v) || v <= 0) return;
    a4 = Math.min(A4_MAX, Math.max(A4_MIN, v));
  }

  function freqToMidi(hz) {
    if (!(hz > 0)) return NaN;
    return 69 + 12 * Math.log(hz / a4) / Math.LN2;
  }

  function midiToFreq(midi) {
    return a4 * Math.pow(2, (midi - 69) / 12);
  }

  function pitchClass(midi) {
    return ((Math.round(midi) % 12) + 12) % 12;
  }

  function octaveOf(midi) {
    return Math.floor(Math.round(midi) / 12) - 1;
  }

  /** 'La4' (tr) veya 'A4' (en). midi tam sayıya yuvarlanır. */
  function noteName(midi, system) {
    if (!isFinite(midi)) return '';
    var names = system === 'en' ? NAMES_EN : NAMES_TR;
    return names[pitchClass(midi)] + octaveOf(midi);
  }

  /** Oktavsız ad: 'La' / 'A' */
  function pitchClassName(midi, system) {
    if (!isFinite(midi)) return '';
    return (system === 'en' ? NAMES_EN : NAMES_TR)[pitchClass(midi)];
  }

  function centsBetween(hz, targetHz) {
    if (!(hz > 0) || !(targetHz > 0)) return NaN;
    return 1200 * Math.log(hz / targetHz) / Math.LN2;
  }

  function centsToKoma(cents) { return cents / KOMA_CENTS; }

  function analyze(hz) {
    if (!(hz > 0) || !isFinite(hz)) return null;
    var m = freqToMidi(hz);
    var midi = Math.round(m);
    var cents = (m - midi) * 100; // -50..+50
    return {
      hz: hz,
      midi: midi,
      name: noteName(midi, 'tr'),
      nameEn: noteName(midi, 'en'),
      octave: octaveOf(midi),
      cents: cents,
      koma: cents / KOMA_CENTS,
      targetHz: midiToFreq(midi) // sözleşmeye ek
    };
  }

  /**
   * Sözleşmeye ek: 'La4', 'Fa#3', 'A4', 'C#5', 'Sib3'/'Bb3' gibi adı MIDI'ye çevirir. Çözülemezse NaN.
   */
  function parseNote(str) {
    if (typeof str !== 'string') return NaN;
    var s = str.trim();
    var m = /^([A-Za-zçÇşŞğĞüÜöÖıİ]+?)(#|b|♯|♭)?(-?\d+)$/.exec(s);
    if (!m) return NaN;
    var base = m[1], acc = m[2] || '', oct = parseInt(m[3], 10);
    // Türkçe "Sib" (Si bemol) gibi yazımlar
    if (!acc && /^(Do|Re|Mi|Fa|Sol|La|Si)b$/i.test(base)) { acc = 'b'; base = base.slice(0, -1); }
    var lower = base.toLowerCase();
    var trIdx = { 'do': 0, 're': 2, 'mi': 4, 'fa': 5, 'sol': 7, 'la': 9, 'si': 11 };
    var enIdx = { 'c': 0, 'd': 2, 'e': 4, 'f': 5, 'g': 7, 'a': 9, 'b': 11 };
    var pc = trIdx.hasOwnProperty(lower) ? trIdx[lower] : (enIdx.hasOwnProperty(lower) ? enIdx[lower] : -1);
    if (pc < 0) return NaN;
    if (acc === '#' || acc === '♯') pc += 1;
    if (acc === 'b' || acc === '♭') pc -= 1;
    return (oct + 1) * 12 + pc;
  }

  B.Notes = {
    NAMES_TR: NAMES_TR,
    NAMES_EN: NAMES_EN,
    KOMA_CENTS: KOMA_CENTS,
    A4_MIN: A4_MIN,
    A4_MAX: A4_MAX,
    getA4: getA4,
    setA4: setA4,
    freqToMidi: freqToMidi,
    midiToFreq: midiToFreq,
    noteName: noteName,
    pitchClassName: pitchClassName,
    analyze: analyze,
    centsBetween: centsBetween,
    centsToKoma: centsToKoma,
    parseNote: parseNote
  };
})(window.Baglama = window.Baglama || {});
