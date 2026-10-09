// an enemy. the stuff it shares with everyone else is in Character (character.js), and its kind
// (size, health, ai...) is in enemies.js. this file has who it can hit, dying, and following you
// through warps
class Enemy extends Character {
  // type: an ENEMY_TYPES name. col, row: its tile. ai: the ENEMY_AIS name its spawn picked
  // (enemies.js), or undefined to use its kind's own. follows: whether its spawn picked to follow you
  // through warps, or undefined for its kind's followsThroughWarps
  constructor(type, col, row, ai, follows) {
    super(0, 0, ENEMY_TYPES[type]);
    this.type = ENEMY_TYPES[type];
    // the ai function this one uses (ENEMY_AIS), from its spawn's pick or its kind's. Character's think()
    // runs it
    this.ai = ENEMY_AIS[ai ?? this.type.ai] ?? null;
    // read by canFollow() (warps.js)
    this.followsThroughWarps = follows ?? this.type.followsThroughWarps;
    // the player it's after, and the seconds since it last saw or heard them (sensePlayer() in
    // enemies.js). every ai sets these, and Warps.sendFollowers() (warps.js) and the pathfinders read them
    this.chasing = null;
    this.unseen = 0;
    // these are for the pathfinders (the header of pathfinding.js explains each one). plan is its
    // current route (planPath()) or null, and other enemies read it to guess where it's going. home is
    // the tile it started on so it can go back ({ map, col, row }, set the first time it thinks).
    // stuck is for being stuck and giving way (checkStuck()). they all start empty, so a fresh enemy
    // (spawnCharacters() in sketch.js) doesn't remember anything from the last one
    this.plan = null;
    this.home = null;
    this.stuck = null;
    this.placeFeetOnTile(col, row);
    // { warp, time } while it's following the player through a warp, where time is the seconds until
    // it comes out (Warps.sendFollowers() in warps.js). null otherwise
    this.following = null;
    // what it's wearing: item names by EQUIPMENT_SLOTS key (inventory.js), picked for its spawn in the
    // editor (spawnCharacters() in sketch.js sets it). only for show for now, armour doesn't do
    // anything yet
    this.wears = {};
    // what it's holding, picked for its spawn in the editor (spawnCharacters() sets it): an item's name
    // (items.js), null for empty hands, or undefined for its kind's own weapon (like the grunt's claws)
    this.holds = undefined;
  }

  worn() {
    return Object.values(this.wears).map((name) => ITEM_TYPES[name]).filter(Boolean);
  }

  // the held item's weapon, or its kind's own if it isn't holding anything picked. an item that's
  // missing or isn't a weapon means it can't attack
  currentWeapon() {
    if (this.holds === undefined) return this.type.weapon;
    return ITEM_TYPES[this.holds]?.weapon ?? null;
  }

  heldItem() {
    return ITEM_TYPES[this.holds] ?? null;
  }

  update(dt, world) {
    // the ai decides what to do, unless it's following someone through a warp
    const controls = this.following ? this.followThroughWarp(dt) : this.think(world, dt);
    super.update(controls, dt, world);
  }

  // walks to the warp and comes out when the time's up (Warps.comeOut() in warps.js). the time is how
  // long the walk should take, so one that's stuck behind a wall still gets through, same as one
  // following you to another map
  followThroughWarp(dt) {
    this.following.time -= dt;
    if (this.following.time <= 0) {
      Warps.comeOut(this);
      return STAND_STILL;
    }
    const x = (this.following.warp.col + 0.5) * TILE;
    const y = (this.following.warp.row + 0.5) * TILE;
    return { move: towards(x - this.x, y - (this.y + feetBelowCentre(this.settings))), aim: { x, y }, attack: false };
  }

  targets(world) {
    return world.players;
  }

  // runs its onDeath first (ENEMY_DEATHS in enemies.js), and if it's still on 0 health after that it's
  // gone for good, bursting its deathParticles (particles.js)
  die() {
    if (this.type.onDeath) ENEMY_DEATHS[this.type.onDeath](this);
    if (this.health > 0) return;
    this.dead = true;
    this.burstParticles(this.deathParticles);
  }
}
