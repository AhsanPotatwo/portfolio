// the map editor. a simple way to paint tiles onto the map you're on.
// open it from dev mode: press ` for dev mode, then E.
//
// while it's open:
//   - the player stops, and WASD / the arrow keys move the camera around instead
//   - pick a tile from the bar at the bottom (‹ › for more pages once there are lots of tiles)
//   - left click or drag to paint that tile, replacing whatever was there
//   - right click or drag to erase (or pick Erase in the bar). erased tiles are empty:
//     nothing's drawn there and nothing can walk on it, like off the edge of the map
//   - P puts the player's spawn point on the tile under the mouse (marked with a yellow ring)
//   - Export saves the map as a file, Open loads one (see mapfile.js)
//   - the dev mode keys still work (zoom, teleport, next map)
//
// every tile in tiles.js shows up in the bar by itself, in the order they're defined.
//
// changes are made to the map you're on, so you can walk around on them straight away.
// Export them to keep them: going to another map (M) or reloading builds maps fresh
// from their file or maps.js. the full guide is in assets/squimble-quest/maps/README.md

// how fast WASD moves the camera, in screen pixels a second (so it feels the same at any zoom)
const EDITOR_PAN_SPEED = 600;

// the controls box in the top right, and the Export / Open buttons under it
const EDITOR_HELP = {
  lines: [
    'MAP EDITOR   E to close',
    'left click: paint   right click: erase',
    'WASD: move   - = / wheel: zoom',
    'P: player spawns here',
  ],
  width: 330,
  lineHeight: 18,
};

// layout of the bar along the bottom, in screen pixels
const EDITOR_BAR = {
  height: 84,
  // each tile square, and the space each one gets (square + gap + room for its name)
  swatchSize: 44,
  slotWidth: 60,
  // where the tile squares start and stop across the bar. the rest is the Erase button and arrows
  swatchesLeft: 110,
  swatchesRight: GAME_W - 44,
};

