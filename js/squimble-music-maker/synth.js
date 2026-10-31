// ================================== squimble music maker: the band ==================================
//
// plays composeSong()'s notes (music.js) with web audio: oscillators, filters and delays wired up for
// every note, live (MusicPlayer) or offline into a wav (renderSong()). most instruments can also play
// recordings of real ones ("recordings"), their synthesised version kept as the fallback. plucked
// strings and struck things are worked out sample by sample once per note and kept (ksBuffer,
// modalBuffer), the only way to make them sound real.
//
// (INSTRUMENTS, every sound the band can play, is in instruments.js)
//
// ---------- the mix ----------
//
// each layer has a channel like a mixing desk strip (its rig, a low cut, an eq for its place, volume,
// pan, and sends to the room, the reverb and the echo). they meet in buildGraph(): drive -> warmth ->
// tape wobble -> glue -> a little mud out -> tape -> volume -> limiter. the reverb is made of decaying
// noise (impulse()), so it needs no recorded room. see "the mixing desk"

const mtof = (midi) => 440 * 2 ** ((midi - 69) / 12);

// a phone or tablet has less time to work each note out: it gets a bigger audio buffer, notes sent
// further ahead and a shorter reverb tail, so it doesn't crackle. (an ipad says it's a mac, but macs
// have no touch screen.) false outside a browser, where the checks load this file
const LIGHT = typeof navigator !== 'undefined' && (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform)));

// waves made from harmonics: how strong the 1st, 2nd, 3rd... harmonics are
const WAVES = {
  glass: [1, 0, 0.35, 0, 0.18, 0, 0.1, 0, 0.05],
  organ: [1, 0.6, 0.4, 0.2, 0, 0.15, 0, 0.1],
  hollow: [1, 0, 0.3, 0, 0.12, 0, 0.06],
  soft: [1, 0.25, 0.08, 0.03],
  // the nes's pulse channels (a square on for a quarter or an eighth of each cycle), undertale's sound,
  // and its triangle, which steps in 16 levels and so buzzes faintly
  pulse25: Array.from({ length: 32 }, (_, i) => Math.sin(Math.PI * (i + 1) * 0.25) / (i + 1)),
  pulse12: Array.from({ length: 32 }, (_, i) => Math.sin(Math.PI * (i + 1) * 0.125) / (i + 1)),
  chiptri: [1, 0.02, -0.11, 0.015, 0.04, 0.012, -0.02, 0.01, 0.012, 0.008],
  // the acoustic leads: each the rough shape of a real instrument's spectrum, with its body
  // (instrumentChain) adding the bumps that stay put. a plain saw was too even, like a keyboard
  // a sax's reed: every harmonic, falling away slowly, so it's thick and a bit honky
  reed: [1, 0.85, 0.72, 0.6, 0.5, 0.42, 0.35, 0.3, 0.25, 0.2, 0.16, 0.13, 0.1, 0.08],
  // brass: the upper harmonics stay strong, which is the "blare" (the filter then decides how much)
  brass: [1, 0.9, 0.82, 0.72, 0.62, 0.55, 0.48, 0.42, 0.36, 0.3, 0.25, 0.2, 0.16, 0.12],
  // a bowed string's slip-stick wave is close to a saw, with a dip where the bow sits on the string
  // (about every 7th harmonic), so it isn't as buzzy as a synth's saw
  bowed: [1, 0.5, 0.33, 0.25, 0.2, 0.15, 0.04, 0.12, 0.1, 0.09, 0.08, 0.07, 0.02, 0.05],
  // a hammond's drawbars pulled out 888000000 plus a little 4' and 2 2/3': the jazz and gospel setting
  drawbar: [1, 1, 0.8, 0.5, 0, 0.35, 0, 0.2],
  // a free reed (harmonica, melodica, harmonium): a narrow pulse, nasal and bright
  freereed: Array.from({ length: 24 }, (_, i) => Math.sin(Math.PI * (i + 1) * 0.3) / (i + 1) ** 0.9),
};

// the formants (resonances) of sung vowels: [hz, level]
const VOWELS = {
  ah: [[800, 1], [1150, 0.5], [2900, 0.2]],
  oo: [[350, 1], [650, 0.45], [2700, 0.08]],
  // a soft, closed "mm-oh", for the soul voice: rounder than ah, warmer than oo
  oh: [[500, 1], [900, 0.4], [2600, 0.1]],
  // a throat singer's: the tongue makes one very narrow resonance, high up, that whistles whichever
  // overtone is nearest it
  khoomei: [[400, 1], [1600, 1.4], [3200, 0.05]],
};

// ---------- shared sounds ----------

// noise, crackle and strings are worked out once per sample rate and kept (AudioBuffers aren't tied to
// a context, so live play and wav renders share them). periodic waves are kept per context
const audioCaches = new Map();
const cacheFor = (rate) => {
  if (!audioCaches.has(rate)) audioCaches.set(rate, { strings: new Map() });
  return audioCaches.get(rate);
};
const waveCaches = new WeakMap();

function setWave(ctx, osc, wave) {
  if (!WAVES[wave]) {
    osc.type = wave;
    return;
  }
  if (!waveCaches.has(ctx)) waveCaches.set(ctx, {});
  const waves = waveCaches.get(ctx);
  if (!waves[wave]) {
    const sines = new Float32Array([0, ...WAVES[wave]]);
    waves[wave] = ctx.createPeriodicWave(new Float32Array(sines.length), sines);
  }
  osc.setPeriodicWave(waves[wave]);
}

function noiseBuffer(rate) {
  const cache = cacheFor(rate);
  if (!cache.noise) {
    cache.noise = new AudioBuffer({ length: rate * 3, sampleRate: rate });
    const data = cache.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return cache.noise;
}

// sparse clicks and pops, for vinyl, fire and rain
function crackleBuffer(rate) {
  const cache = cacheFor(rate);
  if (!cache.crackle) {
    cache.crackle = new AudioBuffer({ length: rate * 4, sampleRate: rate });
    const data = cache.crackle.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      if (Math.random() > 0.00045) continue;
      const size = Math.random() ** 2 * (Math.random() < 0.5 ? -0.9 : 0.9);
      for (let k = 0; k < 40 && i + k < data.length; k++) data[i + k] += size * Math.exp(-k / 5) * (k % 2 ? -0.6 : 1);
    }
  }
  return cache.crackle;
}

// a plucked string by karplus-strong (1983): a burst of noise going round a loop one wave long,
// softened each time round, worked out once per note. soft mixes in the smooth triangle a finger pulls
// a string into, so it starts round rather than with a metallic zing. ring is how much the top end
// softens each time round (0.5 nylon, 0.3 an electric's steel), and buzz flattens the wave past a level,
// a sitar's bridge, fading as the note dies. the end fades so a long note can't click off. the loop is a
// whole number of samples, which put high notes up to 13 cents out: buffer.cents says how far, and the
// pluck engine tunes it back
function ksBuffer(rate, midi, bright, decay, soft, ring = 0.5, buzz = 0, amped = false) {
  const cache = cacheFor(rate).strings;
  const key = `${midi}|${bright.toFixed(2)}|${decay.toFixed(1)}|${soft}|${ring}|${buzz}`;
  if (cache.has(key)) return cache.get(key);
  const f = mtof(midi);
  // the loop filter (weights 1 - ring and ring) adds ring samples of delay to the loop
  const period = Math.max(2, Math.round(rate / f - ring));
  const length = Math.floor(rate * Math.min(amped ? 8 : 5, decay + 0.4));
  const buffer = new AudioBuffer({ length, sampleRate: rate });
  buffer.cents = 1200 * Math.log2((f * (period + ring)) / rate);
  const data = buffer.getChannelData(0);
  const string = new Float32Array(period);
  let last = 0;
  for (let i = 0; i < period; i++) {
    last += (Math.random() * 2 - 1 - last) * bright;
    // pulled aside a third of the way along, and centred on zero
    const x = i / period;
    const pulled = (x < 0.3 ? x / 0.3 : (1 - x) / 0.7) - 0.5;
    string[i] = last * (1 - soft) + pulled * soft;
  }
  // what's kept each time round, so it's 60 dB quieter after decay seconds
  const keep = 0.001 ** (1 / (f * decay));
  const fade = Math.floor(rate * 0.3);
  for (let i = 0, at = 0; i < length; i++) {
    const next = (at + 1) % period;
    data[i] = string[at] * Math.min(1, (length - i) / fade);
    let value = (string[at] * (1 - ring) + string[next] * ring) * keep;
    if (buzz && value > buzz) value = buzz + (value - buzz) * 0.25;
    string[at] = value;
    at = next;
  }
  // a few hundred strings (each up to 8 seconds of samples) is plenty to keep
  if (cache.size > 300) cache.clear();
  cache.set(key, buffer);
  return buffer;
}

// ---------- struck things: modes ----------
//
// a struck bar, tine, bell or piano string rings at a handful of pitches at once (its modes), each dying
// at its own rate, the top first. worked out once per note and kept. an instrument says:
//   modes    [ratio to the note, level, seconds to fade 60 db, hard (how much harder playing brings it out)]
//   strike   [level, hz, seconds]: the mallet or hammer, a short burst of darkened noise
//   unison   cents apart of a second string (a piano's), beating slowly: its shimmer
//   stretch  how much sharper each overtone is than a whole multiple (stiff strings)
//   track    how much faster high notes die than low ones
// level (0 to 3) is how hard it's hit, so loud notes are brighter rather than just louder
function modalBuffer(rate, midi, inst, level) {
  const cache = cacheFor(rate);
  if (!cache.modal) cache.modal = new WeakMap();
  if (!cache.modal.has(inst)) cache.modal.set(inst, new Map());
  const kept = cache.modal.get(inst);
  const key = `${midi}|${level}`;
  if (kept.has(key)) return kept.get(key);
  const f = mtof(midi);
  const slower = (262 / f) ** (inst.track ?? 0.5);
  const longest = Math.max(...inst.modes.map(([, , decay]) => decay)) * Math.min(2, slower);
  const length = Math.floor(rate * Math.min(7, longest + 0.2));
  const buffer = new AudioBuffer({ length, sampleRate: rate });
  const data = buffer.getChannelData(0);
  // every mode's level adds up to 1 at the start, so instruments with more modes aren't louder
  const total = inst.modes.reduce((sum, [, amount]) => sum + amount, 0) * (inst.unison ? 2 : 1);
  const ring = (hz, amount, decay) => {
    if (hz > rate * 0.45 || amount <= 0) return;
    const w = (2 * Math.PI * hz) / rate;
    const r = 0.001 ** (1 / (decay * rate));
    const a = 2 * r * Math.cos(w);
    const b = r * r;
    const end = Math.min(length, Math.floor(rate * decay * 1.2));
    let y1 = (amount / total) * r * Math.sin(w);
    let y2 = 0;
    data[1] += y1;
    for (let i = 2; i < end; i++) {
      const y = a * y1 - b * y2;
      data[i] += y;
      y2 = y1;
      y1 = y;
    }
  };
  const hardness = level / 2;
  for (const [ratio, amount, decay, hard = 0] of inst.modes) {
    const hz = f * ratio * Math.sqrt(1 + (inst.stretch || 0) * ratio * ratio);
    // higher modes of high notes die faster still
    const fades = decay * Math.min(2, slower) * (ratio > 1.5 ? Math.min(1, (2000 / hz) ** 0.3) : 1);
    const loud = amount * hardness ** hard;
    ring(hz, loud, fades);
    if (inst.unison && ratio < 6) ring(hz * 2 ** (inst.unison / 1200), loud, fades * 0.9);
  }
  if (inst.strike) {
    const [amount, hz, seconds] = inst.strike;
    const smooth = Math.min(1, (2 * Math.PI * hz) / rate);
    let low = 0;
    for (let i = 0; i < Math.min(length, rate * seconds * 3); i++) {
      low += (Math.random() * 2 - 1 - low) * smooth;
      data[i] += low * amount * (0.5 + hardness * 0.5) * Math.exp(-i / (rate * seconds));
    }
  }
  // the very end fades, so nothing clicks off if it's still ringing
  const fade = Math.floor(rate * 0.2);
  for (let i = Math.max(0, length - fade); i < length; i++) data[i] *= (length - i) / fade;
  if (kept.size > 200) kept.clear();
  kept.set(key, buffer);
  return buffer;
}

// eight seconds of slow, smooth wander between -1 and 1, for a held note's drift: random points a
// quarter of a second apart joined by curves, each note playing it from its own spot and speed
function driftBuffer(rate) {
  const cache = cacheFor(rate);
  if (!cache.drift) {
    const seconds = 8;
    cache.drift = new AudioBuffer({ length: rate * seconds, sampleRate: rate });
    const data = cache.drift.getChannelData(0);
    const points = Array.from({ length: seconds * 4 + 1 }, () => Math.random() * 2 - 1);
    points[points.length - 1] = points[0];
    for (let i = 0; i < data.length; i++) {
      const at = (i / rate) * 4;
      const k = Math.floor(at);
      const x = at - k;
      const s = x * x * (3 - 2 * x);
      data[i] = points[k] + (points[Math.min(k + 1, points.length - 1)] - points[k]) * s;
    }
  }
  return cache.drift;
}

function noiseSource(ctx, when, end) {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx.sampleRate);
  source.loop = true;
  source.start(when, Math.random() * 2.5);
  source.stop(end);
  return source;
}

// a slow wave added to a setting (a filter's frequency, a gain), for wobbles and swells
function lfo(ctx, rate, depth, param, when, end, type = 'sine') {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = rate;
  const amount = ctx.createGain();
  amount.gain.value = depth;
  osc.connect(amount).connect(param);
  osc.start(when);
  osc.stop(end);
  amount.osc = osc;
  return amount;
}

// ---------- tonal instruments ----------

// the part every tonal note shares: the volume envelope, then tremolo and the filter in front of it.
// returns where the engine plugs its sound in, and when everything can stop. again: seconds until the
// same note's struck again on the layer (restrikes)
function voiceChain(ctx, out, inst, tone, f, when, dur, vel, note = {}, again = Infinity) {
  const { pump, slur, swell } = note;
  const [attackTime, decay, sustain, releaseTime] = inst.env;
  // never more than half the note, or a short chord peaks after its beat. a slurred note arrives at once
  let attack = Math.max(0.002, Math.min(attackTime * tone.attack, dur * 0.5, slur ? 0.015 : Infinity));
  let release = Math.max(0.03, releaseTime * tone.release);
  // a reversed note swells over all of itself, a pumped one (ducking under the kick) over half, and both
  // let go at once
  if (inst.reverse || pump) {
    attack = dur * (inst.reverse ? 1 : 0.55);
    release = 0.05;
  }
  const peak = inst.gain * vel;
  const amp = ctx.createGain();
  if (inst.reverse) {
    // a fading note played backwards: hardly there at first, then rushing up at the end
    amp.gain.setValueAtTime(peak * 0.001, when);
    amp.gain.exponentialRampToValueAtTime(peak, when + attack);
  } else {
    amp.gain.setValueAtTime(0, when);
    amp.gain.linearRampToValueAtTime(peak, when + attack);
  }
  if (sustain < 1 && !pump) amp.gain.setTargetAtTime(peak * sustain, when + attack, Math.max(0.001, decay / 3));
  // a note shorter than its attack is held until the attack's done, so it can't click off mid ramp
  const off = when + Math.max(dur, attack);
  let end = off + release * 1.4 + 0.05;
  // struck again before it's rung away, it fades out as the new one comes in, as a string or key does.
  // otherwise a fast pad pattern piled up dozens of copies of each note until the song crackled and stopped
  const cut = when + Math.max(attack, again);
  const fade = Math.max(0.01, attack / 3);
  const restruck = cut + fade * 6 < end;
  if (!restruck || off < cut) amp.gain.setTargetAtTime(0, off, release / 4);
  if (restruck) {
    amp.gain.setTargetAtTime(0, cut, fade);
    end = cut + fade * 6;
  }
  // swell: a note that grows (1) or dies away (-1) over its length, as a player shapes a long note
  if (swell) {
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(swell > 0 ? 0.3 : 1, when);
    shape.gain.exponentialRampToValueAtTime(swell > 0 ? 1 : 0.22, when + Math.max(0.05, dur * 0.9));
    amp.connect(shape).connect(out);
  } else amp.connect(out);
  let input = amp;
  if (inst.tremolo) {
    const tremolo = ctx.createGain();
    tremolo.gain.value = 1 - inst.tremolo.depth / 2;
    lfo(ctx, inst.tremolo.rate, inst.tremolo.depth / 2, tremolo.gain, when, end);
    tremolo.connect(input);
    input = tremolo;
  }
  if (inst.filter) {
    const { freq, q = 0.7, env = 1, attack: opens = 0.01, decay: closes = 0.3, track = 0, lfo: sweep } = inst.filter;
    const filter = ctx.createBiquadFilter();
    filter.Q.value = q;
    const base = Math.min(16000, freq * tone.bright * (f / 262) ** track * (inst.kind === 'sample' ? recordedHardness(vel) : hardness(vel)));
    filter.frequency.setValueAtTime(base, when);
    if (sweep) lfo(ctx, sweep[0], base * sweep[1], filter.frequency, when, end);
    // backwards, it opens up as the note swells instead of closing as it fades
    if (inst.reverse) filter.frequency.exponentialRampToValueAtTime(Math.min(18000, base * env), when + attack);
    else if (env !== 1) {
      filter.frequency.linearRampToValueAtTime(Math.min(18000, base * env), when + opens);
      filter.frequency.setTargetAtTime(base, when + opens, closes);
    }
    filter.connect(input);
    input = filter;
  }
  return { input, when, end, vel, dur, slur: !!slur };
}

// how much brighter a note is for being played harder, 1 at a middling 0.75: every real instrument is
const hardness = (vel) => 0.6 + 0.55 * vel;
// the same for a recording, steeper, as a sampler's velocity is: most folders have one loudness a note,
// so a soft note needs darkening (1 as recorded at 0.75, under half at 0.4)
const recordedHardness = (vel) => Math.min(1.4, Math.max(0.25, (vel / 0.75) ** 1.3));

function vibrato(ctx, inst, tone, when, end) {
  const depth = (inst.vibrato?.depth || 0) + tone.vibrato;
  if (depth <= 0) return null;
  return shaking(ctx, depth, inst.vibrato?.rate || 5, inst.vibrato?.delay ?? 0.3, when, end);
}
// a vibrato: depth cents either way, rate a second, after delay seconds, each note's a little different.
// it grows in over a few tenths and speeds up as it settles, as a player's does, so short notes don't
// wobble. with no delay it's an effect (a tape's warble), there at once
function shaking(ctx, depth, rate, delay, when, end) {
  const amount = ctx.createGain();
  const grow = delay > 0 ? 0.4 : 0.01;
  const speed = rate * (0.92 + Math.random() * 0.16);
  amount.gain.setValueAtTime(0, when + delay);
  amount.gain.linearRampToValueAtTime(depth, when + delay + grow);
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(delay > 0 ? speed * 0.8 : speed, when + delay);
  osc.frequency.linearRampToValueAtTime(speed, when + delay + grow * 1.5);
  osc.connect(amount);
  osc.start(when);
  osc.stop(end);
  return amount;
}

// drift: a held note's slow wander, cents either way (driftBuffer), from its own spot each call
function drifting(ctx, cents, when, end) {
  const source = ctx.createBufferSource();
  source.buffer = driftBuffer(ctx.sampleRate);
  source.loop = true;
  source.playbackRate.value = 0.7 + Math.random() * 0.6;
  const amount = ctx.createGain();
  amount.gain.value = cents;
  source.connect(amount);
  source.start(when, Math.random() * 8);
  source.stop(end);
  return amount;
}

// an ensemble's drift: one wander a note shared out to each player a different way and amount, so they
// drift apart (a wander each sounded no different and cost far more). returns player i's share, or null
function ensembleDrift(ctx, inst, voice) {
  if (!inst.ensemble || !inst.drift) return null;
  const wander = drifting(ctx, inst.drift, voice.when, voice.end);
  return (i) => {
    const share = ctx.createGain();
    share.gain.value = (i % 2 ? 1 : -1) * (1 - 0.25 * (i >> 1));
    wander.connect(share);
    return share;
  };
}

