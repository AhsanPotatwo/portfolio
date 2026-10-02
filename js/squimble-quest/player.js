// the player. just a rectangle until there's a sprite.
// walking, health, tiles, aiming and attacking all come from Character (character.js).
// this file only has what's different about the player: its inventory, who it can hit,
// and what happens when it dies
class Player extends Character {
  constructor(x, y) {
    // PLAYER is in config.js
    super(x, y, PLAYER);

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

  // back to the spawn point of the map they're on, with full health. a placeholder until there's a
  // proper death screen. always the map's spawn, never the warp they came in by, so going through a
  // door and back doesn't move where you respawn. this counts as arriving there, so a 'step' warp
  // on the spawn doesn't send them straight off (warps.js). worldMap is the game's (sketch.js)
  respawn() {
    this.health = this.maxHealth;
    this.x = worldMap.spawn.x;
    this.y = worldMap.spawn.y;
    Warps.arrived(this, worldMap);
  }

  // jump straight to a spot, for starting on a map or arriving through a warp (loadMap() in sketch.js)
  placeAt(x, y) {
    this.x = x;
    this.y = y;
    // forget the last map's tile, so the tile here counts as freshly stepped on
    this.tile = null;
    this.tileCol = null;
    this.tileRow = null;
  }
}
