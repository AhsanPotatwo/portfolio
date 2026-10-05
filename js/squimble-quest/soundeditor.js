// the sound editor: a full screen synthesiser for making and changing the sounds and voices in the
// libraries (SOUNDS and VOICES, sound.js). open it from the map editor's Sounds or Voices tab (New,
// Edit, or right click one in the palette), from a sound block's settings (Edit sound), or from an
// npc's settings (Edit voice, New voice).
//   - top: the name, whether it's a Sound (for sound blocks) or a Voice (for npcs), Undo, Cancel and
//     Save. saving under a different name makes a copy
//   - left: the visualiser (a close-up of the wave and the whole sound, both from the real audio),
//     Play / Stop / Loop, a piano that plays the sound at other notes, and the "make one" buttons in
//     kinds (Game, Magic, Sci-fi, Things, Motors, Squishy, Birds, Beasts, Breath, Nature, Voices),
//     each coming up with a random sound of that kind (like sfxr and bfxr), plus Random and Mutate
//   - right: a button for each wave (file picks an mp3, wav or ogg), then tabs of sliders. Character
//     has the knobs of the make one kind the sound came from (trill for a bird, growl for a beast),
//     which make it again with that changed. Pitch, Volume, Tone & effects and Voice have a slider for
//     every SOUND_SETTINGS entry under its section's heading. a tab with a dot has settings that
//     aren't normal. the Voice tab has a Say box, which plays the sound talking (how npcs with this as
//     their voice sound)
// hover over anything for a tip along the bottom. right click a slider to put it back to normal, or
// scroll over it to nudge it. with Loop on, changing anything while it plays starts it again straight
// away, so you can hear what a slider does while you drag it. Save changes the sound in the game
// straight away, and Export (next to New in the inspector) downloads sounds.json and any audio files
// chosen since the page loaded. it's a ui group over the whole screen, like the warp graph
// (warpgraph.js), and the map editor hands it the updates while it's open (Editor.update())
//
// ---------- how it's put together ----------
//
// everything's made fresh in open() and thrown away in close() (UI.removeGroup('sound-editor')).
// the sound being edited is SoundEditor.draft, a plain settings object, and every part works off it:
//   - each slider's onChange writes its value into the draft
//   - the wave buttons, make one buttons, Random, Mutate and Choose file go through replace(), which
//     swaps in a whole new draft, moves every slider to match, and plays it
//   - a make one button also keeps its recipe (generate()): its knobs and a seed for its random
//     numbers. a knob changes the recipe and makes the draft again from it (remake()), keeping
//     anything changed by hand since, and plays it once the mouse is let go. Random and Choose file
//     forget the recipe
//   - update() saves the draft for Undo whenever it's changed and the mouse is let go (so a whole
//     slider drag is one Undo), greys out sliders that don't matter right now, and restarts the loop
//     preview when the draft changes
//   - SoundVisualiser reads the draft every frame (and Sound.render() keeps the samples, so a draft
//     that hasn't changed isn't worked out again)
//   - Save copies the draft into SOUNDS or VOICES, by its kind (setSound() in sound.js). nothing else
//     touches the libraries
// all the sliders (and every kind's knobs) are made at once, and showParts() shows and hides them
// (each has a .tab, and knobs a .knobsOf)
//
// ---------- known problems ----------
//
//   - the history is cleared every time the editor opens, and every nudge of the scroll wheel is its
//     own Undo
//   - the name box shows what you typed, but the sound is saved under the cleaned up name
//     (cleanMapName() in mapfile.js), so "My Sound" saves as "my-sound" (it says so next to the box).
//     names are 20 letters at most
//   - there's no renaming or deleting. saving under a new name makes a copy, and deleting is by hand
//     in sounds.json (see the sounds README)
//   - switching an existing sound to a voice (or back) moves it to the other library when it's saved,
//     so sound blocks using it go silent (and red), and so do npcs using a voice made a sound
//   - with Loop on, every change restarts the sound, and the old one fades out in about 15 ms, so you
//     can hear a tiny blip each restart while dragging. that's the restart, not the loop itself
//   - dragging a slider works the sound out again every frame (for the picture). long sounds (a few
//     seconds, or lots of repeats) can make it stutter while you drag
//   - two different files with the same file name: the second one replaces the first. sounds that
//     were already worked out with the first one (Sound.render() keeps them) can keep playing the old
//     audio until their settings change or the page reloads. giving files different names avoids it
//   - a file chosen and then cancelled stays loaded until the page reloads (it isn't exported unless
//     a saved sound uses it)
//   - the layout is fixed numbers (SOUND_EDITOR). each tab has room for about 13 sliders a column,
//     each kind of make one button for 15, and the kinds' tabs for 12
//   - the knobs aren't saved, so a saved sound opens with an empty Character tab, and Undo doesn't
//     move them back. after an Undo, moving a knob counts the undone changes as changed by hand
//   - while it's open Input.typing is on (for the text boxes), so dev mode keys don't work, apart from
//     Ctrl + D, which closes everything
//
// ---------- ideas for later ----------
//
//   - playing the piano with the keyboard (it'd need the text boxes to only take keys while clicked)
//   - a picture of the volume shape (fade in, hold, punch, fade out) as a line over the whole sound
//   - copy and paste a sound's settings, or a "compare" button that flips between two versions
//   - Delete and Rename buttons. rename would need to fix every sound block on every map
//   - "lock" a slider so Random and Mutate leave it alone (bfxr has this)
//   - save the recipe with a sound (its kind, maker, knobs and seed), so its knobs come back when it
//     opens again

// layout, in screen px. the game is always 960 x 540, so these are just where things go
const SOUND_EDITOR = {
  headerHeight: 36,
  footerHeight: 30,
  // the left column, and where its parts go down it
  left: 16,
  leftWidth: 300,
  visualiserTop: 44,
  visualiserHeight: 136,
  playTop: 186,
  pianoTop: 216,
  pianoHeight: 44,
  // the make one kinds go in two rows of tabs, then the buttons in rows of 3
  makersTop: 268,
  // the right side: where it starts, each column of sliders' width, and the gap between columns
  right: 336,
  columnWidth: 296,
  columnGap: 16,
  // the wave buttons, in rows of waveColumns
  wavesTop: 56,
  waveColumns: 7,
  tabsTop: 116,
  // where the sliders start, each slider's height, and the room for a section's heading
  slidersTop: 150,
  rowHeight: 24,
  sectionHeight: 20,
  // the tabs of sliders: two columns of SOUND_SETTINGS sections each, and a line of help under them.
  // Character is different: its sliders are the knobs of the make one kind the sound came from
  // (SOUND_GENERATORS), and empty says what to do when it didn't come from one
  tabs: [
    { name: 'Character', columns: [], hint: 'These sliders change the sound the way its kind would change, and the rest of the sliders follow. Anything you\'ve changed in the other tabs since stays as you set it. They only last while the editor is open, they\'re not saved with the sound.', empty: 'Press one of the Make one buttons on the left and sliders for that kind of sound appear here: trill and rasp for a bird, growl for a beast, pressure for a potion. They only last while the editor is open, so a saved sound opens without them.' },
    { name: 'Pitch', columns: [['Pitch', 'Wobble'], ['Jumps']], hint: 'Everything here is in notes, so the piano moves it all together. Slides, wobbles and jumps start again on every repeat.' },
    { name: 'Volume', columns: [['Volume shape', 'Output'], ['Tremolo', 'Crackle']], hint: 'One beep is fade in, hold and fade out, and repeats play it again after the gap. Tremolo and crackle chop the volume up while it plays. For a smooth loop, use no fade in or out.' },
    { name: 'Tone & effects', columns: [['Filters', 'Square wave'], ['FM', 'Flanger', 'Echo', 'Crunch']], hint: 'Square wave and FM change the wave itself, then it goes through the filters and the effects in the order they\'re listed.' },
    { name: 'Voice', columns: [['Voice'], ['Talking']], hint: 'The Voice settings shape the voice wave. Talking works with any wave, so a blip can talk too, like in old games. Save it as a Voice, then right click an npc in the map editor to give it this voice.' },
  ],
  // the piano's lowest note (note numbers like noteFrequency() in sound.js, 48 is C4) and how many
  // white keys it has (15 is two octaves)
  pianoFrom: 48,
  whiteKeys: 15,
  // what the Say box starts with
  sayText: 'Hello there! Have you seen my squimble anywhere?',
};

// ---------- the make one buttons ----------
//
// SOUND_GENERATORS has the kinds of make one button (the little tabs above them). each kind has its
// makers (the buttons) and its knobs (its sliders in the Character tab), which change the sound in
// ways that make sense for that kind: trill and rasp for birds, growl for beasts, pressure for
// squishy things, age for voices. pressing a maker picks the knobs (a maker can give a knob a number,
// a [low, high] range to pick from, or a function), then the kind's make(knobs, maker) turns them
// into settings. moving a knob runs make again with the same random numbers (generate() and
// remake()), so it's the same sound, just changed. kinds work one of two ways:
//   built     Birds, Beasts, Breath and Motors: the knobs are the sound. make builds the settings
//             from them (bird(), beast(), breathing(), machine()), and a maker is just its knobs
//   tweaked   the rest: each maker makes its own random sound (its make()), and the knobs change it
//             afterwards. at their normal values they leave it alone
// a new maker is a new line (its button appears by itself, 3 a row, 15 fit in a kind), and a new
// kind is a new entry (its tab appears by itself, 2 rows fit 12). the numbers are just what sounded
// right. settings can come out past a slider's range, they get pulled back in (soundSettings()).
// heard from stays what it was unless the maker gives it. the Voices makers say the Say box's words
// instead of just playing

// the random numbers the makers use. Math.random, apart from while a sound is being made from a maker
// (makeRecipe()), when it's a seeded one (seededRandom() in sound.js), so a knob can make the same
// sound again with one thing changed. it's not the game's randomness, so it isn't randomBetween()
let makerRandom = Math.random;
// a random number from a to b, rounded to one decimal place
const randomNumber = (a, b) => Math.round((a + makerRandom() * (b - a)) * 10) / 10;
// one thing from a list at random
const randomPick = (list) => list[Math.floor(makerRandom() * list.length)];
// value half the time, otherwise undefined (which leaves that setting normal)
const sometimes = (value) => (makerRandom() < 0.5 ? value : undefined);
// value up or down at random
const eitherWay = (value) => (makerRandom() < 0.5 ? -value : value);
// a voice for the Voices buttons: a short syllable (it's played once per syllable when talking), on
// top of the voice's own settings
const voiceSettings = (settings) => ({ wave: 'voice', attack: randomNumber(8, 15), sustain: randomNumber(45, 75), decay: randomNumber(40, 70), vowel: randomNumber(0, 2), ...settings });

// a knob: a Character tab slider, set up like a SOUND_SETTINGS entry. 0 to 100 % unless it says
const knob = (key, label, tip, more = {}) => ({ key, label, tip, min: 0, max: 100, step: 1, curve: 'linear', unit: '%', normal: 50, ...more });
// a knob from -100 to 100, 0 in the middle
const twoWayKnob = (key, label, tip, more = {}) => knob(key, label, tip, { min: -100, max: 100, normal: 0, ...more });
// a knob that picks one of some options, shown by name
const choiceKnob = (key, label, tip, options) => knob(key, label, tip, { max: options.length - 1, unit: '', normal: 0, options });
// knobs a few kinds share
const PITCH_KNOB = knob('pitch', 'Pitch', 'Moves the whole sound up or down by this many notes', { min: -24, max: 24, normal: 0, unit: 'notes' });
const LENGTH_KNOB = knob('length', 'Length', 'Stretches or squashes it in time, keeping its shape (slides still cover the same notes)', { min: 25, max: 400, step: 5, curve: 'log', normal: 100 });

// a setting from some partial settings, or its normal value if they don't have it
const settingOf = (s, key) => s[key] ?? SOUND_DEFAULTS[key];

// moved up or down by some notes
function shifted(s, notes) {
  return notes ? { ...s, pitch: settingOf(s, 'pitch') * 2 ** (notes / 12) } : s;
}

// stretched in time (2 is twice as long), keeping its shape: slides and sweeps still go as far
function stretched(s, times) {
  if (times === 1) return s;
  const out = { ...s };
  for (const key of ['attack', 'sustain', 'decay', 'gap', 'jumpAt', 'jump2At', 'jumpRepeat']) out[key] = settingOf(s, key) * times;
  for (const key of ['slide', 'pulseSweep', 'lowPassSweep', 'highPassSweep', 'flangerSweep', 'vowelSlide']) out[key] = settingOf(s, key) / times;
  out.slideAccel = settingOf(s, 'slideAccel') / times ** 2;
  return out;
}

// with an echo from amount (0 to 100), from shortest to longest ms, unless it already has a longer one
function echoed(s, amount, shortest, longest) {
  if (!amount) return s;
  return { ...s, echo: Math.max(settingOf(s, 'echo'), shortest + ((longest - shortest) * amount) / 100), echoFeedback: 25 + amount * 0.35 };
}

// slide and slide speed-up for a curve over some seconds: sweep (-100 to 100) ends up to an octave
// lower or higher, and arch (-100 to 100) bows the middle up or down by up to 6 notes
function contour(seconds, sweep, arch) {
  const end = (sweep / 100) * 12;
  const middle = (arch / 100) * 6;
  return { slide: (end + 4 * middle) / seconds, slideAccel: (-8 * middle) / seconds ** 2 };
}

// a bird from the Birds knobs. a call is one beep and calls are its repeats
const BIRD_VOICES = ['whistle', 'reed', 'rasp', 'hoot'];
function bird(k) {
  const voice = BIRD_VOICES[k.voice];
  // 20 ms to 800 ms
  const seconds = 0.02 * 40 ** (k.length / 100);
  const hoot = voice === 'hoot';
  const trillSpeed = 12 + k.trillSpeed * 0.38;
  const s = {
    wave: { whistle: 'sine', reed: 'voice', rasp: 'voice', hoot: 'triangle' }[voice],
    // 200 Hz to 5000 Hz
    pitch: 200 * 25 ** (k.size / 100),
    ...contour(seconds, k.sweep, k.arch),
    attack: seconds * (hoot ? 250 : 60),
    sustain: seconds * 450,
    decay: seconds * (hoot ? 300 : 490),
    repeats: k.calls,
    gap: 10 + k.gap * 4,
    repeatPitch: k.phrase * 0.04,
    vibrato: k.trill * 0.03,
    vibratoSpeed: trillSpeed,
    tremolo: k.trill * 0.5,
    tremoloSpeed: trillSpeed,
    wander: k.rasp * 0.025,
    wanderSpeed: 700,
    growl: k.rasp * 0.5,
    volume: 50,
    range: 12,
  };
  // a small mouth rings high, which sounds nasal. rasp is a crow's rough caw
  if (voice === 'reed') Object.assign(s, { vowel: 1.6, mouth: 45, breath: 15 + k.rasp * 0.3, volume: 20 + k.size * 1.3 });
  if (voice === 'rasp') Object.assign(s, { vowel: 0.3, mouth: 55, breath: 35 + k.rasp * 0.3, wander: 1.2 + k.rasp * 0.015, wanderSpeed: 600 });
  if (hoot) s.lowPass = 55;
  return s;
}

// a creature from the Beasts knobs, mostly the voice wave (a throat and mouth) with a growl
const BEAST_ANATOMY = ['throat', 'beak', 'gills', 'shell', 'spirit', 'clockwork', 'dog'];
function beast(k) {
  const anatomy = BEAST_ANATOMY[k.anatomy];
  // 80 ms to 2.5 s
  const seconds = 0.08 * 31 ** (k.length / 100);
  const flutterSpeed = 8 + k.flutter * 0.2;
  const s = {
    wave: anatomy === 'shell' ? 'sawtooth' : 'voice',
    // 30 Hz to 1200 Hz
    pitch: 30 * 40 ** (k.pitch / 100),
    mouth: 40 + k.size * 1.2,
    // the vowel it starts on, and how far it moves through the vowels in each call
    vowel: { throat: 0, beak: 2, gills: 4, shell: 0, spirit: 4, clockwork: 1, dog: 3.3 }[anatomy],
    vowelSlide: ((k.evolution / 100) * 3) / seconds,
    ...contour(seconds, k.bend, k.arch),
    attack: Math.max(10, seconds * 120),
    sustain: seconds * 500,
    decay: seconds * 380,
    repeats: k.calls,
    gap: seconds * 350,
    growl: k.growl * 0.9,
    wander: k.growl * 0.015,
    wanderSpeed: 150 + k.growl * 3,
    breath: k.breath * 0.9,
    vibrato: k.flutter * 0.015,
    vibratoSpeed: flutterSpeed,
    tremolo: k.flutter * 0.6,
    tremoloSpeed: flutterSpeed,
    lowPass: 80,
    volume: 65 + Math.abs(k.pitch - 60) * 0.6,
    range: 12,
  };
  if (anatomy === 'beak') Object.assign(s, { mouth: s.mouth * 0.75, highPass: 15, lowPass: 100, volume: s.volume * 0.8 });
  // bubbling through water
  if (anatomy === 'gills') Object.assign(s, { flanger: 3, crackle: 40, crackleLength: 30, crackleDepth: 35 });
  // an insect rubbing its wings or legs: a buzz chopped up fast
  if (anatomy === 'shell') Object.assign(s, { tremolo: 100, tremoloSpeed: 25 + k.flutter * 0.5, highPass: 35, lowPass: 85, resonance: 40, volume: 55 });
  if (anatomy === 'spirit') Object.assign(s, { breath: Math.max(s.breath, 45), vibrato: s.vibrato + 0.4, echo: 160, echoFeedback: 35, lowPass: 100 });
  if (anatomy === 'clockwork') Object.assign(s, { crush: 40, fm: 12, fmRatio: 2 });
  // a dog's (or wolf's) muzzle: a darker, rounder mouth than a person's, rough jitter that follows
  // growl (what makes a bark harsh rather than a voice saying ah), and short calls start with a snap
  if (anatomy === 'dog') Object.assign(s, { attack: Math.max(4, seconds * 80), punch: Math.max(0, 60 - seconds * 200), lowPass: 75, wander: 0.2 + k.growl * 0.025, wanderSpeed: 900, volume: s.volume * 0.75 });
  return s;
}

