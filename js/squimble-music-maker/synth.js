/// ================================== squimble music maker: the band ==================================
//
// this file plays composeSong()'s notes (music.js) with the browser's own synthesis (web audio):
// oscillators, filters and delays wired up fresh for every note, either live through the speakers
// (MusicPlayer) or offline into a wav (renderSong()). there are no recordings anywhere.
//
// squimble quest's sound effects work out every sample in javascript (sound.js). music doesn't,
// because songs are minutes long and change while they play: working a whole song out first would
// take seconds every time a slider moved. the plucked strings are the one exception, see ksBuffer().
//
// ---------- instruments ----------
//
// INSTRUMENTS is data, one entry per instrument, so a new one is usually a new line. family is what
// it's listed under (and which roles can use it, roleFamily() in music.js), kind is the engine:
//   sub      subtractive: oscillators (osc: [wave, detune in cents, octave, level]) through a
//            filter. a wave is one of the browser's four or one of WAVES (built from harmonics)
//   fm       frequency modulation: one sine wobbling another's pitch, the bells and electric pianos
//            of the 80s. ratio sets how metallic, index how bright, and indexDecay how fast it mellows.
//            partials: extra sines [ratio, level, seconds to fade]
//   pluck    a plucked string (ksBuffer). bright and decay (seconds) shape it
//   choir    buzzy oscillators through three narrow filters at a vowel's formants (VOWELS)
//   drums    a kit: six slots (KIT_SLOTS), each one of DRUMS with its own tune, tone, decay and gain
//   texture  a background like wind or rain (TEXTURES), held for whole sections
// tonal instruments have env [attack, decay, sustain level, release] in seconds and gain, and can
// have filter { freq, q, env (how far it opens at the start), attack, decay, track (how much it
// follows the note) }, vibrato { rate, depth in cents, delay }, tremolo { rate, depth }, breath (noise).
// a layer's tone (music.js) scales them, so the same instrument sounds different in every song.
//
// ---------- the room ----------
//
// each layer has a channel (volume, pan, and sends to the reverb and echo), and they meet in
// buildGraph()'s chain: drive -> warmth (a low pass filter) -> tape wobble -> compressor -> volume.
// the reverb plays an impulse made of decaying noise (impulse()), so it needs no recorded room.

const mtof = (midi) => 440 * 2 ** ((midi - 69) / 12);

// waves made from harmonics: how strong the 1st, 2nd, 3rd... harmonics are
const WAVES = {
  glass: [1, 0, 0.35, 0, 0.18, 0, 0.1, 0, 0.05],
  organ: [1, 0.6, 0.4, 0.2, 0, 0.15, 0, 0.1],
  hollow: [1, 0, 0.3, 0, 0.12, 0, 0.06],
  soft: [1, 0.25, 0.08, 0.03],
};

// the formants (resonances) of sung vowels: [hz, level]
const VOWELS = {
  ah: [[800, 1], [1150, 0.5], [2900, 0.2]],
  oo: [[350, 1], [650, 0.45], [2700, 0.08]],
};

const KIT_SLOTS = ['Kick', 'Snare', 'Hat', 'Open hat', 'Perc', 'Low perc'];

