// oscilloscope playground: the page. builds the knobs, buttons and patch cables, keeps every setting
// in one flat object S, and once a frame hands the signals to the scope (signals.js) and what the
// beam did to the tube (crt.js)
(function () {
  'use strict';

  const OS = window.OscSignals;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- numbers people read ----------
  const trim = (n) => String(+n.toPrecision(3));
  const volts = (v) => (Math.abs(v) < 1 ? trim(v * 1000) + ' mV' : trim(v) + ' V');
  const secs = (s) => (s >= 1 ? trim(s) + ' s' : s >= 1e-3 ? trim(s * 1e3) + ' ms' : s >= 1e-6 ? trim(s * 1e6) + ' µs' : trim(s * 1e9) + ' ns');
  const hertz = (f) => (f >= 1e6 ? trim(f / 1e6) + ' MHz' : f >= 1e3 ? trim(f / 1e3) + ' kHz' : trim(f) + ' Hz');
  const pct = (v) => Math.round(v * 100) + '%';
  const short = (v) => (v >= 1 ? trim(v) : '.' + String(trim(v)).split('.')[1]);

  const TAUS = [1e-5, 1e-4, 1e-3, 1e-2];
  const GATES = [0.1, 1, 10];
  const PICTURES = ['Lissajous figure', 'Spinning cube', 'Heart', 'Star', 'Spirograph', 'Clock'];
  const CABLE_COLOURS = ['#d8452f', '#e9b52c', '#3474d6', '#2f9a58', '#2a2a2e', '#ebe5d4', '#9b55cf', '#e27b2c'];

  // ---------- settings ----------
  const gen = (dial) => ({ wave: 'sine', range: 3, dial, amp: 0.2, offset: 0, sym: 0.5, att: false, sweep: false, rate: 0.5 });
  const prefix = (p, o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [p + '.' + k, v]));
  const DEFAULTS = Object.assign({
    power: false, intens: 0.55, focus: 0.5, illum: 0.3, rot: 0, tube: 'P31',
    'ch1.vdiv': 4, 'ch1.var': 1, 'ch1.pos': 0, 'ch1.coup': 'DC', 'ch1.gnd': false,
    'ch2.vdiv': 4, 'ch2.var': 1, 'ch2.pos': 0, 'ch2.coup': 'DC', 'ch2.gnd': false, 'ch2.inv': false,
    vmode: 'CH1', chop: false, xy: false,
    tdiv: 10, tvar: 1, xpos: 0, mag: false,
    'trig.level': 0, 'trig.slope': '+', 'trig.src': 'CH1', 'trig.mode': 'AUTO', holdoff: 0,
    ct: false, part: 'si',
    'p1.x10': false, 'p1.comp': 0.5, 'p2.x10': false, 'p2.comp': 0.5,
    'vec.prog': 1, 'vec.rate': 0.45, 'vec.size': 0.6, 'vec.spin': 0.45, 'vec.ratio': 3,
    'rc.tau': 1, 'aud.gain': 0.5, 'spk.vol': 0.4, 'cnt.gate': 1,
    sfx: true, ghost: false,
  }, prefix('genA', gen(1)), prefix('genB', gen(1.5)));
  const S = Object.assign({}, DEFAULTS);
  const START_PATCH = [['gena', 'ch1']];
  const START_UNITS = ['genA'];

  // ---------- knob specs: range, detents, and how the value reads ----------
  const VLABELS = OS.VDIV.map((v) => (v >= 0.1 ? short(v) : trim(v * 1000)));
  const TLABELS = OS.TDIV.map((s) => short(s >= 0.1 ? s : s >= 1e-4 ? s * 1e3 : s * 1e6));
  const calFmt = (v) => (v >= 1 ? 'CAL' : 'uncalibrated, ×' + (1 / OS.uncal(v)).toFixed(2));
  const KN = {
    intens: { min: 0, max: 1, fmt: pct, name: 'Intensity' },
    focus: { min: 0, max: 1, fmt: (v) => (Math.abs(v - 0.5) < 0.03 ? 'sharp' : pct(v)), name: 'Focus' },
    illum: { min: 0, max: 1, fmt: pct, name: 'Graticule light' },
    rot: { min: -1, max: 1, fmt: (v) => (v * 3).toFixed(1) + '°', name: 'Trace rotation' },
    tdiv: { steps: OS.TDIV.length, labels: TLABELS, groups: OS.TDIV.map((s) => (s >= 0.1 ? 0 : s >= 1e-4 ? 1 : 2)), fmt: (i) => secs(OS.TDIV[i]) + '/div', name: 'Time/div' },
    tvar: { min: 0, max: 1, cal: true, fmt: calFmt, name: 'Fine sweep speed' },
    xpos: { min: -1, max: 1, fmt: (v) => (v * 5).toFixed(1) + ' div', name: 'X position' },
    'trig.level': { min: -1, max: 1, fmt: (v) => (v > 0 ? '+' : '') + Math.round(v * 100) + '%', name: 'Trigger level' },
    holdoff: { min: 0, max: 1, fmt: pct, name: 'Hold off' },
    'rc.tau': { steps: 4, labels: ['10µ', '100µ', '1m', '10m'], fmt: (i) => secs(TAUS[i]), name: 'Filter time constant' },
    'vec.prog': { steps: 6, labels: ['LISS', 'CUBE', 'HEART', 'STAR', 'SPIRO', 'CLOCK'], fmt: (i) => PICTURES[i], name: 'Vector box picture', arc: 200 },
    'vec.ratio': { steps: 7, labels: OS.RATIOS.map((r) => r.join(':')), fmt: (i) => OS.RATIOS[i].join(' : '), name: 'Lissajous ratio', arc: 240 },
    'vec.spin': { min: 0, max: 1, fmt: pct, name: 'Spin' },
    'vec.size': { min: 0, max: 1, fmt: (v) => volts(v * 4) + ' peak', name: 'Picture size' },
    'vec.rate': { min: 0, max: 1, fmt: (v) => hertz(40 * Math.pow(10, v * 1.3)), name: 'Drawing rate' },
    'aud.gain': { min: 0, max: 1, fmt: pct, name: 'Audio gain' },
    'spk.vol': { min: 0, max: 1, fmt: pct, name: 'Speaker volume' },
  };
  for (const c of [1, 2]) {
    const n = c === 1 ? 'I' : 'II';
    KN['ch' + c + '.vdiv'] = { steps: OS.VDIV.length, labels: VLABELS, groups: OS.VDIV.map((v) => (v >= 0.1 ? 0 : 2)), fmt: (i) => volts(OS.VDIV[i]) + '/div', name: 'CH ' + n + ' volts/div' };
    KN['ch' + c + '.var'] = { min: 0, max: 1, cal: true, fmt: calFmt, name: 'CH ' + n + ' fine gain' };
    KN['ch' + c + '.pos'] = { min: -1, max: 1, fmt: (v) => (v * 6).toFixed(1) + ' div', name: 'CH ' + n + ' position' };
    KN['p' + c + '.comp'] = { min: 0, max: 1, fmt: (v) => (Math.abs(v - 0.5) < 0.016 ? 'flat, just right' : v < 0.5 ? 'under-compensated' : 'over-compensated'), name: 'Probe ' + c + ' compensation' };
  }
  for (const g of ['genA', 'genB']) {
    const L = 'Generator ' + g.slice(3);
    KN[g + '.dial'] = { min: 0.1, max: 2, marks: [[0.1, '.1'], [0.25, '.25'], [0.5, '.5'], [0.75, '.75'], [1, '1'], [1.25, '1.25'], [1.5, '1.5'], [1.75, '1.75'], [2, '2']], fmt: (v) => hertz(OS.RANGES[S[g + '.range']] * v), name: L + ' frequency', fine: 1200 };
    KN[g + '.amp'] = { min: 0, max: 1, fmt: (v) => trim(v * 20 * (S[g + '.att'] ? 0.1 : 1)) + ' V p-p', name: L + ' amplitude' };
    KN[g + '.offset'] = { min: -1, max: 1, fmt: (v) => (v * 5 * (S[g + '.att'] ? 0.1 : 1)).toFixed(2) + ' V', name: L + ' DC offset' };
    KN[g + '.sym'] = { min: 0.05, max: 0.95, fmt: (v) => Math.round(v * 100) + ' / ' + Math.round(100 - v * 100), name: L + ' symmetry' };
    KN[g + '.rate'] = { min: 0, max: 1, fmt: (v) => secs(0.25 * Math.pow(40, 1 - v)) + ' a sweep', name: L + ' sweep time' };
  }

  // ---------- building the parts that are the same many times ----------
  const WAVE_ICONS = {
    sine: 'M2 10c3-10 7-10 10 0s7 10 10 0',
    triangle: 'M2 14 7 4l10 16 5-10',
    square: 'M2 16V6h10v12h10V6',
    noise: 'M2 11l2-5 2 9 2-7 2 4 2-8 2 11 2-6 2 5 2-7 2 6',
  };
  function genPanel(el) {
    const g = el.dataset.gen, L = el.dataset.letter, id = g.toLowerCase();
    el.innerHTML = `
      <div class="unit-title"><span>Function generator ${L}</span><small>FG-80 · 0.1 Hz to 2 MHz</small></div>
      <div class="gen-face">
        <div class="kn kn-xl kn-dark" data-k="${g}.dial" data-help="The frequency dial. Its reading times the range button is the frequency in hertz. Hold Shift for fine tuning.">FREQUENCY</div>
        <div class="gen-ctl">
          <div class="gen-row" role="group" aria-label="Range">
            <span class="gen-lbl">RANGE</span>
            ${['1', '10', '100', '1k', '10k', '100k', '1M'].map((r, i) => `<button type="button" class="pb pb-sm pb-dark" data-set="${g}.range=${i}" data-help="Multiplies the dial by ${r}.">${r}</button>`).join('')}
          </div>
          <div class="gen-row" role="group" aria-label="Waveform">
            <span class="gen-lbl">WAVE</span>
            ${Object.keys(WAVE_ICONS).map((w) => `<button type="button" class="pb pb-sm pb-dark pb-icon" data-set="${g}.wave=${w}" aria-label="${w}" data-help="${{ sine: 'Sine: the purest tone, one frequency and nothing else.', triangle: 'Triangle: straight ramps up and down. SYMMETRY turns it into a sawtooth.', square: 'Square: flat tops and quick edges, full of odd harmonics. SYMMETRY makes it a pulse.', noise: 'Noise: random voltage with every frequency in it. Nothing to trigger on.' }[w]}"><svg viewBox="0 0 24 20"><path d="${WAVE_ICONS[w]}"/></svg></button>`).join('')}
          </div>
          <div class="gen-row gen-knobs">
            <div class="kn kn-sm kn-dark" data-k="${g}.amp" data-help="How big the wave is, from nothing to 20 V peak to peak.">AMPL.</div>
            <div class="kn kn-sm kn-dark" data-k="${g}.offset" data-help="Lifts the whole wave up or down. Too much and it clips against the output's supply rails.">OFFSET</div>
            <div class="kn kn-sm kn-dark" data-k="${g}.sym" data-help="How each cycle splits between rising and falling, or high and low.">SYMM.</div>
            <div class="kn kn-sm kn-dark" data-k="${g}.rate" data-help="How long each sweep takes to glide up a decade.">SWEEP T.</div>
          </div>
          <div class="gen-row">
            <button type="button" class="pb pb-dark" data-toggle="${g}.att" data-help="An attenuator: divides the output by ten, for small signals.">−20 dB</button>
            <button type="button" class="pb pb-dark" data-toggle="${g}.sweep" data-help="Sweeps the frequency up ten times and snaps back, over and over. Feed it through the filter and watch what gets through.">SWEEP</button>
            <div class="unit-jack">
              <button type="button" class="jack jack-bnc" data-jack="${id}" data-io="out" aria-label="Generator ${L} output" data-help="Generator ${L}'s output. One output can feed as many cables as you like."></button>
              <span>OUTPUT</span>
            </div>
            <div class="unit-jack">
              <button type="button" class="jack jack-bnc" data-jack="${id}ttl" data-io="out" aria-label="Generator ${L} TTL output" data-help="A 0 to 5 V square wave in step with the output, for triggering or for logic."></button>
              <span>TTL</span>
            </div>
          </div>
        </div>
      </div>`;
  }
  $$('.unit-gen').forEach(genPanel);

  // schematic symbols for the parts drawer
  const PART_ICON = {
    open: '<path d="M4 12h8M28 12h8" /><circle cx="14" cy="12" r="2" /><circle cx="26" cy="12" r="2" />',
    short: '<path d="M4 12h32" />',
    r: '<path d="M4 12h6l2-5 3 10 3-10 3 10 3-10 3 10 2-5h7" />',
    c: '<path d="M4 12h13M17 4v16M23 4v16M23 12h13" />',
    l: '<path d="M4 12h6c0-6 5-6 5 0 0-6 5-6 5 0 0-6 5-6 5 0 0-6 5-6 5 0h6" />',
    rc: '<path d="M4 12h6M30 12h6M10 5v14M30 5v14M10 5h4l1-3 2 6 2-6 2 6 2-6 1 3h4M10 19h8M18 15v8M22 15v8M22 19h8" />',
    d: '<path d="M4 12h11M25 12h11M15 5v14l10-7z M25 5v14" />',
    z: '<path d="M4 12h11M25 12h11M15 5v14l10-7z M22 4l3 1v14l3 1" />',
    led: '<path d="M4 12h11M25 12h11M15 5v14l10-7z M25 5v14M24 3l4-3M28 5l4-3" />',
    be: '<path d="M4 12h12M16 4v16M16 9l12-6M16 15l12 6M24 20l4 1-2-4" />',
  };
  const PART_KIND = { open: 'open', short: 'short', r100: 'r', r470: 'r', r2k2: 'r', c1u: 'c', c4u7: 'c', c22u: 'c', coil: 'l', rc: 'rc', si: 'd', ge: 'd', zener: 'z', led: 'led', be: 'be' };
  $('#partsGrid').innerHTML = Object.entries(OS.PARTS).map(([k, p]) =>
    `<button type="button" class="part-pick" data-set="part=${k}" data-help="Clips a ${p.name.toLowerCase()} onto the component tester. Press CT on the scope to see it."><svg viewBox="0 0 40 24" aria-hidden="true">${PART_ICON[PART_KIND[k]]}</svg><span>${p.name}</span></button>`).join('');

  // nixie tubes: every digit's wire is there, stacked; only the lit one glows
  $('#cntTubes').innerHTML = Array.from({ length: 7 }, () =>
    `<span class="nx">${'0123456789'.split('').map((d) => `<b>${d}</b>`).join('')}<i class="nx-dp"></i></span>`).join('');

  // the graticule: 10 by 8, little ticks every fifth of a division along the middle lines, and the
  // dotted 0, 10, 90 and 100% lines for measuring rise times
  (function graticule() {
    let major = '', minor = '', dash = '';
    for (let x = 0; x <= 10; x++) major += `M${x} -4V4`;
    for (let y = -4; y <= 4; y++) major += `M0 ${y}H10`;
    for (let k = 1; k < 50; k++) if (k % 5) minor += `M${k / 5} -0.1V0.1`;
    for (let k = -19; k < 20; k++) if (k % 5) minor += `M4.9 ${k / 5}H5.1`;
    for (const y of [-2.5, -2, 2, 2.5]) dash += `M0 ${y}H10`;
    const label = (y, t) => `<text x="0.12" y="${y - 0.07}">${t}</text>`;
    $('#scGrat').innerHTML = `<path class="g-major" d="${major}"/><path class="g-minor" d="${minor}"/><path class="g-dash" d="${dash}"/>` +
      label(2.5, '0%') + label(2, '10%') + label(-2, '90%') + label(-2.5, '100%');
  })();

  // ---------- the label maker tape ----------
  const tapeName = $('#osTapeName'), tapeText = $('#osTapeText');
  // on a phone the tape sits over the bottom of the screen; a tap folds it down to its title
  $('#osTape').addEventListener('click', (e) => e.currentTarget.classList.toggle('is-min'));
  let tapeKey = null;
  function tape(name, text, key) {
    tapeName.textContent = name;
    tapeText.textContent = text || '';
    tapeKey = key || null;
  }

  // ---------- controls ----------
  const views = new Map();
  const view = (key, fn) => { if (!views.has(key)) views.set(key, []); views.get(key).push(fn); fn(); };
  const renderAll = () => views.forEach((fns) => fns.forEach((f) => f()));
  const names = new Map();

  function set(key, value, quiet) {
    const spec = KN[key];
    if (spec) {
      if (spec.steps) value = Math.max(0, Math.min(spec.steps - 1, Math.round(value)));
      else {
        value = Math.max(spec.min, Math.min(spec.max, value));
        if (spec.cal && value > 0.975) value = 1;
      }
    }
    if (S[key] === value) return;
    const old = S[key];
    S[key] = value;
    (views.get(key) || []).forEach((f) => f());
    // knobs whose reading depends on this one
    if (/\.(range|att)$/.test(key)) ['dial', 'amp', 'offset'].forEach((k) => (views.get(key.split('.')[0] + '.' + k) || []).forEach((f) => f()));
    if (spec && spec.steps && !quiet) sfx('detent');
    if (spec && spec.cal && !quiet && (old === 1) !== (value === 1)) sfx('detent');
    if (spec || tapeKey === key) showValue(key);
  }
  function showValue(key) {
    const spec = KN[key];
    const el = names.get(key);
    const label = spec ? spec.name : (el && el.dataset.name) || key;
    let reading;
    if (spec) reading = spec.fmt(S[key]);
    else if (typeof S[key] === 'boolean') reading = S[key] ? 'in' : 'out';
    else reading = String(S[key]);
    tape(label + ': ' + reading, el ? el.dataset.help : '', key);
  }

  // turning: drag up or right to turn clockwise, Shift for fine, the wheel once it's been clicked,
  // arrow keys, and a double click puts it back where it started
  const angleOf = (spec, v) => (spec.steps ? -spec.arc / 2 + (v / (spec.steps - 1)) * spec.arc : -135 + ((v - spec.min) / (spec.max - spec.min)) * 270);
  function bindDial(node, key, helpEl) {
    const spec = KN[key];
    let acc = 0, id = null, lx = 0, ly = 0;
    const nudge = (amount, fine) => {
      if (spec.steps) {
        acc += amount / 14;
        while (Math.abs(acc) >= 1) { set(key, S[key] + Math.sign(acc)); acc -= Math.sign(acc); }
      } else set(key, S[key] + (amount / (fine ? spec.fine || 900 : 170)) * (spec.max - spec.min));
    };
    const step = (n) => (spec.steps ? set(key, S[key] + n) : set(key, S[key] + n * (spec.max - spec.min) / 50));
    node.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      e.preventDefault();
      e.stopPropagation();
      node.setPointerCapture(e.pointerId);
      id = e.pointerId; lx = e.clientX; ly = e.clientY; acc = 0;
      node.focus({ preventScroll: true });
      node.classList.add('is-turning');
      ac();
      showValue(key);
    });
    node.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      nudge(e.clientX - lx - (e.clientY - ly), e.shiftKey);
      lx = e.clientX; ly = e.clientY;
    });
    const up = (e) => { if (e.pointerId === id) { id = null; node.classList.remove('is-turning'); } };
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('wheel', (e) => {
      if (document.activeElement !== node) return;
      e.preventDefault();
      if (spec.steps) step(e.deltaY < 0 ? 1 : -1); else nudge(-e.deltaY * 0.35, e.shiftKey);
    }, { passive: false });
    node.addEventListener('keydown', (e) => {
      const k = e.key;
      const n = k === 'ArrowUp' || k === 'ArrowRight' ? 1 : k === 'ArrowDown' || k === 'ArrowLeft' ? -1 : k === 'PageUp' ? 5 : k === 'PageDown' ? -5 : 0;
      if (n) { e.preventDefault(); step(e.shiftKey && !spec.steps ? n / 10 : n); }
      if (k === 'Home') { e.preventDefault(); set(key, spec.steps ? 0 : spec.min); }
      if (k === 'End') { e.preventDefault(); set(key, spec.steps ? spec.steps - 1 : spec.max); }
    });
    node.addEventListener('dblclick', () => set(key, DEFAULTS[key]));
    node.addEventListener('focus', () => showValue(key));
    names.set(key, helpEl);
    view(key, () => {
      node.querySelector('.kn-cap').style.transform = `rotate(${angleOf(spec, S[key])}deg)`;
      if (spec.steps) node.setAttribute('aria-valuenow', S[key]);
      else node.setAttribute('aria-valuenow', S[key].toFixed(3));
      node.setAttribute('aria-valuetext', spec.fmt(S[key]));
    });
  }

  function buildKnob(el) {
    const key = el.dataset.k, spec = KN[key];
    if (spec.steps && !spec.arc) spec.arc = spec.steps > 14 ? 310 : 290;
    const caption = el.textContent.trim();
    el.textContent = '';
    const dial = document.createElement('div');
    dial.className = 'kn-dial';
    let marks = '';
    if (spec.labels) {
      spec.labels.forEach((l, i) => {
        const a = angleOf(spec, i);
        marks += `<i class="kn-tick" style="--a:${a}deg"></i><span class="kn-lab${spec.groups ? ' g' + spec.groups[i] : ''}" style="--a:${a}deg">${l}</span>`;
      });
    } else if (spec.marks) {
      spec.marks.forEach(([v, l]) => { const a = angleOf(spec, v); marks += `<i class="kn-tick" style="--a:${a}deg"></i><span class="kn-lab" style="--a:${a}deg">${l}</span>`; });
    } else {
      for (let i = 0; i <= 10; i++) marks += `<i class="kn-tick" style="--a:${-135 + i * 27}deg"></i>`;
    }
    dial.innerHTML = marks;
    const body = document.createElement('div');
    body.className = 'kn-body';
    body.tabIndex = 0;
    body.setAttribute('role', 'slider');
    body.setAttribute('aria-label', spec.name);
    body.setAttribute('aria-valuemin', spec.steps ? 0 : spec.min);
    body.setAttribute('aria-valuemax', spec.steps ? spec.steps - 1 : spec.max);
    body.innerHTML = '<span class="kn-cap"><i></i></span>';
    dial.append(body);
    el.dataset.name = spec.name;
    bindDial(body, key, el);
    if (el.dataset.inner) {
      const ik = el.dataset.inner, inner = document.createElement('div');
      inner.className = 'kn-inner';
      inner.tabIndex = 0;
      inner.setAttribute('role', 'slider');
      inner.setAttribute('aria-label', KN[ik].name);
      inner.setAttribute('aria-valuemin', 0);
      inner.setAttribute('aria-valuemax', 1);
      inner.innerHTML = '<span class="kn-cap"><i></i></span>';
      dial.append(inner);
      // the red knob has its own help, so give it a stand-in element to read it from
      const proxy = { dataset: { help: el.dataset.innerHelp, name: KN[ik].name } };
      bindDial(inner, ik, proxy);
      inner.addEventListener('mouseenter', (e) => { e.stopPropagation(); showValue(ik); });
    }
    const cap = document.createElement('span');
    cap.className = 'kn-name';
    cap.textContent = caption;
    el.append(dial, cap);
    el.addEventListener('mouseenter', (e) => { if (!e.target.closest('.kn-inner')) showValue(key); });
  }
  $$('.kn').forEach(buildKnob);

  const parse = (v) => (v === 'true' ? true : v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);
  function bindButton(el) {
    let key, on, off;
    if (el.dataset.set) {
      const i = el.dataset.set.indexOf('=');
      key = el.dataset.set.slice(0, i);
      on = parse(el.dataset.set.slice(i + 1));
    } else {
      key = el.dataset.toggle;
      on = el.dataset.on !== undefined ? parse(el.dataset.on) : true;
      off = el.dataset.off !== undefined ? parse(el.dataset.off) : false;
    }
    el.dataset.name = el.dataset.name || el.getAttribute('aria-label') || el.textContent.trim().replace(/\s+/g, ' ');
    el.addEventListener('click', () => {
      ac();
      if (el.dataset.set) set(key, on, true); else set(key, S[key] === on ? off : on, true);
      sfx(key === 'power' ? 'power' : el.classList.contains('slide') ? 'detent' : 'button');
      if (key === 'power' && S.power) tape('POWER', 'The heater is warming up. The beam appears in a couple of seconds.');
      else tape(el.dataset.name + (el.dataset.set ? '' : S[key] === on ? ': in' : ': out'), el.dataset.help);
    });
    el.addEventListener('mouseenter', () => tape(el.dataset.name, el.dataset.help));
    view(key, () => el.setAttribute('aria-pressed', String(S[key] === on)));
  }
  $$('[data-set], [data-toggle]').forEach(bindButton);

  view('part', () => { $('#scPart').textContent = OS.PARTS[S.part].name.replace(/^./, (c) => c.toLowerCase()) + ' clipped on'; });
  view('illum', () => $('#scScreen').style.setProperty('--illum', S.illum));
  view('ghost', () => document.body.classList.toggle('os-ghost', S.ghost));

  // ---------- sound ----------
  let actx = null, noiseBuf = null;
  function ac() {
    if (!actx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      actx = new C();
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function sfx(kind) {
    if (!S.sfx) return;
    const a = ac();
    if (!a) return;
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, a.sampleRate * 0.3, a.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = a.currentTime;
    const burst = (dur, freq, q, gain, when = 0) => {
      const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      s.buffer = noiseBuf;
      f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      g.gain.setValueAtTime(gain, t + when);
      g.gain.exponentialRampToValueAtTime(0.0001, t + when + dur);
      s.connect(f).connect(g).connect(a.destination);
      s.start(t + when, Math.random() * 0.2, dur + 0.02);
    };
    const tone = (freq, dur, gain, when = 0) => {
      const o = a.createOscillator(), g = a.createGain();
      o.frequency.value = freq;
      g.gain.setValueAtTime(gain, t + when);
      g.gain.exponentialRampToValueAtTime(0.0001, t + when + dur);
      o.connect(g).connect(a.destination);
      o.start(t + when);
      o.stop(t + when + dur + 0.02);
    };
    if (kind === 'detent') burst(0.012, 3600, 2.5, 0.35);
    else if (kind === 'button') { burst(0.025, 1300, 1.2, 0.6); burst(0.012, 3000, 2, 0.3, 0.035); }
    else if (kind === 'power') { tone(52, 0.3, 0.5); burst(0.04, 800, 1, 0.8); burst(0.02, 2400, 2, 0.3, 0.06); }
    else if (kind === 'plug') { burst(0.03, 1700, 1.4, 0.8); tone(2300, 0.09, 0.05, 0.004); }
    else if (kind === 'unplug') burst(0.02, 2600, 1.6, 0.5);
  }

  // ---------- the microphone and songs ----------
  // the analysers keep the last 32768 samples; each frame takes a copy and stamps it with the time,
  // so the signal at time t is the sample that long before the stamp. a small lag keeps the scope
  // reading just behind the newest sample
  const LAG = 0.06;
  const live = { mode: 'off', an: [], buf: [new Float32Array(32768), new Float32Array(32768)], stamp: 0, sr: 48000, nodes: [], stream: null };
  function liveSource(ch) {
    return {
      live: true, period: 0,
      v(t) {
        if (live.mode === 'off') return 0;
        const b = live.buf[ch], i = b.length - 1 - Math.round((live.stamp - t + LAG) * live.sr);
        return i >= 0 && i < b.length ? b[i] * (0.2 + 6 * S['aud.gain'] * S['aud.gain']) : 0;
      },
      freq() {
        if (live.mode === 'off') return 0;
        const b = live.buf[ch], n = Math.min(b.length, Math.round(live.sr * 0.5));
        let crossings = 0, armed = false, first = -1, last = -1;
        for (let i = b.length - n; i < b.length; i++) {
          if (b[i] < -0.01) armed = true;
          else if (armed && b[i] > 0.01) { armed = false; crossings++; if (first < 0) first = i; last = i; }
        }
        return crossings > 1 ? (crossings - 1) * live.sr / (last - first) : 0;
      },
    };
  }
  const audStatus = $('#audStatus');
  function stopLive() {
    live.nodes.forEach((n) => { try { n.stop && n.stop(); } catch (e) { /* already stopped */ } n.disconnect(); });
    live.nodes = [];
    if (live.stream) live.stream.getTracks().forEach((tr) => tr.stop());
    live.stream = null;
    live.mode = 'off';
    audStatus.textContent = 'Nothing playing.';
  }
  function liveInto(node, stereo) {
    const a = ac();
    live.sr = a.sampleRate;
    live.an = [a.createAnalyser(), a.createAnalyser()];
    live.an.forEach((an) => { an.fftSize = 32768; });
    if (stereo) {
      const split = a.createChannelSplitter(2);
      node.connect(split);
      split.connect(live.an[0], 0);
      split.connect(live.an[1], 1);
      live.nodes.push(split);
    } else live.an.forEach((an) => node.connect(an));
    live.nodes.push(node, ...live.an);
  }
  $('#audMic').addEventListener('click', async () => {
    const a = ac();
    stopLive();
    if (!a || !navigator.mediaDevices) { audStatus.textContent = 'This browser has no microphone access.'; return; }
    audStatus.textContent = 'Asking for the microphone…';
    try {
      live.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      liveInto(a.createMediaStreamSource(live.stream), false);
      live.mode = 'mic';
      audStatus.textContent = 'Listening to the microphone, on both outputs.';
    } catch (e) {
      audStatus.textContent = "The microphone wasn't allowed.";
    }
  });
  $('#audFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const a = ac();
    if (!file || !a) return;
    stopLive();
    audStatus.textContent = 'Opening ' + file.name + '…';
    try {
      const buf = await a.decodeAudioData(await file.arrayBuffer());
      const src = a.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(a.destination);
      liveInto(src, buf.numberOfChannels > 1);
      src.start();
      live.mode = 'file';
      audStatus.textContent = 'Playing ' + file.name + ', on repeat.';
    } catch (err) {
      audStatus.textContent = "That file wouldn't play.";
    }
    e.target.value = '';
  });
  $('#audStop').addEventListener('click', stopLive);

  // ---------- everything you can plug in ----------
  const genA = new OS.Generator((k) => S['genA.' + k]);
  const genB = new OS.Generator((k) => S['genB.' + k]);
  const vec = new OS.VectorBox((k) => S['vec.' + k]);
  const rc = { lp: () => 0, inV: () => 0, period: 0, freq: () => 0 };
  const OUT = Object.assign({
    cal: OS.calibrator(0.2), cal2: OS.calibrator(2),
    gena: genA, genattl: genA.ttl(), genb: genB, genbttl: genB.ttl(),
    rclp: { v: (t) => rc.lp(t), get period() { return rc.period; }, freq: (t, g) => rc.freq(t, g) },
    rchp: { v: (t) => rc.inV(t) - rc.lp(t), get period() { return rc.period; }, freq: (t, g) => rc.freq(t, g) },
    vecx: vec.output(0), vecy: vec.output(1),
    audl: liveSource(0), audr: liveSource(1),
  }, OS.TRAINER);

  // ---------- patch cables ----------
  const bench = $('#bench'), svg = $('#osCables');
  const jacks = new Map($$('.jack').map((el) => [el.dataset.jack, el]));
  const patches = new Map(); // input jack -> { out, colour }
  let colourIdx = 0, carry = null;
  const nextColour = () => CABLE_COLOURS[colourIdx++ % CABLE_COLOURS.length];
  const io = (id) => jacks.get(id).dataset.io;
  const unitOf = (id) => jacks.get(id).closest('[data-unit]').dataset.unit;
  const label = (id) => jacks.get(id).getAttribute('aria-label');
  const sourceFor = (id) => { const p = patches.get(id); return p ? OUT[p.out] : null; };
  const shown = (el) => el.getClientRects().length > 0;

  function centre(el, box) {
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top];
  }
  function cable(p, q, colour, cls, ends = 2) {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]), sag = Math.min(240, 30 + d * 0.32);
    const path = `M${p[0]},${p[1]} C${p[0]},${p[1] + sag} ${q[0]},${q[1] + sag} ${q[0]},${q[1]}`;
    const plug = (c) => `<circle class="plug" cx="${c[0]}" cy="${c[1]}" r="9"/><circle class="plug-ring" cx="${c[0]}" cy="${c[1]}" r="5.5"/>`;
    return `<g class="cable ${cls || ''}" style="--c:${colour}"><path class="cable-shadow" d="${path}"/><path class="cable-body" d="${path}"/><path class="cable-shine" d="${path}"/>${plug(p)}${ends > 1 ? plug(q) : ''}</g>`;
  }
  // a cable whose other end is out of sight (on a phone, behind another tab of controls) is drawn
  // as a plug with a short length of cable hanging from it
  function drawCables() {
    const box = bench.getBoundingClientRect();
    svg.setAttribute('width', box.width);
    svg.setAttribute('height', box.height);
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    let out = '';
    patches.forEach((p, inId) => {
      const a = jacks.get(p.out), b = jacks.get(inId), sa = shown(a), sb = shown(b);
      if (sa && sb) out += cable(centre(a, box), centre(b, box), p.colour);
      else if (sa || sb) { const c = centre(sa ? a : b, box); out += cable(c, [c[0] + 14, c[1] + 58], p.colour, 'is-stub', 1); }
    });
    if (carry) out += cable(centre(jacks.get(carry.from), box), [carry.x - box.left, carry.y - box.top], carry.colour, 'is-loose');
    svg.innerHTML = out;
    jacks.forEach((el, id) => el.classList.toggle('is-plugged', patches.has(id) || Array.from(patches.values()).some((p) => p.out === id)));
  }
  // the filter's outputs are worked out from its own input, so a cable from one back into the other
  // would chase its own tail forever. everything else can be plugged into itself, like CAL into CH I
  const loops = (a, b) => unitOf(a) === 'rc' && unitOf(b) === 'rc';
  function connect(a, b, colour) {
    if (io(a) === io(b) || loops(a, b)) {
      tape("That won't go", io(a) === io(b) ? 'Cables run from an output to an input.' : "The filter can't be fed its own output.");
      sfx('unplug');
      return;
    }
    const [o, i] = io(a) === 'out' ? [a, b] : [b, a];
    patches.set(i, { out: o, colour: colour || nextColour() });
    sfx('plug');
    if (OUT[o].live && unitOf(i) === 'spk') tape(label(o) + ' → ' + label(i), "The speaker stays quiet for the microphone and songs, or it would howl. Songs already play through your speakers.");
    else tape(label(o) + ' → ' + label(i), jacks.get(i).dataset.help);
  }
  function unplug(id) {
    if (io(id) === 'in') patches.delete(id);
    else patches.forEach((p, i) => { if (p.out === id) patches.delete(i); });
    sfx('unplug');
    tape('Unplugged ' + label(id), '');
  }
  function plugIn(list) {
    patches.clear();
    colourIdx = 0;
    for (const [o, i] of list) patches.set(i, { out: o, colour: nextColour() });
    drawCables();
  }

  // ---------- the bench: units come out of the store onto the shelf, and go back ----------
  const shelf = $('#osShelf'), store = $('#osStore'), cabinet = $('.os-cabinet');
  const UNITS = new Map($$('.unit', store).map((el) => [el.dataset.unit, { el, name: el.querySelector('.unit-title span').textContent }]));
  const placed = (id) => UNITS.get(id).el.parentNode === shelf;
  const onBench = (jack) => unitOf(jack) === 'scope' || placed(unitOf(jack));
  $('#cabList').innerHTML = Array.from(UNITS, ([id, u]) =>
    `<li><button type="button" class="cab-tile" data-tile="${id}" data-kind="${u.el.classList[1].slice(5)}" aria-pressed="false"><i class="cab-chip" aria-hidden="true"></i><span>${u.name}</span></button></li>`).join('');
  const tiles = new Map($$('.cab-tile').map((el) => [el.dataset.tile, el]));

  function sync() {
    tiles.forEach((el, id) => el.setAttribute('aria-pressed', String(placed(id))));
    shelf.classList.toggle('is-empty', !Array.from(UNITS.keys()).some(placed));
    drawCables();
  }
  function place(id, before) {
    const el = UNITS.get(id).el;
    shelf.insertBefore(el, before === el ? el.nextElementSibling : before || null);
    sync();
  }
  function putAway(id) {
    patches.forEach((p, i) => { if (unitOf(i) === id || unitOf(p.out) === id) patches.delete(i); });
    if (id === 'aud') stopLive();
    store.append(UNITS.get(id).el);
    sync();
    sfx('unplug');
    tape(UNITS.get(id).name + ' is back in the cabinet', 'Its cables came out with it.');
  }
  function setBench(ids) {
    UNITS.forEach((u, id) => { if (!ids.includes(id)) store.append(u.el); });
    if (!ids.includes('aud')) stopLive();
    ids.forEach((id) => shelf.append(UNITS.get(id).el));
    sync();
  }
  function flash(el) {
    el.classList.remove('is-flash');
    void el.offsetWidth;
    el.classList.add('is-flash');
    const r = el.getBoundingClientRect();
    if (r.top > innerHeight - 80 || r.bottom < 120) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
  }
  UNITS.forEach((u, id) => {
    const title = u.el.querySelector('.unit-title');
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'unit-x';
    x.setAttribute('aria-label', 'Put ' + u.name + ' back in the cabinet');
    x.addEventListener('click', () => putAway(id));
    title.append(x);
    title.addEventListener('pointerdown', (e) => {
      if (e.button || e.pointerType === 'touch' || e.target.closest('button')) return;
      startDrag(e, 'unit', id);
    });
  });
  let swallowClick = false;
  tiles.forEach((el, id) => {
    el.addEventListener('pointerdown', (e) => { if (!e.button && e.pointerType !== 'touch') startDrag(e, 'unit', id); });
    el.addEventListener('click', () => {
      if (swallowClick) { swallowClick = false; return; }
      ac();
      if (!placed(id)) { place(id, null); sfx('plug'); tape(UNITS.get(id).name + ' is on the bench', 'Tap any of its sockets to plug it into something.'); }
      flash(UNITS.get(id).el);
    });
    el.addEventListener('mouseenter', () => tape(UNITS.get(id).name, placed(id)
      ? 'On the bench. Drag it back here, or press × on it, to put it away.'
      : 'Drag it onto the bench, or click to put it at the end.'));
  });

  // ---------- dragging: cables, and equipment onto the bench ----------
  // one pointer at a time. it only counts as a drag once it's moved 8px; less is a tap. near the top
  // or bottom of the window the page scrolls by itself, so nobody needs a scroll wheel mid-drag
  const ghost = document.createElement('div');
  ghost.className = 'os-dragchip';
  ghost.hidden = true;
  document.body.append(ghost);
  let drag = null, dropAt = null, scrollLoop = 0;
  function startDrag(e, kind, what) {
    drag = { kind, what, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false };
  }
  function beginDrag() {
    if (drag.kind === 'cable') {
      const id = drag.what;
      if (io(id) === 'in' && patches.has(id)) {
        // pulling a plug out of an input leaves you holding its cable, still plugged in at the other end
        const p = patches.get(id);
        patches.delete(id);
        sfx('unplug');
        carry = { from: p.out, colour: p.colour };
      } else carry = { from: id, colour: nextColour() };
      document.body.dataset.carry = io(carry.from) === 'out' ? 'in' : 'out';
      document.body.dataset.carryUnit = unitOf(carry.from);
      tape('Holding a cable from ' + label(carry.from), 'Drop it on an ' + document.body.dataset.carry + 'put. Near the edge of the window, the page scrolls for you.');
    } else {
      ghost.textContent = UNITS.get(drag.what).name;
      ghost.hidden = false;
      document.body.classList.add('is-moving-unit');
      tape('Moving ' + UNITS.get(drag.what).name, 'Drop it on the bench, or back on the cabinet to put it away.');
    }
    scrollLoop = requestAnimationFrame(edgeScroll);
  }
  function moveDrag() {
    if (drag.kind === 'cable') {
      carry.x = drag.x; carry.y = drag.y;
      drawCables();
      return;
    }
    ghost.style.transform = `translate(${drag.x + 14}px, ${drag.y + 10}px)`;
    if (dropAt) dropAt.el.classList.remove('is-before', 'is-after');
    dropAt = null;
    const hit = document.elementFromPoint(drag.x, drag.y);
    const over = hit && hit.closest('#osShelf .unit');
    if (over) {
      const r = over.getBoundingClientRect();
      dropAt = { el: over, after: drag.x > r.left + r.width / 2 };
      over.classList.add(dropAt.after ? 'is-after' : 'is-before');
    }
    shelf.classList.toggle('is-target', !!(hit && hit.closest('#osShelf')));
    cabinet.classList.toggle('is-target', !!(hit && hit.closest('.os-cabinet')) && placed(drag.what));
  }
  function endDrag(d) {
    cancelAnimationFrame(scrollLoop);
    if (d.kind === 'cable') {
      const hit = document.elementFromPoint(d.x, d.y);
      const el = hit && hit.closest('.jack');
      if (el && el.dataset.jack !== carry.from) connect(carry.from, el.dataset.jack, carry.colour);
      else if (!el) tape('Let go of the cable', 'Tap a socket to choose what to plug it into, or drag between two sockets.');
      carry = null;
      document.body.removeAttribute('data-carry');
      document.body.removeAttribute('data-carry-unit');
      drawCables();
      return;
    }
    const id = d.what, hit = document.elementFromPoint(d.x, d.y);
    if (hit && hit.closest('#osShelf')) {
      const was = placed(id);
      place(id, dropAt ? (dropAt.after ? dropAt.el.nextElementSibling : dropAt.el) : null);
      if (!was) { sfx('plug'); tape(UNITS.get(id).name + ' is on the bench', 'Tap any of its sockets to plug it into something.'); }
    } else if (hit && hit.closest('.os-cabinet') && placed(id)) putAway(id);
    if (dropAt) dropAt.el.classList.remove('is-before', 'is-after');
    dropAt = null;
    ghost.hidden = true;
    shelf.classList.remove('is-target');
    cabinet.classList.remove('is-target');
    document.body.classList.remove('is-moving-unit');
  }
  function edgeScroll() {
    if (!drag || !drag.moved) return;
    const head = $('.site-header').getBoundingClientRect().bottom;
    const tapeR = $('#osTape').getBoundingClientRect();
    const top = Math.max(head, tapeR.top < innerHeight / 2 ? tapeR.bottom : 0) + 50;
    const bottom = (tapeR.top > innerHeight / 2 ? tapeR.top : innerHeight) - 50;
    const v = drag.y < top ? -Math.min(1, (top - drag.y) / 60) * 16 : drag.y > bottom ? Math.min(1, (drag.y - bottom) / 60) * 16 : 0;
    if (v) { window.scrollBy(0, v); moveDrag(); }
    scrollLoop = requestAnimationFrame(edgeScroll);
  }
  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.moved && Math.hypot(drag.x - drag.x0, drag.y - drag.y0) > 8) { drag.moved = true; ac(); beginDrag(); }
    if (drag.moved) { e.preventDefault(); moveDrag(); }
  }, { passive: false });
  document.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.moved) { if (d.kind === 'unit') swallowClick = true; endDrag(d); }
    else if (d.kind === 'cable') openPop(d.what);
  });
  document.addEventListener('pointercancel', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.moved) { d.x = -1; d.y = -1; endDrag(d); }
  });
  window.addEventListener('scroll', () => { if (carry) drawCables(); }, { passive: true });

  jacks.forEach((el, id) => {
    el.addEventListener('pointerdown', (e) => { if (e.button) return; e.preventDefault(); startDrag(e, 'cable', id); });
    el.addEventListener('click', (e) => { if (e.detail === 0) openPop(id); });
    el.addEventListener('mouseenter', () => { if (!carry) tape(label(id), el.dataset.help); });
    el.dataset.name = label(id);
  });
  $$('.banana').forEach((el) => el.addEventListener('mouseenter', () => tape('Component tester sockets', 'Parts clip on here rather than cables. Pick one from the parts drawer, then press CT.')));
  if ('ResizeObserver' in window) new ResizeObserver(drawCables).observe(bench);
  window.addEventListener('resize', drawCables);
  if (document.fonts) document.fonts.ready.then(drawCables);

  // ---------- the "plug into" list ----------
  // tapping a socket lists everything on the bench it could go to, so a cable never needs dragging
  // further than the window. tapping something already plugged in unplugs it
  const pop = $('#osPop'), popBody = $('#osPopBody');
  const sheet = window.matchMedia('(max-width:700px)');
  let popFrom = null;
  function openPop(id) {
    ac();
    popFrom = id;
    const want = io(id) === 'out' ? 'in' : 'out';
    const groups = new Map();
    jacks.forEach((el, j) => {
      if (io(j) !== want || !onBench(j) || loops(id, j)) return;
      const g = unitOf(j);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(j);
    });
    $('#osPopTitle').textContent = label(id);
    $('#osPopSub').textContent = want === 'in' ? 'Plug it into…' : 'Take a signal from…';
    let html = '';
    groups.forEach((list, g) => {
      html += `<h4>${g === 'scope' ? 'Oscilloscope' : UNITS.get(g).name}</h4><div class="pop-items">`;
      for (const j of list) {
        const p = want === 'in' ? patches.get(j) : patches.get(id);
        const on = !!p && (want === 'in' ? p.out === id : p.out === j);
        const note = on ? 'plugged in · tap to unplug' : want === 'in' && p ? 'replaces ' + label(p.out) : '';
        html += `<button type="button" class="pop-item" data-to="${j}" aria-pressed="${on}"><i style="--c:${on ? p.colour : 'transparent'}"></i><span>${label(j)}${note ? `<small>${note}</small>` : ''}</span></button>`;
      }
      html += '</div>';
    });
    if (!groups.size) html = `<p class="pop-none">Nothing on the bench has ${want === 'in' ? 'an input' : 'an output'} for this. Add something from the cabinet.</p>`;
    const plugged = want === 'in' ? Array.from(patches.values()).some((p) => p.out === id) : patches.has(id);
    if (plugged) html += `<button type="button" class="pop-unplug">Unplug ${want === 'in' ? 'every cable from here' : 'this socket'}</button>`;
    popBody.innerHTML = html;
    pop.hidden = false;
    if (sheet.matches) { pop.style.left = ''; pop.style.top = ''; }
    else {
      const r = jacks.get(id).getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
      pop.style.left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + 'px';
      pop.style.top = (r.bottom + 10 + h < innerHeight - 12 ? r.bottom + 10 : Math.max(12, r.top - h - 10)) + 'px';
    }
    const first = popBody.querySelector('button');
    if (first) first.focus({ preventScroll: true });
    tape(label(id), jacks.get(id).dataset.help);
  }
  function closePop(back) {
    if (pop.hidden) return;
    pop.hidden = true;
    if (back && popFrom) jacks.get(popFrom).focus({ preventScroll: true });
    popFrom = null;
  }
  popBody.addEventListener('click', (e) => {
    const item = e.target.closest('.pop-item'), from = popFrom;
    if (item) {
      const j = item.dataset.to;
      if (item.getAttribute('aria-pressed') === 'true') unplug(io(j) === 'in' ? j : from);
      else connect(from, j);
    } else if (e.target.closest('.pop-unplug')) unplug(from);
    else return;
    closePop(true);
    drawCables();
  });
  $('#osPopClose').addEventListener('click', () => closePop(true));
  document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !pop.contains(e.target)) closePop(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(true); });
  window.addEventListener('scroll', () => { if (!sheet.matches) closePop(); }, { passive: true });

  $('#osUnplug').addEventListener('click', () => { patches.clear(); sfx('unplug'); drawCables(); tape('Unplugged everything', 'Tap any socket to plug it in again.'); });
  $('#osReset').addEventListener('click', () => {
    const keep = { power: S.power, sfx: S.sfx, ghost: S.ghost };
    Object.assign(S, DEFAULTS, keep);
    renderAll();
    setBench(START_UNITS);
    plugIn(START_PATCH);
    sfx('button');
    tape('Bench reset', 'Every knob is back where it started, and generator A is plugged into channel I.');
  });

  // ---------- phones: one group of scope controls at a time ----------
  const sc = $('.sc');
  sc.dataset.tab = 'display';
  $$('.sc-tab').forEach((b) => b.addEventListener('click', () => {
    sc.dataset.tab = b.dataset.tab;
    $$('.sc-tab').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    sfx('button');
    drawCables();
  }));

  // ---------- the lab notebook ----------
  // each experiment puts out the equipment its cables need, plus anything listed in units
  const LAB = {
    first: { s: { focus: 0.64, intens: 0.42 }, patch: [['gena', 'ch1']], tip: 'The trace is a little soft and dim. Turn FOCUS and INTENS until it is crisp.' },
    measure: { patch: [['gena', 'ch1'], ['gena', 'cnt']], tip: 'Count the squares: 2 divisions high, 5 across for one cycle. The counter agrees.' },
    trigger: { s: { 'trig.mode': 'NORM', 'trig.level': 0.75 }, patch: [['gena', 'ch1']], tip: 'Nothing on screen: the signal never reaches LEVEL. Turn LEVEL down.' },
    slow: { s: { tdiv: 2, tube: 'P7', 'genA.range': 0, 'genA.dial': 1.5, 'genA.amp': 0.25 }, patch: [['gena', 'ch1']], units: ['tubes'], tip: 'Watch the dot. The long-glow tube keeps the wave behind it.' },
    probe: { s: { 'p1.x10': true, 'p1.comp': 0.2, 'ch1.vdiv': 11, 'ch1.pos': -0.33 }, patch: [['cal', 'ch1']], units: ['probes'], tip: "Turn probe 1's COMP trimmer, on the probes card, until the corners are square." },
    ripple: { s: { 'ch1.vdiv': 2, tdiv: 6, 'ch1.pos': -0.5 }, patch: [['tp4', 'ch1']], tip: 'Press AC, re-centre with Y-POS, then turn VOLTS/DIV clockwise.' },
    rectifier: { s: { vmode: 'DUAL', chop: true, 'ch1.vdiv': 1, 'ch2.vdiv': 1, 'ch1.pos': 0.36, 'ch2.pos': -0.55, tdiv: 6, 'trig.src': 'LINE' }, patch: [['tp1', 'ch1'], ['tp3', 'ch2']], tip: 'The bridge flips every bottom half upwards, so it pulses at 100 Hz.' },
    lissajous: { s: { xy: true, 'genA.amp': 0.15, 'genB.amp': 0.15, 'genB.dial': 1.5 }, patch: [['gena', 'ch1'], ['genb', 'ch2']], tip: "Nudge generator B's FREQUENCY dial, with Shift held for fine." },
    rc: { s: { vmode: 'DUAL', 'genA.wave': 'square', 'genA.amp': 0.1, 'ch1.pos': 0.33, 'ch2.pos': -0.33 }, patch: [['gena', 'ch1'], ['gena', 'rcin'], ['rclp', 'ch2']], tip: "Turn the filter's TIME CONST. knob, or move channel II's cable to HIGH PASS." },
    beats: { s: { vmode: 'ADD', tdiv: 4, 'genA.amp': 0.1, 'genB.amp': 0.1, 'genB.dial': 1.004 }, patch: [['gena', 'ch1'], ['genb', 'ch2'], ['gena', 'spkl'], ['genb', 'spkr']], tip: "Turn generator B's dial with Shift held: the closer the two, the slower the beats." },
    ct: { s: { ct: true, part: 'si' }, patch: [], units: ['parts'], tip: 'Click through the parts drawer and watch the shape change.' },
    vector: { s: { xy: true, 'vec.prog': 1, 'spk.vol': 0.3 }, patch: [['vecx', 'ch1'], ['vecy', 'ch2'], ['vecx', 'spkl'], ['vecy', 'spkr']], tip: 'Turn PICTURE, SPIN and RATE on the vector box.' },
    clock: { s: { xy: true, 'vec.prog': 5, 'vec.size': 0.85, 'vec.rate': 0.25 }, patch: [['vecx', 'ch1'], ['vecy', 'ch2']], tip: 'It keeps real time.' },
    tv: { s: { 'ch1.vdiv': 6, tdiv: 14, 'trig.slope': '-', 'trig.mode': 'NORM', 'trig.level': 0.125, 'ch1.pos': -0.5 }, patch: [['tp9', 'ch1']], tip: 'Try X-MAG and X-POS to look at the colour burst after the sync pulse.' },
    serial: { s: { 'ch1.vdiv': 3, 'trig.slope': '-', 'ch1.pos': -0.2 }, patch: [['tp8', 'ch1']], tip: 'Turn HOLD OFF up slowly, until the picture stops jumping.' },
    mic: { s: { 'ch1.vdiv': 5, tdiv: 8 }, patch: [['audl', 'ch1']], tip: 'Press Microphone on the audio interface.' },
  };
  $$('[data-lab]').forEach((btn) => btn.addEventListener('click', () => {
    const lab = LAB[btn.dataset.lab];
    ac();
    Object.assign(S, DEFAULTS, { power: true, sfx: S.sfx, ghost: S.ghost }, lab.s || {});
    renderAll();
    const units = new Set(lab.units || []);
    for (const pair of lab.patch) for (const j of pair) if (unitOf(j) !== 'scope') units.add(unitOf(j));
    setBench(Array.from(units));
    plugIn(lab.patch);
    sfx('plug');
    tape(btn.closest('.nb-card').querySelector('h3').textContent, lab.tip);
    bench.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }));

  // ---------- the little screen that follows you ----------
  // once the real screen has scrolled away but you're still at the bench, a copy of it floats in the
  // corner, so you can watch the trace while turning a generator's knobs. tap it to go back up
  const mini = $('#osMini'), miniCtx = $('#osMiniCanvas').getContext('2d');
  let screenSeen = true, benchSeen = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((e) => { screenSeen = e[0].isIntersecting; }, { rootMargin: '-90px 0px 0px 0px', threshold: 0.35 }).observe($('#scScreen'));
    new IntersectionObserver((e) => { benchSeen = e[0].isIntersecting; }, { threshold: 0 }).observe(bench);
  }
  mini.addEventListener('click', () => $('#scScreen').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }));

  // ---------- speaker ----------
  // plays its inputs at the audio rate, four samples averaged per output sample to tame the
  // squeals from signals far too high to hear. the microphone and songs never go to it, or it howls
  let spk = null, spkT = 0, spkLevel = 0;
  const audible = (s) => (s && !s.live ? s : null);
  function speaker() {
    const a = ac();
    if (!a || spk || !a.createScriptProcessor) return;
    spk = a.createScriptProcessor(2048, 0, 2);
    spkT = performance.now() / 1000;
    spk.onaudioprocess = (e) => {
      const L = e.outputBuffer.getChannelData(0), R = e.outputBuffer.getChannelData(1);
      const sl = audible(sourceFor('spkl')), sr = audible(sourceFor('spkr'));
      const left = sl || sr, right = sr || sl;
      const gain = S['spk.vol'] * S['spk.vol'] * 0.6, dt = 1 / a.sampleRate;
      let sum = 0;
      for (let i = 0; i < L.length; i++) {
        const t = spkT + i * dt;
        let l = 0, r = 0;
        for (let k = 0; k < 4; k++) {
          const u = t + k * dt / 4;
          if (left) l += left.v(u);
          if (right) r += right.v(u);
        }
        L[i] = Math.tanh(l * gain / 4);
        R[i] = Math.tanh(r * gain / 4);
        sum += L[i] * L[i] + R[i] * R[i];
      }
      spkT += L.length * dt;
      spkLevel = Math.sqrt(sum / L.length / 2);
    };
    spk.connect(a.destination);
  }

  // ---------- counter ----------
  const tubes = $$('.nx');
  let cntNext = 0, gateOff = 0;
  function showCount(f, gate) {
    let unit = 'kHz', v = f / 1000, dec = gate >= 10 ? 4 : gate >= 1 ? 3 : 2;
    if (f >= 1e6) { unit = 'MHz'; v = f / 1e6; dec += 3; }
    let str = v.toFixed(dec);
    let digits = str.replace('.', '');
    if (digits.length > 7) { str = v.toFixed(Math.max(0, dec - (digits.length - 7))); digits = str.replace('.', ''); }
    const point = str.indexOf('.');
    const pad = 7 - digits.length;
    tubes.forEach((tube, i) => {
      const d = i - pad;
      tube.querySelectorAll('b').forEach((b) => b.classList.toggle('on', d >= 0 && b.textContent === digits[d]));
      tube.querySelector('.nx-dp').classList.toggle('on', point > 0 && d === point - 1);
    });
    $('.cnt-unit').textContent = unit;
    $('#cntWindow').setAttribute('aria-label', 'Frequency reading: ' + hertz(f));
  }

  // ---------- the loop ----------
  const scope = new OS.Scope();
  let crt = null;
  try { crt = new window.OscCRT($('#crt')); } catch (e) { $('#scNoGL').hidden = false; }
  const lamps = new Map($$('[data-lamp]').map((el) => [el.dataset.lamp, el]));
  const lamp = (id, on) => lamps.get(id).classList.toggle('on', !!on);
  const cone = $('#spkCone');
  let tPrev = performance.now() / 1000;

  function frame(ms) {
    const t = ms / 1000;
    let dt = t - tPrev;
    if (!(dt > 0) || dt > 0.1) { dt = 1 / 60; tPrev = t - dt; }
    genA.update(t);
    genB.update(t);
    vec.update(t);
    if (live.mode !== 'off') {
      live.an[0].getFloatTimeDomainData(live.buf[0]);
      live.an[1].getFloatTimeDomainData(live.buf[1]);
      live.stamp = t;
    }
    const rin = sourceFor('rcin');
    rc.inV = rin ? (u) => rin.v(u) : () => 0;
    rc.lp = OS.makeLowpass(rin, TAUS[S['rc.tau']], t);
    rc.period = rin ? rin.period : 0;
    rc.freq = rin && rin.freq ? (u, g) => rin.freq(u, g) : () => 0;

    const ch = [OS.probe(sourceFor('ch1'), S['p1.x10'], S['p1.comp'], t), OS.probe(sourceFor('ch2'), S['p2.x10'], S['p2.comp'], t)];
    scope.frame(S, { ch, ext: sourceFor('ext') }, tPrev, t);
    if (crt) crt.draw(scope.seg, scope.n, dt, { sigma: scope.sigma, rot: S.rot * 0.0524, tube: S.tube });
    const floating = !!crt && S.power && !screenSeen && benchSeen;
    if (mini.hidden === floating) mini.hidden = !floating;
    // copied straight after drawing, while the webgl canvas still holds this frame
    if (floating) miniCtx.drawImage(crt.canvas, 0, 0, miniCtx.canvas.width, miniCtx.canvas.height);

    lamp('power', S.power);
    lamp('trig', S.power && scope.trigLit && !S.xy && !S.ct);
    lamp('uncal1', S.power && S['ch1.var'] < 1);
    lamp('uncal2', S.power && S['ch2.var'] < 1);
    lamp('uncalt', S.power && S.tvar < 1);

    if ((patches.has('spkl') || patches.has('spkr')) && S['spk.vol'] > 0) speaker();
    const moving = spk && (patches.has('spkl') || patches.has('spkr'));
    cone.style.transform = moving ? `scale(${1 + Math.min(0.1, spkLevel * 0.25)})` : '';

    if (t >= cntNext) {
      const gate = GATES[S['cnt.gate']], src = sourceFor('cnt');
      const f = src && src.freq ? Math.max(0, src.freq(t, gate)) : 0;
      showCount(Math.floor(f * gate + Math.random()) / gate, gate);
      cntNext = t + gate;
      gateOff = t + Math.min(0.15, gate / 2);
    }
    lamp('gate', t < gateOff);

    tPrev = t;
    requestAnimationFrame(frame);
  }

  renderAll();
  setBench(START_UNITS);
  plugIn(START_PATCH);
  requestAnimationFrame(frame);
  window.OscBench = { S, set, patches, plugIn, scope, frame, setBench, placed };
})();
