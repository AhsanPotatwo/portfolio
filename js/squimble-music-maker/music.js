/// ================================== squimble music maker: the composer ==================================
//
// this file writes the music. it's plain maths and plain objects, no page and no audio, so node can
// run it (tests/music-check.js) and squimble quest can load it as it is later. synth.js plays what it
// writes (and holds INSTRUMENTS, which the band is picked from), maker.js is the page.
//
// ---------- how a song works ----------
//
// a song is plain settings, the json that gets saved and shared (cleanSong() has every key):
//   mood, mods, style   what it's written as (MOODS, MODIFIERS, STYLES). mods is only there if it has
//              any: words like calm, fast or jazzy that change how the mood plays (see "modifiers")
//   seed       a word or two. every random choice comes from it, so the same settings always give
//              the same notes and a song file stays tiny
//   key, scale, tempo, meter, swing, humanise, colour (how rich the chords are), chordBars
//   parts      the chords for parts A, B and C, written as roman numerals ("i bVI bIII bVII"), so
//              they work in any key and you can type your own
//   layers     the band. each has a role (pad, bass, melody...), an instrument, a pattern (how the
//              role plays, e.g. a bass walking or holding its roots), its own seed, its mix, and any
//              notes changed by hand (edits). a layer marked hand plays only the notes added by hand
//   own        there on a track made by hand (blankSong()) rather than written from the seed
//   sections   the song from start to end: which part's chords, how many bars, which layers play
//   fx         the room it's played in (reverb, echo, tape wobble...), synth.js
//
// generateSong(mood, style, seed, mods) makes a whole song from a mood, in one of the STYLES (ambient,
// tune, mini boss or boss), changed by any modifiers (songMood() is the mood with them worked in).
// composeSong(song) turns any song into notes. remixing is re-running one of generateSong's pick steps
// with a fresh seed (rerollSong()), and editing is changing the settings by hand. blankSong() is the
// other way in: an empty track whose layers play only what's drawn or played in by hand.
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
//   - melodies are built from one motif (a short rhythm and shape) the way game composers write
//     themes: repeated, sequenced, answered, paired into question and answer phrases, and brought
//     back changed in other parts, landing on chord notes on strong beats (see "melodies", tune())
//   - one groove for the whole band: drum patterns written out by hand like old drum machine charts,
//     with the bass and chord stabs playing the same rhythm, so the parts lock together (GROOVES)
//   - brian eno's tape loops (music for airports): the bells repeat on loops of different lengths, so
//     they drift in and out of line and never line up the same way twice (the "phasing" pattern)
//   - swing and humanising: notes nudged off the grid and played at uneven strengths, which is most
//     of what stops it sounding like a computer (feel)
//   - counterpoint: a second melody written against the first, note by note, in the intervals that
//     blend (thirds and sixths), moving when the tune holds and holding when it moves, the way toby
//     fox stacks two tunes in snowdin or death by glamour (counterpoint())
//   - ornaments: what players do to a note that isn't on the page. slides between notes, a guitarist
//     bending up onto one, a sax falling off the end of a phrase, a fiddler's grace notes, a shake on
//     a long note (ornament()). each instrument says which ones a player of it would use
//   - dynamics: quiet sections played softer and loud ones harder, with a swell into a louder
//     section, the way a band breathes together (feel)
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

