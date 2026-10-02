// the form box: a box in the middle of the screen that asks for a few things, in the game rather
// than in the browser's own prompt(). the map editor uses it for New map, Resize map, Export and a
// warp's settings (editor.js), and the tile editor for a tile's (tileeditor.js). click a box to type
// into it, Tab goes to the next one, Enter or the right button says yes, Escape, Cancel or the × in the
// corner closes it. it's a window: drag its title bar to move it out of the way of the map behind.
//
//   FormBox   the box itself. FormBox.open({ title, rows, onConfirm... }) lays itself out, see open()
//   Picker    a "choose one of these" field, clicked through with ‹ ›
//   Checkbox  a tick box, for a setting that's only on or off
// the typing fields (TextField, NumberField, ColourField) are in textfield.js. it's drawn in the map
// editor's colours (EDITOR_COLOURS in editor.js)

// the box's width, the space each thing it asks for gets and how tall its box is, the title bar along
// the top and the strip along the bottom with the buttons, how much wider a side column makes it (see
// side in FormBox.open()), and the size of its tabs (see tabs), in screen pixels
const FORM_BOX = { width: 300, rowHeight: 30, fieldHeight: 24, titleHeight: 28, footerHeight: 40, sideWidth: 180, tabHeight: 22, tabGap: 2 };

