// inventories, the hotbar, the inventory screen, and items on the ground.
//
// an inventory is a row of slots. each slot has one item (items.js) or is empty, and one slot is
// picked: its item is what you're holding (an empty slot means empty hands). the first HOTBAR_SIZE
// slots of the player's inventory (player.inventory) are the hotbar, which are the only ones you can
// pick. the rest are the bag, which you only see on the inventory screen:
//   1 - 5        pick a slot
//   mouse wheel  go through the slots (in the editor it zooms instead)
//   click        pick a slot
//   E or I       open or close the inventory screen (if there's an npc in reach E talks to them
//                instead). drag between slots to move things, or out of the box to drop them
//   Q            drop the held item. walk away and come back to pick it up again

// how many hotbar slots there are. they're the first ones in the inventory
const HOTBAR_SIZE = 5;
// extra bag slots, only on the inventory screen. it's a multiple of HOTBAR_SIZE so the rows line up
// with the hotbar
const BAG_SIZE = 10;

// how much the wheel has to turn to move one slot. one notch is about 100. this stops trackpads, which
// send lots of tiny amounts, racing through the slots
const HOTBAR_SCROLL_STEP = 60;

// in screen px: the slot size, the gap between them, and how far the bottom of the slots is from the
// bottom of the screen
const HOTBAR_LAYOUT = {
  slotSize: 44,
  gap: 6,
  bottom: 10,
};

class Inventory {
  constructor(size) {
    // an item or null for each slot
    this.slots = new Array(size).fill(null);
    // the picked slot
    this.selected = 0;
  }

  get size() {
    return this.slots.length;
  }

  // the item in the picked slot, or null
  held() {
    return this.slots[this.selected];
  }

  select(slot) {
    if (slot >= 0 && slot < this.size) this.selected = slot;
  }

  // moves 1 forward or back through the first count slots (the hotbar), wrapping round at the ends
  cycle(step, count = this.size) {
    this.selected = (this.selected + step + count) % count;
  }

  // puts it in the first empty slot. gives true if there was room
  add(item) {
    const slot = this.slots.indexOf(null);
    if (!item || slot === -1) return false;
    this.slots[slot] = item;
    return true;
  }

  // empties a slot and gives back what was in it (or null). for dropping, giving, chests...
  take(slot) {
    const item = this.slots[slot];
    this.slots[slot] = null;
    return item;
  }

  // also works for moving into an empty slot
  swap(a, b) {
    [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]];
  }
}

// an item's picture, or a placeholder square in its colour with the first letter of its label. size
// is how many px square it is, with its top left at x, y. used for dragging. slots and the ground add
// its glow around it (drawGlowingItem() in itemglow.js)
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
  // how far the wheel has turned towards the next slot (HOTBAR_SCROLL_STEP)
  scrolled: 0,

  // called once from setup() with the player's inventory. the slots are ui elements, so clicking on
  // them never swings your weapon
  init(inventory) {
    this.inventory = inventory;
    // the game uses the wheel, so it stops it scrolling the page while you're playing
    Input.captureWheel = true;

    // a row in the middle along the bottom
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

  // every frame while playing: the number keys and the wheel
  update() {
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (Input.wasPressed(`slot${i + 1}`)) this.inventory.select(i);
    }

    // down goes to the next slot and up goes back. changing direction starts the count again
    if (Input.wheel !== 0 && Math.sign(Input.wheel) !== Math.sign(this.scrolled)) this.scrolled = 0;
    this.scrolled += Input.wheel;
    // one slot at a time, and any leftover gets thrown away (when I carried it over it sometimes
    // skipped two)
    if (Math.abs(this.scrolled) >= HOTBAR_SCROLL_STEP) {
      this.inventory.cycle(Math.sign(this.scrolled), HOTBAR_SIZE);
      this.scrolled = 0;
    }
  },

  show(visible) {
    UI.showGroup('hotbar', visible);
  },

  // the held item's name above the hotbar, in screen positions
  drawLabel() {
    const item = this.inventory.held();
    fill(255);
    setText(14, BOLD, CENTER, BOTTOM);
    // dark outline so you can read it on any ground
    stroke(0, 0, 0, 170);
    strokeWeight(3);
    // in its rarity's colour (items.js)
    if (item) fill(itemRarity(item).colour);
    text(item ? item.type.label : 'Empty hands', GAME_W / 2, GAME_H - HOTBAR_LAYOUT.slotSize - 16);
  },
};

