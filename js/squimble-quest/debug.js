// developer mode: testing tools that stay hidden until you want them.
// press ` (the key under Esc) while playing to switch it on or off.
//
// while it's on:
//   - a panel in the top left shows fps and where the player, mouse and camera are
//     (click its title to fold it away)
//   - buttons in the top right (see createButtons() below)
//   - - and = (or the mouse wheel) zoom, 0 resets the zoom
//   - T teleports the player to the mouse
//
// it's remembered in this browser, so it stays on when you reload while working on the game.
// players never see any of it unless they press the key.
//
// to add a new tool: give it a key in KEYS in config.js, check for it in update() below
// (after the "if (!this.enabled) return"), and add a line to the help in draw().
// or add a button for it in createButtons()

// false hides the dev mode buttons (the rest of dev mode still works)
const DEV_BUTTONS = true;
// how fast holding a zoom key zooms
const DEV_KEY_ZOOM_RATE = 1;
// how much one notch of the mouse wheel zooms
const DEV_WHEEL_ZOOM_RATE = 0.0015;
// name it's saved under in the browser
const DEV_STORAGE_KEY = 'sq-dev-mode';

const Debug = {
  enabled: false,
  // smoothed, so the number doesn't flicker every frame
  fps: 60,
  // switched by the dev buttons
  showAxes: true,
  showHitboxes: false,
  // the panel folded down to just its title
  collapsed: false,

  // call once from setup(), after the player and camera exist
  init(player, camera) {
    // browser storage can be switched off or blocked, in which case dev mode just starts off
    try { this.enabled = localStorage.getItem(DEV_STORAGE_KEY) === 'on'; } catch (e) {}
    Input.captureWheel = this.enabled;

    if (DEV_BUTTONS) this.createButtons(player, camera);
    UI.showGroup('dev', this.enabled);
  },

  toggle(camera) {
    this.enabled = !this.enabled;
    try { localStorage.setItem(DEV_STORAGE_KEY, this.enabled ? 'on' : 'off'); } catch (e) {}
    // the wheel only zooms in dev mode, the rest of the time it scrolls the page like normal
    Input.captureWheel = this.enabled;
    UI.showGroup('dev', this.enabled);
    // don't leave the game zoomed in or out once the tools are put away
    if (!this.enabled) camera.zoomTo(1);
  },

  // the dev buttons, down the top right. they're handy, and they show off each kind of button.
  // all in the 'dev' group, so they show and hide with dev mode in one go
  createButtons(player, camera) {
    // the column's left edge, 150 wide with an 8px gap from the right of the screen
    const col = GAME_W - 8 - 150;
    // every button here is in the 'dev' group, so this saves writing it each time
    const add = (options) => UI.add(new Button({ group: 'dev', ...options }));

    // plain buttons, different sizes. the default style
    add({ x: col, y: 8, w: 36, h: 36, label: '−', onClick: () => camera.zoomTo(camera.targetZoom / 1.25) });
    add({ x: col + 42, y: 8, w: 36, h: 36, label: '+', onClick: () => camera.zoomTo(camera.targetZoom * 1.25) });
    // a different style, picked by name from BUTTON_STYLES
    add({ x: col + 84, y: 8, w: 66, h: 36, label: 'Reset', style: 'danger', onClick: () => camera.zoomTo(1) });

    // toggles. button.on flips each click, and onClick reads it
    add({
      x: col, y: 52, w: 150, h: 32, label: 'Centre lines',
      toggle: true, on: this.showAxes,
      onClick: (button) => { this.showAxes = button.on; },
    });
    add({
      x: col, y: 90, w: 150, h: 32, label: 'Hitboxes',
      toggle: true, on: this.showHitboxes,
      onClick: (button) => { this.showHitboxes = button.on; },
    });

    // pixel art. a 12x12 image drawn 4x bigger, with a different image on hover.
    // yours would come from loadImage('assets/...png') instead of makePixelArt()
    add({
      x: col, y: 130, w: 48, h: 48,
      image: makePixelArt(HOME_ICON, HOME_COLOURS),
      hoverImage: makePixelArt(HOME_ICON, { ...HOME_COLOURS, R: '#e86a6a' }),
      onClick: () => { player.x = 0; player.y = 0; },
    });

    // disabled, can't be clicked until something sets button.enabled = true
    add({ x: col, y: 186, w: 150, h: 32, label: 'Save map', style: 'primary', enabled: false });

    // invisible, over the panel's title (which draw() below draws itself). clicking it folds the panel
    add({ x: 8, y: 8, w: 300, h: 26, invisible: true, onClick: () => { this.collapsed = !this.collapsed; } });
  },

  // run every frame, before the player and camera update. aim is the mouse's world position, or null
  update(player, camera, aim, dt) {
    if (Input.wasPressed('devMode')) this.toggle(camera);
    if (!this.enabled) return;

    this.fps = approach(this.fps, frameRate(), 4, dt);

    // zooming multiplies rather than adds, so it feels the same speed zoomed in or out.
    // Math.exp(rate * dt) is just over 1, Math.exp(-rate * dt) just under
    if (Input.isDown('zoomIn')) camera.zoomTo(camera.targetZoom * Math.exp(DEV_KEY_ZOOM_RATE * dt));
    if (Input.isDown('zoomOut')) camera.zoomTo(camera.targetZoom * Math.exp(-DEV_KEY_ZOOM_RATE * dt));
    // wheel down (positive) zooms out, like most map apps
    if (Input.wheel !== 0) camera.zoomTo(camera.targetZoom * Math.exp(-Input.wheel * DEV_WHEEL_ZOOM_RATE));
    if (Input.wasPressed('zoomReset')) camera.zoomTo(1);

    // player.move() keeps them inside the world, so teleporting past the edge is fine
    if (Input.wasPressed('teleport') && aim) {
      player.x = aim.x;
      player.y = aim.y;
    }
  },

  // the panel in the top left. uses screen positions, so draw it after camera.end()
  draw(player, camera, aim) {
    if (!this.enabled) return;

    // the title is clickable, see the invisible button in createButtons()
    const lines = [`DEV MODE [${this.collapsed ? '+' : '-'}]         \` to hide`];
    if (!this.collapsed) {
      lines.push(
        `fps     ${Math.round(this.fps)}`,
        `player  ${formatPoint(player)}`,
        `mouse   ${aim ? formatPoint(aim) : '-'}`,
        `camera  ${formatPoint(camera)}  zoom ${camera.zoom.toFixed(2)}`,
        '',
        '- = / wheel  zoom   0  reset',
        'T  teleport to mouse',
      );
    }

    const lineHeight = 18;
    noStroke();
    fill(0, 0, 0, 160);
    rect(8, 8, 300, lines.length * lineHeight + 12, 6);

    fill(255);
    // courier prime is already loaded by the page. monospace so the numbers don't jiggle about
    textFont('Courier Prime');
    textStyle(NORMAL);
    textSize(14);
    textAlign(LEFT, TOP);
    lines.forEach((row, i) => text(row, 16, 14 + i * lineHeight));

    // label for the pixel art button, drawn separately. buttons don't have to hold all their own text
    if (DEV_BUTTONS && !this.collapsed) {
      textFont('Quicksand');
      textStyle(BOLD);
      textAlign(LEFT, CENTER);
      fill(40);
      text('← go to 0, 0', GAME_W - 8 - 150 + 56, 154);
    }
  },
};

