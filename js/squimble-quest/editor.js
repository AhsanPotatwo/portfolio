// the map editor. a simple way to build maps: paint tiles, and place objects, enemies and npcs,
// on the map you're on. open it from dev mode: press ` (or Ctrl + D) for dev mode, then B (for build).
//
// while it's open:
//   - everyone stops, and WASD / the arrow keys move the camera around instead. the ui fades out
//     while you move, so you can see the map, and comes back when you stop
//   - pick something from the bar at the bottom. the tabs above it switch between
//     tiles, objects, enemies, npcs and triggers (‹ › for more pages once there are lots)
//   - tiles: left click or drag to paint, replacing whatever tile was there. + New tile (next to the
//     tabs) makes a tile, right clicking one in the bar changes it, and Export tiles saves them all
//     as tiles.json (the tile editor, tileeditor.js)
//   - objects: left click to place one, its top left corner on the tile under the mouse
//   - enemies and npcs: left click to place one, standing on the tile under the mouse
//   - pick Erase in the bar, then left click or drag to erase. if you start on an object, enemy,
//     npc or warp it removes those, otherwise it empties tiles. empty tiles are like off the edge
//     of the map: nothing's drawn there and nothing can walk on them
//   - right click something to change its settings: a warp on the map, or a tile in the bar
//   - opening the editor brings back every enemy placed on the map, including defeated ones, so
//     you always see the whole design. closing it puts every enemy and npc back where it was
//     placed, with full health. (outside the editor, each map remembers its enemies and npcs as
//     they were left, see loadMap() in sketch.js)
//   - triggers: left click to place one.
//       spawn: the player's spawn point (a yellow ring), which moves to the tile under the mouse
//       warp:  a way to another map (warps.js), a purple square. placing one opens a box to pick
//              its name, where it leads and how it opens. right click it to change those later.
//              Show links in that box draws every warp linked to it (warpgraph.js)
//   - Map settings (top right) opens a panel for the whole map: Resize map changes its size
//     (never smaller than the area with tiles in it), New map makes a map of any size filled
//     with any tile, Open file loads one and Export saves the map as a file. sizes, the fill and
//     the name are all asked for in a box in the game (FormBox, formbox.js)
//   - the dev mode keys still work (zoom, teleport, next map), and H lists them all
//
// every tile (tiles.json), and everything in objects.js, enemies.js and npcs.js, shows up in the bar
// by itself.
//
// changes are made to the map you're on, so you can walk around on them straight away. going to
// another map (M) and back keeps them, but reloading the page builds every map fresh from its
// file, so Export them to keep them. the full guide is in assets/squimble-quest/maps/README.md

// how fast WASD moves the camera, in screen pixels a second (so it feels the same at any zoom)
const EDITOR_PAN_SPEED = 600;

// the biggest a new map can be each way, in tiles. just to stop a typo making a gigantic map
const EDITOR_MAX_MAP_SIZE = 500;

// what a map made with New map is called until it's exported with a name of its own
const NEW_MAP_NAME = 'new-map';

// the editor's keys, in the list dev mode's H shows (under dev mode's own, see debug.js)
const EDITOR_KEYS = [
  'MAP EDITOR KEYS',
  'left click  paint / place',
  'right click change settings (warps, tiles in the bar)',
  'WASD        move around',
  'wheel       zoom',
  'B           close the editor',
];

// the ui fading out while WASD moves the camera
const EDITOR_UI_FADE = {
  // how long after you stop moving before it comes back, in seconds
  showDelay: 0.3,
  // how quickly it fades out and back in. higher is quicker, like CAMERA.followSpeed
  speed: 14,
};

// layout of the bar along the bottom, in screen pixels
const EDITOR_BAR = {
  height: 84,
  // each square, and the space each one gets (square + gap + room for its name)
  swatchSize: 44,
  slotWidth: 60,
  // where the squares start and stop across the bar. the rest is the Erase square and arrows
  swatchesLeft: 110,
  swatchesRight: GAME_W - 44,
  // the tabs sitting on top of the bar, and the gap between them
  tabWidth: 96,
  tabHeight: 28,
  tabGap: 2,
};

// the bar's colours
const EDITOR_COLOURS = {
  // the bar and the open tab, the same colour so they look like one piece
  bar: '#1f232b',
  // a thin line along the top of the bar. the open tab covers it, so it looks joined on
  edge: '#3a404c',
  // tabs that aren't open are darker, and lighten when the mouse is over them
  tab: '#14171c',
  tabHover: '#2a2f39',
  // the strip along the top of the open tab
  accent: '#4a7bd8',
};

// the Map settings button in the top right corner, and the panel it opens underneath it
const EDITOR_SETTINGS = {
  buttonWidth: 120,
  buttonHeight: 30,
  panelWidth: 200,
  // the map's name and size go at the top of the panel, then a button every rowHeight
  headerHeight: 56,
  rowHeight: 40,
};

// everything in the Triggers tab. unlike the other tabs, these aren't in a catalogue file of their
// own, each one is placed by its own code in Editor.update() and drawn by PaletteSwatch
const TRIGGER_TYPES = {
  // where the player starts on this map, and comes back to after dying. there's only one, so
  // placing it moves it
  spawn: {},
  // a way to another map, or somewhere else on this one (warps.js). one per tile
  warp: {},
};

