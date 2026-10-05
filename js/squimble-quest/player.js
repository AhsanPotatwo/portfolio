// the player (just a rectangle until there's a sprite). the stuff it shares with everyone else is in
// Character (character.js). this file has its inventory, who it can hit, and dying
class Player extends Character {
  constructor(x, y) {
    // PLAYER is in config.js
    super(x, y, PLAYER);

    // the hotbar and then the bag (inventory.js). empty until giveStartingItems()
    this.inventory = new Inventory(HOTBAR_SIZE + BAG_SIZE);
    // [col, row] of the tile under the feet the last time step triggers checked (Warps.checkStep() in
    // warps.js), so step warps and step sound blocks only go off when you step onto them. it's on the
    // player so each player's steps are tracked separately
    this.stepTile = null;
  }

  // gives PLAYER.startingItems, starting from slot 1. runs once items.json has loaded (sketch.js)
  giveStartingItems() {
    for (const name of PLAYER.startingItems) this.inventory.add(createItem(name));
  }

  // the held item's weapon, or null for empty hands or an item that isn't a weapon
  currentWeapon() {
    const item = this.inventory.held();
    return item && item.type.weapon ? WEAPONS[item.type.weapon] : null;
  }

  targets(world) {
    return world.enemies;
  }

  die() {
    this.respawn();
  }

  // back to full health somewhere safe. this is a placeholder until there's a proper death screen.
  //
  // ponytail: I haven't decided where you should respawn yet (README.md known issues). for now it's
  // the current map's spawn. it's all in this function, so this is the only thing that needs to
  // change. the options:
  //   - the current map's spawn (what it does now). dying in the hut puts you in the hut
  //   - always the start of the game: loadMap(START_MAP) (maps.js) instead of the lines below.
  //     loadMap() (sketch.js) places the player and calls Warps.arrived() by itself
  //   - the last warp you came in through (how it used to work): loadMap() would have to save it.
  //     going in and out of a building moved your respawn to its door, which felt like a bug
  //   - checkpoints (a bed, a campfire): a new trigger (copy warps.js) that saves its map and spot
  //     when you touch it. respawn with loadMap(map) and then placeAt()
  // anything that moves the player without walking has to call Warps.arrived() afterwards, so a
  // 'step' warp where they land doesn't go off (warps.js)
  respawn() {
    this.health = this.maxHealth;
    // worldMap is the game's (sketch.js)
    this.x = worldMap.spawn.x;
    this.y = worldMap.spawn.y;
    Warps.arrived(this, worldMap);
  }

  // jumps to a spot when starting on a map or arriving through a warp (loadMap() in sketch.js)
  placeAt(x, y) {
    this.x = x;
    this.y = y;
    // forget the tile from the last map, so this one counts as just stepped on
    this.tile = null;
    this.tileCol = null;
    this.tileRow = null;
  }
}
