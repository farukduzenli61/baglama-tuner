#!/usr/bin/env node
/*
 * PitchDetector testlerini Node'da çalıştırır (vm + sahte window).
 * Kullanım:  node tests/run-pitch-tests.js [--verbose]
 * Ajan A.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var sandbox = { console: console, Math: Math, performance: require('perf_hooks').performance };
sandbox.window = sandbox;
vm.createContext(sandbox);
['js/pitch-detector.js', 'tests/pitch-test-cases.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
});

var B = sandbox.Baglama;
var verbose = process.argv.indexOf('--verbose') >= 0;
var results = B.PitchTests.runAll(B.PitchDetector);

var groups = {};
results.forEach(function (r) {
  var g = groups[r.group] || (groups[r.group] = { pass: 0, total: 0, maxErr: 0, fails: [], rows: [] });
  g.total++;
  if (r.pass) g.pass++; else g.fails.push(r);
  if (r.errCents != null) g.maxErr = Math.max(g.maxErr, Math.abs(r.errCents));
  g.rows.push(r);
});

function fmt(r) {
  return '  ' + (r.pass ? 'OK  ' : 'FAIL') + ' ' + r.name + ' [sr ' + r.sr + ', N ' + r.n + '] → ' +
    (r.res ? r.res.hz.toFixed(3) + ' Hz, clarity ' + r.res.clarity.toFixed(3) : 'null') +
    (r.errCents != null ? ', hata ' + r.errCents.toFixed(3) + ' cent' : '') +
    (r.note ? ' (' + r.note + ')' : '') + ', ' + r.ms.toFixed(2) + ' ms';
}

var totalPass = 0;
Object.keys(groups).forEach(function (k) {
  var g = groups[k];
  totalPass += g.pass;
  console.log((g.pass === g.total ? '[GEÇTİ] ' : '[KALDI] ') + k + ': ' + g.pass + '/' + g.total +
    (g.maxErr ? ', maks |hata| ' + g.maxErr.toFixed(3) + ' cent' : ''));
  (verbose ? g.rows : g.fails).forEach(function (r) { console.log(fmt(r)); });
});
console.log('\nToplam: ' + totalPass + '/' + results.length + ' geçti');

var sw = B.PitchTests.sweep(B.PitchDetector, 2000, 12345, 3);
console.log('\nRastgele tarama (2000 senaryo, ±3 cent): ' + sw.pass + '/' + sw.total + ' geçti, oktav hatası ' + sw.octaveErrors +
  ', null ' + sw.nulls + ', p95 |hata| ' + sw.p95AbsCents.toFixed(3) + ' cent, maks ' + sw.maxAbsCents.toFixed(1) + ' cent');
console.log('  clarity ≥ 0.8 (AudioEngine kapısı) sonrası: ' + sw.gated.pass + '/' + sw.gated.accepted + ' kabul edilen ölçüm ±3 cent içinde, oktav hatası ' +
  sw.gated.octaveErrors + ', maks |hata| ' + sw.gated.maxAbsCents.toFixed(2) + ' cent; reddedilen ' + (sw.total - sw.nulls - sw.gated.accepted));
sw.fails.slice(0, verbose ? 1000 : 25).forEach(function (f) { console.log('  FAIL ' + f); });
if (sw.pass !== sw.total) process.exitCode = 1;
console.log('');
[[48000, 4096], [48000, 2048], [44100, 4096], [96000, 8192]].forEach(function (p) {
  console.log('Performans sr=' + p[0] + ' N=' + p[1] + ': ' + B.PitchTests.benchmark(B.PitchDetector, p[0], p[1], 300).toFixed(3) + ' ms/kare');
});
if (totalPass !== results.length) process.exitCode = 1;
