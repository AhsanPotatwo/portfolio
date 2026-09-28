// a friendly character in the game. walking, facing and tiles come from Character (character.js),
// what kind of npc it is (name, dialogue, ai...) comes from npcs.js.
// this file only has what's different about npcs: their ai, and the "press E" prompt
class Npc extends Character {
  // type: a name from NPC_TYPES. col, row: the tile it stands on
  constructor(type, col, row) {
    super(0, 0, NPC_TYPES[type]);
    this.type = NPC_TYPES[type];
    this.placeFeetOnTile(col, row);
    // true while the player's close enough to talk to it (set by sketch.js every frame)
    this.canTalk = false;
  }

  // world: { map, player, enemies, npcs }
  update(dt, world) {
    // its ai decides what to do, the same way an enemy's does (STAND_STILL is in enemy.js)
    const controls = this.type.ai ? this.type.ai(this, world, dt) : STAND_STILL;
    super.update(controls, dt, world);
  }

  // an npc's attacks (if it ever had any) hurt nobody
  targets(world) {
    return [];
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
    textFont('Quicksand');
    textStyle(BOLD);
    textSize(12);
    textAlign(CENTER, CENTER);
    text('E', x + size / 2, y + size / 2 + 1);
  }
}
