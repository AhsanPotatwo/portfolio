// a clickable button. builds on UIElement (ui.js), so it has x, y, w, h, visible, enabled and group too.
//
// ============================== how to use buttons ==============================
//
// 1. MAKING ONE
//    make buttons once, in setup() in sketch.js (where the "ui" comment is). UI.add() puts it
//    on screen, and UI does the rest every frame: hovering, clicking, drawing.
//
//      UI.add(new Button({ x: 20, y: 20, w: 120, h: 40, label: 'Play', onClick: () => startGame() }));
//
//    x, y is the top left corner and w, h the size, in screen pixels. the screen is always
//    960 x 540, so x: 900 is always near the right edge however big the game looks on the page.
//    buttons added later are drawn on top of earlier ones.
//
// 2. ALL THE OPTIONS (only x, y, w, h are needed, leave out anything you don't use)
//      label         text in the middle
//      onClick       what happens when it's clicked. it's given the button: (button) => { ... }
//      style         how a box button looks, see step 3
//      image         your own art instead of a box, see step 4
//      hoverImage    art while the mouse is over it (optional)
//      pressedImage  art while it's held down (optional)
//      invisible     true draws nothing, just a clickable area, see step 5
//      toggle        true makes it flip on/off each click, see step 6
//      on            whether a toggle starts on
//      enabled       false fades it out and stops it being clicked
//      visible       false hides it completely
//      group         a name for buttons that belong together, see step 7
//
// 3. STYLES (for buttons drawn as boxes)
//    pick one by name from BUTTON_STYLES in config.js:  style: 'danger'
//    or change just a few things:                       style: { fill: '#ff00ff', radius: 0 }
//    anything you don't set comes from BUTTON_STYLES.default. to make a reusable style,
//    add it to BUTTON_STYLES and give it a name.
//
// 4. YOUR OWN PIXEL ART
//    load images in preload() in sketch.js (p5 runs it before setup, so the images are ready):
//
//      let swordImg;
//      function preload() {
//        swordImg = loadImage('assets/squimble-quest/sword.png');
//      }
//
//    then in setup():
//
//      UI.add(new Button({ x: 20, y: 400, w: 64, h: 64, image: swordImg, onClick: equipSword }));
//
//    leave out w and h to use the image's own size. small pixel art can be drawn bigger
//    (a 16px image at w: 64, h: 64) and stays crisp. the label still works on top of an image.
//
// 5. INVISIBLE BUTTONS
//    for when the art is drawn somewhere else, e.g. a door that's part of a big picture.
//    draw the picture as normal, then put an invisible button over the part to click:
//
//      UI.add(new Button({ x: 300, y: 200, w: 80, h: 120, invisible: true, onClick: openDoor }));
//
//    to see where it is while lining it up, change UI.draw() in sketch.js to UI.draw(true),
//    which outlines every button (put it back after)
//
// 6. TOGGLES
//    flip between on and off each click. button.on says which:
//
//      UI.add(new Button({ x: 20, y: 20, w: 120, h: 40, label: 'Music', toggle: true, on: true,
//                          onClick: (button) => setMusic(button.on) }));
//
// 7. CHANGING BUTTONS LATER
//    UI.add() hands the button back, so keep it in a variable to change it later:
//
//      const saveButton = UI.add(new Button({ ..., enabled: false }));
//      saveButton.enabled = true;       // can be clicked now
//      saveButton.label = 'Saved!';
//      saveButton.visible = false;      // hidden
//      UI.remove(saveButton);           // gone for good
//
//    or give buttons that belong together the same group, and handle them all at once:
//
//      UI.add(new Button({ ..., label: 'Resume', group: 'pause' }));
//      UI.add(new Button({ ..., label: 'Quit', group: 'pause' }));
//      UI.showGroup('pause', false);    // hide the whole pause menu
//      UI.showGroup('pause', true);     // show it again
//      UI.removeGroup('pause');         // get rid of it
//
// 8. GOOD TO KNOW
//    - a click happens when the mouse is let go over the button, like buttons everywhere else.
//      press, change your mind and drag off, and nothing happens
//    - clicks on buttons never reach the game. Input.mousePressed('left') etc. stay false,
//      so clicking a menu button won't swing a sword. no need to check for it yourself
//    - disabled buttons still block clicks to the game, they just don't do anything
//    - button.click() presses it from code, e.g. for a keyboard shortcut
//
// ================================================================================
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
