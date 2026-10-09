// the form box: a box in the middle of the game that asks you for things (instead of using
// prompt()). the map editor uses it for New map, Resize map, Export and warp settings (editor.js), and
// so does the tile editor (tileeditor.js). click a field to type in it, Tab goes to the next one,
// Enter or the confirm button says yes, and Escape, Cancel or the x closes it. it works like a window,
// so you can drag the title bar to move it.
//   FormBox   the box itself. FormBox.open({ title, rows, onConfirm... }) lays itself out (see open())
//   Picker    pick one thing from a list, with the < > arrows or from a list that drops down
//   MultiPicker  pick any number of things from a list that drops down, with tick boxes
//   ChoiceList   that drop down list, for both of them
//   Checkbox  a tick box that's on or off
//   Slider    drag to pick a number (the sound editor's knobs)
// the typing fields are in textfield.js, and the colours are EDITOR_COLOURS (editor.js)

// all in screen px: the box's width, the space between rows, field height, title bar height, footer
// height (where the buttons go), extra width when there's a side column (open()'s side), and tab
// height and gap. tipDelay is the seconds the mouse rests on a row before its tip shows
const FORM_BOX = { width: 300, rowHeight: 30, fieldHeight: 24, titleHeight: 28, footerHeight: 40, sideWidth: 180, tabHeight: 22, tabGap: 2, tipDelay: 0.4 };

