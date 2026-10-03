// the map editor: paint tiles and place objects, enemies, npcs, items and triggers on the current map.
// dev mode (` or Ctrl + D), then B (build). user guide: assets/squimble-quest/maps/README.md.
//
// laid out like a game engine:
//   - toolbar (top): New, Open, Resize, Export; Paint and Erase tools; Grid and Keys (= G, H); Play
//     (closes the editor); the map's name and size
//   - dock (right): the palette with tabs for tiles, objects, enemies, npcs, triggers and items
//     (wheel scrolls it), and the inspector below showing what's picked
//   - status bar (bottom): tile under the mouse, what a click does, zoom
//
// while open:
//   - everyone stops; WASD / arrows move the camera. the ui fades while moving, back when you stop
//   - picking in the palette (hover for names) sets what Paint uses
//   - tiles: left click/drag paints. New / right click / Edit open the tile editor (tileeditor.js),
//     whose Export saves tiles.json
//   - objects: click places, top left on the tile. enemies and npcs: click places, standing on it
//   - weapons and items (a tab per items.js category): click drops one on the ground (not saved by
//     Export). Give adds one to the inventory; right click / Edit changes name, rarity, colour and
//     weapon numbers; the inspector's Export saves items.json (items.js)
//   - Erase, then click/drag: starting on an object, enemy, npc, item or warp removes those, else it
//     empties tiles (like off-map: undrawn, unwalkable)
//   - right click: settings of a warp on the map, or a tile or item in the palette
//   - opening shows every enemy at its spawn, defeated ones too, so you see the whole design; closing
//     resets everyone to their spawns at full health (outside the editor maps remember their
//     characters, loadMap() in sketch.js)
//   - triggers, click to place: spawn (yellow ring; only one, so it moves) and warp (purple square,
//     warps.js; placing opens its settings, right click later. Show links opens warpgraph.js)
//   - toolbar map buttons ask via FormBox (formbox.js): Resize (never below the tiled area), New
//     (any size and fill), Open (from file), Export (to file)
//   - dev mode keys still work (zoom, teleport, next map); H lists them
//
// new tiles and catalogue entries show in the palette by themselves. changes apply to the current
// map; M away and back keeps them, but reloading rebuilds maps from file, so Export to keep them

// WASD camera speed, screen px/s (same at any zoom)
const EDITOR_PAN_SPEED = 600;

// max New map size each way, in tiles, against typos
const EDITOR_MAX_MAP_SIZE = 500;

// a New map's name until exported
const NEW_MAP_NAME = 'new-map';

// appended under DEV_KEYS in dev mode's H list (debug.js)
const EDITOR_KEYS = [
  'MAP EDITOR KEYS',
  'left click  paint / place',
  'right click change settings (warps, palette tiles and items)',
  'WASD        move around',
  'wheel       zoom',
  'B           close the editor',
];

// ui fade while WASD moves the camera
const EDITOR_UI_FADE = {
  // seconds still before it returns
  showDelay: 0.3,
  // fade rate, like CAMERA.followSpeed
  speed: 14,
};

// screen px (see the top of this file)
const EDITOR_LAYOUT = {
  toolbarHeight: 28,
  statusHeight: 20,
  // the dock, its tab row, and the inspector at its bottom
  dockWidth: 224,
  tabHeight: 22,
  inspectorHeight: 150,
  // palette square, and its cell (square + gap)
  swatchSize: 36,
  cellSize: 40,
  // palette inset from the dock's edges
  padding: 6,
  // each ‹ › tab arrow, shown when tabs overflow
  tabArrowWidth: 16,
  scrollbarWidth: 4,
  // palette scroll per wheel unit; a notch (~100) is about a row
  scrollRate: 0.4,
};

// dark theme, darkest to lightest. also used by the form box and warp graph
const EDITOR_COLOURS = {
  // dock and form box background
  bar: '#1f232b',
  // toolbar, status bar, panel headers, closed tabs
  header: '#171a20',
  // behind palette objects/characters, inside text boxes
  well: '#14171c',
  // dividers and outlines
  edge: '#3a404c',
  tabHover: '#2a2f39',
  // open tab, and the picked item
  accent: '#4a7bd8',
  picked: '#ffd23f',
  erase: '#ff6b6b',
  text: '#e6e8ec',
  dimText: '#8b92a0',
};

// the Triggers tab. no catalogue file: each is placed by its own code in Editor.update() and drawn
// by drawPaletteArt()
const TRIGGER_TYPES = {
  // the player's start and respawn point. only one, so placing moves it
  spawn: {},
  // a way to another map or elsewhere on this one (warps.js). one per tile
  warp: {},
};