// the tabs above the bar, left to right. each one shows everything in its catalogue (types), and
// kind is what the editor calls one of them. a new kind of thing to place is a new line here, then
// placing it in Editor.update(). TILE_TYPES starts empty and fills in from tiles.json (tiles.js),
// which is why the bar's squares are made later, in makeSwatches()
const EDITOR_TABS = [
  { kind: 'tile', label: 'Tiles', types: TILE_TYPES },
  // furniture, decorations, chests... everything in objects.js
  { kind: 'object', label: 'Objects', types: OBJECT_TYPES },
  { kind: 'enemy', label: 'Enemies', types: ENEMY_TYPES },
  { kind: 'npc', label: 'NPCs', types: NPC_TYPES },
  // things on the map that make something happen, like where the player spawns and warps
  { kind: 'trigger', label: 'Triggers', types: TRIGGER_TYPES },
];

// each tab's catalogue by its kind, e.g. EDITOR_CATALOGUES.enemy is ENEMY_TYPES
const EDITOR_CATALOGUES = Object.fromEntries(EDITOR_TABS.map(({ kind, types }) => [kind, types]));

// a box for a map's width or height, starting at value. it won't go below min or above
// EDITOR_MAX_MAP_SIZE (NumberField is in textfield.js)
function sizeField(value, min = 1) {
  return new NumberField({ w: 90, value, min, max: EDITOR_MAX_MAP_SIZE });
}

// is this tab's kind a character that gets placed standing on a tile (an enemy or npc)?
function isCharacterKind(kind) {
  return kind in SPAWN_KINDS;
}

// where a resized map's left column (or top row) goes, one direction at a time. start and length
// are the map's now, newLength its new size. it stays centred on where the map was, but is moved
// over if needed so first to last (the columns or rows with tiles in, undefined if there are none)
// still fit inside it
function resizedStart(start, length, newLength, first, last) {
  const centred = start + Math.floor((length - newLength) / 2);
  if (first === undefined) return centred;
  return constrain(centred, last - newLength + 1, first);
}