// everything that moves a note's pitch while it plays, as nodes for each oscillator's detune (cents):
// the instrument's vibrato and drift, and the note's own moves:
//   note.bend   pins [beats from the note's start, semitones, shape], like beepbox's: [[0, 0], [0.5, 2]]
//               slides up a tone over half a beat; [[0, -2], [0.1, 0]] bends up onto the note. shape is
//               how it moves from the pin before (CURVES): 0 straight, 1 smooth (a singer), 2 settling
//               (a fretless), 3 speeding up (a fall). a real slide is fast in the middle, slow onto the pitch
//   note.shake  a vibrato of its own, cents either way
// spb is seconds per beat, so the pins land in time at any tempo
const CURVES = [(x) => x, (x) => x * x * (3 - 2 * x), (x) => 1 - (1 - x) ** 3, (x) => x ** 3];
function pitchMods(ctx, inst, tone, note, when, end, spb) {
  const mods = [];
  const wobble = vibrato(ctx, inst, tone, when, end);
  if (wobble) mods.push(wobble);
  if (note.shake) mods.push(shaking(ctx, note.shake, 5.6, Math.min(0.25, (note.dur || 1) * spb * 0.3), when, end));
  // an ensemble drifts player by player instead (the sub and choir engines)
  if (inst.drift && !inst.ensemble) mods.push(drifting(ctx, inst.drift, when, end));
  if (note.bend?.length) {
    const bend = ctx.createConstantSource();
    bend.offset.setValueAtTime(note.bend[0][1] * 100, when);
    note.bend.forEach(([at, semitones, curve = 0], i) => {
      const [from, was] = note.bend[i - 1] || note.bend[0];
      // a curve is drawn as eight short straight lines, which web audio's ramps can do
      const pieces = curve && CURVES[curve] && at > from ? 8 : 1;
      for (let k = 1; k <= pieces; k++) {
        const x = k / pieces;
        const y = pieces > 1 ? CURVES[curve](x) : 1;
        bend.offset.linearRampToValueAtTime((was + (semitones - was) * y) * 100, when + Math.max(0, from + (at - from) * x) * spb);
      }
    });
    bend.start(when);
    bend.stop(end);
    mods.push(bend);
  }
  return mods;
}
const bendWith = (mods, param) => { for (const mod of mods) mod.connect(param); };

// a little random tuning per note, more with the layer's detune
const scatter = (tone) => (Math.random() * 2 - 1) * (1.5 + tone.detune * 0.35);

// the curves fuzz (tanh) and crush (a few steps of loudness) bend a note's wave through, made once
const curves = new Map();
function shapeCurve(kind, amount) {
  const key = `${kind}|${amount}`;
  if (!curves.has(key)) {
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = kind === 'fuzz' ? Math.tanh(amount * x) / Math.tanh(amount) : Math.round(x * amount) / amount;
    }
    curves.set(key, curve);
  }
  return curves.get(key);
}

// a plucked note's string (ksBuffer), here so the player can work it out ahead of time (warmNote)
function pluckString(rate, inst, tone, midi, vel, muted) {
  // high strings ring for less time than low ones, unless a rig sustains them (a distorted guitar)
  const tilt = inst.amp?.sustain ? 0.2 : 0.5;
  const decay = muted ? 0.2 : inst.decay * Math.min(2, tone.release) * Math.min(1, (330 / mtof(midi)) ** tilt);
  // (brightness to tenths, so few strings are kept per note)
  const bright = Math.round(Math.min(0.95, inst.bright * tone.bright * hardness(vel) * (muted ? 0.6 : 1)) * 10) / 10;
  return ksBuffer(rate, midi, Math.max(0.1, bright), decay, inst.soft || 0, inst.ring ?? 0.5, inst.buzz || 0, !!inst.amp);
}
// how hard a struck note's hit (0 to 3), picking which of modalBuffer's brightnesses it plays
const modalLevel = (vel, tone) => Math.max(0, Math.min(3, Math.round(vel * hardness(vel) * 3 * Math.min(1.4, tone.bright))));

// each engine makes one note into voice.input (voiceChain), bending everything with voice.pitch
// (pitchMods), so any instrument can slide
const ENGINES = {
  sub(ctx, voice, inst, tone, f) {
    const off = scatter(tone);
    // (mixed down first, so it hits the curve as hard however many oscillators it stacks)
    let into = voice.input;
    if (inst.fuzz || inst.crush) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = shapeCurve(inst.fuzz ? 'fuzz' : 'crush', inst.fuzz || inst.crush);
      shaper.connect(voice.input);
      into = ctx.createGain();
      into.gain.value = 1 / inst.osc.reduce((sum, [, , , level = 1]) => sum + level, 0);
      into.connect(shaper);
    }
    // pads and drones spread their oscillators left and right: one point sounded like a keyboard
    const wide = (inst.family === 'pad' || inst.family === 'drone') && inst.osc.length > 1;
    const spread = ensembleDrift(ctx, inst, voice);
    inst.osc.forEach(([wave, detune = 0, octave = 0, level = 1], i) => {
      const osc = ctx.createOscillator();
      setWave(ctx, osc, wave);
      osc.frequency.value = f * 2 ** octave;
      // the layer's detune spreads the oscillators apart, for a wider, more chorused sound
      const cents = detune + off + (i ? (i % 2 ? 1 : -1) * tone.detune : 0);
      // scoop: a blown or bowed note starts flat and slides up, as players do (not quick or slurred notes)
      const scoop = voice.dur > 0.2 && !voice.slur ? inst.scoop || 0 : 0;
      osc.detune.setValueAtTime(cents - scoop, voice.when);
      if (scoop) osc.detune.linearRampToValueAtTime(cents, voice.when + 0.07);
      bendWith(voice.pitch, osc.detune);
      if (spread) spread(i).connect(osc.detune);
      const gain = ctx.createGain();
      gain.gain.value = level;
      let out = gain;
      if (wide && i) {
        out = ctx.createStereoPanner();
        out.pan.value = i % 2 ? -0.6 : 0.6;
        gain.connect(out);
      }
      osc.connect(gain);
      out.connect(into);
      osc.start(voice.when);
      osc.stop(voice.end);
    });
    if (inst.breath) {
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = Math.min(12000, f * 2);
      band.Q.value = 2;
      const gain = ctx.createGain();
      gain.gain.value = inst.breath;
      noiseSource(ctx, voice.when, voice.end).connect(band).connect(gain).connect(voice.input);
    }
    // chiff: a flute's puff of air (or an organ's key click), noise just above the note, gone at once
    if (inst.chiff && !voice.slur) {
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = Math.min(12000, f * 3);
      band.Q.value = 1.5;
      const puff = hitEnvelope(ctx, voice.when, inst.chiff * hardness(voice.vel), 0.004, 0.05);
      noiseSource(ctx, voice.when, voice.when + 0.15).connect(band).connect(puff).connect(voice.input);
    }
  },

  fm(ctx, voice, inst, tone, f) {
    const { when, end } = voice;
    const carrier = ctx.createOscillator();
    carrier.frequency.value = f;
    carrier.detune.value = scatter(tone);
    const modulator = ctx.createOscillator();
    // the browser can't go above half its sample rate, and nobody could hear it anyway
    modulator.frequency.value = Math.min(20000, f * inst.ratio);
    const depth = ctx.createGain();
    const index = inst.index * f * Math.min(4, tone.bright) * hardness(voice.vel);
    depth.gain.setValueAtTime(index, when);
    depth.gain.setTargetAtTime(index * (inst.sustainIndex ?? 0.1), when, inst.indexDecay ?? 0.3);
    modulator.connect(depth).connect(carrier.frequency);
    // the modulator bends with the carrier, so a slide keeps the same tone all the way
    bendWith(voice.pitch, carrier.detune);
    bendWith(voice.pitch, modulator.detune);
    carrier.connect(voice.input);
    for (const osc of [carrier, modulator]) {
      osc.start(when);
      osc.stop(end);
    }
    for (const [ratio, level, fade] of inst.partials || []) {
      if (f * ratio > 18000) continue;
      const partial = ctx.createOscillator();
      partial.frequency.value = f * ratio;
      bendWith(voice.pitch, partial.detune);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(level, when);
      gain.gain.setTargetAtTime(0, when, fade);
      partial.connect(gain).connect(voice.input);
      partial.start(when);
      partial.stop(end);
    }
  },

  pluck(ctx, voice, inst, tone, f, midi, note = {}) {
    const { when, end } = voice;
    const source = ctx.createBufferSource();
    // a palm mute: the string dies in a moment and loses its top (through high gain, the metal chug)
    const muted = !!note.mute;
    source.buffer = pluckString(ctx.sampleRate, inst, tone, midi, voice.vel, muted);
    let into = voice.input;
    if (muted) {
      into = ctx.createBiquadFilter();
      into.frequency.value = 900;
      into.Q.value = 0.5;
      into.connect(voice.input);
    }
    source.connect(into);
    const strings = [source];
    // sustain: a steady tone swelling in under the string as it dies (an ebow, or an amp feeding back)
    if (inst.sustain && !muted) {
      const held = ctx.createOscillator();
      held.type = 'sawtooth';
      held.frequency.value = f;
      const level = ctx.createGain();
      level.gain.setValueAtTime(0, when);
      level.gain.linearRampToValueAtTime(inst.sustain * 0.25, when + Math.min(0.4, voice.dur));
      held.connect(level).connect(into);
      strings.push(held);
    }
    // tuned back to true (buffer.cents), plus a little random. twang: a string starts a few cents sharp
    // from the pluck and settles (a banjo most)
    const off = scatter(tone) - (source.buffer.cents || 0);
    const twang = muted ? 0 : (inst.twang || 0) * hardness(voice.vel);
    for (const string of strings) {
      const tuned = string === source ? off : off + (source.buffer.cents || 0);
      string.detune.setValueAtTime(tuned + twang, when);
      if (twang) string.detune.setTargetAtTime(tuned, when, 0.03);
      bendWith(voice.pitch, string.detune);
      string.start(when);
      string.stop(end);
    }
  },

  // struck things (modalBuffer): a buffer per note, how hard it's hit picking one of four brightnesses
  modal(ctx, voice, inst, tone, f, midi) {
    const source = ctx.createBufferSource();
    source.buffer = modalBuffer(ctx.sampleRate, midi, inst, modalLevel(voice.vel, tone));
    source.detune.value = scatter(tone) * 0.5;
    bendWith(voice.pitch, source.detune);
    source.connect(voice.input);
    source.start(voice.when);
    source.stop(voice.end);
  },

  choir(ctx, voice, inst, tone, f) {
    const mix = ctx.createGain();
    // rasp: the buzz clipped before the vowel shapes it, so the voice cracks like it's shouting
    let into = mix;
    if (inst.rasp) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = shapeCurve('fuzz', inst.rasp);
      into = ctx.createGain();
      into.connect(shaper).connect(mix);
    }
    for (const [freq, level] of VOWELS[inst.vowel]) {
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = freq * Math.min(1.3, tone.bright ** 0.2);
      band.Q.value = freq / 110;
      const gain = ctx.createGain();
      gain.gain.value = level;
      mix.connect(band).connect(gain).connect(voice.input);
    }
    // breath: air through the same vowel, for a voice sung close and soft
    if (inst.breath) {
      const air = ctx.createGain();
      air.gain.value = inst.breath;
      noiseSource(ctx, voice.when, voice.end).connect(air).connect(mix);
    }
    // three singers unless it says, never quite together
    const spread = ensembleDrift(ctx, inst, voice);
    for (const [i, detune] of (inst.singers || [-9, 0, 8]).entries()) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      osc.detune.value = detune * (1 + tone.detune / 15) + scatter(tone);
      bendWith(voice.pitch, osc.detune);
      if (spread) spread(i).connect(osc.detune);
      osc.connect(into);
      osc.start(voice.when);
      osc.stop(voice.end);
    }
  },
};

// ---------- recordings ----------
//
// most instruments can play recordings of real ones. a recording is a buffer of one note played through
// voiceChain like a plucked string, so slides, vibrato, the room and the rigs all still work.
//   samples   a folder in assets/squimble-music-maker/samples/ with a few notes and an index.json
//             (tools/build-samples.js makes them). the nearest note is played, retuned
//   sampled   the recorded version's settings: gain (matched to the synthesised one), name (for the
//             page), env or filter if the instrument's don't suit it, reach (semitones past its lowest
//             and highest notes it still plays, 7 unless it says), backwards to play each note reversed
//             (the reversed piano: the recording swells by itself, so it isn't swelled again)
//   more      other recordings to choose between, { folder: settings } (layer.recording in music.js)
// a kit's slot can have hit: 'folder/name', level, and at (the pitch it was recorded at, for retuning).
// the synthesised version plays until the files load, if they can't (a page opened from a file), for a
// note far outside what was recorded, and with RECORDINGS.on false, so a song never waits or goes silent
const RECORDINGS = { on: true, root: 'assets/squimble-music-maker/samples/', sets: new Map() };

// starts loading a folder (once) and returns a promise of it. a set is { notes, hits, low, high, loop }
function loadSamples(folder) {
  if (!RECORDINGS.sets.has(folder)) {
    const set = { ready: null };
    const get = async (file) => {
      const response = await fetch(`${RECORDINGS.root}${folder}/${file}`);
      if (!response.ok) throw new Error(`${response.status} loading ${folder}/${file}`);
      return response;
    };
    set.loading = (async () => {
      const index = await (await get('index.json')).json();
      // decoded once, at 44.1 khz: AudioBuffers aren't tied to a context, so the live player and wav
      // renders share them
      const decoder = new OfflineAudioContext(1, 1, 44100);
      const notes = await Promise.all(index.notes.map(async (note) => {
        const buffer = await decoder.decodeAudioData(await (await get(note.file)).arrayBuffer());
        return { ...note, buffer, loop: index.loop ? loopNote(buffer) : null };
      }));
      const hits = {};
      for (const note of notes) if (note.hit) (hits[note.hit] ||= []).push(note);
      const midis = notes.filter((note) => note.midi !== undefined).map((note) => note.midi);
      // recorded moves from note to note (a singer's legato, singMove), packed several to a file
      const files = [...new Set((index.moves || []).map((move) => move.file))];
      const packs = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await decoder.decodeAudioData(await (await get(file)).arrayBuffer())])));
      const moves = (index.moves || []).map((move) => ({ ...move, buffer: packs[move.file] }));
      set.ready = { notes, hits, moves, loop: !!index.loop, low: Math.min(...midis), high: Math.max(...midis) };
    })().catch((error) => {
      set.failed = true;
      console.warn(`recordings: ${folder} didn't load, so it stays synthesised (${error.message})`);
    });
    RECORDINGS.sets.set(folder, set);
  }
  return RECORDINGS.sets.get(folder).loading;
}

// an instrument's recordings, [[folder, settings], ...], the one it plays unless told otherwise first
const recordingsOf = (inst) => (inst?.samples ? [[inst.samples, inst.sampled || {}], ...Object.entries(inst.more || {})] : []);
// the folder a layer plays: the one it chose, if the instrument has it
const recordingFolder = (inst, choice) => (recordingsOf(inst).find(([folder]) => folder === choice) || recordingsOf(inst)[0] || [])[0];
// the folders an instrument (and its kit's slots) needs, for the recording chosen
const sampleFolders = (inst, choice) => [recordingFolder(inst, choice), ...(inst?.slots || []).map((slot) => slot.hit?.split('/')[0])].filter(Boolean);
// starts loading everything a song plays, for awaiting before a render
function songSamples(song) {
  if (!RECORDINGS.on) return Promise.resolve();
  const folders = new Set(song.layers.flatMap((layer) => [
    ...sampleFolders(INSTRUMENTS[layer.instrument], layer.recording),
    ...(layer.with || []).map((one) => recordingFolder(INSTRUMENTS[one.instrument], one.recording)).filter(Boolean),
  ]));
  return Promise.all([...folders].map(loadSamples));
}
const sampleSet = (folder) => (RECORDINGS.on ? RECORDINGS.sets.get(folder)?.ready : null);

// the recorded version of an instrument, or null to play the synthesised one: its settings without the
// ones that would fight the recording (an almost open filter that still darkens soft notes, no vibrato,
// drift or body: the real ones are recorded). struck and plucked notes die away on their own
const recordedViews = new WeakMap();
function recorded(inst, midi, choice) {
  // (scenery plays its recordings its own way, playTexture)
  if (inst?.kind === 'texture') return null;
  const folder = recordingFolder(inst, choice);
  const set = folder && sampleSet(folder);
  const settings = recordingsOf(inst).find(([one]) => one === folder)?.[1] || {};
  // more than a fifth past the recordings and a note sounds stretched: those few stay synthesised
  const reach = settings.reach ?? 7;
  if (!set || (midi !== undefined && (midi < set.low - reach || midi > set.high + reach))) return null;
  if (!recordedViews.has(inst)) recordedViews.set(inst, new Map());
  const views = recordedViews.get(inst);
  if (!views.has(folder)) {
    const env = set.loop ? inst.env : [0.002, 0.1, 1, inst.env[3]];
    views.set(folder, { ...inst, kind: 'sample', env, filter: { freq: 12000, q: 0.5 }, vibrato: undefined, drift: 0, body: undefined, ...settings, samples: folder });
  }
  return views.get(folder);
}

// the steady middle of a held note, looped for as long as it's held: [start, end] in seconds, or null
// for a note too short. the end is crossfaded into just before the start, so it can't click. worked out
// when the note loads
function loopNote(buffer) {
  const data = buffer.getChannelData(0);
  const rate = buffer.sampleRate;
  const hop = Math.round(rate * 0.01);
  const levels = [];
  for (let at = 0; at + hop <= data.length; at += hop) {
    let sum = 0;
    for (let i = at; i < at + hop; i++) sum += data[i] * data[i];
    levels.push(Math.sqrt(sum / hop));
  }
  const peak = Math.max(...levels);
  // from once the attack's settled to before it starts dying away
  const settled = levels.findIndex((level) => level > peak * 0.7) + 5;
  let last = levels.length - 1;
  while (last > settled && levels[last] < peak * 0.5) last--;
  const start = (settled + Math.round((last - settled) * 0.3)) * hop;
  const end = last * hop;
  if (end - start < rate * 0.25) return null;
  const fade = Math.min(Math.round(rate * 0.12), (end - start) >> 1, start);
  for (let i = 0; i < fade; i++) {
    const t = (i / fade) * Math.PI / 2;
    data[end - fade + i] = data[end - fade + i] * Math.cos(t) + data[start - fade + i] * Math.sin(t);
  }
  return [start / rate, end / rate];
}

// the recording to play: the nearest note, at the nearest loudness. takes of the same note and
// loudness (round robins) are picked between at random, so a drum hit twice isn't the same twice
function pickTake(takes, midi, vel) {
  let best = Infinity;
  let found = [];
  for (const take of takes) {
    const score = Math.abs((take.midi ?? midi) - midi) + 4 * Math.abs((take.vel ?? vel) - vel);
    if (score < best - 1e-6) {
      best = score;
      found = [take];
    } else if (score < best + 1e-6) found.push(take);
  }
  return found[Math.floor(Math.random() * found.length)];
}

// a recording backwards (a reversed piano), made once
const reversals = new WeakMap();
function reversed(buffer) {
  if (!reversals.has(buffer)) {
    const copy = new AudioBuffer({ length: buffer.length, sampleRate: buffer.sampleRate });
    copy.getChannelData(0).set(buffer.getChannelData(0).slice().reverse());
    reversals.set(buffer, copy);
  }
  return reversals.get(buffer);
}

ENGINES.sample = (ctx, voice, inst, tone, f, midi, note = {}) => {
  const take = pickTake(sampleSet(inst.samples).notes, midi, voice.vel);
  const source = ctx.createBufferSource();
  source.buffer = inst.backwards ? reversed(take.buffer) : take.buffer;
  if (take.loop) {
    source.loop = true;
    [source.loopStart, source.loopEnd] = take.loop;
  }
  source.detune.value = (midi - take.midi) * 100 + (take.tune || 0) + scatter(tone) * 0.5 + (note.cents || 0);
  bendWith(voice.pitch, source.detune);
  let into = voice.input;
  // a palm mute: the string's top taken off and the note stopped short (see the pluck engine)
  if (note.mute) {
    const stop = new GainNode(ctx, { gain: 1 });
    stop.gain.setTargetAtTime(0, voice.when + 0.04, 0.06);
    into = new BiquadFilterNode(ctx, { frequency: 900, Q: 0.5 });
    into.connect(stop).connect(voice.input);
  }
  source.connect(into);
  // legato: a slurred note starts in its recording's steady middle, past the attack, with the last
  // note's release overlapping it, so a line goes note to note without a puff or scrape on each.
  // backwards (sampled.backwards), it's lined up so the strike lands as the note ends: started into the
  // tail for a short note, started late for one longer than the recording
  if (inst.backwards) source.start(voice.when + Math.max(0, voice.dur - take.buffer.duration), Math.max(0, take.buffer.duration - voice.dur));
  else source.start(voice.when, note.slur && take.loop ? take.loop[0] : 0);
  source.stop(voice.end);
};

// a kit's slot from a recording (slot.hit), or false if it isn't loaded, retuned from slot.at into the
// song's key. the kit's decay still ends a long ring
function playHit(ctx, out, when, vel, slot, p) {
  const [folder, name] = slot.hit.split('/');
  const takes = sampleSet(folder)?.hits[name];
  if (!takes) return false;
  const take = pickTake(takes, 0, vel);
  const source = ctx.createBufferSource();
  source.buffer = take.buffer;
  if (slot.at) source.playbackRate.value = Math.min(2, Math.max(0.5, p.tune / slot.at));
  const level = ctx.createGain();
  level.gain.setValueAtTime((slot.level ?? 1) * (0.45 + 0.55 * vel), when);
  level.gain.setTargetAtTime(0, when + Math.max(0.08, p.decay * 2), Math.max(0.05, p.decay));
  source.connect(level).connect(out);
  source.start(when);
  source.stop(when + Math.min(take.buffer.duration, Math.max(0.08, p.decay * 2) + Math.max(0.05, p.decay) * 6) + 0.05);
  return true;
}

// ---------- drums ----------

