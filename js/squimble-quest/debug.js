// dev mode: hidden tools for testing, turned on and off with ` (under Esc) or Ctrl + D. players never
// see it unless they press the key, and this browser remembers if it's on. while it's on:
//   - the info panel in the top left shows what's going on: the fps, the map, the player, the mouse...
//   - H (or Dev in the editor's toolbar) opens the dev menu. it picks what the info panel and the map
//     show, has buttons for the tools, and lists every dev key (and the editor's while that's open).
//     what's picked is remembered too
//   - G and P flip the tile grid and the enemy ai routes (pathfinding.js) without opening the menu
//   - - and = zoom, and 0 resets it. in the editor the wheel zooms too, except over the palette, where
//     it scrolls instead (outside the editor the wheel changes hotbar slot)
//   - T teleports the player to the mouse (if it's somewhere you can stand)
//   - M goes to the next map (maps.js), and B opens the map editor (editor.js)
//
// to add something:
//   - a readout: a line in DEV_INFO
//   - something drawn on the map that can be turned on and off: a line in DEV_OVERLAYS, and
//     Debug.shows('its name') wherever it gets drawn
//   - a tool: a key in KEYS (config.js), a check in update() after "if (!this.enabled) return", and a
//     line in DEV_TOOLS so the menu lists it

// how fast it zooms while a zoom key is held
const DEV_KEY_ZOOM_RATE = 1;
// how much it zooms for each bit the wheel turns
const DEV_WHEEL_ZOOM_RATE = 0.0015;
// the localStorage keys for whether it's on, and what's picked in the menu
const DEV_STORAGE_KEY = 'sq-dev-mode';
const DEV_SHOW_STORAGE_KEY = 'sq-dev-show';

// the info panel's sections, top to bottom, which the menu can show or hide. on is whether it shows
// before you've picked. lines(state) gives back [label, value, colour?] for each line, where state is
// { player, camera, map, aim } (aim is the mouse's world position or null). enemies is the game's
// (sketch.js)
const DEV_INFO = [
  {
    name: 'fps', label: 'Frame rate', note: 'fps, ms', on: true,
    lines: () => [['fps', `${Math.round(Debug.fps)}  ${(1000 / Debug.fps).toFixed(1)} ms`, fpsColour(Debug.fps)]],
  },
  {
    name: 'map', label: 'Map', note: 'name, size', on: true,
    lines: ({ map }) => [['map', `${map.name}  ${map.cols} × ${map.rows}`]],
  },
  {
    name: 'player', label: 'Player', note: 'where, health, tile', on: true,
    lines: ({ player }) => [
      ['player', formatPoint(player)],
      ['health', `${Math.ceil(player.health)} / ${PLAYER.maxHealth}`],
      ['tile', player.tile ? `${player.tile.name}  (${player.tileCol}, ${player.tileRow})` : '-'],
    ],
  },
  {
    name: 'mouse', label: 'Mouse', note: 'where, tile', on: true,
    lines: ({ map, aim }) => {
      if (!aim) return [['mouse', '-']];
      const col = map.colAt(aim.x);
      const row = map.rowAt(aim.y);
      const tile = map.inside(col, row) ? map.get(col, row)?.name ?? 'empty' : 'off the map';
      return [['mouse', formatPoint(aim)], ['tile', `${tile}  (${col}, ${row})`]];
    },
  },
  {
    name: 'camera', label: 'Camera', note: 'where, zoom', on: false,
    lines: ({ camera }) => [['camera', formatPoint(camera)], ['zoom', `${Math.round(camera.zoom * 100)}%`]],
  },
  {
    name: 'enemies', label: 'Enemies', note: 'how many, chasing', on: false,
    lines: () => {
      const here = enemies.filter((enemy) => !enemy.dead);
      // followers are on their way through a warp (warps.js)
      const following = Warps.followers.length > 0 ? `, ${Warps.followers.length} coming` : '';
      return [['enemies', `${here.length}, ${here.filter((enemy) => enemy.chasing).length} chasing${following}`]];
    },
  },
  {
    // how many there are of the most there can be, and how much tiles and objects that keep making
    // them are being turned down to stay under their share (particles.js)
    name: 'particles', label: 'Particles', note: 'how many, turned down', on: false,
    lines: () => {
      const down = ParticleEmitters.turnedDown < 1 ? `, emitters at ${Math.round(ParticleEmitters.turnedDown * 100)}%` : '';
      return [['particles', `${Particles.list.length} / ${PARTICLE_LIMIT}${down}`]];
    },
  },
];

