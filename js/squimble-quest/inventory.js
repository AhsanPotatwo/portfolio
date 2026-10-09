// inventories, the hotbar, the inventory screen, and items on the ground.
//
// an inventory is a row of slots. each slot has one item (items.js) or is empty, and one slot is
// picked: its item is what you're holding (an empty slot means empty hands). the first HOTBAR_SIZE
// slots of the player's inventory (player.inventory) are the hotbar, which are the only ones you can
// pick. then comes the bag, and then what you're wearing (EQUIPMENT_SLOTS), which you only see on the
// inventory screen, next to a picture of you wearing it:
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

// the slots for things you wear, after the bag, in the order the inventory screen shows them (the
// first four down the left of the picture of you, the rest down the right). each takes items whose wear
// (items.js) is its wear. key is its name in map files (an enemy spawn's wears, editor.js), so renaming
// one loses it from enemies that wear something there
const EQUIPMENT_SLOTS = [
  { key: 'head', wear: 'head', label: 'Head' },
  { key: 'body', wear: 'body', label: 'Body' },
  { key: 'legs', wear: 'legs', label: 'Legs' },
  { key: 'feet', wear: 'feet', label: 'Feet' },
  { key: 'accessory1', wear: 'accessory', label: 'Accessory 1' },
  { key: 'accessory2', wear: 'accessory', label: 'Accessory 2' },
  { key: 'accessory3', wear: 'accessory', label: 'Accessory 3' },
];

class Inventory {
  // size: how many slots for carrying things. equipment: EQUIPMENT_SLOTS for something that wears
  // things (the player), which come after them
  constructor(size, equipment = []) {
    // an item or null for each slot
    this.slots = new Array(size + equipment.length).fill(null);
    this.carrying = size;
    this.equipment = equipment;
    // the picked slot
    this.selected = 0;
  }

  get size() {
    return this.slots.length;
  }

  // the EQUIPMENT_SLOTS entry of a slot, or undefined if it's for carrying things
  equipmentAt(slot) {
    return this.equipment[slot - this.carrying];
  }

  // can the item (or null) go in the slot? anything goes in a carrying slot, but only things worn
  // there go in an equipment one
  fits(slot, item) {
    const equipment = this.equipmentAt(slot);
    return !item || !equipment || item.type.wear === equipment.wear;
  }

  // the item types being worn (Character.worn(), character.js)
  worn() {
    return this.slots.slice(this.carrying).filter(Boolean).map((item) => item.type);
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

  // puts it in the first empty carrying slot (never straight onto you). gives true if there was room
  add(item) {
    const slot = this.slots.findIndex((had, i) => had === null && i < this.carrying);
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

  // also works for moving into an empty slot. does nothing and gives false if either item can't go
  // where the other one was (fits())
  swap(a, b) {
    if (!this.fits(a, this.slots[b]) || !this.fits(b, this.slots[a])) return false;
    [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]];
    return true;
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

// the inventory screen's colours: the picked hotbar slot, slots the dragged item can be worn in, and
// the outline of other slots
const INVENTORY_COLOURS = {
  picked: '#ffd23f',
  fits: '#7ec8ff',
  slotEdge: 90,
};

// a slot on the hotbar or the inventory screen. it's a Button so it gets clicking for free, and it
// draws the slot and its item. hotbar slots show their number, and a ring when they're picked. empty
// equipment slots show what goes in them, and while an item's being dragged the ones it can be worn
// in light up and the rest fade
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
    const equipment = this.inventory.equipmentAt(this.slot);
    const dragged = InventoryScreen.dragging === null ? null : this.inventory.slots[InventoryScreen.dragging];
    const fits = equipment && dragged && this.inventory.fits(this.slot, dragged);
    const C = INVENTORY_COLOURS;

    push();
    if (equipment && dragged && !fits) drawingContext.globalAlpha *= 0.4;
    fill(20, 22, 28, 200);
    stroke(selected ? C.picked : fits ? C.fits : this.hovered ? 255 : C.slotEdge);
    strokeWeight(selected || fits ? 3 : 1.5);
    rect(this.x, this.y, this.w, this.h, 6);
    if (equipment && !item) drawWearIcon(equipment.wear, this.x + this.w / 2, this.y + this.h / 2, this.w * 0.5);

    // faded out while it's being dragged
    if (item) {
      const pad = 8;
      if (InventoryScreen.dragging === this.slot) drawingContext.globalAlpha *= 0.3;
      drawGlowingItem(item, this.x + this.w / 2, this.y + this.h / 2, this.w - pad * 2, this.w / 2);
    }
    pop();

    // the number in the top left
    if (!onHotbar) return;
    noStroke();
    fill(selected ? C.picked : 200);
    setText(10, BOLD, LEFT, TOP);
    text(this.slot + 1, this.x + 4, this.y + 2);
  }
}

// a faint outline of what's worn in a place (WEAR_PLACES in items.js), size px across with its middle
// on x, y, for empty equipment slots. each is a shape in parts of size from the middle
const WEAR_ICONS = {
  // a shirt
  body: [[-0.2, -0.4], [-0.5, -0.18], [-0.38, 0.02], [-0.25, -0.06], [-0.25, 0.42], [0.25, 0.42], [0.25, -0.06], [0.38, 0.02], [0.5, -0.18], [0.2, -0.4], [0.1, -0.3], [-0.1, -0.3]],
  // trousers
  legs: [[-0.3, -0.42], [0.3, -0.42], [0.32, 0.42], [0.08, 0.42], [0, -0.08], [-0.08, 0.42], [-0.32, 0.42]],
  // a boot
  feet: [[-0.3, -0.42], [0.05, -0.42], [0.05, 0.06], [0.42, 0.14], [0.42, 0.4], [-0.3, 0.4]],
};

function drawWearIcon(wear, x, y, size) {
  noFill();
  stroke(255, 255, 255, 55);
  strokeWeight(2);
  if (wear === 'head') {
    // a helmet with a brim
    arc(x, y + size * 0.2, size * 0.8, size * 0.9, PI, TWO_PI, CHORD);
    line(x - size * 0.5, y + size * 0.2, x + size * 0.5, y + size * 0.2);
  } else if (wear === 'accessory') {
    // a ring with a gem
    circle(x, y + size * 0.12, size * 0.6);
    quad(x, y - size * 0.45, x + size * 0.12, y - size * 0.3, x, y - size * 0.15, x - size * 0.12, y - size * 0.3);
  } else if (WEAR_ICONS[wear]) {
    beginShape();
    for (const [px, py] of WEAR_ICONS[wear]) vertex(x + px * size, y + py * size);
    endShape(CLOSE);
  }
}

// a big picture of a character turned towards the mouse, wearing what it's wearing (drawCharacter() in
// character.js), standing on a dark floor. the inventory screen shows you in one and the editor's enemy
// and npc boxes show who's being edited (editor.js). just for show, clicks go through.
//   look  () => { settings, worn, caption }: settings is PLAYER or an enemy or npc type, worn its
//         item types, and caption optional lines of text along the bottom. it's read every frame, so
//         the picture changes as things get put on and taken off
class CharacterPreview extends UIElement {
  constructor(options) {
    super({ ...options, interactive: false });
    this.look = options.look;
  }

