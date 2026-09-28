// the enemy catalogue: every kind of enemy, and how it behaves. works like tiles.js and objects.js.
// enemies are placed on maps in the map editor (the Enemies tab), and each one appears where it
// was placed when the map loads.
//
// ============================== how to make an enemy ==============================
//
// add a defineEnemy() at the bottom of this file. you only give the settings that are different
// from ENEMY_DEFAULTS:
//
//   defineEnemy('slime', { width: 30, height: 24, maxHealth: 40, speed: 70, colour: '#6cc56b' });
//
// the settings:
//
//   width, height          size of its body in pixels (what attacks hit)
//   feetWidth, feetHeight  the part that bumps into walls, at the bottom of the body
//   speed                  pixels per second when it walks
//   maxHealth              how much damage it takes to beat
//   weapon                 a name from WEAPONS (weapons.js), or null if it doesn't attack
//   colour, outline        placeholder colours, until there's art
//   hurtColour             what it flashes when hit
//   image                  a picture for it instead of the placeholder
//   ai                     what it does, see below. null just stands still
//   onDeath                runs when it hits 0 health: (enemy) => { ... }. if its health is
//                          still 0 afterwards it's gone for good, so onDeath could drop loot,
//                          or bring it back like the training dummy
//
// ---------- ai ----------
//
// ai is a function the game runs every frame. it decides what the enemy does by giving back the
// same controls the keyboard and mouse give the player (see the top of character.js):
//
//   ai: (enemy, world, dt) => ({ move: { x, y }, aim: { x, y }, attack: true or false }),
//
// world has { map, player, enemies, npcs } in it, so it can see where the player is. for example,
// an enemy that walks at the player and swings its weapon when it's close:
//
//   ai: (enemy, world) => {
//     const player = world.player;
//     const dx = player.x - enemy.x;
//     const dy = player.y - enemy.y;
//     return {
//       // -1, 0 or 1 each way. 0 once it's within a few pixels, otherwise when it's level with the
//       // player it would flick between up and down every frame, and jitter along diagonally
//       move: { x: Math.abs(dx) > 4 ? Math.sign(dx) : 0, y: Math.abs(dy) > 4 ? Math.sign(dy) : 0 },
//       aim: { x: player.x, y: player.y },
//       attack: Math.hypot(dx, dy) < 50,
//     };
//   },
//
// walking into walls, getting hurt, tiles like lava and swinging weapons all already work
// for enemies, the ai only has to decide what to do
//
// ====================================================================================

const ENEMY_DEFAULTS = {
  width: 28,
  height: 56,
  feetWidth: 24,
  feetHeight: 14,
  speed: 100,
  maxHealth: 50,
  weapon: null,
  colour: '#c0392b',
  outline: '#5e1c1c',
  hurtColour: '#ffffff',
  hurtFlashTime: 0.15,
  image: null,
  ai: null,
  onDeath: null,
};

// every enemy, by name. filled in by defineEnemy() below
const ENEMY_TYPES = {};

function defineEnemy(name, settings) {
  ENEMY_TYPES[name] = { ...ENEMY_DEFAULTS, ...settings, name };
}

// ---------- the enemies ----------

// something to practise on. it doesn't move or fight back, and when it runs out of health
// it just fills back up, so you can keep hitting it
defineEnemy('dummy', {
  width: 28,
  height: 48,
  maxHealth: 100,
  colour: '#c9a36b',
  outline: '#6b4f2a',
  onDeath: (enemy) => { enemy.health = enemy.maxHealth; },
});
