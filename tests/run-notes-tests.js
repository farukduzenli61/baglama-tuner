// run-notes-tests.js — Node ile notes/tunings/reference-tone testleri (Ajan B)
// Kullanım: node tests/run-notes-tests.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = { console, Math, Float32Array, JSON, Error, Object, Array, Number, String, isNaN, isFinite };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of ['js/notes.js', 'js/tunings.js', 'js/reference-tone.js', 'tests/notes-test-cases.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
}
const results = sandbox.BaglamaNotesTests(sandbox.Baglama);
let fail = 0;
for (const r of results) {
  if (!r.pass) fail++;
  console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.detail ? '  -> ' + r.detail : ''));
}
console.log(`\n${results.length - fail}/${results.length} test geçti`);
process.exit(fail ? 1 : 0);
