// the ui system: anything you can click or see on top of the game (buttons, hotbar slots, number
// boxes, the editor's bars and panels).
//   UIElement  the base class: position, size, shown/hidden, enabled/disabled and group. Button
//              (button.js) is built on it
//   UI         the list of elements. it updates them, draws them and finds the one under the mouse
// everything uses screen positions (camera.js), which are always 960 x 540, so x: 900 is always near
// the right edge. they're drawn in the order they were added, so later ones go on top. for buttons
// see button.js.
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
