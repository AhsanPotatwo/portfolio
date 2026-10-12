/// ================================== squimble music maker: the composer ==================================
//
// this file writes the music. it's plain maths and plain objects, no page and no audio, so node can
// run it (tests/music-check.js) and squimble quest can load it as it is later. synth.js plays what it
// writes (and holds INSTRUMENTS, which the band is picked from), maker.js is the page.
//
// ---------- how a song works ----------
//
// a song is plain settings, the json that gets saved and shared (cleanSong() has every key):
//   seed       a word or two. every random choice comes from it, so the same settings always give
//              the same notes and a song file stays tiny
//   key, scale, tempo, meter, swing, humanise, colour (how rich the chords are), chordBars
//   parts      the chords for parts A, B and C, written as roman numerals ("i bVI bIII bVII"), so
//              they work in any key and you can type your own
//   layers     the band. each has a role (pad, bass, melody...), an instrument, a pattern (how the
//              role plays, e.g. a bass walking or holding its roots), its own seed, its mix, and any
//              notes changed by hand (edits)
//   sections   the song from start to end: which part's chords, how many bars, which layers play
//   fx         the room it's played in (reverb, echo, tape wobble...), synth.js
//
// generateSong(mood, style, seed) makes a whole song from a mood. composeSong(song) turns any song
// into notes. remixing is re-running one of generateSong's pick steps with a fresh seed
// (rerollSong()), and editing is changing the settings by hand.
//
// ---------- the music theory ----------
//
// nothing here is ai. it's the rules of thumb composers and older generative music use:
//   - scales and modes (SCALES). chords are built by stacking every other note of the scale, so a
//     dorian song gets dorian chords by itself
//   - chord progressions: known ones that suit each mood (MOODS chords), a markov chain of how chords
//     usually lead to each other (CHORD_MOVES: ii goes to V, V goes home to I...), two chord vamps
//     (modal music), and roots wandering by odd intervals for horror
//   - voice leading: each chord's notes go as close as they can to the last chord's, so pads glide
//     instead of jumping (voiceChord)
//   - melodies are built from a motif (a short rhythm and shape) that repeats and varies over a
//     phrase, landing on chord notes on strong beats and coming to rest at the ends of phrases, the
//     way people write tunes, rather than random notes (composers.melody)
//   - one groove for the whole band: drum patterns written out by hand like old drum machine charts,
//     with the bass and chord stabs playing the same rhythm, so the parts lock together (GROOVES)
//   - brian eno's tape loops (music for airports): the bells repeat on loops of different lengths, so
//     they drift in and out of line and never line up the same way twice (the "phasing" pattern)
//   - swing and humanising: notes nudged off the grid and played at uneven strengths, which is most
//     of what stops it sounding like a computer (feel)
//
// ---------- a band that fits ----------
//
// each part can sound fine alone and wrong together, so a lot of this file is rules for what goes
// with what: one groove for the drums, bass and stabs (GROOVES), harshness caps per mood and lower
// for backing (maxEdge, edge in synth.js), no two layers on one instrument (pickInstrument), no
// vibrato on struck things (dressLayer), no arp and counter melody together (pickLayers, fitBand),
// layers that stay in once they're in (pickArrangement), melodies without holes (makeBar, tune), and
// moods that say how much drums they want (MOODS drums). once every part is written, the band listens
// to each other (listen): the tune stays on top and nothing rubs against it. the drummer listens as it
// plays: in key, and softer when few others are in (COMPOSERS.drums). README.md lists them all with
// what sounded wrong before each one. read it before changing any of them.
//
// ---------- times ----------
//
// every time here is in beats from the start of the song (what the tempo counts), so changing the
// tempo never changes the notes. synth.js turns beats into seconds.

// ---------- random numbers ----------

