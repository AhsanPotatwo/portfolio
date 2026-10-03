// the ui system: clickable or visible things over the game (buttons, hotbar slots, number boxes,
// the editor's bars and panels).
//   UIElement  base class: position, size, shown/hidden, enabled/disabled, group. Button (button.js) extends it
//   UI         the element list: updates, draws, finds the hovered one
// screen positions (camera.js), always 960 x 540, so x: 900 is always near the right edge. drawn in
// add order, later on top. buttons: see button.js.
//
// a new element kind (slider, slot, text box...):
//   1. a new file, e.g. slider.js: class Slider extends UIElement { ... }
//   2. constructor calls super(options) first
//   3. update(hovered) for mouse behaviour, draw() for looks (copy button.js)
//   4. load it in squimble-quest.html after ui.js
//   5. UI.add(new Slider({ x: 20, y: 20, w: 200, h: 20 }))

class UIElement {
  // one options object, any order: new UIElement({ x: 10, y: 10, w: 100, h: 40, group: 'pause menu' })
  constructor(options = {}) {
    // top left and size, screen pixels
    this.x = options.x ?? 0;
    this.y = options.y ?? 0;
    this.w = options.w ?? 0;
    this.h = options.h ?? 0;

    // hidden: not drawn or clickable
    this.visible = options.visible ?? true;
    // disabled: faded, not clickable, but still blocks clicks to the game
    this.enabled = options.enabled ?? true;
    // false lets clicks through to the game (show-only labels)
    this.interactive = options.interactive ?? true;
    // shared name for showing/hiding/removing together, e.g. UI.showGroup('pause menu', false)
    this.group = options.group ?? null;

    // set by UI each frame: mouse over it, and it's the top one
    this.hovered = false;
  }

  contains(px, py) {
    return px >= this.x && px < this.x + this.w &&
           py >= this.y && py < this.y + this.h;
  }

  // run every frame by UI; clickable elements (Button) override it
  update(hovered) {
    this.hovered = hovered;
  }

  // overridden by elements
  draw() {}
}

const UI = {
  elements: [],
  // element under the mouse, or null
  hovered: null,

  // ---------- adding and removing ----------

  // returns the element to keep: const play = UI.add(new Button({ ... }))
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

  // before anything else uses the mouse (sketch.js)
  update() {
    const mouse = Input.mouse;
    this.hovered = null;

    // only while focused and over the game. last first, since later elements are on top
    if (Input.focused && mouse.inside) {
      for (let i = this.elements.length - 1; i >= 0; i--) {
        const el = this.elements[i];
        if (el.visible && el.interactive && el.contains(mouse.x, mouse.y)) {
          this.hovered = el;
          break;
        }
      }
    }

    // a click on ui is hidden from the game
    if (this.hovered && Input.buttonsPressed.size > 0) Input.claimMouse();

    // a copy, in case a click adds or removes elements
    for (const el of [...this.elements]) el.update(el === this.hovered);
  },

  // after the world is drawn (sketch.js). UI.draw(true) outlines every element, invisible ones too,
  // for lining up invisible buttons: green, pink for the hovered one
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
