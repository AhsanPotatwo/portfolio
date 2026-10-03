// the npc catalogue: friendly characters and what they say. works like enemies.js. placed in the
// editor's NPCs tab; E to talk (dialogue.js).
//
// ============================== how to make an npc ==============================
//
// add a defineNpc() at the bottom, with only settings that differ from NPC_DEFAULTS:
//   defineNpc('baker', { label: 'Baker', colour: '#e8c07d', dialogue: ['Fresh bread!', 'Want some?'] });
//
//   label                  name in the text box
//   dialogue               lines shown in turn; E moves on
//   width, height          body size in px
//   feetWidth, feetHeight  the part at the bottom that hits walls
//   speed                  px/s, if their ai walks
//   colour, outline        placeholder colours
//   image                  picture instead of the placeholder
//   portrait               text box picture, e.g. 'assets/squimble-quest/npcs/baker.png'; else a placeholder face
//   ai                     like an enemy's (enemies.js), null stands still. e.g. wandering
//
// npcs are Characters (character.js), so walking, walls and facing already work. player attacks only
// hit enemies. later: choices, quests or shops, via new settings here handled in dialogue.js
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
  // Character needs these, though nothing hurts npcs yet
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
