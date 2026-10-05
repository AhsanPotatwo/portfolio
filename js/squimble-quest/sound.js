// ================================== the sound system ==================================
//
// this file is the sound library, a little synthesiser that turns a sound's settings into audio, and
// playing sounds in the world (quieter the further away they are). anything that makes a noise goes
// through playSound(name, at), so swords, doors or music can use it later. read this before changing
// any of the sound code, it explains how all the pieces fit together.
//
// ---------- the pieces, and where they live ----------
//
//   SOUND_WAVES       here            the kinds of wave, each just a shape(p) function
//   SOUND_SETTINGS    here            every number setting, which is also its slider in the editor
//   SOUNDS            here            the library: every sound by name, from sounds.json
//   renderSound()     here            the synthesiser: works out every sample of a sound
//   Sound             here            playing: the browser's audio, voices, distance, the preview
//   playSound()       here            how everything else plays a sound
//   sounds.json       assets/squimble-quest/sounds/   one sound per line (user guide: README.md there)
//   files/            assets/squimble-quest/sounds/files/   audio files (mp3, wav, ogg) sounds use
//   SoundBlocks       soundblocks.js  tiles on maps that play a sound (step on it, press E, or loop)
//   SoundEditor       soundeditor.js  the full screen synthesiser for making and changing sounds
//   Slider            formbox.js      the sliders the sound editor is made of
//   tests             tests/sound-check.js  node checks: loops join without clicks, files save the same
//
// ---------- how it works ----------
//
// a sound is just plain settings (SOUND_DEFAULTS), so it can be saved as json. it doesn't use the
// browser's oscillators at all. renderSound() works out every sample in javascript (the same idea as
// the old sfxr sound effect maker), and the browser plays the result like a recording. I did it this
// way because:
//   - loops can repeat sample-perfectly. the first version restarted oscillators every time a loop
//     ended, checked once a frame, and that left gaps and clicks (the "choppy hum")
//   - an audio file is just another kind of recording, so files get every effect the waves get
//   - the visualiser draws the real samples, so what you see is exactly what you hear
//   - it's all plain maths, so tests/sound-check.js can check it in node with no browser
// the cost is that a sound has to be worked out before it can play (a few ms, see "speed" below).
//
// ---------- what happens when something plays a sound ----------
//
//   1. playSound('coin', { x, y, map }) looks the name up in SOUNDS
//   2. Sound.play() asks Sound.render() for the samples. it keeps the last 30 it worked out, so a
//      sound that's played a lot is only worked out once
//   3. the samples get copied into a browser AudioBuffer (once, kept with the render) and played by
//      an AudioBufferSourceNode, through a gain (volume from distance) and a panner (left/right)
//   4. every frame Sound.update() (from sketch.js) moves each voice's volume and pan as the player
//      walks, tidies up finished voices, and stops loops that can't be heard any more
//
// ---------- one sound, sample by sample (renderSound()) ----------
//
// a sound is one "beep" (fade in, hold, fade out), played `repeats` times with `gap` between. for
// every sample:
//   - time into the current beep decides the pitch: the start pitch, moved by slide (notes a second),
//     slide speed-up, vibrato (a sine wobble) and jump (a step partway through). all of those are in
//     notes, so the piano can move the whole sound up or down by changing just the start pitch
//   - the wave is read at its current point in the cycle (its phase). sine, triangle, saw and organ
//     come from a table (waveTable()), square works its shape out each time because its pulse width
//     can change, noise is random values that change 32 times a cycle, and a file is read at a speed
//     of pitch / 440
//   - the volume shape (fade in, hold with punch, fade out) multiplies it
//   - then the effects, in this order: low-pass (with resonance), high-pass, flanger, crunch. they
//     keep running in the gaps between beeps, so a filter's tail or the flanger's echo fades out
//     naturally instead of stopping dead
//   - volume, then it's clipped to -1..1
//
// ---------- loops ----------
//
// a loop is the whole pattern (all the repeats, and the gap after the last one too) played over and
// over. three things make the join smooth:
//   - the wave's phase carries on across the join instead of starting again at 0
//   - it works out a little bit past the end (SOUND_LOOP_FADE), which is really the start of the next
//     go round, and fades that into the start. so the last sample leads straight into the first
//   - a "steady" sound (nothing moving the pitch, one beep, a real wave) gets a loop length that's a
//     whole number of waves, so the crossfade is between two copies of the same wave and is perfect
// tests/sound-check.js checks every sound in sounds.json loops without a click. fades, slides and
// repeats happen every time round, which is what you want for a siren or a pulsing machine. for a
// constant hum use 0 fade in and fade out.
//
// ---------- distance and stereo ----------
//
// Sound.listener is the player's feet (set every frame by sketch.js). a sound played with a place
// ({ x, y, map }) is full volume right on top of it and fades to nothing at `range` tiles away
// (squared, so it drops off quicker at first), and pans towards the side it's on. a sound on another
// map is silent. a sound played with null for its place is full volume with no pan (the editor's
// preview, and later things like menu clicks). the place is read again every frame, so it can be an
// object that moves: anything with x, y and map (an enemy would need a map added, see "ideas" below).
//
// ---------- adding things ----------
//
//   a sound      in game: map editor, Sounds tab, New (or right click one to change it), then Export
//   a wave       a SOUND_WAVES line with its shape(p, width). it gets a button in the sound editor
//                and its own wave table by itself
//   a setting    a SOUND_SETTINGS line (that's its slider too), then make it do something in
//                renderSound(). if it moves the pitch, add it to `steady` in renderSound() too, and if
//                it only matters sometimes, add it to `matters` in SoundEditor.update()
//   a generator  a SOUND_GENERATORS line in soundeditor.js (the "make one" buttons)
//   a sound from code   playSound('name', { x, y, map }) for something in the world, or
//                playSound('name') for full volume. it gives back the voice, which Sound.stop() takes
//
// ---------- speed ----------
//
// working out a sound takes roughly 1-10 ms per second of sound once the browser has warmed up (the
// first few are slower). that's fine for playing, since each one is only worked out once and kept. it
// matters in the sound editor, where dragging a slider makes a new sound every frame: long sounds
// (several seconds, or lots of repeats) can make the editor stutter while you drag. sounds can't be
// longer than SOUND_MAX_SECONDS, so a typo can't freeze the game.
//
// ---------- known problems and things to watch out for ----------
//
//   - browsers don't let a page make sound until it's been clicked. if a loop block is in range when
//     the page loads, the audio gets made before the click, Chrome logs "The AudioContext was not
//     allowed to start", and it stays silent until you click the game (then it starts). harmless
//   - punch makes the volume jump up where fade in ends and hold starts. that's the snap it's meant to
//     have, but with a long fade in and lots of punch you can hear it as a click
//   - noise stops getting any brighter above about 1400 Hz, since its values already change about
//     every sample there (32 changes a cycle x 1400 is 44800 a second)
//   - each repeat carries on the wave's phase from the last one instead of starting fresh, so repeats
//     of square and saw can sound very slightly different from each other. you'd only notice on
//     really low pitches
//   - a filter that sweeps fully open (low-pass 100) or shut (high-pass 0) stops running, and when it
//     sweeps back it starts from where it left off, which can pop. sweeping within the range is fine
//   - lots of resonance, flanger or volume can go past full volume, and it gets clipped to -1..1,
//     which sounds harsh (sometimes that's what you want)
//   - turning the flanger on makes the sound 30% quieter at the very start (before the late copy
//     catches up), and a flanger + sweep that goes below 0 ms is held at 1 sample, which just makes it
//     a bit duller
//   - render keys are the settings as json, so a sound from SOUNDS (which has its name) and the same
//     settings in the editor (which don't) are kept as two renders. harmless, just a little memory
//   - the render cache can hold 30 sounds of up to 20 seconds each, so in a weird case that's a few
//     hundred MB. normal sounds are under a second, so it's tiny
//   - an audio file that fails to load is never tried again until the page reloads
//   - two loop blocks playing the same sound near each other play it twice, louder, and they can
//     drift in and out of step
//
// ---------- ideas for later ----------
//
//   - sounds for things that happen: sword swings and hits (weapons.js), footsteps (a stepSound
//     setting on tiles, played from walk() in character.js), doors (a sound on warps), enemies
//     getting hurt or dying, ui clicks. all of them are just playSound() calls
//   - a little random pitch on each play so repeated sounds (footsteps) don't all sound the same.
//     it'd go through randomBetween() (utils.js) like all game randomness
//   - sounds that follow something moving: pass an object with x, y and map as the place, like
//     { get x() { return enemy.x; }, get y() { return enemy.y; }, map: worldMap }
//   - walls muffling sounds: if clearLine() (tilemap.js) is blocked between the sound and the
//     listener, turn the volume down or add a low-pass to the voice
//   - music: long file sounds as loops, with a fade between maps. a separate music volume
//   - a volume setting or a mute key (a gain node between the voices and ctx.destination)
//   - more effects: echo, reverb, distortion, chorus. each is a setting plus a few lines in the
//     effects part of renderSound()
//   - arpeggios with more than one jump, or chords (several pitches at once, added together)
//   - drawing your own wave shape in the sound editor, saved as a list of points in sounds.json
//   - renaming and deleting sounds in the sound editor (now by hand in sounds.json). renaming would
//     have to update every sound block on every map, like renaming a warp would
//   - one file per sound instead of one sounds.json, if the list gets long
//
// ---------- checking changes ----------
//
//   - node js/squimble-quest/tests/sound-check.js (no output means it passed). add --fix to rewrite
//     sounds.json in the exported format after editing it by hand
//   - in the game: the sound editor with Loop on is the quickest way to hear a change
//
// =====================================================================================