// breathing from the Breath knobs: the voice wave turned all the way to air, so the mouth shapes the
// hiss. snore lets some buzz back in, and rattles it
const BREATH_WAYS = ['in', 'out', 'in and out'];
function breathing(k) {
  const way = BREATH_WAYS[k.way];
  // 120 ms to 3.6 s
  const seconds = 0.12 * 30 ** (k.length / 100);
  const effort = k.effort / 100;
  // fade in, hold and fade out as parts of the breath: in builds up and stops, out starts strong
  // and fades away
  const shape = { in: [0.6, 0.25, 0.15], out: [0.08, 0.25, 0.67], 'in and out': [0.3, 0.4, 0.3] }[way];
  const s = {
    wave: 'voice',
    pitch: 70 + (100 - k.throat) * 0.6,
    breath: 100 - k.snore * 0.65,
    mouth: 60 + k.throat * 0.9,
    // in is a brighter ee, out a softer ah, and in and out goes from one to the other
    vowel: way === 'out' ? 0.3 : 2.4,
    vowelSlide: way === 'in and out' ? -2.1 / seconds : 0,
    attack: seconds * shape[0] * 1000,
    sustain: seconds * shape[1] * 1000,
    decay: seconds * shape[2] * 1000,
    // a hard breath out starts with a push
    punch: way === 'out' ? effort * 40 : 0,
    repeats: k.breaths,
    gap: seconds * 250,
    lowPass: 55 + effort * 40,
    lowPassSweep: (way === 'in' ? 15 : -15) / seconds,
    highPass: way === 'in' ? 25 : 12,
    crackle: k.rasp > 0 ? 300 : 0,
    crackleLength: 4,
    crackleDepth: k.rasp * 0.7,
    tremolo: k.tremble * 0.45,
    tremoloSpeed: 9,
    growl: k.snore * 0.7,
    wander: k.snore * 0.01,
    wanderSpeed: 300,
    // out (an ah) rings louder than in (an ee), in and out dips in the middle, and a low snore is
    // quieter than air, so they're evened out
    volume: (30 + effort * 50 + k.snore * 0.5) * { in: 1, out: 0.7 + k.snore * 0.005, 'in and out': 1.4 }[way],
    range: 6,
  };
  // a snore's rattle
  if (k.snore * 0.6 > s.tremolo) Object.assign(s, { tremolo: k.snore * 0.6, tremoloSpeed: 28 });
  // in and out is one beep with a dip in the middle: tremolo all the way down, once a breath, so
  // tremble can't use it
  if (way === 'in and out') Object.assign(s, { tremolo: 100, tremoloSpeed: 1 / seconds });
  if (k.space > 0) Object.assign(s, { echo: 25 + k.space * 0.6, echoFeedback: 20 + k.space * 0.45, flanger: k.space * 0.03 });
  return s;
}

// the Motors machines: their wave, their pitch and how fast they chop (tremolo speed) at middle speed
// and size, and anything else they need
const MACHINES = {
  motor: { wave: 'sawtooth', pitch: 200, chop: 40, tremolo: 10, highPass: 15, lowPass: 75, fm: 8, fmRatio: 1 },
  engine: { wave: 'sawtooth', pitch: 55, chop: 20, tremolo: 45, lowPass: 45, resonance: 20 },
  drill: { wave: 'square', pitch: 600, chop: 30, tremolo: 25, pulseWidth: 30, highPass: 25, lowPass: 80, crush: 15 },
  fan: { wave: 'pink', pitch: 600, chop: 8, tremolo: 55, lowPass: 55, resonance: 20 },
  chainsaw: { wave: 'sawtooth', pitch: 110, chop: 35, tremolo: 40, wander: 0.8, wanderSpeed: 600, crush: 20, lowPass: 65, resonance: 35 },
  // gears are ticks (repeats) rather than a hum, chop of them a second
  gears: { wave: 'metal', pitch: 1800, chop: 8, highPass: 30 },
  hum: { wave: 'organ', pitch: 110, chop: 0, lowPass: 60 },
};

// a machine from the Motors knobs. it runs steadily and loops, unless Spin makes it spin up or down
function machine(k) {
  const name = Object.keys(MACHINES)[k.machine];
  const { pitch, chop, ...rest } = MACHINES[name];
  // a quarter to 4 times as fast, and bigger is lower
  const fast = 2 ** ((k.speed - 50) / 25);
  const big = 2 ** ((50 - k.size) / 33);
  const s = { ...rest, pitch: pitch * fast * big, tremoloSpeed: chop * fast, attack: 0, sustain: 2000, decay: 0, volume: 65, range: Math.round(6 + k.size / 10) };
  if (s.lowPass) s.lowPass -= (k.size - 50) * 0.2;
  // strain: the speed hunts up and down, and it gets gritty
  if (k.strain > 0) Object.assign(s, { vibrato: k.strain * 0.015, vibratoSpeed: 3, resonance: settingOf(s, 'resonance') + k.strain * 0.3, crush: Math.max(settingOf(s, 'crush'), k.strain * 0.25) });
  // rattle: rough and crackly
  if (k.rattle > 0) Object.assign(s, { wander: settingOf(s, 'wander') + k.rattle * 0.012, wanderSpeed: s.wanderSpeed ?? 500, crackle: k.rattle * 1.2, crackleLength: 6, crackleDepth: k.rattle * 0.5 });
  if (name === 'gears') Object.assign(s, { tremolo: 0, sustain: 3, decay: 25, volume: 45, repeats: 8, gap: Math.max(5, 1000 / (chop * fast) - 28) });
  if (k.spin) {
    // 0.1 to 3 s, and up to two octaves
    const seconds = 0.1 * 30 ** (k.spinTime / 100);
    const notes = (Math.abs(k.spin) / 100) * 24;
    // gears' pitch starts again every tick, so they spin a little each tick instead
    if (name === 'gears') return { ...s, repeatPitch: (Math.sign(k.spin) * notes) / 8 };
    // up rises fast then levels off, down drops fast then slows (a curve, slide and slide speed-up)
    if (k.spin > 0) return { ...s, pitch: s.pitch / 2 ** (notes / 12), slide: (2 * notes) / seconds, slideAccel: (-2 * notes) / seconds ** 2, attack: Math.min(80, seconds * 100), sustain: seconds * 850, decay: seconds * 250 };
    return { ...s, slide: (-2 * notes) / seconds, slideAccel: (2 * notes) / seconds ** 2, sustain: seconds * 400, decay: seconds * 600 };
  }
  return s;
}

// the waves that go square with Game's Retro knob
const SMOOTH_WAVES = ['sine', 'triangle', 'breaker', 'organ', 'whistle'];

