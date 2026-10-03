// the enemy catalogue: every enemy kind and its behaviour. works like objects.js. placed in the
// editor's Enemies tab; each appears at its spawn on a map's first visit, then the map remembers it
// as left (defeated stay gone, hurt stay hurt) until reload or the editor opens (loadMap(), sketch.js).
//
// ============================== how to make an enemy ==============================
//
// add a defineEnemy() at the bottom, with only settings that differ from ENEMY_DEFAULTS:
//   defineEnemy('slime', { width: 30, height: 24, maxHealth: 40, speed: 70, colour: '#6cc56b' });
//
//   width, height          body size in px (what attacks hit)
//   feetWidth, feetHeight  the part at the bottom that hits walls
//   speed                  px/s walking
//   maxHealth              damage it takes to beat
//   weapon                 a WEAPONS name (weapons.js), null to not attack
//   colour, outline        placeholder colours
//   hurtColour             flash when hit
//   healthBarColour        overhead bar, shown once hurt
//   image                  picture instead of the placeholder
//   ai                     behaviour (below), null stands still. each spawn can pick another
//                          from ENEMY_AIS (right click it in the editor)
//   sightRange             distance it notices you from (chasePlayer and the pathfinders)
//   attackRange            distance it swings from
//   onDeath                (enemy) => { ... } at 0 health. still 0 after → gone for good, so it can
//                          drop loot, or revive like the dummy
//
// ---------- ai ----------
//
// runs every frame, returning the same controls the player gets from input (top of character.js):
//   ai: (enemy, world, dt) => ({ move: { x, y }, aim: { x, y }, attack: true or false }),
// world is { map, players, enemies, npcs, characters }; find players with nearestPlayer() (character.js). STAND_STILL for nothing. chasePlayer below is
// a full example (ai: chasePlayer); write new ones next to it, and add them to ENEMY_AIS so the
// editor can pick them. walls, collisions, damage, tiles and swings already work; the ai only decides
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

const ENEMY_TYPES = {};

// defineType() is in utils.js
function defineEnemy(name, settings) {
  defineType(ENEMY_TYPES, ENEMY_DEFAULTS, 'enemy', name, settings);
}

// ---------- ais ----------

// heads straight at the nearest player (character.js) within sightRange, swings within attackRange,
// else waits. slides along walls (no pathfinding)
function chasePlayer(enemy, world) {
  const player = nearestPlayer(world, enemy);
  if (!player) return STAND_STILL;
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy);

  if (distance > enemy.type.sightRange) return STAND_STILL;

  return {
    move: towards(dx, dy),
    aim: { x: player.x, y: player.y },
    attack: distance < enemy.type.attackRange,
  };
}

// the ais a spawn can pick in the editor (its "ai" in the map file). the pathfinders (pathfinding.js)
// go round walls and weigh harm against time; the number is caution, seconds of detour worth 1 hp
const ENEMY_AIS = {
  smart: pathfinder(0.15),   // like a player: avoids harm unless the way round is much longer
  careful: pathfinder(0.5),  // goes a long way round rather than get hurt
  reckless: pathfinder(0),   // shortest way, harm or not (still won't walk to its death)
  direct: chasePlayer,       // the original: straight at you, stuck behind walls
  still: null,
};

// ENEMY_AIS name of an ai, for the editor and dev mode
function aiName(ai) {
  return Object.keys(ENEMY_AIS).find((name) => ENEMY_AIS[name] === ai) ?? 'custom';
}

// walk direction to cover dx, dy: -1/0/1 each. 0 within 4px, or it flickers back and forth when level
function towards(dx, dy) {
  return { x: Math.abs(dx) > 4 ? Math.sign(dx) : 0, y: Math.abs(dy) > 4 ? Math.sign(dy) : 0 };
}

// ---------- the enemies ----------

// basic: chases round walls and swipes. slower than you and weak alone. 3 sword or 2 axe hits
defineEnemy('grunt', {
  width: 28,
  height: 50,
  speed: 95,
  maxHealth: 60,
  weapon: 'claws',
  colour: '#d64545',
  outline: '#6e1f1f',
  ai: ENEMY_AIS.smart,
});

// practice target: doesn't move or fight, refills at 0 health
defineEnemy('dummy', {
  width: 28,
  height: 48,
  maxHealth: 100,
  colour: '#c9a36b',
  outline: '#6b4f2a',
  onDeath: (enemy) => { enemy.health = enemy.maxHealth; },
});
