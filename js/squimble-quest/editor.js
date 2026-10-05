// the map editor: paint tiles and place objects, enemies, npcs, items and triggers on the current map.
// turn on dev mode (` or Ctrl + D), then press B (for build). the guide for using it is
// assets/squimble-quest/maps/README.md.
//
// it's laid out like a game engine:
//   - the toolbar along the top: New, Open, Resize and Export, the Paint and Erase tools, Grid and
//     Keys (same as G and H), Play (closes the editor), and the map's name and size
//   - the dock on the right: the palette, with tabs for tiles, objects, enemies, npcs, triggers and
//     items (the wheel scrolls it), and the inspector under it showing what's picked
//   - the status bar along the bottom: the tile under the mouse, what clicking will do, and the zoom
//
// while it's open:
//   - everyone stops, and WASD / the arrows move the camera. the ui fades out while you move and comes
//     back when you stop
//   - picking something in the palette (hover over them for names) sets what Paint uses
//   - tiles: left click or drag to paint. New, right click or Edit opens the tile editor
//     (tileeditor.js), which has its own Export that saves tiles.json
//   - objects: click to place one with its top left on the tile. enemies and npcs: click to place one
//     standing on the tile
//   - weapons and items (one tab for each category in items.js): click to drop one on the ground (Export
//     doesn't save these). Give puts one in your inventory, right click or Edit changes its name,
//     rarity, colour and weapon numbers, and the inspector's Export saves items.json (items.js)
//   - sounds: click to place a sound block (soundblocks.js) that plays that sound, and right click it
//     on the map to pick its sound and how it plays. its green circle shows how far away it can be
//     heard. New, Edit or right click in the palette opens the sound editor (soundeditor.js), and the
//     inspector's Export saves sounds.json (sound.js)
//   - voices (the voices npcs talk with, VOICES in sound.js): click an npc on the map to give it that
//     voice, or right click an npc to pick one (or make a new one). New, Edit, right click in the
//     palette and Export work like sounds', since voices are made in the same editor and saved in the
//     same sounds.json
//   - Erase, then click or drag: if you start on an object, enemy, npc, item, warp or sound block it
//     removes those, otherwise it empties tiles (like off the map, so they aren't drawn and can't be
//     walked on)
//   - right click: the settings for a warp, a sound block, an enemy (its ai) or an npc (its voice) on
//     the map, or a tile, item, sound or voice in the palette
//   - opening it shows every enemy at its spawn, even defeated ones, so you see the whole design.
//     closing it puts everyone back at their spawns on full health (outside the editor, maps remember
//     their characters, loadMap() in sketch.js)
//   - triggers, click to place: the spawn (yellow ring, there's only one so it moves) and warps (purple
//     square, warps.js). placing a warp opens its settings, or right click it later. Show links opens
//     warpgraph.js
//   - the toolbar's map buttons ask for things with a FormBox (formbox.js): Resize (never smaller than
//     the area with tiles), New (any size and fill), Open (from a file), Export (to a file)
//   - dev mode keys still work (zoom, teleport, next map), and H lists them
//
// new tiles and catalogue entries show up in the palette by themselves. changes are made to the
// current map, and pressing M to go away and back keeps them, but reloading rebuilds the maps from
// their files, so Export if you want to keep them

// how fast WASD moves the camera, in screen px/s (so it's the same at any zoom)
const EDITOR_PAN_SPEED = 600;

// the biggest a New map can be each way, in tiles, in case of typos
const EDITOR_MAX_MAP_SIZE = 500;

// what a New map is called until it's exported
const NEW_MAP_NAME = 'new-map';

// added under DEV_KEYS in dev mode's H list (debug.js)
const EDITOR_KEYS = [
  'MAP EDITOR KEYS',
  'left click  paint / place',
  'right click change settings (warps, sound blocks, enemy ai,',
  '            npc voices, palette tiles, items and sounds)',
  'WASD        move around',
  'wheel       zoom',
  'B           close the editor',
];

// the ui fading out while WASD moves the camera
const EDITOR_UI_FADE = {
  // how many seconds you have to stop for before it comes back
  showDelay: 0.3,
  // how fast it fades, works like CAMERA.followSpeed
  speed: 14,
};

// in screen px (see the top of this file)
const EDITOR_LAYOUT = {
  toolbarHeight: 28,
  statusHeight: 20,
  // the dock, its row of tabs, and the inspector at the bottom of it
  dockWidth: 224,
  tabHeight: 22,
  inspectorHeight: 150,
  // a palette square, and its cell (the square plus the gap)
  swatchSize: 36,
  cellSize: 40,
  // how far the palette is in from the dock's edges
  padding: 6,
  // each of the < > tab arrows, which show when there are too many tabs to fit
  tabArrowWidth: 16,
  scrollbarWidth: 4,
  // how far the palette scrolls for each bit the wheel turns. one notch (about 100) is roughly a row
  scrollRate: 0.4,
};

// the dark theme, from darkest to lightest. the form box and warp graph use it too
const EDITOR_COLOURS = {
  // the background of the dock and the form box
  bar: '#1f232b',
  // the toolbar, status bar, panel headers and closed tabs
  header: '#171a20',
  // behind objects and characters in the palette, and inside text boxes
  well: '#14171c',
  // lines between things, and outlines
  edge: '#3a404c',
  tabHover: '#2a2f39',
  // the open tab, then the picked thing (also the spawn ring and the warp graph's highlights), then
  // erasing (and red outlines)
  accent: '#4a7bd8',
  picked: '#ffd23f',
  erase: '#ff6b6b',
  text: '#e6e8ec',
  dimText: '#8b92a0',
};

// the Triggers tab. there's no catalogue file for these, each one just has its own place() (called
// from the Triggers line in EDITOR_TABS) and its picture in drawPaletteArt()
const TRIGGER_TYPES = {
  // the player's start and respawn point. there's only one, so placing it moves it
  spawn: { place: (map, col, row) => Editor.placeSpawn(map, col, row) },
  // a way to another map or somewhere else on this one (warps.js). one per tile
  warp: { place: (map, col, row) => Editor.placeWarp(map, col, row) },
};