const FormBox = {
  active: false,
  // the options that were passed to open()
  options: null,
  // the typing fields on the open tab, and the confirm button
  fields: [],
  confirmButton: null,
  // every tab ({ label, rows }, a box with no tabs counts as one), which one's open, and their buttons
  tabs: [],
  tab: 0,
  tabButtons: [],
  // how far down from the top of the box the rows start, and how many rows it has room for
  rowsTop: 0,
  mostRows: 0,
  // where it is on screen as { x, y, w, h } (changes when it's dragged), and its backdrop
  box: null,
  backdrop: null,
  // the mouse position while dragging the title bar, otherwise null
  dragFrom: null,

  // options: { title, hint, confirmLabel, rows, tabs, canConfirm(values), onConfirm(values) }
  //   rows        each one is { label, field, after, tip }. field is a TextField, NumberField, Picker,
  //               MultiPicker, Checkbox or Slider with its width set. after is an optional word that
  //               goes after it, like 'tiles'. tip is optional words saying what it does, shown in a
  //               little box under the row while the mouse rests on it (FormBoxTip)
  //   tabs        use this instead of rows: [{ label, rows }]. a row of tabs goes under the title and
  //               it shows one tab's rows at a time. the box is sized for the longest tab so it doesn't
  //               jump around when you switch
  //   minRows     optional smallest height in rows, like to leave room for the side column
  //   hint        optional line of text under the rows
  //   values      every row's field value in row order (all the tabs')
  //   canConfirm  whether the values are ok. if it's left out they always are
  //   side        optional (x, y, w, h) => [ui elements] for a column next to the rows (like the tile
  //               editor's pictures). x, y, w, h is the space it gets
  //   onUpdate    optional, runs every frame while it's open (for live previews, say)
  //   onCancel    optional, runs when it's closed without confirming (like to undo those previews)
  open(options) {
    this.options = options;
    this.active = true;
    // keys go into the fields now (input.js)
    Input.typing = true;

    // built from scratch every time, sized to fit what's in it
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

    // covers the whole screen so nothing behind it can be clicked
    this.backdrop = add(new FormBoxBackdrop({ x: 0, y: 0, w: GAME_W, h: GAME_H, box: this.box }));
    // the x in the title bar, which goes red when hovered like a window's close button
    add(new Button({
      x: x + w - 26, y: y + 4, w: 22, h: FORM_BOX.titleHeight - 8, label: '×',
      style: { ...BUTTON_STYLES.editor, fill: 'rgba(0, 0, 0, 0)', border: 'rgba(0, 0, 0, 0)', hoverFill: BUTTON_STYLES.danger.fill, pressedFill: BUTTON_STYLES.danger.pressedFill, textSize: 16 },
      onClick: () => this.close(),
    }));
    // the tabs under the title, each as wide as its label, all squashed to fit if there are loads. they
    // go across the side column too, which starts under them
    setText(11, BOLD, CENTER, CENTER, BUTTON_STYLES.default.font);
    const tabWidths = this.tabs.map(({ label }) => textWidth(label ?? '') + 14);
    const room = w - 32 - FORM_BOX.tabGap * (this.tabs.length - 1);
    const squash = Math.min(1, room / tabWidths.reduce((a, b) => a + b, 0));
    let tabX = x + 16;
    this.tabButtons = tabbed ? this.tabs.map(({ label }, i) => {
      const button = add(new Button({
        x: tabX, y: y + FORM_BOX.titleHeight + 10, w: tabWidths[i] * squash, h: FORM_BOX.tabHeight, label,
        style: { ...BUTTON_STYLES.editor, textSize: 11 },
        // a toggle so the open one lights up. the click flips it, then showTab() sets them all right
        toggle: true,
        onClick: () => this.showTab(i),
      }));
      tabX += button.w + FORM_BOX.tabGap;
      return button;
    }) : [];
    // every tab's rows go in the same spots, and showTab() hides all but one tab's
    for (const { rows } of this.tabs) {
      rows.forEach(({ field }, i) => add(Object.assign(field, { x: x + 100, y: y + this.rowsTop + i * FORM_BOX.rowHeight, h: FORM_BOX.fieldHeight })));
    }
    // the side column: to the right of the rows, from level with them down to the footer
    const sideTop = this.rowsTop;
    if (options.side) options.side(x + FORM_BOX.width, y + sideTop, FORM_BOX.sideWidth - 16, h - sideTop - FORM_BOX.footerHeight - 6).forEach(add);
    // bottom right, where you'd expect them
    const buttonY = y + h - (FORM_BOX.footerHeight + 24) / 2;
    add(new Button({ x: x + w - 182, y: buttonY, w: 80, h: 24, label: 'Cancel', style: 'editor', onClick: () => this.close() }));
    this.confirmButton = add(new Button({
      x: x + w - 96, y: buttonY, w: 80, h: 24, label: options.confirmLabel, style: 'editorPrimary',
      onClick: () => this.confirm(),
    }));
    // last, so it's on top of the fields
    add(new FormBoxTip());

    this.fields = [];
    this.showTab(0);
  },

  // the rows on the open tab
  rows() {
    return this.tabs[this.tab].rows;
  },

  // the open tab's row the mouse is over (anywhere along it, label and all) as { row, index }, or null
  rowUnderMouse() {
    const { x, y } = Input.mouse;
    if (x < this.box.x || x >= this.box.x + FORM_BOX.width) return null;
    const gap = (FORM_BOX.rowHeight - FORM_BOX.fieldHeight) / 2;
    const index = Math.floor((y - this.box.y - this.rowsTop + gap) / FORM_BOX.rowHeight);
    const row = this.rows()[index];
    return row ? { row, index } : null;
  },

  // shows tab number `index`, hides the others, and focuses its first field
  showTab(index) {
    ChoiceList.close();
    for (const field of this.fields) field.blur();
    this.tab = index;
    this.tabButtons.forEach((button, i) => { button.on = i === index; });
    this.tabs.forEach(({ rows }, i) => rows.forEach(({ field }) => { field.visible = i === index; }));
    this.fields = this.rows().map(({ field }) => field).filter((field) => field instanceof TextField);
    // a tab with only checkboxes and pickers has nothing to type into
    if (this.fields.length > 0) this.focus(this.fields[0]);
  },

  // onCancel runs unless it was confirmed
  close(confirmed = false) {
    ChoiceList.close();
    this.active = false;
    Input.typing = false;
    UI.removeGroup('form-box');
    if (!confirmed && this.options.onCancel) this.options.onCancel();
  },

  // the values from every tab's fields, in row order
  values() {
    return this.tabs.flatMap(({ rows }) => rows).map(({ field }) => field.value);
  },

  canConfirm() {
    return !this.options.canConfirm || this.options.canConfirm(this.values());
  },

  confirm() {
    if (!this.canConfirm()) return;
    const values = this.values();
    // close it first, since confirming might change the map
    this.close(true);
    this.options.onConfirm(values);
  },

  focus(field) {
    for (const other of this.fields) {
      if (other !== field && other.focused) other.blur();
    }
    field.focus();
  },

  // every frame while it's open, from Editor.update(). keys are handled in the order they were typed,
  // so typing "20 Tab 12" quickly still fills in two fields properly
  update() {
    this.drag();
    if (Input.buttonsPressed.has('left')) {
      const clicked = this.fields.find((field) => field.hovered);
      if (clicked) this.focus(clicked);
    }
    for (const key of Input.typed) {
      if (key === 'Enter') return this.confirm();
      // Escape closes a drop down list first, then the box
      if (key === 'Escape' && ChoiceList.current) {
        ChoiceList.close();
        continue;
      }
      if (key === 'Escape') return this.close();
      // nothing on this tab to type into
      if (this.fields.length === 0) continue;
      const focused = this.fields.find((field) => field.focused);
      if (key === 'Tab') this.focus(this.fields[(this.fields.indexOf(focused) + 1) % this.fields.length]);
      else if (key.paste !== undefined) focused.paste(key.paste);
      else focused.type(key);
    }
    // greyed out while the values aren't ok, like Export with no name
    this.confirmButton.enabled = this.canConfirm();
    if (this.options.onUpdate) this.options.onUpdate();
  },

  // dragging by the title bar. it's kept on screen so you can always reach its buttons
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
    // move everything apart from the full screen backdrop
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

// darkens the screen, then draws the box and its text. the fields and buttons are their own elements
// on top of this
class FormBoxBackdrop extends UIElement {
  constructor(options) {
    super(options);
    // { x, y, w, h }
    this.box = options.box;
  }

  draw() {
    const { x, y, w, h } = this.box;
    const { title, hint } = FormBox.options;
    const { rowsTop, mostRows } = FormBox;

    // only a little bit dark, so you can still see live changes on the map (tileeditor.js)
    noStroke();
    fill(0, 0, 0, 40);
    rect(0, 0, GAME_W, GAME_H);

    const C = EDITOR_COLOURS;
    const { titleHeight, footerHeight } = FORM_BOX;
    fill(C.bar);
    stroke(C.edge);
    strokeWeight(1);
    rect(x, y, w, h, 4);

    // darker title bar and footer, like a window has
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

    // the open tab's row labels, lined up with the middle of their fields, and any after words
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

// the tip of the row the mouse rests on (a row's tip, see FormBox.open()), in a little box under it
// once it's been there FORM_BOX.tipDelay seconds, like the sound editor's tips. not while a list is
// dropped down or a mouse button is held (dragging a slider), when it'd be in the way
class FormBoxTip extends UIElement {
  constructor() {
    // just for show, clicks go through
    super({ interactive: false });
    // the row under the mouse ({ row, index } or null) and how many seconds it's been there
    this.under = null;
    this.time = 0;
  }

  update() {
    const under = FormBox.active ? FormBox.rowUnderMouse() : null;
    this.time = under && under.row === this.under?.row ? this.time + deltaTime / 1000 : 0;
    this.under = under;
  }

  draw() {
    const tip = this.under?.row.tip;
    if (!tip || this.time < FORM_BOX.tipDelay || ChoiceList.current || Input.buttonsHeld.size > 0) return;
    setText(11, BOLD, LEFT, CENTER);
    const w = textWidth(tip) + 16;
    // under the row, starting under its label, kept on screen
    const x = constrain(FormBox.box.x + 12, 4, GAME_W - w - 4);
    const y = FormBox.box.y + FormBox.rowsTop + (this.under.index + 1) * FORM_BOX.rowHeight - 4;
    noStroke();
    fill(0, 0, 0, 230);
    rect(x, y, w, 20, 3);
    fill(255);
    text(tip, x + 8, y + 10);
  }
}

// pick one thing from a list (New map's fill, where a warp goes). the ‹ › arrows at the ends step
// back and forward, and clicking anywhere else on it drops down a ChoiceList of every choice, so a
// long list (every tile, sound or map) doesn't need clicking through one at a time.
//   choices   any values (names, null...)
//   value     what it starts on (otherwise the first one)
//   label     (choice) => the words to show for it
//   art       optional (choice, x, y, size) => { ... } to draw a little picture
//   onChange  optional, gets called with the new choice
class Picker extends UIElement {
  constructor(options) {
    super(options);
    this.label = options.label;
    this.art = options.art ?? null;
    this.onChange = options.onChange ?? null;
    this.setChoices(options.choices, options.value);
  }

  // value is what it starts on (otherwise the first one)
  setChoices(choices, value) {
    this.choices = choices;
    this.index = Math.max(0, choices.indexOf(value));
  }

  get value() {
    return this.choices[this.index];
  }

  // which part the mouse is over: 'back' or 'forward' (the arrows), or 'list' (the middle)
  mouseZone() {
    const x = Input.mouse.x;
    if (x < this.x + PICKER_ARROW_WIDTH) return 'back';
    if (x >= this.x + this.w - PICKER_ARROW_WIDTH) return 'forward';
    return 'list';
  }

  // for its ChoiceList
  isChosen(choice) {
    return choice === this.value;
  }

  pickFromList(index) {
    ChoiceList.close();
    this.choose(index);
  }

  choose(index) {
    if (index === this.index) return;
    this.index = index;
    if (this.onChange) this.onChange(this.value);
  }

  update(hovered) {
    this.hovered = hovered;
    if (!hovered || !Input.buttonsPressed.has('left')) return;
    const zone = this.mouseZone();
    if (zone === 'list') return ChoiceList.toggle(this);
    ChoiceList.close();
    const count = this.choices.length;
    // adding count stops it going negative, and % wraps it round
    this.choose((this.index + (zone === 'back' ? -1 : 1) + count) % count);
  }

  draw() {
    const middleY = this.y + this.h / 2;
    const zone = this.hovered ? this.mouseZone() : null;
    const open = ChoiceList.current?.owner === this;
    drawFieldBox(this, this.hovered || open);

    // the arrows at each end, with the hovered one lit up
    noStroke();
    setText(16, BOLD, CENTER, CENTER);
    fill(zone === 'back' ? 255 : 120);
    text('‹', this.x + 10, middleY - 2);
    fill(zone === 'forward' ? 255 : 120);
    text('›', this.x + this.w - 10, middleY - 2);

    // the little picture if there is one, then the words, cut short to fit before the arrow
    let textX = this.x + PICKER_ARROW_WIDTH;
    if (this.art) {
      this.art(this.value, textX, middleY - 8, 16);
      textX += 22;
    }
    noStroke();
    fill(255);
    setText(12, BOLD, LEFT, CENTER);
    text(fitText(String(this.label(this.value)), this.x + this.w - PICKER_ARROW_WIDTH - textX), textX, middleY);
  }
}

// px at each end of a Picker that are its ‹ › arrows
const PICKER_ARROW_WIDTH = 20;

// the dark box behind a picker, lit up while hovered or its list is open
function drawFieldBox(field, lit) {
  fill(EDITOR_COLOURS.well);
  stroke(lit ? 140 : EDITOR_COLOURS.edge);
  strokeWeight(1);
  rect(field.x, field.y, field.w, field.h, 3);
}

// pick any number of things from a list (which particles a tile makes, which tiles blend onto it). it
// shows the chosen ones' words, and clicking it drops down a ChoiceList with a tick box for each, so
// it's always one row however many choices there are.
//   choices   any values
//   value     the chosen ones, in any order (null or [] for none)
//   label     (choice) => the words to show for it
//   art       optional (choice, x, y, size) => { ... } to draw a little picture in the list
//   none      optional words for when none are chosen (otherwise 'none')
//   empty     what value is when none are chosen, [] normally. null suits settings where null means
//             none, like a tile's particles
//   onChange  optional, gets called with the new value
// enabled false greys it out and stops clicks, like a Checkbox. value is the chosen ones in the
// choices' order
class MultiPicker extends UIElement {
  constructor(options) {
    super(options);
    this.choices = options.choices;
    this.label = options.label;
    this.art = options.art ?? null;
    this.none = options.none ?? 'none';
    this.empty = options.empty ?? [];
    this.onChange = options.onChange ?? null;
    this.chosen = new Set(options.value ?? []);
    // its ChoiceList ticks instead of picking one and closing
    this.multi = true;
  }

  get value() {
    const chosen = this.choices.filter((choice) => this.chosen.has(choice));
    return chosen.length > 0 ? chosen : this.empty;
  }

  isChosen(choice) {
    return this.chosen.has(choice);
  }

  pickFromList(index) {
    const choice = this.choices[index];
    if (this.chosen.has(choice)) this.chosen.delete(choice);
    else this.chosen.add(choice);
    if (this.onChange) this.onChange(this.value);
  }

  update(hovered) {
    this.hovered = hovered && this.enabled;
    if (!this.enabled && ChoiceList.current?.owner === this) ChoiceList.close();
    if (this.hovered && Input.buttonsPressed.has('left')) ChoiceList.toggle(this);
  }

  draw() {
    push();
    if (!this.enabled) drawingContext.globalAlpha *= BUTTON_STYLES.default.disabledAlpha;
    const middleY = this.y + this.h / 2;
    drawFieldBox(this, this.hovered || ChoiceList.current?.owner === this);
    noStroke();
    // a down arrow at the end, since it drops down
    fill(this.hovered ? 255 : 120);
    setText(10, BOLD, CENTER, CENTER);
    text('▼', this.x + this.w - 10, middleY);
    const chosen = this.choices.filter((choice) => this.chosen.has(choice));
    fill(chosen.length > 0 ? 255 : EDITOR_COLOURS.dimText);
    setText(12, BOLD, LEFT, CENTER);
    const words = chosen.length > 0 ? chosen.map((choice) => this.label(choice)).join(', ') : this.none;
    text(fitText(words, this.w - 30), this.x + 8, middleY);
    pop();
  }
}

// the list that drops down under a Picker or MultiPicker (its owner), showing every choice at once
// with its picture. a Picker's picks one and closes, a MultiPicker's ticks and unticks and stays open.
// it scrolls with the wheel when there are more than CHOICE_LIST.rows. clicking anywhere else,
// Escape (FormBox.update()), switching tab or the box closing closes it. only one is ever open
// (ChoiceList.current), and it goes in its owner's ui group so it goes when they go
const CHOICE_LIST = { rowHeight: 22, rows: 8 };

class ChoiceList extends UIElement {
  static current = null;

  // opens owner's list, or closes it if it's already open
  static toggle(owner) {
    if (ChoiceList.current?.owner === owner) return ChoiceList.close();
    ChoiceList.close();
    ChoiceList.current = UI.add(new ChoiceList(owner));
  }

  static close() {
    if (ChoiceList.current) UI.remove(ChoiceList.current);
    ChoiceList.current = null;
  }

  constructor(owner) {
    const { rowHeight, rows } = CHOICE_LIST;
    const h = Math.min(owner.choices.length, rows) * rowHeight + 4;
    // under the field, or over it if there's no room underneath
    const below = owner.y + owner.h + 2;
    super({ x: owner.x, y: below + h <= GAME_H ? below : owner.y - h - 2, w: owner.w, h, group: owner.group });
    this.owner = owner;
    // how many rows it's scrolled down. it starts with the first chosen one in view
    const first = owner.choices.findIndex((choice) => owner.isChosen(choice));
    this.scroll = constrain(first - Math.floor(rows / 2), 0, this.maxScroll());
    // the row the mouse is over, or -1
    this.under = -1;
  }

  maxScroll() {
    return Math.max(0, this.owner.choices.length - CHOICE_LIST.rows);
  }

  update(hovered) {
    if (ChoiceList.current !== this) return;
    this.hovered = hovered;
    // its field got hidden (another tab) or taken away
    if (!this.owner.visible || !UI.elements.includes(this.owner)) return ChoiceList.close();
    if (hovered && Input.wheel !== 0) {
      this.scroll = constrain(this.scroll + Math.sign(Input.wheel), 0, this.maxScroll());
      // used up so nothing under it scrolls too
      Input.wheel = 0;
    }
    const row = Math.floor((Input.mouse.y - this.y - 2) / CHOICE_LIST.rowHeight) + this.scroll;
    this.under = hovered && row >= this.scroll && row < this.owner.choices.length ? row : -1;
    if (!Input.buttonsPressed.has('left')) return;
    // a click on its own field already opened or closed it
    if (this.under >= 0) this.owner.pickFromList(this.under);
    else if (!hovered && !this.owner.hovered) ChoiceList.close();
  }

  draw() {
    const C = EDITOR_COLOURS;
    const { rowHeight, rows } = CHOICE_LIST;
    const owner = this.owner;
    fill(C.well);
    stroke(140);
    strokeWeight(1);
    rect(this.x, this.y, this.w, this.h, 3);
    const last = Math.min(owner.choices.length, this.scroll + rows);
    for (let i = this.scroll; i < last; i++) {
      const choice = owner.choices[i];
      const top = this.y + 2 + (i - this.scroll) * rowHeight;
      const middleY = top + rowHeight / 2;
      noStroke();
      if (i === this.under) {
        fill(C.tabHover);
        rect(this.x + 2, top, this.w - 4, rowHeight, 2);
      }
      let textX = this.x + 8;
      if (owner.multi) {
        // a tick box
        fill(C.bar);
        stroke(C.edge);
        rect(textX, middleY - 6, 12, 12, 2);
        if (owner.isChosen(choice)) {
          noFill();
          stroke(255);
          strokeWeight(2);
          line(textX + 3, middleY, textX + 5, middleY + 3);
          line(textX + 5, middleY + 3, textX + 9, middleY - 3);
          strokeWeight(1);
        }
        textX += 18;
      } else if (owner.isChosen(choice)) {
        // the chosen one gets a coloured line down its left
        fill(C.accent);
        rect(this.x + 2, top + 3, 3, rowHeight - 6, 1);
      }
      if (owner.art) {
        owner.art(choice, textX, middleY - 8, 16);
        textX += 22;
      }
      noStroke();
      fill(owner.isChosen(choice) || i === this.under ? 255 : C.text);
      setText(12, BOLD, LEFT, CENTER);
      text(fitText(String(owner.label(choice)), this.x + this.w - 14 - textX), textX, middleY);
    }
    // a scrollbar when they don't all fit
    const max = this.maxScroll();
    if (max > 0) {
      const track = this.h - 6;
      const thumb = Math.max(16, (track * rows) / owner.choices.length);
      noStroke();
      fill('#5d6575');
      rect(this.x + this.w - 6, this.y + 3 + (track - thumb) * (this.scroll / max), 3, thumb, 2);
    }
  }
}

// a tick box that's on or off (like whether enemies follow you through a warp). clicking the box or
// its words flips it.
//   value    starts ticked if true
//   label    the words next to it
//   enabled  false greys it out and stops clicks, same as a Button
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
    // dark box like the typing fields have
    fill(EDITOR_COLOURS.well);
    stroke(this.hovered ? 140 : EDITOR_COLOURS.edge);
    strokeWeight(1);
    rect(left, top, size, size, 3);

    // the tick
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

// drag along it to pick a number, like a knob on a synthesiser (the sound editor uses lots of them).
// the label goes on the left, the bar in the middle and the value on the right. click or drag the bar
// to set it, scroll the wheel over it to nudge it, and right click to put it back to normal.
//   label     words on the left
//   min, max  the smallest and biggest it can be
//   step      what it rounds to (1 for whole numbers, 0.1 for one decimal place...)
//   curve     how the values spread along the bar. 'linear' is even. 'log' gives every doubling the
//             same room (good for pitch). 'square' gives the small values more room, and for a range
//             like -100 to 100 the ones near 0, so small amounts are easy to pick
//   value     where it starts
//   normal    what right click puts it back to (otherwise value)
//   format    optional (value) => the words shown on the right, otherwise the number and unit
//   unit      optional word after the number, like 'ms'
//   onChange  optional, called with the new value whenever it changes
//   labelWidth  optional px for the label, normally 100. 0 leaves it out, for a FormBox row (which has
//               its own label)
// enabled false greys it out and stops it changing, like a Button.
//
// things to know:
//   - the label gets 100 px and the value 72 px, so give it a w of about 250 or more (the sound
//     editor's are 296). in a FormBox row (which sets x, y and h) use labelWidth 0 and a w of 180, like
//     the particle editor's (particleeditor.js)
//   - 'log' needs a min above 0, and 'square' on a range either side of 0 needs min to be exactly -max,
//     otherwise it falls back to squaring from min, which is lopsided
//   - onChange only runs when the value actually changes, after rounding to step
//   - valueAt() and positionOf() only use min, max and curve, so other code can borrow them for a
//     plain object with those (SoundEditor.randomSettings() does)
class Slider extends UIElement {
  constructor(options) {
    super(options);
    this.label = options.label;
    this.min = options.min;
    this.max = options.max;
    this.step = options.step ?? 1;
    this.curve = options.curve ?? 'linear';
    this.unit = options.unit ?? '';
    this.format = options.format ?? null;
    this.onChange = options.onChange ?? null;
    this.value = options.value;
    this.normal = options.normal ?? options.value;
    this.labelWidth = options.labelWidth ?? 100;
    // being dragged
    this.dragging = false;
  }

  // where the bar is, inside the slider: after the label, before the value
  bar() {
    return { x: this.x + this.labelWidth, w: this.w - this.labelWidth - 72 };
  }

  // a position along the bar (0 to 1) as a value, following the curve
  valueAt(p) {
    const { min, max } = this;
    if (this.curve === 'log') return min * (max / min) ** p;
    if (this.curve === 'square') {
      // a range either side of 0 squares outwards from the middle
      if (min === -max) return Math.sign(2 * p - 1) * (2 * p - 1) ** 2 * max;
      return min + (max - min) * p * p;
    }
    return min + (max - min) * p;
  }

  // the other way round: where a value is along the bar (0 to 1)
  positionOf(value) {
    const { min, max } = this;
    const v = Math.min(max, Math.max(min, value));
    if (this.curve === 'log') return Math.log(v / min) / Math.log(max / min);
    if (this.curve === 'square') {
      if (min === -max) return (Math.sign(v) * Math.sqrt(Math.abs(v) / max) + 1) / 2;
      return Math.sqrt((v - min) / (max - min));
    }
    return (v - min) / (max - min);
  }

  // changes the value (rounded to step, kept in range), calling onChange if it's different
  set(value) {
    const decimals = (String(this.step).split('.')[1] ?? '').length;
    const rounded = Number((Math.round(value / this.step) * this.step).toFixed(decimals));
    const kept = Math.min(this.max, Math.max(this.min, rounded));
    if (kept === this.value) return;
    this.value = kept;
    if (this.onChange) this.onChange(kept);
  }

  update(hovered) {
    this.hovered = hovered && this.enabled;
    if (!this.enabled) {
      this.dragging = false;
      return;
    }
    if (this.hovered && Input.buttonsPressed.has('left')) this.dragging = true;
    if (!Input.buttonsHeld.has('left')) this.dragging = false;
    const bar = this.bar();
    if (this.dragging) this.set(this.valueAt(Math.min(1, Math.max(0, (Input.mouse.x - bar.x) / bar.w))));
    if (this.hovered && Input.buttonsPressed.has('right')) this.set(this.normal);
    // the wheel nudges it 2% along the bar, or at least one step. used up so nothing else scrolls
    if (this.hovered && Input.wheel !== 0) {
      const way = -Math.sign(Input.wheel);
      const before = this.value;
      this.set(this.valueAt(Math.min(1, Math.max(0, this.positionOf(this.value) + way * 0.02))));
      if (this.value === before) this.set(before + way * this.step);
      Input.wheel = 0;
    }
  }

  draw() {
    push();
    if (!this.enabled) drawingContext.globalAlpha *= BUTTON_STYLES.default.disabledAlpha;
    const middleY = this.y + this.h / 2;
    const bar = this.bar();
    noStroke();
    fill(this.hovered || this.dragging ? EDITOR_COLOURS.text : EDITOR_COLOURS.dimText);
    setText(11, BOLD, LEFT, CENTER);
    text(this.label, this.x, middleY);

    // the bar, filled from 0 (or the left end) to the value
    fill(EDITOR_COLOURS.well);
    rect(bar.x, middleY - 3, bar.w, 6, 3);
    const from = bar.x + bar.w * this.positionOf(Math.min(this.max, Math.max(this.min, 0)));
    const at = bar.x + bar.w * this.positionOf(this.value);
    fill(EDITOR_COLOURS.accent);
    rect(Math.min(from, at), middleY - 3, Math.abs(at - from), 6, 3);
    // the knob
    fill(this.dragging ? 255 : this.hovered ? 230 : 200);
    circle(at, middleY, this.dragging ? 12 : 10);

    fill(EDITOR_COLOURS.text);
    setText(11, BOLD, RIGHT, CENTER);
    text(this.format ? this.format(this.value) : `${this.value} ${this.unit}`, this.x + this.w, middleY);
    pop();
  }
}