const SOUND_GENERATORS = {
  Game: {
    knobs: [PITCH_KNOB, LENGTH_KNOB, knob('retro', 'Retro', 'Crunchier, more like an old console. Past halfway, smooth waves turn into square waves', { normal: 0 })],
    make: (k, maker) => {
      const s = stretched(shifted(maker.make(), k.pitch), k.length / 100);
      if (k.retro === 0) return s;
      return { ...s, crush: Math.max(settingOf(s, 'crush'), k.retro * 0.55), wave: k.retro >= 50 && SMOOTH_WAVES.includes(settingOf(s, 'wave')) ? 'square' : s.wave };
    },
    makers: {
      Coin: { tip: 'Two quick rising notes, for picking things up', make: () => ({ wave: randomPick(['square', 'sine', 'triangle', 'breaker']), pitch: randomNumber(700, 1400), jump: randomPick([3, 4, 5, 7, 12]), jumpAt: randomNumber(40, 100), attack: 0, sustain: randomNumber(30, 90), punch: randomNumber(30, 60), decay: randomNumber(100, 300), pulseWidth: randomNumber(20, 50) }) },
      Pickup: { tip: 'A quick rising bloop, for grabbing an item', make: () => ({ wave: randomPick(['square', 'triangle', 'sine']), pitch: randomNumber(400, 900), slide: randomNumber(60, 160), attack: 0, sustain: randomNumber(30, 60), punch: randomNumber(20, 40), decay: randomNumber(60, 140), pulseWidth: randomNumber(25, 50), volume: 45 }) },
      'Power-up': { tip: 'A rising, wobbling tune', make: () => ({ wave: randomPick(['square', 'sawtooth', 'triangle']), pitch: randomNumber(200, 600), slide: randomNumber(15, 60), vibrato: sometimes(randomNumber(0.2, 1)), vibratoSpeed: randomNumber(8, 20), attack: 0, sustain: randomNumber(150, 350), decay: randomNumber(80, 300), repeats: randomPick([1, 1, 2, 3]), gap: randomNumber(20, 60) }) },
      Jump: { tip: 'A springy rising boing', make: () => ({ wave: 'square', pitch: randomNumber(200, 500), slide: randomNumber(25, 80), attack: 0, sustain: randomNumber(50, 150), decay: randomNumber(50, 150), pulseWidth: randomNumber(20, 50), lowPass: sometimes(randomNumber(50, 90)) }) },
      Hit: { tip: 'A short thump or smack', make: () => ({ wave: randomPick(['noise', 'noise', 'sawtooth', 'square', 'bitnoise']), pitch: randomNumber(150, 900), slide: -randomNumber(30, 100), attack: 0, sustain: randomNumber(10, 60), decay: randomNumber(40, 160), punch: randomNumber(0, 50), highPass: sometimes(randomNumber(5, 30)), volume: 70 }) },
      Hurt: { tip: 'A falling, wobbly ouch, for taking damage', make: () => ({ wave: randomPick(['square', 'sawtooth', 'tan']), pitch: randomNumber(250, 600), slide: -randomNumber(50, 130), vibrato: randomNumber(1, 3), vibratoSpeed: randomNumber(25, 40), attack: 0, sustain: randomNumber(60, 120), decay: randomNumber(80, 160), crush: sometimes(randomNumber(10, 30)), pulseWidth: randomNumber(20, 50), volume: 50 }) },
      Laser: { tip: 'A falling zap', make: () => ({ wave: randomPick(['square', 'sawtooth', 'sine']), pitch: randomNumber(500, 2000), slide: -randomNumber(40, 150), slideAccel: randomNumber(-50, 50), attack: 0, sustain: randomNumber(40, 150), decay: randomNumber(50, 200), pulseWidth: randomNumber(10, 50), pulseSweep: randomNumber(-50, 50), highPass: sometimes(randomNumber(5, 30)) }) },
      Explosion: { tip: 'A crunchy boom', make: () => ({ wave: randomPick(['noise', 'noise', 'bitnoise', 'pink']), pitch: randomNumber(80, 600), slide: -randomNumber(5, 30), attack: 0, sustain: randomNumber(80, 300), punch: randomNumber(20, 70), decay: randomNumber(300, 900), flanger: sometimes(randomNumber(1, 8)), flangerSweep: sometimes(randomNumber(-10, 10)), crush: sometimes(randomNumber(10, 50)), lowPass: randomNumber(60, 100), volume: 80 }) },
      Blip: { tip: 'A tiny beep, for menus and clicks', make: () => ({ wave: randomPick(['square', 'sine', 'triangle', 'breaker']), pitch: randomNumber(300, 1500), attack: 0, sustain: randomNumber(20, 80), decay: randomNumber(10, 60), pulseWidth: randomNumber(20, 50), highPass: sometimes(randomNumber(5, 30)) }) },
      Select: { tip: 'Two quick notes up, for choosing something in a menu', make: () => ({ wave: randomPick(['square', 'sine', 'triangle', 'breaker']), pitch: randomNumber(600, 1100), jump: randomPick([5, 7, 12]), jumpAt: randomNumber(30, 55), attack: 0, sustain: randomNumber(60, 100), decay: randomNumber(40, 90), pulseWidth: randomNumber(25, 50), volume: 40 }) },
      Back: { tip: 'Two quick notes down, for going back or closing a menu', make: () => ({ wave: randomPick(['square', 'sine', 'triangle', 'breaker']), pitch: randomNumber(500, 900), jump: -randomPick([5, 7]), jumpAt: randomNumber(30, 55), attack: 0, sustain: randomNumber(60, 100), decay: randomNumber(40, 90), pulseWidth: randomNumber(25, 50), volume: 40 }) },
      Error: { tip: 'A low double buzz, for something you can\'t do', make: () => ({ wave: randomPick(['square', 'sawtooth', 'tan']), pitch: randomNumber(110, 200), jump: sometimes(-1), jumpAt: randomNumber(50, 80), attack: 0, sustain: randomNumber(70, 120), decay: randomNumber(20, 40), repeats: 2, gap: randomNumber(40, 80), lowPass: randomNumber(55, 80), volume: 45 }) },
      Jingle: { tip: 'Three notes of a chord, like finding treasure', make: () => {
        const [jump, jump2] = randomPick([[4, 3], [3, 4], [5, 4], [7, 5], [4, 5]]);
        const at = randomNumber(70, 110);
        return { wave: randomPick(['square', 'triangle', 'breaker']), pitch: noteFrequency(randomPick([60, 62, 64, 65, 67])), jump, jumpAt: at, jump2, jump2At: at * 2, attack: 0, sustain: at * 3 + randomNumber(50, 150), decay: randomNumber(150, 300), pulseWidth: randomNumber(25, 50), vibrato: sometimes(randomNumber(0.1, 0.3)), vibratoSpeed: 6, volume: 45 };
      } },
      'Level up': { tip: 'A chord going up, then again an octave higher', make: () => {
        const at = randomNumber(60, 90);
        return { wave: randomPick(['square', 'triangle', 'breaker']), pitch: noteFrequency(randomPick([55, 57, 60, 62])), jump: 4, jumpAt: at, jump2: 3, jump2At: at * 2, attack: 0, sustain: at * 3, decay: randomNumber(60, 120), repeats: 2, gap: randomNumber(10, 30), repeatPitch: 12, vibrato: sometimes(randomNumber(0.1, 0.3)), vibratoSpeed: 7, pulseWidth: randomNumber(25, 50), volume: 40 };
      } },
      'Game over': { tip: 'A slow, sad falling tune', make: () => {
        const at = randomNumber(180, 260);
        return { wave: randomPick(['triangle', 'square', 'sawtooth']), pitch: noteFrequency(randomPick([57, 60, 62])), jump: -3, jumpAt: at, jump2: -4, jump2At: at * 2, slide: -randomNumber(0.5, 2), vibrato: 0.3, vibratoSpeed: 5, attack: 0, sustain: at * 3 + 200, decay: randomNumber(400, 700), lowPass: sometimes(randomNumber(60, 80)), pulseWidth: randomNumber(25, 50), volume: 40 };
      } },
    },
  },
  Magic: {
    knobs: [PITCH_KNOB, LENGTH_KNOB, knob('sparkle', 'Sparkle', 'A shimmering, swirling edge on top', { normal: 0 }), knob('echo', 'Echo', 'Echoes, from a small hall to a huge cavern', { normal: 0 })],
    make: (k, maker) => {
      let s = stretched(shifted(maker.make(), k.pitch), k.length / 100);
      if (k.sparkle > 0) s = { ...s, vibrato: Math.max(settingOf(s, 'vibrato'), k.sparkle * 0.004), vibratoSpeed: 14 + k.sparkle * 0.1, flanger: Math.max(settingOf(s, 'flanger'), k.sparkle * 0.03), flangerSweep: k.sparkle * 0.04 };
      return echoed(s, k.echo, 80, 400);
    },
    makers: {
      Sparkle: { tip: 'A sparkly arpeggio with an echo', make: () => {
        const at = randomNumber(30, 60);
        return { wave: randomPick(['sine', 'triangle', 'breaker', 'whistle']), pitch: randomNumber(600, 1400), slide: randomNumber(0, 15), jump: randomPick([4, 5, 7]), jumpAt: at, jump2: randomPick([3, 5, 7]), jump2At: at * 2, jumpRepeat: at * 3, attack: 0, sustain: randomNumber(250, 500), decay: randomNumber(250, 600), echo: randomNumber(90, 180), echoFeedback: randomNumber(30, 50), volume: 45 };
      } },
      Heal: { tip: 'A gentle, warm rising chord', make: () => {
        const at = randomNumber(70, 110);
        return { wave: randomPick(['sine', 'triangle', 'whistle']), pitch: noteFrequency(randomPick([64, 67, 69, 72])), jump: randomPick([4, 5]), jumpAt: at, jump2: randomPick([3, 4, 5]), jump2At: at * 2, jumpRepeat: sometimes(at * 3), slide: randomNumber(1, 4), attack: randomNumber(10, 40), sustain: randomNumber(400, 700), decay: randomNumber(300, 600), vibrato: randomNumber(0.1, 0.3), vibratoSpeed: randomNumber(5, 8), echo: randomNumber(120, 200), echoFeedback: randomNumber(30, 45), volume: 40 };
      } },
      Cast: { tip: 'A rising, swooshing spell', make: () => ({ wave: randomPick(['sawtooth', 'square', 'breaker']), pitch: randomNumber(200, 500), slide: randomNumber(20, 60), slideAccel: sometimes(randomNumber(-60, 60)), attack: randomNumber(20, 80), sustain: randomNumber(150, 300), decay: randomNumber(150, 300), flanger: randomNumber(1, 4), flangerSweep: randomNumber(3, 10), lowPass: randomNumber(50, 80), lowPassSweep: randomNumber(20, 60), resonance: randomNumber(30, 60), volume: 45 }) },
      Fireball: { tip: 'A roaring burst of flame', make: () => ({ wave: 'pink', pitch: randomNumber(400, 900), slide: -randomNumber(5, 20), attack: randomNumber(40, 100), sustain: randomNumber(150, 300), punch: randomNumber(20, 50), decay: randomNumber(400, 800), crackle: randomNumber(30, 70), crackleLength: randomNumber(5, 15), crackleDepth: randomNumber(40, 60), lowPass: randomNumber(55, 70), lowPassSweep: -randomNumber(10, 30), resonance: randomNumber(10, 30), volume: 100 }) },
      Ice: { tip: 'Glassy chimes tumbling down', make: () => ({ wave: randomPick(['sine', 'breaker']), pitch: randomNumber(1800, 3200), fm: randomNumber(15, 35), fmRatio: randomPick([2.76, 3.5, 5.4]), attack: 0, sustain: 0, decay: randomNumber(120, 250), repeats: randomPick([4, 5, 6, 8]), gap: randomNumber(15, 45), repeatPitch: -randomPick([1, 2, 3]), echo: randomNumber(60, 120), echoFeedback: 35, volume: 40 }) },
      Zap: { tip: 'A crackling jolt of lightning', make: () => ({ wave: randomPick(['noise', 'bitnoise']), pitch: randomNumber(1500, 3500), attack: 0, sustain: randomNumber(80, 250), decay: randomNumber(40, 120), crackle: randomNumber(150, 350), crackleLength: randomNumber(2, 6), crackleDepth: randomNumber(70, 95), tremolo: randomNumber(30, 60), tremoloSpeed: randomNumber(40, 70), highPass: randomNumber(30, 50), wander: randomNumber(4, 10), wanderSpeed: randomNumber(30, 80), volume: 60 }) },
      Teleport: { tip: 'A rising warble, for warps and spells', make: () => ({ wave: randomPick(['square', 'sine', 'sawtooth']), pitch: randomNumber(200, 500), slide: randomNumber(60, 150), vibrato: randomNumber(2, 6), vibratoSpeed: randomNumber(20, 35), attack: randomNumber(0, 50), sustain: randomNumber(250, 450), decay: randomNumber(100, 250), flanger: sometimes(randomNumber(2, 6)), flangerSweep: sometimes(randomNumber(-8, 8)), volume: 45 }) },
      Portal: { tip: 'A deep swirling hum that loops', make: () => ({ wave: randomPick(['sawtooth', 'organ', 'square']), pitch: randomNumber(70, 160), vibrato: randomNumber(0.5, 2), vibratoSpeed: randomNumber(0.5, 2), flanger: randomNumber(3, 8), lowPass: randomNumber(40, 60), resonance: randomNumber(50, 75), tremolo: randomNumber(20, 40), tremoloSpeed: randomNumber(1, 3), attack: 0, sustain: 2000, decay: 0, volume: 55, range: 8 }) },
      'Force field': { tip: 'A buzzing magic barrier that loops', make: () => ({ wave: randomPick(['sawtooth', 'square']), pitch: randomNumber(80, 140), fm: randomNumber(5, 15), fmRatio: randomPick([1, 2, 3]), tremolo: randomNumber(30, 50), tremoloSpeed: randomNumber(12, 25), flanger: randomNumber(1, 3), lowPass: randomNumber(45, 65), resonance: randomNumber(40, 65), highPass: 10, attack: 0, sustain: 2000, decay: 0, volume: 40, range: 6 }) },
      Curse: { tip: 'A dark, ghostly moan', make: () => ({ wave: 'voice', vowel: randomNumber(3, 4), vowelSlide: -randomNumber(0.5, 1.5), mouth: randomNumber(120, 150), pitch: randomNumber(70, 110), slide: -randomNumber(2, 6), breath: randomNumber(50, 75), growl: randomNumber(20, 50), vibrato: randomNumber(0.3, 0.8), vibratoSpeed: randomNumber(4, 6), attack: randomNumber(80, 200), sustain: randomNumber(500, 900), decay: randomNumber(400, 700), flanger: randomNumber(2, 5), echo: randomNumber(150, 250), echoFeedback: 40, volume: 80 }) },
      'Charge up': { tip: 'Power building up faster and faster', make: () => ({ wave: randomPick(['sawtooth', 'square', 'sine']), pitch: randomNumber(80, 200), slide: randomNumber(10, 30), slideAccel: randomNumber(10, 40), tremolo: randomNumber(30, 60), tremoloSpeed: randomNumber(15, 30), vibrato: sometimes(randomNumber(0.2, 0.6)), vibratoSpeed: 20, attack: randomNumber(300, 600), sustain: randomNumber(400, 800), decay: randomNumber(30, 80), lowPass: randomNumber(50, 80), lowPassSweep: randomNumber(10, 30), volume: 45 }) },
      Poof: { tip: 'A puff of smoke, for vanishing', make: () => ({ wave: 'pink', pitch: randomNumber(500, 1500), attack: randomNumber(5, 20), sustain: randomNumber(20, 60), decay: randomNumber(200, 400), lowPass: randomNumber(70, 85), lowPassSweep: -randomNumber(30, 60), highPass: randomNumber(20, 35), resonance: randomNumber(10, 30), volume: 100 }) },
      Secret: { tip: 'A little climbing tune, for finding something hidden', make: () => {
        const at = randomNumber(50, 80);
        return { wave: randomPick(['square', 'triangle', 'breaker']), pitch: noteFrequency(randomPick([62, 64, 65, 67])), jump: randomPick([5, 6, 7]), jumpAt: at, attack: 0, sustain: at * 2, decay: randomNumber(30, 60), repeats: 4, gap: randomNumber(5, 20), repeatPitch: randomPick([1, 2, -1]), echo: sometimes(randomNumber(100, 150)), pulseWidth: randomNumber(25, 50), volume: 40 };
      } },
      Chime: { tip: 'A ringing ding. FM makes it clang like real metal', make: () => ({ wave: randomPick(['sine', 'triangle', 'organ']), pitch: randomNumber(500, 2000), attack: randomNumber(0, 5), sustain: 0, decay: randomNumber(400, 1500), fm: sometimes(randomNumber(10, 40)), fmRatio: randomPick([1.4, 2.76, 3.5, 5.4]), vibrato: sometimes(randomNumber(0.05, 0.3)), vibratoSpeed: randomNumber(3, 8), repeats: randomPick([1, 1, 2]), gap: randomNumber(20, 80) }) },
      Shield: { tip: 'A magic barrier ringing as it blocks a hit', make: () => ({ wave: 'sine', pitch: randomNumber(300, 600), fm: randomNumber(40, 70), fmRatio: randomPick([1.41, 2.76, 3.5]), attack: 0, punch: randomNumber(40, 70), sustain: randomNumber(20, 50), decay: randomNumber(500, 900), flanger: randomNumber(2, 5), flangerSweep: randomNumber(-6, 6), vibrato: 0.2, vibratoSpeed: 6, volume: 40 }) },
    },
  },
  'Sci-fi': {
    knobs: [PITCH_KNOB, LENGTH_KNOB, knob('glitch', 'Glitch', 'Breaks it up: jumpy pitch, crunch and dropouts', { normal: 0 }), knob('space', 'Space', 'Echoes, like it\'s bouncing round a big empty space', { normal: 0 })],
    make: (k, maker) => {
      let s = stretched(shifted(maker.make(), k.pitch), k.length / 100);
      const g = k.glitch;
      if (g > 0) s = { ...s, wander: Math.max(settingOf(s, 'wander'), g * 0.15), wanderSpeed: 300 + g * 12, crush: Math.max(settingOf(s, 'crush'), g * 0.5) };
      if (g > 30) s = { ...s, crackle: Math.max(settingOf(s, 'crackle'), (g - 30) * 0.8), crackleLength: 25, crackleDepth: 100 };
      return echoed(s, k.space, 100, 450);
    },
    makers: {
      Sonar: { tip: 'A ping with echoes coming back', make: () => ({ wave: randomPick(['sine', 'sine', 'triangle']), pitch: randomNumber(700, 1500), slide: -randomNumber(0, 3), fm: sometimes(randomNumber(3, 10)), fmRatio: randomPick([1, 2]), attack: randomNumber(0, 3), sustain: randomNumber(10, 40), decay: randomNumber(600, 1200), echo: randomNumber(250, 450), echoFeedback: randomNumber(40, 60), lowPass: randomNumber(70, 90), volume: 45, range: 14 }) },
      Radar: { tip: 'A short bright blip on the scanner', make: () => ({ wave: 'sine', pitch: randomNumber(1500, 2800), attack: 0, sustain: randomNumber(10, 30), decay: randomNumber(60, 140), repeats: randomPick([1, 2]), gap: randomNumber(60, 120), highPass: randomNumber(20, 40), volume: 40 }) },
      'Target lock': { tip: 'Quick beeps climbing as it locks on', make: () => ({ wave: randomPick(['square', 'sine', 'triangle']), pitch: randomNumber(900, 1500), attack: 0, sustain: randomNumber(30, 50), decay: randomNumber(10, 30), repeats: randomPick([3, 4, 5, 6]), gap: randomNumber(30, 70), repeatPitch: randomPick([1, 2, 3, 4]), pulseWidth: randomNumber(20, 50), volume: 40 }) },
      Beacon: { tip: 'A slow repeating signal that loops', make: () => ({ wave: randomPick(['sine', 'triangle']), pitch: randomNumber(500, 1100), fm: sometimes(randomNumber(5, 15)), fmRatio: 2, jump: sometimes(randomPick([-5, 7])), jumpAt: 100, attack: randomNumber(5, 20), sustain: randomNumber(80, 150), decay: randomNumber(150, 300), repeats: 2, gap: randomNumber(500, 900), echo: sometimes(randomNumber(150, 250)), volume: 45, range: 18 }) },
      Scanner: { tip: 'A sweeping, pulsing scan', make: () => ({ wave: randomPick(['sine', 'square', 'sawtooth']), pitch: randomNumber(600, 1400), vibrato: randomNumber(4, 8), vibratoSpeed: randomNumber(1, 3), tremolo: randomNumber(40, 70), tremoloSpeed: randomNumber(25, 45), highPass: randomNumber(20, 40), lowPass: randomNumber(70, 90), attack: randomNumber(20, 60), sustain: randomNumber(600, 1200), decay: randomNumber(50, 150), volume: 35 }) },
      Hologram: { tip: 'A shimmering screen opening', make: () => ({ wave: randomPick(['breaker', 'whistle', 'sine']), pitch: randomNumber(400, 900), fm: randomNumber(10, 30), fmRatio: randomPick([1.5, 2.5, 3]), slide: eitherWay(randomNumber(5, 20)), vibrato: randomNumber(0.2, 0.6), vibratoSpeed: randomNumber(10, 18), flanger: randomNumber(1, 4), flangerSweep: randomNumber(-8, 8), lowPass: randomNumber(50, 70), lowPassSweep: randomNumber(30, 70), resonance: randomNumber(30, 55), attack: randomNumber(30, 80), sustain: randomNumber(150, 300), decay: randomNumber(150, 300), volume: 40 }) },
      Computer: { tip: 'Busy computer bleeps', make: () => {
        const at = randomNumber(20, 50);
        return { wave: randomPick(['square', 'sine', 'triangle']), pitch: randomNumber(600, 1600), jump: eitherWay(randomPick([5, 7, 12])), jumpAt: at, jump2: eitherWay(randomPick([3, 5, 7])), jump2At: at * 2, jumpRepeat: at * 3, attack: 0, sustain: randomNumber(300, 700), decay: randomNumber(20, 60), repeats: randomPick([1, 2, 3]), gap: randomNumber(60, 150), volume: 40 };
      } },
      Data: { tip: 'A fast stream of data chirps', make: () => {
        const at = randomNumber(8, 18);
        return { wave: randomPick(['square', 'sine']), pitch: randomNumber(800, 2000), jump: randomPick([-7, -5, 5, 7, 12]), jumpAt: at, jump2: randomPick([-12, -3, 3, 4]), jump2At: at * 2, jumpRepeat: at * 3, wander: randomNumber(4, 10), wanderSpeed: randomNumber(30, 90), attack: 0, sustain: randomNumber(400, 900), decay: randomNumber(20, 50), highPass: 25, volume: 30 };
      } },
      Glitch: { tip: 'Broken, jumpy digital noise', make: () => ({ wave: randomPick(['bitnoise', 'square', 'tan', 'metal']), pitch: randomNumber(200, 1500), wander: randomNumber(12, 24), wanderSpeed: randomNumber(200, 1200), crush: randomNumber(40, 75), crackle: randomNumber(20, 60), crackleLength: randomNumber(20, 60), attack: 0, sustain: randomNumber(150, 400), decay: randomNumber(10, 40), volume: 40 }) },
      Stutter: { tip: 'A sound skipping like a scratched disc', make: () => ({ wave: randomPick(['square', 'sawtooth', 'tan']), pitch: randomNumber(200, 900), slide: sometimes(-randomNumber(20, 80)), attack: 0, sustain: randomNumber(15, 40), decay: randomNumber(5, 15), repeats: randomPick([4, 6, 8, 10]), gap: randomNumber(10, 30), repeatPitch: eitherWay(randomPick([0.5, 1, 2])), crush: randomNumber(20, 50), pulseWidth: randomNumber(20, 50), volume: 40 }) },
      Static: { tip: 'A broken radio\'s hiss and crackle that loops', make: () => ({ wave: 'noise', pitch: randomNumber(1500, 3000), highPass: randomNumber(35, 50), lowPass: randomNumber(70, 85), crackle: randomNumber(30, 80), crackleLength: randomNumber(20, 60), crackleDepth: randomNumber(50, 80), wander: randomNumber(5, 12), wanderSpeed: randomNumber(3, 8), tremolo: sometimes(randomNumber(20, 40)), tremoloSpeed: randomNumber(2, 6), crush: sometimes(randomNumber(20, 40)), attack: 0, sustain: 2000, decay: 0, volume: 75 }) },
      'Alien signal': { tip: 'A strange warbling transmission', make: () => ({ wave: randomPick(['sine', 'whistle', 'triangle']), pitch: randomNumber(400, 1200), fm: randomNumber(10, 30), fmRatio: randomNumber(0.5, 3), vibrato: randomNumber(2, 6), vibratoSpeed: randomNumber(6, 14), wander: randomNumber(2, 5), wanderSpeed: randomNumber(3, 8), attack: randomNumber(20, 60), sustain: randomNumber(400, 800), decay: randomNumber(200, 400), repeats: randomPick([1, 2, 3]), gap: randomNumber(80, 200), repeatPitch: eitherWay(randomPick([2, 3, 5])), echo: randomNumber(150, 300), echoFeedback: 40, volume: 40 }) },
      'Power on': { tip: 'A machine whirring up to speed', make: () => ({ wave: randomPick(['sawtooth', 'square']), pitch: randomNumber(40, 80), slide: randomNumber(40, 80), slideAccel: -randomNumber(30, 60), attack: randomNumber(30, 80), sustain: randomNumber(600, 1000), decay: randomNumber(100, 250), lowPass: randomNumber(40, 60), lowPassSweep: randomNumber(20, 40), resonance: randomNumber(20, 50), tremolo: sometimes(randomNumber(10, 30)), tremoloSpeed: 30, volume: 45 }) },
      'Power off': { tip: 'A machine winding down and dying', make: () => ({ wave: randomPick(['sawtooth', 'square', 'sine']), pitch: randomNumber(400, 900), slide: -randomNumber(30, 60), slideAccel: randomNumber(10, 30), attack: 0, sustain: randomNumber(300, 600), decay: randomNumber(400, 700), lowPass: randomNumber(60, 85), lowPassSweep: -randomNumber(20, 40), volume: 45 }) },
      Beam: { tip: 'A humming energy beam that loops', make: () => ({ wave: randomPick(['sawtooth', 'square']), pitch: randomNumber(150, 400), vibrato: randomNumber(0.3, 1), vibratoSpeed: randomNumber(20, 40), fm: randomNumber(10, 30), fmRatio: randomPick([0.5, 1.5, 2]), flanger: randomNumber(1, 3), lowPass: randomNumber(60, 85), resonance: randomNumber(30, 60), attack: 0, sustain: 2000, decay: 0, volume: 40 }) },
    },
  },
  Things: {
    knobs: [PITCH_KNOB, LENGTH_KNOB, twoWayKnob('hardness', 'Hardness', 'Soft and muffled (-) or hard and sharp (+)'), knob('room', 'Room', 'Short echoes off the walls of a room', { normal: 0 })],
    make: (k, maker) => {
      let s = stretched(shifted(maker.make(), k.pitch), k.length / 100);
      const h = k.hardness;
      if (h > 0) s = { ...s, punch: Math.max(settingOf(s, 'punch'), h * 0.6), highPass: Math.max(settingOf(s, 'highPass'), h * 0.3), attack: settingOf(s, 'attack') * (1 - h / 110) };
      if (h < 0) s = { ...s, lowPass: Math.min(settingOf(s, 'lowPass'), 100 + h * 0.6), attack: settingOf(s, 'attack') - h * 0.3, punch: settingOf(s, 'punch') * (1 + h / 100) };
      return echoed(s, k.room, 25, 140);
    },
    makers: {
      Footsteps: { tip: 'A few steps. Crackle makes them crunch like gravel', make: () => ({ wave: randomPick(['noise', 'pink']), pitch: randomNumber(150, 500), attack: 0, sustain: randomNumber(5, 15), decay: randomNumber(60, 120), lowPass: randomNumber(35, 55), crackle: sometimes(randomNumber(150, 300)), crackleLength: randomNumber(4, 8), repeats: randomPick([2, 3, 4]), gap: randomNumber(250, 380), volume: 100, range: 6 }) },
      Knock: { tip: 'Knocking on wood', make: () => ({ wave: randomPick(['triangle', 'sine']), pitch: randomNumber(150, 320), slide: -randomNumber(10, 30), fm: randomNumber(10, 25), fmRatio: randomPick([2.3, 3.1, 1.7]), attack: 0, sustain: randomNumber(0, 5), decay: randomNumber(50, 100), lowPass: randomNumber(45, 65), repeats: randomPick([1, 2, 3]), gap: randomNumber(90, 160), volume: 90 }) },
      Clang: { tip: 'A heavy metal clang', make: () => ({ wave: 'sine', pitch: randomNumber(250, 700), fm: randomNumber(35, 65), fmRatio: randomPick([1.41, 2.76, 3.5, 5.4]), attack: 0, punch: randomNumber(30, 60), sustain: randomNumber(0, 20), decay: randomNumber(600, 1300), vibrato: sometimes(randomNumber(0.05, 0.2)), vibratoSpeed: randomNumber(4, 8), highPass: randomNumber(5, 15), volume: 50, range: 12 }) },
      Glass: { tip: 'A delicate glass ping', make: () => ({ wave: randomPick(['sine', 'breaker']), pitch: randomNumber(1800, 3600), fm: randomNumber(10, 30), fmRatio: randomPick([2.76, 3.5, 5.4]), attack: 0, sustain: 0, decay: randomNumber(300, 700), repeats: randomPick([1, 1, 2]), gap: randomNumber(20, 60), repeatPitch: sometimes(randomPick([-2, 3])), volume: 40 }) },
      Whoosh: { tip: 'A swing or something flying past', make: () => ({ wave: 'pink', pitch: randomNumber(300, 900), slide: eitherWay(randomNumber(15, 40)), attack: randomNumber(100, 250), sustain: randomNumber(0, 50), decay: randomNumber(150, 300), lowPass: randomNumber(45, 65), resonance: randomNumber(30, 60), lowPassSweep: randomNumber(30, 80), volume: 90 }) },
      'Sword clash': { tip: 'Two blades hitting', make: () => ({ wave: 'sine', pitch: randomNumber(700, 1400), fm: randomNumber(60, 95), fmRatio: randomPick([1.41, 2.76, 3.17]), attack: 0, punch: randomNumber(50, 80), sustain: randomNumber(10, 30), decay: randomNumber(300, 600), highPass: randomNumber(15, 30), flanger: sometimes(randomNumber(0.5, 2)), volume: 40 }) },
      Creak: { tip: 'A creaky door or floorboard', make: () => ({ wave: randomPick(['sawtooth', 'metal']), pitch: randomNumber(40, 110), slide: randomNumber(-5, 5), wander: randomNumber(1, 4), wanderSpeed: randomNumber(2, 6), lowPass: randomNumber(40, 60), resonance: randomNumber(60, 85), highPass: randomNumber(10, 25), attack: randomNumber(50, 150), sustain: randomNumber(400, 900), decay: randomNumber(100, 200) }) },
      Clock: { tip: 'Tick, tock', make: () => ({ wave: randomPick(['metal', 'bitnoise', 'sine']), pitch: randomNumber(1500, 4000), attack: 0, sustain: randomNumber(0, 5), decay: randomNumber(15, 35), highPass: randomNumber(30, 60), repeats: 2, gap: randomNumber(450, 520), volume: 70, range: 5 }) },
      Bell: { tip: 'A ringing ding. FM makes it clang like real metal', make: () => ({ wave: randomPick(['sine', 'triangle', 'organ']), pitch: randomNumber(500, 2000), attack: randomNumber(0, 5), sustain: 0, decay: randomNumber(400, 1500), fm: sometimes(randomNumber(10, 40)), fmRatio: randomPick([1.4, 2.76, 3.5, 5.4]), vibrato: sometimes(randomNumber(0.05, 0.3)), vibratoSpeed: randomNumber(3, 8), repeats: randomPick([1, 1, 2]), gap: randomNumber(20, 80) }) },
      Coins: { tip: 'A handful of coins clinking', make: () => ({ wave: randomPick(['sine', 'breaker']), pitch: randomNumber(2200, 3600), fm: randomNumber(10, 25), fmRatio: randomPick([2.76, 3.5]), attack: 0, sustain: 0, decay: randomNumber(60, 140), repeats: randomPick([3, 4, 6, 8]), gap: randomNumber(25, 90), wander: randomNumber(3, 6), wanderSpeed: randomNumber(8, 20), volume: 55 }) },
      Firecracker: { tip: 'A string of bangs and pops', make: () => ({ wave: randomPick(['noise', 'bitnoise']), pitch: randomNumber(900, 2500), crackle: randomNumber(6, 20), crackleLength: randomNumber(15, 40), punch: randomNumber(30, 60), attack: 0, sustain: randomNumber(600, 1500), decay: randomNumber(200, 400), echo: sometimes(randomNumber(60, 150)), echoFeedback: randomNumber(20, 40), volume: 85, range: 20 }) },
      Splash: { tip: 'Something dropping into water', make: () => ({ wave: 'noise', pitch: randomNumber(1000, 2500), attack: 0, punch: randomNumber(40, 70), sustain: randomNumber(30, 80), decay: randomNumber(250, 500), crackle: randomNumber(150, 300), crackleLength: randomNumber(10, 25), lowPass: randomNumber(70, 90), lowPassSweep: -randomNumber(40, 80), volume: 90 }) },
      Siren: { tip: 'A wailing siren that loops', make: () => ({ wave: randomPick(['sine', 'square', 'triangle']), pitch: randomNumber(500, 800), vibrato: randomNumber(3, 6), vibratoSpeed: randomNumber(0.5, 2), pulseWidth: randomNumber(30, 50), attack: 0, sustain: 2000, decay: 0, volume: 50, range: 25 }) },
      Alarm: { tip: 'Beep beep beep', make: () => ({ wave: randomPick(['square', 'tan', 'sawtooth']), pitch: randomNumber(800, 1600), jump: sometimes(-randomPick([5, 7, 12])), jumpAt: randomNumber(50, 80), attack: 0, sustain: randomNumber(80, 150), decay: randomNumber(10, 30), repeats: randomPick([3, 4, 5]), gap: randomNumber(60, 120), volume: 45, range: 15 }) },
      Heartbeat: { tip: 'Lub-dub', make: () => ({ wave: 'sine', pitch: randomNumber(45, 65), slide: -randomNumber(5, 15), attack: 0, sustain: randomNumber(10, 20), punch: randomNumber(50, 80), decay: randomNumber(80, 140), repeats: 2, gap: randomNumber(90, 140), lowPass: randomNumber(30, 50), volume: 90, range: 4 }) },
    },
  },
  Motors: {
    knobs: [
      choiceKnob('machine', 'Machine', 'What kind of machine it is', Object.keys(MACHINES)),
      knob('speed', 'Speed', 'How fast it runs: higher and busier'),
      knob('size', 'Size', 'From tiny and whiny to huge and deep'),
      knob('strain', 'Strain', 'Working hard: its speed hunts up and down and it gets gritty', { normal: 0 }),
      knob('rattle', 'Rattle', 'Worn, loose and rattly', { normal: 0 }),
      twoWayKnob('spin', 'Spin', 'Spins up (+) or winds down (-) instead of running steadily. At 0 it runs steadily and loops'),
      knob('spinTime', 'Spin time', 'How long spinning up or down takes, from a tenth of a second to 3 seconds'),
    ],
    make: machine,
    makers: {
      Engine: { tip: 'A rumbling engine that loops', knobs: { machine: 1, speed: [35, 60], size: [45, 70], strain: [5, 30], rattle: [5, 25] } },
      'Car idle': { tip: 'A car ticking over, waiting', knobs: { machine: 1, speed: [15, 35], size: [40, 60], strain: [0, 15], rattle: [15, 35] } },
      Motor: { tip: 'A whirring electric motor that loops', knobs: { machine: 0, speed: [40, 65], size: [30, 60], strain: [0, 15], rattle: [0, 15] } },
      Drill: { tip: 'A whining drill', knobs: { machine: 2, speed: [45, 75], size: [20, 50], strain: [10, 40], rattle: [5, 20] } },
      Chainsaw: { tip: 'A snarling chainsaw', knobs: { machine: 4, speed: [45, 70], size: [35, 60], strain: [20, 50], rattle: [10, 30] } },
      Fan: { tip: 'A whooshing fan that loops', knobs: { machine: 3, speed: [40, 65], size: [30, 55], rattle: [0, 15] } },
      Helicopter: { tip: 'Big blades chopping the air', knobs: { machine: 3, speed: [25, 40], size: [75, 95], rattle: [5, 20] } },
      Hum: { tip: 'A steady machine hum that loops smoothly', knobs: { machine: 6, speed: [35, 65], size: [40, 70] } },
      Generator: { tip: 'A rattling generator that loops', knobs: { machine: 6, speed: [20, 40], size: [55, 80], strain: [10, 30], rattle: [20, 40] } },
      'Spin up': { tip: 'Something starting up and getting to speed', knobs: { machine: [0, 2], speed: [50, 75], size: [20, 55], spin: [50, 100], spinTime: [50, 75] } },
      'Spin down': { tip: 'Something switching off and slowing down', knobs: { machine: [0, 2], speed: [50, 75], size: [20, 55], spin: [-100, -50], spinTime: [60, 85] } },
      Servo: { tip: 'A little robot joint moving', knobs: { machine: 0, speed: [60, 85], size: [5, 30], spin: () => eitherWay(randomNumber(25, 60)), spinTime: [10, 30] } },
      Clockwork: { tip: 'Tiny gears ticking round', knobs: { machine: 5, speed: [20, 40], size: [5, 30], rattle: [0, 15] } },
      Winch: { tip: 'Slow, heavy, creaking gears', knobs: { machine: 5, speed: [10, 30], size: [50, 80], strain: [40, 70], rattle: [30, 60] } },
    },
  },
  Squishy: {
    knobs: [
      twoWayKnob('size', 'Bubble size', 'Tiny high droplets (-) to big low glugs (+)'),
      twoWayKnob('thick', 'Thickness', 'Thin, splashy water (-) to thick, slow goo (+)'),
      knob('pressure', 'Pressure', 'How hard it squeezes and bubbles: more movement, more pops', { max: 200, normal: 100 }),
      knob('wet', 'Wetness', 'Adds wet little pops and bubbles', { normal: 0 }),
    ],
    make: (k, maker) => {
      let s = shifted(maker.make(), -k.size * 0.18);
      if (k.thick) s = { ...stretched(s, 2 ** (k.thick / 200)), lowPass: settingOf(s, 'lowPass') - k.thick * 0.35, resonance: settingOf(s, 'resonance') + Math.max(0, k.thick * 0.25) };
      const p = k.pressure / 100;
      if (p !== 1) s = { ...s, slide: settingOf(s, 'slide') * p, lowPassSweep: settingOf(s, 'lowPassSweep') * p, crackle: settingOf(s, 'crackle') * p, volume: settingOf(s, 'volume') * (0.7 + 0.3 * p) };
      if (k.wet > 0) s = { ...s, crackle: Math.max(settingOf(s, 'crackle'), k.wet * 1.5), crackleLength: s.crackle ? settingOf(s, 'crackleLength') : 12, crackleDepth: Math.min(settingOf(s, 'crackleDepth'), 20 + k.wet * 0.6) };
      return s;
    },
    makers: {
      'Slime step': { tip: 'A sticky step through goo', make: () => ({ wave: randomPick(['pink', 'noise']), pitch: randomNumber(400, 900), attack: randomNumber(5, 15), sustain: randomNumber(30, 60), decay: randomNumber(120, 220), lowPass: randomNumber(35, 50), lowPassSweep: randomNumber(60, 120), resonance: randomNumber(60, 80), crackle: randomNumber(40, 90), crackleLength: randomNumber(10, 25), crackleDepth: randomNumber(30, 50), volume: 100, range: 6 }) },
      Squelch: { tip: 'A wet, squeezy squelch', make: () => ({ wave: randomPick(['sawtooth', 'pink']), pitch: randomNumber(80, 200), attack: randomNumber(10, 30), sustain: randomNumber(80, 160), decay: randomNumber(60, 120), lowPass: randomNumber(20, 35), lowPassSweep: randomNumber(80, 160), resonance: randomNumber(70, 85), wander: randomNumber(2, 5), wanderSpeed: randomNumber(10, 30), volume: 45 }) },
      Splat: { tip: 'Something wet hitting the floor', make: () => ({ wave: 'noise', pitch: randomNumber(500, 1200), attack: 0, punch: randomNumber(50, 80), sustain: randomNumber(10, 30), decay: randomNumber(150, 300), lowPass: randomNumber(50, 65), lowPassSweep: -randomNumber(40, 80), resonance: randomNumber(30, 55), crackle: randomNumber(80, 180), crackleLength: randomNumber(8, 20), crackleDepth: randomNumber(40, 65), volume: 100 }) },
      'Bubble pop': { tip: 'One bubble popping', make: () => ({ wave: 'sine', pitch: randomNumber(300, 700), slide: randomNumber(150, 350), attack: 0, sustain: randomNumber(5, 15), punch: 30, decay: randomNumber(20, 45), volume: 55 }) },
      Bubbles: { tip: 'Little rising bloops', make: () => ({ wave: 'sine', pitch: randomNumber(250, 600), slide: randomNumber(60, 140), attack: 0, sustain: randomNumber(20, 40), decay: randomNumber(20, 50), repeats: randomPick([3, 4, 6, 8]), gap: randomNumber(30, 160), wander: sometimes(randomNumber(2, 5)), wanderSpeed: randomNumber(3, 8), lowPass: sometimes(randomNumber(60, 85)), volume: 50 }) },
      Potion: { tip: 'A bubbling cauldron that loops. Pressure makes it boil harder', make: () => ({ wave: 'sine', pitch: randomNumber(200, 450), wander: randomNumber(8, 14), wanderSpeed: randomNumber(8, 20), crackle: randomNumber(6, 16), crackleLength: randomNumber(25, 60), crackleDepth: 100, lowPass: randomNumber(55, 75), attack: 0, sustain: 3000, decay: 0, volume: 70, range: 6 }) },
      Gulp: { tip: 'A big swallow', make: () => ({ wave: 'sine', pitch: randomNumber(100, 180), slide: -randomNumber(20, 50), slideAccel: randomNumber(200, 600), attack: randomNumber(5, 15), sustain: randomNumber(40, 80), decay: randomNumber(60, 120), lowPass: randomNumber(40, 60), repeats: randomPick([1, 2, 3]), gap: randomNumber(150, 300), volume: 60 }) },
      Slurp: { tip: 'Slurping something up', make: () => ({ wave: 'pink', pitch: randomNumber(600, 1200), attack: randomNumber(30, 80), sustain: randomNumber(200, 400), decay: randomNumber(80, 150), lowPass: randomNumber(25, 40), lowPassSweep: randomNumber(50, 110), resonance: randomNumber(70, 88), wander: randomNumber(4, 8), wanderSpeed: randomNumber(15, 40), crackle: randomNumber(30, 80), crackleLength: 15, crackleDepth: 40, volume: 85 }) },
      Suction: { tip: 'A suction cup pulling free with a pop', make: () => ({ wave: randomPick(['sawtooth', 'square']), pitch: randomNumber(60, 120), slide: randomNumber(10, 30), attack: randomNumber(150, 300), sustain: randomNumber(10, 30), punch: randomNumber(50, 80), decay: randomNumber(40, 80), lowPass: randomNumber(15, 30), lowPassSweep: randomNumber(40, 90), resonance: randomNumber(65, 85), volume: 30 }) },
      Mud: { tip: 'Pulling something out of thick mud', make: () => ({ wave: 'pink', pitch: randomNumber(200, 450), attack: randomNumber(80, 200), sustain: randomNumber(300, 600), decay: randomNumber(100, 200), lowPass: randomNumber(25, 40), lowPassSweep: randomNumber(10, 30), resonance: randomNumber(65, 85), wander: randomNumber(5, 10), wanderSpeed: randomNumber(3, 8), crackle: randomNumber(10, 30), crackleLength: randomNumber(30, 60), crackleDepth: 50, volume: 95 }) },
      Plop: { tip: 'A drop falling into water', make: () => ({ wave: 'sine', pitch: randomNumber(700, 1400), slide: randomNumber(200, 450), attack: 0, sustain: randomNumber(5, 10), decay: randomNumber(40, 90), echo: sometimes(randomNumber(40, 90)), echoFeedback: 30, volume: 55 }) },
      Jelly: { tip: 'A big jelly wobbling', make: () => {
        const speed = randomNumber(5, 9);
        return { wave: randomPick(['sine', 'triangle']), pitch: randomNumber(70, 140), vibrato: randomNumber(2, 4), vibratoSpeed: speed, tremolo: randomNumber(30, 60), tremoloSpeed: speed, attack: randomNumber(10, 30), sustain: randomNumber(200, 400), decay: randomNumber(300, 500), lowPass: randomNumber(40, 60), volume: 65 };
      } },
      Boing: { tip: 'A springy, wobbling boing', make: () => ({ wave: randomPick(['triangle', 'sine', 'square']), pitch: randomNumber(150, 300), slide: randomNumber(5, 20), vibrato: randomNumber(2, 5), vibratoSpeed: randomNumber(10, 18), attack: 0, sustain: randomNumber(50, 100), decay: randomNumber(300, 600), lowPass: randomNumber(50, 75), resonance: randomNumber(30, 50), volume: 55 }) },
      Burp: { tip: 'Excuse me', make: () => ({ wave: 'voice', pitch: randomNumber(60, 110), vowel: randomNumber(2.8, 3.6), mouth: randomNumber(115, 140), growl: randomNumber(50, 85), wander: randomNumber(1, 2), wanderSpeed: randomNumber(150, 300), breath: randomNumber(15, 30), slide: -randomNumber(1, 4), attack: randomNumber(20, 40), sustain: randomNumber(250, 500), decay: randomNumber(100, 200), volume: 70 }) },
    },
  },
  Birds: {
    knobs: [
      choiceKnob('voice', 'Voice', 'How it calls: a clear whistle, a nasal reed (parrots, gulls, ducks), a rough rasp (crows) or a soft hoot (owls, doves)', BIRD_VOICES),
      knob('size', 'Size', 'Tiny birds chirp high, big ones call low', { normal: 75 }),
      knob('calls', 'Calls', 'How many calls in a row', { min: 1, max: 12, unit: '', normal: 3 }),
      knob('length', 'Call length', 'How long each call is, from a tiny tick to a long whistle', { normal: 40 }),
      knob('gap', 'Gap', 'The pause between calls', { normal: 25 }),
      twoWayKnob('sweep', 'Sweep', 'Each call slides down (-) or up (+), up to an octave'),
      twoWayKnob('arch', 'Arch', 'Each call bows up (+) or dips down (-) in the middle'),
      knob('trill', 'Trill', 'Fast warbling in the pitch and volume', { normal: 0 }),
      knob('trillSpeed', 'Trill speed', 'How fast it trills'),
      knob('rasp', 'Rasp', 'A rough, scratchy throat', { normal: 0 }),
      twoWayKnob('phrase', 'Phrase', 'Each call goes down (-) or up (+) from the last, like a song falling or climbing'),
    ],
    make: bird,
    makers: {
      Chirp: { tip: 'One quick, bright call', knobs: { voice: 0, size: [75, 90], calls: 1, length: [35, 60], sweep: [-70, 60], arch: [20, 90], trill: [0, 10] } },
      Sparrow: { tip: 'A few short, chattering chirps', knobs: { voice: 0, size: [78, 90], calls: [3, 6], length: [25, 40], gap: [15, 30], sweep: [-60, -10], arch: [30, 80], trill: [5, 20], rasp: [5, 25], phrase: [-20, 20] } },
      Songbird: { tip: 'A lilting little song', knobs: { voice: 0, size: [65, 85], calls: [3, 6], length: [35, 55], gap: [15, 35], sweep: [-20, 45], arch: [35, 80], trill: [10, 35], trillSpeed: [15, 50], phrase: [-40, 40] } },
      Robin: { tip: 'Clear whistles going up and down', knobs: { voice: 0, size: [70, 82], calls: [3, 5], length: [35, 50], gap: [8, 18], sweep: [-60, 60], arch: [-40, 60], trill: [0, 25], phrase: [-50, 50] } },
      Canary: { tip: 'A bright, fast rolling trill', knobs: { voice: 0, size: [75, 90], calls: [1, 3], length: [60, 85], gap: [10, 20], sweep: [-15, 25], arch: [10, 40], trill: [55, 90], trillSpeed: [65, 100] } },
      Warbler: { tip: 'A bubbly, tumbling warble', knobs: { voice: 0, size: [65, 80], calls: [4, 8], length: [30, 45], gap: [5, 20], sweep: [-40, 40], arch: [-50, 70], trill: [30, 65], trillSpeed: [20, 65], phrase: [-60, 60] } },
      Chick: { tip: 'Little falling peeps', knobs: { voice: 0, size: [86, 95], calls: [2, 5], length: [30, 45], gap: [20, 40], sweep: [-80, -50], arch: [0, 30] } },
      Parrot: { tip: 'A nasal, raspy squawk', knobs: { voice: 1, size: [30, 45], calls: [1, 2], length: [45, 65], gap: [20, 40], sweep: [-60, 20], arch: [30, 80], trill: [15, 40], rasp: [35, 65] } },
      Seagull: { tip: 'Falling cries, like the seaside', knobs: { voice: 1, size: [52, 62], calls: [3, 6], length: [50, 62], gap: [5, 15], sweep: [-60, -30], arch: [30, 70], rasp: [15, 35], phrase: [-25, 0] } },
      Duck: { tip: 'Quack quack', knobs: { voice: 1, size: [18, 26], calls: [2, 4], length: [42, 52], gap: [15, 30], sweep: [-30, -10], arch: [0, 20], rasp: [40, 70] } },
      Hawk: { tip: 'A long, piercing scream', knobs: { voice: 1, size: [55, 65], calls: 1, length: [80, 92], sweep: [-40, -15], arch: [10, 30], trill: [5, 15], rasp: [40, 70] } },
      Crow: { tip: 'A hoarse, falling caw', knobs: { voice: 2, size: [20, 35], calls: [1, 3], length: [55, 70], gap: [35, 55], sweep: [-50, -15], arch: [15, 45], trill: [10, 30], rasp: [55, 90] } },
      Owl: { tip: 'A soft, hollow hoot', knobs: { voice: 3, size: [15, 25], calls: [1, 3], length: [75, 90], gap: [50, 85], sweep: [-15, 3], arch: [5, 20], trill: [0, 8] } },
      Cuckoo: { tip: 'Two hoots, the second lower', knobs: { voice: 3, size: [33, 38], calls: 2, length: [68, 75], gap: [20, 25], sweep: [-5, 3], phrase: [-100, -75] } },
      Dove: { tip: 'A gentle cooing', knobs: { voice: 3, size: [20, 27], calls: 3, length: [72, 80], gap: [10, 20], arch: [10, 30], phrase: [-15, 15] } },
    },
  },
  Beasts: {
    knobs: [
      choiceKnob('anatomy', 'Anatomy', 'What it calls with: a throat, a beak, gills (bubbly), a shell (insects), a spirit (airy and echoing), clockwork or a dog (barks and howls)', BEAST_ANATOMY),
      knob('pitch', 'Pitch', 'How high its voice is', { normal: 45 }),
      knob('size', 'Size', 'How big its mouth and throat are. Big ones boom, small ones squeak'),
      knob('calls', 'Calls', 'How many calls in a row', { min: 1, max: 8, unit: '', normal: 1 }),
      knob('length', 'Call length', 'How long each call is', { normal: 40 }),
      twoWayKnob('bend', 'Bend', 'Each call falls (-) like a grunt or rises (+) like a yelp'),
      twoWayKnob('arch', 'Arch', 'Each call bows up (+) or down (-) in the middle, like a howl'),
      knob('growl', 'Growl', 'A deep, rough growl in its voice', { normal: 20 }),
      knob('breath', 'Breath', 'Air and hiss in its voice', { normal: 20 }),
      knob('flutter', 'Flutter', 'Shaky, trembling or trilling', { normal: 10 }),
      twoWayKnob('evolution', 'Mouth move', 'How much its mouth changes shape during each call, and which way'),
    ],
    make: beast,
    makers: {
      Woof: { tip: 'A bark, from a yap to a big woof', knobs: { anatomy: 6, pitch: [55, 72], size: [50, 85], calls: 1, length: [0, 15], bend: [-80, -45], arch: [30, 60], growl: [50, 80], breath: [35, 60], flutter: [0, 5], evolution: [-15, 0] } },
      Meow: { tip: 'A cat\'s meow', knobs: { anatomy: 1, pitch: [62, 75], size: [20, 45], calls: 1, length: [42, 62], bend: [-20, 10], arch: [20, 50], growl: [0, 10], breath: [5, 15], flutter: [0, 12], evolution: [-80, -55] } },
      Pig: { tip: 'A grunt or an oink', knobs: { anatomy: 0, pitch: [30, 45], size: [40, 65], calls: [1, 3], length: [18, 32], bend: [-30, 10], arch: [0, 30], growl: [60, 90], breath: [20, 40], flutter: [20, 40], evolution: [-30, 0] } },
      Rat: { tip: 'Tiny squeaks', knobs: { anatomy: 1, pitch: [85, 98], size: [0, 15], calls: [2, 4], length: [5, 18], bend: [-20, 40], arch: [10, 50], growl: 0, breath: [5, 20], flutter: [0, 20] } },
      'Wolf howl': { tip: 'A long howl at the moon', knobs: { anatomy: 6, pitch: [58, 70], size: [50, 70], calls: 1, length: [88, 100], bend: [0, 25], arch: [40, 80], growl: [5, 20], breath: [10, 25], flutter: [3, 12], evolution: [-10, 5] } },
      'Tiny dragon': { tip: 'A little chirrup with a smoky throat', knobs: { anatomy: 1, pitch: [55, 72], size: [10, 35], calls: [1, 3], length: [25, 45], bend: [-70, 50], arch: [20, 70], growl: [15, 40], breath: [10, 35], flutter: [5, 25], evolution: [-40, 40] } },
      'Dragon roar': { tip: 'A huge, fiery roar', knobs: { anatomy: 0, pitch: [10, 25], size: [80, 100], calls: 1, length: [70, 85], bend: [-50, -15], arch: [20, 50], growl: [70, 100], breath: [40, 65], flutter: [5, 20], evolution: [10, 40] } },
      'Cave beast': { tip: 'A huge rumble from the dark', knobs: { anatomy: 0, pitch: [3, 18], size: [75, 100], calls: [1, 2], length: [78, 95], bend: [-40, 5], growl: [65, 100], breath: [20, 50], flutter: [10, 30], evolution: [10, 50] } },
      Zombie: { tip: 'A gurgling, hungry moan', knobs: { anatomy: 2, pitch: [15, 30], size: [65, 90], calls: [1, 2], length: [75, 92], bend: [-30, 0], arch: [-20, 20], growl: [40, 75], breath: [40, 65], flutter: [10, 30], evolution: [-40, -10] } },
      'Angry blob': { tip: 'A rubbery, bubbling grumble', knobs: { anatomy: 2, pitch: [20, 40], size: [45, 85], calls: [2, 5], length: [20, 40], bend: [-85, -30], arch: [0, 40], growl: [50, 90], breath: [3, 20], flutter: [20, 50], evolution: [-30, 30] } },
      'Alien purr': { tip: 'A happy creature with too many throats', knobs: { anatomy: 2, pitch: [25, 45], size: [25, 60], calls: [1, 3], length: [60, 80], bend: [-15, 15], growl: [40, 80], breath: [5, 20], flutter: [65, 95], evolution: [-20, 20] } },
      Insect: { tip: 'A bright, buzzing chirr', knobs: { anatomy: 3, pitch: [80, 95], size: [0, 25], calls: [3, 8], length: [20, 45], bend: [-12, 17], growl: [0, 5], breath: [10, 30], flutter: [60, 100] } },
      'Ghost whale': { tip: 'A long, hollow song from the deep', knobs: { anatomy: 4, pitch: [25, 42], size: [70, 100], calls: [1, 2], length: [95, 100], bend: [45, 95], arch: [10, 40], growl: [10, 35], breath: [10, 30], flutter: [3, 20], evolution: [-50, -20] } },
      'Forest spirit': { tip: 'A breathy, flickering call in the woods', knobs: { anatomy: 4, pitch: [55, 78], size: [20, 50], calls: [2, 4], length: [40, 60], bend: [-30, 50], arch: [10, 50], growl: [0, 15], breath: [45, 75], flutter: [25, 60], evolution: [-40, 40] } },
      'Clockwork pet': { tip: 'An eager little robot friend', knobs: { anatomy: 5, pitch: [50, 72], size: [10, 40], calls: [2, 5], length: [15, 35], bend: [20, 80], arch: [0, 40], growl: [3, 18], breath: [0, 10], flutter: [12, 45] } },
    },
  },
  Breath: {
    knobs: [
      choiceKnob('way', 'Breath', 'Breathing in, out, or in and then out', BREATH_WAYS),
      knob('breaths', 'Breaths', 'How many breaths in a row', { min: 1, max: 10, unit: '', normal: 1 }),
      knob('length', 'Length', 'How long each breath takes', { normal: 40 }),
      knob('effort', 'Effort', 'Soft and calm, or loud and forced', { normal: 40 }),
      knob('throat', 'Throat', 'From a narrow, high airway to a big deep chest'),
      knob('rasp', 'Rasp', 'Rough, crackly air', { normal: 10 }),
      knob('tremble', 'Tremble', 'Shaky, shivering air (not for in and out)', { normal: 10 }),
      knob('snore', 'Snore', 'Lets the voice in, from a little hum to a full rattling snore', { normal: 0 }),
      knob('space', 'Enclosure', 'Close echoes, like breathing in a mask, a helmet or a cave', { normal: 0 }),
    ],
    make: breathing,
    makers: {
      Inhale: { tip: 'One breath in', knobs: { way: 0, length: [30, 55], effort: [25, 65], throat: [25, 65], rasp: [0, 16], tremble: [3, 20], space: [0, 12] } },
      Exhale: { tip: 'One soft breath out', knobs: { way: 1, length: [35, 60], effort: [20, 60], throat: [35, 75], rasp: [0, 15], tremble: [2, 18], space: [0, 12] } },
      Sigh: { tip: 'A weary, fading sigh', knobs: { way: 1, length: [58, 78], effort: [25, 50], throat: [45, 80], rasp: [8, 30], tremble: [12, 40], snore: [0, 15] } },
      Gasp: { tip: 'A sharp, shaky breath in', knobs: { way: 0, length: [5, 25], effort: [80, 100], throat: [4, 30], rasp: [25, 60], tremble: [25, 65], snore: [0, 10] } },
      Sniff: { tip: 'A couple of quick sniffs', knobs: { way: 0, breaths: [2, 3], length: [0, 12], effort: [40, 70], throat: [0, 20], rasp: [0, 10], tremble: 0 } },
      Panting: { tip: 'Fast breathing after running', knobs: { way: 2, breaths: [4, 8], length: [10, 25], effort: [65, 100], throat: [25, 55], rasp: [20, 50] } },
      'Deep breath': { tip: 'One slow, full breath in and out', knobs: { way: 2, length: [85, 100], effort: [20, 50], throat: [40, 75], rasp: [0, 12] } },
      Huff: { tip: 'A short push of effort, hup!', knobs: { way: 1, length: [5, 20], effort: [70, 95], throat: [40, 70], rasp: [10, 30], snore: [20, 45] } },
      Cough: { tip: 'A rough cough or two', knobs: { way: 1, breaths: [1, 3], length: [0, 12], effort: [85, 100], throat: [30, 60], rasp: [40, 70], snore: [40, 70] } },
      Snore: { tip: 'A rattling snore', knobs: { way: 0, length: [55, 75], effort: [20, 50], throat: [40, 78], rasp: [20, 50], snore: [60, 95] } },
      'Sleeping beast': { tip: 'Huge, sleepy, rumbling lungs', knobs: { way: 2, breaths: [1, 2], length: [92, 100], effort: [20, 50], throat: [80, 100], rasp: [40, 80], snore: [65, 100], space: [15, 40] } },
      Diver: { tip: 'Breathing through a regulator underwater', knobs: { way: 2, breaths: [2, 3], length: [70, 85], effort: [55, 85], throat: [15, 40], rasp: [0, 12], space: [40, 70] } },
      Helmet: { tip: 'Breathing inside a helmet or mask', knobs: { way: 2, breaths: [1, 3], length: [60, 80], effort: [30, 60], throat: [20, 50], space: [70, 100] } },
      'Ghost breath': { tip: 'A cold, trembling breath out', knobs: { way: 1, length: [65, 85], effort: [30, 55], throat: [50, 80], tremble: [50, 90], space: [30, 60] } },
    },
  },
  Nature: {
    knobs: [
      twoWayKnob('bright', 'Brightness', 'Darker and further away (-), or brighter and closer (+)'),
      knob('wild', 'Wildness', 'Calmer (under 100) or wilder and more restless (over 100)', { max: 200, normal: 100 }),
      LENGTH_KNOB,
    ],
    make: (k, maker) => {
      let s = stretched(shifted(maker.make(), k.bright / 8.33), k.length / 100);
      if (k.bright) s = { ...s, lowPass: settingOf(s, 'lowPass') < 100 ? settingOf(s, 'lowPass') + k.bright * 0.2 : 100, highPass: settingOf(s, 'highPass') > 0 ? Math.max(1, settingOf(s, 'highPass') + k.bright * 0.15) : 0 };
      const w = k.wild / 100;
      if (w !== 1) s = { ...s, wander: settingOf(s, 'wander') * w, crackle: settingOf(s, 'crackle') * w, tremolo: Math.min(100, settingOf(s, 'tremolo') * w), vibrato: settingOf(s, 'vibrato') * w };
      return s;
    },
    makers: {
      Cricket: { tip: 'A high pulsing chirp, lovely as a loop at night', make: () => ({ wave: 'sine', pitch: randomNumber(3800, 5200), tremolo: 100, tremoloSpeed: randomNumber(25, 60), attack: 5, sustain: randomNumber(120, 250), decay: 20, repeats: randomPick([2, 3]), gap: randomNumber(200, 400), volume: 50 }) },
      Frog: { tip: 'A croak, shaken by fast tremolo', make: () => ({ wave: randomPick(['square', 'sawtooth', 'voice']), vowel: 3, mouth: 120, pitch: randomNumber(90, 200), slide: randomNumber(-8, 8), tremolo: randomNumber(80, 100), tremoloSpeed: randomNumber(18, 35), attack: 5, sustain: randomNumber(150, 300), decay: randomNumber(50, 100), lowPass: randomNumber(40, 60), repeats: randomPick([1, 2]), gap: randomNumber(150, 300) }) },
      Bee: { tip: 'A buzzing insect that loops', make: () => ({ wave: 'sawtooth', pitch: randomNumber(170, 260), wander: randomNumber(1, 2.5), wanderSpeed: randomNumber(2, 5), vibrato: randomNumber(0.2, 0.5), vibratoSpeed: randomNumber(8, 12), tremolo: randomNumber(10, 20), tremoloSpeed: randomNumber(5, 9), lowPass: randomNumber(45, 65), resonance: randomNumber(20, 40), attack: 0, sustain: 2000, decay: 0, volume: 45, range: 4 }) },
      Swarm: { tip: 'A cloud of buzzing insects that loops', make: () => ({ wave: 'sawtooth', pitch: randomNumber(180, 320), wander: randomNumber(2, 4), wanderSpeed: randomNumber(4, 10), vibrato: randomNumber(0.3, 0.8), vibratoSpeed: randomNumber(10, 18), flanger: randomNumber(2, 6), tremolo: randomNumber(20, 40), tremoloSpeed: randomNumber(0.3, 1), lowPass: randomNumber(50, 70), resonance: randomNumber(20, 40), highPass: 15, attack: 0, sustain: 3000, decay: 0, volume: 45, range: 8 }) },
      Wind: { tip: 'Gusting wind that loops. Resonance makes it whistle', make: () => ({ wave: 'pink', pitch: randomNumber(300, 900), wander: randomNumber(6, 12), wanderSpeed: randomNumber(0.3, 1), lowPass: randomNumber(45, 65), resonance: randomNumber(40, 75), tremolo: randomNumber(20, 45), tremoloSpeed: randomNumber(0.2, 0.5), attack: 0, sustain: randomNumber(3000, 4500), decay: 0, volume: 70, range: 20 }) },
      Blizzard: { tip: 'A howling, icy wind that loops', make: () => ({ wave: 'pink', pitch: randomNumber(900, 1600), wander: randomNumber(8, 14), wanderSpeed: randomNumber(0.5, 1.5), lowPass: randomNumber(60, 75), resonance: randomNumber(65, 85), highPass: randomNumber(25, 40), tremolo: randomNumber(30, 50), tremoloSpeed: randomNumber(0.3, 0.8), crackle: sometimes(randomNumber(100, 250)), crackleLength: 3, crackleDepth: 25, attack: 0, sustain: randomNumber(3500, 4500), decay: 0, volume: 70, range: 20 }) },
      // rain and fire were measured rather than just tried: rain is soft noise with most of its sound
      // between 500 Hz and 8 kHz (white noise is mostly above 8 kHz, which screeches), and fire is a
      // 300-700 Hz roar (no deep rumble) that the crackle only partly chops, so the roar stays under it
      Rain: { tip: 'Steady pattering rain that loops', make: () => ({ wave: 'pink', pitch: randomNumber(1800, 3000), highPass: randomNumber(45, 52), lowPass: randomNumber(86, 92), crackle: randomNumber(200, 400), crackleLength: randomNumber(6, 12), crackleDepth: randomNumber(45, 65), attack: 0, sustain: 3000, decay: 0, volume: 75, range: 16 }) },
      Storm: { tip: 'Heavy rain coming and going in waves, that loops', make: () => ({ wave: 'pink', pitch: randomNumber(1200, 2000), highPass: randomNumber(30, 40), lowPass: randomNumber(80, 88), crackle: randomNumber(350, 500), crackleLength: randomNumber(10, 20), crackleDepth: randomNumber(35, 50), wander: randomNumber(3, 6), wanderSpeed: randomNumber(0.2, 0.5), tremolo: randomNumber(20, 35), tremoloSpeed: randomNumber(0.15, 0.3), attack: 0, sustain: 4000, decay: 0, volume: 85, range: 20 }) },
      // thunder is a bright crack (white noise with the low-pass wide open, and lots of punch) that the
      // low-pass sweeps down into a deep, ringing rumble. long pops that only partly chop it are the
      // rolls, and the echo is it bouncing round the sky
      Thunder: { tip: 'A crack of thunder rolling away', make: () => ({ wave: 'noise', pitch: randomNumber(300, 700), slide: -randomNumber(4, 10), attack: 0, punch: randomNumber(80, 100), sustain: randomNumber(150, 400), decay: randomNumber(2500, 4000), lowPass: randomNumber(80, 90), lowPassSweep: -randomNumber(11, 17), resonance: randomNumber(25, 45), crackle: randomNumber(10, 25), crackleLength: randomNumber(150, 350), crackleDepth: randomNumber(50, 70), echo: randomNumber(180, 320), echoFeedback: randomNumber(40, 55), volume: 100, range: 40 }) },
      Fire: { tip: 'A roaring, crackling fire that loops', make: () => ({ wave: 'pink', pitch: randomNumber(1000, 1800), highPass: randomNumber(25, 32), lowPass: randomNumber(52, 60), resonance: randomNumber(0, 15), crackle: randomNumber(15, 35), crackleLength: randomNumber(3, 6), crackleDepth: randomNumber(60, 75), attack: 0, sustain: 3000, decay: 0, volume: 90, range: 6 }) },
      Stream: { tip: 'Babbling water that loops', make: () => ({ wave: 'pink', pitch: randomNumber(700, 1600), crackle: randomNumber(80, 200), crackleLength: randomNumber(15, 40), wander: randomNumber(2, 5), wanderSpeed: randomNumber(2, 6), lowPass: randomNumber(55, 75), highPass: randomNumber(15, 30), attack: 0, sustain: 3000, decay: 0, volume: 95, range: 10 }) },
      Waterfall: { tip: 'A rushing waterfall that loops', make: () => ({ wave: 'pink', pitch: randomNumber(800, 1400), highPass: randomNumber(15, 25), lowPass: randomNumber(65, 80), crackle: randomNumber(300, 500), crackleLength: randomNumber(10, 25), crackleDepth: randomNumber(25, 40), attack: 0, sustain: 3000, decay: 0, volume: 95, range: 18 }) },
      Ocean: { tip: 'One wave rolling in and out, that loops', make: () => {
        const sustain = randomNumber(3500, 5000);
        return { wave: 'pink', pitch: randomNumber(500, 1000), lowPass: randomNumber(50, 65), highPass: randomNumber(5, 15), tremolo: randomNumber(70, 90), tremoloSpeed: 1000 / sustain, crackle: randomNumber(80, 160), crackleLength: 30, crackleDepth: 20, wander: 3, wanderSpeed: 0.3, attack: 0, sustain, decay: 0, volume: 90, range: 25 };
      } },
      // a rustle is hundreds of tiny clicks a second over a soft hiss that keeps going (fewer, longer
      // pops that chop it all the way are a firecracker), swelling up and down with the breeze
      Leaves: { tip: 'Leaves rustling in the breeze, that loops', make: () => ({ wave: 'pink', pitch: randomNumber(2500, 4000), highPass: randomNumber(50, 60), lowPass: randomNumber(90, 97), crackle: randomNumber(400, 500), crackleLength: randomNumber(1.5, 4), crackleDepth: randomNumber(40, 60), wander: randomNumber(3, 6), wanderSpeed: randomNumber(0.5, 1), tremolo: randomNumber(50, 80), tremoloSpeed: randomNumber(0.2, 0.5), attack: 0, sustain: 3000, decay: 0, volume: 100, range: 8 }) },
      Drip: { tip: 'Water dripping in a cave, that loops', make: () => ({ wave: 'sine', pitch: randomNumber(500, 1100), slide: randomNumber(150, 350), attack: 0, sustain: randomNumber(5, 15), decay: randomNumber(30, 60), repeats: randomPick([1, 2]), gap: randomNumber(600, 1400), repeatPitch: sometimes(randomPick([-3, 2])), echo: randomNumber(150, 300), echoFeedback: randomNumber(35, 55), volume: 50, range: 10 }) },
    },
  },
  // voices are for talking (an npc's voice in npcs.js), so they're one short syllable
  Voices: {
    knobs: [
      twoWayKnob('age', 'Age', 'Younger (-): higher, quicker and livelier. Older (+): slower, breathier and shakier'),
      twoWayKnob('size', 'Size', 'Smaller (-) or bigger (+): the pitch and the size of the mouth together'),
      twoWayKnob('mood', 'Mood', 'Calm and flat (-), or excited and bouncy (+)'),
      knob('gravel', 'Gravel', 'A rough, gravelly voice', { normal: 0 }),
    ],
    make: (k, maker) => {
      const s = maker.make();
      const get = (key) => settingOf(s, key);
      const out = { ...s, pitch: get('pitch') * 2 ** (-k.size / 100), mouth: get('mouth') * (1 + k.size * 0.004), expression: get('expression') * 2 ** (k.mood / 100), talkSpeed: get('talkSpeed') * (1 + k.mood * 0.003) };
      if (k.age > 0) Object.assign(out, { breath: get('breath') + k.age * 0.25, vibrato: Math.max(get('vibrato'), k.age * 0.006), wander: Math.max(get('wander'), k.age * 0.008), wanderSpeed: get('wander') > 0 ? get('wanderSpeed') : 300, talkSpeed: out.talkSpeed * (1 - k.age * 0.003) });
      if (k.age < 0) Object.assign(out, { pitch: out.pitch * 2 ** (-k.age / 170), mouth: out.mouth * (1 + k.age * 0.0025), expression: out.expression - k.age * 0.02, talkSpeed: out.talkSpeed * (1 - k.age * 0.0015) });
      if (k.gravel > 0) Object.assign(out, { wander: Math.max(out.wander ?? get('wander'), k.gravel * 0.025), wanderSpeed: 400, growl: Math.max(get('growl'), k.gravel * 0.6), breath: (out.breath ?? get('breath')) + k.gravel * 0.1 });
      return out;
    },
    makers: {
      Man: { tip: 'A grown man\'s voice', make: () => voiceSettings({ pitch: randomNumber(95, 135), mouth: randomNumber(98, 110), breath: randomNumber(5, 15), expression: randomNumber(2, 3.5), talkSpeed: randomNumber(38, 48) }) },
      Woman: { tip: 'A grown woman\'s voice', make: () => voiceSettings({ pitch: randomNumber(185, 240), mouth: randomNumber(82, 90), breath: randomNumber(12, 25), expression: randomNumber(3, 4.5), talkSpeed: randomNumber(42, 50) }) },
      'Old man': { tip: 'Slow, breathy and a bit shaky', make: () => voiceSettings({ pitch: randomNumber(95, 125), mouth: randomNumber(100, 112), breath: randomNumber(25, 40), vibrato: randomNumber(0.3, 0.6), vibratoSpeed: randomNumber(5, 7), wander: randomNumber(0.4, 0.9), wanderSpeed: randomNumber(200, 400), expression: randomNumber(2, 3), talkSpeed: randomNumber(26, 34) }) },
      'Old woman': { tip: 'Slow, breathy and wavering', make: () => voiceSettings({ pitch: randomNumber(165, 210), mouth: randomNumber(84, 90), breath: randomNumber(30, 45), vibrato: randomNumber(0.4, 0.8), vibratoSpeed: randomNumber(5.5, 7), wander: randomNumber(0.3, 0.7), wanderSpeed: randomNumber(200, 400), expression: randomNumber(3, 4), talkSpeed: randomNumber(28, 36) }) },
      Teen: { tip: 'A young, quick voice', make: () => voiceSettings({ pitch: randomNumber(140, 200), mouth: randomNumber(88, 96), breath: randomNumber(10, 20), expression: randomNumber(3.5, 5), talkSpeed: randomNumber(50, 60) }) },
      Child: { tip: 'A small, bright, lively voice', make: () => voiceSettings({ pitch: randomNumber(260, 340), mouth: randomNumber(66, 74), breath: randomNumber(8, 15), expression: randomNumber(4.5, 6.5), talkSpeed: randomNumber(48, 56) }) },
      Baby: { tip: 'Babbling goo-goo noises', make: () => voiceSettings({ pitch: randomNumber(360, 460), mouth: randomNumber(52, 60), breath: randomNumber(10, 20), vowelSlide: eitherWay(randomNumber(1, 3)), expression: randomNumber(6, 9), talkSpeed: randomNumber(26, 34), attack: randomNumber(20, 30) }) },
      Gruff: { tip: 'Deep and gravelly', make: () => voiceSettings({ pitch: randomNumber(70, 95), mouth: randomNumber(112, 125), breath: randomNumber(15, 25), wander: randomNumber(1, 2), wanderSpeed: randomNumber(350, 700), growl: randomNumber(10, 30), crush: sometimes(randomNumber(5, 15)), expression: randomNumber(1.5, 2.5), talkSpeed: randomNumber(34, 40) }) },
      Innocent: { tip: 'Soft, gentle and sweet', make: () => voiceSettings({ pitch: randomNumber(240, 300), mouth: randomNumber(76, 84), breath: randomNumber(25, 40), expression: randomNumber(4, 5.5), talkSpeed: randomNumber(38, 44), attack: randomNumber(15, 25) }) },
      Goblin: { tip: 'A sneaky, scratchy little voice', make: () => voiceSettings({ pitch: randomNumber(180, 260), mouth: randomNumber(60, 72), breath: randomNumber(15, 25), wander: randomNumber(0.8, 1.5), wanderSpeed: randomNumber(300, 600), growl: randomNumber(15, 35), expression: randomNumber(5, 7), talkSpeed: randomNumber(55, 65) }) },
      Fairy: { tip: 'A tiny, twinkly voice', make: () => voiceSettings({ pitch: randomNumber(500, 700), mouth: randomNumber(48, 58), breath: randomNumber(30, 45), vibrato: randomNumber(0.3, 0.6), vibratoSpeed: randomNumber(8, 11), echo: randomNumber(80, 140), echoFeedback: randomNumber(25, 40), expression: randomNumber(6, 8), talkSpeed: randomNumber(50, 60), volume: 50 }) },
      Alien: { tip: 'Something not from around here. Every press is very different', make: () => voiceSettings({ pitch: randomNumber(150, 600), mouth: randomNumber(45, 150), fm: randomNumber(15, 45), fmRatio: randomNumber(0.5, 3.5), vibrato: randomNumber(0.5, 3), vibratoSpeed: randomNumber(6, 18), vowelSlide: eitherWay(randomNumber(2, 6)), expression: randomNumber(6, 10), talkSpeed: randomNumber(35, 60) }) },
      Robot: { tip: 'A flat, crunchy machine voice', make: () => voiceSettings({ pitch: randomNumber(90, 160), mouth: randomNumber(95, 110), breath: 0, crush: randomNumber(35, 60), flanger: sometimes(randomNumber(0.5, 2)), expression: randomNumber(0, 0.5), talkSpeed: randomNumber(36, 44) }) },
      Monster: { tip: 'A huge growling beast', make: () => voiceSettings({ pitch: randomNumber(45, 70), mouth: randomNumber(135, 160), breath: randomNumber(25, 40), wander: randomNumber(1.5, 3), wanderSpeed: randomNumber(150, 400), growl: randomNumber(30, 60), crush: sometimes(randomNumber(10, 25)), lowPass: randomNumber(55, 75), expression: randomNumber(2, 3), talkSpeed: randomNumber(26, 34), volume: 80 }) },
      Ghost: { tip: 'A whispery, echoing spirit', make: () => voiceSettings({ pitch: randomNumber(220, 380), mouth: randomNumber(80, 95), breath: randomNumber(75, 95), vibrato: randomNumber(0.5, 1.5), vibratoSpeed: randomNumber(4, 6), flanger: randomNumber(2, 5), echo: randomNumber(150, 250), echoFeedback: randomNumber(30, 45), expression: randomNumber(4, 6), talkSpeed: randomNumber(28, 36), attack: randomNumber(25, 40), decay: randomNumber(80, 120), volume: 85 }) },
    },
  },
};

