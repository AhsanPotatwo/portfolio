// the player. just a rectangle until there's a sprite.
// walking, health, tiles, aiming and attacking all come from Character (character.js).
// this file only has what's different about the player: its inventory, who it can hit,
// and what happens when it dies
class Player extends Character {
  constructor(x, y) {
    // PLAYER is in config.js
    super(x, y, PLAYER);

    // what it's carrying (inventory.js): the hotbar, then the bag. empty until giveStartingItems()
    this.inventory = new Inventory(HOTBAR_SIZE + BAG_SIZE);
  }

  // PLAYER.startingItems, from slot 1 along. run once items.json has loaded (sketch.js), since
  // there are no items before that
  giveStartingItems() {
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

  // back to life with full health, somewhere safe. a placeholder until there's a proper death screen.
  //
  // ponytail: where you respawn isn't decided yet (see "Respawning" in README.md's known issues).
  // for now it's the spawn point of whichever map you're on. everything about where you come back is
  // in this one function, so changing it later only means changing this. some ways it could work:
  //   - the spawn of the map you're on (what it does now). dying in the hut puts you in the hut
  //   - always the game's start: loadMap(START_MAP) instead of the lines below (START_MAP is in
  //     maps.js). loadMap() (sketch.js) places the player and calls Warps.arrived() itself
  //   - where you last came in through a warp, as it used to work: loadMap() would need to save
  //     where you arrived for this to read. going into a building and out again moves your respawn
  //     to its door, which felt like a bug
  //   - checkpoints, like a bed or a campfire: a new kind of trigger (copy how warps.js works) that
  //     saves its map and spot when touched, and this goes there with loadMap(map) then placeAt()
  // whatever it becomes, anything that moves the player without walking must call Warps.arrived()
  // afterwards, so a 'step' warp under where they land doesn't send them straight off (warps.js)
  respawn() {
    this.health = this.maxHealth;
    // worldMap is the game's (sketch.js)
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
