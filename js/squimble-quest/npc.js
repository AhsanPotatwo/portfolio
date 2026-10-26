// a friendly character. the stuff it shares with everyone else is in Character (character.js), and
// its kind (name, dialogue, ai...) is its file in npcs/ (npcs.js). this file just skips the health bar and adds the
// "press E" prompt (drawKeyPrompt(), which warps use too). Character's targets() is empty, so an npc
// attacking wouldn't hurt anyone
class Npc extends Character {
  // type: an NPC_TYPES name. col, row: its tile. voice: a voice's name (VOICES in sound.js) to talk
  // with instead of its kind's own (picked by right clicking it in the editor). look: what it looks
  // like instead of its kind's (looks.js, also picked in the editor), or undefined for its kind's
  constructor(type, col, row, voice, look) {
    super(0, 0, withLook(NPC_TYPES[type], look));
    this.type = NPC_TYPES[type];
    // what it talks with in dialogue.js, or null for silent
    this.voice = voice ?? this.type.voice;
    // the ai function it uses (ENEMY_AIS in enemies.js), or null. Character's think() runs it
    this.ai = ENEMY_AIS[this.type.ai] ?? null;
    this.placeFeetOnTile(col, row);
    // the id of the spawn it was made from (spawnCharacters() in sketch.js sets it, takeId() in
    // tilemap.js), for a save game
    this.spawnId = null;
  }

  update(dt, world) {
    super.update(this.think(world, dt), dt, world);
  }

  // just the body: no health bar or swing. the E over it when you can talk is drawn with the other
  // prompts (interact.js), so it's never behind someone or under the fog
  draw() {
    this.drawBody();
  }
}

// a little key over something you can press E on (INTERACTABLES, interact.js), showing the interact
// key's letter (it can be changed in the pause menu). x is its middle and bottom is its bottom edge,
// in world positions. UI_ART.keyPrompt (config.js, art.js) is the key, with the letter on top
function drawKeyPrompt(x, bottom) {
  const size = 18;
  const left = Math.round(x - size / 2);
  const top = Math.round(bottom) - size;
  if (!drawArtBox(uiArt('keyPrompt'), left, top, size, size)) {
    stroke(0, 0, 0, 170);
    strokeWeight(2);
    fill(255);
    rect(left, top, size, size, 4);
  }
  noStroke();
  fill(30);
  setText(12);
  text(keyName(KEYS.interact[0]), left + size / 2, top + size / 2 + 1); // debug.js
}