// the palette tabs, left to right. kind is what the editor calls the things on that tab, types is
// their catalogue, and place(map, name, col, row) runs when you click the map with one picked.
// tiles have no place() because they paint while the mouse is held instead (Editor.update()).
// so a new placeable kind is just a new line here. TILE_TYPES only fills in once tiles.json loads
// (tiles.js), which is why the palette reads the catalogues every time it draws
const EDITOR_TABS = [
  { kind: 'tile', label: 'Tiles', types: TILE_TYPES },
  { kind: 'object', label: 'Objects', types: OBJECT_TYPES, place: (map, name, col, row) => Editor.placeObject(map, name, col, row) },
  { kind: 'enemy', label: 'Enemies', types: ENEMY_TYPES, place: (map, name, col, row) => Editor.placeCharacter(map, 'enemy', name, col, row) },
  { kind: 'npc', label: 'NPCs', types: NPC_TYPES, place: (map, name, col, row) => Editor.placeCharacter(map, 'npc', name, col, row) },
  { kind: 'trigger', label: 'Triggers', types: TRIGGER_TYPES, place: (map, name, col, row) => TRIGGER_TYPES[name].place(map, col, row) },
  // one tab for each ITEM_CATEGORIES entry (items.js), with the category as its kind. they all get
  // dropped on the ground and changed with Editor.editItem()
  ...Object.entries(ITEM_CATEGORIES).map(([kind, label]) => ({
    kind, label, types: ITEMS_BY_CATEGORY[kind],
    place: (map, name, col, row) => Editor.placeItem(map, name, col, row),
  })),
  // sound blocks (soundblocks.js), one square for each sound in the library (SOUNDS in sound.js)
  { kind: 'sound', label: 'Sounds', types: SOUNDS, place: (map, name, col, row) => Editor.placeSoundBlock(map, name, col, row) },
  // npcs' voices (VOICES in sound.js). clicking an npc gives it the voice
  { kind: 'voice', label: 'Voices', types: VOICES, place: (map, name, col, row) => Editor.giveVoice(map, name, col, row) },
  // an empty example that just says "Nothing here yet". to use it, give it a catalogue and a
  // place(). if there are too many tabs to fit they scroll (EditorTabStrip)
  { kind: 'light', label: 'Lights', types: {} },
];

// each kind's catalogue, so EDITOR_CATALOGUES.enemy is ENEMY_TYPES
const EDITOR_CATALOGUES = Object.fromEntries(EDITOR_TABS.map(({ kind, types }) => [kind, types]));

// a field for a map's width or height, from min up to EDITOR_MAX_MAP_SIZE (NumberField in textfield.js)
function sizeField(value, min = 1) {
  return new NumberField({ w: 90, value, min, max: EDITOR_MAX_MAP_SIZE });
}

// is it a tab of things made in the sound editor (sounds or voices, SOUND_KINDS in sound.js)?
function isSoundKind(kind) {
  return kind in SOUND_KINDS;
}

// is it something that gets placed standing on a tile (an enemy or npc)?
function isCharacterKind(kind) {
  return kind in SPAWN_KINDS;
}

// is it an item category (ITEM_CATEGORIES in items.js) that gets put on the ground?
function isItemKind(kind) {
  return kind in ITEM_CATEGORIES;
}

// the new left column (or top row) of a resized map, doing one axis at a time. start and length are
// what they are now, and newLength is the new size. it's centred on the old map, then shifted so
// first to last (the columns or rows with tiles in, undefined if there aren't any) still fit
function resizedStart(start, length, newLength, first, last) {
  const centred = start + Math.floor((length - newLength) / 2);
  if (first === undefined) return centred;
  return constrain(centred, last - newLength + 1, first);
}