const INSTRUMENTS = {
  // pads
  'warm-pad':    { name: 'Warm pad', family: 'pad', kind: 'sub', osc: [['sawtooth', -9], ['sawtooth', 9], ['triangle', 0, -1, 0.6]], filter: { freq: 850, q: 0.8, env: 1.8, attack: 1.2, decay: 2 }, env: [1.4, 1.5, 0.8, 2.8], gain: 0.05 },
  'glass-pad':   { name: 'Glass pad', family: 'pad', kind: 'sub', osc: [['glass', -5], ['glass', 6, 1, 0.3]], filter: { freq: 4200, q: 0.5 }, env: [1.8, 2, 0.75, 3.5], gain: 0.07 },
  'choir-ah':    { name: 'Choir, ah', family: 'pad', kind: 'choir', vowel: 'ah', env: [1.1, 1, 0.85, 2.4], gain: 0.22, vibrato: { rate: 4.8, depth: 9, delay: 0.8 } },
  'choir-oo':    { name: 'Choir, oo', family: 'pad', kind: 'choir', vowel: 'oo', env: [1.4, 1, 0.85, 2.8], gain: 0.3, vibrato: { rate: 4.5, depth: 8, delay: 1 } },
  strings:       { name: 'Strings', family: 'pad', kind: 'sub', osc: [['sawtooth', -7], ['sawtooth', 6], ['sawtooth', 1, 1, 0.2]], filter: { freq: 1900, q: 0.6 }, env: [0.8, 1, 0.9, 1.4], gain: 0.042, vibrato: { rate: 5.3, depth: 11, delay: 0.5 } },
  'dark-pad':    { name: 'Dark pad', family: 'pad', kind: 'sub', osc: [['sawtooth', -14], ['square', 12, -1, 0.45]], filter: { freq: 380, q: 3, env: 2.6, attack: 3, decay: 4 }, env: [2.5, 2, 0.8, 4], gain: 0.06 },
  shimmer:       { name: 'Shimmer', family: 'pad', kind: 'sub', osc: [['sine', 0], ['sine', 5, 1, 0.5], ['triangle', -4, 2, 0.18]], env: [2, 2, 0.7, 4.5], gain: 0.07, tremolo: { rate: 3.2, depth: 0.3 } },
  organ:         { name: 'Organ', family: 'pad', kind: 'sub', osc: [['organ', 0], ['organ', 4, 1, 0.3]], filter: { freq: 4500, q: 0.3 }, env: [0.06, 0.4, 0.9, 0.35], gain: 0.06, tremolo: { rate: 6, depth: 0.15 } },
  'air-pad':     { name: 'Air pad', family: 'pad', kind: 'sub', osc: [['sine', 0], ['triangle', 3, 1, 0.15]], breath: 1.6, env: [2.2, 2, 0.8, 3.5], gain: 0.08 },
  'haunted-pad': { name: 'Haunted pad', family: 'pad', kind: 'sub', osc: [['hollow', -24], ['hollow', 21], ['sine', 0, -1, 0.5]], filter: { freq: 1000, q: 5 }, env: [3, 2, 0.8, 4], gain: 0.055, tremolo: { rate: 0.35, depth: 0.55 }, vibrato: { rate: 0.21, depth: 28, delay: 0 } },

  // keys and mallets
  'felt-keys':   { name: 'Felt piano', family: 'keys', kind: 'fm', ratio: 1, index: 1.1, indexDecay: 0.25, sustainIndex: 0.05, partials: [[2, 0.35, 0.5], [3, 0.12, 0.25]], filter: { freq: 2200, q: 0.4, track: 0.5 }, env: [0.006, 1.8, 0, 0.5], gain: 0.2 },
  'e-piano':     { name: 'Electric piano', family: 'keys', kind: 'fm', ratio: 1, index: 1.6, indexDecay: 0.6, sustainIndex: 0.15, partials: [[14, 0.08, 0.04]], env: [0.005, 2.4, 0.15, 0.6], gain: 0.2, tremolo: { rate: 4.5, depth: 0.12 } },
  harp:          { name: 'Harp', family: 'keys', kind: 'pluck', bright: 0.6, decay: 3.5, env: [0.002, 3, 1, 1.2], gain: 0.5 },
  'music-box':   { name: 'Music box', family: 'keys', kind: 'fm', ratio: 5.04, index: 0.5, indexDecay: 0.2, sustainIndex: 0, partials: [[4, 0.25, 0.3]], env: [0.002, 1.4, 0, 0.6], gain: 0.2 },
  marimba:       { name: 'Marimba', family: 'keys', kind: 'fm', ratio: 4, index: 0.9, indexDecay: 0.05, sustainIndex: 0, partials: [[10, 0.06, 0.02]], env: [0.003, 0.45, 0, 0.3], gain: 0.3 },
  kalimba:       { name: 'Kalimba', family: 'keys', kind: 'fm', ratio: 5.4, index: 0.7, indexDecay: 0.04, sustainIndex: 0, partials: [[6.3, 0.1, 0.05]], env: [0.002, 0.9, 0, 0.4], gain: 0.27 },
  celesta:       { name: 'Celesta', family: 'keys', kind: 'fm', ratio: 3, index: 0.6, indexDecay: 0.15, sustainIndex: 0.02, partials: [[2, 0.3, 0.6]], env: [0.002, 1.6, 0, 0.7], gain: 0.2 },
  pizzicato:     { name: 'Pizzicato', family: 'keys', kind: 'pluck', bright: 0.35, decay: 0.7, filter: { freq: 2600, q: 0.6, track: 0.4 }, env: [0.002, 0.6, 1, 0.15], gain: 0.55 },
  vibes:         { name: 'Vibraphone', family: 'keys', kind: 'fm', ratio: 4, index: 0.25, indexDecay: 0.1, sustainIndex: 0, partials: [[10, 0.04, 0.05]], env: [0.003, 3.5, 0, 1.2], gain: 0.24, tremolo: { rate: 5.5, depth: 0.35 } },

  // bells
  bell:          { name: 'Church bell', family: 'bell', kind: 'fm', ratio: 3.5, index: 2.4, indexDecay: 1.2, sustainIndex: 0.2, partials: [[0.5, 0.25, 3], [2.76, 0.1, 1.4]], env: [0.002, 5, 0, 2.5], gain: 0.13 },
  'glass-bell':  { name: 'Glass bell', family: 'bell', kind: 'fm', ratio: 1.4, index: 1, indexDecay: 1.4, sustainIndex: 0.25, env: [0.004, 4, 0, 2], gain: 0.16 },
  chime:         { name: 'Wind chime', family: 'bell', kind: 'fm', ratio: 7.1, index: 0.8, indexDecay: 0.6, sustainIndex: 0.1, partials: [[2.4, 0.2, 1]], env: [0.002, 3, 0, 1.5], gain: 0.14 },

  // leads
  flute:         { name: 'Flute', family: 'lead', kind: 'sub', osc: [['sine', 0], ['triangle', 2, 1, 0.12]], breath: 0.35, env: [0.09, 0.3, 0.85, 0.25], gain: 0.2, vibrato: { rate: 5, depth: 12, delay: 0.35 } },
  ocarina:       { name: 'Ocarina', family: 'lead', kind: 'sub', osc: [['soft', 0]], breath: 0.15, filter: { freq: 2500, q: 0.4 }, env: [0.05, 0.3, 0.8, 0.2], gain: 0.22, vibrato: { rate: 5.5, depth: 8, delay: 0.3 } },
  'soft-lead':   { name: 'Soft lead', family: 'lead', kind: 'sub', osc: [['triangle', -3], ['triangle', 4]], filter: { freq: 1800, q: 0.6, track: 0.5 }, env: [0.04, 0.4, 0.75, 0.4], gain: 0.16, vibrato: { rate: 5, depth: 6, delay: 0.4 } },
  'saw-lead':    { name: 'Saw lead', family: 'lead', kind: 'sub', osc: [['sawtooth', -6], ['sawtooth', 6]], filter: { freq: 1600, q: 2, env: 2.2, attack: 0.02, decay: 0.3, track: 0.5 }, env: [0.01, 0.3, 0.7, 0.25], gain: 0.085, vibrato: { rate: 5.5, depth: 9, delay: 0.3 } },
  'square-lead': { name: 'Square lead', family: 'lead', kind: 'sub', osc: [['square', -4], ['square', 5, -1, 0.3]], filter: { freq: 2000, q: 0.7, track: 0.4 }, env: [0.01, 0.25, 0.65, 0.18], gain: 0.07, vibrato: { rate: 6, depth: 7, delay: 0.25 } },
  violin:        { name: 'Violin', family: 'lead', kind: 'sub', osc: [['sawtooth', 0], ['sawtooth', 5, 0, 0.5]], filter: { freq: 2400, q: 1.2, track: 0.3 }, env: [0.18, 0.4, 0.85, 0.35], gain: 0.085, vibrato: { rate: 5.6, depth: 16, delay: 0.25 } },
  horn:          { name: 'Horn', family: 'lead', kind: 'sub', osc: [['sawtooth', -4], ['sawtooth', 4]], filter: { freq: 700, q: 0.8, env: 2.5, attack: 0.12, decay: 0.5, track: 0.6 }, env: [0.08, 0.4, 0.8, 0.3], gain: 0.09, vibrato: { rate: 4.8, depth: 6, delay: 0.5 } },
  whistle:       { name: 'Whistle', family: 'lead', kind: 'sub', osc: [['sine', 0]], breath: 0.25, env: [0.06, 0.2, 0.9, 0.15], gain: 0.2, vibrato: { rate: 6, depth: 18, delay: 0.2 } },
  'pluck-lead':  { name: 'Plucked synth', family: 'lead', kind: 'sub', osc: [['sawtooth', -5], ['square', 5, 0, 0.5]], filter: { freq: 500, q: 3, env: 7, attack: 0.003, decay: 0.12, track: 0.6 }, env: [0.003, 0.35, 0.2, 0.25], gain: 0.09 },

  // basses
  'sub-bass':    { name: 'Sub bass', family: 'bass', kind: 'sub', osc: [['sine', 0], ['triangle', 0, 0, 0.25]], env: [0.02, 0.3, 0.9, 0.3], gain: 0.42 },
  'round-bass':  { name: 'Round bass', family: 'bass', kind: 'sub', osc: [['triangle', 0], ['sine', 0, -1, 0.5]], filter: { freq: 600, q: 0.5 }, env: [0.01, 0.4, 0.75, 0.2], gain: 0.4 },
  'synth-bass':  { name: 'Synth bass', family: 'bass', kind: 'sub', osc: [['sawtooth', -4], ['square', 4, -1, 0.5]], filter: { freq: 280, q: 4, env: 4, attack: 0.005, decay: 0.15 }, env: [0.005, 0.3, 0.7, 0.12], gain: 0.15 },
  'pluck-bass':  { name: 'Plucked bass', family: 'bass', kind: 'pluck', bright: 0.4, decay: 1.6, filter: { freq: 900, q: 0.7 }, env: [0.002, 1.5, 1, 0.15], gain: 0.8 },
  upright:       { name: 'Upright bass', family: 'bass', kind: 'pluck', bright: 0.2, decay: 1.2, filter: { freq: 500, q: 1 }, env: [0.004, 1, 1, 0.12], gain: 0.95 },
  'growl-bass':  { name: 'Growl bass', family: 'bass', kind: 'sub', osc: [['sawtooth', -10], ['sawtooth', 10], ['square', 0, -1, 0.6]], filter: { freq: 420, q: 6, env: 3, attack: 0.01, decay: 0.25 }, env: [0.005, 0.3, 0.8, 0.12], gain: 0.11 },

  // drones
  'deep-drone':  { name: 'Deep drone', family: 'drone', kind: 'sub', osc: [['sawtooth', -10], ['sawtooth', 9], ['sine', 0, -1, 0.7]], filter: { freq: 300, q: 2 }, env: [4, 3, 0.85, 5], gain: 0.07, tremolo: { rate: 0.13, depth: 0.25 } },
  'cello-drone': { name: 'Cello drone', family: 'drone', kind: 'sub', osc: [['sawtooth', -3], ['sawtooth', 4]], filter: { freq: 700, q: 1.5 }, env: [2.5, 2, 0.85, 3], gain: 0.07, vibrato: { rate: 4.5, depth: 7, delay: 1.5 } },
  void:          { name: 'The void', family: 'drone', kind: 'sub', osc: [['sine', 0], ['sine', 7], ['sine', -5, 1, 0.3]], breath: 0.6, env: [5, 3, 0.85, 6], gain: 0.17, tremolo: { rate: 0.08, depth: 0.4 } },
  'bowed-metal': { name: 'Bowed metal', family: 'drone', kind: 'fm', ratio: 2.71, index: 1.4, indexDecay: 6, sustainIndex: 0.9, env: [3, 2, 0.85, 4], gain: 0.07, vibrato: { rate: 0.3, depth: 20, delay: 0 } },
  'organ-drone': { name: 'Organ drone', family: 'drone', kind: 'sub', osc: [['organ', 0], ['organ', 3, -1, 0.5]], filter: { freq: 1600, q: 0.3 }, env: [2, 2, 0.9, 3], gain: 0.06 },

  // drum kits, slots in KIT_SLOTS order
  'soft-kit': { name: 'Soft kit', family: 'kit', kind: 'drums', slots: [
    { voice: 'kick', tune: 50, decay: 0.35, gain: 0.7 }, { voice: 'brush', tone: 2200, decay: 0.18, gain: 0.3 }, { voice: 'shaker', tone: 5500, decay: 0.07, gain: 0.18 },
    { voice: 'shaker', tone: 5000, decay: 0.25, gain: 0.2 }, { voice: 'tick', tune: 1100, decay: 0.06, gain: 0.2 }, { voice: 'tom', tune: 90, decay: 0.4, gain: 0.45 }] },
  'lofi-kit': { name: 'Lo-fi kit', family: 'kit', kind: 'drums', slots: [
    { voice: 'kick', tune: 52, decay: 0.3, gain: 0.85 }, { voice: 'snare', tone: 1500, decay: 0.22, gain: 0.42 }, { voice: 'hat', tone: 6500, decay: 0.045, gain: 0.18 },
    { voice: 'hat', tone: 6500, decay: 0.3, gain: 0.16 }, { voice: 'rim', tune: 1700, decay: 0.03, gain: 0.25 }, { voice: 'tom', tune: 100, decay: 0.35, gain: 0.5 }] },
  'tight-kit': { name: 'Tight kit', family: 'kit', kind: 'drums', slots: [
    { voice: 'kick', tune: 55, decay: 0.28, gain: 0.9 }, { voice: 'snare', tone: 1900, decay: 0.16, gain: 0.5 }, { voice: 'hat', tone: 8000, decay: 0.035, gain: 0.2 },
    { voice: 'hat', tone: 8000, decay: 0.25, gain: 0.17 }, { voice: 'clap', tone: 1200, decay: 0.15, gain: 0.4 }, { voice: 'tom', tune: 110, decay: 0.3, gain: 0.5 }] },
  taiko: { name: 'Taiko', family: 'kit', kind: 'drums', slots: [
    { voice: 'taiko', tune: 58, decay: 0.9, gain: 0.95 }, { voice: 'rim', tune: 1200, decay: 0.05, gain: 0.35 }, { voice: 'shaker', tone: 4500, decay: 0.08, gain: 0.2 },
    { voice: 'hat', tone: 5000, decay: 0.2, gain: 0.15 }, { voice: 'tick', tune: 900, decay: 0.07, gain: 0.3 }, { voice: 'taiko', tune: 85, decay: 0.6, gain: 0.75 }] },
  heartbeat: { name: 'Heartbeat', family: 'kit', kind: 'drums', slots: [
    { voice: 'heart', tune: 52, decay: 0.2, gain: 0.85 }, { voice: 'brush', tone: 1800, decay: 0.2, gain: 0.25 }, { voice: 'shaker', tone: 6000, decay: 0.05, gain: 0.12 },
    { voice: 'shaker', tone: 5000, decay: 0.2, gain: 0.14 }, { voice: 'tick', tune: 1500, decay: 0.05, gain: 0.16 }, { voice: 'tom', tune: 70, decay: 0.5, gain: 0.5 }] },
  brushes: { name: 'Brushes', family: 'kit', kind: 'drums', slots: [
    { voice: 'kick', tune: 48, decay: 0.3, gain: 0.55 }, { voice: 'brush', tone: 2600, decay: 0.22, gain: 0.38 }, { voice: 'brush', tone: 4000, decay: 0.08, gain: 0.18 },
    { voice: 'brush', tone: 3000, decay: 0.4, gain: 0.22 }, { voice: 'rim', tune: 1500, decay: 0.03, gain: 0.18 }, { voice: 'tom', tune: 95, decay: 0.4, gain: 0.4 }] },
  clockwork: { name: 'Clockwork', family: 'kit', kind: 'drums', slots: [
    { voice: 'kick', tune: 60, decay: 0.12, gain: 0.45 }, { voice: 'tick', tune: 900, decay: 0.05, gain: 0.3 }, { voice: 'tick', tune: 2400, decay: 0.03, gain: 0.2 },
    { voice: 'tick', tune: 1800, decay: 0.12, gain: 0.2 }, { voice: 'rim', tune: 2000, decay: 0.025, gain: 0.25 }, { voice: 'tick', tune: 500, decay: 0.08, gain: 0.3 }] },

  // textures
  wind:     { name: 'Wind', family: 'texture', kind: 'texture', texture: 'wind', gain: 0.9 },
  rain:     { name: 'Rain', family: 'texture', kind: 'texture', texture: 'rain', gain: 0.7 },
  ocean:    { name: 'Ocean', family: 'texture', kind: 'texture', texture: 'ocean', gain: 0.9 },
  vinyl:    { name: 'Vinyl crackle', family: 'texture', kind: 'texture', texture: 'vinyl', gain: 0.6 },
  fire:     { name: 'Campfire', family: 'texture', kind: 'texture', texture: 'fire', gain: 0.8 },
  rumble:   { name: 'Rumble', family: 'texture', kind: 'texture', texture: 'rumble', gain: 1 },
  crickets: { name: 'Crickets', family: 'texture', kind: 'texture', texture: 'crickets', gain: 0.5 },
  hum:      { name: 'Hum', family: 'texture', kind: 'texture', texture: 'hum', gain: 0.6 },
};
// how the instrument lists are grouped on the page
const FAMILIES = { pad: 'Pads', keys: 'Keys and mallets', bell: 'Bells', lead: 'Leads', bass: 'Basses', drone: 'Drones', kit: 'Drum kits', texture: 'Textures' };