// seeds are two words, which also make the song's first name. squimble quest is a child's dream,
// so the words come from every world it could wander into. one row per world, so a new world is a new row
const SEED_WORDS = [
  [
    'mossy', 'amber', 'quiet', 'hollow', 'silver', 'drowsy', 'copper', 'misty', 'wandering', 'paper',
    'velvet', 'frozen', 'sunken', 'golden', 'little', 'crooked', 'distant', 'gentle', 'rusty', 'hidden',
    'lonely', 'starlit', 'smoky', 'tiny', 'ancient', 'sleepy', 'restless', 'pale', 'stormy', 'woolly',
    'dreamy', 'snoozy', 'yawning', 'sleepwalking', 'fuzzy', 'twinkly', 'whispering', 'upside', 'giggling', // dreams
    'neon', 'chrome', 'laser', 'turbo', 'quantum', 'atomic', 'glitchy', 'robotic', 'hologram', 'bleeping', // the future
    'dusty', 'rootin', 'outlaw', 'tumbleweed', 'rattlesnake', 'bandit', 'rodeo', 'galloping', 'sheriff', // wild west
    'shambling', 'undead', 'mouldy', 'groaning', 'creaky', 'haunted', 'spooky', 'ghostly', 'skeletal', // zombies and ghosts
    'ferny', 'leafy', 'twiggy', 'brambly', 'toadstool', 'acorny', 'barky', 'dewy', // the forest
    'scrappy', 'scorched', 'wrecked', 'salvaged', 'glowing', 'junkyard', 'radioactive', 'busted', // the wasteland
    'snowy', 'frosty', 'blizzard', 'shivering', 'chilly', 'glacial', 'icicle', 'mittened', // snowland
    'molten', 'sizzling', 'fiery', 'smouldering', 'blazing', 'volcanic', 'cinder', 'erupting', 'burpy', // lava and volcanoes
    'sandy', 'sunbaked', 'parched', 'mirage', 'scorpion', 'pharaoh', 'shimmering', 'dune', // the desert
    'salty', 'barnacle', 'scurvy', 'swashbuckling', 'cursed', 'jolly', 'briny', 'peglegged', 'plundered', // pirates
    'bubbly', 'coral', 'soggy', 'drippy', 'abyssal', 'snorkelling', 'glowfish', // under the sea
    'cosmic', 'lunar', 'starry', 'orbiting', 'galactic', 'alien', 'nebula', 'zerogravity', // outer space
    'sugary', 'gumdrop', 'fizzy', 'sticky', 'lollipop', 'candied', 'frosted', 'jammy', 'sprinkled', // candy land
    'prehistoric', 'stompy', 'jurassic', 'fossil', 'roaring', 'primordial', // dinosaurs
    'clockwork', 'brass', 'ticking', 'steamy', 'cogwork', 'whirring', // clockwork and steam
    'cloudy', 'floating', 'windy', 'feathery', 'rainbow', 'drifting', // the sky
    'tin', 'windup', 'patchwork', 'rubber', 'button', 'stitched', 'squeaky', // the toybox
    'royal', 'enchanted', 'knightly', 'noble', 'jousting', 'wizardly', 'moonlit', // castles and magic
    'wonky', 'stripy', 'juggling', 'tumbling', 'bonkers', 'loopy', // the circus
    'sneaky', 'shadowy', 'silent', 'bamboo', 'paperlantern', // ninjas
    'squishy', 'gloopy', 'zany', 'kooky', 'wibbly', 'wobbly', 'peculiar', 'grumpy', 'cheeky', 'dizzy', // just silly
    'jiggly', 'hiccuping', 'sneezing', 'ticklish', 'bumbling', 'rumbling', 'tumbledown', 'higgledy', 'noodly', 'wiggly',
  ],
  [
    'lantern', 'meadow', 'harbour', 'burrow', 'comet', 'orchard', 'tide', 'ember', 'willow', 'cavern',
    'chapel', 'garden', 'lighthouse', 'puddle', 'marsh', 'kettle', 'attic', 'glade', 'ridge', 'moth',
    'pond', 'shrine', 'tower', 'river', 'acorn', 'thicket', 'well', 'moon', 'hearth', 'squimble',
    'pillow', 'nightlight', 'blanketfort', 'slumber', 'lullaby', 'sandman', 'daydream', 'bedtime', 'pyjamas', // dreams
    'robot', 'spaceport', 'hoverboard', 'cyborg', 'android', 'mainframe', 'rocket', 'megacity', 'monorail', 'teleporter', // the future
    'saloon', 'cowpoke', 'canyon', 'stagecoach', 'ranch', 'mesa', 'gulch', 'corral', 'lasso', 'prospector', 'goldmine', // wild west
    'zombie', 'graveyard', 'crypt', 'ghoul', 'skeleton', 'bunker', 'tombstone', 'mummy', 'brains', 'werewolf', // zombies and ghosts
    'fern', 'bramble', 'badger', 'hedgehog', 'woodland', 'treehouse', 'mushroom', 'pinecone', 'owl', // the forest
    'scrapheap', 'wasteland', 'rustbucket', 'wreck', 'outpost', 'scavenger', 'jalopy', // the wasteland
    'igloo', 'glacier', 'snowman', 'yeti', 'penguin', 'tundra', 'avalanche', 'sleigh', 'mitten', 'snowglobe', // snowland
    'volcano', 'caldera', 'magma', 'crater', 'geyser', 'forge', 'salamander', 'furnace', 'lavalamp', // lava and volcanoes
    'oasis', 'pyramid', 'sphinx', 'cactus', 'camel', 'sandstorm', 'caravan', 'sarcophagus', // the desert
    'galleon', 'parrot', 'kraken', 'treasure', 'plank', 'cutlass', 'cove', 'shipwreck', 'doubloon', 'crowsnest', 'buccaneer', // pirates
    'reef', 'jellyfish', 'submarine', 'octopus', 'seahorse', 'abyss', 'atlantis', 'mermaid', 'lagoon', // under the sea
    'asteroid', 'galaxy', 'planet', 'ufo', 'moonbase', 'stardust', 'blackhole', 'spacesuit', // outer space
    'cupcake', 'gingerbread', 'jellybean', 'marshmallow', 'toffee', 'pudding', 'sundae', 'custard', 'gobstopper', // candy land
    'dinosaur', 'raptor', 'swamp', 'pterodactyl', 'triceratops', 'tarpit', 'egg', // dinosaurs
    'clocktower', 'cog', 'gizmo', 'zeppelin', 'airship', 'contraption', 'automaton', // clockwork and steam
    'cloud', 'kite', 'balloon', 'beanstalk', 'windmill', 'skyship', // the sky
    'toybox', 'teddy', 'marionette', 'puppet', 'nutcracker', 'yoyo', 'marble', 'dollhouse', // the toybox
    'castle', 'dragon', 'knight', 'wizard', 'goblin', 'troll', 'dungeon', 'drawbridge', 'unicorn', 'potion', 'cauldron', 'griffin', // castles and magic
    'circus', 'carousel', 'clown', 'juggler', 'trapeze', 'funfair', 'rollercoaster', // the circus
    'dojo', 'ninja', 'samurai', 'pagoda', 'shuriken', // ninjas
    'noodle', 'waffle', 'sock', 'spoon', 'pickle', 'whatsit', 'doohickey', 'kerfuffle', 'hullabaloo', 'shenanigans', // just silly
    'jamboree', 'thingamajig', 'gubbins', 'wobble', 'bonanza', 'rumpus',
  ],
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
  // the minor pentatonic with the flat fifth (the "blue note") in it
  blues:            { name: 'Blues',             steps: [0, 3, 5, 6, 7, 10], harmony: 'minor' },
  // a flat second and a flat sixth around a major third and seventh: raga bhairav, the dawn raga, and
  // the most exotic sounding of the scales here
  doubleHarmonic:   { name: 'Double harmonic',   steps: [0, 1, 4, 5, 7, 8, 11] },
  // a gamelan's two tunings, as near as a piano's notes get: pelog (five of its seven, with the flat
  // second and sixth) and slendro (five nearly even steps, here a pentatonic's)
  pelog:            { name: 'Pelog',             steps: [0, 1, 3, 7, 8], harmony: 'phrygian' },
  slendro:          { name: 'Slendro',           steps: [0, 2, 5, 7, 9], harmony: 'major' },
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
  // low: a guitar's chords sit in its bottom strings, power chords from about d2 up
  guitar:  { name: 'Guitar',  colour: '#a8503a', center: 44 },
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
// (the newer ones are added at the end of each list, apart from the counter melody's, whose first is
// its default: a second melody is what a counter melody should be, most of the time)
const PATTERNS = {
  melody:  { phrases: 'Phrases', calls: 'Calls and gaps', long: 'Long notes', riff: 'Riff', fragments: 'Fragments' },
  counter: { counterpoint: 'Second melody', answer: 'Answers', harmony: 'Harmony', free: 'Its own tune' },
  arp:     { up: 'Up', down: 'Down', updown: 'Up and down', converge: 'Inwards', random: 'Random', twinkle: 'Twinkling', roll: 'Banjo roll' },
  bells:   { phasing: 'Drifting loops', sparkle: 'Chimes on the chords' },
  keys:    { broken: 'Broken chords', block: 'Block chords', strum: 'Strummed', waltz: 'Oom-pah', comp: 'Jazz comping', skank: 'Off beat skank', bossa: 'Bossa nova' },
  guitar:  { power: 'Power chords', eighths: 'Eighths', chug: 'Chugging riff', ring: 'Ringing chords', tremolo: 'Tremolo picked', strum: 'Strummed', funk: 'Funk scratch', boomchick: 'Boom chick' },
  pad:     { sustain: 'Held', swell: 'Swells', pulse: 'Pulsing', stabs: 'Stabs', pump: 'Pumping' },
  drone:   { tonic: 'Home note', fifths: 'Open fifths', follow: 'Follows chords', cluster: 'Cluster', cycle: 'Plucked round and round' },
  bass:    { held: 'Held', pulse: 'Pulse', rootfifth: 'Root and fifth', octave: 'Octaves', walking: 'Walking', synco: 'Syncopated', riff: 'Doubles the riff', boogie: 'Boogie' },
  drums:   { groove: 'Groove', halftime: 'Half time', brush: 'Brushes', pulse: 'Pulse', tribal: 'Tribal', march: 'March', sparse: 'Sparse', four: 'Four to the floor', break: 'Breakbeat', rock: 'Rock', punk: 'Punk', double: 'Double kick', breakdown: 'Breakdown', wash: 'Wash',
    swing: 'Swing', bossa: 'Bossa nova', tala: 'Tala', funk: 'Funk', onedrop: 'One drop', train: 'Train beat', shuffle: 'Shuffle',
    boombap: 'Boom bap', trap: 'Trap', maqsum: 'Maqsum', gallop: 'Gallop' },
  texture: { steady: 'Steady' },
};
// the patterns that use a layer's speed (rate)
const USES_RATE = { arp: true, 'bass.pulse': true, 'bass.octave': true, 'pad.pulse': true, 'keys.broken': true };
const usesRate = (layer) => !!(USES_RATE[layer.role] || USES_RATE[`${layer.role}.${layer.pattern}`]);
// the roles that can take a solo (section.lead, addSolo): the ones that play a line or chords up top
const SOLOISTS = { melody: true, counter: true, keys: true, arp: true, bells: true };

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
//   patterns    role patterns it prefers, over STYLE_PATTERNS. 'ambient.guitar' is for ambient songs
//               only, where they'd want something different (a metal song's riff, a drone metal one's
//               ringing chords)
//   swing       chance of swing (none unless it's here: a swung battle theme sounds like a joke)
//   fx          extra wobble or drive
//   opens       the parts that open its songs, most wanted first (pickArrangement): the guitar in a
//               stardew style happy song, the beat in an upbeat one, a drone in an eerie one
//   group       which row of moods it's in on the page (MOOD_GROUPS)
//   ornate      how much its players ornament their notes (slides, bends, graces: ornament()), 1
//               unless it says. a raga or the blues is full of them, a calm ambient song has few
//   swingAmount how far the swing goes when it swings, [low, high], 0.15 to 0.5 unless it says. jazz
//               and the blues swing hard (near 0.67, a triplet feel); lo-fi a little
//   chordBars   how long its chords last, to pick from (a twelve bar blues is a bar a chord)
// and some that only modifiers set (MODIFIERS): most (more or fewer layers than the style's most),
// busy (busier or sparser parts), soft (slower attacks) and reharm (the mood's progressions are
// moved into whatever scale the song picks, see reharmonise())
// and, for the loud and hazy moods (rock, metal, shoegaze), which work differently from the rest:
//   layers      how likely each role is, over LAYER_CHANCE (a rock band has a guitar, and no keys)
//   forms       its song shapes for tunes, over FORMS (verses and choruses)
//   solo        chance of a solo in a tune, over SOLO_CHANCE, and soloOver, the part it solos over
//               (rock solos over the chorus before its last time round, not the verse)
//   quiet, loudQuiet   instruments for a second, cleaner guitar, and the chance of having one: the
//               clean one plays the quiet sections and the loud one stamps in for the loud ones
//   breakdown   part C is a half time breakdown, not a quiet drop (grooveFor)
//   bury        0 to 1, how far the tune sinks into the band: shoegaze buries its singer in the guitars
//   surprise    chance of an instrument from outside the palette (12% unless it says). a kalimba tune
//               in a grunge song is a mistake, not a surprise, so the loud moods have none
// song shapes for the loud and hazy moods (MOODS forms), in FORMS' terms: [name, part, about how many
// bars, energy]. verses and choruses, with the chorus (B) as the loud part
const LOUD_FORMS = [
  [['Intro', 'A', 4, 0.45], ['Verse', 'A', 8, 0.7], ['Chorus', 'B', 8, 1], ['Verse', 'A', 8, 0.72], ['Chorus', 'B', 8, 1], ['Bridge', 'C', 8, 0.6], ['Chorus', 'B', 8, 1], ['Outro', 'B', 4, 0.5]],
  [['Intro', 'A', 4, 0.55], ['Verse', 'A', 8, 0.7], ['Lift', 'C', 4, 0.8], ['Chorus', 'B', 8, 1], ['Verse', 'A', 8, 0.72], ['Lift', 'C', 4, 0.8], ['Chorus', 'B', 8, 1], ['Chorus', 'B', 8, 1], ['Outro', 'A', 4, 0.45]],
  // the chorus's chords loud first, then down for the verse (smells like teen spirit)
  [['Intro', 'B', 4, 0.9], ['Verse', 'A', 8, 0.65], ['Chorus', 'B', 8, 1], ['Verse', 'A', 8, 0.7], ['Chorus', 'B', 8, 1], ['Bridge', 'C', 8, 0.55], ['Chorus', 'B', 8, 1]],
];
// metal: the riff on its own to open, and a heavy break (part C) before the last chorus
const METAL_FORMS = [
  [['Intro', 'A', 4, 0.5], ['Riff', 'A', 8, 0.85], ['Verse', 'A', 8, 0.75], ['Chorus', 'B', 8, 1], ['Riff', 'A', 4, 0.85], ['Verse', 'A', 8, 0.75], ['Chorus', 'B', 8, 1], ['Break', 'C', 8, 0.9], ['Chorus', 'B', 8, 1], ['Outro', 'A', 4, 0.6]],
  [['Intro', 'C', 4, 0.45], ['Riff', 'A', 8, 0.9], ['Verse', 'A', 8, 0.8], ['Chorus', 'B', 8, 1], ['Verse', 'A', 8, 0.8], ['Chorus', 'B', 8, 1], ['Break', 'C', 8, 0.9], ['Riff', 'A', 8, 0.9]],
];
// hardcore: loud nearly all the way, a quiet clean intro, and a breakdown before the last chorus
const HARDCORE_FORMS = [
  [['Intro', 'A', 4, 0.4], ['Verse', 'A', 8, 0.9], ['Chorus', 'B', 8, 1], ['Verse', 'A', 8, 0.9], ['Chorus', 'B', 8, 1], ['Breakdown', 'C', 8, 0.95], ['Chorus', 'B', 8, 1], ['Outro', 'A', 4, 0.4]],
  [['Intro', 'B', 4, 0.95], ['Verse', 'A', 8, 0.85], ['Chorus', 'B', 8, 1], ['Verse', 'A', 8, 0.85], ['Chorus', 'B', 8, 1], ['Breakdown', 'C', 8, 0.95], ['Chorus', 'B', 8, 1]],
];
// shoegaze: a slow start, the wall, a hazy middle, and often a long loud outro of noise
const GAZE_FORMS = [
  [['Intro', 'A', 8, 0.5], ['Verse', 'A', 8, 0.75], ['Chorus', 'B', 8, 1], ['Verse', 'A', 8, 0.75], ['Chorus', 'B', 8, 1], ['Haze', 'C', 8, 0.65], ['Chorus', 'B', 8, 1], ['Outro', 'B', 8, 0.85]],
  [['Intro', 'C', 4, 0.5], ['A', 'A', 8, 0.8], ['B', 'B', 8, 1], ['A', 'A', 8, 0.8], ['B', 'B', 8, 1], ['Haze', 'C', 8, 0.6], ['B', 'B', 16, 1]],
  [['Swell', 'B', 8, 0.6], ['Verse', 'A', 8, 0.75], ['Chorus', 'B', 8, 1], ['Verse', 'A', 8, 0.75], ['Chorus', 'B', 8, 1], ['Wash', 'B', 8, 0.9]],
];

const MOODS = {
  calm: {
    group: 'Gentle',
    opens: ['pad', 'keys', 'drone', 'arp'],
    name: 'Calm', colour: '#9cc5a1', style: 'ambient',
    scales: { major: 3, lydian: 1.5, majorPentatonic: 2, mixolydian: 1 }, tempo: [58, 76], tuneTempo: [78, 96],
    chords: ['I IV', 'I - IV -', 'I vi IV I', 'IV I', 'I iii IV IV', 'Imaj7 IVmaj7', 'ii I', 'I V vi IV'],
    richness: [0.3, 0.75], energy: 0.25, space: 0.65, bright: 0.55, dark: 0.05,
    palette: {
      pad: ['warm-pad', 'glass-pad', 'strings', 'air-pad', 'analog-pad'], melody: ['flute', 'felt-keys', 'ocarina', 'soft-lead', 'pan-flute', 'piano'],
      counter: ['felt-keys', 'harp', 'soft-lead', 'nylon'], keys: ['felt-keys', 'harp', 'e-piano', 'nylon', 'piano'], arp: ['harp', 'kalimba', 'felt-keys', 'nylon'],
      bells: ['glass-bell', 'chime', 'vibes', 'sine-bell'], bass: ['sub-bass', 'round-bass', 'upright'], drone: ['organ-drone', 'deep-drone', 'cello-drone'],
    },
    textures: ['birds', 'ocean', 'crickets', 'rain', 'stream', 'leaves', 'frogs'], kits: ['soft-kit'], drums: [0.1, 0.35],
    patterns: { drums: ['pulse', 'sparse', 'brush'], melody: ['phrases', 'fragments', 'phrases', 'long'] }, ornate: 0.6,
  },
  dreamy: {
    group: 'Gentle',
    opens: ['pad', 'arp', 'keys', 'drone'],
    name: 'Dreamy', colour: '#c3b1ea', style: 'ambient',
    scales: { lydian: 3, major: 1.5, majorPentatonic: 1.5, wholeTone: 0.4 }, tempo: [54, 72], tuneTempo: [76, 94],
    chords: ['I II', 'I iii IV iv', 'IV V iii vi', 'Imaj7 iii vi IVmaj7', 'I II iii II', 'IVmaj7 Imaj7', 'I bVII IV iv'],
    richness: [0.6, 1], energy: 0.2, space: 0.9, bright: 0.6, dark: 0.1,
    palette: {
      pad: ['glass-pad', 'shimmer', 'choir-oo', 'air-pad', 'reverse-piano', 'analog-pad'], melody: ['music-box', 'glass-bell', 'flute', 'whistle', 'sine-bell'],
      counter: ['harp', 'celesta'], keys: ['harp', 'e-piano', 'celesta'], arp: ['harp', 'celesta', 'music-box'],
      bells: ['glass-bell', 'music-box', 'celesta', 'chime', 'sine-bell'], bass: ['sub-bass', 'round-bass'], drone: ['organ-drone', 'deep-drone', 'tape-loop'],
    },
    textures: ['ocean', 'hum', 'drips', 'birds', 'chimes', 'stream'], kits: [], drums: [0, 0], fx: { wobble: 0.3 }, ornate: 0.5,
  },
  heavenly: {
    group: 'Gentle',
    opens: ['pad', 'drone', 'keys'],
    name: 'Heavenly', colour: '#bcdcf2', style: 'ambient',
    scales: { major: 3, lydian: 2, mixolydian: 1 }, tempo: [52, 70], tuneTempo: [70, 90],
    chords: ['I V vi iii IV I IV V', 'I IV I V', 'IV I', 'I bVII IV I', 'I V vi IV', 'IV V vi I', 'I iii vi IV'],
    richness: [0.2, 0.6], energy: 0.2, space: 1, bright: 0.75, dark: 0,
    palette: {
      pad: ['choir-ah', 'organ', 'shimmer', 'strings'], melody: ['choir-oo', 'flute', 'glass-bell', 'violin'],
      counter: ['harp', 'celesta', 'choir-oo'], keys: ['harp', 'celesta', 'organ'], arp: ['harp', 'celesta'],
      bells: ['bell', 'glass-bell', 'celesta', 'chime', 'sine-bell'], bass: ['sub-bass', 'round-bass'], drone: ['organ-drone', 'cello-drone'],
    },
    textures: ['wind', 'birds', 'chimes', 'stream'], kits: [], drums: [0, 0], patterns: { drone: ['fifths', 'tonic'] }, ornate: 0.5,
  },
  // stardew valley's spring and summer: a flute, clarinet or accordion tune over a fingerpicked or
  // strummed guitar, soft strings, a bass bouncing between root and fifth, and a light kit
  happy: {
    group: 'Bright',
    opens: ['keys', 'arp', 'bass', 'pad'],
    name: 'Happy', colour: '#ffcf4d', style: 'tune',
    scales: { major: 4, majorPentatonic: 2, mixolydian: 1 }, tempo: [70, 90], tuneTempo: [100, 124],
    meters: { '4/4': 6, '3/4': 2, '6/8': 2 },
    chords: ['I V vi IV', 'I IV V IV', 'I vi IV V', 'I IV I V', 'I iii IV V', 'vi IV I V', 'I IV vi V', 'I V IV V'],
    richness: [0.1, 0.5], energy: 0.65, space: 0.4, bright: 0.75, dark: 0,
    palette: {
      pad: ['strings', 'warm-pad', 'organ'], melody: ['flute', 'clarinet', 'accordion', 'ocarina', 'whistle', 'marimba', 'pan-flute', 'square-lead', 'pulse-lead'],
      counter: ['marimba', 'clarinet', 'pizzicato', 'nylon'], keys: ['steel-guitar', 'nylon', 'felt-keys', 'e-piano', 'piano'], arp: ['nylon', 'steel-guitar', 'harp', 'kalimba', 'marimba', 'xylophone'],
      bells: ['celesta', 'vibes', 'chime', 'glock', 'xylophone'], bass: ['upright', 'pluck-bass', 'round-bass', 'chip-bass'], drone: ['organ-drone'],
    },
    textures: ['birds', 'crickets', 'stream', 'leaves'], kits: ['soft-kit', 'soft-kit', 'tight-kit', 'chip-kit'], drums: [0.1, 0.85], swing: 0.2,
    patterns: { drums: ['groove', 'groove', 'halftime'], bass: ['rootfifth', 'rootfifth', 'octave', 'held', 'synco'], keys: ['strum', 'broken', 'block'], arp: ['updown', 'up', 'converge'] },
  },
  playful: {
    group: 'Bright',
    opens: ['keys', 'bass', 'arp', 'drums'],
    name: 'Playful', colour: '#f5a3c7', style: 'tune',
    scales: { major: 3, majorPentatonic: 2, lydian: 1, mixolydian: 1 }, tempo: [76, 96], tuneTempo: [108, 132],
    meters: { '4/4': 4, '3/4': 2, '6/8': 3 },
    chords: ['I IV V I', 'I vi ii V', 'I II IV I', 'I bVII IV I', 'IV V I vi', 'I iii IV V', 'I I7 IV iv'],
    richness: [0.1, 0.5], energy: 0.7, space: 0.35, bright: 0.8, dark: 0,
    palette: {
      pad: ['organ', 'warm-pad', 'strings'], melody: ['pizzicato', 'marimba', 'whistle', 'clarinet', 'accordion', 'kalimba', 'square-lead', 'music-box', 'pulse-lead', 'xylophone'],
      counter: ['pizzicato', 'clarinet', 'kalimba', 'celesta', 'xylophone'], keys: ['marimba', 'felt-keys', 'steel-guitar', 'music-box', 'xylophone'], arp: ['kalimba', 'pizzicato', 'nylon', 'celesta', 'xylophone'],
      bells: ['celesta', 'music-box', 'chime', 'glock'], bass: ['pluck-bass', 'upright', 'round-bass', 'chip-bass', 'tuba'], drone: ['organ-drone'],
    },
    textures: ['birds', 'crickets', 'stream'], kits: ['clockwork', 'tight-kit', 'soft-kit', 'chip-kit'], drums: [0.1, 0.85], swing: 0.35,
    patterns: { drums: ['groove', 'march'], bass: ['octave', 'rootfifth', 'walking'], keys: ['waltz', 'block', 'broken'], melody: ['phrases', 'calls', 'riff'] },
  },
  // undertale, deltarune, terraria: chip leads and a bouncing bass under a tune you can't get out of
  // your head, with the odd jazzy or borrowed chord (deltarune leans on the "royal road", IV V iii vi)
  spirited: {
    group: 'Bright',
    opens: ['arp', 'bass', 'keys', 'drums'],
    name: 'Spirited', colour: '#4fb0e8', style: 'tune',
    scales: { major: 3, mixolydian: 1, dorian: 1.5, minor: 1.2, majorPentatonic: 1 }, tempo: [76, 96], tuneTempo: [112, 148],
    meters: { '4/4': 6, '3/4': 1, '6/8': 1.5 },
    chords: ['I V vi IV', 'IVmaj7 V7 iii vi', 'i bVI bVII i', 'i bVII bVI bVII', 'vi IV I V', 'I iii IV iv', 'ii V I vi', 'I bVII IV I', 'IV V iii vi'],
    richness: [0.2, 0.65], energy: 0.75, space: 0.4, bright: 0.75, dark: 0.1, edge: 0.85, swing: 0.15,
    palette: {
      pad: ['strings', 'organ', 'warm-pad'], melody: ['pulse-lead', 'square-lead', 'pan-flute', 'synth-brass', 'felt-keys'],
      counter: ['pulse-lead', 'nylon', 'marimba'], keys: ['felt-keys', 'nylon', 'e-piano', 'piano'], arp: ['pulse-lead', 'square-lead', 'nylon', 'kalimba', 'harp', 'xylophone'],
      bells: ['celesta', 'glass-bell', 'music-box'], bass: ['chip-bass', 'pluck-bass', 'upright', 'round-bass'], drone: ['organ-drone'],
    },
    textures: ['birds'], kits: ['chip-kit', 'tight-kit'], drums: [0.15, 0.95],
    patterns: { drums: ['groove', 'march', 'break', 'groove'], bass: ['octave', 'walking', 'synco', 'rootfifth'], melody: ['phrases', 'riff', 'phrases', 'calls'] },
  },
  upbeat: {
    group: 'Bright',
    opens: ['drums', 'bass', 'keys', 'arp'],
    name: 'Upbeat', colour: '#ff8f45', style: 'tune',
    scales: { major: 2, mixolydian: 2, dorian: 2, majorPentatonic: 1, minorPentatonic: 1 }, tempo: [84, 100], tuneTempo: [118, 142],
    meters: { '4/4': 8, '6/8': 1 },
    chords: ['I V vi IV', 'I bVII IV I', 'vi IV I V', 'I IV vi V', 'i bVII bVI bVII', 'ii V I I', 'I iii vi IV'],
    richness: [0.2, 0.6], energy: 0.9, space: 0.35, bright: 0.8, dark: 0,
    palette: {
      pad: ['warm-pad', 'strings', 'shimmer', 'analog-pad'], melody: ['saw-lead', 'square-lead', 'pluck-lead', 'whistle', 'synth-brass', 'pulse-lead'],
      counter: ['pluck-lead', 'e-piano', 'marimba'], keys: ['e-piano', 'felt-keys', 'steel-guitar', 'wurlitzer'], arp: ['pluck-lead', 'kalimba', 'e-piano', 'saw-lead', 'steel-guitar'],
      bells: ['vibes', 'chime'], bass: ['synth-bass', 'pluck-bass', 'growl-bass', '808-bass'], drone: ['deep-drone'],
    },
    textures: [], kits: ['tight-kit', 'lofi-kit', 'club-kit'], drums: [0.15, 0.95], edge: 1,
    patterns: { bass: ['octave', 'synco', 'pulse', 'rootfifth'], drums: ['groove', 'groove', 'halftime', 'four', 'break'] },
  },
  cozy: {
    group: 'Bright',
    opens: ['keys', 'bass', 'pad'],
    name: 'Cozy', colour: '#c9875f', style: 'tune',
    scales: { major: 2, mixolydian: 1, dorian: 2, majorPentatonic: 1 }, tempo: [62, 78], tuneTempo: [72, 92],
    chords: ['Imaj7 vi ii V7', 'I IV iii vi ii V', 'IVmaj7 iii ii Imaj7', 'I vi ii V', 'ii V7 Imaj7 -', 'Imaj7 IVmaj7', 'vi ii V7 Imaj7'],
    richness: [0.6, 1], energy: 0.45, space: 0.45, bright: 0.4, dark: 0.05, swing: 0.8,
    palette: {
      pad: ['warm-pad', 'organ', 'strings'], melody: ['e-piano', 'felt-keys', 'flute', 'vibes', 'soft-lead', 'nylon', 'clarinet', 'piano', 'mute-trumpet', 'wurlitzer'],
      counter: ['felt-keys', 'vibes', 'harp', 'nylon'], keys: ['e-piano', 'felt-keys', 'nylon', 'piano', 'jazz-guitar', 'wurlitzer'], arp: ['e-piano', 'harp', 'vibes', 'nylon'],
      bells: ['vibes', 'chime'], bass: ['upright', 'round-bass', 'sub-bass'], drone: ['organ-drone'],
    },
    textures: ['vinyl', 'fire', 'rain'], kits: ['brushes'], drums: [0.05, 0.55],
    patterns: { bass: ['walking', 'rootfifth', 'held'], drums: ['brush'], keys: ['strum', 'block', 'broken'] }, fx: { wobble: 0.5 },
  },
  wistful: {
    group: 'Gentle',
    opens: ['keys', 'pad', 'arp'],
    name: 'Wistful', colour: '#e3b3a0', style: 'ambient',
    scales: { mixolydian: 1.5, dorian: 2, major: 1.5, majorPentatonic: 1 }, tempo: [56, 72], tuneTempo: [74, 94],
    chords: ['I iii IV iv', 'IV iv I', 'I V vi iii IV I IV V', 'vi IV I V', 'I bVII IV I', 'Imaj7 IVmaj7 iii vi', 'IV I V vi', 'I III IV iv'],
    richness: [0.4, 0.85], energy: 0.35, space: 0.7, bright: 0.45, dark: 0.15,
    palette: {
      pad: ['strings', 'warm-pad', 'glass-pad', 'choir-oo', 'analog-pad', 'reverse-piano'], melody: ['music-box', 'e-piano', 'celesta', 'flute', 'violin', 'nylon', 'piano'],
      counter: ['harp', 'felt-keys', 'celesta'], keys: ['felt-keys', 'e-piano', 'harp', 'piano', 'wurlitzer'], arp: ['harp', 'music-box', 'celesta'],
      bells: ['music-box', 'celesta', 'glass-bell'], bass: ['round-bass', 'sub-bass', 'upright'], drone: ['cello-drone', 'organ-drone', 'tape-loop'],
    },
    textures: ['vinyl', 'rain', 'birds', 'leaves', 'chimes'], kits: ['brushes'], drums: [0.05, 0.45],
    patterns: { drums: ['brush', 'sparse'], melody: ['fragments', 'phrases', 'long'] }, fx: { wobble: 0.45 }, ornate: 0.8,
  },
  sad: {
    group: 'Dark',
    opens: ['pad', 'keys', 'drone'],
    name: 'Sad', colour: '#6b95d8', style: 'ambient',
    scales: { minor: 3, dorian: 1.5, harmonicMinor: 0.7, minorPentatonic: 1 }, tempo: [52, 70], tuneTempo: [66, 88],
    chords: ['i bVI bIII bVII', 'i iv bVI V', 'vi IV I V', 'i bVII bVI bVII', 'i iv i v', 'i - bVI -', 'iv i', 'i bVI iv V', 'i bIII bVII iv'],
    richness: [0.3, 0.8], energy: 0.3, space: 0.7, bright: 0.35, dark: 0.3,
    palette: {
      pad: ['strings', 'warm-pad', 'choir-oo', 'dark-pad', 'fuzz-wall', 'reverse-piano'], melody: ['felt-keys', 'violin', 'flute', 'e-piano', 'music-box', 'piano'],
      counter: ['felt-keys', 'harp', 'violin'], keys: ['felt-keys', 'harp', 'e-piano', 'piano'], arp: ['harp', 'felt-keys'],
      bells: ['glass-bell', 'music-box'], bass: ['sub-bass', 'round-bass', 'upright', 'chorus-bass'], drone: ['cello-drone', 'deep-drone'],
    },
    textures: ['rain', 'vinyl', 'wind', 'owl'], kits: ['soft-kit', 'brushes'], drums: [0.05, 0.4], patterns: { drums: ['sparse', 'pulse', 'brush'] },
  },
  // have a nice life: a slow wall of fuzz, a lone chanted line, a cheap drum machine in a huge room,
  // all of it worn and washed out. serious rather than sad
  bleak: {
    group: 'Dark',
    opens: ['pad', 'drone', 'bass'],
    name: 'Bleak', colour: '#6f7d8c', style: 'ambient',
    scales: { minor: 3, dorian: 1.5, phrygian: 1 }, tempo: [50, 68], tuneTempo: [72, 92],
    chords: ['i bVI bIII bVII', 'i - bVI -', 'i v bVI iv', 'i bVII', 'i - - - bVI - - -', 'iv i', 'i bIII iv bVI', 'i bVI'],
    methods: { bank: 5, markov: 1, vamp: 2 },
    richness: [0.15, 0.5], energy: 0.4, space: 1, bright: 0.3, dark: 0.55,
    palette: {
      pad: ['fuzz-wall', 'choir-ah', 'choir-oo', 'dark-pad'], melody: ['violin', 'whistle', 'felt-keys', 'nylon', 'choir-oo'],
      counter: ['strings', 'felt-keys', 'nylon'], keys: ['felt-keys', 'e-piano', 'nylon'], arp: ['nylon', 'felt-keys', 'sine-bell'],
      bells: ['sine-bell', 'glass-bell'], bass: ['chorus-bass', 'sub-bass', 'round-bass'], drone: ['deep-drone', 'cello-drone', 'organ-drone', 'tape-loop'],
    },
    textures: ['vinyl', 'rain', 'hum'], kits: ['machine'], drums: [0.35, 0.8],
    patterns: { drums: ['halftime', 'pulse', 'groove'], melody: ['long', 'phrases', 'fragments'], bass: ['held', 'pulse', 'rootfifth'], pad: ['sustain', 'swell'] },
    fx: { wobble: 0.35, drive: 0.25 },
  },
  mysterious: {
    group: 'Dark',
    opens: ['drone', 'pad', 'arp'],
    name: 'Mysterious', colour: '#8b6fd0', style: 'ambient',
    scales: { dorian: 2, phrygian: 1.5, harmonicMinor: 1, hirajoshi: 1.2, inSen: 1, minor: 1 }, tempo: [56, 76], tuneTempo: [80, 104],
    chords: ['i bII', 'i IV', 'i bVII bVI bVII', 'i v iv i', 'i bIII bVII iv', 'i - bII -', 'i IV i bVII', 'i bVI'],
    methods: { bank: 4, markov: 2, vamp: 3 },
    richness: [0.4, 0.9], energy: 0.35, space: 0.8, bright: 0.45, dark: 0.45,
    palette: {
      pad: ['choir-oo', 'air-pad', 'glass-pad', 'dark-pad'], melody: ['kalimba', 'flute', 'glass-bell', 'ocarina', 'whistle'],
      counter: ['kalimba', 'harp', 'pizzicato'], keys: ['harp', 'kalimba', 'celesta', 'harpsichord'], arp: ['kalimba', 'harp', 'marimba'],
      bells: ['glass-bell', 'bell', 'chime', 'metal-ping', 'sine-bell'], bass: ['sub-bass', 'pluck-bass', 'upright'], drone: ['deep-drone', 'void', 'cello-drone', 'tape-loop'],
    },
    textures: ['drips', 'crickets', 'hum', 'wind', 'owl', 'frogs'], kits: ['clockwork', 'heartbeat'], drums: [0.15, 0.6], patterns: { drums: ['sparse', 'pulse'] },
  },
  deep: {
    group: 'Gentle',
    opens: ['drone', 'pad', 'bass'],
    name: 'Deep', colour: '#2f9db0', style: 'ambient',
    scales: { lydian: 1.5, dorian: 2, majorPentatonic: 1, minor: 1.5 }, tempo: [48, 66], tuneTempo: [70, 90],
    chords: ['i bVII', 'I II', 'i iv', 'Imaj7 bVII', 'i bVI bVII i', 'IVmaj7 Imaj7', 'i - iv -'],
    richness: [0.5, 1], energy: 0.2, space: 1, bright: 0.25, dark: 0.35,
    palette: {
      pad: ['warm-pad', 'glass-pad', 'air-pad', 'dark-pad', 'analog-pad'], melody: ['vibes', 'glass-bell', 'soft-lead', 'whistle', 'sine-bell'],
      counter: ['vibes', 'harp'], keys: ['vibes', 'e-piano', 'harp'], arp: ['vibes', 'glass-bell', 'harp'],
      bells: ['glass-bell', 'vibes', 'chime', 'sine-bell'], bass: ['sub-bass', 'round-bass'], drone: ['deep-drone', 'void', 'organ-drone', 'tape-loop'],
    },
    textures: ['ocean', 'drips', 'hum', 'rumble', 'stream'], kits: ['heartbeat', 'soft-kit'], drums: [0.08, 0.35], patterns: { drums: ['pulse'] }, fx: { wobble: 0.25 },
  },
  tense: {
    group: 'Dark',
    opens: ['pad', 'bass', 'drone', 'drums'],
    name: 'Tense', colour: '#c4573a', style: 'tune',
    scales: { phrygian: 2, harmonicMinor: 2, minor: 1.5, locrian: 0.5, hungarianMinor: 1 }, tempo: [70, 92], tuneTempo: [96, 132],
    chords: ['i bII', 'i - bII -', 'i iv bII V', 'i bVI V', 'i bII i bVII', 'i iv bVI V', 'i v bVI bII'],
    methods: { bank: 5, markov: 1, vamp: 2, chromatic: 1 },
    richness: [0.2, 0.6], energy: 0.65, space: 0.5, bright: 0.4, dark: 0.65,
    palette: {
      pad: ['strings', 'dark-pad', 'haunted-pad', 'analog-pad'], melody: ['violin', 'saw-lead', 'horn', 'pluck-lead', 'synth-brass'],
      counter: ['pizzicato', 'pluck-lead', 'strings'], keys: ['felt-keys', 'pizzicato', 'harp', 'harpsichord'], arp: ['pluck-lead', 'pizzicato', 'saw-lead', 'marimba', 'harpsichord'],
      bells: ['bell', 'glass-bell', 'metal-ping'], bass: ['synth-bass', 'sub-bass', 'growl-bass', 'reese'], drone: ['deep-drone', 'cello-drone', 'bowed-metal'],
    },
    textures: ['rumble', 'hum', 'creaks', 'geiger'], kits: ['heartbeat', 'clockwork', 'taiko', 'machine'], drums: [0.3, 0.9], edge: 0.9,
    patterns: { bass: ['pulse', 'synco', 'octave'], drums: ['pulse', 'tribal', 'halftime', 'sparse'], pad: ['sustain', 'pulse'] },
  },
  angry: {
    group: 'Dark',
    opens: ['drums', 'bass', 'pad'],
    name: 'Angry', colour: '#e04646', style: 'tune',
    scales: { harmonicMinor: 2, phrygian: 1.5, phrygianDominant: 1.5, minor: 2, hungarianMinor: 0.7 }, tempo: [80, 100], tuneTempo: [132, 168],
    meters: { '4/4': 6, '6/8': 2, '5/4': 0.5 },
    chords: ['i bVI bVII i', 'i bII i bVII', 'i iv V i', 'i bVI bIII bVII', 'i - bVI V', 'i bVII bVI V', 'i iv bVI bVII'],
    richness: [0.1, 0.4], energy: 1, space: 0.35, bright: 0.65, dark: 0.5,
    palette: {
      pad: ['strings', 'dark-pad', 'choir-ah'], melody: ['saw-lead', 'horn', 'violin', 'square-lead', 'bit-lead'],
      counter: ['horn', 'strings', 'pluck-lead'], keys: ['pizzicato', 'felt-keys'], arp: ['saw-lead', 'pluck-lead', 'pizzicato'],
      bells: ['bell'], bass: ['growl-bass', 'synth-bass', 'pluck-bass', 'reese'], drone: ['deep-drone', 'cello-drone'],
    },
    textures: ['rumble', 'fire'], kits: ['taiko', 'tight-kit', 'lofi-kit', 'club-kit'], drums: [0.3, 1], edge: 1,
    patterns: { bass: ['octave', 'pulse', 'synco'], drums: ['tribal', 'march', 'groove', 'break'], pad: ['sustain', 'stabs', 'pulse'] }, fx: { drive: 0.45 },
  },
  // crystal castles, and the synths of dying light: dark and serious, a crushed chip lead over pumping
  // pads, octave bass and a club kick. as ambient it's the slower night drive, arps pulsing under pads
  neon: {
    group: 'Electronic',
    opens: ['pad', 'arp', 'bass', 'drums'],
    name: 'Neon', colour: '#d43fb4', style: 'tune',
    scales: { minor: 3, phrygian: 1, dorian: 1, harmonicMinor: 1 }, tempo: [80, 100], tuneTempo: [124, 140],
    meters: { '4/4': 1 },
    chords: ['i bVI bIII bVII', 'i - bVI -', 'i bVII bVI bVII', 'i iv', 'i bIII bVII iv', 'i v bVI iv', 'i - bII -', 'i bVI iv V'],
    methods: { bank: 5, markov: 1, vamp: 2 },
    richness: [0.1, 0.45], energy: 0.85, space: 0.6, bright: 0.6, dark: 0.6, edge: 1,
    palette: {
      pad: ['analog-pad', 'dark-pad', 'choir-ah', 'glass-pad'], melody: ['bit-lead', 'pulse-lead', 'saw-lead', 'sine-bell'],
      counter: ['pluck-lead', 'pulse-lead', 'synth-brass'], keys: ['e-piano', 'pluck-lead'], arp: ['pluck-lead', 'pulse-lead', 'sine-bell', 'saw-lead'],
      bells: ['sine-bell', 'glass-bell'], bass: ['synth-bass', 'reese', 'growl-bass', 'sub-bass', '808-bass'], drone: ['deep-drone', 'void'],
    },
    textures: ['hum', 'vinyl'], kits: ['club-kit', 'machine', 'chip-kit'], drums: [0.35, 1],
    patterns: { drums: ['four', 'four', 'break', 'halftime'], pad: ['pump', 'pump', 'sustain'], bass: ['octave', 'synco', 'pulse'], melody: ['riff', 'phrases', 'riff'] },
    fx: { drive: 0.35 },
  },
  eerie: {
    group: 'Dark',
    opens: ['drone', 'pad'],
    name: 'Eerie', colour: '#9fcf4f', style: 'ambient',
    scales: { phrygian: 1.5, locrian: 1.5, hungarianMinor: 1.5, wholeTone: 1, inSen: 1, harmonicMinor: 1 }, tempo: [44, 64], tuneTempo: [70, 96],
    chords: ['i bII', 'i #iv°', 'i bvi', 'i - #iv -', 'i III', 'i bII bvii', 'i vii°'],
    methods: { chromatic: 4, bank: 3, vamp: 1 },
    richness: [0.4, 1], energy: 0.2, space: 0.9, bright: 0.3, dark: 1,
    palette: {
      pad: ['haunted-pad', 'dark-pad', 'choir-oo', 'air-pad', 'reverse-piano'], melody: ['music-box', 'glass-bell', 'whistle', 'violin', 'harpsichord'],
      counter: ['music-box', 'celesta', 'bowed-metal'], keys: ['music-box', 'celesta', 'felt-keys', 'harpsichord'], arp: ['music-box', 'celesta', 'glass-bell'],
      bells: ['bell', 'glass-bell', 'music-box', 'metal-ping'], bass: ['sub-bass', 'deep-drone'], drone: ['void', 'bowed-metal', 'deep-drone', 'cello-drone', 'tape-loop'],
    },
    textures: ['creaks', 'drips', 'hum', 'geiger'], kits: ['heartbeat', 'clockwork'], drums: [0.15, 0.4],
    patterns: { drone: ['cluster', 'tonic', 'cluster'], drums: ['pulse', 'sparse'], melody: ['long', 'phrases', 'fragments'] },
  },
  // fallout 1 and 2, and aphex twin's darker ambient: a wasteland after it all ended. low drones and
  // bowed metal, a lone plucked or bell line with long silences, pipes pinging, a geiger counter
  desolate: {
    group: 'Dark',
    opens: ['drone', 'pad'],
    name: 'Desolate', colour: '#a8925f', style: 'ambient',
    scales: { minor: 2, phrygian: 1.5, dorian: 1.5, hungarianMinor: 0.5 }, tempo: [48, 66], tuneTempo: [70, 92],
    chords: ['i - bVI -', 'i bII', 'i v', 'i bVII bVI bVII', 'i - iv -', 'i bVI', 'i - - - bII - - -'],
    methods: { bank: 4, vamp: 3, chromatic: 1 },
    richness: [0.2, 0.7], energy: 0.25, space: 0.95, bright: 0.3, dark: 0.75, edge: 0.8,
    palette: {
      pad: ['dark-pad', 'reverse-piano', 'analog-pad', 'haunted-pad'], melody: ['nylon', 'sine-bell', 'felt-keys', 'whistle'],
      counter: ['nylon', 'felt-keys', 'metal-ping'], keys: ['felt-keys', 'nylon', 'e-piano'], arp: ['nylon', 'sine-bell', 'felt-keys'],
      bells: ['metal-ping', 'sine-bell', 'glass-bell'], bass: ['sub-bass', 'reese', 'round-bass'], drone: ['bowed-metal', 'deep-drone', 'tape-loop', 'void'],
    },
    textures: ['geiger', 'creaks', 'drips', 'wind'], kits: ['machine', 'heartbeat'], drums: [0.12, 0.5],
    patterns: { drums: ['sparse', 'pulse'], melody: ['fragments', 'long', 'fragments'], drone: ['tonic', 'cluster', 'fifths'], bells: ['phasing', 'sparkle'] },
    fx: { wobble: 0.2 },
  },
  heroic: {
    group: 'Bright',
    opens: ['drums', 'pad', 'bass'],
    name: 'Heroic', colour: '#d4a13a', style: 'tune',
    scales: { mixolydian: 2, major: 2, minor: 1.5, dorian: 1 }, tempo: [66, 84], tuneTempo: [92, 124],
    meters: { '4/4': 6, '3/4': 1, '6/8': 2 },
    chords: ['I bVII IV I', 'i bVI bIII bVII', 'I V vi IV', 'IV V iii vi', 'I bVI bVII I', 'i bVI bVII i', 'I IV V I', 'I iii IV V'],
    richness: [0.1, 0.45], energy: 0.8, space: 0.6, bright: 0.65, dark: 0.2,
    palette: {
      pad: ['strings', 'choir-ah', 'warm-pad', 'organ', 'brass-section'], melody: ['horn', 'violin', 'flute', 'saw-lead', 'synth-brass', 'trumpet'],
      counter: ['horn', 'strings', 'violin'], keys: ['harp', 'pizzicato', 'felt-keys'], arp: ['harp', 'pizzicato', 'pluck-lead'],
      bells: ['bell', 'chime'], bass: ['pluck-bass', 'synth-bass', 'round-bass'], drone: ['cello-drone', 'organ-drone'],
    },
    textures: ['wind'], kits: ['taiko', 'tight-kit'], drums: [0.2, 0.95], edge: 0.9,
    patterns: { drums: ['march', 'tribal', 'groove'], bass: ['octave', 'rootfifth', 'pulse'] },
  },

  // ---------- loud: rock and metal ----------
  // the guitar is the band here (the guitar role, and synth.js's rigs). there are no words, so the
  // tune is a lead guitar or a wordless voice standing in for the singer, and solos come often

  // doom (1993): bobby prince's metal, after metallica, pantera and slayer. a palm muted low string
  // chugging under a riff that walks down the scale (riff()), double kick and a crash every phrase,
  // the bass doubling the riff, twin guitars in harmony, and a solo screaming over the last chorus.
  // as ambient it's drone metal: chords left ringing through fuzz, slowly
  metal: {
    group: 'Loud', opens: ['guitar', 'drums', 'bass'],
    name: 'Metal', colour: '#9c2f2f', style: 'tune',
    scales: { phrygian: 2, minor: 2, harmonicMinor: 1, minorPentatonic: 1, locrian: 0.3 }, tempo: [56, 76], tuneTempo: [118, 172],
    meters: { '4/4': 8, '6/8': 1 },
    chords: ['i - - bII', 'i - bVI bVII', 'i bII i bVII', 'i - bIII bII', 'i bVI bIII bVII', 'i - iv bVI', 'i - bVI V', 'i bVII bVI bVII'],
    methods: { bank: 6, vamp: 2, markov: 0.5 },
    richness: [0, 0.15], energy: 1, space: 0.35, bright: 0.6, dark: 0.7, edge: 1.25, surprise: 0,
    palette: {
      guitar: ['metal-guitar'], melody: ['metal-lead', 'lead-guitar'], counter: ['lead-guitar', 'metal-lead'],
      pad: ['dark-pad', 'choir-ah', 'strings'], keys: ['felt-keys'], arp: ['pluck-lead'], bells: ['bell'],
      bass: ['pick-bass', 'growl-bass'], drone: ['deep-drone', 'bowed-metal'],
    },
    textures: ['feedback', 'rumble'], kits: ['metal-kit'], drums: [0.5, 1],
    layers: { guitar: 1, keys: 0, arp: 0.05, pad: 0.2, counter: 0.35, bells: 0.05, drone: 0.15, texture: 0.15 },
    patterns: { guitar: ['chug', 'chug', 'power'], 'ambient.guitar': ['ring', 'tremolo'], drums: ['double', 'rock', 'punk', 'double'], 'ambient.drums': ['halftime', 'sparse'], bass: ['riff', 'riff', 'pulse'], counter: ['harmony'], melody: ['phrases', 'riff', 'calls'] },
    forms: METAL_FORMS, solo: 0.9, soloOver: 'B', breakdown: true, fx: { drive: 0.15 },
  },
  // black sabbath, sleep, electric wizard, and the slower, heavier side of doom: a riff so slow and
  // fuzzed it's more a weight than a tune, the devil's interval (a flat fifth) in the chords, a
  // drummer laying back on huge cymbals, and the bass fuzzed along with the guitar
  sludge: {
    group: 'Loud', opens: ['guitar', 'drums', 'bass'],
    name: 'Sludge', colour: '#7a6232', style: 'tune',
    scales: { minor: 2, phrygian: 1.5, minorPentatonic: 2, dorian: 0.5 }, tempo: [44, 60], tuneTempo: [56, 84],
    meters: { '4/4': 6, '6/8': 2, '3/4': 1 },
    chords: ['i - - bVII', 'i - bV -', 'i bVII bVI bVII', 'i - bVI -', 'i - iv -', 'i bIII bVII i', 'i - bII -'],
    methods: { bank: 6, vamp: 2 },
    richness: [0, 0.15], energy: 0.85, space: 0.6, bright: 0.35, dark: 0.75, edge: 1, surprise: 0,
    palette: {
      guitar: ['sludge-guitar', 'fuzz-guitar'], melody: ['fuzz-lead', 'rasp-voice', 'lead-guitar'], counter: ['fuzz-lead', 'lead-guitar'],
      pad: ['fuzz-wall', 'dark-pad', 'organ'], keys: ['organ'], arp: ['fuzz-lead'], bells: ['bell'],
      bass: ['fuzz-bass', 'pick-bass'], drone: ['deep-drone', 'bowed-metal'],
    },
    textures: ['feedback', 'rumble', 'vinyl'], kits: ['rock-kit'], drums: [0.4, 1],
    layers: { guitar: 1, keys: 0.05, arp: 0, pad: 0.3, counter: 0.15, bells: 0.05, drone: 0.3, texture: 0.3 },
    patterns: { guitar: ['chug', 'ring', 'chug'], 'ambient.guitar': ['ring'], drums: ['halftime', 'rock', 'breakdown'], 'ambient.drums': ['halftime', 'sparse'], bass: ['riff', 'held', 'riff'], melody: ['long', 'phrases'] },
    forms: LOUD_FORMS, solo: 0.7, soloOver: 'B', fx: { wobble: 0.15, drive: 0.25 },
  },
  // nirvana, hole, alice in chains: a quiet verse on a clean or chorused guitar, then a distortion
  // pedal stamped on for the chorus (loud, quiet, loud), power chords sliding round a minor or bluesy
  // key, a rasping voice, a drummer hitting as hard as they can, and a solo that's half noise
  grunge: {
    group: 'Loud', opens: ['guitar', 'bass', 'drums'],
    name: 'Grunge', colour: '#7e8b4a', style: 'tune',
    scales: { minor: 2, dorian: 1.5, minorPentatonic: 1.5, mixolydian: 1, phrygian: 0.5 }, tempo: [62, 80], tuneTempo: [96, 132],
    meters: { '4/4': 8, '3/4': 1, '6/8': 1 },
    chords: ['i iv bIII bVI', 'i bVII bVI bVII', 'i bIII bVII iv', 'i - bVI bVII', 'i v bVI iv', 'i bII bIII bII', 'I bIII IV bVI', 'i iv bVII bIII'],
    richness: [0, 0.3], energy: 0.9, space: 0.4, bright: 0.5, dark: 0.45, edge: 1, surprise: 0,
    palette: {
      guitar: ['dist-guitar', 'drive-guitar', 'fuzz-guitar'], melody: ['rasp-voice', 'lead-guitar', 'fuzz-lead'], counter: ['lead-guitar', 'chorus-guitar', 'fuzz-lead', 'clean-guitar'],
      pad: ['fuzz-wall', 'strings', 'organ'], keys: ['chorus-guitar', 'clean-guitar'], arp: ['chorus-guitar', 'clean-guitar'], bells: ['glass-bell'],
      bass: ['pick-bass', 'fuzz-bass'], drone: ['deep-drone'],
    },
    quiet: ['chorus-guitar', 'clean-guitar', 'crunch-guitar'], loudQuiet: 0.85,
    textures: ['feedback', 'hum'], kits: ['rock-kit'], drums: [0.4, 1],
    layers: { guitar: 1, keys: 0, arp: 0.2, pad: 0.15, counter: 0.25, bells: 0.03, drone: 0.05, texture: 0.25 },
    patterns: { guitar: ['power', 'power', 'eighths', 'ring'], 'ambient.guitar': ['ring', 'tremolo'], drums: ['rock', 'rock', 'halftime'], 'ambient.drums': ['halftime', 'sparse'], bass: ['synco', 'pulse', 'rootfifth'], melody: ['phrases', 'calls', 'phrases'] },
    forms: LOUD_FORMS, solo: 0.7, soloOver: 'B', fx: { drive: 0.15 },
  },
  // weezer, the smashing pumpkins, dinosaur jr: a big muff fuzz on power chords chugging in eighths,
  // a sweet major key tune over the top, a fuzz solo, and now and then a quiet verse before the wall
  // comes back
  altrock: {
    group: 'Loud', opens: ['guitar', 'drums', 'bass'],
    name: 'Alt rock', colour: '#2f6fbf', style: 'tune',
    scales: { major: 3, mixolydian: 2, majorPentatonic: 1, dorian: 1 }, tempo: [70, 90], tuneTempo: [112, 148],
    meters: { '4/4': 8, '3/4': 1 },
    chords: ['I V vi IV', 'I IV V IV', 'I bVII IV I', 'I iii IV V', 'vi IV I V', 'I V IV IV', 'I IV bVII IV', 'IV I V vi'],
    richness: [0.05, 0.35], energy: 0.9, space: 0.4, bright: 0.65, dark: 0.15, edge: 1, surprise: 0,
    palette: {
      guitar: ['fuzz-guitar', 'drive-guitar', 'crunch-guitar'], melody: ['fuzz-lead', 'lead-guitar', 'rasp-voice'], counter: ['lead-guitar', 'chorus-guitar', 'fuzz-lead'],
      pad: ['strings', 'organ', 'warm-pad'], keys: ['clean-guitar', 'e-piano'], arp: ['clean-guitar', 'chorus-guitar'], bells: ['glass-bell', 'chime'],
      bass: ['pick-bass', 'fuzz-bass'], drone: ['organ-drone'],
    },
    quiet: ['clean-guitar', 'chorus-guitar', 'crunch-guitar'], loudQuiet: 0.35,
    textures: ['feedback'], kits: ['rock-kit'], drums: [0.4, 1],
    layers: { guitar: 1, keys: 0, arp: 0.15, pad: 0.2, counter: 0.3, bells: 0.08, drone: 0.03, texture: 0.15 },
    patterns: { guitar: ['eighths', 'power', 'eighths', 'ring'], 'ambient.guitar': ['ring', 'strum'], drums: ['rock', 'rock', 'punk', 'halftime'], 'ambient.drums': ['halftime', 'sparse'], bass: ['pulse', 'synco', 'rootfifth', 'octave'], melody: ['phrases', 'phrases', 'calls', 'riff'] },
    forms: LOUD_FORMS, solo: 0.75, soloOver: 'B',
  },
  // title fight, citizen, tigers jaw: melodic hardcore and emo. fast punk beats under driving eighths
  // on a distorted guitar, a clean guitar twinkling through the quiet parts, a rasped tune that wants
  // to be shouted back, and a half time breakdown before the last chorus
  hardcore: {
    group: 'Loud', opens: ['drums', 'guitar', 'arp'],
    name: 'Hardcore', colour: '#5fb36b', style: 'tune',
    scales: { major: 2, minor: 2, dorian: 1, mixolydian: 1, majorPentatonic: 0.5 }, tempo: [72, 92], tuneTempo: [138, 196],
    meters: { '4/4': 9, '6/8': 1 },
    chords: ['I V vi IV', 'vi IV I V', 'IV I V vi', 'i bVI bIII bVII', 'I iii vi IV', 'IVmaj7 I V vi', 'ii IV I V', 'i bVII bVI bVII'],
    richness: [0.2, 0.55], energy: 1, space: 0.4, bright: 0.65, dark: 0.3, edge: 1, surprise: 0,
    palette: {
      guitar: ['dist-guitar', 'drive-guitar', 'crunch-guitar'], melody: ['rasp-voice', 'lead-guitar'], counter: ['chorus-guitar', 'clean-guitar', 'lead-guitar'],
      pad: ['strings'], keys: ['clean-guitar'], arp: ['clean-guitar', 'chorus-guitar'], bells: ['glass-bell'],
      bass: ['pick-bass', 'fuzz-bass'], drone: ['deep-drone'],
    },
    quiet: ['clean-guitar', 'chorus-guitar'], loudQuiet: 0.5,
    textures: ['feedback'], kits: ['rock-kit'], drums: [0.4, 1],
    layers: { guitar: 1, keys: 0, arp: 0.55, pad: 0.05, counter: 0.25, bells: 0.02, drone: 0.02, texture: 0.15 },
    patterns: { guitar: ['eighths', 'eighths', 'power'], 'ambient.guitar': ['ring', 'strum'], drums: ['punk', 'rock', 'punk'], 'ambient.drums': ['halftime', 'sparse'], arp: ['twinkle', 'twinkle', 'updown'], bass: ['pulse', 'pulse', 'synco'], melody: ['phrases', 'calls', 'phrases'] },
    forms: HARDCORE_FORMS, solo: 0.35, soloOver: 'B', breakdown: true,
  },

  // ---------- hazy: shoegaze and dream pop ----------
  // guitars as a wall of sound, a tune buried in it (bury), and a huge room

  // my bloody valentine, slowdive, lsd and the search for god: fuzz with the tremolo arm never still,
  // so whole chords warp (kevin shields' glide guitar), reverse reverb sucking each chord in, a voice
  // buried in the wall like another guitar, steady drums under a wash of cymbals, and sweet chords
  // (major sevenths, added ninths, a borrowed iv) blurred by the room
  shoegaze: {
    group: 'Hazy', opens: ['guitar', 'pad', 'drums'],
    name: 'Shoegaze', colour: '#e0709a', style: 'tune',
    scales: { major: 2, mixolydian: 2, lydian: 1, dorian: 1, minor: 0.7 }, tempo: [64, 82], tuneTempo: [88, 126],
    meters: { '4/4': 7, '6/8': 1.5, '3/4': 1 },
    chords: ['I IV', 'Imaj7 IVmaj7', 'I bVII IV I', 'I iii IV iv', 'I - IV -', 'IV I V vi', 'I vi IV iv', 'Iadd9 IVadd9', 'I bIII IV I'],
    richness: [0.5, 0.95], energy: 0.75, space: 1, bright: 0.5, dark: 0.2, edge: 0.95, surprise: 0,
    palette: {
      guitar: ['glide-guitar', 'fuzz-guitar'], pad: ['reverse-guitar', 'fuzz-wall', 'swell-guitar', 'glass-pad'], melody: ['dream-voice', 'fuzz-lead'],
      counter: ['chorus-guitar', 'fuzz-lead'], keys: ['chorus-guitar'], arp: ['chorus-guitar', 'clean-guitar'], bells: ['glass-bell', 'sine-bell'],
      bass: ['pick-bass', 'round-bass', 'chorus-bass'], drone: ['tape-loop', 'organ-drone'],
    },
    textures: ['feedback', 'hum', 'vinyl'], kits: ['gaze-kit'], drums: [0.25, 0.95],
    layers: { guitar: 1, pad: 0.8, keys: 0, arp: 0.15, counter: 0.3, bells: 0.15, drone: 0.25, texture: 0.3 },
    patterns: { guitar: ['ring', 'tremolo', 'ring', 'strum'], 'ambient.guitar': ['ring', 'tremolo'], drums: ['wash', 'wash', 'rock'], 'ambient.drums': ['wash', 'sparse', 'pulse'], bass: ['pulse', 'held', 'rootfifth'], pad: ['sustain', 'swell'], melody: ['long', 'phrases', 'long'] },
    forms: GAZE_FORMS, solo: 0.5, bury: 0.8, fx: { wobble: 0.35, drive: 0.1 },
  },
  // whirr, glare, nothing: shoegaze with grunge's weight. slower, darker and tuned down, fuzz thick
  // enough to be a fog, a minor key, the voice even further back, and heavier drums under the haze
  nugaze: {
    group: 'Hazy', opens: ['guitar', 'drums', 'bass'],
    name: 'Nugaze', colour: '#5a5277', style: 'tune',
    scales: { minor: 2.5, dorian: 1.5, phrygian: 0.5, mixolydian: 0.5 }, tempo: [56, 72], tuneTempo: [70, 104],
    meters: { '4/4': 7, '6/8': 2 },
    chords: ['i bVI bIII bVII', 'i - bVI -', 'i bVII bVI bVII', 'i bIII bVII iv', 'bVI bVII i -', 'i v bVI iv', 'i - iv -', 'i bVI iv bVII'],
    richness: [0.3, 0.75], energy: 0.8, space: 1, bright: 0.35, dark: 0.45, edge: 1, surprise: 0,
    palette: {
      guitar: ['sludge-guitar', 'fuzz-guitar', 'glide-guitar'], pad: ['fuzz-wall', 'reverse-guitar', 'dark-pad', 'swell-guitar'], melody: ['dream-voice', 'fuzz-lead'],
      counter: ['chorus-guitar', 'fuzz-lead'], keys: ['chorus-guitar'], arp: ['chorus-guitar', 'clean-guitar'], bells: ['sine-bell'],
      bass: ['fuzz-bass', 'pick-bass', 'chorus-bass'], drone: ['deep-drone', 'tape-loop'],
    },
    textures: ['feedback', 'hum', 'rain'], kits: ['gaze-kit', 'rock-kit'], drums: [0.3, 1],
    layers: { guitar: 1, pad: 0.7, keys: 0, arp: 0.15, counter: 0.25, bells: 0.1, drone: 0.25, texture: 0.35 },
    patterns: { guitar: ['ring', 'tremolo', 'power', 'ring'], 'ambient.guitar': ['ring', 'tremolo'], drums: ['halftime', 'wash', 'rock'], 'ambient.drums': ['wash', 'sparse', 'halftime'], bass: ['held', 'pulse', 'synco'], melody: ['long', 'phrases'] },
    forms: GAZE_FORMS, solo: 0.45, bury: 0.9, fx: { wobble: 0.25, drive: 0.2 },
  },
  // slowdive's quieter side, cocteau twins, beach house: chorused clean guitars ringing and picked out
  // in a big echo, a breathy voice floating over them, slow organ and synth pads, and a drum machine
  // ticking away gently
  dreampop: {
    group: 'Hazy', opens: ['arp', 'guitar', 'pad', 'drums'],
    name: 'Dream pop', colour: '#8fd3cf', style: 'tune',
    scales: { major: 2, lydian: 1.5, mixolydian: 1, dorian: 1, minor: 0.5 }, tempo: [58, 76], tuneTempo: [72, 104],
    meters: { '4/4': 6, '6/8': 2, '3/4': 1.5 },
    chords: ['Imaj7 IVmaj7', 'I vi IV V', 'I iii vi IV', 'IVmaj7 V iii vi', 'I II IV I', 'vi IV I V', 'I V vi iii', 'Imaj7 iii IVmaj7 iv'],
    richness: [0.45, 0.9], energy: 0.5, space: 0.95, bright: 0.55, dark: 0.15, edge: 0.8, surprise: 0,
    palette: {
      guitar: ['chorus-guitar', 'clean-guitar'], pad: ['swell-guitar', 'analog-pad', 'organ', 'glass-pad', 'choir-oo'], melody: ['dream-voice', 'chorus-guitar', 'sine-bell'],
      counter: ['chorus-guitar', 'clean-guitar', 'glass-bell'], keys: ['e-piano', 'chorus-guitar', 'wurlitzer'], arp: ['chorus-guitar', 'clean-guitar', 'harp'], bells: ['glass-bell', 'sine-bell', 'celesta'],
      bass: ['round-bass', 'chorus-bass', 'pick-bass'], drone: ['organ-drone', 'tape-loop'],
    },
    textures: ['vinyl', 'hum', 'ocean', 'rain'], kits: ['machine', 'gaze-kit'], drums: [0.25, 0.85],
    layers: { guitar: 0.7, pad: 0.8, keys: 0.25, arp: 0.6, counter: 0.25, bells: 0.25, drone: 0.2, texture: 0.4 },
    patterns: { guitar: ['ring', 'strum', 'tremolo'], drums: ['wash', 'groove', 'halftime', 'four'], arp: ['updown', 'up', 'twinkle'], bass: ['held', 'rootfifth', 'pulse'], melody: ['long', 'phrases', 'fragments'] },
    forms: GAZE_FORMS, solo: 0.35, bury: 0.5, fx: { wobble: 0.4 },
  },

  // ---------- world, electronic and epic ----------
  // places and genres, for any song and as a blend (song.blend, mixMood): the desert's scale and oud
  // over a metal band is calamity's desert scourge. they keep to themselves (surprise: 0), so adding
  // them left every older mood's surprises, and so its songs, as they were

  // arabian nights, a bazaar, the sands: the phrygian dominant scale (its flat second over a major
  // chord), an oud and a shawm (a zurna) over a drone and hand drums, and the andalusian cadence
  desert: {
    group: 'World', opens: ['drums', 'drone', 'arp', 'keys'],
    name: 'Desert', colour: '#e0a458', style: 'tune',
    scales: { phrygianDominant: 3, harmonicMinor: 2, hungarianMinor: 1, phrygian: 1 }, tempo: [56, 74], tuneTempo: [92, 124],
    meters: { '4/4': 6, '6/8': 2, '5/4': 0.5 },
    chords: ['I bII', 'I bII I bvii', 'I - bII -', 'iv bII I -', 'I bII bvii I', 'i bVII bVI V', 'i iv V i', 'i bVI V i'],
    methods: { bank: 5, vamp: 3, markov: 0.5 },
    richness: [0, 0.25], energy: 0.6, space: 0.6, bright: 0.55, dark: 0.4, surprise: 0,
    palette: {
      pad: ['strings', 'choir-ah', 'warm-pad'], melody: ['shawm', 'oud', 'violin', 'pan-flute'], counter: ['oud', 'violin', 'pizzicato'],
      keys: ['oud', 'harp', 'pizzicato'], arp: ['oud', 'harp', 'pizzicato'], bells: ['chime', 'glass-bell'],
      bass: ['upright', 'round-bass', 'sub-bass'], drone: ['cello-drone', 'deep-drone'],
    },
    textures: ['wind', 'crickets', 'fire'], kits: ['hand-drums', 'taiko'], drums: [0.3, 0.9],
    patterns: { drums: ['tribal', 'groove', 'tribal'], drone: ['tonic', 'fifths'], bass: ['rootfifth', 'pulse', 'held'], melody: ['phrases', 'phrases', 'long'] }, ornate: 1.4,
  },
  // islands, jungles and beaches: steel drums and marimbas over a bouncing bass and hand drums, a
  // little swing, birds and frogs. terraria's jungle, and the tropical half of the desert scourge
  tropical: {
    group: 'World', opens: ['keys', 'drums', 'bass', 'arp'],
    name: 'Tropical', colour: '#3fbf8f', style: 'tune',
    scales: { major: 2, majorPentatonic: 2, mixolydian: 2, dorian: 1 }, tempo: [64, 82], tuneTempo: [100, 128],
    meters: { '4/4': 6, '6/8': 1.5 },
    chords: ['I IV V IV', 'I V vi IV', 'I bVII IV I', 'ii V I -', 'I IV I V', 'vi IV I V', 'I iii IV V'],
    richness: [0.15, 0.55], energy: 0.65, space: 0.45, bright: 0.75, dark: 0.05, swing: 0.25, surprise: 0,
    palette: {
      pad: ['warm-pad', 'strings', 'organ'], melody: ['steel-drum', 'marimba', 'pan-flute', 'whistle', 'kalimba', 'xylophone'], counter: ['marimba', 'kalimba', 'nylon'],
      keys: ['nylon', 'marimba', 'steel-guitar'], arp: ['marimba', 'kalimba', 'steel-drum', 'nylon', 'xylophone'], bells: ['vibes', 'chime'],
      bass: ['pluck-bass', 'upright', 'round-bass'], drone: ['organ-drone'],
    },
    textures: ['birds', 'frogs', 'ocean', 'rain', 'stream'], kits: ['hand-drums', 'soft-kit'], drums: [0.2, 0.9],
    patterns: { drums: ['tribal', 'groove', 'groove'], bass: ['synco', 'rootfifth', 'octave'], keys: ['strum', 'block'], melody: ['phrases', 'riff', 'calls'] },
  },
  // woods, villages and taverns: a fiddle, a tin whistle or a bagpipe's chanter over a strummed guitar,
  // open fifths droning, a bodhran, and jigs in 6/8. dorian and mixolydian, the old modes of folk tunes
  folk: {
    group: 'World', opens: ['keys', 'drone', 'drums'],
    name: 'Folk', colour: '#8fb35a', style: 'tune',
    scales: { dorian: 3, mixolydian: 2, major: 2, minor: 1, majorPentatonic: 1 }, tempo: [58, 76], tuneTempo: [96, 132],
    meters: { '6/8': 4, '4/4': 4, '3/4': 2 },
    chords: ['i bVII i bVII', 'I bVII IV I', 'i bIII bVII i', 'I IV I V', 'i iv bVII i', 'I V IV I', 'i bVII bVI bVII', 'I - bVII -'],
    methods: { bank: 5, vamp: 2, markov: 1 },
    richness: [0, 0.3], energy: 0.6, space: 0.5, bright: 0.6, dark: 0.15, surprise: 0,
    palette: {
      pad: ['strings', 'organ', 'warm-pad'], melody: ['violin', 'whistle', 'pan-flute', 'shawm', 'accordion', 'flute'], counter: ['violin', 'whistle', 'harp', 'clarinet'],
      keys: ['nylon', 'harp', 'steel-guitar'], arp: ['harp', 'nylon', 'steel-guitar', 'banjo'], bells: ['chime', 'celesta'],
      bass: ['upright', 'round-bass', 'tuba'], drone: ['organ-drone', 'cello-drone'],
    },
    textures: ['birds', 'leaves', 'stream', 'fire', 'owl'], kits: ['hand-drums'], drums: [0.15, 0.85],
    patterns: { drums: ['groove', 'march', 'tribal'], drone: ['fifths', 'tonic'], bass: ['rootfifth', 'held'], keys: ['strum', 'waltz', 'broken'], melody: ['phrases', 'riff', 'phrases'] }, ornate: 1.3,
  },
  // snow, ice and christmas: celesta and glass bells, a shimmering pad, a waltz now and then, the wind
  // and a fire. as a blend over breakbeat it's calamity's cryogen, chimes over fast drum and bass
  wintry: {
    group: 'World', opens: ['pad', 'keys', 'arp'],
    name: 'Wintry', colour: '#a9d6e5', style: 'ambient',
    scales: { lydian: 2, major: 2, minor: 1.5, dorian: 1 }, tempo: [56, 74], tuneTempo: [84, 110],
    meters: { '4/4': 4, '3/4': 2, '6/8': 1 },
    chords: ['I II', 'i bVI bIII bVII', 'Imaj7 IVmaj7', 'I iii IV iv', 'vi IV I V', 'i iv bVII bIII', 'IV V iii vi'],
    richness: [0.4, 0.85], energy: 0.35, space: 0.85, bright: 0.8, dark: 0.15, surprise: 0,
    palette: {
      pad: ['glass-pad', 'shimmer', 'strings', 'choir-oo', 'air-pad'], melody: ['celesta', 'glass-bell', 'flute', 'music-box', 'violin', 'glock'], counter: ['harp', 'celesta', 'flute'],
      keys: ['celesta', 'harp', 'felt-keys', 'piano', 'harpsichord'], arp: ['celesta', 'music-box', 'harp', 'glass-bell', 'glock', 'harpsichord'], bells: ['glass-bell', 'chime', 'celesta', 'sine-bell', 'glock'],
      bass: ['round-bass', 'sub-bass', 'upright'], drone: ['organ-drone', 'cello-drone'],
    },
    textures: ['wind', 'chimes', 'fire'], kits: ['soft-kit', 'brushes'], drums: [0.05, 0.5],
    patterns: { drums: ['pulse', 'sparse', 'groove'], arp: ['up', 'updown', 'twinkle'], melody: ['phrases', 'long'] },
  },
  // trailers, last stands and final bosses: strings sawing an ostinato, horns and a choir, taiko and
  // timpani. over a metal band (a blend) it's symphonic metal, calamity's yharon and polterghast
  epic: {
    group: 'Dark', opens: ['drums', 'pad', 'bass', 'arp'],
    name: 'Epic', colour: '#b5523b', style: 'tune',
    scales: { minor: 3, harmonicMinor: 1.5, dorian: 1, phrygian: 0.7 }, tempo: [60, 78], tuneTempo: [100, 140],
    meters: { '4/4': 8, '3/4': 1, '6/8': 1 },
    chords: ['i bVI bIII bVII', 'i bVI bVII i', 'i - bVI -', 'i bVII bVI V', 'i iv bVI bVII', 'bVI bVII i -', 'i bIII bVII iv', 'i v bVI bVII'],
    methods: { bank: 6, markov: 1, vamp: 1 },
    richness: [0, 0.3], energy: 0.85, space: 0.75, bright: 0.55, dark: 0.5, edge: 0.9, surprise: 0,
    palette: {
      pad: ['strings', 'choir-ah', 'choir-oo', 'dark-pad', 'brass-section'], melody: ['horn', 'violin', 'choir-oo', 'synth-brass', 'trumpet'], counter: ['horn', 'strings', 'violin', 'trombone'],
      keys: ['pizzicato', 'harp', 'felt-keys', 'piano'], arp: ['pizzicato', 'harp', 'pluck-lead'], bells: ['bell', 'glass-bell'],
      bass: ['round-bass', 'sub-bass', 'synth-bass'], drone: ['cello-drone', 'deep-drone'],
    },
    textures: ['rumble', 'wind'], kits: ['orchestra-kit', 'taiko'], drums: [0.4, 1],
    patterns: { drums: ['tribal', 'march', 'halftime', 'tribal'], arp: ['up', 'updown', 'converge'], pad: ['sustain', 'pulse', 'stabs'], bass: ['octave', 'pulse', 'held'], melody: ['long', 'phrases', 'phrases'], counter: ['harmony', 'answer'] },
  },
  // night drives in the 80s future (outrun, kavinsky, the hotline miami and far cry blood dragon
  // scores): a saw lead or synth brass over arps, an octave bass in eighths and a drum machine
  synthwave: {
    group: 'Electronic', opens: ['arp', 'bass', 'drums', 'pad'],
    name: 'Synthwave', colour: '#ff6ac1', style: 'tune',
    scales: { minor: 3, dorian: 1.5, major: 1, mixolydian: 1 }, tempo: [76, 94], tuneTempo: [96, 124],
    meters: { '4/4': 1 },
    chords: ['i bVI bIII bVII', 'i bVII bVI bVII', 'vi IV I V', 'i iv bVI bVII', 'i - bVI bVII', 'IVmaj7 V iii vi', 'i bIII bVII iv', 'I V vi IV'],
    methods: { bank: 5, markov: 1, vamp: 1 },
    richness: [0.15, 0.5], energy: 0.75, space: 0.7, bright: 0.65, dark: 0.35, edge: 1, surprise: 0,
    palette: {
      pad: ['analog-pad', 'warm-pad', 'strings', 'glass-pad'], melody: ['saw-lead', 'synth-brass', 'square-lead', 'soft-lead'], counter: ['synth-brass', 'pluck-lead', 'soft-lead'],
      keys: ['e-piano', 'pluck-lead'], arp: ['pluck-lead', 'saw-lead', 'sine-bell'], bells: ['sine-bell', 'glass-bell'],
      bass: ['synth-bass', 'reese', 'sub-bass', '808-bass'], drone: ['deep-drone'],
    },
    textures: ['hum'], kits: ['machine', 'club-kit'], drums: [0.3, 1],
    patterns: { drums: ['groove', 'four', 'halftime', 'groove'], bass: ['octave', 'octave', 'pulse'], arp: ['up', 'updown', 'down'], pad: ['sustain', 'swell'], melody: ['phrases', 'long', 'riff'] },
    fx: { wobble: 0.15 },
  },
  // drum and bass: breakbeats at 170 under a reese bass and airy pads, a soft lead floating over them
  // (liquid), or the beat in half time. calamity's cryogen and profaned guardians. as ambient it's the
  // same breaks slowed to a trip hop crawl
  breakbeat: {
    group: 'Electronic', opens: ['drums', 'pad', 'bass'],
    name: 'Breakbeat', colour: '#5ec4ff', style: 'tune',
    scales: { minor: 2.5, dorian: 2, lydian: 0.7, phrygian: 0.7 }, tempo: [80, 92], tuneTempo: [164, 176],
    meters: { '4/4': 1 },
    chords: ['i bVI', 'i - iv -', 'Imaj7 IVmaj7', 'i bVII bVI bVII', 'ii V Imaj7 -', 'i bIII bVII iv', 'vi IV I V'],
    methods: { bank: 4, vamp: 2, markov: 1 },
    richness: [0.4, 0.9], energy: 0.85, space: 0.7, bright: 0.55, dark: 0.4, edge: 0.9, surprise: 0,
    palette: {
      pad: ['air-pad', 'glass-pad', 'analog-pad', 'strings'], melody: ['soft-lead', 'sine-bell', 'e-piano', 'saw-lead', 'whistle'],
      counter: ['e-piano', 'pluck-lead', 'sine-bell'], keys: ['e-piano', 'felt-keys'], arp: ['pluck-lead', 'sine-bell', 'e-piano'], bells: ['sine-bell', 'glass-bell'],
      bass: ['reese', 'sub-bass', 'synth-bass', '808-bass'], drone: ['deep-drone', 'void'],
    },
    textures: ['rain', 'hum'], kits: ['machine', 'club-kit'], drums: [0.35, 1],
    patterns: { drums: ['break', 'break', 'halftime'], bass: ['held', 'synco', 'held'], pad: ['sustain', 'swell'], melody: ['long', 'phrases', 'fragments'] },
  },

  // ---------- easy: jazz, lounge, soul and showtime ----------
  // the casual moods, for shops, cafes, towns and anywhere a character's just hanging about. they keep
  // to themselves (surprise: 0), so adding them left every older mood's songs as they were

  // a small jazz combo, bebop and cool jazz: a sax or trumpet over piano comping in rootless voicings
  // (comp), a walking bass and a ride cymbal swinging hard. ii V I everywhere, every chord a seventh,
  // and a second horn weaving round the first (counterpoint)
  jazz: {
    group: 'Easy', opens: ['bass', 'drums', 'keys'],
    name: 'Jazz', colour: '#c98b2b', style: 'tune',
    scales: { major: 2, dorian: 2, mixolydian: 1, melodicMinor: 0.5, minor: 0.7 }, tempo: [64, 84], tuneTempo: [112, 168],
    meters: { '4/4': 8, '3/4': 1.5 },
    chords: ['ii7 V7 Imaj7 Imaj7', 'Imaj7 vi7 ii7 V7', 'iii7 VI7 ii7 V7', 'Imaj7 IV7 iii7 VI7', 'ii7 V7 iii7 VI7', 'Imaj7 bVII7 Imaj7 V7', 'i7 iv7 bVII7 bIIImaj7', 'ii7 V7 i7 i7'],
    methods: { bank: 6, markov: 1 },
    richness: [0.75, 1], energy: 0.6, space: 0.45, bright: 0.55, dark: 0.15, edge: 0.7, swing: 1, swingAmount: [0.5, 0.68], surprise: 0, ornate: 1.1,
    palette: {
      melody: ['alto-sax', 'tenor-sax', 'trumpet', 'mute-trumpet', 'vibes', 'piano'], counter: ['trombone', 'vibes', 'mute-trumpet', 'tenor-sax'],
      keys: ['piano', 'jazz-guitar', 'e-piano', 'hammond'], arp: ['vibes', 'jazz-guitar'], bells: ['vibes'],
      pad: ['brass-section', 'strings', 'organ'], bass: ['upright', 'fretless'], drone: ['organ-drone'],
    },
    textures: ['vinyl', 'rain'], kits: ['jazz-kit', 'brushes'], drums: [0.3, 0.95],
    layers: { counter: 0.55, arp: 0.15, keys: 0.95, bells: 0.05, pad: 0.35 },
    patterns: { drums: ['swing', 'swing', 'brush'], bass: ['walking', 'walking', 'rootfifth'], keys: ['comp', 'comp', 'block'], melody: ['phrases', 'phrases', 'calls'], counter: ['counterpoint', 'answer', 'harmony'], pad: ['stabs', 'sustain'] },
  },
  // easy listening and bossa nova: a nylon guitar or a rhodes comping the bossa rhythm, a flute, vibes
  // or a breathy tenor floating over it, soft strings, and a rim click and shaker. major sevenths all
  // the way (jobim, the girl from ipanema, a hotel lobby)
  lounge: {
    group: 'Easy', opens: ['keys', 'drums', 'bass'],
    name: 'Lounge', colour: '#e8a87c', style: 'tune',
    scales: { major: 3, lydian: 1, dorian: 1.5, mixolydian: 1 }, tempo: [60, 76], tuneTempo: [92, 128],
    meters: { '4/4': 8, '3/4': 1 },
    chords: ['Imaj7 II7 ii7 V7', 'Imaj7 vi7 ii7 V7', 'ii7 V7 Imaj7 IVmaj7', 'IVmaj7 iii7 ii7 Imaj7', 'Imaj7 IVmaj7', 'i7 IV7', 'Imaj7 - II7 -', 'iii7 vi7 ii7 V7'],
    methods: { bank: 6, markov: 1 },
    richness: [0.7, 1], energy: 0.45, space: 0.55, bright: 0.6, dark: 0.05, edge: 0.5, surprise: 0, ornate: 0.8,
    palette: {
      melody: ['flute', 'vibes', 'tenor-sax', 'nylon', 'mute-trumpet', 'soft-lead'], counter: ['vibes', 'flute', 'strings', 'clarinet'],
      keys: ['nylon', 'e-piano', 'piano', 'jazz-guitar', 'wurlitzer'], arp: ['vibes', 'nylon', 'e-piano'], bells: ['vibes', 'glass-bell'],
      pad: ['strings', 'warm-pad', 'choir-oo'], bass: ['upright', 'fretless', 'round-bass'], drone: ['organ-drone'],
    },
    textures: ['ocean', 'vinyl', 'rain'], kits: ['latin-kit', 'brushes'], drums: [0.2, 0.9],
    layers: { counter: 0.45, keys: 0.95 },
    patterns: { drums: ['bossa', 'bossa', 'brush'], keys: ['bossa', 'bossa', 'comp'], bass: ['rootfifth', 'rootfifth', 'held'], counter: ['counterpoint', 'harmony'], melody: ['phrases', 'long', 'phrases'] },
  },
  // soul, r&b and neo soul (d'angelo, erykah badu, a late night radio station): a rhodes or a hammond
  // on ninth chords, a fat bass sliding into the beat, a lazy, behind the beat groove, strings and a
  // horn section, and a voice or a sax with no words, running and sliding between notes
  soul: {
    group: 'Easy', opens: ['keys', 'drums', 'bass'],
    name: 'Soul', colour: '#b0516e', style: 'tune',
    scales: { dorian: 2.5, minor: 1.5, mixolydian: 1.5, major: 1, minorPentatonic: 1 }, tempo: [62, 78], tuneTempo: [72, 98],
    meters: { '4/4': 1 },
    chords: ['i7 iv7', 'IVmaj7 V7 iii7 vi7', 'ii7 V7 Imaj7 -', 'vi7 ii7 V7 Imaj7', 'Imaj7 iii7 IVmaj7 iv7', 'i7 iv7 bVII7 bIIImaj7', 'i7 - bVIImaj7 -', 'IVmaj7 - iii7 vi7'],
    methods: { bank: 6, vamp: 1 },
    richness: [0.8, 1], energy: 0.55, space: 0.45, bright: 0.45, dark: 0.2, edge: 0.7, swing: 0.6, swingAmount: [0.15, 0.35], surprise: 0, ornate: 1.2,
    palette: {
      melody: ['soul-voice', 'alto-sax', 'e-piano', 'mute-trumpet', 'soft-lead'], counter: ['strings', 'tenor-sax', 'e-piano', 'soft-lead'],
      keys: ['e-piano', 'hammond', 'piano', 'wurlitzer'], arp: ['e-piano', 'vibes'], bells: ['vibes', 'glass-bell'],
      pad: ['strings', 'brass-section', 'warm-pad', 'choir-oo'], bass: ['slap-bass', 'fretless', 'pluck-bass', 'sub-bass', '808-bass'], drone: ['organ-drone'],
    },
    textures: ['vinyl', 'rain'], kits: ['lofi-kit', 'funk-kit', 'tight-kit'], drums: [0.35, 0.95],
    layers: { counter: 0.5, keys: 0.95 },
    patterns: { drums: ['halftime', 'groove', 'groove'], bass: ['synco', 'synco', 'held'], keys: ['block', 'comp', 'strum'], pad: ['sustain', 'swell', 'stabs'], counter: ['counterpoint', 'answer'] },
    fx: { wobble: 0.15 },
  },
  // funk and disco with the lights on: mettaton's death by glamour, a big band in sequins. a horn
  // section stabbing, a sax or trumpet tune with a second horn line against it, a slap bass jumping
  // octaves, a clean guitar scratching sixteenths (funk), a clavinet, and four on the floor
  showtime: {
    group: 'Easy', opens: ['drums', 'bass', 'guitar'],
    name: 'Showtime', colour: '#ff4fa0', style: 'tune',
    scales: { dorian: 2, minor: 2, mixolydian: 1.5, major: 1, harmonicMinor: 0.5 }, tempo: [80, 100], tuneTempo: [112, 132],
    meters: { '4/4': 1 },
    chords: ['i7 IV7', 'i7 bVII7 bVI7 V7', 'ii7 V7 Imaj7 VI7', 'i7 iv7 bVII7 bIIImaj7', 'I7 IV7', 'i7 - bVI7 V7', 'IVmaj7 V7 iii7 vi7', 'i7 bVII7 i7 bVII7'],
    methods: { bank: 6, vamp: 1 },
    richness: [0.5, 0.85], energy: 0.9, space: 0.4, bright: 0.7, dark: 0.25, edge: 1, swing: 0.2, surprise: 0, ornate: 1.1,
    palette: {
      guitar: ['clean-guitar', 'chorus-guitar'], melody: ['alto-sax', 'trumpet', 'tenor-sax', 'synth-brass', 'soul-voice'], counter: ['trumpet', 'trombone', 'tenor-sax', 'strings'],
      keys: ['clavinet', 'e-piano', 'hammond', 'wurlitzer'], arp: ['clavinet', 'pluck-lead'], bells: ['glock', 'vibes'],
      pad: ['brass-section', 'strings'], bass: ['slap-bass', 'synth-bass', 'pluck-bass'], drone: ['organ-drone'],
    },
    textures: [], kits: ['funk-kit'], drums: [0.4, 1],
    layers: { guitar: 0.75, pad: 0.85, counter: 0.55, keys: 0.5, bells: 0.02, drone: 0 },
    patterns: { guitar: ['funk', 'funk'], drums: ['funk', 'four', 'funk'], bass: ['octave', 'synco', 'octave'], pad: ['stabs', 'stabs', 'swell'], keys: ['block', 'skank'], counter: ['counterpoint', 'harmony', 'answer'], melody: ['phrases', 'riff', 'calls'] },
    fx: { drive: 0.1 },
  },

  // ---------- roots: the blues and country ----------

  // the blues: twelve bars of three chords, each a bar long and each a dominant seventh, a shuffle
  // swinging in triplets, a boogie bass, and a harmonica or guitar bending its notes up from the
  // blue note (the minor third bent towards the major one is the sound of the blues)
  blues: {
    group: 'Roots', opens: ['bass', 'drums', 'keys'],
    name: 'Blues', colour: '#3d5a99', style: 'tune',
    scales: { blues: 2, minorPentatonic: 2, mixolydian: 2, dorian: 1 }, tempo: [56, 72], tuneTempo: [72, 124],
    meters: { '4/4': 8, '6/8': 2 },
    chords: ['I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', 'I7 IV7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', 'i7 i7 i7 i7 iv7 iv7 i7 i7 bVI7 V7 i7 V7', 'I7 IV7 I7 V7'],
    methods: { bank: 1 }, chordBars: [1],
    richness: [0.3, 0.6], energy: 0.6, space: 0.45, bright: 0.45, dark: 0.3, edge: 0.8, swing: 1, swingAmount: [0.6, 0.7], surprise: 0, ornate: 1.4,
    palette: {
      guitar: ['crunch-guitar', 'clean-guitar'], melody: ['harmonica', 'lead-guitar', 'tenor-sax', 'piano'], counter: ['harmonica', 'piano', 'hammond', 'trombone'],
      keys: ['piano', 'hammond', 'e-piano', 'wurlitzer'], arp: ['piano', 'jazz-guitar'], bells: ['vibes'],
      pad: ['hammond', 'organ', 'brass-section'], bass: ['upright', 'pluck-bass'], drone: ['organ-drone'],
    },
    textures: ['vinyl', 'rain', 'crickets'], kits: ['brushes', 'jazz-kit', 'tight-kit'], drums: [0.25, 0.95],
    layers: { guitar: 0.4, counter: 0.45, keys: 0.6 },
    patterns: { drums: ['shuffle', 'shuffle', 'swing'], bass: ['boogie', 'walking', 'boogie'], keys: ['comp', 'block', 'strum'], melody: ['calls', 'phrases', 'calls'], counter: ['answer', 'counterpoint'], guitar: ['power', 'eighths'] },
  },
  // country and bluegrass: an acoustic guitar playing boom chick (a bass note, then the chord), a banjo
  // rolling, a fiddle or a harmonica with the tune, a pedal steel crying and sliding underneath, a
  // root and fifth bass, and the train beat on a snare
  country: {
    group: 'Roots', opens: ['guitar', 'bass', 'drums'],
    name: 'Country', colour: '#c69c5d', style: 'tune',
    scales: { major: 4, mixolydian: 1.5, majorPentatonic: 2 }, tempo: [60, 76], tuneTempo: [96, 140],
    meters: { '4/4': 6, '3/4': 2, '6/8': 0.5 },
    chords: ['I IV V I', 'I - IV I', 'I IV I V', 'I V vi IV', 'I I7 IV iv', 'I vi IV V', 'I - V -', 'IV I V I', 'I II7 V7 I'],
    richness: [0, 0.3], energy: 0.65, space: 0.4, bright: 0.7, dark: 0.05, edge: 0.7, swing: 0.3, surprise: 0, ornate: 1.2,
    palette: {
      guitar: ['steel-guitar', 'clean-guitar'], melody: ['violin', 'harmonica', 'pedal-steel', 'banjo', 'whistle'], counter: ['pedal-steel', 'violin', 'harmonica'],
      arp: ['banjo', 'banjo', 'steel-guitar', 'nylon', 'harp'], keys: ['piano', 'steel-guitar'], bells: ['chime'],
      pad: ['strings', 'organ'], bass: ['upright', 'pluck-bass'], drone: ['organ-drone'],
    },
    textures: ['crickets', 'birds', 'fire', 'leaves'], kits: ['brushes', 'soft-kit', 'tight-kit'], drums: [0.2, 0.9],
    layers: { guitar: 0.9, counter: 0.5, arp: 0.45, keys: 0.25, pad: 0.25, bells: 0.03, drone: 0.03 },
    patterns: { guitar: ['boomchick', 'boomchick', 'strum'], arp: ['roll', 'roll'], drums: ['train', 'groove', 'train'], bass: ['rootfifth', 'rootfifth', 'walking'], counter: ['counterpoint', 'answer', 'harmony'], melody: ['phrases', 'phrases', 'calls'] },
  },

  // ---------- more world ----------

  // japan and china: pentatonic tunes on a shakuhachi or an erhu, a koto plucking under them, temple
  // drums and a gong, long held notes bent and slid into. very little harmony: a drone and a chord or
  // two
  fareast: {
    group: 'World', opens: ['drone', 'keys', 'drums', 'arp'],
    name: 'Far east', colour: '#d9534f', style: 'tune',
    scales: { majorPentatonic: 3, hirajoshi: 2, inSen: 1.5, minorPentatonic: 1 }, tempo: [52, 70], tuneTempo: [80, 116],
    meters: { '4/4': 6, '3/4': 1, '6/8': 0.5 },
    chords: ['I vi', 'I - V -', 'vi IV I V', 'i bVI', 'i - bII -', 'I V vi iii', 'vi - I -', 'i iv', 'I II'],
    methods: { bank: 4, vamp: 3 },
    richness: [0, 0.2], energy: 0.45, space: 0.75, bright: 0.55, dark: 0.3, surprise: 0, ornate: 1.2,
    palette: {
      melody: ['shakuhachi', 'erhu', 'koto', 'flute'], counter: ['erhu', 'koto', 'shakuhachi'],
      keys: ['koto', 'shamisen', 'harp'], arp: ['koto', 'shamisen', 'harp'], bells: ['glass-bell', 'chime', 'bell'],
      pad: ['strings', 'choir-oo', 'air-pad'], bass: ['upright', 'round-bass', 'sub-bass'], drone: ['cello-drone', 'deep-drone'],
    },
    textures: ['wind', 'stream', 'chimes', 'birds'], kits: ['temple', 'taiko'], drums: [0.25, 0.85],
    patterns: { drums: ['tribal', 'march', 'sparse'], drone: ['tonic', 'fifths'], arp: ['up', 'updown', 'converge'], melody: ['phrases', 'long', 'phrases'], counter: ['counterpoint', 'answer'], bass: ['held', 'rootfifth'] },
  },
  // india: a raga over a tanpura plucked round and round (cycle), a sitar or a bansuri gliding between
  // notes (meend) and graced on nearly every one, a santoor shimmering, and tabla playing a tala. no
  // chord changes at all, really: the drone is the harmony
  raga: {
    group: 'World', opens: ['drone', 'drums', 'keys'],
    name: 'Raga', colour: '#ff9933', style: 'tune',
    scales: { mixolydian: 2, dorian: 2, doubleHarmonic: 1.5, phrygianDominant: 1, lydian: 1, major: 1 }, tempo: [50, 66], tuneTempo: [76, 120],
    meters: { '4/4': 6, '6/8': 1, '5/4': 0.5 },
    chords: ['I', 'I - - bVII', 'i', 'I - - IV', 'i - - bVII'],
    methods: { bank: 3, vamp: 2 },
    richness: [0, 0.1], energy: 0.5, space: 0.65, bright: 0.6, dark: 0.25, edge: 0.7, surprise: 0, ornate: 1.5,
    palette: {
      melody: ['sitar', 'bansuri', 'shawm', 'violin'], counter: ['bansuri', 'sitar', 'violin'],
      keys: ['santoor', 'sitar', 'harp'], arp: ['santoor', 'sitar'], bells: ['chime', 'glass-bell'],
      pad: ['harmonium', 'strings', 'choir-ah'], bass: ['sub-bass', 'round-bass'], drone: ['tanpura', 'tanpura', 'cello-drone'],
    },
    textures: ['birds', 'crickets', 'stream'], kits: ['tabla'], drums: [0.45, 0.95],
    layers: { drone: 0.95, bass: 0.35, pad: 0.4 },
    patterns: { drums: ['tala', 'tala', 'tribal'], drone: ['cycle', 'cycle'], melody: ['phrases', 'long', 'phrases'], counter: ['answer', 'counterpoint'], arp: ['up', 'updown'], bass: ['held', 'held', 'rootfifth'] },
  },
  // reggae: the one drop (the kick and snare together on the third beat and nothing on the first), the
  // organ and guitar chopping the off beats (skank), a deep, round bass carrying the tune as much as
  // the root, and a melodica or a horn on top. laid back, and a little swung
  reggae: {
    group: 'World', opens: ['drums', 'bass', 'keys'],
    name: 'Reggae', colour: '#3a9d23', style: 'tune',
    scales: { major: 2, mixolydian: 1.5, dorian: 2, minor: 1 }, tempo: [62, 74], tuneTempo: [70, 90],
    meters: { '4/4': 1 },
    chords: ['I IV', 'I - IV -', 'i iv', 'I V vi IV', 'i bVII', 'ii V', 'I IV V IV', 'vi IV I V'],
    richness: [0.1, 0.4], energy: 0.55, space: 0.55, bright: 0.6, dark: 0.15, edge: 0.75, swing: 0.5, surprise: 0, ornate: 0.9,
    palette: {
      melody: ['melodica', 'trumpet', 'soft-lead', 'alto-sax', 'whistle'], counter: ['trombone', 'melodica', 'trumpet'],
      keys: ['hammond', 'piano', 'e-piano', 'clavinet', 'wurlitzer'], arp: ['clean-guitar', 'e-piano'], bells: ['vibes'],
      pad: ['hammond', 'organ', 'brass-section'], bass: ['round-bass', 'sub-bass', 'pluck-bass'], drone: ['organ-drone'],
    },
    textures: ['ocean', 'birds', 'vinyl'], kits: ['funk-kit', 'tight-kit', 'lofi-kit'], drums: [0.4, 1],
    layers: { keys: 0.95 },
    patterns: { drums: ['onedrop', 'onedrop', 'groove'], keys: ['skank', 'skank'], bass: ['synco', 'held', 'synco'], pad: ['sustain', 'stabs'], melody: ['phrases', 'calls'], counter: ['answer', 'harmony', 'counterpoint'] },
  },

  // toby fox's battles (spear of justice, megalovania, black knife): fast and minor, a bass running in
  // octaves, two leads at once (the tune, and a second melody harmonising or weaving against it), a
  // driving rock or chip beat, and a sudden piano. the counter melody nearly always plays
  showdown: {
    group: 'Dark', opens: ['bass', 'drums', 'arp'],
    name: 'Showdown', colour: '#7b2cbf', style: 'tune',
    scales: { minor: 2.5, harmonicMinor: 2, dorian: 1.5, phrygian: 0.5 }, tempo: [80, 100], tuneTempo: [132, 176],
    meters: { '4/4': 8, '6/8': 1 },
    chords: ['i bVII bVI bVII', 'i - bVI bVII', 'iv V i i', 'i bIII bVII bVI', 'bVI bVII i -', 'i iv bVII bIII', 'i bVI bIII bVII', 'iv bVII bIII bVI'],
    richness: [0.15, 0.5], energy: 1, space: 0.4, bright: 0.7, dark: 0.6, edge: 1.15, surprise: 0, ornate: 0.8,
    palette: {
      melody: ['square-lead', 'saw-lead', 'pulse-lead', 'synth-brass', 'piano', 'violin'], counter: ['pulse-lead', 'synth-brass', 'violin', 'saw-lead', 'square-lead'],
      keys: ['piano', 'pluck-lead', 'e-piano'], arp: ['pulse-lead', 'pluck-lead', 'square-lead', 'piano'], bells: ['glock', 'bell', 'sine-bell'],
      pad: ['strings', 'choir-ah', 'brass-section'], bass: ['synth-bass', 'chip-bass', 'growl-bass', 'pluck-bass'], drone: ['deep-drone'],
    },
    textures: [], kits: ['rock-kit', 'chip-kit', 'tight-kit'], drums: [0.5, 1],
    layers: { counter: 0.8, arp: 0.3 },
    patterns: { drums: ['rock', 'break', 'groove', 'rock'], bass: ['octave', 'octave', 'synco'], arp: ['up', 'updown', 'converge'], counter: ['counterpoint', 'harmony', 'counterpoint'], melody: ['phrases', 'riff', 'phrases'], pad: ['pulse', 'stabs', 'sustain'] },
  },

  // ---------- the third round: the ancient world, more of the world, pop and places ----------
  // like the world moods before them they keep to themselves (surprise: 0), and their most local
  // instruments, kits and scenery are own, so every older mood's songs stayed exactly as they were

  // the aztecs and the maya: clay flutes and ocarinas over slit drums (the teponaztli), the big hand
  // drum (huehuetl), rattles and a bone scraper. a death whistle screams far off and a conch calls.
  // pentatonic tunes over a drone, hardly any chords
  aztec: {
    group: 'Ancient', opens: ['drums', 'drone', 'arp'],
    name: 'Aztec', colour: '#c0603a', style: 'tune',
    scales: { minorPentatonic: 3, majorPentatonic: 1, phrygian: 1, dorian: 1 }, tempo: [60, 76], tuneTempo: [92, 120],
    meters: { '4/4': 6, '3/4': 1, '6/8': 1.5 },
    chords: ['i bVII', 'i - bVII -', 'i iv', 'i bVI bVII i', 'i - - bVII', 'i v'],
    methods: { bank: 4, vamp: 3 },
    richness: [0, 0.15], energy: 0.6, space: 0.6, bright: 0.5, dark: 0.45, surprise: 0, ornate: 1.1,
    palette: {
      melody: ['ocarina', 'pan-flute', 'blown-bottle', 'flute'], counter: ['pan-flute', 'ocarina', 'blown-bottle', 'marimba'],
      keys: ['marimba', 'xylophone', 'kalimba'], arp: ['marimba', 'xylophone', 'kalimba'], bells: ['chime', 'glass-bell'],
      pad: ['choir-ah', 'air-pad', 'dark-pad'], bass: ['sub-bass', 'round-bass'], drone: ['deep-drone', 'void', 'cello-drone'],
    },
    textures: ['death-whistle', 'conch', 'rainstick', 'birds', 'wind'], kits: ['aztec-kit'], drums: [0.4, 0.95],
    patterns: { drums: ['tribal', 'tribal', 'march'], drone: ['tonic', 'fifths'], melody: ['phrases', 'calls', 'phrases'], bass: ['held', 'pulse', 'rootfifth'], arp: ['up', 'updown', 'converge'] },
  },
  // drums round a fire: ghana's bobobo drums, stamping and clapping, a mbira or kalimba ringing a riff
  // over and over, a chant, and a didgeridoo's drone. one or two chords, riffs that go round, and
  // often in twelve (6/8)
  tribal: {
    group: 'Ancient', opens: ['drums', 'keys', 'drone'],
    name: 'Tribal', colour: '#a0522d', style: 'tune',
    scales: { minorPentatonic: 3, majorPentatonic: 2, dorian: 1, mixolydian: 1 }, tempo: [66, 84], tuneTempo: [96, 128],
    meters: { '4/4': 5, '6/8': 3, '3/4': 0.5 },
    chords: ['I', 'i', 'I IV', 'i bVII', 'I - IV -', 'i - iv -', 'I bVII IV I'],
    methods: { bank: 3, vamp: 3 },
    richness: [0, 0.2], energy: 0.75, space: 0.45, bright: 0.6, dark: 0.3, surprise: 0,
    palette: {
      melody: ['mbira', 'kalimba', 'marimba', 'ocarina'], counter: ['kalimba', 'marimba', 'mbira'],
      keys: ['mbira', 'marimba', 'kalimba'], arp: ['kalimba', 'mbira', 'marimba', 'xylophone'], bells: ['chime'],
      pad: ['choir-ah', 'choir-oo', 'air-pad'], bass: ['sub-bass', 'round-bass', 'upright'], drone: ['didgeridoo', 'didgeridoo', 'deep-drone'],
    },
    textures: ['rainstick', 'birds', 'frogs', 'fire', 'crickets'], kits: ['african-drums', 'stomp-kit'], drums: [0.6, 1],
    patterns: { drums: ['tribal', 'tribal', 'gallop', 'groove'], drone: ['tonic'], bass: ['pulse', 'synco', 'rootfifth'], melody: ['riff', 'phrases', 'calls'], arp: ['up', 'updown', 'random'] },
  },
  // ancient egypt: the double harmonic scale (hijaz, two flat seconds' worth of strangeness), a mizmar
  // (the shawm) or an oboe over a lyre and an oud, strings swelling like a film's, and the darbuka
  // playing maqsum with finger cymbals and a riq
  egyptian: {
    group: 'Ancient', opens: ['drums', 'drone', 'arp', 'keys'],
    name: 'Egyptian', colour: '#d4a53c', style: 'tune',
    scales: { doubleHarmonic: 3, phrygianDominant: 3, harmonicMinor: 1 }, tempo: [60, 78], tuneTempo: [96, 126],
    meters: { '4/4': 6, '6/8': 1, '5/4': 0.5 },
    chords: ['I bII', 'I bII I -', 'i iv V i', 'I - bII -', 'I bII bvii I', 'i bVI V -', 'iv V i -'],
    methods: { bank: 5, vamp: 3 },
    richness: [0, 0.2], energy: 0.6, space: 0.6, bright: 0.6, dark: 0.45, surprise: 0, ornate: 1.4,
    palette: {
      melody: ['shawm', 'oboe', 'violin', 'flute', 'lyre'], counter: ['oud', 'violin', 'lyre', 'flute'],
      keys: ['oud', 'lyre', 'harp', 'santoor'], arp: ['lyre', 'harp', 'oud', 'santoor'], bells: ['chime', 'glass-bell'],
      pad: ['strings', 'choir-ah', 'warm-pad'], bass: ['upright', 'round-bass', 'sub-bass'], drone: ['cello-drone', 'deep-drone'],
    },
    textures: ['wind', 'fire', 'crickets'], kits: ['darbuka-kit'], drums: [0.35, 0.95],
    patterns: { drums: ['maqsum', 'maqsum', 'tribal'], drone: ['tonic', 'fifths'], melody: ['phrases', 'phrases', 'long'], bass: ['rootfifth', 'pulse', 'held'] },
  },
  // greece and rome: a lyre and a harp, an aulos (the oboe) or pan pipes, horns for rome's legions, a
  // choir in a temple, a frame drum and finger cymbals, and the old modes (dorian, phrygian, mixolydian)
  antiquity: {
    group: 'Ancient', opens: ['keys', 'pad', 'drums'],
    name: 'Antiquity', colour: '#b9a77a', style: 'tune',
    scales: { dorian: 3, phrygian: 1.5, mixolydian: 1.5, minor: 1, lydian: 0.5 }, tempo: [56, 72], tuneTempo: [88, 116],
    meters: { '4/4': 5, '3/4': 2, '6/8': 1, '5/4': 0.7 },
    chords: ['i bVII i -', 'i iv i bVII', 'I bVII I -', 'i bIII bVII i', 'I IV I V', 'i v i bVII'],
    methods: { bank: 5, vamp: 2, markov: 1 },
    richness: [0, 0.25], energy: 0.5, space: 0.7, bright: 0.6, dark: 0.3, surprise: 0, ornate: 1.1,
    palette: {
      melody: ['oboe', 'pan-flute', 'lyre', 'horn', 'flute'], counter: ['lyre', 'harp', 'pan-flute', 'oboe'],
      keys: ['lyre', 'harp', 'pizzicato'], arp: ['lyre', 'harp', 'pizzicato'], bells: ['glass-bell', 'chime', 'bell'],
      pad: ['choir-ah', 'choir-oo', 'strings', 'brass-section'], bass: ['upright', 'round-bass', 'bassoon'], drone: ['cello-drone', 'organ-drone'],
    },
    textures: ['wind', 'fire', 'stream', 'birds'], kits: ['darbuka-kit', 'orchestra-kit'], drums: [0.25, 0.9],
    patterns: { drums: ['march', 'tribal', 'halftime'], melody: ['phrases', 'long', 'phrases'], keys: ['strum', 'broken', 'waltz'], bass: ['rootfifth', 'held'] },
  },
  // castles and taverns: a bagpipe, a recorder or a shawm, a fiddle, a harpsichord or a lyre for the
  // lute, a chamber organ, a bassoon underneath, open fifths droning, and a tabor beating a dance in
  // six or three
  medieval: {
    group: 'Ancient', opens: ['drone', 'keys', 'drums'],
    name: 'Medieval', colour: '#7d8c4a', style: 'tune',
    scales: { dorian: 3, mixolydian: 2, minor: 1.5, major: 1 }, tempo: [58, 74], tuneTempo: [96, 132],
    meters: { '6/8': 3, '3/4': 3, '4/4': 4 },
    chords: ['i bVII i -', 'I bVII IV I', 'i bVII bVI bVII', 'i iv v i', 'I IV I V', 'i bIII bVII i'],
    methods: { bank: 5, vamp: 2, markov: 1 },
    richness: [0, 0.15], energy: 0.6, space: 0.55, bright: 0.6, dark: 0.25, surprise: 0, ornate: 1.2,
    palette: {
      melody: ['bagpipe', 'whistle', 'shawm', 'violin', 'flute'], counter: ['whistle', 'violin', 'bowed-psaltery', 'oboe'],
      keys: ['harpsichord', 'lyre', 'harp', 'oud'], arp: ['harpsichord', 'lyre', 'harp', 'oud'], bells: ['chime', 'bell'],
      pad: ['organ', 'choir-ah', 'strings'], bass: ['bassoon', 'upright', 'round-bass'], drone: ['organ-drone', 'cello-drone'],
    },
    textures: ['fire', 'birds', 'leaves', 'owl'], kits: ['hand-drums', 'stomp-kit'], drums: [0.15, 0.9],
    patterns: { drums: ['march', 'groove', 'tribal'], drone: ['fifths', 'tonic'], keys: ['strum', 'waltz', 'broken'], bass: ['rootfifth', 'held'], melody: ['phrases', 'riff', 'phrases'] },
  },
  // the mongolian steppe: throat singing, often singing the tune itself (a sung line, gliding from note
  // to note: singLine() in synth.js) with the low kargyraa or cellos droning under it, or holding the home
  // note under a horse head fiddle (the erhu, its chinese cousin, stands in) or a flute. a plucked
  // zither (the koto stands in for the yatga), and a shaman's drum galloping. pentatonic, wide open,
  // hardly any chords
  steppe: {
    group: 'World', opens: ['drone', 'drums', 'keys'],
    name: 'Steppe', colour: '#6f9fb8', style: 'tune',
    scales: { majorPentatonic: 3, minorPentatonic: 2, dorian: 1, mixolydian: 1 }, tempo: [56, 72], tuneTempo: [92, 124],
    meters: { '4/4': 4, '6/8': 3, '3/4': 1 },
    chords: ['I', 'I - IV -', 'i', 'I V', 'i bVII', 'I - V -', 'vi - I -'],
    methods: { bank: 3, vamp: 3 },
    richness: [0, 0.15], energy: 0.6, space: 0.75, bright: 0.55, dark: 0.3, surprise: 0, ornate: 1.2,
    palette: {
      melody: ['throat-singing', 'throat-singing', 'throat-singing', 'erhu', 'flute', 'shakuhachi'], counter: ['erhu', 'throat-singing', 'koto', 'flute'],
      keys: ['koto', 'harp', 'nylon'], arp: ['koto', 'harp', 'nylon'], bells: ['chime'],
      pad: ['strings', 'choir-oo', 'air-pad'], bass: ['upright', 'round-bass', 'sub-bass'], drone: ['throat-singing', 'throat-singing', 'kargyraa', 'cello-drone'],
    },
    textures: ['wind', 'fire', 'crickets', 'birds'], kits: ['shaman-drum'], drums: [0.3, 0.95],
    layers: { drone: 0.9 },
    patterns: { drums: ['gallop', 'gallop', 'tribal'], drone: ['tonic'], melody: ['phrases', 'long', 'phrases'], bass: ['held', 'rootfifth', 'pulse'], arp: ['up', 'updown'] },
  },
  // java and bali: the bonang's kettle gongs playing interlocking patterns, metallophones, a suling
  // (the flute), the kendang drumming, and the big gong coming round every cycle. pelog and slendro
  gamelan: {
    group: 'World', opens: ['arp', 'drums', 'keys'],
    name: 'Gamelan', colour: '#c9a227', style: 'tune',
    scales: { pelog: 3, slendro: 3, majorPentatonic: 1 }, tempo: [56, 72], tuneTempo: [84, 120],
    meters: { '4/4': 1 },
    chords: ['i', 'i - bII -', 'I', 'I - IV -', 'i bVI', 'vi - I -'],
    methods: { bank: 3, vamp: 3 },
    richness: [0, 0.1], energy: 0.6, space: 0.6, bright: 0.65, dark: 0.3, surprise: 0, ornate: 0.6,
    palette: {
      melody: ['bonang', 'flute', 'vibes', 'xylophone'], counter: ['bonang', 'vibes', 'marimba'],
      keys: ['vibes', 'marimba', 'bonang'], arp: ['bonang', 'glock', 'xylophone', 'marimba'], bells: ['glock', 'chime', 'bonang'],
      pad: ['choir-oo', 'air-pad', 'glass-pad'], bass: ['sub-bass', 'round-bass'], drone: ['deep-drone', 'organ-drone'],
    },
    textures: ['birds', 'frogs', 'rain', 'stream'], kits: ['gamelan-kit'], drums: [0.4, 0.95],
    layers: { arp: 0.8, bells: 0.5 },
    patterns: { drums: ['tribal', 'march', 'tribal'], arp: ['up', 'updown', 'converge', 'random'], melody: ['riff', 'phrases', 'phrases'], bells: ['phasing', 'sparkle'], bass: ['held', 'pulse'] },
  },
  // andalusia: flamenco's nylon guitar strumming (rasgueado) the andalusian cadence (four chords
  // stepping down to a major chord on the scale's fifth), palmas clapping, a cajon, and a violin or a
  // trumpet crying over it in the phrygian dominant
  flamenco: {
    group: 'World', opens: ['keys', 'drums'],
    name: 'Flamenco', colour: '#b3263a', style: 'tune',
    scales: { phrygianDominant: 3, phrygian: 2, harmonicMinor: 1 }, tempo: [60, 76], tuneTempo: [100, 132],
    meters: { '3/4': 3, '6/8': 2, '4/4': 3 },
    chords: ['iv bIII bII I', 'I bII I -', 'I bII bIII bII', 'iv - bII I', 'I - bII -', 'iv bIII bII bII'],
    methods: { bank: 6, vamp: 1 },
    richness: [0, 0.3], energy: 0.75, space: 0.45, bright: 0.6, dark: 0.4, surprise: 0, ornate: 1.3,
    palette: {
      melody: ['nylon', 'violin', 'trumpet', 'flute'], counter: ['violin', 'oboe', 'nylon'],
      keys: ['nylon', 'steel-guitar', 'harp'], arp: ['nylon', 'harp', 'steel-guitar'], bells: ['chime'],
      pad: ['strings', 'choir-ah'], bass: ['upright', 'round-bass'], drone: ['cello-drone'],
    },
    textures: ['fire', 'crickets'], kits: ['cajon-kit', 'stomp-kit'], drums: [0.3, 0.95],
    layers: { keys: 0.95 },
    patterns: { drums: ['groove', 'halftime', 'tribal'], keys: ['strum', 'strum', 'broken'], bass: ['rootfifth', 'held'], melody: ['phrases', 'phrases', 'calls'] },
  },

  // pop: four chords (I V vi IV and its friends), a bright piano or a plucked synth with the hook, a
  // string machine and pads, a strummed guitar now and then, and a tight kit on a backbeat or four on
  // the floor
  pop: {
    group: 'Pop', opens: ['keys', 'drums', 'bass'],
    name: 'Pop', colour: '#ff7eb6', style: 'tune',
    scales: { major: 4, mixolydian: 1, minor: 1.5, dorian: 0.5 }, tempo: [70, 90], tuneTempo: [100, 124],
    meters: { '4/4': 1 },
    chords: ['I V vi IV', 'vi IV I V', 'I vi IV V', 'IV I V vi', 'I V IV IV', 'vi V IV V', 'I iii IV V', 'IV V vi -'],
    methods: { bank: 6, markov: 1 },
    richness: [0.15, 0.5], energy: 0.75, space: 0.5, bright: 0.75, dark: 0.1, edge: 0.9, surprise: 0,
    palette: {
      guitar: ['clean-guitar', 'chorus-guitar'], melody: ['pluck-lead', 'soft-lead', 'piano', 'e-piano', 'synth-brass', 'whistle'], counter: ['soft-lead', 'piano', 'synth-strings', 'pluck-lead'],
      keys: ['piano', 'e-piano', 'wurlitzer', 'steel-guitar'], arp: ['pluck-lead', 'piano', 'e-piano', 'marimba'], bells: ['glock', 'sine-bell', 'celesta'],
      pad: ['synth-strings', 'warm-pad', 'strings', 'analog-pad'], bass: ['pluck-bass', 'synth-bass', 'slap-bass'], drone: ['organ-drone'],
    },
    textures: [], kits: ['tight-kit', 'club-kit', 'cajon-kit'], drums: [0.4, 1],
    layers: { guitar: 0.4, texture: 0, drone: 0 },
    patterns: { guitar: ['strum', 'ring', 'eighths'], drums: ['groove', 'four', 'groove', 'halftime'], bass: ['octave', 'synco', 'rootfifth', 'pulse'], keys: ['block', 'strum', 'broken'], melody: ['phrases', 'riff', 'phrases', 'calls'], pad: ['sustain', 'pulse', 'swell'] },
  },
  // disco: four on the floor with the hats opening on every off beat, a bass jumping octaves, strings
  // and a string machine sweeping, horns stabbing, a clavinet and a guitar scratching sixteenths (chic,
  // donna summer, the bee gees)
  disco: {
    group: 'Pop', opens: ['drums', 'bass', 'guitar'],
    name: 'Disco', colour: '#e040fb', style: 'tune',
    scales: { minor: 2, dorian: 2, major: 1.5, mixolydian: 1 }, tempo: [84, 100], tuneTempo: [112, 126],
    meters: { '4/4': 1 },
    chords: ['i7 iv7', 'i iv bVII bIII', 'ii7 V7 Imaj7 vi7', 'Imaj7 IVmaj7', 'i7 - IV7 -', 'vi7 ii7 V7 Imaj7', 'i bVI bVII i', 'iv7 V7 i7 -'],
    methods: { bank: 6, vamp: 1 },
    richness: [0.5, 0.85], energy: 0.9, space: 0.45, bright: 0.75, dark: 0.2, edge: 1, surprise: 0,
    palette: {
      guitar: ['clean-guitar', 'chorus-guitar'], melody: ['violin', 'alto-sax', 'trumpet', 'synth-brass', 'soul-voice'], counter: ['synth-strings', 'strings', 'trumpet', 'trombone'],
      keys: ['clavinet', 'e-piano', 'piano', 'wurlitzer'], arp: ['clavinet', 'pluck-lead', 'synth-strings'], bells: ['glock', 'vibes'],
      pad: ['synth-strings', 'strings', 'brass-section', 'orchestra-hit'], bass: ['slap-bass', 'synth-bass', 'pluck-bass'], drone: ['organ-drone'],
    },
    textures: [], kits: ['funk-kit', 'tight-kit'], drums: [0.5, 1],
    layers: { guitar: 0.7, pad: 0.9, texture: 0, drone: 0 },
    patterns: { guitar: ['funk', 'funk'], drums: ['four', 'four', 'funk'], bass: ['octave', 'octave', 'synco'], pad: ['stabs', 'sustain', 'pulse'], keys: ['block', 'skank'], melody: ['phrases', 'riff', 'calls'], counter: ['counterpoint', 'harmony', 'answer'] },
  },
  // hip hop with no rapper, the beat tape (j dilla, nujabes, pete rock): a dusty kit swinging a boom
  // bap beat, a rhodes or a piano looping jazzy chords, an upright or an 808, strings and an orchestra
  // hit for stabs, vinyl crackle and a dj's scratches
  hiphop: {
    group: 'Pop', opens: ['drums', 'keys', 'bass'],
    name: 'Hip hop', colour: '#8d6e63', style: 'tune',
    scales: { minor: 2, dorian: 2.5, minorPentatonic: 1, major: 0.5 }, tempo: [72, 84], tuneTempo: [84, 96],
    meters: { '4/4': 1 },
    chords: ['i7 iv7', 'ii7 V7 Imaj7 -', 'i7 - bVImaj7 -', 'Imaj7 vi7', 'i7 bVII7 bVImaj7 V7', 'iv7 i7', 'i7 iv7 bVIImaj7 bIIImaj7'],
    methods: { bank: 5, vamp: 3 },
    richness: [0.6, 1], energy: 0.6, space: 0.4, bright: 0.45, dark: 0.3, edge: 0.8, swing: 0.8, swingAmount: [0.15, 0.35], surprise: 0, ornate: 0.8,
    palette: {
      melody: ['e-piano', 'piano', 'vibes', 'flute', 'mute-trumpet', 'alto-sax'], counter: ['strings', 'vibes', 'e-piano', 'harp'],
      keys: ['e-piano', 'piano', 'wurlitzer'], arp: ['harp', 'vibes', 'e-piano'], bells: ['vibes', 'glock'],
      pad: ['strings', 'orchestra-hit', 'choir-oo', 'warm-pad'], bass: ['upright', '808-bass', 'round-bass', 'fretless'], drone: ['organ-drone'],
    },
    textures: ['vinyl', 'scratches', 'rain'], kits: ['boombap-kit'], drums: [0.5, 1],
    layers: { keys: 0.9, texture: 0.5, drone: 0 },
    fx: { wobble: 0.1 },
    patterns: { drums: ['boombap', 'boombap', 'halftime'], bass: ['synco', 'held', 'synco'], keys: ['block', 'comp', 'strum'], pad: ['stabs', 'sustain', 'swell'], melody: ['riff', 'phrases', 'calls', 'fragments'], counter: ['answer', 'counterpoint'] },
  },
  // trap: half time at 140, the 808 booming and sliding between notes, hats rolling, a clap on three,
  // and a dark, simple hook on bells, a flute or a plucked synth over a choir
  trap: {
    group: 'Pop', opens: ['drums', 'bass', 'arp'],
    name: 'Trap', colour: '#5e35b1', style: 'tune',
    scales: { minor: 3, harmonicMinor: 2, phrygian: 1 }, tempo: [64, 74], tuneTempo: [130, 150],
    meters: { '4/4': 1 },
    chords: ['i bVI', 'i - bVI -', 'i iv', 'i bVI bIII bVII', 'i - iv -', 'i bII'],
    methods: { bank: 4, vamp: 3 },
    richness: [0, 0.3], energy: 0.8, space: 0.5, bright: 0.6, dark: 0.6, edge: 0.9, surprise: 0, ornate: 0.8,
    palette: {
      melody: ['flute', 'sine-bell', 'pluck-lead', 'glock', 'music-box'], counter: ['sine-bell', 'pluck-lead', 'strings'],
      keys: ['piano', 'e-piano', 'pluck-lead'], arp: ['pluck-lead', 'sine-bell', 'glock', 'music-box'], bells: ['glock', 'sine-bell', 'music-box'],
      pad: ['choir-ah', 'choir-oo', 'dark-pad', 'strings'], bass: ['808-bass', '808-bass', 'sub-bass'], drone: ['deep-drone', 'void'],
    },
    textures: ['rain', 'hum'], kits: ['trap-kit'], drums: [0.5, 1],
    layers: { counter: 0.35 },
    patterns: { drums: ['trap', 'trap', 'halftime'], bass: ['held', 'synco', 'held'], melody: ['riff', 'phrases', 'riff'], pad: ['sustain', 'swell'], arp: ['up', 'updown', 'down'] },
  },

  // ---------- places ----------
  // the wasteland after the bombs (fallout: new vegas, mad max): a twangy guitar, a harmonica, a
  // whistled tune or a lonely trumpet (morricone), a slide guitar, an out of tune saloon piano, the
  // wind, a geiger counter, creaking metal, and drums made of scrap
  wasteland: {
    group: 'Places', opens: ['guitar', 'drone', 'drums'],
    name: 'Wasteland', colour: '#a08a5c', style: 'tune',
    scales: { minor: 2, dorian: 1.5, minorPentatonic: 2, blues: 1, phrygian: 0.7 }, tempo: [56, 72], tuneTempo: [84, 112],
    meters: { '4/4': 5, '6/8': 2, '3/4': 1 },
    chords: ['i bVII bVI V', 'i iv i V', 'i - bVI -', 'i bIII bVII iv', 'i v i bVII', 'i - iv V'],
    methods: { bank: 5, vamp: 2, markov: 1 },
    richness: [0, 0.3], energy: 0.55, space: 0.7, bright: 0.45, dark: 0.55, edge: 0.85, surprise: 0, ornate: 1.2,
    palette: {
      guitar: ['clean-guitar', 'crunch-guitar'], melody: ['harmonica', 'whistle', 'trumpet', 'pedal-steel'], counter: ['harmonica', 'pedal-steel', 'violin', 'trumpet'],
      keys: ['honky-tonk', 'piano', 'nylon'], arp: ['nylon', 'banjo', 'honky-tonk'], bells: ['metal-ping', 'bell'],
      pad: ['strings', 'choir-ah', 'dark-pad', 'organ'], bass: ['upright', 'round-bass', 'sub-bass'], drone: ['bowed-metal', 'deep-drone', 'cello-drone'],
    },
    textures: ['wind', 'geiger', 'creaks', 'fire', 'crickets'], kits: ['junk-kit', 'brushes'], drums: [0.2, 0.9],
    layers: { guitar: 0.6 },
    patterns: { guitar: ['ring', 'strum', 'boomchick', 'eighths'], drums: ['halftime', 'train', 'march', 'groove'], bass: ['held', 'rootfifth', 'pulse'], melody: ['phrases', 'long', 'calls'], keys: ['waltz', 'strum', 'block'] },
  },
  // deep under the sea: wine glasses and a blown bottle, glassy pads, harp and vibes rippling, a
  // whale calling far off and bubbles rising. slow, wide and wavering
  underwater: {
    group: 'Places', opens: ['pad', 'arp', 'drone'],
    name: 'Underwater', colour: '#2f8fb0', style: 'ambient',
    scales: { lydian: 2, major: 1.5, dorian: 1.5, majorPentatonic: 1 }, tempo: [50, 66], tuneTempo: [76, 96],
    meters: { '4/4': 4, '3/4': 2, '6/8': 1 },
    chords: ['Imaj7 IVmaj7', 'I II', 'ii7 Imaj7', 'i7 iv7', 'Imaj7 iii7 IVmaj7 -', 'vi7 IVmaj7 Imaj7 V'],
    richness: [0.5, 0.9], energy: 0.3, space: 0.9, bright: 0.45, dark: 0.2, surprise: 0, ornate: 0.6,
    palette: {
      melody: ['wine-glass', 'blown-bottle', 'vibes', 'sine-bell', 'celesta', 'flute'], counter: ['harp', 'vibes', 'soft-lead', 'celesta'],
      keys: ['harp', 'felt-keys', 'e-piano', 'vibes'], arp: ['harp', 'celesta', 'vibes', 'sine-bell', 'music-box'], bells: ['glass-bell', 'sine-bell', 'celesta'],
      pad: ['glass-pad', 'choir-oo', 'air-pad', 'shimmer'], bass: ['sub-bass', 'round-bass'], drone: ['void', 'deep-drone', 'tape-loop'],
    },
    textures: ['whale', 'bubbles', 'ocean'], kits: ['soft-kit'], drums: [0.05, 0.4],
    fx: { wobble: 0.3 },
    patterns: { drums: ['pulse', 'sparse'], arp: ['twinkle', 'updown', 'up'], melody: ['long', 'phrases', 'fragments'], bass: ['held', 'held', 'rootfifth'] },
  },
  // pirates and sea shanties: an accordion and a fiddle, a tin whistle, a banjo, a saloon piano below
  // decks, a tuba or a bassoon, the crew stamping and clapping a jig in six, the sea and the ship's
  // timbers creaking
  pirate: {
    group: 'Places', opens: ['drums', 'keys', 'bass'],
    name: 'Pirates', colour: '#3b5b8c', style: 'tune',
    scales: { dorian: 3, minor: 2, mixolydian: 1, major: 1 }, tempo: [60, 76], tuneTempo: [100, 132],
    meters: { '6/8': 4, '4/4': 3, '3/4': 1 },
    chords: ['i bVII i bVII', 'i iv V i', 'i bIII bVII i', 'i bVI bVII i', 'i - bVII -', 'i iv bVII bIII', 'I IV V I'],
    methods: { bank: 5, vamp: 2, markov: 1 },
    richness: [0, 0.25], energy: 0.7, space: 0.5, bright: 0.6, dark: 0.35, surprise: 0, ornate: 1.2,
    palette: {
      melody: ['accordion', 'violin', 'whistle', 'melodica'], counter: ['violin', 'accordion', 'whistle'],
      keys: ['honky-tonk', 'nylon', 'steel-guitar', 'banjo'], arp: ['banjo', 'nylon', 'steel-guitar', 'harp'], bells: ['bell', 'chime'],
      pad: ['organ', 'strings', 'choir-ah'], bass: ['tuba', 'upright', 'bassoon'], drone: ['organ-drone', 'cello-drone'],
    },
    textures: ['ocean', 'creaks', 'wind', 'fire'], kits: ['stomp-kit', 'hand-drums'], drums: [0.2, 0.95],
    patterns: { drums: ['march', 'groove', 'train'], keys: ['waltz', 'strum', 'block'], bass: ['rootfifth', 'rootfifth', 'held'], melody: ['phrases', 'riff', 'phrases'] },
  },
  // outer space: analog pads and a string machine drifting, sine bells and plucked arps like distant
  // signals, the void humming underneath, and a drum machine far off. lydian and the whole tone scale
  space: {
    group: 'Places', opens: ['pad', 'arp', 'drone'],
    name: 'Space', colour: '#3d2c8d', style: 'ambient',
    scales: { lydian: 3, wholeTone: 0.8, major: 1, dorian: 1, minor: 1 }, tempo: [52, 68], tuneTempo: [90, 116],
    meters: { '4/4': 5, '3/4': 1 },
    chords: ['I II', 'Imaj7 II', 'i bVI', 'I bVII', 'Imaj7 IVmaj7', 'i - bII -'],
    richness: [0.4, 0.9], energy: 0.4, space: 0.95, bright: 0.6, dark: 0.35, edge: 0.8, surprise: 0, ornate: 0.6,
    palette: {
      melody: ['soft-lead', 'sine-bell', 'wine-glass', 'synth-brass'], counter: ['soft-lead', 'sine-bell', 'pluck-lead'],
      keys: ['e-piano', 'pluck-lead', 'felt-keys'], arp: ['pluck-lead', 'sine-bell', 'e-piano', 'celesta'], bells: ['sine-bell', 'glass-bell', 'metal-ping'],
      pad: ['analog-pad', 'glass-pad', 'synth-strings', 'choir-oo', 'shimmer'], bass: ['sub-bass', 'synth-bass', 'reese'], drone: ['void', 'deep-drone', 'tape-loop'],
    },
    textures: ['hum'], kits: ['machine', 'club-kit'], drums: [0.15, 0.8],
    fx: { wobble: 0.1 },
    patterns: { drums: ['halftime', 'pulse', 'four'], arp: ['up', 'updown', 'random', 'converge'], melody: ['long', 'phrases', 'fragments'], pad: ['swell', 'sustain'] },
  },
};
// the rows of moods on the page, in order
const MOOD_GROUPS = ['Gentle', 'Bright', 'Easy', 'Roots', 'Dark', 'World', 'Ancient', 'Electronic', 'Pop', 'Loud', 'Hazy', 'Places'];

// the patterns each style leans towards, when the mood doesn't say
const STYLE_PATTERNS = {
  ambient: {
    melody: ['phrases', 'long', 'phrases', 'fragments'], counter: ['counterpoint', 'harmony', 'answer', 'free'], arp: ['up', 'updown', 'random', 'converge'],
    bells: ['phasing', 'sparkle', 'sparkle'], keys: ['strum', 'broken'], pad: ['sustain', 'sustain', 'swell'],
    drone: ['tonic', 'fifths', 'follow'], bass: ['held', 'held', 'rootfifth'], drums: ['pulse', 'sparse'], texture: ['steady'],
    guitar: ['ring', 'tremolo'],
  },
  tune: {
    melody: ['phrases', 'phrases', 'calls', 'riff'], counter: ['counterpoint', 'answer', 'counterpoint', 'harmony'], arp: ['up', 'down', 'updown', 'converge', 'random'],
    bells: ['sparkle', 'phasing'], keys: ['broken', 'block', 'strum', 'waltz'], pad: ['sustain', 'swell', 'pulse', 'stabs'],
    // no walking bass unless the mood asks for it: a jazz walk under a happy pop tune was one of the
    // things that made a band sound like it was playing two songs
    drone: ['tonic', 'fifths'], bass: ['rootfifth', 'pulse', 'octave', 'synco', 'held'],
    drums: ['groove', 'groove', 'halftime'], texture: ['steady'], guitar: ['power', 'eighths', 'ring'],
  },
  // a fight: a beat that drives (rock, double kick, a march, taiko, breaks), a bass that pushes, chords
  // pulsing as an ostinato under a tune you can hum, and a counter melody that often harmonises it,
  // twin leads in thirds, or plays a second tune against it
  boss: {
    melody: ['phrases', 'phrases', 'riff', 'long'], counter: ['harmony', 'counterpoint', 'harmony', 'answer'], arp: ['up', 'updown', 'down', 'converge'],
    bells: ['sparkle'], keys: ['block', 'broken', 'strum'], pad: ['pulse', 'stabs', 'sustain', 'pump', 'swell'],
    drone: ['tonic', 'fifths'], bass: ['octave', 'synco', 'pulse', 'riff', 'rootfifth'],
    drums: ['rock', 'double', 'march', 'tribal', 'break', 'four', 'punk'], texture: ['steady'], guitar: ['chug', 'power', 'eighths', 'tremolo', 'ring'],
  },
};
STYLE_PATTERNS.mini = STYLE_PATTERNS.boss;
// newer beats that drive too, so a mood whose own beat is one of them keeps it in a fight (a funk boss
// keeps its funk, a raga boss its tala). they're kept out of the fight's own list above, which every
// older mood's fights pick from, so those fights stayed as they were
const ALSO_DRIVING = ['funk', 'tala', 'shuffle', 'onedrop', 'train', 'trap', 'maqsum', 'gallop'];
const drives = (role, pattern) => STYLE_PATTERNS.boss[role].includes(pattern) || (role === 'drums' && ALSO_DRIVING.includes(pattern));

// the styles, as the page names them. a mini boss is a boss fight in a shorter loop with a smaller band
const STYLES = { ambient: 'Ambient', tune: 'Tune', mini: 'Mini boss', boss: 'Boss' };
const FIGHTS = { boss: true, mini: true };
// how hard each fight drives at least, whatever its mood (a calm boss is still a fight)
const FIGHT_ENERGY = { boss: 0.9, mini: 0.8 };
// drum kits for a fight in a mood whose own don't play a fight's beats (calm's soft kit, or none)
const FIGHT_KITS = ['tight-kit', 'orchestra-kit', 'rock-kit'];

// the patterns a role picks from in a song: the mood's for its style, the mood's, or the style's.
// a fight keeps the mood's own where they drive (metal's double kick) and drops the gentle ones: a
// calm mood's brushes under a boss would be a joke
const moodPatterns = (song, role) => {
  const mood = songMood(song);
  const own = mood.patterns?.[`${song.style}.${role}`] || mood.patterns?.[role];
  if (!FIGHTS[song.style]) return own || STYLE_PATTERNS[song.style][role];
  const driving = own?.filter((pattern) => drives(role, pattern));
  return driving?.length ? driving : STYLE_PATTERNS.boss[role];
};

// ---------- modifiers ----------
//
// a mood is a kind of music (folk, jazz, metal) and a modifier is a word you'd put in front of it:
// calm folk, angry folk, fast folk, jazzy folk. a modifier changes how the mood's own band plays (its
// tempo, its energy, how dark its scale is, how busy it is, how hard its drummer hits) instead of
// bringing in a second band.
//
// this replaced blends (song.blend), which mixed a second mood in: its scales, chords, tune
// instruments and scenery. folk blended with angry was a pile of both bands' instruments, chords and
// scales at once, and it didn't sound like either of them. angry folk should be the same folk band
// playing harder, faster and in a darker key, and that's what the angry modifier does.
//
// a few modifiers do bring in sounds, because the word means them: lo-fi means vinyl and a dusty kit,
// retro means chip sounds, acoustic means unplugged, epic means a choir and big drums. they swap
// sounds in for the mood's own rather than adding a second band.
//
// each is { name, tip, against (the one it can't go with), apply(mood, style) }. apply changes a copy
// of the mood. they're applied in MODIFIERS' order whatever order they were picked in, so "fast and
// calm" and "calm and fast" are the same song. songs can have up to MOST_MODS of them
const MOST_MODS = 4;
// the beats that suit each word, used to keep a mood's own where they fit
const GENTLE_BEATS = ['pulse', 'sparse', 'brush', 'halftime', 'swing', 'bossa', 'wash', 'train', 'boombap'];
const DRIVING_BEATS = ['rock', 'double', 'march', 'tribal', 'break', 'four', 'punk', 'funk', 'groove', 'tala', 'shuffle', 'trap', 'maqsum', 'gallop'];
// a mood's own patterns for a role that are in a list, or the list's fallback if none are
const keepOr = (mood, role, keep, fallback) => {
  const own = (mood.patterns?.[role] || []).filter((pattern) => keep.includes(pattern));
  return own.length ? own : fallback;
};
const setPatterns = (mood, patterns) => { mood.patterns = { ...mood.patterns, ...patterns }; };
// every tempo times k, never above 200 bpm
const scaleTempo = (mood, k) => {
  mood.tempo = mood.tempo.map((bpm) => Math.round(Math.min(200, bpm * k)));
  mood.tuneTempo = mood.tuneTempo.map((bpm) => Math.round(Math.min(200, bpm * k)));
};
// the modes from brightest to darkest. shading a mood darker moves each of its scales one along (major
// becomes mixolydian, dorian becomes minor), so it keeps its own character, just in a darker light.
// never as far as locrian, whose home chord is diminished and won't settle
const SHADES = ['lydian', 'major', 'mixolydian', 'dorian', 'minor', 'phrygian'];
// the scales that aren't modes, as [what it becomes brighter, what it becomes darker]
const OTHER_SHADES = { majorPentatonic: ['majorPentatonic', 'minorPentatonic'], minorPentatonic: ['majorPentatonic', 'blues'], blues: ['minorPentatonic', 'blues'], harmonicMinor: ['melodicMinor', 'phrygianDominant'], melodicMinor: ['dorian', 'harmonicMinor'], phrygianDominant: ['harmonicMinor', 'hungarianMinor'] };
function shade(mood, way) {
  const scales = {};
  for (const [scale, weight] of Object.entries(mood.scales)) {
    const at = SHADES.indexOf(scale);
    const next = at >= 0 ? SHADES[Math.max(0, Math.min(SHADES.length - 1, at + way))] : OTHER_SHADES[scale]?.[way > 0 ? 1 : 0] || scale;
    scales[next] = (scales[next] || 0) + weight;
  }
  mood.scales = scales;
  // the mood's progressions were written for its own scales, so they're moved into the new one
  mood.reharm = true;
}
// a few roles' palettes swapped out (retro, acoustic): the role's instruments mapped one by one,
// keeping the mood's order, with duplicates dropped
const mapPalette = (mood, map) => {
  const palette = {};
  for (const [role, list] of Object.entries(mood.palette)) palette[role] = [...new Set(list.map((id) => (typeof map === 'function' ? map(id, role) : map[id]) || id))];
  mood.palette = palette;
};
// what each sound becomes unplugged: synths and electric instruments to the nearest acoustic one
const UNPLUGGED = {
  'saw-lead': 'violin', 'square-lead': 'flute', 'pulse-lead': 'whistle', 'bit-lead': 'violin', 'soft-lead': 'flute', 'synth-brass': 'horn', 'pluck-lead': 'pizzicato',
  'sine-bell': 'glass-bell', 'metal-ping': 'chime', 'e-piano': 'piano', hammond: 'accordion', clavinet: 'harp', 'jazz-guitar': 'nylon', 'pedal-steel': 'violin',
  'warm-pad': 'strings', 'analog-pad': 'strings', 'glass-pad': 'choir-oo', 'dark-pad': 'strings', shimmer: 'choir-oo', 'air-pad': 'choir-oo', 'fuzz-wall': 'strings',
  'haunted-pad': 'choir-oo', 'reverse-piano': 'strings', 'swell-guitar': 'strings', 'reverse-guitar': 'strings', organ: 'harmonium',
  'lead-guitar': 'harmonica', 'metal-lead': 'violin', 'fuzz-lead': 'violin', 'dream-voice': 'choir-oo', 'rasp-voice': 'violin',
  'sub-bass': 'upright', 'round-bass': 'upright', 'synth-bass': 'upright', 'pluck-bass': 'upright', 'growl-bass': 'upright', 'chip-bass': 'upright', reese: 'upright',
  'chorus-bass': 'upright', 'pick-bass': 'upright', 'fuzz-bass': 'upright', 'slap-bass': 'upright', fretless: 'upright',
  'deep-drone': 'cello-drone', void: 'cello-drone', 'bowed-metal': 'cello-drone', 'organ-drone': 'cello-drone', 'tape-loop': 'cello-drone',
};
const UNPLUGGED_KITS = { 'lofi-kit': 'brushes', 'tight-kit': 'soft-kit', heartbeat: 'soft-kit', clockwork: 'soft-kit', 'chip-kit': 'soft-kit', 'club-kit': 'hand-drums', machine: 'soft-kit', 'rock-kit': 'soft-kit', 'metal-kit': 'orchestra-kit', 'gaze-kit': 'brushes', 'funk-kit': 'soft-kit' };
// a nes's: the tune on pulse waves, the bass on the triangle, the noise channel's drums
const CHIPS = { melody: ['pulse-lead', 'square-lead'], counter: ['pulse-lead', 'square-lead'], arp: ['pulse-lead', 'square-lead', 'pluck-lead'], bells: ['pulse-lead', 'sine-bell'], keys: ['pulse-lead', 'pluck-lead'], pad: ['organ', 'glass-pad'], bass: ['chip-bass'], drone: ['organ-drone'] };

const MODIFIERS = {
  calm: {
    name: 'Calm', against: 'angry', tip: 'Calm: slower and softer, gentler instruments from the mood, a quieter beat and more room',
    apply(mood) {
      mood.energy = Math.max(0.15, mood.energy * 0.6);
      scaleTempo(mood, 0.85);
      mood.drums = [mood.drums[0] * 0.5, mood.drums[1] * 0.6];
      // the gentler end of the mood's own instruments (edge is how harsh one is, see synth.js)
      mood.edge = Math.max(0.2, moodEdge(mood) * 0.75);
      mood.space = Math.min(1, mood.space + 0.15);
      mood.busy = (mood.busy || 0) - 0.15;
      mood.soft = (mood.soft || 1) * 1.4;
      mood.ornate = (mood.ornate ?? 1) * 0.7;
      mood.fx = { ...mood.fx, drive: 0 };
      setPatterns(mood, {
        drums: keepOr(mood, 'drums', GENTLE_BEATS, ['pulse', 'sparse', 'halftime']), melody: keepOr(mood, 'melody', ['long', 'phrases', 'fragments'], ['phrases', 'long']),
        pad: ['sustain', 'swell'], bass: ['held', 'rootfifth'],
      });
    },
  },
  angry: {
    name: 'Angry', against: 'calm', tip: 'Angry: harder, faster and darker. The same band, playing like it means it: a driving beat, punchy chords, a darker key and some grit',
    apply(mood) {
      mood.energy = Math.min(1, Math.max(0.9, mood.energy + 0.3));
      scaleTempo(mood, 1.12);
      if (!mood.kits.length) mood.kits = ['tight-kit'];
      mood.drums = [Math.max(mood.drums[0], 0.4), 1];
      mood.edge = Math.min(1.25, moodEdge(mood) + 0.25);
      mood.dark = Math.min(1, mood.dark + 0.3);
      mood.richness = [mood.richness[0] * 0.5, mood.richness[1] * 0.6];
      mood.space *= 0.85;
      mood.swing = 0;
      mood.fx = { ...mood.fx, drive: (mood.fx?.drive || 0) + 0.25 };
      // two shades darker: major becomes dorian, minor phrygian. one (mixolydian) still sounded cheerful
      shade(mood, 2);
      setPatterns(mood, {
        drums: keepOr(mood, 'drums', DRIVING_BEATS, ['groove', 'march', 'tribal', 'rock']), pad: ['stabs', 'pulse', 'sustain'],
        bass: keepOr(mood, 'bass', ['octave', 'pulse', 'synco', 'riff'], ['octave', 'pulse', 'synco']),
      });
    },
  },
  fast: {
    name: 'Fast', against: 'slow', tip: 'Fast: a quarter quicker, and a little more energy',
    apply(mood) {
      scaleTempo(mood, 1.25);
      mood.energy = Math.min(1, mood.energy + 0.1);
      mood.ornate = (mood.ornate ?? 1) * 0.8;
    },
  },
  slow: {
    name: 'Slow', against: 'fast', tip: 'Slow: a quarter slower, with longer notes and softer edges',
    apply(mood) {
      scaleTempo(mood, 0.75);
      mood.energy = Math.max(0.1, mood.energy - 0.1);
      mood.soft = (mood.soft || 1) * 1.2;
    },
  },
  dark: {
    name: 'Dark', against: 'bright', tip: 'Dark: a darker scale (major becomes mixolydian, minor becomes phrygian), its chords moved with it, and a duller tone',
    apply(mood) {
      shade(mood, 1);
      mood.bright = Math.max(0.15, mood.bright - 0.2);
      mood.dark = Math.min(1, mood.dark + 0.3);
      mood.space = Math.min(1, mood.space + 0.1);
    },
  },
  bright: {
    name: 'Bright', against: 'dark', tip: 'Bright: a brighter scale (minor becomes dorian, major becomes lydian), its chords moved with it, and a sparklier tone',
    apply(mood) {
      shade(mood, -1);
      mood.bright = Math.min(1, mood.bright + 0.2);
      mood.dark = Math.max(0, mood.dark - 0.25);
    },
  },
  sparse: {
    name: 'Sparse', against: 'lush', tip: 'Sparse: fewer players and fewer notes, with space between them',
    apply(mood, style) {
      const chances = { ...LAYER_CHANCE[style], ...mood.layers };
      mood.layers = { ...mood.layers };
      for (const [role, k] of Object.entries({ counter: 0.4, arp: 0.4, bells: 0.4, keys: 0.6, drone: 0.6, pad: 0.8, texture: 0.8 })) mood.layers[role] = (chances[role] || 0) * k;
      mood.most = (mood.most || 0) - 2;
      mood.busy = (mood.busy || 0) - 0.2;
    },
  },
  lush: {
    name: 'Lush', against: 'sparse', tip: 'Lush: a fuller band, richer chords, a second melody more often, and more room',
    apply(mood, style) {
      const chances = { ...LAYER_CHANCE[style], ...mood.layers };
      mood.layers = { ...mood.layers };
      for (const [role, at] of Object.entries({ counter: 0.7, pad: 1, bells: 0.4, drone: 0.3 })) mood.layers[role] = Math.max(chances[role] || 0, at);
      mood.most = (mood.most || 0) + 1;
      mood.richness = [Math.min(1, mood.richness[0] + 0.25), Math.min(1, mood.richness[1] + 0.25)];
      mood.space = Math.min(1, mood.space + 0.15);
    },
  },
  jazzy: {
    name: 'Jazzy', tip: 'Jazzy: sevenths and ninths on every chord, a ii V I or two, swing, a walking bass and a ride cymbal',
    apply(mood) {
      mood.richness = [Math.max(0.7, mood.richness[0]), 1];
      mood.chords = [...mood.chords, 'ii7 V7 Imaj7 vi7', 'Imaj7 vi7 ii7 V7', 'iii7 VI7 ii7 V7'];
      mood.reharm = true;
      mood.swing = 1;
      mood.swingAmount = [0.4, 0.62];
      mood.ornate = (mood.ornate ?? 1) + 0.3;
      const kits = mood.kits.filter((id) => INSTRUMENTS[id].suits.some((pattern) => ['swing', 'brush'].includes(pattern)));
      mood.kits = kits.length ? kits : ['jazz-kit', 'brushes', 'tight-kit'];
      setPatterns(mood, { drums: ['swing', 'brush'], bass: ['walking', 'walking', 'rootfifth'], keys: ['comp', 'block'] });
    },
  },
  lofi: {
    name: 'Lo-fi', tip: 'Lo-fi: vinyl crackle, worn tape, a dusty, lazy beat and a darker tone',
    apply(mood) {
      mood.textures = ['vinyl'];
      mood.layers = { ...mood.layers, texture: 1 };
      scaleTempo(mood, 0.85);
      mood.bright = Math.max(0.15, mood.bright - 0.15);
      mood.kits = ['lofi-kit'];
      mood.drums = [Math.max(mood.drums[0], 0.3), Math.max(mood.drums[1], 0.8)];
      mood.swing = 0.8;
      mood.swingAmount = [0.25, 0.45];
      mood.fx = { ...mood.fx, wobble: (mood.fx?.wobble || 0) + 0.4, drive: (mood.fx?.drive || 0) + 0.15 };
      setPatterns(mood, { drums: ['halftime', 'groove'] });
    },
  },
  epic: {
    name: 'Epic', tip: 'Epic: huge. Strings and a choir, big drums, long notes, and a bigger room',
    apply(mood) {
      mood.space = Math.min(1, mood.space + 0.2);
      mood.energy = Math.min(1, mood.energy + 0.15);
      mood.palette = { ...mood.palette, pad: ['strings', 'choir-ah', ...mood.palette.pad] };
      // (and a tight kit for a chip band, which can't share a song with orchestral drums)
      mood.kits = ['orchestra-kit', 'taiko', 'tight-kit'];
      mood.drums = [Math.max(mood.drums[0], 0.3), Math.max(mood.drums[1], 0.9)];
      mood.layers = { ...mood.layers, pad: 1 };
      mood.richness = [mood.richness[0] * 0.5, mood.richness[1] * 0.6];
      setPatterns(mood, { drums: ['tribal', 'march', 'halftime'], melody: ['long', 'phrases'], counter: ['harmony', 'counterpoint'], pad: ['sustain', 'pulse'] });
    },
  },
  spooky: {
    name: 'Spooky', tip: 'Spooky: strange chords that never quite settle, a darker scale, music box and glass bells, and creaks in the dark',
    apply(mood) {
      shade(mood, 1);
      mood.scales = { ...mood.scales, harmonicMinor: (mood.scales.harmonicMinor || 0) + 1, wholeTone: 0.4 };
      mood.methods = { ...(mood.methods || { bank: 5, markov: 3, vamp: 1.2 }), chromatic: 2 };
      mood.dark = Math.min(1, mood.dark + 0.4);
      mood.palette = { ...mood.palette, bells: ['music-box', 'glass-bell', ...(mood.palette.bells || [])] };
      mood.textures = ['owl', 'drips', 'creaks', 'hum'];
      setPatterns(mood, { pad: ['swell', 'sustain'], melody: keepOr(mood, 'melody', ['long', 'fragments', 'phrases'], ['phrases', 'fragments']) });
    },
  },
  retro: {
    name: 'Retro', against: 'acoustic', tip: 'Retro: the whole band played on an 8 bit console: pulse waves, a triangle bass and noise drums',
    apply(mood) {
      // every part but a guitar (retro metal keeps its guitars, as chiptune metal does)
      mood.palette = { ...mood.palette, ...CHIPS };
      mood.kits = ['chip-kit'];
      mood.edge = Math.max(moodEdge(mood), 1);
      // no surprises from other moods: they'd be acoustic or synth sounds in a chip band
      mood.surprise = 0;
      mood.textures = [];
    },
  },
  acoustic: {
    name: 'Acoustic', against: 'retro', tip: 'Acoustic: unplugged. Synths and electric instruments swapped for the nearest acoustic ones, and a softer kit',
    apply(mood) {
      mapPalette(mood, (id, role) => (role === 'guitar' ? 'steel-guitar' : UNPLUGGED[id]));
      mood.kits = [...new Set(mood.kits.map((id) => UNPLUGGED_KITS[id] || id))];
      mood.fx = { ...mood.fx, drive: 0 };
      setPatterns(mood, { guitar: ['strum', 'ring', 'boomchick'] });
    },
  },
  groovy: {
    name: 'Groovy', tip: 'Groovy: a funky, syncopated bass, chord stabs on the off beats and a busier drummer',
    apply(mood) {
      mood.energy = Math.min(1, mood.energy + 0.1);
      mood.busy = (mood.busy || 0) + 0.1;
      mood.swing = Math.max(mood.swing || 0, 0.5);
      mood.swingAmount = [0.15, 0.35];
      setPatterns(mood, {
        drums: keepOr(mood, 'drums', ['funk', 'groove', 'four', 'break', 'halftime', 'onedrop'], ['groove', 'funk']), bass: ['synco', 'octave', 'synco'],
        keys: ['block', 'skank', 'comp'], pad: ['stabs', 'pump'], guitar: ['funk', 'eighths'],
      });
    },
  },
  dreamy: {
    name: 'Dreamy', tip: 'Dreamy: a brighter, floating scale, slow swells, long echoes and a huge room',
    apply(mood) {
      shade(mood, -1);
      mood.space = 1;
      mood.soft = (mood.soft || 1) * 1.6;
      mood.drums = [mood.drums[0] * 0.6, mood.drums[1] * 0.7];
      mood.palette = { ...mood.palette, pad: ['shimmer', 'glass-pad', ...mood.palette.pad] };
      mood.fx = { ...mood.fx, wobble: (mood.fx?.wobble || 0) + 0.3 };
      setPatterns(mood, { melody: ['long', 'phrases', 'fragments'], pad: ['swell', 'sustain'] });
    },
  },
};
// a song's modifiers cleaned up: known ones, once each, in MODIFIERS' order, the first of an opposite
// pair kept, at most MOST_MODS
function cleanMods(mods) {
  const wanted = new Set(Array.isArray(mods) ? mods : []);
  const out = [];
  for (const id of Object.keys(MODIFIERS)) {
    if (!wanted.has(id) || out.length >= MOST_MODS || out.includes(MODIFIERS[id].against)) continue;
    out.push(id);
  }
  return out;
}

// the mood a song is really written in (songMood): its mood with its modifiers worked in, made into a
// fight for the boss styles. a fight drives: at least FIGHT_ENERGY, quicker than the mood's tune, no
// swing, a drier room, and drums always, on a kit that can play a fight's beats. it opens on the drums
// and bass. (terraria's and calamity's boss themes, which this was made for, are mostly a genre and a
// place. the place used to be a blend; now a world mood with angry or fast does that job, or the
// genre's own mood as a boss)
// a song with neither gets the mood itself, untouched, so every song made before plays the same
const moodEdge = (mood) => mood.edge ?? 0.3 + mood.energy * 0.6 + mood.dark * 0.2;
function mixMood(base, mods, style) {
  if (!mods.length && !FIGHTS[style]) return base;
  const mood = { ...base, palette: { ...base.palette } };
  for (const id of mods) MODIFIERS[id].apply(mood, style);
  if (FIGHTS[style]) {
    mood.energy = Math.max(mood.energy, FIGHT_ENERGY[style]);
    mood.space *= 0.75;
    mood.swing = 0;
    // quicker, unless it's already quick (drum and bass at 170 needs no push)
    mood.tuneTempo = mood.tuneTempo.map((bpm, i) => (bpm >= 150 ? bpm : Math.round(Math.min(165, bpm * (i ? 1.15 : 1.2)))));
    mood.meters = { '4/4': 10, '6/8': 1, '5/4': 0.5 };
    // a kit that plays a fight's beats, or one of the newer driving beats the mood itself plays (a
    // soft kit's train beat drives a country boss, but it doesn't make a calm boss's soft kit a fight's)
    const own = mood.patterns?.drums || [];
    const kits = mood.kits.filter((id) => INSTRUMENTS[id].suits.some((pattern) => STYLE_PATTERNS.boss.drums.includes(pattern) || (ALSO_DRIVING.includes(pattern) && own.includes(pattern))));
    mood.kits = kits.length ? kits : FIGHT_KITS;
    mood.drums = [1, 1];
    mood.opens = ['drums', 'bass', ...mood.opens];
    mood.soloOver = mood.soloOver || 'B';
  }
  return mood;
}
const moodCache = new Map();
function songMood(song) {
  const mods = song.mods || [];
  const key = `${song.mood}|${mods.join(',')}|${song.style}`;
  if (!moodCache.has(key)) moodCache.set(key, mixMood(MOODS[song.mood], mods, song.style));
  return moodCache.get(key);
}

// the families a layer's surprise instrument (the odd one from outside the mood) comes from, so a
// drone doesn't end up on a plucked lead. the page still offers any instrument for any layer
const WILDCARDS = {
  melody: ['lead', 'keys', 'bell'], counter: ['lead', 'keys'], arp: ['keys', 'lead', 'bell'], bells: ['bell', 'keys'],
  keys: ['keys'], pad: ['pad', 'drone'], drone: ['drone', 'pad'], bass: ['bass'], guitar: ['guitar'],
};

// how likely each role is to be in a song. only moods that ask for a guitar get one (MOODS layers)
const LAYER_CHANCE = {
  ambient: { melody: 0.55, counter: 0.2, arp: 0.25, bells: 0.65, keys: 0.3, guitar: 0, pad: 1, drone: 0.55, bass: 0.4, drums: 0.12, texture: 0.85 },
  tune:    { melody: 1, counter: 0.45, arp: 0.5, bells: 0.2, keys: 0.65, guitar: 0, pad: 0.7, drone: 0.15, bass: 1, drums: 0.85, texture: 0.25 },
  // a fight is the tune, the bass and the beat, with an ostinato (an arp or pulsing pad) under them
  boss:    { melody: 1, counter: 0.5, arp: 0.55, bells: 0.1, keys: 0.4, guitar: 0, pad: 0.8, drone: 0.1, bass: 1, drums: 1, texture: 0.1 },
  mini:    { melody: 1, counter: 0.3, arp: 0.45, bells: 0.05, keys: 0.35, guitar: 0, pad: 0.6, drone: 0.05, bass: 1, drums: 1, texture: 0.05 },
};
// the most layers a song has, and how many of its parts play from the first bar (pickArrangement)
const MOST_LAYERS = { ambient: 6, tune: 7, boss: 7, mini: 6 };
const OPENING = { ambient: 1, tune: 2, boss: 3, mini: 3 };
// the parts that move around the middle of the band, under the tune. two of them is a band; three or
// four (an arp, oom-pah keys and chimes over a walking bass) was the "bunch of noises" in happy and
// playful songs, so a song keeps two at most, losing them in this order
const MIDDLE = ['bells', 'counter', 'arp', 'keys'];
// a second texture in an ambient song, for more of a place: birds over a stream, an owl over rain.
// only in moods with something that happens now and then, since two steady beds are one too many
const SECOND_TEXTURE = 0.5;

// when each role joins in: a layer plays in a section once the section's energy reaches a number
// picked from its range, so quiet sections get the pads and background, and busy ones everything
const ROLE_ENTRY = {
  texture: [0, 0.25], drone: [0, 0.3], pad: [0, 0.35], bells: [0.2, 0.6], keys: [0.25, 0.6], guitar: [0.2, 0.5], bass: [0.3, 0.6],
  arp: [0.45, 0.85], melody: [0.5, 0.65], counter: [0.6, 0.95], drums: [0.4, 0.75],
};

// the parts that can open a song when none of the mood's openers are in it: anything but the
// melody's lines and the scenery
const OPENERS = ['pad', 'keys', 'guitar', 'arp', 'drone', 'bass', 'drums'];

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
  // fights loop under the battle, so they never wind down: no outro, the end runs back into the start.
  // a short intro on the beat and bass, the theme, a higher second theme, and a break (calamity's
  // "moments of calm", or a breakdown in the loud moods) before the climax
  boss: [
    [['Intro', 'C', 4, 0.45], ['Theme', 'A', 8, 0.9], ['Theme', 'A', 8, 0.95], ['Rise', 'B', 8, 1], ['Break', 'C', 8, 0.55], ['Climax', 'B', 8, 1], ['Theme', 'A', 8, 0.95]],
    [['Intro', 'A', 4, 0.45], ['A', 'A', 8, 0.9], ['B', 'B', 8, 1], ['A', 'A', 8, 0.95], ['Break', 'C', 8, 0.55], ['Build', 'C', 4, 0.8], ['B', 'B', 8, 1], ['B', 'B', 8, 1]],
    [['Intro', 'B', 4, 0.5], ['A', 'A', 16, 0.92], ['B', 'B', 8, 1], ['Break', 'C', 8, 0.55], ['A', 'A', 8, 0.95], ['B', 'B', 16, 1]],
  ],
  // a mini boss is over quicker: a loop of two or three parts
  mini: [
    [['Intro', 'A', 2, 0.5], ['A', 'A', 8, 0.9], ['B', 'B', 8, 1], ['A', 'A', 8, 0.95]],
    [['A', 'A', 8, 0.9], ['B', 'B', 8, 1]],
    [['Intro', 'C', 2, 0.5], ['A', 'A', 8, 0.9], ['C', 'C', 4, 0.7], ['B', 'B', 8, 1]],
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

// blend: a second mood for flavour, or none (mixMood)
// mods: the song's modifiers (MODIFIERS), any order. the random numbers don't depend on them, so
// adding "fast" to a song gives the same song, faster, as near as it can
function generateSong(moodId, style, seed, mods = []) {
  const mood = MOODS[moodId] ? moodId : 'calm';
  const picked = cleanMods(mods);
  const song = { name: seedTitle(seed), seed, mood, ...(picked.length ? { mods: picked } : {}), style: STYLES[style] ? style : 'ambient', parts: {}, layers: [], sections: [], fx: {} };
  pickTonality(song, makeRng(seed, mood, 'tonality'));
  pickChords(song, makeRng(seed, mood, 'chords'));
  pickLayers(song, makeRng(seed, mood, song.style, 'layers'));
  pickArrangement(song, makeRng(seed, mood, song.style, 'arrangement'));
  pickSpace(song, makeRng(seed, mood, 'space'));
  return cleanSong(song);
}

// a blank track to make by hand (the page's New track): one short section, and a melody, a bass and
// drums with no notes in them yet. own marks it as made by hand, so picking a mood doesn't write a
// new song over it. the mood, style and modifiers still decide how any part you let it write plays
function blankSong() {
  const layer = (role, instrument, volume, reverb) => ({ id: role, role, instrument, hand: true, volume, reverb, echo: 0 });
  return cleanSong({
    name: 'New track', seed: 'new-track', own: true, mood: 'calm', style: 'tune',
    key: 0, scale: 'major', tempo: 100, meter: '4/4', swing: 0, humanise: 0.2, colour: 0, chordBars: 1,
    layers: [layer('melody', 'piano', 0.68, 0.35), layer('bass', 'pluck-bass', 0.66, 0.1), layer('drums', 'tight-kit', 0.55, 0.1)],
    sections: [{ name: 'Verse', part: 'A', bars: 4, play: ['melody', 'bass', 'drums'], energy: 0.75 }],
    fx: { reverb: 0.3, echo: 0.1 },
  });
}

// remixing: one part of the song picked again. nonce makes it new each time (the page passes a
// random one); everything else stays as it was
const REROLLS = {
  chords: (song, mood, rng) => pickChords(song, rng),
  melodies: (song, mood, rng) => { for (const layer of song.layers) layer.seed = newToken(rng); },
  band: (song, mood, rng) => {
    // cleared first, so the new instruments don't dodge the old ones
    for (const layer of song.layers) layer.instrument = '';
    for (const layer of dressOrder(song.layers)) dressLayer(song, layer, rng, false);
    fitBand(song);
  },
  arrangement: (song, mood, rng) => pickArrangement(song, rng),
  space: (song, mood, rng) => pickSpace(song, rng),
  tonality: (song, mood, rng) => pickTonality(song, rng),
  mutate: (song, mood, rng) => mutateSong(song, rng),
};
function rerollSong(song, what, nonce) {
  const next = clone(song);
  REROLLS[what](next, songMood(next), makeRng(song.seed, what, nonce));
  return cleanSong(next);
}
// new chords for one part only
function rerollPart(song, part, nonce) {
  const next = clone(song);
  next.parts[part] = makeProgression(next, makeRng(song.seed, 'part', part, nonce), pickMethod(next, makeRng(nonce)));
  return cleanSong(next);
}

function pickTonality(song, rng) {
  const mood = songMood(song);
  song.key = rng.int(0, 11);
  song.scale = rng.weighted(mood.scales);
  const [low, high] = song.style === 'ambient' ? mood.tempo : mood.tuneTempo;
  song.tempo = Math.round(rng.range(low, high));
  song.meter = rng.weighted(mood.meters || (song.style !== 'ambient' ? { '4/4': 6, '3/4': 1.5, '6/8': 1.5 } : { '4/4': 5, '3/4': 2, '6/8': 1 }));
  // a 6/8 beat is three eighths long, so the same feel counts slower
  if (song.meter === '6/8') song.tempo = Math.round(song.tempo * 0.65);
  song.swing = rng.chance(mood.swing || 0) ? rng.range(...(mood.swingAmount || [0.15, 0.5])) : 0;
  song.humanise = rng.range(0.25, 0.6);
  song.colour = rng.range(...mood.richness);
  song.chordBars = rng.pick(mood.chordBars || (song.style === 'ambient' ? [1, 2, 2, 4] : mood.energy > 0.7 ? [0.5, 1, 1, 2] : [1, 1, 2]));
}

const pickMethod = (song, rng) => rng.weighted(songMood(song).methods || { bank: 5, markov: 3, vamp: 1.2 });

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

// a progression moved into another scale: each chord on one of the major scale's degrees becomes the
// chord the new scale builds on that degree, so I V vi IV in a minor scale is i v bVI iv, the way a
// songwriter borrows a progression into a darker key. a seventh or a sus stays on (a seventh on a
// diminished chord doesn't, the chord parser can't read "vii°7"), and chords off the major scale's
// degrees (bVII, #iv°) and holds (-) stay as they were
function reharmonise(text, steps) {
  return String(text).trim().split(/\s+/).map((token) => {
    const chord = parseChord(token);
    const degree = chord ? MAJOR_DEGREES.indexOf(chord.root) : -1;
    if (degree < 0 || degree >= steps.length) return token;
    const next = diatonicChord(steps, degree);
    const name = chordToken(next.root, next.tones);
    const extra = /(maj7|7|6|sus2|sus4|add9)$/i.exec(token)?.[1] || '';
    if (!extra || /[°+]$/.test(name)) return name;
    // a major seventh on what's now a minor chord would be a strange chord, so it's a plain seventh
    return name + (extra === 'maj7' && next.tones[1] === 3 ? '7' : extra);
  }).join(' ');
}

// one progression, made one of four ways (see the music theory notes at the top)
function makeProgression(song, rng, method) {
  const mood = songMood(song);
  const steps = harmonySteps(song.scale);
  const token = (degree) => { const chord = diatonicChord(steps, degree); return chordToken(chord.root, chord.tones); };
  if (method === 'bank') {
    // the mood's progressions, favouring ones with few notes outside the scale, so the chords and the
    // tunes over them agree (a sad song in dorian shouldn't get one written for natural minor). a
    // modifier that changed the scale (angry, dark...) moves them into the song's scale first
    const inScale = new Set(steps);
    const outside = (text) => parseProgression(text).slots.reduce((n, { chord }) => n + chord.tones.filter((tone) => !inScale.has(mod12(chord.root + tone))).length, 0);
    const bank = mood.reharm ? mood.chords.map((text) => reharmonise(text, steps)) : mood.chords;
    return rng.weighted(bank.map((text) => [text, 1 / (1 + outside(text)) ** 2]));
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
  const mood = songMood(song);
  const chances = { ...LAYER_CHANCE[song.style], ...mood.layers };
  // a fight always has a bass, even in a mood that rarely wants one (a raga)
  if (FIGHTS[song.style]) chances.bass = 1;
  const roles = ROLE_ORDER.filter((role) => {
    let chance = chances[role];
    if (role === 'texture' && !mood.textures.length) chance = 0;
    if (role === 'drone') chance += mood.dark * 0.3;
    if (role === 'drums') chance = mood.kits.length ? mood.drums[song.style === 'ambient' ? 0 : 1] : 0;
    // no roll for a guitar in a mood without one, so adding guitars left every other mood's seeds
    // making the songs they made before
    if (role === 'guitar' && !chance) return false;
    return rng.chance(chance);
  });
  // something has to play the chords
  if (!roles.some((role) => role === 'pad' || role === 'keys' || role === 'guitar')) roles.push(rng.pick(['pad', 'keys']));
  // an arp and a counter melody both weave round the melody, and together they turned into clutter,
  // so a song gets one or the other
  if (roles.includes('arp') && roles.includes('counter')) roles.splice(roles.indexOf(rng.pick(['arp', 'counter'])), 1);
  for (const role of MIDDLE) if (roles.filter((one) => MIDDLE.includes(one)).length > 2 && roles.includes(role)) roles.splice(roles.indexOf(role), 1);
  // loud, quiet, loud: a second, cleaner guitar for the quiet sections (pickArrangement)
  const twoGuitars = roles.includes('guitar') && !!mood.quiet && rng.chance(mood.loudQuiet || 0);
  // seven at most (six in ambient songs, which want room), losing the least needed first
  // (a sparse or lush modifier takes some off or adds one, mood.most, but never past seven)
  const most = Math.max(2, Math.min(7, MOST_LAYERS[song.style] + (mood.most || 0))) - (twoGuitars ? 1 : 0);
  // a fight keeps its bass and beat, losing the scenery and the pad first
  const spare = FIGHTS[song.style] ? ['counter', 'arp', 'drone', 'bells', 'keys', 'texture', 'pad'] : ['counter', 'arp', 'drone', 'bells', 'keys', 'bass'];
  for (const role of spare) if (roles.length > most) roles.splice(roles.indexOf(role), roles.includes(role) ? 1 : 0);
  const ids = ROLE_ORDER.filter((one) => roles.includes(one)).map((role) => [role, role]);
  if (twoGuitars) ids.splice(ids.findIndex(([, id]) => id === 'guitar') + 1, 0, ['guitar', 'guitar-2']);
  if (song.style === 'ambient' && roles.includes('texture') && roles.length < most && mood.textures.length > 1 && mood.textures.some((id) => !INSTRUMENTS[id].bed) && rng.chance(SECOND_TEXTURE)) ids.push(['texture', 'texture-2']);
  // one at a time, so each layer can see the ones dressed before it (no two playing the same instrument)
  song.layers = ids.map(([role, id]) => ({ ...clone(LAYER_DEFAULTS), id, role }));
  for (const layer of dressOrder(song.layers)) dressLayer(song, layer, rng, true);
  fitBand(song);
}

// the order a band is dressed in: the score's, except that in a band with a guitar the melody and the
// guitars choose first. a dream pop song's two clean guitars went to its tune and counter melody,
// which left the guitar to draw an overdrive from a nearby mood
const dressRank = (layer) => (layer.role === 'melody' ? 0 : layer.role === 'guitar' ? 1 : 2);
const dressOrder = (layers) => (layers.some((layer) => layer.role === 'guitar') ? [...layers].sort((a, b) => dressRank(a) - dressRank(b)) : layers);

// layers that play behind the melody. they get a lower harshness cap, and are darker and quieter,
// so the tune is always the thing you hear
const BACKING = { counter: true, arp: true, keys: true, guitar: true, pad: true, drone: true, bass: true };
// the harshest instrument a mood allows (edge in synth.js), less for backing layers
const maxEdge = (mood, role) => moodEdge(mood) * (BACKING[role] ? 0.75 : 1);

// an instrument for a layer: from the mood's palette, now and then (12%) something from outside it so
// songs in a mood don't all sound alike, but only from families that suit the role (WILDCARDS), never
// harsher than the mood allows, and never one another layer is already playing. two layers on the
// same instrument blur into each other, and a harsh lead over gentle backing was the commonest clash
//
// the band also has to sound like one band. chip sounds (world: 'chip' in synth.js) and acoustic ones
// ('acoustic') never share a song: a chip kit under a harp and a music box, or a triangle bass under a
// nylon guitar and a choir, sounded like two songs at once. whichever is picked first (the melody,
// usually) sets the world, and the rest keep to it or to sounds that go with anything. and the
// surprise instrument only comes from moods about as dark as this one (kindred), so a playful song
// can't draw the haunted pad
const APART = { chip: 'acoustic', acoustic: 'chip' };
// a mood with no surprises (the loud and hazy ones) keeps to itself the other way too: its
// instruments aren't other moods' surprises
// (the mood's own palette always counts, which matters for a blended or fight mood: it isn't in MOODS)
const paletteOf = (mood) => [...Object.values(mood.palette).flat(), ...(mood.quiet || [])];
const kindred = (mood) => new Set([...paletteOf(mood), ...Object.values(MOODS).filter((other) => other.surprise !== 0 && Math.abs(other.dark - mood.dark) <= 0.25).flatMap(paletteOf)]);
// recordings of real instruments sound more alive than the synthesised versions, so a mood's palette
// leans towards the ones that have them (samples in synth.js), three to one. the synthesised ones are
// still picked, just less often, and a mood whose palette is all synths (neon, synthwave, the chip
// sounds) is as it was. it's on what an instrument has, not on whether the files loaded, so the same
// seed always picks the same band
const preferRecorded = (id) => [id, INSTRUMENTS[id].samples ? 3 : 1];
function pickInstrument(song, layer, rng) {
  const mood = songMood(song);
  const { role } = layer;
  const family = roleFamily(role);
  const anything = Object.keys(INSTRUMENTS).filter((id) => instrumentFits(id, role));
  const others = song.layers.filter((other) => other !== layer && INSTRUMENTS[other.instrument]);
  const worlds = new Set(others.map((other) => INSTRUMENTS[other.instrument].world));
  const belongs = (id) => !APART[INSTRUMENTS[id].world] || !worlds.has(APART[INSTRUMENTS[id].world]);
  if (family !== 'tonal') {
    // (a kit or texture that's a place's own, the death whistle or the bobobo drums, is only ever where
    // a mood names it, never a stand in for a mood with none)
    const free = anything.filter((id) => !INSTRUMENTS[id].own);
    let pool = family === 'kit' ? mood.kits : mood.textures;
    if (!pool.length) pool = free;
    // a second texture is a different one, and two steady beds (rain and a stream) are one too many
    const textures = others.filter((other) => other.role === 'texture').map((other) => other.instrument);
    let wanted = pool.filter((id) => belongs(id) && !textures.includes(id) && !(INSTRUMENTS[id].bed && textures.some((other) => INSTRUMENTS[other].bed)));
    // a band none of the mood's kits belong with (a chip tune made jazzy, whose kits are all brushes)
    // borrows a kit that does, one that plays the mood's beats if it can. it used to take an acoustic
    // kit anyway, and a chip lead over brushes sounded like two songs
    if (!wanted.length && family === 'kit') {
      const beats = moodPatterns(song, 'drums');
      const fitting = free.filter(belongs);
      wanted = fitting.filter((id) => INSTRUMENTS[id].suits.some((pattern) => beats.includes(pattern)));
      if (!wanted.length) wanted = fitting;
    }
    return rng.pick(wanted.length ? wanted : pool);
  }
  const cap = maxEdge(mood, role);
  const taken = new Set(others.filter((other) => roleFamily(other.role) === 'tonal').map((other) => other.instrument));
  // a reversed sound swells over its whole note, and a drone's note is a whole section: minutes of
  // swelling, then a sudden stop
  // (a hair over the cap still fits: 0.6 x 0.75 is 0.4499... in floating point, which kept an instrument
  // rated 0.45 out of a mood capped at exactly that. metal's edge was 1.25 to get round this once before)
  const fits = (id) => INSTRUMENTS[id].edge <= cap + 1e-9 && !taken.has(id) && !(role === 'drone' && INSTRUMENTS[id].reverse) && belongs(id);
  // the second guitar of a loud, quiet, loud song is one of the mood's cleaner ones (quiet)
  const list = (layer.id === 'guitar-2' && mood.quiet) || mood.palette[role] || [];
  const palette = list.filter(fits);
  const kin = kindred(mood);
  // an instrument that's its mood's own (own in synth.js) is never a surprise anywhere else
  const wild = anything.filter((id) => WILDCARDS[role].includes(INSTRUMENTS[id].family) && fits(id) && kin.has(id) && !INSTRUMENTS[id].own);
  if (palette.length && !(wild.length && rng.chance(mood.surprise ?? 0.12))) return rng.weighted(palette.map(preferRecorded));
  if (wild.length) return rng.weighted(wild.map(preferRecorded));
  // nothing fits: the gentlest in the mood's list that belongs with the band, or failing that the
  // gentlest, or for a role the mood never has (a guitar added by hand to a calm song) the gentlest
  // of the role's own kind of instrument
  const gentlest = (ids) => [...ids].sort((a, b) => INSTRUMENTS[a].edge - INSTRUMENTS[b].edge)[0];
  return gentlest(list.filter((id) => belongs(id) && !taken.has(id))) || gentlest(list)
    || gentlest(anything.filter((id) => WILDCARDS[role].includes(INSTRUMENTS[id].family) && !taken.has(id))) || gentlest(anything);
}

// a layer's instrument, pattern, tone and mix. fresh: a new layer, so it gets a seed and pattern too
function dressLayer(song, layer, rng, fresh) {
  const mood = songMood(song);
  const { role } = layer;
  layer.instrument = pickInstrument(song, layer, rng);
  // a new instrument plays its usual recording (layer.recording is one of its others, picked on the page)
  delete layer.recording;
  const instrument = INSTRUMENTS[layer.instrument];
  const edge = instrument.edge || 0;
  // struck and plucked things (keys, bells, basses) get no vibrato and hardly any detune: a wobbling
  // piano under a steady pad sounds out of tune rather than warm, and a strummed harp chord in a dark
  // mood had its strings beating against each other
  const struck = instrument.family === 'keys' || instrument.family === 'guitar' || instrument.family === 'bell' || instrument.family === 'bass';
  if (fresh) {
    layer.seed = newToken(rng);
    layer.pattern = rng.pick(moodPatterns(song, role));
    layer.rate = mood.energy > 0.75 ? rng.pick(['medium', 'fast', 'fast']) : mood.energy < 0.35 ? rng.pick(['slow', 'medium']) : rng.pick(['medium', 'medium', 'fast']);
    layer.span = rng.pick([1, 2, 2]);
    layer.octave = role === 'bells' ? rng.weighted([[0, 5], [1, 1], [-1, 1]]) : role === 'melody' ? rng.weighted([[0, 6], [-1, 1]]) : 0;
  }
  // a singer (an instrument with a home) sings where they sing: an octave down, a throat singer was a
  // recording stretched a whole octave
  if (instrument.home) layer.octave = 0;
  const busy = song.style !== 'ambient' ? 0.35 + mood.energy * 0.5 : 0.3 + mood.energy * 0.5;
  // (a modifier can make every part busier or sparser: mood.busy)
  layer.density = clamp01(busy + (mood.busy || 0) + rng.range(-0.15, 0.2));
  // drums follow the mood's energy: as loud under a calm song as under an angry one, they were the
  // first thing you heard
  // a buried tune (shoegaze's singer) sits lower, in among the guitars
  const volumes = { melody: 0.68 * (1 - (mood.bury || 0) * 0.2), counter: 0.5, arp: 0.42, bells: 0.45, keys: 0.52, guitar: 0.62, pad: 0.55, drone: 0.48, bass: 0.68, drums: 0.42 + mood.energy * 0.24, texture: 0.5 };
  // harsher backing sits lower in the mix. not a guitar: its speaker cabinet has already taken the
  // harshness off, and rock guitars sit up with the tune
  layer.volume = clamp01((volumes[role] + rng.range(-0.06, 0.06)) * (BACKING[role] && role !== 'guitar' ? 1 - edge * 0.25 : 1));
  // a guitar's rig already spreads it left and right (double tracked, or a chorus), so it stays near
  // the middle
  const centred = role === 'bass' || role === 'drums' || role === 'drone';
  layer.pan = centred ? 0 : Math.round(rng.range(-0.45, 0.45) * (role === 'guitar' ? 0.4 : 1) * 100) / 100;
  // drums and bass stay fairly dry: a big room smears the beat, and the echo (often a dotted beat)
  // adds hits that aren't on the groove, which made the drums sound out of time
  const wet = { melody: 0.65, counter: 0.7, arp: 0.7, bells: 1.1, keys: 0.75, guitar: 0.45, pad: 1, drone: 0.9, bass: 0.15, drums: 0.15, texture: 0.6 };
  layer.reverb = clamp01(mood.space * wet[role] * rng.range(0.75, 1.15));
  const echoes = { melody: 0.4, counter: 0.3, arp: 0.5, bells: 0.6, keys: 0.25, guitar: 0.15 };
  layer.echo = clamp01((echoes[role] || 0) * mood.space * rng.range(0.4, 1.3));
  // in a tune, chords have to arrive on the beat with the drums, so pads swell in and let go quicker.
  // not plucked strings: they already start at once, and cutting their ring short is what made the
  // harp's notes end harshly
  const chordy = song.style !== 'ambient' && (role === 'pad' || role === 'keys' || role === 'drone') && instrument.kind !== 'pluck';
  // brightness: near the mood's, a touch darker for backing, and never pushing a harsh instrument
  // brighter than it was made (edge 1 stays at 1x at most, a soft one can go to 1.6x). it used to swing
  // anywhere from 0.4x to 2.2x on anything, and doubled saw leads and bells were painful. drums and
  // textures have no edge, so the mood's energy caps them instead: hi hats at 1.5x in a calm song
  // hissed over everything, and so did bright rain
  const bright = 2 ** (rng.range(-0.35, 0.35) + (mood.bright - 0.5) * 0.8) * (BACKING[role] ? 0.85 : 1);
  const ceiling = role === 'drums' ? 0.75 + mood.energy * 0.35 : role === 'texture' ? 0.9 : 1 + (1 - edge) * 0.6;
  // drums ring the length their kit gives them, not longer in a big room: that made every kick boom.
  // chords in tunes let go a little quicker, but not much: at 0.55 they stopped dead like a keyboard
  // let go of, which is half of what sounded "midi"
  const release = rng.range(0.7, 1.6) * (0.7 + mood.space * 0.5) * (chordy ? 0.8 : 1);
  layer.tone = {
    // (calm, slow and dreamy soften every attack: mood.soft)
    attack: rng.range(0.6, 1.6) * (mood.energy > 0.7 ? 0.7 : 1) * (chordy ? 0.4 : 1) * (mood.soft || 1),
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
//     under everything when there's no tune. wind and rain used to bury the melody. two textures sit
//     a little lower each, so together they're no louder than one
//   - with an arp, keys strum (a chord a bar) rather than breaking chords, comping on the groove or
//     playing oom-pah: any of those and an arp both chopping up the middle was clutter. and with anything moving in the middle (an arp,
//     broken or oom-pah keys), a pad holds its chords rather than pulsing or stabbing
//   - running notes no faster than six a second (MAX_RATE). a 16th note arp at 130 bpm under a tune
//     was a blur that fought it for your ear
const MAX_RATE = 6;
function fitBand(song) {
  const find = (role) => song.layers.find((layer) => layer.role === role);
  const arp = find('arp');
  const melody = find('melody');
  const busyKeys = song.layers.some((layer) => layer.role === 'keys' && (layer.pattern === 'broken' || layer.pattern === 'waltz'));
  const textures = song.layers.filter((layer) => layer.role === 'texture').length;
  // how far under the tune backing sits: 0.1, less for a mood that buries its tune (shoegaze)
  const gap = 0.1 * (1 - (songMood(song).bury || 0));
  for (const layer of song.layers) {
    // (jazz comping, a bossa rhythm and a reggae skank are a few chords a bar, not running notes, so
    // they can stay)
    if (arp && layer.role === 'keys' && !['comp', 'bossa', 'skank'].includes(layer.pattern)) layer.pattern = 'strum';
    // a plucked drone (the tanpura) can't hold a note for a whole section, its string dies, so it's
    // plucked round and round
    if (layer.role === 'drone' && INSTRUMENTS[layer.instrument]?.kind === 'pluck') layer.pattern = 'cycle';
    if ((arp || busyKeys) && layer.role === 'pad' && (layer.pattern === 'pulse' || layer.pattern === 'stabs')) layer.pattern = 'sustain';
    while (usesRate(layer) && layer.rate !== 'slow' && song.tempo / 60 / rateStep(layer.rate, METERS[song.meter].sub) > MAX_RATE) layer.rate = layer.rate === 'fast' ? 'medium' : 'slow';
    if (!melody && layer.role === 'counter' && layer.pattern === 'harmony') layer.pattern = 'answer';
    if (melody && BACKING[layer.role] && layer.role !== 'bass') layer.volume = Math.min(layer.volume, Math.max(0.2, melody.volume - gap));
    const suits = layer.role === 'drums' && INSTRUMENTS[layer.instrument]?.suits;
    if (suits && !suits.includes(layer.pattern)) {
      // a fight falls back on any fight's beat the kit can play before the kit's own first
      const wanted = [...moodPatterns(song, 'drums'), ...(FIGHTS[song.style] ? STYLE_PATTERNS.boss.drums : [])];
      layer.pattern = wanted.find((pattern) => suits.includes(pattern)) || suits[0];
    }
    if (layer.role === 'texture') layer.volume = Math.min(layer.volume, (melody ? melody.volume * 0.55 : 0.42) * (textures > 1 ? 0.85 : 1));
  }
  spread(song);
}

// where the band stands. a mixing engineer puts the tune, the bass and the kick in the middle and the
// parts that fill in either side of it, opposite each other, so each has its own place: keys on the left
// answered by the arp or counter melody on the right. every part used to be put anywhere from left to
// right at random, so the keys, the arp and the counter melody could all end up on one side, on top of
// each other, which is a lot of why a full band sounded crowded. the side each starts on comes from the
// seed, and how far out from each layer's own pan, so songs still differ
// (not pads, which are already spread wide, or textures, which place each sound left or right)
const SIDES = ['keys', 'counter', 'arp', 'guitar', 'bells'];
function spread(song) {
  let side = hashText(song.seed) % 2 ? 1 : -1;
  const melody = song.layers.find((layer) => layer.role === 'melody');
  if (melody) melody.pan = Math.max(-0.12, Math.min(0.12, melody.pan));
  for (const role of SIDES) {
    for (const layer of song.layers.filter((one) => one.role === role)) {
      // (a guitar's rig already spreads it, and two guitars take turns, so they stay near the middle)
      const far = Math.max(role === 'guitar' ? 0.05 : 0.2, Math.abs(layer.pan));
      layer.pan = Math.round(side * far * 100) / 100;
      side = -side;
    }
  }
}

// how many bars a part's progression takes to go round once
function partBars(song, part) {
  const turns = parseProgression(song.parts[part]).slots.reduce((sum, slot) => sum + slot.slots, 0) || 1;
  return turns * song.chordBars;
}

// loud, quiet, loud (the pixies, nirvana, and the grunge bands after them): with two guitars, the
// cleaner one plays the quiet sections and the dirtier one stamps in for the loud ones (energy LOUD
// or more, or the song's loudest if none reach it), the way a guitarist stamps on a distortion pedal
// for the chorus
const LOUD = 0.85;
function pickArrangement(song, rng) {
  const mood = songMood(song);
  const form = rng.pick((song.style === 'tune' && mood.forms) || FORMS[song.style]);
  const entry = {};
  for (const layer of song.layers) entry[layer.id] = rng.range(...ROLE_ENTRY[layer.role]);
  // the song opens on its mood's opening parts (MOODS opens), two in a tune and one in an ambient
  // song, and they play the whole way through, so the intro already sounds like the song. layers came
  // in by energy alone, so an intro was often a lone pad or nothing but the texture: a happy song
  // started out ambient, and the band arriving with the melody sounded like a different song
  const lowest = Math.min(...form.map(([, , , energy]) => energy));
  const wanted = mood.opens.map((role) => song.layers.find((layer) => layer.role === role)).filter(Boolean);
  const anyone = song.layers.filter((layer) => OPENERS.includes(layer.role));
  for (const layer of [...new Set([...wanted, ...anyone])].slice(0, OPENING[song.style])) entry[layer.id] = Math.min(entry[layer.id], lowest);
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
    // energy: how hard the section's played (feel), so a quiet intro is softer than the chorus
    return { name, part, bars, play, energy };
  });
  const guitars = song.layers.filter((layer) => layer.role === 'guitar');
  if (guitars.length === 2) {
    const [quiet, loud] = [...guitars].sort((a, b) => INSTRUMENTS[a.instrument].edge - INSTRUMENTS[b.instrument].edge);
    const top = Math.max(...form.map(([, , , energy]) => energy));
    song.sections.forEach((section, i) => {
      section.play = section.play.filter((id) => id !== quiet.id && id !== loud.id);
      section.play.push(form[i][3] >= Math.min(LOUD, top) ? loud.id : quiet.id);
    });
  }
  addSolo(song, rng, form);
}

// a solo: the tune stretches out into a long line that doesn't repeat (solo() below), over the
// theme's chords, just before the theme comes back for the last time, the way a song's middle
// eight or a guitar break does. sometimes the counter melody takes it and the melody rests, so a
// new voice gets the spotlight. the other line (bells, a counter melody) sits it out, so the solo
// isn't fighting anyone. section.lead is which layer solos; any section can have one, on the page.
// a rock mood says how often (MOODS solo) and solos over its chorus (soloOver), before the last one
const SOLO_CHANCE = { tune: 0.6, ambient: 0.35, boss: 0.75, mini: 0.25 };
function addSolo(song, rng, form) {
  const mood = songMood(song);
  const melody = song.layers.find((layer) => layer.role === 'melody');
  const chance = song.style === 'tune' && mood.solo !== undefined ? mood.solo : SOLO_CHANCE[song.style];
  if (!melody || song.sections.length < 4 || !rng.chance(chance)) return;
  // the theme's (part A's, or the chorus's) last full time round, as long as it isn't the very start.
  // a fight solos over its second theme, the climax
  const part = (song.style !== 'ambient' && mood.soloOver) || 'A';
  let at = -1;
  for (let i = 2; i < song.sections.length; i++) if (song.sections[i].part === part && form[i][2] >= 8 && song.sections[i].play.includes(melody.id)) at = i;
  if (at < 0) return;
  const counter = song.layers.find((layer) => layer.role === 'counter');
  const lead = counter && rng.chance(0.4) ? counter : melody;
  const theme = song.sections[at];
  const play = theme.play.filter((id) => id !== melody.id && !['bells', 'counter'].includes(song.layers.find((layer) => layer.id === id).role));
  song.sections.splice(at, 0, { name: song.style !== 'ambient' ? 'Solo' : 'Wander', part: theme.part, bars: theme.bars, play: [...play, lead.id], lead: lead.id, energy: theme.energy });
}

function pickSpace(song, rng) {
  const mood = songMood(song);
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
    if (rng.chance(0.2)) layer.pattern = rng.pick(moodPatterns(song, layer.role));
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
    // a track made by hand (blankSong), not written from the seed: only there when it is
    ...(d.own === true ? { own: true } : {}),
    mood: MOODS[d.mood] ? d.mood : 'calm',
    // only there when there are some, so a song without modifiers saves as it always did. a song saved
    // with a blend (before modifiers replaced them) loses it, but keeps everything the blend picked
    ...(cleanMods(d.mods).length ? { mods: cleanMods(d.mods) } : {}),
    style: STYLES[d.style] ? d.style : 'ambient',
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
    // which of the instrument's recordings it plays, only kept if it's one of its others (more in
    // synth.js), so a song that plays the usual one saves as it always did
    if (INSTRUMENTS[layer.instrument].more?.[raw.recording]) layer.recording = raw.recording;
    layer.pattern = PATTERNS[raw.role][raw.pattern] ? raw.pattern : Object.keys(PATTERNS[raw.role])[0];
    // a layer that plays only the notes added by hand (composeSong), so nothing's written for it. kept
    // out of songs that don't have one, so they save as they always did. a texture has no notes to draw
    if (raw.hand === true && roleFamily(raw.role) !== 'texture') layer.hand = true;
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
      // a note is [beat, midi, length], and then, for the note editor's tools, as many of these as it
      // needs: the midi it slides to, the beats the slide takes, cents of vibrato, the slide's shape
      // (CURVES in synth.js), a swell (1 growing, -1 dying away) and how hard it's played (0 for the
      // usual 0.75) and a palm mute. see packEdit
      const pitch = (midi) => Math.round(Math.min(127, Math.max(0, midi)));
      const add = (Array.isArray(edit.add) ? edit.add.slice(0, 2000) : [])
        .filter((note) => Array.isArray(note) && note.length >= 3 && note.every((n) => Number.isFinite(n)))
        .map((raw) => {
          const one = unpackEdit(raw);
          const slides = pitch(one.to) !== pitch(one.midi);
          return packEdit({
            t: Math.max(0, one.t), midi: pitch(one.midi), dur: Math.min(64, Math.max(0.05, one.dur)), to: pitch(one.to),
            glide: slides ? Math.min(64, Math.max(0.01, one.glide)) : 0, shake: Math.min(60, Math.max(0, one.shake)),
            curve: slides ? Math.round(Math.min(3, Math.max(0, one.curve))) : 0, swell: Math.sign(Math.round(one.swell)),
            vel: Math.round(Math.min(1, Math.max(0, one.vel)) * 100) / 100, mute: one.mute ? 1 : 0,
          });
        });
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
      // the layer playing a solo here (addSolo), only kept if it's one that can
      ...(ids.has(raw.lead) && SOLOISTS[song.layers.find((layer) => layer.id === raw.lead).role] ? { lead: raw.lead } : {}),
      // how hard it's played, 0 to 1 (feel). songs from before this had none, and play as they did
      ...(typeof raw.energy === 'number' && Number.isFinite(raw.energy) ? { energy: num(raw.energy, 0, 1, 0.75) } : {}),
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

// a song that ends comes home: the last chord of an ambient song or a tune is the home chord. the end
// of a part's progression is often the chord that leads back round (a IV or a V), which is right for
// going round again and wrong for stopping: the outro just stopped, mid thought. a fight loops forever
// under a battle, so it's left leading back into its start
function cadence(song, last) {
  if (!last || FIGHTS[song.style]) return;
  const chord = last.chords[last.chords.length - 1];
  const home = diatonicChord(harmonySteps(song.scale), 0);
  const root = mod12(song.key + home.root);
  if (chord.root === root && chord.tones[1] === home.tones[1]) return;
  // coloured like any other chord, from its place, so it's the same every time
  const tones = colourChord(home.tones, home.root, song.colour, makeRng(song.seed, 'colour', 'home'));
  Object.assign(chord, { root, tones, pcs: new Set(tones.map((tone) => mod12(root + tone))), name: chordName(root, tones), home: true });
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
  cadence(song, sections[sections.length - 1]);
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
        // (an instrument with a home, a throat singer or a didgeridoo, sits around its own note: moved
        // more than a few semitones from where it was recorded, it sounds like someone else)
        center: (INSTRUMENTS[layer.instrument]?.home ?? ROLES[layer.role].center) + layer.octave * 12,
        steps: SCALES[song.scale].steps,
        melody: melodyBySection[section.index] || null,
      };
      c.tonic = near(song.key, c.center);
      // a solo is its own line, so the part's hand edits (made on its usual tune) don't apply to it
      const leading = section.lead === layer.id;
      // (a layer played by hand has nothing written for it, just its edits)
      let made = (leading ? solo(c) : layer.hand ? [] : COMPOSERS[layer.role](c)).filter((note) => note.t >= section.start - 1e-6 && note.t < section.end - 1e-6);
      // a singer (home) sings every note within about three quarters of an octave of their own: a tune's
      // range is only a guide (a part B sung higher, a note snapping up to a chord), and a throat
      // singer's recording moved further sounds like someone else. a note that wanders off is sung an
      // octave nearer. (notes added by hand are left where they were put)
      const home = INSTRUMENTS[layer.instrument]?.home;
      if (home) {
        for (const note of made) {
          while (note.midi > home + 9) note.midi -= 12;
          while (note.midi < home - 9) note.midi += 12;
        }
      }
      if (!leading) made = applyEdits(made, layer.edits[section.part], section);
      if (layer.role === 'melody' && !melodyBySection[section.index]) melodyBySection[section.index] = made;
      out.push(...made);
    }
    parts[layer.id] = out;
  }
  listen(song, sections, parts);
  // then each player adds what they'd add to the written notes: slides, bends, graces (ornament)
  ornament(song, sections, parts);
  const notes = [];
  for (const layer of layers) {
    let out = parts[layer.id];
    if (layer.role === 'drone' || layer.role === 'texture') out = joinHeld(out);
    feel(out, song, layer, sections);
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
const GIVE_WAY = { keys: 'drop', guitar: 'drop', pad: 'drop', arp: 'move', bells: 'move', counter: 'move' };
// the upper of two notes a minor second (or a minor ninth, or more octaves) above the lower
const rubs = (a, b) => mod12(Math.max(a, b) - Math.min(a, b)) === 1;

//   - in a solo section, the soloist is the tune (section.lead), and it doesn't give way to itself
//   - a riff's line moves too (riff()), on the guitar and on a bass doubling it alike, so the two
//     never rub against each other either. dropping a riff note that rubbed left a hole in the riff
function listen(song, sections, parts) {
  const melody = song.layers.find((layer) => layer.role === 'melody');
  const inside = (section) => (note) => note.t >= section.start - 1e-6 && note.t < section.end - 1e-6;
  const tune = sections.flatMap((section) => (parts[section.lead || melody?.id] || []).filter(inside(section))).sort((a, b) => a.t - b.t);
  if (!tune.length) return;
  const soloing = (layer, note) => sections.some((section) => section.lead === layer.id && inside(section)(note));
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
    if (!GIVE_WAY[layer.role] && !parts[layer.id].some((note) => note.line)) continue;
    const floor = ROLES[layer.role].center + layer.octave * 12 - 12;
    parts[layer.id] = parts[layer.id].filter((note) => {
      // a riff's line (note.line, on the guitar and a bass doubling it) moves like any other line
      const rule = note.line ? 'move' : GIVE_WAY[layer.role];
      if (!rule || note.added || soloing(layer, note)) return true;
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
        // under the tune, or for a note that couldn't drop under it (a low tune), no further over it
        if (chord.pcs.has(mod12(midi)) && !clashes(midi) && (midi <= ceiling || midi < note.midi)) {
          note.written ??= note.midi;
          note.midi = midi;
          break;
        }
      }
      return true;
    });
  }
}

// ---------- ornaments ----------
//
// what a player adds to the written notes without thinking about it: the things that make a fiddle
// tune sound like a fiddler and not a music box. this is most of the gap between real music and midi,
// where every note starts dead on its pitch and stays there. each instrument says which ornaments a
// player of it uses and how often (ornaments in synth.js), the mood says how much it likes them
// (ornate), and they're added here, after the band's listened and before feel. they're bends on the
// notes themselves (note.bend, pins in beats, which synth.js plays with pitchMods), so nothing's added
// or taken away: the tune, its rhythm and every rule above stay as they were. only the playing changes:
//   slide   portamento: the note starts on the last note's pitch and slides onto its own, when the two
//           are joined up (legato) and no more than a fifth apart. glide is how long, in seconds
//   bend    a guitarist or harmonica player bending up onto the note from bendBy semitones under
//   grace   a quick flick from the scale note above, before the note (a fiddler's cut)
//   trill   a mordent on a long note: the note, the one above, and back, quickly
//   fall    the end of a phrase falling away (a sax or trumpet player's "fall off")
//   shake   a wide vibrato on a long note (note.shake, cents): a guitarist shaking a held note
//   stop    a double stop, a second note a third under a long, strong one (fiddles, pedal steel). the
//           only one that adds a note, which is marked stop
//   release the other way round from a bend: the string's already bent up when it's picked, then let
//           down onto the note (a guitarist's "pre-bend and release", a pedal steel's pedal let off, a
//           koto player lifting their hand off the string)
//   doit    the end of a note flicking up and away, the jazz trumpeter's or sax player's opposite of a
//           fall (said "doyt")
//   swell   a long note shaped instead of held flat (note.swell): growing through the middle of a
//           phrase, the way a violinist or a horn player leans into a long note, and dying away at the
//           end of one
// and one that isn't dice: a slur (note.slur). a wind or bow player only starts the breath or the bow
// on a phrase's first note, and the notes after it come straight out of the one before. so the joined
// notes of a blown, bowed or sung line (or a synth lead, which played legato doesn't start its envelope
// again) are slurred: no puff, no scoop, no fade in, just the new pitch. a repeated note is tongued
// again, as players do. without it every note of a flute tune started like a new phrase, which was a
// lot of what still sounded like a keyboard playing a flute
// slides and bends are curved (the third number of a pin, CURVES in synth.js): a slide is quick and
// settles onto its note, a bend is smooth, a fall speeds up as it drops
// the dice for each come from the note's place: its section's part, its bar in a four bar phrase, its
// beat in the bar and its length. so a motif that comes back is ornamented the same way, the way a
// player has their own way of playing a phrase. hand drawn notes are left as they were drawn
const ORNAMENTED = { melody: true, counter: true, bass: true, guitar: true };
function ornament(song, sections, parts) {
  const amount = (songMood(song).ornate ?? 1) * (song.style === 'ambient' ? 0.6 : 1);
  if (amount <= 0) return;
  const spb = 60 / song.tempo;
  const beats = (seconds) => seconds / spb;
  const bpb = METERS[song.meter].beats;
  const scalePcs = new Set(SCALES[song.scale].steps.map((step) => mod12(song.key + step)));
  // how far the next scale note is above (or below, way -1) a pitch
  const scaleStep = (midi, way) => {
    for (let k = 1; k <= 3; k++) if (scalePcs.has(mod12(midi + k * way))) return k;
    return 2;
  };
  const placeOf = (note) => {
    const section = sections.find((one) => note.t < one.end - 1e-6) || sections[sections.length - 1];
    const bar = Math.floor((note.t - section.start) / bpb + 1e-9);
    return `${section.part}|${bar % 4}|${Math.round((note.t - section.start - bar * bpb) * 12)}|${Math.round(note.dur * 12)}`;
  };
  for (const layer of song.layers) {
    const inst = INSTRUMENTS[layer.instrument];
    if (!inst || !ORNAMENTED[layer.role] || !parts[layer.id]) continue;
    if (layer.role === 'melody' || layer.role === 'counter') slurs(inst, parts[layer.id]);
    const can = inst.ornaments;
    if (!can) continue;
    const roll = (what, note, p) => p > 0 && makeRng(song.seed, layer.seed, 'ornament', what, placeOf(note)).chance(Math.min(0.95, p * amount));
    const glide = beats(can.glide ?? 0.1);
    const notes = parts[layer.id].filter((note) => !note.added && !note.bend && !note.mute).sort((a, b) => a.t - b.t || a.midi - b.midi);
    if (layer.role === 'guitar') {
      // sliding into a chord from the last one, all its strings together (smells like teen spirit's
      // slides between power chords). only between chords that are joined up and close by
      const chords = [];
      for (const note of notes) {
        if (chords.length && Math.abs(chords[chords.length - 1][0].t - note.t) < 0.05) chords[chords.length - 1].push(note);
        else chords.push([note]);
      }
      for (let i = 1; i < chords.length; i++) {
        const [before, now] = [chords[i - 1], chords[i]];
        const move = before[0].midi - now[0].midi;
        const joined = Math.abs(before[0].t + before[0].dur - now[0].t) < 0.15;
        if (now.length < 2 || !joined || !move || Math.abs(move) > 5 || !roll('slide', now[0], can.slide)) continue;
        for (const note of now) note.bend = [[0, move], [Math.min(glide, note.dur * 0.5), 0, 2]];
      }
      continue;
    }
    const stops = [];
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const before = notes[i - 1];
      const after = notes[i + 1];
      const joined = before && note.t - (before.t + before.dur) < Math.max(0.1, before.dur * 0.15) && note.t > before.t + 1e-6;
      const move = before ? before.midi - note.midi : 0;
      const ending = !after || after.t - (note.t + note.dur) >= 0.5;
      // one change of pitch a note: the first of these that comes up
      if (joined && move && Math.abs(move) <= 7 && note.dur >= 0.4 && roll(`slide${Math.sign(move)}`, note, can.slide)) {
        // (a trombone's slide, a singer's or a fretless's glide is smooth all the way; anything faster
        // gets there quickly and settles)
        note.bend = [[0, move], [Math.min(glide, note.dur * 0.5), 0, can.glide >= 0.15 ? 1 : 2]];
      } else if (layer.role === 'bass') {
        continue;
      } else if (note.dur >= 0.75 && roll('bend', note, can.bend)) {
        note.bend = [[0, -(can.bendBy ?? 2)], [Math.min(beats(0.14), note.dur * 0.4), 0, 1]];
      } else if (note.dur >= 0.75 && roll('release', note, can.release)) {
        const hold = Math.min(beats(0.12), note.dur * 0.25);
        note.bend = [[0, can.bendBy ?? 2], [hold, can.bendBy ?? 2], [hold + Math.min(beats(0.2), note.dur * 0.3), 0, 1]];
      } else if (note.dur >= 0.5 && roll('grace', note, can.grace)) {
        const up = scaleStep(note.midi, 1);
        const flick = Math.min(beats(0.06), note.dur * 0.2);
        note.bend = [[0, up], [flick, up], [flick + beats(0.012), 0]];
      } else if (note.dur >= 1.5 && roll('trill', note, can.trill)) {
        const up = scaleStep(note.midi, 1);
        const flick = Math.min(beats(0.07), note.dur * 0.1);
        const snap = beats(0.01);
        note.bend = [[0, 0], [flick, 0], [flick + snap, up], [flick * 2, up], [flick * 2 + snap, 0]];
      } else if (note.dur >= 0.5 && ending && roll('fall', note, can.fall)) {
        note.bend = [[Math.max(0, note.dur - beats(0.12)), 0], [note.dur + beats(0.15), -4, 3]];
      } else if (note.dur >= 0.5 && ending && roll('doit', note, can.doit)) {
        note.bend = [[Math.max(0, note.dur - beats(0.1)), 0], [note.dur + beats(0.12), 3, 3]];
      }
      if (note.dur >= 1.5 && roll('swell', note, can.swell)) note.swell = ending ? -1 : 1;
      if (note.dur >= 1 && roll('shake', note, can.shake)) note.shake = 18 + 8 * makeRng(song.seed, layer.seed, 'wide', placeOf(note)).next();
      // a double stop on a long note on the beat: a third under it in the scale
      if (note.dur >= 1 && Math.abs(note.t - Math.round(note.t)) < 1e-6 && roll('stop', note, can.stop)) {
        const third = note.midi - scaleStep(note.midi, -1) - scaleStep(note.midi - scaleStep(note.midi, -1), -1);
        stops.push({ t: note.t, dur: note.dur, midi: third, vel: note.vel * 0.75, stop: true, ...(note.bend ? { bend: note.bend } : {}) });
      }
    }
    parts[layer.id].push(...stops);
  }
}

