// the npc catalogue: friendly characters and what they say. each kind is a file in
// assets/squimble-quest/npcs/, like npcs/villager.json, listed in npcs/index.json (datafiles.js).
// works like enemies.js. you place them in the editor's NPCs tab, and press E to talk to them
// (dialogue.js).
//
// ============================== how to make an npc ==============================
//
// make a file named after it in npcs/ (copying one that's close is easiest), with only the settings
// that are different from NPC_DEFAULTS, and add its name to npcs/index.json. npcs/baker.json could be:
//   { "label": "Baker", "dialogue": ["Fresh bread!", "Want some?"], "colour": "#e8c07d" }
//
//   label                  their name in the text box
//   dialogue               lines shown one after another, E goes to the next one
//   voice                  the voice (VOICES in sound.js, from voices/) they say their lines
//                          with, babbling a syllable at a time as the words type out. make one in
//                          the editor's Voices tab. each one on a map can have its own instead: right
//                          click it in the editor, or pick a voice and click it. null is silent
//   sound                  a sound's name (SOUNDS) it loops wherever it goes while you're in range,
//                          like a jingling cart. each spawn can pick its own. null is silent
//   width, height          body size in px
//   feetWidth, feetHeight  the bit at the bottom that bumps into walls
//   speed                  px/s, if their ai walks
//   colour, outline        placeholder colours
//   image                  a picture to use instead of the placeholder
//   portrait               the picture in the text box, like 'assets/squimble-quest/npcs/baker.png'.
//                          without one they get a placeholder face
//   ai                     an ENEMY_AIS name, same as an enemy's (enemies.js). null just stands
//                          still. something like wandering around would be a new one there
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
  sound: null,
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

// filled in from the npc files (bottom of this file)
const NPC_TYPES = {};

// defineType() and checkAi() are in utils.js and enemies.js
function defineNpc(name, settings) {
  defineType(NPC_TYPES, NPC_DEFAULTS, 'npc', name, settings);
  NPC_TYPES[name].ai = checkAi(NPC_TYPES[name].ai, `the npc "${name}"`);
}

// ---------- the npc files ----------

// every kind of npc loads once at the start, before the maps (datafiles.js)
DataFiles.register('npc', {
  define: defineNpc,
  // colours, pictures and portraits (utils.js)
  loaded: () => prepareArt(NPC_TYPES, 'npc'),
});
