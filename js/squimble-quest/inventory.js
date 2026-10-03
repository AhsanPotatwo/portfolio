// inventories, the hotbar, the inventory screen, and items on the ground.
//
// an inventory is a row of slots, each one item (items.js) or empty, with one picked: its item is
// what's held (empty is empty hands). the player's (player.inventory) first HOTBAR_SIZE slots are the
// hotbar (the only pickable ones); the rest are the bag, seen only on the inventory screen:
//   1 - 5        pick a slot
//   mouse wheel  step through slots (zooms in the editor instead)
//   click        pick a slot
//   E or I       toggle the inventory screen (E talks instead with an npc in reach). drag between
//                slots to move, out of the box to drop
//   Q            drop the held item. walk away and back to pick it up

// hotbar slots, the inventory's first ones
const HOTBAR_SIZE = 5;
// extra bag slots, inventory screen only. a multiple of HOTBAR_SIZE so rows line up with the hotbar
const BAG_SIZE = 10;

// wheel amount per slot. a notch is ~100; stops trackpads' many small amounts racing through
const HOTBAR_SCROLL_STEP = 60;

// screen px: slot size, gap, and slot bottoms' distance from the screen bottom
const HOTBAR_LAYOUT = {
  slotSize: 44,
  gap: 6,
  bottom: 10,
};

class Inventory {
  constructor(size) {
    // item or null each
    this.slots = new Array(size).fill(null);
    // picked slot
    this.selected = 0;
  }

  get size() {
    return this.slots.length;
  }

  // picked slot's item, or null
  held() {
    return this.slots[this.selected];
  }

  select(slot) {
    if (slot >= 0 && slot < this.size) this.selected = slot;
  }

  // step ±1 through the first count slots (the hotbar), wrapping
  cycle(step, count = this.size) {
    this.selected = (this.selected + step + count) % count;
  }

  // into the first empty slot; true if there was room
  add(item) {
    const slot = this.slots.indexOf(null);
    if (!item || slot === -1) return false;
    this.slots[slot] = item;
    return true;
  }

  // empties a slot, returning its item (or null). for dropping, giving, chests...
  take(slot) {
    const item = this.slots[slot];
    this.slots[slot] = null;
    return item;
  }

  // also moves into an empty slot
  swap(a, b) {
    [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]];
  }
}

// an item's picture, or a placeholder in its colour with its label's first letter. size px square,
// top left at x, y. for dragging; slots and the ground add its glow (drawGlowingItem() in itemglow.js)
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
  // wheel turned towards the next slot (HOTBAR_SCROLL_STEP)
  scrolled: 0,

  // once from setup() with the player's inventory. slots are ui elements, so clicking them never swings
  init(inventory) {
    this.inventory = inventory;
    // the game uses the wheel, so it stops scrolling the page while playing
    Input.captureWheel = true;

    // a centred row along the bottom
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

  // every frame while playing: number keys and wheel
  update() {
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (Input.wasPressed(`slot${i + 1}`)) this.inventory.select(i);
    }

    // down is next, up back; reversing restarts the count
    if (Input.wheel !== 0 && Math.sign(Input.wheel) !== Math.sign(this.scrolled)) this.scrolled = 0;
    this.scrolled += Input.wheel;
    // one slot at a time, leftover dropped (carrying it over sometimes skipped two)
    if (Math.abs(this.scrolled) >= HOTBAR_SCROLL_STEP) {
      this.inventory.cycle(Math.sign(this.scrolled), HOTBAR_SIZE);
      this.scrolled = 0;
    }
  },

  show(visible) {
    UI.showGroup('hotbar', visible);
  },

  // held item's name above the hotbar, screen positions
  drawLabel() {
    const item = this.inventory.held();
    fill(255);
    setText(14, BOLD, CENTER, BOTTOM);
    // dark outline, readable on any ground
    stroke(0, 0, 0, 170);
    strokeWeight(3);
    // rarity colour (items.js)
    if (item) fill(itemRarity(item).colour);
    text(item ? item.type.label : 'Empty hands', GAME_W / 2, GAME_H - HOTBAR_LAYOUT.slotSize - 16);
  },
};

// a slot on the hotbar or inventory screen. a Button for click handling, drawing the slot and its
// item. hotbar slots show their number, and a ring when picked
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

    fill(20, 22, 28, 200);
    stroke(selected ? '#ffd23f' : this.hovered ? 255 : 90);
    strokeWeight(selected ? 3 : 1.5);
    rect(this.x, this.y, this.w, this.h, 6);

    // faded while being dragged
    if (item) {
      const pad = 8;
      push();
      if (InventoryScreen.dragging === this.slot) drawingContext.globalAlpha *= 0.3;
      drawGlowingItem(item, this.x + this.w / 2, this.y + this.h / 2, this.w - pad * 2, this.w / 2);
      pop();
    }

    // number, top left
    if (!onHotbar) return;
    noStroke();
    fill(selected ? '#ffd23f' : 200);
    setText(10, BOLD, LEFT, TOP);
    text(this.slot + 1, this.x + 4, this.y + 2);
  }
}