const Editor = {
  active: false,
  // { kind, name } (kind is from EDITOR_TABS), or null for Erase. it starts on a tile that doesn't
  // exist so checkSelected() picks the first real one once the tiles load
  selected: { kind: 'tile', name: '' },
  // the last thing picked in the palette, so Paint can go back to it after Erase
  lastPicked: null,
  // which palette tab is showing (a kind)
  tab: 'tile',
  // what the camera follows while editing, moved by WASD
  view: { x: 0, y: 0 },
  // { col, row } of the tile under the mouse, or null. for the status bar
  over: null,
  // where the mouse was last frame while dragging, so fast drags don't leave gaps
  lastPaint: null,
  // whether this erase drag removes things (true) or empties tiles (false)
  erasingThings: false,
  // how see-through the ui is (1 is solid, 0 is gone). it fades while WASD moves the camera
  // (sketch.js applies it). stillFor is the seconds since the camera last moved
  uiAlpha: 1,
  stillFor: 0,

  // made in init(). showTab() only shows the tiles' New and Export on the Tiles tab, the sounds' on the
  // Sounds tab, and the items' Export on item tabs. Edit is for when a tile, item or sound is picked,
  // and Give is for when an item is
  tabStrip: null,
  tileButtons: [],
  soundButtons: [],
  exportItemsButton: null,
  editButton: null,
  giveButton: null,

  // called once from setup(). makes the toolbar, the dock (palette and inspector) and the status bar,
  // all hidden until the editor opens
  init() {
    const L = EDITOR_LAYOUT;
    const dockX = GAME_W - L.dockWidth;
    const dockY = L.toolbarHeight;
    const dockH = GAME_H - L.toolbarHeight - L.statusHeight;
    const inspectorY = dockY + dockH - L.inspectorHeight;

    // they all go in the 'editor' group. the backgrounds go first so they're underneath, and they stop
    // clicks in the gaps between buttons from painting the map
    const add = (element) => UI.add(Object.assign(element, { group: 'editor' }));
    const toolbar = add(new EditorToolbar({ x: 0, y: 0, w: GAME_W, h: L.toolbarHeight }));
    add(new EditorStatusBar({ x: 0, y: GAME_H - L.statusHeight, w: GAME_W, h: L.statusHeight }));
    add(new EditorDock({ x: dockX, y: dockY, w: L.dockWidth, h: dockH, inspectorY }));

    // the toolbar buttons from left to right, each as wide as its label. EditorToolbar draws the lines
    // between them
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
    // Play goes in the middle like in a game engine, and closes the editor (player and gameCamera are
    // from sketch.js)
    x = Math.max(x + 16, (GAME_W - 64) / 2);
    button('▶  Play', { style: 'editorPrimary', onClick: () => this.close(player, gameCamera) });

    this.tabStrip = add(new EditorTabStrip({ x: dockX, y: dockY, w: L.dockWidth, h: L.tabHeight }));

    // goes between the tabs and the inspector
    add(new PaletteGrid({ x: dockX, y: dockY + L.tabHeight, w: L.dockWidth, h: inspectorY - dockY - L.tabHeight }));

    // the inspector's buttons along its bottom, for tiles (tileeditor.js), sounds (soundeditor.js) and
    // items
    const buttonW = (L.dockWidth - L.padding * 2 - 8) / 3;
    const inspectorButton = (i, label, onClick) => add(new EditorButton({
      x: dockX + L.padding + i * (buttonW + 4), y: GAME_H - L.statusHeight - 28, w: buttonW, h: 22, label, onClick,
    }));
    this.editButton = inspectorButton(0, 'Edit', () => {
      if (this.selected.kind === 'tile') TileEditor.open(TILE_TYPES[this.selected.name]);
      else if (isSoundKind(this.selected.kind)) SoundEditor.open(this.selected.name);
      else this.editItem(this.selected.name);
    });
    this.tileButtons = [
      inspectorButton(1, 'New', () => TileEditor.open(null)),
      inspectorButton(2, 'Export', () => TileEditor.exportTiles()),
    ];
    this.soundButtons = [
      // a new sound on Sounds, a new voice on Voices
      inspectorButton(1, 'New', () => SoundEditor.open(null, this.tab)),
      inspectorButton(2, 'Export', () => SoundEditor.exportSounds()),
    ];
    // it's in the same spot as New, so it's never shown on the Tiles tab (update())
    this.giveButton = inspectorButton(1, 'Give', () => this.giveItem(this.selected.name));
    // every weapon and item, including changes, as items.json (items.js)
    this.exportItemsButton = inspectorButton(2, 'Export', () => {
      downloadTextFile('items.json', itemsToText());
      showMessage('Exported! Put items.json in assets/squimble-quest/items/');
    });

    UI.showGroup('editor', false);
  },

  // picks the first tile if whatever's picked doesn't exist any more (or nothing's been picked yet).
  // runs after the tiles load (sketch.js)
  checkSelected() {
    if (this.selected && !EDITOR_CATALOGUES[this.selected.kind][this.selected.name]) {
      this.pick({ kind: 'tile', name: Object.keys(TILE_TYPES)[0] });
    }
  },

  // thing is { kind, name } for Paint to use
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
    // nothing from the game keeps playing while you edit, except what you press Play on (sound.js)
    Sound.stopAll();
    // the dialogue text box would be in the way (dialogue.js)
    if (Dialogue.active) Dialogue.close();
    // everyone goes back to their spawns, even defeated ones, so it shows the whole design and resets
    // the enemies (sketch.js)
    spawnCharacters();
    // start from where the camera already is, and follow the view instead of the player. follow()
    // also stops any dialogue glide
    this.view = { x: camera.x, y: camera.y };
    camera.follow(this.view);
    // shown straight away instead of fading in
    this.uiAlpha = 1;
    this.stillFor = EDITOR_UI_FADE.showDelay;
    UI.showGroup('editor', true);
    // the status bar goes where the hotbar is (inventory.js)
    if (InventoryScreen.active) InventoryScreen.show(false);
    Hotbar.show(false);
    this.showTab(this.tab);
  },

  close(player, camera) {
    this.active = false;
    this.lastPaint = null;
    camera.follow(player);
    // everyone goes back to their spawns on full health (sketch.js)
    spawnCharacters();
    UI.showGroup('editor', false);
    // Ctrl + D still works while typing, so the editor can close while a box is open
    if (WarpGraph.active) WarpGraph.close();
    if (FormBox.active) FormBox.close();
    if (SoundEditor.active) SoundEditor.close();
    Hotbar.show(true);
  },

  // ---------- tabs ----------

  // kind is from EDITOR_TABS. the tile buttons only show on Tiles
  showTab(kind) {
    this.tab = kind;
    this.tabStrip.reveal(kind);
    for (const button of this.tileButtons) button.visible = kind === 'tile';
    for (const button of this.soundButtons) button.visible = isSoundKind(kind);
    this.exportItemsButton.visible = isItemKind(kind);
  },

  isSelected(kind, name) {
    return this.selected !== null && this.selected.kind === kind && this.selected.name === name;
  },

  // ---------- new map, resizing and exporting ----------

  // asks for the size and what to fill it with (any tile, or empty, which is handy for rooms that
  // aren't rectangles since you can paint the floor shape), then makes the map and goes to it
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
        // goes in MAPS so M can come back to it (maps.js)
        addMap(NEW_MAP_NAME, () => makeBlankMap(cols, rows, fillWith));
        loadMap(NEW_MAP_NAME); // in sketch.js
      },
    });
  },

  // asks for a new size, which can't be smaller than the area with tiles in (the fields won't go
  // lower). it resizes around the middle, shifted so every tile still fits, and any new space is
  // empty. worldMap and gameCamera are the game's (sketch.js)
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
        // spawns on the bit that got cut off disappear
        spawnCharacters();
      },
    });
  },

  // asks for a name, then exports the current map (exportMap() and cleanMapName() are in mapfile.js,
  // worldMap is in sketch.js)
  askToExport() {
    FormBox.open({
      title: 'Export map',
      hint: 'Letters, numbers, - and _',
      confirmLabel: 'Export',
      rows: [{ label: 'Name', field: new TextField({ w: 180, value: worldMap.name }) }],
      // it needs a file name (just spaces counts as no name)
      canConfirm: ([name]) => cleanMapName(name) !== '',
      onConfirm: ([name]) => exportMap(worldMap, name),
    });
  },

  // ---------- every frame, while open ----------

  // aim is the mouse's world position or null
  update(map, camera, aim, dt) {
    // while a form box is open it's the only thing that runs. it's ui so it fades too, so put the
    // alpha back straight away, otherwise a box opened while faded (like placing a warp just after
    // moving) would be invisible. the warp graph sits on top of a warp's box and takes over until it
    // closes (warpgraph.js)
    // the sound editor covers everything and takes over until it closes (soundeditor.js)
    if (SoundEditor.active) {
      this.uiAlpha = 1;
      this.stillFor = EDITOR_UI_FADE.showDelay;
      SoundEditor.update();
      return;
    }
    if (FormBox.active) {
      this.uiAlpha = 1;
      this.stillFor = EDITOR_UI_FADE.showDelay;
      if (WarpGraph.active) WarpGraph.update();
      else FormBox.update();
      return;
    }

    const dir = Input.direction();

    // moving fades the ui out, and stopping for a moment fades it back in. hidden ui can't be clicked,
    // so clicks go through to the map
    this.stillFor = dir.x === 0 && dir.y === 0 ? this.stillFor + dt : 0;
    const showUI = this.stillFor >= EDITOR_UI_FADE.showDelay;
    this.uiAlpha = approach(this.uiAlpha, showUI ? 1 : 0, EDITOR_UI_FADE.speed, dt);
    for (const el of UI.group('editor')) el.interactive = showUI;
    // Edit only shows with a tile or item picked, and Give only with an item (it's in the same spot as
    // New on Tiles)
    const itemPicked = isItemKind(this.selected?.kind);
    this.editButton.visible = this.selected?.kind === 'tile' || isSoundKind(this.selected?.kind) || itemPicked;
    this.giveButton.visible = itemPicked && this.tab !== 'tile';

    // dividing by the zoom keeps the speed on screen the same
    const speed = EDITOR_PAN_SPEED / camera.zoom;
    const bounds = map.bounds();
    this.view.x = constrain(this.view.x + dir.x * speed * dt, bounds.left, bounds.right);
    this.view.y = constrain(this.view.y + dir.y * speed * dt, bounds.top, bounds.bottom);

    // the tile under the mouse, null if the mouse is off the game
    const over = aim && Input.mouse.inside ? { col: map.colAt(aim.x), row: map.rowAt(aim.y) } : null;
    // the status bar shows it unless the mouse is over the ui
    this.over = UI.hovered ? null : over;

    // one per click, using the picked tab's place() (EDITOR_TABS). mousePressed() already ignores
    // clicks on the ui (input.js)
    if (over && Input.mousePressed('left') && this.selected) {
      const { kind, name } = this.selected;
      EDITOR_TABS.find((tab) => tab.kind === kind).place?.(map, name, over.col, over.row);
    }

    // right click: the settings for what's there (a warp, then a sound block, then an enemy, then an
    // npc). any new settings boxes can hook in here
    if (over && Input.mousePressed('right')) {
      const warp = map.warpAt(over.col, over.row);
      const sound = map.soundAt(over.col, over.row);
      const enemy = map.spawnsAt('enemy', over.col, over.row)[0];
      const npc = map.spawnsAt('npc', over.col, over.row)[0];
      if (warp) this.editWarp(map, warp);
      else if (sound) SoundBlocks.edit(sound);
      else if (enemy) this.editEnemy(enemy);
      else if (npc) this.editNpc(npc);
    }

    // painting and erasing keep going while the mouse is held
    const erasing = this.selected === null && Input.mouseHeld('left');
    const painting = this.selected?.kind === 'tile' && Input.mouseHeld('left');

    if (over && (painting || erasing)) {
      // a drag that starts on a thing only removes things, otherwise it only empties tiles. that way
      // one drag can't remove a table and then the floor under it
      if (!this.lastPaint) this.erasingThings = erasing && this.thingsAt(map, over.col, over.row);

      let removedCharacter = false;
      this.forEachTileOnLine(map, this.lastPaint ?? aim, aim, (col, row) => {
        if (painting) {
          map.set(col, row, this.selected.name);
        } else if (this.erasingThings) {
          map.removeObjectsAt(col, row);
          map.removeWarpAt(col, row);
          map.removeSoundAt(col, row);
          const items = this.dropsAt(map, col, row);
          map.drops = map.drops.filter((drop) => !items.includes(drop));
          for (const kind of Object.keys(SPAWN_KINDS)) {
            if (map.removeSpawnsAt(kind, col, row)) removedCharacter = true;
          }
        } else {
          map.set(col, row, null);
        }
      });
      // removed characters disappear straight away
      if (removedCharacter) spawnCharacters();
      this.lastPaint = aim;
    } else {
      this.lastPaint = null;
    }
  },

  // any object, enemy, npc, item, warp or sound block on this tile?
  thingsAt(map, col, row) {
    if (map.objectsAt(col, row).length > 0 || map.warpAt(col, row) || map.soundAt(col, row) || this.dropsAt(map, col, row).length > 0) return true;
    return Object.keys(SPAWN_KINDS).some((kind) => map.spawnsAt(kind, col, row).length > 0);
  },

  // the drops on this tile (Drops in inventory.js), going by where they are on the ground
  dropsAt(map, col, row) {
    return map.drops.filter((drop) => map.colAt(drop.x) === col && map.rowAt(drop.y) === row);
  },

  // puts an item on the ground in the middle of the tile, ready to pick up. not on solid or empty tiles
  // (you couldn't reach it). Export doesn't save it, same as any drop (inventory.js)
  placeItem(map, name, col, row) {
    if (map.isSolid(col, row)) return;
    if (this.dropsAt(map, col, row).some((drop) => drop.item.type.name === name)) return;
    Drops.place(map, createItem(name), (col + 0.5) * TILE, (row + 0.5) * TILE);
  },

  // puts one in the player's inventory (player is in sketch.js)
  giveItem(name) {
    if (!player.inventory.add(createItem(name))) showMessage('No room, your inventory is full');
  },

  // changes an item's name, rarity and colour (items.js), plus its weapon's numbers on a second tab
  // (weapons.js). the changes happen when you press Save. Export on the item tabs saves them,
  // otherwise they're gone when you reload
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
    // whole numbers only, so the times are in ms
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
        // fill is the p5 colour it gets drawn with (prepareArt() in utils.js)
        Object.assign(type, { label: label.trim(), rarity, colour, fill: color(colour) });
        if (weapon) Object.assign(weapon, { damage, reach, arc, swingTime: swingTime / 1000, cooldown: cooldown / 1000 });
      },
    });
  },

  // with its top left on col, row
  placeObject(map, name, col, row) {
    if (!map.inside(col, row)) return;
    // no copies in the same spot (easy to do by double clicking)
    if (map.objects.some((obj) => obj.type === name && obj.col === col && obj.row === row)) return;
    map.addObject(name, col, row);
  },

  // an enemy or npc standing on col, row. not on solid or empty tiles, it'd be stuck
  placeCharacter(map, kind, name, col, row) {
    if (map.isSolid(col, row)) return;
    if (map.spawnsAt(kind, col, row).some((spawn) => spawn.type === name)) return;
    map.addSpawn(kind, name, col, row);
    // so it shows up straight away
    spawnCharacters();
  },

  // with the player's feet in the middle of the tile. not on solid or empty tiles, they'd be stuck
  placeSpawn(map, col, row) {
    if (map.isSolid(col, row)) return;
    map.setSpawnTile(col, row);
  },

  // adds a sound block (soundblocks.js) on any tile on the map, playing the sound `name`
  // (SOUNDS in sound.js) and playing when stepped on. it plays once so you can hear it. if
  // there's already one there it opens that one's settings instead, like warps. it can go on any
  // tile, even solid ones and ones with a warp (a warp on the same tile is the one right click opens)
  placeSoundBlock(map, name, col, row) {
    if (!map.inside(col, row)) return;
    const block = map.soundAt(col, row);
    if (block) return SoundBlocks.edit(block);
    const placed = { sound: name, col, row, activate: 'step' };
    map.sounds.push(placed);
    SoundBlocks.play(placed, map);
  },

  // adds a warp (warps.js) on any tile on the map, even under an object or npc, and opens its
  // settings. if there's already a warp there it just opens that one's settings
  placeWarp(map, col, row) {
    if (!map.inside(col, row)) return;
    let warp = map.warpAt(col, row);
    if (!warp) {
      // the first free name out of warp1, warp2...
      let number = 1;
      while (map.warp(`warp${number}`)) number++;
      // goes nowhere and works by stepping, until you change it
      warp = { name: `warp${number}`, col, row, to: '', toWarp: '', activate: 'step', enemies: false };
      map.warps.push(warp);
    }
    this.editWarp(map, warp);
  },

  // a warp's settings: its name, which map and warp it goes to, step or E, and whether enemies follow.
  // the changes happen when you press Save, and Cancel leaves it alone. Show links opens the warp graph
  // on top (warpgraph.js), which shows the warps as they were last saved
  editWarp(map, warp) {
    // where you can arrive on a map. '' is its spawn
    const arriveChoices = (mapName) => ['', ...warpNamesOn(mapName)];
    // if where it goes now doesn't exist it stays in the list, marked as missing, so just opening the
    // box doesn't quietly change where it goes
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
      // a different map has different warps, so go back to its spawn
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
        // last, so its value (undefined) doesn't shift the ones onConfirm gets
        {
          label: 'Links',
          field: new Button({ w: 180, label: 'Show links', style: 'editor', onClick: () => WarpGraph.open(map.name, warp.name) }),
        },
      ],
      // a name no other warp on this map has, so warps can link to it
      canConfirm: ([name]) => name.trim() !== '' && !map.warps.some((other) => other !== warp && other.name === name.trim()),
      onConfirm: ([name, to, toWarp, activate, enemies]) => {
        Object.assign(warp, { name: name.trim(), to, toWarp: to ? toWarp : '', activate, enemies });
      },
    });
  },

  // picks an enemy spawn's ai (ENEMY_AIS in enemies.js, '' means its kind's own). Export saves it
  editEnemy(spawn) {
    const own = aiName(ENEMY_TYPES[spawn.type].ai);
    FormBox.open({
      title: `Enemy: ${spawn.type}`,
      hint: 'direct is the old straight line, the rest go round',
      confirmLabel: 'Save',
      rows: [{
        label: 'AI',
        field: new Picker({
          w: 180,
          choices: ['', ...Object.keys(ENEMY_AIS)],
          value: spawn.ai ?? '',
          label: (name) => name || `its own (${own})`,
        }),
      }],
      onConfirm: ([ai]) => {
        if (ai) spawn.ai = ai;
        else delete spawn.ai;
        // so the one on the map picks it up
        spawnCharacters();
      },
    });
  },

  // picks an npc spawn's voice (VOICES in sound.js, '' means its kind's own from npcs.js). Say plays
  // its first line with the voice picked, Edit voice opens that voice in the sound editor, and New
  // voice makes one and gives it to this npc when it's saved. Export saves it in the map
  editNpc(spawn) {
    const type = NPC_TYPES[spawn.type];
    const own = type.voice ? `its own (${type.voice})` : 'its own (silent)';
    // what the picker's choice means: a voice's name, or the kind's own
    const voiceOf = (name) => name || type.voice;
    const picker = new Picker({
      w: 180,
      // a missing voice stays in the list so opening the box doesn't quietly change it
      choices: ['', ...Object.keys(VOICES), ...(spawn.voice && !VOICES[spawn.voice] ? [spawn.voice] : [])],
      value: spawn.voice ?? '',
      label: (name) => (!name ? own : VOICES[name] ? name : `${name} (missing)`),
    });
    const button = (label, onClick) => ({ label: '', field: new Button({ w: 180, label, style: 'editor', onClick }) });
    FormBox.open({
      title: `NPC: ${type.label}`,
      hint: 'Voices are made in the Voices tab',
      confirmLabel: 'Save',
      rows: [
        { label: 'Voice', field: picker },
        // buttons last, so their (undefined) values don't shift the one onConfirm gets
        button('▶  Say', () => Sound.preview(VOICES[voiceOf(picker.value)], { say: type.dialogue[0] })),
        button('Edit voice', () => {
          const name = voiceOf(picker.value);
          // confirm first, so the npc keeps the voice picked here, then open that voice
          FormBox.confirm();
          if (VOICES[name]) SoundEditor.open(name); // soundeditor.js
        }),
        button('New voice', () => {
          FormBox.close();
          SoundEditor.open(null, 'voice', (name) => {
            spawn.voice = name;
            spawnCharacters();
          });
        }),
      ],
      onConfirm: ([voice]) => {
        if (voice) spawn.voice = voice;
        else delete spawn.voice;
        // so the one on the map picks it up
        spawnCharacters();
      },
    });
  },

  // the Voices tab's place(): gives the npc standing on this tile the voice, and has it say its first
  // line with it so you hear the difference
  giveVoice(map, name, col, row) {
    const spawn = map.spawnsAt('npc', col, row)[0];
    if (!spawn) return showMessage('Click an NPC to give them this voice');
    spawn.voice = name;
    spawnCharacters();
    const type = NPC_TYPES[spawn.type];
    Sound.preview(VOICES[name], { say: type.dialogue[0] });
    showMessage(`${type.label} talks with ${name} now. Export the map to keep it`);
  },

  // the body box of a character type standing on this tile (standingOnTile() in character.js, same as
  // Character.placeFeetOnTile() uses)
  characterBodyOnTile(type, col, row) {
    const centre = standingOnTile(type, col, row);
    return { x: centre.x - type.width / 2, y: centre.y - type.height / 2, w: type.width, h: type.height };
  },

  // runs action(col, row) for every tile along a line, so fast drags that skip over tiles between
  // frames don't leave gaps
  forEachTileOnLine(map, from, to, action) {
    // half tile steps so nothing gets skipped
    const steps = Math.max(1, Math.ceil(dist(from.x, from.y, to.x, to.y) / (TILE / 2)));
    for (let i = 0; i <= steps; i++) {
      const x = lerp(from.x, to.x, i / steps);
      const y = lerp(from.y, to.y, i / steps);
      action(map.colAt(x), map.rowAt(y));
    }
  },

  // ---------- drawing ----------

  // the spawn, warp and sound block markers, and a preview of what clicking would do. world positions
  // (before camera.end()), and drawn after the characters so the markers are on top
  drawCursor(map, camera, aim) {
    // one screen pixel, so lines stay the same thickness at any zoom
    const px = 1 / camera.zoom;

    // sound blocks (soundblocks.js), warps on top of them (warps.js), and the spawn ring where the
    // player's feet go
    for (const block of map.sounds) drawSoundMarker(block, px);
    for (const warp of map.warps) drawWarpMarker(warp, px);
    drawSpawnRing(map.spawn.x, map.spawn.y + feetBelowCentre(PLAYER), px);

    if (!aim || !Input.mouse.inside || UI.hovered) return;
    const col = map.colAt(aim.x);
    const row = map.rowAt(aim.y);
    if (!map.inside(col, row)) return;

    // a sound block under the mouse shows how far away it can be heard
    const sound = map.soundAt(col, row);
    if (sound) drawSoundRange(sound, px);

    // spawn: a preview of its ring, plus the tile outline further down
    if (this.isSelected('trigger', 'spawn')) {
      const feet = standingOnTile(PLAYER, col, row);
      drawSpawnRing(feet.x, feet.y + feetBelowCentre(PLAYER), px);
    }

    // object: a see-through preview over its tiles
    if (this.selected?.kind === 'object') {
      const type = OBJECT_TYPES[this.selected.name];
      this.drawGhost(type, col * TILE, row * TILE, type.width * TILE, type.height * TILE, px);
      return;
    }

    // enemy or npc: a see-through preview standing on the tile
    if (this.selected && isCharacterKind(this.selected.kind)) {
      const type = EDITOR_CATALOGUES[this.selected.kind][this.selected.name];
      const body = this.characterBodyOnTile(type, col, row);
      this.drawGhost(type, body.x, body.y, body.w, body.h, px);
      return;
    }

    // erasing: outline whatever would get removed
    if (this.selected === null) {
      noFill();
      for (const obj of map.objectsAt(col, row)) {
        const type = OBJECT_TYPES[obj.type];
        this.outline(obj.col * TILE, obj.row * TILE, type.width * TILE, type.height * TILE, EDITOR_COLOURS.erase, px);
      }
      for (const kind of Object.keys(SPAWN_KINDS)) {
        for (const spawn of map.spawnsAt(kind, col, row)) {
          const body = this.characterBodyOnTile(EDITOR_CATALOGUES[kind][spawn.type], col, row);
          this.outline(body.x, body.y, body.w, body.h, EDITOR_COLOURS.erase, px);
        }
      }
    }

    // the tile under the mouse, in red when erasing
    noFill();
    this.outline(col * TILE, row * TILE, TILE, TILE, this.selected === null ? EDITOR_COLOURS.erase : '#ffffff', px);
  },

  // a see-through preview with an outline, for an object or character type
  drawGhost(type, x, y, w, h, px) {
    if (type.img) {
      // tint(255, a) fades pictures until noTint()
      tint(255, 110);
      image(type.img, x, y, w, h);
      noTint();
      noFill();
    } else {
      // makes a new colour, because color(type.fill) gives back the same object, so fading it would
      // fade every one of them on the map
      fill(red(type.fill), green(type.fill), blue(type.fill), 110);
    }
    this.outline(x, y, w, h, '#ffffff', px);
  },

  // a dark edge and then a light one, so it shows up on anything. uses whatever fill is set
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
// built on ui.js and button.js (see "to make a new kind of element" in ui.js)