// palette tabs, left to right: kind is what the editor calls one, types its catalogue. a new placeable
// kind is a line here plus placing it in Editor.update(). TILE_TYPES fills in from tiles.json
// (tiles.js), so the palette reads catalogues as it draws
const EDITOR_TABS = [
  { kind: 'tile', label: 'Tiles', types: TILE_TYPES },
  { kind: 'object', label: 'Objects', types: OBJECT_TYPES },
  { kind: 'enemy', label: 'Enemies', types: ENEMY_TYPES },
  { kind: 'npc', label: 'NPCs', types: NPC_TYPES },
  { kind: 'trigger', label: 'Triggers', types: TRIGGER_TYPES },
  // a tab per ITEM_CATEGORIES entry (items.js), kind = category. all placed on the ground and edited
  // by Editor.editItem()
  ...Object.entries(ITEM_CATEGORIES).map(([kind, label]) => ({ kind, label, types: ITEMS_BY_CATEGORY[kind] })),
  // empty examples ("Nothing here yet"). to fill one, give it a catalogue and place it in
  // Editor.update(). overflowing tabs scroll (EditorTabStrip)
  { kind: 'sound', label: 'Sounds', types: {} },
  { kind: 'light', label: 'Lights', types: {} },
];

// kind → catalogue, e.g. EDITOR_CATALOGUES.enemy is ENEMY_TYPES
const EDITOR_CATALOGUES = Object.fromEntries(EDITOR_TABS.map(({ kind, types }) => [kind, types]));

// a map width/height field, min..EDITOR_MAX_MAP_SIZE (NumberField in textfield.js)
function sizeField(value, min = 1) {
  return new NumberField({ w: 90, value, min, max: EDITOR_MAX_MAP_SIZE });
}

// placed standing on a tile (enemy or npc)?
function isCharacterKind(kind) {
  return kind in SPAWN_KINDS;
}

// an item category (ITEM_CATEGORIES in items.js), placed on the ground?
function isItemKind(kind) {
  return kind in ITEM_CATEGORIES;
}

// a resized map's new left column (or top row), one axis at a time. start/length: current, newLength:
// new size. centred on the old map, shifted so first..last (the tiled columns/rows, undefined if
// none) still fit
function resizedStart(start, length, newLength, first, last) {
  const centred = start + Math.floor((length - newLength) / 2);
  if (first === undefined) return centred;
  return constrain(centred, last - newLength + 1, first);
}