// things drawn over the map that the menu can turn on and off. key is a KEYS action that flips it
// without the menu
const DEV_OVERLAYS = [
  { name: 'grid', label: 'Tile grid', note: 'and (0, 0)', key: 'grid', on: true },
  { name: 'paths', label: 'Enemy AI', note: 'labels, routes', key: 'enemyPaths', on: true },
  { name: 'hitboxes', label: 'UI hitboxes', note: 'ui.js', on: false },
];

// the menu's tools. keys are the KEYS actions that do it, and run is what clicking it does (none for
// teleport, since the mouse is on the menu). player and gameCamera are the game's (sketch.js)
const DEV_TOOLS = [
  { label: 'Map editor', keys: ['editor'], run: () => Editor.toggle(player, gameCamera) },
  { label: 'Next map', keys: ['nextMap'], run: () => Debug.nextMap() },
  { label: 'Teleport to mouse', keys: ['teleport'] },
  { label: 'Zoom out, in, reset', keys: ['zoomOut', 'zoomIn', 'zoomReset'], run: () => gameCamera.zoomTo(1) },
  { label: 'Dev mode off', keys: ['devMode'], run: () => Debug.toggle(player, gameCamera) },
];

// sizes in screen px
const DEV_PANEL = {
  margin: 8,
  padding: 8,
  titleHeight: 22,
  lineHeight: 16,
  // between sections
  gap: 5,
  // longer values get cut short with …
  maxValueWidth: 220,
};
const DEV_MENU = {
  padding: 12,
  columnWidth: 236,
  titleHeight: 30,
  headerHeight: 26,
  rowHeight: 22,
  // the key column in the editor's list
  keyColumn: 96,
};

