// talking to npcs: finding one close enough to talk to, and the text box.
//
// walk up to an npc and press E. a box opens along the bottom of the screen with their portrait,
// their name, and the first line of their dialogue (npcs.js) typing itself out.
// E (or clicking the box) shows the whole line straight away, then goes to the next line,
// and closes the box after the last one. while it's open, the game pauses.

// how close the player has to be to talk to an npc, in pixels between their feet
const TALK_RANGE = 56;

// how many letters of a line appear per second
const DIALOGUE_TYPE_SPEED = 45;

// while talking, the camera glides in to frame you and the npc (see focusOn() in camera.js)
const DIALOGUE_CAMERA = {
  // how much closer it gets, compared to the zoom before talking. 1.35 is 35% closer
  zoom: 1.35,
  // how long the glide in and back out take, in seconds
  inTime: 0.6,
  outTime: 0.5,
};

// layout of the text box, in screen pixels
const DIALOGUE_BOX = {
  margin: 16,
  height: 130,
  portraitSize: 98,
};

const Dialogue = {
  // true while the box is open
  active: false,
  // who's talking, and which of their lines is showing
  npc: null,
  line: 0,
  // how many letters of the line have appeared so far (goes up over time, see update())
  shown: 0,
  // the box itself, a ui element (made in init())
  box: null,
  // the game's camera, which glides in while talking (given to open())
  camera: null,

  // call once from setup()
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

  // the npc closest to the player that's in talking range, or null
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

  // start talking to an npc
  open(npc, player, camera) {
    this.active = true;
    this.npc = npc;
    this.line = 0;
    this.shown = 0;
    this.box.visible = true;
    // they turn to look at you
    npc.aimAt({ x: player.x, y: player.y });
    // the box goes where the hotbar is (inventory.js)
    Hotbar.show(false);

    // the camera glides in to the point halfway between you and them
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
    // and glides back out to following you
    if (this.camera) this.camera.release(DIALOGUE_CAMERA.outTime);
  },

  // the line that's showing
  currentLine() {
    return this.npc.type.dialogue[this.line] ?? '';
  },

  // E or a click: finish typing the line if it's still going, otherwise go to the next line,
  // or close the box after the last one
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

  // run every frame while the box is open
  update(dt) {
    this.shown = Math.min(this.currentLine().length, this.shown + DIALOGUE_TYPE_SPEED * dt);
    if (Input.wasPressed('interact')) this.advance();
  },
};

// the text box. a ui element, so clicks on it don't reach the game, and clicking it moves the
// conversation on like E does
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

    // the box
    stroke(255, 255, 255, 60);
    strokeWeight(2);
    fill(20, 22, 28);
    rect(this.x, this.y, this.w, this.h, 10);

    // the portrait: their picture, or a placeholder face in their colours
    const px = this.x + pad;
    const py = this.y + (this.h - size) / 2;
    if (npc.type.portraitImg) {
      image(npc.type.portraitImg, px, py, size, size);
    } else {
      this.drawPlaceholderPortrait(npc, px, py, size);
    }

    // their name and what they're saying, wrapped to fit next to the portrait
    const textX = px + size + pad;
    const textW = this.x + this.w - textX - pad;
    noStroke();
    fill(npc.type.colour);
    textFont('Quicksand');
    textStyle(BOLD);
    textSize(18);
    textAlign(LEFT, TOP);
    text(npc.type.label, textX, this.y + pad);

    fill(240);
    textStyle(NORMAL);
    textSize(17);
    text(Dialogue.currentLine().slice(0, Math.floor(Dialogue.shown)), textX, this.y + pad + 30, textW, this.h - pad * 2 - 30);

    // once the line's finished, a hint for what to press
    if (Dialogue.shown >= Dialogue.currentLine().length) {
      const last = Dialogue.line >= npc.type.dialogue.length - 1;
      fill(255, 255, 255, 150);
      textSize(12);
      textStyle(BOLD);
      textAlign(RIGHT, BOTTOM);
      text(last ? 'E  close' : 'E  next', this.x + this.w - pad, this.y + this.h - 10);
    }
  }

  // a square in their colour with a simple face, until there's portrait art
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