const Editor = {
  active: false,
  // { kind, name } (kind from EDITOR_TABS), or null for Erase. starts on a nonexistent tile so
  // checkSelected() picks the first once tiles load
  selected: { kind: 'tile', name: '' },
  // last palette pick, for Paint after Erase
  lastPicked: null,
  // the showing palette tab (a kind)
  tab: 'tile',
  // camera target while editing, moved by WASD
  view: { x: 0, y: 0 },
  // { col, row } under the mouse or null, for the status bar
  over: null,
  // last frame's mouse while dragging, so fast drags fill gaps
  lastPaint: null,
  // this erase drag removes things (true) or empties tiles (false)
  erasingThings: false,
  // ui alpha (1 solid, 0 gone), faded while WASD moves (sketch.js applies it). stillFor: seconds
  // since the camera last moved
  uiAlpha: 1,
  stillFor: 0,

  // made in init(). showTab() shows New and Export only on Tiles, and items' Export on item tabs.
  // Edit is for a picked tile or item, Give for a picked item
  tabStrip: null,
  tileButtons: [],
  exportItemsButton: null,
  editButton: null,
  giveButton: null,

  // once from setup(): toolbar, dock (palette and inspector) and status bar, hidden until opened
  init() {
    const L = EDITOR_LAYOUT;
    const dockX = GAME_W - L.dockWidth;
    const dockY = L.toolbarHeight;
    const dockH = GAME_H - L.toolbarHeight - L.statusHeight;
    const inspectorY = dockY + dockH - L.inspectorHeight;

    // all in the 'editor' group. backgrounds first so they're underneath, and they stop clicks
    // between buttons painting the map
    const add = (element) => UI.add(Object.assign(element, { group: 'editor' }));
    const toolbar = add(new EditorToolbar({ x: 0, y: 0, w: GAME_W, h: L.toolbarHeight }));
    add(new EditorStatusBar({ x: 0, y: GAME_H - L.statusHeight, w: GAME_W, h: L.statusHeight }));
    add(new EditorDock({ x: dockX, y: dockY, w: L.dockWidth, h: dockH, inspectorY }));

    // toolbar buttons left to right, label-width. separators are drawn by EditorToolbar
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
    // Play centred like a game engine's; closes the editor (sketch.js globals)
    x = Math.max(x + 16, (GAME_W - 64) / 2);
    button('▶  Play', { style: 'editorPrimary', onClick: () => this.close(player, gameCamera) });

    this.tabStrip = add(new EditorTabStrip({ x: dockX, y: dockY, w: L.dockWidth, h: L.tabHeight }));

    // between the tabs and the inspector
    add(new PaletteGrid({ x: dockX, y: dockY + L.tabHeight, w: L.dockWidth, h: inspectorY - dockY - L.tabHeight }));

    // inspector buttons along its bottom, for tiles (tileeditor.js) and items
    const buttonW = (L.dockWidth - L.padding * 2 - 8) / 3;
    const inspectorButton = (i, label, onClick) => add(new EditorButton({
      x: dockX + L.padding + i * (buttonW + 4), y: GAME_H - L.statusHeight - 28, w: buttonW, h: 22, label, onClick,
    }));
    this.editButton = inspectorButton(0, 'Edit', () => {
      if (this.selected.kind === 'tile') TileEditor.open(TILE_TYPES[this.selected.name]);
      else this.editItem(this.selected.name);
    });
    this.tileButtons = [
      inspectorButton(1, 'New', () => TileEditor.open(null)),
      inspectorButton(2, 'Export', () => TileEditor.exportTiles()),
    ];
    // shares New's spot, so never shown on Tiles (update())
    this.giveButton = inspectorButton(1, 'Give', () => this.giveItem(this.selected.name));
    // every weapon and item, with changes, as items.json (items.js)
    this.exportItemsButton = inspectorButton(2, 'Export', () => {
      downloadTextFile('items.json', itemsToText());
      showMessage('Exported! Put items.json in assets/squimble-quest/items/');
    });

    UI.showGroup('editor', false);
  },

  // picks the first tile if the pick no longer exists (or nothing's picked yet). after tiles load (sketch.js)
  checkSelected() {
    if (this.selected && !EDITOR_CATALOGUES[this.selected.kind][this.selected.name]) {
      this.pick({ kind: 'tile', name: Object.keys(TILE_TYPES)[0] });
    }
  },

  // { kind, name } for Paint
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
    // its text box would be in the way (dialogue.js)
    if (Dialogue.active) Dialogue.close();
    // everyone back at their spawns, defeated too: shows the whole design, and resets enemies (sketch.js)
    spawnCharacters();
    // start where the camera is, following the view instead of the player. follow() also ends a
    // dialogue glide
    this.view = { x: camera.x, y: camera.y };
    camera.follow(this.view);
    // shown at once, not faded in
    this.uiAlpha = 1;
    this.stillFor = EDITOR_UI_FADE.showDelay;
    UI.showGroup('editor', true);
    // the status bar takes the hotbar's place (inventory.js)
    if (InventoryScreen.active) InventoryScreen.show(false);
    Hotbar.show(false);
    this.showTab(this.tab);
  },

  close(player, camera) {
    this.active = false;
    this.lastPaint = null;
    camera.follow(player);
    // everyone back at their spawns, full health (sketch.js)
    spawnCharacters();
    UI.showGroup('editor', false);
    // Ctrl + D works while typing, so the editor can close with a box open
    if (WarpGraph.active) WarpGraph.close();
    if (FormBox.active) FormBox.close();
    Hotbar.show(true);
  },

  // ---------- tabs ----------

  // kind from EDITOR_TABS. tile buttons only on Tiles
  showTab(kind) {
    this.tab = kind;
    this.tabStrip.reveal(kind);
    for (const button of this.tileButtons) button.visible = kind === 'tile';
    this.exportItemsButton.visible = isItemKind(kind);
  },

  isSelected(kind, name) {
    return this.selected !== null && this.selected.kind === kind && this.selected.name === name;
  },

  // ---------- new map, resizing and exporting ----------

  // asks size and fill (any tile, or empty: handy for non-rectangular rooms, paint the floor shape),
  // then makes and goes to the map
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
        // in MAPS, so M can return to it (maps.js)
        addMap(NEW_MAP_NAME, () => makeBlankMap(cols, rows, fillWith));
        loadMap(NEW_MAP_NAME); // in sketch.js
      },
    });
  },

  // asks a new size, never below the tiled area (fields clamp to it). resizes around the middle,
  // shifted so every tile fits; new space is empty. worldMap and gameCamera are the game's (sketch.js)
  resizeMap() {
    const map = worldMap;
    const used = map.usedArea();
    const minCols = used ? used.right - used.left + 1 : 1;
    const minRows = used ? used.bottom - used.top + 1 : 1;

    FormBox.open({
      title: 'Resize map',
      hint: `Smallest it can be: ${minCols} x ${minRows}`,
      confirmLabel: 'Resize',
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
        // spawns on the removed part vanish
        spawnCharacters();
      },
    });
  },

  // asks a name, then exports the current map (exportMap(), cleanMapName() in mapfile.js; worldMap in sketch.js)
  askToExport() {
    FormBox.open({
      title: 'Export map',
      hint: 'Letters, numbers, - and _',
      confirmLabel: 'Export',
      rows: [{ label: 'Name', field: new TextField({ w: 180, value: worldMap.name }) }],
      // needs a file name (only spaces counts as none)
      canConfirm: ([name]) => cleanMapName(name) !== '',
      onConfirm: ([name]) => exportMap(worldMap, name),
    });
  },

  // ---------- every frame, while open ----------

  // aim: mouse world position or null
  update(map, camera, aim, dt) {
    // an open form box is all that runs. it's ui so it fades too: restore alpha at once, or a box
    // opened while faded (placing a warp right after moving) would be invisible. the warp graph sits
    // over a warp's box and takes over until it closes (warpgraph.js)
    if (FormBox.active) {
      this.uiAlpha = 1;
      this.stillFor = EDITOR_UI_FADE.showDelay;
      if (WarpGraph.active) WarpGraph.update();
      else FormBox.update();
      return;
    }

    const dir = Input.direction();

    // moving fades the ui out, stopping briefly fades it back. hidden ui isn't clickable, so clicks
    // reach the map
    this.stillFor = dir.x === 0 && dir.y === 0 ? this.stillFor + dt : 0;
    const showUI = this.stillFor >= EDITOR_UI_FADE.showDelay;
    this.uiAlpha = approach(this.uiAlpha, showUI ? 1 : 0, EDITOR_UI_FADE.speed, dt);
    for (const el of UI.group('editor')) el.interactive = showUI;
    // Edit only with a tile or item picked, Give only with an item (it shares New's spot on Tiles)
    const itemPicked = isItemKind(this.selected?.kind);
    this.editButton.visible = this.selected?.kind === 'tile' || itemPicked;
    this.giveButton.visible = itemPicked && this.tab !== 'tile';

    // / zoom keeps on-screen speed constant
    const speed = EDITOR_PAN_SPEED / camera.zoom;
    const bounds = map.bounds();
    this.view.x = constrain(this.view.x + dir.x * speed * dt, bounds.left, bounds.right);
    this.view.y = constrain(this.view.y + dir.y * speed * dt, bounds.top, bounds.bottom);

    // tile under the mouse, null off the game
    const over = aim && Input.mouse.inside ? { col: map.colAt(aim.x), row: map.rowAt(aim.y) } : null;
    // status bar shows it unless over the ui
    this.over = UI.hovered ? null : over;

    // one per click for objects, characters, items and triggers. mousePressed() ignores ui clicks (input.js)
    if (over && Input.mousePressed('left') && this.selected) {
      const { kind, name } = this.selected;
      if (kind === 'object') this.placeObject(map, name, over.col, over.row);
      if (isCharacterKind(kind)) this.placeCharacter(map, kind, name, over.col, over.row);
      if (isItemKind(kind)) this.placeItem(map, name, over.col, over.row);
      if (kind === 'trigger' && name === 'spawn') this.placeSpawn(map, over.col, over.row);
      if (kind === 'trigger' && name === 'warp') this.placeWarp(map, over.col, over.row);
    }

    // right click: settings of what's there. only warps so far; hook future ones in here
    if (over && Input.mousePressed('right')) {
      const warp = map.warpAt(over.col, over.row);
      if (warp) this.editWarp(map, warp);
    }

    // painting and erasing continue while held
    const erasing = this.selected === null && Input.mouseHeld('left');
    const painting = this.selected?.kind === 'tile' && Input.mouseHeld('left');

    if (over && (painting || erasing)) {
      // a drag starting on a thing only removes things, else only empties tiles, so one drag can't
      // remove a table and then its floor
      if (!this.lastPaint) this.erasingThings = erasing && this.thingsAt(map, over.col, over.row);

      let removedCharacter = false;
      this.forEachTileOnLine(map, this.lastPaint ?? aim, aim, (col, row) => {
        if (painting) {
          map.set(col, row, this.selected.name);
        } else if (this.erasingThings) {
          map.removeObjectsAt(col, row);
          map.removeWarpAt(col, row);
          const items = this.dropsAt(map, col, row);
          map.drops = map.drops.filter((drop) => !items.includes(drop));
          for (const kind of Object.keys(SPAWN_KINDS)) {
            if (map.removeSpawnsAt(kind, col, row)) removedCharacter = true;
          }
        } else {
          map.set(col, row, null);
        }
      });
      // removed characters vanish at once
      if (removedCharacter) spawnCharacters();
      this.lastPaint = aim;
    } else {
      this.lastPaint = null;
    }
  },

  // any object, enemy, npc, item or warp on this tile?
  thingsAt(map, col, row) {
    if (map.objectsAt(col, row).length > 0 || map.warpAt(col, row) || this.dropsAt(map, col, row).length > 0) return true;
    return Object.keys(SPAWN_KINDS).some((kind) => map.spawnsAt(kind, col, row).length > 0);
  },

  // drops on this tile (Drops in inventory.js), by ground position
  dropsAt(map, col, row) {
    return map.drops.filter((drop) => map.colAt(drop.x) === col && map.rowAt(drop.y) === row);
  },

  // an item on the ground mid-tile, ready to pick up. not on solid/empty tiles (unreachable). not
  // saved by Export, like any drop (inventory.js)
  placeItem(map, name, col, row) {
    if (map.isSolid(col, row)) return;
    if (this.dropsAt(map, col, row).some((drop) => drop.item.type.name === name)) return;
    Drops.place(map, createItem(name), (col + 0.5) * TILE, (row + 0.5) * TILE);
  },

  // into the player's inventory (player in sketch.js)
  giveItem(name) {
    if (!player.inventory.add(createItem(name))) showMessage('No room, your inventory is full');
  },

  // edits an item's name, rarity and colour (items.js), plus its weapon's numbers on a second tab
  // (weapons.js). applied on confirm; Export on the item tabs saves them, else they're lost on reload
  editItem(name) {
    const type = ITEM_TYPES[name];
    const weapon = WEAPONS[type.weapon];
    const itemRows = [
      { label: 'Name', field: new TextField({ w: 180, value: type.label }) },
      {
        label: 'Rarity',
        field: new Picker({
          w: 180,
          choices: Object.keys(RARITIES),
          value: type.rarity,
          label: (rarity) => RARITIES[rarity].label,
          art: (rarity, x, y, size) => {
            noStroke();
            fill(RARITIES[rarity].colour);
            circle(x + size / 2, y + size / 2, size * 0.8);
          },
        }),
      },
      { label: 'Colour', field: new ColourField({ w: 180, value: type.colour }) },
    ];
    // whole numbers only, so times are in ms
    const number = (value, max) => new NumberField({ w: 90, value: Math.round(value), min: 1, max });
    const weaponRows = weapon ? [
      { label: 'Damage', field: number(weapon.damage, 9999) },
      { label: 'Reach', field: number(weapon.reach, 999), after: 'pixels' },
      { label: 'Arc', field: number(weapon.arc, 360), after: 'degrees' },
      { label: 'Swing time', field: number(weapon.swingTime * 1000, 9999), after: 'ms' },
      { label: 'Cooldown', field: number(weapon.cooldown * 1000, 9999), after: 'ms' },
    ] : [];

    FormBox.open({
      title: `Item: ${name}`,
      hint: 'Export in the inspector to keep changes',
      confirmLabel: 'Save',
      ...(weapon ? { tabs: [{ label: 'Item', rows: itemRows }, { label: 'Weapon', rows: weaponRows }] } : { rows: itemRows }),
      canConfirm: ([label, , colour]) => label.trim() !== '' && HEX_COLOUR.test(colour),
      onConfirm: ([label, rarity, colour, damage, reach, arc, swingTime, cooldown]) => {
        // fill: the p5 colour it's drawn with (prepareArt() in utils.js)
        Object.assign(type, { label: label.trim(), rarity, colour, fill: color(colour) });
        if (weapon) Object.assign(weapon, { damage, reach, arc, swingTime: swingTime / 1000, cooldown: cooldown / 1000 });
      },
    });
  },

  // top left on col, row
  placeObject(map, name, col, row) {
    if (!map.inside(col, row)) return;
    // no duplicate in the same spot (easy with a double click)
    if (map.objects.some((obj) => obj.type === name && obj.col === col && obj.row === row)) return;
    map.addObject(name, col, row);
  },

  // an enemy or npc standing on col, row. not on solid/empty tiles, it'd be stuck
  placeCharacter(map, kind, name, col, row) {
    if (map.isSolid(col, row)) return;
    if (map.spawnsAt(kind, col, row).some((spawn) => spawn.type === name)) return;
    map.addSpawn(kind, name, col, row);
    // appears at once
    spawnCharacters();
  },

  // player's feet mid-tile. not on solid/empty tiles, they'd be stuck
  placeSpawn(map, col, row) {
    if (map.isSolid(col, row)) return;
    map.setSpawnTile(col, row);
  },

  // adds a warp (warps.js) on any map tile, even under an object or npc, and opens its settings. an
  // existing warp there just opens its settings
  placeWarp(map, col, row) {
    if (!map.inside(col, row)) return;
    let warp = map.warpAt(col, row);
    if (!warp) {
      // first free warp1, warp2...
      let number = 1;
      while (map.warp(`warp${number}`)) number++;
      // nowhere, step, until set otherwise
      warp = { name: `warp${number}`, col, row, to: '', toWarp: '', activate: 'step', enemies: false };
      map.warps.push(warp);
    }
    this.editWarp(map, warp);
  },

  // a warp's settings: name, target map and warp, step or E, enemies following. applied on confirm,
  // Cancel leaves it. Show links opens the warp graph over it (warpgraph.js), showing the last save
  editWarp(map, warp) {
    // arrival choices on a map; '' is its spawn
    const arriveChoices = (mapName) => ['', ...warpNamesOn(mapName)];
    // a missing current target stays listed, marked missing, so opening the box doesn't silently
    // retarget it
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
      // new map, new warps: reset to its spawn
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
        // last, so its (undefined) value doesn't shift onConfirm's
        {
          label: 'Links',
          field: new Button({ w: 180, label: 'Show links', style: 'editor', onClick: () => WarpGraph.open(map.name, warp.name) }),
        },
      ],
      // a name unique on this map, so warps can target it
      canConfirm: ([name]) => name.trim() !== '' && !map.warps.some((other) => other !== warp && other.name === name.trim()),
      onConfirm: ([name, to, toWarp, activate, enemies]) => {
        Object.assign(warp, { name: name.trim(), to, toWarp: to ? toWarp : '', activate, enemies });
      },
    });
  },

  // body box of a character type standing on this tile (standingOnTile() in character.js, as
  // Character.placeFeetOnTile() uses)
  characterBodyOnTile(type, col, row) {
    const centre = standingOnTile(type, col, row);
    return { x: centre.x - type.width / 2, y: centre.y - type.height / 2, w: type.width, h: type.height };
  },

  // action(col, row) for every tile along a line, so fast drags that skip tiles between frames leave
  // no gaps
  forEachTileOnLine(map, from, to, action) {
    // half-tile steps skip nothing
    const steps = Math.max(1, Math.ceil(dist(from.x, from.y, to.x, to.y) / (TILE / 2)));
    for (let i = 0; i <= steps; i++) {
      const x = lerp(from.x, to.x, i / steps);
      const y = lerp(from.y, to.y, i / steps);
      action(map.colAt(x), map.rowAt(y));
    }
  },

  // ---------- drawing ----------

  // spawn and warp markers, and a preview of what a click would do. world positions (before
  // camera.end()), drawn after characters so markers are on top
  drawCursor(map, camera, aim) {
    // one screen pixel, so lines keep their thickness at any zoom
    const px = 1 / camera.zoom;

    // warps (warps.js), and the spawn ring where the player's feet go
    for (const warp of map.warps) drawWarpMarker(warp, px);
    drawSpawnRing(map.spawn.x, map.spawn.y + feetBelowCentre(PLAYER), px);

    if (!aim || !Input.mouse.inside || UI.hovered) return;
    const col = map.colAt(aim.x);
    const row = map.rowAt(aim.y);
    if (!map.inside(col, row)) return;

    // spawn: its ring preview, plus the tile outline below
    if (this.isSelected('trigger', 'spawn')) {
      const feet = standingOnTile(PLAYER, col, row);
      drawSpawnRing(feet.x, feet.y + feetBelowCentre(PLAYER), px);
    }

    // object: see-through preview over its tiles
    if (this.selected?.kind === 'object') {
      const type = OBJECT_TYPES[this.selected.name];
      this.drawGhost(type, col * TILE, row * TILE, type.width * TILE, type.height * TILE, px);
      return;
    }

    // enemy or npc: see-through preview standing on the tile
    if (this.selected && isCharacterKind(this.selected.kind)) {
      const type = EDITOR_CATALOGUES[this.selected.kind][this.selected.name];
      const body = this.characterBodyOnTile(type, col, row);
      this.drawGhost(type, body.x, body.y, body.w, body.h, px);
      return;
    }

    // erasing: outline what would be removed
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

    // the tile under the mouse, red when erasing
    noFill();
    this.outline(col * TILE, row * TILE, TILE, TILE, this.selected === null ? '#ff6b6b' : '#ffffff', px);
  },

  // see-through, outlined preview of an object or character type
  drawGhost(type, x, y, w, h, px) {
    if (type.img) {
      // tint(255, a) fades images until noTint()
      tint(255, 110);
      image(type.img, x, y, w, h);
      noTint();
      noFill();
    } else {
      // a new colour: color(type.fill) returns the same object, so fading it would fade every one on
      // the map
      fill(red(type.fill), green(type.fill), blue(type.fill), 110);
    }
    this.outline(x, y, w, h, '#ffffff', px);
  },

  // dark then light edge, visible on anything. uses the current fill
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
// built on ui.js / button.js ("a new element kind" in ui.js)