function hitEnvelope(ctx, when, peak, attack, decay) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(peak, when + attack);
  gain.gain.setTargetAtTime(0, when + attack, decay / 4);
  return gain;
}
function noiseHit(ctx, out, when, peak, type, freq, q, attack, decay) {
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = Math.min(16000, freq);
  filter.Q.value = q;
  noiseSource(ctx, when, when + attack + decay * 1.6 + 0.05).connect(filter).connect(hitEnvelope(ctx, when, peak, attack, decay)).connect(out);
}
// a pitched hit that drops from one frequency to another, like a drum skin settling
function toneHit(ctx, out, when, peak, from, to, sweep, decay, wave = 'sine') {
  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.setValueAtTime(from, when);
  osc.frequency.exponentialRampToValueAtTime(to, when + sweep);
  osc.connect(hitEnvelope(ctx, when, peak, 0.002, decay)).connect(out);
  osc.start(when);
  osc.stop(when + decay * 1.6 + 0.05);
}

// a cymbal the way the 808 made one: six squares at clashing pitches filtered to their shimmer, and a
// little noise (noise alone is hiss, not metal). tone is where the filters sit
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];
function metal(ctx, out, when, peak, tone, decay) {
  const end = when + decay * 1.6 + 0.05;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = Math.min(15000, tone * 1.3);
  band.Q.value = 0.8;
  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = Math.min(14000, tone);
  band.connect(high).connect(hitEnvelope(ctx, when, peak, 0.001, decay)).connect(out);
  for (const freq of METAL) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq * (tone / 7000);
    const gain = ctx.createGain();
    gain.gain.value = 0.35;
    osc.connect(gain).connect(band);
    osc.start(when);
    osc.stop(end);
  }
  noiseHit(ctx, out, when, peak * 0.3, 'highpass', tone, 0.7, 0.001, decay * 0.7);
}

// each gets the slot's settings (p): tune (hz), tone (a filter's hz), decay (seconds), gain, and step
// (one step of the groove, in seconds)
const heartGap = (p) => {
  let gap = p.step || 0.24;
  while (gap < 0.15) gap *= 2;
  return gap;
};
const DRUMS = {
  kick(ctx, out, when, vel, p) {
    toneHit(ctx, out, when, vel * p.gain, p.tune * 3.5, p.tune, 0.06, p.decay);
    // the beater's click, so it's heard on small speakers that can't play the low thump. a metal kick
    // clicks hard (click), or double kick blurs into a rumble
    noiseHit(ctx, out, when, vel * p.gain * (p.click ?? 0.2), 'lowpass', 3500, 0.7, 0.001, 0.012);
  },
  // lub-dub. the dub lands a whole number of groove steps later, so it's on the grid like everything
  // else: it used to be a fixed 0.24 seconds, which fell between the steps at most tempos
  heart(ctx, out, when, vel, p) {
    DRUMS.kick(ctx, out, when, vel, p);
    DRUMS.kick(ctx, out, when + heartGap(p), vel * 0.6, p);
  },
  taiko(ctx, out, when, vel, p) {
    toneHit(ctx, out, when, vel * p.gain, p.tune * 1.8, p.tune, 0.12, p.decay);
    noiseHit(ctx, out, when, vel * p.gain * 0.5, 'lowpass', 300, 0.7, 0.002, 0.15);
  },
  tom: (ctx, out, when, vel, p) => toneHit(ctx, out, when, vel * p.gain, p.tune * 1.5, p.tune, 0.12, p.decay),
  // the wires (a wide band of noise), their sizzle, and the drum's body
  snare(ctx, out, when, vel, p) {
    noiseHit(ctx, out, when, vel * p.gain, 'bandpass', p.tone, 0.4, 0.001, p.decay);
    noiseHit(ctx, out, when, vel * p.gain * 0.45, 'highpass', 5000, 0.7, 0.001, p.decay * 0.5);
    toneHit(ctx, out, when, vel * p.gain * 0.6, p.tune * 1.28, p.tune, 0.04, 0.1, 'triangle');
  },
  hat: (ctx, out, when, vel, p) => metal(ctx, out, when, vel * p.gain, p.tone, p.decay),
  // a crash: the metal ringing on for a second or two over a burst of bright noise, which is most of a
  // real crash's wash
  crash(ctx, out, when, vel, p) {
    metal(ctx, out, when, vel * p.gain * 0.6, p.tone, p.decay);
    noiseHit(ctx, out, when, vel * p.gain, 'highpass', p.tone * 0.7, 0.5, 0.002, p.decay * 0.8);
  },
  // a ride: a quieter shimmer, and the ping of the stick on it, which is in key (tune) with its octave
  ride(ctx, out, when, vel, p) {
    metal(ctx, out, when, vel * p.gain * 0.55, p.tone, p.decay);
    toneHit(ctx, out, when, vel * p.gain * 0.3, p.tune, p.tune, 0.01, 0.3);
    toneHit(ctx, out, when, vel * p.gain * 0.12, p.tune * 2, p.tune * 2, 0.01, 0.15);
  },
  shaker: (ctx, out, when, vel, p) => noiseHit(ctx, out, when, vel * p.gain, 'bandpass', p.tone, 1.2, 0.012, p.decay),
  brush: (ctx, out, when, vel, p) => noiseHit(ctx, out, when, vel * p.gain, 'bandpass', p.tone, 0.6, 0.025, p.decay),
  rim(ctx, out, when, vel, p) {
    toneHit(ctx, out, when, vel * p.gain, p.tune, p.tune * 0.95, 0.01, p.decay);
    noiseHit(ctx, out, when, vel * p.gain * 0.4, 'bandpass', 3000, 1, 0.001, 0.02);
  },
  tick(ctx, out, when, vel, p) {
    toneHit(ctx, out, when, vel * p.gain, p.tune, p.tune, 0.01, p.decay);
    toneHit(ctx, out, when, vel * p.gain * 0.4, p.tune * 2.6, p.tune * 2.6, 0.01, p.decay * 0.4);
  },
  // the chip kit's: a square wave dropping in pitch, and plain noise cut off above tone
  blip: (ctx, out, when, vel, p) => toneHit(ctx, out, when, vel * p.gain, p.tune * 4, p.tune, 0.05, p.decay, 'square'),
  noise: (ctx, out, when, vel, p) => noiseHit(ctx, out, when, vel * p.gain, 'lowpass', p.tone, 0.5, 0.001, p.decay),
  // three quick bursts, like hands not quite together
  clap(ctx, out, when, vel, p) {
    for (let i = 0; i < 3; i++) noiseHit(ctx, out, when + i * 0.011, vel * p.gain * (i === 2 ? 1 : 0.6), 'bandpass', p.tone, 1, 0.001, i === 2 ? p.decay : 0.01);
  },
  // a conga: a hand on a tall drum, a round tone dropping a little in pitch, and the slap of the palm
  conga(ctx, out, when, vel, p) {
    toneHit(ctx, out, when, vel * p.gain, p.tune * 1.15, p.tune, 0.03, p.decay);
    toneHit(ctx, out, when, vel * p.gain * 0.25, p.tune * 2.3, p.tune * 2.2, 0.02, p.decay * 0.4);
    noiseHit(ctx, out, when, vel * p.gain * 0.3, 'bandpass', 2500, 1, 0.001, 0.02);
  },
  // the tabla's dayan: tuned to the song's home note (tuneDrum in music.js), and the black spot on its
  // skin (the syahi) makes its overtones nearly whole multiples, so it rings like a note, not a thud
  dayan(ctx, out, when, vel, p) {
    for (const [ratio, level] of [[1, 1], [2, 0.5], [3, 0.3], [4, 0.15]]) toneHit(ctx, out, when, vel * p.gain * level, p.tune * ratio * 1.01, p.tune * ratio, 0.02, p.decay / ratio ** 0.5);
    noiseHit(ctx, out, when, vel * p.gain * 0.35, 'bandpass', 3500, 1.2, 0.001, 0.015);
  },
  // the tabla's bayan: a low boom whose pitch the heel of the hand pushes up as it rings ("ge")
  bayan(ctx, out, when, vel, p) {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(p.tune * 0.9, when);
    osc.frequency.linearRampToValueAtTime(p.tune * 1.35, when + p.decay * 0.6);
    osc.connect(hitEnvelope(ctx, when, vel * p.gain, 0.003, p.decay)).connect(out);
    osc.start(when);
    osc.stop(when + p.decay * 1.6 + 0.05);
    noiseHit(ctx, out, when, vel * p.gain * 0.2, 'lowpass', 600, 0.7, 0.002, 0.03);
  },
  // a flat slap on a drum, all click and no ring (the tabla's "ka")
  slap: (ctx, out, when, vel, p) => noiseHit(ctx, out, when, vel * p.gain, 'bandpass', p.tone, 1.5, 0.001, p.decay),
  // the 808's cowbell: two squares about a sixth apart through a narrow filter
  cowbell(ctx, out, when, vel, p) {
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = p.tune * 1.5;
    band.Q.value = 3;
    band.connect(hitEnvelope(ctx, when, vel * p.gain, 0.001, p.decay)).connect(out);
    for (const ratio of [1, 1.48]) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = p.tune * ratio;
      osc.connect(band);
      osc.start(when);
      osc.stop(when + p.decay * 1.6 + 0.05);
    }
  },
  // a gong: out of tune overtones that bloom a moment after it's struck (the high ones last) and ring
  // for seconds, the pitch sagging a little as it goes. the temple kit crashes on one
  gong(ctx, out, when, vel, p) {
    const end = when + p.decay * 1.6 + 0.1;
    for (const [ratio, level, bloom] of [[1, 1, 0.02], [1.48, 0.6, 0.15], [1.93, 0.45, 0.3], [2.47, 0.35, 0.4], [3.2, 0.25, 0.5], [4.1, 0.15, 0.6]]) {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(p.tune * ratio, when);
      osc.frequency.linearRampToValueAtTime(p.tune * ratio * 0.985, end);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(vel * p.gain * level * 0.3, when + bloom);
      gain.gain.setTargetAtTime(0, when + bloom, p.decay / 4);
      osc.connect(gain).connect(out);
      osc.start(when);
      osc.stop(end);
    }
    noiseHit(ctx, out, when, vel * p.gain * 0.25, 'lowpass', 1500, 0.7, 0.003, 0.3);
  },
};

// ---------- textures ----------

// each makes its sound from when to end into out. bright is the layer's brightness, and the pitched
// ones (hum, crickets, drips, birds) take the home note from midi and keep to its home note, fifth or
// fourth, which are in every key. most happen now and then (moments(), swells()), with quiet between

// times for something that happens now and then: the first soon after the start, so trying a texture
// out on the page is heard, then a gap of low to high seconds after each
function moments(when, end, low, high) {
  const out = [];
  for (let t = when + 0.3 + Math.random() * 1.2; t < end; t += low + Math.random() * (high - low)) out.push(t);
  return out;
}
// one swell (a gust, a wave, a far off roll) on a gain that otherwise sits silent
function swell(param, at, rise, fall, peak) {
  param.setValueAtTime(0, at);
  param.linearRampToValueAtTime(peak, at + rise);
  param.linearRampToValueAtTime(0, at + rise + fall);
}
// swells of rise and fall seconds (each a [low, high] range) with still gaps between them, on noise
// through a filter. boost makes up for a filter that leaves little through
function swells(ctx, out, when, end, filter, rise, fall, gap, boost = 1) {
  const level = ctx.createGain();
  level.gain.value = 0;
  for (let t = when + 0.3 + Math.random(); t < end;) {
    const up = rise[0] + Math.random() * (rise[1] - rise[0]);
    const down = fall[0] + Math.random() * (fall[1] - fall[0]);
    swell(level.gain, t, up, down, (0.5 + Math.random() * 0.5) * boost);
    t += up + down + gap[0] + Math.random() * (gap[1] - gap[0]);
  }
  noiseSource(ctx, when, end).connect(filter).connect(level).connect(out);
}
const pickOne = (list) => list[Math.floor(Math.random() * list.length)];
// somewhere left or right, for one event: a bird calls from the left, the next drip falls to the
// right, the way a real place sounds. every event from one spot sounded like a speaker in the room
function spot(ctx, out) {
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.random() * 1.6 - 0.8;
  pan.connect(out);
  return pan;
}

// tiny bubbles for the brook, short sines jumping up as they burst, worked out once per sample rate so
// a brook isn't thousands of oscillators
function bubbleBuffer(rate) {
  const cache = cacheFor(rate);
  if (!cache.bubbles) {
    cache.bubbles = new AudioBuffer({ length: rate * 5, sampleRate: rate });
    const data = cache.bubbles.getChannelData(0);
    for (let n = 0; n < 160; n++) {
      const at = Math.floor(Math.random() * (data.length - rate * 0.1));
      const f = 450 + Math.random() ** 2 * 1400;
      const length = Math.floor(rate * (0.015 + Math.random() * 0.035));
      const size = 0.2 + Math.random() * 0.8;
      let phase = 0;
      for (let i = 0; i < length; i++) {
        phase += (2 * Math.PI * f * (1 + (0.6 * i) / length)) / rate;
        data[at + i] += Math.sin(phase) * size * Math.sin((Math.PI * i) / length) ** 2;
      }
    }
  }
  return cache.bubbles;
}
// the key's home note in the octave starting at bottom, for the pitched textures
const homeAbove = (bottom, midi) => bottom + ((((midi - bottom) % 12) + 12) % 12);