const FormBox = {
  active: false,
  // what open() was given
  options: null,
  // the open tab's boxes that can be typed into, and the button that says yes
  fields: [],
  confirmButton: null,
  // every tab ({ label, rows }, a box without tabs is one), which one's open, and its button for each
  tabs: [],
  tab: 0,
  tabButtons: [],
  // how far down the box the rows start, and how many rows the box has room for
  rowsTop: 0,
  mostRows: 0,
  // where the box is on screen, { x, y, w, h }, and its background (it moves when dragged)
  box: null,
  backdrop: null,
  // where the mouse was while its title bar's being dragged, or null when it isn't
  dragFrom: null,

  // options: { title, hint, confirmLabel, rows, tabs, canConfirm(values), onConfirm(values) }
  //   rows        one per thing to ask for: { label, field, after }. field is the ui element it's
  //               typed, picked or ticked in (a TextField, NumberField, Picker or Checkbox), with
  //               its width set. after is a word to show after it, like 'tiles' (can be left out)
  //   tabs        instead of rows, for a box with too much to fit at once: [{ label, rows }]. a row
  //               of tabs goes under the title and only the open tab's rows show. the box is tall
  //               enough for the tab with the most rows, so it doesn't jump about when switching
  //   minRows     makes the box at least this many rows tall, e.g. to give side more room (can be
  //               left out)
  //   hint        a line of writing under the rows (can be left out)
  //   values      what's in each row's field, in the same order as rows (every tab's, in order)
  //   canConfirm  whether the values are ok to say yes to. without it, anything is
  //   side        (x, y, w, h) => [ui elements], things for a column beside the rows, like the tile
  //               editor's pictures. x, y, w, h is the space they have (can be left out)
  //   onUpdate    runs every frame while it's open, e.g. to show changes as they're made (can be left out)
  //   onCancel    runs when it closes without saying yes, e.g. to undo those changes (can be left out)
  open(options) {
    this.options = options;
    this.active = true;
    // the keyboard types into the boxes now, rather than moving the camera and so on (input.js)
    Input.typing = true;

    // made fresh each time, since each one asks for different things. tall enough to fit them
    this.tabs = options.tabs ?? [{ rows: options.rows }];
    const tabbed = Boolean(options.tabs);
    this.rowsTop = FORM_BOX.titleHeight + 12 + (tabbed ? FORM_BOX.tabHeight + 8 : 0);
    this.mostRows = Math.max(options.minRows ?? 0, ...this.tabs.map(({ rows }) => rows.length));
    const w = FORM_BOX.width + (options.side ? FORM_BOX.sideWidth : 0);
    const h = this.rowsTop + this.mostRows * FORM_BOX.rowHeight + (options.hint ? 20 : 0) + FORM_BOX.footerHeight;
    const x = (GAME_W - w) / 2;
    const y = (GAME_H - h) / 2;
    this.box = { x, y, w, h };
    this.dragFrom = null;
    const add = (element) => UI.add(Object.assign(element, { group: 'form-box' }));

    // covers the whole screen, so nothing behind it can be clicked while it's open
    this.backdrop = add(new FormBoxBackdrop({ x: 0, y: 0, w: GAME_W, h: GAME_H, box: this.box }));
    // the × in the title bar's corner, which lights up red like a window's close button
    add(new Button({
      x: x + w - 26, y: y + 4, w: 22, h: FORM_BOX.titleHeight - 8, label: '×',
      style: { ...BUTTON_STYLES.editor, fill: 'rgba(0, 0, 0, 0)', border: 'rgba(0, 0, 0, 0)', hoverFill: BUTTON_STYLES.danger.fill, pressedFill: BUTTON_STYLES.danger.pressedFill, textSize: 16 },
      onClick: () => this.close(),
    }));
    // the tabs, under the title and above the rows, each as wide as its label. they all shrink to fit
    // if there are lots
    setText(11, BOLD, CENTER, CENTER, BUTTON_STYLES.default.font);
    const tabWidths = this.tabs.map(({ label }) => textWidth(label ?? '') + 14);
    const room = FORM_BOX.width - 32 - FORM_BOX.tabGap * (this.tabs.length - 1);
    const squash = Math.min(1, room / tabWidths.reduce((a, b) => a + b, 0));
    let tabX = x + 16;
    this.tabButtons = tabbed ? this.tabs.map(({ label }, i) => {
      const button = add(new Button({
        x: tabX, y: y + FORM_BOX.titleHeight + 10, w: tabWidths[i] * squash, h: FORM_BOX.tabHeight, label,
        style: { ...BUTTON_STYLES.editor, textSize: 11 },
        // a toggle so the open one's lit up. showTab() puts them all right after the click flips it
        toggle: true,
        onClick: () => this.showTab(i),
      }));
      tabX += button.w + FORM_BOX.tabGap;
      return button;
    }) : [];
    // every tab's rows in the same places, showTab() hides all but the open tab's
    for (const { rows } of this.tabs) {
      rows.forEach(({ field }, i) => add(Object.assign(field, { x: x + 100, y: y + this.rowsTop + i * FORM_BOX.rowHeight, h: FORM_BOX.fieldHeight })));
    }
    // between the rows (and tabs) and the right edge, from under the title bar to above the strip
    // along the bottom, where Cancel and the confirm button go
    const sideTop = FORM_BOX.titleHeight + 12;
    if (options.side) options.side(x + FORM_BOX.width, y + sideTop, FORM_BOX.sideWidth - 16, h - sideTop - FORM_BOX.footerHeight - 6).forEach(add);
    // in the bottom right corner, like most programs' boxes
    const buttonY = y + h - (FORM_BOX.footerHeight + 24) / 2;
    add(new Button({ x: x + w - 182, y: buttonY, w: 80, h: 24, label: 'Cancel', style: 'editor', onClick: () => this.close() }));
    this.confirmButton = add(new Button({
      x: x + w - 96, y: buttonY, w: 80, h: 24, label: options.confirmLabel, style: 'editorPrimary',
      onClick: () => this.confirm(),
    }));

    this.fields = [];
    this.showTab(0);
  },

  // the open tab's rows
  rows() {
    return this.tabs[this.tab].rows;
  },

  // shows one tab's rows (by its place in tabs) and hides the rest. typing goes to its first box
  showTab(index) {
    for (const field of this.fields) field.blur();
    this.tab = index;
    this.tabButtons.forEach((button, i) => { button.on = i === index; });
    this.tabs.forEach(({ rows }, i) => rows.forEach(({ field }) => { field.visible = i === index; }));
    this.fields = this.rows().map(({ field }) => field).filter((field) => field instanceof TextField);
    // a tab of only tick boxes and pickers has nothing to type into
    if (this.fields.length > 0) this.focus(this.fields[0]);
  },

  // confirmed is true when it's closing because it was said yes to, otherwise onCancel runs
  close(confirmed = false) {
    this.active = false;
    Input.typing = false;
    UI.removeGroup('form-box');
    if (!confirmed && this.options.onCancel) this.options.onCancel();
  },

  // what's in each row's field, in the same order as the rows (every tab's, not just the open one)
  values() {
    return this.tabs.flatMap(({ rows }) => rows).map(({ field }) => field.value);
  },

  canConfirm() {
    return !this.options.canConfirm || this.options.canConfirm(this.values());
  },

  confirm() {
    if (!this.canConfirm()) return;
    const values = this.values();
    // closed first, since saying yes can go to a new map
    this.close(true);
    this.options.onConfirm(values);
  },

  // types into this box from now on
  focus(field) {
    for (const other of this.fields) {
      if (other !== field && other.focused) other.blur();
    }
    field.focus();
  },

  // run every frame while it's open, from Editor.update(). keys are gone through in the order they
  // were typed, so a quick "20 Tab 12" still puts 20 in one box and 12 in the next
  update() {
    this.drag();
    if (Input.buttonsPressed.has('left')) {
      const clicked = this.fields.find((field) => field.hovered);
      if (clicked) this.focus(clicked);
    }
    for (const key of Input.typed) {
      if (key === 'Enter') return this.confirm();
      if (key === 'Escape') return this.close();
      // nothing to type into on this tab
      if (this.fields.length === 0) continue;
      const focused = this.fields.find((field) => field.focused);
      if (key === 'Tab') this.focus(this.fields[(this.fields.indexOf(focused) + 1) % this.fields.length]);
      else if (key.paste !== undefined) focused.paste(key.paste);
      else focused.type(key);
    }
    // greyed out while it can't be said yes to, e.g. Export with no name
    this.confirmButton.enabled = this.canConfirm();
    if (this.options.onUpdate) this.options.onUpdate();
  },

  // pressing on the title bar picks the box up, and it follows the mouse until it's let go. it can't
  // go off the screen, so its buttons can always be reached
  drag() {
    const { x, y } = Input.mouse;
    const box = this.box;
    const onTitle = x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + FORM_BOX.titleHeight;
    if (Input.buttonsPressed.has('left') && UI.hovered === this.backdrop && onTitle) this.dragFrom = { x, y };
    if (!this.dragFrom) return;
    if (!Input.buttonsHeld.has('left')) {
      this.dragFrom = null;
      return;
    }
    const dx = constrain(box.x + x - this.dragFrom.x, 0, GAME_W - box.w) - box.x;
    const dy = constrain(box.y + y - this.dragFrom.y, 0, GAME_H - box.h) - box.y;
    // everything in the box moves with it. the backdrop covers the whole screen, so it stays put
    for (const el of UI.group('form-box')) {
      if (el === this.backdrop) continue;
      el.x += dx;
      el.y += dy;
    }
    box.x += dx;
    box.y += dy;
    this.dragFrom.x += dx;
    this.dragFrom.y += dy;
  },
};

