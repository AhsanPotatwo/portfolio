// checks which sounds get captions and how they stack (Captions in access.js). run it with
// node js/squimble-quest/tests/access-check.js
// no output means it all passed
const assert = require('assert');
const { load } = require('./load');

// just enough of the game: the settings, the listener at 0, 0 on map m, and a clock to move on
const map = { name: 'm' };
let now = 0;
const game = load(['access.js'], {
  GAME_SETTINGS: { captions: true },
  Editor: { active: false },
  Sound: {
    listener: { x: 0, y: 0, map },
    volumeAt: (at, range) => Math.max(0, 1 - Math.hypot(at.x, at.y) / (range * 32)) ** 2,
  },
  millis: () => now * 1000,
});
const { Captions, CAPTIONS } = game;

const play = (name, at, { channel = 'effects', range = 10, minVolume = 0 } = {}) => Captions.heard({ name }, { at, channel, range, minVolume });
const words = () => [...Captions.list].map((c) => c.words);
const away = { x: 100, y: 0, map };

play('lava-bubbling', away, { channel: 'world' });
assert.deepStrictEqual(words(), ['Lava bubbling'], 'a sound with no caption says its name');
play('grass-step', away);
play('dirt-step', { x: -100, y: 0, map });
assert.deepStrictEqual(words(), ['Lava bubbling', 'Footsteps'], 'steps on grass and dirt share one caption');
assert.strictEqual(Captions.list[1].at.x, -100, 'which points at the newest');

play('hit', { x: 5, y: 5, map });
assert(!words().includes('Hit'), "your own sounds (right where you are) aren't captioned");
play('hit', { x: 1000, y: 0, map });
assert(!words().includes('Hit'), "nor ones too far away to hear");
play('hit', { x: 1000, y: 0, map }, { minVolume: 0.5 });
assert(words().includes('Hit'), 'unless they can be heard from anywhere');
play('thunder', null);
assert(words().includes('Thunder'), 'a sound with no place (everywhere) is captioned');
play('hello', away, { channel: 'voices' });
play('beep', away, { channel: null });
assert(!words().includes('Hello') && !words().includes('Beep'), "npcs talking and previews aren't");
Captions.heard({}, { at: away, channel: 'effects', range: 10, minVolume: 0 });
assert.strictEqual(Captions.list.length, 4, "and nor are sounds with no name (the editor's draft)");

for (const name of ['a', 'b', 'c', 'd', 'e', 'f']) play(name, away);
assert.strictEqual(Captions.list.length, CAPTIONS.most, `at most ${CAPTIONS.most} at once`);
assert.strictEqual(words().at(-1), 'F', 'the newest at the end');

game.GAME_SETTINGS.captions = false;
Captions.list = [];
play('hit', away);
assert.strictEqual(Captions.list.length, 0, 'nothing while captions are off');
