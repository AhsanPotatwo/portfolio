// a clickable button, built on UIElement (ui.js).
//
// ============================== how to use buttons ==============================
//
// make them once in setup() (sketch.js) and UI takes care of hovering, clicking and drawing:
//   UI.add(new Button({ x: 20, y: 20, w: 120, h: 40, label: 'Play', onClick: () => startGame() }));
// x, y is the top left and w, h the size, in screen pixels (always 960 x 540). buttons added later
// draw on top.
//
// options (only x, y, w, h are needed):
//   label         text in the middle (works over images too)
//   onClick       (button) => { ... }
//   style         a BUTTON_STYLES name (config.js) like 'danger', or your own changes like
//                 { fill: '#ff00ff', radius: 0 }. anything you don't set comes from
//                 BUTTON_STYLES.default. if you'll reuse a style, add it to BUTTON_STYLES
//   image         a picture instead of a box. load it in preload() (sketch.js), like
//                 swordImg = loadImage('assets/squimble-quest/sword.png'). without a w and h it uses
//                 the picture's size. small pixel art scales up nice and crisp
//   hoverImage    picture while the mouse is over it (optional)
//   pressedImage  picture while it's held down (optional)
//   invisible     just an area you can click, like over a door in a bigger picture. UI.draw(true) in
//                 sketch.js outlines everything so you can line it up (change it back after)
//   toggle        flips button.on every click:
//                   new Button({ ..., label: 'Music', toggle: true, on: true, onClick: (b) => setMusic(b.on) })
//   on            whether a toggle starts on
//   enabled       false fades it out and stops it being clicked
//   visible       false hides it
//   group         a name shared with other elements: UI.showGroup('pause', false/true),
//                 UI.removeGroup('pause')
//
// UI.add() gives the button back, so keep it if you want to change it later: .enabled, .label,
// .visible, UI.remove(b).
//
// good to know:
//   - a click happens when you let go over the button, so dragging off it cancels the click
//   - clicks on buttons never reach the game (Input.mousePressed() stays false), so you don't need to
//     check for that
//   - disabled buttons still stop clicks reaching the game
//   - button.click() presses it from code (for keyboard shortcuts, say)
//
// ================================================================================
class Button extends UIElement {
  constructor(options = {}) {
    super(options);

    this.label = options.label ?? '';
    // gets passed the button, which is handy for toggles: (button) => button.on
    this.onClick = options.onClick ?? null;

    // a BUTTON_STYLES name or an object, put on top of BUTTON_STYLES.default
    const style = typeof options.style === 'string' ? BUTTON_STYLES[options.style] : options.style;
    this.style = { ...BUTTON_STYLES.default, ...style };

    // hover and pressed fall back to image if they aren't given
    this.image = options.image ?? null;
    this.hoverImage = options.hoverImage ?? null;
    this.pressedImage = options.pressedImage ?? null;
    // no size given, so use the image's
    if (this.image && options.w === undefined) this.w = this.image.width;
    if (this.image && options.h === undefined) this.h = this.image.height;

    this.invisible = options.invisible ?? false;

    this.toggle = options.toggle ?? false;
    this.on = options.on ?? false;

    // the mouse was pressed on it and is still held
    this.pressed = false;
  }

  // UI runs this every frame
  update(hovered) {
    // a disabled button never looks hovered or pressed
    this.hovered = hovered && this.enabled;

    if (!this.visible || !this.enabled) {
      this.pressed = false;
      return;
    }

    if (this.hovered && Input.buttonsPressed.has('left')) this.pressed = true;

    // let go: it's only a click if the mouse is still over it
    if (this.pressed && Input.buttonsReleased.has('left')) {
      this.pressed = false;
      if (this.hovered) this.click();
    }

    // like if focus was lost halfway through a press, so the release never got seen
    if (!Input.buttonsHeld.has('left')) this.pressed = false;
  }

  // can be called from code too
  click() {
    if (this.toggle) this.on = !this.on;
    if (this.onClick) this.onClick(this);
  }

  // ---------- drawing ----------

  draw() {
    if (this.invisible) return;

    // sinks down while it's held and the mouse is over it
    const y = this.y + (this.pressed && this.hovered ? this.style.pressOffset : 0);

    // push/pop keeps the fade to just this button. *= so it stacks on top of any fade that's already
    // there (like the editor's)
    push();
    if (!this.enabled) drawingContext.globalAlpha *= this.style.disabledAlpha;

    if (this.image) {
      this.drawImage(y);
    } else {
      this.drawBox(y);
    }
    if (this.label) this.drawLabel(y);

    pop();
  }

  drawBox(y) {
    const s = this.style;
    noStroke();
    if (s.borderWeight > 0) {
      stroke(s.border);
      strokeWeight(s.borderWeight);
    }
    fill(this.boxColour());
    rect(this.x, y, this.w, this.h, s.radius);
  }

  boxColour() {
    const s = this.style;
    if (this.pressed && this.hovered) return s.pressedFill;
    // a toggle that's on keeps onFill, just a bit lighter when hovered, so it still looks on
    if (this.toggle && this.on) return this.hovered ? lerpColor(color(s.onFill), color(255), 0.15) : s.onFill;
    if (this.hovered) return s.hoverFill;
    return s.fill;
  }

  drawImage(y) {
    let img = this.image;
    if (this.hovered && this.hoverImage) img = this.hoverImage;
    if (this.pressed && this.hovered && this.pressedImage) img = this.pressedImage;
    image(img, this.x, y, this.w, this.h);
  }

  drawLabel(y) {
    const s = this.style;
    noStroke();
    fill(s.textColour);
    setText(s.textSize, s.textStyle, CENTER, CENTER, s.font);
    text(this.label, this.x + this.w / 2, y + this.h / 2);
  }
}
