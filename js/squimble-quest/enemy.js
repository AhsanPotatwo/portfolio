// an enemy. shared behaviour is in Character (character.js), its kind (size, health, ai...) in
// enemies.js. here: who it hits, dying, following through warps
class Enemy extends Character {
  // type: an ENEMY_TYPES name. col, row: its tile. ai: its spawn's ENEMY_AIS name (enemies.js), or
  // undefined for its kind's own
  constructor(type, col, row, ai) {
    super(0, 0, ENEMY_TYPES[type]);
    this.type = ENEMY_TYPES[type];
    this.ai = ai !== undefined ? ENEMY_AIS[ai] : this.type.ai;
    // the player it's after, and seconds since it last saw or heard them (sensePlayer() in enemies.js).
    // set by every ai, read by Warps.sendFollowers() (warps.js) and the pathfinders
    this.chasing = null;
    this.unseen = 0;
    // the pathfinders' (pathfinding.js, whose header explains each): current route (planPath()),
    // else null, which other enemies read to predict it; the tile it started on, to go back to
    // ({ map, col, row }, set on its first think); being stuck and giving way (checkStuck()). all
    // start empty, so a fresh enemy (spawnCharacters() in sketch.js) has no memory of the last one
    this.plan = null;
    this.home = null;
    this.stuck = null;
    this.placeFeetOnTile(col, row);
    // { warp, time } while following the player through a warp: seconds until it comes out
    // (Warps.sendFollowers() in warps.js). else null
    this.following = null;
  }

  update(dt, world) {
    // ai decides, unless following through a warp
    const controls = this.following ? this.followThroughWarp(dt) : this.think(world, dt);
    super.update(controls, dt, world);
  }

  // walks to the warp, comes out when time's up (Warps.comeOut() in warps.js). time is the walk's
  // expected length, so one stuck behind a wall still gets through, like one following to another map
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

  // this.ai, not the kind's, since a spawn can pick another
  think(world, dt) {
    return this.ai ? this.ai(this, world, dt) : STAND_STILL;
  }

  targets(world) {
    return world.players;
  }

  // onDeath first (enemies.js); still on 0 health after → gone for good
  die() {
    if (this.type.onDeath) this.type.onDeath(this);
    if (this.health <= 0) this.dead = true;
  }
}
