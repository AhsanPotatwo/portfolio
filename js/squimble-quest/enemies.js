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
//   width, height          its hitbox in px, what attacks hit. a sprite can be any size over it
//   feetWidth, feetHeight  the bit at the bottom that bumps into walls
//   speed                  walking speed in px/s
//   maxHealth              how much damage it takes to beat it
//   weapon                 its weapon's settings, like the grunt's claws (weapons.js), or null if it
//                          doesn't attack. each spawn can hold an item instead (a sword, a bow...),
//                          and what it wears, both picked by right clicking it in the editor
//   colour, outline        placeholder colours
//   hurtColour             the flash when it gets hit
//   healthBarColour        the bar over its head, shown once it's hurt
//   image                  a picture to use instead of the placeholder
//   ai                     how it behaves: an ENEMY_AIS name, like "smart" (see below). null just
//                          stands still. each spawn can pick a different one (right click it in
//                          the editor)
//   damageScale            its weapon's damage is multiplied by this (Character.attack())
//   attackSpeed            how much quicker it attacks again: its weapon's cooldown is divided by this
//   knockbackTaken         how much of a hit's knockback it takes, 0 never moves (the dummy), 2 flies
//                          twice as far (hitWith() in weapons.js)
//   staggerTaken           the same for how long hits stagger it
//   sightRange             how many px away it can see you from, if there's no wall in the way
//                          (sensePlayer() below). world px, so it's the same on any screen size
//                          (15 tiles is half the design screen's width)
//   hearing                how many px away it hears you from, even through walls
//   chaseRange             once it's after you, how far away you have to be (and unseen for its
//                          memory) before it gives up
//   memory                 seconds you have to be out of sight and past chaseRange before it forgets you
//   alertRange             allies within this many px get told when it spots you
//   attackRange            how close it has to be to swing (or its weapon's reach, if that's further).
//                          a bow shoots from further away by itself (canAttack() below)
// each spawn can change any of the ENEMY_SPAWN_STATS ones (right click it in the editor, Stats and
// Behaviour tabs), which Enemy (enemy.js) lays over its kind's
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
  damageScale: 1,
  attackSpeed: 1,
  knockbackTaken: 1,
  staggerTaken: 1,
  sightRange: 15 * TILE,
  hearing: 5 * TILE,
  chaseRange: 15 * TILE,
  memory: 8,
  alertRange: 8 * TILE,
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

// the settings each spawn can have its own of, saved in the map as its stats (only the ones that are
// different from its kind's, mapfile.js), with their sliders in the editor's enemy box (editEnemy() in
// editor.js): the tab, words, range and tip. a new one is a line here (and an ENEMY_DEFAULTS one, read
// through enemy.type like the rest)
const ENEMY_SPAWN_STATS = [
  { key: 'maxHealth', tab: 'Stats', label: 'Health', min: 1, max: 1000, unit: 'hp', tip: 'How much damage it takes to beat it' },
  { key: 'speed', tab: 'Stats', label: 'Speed', min: 0, max: 400, step: 5, unit: 'px/s', tip: "How fast it walks. The player's is 170" },
  { key: 'damageScale', tab: 'Stats', label: 'Damage', min: 0, max: 5, step: 0.05, unit: '×', tip: "Its weapon's damage is multiplied by this" },
  { key: 'attackSpeed', tab: 'Stats', label: 'Attack rate', min: 0.25, max: 4, step: 0.05, unit: '×', tip: 'How much quicker it attacks again after each attack' },
  { key: 'knockbackTaken', tab: 'Stats', label: 'Knockback', min: 0, max: 3, step: 0.05, unit: '×', tip: 'How much knockback it takes. 0 never moves, 2 flies twice as far' },
  { key: 'staggerTaken', tab: 'Stats', label: 'Stagger', min: 0, max: 3, step: 0.05, unit: '×', tip: "How long hits stop it walking and attacking. 0 can't be stopped" },
  { key: 'sightRange', tab: 'Behaviour', label: 'Sight', min: 0, max: 1500, step: 10, unit: 'px', tip: "How far it sees you from when there's no wall in the way. A tile's 32" },
  { key: 'hearing', tab: 'Behaviour', label: 'Hearing', min: 0, max: 600, step: 8, unit: 'px', tip: 'How far it hears you from, even through walls' },
  { key: 'chaseRange', tab: 'Behaviour', label: 'Chase range', min: 0, max: 2000, step: 10, unit: 'px', tip: "Once it's after you, how far you have to get before it can give up" },
  { key: 'memory', tab: 'Behaviour', label: 'Memory', min: 0, max: 30, step: 0.5, unit: 's', tip: 'How long you have to be out of sight and past its chase range before it forgets you' },
  { key: 'alertRange', tab: 'Behaviour', label: 'Alerts', min: 0, max: 1000, step: 8, unit: 'px', tip: 'Allies this close get told when it spots you, even through walls' },
  { key: 'attackRange', tab: 'Behaviour', label: 'Attack range', min: 0, max: 300, step: 2, unit: 'px', tip: "How close it gets before swinging, or its weapon's reach if that's further. Bows shoot from further" },
];

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
//             never do). hearing means within its hearing, even through walls
//   alerting  the moment it notices someone, any allies within its alertRange that aren't already
//             after someone get told too, even through walls. this only happens when it notices you
//             itself, so it doesn't chain right across the whole map
//   tracking  once it's after you, it knows where you are as long as you're within its chaseRange,
//             seen or not. so ducking round a corner or behind a house doesn't shake it off. unseen
//             counts the seconds since it last saw or heard you
//   losing    it only gives up after its memory (seconds) unseen while you're further away than its
//             chaseRange. the pathfinders then walk home, and direct ones just stand where they are
// the ranges and memory are its kind's settings (ENEMY_DEFAULTS above), and each spawn can change them
// all of this is stored on the enemy as chasing (the player) and unseen (seconds), which are set up
// in enemy.js. they also get read by Warps.sendFollowers() (warps.js, which decides who follows you
// through a warp), crowdCosts() in pathfinding.js (a direct chaser is guessed to be heading for who
// it's chasing) and the dev mode label.
// limits: sight is just one line from feet to feet, and hearing ignores walls completely, so a thin
// wall between you and an enemy 5 tiles away doesn't hide you. a new sense (like noticing when it gets
// hit) would go here.

