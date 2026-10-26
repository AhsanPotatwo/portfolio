// checks what a landing hit does on top of the knockback (hitWith() in weapons.js): the player's
// hitInvincible stops a second hit until it runs out, a killing blow holds the swinger's hit stop for
// COMBAT.killHitStop, the damage pops up as a number, the health bar's trail drains down after, and
// each plays its weapon's own sounds (weaponSound()), heard from afar when it's the player's own hit.
// a bow's drawSound plays while it's drawn and is cut off when it shoots or the shot's lost.
// run it with node js/squimble-quest/tests/hit-check.js
// no output means it all passed
const assert = require('assert');
const { loadFighting, FLAT_FLOOR: floor } = require('./load');

const sounds = [];
const stopped = [];
const game = loadFighting({ playSound: (name, at, key, options) => { sounds.push({ name, ...options }); return sounds.at(-1); }, Sound: { stop: (voice) => stopped.push(voice) } });
const { Character, PLAYER, COMBAT, DamageNumbers, hitWith, MeleeSwing } = game;
const weapon = game.makeWeapon({ damage: 10, knockback: 0 }, 'test');
const body = (settings, x = 0) => Object.assign(new Character(x, 0, settings), { hitParticles: null });
const step = (c, seconds) => { for (let t = 0; t < seconds; t += 1 / 60) c.update({ move: { x: 0, y: 0 }, aim: null, attack: false }, 1 / 60, { map: floor, characters: [c], arrows: [] }); };

// the player can't be hit again until hitInvincible has run out
// a camera makes it this computer's player, which hears itself get hurt
const player = Object.assign(body(PLAYER), { camera: { shake() {} } });
const enemy = body({ ...PLAYER, hitInvincible: undefined });
hitWith(enemy, player, weapon, 0);
assert.strictEqual(player.health, 90);
assert(!player.hittable(), 'just hit, the player blinks and can\'t be hit');
step(player, PLAYER.hitInvincible + 0.1);
assert(player.hittable(), 'hittable again once hitInvincible is over');
// enemies don't have it, so combos keep landing
hitWith(player, enemy, weapon, 0);
assert(enemy.hittable());

// the trail stays where health was, then drains to it
assert.strictEqual(enemy.trailHealth, 100);
step(enemy, 1);
assert.strictEqual(enemy.trailHealth, enemy.health);

// a number popped up for each hit, and each made a sound
assert.strictEqual(DamageNumbers.list.length, 2);
// the enemy's hit on the player: its hit sound at normal distance, and the player's own ouch
const names = () => sounds.map((s) => s.name);
assert.deepStrictEqual(names(), ['thwack', PLAYER.hurtSound, 'thwack']);
assert.strictEqual(sounds[0].minVolume, 0);
// the player's hit on the enemy is heard however far away (hitHeard)
assert.strictEqual(sounds[2].minVolume, weapon.hitHeard);

// a weapon's own sounds, volume and pitch, and none plays nothing
sounds.length = 0;
const loud = game.makeWeapon({ damage: 1, hitSound: 'laser', soundVolume: 2, soundPitch: 2, soundWobble: 0, soundWeight: 0 }, 'loud');
hitWith(body(PLAYER), body(PLAYER, 30), loud, 0);
assert.deepStrictEqual(sounds, [{ name: 'laser', rate: 2, volume: 2, minVolume: 0 }]);
sounds.length = 0;
hitWith(body(PLAYER), body(PLAYER, 30), game.makeWeapon({ hitSound: null }, 'quiet'), 0);
assert.strictEqual(sounds.length, 0);

// a killing blow holds the swinger longer, and sounds like a kill
const swinger = body(PLAYER);
const victim = body({ ...PLAYER, maxHealth: 5 }, 30);
new MeleeSwing(swinger, weapon, 0, false).strike(victim, 0);
assert(victim.dead);
assert.strictEqual(swinger.frozen, COMBAT.killHitStop);
assert.strictEqual(sounds.at(-1).name, weapon.killSound);
// no kill sound uses the hit sound
const fallback = body({ ...PLAYER, maxHealth: 1 }, 30);
hitWith(swinger, fallback, game.makeWeapon({ killSound: null }, 'no kill sound'), 0);
assert.strictEqual(sounds.at(-1).name, 'thwack');

// a bow's draw sound starts with the draw, and stops when it shoots, or when a stagger loses the shot
const bow = game.makeWeapon({ attack: 'shoot', chargeTime: 0.5, drawSound: 'bow-draw', attackSound: 'arrow-shot' }, 'bow');
const archer = Object.assign(body({ ...PLAYER, weapon: bow }), { targets: () => [] });
const world = { map: floor, characters: [archer], arrows: [] };
const hold = (charge, frames) => { for (let i = 0; i < frames; i++) archer.update({ move: { x: 0, y: 0 }, aim: null, attack: charge, charge }, 1 / 60, world); };
sounds.length = 0;
hold(true, 10);
assert.deepStrictEqual(names(), ['bow-draw']);
const drawing = sounds[0];
hold(false, 1);
assert.deepStrictEqual(names(), ['bow-draw', 'arrow-shot']);
assert.deepStrictEqual(stopped, [drawing]);
hold(false, 30);
hold(true, 5);
archer.stagger = 0.2;
hold(true, 1);
assert.strictEqual(stopped.at(-1), sounds.at(-1), 'staggered mid-draw cuts the draw sound');
assert.strictEqual(archer.charge, null);