// what a New voice starts as: a plain man's voice, so there's something to hear straight away
const NEW_VOICE = { kind: 'voice', wave: 'voice', pitch: 120, attack: 10, sustain: 60, decay: 50 };

const SoundEditor = {
  active: false,
  // the sound being changed. a copy, so nothing changes in the game until Save
  draft: null,
  // its name when the editor opened, '' for a new sound
  original: '',
  // (name) => {} run after it's saved, or null. an npc's New voice uses it to take the new voice
  onSave: null,
  // the draft as text when it opened, for Cancel to tell if anything's changed
  openedAs: '',
  // ui elements kept to change later: the text boxes (and which has the typing), each setting's
  // slider by key, buttons, and the tab buttons by name
  nameField: null,
  sayField: null,
  typingInto: null,
  sliders: {},
  loopButton: null,
  saveButton: null,
  undoButton: null,
  chooseFileButton: null,
  tabButtons: {},
  // the open tab of sliders (a SOUND_EDITOR.tabs name) and kind of make one buttons. they stay the
  // same between openings
  tab: 'Pitch',
  makers: 'Game',
  // the make one button the draft came from, so its knobs can make it again: { kind, name, knobs
  // (by key), seed (for its random numbers), range (heard from when it was pressed), made (the
  // settings it made, to tell what's been changed by hand since) }, or null
  recipe: null,
  // each kind's knob sliders by key, and whether a knob's moved since the last time it played
  knobSliders: {},
  knobTurned: false,
  // section headings to draw, { text, x, y, tab }, and where each tab's hint goes
  headings: [],
  hintTop: {},
  // earlier drafts for Undo, and the draft as text when it last went in (update())
  history: [],
  settled: '',
  // Cancel was pressed once with changes, so the next one closes
  cancelling: false,
  // audio Files chosen since the page loaded, by file name. Export downloads these too, since the game
  // only loads audio from its own folder
  newFiles: {},
  // the draft as text and the pitch the last time it started playing, so Loop knows to start it again
  // when something changes, and when that was (millis())
  playedAs: null,
  playedPitch: null,
  playedAt: 0,

  // opens it on a sound or voice by name, or a new one of a kind (SOUND_KINDS) with no name. a new
  // sound starts as the normal settings (a plain square beep), a new voice as a plain man's voice.
  // onSave(name) runs after it's saved. it stops every sound first, so nothing from the game plays
  // over it, and voices open on the Voice tab and Voices buttons
  open(name = null, kind = 'sound', onSave = null) {
    this.active = true;
    this.original = name ?? '';
    this.onSave = onSave;
    this.draft = soundSettings(name ? findSound(name) : kind === 'voice' ? NEW_VOICE : { kind });
    if (this.draft.kind === 'voice') {
      this.tab = 'Voice';
      this.makers = 'Voices';
    }
    this.openedAs = JSON.stringify(this.draft);
    this.settled = this.openedAs;
    this.history = [];
    this.cancelling = false;
    this.headings = [];
    this.sliders = {};
    this.tabButtons = {};
    this.recipe = null;
    this.knobSliders = {};
    if (this.tab === 'Character') this.tab = 'Pitch';
    // keys go into the text boxes (input.js)
    Input.typing = true;
    Sound.stopAll();

    const L = SOUND_EDITOR;
    const add = (element) => UI.add(Object.assign(element, { group: 'sound-editor' }));
    add(new SoundEditorPanel({ x: 0, y: 0, w: GAME_W, h: GAME_H }));

    // the top: name, Undo, Cancel and Save
    this.nameField = add(new TextField({ x: 170, y: 6, w: 160, h: 24, value: name ?? '' }));
    this.typeInto(this.nameField);
    this.undoButton = add(new Button({ x: GAME_W - 280, y: 6, w: 80, h: 24, label: 'Undo', style: 'editor', onClick: () => this.undo() }));
    add(new Button({ x: GAME_W - 194, y: 6, w: 80, h: 24, label: 'Cancel', style: 'editor', onClick: () => this.cancel() }));
    this.saveButton = add(new Button({ x: GAME_W - 108, y: 6, w: 92, h: 24, label: 'Save', style: 'editorPrimary', onClick: () => this.save() }));
    // Sound or Voice: which library it goes in when it's saved
    Object.entries(SOUND_KINDS).forEach(([kind, label], i) => add(Object.assign(new EditorButton({
      x: 340 + i * 64, y: 6, w: 60, h: 24, label,
      isOn: () => this.draft.kind === kind,
      onClick: () => this.changeKind(kind),
    }), { tip: kind === 'voice'
      ? 'Voice: for npcs to talk with. Voices are in the map editor\'s Voices tab, and only voices can be given to npcs'
      : 'Sound: for sound blocks and anything else that plays a sound. Sounds are in the map editor\'s Sounds tab' })));

    // the left: visualiser, Play / Stop / Loop, piano, make one buttons
    const x = L.left;
    add(new SoundVisualiser({ x, y: L.visualiserTop, w: L.leftWidth, h: L.visualiserHeight, sound: () => this.draft }));
    add(new Button({ x, y: L.playTop, w: 100, h: 24, label: '▶  Play', style: 'editorPrimary', onClick: () => this.play() }));
    add(new Button({
      x: x + 104, y: L.playTop, w: 92, h: 24, label: '■  Stop', style: 'editor',
      onClick: () => {
        this.loopButton.on = false;
        Sound.stopPreview();
      },
    }));
    // turning Loop on plays it looping (at the last piano note, if one was pressed), turning it off
    // stops it. while it's on, update() restarts it whenever the draft changes
    this.loopButton = add(new Button({
      x: x + 200, y: L.playTop, w: 100, h: 24, label: '↻  Loop', style: 'editor', toggle: true,
      onClick: (button) => (button.on ? this.play(this.playedPitch) : Sound.stopPreview()),
    }));
    add(new SoundPiano({ x, y: L.pianoTop, w: L.leftWidth, h: L.pianoHeight, onPlay: (note) => this.play(noteFrequency(note)) }));
    // a tab for each kind of make one button, in two rows (smaller text, so they fit), then that
    // kind's buttons in rows of 3 (they're all made now and the tabs show one kind at a time), then
    // Random and Mutate (not in SOUND_GENERATORS since they work differently, see randomSettings()
    // and mutate())
    const kinds = Object.keys(SOUND_GENERATORS);
    const perRow = Math.ceil(kinds.length / 2);
    kinds.forEach((kind, i) => {
      const row = Math.floor(i / perRow);
      const inRow = row === 0 ? perRow : kinds.length - perRow;
      const kindW = (L.leftWidth - (inRow - 1) * 4) / inRow;
      add(Object.assign(new EditorButton({
        x: x + (i % perRow) * (kindW + 4), y: L.makersTop + 14 + row * 22, w: kindW, h: 20, label: kind, style: { ...BUTTON_STYLES.editor, textSize: 11 },
        isOn: () => this.makers === kind,
        onClick: () => this.showMakers(kind),
      }), { tip: `${kind}: show the ${kind.toLowerCase()} buttons` }));
    });
    const buttonsTop = L.makersTop + 62;
    for (const kind of kinds) {
      Object.entries(SOUND_GENERATORS[kind].makers).forEach(([label, maker], i) => add(Object.assign(new Button({
        x: x + (i % 3) * 102, y: buttonsTop + Math.floor(i / 3) * 26, w: 96, h: 22, label, style: 'editor',
        onClick: () => this.generate(kind, label),
      }), { makers: kind, tip: `${label}: ${maker.tip}. Press it again for another one, then change it in the Character tab` })));
    }
    const lastRow = GAME_H - L.footerHeight - 34;
    add(Object.assign(new Button({
      x, y: lastRow, w: 148, h: 24, label: 'Random', style: 'editorPrimary',
      onClick: () => {
        this.recipe = null;
        this.replace(this.randomSettings());
        this.showParts();
      },
    }), { tip: 'Random: anything at all, from any wave. A lot of it is noise, press it again' }));
    add(Object.assign(new Button({ x: x + 152, y: lastRow, w: 148, h: 24, label: 'Mutate', style: 'editorPrimary', onClick: () => this.mutate() }),
      { tip: 'Mutate: nudges the settings that are on a little bit, for a sound that\'s similar but different' }));

    // the right: a button for each wave (and Choose file, only shown for files), then the tabs, then
    // the sliders
    const waves = Object.keys(SOUND_WAVES);
    const waveW = (L.columnWidth * 2 + L.columnGap - (L.waveColumns - 1) * 4) / L.waveColumns;
    waves.forEach((wave, i) => add(Object.assign(new EditorButton({
      x: L.right + (i % L.waveColumns) * (waveW + 4), y: L.wavesTop + Math.floor(i / L.waveColumns) * 26, w: waveW, h: 22, label: SOUND_WAVES[wave].label,
      isOn: () => this.draft.wave === wave,
      // file asks for a file the first time, and goes back to the chosen one after that
      onClick: () => (wave === 'file' && !this.draft.file ? this.chooseFile() : this.change({ wave })),
    }), { tip: `${SOUND_WAVES[wave].label}: ${SOUND_WAVES[wave].tip}` })));
    this.chooseFileButton = add(new Button({ x: GAME_W - 16 - 110, y: L.wavesTop - 20, w: 110, h: 18, label: 'Choose file...', style: 'editor', onClick: () => this.chooseFile() }));
    const tabW = (L.columnWidth * 2 + L.columnGap - (L.tabs.length - 1) * 4) / L.tabs.length;
    L.tabs.forEach((tab, i) => {
      this.tabButtons[tab.name] = add(Object.assign(new EditorButton({
        x: L.right + i * (tabW + 4), y: L.tabsTop, w: tabW, h: 24, label: tab.name,
        isOn: () => this.tab === tab.name,
        onClick: () => this.showTab(tab.name),
      }), { tip: `${tab.name}: ${tab.hint}` }));
      // one slider for every setting in the tab's sections, under the section's heading, going down
      // each column. a setting whose section isn't in a tab doesn't get a slider at all
      let bottom = L.slidersTop;
      tab.columns.forEach((sections, c) => {
        const columnX = L.right + c * (L.columnWidth + L.columnGap);
        let y = L.slidersTop;
        for (const section of sections) {
          this.headings.push({ text: section, x: columnX, y, tab: tab.name });
          y += L.sectionHeight;
          for (const setting of SOUND_SETTINGS.filter((s) => s.section === section)) {
            // tip is shown by SoundEditorPanel while it's hovered
            this.sliders[setting.key] = add(Object.assign(new Slider({
              ...setting,
              x: columnX, y, w: L.columnWidth, h: L.rowHeight,
              value: this.draft[setting.key],
              format: (value) => this.formatSetting(setting, value),
              onChange: (value) => { this.draft[setting.key] = value; },
            }), { tip: `${setting.label}: ${setting.tip}`, tab: tab.name }));
            y += L.rowHeight;
          }
          y += 6;
        }
        bottom = Math.max(bottom, y);
      });
      this.hintTop[tab.name] = bottom + 4;
    });
    // the Character tab: every kind's knobs, half in each column under a heading (SoundEditorPanel
    // draws it), and only the knobs of the kind the draft came from are shown (showParts())
    for (const [kind, { knobs }] of Object.entries(SOUND_GENERATORS)) {
      this.knobSliders[kind] = {};
      const half = Math.ceil(knobs.length / 2);
      knobs.forEach((knob, i) => {
        const y = L.slidersTop + L.sectionHeight + (i % half) * L.rowHeight;
        this.knobSliders[kind][knob.key] = add(Object.assign(new Slider({
          ...knob,
          x: L.right + Math.floor(i / half) * (L.columnWidth + L.columnGap), y, w: L.columnWidth, h: L.rowHeight,
          value: knob.normal,
          format: (value) => (knob.options ? knob.options[value] : `${knob.min < 0 && value > 0 ? '+' : ''}${value} ${knob.unit}`),
          onChange: (value) => this.turnKnob(knob.key, value),
        }), { tip: `${knob.label}: ${knob.tip}`, tab: 'Character', knobsOf: kind }));
      });
    }
    // the Voice tab's Say box, under its sliders: type something and press Say (or Enter) to hear it
    const sayTop = this.hintTop.Voice;
    this.sayField = add(Object.assign(new TextField({ x: L.right + 36, y: sayTop, w: L.columnWidth * 2 + L.columnGap - 36 - 96, h: 24, value: L.sayText, maxLength: 52, allowed: /^[^\x00-\x1f\x7f]$/ }),
      { tab: 'Voice', tip: 'Say: type something here, then press Say (or Enter) to hear this sound saying it' }));
    add(Object.assign(new Button({ x: GAME_W - 16 - 90, y: sayTop, w: 90, h: 24, label: '▶  Say', style: 'editorPrimary', onClick: () => this.speak() }),
      { tab: 'Voice', tip: 'Say: plays this sound saying the words in the box, the way an npc with it as their voice talks' }));
    this.hintTop.Voice = sayTop + 32;
    this.showTab(this.tab);
    this.showMakers(this.makers);
  },

  // shows one tab of sliders (a SOUND_EDITOR.tabs name), hiding the rest
  showTab(name) {
    this.tab = name;
    this.showParts();
  },

  // shows one kind of make one buttons (a SOUND_GENERATORS name)
  showMakers(kind) {
    this.makers = kind;
    this.showParts();
  },

  // shows the open tab's sliders (in the Character tab, only the knobs of the recipe's kind) and the
  // open kind's make one buttons, hiding the rest
  showParts() {
    for (const element of UI.group('sound-editor')) {
      if (element.tab) element.visible = element.tab === this.tab && (!element.knobsOf || element.knobsOf === this.recipe?.kind);
      if (element.makers) element.visible = element.makers === this.makers;
    }
  },

  // makes the draft a sound or a voice. a voice gets the Voice tab and Voices buttons out, since that's
  // what it'll want next
  changeKind(kind) {
    this.draft.kind = kind;
    if (kind === 'voice') {
      this.showTab('Voice');
      this.showMakers('Voices');
    }
  },

  // which text box the typing goes into
  typeInto(field) {
    this.nameField.blur();
    this.sayField?.blur();
    field.focus();
    this.typingInto = field;
  },

  // what a setting's slider shows on its right. pitch is special: a note name for waves, just Hz for
  // the noises (they don't have a note), and a speed for files (a file's pitch is how fast it plays,
  // 440 being normal speed). vowel shows the vowel
  formatSetting(setting, value) {
    if (setting.key === 'pitch') {
      if (this.draft.wave === 'file') return `${Math.round((value / 440) * 100)}% speed`;
      return SOUND_WAVES[this.draft.wave].shape || this.draft.wave === 'metal' ? `${value} Hz  ${noteName(value)}` : `${value} Hz`;
    }
    if (setting.key === 'vowel') return Number.isInteger(value) ? VOWEL_NAMES[value] : `${VOWEL_NAMES[Math.floor(value)]} to ${VOWEL_NAMES[Math.ceil(value)]}`;
    if (setting.off === value) return 'off';
    // log sliders go from tiny to huge, so big values lose their decimals (368.9 shows as 369)
    if (setting.curve === 'log') return `${Number(value.toPrecision(3))} ${setting.unit}`;
    return `${value} ${setting.unit}`;
  },

  // Cancel or Escape: closes without saving. with changes it asks first (along the bottom), and the
  // second press closes
  cancel() {
    if (JSON.stringify(this.draft) !== this.openedAs && !this.cancelling) {
      this.cancelling = true;
      return;
    }
    this.close();
  },

  // closes it (Save and Cancel call this). the draft is just dropped
  close() {
    this.active = false;
    Input.typing = false;
    Sound.stopPreview();
    UI.removeGroup('sound-editor');
  },

  // why it can't be saved (shown along the bottom, and Save is greyed out), or null
  problem() {
    const name = cleanMapName(this.nameField.value); // mapfile.js, sound names follow the same rules
    if (!name) return 'Type a name for it at the top';
    // sounds and voices share sounds.json, so a name can only be used once across both
    if (name !== this.original && findSound(name)) return `There's already a ${SOUND_KINDS[findSound(name).kind].toLowerCase()} called ${name}, pick another name`;
    if (this.draft.wave === 'file' && !this.draft.file) return 'Choose an audio file first';
    return null;
  },

  // puts the sound or voice in its library (straight into the game, so npcs using a voice talk with
  // the new version), picks it in the palette, and closes. it only lasts until the page reloads,
  // unless it's exported (exportSounds())
  save() {
    if (this.problem()) return;
    const name = cleanMapName(this.nameField.value);
    const onSave = this.onSave;
    setSound(name, this.draft);
    Editor.showTab(this.draft.kind);
    Editor.pick({ kind: this.draft.kind, name });
    showMessage(`Saved ${name}. Export in the inspector to keep it`);
    this.close();
    onSave?.(name);
  },

  // every frame while it's open, from Editor.update(). the ui elements (sliders, buttons, piano)
  // update themselves through UI, this only does the typing and the things that depend on the draft
  update() {
    // clicking a text box gives it the typing
    if (Input.buttonsPressed.has('left') && UI.hovered instanceof TextField) this.typeInto(UI.hovered);
    // Tab is ignored since there's nothing sensible to tab to
    for (const key of Input.typed) {
      if (key === 'Enter') return this.typingInto === this.sayField ? this.speak() : this.save();
      if (key === 'Escape') return this.cancel();
      if (key.paste !== undefined) this.typingInto.paste(key.paste);
      else if (key !== 'Tab') this.typingInto.type(key);
    }
    const d = this.draft;
    // a change goes in the history once the mouse is let go, so dragging a slider is one Undo
    const now = JSON.stringify(d);
    if (now !== this.settled && !Input.buttonsHeld.has('left')) {
      this.history.push(JSON.parse(this.settled));
      this.settled = now;
      this.cancelling = false;
    }
    // sliders that don't do anything with the other settings as they are get greyed out (they keep
    // their value, it just doesn't change the sound). a new setting that only matters sometimes needs
    // a line here
    const shaped = Boolean(SOUND_WAVES[d.wave].shape);
    const matters = {
      pulseWidth: d.wave === 'square',
      pulseSweep: d.wave === 'square',
      fm: shaped,
      fmRatio: shaped && d.fm > 0,
      resonance: d.lowPass < 100 || d.lowPassSweep !== 0,
      jumpAt: d.jump !== 0,
      jump2At: d.jump2 !== 0,
      jumpRepeat: d.jump !== 0 || d.jump2 !== 0,
      repeatPitch: d.repeats > 1,
      vibratoSpeed: d.vibrato > 0,
      wanderSpeed: d.wander > 0,
      gap: d.repeats > 1,
      tremoloSpeed: d.tremolo > 0,
      crackleLength: d.crackle > 0,
      crackleDepth: d.crackle > 0,
      echoFeedback: d.echo > 0,
      vowel: d.wave === 'voice',
      vowelSlide: d.wave === 'voice',
      mouth: d.wave === 'voice',
      breath: d.wave === 'voice',
    };
    for (const [key, slider] of Object.entries(this.sliders)) slider.enabled = matters[key] ?? true;
    // a dot on the tabs that have settings that aren't normal, so you can see where the sound is made
    for (const tab of SOUND_EDITOR.tabs) {
      const changed = SOUND_SETTINGS.some((s) => tab.columns.flat().includes(s.section) && d[s.key] !== s.normal);
      this.tabButtons[tab.name].label = changed ? `${tab.name}  •` : tab.name;
    }
    this.chooseFileButton.visible = d.wave === 'file';
    this.saveButton.enabled = this.problem() === null;
    this.undoButton.enabled = this.history.length > 0;
    // with Loop on, start it again when something changes (at most every 0.1s, since the sound has to
    // be worked out again each time). with it off, a knob plays once it's let go
    if (this.loopButton.on && now !== this.playedAs && millis() - this.playedAt > 100) this.play(this.playedPitch);
    if (this.knobTurned && !Input.buttonsHeld.has('left')) {
      this.knobTurned = false;
      if (!this.loopButton.on) {
        if (this.talks()) this.speak();
        else this.play();
      }
    }
  },

  // plays the draft at full volume, at another pitch for the piano, looping if Loop is on. it
  // remembers what it played (playedAs, playedPitch) so update() can tell when to play it again
  play(pitch = null) {
    this.playedAs = JSON.stringify(this.draft);
    this.playedPitch = pitch;
    this.playedAt = millis();
    Sound.preview(this.draft, { loop: this.loopButton.on, pitch: pitch ?? this.draft.pitch });
  },

  // plays the draft saying the Say box's words (renderSpeech() in sound.js). it turns Loop off,
  // since talking doesn't loop
  speak() {
    this.loopButton.on = false;
    this.playedAs = JSON.stringify(this.draft);
    Sound.preview(this.draft, { say: this.sayField.value });
  },

  // swaps in new settings, moving every slider to match, and plays it (or says the Say box, for
  // talk). every big change goes through here, so this is the place to hook anything that should
  // happen on one. it plays at the draft's own pitch, so it forgets a piano note the loop was playing
  // at. picking the voice wave opens the Voice tab. it stays a sound or a voice (only the Sound and
  // Voice buttons change that)
  replace(settings, talk = false) {
    const wasVoice = this.draft.wave === 'voice';
    this.draft = soundSettings({ ...settings, kind: this.draft.kind });
    this.syncSliders();
    if (this.draft.wave === 'voice' && !wasVoice) this.showTab('Voice');
    if (talk) this.speak();
    else this.play();
  },

  // moves every slider to the draft's value. the sliders round to their step, so the draft gets their
  // rounded values back
  syncSliders() {
    for (const [key, slider] of Object.entries(this.sliders)) {
      slider.set(this.draft[key]);
      this.draft[key] = slider.value;
    }
  },

  // changes some settings, keeping the rest
  change(settings) {
    this.replace({ ...this.draft, ...settings });
  },

  // a random sound from a make one button. it picks the knobs (the maker's, or the knob's normal
  // value), then makes the sound from them (makeRecipe()), and opens the Character tab if these knobs
  // weren't showing. heard from stays the same unless the maker says, since that's about where it goes
  // rather than how it sounds
  generate(kind, name) {
    const { knobs, makers } = SOUND_GENERATORS[kind];
    const picked = {};
    for (const knob of knobs) {
      const pick = makers[name].knobs?.[knob.key] ?? knob.normal;
      const value = typeof pick === 'function' ? pick() : Array.isArray(pick) ? randomNumber(pick[0], pick[1]) : pick;
      picked[knob.key] = Math.min(knob.max, Math.max(knob.min, Math.round(value / knob.step) * knob.step));
    }
    const newKind = this.recipe?.kind !== kind;
    this.recipe = { kind, name, knobs: picked, seed: Math.floor(Math.random() * 2 ** 31), range: this.draft.range, made: null };
    // turnKnob() ignores these, since they're already the recipe's
    for (const knob of knobs) this.knobSliders[kind][knob.key].set(picked[knob.key]);
    this.replace({ range: this.recipe.range, ...this.makeRecipe() }, this.talks());
    this.recipe.made = { ...this.draft };
    if (newKind) this.tab = 'Character';
    this.showParts();
  },

  // the recipe's settings: its kind's make() with its knobs, using its own random numbers, so the same
  // recipe always makes the same sound
  makeRecipe() {
    const { kind, name, knobs, seed } = this.recipe;
    makerRandom = seededRandom(seed);
    try {
      return SOUND_GENERATORS[kind].make(knobs, SOUND_GENERATORS[kind].makers[name]);
    } finally {
      makerRandom = Math.random;
    }
  },

  // a knob moved: make the sound again with it. update() plays it once the mouse is let go
  turnKnob(key, value) {
    if (!this.recipe || this.recipe.knobs[key] === value) return;
    this.recipe.knobs[key] = value;
    this.remake();
    this.knobTurned = true;
  },

  // makes the draft again from its recipe, keeping anything that's been changed by hand since it was
  // last made (anything that's different from recipe.made), so the knobs and the other sliders work
  // together
  remake() {
    const r = this.recipe;
    const changed = Object.fromEntries(Object.keys(r.made).filter((key) => this.draft[key] !== r.made[key]).map((key) => [key, this.draft[key]]));
    this.draft = soundSettings({ range: r.range, ...this.makeRecipe(), kind: this.draft.kind });
    this.syncSliders();
    r.made = { ...this.draft };
    Object.assign(this.draft, changed);
    this.syncSliders();
  },

  // whether playing it should say the Say box: voices do, and so does anything from the Voices buttons
  talks() {
    return this.draft.kind === 'voice' || this.recipe?.kind === 'Voices';
  },

  // Random: a completely random sound. a random wave, and about a third of the settings moved
  // somewhere random. the volume shape is kept short enough to hear what it is. it picks a random spot
  // along each slider (using the slider's curve, borrowed from Slider without making one), so it
  // spreads like the sliders do. it's meant to be wild, a lot of what it makes is noise, press it again
  randomSettings() {
    const settings = { wave: randomPick(Object.keys(SOUND_WAVES).filter((wave) => wave !== 'file')), range: this.draft.range };
    for (const setting of SOUND_SETTINGS) {
      if (['volume', 'range', 'repeats', 'gap', 'talkSpeed', 'expression'].includes(setting.key) || randomBetween(0, 1) < 0.65) continue;
      settings[setting.key] = Slider.prototype.valueAt.call(setting, randomBetween(0, 1));
    }
    settings.attack = Math.min(settings.attack ?? 5, 300);
    settings.sustain = randomNumber(30, 400);
    settings.decay = Math.min(settings.decay ?? 100, 800);
    return settings;
  },

  // Mutate: nudges about half the settings that are doing something a little bit along their sliders
  // (up to 6% either way), for a sound that's similar but different. ones that are off stay off, so it
  // doesn't suddenly get an echo. the wave and heard from never change
  mutate() {
    const settings = { ...this.draft };
    for (const setting of SOUND_SETTINGS) {
      if (setting.key === 'range' || settings[setting.key] === setting.off || randomBetween(0, 1) < 0.5) continue;
      const slider = this.sliders[setting.key];
      settings[setting.key] = slider.valueAt(Math.min(1, Math.max(0, slider.positionOf(settings[setting.key]) + randomBetween(-0.06, 0.06))));
    }
    this.replace(settings);
  },

  // goes back to the draft before the last change (update() keeps the history)
  undo() {
    if (this.history.length === 0) return;
    this.draft = this.history.pop();
    this.settled = JSON.stringify(this.draft);
    this.syncSliders();
    this.play();
  },

  // lets you pick an audio file (pickFile() in utils.js) and uses it as the wave, held for as long as
  // the file is. everything else goes back to normal so it starts off sounding just like the file.
  // it's decoded straight away and put in SOUND_FILES (marked as asked, so loadAudioFile() won't try
  // to fetch it from the folder, where it isn't yet). the File is kept in newFiles for Export.
  // files over 5 s are cut to the first 5 s, since that's the longest hold can be
  chooseFile() {
    pickFile('audio/*,.mp3,.wav,.ogg', (file) => {
      file.arrayBuffer()
        .then(decodeAudio) // sound.js
        .then((decoded) => {
          SOUND_FILES[file.name] = decoded;
          audioFilesAsked.add(file.name);
          this.newFiles[file.name] = file;
          this.recipe = null;
          this.replace({ wave: 'file', file: file.name, attack: 0, sustain: Math.round(decoded.seconds * 1000), decay: 0, volume: this.draft.volume, range: this.draft.range });
          this.showParts();
          if (decoded.seconds * 1000 > SOUND_SETTINGS.find((s) => s.key === 'sustain').max) showMessage(`${file.name} is long, only the start of it is used`);
        })
        .catch(() => showMessage(`Couldn't open ${file.name} as audio`));
    });
  },

  // downloads sounds.json (sound.js) and any audio file chosen since the page loaded that a sound
  // uses, then says where they go (the download helpers are in utils.js). the inspector's Export
  // button on the Sounds tab. the browser might ask whether the page can download several files at
  // once the first time. files that were already in sounds/files/ aren't downloaded again
  exportSounds() {
    downloadTextFile('sounds.json', soundsToText());
    const files = [...new Set([...Object.values(SOUNDS), ...Object.values(VOICES)].map((sound) => sound.file))].filter((name) => this.newFiles[name]);
    for (const name of files) downloadData(name, this.newFiles[name]);
    const also = files.length > 0 ? `, and ${files.join(', ')} in sounds/files/` : '';
    showMessage(`Exported! Put sounds.json in assets/squimble-quest/sounds/${also}`);
  },
};