const Debug = {
  enabled: false,
  // what's showing, by DEV_INFO and DEV_OVERLAYS name. use shows() to check
  show: {},
  // the dev menu (DevMenu below), made in init()
  menu: null,
  // smoothed out so the number doesn't flicker
  fps: 60,

  // called once from setup(), before Editor.init() so the editor's ui goes on top
  init() {
    for (const option of [...DEV_INFO, ...DEV_OVERLAYS]) this.show[option.name] = option.on;
    // storage might be blocked, in which case dev mode just starts off with the defaults
    try {
      this.enabled = localStorage.getItem(DEV_STORAGE_KEY) === 'on';
      Object.assign(this.show, JSON.parse(localStorage.getItem(DEV_SHOW_STORAGE_KEY)));
    } catch (e) {}
    this.menu = UI.add(new DevMenu({ visible: false }));
  },

  // whether dev mode's on and `name` (DEV_INFO or DEV_OVERLAYS) is ticked. sketch.js reads this
  shows(name) {
    return this.enabled && this.show[name];
  },

  flip(name) {
    this.show[name] = !this.show[name];
    try { localStorage.setItem(DEV_SHOW_STORAGE_KEY, JSON.stringify(this.show)); } catch (e) {}
  },

  toggleMenu() {
    this.menu.visible = !this.menu.visible;
  },

  toggle(player, camera) {
    this.enabled = !this.enabled;
    try { localStorage.setItem(DEV_STORAGE_KEY, this.enabled ? 'on' : 'off'); } catch (e) {}
    if (!this.enabled) {
      this.menu.visible = false;
      // the editor is part of dev mode so it closes too
      if (Editor.active) Editor.close(player, camera);
      // don't leave the game zoomed in or out
      camera.zoomTo(1);
    }
  },

  // the next map in MAPS (maps.js), going back round to the first after the last. worldMap is the
  // game's (sketch.js)
  nextMap() {
    const names = Object.keys(MAPS);
    loadMap(names[(names.indexOf(worldMap.name) + 1) % names.length]); // in sketch.js
  },

  // every frame, before the player and camera update. aim is the mouse's world position or null
  update(player, camera, map, aim, dt) {
    if (Input.wasPressed('devMode')) this.toggle(player, camera);
    if (!this.enabled) return;

    if (Input.wasPressed('editor')) Editor.toggle(player, camera);
    if (Input.wasPressed('devMenu')) this.toggleMenu();
    for (const overlay of DEV_OVERLAYS) if (overlay.key && Input.wasPressed(overlay.key)) this.flip(overlay.name);

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

    if (Input.wasPressed('nextMap')) {
      this.nextMap();
      return; // the old map's gone, so skip the other tools this frame
    }

    // puts the feet on the mouse. not onto solid or off-map tiles though, they'd be stuck
    if (Input.wasPressed('teleport') && aim && !map.isSolid(map.colAt(aim.x), map.rowAt(aim.y))) {
      player.x = aim.x;
      player.y = aim.y - feetBelowCentre(player.settings); // character.js
    }
  },

  // the info panel, in screen positions (after camera.end()). it goes under the editor toolbar while
  // that's open, and under the menu while that's open (or next to it if there isn't room). it's as
  // wide as what's in it, so nothing spills out, and values too long for the space get cut short
  draw(player, camera, map, aim) {
    if (!this.enabled) return;
    const P = DEV_PANEL;
    const C = EDITOR_COLOURS;
    const state = { player, camera, map, aim };
    // each line knows its y (from the top of the first line), with a gap before each new section
    let lineY = 0;
    const lines = DEV_INFO.filter((info) => this.show[info.name]).flatMap((info, i) => {
      if (i > 0) lineY += P.gap;
      return info.lines(state).map((line) => {
        line.y = lineY;
        lineY += P.lineHeight;
        return line;
      });
    });
    const hint = this.menu.visible ? '' : `${keyName(KEYS.devMenu[0])}  menu`;

    setText(11, BOLD, LEFT, CENTER);
    const labelWidth = Math.max(0, ...lines.map(([label]) => textWidth(label)));
    const titleWidth = textWidth('DEV MODE') + (hint ? textWidth(hint) + 16 : 0);
    const h = P.titleHeight + lineY + (lines.length > 0 ? 6 : 0);
    // the space the editor's bars and dock leave
    const top = (Editor.active ? EDITOR_LAYOUT.toolbarHeight : 0) + P.margin;
    const bottom = GAME_H - (Editor.active ? EDITOR_LAYOUT.statusHeight : 0) - P.margin;
    const right = GAME_W - (Editor.active ? EDITOR_LAYOUT.dockWidth : 0) - P.margin;
    let x = P.margin;
    let y = top;
    if (this.menu.visible) {
      const below = this.menu.y + this.menu.h + P.margin;
      if (below + h <= bottom) y = below;
      else x = this.menu.x + this.menu.w + P.margin;
    }
    setText(12, NORMAL, LEFT, CENTER, 'Courier Prime');
    const room = right - x - P.padding * 2 - labelWidth - 10;
    const valueWidth = Math.min(P.maxValueWidth, room, Math.max(0, ...lines.map(([, value]) => textWidth(value))));
    const w = Math.ceil(Math.max(titleWidth, labelWidth + 10 + valueWidth)) + P.padding * 2;

    drawDevBox(x, y, w, h, P.titleHeight, lines.length > 0);
    noStroke();
    fill(C.accent);
    setText(11, BOLD, LEFT, CENTER);
    text('DEV MODE', x + P.padding, y + P.titleHeight / 2);
    fill(C.dimText);
    textAlign(RIGHT, CENTER);
    text(hint, x + w - P.padding, y + P.titleHeight / 2);

    const valueX = x + P.padding + labelWidth + 10;
    for (const line of lines) {
      const [label, value, colour] = line;
      const middleY = y + P.titleHeight + 3 + line.y + P.lineHeight / 2;
      fill(C.dimText);
      setText(11, BOLD, LEFT, CENTER);
      text(label, x + P.padding, middleY);
      fill(colour ?? C.text);
      setText(12, NORMAL, LEFT, CENTER, 'Courier Prime');
      text(fitText(value, valueWidth), valueX, middleY);
    }
  },
};

// the dev menu: two columns of things you can click, ticks for what shows on the left, and tools and
// keys on the right. it's one element that works out where everything goes each frame (layout()), so
// the editor's part can come and go, and it sits in the top left under the editor toolbar if that's
// open
class DevMenu extends UIElement {
  constructor(options) {
    super(options);
    this.items = [];
    // the item under the mouse that can be clicked, or null
    this.hoveredItem = null;
  }

