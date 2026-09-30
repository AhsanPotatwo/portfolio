// the npc catalogue: every kind of friendly character, and what they say. works like enemies.js.
// npcs are placed on maps in the map editor (the NPCs tab), and each one appears where it was
// placed when the map loads. walk up to one and press E to talk (see dialogue.js).
//
// ============================== how to make an npc ==============================
//
// add a defineNpc() at the bottom of this file. you only give the settings that are different
// from NPC_DEFAULTS:
//
//   defineNpc('baker', { label: 'Baker', colour: '#e8c07d', dialogue: ['Fresh bread!', 'Want some?'] });
//
// the settings:
//
//   label                  their name, shown in the text box when you talk to them
//   dialogue               what they say: a list of lines, shown one after another. E moves on
//   width, height          size of their body in pixels
//   feetWidth, feetHeight  the part that bumps into walls, at the bottom of the body
//   speed                  pixels per second, if their ai walks them about
//   colour, outline        placeholder colours, until there's art
//   image                  a picture for them instead of the placeholder
//   portrait               a picture for the text box, e.g. portrait: 'assets/squimble-quest/npcs/baker.png'.
//                          without one, the box draws a placeholder face
//   ai                     what they do, the same as an enemy's ai (see enemies.js). null stands still.
//                          e.g. wandering about, or walking over to the player
//
// npcs are Characters (character.js) like the player and enemies, so they can already walk,
// bump into walls and face things. the player's attacks only hit enemies, so npcs are safe.
// later, dialogue could grow into choices, quests or shops, by giving npcs more settings here
// and teaching dialogue.js what to do with them
//
// ====================================================================================

const NPC_DEFAULTS = {
  label: '???',
  dialogue: ['...'],
  width: 28,
  height: 56,
  feetWidth: 24,
  feetHeight: 14,
  speed: 80,
  // npcs are Characters, which need these, even though nothing hurts npcs yet
  maxHealth: 100,
  weapon: null,
  colour: '#7bd88f',
  outline: '#2f6b3c',
  hurtColour: '#ffffff',
  hurtFlashTime: 0.15,
  image: null,
  portrait: null,
  ai: null,
};

// every npc, by name. filled in by defineNpc() below
const NPC_TYPES = {};

// defineType() is in utils.js
function defineNpc(name, settings) {
  defineType(NPC_TYPES, NPC_DEFAULTS, 'npc', name, settings);
}

// ---------- the npcs ----------

defineNpc('villager', {
  label: 'Villager',
  dialogue: ["It seems like you're on some sort of... squimble quest"],
});