// ---------- shared sounds ----------

// noise, crackle and plucked strings are worked out once per sample rate and kept. AudioBuffers
// aren't tied to a context, so the live player and wav renders share them. periodic waves are tied to
// their context, so they're kept per context
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

// a plucked string by the karplus-strong method (1983): a burst of noise goes round a loop one wave
// of the note long, softened a little each time round, which is very nearly what a real string
// does. web audio can't loop that tightly, so this is worked out sample by sample, once per note, and kept
function ksBuffer(rate, midi, bright, decay) {
  const cache = cacheFor(rate).strings;
  const key = `${midi}|${bright.toFixed(2)}|${decay.toFixed(1)}`;
  if (cache.has(key)) return cache.get(key);
  const f = mtof(midi);
  // the averaging below adds half a sample to the loop, hence the - 0.5
  const period = Math.max(2, Math.round(rate / f - 0.5));
  const buffer = new AudioBuffer({ length: Math.floor(rate * Math.min(5, decay + 0.4)), sampleRate: rate });
  const data = buffer.getChannelData(0);
  const ring = new Float32Array(period);
  let last = 0;
  for (let i = 0; i < period; i++) {
    last += (Math.random() * 2 - 1 - last) * bright;
    ring[i] = last;
  }
  // what's kept each time round, so it's 60 dB quieter after decay seconds
  const keep = 0.001 ** (1 / (f * decay));
  for (let i = 0, at = 0; i < data.length; i++) {
    const next = (at + 1) % period;
    data[i] = ring[at];
    ring[at] = (ring[at] + ring[next]) * 0.5 * keep;
    at = next;
  }
  if (cache.size > 500) cache.clear();
  cache.set(key, buffer);
  return buffer;
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
  return amount;
}