// a small flat button for the toolbar and inspector. the optional isOn() lights it up like a toggle,
// and it's checked every frame (like Paint lighting up while something's picked)
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

// the toolbar's background, with the map's name and size on the right. separators is the x of each
// line between buttons (Editor.init() adds them)
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

// the strip along the bottom: the tile under the mouse (left), what clicking does (middle), and the
// zoom (right)
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
    const click = s === null ? 'erase' : s.kind === 'voice' ? `give an NPC ${s.name}` : `${s.kind === 'tile' ? 'paint' : 'place'} ${s.name}`;

    setText(11, BOLD, LEFT, CENTER);
    fill(C.text);
    text(where, this.x + 10, middleY);
    fill(C.dimText);
    text(`Left click: ${click}   ·   Right click: settings   ·   WASD: move   ·   Wheel: zoom`, this.x + 180, middleY);
    textAlign(RIGHT, CENTER);
    text(`Zoom ${Math.round(gameCamera.zoom * 100)}%`, this.x + this.w - 10, middleY);
  }
}

// the dock's background, the strip behind the tabs, and the inspector (what's picked). the tabs,
// palette and inspector buttons are their own elements on top of this (Editor.init()). inspectorY is
// the top of the inspector
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
    // the tab strip. the open tab covers the line under it so it looks joined on (EditorTabStrip)
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

    // a line down the left edge, against the map
    fill(C.edge);
    rect(this.x, this.y, 1, this.h);
  }

  // the picked thing's picture, name and kind, then some of its settings or a note
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

    // the rows and note stop above the inspector buttons
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

