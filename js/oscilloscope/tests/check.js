// checks the oscilloscope's signals and timebase without a browser:  node js/oscilloscope/tests/check.js
const assert = require('assert');
const OS = require('../signals.js');

const knobs = (o) => (k) => o[k];
const S = {
  power: true, intens: 0.55, focus: 0.5,
  'ch1.vdiv': 4, 'ch1.var': 1, 'ch1.pos': 0, 'ch1.coup': 'DC', 'ch1.gnd': false,
  'ch2.vdiv': 4, 'ch2.var': 1, 'ch2.pos': 0, 'ch2.coup': 'DC', 'ch2.gnd': false, 'ch2.inv': false,
  vmode: 'CH1', chop: false, xy: false, tdiv: 10, tvar: 1, xpos: 0, mag: false,
  'trig.level': 0, 'trig.slope': '+', 'trig.src': 'CH1', 'trig.mode': 'AUTO', holdoff: 0, ct: false, part: 'open',
};
const gen = new OS.Generator(knobs({ wave: 'sine', range: 3, dial: 1, amp: 0.2, offset: 0, sym: 0.5, att: false, sweep: false, rate: 0.5 }));
gen.update(0);

// a 1 kHz, 4 V p-p sine: 2 V at a quarter cycle, and the counter reads 1 kHz
assert(Math.abs(gen.v(100.00025) - 2) < 1e-6, 'sine peak');
assert(Math.abs(gen.freq(100, 1) - 1000) < 1e-6, 'counter');

// run the scope for a while: the trace stays inside ±2 div, and every sweep starts on a rising
// zero crossing, so the picture stands still
const scope = new OS.Scope();
let t = 10;
for (let f = 0; f < 240; f++, t += 1 / 60) scope.frame(S, { ch: [gen, null], ext: null }, t, t + 1 / 60);
assert(scope.n > 1000, 'draws a trace');
let ymin = Infinity, ymax = -Infinity, xmin = Infinity, xmax = -Infinity;
for (let i = 0; i < scope.n; i++) {
  ymin = Math.min(ymin, scope.seg[i * 5 + 1]); ymax = Math.max(ymax, scope.seg[i * 5 + 1]);
  xmin = Math.min(xmin, scope.seg[i * 5]); xmax = Math.max(xmax, scope.seg[i * 5 + 2]);
}
assert(Math.abs(ymax - 2) < 0.02 && Math.abs(ymin + 2) < 0.02, `amplitude ${ymin} ${ymax}`);
assert(xmin < 0.05 && xmax > 9.95, `sweep spans the screen ${xmin} ${xmax}`);
let starts = 0;
for (let i = 0; i < scope.n; i++) {
  if (Math.abs(scope.seg[i * 5]) > 0.003) continue;
  starts++;
  assert(Math.abs(scope.seg[i * 5 + 1]) < 0.01, `sweep starts at the crossing, not ${scope.seg[i * 5 + 1]}`);
}
assert(starts > 0, 'some sweeps start in the last frame');
assert(scope.trigLit, "TRIG'D lamp");

// NORM with the level above the signal: once the sweep under way has finished, nothing at all
const norm = Object.assign({}, S, { 'trig.mode': 'NORM', 'trig.level': 0.9 });
for (let f = 0; f < 3; f++, t += 1 / 60) scope.frame(norm, { ch: [gen, null], ext: null }, t, t + 1 / 60);
assert.strictEqual(scope.n, 0, 'NORM shows nothing untriggered');

// slow sweep: the dot moves in real time, 1 div per 0.1 s at 0.1 s/div
const slow = Object.assign({}, S, { tdiv: 2 });
const s2 = new OS.Scope();
s2.on = true; // already warmed up
t = 20;
for (let f = 0; f < 30; f++, t += 1 / 60) s2.frame(slow, { ch: [gen, null], ext: null }, t, t + 1 / 60);
let span = 0;
for (let i = 0; i < s2.n; i++) span += s2.seg[i * 5 + 2] - s2.seg[i * 5];
assert(Math.abs(span - (1 / 60) / 0.1) < 0.02, `slow dot moves ${span} div a frame`);

// RC low-pass of a ±1 V square wave whose half period equals tau: settles to swing ±tanh(1/2)
const sq = new OS.Generator(knobs({ wave: 'square', range: 3, dial: 1, amp: 0.1, offset: 0, sym: 0.5, att: false, sweep: false, rate: 0.5 }));
sq.update(0);
const lp = OS.makeLowpass(sq, 0.5e-3, 5);
let top = -Infinity;
for (let k = 0; k < 1000; k++) top = Math.max(top, lp(5 + k * 1e-6));
assert(Math.abs(top - Math.tanh(0.5)) < 0.005, `rc square ${top}`);

// component tester: a 500 ohm resistor would be the diagonal; 100 ohms is steeper. a silicon diode
// sits near 0.7 V forward and passes nothing backwards
const at = (part, t) => OS.testPart(OS.PARTS[part], t);
const [v1, i1] = at('r100', 0.005);
assert(Math.abs(v1 / i1 - 100) < 1e-6, 'resistor');
const [vf] = at('si', 0.005), [vr, ir] = at('si', 0.015);
assert(vf > 0.6 && vf < 0.8 && Math.abs(ir) < 1e-6 && vr < -11, `diode ${vf} ${vr} ${ir}`);
const [vz] = at('zener', 0.015);
assert(Math.abs(vz + 5.1) < 0.3, `zener ${vz}`);

// x-y: a 1:1 lissajous of two equal sines draws a circle of radius 2 div
const box = new OS.VectorBox(knobs({ prog: 0, ratio: 0, spin: 0, rate: 0.5, size: 0.5 }));
box.update(0);
const xs = box.output(0), ys = box.output(1);
const xyS = Object.assign({}, S, { xy: true });
const s3 = new OS.Scope();
s3.frame(xyS, { ch: [xs, ys], ext: null }, 1, 1 + 1 / 60);
for (let i = 0; i < s3.n; i += 97) {
  const r = Math.hypot(s3.seg[i * 5] - 5, s3.seg[i * 5 + 1]);
  assert(Math.abs(r - 2) < 0.03, `lissajous radius ${r}`);
}
console.log('oscilloscope checks passed');