const TEXTURES = {
  // gusts of four to ten seconds, with still air for four to fourteen between them
  wind(ctx, out, when, end, bright) {
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 450 * bright;
    band.Q.value = 1.2;
    lfo(ctx, 0.07, 280 * bright, band.frequency, when, end);
    swells(ctx, out, when, end, band, [1.5, 4], [2.5, 6], [4, 14]);
  },
  rain(ctx, out, when, end, bright) {
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 1200;
    const low = ctx.createBiquadFilter();
    low.frequency.value = Math.min(9000, 5000 * bright);
    const level = ctx.createGain();
    level.gain.value = 0.35;
    noiseSource(ctx, when, end).connect(high).connect(low).connect(level).connect(out);
    TEXTURES.drops(ctx, out, when, end, 2500, 0.8);
  },
  // crackle through a filter, for rain drops, vinyl and fire
  drops(ctx, out, when, end, freq, level, type = 'highpass') {
    const source = ctx.createBufferSource();
    source.buffer = crackleBuffer(ctx.sampleRate);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = level;
    source.connect(filter).connect(gain).connect(out);
    source.start(when, Math.random() * 3);
    source.stop(end);
  },
  // waves rolling in and drawing back, with a calm moment between some of them
  ocean(ctx, out, when, end, bright) {
    const low = ctx.createBiquadFilter();
    low.frequency.value = 700 * bright;
    swells(ctx, out, when, end, low, [2, 4], [3, 5.5], [0, 5]);
  },
  vinyl(ctx, out, when, end, bright) {
    TEXTURES.drops(ctx, out, when, end, 1500 * bright, 1);
    const hiss = ctx.createBiquadFilter();
    hiss.type = 'bandpass';
    hiss.frequency.value = 4000;
    hiss.Q.value = 0.5;
    const level = ctx.createGain();
    level.gain.value = 0.05;
    noiseSource(ctx, when, end).connect(hiss).connect(level).connect(out);
  },
  fire(ctx, out, when, end, bright) {
    TEXTURES.drops(ctx, out, when, end, 3500 * bright, 1.3, 'lowpass');
    const roar = ctx.createBiquadFilter();
    roar.frequency.value = 400 * bright;
    // the roar sits well under the crackle: it was a steady hiss loud enough to cover the tune
    const flicker = ctx.createGain();
    flicker.gain.value = 0.5;
    lfo(ctx, 0.6, 0.25, flicker.gain, when, end);
    noiseSource(ctx, when, end).connect(roar).connect(flicker).connect(out);
  },
  // far off rolls, like thunder or something heavy moving underground, with long quiet between
  rumble(ctx, out, when, end, bright) {
    const low = ctx.createBiquadFilter();
    low.frequency.value = 80 * bright;
    low.Q.value = 2;
    lfo(ctx, 0.05, 25 * bright, low.frequency, when, end);
    swells(ctx, out, when, end, low, [2, 4], [4, 7], [5, 15], 5);
  },
  // two crickets: a high tone chopped fast (the chirp, by a triangle so it doesn't click), switched on
  // and off slowly, on the home note and the note above
  crickets(ctx, out, when, end, bright, midi = 60) {
    const home = 101 + ((((midi - 101) % 12) + 12) % 12);
    for (const [note, chirp, rest] of [[home, 32, 0.9], [home + 2, 27, 0.63]]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = mtof(note);
      // these swing -1 to 1, so they sit at half with half either way: off to fully on
      const chop = ctx.createGain();
      chop.gain.value = 0.5;
      lfo(ctx, chirp, 0.5, chop.gain, when, end, 'triangle');
      const pulse = ctx.createGain();
      pulse.gain.value = 0.15;
      lfo(ctx, rest, 0.15, pulse.gain, when, end, 'square');
      osc.connect(chop).connect(pulse).connect(out);
      osc.start(when);
      osc.stop(end);
    }
  },
  // mains hum and its beating overtones, like a fridge in an empty room. it hums the song's home note:
  // it was always an a, which droned a semitone or a tritone off in most keys
  hum(ctx, out, when, end, bright, midi = 60) {
    const low = ctx.createBiquadFilter();
    low.frequency.value = 500 * bright;
    low.connect(out);
    const home = mtof(28 + ((((midi - 28) % 12) + 12) % 12));
    for (const [ratio, level] of [[1, 0.5], [1.0064, 0.4], [2.004, 0.25], [3.002, 0.12]]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = home * ratio;
      const gain = ctx.createGain();
      gain.gain.value = level;
      osc.connect(gain).connect(low);
      osc.start(when);
      osc.stop(end);
    }
  },
  // water dripping into a cave pool every few seconds: bubbles jumping up as they burst, on the home
  // note or fifth
  drips(ctx, out, when, end, bright, midi = 60) {
    const home = homeAbove(84, midi);
    const drop = (at, f, level, where = spot(ctx, out)) => {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(f * 0.6, at);
      osc.frequency.exponentialRampToValueAtTime(f, at + 0.035);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(level, at + 0.004);
      gain.gain.setTargetAtTime(0, at + 0.004, 0.045);
      osc.connect(gain).connect(where);
      osc.start(at);
      osc.stop(at + 0.4);
    };
    for (const at of moments(when, end, 1.5, 7)) {
      const f = mtof(home + pickOne([0, 7, 12, 7, 0, -5]));
      const where = spot(ctx, out);
      drop(at, f, 0.6 + Math.random() * 0.4, where);
      if (Math.random() < 0.25) drop(at + 0.12 + Math.random() * 0.25, f * pickOne([1, 1.5, 0.75]), 0.4, where);
    }
  },
  // a geiger counter somewhere near: a few clicks bunched together, then nothing for a while (fallout)
  geiger(ctx, out, when, end) {
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 2500;
    high.connect(spot(ctx, out));
    const click = (at, level) => {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(level, at);
      gain.gain.setTargetAtTime(0, at + 0.001, 0.0015);
      noiseSource(ctx, at, at + 0.012).connect(gain).connect(high);
    };
    for (const at of moments(when, end, 0.8, 5)) {
      for (let k = 0, t = at; k < 1 + Math.floor(Math.random() ** 2 * 7); k++, t += 0.01 + Math.random() ** 2 * 0.15) click(t, 0.4 + Math.random() * 0.6);
    }
  },
  // a bird singing a few notes now and then, quick slides up or down onto the key's notes, high up
  birds(ctx, out, when, end, bright, midi = 60) {
    const home = homeAbove(93, midi);
    for (const at of moments(when, end, 5, 14)) {
      const call = pickOne(['up', 'down', 'trill']);
      const count = call === 'trill' ? 5 + Math.floor(Math.random() * 5) : 2 + Math.floor(Math.random() * 4);
      const where = spot(ctx, out);
      let t = at;
      for (let k = 0; k < count; k++) {
        const f = mtof(home + pickOne([0, 5, 7, 12]));
        const length = call === 'trill' ? 0.045 : 0.08 + Math.random() * 0.1;
        const osc = ctx.createOscillator();
        osc.frequency.setValueAtTime(call === 'down' ? f * 1.25 : f * 0.8, t);
        osc.frequency.exponentialRampToValueAtTime(f, t + length * 0.8);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.5 + Math.random() * 0.5, t + 0.01);
        gain.gain.linearRampToValueAtTime(0, t + length);
        osc.connect(gain).connect(where);
        osc.start(t);
        osc.stop(t + length + 0.02);
        t += length + (call === 'trill' ? 0.02 : 0.05 + Math.random() * 0.12);
      }
    }
  },
  // metal settling far off: a low buzz through a narrow sliding resonance, catching and slipping
  creaks(ctx, out, when, end, bright) {
    for (const at of moments(when, end, 8, 20)) {
      const length = 1.5 + Math.random() * 2.5;
      const stop = at + length + 0.05;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const pitch = 30 + Math.random() * 30;
      osc.frequency.setValueAtTime(pitch, at);
      osc.frequency.linearRampToValueAtTime(pitch * (0.8 + Math.random() * 0.5), at + length);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = 9;
      const ring = (400 + Math.random() * 500) * Math.min(1.5, bright);
      band.frequency.setValueAtTime(ring, at);
      band.frequency.linearRampToValueAtTime(ring * (0.7 + Math.random() * 0.6), at + length);
      const catches = ctx.createGain();
      catches.gain.value = 0.5;
      lfo(ctx, 9 + Math.random() * 11, 0.5, catches.gain, at, stop, 'square');
      const level = ctx.createGain();
      level.gain.value = 0;
      swell(level.gain, at, length * 0.4, length * 0.6, 1);
      osc.connect(band).connect(catches).connect(level).connect(spot(ctx, out));
      osc.start(at);
      osc.stop(stop);
    }
  },
  // a brook: bubbles (bubbleBuffer) on two loops at different speeds over a faint low wash, swelling
  // and settling slowly. steady, but never a hiss
  stream(ctx, out, when, end, bright) {
    const level = ctx.createGain();
    level.gain.value = 0.7;
    lfo(ctx, 0.05 + Math.random() * 0.03, 0.3, level.gain, when, end);
    level.connect(out);
    for (const [speed, side] of [[1, -0.35], [1.27, 0.35]]) {
      const source = ctx.createBufferSource();
      source.buffer = bubbleBuffer(ctx.sampleRate);
      source.loop = true;
      source.playbackRate.value = speed * Math.min(1.3, bright ** 0.5);
      const pan = ctx.createStereoPanner();
      pan.pan.value = side;
      source.connect(pan).connect(level);
      source.start(when, Math.random() * 4);
      source.stop(end);
    }
    const wash = ctx.createBiquadFilter();
    wash.frequency.value = 500 * bright;
    const quiet = ctx.createGain();
    quiet.gain.value = 0.08;
    noiseSource(ctx, when, end).connect(wash).connect(quiet).connect(level);
  },
  // a breeze through leaves now and then: a rustle rising and falling over a second or two, the
  // crackle sped up into a dry patter over a hush of air, with long quiet between
  leaves(ctx, out, when, end, bright) {
    for (const at of moments(when, end, 6, 16)) {
      const rise = 0.4 + Math.random() * 0.8;
      const fall = 0.8 + Math.random() * 1.5;
      const stop = at + rise + fall + 0.05;
      const level = ctx.createGain();
      level.gain.value = 0;
      swell(level.gain, at, rise, fall, 0.6 + Math.random() * 0.4);
      level.connect(spot(ctx, out));
      const patter = ctx.createBufferSource();
      patter.buffer = crackleBuffer(ctx.sampleRate);
      patter.loop = true;
      patter.playbackRate.value = 2.5 + Math.random();
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 3200 * Math.min(1.3, bright);
      band.Q.value = 0.6;
      patter.connect(band).connect(level);
      patter.start(at, Math.random() * 3);
      patter.stop(stop);
      const air = ctx.createBiquadFilter();
      air.type = 'highpass';
      air.frequency.value = 2500;
      const hush = ctx.createGain();
      hush.gain.value = 0.12;
      noiseSource(ctx, at, stop).connect(air).connect(hush).connect(level);
    }
  },
  // frogs by a pond: now and then one croaks a few times, a low buzz rattled fast (the ribbit) through
  // a nasal resonance, on the home note or fifth, and sometimes another answers from somewhere else
  frogs(ctx, out, when, end, bright, midi = 60) {
    const croaks = (at, where) => {
      const f = mtof(homeAbove(43, midi) + pickOne([0, 7, 12]));
      const count = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < count; k++) {
        const t = at + k * (0.35 + Math.random() * 0.25);
        const length = 0.12 + Math.random() * 0.12;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.linearRampToValueAtTime(f * 0.92, t + length);
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 700 * Math.min(1.3, bright);
        band.Q.value = 4;
        const rattle = ctx.createGain();
        rattle.gain.value = 0.5;
        lfo(ctx, 28 + Math.random() * 10, 0.5, rattle.gain, t, t + length + 0.05, 'square');
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(1, t + 0.02);
        gain.gain.linearRampToValueAtTime(0, t + length);
        osc.connect(band).connect(rattle).connect(gain).connect(where);
        osc.start(t);
        osc.stop(t + length + 0.05);
      }
    };
    for (const at of moments(when, end, 5, 16)) {
      croaks(at, spot(ctx, out));
      if (Math.random() < 0.35) croaks(at + 1.5 + Math.random() * 1.5, spot(ctx, out));
    }
  },
  // an owl far off: hoo, then often hoo-hoo, a soft whistle sliding down onto the home note or fifth,
  // with a long quiet between
  owl(ctx, out, when, end, bright, midi = 60) {
    const hoot = (t, f, length, where) => {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(f * 1.04, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + length * 0.4);
      osc.frequency.exponentialRampToValueAtTime(f * 0.97, t + length);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(1, t + length * 0.3);
      gain.gain.linearRampToValueAtTime(0, t + length);
      osc.connect(gain).connect(where);
      osc.start(t);
      osc.stop(t + length + 0.05);
    };
    for (const at of moments(when, end, 14, 32)) {
      const where = spot(ctx, out);
      const f = mtof(homeAbove(60, midi) + pickOne([0, 0, 7]));
      hoot(at, f, 0.5, where);
      if (Math.random() < 0.7) {
        hoot(at + 0.9, f, 0.22, where);
        hoot(at + 1.2, f, 0.45, where);
      }
    }
  },
  // wind chimes now and then: thin bells on the home note, fourth or fifth, with a harmonic overtone
  // (3) so they never clash with the chords
  chimes(ctx, out, when, end, bright, midi = 60) {
    const home = homeAbove(84, midi);
    for (const at of moments(when, end, 6, 18)) {
      const where = spot(ctx, out);
      const count = 1 + Math.floor(Math.random() * 4);
      for (let k = 0, t = at; k < count; k++, t += 0.15 + Math.random() * 0.5) {
        const f = mtof(home + pickOne([0, 5, 7, 12]));
        const length = 1.5 + Math.random() * 1.5;
        const strength = 0.5 + Math.random() * 0.5;
        for (const [ratio, level] of [[1, 1], [3, 0.2]]) {
          const osc = ctx.createOscillator();
          osc.frequency.value = f * ratio;
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(level * strength, t + 0.003);
          gain.gain.setTargetAtTime(0, t + 0.003, length / (ratio > 1 ? 8 : 4));
          osc.connect(gain).connect(where);
          osc.start(t);
          osc.stop(t + length + 0.1);
        }
      }
    }
  },
  // guitar feedback now and then: an amp singing a high home note or fifth on its own, wavering, then
  // let go
  feedback(ctx, out, when, end, bright, midi = 60) {
    const home = homeAbove(76, midi);
    const fuzz = ctx.createWaveShaper();
    fuzz.curve = shapeCurve('fuzz', 3);
    const tone = ctx.createBiquadFilter();
    tone.frequency.value = 3500 * Math.min(1.3, bright);
    fuzz.connect(tone).connect(out);
    for (const at of moments(when, end, 10, 26)) {
      const length = 2 + Math.random() * 3;
      const stop = at + length + 0.05;
      const osc = ctx.createOscillator();
      osc.frequency.value = mtof(home + pickOne([0, 7, 12, 0]));
      const shake = ctx.createOscillator();
      shake.frequency.value = 5 + Math.random();
      const waver = ctx.createGain();
      waver.gain.setValueAtTime(0, at);
      waver.gain.linearRampToValueAtTime(12, at + length * 0.7);
      shake.connect(waver).connect(osc.detune);
      const level = ctx.createGain();
      level.gain.value = 0;
      swell(level.gain, at, length * 0.75, length * 0.25, 0.9);
      osc.connect(level).connect(spot(ctx, fuzz));
      for (const one of [osc, shake]) {
        one.start(at);
        one.stop(stop);
      }
    }
  },

  // a few bubbles rising past now and then: quick sines sliding up as they burst (bubbleBuffer's, one
  // at a time), bunched together, from somewhere left or right
  bubbles(ctx, out, when, end) {
    for (const at of moments(when, end, 3, 10)) {
      const where = spot(ctx, out);
      const count = 3 + Math.floor(Math.random() * 10);
      for (let k = 0, t = at; k < count; k++, t += 0.03 + Math.random() ** 2 * 0.25) {
        const f = 300 + Math.random() ** 2 * 1200;
        const length = 0.02 + Math.random() * 0.05;
        const osc = ctx.createOscillator();
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.exponentialRampToValueAtTime(f * 1.7, t + length);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.3 + Math.random() * 0.7, t + length * 0.3);
        gain.gain.linearRampToValueAtTime(0, t + length);
        osc.connect(gain).connect(where);
        osc.start(t);
        osc.stop(t + length + 0.02);
      }
    }
  },
  // a whale far off: a long, low moan rising and falling between the home note and the notes round it,
  // wavering, with a long quiet between calls
  whale(ctx, out, when, end, bright, midi = 60) {
    const home = homeAbove(43, midi);
    for (const at of moments(when, end, 14, 30)) {
      const length = 2 + Math.random() * 3;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const path = [0, pickOne([5, 7, 12]), pickOne([0, 7, -5])];
      path.forEach((step, i) => osc.frequency[i ? 'exponentialRampToValueAtTime' : 'setValueAtTime'](mtof(home + step), at + (length * i) / (path.length - 1)));
      const shake = ctx.createOscillator();
      shake.frequency.value = 5 + Math.random() * 3;
      const depth = ctx.createGain();
      depth.gain.value = 25;
      shake.connect(depth).connect(osc.detune);
      const low = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 900, Q: 2 });
      const level = ctx.createGain();
      level.gain.value = 0;
      swell(level.gain, at, length * 0.35, length * 0.65, 1);
      osc.connect(low).connect(level).connect(spot(ctx, out));
      for (const one of [osc, shake]) {
        one.start(at);
        one.stop(at + length + 0.05);
      }
    }
  },
  // an aztec death whistle: air forced through a clay chamber, so it screams. a burst of noise through
  // two narrow resonances that rise and fall, like a voice, now and then and far off
  deathWhistle(ctx, out, when, end) {
    for (const at of moments(when, end, 14, 32)) {
      const length = 1.5 + Math.random() * 2;
      const where = spot(ctx, out);
      const level = ctx.createGain();
      level.gain.value = 0;
      swell(level.gain, at, length * 0.25, length * 0.75, 1);
      level.connect(where);
      const peak = 1100 + Math.random() * 500;
      for (const ratio of [1, 2.3]) {
        const band = new BiquadFilterNode(ctx, { type: 'bandpass', Q: 18 });
        band.frequency.setValueAtTime(peak * ratio * 0.7, at);
        band.frequency.linearRampToValueAtTime(peak * ratio, at + length * 0.3);
        band.frequency.linearRampToValueAtTime(peak * ratio * 0.6, at + length);
        lfo(ctx, 9 + Math.random() * 6, 40 * ratio, band.frequency, at, at + length + 0.05);
        noiseSource(ctx, at, at + length + 0.05).connect(band).connect(level);
      }
    }
  },
  // a conch shell blown as a horn: a call on the home note, scooping up onto it, swelling and dying
  conch(ctx, out, when, end, bright, midi = 60) {
    for (const at of moments(when, end, 16, 34)) {
      const length = 1.5 + Math.random() * 2.5;
      const f = mtof(homeAbove(50, midi));
      const osc = ctx.createOscillator();
      setWave(ctx, osc, 'brass');
      osc.frequency.setValueAtTime(f * 0.94, at);
      osc.frequency.exponentialRampToValueAtTime(f, at + 0.25);
      const low = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1200, Q: 1 });
      const level = ctx.createGain();
      level.gain.value = 0;
      swell(level.gain, at, 0.3, length, 1);
      osc.connect(low).connect(level).connect(spot(ctx, out));
      osc.start(at);
      osc.stop(at + length + 0.4);
    }
  },
  // a rainstick turned over: seeds pattering down through the cactus spines, a few seconds of tiny
  // clicks that thin out as it empties
  rainstick(ctx, out, when, end) {
    for (const at of moments(when, end, 10, 24)) {
      const length = 2.5 + Math.random() * 2.5;
      const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 3500 + Math.random() * 2000, Q: 1.5 });
      const patter = ctx.createGain();
      patter.gain.value = 0.5;
      lfo(ctx, 35 + Math.random() * 20, 0.5, patter.gain, at, at + length + 0.05, 'square');
      const level = ctx.createGain();
      level.gain.value = 0;
      swell(level.gain, at, 0.4, length - 0.4, 1);
      noiseSource(ctx, at, at + length + 0.05).connect(band).connect(patter).connect(level).connect(spot(ctx, out));
    }
  },
  // a dj scratching a record: a short sound pushed back and forth under the needle, quick sweeps up and
  // down, now and then
  scratches(ctx, out, when, end) {
    for (const at of moments(when, end, 8, 20)) {
      const strokes = 2 + Math.floor(Math.random() * 4);
      const where = spot(ctx, out);
      for (let k = 0, t = at; k < strokes; k++) {
        const length = 0.08 + Math.random() * 0.12;
        const band = new BiquadFilterNode(ctx, { type: 'bandpass', Q: 4 });
        band.frequency.setValueAtTime(k % 2 ? 2400 : 500, t);
        band.frequency.exponentialRampToValueAtTime(k % 2 ? 500 : 2400, t + length);
        const level = ctx.createGain();
        level.gain.value = 0;
        swell(level.gain, t, length * 0.3, length * 0.7, 1);
        noiseSource(ctx, t, t + length + 0.02).connect(band).connect(level).connect(where);
        t += length + Math.random() * 0.06;
      }
    }
  },
  // lava (minecraft's nether): thick bubbles bursting slowly, low, over the far off roll of the rumble
  lava(ctx, out, when, end, bright) {
    TEXTURES.rumble(ctx, out, when, end, bright);
    for (const at of moments(when, end, 0.4, 2.5)) {
      const f = 70 + Math.random() * 110;
      const length = 0.08 + Math.random() * 0.12;
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(f, at);
      osc.frequency.exponentialRampToValueAtTime(f * 2.2, at + length);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.4 + Math.random() * 0.6, at + length * 0.4);
      gain.gain.linearRampToValueAtTime(0, at + length);
      osc.connect(gain).connect(spot(ctx, out));
      osc.start(at);
      osc.stop(at + length + 0.02);
    }
  },
  // a factory somewhere close: a machine humming on the home note and something heavy rolling
  factory(ctx, out, when, end, bright, midi) {
    TEXTURES.hum(ctx, out, when, end, bright, midi);
    TEXTURES.rumble(ctx, out, when, end, bright);
  },
  // a radio between stations (silent hill's warns you something's near): bursts of static that
  // swell, flicker and cut out
  static(ctx, out, when, end) {
    for (const at of moments(when, end, 6, 18)) {
      const length = 1 + Math.random() * 3;
      const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1800 + Math.random() * 1500, Q: 0.7 });
      const flicker = ctx.createGain();
      flicker.gain.value = 0.6;
      lfo(ctx, 6 + Math.random() * 14, 0.4, flicker.gain, at, at + length + 0.05, 'square');
      const level = ctx.createGain();
      level.gain.value = 0;
      swell(level.gain, at, 0.15, length, 1);
      noiseSource(ctx, at, at + length + 0.05).connect(band).connect(flicker).connect(level).connect(spot(ctx, out));
    }
  },
  // an air raid siren far off: one slow wail rising, holding and falling away, now and then
  siren(ctx, out, when, end) {
    for (const at of moments(when, end, 25, 50)) {
      const length = 7 + Math.random() * 4;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, at);
      osc.frequency.exponentialRampToValueAtTime(560, at + length * 0.35);
      osc.frequency.setValueAtTime(560, at + length * 0.55);
      osc.frequency.exponentialRampToValueAtTime(170, at + length);
      const low = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1100, Q: 1 });
      const level = ctx.createGain();
      level.gain.value = 0;
      swell(level.gain, at, length * 0.35, length * 0.65, 1);
      osc.connect(low).connect(level).connect(spot(ctx, out));
      osc.start(at);
      osc.stop(at + length + 0.05);
    }
  },
  // metal struck somewhere off in the dark, ringing at a struck plate's out of tune overtones (silent
  // hill's otherworld, a factory floor): one to three blows
  clanks(ctx, out, when, end, bright) {
    for (const at of moments(when, end, 6, 16)) {
      const where = spot(ctx, out);
      const f = 160 + Math.random() * 260;
      for (let k = 0, t = at; k < 1 + Math.floor(Math.random() * 3); k++, t += 0.25 + Math.random() * 0.6) {
        for (const [ratio, level, ring] of [[1, 1, 1.2], [2.76, 0.5, 0.6], [5.4, 0.3, 0.3], [8.93, 0.15, 0.15]]) {
          const osc = ctx.createOscillator();
          osc.frequency.value = f * ratio * Math.min(1.2, bright);
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(level, t + 0.002);
          gain.gain.setTargetAtTime(0, t + 0.002, ring / 4);
          osc.connect(gain).connect(where);
          osc.start(t);
          osc.stop(t + ring + 0.05);
        }
      }
    }
  },
  // chains rattling: a second or so of little metal ticks, bunched
  chains(ctx, out, when, end) {
    for (const at of moments(when, end, 10, 24)) {
      const where = spot(ctx, out);
      const length = 0.4 + Math.random() * 0.8;
      for (let t = at; t < at + length; t += 0.01 + Math.random() ** 2 * 0.08) {
        const osc = ctx.createOscillator();
        osc.frequency.value = 2200 + Math.random() * 4000;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.3 + Math.random() * 0.7, t);
        gain.gain.setTargetAtTime(0, t + 0.001, 0.012);
        osc.connect(gain).connect(where);
        osc.start(t);
        osc.stop(t + 0.08);
      }
    }
  },
  // crows somewhere above: two or three harsh caws, a buzzing voice falling a little
  crows(ctx, out, when, end) {
    for (const at of moments(when, end, 12, 28)) {
      const where = spot(ctx, out);
      const f = 480 + Math.random() * 220;
      for (let k = 0, t = at; k < 2 + Math.floor(Math.random() * 2); k++, t += 0.35 + Math.random() * 0.2) {
        const length = 0.2 + Math.random() * 0.12;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.linearRampToValueAtTime(f * 0.85, t + length);
        const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1500, Q: 3 });
        const rasp = ctx.createGain();
        rasp.gain.value = 0.6;
        lfo(ctx, 45, 0.4, rasp.gain, t, t + length + 0.05, 'square');
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(1, t + 0.02);
        gain.gain.linearRampToValueAtTime(0, t + length);
        osc.connect(band).connect(rasp).connect(gain).connect(where);
        osc.start(t);
        osc.stop(t + length + 0.05);
      }
    }
  },
  // slow footsteps somewhere you can't see, a few crunches on gravel, then gone
  footsteps(ctx, out, when, end) {
    for (const at of moments(when, end, 14, 30)) {
      const where = spot(ctx, out);
      for (let k = 0, t = at; k < 3 + Math.floor(Math.random() * 4); k++, t += 0.6 + Math.random() * 0.2) {
        const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1200 + Math.random() * 600, Q: 0.8 });
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.7 + Math.random() * 0.3, t + 0.01);
        gain.gain.setTargetAtTime(0, t + 0.01, 0.05);
        noiseSource(ctx, t, t + 0.25).connect(band).connect(gain).connect(where);
      }
    }
  },
  // steam let out of a pipe: a hiss coming on hard and dying away
  steam(ctx, out, when, end) {
    for (const at of moments(when, end, 10, 24)) {
      const length = 1.5 + Math.random() * 2.5;
      const high = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 2500, Q: 0.5 });
      const level = ctx.createGain();
      level.gain.value = 0;
      swell(level.gain, at, 0.1, length, 1);
      noiseSource(ctx, at, at + length + 0.15).connect(high).connect(level).connect(spot(ctx, out));
    }
  },
  // a singing bowl struck now and then, on the home note: the bowl's out of tune overtones (2.71, 5.15)
  // dying long, beating slowly against a twin a hair apart
  bowl(ctx, out, when, end, bright, midi = 60) {
    for (const at of moments(when, end, 16, 34)) {
      const f = mtof(homeAbove(60, midi));
      const where = spot(ctx, out);
      for (const [ratio, level, ring] of [[1, 1, 8], [1.004, 0.6, 8], [2.71, 0.3, 4], [5.15, 0.1, 2]]) {
        const osc = ctx.createOscillator();
        osc.frequency.value = f * ratio;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(level, at + 0.01);
        gain.gain.setTargetAtTime(0, at + 0.01, ring / 4);
        osc.connect(gain).connect(where);
        osc.start(at);
        osc.stop(at + ring + 0.1);
      }
    }
  },
};

// recorded scenery: one of its recordings every few seconds (inst.every), each from its own spot. a
// pitched one (a singing bowl) is moved to the nearest home note
function recordedScenery(ctx, out, inst, set, when, end, midi = 60) {
  const [low, high] = inst.every || [10, 25];
  for (const at of moments(when, end, low, high)) {
    const take = pickOne(set.notes);
    const source = ctx.createBufferSource();
    source.buffer = take.buffer;
    if (take.midi !== undefined) source.detune.value = (homeAbove(take.midi - 6, midi) - take.midi) * 100 + (take.tune || 0);
    const level = ctx.createGain();
    level.gain.value = 0.6 + Math.random() * 0.4;
    source.connect(level).connect(spot(ctx, out));
    source.start(at);
    source.stop(Math.min(end, at + take.buffer.duration));
  }
}