// the player it's after (enemy.chasing), or null. see "senses" above. call it once per frame for
// each enemy, since it uses dt to count unseen
function sensePlayer(enemy, world, dt) {
  const feet = (c) => ({ x: c.x, y: c.y + feetBelowCentre(c.settings) }); // character.js
  const notices = (player) => {
    const a = feet(enemy);
    const b = feet(player);
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    return distance <= enemy.type.hearing || (distance <= enemy.type.sightRange && world.map.clearLine(a.x, a.y, b.x, b.y));
  };

  // a player it's only just noticed (or one nearer than who it's after) takes over, and the allies
  // get alerted
  const near = nearestPlayer(world, enemy); // character.js
  if (near && near !== enemy.chasing && notices(near)) {
    enemy.chasing = near;
    for (const ally of world.enemies) {
      if (ally !== enemy && !ally.chasing && ally.ai && Math.hypot(ally.x - enemy.x, ally.y - enemy.y) <= enemy.type.alertRange) {
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
  if (enemy.unseen > enemy.type.memory && Math.hypot(target.x - enemy.x, target.y - enemy.y) > enemy.type.chaseRange) enemy.chasing = null;
  return enemy.chasing;
}

// ---------- attacking ----------

// how much of a bow's reach an enemy shoots from. its arrows drop near the end of their reach, so not
// all of it
const ENEMY_SHOT_RANGE = 0.85;

// can it hit the player from where it is, with what it's holding (Enemy.currentWeapon(), enemy.js)?
// a swing reaches attackRange, or further if its weapon does (an axe it's been given in the editor). a
// shot reaches ENEMY_SHOT_RANGE of its arrows' reach. either only with no wall in the way (clearLine() in
// tilemap.js), since walls stop arrows and swings (MeleeSwing.clearTo(), weapons.js). every ai uses
// this, and stands still to shoot (isShooting()), so an enemy given a bow keeps its distance while it
// has a clear shot and walks closer when it doesn't
function canAttack(enemy, world, player) {
  const weapon = enemy.currentWeapon();
  if (!weapon) return false;
  const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
  const range = isRanged(weapon) ? weapon.reach * ENEMY_SHOT_RANGE : Math.max(enemy.type.attackRange, weapon.reach);
  const from = enemy.y + feetBelowCentre(enemy.settings); // character.js
  const to = player.y + feetBelowCentre(player.settings);
  return distance < range && world.map.clearLine(enemy.x, from, player.x, to);
}

// is it holding something that shoots? then it stands still while it can attack
function isShooting(enemy) {
  return isRanged(enemy.currentWeapon()); // weapons.js
}

// ---------- ais ----------

// heads straight for the player it's after (sensePlayer()) and attacks once it can (canAttack()), which
// for a bow means stopping where it is. it just slides along walls with no pathfinding, so it gets
// stuck behind them. this was the first ai I made, and it's kept as "direct"
function chasePlayer(enemy, world, dt) {
  const player = sensePlayer(enemy, world, dt);
  if (!player) return STAND_STILL;
  const attack = canAttack(enemy, world, player);

  return {
    move: attack && isShooting(enemy) ? STAND_STILL.move : towards(player.x - enemy.x, player.y - enemy.y),
    aim: { x: player.x, y: player.y },
    attack,
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
// practise on, it fills back up at 0 health) are in there. only their weapons can be changed in the
// editor so far (weaponeditor.js), and the Weapons tab's Export saves them
DataFiles.register('enemy', {
  define: defineEnemy,
  // colours and pictures (utils.js)
  loaded: () => prepareArt(ENEMY_TYPES, 'enemy'),
  names: () => Object.keys(ENEMY_TYPES),
  // only the settings that aren't normal, weapon too (typeToData() in utils.js)
  toData: (name) => {
    const type = ENEMY_TYPES[name];
    const data = typeToData(type, ENEMY_DEFAULTS);
    if (data.weapon) data.weapon = typeToData(type.weapon, WEAPON_DEFAULTS);
    return data;
  },
});