  draw() {
    const { settings, worn = [], caption = [] } = this.look();
    const { x, y, w, h } = this;
    const lineHeight = 14;
    const textH = caption.length * lineHeight;
    fill(EDITOR_COLOURS.well); // editor.js
    stroke(EDITOR_COLOURS.edge);
    strokeWeight(1);
    rect(x, y, w, h, 6);

    // as big as fits, in whole steps so pixel art stays square
    const zoom = Math.max(1, Math.floor(Math.min((h - textH - 28) / settings.height, (w - 20) / settings.width)));
    const cx = Math.round(x + w / 2);
    const cy = Math.round(y + (h - textH) / 2);
    // a shadow on the floor under its feet
    const feetY = cy + (settings.height * zoom) / 2;
    noStroke();
    fill(0, 0, 0, 110);
    ellipse(cx, feetY, settings.width * zoom * 1.4, 6 * zoom);
    const facing = directionFromAngle(Math.atan2(Input.mouse.y - cy, Input.mouse.x - cx)); // utils.js
    push();
    translate(cx, cy);
    scale(zoom);
    drawCharacter(settings, 0, 0, { facing, worn });
    pop();

    noStroke();
    fill(EDITOR_COLOURS.dimText);
    setText(11, BOLD, CENTER, CENTER);
    caption.forEach((words, i) => text(fitText(words, w - 8), cx, y + h - textH - 6 + (i + 0.5) * lineHeight));
  }
}

// ---------- the inventory screen ----------

// in screen px (the slots use HOTBAR_LAYOUT): padding round the edge, the headings along the top, the
// label above the hotbar row, the hint along the bottom, the picture of you between the equipment
// columns and the space either side of it, and the gap between the equipment and the bag (with a line
// down the middle)
const INVENTORY_LAYOUT = {
  pad: 16,
  titleHeight: 40,
  labelHeight: 24,
  hintHeight: 28,
  previewWidth: 112,
  previewGap: 8,
  sectionGap: 33,
};

// the panel behind the inventory screen's slots. it's a ui element so clicks on it never reach the game.
// equipmentMiddle and bagMiddle are the x of the middle of each side, and split the line between them
class InventoryPanel extends UIElement {
  constructor(options) {
    super(options);
    this.equipmentMiddle = options.equipmentMiddle;
    this.bagMiddle = options.bagMiddle;
    this.split = options.split;
    this.bagLeft = options.bagLeft;
  }

