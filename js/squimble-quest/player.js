// the player. just a rectangle until there's a sprite.
// walking, health, tiles, aiming and attacking all come from Character (character.js).
// this file only has what's different about the player: its inventory, who it can hit,
// and what happens when it dies
class Player extends Character {
  constructor(x, y) {
    // PLAYER is in config.js
    super(x, y, PLAYER);

    // where to go back to after dying
    this.spawnX = x;
    this.spawnY = y;

    // what it's carrying (inventory.js): the hotbar, then the bag. starting with
    // PLAYER.startingItems from slot 1 along
    this.inventory = new Inventory(HOTBAR_SIZE + BAG_SIZE);
    for (const name of PLAYER.startingItems) this.inventory.add(createItem(name));
  }

  // attacks with the weapon of whatever it's holding. empty hands, or an item that isn't a
  // weapon, can't attack
  currentWeapon() {
    const item = this.inventory.held();
    return item && item.type.weapon ? WEAPONS[item.type.weapon] : null;
  }

  // the player's attacks hurt enemies
  targets(world) {
    return world.enemies;
  }

  // the player doesn't die for good, it goes back to the start
  die() {
    this.respawn();
  }

  // back to the start with full health. a placeholder until there's a proper death screen.
  // the start is often the warp they came in by, so this counts as arriving there, or a 'step'
  // warp would send them straight back out (warps.js). worldMap is the game's (sketch.js)
  respawn() {
    this.health = this.maxHealth;
    this.x = this.spawnX;
    this.y = this.spawnY;
    Warps.arrived(this, worldMap);
  }

  // jump straight to a spot and make it where you respawn. for starting on a map, or arriving
  // through a warp (loadMap() in sketch.js)
  placeAt(x, y) {
    this.x = x;
    this.y = y;
    this.spawnX = x;
    this.spawnY = y;
    // forget the last map's tile, so the tile here counts as freshly stepped on
    this.tile = null;
    this.tileCol = null;
    this.tileRow = null;
  }
}
