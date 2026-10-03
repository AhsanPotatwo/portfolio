// the player (a rectangle until there's a sprite). shared behaviour is in Character (character.js).
// here: inventory, who it hits, dying
class Player extends Character {
  constructor(x, y) {
    // PLAYER is in config.js
    super(x, y, PLAYER);

    // hotbar then bag (inventory.js). empty until giveStartingItems()
    this.inventory = new Inventory(HOTBAR_SIZE + BAG_SIZE);
  }

  // PLAYER.startingItems from slot 1. run once items.json has loaded (sketch.js)
  giveStartingItems() {
    for (const name of PLAYER.startingItems) this.inventory.add(createItem(name));
  }

  // the held item's weapon; null for empty hands or a non-weapon
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

  // back to full health somewhere safe. placeholder until a proper death screen.
  //
  // ponytail: respawn place undecided (README.md known issues). for now, the current map's spawn. it's
  // all in this function, so only this changes. options:
  //   - current map's spawn (now). dying in the hut puts you in the hut
  //   - always the game's start: loadMap(START_MAP) (maps.js) instead of the lines below; loadMap()
  //     (sketch.js) places the player and calls Warps.arrived() itself
  //   - the last warp you came in by (the old way): loadMap() would need to save it. entering and
  //     leaving a building moved your respawn to its door, which felt like a bug
  //   - checkpoints (bed, campfire): a new trigger (copy warps.js) saving its map and spot when
  //     touched; respawn with loadMap(map) then placeAt()
  // anything that moves the player without walking must call Warps.arrived() after, so a 'step' warp
  // where they land doesn't fire (warps.js)
  respawn() {
    this.health = this.maxHealth;
    // worldMap is the game's (sketch.js)
    this.x = worldMap.spawn.x;
    this.y = worldMap.spawn.y;
    Warps.arrived(this, worldMap);
  }

  // jump to a spot on starting a map or arriving by warp (loadMap() in sketch.js)
  placeAt(x, y) {
    this.x = x;
    this.y = y;
    // forget the last map's tile, so this one counts as freshly stepped on
    this.tile = null;
    this.tileCol = null;
    this.tileRow = null;
  }
}