  draw() {
    const { titleHeight, hintHeight } = INVENTORY_LAYOUT;
    fill(20, 22, 28, 235);
    stroke(90);
    strokeWeight(1.5);
    rect(this.x, this.y, this.w, this.h, 8);
    // the line between what you're wearing and what you're carrying
    stroke(255, 255, 255, 25);
    strokeWeight(1);
    line(this.split, this.y + 14, this.split, this.y + this.h - hintHeight);

    noStroke();
    fill(255);
    setText(15);
    text('Equipment', this.equipmentMiddle, this.y + titleHeight / 2 + 2);
    text('Inventory', this.bagMiddle, this.y + titleHeight / 2 + 2);

    // above the hotbar row (which is the bottom row)
    fill(200);
    setText(11, BOLD, LEFT, BOTTOM);
    text('Hotbar', this.bagLeft, this.y + this.h - hintHeight - HOTBAR_LAYOUT.slotSize - 4);

    // what's under the mouse, or how it works
    fill(150);
    setText(11, NORMAL);
    text(InventoryScreen.hint(), this.x + this.w / 2, this.y + this.h - hintHeight / 2);
  }
}

// opened with E or I. shows every slot: what you're wearing down either side of a picture of you on
// the left, and the bag with the hotbar underneath on the right. the game keeps going but the player
// stands still (sketch.js)
const InventoryScreen = {
  active: false,
  inventory: null,
  // the slot being dragged, or null
  dragging: null,

  // called once from setup() with the player. makes the panel, the picture and the slots, hidden to
  // start with
  init(player) {
    const inventory = player.inventory;
    this.inventory = inventory;
    const { slotSize: size, gap } = HOTBAR_LAYOUT;
    const { pad, titleHeight, labelHeight, hintHeight, previewWidth, previewGap, sectionGap } = INVENTORY_LAYOUT;
    const bagRows = Math.ceil(BAG_SIZE / HOTBAR_SIZE);
    // equipment goes in two columns, the left one getting the odd one out
    const equipmentRows = Math.ceil(inventory.equipment.length / 2);

    const equipmentW = size * 2 + previewWidth + previewGap * 2;
    const bagW = HOTBAR_SIZE * size + (HOTBAR_SIZE - 1) * gap;
    const contentH = Math.max(equipmentRows * (size + gap) - gap, bagRows * (size + gap) - gap + labelHeight + size);
    const w = pad + equipmentW + sectionGap + bagW + pad;
    const h = titleHeight + contentH + hintHeight;
    const left = Math.round((GAME_W - w) / 2);
    const top = Math.round((GAME_H - h) / 2);
    const contentTop = top + titleHeight;
    const bagLeft = left + pad + equipmentW + sectionGap;
    // added first so everything else draws on top of it
    UI.add(new InventoryPanel({
      x: left, y: top, w, h, group: 'inventory', visible: false,
      equipmentMiddle: left + pad + equipmentW / 2, bagMiddle: bagLeft + bagW / 2, split: bagLeft - sectionGap / 2, bagLeft,
    }));
    UI.add(new CharacterPreview({
      x: left + pad + size + previewGap, y: contentTop, w: previewWidth, h: contentH, group: 'inventory', visible: false,
      look: () => ({ settings: player.settings, worn: player.worn(), caption: [`${Math.ceil(player.health)} / ${player.maxHealth} health`] }),
    }));

    const slot = (i, x, y, onClick = null) => UI.add(new ItemSlot({ x, y, w: size, h: size, group: 'inventory', visible: false, inventory, slot: i, onClick }));
    // the bag rows go left to right, and the hotbar goes along the bottom
    const hotbarTop = contentTop + contentH - size;
    for (let i = 0; i < inventory.carrying; i++) {
      const onHotbar = i < HOTBAR_SIZE;
      const bagSlot = i - HOTBAR_SIZE;
      const col = onHotbar ? i : bagSlot % HOTBAR_SIZE;
      const y = onHotbar ? hotbarTop : contentTop + Math.floor(bagSlot / HOTBAR_SIZE) * (size + gap);
      // clicking a hotbar slot picks it, same as the real hotbar
      slot(i, bagLeft + col * (size + gap), y, onHotbar ? () => inventory.select(i) : null);
    }
    // equipment down the left of the picture, then down the right
    inventory.equipment.forEach((_, n) => {
      const onRight = n >= equipmentRows;
      const x = left + pad + (onRight ? size + previewGap * 2 + previewWidth : 0);
      slot(inventory.carrying + n, x, contentTop + (n % equipmentRows) * (size + gap));
    });
  },

  // the words along the bottom: what the item under the mouse is (and where it's worn), what an empty
  // equipment slot is for, or how it works
  hint() {
    const slot = UI.hovered instanceof ItemSlot && UI.hovered.group === 'inventory' ? UI.hovered.slot : null;
    const item = slot === null ? null : this.inventory.slots[slot];
    if (item) return item.type.wear ? `${item.type.label} (${WEAR_PLACES[item.type.wear]})` : item.type.label;
    const equipment = slot === null ? null : this.inventory.equipmentAt(slot);
    if (equipment) return `${equipment.label}: drag something you wear there into it`;
    return 'Drag to move items or put things on, or outside to drop';
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
