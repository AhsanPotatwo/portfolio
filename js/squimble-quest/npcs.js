// the npc catalogue: friendly characters and what they say. works like enemies.js. you place them in
// the editor's NPCs tab, and press E to talk to them (dialogue.js).
//
// ============================== how to make an npc ==============================
//
// add a defineNpc() at the bottom, with only the settings that are different from NPC_DEFAULTS:
//   defineNpc('baker', { label: 'Baker', colour: '#e8c07d', dialogue: ['Fresh bread!', 'Want some?'] });
//
//   label                  their name in the text box
//   dialogue               lines shown one after another, E goes to the next one
//   voice                  the voice (VOICES in sound.js, from sounds.json) they say their lines
//                          with, babbling a syllable at a time as the words type out. make one in
//                          the editor's Voices tab. each one on a map can have its own instead: right
//                          click it in the editor, or pick a voice and click it. null is silent
//   width, height          body size in px
//   feetWidth, feetHeight  the bit at the bottom that bumps into walls
//   speed                  px/s, if their ai walks
//   colour, outline        placeholder colours
//   image                  a picture to use instead of the placeholder
//   portrait               the picture in the text box, like 'assets/squimble-quest/npcs/baker.png'.
//                          without one they get a placeholder face
//   ai                     same as an enemy's (enemies.js), null just stands still. something like
//                          wandering around
//
// npcs are Characters (character.js), so walking, walls and facing already work. the player's attacks
// only hit enemies. later on: choices, quests or shops, which would be new settings here that
// dialogue.js deals with
//
// ====================================================================================

const NPC_DEFAULTS = {
  label: '???',
  dialogue: ['...'],
  voice: null,
  width: 28,
  height: 56,
  feetWidth: 24,
  feetHeight: 14,
  speed: 80,
  // Character needs these, even though nothing hurts npcs yet
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
  voice: 'villager-voice',
});