// the form box's background: dims everything behind it, then draws the box and its writing.
// the rows' boxes and the buttons are separate ui elements on top (see FormBox.open())
class FormBoxBackdrop extends UIElement {
  constructor(options) {
    super(options);
    // where the box itself is: { x, y, w, h }
    this.box = options.box;
  }

  draw() {
    const { x, y, w, h } = this.box;
    const { title, hint } = FormBox.options;
    const { rowsTop, mostRows } = FormBox;

    // only a little darker behind, so changes made in the box can be seen on the map (tileeditor.js)
    noStroke();
    fill(0, 0, 0, 40);
    rect(0, 0, GAME_W, GAME_H);

    const C = EDITOR_COLOURS;
    const { titleHeight, footerHeight } = FORM_BOX;
    fill(C.bar);
    stroke(C.edge);
    strokeWeight(1);
    rect(x, y, w, h, 4);

    // the title bar and the strip along the bottom, a little darker, like a window
    noStroke();
    fill(C.header);
    rect(x + 1, y + 1, w - 2, titleHeight - 1, 4, 4, 0, 0);
    rect(x + 1, y + h - footerHeight, w - 2, footerHeight - 1, 0, 0, 4, 4);
    fill(C.edge);
    rect(x, y + titleHeight, w, 1);
    rect(x, y + h - footerHeight, w, 1);
    fill(C.text);
    setText(13, BOLD, LEFT, CENTER);
    text(title, x + 12, y + titleHeight / 2);

    // each of the open tab's rows' label, lined up with the middle of its box, and its word after it
    FormBox.rows().forEach(({ label, field, after }, i) => {
      const middleY = y + rowsTop + FORM_BOX.fieldHeight / 2 + i * FORM_BOX.rowHeight;
      fill(C.text);
      setText(12, BOLD, LEFT, CENTER);
      text(label, x + 16, middleY);
      if (after) {
        fill(C.dimText);
        setText(11, BOLD, LEFT, CENTER);
        text(after, field.x + field.w + 8, middleY);
      }
    });

    if (hint) {
      fill(C.dimText);
      setText(11, BOLD, LEFT, CENTER);
      text(hint, x + 16, y + rowsTop + 6 + mostRows * FORM_BOX.rowHeight);
    }
  }
}

