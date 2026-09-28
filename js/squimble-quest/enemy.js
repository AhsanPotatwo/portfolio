// an enemy in the game. walking, health, tiles, aiming and attacking all come from Character
// (character.js). what kind of enemy it is (size, health, ai...) comes from enemies.js.
// this file only has what's different about enemies: the ai, who they hit, and dying

// what an enemy with no ai does: nothing
const STAND_STILL = { move: { x: 0, y: 0 }, aim: null, attack: false };

class Enemy extends Character {
  // type: a name from ENEMY_TYPES. col, row: the tile it stands on
  constructor(type, col, row) {
    super(0, 0, ENEMY_TYPES[type]);
    this.type = ENEMY_TYPES[type];
    this.placeFeetOnTile(col, row);
  }

  // world: { map, player, enemies, npcs }
  update(dt, world) {
    // its ai decides what to do, the same way the keyboard and mouse decide for the player
    const controls = this.type.ai ? this.type.ai(this, world, dt) : STAND_STILL;
    super.update(controls, dt, world);
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

  draw() {
    this.drawBody();
    // once it's been hurt, a health bar over its head (character.js)
    if (this.health < this.maxHealth) this.drawHealthBar();
    if (this.swing) this.swing.draw();
  }
}
