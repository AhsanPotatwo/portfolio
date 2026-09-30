// a friendly character in the game. walking, facing and tiles come from Character (character.js),
// what kind of npc it is (name, dialogue, ai...) comes from npcs.js.
// this file only has what's different about npcs: no health bar, and the "press E" prompt.
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
    if (this.canTalk) this.drawPrompt();
  }

  // a little "E" key over its head, so you know you can talk to it
  drawPrompt() {
    const size = 18;
    const x = Math.round(this.x - size / 2);
    const y = Math.round(this.y - this.h / 2) - size - 8;
    stroke(0, 0, 0, 170);
    strokeWeight(2);
    fill(255);
    rect(x, y, size, size, 4);
    noStroke();
    fill(30);
    setText(12);
    text('E', x + size / 2, y + size / 2 + 1);
  }
}
