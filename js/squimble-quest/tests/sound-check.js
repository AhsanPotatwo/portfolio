// checks the synthesiser (sound.js): loops join smoothly, every sound file saves back out the same, bad
// settings get cleaned up, the string, tunes, scatter, reverb and levelling work, and every make one
// button makes a sound (soundeditor.js). also the doppler
// maths and moving sound blocks' paths (soundblocks.js). run it with
// node js/squimble-quest/tests/sound-check.js (no output means it all passed). add "--fix" to rewrite
// the sound and voice files in the exported format.
//
// it runs sound.js in node with just enough faked (constrain() from p5, TILE, UIElement), so it can
// only check the maths. it doesn't play anything, and doesn't touch the browser's audio, sound blocks
// or the sound editor's screen. those were checked by playing the game in Chrome through playwright (README "Checking
// changes"). it's slow-ish (15 to 20 seconds, most of it the make one buttons) because node's vm
// makes globals slow, not because the synthesiser is
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

// UIElement is faked too, just so soundeditor.js loads (for its make one buttons, SOUND_GENERATORS)
const game = { TILE: 32, console: { ...console, warn: () => {} }, constrain: (v, a, b) => Math.min(b, Math.max(a, v)), UIElement: class {} };
vm.createContext(game);
for (const file of ['utils.js', 'datafiles.js', 'sound.js', 'soundblocks.js', 'soundeditor.js']) vm.runInContext(fs.readFileSync(`${__dirname}/../${file}`, 'utf8'), game);

// every sound and voice, loaded like DataFiles.load() does (datafiles.js), then each one written back
// out has to match its file exactly
vm.runInContext('loadAudioFile = () => {}', game);
const DataFiles = vm.runInContext('DataFiles', game);
const files = [];
for (const kind of ['sound', 'voice']) {
  const folder = `${__dirname}/../../../assets/squimble-quest/${kind}s/`;
  for (const name of JSON.parse(fs.readFileSync(`${folder}index.json`, 'utf8'))) {
    const text = fs.readFileSync(`${folder}${name}.json`, 'utf8').replace(/\r\n/g, '\n');
    DataFiles.kinds[kind].define(name, JSON.parse(text));
    files.push({ kind, name, path: `${folder}${name}.json`, text });
  }
}
for (const { kind, name, path, text } of files) {
  const saved = DataFiles.text(DataFiles.kinds[kind].toData(name));
  if (process.argv.includes('--fix')) fs.writeFileSync(path, saved);
  else assert.strictEqual(saved, text, `${kind}s/${name}.json saves back out exactly the same`);
}

const SOUNDS = vm.runInContext('SOUNDS', game);
const VOICES = vm.runInContext('VOICES', game);

// every sound as a loop: the jump from the last sample back to the first is no bigger than the
// biggest jump between two samples anywhere else, so there's no click at the join
for (const sound of [...Object.values(SOUNDS), ...Object.values(VOICES)]) {
  const { samples } = game.renderSound(sound, true);
  let biggest = 0;
  for (let i = 1; i < samples.length; i++) biggest = Math.max(biggest, Math.abs(samples[i] - samples[i - 1]));
  const join = Math.abs(samples[0] - samples[samples.length - 1]);
  assert(join <= biggest + 1e-6, `${sound.name} loops without a click (join ${join.toFixed(4)}, biggest step ${biggest.toFixed(4)})`);
}

// a steady hum loops at a whole number of waves, and never goes silent
const hum = game.renderSound(SOUNDS.hum, true);
const cycles = hum.seconds * SOUNDS.hum.pitch;
assert(Math.abs(cycles - Math.round(cycles)) < 0.01, 'the hum loops at a whole number of waves');
const plain = game.renderSound(game.soundSettings({ wave: 'sine', pitch: 110, attack: 0, decay: 0, sustain: 1000 }), true);
let quietest = Infinity;
for (let i = 0; i < plain.samples.length; i += 401) quietest = Math.min(quietest, Math.max(...plain.samples.subarray(i, i + 401).map(Math.abs)));
assert(quietest > 0.5, 'a plain looped hum never dips in volume');

// one-shots are as long as their timings say
const alarm = SOUNDS.alarm;
assert(Math.abs(game.renderSound(alarm).seconds - game.soundTimings(alarm).seconds) < 0.001, 'one-shots are the right length');

// bad settings get cleaned up
const cleaned = game.soundSettings({ wave: 'kazoo', pitch: 99999, volume: 'loud', jump: -50 });
assert.strictEqual(cleaned.wave, 'square');
assert.strictEqual(cleaned.pitch, 5000);
assert.strictEqual(cleaned.volume, 60);
assert.strictEqual(cleaned.jump, -24);