// the background of the whole sound editor, its headings and labels, and the tip line along the
// bottom. covers the whole screen, so nothing behind it can be clicked
class SoundEditorPanel extends UIElement {
  draw() {
    const L = SOUND_EDITOR;
    const C = EDITOR_COLOURS;
    const editor = SoundEditor;
    noStroke();
    fill(C.bar);
    rect(0, 0, GAME_W, GAME_H);
    fill(C.header);
    rect(0, 0, GAME_W, L.headerHeight);
    rect(0, GAME_H - L.footerHeight, GAME_W, L.footerHeight);
    fill(C.edge);
    rect(0, L.headerHeight, GAME_W, 1);
    rect(0, GAME_H - L.footerHeight, GAME_W, 1);
    // a line between the left and the right
    rect(L.right - 10, L.headerHeight + 8, 1, GAME_H - L.headerHeight - L.footerHeight - 16);

    fill(C.text);
    setText(14, BOLD, LEFT, CENTER);
    text(`${SOUND_KINDS[editor.draft.kind]} editor`, 16, L.headerHeight / 2);
    fill(C.dimText);
    setText(12, BOLD, LEFT, CENTER);
    text('Name', 130, L.headerHeight / 2);
    // the name it'll really be saved as, if tidying it changes it
    const typed = editor.nameField.value;
    const name = cleanMapName(typed);
    if (name && name !== typed) {
      setText(11, BOLD, LEFT, CENTER);
      text(`saves as ${name}`, 474, L.headerHeight / 2);
    }

    // headings
    setText(11, BOLD, LEFT, TOP);
    fill(C.dimText);
    text('WAVE', L.right, L.wavesTop - 16);
    text('MAKE ONE  (a random sound of that kind)', L.left, L.makersTop);
    for (const heading of editor.headings) {
      if (heading.tab !== editor.tab) continue;
      const words = heading.text.toUpperCase();
      fill(C.dimText);
      text(words, heading.x, heading.y + 4);
      fill(C.edge);
      rect(heading.x + textWidth(words) + 8, heading.y + 10, L.columnWidth - textWidth(words) - 8, 1);
    }
    // which file a file sound uses
    const draft = editor.draft;
    if (draft.wave === 'file') {
      fill(SOUND_COLOURS.edge);
      setText(11, BOLD, RIGHT, TOP);
      text(draft.file ? `${draft.file}${SOUND_FILES[draft.file] ? '' : ' (not loaded)'}` : 'no file chosen', GAME_W - 16 - 118, L.wavesTop - 16);
    }
    // the open tab's help, and the Say box's label
    const tab = L.tabs.find((t) => t.name === editor.tab);
    const width = L.columnWidth * 2 + L.columnGap;
    setText(11, NORMAL, LEFT, TOP);
    fill(C.dimText);
    if (tab.name !== 'Character') text(tab.hint, L.right, editor.hintTop[tab.name], width, 60);
    else if (!editor.recipe) text(tab.empty, L.right, L.slidersTop + 4, width, 60);
    else {
      // the hint goes under this kind's knobs, then the heading says which make one button they're from
      const rows = Math.ceil(SOUND_GENERATORS[editor.recipe.kind].knobs.length / 2);
      text(tab.hint, L.right, L.slidersTop + L.sectionHeight + rows * L.rowHeight + 10, width, 60);
      const words = `${editor.recipe.kind}  ·  ${editor.recipe.name}`.toUpperCase();
      setText(11, BOLD, LEFT, TOP);
      text(words, L.right, L.slidersTop + 4);
      fill(C.edge);
      rect(L.right + textWidth(words) + 8, L.slidersTop + 10, width - textWidth(words) - 8, 1);
    }
    if (tab.name === 'Voice') {
      setText(12, BOLD, LEFT, CENTER);
      text('Say', L.right, editor.sayField.y + editor.sayField.h / 2);
    }

    // along the bottom: Cancel asking, then the tip for whatever's under the mouse, then what's
    // stopping it saving in red, else how to use it
    const tip = UI.hovered?.visible && UI.hovered.tip;
    const problem = editor.problem();
    setText(11, BOLD, LEFT, CENTER);
    let line = 'Hover over anything to see what it does. Right click a slider to put it back to normal, or scroll over it to nudge it';
    fill(C.dimText);
    if (editor.cancelling) {
      fill(C.erase);
      line = 'This sound has changes. Press Cancel (or Escape) again to throw them away, or Save to keep them';
    } else if (tip) {
      line = tip;
    } else if (problem) {
      fill(C.erase);
      line = problem;
    }
    // in a box, so a long tip wraps onto a second line
    text(line, 16, GAME_H - L.footerHeight, GAME_W - 32, L.footerHeight);
  }
}

