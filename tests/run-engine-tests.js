#!/usr/bin/env node
/*
 * AudioEngine testleri: sahte Web Audio / getUserMedia / rAF / sanal saat ile Node'da.
 * Kullanım:  node tests/run-engine-tests.js [--verbose]
 * Ajan A.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var root = path.join(__dirname, '..');
var verbose = process.argv.indexOf('--verbose') >= 0;

var failures = 0, checks = 0;
function check(cond, msg) {
  checks++;
  if (!cond) failures++;
  console.log((cond ? '  OK   ' : '  FAIL ') + msg);
}

// ---------- ortam ----------
function makeEnv(o) {
  o = o || {};
  var SR = o.sampleRate || 48000;
  var clock = { t: 0 };           // ms
  var signal = o.signal || new Float32Array(SR);
  var rafQueue = [];
  var docListeners = {};
  var suspendCalls = 0, resumeCalls = 0;

  function FakeCtx() {
    this.sampleRate = SR;
    this.state = 'suspended';
    this.destination = { connect: function () {} };
  }
  FakeCtx.prototype.resume = function () { resumeCalls++; this.state = 'running'; return Promise.resolve(); };
  FakeCtx.prototype.suspend = function () { suspendCalls++; this.state = 'suspended'; return Promise.resolve(); };
  FakeCtx.prototype.createMediaStreamSource = function () { return { connect: function () {}, disconnect: function () {} }; };
  FakeCtx.prototype.createGain = function () { return { gain: { value: 1 }, connect: function () {}, disconnect: function () {} }; };
  FakeCtx.prototype.createAnalyser = function () {
    return {
      fftSize: 2048, smoothingTimeConstant: 0.8,
      connect: function () {}, disconnect: function () {},
      getFloatTimeDomainData: function (arr) {
        var end = Math.floor(clock.t / 1000 * SR);
        for (var i = 0; i < arr.length; i++) {
          var idx = end - arr.length + i;
          arr[i] = idx >= 0 && idx < signal.length ? signal[idx] : 0;
        }
      }
    };
  };

  var trackStopped = 0;
  var sb = {
    console: console, Math: Math, Promise: Promise, setTimeout: setTimeout, clearTimeout: clearTimeout,
    performance: { now: function () { return clock.t; } },
    isSecureContext: o.secure !== false,
    location: { protocol: 'https:', hostname: 'example' },
    AudioContext: FakeCtx,
    requestAnimationFrame: function (cb) { rafQueue.push(cb); return rafQueue.length; },
    cancelAnimationFrame: function () { rafQueue.length = 0; },
    document: {
      hidden: false,
      addEventListener: function (e, h) { (docListeners[e] = docListeners[e] || []).push(h); },
      removeEventListener: function () {}
    },
    navigator: {
      mediaDevices: o.noMedia ? undefined : {
        getUserMedia: function (c) {
          sb._constraints = c;
          if (o.gumError) { var e = new Error('x'); e.name = o.gumError; return Promise.reject(e); }
          var track = { stop: function () { trackStopped++; }, addEventListener: function () {} };
          return Promise.resolve({ getAudioTracks: function () { return [track]; }, getTracks: function () { return [track]; } });
        }
      }
    }
  };
  sb.window = sb;
  vm.createContext(sb);
  ['js/pitch-detector.js', 'js/audio-engine.js', 'tests/pitch-test-cases.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sb, { filename: f });
  });
  return {
    sb: sb, B: sb.Baglama, clock: clock, SR: SR,
    setSignal: function (s) { signal = s; },
    // bir kare ilerlet
    frame: function (dtMs) {
      clock.t += dtMs || 1000 / 60;
      var q = rafQueue.splice(0);
      q.forEach(function (cb) { cb(clock.t); });
    },
    pendingFrames: function () { return rafQueue.length; },
    setHidden: function (h) {
      sb.document.hidden = h;
      (docListeners.visibilitychange || []).forEach(function (fn) { fn(); });
    },
    stats: function () { return { suspendCalls: suspendCalls, resumeCalls: resumeCalls, trackStopped: trackStopped }; }
  };
}

function tickMicro() { return new Promise(function (r) { setImmediate(r); }); }

// ---------- sinyal: sessizlik → tel 1 → tel 2 → sessizlik ----------
function buildPerformance(B, SR) {
  var G = B.PitchTests.gen;
  var total = Math.round(SR * 5);
  var s = new Float32Array(total);
  var rnd = 1;
  for (var i = 0; i < total; i++) { rnd = (rnd * 16807) % 2147483647; s[i] = (rnd / 2147483647 - 0.5) * 2e-4; }
  function place(L, t0, t1, amp) {
    var n = Math.round((t1 - t0) * SR);
    var k = G.karplus(L, SR, n, { pluckPos: 0.13, seed: L, rho: 0.998 });
    var off = Math.round(t0 * SR);
    for (var j = 0; j < n && off + j < total; j++) s[off + j] += amp * k.buf[j];
    return k.f0;
  }
  var f1 = place(326, 0.5, 2.0, 0.6);   // ≈147.01 Hz (Re3 civarı)
  var f2 = place(244, 2.0, 3.5, 0.6);   // ≈196.32 Hz (Sol3 civarı)
  return { buf: s, segs: [{ f0: f1, t0: 0.5, t1: 2.0 }, { f0: f2, t0: 2.0, t1: 3.5 }] };
}

async function testTracking() {
  console.log('\n[İzleme] sessizlik → tel 147.01 Hz → tel 196.32 Hz → sessizlik (60 fps)');
  var env = makeEnv();
  var perf = buildPerformance(env.B, env.SR);
  env.setSignal(perf.buf);
  var E = env.B.AudioEngine;
  var log = [];
  E.onPitch(function (p) { log.push({ t: env.clock.t, p: p }); });
  var levels = 0;
  E.onLevel(function () { levels++; });
  var errs = [];
  E.onError(function (e) { errs.push(e); });

  var ok = await E.start();
  check(ok === true && E.isRunning(), 'start() true döndü ve çalışıyor');
  var c = env.sb._constraints.audio;
  check(c.echoCancellation === false && c.noiseSuppression === false && c.autoGainControl === false, 'getUserMedia kısıtları: EC/NS/AGC kapalı');
  check(E.getContext() && E.getContext().state === 'running', 'AudioContext resume edildi');

  while (env.clock.t < 4200) env.frame();

  check(errs.length === 0, 'hata yok');
  check(levels > 200, 'onLevel her karede çağrıldı (' + levels + ')');

  perf.segs.forEach(function (sg, si) {
    var t0 = sg.t0 * 1000, t1 = sg.t1 * 1000;
    var inSeg = log.filter(function (r) { return r.t > t0 && r.t < t1; });
    var first = inSeg.filter(function (r) { return r.p && Math.abs(1200 * Math.log2(r.p.hz / sg.f0)) < 50; })[0];
    var latency = first ? first.t - t0 : Infinity;
    check(latency < 250, 'tel ' + (si + 1) + ': ilk doğru ölçüm vuruştan ' + latency.toFixed(0) + ' ms sonra (< 250 ms)');
    var firstStable = inSeg.filter(function (r) { return r.p && r.p.stable && Math.abs(1200 * Math.log2(r.p.hz / sg.f0)) < 50; })[0];
    // ilk 20 ms (≈1 kare) fiziksel gecikme: pencere hâlâ eski teli görüyor
    var staleStable = inSeg.filter(function (r) { return r.t > t0 + 20 && r.p && r.p.stable && Math.abs(1200 * Math.log2(r.p.hz / sg.f0)) >= 50; }).length;
    check(staleStable === 0, 'tel ' + (si + 1) + ': yeni vuruştan 20 ms sonra eski notada stable=true kare ' + staleStable);
    var stLat = firstStable ? firstStable.t - t0 : Infinity;
    check(stLat < 450, 'tel ' + (si + 1) + ': stable=true vuruştan ' + stLat.toFixed(0) + ' ms sonra (< 450 ms)');
    var settled = inSeg.filter(function (r) { return r.t > t0 + 300; });
    var maxErr = 0, nulls = 0, wrong = 0;
    settled.forEach(function (r) {
      if (!r.p) { nulls++; return; }
      var e = Math.abs(1200 * Math.log2(r.p.hz / sg.f0));
      if (e > 50) wrong++;
      else maxErr = Math.max(maxErr, e);
    });
    check(maxErr <= 1 && wrong === 0, 'tel ' + (si + 1) + ': oturduktan sonra maks hata ' + maxErr.toFixed(3) + ' cent, yanlış nota/oktav karesi ' + wrong);
    check(nulls === 0, 'tel ' + (si + 1) + ': oturduktan sonra null kare ' + nulls);
    // vuruş sonrası (ilk 300 ms) hiçbir karede yanlış nota (eski tel dışında) gösterilmemeli
    var prevF = si > 0 ? perf.segs[si - 1].f0 : null;
    var bad = inSeg.filter(function (r) {
      if (!r.p || r.t > t0 + 300) return false;
      var e = Math.abs(1200 * Math.log2(r.p.hz / sg.f0));
      var ep = prevF ? Math.abs(1200 * Math.log2(r.p.hz / prevF)) : 1e9;
      return e > 50 && ep > 50;
    });
    check(bad.length === 0, 'tel ' + (si + 1) + ': geçiş sırasında hayalet nota karesi ' + bad.length +
      (bad.length ? ' (ör. ' + bad[0].p.hz.toFixed(2) + ' Hz @' + (bad[0].t - t0).toFixed(0) + ' ms)' : ''));
    if (verbose) inSeg.slice(0, 30).forEach(function (r) { console.log('     ' + (r.t - t0).toFixed(0) + ' ms', r.p ? r.p.hz.toFixed(3) + (r.p.stable ? ' S' : '') + (r.p.held ? ' H' : '') : 'null'); });
  });

  var silent = log.filter(function (r) { return r.t > 3500 + 250 && r.t < 4200; });
  check(silent.length > 0 && silent.every(function (r) { return r.p === null; }), 'sessizlikte null (' + silent.length + ' kare)');
  var pre = log.filter(function (r) { return r.t < 500; });
  check(pre.every(function (r) { return r.p === null; }), 'başlangıç sessizliğinde null');

  // görünürlük
  env.setHidden(true);
  check(env.pendingFrames() === 0 && env.stats().suspendCalls >= 1, 'arka planda döngü duraklatıldı ve bağlam askıya alındı');
  env.setHidden(false);
  await tickMicro(); await tickMicro();
  check(env.pendingFrames() === 1 && E.getContext().state === 'running', 'ön plana dönünce bağlam sürdü ve döngü yeniden başladı');

  E.stop();
  check(!E.isRunning() && env.stats().trackStopped >= 1 && E.getContext() !== null, 'stop(): izler durdu, bağlam ReferenceTone için açık kaldı');
}

async function testSmoothingJitter() {
  console.log('\n[Yumuşatma] gürültülü sabit nota (SNR 10 dB): ibre titremesi');
  var results = [];
  for (var si = 0; si < 3; si++) {
    var sm = [0, 0.5, 1][si];
    var env = makeEnv();
    var G = env.B.PitchTests.gen;
    var SR = env.SR, n = SR * 3;
    var f = 220;
    var hs = [];
    for (var k = 1; k <= 8; k++) hs.push({ k: k, a: 1 / k, phase: k });
    var sig = G.addNoise(G.normalize(G.additive(f, SR, n, hs), 0.3), 10, 77);
    env.setSignal(sig);
    var E = env.B.AudioEngine;
    E.setSmoothing(sm);
    var vals = [];
    E.onPitch(function (p) { if (p && env.clock.t > 800) vals.push(1200 * Math.log2(p.hz / f)); });
    await E.start();
    while (env.clock.t < 2900) env.frame();
    var mean = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    var sd = Math.sqrt(vals.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / vals.length);
    var mx = vals.reduce(function (a, b) { return Math.max(a, Math.abs(b)); }, 0);
    results.push(sd);
    check(mx < 3, 'smoothing=' + sm + ': ' + vals.length + ' kare, ortalama ' + mean.toFixed(3) + ' cent, std ' + sd.toFixed(3) + ', maks |hata| ' + mx.toFixed(3) + ' cent');
    E.stop();
  }
  check(results[2] <= results[0], 'yumuşatma arttıkça titreme azalıyor (std ' + results.map(function (x) { return x.toFixed(3); }).join(' → ') + ')');
}

async function testPegTurn() {
  console.log('\n[Burgu] perde 1 s içinde 196 → 220 Hz kayıyor (akort ederken)');
  var env = makeEnv();
  var SR = env.SR, n = SR * 3, sig = new Float32Array(n), ph = 0;
  function fAt(t) { return t < 0.8 ? 196 : t < 1.8 ? 196 * Math.pow(220 / 196, (t - 0.8)) : 220; }
  for (var i = 0; i < n; i++) {
    var t = i / SR, f = fAt(t);
    ph += 2 * Math.PI * f / SR;
    sig[i] = 0.3 * (Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.3 * Math.sin(3 * ph));
  }
  env.setSignal(sig);
  var E = env.B.AudioEngine;
  var lagMax = 0, cnt = 0;
  E.onPitch(function (p) {
    var tt = env.clock.t / 1000;
    if (p && tt > 1.0 && tt < 1.8) {
      // pencere ortası ~43 ms geride: buna göre karşılaştır
      var e = Math.abs(1200 * Math.log2(p.hz / fAt(tt - 0.043)));
      lagMax = Math.max(lagMax, e); cnt++;
    }
  });
  await E.start();
  while (env.clock.t < 2500) env.frame();
  check(cnt > 30 && lagMax < 15, 'kayma sırasında ' + cnt + ' kare, takip gecikmesi kaynaklı maks sapma ' + lagMax.toFixed(2) + ' cent (< 15)');
  E.stop();
}

async function testErrors() {
  console.log('\n[Hatalar]');
  var cases = [
    { o: { gumError: 'NotAllowedError' }, code: 'denied' },
    { o: { gumError: 'NotFoundError' }, code: 'nodevice' },
    { o: { gumError: 'NotReadableError' }, code: 'unknown' },
    { o: { noMedia: true, secure: false }, code: 'insecure' },
    { o: { noMedia: true, secure: true }, code: 'unknown' }
  ];
  for (var i = 0; i < cases.length; i++) {
    var env = makeEnv(cases[i].o);
    var E = env.B.AudioEngine;
    var got = null;
    E.onError(function (e) { got = e; });
    var ok = await E.start();
    check(ok === false && got && got.code === cases[i].code && typeof got.message === 'string' && !E.isRunning(),
      JSON.stringify(cases[i].o) + ' → ' + (got ? got.code + ' ("' + got.message.slice(0, 50) + '…")' : 'hata yok'));
  }
}

(async function () {
  await testTracking();
  await testSmoothingJitter();
  await testPegTurn();
  await testErrors();
  console.log('\nToplam: ' + (checks - failures) + '/' + checks + ' kontrol geçti');
  process.exitCode = failures ? 1 : 0;
})();