// { x: 12.345, y: -6.7 } → "12, -7"
function formatPoint(p) {
  return `${Math.round(p.x)}, ${Math.round(p.y)}`;
}

// ---------- stand-in pixel art for the demo button ----------

// a tiny house, one letter per pixel. . is see-through, the rest are colours below
const HOME_ICON = [
  '.....KK.....',
  '....KRRK....',
  '...KRRRRK...',
  '..KRRRRRRK..',
  '.KRRRRRRRRK.',
  'KKKKKKKKKKKK',
  '.KWWWWWWWWK.',
  '.KWBBWWDDWK.',
  '.KWBBWWDDWK.',
  '.KWWWWWDDWK.',
  '.KWWWWWDDWK.',
  '.KKKKKKKKKK.',
];
const HOME_COLOURS = { K: '#1d1d26', R: '#c94545', W: '#f2e6c9', B: '#6fb3e0', D: '#7a4a2a' };

// turns rows of letters into an image, one pixel per letter. only for the demo,
// real pixel art is easier to make in an art program and load with loadImage()
function makePixelArt(rows, colours) {
  const img = createGraphics(rows[0].length, rows.length);
  // 1 pixel of art = 1 pixel of image, even on high resolution screens
  img.pixelDensity(1);
  img.noStroke();
  rows.forEach((row, y) => {
    [...row].forEach((letter, x) => {
      if (!colours[letter]) return;
      img.fill(colours[letter]);
      img.rect(x, y, 1, 1);
    });
  });
  return img;
}
