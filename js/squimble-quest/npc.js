// a friendly character in the game. walking, facing and tiles come from Character (character.js),
// what kind of npc it is (name, dialogue, ai...) comes from npcs.js.
// this file only has what's different about npcs: no health bar, and the "press E" prompt
// (drawKeyPrompt(), which doors use too).
// their attacks (if they ever had any) hurt nobody, Character's targets() already gives no one
class Npc extends Character {
  // type: a name from NPC_TYPES. col, row: the tile it stands on
  constructor(type, col, row) {
    super(0, 0, NPC_TYPES[type]);
    this.type = NPC_TYPES[type];
    this.placeFeetOnTile(col, row);
    // true while the player's close enough to talk to it (set by sketch.js every frame)
    this.canTalk = false;
  }

  update(dt, world) {
    // its ai decides what to do, the same way an enemy's does
    super.update(this.think(world, dt), dt, world);
  }

  draw() {
    this.drawBody();
    // a little "E" key over its head, so you know you can talk to it
    if (this.canTalk) drawKeyPrompt(this.x, this.y - this.h / 2 - 8);
  }
}

// a little "E" key, for something you can press E at: an npc to talk to, or a door (doors.js).
// x is its middle and bottom is its bottom edge, in world positions
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