// ---------- the inventory screen ----------

// screen px (slots use HOTBAR_LAYOUT): edge padding, title above the bag, label above the hotbar row,
// hint along the bottom
const INVENTORY_LAYOUT = {
  pad: 16,
  titleHeight: 40,
  labelHeight: 24,
  hintHeight: 28,
};

// the panel behind the screen's slots. a ui element, so clicks on it never reach the game
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

    // above the hotbar row (the bottom row)
    fill(200);
    setText(11, BOLD, LEFT, BOTTOM);
    text('Hotbar', this.x + pad, this.y + this.h - hintHeight - HOTBAR_LAYOUT.slotSize - 4);

    fill(150);
    setText(11, NORMAL);
    text('Drag to move items, or outside to drop', this.x + this.w / 2, this.y + this.h - hintHeight / 2);
  }
}

// E or I: every slot, bag above, hotbar below. the game carries on, but the player stands still (sketch.js)
const InventoryScreen = {
  active: false,
  inventory: null,
  // slot being dragged, or null
  dragging: null,

  // once from setup() with the player's inventory. makes the hidden panel and slots
  init(inventory) {
    this.inventory = inventory;
    const { slotSize: size, gap } = HOTBAR_LAYOUT;
    const { pad, titleHeight, labelHeight, hintHeight } = INVENTORY_LAYOUT;
    const bagRows = Math.ceil(BAG_SIZE / HOTBAR_SIZE);

    const w = HOTBAR_SIZE * size + (HOTBAR_SIZE - 1) * gap + pad * 2;
    const h = titleHeight + bagRows * (size + gap) - gap + labelHeight + size + hintHeight;
    const left = (GAME_W - w) / 2;
    const top = (GAME_H - h) / 2;
    // first, so slots draw over it
    UI.add(new InventoryPanel({ x: left, y: top, w, h, group: 'inventory', visible: false }));

    // bag rows left to right, hotbar along the bottom
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
        // hotbar slots pick on click, like the real hotbar
        onClick: onHotbar ? () => inventory.select(i) : null,
      }));
    }
  },

  // the real hotbar hides while open, since its row is in the box
  show(open) {
    this.active = open;
    this.dragging = null;
    UI.showGroup('inventory', open);
    Hotbar.show(!open);
  },

  // every frame while open, after UI.update() (ui.js) finds the hovered element. map and player are
  // for dropping out of the box
  update(map, player) {
    const hovered = UI.hovered instanceof ItemSlot && UI.hovered.group === 'inventory' ? UI.hovered.slot : null;

    // press on an item to drag it
    if (Input.buttonsPressed.has('left') && hovered !== null && this.inventory.slots[hovered]) {
      this.dragging = hovered;
    }

    // release: on a slot swaps; outside the box but over the game drops; elsewhere returns it
    if (this.dragging !== null && Input.buttonsReleased.has('left')) {
      if (hovered !== null) {
        this.inventory.swap(this.dragging, hovered);
      } else if (UI.hovered === null && Input.mouse.inside) {
        Drops.drop(map, player, this.dragging);
      }
      this.dragging = null;
    }
    // e.g. focus lost mid-drag (release unseen), or Q dropped it
    if (!Input.buttonsHeld.has('left') || !this.inventory.slots[this.dragging]) this.dragging = null;
  },

  // dragged item under the mouse, after UI.draw() so it's on top
  drawDragged() {
    if (this.dragging === null) return;
    const size = 28;
    drawItemIcon(this.inventory.slots[this.dragging], Input.mouse.x - size / 2, Input.mouse.y - size / 2, size);
  },
};

// ---------- items on the ground ----------

// px from the feet' middle to pick up
const PICKUP_RANGE = 28;
// px a drop is thrown from the feet' middle towards the aim; clears the body when thrown upwards
const DROP_DISTANCE = 48;
// randomness so drops from one spot don't stack: up to angle degrees either side of the aim, and
// up to distance px short of DROP_DISTANCE
const DROP_SPREAD = {
  angle: 35,
  distance: 20,
};
// px a drop tries to land from other drops, about an item's width
const DROP_GAP = 20;
// seconds in the air
const THROW_TIME = 0.4;
// px a throw arcs above the straight line from the player's middle to the ground
const THROW_HEIGHT = 24;

