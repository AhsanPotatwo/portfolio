// a clickable button, extending UIElement (ui.js).
//
// ============================== how to use buttons ==============================
//
// make them once in setup() (sketch.js); UI handles hover, click and drawing:
//   UI.add(new Button({ x: 20, y: 20, w: 120, h: 40, label: 'Play', onClick: () => startGame() }));
// x, y top left, w, h size, screen pixels (always 960 x 540). later buttons draw on top.
//
// options (only x, y, w, h needed):
//   label         centred text (works over images too)
//   onClick       (button) => { ... }
//   style         a BUTTON_STYLES name (config.js), e.g. 'danger', or overrides like
//                 { fill: '#ff00ff', radius: 0 }. unset settings come from BUTTON_STYLES.default;
//                 add reusable ones to BUTTON_STYLES
//   image         art instead of a box. load it in preload() (sketch.js), e.g.
//                 swordImg = loadImage('assets/squimble-quest/sword.png'). without w, h it uses the
//                 image's size; small pixel art scales up crisply
//   hoverImage    art while hovered (optional)
//   pressedImage  art while held (optional)
//   invisible     just a clickable area, e.g. over a door in a bigger picture. UI.draw(true) in
//                 sketch.js outlines everything for lining it up (put it back after)
//   toggle        flips button.on each click:
//                   new Button({ ..., label: 'Music', toggle: true, on: true, onClick: (b) => setMusic(b.on) })
//   on            a toggle's start state
//   enabled       false fades it and blocks clicking
//   visible       false hides it
//   group         shared name: UI.showGroup('pause', false/true), UI.removeGroup('pause')
//
// UI.add() returns the button, so keep it to change later: .enabled, .label, .visible, UI.remove(b).
//
// good to know:
//   - a click happens on release over the button; dragging off cancels it
//   - button clicks never reach the game (Input.mousePressed() stays false), no checks needed
//   - disabled buttons still block clicks to the game
//   - button.click() presses it from code (e.g. keyboard shortcuts)
//
// ================================================================================
class Button extends UIElement {
  constructor(options = {}) {
    super(options);

    this.label = options.label ?? '';
    // gets the button, handy for toggles: (button) => button.on
    this.onClick = options.onClick ?? null;

    // a BUTTON_STYLES name or an object, over BUTTON_STYLES.default
    const style = typeof options.style === 'string' ? BUTTON_STYLES[options.style] : options.style;
    this.style = { ...BUTTON_STYLES.default, ...style };

    // hover and pressed fall back to image
    this.image = options.image ?? null;
    this.hoverImage = options.hoverImage ?? null;
    this.pressedImage = options.pressedImage ?? null;
    // no size given: the image's
    if (this.image && options.w === undefined) this.w = this.image.width;
    if (this.image && options.h === undefined) this.h = this.image.height;

    this.invisible = options.invisible ?? false;

    this.toggle = options.toggle ?? false;
    this.on = options.on ?? false;

    // mouse held after pressing on it
    this.pressed = false;
  }

  // run every frame by UI
  update(hovered) {
    // disabled never looks hovered or pressed
    this.hovered = hovered && this.enabled;

    if (!this.visible || !this.enabled) {
      this.pressed = false;
      return;
    }

    if (this.hovered && Input.buttonsPressed.has('left')) this.pressed = true;

    // released: a click only if still over it
    if (this.pressed && Input.buttonsReleased.has('left')) {
      this.pressed = false;
      if (this.hovered) this.click();
    }

    // e.g. focus lost mid-press, so the release was never seen
    if (!Input.buttonsHeld.has('left')) this.pressed = false;
  }

  // also callable from code
  click() {
    if (this.toggle) this.on = !this.on;
    if (this.onClick) this.onClick(this);
  }

  // ---------- drawing ----------

  draw() {
    if (this.invisible) return;

    // sinks while held and hovered
    const y = this.y + (this.pressed && this.hovered ? this.style.pressOffset : 0);

    // push/pop contains the fade. *= so it stacks on existing fades (the editor's)
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
    // an on toggle keeps onFill, slightly lighter when hovered, so it still reads as on
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