// a recorded bed (rain, a fire) plays its slices one after another, crossfaded, never the same slice
// twice running, so it isn't a few seconds of rain going round
const BED_FADE = 1.5;
const BED_RISE = Float32Array.from({ length: 32 }, (_, i) => Math.sin((Math.PI / 2) * (i / 31)));
const BED_FALL = BED_RISE.slice().reverse();
function recordedBed(ctx, out, set, when, end) {
  let last = null;
  for (let at = when; at < end;) {
    const others = set.notes.filter((one) => one !== last);
    const take = (last = pickOne(others.length ? others : set.notes));
    const length = take.buffer.duration;
    const source = ctx.createBufferSource();
    source.buffer = take.buffer;
    const level = ctx.createGain();
    level.gain.setValueCurveAtTime(BED_RISE, at, BED_FADE);
    level.gain.setValueCurveAtTime(BED_FALL, at + length - BED_FADE, BED_FADE);
    source.connect(level).connect(out);
    source.start(at);
    source.stop(Math.min(end, at + length));
    at += length - BED_FADE;
  }
}

function playTexture(ctx, out, inst, tone, when, dur, vel, midi) {
  const fade = Math.min(3, dur / 3);
  const end = when + dur;
  // its recordings, if it has them and they've loaded
  const set = inst.samples && sampleSet(inst.samples);
  const level = (set ? inst.sampled.gain : inst.gain) * vel;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(level, when + fade);
  gain.gain.setValueAtTime(level, end - fade);
  gain.gain.linearRampToValueAtTime(0, end);
  gain.connect(out);
  if (set && inst.bed) recordedBed(ctx, gain, set, when, end + 0.05);
  else if (set) recordedScenery(ctx, gain, inst, set, when, end + 0.05, midi);
  else TEXTURES[inst.texture](ctx, gain, when, end + 0.05, Math.min(3, tone.bright), midi);
}

// beats until each of a song's notes is struck again on its layer, for cutting its ring off there
// (voiceChain). worked out when notes are handed over, not stored on them
const restrikes = new WeakMap();
// how far apart a keyboard's lowest and highest notes are spread (playNote), a share of hard left to
// hard right two and a half octaves either side of the middle
const KEY_SPREAD = 0.35;
function findRestrikes(notes) {
  const last = new Map();
  for (const note of notes) {
    const key = `${note.layer} ${note.midi}`;
    if (last.has(key)) restrikes.set(last.get(key), note.t - last.get(key).t);
    last.set(key, note);
  }
}

// one note of a layer. a drum rings for the layer's release, with its brightness on the filters, and
// plays at 0.7 so every kick doesn't push the glue down and pump the band
function playNote(ctx, channel, layer, note, when, secondsPerBeat) {
  const inst = INSTRUMENTS[layer.instrument];
  if (!inst || !channel) return;
  const dur = note.dur * secondsPerBeat;
  if (inst.kind === 'drums') {
    const slot = inst.slots[note.midi];
    if (!slot) return;
    const p = { ...slot, tune: note.tune || slot.tune, step: dur, decay: slot.decay * layer.tone.release, tone: (slot.tone || 0) * layer.tone.bright };
    if (!(slot.hit && playHit(ctx, channel.input, when, note.vel, slot, p))) DRUMS[slot.voice](ctx, channel.input, when, note.vel * 0.7, p);
    // a recorded heartbeat is one thump, so its second comes the way DRUMS.heart's does
    else if (slot.voice === 'heart') playHit(ctx, channel.input, when + heartGap(p), note.vel * 0.6, slot, p);
    return;
  }
  if (inst.kind === 'texture') {
    playTexture(ctx, channel.input, inst, layer.tone, when, dur, note.vel, note.midi);
    return;
  }
  playTone(ctx, channel, inst, recorded(inst, heldInRange(inst) ? undefined : note.midi, layer.recording) || inst, layer, note, when, secondsPerBeat);
  // the layer's doublers (layer.with) play it too, where the composer marked it doubled (note.double)
  if (note.double && layer.with) channel.doubles?.forEach((double, i) => playDouble(ctx, double, i, layer, note, when, secondsPerBeat));
}

// works out a note's string or struck modes before it's due (MusicPlayer.warm), so a new chord doesn't
// stall the notes after it (a stumble on a slow phone's first bar of piano)
function warmNote(rate, layer, note) {
  const inst = INSTRUMENTS[layer.instrument];
  if (!inst || inst.kind === 'drums' || inst.kind === 'texture') return;
  const played = recorded(inst, heldInRange(inst) ? undefined : note.midi, layer.recording) || inst;
  if (played.kind === 'pluck') pluckString(rate, played, layer.tone, note.midi, note.vel, !!note.mute);
  else if (played.kind === 'modal') modalBuffer(rate, note.midi, played, modalLevel(note.vel, layer.tone));
}

// a voice with a range sings anywhere in it on its recordings (the composer keeps its part there), so it
// never swaps to its synthesised self mid phrase. any other voice, like any instrument, plays a note too
// far from its recordings synthesised rather than stretch one into a chipmunk
const heldInRange = (inst) => !!(inst.sung && inst.range);
// one tonal note on an instrument (or its recording, played), into a channel or a doubler's chain
function playTone(ctx, target, inst, played, layer, note, when, secondsPerBeat) {
  const dur = note.dur * secondsPerBeat;
  // the recording, if it's loaded (recorded()). a sung one is the singer's voice however far it's
  // moved, so it never swaps to the synthesised version part way through a phrase
  if (sings(inst, layer) && played.kind === 'sample' && !note.stop) {
    singLine(ctx, target, played, layer.tone, note, when, dur, secondsPerBeat);
    return;
  }
  // keys and mallets spread by pitch, low left and high right, as heard from the player's seat (the
  // recordings are mono, and one point is a cheap sampler's sound)
  let out = target.input;
  if (inst.family === 'keys' || inst.family === 'bell') {
    out = new StereoPannerNode(ctx, { pan: Math.max(-1, Math.min(1, (note.midi - 66) / 30)) * KEY_SPREAD });
    out.connect(target.input);
  }
  const voice = voiceChain(ctx, out, played, layer.tone, mtof(note.midi), when, dur, note.vel, note, (restrikes.get(note) ?? Infinity) * secondsPerBeat);
  voice.pitch = pitchMods(ctx, played, layer.tone, note, when, voice.end, secondsPerBeat);
  ENGINES[played.kind](ctx, voice, played, layer.tone, mtof(note.midi), note.midi, note);
}

// ---------- doubling ----------
//
// layer.with: other instruments playing the layer's notes in its channel, each a few cents and
// milliseconds apart and a little to one side, as two players are never quite together (doubling in
// music.js). doublers only play recordings, and only the notes marked note.double
const DOUBLE_LEVEL = 0.5;
const DOUBLE_SPREAD = 0.3;
function playDouble(ctx, double, i, layer, note, when, secondsPerBeat) {
  const inst = INSTRUMENTS[double.instrument];
  if (!inst || !double.input) return;
  let midi = note.midi + 12 * (double.octave || 0);
  // a voice sings within what it was recorded singing (range), anything else must be in its recordings'
  // reach, or the doubler leaves that note out rather than play its synthesised self
  if (inst.range) {
    while (midi > inst.range[1]) midi -= 12;
    while (midi < inst.range[0]) midi += 12;
  }
  const played = recorded(inst, heldInRange(inst) ? undefined : midi, double.recording);
  if (!played) return;
  const side = i % 2 ? -1 : 1;
  // (singer: which voice of a section it is, for singLine. never quite together, and not by the same
  // amount every note)
  const doubled = { ...note, midi, vel: note.vel * 0.85, cents: side * (5 + 2 * i), bend: note.bend, slur: note.slur, singer: i + 1 };
  playTone(ctx, double, inst, played, layer, doubled, when + 0.008 * (i + 1) + Math.random() * 0.012, secondsPerBeat);
}
// a channel's doublers: an input each through its instrument's chain and a pan, into the channel's strip
// so they share its eq, volume and sends. rebuilt when they change or their recordings load
function wireDoubles(channel, layer) {
  const key = JSON.stringify((layer.with || []).map((one) => [one.instrument, one.recording, !!recorded(INSTRUMENTS[one.instrument], undefined, one.recording)]));
  if (channel.doublesFor === key) return;
  channel.doublesFor = key;
  for (const double of channel.doubles || []) {
    double.input?.disconnect();
    double.rig?.output.disconnect();
    double.rig?.stop();
    double.pan?.disconnect();
  }
  channel.doubles = (layer.with || []).map((one, i) => {
    const inst = INSTRUMENTS[one.instrument];
    const played = inst && recorded(inst, undefined, one.recording);
    if (!played) return { ...one };
    const { ctx } = channel;
    const input = new GainNode(ctx, { gain: DOUBLE_LEVEL });
    const pan = new StereoPannerNode(ctx, { pan: (i % 2 ? -1 : 1) * DOUBLE_SPREAD });
    const rig = instrumentChain(ctx, played);
    if (rig) {
      input.connect(rig.input);
      rig.output.connect(pan);
    } else input.connect(pan);
    pan.connect(channel.cut);
    return { ...one, input, rig, pan };
  });
}

// a sung line (sings()): a voice restarted every note sounds like a sampler, so a channel keeps one
// voice going through a phrase, the way sample libraries play legato:
//   - each note sings on the recording nearest it. a recording bent more than a couple of semitones
//     stops sounding like its singer (the vowel moves with the pitch, the chipmunk effect), so a bigger
//     move starts the nearest recording past its attack and crossfades into it while both move
//   - the pitch moves the way a singer's does (singerMove), not in an even slide, and a big leap has a
//     little less voice in the middle of it
//   - every voice wanders a few cents of its own, and a doubler comes in a touch late and from its own
//     point in its recording, so a choir is people rather than one recording copied
// notes arrive one at a time, so each plans the voice's ending and the next takes it back
const JOINED = 0.12;
// how far (semitones) a recording is bent before the nearest one takes over
const STRETCH = 2;
// a choir's recording sings a tune or a counter melody as a line too, rather than striking every note
const LINES = { melody: true, counter: true };
const sings = (inst, layer) => !!inst.sung || (inst.kind === 'choir' && !!LINES[layer.role]);

// the path a singer's pitch takes to the next note, [[seconds, cents]], after saitou's model of sung
// pitch: a small dip the other way just before (preparation), then a damped spring's step onto the
// note, over shooting a little (the part listeners missed most when it was taken out) and settling.
// it reaches the note after length and is still by about two and a half times that
const DAMPING = 0.55;
function singerMove(from, to, start, length) {
  const leap = to - from;
  const begin = from - Math.sign(leap) * Math.min(12, Math.abs(leap) * 0.05);
  const omega = 2.58 / length;
  const damped = omega * Math.sqrt(1 - DAMPING * DAMPING);
  // a spring over shoots by an eighth of the move, too much for a big leap: past the note, the swing
  // is scaled down to 25 cents at most (scaled, not cut, which held a flat wrong note)
  const swing = Math.min(1, 25 / (0.126 * Math.abs(to - begin) || 1));
  const points = [[start - length * 0.6, from], [start, begin]];
  for (let k = 1; k <= 12; k++) {
    const t = (k / 12) * length * 2.6;
    const y = 1 - Math.exp(-DAMPING * omega * t) * (Math.cos(damped * t) + (DAMPING / Math.sqrt(1 - DAMPING * DAMPING)) * Math.sin(damped * t));
    points.push([start + t, t < length ? begin + (to - begin) * y : to + (to - begin) * (y - 1) * swing]);
  }
  points.push([start + length * 2.6 + 0.02, to]);
  return points;
}
// where a path is at a time
function pathAt(path, t) {
  let i = 0;
  while (i < path.length - 1 && path[i + 1][0] <= t) i++;
  const [t0, p0] = path[i];
  const [t1, p1] = path[i + 1] || path[i];
  return t1 > t0 && t > t0 ? p0 + (p1 - p0) * Math.min(1, (t - t0) / (t1 - t0)) : p0;
}
// a recording's detune following a path (cents of pitch, so two recordings can follow one path)
function followPath(param, take, path, fresh) {
  const offset = (take.tune || 0) - take.midi * 100;
  const [[t0, p0], ...rest] = path;
  if (fresh) param.setValueAtTime(p0 + offset, t0);
  else {
    // (a ramp to the cut, not a jump: cancelling takes away the ramp under way)
    param.cancelScheduledValues(t0);
    param.linearRampToValueAtTime(p0 + offset, t0);
  }
  for (const [t, p] of rest) param.linearRampToValueAtTime(p + offset, t);
}
// how long a singer takes over a move: about 75 ms for a step and 170 for an octave, never more than
// a share of either note, so a run of short notes still lands on each one
const moveTime = (semitones, before, dur) => Math.max(0.02, Math.min(0.06 + 0.009 * Math.abs(semitones), 0.2, before * 0.4, dur * 0.4));

// somewhere in a recording's held part, past its attack: where a recording taking over mid phrase starts
// (a singer drifts a little over a held note, so starting at its first moment was always the same few
// cents out), and where a doubler starts, so two voices on one recording don't line up and phase
const heldPart = (take) => (take.loop ? take.loop[0] + Math.random() * (take.loop[1] - take.loop[0]) * 0.5 : 0.05);
// one recording of a phrase starting
function singTake(ctx, voice, take, when, start) {
  const source = ctx.createBufferSource();
  source.buffer = take.buffer;
  if (take.loop) {
    source.loop = true;
    [source.loopStart, source.loopEnd] = take.loop;
  }
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, when);
  source.connect(amp).connect(voice.out);
  voice.wander.connect(source.detune);
  source.start(when, Math.min(start, take.buffer.duration - 0.05));
  return { source, amp, take };
}

// a recorded move (true legato, buildMoves in tools/build-samples.js): the singer was recorded going from
// one note into another, so the move is their own voice moving, breath and all, rather than a recording
// bent. one is sung when there's one of the same leap arriving within STRETCH of this note, quick enough
// to sit across the two notes' join, with this note long enough to hand over to its held recording
// after. the middle of its move (leaving to landing) falls on the note's start. its pitch is ramped from
// where the voice was to this note as it moves, and its loudness from the voice's to this note's, so
// both ends join up. a doubler never sings one (two voices on one recording of a move would phase).
// false when none fits
const HANDOVER = 0.12;
function singMove(ctx, voice, set, note, nearest, when, dur, pitch, peak) {
  if (note.singer || !set.moves?.length) return false;
  const leap = note.midi - voice.midi;
  let move = null;
  for (const one of set.moves) {
    if (one.to - one.from !== leap || Math.abs(note.midi - one.to) > STRETCH) continue;
    const middle = (one.leave + one.land) / 2;
    // (it leaves before the last note started, or arrives too late in this one to hand over and be held
    // a moment)
    if (when - middle + one.leave - 0.03 < Math.max(ctx.currentTime, voice.at + 0.01, voice.ready || 0) || one.arrive - middle + 0.03 + HANDOVER + 0.1 > dur) continue;
    if (!move || Math.abs(note.midi - one.to) < Math.abs(note.midi - move.to)) move = one;
  }
  if (!move) return false;
  const zero = when - (move.leave + move.land) / 2;
  const start = Math.max(zero, ctx.currentTime, voice.at + 0.01, voice.ready || 0);
  const [leave, land, arrive] = [zero + move.leave, zero + move.land, zero + move.arrive];
  // the last recording holds its note and fades as the move fades in
  followPath(voice.source.detune, voice.take, [[start, pathAt(voice.path, start)]], false);
  voice.amp.gain.cancelScheduledValues(start);
  voice.amp.gain.setValueAtTime(voice.peak, start);
  voice.amp.gain.linearRampToValueAtTime(0, start + 0.05);
  voice.source.stop(start + 0.1);
  const source = ctx.createBufferSource();
  source.buffer = move.buffer;
  const amp = new GainNode(ctx, { gain: 0 });
  source.connect(amp).connect(voice.out);
  voice.wander.connect(source.detune);
  const [before, after] = [voice.pitch - move.from * 100 + move.tune[0], pitch - move.to * 100 + move.tune[1]];
  source.detune.setValueAtTime(before, start);
  source.detune.setValueAtTime(before, leave);
  // (the singer's swing past the note once landed, scaled to 25 cents at most, as singerMove's is)
  // (null where her pitch wasn't clear)
  const keep = Math.min(1, 25 / Math.max(1, ...move.bend.map(Math.abs)));
  move.bend.forEach((cents, k) => cents !== null && source.detune.linearRampToValueAtTime(after + (keep - 1) * cents, land + k * 0.02));
  source.detune.linearRampToValueAtTime(after, arrive);
  amp.gain.setValueAtTime(0, start);
  amp.gain.linearRampToValueAtTime(voice.peak * move.gain[0], Math.min(start + 0.05, leave));
  amp.gain.setValueAtTime(voice.peak * move.gain[0], leave);
  amp.gain.linearRampToValueAtTime(peak * move.gain[1], arrive);
  // then hands over to this note's held recording, an equal power crossfade just after it arrives
  const over = arrive + 0.03;
  amp.gain.setValueAtTime(peak * move.gain[1], over);
  amp.gain.linearRampToValueAtTime(peak * move.gain[1] * 0.71, over + HANDOVER / 2);
  amp.gain.linearRampToValueAtTime(0, over + HANDOVER);
  source.start(start, move.at + start - zero, move.length - (start - zero));
  const held = singTake(ctx, voice, nearest, over, heldPart(nearest));
  followPath(held.source.detune, nearest, [[over, pitch]], true);
  held.amp.gain.linearRampToValueAtTime(peak * 0.71, over + HANDOVER / 2);
  held.amp.gain.linearRampToValueAtTime(peak, over + HANDOVER);
  Object.assign(voice, held, { path: [[start, voice.pitch], [leave, voice.pitch], [arrive, pitch]], ready: over + HANDOVER });
  return true;
}

function singLine(ctx, channel, inst, tone, note, when, dur, spb) {
  const set = sampleSet(inst.samples);
  const last = channel.voice;
  const joined = last && last.inst === inst && when >= last.start && Math.abs(when - last.off) < JOINED;
  const peak = inst.gain * note.vel;
  const pitch = note.midi * 100 + (note.cents || 0);
  const nearest = pickTake(set.notes, note.midi, note.vel);
  let voice = last;
  if (!joined) {
    // a slow wander of its own, more for a doubler (note.singer) than the voice it doubles
    const drift = ctx.createBufferSource();
    drift.buffer = driftBuffer(ctx.sampleRate);
    drift.loop = true;
    drift.playbackRate.value = 0.5 + Math.random() * 0.4;
    const wander = new GainNode(ctx, { gain: note.singer ? 6 + 2 * note.singer : 3 });
    drift.connect(wander);
    drift.start(when, Math.random() * 8);
    voice = channel.voice = { inst, out: channel.input, wander, drift, start: when };
    // a doubler starts somewhere in its recording's held part, so two voices on one recording don't
    // line up and phase
    Object.assign(voice, singTake(ctx, voice, nearest, when, note.singer ? heldPart(nearest) : 0));
    voice.path = [[when, pitch]];
    followPath(voice.source.detune, nearest, voice.path, true);
    voice.amp.gain.linearRampToValueAtTime(peak, when + Math.max(0.01, Math.min(inst.env[0] * tone.attack, dur * 0.5)));
  } else if (!singMove(ctx, voice, set, note, nearest, when, dur, pitch, peak)) {
    const semitones = (pitch - voice.pitch) / 100;
    const length = moveTime(semitones, when - voice.at, dur);
    const move = when - length * 0.5;
    // the last note's planned ending is taken back from here (no earlier than now, or a ramp under way
    // would jump, nor before a recorded move has handed over)
    const from = Math.max(ctx.currentTime, voice.at + 0.01, voice.ready || 0, Math.min(voice.off, move - length * 0.6));
    const path = [[from, pathAt(voice.path, from)], ...singerMove(voice.pitch, pitch, move, length).filter(([t]) => t > from)];
    voice.amp.gain.cancelScheduledValues(from);
    voice.amp.gain.setValueAtTime(voice.peak, from);
    if (nearest !== voice.take && Math.abs(note.midi - voice.take.midi) > STRETCH) {
      // the nearest recording takes over: the old one fades out as the new one fades in, both on the
      // path, an equal power crossfade over the move
      const fade = Math.max(0.03, Math.min(Math.max(0.08, length * 1.5), 0.25, dur * 0.5));
      const old = voice;
      followPath(old.source.detune, old.take, path, false);
      old.amp.gain.linearRampToValueAtTime(old.peak * 0.71, from + fade / 2);
      old.amp.gain.linearRampToValueAtTime(0, from + fade);
      old.source.stop(from + fade + 0.05);
      const next = singTake(ctx, voice, nearest, from, heldPart(nearest));
      followPath(next.source.detune, nearest, path, true);
      next.amp.gain.linearRampToValueAtTime(peak * 0.71, from + fade / 2);
      next.amp.gain.linearRampToValueAtTime(peak, from + fade);
      Object.assign(voice, next);
    } else {
      followPath(voice.source.detune, voice.take, path, false);
      // the same note again is sung again, a little dip between; a leap has a little less voice in
      // the middle of it
      if (note.midi === voice.midi) voice.amp.gain.linearRampToValueAtTime(voice.peak * 0.55, Math.max(from, when - 0.01));
      else if (Math.abs(semitones) > 2) voice.amp.gain.linearRampToValueAtTime(voice.peak * (1 - Math.min(0.2, 0.025 * Math.abs(semitones))), Math.max(from, move + length * 0.5));
      voice.amp.gain.linearRampToValueAtTime(peak, when + Math.max(0.03, length));
    }
    voice.path = path;
  }
  // this note's ending, which the next note takes back if it joins on
  const off = when + dur;
  const release = Math.max(0.05, inst.env[3] * tone.release);
  voice.amp.gain.setTargetAtTime(0, off, release / 4);
  voice.source.stop(off + release * 1.5 + 0.05);
  voice.drift.stop(off + release * 1.5 + 0.05);
  // its own bends and shakes, on top of the move
  bendWith(pitchMods(ctx, inst, tone, note, when, off, spb), voice.source.detune);
  Object.assign(voice, { at: when, off, midi: note.midi, pitch, peak });
}