// paths from the root of the site
const SOUND_FILE = 'assets/squimble-quest/sounds/sounds.json';
const SOUND_FILE_FOLDER = 'assets/squimble-quest/sounds/files/';

// goes at the top of sounds.json, same idea as tiles.json's (tiles.js)
const SOUNDS_FORMAT = 'squimble-quest-sounds';
const SOUNDS_VERSION = 1;

// how loud everything is overall (0 to 1). raw waves are really loud, so this keeps them comfortable.
// ponytail: one fixed number. a volume setting or mute key would change this (and the gain of every
// playing voice), or better, go through one gain node every voice connects to
const SOUND_MASTER_VOLUME = 0.35;

// samples a second that sounds are worked out at (the browser converts it if the speakers differ)
const SOUND_RATE = 44100;
// the longest a sound can be, so a typo can't make the game work out minutes of audio
const SOUND_MAX_SECONDS = 20;
// how long the crossfade is where a loop joins back to its start, in seconds
const SOUND_LOOP_FADE = 0.03;

// the kinds of wave. shape(p, width) is how high the wave is (-1 to 1) at point p (0 to 1) through one
// cycle, and width is the pulse width (0 to 1, only square uses it). noise and file don't have a
// shape, renderSound() deals with them itself. label is the text on its button in the sound editor.
// the key (like 'sawtooth') is what sounds.json saves, so renaming one turns every sound using it into
// a square. a shape only gets worked out once (into a wave table) so it can be as slow as you like.
// sharp jumps in a shape (like square and saw have) are what make a wave sound bright and buzzy, and
// smooth shapes (sine) sound soft, which is handy to know when making a new one
const SOUND_WAVES = {
  // smooth and pure, like a whistle
  sine:     { label: 'sine', shape: (p) => Math.sin(p * Math.PI * 2) },
  // soft and a bit hollow, like a flute
  triangle: { label: 'triangle', shape: (p) => 1 - 4 * Math.abs(p - 0.5) },
  // buzzy, the classic old video game sound. thinner pulse widths sound more nasal
  square:   { label: 'square', shape: (p, width) => (p < width ? 1 : -1) },
  // harsh and bright, good for lasers and engines
  sawtooth: { label: 'saw', shape: (p) => 2 * p - 1 },
  // warm and full, a sine with a couple of higher sines on top like an organ. good for hums
  organ:    { label: 'organ', shape: (p) => (Math.sin(p * Math.PI * 2) + 0.5 * Math.sin(p * Math.PI * 4) + 0.25 * Math.sin(p * Math.PI * 6)) / 1.4 },
  // random hiss, for hits, explosions, wind and footsteps. pitch decides how high the hiss is
  noise:    { label: 'noise' },
  // an audio file (sound.file) instead of a wave. pitch changes how fast it plays, 440 is normal
  file:     { label: 'file' },
};

