// the map editor. a simple way to build maps: paint tiles and place objects on the map you're on.
// open it from dev mode: press ` for dev mode, then E.
//
// while it's open:
//   - the player stops, and WASD / the arrow keys move the camera around instead
//   - pick a tile or an object from the bar at the bottom. the tabs above it switch between
//     tiles and objects (‹ › for more pages once there are lots)
//   - tiles: left click or drag to paint, replacing whatever tile was there
//   - objects: left click to place one, its top left corner on the tile under the mouse
//   - right click or drag to erase (or pick Erase in the bar). if you start on an object it removes
//     objects, otherwise it empties tiles. empty tiles are like off the edge of the map:
//     nothing's drawn there and nothing can walk on them
//   - P puts the player's spawn point on the tile under the mouse (marked with a yellow ring)
//   - New map makes a blank map of any size, Export saves the map as a file, Open file loads one
//   - the dev mode keys still work (zoom, teleport, next map)
//
// every tile in tiles.js and object in objects.js shows up in the bar by itself.
//
// changes are made to the map you're on, so you can walk around on them straight away.
// Export them to keep them: going to another map (M) or reloading builds maps fresh
// from their files. the full guide is in assets/squimble-quest/maps/README.md

// how fast WASD moves the camera, in screen pixels a second (so it feels the same at any zoom)
const EDITOR_PAN_SPEED = 600;

// the biggest a new map can be each way, in tiles. just to stop a typo making a gigantic map
const EDITOR_MAX_MAP_SIZE = 500;

// what a map made with New map is called until it's exported with a name of its own
const NEW_MAP_NAME = 'new-map';

// the controls box in the top right, and the New / Export / Open buttons under it
const EDITOR_HELP = {
  lines: [
    'MAP EDITOR   E to close',
    'left click: paint / place   right: erase',
    'WASD: move   - = / wheel: zoom',
    'P: player spawns here',
  ],
  width: 330,
  lineHeight: 18,
};

// layout of the bar along the bottom, in screen pixels
const EDITOR_BAR = {
  height: 84,
  // each square, and the space each one gets (square + gap + room for its name)
  swatchSize: 44,
  slotWidth: 60,
  // where the squares start and stop across the bar. the rest is the Erase button and arrows
  swatchesLeft: 110,
  swatchesRight: GAME_W - 44,
  // the tabs sitting on top of the bar
  tabWidth: 96,
  tabHeight: 26,
};

// the tabs above the bar, left to right. each one shows everything of its kind
const EDITOR_TABS = [
  { kind: 'tile', label: 'Tiles' },
  // furniture, decorations, chests... everything in objects.js
  { kind: 'object', label: 'Objects' },
];