const Editor = {
  active: false,
  // the tile being painted, by name. null means erase
  selected: null,
  // which page of tiles the bar is showing
  page: 0,
  pageCount: 1,
  // what the camera looks at while editing. WASD moves this, the camera follows it
  view: { x: 0, y: 0 },
  // where the last bit of paint went while dragging, so fast drags can fill in the gap
  lastPaint: null,

  // the bar's ui elements, made once in init()
  swatches: [],
  eraseButton: null,

  // call once from setup(). makes the bar (hidden until the editor opens)
  init() {
    const barY = GAME_H - EDITOR_BAR.height;
    const names = Object.keys(TILE_TYPES);
    const perPage = Math.floor((EDITOR_BAR.swatchesRight - EDITOR_BAR.swatchesLeft) / EDITOR_BAR.slotWidth);
    this.pageCount = Math.ceil(names.length / perPage);
    this.selected = names[0];

    // everything's in the 'editor' group, so it can be shown and hidden together.
    // the bar goes first so it's underneath the rest, and it blocks clicks between the buttons
    // from painting the map behind it
    const add = (element) => UI.add(Object.assign(element, { group: 'editor' }));
    add(new EditorBar({ x: 0, y: barY, w: GAME_W, h: EDITOR_BAR.height }));

    // a toggle, so it can show when erasing is picked (update() keeps button.on matching)
    this.eraseButton = add(new Button({
      x: 10, y: barY + 10, w: 56, h: 44, label: 'Erase',
      style: { textSize: 13, onFill: '#c94545' },
      toggle: true,
      onClick: () => { this.selected = null; },
    }));

    // page arrows. they go round, so › on the last page goes back to the first
    const arrows = { style: { textSize: 20 }, enabled: this.pageCount > 1 };
    add(new Button({ ...arrows, x: 74, y: barY + 10, w: 28, h: 44, label: '‹', onClick: () => this.turnPage(-1) }));
    add(new Button({ ...arrows, x: GAME_W - 38, y: barY + 10, w: 28, h: 44, label: '›', onClick: () => this.turnPage(1) }));

    // one square per tile. each knows which page it's on, only that page's squares are shown
    this.swatches = names.map((name, i) => {
      const slot = i % perPage;
      return add(new TileSwatch({
        x: EDITOR_BAR.swatchesLeft + slot * EDITOR_BAR.slotWidth + (EDITOR_BAR.slotWidth - EDITOR_BAR.swatchSize) / 2,
        y: barY + 10,
        w: EDITOR_BAR.swatchSize,
        h: EDITOR_BAR.swatchSize,
        tileName: name,
        page: Math.floor(i / perPage),
        onClick: () => { this.selected = name; },
      }));
    });

    // Export and Open, side by side under the controls box. worldMap is the map you're on (sketch.js)
    const helpLeft = GAME_W - 8 - EDITOR_HELP.width;
    const buttonsY = 8 + EDITOR_HELP.lines.length * EDITOR_HELP.lineHeight + 12 + 8;
    const half = (EDITOR_HELP.width - 8) / 2;
    add(new Button({
      x: helpLeft, y: buttonsY, w: half, h: 32, label: 'Export map', style: 'primary',
      onClick: () => exportMap(worldMap),
    }));
    add(new Button({
      x: helpLeft + half + 8, y: buttonsY, w: half, h: 32, label: 'Open map file',
      onClick: () => openMapFile(),
    }));

    UI.showGroup('editor', false);
  },

  // ---------- opening and closing ----------

  toggle(player, camera) {
    if (this.active) {
      this.close(player, camera);
    } else {
      this.open(player, camera);
    }
  },

  open(player, camera) {
    this.active = true;
    // start looking at wherever the camera already is, and follow the editor's view instead of the player
    this.view = { x: camera.x, y: camera.y };
    camera.follow(this.view);
    UI.showGroup('editor', true);
    this.showPage(this.page);
  },

  close(player, camera) {
    this.active = false;
    this.lastPaint = null;
    camera.follow(player);
    UI.showGroup('editor', false);
  },

  turnPage(step) {
    // + pageCount stops it going negative, % wraps it round
    this.showPage((this.page + step + this.pageCount) % this.pageCount);
  },

  showPage(page) {
    this.page = page;
    for (const swatch of this.swatches) swatch.visible = swatch.page === page;
  },

  // ---------- every frame, while open ----------

  // aim is the mouse's world position, or null
  update(map, camera, aim, dt) {
    this.eraseButton.on = this.selected === null;

    // move the view with WASD. dividing by zoom keeps it the same speed on screen at any zoom
    const dir = Input.direction();
    const speed = EDITOR_PAN_SPEED / camera.zoom;
    const bounds = map.bounds();
    this.view.x = constrain(this.view.x + dir.x * speed * dt, bounds.left, bounds.right);
    this.view.y = constrain(this.view.y + dir.y * speed * dt, bounds.top, bounds.bottom);

    // P: the player will start with their feet in the middle of the tile under the mouse.
    // not on solid or empty tiles, they'd be stuck
    if (Input.wasPressed('setSpawn') && aim) {
      const col = map.colAt(aim.x);
      const row = map.rowAt(aim.y);
      if (!map.isSolid(col, row)) {
        // spawn is the player's centre, which is above their feet
        const feetBelowCentre = PLAYER.height / 2 - PLAYER.feetHeight / 2;
        map.spawn = { x: (col + 0.5) * TILE, y: (row + 0.5) * TILE - feetBelowCentre };
      }
    }

    // paint while a button's held. mouseHeld() ignores clicks that landed on the bar (see input.js)
    const painting = Input.mouseHeld('left');
    const erasing = Input.mouseHeld('right');
    if (aim && Input.mouse.inside && (painting || erasing)) {
      this.paintLine(map, this.lastPaint ?? aim, aim, erasing ? null : this.selected);
      this.lastPaint = aim;
    } else {
      this.lastPaint = null;
    }
  },

  // paints every tile along a line. a fast drag can jump several tiles between frames,
  // so this fills in the ones in between instead of leaving gaps
  paintLine(map, from, to, name) {
    // a check every half tile along the line is enough to not skip any
    const steps = Math.max(1, Math.ceil(dist(from.x, from.y, to.x, to.y) / (TILE / 2)));
    for (let i = 0; i <= steps; i++) {
      const x = lerp(from.x, to.x, i / steps);
      const y = lerp(from.y, to.y, i / steps);
      map.set(map.colAt(x), map.rowAt(y), name);
    }
  },

  // ---------- drawing ----------

  // marks the spawn point, and outlines the tile under the mouse.
  // uses world positions, so draw it before camera.end()
  drawCursor(map, camera, aim) {
    // same trick as the grid: divide by zoom so lines stay the same thickness on screen
    const px = 1 / camera.zoom;

    // the spawn point: a yellow ring where the player's feet will be
    const feetBelowCentre = PLAYER.height / 2 - PLAYER.feetHeight / 2;
    noFill();
    stroke(0, 0, 0, 160);
    strokeWeight(4 * px);
    circle(map.spawn.x, map.spawn.y + feetBelowCentre, 20);
    stroke('#ffd23f');
    strokeWeight(2 * px);
    circle(map.spawn.x, map.spawn.y + feetBelowCentre, 20);

    if (!aim || !Input.mouse.inside || UI.hovered) return;
    const col = map.colAt(aim.x);
    const row = map.rowAt(aim.y);
    if (!map.inside(col, row)) return;

    noFill();
    // dark then light, so it shows up on any tile. red when erasing
    stroke(0, 0, 0, 160);
    strokeWeight(3 * px);
    rect(col * TILE, row * TILE, TILE, TILE);
    stroke(this.selected === null ? '#ff6b6b' : '#ffffff');
    strokeWeight(1.5 * px);
    rect(col * TILE, row * TILE, TILE, TILE);
  },

  // a reminder of the controls, top right (the text is in EDITOR_HELP at the top of this file).
  // uses screen positions, so draw it after camera.end()
  drawHelp() {
    const { lines, width, lineHeight } = EDITOR_HELP;
    noStroke();
    fill(0, 0, 0, 160);
    rect(GAME_W - width - 8, 8, width, lines.length * lineHeight + 12, 6);

    fill(255);
    textFont('Courier Prime');
    textStyle(NORMAL);
    textSize(13);
    textAlign(LEFT, TOP);
    lines.forEach((row, i) => text(row, GAME_W - width, 14 + i * lineHeight));
  },
};

