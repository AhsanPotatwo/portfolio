// the box for what starts in a chest (or anything with storage, objects.js), opened by right clicking
// one in the map editor (editor.js). it looks like the chest's own box in the game (ItemSlot in
// inventory.js), with the items under it, a category at a time (ITEM_CATEGORIES in items.js, picked
// down the left, empty ones faded):
//   - drag an item from the list into a slot, or click it to put it in the first empty one
//   - drag between slots to swap them
//   - drag one out of the chest (anywhere off its slots) or right click it to take it out
//   - the wheel over the list scrolls it, when a category has more than fit
// it changes a copy, so Cancel leaves the chest as it was. Save keeps it as the chest's items, which
// the map file saves (README "Placed items and chests"), and fills the chest now, replacing whatever
// was put in it while playing (StorageObjects.fill() in inventory.js)

// in screen px: the list's slots (smaller than the chest's) and how many go across, the category
// buttons down the left and the gap between them, the room for each heading, and the gap between the
// chest and the list. the list shows as many rows as there are categories' height
const STORAGE_EDITOR = { listSlotSize: 36, listColumns: 6, categoryWidth: 104, categoryHeight: 20, categoryGap: 2, headingHeight: 20, sectionGap: 12 };

const StorageEditor = {
  // the chest's slots being changed, and the list's slots (Inventories). the list's slots are filled
  // with the category's items from the scrolled to row on (showList())
  chest: null,
  list: null,
  // the ITEM_CATEGORIES key showing (kept for next time), how many rows down the list is scrolled, how
  // far the wheel has turned towards the next row, the category buttons, and the StorageEditorLayer
  category: null,
  scroll: 0,
  wheel: 0,
  buttons: [],
  layer: null,
  // the slot an item's being dragged from (an ItemSlot), or null
  dragging: null,

  open(obj) {
    const storage = OBJECT_TYPES[obj.type].storage;
    const { slotSize, gap } = HOTBAR_LAYOUT;
    const { listSlotSize, listColumns, categoryWidth, categoryHeight, categoryGap, headingHeight, sectionGap } = STORAGE_EDITOR;
    this.chest = new Inventory(storage.slots);
    (obj.items ?? []).slice(0, this.chest.size).forEach((name, i) => { this.chest.slots[i] = name === null ? null : itemOrStandIn(name); });
    this.dragging = null;

    // the chest centred along the top. under it the categories down the left, and the list beside
    // them as tall as they are
    const chestColumns = Math.min(storage.columns, this.chest.size);
    const chestW = chestColumns * (slotSize + gap) - gap;
    const chestH = Math.ceil(this.chest.size / chestColumns) * (slotSize + gap) - gap;
    const categories = Object.keys(ITEM_CATEGORIES);
    const listH = categories.length * (categoryHeight + categoryGap) - categoryGap;
    const listRows = Math.max(1, Math.floor((listH + gap) / (listSlotSize + gap)));
    const listLeft = categoryWidth + sectionGap;
    const w = Math.max(chestW, listLeft + listColumns * (listSlotSize + gap) - gap);
    const listTop = headingHeight + chestH + sectionGap + headingHeight;
    const h = listTop + listH;
    this.list = new Inventory(listColumns * listRows);

    FormBox.open({
      title: storage.label,
      hint: 'Click or drag items in. Right click to take one out',
      confirmLabel: 'Save',
      bodyWidth: w,
      bodyHeight: h,
      body: (x, y) => {
        const slot = (inventory, i, columns, size, left, top) => new ItemSlot({
          x: left + (i % columns) * (size + gap), y: top + Math.floor(i / columns) * (size + gap), w: size, h: size, inventory, slot: i,
        });
        this.buttons = categories.map((category, i) => new Button({
          x, y: y + listTop + i * (categoryHeight + categoryGap), w: categoryWidth, h: categoryHeight, label: ITEM_CATEGORIES[category],
          style: { ...BUTTON_STYLES.editor, textSize: 11 },
          // a toggle so the open one lights up. the click flips it, then showList() sets them all right
          toggle: true,
          onClick: () => this.showList(category),
        }));
        this.layer = new StorageEditorLayer({ x, y, w, h, listTop, listLeft, listRows });
        return [
          ...this.chest.slots.map((_, i) => slot(this.chest, i, chestColumns, slotSize, x + (w - chestW) / 2, y + headingHeight)),
          ...this.buttons,
          ...this.list.slots.map((_, i) => slot(this.list, i, listColumns, listSlotSize, x + listLeft, y + listTop)),
          this.layer,
        ];
      },
      onUpdate: () => this.update(),
      onConfirm: () => this.save(obj),
    });
    // the one from last time if it has anything, otherwise the first that does
    const filled = (category) => Object.keys(ITEMS_BY_CATEGORY[category] ?? {}).length > 0;
    this.showList(filled(this.category) ? this.category : categories.find(filled) ?? categories[0]);
  },

  // the category's items in the list from the top, its button lit, and empty categories faded
  showList(category) {
    this.category = category;
    this.scroll = 0;
    this.wheel = 0;
    Object.keys(ITEM_CATEGORIES).forEach((other, i) => {
      this.buttons[i].on = other === category;
      this.buttons[i].enabled = Object.keys(ITEMS_BY_CATEGORY[other]).length > 0;
    });
    this.fillList();
  },

  // the list's slots from the scrolled to row on. slots past the last item hide
  fillList() {
    const names = Object.keys(ITEMS_BY_CATEGORY[this.category]);
    const from = this.scroll * STORAGE_EDITOR.listColumns;
    const slots = UI.group('form-box').filter((el) => el instanceof ItemSlot && el.inventory === this.list);
    for (const slot of slots) {
      const name = names[from + slot.slot];
      this.list.slots[slot.slot] = name ? createItem(name) : null;
      slot.visible = Boolean(name);
    }
  },

  // how many rows the list can scroll down
  maxScroll() {
    const rows = Math.ceil(Object.keys(ITEMS_BY_CATEGORY[this.category]).length / STORAGE_EDITOR.listColumns);
    return Math.max(0, rows - this.list.size / STORAGE_EDITOR.listColumns);
  },

  // every frame while it's open (FormBox.update()), after UI.update() has found what the mouse is over
  update() {
    const hovered = UI.hovered instanceof ItemSlot ? UI.hovered : null;
    const inChest = hovered?.inventory === this.chest ? hovered : null;
    if (Input.buttonsPressed.has('left') && hovered?.item) this.dragging = hovered;
    if (Input.buttonsPressed.has('right') && inChest) this.chest.slots[inChest.slot] = null;

    // the wheel over the list scrolls a row for every HOTBAR_SCROLL_STEP it turns (inventory.js), like
    // the hotbar, so a touchpad doesn't race through it
    if (this.layer.overList()) {
      this.wheel += Input.wheel;
      const rows = Math.trunc(this.wheel / HOTBAR_SCROLL_STEP);
      this.wheel -= rows * HOTBAR_SCROLL_STEP;
      const scroll = constrain(this.scroll + rows, 0, this.maxScroll());
      if (scroll !== this.scroll) {
        this.scroll = scroll;
        this.fillList();
      }
    }

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
// right), a scroll bar beside the list when there's more than fits, and the item being dragged under
// the mouse. just for show, so clicks go through
class StorageEditorLayer extends UIElement {
  constructor(options) {
    super({ ...options, interactive: false });
    this.listTop = options.listTop;
    this.listLeft = options.listLeft;
    this.listRows = options.listRows;
  }

  // is the mouse over the list (slots or the gaps between them)? moves with the box, like the slots
  overList() {
    const { x, y } = Input.mouse;
    return x >= this.x + this.listLeft && x < this.x + this.w && y >= this.y + this.listTop && y < this.y + this.h;
  }

  draw() {
    const { chest, list, dragging, category } = StorageEditor;
    const { headingHeight } = STORAGE_EDITOR;
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
    const count = Object.keys(ITEMS_BY_CATEGORY[category]).length;
    heading(`${ITEM_CATEGORIES[category]} (${count})`, list, this.y + this.listTop - headingHeight);

    // a thin bar down the right of the list, as tall as the part showing
    const maxScroll = StorageEditor.maxScroll();
    if (maxScroll > 0) {
      const top = this.y + this.listTop;
      const height = this.h - this.listTop;
      const rows = maxScroll + this.listRows;
      fill(C.edge);
      rect(this.x + this.w + 6, top, 3, height, 2);
      fill(C.dimText);
      rect(this.x + this.w + 6, top + (StorageEditor.scroll / rows) * height, 3, (this.listRows / rows) * height, 2);
    } else if (count === 0) {
      fill(C.dimText);
      setText(11, NORMAL, LEFT, TOP);
      text('Nothing here yet', this.x + this.listLeft, this.y + this.listTop + 4);
    }

    // on top of everything, even the slots added after this
    if (!dragging) return;
    UI.drawOnTop(() => {
      const size = 28;
      drawItemIcon(dragging.item, Input.mouse.x - size / 2, Input.mouse.y - size / 2, size); // inventory.js
    });
  }
}