// small flat toolbar/inspector button. optional isOn() lights it like a toggle, checked every frame
// (e.g. Paint while something's picked)
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

// the toolbar background, with the map's name and size on the right. separators: x of each divider
// (added by Editor.init())
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

// bottom strip: tile under the mouse (left), click action (middle), zoom (right)
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

// the dock's background, tab strip, and the inspector (what's picked). tabs, palette and inspector
// buttons are separate elements on top (Editor.init()). inspectorY: the inspector's top
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
    // tab strip; the open tab covers the line below so it looks joined (EditorTabStrip)
    fill(C.header);
    rect(this.x, this.y, this.w, L.tabHeight);
    fill(C.edge);
    rect(this.x, this.y + L.tabHeight - 1, this.w, 1);

    // inspector header
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

    // left edge line against the map
    fill(C.edge);
    rect(this.x, this.y, 1, this.h);
  }

  // the pick's picture, name and kind, then some settings or a note
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

    // rows and note stop above the inspector buttons
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

// inspector content for a pick (null is Erase): { title, kind, rows, note }. rows: [label, value]
// pairs; note: optional text below
function inspectorInfo(selected) {
  if (selected === null) {
    return { title: 'Erase', kind: 'Tool', rows: [], note: 'Drag over the map. Starting on an object, enemy, npc, item or warp removes those, otherwise it empties tiles' };
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
        // long names truncated
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
  if (isItemKind(kind)) {
    // e.g. "Weapon · Rare"
    const category = `${type.category[0].toUpperCase()}${type.category.slice(1)} · ${RARITIES[type.rarity].label}`;
    const weapon = WEAPONS[type.weapon];
    if (!weapon) return { title: name, kind: category, rows: [], note: 'Click the map to place one. Give puts one in your inventory' };
    return {
      title: name,
      kind: category,
      rows: [['Damage', weapon.damage], ['Reach', `${weapon.reach} px`], ['Cooldown', `${weapon.cooldown} s`]],
    };
  }
  if (kind === 'trigger' && name === 'spawn') {
    return { title: 'spawn', kind: 'Trigger', rows: [], note: "Where the player starts on this map. There's only one, so placing it moves it" };
  }
  if (kind === 'trigger') {
    return { title: 'warp', kind: 'Trigger', rows: [], note: 'A way to another map. Placing one opens its settings, right click it on the map to change them later' };
  }
  // future tabs: name and tab label
  return { title: name, kind: EDITOR_TABS.find((tab) => tab.kind === kind).label, rows: [] };
}

// palette tabs styled like engine panel tabs: the open one is dock-coloured with a top accent line,
// joined to the palette. label-width. overflow scrolls via ‹ › (or the wheel), and opening a tab
// scrolls it into view, so EDITOR_TABS can grow freely
class EditorTabStrip extends UIElement {
  constructor(options) {
    super(options);
    // kind, label, and unscrolled x of each
    setText(11, BOLD, CENTER, CENTER, BUTTON_STYLES.default.font);
    let x = 0;
    this.tabs = EDITOR_TABS.map(({ kind, label }) => {
      const tab = { kind, label, x, w: Math.ceil(textWidth(label)) + 16 };
      x += tab.w;
      return tab;
    });
    this.length = x;
    // px scrolled
    this.scroll = 0;
    // hovered: a tab kind, 'back'/'forward' (arrows), or null
    this.under = null;
  }

  // arrows only when tabs overflow
  arrowsWidth() {
    return this.length > this.w ? EDITOR_LAYOUT.tabArrowWidth * 2 : 0;
  }

  // width available to tabs
  room() {
    return this.w - this.arrowsWidth();
  }

  maxScroll() {
    return Math.max(0, this.length - this.room());
  }

  // scrolls just enough to show tab `kind` fully
  reveal(kind) {
    const tab = this.tabs.find((t) => t.kind === kind);
    this.scroll = constrain(constrain(this.scroll, tab.x + tab.w - this.room(), tab.x), 0, this.maxScroll());
  }

  update(hovered) {
    this.hovered = hovered;
    this.under = null;
    if (!hovered) return;

    // consumed, so the camera doesn't zoom too (like the palette)
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

    // arrows step a tab at a time: back to the start of the one cut off on the left, forward to the
    // end of the one cut off on the right
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

    // clip partly scrolled tabs at the edge
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
    // arrows, greyed at the ends
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

// the palette grid: a square per entry in the open tab's catalogue. click picks, right click edits a
// tile (tileeditor.js) or item, hover names it. the wheel scrolls it instead of zooming (debug.js).
// reads catalogues live, so new tiles appear by themselves
class PaletteGrid extends UIElement {
  constructor(options) {
    super(options);
    // px scrolled per tab, kept when switching
    this.scroll = {};
    // hovered square's name, or null
    this.hoveredName = null;
  }

  names() {
    return Object.keys(EDITOR_CATALOGUES[Editor.tab]);
  }

  columns() {
    const L = EDITOR_LAYOUT;
    return Math.floor((this.w - L.padding * 2 - L.scrollbarWidth) / L.cellSize);
  }

  // max scroll for count squares (0 if they fit)
  maxScroll(count) {
    const L = EDITOR_LAYOUT;
    return Math.max(0, Math.ceil(count / this.columns()) * L.cellSize + L.padding * 2 - this.h);
  }

  // square i's top left on screen, centred in the space beside the scrollbar
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

    // consumed, so the camera doesn't zoom too
    let scroll = this.scroll[tab] ?? 0;
    if (hovered && Input.wheel !== 0) {
      scroll += Input.wheel * EDITOR_LAYOUT.scrollRate;
      Input.wheel = 0;
    }
    // clamped every frame, since a tab can lose squares
    this.scroll[tab] = constrain(scroll, 0, this.maxScroll(names.length));

    // hovered square; gaps don't count
    const { x, y } = Input.mouse;
    this.hoveredName = !hovered ? null : names.find((name, i) => {
      const cell = this.cell(i);
      return x >= cell.x && x < cell.x + size && y >= cell.y && y < cell.y + size;
    }) ?? null;
    if (!this.hoveredName) return;
    if (Input.buttonsPressed.has('left')) Editor.pick({ kind: tab, name: this.hoveredName });
    if (tab === 'tile' && Input.buttonsPressed.has('right')) TileEditor.open(TILE_TYPES[this.hoveredName]);
    if (isItemKind(tab) && Input.buttonsPressed.has('right')) Editor.editItem(this.hoveredName);
  }

  draw() {
    const L = EDITOR_LAYOUT;
    const C = EDITOR_COLOURS;
    const names = this.names();
    const size = L.swatchSize;

    // clip squares scrolled past the edges (canvas clip() lasts until restore())
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(this.x, this.y, this.w, this.h);
    drawingContext.clip();
    names.forEach((name, i) => {
      const { x, y } = this.cell(i);
      if (y + size < this.y || y > this.y + this.h) return;
      drawPaletteArt(Editor.tab, name, x, y, size);
      // yellow edge for the pick, white for hovered
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

    // scrollbar when overflowing
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

    // hovered name tooltip above the square (below on the top row)
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

// picture of a palette entry (EDITOR_TABS kind + name) or the Erase tool (kind 'erase'), size px
// square at x, y. tiles fill it; everything else sits on a dark square
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
    // red cross
    const r = size * 0.2;
    stroke(EDITOR_COLOURS.erase);
    strokeWeight(2.5);
    line(middleX - r, middleY - r, middleX + r, middleY + r);
    line(middleX + r, middleY - r, middleX - r, middleY + r);
  } else if (kind === 'trigger' && name === 'spawn') {
    drawSpawnRing(middleX, middleY);
  } else if (kind === 'trigger') {
    // warp, like its map marker (warps.js)
    const w = size * 0.6;
    drawWarpSquare(middleX - w / 2, middleY - w / 2, w, WARP_COLOURS.edge, false);
  } else if (isItemKind(kind)) {
    // like an inventory slot, with rarity glow (inventory.js)
    const item = { type: ITEM_TYPES[name] };
    drawItemGlow(item, middleX, middleY, size / 2);
    drawItemIcon(item, x + size * 0.2, y + size * 0.2, size * 0.6);
  } else {
    // objects and characters scaled to fit, aspect kept (a 2 x 1 table looks twice as wide)
    const type = EDITOR_CATALOGUES[kind][name];
    const scale = Math.min(size / type.width, size / type.height) * 0.8;
    const w = type.width * scale;
    const h = type.height * scale;
    drawTypeArt(type, x + (size - w) / 2, y + (size - h) / 2, w, h, 3);
  }
}

// a tile's, object's or character's picture, else its colour. dual grid tiles show their all-filled
// piece (dualgrid.js)
function drawTypeArt(type, x, y, w, h, radius = 0) {
  const img = type.img ?? type.dualTiles?.[0b1111];
  if (img) {
    image(img, x, y, w, h);
  } else {
    noStroke();
    fill(type.fill);
    rect(x, y, w, h, radius);
  }
  // dual grid badge, top right
  if (type.dualGrid) drawDualBadge(x + w - 15, y + 3);
}

// two small offset squares (the two grids), on a dark square so it shows on any tile. x, y top left
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

// spawn marker: yellow ring on a dark one, visible on anything. px: one screen pixel (drawCursor())
function drawSpawnRing(x, y, px = 1) {
  noFill();
  stroke(0, 0, 0, 160);
  strokeWeight(4 * px);
  circle(x, y, 20);
  stroke('#ffd23f');
  strokeWeight(2 * px);
  circle(x, y, 20);
}

// tile Picker (New map's fill): every TILE_TYPES tile then null (empty), each with its picture
// (empty is just an outline)
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