// every number setting a sound has. each one is a slider in the sound editor (Slider in formbox.js),
// so this is everything it needs: its section and name there, the smallest and biggest it can be, the
// step it moves in, how the slider spreads the values out (curve), its unit, its normal value, and a
// tip that shows along the bottom of the sound editor while you hover over it. off (if it has one)
// is the value that means the setting isn't doing anything, which the slider shows as "off".
//
// careful with these:
//   - key is what sounds.json saves. renaming a key loses that setting from every saved sound
//   - normal is the default, and sounds.json only saves settings that aren't the default. so
//     changing a normal value changes every sound that left that setting out (most of them)
//   - attack, sustain and decay are the old synth names for fade in, hold and fade out. the labels
//     are friendlier but the keys stayed, since they're in sounds.json
//   - curve 'log' needs a min above 0, and 'square' on a range either side of 0 needs min to be
//     exactly -max (see Slider in formbox.js)
//   - the section has to be one of SOUND_EDITOR.columns (soundeditor.js) or it won't get a slider
//   - order matters: it's the order of the sliders, and of the settings in sounds.json
const SOUND_SETTINGS = [
  { key: 'pitch', section: 'Pitch', label: 'Pitch', min: 20, max: 5000, step: 1, curve: 'log', unit: 'Hz', normal: 440, tip: 'How high it is. 440 is the A above middle C, and doubling it goes up an octave. For a file it\'s how fast it plays' },
  { key: 'slide', section: 'Pitch', label: 'Slide', min: -200, max: 200, step: 1, curve: 'square', unit: 'notes/s', normal: 0, tip: 'Makes the pitch rise (+) or fall (-) while it plays. Up for jumps and power-ups, down for lasers and falling' },
  { key: 'slideAccel', section: 'Pitch', label: 'Slide speed-up', min: -500, max: 500, step: 1, curve: 'square', unit: 'notes/s²', normal: 0, tip: 'Makes the slide get faster (+) or slower (-) as it goes, so it curves' },
  { key: 'vibrato', section: 'Pitch', label: 'Vibrato', min: 0, max: 12, step: 0.1, curve: 'square', unit: 'notes', normal: 0, tip: 'Wobbles the pitch up and down by this many notes' },
  { key: 'vibratoSpeed', section: 'Pitch', label: 'Vibrato speed', min: 0, max: 40, step: 0.5, curve: 'linear', unit: '/s', normal: 6, tip: 'How many wobbles a second' },
  { key: 'jump', section: 'Pitch', label: 'Jump', min: -24, max: 24, step: 1, curve: 'linear', unit: 'notes', normal: 0, tip: 'Jumps the pitch up (+) or down (-) by this many notes partway through. Two notes like a coin pickup' },
  { key: 'jumpAt', section: 'Pitch', label: 'Jump at', min: 0, max: 1000, step: 5, curve: 'square', unit: 'ms', normal: 100, tip: 'How long after it starts the jump happens' },

  { key: 'attack', section: 'Volume shape', label: 'Fade in', min: 0, max: 2000, step: 1, curve: 'square', unit: 'ms', normal: 5, tip: 'How long it takes to get loud. Long fades in sound soft, like a swell' },
  { key: 'sustain', section: 'Volume shape', label: 'Hold', min: 0, max: 5000, step: 1, curve: 'square', unit: 'ms', normal: 150, tip: 'How long it stays loud' },
  { key: 'punch', section: 'Volume shape', label: 'Punch', min: 0, max: 100, step: 1, curve: 'linear', unit: '%', normal: 0, tip: 'Makes the start of the hold extra loud, then it settles. Gives hits and coins a snap' },
  { key: 'decay', section: 'Volume shape', label: 'Fade out', min: 0, max: 5000, step: 1, curve: 'square', unit: 'ms', normal: 100, tip: 'How long it takes to go quiet at the end. Long fades out ring like a bell' },
  { key: 'repeats', section: 'Volume shape', label: 'Repeats', min: 1, max: 16, step: 1, curve: 'linear', unit: 'x', normal: 1, tip: 'Plays the whole thing this many times in a row, for alarms and footsteps' },
  { key: 'gap', section: 'Volume shape', label: 'Gap', min: 0, max: 2000, step: 1, curve: 'square', unit: 'ms', normal: 60, tip: 'The silence between repeats' },

  { key: 'pulseWidth', section: 'Tone', label: 'Pulse width', min: 5, max: 95, step: 1, curve: 'linear', unit: '%', normal: 50, tip: 'Square wave only. 50 is a full square, lower or higher sounds thinner and more nasal' },
  { key: 'pulseSweep', section: 'Tone', label: 'Pulse sweep', min: -100, max: 100, step: 1, curve: 'square', unit: '%/s', normal: 0, tip: 'Square wave only. Changes the pulse width while it plays, which sounds like it\'s moving' },
  { key: 'lowPass', section: 'Tone', label: 'Low-pass', min: 0, max: 100, step: 1, curve: 'linear', unit: '%', normal: 100, off: 100, tip: 'Cuts out high sounds, making it duller and softer. 100 is off' },
  { key: 'lowPassSweep', section: 'Tone', label: 'Low-pass sweep', min: -100, max: 100, step: 1, curve: 'square', unit: '%/s', normal: 0, tip: 'Opens (+) or closes (-) the low-pass while it plays, like a wah' },
  { key: 'resonance', section: 'Tone', label: 'Resonance', min: 0, max: 100, step: 1, curve: 'linear', unit: '%', normal: 0, tip: 'Makes the low-pass ring at its edge, for a squelchy synth sound. Only does something with the low-pass on' },
  { key: 'highPass', section: 'Tone', label: 'High-pass', min: 0, max: 100, step: 1, curve: 'linear', unit: '%', normal: 0, off: 0, tip: 'Cuts out low sounds, making it thinner, like it\'s coming out of a little radio. 0 is off' },
  { key: 'highPassSweep', section: 'Tone', label: 'High-pass sweep', min: -100, max: 100, step: 1, curve: 'square', unit: '%/s', normal: 0, tip: 'Moves the high-pass up (+) or down (-) while it plays' },

  { key: 'flanger', section: 'Effects', label: 'Flanger', min: 0, max: 20, step: 0.1, curve: 'square', unit: 'ms', normal: 0, off: 0, tip: 'Mixes in a slightly late copy of the sound, for a hollow, whooshy, metallic feel. 0 is off' },
  { key: 'flangerSweep', section: 'Effects', label: 'Flanger sweep', min: -20, max: 20, step: 0.1, curve: 'square', unit: 'ms/s', normal: 0, tip: 'Changes the flanger while it plays, which makes it swoosh' },
  { key: 'crush', section: 'Effects', label: 'Crunch', min: 0, max: 100, step: 1, curve: 'linear', unit: '%', normal: 0, off: 0, tip: 'Makes it lower quality on purpose (a bitcrusher), for crunchy retro sounds' },
  { key: 'volume', section: 'Effects', label: 'Volume', min: 0, max: 100, step: 1, curve: 'linear', unit: '%', normal: 60, tip: 'How loud it is' },
  { key: 'range', section: 'Effects', label: 'Heard from', min: 1, max: 50, step: 1, curve: 'linear', unit: 'tiles', normal: 8, tip: 'How many tiles away you can still hear it in the game. It gets quieter the further away you are' },
];

