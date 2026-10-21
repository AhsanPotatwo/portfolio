// the ui system: anything you can click or see on top of the game (buttons, hotbar slots, number
// boxes, the editor's bars and panels).
//   UIElement  the base class: position, size, shown/hidden, enabled/disabled and group. Button
//              (button.js) is built on it
//   UI         the list of elements. it updates them, draws them and finds the one under the mouse
//   FloatingWindow, ListWindow  windows you can drag around by their title bar (the end of this file)
// everything uses screen positions (camera.js), from (0, 0) to (GAME_W, GAME_H). place things from the
// edges or the middle (x: GAME_W - 60, not x: 900), so they'd follow if the size ever changed. they're
// drawn in the order they were added, so later ones go on top. for buttons see button.js.
//
// to make a new kind of element (a slider, a slot, a text box...):
//   1. a new file, e.g. slider.js: class Slider extends UIElement { ... }
//   2. its constructor calls super(options) first
//   3. update(hovered) for what the mouse does, draw() for how it looks (copy button.js)
//   4. load it in squimble-quest.html after ui.js
//   5. UI.add(new Slider({ x: 20, y: 20, w: 200, h: 20 }))

class UIElement {
  // takes one options object in any order: new UIElement({ x: 10, y: 10, w: 100, h: 40, group: 'pause menu' })
  constructor(options = {}) {
    // top left and size, in screen pixels
    this.x = options.x ?? 0;
    this.y = options.y ?? 0;
    this.w = options.w ?? 0;
    this.h = options.h ?? 0;

    // hidden means it isn't drawn and can't be clicked
    this.visible = options.visible ?? true;
    // disabled means it's faded and can't be clicked, but it still stops clicks reaching the game
    this.enabled = options.enabled ?? true;
    // false lets clicks go through to the game (for things that are just for show, like labels)
    this.interactive = options.interactive ?? true;
    // a name shared by elements so they can be shown, hidden or removed together, like
    // UI.showGroup('pause menu', false)
    this.group = options.group ?? null;

    // UI sets this every frame: the mouse is over it and it's the top one
    this.hovered = false;
  }

  contains(px, py) {
    return px >= this.x && px < this.x + this.w &&
           py >= this.y && py < this.y + this.h;
  }

  // UI runs this every frame. clickable elements (like Button) have their own
  update(hovered) {
    this.hovered = hovered;
  }

  // each kind of element has its own
  draw() {}
}

const UI = {
  elements: [],
  // the element under the mouse, or null
  hovered: null,

  // ---------- adding and removing ----------

  // gives the element back so you can keep it: const play = UI.add(new Button({ ... }))
  add(element) {
    this.elements.push(element);
    return element;
  },

  remove(element) {
    this.elements = this.elements.filter((el) => el !== element);
  },

  group(name) {
    return this.elements.filter((el) => el.group === name);
  },

  removeGroup(name) {
    this.elements = this.elements.filter((el) => el.group !== name);
  },

  showGroup(name, visible = true) {
    for (const el of this.group(name)) el.visible = visible;
  },

  // ---------- every frame ----------

  // runs before anything else uses the mouse (sketch.js)
  update() {
    const mouse = Input.mouse;
    this.hovered = null;

    // only while the game is focused and the mouse is over it. goes backwards since later elements
    // are on top
    if (Input.focused && mouse.inside) {
      for (let i = this.elements.length - 1; i >= 0; i--) {
        const el = this.elements[i];
        if (el.visible && el.interactive && el.contains(mouse.x, mouse.y)) {
          this.hovered = el;
          break;
        }
      }
    }

    // a click on the ui gets hidden from the game
    if (this.hovered && Input.buttonsPressed.size > 0) Input.claimMouse();

    // loops over a copy, in case a click adds or removes elements
    for (const el of [...this.elements]) el.update(el === this.hovered);
  },

  // runs after the world is drawn (sketch.js). UI.draw(true) outlines every element, invisible ones
  // too, which helps for lining up invisible buttons. green, or pink for the one under the mouse
  draw(showHitboxes = false) {
    for (const el of this.elements) {
      if (el.visible) el.draw();
    }
    if (showHitboxes) this.drawHitboxes();
  },

  drawHitboxes() {
    noFill();
    strokeWeight(1);
    for (const el of this.elements) {
      if (!el.visible) continue;
      stroke(el === this.hovered ? '#ff4fd8' : '#39d353');
      rect(el.x, el.y, el.w, el.h);
    }
  },
};

