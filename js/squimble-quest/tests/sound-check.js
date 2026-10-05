// checks the synthesiser (sound.js): loops join smoothly, sounds.json saves back out the same, and bad
// settings get cleaned up. run it with node js/squimble-quest/tests/sound-check.js (no output means it
// all passed). add "--fix" to rewrite sounds.json in the exported format
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const game = { TILE: 32, console: { ...console, warn: () => {} }, constrain: (v, a, b) => Math.min(b, Math.max(a, v)) };
vm.createContext(game);
for (const file of ['utils.js', 'sound.js']) vm.runInContext(fs.readFileSync(`${__dirname}/../${file}`, 'utf8'), game);

const soundsPath = `${__dirname}/../../../assets/squimble-quest/sounds/sounds.json`;
const text = fs.readFileSync(soundsPath, 'utf8').replace(/\r\n/g, '\n');
vm.runInContext('loadAudioFile = () => {}', game);
for (const { name, ...settings } of JSON.parse(text).sounds) game.setSound(name, settings);
if (process.argv.includes('--fix')) fs.writeFileSync(soundsPath, game.soundsToText());
else assert.strictEqual(game.soundsToText(), text, 'sounds.json saves back out exactly the same');

const SOUNDS = vm.runInContext('SOUNDS', game);

// every sound as a loop: the jump from the last sample back to the first is no bigger than the
// biggest jump between two samples anywhere else, so there's no click at the join
for (const sound of Object.values(SOUNDS)) {
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