// ---------- tonal instruments ----------

// the part every tonal note shares: the volume envelope, then tremolo and the filter in front of it.
// returns where the engine plugs its sound in, and when everything can stop
function voiceChain(ctx, out, inst, tone, f, when, dur, vel) {
  const [attackTime, decay, sustain, releaseTime] = inst.env;
  // never more than half the note, or a short chord would only reach full volume after the beat's gone
  const attack = Math.max(0.002, Math.min(attackTime * tone.attack, dur * 0.5));
  const release = Math.max(0.03, releaseTime * tone.release);
  const peak = inst.gain * vel;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, when);
  amp.gain.linearRampToValueAtTime(peak, when + attack);
  if (sustain < 1) amp.gain.setTargetAtTime(peak * sustain, when + attack, Math.max(0.001, decay / 3));
  // a note shorter than its attack is held until the attack's done, so it can't click off mid ramp
  const off = when + Math.max(dur, attack);
  amp.gain.setTargetAtTime(0, off, release / 4);
  const end = off + release * 1.4 + 0.05;
  amp.connect(out);
  let input = amp;
  if (inst.tremolo) {
    const tremolo = ctx.createGain();
    tremolo.gain.value = 1 - inst.tremolo.depth / 2;
    lfo(ctx, inst.tremolo.rate, inst.tremolo.depth / 2, tremolo.gain, when, end);
    tremolo.connect(input);
    input = tremolo;
  }
  if (inst.filter) {
    const { freq, q = 0.7, env = 1, attack: opens = 0.01, decay: closes = 0.3, track = 0 } = inst.filter;
    const filter = ctx.createBiquadFilter();
    filter.Q.value = q;
    const base = Math.min(16000, freq * tone.bright * (f / 262) ** track);
    filter.frequency.setValueAtTime(base, when);
    if (env !== 1) {
      filter.frequency.linearRampToValueAtTime(Math.min(18000, base * env), when + opens);
      filter.frequency.setTargetAtTime(base, when + opens, closes);
    }
    filter.connect(input);
    input = filter;
  }
  return { input, when, end };
}

