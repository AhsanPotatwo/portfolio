// inventories, and the hotbar that shows the player's.
//
// an inventory is a row of slots. each slot holds one item (items.js) or nothing, and one slot is
// picked. whatever's in the picked slot is what's being held: a sword lets you swing a sword,
// nothing means empty hands.
//
// the player has one (player.inventory), and the hotbar along the bottom of the screen shows it:
//   1 - 5        pick a slot
//   mouse wheel  step through the slots (in the map editor the wheel zooms instead)
//   click        pick a slot

// how many slots the player's hotbar has
const HOTBAR_SIZE = 5;

// how far the mouse wheel has to turn to move one slot. a normal wheel's notch is about 100,
// trackpads send lots of small amounts, so this stops them racing through the slots
const HOTBAR_SCROLL_STEP = 60;

// layout of the hotbar, in screen pixels: each slot's size, the gap between them, and how far
// the bottom of the slots is from the bottom of the screen
const HOTBAR_LAYOUT = {
  slotSize: 44,
  gap: 6,
  bottom: 10,
};

class Inventory {
  constructor(size) {
    // each slot is an item, or null for empty
    this.slots = new Array(size).fill(null);
    // which slot is picked
    this.selected = 0;
  }

  get size() {
    return this.slots.length;
  }

  // the item in the picked slot, or null for empty hands
  held() {
    return this.slots[this.selected];
  }

  select(slot) {
    if (slot >= 0 && slot < this.size) this.selected = slot;
  }

  // picks the next slot (step 1) or the one before (step -1), going round from the end to the start
  cycle(step) {
    this.selected = (this.selected + step + this.size) % this.size;
  }

  // puts an item in the first empty slot. gives back true if there was room
  add(item) {
    const slot = this.slots.indexOf(null);
    if (!item || slot === -1) return false;
    this.slots[slot] = item;
    return true;
  }

  // takes the item out of a slot and gives it back (null if it was empty). for dropping it,
  // giving it away, putting it in a chest...
  take(slot) {
    const item = this.slots[slot];
    this.slots[slot] = null;
    return item;
  }
}

// ---------- the hotbar ----------

const Hotbar = {
  inventory: null,
  // how far the wheel's turned towards the next slot (see HOTBAR_SCROLL_STEP)
  scrolled: 0,

  // call once from setup() with the player's inventory. makes the slots (ui elements, so clicking
  // them picks a slot and never swings a weapon)
  init(inventory) {
    this.inventory = inventory;
    // the game uses the mouse wheel now, so while you're playing it stops scrolling the page
    Input.captureWheel = true;

    // the slots in a row, centred along the bottom of the screen
    const { slotSize: size, gap, bottom } = HOTBAR_LAYOUT;
    const width = inventory.size * size + (inventory.size - 1) * gap;
    const left = (GAME_W - width) / 2;
    const top = GAME_H - size - bottom;

    for (let i = 0; i < inventory.size; i++) {
      UI.add(new HotbarSlot({
        x: left + i * (size + gap), y: top, w: size, h: size,
        group: 'hotbar',
        inventory,
        slot: i,
        onClick: () => inventory.select(i),
      }));
    }
  },

  // run every frame while playing. reads the number keys and the mouse wheel
  update() {
    for (let i = 0; i < this.inventory.size; i++) {
      if (Input.wasPressed(`slot${i + 1}`)) this.inventory.select(i);
    }

    // wheel down (positive) goes to the next slot, up goes back.
    // turning the other way starts the count again
    if (Input.wheel !== 0 && Math.sign(Input.wheel) !== Math.sign(this.scrolled)) this.scrolled = 0;
    this.scrolled += Input.wheel;
    // one slot at a time. whatever's left over is dropped, otherwise it would carry over and
    // the next notch would sometimes jump two slots
    if (Math.abs(this.scrolled) >= HOTBAR_SCROLL_STEP) {
      this.inventory.cycle(Math.sign(this.scrolled));
      this.scrolled = 0;
    }
  },

  show(visible) {
    UI.showGroup('hotbar', visible);
  },

  // what's being held, written above the hotbar. uses screen positions
  drawLabel() {
    const item = this.inventory.held();
    fill(255);
    setText(14, BOLD, CENTER, BOTTOM);
    // a dark edge round the letters so it shows up on any ground
    stroke(0, 0, 0, 170);
    strokeWeight(3);
    // just above the slots
    text(item ? item.type.label : 'Empty hands', GAME_W / 2, GAME_H - HOTBAR_LAYOUT.slotSize - 16);
  },
};

// one slot on the hotbar. a Button, so clicking works the same, but it draws the slot and its item
class HotbarSlot extends Button {
  constructor(options) {
    super(options);
    this.inventory = options.inventory;
    this.slot = options.slot;
  }

  draw() {
    const selected = this.inventory.selected === this.slot;
    const item = this.inventory.slots[this.slot];

    // the slot
    fill(20, 22, 28, 200);
    stroke(selected ? '#ffd23f' : this.hovered ? 255 : 90);
    strokeWeight(selected ? 3 : 1.5);
    rect(this.x, this.y, this.w, this.h, 6);

    // the item in it: its picture, or a placeholder of its colour and the first letter of its name
    if (item) {
      const pad = 8;
      if (item.type.img) {
        image(item.type.img, this.x + pad, this.y + pad, this.w - pad * 2, this.h - pad * 2);
      } else {
        noStroke();
        fill(item.type.fill);
        rect(this.x + pad, this.y + pad, this.w - pad * 2, this.h - pad * 2, 4);
        fill(20);
        setText(16);
        text(item.type.label[0], this.x + this.w / 2, this.y + this.h / 2 + 1);
      }
    }

    // its number, top left
    noStroke();
    fill(selected ? '#ffd23f' : 200);
    setText(10, BOLD, LEFT, TOP);
    text(this.slot + 1, this.x + 4, this.y + 2);
  }
}
