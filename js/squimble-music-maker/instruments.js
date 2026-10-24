// ================================ squimble music maker: the instruments ================================
//
// every sound the band can play, as plain data: synth.js plays them and music.js picks bands from
// them. no page or audio, so node and the game can load it. load it first, before synth.js and
// music.js
//
// ---------- instruments ----------
//
// INSTRUMENTS is data, a line per instrument:
//   family    what it's listed under, and which roles can use it (roleFamily() in music.js)
//   edge      how harsh, 0 (a sine sub) to 1 (a saw lead), judged by ear. moods cap it, lower for
//             backing (maxEdge in music.js)
//   world     'chip' or 'acoustic' for sounds of one kind of band: the two never share a song
//   own       only in moods that name it: never a surprise, and a kit or texture never borrowed
//   bed       a steady texture rather than one that happens now and then: one a song at most
//   kind      the engine:
//     sub      oscillators (osc: [wave, detune cents, octave, level]) through a filter. a wave is the
//              browser's own or one of WAVES
//     fm       one sine wobbling another's pitch (80s bells and electric pianos): ratio how metallic,
//              index how bright, indexDecay how fast it mellows, partials extra sines [ratio, level, fade]
//     pluck    a plucked string (ksBuffer): bright, soft (a finger rather than a pick), decay, ring (how
//              fast the top dies), buzz (a sitar's bridge), twang (cents sharp at the pluck), sustain (a
//              held tone under the string, an ebow). note.mute palm mutes it
//     modal    something struck, from the pitches it rings at (modalBuffer explains its settings)
//     choir    buzzy oscillators through a vowel's formants (VOWELS): singers (their detunes), breath, rasp
//     drums    a kit: slots (KIT_SLOTS) of DRUMS, each with a tune, tone, decay and gain. suits: the
//              patterns it sounds right playing
//     texture  scenery (TEXTURES), held for whole sections
//     sample   a recording (ENGINES.sample), played once the instrument's samples have loaded
// tonal ones have env [attack, decay, sustain, release] in seconds and gain, and can have filter { freq,
// q, env, attack, decay, track, lfo [rate, depth] }, vibrato { rate, depth, delay }, tremolo { rate,
// depth }, breath (noise), fuzz (soft clipping), crush (8 bit steps), reverse (swells up and stops dead),
// scoop (cents a note starts flat), chiff (a flute's puff, an organ's click), drift (cents a held note
// wanders) and ensemble (each oscillator or singer drifts on its own, like a section).
//   ornaments  which ornaments its players use and how often (ornament() in music.js)
//   body       its body's resonances, and rotary a leslie speaker: built once per layer (instrumentChain)
//   amp        a rig of pedals, an amp and a cabinet in the layer's channel (ampChain)
//   home       the note a singer (or a didgeridoo) was recorded near: their part sits round it
//   sung       a voice singing a phrase as one line (singLine), not a note at a time. a recorded choir
//              does too when it has a tune or counter melody to sing (sings())
//   octave     where it plays a part, in octaves from the role's place (a cello under a flute)
//   drop       semitones lower its part sits, for a guitar tuned down (drop b's roots sit three under standard's)
//   range      [lowest, highest] a voice sang: its part is folded into it (composeSong)
//   pedal      a piano whose sustain pedal a mood can hold down (pedal() in music.js)
// a layer's tone scales these, so an instrument sounds different in every song, a harder note is
// brighter as well as louder (hardness()), and any note can slide, bend, shake and swell (pitchMods).
//
// a kit's drums. rock kits have a ride for perc, a floor tom for low perc, and a crash: kits without
// one crash on their open hat (the drum composer in music.js)
const KIT_SLOTS = ['Kick', 'Snare', 'Hat', 'Open hat', 'Perc', 'Low perc', 'Crash'];