// ---------- guitar rigs ----------
//
// a rig is pedals, an amp and a cabinet in a layer's channel, so its notes are clipped together: a chord
// clipped as one sound growls, where notes clipped apart sound like several small guitars. an amp is:
//   tight     hz cut before the clipping, so a metal chug stays tight
//   boost     [hz, db] a mid push before the clipping, so it sings rather than fizzes
//   sustain   db of squash before the clipping: as the string dies the compressor turns it back up, so
//             a distorted chord rings on and on instead of dying like an acoustic one
//   curve, gain   how it clips (ampCurve) and how hard it's driven
//   mids, presence, body   [hz, db] after the clipping: scooped mids, bite, and thump (a low shelf)
//   cab       hz the speaker rolls the top off from, steeply: the fizz above is cheap distortion's
//   low       hz the speaker rolls the lows off below (70 unless it says; a bass rig keeps 35)
//   level     its loudness (tests/levels.html). dry: clean signal blended back (a bass rig)
//   double    two takes a few ms apart, each wavering, panned left and right
//   chorus    [rate, depth in seconds] two wavering copies either side
//   reverse   reverse reverb: an echo that swells up and cuts off
// and the shoegaze pedals:
//   warp      [rate, cents] the whole rig drifting in and out of tune together, before the clipping: a
//             tremolo arm never left still (kevin shields' glide guitar), or a vibrato pedal. the chord
//             bends as one, so it warps rather than goes out of tune
//   wah       [hz, q] a wah pedal left half down, a vowel pushed into the clipping
//   phaser    [rate, hz] notches sweeping up and down the sound, after the amp
//   flange    [rate, depth in seconds] tape flanging: a copy a few ms behind, wavering and fed back, for a
//             jet plane whoosh (slowdive pressed on the tape reels by hand)
//   shimmer   level of an octave up wash: the sound shifted up an octave into a long reverb that feeds
//             itself, so every chord leaves a halo ringing above it

// how a rig clips, its curve over -1 to 1 with the gain built in:
//   soft   tanh, rounding off gently: overdrive, and fuzz when driven hard
//   hard   clean until a sudden knee, then flat: a distortion pedal's diodes
//   tube   lopsided, one half clipping first: a valve amp's warm even harmonics
//   octave folded, the wave's bottom half flipped up before it clips: an octave fuzz, a ringing octave
//          over every note (the fuzz in front of my bloody valentine's amps, hum's and fleshwater's leads)
function ampCurve(kind, gain) {
  const key = `amp|${kind}|${gain}`;
  if (!curves.has(key)) {
    // an odd length, so silence lands on a point of the curve and comes out silent. with an even one a
    // lopsided curve (tube, octave) turned silence into a tiny steady signal, and a rig with nothing to
    // play kept itself, its channel and the reverb working all song
    const curve = new Float32Array(4097);
    const shape = {
      soft: (x) => Math.tanh(gain * x),
      hard: (x) => (gain * x) / (1 + Math.abs(gain * x) ** 6) ** (1 / 6),
      tube: (x) => Math.tanh(gain * (x + 0.25)) - Math.tanh(gain * 0.25),
      octave: (x) => Math.tanh(gain * (0.55 * Math.abs(x) + 0.45 * x)),
    }[kind] || ((x) => Math.tanh(gain * x));
    const top = Math.max(Math.abs(shape(1)), Math.abs(shape(-1)));
    for (let i = 0; i < curve.length; i++) curve[i] = shape((i / (curve.length - 1)) * 2 - 1) / top;
    curves.set(key, curve);
  }
  return curves.get(key);
}

// reverse reverb's impulse: noise rising for half a second, then cut dead. kept per context
const reverseImpulses = new WeakMap();
function reverseImpulse(ctx) {
  if (!reverseImpulses.has(ctx)) {
    const length = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let low = 0;
      for (let i = 0; i < length; i++) {
        low += (Math.random() * 2 - 1 - low) * 0.3;
        data[i] = low * (i / length) ** 2;
      }
    }
    reverseImpulses.set(ctx, buffer);
  }
  return reverseImpulses.get(ctx);
}

// the shimmer's wash: two seconds of dark noise dying away, mono (it's under a stereo rig anyway, and a
// mono one costs half). kept per context
const shimmerImpulses = new WeakMap();
function shimmerImpulse(ctx) {
  if (!shimmerImpulses.has(ctx)) {
    const length = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let low = 0;
    for (let i = 0; i < length; i++) {
      low += (Math.random() * 2 - 1 - low) * 0.25;
      data[i] = low * Math.exp((-6 * i) / length);
    }
    shimmerImpulses.set(ctx, buffer);
  }
  return shimmerImpulses.get(ctx);
}

// the shimmer's octave up, the cheapest pitch shifter there is: a delay line shrinking by a second every
// second plays twice as fast, so an octave up. it can't shrink for ever, so it jumps back every window,
// and two of them half a window apart are faded in turn, each silent as it jumps. ramp is a saw jumping
// half way through its cycle; fade is |cos|, silent right then (its constant part, 2 / pi, goes on the
// gain, since a periodic wave has none). kept per context
const shimmerWaves = new WeakMap();
function shimmerWaveSet(ctx) {
  if (!shimmerWaves.has(ctx)) {
    const n = 24;
    const sines = new Float32Array(n + 1);
    const cosines = new Float32Array(n + 1);
    for (let k = 1; k <= n; k++) {
      const sign = k % 2 ? 1 : -1;
      sines[k] = (sign * 2) / (Math.PI * k);
      cosines[k] = (sign * 4) / (Math.PI * (4 * k * k - 1));
    }
    const zeros = new Float32Array(n + 1);
    shimmerWaves.set(ctx, {
      ramp: ctx.createPeriodicWave(zeros, sines, { disableNormalization: true }),
      fade: ctx.createPeriodicWave(cosines, zeros, { disableNormalization: true }),
    });
  }
  return shimmerWaves.get(ctx);
}

// a shimmer from a rig's sound into its output: shifted up an octave, into the wash, and a little fed
// back round, so the halo climbs another octave as it fades (a strymon bigsky's shimmer, which slowdive,
// alcest and deafheaven play through). running collects its oscillators to stop with the rig
function shimmer(ctx, from, to, level, running) {
  const window = 0.05;
  const { ramp, fade } = shimmerWaveSet(ctx);
  const input = new GainNode(ctx);
  from.connect(new BiquadFilterNode(ctx, { type: 'highpass', frequency: 400 })).connect(input);
  const up = new GainNode(ctx, { gain: 0.7 });
  const now = ctx.currentTime;
  for (const late of [0, window / 2]) {
    const delay = new DelayNode(ctx, { maxDelayTime: 0.2, delayTime: window / 2 });
    const tap = new GainNode(ctx, { gain: 0 });
    tap.gain.setValueAtTime(2 / Math.PI, now + late);
    for (const [wave, target, scale] of [[ramp, delay.delayTime, -window / 2], [fade, tap.gain, 1]]) {
      const osc = new OscillatorNode(ctx, { periodicWave: wave, frequency: 1 / window });
      osc.connect(new GainNode(ctx, { gain: scale })).connect(target);
      osc.start(now + late);
      running.push(osc);
    }
    input.connect(delay).connect(tap).connect(up);
  }
  const wash = new ConvolverNode(ctx, { buffer: shimmerImpulse(ctx) });
  const tone = new BiquadFilterNode(ctx, { frequency: 5000, Q: 0.5 });
  up.connect(wash).connect(tone);
  tone.connect(new GainNode(ctx, { gain: 0.35 })).connect(input);
  tone.connect(new GainNode(ctx, { gain: level })).connect(to);
}

// a rig from an instrument's amp: { input, output, stop() }. stop ends its wavering oscillators
function ampChain(ctx, amp) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const running = [];
  let at = input;
  const filter = (type, freq, q, db = 0) => {
    const one = ctx.createBiquadFilter();
    one.type = type;
    one.frequency.value = freq;
    one.Q.value = q;
    one.gain.value = db;
    at.connect(one);
    at = one;
  };
  // a delay line wavering slowly, panned: the second take of a double track, or one side of a chorus
  const wavering = (from, time, depth, rate, pan, level) => {
    const delay = ctx.createDelay(0.1);
    delay.delayTime.value = time;
    const osc = ctx.createOscillator();
    osc.frequency.value = rate;
    const amount = ctx.createGain();
    amount.gain.value = depth;
    osc.connect(amount).connect(delay.delayTime);
    osc.start(ctx.currentTime);
    running.push(osc);
    const gain = ctx.createGain();
    gain.gain.value = level;
    from.connect(delay).connect(gain).connect(new StereoPannerNode(ctx, { pan })).connect(output);
  };
  // a slow wave (and its fifth higher, at 1.73 times the rate) pushing a param about, stopped with the rig
  const sway = (param, rate, depth, type = 'sine') => {
    for (const [r, share] of [[rate, 0.6], [rate * 1.73, 0.4]]) {
      const osc = new OscillatorNode(ctx, { type, frequency: r });
      osc.connect(new GainNode(ctx, { gain: depth * share })).connect(param);
      osc.start(ctx.currentTime);
      running.push(osc);
    }
  };
  if (amp.warp) {
    // a delay line swaying: the pitch moves by how fast the delay changes, so the swing that gives the
    // cents asked for at this rate (the two waves together peak at about 1.3 times one)
    const [rate, cents] = amp.warp;
    const swing = (2 ** (cents / 1200) - 1) / (2 * Math.PI * rate * 1.3);
    const delay = new DelayNode(ctx, { maxDelayTime: 0.1, delayTime: swing + 0.002 });
    sway(delay.delayTime, rate, swing);
    at.connect(delay);
    at = delay;
  }
  if (amp.tight) filter('highpass', amp.tight, 0.7);
  if (amp.boost) filter('peaking', amp.boost[0], 0.8, amp.boost[1]);
  if (amp.wah) filter('peaking', amp.wah[0], amp.wah[1], 14);
  if (amp.sustain) {
    // the browser's compressor puts back gain by itself (its "makeup gain"), so the threshold is all
    // that's set: the further down it is, the more of the string's dying away gets held up
    const squash = ctx.createDynamicsCompressor();
    squash.threshold.value = -6 - amp.sustain;
    squash.knee.value = 6;
    squash.ratio.value = 20;
    squash.attack.value = 0.004;
    squash.release.value = 0.3;
    at.connect(squash);
    at = squash;
  }
  if (amp.gain) {
    // a little under 1 going in, so a chord's notes added up drive it about as hard as the gain says.
    // oversampled, or the clipping's new harmonics fold back down as a whine
    filter('lowpass', 12000, 0.5);
    const drive = ctx.createGain();
    drive.gain.value = 0.6;
    const shaper = ctx.createWaveShaper();
    shaper.curve = ampCurve(amp.curve, amp.gain);
    shaper.oversample = '4x';
    at.connect(drive).connect(shaper);
    at = shaper;
  }
  if (amp.mids) filter('peaking', amp.mids[0], 0.9, amp.mids[1]);
  if (amp.presence) filter('peaking', amp.presence[0], 1, amp.presence[1]);
  if (amp.body) filter('lowshelf', amp.body[0], 0.7, amp.body[1]);
  if (amp.cab) {
    filter('lowpass', amp.cab, 0.8);
    filter('lowpass', amp.cab * 1.3, 0.6);
  }
  filter('highpass', amp.low || 70, 0.6);
  // the dry sound and a changed copy of it summed: a phaser's swept notches, or a tape flange
  const blend = (wet) => {
    const sum = new GainNode(ctx, { gain: 0.65 });
    at.connect(sum);
    wet.connect(sum);
    at = sum;
  };
  if (amp.phaser) {
    const [rate, hz] = amp.phaser;
    let stage = at;
    for (const freq of [300, 600, 1200, 2400]) {
      const pass = new BiquadFilterNode(ctx, { type: 'allpass', frequency: freq, Q: 0.6 });
      sway(pass.frequency, rate, hz * (freq / 1200), 'triangle');
      stage.connect(pass);
      stage = pass;
    }
    blend(stage);
  }
  if (amp.flange) {
    const [rate, depth] = amp.flange;
    const delay = new DelayNode(ctx, { maxDelayTime: 0.03, delayTime: depth + 0.001 });
    sway(delay.delayTime, rate, depth, 'triangle');
    const back = new GainNode(ctx, { gain: 0.5 });
    at.connect(delay).connect(back).connect(delay);
    blend(delay);
  }
  const mix = ctx.createGain();
  mix.gain.value = amp.level;
  at.connect(mix);
  if (amp.dry) {
    const dry = ctx.createGain();
    dry.gain.value = amp.dry / amp.level;
    input.connect(dry).connect(mix);
  }
  if (amp.double) {
    mix.connect(new StereoPannerNode(ctx, { pan: -0.75 })).connect(output);
    wavering(mix, 0.013, 0.0006, 0.31, 0.75, 1);
  } else if (amp.chorus) {
    const [rate, depth] = amp.chorus;
    mix.connect(output);
    wavering(mix, 0.008, depth, rate, -0.8, 0.6);
    wavering(mix, 0.011, depth, rate * 1.13, 0.8, 0.6);
  } else mix.connect(output);
  if (amp.reverse) {
    const verb = ctx.createConvolver();
    verb.buffer = reverseImpulse(ctx);
    const gain = ctx.createGain();
    gain.gain.value = amp.reverse;
    mix.connect(verb).connect(gain).connect(output);
  }
  if (amp.shimmer) shimmer(ctx, mix, output, amp.shimmer, running);
  return { input, output, stop: () => running.forEach((osc) => osc.stop()) };
}

// ---------- an instrument's own chain: its body, its rig, its speaker ----------
//
// what an instrument's sound goes through the same for every note, built once per layer (wireRig):
//   body     [[hz, db, q], ...]: its body's resonances, which stay put whatever note is played (a
//            violin's box at about 280 and 460 hz). a synth's tone moves with the note; a real one's doesn't
//   amp      a guitar rig (ampChain)
//   rotary   a leslie speaker, its horn spinning this many times a second, the drum under it a little
//            slower (a hammond)
// returns { input, output, stop() }, or null for an instrument with none of them
function instrumentChain(ctx, inst) {
  if (!inst || !(inst.body || inst.amp || inst.rotary)) return null;
  const input = ctx.createGain();
  const running = [];
  let at = input;
  for (const [hz, db, q] of inst.body || []) {
    const peak = new BiquadFilterNode(ctx, { type: 'peaking', frequency: hz, Q: q, gain: db });
    at.connect(peak);
    at = peak;
  }
  if (inst.amp) {
    const rig = ampChain(ctx, inst.amp);
    at.connect(rig.input);
    at = rig.output;
    running.push(rig);
  }
  let output = at;
  if (inst.rotary) {
    output = ctx.createGain();
    for (const [speed, side] of [[1, 1], [0.83, -1]]) {
      const delay = new DelayNode(ctx, { maxDelayTime: 0.05, delayTime: 0.004 });
      const pan = ctx.createStereoPanner();
      const level = new GainNode(ctx, { gain: 0.55 });
      const spin = new OscillatorNode(ctx, { frequency: inst.rotary * speed });
      for (const [param, depth] of [[delay.delayTime, 0.0007], [pan.pan, 0.7 * side], [level.gain, 0.12]]) spin.connect(new GainNode(ctx, { gain: depth })).connect(param);
      spin.start(ctx.currentTime);
      running.push(spin);
      at.connect(delay).connect(level).connect(pan).connect(output);
    }
  }
  return { input, output, stop: () => running.forEach((one) => one.stop()) };
}

// ---------- the room ----------

// a room's echo, made up: noise dying away and darkening as it goes, as walls soak up the top first
// (normalised, so a big room isn't louder). its cost is its length, and it was the band's most
// expensive part, so it stops 45 db down instead of 60 (under any music), and at three seconds on a
// phone. kept, so a new song needn't make it again
const impulses = new Map();
function impulse(ctx, size, tone) {
  const rate = ctx.sampleRate;
  const key = `${rate}|${size}|${tone}`;
  if (impulses.has(key)) return impulses.get(key);
  const decays = 0.6 + size * 6;
  const seconds = Math.min(LIGHT ? 3 : Infinity, decays * 0.75);
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  const gap = Math.floor(rate * (0.005 + size * 0.03));
  const full = Math.floor(rate * decays);
  const tail = Math.floor(length * 0.85);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let low = 0;
    for (let i = gap; i < length; i++) {
      const fade = Math.exp((-6.9 * (i - gap)) / (full - gap)) * (i < tail ? 1 : (length - i) / (length - tail));
      low += (Math.random() * 2 - 1 - low) * (0.06 + tone * 0.85 * (1 - (i / full) * 0.8));
      data[i] = low * fade;
    }
    // early reflections: the first bounces off the walls, different each side so it's wide (a wash
    // alone is a cheap reverb's room with no walls). soft knocks, about a fifth of the wash's first 80 ms
    let early = 0;
    for (let i = gap; i < Math.min(length, gap + rate * 0.08); i++) early += data[i] * data[i];
    const level = Math.sqrt((early * 0.35) / 7 / 4);
    for (let k = 0; k < 7; k++) {
      const at = gap + Math.floor(rate * (0.004 + Math.random() * (0.01 + size * 0.05)));
      const sign = Math.random() < 0.5 ? -1 : 1;
      for (let j = 0; j < 12 && at + j < length; j++) data[at + j] += sign * level * (1 - k * 0.08) * Math.exp(-j / 3);
    }
  }
  if (impulses.size > 8) impulses.clear();
  impulses.set(key, buffer);
  return buffer;
}

// soft clipping (tanh) for drive. divided down as it gets stronger, so it adds grit without getting
// much louder
function driveCurve(amount) {
  const k = 1 + amount * 4;
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(k * ((i / 1023) * 2 - 1)) / (0.6 * k + 0.4);
  return curve;
}

// ---------- the mixing desk ----------
//
// what a mixing engineer does first, so the parts sound like one band rather than midi:
//   - one room for everyone (roomImpulse, PLACES.room): a short room every part is sent to a little, so
//     recordings from different studios and synths from none sound played in one place
//   - every part has a place (PLACES): the tune gets presence (2.5 khz) and air, the parts behind it give
//     them up, so the tune stands in front without being turned up
//   - the reverb and echo lose their low end on the way back, so a bass note doesn't boom round the room
//   - glue: a gentle compressor with a slow attack, riding the band rather than squashing every hit
//   - tape: soft, lopsided saturation on the whole mix, rounding the peaks and adding warmth
//   - a limiter last, so a loud chorus can't clip
// what each part gets, by role: presence and air in db, and how much of it goes to the room
const PLACES = {
  melody: { presence: 1.5, air: 1, room: 0.2 },
  counter: { presence: -1, air: 0, room: 0.22 },
  arp: { presence: -2, air: -1, room: 0.25 },
  bells: { presence: -1.5, air: 0, room: 0.25 },
  keys: { presence: -2, air: -1, room: 0.25 },
  guitar: { presence: -1, air: -1, room: 0.2 },
  pad: { presence: -3, air: -2, room: 0.25 },
  drone: { presence: -3, air: -2, room: 0.25 },
  bass: { presence: 0, air: -2, room: 0.05 },
  drums: { presence: 0, air: 0, room: 0.3 },
  texture: { presence: -2, air: -1, room: 0.1 },
};

// the room everyone shares: hard walls, early reflections in the first 40 ms (different each side) and a
// tail gone in half a second. kept per context
const roomImpulses = new WeakMap();
function roomImpulse(ctx) {
  if (!roomImpulses.has(ctx)) {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * 0.6);
    const buffer = ctx.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let low = 0;
      for (let i = 0; i < length; i++) {
        low += (Math.random() * 2 - 1 - low) * (0.5 - (0.35 * i) / length);
        data[i] = low * Math.exp((-6.9 * i) / length) * 0.3;
      }
      for (let k = 0; k < 14; k++) {
        const at = Math.floor(rate * (0.003 + Math.random() * 0.04));
        const level = (Math.random() < 0.5 ? -1 : 1) * Math.exp(-at / (rate * 0.03));
        for (let j = 0; j < 16 && at + j < length; j++) data[at + j] += level * Math.exp(-j / 4);
      }
    }
    roomImpulses.set(ctx, buffer);
  }
  return roomImpulses.get(ctx);
}

