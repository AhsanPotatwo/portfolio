// the item catalogue: things you carry in an inventory (inventory.js). each item is a file in
// assets/squimble-quest/items/, like items/axe.json, listed in items/index.json (datafiles.js), with
// its weapon (weapons.js) inside it if it has one. this file loads them into ITEM_TYPES and can turn
// them back into files, the same way tiles.js does.
//
// an item isn't part of whoever's carrying it. createItem() makes one, and then it can move between
// slots, the ground and other inventories. holding an item that has a weapon lets you attack, and
// empty hands can't.
//
// ============================== how to make an item ==============================
//
// in the map editor (dev mode, then B), right click an item in the Weapons or Items tab (or press
// Edit) to change its name, rarity, colour and weapon numbers. the changes show straight away, and
// Export downloads the file of each item that's changed, to put in assets/squimble-quest/items/.
//
// a new item is a file named after it in items/ (copy one that's close), with only the settings that
// are different from ITEM_DEFAULTS, and its name added to items/index.json. items/axe.json is:
//   { "label": "Axe", "category": "weapon", "weapon": { "damage": 35, "reach": 68 }, "rarity": "rare", "colour": "#b0773a" }
//
//   the file's name is what the code calls it (like in PLAYER.startingItems in config.js). renaming
//   it breaks anything that uses the old name
//   label     the name the player sees
//   category  an ITEM_CATEGORIES key, which decides its editor palette tab
//   weapon    its weapon's settings (weapons.js) if holding it lets you attack, otherwise null
//   wear      where it's worn, a WEAR_PLACES key like "feet", or null if it can't be. it fits the
//             inventory screen's slots for that place (EQUIPMENT_SLOTS in inventory.js), shows on
//             whoever wears it, and enemies can be given it in the editor. it doesn't do anything yet
//   rarity    a RARITIES key, which decides its glow (itemglow.js)
//   colour    placeholder colour in the hotbar
//   image     like "assets/squimble-quest/items/axe.png"
//
// new settings (like heal or stackable) need a default in ITEM_DEFAULTS, which is also what makes
// them get saved
//
// ====================================================================================

// each category and the name of its tab in the editor palette (editor.js). a new line here makes a
// new tab
const ITEM_CATEGORIES = {
  weapon: 'Weapons',
  armour: 'Armour',
  item: 'Items',
};

// where things can be worn (an item's wear) and the words for each. the inventory screen has a slot for
// each, and three for accessories (EQUIPMENT_SLOTS in inventory.js). a new place is a line here, its
// slot there, and a band on the body (WORN_BANDS in character.js) or it goes down the side like
// accessories do
const WEAR_PLACES = {
  head: 'Head',
  body: 'Body',
  legs: 'Legs',
  feet: 'Feet',
  accessory: 'Accessory',
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
  wear: null,
  rarity: 'common',
  colour: '#ff00ff',
  image: null,
};

// filled in from the item files (bottom of this file)
const ITEM_TYPES = {};

// the same items split up by category, like ITEMS_BY_CATEGORY.weapon.sword. the editor's tabs show these
const ITEMS_BY_CATEGORY = Object.fromEntries(Object.keys(ITEM_CATEGORIES).map((category) => [category, {}]));

// defineType() is in utils.js. a category or rarity that doesn't exist goes back to the default, so a
// typo in an item's file can't break the game
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
  if (type.wear !== null && !WEAR_PLACES[type.wear]) {
    console.warn(`The item "${name}" has a wear "${type.wear}" that isn't in WEAR_PLACES, so it can't be worn`);
    type.wear = null;
  }
  type.weapon = makeWeapon(type.weapon, `the item "${name}"`); // weapons.js
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
    console.warn(`There's no item called "${name}", add its file to ${DATA_FOLDER}${DATA_KINDS.item}`);
    return null;
  }
  return { type: ITEM_TYPES[name] };
}

// ---------- the item files ----------

// an item's settings for its file: only the ones that aren't normal, including its weapon's
// (typeToData() in utils.js)
function itemToData(type) {
  const data = typeToData(type, ITEM_DEFAULTS);
  if (data.weapon) data.weapon = typeToData(type.weapon, WEAPON_DEFAULTS);
  return data;
}

// every item loads once at the start (datafiles.js)
DataFiles.register('item', {
  define: defineItem,
  // colours and pictures (utils.js)
  loaded: () => prepareArt(ITEM_TYPES, 'item'),
  names: () => Object.keys(ITEM_TYPES),
  toData: (name) => itemToData(ITEM_TYPES[name]),
});