// a string to a 32 bit number (fnv-1a), so any words can be a seed
function hashText(text) {
  let hash = 2166136261;
  for (const char of String(text)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// a seeded random number maker (mulberry32). the parts are joined into its seed, so
// makeRng(song.seed, layer.seed, 'A') is the same numbers every time
function makeRng(...parts) {
  let state = hashText(parts.join('|'));
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (low, high) => low + next() * (high - low),
    int: (low, high) => low + Math.floor(next() * (high - low + 1)),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    // { thing: weight } or [[thing, weight]]. object keys come back as strings
    weighted(options) {
      const entries = Array.isArray(options) ? options : Object.entries(options);
      let roll = next() * entries.reduce((sum, [, weight]) => sum + weight, 0);
      for (const [thing, weight] of entries) if ((roll -= weight) < 0) return thing;
      return entries[entries.length - 1][0];
    },
  };
}

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const mod12 = (n) => ((n % 12) + 12) % 12;
const clone = (thing) => JSON.parse(JSON.stringify(thing));

// seeds are two words, which also make the song's first name
const SEED_WORDS = [
  ['mossy', 'amber', 'quiet', 'hollow', 'silver', 'drowsy', 'copper', 'misty', 'wandering', 'paper',
    'velvet', 'frozen', 'sunken', 'golden', 'little', 'crooked', 'distant', 'gentle', 'rusty', 'hidden',
    'lonely', 'starlit', 'smoky', 'tiny', 'ancient', 'sleepy', 'restless', 'pale', 'stormy', 'woolly'],
  ['lantern', 'meadow', 'harbour', 'burrow', 'comet', 'orchard', 'tide', 'ember', 'willow', 'cavern',
    'chapel', 'garden', 'lighthouse', 'puddle', 'marsh', 'kettle', 'attic', 'glade', 'ridge', 'moth',
    'pond', 'shrine', 'tower', 'river', 'acorn', 'thicket', 'well', 'moon', 'hearth', 'squimble'],
];
const newSeed = (rng) => `${rng.pick(SEED_WORDS[0])}-${rng.pick(SEED_WORDS[1])}`;
const seedTitle = (seed) => String(seed).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim() || 'Untitled';
// a short random word for a layer's own seed
const newToken = (rng) => rng.int(0, 2 ** 30).toString(36);

// ---------- scales, meters and chords ----------

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// steps: semitones above the key. harmony: the scale its chords come from, for scales with fewer than
// 7 notes (stacking a pentatonic scale's notes doesn't make proper chords)
const SCALES = {
  major:            { name: 'Major',             steps: [0, 2, 4, 5, 7, 9, 11] },
  lydian:           { name: 'Lydian',            steps: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian:       { name: 'Mixolydian',        steps: [0, 2, 4, 5, 7, 9, 10] },
  majorPentatonic:  { name: 'Major pentatonic',  steps: [0, 2, 4, 7, 9], harmony: 'major' },
  dorian:           { name: 'Dorian',            steps: [0, 2, 3, 5, 7, 9, 10] },
  minor:            { name: 'Minor',             steps: [0, 2, 3, 5, 7, 8, 10] },
  minorPentatonic:  { name: 'Minor pentatonic',  steps: [0, 3, 5, 7, 10], harmony: 'minor' },
  harmonicMinor:    { name: 'Harmonic minor',    steps: [0, 2, 3, 5, 7, 8, 11] },
  melodicMinor:     { name: 'Melodic minor',     steps: [0, 2, 3, 5, 7, 9, 11] },
  phrygian:         { name: 'Phrygian',          steps: [0, 1, 3, 5, 7, 8, 10] },
  phrygianDominant: { name: 'Phrygian dominant', steps: [0, 1, 4, 5, 7, 8, 10] },
  locrian:          { name: 'Locrian',           steps: [0, 1, 3, 5, 6, 8, 10] },
  hungarianMinor:   { name: 'Hungarian minor',   steps: [0, 2, 3, 6, 7, 8, 11] },
  hirajoshi:        { name: 'Hirajoshi',         steps: [0, 2, 3, 7, 8], harmony: 'minor' },
  inSen:            { name: 'In sen',            steps: [0, 1, 5, 7, 10], harmony: 'phrygian' },
  wholeTone:        { name: 'Whole tone',        steps: [0, 2, 4, 6, 8, 10] },
};
const harmonySteps = (scale) => SCALES[SCALES[scale].harmony || scale].steps;

// beats: beats in a bar (what the tempo counts). sub: 2 when a beat splits in two, 3 when it splits
// in three (6/8 is two beats of three)
const METERS = {
  '4/4': { beats: 4, sub: 2 },
  '3/4': { beats: 3, sub: 2 },
  '6/8': { beats: 2, sub: 3 },
  '5/4': { beats: 5, sub: 2 },
};
// the finest grid notes sit on, in beats (a 16th, or an 8th in 6/8)
const gridStep = (meter) => (METERS[meter].sub === 3 ? 1 / 3 : 1 / 4);
// how fast arps, pulses and broken chords go, in beats
const RATES = { slow: 'Slow', medium: 'Medium', fast: 'Fast' };
const rateStep = (rate, sub) => ({ slow: 1, medium: 1 / sub, fast: 1 / (sub * 2) })[rate] || 1 / sub;

// how many bars each chord lasts
const CHORD_BARS = [0.5, 1, 2, 4];
const PARTS = ['A', 'B', 'C'];

// a roman numeral chord, like "bVII", "iv", "ii°", "Imaj7" or "Vsus4". upper case is major, lower
// case minor, and b or # moves it a semitone. root is in semitones above the key, tones in
// semitones above the root. fixed: it says its own colour, so colourChord() leaves it alone
const MAJOR_DEGREES = [0, 2, 4, 5, 7, 9, 11];
const ROMANS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];
function parseChord(token) {
  const match = /^([b#]?)(vii|vi|v|iv|iii|ii|i)(°|o|dim|\+|aug|maj7|7|6|sus2|sus4|add9)?$/i.exec(token);
  if (!match) return null;
  const upper = match[2] === match[2].toUpperCase();
  const root = mod12(MAJOR_DEGREES[ROMANS.indexOf(match[2].toLowerCase())] + (match[1] === 'b' ? -1 : match[1] === '#' ? 1 : 0));
  const extra = (match[3] || '').toLowerCase();
  let tones = upper ? [0, 4, 7] : [0, 3, 7];
  if (extra === '°' || extra === 'o' || extra === 'dim') tones = [0, 3, 6];
  if (extra === '+' || extra === 'aug') tones = [0, 4, 8];
  if (extra === 'sus2') tones = [0, 2, 7];
  if (extra === 'sus4') tones = [0, 5, 7];
  if (extra === '7') tones.push(10);
  if (extra === 'maj7') tones.push(11);
  if (extra === '6') tones.push(9);
  if (extra === 'add9') tones.push(14);
  return { root, tones, fixed: !!extra };
}

// a progression's text to its chords. "-" (or ".") holds the last chord for another turn, so
// "i - bVI bVII" is i for twice as long. bad: anything that isn't a chord, for the page to point out
function parseProgression(text) {
  const slots = [];
  const bad = [];
  for (const token of String(text || '').trim().split(/[\s,|]+/)) {
    if (!token) continue;
    if (token === '-' || token === '.') {
      if (slots.length) slots[slots.length - 1].slots++;
      continue;
    }
    const chord = parseChord(token);
    if (chord) slots.push({ chord, token, slots: 1 });
    else bad.push(token);
  }
  return { slots, bad };
}

// the triad on a degree of the scale, by stacking every other note
function diatonicChord(steps, degree) {
  const n = steps.length;
  const note = (i) => steps[i % n] + 12 * Math.floor(i / n);
  const root = note(degree);
  return { root: mod12(root), tones: [0, note(degree + 2) - root, note(degree + 4) - root] };
}

// and back to a roman numeral, so generated chords show (and save) like typed ones
const ROMAN_BY_ROOT = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];
function chordToken(root, tones) {
  const minor = tones[1] === 3;
  let token = ROMAN_BY_ROOT[mod12(root)];
  if (minor) token = token.replace(/[IV]+/, (numeral) => numeral.toLowerCase());
  if (minor && tones[2] === 6) token += '°';
  if (tones[1] === 4 && tones[2] === 8) token += '+';
  return token;
}

// a chord's letter name, e.g. "F#m7"
function chordName(rootPc, tones) {
  const has = (n) => tones.includes(n);
  let name = has(4) ? (has(8) && !has(7) ? 'aug' : '') : has(3) ? (has(6) && !has(7) ? 'dim' : 'm') : has(2) ? 'sus2' : has(5) ? 'sus4' : '';
  if (name === 'dim' && has(9)) name = 'dim7';
  else if (name === 'dim' && has(10)) name = 'm7b5';
  else if (has(11)) name = name === 'm' ? 'm(maj7)' : `${name}maj7`;
  else if (has(10)) name = name.startsWith('sus') ? `7${name}` : `${name}7`;
  else if (has(9)) name += '6';
  if (has(14)) name += has(10) || has(11) ? '(9)' : 'add9';
  return NOTE_NAMES[mod12(rootPc)] + name;
}

// adds sevenths, ninths and suspensions to plain chords, more the higher the song's colour. the
// random numbers come from the chord's place in its part, so it's coloured the same every time round
function colourChord(tones, root, colour, rng) {
  const out = tones.slice();
  const major = tones[1] === 4 && tones[2] === 7;
  const diminished = tones[1] === 3 && tones[2] === 6;
  if (rng.chance(colour * 0.85)) out.push(major && root === 7 ? 10 : major ? 11 : diminished ? 9 : 10);
  if (rng.chance(colour * 0.45) && !diminished) out.push(14);
  if (rng.chance(colour * 0.12) && !diminished) out[1] = rng.chance(0.5) ? 2 : 5;
  return out;
}

// how often each chord leads to each other chord (rows: from I, ii, iii, IV, V, vi, vii; columns: to
// the same), roughly the "tonic, predominant, dominant, home" pull of most western music
const CHORD_MOVES = [
  [0, 2, 1, 4, 4, 3, 1],
  [1, 0, 0, 1, 5, 1, 2],
  [1, 0, 0, 3, 1, 4, 0],
  [3, 2, 1, 0, 4, 1, 1],
  [5, 0, 1, 1, 0, 3, 0],
  [1, 3, 1, 4, 2, 0, 0],
  [5, 0, 1, 0, 0, 1, 0],
];

// voices a chord around a note: every inversion in every nearby octave, keeping whichever moves
// least from the last chord (voice leading), or sits nearest the centre if there wasn't one
function voiceChord(rootPc, tones, center, previous) {
  let best = null;
  let bestCost = Infinity;
  for (let inversion = 0; inversion < tones.length; inversion++) {
    const shape = tones.map((tone, i) => tone + (i < inversion ? 12 : 0)).sort((a, b) => a - b);
    const base = center - 6 + mod12(rootPc - (center - 6)) - 12;
    for (let octave = -1; octave <= 2; octave++) {
      const notes = shape.map((tone) => base + tone + 12 * octave);
      const middle = (notes[0] + notes[notes.length - 1]) / 2;
      let cost = Math.abs(middle - center) * (previous ? 0.3 : 1);
      if (previous) for (let i = 0; i < Math.min(notes.length, previous.length); i++) cost += Math.abs(notes[i] - previous[i]);
      if (cost < bestCost) {
        bestCost = cost;
        best = notes;
      }
    }
  }
  return best;
}

// the midi note with this pitch class nearest a centre
const near = (pc, center) => center - 6 + mod12(pc - (center - 6));

// ---------- the band: roles and patterns ----------

// what each layer does. center: the midi note its part sits around. order is the score's, top to
// bottom, roughly high to low
const ROLES = {
  melody:  { name: 'Melody',  colour: '#d0533a', center: 69 },
  counter: { name: 'Counter', colour: '#c4852f', center: 62 },
  arp:     { name: 'Arp',     colour: '#2c96a3', center: 60 },
  bells:   { name: 'Bells',   colour: '#c3628f', center: 79 },
  keys:    { name: 'Keys',    colour: '#3c8a64', center: 62 },
  pad:     { name: 'Pad',     colour: '#7e6cc4', center: 57 },
  drone:   { name: 'Drone',   colour: '#5d5470', center: 45 },
  bass:    { name: 'Bass',    colour: '#2c5c8a', center: 40 },
  drums:   { name: 'Drums',   colour: '#3a332c', center: 0 },
  texture: { name: 'Texture', colour: '#958a76', center: 0 },
};
const ROLE_ORDER = Object.keys(ROLES);
// a role's kind of instrument: drum kits and textures are their own families, everything else plays notes
const roleFamily = (role) => (role === 'drums' ? 'kit' : role === 'texture' ? 'texture' : 'tonal');
const instrumentFits = (id, role) => {
  const instrument = INSTRUMENTS[id];
  if (!instrument) return false;
  const family = roleFamily(role);
  return family === 'tonal' ? instrument.family !== 'kit' && instrument.family !== 'texture' : instrument.family === family;
};

// how each role can play. the first is its default
const PATTERNS = {
  melody:  { phrases: 'Phrases', calls: 'Calls and gaps', long: 'Long notes' },
  counter: { answer: 'Answers', harmony: 'Harmony', free: 'Its own tune' },
  arp:     { up: 'Up', down: 'Down', updown: 'Up and down', converge: 'Inwards', random: 'Random' },
  bells:   { phasing: 'Drifting loops', sparkle: 'Chimes on the chords' },
  keys:    { broken: 'Broken chords', block: 'Block chords', strum: 'Strummed', waltz: 'Oom-pah' },
  pad:     { sustain: 'Held', swell: 'Swells', pulse: 'Pulsing', stabs: 'Stabs' },
  drone:   { tonic: 'Home note', fifths: 'Open fifths', follow: 'Follows chords', cluster: 'Cluster' },
  bass:    { held: 'Held', pulse: 'Pulse', rootfifth: 'Root and fifth', octave: 'Octaves', walking: 'Walking', synco: 'Syncopated' },
  drums:   { groove: 'Groove', halftime: 'Half time', brush: 'Brushes', pulse: 'Pulse', tribal: 'Tribal', march: 'March', sparse: 'Sparse' },
  texture: { steady: 'Steady' },
};
// the patterns that use a layer's speed (rate)
const USES_RATE = { arp: true, 'bass.pulse': true, 'bass.octave': true, 'pad.pulse': true, 'keys.broken': true };
const usesRate = (layer) => !!(USES_RATE[layer.role] || USES_RATE[`${layer.role}.${layer.pattern}`]);

// ---------- moods ----------

// each mood is the ranges its songs are picked from:
//   scales      weights, tempo / tuneTempo  bpm ranges for ambient and tune, meters  weights
//   chords      progressions that suit it, methods  how often each way of making chords is used
//   richness    range for the song's chord colour
//   energy, space, bright, dark   0 to 1, how busy, roomy, bright and unsettling it is. they steer
//               density, reverb, filters, detuning and which layers turn up
//   palette     instruments for each role (with a small chance of anything else, to keep it fresh)
//   textures, kits   background sounds and drum kits it uses. no kits means no drums at all
//   drums       [chance of drums in an ambient song, chance in a tune]. gentle moods keep them rare
//               or out: a beat under a dreamy or heavenly song just sounds like a mistake
//   edge        the harshest instrument it allows (edge in synth.js). left out, it comes from energy
//               and dark (see maxEdge), so calm moods never get a buzzy lead
//   patterns    role patterns it prefers, over STYLE_PATTERNS
//   swing       chance of swing (none unless it's here: a swung battle theme sounds like a joke)
//   fx          extra wobble or drive
const MOODS = {
  calm: {
    name: 'Calm', colour: '#9cc5a1', style: 'ambient',
    scales: { major: 3, lydian: 1.5, majorPentatonic: 2, mixolydian: 1 }, tempo: [58, 76], tuneTempo: [78, 96],
    chords: ['I IV', 'I - IV -', 'I vi IV I', 'IV I', 'I iii IV IV', 'Imaj7 IVmaj7', 'ii I', 'I V vi IV'],
    richness: [0.3, 0.75], energy: 0.25, space: 0.65, bright: 0.55, dark: 0.05,
    palette: {
      pad: ['warm-pad', 'glass-pad', 'strings', 'air-pad'], melody: ['flute', 'felt-keys', 'ocarina', 'soft-lead'],
      counter: ['felt-keys', 'harp', 'soft-lead'], keys: ['felt-keys', 'harp', 'e-piano'], arp: ['harp', 'kalimba', 'felt-keys'],
      bells: ['glass-bell', 'chime', 'vibes'], bass: ['sub-bass', 'round-bass', 'upright'], drone: ['organ-drone', 'deep-drone', 'cello-drone'],
    },
    textures: ['wind', 'ocean', 'crickets', 'rain'], kits: ['soft-kit'], drums: [0.1, 0.35], patterns: { drums: ['pulse', 'sparse', 'brush'] },
  },
  dreamy: {
    name: 'Dreamy', colour: '#c3b1ea', style: 'ambient',
    scales: { lydian: 3, major: 1.5, majorPentatonic: 1.5, wholeTone: 0.4 }, tempo: [54, 72], tuneTempo: [76, 94],
    chords: ['I II', 'I iii IV iv', 'IV V iii vi', 'Imaj7 iii vi IVmaj7', 'I II iii II', 'IVmaj7 Imaj7', 'I bVII IV iv'],
    richness: [0.6, 1], energy: 0.2, space: 0.9, bright: 0.6, dark: 0.1,
    palette: {
      pad: ['glass-pad', 'shimmer', 'choir-oo', 'air-pad'], melody: ['music-box', 'glass-bell', 'flute', 'whistle'],
      counter: ['harp', 'celesta'], keys: ['harp', 'e-piano', 'celesta'], arp: ['harp', 'celesta', 'music-box'],
      bells: ['glass-bell', 'music-box', 'celesta', 'chime'], bass: ['sub-bass', 'round-bass'], drone: ['organ-drone', 'deep-drone'],
    },
    textures: ['wind', 'ocean', 'hum'], kits: [], drums: [0, 0], fx: { wobble: 0.3 },
  },
  heavenly: {
    name: 'Heavenly', colour: '#bcdcf2', style: 'ambient',
    scales: { major: 3, lydian: 2, mixolydian: 1 }, tempo: [52, 70], tuneTempo: [70, 90],
    chords: ['I V vi iii IV I IV V', 'I IV I V', 'IV I', 'I bVII IV I', 'I V vi IV', 'IV V vi I', 'I iii vi IV'],
    richness: [0.2, 0.6], energy: 0.2, space: 1, bright: 0.75, dark: 0,
    palette: {
      pad: ['choir-ah', 'organ', 'shimmer', 'strings'], melody: ['choir-oo', 'flute', 'glass-bell', 'violin'],
      counter: ['harp', 'celesta', 'choir-oo'], keys: ['harp', 'celesta', 'organ'], arp: ['harp', 'celesta'],
      bells: ['bell', 'glass-bell', 'celesta', 'chime'], bass: ['sub-bass', 'round-bass'], drone: ['organ-drone', 'cello-drone'],
    },
    textures: ['wind'], kits: [], drums: [0, 0], patterns: { drone: ['fifths', 'tonic'] },
  },
  happy: {
    name: 'Happy', colour: '#ffcf4d', style: 'tune',
    scales: { major: 4, majorPentatonic: 2, mixolydian: 1 }, tempo: [70, 90], tuneTempo: [100, 124],
    meters: { '4/4': 6, '3/4': 2, '6/8': 2 },
    chords: ['I V vi IV', 'I IV V IV', 'I vi IV V', 'I IV I V', 'I iii IV V', 'vi IV I V', 'I IV vi V', 'I V IV V'],
    richness: [0.1, 0.5], energy: 0.65, space: 0.4, bright: 0.75, dark: 0,
    palette: {
      pad: ['warm-pad', 'strings', 'organ'], melody: ['flute', 'ocarina', 'whistle', 'marimba', 'square-lead'],
      counter: ['marimba', 'kalimba', 'pizzicato'], keys: ['e-piano', 'felt-keys', 'marimba'], arp: ['kalimba', 'marimba', 'pluck-lead', 'harp'],
      bells: ['chime', 'celesta', 'vibes'], bass: ['pluck-bass', 'round-bass', 'upright'], drone: ['organ-drone'],
    },
    textures: ['crickets'], kits: ['tight-kit', 'soft-kit'], drums: [0.1, 0.85], swing: 0.2, patterns: { drums: ['groove', 'groove', 'halftime'] },
  },
  playful: {
    name: 'Playful', colour: '#f5a3c7', style: 'tune',
    scales: { major: 3, majorPentatonic: 2, lydian: 1, mixolydian: 1 }, tempo: [76, 96], tuneTempo: [108, 132],
    meters: { '4/4': 4, '3/4': 2, '6/8': 3 },
    chords: ['I IV V I', 'I vi ii V', 'I II IV I', 'I bVII IV I', 'IV V I vi', 'I iii IV V', 'I I7 IV iv'],
    richness: [0.1, 0.5], energy: 0.7, space: 0.35, bright: 0.8, dark: 0,
    palette: {
      pad: ['organ', 'warm-pad'], melody: ['pizzicato', 'marimba', 'whistle', 'kalimba', 'square-lead', 'music-box'],
      counter: ['pizzicato', 'kalimba', 'celesta'], keys: ['marimba', 'felt-keys', 'music-box'], arp: ['kalimba', 'pizzicato', 'celesta'],
      bells: ['celesta', 'music-box', 'chime'], bass: ['pluck-bass', 'upright', 'round-bass'], drone: ['organ-drone'],
    },
    textures: ['crickets'], kits: ['clockwork', 'tight-kit', 'soft-kit'], drums: [0.1, 0.85], swing: 0.35,
    patterns: { drums: ['groove', 'march'], bass: ['octave', 'rootfifth', 'walking'], keys: ['waltz', 'block', 'broken'], melody: ['phrases', 'calls'] },
  },
  upbeat: {
    name: 'Upbeat', colour: '#ff8f45', style: 'tune',
    scales: { major: 2, mixolydian: 2, dorian: 2, majorPentatonic: 1, minorPentatonic: 1 }, tempo: [84, 100], tuneTempo: [118, 142],
    meters: { '4/4': 8, '6/8': 1 },
    chords: ['I V vi IV', 'I bVII IV I', 'vi IV I V', 'I IV vi V', 'i bVII bVI bVII', 'ii V I I', 'I iii vi IV'],
    richness: [0.2, 0.6], energy: 0.9, space: 0.35, bright: 0.8, dark: 0,
    palette: {
      pad: ['warm-pad', 'strings', 'shimmer'], melody: ['saw-lead', 'square-lead', 'pluck-lead', 'whistle'],
      counter: ['pluck-lead', 'e-piano', 'marimba'], keys: ['e-piano', 'felt-keys'], arp: ['pluck-lead', 'kalimba', 'e-piano', 'saw-lead'],
      bells: ['vibes', 'chime'], bass: ['synth-bass', 'pluck-bass', 'growl-bass'], drone: ['deep-drone'],
    },
    textures: [], kits: ['tight-kit', 'lofi-kit'], drums: [0.15, 0.95], edge: 1,
    patterns: { bass: ['octave', 'synco', 'pulse', 'rootfifth'], drums: ['groove', 'groove', 'halftime'] },
  },
  cozy: {
    name: 'Cozy', colour: '#c9875f', style: 'tune',
    scales: { major: 2, mixolydian: 1, dorian: 2, majorPentatonic: 1 }, tempo: [62, 78], tuneTempo: [72, 92],
    chords: ['Imaj7 vi ii V7', 'I IV iii vi ii V', 'IVmaj7 iii ii Imaj7', 'I vi ii V', 'ii V7 Imaj7 -', 'Imaj7 IVmaj7', 'vi ii V7 Imaj7'],
    richness: [0.6, 1], energy: 0.45, space: 0.45, bright: 0.4, dark: 0.05, swing: 0.8,
    palette: {
      pad: ['warm-pad', 'organ', 'strings'], melody: ['e-piano', 'felt-keys', 'flute', 'vibes', 'soft-lead'],
      counter: ['felt-keys', 'vibes', 'harp'], keys: ['e-piano', 'felt-keys'], arp: ['e-piano', 'harp', 'vibes'],
      bells: ['vibes', 'chime'], bass: ['upright', 'round-bass', 'sub-bass'], drone: ['organ-drone'],
    },
    textures: ['vinyl', 'fire', 'rain'], kits: ['brushes'], drums: [0.05, 0.55],
    patterns: { bass: ['walking', 'rootfifth', 'held'], drums: ['brush'], keys: ['strum', 'block', 'broken'] }, fx: { wobble: 0.5 },
  },
  wistful: {
    name: 'Wistful', colour: '#e3b3a0', style: 'ambient',
    scales: { mixolydian: 1.5, dorian: 2, major: 1.5, majorPentatonic: 1 }, tempo: [56, 72], tuneTempo: [74, 94],
    chords: ['I iii IV iv', 'IV iv I', 'I V vi iii IV I IV V', 'vi IV I V', 'I bVII IV I', 'Imaj7 IVmaj7 iii vi', 'IV I V vi', 'I III IV iv'],
    richness: [0.4, 0.85], energy: 0.35, space: 0.7, bright: 0.45, dark: 0.15,
    palette: {
      pad: ['strings', 'warm-pad', 'glass-pad', 'choir-oo'], melody: ['music-box', 'e-piano', 'celesta', 'flute', 'violin'],
      counter: ['harp', 'felt-keys', 'celesta'], keys: ['felt-keys', 'e-piano', 'harp'], arp: ['harp', 'music-box', 'celesta'],
      bells: ['music-box', 'celesta', 'glass-bell'], bass: ['round-bass', 'sub-bass', 'upright'], drone: ['cello-drone', 'organ-drone'],
    },
    textures: ['vinyl', 'rain', 'wind'], kits: ['brushes'], drums: [0.05, 0.45], patterns: { drums: ['brush', 'sparse'] }, fx: { wobble: 0.45 },
  },
  sad: {
    name: 'Sad', colour: '#6b95d8', style: 'ambient',
    scales: { minor: 3, dorian: 1.5, harmonicMinor: 0.7, minorPentatonic: 1 }, tempo: [52, 70], tuneTempo: [66, 88],
    chords: ['i bVI bIII bVII', 'i iv bVI V', 'vi IV I V', 'i bVII bVI bVII', 'i iv i v', 'i - bVI -', 'iv i', 'i bVI iv V', 'i bIII bVII iv'],
    richness: [0.3, 0.8], energy: 0.3, space: 0.7, bright: 0.35, dark: 0.3,
    palette: {
      pad: ['strings', 'warm-pad', 'choir-oo', 'dark-pad'], melody: ['felt-keys', 'violin', 'flute', 'e-piano', 'music-box'],
      counter: ['felt-keys', 'harp', 'violin'], keys: ['felt-keys', 'harp', 'e-piano'], arp: ['harp', 'felt-keys'],
      bells: ['glass-bell', 'music-box'], bass: ['sub-bass', 'round-bass', 'upright'], drone: ['cello-drone', 'deep-drone'],
    },
    textures: ['rain', 'wind'], kits: ['soft-kit', 'brushes'], drums: [0.05, 0.4], patterns: { drums: ['sparse', 'pulse', 'brush'] },
  },
  mysterious: {
    name: 'Mysterious', colour: '#8b6fd0', style: 'ambient',
    scales: { dorian: 2, phrygian: 1.5, harmonicMinor: 1, hirajoshi: 1.2, inSen: 1, minor: 1 }, tempo: [56, 76], tuneTempo: [80, 104],
    chords: ['i bII', 'i IV', 'i bVII bVI bVII', 'i v iv i', 'i bIII bVII iv', 'i - bII -', 'i IV i bVII', 'i bVI'],
    methods: { bank: 4, markov: 2, vamp: 3 },
    richness: [0.4, 0.9], energy: 0.35, space: 0.8, bright: 0.45, dark: 0.45,
    palette: {
      pad: ['choir-oo', 'air-pad', 'glass-pad', 'dark-pad'], melody: ['kalimba', 'flute', 'glass-bell', 'ocarina', 'whistle'],
      counter: ['kalimba', 'harp', 'pizzicato'], keys: ['harp', 'kalimba', 'celesta'], arp: ['kalimba', 'harp', 'marimba'],
      bells: ['glass-bell', 'bell', 'chime'], bass: ['sub-bass', 'pluck-bass', 'upright'], drone: ['deep-drone', 'void', 'cello-drone'],
    },
    textures: ['wind', 'crickets', 'hum'], kits: ['clockwork', 'heartbeat'], drums: [0.15, 0.6], patterns: { drums: ['sparse', 'pulse'] },
  },
  deep: {
    name: 'Deep', colour: '#2f9db0', style: 'ambient',
    scales: { lydian: 1.5, dorian: 2, majorPentatonic: 1, minor: 1.5 }, tempo: [48, 66], tuneTempo: [70, 90],
    chords: ['i bVII', 'I II', 'i iv', 'Imaj7 bVII', 'i bVI bVII i', 'IVmaj7 Imaj7', 'i - iv -'],
    richness: [0.5, 1], energy: 0.2, space: 1, bright: 0.25, dark: 0.35,
    palette: {
      pad: ['warm-pad', 'glass-pad', 'air-pad', 'dark-pad'], melody: ['vibes', 'glass-bell', 'soft-lead', 'whistle'],
      counter: ['vibes', 'harp'], keys: ['vibes', 'e-piano', 'harp'], arp: ['vibes', 'glass-bell', 'harp'],
      bells: ['glass-bell', 'vibes', 'chime'], bass: ['sub-bass', 'round-bass'], drone: ['deep-drone', 'void', 'organ-drone'],
    },
    textures: ['ocean', 'hum', 'rumble'], kits: ['heartbeat', 'soft-kit'], drums: [0.08, 0.35], patterns: { drums: ['pulse'] }, fx: { wobble: 0.25 },
  },
  tense: {
    name: 'Tense', colour: '#c4573a', style: 'tune',
    scales: { phrygian: 2, harmonicMinor: 2, minor: 1.5, locrian: 0.5, hungarianMinor: 1 }, tempo: [70, 92], tuneTempo: [96, 132],
    chords: ['i bII', 'i - bII -', 'i iv bII V', 'i bVI V', 'i bII i bVII', 'i iv bVI V', 'i v bVI bII'],
    methods: { bank: 5, markov: 1, vamp: 2, chromatic: 1 },
    richness: [0.2, 0.6], energy: 0.65, space: 0.5, bright: 0.4, dark: 0.65,
    palette: {
      pad: ['strings', 'dark-pad', 'haunted-pad'], melody: ['violin', 'saw-lead', 'horn', 'pluck-lead'],
      counter: ['pizzicato', 'pluck-lead', 'strings'], keys: ['felt-keys', 'pizzicato', 'harp'], arp: ['pluck-lead', 'pizzicato', 'saw-lead', 'marimba'],
      bells: ['bell', 'glass-bell'], bass: ['synth-bass', 'sub-bass', 'growl-bass'], drone: ['deep-drone', 'cello-drone', 'bowed-metal'],
    },
    textures: ['rumble', 'hum', 'wind'], kits: ['heartbeat', 'clockwork', 'taiko'], drums: [0.3, 0.9], edge: 0.9,
    patterns: { bass: ['pulse', 'synco', 'octave'], drums: ['pulse', 'tribal', 'halftime', 'sparse'], pad: ['sustain', 'pulse'] },
  },
  angry: {
    name: 'Angry', colour: '#e04646', style: 'tune',
    scales: { harmonicMinor: 2, phrygian: 1.5, phrygianDominant: 1.5, minor: 2, hungarianMinor: 0.7 }, tempo: [80, 100], tuneTempo: [132, 168],
    meters: { '4/4': 6, '6/8': 2, '5/4': 0.5 },
    chords: ['i bVI bVII i', 'i bII i bVII', 'i iv V i', 'i bVI bIII bVII', 'i - bVI V', 'i bVII bVI V', 'i iv bVI bVII'],
    richness: [0.1, 0.4], energy: 1, space: 0.35, bright: 0.65, dark: 0.5,
    palette: {
      pad: ['strings', 'dark-pad', 'choir-ah'], melody: ['saw-lead', 'horn', 'violin', 'square-lead'],
      counter: ['horn', 'strings', 'pluck-lead'], keys: ['pizzicato', 'felt-keys'], arp: ['saw-lead', 'pluck-lead', 'pizzicato'],
      bells: ['bell'], bass: ['growl-bass', 'synth-bass', 'pluck-bass'], drone: ['deep-drone', 'cello-drone'],
    },
    textures: ['rumble', 'fire'], kits: ['taiko', 'tight-kit', 'lofi-kit'], drums: [0.3, 1], edge: 1,
    patterns: { bass: ['octave', 'pulse', 'synco'], drums: ['tribal', 'march', 'groove'], pad: ['sustain', 'stabs', 'pulse'] }, fx: { drive: 0.45 },
  },
  eerie: {
    name: 'Eerie', colour: '#9fcf4f', style: 'ambient',
    scales: { phrygian: 1.5, locrian: 1.5, hungarianMinor: 1.5, wholeTone: 1, inSen: 1, harmonicMinor: 1 }, tempo: [44, 64], tuneTempo: [70, 96],
    chords: ['i bII', 'i #iv°', 'i bvi', 'i - #iv -', 'i III', 'i bII bvii', 'i vii°'],
    methods: { chromatic: 4, bank: 3, vamp: 1 },
    richness: [0.4, 1], energy: 0.2, space: 0.9, bright: 0.3, dark: 1,
    palette: {
      pad: ['haunted-pad', 'dark-pad', 'choir-oo', 'air-pad'], melody: ['music-box', 'glass-bell', 'whistle', 'violin'],
      counter: ['music-box', 'celesta', 'bowed-metal'], keys: ['music-box', 'celesta', 'felt-keys'], arp: ['music-box', 'celesta', 'glass-bell'],
      bells: ['bell', 'glass-bell', 'music-box'], bass: ['sub-bass', 'deep-drone'], drone: ['void', 'bowed-metal', 'deep-drone', 'cello-drone'],
    },
    textures: ['rumble', 'wind', 'hum'], kits: ['heartbeat', 'clockwork'], drums: [0.15, 0.4],
    patterns: { drone: ['cluster', 'tonic', 'cluster'], drums: ['pulse', 'sparse'], melody: ['long', 'phrases'] },
  },
  heroic: {
    name: 'Heroic', colour: '#d4a13a', style: 'tune',
    scales: { mixolydian: 2, major: 2, minor: 1.5, dorian: 1 }, tempo: [66, 84], tuneTempo: [92, 124],
    meters: { '4/4': 6, '3/4': 1, '6/8': 2 },
    chords: ['I bVII IV I', 'i bVI bIII bVII', 'I V vi IV', 'IV V iii vi', 'I bVI bVII I', 'i bVI bVII i', 'I IV V I', 'I iii IV V'],
    richness: [0.1, 0.45], energy: 0.8, space: 0.6, bright: 0.65, dark: 0.2,
    palette: {
      pad: ['strings', 'choir-ah', 'warm-pad', 'organ'], melody: ['horn', 'violin', 'flute', 'saw-lead'],
      counter: ['horn', 'strings', 'violin'], keys: ['harp', 'pizzicato', 'felt-keys'], arp: ['harp', 'pizzicato', 'pluck-lead'],
      bells: ['bell', 'chime'], bass: ['pluck-bass', 'synth-bass', 'round-bass'], drone: ['cello-drone', 'organ-drone'],
    },
    textures: ['wind'], kits: ['taiko', 'tight-kit'], drums: [0.2, 0.95], edge: 0.9,
    patterns: { drums: ['march', 'tribal', 'groove'], bass: ['octave', 'rootfifth', 'pulse'] },
  },
};

// the patterns each style leans towards, when the mood doesn't say
const STYLE_PATTERNS = {
  ambient: {
    melody: ['phrases', 'long', 'phrases'], counter: ['harmony', 'answer'], arp: ['up', 'updown', 'random', 'converge'],
    bells: ['phasing', 'sparkle', 'sparkle'], keys: ['strum', 'broken'], pad: ['sustain', 'sustain', 'swell'],
    drone: ['tonic', 'fifths', 'follow'], bass: ['held', 'held', 'rootfifth'], drums: ['pulse', 'sparse'], texture: ['steady'],
  },
  tune: {
    melody: ['phrases', 'phrases', 'calls'], counter: ['answer', 'harmony'], arp: ['up', 'down', 'updown', 'converge', 'random'],
    bells: ['sparkle', 'phasing'], keys: ['broken', 'block', 'strum', 'waltz'], pad: ['sustain', 'swell', 'pulse', 'stabs'],
    drone: ['tonic', 'fifths'], bass: ['rootfifth', 'pulse', 'octave', 'walking', 'synco', 'held'],
    drums: ['groove', 'groove', 'halftime'], texture: ['steady'],
  },
};

// the families a layer's surprise instrument (the odd one from outside the mood) comes from, so a
// drone doesn't end up on a plucked lead. the page still offers any instrument for any layer
const WILDCARDS = {
  melody: ['lead', 'keys', 'bell'], counter: ['lead', 'keys'], arp: ['keys', 'lead', 'bell'], bells: ['bell', 'keys'],
  keys: ['keys'], pad: ['pad', 'drone'], drone: ['drone', 'pad'], bass: ['bass'],
};

// how likely each role is to be in a song
const LAYER_CHANCE = {
  ambient: { melody: 0.55, counter: 0.2, arp: 0.25, bells: 0.65, keys: 0.3, pad: 1, drone: 0.55, bass: 0.4, drums: 0.12, texture: 0.7 },
  tune:    { melody: 1, counter: 0.5, arp: 0.5, bells: 0.3, keys: 0.65, pad: 0.7, drone: 0.15, bass: 1, drums: 0.85, texture: 0.25 },
};

// when each role joins in: a layer plays in a section once the section's energy reaches a number
// picked from its range, so quiet sections get the pads and background, and busy ones everything
const ROLE_ENTRY = {
  texture: [0, 0.25], drone: [0, 0.3], pad: [0, 0.35], bells: [0.2, 0.6], keys: [0.25, 0.6], bass: [0.3, 0.6],
  arp: [0.45, 0.85], melody: [0.5, 0.65], counter: [0.6, 0.95], drums: [0.4, 0.75],
};

// the shapes songs take: [name, part, about how many bars, energy]
const FORMS = {
  ambient: [
    [['Rise', 'A', 8, 0.3], ['Drift', 'A', 16, 0.65], ['Turn', 'B', 16, 0.85], ['Drift', 'A', 16, 0.7], ['Fade', 'A', 8, 0.3]],
    [['Dawn', 'A', 8, 0.25], ['Bloom', 'A', 16, 0.6], ['Haze', 'B', 16, 0.8], ['Deep', 'C', 8, 0.5], ['Bloom', 'A', 16, 0.75], ['Dusk', 'A', 8, 0.3]],
    [['Emerge', 'A', 16, 0.4], ['Float', 'B', 16, 0.75], ['Emerge', 'A', 16, 0.65], ['Still', 'C', 8, 0.35]],
    [['Hush', 'C', 8, 0.25], ['Glow', 'A', 16, 0.6], ['Swell', 'B', 16, 0.9], ['Glow', 'A', 16, 0.6], ['Hush', 'C', 8, 0.25]],
  ],
  tune: [
    [['Intro', 'A', 4, 0.3], ['A', 'A', 8, 0.7], ['A', 'A', 8, 0.8], ['B', 'B', 8, 1], ['A', 'A', 8, 0.8], ['Outro', 'A', 4, 0.3]],
    [['Intro', 'A', 4, 0.3], ['Verse', 'A', 8, 0.65], ['Chorus', 'B', 8, 1], ['Verse', 'A', 8, 0.7], ['Chorus', 'B', 8, 1], ['Bridge', 'C', 8, 0.55], ['Chorus', 'B', 8, 1], ['Outro', 'B', 4, 0.35]],
    [['Intro', 'C', 4, 0.3], ['Theme', 'A', 8, 0.75], ['Theme', 'A', 8, 0.85], ['Break', 'C', 8, 0.5], ['Climb', 'B', 8, 0.95], ['Theme', 'A', 8, 0.85]],
    [['A', 'A', 8, 0.7], ['B', 'B', 8, 0.9], ['A', 'A', 8, 0.8], ['C', 'C', 8, 0.55]],
  ],
};

// ---------- making a song ----------

const LAYER_DEFAULTS = {
  id: '', role: 'pad', instrument: '', pattern: '', seed: '0', volume: 0.6, pan: 0, octave: 0, density: 0.5,
  rate: 'medium', span: 2, reverb: 0.4, echo: 0.1, mute: false, solo: false,
  // attack and release multiply the instrument's, bright multiplies its filters, detune and vibrato
  // add cents of wobble
  tone: { attack: 1, release: 1, bright: 1, detune: 0, vibrato: 0 },
  // notes changed by hand, per part: add [[beat in the section, midi, length]], remove ["beat:midi"]
  edits: {},
};
const FX_DEFAULTS = { reverb: 0.4, size: 0.6, tone: 0.5, echo: 0.2, echoTime: 0.75, echoRepeats: 0.35, warmth: 0.2, wobble: 0, drive: 0, volume: 0.8 };
const ECHO_TIMES = [0.5, 0.75, 1, 1.5, 2];

function generateSong(moodId, style, seed) {
  const mood = MOODS[moodId] ? moodId : 'calm';
  const song = { name: seedTitle(seed), seed, mood, style: style === 'tune' ? 'tune' : 'ambient', parts: {}, layers: [], sections: [], fx: {} };
  pickTonality(song, makeRng(seed, mood, 'tonality'));
  pickChords(song, makeRng(seed, mood, 'chords'));
  pickLayers(song, makeRng(seed, mood, song.style, 'layers'));
  pickArrangement(song, makeRng(seed, mood, song.style, 'arrangement'));
  pickSpace(song, makeRng(seed, mood, 'space'));
  return cleanSong(song);
}

// remixing: one part of the song picked again. nonce makes it new each time (the page passes a
// random one); everything else stays as it was
const REROLLS = {
  chords: (song, mood, rng) => pickChords(song, rng),
  melodies: (song, mood, rng) => { for (const layer of song.layers) layer.seed = newToken(rng); },
  band: (song, mood, rng) => {
    // cleared first, so the new instruments don't dodge the old ones
    for (const layer of song.layers) layer.instrument = '';
    for (const layer of song.layers) dressLayer(song, layer, rng, false);
    fitBand(song);
  },
  arrangement: (song, mood, rng) => pickArrangement(song, rng),
  space: (song, mood, rng) => pickSpace(song, rng),
  tonality: (song, mood, rng) => pickTonality(song, rng),
  mutate: (song, mood, rng) => mutateSong(song, rng),
};
function rerollSong(song, what, nonce) {
  const next = clone(song);
  REROLLS[what](next, MOODS[next.mood], makeRng(song.seed, what, nonce));
  return cleanSong(next);
}
// new chords for one part only
function rerollPart(song, part, nonce) {
  const next = clone(song);
  next.parts[part] = makeProgression(next, makeRng(song.seed, 'part', part, nonce), pickMethod(next, makeRng(nonce)));
  return cleanSong(next);
}

function pickTonality(song, rng) {
  const mood = MOODS[song.mood];
  song.key = rng.int(0, 11);
  song.scale = rng.weighted(mood.scales);
  const [low, high] = song.style === 'tune' ? mood.tuneTempo : mood.tempo;
  song.tempo = Math.round(rng.range(low, high));
  song.meter = rng.weighted(mood.meters || (song.style === 'tune' ? { '4/4': 6, '3/4': 1.5, '6/8': 1.5 } : { '4/4': 5, '3/4': 2, '6/8': 1 }));
  // a 6/8 beat is three eighths long, so the same feel counts slower
  if (song.meter === '6/8') song.tempo = Math.round(song.tempo * 0.65);
  song.swing = rng.chance(mood.swing || 0) ? rng.range(0.15, 0.5) : 0;
  song.humanise = rng.range(0.25, 0.6);
  song.colour = rng.range(...mood.richness);
  song.chordBars = song.style === 'ambient' ? rng.pick([1, 2, 2, 4]) : rng.pick(mood.energy > 0.7 ? [0.5, 1, 1, 2] : [1, 1, 2]);
}

const pickMethod = (song, rng) => rng.weighted(MOODS[song.mood].methods || { bank: 5, markov: 3, vamp: 1.2 });

function pickChords(song, rng) {
  song.parts = {};
  for (const part of PARTS) {
    // B and C should sound different from A, so try a few times for a different progression
    let chords = '';
    for (let tries = 0; tries < 6 && (!chords || Object.values(song.parts).includes(chords)); tries++) {
      chords = makeProgression(song, rng, part === 'C' ? rng.pick(['vamp', 'markov', 'bank']) : pickMethod(song, rng));
    }
    song.parts[part] = chords;
  }
}

// one progression, made one of four ways (see the music theory notes at the top)
function makeProgression(song, rng, method) {
  const mood = MOODS[song.mood];
  const steps = harmonySteps(song.scale);
  const token = (degree) => { const chord = diatonicChord(steps, degree); return chordToken(chord.root, chord.tones); };
  if (method === 'bank') {
    // the mood's progressions, favouring ones with few notes outside the scale, so the chords and the
    // tunes over them agree (a sad song in dorian shouldn't get one written for natural minor)
    const inScale = new Set(steps);
    const outside = (text) => parseProgression(text).slots.reduce((n, { chord }) => n + chord.tones.filter((tone) => !inScale.has(mod12(chord.root + tone))).length, 0);
    return rng.weighted(mood.chords.map((text) => [text, 1 / (1 + outside(text)) ** 2]));
  }
  if (method === 'vamp') {
    // a diminished chord is too restless to sit on for long, so vamps leave them out
    const other = token(rng.pick([1, 3, 4, 5, 6].filter((degree) => degree < steps.length && diatonicChord(steps, degree).tones[2] !== 6)));
    return rng.chance(0.5) ? `${token(0)} ${other}` : `${token(0)} - ${other} -`;
  }
  if (method === 'chromatic') {
    // roots wandering by semitones, thirds and tritones: nothing feels like home, which is the point
    let root = 0;
    const out = [token(0)];
    const length = rng.pick([2, 3, 4, 4]);
    while (out.length < length) {
      root = mod12(root + rng.pick([1, 3, 4, 6, 8, 9, 11]));
      const quality = rng.weighted({ minor: 3, major: 2, dim: 1 });
      out.push(chordToken(root, quality === 'minor' ? [0, 3, 7] : quality === 'major' ? [0, 4, 7] : [0, 3, 6]));
    }
    return out.join(' ');
  }
  // markov: a walk through CHORD_MOVES starting from home
  const length = rng.pick([3, 4, 4, 4, 6, 8]);
  const degrees = [0];
  while (degrees.length < length) {
    const from = degrees[degrees.length - 1] % 7;
    degrees.push(rng.weighted(CHORD_MOVES[from].map((weight, to) => [to, weight]).filter(([to]) => to < steps.length)));
  }
  // it loops back round to the first chord, so it shouldn't sit on home at the end too
  if (degrees[length - 1] === 0) degrees[length - 1] = rng.pick([4, 3, 5].filter((degree) => degree < steps.length));
  return degrees.map(token).join(' ');
}

function pickLayers(song, rng) {
  const mood = MOODS[song.mood];
  const chances = LAYER_CHANCE[song.style];
  const roles = ROLE_ORDER.filter((role) => {
    let chance = chances[role];
    if (role === 'texture' && !mood.textures.length) chance = 0;
    if (role === 'drone') chance += mood.dark * 0.3;
    if (role === 'drums') chance = mood.kits.length ? mood.drums[song.style === 'tune' ? 1 : 0] : 0;
    return rng.chance(chance);
  });
  // something has to play the chords
  if (!roles.some((role) => role === 'pad' || role === 'keys')) roles.push(rng.pick(['pad', 'keys']));
  // an arp and a counter melody both weave round the melody, and together they turned into clutter,
  // so a song gets one or the other
  if (roles.includes('arp') && roles.includes('counter')) roles.splice(roles.indexOf(rng.pick(['arp', 'counter'])), 1);
  // seven at most, losing the least needed first
  for (const role of ['counter', 'arp', 'drone', 'bells', 'keys']) if (roles.length > 7) roles.splice(roles.indexOf(role), roles.includes(role) ? 1 : 0);
  // one at a time, so each layer can see the ones before it (no two playing the same instrument)
  song.layers = [];
  for (const role of ROLE_ORDER.filter((one) => roles.includes(one))) {
    const layer = { ...clone(LAYER_DEFAULTS), id: role, role };
    song.layers.push(layer);
    dressLayer(song, layer, rng, true);
  }
  fitBand(song);
}

// layers that play behind the melody. they get a lower harshness cap, and are darker and quieter,
// so the tune is always the thing you hear
const BACKING = { counter: true, arp: true, keys: true, pad: true, drone: true, bass: true };
// the harshest instrument a mood allows (edge in synth.js), less for backing layers
const maxEdge = (mood, role) => (mood.edge ?? 0.3 + mood.energy * 0.6 + mood.dark * 0.2) * (BACKING[role] ? 0.75 : 1);

// an instrument for a layer: from the mood's palette, now and then (12%) something from outside it so
// songs in a mood don't all sound alike, but only from families that suit the role (WILDCARDS), never
// harsher than the mood allows, and never one another layer is already playing. two layers on the
// same instrument blur into each other, and a harsh lead over gentle backing was the commonest clash
function pickInstrument(song, layer, rng) {
  const mood = MOODS[song.mood];
  const { role } = layer;
  const family = roleFamily(role);
  const anything = Object.keys(INSTRUMENTS).filter((id) => instrumentFits(id, role));
  if (family !== 'tonal') {
    const pool = family === 'kit' ? mood.kits : mood.textures;
    return rng.pick(pool.length ? pool : anything);
  }
  const cap = maxEdge(mood, role);
  const taken = new Set(song.layers.filter((other) => other !== layer && roleFamily(other.role) === 'tonal').map((other) => other.instrument));
  const fits = (id) => INSTRUMENTS[id].edge <= cap && !taken.has(id);
  const palette = mood.palette[role].filter(fits);
  const wild = anything.filter((id) => WILDCARDS[role].includes(INSTRUMENTS[id].family) && fits(id));
  if (palette.length && !(wild.length && rng.chance(0.12))) return rng.pick(palette);
  if (wild.length) return rng.pick(wild);
  // nothing fits: the gentlest in the mood's palette
  return [...mood.palette[role]].sort((a, b) => INSTRUMENTS[a].edge - INSTRUMENTS[b].edge)[0];
}

// a layer's instrument, pattern, tone and mix. fresh: a new layer, so it gets a seed and pattern too
function dressLayer(song, layer, rng, fresh) {
  const mood = MOODS[song.mood];
  const { role } = layer;
  layer.instrument = pickInstrument(song, layer, rng);
  const instrument = INSTRUMENTS[layer.instrument];
  const edge = instrument.edge || 0;
  // struck and plucked things (keys, bells, basses) get no vibrato and hardly any detune: a wobbling
  // piano under a steady pad sounds out of tune rather than warm, and a strummed harp chord in a dark
  // mood had its strings beating against each other
  const struck = instrument.family === 'keys' || instrument.family === 'bell' || instrument.family === 'bass';
  if (fresh) {
    layer.seed = newToken(rng);
    layer.pattern = rng.pick(mood.patterns?.[role] || STYLE_PATTERNS[song.style][role]);
    layer.rate = mood.energy > 0.75 ? rng.pick(['medium', 'fast', 'fast']) : mood.energy < 0.35 ? rng.pick(['slow', 'medium']) : rng.pick(['medium', 'medium', 'fast']);
    layer.span = rng.pick([1, 2, 2]);
    layer.octave = role === 'bells' ? rng.weighted([[0, 5], [1, 1], [-1, 1]]) : role === 'melody' ? rng.weighted([[0, 6], [-1, 1]]) : 0;
  }
  const busy = song.style === 'tune' ? 0.35 + mood.energy * 0.5 : 0.3 + mood.energy * 0.5;
  layer.density = clamp01(busy + rng.range(-0.15, 0.2));
  // drums follow the mood's energy: as loud under a calm song as under an angry one, they were the
  // first thing you heard
  const volumes = { melody: 0.68, counter: 0.5, arp: 0.42, bells: 0.45, keys: 0.52, pad: 0.55, drone: 0.48, bass: 0.68, drums: 0.42 + mood.energy * 0.24, texture: 0.5 };
  // harsher backing sits lower in the mix
  layer.volume = clamp01((volumes[role] + rng.range(-0.06, 0.06)) * (BACKING[role] ? 1 - edge * 0.25 : 1));
  const centred = role === 'bass' || role === 'drums' || role === 'drone';
  layer.pan = centred ? 0 : Math.round(rng.range(-0.45, 0.45) * 100) / 100;
  // drums and bass stay fairly dry: a big room smears the beat, and the echo (often a dotted beat)
  // adds hits that aren't on the groove, which made the drums sound out of time
  const wet = { melody: 0.65, counter: 0.7, arp: 0.7, bells: 1.1, keys: 0.75, pad: 1, drone: 0.9, bass: 0.15, drums: 0.15, texture: 0.6 };
  layer.reverb = clamp01(mood.space * wet[role] * rng.range(0.75, 1.15));
  const echoes = { melody: 0.4, counter: 0.3, arp: 0.5, bells: 0.6, keys: 0.25 };
  layer.echo = clamp01((echoes[role] || 0) * mood.space * rng.range(0.4, 1.3));
  // in a tune, chords have to arrive on the beat with the drums, so pads swell in and let go quicker.
  // not plucked strings: they already start at once, and cutting their ring short is what made the
  // harp's notes end harshly
  const chordy = song.style === 'tune' && (role === 'pad' || role === 'keys' || role === 'drone') && instrument.kind !== 'pluck';
  // brightness: near the mood's, a touch darker for backing, and never pushing a harsh instrument
  // brighter than it was made (edge 1 stays at 1x at most, a soft one can go to 1.6x). it used to swing
  // anywhere from 0.4x to 2.2x on anything, and doubled saw leads and bells were painful. drums and
  // textures have no edge, so the mood's energy caps them instead: hi hats at 1.5x in a calm song
  // hissed over everything, and so did bright rain
  const bright = 2 ** (rng.range(-0.35, 0.35) + (mood.bright - 0.5) * 0.8) * (BACKING[role] ? 0.85 : 1);
  const ceiling = role === 'drums' ? 0.75 + mood.energy * 0.35 : role === 'texture' ? 0.9 : 1 + (1 - edge) * 0.6;
  // drums ring the length their kit gives them, not longer in a big room: that made every kick boom
  const release = rng.range(0.7, 1.6) * (0.7 + mood.space * 0.5) * (chordy ? 0.55 : 1);
  layer.tone = {
    attack: rng.range(0.6, 1.6) * (mood.energy > 0.7 ? 0.7 : 1) * (chordy ? 0.4 : 1),
    release: role === 'drums' ? Math.min(1.1, release) : release,
    bright: Math.min(bright, ceiling),
    detune: struck ? mood.dark * rng.range(0, 4) + rng.range(0, 1.5) : mood.dark * rng.range(0, 20) + rng.range(0, 4),
    vibrato: !struck && rng.chance(0.35) ? rng.range(2, 10) : 0,
  };
}

// rules for parts that belong together, run after the band's picked (or picked again, or mutated).
// each fixes something that sounded wrong:
//   - keys breaking chords into running notes under an arp: two layers doing the same job tangle,
//     so with an arp the keys hold their chords instead
//   - a pad pulsing under an arp: the same tangle
//   - a counter melody "in harmony" with no melody to harmonise: it answers instead
//   - backing louder than the melody: the tune got lost, so backing sits at least 0.1 under it
//   - a kit playing a pattern it doesn't suit (suits in synth.js): heartbeat's lub-dub on a busy
//     groove was a pile of thumps, and clockwork ticks on tribal toms a toy piano. the pattern
//     changes to one the kit suits, from the mood's list where it can
//   - a texture as loud as the band: it's scenery, so it sits well under the tune, and a little
//     under everything when there's no tune. wind and rain used to bury the melody
function fitBand(song) {
  const find = (role) => song.layers.find((layer) => layer.role === role);
  const arp = find('arp');
  const melody = find('melody');
  for (const layer of song.layers) {
    if (arp && layer.role === 'keys' && layer.pattern === 'broken') layer.pattern = song.style === 'tune' ? 'block' : 'strum';
    if (arp && layer.role === 'pad' && layer.pattern === 'pulse') layer.pattern = 'sustain';
    if (!melody && layer.role === 'counter' && layer.pattern === 'harmony') layer.pattern = 'answer';
    if (melody && BACKING[layer.role] && layer.role !== 'bass') layer.volume = Math.min(layer.volume, Math.max(0.2, melody.volume - 0.1));
    const suits = layer.role === 'drums' && INSTRUMENTS[layer.instrument]?.suits;
    if (suits && !suits.includes(layer.pattern)) {
      const wanted = MOODS[song.mood].patterns?.drums || STYLE_PATTERNS[song.style].drums;
      layer.pattern = wanted.find((pattern) => suits.includes(pattern)) || suits[0];
    }
    if (layer.role === 'texture') layer.volume = Math.min(layer.volume, melody ? melody.volume * 0.55 : 0.42);
  }
}

// how many bars a part's progression takes to go round once
function partBars(song, part) {
  const turns = parseProgression(song.parts[part]).slots.reduce((sum, slot) => sum + slot.slots, 0) || 1;
  return turns * song.chordBars;
}

function pickArrangement(song, rng) {
  const form = rng.pick(FORMS[song.style]);
  const entry = {};
  for (const layer of song.layers) entry[layer.id] = rng.range(...ROLE_ENTRY[layer.role]);
  let before = [];
  song.sections = form.map(([name, part, fourFourBars, energy]) => {
    // the forms are in 4/4 bars, so shorter bars (6/8 is two beats) get more of them
    const target = Math.max(2, Math.round((fourFourBars * 4) / METERS[song.meter].beats));
    // sections are whole turns of their part's progression, close to the bars the form asks for. a
    // progression much longer than that (an intro over 16 bars of chords) gets cut short instead
    const turn = partBars(song, part);
    const bars = Math.max(1, Math.min(32, Math.round(turn > target * 1.5 ? target : Math.max(1, Math.round(target / turn)) * turn)));
    // a layer plays once the section's energy reaches its entry point. one that's already playing
    // stays through small dips (an A a little quieter than the last) and only drops out for a real
    // change of gear, like a break or the outro. I used to add a random wobble to each section's
    // energy instead, and layers blinked in and out at random: the melody would stop for a section
    // and come back for no reason you could hear
    let play = song.layers.filter((layer) => entry[layer.id] <= energy || (before.includes(layer.id) && entry[layer.id] <= energy + 0.2)).map((layer) => layer.id);
    if (!play.length) play = [song.layers.find((layer) => layer.role === 'pad' || layer.role === 'keys' || layer.role === 'drone')?.id || song.layers[0]?.id].filter(Boolean);
    before = play;
    return { name, part, bars, play };
  });
}

function pickSpace(song, rng) {
  const mood = MOODS[song.mood];
  const bias = mood.fx || {};
  song.fx = {
    reverb: clamp01(mood.space * rng.range(0.55, 0.95)),
    size: clamp01(mood.space * rng.range(0.6, 1.15)),
    tone: clamp01(mood.bright * rng.range(0.6, 1.3)),
    echo: clamp01(rng.range(0.1, 0.45) * (0.4 + mood.space * 0.6)),
    echoTime: rng.pick(ECHO_TIMES),
    echoRepeats: rng.range(0.2, 0.55),
    warmth: clamp01((1 - mood.bright) * rng.range(0.2, 0.7)),
    wobble: clamp01((bias.wobble || 0) * rng.range(0.6, 1.3) + (rng.chance(0.25) ? rng.range(0, 0.25) : 0)),
    drive: clamp01((bias.drive || 0) * rng.range(0.6, 1.3) + rng.range(0, 0.12)),
    volume: 0.8,
  };
}

// little random nudges to everything that's a number, plus the odd new seed or pattern
function mutateSong(song, rng) {
  const nudge = (value, amount) => clamp01(value + rng.range(-amount, amount));
  song.tempo = Math.round(song.tempo * rng.range(0.93, 1.07));
  song.colour = nudge(song.colour, 0.15);
  song.humanise = nudge(song.humanise, 0.1);
  for (const layer of song.layers) {
    if (rng.chance(0.3)) layer.seed = newToken(rng);
    // only patterns that suit the mood and style, so a mutated cozy song doesn't grow a tribal beat
    if (rng.chance(0.2)) layer.pattern = rng.pick(MOODS[song.mood].patterns?.[layer.role] || STYLE_PATTERNS[song.style][layer.role]);
    layer.density = nudge(layer.density, 0.15);
    layer.volume = nudge(layer.volume, 0.06);
    layer.reverb = nudge(layer.reverb, 0.1);
    layer.tone.bright = Math.min(4, Math.max(0.25, layer.tone.bright * rng.range(0.8, 1.25)));
    layer.tone.attack = Math.min(4, Math.max(0.1, layer.tone.attack * rng.range(0.8, 1.25)));
  }
  for (const key of ['reverb', 'size', 'tone', 'echo', 'warmth']) song.fx[key] = nudge(song.fx[key], 0.08);
  fitBand(song);
}

// ---------- cleaning ----------

// every song, whether made here, loaded from a file or opened from a link, goes through this. it
// fills in anything missing and throws out anything that isn't a setting, so a broken or hand edited
// file can't break the page
function cleanSong(data) {
  const d = data && typeof data === 'object' ? data : {};
  const num = (value, low, high, fallback) => (Number.isFinite(+value) && value !== null && value !== '' ? Math.min(high, Math.max(low, +value)) : fallback);
  const text = (value, fallback, max) => (typeof value === 'string' && value.trim() ? value.slice(0, max) : fallback);
  const seed = text(d.seed, 'squimble', 60);
  const song = {
    name: text(d.name, seedTitle(seed), 40),
    seed,
    mood: MOODS[d.mood] ? d.mood : 'calm',
    style: d.style === 'tune' ? 'tune' : 'ambient',
    key: Math.round(num(d.key, 0, 11, 0)),
    scale: SCALES[d.scale] ? d.scale : 'major',
    tempo: Math.round(num(d.tempo, 30, 220, 80)),
    meter: METERS[d.meter] ? d.meter : '4/4',
    swing: num(d.swing, 0, 1, 0),
    humanise: num(d.humanise, 0, 1, 0.35),
    colour: num(d.colour, 0, 1, 0.4),
    chordBars: CHORD_BARS.includes(+d.chordBars) ? +d.chordBars : 2,
    parts: {},
    layers: [],
    sections: [],
    fx: {},
  };
  for (const part of PARTS) song.parts[part] = text(d.parts?.[part], 'I', 200);
  const ids = new Set();
  for (const raw of Array.isArray(d.layers) ? d.layers.slice(0, 16) : []) {
    if (!raw || !ROLES[raw.role]) continue;
    const layer = { ...clone(LAYER_DEFAULTS), role: raw.role };
    let id = text(raw.id, raw.role, 24).replace(/[^\w-]/g, '') || raw.role;
    for (let n = 2; ids.has(id); n++) id = `${raw.role}-${n}`;
    ids.add(id);
    layer.id = id;
    layer.instrument = instrumentFits(raw.instrument, raw.role) ? raw.instrument : Object.keys(INSTRUMENTS).find((key) => instrumentFits(key, raw.role));
    layer.pattern = PATTERNS[raw.role][raw.pattern] ? raw.pattern : Object.keys(PATTERNS[raw.role])[0];
    layer.seed = text(String(raw.seed ?? ''), '0', 24);
    layer.volume = num(raw.volume, 0, 1, layer.volume);
    layer.pan = num(raw.pan, -1, 1, 0);
    layer.octave = Math.round(num(raw.octave, -2, 2, 0));
    layer.density = num(raw.density, 0, 1, layer.density);
    layer.rate = RATES[raw.rate] ? raw.rate : 'medium';
    layer.span = Math.round(num(raw.span, 1, 3, 2));
    layer.reverb = num(raw.reverb, 0, 1, layer.reverb);
    layer.echo = num(raw.echo, 0, 1, layer.echo);
    layer.mute = raw.mute === true;
    layer.solo = raw.solo === true;
    const tone = raw.tone || {};
    layer.tone = {
      attack: num(tone.attack, 0.1, 4, 1), release: num(tone.release, 0.1, 4, 1), bright: num(tone.bright, 0.25, 4, 1),
      detune: num(tone.detune, 0, 50, 0), vibrato: num(tone.vibrato, 0, 50, 0),
    };
    for (const part of PARTS) {
      const edit = raw.edits?.[part];
      if (!edit) continue;
      const add = (Array.isArray(edit.add) ? edit.add.slice(0, 2000) : [])
        .filter((note) => Array.isArray(note) && note.every((n) => Number.isFinite(n)))
        .map(([t, midi, dur]) => [Math.max(0, t), Math.round(Math.min(127, Math.max(0, midi))), Math.min(64, Math.max(0.05, dur))]);
      const remove = (Array.isArray(edit.remove) ? edit.remove.slice(0, 4000) : []).filter((key) => typeof key === 'string' && /^[\d.]+:\d+$/.test(key));
      if (add.length || remove.length) layer.edits[part] = { add, remove };
    }
    song.layers.push(layer);
  }
  for (const raw of Array.isArray(d.sections) ? d.sections.slice(0, 64) : []) {
    if (!raw) continue;
    song.sections.push({
      name: text(raw.name, 'Part', 20),
      part: PARTS.includes(raw.part) ? raw.part : 'A',
      bars: Math.round(num(raw.bars, 1, 64, 8)),
      play: [...new Set(Array.isArray(raw.play) ? raw.play.filter((id) => ids.has(id)) : [])],
    });
  }
  if (!song.sections.length) song.sections.push({ name: 'A', part: 'A', bars: 8, play: [...ids] });
  const fx = d.fx || {};
  for (const [key, fallback] of Object.entries(FX_DEFAULTS)) song.fx[key] = key === 'echoTime' ? (ECHO_TIMES.includes(+fx.echoTime) ? +fx.echoTime : fallback) : num(fx[key], 0, 1, fallback);
  return song;
}

// ---------- composing: settings to notes ----------

// a section's chords, laid out from its start. the part's progression goes round as many times as
// fits
function sectionChords(song, section, start) {
  const bpb = METERS[song.meter].beats;
  let { slots } = parseProgression(song.parts[section.part]);
  if (!slots.length) {
    const home = diatonicChord(harmonySteps(song.scale), 0);
    slots = [{ chord: { ...home, fixed: false }, slots: 1 }];
  }
  const beats = section.bars * bpb;
  const chords = [];
  for (let t = 0, i = 0; t < beats - 1e-6; i++) {
    const slot = slots[i % slots.length];
    const dur = Math.min(slot.slots * song.chordBars * bpb, beats - t);
    const { chord } = slot;
    const tones = chord.fixed ? chord.tones : colourChord(chord.tones, chord.root, song.colour, makeRng(song.seed, 'colour', section.part, i % slots.length));
    const root = mod12(song.key + chord.root);
    chords.push({ t: start + t, dur, root, tones, pcs: new Set(tones.map((tone) => mod12(root + tone))), name: chordName(root, tones) });
    t += dur;
  }
  return chords;
}

function composeSong(song) {
  const meter = METERS[song.meter];
  const sections = [];
  const takes = {};
  let start = 0;
  for (const [index, section] of song.sections.entries()) {
    const beats = section.bars * meter.beats;
    takes[section.part] = (takes[section.part] ?? -1) + 1;
    sections.push({ ...section, index, take: takes[section.part], start, beats, end: start + beats, chords: sectionChords(song, section, start) });
    start += beats;
  }
  const scalePcs = new Set(SCALES[song.scale].steps.map((step) => mod12(song.key + step)));
  // melodies first, so counter melodies can answer them
  const layers = [...song.layers].sort((a, b) => (a.role === 'melody' ? 0 : 1) - (b.role === 'melody' ? 0 : 1));
  const melodyBySection = {};
  const grooves = {};
  for (const part of PARTS) grooves[part] = grooveFor(song, part);
  // everyone writes their part, then the band listens to each other (listen), then it's played with
  // feel. listening comes before feel, so it compares the notes where they sit on the grid
  const parts = {};
  for (const layer of layers) {
    const out = [];
    for (const section of sections) {
      if (!section.play.includes(layer.id)) continue;
      const c = {
        song, layer, section, meter, scalePcs,
        groove: grooves[section.part],
        prev: sections[section.index - 1] || null,
        next: sections[section.index + 1] || null,
        bpb: meter.beats, sub: meter.sub, step: gridStep(song.meter),
        start: section.start, end: section.end, bars: section.bars,
        chords: section.chords,
        rng: makeRng(song.seed, layer.seed, layer.role, section.part),
        vary: makeRng(song.seed, layer.seed, section.part, 'take', section.take),
        center: ROLES[layer.role].center + layer.octave * 12,
        steps: SCALES[song.scale].steps,
        melody: melodyBySection[section.index] || null,
      };
      c.tonic = near(song.key, c.center);
      let made = COMPOSERS[layer.role](c).filter((note) => note.t >= section.start - 1e-6 && note.t < section.end - 1e-6);
      made = applyEdits(made, layer.edits[section.part], section);
      if (layer.role === 'melody' && !melodyBySection[section.index]) melodyBySection[section.index] = made;
      out.push(...made);
    }
    parts[layer.id] = out;
  }
  listen(song, sections, parts);
  const notes = [];
  for (const layer of layers) {
    let out = parts[layer.id];
    if (layer.role === 'drone' || layer.role === 'texture') out = joinHeld(out);
    feel(out, song, layer);
    for (const note of out) note.layer = layer.id;
    notes.push(...out);
  }
  notes.sort((a, b) => a.t - b.t);
  return { beats: start, bpb: meter.beats, sub: meter.sub, step: gridStep(song.meter), sections, notes };
}

// ---------- listening ----------
//
// each composer writes its own part. then the band listens to each other and gives way where two
// parts would sound wrong together, the way players in a real band do without being told. the drums
// listen as they play instead (COMPOSERS.drums). notes added by hand are left alone: they're yours.
//   - the tune stays on top: keys, an arp or a counter melody that would sound above the melody note
//     playing as they start drop an octave, unless that takes them out of their range. an arp
//     running up over the tune fought it for your ear. pads are a wash behind everything and bells
//     ring above on purpose, so they stay where they are
//   - nobody rubs against the tune: a minor second (or ninth) between a note and a longer melody note
//     it's heard against is the harshest clash there is. pads and keys drop the chord's added note
//     (a seventh, a ninth) when that's what rubs, and still have the chord without it. single lines
//     (an arp, bells, a counter melody) move to the nearest chord note that doesn't rub instead
const ON_TOP = { keys: true, arp: true, counter: true };
const GIVE_WAY = { keys: 'drop', pad: 'drop', arp: 'move', bells: 'move', counter: 'move' };
// the upper of two notes a minor second (or a minor ninth, or more octaves) above the lower
const rubs = (a, b) => mod12(Math.max(a, b) - Math.min(a, b)) === 1;

function listen(song, sections, parts) {
  const melody = song.layers.find((layer) => layer.role === 'melody');
  const tune = melody ? [...parts[melody.id]].sort((a, b) => a.t - b.t) : [];
  if (!tune.length) return;
  // the last melody note starting at or before t
  const lastBefore = (t) => {
    let low = 0;
    let high = tune.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (tune[middle].t <= t + 1e-6) low = middle + 1;
      else high = middle;
    }
    return low - 1;
  };
  const chordOf = (t) => {
    const section = sections.find((one) => t < one.end - 1e-6) || sections[sections.length - 1];
    return section.chords.find((chord) => t < chord.t + chord.dur - 1e-6) || section.chords[section.chords.length - 1];
  };
  for (const layer of song.layers) {
    const rule = GIVE_WAY[layer.role];
    if (!rule) continue;
    const floor = ROLES[layer.role].center + layer.octave * 12 - 12;
    parts[layer.id] = parts[layer.id].filter((note) => {
      if (note.added) return true;
      const at = lastBefore(note.t);
      const lead = tune[at];
      const ceiling = ON_TOP[layer.role] && lead && note.t < lead.t + lead.dur - 1e-6 ? lead.midi : Infinity;
      // written: the pitch the composer wrote, which hand edits know the note by (applyEdits)
      while (note.midi > ceiling && note.midi - 12 >= floor) {
        note.written ??= note.midi;
        note.midi -= 12;
      }
      // the melody notes it's heard against: the one playing as it starts and any that start while
      // it sounds, leaving out quick passing notes
      const heard = [];
      for (let i = Math.max(0, at); i < tune.length && tune[i].t < note.t + note.dur - 1e-6; i++) {
        if (tune[i].dur >= 0.5 && tune[i].t + tune[i].dur > note.t + 1e-6) heard.push(tune[i].midi);
      }
      const clashes = (midi) => heard.some((other) => rubs(midi, other));
      if (!clashes(note.midi)) return true;
      const chord = chordOf(note.t);
      if (rule === 'drop') return chord.tones.slice(0, 3).some((tone) => mod12(chord.root + tone) === mod12(note.midi));
      for (const step of [1, -1, 2, -2, 3, -3, 4, -4]) {
        const midi = note.midi + step;
        if (chord.pcs.has(mod12(midi)) && !clashes(midi) && (midi <= ceiling || note.midi > ceiling)) {
          note.written ??= note.midi;
          note.midi = midi;
          break;
        }
      }
      return true;
    });
  }
}

// a note's key for edits: where it starts in its section, and its pitch
const editKey = (relative, midi) => `${+relative.toFixed(3)}:${midi}`;

function applyEdits(notes, edit, section) {
  if (!edit) return notes;
  const removed = new Set(edit.remove);
  const kept = notes.filter((note) => !removed.has(editKey(note.t - section.start, note.midi)));
  for (const [t, midi, dur] of edit.add) {
    if (t >= section.beats) continue;
    kept.push({ t: section.start + t, dur: Math.min(dur, section.beats - t), midi, vel: 0.75, added: true });
  }
  return kept;
}

// drones and textures held across sections join into one long note, so they don't fade out and back in
function joinHeld(notes) {
  notes.sort((a, b) => a.t - b.t);
  const out = [];
  const last = {};
  for (const note of notes) {
    const before = last[note.midi];
    if (before && Math.abs(before.t + before.dur - note.t) < 1e-6) before.dur += note.dur;
    else {
      out.push(note);
      last[note.midi] = note;
    }
  }
  return out;
}

// swing and humanising. gt keeps the note's place on the grid, which edits and the note editor use;
// t is when it really plays.
//
// humanising nudges the band together, the way players who know each other lock in: every note on
// the same spot in the song moves by the same amount (the pocket), and each layer only adds a little
// of its own on top (LOOSE). I first gave every layer its own random nudges, and the kick, bass and
// chords smeared apart into flams. drums and bass add almost nothing, so the beat stays solid
const LOOSE = { melody: 1, counter: 1, bells: 1, arp: 0.5, keys: 0.6, pad: 0.4, bass: 0.15, drums: 0.1, drone: 0, texture: 0 };
const pocket = (song, t) => makeRng(song.seed, 'pocket', Math.round(t * 12)).range(-1, 1) * song.humanise * 0.012;
function feel(notes, song, layer) {
  const rng = makeRng(song.seed, layer.seed, 'feel');
  // swing pushes every off beat later: a beat's second half starts at 0.5 + swing / 4 instead of 0.5.
  // 6/8 already lilts in threes, and swinging its thirds just knocked them out of line, so it doesn't
  const swing = METERS[song.meter].sub === 2 ? song.swing : 0;
  const middle = 0.5 + swing * 0.25;
  const own = LOOSE[layer.role] * song.humanise;
  for (const note of notes) {
    note.gt = note.t;
    if (layer.role === 'drone' || layer.role === 'texture') continue;
    const beat = Math.floor(note.t + 1e-9);
    const u = note.t - beat;
    let t = beat + (u < 0.5 ? (u / 0.5) * middle : middle + ((u - 0.5) / 0.5) * (1 - middle));
    t += pocket(song, note.gt) + rng.range(-1, 1) * own * 0.012;
    note.t = Math.max(0, t);
    // strengths still vary for everyone, drums most of all: an even hi hat is what sounds like a machine
    note.vel = clamp01(note.vel * (1 + rng.range(-1, 1) * Math.max(own, song.humanise * 0.6) * 0.16));
  }
}

// ---------- the groove ----------
//
// the drums, a syncopated bass and the chord stabs all play from one groove, so the kick and bass
// land together and the stabs fit round them, like a band that's played together for years. before
// this, each made up its own rhythm (and the drums rolled dice every bar), which is why they never
// sat together. a groove is a bar written out by hand, like an old drum machine's pattern chart:
//   k kick, s snare, h hat, o open hat, p perc (rim, shaker or tick), l low perc (toms or taiko),
//   c comping: where chord stabs and the syncopated bass go
// x is a hit, - a soft (ghost) one, . nothing, one character a step: 16ths in 4/4, 3/4 and 5/4, 8ths
// in 6/8. lines a groove leaves out are silent. the drum layer's pattern picks the list, and its seed
// picks one from it. part A plays it as written, B a lifted version and C a dropped one (grooveFor)
const GROOVES = {
  '4/4': {
    groove: [
      { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', c: 'x.....x.....x...' },
      { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', c: 'x.....x...x.....' },
      { k: 'x..x....x.x.....', s: '....x..-.-..x...', h: 'x-x-x-x-x-x-x-x-', c: '..x...x...x...x.' },
      { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '..x...x...x...x.', c: '..x...x...x...x.' },
      { k: 'x.....x...x.....', s: '....x.......x..-', h: 'x.x.x.x.x.x.x.x.', c: 'x.......x.....x.' },
    ],
    halftime: [
      { k: 'x.......-.x.....', s: '........x.......', h: 'x.x.x.x.x.x.x.x.', c: 'x.......x.......' },
      { k: 'x..x......x.....', s: '........x.......', h: 'x...x...x...x...', p: '......-.......-.', c: 'x..x......x.....' },
    ],
    // brushes: a jazz ride (ding, ding-a ding) with the brush swishing on 2 and 4, for cozy and
    // wistful songs. it sounds best swung
    brush: [
      { k: 'x.......-.......', s: '....x.......x...', h: 'x...x.x.x...x.x.', c: 'x.....x.........' },
      { k: 'x...........-...', s: '....x.......x...', h: 'x...x.x.x...x.x.', p: '..........-.....', c: 'x.......x.......' },
    ],
    pulse: [
      { k: 'x.......x.......', p: '....-.......-...', c: 'x.......x.......' },
      { k: 'x.........x.....', p: '....-...-...-...', c: 'x.........x.....' },
    ],
    tribal: [
      { k: 'x.......x.......', l: 'x..x..x...x.x...', p: '..-...-...-...-.', c: 'x..x..x.........' },
      { k: 'x.....x.........', l: '..x.x..x..x.x.x.', p: 'x...x...x...x...', c: 'x.....x...x.....' },
    ],
    march: [
      { k: 'x.......x.......', s: 'x.xxx.x.x.xxx.x.', h: 'x...x...x...x...', c: 'x...x...x...x...' },
      { k: 'x...x...x...x...', s: 'x..x..x.x.x.x.x.', c: 'x.......x.......' },
    ],
    sparse: [
      { k: 'x...............', h: '-...-...-...-...', p: '..........-.....', c: 'x.......x.......' },
      { k: 'x.......-.......', h: '....-.......-...', c: 'x...............' },
    ],
  },
  '3/4': {
    groove: [
      { k: 'x...........', s: '....x...x...', h: 'x.x.x.x.x.x.', c: '....x...x...' },
      { k: 'x.......x...', s: '....x.......', h: 'x.x.x.x.x.x.', c: 'x.......x...' },
    ],
    halftime: [{ k: 'x...........', s: '........x...', h: 'x...x...x...', c: 'x...........' }],
    brush: [{ k: 'x...........', s: '....x...x...', h: 'x...x.x.x...', c: 'x...........' }],
    pulse: [{ k: 'x...........', p: '....-...-...', c: 'x...........' }],
    tribal: [{ k: 'x...........', l: 'x..x..x.x...', p: '..-...-...-.', c: 'x..x..x.....' }],
    march: [{ k: 'x...........', s: 'x.xxx.x.x.x.', h: 'x...x...x...', c: 'x...x...x...' }],
    sparse: [{ k: 'x...........', h: '-...-...-...', c: 'x...........' }],
  },
  '6/8': {
    groove: [
      { k: 'x.....', s: '...x..', h: 'x--x--', c: 'x..x..' },
      { k: 'x.-...', s: '...x..', h: 'x--x--', c: 'x..x.x' },
    ],
    halftime: [{ k: 'x.....', s: '...-..', h: 'x-.x-.', c: 'x.....' }],
    brush: [{ k: 'x.....', s: '...x..', h: 'x.xx.x', c: 'x..x..' }],
    pulse: [{ k: 'x.....', p: '...-..', c: 'x.....' }],
    tribal: [{ k: 'x.....', l: 'x.xx.x', p: '.-..-.', c: 'x.xx.x' }],
    march: [{ k: 'x..x..', s: 'x-xx-x', h: 'x..x..', c: 'x..x..' }],
    sparse: [{ k: 'x.....', h: '-..-..', c: 'x.....' }],
  },
  // 5/4 as three beats then two, like take five
  '5/4': {
    groove: [{ k: 'x...........x.......', s: '........x.......x...', h: 'x.x.x.x.x.x.x.x.x.x.', c: 'x.......x...x.......' }],
    halftime: [{ k: 'x...........x.......', s: '........x...........', h: 'x...x...x...x...x...', c: 'x...........x.......' }],
    brush: [{ k: 'x...................', s: '....x.......x.......', h: 'x...x.x.x...x.x.x...', c: 'x...........x.......' }],
    pulse: [{ k: 'x...........x.......', p: '........-.......-...', c: 'x...........x.......' }],
    tribal: [{ k: 'x...........x.......', l: 'x..x..x.....x..x....', p: '..-...-...-...-...-.', c: 'x..x..x.....x.......' }],
    march: [{ k: 'x...........x.......', s: 'x.xxx.x.x.x.x.xxx.x.', h: 'x...x...x...x...x...', c: 'x...x...x...x...x...' }],
    sparse: [{ k: 'x...................', h: '-...-...-...-...-...', c: 'x...................' }],
  },
};
// the drum each groove line plays (KIT_SLOTS order in synth.js)
const GROOVE_SLOTS = { k: 0, s: 1, h: 2, o: 3, p: 4, l: 5 };
// the grooves that get busier in B parts, and the ones whose fills and section crashes are loud
const LIFTS = { groove: true, halftime: true, march: true };

// a pitched drum (a kick, a tom, a tick, a rim, the body of a snare) moved to the nearest home note
// or fifth of the song's key, in hz. where the kits had them they were out of key with everything
// else: a kick a semitone off the bass, a woodblock ticking a wrong note on every beat
function tuneDrum(hz, key) {
  const midi = 69 + 12 * Math.log2(hz / 440);
  const [best] = [key, key + 7].map((pc) => near(pc, Math.round(midi))).sort((a, b) => Math.abs(a - midi) - Math.abs(b - midi));
  return 440 * 2 ** ((best - 69) / 12);
}

// a part's groove, as numbers: 1 a hit, 0.5 a soft one, 0 nothing. songs without drums still get one
// (the style's usual), so their bass and stabs keep to a steady rhythm
function grooveFor(song, part) {
  const drums = song.layers.find((layer) => layer.role === 'drums');
  const kind = drums ? drums.pattern : song.style === 'tune' ? 'groove' : 'pulse';
  const written = makeRng(song.seed, drums ? drums.seed : '', 'groove').pick(GROOVES[song.meter][kind]);
  const steps = written.k.length;
  const perBeat = steps / METERS[song.meter].beats;
  const lines = {};
  for (const name of [...Object.keys(GROOVE_SLOTS), 'c']) lines[name] = [...(written[name] || '.'.repeat(steps))].map((char) => (char === 'x' ? 1 : char === '-' ? 0.5 : 0));
  if (!written.c) lines.c = lines.k.slice();
  if (part === 'B' && LIFTS[kind]) {
    // lifted: soft hats in between, and an open hat on the last off beat pushing into the next bar.
    // only for the pop grooves: it put busy 16th hats into quiet sparse beats and jazz brushes
    if (perBeat === 4) lines.h = lines.h.map((v, i) => v || (i % 2 ? 0.5 : 0));
    const push = steps - Math.ceil(perBeat / 2);
    lines.o[push] = 1;
    lines.h[push] = 0;
  }
  if (part === 'C') {
    // dropped: a rim click where the snare was, hats only on the beat, the kick only on the beat
    lines.p = lines.p.map((v, i) => Math.max(v, lines.s[i] ? 0.5 : 0));
    lines.s = lines.s.map(() => 0);
    lines.h = lines.h.map((v, i) => (i % perBeat === 0 ? v : 0));
    lines.k = lines.k.map((v, i) => (i % perBeat === 0 ? v : 0));
  }
  return { lines, steps, perBeat, grid: METERS[song.meter].beats / steps };
}

// ---------- the composers, one per role ----------
// each gets c (the section, its chords, its own random numbers, see composeSong()) and returns
// notes: { t, dur, midi, vel } with t in beats from the song's start

const chordAt = (c, t) => c.chords.find((chord) => t >= chord.t - 1e-6 && t < chord.t + chord.dur - 1e-6) || c.chords[c.chords.length - 1];
const nextChord = (c, chord) => c.chords[c.chords.indexOf(chord) + 1] || c.chords[0];

// scale degrees (0 is the key's home note near the layer's centre, 7 an octave up in a 7 note scale)
const degreeMidi = (c, degree) => {
  const n = c.steps.length;
  return c.tonic + 12 * Math.floor(degree / n) + c.steps[((degree % n) + n) % n];
};

// the nearest degree that's in the chord, if there is one close
function chordDegree(c, degree, chord) {
  for (let k = 0; k <= 4; k++) {
    if (chord.pcs.has(mod12(degreeMidi(c, degree + k)))) return degree + k;
    if (chord.pcs.has(mod12(degreeMidi(c, degree - k)))) return degree - k;
  }
  return degree;
}

// a borrowed chord (bVII in a major key, say) has notes outside the scale. a scale note a semitone
// from one of those would clash, so it moves onto the chord's note instead
function fitToChord(midi, chord, scalePcs) {
  for (const pc of chord.pcs) {
    if (scalePcs.has(pc)) continue;
    const gap = mod12(pc - midi);
    if (gap === 1) return midi + 1;
    if (gap === 11) return midi - 1;
  }
  return midi;
}

// strong beats are where a melody wants to be on a chord note: the start of the bar, and the middle
// of a 4/4 bar
const isStrong = (c, t) => {
  const inBar = (t - c.start) % c.bpb;
  return Math.abs(inBar - Math.round(inBar)) < 1e-6 && (Math.round(inBar) === 0 || (c.bpb === 4 && Math.round(inBar) === 2));
};

// rhythm cells, in beats: a bar of melody is a few of these end to end
const CELLS = {
  2: {
    slow: [[2], [4], [3, 1], [1.5, 0.5, 2], [2, 2], [1, 3]],
    mid: [[1, 1], [1.5, 0.5], [0.5, 0.5, 1], [1, 0.5, 0.5], [2], [0.75, 0.25, 1], [1]],
    fast: [[0.5, 0.5], [0.25, 0.25, 0.5], [0.5, 0.25, 0.25], [0.75, 0.25], [1], [0.5, 1, 0.5]],
  },
  3: {
    slow: [[1], [2], [2 / 3, 1 / 3, 1], [1, 1]],
    mid: [[1 / 3, 1 / 3, 1 / 3], [2 / 3, 1 / 3], [1], [1 / 3, 2 / 3]],
    fast: [[1 / 3, 1 / 3, 1 / 3], [1 / 6, 1 / 6, 1 / 3, 1 / 3], [2 / 3, 1 / 3], [1 / 3, 1 / 6, 1 / 6]],
  },
};

// a bar's rhythm: cells end to end until it's full. busier layers pick faster cells, quieter ones
// slower (longer notes). there are no rests inside a bar: I used to turn random notes into gaps, and
// because the motif repeats, the same holes came back every bar and the tune sounded like it kept
// cutting out. a sparse melody is long notes instead, and it breathes at the ends of phrases (tune())
function makeBar(rng, c, density) {
  const cells = CELLS[c.sub];
  const out = [];
  let t = 0;
  while (t < c.bpb - 1e-6) {
    const speed = rng.weighted({ slow: 1.2 - density, mid: 0.6, fast: Math.max(0, density - 0.35) * 1.5 });
    for (const length of rng.pick(cells[speed])) {
      if (t >= c.bpb - 1e-6) break;
      const dur = Math.min(length, c.bpb - t);
      out.push({ t, dur });
      t += dur;
    }
  }
  return out;
}

// where a time falls in the groove's bar, and how many steps until its next hit after step i
const stepInBar = (c, t) => Math.round(((t - c.start) % c.bpb) / c.groove.grid) % c.groove.steps;
function gapAfter(hits, i) {
  let gap = 1;
  while (gap < hits.length && !hits[(i + gap) % hits.length]) gap++;
  return gap;
}

// the groove's comping hits inside a chord: [time, length until the next hit, strength]. counted from
// the bar, not the chord, so half bar chords still land on the groove. sparse layers keep only the
// hits on the beat
function compHits(c, chord, density) {
  const { lines, perBeat, grid } = c.groove;
  const hits = lines.c.map((v, i) => v > 0 && (density >= 0.35 || i % perBeat === 0));
  if (!hits.some(Boolean)) hits[0] = true;
  const out = [];
  const end = chord.t + chord.dur;
  for (let t = chord.t; t < end - 1e-6; t += grid) {
    const i = stepInBar(c, t);
    if (hits[i]) out.push([t, Math.min(gapAfter(hits, i) * grid, end - t), i % perBeat === 0 ? 0.66 : 0.56]);
  }
  return out;
}

// the next step of a melody's shape, in scale degrees: mostly small steps, the odd leap
const stepShape = (rng) => rng.weighted([[1, 3], [-1, 3.2], [2, 1.4], [-2, 1.5], [0, 1], [3, 0.5], [-3, 0.5], [4, 0.3], [-4, 0.3]]);

// how a phrase is built from its motif, bar by bar: m the motif, v a variation of it, i the motif
// upside down, e the ending (half the motif, then a long note to rest on)
const PHRASE_PLANS = [['m', 'm', 'v', 'e'], ['m', 'v', 'm', 'e'], ['m', 'i', 'm', 'e'], ['m', 'v', 'i', 'e'], ['m', 'm', 'm', 'e']];

function tune(c, { density, low, high, plan4 }) {
  const { rng } = c;
  const phraseBars = c.bars >= 4 && (plan4 || rng.chance(0.6)) ? 4 : Math.min(2, c.bars);
  const motif = makeBar(rng, c, density);
  const shape = motif.map(() => stepShape(rng));
  const variant = makeBar(rng, c, density);
  const variantShape = variant.map(() => stepShape(rng));
  const plan = phraseBars === 4 ? rng.pick(PHRASE_PLANS) : phraseBars === 2 ? ['m', 'e'] : ['e'];
  // a later time round a part can change how its last phrase goes (c.vary is per time round)
  const lastPlan = c.section.take > 0 && c.vary.chance(0.5) ? c.vary.pick(PHRASE_PLANS).slice(4 - phraseBars) : plan;
  const notes = [];
  let degree = chordDegree(c, rng.int(-1, 3), c.chords[0]);
  for (let bar = 0; bar < c.bars; bar++) {
    const barStart = c.start + bar * c.bpb;
    const place = bar % phraseBars;
    const last = bar >= c.bars - phraseBars;
    const kind = (last ? lastPlan : plan)[place];
    let rhythm = kind === 'v' ? variant : motif;
    let steps = kind === 'v' ? variantShape : kind === 'i' ? shape.map((s) => -s) : shape;
    if (kind === 'e') {
      // the first half of the motif, then one long note. only motif notes that finish by half way:
      // a motif of one whole bar note used to be kept whole, and the long note then spilled into the
      // next bar as a stray blip on top of its first note
      rhythm = motif.filter((n) => n.t + n.dur <= c.bpb / 2 + 1e-6);
      const from = rhythm.length ? rhythm[rhythm.length - 1].t + rhythm[rhythm.length - 1].dur : 0;
      rhythm = [...rhythm, { t: from, dur: c.bpb - from, end: true }];
      steps = [...shape];
    }
    // each new phrase starts back near a chord note, so the tune doesn't wander off
    if (place === 0 && bar > 0) degree = chordDegree(c, Math.round(degree / 2) + rng.int(-1, 2), chordAt(c, barStart));
    rhythm.forEach((cell, i) => {
      const t = barStart + cell.t;
      degree += steps[i % steps.length] || 0;
      if (degree > high) degree -= 2 * Math.abs(steps[i % steps.length] || 1);
      if (degree < low) degree += 2 * Math.abs(steps[i % steps.length] || 1);
      const chord = chordAt(c, t);
      if (cell.end) {
        // phrases end on a chord note, and the last phrase of a section on the chord's root if it can
        degree = chordDegree(c, degree, chord);
        if (last && bar === c.bars - 1) {
          for (let k = 0; k <= 3; k++) {
            if (mod12(degreeMidi(c, degree - k)) === chord.root) { degree -= k; break; }
            if (mod12(degreeMidi(c, degree + k)) === chord.root) { degree += k; break; }
          }
        }
      } else if (isStrong(c, t) || cell.dur >= 1) degree = chordDegree(c, degree, chord);
      const gap = cell.end ? Math.min(0.5, cell.dur * 0.25) : 0;
      notes.push({
        // nearly legato, so the line sings rather than ticks. never longer than its cell: 6/8's sixth
        // of a beat notes were stretched to a whole step, so two melody notes sounded at once
        t, dur: Math.max(Math.min(c.step, cell.dur * 0.97), (cell.dur - gap) * 0.97),
        midi: fitToChord(degreeMidi(c, degree), chord, c.scalePcs),
        vel: (isStrong(c, t) ? 0.85 : 0.68) + rng.range(-0.05, 0.05),
      });
    });
  }
  return notes;
}

// a counter melody in harmony: the melody a third (two scale steps) or a sixth below, on its longer
// notes. thirds and sixths are the intervals that blend; anything else fights the tune
function harmonise(c, density) {
  const below = c.rng.chance(0.65) ? 2 : 5;
  return c.melody.filter((note) => note.dur >= c.step * 2 && c.rng.chance(0.4 + density * 0.6)).map((note) => {
    let midi = note.midi;
    for (let step = 0; step < below; step++) {
      midi--;
      while (!c.scalePcs.has(mod12(midi))) midi--;
    }
    while (midi > c.center + 9) midi -= 12;
    return { t: note.t, dur: note.dur, midi: fitToChord(midi, chordAt(c, note.t), c.scalePcs), vel: note.vel * 0.8 };
  });
}

// the bells' chimes: [beats after the chord changes, which chord note counting down from the top]
const BELL_FIGURES = [
  [[0, 0], [0.5, 1], [1, 2]],
  [[0, 0], [1, 1]],
  [[0, 2], [0.5, 1], [1, 0]],
  [[0, 0], [1.5, 1], [2, 0]],
  [[0, 1], [0.5, 0], [1, 1], [1.5, 2]],
];

const COMPOSERS = {
  melody(c) {
    const { pattern, density } = c.layer;
    if (pattern === 'long') return tune(c, { density: density * 0.3, low: -3, high: 7, plan4: true });
    const notes = tune(c, { density, low: -4, high: 7 });
    if (pattern !== 'calls') return notes;
    // calls: a bar of tune, its last note held on through half the next bar, then quiet for the other
    // half, leaving room for an answer (a counter melody on "answers" fills it). I first just emptied
    // every other bar, and the tune seemed to stop mid thought
    const barOf = (note) => Math.floor((note.t - c.start) / c.bpb + 1e-9);
    const kept = notes.filter((note) => barOf(note) % 2 === 0);
    for (let i = 0; i < kept.length; i++) {
      const next = kept[i + 1];
      if (next && barOf(next) === barOf(kept[i])) continue;
      const until = Math.min(c.end, c.start + (barOf(kept[i]) + 1.5) * c.bpb);
      kept[i].dur = Math.max(kept[i].dur, until - kept[i].t);
    }
    return kept;
  },

  counter(c) {
    const { pattern, density } = c.layer;
    if (pattern === 'harmony' && c.melody) return harmonise(c, density);
    const notes = tune(c, { density: density * 0.8, low: -4, high: 6 });
    if (pattern === 'free' || !c.melody) return notes;
    // answers: whole bars, where the melody rests or holds one note, like two people talking. it
    // used to drop single notes wherever the melody played, which left stray two note fragments. with
    // a busy melody there's nowhere to answer, so it harmonises instead
    const starts = {};
    for (const note of c.melody) {
      const bar = Math.floor((note.t - c.start) / c.bpb + 1e-9);
      starts[bar] = (starts[bar] || 0) + 1;
    }
    const open = (bar) => (starts[bar] || 0) <= 1;
    const answers = notes.filter((note) => open(Math.floor((note.t - c.start) / c.bpb + 1e-9)));
    return answers.length ? answers : harmonise(c, density);
  },

  arp(c) {
    const { pattern, density, span, rate } = c.layer;
    const step = rateStep(rate, c.sub);
    const notes = [];
    let previous = null;
    let index = 0;
    // which steps of the bar rest, and the order random arps go in, are picked once for the part
    // and kept, so the arp repeats a shape you can follow instead of new holes every bar
    const shape = makeRng(c.song.seed, c.layer.seed, 'shape', c.section.part);
    const rests = Array.from({ length: Math.round(c.bpb / step) }, (_, i) => i > 0 && shape.chance((1 - density) * 0.45));
    const order = Array.from({ length: 16 }, () => shape.int(0, 63));
    for (const chord of c.chords) {
      const voiced = voiceChord(chord.root, chord.tones.filter((tone) => tone < 12), c.center, previous);
      previous = voiced;
      let pool = [];
      for (let octave = 0; octave < span; octave++) pool.push(...voiced.map((midi) => midi + octave * 12));
      if (pattern === 'down') pool.reverse();
      if (pattern === 'updown') pool = [...pool, ...pool.slice(1, -1).reverse()];
      if (pattern === 'converge') pool = pool.map((_, i) => (i % 2 ? pool[pool.length - 1 - (i >> 1)] : pool[i >> 1]));
      for (let t = chord.t; t < chord.t + chord.dur - 1e-6; t += step) {
        const midi = pool[(pattern === 'random' ? order[index % order.length] : index) % pool.length];
        index++;
        if (rests[Math.round(((t - c.start) % c.bpb) / step) % rests.length]) continue;
        const onBeat = Math.abs((t - c.start) % 1) < 1e-6;
        notes.push({ t, dur: step * 0.75, midi, vel: onBeat ? 0.78 : 0.6 });
      }
    }
    return notes;
  },

  bells(c) {
    const { pattern, density } = c.layer;
    if (pattern === 'phasing') {
      // a few notes from the home chord and its neighbours, each on its own loop length (eno's tape
      // loops). they count from the song's start, not the section's, so they carry on drifting
      // across sections. lengths are two to four bars, give or take a beat or two, and everything's
      // on a whole beat: I first used any half beat length from 5 to 15 beats, and the bells landed
      // off the beat at times that sounded random rather than drifting
      const rng = makeRng(c.song.seed, c.layer.seed, 'loops');
      const count = 2 + Math.round(density * 2);
      const pool = [0, 4, 2, 7, 5, 9];
      const notes = [];
      for (let i = 0; i < count; i++) {
        const degree = pool[(i * 2 + rng.int(0, 5)) % pool.length];
        const period = rng.pick([2, 3, 4]) * c.bpb + rng.pick([0, 0, 1, 2]);
        const phase = rng.int(0, c.bpb * 2 - 1);
        const dur = rng.range(2, 4);
        const first = phase + Math.ceil((c.start - phase) / period) * period;
        for (let t = first; t < c.end - 1e-6; t += period) {
          notes.push({ t, dur, midi: fitToChord(degreeMidi(c, degree), chordAt(c, t), c.scalePcs), vel: rng.range(0.45, 0.7) });
        }
      }
      return notes;
    }
    // chimes (saved as "sparkle"): a short figure of the chord's own notes, rung as the chord changes
    // (and every two bars through long chords). the figure stays the same all part long, so it's a
    // little hook you can listen out for. busy rings it every time, quieter every other time. this
    // used to be random high notes on any step, which sounded pretty but arrived at random
    const shape = makeRng(c.song.seed, c.layer.seed, 'chimes', c.section.part);
    const figure = shape.pick(BELL_FIGURES);
    const every = density > 0.55 ? 1 : 2;
    const notes = [];
    let previous = null;
    let ring = 0;
    for (const chord of c.chords) {
      const voiced = voiceChord(chord.root, chord.tones.filter((tone) => tone < 12), c.center, previous);
      previous = voiced;
      const end = chord.t + chord.dur;
      for (let at = chord.t; at < end - 1e-6; at += c.bpb * 2, ring++) {
        if (ring % every) continue;
        for (const [after, index] of figure) {
          if (at + after >= end - 1e-6) continue;
          notes.push({ t: at + after, dur: Math.min(2.5, end - at - after), midi: voiced[Math.max(0, voiced.length - 1 - index)], vel: after === 0 ? 0.62 : 0.5 });
        }
      }
    }
    return notes;
  },

  keys(c) {
    const { pattern, density } = c.layer;
    const notes = [];
    let previous = null;
    for (const chord of c.chords) {
      const voiced = voiceChord(chord.root, chord.tones, c.center, previous);
      previous = voiced;
      const end = chord.t + chord.dur;
      if (pattern === 'broken') {
        // alberti bass: low, high, middle, high, the classical left hand
        const order = voiced.length >= 3 ? [0, voiced.length - 1, 1, voiced.length - 1] : [0, 1];
        const step = rateStep(c.layer.rate, c.sub);
        let i = 0;
        for (let t = chord.t; t < end - 1e-6; t += step, i++) notes.push({ t, dur: step * 1.6, midi: voiced[order[i % order.length]], vel: i % order.length === 0 ? 0.72 : 0.55 });
      } else if (pattern === 'strum') {
        // the chord at the start of each bar, its notes a moment apart like a guitar
        for (let t = chord.t; t < end - 1e-6; t += c.bpb) {
          voiced.forEach((midi, i) => notes.push({ t: t + i * 0.035, dur: Math.min(c.bpb, end - t) * 0.95, midi, vel: 0.62 - i * 0.03 }));
        }
      } else if (pattern === 'waltz') {
        // oom-pah: the root down low on the first beat, the chord on the others
        const root = near(chord.root, c.center - 12);
        for (let t = chord.t; t < end - 1e-6; t += 1) {
          const beat = Math.round((t - c.start) % c.bpb);
          if (beat === 0 || (c.bpb === 4 && beat === 2)) notes.push({ t, dur: 0.9, midi: root, vel: 0.75 });
          else for (const midi of voiced) notes.push({ t, dur: 0.45, midi, vel: 0.5 });
        }
      } else {
        // block: the chord on the groove's comping rhythm, so it fits round the drums and bass.
        // sparse layers keep only the hits on the beat
        for (const [t, dur, vel] of compHits(c, chord, density)) for (const midi of voiced) notes.push({ t, dur: dur * 0.8, midi, vel });
      }
    }
    return notes;
  },

  pad(c) {
    const { pattern, density } = c.layer;
    const notes = [];
    let previous = null;
    for (const chord of c.chords) {
      const voiced = voiceChord(chord.root, chord.tones, c.center, previous);
      previous = voiced;
      const end = chord.t + chord.dur;
      const hits = [];
      if (pattern === 'swell') for (let t = chord.t; t < end - 1e-6; t += c.bpb) hits.push([t, Math.min(c.bpb, end - t), 0.6]);
      else if (pattern === 'pulse') {
        // the chord over and over, like a steady heartbeat under everything (think steve reich)
        const step = rateStep(c.layer.rate, c.sub);
        for (let t = chord.t; t < end - 1e-6; t += step) hits.push([t, step * 0.55, Math.abs((t - c.start) % 1) < 1e-6 ? 0.62 : 0.48]);
      } else if (pattern === 'stabs') {
        for (const [t, dur, vel] of compHits(c, chord, density)) hits.push([t, Math.min(dur * 0.6, 0.75), vel]);
      } else hits.push([chord.t, chord.dur, 0.6]);
      for (const [t, dur, vel] of hits) for (const midi of voiced) notes.push({ t, dur, midi, vel });
    }
    return notes;
  },

  drone(c) {
    const { pattern } = c.layer;
    const whole = (intervals, from = c.tonic) => intervals.map((interval) => ({ t: c.start, dur: c.end - c.start, midi: from + interval, vel: 0.7 }));
    if (pattern === 'fifths') return whole([0, 7, 12, 19]);
    if (pattern === 'cluster') return whole(c.rng.pick([[0, 1, 7], [0, 6, 7], [0, 1, 5], [0, 3, 6], [0, 11, 13]]));
    if (pattern === 'follow') return c.chords.flatMap((chord) => [0, 7].map((interval) => ({ t: chord.t, dur: chord.dur, midi: near(chord.root, c.center) + interval, vel: 0.7 })));
    return whole([0, 7]);
  },

  bass(c) {
    const { pattern, density } = c.layer;
    const notes = [];
    const add = (t, dur, midi, vel) => notes.push({ t, dur, midi, vel });
    for (const chord of c.chords) {
      const root = near(chord.root, c.center);
      const fifth = root + 7 > c.center + 9 ? root - 5 : root + 7;
      const end = chord.t + chord.dur;
      if (pattern === 'held') add(chord.t, chord.dur * 0.98, root, 0.8);
      else if (pattern === 'pulse' || pattern === 'octave') {
        const step = rateStep(c.layer.rate, c.sub);
        let i = 0;
        for (let t = chord.t; t < end - 1e-6; t += step, i++) add(t, step * 0.8, pattern === 'octave' && i % 2 ? root + 12 : root, i % 2 ? 0.62 : 0.8);
      } else if (pattern === 'rootfifth') {
        for (let bar = chord.t; bar < end - 1e-6; bar += c.bpb) {
          const length = Math.min(c.bpb, end - bar);
          if (c.bpb === 3) {
            add(bar, 0.9, root, 0.82);
            if (length > 1) add(bar + 1, 0.9, fifth, 0.6);
            if (length > 2) add(bar + 2, 0.9, fifth, 0.6);
          } else {
            const half = Math.ceil(c.bpb / 2);
            add(bar, Math.min(half, length) * 0.92, root, 0.82);
            if (length > half) add(bar + half, (length - half) * 0.92, fifth, 0.68);
          }
        }
      } else if (pattern === 'walking') {
        // a note a beat, wandering up the scale and arriving on the next chord's root from a
        // semitone away
        const target = near(nextChord(c, chord).root, c.center);
        let midi = root;
        for (let t = chord.t; t < end - 1e-6; t += 1) {
          const lastBeat = t + 1 >= end - 1e-6;
          if (t > chord.t) {
            if (lastBeat && c.rng.chance(0.75)) midi = target + (c.rng.chance(0.5) ? 1 : -1);
            else {
              const direction = target >= midi ? 1 : -1;
              midi += direction;
              while (!c.scalePcs.has(mod12(midi)) && !chord.pcs.has(mod12(midi))) midi += direction;
            }
          }
          add(t, 0.92, midi, t === chord.t ? 0.82 : 0.66);
        }
      } else {
        // synco: on the groove's kick, so the bass and kick land together (and on its comping hits too
        // when it's busy). which hits go up an octave or to the fifth is picked once for the part
        const { lines, steps, grid } = c.groove;
        const hits = lines.k.map((v, i) => i === 0 || v === 1 || (density > 0.6 && lines.c[i] > 0));
        const leaps = makeRng(c.song.seed, c.layer.seed, 'leaps', c.section.part);
        const shape = hits.map((_, i) => (i === 0 ? 0 : leaps.weighted([[0, 4], [12, 1.5], [7, 1.5]])));
        for (let t = chord.t; t < end - 1e-6; t += grid) {
          const i = stepInBar(c, t);
          // a new chord always gets its root, even off the kick
          if (!hits[i] && t > chord.t + 1e-6) continue;
          add(t, Math.min(gapAfter(hits, i) * grid, end - t) * 0.85, t > chord.t + 1e-6 && shape[i] === 7 ? fifth : root + (t > chord.t + 1e-6 ? shape[i] : 0), i === 0 ? 0.85 : 0.68);
        }
      }
    }
    return notes;
  },

  // drums: the note is which drum (KIT_SLOTS in synth.js): 0 kick, 1 snare, 2 hat, 3 open hat,
  // 4 perc, 5 low perc
  // the part's groove (grooveFor), the same every bar, so it repeats like a real drummer's would.
  // busy adds the soft ghost notes (and fills the hats out to 16ths when it's high).
  // the drummer listens to the band as it plays: its pitched drums are in the song's key (tuneDrum,
  // carried on each note as tune), and with only a few of the others playing (an intro, a break) it
  // plays softer and leaves the ghost notes out. it used to hit as hard under a lone pad as under the
  // whole band
  drums(c) {
    const { pattern, density } = c.layer;
    const { lines, steps, perBeat, grid } = c.groove;
    const notes = [];
    const tunes = (INSTRUMENTS[c.layer.instrument]?.slots || []).map((slot) => slot.tune && tuneDrum(slot.tune, c.song.key));
    const others = c.song.layers.filter((layer) => layer.role !== 'drums' && layer.role !== 'texture');
    const fullness = others.length ? others.filter((layer) => c.section.play.includes(layer.id)).length / others.length : 1;
    const level = 0.7 + 0.3 * fullness;
    const ghosts = density >= 0.35 && fullness >= 0.5;
    const hit = (t, slot, vel) => notes.push({ t, dur: grid, midi: slot, vel: vel * level, ...(tunes[slot] ? { tune: tunes[slot] } : {}) });
    // a fill when the next section is a different part: the last beat on the snare (toms for the
    // quieter patterns), getting louder, then an open hat on the next bar's first beat like a crash
    // the quiet patterns (pulse, sparse) never fill: a drum roll in the middle of a calm song made
    // it jump. brushes fill on the brush, tribal on the toms
    const fill = (LIFTS[pattern] || pattern === 'brush' || pattern === 'tribal') && c.next && c.next.part !== c.section.part && c.vary.chance(0.75);
    const fillDrum = pattern === 'tribal' ? 5 : 1;
    if (LIFTS[pattern] && c.prev && c.prev.part !== c.section.part && c.prev.play.includes(c.layer.id)) hit(c.start, 3, 0.8);
    for (let n = 0; n < c.bars; n++) {
      const bar = c.start + n * c.bpb;
      const fillFrom = fill && n === c.bars - 1 ? steps - perBeat : steps;
      for (let i = 0; i < steps; i++) {
        const t = bar + i * grid;
        const onBeat = i % perBeat === 0;
        if (i >= fillFrom) {
          if (i === fillFrom && lines.k[i]) hit(t, 0, 0.85);
          if (perBeat === 4 && i % 2 && density < 0.5) continue;
          hit(t, fillDrum, 0.4 + 0.5 * ((i - fillFrom + 1) / perBeat));
          continue;
        }
        for (const [name, slot] of Object.entries(GROOVE_SLOTS)) {
          const v = lines[name][i];
          if (!v || (v < 1 && !ghosts)) continue;
          const loud = name === 'h' ? 0.6 : name === 'p' ? 0.55 : 0.88;
          hit(t, slot, (v < 1 ? 0.3 : loud) * (onBeat ? 1 : 0.85));
        }
        if (ghosts && density > 0.72 && perBeat === 4 && i % 2 && !lines.h[i] && lines.h.some((v) => v)) hit(t, 2, 0.24);
      }
    }
    return notes;
  },

  // the note is the song's home note, which the hum and the crickets sing (TEXTURES in synth.js)
  texture(c) {
    return [{ t: c.start, dur: c.end - c.start, midi: near(c.song.key, 60), vel: 1 }];
  },
};