// tape saturation's curve: tanh pushed off centre (even harmonics, warmth), scaled so quiet sound passes
// at the same level and only the peaks round off
function tapeCurve() {
  const k = 1.1;
  const bias = 0.1;
  const slope = k * (1 - Math.tanh(k * bias) ** 2);
  // (an odd length, so silence stays silent: ampCurve)
  const curve = new Float32Array(2049);
  for (let i = 0; i < curve.length; i++) curve[i] = (Math.tanh(k * ((i / 2048) * 2 - 1 + bias)) - Math.tanh(k * bias)) / slope;
  return curve;
}

function buildGraph(ctx) {
  const g = { ctx };
  g.bus = ctx.createGain();
  g.drive = ctx.createWaveShaper();
  g.warmth = ctx.createBiquadFilter();
  g.warmth.Q.value = 0.5;
  // tape wobble: everything goes through a tiny delay whose length wavers, which bends the pitch
  // like a stretched cassette. a slow wow and a faster flutter
  g.wobble = ctx.createDelay(0.1);
  g.wobble.delayTime.value = 0.015;
  g.wow = lfo(ctx, 0.5, 0, g.wobble.delayTime, 0, 1e6);
  g.flutter = lfo(ctx, 6.5, 0, g.wobble.delayTime, 0, 1e6);
  // glue: a slow attack lets a drum's hit through, and a low ratio rides the band rather than pumping it
  g.comp = new DynamicsCompressorNode(ctx, { threshold: -24, knee: 10, ratio: 2, attack: 0.03, release: 0.25 });
  // a little of the boxy low mids out of the whole mix, where every part's body piles up
  const mud = new BiquadFilterNode(ctx, { type: 'peaking', frequency: 300, Q: 0.8, gain: -1.5 });
  const tape = new WaveShaperNode(ctx, { curve: tapeCurve(), oversample: '2x' });
  const tapeTop = new BiquadFilterNode(ctx, { type: 'highshelf', frequency: 9000, gain: -2 });
  g.master = ctx.createGain();
  // the limiter: hard and fast, only there to catch peaks
  const limiter = new DynamicsCompressorNode(ctx, { threshold: -2, knee: 0, ratio: 20, attack: 0.001, release: 0.08 });
  g.bus.connect(g.drive).connect(g.warmth).connect(g.wobble).connect(g.comp).connect(mud).connect(tape).connect(tapeTop).connect(g.master).connect(limiter).connect(ctx.destination);
  g.reverbIn = ctx.createGain();
  g.reverb = ctx.createConvolver();
  g.reverbIn.connect(g.reverb).connect(new BiquadFilterNode(ctx, { type: 'highpass', frequency: 200, Q: 0.5 })).connect(g.bus);
  // the room every part shares, its boom and its fizz taken off
  g.roomIn = ctx.createGain();
  g.roomIn.connect(new ConvolverNode(ctx, { buffer: roomImpulse(ctx) })).connect(new BiquadFilterNode(ctx, { type: 'highpass', frequency: 180, Q: 0.5 }))
    .connect(new BiquadFilterNode(ctx, { frequency: 8000, Q: 0.5 })).connect(g.bus);
  // the echo bounces left and right (ping pong), losing some top end each time, and its low end on
  // the way back to the band
  const echoOut = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 250, Q: 0.5 });
  echoOut.connect(g.bus);
  g.echoIn = ctx.createGain();
  g.echoLeft = ctx.createDelay(4);
  g.echoRight = ctx.createDelay(4);
  g.feedLeft = ctx.createGain();
  g.feedRight = ctx.createGain();
  const damp = ctx.createBiquadFilter();
  damp.frequency.value = 3200;
  const left = ctx.createStereoPanner();
  left.pan.value = -0.7;
  const right = ctx.createStereoPanner();
  right.pan.value = 0.7;
  g.echoIn.connect(g.echoLeft);
  g.echoLeft.connect(left).connect(echoOut);
  g.echoLeft.connect(damp).connect(g.feedLeft).connect(g.echoRight);
  g.echoRight.connect(right).connect(echoOut);
  g.echoRight.connect(g.feedRight).connect(g.echoLeft);
  return g;
}

// puts a song's fx (music.js FX_DEFAULTS) onto the graph. changes glide, so dragging a slider while it
// plays doesn't click
function applySpace(g, fx, tempo) {
  const now = g.ctx.currentTime;
  const set = (param, value) => {
    if (g.ready) param.setTargetAtTime(value, now, 0.03);
    else param.setValueAtTime(value, now);
  };
  const room = `${fx.size.toFixed(2)}|${fx.tone.toFixed(2)}`;
  if (g.room !== room) {
    g.room = room;
    g.reverb.buffer = impulse(g.ctx, fx.size, fx.tone);
  }
  if (g.driven !== fx.drive) {
    g.driven = fx.drive;
    g.drive.curve = fx.drive > 0.01 ? driveCurve(fx.drive) : null;
    // (oversampling with no curve still resamples the whole mix, for nothing)
    g.drive.oversample = fx.drive > 0.01 ? '2x' : 'none';
  }
  set(g.reverbIn.gain, fx.reverb * 1.2);
  set(g.echoIn.gain, fx.echo);
  const seconds = Math.min(3.9, (fx.echoTime * 60) / tempo);
  set(g.echoLeft.delayTime, seconds);
  set(g.echoRight.delayTime, seconds);
  set(g.feedLeft.gain, fx.echoRepeats * 0.85);
  set(g.feedRight.gain, fx.echoRepeats * 0.85);
  // warmth 0 leaves it open (about 19 khz), 1 closes it right down to 700 hz
  set(g.warmth.frequency, 700 * 2 ** ((1 - fx.warmth) * 4.8));
  set(g.wow.gain, fx.wobble * 0.004);
  set(g.flutter.gain, fx.wobble * 0.0003);
  // (1.1: the glue and the room made songs about 2 db louder than the old desk, so this was 1.3)
  set(g.master.gain, fx.volume ** 2 * 1.1);
  g.ready = true;
}

// a layer's channel: input -> its instrument's chain (instrumentChain, plugged in by setChannel) -> low
// cut -> its place (PLACES) -> volume -> gate -> pan, with sends to the room, reverb and echo. the rig
// is before the volume, so turning a guitar down doesn't drive its amp less. the gate is the game's
// intensity (MusicPlayer.setIntensity): open, unless the layer's been faded out
function makeChannel(g) {
  const { ctx } = g;
  const channel = {
    ctx, input: ctx.createGain(), cut: new BiquadFilterNode(ctx, { type: 'highpass', frequency: 20, Q: 0.6 }),
    presence: new BiquadFilterNode(ctx, { type: 'peaking', frequency: 2500, Q: 0.8 }), air: new BiquadFilterNode(ctx, { type: 'highshelf', frequency: 8000 }),
    volume: ctx.createGain(), gate: ctx.createGain(), pan: ctx.createStereoPanner(), room: ctx.createGain(), reverb: ctx.createGain(), echo: ctx.createGain(),
  };
  channel.cut.connect(channel.presence).connect(channel.air).connect(channel.volume);
  channel.volume.connect(channel.gate).connect(channel.pan);
  channel.pan.connect(g.bus);
  channel.pan.connect(channel.room).connect(g.roomIn);
  channel.pan.connect(channel.reverb).connect(g.reverbIn);
  channel.pan.connect(channel.echo).connect(g.echoIn);
  return channel;
}
// plugs the layer's instrument's chain in (or none), when the instrument's changed. a recording
// has its own body in it, so it gets the chain without one once it's loaded (recorded())
function wireRig(channel, instrument, recording) {
  const inst = INSTRUMENTS[instrument];
  const played = (inst?.body && recorded(inst, undefined, recording)) || inst;
  const key = played === inst ? instrument : `${instrument} ${played.samples}`;
  if (channel.rigFor === key) return;
  channel.rigFor = key;
  channel.input.disconnect();
  channel.rig?.output.disconnect();
  channel.rig?.stop();
  channel.rig = instrumentChain(channel.ctx, played);
  if (channel.rig) {
    channel.input.connect(channel.rig.input);
    channel.rig.output.connect(channel.cut);
  } else channel.input.connect(channel.cut);
}
// every part but the bass and drums has its lows cut (a high pass, in hz): a pad's low end is mud under
// the bass. it follows the layer's octave, and is gentler in a song with no bass or drone
const CUTS = { melody: 130, counter: 120, arp: 160, bells: 240, keys: 100, guitar: 75, pad: 110, drone: 20, bass: 20, drums: 20, texture: 60 };
const cutFor = (song, layer) => {
  const low = song.layers.some((one) => (one.role === 'bass' || one.role === 'drone') && !one.mute);
  const hz = (CUTS[layer.role] ?? 20) * 2 ** (layer.octave || 0);
  return Math.max(20, low ? hz : Math.min(hz, 50));
};
const audible = (song, layer) => (song.layers.some((other) => other.solo) ? layer.solo : !layer.mute);
function setChannel(channel, song, layer, now, glide) {
  wireRig(channel, layer.instrument, layer.recording);
  wireDoubles(channel, layer);
  const set = (param, value) => (glide ? param.setTargetAtTime(value, now, 0.02) : param.setValueAtTime(value, now));
  set(channel.cut.frequency, cutFor(song, layer));
  const place = PLACES[layer.role] || PLACES.keys;
  set(channel.presence.gain, place.presence > 0 ? place.presence * (1 - (INSTRUMENTS[layer.instrument]?.edge ?? 0)) : place.presence);
  set(channel.air.gain, place.air);
  set(channel.room.gain, place.room);
  set(channel.volume.gain, audible(song, layer) ? layer.volume ** 2 * 1.6 : 0);
  set(channel.pan.pan, layer.pan);
  set(channel.reverb.gain, layer.reverb);
  set(channel.echo.gain, layer.echo);
}
// a channel finished with: silent, and its rig's oscillators stopped
function closeChannel(channel, now) {
  // (a held audition is closed when its key's let go, and again by its own timer)
  if (channel.closed) return;
  channel.closed = true;
  channel.volume.gain.setTargetAtTime(0, now, 0.02);
  setTimeout(() => {
    channel.input.disconnect();
    channel.rig?.stop();
    for (const double of channel.doubles || []) {
      double.input?.disconnect();
      double.rig?.stop();
    }
  }, 300);
}

// ---------- playing ----------

// plays a song live. load() swaps in new notes while it plays: notes already sent finish as they were,
// and everything after is the new version. times are beats since play() started, every time round the
// loop included (loopOffset is where this time round began).
// what a game needs too (music.js "in a game"): setIntensity() turns the band up and down on the bar
// line, stinger() plays a cue over it in time and in key, queue() moves to another song on a beat, bar
// or section, and vary gives each time round a loop's own notes
class MusicPlayer {
  constructor() {
    this.ctx = null;
    this.playing = false;
    this.loop = true;
    // a click on every beat while it plays, for playing along (never in a wav)
    this.metronome = false;
    this.channels = {};
    // 0 to 1: which layers play (intensityLadder in music.js). 1 is the song as written
    this.intensity = 1;
    // [from, to] in beats: just this stretch, round and round (a section while practising it)
    this.range = null;
    this.until = null;
    // (round) => notes for that time round a loop (composeSong(song, round)), or null to repeat it
    this.vary = null;
  }

  // called from a click or a key (browsers only let sound start from one). the audio buffer is 40 ms
  // (latencyHint), about beepbox's: a big song works the audio thread three quarters of the time, and
  // with chrome's smallest buffer (which 'balanced' turned out to be on windows, 10 ms) every block
  // that ran a little long was a stutter. a longer buffer evens them out. bigger still on a phone
  wake() {
    if (!this.ctx) {
      const Context = window.AudioContext || window.webkitAudioContext;
      try {
        this.ctx = new Context({ latencyHint: LIGHT ? 'playback' : 0.04 });
      } catch {
        this.ctx = new Context();
      }
      this.graph = buildGraph(this.ctx);
      // an iphone stops the audio when the phone rings or the screen locks ('interrupted', which only
      // safari has), and it doesn't come back by itself
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.playing && this.ctx.state !== 'running') this.ctx.resume();
      });
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
    this.unmute();
    if (this.song) applySpace(this.graph, this.song.fx, this.song.tempo);
  }

  // an iphone's silent switch mutes web audio unless it's media: audioSession says so (safari 17), and
  // older ones switch over while an <audio> plays, so a second of silence loops alongside
  unmute() {
    if (navigator.audioSession) {
      navigator.audioSession.type = 'playback';
      return;
    }
    if (!LIGHT || !/iPhone|iPad|iPod|Mac/.test(navigator.userAgent)) return;
    if (!this.silence) {
      this.silence = new Audio(URL.createObjectURL(wavFile([new Float32Array(4410), new Float32Array(4410)], 4410, 44100)));
      this.silence.loop = true;
    }
    this.silence.play().catch(() => { /* not from a click: the next one will */ });
  }

  beatAt(time) { return this.anchorBeat + (time - this.anchorTime) / this.secondsPerBeat; }
  timeAt(beat) { return this.anchorTime + (beat - this.anchorBeat) * this.secondsPerBeat; }

  // where the song is now, in beats from its start: what's being heard, so the playhead and notes played
  // in on the keyboard aren't ahead of the sound by the buffer
  position() {
    if (!this.playing) return null;
    const [start, end] = this.span();
    let beat = this.beatAt(this.ctx.currentTime - (this.ctx.outputLatency || this.ctx.baseLatency || 0)) - this.loopOffset;
    // loopOffset moves on when the next time round starts being scheduled, a moment early (and on the
    // first time round, before the first note's heard, it's the start, not the end)
    if (beat < start && this.wraps > 0) beat += end - start;
    return Math.max(0, beat);
  }

  // the stretch of the song it plays, [from, to]: up to until (play()), the range, or the whole song
  span() {
    if (this.until !== null) return [0, Math.min(this.until, this.comp.beats)];
    return this.range || [0, this.comp.beats];
  }

  load(song, comp) {
    const secondsPerBeat = 60 / song.tempo;
    if (this.playing && secondsPerBeat !== this.secondsPerBeat) {
      // a new tempo carries on from where it is now
      this.anchorBeat = this.beatAt(this.ctx.currentTime);
      this.anchorTime = this.ctx.currentTime;
    }
    this.song = song;
    this.comp = comp;
    this.ladder = null;
    // (a time round worked out before a change would play the song from before it)
    this.nextRound = null;
    findRestrikes(comp.notes);
    this.secondsPerBeat = secondsPerBeat;
    if (this.ctx) applySpace(this.graph, song.fx, song.tempo);
    this.fetchRecordings();
    if (!this.playing) return;
    this.mix();
    // a layer added or moved up the ladder comes and goes with the rest, on the bar line
    if (this.intensity < 1) this.gates(this.nextBar());
    // a shorter song that's now behind the playhead starts again from the top
    if (this.scheduledTo - this.loopOffset > this.span()[1]) this.loopOffset = this.scheduledTo - this.span()[0];
    this.index = this.warmed = this.firstFrom(this.scheduledTo - this.loopOffset);
  }

  // starts loading the song's recordings. its synthesised instruments play until they're in, then
  // the channels are rewired for them (a recording's rig has no body, wireRig)
  fetchRecordings() {
    const song = this.song;
    songSamples(song).then(() => { if (this.song === song) this.mix(); });
  }

  // volume, pan, mute and solo, without touching the notes
  mix() {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    for (const layer of this.song.layers) {
      if (!this.channels[layer.id]) {
        this.channels[layer.id] = makeChannel(this.graph);
        this.gates(null, [layer.id]);
      }
      setChannel(this.channels[layer.id], this.song, layer, now, true);
    }
  }

  // ---------- in a game ----------

  // how much is going on, 0 to 1 (intensityLadder in music.js): layers come in and drop out on the next
  // bar line, fading over a beat, the way a game's music follows what's happening
  setIntensity(level) {
    this.intensity = Math.min(1, Math.max(0, level));
    if (this.playing) this.gates(this.nextBar());
  }
  // opens or shuts the channels' gates for the intensity: at a time, fading, or (when null) at once.
  // a part with settings of its own (id~D, playable() in music.js) goes with its layer
  gates(when, ids = Object.keys(this.channels)) {
    this.ladder ??= intensityLadder(this.song);
    for (const id of ids) {
      const gate = this.channels[id]?.gate.gain;
      if (!gate) continue;
      const open = (this.ladder[id.split('~')[0]] ?? 0) <= this.intensity + 1e-9 ? 1 : 0;
      if (when === null) gate.setValueAtTime(open, this.ctx.currentTime);
      else gate.setTargetAtTime(open, when, this.secondsPerBeat / 3);
    }
  }
  // the time of the next bar line to be heard. (just after the next time round's been scheduled, the
  // playhead is "before" its start, so its first bar is next)
  nextBar() {
    const bpb = this.comp.bpb;
    const beat = this.beatAt(this.ctx.currentTime + 0.03) - this.loopOffset;
    return this.timeAt(Math.ceil(beat / bpb - 1e-6) * bpb + this.loopOffset);
  }
  // where a beat from play()'s start falls in the song: past the end of the stretch it plays, it's
  // round again at the start
  songBeat(beat) {
    const [start, end] = this.span();
    let at = beat - this.loopOffset;
    while (at >= end - 1e-9 && this.loop && end > start) at -= end - start;
    return Math.min(Math.max(at, 0), this.comp.beats - 1e-6);
  }

  // a stinger (STINGERS in music.js) over the music, on its own channels: on the next beat or bar, in
  // the chord there. while it's stopped, at once, in the chord at beat from
  stinger(kind, from = 0) {
    this.wake();
    const now = this.ctx.currentTime;
    let at = from;
    let when = now + 0.03;
    if (this.playing) {
      const grid = STINGERS[kind].on === 'bar' ? this.comp.bpb : 1;
      const beat = this.beatAt(now + 0.03) - this.loopOffset;
      const landing = Math.ceil(beat / grid - 1e-6) * grid + this.loopOffset;
      at = this.songBeat(landing);
      when = this.timeAt(landing);
    }
    const notes = stingerNotes(this.song, this.comp, kind, at);
    const channels = {};
    let last = 0;
    for (const note of notes) {
      const layer = this.song.layers.find((one) => one.id === note.layer);
      if (!channels[layer.id]) {
        channels[layer.id] = makeChannel(this.graph);
        setChannel(channels[layer.id], this.song, { ...layer, mute: false, solo: true }, now, false);
      }
      const start = when + (note.t - at) * this.secondsPerBeat;
      playNote(this.ctx, channels[layer.id], layer, note, start, this.secondsPerBeat);
      last = Math.max(last, start + note.dur * this.secondsPerBeat);
    }
    setTimeout(() => Object.values(channels).forEach((channel) => closeChannel(channel, this.ctx.currentTime)), (last - now + 4) * 1000);
    return notes.length > 0;
  }

  // another song from the next beat, bar or section on (at), the way a game goes from exploring into a
  // fight: the song playing carries on to there, its last notes ringing out, and the new one starts
  // from its top. onSwitch hears when it does, a moment before it's heard. while stopped, it just plays
  queue(song, comp, at = 'bar', onSwitch = null) {
    if (!this.playing) {
      this.load(song, comp);
      onSwitch?.();
      this.play(0);
      return;
    }
    // (notes are already sent up to scheduledTo, so it can't come sooner)
    const from = this.scheduledTo - this.loopOffset;
    const [, end] = this.span();
    let beat;
    if (at === 'section') beat = this.comp.sections.find((one) => one.start >= from - 1e-6)?.start ?? end;
    else beat = Math.ceil(from / (at === 'beat' ? 1 : this.comp.bpb) - 1e-6) * (at === 'beat' ? 1 : this.comp.bpb);
    this.queued = { song, comp, at: Math.min(beat, end) + this.loopOffset, onSwitch };
  }
  // the queued song takes over (tick(), once everything before it's been sent). the old song's channels
  // close once its notes have rung out
  switchSong() {
    const { song, comp, at, onSwitch } = this.queued;
    this.queued = null;
    const old = Object.values(this.channels);
    setTimeout(() => old.forEach((channel) => closeChannel(channel, this.ctx.currentTime)), 8000);
    this.channels = {};
    // the new song's beats count from the switch, at its own tempo (set first, so load() doesn't take
    // it as a tempo change from now)
    this.anchorTime = this.timeAt(at);
    this.anchorBeat = at;
    this.secondsPerBeat = 60 / song.tempo;
    this.range = null;
    this.until = null;
    this.wraps = 0;
    this.nextRound = null;
    this.loopOffset = at;
    this.scheduledTo = at;
    this.load(song, comp);
    this.index = this.warmed = 0;
    onSwitch?.();
  }

  firstFrom(beat) {
    const { notes } = this.comp;
    let low = 0;
    let high = notes.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (notes[middle].t < beat - 1e-9) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  // until: stop there (a beat), for playing just up to the next note while practising
  play(from = 0, until = null) {
    this.stop();
    this.wake();
    this.playing = true;
    this.loopOffset = 0;
    this.scheduledTo = from;
    this.until = until;
    this.wraps = 0;
    this.queued = null;
    this.nextRound = null;
    this.channels = {};
    this.mix();
    this.index = this.warmed = this.firstFrom(from);
    // the first second's strings and struck notes are worked out first, then the clock starts, so a
    // slow phone's first notes aren't late
    this.warm(from + 1 / this.secondsPerBeat, Infinity);
    this.anchorTime = this.ctx.currentTime + (LIGHT ? 0.12 : 0.06);
    this.anchorBeat = from;
    // anything already sounding at the start (a pad held over it) plays its remaining part
    for (const note of this.comp.notes) {
      if (note.t < from && note.t + note.dur > from + 0.1) this.send({ ...note, dur: note.t + note.dur - from }, this.anchorTime);
    }
    this.timer = setInterval(() => this.tick(), 25);
    this.tick();
  }

  // a different song while it plays: the old one fades out on its own graph, tails and all, and the new
  // one starts at the playhead, anything held over it sounding at once
  restart() {
    if (!this.playing) return;
    const at = this.position();
    const old = this.graph;
    old.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    setTimeout(() => {
      old.master.disconnect();
      old.wow.osc.stop();
      old.flutter.osc.stop();
    }, 400);
    this.graph = buildGraph(this.ctx);
    this.play(at < this.comp.beats ? at : 0);
  }

  send(note, when) {
    const layer = this.song.layers.find((one) => one.id === note.layer);
    if (layer) playNote(this.ctx, this.channels[note.layer], layer, note, Math.max(when, this.ctx.currentTime), this.secondsPerBeat);
  }

  // every 25 ms: send every note due in the next 0.3 seconds (0.5 on a phone, 1.5 in a hidden tab, whose
  // timer runs about once a second). the browser plays them on its own clock, so timing stays exact
  tick() {
    if (!this.playing) return;
    const ahead = this.beatAt(this.ctx.currentTime + (document.hidden ? 1.5 : LIGHT ? 0.5 : 0.3));
    const looping = this.loop && this.until === null;
    while (this.scheduledTo < ahead) {
      // (this.comp, not a copy: a new time round or a queued song swaps it)
      const { notes } = this.comp;
      const [start, end] = this.span();
      const songEnd = this.loopOffset + end;
      const until = Math.min(ahead, songEnd, this.queued?.at ?? Infinity);
      while (this.index < notes.length && notes[this.index].t + this.loopOffset < until) {
        const note = notes[this.index++];
        this.send(note, this.timeAt(note.t + this.loopOffset));
      }
      if (this.metronome) {
        for (let beat = Math.ceil(this.scheduledTo - this.loopOffset - 1e-9); beat < until - this.loopOffset - 1e-9; beat++) this.click(this.timeAt(beat + this.loopOffset), beat % this.comp.bpb === 0);
      }
      this.scheduledTo = until;
      if (this.queued && until >= this.queued.at - 1e-9) {
        this.switchSong();
        continue;
      }
      if (until < songEnd || !looping) break;
      this.loopOffset = songEnd - start;
      this.wraps++;
      // a loop played a little differently each time round: the next round's notes, worked out while
      // this one played (the first time, now)
      // (none to give, and it goes round as it is)
      const next = this.vary && !this.range && (this.nextRound || this.vary(this.wraps));
      if (next) {
        this.comp = next;
        findRestrikes(next.notes);
        const round = this.wraps + 1;
        this.nextRound = null;
        setTimeout(() => { if (this.playing && this.wraps === round - 1 && this.vary) this.nextRound = this.vary(round); }, 100);
      }
      this.index = this.warmed = this.firstFrom(start);
    }
    // and the next two seconds' strings and struck notes, a few milliseconds' worth at a time (warm)
    this.warm(this.beatAt(this.ctx.currentTime + 2.5), 4);
    // not looping: stop once the end's been reached, leaving the last notes to ring out
    if (!looping && this.beatAt(this.ctx.currentTime) - this.loopOffset >= this.span()[1]) this.stop(false);
  }

  // works out the strings and struck notes (warmNote) of the notes not sent yet, up to beat until (from
  // play()'s start, like scheduledTo), for at most budget milliseconds
  warm(until, budget) {
    const { notes } = this.comp;
    const started = performance.now();
    this.warmed = Math.max(this.warmed, this.index);
    while (this.warmed < notes.length && notes[this.warmed].t + this.loopOffset < until && performance.now() - started < budget) {
      const note = notes[this.warmed++];
      const layer = this.song.layers.find((one) => one.id === note.layer);
      if (layer) warmNote(this.ctx.sampleRate, layer, note);
    }
  }

  // the metronome's tick: a short high blip, higher on the first beat of a bar. straight out, past the
  // room and the tape, so it's dry and on time
  click(when, first) {
    const { ctx } = this;
    const blip = new OscillatorNode(ctx, { frequency: first ? 1760 : 1320 });
    const level = new GainNode(ctx, { gain: 0 });
    level.gain.setValueAtTime(0, when);
    level.gain.linearRampToValueAtTime(first ? 0.25 : 0.15, when + 0.002);
    level.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
    blip.connect(level).connect(ctx.destination);
    blip.start(when);
    blip.stop(when + 0.06);
  }

  // plays notes on a layer's instrument at once, for hearing them while editing, on its own channel (so
  // even a muted layer). extra goes on every note (a drawn slide). returns the channel, so a key held on
  // the keyboard can be let go of early (closeChannel)
  audition(song, layer, midis, beats = 1.5, extra = {}) {
    this.wake();
    // the first try of a new instrument may be its synthesised self, while its recordings load
    if (RECORDINGS.on) sampleFolders(INSTRUMENTS[layer.instrument], layer.recording).forEach(loadSamples);
    const channel = makeChannel(this.graph);
    setChannel(channel, song, { ...layer, mute: false, solo: true }, this.ctx.currentTime, false);
    for (const midi of midis) playNote(this.ctx, channel, layer, { midi, dur: beats, vel: 0.75, ...extra }, this.ctx.currentTime + 0.02, 60 / song.tempo);
    setTimeout(() => closeChannel(channel, this.ctx.currentTime), (beats * 60 / song.tempo + 4) * 1000);
    return channel;
  }

  // cut: fade everything out now. otherwise notes already sent play out, and the channels close once
  // they've rung away
  stop(cut = true) {
    clearInterval(this.timer);
    if (this.playing) {
      const channels = Object.values(this.channels);
      const close = () => channels.forEach((channel) => closeChannel(channel, this.ctx.currentTime));
      if (cut) close();
      else setTimeout(close, 8000);
    }
    this.playing = false;
    this.silence?.pause();
  }
}

