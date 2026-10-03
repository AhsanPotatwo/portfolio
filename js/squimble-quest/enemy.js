// an enemy. shared behaviour is in Character (character.js), its kind (size, health, ai...) in
// enemies.js. here: who it hits, dying, following through warps
class Enemy extends Character {
  // type: an ENEMY_TYPES name. col, row: its tile
  constructor(type, col, row) {
    super(0, 0, ENEMY_TYPES[type]);
    this.type = ENEMY_TYPES[type];
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

  targets(world) {
    return world.players;
  }

  // onDeath first (enemies.js); still on 0 health after → gone for good
  die() {
    if (this.type.onDeath) this.type.onDeath(this);
    if (this.health <= 0) this.dead = true;
  }
}
