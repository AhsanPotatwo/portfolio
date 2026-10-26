// the box for what starts in a chest (or anything with storage, objects.js), opened by right clicking
// one in the map editor (editor.js). it looks like the chest's own box in the game (ItemSlot in
// inventory.js), with every item laid out under it:
//   - drag an item from the list into a slot, or click it to put it in the first empty one
//   - drag between slots to swap them
//   - drag one out of the chest (anywhere off its slots) or right click it to take it out
// it changes a copy, so Cancel leaves the chest as it was. Save keeps it as the chest's items, which
// the map file saves (README "Placed items and chests"), and fills the chest now, replacing whatever
// was put in it while playing (StorageObjects.fill() in inventory.js)

// in screen px: the list's slots (smaller than the chest's, so lots of items fit) and how many go
// across, the room for each heading, the gap between the chest and the list, and the narrowest it gets
// (so the hint fits)
//
// ponytail: the list shows every item at once, so past about 60 items the box is taller than the
// screen. tabs for ITEM_CATEGORIES (items.js) or scrolling would fix it then
const STORAGE_EDITOR = { listSlotSize: 36, listColumns: 8, headingHeight: 20, sectionGap: 12, minWidth: 300 };

const StorageEditor = {
  // the chest's slots being changed and every item (Inventories), and the slot an item's being
  // dragged from (an ItemSlot), or null
  chest: null,
  list: null,
  dragging: null,

  open(obj) {
    const storage = OBJECT_TYPES[obj.type].storage;
    const { slotSize, gap } = HOTBAR_LAYOUT;
    const { listSlotSize, listColumns, headingHeight, sectionGap } = STORAGE_EDITOR;
    this.chest = new Inventory(storage.slots);
    (obj.items ?? []).slice(0, this.chest.size).forEach((name, i) => { this.chest.slots[i] = name === null ? null : itemOrStandIn(name); });
    const names = Object.keys(ITEM_TYPES);
    this.list = new Inventory(names.length);
    names.forEach((name, i) => { this.list.slots[i] = createItem(name); });
    this.dragging = null;

    // each grid's columns and size, both centred in the box
    const grid = (count, columns, size) => ({ columns, size, w: columns * (size + gap) - gap, h: Math.ceil(count / columns) * (size + gap) - gap });
    const chestGrid = grid(this.chest.size, Math.min(storage.columns, this.chest.size), slotSize);
    const listGrid = grid(names.length, Math.max(1, Math.min(listColumns, names.length)), listSlotSize);
    const w = Math.max(chestGrid.w, listGrid.w, STORAGE_EDITOR.minWidth);
    const listTop = headingHeight + chestGrid.h + sectionGap;
    const h = listTop + headingHeight + listGrid.h;
    const slots = (inventory, { columns, size, w: gridW }, x, y) => inventory.slots.map((_, i) => new ItemSlot({
      x: x + (w - gridW) / 2 + (i % columns) * (size + gap), y: y + Math.floor(i / columns) * (size + gap), w: size, h: size, inventory, slot: i,
    }));

    FormBox.open({
      title: storage.label,
      hint: 'Click or drag items in. Right click to take one out',
      confirmLabel: 'Save',
      bodyWidth: w,
      bodyHeight: h,
      body: (x, y) => [
        ...slots(this.chest, chestGrid, x, y + headingHeight),
        ...slots(this.list, listGrid, x, y + listTop + headingHeight),
        // last, so the dragged item is on top
        new StorageEditorLayer({ x, y, w, h, listTop }),
      ],
      onUpdate: () => this.update(),
      onConfirm: () => this.save(obj),
    });
  },

  // every frame while it's open (FormBox.update()), after UI.update() has found what the mouse is over
  update() {
    const hovered = UI.hovered instanceof ItemSlot ? UI.hovered : null;
    const inChest = hovered?.inventory === this.chest ? hovered : null;
    if (Input.buttonsPressed.has('left') && hovered?.item) this.dragging = hovered;
    if (Input.buttonsPressed.has('right') && inChest) this.chest.slots[inChest.slot] = null;

    // let go of: one from the chest swaps with the slot it's over, or comes out anywhere else. one from
    // the list goes in the slot it's over, or in the first empty one if it was just clicked
    if (this.dragging && Input.buttonsReleased.has('left')) {
      const from = this.dragging;
      this.dragging = null;
      if (from.inventory === this.chest) {
        if (inChest) this.chest.swap(from.slot, inChest.slot);
        else this.chest.slots[from.slot] = null;
      } else if (inChest) {
        this.chest.slots[inChest.slot] = createItem(from.item.type.name);
      } else if (hovered === from && !this.chest.add(createItem(from.item.type.name))) {
        showMessage("It's full. Take something out first");
      }
    }
    // like if focus was lost mid drag, so the let go was never seen
    if (!Input.buttonsHeld.has('left')) this.dragging = null;
  },

  // a name or null per slot, without the empty ones at the end. nothing in it saves no items at all
  save(obj) {
    const names = this.chest.slots.map((item) => item?.type.name ?? null);
    const items = names.slice(0, names.findLastIndex((name) => name !== null) + 1);
    if (items.length > 0) obj.items = items;
    else delete obj.items;
    StorageObjects.fill(obj); // inventory.js
  },
};

// an item to show in a slot. one that doesn't exist (renamed or deleted) gets a red stand in with its
// name, so the box doesn't quietly take it out: it stays in the chest's items until you do
function itemOrStandIn(name) {
  if (ITEM_TYPES[name]) return createItem(name);
  return { type: { name, label: `${name} (missing)`, fill: color(EDITOR_COLOURS.erase), rarity: ITEM_DEFAULTS.rarity } };
}

// the headings over the chest and the list (each with the name of the item under the mouse at its
// right), and the item being dragged under the mouse. just for show, so clicks go through
class StorageEditorLayer extends UIElement {
  constructor(options) {
    super({ ...options, interactive: false });
    this.listTop = options.listTop;
  }

  draw() {
    const { chest, list, dragging } = StorageEditor;
    const C = EDITOR_COLOURS;
    const under = UI.hovered instanceof ItemSlot ? UI.hovered : null;
    const heading = (words, inventory, y) => {
      noStroke();
      fill(C.text);
      setText(12, BOLD, LEFT, TOP);
      text(words, this.x, y);
      if (under?.inventory !== inventory || !under.item) return;
      fill(C.dimText);
      setText(11, BOLD, RIGHT, TOP);
      text(under.item.type.label, this.x + this.w, y + 1);
    };
    heading('In it at the start', chest, this.y);
    heading('Every item', list, this.y + this.listTop);

    if (!dragging) return;
    const size = 28;
    drawItemIcon(dragging.item, Input.mouse.x - size / 2, Input.mouse.y - size / 2, size); // inventory.js
  }
}
