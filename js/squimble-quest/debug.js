// developer mode: testing tools that stay hidden until you want them.
// press ` (the key under Esc) or Ctrl + D while playing to switch it on or off.
//
// while it's on:
//   - a panel in the top left shows fps, which map you're on, the player's health and tile,
//     and where the player, mouse and camera are
//   - the tile grid and lines through (0, 0) show on the world
//   - - and = zoom, 0 resets the zoom. in the map editor the mouse wheel zooms too
//     (the rest of the time the wheel changes hotbar slot)
//   - T teleports the player to the mouse (if it's pointing at somewhere you can stand)
//   - M goes to the next map (the maps are listed in maps.js)
//   - B opens the map editor (see editor.js)
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
  },

  toggle(player, camera) {
    this.enabled = !this.enabled;
    try { localStorage.setItem(DEV_STORAGE_KEY, this.enabled ? 'on' : 'off'); } catch (e) {}
    if (!this.enabled) {
      // the editor is part of dev mode, so it closes too
      if (Editor.active) Editor.close(player, camera);
      // don't leave the game zoomed in or out once the tools are put away
      camera.zoomTo(1);
    }
  },

  // run every frame, before the player and camera update. aim is the mouse's world position, or null
  update(player, camera, map, aim, dt) {
    if (Input.wasPressed('devMode')) this.toggle(player, camera);
    if (!this.enabled) return;

    if (Input.wasPressed('editor')) Editor.toggle(player, camera);

    this.fps = approach(this.fps, frameRate(), 4, dt);

    // zooming multiplies rather than adds, so it feels the same speed zoomed in or out.
    // Math.exp(rate * dt) is just over 1, Math.exp(-rate * dt) just under
    if (Input.isDown('zoomIn')) camera.zoomTo(camera.targetZoom * Math.exp(DEV_KEY_ZOOM_RATE * dt));
    if (Input.isDown('zoomOut')) camera.zoomTo(camera.targetZoom * Math.exp(-DEV_KEY_ZOOM_RATE * dt));
    // the wheel zooms in the map editor (the rest of the time it's for the hotbar).
    // wheel down (positive) zooms out, like most map apps
    if (Editor.active && Input.wheel !== 0) {
      camera.zoomTo(camera.targetZoom * Math.exp(-Input.wheel * DEV_WHEEL_ZOOM_RATE));
    }
    if (Input.wasPressed('zoomReset')) camera.zoomTo(1);

    // goes to the next map in MAPS (maps.js), back to the first after the last
    if (Input.wasPressed('nextMap')) {
      const names = Object.keys(MAPS);
      const next = names[(names.indexOf(map.name) + 1) % names.length];
      loadMap(next); // in sketch.js
      return; // the old map is gone, so skip the rest of this frame's tools
    }

    // puts the player's feet on the mouse. not onto solid tiles or off the map, they'd be stuck
    if (Input.wasPressed('teleport') && aim && !map.isSolid(map.colAt(aim.x), map.rowAt(aim.y))) {
      player.x = aim.x;
      player.y = aim.y - feetBelowCentre(player.settings); // character.js
    }
  },

  // the panel in the top left. uses screen positions, so draw it after camera.end()
  draw(player, camera, map, aim) {
    if (!this.enabled) return;

    const held = player.inventory.held();
    const lines = [
      'DEV MODE     ` or Ctrl+D to hide',
      `fps     ${Math.round(this.fps)}`,
      `map     ${map.name}`,
      `player  ${formatPoint(player)}`,
      `health  ${Math.ceil(player.health)} / ${PLAYER.maxHealth}`,
      `holding ${held ? held.type.name : 'nothing'}`,
      `tile    ${player.tile ? `${player.tile.name} (${player.tileCol}, ${player.tileRow})` : '-'}`,
      `mouse   ${aim ? formatPoint(aim) : '-'}`,
      `camera  ${formatPoint(camera)}  zoom ${camera.zoom.toFixed(2)}`,
      '',
      '- =  zoom   0  reset',
      'T  teleport to mouse',
      'M  next map',
      'B  map editor',
    ];

    // hud.js
    drawPanel(8, 8, 300, lines, 14);
  },
};

// { x: 12.345, y: -6.7 } → "12, -7"
function formatPoint(p) {
  return `${Math.round(p.x)}, ${Math.round(p.y)}`;
}