// every sound starts with these, and they're the only settings a sound can have. wave first so it's
// first in each line of sounds.json
const SOUND_DEFAULTS = {
  // a SOUND_WAVES name
  wave: 'square',
  // the audio file's name in SOUND_FILE_FOLDER, for wave 'file'
  file: null,
  ...Object.fromEntries(SOUND_SETTINGS.map((setting) => [setting.key, setting.normal])),
};

// every sound by name, from sounds.json (loadSoundFile()) and the sound editor (setSound())
const SOUNDS = {};

// decoded audio files by file name, { data (samples), rate (samples a second), seconds }. a file
// that's still loading (or failed) isn't in here yet, so its sounds are silent until it is
const SOUND_FILES = {};

// a full set of sound settings from some (from a file, a generator or the sound editor). anything
// that isn't a setting gets left out, numbers are kept inside their slider's range, and anything the
// wrong type gets its default, so a bad file can't break the audio. it doesn't round numbers to their
// slider's step though, so a hand typed 440.5 stays 440.5 until the sound editor opens it (its slider
// rounds it then)
function soundSettings(from) {
  const sound = { wave: SOUND_WAVES[from.wave] ? from.wave : SOUND_DEFAULTS.wave, file: typeof from.file === 'string' ? from.file : null };
  if (from.wave !== undefined && sound.wave !== from.wave) console.warn(`There's no sound wave called "${from.wave}", so it's a ${sound.wave} instead. They're in SOUND_WAVES (sound.js)`);
  for (const { key, min, max, normal } of SOUND_SETTINGS) {
    sound[key] = typeof from[key] === 'number' && !Number.isNaN(from[key]) ? Math.min(max, Math.max(min, from[key])) : normal;
  }
  return sound;
}

// adds a sound to the library or changes one, and starts loading its audio file if it has one.
// anything already playing the old version carries on with it, and the next play uses the new one. a
// changed sound keeps its place in the list (and in sounds.json), and a new one goes on the end
function setSound(name, settings) {
  SOUNDS[name] = { ...soundSettings(settings), name };
  if (SOUNDS[name].wave === 'file' && SOUNDS[name].file) loadAudioFile(SOUNDS[name].file);
}