const INSTRUMENTS = {
  // pads
  // the analog pads drift a little, like an old synth's oscillators: a perfectly steady pad sounds like
  // a computer
  'warm-pad':    { name: 'Warm pad', family: 'pad', edge: 0.2, kind: 'sub', osc: [['sawtooth', -9], ['sawtooth', 9], ['triangle', 0, -1, 0.6]], filter: { freq: 850, q: 0.8, env: 1.8, attack: 1.2, decay: 2 }, env: [1.4, 1.5, 0.8, 2.8], drift: 3, gain: 0.05 },
  'glass-pad':   { name: 'Glass pad', family: 'pad', edge: 0.25, kind: 'sub', osc: [['glass', -5], ['glass', 6, 1, 0.3]], filter: { freq: 4200, q: 0.5 }, env: [1.8, 2, 0.75, 3.5], gain: 0.07 },
  // a choir is lots of people a little out of time and tune (ensemble), which is why a real one shimmers
  'choir-ah':    { name: 'Choir, ah', family: 'pad', edge: 0.2, world: 'acoustic', kind: 'choir', vowel: 'ah', env: [1.1, 1, 0.85, 2.4], ensemble: true, drift: 7, gain: 0.22, vibrato: { rate: 4.8, depth: 9, delay: 0.8 }, samples: 'choir-aahs', sampled: { name: 'Choir (FluidR3)', gain: 0.2 }, more: { 'choir-aahs-2': { name: 'Choir (Musyng Kite)', gain: 0.18 } } },
  'choir-oo':    { name: 'Choir, oo', family: 'pad', edge: 0.1, world: 'acoustic', kind: 'choir', vowel: 'oo', env: [1.4, 1, 0.85, 2.8], ensemble: true, drift: 7, gain: 0.3, vibrato: { rate: 4.5, depth: 8, delay: 1 }, samples: 'choir-oohs', sampled: { name: 'Choir (FluidR3)', gain: 0.57 }, more: { 'voice-oohs-2': { name: 'Choir (Musyng Kite)', gain: 0.65 } } },
  // a synth choir (an eighties keyboard "ooh"), a vibraphone played with a bow (a glassy swell), and
  // strings shivering in tremolo (a film's tense scene)
  'vox-pad':     { name: 'Synth choir', family: 'pad', edge: 0.15, kind: 'choir', vowel: 'oo', env: [1.3, 1, 0.85, 2.6], ensemble: true, drift: 4, gain: 0.3, samples: 'synth-choir', sampled: { name: 'Synth choir (Musyng Kite)', gain: 0.41 } },
  'bowed-vibes': { name: 'Bowed vibraphone', family: 'pad', edge: 0.1, world: 'acoustic', kind: 'sub', osc: [['sine', 0], ['sine', 2, 1, 0.12], ['sine', -2, 2, 0.04]], env: [1.4, 1, 0.9, 3.5], gain: 0.083, samples: 'bowed-vibes', sampled: { name: 'Bowed vibraphone (VCSL)', gain: 0.93, reach: 12 } },
  'tremolo-strings': { name: 'Tremolo strings', family: 'pad', edge: 0.4, world: 'acoustic', kind: 'sub', osc: [['bowed', -8], ['bowed', 7], ['bowed', 0, 0, 0.8]], breath: 0.05, filter: { freq: 2800, q: 0.5, track: 0.3 }, body: [[280, 4, 2], [460, 3, 2.5], [2800, 4, 0.9]], env: [0.5, 1, 0.9, 1.2], ensemble: true, drift: 5, gain: 0.03, tremolo: { rate: 11, depth: 0.45 }, samples: 'tremolo-strings', sampled: { name: 'Tremolo strings (VSCO)', gain: 0.68 }, more: { 'tremolo-strings-2': { name: 'Tremolo strings (Musyng Kite)', gain: 0.2 } } },
  // a string section: bowed waves for several players each drifting on their own, bow noise, and a
  // violin's wooden body, which is most of what makes it strings rather than a synth pad
  strings:       { name: 'Strings', family: 'pad', edge: 0.35, kind: 'sub', osc: [['bowed', -8], ['bowed', 7], ['bowed', 0, 0, 0.8], ['bowed', 3, 1, 0.12]], breath: 0.04, filter: { freq: 2600, q: 0.5, track: 0.3 }, body: [[280, 4, 2], [460, 3, 2.5], [1500, -3, 1.2], [2800, 4, 0.9]], env: [0.8, 1, 0.9, 1.4], ensemble: true, drift: 5, gain: 0.024, vibrato: { rate: 5.3, depth: 9, delay: 0.5 }, samples: 'strings', sampled: { name: 'Strings (VSCO)', gain: 0.9 }, more: { 'string-ensemble': { name: 'Strings (Musyng Kite)', gain: 0.18 } } },
  'dark-pad':    { name: 'Dark pad', family: 'pad', edge: 0.3, kind: 'sub', osc: [['sawtooth', -14], ['square', 12, -1, 0.45]], filter: { freq: 380, q: 3, env: 2.6, attack: 3, decay: 4 }, env: [2.5, 2, 0.8, 4], drift: 3, gain: 0.06 },
  shimmer:       { name: 'Shimmer', family: 'pad', edge: 0.15, kind: 'sub', osc: [['sine', 0], ['sine', 5, 1, 0.5], ['triangle', -4, 2, 0.18]], env: [2, 2, 0.7, 4.5], gain: 0.07, tremolo: { rate: 3.2, depth: 0.3 } },
  organ:         { name: 'Organ', family: 'pad', edge: 0.35, kind: 'sub', osc: [['organ', 0], ['organ', 4, 1, 0.3]], filter: { freq: 4500, q: 0.3 }, env: [0.06, 0.4, 0.9, 0.35], gain: 0.06, tremolo: { rate: 6, depth: 0.15 }, samples: 'pipe-organ', sampled: { name: 'Pipe organ (VCSL)', gain: 0.33 }, more: { 'renaissance-organ': { name: 'Renaissance chamber organ (VCSL)', gain: 0.3 } } },
  'air-pad':     { name: 'Air pad', family: 'pad', edge: 0.05, kind: 'sub', osc: [['sine', 0], ['triangle', 3, 1, 0.15]], breath: 1.6, env: [2.2, 2, 0.8, 3.5], gain: 0.08 },
  'haunted-pad': { name: 'Haunted pad', family: 'pad', edge: 0.45, kind: 'sub', osc: [['hollow', -24], ['hollow', 21], ['sine', 0, -1, 0.5]], filter: { freq: 1000, q: 5 }, env: [3, 2, 0.8, 4], gain: 0.055, tremolo: { rate: 0.35, depth: 0.55 }, vibrato: { rate: 0.21, depth: 28, delay: 0 } },
  // a filter that breathes open and shut by itself, the slowly turning analog pads of aphex twin's
  // selected ambient works and the dying light score
  'analog-pad':  { name: 'Analog pad', family: 'pad', edge: 0.25, kind: 'sub', osc: [['sawtooth', -11], ['sawtooth', 12], ['pulse25', 0, -1, 0.5]], filter: { freq: 750, q: 1.4, lfo: [0.11, 0.55] }, env: [1.6, 2, 0.85, 3], drift: 3, gain: 0.05 },
  // have a nice life's wall of guitars: detuned saws clipped together, then darkened, so it's thick
  // rather than buzzy
  'fuzz-wall':   { name: 'Fuzz wall', family: 'pad', edge: 0.4, kind: 'sub', osc: [['sawtooth', -16], ['sawtooth', 15], ['sawtooth', 5, 1, 0.4], ['square', -7, -1, 0.5]], fuzz: 4, filter: { freq: 1300, q: 0.7, lfo: [0.07, 0.25] }, env: [0.9, 2, 0.9, 2.5], gain: 0.057 },
  // swells into each chord and stops dead as the next arrives, an old tape trick of ambient music
  'reverse-piano': { name: 'Reversed piano', family: 'pad', edge: 0.15, kind: 'sub', reverse: true, osc: [['soft', 0], ['glass', 1, 1, 0.25]], filter: { freq: 900, q: 0.5, env: 3, track: 0.4 }, env: [0, 0, 1, 0.08], gain: 0.17, samples: 'piano', sampled: { name: 'Steinway, backwards (VCSL)', gain: 0.41, backwards: true, reverse: false } },
  // guitars as pads: slowdive's volume swells (the knob rolled up after each chord's picked, through a
  // chorus), and my bloody valentine's reverse reverb, a fuzzed chord sucked in backwards
  'swell-guitar':  { name: 'Swelling guitar', family: 'pad', edge: 0.2, own: true, kind: 'pluck', bright: 0.55, soft: 0.3, decay: 4, sustain: 0.8, env: [0.9, 2, 0.9, 2.5], gain: 1,
    amp: { tight: 80, curve: 'tube', gain: 2, cab: 5000, level: 0.3, chorus: [0.5, 0.005] }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 1.9, env: [0.5, 1, 1, 1.5] }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 2.6 }, 'green-guitar': { name: 'Green guitar (Karoryfer)', gain: 1.4, env: [0.5, 1, 1, 1.5] } } },
  'reverse-guitar': { name: 'Reversed guitar', family: 'pad', edge: 0.4, own: true, kind: 'sub', reverse: true, osc: [['sawtooth', -6], ['sawtooth', 6]], filter: { freq: 1600, q: 0.5 }, env: [0, 0, 1, 0.08], gain: 0.5,
    amp: { tight: 60, curve: 'soft', gain: 30, mids: [900, -6], cab: 3500, level: 0.05, reverse: 0.6 } },
  // a horn section (trumpets, saxes and a trombone) playing chords together: the punchy stabs of funk,
  // soul and mettaton's big band. brass waves, the filter opening as each chord blares, every player a
  // little apart
  'brass-section': { name: 'Brass section', family: 'pad', edge: 0.5, world: 'acoustic', kind: 'sub', osc: [['brass', -9], ['brass', 8], ['brass', 0, 0, 0.8]], filter: { freq: 750, q: 0.9, env: 3.2, attack: 0.07, decay: 0.4, track: 0.5 }, body: [[1200, 4, 1], [2600, 3, 1.2]], env: [0.04, 0.4, 0.8, 0.3], scoop: 15, ensemble: true, drift: 4, gain: 0.066, vibrato: { rate: 5, depth: 4, delay: 0.6 }, samples: 'brass-section', sampled: { name: 'Brass section (FluidR3)', gain: 0.35 }, more: { 'brass-section-2': { name: 'Brass (Musyng Kite)', gain: 0.49 } } },
  // a harmonium, india's little pumped reed organ: free reeds (bright and nasal) under a raga, wheezing
  // slightly as the bellows go
  harmonium:     { name: 'Harmonium', family: 'pad', edge: 0.3, world: 'acoustic', own: true, kind: 'sub', osc: [['freereed', -4], ['freereed', 5], ['freereed', 0, -1, 0.5]], breath: 0.05, filter: { freq: 2600, q: 0.5, track: 0.3 }, body: [[900, 3, 1]], env: [0.08, 0.5, 0.9, 0.3], drift: 2, gain: 0.076, tremolo: { rate: 0.6, depth: 0.08 }, samples: 'reed-organ', sampled: { name: 'Reed organ (FluidR3)', gain: 0.13 }, more: { 'reed-organ-2': { name: 'Reed organ (Musyng Kite)', gain: 0.28 } } },
  // a string machine: a whole string section from one keyboard's divided down saws, slightly out of tune
  // with themselves, swelling in. disco's strings (chic, the bee gees) and 80s pop
  'synth-strings': { name: 'String machine', family: 'pad', edge: 0.3, kind: 'sub', osc: [['sawtooth', -10], ['sawtooth', 10], ['sawtooth', 0, 1, 0.3]], filter: { freq: 2400, q: 0.5, track: 0.3 }, env: [0.25, 0.6, 0.9, 0.8], ensemble: true, drift: 3, gain: 0.038, samples: 'synth-strings', sampled: { name: 'String machine (FluidR3)', gain: 0.098 }, more: { 'synth-strings-2': { name: 'String machine (Musyng Kite)', gain: 0.1 } } },
  // the orchestra hit: a whole orchestra's chord, stabbed once, the 80s sampler's party trick and then
  // hip hop's (afrika bambaataa, public enemy). it plays stabs
  'orchestra-hit': { name: 'Orchestra hit', family: 'pad', edge: 0.6, own: true, kind: 'sub', osc: [['brass', -8], ['brass', 8], ['sawtooth', 0, -1, 0.5]], filter: { freq: 3000, q: 0.6, env: 2, attack: 0.005, decay: 0.2 }, env: [0.004, 0.35, 0.15, 0.3], gain: 0.23, samples: 'orchestra-hit', sampled: { name: 'Orchestra hit (FluidR3)', gain: 0.41 }, more: { 'orchestra-hit-2': { name: 'Orchestra hit (Musyng Kite)', gain: 0.43 } } },

  // keys and mallets
  // the struck ones are modal (modalBuffer): every overtone a real one rings with, dying at its own rate
  // a felt piano: felt laid between the hammers and strings, so the top's soft and the strike's a
  // muffled thump (nils frahm, the quiet minecraft pieces). two strings a note, beating slowly
  'felt-keys':   { name: 'Felt piano', family: 'keys', edge: 0.1, pedal: true, kind: 'modal', modes: [[1, 1, 3.4], [2, 0.42, 1.9, 0.3], [3, 0.16, 1.2, 0.6], [4, 0.07, 0.8, 0.9], [5, 0.03, 0.5, 1.2]], strike: [0.22, 500, 0.025], unison: 0.9, stretch: 0.0003, track: 0.5, env: [0.003, 1, 1, 0.5], gain: 0.47, samples: 'knight-upright', sampled: { name: 'Knight upright, played softly (VCSL)', gain: 0.82, filter: { freq: 2200, q: 0.5 } }, more: { 'upright-piano': { name: 'Upright piano (VSCO)', gain: 0.82, filter: { freq: 2400, q: 0.5 } }, 'yamaha-upright': { name: 'Yamaha upright, soft (VCSL)', gain: 0.69 } } },
  // a fender rhodes: a struck tine, nearly a pure tone, its second harmonic growling in when it's hit
  // hard (the "bark", hard), with the stereo tremolo the suitcase model had
  'e-piano':     { name: 'Electric piano', family: 'keys', edge: 0.2, pedal: true, kind: 'modal', modes: [[1, 1, 3.6], [2, 0.16, 1.5, 0.8], [3, 0.05, 0.6, 1.4], [7, 0.05, 0.05, 2]], strike: [0.04, 3000, 0.003], track: 0.4, env: [0.003, 1, 1, 0.6], gain: 0.3, tremolo: { rate: 4.5, depth: 0.12 }, samples: 'electric-piano', sampled: { name: 'Rhodes (FluidR3)', gain: 0.22 }, more: { rhodes: { name: 'Rhodes (Musyng Kite)', gain: 0.28 }, 'dx-piano': { name: 'DX7 style electric piano (FluidR3)', gain: 0.41, weight: 0.5 }, 'fm-piano': { name: 'Yamaha TX81Z FM piano (VCSL)', gain: 0.52, weight: 0.5 } } },
  // a harp's soundboard (body) gives its low strings their warmth
  harp:          { name: 'Harp', family: 'keys', edge: 0.15, world: 'acoustic', kind: 'pluck', bright: 0.3, soft: 0.75, decay: 3, filter: { freq: 2000, q: 0.5, track: 0.5 }, body: [[220, 3, 1.2], [700, 2, 1.2]], env: [0.006, 3, 1, 2.5], gain: 0.43, samples: 'harp', sampled: { name: 'Concert harp (VCSL)', gain: 0.55 }, more: { 'folk-harp': { name: 'Folk harp (VCSL)', gain: 0.6 }, 'vsco-harp': { name: 'Harp (VSCO)', gain: 0.49 } } },
  // a hungarian zither (citera): melody strings over drones, plucked with a pick, bright and rattly
  zither:        { name: 'Zither', family: 'keys', edge: 0.3, world: 'acoustic', kind: 'pluck', bright: 0.75, soft: 0.2, decay: 2.5, ring: 0.4, twang: 6, body: [[300, 3, 1.5], [1300, 3, 1.5]], env: [0.002, 2.5, 1, 1], gain: 0.69, ornaments: { grace: 0.08, slide: 0.04 }, samples: 'zither', sampled: { name: 'Hungarian zither (sfzinstruments)', gain: 1.3, reach: 12 } },
  // a music box's comb: steel teeth plucked by pins, a tick and then nearly pure tones
  'music-box':   { name: 'Music box', family: 'keys', edge: 0.3, world: 'acoustic', kind: 'modal', modes: [[1, 1, 1.8], [4, 0.2, 0.35, 0.8], [2, 0.05, 1]], strike: [0.12, 6000, 0.003], track: 0.4, env: [0.002, 1, 1, 0.6], gain: 0.34, samples: 'music-box', sampled: { name: 'Music box (FluidR3)', gain: 0.53 }, more: { 'music-box-2': { name: 'Music box (Musyng Kite)', gain: 0.91 } } },
  // a marimba's bars are tuned so their first overtones are two octaves and a bit over three up, and
  // the tube under each one feeds the low note, so it's warm and woody and the top dies fast
  marimba:       { name: 'Marimba', family: 'keys', edge: 0.2, world: 'acoustic', kind: 'modal', modes: [[1, 1, 1.1], [4, 0.14, 0.22, 0.7], [9.9, 0.04, 0.06, 1.2]], strike: [0.12, 1500, 0.006], track: 0.7, env: [0.002, 1, 1, 0.5], gain: 0.45, samples: 'marimba', sampled: { name: 'Marimba (VCSL)', gain: 0.53 }, more: { balafon: { name: 'Balafon (VCSL)', gain: 2.7 } } },
  // a kalimba's metal tine: a pure note with a short, high, out of tune overtone at the thumb's flick
  kalimba:       { name: 'Kalimba', family: 'keys', edge: 0.25, world: 'acoustic', kind: 'modal', modes: [[1, 1, 1.5], [5.9, 0.12, 0.12, 1], [2, 0.03, 0.4]], strike: [0.15, 3000, 0.004], track: 0.5, env: [0.002, 1, 1, 0.6], gain: 0.45, samples: 'kalimba', sampled: { name: 'Kalimba (FluidR3)', gain: 1.3 }, more: { 'kenya-kalimba': { name: 'Kenyan kalimba (VCSL)', gain: 1.6 } } },
  celesta:       { name: 'Celesta', family: 'keys', edge: 0.3, world: 'acoustic', kind: 'modal', modes: [[1, 1, 1.6], [2, 0.2, 0.6, 0.5], [3, 0.05, 0.25, 1]], strike: [0.1, 2000, 0.005], track: 0.4, env: [0.002, 1, 1, 0.7], gain: 0.39, samples: 'celesta', sampled: { name: 'Celesta (FluidR3)', gain: 0.39 }, more: { 'celesta-2': { name: 'Celesta (Musyng Kite)', gain: 0.56 } } },
  pizzicato:     { name: 'Pizzicato', family: 'keys', edge: 0.2, world: 'acoustic', kind: 'pluck', bright: 0.35, soft: 0.4, decay: 0.9, filter: { freq: 2600, q: 0.6, track: 0.4 }, body: [[280, 4, 2], [460, 3, 2.5], [2800, 3, 0.9]], env: [0.002, 0.8, 1, 0.3], gain: 0.3, samples: 'pizzicato', sampled: { name: 'Pizzicato (VSCO)', gain: 0.3 }, more: { 'violin-pizz': { name: 'Solo violin, plucked (VSCO)', gain: 0.41 } } },
  // vibes: aluminium bars, long ringing, and the motor turning discs in the tubes (the tremolo)
  vibes:         { name: 'Vibraphone', family: 'keys', edge: 0.15, world: 'acoustic', kind: 'modal', modes: [[1, 1, 3.5], [4, 0.08, 0.7, 0.6], [10, 0.02, 0.12, 1]], strike: [0.06, 2500, 0.004], track: 0.5, env: [0.003, 1, 1, 1.2], gain: 0.39, tremolo: { rate: 5.5, depth: 0.35 }, samples: 'vibraphone', sampled: { name: 'Vibraphone (VCSL)', gain: 0.58 }, more: { 'vibraphone-2': { name: 'Vibraphone (Musyng Kite)', gain: 1 } } },
  // guitars ring through a wooden box: its air rings at about 100 hz and its top at about 200, which
  // is the warmth an acoustic guitar has and a plucked string alone doesn't
  nylon:         { name: 'Nylon guitar', family: 'keys', edge: 0.2, world: 'acoustic', kind: 'pluck', bright: 0.5, soft: 0.45, decay: 2.2, filter: { freq: 3000, q: 0.6, track: 0.3 }, body: [[105, 5, 2], [210, 4, 2], [420, -2, 1.5], [2500, 2, 0.8]], env: [0.003, 2.2, 1, 0.8], gain: 0.8, ornaments: { slide: 0.05, grace: 0.04 }, samples: 'iowa-nylon', sampled: { name: 'Classical guitar (University of Iowa)', gain: 0.64 }, more: { 'nylon-guitar': { name: 'Nylon guitar (FluidR3)', gain: 0.29, weight: 0.5 } } },
  // a steel string guitar, brighter and longer ringing than the nylon: stardew valley's strummed and
  // fingerpicked guitar
  'steel-guitar': { name: 'Steel guitar', family: 'keys', edge: 0.3, world: 'acoustic', kind: 'pluck', bright: 0.7, soft: 0.25, decay: 2.8, filter: { freq: 4200, q: 0.5, track: 0.3 }, body: [[100, 5, 2], [190, 4, 2], [3000, 3, 1]], env: [0.002, 2.8, 1, 0.8], gain: 0.5, ornaments: { slide: 0.05 }, samples: 'steel-guitar', sampled: { name: 'Steel string guitar (FluidR3)', gain: 0.3 }, more: { 'shiny-acoustic': { name: 'Acoustic guitar (Karoryfer)', gain: 0.53 } } },
  // the desert's lute, fretless and picked with a quill: a short, woody, nasal pluck, ornamented the
  // way oud players do (graces and little trills)
  oud:           { name: 'Oud', family: 'keys', edge: 0.3, world: 'acoustic', own: true, kind: 'pluck', bright: 0.6, soft: 0.2, decay: 1.5, filter: { freq: 2600, q: 0.8, track: 0.4 }, body: [[150, 4, 2], [300, 3, 2], [1800, 3, 1]], env: [0.002, 1.5, 1, 0.5], gain: 0.68, ornaments: { grace: 0.2, trill: 0.08, slide: 0.15 }, samples: 'strumstick', sampled: { gain: 1.2 } },
  // a steel pan: its octave and twelfth are hammered in tune with it, so it's bright then mellow
  // rather than clangy
  'steel-drum':  { name: 'Steel drum', family: 'keys', edge: 0.3, world: 'acoustic', own: true, kind: 'modal', modes: [[1, 1, 1.5], [2, 0.5, 0.9, 0.5], [3, 0.2, 0.4, 0.8], [4, 0.08, 0.2, 1]], strike: [0.12, 3000, 0.005], track: 0.4, env: [0.003, 1, 1, 0.7], gain: 0.52, samples: 'steel-drum', sampled: { name: 'Steel drum (J. Learman)', gain: 0.79 }, more: { 'steel-drum-2': { name: 'Steel drums (Musyng Kite)', gain: 0.65 } } },
  // a grand piano: three strings a note a touch apart (unison) so it shimmers, its overtones a little
  // sharp of true (stretch, the stiffness of steel strings, which is why pianos are tuned stretched),
  // each dying at its own rate, the top dying first, and the felt hammer's thump. harder is brighter
  // (hard on the upper modes)
  piano:         { name: 'Grand piano', family: 'keys', edge: 0.2, world: 'acoustic', pedal: true, kind: 'modal', modes: [[1, 1, 5], [2, 0.55, 3.3, 0.2], [3, 0.35, 2.4, 0.4], [4, 0.22, 1.8, 0.6], [5, 0.14, 1.4, 0.8], [6, 0.09, 1.1, 1], [7, 0.05, 0.9, 1.2], [8, 0.04, 0.7, 1.4], [9, 0.025, 0.5, 1.6], [10, 0.015, 0.4, 1.8]], strike: [0.3, 2500, 0.012], unison: 1.2, stretch: 0.0005, track: 0.6, env: [0.002, 1, 1, 0.35], gain: 0.45, samples: 'piano', sampled: { name: 'Steinway B grand (VCSL)', gain: 0.68 }, more: { 'splendid-piano': { name: 'Steinway grand (Akai, Splendid Grand)', gain: 0.55 }, cp80: { name: 'Yamaha CP80 electric grand', gain: 0.23, weight: 0.5 }, 'kawai-grand': { name: 'Kawai grand (VCSL)', gain: 0.67 } } },
  // a hammond organ: tonewheels (perfectly in tune, so no drift), the drawbars, a click as each key
  // makes contact (chiff), and the leslie speaker spinning (rotary, see instrumentChain), which is the
  // swirl of jazz, gospel and soul organ
  hammond:       { name: 'Hammond organ', family: 'keys', edge: 0.35, kind: 'sub', osc: [['drawbar', 0]], chiff: 0.3, filter: { freq: 5000, q: 0.3 }, env: [0.005, 0.2, 1, 0.08], rotary: 1.1, gain: 0.11, samples: 'drawbar-organ', sampled: { name: 'Hammond organ (FluidR3)', gain: 0.27 }, more: { 'drawbar-organ-2': { name: 'Drawbar organ (Musyng Kite)', gain: 0.22 } } },
  // a clavinet: a string hit by a rubber pad and damped by yarn the moment you let go, through a
  // pickup. bright, short and funky (stevie wonder's superstition)
  clavinet:      { name: 'Clavinet', family: 'keys', edge: 0.45, kind: 'pluck', bright: 0.85, soft: 0, decay: 0.7, ring: 0.4, body: [[1200, 5, 1.5], [3000, 4, 1]], env: [0.002, 0.7, 1, 0.06], gain: 0.59, samples: 'clavinet', sampled: { name: 'Clavinet (FluidR3)', gain: 0.32 }, more: { 'clavisynth': { name: 'FM clavinet (VCSL)', gain: 0.31 } } },
  // a banjo: a string over a drum skin, so it's bright, short and ringing with no deep bass (the head
  // rings at about 700 hz). twang: a plucked string starts a little sharp and settles
  banjo:         { name: 'Banjo', family: 'keys', edge: 0.4, world: 'acoustic', kind: 'pluck', bright: 0.8, soft: 0.05, decay: 1.1, twang: 10, body: [[700, 7, 2.5], [2200, 5, 1.5], [160, -5, 1]], env: [0.002, 1.1, 1, 0.25], gain: 0.69, ornaments: { slide: 0.08, grace: 0.06 }, samples: 'ganjo', sampled: { name: 'Guitar banjo (sfzinstruments)', gain: 0.57 }, more: { banjo: { name: 'Banjo (FluidR3)', gain: 0.5, weight: 0.5 } } },
  // a sitar: its curved bridge (the jawari) lets the string brush it, so it buzzes and the buzz sweeps
  // as the note dies (buzz). players bend and slide between notes (meend) all the time, so it has a
  // lot of ornaments, and slow slides (glide)
  sitar:         { name: 'Sitar', family: 'keys', edge: 0.4, world: 'acoustic', own: true, kind: 'pluck', bright: 0.75, soft: 0.1, decay: 3.2, ring: 0.35, buzz: 0.12, twang: 8, body: [[350, 4, 2], [1400, 3, 1.5], [3200, 3, 1]], env: [0.002, 3, 1, 0.8], gain: 0.75, ornaments: { slide: 0.5, grace: 0.25, trill: 0.1, glide: 0.22 }, samples: 'sitar', sampled: { name: 'Sitar (FluidR3)', gain: 0.45 }, more: { 'sitar-2': { name: 'Sitar (Musyng Kite)', gain: 0.3 } } },
  // a koto: thirteen silk strings over movable bridges. pressing the string behind the bridge bends
  // a note up (bend)
  koto:          { name: 'Koto', family: 'keys', edge: 0.25, world: 'acoustic', own: true, kind: 'pluck', bright: 0.6, soft: 0.25, decay: 2.2, twang: 14, body: [[250, 4, 2], [900, 3, 1.5]], env: [0.002, 2.2, 1, 0.6], gain: 0.75, ornaments: { bend: 0.25, bendBy: 2, grace: 0.1, glide: 0.15, release: 0.15 }, samples: 'koto', sampled: { name: 'Koto (VCSL)', gain: 0.34 }, more: { 'koto-2': { name: 'Koto (Musyng Kite)', gain: 0.72 } } },
  // a shamisen: three strings over a skin, struck with a big plectrum. it buzzes (sawari) and snaps
  shamisen:      { name: 'Shamisen', family: 'keys', edge: 0.45, world: 'acoustic', own: true, kind: 'pluck', bright: 0.85, soft: 0, decay: 0.8, buzz: 0.16, twang: 20, body: [[600, 5, 2.5], [2500, 4, 1.5]], env: [0.002, 0.8, 1, 0.2], gain: 0.96, ornaments: { slide: 0.2, grace: 0.2 }, samples: 'shamisen', sampled: { name: 'Shamisen (FluidR3)', gain: 0.68 }, more: { 'shamisen-2': { name: 'Shamisen (Musyng Kite)', gain: 1.2 } } },
  // a santoor, kashmir's hammered dulcimer: a few strings to a note (unison, so it shimmers), hit
  // with light mallets and left to ring
  santoor:       { name: 'Santoor', family: 'keys', edge: 0.3, world: 'acoustic', own: true, kind: 'modal', modes: [[1, 1, 2.2], [2, 0.55, 1.4, 0.3], [3, 0.35, 1, 0.5], [4, 0.2, 0.7, 0.7], [5, 0.12, 0.5, 0.9], [6, 0.06, 0.4, 1]], strike: [0.3, 4000, 0.004], unison: 4, track: 0.5, env: [0.002, 1, 1, 1.2], gain: 0.39, samples: 'dulcimer', sampled: { name: 'Hammered dulcimer (FluidR3)', gain: 0.52 }, more: { 'dulcimer-2': { name: 'Hammered dulcimer (Musyng Kite)', gain: 0.62 } } },
  // a xylophone: rosewood bars tuned so their first overtone is a twelfth up (3), bright, dry and quick,
  // the bones of a cartoon (and danse macabre)
  xylophone:     { name: 'Xylophone', family: 'keys', edge: 0.35, world: 'acoustic', kind: 'modal', modes: [[1, 1, 0.6], [3, 0.25, 0.15, 0.7], [6.3, 0.06, 0.05, 1]], strike: [0.2, 4000, 0.003], track: 0.7, env: [0.002, 1, 1, 0.3], gain: 0.68, samples: 'xylophone', sampled: { name: 'Xylophone (VCSL)', gain: 1.1 }, more: { 'xylophone-2': { name: 'Xylophone (Musyng Kite)', gain: 0.47 } } },
  // a harpsichord: every string plucked by a quill, the same loudness however hard it's pressed, bright
  // and a little nasal. a castle's music room, or something old and strange
  harpsichord:   { name: 'Harpsichord', family: 'keys', edge: 0.4, world: 'acoustic', kind: 'pluck', bright: 0.9, soft: 0, decay: 2.5, ring: 0.3, body: [[300, 3, 1.5], [2500, 3, 1]], env: [0.002, 2.5, 1, 0.15], gain: 0.98, samples: 'harpsichord', sampled: { name: 'Harpsichord (VCSL)', gain: 0.61 }, more: { 'french-harpsichord': { name: 'French harpsichord (VCSL)', gain: 0.81 } } },
  // a wurlitzer: a steel reed struck by a hammer under a pickup, rounder than a rhodes at the bottom and
  // barking at the top when it's hit hard, with the built in tremolo. soul, ray charles, supertramp,
  // and the indie and dream pop of now
  wurlitzer:     { name: 'Wurlitzer', family: 'keys', edge: 0.3, pedal: true, kind: 'modal', modes: [[1, 1, 2.5], [2, 0.3, 1.2, 0.9], [3, 0.12, 0.5, 1.2], [5, 0.05, 0.2, 1.5]], strike: [0.06, 2500, 0.003], track: 0.4, env: [0.003, 1, 1, 0.4], gain: 0.41, tremolo: { rate: 5.5, depth: 0.15 }, samples: 'wurlitzer', sampled: { name: 'Wurlitzer EP200', gain: 0.31 }, more: { pianet: { name: 'Hohner Pianet T', gain: 0.26 } } },
  // a mbira from zimbabwe: metal keys on a board over a gourd, plucked with the thumbs. like a kalimba,
  // with the bottle caps on it buzzing (the high, out of tune modes) and a deeper ring
  mbira:         { name: 'Mbira', family: 'keys', edge: 0.3, world: 'acoustic', own: true, kind: 'modal', modes: [[1, 1, 1.8], [2, 0.08, 0.6], [5.4, 0.15, 0.15, 1], [11.3, 0.06, 0.05, 1.2]], strike: [0.25, 3500, 0.004], track: 0.5, env: [0.002, 1, 1, 0.7], gain: 0.46, samples: 'mbira', sampled: { name: 'Mbira dzavadzimu (VCSL)', gain: 1.9 } },
  // a lyre, the ancient world's harp: ten metal strings plucked with the fingers, brighter and longer
  // ringing than a harp's gut ones
  lyre:          { name: 'Lyre', family: 'keys', edge: 0.25, world: 'acoustic', own: true, kind: 'pluck', bright: 0.55, soft: 0.5, decay: 3.5, ring: 0.35, filter: { freq: 3200, q: 0.5, track: 0.4 }, body: [[300, 3, 1.5], [900, 2, 1.2]], env: [0.004, 3.5, 1, 2], gain: 0.42, ornaments: { grace: 0.1, slide: 0.04 }, samples: 'lyre', sampled: { name: 'Cithara barbarica', gain: 0.27 } },
  // an upright piano gone out of tune in a saloon: each note's strings a few cents apart (unison), so it
  // jangles. the wasteland's bar and the pirates' tavern
  'honky-tonk':  { name: 'Honky tonk piano', family: 'keys', edge: 0.3, world: 'acoustic', kind: 'modal', modes: [[1, 1, 3.5], [2, 0.55, 2.5, 0.2], [3, 0.35, 1.8, 0.4], [4, 0.22, 1.3, 0.6], [5, 0.12, 1, 0.8], [6, 0.06, 0.8, 1]], strike: [0.3, 3000, 0.01], unison: 9, stretch: 0.0005, track: 0.6, env: [0.002, 1, 1, 0.35], gain: 0.62, samples: 'honky-tonk', sampled: { name: 'Honky tonk piano (FluidR3)', gain: 0.7 }, more: { 'honky-tonk-2': { name: 'Honky tonk piano (Musyng Kite)', gain: 0.65 } } },
  // a javanese gamelan's bonang: a row of bronze kettle gongs struck with padded sticks, in pelog (its
  // notes fall between a piano's, so the recordings are each played in tune, see build-samples.js). a
  // gong's overtones aren't whole multiples, so it shimmers rather than rings
  bonang:        { name: 'Bonang', family: 'keys', edge: 0.35, world: 'acoustic', own: true, kind: 'modal', modes: [[1, 1, 2.5], [2.76, 0.2, 0.7, 0.6], [4.1, 0.08, 0.3, 1], [5.6, 0.03, 0.15, 1.2]], strike: [0.15, 3000, 0.003], unison: 2, track: 0.4, env: [0.002, 1, 1, 1], gain: 0.73, samples: 'bonang', sampled: { name: 'Bonang and bonang panerus', gain: 0.75, reach: 12 } },

  // electric guitars: a picked string through a rig (amp, ampChain()), edge rising with the gain.
  // rhythm guitars are double tracked. the dirty ones ring long (decay, ring) and their rig squashes
  // the string before it clips (sustain), so a distorted chord rings on for bars
  // clean, bright and a little squashed: the twinkling guitar of emo (tigers jaw, american football)
  'clean-guitar':  { name: 'Clean guitar', family: 'guitar', edge: 0.2, kind: 'pluck', bright: 0.6, soft: 0.2, decay: 3, env: [0.002, 3, 1, 0.3], gain: 1,
    amp: { tight: 90, curve: 'tube', gain: 1.2, mids: [700, -2], presence: [3200, 3], cab: 7500, level: 0.5, double: true }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 0.88 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.2 }, 'green-guitar': { name: 'Green guitar (Karoryfer)', gain: 0.69 } } },
  // clean through a chorus pedal, shimmering left and right: come as you are, and all of dream pop
  'chorus-guitar': { name: 'Chorus guitar', family: 'guitar', edge: 0.2, kind: 'pluck', bright: 0.55, soft: 0.3, decay: 3.2, env: [0.002, 3, 1, 0.4], gain: 1,
    amp: { tight: 90, curve: 'tube', gain: 1.2, presence: [3000, 2], cab: 6500, level: 0.45, chorus: [0.7, 0.0035] }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 0.77 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.1 }, 'green-guitar': { name: 'Green guitar (Karoryfer)', gain: 0.71 } } },
  // a valve amp turned up until it just breaks up: crunchy when picked hard, nearly clean when soft
  'crunch-guitar': { name: 'Crunch guitar', family: 'guitar', edge: 0.45, kind: 'pluck', bright: 0.6, soft: 0.1, decay: 4, ring: 0.4, env: [0.002, 3, 1, 0.25], gain: 1, ornaments: { slide: 0.1, glide: 0.06 },
    amp: { tight: 100, curve: 'tube', gain: 4, sustain: 6, presence: [2500, 3], cab: 5500, level: 0.165, double: true }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 0.94 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.3 }, 'green-guitar': { name: 'Green guitar (Karoryfer)', gain: 0.85 } } },
  // an overdrive pedal (a tube screamer) into a hot amp: the mids pushed before the clipping, so it
  // sings rather than fizzes
  'drive-guitar':  { name: 'Overdrive guitar', family: 'guitar', edge: 0.6, kind: 'pluck', bright: 0.65, soft: 0.1, decay: 6, ring: 0.35, env: [0.002, 3, 1, 0.25], gain: 1, ornaments: { slide: 0.15, glide: 0.06 },
    amp: { tight: 140, boost: [720, 6], curve: 'soft', gain: 12, sustain: 10, presence: [2800, 2], cab: 5000, level: 0.0254, double: true }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 1.1 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.5 }, 'green-guitar': { name: 'Green guitar (Karoryfer)', gain: 0.95 } } },
  // a distortion pedal (a boss ds-1, a rat): hard clipped, flatter and rawer. nirvana's chorus
  'dist-guitar':   { name: 'Distortion guitar', family: 'guitar', edge: 0.75, kind: 'pluck', bright: 0.7, soft: 0.05, decay: 6, ring: 0.35, env: [0.002, 3, 1, 0.25], gain: 1, ornaments: { slide: 0.2, glide: 0.06 },
    amp: { tight: 110, curve: 'hard', gain: 30, sustain: 14, mids: [700, -3], presence: [3000, 3], cab: 4500, level: 0.0265, double: true }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 1.1 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.5 }, 'green-guitar': { name: 'Green guitar (Karoryfer)', gain: 0.96 } } },
  // a big muff fuzz: so much gain every note sustains, the mids scooped out and the top rolled off, so
  // it's thick and woolly rather than sharp. the smashing pumpkins, weezer, my bloody valentine
  'fuzz-guitar':   { name: 'Fuzz guitar', family: 'guitar', edge: 0.65, kind: 'pluck', bright: 0.6, soft: 0.1, decay: 7, ring: 0.3, env: [0.002, 3, 1, 0.35], gain: 1, ornaments: { slide: 0.15, glide: 0.07 },
    amp: { tight: 50, curve: 'soft', gain: 70, sustain: 18, mids: [900, -9], cab: 3800, level: 0.0213, double: true }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 1.1 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.5 }, 'green-guitar': { name: 'Green guitar (Karoryfer)', gain: 1 } } },
  // a high gain amp, metallica's and doom's: the lows cut before the clipping so a chug stays tight,
  // then the mids scooped and the low end and bite put back after
  'metal-guitar':  { name: 'Metal guitar', family: 'guitar', edge: 0.9, kind: 'pluck', bright: 0.75, soft: 0, decay: 6, ring: 0.35, env: [0.002, 3, 1, 0.15], gain: 1, ornaments: { slide: 0.12, glide: 0.05 },
    amp: { tight: 150, boost: [800, 5], curve: 'hard', gain: 90, sustain: 12, mids: [550, -10], body: [110, 6], presence: [3500, 5], cab: 5500, level: 0.0231, double: true }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 1.4 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.9 }, 'green-guitar': { name: 'Green guitar (Karoryfer)', gain: 1.1 } } },
  // fuzz on a guitar tuned way down, the speaker rolled off early: sleep, electric wizard, whirr
  'sludge-guitar': { name: 'Sludge guitar', family: 'guitar', edge: 0.7, kind: 'pluck', bright: 0.55, soft: 0.1, decay: 7.5, ring: 0.3, env: [0.002, 4, 1, 0.4], gain: 1, ornaments: { slide: 0.2, glide: 0.1 },
    amp: { tight: 40, curve: 'soft', gain: 120, sustain: 18, mids: [700, -6], body: [120, 6], cab: 3000, level: 0.021, double: true }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 1.2 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.6 }, 'green-guitar': { name: 'Green guitar (Karoryfer)', gain: 1 } } },
  // kevin shields' glide guitar: fuzz, the tremolo arm never still so whole chords warp in and out of
  // tune, a held tone under the string so chords don't die, and reverse reverb swelling up behind
  'glide-guitar':  { name: 'Glide guitar', family: 'guitar', edge: 0.55, kind: 'pluck', bright: 0.6, soft: 0.2, decay: 6, ring: 0.35, sustain: 0.5, env: [0.01, 3, 1, 0.5], gain: 1, vibrato: { rate: 0.6, depth: 32, delay: 0 },
    amp: { tight: 60, curve: 'soft', gain: 40, sustain: 12, mids: [1000, -4], cab: 3500, level: 0.0263, chorus: [0.45, 0.004], reverse: 0.8 }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 1.1 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.5 }, 'green-guitar': { name: 'Green guitar (Karoryfer)', gain: 1.1 } } },
  // the shoegaze guitars (own: only where a mood names them), each a pedal or two from the bands' boards
  // whirr's: an offset guitar (a jazzmaster) into a big muff and a cranked valve head, a reverb set to
  // its modulated, chorused setting, so the wall of eighths wavers very slightly as one
  'offset-guitar': { name: 'Offset guitar', family: 'guitar', edge: 0.6, own: true, kind: 'pluck', bright: 0.6, soft: 0.15, decay: 7, ring: 0.3, env: [0.002, 3, 1, 0.4], gain: 1, ornaments: { slide: 0.22, glide: 0.08 },
    amp: { tight: 70, boost: [800, 3], curve: 'soft', gain: 55, sustain: 16, mids: [850, -6], cab: 3600, level: 0.022, double: true, warp: [0.3, 7] }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 1.1 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.5 }, 'green-guitar': { name: 'Green guitar (Karoryfer)', gain: 1 } } },
  // an octave fuzz: the bottom half of the wave folded up, so an octave rings over every chord, thick and
  // a little out of tune with itself (my bloody valentine, hum)
  'octave-fuzz': { name: 'Octave fuzz guitar', family: 'guitar', edge: 0.7, own: true, kind: 'pluck', bright: 0.55, soft: 0.15, decay: 7, ring: 0.3, env: [0.002, 3, 1, 0.4], gain: 1, ornaments: { slide: 0.15, glide: 0.08 },
    amp: { tight: 90, curve: 'octave', gain: 40, sustain: 14, mids: [1000, -5], cab: 4200, level: 0.054, double: true, warp: [0.45, 10] }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 1.1 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.5 }, 'green-guitar': { name: 'Green guitar (Karoryfer)', gain: 1 } } },
  // clean and chorused into a shimmer: every chord leaves an octave up halo hanging over it (slowdive's
  // reunion boards, alcest)
  'shimmer-guitar': { name: 'Shimmer guitar', family: 'guitar', edge: 0.25, own: true, kind: 'pluck', bright: 0.55, soft: 0.3, decay: 3.5, env: [0.002, 3, 1, 0.5], gain: 1,
    amp: { tight: 90, curve: 'tube', gain: 1.4, presence: [3000, 2], cab: 6500, level: 0.38, chorus: [0.5, 0.004], shimmer: 0.6 }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 0.77 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.1 }, 'green-guitar': { name: 'Green guitar (Karoryfer)', gain: 0.71 } } },
  // a valve amp just breaking up, flanged on the tape: a slow jet plane whoosh through every chord
  // (souvlaki, which slowdive flanged by pressing on the reels)
  'flange-guitar': { name: 'Tape flanged guitar', family: 'guitar', edge: 0.35, own: true, kind: 'pluck', bright: 0.6, soft: 0.2, decay: 4, ring: 0.4, env: [0.002, 3, 1, 0.35], gain: 1, ornaments: { slide: 0.1, glide: 0.06 },
    amp: { tight: 100, curve: 'tube', gain: 3, sustain: 6, presence: [2600, 2], cab: 5500, level: 0.16, double: true, flange: [0.11, 0.0025] }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 0.94 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.3 }, 'green-guitar': { name: 'Green guitar (Karoryfer)', gain: 0.85 } } },
  // overdrive through a phaser, the notches sweeping slowly up and down (fleshwater's background guitar,
  // hum's leads)
  'phaser-guitar': { name: 'Phaser guitar', family: 'guitar', edge: 0.55, own: true, kind: 'pluck', bright: 0.65, soft: 0.1, decay: 6, ring: 0.35, env: [0.002, 3, 1, 0.3], gain: 1, ornaments: { slide: 0.15, glide: 0.06 },
    amp: { tight: 120, boost: [720, 5], curve: 'soft', gain: 12, sustain: 10, presence: [2800, 2], cab: 5000, level: 0.03, double: true, phaser: [0.35, 500] }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 1.1 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.5 }, 'green-guitar': { name: 'Green guitar (Karoryfer)', gain: 0.95 } } },
  // tuned down to drop b, a stratocaster through an overdrive into a high gain head: the 90s alternative
  // metal weight under fleshwater, glare and deftones. drop: its chords sit three semitones lower, from the low b up
  'drop-guitar': { name: 'Drop tuned guitar', family: 'guitar', edge: 0.8, own: true, kind: 'pluck', bright: 0.65, soft: 0.05, decay: 7, ring: 0.3, drop: -3, env: [0.002, 3, 1, 0.25], gain: 1, ornaments: { slide: 0.2, glide: 0.06 },
    amp: { tight: 90, boost: [750, 4], curve: 'hard', gain: 60, sustain: 14, mids: [600, -7], body: [110, 5], presence: [3200, 3], cab: 4200, level: 0.024, double: true }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 1.3 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 1.8 }, 'green-guitar': { name: 'Green guitar (Karoryfer)', gain: 1.1 } } },
  // a hollow body jazz guitar on its neck pickup, the tone knob rolled back, into a clean valve amp:
  // round and warm (wes montgomery, joe pass)
  'jazz-guitar':   { name: 'Jazz guitar', family: 'guitar', edge: 0.15, kind: 'pluck', bright: 0.4, soft: 0.4, decay: 2.6, body: [[110, 3, 1.5], [250, 2, 1.5]], env: [0.003, 2.6, 1, 0.3], gain: 1, ornaments: { slide: 0.1, grace: 0.05 },
    amp: { tight: 50, curve: 'tube', gain: 1.4, mids: [900, -2], cab: 2600, level: 0.68 }, samples: 'hollow-guitar', sampled: { name: 'Emilyguitar (Karoryfer)', gain: 0.9 }, more: { 'jazz-guitar-2': { name: 'Jazz guitar (Musyng Kite)', gain: 0.32 } } },

  // bells
  // a church bell's real overtones: the hum an octave down, the strike note, a minor third (the
  // tierce, why bells sound a little sad), the fifth, the octave and some odd ones above. too harsh
  // for anything but the dark and epic moods
  bell:          { name: 'Church bell', family: 'bell', edge: 0.7, world: 'acoustic', kind: 'modal', modes: [[0.5, 0.45, 6], [1, 0.8, 4.5], [1.19, 0.25, 3.5], [1.5, 0.25, 3], [2, 0.55, 2.5, 0.3], [2.51, 0.18, 1.6, 0.5], [2.66, 0.22, 1.4, 0.5], [3.01, 0.12, 1, 0.8], [4.1, 0.08, 0.6, 1]], strike: [0.25, 4000, 0.004], track: 0.3, env: [0.002, 1, 1, 2.5], gain: 0.58, samples: 'tubular-bells', sampled: { gain: 0.7 } },
  // the gentle bells keep harmonic overtones (2, 3, 7) so they never clash with the chords
  'glass-bell':  { name: 'Glass bell', family: 'bell', edge: 0.3, kind: 'modal', modes: [[1, 1, 4], [2, 0.3, 2, 0.4], [3, 0.06, 0.9, 0.8]], strike: [0.05, 6000, 0.003], track: 0.3, env: [0.004, 1, 1, 2], gain: 0.336, samples: 'hand-chimes', sampled: { gain: 0.33 } },
  chime:         { name: 'Wind chime', family: 'bell', edge: 0.45, world: 'acoustic', kind: 'modal', modes: [[1, 1, 3], [3, 0.2, 1, 0.5], [7, 0.05, 0.3, 1]], strike: [0.1, 7000, 0.002], track: 0.3, env: [0.002, 1, 1, 1.5], gain: 0.31, samples: 'tubular-glock', sampled: { name: 'Tubular glockenspiel (VCSL)', gain: 0.34 } },
  // a guitar's strings plucked behind the bridge: a high, clangy plink nearly out of tune, through a clean
  // amp and reverse reverb so each swells back in (to here knows when, sonic youth's interludes)
  'bridge-chimes': { name: 'Behind the bridge', family: 'bell', edge: 0.4, own: true, kind: 'modal', modes: [[1, 1, 1.4], [2.32, 0.45, 0.7, 0.3], [4.25, 0.22, 0.35, 0.6], [6.8, 0.08, 0.2, 1]], strike: [0.12, 5000, 0.002], track: 0.4, env: [0.002, 1, 1, 0.8], gain: 1,
    amp: { tight: 200, curve: 'tube', gain: 1.5, cab: 7000, level: 0.95, reverse: 0.8 } },
  // natural harmonics, a finger resting on the string over a fret: glassy, nearly a sine, ringing long
  // (slowdive, american football, hum's intros)
  harmonics: { name: 'Guitar harmonics', family: 'bell', edge: 0.2, own: true, kind: 'modal', modes: [[1, 1, 3], [2, 0.12, 1.5, 0.4], [3, 0.04, 0.8, 0.8]], strike: [0.03, 4000, 0.003], track: 0.2, env: [0.003, 1, 1, 1.5], gain: 0.3,
    amp: { tight: 150, curve: 'tube', gain: 1.2, cab: 7500, level: 1.1, chorus: [0.5, 0.004] }, samples: 'guitar-harmonics', sampled: { name: 'Guitar harmonics (FluidR3)', gain: 0.125 } },
  // nearly a pure tone, the soft bell lead of aphex twin's ageispolis. a synth, so it stays fm
  'sine-bell':   { name: 'Sine bell', family: 'bell', edge: 0.1, kind: 'fm', ratio: 1, index: 0.35, indexDecay: 0.4, sustainIndex: 0, partials: [[2, 0.12, 0.6]], env: [0.003, 2.2, 0, 1.2], gain: 0.2 },
  // a struck pipe, out of tune with itself on purpose: fallout's rusting wasteland. too harsh for
  // anything but the dark moods
  'metal-ping':  { name: 'Metal ping', family: 'bell', edge: 0.55, kind: 'fm', ratio: 2.41, index: 1.1, indexDecay: 0.5, sustainIndex: 0.08, partials: [[5.43, 0.08, 0.3]], env: [0.002, 3, 0, 2], gain: 0.13 },
  // a glockenspiel: little steel bars, bright and short, with the bars' own out of tune overtones
  // dying almost at once
  glock:         { name: 'Glockenspiel', family: 'bell', edge: 0.4, world: 'acoustic', kind: 'modal', modes: [[1, 1, 2.2], [2.71, 0.2, 0.5, 0.6], [5.15, 0.06, 0.15, 1]], strike: [0.12, 8000, 0.002], track: 0.4, env: [0.002, 1, 1, 0.8], gain: 0.43, samples: 'glockenspiel', sampled: { gain: 1.1 } },

  // leads
  // blown and bowed leads drift as they're held (breath is never steady), blown ones start with a puff
  // (chiff), and each says what its players' ornaments are
  flute:         { name: 'Flute', family: 'lead', edge: 0.15, world: 'acoustic', kind: 'sub', osc: [['sine', 0], ['triangle', 2, 1, 0.12], ['sine', 0, 2, 0.04]], breath: 0.35, chiff: 0.35, env: [0.09, 0.3, 0.85, 0.5], scoop: 15, drift: 4, gain: 0.19, vibrato: { rate: 5, depth: 12, delay: 0.35 }, ornaments: { grace: 0.2, slide: 0.06, trill: 0.06, swell: 0.15 }, samples: 'flute', sampled: { name: 'Flute (VSCO)', gain: 2.5 }, more: { 'flute-plain': { name: 'Flute, no vibrato (VSCO)', gain: 1.5 } } },
  // the flute an octave up (octave), glittering over an orchestra. only where a mood names it
  piccolo:       { name: 'Piccolo', family: 'lead', edge: 0.3, world: 'acoustic', own: true, octave: 1, kind: 'sub', osc: [['sine', 0], ['triangle', 2, 1, 0.08]], breath: 0.3, chiff: 0.4, env: [0.06, 0.25, 0.85, 0.4], scoop: 12, drift: 4, gain: 0.16, vibrato: { rate: 5.5, depth: 10, delay: 0.3 }, ornaments: { grace: 0.25, trill: 0.1, swell: 0.1 }, samples: 'piccolo', sampled: { gain: 0.9 } },
  ocarina:       { name: 'Ocarina', family: 'lead', edge: 0.15, world: 'acoustic', kind: 'sub', osc: [['soft', 0]], breath: 0.15, chiff: 0.2, filter: { freq: 2500, q: 0.4 }, env: [0.05, 0.3, 0.8, 0.45], scoop: 10, drift: 3, gain: 0.21, vibrato: { rate: 5.5, depth: 8, delay: 0.3 }, ornaments: { grace: 0.12, slide: 0.08, swell: 0.15 }, samples: 'ocarina', sampled: { name: 'Ocarina (FluidR3)', gain: 0.39 }, more: { 'clay-ocarina': { name: 'Clay ocarina (VCSL)', gain: 0.71 } } },
  'soft-lead':   { name: 'Soft lead', family: 'lead', edge: 0.2, kind: 'sub', osc: [['triangle', -3], ['triangle', 4]], filter: { freq: 1800, q: 0.6, track: 0.5 }, env: [0.04, 0.4, 0.75, 0.6], scoop: 8, gain: 0.16, vibrato: { rate: 5, depth: 6, delay: 0.4 }, ornaments: { slide: 0.12, glide: 0.08, swell: 0.15 } },
  // a moog's lead, the voyager c418 played: two saws and a square an octave down through its ladder
  // filter, sliding between notes (portamento), round and buttery rather than buzzy
  'moog-lead':   { name: 'Moog lead', family: 'lead', edge: 0.45, kind: 'sub', osc: [['sawtooth', -4], ['sawtooth', 5], ['square', 0, -1, 0.3]], filter: { freq: 1400, q: 2, env: 1.4, attack: 0.03, decay: 0.6, track: 0.5 }, env: [0.02, 0.4, 0.8, 0.45], drift: 2, gain: 0.17, vibrato: { rate: 5, depth: 6, delay: 0.5 }, ornaments: { glide: 0.35, slide: 0.3, swell: 0.1 } },
  'saw-lead':    { name: 'Saw lead', family: 'lead', edge: 1, kind: 'sub', osc: [['sawtooth', -6], ['sawtooth', 6]], filter: { freq: 1600, q: 2, env: 2.2, attack: 0.02, decay: 0.3, track: 0.5 }, env: [0.01, 0.3, 0.7, 0.35], gain: 0.085, vibrato: { rate: 5.5, depth: 9, delay: 0.3 }, ornaments: { slide: 0.15, glide: 0.07 } },
  'square-lead': { name: 'Square lead', family: 'lead', edge: 0.85, world: 'chip', kind: 'sub', osc: [['square', -4], ['square', 5, -1, 0.3]], filter: { freq: 2000, q: 0.7, track: 0.4 }, env: [0.01, 0.25, 0.65, 0.25], gain: 0.07, vibrato: { rate: 6, depth: 7, delay: 0.25 }, ornaments: { slide: 0.1, glide: 0.05 } },
  // a violin: the bowed wave through its body, bow noise, drift, slides between notes and the odd
  // double stop (two strings at once, stop) the way fiddlers play
  violin:        { name: 'Violin', family: 'lead', edge: 0.5, world: 'acoustic', kind: 'sub', osc: [['bowed', 0], ['bowed', 4, 0, 0.35]], breath: 0.05, filter: { freq: 3400, q: 0.6, track: 0.3 }, body: [[280, 5, 2], [460, 4, 2.5], [1500, -3, 1.2], [2800, 5, 0.9]], env: [0.15, 0.4, 0.85, 0.5], scoop: 20, drift: 5, gain: 0.048, vibrato: { rate: 5.6, depth: 16, delay: 0.25 }, ornaments: { slide: 0.25, grace: 0.15, trill: 0.05, stop: 0.1, glide: 0.12, swell: 0.3 }, samples: 'violin', sampled: { name: 'Violin (VSCO)', gain: 0.33 }, more: { fiddle: { name: 'Fiddle (FluidR3)', gain: 0.3 } } },
  // a solo cello, an octave under the violin: the warmest voice in the orchestra, for sad, tragic and
  // grand tunes and for a second melody under a violin's
  cello:         { name: 'Cello', family: 'lead', edge: 0.35, world: 'acoustic', kind: 'sub', osc: [['bowed', 0], ['bowed', 4, 0, 0.35]], breath: 0.05, filter: { freq: 2200, q: 0.6, track: 0.3 }, body: [[110, 4, 2], [230, 5, 2], [600, 3, 1.5], [2000, 2, 1]], env: [0.18, 0.4, 0.85, 0.6], scoop: 18, drift: 5, gain: 0.04, octave: -1, vibrato: { rate: 5.2, depth: 14, delay: 0.3 }, ornaments: { slide: 0.25, grace: 0.08, glide: 0.12, swell: 0.35 }, samples: 'cello', sampled: { name: 'Solo cello (Karoryfer x Bigcat)', gain: 0.17 }, more: { 'cello-2': { name: 'Cello (Musyng Kite)', gain: 0.14 } } },
  // a french horn: brass waves, dark, the filter opening as each note blooms
  horn:          { name: 'Horn', family: 'lead', edge: 0.45, world: 'acoustic', kind: 'sub', osc: [['brass', -3], ['brass', 3]], filter: { freq: 650, q: 0.8, env: 2.6, attack: 0.12, decay: 0.5, track: 0.6 }, body: [[450, 4, 1.2]], env: [0.08, 0.4, 0.8, 0.5], scoop: 15, drift: 3, gain: 0.12, vibrato: { rate: 4.8, depth: 6, delay: 0.5 }, ornaments: { slide: 0.08, fall: 0.06, swell: 0.3 }, samples: 'horn', sampled: { name: 'Horn (VSCO)', gain: 0.2 }, more: { 'horn-2': { name: 'Horn (Musyng Kite)', gain: 0.22 } } },
  whistle:       { name: 'Whistle', family: 'lead', edge: 0.3, world: 'acoustic', kind: 'sub', osc: [['sine', 0]], breath: 0.25, chiff: 0.25, env: [0.06, 0.2, 0.9, 0.35], scoop: 25, drift: 4, gain: 0.2, vibrato: { rate: 6, depth: 18, delay: 0.2 }, ornaments: { grace: 0.25, slide: 0.12, trill: 0.08, swell: 0.1 }, samples: 'recorder', sampled: { name: 'Soprano recorder (VCSL)', gain: 1.3 }, more: { whistle: { name: 'Whistled (FluidR3)', gain: 0.42 }, 'alto-recorder': { name: 'Alto recorder (VCSL)', gain: 1.1 } } },
  // the recorder's bigger sister, a fourth lower and rounder: with a whistle or a soprano recorder over it,
  // a consort of recorders (the middle ages, a castle's courtyard)
  'tenor-recorder': { name: 'Tenor recorder', family: 'lead', edge: 0.2, world: 'acoustic', own: true, kind: 'sub', osc: [['sine', 0], ['triangle', 0, 1, 0.08]], breath: 0.3, chiff: 0.3, env: [0.05, 0.2, 0.9, 0.3], scoop: 15, drift: 3, gain: 0.2, vibrato: { rate: 5, depth: 6, delay: 0.4 }, ornaments: { grace: 0.25, slide: 0.08, trill: 0.1, swell: 0.1 }, samples: 'tenor-recorder', sampled: { name: 'Tenor recorder (VCSL)', gain: 1.7 } },
  'pluck-lead':  { name: 'Plucked synth', family: 'lead', edge: 0.6, kind: 'sub', osc: [['sawtooth', -5], ['square', 5, 0, 0.5]], filter: { freq: 500, q: 3, env: 7, attack: 0.003, decay: 0.12, track: 0.6 }, env: [0.003, 0.35, 0.2, 0.25], gain: 0.09 },
  // one nes pulse channel with its delayed vibrato: undertale, deltarune, early terraria
  'pulse-lead':  { name: 'Pulse lead', family: 'lead', edge: 0.6, world: 'chip', kind: 'sub', osc: [['pulse25', 0]], filter: { freq: 5000, q: 0.3, track: 0.3 }, env: [0.004, 0.25, 0.75, 0.18], gain: 0.17, vibrato: { rate: 6, depth: 10, delay: 0.35 }, ornaments: { slide: 0.08, glide: 0.05 } },
  // a square crushed down to a few steps of loudness, the broken atari chip of crystal castles
  'bit-lead':    { name: 'Bit lead', family: 'lead', edge: 0.9, world: 'chip', kind: 'sub', osc: [['sawtooth', 0], ['triangle', 6, 1, 0.5]], crush: 4, filter: { freq: 4000, q: 0.5, track: 0.3 }, env: [0.003, 0.2, 0.7, 0.12], gain: 0.155, ornaments: { slide: 0.1, glide: 0.05 }, vibrato: { rate: 7, depth: 14, delay: 0.15 } },
  'pan-flute':   { name: 'Pan flute', family: 'lead', edge: 0.15, world: 'acoustic', kind: 'sub', osc: [['hollow', 0], ['sine', 0, 1, 0.08]], breath: 0.7, chiff: 0.5, filter: { freq: 2600, q: 0.4 }, env: [0.03, 0.25, 0.8, 0.45], scoop: 18, drift: 4, gain: 0.14, vibrato: { rate: 5.2, depth: 9, delay: 0.4 }, ornaments: { grace: 0.15, slide: 0.15, swell: 0.15 }, samples: 'pan-flute', sampled: { name: 'Pan flute (FluidR3)', gain: 0.34 }, more: { 'pan-flute-2': { name: 'Pan flute (Musyng Kite)', gain: 0.31 } } },
  // a reed's odd harmonics (the hollow wave), a little breath and a slow, late vibrato: warm and woody,
  // the clarinet of stardew valley's autumn and of old village themes
  clarinet:      { name: 'Clarinet', family: 'lead', edge: 0.2, world: 'acoustic', kind: 'sub', osc: [['hollow', 0], ['sine', 0, 1, 0.06]], breath: 0.12, chiff: 0.1, filter: { freq: 2400, q: 0.5, track: 0.4 }, body: [[1500, 3, 1.2]], env: [0.05, 0.4, 0.85, 0.45], scoop: 12, drift: 3, gain: 0.13, vibrato: { rate: 4.8, depth: 5, delay: 0.6 }, ornaments: { slide: 0.12, grace: 0.08, swell: 0.2 }, samples: 'clarinet', sampled: { name: 'Clarinet (VSCO)', gain: 0.58 }, more: { 'clarinet-2': { name: 'Clarinet (Musyng Kite)', gain: 0.56 } } },
  // two reeds tuned a few cents apart, beating against each other (the musette sound), over a lower
  // reed: a village dance tune
  accordion:     { name: 'Accordion', family: 'lead', edge: 0.4, world: 'acoustic', kind: 'sub', osc: [['pulse25', -8], ['pulse25', 8], ['sawtooth', 0, -1, 0.3]], filter: { freq: 2600, q: 0.6, track: 0.3 }, body: [[1000, 3, 1]], env: [0.03, 0.3, 0.9, 0.3], gain: 0.09, tremolo: { rate: 5, depth: 0.08 }, ornaments: { grace: 0.12, trill: 0.05, swell: 0.2 }, samples: 'accordion', sampled: { name: 'Accordion (FluidR3)', gain: 0.31 }, more: { 'accordion-2': { name: 'Accordion (Musyng Kite)', gain: 0.26 } } },
  // a double reed, nasal and loud enough to carry outdoors: the zurna and mizmar of the desert, and a
  // bagpipe's chanter. a thin pulse through a resonant filter, sliding up onto each note
  shawm:         { name: 'Shawm', family: 'lead', edge: 0.6, world: 'acoustic', own: true, kind: 'sub', osc: [['pulse12', 0], ['sawtooth', 3, 0, 0.4]], breath: 0.1, filter: { freq: 1800, q: 1.6, track: 0.5 }, body: [[1200, 4, 2], [2800, 3, 1.5]], env: [0.04, 0.3, 0.85, 0.35], scoop: 25, drift: 5, gain: 0.13, vibrato: { rate: 5.8, depth: 14, delay: 0.3 }, ornaments: { grace: 0.25, trill: 0.1, slide: 0.15, swell: 0.15 }, samples: 'shehnai', sampled: { name: 'Shehnai (FluidR3)', gain: 0.25 }, more: { 'shehnai-2': { name: 'Shehnai (Musyng Kite)', gain: 0.24 } } },
  // 80s brass from a synth, the filter opening as each note swells (dying light, deltarune)
  'synth-brass': { name: 'Synth brass', family: 'lead', edge: 0.6, kind: 'sub', osc: [['sawtooth', -7], ['sawtooth', 7], ['pulse25', 0, -1, 0.4]], filter: { freq: 900, q: 1, env: 3, attack: 0.12, decay: 0.6, track: 0.5 }, env: [0.05, 0.4, 0.85, 0.45], scoop: 15, gain: 0.07, vibrato: { rate: 5, depth: 5, delay: 0.5 }, ornaments: { slide: 0.1, fall: 0.08, swell: 0.25 } },
  // lead guitars, standing in for a singer: a held tone under the string so long notes sing on, bends
  // (bendBy: a whole tone), slides and a wide shake, all written by the composer
  'lead-guitar': { name: 'Lead guitar', family: 'lead', edge: 0.65, own: true, kind: 'pluck', bright: 0.7, soft: 0.1, decay: 5, ring: 0.35, sustain: 0.35, env: [0.003, 2, 0.9, 0.25], gain: 1, vibrato: { rate: 5.5, depth: 10, delay: 0.3 }, ornaments: { bend: 0.35, bendBy: 2, slide: 0.2, shake: 0.45, stop: 0.06, glide: 0.08, release: 0.15 },
    amp: { tight: 150, boost: [800, 6], curve: 'soft', gain: 25, sustain: 10, presence: [2800, 2], cab: 4800, level: 0.034 }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 2.2 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 3 }, 'green-guitar': { name: 'Green guitar (Karoryfer)', gain: 1.7 } } },
  // shred: more gain, wider vibrato, whole tone bends (kirk hammett, dimebag, the doom solos)
  'metal-lead':  { name: 'Metal lead', family: 'lead', edge: 0.85, own: true, kind: 'pluck', bright: 0.75, soft: 0, decay: 5, ring: 0.35, sustain: 0.4, env: [0.002, 2, 0.9, 0.2], gain: 1, vibrato: { rate: 6, depth: 14, delay: 0.22 }, ornaments: { bend: 0.4, bendBy: 2, slide: 0.25, shake: 0.55, glide: 0.06, release: 0.12 },
    amp: { tight: 200, boost: [900, 5], curve: 'hard', gain: 70, sustain: 12, mids: [600, -5], presence: [3200, 4], cab: 5200, level: 0.036 }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 2.9 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 4 }, 'green-guitar': { name: 'Green guitar (Karoryfer)', gain: 2.2 } } },
  // a fuzz lead, thick and sustaining forever: billy corgan, j mascis
  'fuzz-lead':   { name: 'Fuzz lead', family: 'lead', edge: 0.65, own: true, kind: 'pluck', bright: 0.6, soft: 0.1, decay: 6, ring: 0.3, sustain: 0.45, env: [0.003, 2, 0.9, 0.3], gain: 1, vibrato: { rate: 5, depth: 10, delay: 0.35 }, ornaments: { bend: 0.3, bendBy: 1, slide: 0.2, shake: 0.4, glide: 0.09, release: 0.12 },
    amp: { tight: 70, curve: 'soft', gain: 80, sustain: 16, mids: [900, -6], cab: 3600, level: 0.038 }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 2.5 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 3.4 }, 'green-guitar': { name: 'Green guitar (Karoryfer)', gain: 1.6 } } },
  // an ebow: a magnet keeping the string going, so a note swells up with no pick and sings for as long as
  // it's held, sliding like a voice. through fuzz, a chorus and reverse reverb it's the shoegaze singer's
  // stand in (the recording swells in on the pick's ring, held up by the fuzz)
  'ebow-lead': { name: 'Ebow guitar', family: 'lead', edge: 0.45, own: true, kind: 'pluck', bright: 0.5, soft: 0.7, decay: 9, ring: 0.2, sustain: 0.95, env: [0.28, 2, 1, 0.7], gain: 1, vibrato: { rate: 4.5, depth: 8, delay: 0.6 }, ornaments: { slide: 0.35, glide: 0.15, swell: 0.4 },
    amp: { tight: 80, curve: 'soft', gain: 25, sustain: 16, mids: [900, -4], cab: 3800, level: 0.0236, chorus: [0.4, 0.004], reverse: 0.5 }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 3.7, env: [0.3, 1, 1, 0.8] }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 5, env: [0.3, 1, 1, 0.8] } } },
  // a fuzz lead through a wah left half down, bending a whole tone and shaking wide: a nasal, crying lead
  // (fleshwater's)
  'wah-lead': { name: 'Wah lead', family: 'lead', edge: 0.7, own: true, kind: 'pluck', bright: 0.7, soft: 0.1, decay: 5, ring: 0.35, sustain: 0.4, env: [0.003, 2, 0.9, 0.25], gain: 1, vibrato: { rate: 6, depth: 14, delay: 0.25 }, ornaments: { bend: 0.45, bendBy: 2, slide: 0.25, shake: 0.5, glide: 0.08, release: 0.15 },
    amp: { tight: 120, boost: [800, 4], wah: [1000, 3], curve: 'soft', gain: 40, sustain: 12, presence: [2800, 2], cab: 4500, level: 0.03 }, samples: 'clean-guitar', sampled: { name: 'Black guitar (Karoryfer)', gain: 2.4 }, more: { 'shiny-guitar': { name: 'Shiny guitar (Karoryfer)', gain: 3.2 }, 'green-guitar': { name: 'Green guitar (Karoryfer)', gain: 1.7 } } },
  // voices with no words, for the moods whose songs would have a singer: a breathy one sung close and
  // buried in the guitars (rachel goswell, bilinda butcher), and one rasping like it's shouting
  // (kurt cobain, courtney love). singers slide between notes more than any instrument. the breathy one
  // sings on a recording of a woman singing softly (the rasp is still synthesised)
  'dream-voice': { name: 'Dreamy voice', family: 'lead', edge: 0.1, own: true, kind: 'choir', vowel: 'oo', singers: [-5, 5], breath: 0.5, env: [0.12, 0.5, 0.85, 0.9], scoop: 15, drift: 5, gain: 0.26, vibrato: { rate: 5, depth: 10, delay: 0.4 }, ornaments: { slide: 0.3, grace: 0.06, glide: 0.12, swell: 0.3 }, samples: 'female-voice', sampled: { name: 'A woman singing (owstu)', gain: 0.33 } },
  'rasp-voice':  { name: 'Rasping voice', family: 'lead', edge: 0.55, own: true, kind: 'choir', vowel: 'ah', singers: [0, 6], rasp: 4, breath: 0.3, env: [0.03, 0.3, 0.85, 0.3], scoop: 35, drift: 6, gain: 0.21, vibrato: { rate: 5.5, depth: 14, delay: 0.3 }, ornaments: { slide: 0.25, fall: 0.12, glide: 0.08, swell: 0.15 } },
  // real voices singing, each gliding from note to note through a phrase (sung): a man singing ah, low,
  // for chant and the bottom of a choir; an operatic soprano with her own wide vibrato, for the voice
  // over a choir; someone humming, for lullabies and memories. each keeps to what they sang (range)
  'chant-voice': { name: 'Low voice', family: 'lead', edge: 0.1, world: 'acoustic', own: true, kind: 'choir', vowel: 'ah', singers: [0], breath: 0.12, octave: -2, range: [41, 62], sung: true, env: [0.25, 0.5, 0.9, 1.2], drift: 4, gain: 0.93, vibrato: { rate: 5, depth: 10, delay: 0.5 }, ornaments: { slide: 0.2, glide: 0.15, swell: 0.3 }, samples: 'chant-voice', sampled: { name: "Hadzi-Fia's ah (Karoryfer)", gain: 0.35 } },
  soprano:       { name: 'Soprano', family: 'lead', edge: 0.2, world: 'acoustic', own: true, kind: 'choir', vowel: 'ah', singers: [0], breath: 0.08, range: [62, 88], sung: true, env: [0.2, 0.5, 0.9, 1], drift: 6, gain: 0.5, vibrato: { rate: 5.6, depth: 30, delay: 0.3 }, ornaments: { slide: 0.15, glide: 0.12, swell: 0.35 }, samples: 'soprano', sampled: { name: 'Soprano (CHallSmith)', gain: 0.62 } },
  humming:       { name: 'Humming voice', family: 'lead', edge: 0.05, world: 'acoustic', own: true, kind: 'choir', vowel: 'oo', singers: [0], breath: 0.2, octave: -1, range: [50, 70], sung: true, env: [0.2, 0.5, 0.9, 1], drift: 5, gain: 0.32, ornaments: { slide: 0.25, glide: 0.15, swell: 0.3 }, samples: 'hum-voice', sampled: { name: 'Humming (drotzruhn)', gain: 0.16, reach: 10 } },
  // a woman singing softly, close to the microphone: a voice for a tune, sung as a line on her own notes
  'alto-voice':  { name: 'Voice', family: 'lead', edge: 0.1, world: 'acoustic', own: true, kind: 'choir', vowel: 'oo', singers: [0], breath: 0.15, range: [53, 79], sung: true, env: [0.15, 0.5, 0.9, 0.9], drift: 5, gain: 0.25, vibrato: { rate: 5.2, depth: 12, delay: 0.4 }, ornaments: { slide: 0.25, glide: 0.12, swell: 0.3 }, samples: 'female-voice', sampled: { name: 'A woman singing (owstu)', gain: 0.32 } },
  // saxophones: the reed wave, a puff of breath, the brass body's resonances, and the filter opening
  // as each note's blown harder. players scoop into notes, slide, fall off the ends of phrases and
  // shake long notes (bebop, mettaton's death by glamour, lounge and soul)
  'alto-sax':    { name: 'Alto sax', family: 'lead', edge: 0.45, world: 'acoustic', kind: 'sub', osc: [['reed', 0], ['reed', 4, 0, 0.25]], breath: 0.18, chiff: 0.15, filter: { freq: 1800, q: 0.7, env: 1.8, attack: 0.06, decay: 0.4, track: 0.6 }, body: [[550, 3, 1.2], [1500, 4, 1.2], [2700, 3, 1.5]], env: [0.04, 0.4, 0.85, 0.3], scoop: 20, drift: 6, gain: 0.094, vibrato: { rate: 5.2, depth: 14, delay: 0.45 }, ornaments: { slide: 0.2, bend: 0.15, bendBy: 1, fall: 0.2, grace: 0.1, shake: 0.2, glide: 0.08, swell: 0.2, doit: 0.12 }, samples: 'alto-sax', sampled: { name: 'Alto sax (MTG)', gain: 0.32 }, more: { 'weresax-alto': { name: 'Alto sax (Karoryfer)', gain: 0.17 }, saxello: { name: 'Saxello, a straight soprano (VCSL)', gain: 0.25, weight: 0.5 } } },
  'tenor-sax':   { name: 'Tenor sax', family: 'lead', edge: 0.4, world: 'acoustic', kind: 'sub', osc: [['reed', 0], ['reed', 5, 0, 0.25]], breath: 0.22, chiff: 0.15, filter: { freq: 1300, q: 0.7, env: 1.8, attack: 0.06, decay: 0.45, track: 0.6 }, body: [[450, 4, 1.2], [1100, 4, 1.2], [2300, 2, 1.5]], env: [0.05, 0.4, 0.85, 0.35], scoop: 20, drift: 6, gain: 0.09, vibrato: { rate: 5, depth: 12, delay: 0.5 }, ornaments: { slide: 0.2, bend: 0.15, bendBy: 1, fall: 0.2, grace: 0.1, shake: 0.2, glide: 0.09, swell: 0.2, doit: 0.1 }, samples: 'tenor-sax', sampled: { name: 'Tenor sax (VCSL)', gain: 0.26 }, more: { 'tenor-sax-2': { name: 'Tenor sax (Musyng Kite)', gain: 0.2 } } },
  // a trumpet: brass waves, the filter flaring open on every note, the bell's bright resonances, a
  // lip slur up onto the note (scoop) and falls off the ends of phrases
  trumpet:       { name: 'Trumpet', family: 'lead', edge: 0.55, world: 'acoustic', kind: 'sub', osc: [['brass', -2], ['brass', 2]], filter: { freq: 900, q: 0.9, env: 3.5, attack: 0.05, decay: 0.35, track: 0.7 }, body: [[1200, 5, 1.4], [2500, 4, 1.5]], env: [0.03, 0.35, 0.85, 0.25], scoop: 25, drift: 4, gain: 0.083, vibrato: { rate: 5.5, depth: 10, delay: 0.5 }, ornaments: { fall: 0.25, slide: 0.1, bend: 0.1, bendBy: 1, shake: 0.1, glide: 0.06, swell: 0.15, doit: 0.12 }, samples: 'trumpet', sampled: { name: 'Trumpet (VSCO)', gain: 0.3 }, more: { 'trumpet-vib': { name: 'Trumpet with vibrato (VSCO)', gain: 0.37 } } },
  // a trumpet with a harmon mute in its bell: thin, nasal and close (miles davis)
  'mute-trumpet': { name: 'Muted trumpet', family: 'lead', edge: 0.35, world: 'acoustic', kind: 'sub', osc: [['brass', -2], ['brass', 2]], breath: 0.05, filter: { freq: 1500, q: 2.2, env: 1.6, attack: 0.05, decay: 0.3, track: 0.6 }, body: [[1600, 9, 3], [600, -8, 1]], env: [0.03, 0.35, 0.85, 0.3], scoop: 20, drift: 4, gain: 0.098, vibrato: { rate: 5, depth: 8, delay: 0.5 }, ornaments: { fall: 0.2, slide: 0.15, bend: 0.1, bendBy: 1, glide: 0.07, doit: 0.1 }, samples: 'harmon-trumpet', sampled: { name: 'Harmon mute (VSCO)', gain: 0.5 }, more: { 'straight-trumpet': { name: 'Straight mute (VSCO)', gain: 0.47 } } },
  // a trombone's slide is the one brass instrument that slides for real, so it slides often and slowly
  trombone:      { name: 'Trombone', family: 'lead', edge: 0.4, world: 'acoustic', kind: 'sub', osc: [['brass', -3], ['brass', 3]], filter: { freq: 600, q: 0.9, env: 3, attack: 0.08, decay: 0.5, track: 0.6 }, body: [[500, 4, 1.2], [1100, 3, 1.3]], env: [0.05, 0.4, 0.85, 0.3], scoop: 15, drift: 4, gain: 0.091, vibrato: { rate: 4.8, depth: 6, delay: 0.6 }, ornaments: { slide: 0.55, fall: 0.2, glide: 0.18, swell: 0.2, doit: 0.1 }, samples: 'trombone', sampled: { name: 'Trombone (VSCO)', gain: 0.14 }, more: { 'trombone-vib': { name: 'Trombone with vibrato (VSCO)', gain: 0.32 } } },
  // a harmonica: free reeds, cupped hands (body) and breath. players bend notes down with their mouth
  // and let them come back up, the cry of the blues and of a lonesome country tune
  harmonica:     { name: 'Harmonica', family: 'lead', edge: 0.45, world: 'acoustic', kind: 'sub', osc: [['freereed', 0], ['freereed', 6, 0, 0.5]], breath: 0.25, filter: { freq: 2200, q: 0.7, track: 0.4 }, body: [[800, 4, 1.5], [2200, 3, 1.5]], env: [0.03, 0.3, 0.85, 0.2], drift: 5, gain: 0.127, tremolo: { rate: 5.5, depth: 0.1 }, ornaments: { bend: 0.35, bendBy: 1, slide: 0.2, shake: 0.3, grace: 0.1, glide: 0.08, swell: 0.2 }, samples: 'harmonica', sampled: { name: 'Harmonica (VCSL)', gain: 0.25 }, more: { 'harmonica-c': { name: 'Hohner Special 20 (VCSL)', gain: 0.5 } } },
  // a pedal steel: a steel bar sliding along the strings, a volume pedal swelling each note in (the
  // slow attack) and pedals bending one string of a chord up a step, so it slides between notes all
  // the time and often plays two at once (stop): country's crying sound
  'pedal-steel': { name: 'Pedal steel', family: 'lead', edge: 0.3, kind: 'pluck', bright: 0.55, soft: 0.3, decay: 5, sustain: 0.5, env: [0.08, 2, 0.9, 0.6], gain: 1, vibrato: { rate: 5, depth: 8, delay: 0.5 }, ornaments: { slide: 0.6, glide: 0.2, stop: 0.3, shake: 0.1, release: 0.25 },
    amp: { tight: 60, curve: 'tube', gain: 1.2, presence: [2500, 2], cab: 6500, level: 0.96 }, samples: 'shiny-guitar', sampled: { gain: 1 } },
  // an erhu: two strings over a snake skin, bowed. nasal (the skin's resonances), with deep vibrato
  // and long slides between notes
  erhu:          { name: 'Erhu', family: 'lead', edge: 0.4, world: 'acoustic', own: true, kind: 'sub', osc: [['bowed', 0]], breath: 0.08, filter: { freq: 2600, q: 1, track: 0.3 }, body: [[800, 7, 2.5], [1700, -3, 1.5], [3000, 5, 2]], env: [0.1, 0.4, 0.85, 0.35], scoop: 30, drift: 6, gain: 0.074, vibrato: { rate: 5.8, depth: 22, delay: 0.25 }, ornaments: { slide: 0.6, glide: 0.22, grace: 0.15, trill: 0.05, swell: 0.35 }, samples: 'erhu', sampled: { gain: 0.2 } },
  // a shakuhachi: a bamboo flute played so breathily the air is half the sound, its pitch bent by
  // tilting the head (bend, slide), with a slow, deep vibrato
  shakuhachi:    { name: 'Shakuhachi', family: 'lead', edge: 0.15, world: 'acoustic', own: true, kind: 'sub', osc: [['sine', 0], ['triangle', 3, 1, 0.08]], breath: 0.8, chiff: 0.6, env: [0.12, 0.4, 0.8, 0.5], scoop: 30, drift: 8, gain: 0.17, vibrato: { rate: 4.5, depth: 14, delay: 0.6 }, ornaments: { slide: 0.3, bend: 0.25, bendBy: 1, grace: 0.1, glide: 0.2, swell: 0.4 }, samples: 'shakuhachi', sampled: { name: 'Shakuhachi (FluidR3)', gain: 0.43 }, more: { 'shakuhachi-2': { name: 'Shakuhachi (Musyng Kite)', gain: 0.58 } } },
  // a bansuri: india's bamboo flute, breathy and sweet, sliding into notes and graced all the time
  bansuri:       { name: 'Bansuri', family: 'lead', edge: 0.15, world: 'acoustic', own: true, kind: 'sub', osc: [['sine', 0], ['triangle', 2, 1, 0.1]], breath: 0.5, chiff: 0.4, env: [0.08, 0.3, 0.85, 0.45], scoop: 20, drift: 5, gain: 0.18, vibrato: { rate: 5.2, depth: 12, delay: 0.5 }, ornaments: { slide: 0.35, glide: 0.18, grace: 0.25, trill: 0.08, swell: 0.25 }, samples: 'flute', sampled: { name: 'Flute (VSCO)', gain: 2.3 }, more: { 'flute-plain': { name: 'Flute, no vibrato (VSCO)', gain: 1.5 } } },
  // a melodica: a keyboard you blow into, reeds like an accordion's. reggae's lead (augustus pablo)
  melodica:      { name: 'Melodica', family: 'lead', edge: 0.35, world: 'acoustic', kind: 'sub', osc: [['freereed', -3], ['freereed', 3]], breath: 0.15, filter: { freq: 2400, q: 0.6, track: 0.3 }, body: [[1000, 3, 1.2]], env: [0.03, 0.3, 0.9, 0.15], drift: 3, gain: 0.1, ornaments: { grace: 0.1, slide: 0.1, swell: 0.15 }, samples: 'bandoneon', sampled: { name: 'Bandoneon (FluidR3)', gain: 0.34 }, more: { 'bandoneon-2': { name: 'Bandoneon (Musyng Kite)', gain: 0.18 } } },
  // a bagpipe's chanter: a double reed blown from a bag, so it never stops for breath and can't play
  // louder or softer. pipers can't tongue either, so they split notes with quick grace notes ("cuts")
  // instead, which is why it has so many
  bagpipe:       { name: 'Bagpipe', family: 'lead', edge: 0.65, world: 'acoustic', own: true, kind: 'sub', osc: [['pulse12', 0], ['sawtooth', 2, 0, 0.5]], filter: { freq: 2400, q: 1.2, track: 0.4 }, body: [[1000, 4, 2], [2500, 3, 1.5]], env: [0.03, 0.2, 0.95, 0.15], drift: 2, gain: 0.11, ornaments: { grace: 0.4, trill: 0.05 }, samples: 'bagpipe', sampled: { name: 'Squidpipes (Karoryfer)', gain: 0.27 }, more: { 'gm-bagpipe': { name: 'Bagpipe (FluidR3)', gain: 0.2 } } },
  // an oboe: a double reed, nasal and plaintive, the pastoral solo of the orchestra. its ancestor, the
  // aulos, is the ancient world's pipe
  oboe:          { name: 'Oboe', family: 'lead', edge: 0.4, world: 'acoustic', kind: 'sub', osc: [['reed', 0]], breath: 0.05, filter: { freq: 2000, q: 1.2, track: 0.4 }, body: [[1100, 6, 2], [2700, 4, 1.5]], env: [0.04, 0.3, 0.85, 0.3], scoop: 15, drift: 4, gain: 0.25, vibrato: { rate: 5.2, depth: 10, delay: 0.35 }, ornaments: { grace: 0.15, trill: 0.06, slide: 0.08, swell: 0.25 }, samples: 'vsco-oboe', sampled: { name: 'Oboe (VSCO)', gain: 0.5 }, more: { oboe: { name: 'Oboe (FluidR3)', gain: 0.41, weight: 0.5 } } },
  // blowing across a bottle: nearly a pure tone in a lot of breath. underwater, a cave, something old
  'blown-bottle': { name: 'Blown bottle', family: 'lead', edge: 0.1, world: 'acoustic', kind: 'sub', osc: [['sine', 0], ['sine', 0, 1, 0.05]], breath: 0.9, chiff: 0.3, env: [0.08, 0.3, 0.8, 0.4], drift: 4, gain: 0.2, ornaments: { slide: 0.1, swell: 0.2 }, samples: 'blown-bottle', sampled: { name: 'Blown bottle (FluidR3)', gain: 0.41 }, more: { 'blown-bottle-2': { name: 'Blown bottle (Musyng Kite)', gain: 1.1 } } },
  // wine glasses sung by a wet finger round the rim: pure, glassy and very still. only four were
  // recorded, high up, so it's a tune instrument
  'wine-glass':  { name: 'Wine glasses', family: 'lead', edge: 0.1, world: 'acoustic', own: true, kind: 'sub', osc: [['sine', 0], ['sine', 0, 1, 0.15], ['sine', 0, 2, 0.05]], env: [0.6, 0.5, 0.9, 1.5], drift: 2, gain: 0.22, tremolo: { rate: 4, depth: 0.15 }, ornaments: { swell: 0.3 }, samples: 'wine-glass', sampled: { gain: 0.74 } },
  // a bowed psaltery: a triangle of strings, each bowed on its own, thin and ghostly
  'bowed-psaltery': { name: 'Bowed psaltery', family: 'lead', edge: 0.3, world: 'acoustic', own: true, kind: 'sub', osc: [['bowed', 0]], breath: 0.04, filter: { freq: 3500, q: 0.5 }, body: [[1200, 3, 1.5]], env: [0.25, 0.4, 0.85, 1.2], drift: 4, gain: 0.063, vibrato: { rate: 5, depth: 6, delay: 0.5 }, ornaments: { swell: 0.3 }, samples: 'bowed-psaltery', sampled: { gain: 0.83 } },
  // a soul singer with no words: a warm "oh", sliding and running between notes (melisma, grace) and
  // shaking long ones, sung on the same woman's recording
  'soul-voice':  { name: 'Soul voice', family: 'lead', edge: 0.15, own: true, kind: 'choir', vowel: 'oh', singers: [-3, 4], breath: 0.25, env: [0.08, 0.4, 0.85, 0.5], scoop: 25, drift: 6, gain: 0.2, vibrato: { rate: 5.4, depth: 16, delay: 0.35 }, ornaments: { slide: 0.45, glide: 0.12, grace: 0.25, fall: 0.1, shake: 0.2, swell: 0.25 }, samples: 'female-voice', sampled: { name: 'A woman singing (owstu)', gain: 0.3 } },

  // basses
  'sub-bass':    { name: 'Sub bass', family: 'bass', edge: 0, kind: 'sub', osc: [['sine', 0], ['triangle', 0, 0, 0.25]], env: [0.02, 0.3, 0.9, 0.3], gain: 0.42 },
  'round-bass':  { name: 'Round bass', family: 'bass', edge: 0.1, kind: 'sub', osc: [['triangle', 0], ['sine', 0, -1, 0.5]], filter: { freq: 600, q: 0.5 }, env: [0.01, 0.4, 0.75, 0.2], gain: 0.4 },
  // a moog's bass (c418 kept his voyager for basses): a saw and a square through the ladder filter, a
  // little squelch on each note's start, and a slide into the next
  'moog-bass':   { name: 'Moog bass', family: 'bass', edge: 0.3, kind: 'sub', osc: [['sawtooth', 0], ['square', -5, -1, 0.5]], filter: { freq: 380, q: 3, env: 2.5, attack: 0.005, decay: 0.3, track: 0.4 }, env: [0.005, 0.4, 0.8, 0.18], gain: 0.2, ornaments: { glide: 0.2, slide: 0.12 } },
  'synth-bass':  { name: 'Synth bass', family: 'bass', edge: 0.5, kind: 'sub', osc: [['sawtooth', -4], ['square', 4, -1, 0.5]], filter: { freq: 280, q: 4, env: 4, attack: 0.005, decay: 0.15 }, env: [0.005, 0.3, 0.7, 0.12], gain: 0.15, ornaments: { slide: 0.1, glide: 0.05 } },
  // an electric bass played with the fingers: round, with a soft thump
  'pluck-bass':  { name: 'Plucked bass', family: 'bass', edge: 0.2, kind: 'pluck', bright: 0.45, soft: 0.3, decay: 2, filter: { freq: 900, q: 0.7 }, env: [0.002, 1.5, 1, 0.15], gain: 1.3, ornaments: { slide: 0.08, glide: 0.06 }, samples: 'bass-guitar', sampled: { name: 'Darkblack bass (Karoryfer)', gain: 0.83 }, more: { 'pasta-bass': { name: 'Pastabass (Karoryfer)', gain: 1.1 }, 'growly-bass': { name: 'Growlybass (Karoryfer)', gain: 1 } } },
  // a double bass, its big wooden body booming under the plucked string
  upright:       { name: 'Upright bass', family: 'bass', edge: 0.1, world: 'acoustic', kind: 'pluck', bright: 0.22, soft: 0.6, decay: 1.4, filter: { freq: 600, q: 0.8 }, body: [[90, 4, 2], [180, 3, 1.5], [1100, 2, 1.2]], env: [0.004, 1, 1, 0.14], gain: 0.6, ornaments: { slide: 0.05, glide: 0.06 }, samples: 'double-bass', sampled: { name: 'Contrabass (VSCO)', gain: 0.72 }, more: { 'meat-bass': { name: 'Meatbass (Karoryfer)', gain: 0.39 }, 'sneaky-bass': { name: 'Double bass played softly (Karoryfer)', gain: 1.5 } } },
  // (edge 0.7: buzzy, but at 1 it never fitted under any mood's backing cap)
  'growl-bass':  { name: 'Growl bass', family: 'bass', edge: 0.7, kind: 'sub', osc: [['sawtooth', -10], ['sawtooth', 10], ['square', 0, -1, 0.6]], filter: { freq: 420, q: 6, env: 3, attack: 0.01, decay: 0.25 }, env: [0.005, 0.3, 0.8, 0.12], gain: 0.11, ornaments: { slide: 0.15, glide: 0.06 } },
  'chip-bass':   { name: 'Triangle bass', family: 'bass', edge: 0.15, world: 'chip', kind: 'sub', osc: [['chiptri', 0]], env: [0.003, 0.2, 0.9, 0.06], gain: 0.42 },
  // two saws a little apart, beating slowly against each other under a moving filter
  reese:         { name: 'Reese bass', family: 'bass', edge: 0.6, kind: 'sub', osc: [['sawtooth', -14], ['sawtooth', 14], ['sine', 0, -1, 0.6]], filter: { freq: 380, q: 1.5, lfo: [0.2, 0.35] }, env: [0.01, 0.3, 0.9, 0.15], gain: 0.12, ornaments: { slide: 0.15, glide: 0.08 } },
  // a bassoon: the oboe's big brother, a double reed folded in two. woody and a little comic, a medieval
  // or pastoral band's bass
  bassoon:       { name: 'Bassoon', family: 'bass', edge: 0.25, world: 'acoustic', kind: 'sub', osc: [['reed', 0]], filter: { freq: 900, q: 1, track: 0.5 }, body: [[500, 4, 2], [1150, 3, 1.5]], env: [0.04, 0.3, 0.85, 0.25], scoop: 10, drift: 3, gain: 0.14, ornaments: { slide: 0.05 }, samples: 'vsco-bassoon', sampled: { name: 'Bassoon (VSCO)', gain: 0.25 }, more: { bassoon: { name: 'Bassoon (FluidR3)', gain: 0.21, weight: 0.5 } } },
  // the high, chorused post-punk bass that carries the tune as much as the root
  'chorus-bass': { name: 'Chorus bass', family: 'bass', edge: 0.35, kind: 'sub', osc: [['sawtooth', -8], ['triangle', 8], ['sine', 0, -1, 0.4]], filter: { freq: 1100, q: 0.8, env: 2, attack: 0.005, decay: 0.2, track: 0.4 }, env: [0.004, 0.5, 0.6, 0.15], gain: 0.18 },
  // a bass played with a pick through a grinding amp, with its clean low end blended back in (dry),
  // the way a bass rig keeps its weight: rock, punk and grunge
  'pick-bass':   { name: 'Picked bass', family: 'bass', edge: 0.3, own: true, kind: 'pluck', bright: 0.55, soft: 0.1, decay: 1.8, env: [0.002, 1.6, 1, 0.1], gain: 1,
    amp: { low: 35, curve: 'tube', gain: 4, presence: [1500, 3], cab: 2800, level: 0.15, dry: 0.45 }, samples: 'bass-guitar', sampled: { name: 'Darkblack bass (Karoryfer)', gain: 0.92 }, more: { 'pasta-bass': { name: 'Pastabass (Karoryfer)', gain: 1.3 }, 'growly-bass': { name: 'Growlybass (Karoryfer)', gain: 1.2 } } },
  // a fuzz bass, as heavy as the guitars: sludge and nugaze
  'fuzz-bass':   { name: 'Fuzz bass', family: 'bass', edge: 0.5, own: true, kind: 'pluck', bright: 0.5, soft: 0.1, decay: 3, env: [0.002, 2, 1, 0.12], gain: 1,
    amp: { low: 35, curve: 'soft', gain: 25, sustain: 8, mids: [600, -3], cab: 2200, level: 0.03, dry: 0.5 }, samples: 'bass-guitar', sampled: { name: 'Darkblack bass (Karoryfer)', gain: 0.98 }, more: { 'pasta-bass': { name: 'Pastabass (Karoryfer)', gain: 1.4 }, 'growly-bass': { name: 'Growlybass (Karoryfer)', gain: 1.3 } } },
  // slap bass: the thumb slapping the low strings and fingers popping the high ones, so it's bright
  // and percussive (funk, mettaton's disco)
  'slap-bass':   { name: 'Slap bass', family: 'bass', edge: 0.35, kind: 'pluck', bright: 0.85, soft: 0, decay: 1.6, ring: 0.4, body: [[80, 3, 1], [2500, 4, 1]], env: [0.002, 1.6, 1, 0.08], gain: 0.5, ornaments: { slide: 0.15, glide: 0.07 }, samples: 'slap-bass', sampled: { name: 'Slap bass (FluidR3)', gain: 0.68 }, more: { 'slap-bass-2': { name: 'Slap bass (Musyng Kite)', gain: 0.69 } } },
  // a fretless bass: no frets, so it slides between notes and its notes "mwah" (the filter opening
  // and closing on each one). jaco pastorius, and a lot of soul and lounge
  fretless:      { name: 'Fretless bass', family: 'bass', edge: 0.15, kind: 'sub', osc: [['triangle', 0], ['sawtooth', 0, 0, 0.3], ['sine', 0, -1, 0.4]], filter: { freq: 650, q: 1.8, env: 2.2, attack: 0.03, decay: 0.35, track: 0.5 }, env: [0.01, 0.6, 0.8, 0.15], drift: 3, gain: 0.325, ornaments: { slide: 0.5, glide: 0.15 }, samples: 'fretless', sampled: { name: 'Fretless bass (FluidR3)', gain: 0.48 }, more: { 'fretless-2': { name: 'Fretless bass (Musyng Kite)', gain: 0.33 } } },
  // a tuba: the oom of an oom-pah band, brass waves kept dark
  tuba:          { name: 'Tuba', family: 'bass', edge: 0.2, world: 'acoustic', kind: 'sub', osc: [['brass', -2], ['brass', 2]], filter: { freq: 350, q: 0.8, env: 2.2, attack: 0.08, decay: 0.5, track: 0.6 }, env: [0.05, 0.4, 0.85, 0.25], scoop: 10, drift: 3, gain: 0.15, samples: 'tuba', sampled: { name: 'Tuba (VSCO)', gain: 0.3 }, more: { 'tuba-2': { name: 'Tuba (Musyng Kite)', gain: 0.35 } } },
  // the 808's bass drum with its decay turned right up: a long, booming sine that drops onto its note,
  // under trap, club records and crystal castles. players slide between notes all the time (the trap
  // "glide"). one recording, so it stretches further than others (reach)
  '808-bass':    { name: '808 bass', family: 'bass', edge: 0.1, kind: 'sub', osc: [['sine', 0], ['triangle', 0, 0, 0.12]], env: [0.005, 1.2, 0.5, 0.25], gain: 0.57, ornaments: { slide: 0.15, glide: 0.08 }, samples: '808-bass', sampled: { gain: 1.1, reach: 20 } },

  // drones
  'deep-drone':  { name: 'Deep drone', family: 'drone', edge: 0.35, kind: 'sub', osc: [['sawtooth', -10], ['sawtooth', 9], ['sine', 0, -1, 0.7]], filter: { freq: 300, q: 2 }, env: [4, 3, 0.85, 5], gain: 0.07, tremolo: { rate: 0.13, depth: 0.25 } },
  // cellos holding a note: bowed waves, a cello's body, each player drifting on their own
  'cello-drone': { name: 'Cello drone', family: 'drone', edge: 0.3, world: 'acoustic', kind: 'sub', osc: [['bowed', -3], ['bowed', 4]], breath: 0.03, filter: { freq: 900, q: 1 }, body: [[130, 4, 2], [400, 3, 2], [2000, 2, 1]], env: [2.5, 2, 0.85, 3], ensemble: true, drift: 4, gain: 0.0525, vibrato: { rate: 4.5, depth: 7, delay: 1.5 }, samples: 'cello-section', sampled: { name: 'Cello section (VSCO)', gain: 0.36 }, more: { cello: { name: 'Solo cello (Karoryfer x Bigcat)', gain: 0.21 }, 'bowed-bass': { name: 'Double bass, bowed (VSCO)', gain: 0.28 } } },
  void:          { name: 'The void', family: 'drone', edge: 0.1, kind: 'sub', osc: [['sine', 0], ['sine', 7], ['sine', -5, 1, 0.3]], breath: 0.6, env: [5, 3, 0.85, 6], gain: 0.17, tremolo: { rate: 0.08, depth: 0.4 } },
  'bowed-metal': { name: 'Bowed metal', family: 'drone', edge: 0.6, kind: 'fm', ratio: 2.71, index: 1.4, indexDecay: 6, sustainIndex: 0.9, env: [3, 2, 0.85, 4], gain: 0.07, vibrato: { rate: 0.3, depth: 20, delay: 0 } },
  'organ-drone': { name: 'Organ drone', family: 'drone', edge: 0.3, kind: 'sub', osc: [['organ', 0], ['organ', 3, -1, 0.5]], filter: { freq: 1600, q: 0.3 }, env: [2, 2, 0.9, 3], gain: 0.06, samples: 'pipe-organ', sampled: { gain: 0.37 } },
  // a warm tone on a worn tape loop, drooping and swelling: basinski, and aphex twin's quieter side
  'tape-loop':   { name: 'Tape loop', family: 'drone', edge: 0.1, kind: 'sub', osc: [['soft', 0], ['sine', 3, 1, 0.3]], filter: { freq: 1200, q: 0.4 }, env: [3, 2, 0.85, 4], gain: 0.1, vibrato: { rate: 0.17, depth: 14, delay: 0 }, tremolo: { rate: 0.09, depth: 0.3 } },
  // a tanpura: four long strings plucked over and over under a raga, never the tune, buzzing like the
  // sitar's (buzz). it's plucked, so it plays the drone's "cycle" pattern (music.js), not a held note
  tanpura:       { name: 'Tanpura', family: 'drone', edge: 0.2, world: 'acoustic', own: true, kind: 'pluck', bright: 0.7, soft: 0.2, decay: 6, ring: 0.35, buzz: 0.1, body: [[200, 3, 1.5], [800, 2, 1.5]], env: [0.003, 6, 1, 2], gain: 0.54, samples: 'sitar', sampled: { gain: 0.28 } },
  // throat singing (a tuvan sygyt and a mongolian khoomei): a low note with a whistled tune of its
  // overtones above it, in tune in any key since they're whole multiples. it holds one note near its own
  // (home). the synthesised version is a voice through a narrow vowel that whistles one overtone
  'throat-singing': { name: 'Throat singing', family: 'drone', edge: 0.3, world: 'acoustic', own: true, kind: 'choir', vowel: 'khoomei', singers: [0], breath: 0.1, home: 56, sung: true, env: [0.8, 1, 0.9, 2], drift: 3, gain: 0.19, samples: 'sygyt', sampled: { name: 'Sygyt (Alfonso Pérez)', gain: 0.22, reach: 12 }, more: { khoomei: { name: 'Khoomei (nemaavla)', gain: 0.35, reach: 12 } } },
  // kargyraa, the low style: the false vocal folds flap at half the voice's speed, so it growls an
  // octave under the note it's singing, with the overtones above it
  kargyraa:      { name: 'Throat singing, low', family: 'drone', edge: 0.35, world: 'acoustic', own: true, kind: 'choir', vowel: 'ah', singers: [0], breath: 0.15, home: 39, sung: true, env: [0.8, 1, 0.9, 2], drift: 3, gain: 0.68, samples: 'kargyraa', sampled: { name: 'Kargyraa (Alfonso Pérez)', gain: 0.41, reach: 12 } },
  // a didgeridoo: lips buzzing into a hollowed out branch, one deep note whose sound is shaped by the
  // mouth (the filter opening and closing) and breathed round and round without a break
  didgeridoo:    { name: 'Didgeridoo', family: 'drone', edge: 0.3, world: 'acoustic', own: true, kind: 'sub', osc: [['sawtooth', 0], ['square', 0, 0, 0.3]], breath: 0.1, filter: { freq: 450, q: 5, lfo: [0.6, 0.5] }, home: 37, env: [0.3, 0.5, 0.9, 0.8], drift: 2, gain: 0.061, samples: 'didgeridoo', sampled: { gain: 1.1, reach: 12 } },

  // drum kits, slots in KIT_SLOTS order
  'soft-kit': { name: 'Soft kit', family: 'kit', world: 'acoustic', kind: 'drums', suits: ['pulse', 'sparse', 'brush', 'halftime', 'groove', 'train'], slots: [
    { voice: 'kick', tune: 50, decay: 0.35, gain: 0.7, hit: 'studio-kit/kick', level: 1.4 }, { voice: 'brush', tone: 2200, decay: 0.18, gain: 0.3 }, { voice: 'shaker', tone: 5500, decay: 0.07, gain: 0.18, hit: 'percussion/shaker', level: 0.23 },
    { voice: 'shaker', tone: 5000, decay: 0.25, gain: 0.2, hit: 'percussion/shaker', level: 0.37 }, { voice: 'tick', tune: 1100, decay: 0.06, gain: 0.2, hit: 'percussion/claves', level: 0.56 }, { voice: 'tom', tune: 90, decay: 0.4, gain: 0.45, hit: 'studio-kit/low-tom', level: 0.48, at: 90 }] },
  'lofi-kit': { name: 'Lo-fi kit', family: 'kit', kind: 'drums', suits: ['groove', 'halftime', 'sparse', 'pulse', 'shuffle', 'onedrop'], slots: [
    { voice: 'kick', tune: 52, decay: 0.3, gain: 0.85, hit: 'lofi-kit/kick', level: 2.1 }, { voice: 'snare', tune: 180, tone: 1500, decay: 0.22, gain: 0.42, hit: 'lofi-kit/snare', level: 0.36 }, { voice: 'hat', tone: 6500, decay: 0.045, gain: 0.18, hit: 'lofi-kit/hat', level: 0.057 },
    { voice: 'hat', tone: 6500, decay: 0.3, gain: 0.16, hit: 'lofi-kit/open-hat', level: 0.2 }, { voice: 'rim', tune: 1700, decay: 0.03, gain: 0.25, hit: 'lofi-kit/rim', level: 0.34 }, { voice: 'tom', tune: 100, decay: 0.35, gain: 0.5, hit: 'lofi-kit/low-tom', level: 0.76, at: 100 }] },
  // a pop and funk kit from its close microphones, dry and punchy, with a drum machine's clap
  'tight-kit': { name: 'Tight kit', family: 'kit', kind: 'drums', suits: ['groove', 'halftime', 'march', 'tribal', 'sparse', 'pulse', 'shuffle', 'funk', 'onedrop', 'train'], slots: [
    { voice: 'kick', tune: 55, decay: 0.28, gain: 0.9, hit: 'tight-kit/kick', level: 1.2 }, { voice: 'snare', tune: 180, tone: 1900, decay: 0.16, gain: 0.5, hit: 'tight-kit/snare', level: 0.43 }, { voice: 'hat', tone: 8000, decay: 0.035, gain: 0.2, hit: 'tight-kit/hat', level: 0.13 },
    { voice: 'hat', tone: 8000, decay: 0.25, gain: 0.17, hit: 'tight-kit/open-hat', level: 0.43 }, { voice: 'clap', tone: 1200, decay: 0.15, gain: 0.4, hit: 'tr707/clap', level: 0.16 }, { voice: 'tom', tune: 110, decay: 0.3, gain: 0.5, hit: 'tight-kit/low-tom', level: 0.53, at: 110 },
    { voice: 'crash', tone: 6000, decay: 1.6, gain: 0.18, hit: 'tight-kit/crash', level: 0.86 }] },
  taiko: { name: 'Taiko', family: 'kit', world: 'acoustic', kind: 'drums', suits: ['tribal', 'march', 'pulse', 'halftime', 'sparse'], slots: [
    { voice: 'taiko', tune: 58, decay: 0.9, gain: 0.95, hit: 'orchestra-kit/taiko', level: 0.45, at: 58 }, { voice: 'rim', tune: 1200, decay: 0.05, gain: 0.35, hit: 'orchestra-kit/taiko-rim', level: 2.9 }, { voice: 'shaker', tone: 4500, decay: 0.08, gain: 0.2, hit: 'percussion/shaker', level: 0.25 },
    { voice: 'hat', tone: 5000, decay: 0.2, gain: 0.15 }, { voice: 'tick', tune: 900, decay: 0.07, gain: 0.3, hit: 'orchestra-kit/woodblock', level: 0.93 }, { voice: 'taiko', tune: 85, decay: 0.6, gain: 0.75, hit: 'orchestra-kit/taiko', level: 0.71, at: 58 }] },
  // a heartbeat: a concert bass drum played softly, twice (lub-dub), and little else
  heartbeat: { name: 'Heartbeat', family: 'kit', kind: 'drums', suits: ['pulse', 'sparse'], slots: [
    { voice: 'heart', tune: 52, decay: 0.2, gain: 0.85, hit: 'orchestra-kit/bass-drum', level: 1.4 }, { voice: 'brush', tone: 1800, decay: 0.2, gain: 0.25 }, { voice: 'shaker', tone: 6000, decay: 0.05, gain: 0.12, hit: 'percussion/shaker', level: 0.15 },
    { voice: 'shaker', tone: 5000, decay: 0.2, gain: 0.14, hit: 'percussion/shaker', level: 0.29 }, { voice: 'tick', tune: 1500, decay: 0.05, gain: 0.16, hit: 'percussion/claves', level: 0.41 }, { voice: 'tom', tune: 70, decay: 0.5, gain: 0.5, hit: 'orchestra-kit/timpani', level: 3, at: 70 }] },
  brushes: { name: 'Brushes', family: 'kit', world: 'acoustic', kind: 'drums', suits: ['brush', 'sparse', 'pulse', 'swing', 'train', 'shuffle', 'bossa'], slots: [
    { voice: 'kick', tune: 48, decay: 0.3, gain: 0.55, hit: 'studio-kit/kick', level: 1 }, { voice: 'brush', tone: 2600, decay: 0.22, gain: 0.38 }, { voice: 'brush', tone: 4000, decay: 0.08, gain: 0.18 },
    { voice: 'brush', tone: 3000, decay: 0.4, gain: 0.22 }, { voice: 'rim', tune: 1500, decay: 0.03, gain: 0.18, hit: 'studio-kit/rim', level: 0.73 }, { voice: 'tom', tune: 95, decay: 0.4, gain: 0.4, hit: 'studio-kit/low-tom', level: 0.47, at: 95 }] },
  // a clock's insides: woodblocks and claves ticking, a triangle for the chime
  clockwork: { name: 'Clockwork', family: 'kit', kind: 'drums', suits: ['pulse', 'sparse', 'march', 'groove', 'halftime'], slots: [
    { voice: 'kick', tune: 60, decay: 0.12, gain: 0.45 }, { voice: 'tick', tune: 900, decay: 0.05, gain: 0.3, hit: 'orchestra-kit/woodblock', level: 0.81, at: 900 }, { voice: 'tick', tune: 2400, decay: 0.03, gain: 0.2, hit: 'percussion/claves', level: 0.42 },
    { voice: 'tick', tune: 1800, decay: 0.12, gain: 0.2, hit: 'percussion/triangle', level: 1.5 }, { voice: 'rim', tune: 2000, decay: 0.025, gain: 0.25, hit: 'percussion/claves', level: 0.42 }, { voice: 'tick', tune: 500, decay: 0.08, gain: 0.3, hit: 'orchestra-kit/woodblock', level: 0.76, at: 900 }] },
  // the nes's drums: square wave thumps and bursts of noise
  'chip-kit': { name: 'Chip kit', family: 'kit', world: 'chip', kind: 'drums', suits: ['groove', 'march', 'halftime', 'four', 'break', 'pulse', 'sparse'], slots: [
    { voice: 'blip', tune: 55, decay: 0.16, gain: 0.58 }, { voice: 'noise', tone: 7000, decay: 0.13, gain: 0.58 }, { voice: 'noise', tone: 14000, decay: 0.03, gain: 0.29 },
    { voice: 'noise', tone: 12000, decay: 0.2, gain: 0.23 }, { voice: 'blip', tune: 880, decay: 0.04, gain: 0.22 }, { voice: 'blip', tune: 110, decay: 0.18, gain: 0.45 }] },
  // a club kit, a real roland tr-808: the long kick, the clap, the ticking hats (crystal castles, dying
  // light's chases, and most club records since 1982)
  'club-kit': { name: 'Club kit', family: 'kit', kind: 'drums', suits: ['four', 'break', 'groove', 'halftime'], slots: [
    { voice: 'kick', tune: 50, decay: 0.5, gain: 1, hit: 'tr808/kick', level: 1.3 }, { voice: 'clap', tone: 1400, decay: 0.2, gain: 0.48, hit: 'tr808/clap', level: 0.27 }, { voice: 'hat', tone: 9500, decay: 0.03, gain: 0.17, hit: 'tr808/hat', level: 0.023 },
    { voice: 'hat', tone: 9000, decay: 0.35, gain: 0.15, hit: 'tr808/open-hat', level: 0.017 }, { voice: 'rim', tune: 1700, decay: 0.03, gain: 0.2, hit: 'tr808/rim', level: 0.23 }, { voice: 'tom', tune: 80, decay: 0.4, gain: 0.45, hit: 'tr808/low-tom', level: 0.51, at: 80 },
    { voice: 'crash', tone: 6000, decay: 1.4, gain: 0.16, hit: 'tr808/crash', level: 0.29 }] },
  // a cheap drum machine in a big room, a real roland tr-707 (sampled drums, the 80s' affordable box):
  // post-punk, have a nice life, and the beats under aphex twin's early ambient
  machine: { name: 'Drum machine', family: 'kit', kind: 'drums', suits: ['groove', 'halftime', 'break', 'pulse', 'sparse', 'four', 'march', 'baggy'], slots: [
    { voice: 'kick', tune: 52, decay: 0.4, gain: 0.85, hit: 'tr707/kick', level: 1.3 }, { voice: 'snare', tune: 190, tone: 1200, decay: 0.4, gain: 0.45, hit: 'tr707/snare', level: 0.41 }, { voice: 'hat', tone: 7000, decay: 0.04, gain: 0.15, hit: 'tr707/hat', level: 0.021 },
    { voice: 'hat', tone: 7000, decay: 0.3, gain: 0.13, hit: 'tr707/open-hat', level: 0.021 }, { voice: 'rim', tune: 1300, decay: 0.04, gain: 0.22, hit: 'tr707/rim', level: 0.18 }, { voice: 'tom', tune: 100, decay: 0.5, gain: 0.45, hit: 'tr707/low-tom', level: 0.34, at: 100 },
    { voice: 'crash', tone: 6000, decay: 1.4, gain: 0.16, hit: 'tr707/crash', level: 0.2 }] },
  // rock kits: a ride for perc, a floor tom for low perc, and a real crash. a rock kit hit hard in a
  // live room, its snare cracking
  'rock-kit': { name: 'Rock kit', family: 'kit', kind: 'drums', suits: ['rock', 'punk', 'groove', 'halftime', 'breakdown', 'wash', 'march', 'sparse', 'pulse', 'shuffle', 'train'], slots: [
    { voice: 'kick', tune: 55, decay: 0.35, gain: 0.85, click: 0.35, hit: 'studio-kit/kick', level: 1.9 }, { voice: 'snare', tune: 190, tone: 1900, decay: 0.3, gain: 0.58, hit: 'studio-kit/snare', level: 0.54 }, { voice: 'hat', tone: 8000, decay: 0.04, gain: 0.2, hit: 'studio-kit/hat', level: 0.15 },
    { voice: 'hat', tone: 7500, decay: 0.35, gain: 0.17, hit: 'studio-kit/open-hat', level: 0.53 }, { voice: 'ride', tune: 2600, tone: 6500, decay: 0.9, gain: 0.17, hit: 'studio-kit/ride', level: 1.3 }, { voice: 'tom', tune: 90, decay: 0.45, gain: 0.55, hit: 'studio-kit/low-tom', level: 0.6, at: 90 },
    { voice: 'crash', tone: 6000, decay: 1.8, gain: 0.2, hit: 'studio-kit/crash', level: 0.75 }] },
  // a metal kit: a short, clicking kick that stays clear under double kick, a tight high snare, and a
  // trashier crash
  'metal-kit': { name: 'Metal kit', family: 'kit', kind: 'drums', suits: ['double', 'rock', 'punk', 'breakdown', 'halftime', 'groove', 'march', 'sparse', 'pulse'], slots: [
    { voice: 'kick', tune: 62, decay: 0.2, gain: 0.8, click: 0.7, hit: 'studio-kit/kick', level: 2 }, { voice: 'snare', tune: 210, tone: 2400, decay: 0.22, gain: 0.58, hit: 'studio-kit/snare', level: 0.46 }, { voice: 'hat', tone: 9000, decay: 0.03, gain: 0.19, hit: 'studio-kit/hat', level: 0.087 },
    { voice: 'hat', tone: 8500, decay: 0.3, gain: 0.16, hit: 'studio-kit/open-hat', level: 0.35 }, { voice: 'ride', tune: 3000, tone: 7000, decay: 0.7, gain: 0.18, hit: 'studio-kit/ride', level: 1.3 }, { voice: 'tom', tune: 85, decay: 0.4, gain: 0.55, hit: 'studio-kit/low-tom', level: 0.52, at: 85 },
    { voice: 'crash', tone: 4800, decay: 1.4, gain: 0.22, hit: 'studio-kit/crash', level: 0.76 }] },
  // shoegaze drums: a soft kick, a snare left ringing in a big room, and cymbals washing on and on
  'gaze-kit': { name: 'Gaze kit', family: 'kit', kind: 'drums', suits: ['wash', 'rock', 'halftime', 'groove', 'four', 'sparse', 'pulse', 'baggy'], slots: [
    { voice: 'kick', tune: 50, decay: 0.4, gain: 0.8, click: 0.1, hit: 'studio-kit/kick', level: 1.6 }, { voice: 'snare', tune: 175, tone: 1500, decay: 0.45, gain: 0.5, hit: 'studio-kit/snare', level: 0.5 }, { voice: 'hat', tone: 6500, decay: 0.06, gain: 0.17, hit: 'studio-kit/hat', level: 0.19 },
    { voice: 'hat', tone: 6000, decay: 0.5, gain: 0.15, hit: 'studio-kit/open-hat', level: 0.79 }, { voice: 'ride', tune: 2200, tone: 5000, decay: 1.6, gain: 0.17, hit: 'studio-kit/ride', level: 1.6 }, { voice: 'tom', tune: 80, decay: 0.6, gain: 0.5, hit: 'studio-kit/low-tom', level: 0.47, at: 80 },
    { voice: 'crash', tone: 5000, decay: 2.6, gain: 0.19, hit: 'studio-kit/crash', level: 0.88 }] },

  // hand drums: a darbuka's low doum and sharp tek, a riq's jingles, and a higher drum for the tribal
  // lines. the desert, the tropics, and a folk band's bodhran
  'hand-drums': { name: 'Hand drums', family: 'kit', world: 'acoustic', kind: 'drums', suits: ['tribal', 'groove', 'march', 'halftime', 'pulse', 'sparse', 'tala', 'bossa'], slots: [
    { voice: 'tom', tune: 75, decay: 0.35, gain: 0.75, hit: 'percussion/tumba', level: 0.48, at: 75 }, { voice: 'rim', tune: 900, decay: 0.06, gain: 0.35, hit: 'percussion/bongo-high', level: 0.43 }, { voice: 'shaker', tone: 6000, decay: 0.06, gain: 0.16, hit: 'percussion/shaker', level: 0.22 },
    { voice: 'shaker', tone: 5500, decay: 0.22, gain: 0.18, hit: 'percussion/tambourine', level: 0.51 }, { voice: 'tick', tune: 1400, decay: 0.05, gain: 0.22, hit: 'percussion/claves', level: 0.57 }, { voice: 'tom', tune: 140, decay: 0.25, gain: 0.45, hit: 'percussion/conga', level: 1.1, at: 140 }] },
  // the orchestra's: a concert bass drum, a field snare, timpani for the low drum, a woodblock, and
  // clashed cymbals. trailers, epic battles and final bosses
  'orchestra-kit': { name: 'Orchestral drums', family: 'kit', world: 'acoustic', kind: 'drums', suits: ['tribal', 'march', 'halftime', 'rock', 'groove', 'pulse', 'sparse'], slots: [
    { voice: 'taiko', tune: 45, decay: 1.1, gain: 0.9, hit: 'orchestra-kit/bass-drum', level: 0.66 }, { voice: 'snare', tune: 200, tone: 2200, decay: 0.2, gain: 0.5, hit: 'orchestra-kit/snare', level: 2 }, { voice: 'shaker', tone: 7000, decay: 0.05, gain: 0.12, hit: 'percussion/shaker', level: 0.18 },
    { voice: 'crash', tone: 5000, decay: 1.2, gain: 0.16, hit: 'orchestra-kit/cymbal', level: 0.31 }, { voice: 'tick', tune: 1000, decay: 0.07, gain: 0.25, hit: 'orchestra-kit/woodblock', level: 0.77 }, { voice: 'tom', tune: 70, decay: 0.9, gain: 0.6, hit: 'orchestra-kit/timpani', level: 4.1, at: 70 },
    { voice: 'crash', tone: 5500, decay: 2.2, gain: 0.2, hit: 'orchestra-kit/cymbal', level: 0.51 }] },
  // a jazz kit played with sticks: the ride cymbal carries the time (in the hat slot, so the swing
  // pattern's "hat" line rides), the hi hat's foot chick on two and four (the open hat slot), a
  // feathered kick and the snare comping softly
  'jazz-kit': { name: 'Jazz kit', family: 'kit', world: 'acoustic', kind: 'drums', suits: ['swing', 'brush', 'sparse', 'pulse', 'shuffle', 'bossa'], slots: [
    { voice: 'kick', tune: 52, decay: 0.3, gain: 0.55, click: 0.1, hit: 'studio-kit/kick', level: 1.1 }, { voice: 'snare', tune: 200, tone: 2000, decay: 0.18, gain: 0.4, hit: 'studio-kit/snare', level: 0.28 }, { voice: 'ride', tune: 2800, tone: 6000, decay: 1.2, gain: 0.2, hit: 'studio-kit/ride', level: 1.7 },
    { voice: 'hat', tone: 7000, decay: 0.05, gain: 0.16, hit: 'studio-kit/hat', level: 0.15 }, { voice: 'rim', tune: 1400, decay: 0.03, gain: 0.2, hit: 'studio-kit/rim', level: 0.81 }, { voice: 'tom', tune: 95, decay: 0.5, gain: 0.45, hit: 'studio-kit/low-tom', level: 0.56, at: 95 },
    { voice: 'crash', tone: 5500, decay: 2, gain: 0.15, hit: 'studio-kit/crash', level: 0.6 }] },
  // latin percussion for bossa nova and lounge: a soft kick, a rim click (the cross stick clave) for the
  // snare, shakers, and a pair of congas
  'latin-kit': { name: 'Latin percussion', family: 'kit', world: 'acoustic', kind: 'drums', suits: ['bossa', 'groove', 'sparse', 'pulse', 'tribal', 'halftime'], slots: [
    { voice: 'kick', tune: 50, decay: 0.35, gain: 0.6, hit: 'studio-kit/kick', level: 1.2 }, { voice: 'rim', tune: 1800, decay: 0.03, gain: 0.3, hit: 'percussion/claves', level: 0.68 }, { voice: 'shaker', tone: 6000, decay: 0.06, gain: 0.16, hit: 'percussion/shaker', level: 0.2 },
    { voice: 'shaker', tone: 5000, decay: 0.2, gain: 0.15, hit: 'percussion/cabasa', level: 0.46 }, { voice: 'conga', tune: 330, decay: 0.25, gain: 0.4, hit: 'percussion/conga', level: 1.2, at: 330 }, { voice: 'conga', tune: 220, decay: 0.35, gain: 0.45, hit: 'percussion/tumba', level: 1, at: 220 }] },
  // tabla: the big bayan's "ge" (its pitch pushed up by the heel of the hand), the dayan's ringing "na"
  // (tuned to the song's home note, as a real one is tuned to sa), its short "ti" and open "tun", and
  // the flat slap "ka"
  tabla: { name: 'Tabla', family: 'kit', world: 'acoustic', own: true, kind: 'drums', suits: ['tala', 'tribal', 'pulse', 'sparse', 'groove'], slots: [
    { voice: 'bayan', tune: 70, decay: 0.6, gain: 0.4 }, { voice: 'dayan', tune: 330, decay: 0.5, gain: 0.225 }, { voice: 'dayan', tune: 330, decay: 0.08, gain: 0.125 },
    { voice: 'dayan', tune: 330, decay: 0.9, gain: 0.175 }, { voice: 'slap', tone: 1200, decay: 0.04, gain: 0.175 }, { voice: 'bayan', tune: 60, decay: 0.9, gain: 0.3 }] },
  // a funk and disco kit: a punchy kick, a crisp snare, tight hats that open on the off beats, a
  // cowbell, and a crash
  'funk-kit': { name: 'Funk kit', family: 'kit', kind: 'drums', suits: ['funk', 'four', 'groove', 'halftime', 'break', 'onedrop', 'shuffle', 'sparse', 'pulse', 'march'], slots: [
    { voice: 'kick', tune: 58, decay: 0.22, gain: 0.95, click: 0.4, hit: 'studio-kit/kick', level: 2.2 }, { voice: 'snare', tune: 200, tone: 2100, decay: 0.18, gain: 0.55, hit: 'studio-kit/snare', level: 0.43 }, { voice: 'hat', tone: 9000, decay: 0.03, gain: 0.2, hit: 'studio-kit/hat', level: 0.11 },
    { voice: 'hat', tone: 8500, decay: 0.28, gain: 0.17, hit: 'studio-kit/open-hat', level: 0.36 }, { voice: 'cowbell', tune: 560, decay: 0.15, gain: 0.16, hit: 'percussion/cowbell', level: 0.24 }, { voice: 'tom', tune: 110, decay: 0.3, gain: 0.5, hit: 'studio-kit/low-tom', level: 0.71, at: 110 },
    { voice: 'crash', tone: 6000, decay: 1.6, gain: 0.18, hit: 'studio-kit/crash', level: 0.63 }] },
  // the far east's temple drums: big taiko, a high, tight shime daiko for the snare, a little bell,
  // a wooden fish (mokugyo), and a gong for the crash
  temple: { name: 'Temple drums', family: 'kit', world: 'acoustic', own: true, kind: 'drums', suits: ['tribal', 'march', 'pulse', 'sparse', 'halftime'], slots: [
    { voice: 'taiko', tune: 58, decay: 0.9, gain: 0.95, hit: 'orchestra-kit/taiko', level: 0.47, at: 58 }, { voice: 'taiko', tune: 220, decay: 0.15, gain: 0.45, hit: 'orchestra-kit/taiko-rim', level: 7.2 }, { voice: 'hat', tone: 9000, decay: 0.15, gain: 0.13, hit: 'percussion/triangle', level: 0.1 },
    { voice: 'tick', tune: 700, decay: 0.08, gain: 0.3, hit: 'orchestra-kit/woodblock', level: 1 }, { voice: 'rim', tune: 1000, decay: 0.05, gain: 0.3, hit: 'percussion/claves', level: 0.68 }, { voice: 'taiko', tune: 85, decay: 0.6, gain: 0.75, hit: 'orchestra-kit/taiko', level: 0.71, at: 58 },
    { voice: 'gong', tune: 90, decay: 4, gain: 0.3, hit: 'orchestra-kit/gong', level: 0.15 }] },

  // these kits are own: only the moods that name them get them
  // ghana's bobobo drums: the bass drum, a tenor drum for the low perc, the treble drum slapped for the
  // high one, clapping, and shakers
  'african-drums': { name: 'Bobobo drums', family: 'kit', world: 'acoustic', own: true, kind: 'drums', suits: ['tribal', 'groove', 'march', 'halftime', 'pulse', 'sparse', 'gallop'], slots: [
    { voice: 'taiko', tune: 70, decay: 0.5, gain: 0.85, hit: 'bobobo/bass', level: 0.62 }, { voice: 'conga', tune: 300, decay: 0.15, gain: 0.45, hit: 'bobobo/treble-slap', level: 0.64 }, { voice: 'shaker', tone: 6000, decay: 0.06, gain: 0.16, hit: 'percussion/shaker', level: 0.2 },
    { voice: 'shaker', tone: 5500, decay: 0.2, gain: 0.18, hit: 'world-percussion/big-shaker', level: 0.82 }, { voice: 'clap', tone: 1200, decay: 0.12, gain: 0.35, hit: 'body/clap', level: 0.43 }, { voice: 'conga', tune: 180, decay: 0.3, gain: 0.5, hit: 'bobobo/tenor', level: 0.98 }] },
  // a cajon, the box drum you sit on: its bass in the middle of the face, the snare wires cracking at its
  // top edge, a knock on its side, with a shaker and tambourine. coffee shops, flamenco, an acoustic pop band
  'cajon-kit': { name: 'Cajon', family: 'kit', world: 'acoustic', own: true, kind: 'drums', suits: ['groove', 'halftime', 'pulse', 'sparse', 'bossa', 'train', 'tribal', 'boombap'], slots: [
    { voice: 'kick', tune: 60, decay: 0.2, gain: 0.7, hit: 'cajon/bass', level: 1.4 }, { voice: 'snare', tune: 200, tone: 1800, decay: 0.15, gain: 0.45, hit: 'cajon/slap', level: 3.5 }, { voice: 'shaker', tone: 6000, decay: 0.06, gain: 0.16, hit: 'percussion/shaker', level: 0.2 },
    { voice: 'shaker', tone: 5500, decay: 0.22, gain: 0.18, hit: 'percussion/tambourine', level: 0.51 }, { voice: 'rim', tune: 900, decay: 0.05, gain: 0.3, hit: 'cajon/side', level: 0.36 }, { voice: 'tom', tune: 120, decay: 0.2, gain: 0.45, hit: 'cajon/mid', level: 1.6 }] },
  // stomping and clapping: feet for the kick, hands for the snare, snaps, a slapped thigh and a thumped
  // chest. a sea shanty's crew, a tribe round the fire, we will rock you
  'stomp-kit': { name: 'Stomp and clap', family: 'kit', world: 'acoustic', own: true, kind: 'drums', suits: ['groove', 'march', 'halftime', 'pulse', 'sparse', 'tribal', 'train', 'gallop'], slots: [
    { voice: 'kick', tune: 45, decay: 0.25, gain: 0.8, hit: 'body/stomp', level: 2.3 }, { voice: 'clap', tone: 1200, decay: 0.15, gain: 0.45, hit: 'body/clap', level: 0.59 }, { voice: 'tick', tune: 2000, decay: 0.03, gain: 0.2, hit: 'body/snap', level: 2.2 },
    { voice: 'clap', tone: 1500, decay: 0.25, gain: 0.3, hit: 'world-percussion/clap', level: 0.24 }, { voice: 'slap', tone: 1000, decay: 0.05, gain: 0.25, hit: 'body/thigh', level: 0.69 }, { voice: 'tom', tune: 100, decay: 0.25, gain: 0.45, hit: 'body/chest', level: 4.6 }] },
  // boom bap: a 70s kit through an old microphone, the dusty drums hip hop was sampled from. a fat kick,
  // a cracking snare, a rim click, and the hats
  'boombap-kit': { name: 'Boom bap kit', family: 'kit', own: true, kind: 'drums', suits: ['boombap', 'groove', 'halftime', 'sparse', 'pulse', 'funk', 'shuffle', 'break'], slots: [
    { voice: 'kick', tune: 52, decay: 0.35, gain: 0.9, hit: 'retro-kit/kick', level: 0.46 }, { voice: 'snare', tune: 190, tone: 1700, decay: 0.2, gain: 0.5, hit: 'retro-kit/snare', level: 0.89 }, { voice: 'hat', tone: 7000, decay: 0.04, gain: 0.18, hit: 'retro-kit/hat', level: 0.19 },
    { voice: 'hat', tone: 6500, decay: 0.3, gain: 0.15, hit: 'retro-kit/open-hat', level: 0.094 }, { voice: 'rim', tune: 1500, decay: 0.03, gain: 0.25, hit: 'retro-kit/rim', level: 1.1 }, { voice: 'tom', tune: 95, decay: 0.35, gain: 0.5, hit: 'retro-kit/low-tom', level: 0.48, at: 95 }] },
  // trap: the 808 again, its kick booming long, a clap for the snare, and hats rolling (the trap beat)
  'trap-kit': { name: 'Trap kit', family: 'kit', own: true, kind: 'drums', suits: ['trap', 'halftime', 'groove', 'sparse', 'pulse', 'four', 'break'], slots: [
    { voice: 'kick', tune: 45, decay: 0.8, gain: 1, hit: 'tr808/kick', level: 1.1 }, { voice: 'clap', tone: 1400, decay: 0.2, gain: 0.48, hit: 'tr808/clap', level: 0.27 }, { voice: 'hat', tone: 9500, decay: 0.03, gain: 0.17, hit: 'tr808/hat', level: 0.023 },
    { voice: 'hat', tone: 9000, decay: 0.35, gain: 0.15, hit: 'tr808/open-hat', level: 0.017 }, { voice: 'rim', tune: 1700, decay: 0.03, gain: 0.2, hit: 'tr808/rim', level: 0.23 }, { voice: 'tom', tune: 80, decay: 0.4, gain: 0.45, hit: 'tr808/low-tom', level: 0.51, at: 80 },
    { voice: 'crash', tone: 6000, decay: 1.4, gain: 0.16, hit: 'tr808/crash', level: 0.29 }] },
  // egypt and the middle east: the darbuka's low doum (the kick) and sharp tek (the snare), its soft ka,
  // the riq's jingles, finger cymbals (zills) and a frame drum
  'darbuka-kit': { name: 'Darbuka and riq', family: 'kit', world: 'acoustic', own: true, kind: 'drums', suits: ['maqsum', 'tribal', 'groove', 'halftime', 'pulse', 'sparse', 'tala', 'march'], slots: [
    { voice: 'tom', tune: 90, decay: 0.4, gain: 0.75, hit: 'world-percussion/darbuka-1', level: 0.45 }, { voice: 'rim', tune: 900, decay: 0.06, gain: 0.35, hit: 'world-percussion/darbuka-4', level: 1.5 }, { voice: 'slap', tone: 1500, decay: 0.04, gain: 0.2, hit: 'world-percussion/darbuka-2', level: 0.093 },
    { voice: 'shaker', tone: 5500, decay: 0.22, gain: 0.18, hit: 'percussion/tambourine', level: 0.51 }, { voice: 'tick', tune: 3000, decay: 0.2, gain: 0.15, hit: 'world-percussion/finger-cymbals', level: 13 }, { voice: 'tom', tune: 75, decay: 0.6, gain: 0.5, hit: 'world-percussion/frame-drum', level: 1.3 }] },
  // the aztecs' drums: the huehuetl (a tall drum played with the hands, the kick), the teponaztli (a
  // slit log drum, two tongues of wood a fifth or so apart), rattles and a bone scraper
  'aztec-kit': { name: 'Aztec drums', family: 'kit', world: 'acoustic', own: true, kind: 'drums', suits: ['tribal', 'march', 'pulse', 'sparse', 'halftime', 'groove'], slots: [
    { voice: 'taiko', tune: 55, decay: 0.6, gain: 0.85, hit: 'world-percussion/bass-drum', level: 1.6 }, { voice: 'tick', tune: 600, decay: 0.15, gain: 0.35, hit: 'world-percussion/slit-high', level: 1.7 }, { voice: 'shaker', tone: 5000, decay: 0.08, gain: 0.18, hit: 'world-percussion/big-shaker', level: 0.56 },
    { voice: 'shaker', tone: 3500, decay: 0.15, gain: 0.18, hit: 'world-percussion/guiro', level: 6.2 }, { voice: 'tick', tune: 400, decay: 0.12, gain: 0.3, hit: 'world-percussion/slit-low', level: 1.8 }, { voice: 'tom', tune: 70, decay: 0.5, gain: 0.55, hit: 'world-percussion/frame-drum', level: 1.3 }] },
  // a shaman's drum from the steppe: a big frame drum, struck in the middle and at the rim, with bells
  // on it, galloping like the horses
  'shaman-drum': { name: 'Shaman drum', family: 'kit', world: 'acoustic', own: true, kind: 'drums', suits: ['gallop', 'tribal', 'march', 'pulse', 'sparse', 'halftime'], slots: [
    { voice: 'taiko', tune: 60, decay: 0.7, gain: 0.85, hit: 'world-percussion/frame-drum', level: 2 }, { voice: 'tom', tune: 120, decay: 0.3, gain: 0.45, hit: 'world-percussion/frame-high', level: 4.9 }, { voice: 'shaker', tone: 7000, decay: 0.1, gain: 0.14, hit: 'world-percussion/sleigh-bells', level: 1.4 },
    { voice: 'tick', tune: 2500, decay: 0.4, gain: 0.12, hit: 'world-percussion/hand-bells', level: 2.4 }, { voice: 'rim', tune: 1100, decay: 0.05, gain: 0.25, hit: 'percussion/claves', level: 0.62 }, { voice: 'tom', tune: 70, decay: 0.6, gain: 0.55, hit: 'world-percussion/frame-drum', level: 1.3 }] },
  // the wasteland's junkyard: a bass drum, a brake drum hammered for the backbeat, an anvil, rattles and
  // a cymbal found in the scrap
  'junk-kit': { name: 'Junkyard', family: 'kit', own: true, kind: 'drums', suits: ['groove', 'halftime', 'march', 'tribal', 'sparse', 'pulse', 'rock', 'train'], slots: [
    { voice: 'kick', tune: 50, decay: 0.4, gain: 0.85, hit: 'world-percussion/bass-drum', level: 2.4 }, { voice: 'snare', tune: 220, tone: 2500, decay: 0.25, gain: 0.5, hit: 'world-percussion/brake-drum', level: 1.2 }, { voice: 'shaker', tone: 6000, decay: 0.06, gain: 0.16, hit: 'percussion/shaker', level: 0.19 },
    { voice: 'shaker', tone: 5500, decay: 0.22, gain: 0.18, hit: 'percussion/tambourine', level: 0.54 }, { voice: 'cowbell', tune: 800, decay: 0.2, gain: 0.15, hit: 'world-percussion/anvil', level: 0.63 }, { voice: 'tom', tune: 90, decay: 0.45, gain: 0.55, hit: 'studio-kit/low-tom', level: 0.6, at: 90 },
    { voice: 'crash', tone: 5000, decay: 1.6, gain: 0.18, hit: 'orchestra-kit/cymbal', level: 0.39 }] },
  // a gamelan's drums: the kendang (a two headed hand drum) leading, little cymbals, and the big gong,
  // which closes every cycle of four bars (gong, the drum composer in music.js), as a gong ageng does
  'gamelan-kit': { name: 'Kendang and gong', family: 'kit', world: 'acoustic', own: true, kind: 'drums', gong: 4, suits: ['tribal', 'march', 'pulse', 'sparse', 'halftime', 'maqsum'], slots: [
    { voice: 'tom', tune: 90, decay: 0.4, gain: 0.7, hit: 'world-percussion/darbuka-1', level: 0.42 }, { voice: 'conga', tune: 300, decay: 0.15, gain: 0.4, hit: 'world-percussion/darbuka-5', level: 5.7 }, { voice: 'tick', tune: 4000, decay: 0.05, gain: 0.12, hit: 'world-percussion/finger-cymbals', level: 7 },
    { voice: 'tick', tune: 2500, decay: 0.4, gain: 0.12, hit: 'world-percussion/hand-bells', level: 2.6 }, { voice: 'rim', tune: 1000, decay: 0.05, gain: 0.25, hit: 'world-percussion/darbuka-2', level: 0.47 }, { voice: 'tom', tune: 120, decay: 0.3, gain: 0.45, hit: 'world-percussion/frame-high', level: 4.9 },
    { voice: 'gong', tune: 90, decay: 4, gain: 0.3, hit: 'orchestra-kit/gong', level: 0.15 }] },

  // the spiral's kits (the magic moods in music.js), from hits recorded for other kits. levels as those
  // kits have them, the new ones measured against their neighbours' (the sistrum against the tambourine,
  // the mark tree against the orchestra's cymbal)
  // a wizard school's: the orchestra's bass drum, snare and timpani, a triangle for the hat, sleigh
  // bells, hand bells, and mark trees shimmering down where a cymbal would crash
  'spell-kit': { name: 'Enchanted percussion', family: 'kit', world: 'acoustic', own: true, kind: 'drums', suits: ['march', 'pulse', 'sparse', 'halftime', 'tribal'], slots: [
    { voice: 'taiko', tune: 45, decay: 1.1, gain: 0.9, hit: 'orchestra-kit/bass-drum', level: 0.66 }, { voice: 'snare', tune: 200, tone: 2200, decay: 0.2, gain: 0.5, hit: 'orchestra-kit/snare', level: 2 }, { voice: 'hat', tone: 9000, decay: 0.15, gain: 0.13, hit: 'percussion/triangle', level: 0.1 },
    { voice: 'shaker', tone: 7000, decay: 0.1, gain: 0.14, hit: 'world-percussion/sleigh-bells', level: 1.4 }, { voice: 'tick', tune: 2500, decay: 0.4, gain: 0.12, hit: 'world-percussion/hand-bells', level: 2.6 }, { voice: 'tom', tune: 70, decay: 0.9, gain: 0.6, hit: 'orchestra-kit/timpani', level: 4.1, at: 70 },
    { voice: 'crash', tone: 9000, decay: 2.5, gain: 0.14, hit: 'spell-percussion/mark-tree', level: 0.2 }] },
  // a pharaoh's court played by an orchestra: hand drums, a darbuka's tek, a sistrum scraping (the hat),
  // a tambourine, a triangle, timpani and a tam-tam for the crash
  'palace-kit': { name: 'Palace percussion', family: 'kit', world: 'acoustic', own: true, kind: 'drums', suits: ['march', 'maqsum', 'tribal', 'sparse', 'pulse', 'halftime', 'groove'], slots: [
    { voice: 'tom', tune: 75, decay: 0.35, gain: 0.75, hit: 'percussion/tumba', level: 0.48, at: 75 }, { voice: 'rim', tune: 900, decay: 0.06, gain: 0.35, hit: 'world-percussion/darbuka-4', level: 1.5 }, { voice: 'shaker', tone: 6500, decay: 0.12, gain: 0.14, hit: 'world-percussion/sistrum', level: 0.09 },
    { voice: 'shaker', tone: 5500, decay: 0.22, gain: 0.18, hit: 'percussion/tambourine', level: 0.51 }, { voice: 'tick', tune: 1800, decay: 0.12, gain: 0.2, hit: 'percussion/triangle', level: 1.5 }, { voice: 'tom', tune: 70, decay: 0.9, gain: 0.6, hit: 'orchestra-kit/timpani', level: 4.1, at: 70 },
    { voice: 'gong', tune: 90, decay: 4, gain: 0.3, hit: 'orchestra-kit/gong', level: 0.15 }] },
  // the jade palace's: deep taiko, wooden blocks for the snare, finger cymbals for the hat, hand bells,
  // claves, and a gong for the crash
  'jade-kit': { name: 'Jade palace drums', family: 'kit', world: 'acoustic', own: true, kind: 'drums', suits: ['tribal', 'march', 'pulse', 'sparse', 'halftime'], slots: [
    { voice: 'taiko', tune: 58, decay: 0.9, gain: 0.95, hit: 'orchestra-kit/taiko', level: 0.47, at: 58 }, { voice: 'tick', tune: 700, decay: 0.08, gain: 0.3, hit: 'orchestra-kit/woodblock', level: 1 }, { voice: 'tick', tune: 3000, decay: 0.2, gain: 0.15, hit: 'world-percussion/finger-cymbals', level: 13 },
    { voice: 'tick', tune: 2500, decay: 0.4, gain: 0.12, hit: 'world-percussion/hand-bells', level: 2.6 }, { voice: 'rim', tune: 1000, decay: 0.05, gain: 0.3, hit: 'percussion/claves', level: 0.68 }, { voice: 'taiko', tune: 85, decay: 0.6, gain: 0.75, hit: 'orchestra-kit/taiko', level: 0.71, at: 58 },
    { voice: 'gong', tune: 90, decay: 4, gain: 0.3, hit: 'orchestra-kit/gong', level: 0.15 }] },

  // textures: scenery, mostly things that happen now and then with quiet between (a steady wash was
  // loud and added little). each gain is set near the vinyl's loudness (tests/levels.html)
  wind:     { name: 'Wind', family: 'texture', kind: 'texture', texture: 'wind', gain: 0.25, samples: 'wind', sampled: { gain: 0.15 }, every: [8, 18] },
  // rain and crickets sit lower: the ear hears high frequencies as louder and harsher
  rain:     { name: 'Rain', family: 'texture', kind: 'texture', texture: 'rain', bed: true, gain: 0.12, samples: 'rain', sampled: { gain: 0.45 } },
  ocean:    { name: 'Ocean', family: 'texture', kind: 'texture', texture: 'ocean', bed: true, gain: 0.2, samples: 'ocean', sampled: { gain: 0.21 } },
  vinyl:    { name: 'Vinyl crackle', family: 'texture', kind: 'texture', texture: 'vinyl', bed: true, gain: 0.6 },
  fire:     { name: 'Campfire', family: 'texture', kind: 'texture', texture: 'fire', bed: true, gain: 0.3, samples: 'fire', sampled: { gain: 1.5 } },
  rumble:   { name: 'Rumble', family: 'texture', kind: 'texture', texture: 'rumble', gain: 0.4, samples: 'thunder', sampled: { gain: 0.66 }, every: [16, 40] },
  crickets: { name: 'Crickets', family: 'texture', kind: 'texture', texture: 'crickets', bed: true, gain: 0.2 },
  hum:      { name: 'Hum', family: 'texture', kind: 'texture', texture: 'hum', bed: true, gain: 0.15 },
  drips:    { name: 'Cave drips', family: 'texture', kind: 'texture', texture: 'drips', gain: 0.3, samples: 'drips', sampled: { gain: 0.9 }, every: [5, 12] },
  geiger:   { name: 'Geiger counter', family: 'texture', kind: 'texture', texture: 'geiger', gain: 0.7 },
  birds:    { name: 'Birdsong', family: 'texture', kind: 'texture', texture: 'birds', gain: 0.15, samples: 'birds', sampled: { gain: 0.44 }, every: [6, 16] },
  creaks:   { name: 'Creaking metal', family: 'texture', kind: 'texture', texture: 'creaks', gain: 1.2, samples: 'creaks', sampled: { gain: 0.15 }, every: [8, 20] },
  // more of a place for ambient songs: a brook babbling (steady, but only bubbles, no hiss), leaves
  // rustling now and then, frogs, a far off owl, and wind chimes somewhere out of sight
  stream:   { name: 'Brook', family: 'texture', kind: 'texture', texture: 'stream', bed: true, gain: 0.035, samples: 'stream', sampled: { gain: 0.148 } },
  leaves:   { name: 'Rustling leaves', family: 'texture', kind: 'texture', texture: 'leaves', gain: 0.6, samples: 'leaves', sampled: { gain: 0.22 }, every: [6, 16] },
  frogs:    { name: 'Frogs', family: 'texture', kind: 'texture', texture: 'frogs', gain: 0.8, samples: 'frogs', sampled: { gain: 2.8 }, every: [5, 16] },
  owl:      { name: 'Owl', family: 'texture', kind: 'texture', texture: 'owl', gain: 0.08, samples: 'owl', sampled: { gain: 0.126 }, every: [14, 32] },
  chimes:   { name: 'Distant chimes', family: 'texture', kind: 'texture', texture: 'chimes', gain: 0.09 },
  // an amp starting to feed back now and then, for the loud moods: recorded, one take creeping in from a
  // growl to a cry on a note (moved to the home note), the others short squeals left as they are
  feedback: { name: 'Feedback', family: 'texture', kind: 'texture', texture: 'feedback', gain: 0.04, samples: 'feedback', sampled: { gain: 0.12 }, every: [12, 30] },
  // scenery that's own (only where a mood names it), mostly recorded: events cut from one long take,
  // played every few seconds (every) from their own spot (recordedScenery). a pitched one (the singing
  // bowl) is moved to the home note
  bubbles:  { name: 'Bubbles', family: 'texture', kind: 'texture', own: true, texture: 'bubbles', gain: 0.18 },
  whale:    { name: 'Whale song', family: 'texture', kind: 'texture', own: true, texture: 'whale', gain: 0.062, samples: 'whale', sampled: { gain: 0.15 }, every: [14, 30] },
  'death-whistle': { name: 'Death whistle', family: 'texture', kind: 'texture', own: true, texture: 'deathWhistle', gain: 0.44, samples: 'death-whistle', sampled: { gain: 0.14 }, every: [14, 32] },
  conch:    { name: 'Conch calls', family: 'texture', kind: 'texture', own: true, texture: 'conch', gain: 0.13, samples: 'conch', sampled: { gain: 0.088 }, every: [16, 34] },
  rainstick: { name: 'Rainstick', family: 'texture', kind: 'texture', own: true, texture: 'rainstick', gain: 0.25, samples: 'rainstick', sampled: { gain: 0.58 }, every: [10, 24] },
  scratches: { name: 'Record scratches', family: 'texture', kind: 'texture', own: true, texture: 'scratches', gain: 0.63, samples: 'scratches', sampled: { gain: 0.34 }, every: [8, 20] },
  'singing-bowl': { name: 'Singing bowl', family: 'texture', kind: 'texture', own: true, texture: 'bowl', gain: 0.05, samples: 'singing-bowl', sampled: { gain: 0.13 }, every: [16, 34] },
  // more own scenery: silent hill's fog (static, a siren, clanging, chains, footsteps, crows), the
  // nether's lava, and a city of machines (a factory, steam)
  lava:     { name: 'Lava', family: 'texture', kind: 'texture', own: true, texture: 'lava', bed: true, gain: 0.148, samples: 'lava', sampled: { gain: 0.83 } },
  factory:  { name: 'Factory', family: 'texture', kind: 'texture', own: true, texture: 'factory', bed: true, gain: 0.098, samples: 'factory', sampled: { gain: 0.126 } },
  static:   { name: 'Radio static', family: 'texture', kind: 'texture', own: true, texture: 'static', gain: 0.2, samples: 'static', sampled: { gain: 0.34 }, every: [6, 18] },
  siren:    { name: 'Distant siren', family: 'texture', kind: 'texture', own: true, texture: 'siren', gain: 0.057, samples: 'siren', sampled: { gain: 0.133 }, every: [25, 50] },
  clanks:   { name: 'Clanging metal', family: 'texture', kind: 'texture', own: true, texture: 'clanks', gain: 0.067, samples: 'clanks', sampled: { gain: 0.376 }, every: [6, 16] },
  chains:   { name: 'Chains', family: 'texture', kind: 'texture', own: true, texture: 'chains', gain: 0.166, samples: 'chains', sampled: { gain: 0.6 }, every: [10, 24] },
  crows:    { name: 'Crows', family: 'texture', kind: 'texture', own: true, texture: 'crows', gain: 0.65, samples: 'crows', sampled: { gain: 0.39 }, every: [12, 28] },
  footsteps: { name: 'Footsteps', family: 'texture', kind: 'texture', own: true, texture: 'footsteps', gain: 0.6, samples: 'footsteps', sampled: { gain: 1.95 }, every: [14, 30] },
  steam:    { name: 'Steam', family: 'texture', kind: 'texture', own: true, texture: 'steam', gain: 0.079, samples: 'steam', sampled: { gain: 0.176 }, every: [10, 24] },
};
// how the instrument lists are grouped on the page
const FAMILIES = { pad: 'Pads', keys: 'Keys and mallets', guitar: 'Guitars', bell: 'Bells', lead: 'Leads', bass: 'Basses', drone: 'Drones', kit: 'Drum kits', texture: 'Textures' };
