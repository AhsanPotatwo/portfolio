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
// it's listed under (and which roles can use it, roleFamily() in music.js). edge is how harsh or
// cutting it is, 0 (a sine sub bass) to 1 (a saw lead): moods cap it, and backing layers get a lower
// cap than the melody, so a buzzy instrument never ends up under a gentle one (fitBand() in music.js).
// a new instrument needs an edge too, judged by ear. world: 'chip' or 'acoustic' for the sounds that
// belong to one kind of band, left out for ones that go with anything: chip and acoustic sounds never
// share a song (pickInstrument() in music.js). a texture that's steady rather than now and then is a
// bed: a song has one at most. kind is the engine:
//   sub      subtractive: oscillators (osc: [wave, detune in cents, octave, level]) through a
//            filter. a wave is one of the browser's four or one of WAVES (built from harmonics)
//   fm       frequency modulation: one sine wobbling another's pitch, the bells and electric pianos
//            of the 80s. ratio sets how metallic, index how bright, and indexDecay how fast it mellows.
//            partials: extra sines [ratio, level, seconds to fade]
//   pluck    a plucked string (ksBuffer). bright, soft (a finger rather than a pick) and decay
//            (seconds) shape it
//   choir    buzzy oscillators through three narrow filters at a vowel's formants (VOWELS)
//   drums    a kit: six slots (KIT_SLOTS), each one of DRUMS with its own tune, tone, decay and gain.
//            suits: the patterns (music.js PATTERNS) it sounds right playing. a tune is moved to the
//            song's key by the composer (tuneDrum() in music.js)
//   texture  a background like rain or birdsong (TEXTURES), held for whole sections
// tonal instruments have env [attack, decay, sustain level, release] in seconds and gain, and can
// have filter { freq, q, env (how far it opens at the start), attack, decay, track (how much it
// follows the note), lfo [rate, depth] (a slow sweep, depth a share of freq) }, vibrato { rate, depth
// in cents, delay }, tremolo { rate, depth }, breath (noise), fuzz (soft clipping on each note, for a
// wall of guitars), crush (how many steps of loudness are kept, the gritty 8 bit sound), reverse
// (the note swells up over its whole length and stops dead, like tape played backwards) and scoop
// (cents a blown or bowed note starts flat by, sliding up onto it the way players do).
// a layer's tone (music.js) scales them, so the same instrument sounds different in every song. a
// harder note is brighter as well as louder (hardness()), and pads and drones spread their
// oscillators across the stereo field, both of which real instruments do and midi doesn't.
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
  // the nes's pulse channels (a square wave that's on for a quarter or an eighth of each cycle), the
  // sound of undertale and most 8 bit tunes, and its triangle channel, which steps in 16 levels and so
  // has a faint buzz a pure triangle doesn't
  pulse25: Array.from({ length: 32 }, (_, i) => Math.sin(Math.PI * (i + 1) * 0.25) / (i + 1)),
  pulse12: Array.from({ length: 32 }, (_, i) => Math.sin(Math.PI * (i + 1) * 0.125) / (i + 1)),
  chiptri: [1, 0.02, -0.11, 0.015, 0.04, 0.012, -0.02, 0.01, 0.012, 0.008],
};

// the formants (resonances) of sung vowels: [hz, level]
const VOWELS = {
  ah: [[800, 1], [1150, 0.5], [2900, 0.2]],
  oo: [[350, 1], [650, 0.45], [2700, 0.08]],
};

const KIT_SLOTS = ['Kick', 'Snare', 'Hat', 'Open hat', 'Perc', 'Low perc'];

