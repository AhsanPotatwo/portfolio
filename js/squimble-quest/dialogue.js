// talking to npcs: who's in range, and the text box.
// E near an npc opens a box along the bottom with their portrait, name and first line (npcs.js)
// typing out. E (or clicking the box) finishes the line, then goes to the next, closing after the
// last. the world keeps running while it's open; walking out of range ends it.

// px between feet
const TALK_RANGE = 56;

// letters per second
const DIALOGUE_TYPE_SPEED = 45;

// the camera glides in to frame both of you (focusOn() in camera.js)
const DIALOGUE_CAMERA = {
  // multiplier on the current zoom (1.35 is 35% closer)
  zoom: 1.35,
  // glide in/out seconds
  inTime: 0.6,
  outTime: 0.5,
};

// text box layout, screen pixels
const DIALOGUE_BOX = {
  margin: 16,
  height: 130,
  portraitSize: 98,
};

const Dialogue = {
  active: false,
  // who's talking, and their current line index
  npc: null,
  line: 0,
  // letters shown so far (rises in update())
  shown: 0,
  // the DialogueBox ui element (init())
  box: null,
  // the game camera (from open())
  camera: null,

  // once from setup()
  init() {
    const { margin, height } = DIALOGUE_BOX;
    this.box = UI.add(new DialogueBox({
      x: margin,
      y: GAME_H - height - margin,
      w: GAME_W - margin * 2,
      h: height,
      visible: false,
    }));
  },

  // closest npc within TALK_RANGE, or null
  npcInRange(player, npcs) {
    let closest = null;
    let closestDistance = TALK_RANGE;
    for (const npc of npcs) {
      const distance = Math.hypot(npc.x - player.x, (npc.y + npc.h / 2) - (player.y + player.h / 2));
      if (distance <= closestDistance) {
        closest = npc;
        closestDistance = distance;
      }
    }
    return closest;
  },

  open(npc, player, camera) {
    this.active = true;
    this.npc = npc;
    this.line = 0;
    this.shown = 0;
    this.box.visible = true;
    // they face you
    npc.aimAt({ x: player.x, y: player.y });
    // the box sits where the hotbar is (inventory.js)
    Hotbar.show(false);

    // glide to halfway between you
    this.camera = camera;
    camera.focusOn(
      (player.x + npc.x) / 2,
      (player.y + npc.y) / 2,
      camera.targetZoom * DIALOGUE_CAMERA.zoom,
      DIALOGUE_CAMERA.inTime
    );
  },

  close() {
    this.active = false;
    this.npc = null;
    this.box.visible = false;
    Hotbar.show(true);
    // glide back to following you
    if (this.camera) this.camera.release(DIALOGUE_CAMERA.outTime);
  },

  currentLine() {
    return this.npc.type.dialogue[this.line] ?? '';
  },

  // E or click: finish typing, else next line, else close
  advance() {
    const text = this.currentLine();
    if (this.shown < text.length) {
      this.shown = text.length;
      return;
    }
    this.line++;
    this.shown = 0;
    if (this.line >= this.npc.type.dialogue.length) this.close();
  },

  // every frame while open, after everyone's moved. the world doesn't pause, so the conversation ends
  // if either of you leaves talking range (walking off, being pushed, respawning, the npc's ai)
  update(player, dt) {
    if (this.npcInRange(player, [this.npc]) !== this.npc) return this.close();
    this.shown = Math.min(this.currentLine().length, this.shown + DIALOGUE_TYPE_SPEED * dt);
    if (Input.wasPressed('interact')) this.advance();
  },
};

// a ui element, so clicks on it don't reach the game; clicking advances like E
class DialogueBox extends UIElement {
  update(hovered) {
    super.update(hovered);
    if (this.visible && hovered && Input.buttonsPressed.has('left')) Dialogue.advance();
  }

  draw() {
    const npc = Dialogue.npc;
    if (!npc) return;
    const pad = 16;
    const size = DIALOGUE_BOX.portraitSize;

    stroke(255, 255, 255, 60);
    strokeWeight(2);
    fill(20, 22, 28);
    rect(this.x, this.y, this.w, this.h, 10);

    // portrait, or a placeholder face in their colours
    const px = this.x + pad;
    const py = this.y + (this.h - size) / 2;
    if (npc.type.portraitImg) {
      image(npc.type.portraitImg, px, py, size, size);
    } else {
      this.drawPlaceholderPortrait(npc, px, py, size);
    }

    // name and wrapped line beside the portrait
    const textX = px + size + pad;
    const textW = this.x + this.w - textX - pad;
    const line = Dialogue.currentLine();
    noStroke();
    fill(npc.type.colour);
    setText(18, BOLD, LEFT, TOP);
    text(npc.type.label, textX, this.y + pad);

    fill(240);
    setText(17, NORMAL, LEFT, TOP);
    text(line.slice(0, Math.floor(Dialogue.shown)), textX, this.y + pad + 30, textW, this.h - pad * 2 - 30);

    // key hint once the line's finished
    if (Dialogue.shown >= line.length) {
      const last = Dialogue.line >= npc.type.dialogue.length - 1;
      fill(255, 255, 255, 150);
      setText(12, BOLD, RIGHT, BOTTOM);
      text(last ? 'E  close' : 'E  next', this.x + this.w - pad, this.y + this.h - 10);
    }
  }

  // a square in their colour with a simple face, until there's art
  drawPlaceholderPortrait(npc, x, y, size) {
    stroke(npc.type.outline);
    strokeWeight(3);
    fill(npc.type.colour);
    rect(x, y, size, size, 8);

    noStroke();
    fill(npc.type.outline);
    circle(x + size * 0.35, y + size * 0.42, size * 0.1);
    circle(x + size * 0.65, y + size * 0.42, size * 0.1);
    noFill();
    stroke(npc.type.outline);
    strokeWeight(3);
    arc(x + size / 2, y + size * 0.58, size * 0.36, size * 0.2, 0, PI);
  }
}
