// dev mode: hidden testing tools, toggled with ` (under Esc) or Ctrl + D. while on:
//   - top left panel: fps, map, player health and tile, player/mouse (and its tile)/camera positions
//   - H toggles the key list below it (plus the editor's keys while it's open)
//   - the tile grid and (0, 0) lines show; G hides them (e.g. to check tiles while zooming)
//   - - and = zoom, 0 resets. in the editor the wheel zooms too, except over the palette, which it
//     scrolls (otherwise the wheel changes hotbar slot)
//   - enemies show their ai and planned route (pathfinding.js); P hides them
//   - T teleports the player to the mouse (if standable)
//   - M next map (maps.js)
//   - B map editor (editor.js)
// remembered in this browser, so it survives reloads. players never see it unless they press the key.
//
// a new tool: a key in KEYS (config.js), a check in update() after "if (!this.enabled) return", and
// a DEV_KEYS line

// zoom speed while a zoom key is held
const DEV_KEY_ZOOM_RATE = 1;
// zoom per wheel unit
const DEV_WHEEL_ZOOM_RATE = 0.0015;
// localStorage key
const DEV_STORAGE_KEY = 'sq-dev-mode';
// top left panel width, screen px
const DEV_PANEL_WIDTH = 280;

// H's list. the editor appends EDITOR_KEYS (editor.js) while open
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
  // key list showing (H)
  showKeys: false,
  // tile grid and (0, 0) lines showing (G); read by sketch.js
  showGrid: true,
  // enemy ai labels and routes showing (P); read by sketch.js
  showPaths: true,
  // smoothed so it doesn't flicker
  fps: 60,

  // once from setup()
  init() {
    // storage may be blocked; then dev mode just starts off
    try { this.enabled = localStorage.getItem(DEV_STORAGE_KEY) === 'on'; } catch (e) {}
  },

  toggle(player, camera) {
    this.enabled = !this.enabled;
    try { localStorage.setItem(DEV_STORAGE_KEY, this.enabled ? 'on' : 'off'); } catch (e) {}
    if (!this.enabled) {
      // the editor is part of dev mode
      if (Editor.active) Editor.close(player, camera);
      // don't leave the game zoomed
      camera.zoomTo(1);
    }
  },

  // every frame, before the player and camera update. aim: mouse world position or null
  update(player, camera, map, aim, dt) {
    if (Input.wasPressed('devMode')) this.toggle(player, camera);
    if (!this.enabled) return;

    if (Input.wasPressed('editor')) Editor.toggle(player, camera);
    if (Input.wasPressed('devKeys')) this.showKeys = !this.showKeys;
    if (Input.wasPressed('grid')) this.showGrid = !this.showGrid;
    if (Input.wasPressed('enemyPaths')) this.showPaths = !this.showPaths;

    this.fps = approach(this.fps, frameRate(), 4, dt);

    // multiplicative, so it feels the same at any zoom
    if (Input.isDown('zoomIn')) camera.zoomTo(camera.targetZoom * Math.exp(DEV_KEY_ZOOM_RATE * dt));
    if (Input.isDown('zoomOut')) camera.zoomTo(camera.targetZoom * Math.exp(-DEV_KEY_ZOOM_RATE * dt));
    // wheel zoom in the editor only (otherwise it's the hotbar's). down zooms out, like map apps. not
    // while a box is open: the warp graph zooms itself with it (warpgraph.js)
    if (Editor.active && !FormBox.active && Input.wheel !== 0) {
      camera.zoomTo(camera.targetZoom * Math.exp(-Input.wheel * DEV_WHEEL_ZOOM_RATE));
    }
    if (Input.wasPressed('zoomReset')) camera.zoomTo(1);

    // next in MAPS (maps.js), wrapping
    if (Input.wasPressed('nextMap')) {
      const names = Object.keys(MAPS);
      const next = names[(names.indexOf(map.name) + 1) % names.length];
      loadMap(next); // in sketch.js
      return; // the old map is gone, skip the other tools this frame
    }

    // feet on the mouse; not onto solid or off-map tiles, where they'd be stuck
    if (Input.wasPressed('teleport') && aim && !map.isSolid(map.colAt(aim.x), map.rowAt(aim.y))) {
      player.x = aim.x;
      player.y = aim.y - feetBelowCentre(player.settings); // character.js
    }
  },

  // top left panels, screen positions (after camera.end()). monospace, so padStart() and spaces align
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
    // below the editor toolbar while it's open. drawPanel is in hud.js
    const top = Editor.active ? EDITOR_LAYOUT.toolbarHeight + 8 : 8;
    drawPanel(8, top, DEV_PANEL_WIDTH, status, 13);

    if (!this.showKeys) return;
    const keys = Editor.active ? [...DEV_KEYS, '', ...EDITOR_KEYS] : DEV_KEYS;
    drawPanel(8, top + panelHeight(status) + 8, DEV_PANEL_WIDTH, keys, 13);
  },
};

// { x: 12.345, y: -6.7 } → "12, -7"
function formatPoint(p) {
  return `${Math.round(p.x)}, ${Math.round(p.y)}`;
}
