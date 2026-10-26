// checks items placed on the ground and what starts in chests are saved in map files and come back
// when the map's built again (mapfile.js, Drops.restock() and StorageObjects.fill() in inventory.js),
// while what happened while playing (picking up, emptying a chest) isn't saved. and that placed things
// keep their ids (takeId() in tilemap.js): through saving, and pasting where nothing else has it,
// with new ones for a file without them or with one twice. run it with
// node js/squimble-quest/tests/placed-items-check.js
// no output means it all passed
const assert = require('assert');
const { load } = require('./load');

// just enough of the game for a map with grass, a chest and two items. the ui classes are only
// extended, never made here
const ITEM_TYPES = { sword: { name: 'sword' }, potion: { name: 'potion' } };
const game = load(['tilemap.js', 'inventory.js', 'mapfile.js'], {
  TILE: 32,
  UIElement: class {},
  Button: class {},
  DataFiles: { register: () => {} },
  TILE_TYPES: { grass: { name: 'grass', solid: false } },
  OBJECT_TYPES: { chest: { width: 1, height: 1, solid: true, storage: { slots: 4 } } },
  ENEMY_TYPES: {},
  NPC_TYPES: {},
  ITEM_TYPES,
  createItem: (name) => ({ type: ITEM_TYPES[name] }),
  resolveTileName: (name) => name,
});
const { mapFromData, mapToData, mapDataToText, Drops } = game;
// lists made in the game are from its own sandbox, so they're compared as text
const same = (a, b, message) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), message);

const file = {
  version: 2, left: 0, top: 0, legend: { '..': null, gr: 'grass' }, rows: ['gr gr gr', 'gr gr gr'],
  objects: [{ type: 'chest', col: 0, row: 0, items: [null, 'potion', 'gone'], id: 'chest1' }],
  items: [{ type: 'sword', col: 2, row: 1, id: 'sword1' }, { type: 'gone', col: 1, row: 1, id: 'gone01' }],
};
const map = mapFromData(file);
assert.strictEqual(map.idsMade, 0, 'ids from the file are kept');

// on the ground, but only the item that exists
same(map.drops.map((drop) => drop.item.type.name), ['sword'], 'placed items are on the ground');
assert.strictEqual(map.drops[0].placed, map.items[0], 'a drop knows its entry');
Drops.restock(map);
assert.strictEqual(map.drops.length, 1, "restocking doesn't put it down twice");

// in the chest, slot for slot
const chest = map.objects[0];
same(chest.inventory.slots.map((item) => item?.type.name ?? null), [null, 'potion', null, null], 'the chest starts with its items');

// playing: pick up the sword and empty the chest. the file's the same
map.drops = [];
chest.inventory.slots.fill(null);
const saved = mapToData(map);
same(saved.items, file.items, "picking it up doesn't change the file, missing ones are kept");
same(saved.objects, file.objects, "emptying the chest doesn't either");

// built again (a reload), it's all back
const again = mapFromData(JSON.parse(mapDataToText(saved)));
assert.strictEqual(again.drops.length, 1, 'the sword is back');
assert.strictEqual(again.objects[0].inventory.slots[1].type.name, 'potion', 'the potion is back');

// one line each in the file, and maps without them don't get the list
assert(mapDataToText(saved).includes('{ "type": "chest", "col": 0, "row": 0, "items": [null, "potion", "gone"], "id": "chest1" }'), 'a chest is one line');
const bare = JSON.parse(mapDataToText(mapToData(mapFromData({ ...file, objects: [{ type: 'chest', col: 0, row: 0 }], items: undefined }))));
assert(!('items' in bare) && !('items' in bare.objects[0]), 'no items, no lists');

// a file without ids, or with one twice, gets new ones, and says how many
const old = mapFromData({ ...file, objects: [{ type: 'chest', col: 0, row: 0 }], items: [{ type: 'sword', col: 0, row: 1, id: 'same' }, { type: 'sword', col: 1, row: 1, id: 'same' }] });
const ids = [old.objects[0].id, ...old.items.map((entry) => entry.id)];
assert(ids.every((id) => typeof id === 'string' && id !== ''), 'everything has an id');
assert.strictEqual(new Set(ids).size, 3, 'no two the same');
assert.strictEqual(old.items[0].id, 'same', 'the first with an id keeps it');
assert.strictEqual(old.idsMade, 2, 'the chest and the second sword were given one');
// pasting: one nothing has any more (cut and paste) keeps its id, a copy of one still there doesn't
assert.strictEqual(map.takeId('elsewhere'), 'elsewhere');
assert.notStrictEqual(map.takeId('sword1'), 'sword1');
assert.notStrictEqual(map.addItem('sword', 0, 1, 'chest1').id, 'chest1', 'ids are unique across objects and items');
// resizing cuts off placed items and their drops, like everything else
const cut = mapFromData(file);
cut.resize(0, 0, 2, 2);
same(cut.items.map((entry) => entry.id), ['gone01'], 'the sword off the edge is gone');
assert.strictEqual(cut.drops.length, 0, 'and so is its drop');
