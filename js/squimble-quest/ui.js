// the ui system: anything on screen you can click or look at that sits on top of the game,
// like buttons, the hotbar's slots, number boxes and the map editor's bar and panels.
//
// two parts:
//   UIElement  the base every ui thing is built from. it has a position, a size, and can be
//              shown/hidden, enabled/disabled and put in a group. Button (button.js) builds on it
//   UI         keeps the list of elements, updates and draws them all, and works out which one
//              the mouse is over
//
// ui uses screen positions (see camera.js). the screen is always 960 x 540 however big the canvas
// looks on the page, so a button at x: 900 is always near the right edge.
// ui is drawn in the order it was added, so anything added later sits on top
//
// HOW TO USE BUTTONS: see the guide at the top of button.js
//
// making a new kind of ui element (a slider, an inventory slot, a text box...):
//   1. make a new file, e.g. slider.js, with   class Slider extends UIElement { ... }
//      "extends" means it gets everything UIElement has (position, size, visible, group...)
//   2. in its constructor, call super(options) first, then set up its own settings
//   3. give it an update(hovered) for what it does with the mouse, and a draw() for how it looks.
//      button.js is a good example to copy from
//   4. load it in squimble-quest.html after ui.js
//   5. use it like a button: UI.add(new Slider({ x: 20, y: 20, w: 200, h: 20 }))

class UIElement {
  // options is one object, so you only write the settings you need, in any order:
  //   new UIElement({ x: 10, y: 10, w: 100, h: 40, group: 'pause menu' })
  constructor(options = {}) {
    // top left corner and size, in screen pixels
    this.x = options.x ?? 0;
    this.y = options.y ?? 0;
    this.w = options.w ?? 0;
    this.h = options.h ?? 0;

    // hidden elements aren't drawn and can't be clicked
    this.visible = options.visible ?? true;
    // disabled elements are drawn faded and can't be clicked, but still block clicks to the game
    this.enabled = options.enabled ?? true;
    // false lets clicks go straight through to the game, e.g. for a label that's just for show
    this.interactive = options.interactive ?? true;
    // a name shared by elements that belong together, so they can be shown, hidden or
    // removed all at once, e.g. UI.showGroup('pause menu', false)
    this.group = options.group ?? null;

    // set by UI every frame: is the mouse over this element (and it's the top one)?
    this.hovered = false;
  }

  // is this screen point inside the element?
  contains(px, py) {
    return px >= this.x && px < this.x + this.w &&
           py >= this.y && py < this.y + this.h;
  }

  // run every frame by UI. hovered is whether the mouse is over this element.
  // elements that do things when clicked (like Button) replace this with their own
  update(hovered) {
    this.hovered = hovered;
  }

  // elements replace this with their own drawing
  draw() {}
}

const UI = {
  elements: [],
  // the element the mouse is over right now, or null
  hovered: null,

  // ---------- adding and removing ----------

  // adds an element and hands it back, so you can keep it: const play = UI.add(new Button({ ... }))
  add(element) {
    this.elements.push(element);
    return element;
  },

  remove(element) {
    this.elements = this.elements.filter((el) => el !== element);
  },

  // every element in a group
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

  // run before anything else in the game uses the mouse (see sketch.js)
  update() {
    const mouse = Input.mouse;
    this.hovered = null;

    // the mouse only counts while playing and while it's over the game.
    // checks from the end of the list, because later elements are drawn on top
    if (Input.focused && mouse.inside) {
      for (let i = this.elements.length - 1; i >= 0; i--) {
        const el = this.elements[i];
        if (el.visible && el.interactive && el.contains(mouse.x, mouse.y)) {
          this.hovered = el;
          break;
        }
      }
    }

    // a click that lands on the ui belongs to the ui. this stops the game seeing it too
    if (this.hovered && Input.buttonsPressed.size > 0) Input.claimMouse();

    // a copy of the list, in case clicking a button adds or removes elements
    for (const el of [...this.elements]) el.update(el === this.hovered);
  },

  // run every frame, after the world is drawn (see sketch.js).
  // UI.draw(true) also outlines every element, including invisible ones, which helps when
  // lining up invisible buttons over your art. green outlines, pink for the one under the mouse
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
      // pink for the one under the mouse, green for the rest
      stroke(el === this.hovered ? '#ff4fd8' : '#39d353');
      rect(el.x, el.y, el.w, el.h);
    }
  },
};