// slurs (see ornament): every joined note of a blown, bowed or sung line after the first, unless it's
// the same pitch again. a struck or plucked instrument can't slur, and nor can a synth that's meant to
// pluck (its sound dies away, env's sustain), so it's the instruments that hold a note: the ones that
// scoop onto it, the voices, and the held synth leads
const legato = (inst) => (inst.kind === 'sub' || inst.kind === 'choir') && inst.env[2] >= 0.6 && (inst.scoop || inst.kind === 'choir' || inst.family === 'lead');
function slurs(inst, notes) {
  if (!legato(inst)) return;
  const line = notes.filter((note) => !note.added && !note.stop).sort((a, b) => a.t - b.t);
  for (let i = 1; i < line.length; i++) {
    const [before, note] = [line[i - 1], line[i]];
    if (note.t - (before.t + before.dur) < 0.1 && note.t > before.t + 1e-6 && note.midi !== before.midi) note.slur = true;
  }
}

// a note's key for edits: where it starts in its section, and its pitch
const editKey = (relative, midi) => `${+relative.toFixed(3)}:${midi}`;

// a hand drawn note (layer.edits' add) from its numbers to named parts and back. the numbers are
// [beat, midi, length, to, glide, shake, curve, swell, vel, mute], with as many left off the end as are their
// defaults, so a plain note is three numbers and a song from before slides were drawn reads the same.
// vel 0 means the usual strength (0.75), and mute 1 a palm muted note: they're only kept by notes
// taken over from a written part
const EDIT_FIELDS = ['t', 'midi', 'dur', 'to', 'glide', 'shake', 'curve', 'swell', 'vel', 'mute'];
function unpackEdit([t, midi, dur, to = midi, glide = 0, shake = 0, curve = 0, swell = 0, vel = 0, mute = 0]) {
  return { t, midi, dur, to, glide, shake, curve, swell, vel, mute };
}
function packEdit(one) {
  const out = EDIT_FIELDS.map((key) => (key === 'to' ? one.to ?? one.midi : one[key] ?? 0));
  let length = out.length;
  while (length > 3 && out[length - 1] === (EDIT_FIELDS[length - 1] === 'to' ? out[1] : 0)) length--;
  return out.slice(0, length);
}