  // every bit of the menu as { x, y, w, h, kind, click? } in screen px
  layout() {
    const M = DEV_MENU;
    this.x = DEV_PANEL.margin;
    this.y = (Editor.active ? EDITOR_LAYOUT.toolbarHeight : 0) + DEV_PANEL.margin;
    this.w = M.padding * 3 + M.columnWidth * 2;

    const items = [{ kind: 'close', x: this.x + this.w - 30, y: this.y + 4, w: 24, h: 22, click: () => Debug.toggleMenu() }];
    // a column of sections, each a header and its rows. gives back where it ends
    const column = (x, sections) => {
      let y = this.y + M.titleHeight;
      for (const [title, rows] of sections) {
        items.push({ kind: 'header', title, x, y, w: M.columnWidth, h: M.headerHeight });
        y += M.headerHeight;
        for (const row of rows) {
          items.push({ ...row, x, y, w: M.columnWidth, h: M.rowHeight });
          y += M.rowHeight;
        }
      }
      return y;
    };
    const tick = (option) => ({ kind: 'tick', option, click: () => Debug.flip(option.name) });
    const left = column(this.x + M.padding, [
      ['Info panel', DEV_INFO.map(tick)],
      ['On the map', DEV_OVERLAYS.map(tick)],
    ]);
    const right = column(this.x + M.padding * 2 + M.columnWidth, [
      ['Tools', DEV_TOOLS.map((tool) => ({ kind: 'tool', tool, click: tool.run }))],
      // EDITOR_KEYS is in editor.js
      ...(Editor.active ? [['Map editor', EDITOR_KEYS.map(([key, does]) => ({ kind: 'key', key, does }))]] : []),
    ]);
    this.h = Math.max(left, right) - this.y + M.padding / 2;
    return items;
  }

  update(hovered) {
    this.hovered = hovered;
    if (!this.visible) return;
    this.items = this.layout();
    const { x, y } = Input.mouse;
    const over = (item) => x >= item.x && x < item.x + item.w && y >= item.y && y < item.y + item.h;
    this.hoveredItem = hovered ? this.items.find((item) => item.click && over(item)) ?? null : null;
    if (this.hoveredItem && Input.buttonsPressed.has('left')) this.hoveredItem.click();
    // so the wheel doesn't zoom the editor behind it (Debug.update())
    if (hovered) Input.wheel = 0;
  }

  draw() {
    const M = DEV_MENU;
    const C = EDITOR_COLOURS;
    drawDevBox(this.x, this.y, this.w, this.h, M.titleHeight, true);
    noStroke();
    fill(C.text);
    setText(13, BOLD, LEFT, CENTER);
    text('Dev menu', this.x + M.padding, this.y + M.titleHeight / 2);
    fill(C.dimText);
    setText(11, BOLD, RIGHT, CENTER);
    text(`${keyName(KEYS.devMenu[0])} to close`, this.x + this.w - 36, this.y + M.titleHeight / 2);

    for (const item of this.items) {
      if (item === this.hoveredItem) {
        noStroke();
        fill(C.tabHover);
        rect(item.x - 4, item.y, item.w + 8, item.h, 3);
      }
      const middleY = item.y + item.h / 2;
      const right = item.x + item.w - 2;
      if (item.kind === 'close') {
        fill(item === this.hoveredItem ? C.text : C.dimText);
        setText(16, BOLD, CENTER, CENTER);
        text('×', item.x + item.w / 2, middleY);
      } else if (item.kind === 'header') {
        fill(C.dimText);
        setText(10, BOLD, LEFT, CENTER);
        text(item.title.toUpperCase(), item.x, middleY + 3);
        fill(C.edge);
        rect(item.x, item.y + item.h - 4, item.w, 1);
      } else if (item.kind === 'tick') {
        const { option } = item;
        drawTick(item.x + 2, middleY, Debug.show[option.name]);
        const chipsLeft = option.key ? drawKeyChips(KEYS[option.key].slice(0, 1), right, middleY) : right;
        drawLabelAndNote(option.label, option.note, item.x + 24, chipsLeft - 8, middleY);
      } else if (item.kind === 'tool') {
        const chipsLeft = drawKeyChips(item.tool.keys.flatMap(shownKeys), right, middleY);
        // the ones you can't click (teleport) are dimmer
        drawLabelAndNote(item.tool.label, '', item.x + 2, chipsLeft - 8, middleY, item.click ? C.text : C.dimText);
      } else if (item.kind === 'key') {
        drawKeyChips([item.key], item.x + M.keyColumn, middleY, true);
        drawLabelAndNote(item.does, '', item.x + M.keyColumn + 8, right, middleY);
      }
    }
  }
}

