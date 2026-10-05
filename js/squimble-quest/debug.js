// dev mode: hidden tools for testing, turned on and off with ` (under Esc) or Ctrl + D. while it's on:
//   - a panel in the top left shows the fps, the map, the player's health and tile, and where the
//     player, the mouse (and its tile) and the camera are
//   - H shows or hides the list of keys under it (plus the editor's keys while that's open)
//   - the tile grid and (0, 0) lines show, and G hides them (handy for checking tiles while zooming)
//   - - and = zoom, and 0 resets it. in the editor the wheel zooms too, except over the palette, where
//     it scrolls instead (outside the editor the wheel changes hotbar slot)
//   - enemies show their ai and the route they've planned (pathfinding.js), and P hides them
//   - T teleports the player to the mouse (if it's somewhere you can stand)
//   - M goes to the next map (maps.js)
//   - B opens the map editor (editor.js)
// this browser remembers if it's on, so it stays on after reloading. players never see it unless they
// press the key.
//
// to add a new tool: a key in KEYS (config.js), a check in update() after
// "if (!this.enabled) return", and a line in DEV_KEYS

// how fast it zooms while a zoom key is held
const DEV_KEY_ZOOM_RATE = 1;
// how much it zooms for each bit the wheel turns
const DEV_WHEEL_ZOOM_RATE = 0.0015;
// the localStorage key it's saved under
const DEV_STORAGE_KEY = 'sq-dev-mode';
// the width of the top left panel, in screen px
const DEV_PANEL_WIDTH = 280;

// the list H shows. the editor adds EDITOR_KEYS (editor.js) on the end while it's open
const DEV_KEYS = [
  'DEV MODE KEYS',
  '` / Ctrl+D  dev mode on / off',
  '- = 0       zoom out, in, reset',
  'G           grid on / off',
  'P           enemy ai routes on / off',
  'T           teleport to mouse',
  'M           next map',
  'B           map editor',
];

const Debug = {
  enabled: false,
  // whether the key list is showing (H)
  showKeys: false,
  // whether the tile grid and (0, 0) lines are showing (G). sketch.js reads this
  showGrid: true,
  // whether the enemy ai labels and routes are showing (P). sketch.js reads this
  showPaths: true,
  // smoothed out so the number doesn't flicker
  fps: 60,

  // called once from setup()
  init() {
    // storage might be blocked, in which case dev mode just starts off
    try { this.enabled = localStorage.getItem(DEV_STORAGE_KEY) === 'on'; } catch (e) {}
  },

  toggle(player, camera) {
    this.enabled = !this.enabled;
    try { localStorage.setItem(DEV_STORAGE_KEY, this.enabled ? 'on' : 'off'); } catch (e) {}
    if (!this.enabled) {
      // the editor is part of dev mode so it closes too
      if (Editor.active) Editor.close(player, camera);
      // don't leave the game zoomed in or out
      camera.zoomTo(1);
    }
  },

  // every frame, before the player and camera update. aim is the mouse's world position or null
  update(player, camera, map, aim, dt) {
    if (Input.wasPressed('devMode')) this.toggle(player, camera);
    if (!this.enabled) return;

    if (Input.wasPressed('editor')) Editor.toggle(player, camera);
    if (Input.wasPressed('devKeys')) this.showKeys = !this.showKeys;
    if (Input.wasPressed('grid')) this.showGrid = !this.showGrid;
    if (Input.wasPressed('enemyPaths')) this.showPaths = !this.showPaths;

    this.fps = approach(this.fps, frameRate(), 4, dt);

    // multiplies rather than adds, so it feels the same at any zoom
    if (Input.isDown('zoomIn')) camera.zoomTo(camera.targetZoom * Math.exp(DEV_KEY_ZOOM_RATE * dt));
    if (Input.isDown('zoomOut')) camera.zoomTo(camera.targetZoom * Math.exp(-DEV_KEY_ZOOM_RATE * dt));
    // the wheel only zooms in the editor (otherwise the hotbar uses it). down zooms out, like map apps
    // do. not while a box is open, because the warp graph uses the wheel for its own zoom (warpgraph.js)
    if (Editor.active && !FormBox.active && !SoundEditor.active && Input.wheel !== 0) {
      camera.zoomTo(camera.targetZoom * Math.exp(-Input.wheel * DEV_WHEEL_ZOOM_RATE));
    }
    if (Input.wasPressed('zoomReset')) camera.zoomTo(1);

    // the next map in MAPS (maps.js), going back round to the first after the last
    if (Input.wasPressed('nextMap')) {
      const names = Object.keys(MAPS);
      const next = names[(names.indexOf(map.name) + 1) % names.length];
      loadMap(next); // in sketch.js
      return; // the old map's gone, so skip the other tools this frame
    }

    // puts the feet on the mouse. not onto solid or off-map tiles though, they'd be stuck
    if (Input.wasPressed('teleport') && aim && !map.isSolid(map.colAt(aim.x), map.rowAt(aim.y))) {
      player.x = aim.x;
      player.y = aim.y - feetBelowCentre(player.settings); // character.js
    }
  },

  // the top left panels, in screen positions (after camera.end()). it's monospace so padStart() and
  // spaces line things up
  draw(player, camera, map, aim) {
    if (!this.enabled) return;

    const mouse = aim ? `${formatPoint(aim)}  (${map.colAt(aim.x)}, ${map.rowAt(aim.y)})` : '-';
    const status = [
      `DEV MODE${`${Math.round(this.fps)} fps`.padStart(23)}`,
      `map     ${map.name}`,
      `player  ${formatPoint(player)}  hp ${Math.ceil(player.health)}/${PLAYER.maxHealth}`,
      `tile    ${player.tile ? `${player.tile.name} (${player.tileCol}, ${player.tileRow})` : '-'}`,
      `mouse   ${mouse}`,
      `camera  ${formatPoint(camera)}  zoom ${camera.zoom.toFixed(2)}`,
      `H  ${this.showKeys ? 'hide' : 'show'} keys`,
    ];
    // goes under the editor toolbar while that's open. drawPanel is in hud.js
    const top = Editor.active ? EDITOR_LAYOUT.toolbarHeight + 8 : 8;
    drawPanel(8, top, DEV_PANEL_WIDTH, status, 13);

    if (!this.showKeys) return;
    const keys = Editor.active ? [...DEV_KEYS, '', ...EDITOR_KEYS] : DEV_KEYS;
    drawPanel(8, top + panelHeight(status) + 8, DEV_PANEL_WIDTH, keys, 13);
  },
};

// turns { x: 12.345, y: -6.7 } into "12, -7"
function formatPoint(p) {
  return `${Math.round(p.x)}, ${Math.round(p.y)}`;
}
