// talking to npcs: who's close enough, and the text box.
// pressing E near an npc opens a box along the bottom with their portrait, their name, and their first
// line (npcs.js) typing itself out. E (or clicking the box) finishes the line, then goes to the next
// one, and closes after the last. the world keeps going while it's open, and walking away ends it.
// an npc with a voice (its own picked in the editor, or its kind's in npcs.js, a name in VOICES)
// says each line with it as it types (renderSpeech() in sound.js), at that voice's talk speed, and
// finishing a line early cuts the voice off. the voice is looked up by name every line, so changing
// it in the sound editor changes every npc that uses it

// how close in px your feet have to be to theirs
const TALK_RANGE = 56;

// letters per second, for npcs without a voice. ones with a voice type at its Talk speed
const DIALOGUE_TYPE_SPEED = 45;

// the camera glides in so you're both in shot (focusOn() in camera.js)
const DIALOGUE_CAMERA = {
  // multiplies the current zoom (1.35 is 35% closer)
  zoom: 1.35,
  // how many seconds it takes to glide in and out
  inTime: 0.6,
  outTime: 0.5,
};

// text box layout, in screen pixels
const DIALOGUE_BOX = {
  margin: 16,
  height: 130,
  portraitSize: 98,
};

const Dialogue = {
  active: false,
  // who's talking, and which line they're on
  npc: null,
  line: 0,
  // how many letters are showing so far (goes up in update())
  shown: 0,
  // the DialogueBox ui element (made in init())
  box: null,
  // the npc's voice saying the current line (Sound.play()'s), or null
  voice: null,
  // the game camera (passed in to open())
  camera: null,

  // called once from setup()
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

  // the closest npc within TALK_RANGE, or null
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
    this.startLine();
    this.box.visible = true;
    // they turn to face you
    npc.aimAt({ x: player.x, y: player.y });
    // the box goes where the hotbar is (inventory.js)
    Hotbar.show(false);

    // glide to halfway between you both
    this.camera = camera;
    camera.focusOn(
      (player.x + npc.x) / 2,
      (player.y + npc.y) / 2,
      camera.targetZoom * DIALOGUE_CAMERA.zoom,
      DIALOGUE_CAMERA.inTime
    );
  },

  close() {
    Sound.stop(this.voice);
    this.voice = null;
    this.active = false;
    this.npc = null;
    this.box.visible = false;
    Hotbar.show(true);
    // glide back to following you around
    if (this.camera) this.camera.release(DIALOGUE_CAMERA.outTime);
  },

  currentLine() {
    return this.npc.type.dialogue[this.line] ?? '';
  },

  // starts typing out the current line, and the npc's voice saying it (a voice that isn't in VOICES
  // is just silent, like a sound block's missing sound)
  startLine() {
    this.shown = 0;
    Sound.stop(this.voice);
    this.voice = playSound(VOICES[this.npc.voice], null, 'dialogue', { say: this.currentLine() });
  },

  // letters a second: the voice's talk speed, so the words match what it's saying
  typeSpeed() {
    return VOICES[this.npc.voice]?.talkSpeed ?? DIALOGUE_TYPE_SPEED;
  },

  // E or a click: finish typing the line, or go to the next line, or close if that was the last
  advance() {
    const text = this.currentLine();
    if (this.shown < text.length) {
      this.shown = text.length;
      Sound.stop(this.voice);
      return;
    }
    this.line++;
    if (this.line >= this.npc.type.dialogue.length) this.close();
    else this.startLine();
  },

  // every frame while it's open, after everyone has moved. the world doesn't pause, so the conversation
  // ends if either of you gets out of range (walking off, getting pushed, respawning, the npc's ai)
  update(player, dt) {
    if (this.npcInRange(player, [this.npc]) !== this.npc) return this.close();
    this.shown = Math.min(this.currentLine().length, this.shown + this.typeSpeed() * dt);
    if (Input.wasPressed('interact')) this.advance();
  },
};

// it's a ui element so clicks on it don't reach the game. clicking it moves the conversation on like E
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

    // their portrait, or a placeholder face in their colours
    const px = this.x + pad;
    const py = this.y + (this.h - size) / 2;
    if (npc.type.portraitImg) {
      image(npc.type.portraitImg, px, py, size, size);
    } else {
      this.drawPlaceholderPortrait(npc, px, py, size);
    }

    // their name and the line (wrapped) next to the portrait
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

    // a hint about which key to press once the line's finished
    if (Dialogue.shown >= line.length) {
      const last = Dialogue.line >= npc.type.dialogue.length - 1;
      fill(255, 255, 255, 150);
      setText(12, BOLD, RIGHT, BOTTOM);
      text(last ? 'E  close' : 'E  next', this.x + this.w - pad, this.y + this.h - 10);
    }
  }

  // a square in their colour with a simple face, until there's proper art
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