// ---------- drawing bits ----------

// the dark editor-style box both panels use, with a darker title strip at the top
function drawDevBox(x, y, w, h, titleHeight, hasBody) {
  const C = EDITOR_COLOURS;
  noStroke();
  fill(31, 35, 43, 235); // EDITOR_COLOURS.bar, a little see-through
  rect(x, y, w, h, 5);
  fill(C.header);
  rect(x, y, w, titleHeight, 5, 5, hasBody ? 0 : 5, hasBody ? 0 : 5);
  noFill();
  stroke(C.edge);
  strokeWeight(1);
  rect(x + 0.5, y + 0.5, w - 1, h - 1, 5);
}

// a tick box with its left edge at x, like Checkbox in formbox.js
function drawTick(x, middleY, on) {
  const C = EDITOR_COLOURS;
  const size = 14;
  const top = middleY - size / 2;
  stroke(on ? C.accent : C.edge);
  strokeWeight(1);
  fill(on ? C.accent : C.well);
  rect(x, top, size, size, 3);
  if (on) {
    stroke(255);
    strokeWeight(2);
    line(x + 3.5, top + 7, x + 6, top + 9.5);
    line(x + 6, top + 9.5, x + 10.5, top + 4.5);
  }
}

// a bold label and a dim note after it, both cut short so they end before maxX
function drawLabelAndNote(label, note, x, maxX, middleY, colour = EDITOR_COLOURS.text) {
  noStroke();
  fill(colour);
  setText(12, BOLD, LEFT, CENTER);
  const shown = fitText(label, maxX - x);
  text(shown, x, middleY);
  if (!note) return;
  const noteX = x + textWidth(shown) + 6;
  fill(EDITOR_COLOURS.dimText);
  setText(11, NORMAL, LEFT, CENTER);
  if (maxX - noteX > 20) text(fitText(note, maxX - noteX), noteX, middleY);
}

// little key caps for KEYS codes (or words, like 'WASD') that end at `edge`. gives back their left
// edge, or `edge` itself if keepEdge is true (the editor's list lines them up on the right of a column)
function drawKeyChips(codes, edge, middleY, keepEdge = false) {
  const C = EDITOR_COLOURS;
  setText(11, BOLD, CENTER, CENTER, 'Courier Prime');
  const labels = codes.map(keyName);
  const widths = labels.map((label) => Math.max(18, textWidth(label) + 10));
  const total = widths.reduce((sum, w) => sum + w, 0) + (labels.length - 1) * 3;
  let x = edge - total;
  const left = x;
  labels.forEach((label, i) => {
    stroke(C.edge);
    strokeWeight(1);
    fill(C.well);
    rect(x, middleY - 8, widths[i], 16, 3);
    noStroke();
    fill(C.text);
    text(label, x + widths[i] / 2, middleY + 1);
    x += widths[i] + 3;
  });
  return keepEdge ? edge : left;
}

// the codes to show for a KEYS action: all of them except the numpad and arrow ones, which are just
// copies of others
function shownKeys(action) {
  return KEYS[action].filter((code) => !code.startsWith('Numpad') && !code.startsWith('Arrow'));
}

// a KEYS code (an e.code name, config.js) as it's printed on the key: 'KeyG' is G, 'Control+KeyD' is
// Ctrl+D. anything else (like 'WASD') stays as it is
function keyName(code) {
  const names = { Backquote: '`', Equal: '=', Minus: '-', Control: 'Ctrl' };
  return code.split('+').map((part) => names[part] ?? part.replace(/^(Key|Digit)(.)$/, '$2')).join('+');
}

// green when it's smooth, yellow when it's a bit slow, red when it's struggling
function fpsColour(fps) {
  return fps >= 55 ? '#7bd88f' : fps >= 30 ? '#ffd23f' : '#ff6b6b';
}

// turns { x: 12.345, y: -6.7 } into "12, -7"
function formatPoint(p) {
  return `${Math.round(p.x)}, ${Math.round(p.y)}`;
}