// the picture of the sound being edited, read every frame so it changes as you go, in two panels:
//   wave         a close-up of a few waves from just after it gets loud, from the real audio, so
//                filters and crunch show too. more waves for a higher pitch, taller when louder
//   whole sound  the whole thing from start to end (drawSoundShape() in sound.js), with a line moving
//                along it while it plays. while it's saying something (Say), it shows that instead
//                (only while it's saying it, since talking is slow to work out again on every change)
// and its note, pitch and length underneath.
//   sound  () => the settings to draw
class SoundVisualiser extends UIElement {
  constructor(options) {
    // just for show, clicks go through to what's behind
    super({ ...options, interactive: false });
    this.sound = options.sound;
  }

  draw() {
    const sound = this.sound();
    const preview = Sound.previewing;
    const say = preview && (millis() - preview.started) / 1000 < preview.seconds ? preview.say : null;
    const { samples } = Sound.render(sound);
    const { seconds } = Sound.render(sound, false, sound.pitch, say);
    const { x, w } = this;
    // two panels with a gap, and room for the words at the bottom
    const h = (this.h - 22 - 6) / 2;
    const closeUpY = this.y;
    const wholeY = this.y + h + 6;
    for (const [top, label] of [[closeUpY, 'wave'], [wholeY, say === null ? 'whole sound' : 'talking']]) {
      noStroke();
      fill(WORLD_COLOURS.outside); // world.js
      rect(x, top, w, h);
      // the middle line, where it's silent
      fill(EDITOR_COLOURS.edge);
      rect(x, top + h / 2, w, 1);
      fill(EDITOR_COLOURS.dimText);
      setText(9, BOLD, LEFT, TOP);
      text(label, x + 4, top + 3);
    }

    // the close-up: some waves (or a hundredth of a second of noise or a file) from just after it gets
    // loud. it starts at the end of the fade in plus a little into the hold, so a bell (no hold) is
    // shown right at its loudest. it picks one sample per pixel rather than averaging, so a very high
    // pitch can look a bit uneven, which is fine for a picture
    const startSeconds = sound.attack / 1000 + Math.min(sound.sustain / 2000, 0.05);
    const start = Math.min(samples.length - 1, Math.floor(startSeconds * SOUND_RATE));
    const spanSeconds = SOUND_WAVES[sound.wave].shape || sound.wave === 'metal' ? closeUpCycles(sound.pitch) / sound.pitch : 0.01;
    const span = Math.max(8, Math.round(spanSeconds * SOUND_RATE));
    const inner = w - 8;
    const middle = closeUpY + h / 2 + 4;
    noFill();
    stroke(SOUND_COLOURS.edge);
    strokeWeight(1.5);
    beginShape();
    for (let i = 0; i <= inner; i++) vertex(x + 4 + i, middle - (samples[start + Math.floor((i / inner) * span)] ?? 0) * (h / 2 - 8));
    endShape();

    // the whole sound
    strokeWeight(1);
    drawSoundShape(sound, x + 4, wholeY + 12, inner, h - 16, say);

    // the moving line while it plays (it goes round and round while looping). it goes by millis(),
    // not the audio clock, so it can be a few ms out, and while playing a piano note it moves at that
    // note's length over this picture of the normal pitch (which is the same length unless looping)
    if (preview) {
      const played = (millis() - preview.started) / 1000;
      if (preview.loop || played < preview.seconds) {
        const along = (played % preview.seconds) / preview.seconds;
        stroke(255);
        line(x + 4 + along * inner, wholeY, x + 4 + along * inner, wholeY + h);
      }
    }

    noStroke();
    fill(EDITOR_COLOURS.dimText);
    setText(11, BOLD, CENTER, CENTER);
    let pitch = `${noteName(sound.pitch)}  ·  ${sound.pitch} Hz`;
    if (sound.wave === 'file') pitch = `${Math.round((sound.pitch / 440) * 100)}% speed`;
    else if (!SOUND_WAVES[sound.wave].shape && sound.wave !== 'metal') pitch = `${sound.pitch} Hz`;
    text(`${pitch}  ·  ${Math.round(seconds * 1000)} ms`, x + w / 2, this.y + this.h - 10);
  }
}