// ---------- windows ----------

// a little window that floats over everything, dragged around by its title bar, with an × that closes
// it (the colour picker in textfield.js, the map editor's lists). to make a kind of window:
//   - its constructor passes { title, w, h } to super(), plus x, y (otherwise it goes in the middle)
//   - its update(hovered) starts with `if (this.updateWindow(hovered)) return;`, which does the title
//     bar and the ×, and gives back true when the mouse was busy with those
//   - its draw() starts with this.drawWindow(), then draws what's inside from contentTop() down
// close() takes it off the screen, then runs onClose if there is one. it stays on screen when dragged
const FLOATING_WINDOW = { titleHeight: 24, closeWidth: 24 };

class FloatingWindow extends UIElement {
  constructor(options) {
    super(options);
    this.title = options.title ?? '';
    this.onClose = options.onClose ?? null;
    // the mouse's offset from the top left while the title bar is being dragged, otherwise null
    this.grab = null;
    this.moveTo(options.x ?? (GAME_W - this.w) / 2, options.y ?? (GAME_H - this.h) / 2);
  }

  // kept on screen, and on whole px so it stays sharp
  moveTo(x, y) {
    this.x = Math.round(constrain(x, 0, GAME_W - this.w));
    this.y = Math.round(constrain(y, 0, GAME_H - this.h));
  }

  contentTop() {
    return this.y + FLOATING_WINDOW.titleHeight;
  }

  isOpen() {
    return UI.elements.includes(this);
  }

  // the mouse is over the × in the title bar
  overClose() {
    return this.hovered && Input.mouse.y < this.contentTop() && Input.mouse.x >= this.x + this.w - FLOATING_WINDOW.closeWidth;
  }

  // the title bar and the ×, every frame. true while dragging or after closing, when there's nothing
  // more for the window to do this frame
  updateWindow(hovered) {
    this.hovered = hovered;
    const { x, y } = Input.mouse;
    if (!Input.buttonsHeld.has('left')) this.grab = null;
    if (hovered && Input.buttonsPressed.has('left') && y < this.contentTop()) {
      if (this.overClose()) {
        this.close();
        return true;
      }
      this.grab = { x: x - this.x, y: y - this.y };
    }
    if (!this.grab) return false;
    this.moveTo(x - this.grab.x, y - this.grab.y);
    return true;
  }

  close() {
    UI.remove(this);
    this.onClose?.();
  }

  // the window's background, title bar and ×, in the map editor's colours (EDITOR_COLOURS, editor.js)
  drawWindow() {
    const C = EDITOR_COLOURS;
    const { titleHeight, closeWidth } = FLOATING_WINDOW;
    const { x, y, w, h } = this;
    fill(C.bar);
    stroke(C.edge);
    strokeWeight(1);
    rect(x, y, w, h, 4);
    noStroke();
    fill(C.header);
    rect(x + 1, y + 1, w - 2, titleHeight - 1, 4, 4, 0, 0);
    fill(C.edge);
    rect(x, y + titleHeight, w, 1);
    fill(C.text);
    setText(12, BOLD, LEFT, CENTER);
    text(fitText(this.title, w - closeWidth - 14), x + 10, y + titleHeight / 2);
    // red while hovered, like the form box's
    if (this.overClose()) {
      fill(BUTTON_STYLES.danger.fill);
      rect(x + w - closeWidth, y + 3, closeWidth - 4, titleHeight - 6, 3);
    }
    fill(C.text);
    setText(16, BOLD, CENTER, CENTER);
    text('×', x + w - closeWidth / 2 - 2, y + titleHeight / 2);
  }
}

