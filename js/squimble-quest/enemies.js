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
//   sightRange             px it sees you from, walls in the way (sensePlayer() below)
//   attackRange            distance it swings from
//   onDeath                (enemy) => { ... } at 0 health. still 0 after → gone for good, so it can
//                          drop loot, or revive like the dummy
//
// ---------- ai ----------
//
// runs every frame, returning the same controls the player gets from input (top of character.js):
//   ai: (enemy, world, dt) => ({ move: { x, y }, aim: { x, y }, attack: true or false }),
// world is { map, players, enemies, npcs, characters }. find who to go for with sensePlayer() below,
// so every ai notices and loses players the same way. STAND_STILL for nothing. chasePlayer below is
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
  sightRange: 480,
  attackRange: 44,
  onDeath: null,
};

const ENEMY_TYPES = {};

// defineType() is in utils.js
function defineEnemy(name, settings) {
  defineType(ENEMY_TYPES, ENEMY_DEFAULTS, 'enemy', name, settings);
}

// ---------- senses ----------
// who an enemy goes for, shared by every ai so they all notice and lose you the same way. how the
// pathfinders then get to you is pathfinding.js (its header explains the whole system).
//
//   noticing  the nearest player (nearestPlayer(), so it works with several) that it can see, within
//             sightRange with no wall between (clearLine() in tilemap.js; seeThrough tiles like
//             water don't block, objects never do), or hear, within ENEMY_HEARING even through walls
//   alerting  the moment it notices someone, allies within ENEMY_ALERT_RANGE that aren't after
//             anyone yet are too, even through walls. only on its own noticing, so it doesn't chain
//             across a whole map
//   tracking  once after you it knows where you are while you're within sightRange, seen or not:
//             ducking round a corner or behind a house doesn't shake it. unseen counts the seconds
//             since it last saw or heard you
//   losing    only after ENEMY_MEMORY seconds unseen and farther than sightRange. the pathfinders
//             then walk home; direct ones stand where they are
// it all lives on the enemy: chasing (the player) and unseen (s), declared in enemy.js. also read by
// Warps.sendFollowers() (warps.js: who follows you through a warp), crowdCosts() in pathfinding.js
// (a direct chaser is predicted heading at its chasing) and the dev mode label.
// limits: sight is one line from feet to feet, and hearing ignores walls entirely, so a thin wall
// between you and one 5 tiles away doesn't hide you. a new sense (noticing when hit, say) goes here.

// px it hears you from, through walls
const ENEMY_HEARING = 5 * TILE;
// px within which allies are told when it spots you
const ENEMY_ALERT_RANGE = 8 * TILE;
// seconds out of sight (and out of sightRange) before it loses you
const ENEMY_MEMORY = 8;

// the player it's after (enemy.chasing), or null; see "senses" above. call it once per frame per
// enemy: it counts unseen with dt
function sensePlayer(enemy, world, dt) {
  const feet = (c) => ({ x: c.x, y: c.y + feetBelowCentre(c.settings) }); // character.js
  const notices = (player) => {
    const a = feet(enemy);
    const b = feet(player);
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    return distance <= ENEMY_HEARING || (distance <= enemy.type.sightRange && world.map.clearLine(a.x, a.y, b.x, b.y));
  };

  // a newly noticed player (or a nearer one than it's after) takes over, and alerts allies
  const near = nearestPlayer(world, enemy); // character.js
  if (near && near !== enemy.chasing && notices(near)) {
    enemy.chasing = near;
    for (const ally of world.enemies) {
      if (ally !== enemy && !ally.chasing && ally.ai && Math.hypot(ally.x - enemy.x, ally.y - enemy.y) <= ENEMY_ALERT_RANGE) {
        ally.chasing = near;
        ally.unseen = 0;
      }
    }
  }
  // gone from this map (left, or not a player here): forget them
  const target = enemy.chasing;
  if (!target || !world.players.includes(target)) {
    enemy.chasing = null;
    return null;
  }
  enemy.unseen = notices(target) ? 0 : enemy.unseen + dt;
  if (enemy.unseen > ENEMY_MEMORY && Math.hypot(target.x - enemy.x, target.y - enemy.y) > enemy.type.sightRange) enemy.chasing = null;
  return enemy.chasing;
}

// ---------- ais ----------

// heads straight at the player it's after (sensePlayer()), swings within attackRange. slides along
// walls (no pathfinding), so it gets stuck behind them: the original ai, kept as "direct"
function chasePlayer(enemy, world, dt) {
  const player = sensePlayer(enemy, world, dt);
  if (!player) return STAND_STILL;
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy);

  return {
    move: towards(dx, dy),
    aim: { x: player.x, y: player.y },
    attack: distance < enemy.type.attackRange,
  };
}

// the ais a spawn can pick in the editor (right click an enemy; saved as its "ai" in the map file,
// read back by addSpawn() in tilemap.js and Enemy's constructor). the pathfinders (pathfinding.js)
// go round walls, weigh harm against time and work round each other; the number is caution, seconds
// of detour worth 1 hp. names are what map files store, so renaming one breaks spawns using it (they
// fall back to their kind's ai, with a console warning). aiName() finds a name from the function
const ENEMY_AIS = {
  smart: pathfinder(0.15),   // like a player: avoids harm unless the way round is much longer
  careful: pathfinder(0.5),  // goes a long way round rather than get hurt
  reckless: pathfinder(0.03), // takes harm whenever it's quicker (but won't walk to its death)
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
