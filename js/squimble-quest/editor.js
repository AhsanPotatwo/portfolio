// the map editor. a simple way to build maps: paint tiles, and place objects, enemies and npcs,
// on the map you're on. open it from dev mode: press ` (or Ctrl + D) for dev mode, then B (for build).
//
// it's laid out like a game engine (unity, godot...):
//   - a toolbar along the top: New, Open, Resize and Export for the map, the Paint and Erase tools,
//     Grid and Keys (the same as G and H), Play (closes the editor), and the map's name and size
//   - a dock on the right: the palette, with tabs for tiles, objects, enemies, npcs and triggers
//     (the mouse wheel scrolls it), and under it the inspector, showing what's picked
//   - a status bar along the bottom: the tile under the mouse, what a click does, and the zoom
//
// while it's open:
//   - everyone stops, and WASD / the arrow keys move the camera around instead. the ui fades out
//     while you move, so you can see the map, and comes back when you stop
//   - pick something in the palette (hover over one for its name), and it's what Paint uses
//   - tiles: left click or drag to paint, replacing whatever tile was there. New in the inspector
//     makes a tile, right clicking one in the palette (or Edit) changes it, and Export saves them all
//     as tiles.json (the tile editor, tileeditor.js)
//   - objects: left click to place one, its top left corner on the tile under the mouse
//   - enemies and npcs: left click to place one, standing on the tile under the mouse
//   - pick Erase in the toolbar, then left click or drag to erase. if you start on an object, enemy,
//     npc or warp it removes those, otherwise it empties tiles. empty tiles are like off the edge
//     of the map: nothing's drawn there and nothing can walk on them
//   - right click something to change its settings: a warp on the map, or a tile in the palette
//   - opening the editor brings back every enemy placed on the map, including defeated ones, so
//     you always see the whole design. closing it puts every enemy and npc back where it was
//     placed, with full health. (outside the editor, each map remembers its enemies and npcs as
//     they were left, see loadMap() in sketch.js)
//   - triggers: left click to place one.
//       spawn: the player's spawn point (a yellow ring), which moves to the tile under the mouse
//       warp:  a way to another map (warps.js), a purple square. placing one opens a box to pick
//              its name, where it leads and how it opens. right click it to change those later.
//              Show links in that box draws every warp linked to it (warpgraph.js)
//   - the toolbar's map buttons: Resize changes its size (never smaller than the area with tiles in
//     it), New makes a map of any size filled with any tile, Open loads one from a file and Export
//     saves the map as a file. sizes, the fill and the name are all asked for in a box in the game
//     (FormBox, formbox.js)
//   - the dev mode keys still work (zoom, teleport, next map), and H lists them all
//
// every tile (tiles.json), and everything in objects.js, enemies.js and npcs.js, shows up in the
// palette by itself.
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
  'right click change settings (warps, palette tiles)',
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

// where everything goes, in screen pixels (see the top of this file)
const EDITOR_LAYOUT = {
  toolbarHeight: 28,
  statusHeight: 20,
  // the dock on the right, its row of tabs, and the inspector at the bottom of it
  dockWidth: 224,
  tabHeight: 22,
  inspectorHeight: 150,
  // each square in the palette, and the space it gets (the square and a gap)
  swatchSize: 36,
  cellSize: 40,
  // the gap between the palette's squares and the dock's edges, and the scrollbar beside them
  padding: 6,
  // each of the ‹ › arrows at the end of the tabs, when there are more tabs than fit
  tabArrowWidth: 16,
  scrollbarWidth: 4,
  // how far one notch of the mouse wheel (about 100) scrolls the palette: about a row
  scrollRate: 0.4,
};

// the editor's colours, darkest to lightest, like most game engines' dark themes. the form box and
// warp graph use them too
const EDITOR_COLOURS = {
  // the dock's and form box's background
  bar: '#1f232b',
  // the toolbar, status bar, panel headers, and tabs that aren't open
  header: '#171a20',
  // behind the palette's objects and characters, and inside text boxes
  well: '#14171c',
  // lines between things, and outlines
  edge: '#3a404c',
  tabHover: '#2a2f39',
  // the open tab, and what's picked
  accent: '#4a7bd8',
  picked: '#ffd23f',
  erase: '#ff6b6b',
  text: '#e6e8ec',
  dimText: '#8b92a0',
};