// a FloatingWindow with a list of lines, scrolled with the wheel, like the map editor's problems and
// keys lists.
//   lines   () => [{ text, note, colour, onClick }], read every frame so it can change while it's open.
//           note is dim words on the right (like a key), and onClick makes the line clickable
//   empty   words for when there aren't any lines
//   footer  optional () => words along the bottom
class ListWindow extends FloatingWindow {
  constructor(options) {
    super(options);
    this.lines = options.lines;
    this.empty = options.empty ?? 'Nothing here';
    this.footer = options.footer ?? null;
    // how many lines it's scrolled down, and the line under the mouse (or -1)
    this.scroll = 0;
    this.under = -1;
  }

  // the space the lines go in
  listBox() {
    const top = this.contentTop() + 4;
    return { x: this.x + 4, y: top, w: this.w - 8, h: this.y + this.h - top - (this.footer ? 24 : 4) };
  }

  visibleRows() {
    return Math.floor(this.listBox().h / LIST_WINDOW_ROW);
  }

  update(hovered) {
    if (this.updateWindow(hovered)) return;
    const lines = this.lines();
    const box = this.listBox();
    const maxScroll = Math.max(0, lines.length - this.visibleRows());
    if (hovered && Input.wheel !== 0) {
      this.scroll += Math.sign(Input.wheel);
      // used up so the map behind doesn't zoom
      Input.wheel = 0;
    }
    this.scroll = constrain(this.scroll, 0, maxScroll);
    const { x, y } = Input.mouse;
    const row = Math.floor((y - box.y) / LIST_WINDOW_ROW) + this.scroll;
    const inside = hovered && x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
    this.under = inside && row < lines.length && lines[row].onClick ? row : -1;
    if (this.under >= 0 && Input.buttonsPressed.has('left')) lines[this.under].onClick();
  }

  draw() {
    this.drawWindow();
    const C = EDITOR_COLOURS;
    const lines = this.lines();
    const box = this.listBox();
    noStroke();
    if (lines.length === 0) {
      fill(C.dimText);
      setText(12, BOLD, LEFT, TOP);
      text(this.empty, box.x + 6, box.y + 4, box.w - 12, box.h);
    }
    const last = Math.min(lines.length, this.scroll + this.visibleRows());
    for (let i = this.scroll; i < last; i++) {
      const line = lines[i];
      const top = box.y + (i - this.scroll) * LIST_WINDOW_ROW;
      const middleY = top + LIST_WINDOW_ROW / 2;
      if (i === this.under) {
        fill(C.tabHover);
        rect(box.x, top, box.w, LIST_WINDOW_ROW, 3);
      }
      let right = box.x + box.w - 6;
      if (line.note) {
        fill(C.dimText);
        setText(11, BOLD, RIGHT, CENTER);
        text(line.note, right, middleY);
        right -= textWidth(line.note) + 10;
      }
      fill(line.colour ?? (line.onClick ? C.text : C.dimText));
      setText(12, BOLD, LEFT, CENTER);
      text(fitText(line.text, right - box.x - 6), box.x + 6, middleY);
    }
    // a scrollbar when they don't all fit
    const maxScroll = lines.length - this.visibleRows();
    if (maxScroll > 0) {
      const thumb = Math.max(16, (box.h * this.visibleRows()) / lines.length);
      fill('#5d6575');
      rect(box.x + box.w - 3, box.y + (box.h - thumb) * (this.scroll / maxScroll), 3, thumb, 2);
    }
    if (this.footer) {
      fill(C.dimText);
      setText(11, BOLD, LEFT, CENTER);
      text(fitText(this.footer(), this.w - 20), this.x + 10, this.y + this.h - 12);
    }
  }
}

// px for each line of a ListWindow
const LIST_WINDOW_ROW = 20;
