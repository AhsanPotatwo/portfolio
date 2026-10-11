// checks storage objects like chests: moving items between your inventory and a chest's, and which
// chest E reaches (Inventory and StorageObjects in inventory.js). run it with
// node js/squimble-quest/tests/storage-check.js
// no output means it all passed
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

// just enough of the game for inventory.js and closestInReach() in warps.js. the ui classes are only
// extended, never made here
const game = {
  TILE: 32,
  UIElement: class {},
  Button: class {},
  feetBelowCentre: () => 0,
  OBJECT_TYPES: { chest: { width: 1, height: 1 }, wardrobe: { width: 3, height: 1 } },
};
vm.createContext(game);
vm.runInContext(`${fs.readFileSync(`${__dirname}/../inventory.js`, 'utf8')}
${fs.readFileSync(`${__dirname}/../warps.js`, 'utf8')}
this.Inventory = Inventory;
this.StorageObjects = StorageObjects;
this.EQUIPMENT_SLOTS = EQUIPMENT_SLOTS;`, game);

// your inventory and a chest's
const sword = { type: { wear: null } };
const hat = { type: { wear: 'head' } };
const you = new game.Inventory(15, game.EQUIPMENT_SLOTS);
const chest = new game.Inventory(10);
you.slots[0] = sword;
chest.slots[3] = hat;
const head = 15;

assert(you.swapWith(0, chest, 0), 'puts the sword in the chest');
assert(you.slots[0] === null && chest.slots[0] === sword, 'and it moved');
assert(!chest.swapWith(0, you, head), "the sword can't be worn on your head");
assert(chest.slots[0] === sword && you.slots[head] === null, 'so nothing moved');
assert(chest.swapWith(3, you, head), 'the hat goes straight from the chest onto your head');
assert(you.slots[head] === hat && chest.slots[3] === null, 'and it moved');
assert(!you.swapWith(head, chest, 0), "swapping the hat for the sword would put the sword on your head");
assert(you.swap(1, 2), 'swapping inside one inventory still works');

// which one E reaches: a chest at (0, 0) and a wardrobe from (5, 0) to (7, 0)
const map = {
  objects: [
    { type: 'chest', col: 0, row: 0, inventory: chest },
    { type: 'wardrobe', col: 5, row: 0, inventory: new game.Inventory(20) },
    // something with no storage, like a table, is never opened
    { type: 'chest', col: 2, row: 1 },
  ],
};
const at = (col, row) => ({ x: (col + 0.5) * game.TILE, y: (row + 0.5) * game.TILE, settings: {} });
assert.strictEqual(game.StorageObjects.inReach(at(0, 1), map), map.objects[0], 'the chest from the tile below');
assert.strictEqual(game.StorageObjects.inReach(at(7, 1), map), map.objects[1], 'the wardrobe from below its right end');
assert.strictEqual(game.StorageObjects.inReach(at(2, 2), map), null, 'not the object with no storage');
assert.strictEqual(game.StorageObjects.inReach(at(0, 3), map), null, 'nothing from too far away');