// ---------- wav files ----------

// renders a whole song offline, faster than real time. loop: the tails ringing past the end are folded
// back onto the start, so it loops with no gap or click.
// notes go in a second or two ahead of the render (suspend), the way the live player sends them. sent
// all at once, every note's nodes sat in the graph from the start and a five minute song took over ten
// minutes; this way it's a few times quicker and sounds the same (no further from the old way than two
// renders the old way were from each other). a note sent only just before it starts came out
// different, so each second's suspend sends the second after next. (firefox can't suspend a render, so
// there they still all go in at once). progress, if given, hears how far through it is (0 to 1) at each
// suspend: never, where there's none
const RENDER_AHEAD = 1;
async function renderSong(song, comp, loop, progress) {
  // a render can't swap to a recording halfway through, so it waits for them all first
  await songSamples(song);
  const rate = 44100;
  const secondsPerBeat = 60 / song.tempo;
  const length = comp.beats * secondsPerBeat;
  const tail = 7;
  const ctx = new OfflineAudioContext(2, Math.ceil((length + tail) * rate), rate);
  const graph = buildGraph(ctx);
  applySpace(graph, song.fx, song.tempo);
  const channels = {};
  const layers = {};
  for (const layer of song.layers) {
    channels[layer.id] = makeChannel(graph);
    setChannel(channels[layer.id], song, layer, 0, false);
    layers[layer.id] = layer;
  }
  findRestrikes(comp.notes);
  const { notes } = comp;
  let next = 0;
  const send = (until) => {
    // (the last second takes everything left, a note right on the end too)
    if (until >= length) until = Infinity;
    for (; next < notes.length && notes[next].t * secondsPerBeat < until; next++) {
      const note = notes[next];
      playNote(ctx, channels[note.layer], layers[note.layer], note, note.t * secondsPerBeat, secondsPerBeat);
    }
  };
  try {
    for (let at = RENDER_AHEAD; at < length; at += RENDER_AHEAD) ctx.suspend(at).then(() => {
      send(at + 2 * RENDER_AHEAD);
      progress?.(at / length);
      ctx.resume();
    });
    send(2 * RENDER_AHEAD);
  } catch {
    send(Infinity);
  }
  const buffer = await ctx.startRendering();
  const data = [buffer.getChannelData(0), buffer.getChannelData(1)];
  let frames = buffer.length;
  if (loop) {
    frames = Math.round(length * rate);
    for (const samples of data) for (let i = frames; i < samples.length; i++) samples[i % frames] += samples[i];
  } else {
    // trim the silence after the last echo dies away
    while (frames > rate && Math.abs(data[0][frames - 1]) < 1e-4 && Math.abs(data[1][frames - 1]) < 1e-4) frames--;
  }
  return wavFile(data, frames, rate);
}

// 16 bit stereo wav. turned down if anything would clip
function wavFile(channels, frames, rate) {
  let peak = 0;
  for (const samples of channels) for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const scale = peak > 0.98 ? 0.98 / peak : 1;
  const view = new DataView(new ArrayBuffer(44 + frames * 4));
  const text = (at, string) => { for (let i = 0; i < string.length; i++) view.setUint8(at + i, string.charCodeAt(i)); };
  text(0, 'RIFF');
  view.setUint32(4, 36 + frames * 4, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * 4, true);
  for (let i = 0, at = 44; i < frames; i++) {
    for (const samples of channels) {
      view.setInt16(at, Math.max(-1, Math.min(1, samples[i] * scale)) * 32767, true);
      at += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

// a zip of files ([name, blob]), stored as they are: wavs hardly squeeze, so it's just to keep a song's
// stems together in one download
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
async function zipFile(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, blob] of files) {
    const data = new Uint8Array(await blob.arrayBuffer());
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;
    const title = new TextEncoder().encode(name);
    // the local header and its entry in the central directory say the same things
    const fields = (view, at) => {
      view.setUint16(at, 20, true);
      view.setUint16(at + 2, 0x800, true);
      view.setUint16(at + 4, 0, true);
      view.setUint32(at + 6, 0x00210000, true);
      view.setUint32(at + 10, crc, true);
      view.setUint32(at + 14, data.length, true);
      view.setUint32(at + 18, data.length, true);
      view.setUint16(at + 22, title.length, true);
    };
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    fields(head, 4);
    parts.push(head, title, data);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    fields(entry, 6);
    entry.setUint32(42, offset, true);
    central.push(entry, title);
    offset += 30 + title.length + data.length;
  }
  const size = central.reduce((sum, one) => sum + one.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

// ---------- midi files ----------
//
// the notes as a standard midi file (type 1) for a daw or a notation program. a track a layer (a part
// with settings of its own is its own track, playable() in music.js), named for its role and instrument,
// on its own channel with the general midi sound nearest its instrument; the drums on channel 10 as
// general midi's drums. the first track has the tempo, time signature, key (and key changes), the
// sections as markers and the chords as text. slides and bends are pitch bends, an octave either way.
// scenery has no notes to give, and doubling is only the player's

// general midi's sounds (numbered from 0), and the instruments nearest each. anything not here takes
// its family's
const GM_PROGRAMS = {
  0: 'piano felt-keys reverse-piano', 3: 'honky-tonk', 4: 'e-piano wurlitzer', 6: 'harpsichord', 7: 'clavinet', 8: 'celesta', 9: 'glock glass-bell',
  10: 'music-box', 11: 'vibes', 12: 'marimba', 13: 'xylophone bonang', 14: 'bell chime sine-bell', 15: 'santoor zither', 16: 'hammond', 19: 'organ organ-drone',
  20: 'harmonium', 21: 'accordion', 22: 'harmonica melodica', 24: 'nylon oud', 25: 'steel-guitar pedal-steel', 26: 'jazz-guitar',
  27: 'clean-guitar chorus-guitar glide-guitar offset-guitar shimmer-guitar flange-guitar phaser-guitar swell-guitar reverse-guitar',
  29: 'crunch-guitar drive-guitar lead-guitar wah-lead', 30: 'dist-guitar fuzz-guitar metal-guitar sludge-guitar octave-fuzz drop-guitar metal-lead fuzz-lead ebow-lead',
  31: 'harmonics', 32: 'upright', 33: 'pluck-bass chorus-bass', 34: 'pick-bass fuzz-bass', 35: 'fretless', 36: 'slap-bass',
  38: 'synth-bass moog-bass sub-bass chip-bass 808-bass', 39: 'round-bass growl-bass reese', 40: 'violin', 42: 'cello cello-drone',
  44: 'tremolo-strings', 45: 'pizzicato', 46: 'harp lyre', 48: 'strings', 50: 'synth-strings', 52: 'choir-ah chant-voice throat-singing kargyraa',
  53: 'choir-oo soprano humming alto-voice soul-voice', 54: 'vox-pad dream-voice rasp-voice', 55: 'orchestra-hit', 56: 'trumpet', 57: 'trombone',
  58: 'tuba', 59: 'mute-trumpet', 60: 'horn', 61: 'brass-section', 62: 'synth-brass', 65: 'alto-sax', 66: 'tenor-sax', 68: 'oboe', 70: 'bassoon',
  71: 'clarinet', 72: 'piccolo', 73: 'flute bansuri', 74: 'tenor-recorder', 75: 'pan-flute', 76: 'blown-bottle', 77: 'shakuhachi', 78: 'whistle', 79: 'ocarina',
  80: 'square-lead pulse-lead bit-lead', 81: 'saw-lead moog-lead', 82: 'soft-lead', 84: 'pluck-lead', 88: 'shimmer glass-pad', 89: 'warm-pad air-pad deep-drone tape-loop',
  90: 'analog-pad dark-pad fuzz-wall', 92: 'bowed-vibes bowed-metal wine-glass bowed-psaltery', 94: 'haunted-pad', 95: 'void',
  104: 'sitar tanpura', 105: 'banjo', 106: 'shamisen', 107: 'koto', 108: 'kalimba mbira', 109: 'bagpipe didgeridoo', 110: 'erhu', 111: 'shawm',
  112: 'metal-ping bridge-chimes', 114: 'steel-drum',
};
const GM_FAMILIES = { pad: 89, keys: 0, guitar: 27, bell: 14, lead: 80, bass: 33, drone: 89 };
const GM_BY_ID = {};
for (const [program, ids] of Object.entries(GM_PROGRAMS)) for (const id of ids.split(' ')) GM_BY_ID[id] = +program;
const gmProgram = (id) => GM_BY_ID[id] ?? GM_FAMILIES[INSTRUMENTS[id]?.family] ?? 0;
// a kit's slot as general midi's drum: by what was recorded for it, what it is (its voice), or a tom's pitch
const GM_HITS = {
  'open-hat': 46, tambourine: 54, cabasa: 69, guiro: 73, 'sleigh-bells': 54, woodblock: 76, triangle: 81, 'finger-cymbals': 81, 'hand-bells': 81,
  'mark-tree': 81, 'slit-high': 77, 'slit-low': 76, 'bongo-high': 60, cowbell: 56, ride: 51, timpani: 41,
};
const GM_DRUMS = { kick: 36, heart: 36, taiko: 35, snare: 38, brush: 38, clap: 39, slap: 39, noise: 39, rim: 37, hat: 42, crash: 49, ride: 51, shaker: 70, cowbell: 56, gong: 52, conga: 63, dayan: 63, bayan: 64, blip: 76, tick: 75 };
function gmDrum(slot, index) {
  const hit = slot.hit?.split('/').pop();
  if (GM_HITS[hit]) return GM_HITS[hit];
  if (slot.voice === 'hat' && index === 3) return 46;
  if (slot.voice === 'tom') return slot.tune < 80 ? 41 : slot.tune < 110 ? 45 : slot.tune < 160 ? 47 : 50;
  return GM_DRUMS[slot.voice] ?? 37;
}

function midiFile(song, comp) {
  // a beat is a quarter note, but in 6/8 a dotted one
  const quarters = song.meter === '6/8' ? 1.5 : 1;
  const ticks = (beat) => Math.max(0, Math.round(beat * 480 * quarters));
  const varLen = (n) => {
    const out = [n & 0x7f];
    while ((n >>>= 7)) out.unshift((n & 0x7f) | 0x80);
    return out;
  };
  const utf8 = (text) => [...new TextEncoder().encode(text)];
  const meta = (type, data) => [0xff, type, ...varLen(data.length), ...data];
  const u32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  // a track from [tick, order, bytes]: in time, and at the same tick settings, then note offs, then ons
  const track = (events) => {
    events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const out = [];
    let last = 0;
    for (const [at, , data] of events) {
      for (const byte of varLen(at - last)) out.push(byte);
      for (const byte of data) out.push(byte);
      last = at;
    }
    out.push(0, 0xff, 0x2f, 0);
    return [0x4d, 0x54, 0x72, 0x6b, ...u32(out.length), ...out];
  };
  const steps = SCALES[song.scale].steps;
  const signature = (lift) => [(typeof keySignature === 'function' ? keySignature(mod12(song.key + lift), steps) : 0) & 0xff, steps[2] === 3 ? 1 : 0];
  const conductor = [
    [0, -2, meta(0x03, utf8(song.name || 'Song'))],
    [0, -2, meta(0x51, u32(Math.round(60e6 / (song.tempo * quarters))).slice(1))],
    [0, -2, meta(0x58, { '4/4': [4, 2, 24, 8], '3/4': [3, 2, 24, 8], '5/4': [5, 2, 24, 8], '6/8': [6, 3, 36, 8] }[song.meter])],
  ];
  let lift = null;
  for (const section of comp.sections) {
    if ((section.lift || 0) !== lift) conductor.push([ticks(section.start), -2, meta(0x59, signature((lift = section.lift || 0)))]);
    conductor.push([ticks(section.start), -1, meta(0x06, utf8(section.name))]);
    for (const chord of section.chords) conductor.push([ticks(chord.t), -1, meta(0x01, utf8(chord.name))]);
  }
  const tracks = [track(conductor)];
  const free = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
  let next = 0;
  for (const layer of song.layers) {
    const inst = INSTRUMENTS[layer.instrument];
    const notes = comp.notes.filter((note) => note.layer === layer.id).sort((a, b) => a.t - b.t);
    if (!inst || layer.role === 'texture' || !notes.length) continue;
    const drums = inst.kind === 'drums';
    const channel = drums ? 9 : free[next++ % free.length];
    const [base, part] = layer.id.split('~');
    const events = [
      [0, -2, meta(0x03, utf8(`${ROLES[layer.role].name}${base !== layer.role ? ` (${base})` : ''}${part ? `, part ${part}` : ''}: ${inst.name}`))],
      [0, -2, [0xb0 | channel, 7, Math.round(Math.min(1, layer.volume) * 127)]],
      [0, -2, [0xb0 | channel, 10, Math.round(64 + Math.max(-1, Math.min(1, layer.pan)) * 63)]],
    ];
    if (!drums) events.push([0, -2, [0xc0 | channel, gmProgram(layer.instrument)]]);
    // pitch bends reach an octave (registered parameter 0, then closed again)
    if (notes.some((note) => note.bend)) for (const [control, value] of [[101, 0], [100, 0], [6, 12], [38, 0], [101, 127], [100, 127]]) events.push([0, -2, [0xb0 | channel, control, value]]);
    const bend = (at, semitones) => {
      const value = Math.max(0, Math.min(16383, Math.round(8192 + (semitones / 12) * 8191)));
      events.push([at, 2, [0xe0 | channel, value & 0x7f, value >> 7]]);
    };
    // a pitch's note ends where the same pitch starts again, which midi can't tell apart
    const ends = new Map();
    const pitchOf = (note) => Math.max(0, Math.min(127, drums ? gmDrum(inst.slots[note.midi] || {}, note.midi) : Math.round(note.midi)));
    for (let i = notes.length - 1; i >= 0; i--) {
      const note = notes[i];
      const pitch = pitchOf(note);
      const start = ticks(note.t);
      const end = Math.max(start + 1, Math.min(ticks(note.t + (drums ? Math.min(note.dur, 0.25) : note.dur)), ends.get(pitch) ?? Infinity));
      ends.set(pitch, start);
      events.push([start, 1, [0x90 | channel, pitch, Math.max(1, Math.min(127, Math.round((note.vel ?? 0.75) * 127)))]]);
      events.push([end, 0, [0x80 | channel, pitch, 0]]);
      if (note.bend && !drums) {
        // the bend's pins joined in straight lines, a value every sixteenth of a beat, back to 0 at the end
        const pins = note.bend;
        const at = (beat) => {
          if (beat <= pins[0][0]) return pins[0][1];
          for (let k = 1; k < pins.length; k++) {
            if (beat <= pins[k][0]) return pins[k - 1][1] + ((pins[k][1] - pins[k - 1][1]) * (beat - pins[k - 1][0])) / (pins[k][0] - pins[k - 1][0] || 1);
          }
          return pins[pins.length - 1][1];
        };
        for (let beat = 0; beat < note.dur; beat += 1 / 16) bend(ticks(note.t + beat), at(beat));
        events.push([end, 0, [0xe0 | channel, 0, 64]]);
      }
    }
    tracks.push(track(events));
  }
  const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, tracks.length >> 8, tracks.length & 0xff, 480 >> 8, 480 & 0xff];
  return new Blob([new Uint8Array([...head, ...tracks.flat()])], { type: 'audio/midi' });
}