// a little piano that plays the sound at each note (onPlay(note), note numbers like noteFrequency()
// in sound.js). everything that's in notes (slide, jump, vibrato) moves with it, and for a file it
// changes the speed. it's two octaves from SOUND_EDITOR.pianoFrom, and works on any number of white
// keys, so making it longer is just whiteKeys
class SoundPiano extends UIElement {
  constructor(options) {
    super(options);
    this.onPlay = options.onPlay;
    // the note being held down, or null
    this.held = null;
    this.tip = 'Piano: plays the sound at that note. Slides, jumps and vibrato all move with it';
    // every key as { note, x, y, w, h, black }, black keys first since they sit on top
    const whiteW = this.w / SOUND_EDITOR.whiteKeys;
    const whites = [];
    const blacks = [];
    // how many notes up from C each white key is, and which have a black key just after them
    const steps = [0, 2, 4, 5, 7, 9, 11];
    for (let k = 0; k < SOUND_EDITOR.whiteKeys; k++) {
      const note = SOUND_EDITOR.pianoFrom + 12 * Math.floor(k / 7) + steps[k % 7];
      whites.push({ note, x: this.x + k * whiteW, y: this.y, w: whiteW, h: this.h, black: false });
      if (k < SOUND_EDITOR.whiteKeys - 1 && ![4, 11].includes(steps[k % 7])) {
        blacks.push({ note: note + 1, x: this.x + (k + 1) * whiteW - whiteW * 0.3, y: this.y, w: whiteW * 0.6, h: this.h * 0.6, black: true });
      }
    }
    this.keys = [...blacks, ...whites];
  }

