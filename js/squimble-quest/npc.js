// a friendly character. the stuff it shares with everyone else is in Character (character.js), and
// its kind (name, dialogue, ai...) is in npcs.js. this file just skips the health bar and adds the
// "press E" prompt (drawKeyPrompt(), which warps use too). Character's targets() is empty, so an npc
// attacking wouldn't hurt anyone
class Npc extends Character {
  // type: an NPC_TYPES name. col, row: its tile. voice: a voice's name (VOICES in sound.js) to talk
  // with instead of its kind's own (picked by right clicking it in the editor)
  constructor(type, col, row, voice) {
    super(0, 0, NPC_TYPES[type]);
    this.type = NPC_TYPES[type];
    // what it talks with in dialogue.js, or null for silent
    this.voice = voice ?? this.type.voice;
    this.placeFeetOnTile(col, row);
    // whether the player is close enough to talk (sketch.js sets this every frame)
    this.canTalk = false;
  }

  update(dt, world) {
    super.update(this.think(world, dt), dt, world);
  }

  draw() {
    this.drawBody();
    if (this.canTalk) drawKeyPrompt(this.x, this.y - this.h / 2 - 8);
  }
}

// a little "E" key over something you can press E on (an npc, or a warp in warps.js). x is its middle
// and bottom is its bottom edge, in world positions
function drawKeyPrompt(x, bottom) {
  const size = 18;
  const left = Math.round(x - size / 2);
  const top = Math.round(bottom) - size;
  stroke(0, 0, 0, 170);
  strokeWeight(2);
  fill(255);
  rect(left, top, size, size, 4);
  noStroke();
  fill(30);
  setText(12);
  text('E', left + size / 2, top + size / 2 + 1);
}