// picks one of a list of choices in the form box, like what New map is filled with, or which map a
// warp goes to. click the left half to go back through them, the right half to go forward.
//   choices   the list to pick from (any values: names, null...)
//   value     the one picked to start with (the first choice if it isn't one of them)
//   label     turns a choice into the words shown for it
//   art       draws a little picture of a choice, (choice, x, y, size) => { ... }. can be left out
//   onChange  runs with the new choice whenever it changes. can be left out
class Picker extends UIElement {
  constructor(options) {
    super(options);
    this.label = options.label;
    this.art = options.art ?? null;
    this.onChange = options.onChange ?? null;
    this.setChoices(options.choices, options.value);
  }

  // a new list to pick from, starting on value (the first choice if it isn't one of them)
  setChoices(choices, value) {
    this.choices = choices;
    this.index = Math.max(0, choices.indexOf(value));
  }

  // the picked choice
  get value() {
    return this.choices[this.index];
  }

  // is the mouse over the left half, the one that goes back?
  mouseOnLeft() {
    return Input.mouse.x < this.x + this.w / 2;
  }

  update(hovered) {
    this.hovered = hovered;
    if (!hovered || !Input.buttonsPressed.has('left')) return;
    const count = this.choices.length;
    // + count stops it going negative, % wraps it round, like the bar's pages
    this.index = (this.index + (this.mouseOnLeft() ? -1 : 1) + count) % count;
    if (this.onChange) this.onChange(this.value);
  }

  draw() {
    const middleY = this.y + this.h / 2;
    // a dark box, like the typing boxes
    fill(EDITOR_COLOURS.well);
    stroke(this.hovered ? 140 : EDITOR_COLOURS.edge);
    strokeWeight(1);
    rect(this.x, this.y, this.w, this.h, 3);

    // the arrows at each end, the one the mouse is on lit up
    noStroke();
    setText(16, BOLD, CENTER, CENTER);
    fill(this.hovered && this.mouseOnLeft() ? 255 : 120);
    text('‹', this.x + 10, middleY - 2);
    fill(this.hovered && !this.mouseOnLeft() ? 255 : 120);
    text('›', this.x + this.w - 10, middleY - 2);

    // its picture (if it has one), then its words
    let textX = this.x + 22;
    if (this.art) {
      this.art(this.value, this.x + 22, middleY - 8, 16);
      textX += 22;
    }
    noStroke();
    fill(255);
    setText(12, BOLD, LEFT, CENTER);
    text(this.label(this.value), textX, middleY);
  }
}

// a tick box in the form box, for a setting that's only on or off, like whether enemies can follow
// the player through a warp. clicking anywhere on it (the box or its words) flips it.
//   value    true to start ticked
//   label    the words next to the box
//   enabled  false greys it out and stops it being clicked, like a Button
class Checkbox extends UIElement {
  constructor(options) {
    super(options);
    this.value = options.value ?? false;
    this.label = options.label;
  }

  update(hovered) {
    this.hovered = hovered && this.enabled;
    if (this.hovered && Input.buttonsPressed.has('left')) this.value = !this.value;
  }

  draw() {
    push();
    if (!this.enabled) drawingContext.globalAlpha *= BUTTON_STYLES.default.disabledAlpha;
    this.drawBox();
    pop();
  }

  drawBox() {
    const size = 16;
    const left = this.x + 4;
    const top = this.y + (this.h - size) / 2;
    // a dark box, like the typing boxes
    fill(EDITOR_COLOURS.well);
    stroke(this.hovered ? 140 : EDITOR_COLOURS.edge);
    strokeWeight(1);
    rect(left, top, size, size, 3);

    // a tick in it while it's on
    if (this.value) {
      noFill();
      stroke(255);
      strokeWeight(2);
      line(left + 4, top + 8, left + 7, top + 11);
      line(left + 7, top + 11, left + 12, top + 5);
    }

    noStroke();
    fill(255);
    setText(12, BOLD, LEFT, CENTER);
    text(this.label, left + size + 8, this.y + this.h / 2);
  }
}