const INSTRUMENTS = {
  // pads
  'warm-pad':    { name: 'Warm pad', family: 'pad', edge: 0.2, kind: 'sub', osc: [['sawtooth', -9], ['sawtooth', 9], ['triangle', 0, -1, 0.6]], filter: { freq: 850, q: 0.8, env: 1.8, attack: 1.2, decay: 2 }, env: [1.4, 1.5, 0.8, 2.8], gain: 0.05 },
  'glass-pad':   { name: 'Glass pad', family: 'pad', edge: 0.25, kind: 'sub', osc: [['glass', -5], ['glass', 6, 1, 0.3]], filter: { freq: 4200, q: 0.5 }, env: [1.8, 2, 0.75, 3.5], gain: 0.07 },
  'choir-ah':    { name: 'Choir, ah', family: 'pad', edge: 0.2, world: 'acoustic', kind: 'choir', vowel: 'ah', env: [1.1, 1, 0.85, 2.4], gain: 0.22, vibrato: { rate: 4.8, depth: 9, delay: 0.8 } },
  'choir-oo':    { name: 'Choir, oo', family: 'pad', edge: 0.1, world: 'acoustic', kind: 'choir', vowel: 'oo', env: [1.4, 1, 0.85, 2.8], gain: 0.3, vibrato: { rate: 4.5, depth: 8, delay: 1 } },
  strings:       { name: 'Strings', family: 'pad', edge: 0.35, kind: 'sub', osc: [['sawtooth', -7], ['sawtooth', 6], ['sawtooth', 1, 1, 0.2]], filter: { freq: 1900, q: 0.6 }, env: [0.8, 1, 0.9, 1.4], gain: 0.042, vibrato: { rate: 5.3, depth: 11, delay: 0.5 } },
  'dark-pad':    { name: 'Dark pad', family: 'pad', edge: 0.3, kind: 'sub', osc: [['sawtooth', -14], ['square', 12, -1, 0.45]], filter: { freq: 380, q: 3, env: 2.6, attack: 3, decay: 4 }, env: [2.5, 2, 0.8, 4], gain: 0.06 },
  shimmer:       { name: 'Shimmer', family: 'pad', edge: 0.15, kind: 'sub', osc: [['sine', 0], ['sine', 5, 1, 0.5], ['triangle', -4, 2, 0.18]], env: [2, 2, 0.7, 4.5], gain: 0.07, tremolo: { rate: 3.2, depth: 0.3 } },
  organ:         { name: 'Organ', family: 'pad', edge: 0.35, kind: 'sub', osc: [['organ', 0], ['organ', 4, 1, 0.3]], filter: { freq: 4500, q: 0.3 }, env: [0.06, 0.4, 0.9, 0.35], gain: 0.06, tremolo: { rate: 6, depth: 0.15 } },
  'air-pad':     { name: 'Air pad', family: 'pad', edge: 0.05, kind: 'sub', osc: [['sine', 0], ['triangle', 3, 1, 0.15]], breath: 1.6, env: [2.2, 2, 0.8, 3.5], gain: 0.08 },
  'haunted-pad': { name: 'Haunted pad', family: 'pad', edge: 0.45, kind: 'sub', osc: [['hollow', -24], ['hollow', 21], ['sine', 0, -1, 0.5]], filter: { freq: 1000, q: 5 }, env: [3, 2, 0.8, 4], gain: 0.055, tremolo: { rate: 0.35, depth: 0.55 }, vibrato: { rate: 0.21, depth: 28, delay: 0 } },
  // a filter that breathes open and shut by itself, the slowly turning analog pads of aphex twin's
  // selected ambient works and the dying light score
  'analog-pad':  { name: 'Analog pad', family: 'pad', edge: 0.25, kind: 'sub', osc: [['sawtooth', -11], ['sawtooth', 12], ['pulse25', 0, -1, 0.5]], filter: { freq: 750, q: 1.4, lfo: [0.11, 0.55] }, env: [1.6, 2, 0.85, 3], gain: 0.05 },
  // have a nice life's wall of guitars: detuned saws clipped together, then darkened, so it's thick
  // rather than buzzy
  'fuzz-wall':   { name: 'Fuzz wall', family: 'pad', edge: 0.4, kind: 'sub', osc: [['sawtooth', -16], ['sawtooth', 15], ['sawtooth', 5, 1, 0.4], ['square', -7, -1, 0.5]], fuzz: 4, filter: { freq: 1300, q: 0.7, lfo: [0.07, 0.25] }, env: [0.9, 2, 0.9, 2.5], gain: 0.057 },
  // swells into each chord and stops dead as the next arrives, an old tape trick of ambient music
  'reverse-piano': { name: 'Reversed piano', family: 'pad', edge: 0.15, kind: 'sub', reverse: true, osc: [['soft', 0], ['glass', 1, 1, 0.25]], filter: { freq: 900, q: 0.5, env: 3, track: 0.4 }, env: [0, 0, 1, 0.08], gain: 0.17 },

  // keys and mallets
  'felt-keys':   { name: 'Felt piano', family: 'keys', edge: 0.1, kind: 'fm', ratio: 1, index: 1.1, indexDecay: 0.25, sustainIndex: 0.05, partials: [[2, 0.35, 0.5], [3, 0.12, 0.25]], filter: { freq: 2200, q: 0.4, track: 0.5 }, env: [0.006, 3, 0, 0.9], gain: 0.2 },
  'e-piano':     { name: 'Electric piano', family: 'keys', edge: 0.2, kind: 'fm', ratio: 1, index: 1.6, indexDecay: 0.6, sustainIndex: 0.15, partials: [[14, 0.08, 0.04]], env: [0.005, 3.2, 0.15, 0.9], gain: 0.2, tremolo: { rate: 4.5, depth: 0.12 } },
  harp:          { name: 'Harp', family: 'keys', edge: 0.15, world: 'acoustic', kind: 'pluck', bright: 0.3, soft: 0.75, decay: 3, filter: { freq: 2000, q: 0.5, track: 0.5 }, env: [0.006, 3, 1, 2.5], gain: 0.6 },
  'music-box':   { name: 'Music box', family: 'keys', edge: 0.3, world: 'acoustic', kind: 'fm', ratio: 5.04, index: 0.5, indexDecay: 0.2, sustainIndex: 0, partials: [[4, 0.25, 0.3]], env: [0.002, 1.4, 0, 0.6], gain: 0.2 },
  marimba:       { name: 'Marimba', family: 'keys', edge: 0.2, world: 'acoustic', kind: 'fm', ratio: 4, index: 0.9, indexDecay: 0.05, sustainIndex: 0, partials: [[10, 0.06, 0.02]], env: [0.003, 0.7, 0, 0.5], gain: 0.3 },
  kalimba:       { name: 'Kalimba', family: 'keys', edge: 0.25, world: 'acoustic', kind: 'fm', ratio: 5.4, index: 0.5, indexDecay: 0.04, sustainIndex: 0, partials: [[6.3, 0.1, 0.05]], env: [0.002, 1.3, 0, 0.6], gain: 0.27 },
  celesta:       { name: 'Celesta', family: 'keys', edge: 0.3, world: 'acoustic', kind: 'fm', ratio: 3, index: 0.6, indexDecay: 0.15, sustainIndex: 0.02, partials: [[2, 0.3, 0.6]], env: [0.002, 1.6, 0, 0.7], gain: 0.2 },
  pizzicato:     { name: 'Pizzicato', family: 'keys', edge: 0.2, world: 'acoustic', kind: 'pluck', bright: 0.35, soft: 0.4, decay: 0.9, filter: { freq: 2600, q: 0.6, track: 0.4 }, env: [0.002, 0.8, 1, 0.3], gain: 0.55 },
  vibes:         { name: 'Vibraphone', family: 'keys', edge: 0.15, world: 'acoustic', kind: 'fm', ratio: 4, index: 0.25, indexDecay: 0.1, sustainIndex: 0, partials: [[10, 0.04, 0.05]], env: [0.003, 3.5, 0, 1.2], gain: 0.24, tremolo: { rate: 5.5, depth: 0.35 } },
  nylon:         { name: 'Nylon guitar', family: 'keys', edge: 0.2, world: 'acoustic', kind: 'pluck', bright: 0.5, soft: 0.45, decay: 2.2, filter: { freq: 3000, q: 0.6, track: 0.3 }, env: [0.003, 2.2, 1, 0.8], gain: 0.8 },
  // a steel string guitar, brighter and longer ringing than the nylon: stardew valley's strummed and
  // fingerpicked guitar
  'steel-guitar': { name: 'Steel guitar', family: 'keys', edge: 0.3, world: 'acoustic', kind: 'pluck', bright: 0.7, soft: 0.25, decay: 2.8, filter: { freq: 4200, q: 0.5, track: 0.3 }, env: [0.002, 2.8, 1, 0.8], gain: 0.6 },

  // bells
  bell:          { name: 'Church bell', family: 'bell', edge: 0.7, world: 'acoustic', kind: 'fm', ratio: 3.5, index: 1.7, indexDecay: 1.2, sustainIndex: 0.15, partials: [[0.5, 0.25, 3], [2.76, 0.1, 1.4]], env: [0.002, 5, 0, 2.5], gain: 0.13 },
  'glass-bell':  { name: 'Glass bell', family: 'bell', edge: 0.3, kind: 'fm', ratio: 2, index: 0.8, indexDecay: 1.4, sustainIndex: 0.2, env: [0.004, 4, 0, 2], gain: 0.16 },
  chime:         { name: 'Wind chime', family: 'bell', edge: 0.45, world: 'acoustic', kind: 'fm', ratio: 7, index: 0.6, indexDecay: 0.6, sustainIndex: 0.1, partials: [[3, 0.2, 1]], env: [0.002, 3, 0, 1.5], gain: 0.14 },
  // nearly a pure tone, the soft bell lead of aphex twin's ageispolis
  'sine-bell':   { name: 'Sine bell', family: 'bell', edge: 0.1, kind: 'fm', ratio: 1, index: 0.35, indexDecay: 0.4, sustainIndex: 0, partials: [[2, 0.12, 0.6]], env: [0.003, 2.2, 0, 1.2], gain: 0.2 },
  // a struck pipe, out of tune with itself on purpose: fallout's rusting wasteland. too harsh for
  // anything but the dark moods
  'metal-ping':  { name: 'Metal ping', family: 'bell', edge: 0.55, kind: 'fm', ratio: 2.41, index: 1.1, indexDecay: 0.5, sustainIndex: 0.08, partials: [[5.43, 0.08, 0.3]], env: [0.002, 3, 0, 2], gain: 0.13 },

  // leads
  flute:         { name: 'Flute', family: 'lead', edge: 0.15, world: 'acoustic', kind: 'sub', osc: [['sine', 0], ['triangle', 2, 1, 0.12]], breath: 0.35, env: [0.09, 0.3, 0.85, 0.5], scoop: 15, gain: 0.2, vibrato: { rate: 5, depth: 12, delay: 0.35 } },
  ocarina:       { name: 'Ocarina', family: 'lead', edge: 0.15, world: 'acoustic', kind: 'sub', osc: [['soft', 0]], breath: 0.15, filter: { freq: 2500, q: 0.4 }, env: [0.05, 0.3, 0.8, 0.45], scoop: 10, gain: 0.22, vibrato: { rate: 5.5, depth: 8, delay: 0.3 } },
  'soft-lead':   { name: 'Soft lead', family: 'lead', edge: 0.2, kind: 'sub', osc: [['triangle', -3], ['triangle', 4]], filter: { freq: 1800, q: 0.6, track: 0.5 }, env: [0.04, 0.4, 0.75, 0.6], scoop: 8, gain: 0.16, vibrato: { rate: 5, depth: 6, delay: 0.4 } },
  'saw-lead':    { name: 'Saw lead', family: 'lead', edge: 1, kind: 'sub', osc: [['sawtooth', -6], ['sawtooth', 6]], filter: { freq: 1600, q: 2, env: 2.2, attack: 0.02, decay: 0.3, track: 0.5 }, env: [0.01, 0.3, 0.7, 0.35], gain: 0.085, vibrato: { rate: 5.5, depth: 9, delay: 0.3 } },
  'square-lead': { name: 'Square lead', family: 'lead', edge: 0.85, world: 'chip', kind: 'sub', osc: [['square', -4], ['square', 5, -1, 0.3]], filter: { freq: 2000, q: 0.7, track: 0.4 }, env: [0.01, 0.25, 0.65, 0.25], gain: 0.07, vibrato: { rate: 6, depth: 7, delay: 0.25 } },
  violin:        { name: 'Violin', family: 'lead', edge: 0.5, world: 'acoustic', kind: 'sub', osc: [['sawtooth', 0], ['sawtooth', 5, 0, 0.5]], filter: { freq: 2400, q: 1.2, track: 0.3 }, env: [0.18, 0.4, 0.85, 0.6], scoop: 20, gain: 0.085, vibrato: { rate: 5.6, depth: 16, delay: 0.25 } },
  horn:          { name: 'Horn', family: 'lead', edge: 0.45, world: 'acoustic', kind: 'sub', osc: [['sawtooth', -4], ['sawtooth', 4]], filter: { freq: 700, q: 0.8, env: 2.5, attack: 0.12, decay: 0.5, track: 0.6 }, env: [0.08, 0.4, 0.8, 0.5], scoop: 15, gain: 0.09, vibrato: { rate: 4.8, depth: 6, delay: 0.5 } },
  whistle:       { name: 'Whistle', family: 'lead', edge: 0.3, world: 'acoustic', kind: 'sub', osc: [['sine', 0]], breath: 0.25, env: [0.06, 0.2, 0.9, 0.35], scoop: 25, gain: 0.2, vibrato: { rate: 6, depth: 18, delay: 0.2 } },
  'pluck-lead':  { name: 'Plucked synth', family: 'lead', edge: 0.6, kind: 'sub', osc: [['sawtooth', -5], ['square', 5, 0, 0.5]], filter: { freq: 500, q: 3, env: 7, attack: 0.003, decay: 0.12, track: 0.6 }, env: [0.003, 0.35, 0.2, 0.25], gain: 0.09 },
  // one nes pulse channel with its delayed vibrato: undertale, deltarune, early terraria
  'pulse-lead':  { name: 'Pulse lead', family: 'lead', edge: 0.6, world: 'chip', kind: 'sub', osc: [['pulse25', 0]], filter: { freq: 5000, q: 0.3, track: 0.3 }, env: [0.004, 0.25, 0.75, 0.18], gain: 0.17, vibrato: { rate: 6, depth: 10, delay: 0.35 } },
  // a square crushed down to a few steps of loudness, the broken atari chip of crystal castles
  'bit-lead':    { name: 'Bit lead', family: 'lead', edge: 0.9, world: 'chip', kind: 'sub', osc: [['sawtooth', 0], ['triangle', 6, 1, 0.5]], crush: 4, filter: { freq: 4000, q: 0.5, track: 0.3 }, env: [0.003, 0.2, 0.7, 0.12], gain: 0.155, vibrato: { rate: 7, depth: 14, delay: 0.15 } },
  'pan-flute':   { name: 'Pan flute', family: 'lead', edge: 0.15, world: 'acoustic', kind: 'sub', osc: [['hollow', 0], ['sine', 0, 1, 0.08]], breath: 0.7, filter: { freq: 2600, q: 0.4 }, env: [0.03, 0.25, 0.8, 0.45], scoop: 18, gain: 0.15, vibrato: { rate: 5.2, depth: 9, delay: 0.4 } },
  // a reed's odd harmonics (the hollow wave), a little breath and a slow, late vibrato: warm and woody,
  // the clarinet of stardew valley's autumn and of old village themes
  clarinet:      { name: 'Clarinet', family: 'lead', edge: 0.2, world: 'acoustic', kind: 'sub', osc: [['hollow', 0], ['sine', 0, 1, 0.06]], breath: 0.12, filter: { freq: 2400, q: 0.5, track: 0.4 }, env: [0.05, 0.4, 0.85, 0.45], scoop: 12, gain: 0.14, vibrato: { rate: 4.8, depth: 5, delay: 0.6 } },
  // two reeds tuned a few cents apart, beating against each other (the musette sound), over a lower
  // reed: a village dance tune
  accordion:     { name: 'Accordion', family: 'lead', edge: 0.4, world: 'acoustic', kind: 'sub', osc: [['pulse25', -8], ['pulse25', 8], ['sawtooth', 0, -1, 0.3]], filter: { freq: 2600, q: 0.6, track: 0.3 }, env: [0.03, 0.3, 0.9, 0.3], gain: 0.1, tremolo: { rate: 5, depth: 0.08 } },
  // 80s brass from a synth, the filter opening as each note swells (dying light, deltarune)
  'synth-brass': { name: 'Synth brass', family: 'lead', edge: 0.6, kind: 'sub', osc: [['sawtooth', -7], ['sawtooth', 7], ['pulse25', 0, -1, 0.4]], filter: { freq: 900, q: 1, env: 3, attack: 0.12, decay: 0.6, track: 0.5 }, env: [0.05, 0.4, 0.85, 0.45], scoop: 15, gain: 0.07, vibrato: { rate: 5, depth: 5, delay: 0.5 } },

  // basses
  'sub-bass':    { name: 'Sub bass', family: 'bass', edge: 0, kind: 'sub', osc: [['sine', 0], ['triangle', 0, 0, 0.25]], env: [0.02, 0.3, 0.9, 0.3], gain: 0.42 },
  'round-bass':  { name: 'Round bass', family: 'bass', edge: 0.1, kind: 'sub', osc: [['triangle', 0], ['sine', 0, -1, 0.5]], filter: { freq: 600, q: 0.5 }, env: [0.01, 0.4, 0.75, 0.2], gain: 0.4 },
  'synth-bass':  { name: 'Synth bass', family: 'bass', edge: 0.5, kind: 'sub', osc: [['sawtooth', -4], ['square', 4, -1, 0.5]], filter: { freq: 280, q: 4, env: 4, attack: 0.005, decay: 0.15 }, env: [0.005, 0.3, 0.7, 0.12], gain: 0.15 },
  'pluck-bass':  { name: 'Plucked bass', family: 'bass', edge: 0.2, kind: 'pluck', bright: 0.4, decay: 1.6, filter: { freq: 900, q: 0.7 }, env: [0.002, 1.5, 1, 0.15], gain: 0.8 },
  upright:       { name: 'Upright bass', family: 'bass', edge: 0.1, world: 'acoustic', kind: 'pluck', bright: 0.2, soft: 0.6, decay: 1.2, filter: { freq: 500, q: 1 }, env: [0.004, 1, 1, 0.12], gain: 0.95 },
  'growl-bass':  { name: 'Growl bass', family: 'bass', edge: 1, kind: 'sub', osc: [['sawtooth', -10], ['sawtooth', 10], ['square', 0, -1, 0.6]], filter: { freq: 420, q: 6, env: 3, attack: 0.01, decay: 0.25 }, env: [0.005, 0.3, 0.8, 0.12], gain: 0.11 },
  'chip-bass':   { name: 'Triangle bass', family: 'bass', edge: 0.15, world: 'chip', kind: 'sub', osc: [['chiptri', 0]], env: [0.003, 0.2, 0.9, 0.06], gain: 0.42 },
  // two saws a little apart, beating slowly against each other under a moving filter
  reese:         { name: 'Reese bass', family: 'bass', edge: 0.6, kind: 'sub', osc: [['sawtooth', -14], ['sawtooth', 14], ['sine', 0, -1, 0.6]], filter: { freq: 380, q: 1.5, lfo: [0.2, 0.35] }, env: [0.01, 0.3, 0.9, 0.15], gain: 0.12 },
  // the high, chorused post-punk bass that carries the tune as much as the root
  'chorus-bass': { name: 'Chorus bass', family: 'bass', edge: 0.35, kind: 'sub', osc: [['sawtooth', -8], ['triangle', 8], ['sine', 0, -1, 0.4]], filter: { freq: 1100, q: 0.8, env: 2, attack: 0.005, decay: 0.2, track: 0.4 }, env: [0.004, 0.5, 0.6, 0.15], gain: 0.18 },

  // drones
  'deep-drone':  { name: 'Deep drone', family: 'drone', edge: 0.35, kind: 'sub', osc: [['sawtooth', -10], ['sawtooth', 9], ['sine', 0, -1, 0.7]], filter: { freq: 300, q: 2 }, env: [4, 3, 0.85, 5], gain: 0.07, tremolo: { rate: 0.13, depth: 0.25 } },
  'cello-drone': { name: 'Cello drone', family: 'drone', edge: 0.3, world: 'acoustic', kind: 'sub', osc: [['sawtooth', -3], ['sawtooth', 4]], filter: { freq: 700, q: 1.5 }, env: [2.5, 2, 0.85, 3], gain: 0.07, vibrato: { rate: 4.5, depth: 7, delay: 1.5 } },
  void:          { name: 'The void', family: 'drone', edge: 0.1, kind: 'sub', osc: [['sine', 0], ['sine', 7], ['sine', -5, 1, 0.3]], breath: 0.6, env: [5, 3, 0.85, 6], gain: 0.17, tremolo: { rate: 0.08, depth: 0.4 } },
  'bowed-metal': { name: 'Bowed metal', family: 'drone', edge: 0.6, kind: 'fm', ratio: 2.71, index: 1.4, indexDecay: 6, sustainIndex: 0.9, env: [3, 2, 0.85, 4], gain: 0.07, vibrato: { rate: 0.3, depth: 20, delay: 0 } },
  'organ-drone': { name: 'Organ drone', family: 'drone', edge: 0.3, kind: 'sub', osc: [['organ', 0], ['organ', 3, -1, 0.5]], filter: { freq: 1600, q: 0.3 }, env: [2, 2, 0.9, 3], gain: 0.06 },
  // a warm tone on a worn tape loop, drooping and swelling: basinski, and aphex twin's quieter side
  'tape-loop':   { name: 'Tape loop', family: 'drone', edge: 0.1, kind: 'sub', osc: [['soft', 0], ['sine', 3, 1, 0.3]], filter: { freq: 1200, q: 0.4 }, env: [3, 2, 0.85, 4], gain: 0.1, vibrato: { rate: 0.17, depth: 14, delay: 0 }, tremolo: { rate: 0.09, depth: 0.3 } },

  // drum kits, slots in KIT_SLOTS order
  'soft-kit': { name: 'Soft kit', family: 'kit', world: 'acoustic', kind: 'drums', suits: ['pulse', 'sparse', 'brush', 'halftime', 'groove'], slots: [
    { voice: 'kick', tune: 50, decay: 0.35, gain: 0.7 }, { voice: 'brush', tone: 2200, decay: 0.18, gain: 0.3 }, { voice: 'shaker', tone: 5500, decay: 0.07, gain: 0.18 },
    { voice: 'shaker', tone: 5000, decay: 0.25, gain: 0.2 }, { voice: 'tick', tune: 1100, decay: 0.06, gain: 0.2 }, { voice: 'tom', tune: 90, decay: 0.4, gain: 0.45 }] },
  'lofi-kit': { name: 'Lo-fi kit', family: 'kit', kind: 'drums', suits: ['groove', 'halftime', 'sparse', 'pulse'], slots: [
    { voice: 'kick', tune: 52, decay: 0.3, gain: 0.85 }, { voice: 'snare', tune: 180, tone: 1500, decay: 0.22, gain: 0.42 }, { voice: 'hat', tone: 6500, decay: 0.045, gain: 0.18 },
    { voice: 'hat', tone: 6500, decay: 0.3, gain: 0.16 }, { voice: 'rim', tune: 1700, decay: 0.03, gain: 0.25 }, { voice: 'tom', tune: 100, decay: 0.35, gain: 0.5 }] },
  'tight-kit': { name: 'Tight kit', family: 'kit', kind: 'drums', suits: ['groove', 'halftime', 'march', 'tribal', 'sparse', 'pulse'], slots: [
    { voice: 'kick', tune: 55, decay: 0.28, gain: 0.9 }, { voice: 'snare', tune: 180, tone: 1900, decay: 0.16, gain: 0.5 }, { voice: 'hat', tone: 8000, decay: 0.035, gain: 0.2 },
    { voice: 'hat', tone: 8000, decay: 0.25, gain: 0.17 }, { voice: 'clap', tone: 1200, decay: 0.15, gain: 0.4 }, { voice: 'tom', tune: 110, decay: 0.3, gain: 0.5 }] },
  taiko: { name: 'Taiko', family: 'kit', world: 'acoustic', kind: 'drums', suits: ['tribal', 'march', 'pulse', 'halftime', 'sparse'], slots: [
    { voice: 'taiko', tune: 58, decay: 0.9, gain: 0.95 }, { voice: 'rim', tune: 1200, decay: 0.05, gain: 0.35 }, { voice: 'shaker', tone: 4500, decay: 0.08, gain: 0.2 },
    { voice: 'hat', tone: 5000, decay: 0.2, gain: 0.15 }, { voice: 'tick', tune: 900, decay: 0.07, gain: 0.3 }, { voice: 'taiko', tune: 85, decay: 0.6, gain: 0.75 }] },
  heartbeat: { name: 'Heartbeat', family: 'kit', kind: 'drums', suits: ['pulse', 'sparse'], slots: [
    { voice: 'heart', tune: 52, decay: 0.2, gain: 0.85 }, { voice: 'brush', tone: 1800, decay: 0.2, gain: 0.25 }, { voice: 'shaker', tone: 6000, decay: 0.05, gain: 0.12 },
    { voice: 'shaker', tone: 5000, decay: 0.2, gain: 0.14 }, { voice: 'tick', tune: 1500, decay: 0.05, gain: 0.16 }, { voice: 'tom', tune: 70, decay: 0.5, gain: 0.5 }] },
  brushes: { name: 'Brushes', family: 'kit', world: 'acoustic', kind: 'drums', suits: ['brush', 'sparse', 'pulse'], slots: [
    { voice: 'kick', tune: 48, decay: 0.3, gain: 0.55 }, { voice: 'brush', tone: 2600, decay: 0.22, gain: 0.38 }, { voice: 'brush', tone: 4000, decay: 0.08, gain: 0.18 },
    { voice: 'brush', tone: 3000, decay: 0.4, gain: 0.22 }, { voice: 'rim', tune: 1500, decay: 0.03, gain: 0.18 }, { voice: 'tom', tune: 95, decay: 0.4, gain: 0.4 }] },
  clockwork: { name: 'Clockwork', family: 'kit', kind: 'drums', suits: ['pulse', 'sparse', 'march', 'groove', 'halftime'], slots: [
    { voice: 'kick', tune: 60, decay: 0.12, gain: 0.45 }, { voice: 'tick', tune: 900, decay: 0.05, gain: 0.3 }, { voice: 'tick', tune: 2400, decay: 0.03, gain: 0.2 },
    { voice: 'tick', tune: 1800, decay: 0.12, gain: 0.2 }, { voice: 'rim', tune: 2000, decay: 0.025, gain: 0.25 }, { voice: 'tick', tune: 500, decay: 0.08, gain: 0.3 }] },
  // the nes's drums: square wave thumps and bursts of noise
  'chip-kit': { name: 'Chip kit', family: 'kit', world: 'chip', kind: 'drums', suits: ['groove', 'march', 'halftime', 'four', 'break', 'pulse', 'sparse'], slots: [
    { voice: 'blip', tune: 55, decay: 0.16, gain: 0.58 }, { voice: 'noise', tone: 7000, decay: 0.13, gain: 0.58 }, { voice: 'noise', tone: 14000, decay: 0.03, gain: 0.29 },
    { voice: 'noise', tone: 12000, decay: 0.2, gain: 0.23 }, { voice: 'blip', tune: 880, decay: 0.04, gain: 0.22 }, { voice: 'blip', tune: 110, decay: 0.18, gain: 0.45 }] },
  // a club kit, 909 style: a long kick, claps, tight hats (crystal castles, dying light's chases)
  'club-kit': { name: 'Club kit', family: 'kit', kind: 'drums', suits: ['four', 'break', 'groove', 'halftime'], slots: [
    { voice: 'kick', tune: 50, decay: 0.5, gain: 1 }, { voice: 'clap', tone: 1400, decay: 0.2, gain: 0.48 }, { voice: 'hat', tone: 9500, decay: 0.03, gain: 0.17 },
    { voice: 'hat', tone: 9000, decay: 0.35, gain: 0.15 }, { voice: 'rim', tune: 1700, decay: 0.03, gain: 0.2 }, { voice: 'tom', tune: 80, decay: 0.4, gain: 0.45 }] },
  // a cheap drum machine in a big room, its snare left ringing: post-punk, have a nice life, and the
  // beats under aphex twin's early ambient
  machine: { name: 'Drum machine', family: 'kit', kind: 'drums', suits: ['groove', 'halftime', 'break', 'pulse', 'sparse', 'four', 'march'], slots: [
    { voice: 'kick', tune: 52, decay: 0.4, gain: 0.85 }, { voice: 'snare', tune: 190, tone: 1200, decay: 0.4, gain: 0.45 }, { voice: 'hat', tone: 7000, decay: 0.04, gain: 0.15 },
    { voice: 'hat', tone: 7000, decay: 0.3, gain: 0.13 }, { voice: 'rim', tune: 1300, decay: 0.04, gain: 0.22 }, { voice: 'tom', tune: 100, decay: 0.5, gain: 0.45 }] },

  // textures. they're scenery: most are now things that happen now and then with quiet in between,
  // like the vinyl's crackle, because a steady wash (the old wind) was loud and rarely added anything.
  // each gain brings it to about the vinyl's loudness (measured with tests/levels.html)
  wind:     { name: 'Wind', family: 'texture', kind: 'texture', texture: 'wind', gain: 0.25 },
  // rain and crickets sit lower than the rest: they're mostly high frequencies, which the ear hears
  // as louder and harsher than the same level of wind or ocean
  rain:     { name: 'Rain', family: 'texture', kind: 'texture', texture: 'rain', bed: true, gain: 0.12 },
  ocean:    { name: 'Ocean', family: 'texture', kind: 'texture', texture: 'ocean', bed: true, gain: 0.2 },
  vinyl:    { name: 'Vinyl crackle', family: 'texture', kind: 'texture', texture: 'vinyl', bed: true, gain: 0.6 },
  fire:     { name: 'Campfire', family: 'texture', kind: 'texture', texture: 'fire', bed: true, gain: 0.3 },
  rumble:   { name: 'Rumble', family: 'texture', kind: 'texture', texture: 'rumble', gain: 0.4 },
  crickets: { name: 'Crickets', family: 'texture', kind: 'texture', texture: 'crickets', bed: true, gain: 0.2 },
  hum:      { name: 'Hum', family: 'texture', kind: 'texture', texture: 'hum', bed: true, gain: 0.15 },
  drips:    { name: 'Cave drips', family: 'texture', kind: 'texture', texture: 'drips', gain: 0.3 },
  geiger:   { name: 'Geiger counter', family: 'texture', kind: 'texture', texture: 'geiger', gain: 0.7 },
  birds:    { name: 'Birdsong', family: 'texture', kind: 'texture', texture: 'birds', gain: 0.15 },
  creaks:   { name: 'Creaking metal', family: 'texture', kind: 'texture', texture: 'creaks', gain: 1.2 },
  // more of a place for ambient songs: a brook babbling (steady, but only bubbles, no hiss), leaves
  // rustling now and then, frogs, a far off owl, and wind chimes somewhere out of sight
  stream:   { name: 'Brook', family: 'texture', kind: 'texture', texture: 'stream', bed: true, gain: 0.035 },
  leaves:   { name: 'Rustling leaves', family: 'texture', kind: 'texture', texture: 'leaves', gain: 0.6 },
  frogs:    { name: 'Frogs', family: 'texture', kind: 'texture', texture: 'frogs', gain: 0.8 },
  owl:      { name: 'Owl', family: 'texture', kind: 'texture', texture: 'owl', gain: 0.08 },
  chimes:   { name: 'Distant chimes', family: 'texture', kind: 'texture', texture: 'chimes', gain: 0.09 },
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
// does. web audio can't loop that tightly, so this is worked out sample by sample, once per note, and kept.
// soft mixes the noise with the smooth triangle a string takes when a finger pulls it aside: that has
// hardly any high overtones, so the note starts round instead of with a hard metallic zing. the harp
// was all noise at first, and it hit too hard and rang like wire
function ksBuffer(rate, midi, bright, decay, soft) {
  const cache = cacheFor(rate).strings;
  const key = `${midi}|${bright.toFixed(2)}|${decay.toFixed(1)}|${soft}`;
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
    // pulled aside a third of the way along, and centred on zero
    const x = i / period;
    const pulled = (x < 0.3 ? x / 0.3 : (1 - x) / 0.7) - 0.5;
    ring[i] = last * (1 - soft) + pulled * soft;
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
function voiceChain(ctx, out, inst, tone, f, when, dur, vel, pump) {
  const [attackTime, decay, sustain, releaseTime] = inst.env;
  // never more than half the note, or a short chord would only reach full volume after the beat's gone
  let attack = Math.max(0.002, Math.min(attackTime * tone.attack, dur * 0.5));
  let release = Math.max(0.03, releaseTime * tone.release);
  // a reversed note swells over all of itself, and a pumped one (a club pad ducking under every kick,
  // pad.pump in music.js) over half. both let go at once, so the next starts clean
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
    const { freq, q = 0.7, env = 1, attack: opens = 0.01, decay: closes = 0.3, track = 0, lfo: sweep } = inst.filter;
    const filter = ctx.createBiquadFilter();
    filter.Q.value = q;
    const base = Math.min(16000, freq * tone.bright * (f / 262) ** track * hardness(vel));
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
  return { input, when, end, vel, dur };
}

// how much brighter a note is for being played harder, about 1 at a middling 0.75. every real
// instrument does this (a piano struck hard rings brighter, not just louder), and every note sounding
// the same colour whatever its strength was a lot of what made the band sound like midi
const hardness = (vel) => 0.6 + 0.55 * vel;

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

// fuzz (soft clipping, tanh) and crush (rounding to a few steps of loudness) bend a note's wave
// through a curve. curves aren't tied to a context, so they're made once and kept
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

const ENGINES = {
  sub(ctx, voice, inst, tone, f) {
    const wobble = vibrato(ctx, inst, tone, voice.when, voice.end);
    const off = scatter(tone);
    // fuzz and crush get the oscillators mixed down to the curve's range first, so every instrument
    // hits it equally hard however many oscillators it stacks
    let into = voice.input;
    if (inst.fuzz || inst.crush) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = shapeCurve(inst.fuzz ? 'fuzz' : 'crush', inst.fuzz || inst.crush);
      shaper.connect(voice.input);
      into = ctx.createGain();
      into.gain.value = 1 / inst.osc.reduce((sum, [, , , level = 1]) => sum + level, 0);
      into.connect(shaper);
    }
    // pads and drones spread their oscillators across the stereo field, like a string section or a
    // chorus pedal: one mono point in the middle sounded like a keyboard, not a room full of players
    const wide = (inst.family === 'pad' || inst.family === 'drone') && inst.osc.length > 1;
    inst.osc.forEach(([wave, detune = 0, octave = 0, level = 1], i) => {
      const osc = ctx.createOscillator();
      setWave(ctx, osc, wave);
      osc.frequency.value = f * 2 ** octave;
      // the layer's detune spreads the oscillators apart, for a wider, more chorused sound
      const cents = detune + off + (i ? (i % 2 ? 1 : -1) * tone.detune : 0);
      // scoop: a blown or bowed note starts a little flat and slides up onto the note, as players do.
      // not quick notes, where it would only sound out of tune
      const scoop = voice.dur > 0.2 ? inst.scoop || 0 : 0;
      osc.detune.setValueAtTime(cents - scoop, voice.when);
      if (scoop) osc.detune.linearRampToValueAtTime(cents, voice.when + 0.07);
      if (wobble) wobble.connect(osc.detune);
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
    // high strings ring for less time than low ones, as on a real harp. every note ringing just as long
    // left the top notes hanging on, thin and glassy
    const decay = inst.decay * Math.min(2, tone.release) * Math.min(1, (330 / f) ** 0.5);
    // brightness rounded to tenths, so the strings kept per note stay few (ksBuffer's cache)
    const bright = Math.round(Math.min(0.95, inst.bright * tone.bright * hardness(voice.vel)) * 10) / 10;
    source.buffer = ksBuffer(ctx.sampleRate, midi, Math.max(0.1, bright), decay, inst.soft || 0);
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

// each gets the slot's settings (p): tune (hz), tone (a filter's hz), decay (seconds), gain, and step
// (one step of the groove, in seconds)
const DRUMS = {
  kick(ctx, out, when, vel, p) {
    toneHit(ctx, out, when, vel * p.gain, p.tune * 3.5, p.tune, 0.06, p.decay);
    // the beater's click, so it's heard on small speakers that can't play the low thump
    noiseHit(ctx, out, when, vel * p.gain * 0.2, 'lowpass', 3500, 0.7, 0.001, 0.012);
  },
  // lub-dub. the dub lands a whole number of groove steps later, so it's on the grid like everything
  // else: it used to be a fixed 0.24 seconds, which fell between the steps at most tempos
  heart(ctx, out, when, vel, p) {
    let gap = p.step || 0.24;
    while (gap < 0.15) gap *= 2;
    DRUMS.kick(ctx, out, when, vel, p);
    DRUMS.kick(ctx, out, when + gap, vel * 0.6, p);
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
};

// ---------- textures ----------

// each makes its sound from when to end into out, which fades it in and out. bright is the layer's
// brightness, and the pitched ones (hum, crickets, drips, birds) take the song's home note from midi
// and stay on its home note, fifth or fourth, which are in every key's scales. the numbers after the
// filters bring each up to about the same loudness
//
// most happen now and then, with quiet in between, the way the vinyl's crackle does: the wind was a
// steady roar of noise, and it drowned the tune while rarely adding anything. moments() picks when

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

// tiny bubbles for the brook: each a short sine whose pitch jumps up as it bursts, scattered over a
// few seconds that loop. worked out once per sample rate, like the crackle, so a brook minutes long
// isn't thousands of oscillators
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
  // two crickets: a high tone chopped up fast (the chirp), switched on and off slowly. they sing the
  // song's home note and the note above it, high up: at fixed pitches they were a whistle out of key.
  // the chirp is a triangle, not a square, so each one fades rather than clicking on and off
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
  // water dripping into a pool in a cave, every few seconds: minecraft's caves, fallout's vaults. each
  // drop is a little bubble whose pitch jumps up as it bursts, on the home note or fifth, now and then
  // with a second drop after
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
  // metal settling somewhere far off, a slow scraping groan, then a long quiet (fallout, dying light).
  // the groan is a low buzz through a narrow, sliding resonance, chopped quickly like something
  // catching and slipping
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
  // a brook: bubbles babbling past (bubbleBuffer) on two loops at different speeds, so they never line
  // up the same way, over the faintest low wash of water. it swells and settles slowly, the way a
  // stream's sound comes and goes on the breeze. it's a steady sound, but only bubbles, never a hiss
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
  // wind chimes somewhere out of sight: now and then the breeze knocks a few together, thin bells on
  // the home note, fourth or fifth, high up and fading slowly. their overtone is harmonic (3), as the
  // gentle bells' are, so they never clash with the chords
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
};

function playTexture(ctx, out, inst, tone, when, dur, vel, midi) {
  const fade = Math.min(3, dur / 3);
  const end = when + dur;
  const level = inst.gain * vel;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(level, when + fade);
  gain.gain.setValueAtTime(level, end - fade);
  gain.gain.linearRampToValueAtTime(0, end);
  gain.connect(out);
  TEXTURES[inst.texture](ctx, gain, when, end + 0.05, Math.min(3, tone.bright), midi);
}

// one note of a layer. drums use the layer's release for how long they ring, and brightness for
// their filters. a drum note's tune is its slot's, moved into the song's key by the composer
function playNote(ctx, channel, layer, note, when, secondsPerBeat) {
  const inst = INSTRUMENTS[layer.instrument];
  if (!inst || !channel) return;
  const dur = note.dur * secondsPerBeat;
  if (inst.kind === 'drums') {
    const slot = inst.slots[note.midi];
    // drums sit a little under everything else: at full level every kick pushed the compressor down,
    // and the whole band pumped with it
    if (slot) DRUMS[slot.voice](ctx, channel.input, when, note.vel * 0.7, { ...slot, tune: note.tune || slot.tune, step: dur, decay: slot.decay * layer.tone.release, tone: (slot.tone || 0) * layer.tone.bright });
    return;
  }
  if (inst.kind === 'texture') {
    playTexture(ctx, channel.input, inst, layer.tone, when, dur, note.vel, note.midi);
    return;
  }
  const f = mtof(note.midi);
  ENGINES[inst.kind](ctx, voiceChain(ctx, channel.input, inst, layer.tone, f, when, dur, note.vel, note.pump), inst, layer.tone, f, note.midi);
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
    // early reflections: the first few bounces off the nearest walls, heard as separate taps before
    // the wash. different on each side, so the room is wide. a wash of noise on its own is the sound
    // of a cheap reverb, a room with no walls
    // together they carry about a fifth of the energy of the wash's first 80 ms, and each is smeared
    // over a few samples, so it's a soft knock rather than a click
    let early = 0;
    for (let i = gap; i < Math.min(length, gap + rate * 0.08); i++) early += data[i] * data[i];
    const level = Math.sqrt((early * 0.35) / 7 / 4);
    for (let k = 0; k < 7; k++) {
      const at = gap + Math.floor(rate * (0.004 + Math.random() * (0.01 + size * 0.05)));
      const sign = Math.random() < 0.5 ? -1 : 1;
      for (let j = 0; j < 12 && at + j < length; j++) data[at + j] += sign * level * (1 - k * 0.08) * Math.exp(-j / 3);
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
