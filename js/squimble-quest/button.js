// a clickable button. builds on UIElement (ui.js), so it has x, y, w, h, visible, enabled and group too.
//
// three ways to draw one:
//   a box        drawn by the game, looks set by a style from BUTTON_STYLES in config.js
//   an image     your own pixel art, with optional different images for hover and pressed
//   invisible    draws nothing, just a clickable area. put it over art drawn somewhere else,
//                e.g. a door in a big background image
//
// examples:
//   UI.add(new Button({ x: 20, y: 20, w: 120, h: 40, label: 'Play', onClick: () => startGame() }));
//   UI.add(new Button({ x: 20, y: 70, w: 120, h: 40, label: 'Quit', style: 'danger' }));
//   UI.add(new Button({ x: 20, y: 120, w: 64, h: 64, image: swordImg, hoverImage: swordGlowImg }));
//   UI.add(new Button({ x: 300, y: 200, w: 80, h: 120, invisible: true, onClick: openDoor }));
//   UI.add(new Button({ x: 20, y: 200, w: 120, h: 40, label: 'Music', toggle: true, on: true,
//                       onClick: (button) => setMusic(button.on) }));
//
// the click happens when the mouse is let go over the button, like buttons everywhere else.
// press, change your mind and drag off, and nothing happens
class Button extends UIElement {
  constructor(options = {}) {
    // sets up x, y, w, h, visible, enabled, group (see UIElement in ui.js)
    super(options);

    this.label = options.label ?? '';
    // runs when the button is clicked. gets the button itself, handy for toggles: (button) => button.on
    this.onClick = options.onClick ?? null;

    // a name from BUTTON_STYLES (e.g. 'danger'), or an object of your own settings
    // (e.g. { fill: '#ff00ff', radius: 0 }). either way, only the settings given change,
    // everything else comes from BUTTON_STYLES.default
    const style = typeof options.style === 'string' ? BUTTON_STYLES[options.style] : options.style;
    this.style = { ...BUTTON_STYLES.default, ...style };

    // pixel art instead of a box. hover and pressed are optional, it falls back to image
    this.image = options.image ?? null;
    this.hoverImage = options.hoverImage ?? null;
    this.pressedImage = options.pressedImage ?? null;
    // no size given with an image, use the image's own size
    if (this.image && options.w === undefined) this.w = this.image.width;
    if (this.image && options.h === undefined) this.h = this.image.height;

    this.invisible = options.invisible ?? false;

    // a toggle flips between on and off each click, and remembers which it's on
    this.toggle = options.toggle ?? false;
    this.on = options.on ?? false;

    // true while the mouse is held down after pressing on this button
    this.pressed = false;
  }

  // run every frame by UI
  update(hovered) {
    // a disabled button never looks hovered or pressed
    this.hovered = hovered && this.enabled;

    if (!this.visible || !this.enabled) {
      this.pressed = false;
      return;
    }

    // the mouse went down on this button
    if (this.hovered && Input.buttonsPressed.has('left')) this.pressed = true;

    // and came back up. only counts as a click if it's still over the button
    if (this.pressed && Input.buttonsReleased.has('left')) {
      this.pressed = false;
      if (this.hovered) this.click();
    }

    // e.g. clicked away from the game mid-press, so the release was never seen
    if (!Input.buttonsHeld.has('left')) this.pressed = false;
  }

  // what a click does. can also be called from code to press the button without the mouse
  click() {
    if (this.toggle) this.on = !this.on;
    if (this.onClick) this.onClick(this);
  }

  // ---------- drawing ----------

  draw() {
    if (this.invisible) return;

    // sinks a little while held down (only while the mouse is still over it)
    const y = this.y + (this.pressed && this.hovered ? this.style.pressOffset : 0);

    // push/pop keeps the fading below from affecting anything drawn after the button
    push();
    if (!this.enabled) drawingContext.globalAlpha = this.style.disabledAlpha;

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

  // which colour the box should be right now
  boxColour() {
    const s = this.style;
    if (this.pressed && this.hovered) return s.pressedFill;
    // a toggle that's on keeps its on colour, just a bit lighter when hovered,
    // so you can still tell it's on
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
    textFont(s.font);
    textStyle(s.textStyle);
    textSize(s.textSize);
    textAlign(CENTER, CENTER);
    text(this.label, this.x + this.w / 2, y + this.h / 2);
  }
}