function vibrato(ctx, inst, tone, when, end) {
  const depth = (inst.vibrato?.depth || 0) + tone.vibrato;
  if (depth <= 0) return null;
  const amount = ctx.createGain();
  amount.gain.setValueAtTime(0, when);
  amount.gain.linearRampToValueAtTime(depth, when + (inst.vibrato?.delay ?? 0.3) + 0.01);
  const osc = ctx.createOscillator();
  // every note's vibrato runs at a slightly different speed, like real players
  osc.frequency.value = (inst.vibrato?.rate || 5) * (0.92 + Math.random() * 0.16);
  osc.connect(amount);
  osc.start(when);
  osc.stop(end);
  return amount;
}

// a little random tuning per note, more with the layer's detune: real instruments are never exact
const scatter = (tone) => (Math.random() * 2 - 1) * (1.5 + tone.detune * 0.35);

const ENGINES = {
  sub(ctx, voice, inst, tone, f) {
    const wobble = vibrato(ctx, inst, tone, voice.when, voice.end);
    const off = scatter(tone);
    inst.osc.forEach(([wave, detune = 0, octave = 0, level = 1], i) => {
      const osc = ctx.createOscillator();
      setWave(ctx, osc, wave);
      osc.frequency.value = f * 2 ** octave;
      // the layer's detune spreads the oscillators apart, for a wider, more chorused sound
      osc.detune.value = detune + off + (i ? (i % 2 ? 1 : -1) * tone.detune : 0);
      if (wobble) wobble.connect(osc.detune);
      const gain = ctx.createGain();
      gain.gain.value = level;
      osc.connect(gain).connect(voice.input);
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
    const index = inst.index * f * Math.min(4, tone.bright);
    depth.gain.setValueAtTime(index, when);
    depth.gain.setTargetAtTime(index * (inst.sustainIndex ?? 0.1), when, inst.indexDecay ?? 0.3);
    modulator.connect(depth).connect(carrier.frequency);
    const wobble = vibrato(ctx, inst, tone, when, end);
    if (wobble) wobble.connect(carrier.detune);
    carrier.connect(voice.input);
    for (const osc of [carrier, modulator]) {
      osc.start(when);
      osc.stop(end);
    }
    for (const [ratio, level, fade] of inst.partials || []) {
      if (f * ratio > 18000) continue;
      const partial = ctx.createOscillator();
      partial.frequency.value = f * ratio;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(level, when);
      gain.gain.setTargetAtTime(0, when, fade);
      partial.connect(gain).connect(voice.input);
      partial.start(when);
      partial.stop(end);
    }
  },

  pluck(ctx, voice, inst, tone, f, midi) {
    const source = ctx.createBufferSource();
    source.buffer = ksBuffer(ctx.sampleRate, midi, Math.min(0.95, inst.bright * tone.bright), inst.decay * Math.min(2, tone.release));
    source.detune.value = scatter(tone);
    source.connect(voice.input);
    source.start(voice.when);
    source.stop(voice.end);
  },

  choir(ctx, voice, inst, tone, f) {
    const mix = ctx.createGain();
    for (const [freq, level] of VOWELS[inst.vowel]) {
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = freq * Math.min(1.3, tone.bright ** 0.2);
      band.Q.value = freq / 110;
      const gain = ctx.createGain();
      gain.gain.value = level;
      mix.connect(band).connect(gain).connect(voice.input);
    }
    const wobble = vibrato(ctx, inst, tone, voice.when, voice.end);
    // three singers, never quite together
    for (const detune of [-9, 0, 8]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      osc.detune.value = detune * (1 + tone.detune / 15) + scatter(tone);
      if (wobble) wobble.connect(osc.detune);
      osc.connect(mix);
      osc.start(voice.when);
      osc.stop(voice.end);
    }
  },
};

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

// a cymbal the way the roland 808 made one: six square waves at clashing pitches, filtered down to
// just their metallic shimmer, with a little noise for air. plain filtered noise (what I had first)
// sounds like hiss rather than metal. tone is where the filters sit, so brighter kits ring higher
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

// each gets the slot's settings (p): tune (hz), tone (a filter's hz), decay (seconds), gain
const DRUMS = {
  kick(ctx, out, when, vel, p) {
    toneHit(ctx, out, when, vel * p.gain, p.tune * 3.5, p.tune, 0.06, p.decay);
    // the beater's click, so it's heard on small speakers that can't play the low thump
    noiseHit(ctx, out, when, vel * p.gain * 0.2, 'lowpass', 3500, 0.7, 0.001, 0.012);
  },
  heart(ctx, out, when, vel, p) {
    DRUMS.kick(ctx, out, when, vel, p);
    DRUMS.kick(ctx, out, when + 0.24, vel * 0.6, p);
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
    toneHit(ctx, out, when, vel * p.gain * 0.6, 230, 180, 0.04, 0.1, 'triangle');
  },
  hat: (ctx, out, when, vel, p) => metal(ctx, out, when, vel * p.gain, p.tone, p.decay),
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
  // three quick bursts, like hands not quite together
  clap(ctx, out, when, vel, p) {
    for (let i = 0; i < 3; i++) noiseHit(ctx, out, when + i * 0.011, vel * p.gain * (i === 2 ? 1 : 0.6), 'bandpass', p.tone, 1, 0.001, i === 2 ? p.decay : 0.01);
  },
};

// ---------- textures ----------

// each makes its sound from when to end into out, which fades it in and out. bright is the layer's
// brightness. the numbers after the filters bring each up to about the same loudness
const TEXTURES = {
  wind(ctx, out, when, end, bright) {
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 450 * bright;
    band.Q.value = 1.2;
    lfo(ctx, 0.07, 280 * bright, band.frequency, when, end);
    const gust = ctx.createGain();
    gust.gain.value = 2;
    lfo(ctx, 0.11, 1.4, gust.gain, when, end);
    noiseSource(ctx, when, end).connect(band).connect(gust).connect(out);
  },
  rain(ctx, out, when, end, bright) {
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 1200;
    const low = ctx.createBiquadFilter();
    low.frequency.value = 7000 * bright;
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
  ocean(ctx, out, when, end, bright) {
    const low = ctx.createBiquadFilter();
    low.frequency.value = 700 * bright;
    // waves coming in and going out, about 11 seconds each
    const swell = ctx.createGain();
    swell.gain.value = 1.2;
    lfo(ctx, 0.09, 1.1, swell.gain, when, end);
    noiseSource(ctx, when, end).connect(low).connect(swell).connect(out);
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
    const flicker = ctx.createGain();
    flicker.gain.value = 1.2;
    lfo(ctx, 0.6, 0.5, flicker.gain, when, end);
    noiseSource(ctx, when, end).connect(roar).connect(flicker).connect(out);
  },
  rumble(ctx, out, when, end, bright) {
    const low = ctx.createBiquadFilter();
    low.frequency.value = 80 * bright;
    low.Q.value = 2;
    lfo(ctx, 0.05, 25 * bright, low.frequency, when, end);
    const level = ctx.createGain();
    level.gain.value = 5;
    noiseSource(ctx, when, end).connect(low).connect(level).connect(out);
  },
  // two crickets: a high tone chopped up fast (the chirp), switched on and off slowly
  crickets(ctx, out, when, end, bright) {
    for (const [pitch, chirp, rest] of [[4300, 32, 0.9], [4750, 27, 0.63]]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = pitch * Math.min(1.3, bright ** 0.2);
      // a square wave swings -1 to 1, so these sit at half with half either way: off to fully on
      const chop = ctx.createGain();
      chop.gain.value = 0.5;
      lfo(ctx, chirp, 0.5, chop.gain, when, end, 'square');
      const pulse = ctx.createGain();
      pulse.gain.value = 0.15;
      lfo(ctx, rest, 0.15, pulse.gain, when, end, 'square');
      osc.connect(chop).connect(pulse).connect(out);
      osc.start(when);
      osc.stop(end);
    }
  },
  // mains hum and its beating overtones, like a fridge in an empty room
  hum(ctx, out, when, end, bright) {
    const low = ctx.createBiquadFilter();
    low.frequency.value = 500 * bright;
    low.connect(out);
    for (const [freq, level] of [[55, 0.5], [55.35, 0.4], [110.2, 0.25], [165.1, 0.12]]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.value = level;
      osc.connect(gain).connect(low);
      osc.start(when);
      osc.stop(end);
    }
  },
};

function playTexture(ctx, out, inst, tone, when, dur, vel) {
  const fade = Math.min(3, dur / 3);
  const end = when + dur;
  const level = inst.gain * vel;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(level, when + fade);
  gain.gain.setValueAtTime(level, end - fade);
  gain.gain.linearRampToValueAtTime(0, end);
  gain.connect(out);
  TEXTURES[inst.texture](ctx, gain, when, end + 0.05, Math.min(3, tone.bright));
}

// one note of a layer. drums use the layer's release for how long they ring, and brightness for
// their filters
function playNote(ctx, channel, layer, note, when, secondsPerBeat) {
  const inst = INSTRUMENTS[layer.instrument];
  if (!inst || !channel) return;
  const dur = note.dur * secondsPerBeat;
  if (inst.kind === 'drums') {
    const slot = inst.slots[note.midi];
    if (slot) DRUMS[slot.voice](ctx, channel.input, when, note.vel, { ...slot, decay: slot.decay * layer.tone.release, tone: (slot.tone || 0) * layer.tone.bright });
    return;
  }
  if (inst.kind === 'texture') {
    playTexture(ctx, channel.input, inst, layer.tone, when, dur, note.vel);
    return;
  }
  const f = mtof(note.midi);
  ENGINES[inst.kind](ctx, voiceChain(ctx, channel.input, inst, layer.tone, f, when, dur, note.vel), inst, layer.tone, f, note.midi);
}

// ---------- the room ----------

// a room's echo, made up: noise dying away over a second or so to several seconds, getting darker as
// it goes, like a real room where the walls soak up the high end first. the convolver normalises it,
// so a big room isn't louder than a small one
function impulse(ctx, size, tone) {
  const rate = ctx.sampleRate;
  const seconds = 0.6 + size * 6;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  const gap = Math.floor(rate * (0.005 + size * 0.03));
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let low = 0;
    for (let i = gap; i < length; i++) {
      const fade = Math.exp((-6.9 * (i - gap)) / (length - gap));
      low += (Math.random() * 2 - 1 - low) * (0.06 + tone * 0.85 * (1 - (i / length) * 0.8));
      data[i] = low * fade;
    }
  }
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

function buildGraph(ctx) {
  const g = { ctx };
  g.bus = ctx.createGain();
  g.drive = ctx.createWaveShaper();
  g.drive.oversample = '2x';
  g.warmth = ctx.createBiquadFilter();
  g.warmth.Q.value = 0.5;
  // tape wobble: everything goes through a tiny delay whose length wavers, which bends the pitch
  // like a stretched cassette. a slow wow and a faster flutter
  g.wobble = ctx.createDelay(0.1);
  g.wobble.delayTime.value = 0.015;
  g.wow = lfo(ctx, 0.5, 0, g.wobble.delayTime, 0, 1e6);
  g.flutter = lfo(ctx, 6.5, 0, g.wobble.delayTime, 0, 1e6);
  g.comp = ctx.createDynamicsCompressor();
  g.comp.threshold.value = -14;
  g.comp.knee.value = 12;
  g.comp.ratio.value = 3;
  g.comp.attack.value = 0.005;
  g.comp.release.value = 0.2;
  g.master = ctx.createGain();
  g.bus.connect(g.drive).connect(g.warmth).connect(g.wobble).connect(g.comp).connect(g.master).connect(ctx.destination);
  g.reverbIn = ctx.createGain();
  g.reverb = ctx.createConvolver();
  g.reverbIn.connect(g.reverb).connect(g.bus);
  // the echo bounces left and right (ping pong), losing some top end each time
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
  g.echoLeft.connect(left).connect(g.bus);
  g.echoLeft.connect(damp).connect(g.feedLeft).connect(g.echoRight);
  g.echoRight.connect(right).connect(g.bus);
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
  set(g.master.gain, fx.volume ** 2 * 1.3);
  g.ready = true;
}

// a layer's channel: volume, pan, and how much goes to the reverb and the echo
function makeChannel(g) {
  const { ctx } = g;
  const channel = { input: ctx.createGain(), pan: ctx.createStereoPanner(), reverb: ctx.createGain(), echo: ctx.createGain() };
  channel.input.connect(channel.pan);
  channel.pan.connect(g.bus);
  channel.pan.connect(channel.reverb).connect(g.reverbIn);
  channel.pan.connect(channel.echo).connect(g.echoIn);
  return channel;
}
const audible = (song, layer) => (song.layers.some((other) => other.solo) ? layer.solo : !layer.mute);
function setChannel(channel, song, layer, now, glide) {
  const set = (param, value) => (glide ? param.setTargetAtTime(value, now, 0.02) : param.setValueAtTime(value, now));
  set(channel.input.gain, audible(song, layer) ? layer.volume ** 2 * 1.6 : 0);
  set(channel.pan.pan, layer.pan);
  set(channel.reverb.gain, layer.reverb);
  set(channel.echo.gain, layer.echo);
}

// ---------- playing ----------

// plays a song live. load() swaps in a new song or new notes while it plays: notes already sent to
// the browser (the next third of a second) finish as they were, and everything after is the new
// version, so you can change anything mid song. times are beats counted from when play() started,
// including every time round the loop (loopOffset is where the current time round began)
class MusicPlayer {
  constructor() {
    this.ctx = null;
    this.playing = false;
    this.loop = true;
    this.channels = {};
  }

  wake() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.graph = buildGraph(this.ctx);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.song) applySpace(this.graph, this.song.fx, this.song.tempo);
  }

  beatAt(time) { return this.anchorBeat + (time - this.anchorTime) / this.secondsPerBeat; }
  timeAt(beat) { return this.anchorTime + (beat - this.anchorBeat) * this.secondsPerBeat; }

  // where the song is now, in beats from its start
  position() {
    if (!this.playing) return null;
    let beat = this.beatAt(this.ctx.currentTime) - this.loopOffset;
    // loopOffset moves on when the next time round starts being scheduled, a moment early
    if (beat < 0) beat += this.comp.beats;
    return Math.max(0, beat);
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
    this.secondsPerBeat = secondsPerBeat;
    if (this.ctx) applySpace(this.graph, song.fx, song.tempo);
    if (!this.playing) return;
    this.mix();
    // a shorter song that's now behind the playhead starts again from the top
    if (this.scheduledTo - this.loopOffset > comp.beats) this.loopOffset = this.scheduledTo;
    this.index = this.firstFrom(this.scheduledTo - this.loopOffset);
  }

  // volume, pan, mute and solo, without touching the notes
  mix() {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    for (const layer of this.song.layers) {
      if (!this.channels[layer.id]) this.channels[layer.id] = makeChannel(this.graph);
      setChannel(this.channels[layer.id], this.song, layer, now, true);
    }
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

  play(from = 0) {
    this.wake();
    this.stop();
    this.playing = true;
    this.anchorTime = this.ctx.currentTime + 0.06;
    this.anchorBeat = from;
    this.loopOffset = 0;
    this.scheduledTo = from;
    this.channels = {};
    this.mix();
    this.index = this.firstFrom(from);
    // anything already sounding at the start (a pad held over it) plays its remaining part
    for (const note of this.comp.notes) {
      if (note.t < from && note.t + note.dur > from + 0.1) this.send({ ...note, dur: note.t + note.dur - from }, this.anchorTime);
    }
    this.timer = setInterval(() => this.tick(), 25);
    this.tick();
  }

  send(note, when) {
    const layer = this.song.layers.find((one) => one.id === note.layer);
    if (layer) playNote(this.ctx, this.channels[note.layer], layer, note, Math.max(when, this.ctx.currentTime), this.secondsPerBeat);
  }

  // every 25 ms: send the browser every note due in the next 0.3 seconds. it plays them on its own
  // clock, so the timing is exact even when this timer runs late
  tick() {
    if (!this.playing) return;
    const ahead = this.beatAt(this.ctx.currentTime + 0.3);
    const { notes } = this.comp;
    while (this.scheduledTo < ahead) {
      const songEnd = this.loopOffset + this.comp.beats;
      const until = Math.min(ahead, songEnd);
      while (this.index < notes.length && notes[this.index].t + this.loopOffset < until) {
        const note = notes[this.index++];
        this.send(note, this.timeAt(note.t + this.loopOffset));
      }
      this.scheduledTo = until;
      if (until < songEnd || !this.loop) break;
      this.loopOffset = songEnd;
      this.index = 0;
    }
    // not looping: stop once the end's been reached, leaving the last notes to ring out
    if (!this.loop && this.beatAt(this.ctx.currentTime) - this.loopOffset >= this.comp.beats) this.stop(false);
  }

  // plays some notes on a layer's instrument straight away, for hearing a chord or a note while
  // editing. it has its own channel, so it plays even if the layer's muted
  audition(song, layer, midis, beats = 1.5) {
    this.wake();
    const channel = makeChannel(this.graph);
    setChannel(channel, song, { ...layer, mute: false, solo: true }, this.ctx.currentTime, false);
    for (const midi of midis) playNote(this.ctx, channel, layer, { midi, dur: beats, vel: 0.75 }, this.ctx.currentTime + 0.02, 60 / song.tempo);
  }

  // cut: fade everything out now. otherwise notes already sent play out
  stop(cut = true) {
    clearInterval(this.timer);
    if (this.playing && cut) {
      const now = this.ctx.currentTime;
      for (const channel of Object.values(this.channels)) {
        channel.input.gain.setTargetAtTime(0, now, 0.02);
        setTimeout(() => channel.input.disconnect(), 300);
      }
    }
    this.playing = false;
  }
}

// ---------- wav files ----------

// renders a whole song offline, faster than real time. loop: for a game's background music, so the
// end runs straight into the start: the reverb and notes still ringing past the end are folded back
// onto the beginning, so it loops with no gap or click
async function renderSong(song, comp, loop) {
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
  for (const note of comp.notes) playNote(ctx, channels[note.layer], layers[note.layer], note, note.t * secondsPerBeat, secondsPerBeat);
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
