// the enemy catalogue: every kind of enemy, and how it behaves. works like tiles.js and objects.js.
// enemies are placed on maps in the map editor (the Enemies tab), and each one appears where it
// was placed the first time you go to the map. after that the map remembers it as it was left:
// once defeated it stays gone, and a hurt one stays hurt, until the page is reloaded or the map
// editor is opened (see loadMap() in sketch.js).
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
//   healthBarColour        its health bar, shown over its head once it's hurt
//   image                  a picture for it instead of the placeholder
//   ai                     what it does, see below. null just stands still
//   sightRange             for chasePlayer: how close you have to be before it comes after you
//   attackRange            for chasePlayer: how close it gets before it swings its weapon
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
// world has { map, player, enemies, npcs, characters } in it (see the top of character.js), so it
// can see where the player is. if it decides to do nothing, it can give back STAND_STILL.
// chasePlayer below is a complete example: the grunt uses it, and any other enemy can too
// (ai: chasePlayer), or you can write a new one next to it.
//
// walking into walls and other characters, getting hurt, tiles like lava and swinging weapons all
// already work for enemies, the ai only has to decide what to do
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
  healthBarColour: '#e05050',
  image: null,
  ai: null,
  sightRange: 300,
  attackRange: 44,
  onDeath: null,
};

// every enemy, by name. filled in by defineEnemy() below
const ENEMY_TYPES = {};

function defineEnemy(name, settings) {
  ENEMY_TYPES[name] = { ...ENEMY_DEFAULTS, ...settings, name };
}

// ---------- ais ----------

// comes straight at the player once they're within its sightRange, and swings its weapon when it's
// within attackRange. otherwise it waits where it is. it doesn't know about walls, it just slides
// along them (finding a way round would be the next step up, called pathfinding)
function chasePlayer(enemy, world) {
  const player = world.player;
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy);

  if (distance > enemy.type.sightRange) return STAND_STILL;

  return {
    // -1, 0 or 1 each way, towards the player. 0 once it's within a few pixels on that side,
    // otherwise when it's level with the player it would flick between up and down every frame
    move: { x: Math.abs(dx) > 4 ? Math.sign(dx) : 0, y: Math.abs(dy) > 4 ? Math.sign(dy) : 0 },
    aim: { x: player.x, y: player.y },
    attack: distance < enemy.type.attackRange,
  };
}

// ---------- the enemies ----------

// a basic enemy to fight: chases you and swipes at you. slower than you, so you can get away,
// and weak on its own. 3 sword hits or 2 axe hits beats it
defineEnemy('grunt', {
  width: 28,
  height: 50,
  speed: 95,
  maxHealth: 60,
  weapon: 'claws',
  colour: '#d64545',
  outline: '#6e1f1f',
  ai: chasePlayer,
});

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
