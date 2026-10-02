// inventories, the hotbar, the inventory screen, and items lying on the ground.
//
// an inventory is a row of slots. each slot holds one item (items.js) or nothing, and one slot is
// picked. whatever's in the picked slot is what's being held: a sword lets you swing a sword,
// nothing means empty hands.
//
// the player has one (player.inventory). its first HOTBAR_SIZE slots are the hotbar, along the
// bottom of the screen, and only those can be picked. the rest are the bag, only seen on the
// inventory screen:
//   1 - 5        pick a slot
//   mouse wheel  step through the slots (in the map editor the wheel zooms instead)
//   click        pick a slot
//   E or I       open or close the inventory screen (E talks to an npc instead when one's in reach).
//                drag items between slots to move them, or out of the box to drop them
//   Q            drop what you're holding. walk away and back to pick it up again

// how many slots the player's hotbar has. they're the first slots of the inventory
const HOTBAR_SIZE = 5;
// how many more slots the player has on top of the hotbar, only seen on the inventory screen.
// a multiple of HOTBAR_SIZE, so the bag's rows line up with the hotbar under them
const BAG_SIZE = 10;

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

  // picks the next slot (step 1) or the one before (step -1), going round the first count slots
  // (the player's hotbar) from the end to the start
  cycle(step, count = this.size) {
    this.selected = (this.selected + step + count) % count;
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

  // swaps what's in two slots. moving an item into an empty slot is a swap with nothing
  swap(a, b) {
    [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]];
  }
}