// the times that make up a sound, in seconds: one beep (fade in + hold + fade out), one beep plus its
// gap, and the whole thing with all its repeats (no gap after the last one). the whole thing is cut
// at SOUND_MAX_SECONDS, which can chop the last repeats off a really long sound
function soundTimings(sound) {
  const beep = (sound.attack + sound.sustain + sound.decay) / 1000;
  const step = beep + sound.gap / 1000;
  return { beep, step, seconds: Math.min(SOUND_MAX_SECONDS, sound.repeats * step - sound.gap / 1000) };
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// the closest musical note to a pitch, like 440 gives "A4"
function noteName(hz) {
  // how many notes up from C0. A4 (440) is 57
  const n = Math.round(12 * Math.log2(hz / 440)) + 57;
  return NOTE_NAMES[((n % 12) + 12) % 12] + Math.floor(n / 12);
}

// the pitch (Hz) of a note number, where 57 is A4 (440), like noteName() uses
function noteFrequency(n) {
  return 440 * 2 ** ((n - 57) / 12);
}

// ---------- the synthesiser ----------

// works out every sample of a sound: { samples (Float32Array, -1 to 1), seconds }. loop: made to
// repeat forever, so the end runs smoothly back into the start. pitch: play it at another pitch
// (everything else that's in notes moves with it), for the sound editor's piano.
//
// every sample: the time into the current beep decides the pitch (slide, vibrato, jump) and the
// volume (fade in, hold with punch, fade out). the wave is read at the current point in its cycle,
// then it goes through the low-pass, high-pass, flanger and crunch, which keep running in the gaps so
// their tails fade out naturally.
//
// loops are the fiddly part. a loop is the pattern (all the repeats and gaps) played over and over.
// the wave's cycle carries on across the join instead of starting again, and it works out a little
// bit past the end, which is really the start of the next go round. that bit gets faded into the
// start (SOUND_LOOP_FADE), so the last sample leads straight into the first with no click. and a
// steady sound (nothing changing the pitch) gets a loop length that's a whole number of waves, so the
// join lines up perfectly
function renderSound(sound, loop = false, pitch = sound.pitch) {
  const s = sound;
  const { beep, step, seconds } = soundTimings(s);
  // how long one go round is. a looping sound with repeats includes the gap after its last beep too,
  // so the rhythm stays even across the join
  let period = loop && s.repeats > 1 ? Math.min(SOUND_MAX_SECONDS, s.repeats * step) : seconds;
  // steady: nothing changes the pitch, one beep, and a real wave (not noise or a file). only then can
  // the loop be a whole number of waves. a new setting that moves the pitch needs adding here
  const steady = s.slide === 0 && s.slideAccel === 0 && s.jump === 0 && s.vibrato === 0 && s.repeats === 1 && SOUND_WAVES[s.wave].shape;
  // rounds the loop to the nearest whole number of waves (at least one), which changes its length by
  // at most half a wave, so you can't hear the difference
  if (loop && steady) period = Math.max(1, Math.round(period * pitch)) / pitch;
  // a sound with everything at 0 would have no samples at all, which the browser can't play
  period = Math.max(period, 0.01);
  const length = Math.round(period * SOUND_RATE);
  // the crossfade at the join, never more than a quarter of the loop
  const fade = loop ? Math.min(Math.round(SOUND_LOOP_FADE * SOUND_RATE), Math.floor(length / 4)) : 0;
  // the extra `fade` samples are the start of the next go round, faded in at the end of this function
  const out = new Float32Array(length + fade);

  const attack = s.attack / 1000;
  const sustain = s.sustain / 1000;
  const decay = s.decay / 1000;
  const jumpAt = s.jumpAt / 1000;
  const shape = SOUND_WAVES[s.wave].shape;
  // every wave but square (whose shape changes with its pulse width) is read from a table instead
  const table = shape && s.wave !== 'square' ? waveTable(s.wave) : null;
  const file = s.wave === 'file' ? SOUND_FILES[s.file] : null;
  // the same "random" noise every time, so the sound (and its picture) doesn't change between plays.
  // every noise sound uses the same seed, which nobody can hear, but a "noise seed" setting could
  // give different hisses if that's ever wanted
  const random = seededRandom(1);
  // crunch: hold each sample for crushEvery samples, and round it to steps of crushStep
  const crushEvery = 1 + Math.round((s.crush / 100) * 24);
  const crushStep = 2 / 2 ** (16 - (s.crush / 100) * 13);
  // the flanger's memory of recent samples, enough for its longest delay
  const recent = new Float32Array(4096);
  // the filters' numbers for a position (0 to 100), worked out once here when they don't sweep, since
  // they're slow to do for every sample
  const lowPassF = (position) => 2 * Math.sin((Math.PI * 40 * 2 ** ((position / 100) * Math.log2(SOUND_RATE / 6 / 40))) / SOUND_RATE);
  const highPassA = (position) => 1 / (1 + (2 * Math.PI * 20 * 2 ** ((position / 100) * Math.log2(8000 / 20))) / SOUND_RATE);
  const fixedLowPass = s.lowPassSweep === 0 && s.lowPass < 100 ? lowPassF(s.lowPass) : null;
  const fixedHighPass = s.highPassSweep === 0 && s.highPass > 0 ? highPassA(s.highPass) : null;
  const damping = 1.5 - (s.resonance / 100) * 1.4;
  const notesToRatio = Math.LN2 / 12;

  let phase = 0;
  let noise = null;
  let beepNumber = -1;
  let filePosition = 0;
  let low = 0;
  let band = 0;
  let high = 0;
  let lastInput = 0;
  let held = 0;
  for (let i = 0; i < out.length; i++) {
    // t is seconds since the start of the render, u is seconds into the pattern (they only differ when
    // looping), n is which repeat this is, and b is seconds into that repeat's beep (it keeps going up
    // through the gap after it, which is how sweeps carry on in the gaps)
    const t = i / SOUND_RATE;
    const u = loop ? t % period : t;
    const n = Math.floor(u / step);
    // time into the current beep
    const b = u - n * step;
    let x = 0;
    if (n < s.repeats && b < beep) {
      // a new repeat starts a file from its beginning. the wave's phase doesn't reset though (see
      // "known problems" at the top), which is also what keeps loops smooth
      if (n !== beepNumber) {
        beepNumber = n;
        filePosition = 0;
      }
      // the pitch right now, in notes away from the start
      let notes = s.slide * b + 0.5 * s.slideAccel * b * b + (b >= jumpAt ? s.jump : 0);
      if (s.vibrato > 0) notes += s.vibrato * Math.sin(2 * Math.PI * s.vibratoSpeed * b);
      const frequency = Math.min(20000, Math.max(1, notes === 0 ? pitch : pitch * Math.exp(notes * notesToRatio)));
      phase += frequency / SOUND_RATE;
      if (phase >= 1) {
        phase -= Math.floor(phase);
        // noise gets new random values every cycle, so pitch decides how fast the hiss changes
        noise = null;
      }
      if (file) {
        x = fileSample(file, filePosition);
        filePosition += (frequency / 440) * (file.rate / SOUND_RATE);
      } else if (s.wave === 'noise') {
        // 32 random values a cycle. above about 1400 Hz they change every sample anyway, so higher
        // pitches don't sound any brighter (see "known problems" at the top)
        noise ??= Array.from({ length: 32 }, () => random() * 2 - 1);
        x = noise[Math.floor(phase * 32)];
      } else if (table) {
        // between two table entries, blended
        const position = phase * WAVE_TABLE_SIZE;
        const k = Math.floor(position);
        x = table[k] + (table[k + 1] - table[k]) * (position - k);
      } else if (shape) {
        x = shape(phase, Math.min(95, Math.max(5, s.pulseWidth + s.pulseSweep * b)) / 100);
      }
      // the volume shape. fade in goes 0 to 1, hold starts at 1 + punch and settles to 1 by its end,
      // and fade out goes 1 to 0. the jump from 1 to 1 + punch is the punch's snap (it can click with
      // a long fade in). the divisions are safe: b can only be in a part that's longer than 0
      if (b < attack) x *= b / attack;
      else if (b < attack + sustain) x *= 1 + (1 - (b - attack) / sustain) * (s.punch / 100);
      else x *= 1 - (b - attack - sustain) / decay;
    }

    // low-pass: a "state variable filter", which can ring at its edge (resonance). its cutoff goes
    // from 40 Hz up to a sixth of the sample rate, as high as it can go without going unstable.
    // low and band are its memory between samples. while it's fully open (100) it's skipped
    // completely, so if a sweep opens it and then closes it again its memory is stale and it can pop
    const lowPass = fixedLowPass ? 0 : Math.min(100, Math.max(0, s.lowPass + s.lowPassSweep * b));
    if (fixedLowPass || lowPass < 100) {
      const f = fixedLowPass ?? lowPassF(lowPass);
      low += f * band;
      band += f * (x - low - damping * band);
      x = low;
    }
    // high-pass: a simple one, from 20 Hz up to 8000 Hz. it takes away the slow changes and keeps the
    // fast ones (high is its memory). same stale memory thing as the low-pass if a sweep turns it off
    // (0) and on again
    const highPass = fixedHighPass ? 0 : Math.min(100, Math.max(0, s.highPass + s.highPassSweep * b));
    const input = x;
    if (fixedHighPass || highPass > 0) {
      high = (high + input - lastInput) * (fixedHighPass ?? highPassA(highPass));
      x = high;
    }
    lastInput = input;
    // flanger: mix in the sound from a few ms ago. recent is a ring: & 4095 wraps the index round, so
    // it always holds the last 4096 samples (about 93 ms). the delay is kept between 1 sample and 4000,
    // and the mix is scaled by 0.7 so the two copies together aren't too loud (which also means it's a
    // bit quieter before the late copy arrives)
    recent[i & 4095] = x;
    if (s.flanger > 0 || s.flangerSweep !== 0) {
      const delay = Math.min(4000, Math.max(1, Math.round(((s.flanger + s.flangerSweep * b) / 1000) * SOUND_RATE)));
      x = (x + recent[(i - delay) & 4095]) * 0.7;
    }
    // crunch: a "bitcrusher". holding each value for a few samples sounds like a lower sample rate,
    // and rounding to big steps sounds like fewer bits, like old consoles
    if (s.crush > 0) {
      if (i % crushEvery === 0) held = Math.round(x / crushStep) * crushStep;
      x = held;
    }
    // clipped to -1..1, since anything past that would distort in the browser anyway. resonance,
    // punch and the flanger can all push it past, which sounds harsh
    out[i] = Math.min(1, Math.max(-1, x * (s.volume / 100)));
  }

  // fade the bit past the end into the start, so the loop joins smoothly. sample 0 ends up being
  // exactly the sample that would come after the last one, and by `fade` samples in it's back to the
  // real start. it's a straight (linear) crossfade, so if the two bits are very different (like
  // noise) it dips a little in volume for those 30 ms, which you can't really hear
  for (let i = 0; i < fade; i++) out[i] = out[i] * (i / fade) + out[length + i] * (1 - i / fade);
  return { samples: out.subarray(0, length), seconds: length / SOUND_RATE };
}

// how many points a wave table has for one cycle
const WAVE_TABLE_SIZE = 2048;
const waveTables = {};

// one cycle of a wave's shape worked out at WAVE_TABLE_SIZE points (plus the first again at the end,
// for blending), so renderSound() can look it up instead of working it out 44100 times a second
function waveTable(wave) {
  if (!waveTables[wave]) {
    const { shape } = SOUND_WAVES[wave];
    waveTables[wave] = Float32Array.from({ length: WAVE_TABLE_SIZE + 1 }, (_, i) => shape((i % WAVE_TABLE_SIZE) / WAVE_TABLE_SIZE, 0.5));
  }
  return waveTables[wave];
}

// an audio file's sample at a position between samples (blends the two either side), 0 past its end
function fileSample(file, position) {
  const i = Math.floor(position);
  if (i < 0 || i + 1 >= file.data.length) return 0;
  return file.data[i] + (file.data[i + 1] - file.data[i]) * (position - i);
}

// a random number maker that gives the same numbers every time for the same seed (mulberry32). only
// for working out sounds, so it's not the game's randomness (randomBetween() in utils.js)
function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- playing sounds ----------

// plays a sound, by name (SOUNDS) or as settings. at: where it is in the world, { x, y, map }, so it
// gets quieter with distance, or null for full volume everywhere (like the sound editor). key:
// anything that marks what's playing it, so Sound.isPlaying(key) can tell. options: { loop, pitch }.
// gives back the voice (Sound.stop() takes it), or null if it couldn't play
function playSound(sound, at = null, key = null, options = {}) {
  const settings = typeof sound === 'string' ? SOUNDS[sound] : sound;
  return settings ? Sound.play(settings, at, key, options) : null;
}

const Sound = {
  // the browser's audio, made the first time something plays (null if the browser can't do audio)
  ctx: null,
  // sounds that are playing, each { source, out, pan, at, range, key, loop, end }. out and pan are
  // what distance changes, and end is when it finishes (ctx.currentTime seconds, Infinity for loops)
  voices: [],
  // where sounds are heard from, { x, y, map }, set every frame by update()
  listener: null,
  // worked out sounds, newest last, so changing the same sound back and forth doesn't redo it. each
  // is renderSound()'s result plus its browser buffer once it's been played
  rendered: new Map(),
  // { started (millis()), seconds, loop } while the sound editor's preview plays, else null
  previewing: null,

  // the audio, or null if the browser doesn't have it. made on first use, since browsers don't let
  // pages make sound before you've clicked on them. if it gets made before a click anyway (a loop
  // block in range on page load), Chrome warns in the console and it stays "suspended". resume() is
  // tried on every play, and it works as soon as the page has been clicked
  context() {
    if (!this.ctx) {
      if (!window.AudioContext) return null;
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },

  // renderSound()'s result for these settings, worked out once and kept for a while. a file that's
  // finished loading since gets worked out again. the key is the settings as json, so the same
  // settings with or without a name (SOUNDS has names, the editor's draft doesn't) are two renders
  render(sound, loop = false, pitch = sound.pitch) {
    const key = JSON.stringify([sound, loop, pitch, sound.wave === 'file' && Boolean(SOUND_FILES[sound.file])]);
    let result = this.rendered.get(key);
    if (result) {
      this.rendered.delete(key);
    } else {
      result = renderSound(sound, loop, pitch);
      // ponytail: keeps the last 30 (Map keeps insertion order, so the first key is the oldest).
      // plenty for one map and the editor. if lots of long sounds come along, keep fewer or count
      // the samples instead
      if (this.rendered.size >= 30) this.rendered.delete(this.rendered.keys().next().value);
    }
    this.rendered.set(key, result);
    return result;
  },

  // plays some settings (playSound() is the way in, it looks names up). every play makes its own
  // little set of browser nodes, which is cheap, and they're thrown away when it finishes. there's no
  // limit on how many play at once, so something that plays every frame would pile up. an idea if
  // that's ever a problem: stop the last voice with the same key first
  play(sound, at, key, { loop = false, pitch = sound.pitch } = {}) {
    const ctx = this.context();
    if (!ctx) return null;
    const result = this.render(sound, loop, pitch);
    if (!result.buffer) {
      result.buffer = ctx.createBuffer(1, result.samples.length, SOUND_RATE);
      result.buffer.copyToChannel(result.samples, 0);
    }
    const source = ctx.createBufferSource();
    source.buffer = result.buffer;
    source.loop = loop;
    // it goes through out (volume from distance) then pan (left or right) to the speakers
    const out = ctx.createGain();
    const pan = ctx.createStereoPanner();
    out.gain.value = SOUND_MASTER_VOLUME * this.volumeAt(at, sound.range);
    pan.pan.value = this.panAt(at, sound.range);
    source.connect(out).connect(pan).connect(ctx.destination);
    source.start();
    const voice = { source, out, pan, at, range: sound.range, key, loop, end: loop ? Infinity : ctx.currentTime + result.seconds };
    this.voices.push(voice);
    return voice;
  },

  // stops a voice, with a very quick fade so it doesn't click
  stop(voice) {
    const now = this.ctx.currentTime;
    voice.out.gain.setTargetAtTime(0, now, 0.015);
    voice.source.stop(now + 0.1);
    this.voices = this.voices.filter((other) => other !== voice);
  },

  // stops everything that's playing (like when the editor opens)
  stopAll() {
    for (const voice of [...this.voices]) this.stop(voice);
    this.previewing = null;
  },

  // is something with this key still playing? (playSound()'s key)
  isPlaying(key) {
    return this.voices.some((voice) => voice.key === key);
  },

  // 0 to 1, how loud a sound at `at` is from where the listener is. full volume right on top of it,
  // fading to nothing at range tiles away. null (no place) is always full volume, and a sound on
  // another map is silent
  volumeAt(at, range) {
    if (!at) return 1;
    const you = this.listener;
    if (!you || you.map !== at.map) return 0;
    const away = Math.hypot(at.x - you.x, at.y - you.y) / (range * TILE);
    // squared so it drops off quicker at first, which sounds more natural
    return Math.max(0, 1 - away) ** 2;
  },

  // -1 (all left) to 1 (all right), from which side of the listener the sound is on. never fully to
  // one side, since that sounds odd in headphones
  panAt(at, range) {
    if (!at || !this.listener) return 0;
    return constrain((at.x - this.listener.x) / (range * TILE), -1, 1) * 0.7;
  },

  // every frame (sketch.js). listener is where you hear from, { x, y, map }. sounds that are playing
  // change volume and side as you move, finished ones get tidied up, and loops you can't hear any
  // more stop (sound blocks start them again when you come back)
  update(listener) {
    this.listener = listener;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const voice of [...this.voices]) {
      // finished. the browser has already stopped it and throws its nodes away by itself, so it just
      // comes off the list
      if (now > voice.end + 0.1) {
        this.voices = this.voices.filter((other) => other !== voice);
        continue;
      }
      if (!voice.at) continue;
      const volume = this.volumeAt(voice.at, voice.range);
      if (voice.loop && volume === 0) {
        this.stop(voice);
        continue;
      }
      // setTargetAtTime glides there quickly instead of jumping, which would click
      voice.out.gain.setTargetAtTime(SOUND_MASTER_VOLUME * volume, now, 0.05);
      voice.pan.pan.setTargetAtTime(this.panAt(voice.at, voice.range), now, 0.05);
    }
  },

  // the sound editor's preview: plays the settings at full volume (stopping the last preview), and
  // starts the visualiser's moving line
  preview(sound, options = {}) {
    this.stopPreview();
    const voice = playSound(sound, null, 'preview', options);
    if (voice) this.previewing = { started: millis(), seconds: this.render(sound, options.loop, options.pitch ?? sound.pitch).seconds, loop: Boolean(options.loop) };
  },

  stopPreview() {
    for (const voice of this.voices.filter((other) => other.key === 'preview')) this.stop(voice);
    this.previewing = null;
  },
};

// ---------- sounds.json and audio files ----------

// loads every sound, once at the start, before the maps (mapfile.js) since sound blocks name their
// sound. the promise finishes when it's done or failed, and problems are just console warnings.
// audio files load after, in the background
function loadSoundFile() {
  return fetchJson(SOUND_FILE)
    .then((data) => {
      if (!Array.isArray(data?.sounds)) throw new Error("it doesn't look like a Squimble Quest sounds file");
      for (const { name, ...settings } of data.sounds) {
        if (typeof name === 'string' && name !== '') setSound(name, settings);
        else console.warn(`A sound in ${SOUND_FILE} has no name, so it's been left out`);
      }
    })
    .catch((err) => {
      console.warn(`Couldn't load the sounds file "${SOUND_FILE}": ${err.message}.`);
    });
}

// every sound as the text of sounds.json, one per line (typeToData() and jsonLine() in utils.js)
function soundsToText() {
  const lines = Object.values(SOUNDS).map((sound) => jsonLine(typeToData(sound, SOUND_DEFAULTS)));
  return `{\n  "format": "${SOUNDS_FORMAT}",\n  "version": ${SOUNDS_VERSION},\n  "sounds": [\n${lines.join(',\n')}\n  ]\n}\n`;
}

// file names already asked for, so each file only loads once
const audioFilesAsked = new Set();

// loads an audio file from SOUND_FILE_FOLDER into SOUND_FILES, in the background. a file that fails
// stays in audioFilesAsked, so it isn't tried again until the page reloads (the console says why it
// failed). keep file names simple: letters, numbers, - and _ are safest in a web address
function loadAudioFile(fileName) {
  if (audioFilesAsked.has(fileName)) return;
  audioFilesAsked.add(fileName);
  fetch(SOUND_FILE_FOLDER + fileName)
    .then((response) => {
      if (!response.ok) throw new Error(`the file wasn't found (${response.status})`);
      return response.arrayBuffer();
    })
    .then(decodeAudio)
    .then((decoded) => { SOUND_FILES[fileName] = decoded; })
    .catch((err) => console.warn(`Couldn't load the audio file "${SOUND_FILE_FOLDER + fileName}": ${err.message}`));
}

// turns an audio file's bytes (mp3, wav, ogg...) into { data, rate, seconds }, mixed down to one
// channel. an OfflineAudioContext can decode before the page has been clicked, unlike a normal one.
// decoding converts the file to the context's sample rate (SOUND_RATE), so rate always comes out as
// 44100 really, but renderSound() reads it anyway in case that changes. which formats work is up to
// the browser: mp3 and wav are the safest, ogg works in most but older Safari can't play it.
// ponytail: stereo files become mono here, and the stereo comes back from panning. a stereo music
// track would lose its width, so music might want its own path one day
function decodeAudio(bytes) {
  return new OfflineAudioContext(1, 1, SOUND_RATE).decodeAudioData(bytes).then((buffer) => {
    const data = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const channel = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) data[i] += channel[i] / buffer.numberOfChannels;
    }
    return { data, rate: buffer.sampleRate, seconds: buffer.duration };
  });
}

