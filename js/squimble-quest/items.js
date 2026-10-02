// the item catalogue: every kind of thing that can be carried in an inventory (inventory.js).
// works like objects.js.
//
// an item isn't part of whoever's carrying it. createItem() makes one, it goes in an inventory
// slot, and it can be taken back out again, so it can be passed around, dropped, picked up...
// holding an item with a weapon lets you attack with that weapon. holding nothing, you can't attack.
//
// ============================== how to make an item ==============================
//
// add a defineItem() at the bottom of this file:
//
//   defineItem('axe', { label: 'Axe', category: 'weapon', weapon: 'axe', rarity: 'rare', colour: '#b0773a' });
//
// the settings (anything left out comes from ITEM_DEFAULTS):
//
//   label     its name as the player sees it
//   category  a name from ITEM_CATEGORIES below. sorts it into a tab of the map editor's palette
//   weapon    a name from WEAPONS (weapons.js), if holding it lets you attack. null if it doesn't
//   rarity    a name from RARITIES below. colours its glow on the ground and in the inventory
//   colour    placeholder colour for its hotbar picture, until there's art
//   image     a picture for it, e.g. image: 'assets/squimble-quest/items/axe.png'
//
// the map editor can change these (and its weapon's damage, reach...) while the game's running, and
// place items on the map or give them to the player. the changes go when the page reloads, so copy
// any numbers you want to keep into the defineItem() / defineWeapon() lines
//
// later items could have other settings, e.g. heal for a potion, or stackable for arrows
//
// ====================================================================================

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

// every item, by name. filled in by defineItem() below
const ITEM_TYPES = {};

// defineType() is in utils.js
function defineItem(name, settings) {
  defineType(ITEM_TYPES, ITEM_DEFAULTS, 'item', name, settings);
  const type = ITEM_TYPES[name];
  if (!RARITIES[type.rarity]) {
    console.warn(`The item "${name}" has a rarity "${type.rarity}" that isn't in RARITIES, so it's ${ITEM_DEFAULTS.rarity}`);
    type.rarity = ITEM_DEFAULTS.rarity;
  }
}

// every item in a category, by name, e.g. itemsOfCategory('weapon'). for the map editor's tabs
function itemsOfCategory(category) {
  return Object.fromEntries(Object.entries(ITEM_TYPES).filter(([, type]) => type.category === category));
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
    console.warn(`There's no item called "${name}", add it in items.js`);
    return null;
  }
  return { type: ITEM_TYPES[name] };
}

// ---------- the items ----------

defineItem('sword', { label: 'Sword', category: 'weapon', weapon: 'sword', rarity: 'common', colour: '#c9d1d9' });
defineItem('axe',   { label: 'Axe',   category: 'weapon', weapon: 'axe',   rarity: 'rare',   colour: '#b0773a' });

// does nothing yet. one day it could make the player faster while it's held
defineItem('speedy-shoes', { label: 'Speedy Shoes', rarity: 'uncommon', colour: '#e05a4f' });
