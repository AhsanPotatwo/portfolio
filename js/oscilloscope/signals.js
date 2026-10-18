// oscilloscope playground: every voltage on the bench, and the scope's own timebase, kept free of the
// page so tests/check.js can run them in node. a signal is an object with v(t), the voltage at time t
// in seconds, period (seconds, or 0 when it doesn't repeat exactly) and freq(t, gate), what a
// frequency counter would read. bench.js plugs them into each other and crt.js draws what comes out
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const frac = (x) => x - Math.floor(x);

  // the same t always gives the same noise, so the trigger search and the drawing see one signal
  function hash(i) {
    let h = (i | 0) ^ Math.imul(Math.floor(i / 4294967296) | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    h ^= h >>> 16;
    return (h >>> 0) / 2147483648 - 1;
  }
  function noise(t, rate) {
    const x = t * rate, i = Math.floor(x), f = x - i, a = hash(i);
    return a + (hash(i + 1) - a) * f;
  }

  // the wall socket. the trainer board, the component tester and LINE triggering all share its phase
  const mains = (t) => Math.sin(TAU * 50 * t);
  const fixed = (v, period, hz) => ({ v, period, freq: () => hz });

  // one cycle of a waveform, p from 0 to 1. e is the edge time as a fraction of a cycle, so square
  // waves have real (if quick) edges you can find with x10 at 0.1 us/div
  function shape(wave, p, sym, e) {
    if (wave === 'sine') return Math.sin(TAU * p);
    if (wave === 'triangle') return p < sym ? -1 + 2 * p / sym : 1 - 2 * (p - sym) / (1 - sym);
    e = Math.min(e, 0.5 * Math.min(sym, 1 - sym));
    if (p < e / 2) return 2 * p / e;
    if (p > 1 - e / 2) return 2 * (p - 1) / e;
    if (Math.abs(p - sym) < e / 2) return -2 * (p - sym) / e;
    return p < sym ? 1 : -1;
  }

  // ---------- function generator ----------
  const RANGES = [1, 10, 100, 1e3, 1e4, 1e5, 1e6];
  const RISE = 25e-9;

  // get(key) reads its knobs. phase is kept continuous through knob turns, the way a real oscillator
  // glides rather than jumps, by restarting the count from wherever the old frequency had got to
  function Generator(get) {
    this.get = get;
    this.f = 0; this.phi0 = 0; this.t0 = 0; this.sw = false; this.T = 1; this.period = 0;
  }
  Generator.prototype.update = function (t) {
    const f = RANGES[this.get('range')] * this.get('dial');
    const sw = !!this.get('sweep');
    const T = 0.25 * Math.pow(40, 1 - this.get('rate'));
    if (f !== this.f || sw !== this.sw || T !== this.T) {
      this.phi0 = this.f ? frac(this.cycles(t)) : 0;
      this.t0 = t; this.f = f; this.sw = sw; this.T = T;
    }
    this.period = sw || this.get('wave') === 'noise' ? 0 : 1 / f;
  };
  // cycles done since t0. the sweep glides up a decade, f to 10f, then snaps back
  Generator.prototype.cycles = function (t) {
    const dt = t - this.t0, f = this.f;
    if (!this.sw) return this.phi0 + f * dt;
    const T = this.T, n = Math.floor(dt / T), u = dt - n * T;
    return this.phi0 + n * 5.5 * f * T + f * u + 4.5 * f * u * u / T;
  };
  Generator.prototype.v = function (t) {
    const g = this.get, wave = g('wave');
    let w;
    if (wave === 'noise') w = 0.75 * noise(t, 3e6) + 0.35 * noise(t, 11e6);
    else {
      const fNow = this.sw ? this.f * (1 + 9 * frac((t - this.t0) / this.T)) : this.f;
      w = shape(wave, frac(this.cycles(t)), g('sym'), RISE * fNow);
    }
    // the output stage runs off ±12 V rails, so too much offset clips the top off
    const out = clamp(g('offset') * 5 + w * g('amp') * 10, -11, 11);
    return g('att') ? out * 0.1 : out;
  };
  Generator.prototype.freq = function (t, gate) {
    if (this.get('wave') === 'noise') return 1.2e6 * (1 + 0.4 * hash(Math.floor(t * 3)));
    return (this.cycles(t) - this.cycles(t - gate)) / gate;
  };
  Generator.prototype.ttl = function () {
    const gen = this;
    return {
      v: (t) => (gen.get('wave') === 'noise' ? 0 : frac(gen.cycles(t)) < gen.get('sym') ? 5 : 0),
      get period() { return gen.period; },
      freq: (t, gate) => gen.freq(t, gate),
    };
  };

  // the scope's own square wave for checking probes: 1 kHz from 0 V up to `volts`
  const calibrator = (volts) => fixed((t) => volts * (shape('square', frac(t * 1000), 0.5, 5e-5) + 1) / 2, 1e-3, 1000);

  // ---------- trainer board ----------
  const transformer = (t) => { const x = TAU * 50 * t; return 16.5 * (Math.sin(x) + 0.05 * Math.sin(3 * x)); };
  const bridge = (t) => Math.max(0, Math.abs(transformer(t)) - 1.4);
  // the reservoir capacitor: charged to the peak every half cycle, then sagging through the load
  // until the next hump of the bridge catches it
  const smoothed = (t) => Math.max(14.3 * Math.exp(-frac(t * 100 - 0.5) * 0.01 / 0.047), bridge(t));

  // a 555 astable. the capacitor charges from 3 V to 6 V through Ra + Rb, and drains back through Rb
  const T555C = 1e-3 * Math.LN2, T555D = 0.5e-3 * Math.LN2, P555 = T555C + T555D;
  const in555 = (t) => frac(t / P555) * P555;
  const cap555 = (t) => { const s = in555(t); return s < T555C ? 9 - 6 * Math.exp(-s / 1e-3) : 6 * Math.exp(-(s - T555C) / 0.5e-3); };
  const out555 = (t) => (in555(t) < T555C ? 8.3 : 0.15);

  // a square wave down a cable nobody terminated: every edge overshoots and rings, as a damped
  // second order step
  const ringing = (t) => {
    const p = frac(t * 1000), up = p < 0.5, s = (up ? p : p - 0.5) / 1000;
    const w = TAU * 150e3, tau = 2.8e-6;
    return (up ? 5 : 0) - (up ? 5 : -5) * Math.exp(-s / tau) * (Math.cos(w * s) + Math.sin(w * s) / (w * tau));
  };

  // "Hi!" at 9600 baud, 8N1, every 4 ms: idle high, a low start bit, eight bits low first, a stop bit
  const UART = [];
  for (const ch of 'Hi!') {
    UART.push(0);
    for (let b = 0; b < 8; b++) UART.push((ch.charCodeAt(0) >> b) & 1);
    UART.push(1);
  }
  const serial = (t) => { const bit = Math.floor(frac(t / 4e-3) * 4e-3 * 9600); return bit < UART.length && !UART[bit] ? 0.1 : 4.9; };

  // one line of a colour TV picture: sync, colour burst, then eight colour bars, each a grey level
  // with the colour carried on a 4.43 MHz subcarrier riding on top
  const FSC = 4.43361875e6;
  const BAR_Y = [0.75, 0.66, 0.52, 0.44, 0.31, 0.23, 0.09, 0];
  const BAR_C = [0, 0.34, 0.47, 0.44, 0.44, 0.47, 0.34, 0];
  const BAR_P = [0, 2.9, 4.3, 3.7, 0.6, 1.4, 6.1, 0];
  const video = (t) => {
    const s = frac(t / 64e-6) * 64;
    if (s < 0.2) return 0.3 - 1.5 * s;
    if (s < 4.5) return 0;
    if (s < 4.7) return 1.5 * (s - 4.5);
    if (s > 5.6 && s < 7.85) return 0.3 + 0.15 * Math.sin(TAU * FSC * t);
    if (s < 10.5 || s > 62.4) return 0.3;
    const bar = Math.min(7, Math.floor((s - 10.5) / 6.5));
    return 0.3 + 0.7 * BAR_Y[bar] + 0.7 * BAR_C[bar] * Math.sin(TAU * FSC * t + BAR_P[bar]);
  };

  const am = (t) => 0.8 * (1 + 0.6 * Math.sin(TAU * 1000 * t)) * Math.sin(TAU * 455e3 * t);
  // a motor driver: 20 kHz, with the duty cycle wandering over a few seconds as if someone's on the throttle
  const pwm = (t) => (frac(t * 20e3) < 0.5 + 0.4 * Math.sin(TAU * t / 5) ? 5 : 0);
  const sensor = (t) => 1.2 * Math.sin(TAU * 100 * t) + 0.35 * noise(t, 1.5e5) + 0.12 * noise(t, 2e6);

  const TRAINER = {
    tp1: fixed(transformer, 0.02, 50),
    tp2: fixed((t) => Math.max(0, transformer(t) - 0.7), 0.02, 50),
    tp3: fixed(bridge, 0.01, 100),
    tp4: fixed(smoothed, 0.01, 100),
    tp5: fixed(cap555, P555, 1 / P555),
    tp6: fixed(out555, P555, 1 / P555),
    tp7: fixed(ringing, 1e-3, 1000),
    tp8: fixed(serial, 4e-3, 250),
    tp9: fixed(video, 64e-6, 15625),
    tp10: fixed(am, 1e-3, 455e3),
    tp11: fixed(pwm, 5e-5, 20e3),
    tp12: fixed(sensor, 0.01, 100),
  };

  // ---------- vector box: pictures drawn by two voltages, for x-y mode ----------
  const RATIOS = [[1, 1], [1, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 5]];
  const VPOINTS = 720;
  // cube corners are numbered by bit (x, y, z); this walk covers all twelve edges, four of them twice
  const CUBE_WALK = [0, 1, 3, 2, 0, 4, 5, 7, 6, 4, 5, 1, 3, 7, 6, 2, 0];

  function VectorBox(get) {
    this.get = get;
    this.pts = new Float32Array(VPOINTS * 2);
    this.rate = 100;
  }
  // rebuilt once a frame: the picture as strokes, then respaced so the beam moves at an even speed.
  // jumps between strokes are counted short, so the beam flicks across them and they stay faint
  VectorBox.prototype.update = function (t, date) {
    const g = this.get, spin = g('spin') * g('spin') * 3;
    this.rate = 40 * Math.pow(10, g('rate') * 1.3);
    const prog = g('prog');
    const strokes = [];
    const curve = (n, f) => { const s = []; for (let i = 0; i <= n; i++) s.push(f(i / n)); strokes.push(s); };
    if (prog === 0) {
      const [a, b] = RATIOS[g('ratio')], ph = TAU * t * spin * 0.3;
      curve(400, (u) => [Math.sin(TAU * a * u), Math.sin(TAU * b * u + ph)]);
    } else if (prog === 1) {
      const ay = t * spin * 0.9, ax = t * spin * 0.55 + 0.5;
      const pt = (i) => {
        let x = i & 1 ? 1 : -1, y = i & 2 ? 1 : -1, z = i & 4 ? 1 : -1;
        [x, z] = [x * Math.cos(ay) + z * Math.sin(ay), -x * Math.sin(ay) + z * Math.cos(ay)];
        [y, z] = [y * Math.cos(ax) - z * Math.sin(ax), y * Math.sin(ax) + z * Math.cos(ax)];
        const k = 2.2 / (z + 4.2);
        return [x * k, y * k];
      };
      strokes.push(CUBE_WALK.map(pt));
    } else if (prog === 2) {
      const beat = 1 + 0.09 * Math.pow(Math.max(0, Math.sin(TAU * t * (0.6 + spin * 0.6))), 8);
      curve(300, (u) => {
        const a = TAU * u;
        return [beat * 16 * Math.pow(Math.sin(a), 3) / 17, beat * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 17 + 0.1];
      });
    } else if (prog === 3) {
      const r0 = t * spin;
      curve(5, (u) => { const a = Math.PI / 2 + r0 + u * 5 * (TAU * 2 / 5); return [Math.cos(a), Math.sin(a)]; });
    } else if (prog === 4) {
      const r0 = t * spin * 0.4;
      curve(600, (u) => {
        const a = u * 3 * TAU, x = 2 * Math.cos(a) + 5 * Math.cos(2 * a / 3), y = 2 * Math.sin(a) - 5 * Math.sin(2 * a / 3);
        return [(x * Math.cos(r0) - y * Math.sin(r0)) / 7, (x * Math.sin(r0) + y * Math.cos(r0)) / 7];
      });
    } else {
      // a clock, with the real time. hands go clockwise from twelve
      const d = date || new Date();
      const sec = d.getSeconds() + d.getMilliseconds() / 1000, min = d.getMinutes() + sec / 60, hr = (d.getHours() % 12) + min / 60;
      curve(90, (u) => [Math.cos(TAU * u), Math.sin(TAU * u)]);
      for (let h = 0; h < 12; h++) {
        const a = TAU * h / 12, r = h % 3 ? 0.88 : 0.78;
        strokes.push([[Math.sin(a), Math.cos(a)], [r * Math.sin(a), r * Math.cos(a)]]);
      }
      const hand = (frac1, len) => { const a = TAU * frac1; strokes.push([[0, 0], [len * Math.sin(a), len * Math.cos(a)]]); };
      hand(hr / 12, 0.45); hand(min / 60, 0.7); hand(sec / 60, 0.85);
    }
    resample(strokes, this.pts);
  };
  VectorBox.prototype.at = function (t, axis) {
    const u = frac(t * this.rate) * VPOINTS, i = Math.floor(u), f = u - i, j = (i + 1) % VPOINTS;
    const a = this.pts[i * 2 + axis];
    return (a + (this.pts[j * 2 + axis] - a) * f) * this.get('size') * 4;
  };
  VectorBox.prototype.output = function (axis) {
    const box = this;
    return { v: (t) => box.at(t, axis), get period() { return 1 / box.rate; }, freq: () => box.rate };
  };

  function resample(strokes, out) {
    const xs = [], ys = [], w = [0];
    for (const s of strokes) {
      s.forEach(([x, y], i) => {
        if (xs.length) w.push(Math.hypot(x - xs[xs.length - 1], y - ys[ys.length - 1]) * (i ? 1 : 0.08));
        xs.push(x); ys.push(y);
      });
    }
    w.push(Math.hypot(xs[0] - xs[xs.length - 1], ys[0] - ys[ys.length - 1]) * 0.08);
    const n = out.length / 2;
    let total = 0;
    for (const v of w) total += v;
    let seg = 1, done = 0;
    for (let k = 0; k < n; k++) {
      const want = total * k / n;
      while (seg < w.length - 1 && done + w[seg] < want) done += w[seg++];
      const f = w[seg] ? (want - done) / w[seg] : 0, a = seg - 1, b = seg % xs.length;
      out[k * 2] = xs[a] + (xs[b] - xs[a]) * f;
      out[k * 2 + 1] = ys[a] + (ys[b] - ys[a]) * f;
    }
  }

  // ---------- filters ----------
  // an RC low-pass of any signal. when it repeats, one period is run through the filter until it
  // settles and kept as a table, which is exact and cheap; otherwise the past is weighed directly
  function makeLowpass(src, tau, tNow) {
    if (!src) return () => 0;
    const P = src.period;
    if (P > 0 && P < 1) {
      const N = 2048, dt = P / N, T0 = Math.floor(tNow / P) * P, a = Math.exp(-dt / tau), b = 1 - a;
      const x = new Float64Array(N), tab = new Float64Array(N);
      for (let i = 0; i < N; i++) x[i] = src.v(T0 + i * dt);
      let y = 0;
      for (let i = 0; i < N; i++) y = a * y + b * x[i];
      y /= 1 - Math.pow(a, N);
      for (let i = 0; i < N; i++) tab[i] = y = a * y + b * x[i];
      return (t) => {
        const k = frac((t - T0) / P) * N, i = Math.floor(k) % N;
        return tab[i] + (tab[(i + 1) % N] - tab[i]) * (k - Math.floor(k));
      };
    }
    return (t) => {
      let s = 0;
      for (let i = 0; i < 32; i++) s += src.v(t + tau * Math.log(1 - (i + 0.5) / 32));
      return s / 32;
    };
  }

  // a scope probe. x10 divides by ten through a resistor with a little trimmer capacitor across it;
  // set wrong, the high frequencies get through too much or too little, and square corners show it
  function probe(src, x10, comp, tNow) {
    if (!src || !x10) return src;
    const k = (comp - 0.5) * 1.3;
    if (Math.abs(k) < 0.02) return { v: (t) => src.v(t) / 10, period: src.period, freq: (t, g) => src.freq(t, g) };
    const lp = makeLowpass(src, 1.5e-4, tNow);
    return { v: (t) => { const x = src.v(t); return (x + k * (x - lp(t))) / 10; }, period: src.period, freq: (t, g) => src.freq(t, g) };
  }

  // ---------- component tester ----------
  // 8.5 V rms at 50 Hz through 500 ohms across the part. x is the voltage across it, y the current
  const CT_VP = 12, CT_RS = 500, CT_W = TAU * 50, VT = 0.02585;
  const diode = (is, n, bv, leak) => (v) => {
    let i = is * (Math.exp(Math.min(v / (n * VT), 80)) - 1) + (leak || 0) * v;
    if (bv) i -= 1e-3 * Math.exp(Math.min((-v - bv) / (1.2 * VT), 80));
    return i;
  };
  const PARTS = {
    open: { name: 'Nothing clipped on', z: [Infinity, 0] },
    short: { name: 'A wire link', z: [0, 0] },
    r100: { name: '100 Ω resistor', z: [100, 0] },
    r470: { name: '470 Ω resistor', z: [470, 0] },
    r2k2: { name: '2.2 kΩ resistor', z: [2200, 0] },
    c1u: { name: '1 µF capacitor', z: [0, -1 / (CT_W * 1e-6)] },
    c4u7: { name: '4.7 µF capacitor', z: [0, -1 / (CT_W * 4.7e-6)] },
    c22u: { name: '22 µF capacitor', z: [0, -1 / (CT_W * 22e-6)] },
    coil: { name: '1 H choke', z: [60, CT_W * 1] },
    rc: { name: '1 kΩ and 4.7 µF in parallel', z: (() => { const x = CT_W * 1000 * 4.7e-6; return [1000 / (1 + x * x), -1000 * x / (1 + x * x)]; })() },
    si: { name: 'Silicon diode', iv: diode(2.5e-9, 1.75) },
    ge: { name: 'Germanium diode', iv: diode(1e-6, 1.2, 0, 1 / 60e3) },
    zener: { name: '5.1 V zener diode', iv: diode(2.5e-9, 1.75, 5.1) },
    led: { name: 'Red LED', iv: diode(7.6e-18, 2, 0) },
    be: { name: 'Transistor base-emitter', iv: diode(1e-14, 1, 7.5) },
  };
  // returns [volts across, amps through] at time t
  function testPart(part, t) {
    const vs = CT_VP * Math.sin(CT_W * t);
    if (part.iv) {
      // the voltage where the part's current through the 500 ohms adds back up to the source. that
      // only ever rises with v, and sits between 0 and the source, so halve towards it
      let lo = Math.min(0, vs), hi = Math.max(0, vs);
      for (let k = 0; k < 32; k++) {
        const v = (lo + hi) / 2;
        if (v + CT_RS * part.iv(v) > vs) hi = v; else lo = v;
      }
      const v = (lo + hi) / 2;
      return [v, (vs - v) / CT_RS];
    }
    const [zr, zi] = part.z;
    if (zr === Infinity) return [vs, 0];
    // phasors: I = Vs / (Rs + Z), V = I Z, then back to the instant
    const dr = CT_RS + zr, d2 = dr * dr + zi * zi;
    const ir = CT_VP * dr / d2, ii = -CT_VP * zi / d2;
    const vr = ir * zr - ii * zi, vi = ir * zi + ii * zr;
    const c = Math.cos(CT_W * t), s = Math.sin(CT_W * t);
    return [vr * s + vi * c, ir * s + ii * c];
  }

  // ---------- the scope ----------
  const VDIV = [20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005];
  const TDIV = [0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 5e-3, 2e-3, 1e-3, 5e-4, 2e-4, 1e-4, 5e-5, 2e-5, 1e-5, 5e-6, 2e-6, 1e-6, 5e-7, 2e-7, 1e-7];
  const MAX_SEG = 60000;
  const AUTO_WAIT = 0.05;
  // the variable knobs turn gain or sweep speed down to 2.5 times slower, and back up to CAL
  const uncal = (v) => 1 + 1.5 * (1 - v);

  function Scope() {
    this.seg = new Float32Array(MAX_SEG * 5);
    this.n = 0;
    this.st = { phase: 'armed', t0: 0, until: 0, lastTrig: -1, alt: 0 };
    this.dc = [0, 0];
    this.lo = -1; this.hi = 1;
    this.cycle = 0.05;
    this.on = false; this.onAt = -9; this.offAt = -9;
    this.sigma = 0.03;
    this.trigLit = false;
    this.ts = new Float64Array(2048);
  }

  Scope.prototype.push = function (x0, y0, x1, y1, e) {
    if (this.n >= MAX_SEG || !(e > 0)) return;
    const o = this.n++ * 5, s = this.seg;
    s[o] = x0; s[o + 1] = y0; s[o + 2] = x1; s[o + 3] = y1; s[o + 4] = e;
  };
  Scope.prototype.scale = function (from, k) {
    for (let i = from; i < this.n; i++) this.seg[i * 5 + 4] *= k;
  };

  // S is the flat settings object from bench.js, inp has ch (two probed signals or nulls) and ext.
  // fills seg with the beam's path between tA and tB, each piece with how much energy it left
  Scope.prototype.frame = function (S, inp, tA, tB) {
    this.n = 0;
    const fdt = tB - tA;
    if (fdt <= 0) return;
    if (S.power !== this.on) {
      this.on = S.power;
      if (this.on) this.onAt = tB; else this.offAt = tB;
    }
    const sinceOff = tB - this.offAt;
    if (!this.on && sinceOff > 0.25) {
      // the beam's last charge, sat in the middle of the screen
      if (sinceOff < 2) this.push(5, 0, 5, 0, 0.12 * Math.exp(-(sinceOff - 0.25) / 0.3) * fdt * 60);
      this.trigLit = false;
      return;
    }
    // the heater takes a moment: no beam, then a soft one, then sharp
    const warm = this.on ? clamp((tB - this.onAt - 0.9) / 2.2, 0, 1) : 1;
    this.sigma = (0.026 + Math.abs(S.focus - 0.5) * 0.36) * (1 + 0.7 * Math.max(0, S.intens - 0.7)) * (1 + 2.5 * (1 - warm));
    // energy per second of beam, so the glow is the same however fast the frames come
    this.E = 54 * Math.pow(10, 2.2 * (S.intens - 0.55)) * Math.pow(warm, 1.5);
    if (!(this.E > 0)) return;

    this.setup(S, inp, tA, tB);
    if (S.ct) this.curve(tA, tB, 900, (t) => {
      const [v, i] = testPart(PARTS[S.part] || PARTS.open, t);
      return [5 + v / CT_VP * 4.6, i * CT_RS / CT_VP * 3.6];
    });
    else if (S.xy) this.curve(tA, tB, 2400, (t) => [5 + this.xoff + this.chv[0](t) / this.vd[0], this.pos[1] + this.inv2 * this.chv[1](t) / this.vd[1]]);
    else this.timebase(S, tA, tB);

    if (!this.on) {
      // switched off: the deflection dies and the trace folds into the middle, getting brighter
      const c = sinceOff / 0.25, k = 1 - c;
      for (let i = 0; i < this.n; i++) {
        const o = i * 5, s = this.seg;
        s[o] = 5 + (s[o] - 5) * k * k; s[o + 2] = 5 + (s[o + 2] - 5) * k * k;
        s[o + 1] *= k; s[o + 3] *= k; s[o + 4] *= 1 + 3 * c;
      }
    }
  };

  Scope.prototype.setup = function (S, inp, tA, tB) {
    this.vd = [VDIV[S['ch1.vdiv']] * uncal(S['ch1.var']), VDIV[S['ch2.vdiv']] * uncal(S['ch2.var'])];
    this.pos = [S['ch1.pos'] * 6, S['ch2.pos'] * 6];
    this.inv2 = S['ch2.inv'] ? -1 : 1;
    this.xoff = S.xpos * 5;
    this.ext = inp.ext ? (t) => inp.ext.v(t) : () => 0;
    // an input with nothing plugged in picks up a little hum, which shows on the most sensitive ranges
    const raw = inp.ch.map((s) => (s ? (t) => s.v(t) : (t) => 0.002 * mains(t) + 0.0004 * noise(t, 5e5)));
    const k = 1 - Math.exp(-(tB - tA) / 0.12);
    for (let i = 0; i < 2; i++) {
      // AC coupling, as the slow average the coupling capacitor would block. over exact periods when
      // the signal says it repeats, otherwise over the last tenth of a second
      const P = inp.ch[i] ? inp.ch[i].period : 0.02;
      let m = 0;
      if (P > 0 && P < 0.15) {
        for (let j = 0; j < 256; j++) m += raw[i](tB - P + (j + 0.5) * P / 256);
        m /= 256;
      } else {
        for (let j = 0; j < 1200; j++) m += raw[i](tB - 0.1 + (j + Math.random()) * 0.1 / 1200);
        m /= 1200;
      }
      this.dc[i] += (m - this.dc[i]) * k;
    }
    const dc = this.dc;
    this.chv = [0, 1].map((i) => {
      const ch = i ? 'ch2' : 'ch1';
      if (S[ch + '.gnd']) return () => 0;
      if (S[ch + '.coup'] === 'AC') return (t) => raw[i](t) - dc[i];
      return raw[i];
    });
  };

  Scope.prototype.curve = function (tA, tB, n, at) {
    const h = (tB - tA) / n, E = this.E;
    let [px, py] = at(tA), pt = tA;
    for (let i = 1; i <= n; i++) {
      const t = i < n ? tA + (i + Math.random() - 0.5) * h : tB;
      const [x, y] = at(t);
      this.push(px, py, x, y, E * (t - pt));
      px = x; py = y; pt = t;
    }
    this.trigLit = false;
  };

  Scope.prototype.timebase = function (S, tA, tB) {
    const fdt = tB - tA;
    const tdiv = TDIV[S.tdiv] * uncal(S.tvar);
    const sweep = 10 * tdiv;
    const t = {
      tdiv, sweep,
      mag: S.mag ? 10 : 1,
      // retrace, plus however long HOLD OFF keeps the trigger shut after each sweep
      rest: 1.5e-6 + 0.12 * sweep + S.holdoff * S.holdoff * 2 * sweep,
      auto: S['trig.mode'] === 'AUTO',
      slope: S['trig.slope'] === '-' ? -1 : 1,
      vmode: S.vmode, chop: S.chop,
    };
    const chv = this.chv, vd = this.vd, inv2 = this.inv2;
    const src = S['trig.src'];
    const ext = this.ext;
    t.tf = src === 'CH1' ? (u) => chv[0](u) / vd[0] : src === 'CH2' ? (u) => inv2 * chv[1](u) / vd[1] : src === 'EXT' ? ext : mains;

    // AT finds the signal's top and bottom and spreads LEVEL across them, so anything triggers; NORM
    // puts LEVEL where you set it and shows nothing until the signal crosses it
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < 400; j++) {
      const v = t.tf(tB - 0.1 + (j + Math.random()) * 0.1 / 400);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const k = 1 - Math.exp(-fdt / 0.4);
    this.hi = hi > this.hi ? hi : this.hi + (hi - this.hi) * k;
    this.lo = lo < this.lo ? lo : this.lo + (lo - this.lo) * k;
    const lv = S['trig.level'];
    t.level = t.auto ? (this.hi + this.lo) / 2 + lv * (this.hi - this.lo) * 0.46 : src === 'EXT' ? lv * 5 : src === 'LINE' ? lv * 0.95 : lv * 4;

    const n0 = this.n;
    if (fdt / this.cycle < 24) {
      // few enough sweeps to do every one, carrying on from last frame
      const r = this.run(t, this.st, tA, tB, 32, true);
      if (r.count >= 32 && r.tStop < tB) {
        this.scale(n0, fdt / (r.tStop - tA));
        this.st.phase = 'armed';
        this.cycle = (r.tStop - tA) / r.count;
      } else this.cycle = r.count ? fdt / r.count : Math.max(this.cycle, fdt * 2);
    } else {
      // thousands of sweeps a frame: sample a few short runs spread through the frame. each one
      // warms up with a sweep it doesn't draw, so HOLD OFF has had a chance to lock on, then draws
      // three, and they're all brightened to stand for the sweeps that weren't drawn
      let covered = 0, count = 0;
      for (let s = 0; s < 8; s++) {
        const st = { phase: 'armed', t0: 0, until: 0, lastTrig: this.st.lastTrig, alt: s & 1 };
        const w = this.run(t, st, tA + (s + Math.random()) * fdt / 8, tB + fdt, 1, false);
        const r = this.run(t, st, w.tStop, tB + fdt, 3, true);
        covered += r.tStop - w.tStop;
        count += r.count;
        if (st.lastTrig > this.st.lastTrig) this.st.lastTrig = st.lastTrig;
      }
      if (covered > 0) this.scale(n0, fdt / covered);
      this.st.phase = 'armed';
      this.cycle = count ? covered / count : fdt;
    }
    this.trigLit = tB - this.st.lastTrig < 0.15;
  };

  // the trigger and sweep, one event after another: wait for the trigger (or AT's timeout), sweep,
  // retrace and hold off, again. stops at tb or after cap sweeps
  Scope.prototype.run = function (T, st, ta, tb, cap, draw) {
    let t = ta, count = 0;
    while (t < tb && count < cap) {
      if (st.phase === 'hold') {
        if (st.until >= tb) return { count, tStop: tb };
        t = Math.max(t, st.until);
        st.phase = 'armed';
      }
      if (st.phase === 'armed') {
        const recent = t - st.lastTrig < AUTO_WAIT;
        const limit = !T.auto ? tb : recent ? st.lastTrig + AUTO_WAIT : t + Math.min(T.sweep * 0.1, 0.02) + 1e-5;
        const end = Math.min(tb, limit);
        const hit = end > t ? this.findTrigger(T, t, end) : -1;
        if (hit >= 0) { st.t0 = hit; st.lastTrig = hit; st.phase = 'sweep'; }
        else if (T.auto && limit <= tb) { st.t0 = Math.max(t, limit); st.phase = 'sweep'; }
        else return { count, tStop: tb };
      }
      const end = st.t0 + T.sweep;
      if (draw) this.drawSweep(T, st, Math.max(t, st.t0), Math.min(end, tb));
      if (end > tb) return { count, tStop: tb };
      st.phase = 'hold';
      st.until = end + T.rest;
      st.alt ^= 1;
      t = end;
      count++;
    }
    return { count, tStop: Math.min(t, tb) };
  };

  // the first time after ta the trigger signal crosses the level going the right way. steps along,
  // then halves the step that crossed until it's exact, so the trace doesn't jitter
  Scope.prototype.findTrigger = function (T, ta, tb) {
    const f = T.tf, L = T.level, s = T.slope;
    const step = Math.max(T.sweep / 150, (tb - ta) / 3000);
    let pt = ta, pv = s * (f(ta) - L);
    for (let t = ta + step; pt < tb; t += step) {
      if (t > tb) t = tb;
      const v = s * (f(t) - L);
      if (pv < 0 && v >= 0) {
        let a = pt, b = t;
        for (let i = 0; i < 16; i++) {
          const m = (a + b) / 2;
          if (s * (f(m) - L) < 0) a = m; else b = m;
        }
        return b;
      }
      pt = t; pv = v;
    }
    return -1;
  };

  Scope.prototype.drawSweep = function (T, st, ta, tb) {
    const t0 = st.t0, tdiv = T.tdiv, mag = T.mag, xoff = this.xoff;
    const tAt = (xs) => t0 + ((xs - 5) / mag + 5 - xoff) * tdiv;
    const a = Math.max(ta, tAt(-0.7)), b = Math.min(tb, tAt(10.7));
    if (b <= a) return;
    const N = Math.min(this.ts.length - 1, Math.max(2, Math.ceil(700 * (b - a) / (11.4 * tdiv / mag))));
    const h = (b - a) / N, ts = this.ts;
    for (let i = 0; i <= N; i++) ts[i] = a + (i && i < N ? i + Math.random() - 0.5 : i) * h;
    const xk = mag / tdiv, xc = (xoff - 5) * mag + 5;
    const chv = this.chv, vd = this.vd, pos = this.pos, inv2 = this.inv2, E = this.E;

    let chans, chop = false;
    if (T.vmode === 'CH1') chans = [0];
    else if (T.vmode === 'CH2') chans = [1];
    else if (T.vmode === 'ADD') chans = [2];
    else if (!T.chop) chans = [st.alt];
    else { chans = [0, 1]; chop = h < 0.5e-6; }
    // CHOP flips between channels every microsecond. slow sweeps blur that into two whole traces;
    // fast ones show it as dashes, as on the real thing
    const share = chans.length > 1 && !chop ? 0.5 : 1;
    const floor = tdiv / mag / 40;

    for (const c of chans) {
      const y = c === 2
        ? (u) => pos[0] + pos[1] + chv[0](u) / vd[0] + inv2 * chv[1](u) / vd[1]
        : c === 1 ? (u) => pos[1] + inv2 * chv[1](u) / vd[1] : (u) => pos[0] + chv[0](u) / vd[0];
      let px = (ts[0] - t0) * xk + xc, py = y(ts[0]);
      for (let i = 1; i <= N; i++) {
        const u = ts[i], x = (u - t0) * xk + xc, yy = y(u);
        // a floor on the dwell per division travelled: real tubes show fast edges and bands faintly,
        // where the strict physics would leave them all but invisible
        if (!chop || (Math.floor((u + ts[i - 1]) * 5e5) & 1) === c) this.push(px, py, x, yy, E * share * Math.max(u - ts[i - 1], Math.abs(yy - py) * floor));
        px = x; py = yy;
      }
    }
  };

  const api = {
    TAU, VDIV, TDIV, RANGES, RATIOS, PARTS, TRAINER, mains, noise,
    Generator, VectorBox, Scope, calibrator, makeLowpass, probe, testPart, uncal,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else window.OscSignals = api;
})();