// what the inspector shows for the picked thing (null is Erase): { title, kind, rows, note }. rows is
// a list of [label, value] pairs, and note is optional text under them
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
        // long names get cut short
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
        kind === 'enemy' ? ['AI', aiName(type.ai)] : ['Voice', type.voice ?? 'silent'],
      ],
      note: `Right click one on the map to pick its ${kind === 'enemy' ? 'AI' : 'voice'}`,
    };
  }
  if (isItemKind(kind)) {
    // like "Weapon · Rare"
    const category = `${type.category[0].toUpperCase()}${type.category.slice(1)} · ${RARITIES[type.rarity].label}`;
    const weapon = WEAPONS[type.weapon];
    if (!weapon) return { title: name, kind: category, rows: [], note: 'Click the map to place one. Give puts one in your inventory' };
    return {
      title: name,
      kind: category,
      rows: [['Damage', weapon.damage], ['Reach', `${weapon.reach} px`], ['Cooldown', `${weapon.cooldown} s`]],
    };
  }
  if (kind === 'sound') {
    return {
      title: name,
      kind: 'Sound',
      rows: type.wave === 'file'
        ? [['File', type.file], ['Speed', `${Math.round((type.pitch / 440) * 100)}%`]]
        : [['Wave', SOUND_WAVES[type.wave].label], ['Pitch', `${type.pitch} Hz (${noteName(type.pitch)})`]],
      note: 'Click the map for a block that plays it. Right click it here (or Edit) to change it',
    };
  }
  if (kind === 'voice') {
    return {
      title: name,
      kind: 'Voice',
      rows: [['Pitch', `${type.pitch} Hz (${noteName(type.pitch)})`], ['Talk speed', `${type.talkSpeed} letters/s`]],
      note: 'Click an NPC to give them this voice',
    };
  }
  if (kind === 'trigger' && name === 'spawn') {
    return { title: 'spawn', kind: 'Trigger', rows: [], note: "Where the player starts on this map. There's only one, so placing it moves it" };
  }
  if (kind === 'trigger') {
    return { title: 'warp', kind: 'Trigger', rows: [], note: 'A way to another map. Placing one opens its settings, right click it on the map to change them later' };
  }
  // tabs added later: just the name and the tab's label
  return { title: name, kind: EDITOR_TABS.find((tab) => tab.kind === kind).label, rows: [] };
}

