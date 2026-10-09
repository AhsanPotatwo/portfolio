// the enemy catalogue: every kind of enemy and how it behaves. each kind is a file in
// assets/squimble-quest/enemies/, like enemies/grunt.json, listed in enemies/index.json
// (datafiles.js), and the behaviour they can pick from (ais, what happens when they die) is code in
// here. works like objects.js. you place them in the editor's Enemies tab. each one appears at its spawn the first time you visit a map, and then
// the map remembers it as you left it (defeated ones stay gone, hurt ones stay hurt) until you reload
// or open the editor (loadMap(), sketch.js).
//
// ============================== how to make an enemy ==============================
//
// make a file named after it in enemies/ (copying one that's close is easiest), with only the
// settings that are different from ENEMY_DEFAULTS, and add its name to enemies/index.json.
// enemies/slime.json could be:
//   { "width": 30, "height": 24, "maxHealth": 40, "speed": 70, "colour": "#6cc56b", "ai": "smart" }
//
//   width, height          body size in px (this is what attacks hit)
//   feetWidth, feetHeight  the bit at the bottom that bumps into walls
//   speed                  walking speed in px/s
//   maxHealth              how much damage it takes to beat it
//   weapon                 its weapon's settings, like the grunt's claws (weapons.js), or null if it
//                          doesn't attack
//   colour, outline        placeholder colours
//   hurtColour             the flash when it gets hit
//   healthBarColour        the bar over its head, shown once it's hurt
//   image                  a picture to use instead of the placeholder
//   ai                     how it behaves: an ENEMY_AIS name, like "smart" (see below). null just
//                          stands still. each spawn can pick a different one (right click it in
//                          the editor)
//   sightRange             how many px away it can see you from, if there's no wall in the way
//                          (sensePlayer() below)
//   attackRange            how close it has to be to swing
//   sound                  a sound's name (SOUNDS, sounds/) it loops wherever it goes while you're
//                          in range, like a buzzing wasp or a rumbling machine. it gets the doppler
//                          effect as it moves (sound.js). each spawn can pick its own (right click it
//                          in the editor). null is silent
//   followsThroughWarps    whether it follows you through warps that let enemies through (a warp's
//                          enemies box). each spawn can change it (right click it in the editor)
//   doorOpenTime           seconds it takes to open an E warp (a door) when following you through
//                          one, like it's pressing E. null means it can't open doors, so it gets
//                          left behind at E warps but still follows through step ones
//                          (canFollow() in warps.js)
//   onDeath                what happens at 0 health: an ENEMY_DEATHS name, like "refill" for the
//                          dummy. if it's still on 0 afterwards it's gone for good. null just dies
//   hitParticles           the particle effect (PARTICLE_EFFECTS, particles/) that bursts out when a
//                          swing hits it, flying away from the swing. null is none
//   deathParticles         the one that bursts out when it dies for good. each spawn can pick its own
//                          of both (right click it in the editor, which can also edit them)
//
// ---------- ai ----------
//
// it runs every frame and gives back the same controls the player gets from the keyboard and mouse
// (top of character.js):
//   ai: (enemy, world, dt) => ({ move: { x, y }, aim: { x, y }, attack: true or false }),
// world is { map, players, enemies, npcs, characters }. use sensePlayer() below to find who to go
// for, so every ai notices you and loses you the same way. return STAND_STILL to do nothing.
// chasePlayer below is a full example. write new ones next to it, and add them to ENEMY_AIS with a
// name, which is what enemy files and the editor pick them by. walls, bumping into things, damage, tiles and swings already
// work, the ai just has to decide what to do
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
  sound: null,
  followsThroughWarps: true,
  doorOpenTime: 1,
  onDeath: null,
  hitParticles: 'blood',
  deathParticles: 'blood-burst',
};

// filled in from the enemy files (bottom of this file)
const ENEMY_TYPES = {};

// defineType() is in utils.js. an ai or onDeath that doesn't exist just leaves it out, with a warning
function defineEnemy(name, settings) {
  defineType(ENEMY_TYPES, ENEMY_DEFAULTS, 'enemy', name, settings);
  const type = ENEMY_TYPES[name];
  type.ai = checkAi(type.ai, `the enemy "${name}"`);
  if (type.onDeath !== null && !ENEMY_DEATHS[type.onDeath]) {
    console.warn(`The enemy "${name}" has an onDeath "${type.onDeath}" that isn't in ENEMY_DEATHS (enemies.js), so it just dies`);
    type.onDeath = null;
  }
  type.weapon = makeWeapon(type.weapon, `the enemy "${name}"`); // weapons.js
}

// an ai name from a file if it's in ENEMY_AIS, otherwise null (with a warning). npcs use it too
function checkAi(ai, owner) {
  if (ai === null || ai in ENEMY_AIS) return ai;
  console.warn(`${owner} has an ai "${ai}" that isn't in ENEMY_AIS (enemies.js), so it stands still`);
  return null;
}