// ---------- the bar's ui elements ----------
// both build on the ui system (ui.js / button.js), see "making a new kind of ui element" in ui.js

// the dark strip along the bottom. doesn't do anything when clicked, but as a ui element it
// stops clicks on it reaching the map behind
class EditorBar extends UIElement {
  draw() {
    noStroke();
    fill(20, 22, 28);
    rect(this.x, this.y, this.w, this.h);

    // which page, under the › arrow
    fill(255, 255, 255, 150);
    textFont('Quicksand');
    textStyle(BOLD);
    textSize(11);
    textAlign(CENTER, CENTER);
    text(`${Editor.page + 1} / ${Editor.pageCount}`, GAME_W - 24, this.y + 66);
    text('or right click', 38, this.y + 66);
  }
}

// one tile in the bar. a Button, so clicking works the same, but it draws the tile instead of a box
class TileSwatch extends Button {
  constructor(options) {
    super(options);
    // the tile it picks, and which page of the bar it's on
    this.tileName = options.tileName;
    this.page = options.page;
  }

  draw() {
    const type = TILE_TYPES[this.tileName];
    const selected = Editor.selected === this.tileName;
    const y = this.y + (this.pressed && this.hovered ? 1 : 0);

    // the tile itself: its picture, or its colour
    if (type.img) {
      image(type.img, this.x, y, this.w, this.h);
    } else {
      noStroke();
      fill(type.fill);
      rect(this.x, y, this.w, this.h);
    }

    // yellow edge for the one that's picked, white when the mouse is over it
    noFill();
    if (selected) {
      stroke('#ffd23f');
      strokeWeight(3);
    } else {
      stroke(this.hovered ? 255 : 90);
      strokeWeight(1.5);
    }
    rect(this.x, y, this.w, this.h);

    // its name underneath
    noStroke();
    fill(selected ? '#ffd23f' : 220);
    textFont('Quicksand');
    textStyle(BOLD);
    textSize(11);
    textAlign(CENTER, CENTER);
    text(this.tileName, this.x + this.w / 2, this.y + this.h + 12);
  }
}