// the palette tabs, made to look like the panel tabs in a game engine. the open one is the same
// colour as the dock with a coloured line along the top, so it looks joined to the palette. each is
// as wide as its label. if they don't all fit they scroll with the < > arrows (or the wheel), and
// opening a tab scrolls it into view, so EDITOR_TABS can have as many as you want
class EditorTabStrip extends UIElement {
  constructor(options) {
    super(options);
    // the kind, label, and x (before scrolling) of each tab
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
    // what the mouse is over: a tab's kind, 'back'/'forward' (the arrows), or null
    this.under = null;
  }

  // the arrows only show when the tabs don't all fit
  arrowsWidth() {
    return this.length > this.w ? EDITOR_LAYOUT.tabArrowWidth * 2 : 0;
  }

  // how much width the tabs get
  room() {
    return this.w - this.arrowsWidth();
  }

  maxScroll() {
    return Math.max(0, this.length - this.room());
  }

  // scrolls just enough to show all of tab `kind`
  reveal(kind) {
    const tab = this.tabs.find((t) => t.kind === kind);
    this.scroll = constrain(constrain(this.scroll, tab.x + tab.w - this.room(), tab.x), 0, this.maxScroll());
  }

  update(hovered) {
    this.hovered = hovered;
    this.under = null;
    if (!hovered) return;

    // used up here so the camera doesn't zoom as well (same as the palette)
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

    // the arrows move one tab at a time: back to the start of the one cut off on the left, or forward
    // to the end of the one cut off on the right
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

    // cut off tabs that are partly scrolled past the edge
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
    // the arrows, greyed out when you can't go any further
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

// the palette grid: one square for each thing in the open tab's catalogue. clicking picks it, right
// clicking changes a tile (tileeditor.js) or item, and hovering shows its name. the wheel scrolls it
// instead of zooming (debug.js). it reads the catalogues as it goes, so new tiles show up by themselves
class PaletteGrid extends UIElement {
  constructor(options) {
    super(options);
    // how many px each tab is scrolled, kept when switching between them
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

  // the furthest it can scroll with count squares (0 if they all fit)
  maxScroll(count) {
    const L = EDITOR_LAYOUT;
    return Math.max(0, Math.ceil(count / this.columns()) * L.cellSize + L.padding * 2 - this.h);
  }

  // the top left of square number i on screen, centred in the space next to the scrollbar
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

    // used up here so the camera doesn't zoom as well
    let scroll = this.scroll[tab] ?? 0;
    if (hovered && Input.wheel !== 0) {
      scroll += Input.wheel * EDITOR_LAYOUT.scrollRate;
      Input.wheel = 0;
    }
    // kept in range every frame, since a tab can lose squares
    this.scroll[tab] = constrain(scroll, 0, this.maxScroll(names.length));

    // which square the mouse is over. the gaps don't count
    const { x, y } = Input.mouse;
    this.hoveredName = !hovered ? null : names.find((name, i) => {
      const cell = this.cell(i);
      return x >= cell.x && x < cell.x + size && y >= cell.y && y < cell.y + size;
    }) ?? null;
    if (!this.hoveredName) return;
    if (Input.buttonsPressed.has('left')) Editor.pick({ kind: tab, name: this.hoveredName });
    if (tab === 'tile' && Input.buttonsPressed.has('right')) TileEditor.open(TILE_TYPES[this.hoveredName]);
    if (isItemKind(tab) && Input.buttonsPressed.has('right')) Editor.editItem(this.hoveredName);
    if (isSoundKind(tab) && Input.buttonsPressed.has('right')) SoundEditor.open(this.hoveredName);
  }

  draw() {
    const L = EDITOR_LAYOUT;
    const C = EDITOR_COLOURS;
    const names = this.names();
    const size = L.swatchSize;

    // cut off squares that are scrolled past the edges (the canvas's clip() lasts until restore())
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(this.x, this.y, this.w, this.h);
    drawingContext.clip();
    names.forEach((name, i) => {
      const { x, y } = this.cell(i);
      if (y + size < this.y || y > this.y + this.h) return;
      drawPaletteArt(Editor.tab, name, x, y, size);
      // a yellow edge for the picked one, and white for the one the mouse is over
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

    // a scrollbar when they don't all fit
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

    // the hovered square's name in a little box above it (or below it on the top row)
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

// the picture for something in the palette (an EDITOR_TABS kind and a name) or the Erase tool (kind
// 'erase'), size px square at x, y. tiles fill the whole square, and everything else sits on a dark one
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
    drawSpawnRing(middleX, middleY);
  } else if (kind === 'trigger') {
    // a warp, same as its marker on the map (warps.js)
    const w = size * 0.6;
    drawWarpSquare(middleX - w / 2, middleY - w / 2, w, WARP_COLOURS.edge, false);
  } else if (kind === 'sound') {
    // the whole sound from start to end (sound.js)
    noFill();
    stroke(SOUND_COLOURS.edge);
    strokeWeight(1);
    drawSoundShape(SOUNDS[name], x + 3, y + 3, size - 6, size - 6);
  } else if (kind === 'voice') {
    // the voice saying something (sound.js), worked out once and kept
    noFill();
    stroke(SOUND_COLOURS.edge);
    strokeWeight(1);
    drawSoundShape(VOICES[name], x + 3, y + 3, size - 6, size - 6, 'Hello, how are you today?');
  } else if (isItemKind(kind)) {
    // like in an inventory slot, with its rarity glow (itemglow.js)
    drawGlowingItem({ type: ITEM_TYPES[name] }, middleX, middleY, size * 0.6, size / 2);
  } else {
    // objects and characters are scaled to fit but keep their shape (a 2 x 1 table looks twice as wide)
    const type = EDITOR_CATALOGUES[kind][name];
    const scale = Math.min(size / type.width, size / type.height) * 0.8;
    const w = type.width * scale;
    const h = type.height * scale;
    drawTypeArt(type, x + (size - w) / 2, y + (size - h) / 2, w, h, 3);
  }
}

// a tile's, object's or character's picture, or its colour if it doesn't have one. dual grid tiles
// show their completely filled piece (dualgrid.js)
function drawTypeArt(type, x, y, w, h, radius = 0) {
  const img = type.img ?? type.dualTiles?.[0b1111];
  if (img) {
    image(img, x, y, w, h);
  } else {
    noStroke();
    fill(type.fill);
    rect(x, y, w, h, radius);
  }
  // the dual grid badge in the top right
  if (type.dualGrid) drawDualBadge(x + w - 15, y + 3);
}

// two small overlapping squares (for the two grids), on a dark square so it shows up on any tile.
// x, y is the top left
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

// the spawn marker: a yellow ring on a dark one so it shows up on anything. px is one screen pixel
// (drawCursor())
function drawSpawnRing(x, y, px = 1) {
  noFill();
  stroke(0, 0, 0, 160);
  strokeWeight(4 * px);
  circle(x, y, 20);
  stroke(EDITOR_COLOURS.picked);
  strokeWeight(2 * px);
  circle(x, y, 20);
}

// a Picker for tiles (New map's fill): every tile in TILE_TYPES and then null (empty), each with its
// picture (empty is just an outline)
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