// ---------- senses ----------
// works out who an enemy goes for. every ai shares this so they all notice you and lose you the same
// way. how the pathfinders then actually get to you is in pathfinding.js (its header explains the
// whole thing).
//
//   noticing  it goes for the nearest player (nearestPlayer(), so it works with more than one) that
//             it can either see or hear. seeing means within sightRange with no wall in between
//             (clearLine() in tilemap.js. seeThrough tiles like water don't block it, and objects
//             never do). hearing means within ENEMY_HEARING, even through walls
//   alerting  the moment it notices someone, any allies within ENEMY_ALERT_RANGE that aren't already
//             after someone get told too, even through walls. this only happens when it notices you
//             itself, so it doesn't chain right across the whole map
//   tracking  once it's after you, it knows where you are as long as you're within sightRange, seen
//             or not. so ducking round a corner or behind a house doesn't shake it off. unseen counts
//             the seconds since it last saw or heard you
//   losing    it only gives up after ENEMY_MEMORY seconds unseen while you're further away than
//             sightRange. the pathfinders then walk home, and direct ones just stand where they are
// all of this is stored on the enemy as chasing (the player) and unseen (seconds), which are set up
// in enemy.js. they also get read by Warps.sendFollowers() (warps.js, which decides who follows you
// through a warp), crowdCosts() in pathfinding.js (a direct chaser is guessed to be heading for who
// it's chasing) and the dev mode label.
// limits: sight is just one line from feet to feet, and hearing ignores walls completely, so a thin
// wall between you and an enemy 5 tiles away doesn't hide you. a new sense (like noticing when it gets
// hit) would go here.

// how many px away it can hear you from, through walls
const ENEMY_HEARING = 5 * TILE;
// allies within this many px get told when it spots you
const ENEMY_ALERT_RANGE = 8 * TILE;
// how many seconds you have to be out of sight (and out of sightRange) before it forgets you
const ENEMY_MEMORY = 8;

// the player it's after (enemy.chasing), or null. see "senses" above. call it once per frame for
// each enemy, since it uses dt to count unseen
function sensePlayer(enemy, world, dt) {
  const feet = (c) => ({ x: c.x, y: c.y + feetBelowCentre(c.settings) }); // character.js
  const notices = (player) => {
    const a = feet(enemy);
    const b = feet(player);
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    return distance <= ENEMY_HEARING || (distance <= enemy.type.sightRange && world.map.clearLine(a.x, a.y, b.x, b.y));
  };

  // a player it's only just noticed (or one nearer than who it's after) takes over, and the allies
  // get alerted
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
  // if they've gone from this map (they left, or they aren't a player here) then forget them
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

// heads straight for the player it's after (sensePlayer()) and swings once it's within attackRange.
// it just slides along walls with no pathfinding, so it gets stuck behind them. this was the first ai
// I made, and it's kept as "direct"
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

// the ais an enemy file or a spawn can pick by name. a spawn's (right click an enemy in the editor) gets
// saved as its "ai" in the map file and read back by addSpawn() in tilemap.js and Enemy's constructor. the pathfinders
// (pathfinding.js) go round walls, weigh up getting hurt against taking longer, and work round each
// other. the number is how cautious it is: how many seconds of detour it thinks 1 hp is worth.
// map and enemy files store these names, so renaming one breaks the ones using it (they go back to
// their kind's ai or stand still, with a console warning). aiName() finds the name for an ai function
const ENEMY_AIS = {
  smart: pathfinder(0.15),   // like a player would: avoids harm unless the way round is much longer
  careful: pathfinder(0.5),  // goes a long way round rather than get hurt
  reckless: pathfinder(0.03), // takes damage whenever it's quicker (but won't walk to its death)
  direct: chasePlayer,       // the first one: straight at you, gets stuck behind walls
  still: null,
};

// what can happen at 0 health, by name (an enemy's onDeath). each one gets the enemy, and if it's
// still on 0 health afterwards it's gone for good. dropping loot or splitting in two would go here
const ENEMY_DEATHS = {
  // fills straight back up, for something to practise on
  refill: (enemy) => { enemy.health = enemy.maxHealth; },
};

// the ENEMY_AIS name of an ai function, for the editor and dev mode
function aiName(ai) {
  return Object.keys(ENEMY_AIS).find((name) => ENEMY_AIS[name] === ai) ?? 'custom';
}

// which way to walk to cover dx, dy, as -1, 0 or 1 each. it's 0 within 4px, otherwise it flickers
// back and forth once it's level
function towards(dx, dy) {
  return { x: Math.abs(dx) > 4 ? Math.sign(dx) : 0, y: Math.abs(dy) > 4 ? Math.sign(dy) : 0 };
}

// ---------- the enemy files ----------

// every kind of enemy loads once at the start, before the maps, since maps check their enemies exist
// (datafiles.js). the grunt (the basic one, it chases you round walls) and the dummy (something to
// practise on, it fills back up at 0 health) are in there
DataFiles.register('enemy', {
  define: defineEnemy,
  // colours and pictures (utils.js)
  loaded: () => prepareArt(ENEMY_TYPES, 'enemy'),
});