// echoes make a one-shot longer by their tail, and the length still matches its timings
const echoed = game.soundSettings({ sustain: 50, decay: 50, echo: 200, echoFeedback: 50 });
assert(game.soundTimings(echoed).tail > 0.2, 'echo adds a tail');
assert(Math.abs(game.renderSound(echoed).seconds - game.soundTimings(echoed).seconds) < 0.001, 'echoed sounds are the right length');

// every wave and the new settings make real sound (no NaN, not silent), all at once
for (const wave of Object.keys(vm.runInContext('SOUND_WAVES', game)).filter((w) => w !== 'file')) {
  const busy = game.soundSettings({ wave, sustain: 300, wander: 3, wanderSpeed: 50, jump: 4, jump2: 3, jumpRepeat: 90, tremolo: 50, crackle: 200, fm: 30, echo: 50, vowelSlide: 3 });
  const { samples } = game.renderSound(busy);
  assert(samples.every((v) => !Number.isNaN(v)) && samples.some((v) => Math.abs(v) > 0.05), `${wave} with everything on makes sound`);
}

// the string plays in tune (its loop is one wave long), found from where the sound best matches itself
// a wave later
for (const hz of [110, 440, 1320]) {
  const { samples } = game.renderSound(game.soundSettings({ wave: 'string', pitch: hz, attack: 0, sustain: 400, decay: 200 }));
  let bestLag = 0;
  let best = -Infinity;
  for (let lag = 20; lag < 600; lag++) {
    let sum = 0;
    for (let i = 4410; i < 6410; i++) sum += samples[i] * samples[i + lag];
    if (sum > best) [best, bestLag] = [sum, lag];
  }
  assert(Math.abs(44100 / bestLag / hz - 1) < 0.02, `the string plays ${hz} Hz in tune (got ${(44100 / bestLag).toFixed(1)})`);
}

// a thin pulse wave is centred on 0, so it doesn't push the sound to one side
const thin = game.renderSound(game.soundSettings({ wave: 'square', pulseWidth: 15, attack: 10, sustain: 300, decay: 10 })).samples;
assert(Math.abs(thin.reduce((sum, v) => sum + v, 0) / thin.length) < 0.01, 'a thin pulse has no offset');

// tunes: the same settings make the same tune, the first note is the root, a climbing one ends an
// octave up and a falling or arching one back on the root
for (let tune = 1; tune < 40; tune++) {
  const climbs = game.soundMelody(game.soundSettings({ melody: tune, repeats: 6, contour: 0 }));
  assert.deepStrictEqual(Array.from(climbs), Array.from(game.soundMelody(game.soundSettings({ melody: tune, repeats: 6, contour: 0 }))), 'a tune is the same every time');
  assert(climbs[0] === 0 && climbs[5] === 12, `tune ${tune} climbs from the root to its octave`);
  for (const contour of [1, 2]) assert.strictEqual(game.soundMelody(game.soundSettings({ melody: tune, repeats: 5, contour, scale: tune % 6 })).at(-1), 0, 'falling and arching tunes end on the root');
}
assert(game.soundMelody(game.soundSettings({ melody: 0, repeats: 4 })).every((n) => n === 0), 'Tune 0 is off');

// scattered repeats never overlap, the first is on time, and the sound is as long as its timings say
const scattered = game.soundSettings({ attack: 0, sustain: 30, decay: 30, repeats: 12, gap: 80, scatter: 100, pitchScatter: 5, lastNote: 3 });
const timings = game.soundTimings(scattered);
const starts = game.soundRepeats(scattered, timings).map((r) => r.start);
assert.strictEqual(starts[0], 0, 'the first repeat starts on time');
for (let n = 1; n < starts.length; n++) assert(starts[n] - starts[n - 1] >= timings.beep, 'scattered repeats never overlap');
assert(Math.abs(game.renderSound(scattered).seconds - timings.seconds) < 0.001, 'a scattered tune with a long last note is the right length');

// reverb makes a one-shot longer by its tail, and a looping one joins without a click
const roomy = game.soundSettings({ wave: 'triangle', attack: 5, sustain: 100, decay: 150, repeats: 2, gap: 200, reverb: 60, reverbSize: 70 });
assert(game.soundTimings(roomy).tail > 0.5, 'reverb adds a tail');
assert(Math.abs(game.renderSound(roomy).seconds - game.soundTimings(roomy).seconds) < 0.001, 'reverb sounds are the right length');
{
  const { samples } = game.renderSound(roomy, true);
  let biggest = 0;
  for (let i = 1; i < samples.length; i++) biggest = Math.max(biggest, Math.abs(samples[i] - samples[i - 1]));
  assert(Math.abs(samples[0] - samples[samples.length - 1]) <= biggest + 1e-6, 'a reverb loop joins without a click');
}