function applyEdits(notes, edit, section) {
  if (!edit) return notes;
  const removed = new Set(edit.remove);
  const kept = notes.filter((note) => !removed.has(editKey(note.t - section.start, note.midi)));
  for (const raw of edit.add) {
    const { t, midi, dur, to, glide, shake, curve, swell, vel, mute } = unpackEdit(raw);
    if (t >= section.beats) continue;
    const length = Math.min(dur, section.beats - t);
    // a slide drawn with the note editor's slide tool: from midi to to, over glide beats in its shape,
    // then held
    const slide = to !== midi ? { bend: [[0, 0], [Math.min(glide, length), to - midi, ...(curve ? [curve] : [])]] } : {};
    kept.push({ t: section.start + t, dur: length, midi, vel: vel || 0.75, added: true, ...slide, ...(shake ? { shake } : {}), ...(swell ? { swell } : {}), ...(mute ? { mute: true } : {}) });
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
const LOOSE = { melody: 1, counter: 1, bells: 1, arp: 0.5, keys: 0.6, guitar: 0.3, pad: 0.4, bass: 0.15, drums: 0.1, drone: 0, texture: 0 };
const pocket = (song, t) => makeRng(song.seed, 'pocket', Math.round(t * 12)).range(-1, 1) * song.humanise * 0.012;
// dynamics: a section is played as hard as its energy (pickArrangement), so an intro is softer than
// the chorus, and the last bar before a louder section swells up into it, the way a band lifts into a
// chorus together. every note used to be played as hard in a quiet intro as in the last chorus, and
// that flatness was a lot of the midi feel. an energy of 0.75 (or none, in songs from before this) is
// played as written. the drums already play to the room (COMPOSERS.drums), so they're left alone
function loudness(sections, t, bpb) {
  const at = sections.find((section) => t < section.end - 1e-6) || sections[sections.length - 1];
  const energy = at.energy ?? 0.75;
  let k = 0.8 + 0.27 * energy;
  const next = sections[at.index + 1];
  if (next && (next.energy ?? 0.75) > energy + 0.15 && t >= at.end - bpb) k *= 1 + (0.12 * (t - (at.end - bpb))) / bpb;
  return k;
}

function feel(notes, song, layer, sections = null) {
  const rng = makeRng(song.seed, layer.seed, 'feel');
  // swing pushes every off beat later: a beat's second half starts at 0.5 + swing / 4 instead of 0.5.
  // 6/8 already lilts in threes, and swinging its thirds just knocked them out of line, so it doesn't
  const swing = METERS[song.meter].sub === 2 ? song.swing : 0;
  const middle = 0.5 + swing * 0.25;
  const own = LOOSE[layer.role] * song.humanise;
  for (const note of notes) {
    note.gt = note.t;
    if (layer.role === 'drone' || layer.role === 'texture') continue;
    if (sections && layer.role !== 'drums') note.vel = clamp01(note.vel * loudness(sections, note.gt, METERS[song.meter].beats));
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
//   k kick, s snare, h hat, o open hat, p perc (rim, shaker or tick, or a rock kit's ride), l low perc
//   (toms or taiko), y crash (the open hat on a kit without one), c comping: where chord stabs, the
//   syncopated bass and power chords go
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
    // four to the floor: a kick on every beat and the hats on the off beats, the club beat (crystal
    // castles). the stabs and bass sit off the beat, between the kicks
    four: [
      { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.', c: '..x...x...x...x.' },
      { k: 'x...x...x...x...', s: '....x.......x...', h: 'x-.-x-.-x-.-x-.-', o: '..x...x...x...x.', c: '..x...x...x...x.' },
      { k: 'x...x...x...x..-', s: '....x.......x...', h: '-.x.-.x.-.x.-.x.', p: '.......-......-.', c: 'x..x..x...x..x..' },
    ],
    // a breakbeat: the kick skipping round a snare that's mostly on 2 and 4, with ghost notes. the
    // drum machine grooves under aphex twin's ambient, and dying light's chases
    break: [
      { k: 'x.x.......x.....', s: '....x..-.x..x..-', h: 'x.x.x.x.x.x.x.x.', c: 'x.x.......x.....' },
      { k: 'x.........xx....', s: '....x.......x...', h: 'x-x-x-x-x-x-x-x-', p: '......-.......-.', c: 'x.........x.....' },
    ],
    // rock: the kick on 1 and 3 with a push, the snare cracking on 2 and 4, eighth hats (the ride in
    // part B, RIDES). the comping is where power chords land
    rock: [
      { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', c: 'x.....x.....x...' },
      { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', c: 'x.....x.x.......' },
      { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x...', o: '..............x.', c: 'x.......x.....x.' },
      { k: 'x..x....x.x.....', s: '....x.......x..-', h: 'x.x.x.x.x.x.x.x.', c: 'x..x....x.......' },
    ],
    // punk: kick and snare taking turns every eighth (the skank beat of hardcore and thrash), or the
    // d-beat, the kick on 1, the and of 2, and 3. the guitar strums every eighth
    punk: [
      { k: 'x...x...x...x...', s: '..x...x...x...x.', h: 'x.x.x.x.x.x.x.x.', c: 'x.x.x.x.x.x.x.x.' },
      { k: 'x.....x.x.....x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', c: 'x.....x.x.....x.' },
    ],
    // double kick: sixteenths on the kick under the backbeat, or the gallop (an eighth and two
    // sixteenths), metal's engine
    double: [
      { k: 'xxxxxxxxxxxxxxxx', s: '....x.......x...', p: 'x...x...x...x...', c: 'x.......x.......' },
      { k: 'x.xxx.xxx.xxx.xx', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', c: 'x...x...x...x...' },
      { k: 'x.x.x.x.x.x.x.x.', s: '....x.......x...', p: 'x.x.x.x.x.x.x.x.', c: 'x.......x.......' },
    ],
    // a breakdown: half time, the kick lurching in a rhythm the guitar chugs along with, a crash or
    // the ride on every beat
    breakdown: [
      { k: 'x..x..x...x.x...', s: '........x.......', y: 'x...x...x...x...', c: 'x..x..x...x.x...' },
      { k: 'x.....x.....x...', s: '........x.......', p: 'x...x...x...x...', c: 'x.....x.....x...' },
    ],
    // wash: shoegaze's steady beat under a ride left ringing, or the floor tom rolling instead of hats
    wash: [
      { k: 'x.......x.......', s: '....x.......x...', p: 'x.x.x.x.x.x.x.x.', c: 'x.......x.......' },
      { k: 'x.....x.x.......', s: '....x.......x...', p: 'x.x.x.x.x.x.x.x.', c: 'x.....x.........' },
      { k: 'x.......x.......', s: '....x.......x...', l: 'x.x.x.x.x.x.x.x.', c: 'x.......x.......' },
      { k: 'x...x...x...x...', s: '....x.......x...', p: 'x.x.x.x.x.x.x.x.', c: 'x.......x.......' },
    ],
    // swing: the ride's "ding, ding-a ding" (the hat line, which a jazz kit plays on its ride), the hi
    // hat's foot on two and four (the open hat line, a jazz kit's foot chick), a feathered kick and the
    // snare dropping in quietly. feel swings the eighths
    swing: [
      { k: '-.......-.......', s: '......-.......-.', h: 'x...x.x.x...x.x.', o: '....x.......x...', c: 'x.....x.........' },
      { k: '-...-...-...-...', s: '..........-....-', h: 'x...x.x.x...x.x.', o: '....x.......x...', c: '......x.....x...' },
    ],
    // bossa nova: the kick's long-short heartbeat, the rim click playing the clave (the snare line, the
    // latin kit's rim), and a shaker in sixteenths
    bossa: [
      { k: 'x.....x.x.....x.', s: 'x..x..x...x..x..', h: 'x-x-x-x-x-x-x-x-', c: 'x..x..x...x..x..' },
      { k: 'x..x....x..x....', s: '..x..x..x...x...', h: 'x-x-x-x-x-x-x-x-', p: '.......-......x.', l: '...........x....', c: 'x.....x...x.....' },
    ],
    // tala: the tabla's keherwa, eight strokes a bar, "dha ge na ti na ka dhi na" (k the bayan, s the
    // dayan's na, h ti, p ka, o the open tun)
    tala: [
      { k: 'x.x.........x...', s: 'x...x...x.....x.', h: '......x.........', p: '..........x.....', o: '............x...', c: 'x.......x.......' },
      { k: 'x.x.........x...', s: 'x...x...x.....x.', h: '..-...x...-...-.', p: '..........x.....', o: '............x...', c: 'x.......x.......' },
    ],
    // funk: a busy, syncopated kick, ghost notes on the snare round the backbeat, sixteenth hats (soft
    // ones between, so they're a groove rather than a hiss), the hat opening into the next bar
    funk: [
      { k: 'x.x...x..x..x...', s: '....x..-.-..x..-', h: 'x-x-x-x-x-x-x-x-', c: 'x..x..x...x.x...' },
      { k: 'x..x...xx.x.....', s: '....x.......x.-.', h: 'x-x-x-x-x-x-x-x-', o: '..............x.', c: 'x..x...x..x.....' },
    ],
    // one drop: reggae's beat, the kick and the snare together on the third beat and nothing on the
    // first. the comping is on the off beats, where the skank goes
    onedrop: [
      { k: '........x.......', s: '........x.......', h: 'x.x.x.x.x.x.x.x.', c: '..x...x...x...x.' },
      { k: '........x.......', s: '....-...x...-...', h: 'x.x.x.x.x.x.x.x.', o: '......x.......x.', c: '..x...x...x...x.' },
    ],
    // train: country's snare chugging along like a steam train, accents on two and four, the kick on
    // one and three (boom chick)
    train: [
      { k: 'x.......x.......', s: '-.-.x.-.-.-.x.-.', c: 'x...x...x...x...' },
      { k: 'x.......x.....x.', s: '-.-.x.-.-.-.x.-x', c: 'x...x...x...x...' },
    ],
    // shuffle: the blues' beat, a kick on one and three, the snare on two and four and the hats in
    // eighths, all swung into triplets by feel
    shuffle: [
      { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', c: 'x...x...x...x...' },
      { k: 'x.....x.x.......', s: '....x..-....x..-', h: 'x.x.x.x.x.x.x.x.', c: 'x.....x.x.....x.' },
    ],
    // boom bap: hip hop's, a lazy kick skipping round a snare cracking on two and four, eighth hats,
    // swung by the mood (j dilla, pete rock, nujabes)
    boombap: [
      { k: 'x.........x..x..', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', c: 'x.........x.....' },
      { k: 'x..x......x.....', s: '....x.......x..-', h: 'x.x.x.x.x.x.x.x.', o: '..............x.', c: 'x..x......x.....' },
      { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', p: '.......-.......-', c: 'x.......x.x.....' },
    ],
    // trap: half time, the snare (a clap) on the third beat, the 808's kick skipping round it, and the
    // hats rolling in quick runs
    trap: [
      { k: 'x......x..x.....', s: '........x.......', h: 'x.x.x.xxx.x.x.xx', c: 'x......x..x.....' },
      { k: 'x.....x...x..x..', s: '........x.......', h: 'xxx.x.x.x.x.xxxx', o: '...........x....', c: 'x.....x...x.....' },
    ],
    // maqsum: egypt's beat, doum tek - tek doum - tek - (the low drum and the sharp one), the riq's
    // jingles running under it. and baladi, its heavier cousin, two doums to start
    maqsum: [
      { k: 'x.......x.......', s: '..x...x.....x...', h: 'x-x-x-x-x-x-x-x-', c: 'x.....x.x.......' },
      { k: 'x.x.....x.......', s: '......x.....x...', h: 'x-x-x-x-x-x-x-x-', o: '..............x.', c: 'x.x.....x.......' },
    ],
    // gallop: horses on the steppe, a long beat and two quick ones (da-da-dum) on the low drum, bells
    // on the beat
    gallop: [
      { k: 'x.......x.......', l: 'x.xxx.xxx.xxx.xx', h: 'x...x...x...x...', c: 'x...x...x...x...' },
      { k: 'x...x...x...x...', l: '..xx..xx..xx..xx', s: '....x.......x...', c: 'x...x...x...x...' },
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
    four: [{ k: 'x...x...x...', s: '........x...', h: '..x...x...x.', c: '..x...x...x.' }],
    break: [{ k: 'x.x.......x.', s: '....x..-.x..', h: 'x.x.x.x.x.x.', c: 'x.x.......x.' }],
    rock: [{ k: 'x.......x...', s: '....x.......', h: 'x.x.x.x.x.x.', c: 'x.......x...' }],
    punk: [{ k: 'x...x...x...', s: '..x...x...x.', h: 'x.x.x.x.x.x.', c: 'x.x.x.x.x.x.' }],
    double: [{ k: 'xxxxxxxxxxxx', s: '....x...x...', p: 'x...x...x...', c: 'x...........' }],
    breakdown: [{ k: 'x..x..x.....', s: '........x...', y: 'x...x...x...', c: 'x..x..x.....' }],
    wash: [{ k: 'x.......x...', s: '....x.......', p: 'x.x.x.x.x.x.', c: 'x.......x...' }],
    // a jazz waltz, bossa in three, dadra (the tabla's six beat cycle: dha dhin na, dha tin na), and the rest
    swing: [{ k: '-...........', s: '......-.....', h: 'x...x.x.x...', o: '....x...x...', c: 'x...........' }],
    bossa: [{ k: 'x.....x.....', s: 'x..x..x.....', h: 'x-x-x-x-x-x-', c: 'x..x..x.....' }],
    tala: [{ k: 'x.x...x.....', s: 'x...x.x...x.', o: '..x.....x...', c: 'x.....x.....' }],
    funk: [{ k: 'x.x...x..x..', s: '....x..-.-..', h: 'x-x-x-x-x-x-', c: 'x..x..x.....' }],
    onedrop: [{ k: '....x.......', s: '....x.......', h: 'x.x.x.x.x.x.', c: '..x...x...x.' }],
    train: [{ k: 'x...........', s: '-.-.x.-.x.-.', c: 'x...x...x...' }],
    shuffle: [{ k: 'x.......x...', s: '....x.......', h: 'x.x.x.x.x.x.', c: 'x...x...x...' }],
    boombap: [{ k: 'x.......x.x.', s: '....x.......', h: 'x.x.x.x.x.x.', c: 'x.......x...' }],
    trap: [{ k: 'x.....x..x..', s: '......x.....', h: 'x.x.xxx.x.xx', c: 'x.....x.....' }],
    maqsum: [{ k: 'x...........', s: '....x...x.x.', h: 'x-x-x-x-x-x-', c: 'x...x...x...' }],
    gallop: [{ k: 'x...........', l: 'x.xxx.xxx.xx', h: 'x...x...x...', c: 'x...x...x...' }],
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
    four: [{ k: 'x..x..', s: '...x..', h: '.xx.xx', c: '.x..x.' }],
    break: [{ k: 'x.x...', s: '...x.-', h: 'xxxxxx', c: 'x.x...' }],
    rock: [{ k: 'x.....', s: '...x..', h: 'xxxxxx', c: 'x..x..' }],
    punk: [{ k: 'x.x.x.', s: '.x.x.x', h: 'xxxxxx', c: 'xxxxxx' }],
    double: [{ k: 'xxxxxx', s: '...x..', p: 'x..x..', c: 'x..x..' }],
    breakdown: [{ k: 'x.x...', s: '...x..', y: 'x..x..', c: 'x.x...' }],
    wash: [{ k: 'x.....', s: '...x..', p: 'xxxxxx', c: 'x..x..' }],
    swing: [{ k: '-.....', s: '....-.', h: 'x.xx.x', o: '...x..', c: 'x.....' }],
    bossa: [{ k: 'x..x..', s: 'x.x..x', h: 'xxxxxx', c: 'x..x..' }],
    tala: [{ k: 'xx.x..', s: 'x.xx.x', o: '.x..x.', c: 'x..x..' }],
    funk: [{ k: 'x.x...', s: '...x.-', h: 'x-x-x-', c: 'x.x...' }],
    onedrop: [{ k: '...x..', s: '...x..', h: 'x.xx.x', c: '.x..x.' }],
    train: [{ k: 'x.....', s: '-.x-.x', c: 'x..x..' }],
    shuffle: [{ k: 'x..x..', s: '...x..', h: 'x.xx.x', c: 'x..x..' }],
    boombap: [{ k: 'x....x', s: '...x..', h: 'x.xx.x', c: 'x....x' }],
    trap: [{ k: 'x....x', s: '...x..', h: 'xxxxxx', c: 'x....x' }],
    maqsum: [{ k: 'x..x..', s: '..x..x', h: 'xxxxxx', c: 'x..x..' }],
    gallop: [{ k: 'x..x..', l: 'x.xx.x', c: 'x..x..' }],
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
    four: [{ k: 'x...x...x...x...x...', s: '....x.......x.......', h: '..x...x...x...x...x.', c: '..x...x...x...x...x.' }],
    break: [{ k: 'x.x.......x...x.....', s: '....x..-.x......x...', h: 'x.x.x.x.x.x.x.x.x.x.', c: 'x.x.......x...x.....' }],
    rock: [{ k: 'x.......x...x.......', s: '....x...........x...', h: 'x.x.x.x.x.x.x.x.x.x.', c: 'x.......x...x.......' }],
    punk: [{ k: 'x...x...x...x...x...', s: '..x...x...x...x...x.', h: 'x.x.x.x.x.x.x.x.x.x.', c: 'x.x.x.x.x.x.x.x.x.x.' }],
    double: [{ k: 'xxxxxxxxxxxxxxxxxxxx', s: '........x.......x...', p: 'x...x...x...x...x...', c: 'x...........x.......' }],
    breakdown: [{ k: 'x..x..x.....x..x....', s: '........x...........', y: 'x...x...x...x...x...', c: 'x..x..x.....x..x....' }],
    wash: [{ k: 'x.......x...x.......', s: '....x...........x...', p: 'x.x.x.x.x.x.x.x.x.x.', c: 'x...........x.......' }],
    swing: [{ k: '-...........-.......', s: '......-.........-...', h: 'x...x.x.x...x.x.x...', o: '....x.......x.......', c: 'x...........x.......' }],
    bossa: [{ k: 'x.....x.x.....x.x...', s: 'x..x..x...x..x..x...', h: 'x-x-x-x-x-x-x-x-x-x-', c: 'x..x..x...x..x..x...' }],
    // jhaptaal, the tabla's ten beat cycle: dhi na, dhi dhi na, ti na, dhi dhi na
    tala: [{ k: 'x...x.x.......x.x...', s: '..x.....x...x.....x.', h: '..........x.........', o: 'x...x.x.......x.x...', c: 'x.........x.........' }],
    funk: [{ k: 'x.x...x..x..x.x.....', s: '....x..-....x..-....', h: 'x-x-x-x-x-x-x-x-x-x-', c: 'x..x..x.....x..x....' }],
    onedrop: [{ k: '........x.......x...', s: '........x...........', h: 'x.x.x.x.x.x.x.x.x.x.', c: '..x...x...x...x...x.' }],
    train: [{ k: 'x.......x.......x...', s: '-.-.x.-.-.-.x.-.x.-.', c: 'x...x...x...x...x...' }],
    shuffle: [{ k: 'x.......x...x.......', s: '....x...........x...', h: 'x.x.x.x.x.x.x.x.x.x.', c: 'x...x...x...x...x...' }],
    boombap: [{ k: 'x.........x..x......', s: '....x.......x.......', h: 'x.x.x.x.x.x.x.x.x.x.', c: 'x.........x.........' }],
    trap: [{ k: 'x......x..x.........', s: '........x.......x...', h: 'x.x.x.xxx.x.x.xxx.x.', c: 'x......x..x.........' }],
    maqsum: [{ k: 'x.......x.......x...', s: '..x...x.....x.....x.', h: 'x-x-x-x-x-x-x-x-x-x-', c: 'x.....x.x.......x...' }],
    gallop: [{ k: 'x...........x.......', l: 'x.xxx.xxx.xxx.xxx.xx', h: 'x...x...x...x...x...', c: 'x...x...x...x...x...' }],
  },
};
// the drum each groove line plays (KIT_SLOTS order in synth.js)
const GROOVE_SLOTS = { k: 0, s: 1, h: 2, o: 3, p: 4, l: 5, y: 6 };
// the grooves that get busier in B parts, and the ones whose fills and section crashes are loud
const LIFTS = { groove: true, halftime: true, march: true, four: true, break: true, rock: true, punk: true, double: true, funk: true, boombap: true };
// the quieter grooves that still fill into a new part (a jazz drummer's fill, a tihai on the tabla).
// the quietest (pulse, sparse) never do: a drum roll in the middle of a calm song made it jump
const FILLS = { brush: true, tribal: true, swing: true, tala: true, bossa: true, shuffle: true, train: true, onedrop: true, maqsum: true, gallop: true };
// the rock grooves. their drummer fills down the toms, crashes at the top of every phrase in a loud
// part, and (rock and punk) moves from the hats to the ride for the chorus
const ROCK = { rock: true, punk: true, double: true, breakdown: true, wash: true };
const RIDES = { rock: true, punk: true };

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
  const kind = drums ? drums.pattern : song.style !== 'ambient' ? 'groove' : 'pulse';
  // a breakdown (metal, hardcore): part C goes half time and heavy, the guitar chugging on the kick,
  // instead of dropping quiet
  const breakdown = part === 'C' && song.style !== 'ambient' && !!songMood(song).breakdown;
  const written = makeRng(song.seed, drums ? drums.seed : '', 'groove').pick(GROOVES[song.meter][breakdown ? 'breakdown' : kind]);
  const steps = written.k.length;
  const perBeat = steps / METERS[song.meter].beats;
  const lines = {};
  for (const name of [...Object.keys(GROOVE_SLOTS), 'c']) lines[name] = [...(written[name] || '.'.repeat(steps))].map((char) => (char === 'x' ? 1 : char === '-' ? 0.5 : 0));
  if (!written.c) lines.c = lines.k.slice();
  if (part === 'B' && LIFTS[kind]) {
    // lifted: soft hats in between, and an open hat on the last off beat pushing into the next bar.
    // only for the pop grooves: it put busy 16th hats into quiet sparse beats and jazz brushes. a rock
    // drummer moves the hats over to the ride instead (perc, on a rock kit)
    if (RIDES[kind] && lines.h.some(Boolean)) {
      lines.p = lines.p.map((v, i) => Math.max(v, lines.h[i]));
      lines.h = lines.h.map(() => 0);
    } else if (perBeat === 4) lines.h = lines.h.map((v, i) => v || (i % 2 ? 0.5 : 0));
    const push = steps - Math.ceil(perBeat / 2);
    lines.o[push] = 1;
    lines.h[push] = 0;
  }
  if (part === 'C' && !breakdown) {
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
    // [1.5, 1.5, 1] and [0.75, 0.75, 0.5] are the tresillo (3 + 3 + 2), the push under countless
    // game and club riffs
    slow: [[2], [4], [3, 1], [1.5, 0.5, 2], [2, 2], [1, 3], [1.5, 1.5, 1]],
    mid: [[1, 1], [1.5, 0.5], [0.5, 0.5, 1], [1, 0.5, 0.5], [2], [0.75, 0.25, 1], [1], [0.75, 0.75, 0.5]],
    fast: [[0.5, 0.5], [0.25, 0.25, 0.5], [0.5, 0.25, 0.25], [0.75, 0.25], [1], [0.5, 1, 0.5], [0.75, 0.75, 0.5]],
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
// cutting out. a sparse melody is long notes instead, and it breathes at the ends of phrases (tune()).
// length: beats to fill, a bar unless it's half of one (a hook, makeMotif)
function makeBar(rng, c, density, length = c.bpb) {
  const cells = CELLS[c.sub];
  const out = [];
  let t = 0;
  while (t < length - 1e-6) {
    const speed = rng.weighted({ slow: 1.2 - density, mid: 0.6, fast: Math.max(0, density - 0.35) * 1.5 });
    for (const cell of rng.pick(cells[speed])) {
      if (t >= length - 1e-6) break;
      const dur = Math.min(cell, length - t);
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

// ---------- melodies ----------
//
// a tune people remember is mostly one idea coming back. game composers (koji kondo, toby fox, c418,
// concernedape) build whole themes from one short motif: played again, moved up or down a step (a
// sequence), turned upside down, answered, and brought back changed in other parts (a leitmotif). so
// every melody here grows from one motif. it used to be a random walk of steps, a new one every part,
// and nothing in it came back for you to remember
//   - the motif is a rhythm and a shape (CONTOURS): the shapes memorable tunes take, like a leap up and
//     steps back down, an arch, or a note repeated then left
//   - it's made from the layer's own seed, so it's the same tune in every part. part B either sings it
//     higher or has its own, answering one, and part C slows it down or has its own (tune())
//   - a short motif is played twice in its bar, the second time a step away: a hook
//   - a theme is longer than its motif. it has a second idea too, with its own rhythm (slower if the
//     motif's busy, busier if it's slow), and its four bar phrases pair up as a question and an answer:
//     both start with the motif, the first stops on a note that wants to go on and the second comes
//     home. a long section is a whole tune, a a b a: question, answer, a middle phrase that starts
//     somewhere new, then the answer again. stardew valley's themes run sixteen bars like this before
//     they come round. it used to be one four bar plan over and over, built from the motif alone, so a
//     whole song's melody had as few as one bar rhythm and it sounded like a short loop
//   - later times round a part, the tune is a little changed: its last phrase can go another way, and
//     now and then a long note gets a passing note, the way a player decorates a tune they've played
//   - a phrase can start with a pickup, a note or two leading into its first beat
//   - strong beats still land on the chord's notes, so it fits whatever chords are under it
//   - it's played like a person would: a little louder towards the middle of a phrase and on higher
//     notes, and softer as it comes to rest
//   - a solo (solo()) is made the same way, from new ideas instead of the theme

// how far each note of a motif sits from its first, in scale steps. each is set up with the motif's
// random numbers, then gives the step for note i of n
const CONTOURS = {
  // a leap up, then steps back down into the gap it left
  leap: (rng) => { const up = rng.int(3, 5); return (i) => (i ? up - (i - 1) : 0); },
  // up and back down, highest around the middle
  arch: (rng) => { const top = rng.int(2, 4); return (i, n) => Math.round(top * Math.sin((Math.PI * i) / Math.max(2, n))); },
  // round one note and back to it, a turn
  turn: (rng) => { const way = rng.pick([1, -1]); return (i) => [0, way, 0, -way][i % 4]; },
  // a run up the scale, or one falling from above
  climb: () => (i) => Math.min(i, 5),
  fall: (rng) => { const top = rng.int(3, 5); return (i) => top - Math.min(i, top + 2); },
  // one note a few times, then away and back: a rhythm you could tap (toby fox's favourite)
  repeat: (rng) => { const move = rng.pick([1, 2, 3, -1, -2]); const hold = rng.int(2, 3); return (i, n) => (i < Math.min(hold, n - 1) || (i - Math.min(hold, n - 1)) % 2 ? 0 : move); },
  // rocking between two notes, like a call
  pendulum: (rng) => { const gap = rng.pick([2, 3, 4, -2, -3]); return (i) => (i % 2 ? gap : 0); },
};
// ambient tunes drift and circle more, tunes leap and repeat more
const CONTOUR_WEIGHTS = {
  ambient: { arch: 3, turn: 2, pendulum: 2, fall: 2, leap: 1.5, climb: 1, repeat: 0.5 },
  tune: { leap: 2.5, arch: 2, repeat: 2, climb: 1.5, turn: 1.5, pendulum: 1, fall: 1.5 },
};

// a motif: one bar of notes, { t, dur, step }. hook: half a bar played twice, the second time the
// same or a step away. contour and rhythm can be passed in, to keep one of them from another motif.
// it tries a few times for a rhythm with at least two lengths of note (or one long one, in a slow
// tune): notes all the same length are what make a tune sound like a scale exercise
function makeMotif(rng, c, density, hook, contour = null, rhythm = null) {
  const shape = contour || CONTOURS[rng.weighted(CONTOUR_WEIGHTS[c.song.style === 'ambient' ? 'ambient' : 'tune'])](rng);
  if (!rhythm) {
    const length = hook ? c.bpb / 2 : c.bpb;
    for (let tries = 0; tries < 6; tries++) {
      rhythm = makeBar(rng, c, density, length);
      if ((rhythm.length === 1 && density < 0.5) || new Set(rhythm.map((n) => n.dur.toFixed(3))).size > 1) break;
    }
    if (hook) rhythm = [...rhythm, ...rhythm.map((n) => ({ t: n.t + length, dur: n.dur, again: true }))];
  }
  const half = rhythm.filter((n) => !n.again).length;
  const echo = rng.pick([0, 1, -1, 2]);
  const notes = rhythm.map((n, i) => ({ t: n.t, dur: n.dur, step: n.again ? shape(i - half, half) + echo : shape(i, half) }));
  return { notes, rhythm, contour: shape };
}

// where a phrase comes to rest: an answer on the chord's root, a question on its third or fifth,
// which leave it hanging
function landing(c, degree, chord, closed) {
  for (let k = 0; k <= 4; k++) {
    for (const d of [degree - k, degree + k]) {
      const pc = mod12(degreeMidi(c, d));
      if (closed ? pc === chord.root : chord.pcs.has(pc) && pc !== chord.root) return d;
    }
  }
  return chordDegree(c, degree, chord);
}

// how a phrase is built, bar by bar: m the motif, s the motif a step up or down (each s further
// along), v the motif's rhythm with new notes, i the motif upside down, b the second idea, e the ending
// (the first half of an idea, then a long note to rest on). questions end open and answers come home.
// a long tune's middle phrase starts somewhere new. riffs repeat their hook bar after bar, with no
// ending until the section's last bar, and get a turn of their own in the middle of a long section
const QUESTION_PLANS = [['m', 'm', 'v', 'e'], ['m', 's', 'b', 'e'], ['m', 'b', 'm', 'e'], ['m', 'v', 'b', 'e'], ['m', 's', 's', 'e'], ['m', 'i', 'b', 'e']];
const ANSWER_PLANS = [['m', 'm', 'b', 'e'], ['m', 's', 'v', 'e'], ['m', 'b', 's', 'e'], ['m', 'v', 'm', 'e'], ['m', 'i', 'm', 'e'], ['m', 's', 'm', 'e']];
const MIDDLE_PLANS = [['b', 'b', 's', 'e'], ['b', 's', 'b', 'e'], ['v', 'b', 'b', 'e'], ['i', 'i', 'b', 'e'], ['b', 'v', 'b', 'e']];
const RIFF_PLANS = [['m', 'm', 'm', 'm'], ['m', 'm', 's', 'm'], ['m', 's', 'm', 's'], ['m', 'm', 'm', 'v']];
const RIFF_MIDDLES = [['b', 'b', 'm', 'm'], ['b', 'm', 'b', 'm'], ['m', 'b', 'm', 'b']];

// how busy a layer's tune is, for its pattern: a long note melody is slow, a riff busy
const tuneDensity = (layer) => ({ long: layer.density * 0.3, riff: Math.max(0.75, layer.density), fragments: layer.density * 0.6 })[layer.pattern] ?? (layer.role === 'counter' ? layer.density * 0.8 : layer.density);

// the layer's motif, the same in every part (and quoted in its solos)
function themeMotif(c, density, riff) {
  const theme = makeRng(c.song.seed, c.layer.seed, 'motif', c.layer.role);
  const hook = c.bpb % 2 === 0 && theme.chance(riff ? 1 : c.song.style !== 'ambient' ? 0.45 : 0.25);
  return { theme, hook, motif: makeMotif(theme, c, density, hook) };
}

// cells ({ t in the bar, dur, degree }, and settled, soft or breath) to notes. strong beats and long
// notes go onto a chord note, the nearest one the way the shape was heading: plain nearest pulled a
// step up straight back onto the note before, and long, slow tunes flattened into one note over and
// over. swell and the note's height above anchor shape how loud it is, like a player's phrasing
function sing(c, cells, barStart, low, high, swell = 0, anchor = 0) {
  const out = [];
  let raw = null;
  let played = null;
  for (const cell of cells) {
    const t = barStart + cell.t;
    const chord = chordAt(c, t);
    let { degree } = cell;
    if (!cell.settled && (isStrong(c, t) || cell.dur >= 1)) {
      const way = raw === null ? 0 : Math.sign(cell.degree - raw);
      const ahead = [0, 1, 2].map((k) => degree + way * k).find((d) => chord.pcs.has(mod12(degreeMidi(c, d))) && (!way || (d - played) * way > 0));
      degree = ahead ?? chordDegree(c, degree, chord);
    }
    raw = cell.degree;
    played = degree;
    if (degree > high + 2) degree -= c.steps.length;
    if (degree < low - 2) degree += c.steps.length;
    const gap = cell.breath ? Math.min(0.5, cell.dur * 0.25) : 0;
    const strength = (cell.soft ? 0.62 : isStrong(c, t) ? 0.85 : 0.68) + swell + Math.max(-0.04, Math.min(0.05, (degree - anchor) * 0.01));
    out.push({
      // nearly legato, so the line sings rather than ticks. never longer than its cell: 6/8's sixth
      // of a beat notes were stretched to a whole step, so two melody notes sounded at once
      t, dur: Math.max(Math.min(c.step, cell.dur * 0.97), (cell.dur - gap) * 0.97),
      midi: fitToChord(degreeMidi(c, degree), chord, c.scalePcs),
      vel: Math.min(0.95, strength + c.rng.range(-0.05, 0.05)),
    });
  }
  return out;
}

// a passing note: the longest note of a beat or more split in two, the second half a step away
function decorate(cells, rng, unit) {
  const long = cells.reduce((best, cell) => (cell.dur >= 1 && (!best || cell.dur > best.dur) ? cell : best), null);
  if (!long) return cells;
  const half = Math.max(unit, Math.round(long.dur / 2 / unit) * unit);
  return cells.flatMap((cell) => (cell === long ? [{ ...cell, dur: half }, { t: cell.t + half, dur: cell.dur - half, degree: cell.degree + rng.pick([1, -1]) }] : [cell]));
}

// a phrase's swell: louder towards its middle, softer as it comes to rest
const SWELL = [0, 0.03, 0.05, -0.03];

// a melody (or a counter melody's own tune). riff: a hook over and over. rests: every other two bar
// phrase is left empty and the last note rings into it, for the sparse piano of c418 and aphex twin
// a singer's tune keeps near their own note (home): a few scale steps down and about an octave up at
// most. throat sung tunes are narrow anyway, and a voice moved far from where it was recorded stops
// sounding like that singer
const singerSpan = (c, low, high) => (INSTRUMENTS[c.layer.instrument]?.home ? [Math.max(low, -3), Math.min(high, 4)] : [low, high]);
function tune(c, { density, low: wide, high: tall, plan4, riff, rests }) {
  const [low, high] = singerSpan(c, wide, tall);
  const { song, layer, rng } = c;
  const { theme, hook, motif: themed } = themeMotif(c, density, riff);
  let motif = themed;
  let variant = makeMotif(theme, c, density, hook, null, motif.rhythm);
  const seq = theme.pick([1, -1, -1, 2]);
  let base = theme.int(0, 2);
  const pickup = !rests && density >= 0.4 && theme.chance(song.style !== 'ambient' ? 0.5 : 0.25);
  // the second idea: a rhythm of its own, slower when the motif's busy and busier when it's slow
  const contrast = density > 0.55 ? density * 0.55 : Math.min(0.95, density + 0.3);
  let second = makeMotif(theme, c, contrast, false);
  // what this part does with it. A plays it as it is
  const treat = makeRng(song.seed, layer.seed, 'treat', c.section.part);
  const way = c.section.part === 'B' ? treat.weighted({ raise: 2, own: 2 }) : c.section.part === 'C' ? treat.weighted({ slow: 2, own: 1 }) : 'same';
  if (way === 'raise') base += treat.int(2, 3);
  if (way === 'own') motif = makeMotif(treat, c, density, hook);
  if (way === 'slow') motif = makeMotif(treat, c, density * 0.45, false, motif.contour);
  if (way === 'own' || way === 'slow') {
    variant = makeMotif(treat, c, density, false, null, motif.rhythm);
    second = makeMotif(treat, c, way === 'slow' ? density * 0.7 : contrast, false);
  }

  const phraseBars = rests ? 2 : c.bars >= 4 && (plan4 || riff || rng.chance(0.75)) ? 4 : Math.min(2, c.bars);
  const phrases = Math.ceil(c.bars / phraseBars);
  const question = rng.pick(riff ? RIFF_PLANS : QUESTION_PLANS);
  const answer = riff ? question : rng.pick(ANSWER_PLANS);
  const middle = rng.pick(riff ? RIFF_MIDDLES : MIDDLE_PLANS);
  const planFor = (phrase) => {
    // fragments: mostly the motif, the second idea every fourth time
    if (rests) return Math.floor(phrase / 2) % 4 === 2 ? ['b', 'e'] : ['m', 'e'];
    // two bar phrases take turns: the motif, new notes on its rhythm, the motif, the second idea
    if (phraseBars === 2) return [['m', 'e'], ['v', 'e'], ['m', 'e'], ['b', 'e']][phrase % 4];
    if (phraseBars < 2) return ['e'];
    if (phrase % 4 === 2 && phrases >= 4) return middle;
    return phrase % 2 ? answer : question;
  };
  // a later time round a part can change how its last phrase goes (c.vary is per time round)
  const lastPlan = c.section.take > 0 && c.vary.chance(0.5) ? c.vary.pick(riff ? RIFF_PLANS : ANSWER_PLANS).slice(4 - phraseBars) : null;
  // each phrase starts from an anchor, moved so the ideas' whole span stays inside the range
  const steps = [...motif.notes, ...variant.notes, ...second.notes].flatMap((n) => [n.step, -n.step]);
  const top = Math.max(0, ...steps) + Math.max(0, seq * 2);
  const bottom = Math.min(0, ...steps) + Math.min(0, seq * 2);
  const fit = (degree) => Math.max(low - bottom, Math.min(high - top, degree));
  const anchorAt = (bar) => chordDegree(c, fit(base), chordAt(c, c.start + bar * c.bpb));
  const unit = 1 / c.sub;

  const notes = [];
  for (let bar = 0; bar < c.bars; bar++) {
    const barStart = c.start + bar * c.bpb;
    const place = bar % phraseBars;
    const phrase = Math.floor(bar / phraseBars);
    if (rests && phrase % 2) continue;
    const lastPhrase = bar >= c.bars - phraseBars;
    const plan = (lastPhrase && lastPlan) || planFor(phrase);
    // the section's last bar always ends, even when the phrases don't divide it evenly
    const kind = bar === c.bars - 1 ? 'e' : plan[place];
    const anchor = anchorAt(bar - place);
    const climbs = plan.slice(0, place + 1).filter((k) => k === 's').length;
    let cells;
    if (kind === 'e') {
      // the first half of the phrase's idea (the second idea's, in a phrase without the motif), then
      // one long note. only notes that finish by half way: a motif of one whole bar note used to be
      // kept whole, and the long note then spilled into the next bar as a stray blip on top of its first
      const idea = plan.includes('m') ? motif : second;
      const head = idea.notes.filter((n) => n.t + n.dur <= c.bpb / 2 + 1e-6);
      cells = head.map((n) => ({ t: n.t, dur: n.dur, degree: anchor + n.step }));
      const from = head.length ? head[head.length - 1].t + head[head.length - 1].dur : 0;
      // questions and answers: the first of each pair of phrases ends open, the second comes home
      const closed = lastPhrase || (rests ? phrase / 2 : phrase) % 2 >= 1;
      const target = landing(c, cells.length ? cells[cells.length - 1].degree : anchor, chordAt(c, barStart + from), closed);
      // a pickup: the long note stops short, and a note or two step into the next phrase's first
      const into = bar + 1 < c.bars && pickup ? anchorAt(bar + 1) : null;
      const lead = into === null ? 0 : c.bpb - from >= 1 + 2 * unit && theme.chance(0.5) ? 2 : c.bpb - from >= 1 + unit ? 1 : 0;
      // with rests it rings on into the empty bars, but not past the section's end, where it ran over
      // the next section's first note
      const ring = rests && bar + 1 < c.bars;
      const until = ring ? c.bpb * 1.5 : c.bpb - lead * unit;
      cells.push({ t: from, dur: until - from, degree: target, settled: true, breath: !lead && !ring });
      const side = seq > 0 ? -1 : 1;
      for (let k = lead; k >= 1; k--) cells.push({ t: c.bpb - k * unit, dur: unit, degree: into + side * k, settled: true, soft: true });
    } else {
      const source = kind === 'v' ? variant : kind === 'b' ? second : motif;
      cells = source.notes.map((n) => ({ t: n.t, dur: n.dur, degree: anchor + (kind === 'i' ? -n.step : n.step) + (kind === 's' ? climbs * seq : 0) }));
      // a passing note now and then, later times round. never in a phrase's first bar, so the motif
      // always comes back the way you know it
      if (c.section.take > 0 && place > 0 && c.vary.chance(0.3)) cells = decorate(cells, c.vary, unit);
    }
    notes.push(...sing(c, cells, barStart, low, high, phraseBars === 4 ? SWELL[place] : 0, anchor));
  }
  return notes;
}

// ---------- solos ----------
//
// a solo is a long line that doesn't repeat, the way a player stretches out over the chords before
// the tune comes back (addSolo, section.lead). it's built four bars at a time, each from ideas of its
// own, new motifs from the solo's own random numbers: an idea, then the idea again a step away or with
// new notes (players develop a lick like this, so it sounds like a thought rather than a scale), then
// a new idea, often a run, then a long note to breathe on. over the section it climbs and gets busier
// towards a peak about two thirds of the way in, then comes back down, and its last note is the home
// note. half the time one of its phrases starts by quoting the layer's own motif, a nod to the theme
function solo(c) {
  const { song, layer } = c;
  const own = tuneDensity(layer);
  const density = song.style === 'ambient' ? Math.min(own, layer.density * 0.55) : Math.max(0.45, own);
  // a little higher than the tune goes: the peak is meant to stand out (not for a singer, singerSpan)
  const [low, high] = singerSpan(c, -4, 9);
  const phrases = Math.ceil(c.bars / 4);
  const picks = makeRng(song.seed, layer.seed, 'solo', c.section.index);
  const quote = phrases > 1 && picks.chance(0.5) ? picks.int(0, phrases - 2) : -1;
  const notes = [];
  for (let phrase = 0; phrase < phrases; phrase++) {
    const r = makeRng(song.seed, layer.seed, 'solo', c.section.index, phrase);
    // how far up the climb this phrase is, 0 to 1 and back
    const p = (phrase + 0.5) / phrases;
    const lift = p <= 0.67 ? p / 0.67 : (1 - p) / 0.33;
    const busy = clamp01(density * (0.8 + 0.45 * lift));
    const idea = phrase === quote ? themeMotif(c, own, layer.pattern === 'riff').motif : makeMotif(r, c, busy, false);
    const shift = r.pick([1, -1, 2]);
    const again = r.chance(0.5) ? { notes: idea.notes.map((n) => ({ ...n, step: n.step + shift })) } : makeMotif(r, c, busy, false, null, idea.rhythm);
    const run = r.chance(0.45) ? (r.chance(0.5) ? CONTOURS.climb(r) : CONTOURS.fall(r)) : null;
    const next = makeMotif(r, c, Math.min(1, busy + 0.2), false, run);
    const span = [idea, again, next].flatMap((one) => one.notes.map((n) => n.step));
    const reach = Math.round(-1 + 5 * lift);
    const anchor = chordDegree(c, Math.max(low - Math.min(0, ...span), Math.min(high - Math.max(0, ...span), reach)), chordAt(c, c.start + phrase * 4 * c.bpb));
    for (let place = 0; place < 4 && phrase * 4 + place < c.bars; place++) {
      const bar = phrase * 4 + place;
      const barStart = c.start + bar * c.bpb;
      const final = bar === c.bars - 1;
      let cells;
      if (place === 3 || final) {
        // a breath: the first half of the last idea, then a long note. the very last comes home
        const head = next.notes.filter((n) => n.t + n.dur <= c.bpb / 2 + 1e-6);
        cells = head.map((n) => ({ t: n.t, dur: n.dur, degree: anchor + n.step }));
        const from = head.length ? head[head.length - 1].t + head[head.length - 1].dur : 0;
        const target = landing(c, cells.length ? cells[cells.length - 1].degree : anchor, chordAt(c, barStart + from), final);
        cells.push({ t: from, dur: c.bpb - from, degree: target, settled: true, breath: true });
      } else cells = [idea, again, next][place].notes.map((n) => ({ t: n.t, dur: n.dur, degree: anchor + n.step }));
      notes.push(...sing(c, cells, barStart, low, high, SWELL[place] + lift * 0.04, anchor));
    }
  }
  // a chord with none of its notes in the scale (an eerie chromatic chord under a pentatonic tune) can't
  // be reached in scale steps, so the last note goes straight to the chord's root
  const last = notes[notes.length - 1];
  const chord = last && chordAt(c, last.t);
  if (chord && !chord.pcs.has(mod12(last.midi))) last.midi = near(chord.root, last.midi);
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

// ---------- counterpoint: a second melody ----------
//
// a counter melody that's a tune of its own but still fits the first note for note, the way toby fox
// stacks two melodies (snowdin town, death by glamour, the second lead in a battle theme). the old
// counter melodies either copied the tune a third down (harmony), filled its gaps (answers), or
// played their own tune without listening to it at all (free), and none of those sounded like two
// people playing two lines that belong together. so:
//   - its rhythm is its own motif's (themeMotif), so it has a shape you can follow and it comes back
//     each time the tune does. where the tune's busy (lots of notes in a bar) it holds long notes
//     instead, and where the tune holds or rests it moves: the two take turns being interesting
//   - each note is picked from the chord and scale notes in its range by the old rules of
//     counterpoint, as costs: thirds and sixths under the tune blend best (CONSONANCE), it never goes
//     over the tune, it moves by step more than by leap, it moves the other way to the tune where it
//     can (contrary motion), and it never moves into a fifth or an octave the tune's also moving into
//     (parallel fifths, which make two lines sound like one thick one). strong beats are chord notes
//   - ties are broken by the note's pitch and place, not by chance, so the same bar of tune gets the
//     same second melody every time
// how badly each interval under the tune clashes, in semitones (0 the unison or octave). thirds and
// sixths blend best, a fifth or an octave is fine but hollow, a fourth a little open, seconds and
// sevenths fight, and a tritone's restless
const CONSONANCE = [1.2, 7, 3, 0, 0, 2, 4.5, 0.8, 0, 0, 3, 6];
function counterpoint(c, density) {
  const melody = [...c.melody].sort((a, b) => a.t - b.t);
  const { motif } = themeMotif(c, density, false);
  // a slow rhythm of its own, for the bars where the tune's busy
  const held = makeMotif(makeRng(c.song.seed, c.layer.seed, 'held'), c, 0.1, false);
  const sounding = (t) => melody.find((note) => note.t <= t + 1e-6 && t < note.t + note.dur - 1e-6);
  const low = c.center - 9;
  const high = c.center + 8;
  const notes = [];
  let last = null;
  for (let bar = 0; bar < c.bars; bar++) {
    const barStart = c.start + bar * c.bpb;
    const busy = melody.filter((note) => note.t >= barStart - 1e-6 && note.t < barStart + c.bpb - 1e-6).length;
    const rhythm = busy >= Math.max(3, c.bpb) ? held.rhythm : motif.rhythm;
    for (const cell of rhythm) {
      const t = barStart + cell.t;
      const chord = chordAt(c, t);
      const strong = isStrong(c, t) || cell.dur >= 1;
      const tune = sounding(t);
      const tuneMove = tune && last?.tune ? Math.sign(tune.midi - last.tune.midi) : 0;
      let best = null;
      let bestCost = Infinity;
      // under a low tune (a melody an octave down) its usual range would all be over the tune, so
      // there's always at least an octave of room under the tune's note to pick from
      const from = tune ? Math.min(low, tune.midi - 12) : low;
      const to = tune ? Math.min(high, tune.midi) : high;
      for (let midi = from; midi <= to; midi++) {
        const pc = mod12(midi);
        if (!c.scalePcs.has(pc) && !chord.pcs.has(pc)) continue;
        let cost = strong && !chord.pcs.has(pc) ? 3 : 0;
        if (tune) {
          const gap = tune.midi - midi;
          if (gap < 0) cost += 12;
          else if (gap > 0 && gap < 3) cost += 5;
          if (gap > 19) cost += 1.5;
          // a clash on a weak beat, moving by step, is a passing note, and half as bad
          cost += CONSONANCE[mod12(gap)] * (strong ? 1 : 0.5);
          const move = last ? Math.sign(midi - last.midi) : 0;
          if (tuneMove && move) cost += move === tuneMove ? 0.4 : -0.5;
          if (last?.tune && move && tuneMove) {
            const before = mod12(last.tune.midi - last.midi);
            if ((before === 0 || before === 7) && before === mod12(gap)) cost += 4;
          }
        }
        if (last) {
          const leap = Math.abs(midi - last.midi);
          cost += leap === 0 ? 0.7 : leap <= 2 ? 0 : leap <= 4 ? 0.4 : leap <= 7 ? 1.5 : 4;
        } else cost += Math.abs(midi - c.center) * 0.15;
        cost += ((midi * 7 + Math.round(cell.t * 12) * 13) % 10) / 33;
        if (cost < bestCost) {
          bestCost = cost;
          best = midi;
        }
      }
      notes.push({ t, dur: cell.dur * 0.95, midi: best, vel: strong ? 0.66 : 0.56 });
      last = { midi: best, tune };
    }
  }
  return notes;
}

// jazz comping rhythms, a bar each, [beat, length]: the charleston (one, and the and of two), an
// anticipation pushing into the next bar, and a couple of looser ones. by beats in the bar
const COMP_RHYTHMS = {
  4: [[[0, 0.6], [1.5, 0.6]], [[1.5, 0.5], [3, 0.6]], [[0.5, 0.5], [2.5, 0.8]], [[0, 0.4], [2.5, 0.5], [3.5, 0.4]]],
  3: [[[0, 0.6], [1.5, 0.6]], [[1, 0.5], [2, 0.5]], [[0, 0.5], [2.5, 0.4]]],
  5: [[[0, 0.6], [1.5, 0.6], [3, 0.6]], [[1.5, 0.5], [3.5, 0.6]]],
};
// where a bossa guitar plucks its chords in a bar (the thumb has the beats)
const BOSSA_HITS = { 4: [0.75, 1.5, 2.5, 3.25], 3: [0.75, 1.5, 2.5], 5: [0.75, 1.5, 2.5, 3.25, 4.5], 2: [0.67, 1.33] };

// the bells' chimes: [beats after the chord changes, which chord note counting down from the top]
const BELL_FIGURES = [
  [[0, 0], [0.5, 1], [1, 2]],
  [[0, 0], [1, 1]],
  [[0, 2], [0.5, 1], [1, 0]],
  [[0, 0], [1.5, 1], [2, 0]],
  [[0, 1], [0.5, 0], [1, 1], [1.5, 2]],
];

// ---------- guitars ----------
//
// a guitar plays chords in a guitar's shapes: low, and slid up and down the neck as one shape, so its
// chords move in parallel rather than voice led like a pianist's. a power chord is the root, fifth and
// octave: with no third in it, distortion makes it growl rather than mush (a clipped third grinds
// against everything else), so it's what the loud patterns play. ringing, strummed and tremolo picked
// chords are the whole shape (an e shaped barre chord, with the chord's colour note on top), for
// cleaner or hazier guitars
function guitarShape(c, chord, full) {
  const root = near(chord.root, c.center);
  // the chord's own fifth (a diminished chord's is flat), or a plain fifth (a sus chord's)
  const fifth = chord.tones.find((tone) => tone >= 6 && tone <= 8) ?? 7;
  if (!full) return [root, root + fifth, root + 12];
  const shape = [root, root + fifth, root + 12, root + 12 + chord.tones[1], root + 12 + fifth];
  const colour = chord.tones.find((tone) => tone > 8);
  if (colour) shape.push(root + 12 + colour);
  return shape;
}

// a strum: the shape's notes a moment apart, low to high on the way down, and only the top strings,
// high to low, on the way back up. mute: palm muted
function strum(notes, shape, t, dur, vel, { up = false, mute = false, spread = 0.01 } = {}) {
  const strings = up ? shape.slice(-3).reverse() : shape;
  strings.forEach((midi, i) => notes.push({ t: t + i * spread, dur: Math.max(0.05, dur - i * spread), midi, vel: vel - i * 0.02, ...(mute ? { mute } : {}) }));
}

// how a strummed guitar's hand goes, an eighth (a third of a beat in 6/8) a character: D down, U up, .
// a miss. 4/4 is "old faithful", down, down up, up down up
const STRUMS = { '4/4': 'D.DU.UDU', '3/4': 'D.DUDU', '6/8': 'D.UD.U', '5/4': 'D.DU.UDUDU' };

// riffs, written out like grooves, one character a 16th of 4/4: m a palm muted chug on the low root,
// x an open power chord, n the next note of the riff's line, . nothing. doom's "at doom's gate" (and
// metallica's riffs before it) is a muted low string chugging twice under a line walking down the
// scale every third eighth. fast ones (16ths) aren't used above 150 bpm, where they'd blur, and slow
// ones (sabbath's: a chord left to ring, then the line) are for slow songs
const RIFFS = [
  { cells: 'm.m.n.m.m.n.m.m.' },
  { cells: 'x.m.m.n.x.m.n.n.' },
  { cells: 'x.....m.m.m.n.n.' },
  { cells: 'x.m.n.m.m.m.n.m.' },
  // the gallop, an eighth and two sixteenths (iron maiden), thrash, and pantera's stop and start
  { cells: 'x.mmm.mmm.mmn.n.', fast: true },
  { cells: 'mmmmn.mmmmn.x.x.', fast: true },
  { cells: 'x..m.mx..m.mn.n.', fast: true },
  { cells: 'x.......n...n.n.', slow: true },
  { cells: 'x...........n.n.', slow: true },
  { cells: 'x.....n.....x...', slow: true },
  { cells: 'x.......x...n.m.', slow: true },
];
// a riff's cells for the song's bar: 6/8 counts in eighths, so it takes every other character, and
// other bars repeat or cut the 4/4 bar to fit
function riffCells(cells, c) {
  let line = c.sub === 3 ? [...cells].filter((_, i) => i % 2 === 0).join('') : cells;
  const steps = Math.round(c.bpb / c.step);
  while (line.length < steps) line += line;
  return line.slice(0, steps);
}

// the song's riff (the chug pattern), the same every part and following the chords: the line's notes
// are the song's scale counted up from each chord's root, starting at the octave or under it and
// walking one note at a time (the other way in the fourth bar of each four, a turnaround), bouncing
// back at the ends. its notes are marked line, so the band's listening moves them off the tune like
// any other line's (listen). from layer's seed, so a bass doubling the riff (bass: true, an octave
// down and never a chord) plays exactly the guitar's. in a breakdown it chugs along with the kick
function riff(c, layer, bass) {
  const { song } = c;
  const r = makeRng(song.seed, layer.seed, 'riff');
  const pool = RIFFS.filter((one) => (song.tempo < 96 ? one.slow : !one.slow && !(one.fast && song.tempo > 150)));
  const cells = riffCells(r.pick(pool).cells, c);
  const from = r.int(0, 1);
  const way = r.pick([-1, -1, 1]);
  const breakdown = c.section.part === 'C' && song.style !== 'ambient' && !!songMood(song).breakdown;
  // the riff's grid is the groove's (16ths, or 8ths in 6/8)
  const grid = c.bpb / cells.length;
  const plan = [...cells].map((ch, i) => (breakdown ? (c.groove.lines.k[i] > 0 ? (i === 0 ? 'x' : 'm') : '.') : ch));
  const hits = plan.map((ch) => ch !== '.');
  const notes = [];
  const add = (t, dur, midis, vel, flags = {}) => { for (const midi of midis) notes.push({ t, dur, midi, vel, ...flags }); };
  for (let bar = 0; bar < c.bars; bar++) {
    const barStart = c.start + bar * c.bpb;
    const turn = bar % 4 === 3 ? -1 : 1;
    let n = 0;
    for (let i = 0; i < plan.length; i++) {
      if (!hits[i]) continue;
      const t = barStart + i * grid;
      const chord = chordAt(c, t);
      const root = near(chord.root, c.center);
      const fifth = chord.tones.find((tone) => tone >= 6 && tone <= 8) ?? 7;
      const length = gapAfter(hits, i) * grid;
      if (plan[i] === 'm') add(t, Math.min(length, grid * 2) * 0.9, [root], 0.72, bass ? {} : { mute: true });
      else if (plan[i] === 'x') add(t, length * 0.95, bass ? [root] : [root, root + fifth, root + 12], 0.9);
      else {
        const ladder = [];
        for (let midi = root + 1; midi <= root + 12; midi++) if (c.scalePcs.has(mod12(midi)) || midi === root + 12) ladder.push(midi);
        // bounce inside the ladder: 0 1 2 ... top ... 2 1 0 1 ...
        const span = Math.max(1, ladder.length - 1);
        const at = ladder.length - 1 - from + way * turn * n++;
        const folded = ((at % (2 * span)) + 2 * span) % (2 * span);
        const midi = ladder[folded > span ? 2 * span - folded : folded];
        add(t, length * 0.95, [midi], 0.84, { line: true });
      }
    }
  }
  return notes;
}

const COMPOSERS = {
  melody(c) {
    const { pattern } = c.layer;
    const density = tuneDensity(c.layer);
    if (pattern === 'long') return tune(c, { density, low: -3, high: 7, plan4: true });
    // riff: a hook played bar after bar, with only small changes, like a chiptune or club lead
    if (pattern === 'riff') return tune(c, { density, low: -4, high: 7, riff: true });
    // fragments: two bars of tune, then two of space with the last note ringing (minecraft's piano)
    if (pattern === 'fragments') return tune(c, { density, low: -3, high: 7, rests: true });
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
    // a second melody against the first (counterpoint), when there's a first to play against
    if (pattern === 'counterpoint' && c.melody?.length) return counterpoint(c, tuneDensity(c.layer));
    const notes = tune(c, { density: tuneDensity(c.layer), low: -4, high: 6 });
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
      // twinkle: one high note left ringing between the others, coming back every other note, the
      // fingerpicked clean guitar of emo (american football, tigers jaw)
      if (pattern === 'twinkle' && pool.length > 1) pool = pool.slice(0, -1).flatMap((midi) => [midi, pool[pool.length - 1]]);
      // roll: a banjo's forward roll, thumb, index, middle over three strings, round and round in eights
      // (t i m t i m t m), so the pattern turns over against the beat
      if (pattern === 'roll' && pool.length > 2) {
        const [low, mid, top] = [pool[0], pool[Math.floor(pool.length / 2)], pool[pool.length - 1]];
        pool = [low, mid, top, low, mid, top, low, top];
      }
      for (let t = chord.t; t < chord.t + chord.dur - 1e-6; t += step) {
        const midi = pool[(pattern === 'random' ? order[index % order.length] : index) % pool.length];
        index++;
        // (a roll never rests: a banjo player's fingers keep going)
        if (pattern !== 'roll' && rests[Math.round(((t - c.start) % c.bpb) / step) % rests.length]) continue;
        const onBeat = Math.abs((t - c.start) % 1) < 1e-6;
        notes.push({ t, dur: step * (pattern === 'twinkle' ? 2 : 0.75), midi, vel: onBeat ? 0.78 : 0.6 });
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
      } else if (pattern === 'comp') {
        // jazz comping: rootless voicings (the third, the seventh and the ninth, leaving the root to
        // the bass, the way bill evans did), jabbed in short, syncopated rhythms that change from bar to
        // bar and come round every four (COMP_RHYTHMS)
        const third = chord.tones.find((tone) => tone === 3 || tone === 4) ?? chord.tones[1];
        const seventh = chord.tones.find((tone) => tone >= 9 && tone <= 11) ?? (third === 4 ? 9 : 10);
        const rootless = voiceChord(chord.root, [third, seventh, 14], c.center, previous);
        for (let bar = Math.floor((chord.t - c.start) / c.bpb); c.start + bar * c.bpb < end - 1e-6; bar++) {
          const rhythms = COMP_RHYTHMS[c.bpb] || [[[0, 0.6], [c.bpb / 2, 0.6]]];
          const hits = makeRng(c.song.seed, c.layer.seed, 'comp', c.section.part, bar % 4).pick(rhythms);
          for (const [at, dur] of hits) {
            const t = c.start + bar * c.bpb + at;
            if (t < chord.t - 1e-6 || t >= end - 1e-6) continue;
            rootless.forEach((midi, i) => notes.push({ t, dur, midi, vel: 0.58 - i * 0.03 }));
          }
        }
      } else if (pattern === 'skank') {
        // a reggae skank: the chord chopped short on every off beat (the "and"), never on the beat,
        // which is left to the bass and the one drop
        for (let t = chord.t; t < end - 1e-6; t += 1) {
          for (let k = 1; k < c.sub; k++) {
            const at = t + k / c.sub;
            if (at < end - 1e-6) voiced.forEach((midi, i) => notes.push({ t: at + i * 0.008, dur: 0.18, midi, vel: 0.62 - i * 0.02 }));
          }
        }
      } else if (pattern === 'bossa') {
        // bossa nova guitar (joão gilberto's): the thumb on the root and fifth on the beats, the fingers
        // plucking the chord on the off beats in between, a rhythm that doesn't land where you expect
        const root = near(chord.root, c.center - 12);
        for (let bar = Math.floor((chord.t - c.start) / c.bpb); c.start + bar * c.bpb < end - 1e-6; bar++) {
          const barStart = c.start + bar * c.bpb;
          for (let beat = 0; beat < c.bpb; beat += 2) {
            const t = barStart + beat;
            if (t >= chord.t - 1e-6 && t < end - 1e-6) notes.push({ t, dur: 1.5, midi: beat % 4 ? root + 7 : root, vel: 0.62 });
          }
          for (const at of BOSSA_HITS[c.bpb] || [0.75, 1.5]) {
            const t = barStart + at;
            if (t >= chord.t - 1e-6 && t < end - 1e-6) voiced.forEach((midi, i) => notes.push({ t: t + i * 0.01, dur: 0.45, midi, vel: 0.5 - i * 0.02 }));
          }
        }
      } else {
        // block: the chord on the groove's comping rhythm, so it fits round the drums and bass.
        // sparse layers keep only the hits on the beat
        for (const [t, dur, vel] of compHits(c, chord, density)) for (const midi of voiced) notes.push({ t, dur: dur * 0.8, midi, vel });
      }
    }
    return notes;
  },

  // the guitar (guitarShape, and riff for the chugging pattern)
  guitar(c) {
    const { pattern, density } = c.layer;
    if (pattern === 'chug') return riff(c, c.layer, false);
    const notes = [];
    const unit = 1 / c.sub;
    // (funk and boom chick play the whole chord too: a clean or acoustic guitar has no growl to avoid)
    const full = pattern === 'ring' || pattern === 'tremolo' || pattern === 'strum' || pattern === 'funk' || pattern === 'boomchick';
    const onBeat = (t) => Math.abs((t - c.start) % 1) < 1e-6;
    // eighths chug palm muted through the verse (part A) and ring open in the chorus, the way pop punk
    // and weezer play them, with the chord changes and the groove's comping hits left open as accents
    const muted = c.section.part === 'A' && !c.section.lead;
    const comps = new Set();
    for (const chord of c.chords) for (const [t] of compHits(c, chord, 1)) comps.add(t.toFixed(3));
    for (const chord of c.chords) {
      const shape = guitarShape(c, chord, full);
      const end = chord.t + chord.dur;
      if (pattern === 'eighths') {
        for (let t = chord.t; t < end - 1e-6; t += unit) {
          const open = !muted || t === chord.t || comps.has(t.toFixed(3));
          strum(notes, shape, t, Math.min(unit, end - t) * (open ? 0.95 : 0.6), onBeat(t) ? 0.8 : 0.7, { mute: !open });
        }
      } else if (pattern === 'ring') {
        // struck once a bar and left to ring into the next: a wall rather than a rhythm (shoegaze, and
        // a grunge chorus)
        for (let t = chord.t; t < end - 1e-6; t += c.bpb) strum(notes, shape, t, Math.min(c.bpb, end - t), 0.75, { spread: 0.02 });
      } else if (pattern === 'tremolo') {
        // picked as fast as a hand goes (sixteenths, slowed to ten a second at most), the chord a
        // shimmer rather than strokes: shoegaze and post rock. not running notes, so MAX_RATE doesn't
        // apply. its lowest four strings, so it doesn't pile up
        let step = 1 / (c.sub * 2);
        while (c.song.tempo / 60 / step > 10) step *= 2;
        for (let t = chord.t; t < end - 1e-6; t += step) for (const midi of shape.slice(0, 4)) notes.push({ t, dur: Math.min(step * 1.1, end - t), midi, vel: onBeat(t) ? 0.6 : 0.5 });
      } else if (pattern === 'strum') {
        // the strumming hand (STRUMS): down on the beats, up between, a stroke ringing until the next.
        // a quiet guitar only strums down on the beat
        const hand = [...(STRUMS[c.song.meter] || 'D.')].map((stroke, i) => (density < 0.35 && i % c.sub ? '.' : stroke));
        const strokes = hand.map((stroke) => stroke !== '.');
        for (let t = chord.t; t < end - 1e-6; t += unit) {
          const i = Math.round(((t - c.start) % c.bpb) / unit) % hand.length;
          if (!strokes[i]) continue;
          strum(notes, shape, t, Math.min(gapAfter(strokes, i) * unit, end - t) * 0.95, hand[i] === 'D' ? 0.7 : 0.56, { up: hand[i] === 'U' });
        }
      } else if (pattern === 'funk') {
        // funk scratching (nile rodgers, the clean guitar in death by glamour): the hand never stops
        // going up and down in sixteenths, muted to a percussive "chk" most of the time, and the chord's
        // top strings let ring short on the groove's comping hits. little high chords, not big ones
        const top = shape.slice(-3);
        const { lines, grid } = c.groove;
        for (let t = chord.t; t < end - 1e-6; t += grid) {
          const i = stepInBar(c, t);
          if (lines.c[i] > 0) strum(notes, top, t, Math.min(grid * 1.6, end - t), 0.72, { up: i % 2 === 1, spread: 0.006 });
          else if (density >= 0.3 || i % 2 === 0) strum(notes, top, t, grid * 0.5, 0.32, { up: i % 2 === 1, mute: true, spread: 0.004 });
        }
      } else if (pattern === 'boomchick') {
        // country's boom chick (johnny cash): a bass note on the beat (the root, then the fifth), the
        // top strings strummed on the beat after
        for (let t = chord.t; t < end - 1e-6; t += 1) {
          const beat = Math.round((t - c.start) % c.bpb);
          const dur = Math.min(1, end - t) * 0.9;
          if (beat % 2 === 0) notes.push({ t, dur, midi: beat === 0 || c.bpb < 4 ? shape[0] : shape[1] - 12, vel: 0.78 });
          else strum(notes, shape.slice(2), t, dur * 0.6, 0.6, { spread: 0.012 });
        }
      } else {
        // power chords on the groove's comping hits, each left to ring until the next
        for (const [t, dur, vel] of compHits(c, chord, density)) strum(notes, shape, t, dur * 0.95, vel + 0.18);
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
      } else if (pattern === 'pump') {
        // the chord again every beat, ducking out on the beat and swelling back between (pump in
        // synth.js), the way a club mix squashes the pads under every kick (crystal castles)
        for (let t = chord.t; t < end - 1e-6; t += 1) hits.push([t, Math.min(1, end - t), 0.62, true]);
      } else hits.push([chord.t, chord.dur, 0.6]);
      for (const [t, dur, vel, pump] of hits) for (const midi of voiced) notes.push({ t, dur, midi, vel, ...(pump ? { pump } : {}) });
    }
    return notes;
  },

  drone(c) {
    const { pattern } = c.layer;
    const whole = (intervals, from = c.tonic) => intervals.map((interval) => ({ t: c.start, dur: c.end - c.start, midi: from + interval, vel: 0.7 }));
    // one singer (or one didgeridoo) holds the home note: they can't hold a fifth as well
    if (INSTRUMENTS[c.layer.instrument]?.home) return whole([0]);
    if (pattern === 'fifths') return whole([0, 7, 12, 19]);
    if (pattern === 'cluster') return whole(c.rng.pick([[0, 1, 7], [0, 6, 7], [0, 1, 5], [0, 3, 6], [0, 11, 13]]));
    if (pattern === 'follow') return c.chords.flatMap((chord) => [0, 7].map((interval) => ({ t: chord.t, dur: chord.dur, midi: near(chord.root, c.center) + interval, vel: 0.7 })));
    if (pattern === 'cycle') {
      // a tanpura's four strings plucked one after another, round and round, never in time with the
      // tune: the fifth, the home note twice an octave up, then the low home note. each rings on until
      // it's plucked again (a touch less, so the same string twice isn't joined into one note)
      const strings = [-5, 12, 12, 0];
      const step = c.song.tempo > 100 ? 2 : 1;
      const notes = [];
      for (let t = c.start, i = 0; t < c.end - 1e-6; t += step, i++) notes.push({ t, dur: Math.min(step * strings.length * 0.98, c.end - t), midi: c.tonic + strings[i % strings.length], vel: i % strings.length === 0 ? 0.7 : 0.6 });
      return notes;
    }
    return whole([0, 7]);
  },

  bass(c) {
    const { pattern, density } = c.layer;
    // doubling the riff: the chugging guitar's (or a riff of its own, with no guitar riffing), an
    // octave under the guitar, as metal's bass players do
    if (pattern === 'riff') {
      const guitar = c.song.layers.find((layer) => layer.role === 'guitar' && layer.pattern === 'chug');
      return riff({ ...c, center: ROLES.guitar.center - 12 }, guitar || c.layer, true);
    }
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
      } else if (pattern === 'boogie') {
        // the boogie woogie bass of the blues: up the chord and its sixth and seventh and back down, an
        // eighth a note (root, third, fifth, sixth, flat seventh, sixth, fifth, third)
        const third = chord.tones.includes(3) && !chord.tones.includes(4) ? 3 : 4;
        const walk = [0, third, 7, 9, 10, 9, 7, third];
        const step = 1 / c.sub;
        let i = 0;
        for (let t = chord.t; t < end - 1e-6; t += step, i++) add(t, step * 0.85, root + walk[i % walk.length], i % 2 ? 0.62 : 0.8);
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
    const kit = INSTRUMENTS[c.layer.instrument]?.slots || [];
    const tunes = kit.map((slot) => slot.tune && tuneDrum(slot.tune, c.song.key));
    // a real crash where the kit has one, its open hat where it doesn't
    const crash = kit[6] ? 6 : 3;
    const others = c.song.layers.filter((layer) => layer.role !== 'drums' && layer.role !== 'texture');
    const fullness = others.length ? others.filter((layer) => c.section.play.includes(layer.id)).length / others.length : 1;
    const level = 0.7 + 0.3 * fullness;
    const ghosts = density >= 0.35 && fullness >= 0.5;
    const hit = (t, slot, vel) => notes.push({ t, dur: grid, midi: slot, vel: vel * level, ...(tunes[slot] ? { tune: tunes[slot] } : {}) });
    // a fill when the next section is a different part: the last beat on the snare (toms for the
    // quieter patterns), getting louder, then an open hat on the next bar's first beat like a crash
    // the quiet patterns (pulse, sparse) never fill: a drum roll in the middle of a calm song made
    // it jump. brushes fill on the brush, tribal on the toms
    const fill = (LIFTS[pattern] || ROCK[pattern] || FILLS[pattern]) && c.next && c.next.part !== c.section.part && c.vary.chance(0.75);
    // a rock drummer fills down the toms: the snare for the first half of the beat, the floor tom after
    const fillDrum = (i) => (pattern === 'tribal' || pattern === 'tala' || (ROCK[pattern] && i - (steps - perBeat) >= perBeat / 2) ? 5 : 1);
    const crashed = (LIFTS[pattern] || ROCK[pattern]) && c.prev && c.prev.part !== c.section.part && c.prev.play.includes(c.layer.id);
    if (crashed) hit(c.start, crash, 0.8);
    // in a loud part (a chorus, a solo), a crash at the top of every four bars, marking the phrase
    const phrases = ROCK[pattern] && kit[6] && (c.section.part === 'B' || c.section.lead);
    // a gamelan's big gong comes round every cycle (gong: bars a cycle, on the kit), struck on the
    // cycle's first beat, the way the gong ageng marks where everything comes round
    const gong = INSTRUMENTS[c.layer.instrument]?.gong;
    for (let n = 0; n < c.bars; n++) {
      const bar = c.start + n * c.bpb;
      if (phrases && n % 4 === 0 && !(n === 0 && crashed)) hit(bar, 6, 0.72);
      if (gong && kit[6] && n % gong === 0) hit(bar, 6, 0.75);
      const fillFrom = fill && n === c.bars - 1 ? steps - perBeat : steps;
      for (let i = 0; i < steps; i++) {
        const t = bar + i * grid;
        const onBeat = i % perBeat === 0;
        if (i >= fillFrom) {
          if (i === fillFrom && lines.k[i]) hit(t, 0, 0.85);
          if (perBeat === 4 && i % 2 && density < 0.5) continue;
          hit(t, fillDrum(i), 0.4 + 0.5 * ((i - fillFrom + 1) / perBeat));
          continue;
        }
        for (const [name, slot] of Object.entries(GROOVE_SLOTS)) {
          const v = lines[name][i];
          if (!v || (v < 1 && !ghosts)) continue;
          const loud = name === 'h' ? 0.6 : name === 'p' ? 0.55 : name === 'y' ? 0.7 : 0.88;
          hit(t, slot === 6 ? crash : slot, (v < 1 ? 0.3 : loud) * (onBeat ? 1 : 0.85));
        }
        // (not in rock, whose drummer keeps to eighths: sixteenths at punk tempos were a hiss)
        if (ghosts && density > 0.72 && perBeat === 4 && i % 2 && !lines.h[i] && lines.h.some((v) => v) && !ROCK[pattern]) hit(t, 2, 0.24);
      }
    }
    return notes;
  },

  // the note is the song's home note, which the hum and the crickets sing (TEXTURES in synth.js)
  texture(c) {
    return [{ t: c.start, dur: c.end - c.start, midi: near(c.song.key, 60), vel: 1 }];
  },
};
