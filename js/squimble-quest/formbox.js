// the form box: an in-game centred box that asks for things (instead of prompt()). used by the map
// editor for New map, Resize map, Export and warp settings (editor.js), and by the tile editor
// (tileeditor.js). click a field to type, Tab for the next, Enter or the confirm button says yes,
// Escape, Cancel or × closes. a window: drag the title bar to move it.
//   FormBox   the box: FormBox.open({ title, rows, onConfirm... }) lays itself out (see open())
//   Picker    choose one of a list with ‹ ›
//   Checkbox  an on/off tick box
// typing fields are in textfield.js. colours: EDITOR_COLOURS (editor.js)

// screen px: box width, row spacing, field height, title bar, footer (buttons), extra width with a
// side column (open()'s side), tab size and gap
const FORM_BOX = { width: 300, rowHeight: 30, fieldHeight: 24, titleHeight: 28, footerHeight: 40, sideWidth: 180, tabHeight: 22, tabGap: 2 };

const FormBox = {
  active: false,
  // open()'s options
  options: null,
  // the open tab's typing fields, and the confirm button
  fields: [],
  confirmButton: null,
  // every tab ({ label, rows }; untabbed is one), the open one, and their buttons
  tabs: [],
  tab: 0,
  tabButtons: [],
  // rows' offset from the box top, and row capacity
  rowsTop: 0,
  mostRows: 0,
  // on-screen { x, y, w, h } (moves when dragged), and its backdrop
  box: null,
  backdrop: null,
  // mouse position during a title bar drag, else null
  dragFrom: null,

  // options: { title, hint, confirmLabel, rows, tabs, canConfirm(values), onConfirm(values) }
  //   rows        { label, field, after } each. field: a sized TextField, NumberField, Picker or
  //               Checkbox. after: optional word after it, like 'tiles'
  //   tabs        instead of rows: [{ label, rows }]. a tab row goes under the title, showing one
  //               tab's rows. the box fits the longest tab, so it doesn't jump when switching
  //   minRows     optional minimum height in rows, e.g. to give side room
  //   hint        optional line under the rows
  //   values      each row's field value, in row order (every tab's)
  //   canConfirm  whether values are ok; without it, always
  //   side        optional (x, y, w, h) => [ui elements] for a column beside the rows (the tile
  //               editor's pictures); x, y, w, h is its space
  //   onUpdate    optional, every frame while open (e.g. live previews)
  //   onCancel    optional, on closing without confirming (e.g. undo those previews)
  open(options) {
    this.options = options;
    this.active = true;
    // keys type into fields now (input.js)
    Input.typing = true;

    // built fresh each time, sized to fit
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

    // full screen, so nothing behind is clickable
    this.backdrop = add(new FormBoxBackdrop({ x: 0, y: 0, w: GAME_W, h: GAME_H, box: this.box }));
    // title bar ×, red on hover like a window close button
    add(new Button({
      x: x + w - 26, y: y + 4, w: 22, h: FORM_BOX.titleHeight - 8, label: '×',
      style: { ...BUTTON_STYLES.editor, fill: 'rgba(0, 0, 0, 0)', border: 'rgba(0, 0, 0, 0)', hoverFill: BUTTON_STYLES.danger.fill, pressedFill: BUTTON_STYLES.danger.pressedFill, textSize: 16 },
      onClick: () => this.close(),
    }));
    // tabs under the title, label-width, all squashed to fit if there are many
    setText(11, BOLD, CENTER, CENTER, BUTTON_STYLES.default.font);
    const tabWidths = this.tabs.map(({ label }) => textWidth(label ?? '') + 14);
    const room = FORM_BOX.width - 32 - FORM_BOX.tabGap * (this.tabs.length - 1);
    const squash = Math.min(1, room / tabWidths.reduce((a, b) => a + b, 0));
    let tabX = x + 16;
    this.tabButtons = tabbed ? this.tabs.map(({ label }, i) => {
      const button = add(new Button({
        x: tabX, y: y + FORM_BOX.titleHeight + 10, w: tabWidths[i] * squash, h: FORM_BOX.tabHeight, label,
        style: { ...BUTTON_STYLES.editor, textSize: 11 },
        // toggle so the open one's lit; showTab() fixes them all after the click flips it
        toggle: true,
        onClick: () => this.showTab(i),
      }));
      tabX += button.w + FORM_BOX.tabGap;
      return button;
    }) : [];
    // every tab's rows in the same spots; showTab() hides all but one
    for (const { rows } of this.tabs) {
      rows.forEach(({ field }, i) => add(Object.assign(field, { x: x + 100, y: y + this.rowsTop + i * FORM_BOX.rowHeight, h: FORM_BOX.fieldHeight })));
    }
    // side column: right of the rows, from under the title bar to above the footer
    const sideTop = FORM_BOX.titleHeight + 12;
    if (options.side) options.side(x + FORM_BOX.width, y + sideTop, FORM_BOX.sideWidth - 16, h - sideTop - FORM_BOX.footerHeight - 6).forEach(add);
    // bottom right, as usual
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

  // shows tab `index`, hides the rest, focuses its first field
  showTab(index) {
    for (const field of this.fields) field.blur();
    this.tab = index;
    this.tabButtons.forEach((button, i) => { button.on = i === index; });
    this.tabs.forEach(({ rows }, i) => rows.forEach(({ field }) => { field.visible = i === index; }));
    this.fields = this.rows().map(({ field }) => field).filter((field) => field instanceof TextField);
    // tabs of only checkboxes and pickers have nothing to type into
    if (this.fields.length > 0) this.focus(this.fields[0]);
  },

  // onCancel runs unless confirmed
  close(confirmed = false) {
    this.active = false;
    Input.typing = false;
    UI.removeGroup('form-box');
    if (!confirmed && this.options.onCancel) this.options.onCancel();
  },

  // every tab's field values, in row order
  values() {
    return this.tabs.flatMap(({ rows }) => rows).map(({ field }) => field.value);
  },

  canConfirm() {
    return !this.options.canConfirm || this.options.canConfirm(this.values());
  },

  confirm() {
    if (!this.canConfirm()) return;
    const values = this.values();
    // close first, since confirming can change map
    this.close(true);
    this.options.onConfirm(values);
  },

  focus(field) {
    for (const other of this.fields) {
      if (other !== field && other.focused) other.blur();
    }
    field.focus();
  },

  // every frame while open, from Editor.update(). keys in typed order, so a quick "20 Tab 12" still
  // fills two fields correctly
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
    // greyed out while invalid, e.g. Export with no name
    this.confirmButton.enabled = this.canConfirm();
    if (this.options.onUpdate) this.options.onUpdate();
  },

  // title bar drag. kept on screen so its buttons stay reachable
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
    // move everything but the full-screen backdrop
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

// dims the screen, then draws the box and its text. fields and buttons are separate elements on top
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

    // only slightly dark, so live changes show on the map (tileeditor.js)
    noStroke();
    fill(0, 0, 0, 40);
    rect(0, 0, GAME_W, GAME_H);

    const C = EDITOR_COLOURS;
    const { titleHeight, footerHeight } = FORM_BOX;
    fill(C.bar);
    stroke(C.edge);
    strokeWeight(1);
    rect(x, y, w, h, 4);

    // darker title bar and footer, like a window
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

    // open tab's row labels, centred on their fields, and after words
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

// choose one of a list (New map's fill, a warp's target map). left half goes back, right forward.
//   choices   any values (names, null...)
//   value     starting choice (else the first)
//   label     choice → shown words
//   art       optional (choice, x, y, size) => { ... } thumbnail
//   onChange  optional, called with the new choice
class Picker extends UIElement {
  constructor(options) {
    super(options);
    this.label = options.label;
    this.art = options.art ?? null;
    this.onChange = options.onChange ?? null;
    this.setChoices(options.choices, options.value);
  }

  // value: starting choice (else the first)
  setChoices(choices, value) {
    this.choices = choices;
    this.index = Math.max(0, choices.indexOf(value));
  }

  get value() {
    return this.choices[this.index];
  }

  // over the left (back) half?
  mouseOnLeft() {
    return Input.mouse.x < this.x + this.w / 2;
  }

  update(hovered) {
    this.hovered = hovered;
    if (!hovered || !Input.buttonsPressed.has('left')) return;
    const count = this.choices.length;
    // + count avoids negatives, % wraps
    this.index = (this.index + (this.mouseOnLeft() ? -1 : 1) + count) % count;
    if (this.onChange) this.onChange(this.value);
  }

  draw() {
    const middleY = this.y + this.h / 2;
    // dark box like the typing fields
    fill(EDITOR_COLOURS.well);
    stroke(this.hovered ? 140 : EDITOR_COLOURS.edge);
    strokeWeight(1);
    rect(this.x, this.y, this.w, this.h, 3);

    // end arrows, the hovered one lit
    noStroke();
    setText(16, BOLD, CENTER, CENTER);
    fill(this.hovered && this.mouseOnLeft() ? 255 : 120);
    text('‹', this.x + 10, middleY - 2);
    fill(this.hovered && !this.mouseOnLeft() ? 255 : 120);
    text('›', this.x + this.w - 10, middleY - 2);

    // thumbnail if any, then words
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

// an on/off tick box (e.g. enemies follow through a warp). clicking it or its words flips it.
//   value    starts ticked if true
//   label    words beside it
//   enabled  false greys it and blocks clicks, like a Button
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
    // dark box like the typing fields
    fill(EDITOR_COLOURS.well);
    stroke(this.hovered ? 140 : EDITOR_COLOURS.edge);
    strokeWeight(1);
    rect(left, top, size, size, 3);

    // tick
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
