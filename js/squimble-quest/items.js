// the item catalogue: every kind of thing that can be carried in an inventory (inventory.js).
// works like tiles.js and objects.js.
//
// an item isn't part of whoever's carrying it. createItem() makes one, it goes in an inventory
// slot, and it can be taken back out again, so it can be passed around, dropped, picked up...
// holding an item with a weapon lets you attack with that weapon. holding nothing, you can't attack.
//
// ============================== how to make an item ==============================
//
// add a defineItem() at the bottom of this file:
//
//   defineItem('axe', { label: 'Axe', weapon: 'axe', colour: '#b0773a' });
//
// the settings (anything left out comes from ITEM_DEFAULTS):
//
//   label    its name as the player sees it
//   weapon   a name from WEAPONS (weapons.js), if holding it lets you attack. null if it doesn't
//   colour   placeholder colour for its hotbar picture, until there's art
//   image    a picture for it, e.g. image: 'assets/squimble-quest/items/axe.png'
//
// later items could have other settings, e.g. heal for a potion, or stackable for arrows
//
// ====================================================================================

const ITEM_DEFAULTS = {
  label: '?',
  weapon: null,
  colour: '#ff00ff',
  image: null,
};

// every item, by name. filled in by defineItem() below
const ITEM_TYPES = {};

function defineItem(name, settings) {
  ITEM_TYPES[name] = { ...ITEM_DEFAULTS, ...settings, name };
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

defineItem('sword', { label: 'Sword', weapon: 'sword', colour: '#c9d1d9' });
defineItem('axe',   { label: 'Axe',   weapon: 'axe',   colour: '#b0773a' });
