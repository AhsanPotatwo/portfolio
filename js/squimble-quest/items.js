// the item catalogue: things you carry in an inventory (inventory.js). items and their weapons
// (weapons.js) live in assets/squimble-quest/items/items.json. this file loads that into ITEM_TYPES
// and WEAPONS, and can turn them back into a file, the same way tiles.js does with tiles.json.
//
// an item isn't part of whoever's carrying it. createItem() makes one, and then it can move between
// slots, the ground and other inventories. holding an item that has a weapon lets you attack, and
// empty hands can't.
//
// ============================== how to make an item ==============================
//
// in the map editor (dev mode, then B), right click an item in the Weapons or Items tab (or press
// Edit) to change its name, rarity, colour and weapon numbers. the changes show straight away, and
// Export downloads items.json to put in assets/squimble-quest/items/.
//
// a new item is a line in the "items" part of items.json, with only the settings that are different
// from ITEM_DEFAULTS:
//   { "name": "axe", "label": "Axe", "category": "weapon", "weapon": "axe", "rarity": "rare", "colour": "#b0773a" }
//
//   name      what the code calls it (like in PLAYER.startingItems in config.js). renaming it breaks
//             anything that uses the old name
//   label     the name the player sees
//   category  an ITEM_CATEGORIES key, which decides its editor palette tab
//   weapon    a name from "weapons" if holding it lets you attack, otherwise null
//   rarity    a RARITIES key, which decides its glow (itemglow.js)
//   colour    placeholder colour in the hotbar
//   image     like "assets/squimble-quest/items/axe.png"
//
// new settings (like heal or stackable) need a default in ITEM_DEFAULTS, which is also what makes
// them get saved
//
// ====================================================================================

// path from the root of the site
const ITEM_FILE = 'assets/squimble-quest/items/items.json';

// goes at the top of items.json, same as tiles.json's (tiles.js)
const ITEMS_FORMAT = 'squimble-quest-items';
const ITEMS_VERSION = 1;

// each category and the name of its tab in the editor palette (editor.js). a new line here makes a
// new tab
const ITEM_CATEGORIES = {
  weapon: 'Weapons',
  item: 'Items',
};

// from least to most rare, with how they glow (colour, sparkles and image, see itemglow.js). these are
// placeholders so change them however you like, just keep ITEM_DEFAULTS.rarity in the list
const RARITIES = {
  primitive: { label: 'Primitive', colour: '#9c8b78', sparkles: 0, image: null },
  common:    { label: 'Common',    colour: '#e8e8e8', sparkles: 1, image: null },
  uncommon:  { label: 'Uncommon',  colour: '#5ed15e', sparkles: 1, image: null },
  rare:      { label: 'Rare',      colour: '#4aa3ff', sparkles: 2, image: null },
  legendary: { label: 'Legendary', colour: '#ffa726', sparkles: 3, image: null },
  mythical:  { label: 'Mythical',  colour: '#ff4fd8', sparkles: 4, image: null },
};
// gives each one a name for prepareArt()'s warnings (preload() in sketch.js loads the glow pictures)
for (const [name, rarity] of Object.entries(RARITIES)) rarity.name = name;

const ITEM_DEFAULTS = {
  label: '?',
  category: 'item',
  weapon: null,
  rarity: 'common',
  colour: '#ff00ff',
  image: null,
};

// filled in from items.json (loadItemFile())
const ITEM_TYPES = {};

// the same items split up by category, like ITEMS_BY_CATEGORY.weapon.sword. the editor's tabs show these
const ITEMS_BY_CATEGORY = Object.fromEntries(Object.keys(ITEM_CATEGORIES).map((category) => [category, {}]));

// defineType() is in utils.js. a category or rarity that doesn't exist goes back to the default, so a
// typo in items.json can't break the game
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

// the item's entry in RARITIES
function itemRarity(item) {
  return RARITIES[item.type.rarity];
}

// makes one item for an inventory. each one is its own object, so later on it could keep its own
// state (wear, arrows left) without changing every other sword
function createItem(name) {
  if (!ITEM_TYPES[name]) {
    console.warn(`There's no item called "${name}", add it in ${ITEM_FILE}`);
    return null;
  }
  return { type: ITEM_TYPES[name] };
}

// ---------- items.json ----------

// loads the weapons and then the items (since items use weapons). runs once at the start (sketch.js).
// the promise finishes when it's done or failed. problems are just console warnings and never stop
// the game
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

// the text of items.json: weapons then items, one per line, only the settings that aren't default
// (using the helpers in utils.js)
function itemsToText() {
  const lines = (types, defaults) => Object.values(types).map((type) => jsonLine(typeToData(type, defaults))).join(',\n');
  return `{\n  "format": "${ITEMS_FORMAT}",\n  "version": ${ITEMS_VERSION},\n` +
    `  "weapons": [\n${lines(WEAPONS, WEAPON_DEFAULTS)}\n  ],\n` +
    `  "items": [\n${lines(ITEM_TYPES, ITEM_DEFAULTS)}\n  ]\n}\n`;
}
