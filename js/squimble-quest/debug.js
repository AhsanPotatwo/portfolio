// developer mode: testing tools that stay hidden until you want them.
// press ` (the key under Esc) while playing to switch it on or off.
//
// while it's on:
//   - a panel in the top left shows fps and where the player, mouse and camera are
//   - the lines through (0, 0) show on the world
//   - - and = (or the mouse wheel) zoom, 0 resets the zoom
//   - T teleports the player to the mouse
//
// it's remembered in this browser, so it stays on when you reload while working on the game.
// players never see any of it unless they press the key.
//
// to add a new tool: give it a key in KEYS in config.js, check for it in update() below
// (after the "if (!this.enabled) return"), and add a line to the help in draw()

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

  // call once from setup()
  init() {
    // browser storage can be switched off or blocked, in which case dev mode just starts off
    try { this.enabled = localStorage.getItem(DEV_STORAGE_KEY) === 'on'; } catch (e) {}
    Input.captureWheel = this.enabled;
  },

  toggle(camera) {
    this.enabled = !this.enabled;
    try { localStorage.setItem(DEV_STORAGE_KEY, this.enabled ? 'on' : 'off'); } catch (e) {}
    // the wheel only zooms in dev mode, the rest of the time it scrolls the page like normal
    Input.captureWheel = this.enabled;
    // don't leave the game zoomed in or out once the tools are put away
    if (!this.enabled) camera.zoomTo(1);
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

    const lines = [
      'DEV MODE           ` to hide',
      `fps     ${Math.round(this.fps)}`,
      `player  ${formatPoint(player)}`,
      `mouse   ${aim ? formatPoint(aim) : '-'}`,
      `camera  ${formatPoint(camera)}  zoom ${camera.zoom.toFixed(2)}`,
      '',
      '- = / wheel  zoom   0  reset',
      'T  teleport to mouse',
    ];

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
  },
};

// { x: 12.345, y: -6.7 } → "12, -7"
function formatPoint(p) {
  return `${Math.round(p.x)}, ${Math.round(p.y)}`;
}