// everything in the Triggers tab. unlike the other tabs, these aren't in a catalogue file of their
// own, each one is placed by its own code in Editor.update() and drawn by drawPaletteArt()
const TRIGGER_TYPES = {
  // where the player starts on this map, and comes back to after dying. there's only one, so
  // placing it moves it
  spawn: {},
  // a way to another map, or somewhere else on this one (warps.js). one per tile
  warp: {},
};

// the palette's tabs, left to right. each one shows everything in its catalogue (types), and
// kind is what the editor calls one of them. a new kind of thing to place is a new line here, then
// placing it in Editor.update(). TILE_TYPES starts empty and fills in from tiles.json (tiles.js),
// so the palette reads the catalogues as it draws, rather than once
const EDITOR_TABS = [
  { kind: 'tile', label: 'Tiles', types: TILE_TYPES },
  // furniture, decorations, chests... everything in objects.js
  { kind: 'object', label: 'Objects', types: OBJECT_TYPES },
  { kind: 'enemy', label: 'Enemies', types: ENEMY_TYPES },
  { kind: 'npc', label: 'NPCs', types: NPC_TYPES },
  // things on the map that make something happen, like where the player spawns and warps
  { kind: 'trigger', label: 'Triggers', types: TRIGGER_TYPES },
  // examples of more tabs, empty for now, so they show "Nothing here yet". to fill one, give it a
  // catalogue (e.g. ITEM_TYPES from items.js) and place it in Editor.update(), like objects. when
  // there are more tabs than fit, they scroll (EditorTabStrip)
  { kind: 'item', label: 'Items', types: {} },
  { kind: 'sound', label: 'Sounds', types: {} },
  { kind: 'light', label: 'Lights', types: {} },
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
  // what's picked: { kind, name } (kind is one of the EDITOR_TABS), or null for Erase.
  // starts on a tile that isn't there, so checkSelected() picks the first tile once they've loaded
  selected: { kind: 'tile', name: '' },
  // the last thing picked in the palette, so the Paint tool can go back to it after Erase
  lastPicked: null,
  // which tab of the palette is showing (a kind from EDITOR_TABS)
  tab: 'tile',
  // what the camera looks at while editing. WASD moves this, the camera follows it
  view: { x: 0, y: 0 },
  // the tile under the mouse, { col, row }, or null. the status bar shows it
  over: null,
  // where the mouse was last frame while dragging, so fast drags can fill in the gap
  lastPaint: null,
  // whether the current erase drag is removing objects, characters and warps (true) or emptying tiles (false)
  erasingThings: false,
  // how see-through the ui is, 1 solid to 0 gone. it fades out while WASD moves the camera
  // (sketch.js draws the ui with it). stillFor is how long since the camera last moved, in seconds
  uiAlpha: 1,
  stillFor: 0,

  // the palette's tabs, and the inspector's buttons for tiles, made in init(). showTab() only shows
  // New and Export on the Tiles tab
  tabStrip: null,
  tileButtons: [],
  editTileButton: null,

  // call once from setup(). makes the toolbar, the dock (palette and inspector) and the status bar,
  // all hidden until the editor opens
  init() {
    const L = EDITOR_LAYOUT;
    const dockX = GAME_W - L.dockWidth;
    const dockY = L.toolbarHeight;
    const dockH = GAME_H - L.toolbarHeight - L.statusHeight;
    const inspectorY = dockY + dockH - L.inspectorHeight;

    // everything's in the 'editor' group, so it can be shown and hidden together. backgrounds go
    // first so they're underneath the rest, and they stop clicks between the buttons painting the map
    const add = (element) => UI.add(Object.assign(element, { group: 'editor' }));
    const toolbar = add(new EditorToolbar({ x: 0, y: 0, w: GAME_W, h: L.toolbarHeight }));
    add(new EditorStatusBar({ x: 0, y: GAME_H - L.statusHeight, w: GAME_W, h: L.statusHeight }));
    add(new EditorDock({ x: dockX, y: dockY, w: L.dockWidth, h: dockH, inspectorY }));

    // the toolbar's buttons, left to right, each as wide as its label. a gap between groups gets a
    // line down the middle (EditorToolbar draws them)
    setText(12, BOLD, CENTER, CENTER, BUTTON_STYLES.default.font);
    let x = 6;
    const button = (label, options) => {
      const w = Math.ceil(textWidth(label)) + 18;
      const made = add(new EditorButton({ x, y: 4, w, h: L.toolbarHeight - 8, label, ...options }));
      x += w + 4;
      return made;
    };
    const separator = () => {
      toolbar.separators.push(x + 2);
      x += 8;
    };
    button('New', { onClick: () => this.newMap() });
    button('Open', { onClick: () => openMapFile() });
    button('Resize', { onClick: () => this.resizeMap() });
    button('Export', { style: 'editorPrimary', onClick: () => this.askToExport() });
    separator();
    button('Paint', { isOn: () => this.selected !== null, onClick: () => { this.selected = this.lastPicked; } });
    button('Erase', { isOn: () => this.selected === null, onClick: () => { this.selected = null; } });
    separator();
    button('Grid', { isOn: () => Debug.showGrid, onClick: () => { Debug.showGrid = !Debug.showGrid; } });
    button('Keys', { isOn: () => Debug.showKeys, onClick: () => { Debug.showKeys = !Debug.showKeys; } });
    // Play in the middle, like a game engine's. it closes the editor, back to playing (sketch.js)
    x = Math.max(x + 16, (GAME_W - 64) / 2);
    button('▶  Play', { style: 'editorPrimary', onClick: () => this.close(player, gameCamera) });

    // the palette's tabs along the top of the dock
    this.tabStrip = add(new EditorTabStrip({ x: dockX, y: dockY, w: L.dockWidth, h: L.tabHeight }));

    // the palette between the tabs and the inspector
    add(new PaletteGrid({ x: dockX, y: dockY + L.tabHeight, w: L.dockWidth, h: inspectorY - dockY - L.tabHeight }));

    // the inspector's buttons along its bottom, for tiles (the tile editor, tileeditor.js)
    const buttonW = (L.dockWidth - L.padding * 2 - 8) / 3;
    const tileButton = (i, label, onClick) => add(new EditorButton({
      x: dockX + L.padding + i * (buttonW + 4), y: GAME_H - L.statusHeight - 28, w: buttonW, h: 22, label, onClick,
    }));
    this.editTileButton = tileButton(0, 'Edit', () => TileEditor.open(TILE_TYPES[this.selected.name]));
    this.tileButtons = [
      tileButton(1, 'New', () => TileEditor.open(null)),
      tileButton(2, 'Export', () => TileEditor.exportTiles()),
    ];

    UI.showGroup('editor', false);
  },

  // picks the first tile if what's picked is gone (or nothing's been picked yet). run once the tiles
  // have loaded (sketch.js)
  checkSelected() {
    if (this.selected && !EDITOR_CATALOGUES[this.selected.kind][this.selected.name]) {
      this.pick({ kind: 'tile', name: Object.keys(TILE_TYPES)[0] });
    }
  },

  // picks something from the palette ({ kind, name }) for the Paint tool
  pick(thing) {
    this.selected = thing;
    this.lastPicked = thing;
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
    // the editor's status bar goes where the hotbar is (inventory.js)
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
    // Ctrl + D still works while typing, so dev mode (and the editor) can close with the box open
    if (WarpGraph.active) WarpGraph.close();
    if (FormBox.active) FormBox.close();
    Hotbar.show(true);
  },

  // ---------- tabs ----------

  // switches the palette to a tab (a kind from EDITOR_TABS). the tile buttons only show on Tiles
  showTab(kind) {
    this.tab = kind;
    this.tabStrip.reveal(kind);
    for (const button of this.tileButtons) button.visible = kind === 'tile';
  },

  // is this the one picked?
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
    // a moment. while it's hidden it can't be clicked, so clicks go through to the map behind it
    this.stillFor = dir.x === 0 && dir.y === 0 ? this.stillFor + dt : 0;
    const showUI = this.stillFor >= EDITOR_UI_FADE.showDelay;
    this.uiAlpha = approach(this.uiAlpha, showUI ? 1 : 0, EDITOR_UI_FADE.speed, dt);
    for (const el of UI.group('editor')) el.interactive = showUI;
    // Edit is for the picked tile, so it's only there while one is
    this.editTileButton.visible = this.selected?.kind === 'tile';

    // move the view with WASD. dividing by zoom keeps it the same speed on screen at any zoom
    const speed = EDITOR_PAN_SPEED / camera.zoom;
    const bounds = map.bounds();
    this.view.x = constrain(this.view.x + dir.x * speed * dt, bounds.left, bounds.right);
    this.view.y = constrain(this.view.y + dir.y * speed * dt, bounds.top, bounds.bottom);

    // the tile under the mouse, or null if the mouse isn't over the game
    const over = aim && Input.mouse.inside ? { col: map.colAt(aim.x), row: map.rowAt(aim.y) } : null;
    // the status bar shows it, unless the mouse is on the ui
    this.over = UI.hovered ? null : over;

    // objects, enemies, npcs and triggers: one per click. mousePressed() ignores clicks that landed
    // on the editor's ui, like the toolbar or the dock (see input.js)
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
          field: new Button({ w: 180, label: 'Show links', style: 'editor', onClick: () => WarpGraph.open(map.name, warp.name) }),
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

// ---------- the editor's ui elements ----------
// all build on the ui system (ui.js / button.js), see "making a new kind of ui element" in ui.js

// a small flat button, for the toolbar and the inspector. isOn (can be left out) says whether it's lit
// up, like a toggle, but worked out every frame, e.g. Paint is lit up while something's picked
class EditorButton extends Button {
  constructor(options) {
    super({ style: 'editor', ...options });
    this.isOn = options.isOn ?? null;
  }

  draw() {
    if (this.isOn) {
      this.toggle = true;
      this.on = this.isOn();
    }
    super.draw();
  }
}

// the strip along the top that the toolbar's buttons sit on, with the map's name and size on the
// right. separators are the x of each line between groups of buttons (Editor.init() adds them)
class EditorToolbar extends UIElement {
  constructor(options) {
    super(options);
    this.separators = [];
  }

  draw() {
    const C = EDITOR_COLOURS;
    noStroke();
    fill(C.header);
    rect(this.x, this.y, this.w, this.h);
    fill(C.edge);
    rect(this.x, this.y + this.h - 1, this.w, 1);
    for (const x of this.separators) rect(x, this.y + 6, 1, this.h - 12);

    // worldMap is the game's (sketch.js)
    const middleY = this.y + this.h / 2;
    const size = `${worldMap.cols} × ${worldMap.rows}`;
    fill(C.dimText);
    setText(12, BOLD, RIGHT, CENTER);
    text(size, this.x + this.w - 10, middleY);
    fill(C.text);
    text(worldMap.name, this.x + this.w - 18 - textWidth(size), middleY);
  }
}

// the strip along the bottom: the tile under the mouse on the left, what clicking does in the
// middle, and the zoom on the right
class EditorStatusBar extends UIElement {
  draw() {
    const C = EDITOR_COLOURS;
    noStroke();
    fill(C.header);
    rect(this.x, this.y, this.w, this.h);
    fill(C.edge);
    rect(this.x, this.y, this.w, 1);

    const middleY = this.y + this.h / 2 + 1;
    const over = Editor.over;
    let where = '';
    if (over) {
      const tile = worldMap.get(over.col, over.row);
      where = `(${over.col}, ${over.row})  ${worldMap.inside(over.col, over.row) ? tile?.name ?? 'empty' : 'off the map'}`;
    }
    const s = Editor.selected;
    const click = s === null ? 'erase' : `${s.kind === 'tile' ? 'paint' : 'place'} ${s.name}`;

    setText(11, BOLD, LEFT, CENTER);
    fill(C.text);
    text(where, this.x + 10, middleY);
    fill(C.dimText);
    text(`Left click: ${click}   ·   Right click: settings   ·   WASD: move   ·   Wheel: zoom`, this.x + 180, middleY);
    textAlign(RIGHT, CENTER);
    text(`Zoom ${Math.round(gameCamera.zoom * 100)}%`, this.x + this.w - 10, middleY);
  }
}

// the dock on the right: its background, the strip its tabs sit in, and the inspector at the bottom,
// showing what's picked. the tabs, palette and inspector's buttons are ui elements on top of it
// (see Editor.init()). inspectorY is where the inspector starts
class EditorDock extends UIElement {
  constructor(options) {
    super(options);
    this.inspectorY = options.inspectorY;
  }

  draw() {
    const L = EDITOR_LAYOUT;
    const C = EDITOR_COLOURS;
    noStroke();
    fill(C.bar);
    rect(this.x, this.y, this.w, this.h);
    // the tabs' strip. the open tab covers the line under it, so it looks joined on (EditorTabStrip)
    fill(C.header);
    rect(this.x, this.y, this.w, L.tabHeight);
    fill(C.edge);
    rect(this.x, this.y + L.tabHeight - 1, this.w, 1);

    // the inspector's header
    const y = this.inspectorY;
    fill(C.header);
    rect(this.x, y, this.w, 20);
    fill(C.edge);
    rect(this.x, y, this.w, 1);
    rect(this.x, y + 19, this.w, 1);
    fill(C.dimText);
    setText(10, BOLD, LEFT, CENTER);
    text('INSPECTOR', this.x + L.padding + 2, y + 10);
    this.drawInspector(y + 20);

    // a line down its left edge, between it and the map
    fill(C.edge);
    rect(this.x, this.y, 1, this.h);
  }

  // what's picked: its picture, name and kind, then a few of its settings, or a note about it
  drawInspector(top) {
    const L = EDITOR_LAYOUT;
    const C = EDITOR_COLOURS;
    const x = this.x + L.padding + 2;
    const s = Editor.selected;
    const info = inspectorInfo(s);
    const size = L.swatchSize;

    drawPaletteArt(s ? s.kind : 'erase', s ? s.name : '', x, top + 6, size);
    noFill();
    stroke(C.edge);
    strokeWeight(1);
    rect(x, top + 6, size, size);
    noStroke();
    fill(C.text);
    setText(13, BOLD, LEFT, CENTER);
    text(info.title, x + size + 10, top + 17);
    fill(C.dimText);
    setText(11, BOLD, LEFT, CENTER);
    text(info.kind, x + size + 10, top + 33);

    // the rows and note stop above the inspector's buttons
    let y = top + size + 12;
    for (const [label, value] of info.rows) {
      fill(C.dimText);
      text(label, x, y + 7);
      fill(C.text);
      text(String(value), x + 64, y + 7);
      y += 15;
    }
    if (info.note) {
      fill(C.dimText);
      setText(11, BOLD, LEFT, TOP);
      text(info.note, x, y, this.w - (L.padding + 2) * 2, GAME_H - EDITOR_LAYOUT.statusHeight - 32 - y);
    }
  }
}

// what the inspector shows for what's picked (null is Erase): { title, kind, rows, note }. rows are
// [label, value] pairs, and note is a line of writing under them (can be left out)
function inspectorInfo(selected) {
  if (selected === null) {
    return { title: 'Erase', kind: 'Tool', rows: [], note: 'Drag over the map. Starting on an object, enemy, npc or warp removes those, otherwise it empties tiles' };
  }
  const { kind, name } = selected;
  const type = EDITOR_CATALOGUES[kind][name];
  const yesNo = (on) => (on ? 'yes' : 'no');
  if (kind === 'tile') {
    const look = type.texture ?? type.colour;
    return {
      title: name,
      kind: type.dualGrid ? 'Tile · dual grid' : 'Tile',
      rows: [
        ['Solid', yesNo(type.solid)],
        ['Speed', `${Math.round(type.speed * 100)}%`],
        // long file names are cut short to fit
        [type.texture ? 'Texture' : 'Colour', look.length > 20 ? `${look.slice(0, 19)}…` : look],
      ],
    };
  }
  if (kind === 'object') {
    return { title: name, kind: 'Object', rows: [['Size', `${type.width} × ${type.height} tiles`], ['Solid', yesNo(type.solid)]] };
  }
  if (isCharacterKind(kind)) {
    return {
      title: name,
      kind: kind === 'enemy' ? 'Enemy' : 'NPC',
      rows: [
        ['Health', type.maxHealth],
        ['Speed', type.speed],
        kind === 'npc' ? ['Name', type.label] : ['Weapon', type.weapon ?? 'none'],
      ],
    };
  }
  if (kind === 'trigger' && name === 'spawn') {
    return { title: 'spawn', kind: 'Trigger', rows: [], note: "Where the player starts on this map. There's only one, so placing it moves it" };
  }
  if (kind === 'trigger') {
    return { title: 'warp', kind: 'Trigger', rows: [], note: 'A way to another map. Placing one opens its settings, right click it on the map to change them later' };
  }
  // anything in a tab added later: its name and which tab it's from
  return { title: name, kind: EDITOR_TABS.find((tab) => tab.kind === kind).label, rows: [] };
}

// the palette's tabs (Tiles, Objects...), drawn like a game engine's panel tabs: the open one is the
// dock's colour with a line along its top, and joins onto the palette under it. each is as wide as its
// label. when there are more than fit, ‹ › at the end (or the mouse wheel over them) scrolls along,
// and opening a tab scrolls it into view, so EDITOR_TABS can have as many as it likes
class EditorTabStrip extends UIElement {
  constructor(options) {
    super(options);
    // each tab's kind, label, and where it is along the strip before scrolling
    setText(11, BOLD, CENTER, CENTER, BUTTON_STYLES.default.font);
    let x = 0;
    this.tabs = EDITOR_TABS.map(({ kind, label }) => {
      const tab = { kind, label, x, w: Math.ceil(textWidth(label)) + 16 };
      x += tab.w;
      return tab;
    });
    this.length = x;
    // how far along it's scrolled, in pixels
    this.scroll = 0;
    // what the mouse is over: a tab's kind, 'back' or 'forward' (the arrows), or null
    this.under = null;
  }

  // the arrows only show when the tabs don't all fit
  arrowsWidth() {
    return this.length > this.w ? EDITOR_LAYOUT.tabArrowWidth * 2 : 0;
  }

  // how wide the part the tabs show in is
  room() {
    return this.w - this.arrowsWidth();
  }

  maxScroll() {
    return Math.max(0, this.length - this.room());
  }

  // scrolls just far enough that this tab (a kind) is all showing
  reveal(kind) {
    const tab = this.tabs.find((t) => t.kind === kind);
    this.scroll = constrain(constrain(this.scroll, tab.x + tab.w - this.room(), tab.x), 0, this.maxScroll());
  }

  update(hovered) {
    this.hovered = hovered;
    this.under = null;
    if (!hovered) return;

    // used up here, so the camera doesn't zoom too (like the palette)
    if (Input.wheel !== 0) {
      this.scroll = constrain(this.scroll + Input.wheel * 0.5, 0, this.maxScroll());
      Input.wheel = 0;
    }

    const mouseX = Input.mouse.x;
    const arrowsX = this.x + this.room();
    if (mouseX >= arrowsX) {
      this.under = mouseX < arrowsX + EDITOR_LAYOUT.tabArrowWidth ? 'back' : 'forward';
    } else {
      const along = mouseX - this.x + this.scroll;
      this.under = this.tabs.find((t) => along >= t.x && along < t.x + t.w)?.kind ?? null;
    }
    if (!this.under || !Input.buttonsPressed.has('left')) return;

    // the arrows go along a tab at a time: back to the start of the one cut off at the left, or on
    // to the end of the one cut off at the right
    if (this.under === 'back') {
      const cut = this.tabs.filter((t) => t.x < this.scroll).pop();
      if (cut) this.scroll = cut.x;
    } else if (this.under === 'forward') {
      const cut = this.tabs.find((t) => t.x + t.w > this.scroll + this.room());
      if (cut) this.scroll = Math.min(this.maxScroll(), cut.x + cut.w - this.room());
    } else {
      Editor.showTab(this.under);
    }
  }

  draw() {
    const C = EDITOR_COLOURS;
    const room = this.room();

    // tabs scrolled partly out of view are cut off at the edge, like the palette's squares
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(this.x, this.y, room, this.h);
    drawingContext.clip();
    setText(11, BOLD, CENTER, CENTER);
    for (const tab of this.tabs) {
      const x = this.x + tab.x - this.scroll;
      if (x + tab.w < this.x || x > this.x + room) continue;
      const open = Editor.tab === tab.kind;
      const hovered = this.under === tab.kind;
      noStroke();
      if (open) {
        fill(C.bar);
        rect(x, this.y, tab.w, this.h);
        fill(C.accent);
        rect(x, this.y, tab.w, 2);
      } else if (hovered) {
        fill(C.tabHover);
        rect(x, this.y, tab.w, this.h - 1);
      }
      fill(open ? C.text : hovered ? 220 : C.dimText);
      text(tab.label, x + tab.w / 2, this.y + this.h / 2 + 1);
    }
    drawingContext.restore();

    if (this.arrowsWidth() === 0) return;
    // the arrows, greyed out when there's no further to go that way
    const left = this.x + room;
    const arrow = EDITOR_LAYOUT.tabArrowWidth;
    noStroke();
    fill(C.header);
    rect(left, this.y, arrow * 2, this.h - 1);
    fill(C.edge);
    rect(left, this.y + 4, 1, this.h - 8);
    setText(16, BOLD, CENTER, CENTER);
    const arrows = [['back', '‹', this.scroll > 0], ['forward', '›', this.scroll < this.maxScroll()]];
    arrows.forEach(([which, symbol, canGo], i) => {
      fill(!canGo ? 70 : this.under === which ? 255 : C.dimText);
      text(symbol, left + arrow * (i + 0.5), this.y + this.h / 2 - 1);
    });
  }
}

// the palette: a grid of squares, one for everything in the open tab's catalogue. click one to pick
// it, right click a tile to change it (tileeditor.js), hover for its name. the mouse wheel scrolls it
// while the mouse is over it, instead of zooming (debug.js). it reads the catalogues as it goes, so
// a new tile shows up by itself
class PaletteGrid extends UIElement {
  constructor(options) {
    super(options);
    // how far each tab's scrolled down, in pixels, so switching back finds it where you left it
    this.scroll = {};
    // the name of the square the mouse is over, or null
    this.hoveredName = null;
  }

  names() {
    return Object.keys(EDITOR_CATALOGUES[Editor.tab]);
  }

  columns() {
    const L = EDITOR_LAYOUT;
    return Math.floor((this.w - L.padding * 2 - L.scrollbarWidth) / L.cellSize);
  }

  // how far it can scroll for this many squares (0 if they all fit)
  maxScroll(count) {
    const L = EDITOR_LAYOUT;
    return Math.max(0, Math.ceil(count / this.columns()) * L.cellSize + L.padding * 2 - this.h);
  }

  // where square number i's top left corner is on screen. the squares are centred in the room
  // left beside the scrollbar
  cell(i) {
    const L = EDITOR_LAYOUT;
    const columns = this.columns();
    const gap = (L.cellSize - L.swatchSize) / 2;
    const left = this.x + (this.w - L.scrollbarWidth - columns * L.cellSize) / 2;
    return {
      x: left + (i % columns) * L.cellSize + gap,
      y: this.y + L.padding + Math.floor(i / columns) * L.cellSize + gap - (this.scroll[Editor.tab] ?? 0),
    };
  }

  update(hovered) {
    this.hovered = hovered;
    const tab = Editor.tab;
    const names = this.names();
    const size = EDITOR_LAYOUT.swatchSize;

    // used up here, so the camera doesn't zoom too
    let scroll = this.scroll[tab] ?? 0;
    if (hovered && Input.wheel !== 0) {
      scroll += Input.wheel * EDITOR_LAYOUT.scrollRate;
      Input.wheel = 0;
    }
    // kept in range every frame, as a tab can lose squares
    this.scroll[tab] = constrain(scroll, 0, this.maxScroll(names.length));

    // the square under the mouse. the gaps between them don't count
    const { x, y } = Input.mouse;
    this.hoveredName = !hovered ? null : names.find((name, i) => {
      const cell = this.cell(i);
      return x >= cell.x && x < cell.x + size && y >= cell.y && y < cell.y + size;
    }) ?? null;
    if (!this.hoveredName) return;
    if (Input.buttonsPressed.has('left')) Editor.pick({ kind: tab, name: this.hoveredName });
    if (tab === 'tile' && Input.buttonsPressed.has('right')) TileEditor.open(TILE_TYPES[this.hoveredName]);
  }

  draw() {
    const L = EDITOR_LAYOUT;
    const C = EDITOR_COLOURS;
    const names = this.names();
    const size = L.swatchSize;

    // squares scrolled partly past the top or bottom are cut off at the edge. clip() is the
    // canvas's own, it stops anything drawn outside the rectangle until restore()
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(this.x, this.y, this.w, this.h);
    drawingContext.clip();
    names.forEach((name, i) => {
      const { x, y } = this.cell(i);
      if (y + size < this.y || y > this.y + this.h) return;
      drawPaletteArt(Editor.tab, name, x, y, size);
      // a yellow edge for the one that's picked, white for the one under the mouse
      noFill();
      if (Editor.isSelected(Editor.tab, name)) {
        stroke(C.picked);
        strokeWeight(2);
      } else {
        stroke(name === this.hoveredName ? 255 : C.edge);
        strokeWeight(1);
      }
      rect(x, y, size, size);
    });
    drawingContext.restore();

    noStroke();
    if (names.length === 0) {
      fill(C.dimText);
      setText(11, BOLD, CENTER, CENTER);
      text('Nothing here yet', this.x + this.w / 2, this.y + 30);
    }

    // the scrollbar, when there's more than fits
    const max = this.maxScroll(names.length);
    if (max > 0) {
      const trackX = this.x + this.w - L.scrollbarWidth - 3;
      const track = this.h - 6;
      const thumb = Math.max(20, track * this.h / (this.h + max));
      fill(C.well);
      rect(trackX, this.y + 3, L.scrollbarWidth, track, 2);
      fill(this.hovered ? '#5d6575' : '#474e5c');
      rect(trackX, this.y + 3 + (track - thumb) * (this.scroll[Editor.tab] / max), L.scrollbarWidth, thumb, 2);
    }

    // the name of the square under the mouse, just above it (below it on the top row)
    if (this.hoveredName) {
      const cell = this.cell(names.indexOf(this.hoveredName));
      setText(11, BOLD, CENTER, CENTER);
      const w = textWidth(this.hoveredName) + 12;
      const x = constrain(cell.x + size / 2 - w / 2, this.x + 2, this.x + this.w - w - 2);
      const y = cell.y - 22 < this.y ? cell.y + size + 4 : cell.y - 22;
      fill(0, 0, 0, 220);
      rect(x, y, w, 18, 3);
      fill(255);
      text(this.hoveredName, x + w / 2, y + 9);
    }
  }
}

// a picture of something in the palette (a kind from EDITOR_TABS and its name), or of the Erase tool
// (kind 'erase'), size pixels square with its top left corner at x, y. tiles fill the square,
// everything else sits on a dark one
function drawPaletteArt(kind, name, x, y, size) {
  if (kind === 'tile') {
    drawTypeArt(TILE_TYPES[name], x, y, size, size);
    return;
  }
  noStroke();
  fill(EDITOR_COLOURS.well);
  rect(x, y, size, size);
  const middleX = x + size / 2;
  const middleY = y + size / 2;
  if (kind === 'erase') {
    // a red cross
    const r = size * 0.2;
    stroke(EDITOR_COLOURS.erase);
    strokeWeight(2.5);
    line(middleX - r, middleY - r, middleX + r, middleY + r);
    line(middleX + r, middleY - r, middleX - r, middleY + r);
  } else if (kind === 'trigger' && name === 'spawn') {
    // drawn like its ring on the map
    drawSpawnRing(middleX, middleY);
  } else if (kind === 'trigger') {
    // a warp, drawn like its square on the map (warps.js)
    const w = size * 0.6;
    drawWarpSquare(middleX - w / 2, middleY - w / 2, w, WARP_COLOURS.edge, false);
  } else {
    // objects and characters are shrunk to fit but keep their shape, so a 2 x 1 table looks twice
    // as wide as it is tall
    const type = EDITOR_CATALOGUES[kind][name];
    const scale = Math.min(size / type.width, size / type.height) * 0.8;
    const w = type.width * scale;
    const h = type.height * scale;
    drawTypeArt(type, x + (size - w) / 2, y + (size - h) / 2, w, h, 3);
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