// levelling: very different makers come out about as loud as each other
const loudness = (settings) => {
  const s = game.soundSettings({ ...settings, volume: settingVolume(settings) * game.levelGain(settings) });
  const { samples } = game.renderSound({ ...s, repeats: Math.min(s.repeats, 3), sustain: Math.min(s.sustain, 500) });
  let loudest = 0;
  for (let from = 0; from < samples.length; from += 1102) {
    let sum = 0;
    for (let i = from; i < Math.min(samples.length, from + 2205); i++) sum += samples[i] * samples[i];
    loudest = Math.max(loudest, Math.sqrt(sum / 2205));
  }
  return loudest;
};
const settingVolume = (settings) => settings.volume ?? 60;
const levels = [{ wave: 'pink', pitch: 1500, sustain: 1000, lowPass: 55, volume: 90 }, { wave: 'square', pitch: 300, sustain: 300, volume: 100 }, { wave: 'sine', pitch: 2000, sustain: 300, volume: 10 }].map(loudness);
assert(Math.max(...levels) / Math.min(...levels) < 1.5, `levelled sounds are about as loud (${levels.map((l) => l.toFixed(2)).join(', ')})`);

// the list of which sliders matter only names real settings
const settingKeys = new Set(vm.runInContext('SOUND_SETTINGS', game).map((s) => s.key));
for (const key of Object.keys(game.soundSettingMatters(game.soundSettings({})))) assert(settingKeys.has(key), `soundSettingMatters() names a real setting (${key})`);

// growl repeats every two waves, so a growling hum loops at a whole number of pairs of them
const growling = game.soundSettings({ wave: 'organ', pitch: 110, attack: 0, decay: 0, sustain: 1000, growl: 50 });
assert(Math.abs((game.renderSound(growling, true).seconds * 110) / 2 % 1) < 0.01, 'a growling hum loops at pairs of waves');

// every make one button makes real sound (no NaN, not silent) that isn't too long, and with every
// knob anywhere its settings are still numbers. only one short beep of each is worked out (no echo,
// at most 150 ms held and 150 ms fading), since all of them in full takes most of a minute. the
// tweaked kinds leave a maker's sound alone at their normal knobs
const generators = vm.runInContext('SOUND_GENERATORS', game);
const knobsFor = (kind, maker, anywhere) => Object.fromEntries(generators[kind].knobs.map((knob) => {
  const pick = anywhere ? [knob.min, knob.max] : maker.knobs?.[knob.key] ?? knob.normal;
  const value = typeof pick === 'function' ? pick() : Array.isArray(pick) ? pick[0] + Math.random() * (pick[1] - pick[0]) : pick;
  return [knob.key, Math.round(value / knob.step) * knob.step];
}));
for (const [kind, { make, makers }] of Object.entries(generators)) {
  for (const [name, maker] of Object.entries(makers)) {
    const sound = game.soundSettings(make(knobsFor(kind, maker, false), maker));
    const { seconds } = game.soundTimings(sound);
    const { samples } = game.renderSound({ ...sound, sustain: Math.min(sound.sustain, 150), decay: Math.min(sound.decay, 150), repeats: 1, echo: 0 });
    assert(samples.every((v) => !Number.isNaN(v)) && samples.some((v) => Math.abs(v) > 0.02), `${kind} ${name} makes sound`);
    assert(seconds < 12, `${kind} ${name} isn't too long (${seconds.toFixed(1)} s)`);
    for (let i = 0; i < 5; i++) {
      const wild = make(knobsFor(kind, maker, true), maker);
      assert(Object.values(wild).every((v) => v === undefined || typeof v === 'string' || Number.isFinite(v)), `${kind} ${name} with any knobs gives proper numbers`);
    }
    if (maker.make) {
      vm.runInContext('makerRandom = seededRandom(7)', game);
      const plain = game.soundSettings(maker.make());
      vm.runInContext('makerRandom = seededRandom(7)', game);
      const knobbed = game.soundSettings(make(knobsFor(kind, { knobs: {} }, false), maker));
      vm.runInContext('makerRandom = Math.random', game);
      assert.deepStrictEqual(knobbed, plain, `${kind}'s knobs leave ${name} alone at their normal values`);
    }
  }
}