// items on the ground, per map in map.drops (tilemap.js), until reload. progress like map.characters,
// so Export doesn't save them, even editor-placed ones (Drops.place()).
// each { item, x, y, ready, from, flight }: x, y where it sits or will land. ready is false until the
// player's been out of PICKUP_RANGE, so drops aren't picked straight back up and "inventory full"
// shows once per approach, not every frame. from: throw start under the player and its height.
// flight: 0 to 1 in the air (THROW_TIME); can't be picked up until landed
const Drops = {
  // takes the slot's item and throws it roughly towards the aim. tries a few random spots, keeping
  // the first DROP_GAP clear of other drops (or the clearest if crowded)
  drop(map, player, slot) {
    const item = player.inventory.take(slot);
    if (!item) return;
    let best = null;
    for (let i = 0; i < 10; i++) {
      const spot = this.throwSpot(map, player);
      // Infinity with nothing else on the ground
      spot.gap = Math.min(Infinity, ...map.drops.map((drop) => Math.hypot(drop.x - spot.x, drop.y - spot.y)));
      if (!best || spot.gap > best.gap) best = spot;
      if (best.gap >= DROP_GAP) break;
    }
    const feet = player.feetBox();
    map.drops.push({
      item, x: best.x, y: best.y, ready: false,
      from: { x: feet.x + feet.w / 2, y: feet.y + feet.h / 2, height: feetBelowCentre(player.settings) },
      flight: 0,
    });
  },

  // straight onto the ground, landed and ready. for the editor
  place(map, item, x, y) {
    map.drops.push({ item, x, y, ready: true, from: null, flight: 1 });
  },

  // random spot ~DROP_DISTANCE from the feet towards the aim (DROP_SPREAD)
  throwSpot(map, player) {
    const angle = player.aimAngle + radians(randomBetween(-DROP_SPREAD.angle, DROP_SPREAD.angle));
    const distance = DROP_DISTANCE - randomBetween(0, DROP_SPREAD.distance);
    // a small box moved with map collision (tilemap.js), so it stops at walls and stays reachable.
    // two halves, since the map only checks one tile ahead
    const feet = player.feetBox();
    const box = { x: feet.x + feet.w / 2 - 4, y: feet.y + feet.h / 2 - 4, w: 8, h: 8 };
    for (let i = 0; i < 2; i++) {
      box.x += map.moveAlongX(box, Math.cos(angle) * distance / 2);
      box.y += map.moveAlongY(box, Math.sin(angle) * distance / 2);
    }
    return { x: box.x + 4, y: box.y + 4 };
  },

  // current ground x, y (the shadow) and height above it. mid-air it flies from the player's middle
  // to its landing spot, arcing up THROW_HEIGHT
  where(drop) {
    const t = drop.flight;
    if (t >= 1) return { x: drop.x, y: drop.y, height: 0 };
    return {
      x: lerp(drop.from.x, drop.x, t),
      y: lerp(drop.from.y, drop.y, t),
      height: lerp(drop.from.height, 0, t) + 4 * THROW_HEIGHT * t * (1 - t),
    };
  },

  // every frame while playing: moves throws, picks up landed drops in range if there's room
  update(map, player, dt) {
    const feet = player.feetBox();
    const fx = feet.x + feet.w / 2;
    const fy = feet.y + feet.h / 2;
    map.drops = map.drops.filter((drop) => {
      if (drop.flight < 1) {
        drop.flight = Math.min(1, drop.flight + dt / THROW_TIME);
        return true;
      }
      if (Math.hypot(drop.x - fx, drop.y - fy) > PICKUP_RANGE) {
        drop.ready = true;
        return true;
      }
      if (!drop.ready) return true;
      // picked up
      if (player.inventory.add(drop.item)) return false;
      drop.ready = false;
      showMessage(`No room for the ${drop.item.type.label.toLowerCase()}, your inventory is full`);
      return true;
    });
  },

  // one drop over its shadow, glowing in the air too, bobbing once landed. drawn individually so it
  // depth-sorts with characters (sketch.js). world positions (inside camera.begin/end)
  draw(drop) {
    const size = 20;
    const landed = drop.flight >= 1;
    const spot = this.where(drop);
    // + x so neighbours don't bob in step
    const bob = landed ? Math.sin(millis() / 1000 * 3 + drop.x) * 3 : 0;
    const x = Math.round(spot.x);
    const y = Math.round(spot.y - size / 2 - 6 - spot.height + bob);

    noStroke();
    // shadow shrinks as it rises
    fill(0, 0, 0, 70);
    ellipse(x, Math.round(spot.y), Math.max(4, 16 + bob - spot.height / 4), 5);
    // seeded by the landing spot, fixed for the whole throw, so the glow doesn't jump as it moves
    drawGlowingItem(drop.item, x, y, size, GLOW_PIXEL_SIZE, drop.x + drop.y);
  },
};
