// an enemy in the game. walking, health, tiles, aiming, attacking and drawing all come from
// Character (character.js). what kind of enemy it is (size, health, ai...) comes from enemies.js.
// this file only has what's different about enemies: who they hit, and dying
class Enemy extends Character {
  // type: a name from ENEMY_TYPES. col, row: the tile it stands on
  constructor(type, col, row) {
    super(0, 0, ENEMY_TYPES[type]);
    this.type = ENEMY_TYPES[type];
    this.placeFeetOnTile(col, row);
    // { warp, time } while it's following the player through a warp: the warp, and seconds until
    // it comes out the other side (Warps.sendFollowers() in warps.js). null the rest of the time
    this.following = null;
  }

  update(dt, world) {
    // its ai decides what to do, the same way the keyboard and mouse decide for the player,
    // unless it's following the player through a warp
    const controls = this.following ? this.followThroughWarp(dt) : this.think(world, dt);
    super.update(controls, dt, world);
  }

  // walks to the warp it's following the player through, and comes out the other side when its
  // time's up (Warps.comeOut() in warps.js). the time is how long the walk should take, so one
  // stuck behind a wall still gets through, the same as one following to another map would
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

  // an enemy's attacks hurt the player
  targets(world) {
    return [world.player];
  }

  // its onDeath runs first (enemies.js). if that leaves it on 0 health, it's gone for good
  die() {
    if (this.type.onDeath) this.type.onDeath(this);
    if (this.health <= 0) this.dead = true;
  }
}
