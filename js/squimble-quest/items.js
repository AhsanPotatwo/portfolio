// the item catalogue: every kind of thing that can be carried in an inventory (inventory.js).
//
// the items, and the weapons they swing (weapons.js), are in one file,
// assets/squimble-quest/items/items.json, loaded when the game starts. this file loads it, keeps the
// items in ITEM_TYPES (and the weapons in WEAPONS), and turns them all back into a file. it works
// like tiles.json does for tiles (tiles.js).
//
// an item isn't part of whoever's carrying it. createItem() makes one, it goes in an inventory
// slot, and it can be taken back out again, so it can be passed around, dropped, picked up...
// holding an item with a weapon lets you attack with that weapon. holding nothing, you can't attack.
//
// ============================== how to make an item ==============================
//
// in the map editor (dev mode, then B), right click an item in the Weapons or Items tab (or pick it
// and click Edit) to change its name, rarity, colour and its weapon's numbers. changes show straight
// away, then Export in the inspector downloads a new items.json: put it in assets/squimble-quest/items/
// (replacing the old one) and the changes are in the game for good.
//
// to add a new item, add a line to the "items" list in items.json. each only needs the settings that
// are different from ITEM_DEFAULTS below:
//
//   { "name": "axe", "label": "Axe", "category": "weapon", "weapon": "axe", "rarity": "rare", "colour": "#b0773a" }
//
//   name      what everything else calls it (PLAYER.startingItems in config.js). renaming it loses it
//             from anywhere that uses the old name
//   label     its name as the player sees it
//   category  a name from ITEM_CATEGORIES below. sorts it into a tab of the map editor's palette
//   weapon    a name from the "weapons" list, if holding it lets you attack. null if it doesn't
//   rarity    a name from RARITIES below. colours its glow on the ground and in the inventory
//   colour    placeholder colour for its hotbar picture, until there's art
//   image     a picture for it, e.g. "image": "assets/squimble-quest/items/axe.png"
//
// later items could have other settings, e.g. heal for a potion, or stackable for arrows. a new
// setting needs its normal value adding to ITEM_DEFAULTS, which is also what saves it into items.json
//
// ====================================================================================

// the items file, from the site's main folder
const ITEM_FILE = 'assets/squimble-quest/items/items.json';

// written at the top of items.json, like tiles.json's (tiles.js)
const ITEMS_FORMAT = 'squimble-quest-items';
const ITEMS_VERSION = 1;

// every category of item, and the name of its tab in the map editor's palette (editor.js). a new
// category is a new line here, and its tab shows up by itself
const ITEM_CATEGORIES = {
  weapon: 'Weapons',
  item: 'Items',
};

// how rare an item is, from least to most, and the colour it glows. placeholders: add, remove,
// rename or recolour them freely, as long as ITEM_DEFAULTS.rarity is still one of them
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

// every item, by name. filled in from items.json by defineItem() (loadItemFile() below)
const ITEM_TYPES = {};

// the same items split up by category, e.g. ITEMS_BY_CATEGORY.weapon.sword. the map editor's tabs
// show these (editor.js)
const ITEMS_BY_CATEGORY = Object.fromEntries(Object.keys(ITEM_CATEGORIES).map((category) => [category, {}]));

// defineType() is in utils.js. a category or rarity that doesn't exist goes back to the default, so
// a typo in items.json can't break the game
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

// an item's rarity, from RARITIES: { label, colour }
function itemRarity(item) {
  return RARITIES[item.type.rarity];
}

// makes one of an item, ready to go in an inventory. each one is its own separate thing, so later
// it could keep its own details (how worn a sword is, how many arrows are left) without changing
// every other sword
function createItem(name) {
  if (!ITEM_TYPES[name]) {
    console.warn(`There's no item called "${name}", add it in ${ITEM_FILE}`);
    return null;
  }
  return { type: ITEM_TYPES[name] };
}

// ---------- items.json ----------

// loads every weapon and item from ITEM_FILE, weapons first since items use them. run once when the
// game starts (sketch.js). gives back a promise that finishes when it's loaded or failed.
// like the tiles file, a problem never stops the game: it's a warning in the browser console
function loadItemFile() {
  // fetchJson() is in utils.js
  return fetchJson(ITEM_FILE)
    .then((data) => {
      if (!Array.isArray(data?.weapons) || !Array.isArray(data?.items)) throw new Error("it doesn't look like a Squimble Quest items file");
      for (const [list, define] of [[data.weapons, defineWeapon], [data.items, defineItem]]) {
        for (const { name, ...settings } of list) {
          if (typeof name === 'string' && name !== '') define(name, settings);
          else console.warn(`Something in ${ITEM_FILE} has no name, so it's been left out`);
        }
      }
      // their colours and pictures (utils.js)
      prepareArt(ITEM_TYPES, 'item');
    })
    .catch((err) => {
      console.warn(`Couldn't load the items file "${ITEM_FILE}": ${err.message}.`);
    });
}

// the text that goes in items.json: every weapon then every item, one per line, each with only the
// settings that are different from the defaults (typeToData() and jsonLine() are in utils.js)
function itemsToText() {
  const lines = (types, defaults) => Object.values(types).map((type) => jsonLine(typeToData(type, defaults))).join(',\n');
  return `{\n  "format": "${ITEMS_FORMAT}",\n  "version": ${ITEMS_VERSION},\n` +
    `  "weapons": [\n${lines(WEAPONS, WEAPON_DEFAULTS)}\n  ],\n` +
    `  "items": [\n${lines(ITEM_TYPES, ITEM_DEFAULTS)}\n  ]\n}\n`;
}
