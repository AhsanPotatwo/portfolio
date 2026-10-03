// a friendly character. shared behaviour is in Character (character.js), its kind (name, dialogue,
// ai...) in npcs.js. here: no health bar, and the "press E" prompt (drawKeyPrompt(), warps use it too).
// Character's targets() is empty, so npc attacks would hurt nobody
class Npc extends Character {
  // type: an NPC_TYPES name. col, row: its tile
  constructor(type, col, row) {
    super(0, 0, NPC_TYPES[type]);
    this.type = NPC_TYPES[type];
    this.placeFeetOnTile(col, row);
    // player close enough to talk (set by sketch.js every frame)
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

// a small "E" key over something you can press E at (an npc, or a warp in warps.js). x is its middle,
// bottom its bottom edge, world positions
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
