// an enemy in the game. walking, health, tiles, aiming, attacking and drawing all come from
// Character (character.js). what kind of enemy it is (size, health, ai...) comes from enemies.js.
// this file only has what's different about enemies: who they hit, and dying
class Enemy extends Character {
  // type: a name from ENEMY_TYPES. col, row: the tile it stands on
  constructor(type, col, row) {
    super(0, 0, ENEMY_TYPES[type]);
    this.type = ENEMY_TYPES[type];
    this.placeFeetOnTile(col, row);
  }

  update(dt, world) {
    // its ai decides what to do, the same way the keyboard and mouse decide for the player
    super.update(this.think(world, dt), dt, world);
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