const Editor = {
  active: false,
  // what's picked in the bar: { kind, name } (kind is one of the EDITOR_TABS), or null for Erase.
  // starts on a tile that isn't there, so makeSwatches() picks the first tile once they've loaded
  selected: { kind: 'tile', name: '' },
  // which tab is showing (a kind from EDITOR_TABS), and for each tab, which page it's on and how
  // many pages it has. each tab remembers its own page, so switching back finds it where you left it
  tab: 'tile',
  pages: {},
  pageCounts: {},
  // what the camera looks at while editing. WASD moves this, the camera follows it
  view: { x: 0, y: 0 },
  // where the mouse was last frame while dragging, so fast drags can fill in the gap
  lastPaint: null,
  // whether the current erase drag is removing objects, characters and warps (true) or emptying tiles (false)
  erasingThings: false,
  // how see-through the ui is, 1 solid to 0 gone. it fades out while WASD moves the camera
  // (sketch.js draws the ui with it). stillFor is how long since the camera last moved, in seconds
  uiAlpha: 1,
  stillFor: 0,

  // the editor's ui elements that it changes later, made in init() (the squares in makeSwatches())
  swatches: [],
  prevButton: null,
  nextButton: null,
  settingsButton: null,
  // + New tile and Export tiles, only shown on the Tiles tab
  tileButtons: [],

  // call once from setup(). makes the bar, the tabs, and the Map settings button and its panel
  // (all hidden until they're needed). the squares in the bar come later, from makeSwatches()
  init() {
    const barY = GAME_H - EDITOR_BAR.height;

    // everything's in the 'editor' group, so it can be shown and hidden together.
    // the bar goes first so it's underneath the rest, and it blocks clicks between the buttons
    // from painting the map behind it
    const add = (element) => UI.add(Object.assign(element, { group: 'editor' }));
    add(new EditorBar({ x: 0, y: barY, w: GAME_W, h: EDITOR_BAR.height }));

    // Erase, a square like the rest, in the middle of its own slot at the left end of the bar.
    // it's on every tab, so it isn't in swatches (showPage() only shows the open tab's)
    add(new PaletteSwatch({
      x: 10 + (EDITOR_BAR.slotWidth - EDITOR_BAR.swatchSize) / 2,
      y: barY + 10,
      w: EDITOR_BAR.swatchSize,
      h: EDITOR_BAR.swatchSize,
      kind: 'erase',
      name: 'erase',
      onClick: () => { this.selected = null; },
    }));

    // page arrows. they go round, so › on the last page goes back to the first.
    // showPage() hides them when the tab only has one page
    const arrows = { style: { textSize: 20 } };
    this.prevButton = add(new Button({ ...arrows, x: 74, y: barY + 10, w: 28, h: 44, label: '‹', onClick: () => this.turnPage(-1) }));
    this.nextButton = add(new Button({ ...arrows, x: GAME_W - 38, y: barY + 10, w: 28, h: 44, label: '›', onClick: () => this.turnPage(1) }));

    // the tabs, sitting on top of the bar like tabs in a web browser
    EDITOR_TABS.forEach(({ kind, label }, i) => add(new EditorTab({
      x: 10 + i * (EDITOR_BAR.tabWidth + EDITOR_BAR.tabGap),
      y: barY - EDITOR_BAR.tabHeight,
      w: EDITOR_BAR.tabWidth,
      h: EDITOR_BAR.tabHeight,
      label,
      kind,
      onClick: () => this.showTab(kind),
    })));

    // the tile editor's buttons (tileeditor.js), on the right of the tabs. showPage() only shows them
    // on the Tiles tab
    const tileButton = (label, right, onClick) => add(new Button({
      x: GAME_W - right, y: barY - EDITOR_BAR.tabHeight + 2, w: 110, h: EDITOR_BAR.tabHeight - 4,
      label, style: { textSize: 13 }, onClick,
    }));
    this.tileButtons = [
      tileButton('+ New tile', 240, () => TileEditor.open(null)),
      tileButton('Export tiles', 124, () => TileEditor.exportTiles()),
    ];

    // Map settings, top right. a toggle, so it looks switched on while its panel is open
    const s = EDITOR_SETTINGS;
    this.settingsButton = add(new Button({
      x: GAME_W - 8 - s.buttonWidth, y: 8, w: s.buttonWidth, h: s.buttonHeight, label: 'Map settings',
      style: { textSize: 13, onFill: EDITOR_COLOURS.accent },
      toggle: true,
      onClick: (button) => this.showSettings(button.on),
    }));

    // the panel it opens, in its own group so it can be shown and hidden on its own. each button
    // closes the panel, then does its thing
    const actions = [
      { label: 'Resize map', onClick: () => this.resizeMap() },
      { label: 'New map', onClick: () => this.newMap() },
      { label: 'Open file', onClick: () => openMapFile() },
      { label: 'Export', style: 'primary', onClick: () => this.askToExport() },
    ];
    const panelX = GAME_W - 8 - s.panelWidth;
    const panelY = 8 + s.buttonHeight + 6;
    const inPanel = (element) => UI.add(Object.assign(element, { group: 'editor-settings' }));
    inPanel(new SettingsPanel({
      x: panelX, y: panelY, w: s.panelWidth, h: s.headerHeight + actions.length * s.rowHeight + 4,
    }));
    actions.forEach(({ onClick, ...options }, i) => inPanel(new Button({
      x: panelX + 8,
      y: panelY + s.headerHeight + i * s.rowHeight,
      w: s.panelWidth - 16,
      h: s.rowHeight - 8,
      // a little smaller text than normal, plus the named style (Export's 'primary') if it has one
      style: { textSize: 14, ...(options.style && BUTTON_STYLES[options.style]) },
      label: options.label,
      onClick: () => {
        this.showSettings(false);
        onClick();
      },
    })));

    UI.showGroup('editor', false);
    this.showSettings(false);
  },

  // makes the squares in the bar: one per tile, object, enemy and npc, each knowing its tab and page.
  // run once the tiles have loaded (sketch.js), and again whenever the tile editor adds a tile,
  // which throws away the old squares first
  makeSwatches() {
    for (const swatch of this.swatches) UI.remove(swatch);
    const barY = GAME_H - EDITOR_BAR.height;
    const perPage = Math.floor((EDITOR_BAR.swatchesRight - EDITOR_BAR.swatchesLeft) / EDITOR_BAR.slotWidth);

    this.swatches = [];
    for (const { kind, types } of EDITOR_TABS) {
      const names = Object.keys(types);
      // how many pages it needs (at least 1, even if it's empty). a tab stays on its page if it can
      this.pageCounts[kind] = Math.max(1, Math.ceil(names.length / perPage));
      this.pages[kind] = Math.min(this.pages[kind] ?? 0, this.pageCounts[kind] - 1);
      names.forEach((name, i) => {
        const slot = i % perPage;
        // in the 'editor' group like everything init() makes, so they show, hide and fade with it
        this.swatches.push(UI.add(new PaletteSwatch({
          x: EDITOR_BAR.swatchesLeft + slot * EDITOR_BAR.slotWidth + (EDITOR_BAR.slotWidth - EDITOR_BAR.swatchSize) / 2,
          y: barY + 10,
          w: EDITOR_BAR.swatchSize,
          h: EDITOR_BAR.swatchSize,
          group: 'editor',
          kind,
          name,
          page: Math.floor(i / perPage),
          onClick: () => { this.selected = { kind, name }; },
        })));
      });
    }

    // the picked thing is gone (or nothing's been picked yet), so pick the first tile. null is Erase
    if (this.selected && !EDITOR_CATALOGUES[this.selected.kind][this.selected.name]) {
      this.selected = { kind: 'tile', name: Object.keys(TILE_TYPES)[0] };
    }

    // new ui elements start visible, so with the editor closed they're hidden until it opens
    if (this.active) this.showPage(this.pages[this.tab]);
    else for (const swatch of this.swatches) swatch.visible = false;
  },

  // opens or closes the Map settings panel
  showSettings(open) {
    this.settingsButton.on = open;
    UI.showGroup('editor-settings', open);
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
    // stop any conversation first, its text box would be in the way (dialogue.js)
    if (Dialogue.active) Dialogue.close();
    // every enemy placed on the map comes back where it was placed, defeated or not, so you see the
    // whole design (and it's a quick way to reset them while testing). sketch.js
    spawnCharacters();
    // start looking at wherever the camera already is, and follow the editor's view instead of the
    // player. follow() also stops the conversation's camera glide
    this.view = { x: camera.x, y: camera.y };
    camera.follow(this.view);
    // the ui starts showing, rather than fading in
    this.uiAlpha = 1;
    this.stillFor = EDITOR_UI_FADE.showDelay;
    UI.showGroup('editor', true);
    // the editor's bar goes where the hotbar is (inventory.js)
    if (InventoryScreen.active) InventoryScreen.show(false);
    Hotbar.show(false);
    this.showTab(this.tab);
  },

  close(player, camera) {
    this.active = false;
    this.lastPaint = null;
    camera.follow(player);
    // every enemy and npc back where it was placed, with full health (sketch.js)
    spawnCharacters();
    UI.showGroup('editor', false);
    this.showSettings(false);
    // Ctrl + D still works while typing, so dev mode (and the editor) can close with the box open
    if (WarpGraph.active) WarpGraph.close();
    if (FormBox.active) FormBox.close();
    Hotbar.show(true);
  },

  // ---------- tabs and pages ----------

  // switches the bar to a tab (a kind from EDITOR_TABS), on whichever page it was last on
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
    this.prevButton.visible = morePages;
    this.nextButton.visible = morePages;
    for (const button of this.tileButtons) button.visible = this.tab === 'tile';
  },

  // is this the one picked in the bar?
  isSelected(kind, name) {
    return this.selected !== null && this.selected.kind === kind && this.selected.name === name;
  },

  // ---------- new map, resizing and exporting ----------

  // asks for a size and what to fill it with, then makes a new map like that and goes to it.
  // it starts as blank tiles, but can be any tile, or empty (handy for rooms that aren't
  // rectangles: start empty, then paint the floor in whatever shape you like)
  newMap() {
    FormBox.open({
      title: 'New map',
      confirmLabel: 'Make map',
      rows: [
        { label: 'Width', field: sizeField(40), after: 'tiles' },
        { label: 'Height', field: sizeField(24), after: 'tiles' },
        { label: 'Fill', field: tilePicker('blank') },
      ],
      onConfirm: ([cols, rows, fillWith]) => {
        // added to MAPS like any other map, so dev mode's M key can come back to it (maps.js)
        addMap(NEW_MAP_NAME, () => makeBlankMap(cols, rows, fillWith));
        loadMap(NEW_MAP_NAME); // in sketch.js
      },
    });
  },

  // asks for a new size for the map you're on. it can't be made smaller than the area with tiles
  // in it: asking for less gives the smallest it can be. it grows and shrinks around its middle,
  // moved over if needed so every tile still fits, and any new space is empty.
  // worldMap and gameCamera are the game's (sketch.js)
  resizeMap() {
    const map = worldMap;
    const used = map.usedArea();
    const minCols = used ? used.right - used.left + 1 : 1;
    const minRows = used ? used.bottom - used.top + 1 : 1;

    FormBox.open({
      title: 'Resize map',
      hint: `Smallest it can be: ${minCols} x ${minRows}`,
      confirmLabel: 'Resize',
      // the boxes won't go below the smallest, so asking for less gives the smallest it can be
      rows: [
        { label: 'Width', field: sizeField(map.cols, minCols), after: 'tiles' },
        { label: 'Height', field: sizeField(map.rows, minRows), after: 'tiles' },
      ],
      onConfirm: ([cols, rows]) => {
        map.resize(
          resizedStart(map.left, map.cols, cols, used?.left, used?.right),
          resizedStart(map.top, map.rows, rows, used?.top, used?.bottom),
          cols,
          rows
        );
        gameCamera.bounds = map.bounds();
        // anyone whose spawn was on the part that's gone disappears
        spawnCharacters();
      },
    });
  },

  // asks for a name, then saves the map you're on as a file with that name (exportMap() and
  // cleanMapName() are in mapfile.js, worldMap is the game's in sketch.js)
  askToExport() {
    FormBox.open({
      title: 'Export map',
      hint: 'Letters, numbers, - and _',
      confirmLabel: 'Export',
      rows: [{ label: 'Name', field: new TextField({ w: 180, value: worldMap.name }) }],
      // no name, no file name (only spaces counts as none)
      canConfirm: ([name]) => cleanMapName(name) !== '',
      onConfirm: ([name]) => exportMap(worldMap, name),
    });
  },

  // ---------- every frame, while open ----------

  // aim is the mouse's world position, or null
  update(map, camera, aim, dt) {
    // while the form box is open, it's all that happens. it's ui too, so it fades with the rest:
    // bring everything straight back, or a box opened while the ui was faded out (placing a warp
    // just after moving) would be invisible, and nothing but Enter or Escape would work.
    // the warp graph opens over a warp's form box, and takes over from it until it closes (warpgraph.js)
    if (FormBox.active) {
      this.uiAlpha = 1;
      this.stillFor = EDITOR_UI_FADE.showDelay;
      if (WarpGraph.active) WarpGraph.update();
      else FormBox.update();
      return;
    }

    const dir = Input.direction();

    // moving fades the ui out so you can see the map, and it fades back in once you've stopped for
    // a moment. while it's hidden it can't be clicked, so clicks go through to the map behind it.
    // moving closes the Map settings panel too
    this.stillFor = dir.x === 0 && dir.y === 0 ? this.stillFor + dt : 0;
    const showUI = this.stillFor >= EDITOR_UI_FADE.showDelay;
    this.uiAlpha = approach(this.uiAlpha, showUI ? 1 : 0, EDITOR_UI_FADE.speed, dt);
    for (const el of UI.group('editor')) el.interactive = showUI;
    if (!showUI && this.settingsButton.on) this.showSettings(false);

    // move the view with WASD. dividing by zoom keeps it the same speed on screen at any zoom
    const speed = EDITOR_PAN_SPEED / camera.zoom;
    const bounds = map.bounds();
    this.view.x = constrain(this.view.x + dir.x * speed * dt, bounds.left, bounds.right);
    this.view.y = constrain(this.view.y + dir.y * speed * dt, bounds.top, bounds.bottom);

    // the tile under the mouse, or null if the mouse isn't over the game
    const over = aim && Input.mouse.inside ? { col: map.colAt(aim.x), row: map.rowAt(aim.y) } : null;

    // objects, enemies, npcs and triggers: one per click. mousePressed() ignores clicks that landed
    // on the editor's ui, like the bar or the Map settings panel (see input.js)
    if (over && Input.mousePressed('left') && this.selected) {
      const { kind, name } = this.selected;
      if (kind === 'object') this.placeObject(map, name, over.col, over.row);
      if (isCharacterKind(kind)) this.placeCharacter(map, kind, name, over.col, over.row);
      if (kind === 'trigger' && name === 'spawn') this.placeSpawn(map, over.col, over.row);
      if (kind === 'trigger' && name === 'warp') this.placeWarp(map, over.col, over.row);
    }

    // right click changes the settings of whatever's there. only warps have any so far, anything
    // else that gets settings later can be added here
    if (over && Input.mousePressed('right')) {
      const warp = map.warpAt(over.col, over.row);
      if (warp) this.editWarp(map, warp);
    }

    // tiles and erasing: keep going while the button's held
    const erasing = this.selected === null && Input.mouseHeld('left');
    const painting = this.selected?.kind === 'tile' && Input.mouseHeld('left');

    if (over && (painting || erasing)) {
      // an erase drag that starts on an object, enemy, npc or warp only removes those, otherwise it
      // only empties tiles. stops one drag removing a table and then the floor it was standing on
      if (!this.lastPaint) this.erasingThings = erasing && this.thingsAt(map, over.col, over.row);

      let removedCharacter = false;
      this.forEachTileOnLine(map, this.lastPaint ?? aim, aim, (col, row) => {
        if (painting) {
          map.set(col, row, this.selected.name);
        } else if (this.erasingThings) {
          map.removeObjectsAt(col, row);
          map.removeWarpAt(col, row);
          for (const kind of Object.keys(SPAWN_KINDS)) {
            if (map.removeSpawnsAt(kind, col, row)) removedCharacter = true;
          }
        } else {
          map.set(col, row, null);
        }
      });
      // so removed enemies and npcs disappear straight away
      if (removedCharacter) spawnCharacters();
      this.lastPaint = aim;
    } else {
      this.lastPaint = null;
    }
  },

  // is there an object, enemy, npc or warp on this tile?
  thingsAt(map, col, row) {
    if (map.objectsAt(col, row).length > 0 || map.warpAt(col, row)) return true;
    return Object.keys(SPAWN_KINDS).some((kind) => map.spawnsAt(kind, col, row).length > 0);
  },

  // places an object with its top left corner on col, row
  placeObject(map, name, col, row) {
    if (!map.inside(col, row)) return;
    // not the same object twice in exactly the same spot (easy to do with a double click)
    if (map.objects.some((obj) => obj.type === name && obj.col === col && obj.row === row)) return;
    map.addObject(name, col, row);
  },

  // places an enemy or npc (kind) standing on col, row. not on solid or empty tiles, it'd be stuck
  placeCharacter(map, kind, name, col, row) {
    if (map.isSolid(col, row)) return;
    if (map.spawnsAt(kind, col, row).some((spawn) => spawn.type === name)) return;
    map.addSpawn(kind, name, col, row);
    // so it appears straight away
    spawnCharacters();
  },

  // the player will start with their feet in the middle of this tile. not on solid or empty
  // tiles, they'd be stuck
  placeSpawn(map, col, row) {
    if (map.isSolid(col, row)) return;
    map.setSpawnTile(col, row);
  },

  // puts a warp on col, row (warps.js), then opens its settings. it can go on any tile of the map,
  // even under an object or npc. clicking a warp that's already there opens its settings instead
  placeWarp(map, col, row) {
    if (!map.inside(col, row)) return;
    let warp = map.warpAt(col, row);
    if (!warp) {
      // named warp1, warp2... whichever's free first, until it's given a better name
      let number = 1;
      while (map.warp(`warp${number}`)) number++;
      // goes nowhere and opens by stepping on it, until its settings say otherwise
      warp = { name: `warp${number}`, col, row, to: '', toWarp: '', activate: 'step', enemies: false };
      map.warps.push(warp);
    }
    this.editWarp(map, warp);
  },

  // a box for changing a warp's settings: its name, which map it goes to, which warp on that map
  // it arrives at, whether it opens by stepping on it or pressing E, and whether enemies chasing
  // the player can follow them through it. the warp changes when
  // the box is confirmed, Cancel leaves it how it was. Show links opens the warp graph over it
  // (warpgraph.js), which shows the warp as it was last saved
  editWarp(map, warp) {
    // the warps it can arrive at on the map it goes to. '' is that map's spawn point
    const arriveChoices = (mapName) => ['', ...warpNamesOn(mapName)];
    // a map or warp it leads to that doesn't exist any more still shows in the list, marked
    // missing, so opening the box doesn't quietly change where it leads
    const withCurrent = (choices, current) => (choices.includes(current) ? choices : [...choices, current]);
    const missing = (name, exists) => (exists ? name : `${name} (missing)`);

    const arrivePicker = new Picker({
      w: 180,
      choices: withCurrent(arriveChoices(warp.to), warp.toWarp),
      value: warp.toWarp,
      label: (name) => (name ? missing(name, getMap(mapPicker.value)?.warp(name)) : 'spawn point'),
    });
    const mapPicker = new Picker({
      w: 180,
      choices: withCurrent(['', ...Object.keys(MAPS)], warp.to),
      value: warp.to,
      label: (name) => (name ? missing(name, MAPS[name]) : 'nowhere'),
      // a different map has different warps, so start again from its spawn point
      onChange: (name) => arrivePicker.setChoices(arriveChoices(name), ''),
    });

    FormBox.open({
      title: 'Warp',
      hint: 'Click the right of a choice for the next one',
      confirmLabel: 'Save',
      rows: [
        { label: 'Name', field: new TextField({ w: 180, value: warp.name }) },
        { label: 'Goes to', field: mapPicker },
        { label: 'Arrive at', field: arrivePicker },
        {
          label: 'Opens by',
          field: new Picker({
            w: 180,
            choices: ['step', 'interact'],
            value: warp.activate,
            label: (how) => (how === 'step' ? 'stepping on it' : 'pressing E'),
          }),
        },
        { label: 'Enemies', field: new Checkbox({ w: 180, value: warp.enemies, label: 'follow you through' }) },
        // last, so it doesn't move the others in the values onConfirm gets (a button has no value)
        {
          label: 'Links',
          field: new Button({ w: 180, label: 'Show links', style: { textSize: 14 }, onClick: () => WarpGraph.open(map.name, warp.name) }),
        },
      ],
      // needs a name, and one no other warp on this map has, so warps can lead to it
      canConfirm: ([name]) => name.trim() !== '' && !map.warps.some((other) => other !== warp && other.name === name.trim()),
      onConfirm: ([name, to, toWarp, activate, enemies]) => {
        Object.assign(warp, { name: name.trim(), to, toWarp: to ? toWarp : '', activate, enemies });
      },
    });
  },

  // where a character's body would be if it stood on this tile, as a box (standingOnTile() is in
  // character.js, the same as Character.placeFeetOnTile() uses)
  characterBodyOnTile(type, col, row) {
    const centre = standingOnTile(type, col, row);
    return { x: centre.x - type.width / 2, y: centre.y - type.height / 2, w: type.width, h: type.height };
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

  // marks the spawn point and warps, and shows what a click would do under the mouse.
  // uses world positions, so draw it before camera.end(). it's drawn after the characters, so
  // these markers show on top of everything
  drawCursor(map, camera, aim) {
    // same trick as the grid: divide by zoom so lines stay the same thickness on screen
    const px = 1 / camera.zoom;

    // every warp (warps.js), and the spawn point: a ring where the player's feet will be
    for (const warp of map.warps) drawWarpMarker(warp, px);
    drawSpawnRing(map.spawn.x, map.spawn.y + feetBelowCentre(PLAYER), px);

    if (!aim || !Input.mouse.inside || UI.hovered) return;
    const col = map.colAt(aim.x);
    const row = map.rowAt(aim.y);
    if (!map.inside(col, row)) return;

    // the spawn: where its ring would go, as well as the tile outline below
    if (this.isSelected('trigger', 'spawn')) {
      const feet = standingOnTile(PLAYER, col, row);
      drawSpawnRing(feet.x, feet.y + feetBelowCentre(PLAYER), px);
    }

    // an object: a see-through preview of it, covering the tiles it would
    if (this.selected?.kind === 'object') {
      const type = OBJECT_TYPES[this.selected.name];
      this.drawGhost(type, col * TILE, row * TILE, type.width * TILE, type.height * TILE, px);
      return;
    }

    // an enemy or npc: a see-through preview of it, standing on the tile
    if (this.selected && isCharacterKind(this.selected.kind)) {
      const type = EDITOR_CATALOGUES[this.selected.kind][this.selected.name];
      const body = this.characterBodyOnTile(type, col, row);
      this.drawGhost(type, body.x, body.y, body.w, body.h, px);
      return;
    }

    // erasing over objects and enemies: outline the ones that would be removed
    if (this.selected === null) {
      noFill();
      for (const obj of map.objectsAt(col, row)) {
        const type = OBJECT_TYPES[obj.type];
        this.outline(obj.col * TILE, obj.row * TILE, type.width * TILE, type.height * TILE, '#ff6b6b', px);
      }
      for (const kind of Object.keys(SPAWN_KINDS)) {
        for (const spawn of map.spawnsAt(kind, col, row)) {
          const body = this.characterBodyOnTile(EDITOR_CATALOGUES[kind][spawn.type], col, row);
          this.outline(body.x, body.y, body.w, body.h, '#ff6b6b', px);
        }
      }
    }

    // the tile under the mouse. red when erasing
    noFill();
    this.outline(col * TILE, row * TILE, TILE, TILE, this.selected === null ? '#ff6b6b' : '#ffffff', px);
  },

  // a see-through picture of an object or enemy (type), with an outline
  drawGhost(type, x, y, w, h, px) {
    if (type.img) {
      // tint() with a second number fades an image, noTint() puts it back for everything after
      tint(255, 110);
      image(type.img, x, y, w, h);
      noTint();
      noFill();
    } else {
      // a brand new colour, made from the type's. color(type.fill) would hand back the type's
      // own colour rather than a copy, so fading it would fade every one of them on the map too
      fill(red(type.fill), green(type.fill), blue(type.fill), 110);
    }
    this.outline(x, y, w, h, '#ffffff', px);
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
};

// ---------- the bar's ui elements ----------
// both build on the ui system (ui.js / button.js), see "making a new kind of ui element" in ui.js

// the dark strip along the bottom. doesn't do anything when clicked, but as a ui element it
// stops clicks on it reaching the map behind
class EditorBar extends UIElement {
  draw() {
    noStroke();
    fill(EDITOR_COLOURS.bar);
    rect(this.x, this.y, this.w, this.h);
    // the line along the top. the open tab is drawn over it (EditorTab below)
    fill(EDITOR_COLOURS.edge);
    rect(this.x, this.y, this.w, 1);

    // which page, under the › arrow, when there's more than one
    const pages = Editor.pageCounts[Editor.tab];
    if (pages > 1) {
      fill(255, 255, 255, 150);
      setText(11);
      text(`${Editor.pages[Editor.tab] + 1} / ${pages}`, GAME_W - 24, this.y + 66);
    }
  }
}

// one of the tabs on top of the bar (Tiles, Objects...). a Button, so clicking works the same, but
// it's drawn like a tab in a web browser: the open one is the bar's colour and joins onto it,
// the others are darker and sit behind
class EditorTab extends Button {
  constructor(options) {
    super(options);
    // which tab it is, a kind from EDITOR_TABS
    this.kind = options.kind;
  }

  draw() {
    const open = Editor.tab === this.kind;
    noStroke();

    // p5's rect() can take a radius for each corner: top left, top right, bottom right, bottom left.
    // the open tab goes 1px lower, over the line along the top of the bar, so they look like one piece
    if (open) fill(EDITOR_COLOURS.bar);
    else fill(this.hovered ? EDITOR_COLOURS.tabHover : EDITOR_COLOURS.tab);
    rect(this.x, this.y, this.w, this.h + (open ? 1 : 0), 6, 6, 0, 0);

    // kept inside the rounded corners, so it doesn't poke out past them
    if (open) {
      fill(EDITOR_COLOURS.accent);
      rect(this.x + 6, this.y, this.w - 12, 2, 1);
    }

    fill(open ? 255 : this.hovered ? 220 : 140);
    setText(13);
    text(this.label, this.x + this.w / 2, this.y + this.h / 2 + 1);
  }
}

// one tile, object, enemy, npc or trigger in the bar, or the Erase square. a Button, so clicking
// works the same, but it draws the thing itself instead of a box
class PaletteSwatch extends Button {
  constructor(options) {
    super(options);
    // its kind (from EDITOR_TABS, or 'erase'), its name, and which page of the bar it's on
    this.kind = options.kind;
    this.name = options.name;
    this.page = options.page;
  }

  // like any button, and right clicking a tile opens the tile editor on it (tileeditor.js). the ui
  // claims any click on it (ui.js), so the right click doesn't also reach the map behind
  update(hovered) {
    super.update(hovered);
    if (this.kind === 'tile' && this.hovered && Input.buttonsPressed.has('right')) TileEditor.open(TILE_TYPES[this.name]);
  }

  draw() {
    const erase = this.kind === 'erase';
    // Erase is picked when nothing else is (Editor.selected is null)
    const selected = erase ? Editor.selected === null : Editor.isSelected(this.kind, this.name);
    // the edge and name colour when it's picked: red for Erase, like its outline on the map
    const pickedColour = erase ? '#ff6b6b' : '#ffd23f';
    const y = this.y + (this.pressed && this.hovered ? 1 : 0);

    if (this.kind === 'tile') {
      drawTypeArt(TILE_TYPES[this.name], this.x, y, this.w, this.h);
    } else {
      // everything else sits on a dark square
      noStroke();
      fill(42, 45, 54);
      rect(this.x, y, this.w, this.h);
      const middleX = this.x + this.w / 2;
      const middleY = y + this.h / 2;
      if (erase) {
        // a red cross
        stroke('#ff6b6b');
        strokeWeight(3);
        line(middleX - 8, middleY - 8, middleX + 8, middleY + 8);
        line(middleX + 8, middleY - 8, middleX - 8, middleY + 8);
      } else if (this.name === 'spawn') {
        // drawn like its ring on the map
        drawSpawnRing(middleX, middleY);
      } else if (this.name === 'warp') {
        // drawn like its square on the map (warps.js)
        drawWarpSquare(middleX - 12, middleY - 12, 24, WARP_COLOURS.edge, false);
      } else {
        // objects and characters are shrunk to fit but keep their shape, so a 2 x 1 table
        // looks twice as wide as it is tall
        const type = EDITOR_CATALOGUES[this.kind][this.name];
        const scale = Math.min(this.w / type.width, this.h / type.height) * 0.8;
        const w = type.width * scale;
        const h = type.height * scale;
        drawTypeArt(type, this.x + (this.w - w) / 2, y + (this.h - h) / 2, w, h, 4);
      }
    }

    // a coloured edge for the one that's picked, white when the mouse is over it
    noFill();
    if (selected) {
      stroke(pickedColour);
      strokeWeight(3);
    } else {
      stroke(this.hovered ? 255 : 90);
      strokeWeight(1.5);
    }
    rect(this.x, y, this.w, this.h);

    // its name underneath
    noStroke();
    fill(selected ? pickedColour : 220);
    setText(11);
    text(this.name, this.x + this.w / 2, this.y + this.h + 12);
  }
}

// a tile's, object's or character's picture, or its colour if it hasn't got one. a dual grid tile
// shows the piece from the middle of a patch of it (dualgrid.js)
function drawTypeArt(type, x, y, w, h, radius = 0) {
  const img = type.img ?? type.dualTiles?.[0b1111];
  if (img) {
    image(img, x, y, w, h);
  } else {
    noStroke();
    fill(type.fill);
    rect(x, y, w, h, radius);
  }
  // dual grid tiles (tiles.js) get a badge in the top right corner
  if (type.dualGrid) drawDualBadge(x + w - 15, y + 3);
}

// two little squares, one half across and down from the other, like the two grids a dual grid
// tile is drawn on. on a dark square so it shows up on any tile. x, y is its top left
function drawDualBadge(x, y) {
  noStroke();
  fill(0, 0, 0, 150);
  rect(x, y, 12, 12, 3);
  noFill();
  stroke(255);
  strokeWeight(1);
  rect(x + 2, y + 2, 5, 5);
  rect(x + 5, y + 5, 5, 5);
}

// the spawn point's marker: a yellow ring on a dark one, so it shows up on anything. px is one
// screen pixel, so on the zoomed map the lines stay the same thickness (see drawCursor())
function drawSpawnRing(x, y, px = 1) {
  noFill();
  stroke(0, 0, 0, 160);
  strokeWeight(4 * px);
  circle(x, y, 20);
  stroke('#ffd23f');
  strokeWeight(2 * px);
  circle(x, y, 20);
}

// the Map settings panel's background, with the map's name and size at the top. its buttons are
// separate ui elements on top of it (see init()). worldMap is the game's (sketch.js)
class SettingsPanel extends UIElement {
  draw() {
    fill(EDITOR_COLOURS.bar);
    stroke(EDITOR_COLOURS.edge);
    strokeWeight(1.5);
    rect(this.x, this.y, this.w, this.h, 8);

    noStroke();
    fill(255);
    setText(15, BOLD, LEFT, CENTER);
    text(worldMap.name, this.x + 12, this.y + 18);
    fill(255, 255, 255, 150);
    setText(13, NORMAL, LEFT, CENTER);
    text(`${worldMap.cols} x ${worldMap.rows} tiles`, this.x + 12, this.y + 38);
  }
}

// a Picker for tiles (what New map is filled with): every tile (TILE_TYPES), then null for empty,
// each with its picture (just an outline for empty)
function tilePicker(value) {
  return new Picker({
    w: 180,
    choices: [...Object.keys(TILE_TYPES), null],
    value,
    label: (name) => name ?? 'empty',
    art: (name, x, y, size) => {
      if (name) drawTypeArt(TILE_TYPES[name], x, y, size, size);
      noFill();
      stroke(90);
      strokeWeight(1);
      rect(x, y, size, size);
    },
  });
}
