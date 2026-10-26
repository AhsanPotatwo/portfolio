// the player (just a rectangle until there's a sprite). the stuff it shares with everyone else is in
// Character (character.js). this file has its inventory, who it can hit, and dying and respawning
class Player extends Character {
  constructor(x, y) {
    // PLAYER is in config.js
    super(x, y, PLAYER);

    // the hotbar, the bag, then what you're wearing (inventory.js). empty until giveStartingItems()
    this.inventory = new Inventory(HOTBAR_SIZE + BAG_SIZE, EQUIPMENT_SLOTS);
    // [col, row] of the tile under the feet the last time step triggers checked (Warps.checkStep() in
    // warps.js), so step warps and step sound blocks only go off when you step onto them. it's on the
    // player so each player's steps are tracked separately
    this.stepTile = null;
    // what they're allowed to do, a ROLES name (config.js)
    this.role = PLAYER_ROLE;
  }

  // whether their role lets them use `power`: 'dev' (dev mode) or 'build' (the map editor)
  can(power) {
    return ROLES[this.role]?.includes(power) ?? false;
  }

  // gives PLAYER.startingItems, starting from slot 1. runs once the item files have loaded (sketch.js)
  giveStartingItems() {
    for (const name of PLAYER.startingItems) this.inventory.add(createItem(name));
  }

  // the held item's weapon, or null for empty hands or an item that isn't a weapon
  currentWeapon() {
    const item = this.inventory.held();
    return item?.type.weapon ?? null;
  }

  targets(world) {
    return world.enemies;
  }

  // what's in the equipment slots (inventory.js)
  worn() {
    return this.inventory.worn();
  }

  heldItem() {
    return this.inventory.held()?.type ?? null;
  }

  // dying is Character's die(): dead is set, and they stay where they fell until the death screen's
  // Respawn (deathscreen.js, which lists everything that's different while dead). anything else dying
  // should do (dropping items, losing money) goes here:
  //   die() { super.die(); ... }

  // back to full health somewhere safe, from the death screen (deathscreen.js).
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
    this.dead = false;
    this.health = this.maxHealth;
    this.trailHealth = this.maxHealth;
    // a fresh start: nothing from the fight that killed them carries on (placeAt() does the shoves)
    this.swing = null;
    this.stopDrawing();
    this.frozen = 0;
    this.hurtTimer = 0;
    this.invincible = 0;
    // a moment nothing can hit them, so they aren't killed again straight away (PLAYER in config.js)
    this.safe = PLAYER.respawnSafeTime;
    this.attackBuffer = 0;
    this.rollBuffer = 0;
    this.comboStep = 0;
    // worldMap is the game's (sketch.js)
    // multiplayer: that's this computer's map, not necessarily the one this player died on. it'd want
    // the player's own room's spawn (and respawning on another map moves just them, see loadMap())
    this.placeAt(worldMap.spawn.x, worldMap.spawn.y);
    Warps.arrived(this, worldMap);
  }

  // dead, they disappear, or play their deathImage (PLAYER in config.js) where they died: drawBody()
  // shows it, a sheet that doesn't loop staying on its last frame (art.js). no health bar or swing
  draw() {
    if (this.dead) this.drawBody();
    else super.draw();
  }

  // jumps to a spot when starting on a map or arriving through a warp (loadMap() in sketch.js)
  placeAt(x, y) {
    this.x = x;
    this.y = y;
    // the knockback that killed you (or anything else shoving you) doesn't carry on after
    this.pushVelocity = { x: 0, y: 0 };
    this.pushLocked = false;
    this.stagger = 0;
    this.roll = null;
    this.squash = 0;
    // forget the tile from the last map, so this one counts as just stepped on
    this.tile = null;
    this.tileCol = null;
    this.tileRow = null;
  }
}