const Editor = {
  active: false,
  // what's picked in the bar: { kind: 'tile' or 'object', name }, or null for Erase
  selected: null,
  // which tab is showing ('tile' or 'object'), and for each tab, which page it's on and how many
  // pages it has. each tab remembers its own page, so switching back finds it where you left it
  tab: 'tile',
  pages: {},
  pageCounts: {},
  // what the camera looks at while editing. WASD moves this, the camera follows it
  view: { x: 0, y: 0 },
  // where the mouse was last frame while dragging, so fast drags can fill in the gap
  lastPaint: null,
  // whether the current erase drag is removing objects (true) or emptying tiles (false)
  erasingObjects: false,

  // the bar's ui elements, made once in init()
  swatches: [],
  tabButtons: [],
  eraseButton: null,
  prevButton: null,
  nextButton: null,

  // call once from setup(). makes the bar and buttons (hidden until the editor opens)
  init() {
    const barY = GAME_H - EDITOR_BAR.height;
    const perPage = Math.floor((EDITOR_BAR.swatchesRight - EDITOR_BAR.swatchesLeft) / EDITOR_BAR.slotWidth);

    // what goes in each tab, and how many pages each one needs (at least 1, even if it's empty)
    const names = { tile: Object.keys(TILE_TYPES), object: Object.keys(OBJECT_TYPES) };
    for (const { kind } of EDITOR_TABS) {
      this.pages[kind] = 0;
      this.pageCounts[kind] = Math.max(1, Math.ceil(names[kind].length / perPage));
    }
    this.selected = { kind: 'tile', name: names.tile[0] };

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

    // page arrows. they go round, so › on the last page goes back to the first.
    // showPage() switches them off when the tab only has one page
    const arrows = { style: { textSize: 20 } };
    this.prevButton = add(new Button({ ...arrows, x: 74, y: barY + 10, w: 28, h: 44, label: '‹', onClick: () => this.turnPage(-1) }));
    this.nextButton = add(new Button({ ...arrows, x: GAME_W - 38, y: barY + 10, w: 28, h: 44, label: '›', onClick: () => this.turnPage(1) }));

    // the tabs, sitting on top of the bar. toggles, so the open one looks switched on
    // (update() keeps button.on matching)
    this.tabButtons = EDITOR_TABS.map(({ kind, label }, i) => add(new Button({
      x: 10 + i * (EDITOR_BAR.tabWidth + 6),
      y: barY - EDITOR_BAR.tabHeight,
      w: EDITOR_BAR.tabWidth,
      h: EDITOR_BAR.tabHeight,
      label,
      style: { textSize: 13, radius: 6, onFill: '#4a7bd8', pressOffset: 0 },
      toggle: true,
      onClick: () => this.showTab(kind),
    })));

    // one square per tile and object. each knows its tab and page, only the open ones are shown
    this.swatches = [];
    for (const { kind } of EDITOR_TABS) {
      names[kind].forEach((name, i) => {
        const slot = i % perPage;
        this.swatches.push(add(new PaletteSwatch({
          x: EDITOR_BAR.swatchesLeft + slot * EDITOR_BAR.slotWidth + (EDITOR_BAR.slotWidth - EDITOR_BAR.swatchSize) / 2,
          y: barY + 10,
          w: EDITOR_BAR.swatchSize,
          h: EDITOR_BAR.swatchSize,
          kind,
          name,
          page: Math.floor(i / perPage),
          onClick: () => { this.selected = { kind, name }; },
        })));
      });
    }

    // New map, Export and Open, in a row under the controls box. worldMap, player and gameCamera
    // are the game's (sketch.js)
    const helpLeft = GAME_W - 8 - EDITOR_HELP.width;
    const buttonsY = 8 + EDITOR_HELP.lines.length * EDITOR_HELP.lineHeight + 12 + 8;
    const third = (EDITOR_HELP.width - 16) / 3;
    add(new Button({
      x: helpLeft, y: buttonsY, w: third, h: 32, label: 'New map',
      onClick: () => this.newMap(),
    }));
    add(new Button({
      x: helpLeft + third + 8, y: buttonsY, w: third, h: 32, label: 'Export', style: 'primary',
      onClick: () => exportMap(worldMap),
    }));
    add(new Button({
      x: helpLeft + (third + 8) * 2, y: buttonsY, w: third, h: 32, label: 'Open file',
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
    this.showTab(this.tab);
  },

  close(player, camera) {
    this.active = false;
    this.lastPaint = null;
    camera.follow(player);
    UI.showGroup('editor', false);
  },

  // ---------- tabs and pages ----------

  // switches the bar to a tab ('tile' or 'object'), on whichever page it was last on
  showTab(kind) {
    this.tab = kind;
    this.showPage(this.pages[kind]);
  },

  turnPage(step) {
    const count = this.pageCounts[this.tab];
    // + count stops it going negative, % wraps it round
    this.showPage((this.pages[this.tab] + step + count) % count);
  },

  // shows one page of the open tab
  showPage(page) {
    this.pages[this.tab] = page;
    for (const swatch of this.swatches) {
      swatch.visible = swatch.kind === this.tab && swatch.page === page;
    }
    const morePages = this.pageCounts[this.tab] > 1;
    this.prevButton.enabled = morePages;
    this.nextButton.enabled = morePages;
  },

  // is this tile or object the one picked in the bar?
  isSelected(kind, name) {
    return this.selected !== null && this.selected.kind === kind && this.selected.name === name;
  },

  // ---------- new map ----------

  // asks for a size, then makes a blank map that size and goes to it. it's filled with the tile
  // picked in the bar, or starts empty if Erase is picked (handy for rooms that aren't rectangles:
  // start empty, then paint the floor in whatever shape you like)
  newMap() {
    const typed = prompt('Size of the new map in tiles, width x height:', '40x24');
    // cancelled
    if (typed === null) return;

    // "40x24", "40 x 24" or "40,24"
    const match = typed.match(/^\s*(\d+)\s*[x×*,]\s*(\d+)\s*$/i);
    if (!match) {
      alert('Type the size as width x height, e.g. 40x24');
      return;
    }
    const cols = Number(match[1]);
    const rows = Number(match[2]);
    if (cols < 1 || rows < 1) {
      alert('The smallest a map can be is 1x1.');
      return;
    }
    if (cols > EDITOR_MAX_MAP_SIZE || rows > EDITOR_MAX_MAP_SIZE) {
      alert(`The biggest a map can be is ${EDITOR_MAX_MAP_SIZE}x${EDITOR_MAX_MAP_SIZE}.`);
      return;
    }

    let fillWith = 'blank';
    if (this.selected === null) fillWith = null;
    else if (this.selected.kind === 'tile') fillWith = this.selected.name;

    // added to MAPS like any other map, so dev mode's M key can come back to it
    MAPS[NEW_MAP_NAME] = () => makeBlankMap(cols, rows, fillWith);
    loadMap(NEW_MAP_NAME); // in sketch.js
  },

  // ---------- every frame, while open ----------

  // aim is the mouse's world position, or null
  update(map, camera, aim, dt) {
    // toggles flip themselves when clicked, so set them to match what's really picked and open
    this.eraseButton.on = this.selected === null;
    this.tabButtons.forEach((button, i) => { button.on = EDITOR_TABS[i].kind === this.tab; });

    // move the view with WASD. dividing by zoom keeps it the same speed on screen at any zoom
    const dir = Input.direction();
    const speed = EDITOR_PAN_SPEED / camera.zoom;
    const bounds = map.bounds();
    this.view.x = constrain(this.view.x + dir.x * speed * dt, bounds.left, bounds.right);
    this.view.y = constrain(this.view.y + dir.y * speed * dt, bounds.top, bounds.bottom);

    // the tile under the mouse, or null if the mouse isn't over the game
    const over = aim && Input.mouse.inside ? { col: map.colAt(aim.x), row: map.rowAt(aim.y) } : null;

    // P: the player will start with their feet in the middle of the tile under the mouse.
    // not on solid or empty tiles, they'd be stuck
    if (Input.wasPressed('setSpawn') && over && !map.isSolid(over.col, over.row)) {
      map.setSpawnTile(over.col, over.row);
    }

    // objects: one per click. mousePressed() ignores clicks that landed on the bar (see input.js)
    if (over && this.selected?.kind === 'object' && Input.mousePressed('left')) {
      this.placeObject(map, this.selected.name, over.col, over.row);
    }

    // tiles and erasing: keep going while the button's held
    const erasing = Input.mouseHeld('right') || (this.selected === null && Input.mouseHeld('left'));
    const painting = !erasing && this.selected?.kind === 'tile' && Input.mouseHeld('left');

    if (over && (painting || erasing)) {
      // an erase drag that starts on an object only removes objects, otherwise it only empties
      // tiles. stops one drag removing a table and then the floor it was standing on
      if (!this.lastPaint) this.erasingObjects = erasing && map.objectsAt(over.col, over.row).length > 0;

      this.forEachTileOnLine(map, this.lastPaint ?? aim, aim, (col, row) => {
        if (painting) map.set(col, row, this.selected.name);
        else if (this.erasingObjects) map.removeObjectsAt(col, row);
        else map.set(col, row, null);
      });
      this.lastPaint = aim;
    } else {
      this.lastPaint = null;
    }
  },

  // places an object with its top left corner on col, row
  placeObject(map, name, col, row) {
    if (!map.inside(col, row)) return;
    // not the same object twice in exactly the same spot (easy to do with a double click)
    if (map.objects.some((obj) => obj.type === name && obj.col === col && obj.row === row)) return;
    map.addObject(name, col, row);
  },

  // runs action(col, row) for every tile along a line. a fast drag can jump several tiles between
  // frames, so this fills in the ones in between instead of leaving gaps
  forEachTileOnLine(map, from, to, action) {
    // a check every half tile along the line is enough to not skip any
    const steps = Math.max(1, Math.ceil(dist(from.x, from.y, to.x, to.y) / (TILE / 2)));
    for (let i = 0; i <= steps; i++) {
      const x = lerp(from.x, to.x, i / steps);
      const y = lerp(from.y, to.y, i / steps);
      action(map.colAt(x), map.rowAt(y));
    }
  },

  // ---------- drawing ----------

  // marks the spawn point, and shows what a click would do under the mouse.
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

    // an object: a see-through preview of it, covering the tiles it would
    if (this.selected?.kind === 'object') {
      const type = OBJECT_TYPES[this.selected.name];
      const x = col * TILE;
      const y = row * TILE;
      const w = type.width * TILE;
      const h = type.height * TILE;
      if (type.img) {
        // tint() with a second number fades an image, noTint() puts it back for everything after
        tint(255, 110);
        image(type.img, x, y, w, h);
        noTint();
        noFill();
      } else {
        // a brand new colour, made from the object's. color(type.fill) would hand back the object's
        // own colour rather than a copy, so fading it would fade every one of them on the map too
        fill(red(type.fill), green(type.fill), blue(type.fill), 110);
      }
      this.outline(x, y, w, h, '#ffffff', px);
      return;
    }

    // erasing over objects: outline the objects that would be removed
    if (this.selected === null) {
      for (const obj of map.objectsAt(col, row)) {
        const type = OBJECT_TYPES[obj.type];
        noFill();
        this.outline(obj.col * TILE, obj.row * TILE, type.width * TILE, type.height * TILE, '#ff6b6b', px);
      }
    }

    // the tile under the mouse. red when erasing
    noFill();
    this.outline(col * TILE, row * TILE, TILE, TILE, this.selected === null ? '#ff6b6b' : '#ffffff', px);
  },

  // a rectangle with a dark edge then a light one, so it shows up on anything. uses the current fill
  outline(x, y, w, h, colour, px) {
    stroke(0, 0, 0, 160);
    strokeWeight(3 * px);
    rect(x, y, w, h);
    noFill();
    stroke(colour);
    strokeWeight(1.5 * px);
    rect(x, y, w, h);
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
    text(`${Editor.pages[Editor.tab] + 1} / ${Editor.pageCounts[Editor.tab]}`, GAME_W - 24, this.y + 66);
    text('or right click', 38, this.y + 66);
  }
}

// one tile or object in the bar. a Button, so clicking works the same, but it draws the tile or
// object instead of a box
class PaletteSwatch extends Button {
  constructor(options) {
    super(options);
    // 'tile' or 'object', its name, and which page of the bar it's on
    this.kind = options.kind;
    this.name = options.name;
    this.page = options.page;
  }

  draw() {
    const selected = Editor.isSelected(this.kind, this.name);
    const y = this.y + (this.pressed && this.hovered ? 1 : 0);

    if (this.kind === 'tile') {
      this.drawArt(TILE_TYPES[this.name], this.x, y, this.w, this.h);
    } else {
      // objects sit on a dark square, shrunk to fit but keeping their shape,
      // so a 2 x 1 table looks twice as wide as it is tall
      const type = OBJECT_TYPES[this.name];
      noStroke();
      fill(42, 45, 54);
      rect(this.x, y, this.w, this.h);
      const scale = Math.min(this.w / type.width, this.h / type.height) * 0.8;
      const w = type.width * scale;
      const h = type.height * scale;
      this.drawArt(type, this.x + (this.w - w) / 2, y + (this.h - h) / 2, w, h, 4);
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
    text(this.name, this.x + this.w / 2, this.y + this.h + 12);
  }

  // a tile's or object's picture, or its colour if it hasn't got one
  drawArt(type, x, y, w, h, radius = 0) {
    if (type.img) {
      image(type.img, x, y, w, h);
    } else {
      noStroke();
      fill(type.fill);
      rect(x, y, w, h, radius);
    }
  }
}