// a slot on the hotbar or the inventory screen. it's a Button so it gets clicking for free, and it
// draws the slot and its item. hotbar slots show their number, and a ring when they're picked
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

    // faded out while it's being dragged
    if (item) {
      const pad = 8;
      push();
      if (InventoryScreen.dragging === this.slot) drawingContext.globalAlpha *= 0.3;
      drawGlowingItem(item, this.x + this.w / 2, this.y + this.h / 2, this.w - pad * 2, this.w / 2);
      pop();
    }

    // the number in the top left
    if (!onHotbar) return;
    noStroke();
    fill(selected ? '#ffd23f' : 200);
    setText(10, BOLD, LEFT, TOP);
    text(this.slot + 1, this.x + 4, this.y + 2);
  }
}

// ---------- the inventory screen ----------

// in screen px (the slots use HOTBAR_LAYOUT): padding round the edge, the title above the bag, the
// label above the hotbar row, and the hint along the bottom
const INVENTORY_LAYOUT = {
  pad: 16,
  titleHeight: 40,
  labelHeight: 24,
  hintHeight: 28,
};

// the panel behind the inventory screen's slots. it's a ui element so clicks on it never reach the game
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

    // above the hotbar row (which is the bottom row)
    fill(200);
    setText(11, BOLD, LEFT, BOTTOM);
    text('Hotbar', this.x + pad, this.y + this.h - hintHeight - HOTBAR_LAYOUT.slotSize - 4);

    fill(150);
    setText(11, NORMAL);
    text('Drag to move items, or outside to drop', this.x + this.w / 2, this.y + this.h - hintHeight / 2);
  }
}

// opened with E or I. shows every slot, with the bag on top and the hotbar underneath. the game keeps
// going but the player stands still (sketch.js)
const InventoryScreen = {
  active: false,
  inventory: null,
  // the slot being dragged, or null
  dragging: null,

  // called once from setup() with the player's inventory. makes the panel and slots, hidden to start with
  init(inventory) {
    this.inventory = inventory;
    const { slotSize: size, gap } = HOTBAR_LAYOUT;
    const { pad, titleHeight, labelHeight, hintHeight } = INVENTORY_LAYOUT;
    const bagRows = Math.ceil(BAG_SIZE / HOTBAR_SIZE);

    const w = HOTBAR_SIZE * size + (HOTBAR_SIZE - 1) * gap + pad * 2;
    const h = titleHeight + bagRows * (size + gap) - gap + labelHeight + size + hintHeight;
    const left = (GAME_W - w) / 2;
    const top = (GAME_H - h) / 2;
    // added first so the slots draw on top of it
    UI.add(new InventoryPanel({ x: left, y: top, w, h, group: 'inventory', visible: false }));

    // the bag rows go left to right, and the hotbar goes along the bottom
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
        // clicking a hotbar slot picks it, same as the real hotbar
        onClick: onHotbar ? () => inventory.select(i) : null,
      }));
    }
  },

  // the real hotbar hides while this is open, since its row is in the box anyway
  show(open) {
    this.active = open;
    this.dragging = null;
    UI.showGroup('inventory', open);
    Hotbar.show(!open);
  },

  // every frame while it's open, after UI.update() (ui.js) has found which element the mouse is over.
  // map and player are for when you drop something out of the box
  update(map, player) {
    const hovered = UI.hovered instanceof ItemSlot && UI.hovered.group === 'inventory' ? UI.hovered.slot : null;

    // press on an item to start dragging it
    if (Input.buttonsPressed.has('left') && hovered !== null && this.inventory.slots[hovered]) {
      this.dragging = hovered;
    }

    // when you let go: over a slot it swaps them, outside the box but over the game it drops it, and
    // anywhere else it just goes back
    if (this.dragging !== null && Input.buttonsReleased.has('left')) {
      if (hovered !== null) {
        this.inventory.swap(this.dragging, hovered);
      } else if (UI.hovered === null && Input.mouse.inside) {
        Drops.drop(map, player, this.dragging);
      }
      this.dragging = null;
    }
    // like if focus was lost mid drag (so the release never got seen), or Q dropped it
    if (!Input.buttonsHeld.has('left') || !this.inventory.slots[this.dragging]) this.dragging = null;
  },

  // the dragged item under the mouse. drawn after UI.draw() so it's on top
  drawDragged() {
    if (this.dragging === null) return;
    const size = 28;
    drawItemIcon(this.inventory.slots[this.dragging], Input.mouse.x - size / 2, Input.mouse.y - size / 2, size);
  },
};

// ---------- items on the ground ----------