// ---------- drawing sounds ----------
// these draw with whatever stroke is set, so set it first (and noFill())

// how many cycles the close-up of a wave shows for a pitch: one more for every octave up, the way your
// ear hears it (55 Hz is 1, 440 is 3, 3520 is 6)
function closeUpCycles(pitch) {
  return constrain(Math.log2(pitch / 55), 1, 6);
}

// a few cycles of a wave's shape filling x, y, w, h, for little pictures of a wave (sound block
// markers). noise and file have no shape, so they get a made up picture: jagged lines for noise, a
// little swell for a file
function drawWaveShape(wave, x, y, w, h, cycles = 2) {
  const shape = SOUND_WAVES[wave].shape ?? (wave === 'noise' ? (p) => Math.sin(p * 997) * Math.sin(p * 131) : (p) => Math.sin(p * Math.PI * 6) * Math.sin(p * Math.PI));
  beginShape();
  for (let i = 0; i <= w; i++) vertex(x + i, y + h / 2 - shape(((i / w) * cycles) % 1, 0.5) * (h / 2) * 0.8);
  endShape();
}

// the loudest and quietest sample in each of `columns` slices of a worked out sound, for drawing the
// whole thing. kept, since the palette draws every sound every frame
const soundOverviews = new Map();
function soundOverview(sound, columns) {
  const key = `${JSON.stringify(sound)}|${columns}|${sound.wave === 'file' && Boolean(SOUND_FILES[sound.file])}`;
  if (!soundOverviews.has(key)) {
    const { samples } = Sound.render(sound);
    const overview = new Float32Array(columns * 2);
    for (let c = 0; c < columns; c++) {
      let lowest = 0;
      let highest = 0;
      const end = Math.floor(((c + 1) / columns) * samples.length);
      for (let i = Math.floor((c / columns) * samples.length); i < end; i++) {
        lowest = Math.min(lowest, samples[i]);
        highest = Math.max(highest, samples[i]);
      }
      overview[c * 2] = lowest;
      overview[c * 2 + 1] = highest;
    }
    // ponytail: never shrinks past 500, about 1 MB, fine for an editor
    if (soundOverviews.size >= 500) soundOverviews.delete(soundOverviews.keys().next().value);
    soundOverviews.set(key, overview);
  }
  return soundOverviews.get(key);
}

// the whole sound from start to end inside x, y, w, h, like a music program shows it: a line from the
// loudest to the quietest point of each column, so you see its volume shape, repeats and gaps
function drawSoundShape(sound, x, y, w, h) {
  const columns = Math.max(1, Math.floor(w));
  const overview = soundOverview(sound, columns);
  const middle = y + h / 2;
  for (let c = 0; c < columns; c++) {
    line(x + c, middle - overview[c * 2 + 1] * (h / 2), x + c, middle - overview[c * 2] * (h / 2) + 0.5);
  }
}