  keyAt(px, py) {
    return this.keys.find((key) => px >= key.x && px < key.x + key.w && py >= key.y && py < key.y + key.h) ?? null;
  }

  update(hovered) {
    this.hovered = hovered;
    if (!Input.buttonsHeld.has('left')) this.held = null;
    if (!hovered || !Input.buttonsPressed.has('left')) return;
    const key = this.keyAt(Input.mouse.x, Input.mouse.y);
    if (!key) return;
    this.held = key.note;
    this.onPlay(key.note);
  }

  draw() {
    const under = this.hovered ? this.keyAt(Input.mouse.x, Input.mouse.y) : null;
    stroke(EDITOR_COLOURS.header);
    strokeWeight(1);
    // whites then blacks, so the black keys are on top
    for (const key of [...this.keys].reverse()) {
      const lit = key.note === this.held;
      fill(lit ? EDITOR_COLOURS.accent : key.black ? (key === under ? 70 : 30) : key === under ? 210 : 235);
      rect(key.x, key.y, key.w, key.h, 0, 0, 3, 3);
      // C keys are labelled, so you can tell which octave is which
      if (!key.black && (key.note - SOUND_EDITOR.pianoFrom) % 12 === 0) {
        noStroke();
        fill(lit ? 255 : 120);
        setText(9, BOLD, CENTER, BOTTOM);
        text(noteName(noteFrequency(key.note)), key.x + key.w / 2, key.y + key.h - 3);
        stroke(EDITOR_COLOURS.header);
      }
    }
  }
}