// talking: a syllable per vowel group (a silent e doesn't count), the same words always sound the
// same, a question ends higher than it starts, and it lasts as long as the words take to type
const syllables = game.speechSyllables('Hello there, time to go?', 3);
assert.strictEqual(syllables.map((s) => s.letters).join(' '), 'he llo the ti to go');
assert(syllables[5].notes - game.speechSyllables('Hello there, time to go.', 3)[5].notes === 6, 'questions go up at the end');
const voice = VOICES['villager-voice'];
const said = game.renderSpeech(voice, 'Hello there, time to go?');
const again = game.renderSpeech(voice, 'Hello there, time to go?').samples;
assert(said.samples.every((v, i) => v === again[i]), 'talking is the same every time');
assert(said.samples.every((v) => !Number.isNaN(v)) && said.samples.some((v) => Math.abs(v) > 0.05), 'talking makes sound');
assert(Math.abs(said.seconds - (24 / voice.talkSpeed + game.soundTimings(voice).beep)) < 0.001, 'talking takes as long as typing the words');

// voices go in VOICES and sounds in SOUNDS, and changing a sound's kind moves it across
assert(VOICES['villager-voice'] && !SOUNDS['villager-voice'] && SOUNDS.coin && !VOICES.coin, 'voices and sounds are kept apart');
game.setSound('coin', { ...SOUNDS.coin, kind: 'voice' });
assert(VOICES.coin && !SOUNDS.coin, 'a sound made a voice moves to VOICES');
assert.strictEqual(game.findSound('coin'), VOICES.coin);

// the doppler effect: coming closer is higher, going away lower, going across or round you the same,
// you moving counts too, 0 is off, and it never goes past maxShift
const c = vm.runInContext('SOUND_DOPPLER', game).speedOfSound * 32;
const here = { x: 0, y: 0 };
const still = { x: 0, y: 0 };
const there = { x: 1000, y: 0 };
const close = (a, b) => Math.abs(a - b) < 1e-9;
assert(close(game.dopplerShift(here, still, there, { x: -c / 4, y: 0 }, 100), 4 / 3), 'a sound coming at a quarter of the speed of sound plays 4/3 as fast');
assert(close(game.dopplerShift(here, still, there, { x: c / 4, y: 0 }, 100), 4 / 5), 'and going away 4/5 as fast');
assert(close(game.dopplerShift(here, still, there, { x: 0, y: 300 }, 100), 1), 'going across the line between you changes nothing');
assert(close(game.dopplerShift(here, { x: c / 4, y: 0 }, there, still, 100), 5 / 4), 'walking towards a sound is higher');
assert(close(game.dopplerShift(here, still, there, { x: -c / 4, y: 0 }, 0), 1), 'doppler 0 is off');
assert(game.dopplerShift(here, still, there, { x: -c * 5, y: 0 }, 300) <= vm.runInContext('SOUND_DOPPLER', game).maxShift, 'it never bends past maxShift');
assert(close(game.soundVelocity({ x: 0, y: 0, map: 'a' }, { x: 10, y: 0, map: 'a' }, 0.1).x, 100), 'speed is how far it went over the time');
assert.strictEqual(game.soundVelocity({ x: 0, y: 0, map: 'a' }, { x: c, y: 0, map: 'a' }, 0.1).x, 0, 'a teleport counts as still');
assert.strictEqual(game.soundVelocity({ x: 0, y: 0, map: 'a' }, { x: 10, y: 0, map: 'b' }, 0.1).x, 0, 'so does changing map');

// moving sound blocks stay on their paths: a circle at its radius, side to side and past within
// distance / 2 of their tile, and still ones on their tile
const middle = { x: 10 * 32 + 16, y: 5 * 32 + 16 };
assert.deepStrictEqual({ ...game.soundBlockPosition({ col: 10, row: 5 }, 3) }, middle);
for (let t = 0; t < 20; t += 0.37) {
  const round = game.soundBlockPosition({ col: 10, row: 5, move: 'circle', distance: 4, speed: 6 }, t);
  assert(Math.abs(Math.hypot(round.x - middle.x, round.y - middle.y) - 128) < 1e-6, 'a circle stays at its radius');
  for (const move of ['side', 'past', 'upDown', 'pastDown']) {
    const at = game.soundBlockPosition({ col: 10, row: 5, move, distance: 6, speed: 5 }, t);
    assert(Math.abs(at.x - middle.x) <= 96 + 1e-6 && Math.abs(at.y - middle.y) <= 96 + 1e-6 && (at.x === middle.x || at.y === middle.y), `${move} stays on its line`);
  }
}