// an item's picture, or a placeholder of its colour and the first letter of its name, size pixels
// square with its top left corner at x, y. for slots, the item being dragged, and items on the ground
function drawItemIcon(item, x, y, size) {
  if (item.type.img) {
    image(item.type.img, x, y, size, size);
    return;
  }
  noStroke();
  fill(item.type.fill);
  rect(x, y, size, size, 4);
  fill(20);
  setText(Math.round(size * 0.57));
  text(item.type.label[0], x + size / 2, y + size / 2 + 1);
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
    const width = HOTBAR_SIZE * size + (HOTBAR_SIZE - 1) * gap;
    const left = (GAME_W - width) / 2;
    const top = GAME_H - size - bottom;

    for (let i = 0; i < HOTBAR_SIZE; i++) {
      UI.add(new ItemSlot({
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
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (Input.wasPressed(`slot${i + 1}`)) this.inventory.select(i);
    }

    // wheel down (positive) goes to the next slot, up goes back.
    // turning the other way starts the count again
    if (Input.wheel !== 0 && Math.sign(Input.wheel) !== Math.sign(this.scrolled)) this.scrolled = 0;
    this.scrolled += Input.wheel;
    // one slot at a time. whatever's left over is dropped, otherwise it would carry over and
    // the next notch would sometimes jump two slots
    if (Math.abs(this.scrolled) >= HOTBAR_SCROLL_STEP) {
      this.inventory.cycle(Math.sign(this.scrolled), HOTBAR_SIZE);
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

// one slot of an inventory, on the hotbar or the inventory screen. a Button, so clicking works the
// same, but it draws the slot and its item. hotbar slots show their number, and a ring when picked
class ItemSlot extends Button {
  constructor(options) {
    super(options);
    this.inventory = options.inventory;
    this.slot = options.slot;
  }

  draw() {
    const onHotbar = this.slot < HOTBAR_SIZE;
    const selected = onHotbar && this.inventory.selected === this.slot;
    const item = this.inventory.slots[this.slot];

    // the slot
    fill(20, 22, 28, 200);
    stroke(selected ? '#ffd23f' : this.hovered ? 255 : 90);
    strokeWeight(selected ? 3 : 1.5);
    rect(this.x, this.y, this.w, this.h, 6);

    // the item in it, faded while it's being dragged somewhere else
    if (item) {
      const pad = 8;
      push();
      if (InventoryScreen.dragging === this.slot) drawingContext.globalAlpha *= 0.3;
      drawItemIcon(item, this.x + pad, this.y + pad, this.w - pad * 2);
      pop();
    }

    // its number, top left
    if (!onHotbar) return;
    noStroke();
    fill(selected ? '#ffd23f' : 200);
    setText(10, BOLD, LEFT, TOP);
    text(this.slot + 1, this.x + 4, this.y + 2);
  }
}

// ---------- the inventory screen ----------

// layout of the inventory screen's box, in screen pixels (its slots are HOTBAR_LAYOUT's size):
// the space round the edge, for the title above the bag, for the label above the hotbar row, and
// for the hint along the bottom
const INVENTORY_LAYOUT = {
  pad: 16,
  titleHeight: 40,
  labelHeight: 24,
  hintHeight: 28,
};

// the box behind the inventory screen's slots. a ui element, so clicks on it never reach the game
class InventoryPanel extends UIElement {
  draw() {
    const { pad, titleHeight, hintHeight } = INVENTORY_LAYOUT;
    fill(20, 22, 28, 235);
    stroke(90);
    strokeWeight(1.5);
    rect(this.x, this.y, this.w, this.h, 8);

    noStroke();
    fill(255);
    setText(16);
    text('Inventory', this.x + this.w / 2, this.y + titleHeight / 2 + 2);

    // just above the hotbar row, which is the bottom row of slots
    fill(200);
    setText(11, BOLD, LEFT, BOTTOM);
    text('Hotbar', this.x + pad, this.y + this.h - hintHeight - HOTBAR_LAYOUT.slotSize - 4);

    fill(150);
    setText(11, NORMAL);
    text('Drag to move items, or outside to drop', this.x + this.w / 2, this.y + this.h - hintHeight / 2);
  }
}

// the box that opens with E or I, showing every slot of the player's inventory: the bag on top,
// the hotbar underneath. the game carries on while it's open, but the player stands still (sketch.js)
const InventoryScreen = {
  // true while it's open
  active: false,
  inventory: null,
  // the slot whose item is being dragged, or null
  dragging: null,

  // call once from setup() with the player's inventory. makes the box and its slots, hidden until
  // it opens
  init(inventory) {
    this.inventory = inventory;
    const { slotSize: size, gap } = HOTBAR_LAYOUT;
    const { pad, titleHeight, labelHeight, hintHeight } = INVENTORY_LAYOUT;
    const bagRows = Math.ceil(BAG_SIZE / HOTBAR_SIZE);

    const w = HOTBAR_SIZE * size + (HOTBAR_SIZE - 1) * gap + pad * 2;
    const h = titleHeight + bagRows * (size + gap) - gap + labelHeight + size + hintHeight;
    const left = (GAME_W - w) / 2;
    const top = (GAME_H - h) / 2;
    // first, so the slots are drawn on top of it
    UI.add(new InventoryPanel({ x: left, y: top, w, h, group: 'inventory', visible: false }));

    // the bag fills its rows left to right, and the hotbar goes along the bottom
    const hotbarTop = top + h - hintHeight - size;
    for (let i = 0; i < inventory.size; i++) {
      const onHotbar = i < HOTBAR_SIZE;
      const bagSlot = i - HOTBAR_SIZE;
      const col = onHotbar ? i : bagSlot % HOTBAR_SIZE;
      const y = onHotbar ? hotbarTop : top + titleHeight + Math.floor(bagSlot / HOTBAR_SIZE) * (size + gap);
      UI.add(new ItemSlot({
        x: left + pad + col * (size + gap), y, w: size, h: size,
        group: 'inventory',
        visible: false,
        inventory,
        slot: i,
        // clicking a hotbar slot picks it, like on the real hotbar
        onClick: onHotbar ? () => inventory.select(i) : null,
      }));
    }
  },

  // opens (true) or closes (false) it. the real hotbar hides while it's open, since its row is in the box
  show(open) {
    this.active = open;
    this.dragging = null;
    UI.showGroup('inventory', open);
    Hotbar.show(!open);
  },

  // run every frame while it's open, after UI.update() (ui.js) has worked out what the mouse is
  // over. map and player are for dropping an item dragged out of the box
  update(map, player) {
    const hovered = UI.hovered instanceof ItemSlot && UI.hovered.group === 'inventory' ? UI.hovered.slot : null;

    // pressing on an item picks it up to drag
    if (Input.buttonsPressed.has('left') && hovered !== null && this.inventory.slots[hovered]) {
      this.dragging = hovered;
    }

    // letting go puts it down: on a slot, it swaps with whatever's there. outside the box (but
    // still over the game), it's dropped on the ground. anywhere else, it stays where it was
    if (this.dragging !== null && Input.buttonsReleased.has('left')) {
      if (hovered !== null) {
        this.inventory.swap(this.dragging, hovered);
      } else if (UI.hovered === null && Input.mouse.inside) {
        Drops.drop(map, player, this.dragging);
      }
      this.dragging = null;
    }
    // e.g. clicked away from the game mid-drag, so the release was never seen, or Q dropped it
    if (!Input.buttonsHeld.has('left') || !this.inventory.slots[this.dragging]) this.dragging = null;
  },

  // the item being dragged, under the mouse. run after UI.draw() so it's on top of the slots
  drawDragged() {
    if (this.dragging === null) return;
    const size = 28;
    drawItemIcon(this.inventory.slots[this.dragging], Input.mouse.x - size / 2, Input.mouse.y - size / 2, size);
  },
};

// ---------- items on the ground ----------

// how close the middle of the player's feet has to get to an item on the ground to pick it up, in pixels
const PICKUP_RANGE = 28;
// how far a dropped item is thrown from the middle of the player's feet, the way they're aiming, in
// pixels. far enough to land clear of their body when it's thrown upwards, or it'd be hidden behind them
const DROP_DISTANCE = 48;
// a little randomness in where it lands, so things dropped from the same spot don't pile up on top
// of each other: up to this many degrees either side of where they're aiming, and up to this many
// pixels short of DROP_DISTANCE
const DROP_SPREAD = {
  angle: 35,
  distance: 20,
};
// how far apart, in pixels, a dropped item tries to land from every other item on the ground.
// about an item's width, so they don't cover each other
const DROP_GAP = 20;

// items lying on the ground. each map keeps its own in map.drops (tilemap.js), so they stay where
// they were dropped until the page reloads. like map.characters that's progress, not the map's
// design, so the map editor doesn't show them and Export doesn't save them.
// each is { item, x, y, ready }: x, y is where it sits in the world. ready is false until the player
// has been out of PICKUP_RANGE of it, so what you drop isn't picked straight back up, and a full
// inventory says so once each time you walk up to it, rather than every frame
const Drops = {
  // takes the item out of this slot of the player's inventory and throws it roughly the way they're
  // aiming. random throws can land on top of each other, so it tries a few, and keeps the first that
  // lands DROP_GAP clear of every other item (or the clearest, if it's crowded)
  drop(map, player, slot) {
    const item = player.inventory.take(slot);
    if (!item) return;
    let best = null;
    for (let i = 0; i < 10; i++) {
      const spot = this.throwSpot(map, player);
      // Infinity when there's nothing else on the ground
      spot.gap = Math.min(Infinity, ...map.drops.map((drop) => Math.hypot(drop.x - spot.x, drop.y - spot.y)));
      if (!best || spot.gap > best.gap) best = spot;
      if (best.gap >= DROP_GAP) break;
    }
    map.drops.push({ item, x: best.x, y: best.y, ready: false });
  },

  // a random spot about DROP_DISTANCE from the player's feet, roughly the way they're aiming (DROP_SPREAD)
  throwSpot(map, player) {
    const angle = player.aimAngle + radians(randomBetween(-DROP_SPREAD.angle, DROP_SPREAD.angle));
    const distance = DROP_DISTANCE - randomBetween(0, DROP_SPREAD.distance);
    // a small box from their feet, moved like a character walks (tilemap.js), so it stops at walls
    // and can always be walked to. in two halves, because the map only checks a tile ahead at a time
    const feet = player.feetBox();
    const box = { x: feet.x + feet.w / 2 - 4, y: feet.y + feet.h / 2 - 4, w: 8, h: 8 };
    for (let i = 0; i < 2; i++) {
      box.x += map.moveAlongX(box, Math.cos(angle) * distance / 2);
      box.y += map.moveAlongY(box, Math.sin(angle) * distance / 2);
    }
    return { x: box.x + 4, y: box.y + 4 };
  },

  // run every frame while playing. picks up anything the player is close enough to, if there's room
  update(map, player) {
    const feet = player.feetBox();
    const fx = feet.x + feet.w / 2;
    const fy = feet.y + feet.h / 2;
    map.drops = map.drops.filter((drop) => {
      if (Math.hypot(drop.x - fx, drop.y - fy) > PICKUP_RANGE) {
        drop.ready = true;
        return true;
      }
      if (!drop.ready) return true;
      // picked up, so it's gone from the ground
      if (player.inventory.add(drop.item)) return false;
      drop.ready = false;
      showMessage(`No room for the ${drop.item.type.label.toLowerCase()}, your inventory is full`);
      return true;
    });
  },

  // each item glowing and bobbing up and down above its shadow. uses world positions, so it's drawn
  // between camera.begin() and camera.end()
  draw(map) {
    const size = 20;
    const time = millis() / 1000;
    for (const drop of map.drops) {
      // adding x means items next to each other don't bob in step
      const bob = Math.sin(time * 3 + drop.x) * 3;
      const x = Math.round(drop.x);
      const y = Math.round(drop.y - size / 2 - 6 + bob);

      noStroke();
      // the shadow shrinks as the item floats up
      fill(0, 0, 0, 70);
      ellipse(x, Math.round(drop.y), 16 + bob, 5);
      // the glow, gently pulsing
      const pulse = Math.sin(time * 2 + drop.x) * 3;
      fill(255, 225, 120, 35);
      circle(x, y, size * 2 + pulse);
      fill(255, 225, 120, 55);
      circle(x, y, size * 1.4 + pulse);

      drawItemIcon(drop.item, x - size / 2, y - size / 2, size);
    }
  },
};
