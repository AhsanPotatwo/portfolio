// the item catalogue: things carried in an inventory (inventory.js). items and their weapons
// (weapons.js) live in assets/squimble-quest/items/items.json; this loads it into ITEM_TYPES and
// WEAPONS and turns them back into a file, like tiles.js does for tiles.json.
//
// an item isn't part of its carrier: createItem() makes one, and it moves between slots, the ground,
// other inventories. holding an item with a weapon lets you attack; empty hands can't.
//
// ============================== how to make an item ==============================
//
// in the map editor (dev mode, B), right click an item in the Weapons or Items tab (or Edit) to change
// its name, rarity, colour and weapon numbers. changes show straight away; Export downloads items.json
// to put in assets/squimble-quest/items/.
//
// new item: a line in items.json's "items", only settings that differ from ITEM_DEFAULTS:
//   { "name": "axe", "label": "Axe", "category": "weapon", "weapon": "axe", "rarity": "rare", "colour": "#b0773a" }
//
//   name      what code calls it (PLAYER.startingItems in config.js). renaming breaks old references
//   label     shown to the player
//   category  an ITEM_CATEGORIES key; its editor palette tab
//   weapon    a "weapons" name if holding it attacks, else null
//   rarity    a RARITIES key; its glow colour
//   colour    placeholder hotbar colour
//   image     e.g. "assets/squimble-quest/items/axe.png"
//
// new settings (e.g. heal, stackable) need a default in ITEM_DEFAULTS, which also saves them
//
// ====================================================================================

// path from the site root
const ITEM_FILE = 'assets/squimble-quest/items/items.json';

// top of items.json, like tiles.json's (tiles.js)
const ITEMS_FORMAT = 'squimble-quest-items';
const ITEMS_VERSION = 1;

// category → its editor palette tab name (editor.js). a new line makes a new tab
const ITEM_CATEGORIES = {
  weapon: 'Weapons',
  item: 'Items',
};

// least to most rare, with glow colours. placeholders: change freely, but keep ITEM_DEFAULTS.rarity in it
const RARITIES = {
  primitive: { label: 'Primitive', colour: '#9c8b78' },
  common:    { label: 'Common',    colour: '#e8e8e8' },
  uncommon:  { label: 'Uncommon',  colour: '#5ed15e' },
  rare:      { label: 'Rare',      colour: '#4aa3ff' },
  legendary: { label: 'Legendary', colour: '#ffa726' },
  mythical:  { label: 'Mythical',  colour: '#ff4fd8' },
};

const ITEM_DEFAULTS = {
  label: '?',
  category: 'item',
  weapon: null,
  rarity: 'common',
  colour: '#ff00ff',
  image: null,
};

// filled from items.json (loadItemFile())
const ITEM_TYPES = {};

// the same, by category, e.g. ITEMS_BY_CATEGORY.weapon.sword. the editor's tabs show these
const ITEMS_BY_CATEGORY = Object.fromEntries(Object.keys(ITEM_CATEGORIES).map((category) => [category, {}]));

// defineType() is in utils.js. an unknown category or rarity falls back to the default, so an
// items.json typo can't break the game
function defineItem(name, settings) {
  defineType(ITEM_TYPES, ITEM_DEFAULTS, 'item', name, settings);
  const type = ITEM_TYPES[name];
  if (!RARITIES[type.rarity]) {
    console.warn(`The item "${name}" has a rarity "${type.rarity}" that isn't in RARITIES, so it's ${ITEM_DEFAULTS.rarity}`);
    type.rarity = ITEM_DEFAULTS.rarity;
  }
  if (!ITEM_CATEGORIES[type.category]) {
    console.warn(`The item "${name}" has a category "${type.category}" that isn't in ITEM_CATEGORIES, so it's ${ITEM_DEFAULTS.category}`);
    type.category = ITEM_DEFAULTS.category;
  }
  if (type.weapon && !WEAPONS[type.weapon]) console.warn(`The item "${name}" has a weapon "${type.weapon}" that isn't in ${ITEM_FILE}, so it can't attack`);
  ITEMS_BY_CATEGORY[type.category][name] = type;
}

// { label, colour }
function itemRarity(item) {
  return RARITIES[item.type.rarity];
}

// one item for an inventory. each is separate, so later it could keep its own state (wear, arrows
// left) without changing every other sword
function createItem(name) {
  if (!ITEM_TYPES[name]) {
    console.warn(`There's no item called "${name}", add it in ${ITEM_FILE}`);
    return null;
  }
  return { type: ITEM_TYPES[name] };
}

// ---------- items.json ----------

// loads weapons then items (items use weapons), once at start (sketch.js). promise resolves when done
// or failed. problems are console warnings, never fatal
function loadItemFile() {
  return fetchJson(ITEM_FILE)
    .then((data) => {
      if (!Array.isArray(data?.weapons) || !Array.isArray(data?.items)) throw new Error("it doesn't look like a Squimble Quest items file");
      for (const [list, define] of [[data.weapons, defineWeapon], [data.items, defineItem]]) {
        for (const { name, ...settings } of list) {
          if (typeof name === 'string' && name !== '') define(name, settings);
          else console.warn(`Something in ${ITEM_FILE} has no name, so it's been left out`);
        }
      }
      // colours and pictures (utils.js)
      prepareArt(ITEM_TYPES, 'item');
    })
    .catch((err) => {
      console.warn(`Couldn't load the items file "${ITEM_FILE}": ${err.message}.`);
    });
}

// items.json text: weapons then items, one per line, non-default settings only (utils.js helpers)
function itemsToText() {
  const lines = (types, defaults) => Object.values(types).map((type) => jsonLine(typeToData(type, defaults))).join(',\n');
  return `{\n  "format": "${ITEMS_FORMAT}",\n  "version": ${ITEMS_VERSION},\n` +
    `  "weapons": [\n${lines(WEAPONS, WEAPON_DEFAULTS)}\n  ],\n` +
    `  "items": [\n${lines(ITEM_TYPES, ITEM_DEFAULTS)}\n  ]\n}\n`;
}
