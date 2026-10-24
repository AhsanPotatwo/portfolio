// =================================== squimble music maker: the moods ===================================
//
// every mood, its flavours and the song shapes they use, as plain data: what music.js picks a song's
// band, chords, tempo and shape from. no code, so tuning a mood or adding a flavour only ever happens
// here. like music.js it has no page or audio, so node and the game can load it. load it before
// music.js, which reads it as it loads. a song saved by an older composer is written by that
// composer's own copy of these (kept/), so changing them here never changes a saved song

// ---------- moods ----------

// each mood is the ranges its songs are picked from:
//   scales, meters   weights. tempo, tuneTempo   bpm ranges for ambient songs and for the rest
//   chords      progressions that suit it. methods   how often each way of making chords is used
//   richness    range for the song's chord colour
//   energy, space, bright, dark   0 to 1: how busy, roomy, bright and unsettling. they steer density,
//               reverb, filters, detuning and which layers turn up
//   palette     instruments for each role (now and then something else, surprise)
//   textures, kits   scenery and drum kits. no kits, no drums
//   drums       [chance in an ambient song, chance in the rest]. a beat under a dreamy song sounds wrong
//   edge        the harshest instrument it allows (edge in synth.js), from energy and dark if left out
//   patterns    role patterns it prefers over STYLE_PATTERNS ('ambient.guitar': ambient songs only)
//   swing       chance of swing (none unless it says). swingAmount   its range, 0.15 to 0.5 unless it says
//   fx          extra wobble, drive or echo
//   opens       the parts that open its songs, most wanted first (pickArrangement)
//   group       its row on the page (MOOD_GROUPS)
//   ornate      how much its players ornament their notes (ornament()), 1 unless it says
//   chordBars   how long its chords last, to pick from (a twelve bar blues is a bar a chord)
//   orchestra   { pass, double }: chances its tune is handed round and doubled (pickOrchestra)
//   prelude     the name of a section of scenery alone that opens its songs (pickArrangement)
//   drama       how far its sections' energies are stretched apart, 1 unless it says (stretch)
//   build       chance its tunes and ambient songs build to a climax (builds()), never if left out
//   pedal       its pianos hold the sustain pedal down (pedal())
//   weave       chance its tunes and loops bring their themes in one at a time, then together (weaves())
//   phrasing    how its tunes are written, as a flavour's (FLAVOURS)
// modifiers also set most (more or fewer layers), busy (busier parts), soft (slower attacks) and reharm
// (its progressions moved into the song's scale, reharmonise()). the loud and hazy moods also have:
//   layers      chance of each role, over LAYER_CHANCE (a rock band has a guitar and no keys)
//   forms       song shapes for tunes, over FORMS
//   solo, soloOver   chance of a solo in a tune, and the part it's over (rock's is the chorus)
//   quiet, loudQuiet   cleaner guitars, and the chance a second one plays the quiet sections
//   breakdown   part C is a half time breakdown, not a quiet drop (grooveFor)
//   bury        0 to 1, how far the tune sinks into the band (shoegaze's singer)
//   openStrings its guitars' whole shapes keep two strings ringing on the same notes over every chord
//               (openStrings())
//   surprise    chance of an instrument from outside the palette, 0.12 unless it says
// a section marked LIFTED in a song shape ([name, part, bars, energy, LIFTED]) is a key change: it and
// everything after it play a step or a half step higher (section.lift). defined before MOODS uses it
const LIFTED = true;
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
// a dramatic tune (the dramatic modifier, on a mood without shapes of its own): longer than a tune's
// usual shapes, round twice, a fall to almost nothing, then the last choruses a key higher, like a power
// ballad's or a film theme's ending
const DRAMA_FORMS = [
  [['Intro', 'C', 4, 0.3], ['Verse', 'A', 8, 0.6], ['Chorus', 'B', 8, 0.9], ['Verse', 'A', 8, 0.7], ['Chorus', 'B', 8, 1], ['Bridge', 'C', 8, 0.4], ['Lift', 'C', 4, 0.8], ['Chorus', 'B', 8, 1, LIFTED], ['Chorus', 'B', 8, 1, LIFTED], ['Outro', 'A', 4, 0.3, LIFTED]],
  [['Intro', 'A', 4, 0.3], ['Theme', 'A', 8, 0.65], ['Theme', 'A', 8, 0.8], ['Climb', 'B', 8, 0.95], ['Fall', 'C', 8, 0.4], ['Theme', 'A', 8, 0.85], ['Climb', 'B', 8, 1], ['Theme', 'A', 8, 1, LIFTED], ['Climb', 'B', 8, 1, LIFTED], ['Outro', 'A', 4, 0.3, LIFTED]],
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
      pad: ['warm-pad', 'glass-pad', 'strings', 'air-pad', 'analog-pad', 'bowed-vibes'], melody: ['flute', 'felt-keys', 'ocarina', 'soft-lead', 'pan-flute', 'piano'],
      counter: ['felt-keys', 'harp', 'soft-lead', 'nylon'], keys: ['felt-keys', 'harp', 'e-piano', 'nylon', 'piano'], arp: ['harp', 'kalimba', 'felt-keys', 'nylon'],
      bells: ['glass-bell', 'chime', 'vibes', 'sine-bell'], bass: ['sub-bass', 'round-bass', 'upright'], drone: ['organ-drone', 'deep-drone', 'cello-drone'],
    },
    textures: ['birds', 'ocean', 'crickets', 'rain', 'stream', 'leaves', 'frogs'], kits: ['soft-kit'], drums: [0.1, 0.35],
    patterns: { drums: ['pulse', 'sparse', 'brush'], melody: ['phrases', 'fragments', 'phrases', 'long'] }, ornate: 0.6,
  },
  heavenly: {
    group: 'Gentle',
    opens: ['pad', 'drone', 'keys'],
    build: 0.25, name: 'Heavenly', colour: '#bcdcf2', style: 'ambient',
    scales: { major: 3, lydian: 2, mixolydian: 1 }, tempo: [52, 70], tuneTempo: [70, 90],
    chords: ['I V vi iii IV I IV V', 'I IV I V', 'IV I', 'I bVII IV I', 'I V vi IV', 'IV V vi I', 'I iii vi IV'],
    richness: [0.2, 0.6], energy: 0.2, space: 1, bright: 0.75, dark: 0,
    palette: {
      pad: ['choir-ah', 'organ', 'shimmer', 'strings', 'bowed-vibes', 'vox-pad'], melody: ['choir-oo', 'flute', 'glass-bell', 'violin', 'soprano', 'alto-voice'],
      counter: ['harp', 'celesta', 'choir-oo', 'cello'], keys: ['harp', 'celesta', 'organ'], arp: ['harp', 'celesta'],
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
      counter: ['marimba', 'clarinet', 'pizzicato', 'nylon'], keys: ['steel-guitar', 'nylon', 'felt-keys', 'e-piano', 'piano'], arp: ['nylon', 'steel-guitar', 'harp', 'kalimba', 'marimba', 'xylophone', 'banjo'],
      bells: ['celesta', 'vibes', 'chime', 'glock', 'xylophone'], bass: ['upright', 'pluck-bass', 'round-bass', 'chip-bass'], drone: ['organ-drone'],
    },
    textures: ['birds', 'crickets', 'stream', 'leaves'], kits: ['soft-kit', 'soft-kit', 'tight-kit', 'chip-kit'], drums: [0.1, 0.85], swing: 0.2,
    patterns: { drums: ['groove', 'groove', 'halftime'], bass: ['rootfifth', 'rootfifth', 'octave', 'held', 'synco'], keys: ['strum', 'broken', 'block'], arp: ['updown', 'up', 'converge'] },
    orchestra: { pass: 0.35, double: 0.25 },
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
    orchestra: { pass: 0.3, double: 0.4 },
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
    patterns: { drums: ['groove', 'march', 'break', 'groove'], bass: ['octave', 'hook', 'walking', 'synco', 'rootfifth'], melody: ['phrases', 'riff', 'phrases', 'calls'] },
    orchestra: { pass: 0.25, double: 0.45 },
  },
  upbeat: {
    group: 'Bright',
    opens: ['drums', 'bass', 'keys', 'arp'],
    build: 0.25, name: 'Upbeat', colour: '#ff8f45', style: 'tune',
    scales: { major: 2, mixolydian: 2, dorian: 2, majorPentatonic: 1, minorPentatonic: 1 }, tempo: [84, 100], tuneTempo: [118, 142],
    meters: { '4/4': 8, '6/8': 1 },
    chords: ['I V vi IV', 'I bVII IV I', 'vi IV I V', 'I IV vi V', 'i bVII bVI bVII', 'ii V I I', 'I iii vi IV'],
    richness: [0.2, 0.6], energy: 0.9, space: 0.35, bright: 0.8, dark: 0,
    palette: {
      pad: ['warm-pad', 'strings', 'shimmer', 'analog-pad'], melody: ['saw-lead', 'square-lead', 'pluck-lead', 'whistle', 'synth-brass', 'pulse-lead'],
      counter: ['pluck-lead', 'e-piano', 'marimba'], keys: ['e-piano', 'felt-keys', 'steel-guitar', 'wurlitzer'], arp: ['pluck-lead', 'kalimba', 'e-piano', 'saw-lead', 'steel-guitar'],
      bells: ['vibes', 'chime'], bass: ['synth-bass', 'pluck-bass', 'growl-bass', '808-bass', 'moog-bass'], drone: ['deep-drone'],
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
      pad: ['warm-pad', 'organ', 'strings'], melody: ['e-piano', 'felt-keys', 'flute', 'vibes', 'soft-lead', 'nylon', 'clarinet', 'piano', 'mute-trumpet', 'wurlitzer', 'humming'],
      counter: ['felt-keys', 'vibes', 'harp', 'nylon'], keys: ['e-piano', 'felt-keys', 'nylon', 'piano', 'jazz-guitar', 'wurlitzer'], arp: ['e-piano', 'harp', 'vibes', 'nylon'],
      bells: ['vibes', 'chime'], bass: ['upright', 'round-bass', 'sub-bass'], drone: ['organ-drone'],
    },
    textures: ['vinyl', 'fire', 'rain'], kits: ['brushes'], drums: [0.05, 0.55],
    patterns: { bass: ['walking', 'rootfifth', 'held'], drums: ['brush'], keys: ['strum', 'block', 'broken'] }, fx: { wobble: 0.5 },
  },
  wistful: {
    group: 'Gentle',
    opens: ['keys', 'pad', 'arp'],
    pedal: true, build: 0.15, name: 'Wistful', colour: '#e3b3a0', style: 'ambient',
    scales: { mixolydian: 1.5, dorian: 2, major: 1.5, majorPentatonic: 1 }, tempo: [56, 72], tuneTempo: [74, 94],
    chords: ['I iii IV iv', 'IV iv I', 'I V vi iii IV I IV V', 'vi IV I V', 'I bVII IV I', 'Imaj7 IVmaj7 iii vi', 'IV I V vi', 'I III IV iv'],
    richness: [0.4, 0.85], energy: 0.35, space: 0.7, bright: 0.45, dark: 0.15,
    palette: {
      pad: ['strings', 'warm-pad', 'glass-pad', 'choir-oo', 'analog-pad', 'reverse-piano', 'bowed-vibes'], melody: ['music-box', 'e-piano', 'celesta', 'flute', 'violin', 'nylon', 'piano', 'cello', 'humming', 'alto-voice'],
      counter: ['harp', 'felt-keys', 'celesta', 'cello'], keys: ['felt-keys', 'e-piano', 'harp', 'piano', 'wurlitzer'], arp: ['harp', 'music-box', 'celesta'],
      bells: ['music-box', 'celesta', 'glass-bell'], bass: ['round-bass', 'sub-bass', 'upright'], drone: ['cello-drone', 'organ-drone', 'tape-loop'],
    },
    textures: ['vinyl', 'rain', 'birds', 'leaves', 'chimes'], kits: ['brushes'], drums: [0.05, 0.45],
    patterns: { drums: ['brush', 'sparse'], melody: ['fragments', 'phrases', 'long'] }, fx: { wobble: 0.45 }, ornate: 0.8,
  },
  // c418's minecraft volumes alpha and beta: neither happy nor sad. a felt piano or a rhodes playing a
  // few notes with room round them over a warm pad and a sub bass, a major key leaning on its ii, iii and
  // borrowed iv, worn like an old tape. its flavours are the albums' other sides
  nostalgic: {
    group: 'Gentle', opens: ['keys', 'pad', 'drone'],
    pedal: true, build: 0.15, name: 'Nostalgic', colour: '#86a98f', style: 'ambient',
    scales: { major: 3, lydian: 1.5, mixolydian: 1, majorPentatonic: 1, dorian: 0.5 }, tempo: [58, 76], tuneTempo: [72, 96],
    meters: { '4/4': 5, '3/4': 2, '6/8': 1 },
    chords: ['ii IV I iii', 'I iii IV iv', 'Imaj7 IVmaj7', 'IV I vi V', 'vi IV I V', 'I V vi IV', 'IVmaj7 iii7 vi -', 'I - IV -', 'IV iv I -', 'I vi iii IV'],
    methods: { bank: 5, markov: 2, vamp: 1.5 },
    richness: [0.35, 0.8], energy: 0.3, space: 0.75, bright: 0.45, dark: 0.12, edge: 0.6, surprise: 0, ornate: 0.4,
    palette: {
      melody: ['piano', 'felt-keys', 'e-piano', 'soft-lead', 'music-box', 'humming'], counter: ['felt-keys', 'e-piano', 'soft-lead', 'piano'],
      keys: ['piano', 'felt-keys', 'e-piano', 'wurlitzer'], arp: ['felt-keys', 'e-piano', 'piano', 'harp', 'sine-bell'], bells: ['sine-bell', 'glass-bell', 'music-box'],
      pad: ['warm-pad', 'analog-pad', 'strings', 'air-pad', 'glass-pad', 'bowed-vibes', 'vox-pad'], bass: ['sub-bass', 'round-bass', 'moog-bass'], drone: ['tape-loop', 'organ-drone', 'cello-drone'],
    },
    textures: ['drips', 'rain', 'birds', 'leaves', 'stream', 'crickets'], kits: ['machine', 'soft-kit'], drums: [0.05, 0.4],
    layers: { keys: 0.75 },
    patterns: { melody: ['fragments', 'phrases', 'fragments', 'long'], keys: ['broken', 'block', 'broken'], pad: ['sustain', 'swell'], bass: ['held', 'rootfifth'], drums: ['sparse', 'pulse', 'halftime'], arp: ['updown', 'up', 'random'] },
    fx: { wobble: 0.3 },
  },
  sad: {
    group: 'Dark',
    opens: ['pad', 'keys', 'drone'],
    pedal: true, build: 0.2, name: 'Sad', colour: '#6b95d8', style: 'ambient',
    scales: { minor: 3, dorian: 1.5, harmonicMinor: 0.7, minorPentatonic: 1 }, tempo: [52, 70], tuneTempo: [66, 88],
    chords: ['i bVI bIII bVII', 'i iv bVI V', 'vi IV I V', 'i bVII bVI bVII', 'i iv i v', 'i - bVI -', 'iv i', 'i bVI iv V', 'i bIII bVII iv'],
    richness: [0.3, 0.8], energy: 0.3, space: 0.7, bright: 0.35, dark: 0.3,
    palette: {
      pad: ['strings', 'warm-pad', 'choir-oo', 'dark-pad', 'fuzz-wall', 'reverse-piano', 'bowed-vibes'], melody: ['felt-keys', 'violin', 'flute', 'e-piano', 'music-box', 'piano', 'cello', 'humming', 'alto-voice'],
      counter: ['felt-keys', 'harp', 'violin', 'cello'], keys: ['felt-keys', 'harp', 'e-piano', 'piano'], arp: ['harp', 'felt-keys'],
      bells: ['glass-bell', 'music-box'], bass: ['sub-bass', 'round-bass', 'upright', 'chorus-bass'], drone: ['cello-drone', 'deep-drone'],
    },
    textures: ['rain', 'vinyl', 'wind', 'owl'], kits: ['soft-kit', 'brushes'], drums: [0.05, 0.4], patterns: { drums: ['sparse', 'pulse', 'brush'] },
  },
  // calamity's title theme, the tale of a cruel world (dm dokuro): sad and dramatic at once, and moving
  // rather than gloomy. a lone piano, then strings and a choir swelling in under it, building to the
  // whole orchestra with the timpani crashing, then falling back to the piano. harmonic minor's raised
  // seventh pulls it home, and its sections swing a long way between quiet and loud (drama)
  tragic: {
    group: 'Dark', opens: ['keys', 'drone', 'pad'],
    build: 0.55, name: 'Tragic', colour: '#94455a', style: 'tune',
    scales: { minor: 3, harmonicMinor: 2.5, dorian: 0.5 }, tempo: [52, 68], tuneTempo: [66, 90],
    meters: { '4/4': 5, '3/4': 1.5, '6/8': 1.5 },
    chords: ['i bVI bIII bVII', 'i iv bVI V', 'bVI bVII i -', 'i v bVI bIII iv i iv V', 'i bVII bVI V', 'iv bVI bVII i', 'i bIII bVII iv', 'i - bVI V'],
    methods: { bank: 6, markov: 1.5 },
    richness: [0.15, 0.55], energy: 0.55, space: 0.85, bright: 0.45, dark: 0.55, edge: 0.75, surprise: 0, ornate: 0.8, drama: 1.3,
    palette: {
      melody: ['piano', 'violin', 'choir-oo', 'horn', 'oboe', 'cello', 'soprano'], counter: ['violin', 'horn', 'choir-oo', 'oboe', 'trombone', 'cello'],
      keys: ['piano', 'harp'], arp: ['piano', 'harp'], bells: ['bell', 'glock', 'celesta'],
      pad: ['strings', 'choir-ah', 'choir-oo', 'brass-section', 'tremolo-strings'], bass: ['upright', 'round-bass', 'sub-bass', 'tuba'], drone: ['cello-drone', 'organ-drone', 'deep-drone'],
    },
    textures: ['wind', 'rain', 'rumble'], kits: ['orchestra-kit', 'taiko'], drums: [0.2, 0.75],
    layers: { pad: 1, keys: 0.85, counter: 0.55 },
    patterns: { drums: ['halftime', 'march', 'tribal'], keys: ['broken', 'broken', 'block'], pad: ['swell', 'sustain', 'pulse'], melody: ['phrases', 'long', 'phrases'], bass: ['held', 'octave', 'pulse'], counter: ['counterpoint', 'harmony'], drone: ['tonic', 'fifths'] },
    // a prologue on the piano, the theme growing each time round to a climax, a fall to almost nothing,
    // then a second, bigger climax a key higher to end on, as the title theme does (about four minutes)
    forms: [
      [['Prologue', 'C', 8, 0.3], ['Theme', 'A', 8, 0.55], ['Theme', 'A', 8, 0.7], ['Rise', 'B', 8, 0.85], ['Theme', 'A', 8, 0.95], ['Climax', 'B', 8, 1], ['Fall', 'C', 8, 0.4], ['Theme', 'A', 8, 0.8], ['Climax', 'B', 8, 1, LIFTED], ['Climax', 'B', 8, 1, LIFTED], ['Epilogue', 'A', 4, 0.3, LIFTED]],
      [['Prologue', 'A', 4, 0.3], ['Theme', 'A', 8, 0.6], ['Rise', 'B', 8, 0.8], ['Fall', 'C', 8, 0.45], ['Theme', 'A', 8, 0.9], ['Climax', 'B', 8, 1], ['Climax', 'B', 8, 1], ['Requiem', 'C', 8, 0.35], ['Theme', 'A', 8, 0.85, LIFTED], ['Climax', 'B', 8, 1, LIFTED], ['Epilogue', 'C', 4, 0.3, LIFTED]],
    ],
    orchestra: { pass: 0.5, double: 0.3 },
  },
  // have a nice life: a slow wall of fuzz, a lone chanted line, a cheap drum machine in a huge room,
  // all of it worn and washed out. serious rather than sad
  bleak: {
    group: 'Dark',
    opens: ['pad', 'drone', 'bass'],
    build: 0.3, name: 'Bleak', colour: '#6f7d8c', style: 'ambient',
    scales: { minor: 3, dorian: 1.5, phrygian: 1 }, tempo: [50, 68], tuneTempo: [72, 92],
    chords: ['i bVI bIII bVII', 'i - bVI -', 'i v bVI iv', 'i bVII', 'i - - - bVI - - -', 'iv i', 'i bIII iv bVI', 'i bVI'],
    methods: { bank: 5, markov: 1, vamp: 2 },
    richness: [0.15, 0.5], energy: 0.4, space: 1, bright: 0.3, dark: 0.55,
    palette: {
      pad: ['fuzz-wall', 'choir-ah', 'choir-oo', 'dark-pad', 'vox-pad'], melody: ['violin', 'whistle', 'felt-keys', 'nylon', 'choir-oo', 'cello', 'chant-voice'],
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
    build: 0.15, name: 'Mysterious', colour: '#8b6fd0', style: 'ambient',
    scales: { dorian: 2, phrygian: 1.5, harmonicMinor: 1, hirajoshi: 1.2, inSen: 1, minor: 1 }, tempo: [56, 76], tuneTempo: [80, 104],
    chords: ['i bII', 'i IV', 'i bVII bVI bVII', 'i v iv i', 'i bIII bVII iv', 'i - bII -', 'i IV i bVII', 'i bVI'],
    methods: { bank: 4, markov: 2, vamp: 3 },
    richness: [0.4, 0.9], energy: 0.35, space: 0.8, bright: 0.45, dark: 0.45,
    palette: {
      pad: ['choir-oo', 'air-pad', 'glass-pad', 'dark-pad', 'bowed-vibes'], melody: ['kalimba', 'flute', 'glass-bell', 'ocarina', 'whistle'],
      counter: ['kalimba', 'harp', 'pizzicato'], keys: ['harp', 'kalimba', 'celesta', 'harpsichord'], arp: ['kalimba', 'harp', 'marimba'],
      bells: ['glass-bell', 'bell', 'chime', 'metal-ping', 'sine-bell'], bass: ['sub-bass', 'pluck-bass', 'upright'], drone: ['deep-drone', 'void', 'cello-drone', 'tape-loop'],
    },
    textures: ['drips', 'crickets', 'hum', 'wind', 'owl', 'frogs'], kits: ['clockwork', 'heartbeat'], drums: [0.15, 0.6], patterns: { drums: ['sparse', 'pulse'] },
  },
  tense: {
    group: 'Dark',
    opens: ['pad', 'bass', 'drone', 'drums'],
    build: 0.4, name: 'Tense', colour: '#c4573a', style: 'tune',
    scales: { phrygian: 2, harmonicMinor: 2, minor: 1.5, locrian: 0.5, hungarianMinor: 1 }, tempo: [70, 92], tuneTempo: [96, 132],
    chords: ['i bII', 'i - bII -', 'i iv bII V', 'i bVI V', 'i bII i bVII', 'i iv bVI V', 'i v bVI bII'],
    methods: { bank: 5, markov: 1, vamp: 2, chromatic: 1 },
    richness: [0.2, 0.6], energy: 0.65, space: 0.5, bright: 0.4, dark: 0.65,
    palette: {
      pad: ['strings', 'dark-pad', 'haunted-pad', 'analog-pad', 'tremolo-strings'], melody: ['violin', 'saw-lead', 'horn', 'pluck-lead', 'synth-brass'],
      counter: ['pizzicato', 'pluck-lead', 'strings', 'cello'], keys: ['felt-keys', 'pizzicato', 'harp', 'harpsichord'], arp: ['pluck-lead', 'pizzicato', 'saw-lead', 'marimba', 'harpsichord'],
      bells: ['bell', 'glass-bell', 'metal-ping'], bass: ['synth-bass', 'sub-bass', 'growl-bass', 'reese'], drone: ['deep-drone', 'cello-drone', 'bowed-metal'],
    },
    textures: ['rumble', 'hum', 'creaks', 'geiger'], kits: ['heartbeat', 'clockwork', 'taiko', 'machine'], drums: [0.3, 0.9], edge: 0.9,
    patterns: { bass: ['pulse', 'synco', 'octave'], drums: ['pulse', 'tribal', 'halftime', 'sparse'], pad: ['sustain', 'pulse'] },
  },
  // crystal castles, and the synths of dying light: dark and serious, a crushed chip lead over pumping
  // pads, octave bass and a club kick. as ambient it's the slower night drive, arps pulsing under pads
  neon: {
    group: 'Beats',
    opens: ['pad', 'arp', 'bass', 'drums'],
    build: 0.2, name: 'Neon', colour: '#d43fb4', style: 'tune',
    scales: { minor: 3, phrygian: 1, dorian: 1, harmonicMinor: 1 }, tempo: [80, 100], tuneTempo: [124, 140],
    meters: { '4/4': 1 },
    chords: ['i bVI bIII bVII', 'i - bVI -', 'i bVII bVI bVII', 'i iv', 'i bIII bVII iv', 'i v bVI iv', 'i - bII -', 'i bVI iv V'],
    methods: { bank: 5, markov: 1, vamp: 2 },
    richness: [0.1, 0.45], energy: 0.85, space: 0.6, bright: 0.6, dark: 0.6, edge: 1,
    palette: {
      pad: ['analog-pad', 'dark-pad', 'choir-ah', 'glass-pad', 'vox-pad'], melody: ['bit-lead', 'pulse-lead', 'saw-lead', 'sine-bell'],
      counter: ['pluck-lead', 'pulse-lead', 'synth-brass'], keys: ['e-piano', 'pluck-lead'], arp: ['pluck-lead', 'pulse-lead', 'sine-bell', 'saw-lead'],
      bells: ['sine-bell', 'glass-bell'], bass: ['synth-bass', 'reese', 'growl-bass', 'sub-bass', '808-bass', 'moog-bass'], drone: ['deep-drone', 'void'],
    },
    textures: ['hum', 'vinyl'], kits: ['club-kit', 'machine', 'chip-kit'], drums: [0.35, 1],
    patterns: { drums: ['four', 'four', 'break', 'halftime'], pad: ['pump', 'pump', 'sustain'], bass: ['octave', 'synco', 'pulse'], melody: ['riff', 'phrases', 'riff'] },
    fx: { drive: 0.35 },
  },
  eerie: {
    group: 'Dark',
    opens: ['drone', 'pad'],
    build: 0.15, name: 'Eerie', colour: '#9fcf4f', style: 'ambient',
    scales: { phrygian: 1.5, locrian: 1.5, hungarianMinor: 1.5, wholeTone: 1, inSen: 1, harmonicMinor: 1 }, tempo: [44, 64], tuneTempo: [70, 96],
    chords: ['i bII', 'i #iv°', 'i bvi', 'i - #iv -', 'i III', 'i bII bvii', 'i vii°'],
    methods: { chromatic: 4, bank: 3, vamp: 1 },
    richness: [0.4, 1], energy: 0.2, space: 0.9, bright: 0.3, dark: 1,
    palette: {
      pad: ['haunted-pad', 'dark-pad', 'choir-oo', 'air-pad', 'reverse-piano', 'bowed-vibes', 'tremolo-strings'], melody: ['music-box', 'glass-bell', 'whistle', 'violin', 'harpsichord', 'soprano'],
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
      pad: ['dark-pad', 'reverse-piano', 'analog-pad', 'haunted-pad', 'bowed-vibes'], melody: ['nylon', 'sine-bell', 'felt-keys', 'whistle'],
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
    build: 0.45, name: 'Heroic', colour: '#d4a13a', style: 'tune',
    scales: { mixolydian: 2, major: 2, minor: 1.5, dorian: 1 }, tempo: [66, 84], tuneTempo: [92, 124],
    meters: { '4/4': 6, '3/4': 1, '6/8': 2 },
    chords: ['I bVII IV I', 'i bVI bIII bVII', 'I V vi IV', 'IV V iii vi', 'I bVI bVII I', 'i bVI bVII i', 'I IV V I', 'I iii IV V'],
    richness: [0.1, 0.45], energy: 0.8, space: 0.6, bright: 0.65, dark: 0.2,
    palette: {
      pad: ['strings', 'choir-ah', 'warm-pad', 'organ', 'brass-section', 'tremolo-strings'], melody: ['horn', 'violin', 'flute', 'saw-lead', 'synth-brass', 'trumpet'],
      counter: ['horn', 'strings', 'violin', 'cello'], keys: ['harp', 'pizzicato', 'felt-keys'], arp: ['harp', 'pizzicato', 'pluck-lead'],
      bells: ['bell', 'chime'], bass: ['pluck-bass', 'synth-bass', 'round-bass'], drone: ['cello-drone', 'organ-drone'],
    },
    textures: ['wind'], kits: ['taiko', 'tight-kit'], drums: [0.2, 0.95], edge: 0.9,
    patterns: { drums: ['march', 'tribal', 'groove'], bass: ['octave', 'rootfifth', 'pulse'] },
    orchestra: { pass: 0.5, double: 0.35 },
  },

  // ---------- magic: wizard101's worlds ----------
  // nelson everhart's wizard101 scores (the spiral's worlds) are a small orchestra playing a place, and
  // they share their ways of doing it:
  //   - the tune handed round the woodwinds, strings and horns, call and answer (orchestration)
  //   - themes brought in one at a time over the same chords, each on its own instrument, then played
  //     together, then somewhere quieter on other instruments (a celesta over a harp), and the whole
  //     orchestra to finish (weave)
  //   - a harp, harpsichord, pizzicato or koto keeping a figure going under it all (an ostinato)
  //   - a cymbal, a gong or a bell tree marking each new section, timpani at the top
  //   - major and minor borrowed from each other (a minor iv in a major key, a major chord ending a minor
  //     tune), harmonic minor's sharp seventh, a lydian lift, a key change at the climax
  //   - waltzes, everywhere: marleybone, wysteria, darkmoor, celestia
  //   - each world's colour over the orchestra: krokotopia's lyre and sistrum, mooshu's koto and gong
  // written to loop while you walk round a world, so they open in the loop style. from listening, the
  // guided listening write-ups at ravenwood academy (marleybone, wizard city, dragonspyre, krokotopia,
  // mooshu, celestia, darkmoor, wysteria) and everhart's 2009 interview with todd coleman

  // wizard city (and hogwarts, john williams's hedwig's theme): the commons' tune falls down the scale
  // with quick runs and rocks between two notes, on an english horn (the oboe stands in) then a flute,
  // over bouncing pizzicato. ravenwood's horn climbs a lydian arpeggio, the strings rocking under it.
  // olde town and unicorn way bring the themes together and change key at the top. a bassoon in the
  // bass, and the magic chords: a major key borrowing from its minor (the major third chord, the minor
  // four) and harmonic minor's sharp seventh
  magic: {
    group: 'Magic', opens: ['keys', 'arp', 'bass'],
    build: 0.3, weave: 0.5, name: 'Magic', colour: '#7b68d8', style: 'loop',
    scales: { major: 3, lydian: 1.5, harmonicMinor: 1.5, melodicMinor: 0.7, dorian: 0.5 }, tempo: [60, 78], tuneTempo: [96, 128],
    meters: { '4/4': 3, '3/4': 3, '6/8': 2 },
    chords: ['I III IV iv', 'i iv V i', 'I bVI IV iv', 'I vi ii V', 'I III vi IV', 'IV iv I -', 'I II IV I', 'Imaj7 II IV iv', 'I iii IV V', 'i VI iv V'],
    methods: { bank: 6, markov: 2 },
    richness: [0.2, 0.6], energy: 0.55, space: 0.7, bright: 0.65, dark: 0.25, edge: 0.6, surprise: 0, ornate: 0.9,
    phrasing: { shapes: { fall: 2, pendulum: 2, zigzag: 1.5, triad: 1.5, leap: 1, climb: 1 }, hook: 0.5 },
    palette: {
      melody: ['flute', 'clarinet', 'oboe', 'celesta', 'horn', 'violin'], counter: ['clarinet', 'oboe', 'horn', 'cello', 'bassoon', 'flute'],
      keys: ['pizzicato', 'harp', 'celesta', 'harpsichord'], arp: ['harp', 'pizzicato', 'celesta'], bells: ['celesta', 'glock', 'music-box', 'glass-bell'],
      pad: ['strings', 'choir-oo', 'tremolo-strings', 'organ', 'shimmer'], bass: ['bassoon', 'upright', 'tuba'], drone: ['cello-drone', 'organ-drone'],
    },
    textures: ['chimes', 'owl', 'birds', 'fire'], kits: ['spell-kit', 'orchestra-kit'], drums: [0, 0.4],
    layers: { keys: 0.85, counter: 0.6, bells: 0.5, arp: 0.35 },
    patterns: { keys: ['broken', 'waltz', 'block'], arp: ['up', 'updown'], bass: ['rootfifth', 'hook', 'held'], drums: ['sparse', 'march', 'pulse'], melody: ['phrases', 'phrases', 'calls'], counter: ['counterpoint', 'answer'], pad: ['sustain', 'swell'], bells: ['sparkle'] },
    orchestra: { pass: 0.7, double: 0.6 },
  },
  // marleybone: a foggy victorian london of dogs in top hats, and the spiral's grandest waltz. a clarinet
  // over a fluttering harp and chiming bells, the strings swelling in, then the waltz proper: the tune
  // passed from the clarinet to the horns with a harpsichord keeping time, a cymbal crash and the clarinet
  // back, the strings and trumpets carrying it to the top, a hushed celesta passage, then the horns over
  // everyone. its other themes: a cello's tune over a celesta, a key change into harmonic minor with a
  // bell tree, a flute and a bassoon in counterpoint over a pizzicato waltz, a tuba's fanfare, and a
  // march that's dark and joyous at once. (the sneaking detective it used to be is Back alleys)
  gaslamp: {
    group: 'Magic', opens: ['keys', 'arp', 'bass'],
    weave: 0.65, name: 'Gaslamp', colour: '#8a8f6a', style: 'loop',
    scales: { harmonicMinor: 2.5, minor: 1.5, major: 1.5, melodicMinor: 1, dorian: 0.5 }, tempo: [64, 82], tuneTempo: [108, 138],
    meters: { '3/4': 6, '4/4': 2, '6/8': 1 },
    chords: ['i iv V i', 'i bVI ii° V', 'i - iv V', 'i VI ii° V', 'I vi ii V', 'iv i V i', 'I III IV iv', 'i iv bVII III', 'I iv I V', 'i VI III V'],
    methods: { bank: 6, markov: 2 },
    richness: [0.15, 0.5], energy: 0.6, space: 0.55, bright: 0.5, dark: 0.4, edge: 0.7, surprise: 0, ornate: 1,
    phrasing: { shapes: { arch: 2, turn: 2, leap: 2, sigh: 1, pendulum: 1 }, hook: 0.4 },
    palette: {
      melody: ['clarinet', 'oboe', 'violin', 'flute', 'horn'], counter: ['cello', 'bassoon', 'horn', 'flute', 'oboe', 'trombone'],
      keys: ['harpsichord', 'pizzicato', 'harp', 'celesta'], arp: ['harp', 'harpsichord', 'pizzicato', 'celesta'], bells: ['celesta', 'glock', 'music-box'],
      pad: ['strings', 'brass-section', 'tremolo-strings', 'organ'], bass: ['tuba', 'bassoon', 'upright'], drone: ['cello-drone', 'organ-drone'],
    },
    textures: ['rain', 'creaks', 'fire'], kits: ['orchestra-kit', 'clockwork'], drums: [0.2, 0.7],
    layers: { counter: 0.6, keys: 0.85, pad: 0.65, bells: 0.45 },
    patterns: { keys: ['waltz', 'waltz', 'broken'], arp: ['up', 'updown', 'converge'], bass: ['rootfifth', 'walking', 'hook'], drums: ['sparse', 'march', 'pulse'], melody: ['phrases', 'phrases', 'calls'], counter: ['counterpoint', 'answer'], pad: ['sustain', 'swell', 'stabs'], bells: ['sparkle'] },
    orchestra: { pass: 0.6, double: 0.3 },
  },
  // dragonspyre: a fallen city of fire and ash. a minor chord with its major seventh held over everyone
  // (imaj7), harps and woodwinds fluttering down, the strings' tune with the brass against it, a lone
  // trumpet's call answered by low brass and a men's choir, a march on the snare and bass drum, woodwind
  // arpeggios swooping like wings, chromatic mediants (bIII and bVI, and a minor key's major III and VI)
  // and a major chord to end a minor phrase on (a picardy third). the fire crackling under it. it took
  // over from epic, which was the same orchestra playing trailers
  dragon: {
    group: 'Magic', opens: ['drone', 'pad', 'drums'],
    build: 0.45, weave: 0.35, name: 'Dragon', colour: '#a33a24', style: 'tune',
    scales: { phrygian: 2, harmonicMinor: 2, minor: 2, hungarianMinor: 0.7 }, tempo: [54, 70], tuneTempo: [84, 124],
    meters: { '4/4': 6, '3/4': 1.5, '6/8': 1.5 },
    chords: ['i bII i bII', 'i bVI bVII i', 'i iv bVI V', 'i - bVI -', 'i bVI bIII bVII', 'iv i bVI V', 'i bVI iv V', 'imaj7 iv V I', 'i III bVI V', 'i VI bIII V', 'i bIII VI V'],
    methods: { bank: 6, markov: 1, vamp: 1.5 },
    richness: [0, 0.3], energy: 0.75, space: 0.8, bright: 0.45, dark: 0.75, edge: 0.9, surprise: 0, ornate: 0.8,
    palette: {
      melody: ['horn', 'violin', 'trumpet', 'choir-oo', 'trombone', 'oboe', 'chant-voice', 'cello'], counter: ['trombone', 'horn', 'strings', 'bassoon', 'chant-voice', 'cello'],
      keys: ['pizzicato', 'harp', 'piano', 'harpsichord'], arp: ['harp', 'pizzicato', 'piano'], bells: ['bell', 'glock', 'celesta'],
      pad: ['choir-ah', 'strings', 'organ', 'brass-section', 'dark-pad', 'tremolo-strings'], bass: ['tuba', 'round-bass', 'sub-bass', 'bassoon'], drone: ['organ-drone', 'cello-drone', 'deep-drone'],
    },
    textures: ['fire', 'rumble', 'wind'], kits: ['orchestra-kit', 'taiko'], drums: [0.4, 1],
    layers: { pad: 1, drone: 0.4, counter: 0.6 },
    patterns: { drums: ['tribal', 'march', 'halftime', 'march'], pad: ['sustain', 'pulse', 'stabs', 'swell'], bass: ['octave', 'held', 'pulse'], arp: ['down', 'updown', 'converge'], melody: ['long', 'phrases', 'phrases'], counter: ['counterpoint', 'harmony'], drone: ['tonic', 'fifths'] },
    orchestra: { pass: 0.55, double: 0.3 },
  },
  // krokotopia: a desert empire of crocodile pharaohs, as an orchestra plays it rather than a bazaar
  // band (that's Desert and Egyptian). a tam-tam strikes to open, a harp keeps time under lyres and reeds,
  // horns hold a slow tune of long notes, an oboe dances over it, then the strings with the horn against
  // them. a lyre states a theme twice and a vibraphone takes it. its march: a low flute's dancing tune
  // over an ostinato, passed to the oboe and the horn, hand drums, a triangle on two and a sistrum
  // scraping the off beats, and a royal intrada with the loudest tam-tam of all
  sands: {
    group: 'Magic', opens: ['keys', 'arp', 'drone'],
    weave: 0.5, name: 'Sands', colour: '#c9a14a', style: 'loop',
    scales: { phrygianDominant: 2, harmonicMinor: 2, doubleHarmonic: 1, minor: 1.5, dorian: 0.5 }, tempo: [58, 74], tuneTempo: [88, 118],
    meters: { '4/4': 5, '3/4': 1.5, '6/8': 1 },
    chords: ['I bII I -', 'i iv V i', 'I bII bvii I', 'i bVI V i', 'iv V i -', 'I - bII -', 'i bVI bVII i', 'i iv bVI V'],
    methods: { bank: 5, vamp: 2, markov: 1 },
    richness: [0, 0.25], energy: 0.6, space: 0.65, bright: 0.55, dark: 0.4, edge: 0.7, surprise: 0, ornate: 1.2,
    phrasing: { shapes: { chant: 1.5, turn: 2, arch: 2, sigh: 1, zigzag: 1 }, rhythm: 'long', hook: 0.3 },
    palette: {
      melody: ['horn', 'oboe', 'flute', 'violin', 'clarinet'], counter: ['horn', 'cello', 'oboe', 'bassoon', 'flute'],
      keys: ['harp', 'lyre', 'pizzicato'], arp: ['harp', 'lyre', 'pizzicato'], bells: ['vibes', 'celesta', 'glock'],
      pad: ['strings', 'brass-section', 'choir-ah', 'tremolo-strings'], bass: ['upright', 'bassoon', 'tuba'], drone: ['cello-drone', 'organ-drone'],
    },
    textures: ['wind', 'fire', 'stream'], kits: ['palace-kit'], drums: [0.3, 0.8],
    layers: { keys: 0.8, counter: 0.6, pad: 0.75 },
    patterns: { drums: ['march', 'maqsum', 'tribal', 'sparse'], keys: ['broken', 'broken', 'strum'], arp: ['up', 'updown', 'converge'], bass: ['rootfifth', 'held', 'hook'], melody: ['long', 'phrases', 'phrases'], counter: ['counterpoint', 'answer'], pad: ['sustain', 'swell'], bells: ['sparkle'], drone: ['tonic', 'fifths'] },
    orchestra: { pass: 0.6, double: 0.3 },
  },
  // mooshu: a high gong, then plucked strings (the koto) playing together, and a flute holding a note
  // with a grace on it. its first theme is quick, syncopated and fluttering, the flute calling and the
  // koto answering over finger cymbals. the second is calmer, the bowed strings coming in and the flute
  // holding it out. then the strings keep a figure going and the flute plays both themes as one. the
  // erhu sings the second theme when the plague comes, the brass climbing and the harp and high strings
  // falling. war is dark brass and deep drums in an uneven beat (seven, here five), and its mystic theme
  // a koto in even eighths that feel syncopated, finger cymbals, blocks, a tam-tam and everyone at the end
  jade: {
    group: 'Magic', opens: ['keys', 'arp', 'drone'],
    weave: 0.6, name: 'Jade', colour: '#3f9e7a', style: 'loop',
    scales: { majorPentatonic: 3, minorPentatonic: 1.5, hirajoshi: 1, dorian: 0.7 }, tempo: [56, 72], tuneTempo: [84, 116],
    meters: { '4/4': 6, '3/4': 1, '6/8': 0.5 },
    chords: ['I - IV I', 'vi IV I V', 'I V vi iii', 'IV V iii vi', 'vi - I -', 'I vi IV V', 'i bVII bVI bVII', 'I II IV I'],
    methods: { bank: 5, vamp: 2, markov: 1 },
    richness: [0, 0.3], energy: 0.55, space: 0.7, bright: 0.6, dark: 0.3, edge: 0.7, surprise: 0, ornate: 1.2,
    phrasing: { shapes: { zigzag: 2, turn: 2, fall: 1.5, pendulum: 1.5, leap: 1 }, rhythm: 'syncopated', hook: 0.5 },
    palette: {
      melody: ['flute', 'shakuhachi', 'erhu', 'koto'], counter: ['erhu', 'cello', 'horn', 'flute', 'shakuhachi'],
      keys: ['koto', 'harp', 'pizzicato', 'zither'], arp: ['koto', 'harp', 'zither', 'pizzicato'], bells: ['glock', 'celesta', 'vibes'],
      pad: ['strings', 'tremolo-strings', 'choir-oo', 'brass-section'], bass: ['upright', 'bassoon', 'tuba'], drone: ['cello-drone', 'organ-drone'],
    },
    textures: ['wind', 'stream', 'chimes', 'birds'], kits: ['jade-kit', 'temple'], drums: [0.3, 0.8],
    layers: { keys: 0.85, counter: 0.6, pad: 0.7 },
    patterns: { drums: ['sparse', 'march', 'tribal'], keys: ['broken', 'strum'], arp: ['up', 'updown', 'converge'], bass: ['rootfifth', 'held'], melody: ['phrases', 'phrases', 'calls'], counter: ['counterpoint', 'answer'], pad: ['sustain', 'swell'], bells: ['sparkle'], drone: ['tonic', 'fifths'] },
    orchestra: { pass: 0.6, double: 0.3 },
  },
  // avalon: king arthur's land, green and old, with the fae close by. not written up anywhere I could
  // find, so this one's from listening and the spiral's habits: noble horns and strings over a harp, a
  // flute or a whistle with a lilt to it, dorian and mixolydian, a dance in six or three, then everyone at
  // the end. grizzleheim, the north (Longhouse), is a cousin: a men's choir, horns and drums, fifths
  greenwood: {
    group: 'Magic', opens: ['keys', 'arp', 'pad'],
    weave: 0.5, name: 'Greenwood', colour: '#5c8a3a', style: 'loop',
    scales: { dorian: 2.5, mixolydian: 2, major: 1.5, minor: 1 }, tempo: [58, 74], tuneTempo: [96, 126],
    meters: { '6/8': 3, '3/4': 2, '4/4': 3 },
    chords: ['i bVII i -', 'I bVII IV I', 'i bIII bVII i', 'I IV I V', 'i iv bVII III', 'I vi IV V', 'i bVI bVII i', 'IV I V vi'],
    methods: { bank: 5, markov: 2 },
    richness: [0.1, 0.4], energy: 0.55, space: 0.7, bright: 0.6, dark: 0.3, edge: 0.7, surprise: 0, ornate: 1.1,
    phrasing: { shapes: { arch: 2, leap: 2, wave: 1.5, triad: 1.5, turn: 1 }, rhythm: 'dotted', hook: 0.4 },
    palette: {
      melody: ['flute', 'horn', 'violin', 'whistle', 'oboe', 'clarinet'], counter: ['horn', 'cello', 'violin', 'flute', 'bassoon', 'tenor-recorder'],
      keys: ['harp', 'pizzicato', 'harpsichord'], arp: ['harp', 'pizzicato', 'lyre'], bells: ['glock', 'celesta', 'music-box'],
      pad: ['strings', 'brass-section', 'choir-ah', 'tremolo-strings'], bass: ['upright', 'bassoon', 'tuba'], drone: ['cello-drone', 'organ-drone'],
    },
    textures: ['birds', 'leaves', 'stream', 'owl'], kits: ['orchestra-kit', 'hand-drums'], drums: [0.2, 0.7],
    layers: { keys: 0.8, counter: 0.6, pad: 0.75 },
    patterns: { drums: ['march', 'sparse', 'pulse', 'tribal'], keys: ['broken', 'waltz', 'strum'], arp: ['up', 'updown'], bass: ['rootfifth', 'held'], melody: ['phrases', 'phrases', 'long'], counter: ['counterpoint', 'answer'], pad: ['sustain', 'swell'], bells: ['sparkle'], drone: ['fifths', 'tonic'] },
    orchestra: { pass: 0.6, double: 0.3 },
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
    build: 0.25, name: 'Metal', colour: '#9c2f2f', style: 'tune',
    scales: { phrygian: 2, minor: 2, harmonicMinor: 1, minorPentatonic: 1, locrian: 0.3 }, tempo: [56, 76], tuneTempo: [118, 172],
    meters: { '4/4': 8, '6/8': 1 },
    chords: ['i - - bII', 'i - bVI bVII', 'i bII i bVII', 'i - bIII bII', 'i bVI bIII bVII', 'i - iv bVI', 'i - bVI V', 'i bVII bVI bVII'],
    methods: { bank: 6, vamp: 2, markov: 0.5 },
    richness: [0, 0.15], energy: 1, space: 0.35, bright: 0.6, dark: 0.7, edge: 1.25, surprise: 0,
    palette: {
      // (the sludge guitar came over when sludge became metal made slow and dark)
      guitar: ['metal-guitar', 'metal-guitar', 'sludge-guitar'], melody: ['metal-lead', 'lead-guitar'], counter: ['lead-guitar', 'metal-lead'],
      pad: ['dark-pad', 'choir-ah', 'strings'], keys: ['felt-keys'], arp: ['pluck-lead'], bells: ['bell'],
      bass: ['pick-bass', 'growl-bass'], drone: ['deep-drone', 'bowed-metal'],
    },
    textures: ['feedback', 'rumble'], kits: ['metal-kit'], drums: [0.5, 1],
    layers: { guitar: 1, keys: 0, arp: 0.05, pad: 0.2, counter: 0.35, bells: 0.05, drone: 0.15, texture: 0.15 },
    patterns: { guitar: ['chug', 'chug', 'power'], 'ambient.guitar': ['ring', 'tremolo'], drums: ['double', 'rock', 'punk', 'double'], 'ambient.drums': ['halftime', 'sparse'], bass: ['riff', 'riff', 'pulse'], counter: ['harmony'], melody: ['phrases', 'riff', 'calls'] },
    forms: METAL_FORMS, solo: 0.9, soloOver: 'B', breakdown: true, fx: { drive: 0.15 },
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
  // (major sevenths, added ninths, a borrowed iv) blurred by the room. read from the tabs of about 150 of
  // these bands' songs: whatever the chord, two strings ring on the same notes over it (openStrings), so
  // a major key leans on IVmaj7 and vi, a minor one on bIIImaj7 and bVImaj7 (whirr's blue, slowdive's
  // when the sun hits), and my bloody valentine's major II (when you sleep, come in alone). its kinds
  // (FLAVOURS) split the rest by feel: fast walls of eighths, slow crushing half time, sad waltzes,
  // drop tuned 90s riffs, sultry and slow, golden, warped and dancing, and bedroom recordings
  shoegaze: {
    group: 'Loud', opens: ['guitar', 'pad', 'drums'],
    build: 0.35, name: 'Shoegaze', colour: '#e0709a', style: 'tune',
    scales: { major: 2, mixolydian: 2, lydian: 1, dorian: 1, minor: 0.7 }, tempo: [64, 82], tuneTempo: [88, 126],
    meters: { '4/4': 7, '6/8': 1.5, '3/4': 1 },
    chords: ['I IV', 'Imaj7 IVmaj7', 'I bVII IV I', 'I iii IV iv', 'I - IV -', 'IV I V vi', 'I vi IV iv', 'Iadd9 IVadd9', 'I bIII IV I', 'IVmaj7 I vi V', 'I II IV I', 'IVadd9 vi I -', 'bVImaj7 bIIImaj7 i -'],
    richness: [0.5, 0.95], energy: 0.75, space: 1, bright: 0.5, dark: 0.2, edge: 0.95, surprise: 0, openStrings: true,
    palette: {
      guitar: ['glide-guitar', 'fuzz-guitar', 'offset-guitar', 'octave-fuzz'], pad: ['reverse-guitar', 'fuzz-wall', 'swell-guitar', 'glass-pad'], melody: ['dream-voice', 'fuzz-lead', 'ebow-lead', 'alto-voice'],
      counter: ['chorus-guitar', 'fuzz-lead', 'ebow-lead'], keys: ['chorus-guitar'], arp: ['chorus-guitar', 'clean-guitar'], bells: ['glass-bell', 'sine-bell', 'bridge-chimes', 'harmonics'],
      bass: ['pick-bass', 'round-bass', 'chorus-bass'], drone: ['tape-loop', 'organ-drone'],
    },
    textures: ['feedback', 'hum', 'vinyl'], kits: ['gaze-kit'], drums: [0.25, 0.95],
    layers: { guitar: 1, pad: 0.8, keys: 0, arp: 0.15, counter: 0.3, bells: 0.15, drone: 0.25, texture: 0.3 },
    patterns: { guitar: ['ring', 'tremolo', 'ring', 'strum', 'wash', 'glide'], 'ambient.guitar': ['ring', 'tremolo'], drums: ['wash', 'wash', 'rock'], 'ambient.drums': ['wash', 'sparse', 'pulse'], bass: ['pulse', 'held', 'rootfifth'], pad: ['sustain', 'swell'], melody: ['long', 'phrases', 'long'] },
    forms: GAZE_FORMS, solo: 0.5, bury: 0.8, fx: { wobble: 0.35, drive: 0.1 },
  },
  // slowdive's quieter side, cocteau twins, beach house: chorused clean guitars ringing and picked out
  // in a big echo, a breathy voice floating over them, slow organ and synth pads, and a drum machine
  // ticking away gently
  dreampop: {
    group: 'Loud', opens: ['arp', 'guitar', 'pad', 'drums'],
    name: 'Dream pop', colour: '#8fd3cf', style: 'tune',
    scales: { major: 2, lydian: 1.5, mixolydian: 1, dorian: 1, minor: 0.5 }, tempo: [58, 76], tuneTempo: [72, 104],
    meters: { '4/4': 6, '6/8': 2, '3/4': 1.5 },
    chords: ['Imaj7 IVmaj7', 'I vi IV V', 'I iii vi IV', 'IVmaj7 V iii vi', 'I II IV I', 'vi IV I V', 'I V vi iii', 'Imaj7 iii IVmaj7 iv'],
    richness: [0.45, 0.9], energy: 0.5, space: 0.95, bright: 0.55, dark: 0.15, edge: 0.8, surprise: 0,
    palette: {
      guitar: ['chorus-guitar', 'clean-guitar'], pad: ['swell-guitar', 'analog-pad', 'organ', 'glass-pad', 'choir-oo', 'vox-pad'], melody: ['dream-voice', 'chorus-guitar', 'sine-bell', 'alto-voice'],
      counter: ['chorus-guitar', 'clean-guitar', 'glass-bell'], keys: ['e-piano', 'chorus-guitar', 'wurlitzer'], arp: ['chorus-guitar', 'clean-guitar', 'harp'], bells: ['glass-bell', 'sine-bell', 'celesta'],
      bass: ['round-bass', 'chorus-bass', 'pick-bass'], drone: ['organ-drone', 'tape-loop'],
    },
    textures: ['vinyl', 'hum', 'ocean', 'rain'], kits: ['machine', 'gaze-kit'], drums: [0.25, 0.85],
    layers: { guitar: 0.7, pad: 0.8, keys: 0.25, arp: 0.6, counter: 0.25, bells: 0.25, drone: 0.2, texture: 0.4 },
    patterns: { guitar: ['ring', 'strum', 'tremolo'], drums: ['wash', 'groove', 'halftime', 'four'], arp: ['updown', 'up', 'twinkle'], bass: ['held', 'rootfifth', 'pulse'], melody: ['long', 'phrases', 'fragments'] },
    forms: GAZE_FORMS, solo: 0.35, bury: 0.5, fx: { wobble: 0.4 },
  },
  // the cocteau twins (treasure, heaven or las vegas, victorialand): elizabeth fraser's voice soaring
  // and fluttering in words of its own, up front rather than buried, over robin guthrie's chorused
  // guitars cascading through long echoes, simon raymonde's bass playing a tune of its own, and a drum
  // machine. dreamy but melodic: the tune is the point. its flavours are the dancing side and the
  // mellow, sad side (FLAVOURS)
  ethereal: {
    group: 'Loud', opens: ['arp', 'guitar', 'pad', 'bass'],
    build: 0.3, name: 'Ethereal', colour: '#c9a7e8', style: 'tune',
    scales: { major: 2, lydian: 2, mixolydian: 1, dorian: 1 }, tempo: [60, 78], tuneTempo: [92, 116],
    meters: { '4/4': 6, '6/8': 2, '3/4': 1 },
    chords: ['Iadd9 IVmaj7', 'I iii IV iv', 'I V vi IV', 'IVmaj7 I V vi', 'I bVII IV I', 'vi IV I V', 'Imaj7 iii7 IVmaj7 V', 'I II IV I'],
    richness: [0.45, 0.85], energy: 0.6, space: 1, bright: 0.65, dark: 0.15, edge: 0.7, surprise: 0, ornate: 1.3,
    palette: {
      guitar: ['chorus-guitar', 'clean-guitar'], melody: ['dream-voice', 'dream-voice', 'chorus-guitar', 'glass-bell', 'alto-voice'], counter: ['chorus-guitar', 'clean-guitar', 'glass-bell', 'choir-oo'],
      keys: ['chorus-guitar', 'e-piano', 'harp'], arp: ['chorus-guitar', 'clean-guitar', 'harp', 'celesta'], bells: ['glass-bell', 'celesta', 'sine-bell', 'glock'],
      pad: ['swell-guitar', 'reverse-guitar', 'glass-pad', 'choir-oo', 'shimmer', 'vox-pad'], bass: ['chorus-bass', 'pick-bass', 'round-bass', 'fretless'], drone: ['tape-loop', 'organ-drone'],
    },
    textures: ['vinyl', 'ocean'], kits: ['machine', 'gaze-kit'], drums: [0.3, 0.9],
    layers: { guitar: 0.6, arp: 0.75, pad: 0.8, keys: 0.2, counter: 0.35, bells: 0.3, drone: 0.15, texture: 0.25 },
    patterns: { guitar: ['ring', 'strum', 'tremolo'], arp: ['updown', 'twinkle', 'up', 'down'], drums: ['groove', 'halftime', 'wash'], bass: ['synco', 'rootfifth', 'octave', 'held'], melody: ['phrases', 'phrases', 'long', 'calls'], counter: ['counterpoint', 'harmony'], pad: ['sustain', 'swell'] },
    solo: 0.2, bury: 0.15, fx: { wobble: 0.25, echo: 0.3 },
  },

  // ---------- world and electronic ----------
  // places and genres. they keep to themselves (surprise: 0), so adding them left older moods' songs as
  // they were. a world mood as a boss (desert, angry) is calamity's desert scourge

  // arabian nights, a bazaar, the sands: the phrygian dominant scale (its flat second over a major
  // chord), an oud and a shawm (a zurna) over a drone and hand drums, and the andalusian cadence
  desert: {
    group: 'World', opens: ['drums', 'drone', 'arp', 'keys'],
    build: 0.2, name: 'Desert', colour: '#e0a458', style: 'tune',
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
    orchestra: { pass: 0.35, double: 0.1 },
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
    orchestra: { pass: 0.3, double: 0.3 },
  },
  // woods, villages and taverns: a fiddle, a tin whistle or a bagpipe's chanter over a strummed guitar,
  // open fifths droning, a bodhran, and jigs in 6/8. dorian and mixolydian, the old modes of folk tunes
  folk: {
    group: 'World', opens: ['keys', 'drone', 'drums'],
    build: 0.15, name: 'Folk', colour: '#8fb35a', style: 'tune',
    scales: { dorian: 3, mixolydian: 2, major: 2, minor: 1, majorPentatonic: 1 }, tempo: [58, 76], tuneTempo: [96, 132],
    meters: { '6/8': 4, '4/4': 4, '3/4': 2 },
    chords: ['i bVII i bVII', 'I bVII IV I', 'i bIII bVII i', 'I IV I V', 'i iv bVII i', 'I V IV I', 'i bVII bVI bVII', 'I - bVII -'],
    methods: { bank: 5, vamp: 2, markov: 1 },
    richness: [0, 0.3], energy: 0.6, space: 0.5, bright: 0.6, dark: 0.15, surprise: 0,
    palette: {
      pad: ['strings', 'organ', 'warm-pad'], melody: ['violin', 'whistle', 'pan-flute', 'shawm', 'accordion', 'flute'], counter: ['violin', 'whistle', 'harp', 'clarinet', 'tenor-recorder'],
      keys: ['nylon', 'harp', 'steel-guitar', 'zither'], arp: ['harp', 'nylon', 'steel-guitar', 'banjo', 'zither'], bells: ['chime', 'celesta'],
      bass: ['upright', 'round-bass', 'tuba'], drone: ['organ-drone', 'cello-drone'],
    },
    textures: ['birds', 'leaves', 'stream', 'fire', 'owl'], kits: ['hand-drums'], drums: [0.15, 0.85],
    patterns: { drums: ['groove', 'march', 'tribal'], drone: ['fifths', 'tonic'], bass: ['rootfifth', 'held'], keys: ['strum', 'waltz', 'broken'], melody: ['phrases', 'riff', 'phrases'] }, ornate: 1.3,
    orchestra: { pass: 0.4, double: 0.15 },
  },
  // snow, ice and christmas: celesta and glass bells, a shimmering pad, a waltz now and then, the wind
  // and a fire
  wintry: {
    group: 'World', opens: ['pad', 'keys', 'arp'],
    build: 0.15, name: 'Wintry', colour: '#a9d6e5', style: 'ambient',
    scales: { lydian: 2, major: 2, minor: 1.5, dorian: 1 }, tempo: [56, 74], tuneTempo: [84, 110],
    meters: { '4/4': 4, '3/4': 2, '6/8': 1 },
    chords: ['I II', 'i bVI bIII bVII', 'Imaj7 IVmaj7', 'I iii IV iv', 'vi IV I V', 'i iv bVII bIII', 'IV V iii vi'],
    richness: [0.4, 0.85], energy: 0.35, space: 0.85, bright: 0.8, dark: 0.15, surprise: 0,
    palette: {
      pad: ['glass-pad', 'shimmer', 'strings', 'choir-oo', 'air-pad', 'bowed-vibes'], melody: ['celesta', 'glass-bell', 'flute', 'music-box', 'violin', 'glock'], counter: ['harp', 'celesta', 'flute'],
      keys: ['celesta', 'harp', 'felt-keys', 'piano', 'harpsichord'], arp: ['celesta', 'music-box', 'harp', 'glass-bell', 'glock', 'harpsichord', 'zither'], bells: ['glass-bell', 'chime', 'celesta', 'sine-bell', 'glock'],
      bass: ['round-bass', 'sub-bass', 'upright'], drone: ['organ-drone', 'cello-drone'],
    },
    textures: ['wind', 'chimes', 'fire'], kits: ['soft-kit', 'brushes'], drums: [0.05, 0.5],
    patterns: { drums: ['pulse', 'sparse', 'groove'], arp: ['up', 'updown', 'twinkle'], melody: ['phrases', 'long'] },
    orchestra: { pass: 0.3, double: 0.35 },
  },
  // night drives in the 80s future (outrun, kavinsky, the hotline miami and far cry blood dragon
  // scores): a saw lead or synth brass over arps, an octave bass in eighths and a drum machine
  synthwave: {
    group: 'Beats', opens: ['arp', 'bass', 'drums', 'pad'],
    build: 0.3, name: 'Synthwave', colour: '#ff6ac1', style: 'tune',
    scales: { minor: 3, dorian: 1.5, major: 1, mixolydian: 1 }, tempo: [76, 94], tuneTempo: [96, 124],
    meters: { '4/4': 1 },
    chords: ['i bVI bIII bVII', 'i bVII bVI bVII', 'vi IV I V', 'i iv bVI bVII', 'i - bVI bVII', 'IVmaj7 V iii vi', 'i bIII bVII iv', 'I V vi IV'],
    methods: { bank: 5, markov: 1, vamp: 1 },
    richness: [0.15, 0.5], energy: 0.75, space: 0.7, bright: 0.65, dark: 0.35, edge: 1, surprise: 0,
    palette: {
      pad: ['analog-pad', 'warm-pad', 'strings', 'glass-pad', 'vox-pad'], melody: ['saw-lead', 'synth-brass', 'square-lead', 'soft-lead', 'moog-lead'], counter: ['synth-brass', 'pluck-lead', 'soft-lead'],
      keys: ['e-piano', 'pluck-lead'], arp: ['pluck-lead', 'saw-lead', 'sine-bell'], bells: ['sine-bell', 'glass-bell'],
      bass: ['synth-bass', 'reese', 'sub-bass', '808-bass', 'moog-bass'], drone: ['deep-drone'],
    },
    textures: ['hum'], kits: ['machine', 'club-kit'], drums: [0.3, 1],
    patterns: { drums: ['groove', 'four', 'halftime', 'groove'], bass: ['octave', 'octave', 'pulse'], arp: ['up', 'updown', 'down'], pad: ['sustain', 'swell'], melody: ['phrases', 'long', 'riff'] },
    fx: { wobble: 0.15 },
  },
  // drum and bass: breakbeats at 170 under a reese bass and airy pads, a soft lead floating over them
  // (liquid), or the beat in half time. calamity's cryogen and profaned guardians. as ambient it's the
  // same breaks slowed to a trip hop crawl
  breakbeat: {
    group: 'Beats', opens: ['drums', 'pad', 'bass'],
    build: 0.3, name: 'Breakbeat', colour: '#5ec4ff', style: 'tune',
    scales: { minor: 2.5, dorian: 2, lydian: 0.7, phrygian: 0.7 }, tempo: [80, 92], tuneTempo: [164, 176],
    meters: { '4/4': 1 },
    chords: ['i bVI', 'i - iv -', 'Imaj7 IVmaj7', 'i bVII bVI bVII', 'ii V Imaj7 -', 'i bIII bVII iv', 'vi IV I V'],
    methods: { bank: 4, vamp: 2, markov: 1 },
    richness: [0.4, 0.9], energy: 0.85, space: 0.7, bright: 0.55, dark: 0.4, edge: 0.9, surprise: 0,
    palette: {
      pad: ['air-pad', 'glass-pad', 'analog-pad', 'strings', 'vox-pad'], melody: ['soft-lead', 'sine-bell', 'e-piano', 'saw-lead', 'whistle'],
      counter: ['e-piano', 'pluck-lead', 'sine-bell'], keys: ['e-piano', 'felt-keys'], arp: ['pluck-lead', 'sine-bell', 'e-piano'], bells: ['sine-bell', 'glass-bell'],
      bass: ['reese', 'sub-bass', 'synth-bass', '808-bass'], drone: ['deep-drone', 'void'],
    },
    textures: ['rain', 'hum'], kits: ['machine', 'club-kit'], drums: [0.35, 1],
    patterns: { drums: ['break', 'break', 'halftime'], bass: ['held', 'synco', 'held'], pad: ['sustain', 'swell'], melody: ['long', 'phrases', 'fragments'] },
  },

  // ---------- easy: jazz, lounge, soul and showtime ----------
  // for shops, cafes, towns and anywhere a character's hanging about. they keep to themselves (surprise: 0)

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
      melody: ['flute', 'vibes', 'tenor-sax', 'nylon', 'mute-trumpet', 'soft-lead', 'alto-voice'], counter: ['vibes', 'flute', 'strings', 'clarinet'],
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
    patterns: { drums: ['halftime', 'groove', 'groove'], bass: ['synco', 'hook', 'held'], keys: ['block', 'comp', 'strum'], pad: ['sustain', 'swell', 'stabs'], counter: ['counterpoint', 'answer'] },
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
    patterns: { guitar: ['funk', 'funk'], drums: ['funk', 'four', 'funk'], bass: ['octave', 'hook', 'synco', 'octave'], pad: ['stabs', 'stabs', 'swell'], keys: ['block', 'skank'], counter: ['counterpoint', 'harmony', 'answer'], melody: ['phrases', 'riff', 'calls'] },
    fx: { drive: 0.1 },
    orchestra: { pass: 0.35, double: 0.2 },
  },
  // a game's shop (toby fox's hip shop in deltarune, and undertale's shops): a short loop to browse to.
  // the bass is the hook, a line of its own bouncing round the chords and walking into the next one,
  // with the tune talking to it in short calls and leaving it gaps. jazzy seventh chords on an
  // electric piano, a lazy swung beat, and not much else: four parts that each know their job
  shop: {
    group: 'Easy', opens: ['bass', 'drums', 'keys'],
    name: 'Shop', colour: '#e8a33d', style: 'loop',
    scales: { dorian: 3, mixolydian: 2, minor: 1, major: 1, minorPentatonic: 0.5 }, tempo: [70, 88], tuneTempo: [92, 116],
    meters: { '4/4': 1 },
    chords: ['i7 IV7', 'ii7 V7 Imaj7 vi7', 'i7 iv7 bVII7 bIIImaj7', 'Imaj7 IV7', 'i7 bVI7 bVII7 i7', 'IVmaj7 iii7 ii7 V7', 'i7 - IV7 -', 'vi7 ii7 V7 Imaj7'],
    methods: { bank: 6, vamp: 1.5 },
    chordBars: [1, 1, 2],
    richness: [0.55, 0.9], energy: 0.6, space: 0.35, bright: 0.6, dark: 0.15, edge: 0.75, swing: 0.75, swingAmount: [0.2, 0.42], surprise: 0, ornate: 1,
    palette: {
      melody: ['e-piano', 'vibes', 'mute-trumpet', 'soft-lead', 'pulse-lead', 'alto-sax', 'marimba', 'whistle'], counter: ['vibes', 'mute-trumpet', 'alto-sax', 'clavinet'],
      keys: ['e-piano', 'wurlitzer', 'clavinet', 'hammond', 'piano'], arp: ['marimba', 'vibes', 'pluck-lead'], bells: ['glock', 'vibes'],
      pad: ['hammond', 'strings', 'warm-pad'], bass: ['slap-bass', 'fretless', 'pluck-bass', 'upright', 'synth-bass'], drone: ['organ-drone'],
    },
    textures: ['vinyl'], kits: ['lofi-kit', 'funk-kit', 'boombap-kit'], drums: [0.5, 1],
    layers: { keys: 0.9, pad: 0.3, counter: 0.35, arp: 0.25, bells: 0.15, drone: 0, texture: 0.3 },
    patterns: { bass: ['hook', 'hook', 'synco'], drums: ['groove', 'halftime', 'boombap', 'funk'], keys: ['comp', 'block', 'skank'], melody: ['calls', 'riff', 'phrases'], counter: ['answer', 'counterpoint'], pad: ['stabs', 'sustain'] },
    orchestra: { pass: 0.2, double: 0.2 },
  },

  // ---------- roots: the blues and country ----------

  // the blues: twelve bars of three chords, each a bar long and each a dominant seventh, a shuffle
  // swinging in triplets, a boogie bass, and a harmonica or guitar bending its notes up from the
  // blue note (the minor third bent towards the major one is the sound of the blues)
  blues: {
    group: 'Easy', opens: ['bass', 'drums', 'keys'],
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
    group: 'Easy', opens: ['guitar', 'bass', 'drums'],
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
    build: 0.2, name: 'Far east', colour: '#d9534f', style: 'tune',
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
    orchestra: { pass: 0.35, double: 0.1 },
  },
  // india: a raga over a tanpura plucked round and round (cycle), a sitar or a bansuri gliding between
  // notes (meend) and graced on nearly every one, a santoor shimmering, and tabla playing a tala. no
  // chord changes at all, really: the drone is the harmony
  raga: {
    group: 'World', opens: ['drone', 'drums', 'keys'],
    build: 0.2, name: 'Raga', colour: '#ff9933', style: 'tune',
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


  // ---------- the ancient world, more of the world, pop and places ----------
  // they keep to themselves (surprise: 0), and their most local instruments, kits and scenery are own

  // the aztecs and the maya: clay flutes and ocarinas over slit drums (the teponaztli), the big hand
  // drum (huehuetl), rattles and a bone scraper. a death whistle screams far off and a conch calls.
  // pentatonic tunes over a drone, hardly any chords. and wizard101's azteca, the jungle adventure: a
  // marimba taking the tune, strings and a horn swelling under it, and a bass that moves
  aztec: {
    group: 'Ancient', opens: ['drums', 'drone', 'arp'],
    build: 0.25, name: 'Aztec', colour: '#c0603a', style: 'tune',
    scales: { minorPentatonic: 3, majorPentatonic: 1, phrygian: 1, dorian: 1 }, tempo: [60, 76], tuneTempo: [92, 120],
    meters: { '4/4': 6, '3/4': 1, '6/8': 1.5 },
    chords: ['i bVII', 'i - bVII -', 'i iv', 'i bVI bVII i', 'i - - bVII', 'i v'],
    methods: { bank: 4, vamp: 3 },
    richness: [0, 0.15], energy: 0.6, space: 0.6, bright: 0.5, dark: 0.45, surprise: 0, ornate: 1.1,
    palette: {
      melody: ['ocarina', 'pan-flute', 'marimba', 'blown-bottle', 'flute'], counter: ['pan-flute', 'ocarina', 'horn', 'marimba'],
      keys: ['marimba', 'xylophone', 'kalimba'], arp: ['marimba', 'xylophone', 'kalimba'], bells: ['chime', 'glass-bell', 'xylophone'],
      pad: ['choir-ah', 'strings', 'air-pad', 'dark-pad'], bass: ['sub-bass', 'round-bass', 'upright'], drone: ['deep-drone', 'void', 'cello-drone'],
    },
    textures: ['death-whistle', 'conch', 'rainstick', 'birds', 'wind'], kits: ['aztec-kit'], drums: [0.4, 0.95],
    patterns: { drums: ['tribal', 'tribal', 'march'], drone: ['tonic', 'fifths'], melody: ['phrases', 'calls', 'phrases'], bass: ['held', 'hook', 'pulse', 'rootfifth'], arp: ['up', 'updown', 'converge'] },
    orchestra: { pass: 0.45, double: 0.3 },
  },
  // drums round a fire: ghana's bobobo drums, stamping and clapping, a mbira or kalimba ringing a riff
  // over and over, a chant, and a didgeridoo's drone. one or two chords, riffs that go round, and
  // often in twelve (6/8)
  tribal: {
    group: 'Ancient', opens: ['drums', 'keys', 'drone'],
    build: 0.35, name: 'Tribal', colour: '#a0522d', style: 'tune',
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
    build: 0.25, name: 'Egyptian', colour: '#d4a53c', style: 'tune',
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
    orchestra: { pass: 0.35, double: 0.1 },
  },
  // greece and rome: a lyre and a harp, an aulos (the oboe) or pan pipes, horns for rome's legions, a
  // choir in a temple, a frame drum and finger cymbals, and the old modes (dorian, phrygian, mixolydian)
  antiquity: {
    group: 'Ancient', opens: ['keys', 'pad', 'drums'],
    build: 0.3, name: 'Antiquity', colour: '#b9a77a', style: 'tune',
    scales: { dorian: 3, phrygian: 1.5, mixolydian: 1.5, minor: 1, lydian: 0.5 }, tempo: [56, 72], tuneTempo: [88, 116],
    meters: { '4/4': 5, '3/4': 2, '6/8': 1, '5/4': 0.7 },
    chords: ['i bVII i -', 'i iv i bVII', 'I bVII I -', 'i bIII bVII i', 'I IV I V', 'i v i bVII'],
    methods: { bank: 5, vamp: 2, markov: 1 },
    richness: [0, 0.25], energy: 0.5, space: 0.7, bright: 0.6, dark: 0.3, surprise: 0, ornate: 1.1,
    palette: {
      melody: ['oboe', 'pan-flute', 'lyre', 'horn', 'flute', 'chant-voice'], counter: ['lyre', 'harp', 'pan-flute', 'oboe'],
      keys: ['lyre', 'harp', 'pizzicato'], arp: ['lyre', 'harp', 'pizzicato'], bells: ['glass-bell', 'chime', 'bell'],
      pad: ['choir-ah', 'choir-oo', 'strings', 'brass-section'], bass: ['upright', 'round-bass', 'bassoon'], drone: ['cello-drone', 'organ-drone'],
    },
    textures: ['wind', 'fire', 'stream', 'birds'], kits: ['darbuka-kit', 'orchestra-kit'], drums: [0.25, 0.9],
    patterns: { drums: ['march', 'tribal', 'halftime'], melody: ['phrases', 'long', 'phrases'], keys: ['strum', 'broken', 'waltz'], bass: ['rootfifth', 'held'] },
    orchestra: { pass: 0.4, double: 0.15 },
  },
  // castles and taverns: a bagpipe, a recorder or a shawm, a fiddle, a harpsichord or a lyre for the
  // lute, a chamber organ, a bassoon underneath, open fifths droning, and a tabor beating a dance in
  // six or three
  medieval: {
    group: 'Ancient', opens: ['drone', 'keys', 'drums'],
    build: 0.2, name: 'Medieval', colour: '#7d8c4a', style: 'tune',
    scales: { dorian: 3, mixolydian: 2, minor: 1.5, major: 1 }, tempo: [58, 74], tuneTempo: [96, 132],
    meters: { '6/8': 3, '3/4': 3, '4/4': 4 },
    chords: ['i bVII i -', 'I bVII IV I', 'i bVII bVI bVII', 'i iv v i', 'I IV I V', 'i bIII bVII i'],
    methods: { bank: 5, vamp: 2, markov: 1 },
    richness: [0, 0.15], energy: 0.6, space: 0.55, bright: 0.6, dark: 0.25, surprise: 0, ornate: 1.2,
    palette: {
      melody: ['bagpipe', 'whistle', 'shawm', 'violin', 'flute', 'chant-voice'], counter: ['whistle', 'violin', 'bowed-psaltery', 'oboe', 'tenor-recorder'],
      keys: ['harpsichord', 'lyre', 'harp', 'oud', 'zither'], arp: ['harpsichord', 'lyre', 'harp', 'oud', 'zither'], bells: ['chime', 'bell'],
      pad: ['organ', 'choir-ah', 'strings'], bass: ['bassoon', 'upright', 'round-bass'], drone: ['organ-drone', 'cello-drone'],
    },
    textures: ['fire', 'birds', 'leaves', 'owl'], kits: ['hand-drums', 'stomp-kit'], drums: [0.15, 0.9],
    patterns: { drums: ['march', 'groove', 'tribal'], drone: ['fifths', 'tonic'], keys: ['strum', 'waltz', 'broken'], bass: ['rootfifth', 'held'], melody: ['phrases', 'riff', 'phrases'] },
    orchestra: { pass: 0.4, double: 0.15 },
  },
  // the mongolian steppe: throat singing, often singing the tune itself (a sung line, gliding from note
  // to note: singLine() in synth.js) with the low kargyraa or cellos droning under it, or holding the home
  // note under a horse head fiddle (the erhu, its chinese cousin, stands in) or a flute. a plucked
  // zither (the koto stands in for the yatga), and a shaman's drum galloping. pentatonic, wide open,
  // hardly any chords
  steppe: {
    group: 'World', opens: ['drone', 'drums', 'keys'],
    build: 0.25, name: 'Steppe', colour: '#6f9fb8', style: 'tune',
    scales: { majorPentatonic: 3, minorPentatonic: 2, dorian: 1, mixolydian: 1 }, tempo: [56, 72], tuneTempo: [92, 124],
    meters: { '4/4': 4, '6/8': 3, '3/4': 1 },
    chords: ['I', 'I - IV -', 'i', 'I V', 'i bVII', 'I - V -', 'vi - I -'],
    methods: { bank: 3, vamp: 3 },
    richness: [0, 0.15], energy: 0.6, space: 0.75, bright: 0.55, dark: 0.3, surprise: 0, ornate: 1.2,
    palette: {
      melody: ['throat-singing', 'throat-singing', 'throat-singing', 'erhu', 'flute', 'shakuhachi'], counter: ['erhu', 'throat-singing', 'koto', 'flute'],
      keys: ['koto', 'harp', 'nylon', 'zither'], arp: ['koto', 'harp', 'nylon', 'zither'], bells: ['chime'],
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
    build: 0.25, name: 'Gamelan', colour: '#c9a227', style: 'tune',
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
    build: 0.2, name: 'Flamenco', colour: '#b3263a', style: 'tune',
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
    group: 'Beats', opens: ['keys', 'drums', 'bass'],
    build: 0.2, name: 'Pop', colour: '#ff7eb6', style: 'tune',
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
  // hip hop with no rapper, the beat tape (j dilla, nujabes, pete rock): a dusty kit swinging a boom
  // bap beat, a rhodes or a piano looping jazzy chords, an upright or an 808, strings and an orchestra
  // hit for stabs, vinyl crackle and a dj's scratches
  hiphop: {
    group: 'Beats', opens: ['drums', 'keys', 'bass'],
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
    group: 'Beats', opens: ['drums', 'bass', 'arp'],
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
    build: 0.15, name: 'Underwater', colour: '#2f8fb0', style: 'ambient',
    scales: { lydian: 2, major: 1.5, dorian: 1.5, majorPentatonic: 1 }, tempo: [50, 66], tuneTempo: [76, 96],
    meters: { '4/4': 4, '3/4': 2, '6/8': 1 },
    chords: ['Imaj7 IVmaj7', 'I II', 'ii7 Imaj7', 'i7 iv7', 'Imaj7 iii7 IVmaj7 -', 'vi7 IVmaj7 Imaj7 V'],
    richness: [0.5, 0.9], energy: 0.3, space: 0.9, bright: 0.45, dark: 0.2, surprise: 0, ornate: 0.6,
    palette: {
      melody: ['wine-glass', 'blown-bottle', 'vibes', 'sine-bell', 'celesta', 'flute', 'soprano'], counter: ['harp', 'vibes', 'soft-lead', 'celesta'],
      keys: ['harp', 'felt-keys', 'e-piano', 'vibes'], arp: ['harp', 'celesta', 'vibes', 'sine-bell', 'music-box'], bells: ['glass-bell', 'sine-bell', 'celesta'],
      pad: ['glass-pad', 'choir-oo', 'air-pad', 'shimmer', 'bowed-vibes'], bass: ['sub-bass', 'round-bass'], drone: ['void', 'deep-drone', 'tape-loop'],
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
    build: 0.25, name: 'Pirates', colour: '#3b5b8c', style: 'tune',
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
    orchestra: { pass: 0.4, double: 0.15 },
  },
  // outer space: analog pads and a string machine drifting, sine bells and plucked arps like distant
  // signals, the void humming underneath, and a drum machine far off. lydian and the whole tone scale
  space: {
    group: 'Places', opens: ['pad', 'arp', 'drone'],
    build: 0.3, name: 'Space', colour: '#3d2c8d', style: 'ambient',
    scales: { lydian: 3, wholeTone: 0.8, major: 1, dorian: 1, minor: 1 }, tempo: [52, 68], tuneTempo: [90, 116],
    meters: { '4/4': 5, '3/4': 1 },
    chords: ['I II', 'Imaj7 II', 'i bVI', 'I bVII', 'Imaj7 IVmaj7', 'i - bII -'],
    richness: [0.4, 0.9], energy: 0.4, space: 0.95, bright: 0.6, dark: 0.35, edge: 0.8, surprise: 0, ornate: 0.6,
    palette: {
      melody: ['soft-lead', 'sine-bell', 'wine-glass', 'synth-brass', 'moog-lead'], counter: ['soft-lead', 'sine-bell', 'pluck-lead'],
      keys: ['e-piano', 'pluck-lead', 'felt-keys'], arp: ['pluck-lead', 'sine-bell', 'e-piano', 'celesta'], bells: ['sine-bell', 'glass-bell', 'metal-ping'],
      pad: ['analog-pad', 'glass-pad', 'synth-strings', 'choir-oo', 'shimmer', 'bowed-vibes', 'vox-pad'], bass: ['sub-bass', 'synth-bass', 'reese'], drone: ['void', 'deep-drone', 'tape-loop'],
    },
    textures: ['hum'], kits: ['machine', 'club-kit'], drums: [0.15, 0.8],
    fx: { wobble: 0.1 },
    patterns: { drums: ['halftime', 'pulse', 'four'], arp: ['up', 'updown', 'random', 'converge'], melody: ['long', 'phrases', 'fragments'], pad: ['swell', 'sustain'] },
  },
  // daxter on the psp (jamey scott's score) and haven city: a city under the baron's iron fist. the
  // baron's palace is serious and brooding, but you'd still put it on: low strings and a bass hook, a
  // dark pizzicato or marimba riff, brass stabs and a choir, over a mid tempo beat that's half orchestra
  // and half machine. it loops, like the game's levels. its flavours are daxter's day job spraying bugs,
  // the city's factories and the baron's prison
  ironcity: {
    group: 'Places', opens: ['bass', 'drums', 'arp'],
    build: 0.3, name: 'Iron city', colour: '#6f6b8f', style: 'loop',
    scales: { minor: 2, dorian: 2, harmonicMinor: 1.5, phrygian: 0.7 }, tempo: [64, 80], tuneTempo: [92, 112],
    meters: { '4/4': 1 },
    chords: ['i bVI bVII i', 'i - iv -', 'i bII i bVII', 'i iv bVI V', 'i bVII bVI V', 'i - bVI bVII', 'i v bVI iv'],
    methods: { bank: 5, markov: 1, vamp: 2 },
    richness: [0.1, 0.45], energy: 0.65, space: 0.6, bright: 0.45, dark: 0.6, edge: 0.85, surprise: 0, ornate: 0.8,
    palette: {
      melody: ['horn', 'synth-brass', 'violin', 'trombone', 'clarinet', 'oboe'], counter: ['trombone', 'horn', 'pizzicato', 'bassoon', 'clarinet', 'cello'],
      keys: ['pizzicato', 'marimba', 'harpsichord', 'piano'], arp: ['pizzicato', 'marimba', 'pluck-lead', 'harpsichord'], bells: ['glock', 'metal-ping', 'bell'],
      pad: ['strings', 'choir-ah', 'brass-section', 'dark-pad', 'synth-strings', 'tremolo-strings'], bass: ['synth-bass', 'upright', 'tuba', 'round-bass', 'bassoon'], drone: ['deep-drone', 'cello-drone', 'organ-drone'],
    },
    textures: ['factory', 'steam', 'clanks', 'rain'], kits: ['machine', 'orchestra-kit', 'tight-kit', 'junk-kit'], drums: [0.35, 0.9],
    layers: { arp: 0.6, pad: 0.85 },
    patterns: { drums: ['groove', 'halftime', 'break', 'march'], bass: ['hook', 'synco', 'octave', 'pulse'], arp: ['up', 'updown', 'converge'], keys: ['broken', 'block'], pad: ['stabs', 'sustain', 'pulse'], melody: ['phrases', 'calls', 'riff'], counter: ['counterpoint', 'answer'] },
    orchestra: { pass: 0.45, double: 0.15 },
  },
};
// the rows of moods on the page, in order
const MOOD_GROUPS = ['Gentle', 'Bright', 'Magic', 'Easy', 'Dark', 'Beats', 'World', 'Ancient', 'Places', 'Loud'];

// moods a mood and modifiers already make (sludge is metal, slow and dark), or a newer mood does better
// (epic is dragon). a song saved in one opens as its replacement, keeping its own band, chords and
// sections (cleanSong)
const RETIRED = {
  dreamy: ['calm', ['dreamy']], deep: ['underwater', []], angry: ['tense', ['angry']], showdown: ['spirited', ['dark', 'fast']],
  sludge: ['metal', ['slow', 'dark']], nugaze: ['shoegaze', ['dark', 'slow']], altrock: ['grunge', ['bright']], disco: ['showtime', []], epic: ['dragon', []],
};

// ---------- flavours ----------
//
// most moods hold more than one kind of music (underwater is the dreamy deep and a calypso party on a
// reef), and each kind is a flavour of its mood rather than a mood of its own (see RETIRED for how the
// list grew too long before).
//   about     what the mood sounds like and what it's for, for the page
//   kinds     its flavours: { name, tip, style (the one it's made for, if not the mood's), and any mood
//             settings it changes }. palette, patterns and layers change a role at a time; anything else
//             replaces the mood's (flavourMood). the first kind is the plain mood: it changes nothing and
//             a song in it has no flavour key
//   phrasing  how a kind's tunes are written (every kind but the plain one has one):
//             shapes   the shapes its motifs take (CONTOURS, over CONTOUR_WEIGHTS)
//             rhythm   the kind of rhythm they're made of (RHYTHMS: dotted, even, long, syncopated...)
//             hook     how often its motif is a short hook played twice
//             pickup   how often a phrase leads in with a note or two
// a few say how busy every part is (busy) and how often they build (build). the random numbers don't
// depend on the flavour, but a new shape or rhythm takes them another way, so the same seed in another
// flavour is a new tune written that kind of music's way
const FLAVOURS = {
  calm: {
    about: 'Soft, unhurried and safe, like lying in long grass with nowhere to be: gentle pads, a felt piano or a flute, birdsong and running water. For menus, safe places and quiet wandering.',
    kinds: {
      meadow: { name: 'Meadow', tip: 'Meadow: a warm afternoon in the grass: soft pads, a felt piano or flute, a harp, birds and a stream' },
      lullaby: {
        name: 'Lullaby', tip: 'Lullaby: rocking gently in three: a music box or celesta, a harp underneath, crickets and an owl outside. No drums',
        phrasing: { shapes: { pendulum: 3, wave: 3, arch: 2, fall: 1 }, rhythm: 'even', hook: 0.2 }, busy: -0.1,
        scales: { majorPentatonic: 3, major: 2, lydian: 1 }, tempo: [50, 64], tuneTempo: [64, 82], meters: { '3/4': 3, '6/8': 2, '4/4': 1 },
        chords: ['I IV I V', 'I vi IV V', 'I - IV -', 'IV I V I', 'I iii IV I'],
        palette: { melody: ['music-box', 'celesta', 'flute', 'felt-keys'], keys: ['harp', 'felt-keys', 'celesta'], arp: ['harp', 'music-box', 'celesta'], bells: ['music-box', 'celesta', 'glass-bell'], counter: ['harp', 'felt-keys', 'flute'] },
        textures: ['crickets', 'owl', 'rain'], drums: [0, 0.1], energy: 0.2,
        patterns: { keys: ['waltz', 'broken'], arp: ['updown', 'up'], melody: ['phrases', 'long'] },
      },
      zen: {
        name: 'Zen garden', tip: 'Zen garden: raked stones and still water: a bamboo flute or koto in a five note scale, a singing bowl ringing, water over stones',
        phrasing: { shapes: { chant: 2, fall: 2, arch: 2, turn: 1 }, rhythm: 'long', hook: 0, pickup: 0 }, busy: -0.15,
        scales: { majorPentatonic: 3, lydian: 1, major: 0.5 }, ornate: 1,
        palette: { melody: ['shakuhachi', 'flute', 'koto', 'felt-keys'], keys: ['koto', 'harp', 'felt-keys'], arp: ['koto', 'harp'], counter: ['koto', 'harp', 'shakuhachi'], bells: ['chime', 'glass-bell', 'sine-bell'], drone: ['cello-drone', 'organ-drone', 'tape-loop'] },
        textures: ['singing-bowl', 'stream', 'chimes', 'birds'], kits: ['temple'], drums: [0.05, 0.2],
        patterns: { drums: ['sparse', 'pulse'], melody: ['long', 'fragments', 'phrases'], drone: ['tonic', 'fifths'] },
      },
    },
  },
  heavenly: {
    about: 'Weightless and bright, high above everything: a choir, an organ, harps and bells ringing out in a vast room, and no drums. For shrines, heaven and endings.',
    kinds: {
      clouds: { name: 'Clouds', tip: 'Clouds: drifting above them: a choir and an organ, harps and bells, wide and slow' },
      cathedral: {
        name: 'Cathedral', tip: 'Cathedral: light through stained glass: a hymn on the organ and a choir, a horn or violin singing over it, the bells tolling',
        phrasing: { shapes: { chant: 2, climb: 2, arch: 2, triad: 1 }, rhythm: 'long', hook: 0 },
        scales: { major: 3, mixolydian: 1 }, chords: ['I IV I V', 'I IV I -', 'I vi IV I', 'IV I', 'I iii IV I', 'I V vi iii IV I IV V', 'I IV V I'],
        methods: { bank: 6, markov: 1 }, richness: [0, 0.3], edge: 0.75,
        palette: { melody: ['choir-oo', 'violin', 'horn', 'flute'], pad: ['organ', 'choir-ah', 'strings'], keys: ['organ', 'harp'], counter: ['violin', 'choir-oo', 'horn'], bells: ['bell', 'chime', 'glass-bell'], drone: ['organ-drone'] },
        textures: ['wind'], patterns: { melody: ['long', 'phrases'], pad: ['sustain', 'swell'], keys: ['block', 'broken'] },
      },
      ascent: {
        name: 'Ascension', tip: 'Ascension: rising towards the light: shimmering pads, arps climbing, glass bells and wine glasses',
        phrasing: { shapes: { climb: 4, triad: 2, arch: 1 }, rhythm: 'even', hook: 0.25 },
        scales: { lydian: 3, major: 1 }, energy: 0.3,
        palette: { melody: ['glass-bell', 'choir-oo', 'wine-glass', 'soft-lead'], pad: ['shimmer', 'air-pad', 'glass-pad', 'choir-ah'], arp: ['celesta', 'harp', 'glass-bell'] },
        layers: { arp: 0.6 }, patterns: { arp: ['up', 'up', 'updown'], pad: ['swell', 'sustain'] },
      },
    },
  },
  happy: {
    about: 'Sunny and carefree, like the first warm morning of the year: a flute or clarinet over a strummed guitar, a bouncing bass and a light kit. For farms, villages and good days.',
    kinds: {
      spring: { name: 'Spring', tip: 'Spring: fields, chores and sunshine: a flute, clarinet or accordion over a guitar, soft strings and a bass bouncing between two notes' },
      island: {
        name: 'Island life', tip: 'Island life: a lazy day on a little island: a bouncy electric piano or vibes on jazzy chords, a slap or fretless bass, a light swung beat',
        phrasing: { shapes: { repeat: 2, call: 2, zigzag: 1, arch: 1 }, rhythm: 'syncopated', hook: 0.6 },
        chords: ['Imaj7 vi7 ii7 V7', 'IVmaj7 iii7 ii7 Imaj7', 'I vi ii V', 'Imaj7 IVmaj7', 'IVmaj7 V7 iii7 vi7', 'ii7 V7 Imaj7 -'], richness: [0.5, 0.9], swing: 0.45,
        palette: { melody: ['vibes', 'e-piano', 'whistle', 'marimba', 'flute'], keys: ['e-piano', 'wurlitzer', 'piano', 'nylon'], bass: ['fretless', 'slap-bass', 'upright', 'pluck-bass'], counter: ['marimba', 'vibes', 'clarinet'] },
        kits: ['tight-kit', 'soft-kit'], patterns: { drums: ['groove', 'halftime'], bass: ['synco', 'rootfifth', 'hook'], keys: ['block', 'comp', 'strum'] },
      },
      festival: {
        name: 'Festival', tip: 'Festival: the whole village out for the fair: a brass band, an accordion, a glockenspiel and a marching snare, the tune passed round',
        phrasing: { shapes: { triad: 3, repeat: 2, leap: 2, climb: 1 }, rhythm: 'dotted', hook: 0.6 },
        energy: 0.75, edge: 0.8, meters: { '4/4': 5, '6/8': 2, '3/4': 1 },
        palette: { melody: ['trumpet', 'accordion', 'clarinet', 'flute', 'whistle'], counter: ['trombone', 'clarinet', 'horn'], keys: ['piano', 'honky-tonk'], bass: ['tuba', 'upright'], bells: ['glock', 'xylophone'], pad: ['brass-section', 'organ', 'strings'] },
        kits: ['orchestra-kit', 'tight-kit'], patterns: { drums: ['march', 'groove'], bass: ['rootfifth', 'octave'], keys: ['waltz', 'block'] },
        orchestra: { pass: 0.5, double: 0.5 },
      },
    },
  },
  playful: {
    about: 'Mischievous and bouncy, a cartoon tiptoeing about with a grin: pizzicato, marimba, clarinet and a music box hopping over an oom-pah bass. For puzzles, silly characters and mischief.',
    kinds: {
      romp: { name: 'Romp', tip: 'Romp: pizzicato, marimba and clarinet hopping over oom-pah keys and a walking bass' },
      tiptoe: {
        name: 'Tiptoe', tip: 'Tiptoe: sneaking about: pizzicato and a bassoon creeping in a minor key, a xylophone poking its head out, a sly walking bass',
        phrasing: { shapes: { turn: 2, dive: 2, repeat: 2, zigzag: 1 }, rhythm: 'snap', hook: 0.5 },
        scales: { minor: 2, dorian: 2, harmonicMinor: 1 }, chords: ['i iv V i', 'i bVI V -', 'i - iv V', 'i iv i V', 'i bVII bVI V'],
        energy: 0.55, dark: 0.35, edge: 0.6,
        palette: { melody: ['pizzicato', 'bassoon', 'clarinet', 'xylophone', 'oboe'], counter: ['bassoon', 'pizzicato', 'clarinet'], keys: ['pizzicato', 'harpsichord', 'xylophone'], bass: ['upright', 'bassoon', 'tuba'] },
        kits: ['clockwork', 'orchestra-kit'], patterns: { bass: ['walking', 'rootfifth'], drums: ['march', 'sparse'], keys: ['broken', 'block'], melody: ['calls', 'phrases'] },
      },
      circus: {
        name: 'Big top', tip: 'Big top: a circus march: an accordion or trumpet, a tuba oom-pah, a glockenspiel and a snare, round and round',
        phrasing: { shapes: { zigzag: 2, triad: 2, repeat: 2, climb: 1 }, rhythm: 'running', hook: 0.7 }, busy: 0.1,
        scales: { major: 3, mixolydian: 1, harmonicMinor: 0.5 }, tuneTempo: [120, 150], meters: { '4/4': 3, '3/4': 3, '6/8': 2 },
        chords: ['I I7 IV iv', 'I vi ii V', 'I II7 V7 I', 'I IV I V', 'I bVI V I'], energy: 0.8, edge: 0.75,
        palette: { melody: ['accordion', 'trumpet', 'clarinet', 'xylophone'], keys: ['honky-tonk', 'xylophone', 'piano'], pad: ['organ', 'brass-section'], bass: ['tuba', 'bassoon'], bells: ['glock', 'xylophone'] },
        kits: ['orchestra-kit', 'tight-kit'], patterns: { drums: ['march'], keys: ['waltz'], bass: ['rootfifth', 'octave'] },
      },
    },
  },
  spirited: {
    about: "Bright and full of heart, like setting off with friends on an adventure: a chirpy 8 bit lead, a bouncing bass and a tune you'll be humming for days. For adventures, towns and friendly fights.",
    kinds: {
      adventure: { name: 'Adventure', tip: 'Adventure: off down the road: chiptune leads, a bouncing bass and a light kit, with the odd jazzy, surprising chord' },
      home: {
        name: 'Keepsake', tip: 'Keepsake: coming back to the house you grew up in, warm and a little sad: a music box or piano tune, slow and tender',
        phrasing: { shapes: { arch: 3, sigh: 2, fall: 2, pendulum: 1 }, rhythm: 'even', hook: 0.2 },
        tuneTempo: [70, 92], energy: 0.45, drums: [0.05, 0.35], kits: ['soft-kit'], ornate: 0.6,
        chords: ['I V vi iii IV I IV V', 'IV V iii vi', 'I vi IV V', 'vi IV I V', 'IVmaj7 V7 iii vi'],
        palette: { melody: ['piano', 'music-box', 'felt-keys', 'celesta'], keys: ['piano', 'felt-keys', 'harp'], counter: ['felt-keys', 'harp', 'celesta'], arp: ['harp', 'music-box', 'celesta'], bass: ['round-bass', 'upright', 'sub-bass'] },
        patterns: { drums: ['halftime', 'pulse'], bass: ['held', 'rootfifth'], melody: ['phrases', 'long'] },
      },
      ruins: {
        name: 'Old caverns', tip: 'Old caverns: the first quiet steps underground: a slower minor tune on a chip lead or kalimba, a harp picking, water dripping',
        phrasing: { shapes: { pendulum: 2, turn: 2, fall: 2, sigh: 1 }, rhythm: 'even', hook: 0.35 },
        scales: { dorian: 2, minor: 2, harmonicMinor: 1 }, tuneTempo: [96, 120], energy: 0.55, dark: 0.35,
        chords: ['i bVI bVII i', 'i iv bVI V', 'i bVII bVI bVII', 'i - bVI -', 'i bIII bVII iv'],
        palette: { melody: ['pulse-lead', 'square-lead', 'kalimba', 'flute'], arp: ['harp', 'kalimba', 'pulse-lead'] },
        textures: ['drips'], patterns: { drums: ['groove', 'halftime', 'march'], bass: ['rootfifth', 'held', 'octave'] },
      },
    },
  },
  upbeat: {
    about: 'Bright, fast and driving, the wind in your face: a saw or square lead over an octave bass and a punchy kit. For racing, action and title screens.',
    kinds: {
      speed: { name: 'Full speed', tip: 'Full speed: saw and square leads over an octave bass and a punchy kit' },
      dance: {
        name: 'Dance floor', tip: 'Dance floor: house music: four on the floor, a piano stabbing chords, a pumping pad and an octave bass',
        phrasing: { shapes: { repeat: 3, call: 2, pendulum: 1 }, rhythm: 'syncopated', hook: 0.8 },
        tuneTempo: [120, 128], kits: ['club-kit', 'tight-kit'],
        palette: { keys: ['piano', 'e-piano'], melody: ['saw-lead', 'synth-brass', 'pluck-lead', 'soft-lead'] },
        layers: { keys: 0.85 }, patterns: { drums: ['four', 'four'], keys: ['block'], pad: ['pump', 'sustain'], bass: ['octave', 'synco'] },
      },
      citypop: {
        name: 'City pop', tip: 'City pop: a drive along the coast at sunset, years ago: a slap bass, an electric piano on lush sevenths, synth brass and a glossy beat',
        phrasing: { shapes: { arch: 2, call: 2, zigzag: 1, leap: 1 }, rhythm: 'syncopated', hook: 0.5, pickup: 0.7 },
        chords: ['IVmaj7 V7 iii7 vi7', 'IVmaj7 III7 vi7 -', 'ii7 V7 Imaj7 vi7', 'Imaj7 vi7 ii7 V7', 'IVmaj7 V iii vi'], richness: [0.6, 0.95],
        tuneTempo: [104, 124], scales: { major: 3, dorian: 1, mixolydian: 1 },
        palette: { melody: ['synth-brass', 'soft-lead', 'alto-sax', 'e-piano', 'pluck-lead'], keys: ['e-piano', 'wurlitzer', 'piano'], bass: ['slap-bass', 'synth-bass', 'fretless'], pad: ['strings', 'synth-strings', 'brass-section', 'warm-pad'] },
        kits: ['tight-kit', 'funk-kit', 'machine'], patterns: { bass: ['synco', 'octave', 'hook'], drums: ['groove', 'four'], keys: ['block', 'comp'] },
      },
    },
  },
  cozy: {
    about: 'Warm and snug: an electric piano or felt keys on jazzy chords, a walking bass, brushes and a crackling fire. For inns, homes and rainy evenings.',
    kinds: {
      fireside: { name: 'Fireside', tip: 'Fireside: an electric piano on jazzy chords, a walking bass, brushes and the fire' },
      teashop: {
        name: 'Tea shop', tip: 'Tea shop: lighter and sunnier: a nylon guitar or vibes, a flute, a gentle bossa nova',
        phrasing: { shapes: { wave: 2, arch: 2, turn: 1, call: 1 }, rhythm: 'syncopated', hook: 0.3 },
        bright: 0.55, palette: { melody: ['flute', 'vibes', 'nylon', 'clarinet'], keys: ['nylon', 'piano', 'e-piano'] },
        textures: ['rain', 'vinyl', 'birds'], patterns: { drums: ['bossa', 'brush'], keys: ['bossa', 'strum'], bass: ['rootfifth', 'walking'] },
      },
      rainy: {
        name: 'Rainy day', tip: 'Rainy day: a piano on its own or with a clarinet, slow, rain on the window and vinyl crackle',
        phrasing: { shapes: { sigh: 2, fall: 2, arch: 1 }, rhythm: 'long', hook: 0.1 },
        energy: 0.3, tuneTempo: [64, 82], drums: [0, 0.2],
        palette: { melody: ['piano', 'clarinet', 'felt-keys'], keys: ['piano', 'felt-keys'] }, textures: ['rain', 'vinyl'],
        layers: { texture: 0.7 }, patterns: { melody: ['phrases', 'long'], bass: ['held', 'walking'] },
      },
    },
  },
  wistful: {
    about: 'Bittersweet and nostalgic: a music box, piano or nylon guitar over warm strings, worn like an old tape. For memories, goodbyes and rainy windows.',
    kinds: {
      memories: { name: 'Memories', tip: 'Memories: a music box, felt piano and strings, worn like an old tape' },
      autumn: {
        name: 'Autumn', tip: 'Autumn: a nylon guitar and a violin or clarinet in three, a cello underneath, leaves and rain',
        phrasing: { shapes: { sigh: 3, wave: 2, fall: 1 }, rhythm: 'dotted', hook: 0.2 },
        scales: { dorian: 2, mixolydian: 1, minor: 1 }, meters: { '3/4': 3, '4/4': 2, '6/8': 1 },
        palette: { melody: ['nylon', 'violin', 'clarinet', 'piano', 'flute'], keys: ['nylon', 'harp', 'piano'], arp: ['nylon', 'harp'], pad: ['strings', 'warm-pad', 'choir-oo'], drone: ['cello-drone'] },
        textures: ['leaves', 'rain', 'fire'], patterns: { keys: ['waltz', 'broken'] },
      },
      countryside: {
        name: 'Countryside', tip: "Countryside: a summer in the country you'll remember all your life: a piano tune, strings swelling under it, a flute answering, chords that rise and ache",
        phrasing: { shapes: { leap: 3, arch: 2, climb: 1, sigh: 1 }, rhythm: 'long', hook: 0.15, pickup: 0.6 }, build: 0.35,
        style: 'tune', tuneTempo: [80, 100], chords: ['IVmaj7 V iii vi', 'IV V iii vi', 'I V vi iii IV I IV V', 'vi IV V I', 'IV V I vi'],
        palette: { melody: ['piano', 'flute', 'violin', 'oboe'], counter: ['flute', 'violin', 'clarinet', 'oboe'], keys: ['piano', 'harp'], pad: ['strings', 'choir-oo'], arp: ['harp', 'piano'], bells: ['glock', 'celesta'] },
        textures: ['birds', 'leaves', 'stream'], kits: ['brushes', 'soft-kit'], drums: [0.05, 0.3],
        orchestra: { pass: 0.5, double: 0.3 },
      },
    },
  },
  nostalgic: {
    about: 'Not happy and not sad, somewhere in between: the feeling of an old world you used to spend whole summers in. A felt piano with room round it, a warm pad and a sub bass, worn like an old tape. For wandering, building and remembering.',
    kinds: {
      alpha: { name: 'First days', tip: 'First days: a few soft piano notes and a lot of quiet: a felt piano or Rhodes, a warm pad and a sub bass, gently bittersweet' },
      warmth: {
        name: 'Embers', tip: "Embers: deep underground where it's hot and lonely: nothing but the fire crackling and lava bubbling at first, then a sad synth and strings swell in, slow and reflective",
        phrasing: { shapes: { sigh: 2, chant: 2, fall: 2 }, rhythm: 'long', hook: 0 },
        scales: { dorian: 2, minor: 2, mixolydian: 1 }, tempo: [50, 64], tuneTempo: [64, 80], meters: { '4/4': 4, '3/4': 1 },
        chords: ['i bVI', 'i - bVI -', 'i bVII bVI bVII', 'iv i', 'i bIII bVII iv', 'bVI bVII i -'], energy: 0.25, dark: 0.35, prelude: 'Embers',
        palette: { melody: ['soft-lead', 'violin', 'felt-keys', 'piano', 'e-piano'], pad: ['dark-pad', 'analog-pad', 'strings', 'warm-pad', 'choir-oo'], drone: ['deep-drone', 'tape-loop', 'cello-drone'], keys: ['e-piano', 'felt-keys', 'piano'], bells: ['sine-bell', 'glass-bell'] },
        textures: ['lava', 'fire', 'rumble'], kits: [], drums: [0, 0], layers: { texture: 1, melody: 0.8 },
        patterns: { pad: ['swell', 'swell', 'sustain'], melody: ['long', 'fragments'], drone: ['tonic', 'fifths'] },
      },
      creative: {
        name: 'Tinkering', tip: 'Tinkering: building something just for the fun of it: a bouncy piano tune, plucky synths and a light drum machine',
        phrasing: { shapes: { repeat: 2, zigzag: 2, call: 2, leap: 1 }, rhythm: 'snap', hook: 0.6 },
        style: 'tune', scales: { major: 3, lydian: 1, mixolydian: 1, majorPentatonic: 1 }, tuneTempo: [96, 124], energy: 0.6, bright: 0.6, dark: 0.05, edge: 0.8,
        palette: { melody: ['piano', 'pluck-lead', 'e-piano', 'soft-lead', 'music-box', 'marimba'], keys: ['piano', 'e-piano', 'felt-keys'], arp: ['pluck-lead', 'e-piano', 'kalimba', 'felt-keys'], counter: ['e-piano', 'pluck-lead', 'felt-keys'], bass: ['round-bass', 'synth-bass', 'sub-bass', 'pluck-bass'] },
        textures: ['birds', 'stream'], kits: ['machine', 'lofi-kit', 'soft-kit'], drums: [0.2, 0.8], layers: { arp: 0.55 },
        patterns: { drums: ['groove', 'halftime', 'groove'], bass: ['rootfifth', 'octave', 'synco'], keys: ['broken', 'block'], melody: ['phrases', 'calls', 'phrases'], arp: ['updown', 'up'] },
      },
      dreiton: {
        name: 'Slow build', tip: 'Slow build: a long climb from dark to blazing: a deep analog pad, then arps, then a drum machine and a wailing synth lead, then it all falls away',
        phrasing: { shapes: { climb: 3, leap: 2, chant: 1 }, rhythm: 'long', hook: 0.3 }, build: 0,
        style: 'tune', scales: { minor: 2, dorian: 2, phrygian: 0.5 }, tuneTempo: [100, 126], energy: 0.7, bright: 0.5, dark: 0.45, edge: 1,
        chords: ['i bVI bIII bVII', 'i - bVI -', 'i bVII bVI bVII', 'i v bVI iv', 'bVI bVII i -'],
        palette: { melody: ['saw-lead', 'soft-lead', 'synth-brass', 'pluck-lead'], arp: ['pluck-lead', 'sine-bell', 'e-piano', 'soft-lead'], pad: ['analog-pad', 'dark-pad', 'synth-strings', 'glass-pad'], bass: ['synth-bass', 'reese', 'sub-bass'], keys: ['e-piano', 'felt-keys'], bells: ['sine-bell', 'glass-bell'], counter: ['pluck-lead', 'soft-lead', 'synth-brass'] },
        textures: ['rumble'], kits: ['machine', 'club-kit'], drums: [0.4, 0.95], layers: { arp: 0.8, pad: 0.9 },
        patterns: { drums: ['break', 'halftime', 'groove'], arp: ['up', 'updown', 'converge'], bass: ['octave', 'pulse', 'held'], pad: ['sustain', 'swell', 'pulse'], melody: ['long', 'phrases'] },
        // the dark start, the arps, the build, the beat, and falling away to nothing at the end
        forms: [
          [['Dark', 'C', 8, 0.3], ['Arps', 'A', 8, 0.55], ['Build', 'A', 8, 0.75], ['Drive', 'B', 8, 0.95], ['Peak', 'B', 8, 1], ['Fall', 'C', 8, 0.4], ['Drive', 'B', 8, 0.95], ['Away', 'A', 8, 0.3]],
          [['Dark', 'A', 8, 0.3], ['Arps', 'A', 16, 0.6], ['Drive', 'B', 16, 0.95], ['Fall', 'C', 8, 0.45], ['Peak', 'B', 16, 1], ['Away', 'C', 8, 0.3]],
        ],
      },
      // subwoofer lullaby, mice on venus and living mice: a rhodes rocking between two chords over a deep
      // moog bass, a piano tune drifting over it, the odd soft tick of a drum machine
      lullaby: {
        name: 'Lullaby', tip: 'Lullaby: a warm electric piano rocking between two chords over a deep round bass, a soft piano tune drifting over it, like falling asleep in a quiet room',
        phrasing: { shapes: { pendulum: 3, arch: 2, fall: 1 }, rhythm: 'even', hook: 0.2 }, build: 0,
        scales: { major: 3, lydian: 2, mixolydian: 1 }, tempo: [54, 68], tuneTempo: [66, 84], meters: { '4/4': 4, '3/4': 2 },
        chords: ['Imaj7 IVmaj7', 'I - IV -', 'Imaj7 iii7', 'IV I', 'I vi IV -', 'IVmaj7 Imaj7 iii7 vi'],
        palette: { melody: ['piano', 'felt-keys', 'humming', 'music-box'], keys: ['e-piano', 'wurlitzer', 'felt-keys'], pad: ['vox-pad', 'warm-pad', 'bowed-vibes'], bass: ['moog-bass', 'sub-bass'], bells: ['sine-bell', 'glass-bell'] },
        kits: ['machine', 'soft-kit'], drums: [0.15, 0.4], layers: { keys: 0.95, bass: 0.9 },
        patterns: { keys: ['block', 'broken', 'block'], melody: ['fragments', 'phrases', 'long'], bass: ['held', 'held', 'rootfifth'], drums: ['sparse', 'pulse'] },
      },
      // wet hands, dry hands and clark: a piano on its own, rolling up and down its chords with the pedal
      // down, a simple tune on top, and the room
      rolling: {
        name: 'Rolling keys', tip: 'Rolling keys: a piano rolling gently up and down its chords, a simple tune on top, and nothing else but the room it was played in',
        phrasing: { shapes: { wave: 3, arch: 2, climb: 1 }, rhythm: 'even', hook: 0.3 }, build: 0,
        scales: { major: 3, lydian: 1, mixolydian: 1, dorian: 0.5 }, tempo: [62, 80], tuneTempo: [72, 92],
        palette: { melody: ['piano', 'felt-keys'], arp: ['piano', 'felt-keys'], keys: ['felt-keys', 'piano'], pad: ['strings', 'warm-pad', 'bowed-vibes'], bass: ['sub-bass', 'round-bass'] },
        kits: [], drums: [0, 0], layers: { arp: 0.95, keys: 0.3, pad: 0.4, bass: 0.5, texture: 0.3 },
        patterns: { arp: ['updown', 'up', 'updown'], melody: ['phrases', 'fragments', 'long'], pad: ['swell', 'sustain'] },
      },
      // the second album's synth side, moog city 2, biome fest and haggstrom: a round moog lead sliding
      // between notes over bubbling arps and a gentle drum machine, curious and cheerful
      moogcity: {
        name: 'Circuits', tip: 'Circuits: a round, buttery synth lead sliding between its notes over bubbling arps and a gentle drum machine, cheerful and curious',
        phrasing: { shapes: { zigzag: 2, arch: 2, climb: 2, turn: 1 }, rhythm: 'dotted', hook: 0.4 },
        style: 'tune', scales: { major: 2, mixolydian: 2, lydian: 1, dorian: 1 }, tuneTempo: [92, 118], energy: 0.6, bright: 0.55, edge: 0.8,
        palette: { melody: ['moog-lead', 'soft-lead', 'pluck-lead'], arp: ['pluck-lead', 'sine-bell', 'e-piano', 'kalimba'], counter: ['soft-lead', 'pluck-lead', 'e-piano'], pad: ['analog-pad', 'vox-pad', 'warm-pad'], bass: ['moog-bass', 'synth-bass', 'sub-bass'], keys: ['e-piano', 'piano'] },
        kits: ['machine', 'lofi-kit'], drums: [0.3, 0.85], layers: { arp: 0.8 },
        patterns: { drums: ['groove', 'halftime'], arp: ['up', 'updown', 'random'], bass: ['octave', 'synco', 'rootfifth'], melody: ['phrases', 'long', 'calls'] },
      },
    },
  },
  sad: {
    about: 'Sorrowful and slow: strings, a felt piano or a violin in a minor key, rain on the glass. For losses, rain and the end of things.',
    kinds: {
      sorrow: { name: 'Sorrow', tip: 'Sorrow: strings, a felt piano or violin in a minor key, and rain' },
      requiem: {
        name: 'Requiem', tip: 'Requiem: a slow string orchestra and a choir mourning together, the tune passed from violin to oboe',
        phrasing: { shapes: { sigh: 3, fall: 2, chant: 1 }, rhythm: 'long', hook: 0 }, build: 0.4,
        chords: ['i iv bVI V', 'i bVI iv V', 'i v bVI iv', 'i bVII bVI V', 'iv i V i'], richness: [0.2, 0.5], kits: [],
        palette: { melody: ['violin', 'choir-oo', 'oboe', 'horn'], pad: ['strings', 'choir-ah', 'choir-oo', 'organ'], counter: ['violin', 'oboe', 'horn'], drone: ['cello-drone', 'organ-drone'] },
        textures: ['wind'], orchestra: { pass: 0.45, double: 0 }, patterns: { melody: ['long', 'phrases'], pad: ['sustain', 'swell'] },
      },
      alone: {
        name: 'Alone', tip: 'Alone: one piano in an empty room, slow, with long silences',
        phrasing: { shapes: { fall: 2, sigh: 2, pendulum: 1 }, rhythm: 'long', hook: 0 }, build: 0, busy: -0.15,
        palette: { melody: ['piano', 'felt-keys'], keys: ['felt-keys', 'piano'] }, kits: [],
        layers: { pad: 0.3, drone: 0.1, bells: 0.1, counter: 0.1, arp: 0.1, keys: 0.9, bass: 0.15, texture: 0.6 },
        patterns: { melody: ['fragments', 'phrases', 'long'], keys: ['broken', 'strum'] },
      },
    },
  },
  tragic: {
    about: 'Sad and dramatic at once, the end of a world told by a single piano: strings and a choir swell in under it, build to the whole orchestra, then fall away. For title screens, losses and the moments before the end.',
    kinds: {
      cruel: { name: 'Lament', tip: 'Lament: a lone piano, then strings and a choir swelling in, building to the whole orchestra and timpani, then falling back' },
      sulphur: {
        name: 'Poisoned sea', tip: 'Poisoned sea: a still, sickly sea under a green sky: a clean guitar ringing through long echoes, slow and serene, strings swelling, a half time beat, waves and rain',
        phrasing: { shapes: { chant: 2, arch: 2, fall: 1 }, rhythm: 'long', hook: 0.2 },
        tuneTempo: [66, 86], energy: 0.5, dark: 0.5, edge: 0.75,
        palette: { guitar: ['clean-guitar', 'chorus-guitar', 'crunch-guitar'], melody: ['chorus-guitar', 'violin', 'piano', 'felt-keys'], pad: ['strings', 'dark-pad', 'choir-oo'] },
        kits: ['rock-kit', 'machine'], textures: ['ocean', 'rain', 'wind'], layers: { guitar: 0.85, keys: 0.5 }, fx: { echo: 0.15 },
        patterns: { guitar: ['ring', 'tremolo', 'strum'], drums: ['halftime', 'rock', 'halftime'], melody: ['long', 'phrases'] },
      },
      musicbox: {
        name: 'Music box', tip: 'Music box: the theme wound up on an old music box or celesta, slow, alone in an empty room, a cello droning under it',
        phrasing: { shapes: { pendulum: 2, arch: 2, sigh: 2 }, rhythm: 'even', hook: 0.3 }, build: 0,
        style: 'ambient', tempo: [50, 64],
        palette: { melody: ['music-box', 'celesta', 'piano'], keys: ['music-box', 'celesta', 'harp'], arp: ['music-box', 'celesta'], drone: ['cello-drone'] },
        kits: [], drums: [0, 0], layers: { melody: 1, pad: 0.5, keys: 0.6, counter: 0.15, bells: 0.15, bass: 0.1 }, patterns: { melody: ['phrases', 'long'] },
      },
      laststand: {
        name: 'Last stand', tip: 'Last stand: everything on the line: the tune on the horns over a choir and strings, taiko pounding',
        phrasing: { shapes: { triad: 3, leap: 2, climb: 2 }, rhythm: 'dotted', hook: 0.5 },
        style: 'boss', palette: { melody: ['horn', 'violin', 'choir-oo', 'trumpet'], pad: ['choir-ah', 'strings', 'brass-section'] }, edge: 0.85, kits: ['taiko', 'orchestra-kit'],
      },
    },
  },
  bleak: {
    about: 'Serious more than sad: a slow wall of fuzz, a lone chanted line and a cheap drum machine echoing round a huge empty hall, worn and washed out. For grey skies, long walks and heavy thoughts.',
    kinds: {
      wall: { name: 'Fuzz wall', tip: 'Fuzz wall: a slow wall of fuzz, a chanted line and a drum machine in a huge room' },
      postrock: {
        name: 'Post-rock', tip: 'Post-rock: a storm rolling slowly in over the hills: a clean guitar ringing and tremolo picking, building to a crash of drums',
        phrasing: { shapes: { chant: 2, climb: 2, wave: 2 }, rhythm: 'long', hook: 0.4 }, build: 0.6,
        energy: 0.55, edge: 0.75,
        palette: { guitar: ['clean-guitar', 'chorus-guitar', 'fuzz-guitar'], melody: ['chorus-guitar', 'violin', 'felt-keys', 'whistle'] },
        kits: ['rock-kit', 'machine'], layers: { guitar: 0.85 },
        patterns: { guitar: ['ring', 'tremolo', 'strum'], drums: ['halftime', 'rock', 'groove'], melody: ['long', 'phrases'] },
      },
      hymn: {
        name: 'Hymn', tip: 'Hymn: a church organ, a chanted choir and a tolling bell, slower still',
        phrasing: { shapes: { chant: 3, arch: 1, fall: 1 }, rhythm: 'long', hook: 0, pickup: 0 }, busy: -0.15,
        tempo: [44, 58], tuneTempo: [60, 78], edge: 0.75,
        palette: { pad: ['organ', 'choir-ah', 'choir-oo'], melody: ['choir-oo', 'violin', 'felt-keys'], bells: ['bell', 'sine-bell'], drone: ['organ-drone', 'deep-drone'] },
        drums: [0.2, 0.45], patterns: { drums: ['halftime', 'pulse'], melody: ['long', 'phrases'] },
      },
    },
  },
  mysterious: {
    about: 'Something hidden: kalimbas and glass bells over drones, in strange old modes, with drips and owls. For caves, ruins and secrets.',
    kinds: {
      secrets: { name: 'Secrets', tip: 'Secrets: kalimbas and glass bells over drones, drips and owls' },
      temple: {
        name: 'Lost temple', tip: 'Lost temple: ruins swallowed by the jungle: pan pipes, ocarina and marimba over hand drums, in an old five note scale',
        phrasing: { shapes: { call: 2, turn: 2, dive: 1, pendulum: 1 }, rhythm: 'dotted', hook: 0.4 },
        scales: { hirajoshi: 2, dorian: 1, phrygian: 1, minorPentatonic: 1 },
        palette: { melody: ['pan-flute', 'ocarina', 'marimba', 'kalimba'], arp: ['marimba', 'kalimba'], keys: ['marimba', 'kalimba', 'harp'] },
        kits: ['hand-drums', 'taiko'], textures: ['drips', 'birds', 'frogs'], patterns: { drums: ['tribal', 'sparse', 'pulse'] },
      },
      moonlit: {
        name: 'Moonlit', tip: 'Moonlit: night in an enchanted wood: a flute, harp and celesta, owls and crickets, magic with a dark edge',
        phrasing: { shapes: { wave: 2, turn: 2, arch: 2 }, rhythm: 'even', hook: 0.3 }, meters: { '3/4': 3, '6/8': 2, '4/4': 1 },
        scales: { dorian: 2, lydian: 1.5, harmonicMinor: 1 }, bright: 0.5,
        palette: { melody: ['flute', 'celesta', 'glass-bell', 'ocarina'], keys: ['harp', 'celesta'], arp: ['harp', 'celesta', 'kalimba'], bells: ['glass-bell', 'celesta', 'chime'] },
        textures: ['owl', 'crickets', 'frogs'], patterns: { arp: ['twinkle', 'updown'] },
      },
    },
  },
  tense: {
    about: "Something's wrong: pulsing strings and synths, a heartbeat or taiko, dark scales. For chases, stealth and countdowns.",
    kinds: {
      danger: { name: 'Danger', tip: 'Danger: pulsing strings and synths over a heartbeat or taiko' },
      stealth: {
        name: 'Stealth', tip: 'Stealth: sneaking past the guards: a low pulsing synth bass, ticking hats, a quiet suspense pad, short notes',
        phrasing: { shapes: { repeat: 3, turn: 2, chant: 1 }, rhythm: 'snap', hook: 0.6 }, busy: -0.1,
        energy: 0.55, tuneTempo: [96, 116], kits: ['machine', 'clockwork'],
        palette: { melody: ['pluck-lead', 'sine-bell', 'felt-keys', 'violin'] }, textures: ['hum'],
        patterns: { drums: ['pulse', 'sparse', 'halftime'], bass: ['pulse', 'synco'], pad: ['pulse', 'sustain'], melody: ['fragments', 'calls'] },
      },
      countdown: {
        name: 'Countdown', tip: 'Countdown: a clock ticking under racing pizzicato strings, faster and faster',
        phrasing: { shapes: { climb: 3, repeat: 2, zigzag: 1 }, rhythm: 'running', hook: 0.7 }, build: 0.6, busy: 0.15,
        energy: 0.85, tuneTempo: [130, 156], kits: ['clockwork', 'taiko'],
        palette: { arp: ['pizzicato', 'harpsichord', 'pluck-lead'] }, layers: { arp: 0.7 },
        patterns: { drums: ['march', 'pulse'], arp: ['up', 'updown'], bass: ['pulse', 'octave'] },
      },
    },
  },
  eerie: {
    about: 'Haunted and unsettling: music boxes, a whispering choir and drones, chords that never settle. For ghosts, crypts and the dark.',
    kinds: {
      haunting: { name: 'Haunting', tip: 'Haunting: music boxes, a whispering choir and drones, chords that never settle' },
      carnival: {
        name: 'Dead carnival', tip: 'Dead carnival: an empty funfair: a broken music box and an organ playing a waltz, wobbling out of tune',
        phrasing: { shapes: { zigzag: 2, turn: 2, dive: 2 }, rhythm: 'dotted', hook: 0.4 },
        meters: { '3/4': 4, '6/8': 1 }, chords: ['i V i V', 'i iv V i', 'i bII i V', 'i bVI V i', 'i #iv° V i'], methods: { bank: 4, chromatic: 1 },
        palette: { melody: ['music-box', 'accordion', 'celesta'], keys: ['music-box', 'harpsichord', 'celesta'], pad: ['organ', 'haunted-pad'] },
        drums: [0.1, 0.35], fx: { wobble: 0.6 }, patterns: { keys: ['waltz'] },
      },
      signal: {
        name: 'Static', tip: 'Static: analog horror: tape hiss, a detuned sine bell, a cold drone, a Geiger counter ticking',
        phrasing: { shapes: { chant: 3, pendulum: 2 }, rhythm: 'long', hook: 0 }, patterns: { melody: ['fragments', 'long'] },
        palette: { melody: ['sine-bell', 'glass-bell', 'soft-lead'], drone: ['tape-loop', 'void', 'deep-drone'], pad: ['reverse-piano', 'dark-pad', 'air-pad'] },
        textures: ['geiger', 'hum', 'vinyl'], fx: { wobble: 0.6, drive: 0.2 },
      },
      // akira yamaoka's silent hill: industrial noise and scenery standing in for most of the music
      fog: {
        name: 'Fog', tip: "Fog: a town swallowed by fog: a radio crackling with static before anything else, a cold drone, a siren far off, a lone piano, footsteps that aren't yours",
        phrasing: { shapes: { fall: 2, chant: 2, sigh: 1 }, rhythm: 'long', hook: 0 }, busy: -0.1,
        prelude: 'Static', palette: { melody: ['piano', 'felt-keys', 'sine-bell', 'music-box'], pad: ['dark-pad', 'haunted-pad', 'reverse-piano', 'air-pad'], drone: ['void', 'deep-drone', 'tape-loop', 'bowed-metal'], keys: ['piano', 'felt-keys'] },
        textures: ['static', 'footsteps', 'siren', 'crows', 'hum'], layers: { texture: 1 }, fx: { wobble: 0.3, drive: 0.15 },
      },
      otherworld: {
        name: 'Rust', tip: 'Rust: the same town turned to rust and blood: metal clanging like a slow, broken machine, chains, a siren wailing, grinding drones and a low industrial beat',
        phrasing: { shapes: { chant: 3, dive: 2 }, rhythm: 'long', hook: 0 },
        energy: 0.35, edge: 0.85, kits: ['junk-kit'], drums: [0.5, 0.85], textures: ['clanks', 'chains', 'siren', 'factory'],
        palette: { drone: ['bowed-metal', 'deep-drone', 'void'], pad: ['haunted-pad', 'dark-pad', 'fuzz-wall'], bass: ['sub-bass', 'reese'], melody: ['music-box', 'sine-bell', 'piano', 'violin'] },
        patterns: { drums: ['halftime', 'sparse', 'pulse', 'march'], drone: ['cluster', 'tonic'] }, fx: { drive: 0.3 },
      },
      promise: {
        name: 'Regret', tip: "Regret: a letter from someone who's gone: a piano and a tremolo picked guitar over a slow, dusty trip hop beat, rain and a crackling radio",
        phrasing: { shapes: { sigh: 3, arch: 2, fall: 1 }, rhythm: 'snap', hook: 0.4 },
        style: 'tune', scales: { minor: 2, dorian: 1.5, harmonicMinor: 1 }, tuneTempo: [76, 92], energy: 0.55, dark: 0.6,
        chords: ['i bVI bIII bVII', 'i iv bVI V', 'i - bVI -', 'i bVII bVI V', 'iv i bVI V'], methods: { bank: 5, markov: 1 },
        palette: { guitar: ['clean-guitar', 'chorus-guitar'], melody: ['piano', 'chorus-guitar', 'felt-keys'], bass: ['round-bass', 'sub-bass', 'pluck-bass'], keys: ['piano', 'e-piano'] },
        kits: ['lofi-kit', 'machine'], drums: [0.5, 0.9], textures: ['rain', 'static'], layers: { guitar: 0.7 },
        patterns: { guitar: ['tremolo', 'ring'], drums: ['halftime', 'groove'], bass: ['held', 'rootfifth'], melody: ['phrases', 'long'] },
      },
    },
  },
  desolate: {
    about: 'Empty and quiet after it all ended: low drones, bowed metal, a lone plucked line with long silences round it, a Geiger counter ticking. For ruins, wastelands and empty places.',
    kinds: {
      ashes: { name: 'Ashes', tip: 'Ashes: low drones, bowed metal, a lone plucked line and a Geiger counter' },
      vault: {
        name: 'Bunker', tip: 'Bunker: deep underground and humming: a machine pulse, metal pings and a cold synth line',
        phrasing: { shapes: { chant: 2, pendulum: 2 }, rhythm: 'even', hook: 0.3 }, drums: [0.35, 0.7], patterns: { drums: ['pulse', 'sparse'], melody: ['calls', 'fragments'] },
        palette: { melody: ['sine-bell', 'soft-lead', 'felt-keys'], bells: ['metal-ping', 'sine-bell'] }, kits: ['machine'], textures: ['hum', 'drips', 'geiger'],
      },
      city: {
        name: 'Ruined city', tip: 'Ruined city: a bigger, sadder sound among the broken towers: strings and a piano among the drones',
        phrasing: { shapes: { sigh: 2, fall: 2, arch: 1 }, rhythm: 'long', hook: 0 }, patterns: { melody: ['long', 'phrases'], pad: ['swell', 'sustain'] },
        palette: { melody: ['piano', 'violin', 'felt-keys'], pad: ['strings', 'dark-pad', 'choir-oo'] }, textures: ['wind', 'creaks'],
      },
    },
  },
  heroic: {
    about: "Brave and bold: horns and strings over a march or taiko, the hero's theme. For quests, victories and setting out.",
    kinds: {
      quest: { name: 'Quest', tip: 'Quest: horns and strings over a march or taiko' },
      fanfare: {
        name: 'Fanfare', tip: 'Fanfare: a royal court: trumpets and a brass section, timpani and a snare, the glockenspiel doubling the tune',
        phrasing: { shapes: { triad: 4, leap: 2, repeat: 1 }, rhythm: 'dotted', hook: 0.5 }, build: 0.4,
        scales: { major: 3, mixolydian: 1 }, chords: ['I IV V I', 'I V vi IV', 'I bVII IV I', 'I IV I V', 'I bVI bVII I'],
        palette: { melody: ['trumpet', 'horn'], counter: ['trombone', 'horn', 'trumpet'], pad: ['brass-section', 'strings', 'organ'], bells: ['glock', 'bell'] },
        kits: ['orchestra-kit'], patterns: { drums: ['march'] }, orchestra: { pass: 0.5, double: 0.5 },
      },
      spaceopera: {
        name: 'Space opera', tip: 'Space opera: a fleet leaping across the stars: a big brass theme over pulsing strings and synth pads',
        phrasing: { shapes: { leap: 4, climb: 2, triad: 1 }, rhythm: 'long', hook: 0.3 }, build: 0.6, tuneTempo: [84, 108],
        scales: { mixolydian: 2, minor: 2, lydian: 1 },
        palette: { melody: ['horn', 'trumpet', 'synth-brass', 'violin'], pad: ['strings', 'analog-pad', 'brass-section', 'choir-ah'], arp: ['pizzicato', 'pluck-lead'], bass: ['synth-bass', 'sub-bass', 'round-bass'] },
        kits: ['orchestra-kit', 'taiko'], textures: ['hum'], patterns: { pad: ['pulse', 'sustain'], drums: ['march', 'tribal', 'halftime'] },
      },
    },
  },
  magic: {
    about: 'Wonder and wands: a flute or an oboe over bouncing pizzicato and a harp, a horn climbing, the tune passed round a small orchestra and its themes coming together at the end. For magic schools, spell books and enchanted places.',
    kinds: {
      school: { name: 'Wizard school', tip: 'Wizard school: a flute or oboe over bouncing pizzicato and harp, the tune passed round, its themes meeting at the end' },
      fairy: {
        name: 'Fairy glade', tip: 'Fairy glade: tiny and sparkling: harp, celesta and flutes, bells everywhere, lydian',
        phrasing: { shapes: { wave: 2, climb: 2, zigzag: 1, turn: 1 }, rhythm: 'running', hook: 0.5 }, busy: 0.1,
        scales: { lydian: 3, major: 1 }, energy: 0.45, bright: 0.8, dark: 0.1,
        palette: { melody: ['flute', 'celesta', 'glass-bell', 'music-box', 'piccolo'], bells: ['glock', 'celesta', 'glass-bell', 'chime'] },
        textures: ['chimes', 'birds', 'stream'], layers: { bells: 0.8, arp: 0.5 }, patterns: { arp: ['twinkle', 'up'], bells: ['sparkle', 'phasing'] },
      },
      forbidden: {
        name: 'Forbidden', tip: 'Forbidden: dark magic: a low choir and cellos, harmonic minor, a music box in the dark',
        phrasing: { shapes: { sigh: 2, turn: 2, dive: 2 }, rhythm: 'long', hook: 0.2 }, tuneTempo: [80, 104], meters: { '4/4': 3, '3/4': 2 }, patterns: { melody: ['long', 'phrases'], keys: ['broken', 'block'] },
        scales: { harmonicMinor: 3, hungarianMinor: 1, minor: 1 }, dark: 0.65, bright: 0.4,
        chords: ['i iv V i', 'i bVI V -', 'i v bVI V', 'i bII V i', 'i - bVI V'],
        palette: { melody: ['music-box', 'oboe', 'violin', 'celesta', 'choir-oo'], counter: ['bassoon', 'clarinet', 'violin'], pad: ['choir-ah', 'strings', 'dark-pad', 'haunted-pad'], drone: ['cello-drone', 'deep-drone'] },
        textures: ['owl', 'creaks', 'drips'],
      },
      // wysteria: spring at a school for wizards. a drum and cymbal, then horns with a flute and a
      // glockenspiel answering, a choir and a harp, a clarinet's tune in quick bouncing eighths, reeds
      // carrying a waltz over the brass, the horns passing the tune to the strings for a bold climax
      blossom: {
        name: 'Blossom', tip: 'Blossom: spring in bloom: a clarinet tune that bounces, horns, a glockenspiel and a harp, a waltz that swells to the strings',
        phrasing: { shapes: { triad: 2, climb: 2, pendulum: 1.5, arch: 1 }, rhythm: 'dotted', hook: 0.55 }, weave: 0.7,
        scales: { major: 3, lydian: 1, mixolydian: 0.7 }, meters: { '3/4': 4, '4/4': 3, '6/8': 1 }, bright: 0.75, dark: 0.1,
        chords: ['I IV V I', 'I vi IV V', 'I iii IV iv', 'I V vi IV', 'IV V iii vi', 'I II IV I'],
        palette: { melody: ['clarinet', 'flute', 'oboe', 'horn'], counter: ['horn', 'flute', 'cello', 'clarinet'], pad: ['strings', 'choir-oo', 'brass-section'], bells: ['glock', 'celesta'] },
        textures: ['birds', 'leaves', 'stream'], kits: ['spell-kit', 'orchestra-kit'], drums: [0.1, 0.55],
      },
      // celestia: a sunken city of the stars. low brass and a flute, a harp and a glockenspiel, horns over
      // a string ostinato, a turn to minor with strings climbing, dorian chords swaying between home and
      // a major four, a celesta's waltz, a piccolo cold and high, and a men's choir with hand drums and
      // a marimba in its old tribe's theme
      tides: {
        name: 'Starlit tides', tip: 'Starlit tides: a sunken city under the stars: horns over swaying strings, a harp, a celesta waltz, a piccolo high and cold',
        phrasing: { shapes: { wave: 2, leap: 2, arch: 1.5, sigh: 1 }, rhythm: 'long', hook: 0.3 },
        scales: { dorian: 3, lydian: 1.5, minor: 1, major: 1 }, meters: { '3/4': 3, '4/4': 3, '6/8': 1 }, bright: 0.55, dark: 0.35, space: 0.85,
        chords: ['i IV i IV', 'i - IV -', 'I II I II', 'i bVII IV i', 'i IV bVII i', 'IV I V vi'],
        palette: { melody: ['horn', 'flute', 'piccolo', 'celesta', 'violin'], counter: ['horn', 'cello', 'flute'], arp: ['harp', 'celesta', 'marimba'], bells: ['glock', 'celesta', 'vibes'], pad: ['strings', 'choir-ah', 'tremolo-strings', 'brass-section'] },
        textures: ['bubbles', 'chimes'], kits: ['spell-kit', 'hand-drums'],
      },
    },
  },
  gaslamp: {
    about: "A foggy Victorian city of cobbles, clocks and gaslight, and its grand waltz: a clarinet over a fluttering harp and chiming bells, a harpsichord keeping time, the tune passed to the horns, strings and trumpets, then the whole orchestra. For cities, mysteries and something afoot.",
    kinds: {
      fog: { name: 'City waltz', tip: 'City waltz: a clarinet over harp and chiming bells, a harpsichord keeping time, the tune passed round, its themes meeting at the end' },
      // the sewers under the city: a deep, quick bassoon, syncopated percussion, a sneaking tune that
      // won't stay in one key (what this mood used to be: a detective's clarinet over a walking bass)
      sneak: {
        name: 'Back alleys', tip: "Back alleys: a detective's clarinet over a sneaking bassoon, pizzicato and the rain, something afoot",
        phrasing: { shapes: { turn: 2, dive: 2, repeat: 2, zigzag: 1 }, rhythm: 'snap', hook: 0.5 }, weave: 0.2,
        scales: { minor: 2, harmonicMinor: 2, dorian: 1.5 }, meters: { '4/4': 5, '6/8': 2, '3/4': 1 }, tuneTempo: [92, 120], swing: 0.35, swingAmount: [0.15, 0.3],
        chords: ['i iv V i', 'i bVI ii° V', 'i - iv V', 'i iv i V', 'i bVII bVI V'],
        palette: { melody: ['clarinet', 'oboe', 'mute-trumpet', 'harpsichord'], bass: ['bassoon', 'tuba', 'upright'], keys: ['pizzicato', 'harpsichord', 'piano'] },
        kits: ['clockwork', 'orchestra-kit', 'brushes'], patterns: { bass: ['walking', 'hook'], keys: ['broken', 'block'], drums: ['march', 'sparse', 'groove'], melody: ['calls', 'phrases'] },
      },
      musichall: {
        name: 'Music hall', tip: 'Music hall: a Victorian music hall: an upright piano, a brass band and a jaunty oom-pah in a major key',
        phrasing: { shapes: { triad: 2, repeat: 2, call: 2 }, rhythm: 'dotted', hook: 0.6 }, weave: 0,
        scales: { major: 3, mixolydian: 1 }, bright: 0.65, dark: 0.15, swing: 0.5, chords: ['I I7 IV iv', 'I vi ii V', 'I II7 V7 I', 'I IV I V'],
        palette: { melody: ['honky-tonk', 'clarinet', 'trumpet', 'accordion', 'whistle'], keys: ['honky-tonk', 'piano'], bass: ['tuba', 'upright'] },
        kits: ['orchestra-kit', 'tight-kit'], patterns: { keys: ['waltz', 'block'], drums: ['march', 'groove'] },
      },
      clockwork: {
        name: 'Clockwork', tip: 'Clockwork: a steampunk workshop: clocks ticking, a harpsichord whirring, a celesta and a bassoon',
        phrasing: { shapes: { zigzag: 2, repeat: 2, climb: 2 }, rhythm: 'running', hook: 0.7 },
        palette: { arp: ['harpsichord', 'celesta', 'music-box', 'pizzicato'], melody: ['oboe', 'clarinet', 'celesta', 'harpsichord'] },
        kits: ['clockwork'], drums: [0.6, 0.9], layers: { arp: 0.8 }, textures: ['creaks', 'fire'],
        patterns: { arp: ['up', 'updown', 'converge'], drums: ['march', 'pulse', 'groove'] },
      },
      // darkmoor: a vampire's castle. an eerie celesta with a shrill violin, the theme called and
      // answered round the oboe and harp, the flute and pizzicato, a choir and chimes trading beats as a
      // minor chord turns major, a waltz, an alto flute doubled by a pipe organ
      manor: {
        name: 'Moonlit manor', tip: 'Moonlit manor: a castle at midnight: a celesta and a thin violin, a choir and chimes, a pipe organ and a waltz in harmonic minor',
        phrasing: { shapes: { sigh: 2, turn: 2, arch: 1, dive: 1 }, rhythm: 'even', hook: 0.3 },
        scales: { harmonicMinor: 3, minor: 1, hungarianMinor: 0.5 }, meters: { '3/4': 5, '4/4': 1.5 }, dark: 0.6, bright: 0.4, tuneTempo: [96, 126],
        chords: ['i iv V i', 'i bVI V -', 'i - I -', 'i iv I V', 'i bII V i', 'i VI iv V'],
        palette: { melody: ['celesta', 'violin', 'oboe', 'flute'], counter: ['violin', 'cello', 'oboe', 'bassoon'], pad: ['choir-ah', 'organ', 'strings', 'tremolo-strings'], keys: ['harp', 'pizzicato', 'harpsichord'], bass: ['bassoon', 'tuba', 'upright'] },
        textures: ['owl', 'creaks', 'wind'], kits: ['orchestra-kit'], drums: [0.1, 0.5],
      },
    },
  },
  dragon: {
    about: 'A fallen city of fire and ash: a choir, an organ and low brass over timpani and the crackle of flames, a lone trumpet calling out. For dragons, volcanoes and dark citadels.',
    kinds: {
      citadel: { name: 'Burning citadel', tip: 'Burning citadel: a choir, an organ and low brass over timpani and fire' },
      lair: {
        name: 'Lair', tip: 'Lair: the dragon asleep: low drones and cellos, a heartbeat, a lone horn, embers',
        phrasing: { shapes: { chant: 2, sigh: 2, fall: 1 }, rhythm: 'long', hook: 0 }, busy: -0.1,
        style: 'ambient', energy: 0.35, kits: ['heartbeat', 'orchestra-kit'], drums: [0.3, 0.6],
        palette: { melody: ['horn', 'oboe', 'choir-oo', 'violin'] }, textures: ['fire', 'rumble'],
        patterns: { drums: ['pulse', 'sparse'], melody: ['long', 'fragments'] },
      },
      charge: {
        name: 'Charge', tip: 'Charge: the knights ride out: a faster march, horns and trumpets in fifths, the choir driving',
        phrasing: { shapes: { triad: 3, repeat: 2, leap: 2 }, rhythm: 'dotted', hook: 0.6 },
        tuneTempo: [120, 150], energy: 0.95, meters: { '4/4': 5, '6/8': 2 },
        palette: { melody: ['trumpet', 'horn', 'choir-oo'], counter: ['trombone', 'horn'] },
        patterns: { drums: ['march', 'tribal'], bass: ['octave', 'pulse'], pad: ['pulse', 'stabs'] },
      },
    },
  },
  sands: {
    about: 'An empire of sand and gold, played by an orchestra: a tam-tam, a harp keeping time under lyres, horns holding a slow tune, an oboe dancing over it, a triangle and a sistrum. For pyramids, desert palaces and old kings.',
    kinds: {
      pyramids: { name: 'Pyramids', tip: 'Pyramids: a tam-tam, a harp and lyre keeping time, horns holding a slow tune, an oboe dancing over it' },
      // krokotopia's third and fourth themes
      royal: {
        name: 'Royal march', tip: 'Royal march: a stately march: a low flute dancing over an ostinato, hand drums, a triangle on two, a sistrum on the off beats and a gong',
        phrasing: { shapes: { triad: 2, turn: 2, repeat: 1.5, arch: 1 }, rhythm: 'dotted', hook: 0.55 },
        energy: 0.7, tuneTempo: [96, 120], meters: { '4/4': 6, '3/4': 1 }, drums: [0.5, 0.95],
        palette: { melody: ['flute', 'oboe', 'horn'], counter: ['horn', 'oboe', 'cello'] },
        patterns: { drums: ['march', 'march', 'maqsum'], bass: ['rootfifth', 'hook'], keys: ['broken'] },
      },
      // zafaria: a savanna kingdom of lions and elephants. little is written about its music, so this is
      // from listening: hand drums, a marimba and a thumb piano under horns and a choir
      savanna: {
        name: 'Golden plains', tip: 'Golden plains: a kingdom on the grasslands: hand drums, a marimba and a thumb piano, horns and a choir',
        phrasing: { shapes: { call: 2, repeat: 2, triad: 1.5, wave: 1 }, rhythm: 'syncopated', hook: 0.6 },
        scales: { major: 2, mixolydian: 2, majorPentatonic: 2, dorian: 1 }, bright: 0.65, dark: 0.2,
        chords: ['I IV I V', 'I - IV -', 'I V vi IV', 'IV I V I', 'I bVII IV I'],
        palette: { melody: ['horn', 'flute', 'choir-oo', 'kalimba'], keys: ['marimba', 'kalimba', 'mbira', 'harp'], arp: ['marimba', 'kalimba', 'mbira'], bells: ['vibes', 'glock'], pad: ['choir-ah', 'strings', 'brass-section'] },
        textures: ['birds', 'crickets', 'wind'], kits: ['hand-drums', 'palace-kit'], patterns: { drums: ['tribal', 'groove', 'march'] },
      },
    },
  },
  jade: {
    about: 'A land of jade pagodas: a high gong, a koto plucking with the harp, a flute calling and the koto answering, an erhu, finger cymbals and a gong at the top. For eastern palaces, gardens and temples.',
    kinds: {
      gardens: { name: 'Jade gardens', tip: 'Jade gardens: a gong, a koto and a flute calling and answering, finger cymbals, then the flute playing both themes at once' },
      // mooshu's plague theme
      blight: {
        name: 'Blight', tip: 'Blight: a land under a sickness: an erhu over plucked strings in a minor key, brass climbing, the harp and high strings falling',
        phrasing: { shapes: { sigh: 2, fall: 2, arch: 1, turn: 1 }, rhythm: 'long', hook: 0.2 },
        scales: { minorPentatonic: 2, minor: 2, hirajoshi: 2, dorian: 1 }, dark: 0.55, bright: 0.4, tuneTempo: [76, 100],
        chords: ['i - bVI -', 'i bVII bVI bVII', 'i iv i -', 'i bVI bIII bVII', 'i v bVI V'],
        palette: { melody: ['erhu', 'shakuhachi', 'flute'], counter: ['erhu', 'horn', 'cello'], pad: ['strings', 'tremolo-strings', 'brass-section'] },
        patterns: { melody: ['long', 'phrases'], arp: ['down', 'updown'] },
      },
      // mooshu's war theme: seven beats a bar (five here, the nearest uneven beat)
      war: {
        name: 'War drums', tip: 'War drums: an army in the mountains: dark brass and deep drums in an uneven beat, strings and a flute, the plucked strings echoing the brass',
        phrasing: { shapes: { repeat: 2, dive: 2, triad: 1.5, chant: 1 }, rhythm: 'dotted', hook: 0.6 }, weave: 0.3,
        scales: { minorPentatonic: 2, minor: 2, phrygian: 1, hirajoshi: 1 }, meters: { '5/4': 3, '4/4': 3 }, energy: 0.8, dark: 0.6, bright: 0.4, tuneTempo: [100, 132], drums: [0.6, 1],
        chords: ['i - bVI -', 'i bVII bVI V', 'i bII i -', 'i iv bVI V'],
        palette: { melody: ['horn', 'trombone', 'shakuhachi', 'erhu'], counter: ['trombone', 'horn', 'cello'], pad: ['brass-section', 'strings', 'tremolo-strings'], bass: ['tuba', 'upright'] },
        kits: ['jade-kit', 'taiko'], patterns: { drums: ['tribal', 'march', 'halftime'], pad: ['stabs', 'pulse', 'sustain'], bass: ['octave', 'rootfifth'] },
      },
      // the mystical theme from the skyways
      mists: {
        name: 'Mists', tip: 'Mists: a mountain shrine in the clouds: a koto in even eighths, finger cymbals and wooden blocks, an erhu holding long notes, a gong',
        phrasing: { shapes: { pendulum: 2, turn: 2, wave: 1.5, chant: 1 }, rhythm: 'even', hook: 0.4 },
        energy: 0.45, space: 0.8, tuneTempo: [76, 100],
        palette: { melody: ['koto', 'flute', 'shakuhachi'], counter: ['erhu', 'flute'], keys: ['koto', 'zither'], arp: ['koto', 'zither', 'harp'] },
        textures: ['wind', 'chimes', 'stream'], patterns: { keys: ['broken'], arp: ['up', 'converge'], drums: ['sparse', 'pulse'] },
      },
    },
  },
  greenwood: {
    about: "A green and ancient land of knights, castles and the fae: noble horns and strings over a harp, a flute with a lilt, a dance in six. For old kingdoms, forests and quests.",
    kinds: {
      knights: { name: 'Greenwood', tip: 'Greenwood: noble horns and strings over a harp, a flute with a lilt, a dance in six' },
      // avalon's wyrd: the fae's side of the wood
      wyrd: {
        name: 'Fae wood', tip: 'Fae wood: the wood where the fae live: a harp and celesta, a flute in a minor mode, strings trembling, something watching',
        phrasing: { shapes: { turn: 2, wave: 2, sigh: 1, zigzag: 1 }, rhythm: 'even', hook: 0.35 },
        scales: { dorian: 2, minor: 2, harmonicMinor: 1, lydian: 0.5 }, dark: 0.5, bright: 0.5, energy: 0.45,
        chords: ['i bVII i -', 'i iv i bVII', 'i bVI bVII i', 'i IV i IV', 'i iv V i'],
        palette: { melody: ['flute', 'celesta', 'violin', 'oboe'], keys: ['harp', 'celesta'], arp: ['harp', 'celesta'], pad: ['tremolo-strings', 'strings', 'choir-oo'] },
        textures: ['owl', 'leaves', 'chimes'], drums: [0, 0.4],
      },
      // grizzleheim: the north of bears and runes. little is written about its music, so from listening:
      // a men's choir, horns and drums, a fiddle, fifths held under it all
      longhouse: {
        name: 'Longhouse', tip: 'Longhouse: a cold northern hall: a low men\'s choir and horns, a fiddle, deep drums and open fifths held underneath',
        phrasing: { shapes: { chant: 2, triad: 2, leap: 1.5, sigh: 1 }, rhythm: 'long', hook: 0.3 },
        scales: { dorian: 2, minor: 2, phrygian: 0.7, mixolydian: 1 }, meters: { '4/4': 4, '3/4': 2, '6/8': 1 }, dark: 0.5, bright: 0.45, energy: 0.65,
        chords: ['i bVII i -', 'i - bVI bVII', 'i bIII bVII i', 'i iv bVII i'],
        palette: { melody: ['horn', 'violin', 'chant-voice', 'cello'], counter: ['chant-voice', 'horn', 'cello', 'trombone'], pad: ['choir-ah', 'strings', 'brass-section'], drone: ['cello-drone', 'organ-drone'] },
        layers: { drone: 0.6 }, textures: ['wind', 'fire'], kits: ['taiko', 'orchestra-kit'], drums: [0.4, 0.85], patterns: { drums: ['tribal', 'march', 'halftime'], drone: ['fifths'] },
      },
    },
  },
  metal: {
    about: 'Heavy and relentless: chugging riffs, a double kick, the bass doubling the riff, twin guitars in harmony and screaming solos. For bosses, hellscapes and anything heavy.',
    kinds: {
      thrash: { name: 'Thrash', tip: 'Thrash: chugging riffs, double kick, twin leads and a solo' },
      symphonic: {
        name: 'Symphonic', tip: 'Symphonic: metal meets the orchestra: the band with a choir and strings, a horn sometimes taking the tune',
        phrasing: { shapes: { leap: 3, triad: 2, climb: 1 }, hook: 0.4 }, build: 0.4,
        scales: { harmonicMinor: 2, minor: 2, phrygian: 1 },
        palette: { pad: ['choir-ah', 'strings', 'brass-section'], melody: ['metal-lead', 'horn', 'violin'], counter: ['lead-guitar', 'horn'] },
        layers: { pad: 0.9 }, orchestra: { pass: 0.35, double: 0 },
      },
      stoner: {
        name: 'Stoner', tip: 'Stoner: slow, fuzzy and bluesy, a riff crawling along on the sludge guitar, thick as smoke',
        phrasing: { shapes: { dive: 3, repeat: 2, turn: 1 }, rhythm: 'snap', hook: 0.6 },
        tuneTempo: [64, 84], scales: { minorPentatonic: 2, blues: 1, minor: 1, phrygian: 1 },
        palette: { guitar: ['sludge-guitar'], bass: ['fuzz-bass', 'pick-bass'] },
        patterns: { drums: ['halftime', 'rock'], guitar: ['power', 'chug'] },
      },
    },
  },
  grunge: {
    about: 'Angst in a flannel shirt: a quiet clean verse, then the distortion stamped on for the chorus. For angst, garages and rainy cities.',
    kinds: {
      seattle: { name: 'Garage', tip: 'Garage: a quiet clean verse, the distortion stamped on for the chorus' },
      unplugged: {
        name: 'Unplugged', tip: 'Unplugged: the band sat down on stools: acoustic guitars, a cello, soft drums, the same sad songs quieter',
        phrasing: { shapes: { sigh: 2, chant: 2, fall: 1 }, rhythm: 'even', hook: 0.3 },
        energy: 0.5, edge: 0.7, loudQuiet: 0,
        palette: { guitar: ['steel-guitar', 'clean-guitar'], melody: ['rasp-voice', 'violin', 'harmonica'], counter: ['violin', 'clean-guitar', 'harmonica'], pad: ['strings'], bass: ['upright', 'pick-bass'] },
        kits: ['brushes', 'soft-kit'], textures: ['hum'],
        patterns: { guitar: ['strum', 'ring'], drums: ['brush', 'halftime', 'groove'], bass: ['rootfifth', 'held'] },
      },
    },
  },
  hardcore: {
    about: 'Fast and heartfelt: punk beats, driving eighths, a twinkling clean guitar and a breakdown to jump around to. For skating, rebellion and running.',
    kinds: {
      melodic: { name: 'Melodic', tip: 'Melodic: punk beats, driving eighths, a twinkling clean guitar and a breakdown' },
      poppunk: {
        name: 'Pop punk', tip: 'Pop punk: summer, skateparks and bad decisions: major keys, bouncy, a catchy lead over a punk beat',
        phrasing: { shapes: { repeat: 3, call: 2, leap: 1 }, rhythm: 'even', hook: 0.7 },
        scales: { major: 3, mixolydian: 1 }, dark: 0.1, bright: 0.75, chords: ['I V vi IV', 'I IV V I', 'vi IV I V', 'I V IV IV', 'IV I V vi'],
        patterns: { drums: ['punk', 'rock'] },
      },
      twinkle: {
        name: 'Twinkle', tip: 'Twinkle: an emo band playing in a basement: clean guitars twinkling, softer drums, major sevenths',
        phrasing: { shapes: { wave: 3, zigzag: 2, arch: 1 }, rhythm: 'running', hook: 0.4 },
        tuneTempo: [100, 140], energy: 0.6, edge: 0.6, richness: [0.5, 0.9], loudQuiet: 0.2,
        chords: ['IVmaj7 I V vi', 'Imaj7 IVmaj7', 'vi IV I V', 'IVmaj7 iii7 vi7 V', 'Imaj7 iii7 IVmaj7 -'],
        palette: { guitar: ['clean-guitar', 'chorus-guitar'], arp: ['clean-guitar', 'chorus-guitar'], melody: ['lead-guitar', 'rasp-voice', 'chorus-guitar'] },
        layers: { arp: 0.9, guitar: 0.7 }, patterns: { arp: ['twinkle', 'updown'], drums: ['rock', 'halftime', 'groove'], guitar: ['ring', 'strum'] },
      },
    },
  },
  shoegaze: {
    about: 'Loud and blissful, eyes on your shoes and the amp all the way up: guitars as a wall of sound, warping and reversed, a voice buried in it. For dreams, haze and feeling everything at once.',
    kinds: {
      wall: { name: 'Wall of sound', tip: 'Wall of sound: glide guitars warping, reverse reverb, a buried voice and a cymbal wash' },
      blackgaze: {
        name: 'Blackgaze', tip: 'Blackgaze: dawn breaking through a storm: tremolo picked guitars, fast drums, a huge, bright wash in a minor key',
        phrasing: { shapes: { chant: 2, climb: 2, arch: 1 }, rhythm: 'long', hook: 0.2 }, build: 0.5,
        scales: { minor: 2, dorian: 1, major: 1 }, tuneTempo: [130, 170], energy: 0.95, dark: 0.45, edge: 1.1,
        kits: ['gaze-kit', 'metal-kit'], patterns: { guitar: ['tremolo', 'tremolo', 'ring'], drums: ['rock', 'wash', 'double'] },
      },
      // whirr's pipe dreams, around and sway (junebouvier, leave, ease, press, mumble), title fight's
      // hyperview, parannoul: 146 to 170 bpm, every guitar strumming eighths on held major sevenths and
      // added ninths with the open strings ringing, the bass on root eighths, a rock beat with the crash on
      // one and the ride in the chorus. ease is in e minor (em add9, bm add9, gmaj7, then am9 and cmaj7 in
      // the chorus), junebouvier in a major (IVmaj9 to I, vi, Vadd11)
      rush: {
        name: 'Rush', tip: 'Rush: fast and loud and sweet at once: every guitar strumming eighths on big ringing chords, the drums pushing, the voice lost somewhere inside',
        phrasing: { shapes: { wave: 2, arch: 2, chant: 1.5, sigh: 1 }, rhythm: 'long', hook: 0.3 },
        scales: { major: 2.5, minor: 2, dorian: 0.7, mixolydian: 0.7 }, tuneTempo: [140, 170], meters: { '4/4': 1 },
        chords: ['IVmaj7 I vi V', 'IV I', 'bVImaj7 bIIImaj7', 'i v bIIImaj7 -', 'iv bVImaj7', 'IVmaj7 - vi IV', 'I vi IV V', 'bVImaj7 i bVImaj7 i', 'vi IV I V', 'iv - bVImaj7 -'],
        richness: [0.6, 1], energy: 0.9, bright: 0.55, drums: [0.4, 1], kits: ['gaze-kit', 'rock-kit'],
        palette: { guitar: ['offset-guitar', 'fuzz-guitar', 'glide-guitar'], melody: ['dream-voice', 'alto-voice', 'fuzz-lead'], bass: ['pick-bass', 'fuzz-bass'] },
        layers: { pad: 0.6 },
        patterns: { guitar: ['wash', 'wash', 'ring'], drums: ['rock', 'rock', 'wash'], bass: ['pulse', 'pulse', 'rootfifth'], melody: ['long', 'phrases'] },
      },
      // whirr's heavy side (raw blue, feel, blue, heavy), glare (void in blue, nü burn), nothing and
      // narrow head: fast tempos with the snare only on three, so it crawls, fuzz tuned down, minor keys
      // leaning on bIIImaj7 and bVImaj7, glare's major I and its semitone bII, a quiet verse before the wall
      undertow: {
        name: 'Undertow', tip: 'Undertow: slow and crushing: fuzz tuned way down, the drums in half time under a wash of cymbals, sweet chords sinking into the noise',
        phrasing: { shapes: { sigh: 2, fall: 2, chant: 1.5, wave: 1 }, rhythm: 'long', hook: 0.2 },
        scales: { minor: 2.5, dorian: 1.5, phrygian: 0.6, major: 0.6 }, tempo: [56, 70], tuneTempo: [126, 156], meters: { '4/4': 6, '3/4': 1 },
        chords: ['bIIImaj7 bIIImaj7 I -', 'i bVImaj7', 'bVImaj7 bIIImaj7 i -', 'i - bII -', 'iv bVImaj7 i -', 'i bVI bIII bVII', 'bIIImaj7 bVImaj7', 'i iv bVImaj7 V'],
        energy: 0.8, dark: 0.45, bright: 0.4, edge: 1.1, build: 0.3, bury: 0.85, kits: ['gaze-kit', 'rock-kit'], textures: ['feedback', 'hum'],
        palette: { guitar: ['drop-guitar', 'sludge-guitar', 'octave-fuzz', 'fuzz-guitar'], bass: ['fuzz-bass', 'pick-bass'], melody: ['dream-voice', 'fuzz-lead', 'ebow-lead'], pad: ['fuzz-wall', 'reverse-guitar', 'swell-guitar'] },
        quiet: ['chorus-guitar', 'clean-guitar'], loudQuiet: 0.5,
        patterns: { guitar: ['ring', 'wash', 'ring', 'power'], drums: ['halftime', 'halftime', 'wash'], bass: ['held', 'pulse'] },
        fx: { wobble: 0.3, drive: 0.18 },
      },
      // whirr's feels like you (mellow, wavelength, younger than you, before you head off, under the same
      // name), glare's mourning haze and bloom, slowdive's dagger: 85 to 125 bpm, often a waltz, clean
      // guitars under the fuzz, bIIImaj9 to a suspended I, IVmaj7 to vi, a piano before the noise
      ache: {
        name: 'Ache', tip: 'Ache: slow and sad and very pretty: clean guitars and fuzz ringing out together, sometimes a waltz, a piano before the noise comes in',
        phrasing: { shapes: { sigh: 2.5, fall: 2, wave: 1.5, arch: 1 }, rhythm: 'long', hook: 0.15 },
        scales: { major: 2, minor: 2, dorian: 1, lydian: 0.6 }, tuneTempo: [84, 112], meters: { '4/4': 5, '3/4': 3, '6/8': 1 },
        chords: ['bVImaj7 i iv i', 'bIIImaj7 - Isus4 V7', 'IVmaj7 vi IVadd9 I', 'iv bVII bVImaj7 i', 'IIsus2 Imaj7', 'IVmaj7 vi I -', 'Imaj7 VI IVmaj7 -', 'bVImaj7 - i -'],
        richness: [0.6, 1], energy: 0.55, dark: 0.3, bright: 0.45, build: 0.45, opens: ['keys', 'guitar', 'pad'], kits: ['gaze-kit', 'soft-kit'], drums: [0.2, 0.85],
        palette: { guitar: ['shimmer-guitar', 'offset-guitar', 'chorus-guitar', 'glide-guitar'], melody: ['dream-voice', 'alto-voice', 'ebow-lead'], keys: ['piano', 'felt-keys'], counter: ['chorus-guitar', 'clean-guitar', 'ebow-lead'], bells: ['harmonics', 'glass-bell'] },
        quiet: ['shimmer-guitar', 'chorus-guitar', 'clean-guitar'], loudQuiet: 0.7,
        layers: { keys: 0.35, counter: 0.4 },
        patterns: { guitar: ['ring', 'strum', 'ring', 'wash'], drums: ['wash', 'halftime', 'sparse'], keys: ['broken', 'strum'], melody: ['long', 'phrases'] },
      },
      // fleshwater (kiss the ladder, linda claire, woohoo, foreign), glare's heavier songs, hum, deftones,
      // superheaven: drop b and drop c, a chugging riff the bass doubles, bVImaj7 sliding to a semitone bII,
      // IVmaj7 to a major II, a wah lead bending a whole tone, 120 to 190 bpm
      concrete: {
        name: 'Concrete', tip: 'Concrete: heavy 90s riffs tuned way down, a chug under the haze, big bending leads and a beat to nod along to',
        phrasing: { shapes: { call: 2, dive: 1.5, repeat: 1.5, fall: 1 }, rhythm: 'syncopated', hook: 0.5 },
        scales: { minor: 2.5, phrygian: 1, dorian: 1, major: 0.8 }, tuneTempo: [118, 176], meters: { '4/4': 8, '3/4': 1 },
        chords: ['bVImaj7 bII', 'i bIImaj7', 'IVmaj7 II', 'i - bVImaj7 -', 'bIIImaj7 i bVI V', 'I bVII', 'IVsus2 II', 'iv bVImaj7 bIII i'],
        energy: 0.95, dark: 0.5, bright: 0.6, edge: 1.1, bury: 0.5, solo: 0.6, breakdown: true, kits: ['rock-kit', 'gaze-kit'], drums: [0.5, 1],
        palette: { guitar: ['drop-guitar', 'drop-guitar', 'phaser-guitar', 'octave-fuzz'], melody: ['wah-lead', 'rasp-voice', 'dream-voice'], counter: ['wah-lead', 'phaser-guitar', 'chorus-guitar'], bass: ['fuzz-bass', 'pick-bass'], pad: ['fuzz-wall', 'reverse-guitar'] },
        layers: { counter: 0.45, pad: 0.45 },
        patterns: { guitar: ['chug', 'power', 'ring', 'eighths'], bass: ['riff', 'pulse', 'synco'], drums: ['rock', 'halftime', 'rock'], counter: ['harmony', 'answer'] },
      },
      // the sultry, slow side: deftones' sextape and digital bath, cigarettes after sex, slowdive's sugar
      // for the pill, sweet trip's milk, softcult: 62 to 95 bpm, plain diatonic chords (I vi iii V, iv bVII
      // bIII i) with major sevenths and raised fourths, a clean chorused guitar, ride eighths, the voice close
      velvet: {
        name: 'Velvet', tip: 'Velvet: slow, close and sultry: a clean guitar shimmering through the chorus, soft cymbals, a breathy voice right in your ear, the lights down low',
        phrasing: { shapes: { sigh: 2, wave: 2, pendulum: 1.5, arch: 1 }, rhythm: 'long', hook: 0.3, pickup: 0.5 },
        scales: { major: 2, minor: 1.5, dorian: 1.5, lydian: 1 }, tempo: [54, 66], tuneTempo: [62, 92], meters: { '4/4': 6, '6/8': 2 },
        chords: ['I vi iii V', 'iv bVII bIII i', 'Imaj7 vi', 'iv bVI bIII i', 'IVmaj7 Imaj7', 'I V ii IV', 'bIIImaj7 II', 'Imaj7 IVmaj7 iii vi'],
        richness: [0.6, 1], energy: 0.45, dark: 0.25, bright: 0.45, edge: 0.6, bury: 0.15, kits: ['soft-kit', 'machine', 'gaze-kit'], drums: [0.2, 0.85],
        palette: { guitar: ['chorus-guitar', 'shimmer-guitar', 'clean-guitar', 'flange-guitar'], melody: ['dream-voice', 'alto-voice', 'soul-voice'], bass: ['round-bass', 'fretless', 'chorus-bass'], pad: ['glass-pad', 'swell-guitar', 'vox-pad', 'analog-pad'], keys: ['e-piano', 'wurlitzer'], bells: ['harmonics', 'glass-bell'] },
        layers: { pad: 0.6, keys: 0.3, counter: 0.25, arp: 0.3 },
        patterns: { guitar: ['ring', 'strum', 'ring'], drums: ['halftime', 'groove', 'brush', 'wash'], bass: ['held', 'rootfifth', 'synco'], melody: ['phrases', 'long'] },
        fx: { wobble: 0.3, echo: 0.3 },
      },
      // slowdive's souvlaki and just for a day (alison, 40 days, souvlaki space station, catch the breeze),
      // ride, lush: 90 to 115 bpm, lydian and major, IVadd9 to vi and I, a raised fourth on every chord,
      // tape flanging, a ride washing, two voices together
      sunlit: {
        name: 'Sunlit', tip: 'Sunlit: mid paced and golden: chorused and flanged guitars ringing with a raised fourth, a ride cymbal washing, two voices drifting together',
        phrasing: { shapes: { arch: 2, wave: 2, climb: 1.5, sigh: 1 }, rhythm: 'even', hook: 0.35 },
        scales: { lydian: 2, major: 2.5, mixolydian: 1 }, tuneTempo: [88, 116],
        chords: ['IVadd9 vi I -', 'IVmaj7 II', 'I IVmaj7', 'IV I V Imaj7', 'I - IV iii', 'vi V IV -', 'Iadd9 IVadd9', 'IVmaj7 V iii vi'],
        energy: 0.65, bright: 0.65, dark: 0.1,
        palette: { guitar: ['flange-guitar', 'chorus-guitar', 'glide-guitar', 'shimmer-guitar'], melody: ['dream-voice', 'alto-voice', 'fuzz-lead'], counter: ['chorus-guitar', 'clean-guitar', 'ebow-lead'], bells: ['harmonics', 'bridge-chimes', 'glass-bell'] },
        layers: { counter: 0.4, bells: 0.3, arp: 0.3 },
        patterns: { guitar: ['ring', 'strum', 'wash', 'tremolo'], drums: ['wash', 'rock', 'groove'], counter: ['counterpoint', 'harmony'] },
        fx: { wobble: 0.45 },
      },
      // my bloody valentine's loveless and isn't anything (soon, to here knows when, only shallow, sometimes,
      // loomer): open tunings droning (sus2s and sus4s, the major II), sixteenths strummed through a
      // tremolo arm never still, soon's baggy beat, the voice drowned, behind the bridge plinks
      melt: {
        name: 'Melt', tip: 'Melt: the whole band bending in and out of tune like a record warping in the sun, sixteenths strummed soft and blurred, a loose dance beat underneath',
        phrasing: { shapes: { chant: 2, wave: 2, sigh: 1.5, turn: 1 }, rhythm: 'long', hook: 0.25 },
        scales: { major: 2, mixolydian: 2, lydian: 1.5, dorian: 1 }, tuneTempo: [88, 134],
        chords: ['Isus2 vi Isus4 II', 'I II IV I', 'IVsus2 I bVImaj7 -', 'I bVIIsus2 IVadd9 Isus4', 'Imaj7 IV', 'i bVII bVImaj7 -', 'IV6 I6', 'I - Isus4 bVIIsus4'],
        energy: 0.7, bright: 0.5, bury: 0.85, kits: ['gaze-kit', 'machine'],
        palette: { guitar: ['glide-guitar', 'octave-fuzz', 'offset-guitar'], melody: ['dream-voice', 'alto-voice', 'ebow-lead'], pad: ['reverse-guitar', 'fuzz-wall', 'swell-guitar'], bells: ['bridge-chimes', 'harmonics'] },
        layers: { bells: 0.3 },
        patterns: { guitar: ['glide', 'glide', 'tremolo', 'ring'], drums: ['baggy', 'baggy', 'wash'], bass: ['held', 'pulse'] },
        fx: { wobble: 0.55, drive: 0.12 },
      },
      // the bedroom shoegaze of the internet (parannoul, weatherday, julie, quannnic, wisp, teen suicide):
      // 130 to 180 bpm, emo chords (Imaj7, II7, IVmaj9), cheap fuzz recorded too loud, a drum machine or
      // a racing kit, twinkling clean guitars, tape hiss
      glow: {
        name: 'Screen glow', tip: 'Screen glow: a bedroom at three in the morning: cheap fuzz recorded far too loud, emo chords, a drum machine racing, hiss and crackle in the gaps',
        phrasing: { shapes: { zigzag: 2, climb: 1.5, wave: 1.5, leap: 1 }, rhythm: 'running', hook: 0.4 },
        scales: { major: 2.5, minor: 1.5, lydian: 1 }, tuneTempo: [128, 176],
        chords: ['Isus2 II7 IV -', 'IVmaj7 Imaj7', 'bVImaj7 V', 'I bII vi bVI', 'IVmaj7 iii vi V', 'Imaj7 IVmaj7 I IVmaj7', 'vi I Isus4 -', 'I III IV iv'],
        richness: [0.55, 0.95], energy: 0.85, bright: 0.6, kits: ['machine', 'lofi-kit', 'gaze-kit'], textures: ['vinyl', 'hum', 'feedback'],
        palette: { guitar: ['fuzz-guitar', 'offset-guitar', 'crunch-guitar', 'chorus-guitar'], melody: ['dream-voice', 'chorus-guitar', 'fuzz-lead', 'soft-lead'], arp: ['clean-guitar', 'chorus-guitar'], drone: ['tape-loop'] },
        layers: { arp: 0.45 },
        patterns: { guitar: ['wash', 'eighths', 'strum'], arp: ['twinkle', 'updown'], drums: ['groove', 'rock', 'four', 'halftime'] },
        fx: { wobble: 0.6, drive: 0.15 },
      },
    },
  },
  dreampop: {
    about: 'Soft and hazy, half asleep in the back seat: chorused clean guitars, a breathy voice floating, a slow organ and a drum machine. For night drives and drifting off.',
    kinds: {
      haze: { name: 'Haze', tip: 'Haze: chorused clean guitars, a breathy voice, organ and a drum machine' },
      bedroom: {
        name: 'Bedroom pop', tip: 'Bedroom pop: lo-fi and close: a jangling guitar, a cheap drum machine and worn tape',
        phrasing: { shapes: { repeat: 2, pendulum: 2, call: 1 }, rhythm: 'snap', hook: 0.6 },
        energy: 0.55, tuneTempo: [90, 116], kits: ['machine', 'lofi-kit'], textures: ['vinyl'], fx: { wobble: 0.6 },
        palette: { melody: ['dream-voice', 'chorus-guitar', 'soft-lead'] }, patterns: { drums: ['groove', 'halftime'], guitar: ['strum', 'ring'] },
      },
    },
  },
  ethereal: {
    about: 'A voice soaring and fluttering in a language of its own, over guitars cascading through long echoes, a bass with a tune of its own and a drum machine. Dreamy, but always melodic.',
    kinds: {
      soaring: { name: 'Soaring', tip: 'Soaring: the voice up front and fluttering, guitars cascading through the echo like light through water' },
      dancing: {
        name: 'Dancing', tip: 'Dancing: glittering and quicker: four on the floor, a bass bouncing in octaves, guitars shimmering',
        phrasing: { shapes: { zigzag: 2, repeat: 2, call: 2 }, rhythm: 'syncopated', hook: 0.7 },
        scales: { major: 3, lydian: 1, mixolydian: 1 }, tempo: [84, 96], tuneTempo: [112, 126], meters: { '4/4': 1 },
        energy: 0.8, bright: 0.75, drums: [0.5, 1], kits: ['machine', 'club-kit'], opens: ['drums', 'bass', 'arp'],
        patterns: { drums: ['four', 'groove', 'four'], bass: ['octave', 'synco', 'hook'], arp: ['updown', 'up'], guitar: ['strum', 'ring'] },
      },
      mellow: {
        name: 'Mellow', tip: 'Mellow: slow and minor, barely any drums, a guitar ringing alone in the echo, a sax drifting through like mist',
        phrasing: { shapes: { sigh: 2, wave: 2, fall: 1 }, rhythm: 'long', hook: 0.1 }, busy: -0.1,
        scales: { dorian: 2, minor: 2, mixolydian: 1 }, tempo: [52, 66], tuneTempo: [66, 84],
        chords: ['i bVI bIII bVII', 'i iv', 'vi IV I V', 'i bVII bVI bVII', 'Imaj7 vi7', 'i - bVI -', 'iv i'],
        energy: 0.35, dark: 0.35, bright: 0.45, drums: [0, 0.25],
        palette: { melody: ['dream-voice', 'tenor-sax', 'chorus-guitar'], counter: ['tenor-sax', 'clean-guitar', 'glass-bell'] },
        patterns: { melody: ['long', 'phrases', 'fragments'], drums: ['wash', 'sparse', 'halftime'], bass: ['held', 'rootfifth'] },
      },
    },
  },
  desert: {
    about: 'Arabian nights and the Andalusian sands: an oud and a shawm over hand drums and a drone, in the phrygian dominant. For deserts, bazaars and palaces.',
    kinds: {
      bazaar: { name: 'Bazaar', tip: 'Bazaar: an oud and a shawm over hand drums and a drone' },
      oasis: {
        name: 'Oasis', tip: 'Oasis: slower and cooler: a flute or oud over a drone, shade and water, few drums',
        phrasing: { shapes: { wave: 2, turn: 2, fall: 1 }, rhythm: 'long', hook: 0.2 },
        style: 'ambient', energy: 0.35, drums: [0.1, 0.4],
        palette: { melody: ['flute', 'oud', 'pan-flute', 'violin'] }, textures: ['stream', 'crickets', 'wind'],
        patterns: { drums: ['pulse', 'sparse', 'tribal'] },
      },
      palace: {
        name: 'Palace', tip: "Palace: a sultan's court: strings sweeping in unison, the darbuka, the shawm wailing",
        phrasing: { shapes: { zigzag: 2, turn: 2, dive: 1, climb: 1 }, rhythm: 'dotted', hook: 0.4 }, build: 0.4,
        palette: { pad: ['strings', 'choir-ah'], counter: ['violin', 'oud', 'shawm'] }, layers: { pad: 0.9, counter: 0.6 },
        kits: ['darbuka-kit', 'hand-drums'], patterns: { drums: ['maqsum', 'tribal', 'groove'] }, orchestra: { pass: 0.5, double: 0.1 },
      },
    },
  },
  tropical: {
    about: 'Islands, jungles and beaches: steel drums and marimbas over a bouncing bass and hand drums. For beaches, jungles and holidays.',
    kinds: {
      island: { name: 'Island', tip: 'Island: steel drums and marimbas over a bouncing bass and hand drums' },
      jungle: {
        name: 'Jungle', tip: 'Jungle: deep in the canopy: pan pipes and marimba, frogs and birds, a busier hand drum beat, darker',
        phrasing: { shapes: { call: 2, turn: 2, pendulum: 2 }, rhythm: 'syncopated', hook: 0.5 },
        scales: { dorian: 2, minorPentatonic: 2, mixolydian: 1 }, dark: 0.3,
        palette: { melody: ['pan-flute', 'marimba', 'kalimba', 'ocarina'] }, textures: ['frogs', 'birds', 'rain'],
        kits: ['hand-drums', 'african-drums'], patterns: { drums: ['tribal', 'groove'] },
      },
      hawaii: {
        name: 'Hawaii', tip: 'Hawaii: a lap steel sliding, a guitar strumming like a ukulele, waves, a slow sway',
        phrasing: { shapes: { wave: 3, arch: 2, sigh: 1 }, rhythm: 'long', hook: 0.2 },
        tuneTempo: [84, 104], energy: 0.5, meters: { '4/4': 1 },
        palette: { melody: ['pedal-steel', 'steel-guitar', 'vibes'], keys: ['steel-guitar', 'nylon'], arp: ['steel-guitar', 'nylon'], counter: ['pedal-steel', 'vibes', 'nylon'] },
        textures: ['ocean', 'birds'], patterns: { drums: ['groove', 'halftime'], keys: ['strum'] },
      },
    },
  },
  folk: {
    about: 'Celtic and village folk: a fiddle, tin whistle or bagpipe over a strummed guitar and droning fifths, jigs in 6/8. For villages, taverns and green hills.',
    kinds: {
      village: { name: 'Village', tip: 'Village: a fiddle or tin whistle over a strummed guitar and open fifths' },
      tavern: {
        name: 'Tavern', tip: 'Tavern: a rowdy session: fast reels, the fiddle and accordion together, stamping feet',
        phrasing: { shapes: { zigzag: 2, wave: 2, turn: 2 }, rhythm: 'running', hook: 0.4 }, busy: 0.1,
        tuneTempo: [120, 150], energy: 0.8, kits: ['stomp-kit', 'hand-drums'],
        palette: { melody: ['violin', 'accordion', 'whistle', 'bagpipe'], counter: ['accordion', 'violin', 'whistle'] },
        patterns: { drums: ['groove', 'march', 'gallop'] }, orchestra: { pass: 0.5, double: 0.1 },
      },
      air: {
        name: 'Slow air', tip: 'Slow air: a lone whistle or fiddle and a harp, mist on the hills',
        phrasing: { shapes: { arch: 2, wave: 2, sigh: 2 }, rhythm: 'long', hook: 0 },
        tuneTempo: [66, 84], energy: 0.35, drums: [0.05, 0.2],
        palette: { melody: ['whistle', 'violin', 'flute', 'pan-flute'], keys: ['harp', 'nylon'], arp: ['harp'] },
        textures: ['wind', 'stream', 'birds'], patterns: { melody: ['long', 'phrases'] },
      },
    },
  },
  wintry: {
    about: 'Snow and ice: from a quiet snowfall to Christmas by the fire. Celesta, glass bells and shimmering pads, a waltz, wind and a fire. For snowy towns and winter nights.',
    kinds: {
      snowfall: { name: 'Snowfall', tip: 'Snowfall: celesta and glass bells over shimmering pads, wind and a fire' },
      snowtown: {
        name: 'Snow town', tip: 'Snow town: a cosy little town buried in snow: a bouncy tune on bells or a chip lead, a walking bass, warm and a little silly',
        phrasing: { shapes: { repeat: 2, pendulum: 2, call: 2 }, rhythm: 'even', hook: 0.6 },
        style: 'tune', scales: { major: 3, majorPentatonic: 1, lydian: 1 }, tuneTempo: [100, 124], energy: 0.55,
        palette: { melody: ['glock', 'celesta', 'pulse-lead', 'music-box', 'xylophone'], counter: ['celesta', 'vibes', 'marimba'], bass: ['upright', 'round-bass', 'chip-bass'] },
        kits: ['soft-kit', 'chip-kit'], patterns: { bass: ['walking', 'rootfifth'], drums: ['groove'] },
      },
      christmas: {
        name: 'Christmas', tip: 'Christmas: a jolly major tune on the glockenspiel or a horn, a choir, sleigh-ride swing, warm by the fire',
        phrasing: { shapes: { triad: 2, repeat: 2, fall: 2 }, rhythm: 'dotted', hook: 0.5 },
        style: 'tune', scales: { major: 4, mixolydian: 1 }, energy: 0.65, swing: 0.4, richness: [0.3, 0.7],
        chords: ['I vi IV V', 'I IV I V', 'I I7 IV iv', 'I vi ii V', 'IV V I vi', 'I III7 vi IV'],
        palette: { melody: ['glock', 'celesta', 'flute', 'music-box', 'horn'], bells: ['glock', 'chime', 'celesta'], pad: ['choir-oo', 'strings', 'choir-ah'] },
        layers: { bells: 0.7 }, kits: ['soft-kit', 'orchestra-kit'], textures: ['fire'],
        patterns: { drums: ['groove', 'march'], bass: ['rootfifth', 'walking'] }, orchestra: { pass: 0.4, double: 0.5 },
      },
      icecave: {
        name: 'Ice cave', tip: 'Ice cave: frozen and echoing: wine glasses and glass bells, drips, a cold drone, minor',
        phrasing: { shapes: { chant: 2, pendulum: 2, fall: 1 }, rhythm: 'long', hook: 0 },
        scales: { minor: 2, dorian: 1, lydian: 1 }, dark: 0.4,
        palette: { melody: ['wine-glass', 'glass-bell', 'sine-bell', 'celesta'], drone: ['void', 'tape-loop'] }, textures: ['drips', 'wind'],
      },
    },
  },
  synthwave: {
    about: 'Night drives in the 80s future: saw leads and synth brass over arps, an octave bass and a drum machine. For racing, neon and sunsets.',
    kinds: {
      outrun: { name: 'Outrun', tip: 'Outrun: saw leads and synth brass over arps, an octave bass and a drum machine' },
      darksynth: {
        name: 'Darksynth', tip: 'Darksynth: the night drive turned into a horror film: faster and harder, a growling bass and a menacing minor lead',
        phrasing: { shapes: { repeat: 3, dive: 2, pendulum: 1 }, rhythm: 'snap', hook: 0.7 },
        tuneTempo: [110, 128], dark: 0.7, scales: { minor: 2, phrygian: 1, harmonicMinor: 1 },
        palette: { bass: ['growl-bass', 'reese', 'synth-bass'] }, fx: { drive: 0.3, wobble: 0.1 }, patterns: { drums: ['four', 'groove'] },
      },
      dreamwave: {
        name: 'Dreamwave', tip: 'Dreamwave: hazy and slow: soft leads, warm pads, a gated snare, tape gone soft in the sun',
        phrasing: { shapes: { arch: 3, sigh: 2 }, rhythm: 'long', hook: 0.3 },
        tuneTempo: [80, 100], energy: 0.55,
        palette: { melody: ['soft-lead', 'sine-bell', 'e-piano', 'pluck-lead'] }, fx: { wobble: 0.5 }, patterns: { drums: ['halftime', 'groove'] },
      },
    },
  },
  breakbeat: {
    about: 'Drum and bass: breakbeats at 170 under a reese bass and airy pads. For speed, rain and flying.',
    kinds: {
      liquid: { name: 'Liquid', tip: 'Liquid: breaks at 170 under a reese bass, airy pads and a soft lead' },
      jungle: {
        name: 'Jungle', tip: 'Jungle: the 90s original: chopped breaks, a deep sub bass, organ chords on the off beat and an orchestra hit',
        phrasing: { shapes: { call: 2, zigzag: 2, repeat: 1 }, rhythm: 'syncopated', hook: 0.6 },
        palette: { pad: ['orchestra-hit', 'strings', 'air-pad'], keys: ['hammond', 'e-piano'] }, layers: { keys: 0.6 },
        patterns: { keys: ['skank'], bass: ['held', 'synco'] },
      },
      triphop: {
        name: 'Trip hop', tip: 'Trip hop: smoky and slow: the breaks slowed right down, a dusty kit, vinyl, minor and moody',
        phrasing: { shapes: { sigh: 2, fall: 2, chant: 1 }, rhythm: 'snap', hook: 0.3 },
        tempo: [70, 84], tuneTempo: [80, 96], dark: 0.5, energy: 0.55, swing: 0.4,
        kits: ['boombap-kit', 'lofi-kit'], textures: ['vinyl', 'rain'],
        palette: { melody: ['e-piano', 'sine-bell', 'violin', 'soft-lead'], pad: ['strings', 'dark-pad'] },
        patterns: { drums: ['halftime', 'break', 'groove'] },
      },
    },
  },
  neon: {
    about: 'Dark and electric, a city that never sleeps and never feels safe: a crushed chip lead over pumping pads, an octave bass and a club kick. For night cities, hacking and running from something.',
    kinds: {
      club: { name: 'Night club', tip: 'Night club: a crushed chip lead over pumping pads, an octave bass and a club kick' },
      cyberpunk: {
        name: 'Rain city', tip: 'Rain city: neon signs reflected in wet streets: huge analog pads, a slow saw or soft lead, rain on the pavement',
        phrasing: { shapes: { chant: 2, arch: 2, sigh: 1 }, rhythm: 'long', hook: 0.2 },
        tuneTempo: [90, 110], energy: 0.6,
        palette: { melody: ['soft-lead', 'saw-lead', 'synth-brass', 'sine-bell'], pad: ['analog-pad', 'glass-pad', 'dark-pad', 'choir-ah'] },
        textures: ['rain', 'hum'], patterns: { drums: ['halftime', 'groove'], pad: ['swell', 'sustain'] },
      },
      industrial: {
        name: 'Industrial', tip: 'Industrial: the factory turned into a nightclub: a distorted machine beat, metal clanging, a growling bass',
        phrasing: { shapes: { repeat: 3, dive: 2 }, rhythm: 'snap', hook: 0.8 },
        kits: ['machine', 'junk-kit'], fx: { drive: 0.6 }, textures: ['hum', 'geiger'],
        palette: { bass: ['growl-bass', 'reese', 'synth-bass'], bells: ['metal-ping', 'bell'] }, patterns: { drums: ['groove', 'halftime', 'four'] },
      },
    },
  },
  pop: {
    about: 'Four chord pop: a bright piano or plucked synth with the hook, pads, a strummed guitar and a backbeat. For menus, montages and feeling good.',
    kinds: {
      radio: { name: 'Radio', tip: 'Radio: a piano or plucked synth hook, pads and a backbeat' },
      ballad: {
        name: 'Power ballad', tip: 'Power ballad: slow and big: a piano, strings swelling, the drums coming in huge for the chorus',
        phrasing: { shapes: { arch: 3, leap: 2, sigh: 1 }, rhythm: 'long', hook: 0.3 }, build: 0.5,
        tuneTempo: [66, 84], energy: 0.55,
        palette: { melody: ['piano', 'soft-lead', 'violin', 'e-piano'], keys: ['piano', 'e-piano'], pad: ['strings', 'synth-strings', 'warm-pad'] },
        patterns: { drums: ['halftime', 'groove'], keys: ['block', 'broken'] },
      },
      bubblegum: {
        name: 'Bubblegum', tip: 'Bubblegum: sugary and sparkly: fast and bright, a plucky synth and a glockenspiel, four on the floor',
        phrasing: { shapes: { repeat: 3, call: 2, zigzag: 1 }, rhythm: 'syncopated', hook: 0.8 },
        tuneTempo: [124, 144], palette: { melody: ['pluck-lead', 'synth-brass', 'soft-lead', 'whistle'], bells: ['glock', 'celesta', 'sine-bell'] },
        layers: { bells: 0.5 }, kits: ['club-kit', 'tight-kit'], patterns: { drums: ['four', 'groove'], bass: ['octave', 'synco'] },
      },
    },
  },
  hiphop: {
    about: 'A beat tape with no rapper, made in a bedroom at 2am: a dusty boom bap kit, a Rhodes looping jazzy chords, vinyl and scratches. For chilling, studying and city streets.',
    kinds: {
      tape: { name: 'Beat tape', tip: 'Beat tape: a dusty boom bap kit, a Rhodes on jazzy chords, vinyl and scratches' },
      study: {
        name: 'Lo-fi study', tip: 'Lo-fi study: slower and softer: a felt piano or guitar, rain on the window, the beat lazier',
        phrasing: { shapes: { sigh: 2, pendulum: 2, fall: 1 }, rhythm: 'snap', hook: 0.4 },
        tuneTempo: [70, 84], energy: 0.45, textures: ['vinyl', 'rain'],
        palette: { melody: ['felt-keys', 'e-piano', 'nylon', 'vibes'], keys: ['felt-keys', 'e-piano', 'nylon'] }, patterns: { drums: ['boombap', 'halftime'] },
      },
      jazzhop: {
        name: 'Jazz hop', tip: 'Jazz hop: a city at dusk after the rain: a flute or sax, strings, minor sevenths, a crisp beat',
        phrasing: { shapes: { zigzag: 2, arch: 2, turn: 1 }, rhythm: 'syncopated', hook: 0.4 },
        palette: { melody: ['flute', 'alto-sax', 'tenor-sax', 'piano'], counter: ['strings', 'vibes', 'harp'] }, layers: { counter: 0.5 },
      },
      golden: {
        name: 'Golden age', tip: 'Golden age: nineties street corners: horns stabbing, a scratched record, a punchy kit',
        phrasing: { shapes: { repeat: 3, call: 2 }, rhythm: 'snap', hook: 0.7 },
        palette: { pad: ['brass-section', 'orchestra-hit', 'strings'] }, layers: { pad: 0.8, texture: 0.7 }, textures: ['scratches', 'vinyl'],
        patterns: { pad: ['stabs'] },
      },
    },
  },
  trap: {
    about: 'Trap at 140: an 808 sliding under rolling hats, a clap on three, a dark simple hook. For villains, swagger and cities at night.',
    kinds: {
      dark: { name: 'Dark trap', tip: 'Dark trap: an 808 sliding under rolling hats and a dark, simple hook' },
      cloud: {
        name: 'Cloud rap', tip: 'Cloud rap: dreamy and floating: a glassy pad, a soft lead or flute hook, the 808 underneath',
        phrasing: { shapes: { wave: 2, arch: 2, sigh: 1 }, rhythm: 'long', hook: 0.4 }, patterns: { melody: ['long', 'phrases'] },
        scales: { minor: 1, dorian: 1, lydian: 1 }, dark: 0.35, bright: 0.65, fx: { wobble: 0.3 },
        palette: { pad: ['glass-pad', 'air-pad', 'choir-oo', 'shimmer'], melody: ['flute', 'soft-lead', 'sine-bell', 'music-box'] },
      },
      drill: {
        name: 'Drill', tip: 'Drill: sliding 808s, a choir and a piano in harmonic minor, sharper and darker',
        phrasing: { shapes: { dive: 2, repeat: 2, sigh: 1 }, rhythm: 'snap', hook: 0.7 },
        scales: { harmonicMinor: 3, minor: 1, phrygian: 1 }, tuneTempo: [138, 146], dark: 0.75,
        palette: { melody: ['piano', 'choir-oo', 'flute'], pad: ['choir-ah', 'strings', 'dark-pad'] },
      },
    },
  },
  jazz: {
    about: 'A small jazz combo: a sax or trumpet over piano comping, a walking bass and a swinging ride. For clubs, cities and detectives.',
    kinds: {
      bebop: { name: 'Bebop', tip: 'Bebop: a sax or trumpet over piano comping, a walking bass and a swinging ride' },
      ballad: {
        name: 'Ballad', tip: 'Ballad: late at night: slow brushes, a breathy tenor sax or muted trumpet, lush chords',
        phrasing: { shapes: { arch: 2, sigh: 2, leap: 1 }, rhythm: 'long', hook: 0.1, pickup: 0.7 }, busy: -0.15,
        tuneTempo: [60, 80], energy: 0.35, swingAmount: [0.35, 0.55], kits: ['brushes', 'jazz-kit'],
        palette: { melody: ['tenor-sax', 'mute-trumpet', 'piano', 'vibes'] }, patterns: { drums: ['brush'], bass: ['walking', 'rootfifth', 'held'] },
      },
      bigband: {
        name: 'Big band', tip: 'Big band: the swing era: a brass section stabbing, trumpets and trombones, a sax tune, the drummer driving',
        phrasing: { shapes: { zigzag: 2, repeat: 2, triad: 2 }, rhythm: 'syncopated', hook: 0.6 }, busy: 0.1,
        tuneTempo: [140, 190], energy: 0.8, edge: 0.8,
        palette: { pad: ['brass-section'], counter: ['trombone', 'trumpet', 'alto-sax'] }, layers: { pad: 0.9, counter: 0.7 },
        patterns: { pad: ['stabs'] }, orchestra: { pass: 0.5, double: 0 },
      },
      noir: {
        name: 'Noir', tip: 'Noir: a smoky detective film: minor, a muted trumpet or tenor sax, a slow walking bass, rain',
        phrasing: { shapes: { sigh: 2, dive: 2, chant: 1 }, rhythm: 'long', hook: 0.2 }, patterns: { bass: ['walking', 'held'], drums: ['brush', 'swing'] },
        scales: { minor: 2, dorian: 1, harmonicMinor: 1, melodicMinor: 1 }, chords: ['i7 iv7 bVI7 V7', 'ii7 V7 i7 i7', 'i7 - bVI7 V7', 'i7 bVII7 bVI7 V7'],
        dark: 0.45, tuneTempo: [70, 100], palette: { melody: ['mute-trumpet', 'tenor-sax', 'piano', 'vibes'] }, textures: ['rain', 'vinyl'],
      },
    },
  },
  lounge: {
    about: 'Bossa nova and easy listening: a nylon guitar or a Rhodes on the bossa rhythm, a flute or vibes floating over it. For hotels, lifts and beaches.',
    kinds: {
      bossa: { name: 'Bossa nova', tip: 'Bossa nova: a nylon guitar or Rhodes on the bossa rhythm, a flute or vibes on top' },
      lift: {
        name: 'Lift music', tip: 'Lift music: strings and a soft lead on a slow, smooth beat, nothing to frighten anyone',
        phrasing: { shapes: { arch: 3, wave: 2 }, rhythm: 'even', hook: 0.3 },
        tuneTempo: [80, 100], energy: 0.35,
        palette: { melody: ['soft-lead', 'vibes', 'flute'], pad: ['strings', 'synth-strings', 'warm-pad'] }, layers: { pad: 0.9 },
        patterns: { drums: ['bossa', 'brush'] },
      },
      exotica: {
        name: 'Exotica', tip: 'Exotica: a tiki bar in a make believe jungle: vibes and marimba, birdcalls, bongos and lush chords',
        phrasing: { shapes: { wave: 2, call: 2, turn: 1 }, rhythm: 'syncopated', hook: 0.4 },
        palette: { melody: ['vibes', 'marimba', 'flute', 'steel-drum'], keys: ['marimba', 'vibes', 'nylon'] },
        textures: ['birds', 'frogs', 'ocean'], kits: ['latin-kit', 'hand-drums'], patterns: { drums: ['bossa', 'tribal'] },
      },
    },
  },
  soul: {
    about: 'Soul and neo soul: a Rhodes on ninth chords, a fat sliding bass, a lazy beat and a wordless voice or sax. For late nights and smooth talkers.',
    kinds: {
      latenight: { name: 'Late night', tip: 'Late night: a Rhodes on ninth chords, a sliding bass, a lazy beat and a wordless voice' },
      motown: {
        name: 'Sixties soul', tip: 'Sixties soul: a tambourine backbeat, a bass that walks and hooks, strings and horns, a bright major tune',
        phrasing: { shapes: { call: 2, repeat: 2, triad: 1 }, rhythm: 'syncopated', hook: 0.7 },
        scales: { major: 2, mixolydian: 1 }, tuneTempo: [104, 126], energy: 0.75, richness: [0.3, 0.6], swing: 0.3,
        chords: ['I vi IV V', 'I IV I V', 'I iii IV V', 'ii V I vi', 'I V vi IV'],
        palette: { pad: ['strings', 'brass-section'], keys: ['piano', 'hammond', 'wurlitzer'] },
        kits: ['tight-kit', 'funk-kit'], patterns: { drums: ['groove', 'four'], bass: ['hook', 'walking', 'synco'] },
      },
      gospel: {
        name: 'Gospel', tip: 'Gospel: a Hammond organ and a choir, a church piano, a slow 6/8 or a clapping shuffle',
        phrasing: { shapes: { climb: 2, call: 2, sigh: 1, chant: 1 }, rhythm: 'dotted', hook: 0.4 }, build: 0.5,
        meters: { '6/8': 3, '4/4': 2, '3/4': 1 }, chords: ['I IV I V', 'I I7 IV iv', 'IV I V vi', 'I vi ii V', 'I IV7 I V7'],
        palette: { melody: ['soul-voice', 'piano', 'alto-sax'], pad: ['choir-ah', 'choir-oo', 'hammond', 'organ'], keys: ['hammond', 'piano'] },
        kits: ['tight-kit', 'brushes'], patterns: { drums: ['shuffle', 'groove', 'halftime'], bass: ['walking', 'rootfifth', 'held'] },
      },
    },
  },
  showtime: {
    about: 'Funk and disco with the lights on and the crowd screaming: horns stabbing, a slap bass, a funk guitar and four on the floor. For stages, big entrances and showing off.',
    kinds: {
      glamour: { name: 'Spotlight', tip: 'Spotlight: all eyes on you: horns stabbing, a slap bass, a funk guitar and four on the floor' },
      disco: {
        name: 'Disco', tip: 'Disco: Saturday night: strings swooping, an octave bass, four on the floor, hats on the off beat',
        phrasing: { shapes: { repeat: 2, zigzag: 2, leap: 1 }, rhythm: 'syncopated', hook: 0.8 },
        tuneTempo: [116, 128],
        palette: { pad: ['strings', 'synth-strings', 'brass-section'], melody: ['violin', 'alto-sax', 'soul-voice', 'synth-brass'] },
        patterns: { drums: ['four', 'four'], bass: ['octave', 'octave', 'synco'], pad: ['swell', 'stabs'] },
      },
      gameshow: {
        name: 'Game show', tip: 'Game show: bright and cheesy: a brass band, a Hammond, a xylophone, big major chords',
        phrasing: { shapes: { triad: 3, climb: 2, repeat: 1 }, rhythm: 'dotted', hook: 0.7 },
        scales: { major: 3, mixolydian: 1 }, dark: 0.05, richness: [0.3, 0.7],
        chords: ['I vi ii V', 'I IV V I', 'I bVII IV I', 'I II7 V7 I', 'I iii IV V'],
        palette: { melody: ['trumpet', 'synth-brass', 'xylophone', 'alto-sax'], keys: ['hammond', 'piano', 'clavinet'], bells: ['glock', 'xylophone', 'vibes'] },
      },
    },
  },
  shop: {
    about: 'Browsing the shelves while the shopkeeper hums along: a short loop where the bass is the hook, jazzy chords and a lazy beat. For shops, cafés and hanging about.',
    kinds: {
      hip: { name: 'Laid back', tip: 'Laid back: too cool to hurry: the bass is the hook, under jazzy chords and a lazy beat' },
      general: {
        name: 'General store', tip: 'General store: a little village shop with a bell over the door: a marimba or ocarina tune, a plucked bass, a gentle beat',
        phrasing: { shapes: { pendulum: 2, wave: 2, call: 1 }, rhythm: 'even', hook: 0.5 },
        scales: { major: 3, majorPentatonic: 1, mixolydian: 1 }, chords: ['I vi IV V', 'I IV I V', 'Imaj7 IVmaj7', 'I vi ii V', 'IV V I vi'],
        swing: 0.5, richness: [0.2, 0.6], bright: 0.7, dark: 0.05,
        palette: { melody: ['marimba', 'ocarina', 'xylophone', 'kalimba', 'flute'], keys: ['marimba', 'nylon', 'piano'], bass: ['upright', 'pluck-bass'] },
        kits: ['soft-kit', 'tight-kit'], patterns: { drums: ['groove', 'halftime'], bass: ['rootfifth', 'hook', 'synco'] },
      },
      shady: {
        name: 'Black market', tip: "Black market: a shady dealer's: minor, a muted trumpet or clarinet, a sneaking bass hook, a dusty beat",
        phrasing: { shapes: { dive: 2, turn: 2, chant: 1 }, rhythm: 'snap', hook: 0.6 }, tuneTempo: [84, 104], patterns: { bass: ['hook', 'walking'], drums: ['halftime', 'groove'] },
        scales: { minor: 2, dorian: 2, phrygian: 1, harmonicMinor: 1 }, dark: 0.45,
        palette: { melody: ['mute-trumpet', 'clarinet', 'alto-sax', 'vibes'] }, textures: ['vinyl', 'rain'],
      },
    },
  },
  blues: {
    about: 'Twelve bar blues: a harmonica or guitar bending its notes over a shuffle and a boogie bass. For saloons, rainy streets and hard times.',
    kinds: {
      shuffle: { name: 'Shuffle', tip: 'Shuffle: twelve bars, a harmonica or guitar bending, a boogie bass and a shuffle' },
      delta: {
        name: 'Delta', tip: 'Delta: the old country blues: an acoustic guitar and a harmonica, slow, a foot stomping',
        phrasing: { shapes: { dive: 2, chant: 2, sigh: 1 }, rhythm: 'snap', hook: 0.4 },
        tuneTempo: [66, 96], kits: ['stomp-kit'], textures: ['crickets', 'fire', 'rain'],
        palette: { melody: ['harmonica', 'steel-guitar', 'nylon'], keys: ['steel-guitar', 'nylon'], arp: ['steel-guitar'], bass: ['upright'] },
        layers: { keys: 0.8, pad: 0.05, counter: 0.3, guitar: 0 }, patterns: { drums: ['train', 'halftime', 'pulse'] },
      },
      electric: {
        name: 'Electric', tip: 'Electric: city blues, plugged in: an electric guitar crunching, a Hammond, horns, louder',
        phrasing: { shapes: { dive: 3, repeat: 2 }, rhythm: 'snap', hook: 0.6 },
        energy: 0.75, edge: 0.9, palette: { guitar: ['crunch-guitar', 'drive-guitar'], melody: ['lead-guitar', 'harmonica', 'tenor-sax'] },
        layers: { guitar: 0.85 }, kits: ['tight-kit', 'rock-kit'], patterns: { drums: ['shuffle', 'shuffle', 'rock'] },
      },
    },
  },
  country: {
    about: 'Country and bluegrass: boom chick guitar, a rolling banjo, a fiddle and a pedal steel, and the train beat. For ranches, farms and long roads.',
    kinds: {
      road: { name: 'Country road', tip: 'Country road: boom chick guitar, banjo, fiddle, pedal steel and the train beat' },
      bluegrass: {
        name: 'Bluegrass', tip: 'Bluegrass: fast and acoustic: banjo rolls, a fiddle racing, barely any drums',
        phrasing: { shapes: { zigzag: 2, climb: 2, wave: 2 }, rhythm: 'running', hook: 0.4 }, busy: 0.15,
        tuneTempo: [130, 170], energy: 0.8, drums: [0.05, 0.2],
        palette: { melody: ['violin', 'banjo'], arp: ['banjo'] }, layers: { arp: 0.9 }, patterns: { arp: ['roll'], bass: ['rootfifth'] },
      },
      campfire: {
        name: 'Campfire', tip: 'Campfire: a lonesome cowboy song: a harmonica or whistle over a slow strummed guitar in three, crickets and the fire',
        phrasing: { shapes: { wave: 2, arch: 2, sigh: 2 }, rhythm: 'dotted', hook: 0.2 },
        meters: { '3/4': 3, '6/8': 1, '4/4': 1 }, tuneTempo: [72, 96], drums: [0.05, 0.3], energy: 0.4,
        palette: { melody: ['harmonica', 'whistle', 'violin', 'pedal-steel'] }, textures: ['fire', 'crickets'],
      },
    },
  },
  fareast: {
    about: 'Japan and China: a shakuhachi or erhu over a plucked koto, temple drums and a gong, pentatonic and spacious. For temples, bamboo forests and ninjas.',
    kinds: {
      temple: { name: 'Temple', tip: 'Temple: a shakuhachi or erhu over a koto, temple drums and a gong' },
      matsuri: {
        name: 'Festival', tip: 'Festival: a summer matsuri: taiko pounding, a bamboo flute dancing, a shamisen strumming',
        phrasing: { shapes: { repeat: 2, call: 2, triad: 1 }, rhythm: 'dotted', hook: 0.6 }, build: 0.4,
        tuneTempo: [110, 140], energy: 0.8, kits: ['taiko'], drums: [0.5, 1], scales: { majorPentatonic: 3, minorPentatonic: 1 },
        palette: { melody: ['shakuhachi', 'flute'], keys: ['shamisen', 'koto'] }, patterns: { drums: ['tribal', 'march'] },
      },
      ninja: {
        name: 'Ninja', tip: 'Ninja: fast and sharp: a shamisen and koto stabbing in in sen, taiko hits, a menacing flute',
        phrasing: { shapes: { dive: 2, zigzag: 2, repeat: 1 }, rhythm: 'running', hook: 0.6 }, busy: 0.1,
        scales: { inSen: 3, hirajoshi: 2 }, dark: 0.55, tuneTempo: [120, 150], energy: 0.85,
        palette: { melody: ['shakuhachi', 'koto', 'erhu'], keys: ['shamisen', 'koto'] }, kits: ['taiko', 'temple'],
      },
      teahouse: {
        name: 'Tea house', tip: 'Tea house: China: an erhu and a flute over a plucked zither (the koto stands in for the guzheng), slow and graceful',
        phrasing: { shapes: { wave: 2, arch: 2, turn: 2 }, rhythm: 'long', hook: 0.1 },
        scales: { majorPentatonic: 3, minorPentatonic: 1 }, tuneTempo: [70, 92], energy: 0.35, drums: [0.1, 0.4],
        palette: { melody: ['erhu', 'flute', 'koto'] },
      },
    },
  },
  raga: {
    about: 'India: a sitar or bansuri sliding over a tanpura and tabla, with no chord changes: the drone is the harmony. For temples, palaces and long journeys.',
    kinds: {
      raga: { name: 'Raga', tip: 'Raga: a sitar or bansuri over a tanpura plucked round and round, and tabla' },
      dawn: {
        name: 'Dawn', tip: 'Dawn: raga Bhairav at sunrise: the double harmonic scale, slow, a bansuri, birds waking',
        phrasing: { shapes: { climb: 2, turn: 2, chant: 1 }, rhythm: 'long', hook: 0 },
        scales: { doubleHarmonic: 3 }, tuneTempo: [60, 84], drums: [0.2, 0.5],
        palette: { melody: ['bansuri', 'violin', 'sitar'] }, textures: ['birds', 'stream'],
      },
      filmi: {
        name: 'Filmi', tip: 'Filmi: a big film dance number: strings in unison, a harmonium, a big tune and the drums driving',
        phrasing: { shapes: { zigzag: 2, leap: 2, repeat: 2 }, rhythm: 'dotted', hook: 0.6 }, build: 0.4,
        tuneTempo: [110, 135], energy: 0.85, chords: ['i bVII bVI bVII', 'i iv bVII i', 'I IV V I', 'i bVI bVII i'], methods: { bank: 1 },
        palette: { pad: ['strings', 'harmonium'], melody: ['sitar', 'violin', 'bansuri', 'shawm'] },
        layers: { pad: 0.9, bass: 0.9 }, kits: ['tabla', 'hand-drums'], patterns: { drums: ['tala', 'groove', 'tribal'], bass: ['octave', 'rootfifth'] },
      },
    },
  },
  reggae: {
    about: 'Reggae: the one drop, the organ and guitar chopping the off beats, a deep round bass and a melodica on top. For beaches and lazy afternoons.',
    kinds: {
      roots: { name: 'Roots', tip: 'Roots: the one drop, the skank, a deep bass and a melodica' },
      dub: {
        name: 'Dub', tip: 'Dub: the studio played like an instrument: the bass up front, echoes everywhere, the tune dropping in and out',
        phrasing: { shapes: { chant: 2, repeat: 2 }, rhythm: 'snap', hook: 0.6 },
        space: 0.85, fx: { echo: 0.45, wobble: 0.2 }, layers: { melody: 0.6, counter: 0.1 },
        patterns: { melody: ['fragments', 'calls'] },
      },
      ska: {
        name: 'Ska', tip: 'Ska: faster: horns on the tune, the skank on every off beat, a walking bass',
        phrasing: { shapes: { repeat: 2, triad: 2, call: 2 }, rhythm: 'syncopated', hook: 0.7 },
        tuneTempo: [130, 165], energy: 0.85,
        palette: { melody: ['trumpet', 'trombone', 'alto-sax', 'tenor-sax'], counter: ['trombone', 'trumpet'], bass: ['upright', 'pluck-bass'] },
        kits: ['tight-kit', 'funk-kit'], patterns: { bass: ['walking', 'synco'], drums: ['groove', 'onedrop'] }, orchestra: { pass: 0.4, double: 0 },
      },
    },
  },
  steppe: {
    about: "The Mongolian steppe: throat singing, a horse head fiddle, a plucked zither and a shaman's drum galloping. For plains, nomads and wide skies.",
    kinds: {
      plains: { name: 'Plains', tip: 'Plains: throat singing, a fiddle, a zither and a galloping drum' },
      gallop: {
        name: 'Gallop', tip: 'Gallop: the riders out on the plain: fast, the drum galloping hard, the fiddle and throat singers driving',
        phrasing: { shapes: { repeat: 2, triad: 2, wave: 1 }, rhythm: 'dotted', hook: 0.5 }, build: 0.5, busy: 0.1,
        tuneTempo: [130, 160], energy: 0.9, drums: [0.6, 1], patterns: { drums: ['gallop'] },
      },
      yurt: {
        name: 'Yurt', tip: "Yurt: night in a nomad's tent: the fire, a slow fiddle, a low throat singer droning, no drums",
        phrasing: { shapes: { chant: 3, wave: 1 }, rhythm: 'long', hook: 0 },
        style: 'ambient', drums: [0.05, 0.2], textures: ['fire', 'wind', 'crickets'],
        palette: { drone: ['kargyraa', 'throat-singing', 'cello-drone'], melody: ['erhu', 'flute', 'throat-singing'] },
      },
    },
  },
  gamelan: {
    about: 'Java and Bali: a bonang playing interlocking patterns, metallophones, a flute and drums, and the big gong closing each cycle. For temples, islands and dreams.',
    kinds: {
      court: { name: 'Court', tip: "Court: the bonang's kettle gongs interlocking, a flute, and the gong closing each cycle" },
      kebyar: {
        name: 'Kebyar', tip: 'Kebyar: Bali: faster and explosive, the metallophones racing',
        phrasing: { shapes: { zigzag: 2, repeat: 2, climb: 1 }, rhythm: 'running', hook: 0.6 }, busy: 0.15,
        tuneTempo: [120, 150], energy: 0.85, patterns: { arp: ['random', 'up', 'updown'] },
      },
      night: {
        name: 'Night garden', tip: 'Night garden: soft and slow: a flute floating over a few gongs, frogs and rain',
        phrasing: { shapes: { wave: 2, chant: 2 }, rhythm: 'long', hook: 0 },
        style: 'ambient', drums: [0.2, 0.4], palette: { melody: ['flute', 'vibes', 'bonang'] }, textures: ['frogs', 'rain', 'crickets'],
      },
    },
  },
  flamenco: {
    about: 'Andalusia: a nylon guitar strumming the Andalusian cadence over a cajón and clapping, a violin or trumpet crying in the phrygian dominant. For Spain, duels and passion.',
    kinds: {
      tablao: { name: 'Tablao', tip: 'Tablao: a guitar strumming the Andalusian cadence, a cajón, clapping and a crying violin' },
      rumba: {
        name: 'Rumba', tip: 'Rumba: quicker and sunnier, strummed and clapped, in a major key as often as not',
        phrasing: { shapes: { call: 2, zigzag: 2, repeat: 1 }, rhythm: 'syncopated', hook: 0.6 },
        scales: { phrygianDominant: 2, major: 1.5, harmonicMinor: 1 }, tuneTempo: [110, 135],
        chords: ['iv bIII bII I', 'I IV V I', 'i iv V i', 'I bII I -', 'I V vi IV'],
      },
      solea: {
        name: 'Soleá', tip: 'Soleá: a guitar alone, slow and grave, no drums',
        phrasing: { shapes: { dive: 2, sigh: 2, turn: 2 }, rhythm: 'long', hook: 0.1 }, build: 0,
        tuneTempo: [66, 86], energy: 0.4, drums: [0, 0.1],
        layers: { keys: 0.9, pad: 0.2, counter: 0.3, arp: 0.3, bells: 0, drone: 0.1, bass: 0.3 },
      },
    },
  },
  aztec: {
    about: 'Lost cities deep in the jungle: clay flutes and ocarinas over slit drums and a big hand drum, a death whistle screaming far off. For jungles, pyramids and lost cities.',
    kinds: {
      azteca: { name: 'Sun temple', tip: 'Sun temple: a city of gold at its height: ocarinas and pan pipes over slit drums, a marimba, strings and a horn' },
      ritual: {
        name: 'Ritual', tip: 'Ritual: atop the pyramid at night: drums and drones, a conch calling, the death whistle closer',
        phrasing: { shapes: { chant: 3, call: 2 }, rhythm: 'long', hook: 0.2 }, build: 0.5,
        energy: 0.5, dark: 0.65, layers: { melody: 0.5 }, textures: ['death-whistle', 'conch', 'fire'],
        palette: { melody: ['blown-bottle', 'ocarina', 'pan-flute'] }, patterns: { melody: ['long', 'fragments', 'calls'] },
      },
      rainforest: {
        name: 'Rainforest', tip: 'Rainforest: lush and green: marimbas and pan pipes over rain and birds, softer drums',
        phrasing: { shapes: { wave: 2, call: 2, pendulum: 1 }, rhythm: 'syncopated', hook: 0.4 },
        scales: { majorPentatonic: 2, minorPentatonic: 2, dorian: 1 }, energy: 0.5, bright: 0.6, dark: 0.3,
        textures: ['rainstick', 'birds', 'frogs'], patterns: { drums: ['march', 'sparse', 'pulse'] },
      },
    },
  },
  tribal: {
    about: 'Drums round a fire: drums, stamping and clapping, a mbira riff and a didgeridoo. For villages, rituals and the wild.',
    kinds: {
      firelight: { name: 'Firelight', tip: 'Firelight: drums, stamping and clapping, a mbira riff and a didgeridoo' },
      savanna: {
        name: 'Savanna', tip: 'Savanna: the plains as the sun comes up: a kalimba and a choir, open and bright, lighter drums',
        phrasing: { shapes: { triad: 2, call: 2, wave: 1 }, rhythm: 'even', hook: 0.4 }, patterns: { drums: ['tribal', 'groove'], melody: ['phrases', 'calls'] },
        scales: { majorPentatonic: 3, major: 1 }, energy: 0.55, bright: 0.7,
        palette: { pad: ['choir-ah', 'choir-oo'], melody: ['kalimba', 'marimba', 'flute', 'choir-oo'] }, layers: { pad: 0.9 },
        textures: ['birds', 'crickets'],
      },
      war: {
        name: 'War dance', tip: 'War dance: faster and harder: the drums driving in six, stamping, the didgeridoo growling',
        phrasing: { shapes: { repeat: 3, call: 2 }, rhythm: 'dotted', hook: 0.7 }, build: 0.6, busy: 0.1,
        meters: { '6/8': 3, '4/4': 2 }, tuneTempo: [120, 150], energy: 0.95, patterns: { drums: ['gallop', 'tribal'] },
      },
    },
  },
  egyptian: {
    about: 'Ancient Egypt: the double harmonic scale, a mizmar or oboe over a lyre and an oud, the darbuka playing with finger cymbals. For pyramids, tombs and the Nile.',
    kinds: {
      nile: { name: 'The Nile', tip: 'The Nile: a mizmar or oboe over a lyre and an oud, the darbuka and finger cymbals' },
      tomb: {
        name: 'Tomb', tip: 'Tomb: inside the pyramid: dark and slow, a low drone, a lyre in the dark, wind through the shafts',
        phrasing: { shapes: { chant: 2, turn: 2, sigh: 1 }, rhythm: 'long', hook: 0 },
        style: 'ambient', dark: 0.7, energy: 0.3, drums: [0.15, 0.4],
        palette: { melody: ['lyre', 'flute', 'oboe'] }, textures: ['wind'], patterns: { drums: ['pulse', 'sparse'] },
      },
      pharaoh: {
        name: 'Pharaoh', tip: 'Pharaoh: a royal procession: horns and a choir, strings, big drums, grand and slow',
        phrasing: { shapes: { triad: 2, leap: 2, turn: 1 }, rhythm: 'dotted', hook: 0.4 }, build: 0.6,
        energy: 0.75, edge: 0.8,
        palette: { melody: ['horn', 'trumpet', 'oboe', 'choir-oo'], pad: ['brass-section', 'strings', 'choir-ah'] },
        kits: ['darbuka-kit', 'orchestra-kit'], patterns: { drums: ['march', 'maqsum'] }, orchestra: { pass: 0.5, double: 0.15 },
      },
    },
  },
  antiquity: {
    about: 'Greece and Rome: a lyre and a harp, an aulos or pan pipes, horns for the legions, a temple choir, in the old modes. For temples, arenas and myths.',
    kinds: {
      agora: { name: 'Agora', tip: 'Agora: a lyre and a harp, an aulos or pan pipes and a temple choir' },
      legion: {
        name: 'Legion', tip: 'Legion: Rome on the march: horns and trumpets, a marching drum, the choir in unison',
        phrasing: { shapes: { triad: 3, repeat: 2 }, rhythm: 'dotted', hook: 0.5 }, build: 0.5,
        energy: 0.8, kits: ['orchestra-kit'],
        palette: { melody: ['horn', 'trumpet', 'trombone'], counter: ['horn', 'trombone'], pad: ['brass-section', 'choir-ah'] },
        patterns: { drums: ['march'] },
      },
      olympus: {
        name: 'Olympus', tip: "Olympus: the gods' home: a lyre and a choir in a bright mode, no drums, light as air",
        phrasing: { shapes: { climb: 2, arch: 2, wave: 1 }, rhythm: 'long', hook: 0 },
        style: 'ambient', scales: { lydian: 2, mixolydian: 1, dorian: 1 }, drums: [0, 0.15],
        palette: { melody: ['lyre', 'pan-flute', 'choir-oo', 'flute'], pad: ['choir-oo', 'choir-ah', 'strings'] },
      },
    },
  },
  medieval: {
    about: 'Castles and taverns: a bagpipe, recorder or shawm, a harpsichord or lyre for the lute, a bassoon and a tabor. For castles, markets and knights.',
    kinds: {
      market: { name: 'Market', tip: 'Market: a bagpipe, recorder or shawm over a harpsichord, a bassoon and a tabor' },
      courtdance: {
        name: 'Court dance', tip: 'Court dance: a Renaissance court: recorders and a harpsichord, a stately pavane or a quick galliard',
        phrasing: { shapes: { wave: 2, turn: 2, arch: 1 }, rhythm: 'dotted', hook: 0.4 },
        meters: { '3/4': 3, '4/4': 2 }, drums: [0.1, 0.6], kits: ['hand-drums'],
        palette: { melody: ['whistle', 'flute', 'oboe', 'bowed-psaltery'], keys: ['harpsichord', 'lyre'] }, patterns: { drums: ['march', 'pulse'] },
      },
      chant: {
        name: 'Chant', tip: 'Chant: a monastery at vespers: a choir chanting over an organ drone, slow and holy',
        phrasing: { shapes: { chant: 4, arch: 1 }, rhythm: 'long', hook: 0, pickup: 0 }, busy: -0.15,
        style: 'ambient', kits: [], layers: { melody: 0.9 },
        palette: { melody: ['choir-oo'], pad: ['choir-ah', 'organ'], drone: ['organ-drone', 'cello-drone'] },
        patterns: { melody: ['long', 'phrases'] },
      },
    },
  },
  wasteland: {
    about: 'Dust, heat and ruins at the edge of nowhere: a twangy guitar, a harmonica or a lonely trumpet, a saloon piano, scrap metal drums and the wind. For deserts, ruins and outlaws.',
    kinds: {
      frontier: { name: 'Frontier', tip: 'Frontier: a twangy guitar, a harmonica or trumpet, scrap metal drums and the wind' },
      western: {
        name: 'High noon', tip: 'High noon: two figures facing each other down a dusty street: a whistled tune, a trumpet, a twangy guitar, a whip of the snare',
        phrasing: { shapes: { leap: 3, dive: 2, chant: 1 }, rhythm: 'long', hook: 0.4 },
        tuneTempo: [90, 120], richness: [0, 0.2], chords: ['i bVII bVI V', 'i iv i V', 'i - bVI V', 'i bIII bVII iv'],
        palette: { melody: ['whistle', 'trumpet', 'harmonica'], guitar: ['clean-guitar'] }, patterns: { drums: ['train', 'march'] },
      },
      radio: {
        name: 'Old radio', tip: 'Old radio: a 1940s record playing in the ruins: a crooning clarinet or muted trumpet, a piano, a swing beat, crackle',
        phrasing: { shapes: { arch: 2, sigh: 2, call: 1 }, rhythm: 'dotted', hook: 0.4, pickup: 0.7 },
        scales: { major: 3, mixolydian: 0.5 }, chords: ['I vi ii V', 'Imaj7 vi7 ii7 V7', 'I I7 IV iv', 'I II7 V7 I'], richness: [0.4, 0.8],
        swing: 0.9, swingAmount: [0.4, 0.6], bright: 0.5, dark: 0.2, edge: 0.7, fx: { wobble: 0.5, drive: 0.2 },
        palette: { melody: ['mute-trumpet', 'clarinet', 'piano', 'vibes'], keys: ['piano', 'honky-tonk'] },
        textures: ['vinyl'], kits: ['brushes', 'jazz-kit'], layers: { guitar: 0.2 },
        patterns: { drums: ['swing', 'brush'], bass: ['walking', 'rootfifth'] },
      },
    },
  },
  underwater: {
    about: 'Under the sea, from the dark deep to a reef party: wine glasses and glassy pads, harps and vibes rippling, whale song and bubbles.',
    kinds: {
      deep: { name: 'The deep', tip: 'The deep: slow, wide and wavering: wine glasses, glassy pads, a whale calling far off' },
      reef: {
        name: 'Reef party', tip: 'Reef party: everyone dancing on the reef: steel drums and marimbas on a calypso bounce, horns, a walking bass',
        phrasing: { shapes: { call: 3, repeat: 2, zigzag: 1 }, rhythm: 'syncopated', hook: 0.8 },
        style: 'tune', scales: { major: 3, mixolydian: 1, majorPentatonic: 1 }, tuneTempo: [108, 128], meters: { '4/4': 1 },
        chords: ['I IV V IV', 'I vi IV V', 'I IV I V', 'I V vi IV', 'ii V I -'], richness: [0.15, 0.5],
        energy: 0.75, bright: 0.8, dark: 0.05, edge: 0.75, swing: 0.4,
        palette: {
          melody: ['steel-drum', 'marimba', 'trumpet', 'flute', 'xylophone'], counter: ['trombone', 'marimba', 'vibes'], keys: ['marimba', 'steel-drum', 'nylon'],
          arp: ['marimba', 'steel-drum', 'xylophone'], bass: ['tuba', 'upright', 'pluck-bass'], pad: ['brass-section', 'strings', 'warm-pad'],
        },
        kits: ['hand-drums', 'latin-kit', 'soft-kit'], drums: [0.3, 0.95], textures: ['bubbles', 'ocean'],
        patterns: { drums: ['groove', 'tribal', 'bossa'], bass: ['walking', 'rootfifth', 'synco'], keys: ['strum', 'block', 'skank'], melody: ['phrases', 'riff', 'calls'] },
        orchestra: { pass: 0.4, double: 0.3 },
      },
      lagoon: {
        name: 'Lagoon', tip: 'Lagoon: sunlit shallows: a nylon guitar and vibes, a gentle bossa, waves on the shore',
        phrasing: { shapes: { wave: 3, arch: 1 }, rhythm: 'syncopated', hook: 0.3 },
        tuneTempo: [84, 104], bright: 0.6, drums: [0.1, 0.6],
        palette: { melody: ['vibes', 'flute', 'nylon', 'wine-glass'], keys: ['nylon', 'vibes'] },
        kits: ['latin-kit', 'soft-kit'], textures: ['ocean', 'bubbles', 'birds'], patterns: { drums: ['bossa', 'pulse'], keys: ['bossa', 'broken'] },
      },
      sunken: {
        name: 'Sunken city', tip: 'Sunken city: Atlantis in ruins: a choir and a harp in the deep, in old, strange modes, slow bells',
        phrasing: { shapes: { chant: 2, sigh: 2, wave: 1 }, rhythm: 'long', hook: 0 }, patterns: { melody: ['long', 'phrases'], pad: ['swell', 'sustain'] },
        scales: { dorian: 2, lydian: 1, phrygian: 1 }, dark: 0.45,
        palette: { melody: ['choir-oo', 'wine-glass', 'glass-bell'], pad: ['choir-ah', 'glass-pad', 'dark-pad'], bells: ['glass-bell', 'bell', 'sine-bell'] },
        textures: ['whale', 'bubbles'],
      },
    },
  },
  pirate: {
    about: 'Pirates on the high seas, from a rowdy shanty below decks to a swashbuckling film score. For ships, islands and treasure.',
    kinds: {
      shanty: { name: 'Shanty', tip: 'Shanty: an accordion and a fiddle, a tuba, the crew stamping a jig, the sea and the timbers creaking' },
      swashbuckler: {
        name: 'Swashbuckler', tip: 'Swashbuckler: cannon smoke and a duel in the rigging: strings driving in 6/8, horns blazing the tune, big drums, minor',
        phrasing: { shapes: { leap: 3, triad: 2, climb: 1 }, rhythm: 'dotted', hook: 0.5 }, build: 0.5,
        scales: { minor: 3, harmonicMinor: 1, dorian: 1 }, meters: { '6/8': 5, '4/4': 2, '3/4': 1 }, tuneTempo: [110, 140],
        chords: ['i bVI bVII i', 'i iv V i', 'i bVII bVI V', 'i - bVI bVII', 'i v bVI bVII'],
        energy: 0.9, dark: 0.5, edge: 0.85,
        palette: { melody: ['horn', 'violin', 'trumpet'], counter: ['horn', 'trombone', 'violin'], pad: ['strings', 'brass-section', 'choir-ah'], keys: ['pizzicato', 'piano'], arp: ['pizzicato', 'harp'], bass: ['upright', 'tuba', 'bassoon'] },
        kits: ['orchestra-kit', 'taiko'], layers: { pad: 1, counter: 0.6 },
        patterns: { drums: ['march', 'tribal'], pad: ['pulse', 'stabs', 'sustain'], bass: ['octave', 'pulse'] }, orchestra: { pass: 0.5, double: 0.2 },
      },
      calmseas: {
        name: 'Calm seas', tip: 'Calm seas: night on deck: a lone fiddle or accordion, the waves and the creak of the ship, slow and in three',
        phrasing: { shapes: { wave: 3, sigh: 1 }, rhythm: 'dotted', hook: 0.2 },
        style: 'ambient', meters: { '3/4': 3, '6/8': 2 }, drums: [0.05, 0.25], tuneTempo: [76, 96], energy: 0.35, textures: ['ocean', 'creaks'],
      },
      ghost: {
        name: 'Ghost ship', tip: 'Ghost ship: cursed pirates: an organ and an accordion wheezing out of tune, a choir moaning, fog',
        phrasing: { shapes: { sigh: 2, dive: 2, turn: 1 }, rhythm: 'dotted', hook: 0.3 }, meters: { '3/4': 3, '6/8': 2, '4/4': 1 }, patterns: { keys: ['waltz', 'broken'] },
        scales: { harmonicMinor: 2, phrygian: 1, minor: 1 }, dark: 0.7, fx: { wobble: 0.5 },
        palette: { melody: ['accordion', 'violin', 'music-box'], pad: ['organ', 'haunted-pad', 'choir-ah'] }, textures: ['creaks', 'ocean', 'wind'],
      },
    },
  },
  space: {
    about: 'Outer space: analog pads drifting, sine bells like distant signals, the void humming, in lydian and the whole tone scale. For stars, stations and the unknown.',
    kinds: {
      drift: { name: 'Drift', tip: 'Drift: analog pads, sine bells and the void humming' },
      station: {
        name: 'Space station', tip: 'Space station: a busy orbital base: arps pulsing, a steady drum machine, bright synths',
        phrasing: { shapes: { repeat: 2, zigzag: 2, climb: 1 }, rhythm: 'running', hook: 0.6 },
        style: 'tune', energy: 0.65, drums: [0.3, 0.9], layers: { arp: 0.7 },
        patterns: { drums: ['four', 'groove', 'halftime'], arp: ['up', 'updown'] },
      },
      alien: {
        name: 'Alien world', tip: 'Alien world: strange and hostile: the whole tone scale, bowed metal, metal pings, the void',
        phrasing: { shapes: { zigzag: 2, chant: 2, dive: 1 }, rhythm: 'long', hook: 0 }, patterns: { melody: ['fragments', 'long'] },
        scales: { wholeTone: 2, phrygian: 1, locrian: 0.5 }, dark: 0.65, methods: { bank: 2, chromatic: 2, vamp: 1 },
        palette: { melody: ['wine-glass', 'sine-bell', 'soft-lead'], bells: ['metal-ping', 'glass-bell'], drone: ['bowed-metal', 'void', 'deep-drone'] },
        textures: ['hum', 'geiger'],
      },
    },
  },
  ironcity: {
    about: "A city under an iron fist: brooding low strings and brass, a sneaking riff and a beat that's half orchestra and half machine. Serious, but fun to listen to. For palaces, guards and getting up to no good.",
    kinds: {
      palace: { name: "Tyrant's palace", tip: "Tyrant's palace: marble halls and armed guards: brooding low strings and a bass hook, a dark pizzicato or marimba riff, brass stabs and a choir, over a half machine beat" },
      bughunt: {
        name: 'Pest control', tip: 'Pest control: an odd job round the city, up to no good: a sneaky, bouncy groove, pizzicato and a bassoon, a clarinet tune, a funky little beat',
        phrasing: { shapes: { zigzag: 2, repeat: 2, turn: 2 }, rhythm: 'snap', hook: 0.6 },
        scales: { dorian: 2, minor: 1, mixolydian: 1 }, tuneTempo: [104, 124], energy: 0.7, dark: 0.35, edge: 0.7, swing: 0.3,
        palette: { melody: ['clarinet', 'oboe', 'pizzicato', 'marimba', 'mute-trumpet'], keys: ['pizzicato', 'marimba', 'xylophone'], bass: ['bassoon', 'tuba', 'upright', 'pluck-bass'] },
        kits: ['tight-kit', 'clockwork', 'funk-kit'], patterns: { drums: ['groove', 'funk', 'march'], bass: ['walking', 'hook', 'synco'], melody: ['calls', 'phrases'] },
      },
      factory: {
        name: 'Factory floor', tip: 'Factory floor: the dark, industrial edge of the city: metal percussion clanking, a pulsing synth bass, steam and machines',
        phrasing: { shapes: { repeat: 3, dive: 2 }, rhythm: 'running', hook: 0.7 },
        energy: 0.75, edge: 1, kits: ['junk-kit', 'machine'], textures: ['factory', 'steam', 'clanks'],
        palette: { melody: ['synth-brass', 'saw-lead', 'pluck-lead', 'horn'], bass: ['reese', 'synth-bass', 'growl-bass'], arp: ['pluck-lead', 'pizzicato', 'marimba'], pad: ['dark-pad', 'analog-pad', 'synth-strings'] },
        patterns: { drums: ['groove', 'march', 'break'], bass: ['pulse', 'octave', 'synco'], arp: ['up', 'updown'] },
      },
      prison: {
        name: 'Prison', tip: 'Prison: a slow, heavy march down the cell block: low brass and a choir, chains rattling and water dripping in the cells',
        phrasing: { shapes: { chant: 2, sigh: 2 }, rhythm: 'long', hook: 0 }, build: 0.4,
        style: 'ambient', tempo: [56, 70], energy: 0.4, dark: 0.75, kits: ['orchestra-kit', 'junk-kit'], drums: [0.4, 0.8], textures: ['chains', 'drips', 'clanks'],
        palette: { melody: ['horn', 'violin', 'oboe', 'felt-keys'], pad: ['strings', 'choir-ah', 'dark-pad'] }, patterns: { drums: ['march', 'halftime', 'sparse'] },
      },
    },
  },
};