// how close in px the middle of your feet has to be to pick something up
const PICKUP_RANGE = 28;
// how many px from the middle of your feet a drop gets thrown towards where you're aiming. it's far
// enough to clear your body when you throw upwards
const DROP_DISTANCE = 48;
// some randomness so things dropped from the same spot don't pile up: up to angle degrees either side
// of where you're aiming, and up to distance px short of DROP_DISTANCE
const DROP_SPREAD = {
  angle: 35,
  distance: 20,
};
// how many px a drop tries to land away from other drops, about the width of an item
const DROP_GAP = 20;
// seconds it spends in the air
const THROW_TIME = 0.4;
// how many px a throw arcs up above the straight line from the player's middle to the ground
const THROW_HEIGHT = 24;

// items on the ground. each map keeps its own in map.drops (tilemap.js) until you reload. they're
// progress like map.characters, so Export doesn't save them, even ones placed in the editor
// (Drops.place()).
// each one is { item, x, y, ready, from, flight }. x, y is where it is or where it'll land. ready is
// false until the player has been outside PICKUP_RANGE, so you don't pick drops straight back up and
// "inventory full" only shows once each time you walk up to it, not every frame. from is where the
// throw started (under the player) and how high. flight goes from 0 to 1 while it's in the air
// (THROW_TIME), and it can't be picked up until it's landed
const Drops = {
  // takes the item out of the slot and throws it roughly where you're aiming. it tries a few random
  // spots and keeps the first one that's DROP_GAP away from other drops (or the clearest one if it's
  // crowded)
  drop(map, player, slot) {
    const item = player.inventory.take(slot);
    if (!item) return;
    let best = null;
    for (let i = 0; i < 10; i++) {
      const spot = this.throwSpot(map, player);
      // Infinity if there's nothing else on the ground
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

  // puts it straight on the ground, already landed and ready. for the editor
  place(map, item, x, y) {
    map.drops.push({ item, x, y, ready: true, from: null, flight: 1 });
  },

  // a random spot about DROP_DISTANCE from the feet, towards where you're aiming (DROP_SPREAD)
  throwSpot(map, player) {
    const angle = player.aimAngle + radians(randomBetween(-DROP_SPREAD.angle, DROP_SPREAD.angle));
    const distance = DROP_DISTANCE - randomBetween(0, DROP_SPREAD.distance);
    // moves a small box using the map's collision (tilemap.js), so it stops at walls and you can
    // still reach it. done in two halves, since the map only checks one tile ahead
    const feet = player.feetBox();
    const box = { x: feet.x + feet.w / 2 - 4, y: feet.y + feet.h / 2 - 4, w: 8, h: 8 };
    for (let i = 0; i < 2; i++) {
      box.x += map.moveAlongX(box, Math.cos(angle) * distance / 2);
      box.y += map.moveAlongY(box, Math.sin(angle) * distance / 2);
    }
    return { x: box.x + 4, y: box.y + 4 };
  },

  // where it is on the ground right now (the shadow) and how high above it. in the air it flies from
  // the player's middle to where it lands, arcing up by THROW_HEIGHT
  where(drop) {
    const t = drop.flight;
    if (t >= 1) return { x: drop.x, y: drop.y, height: 0 };
    return {
      x: lerp(drop.from.x, drop.x, t),
      y: lerp(drop.from.y, drop.y, t),
      height: lerp(drop.from.height, 0, t) + 4 * THROW_HEIGHT * t * (1 - t),
    };
  },

  // every frame while playing: moves things being thrown, and picks up landed drops in range if
  // there's room
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
      // picked it up
      if (player.inventory.add(drop.item)) return false;
      drop.ready = false;
      showMessage(`No room for the ${drop.item.type.label.toLowerCase()}, your inventory is full`);
      return true;
    });
  },

  // one drop above its shadow. it glows in the air too, and bobs up and down once it's landed. each
  // one gets drawn on its own so it can be sorted in front of or behind characters (sketch.js). world
  // positions (inside camera.begin/end)
  draw(drop) {
    const size = 20;
    const landed = drop.flight >= 1;
    const spot = this.where(drop);
    // + x so drops next to each other don't bob in time
    const bob = landed ? Math.sin(millis() / 1000 * 3 + drop.x) * 3 : 0;
    const x = Math.round(spot.x);
    const y = Math.round(spot.y - size / 2 - 6 - spot.height + bob);

    noStroke();
    // the shadow shrinks as it goes up
    fill(0, 0, 0, 70);
    ellipse(x, Math.round(spot.y), Math.max(4, 16 + bob - spot.height / 4), 5);
    // the seed is the landing spot, which stays the same for the whole throw, so the glow doesn't
    // jump about as it moves
    drawGlowingItem(drop.item, x, y, size, GLOW_PIXEL_SIZE, drop.x + drop.y);
  },
};
