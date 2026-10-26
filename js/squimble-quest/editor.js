// the map editor: paint tiles and place objects, enemies, npcs, items and triggers on the current map.
// press B (for build), which works for anyone whose role can build (ROLES in config.js, with or
// without dev mode). the guide for using it is assets/squimble-quest/maps/README.md.
//
// it's laid out like a game engine:
//   - the menu bar along the top (editormenu.js): File (new, open, save, recover), Edit (undo, copy and
//     paste), View, Map (resize, atmosphere, world map, find uses, problems, art), Tools and Help, with
//     every command's key.
//     Play and Play here in the middle, and the map's name and size on the right (a yellow dot while
//     it's unsaved, edithistory.js)
//   - the tool strip down the left (edittools.js): Paint, Erase, Fill, Rectangle, Select and Pick, the
//     brush size, undo and redo
//   - the dock on the right: the palette, with tabs for tiles, objects, enemies, npcs, triggers and
//     items (the wheel scrolls it), a search box, a row of what was picked lately (Shift + click pins
//     one), and the inspector under it showing what's picked
//   - the status bar along the bottom: the tile under the mouse, what clicking will do, the selection,
//     the brush and the zoom
//   - the minimap in the bottom left corner of the view (EditorMinimap): click or drag it to move
//
// resting the mouse on an enemy spawn shows the ranges it notices you from and the floor it can see
// (drawEnemySenses())
//
// while it's open:
//   - everyone stops, and WASD / the arrows move the camera. the ui fades out while you move and comes
//     back when you stop
//   - picking something in the palette (hover over them for names) sets what Paint uses
//   - tiles: left click or drag to paint. New, right click or Edit opens the tile editor
//     (tileeditor.js). Export downloads the files of new or changed tiles (datafiles.js)
//   - objects: click to place one with its top left on the tile. enemies and npcs: click to place one
//     standing on the tile
//   - weapons and items (one tab for each category in items.js): click to put one on the ground, saved
//     with the map (placeItem()). Give puts one in your inventory, right click or Edit changes its name,
//     rarity, colour and everything about its weapon (weaponeditor.js), and the inspector's Export
//     downloads changed item files. the Weapons tab ends with the enemies' own weapons (with a badge),
//     which clicking opens, and Export saves their enemy files too
//   - sounds: click to place a sound block (soundblocks.js) that plays that sound, and right click it
//     on the map to pick its sound and how it plays. its green circle shows how far away it can be
//     heard. New, Edit or right click in the palette opens the sound editor (soundeditor.js), and the
//     inspector's Export downloads the files of new or changed sounds (datafiles.js)
//   - voices (the voices npcs talk with, VOICES in sound.js): click an npc on the map to give it that
//     voice, or right click an npc to pick one (or make a new one). New, Edit, right click in the
//     palette and Export work like sounds', since voices are made in the same editor and saved the
//     same way (in voices/)
//   - particles (particles.js): click the map to try one out there, fanned out to the right as if it
//     was hit from the left. New, Edit or right click in the palette opens the particle editor
//     (particleeditor.js), and the inspector's Export downloads the files of new or changed effects
//   - the tools (edittools.js, whose header says what each does): Erase empties tiles (like off the
//     map, so they aren't drawn and can't be walked on) or removes things, Fill, Rectangle, Select with
//     copy and paste, and Pick (or Alt + click). Ctrl + Z undoes anything on the map (edithistory.js)
//   - right click: the settings for a warp, a sound block (its sound, and how it moves), an enemy (its
//     weapon, armour, ai, sound and particles, next to a picture of it), an npc (its voice and sound) or
//     a chest (what starts in it, storageeditor.js) on the map, or a tile, item, sound or voice in the palette. resting the mouse on a row says what it does
//   - opening it shows every enemy at its spawn, even defeated ones, so you see the whole design.
//     closing it puts everyone back at their spawns on full health (outside the editor, maps remember
//     their characters, loadMap() in sketch.js)
//   - triggers, click to place: the spawn (yellow ring, there's only one so it moves) and warps (purple
//     square, warps.js). placing a warp opens its settings, or right click it later. Show links opens
//     warpgraph.js. drag to make an atmosphere area (dashed outline, atmosphere.js), which opens its
//     settings, or right click inside it later
//   - the File and Map menus ask for things with a FormBox (formbox.js): New (any size and fill),
//     Open (from a file), Save as (to a file), Resize (never smaller than the area with tiles), and
//     Atmosphere (the map's fog, colour, weather and background sound, atmosphere.js)
//   - Space closes the editor and plays from the mouse. opening it again goes back to where you were
//   - zoom, G and P work with or without dev mode. in dev mode its keys work too (teleport, next map),
//     and View > Dev menu lists them. dev mode's info panel is hidden unless View > Dev info panel is
//     ticked, since the status bar and menu bar already show the map, mouse and zoom
//
// new tiles and catalogue entries show up in the palette by themselves. changes are made to the
// current map, and pressing M to go away and back keeps them. reloading rebuilds the maps from their
// files, but unsaved changes are kept in the browser until they're saved (File > Recover unsaved
// changes, edithistory.js). Save (Ctrl + S) downloads the map's file to put in the maps folder

// how fast WASD moves the camera, in screen px/s (so it's the same at any zoom)
const EDITOR_PAN_SPEED = 600;

// the biggest a New map can be each way, in tiles, in case of typos
const EDITOR_MAX_MAP_SIZE = 500;

// what a New map is called until it's exported
const NEW_MAP_NAME = 'new-map';

// [key, what it does], listed in the dev menu while the editor's open (debug.js). the rest are in the
// menus and Help > Keys and mouse (editormenu.js)
const EDITOR_KEYS = [
  ['Left click', 'use the tool'],
  ['Right click', 'settings'],
  ['Alt+click', 'pick'],
  ['WASD', 'move around'],
  ['Wheel', 'zoom'],
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
  // the menu bar (still called the toolbar, since debug.js and others keep clear of it), the status
  // bar and the tool strip down the left
  toolbarHeight: 26,
  statusHeight: 20,
  toolStripWidth: 34,
  // the dock, its row of tabs, the search box and recent row under them, and the inspector at the
  // bottom of it
  dockWidth: 224,
  tabHeight: 22,
  searchHeight: 26,
  recentHeight: 30,
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
  // the menu bar, tool strip, status bar, panel headers and closed tabs
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
  // a box or oval with an atmosphere of its own (atmosphere.js), dragged out over the map
  area: { place: (map, col, row) => AtmosphereAreas.start(col, row) },
};

// the palette tabs, left to right. kind is what the editor calls the things on that tab, types is
// their catalogue, and place(map, name, col, row) runs when you click the map with one picked.
// tiles have no place() because they paint while the mouse is held instead (Editor.update()).
// so a new placeable kind is just a new line here. TILE_TYPES only fills in once the tile files load
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
  // particle effects (particles.js). clicking the map bursts one there to try it, as if it was hit from
  // the left (so you can see the spread), from half a tile up
  { kind: 'particle', label: 'Particles', types: PARTICLE_EFFECTS, place: (map, name, col, row) => Particles.burst(name, (col + 0.5) * TILE, (row + 0.5) * TILE, { height: TILE / 2, angle: 0 }) },
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

// the localStorage key for the recent row (Editor.recent)
const EDITOR_RECENT_KEY = 'sq-editor-recent';

const Editor = {
  active: false,
  // what's picked in the palette, { kind, name } (kind is from EDITOR_TABS), which Paint, Fill and
  // Rectangle use. it starts on a tile that doesn't exist so checkSelected() picks the first real one
  // once the tiles load
  selected: { kind: 'tile', name: '' },
  // the tool that's on (EDITOR_TOOLS in edittools.js), and how many tiles across the brush is
  tool: 'paint',
  brush: 1,
  // what was picked lately, newest first, each { kind, name, pinned }. pinned ones stay at the front.
  // kept in this browser (EDITOR_RECENT_KEY)
  recent: [],
  // which palette tab is showing (a kind)
  tab: 'tile',
  // what the camera follows while editing, moved by WASD
  view: { x: 0, y: 0 },
  // { col, row } of the tile under the mouse, or null. for the status bar
  over: null,
  // how see-through the ui is (1 is solid, 0 is gone). it fades while WASD moves the camera
  // (sketch.js applies it). stillFor is the seconds since the camera last moved, and uiHidden is Tab
  // hiding it until Tab's pressed again
  uiAlpha: 1,
  stillFor: 0,
  uiHidden: false,
  // where the camera was when it closed, { map, x, y }, so opening it on the same map goes back there
  lastView: null,
  // a tile flashing after Check for problems went to it, { col, row, until }, or null
  flash: null,
  // a box was open last frame (so closing it counts as a change to check, edithistory.js)
  boxWasOpen: false,
  // Play here was clicked, so the next click on the map starts playing there
  choosingStart: false,
  // whether it's been opened since the page loaded (the first time says if there are unsaved changes)
  openedBefore: false,

  // made in init()
  menuBar: null,
  palette: null,
  search: null,
  tabStrip: null,

  // called once from setup(). makes the menu bar, tool strip, dock (palette and inspector) and status
  // bar, all hidden until the editor opens
  init() {
    const L = EDITOR_LAYOUT;
    const dockX = GAME_W - L.dockWidth;
    const dockY = L.toolbarHeight;
    const dockH = GAME_H - L.toolbarHeight - L.statusHeight;
    const inspectorY = dockY + dockH - L.inspectorHeight;
    this.loadRecent();

    // they all go in the 'editor' group. the backgrounds go first so they're underneath, and they stop
    // clicks in the gaps between buttons from painting the map
    const add = (element) => UI.add(Object.assign(element, { group: 'editor' }));
    this.menuBar = add(new EditorMenuBar({ x: 0, y: 0, w: GAME_W, h: L.toolbarHeight })); // editormenu.js
    add(new EditorStatusBar({ x: 0, y: GAME_H - L.statusHeight, w: GAME_W, h: L.statusHeight }));
    add(new EditorToolStrip({ x: 0, y: L.toolbarHeight, w: L.toolStripWidth, h: dockH }));
    add(new EditorDock({ x: dockX, y: dockY, w: L.dockWidth, h: dockH, inspectorY }));

    // Play goes in the middle like in a game engine, and closes the editor (player and gameCamera are
    // from sketch.js). Play here plays from the mouse (Space)
    setText(12, BOLD, CENTER, CENTER, BUTTON_STYLES.default.font);
    const playW = Math.ceil(textWidth('▶  Play')) + 20;
    const hereW = Math.ceil(textWidth('Play here')) + 20;
    const playX = Math.round((GAME_W - playW - hereW - 4) / 2);
    add(new EditorButton({ x: playX, y: 3, w: playW, h: L.toolbarHeight - 6, label: '▶  Play', style: 'editorPrimary', onClick: () => this.close(player, gameCamera) }));
    add(new EditorButton({ x: playX + playW + 4, y: 3, w: hereW, h: L.toolbarHeight - 6, label: 'Play here', isOn: () => this.choosingStart, onClick: () => { if (this.choosingStart) this.choosingStart = false; else this.startPlayHere(); } }));

    this.tabStrip = add(new EditorTabStrip({ x: dockX, y: dockY, w: L.dockWidth, h: L.tabHeight }));
    // under the tabs: the search box and the recent row
    this.search = add(new PaletteSearch({ x: dockX + L.padding, y: dockY + L.tabHeight + 4, w: L.dockWidth - L.padding * 2, h: L.searchHeight - 6 }));
    add(new RecentStrip({ x: dockX, y: dockY + L.tabHeight + L.searchHeight, w: L.dockWidth, h: L.recentHeight }));

    // goes between those and the inspector
    const gridY = dockY + L.tabHeight + L.searchHeight + L.recentHeight;
    this.palette = add(new PaletteGrid({ x: dockX, y: gridY, w: L.dockWidth, h: inspectorY - gridY }));
    // the whole map, small, in the bottom left (View > Minimap). it places itself each frame
    add(new EditorMinimap());
    // the menu bar's open menu, which goes on top of everything when it opens (editormenu.js)
    this.menuBar.list = add(new EditorMenuList({ bar: this.menuBar }));

    // the inspector's buttons along its bottom, for tiles (tileeditor.js), sounds (soundeditor.js) and
    // items
    const buttonW = (L.dockWidth - L.padding * 2 - 8) / 3;
    // each one says when it shows (EditorButton's shows), since they share spots: New and Give are both
    // second, and the Exports are all third
    const inspectorButton = (i, label, shows, onClick) => add(new EditorButton({
      x: dockX + L.padding + i * (buttonW + 4), y: GAME_H - L.statusHeight - 28, w: buttonW, h: 22, label, shows, onClick,
    }));
    const kind = () => this.selected.kind;
    // Edit, with a tile, item, sound or particle effect picked
    inspectorButton(0, 'Edit', () => kind() === 'tile' || kind() === 'particle' || isSoundKind(kind()) || isItemKind(kind()), () => {
      if (this.selected.kind === 'tile') TileEditor.open(TILE_TYPES[this.selected.name]);
      else if (isSoundKind(this.selected.kind)) SoundEditor.open(this.selected.name);
      else if (this.selected.kind === 'particle') ParticleEditor.open(this.selected.name);
      else this.editItem(this.selected.name);
    });
    // New and Export for tiles, sounds (a new sound on Sounds, a new voice on Voices) and particles, on
    // their own tabs
    const onTab = (test) => () => test(this.tab);
    inspectorButton(1, 'New', onTab((tab) => tab === 'tile'), () => TileEditor.open(null));
    inspectorButton(2, 'Export', onTab((tab) => tab === 'tile'), () => TileEditor.exportTiles());
    inspectorButton(1, 'New', onTab(isSoundKind), () => SoundEditor.open(null, this.tab));
    inspectorButton(2, 'Export', onTab(isSoundKind), () => SoundEditor.exportSounds());
    inspectorButton(1, 'New', onTab((tab) => tab === 'particle'), () => ParticleEditor.open(null));
    inspectorButton(2, 'Export', onTab((tab) => tab === 'particle'), () => ParticleEditor.exportEffects());
    // Give, with an item picked and an item tab open (it's where New is on the other tabs)
    inspectorButton(1, 'Give', () => isItemKind(kind()) && isItemKind(this.tab), () => this.giveItem(this.selected.name));
    // the file of every item that's new or changed, weapon and all (datafiles.js), and of every enemy
    // whose own weapon was changed on the Weapons tab (weaponeditor.js)
    inspectorButton(2, 'Export', onTab(isItemKind), () => DataFiles.export(['item', 'enemy']));

    UI.showGroup('editor', false);
  },

  // picks the first tile if whatever's picked doesn't exist any more (or nothing's been picked yet).
  // runs after the tiles load (sketch.js)
  checkSelected() {
    if (this.selected && !EDITOR_CATALOGUES[this.selected.kind][this.selected.name]) {
      // not pick(), so it doesn't go in the recent row every time the page loads
      this.selected = { kind: 'tile', name: Object.keys(TILE_TYPES)[0] };
    }
  },

  // thing is { kind, name } for Paint to use. it goes first in the recent row
  pick(thing) {
    this.selected = thing;
    const pinned = this.recent.find((other) => other.kind === thing.kind && other.name === thing.name)?.pinned ?? false;
    this.recent = this.recent.filter((other) => other.kind !== thing.kind || other.name !== thing.name);
    this.recent.splice(pinned ? 0 : this.recent.filter((other) => other.pinned).length, 0, { ...thing, pinned });
    // the pinned ones, then the newest unpinned, as many as fit
    this.recent = this.recent.slice(0, Math.max(RECENT_STRIP.most, this.recent.filter((other) => other.pinned).length));
    this.saveRecent();
  },

  // pins or unpins something in the recent row (Shift + click in the palette or the row)
  togglePin(thing) {
    const found = this.recent.find((other) => other.kind === thing.kind && other.name === thing.name);
    if (!found) this.recent.unshift({ ...thing, pinned: true });
    else found.pinned = !found.pinned;
    // pinned ones first, keeping their order
    this.recent = [...this.recent.filter((other) => other.pinned), ...this.recent.filter((other) => !other.pinned)];
    this.saveRecent();
  },

  loadRecent() {
    try {
      const saved = JSON.parse(localStorage.getItem(EDITOR_RECENT_KEY));
      if (Array.isArray(saved)) this.recent = saved.filter((thing) => thing && typeof thing.kind === 'string' && typeof thing.name === 'string');
    } catch (e) {}
  },

  saveRecent() {
    try { localStorage.setItem(EDITOR_RECENT_KEY, JSON.stringify(this.recent)); } catch (e) {}
  },

  // something in a catalogue was renamed (to null if it was deleted), so what's picked and the recent
  // row follow it (renameTile() and deleteTile() in tileeditor.js)
  renamed(kind, from, to) {
    for (const thing of [this.selected, ...this.recent]) {
      if (thing.kind === kind && thing.name === from) thing.name = to;
    }
    this.recent = this.recent.filter((thing) => thing.name !== null);
    this.saveRecent();
    if (this.selected.name === null) this.checkSelected();
  },

  // how many tiles across the brush is (edittools.js)
  setBrush(size) {
    this.brush = constrain(size, 1, EDIT_TOOLS.maxBrush);
  },

  // Tab hides the editor's ui to see the map on its own, and brings it back
  toggleUI() {
    this.uiHidden = !this.uiHidden;
    if (this.uiHidden) showMessage(`Editor hidden. ${keyName(KEYS.editorHideUI[0])} brings it back`);
  },

  undo() {
    if (!EditHistory.undo(worldMap)) showMessage('Nothing to undo');
  },

  redo() {
    if (!EditHistory.redo(worldMap)) showMessage('Nothing to redo');
  },

  // moves the camera to a tile and flashes it (Check for problems, mapcheck.js)
  goTo(col, row) {
    this.view.x = (col + 0.5) * TILE;
    this.view.y = (row + 0.5) * TILE;
    this.flash = { col, row, until: millis() + 1600 };
  },

  // the same on any map, going to it first if it's another (the warp graph and world map, Find uses,
  // Check every map). with no tile it's wherever loadMap() arrives, the map's spawn
  goToMap(name, col = null, row = null) {
    if (name !== worldMap.name) loadMap(name); // sketch.js
    if (col !== null) this.goTo(col, row);
  },

  // Play here (Space, Help > Play here, or the button next to Play): with the mouse on the map it
  // plays from there straight away, otherwise (it's on a menu or button) the next click on the map
  // picks where
  startPlayHere() {
    // decided by where the mouse is now (UI.hovered is this frame's), not last frame's over, which can
    // still be the map in the frame a button or menu is clicked
    if (this.over && !UI.hovered) return this.playHere();
    this.choosingStart = true;
    showMessage('Click where to start playing (right click or Esc to stop)');
  },

  // closes the editor and puts the player on the tile under the mouse (or `over`), if they can stand
  // there
  playHere(over = this.over) {
    this.choosingStart = false;
    if (!over || worldMap.isSolid(over.col, over.row)) return showMessage('Put the mouse on a tile the player can stand on');
    this.close(player, gameCamera); // sketch.js
    const feet = standingOnTile(PLAYER, over.col, over.row); // character.js
    player.placeAt(feet.x, feet.y);
    // so a warp or sound block under them doesn't go off straight away (warps.js)
    Warps.arrived(player, worldMap);
    gameCamera.snap();
  },

  // Save: downloads the map's file under its name, or asks for one if it's never been saved
  save() {
    if (worldMap.name === NEW_MAP_NAME || !DataFiles.listed.map?.has(worldMap.name)) return this.askToExport();
    this.exportAs(worldMap.name);
  },

  // exports the map as `name` (exportMap() in mapfile.js), which counts as saving it. a new name
  // throws away the copy kept under the old one (edithistory.js)
  exportAs(name) {
    const before = worldMap.name;
    exportMap(worldMap, name);
    EditHistory.markSaved(worldMap);
    if (worldMap.name !== before) EditHistory.discard(before);
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
    // every way in comes through here, so this is the one check (ROLES in config.js)
    if (!player.can('build')) return;
    this.active = true;
    // the editor has its own bars, so the dev menu would only be in the way (View > Dev menu opens it)
    Debug.menu.visible = false;
    // nothing from the game keeps playing while you edit, except what you press Play on (sound.js)
    Sound.stopAll();
    // the dialogue text box would be in the way (dialogue.js)
    if (Dialogue.active) Dialogue.close();
    // everyone goes back to their spawns, even defeated ones, so it shows the whole design and resets
    // the enemies (sketch.js). placed items picked up come back for the same reason (inventory.js)
    spawnCharacters();
    Drops.restock(worldMap);
    // start from where the camera was when it last closed on this map, otherwise where it is now, and
    // follow the view instead of the player. follow() also stops any dialogue glide
    const last = this.lastView?.map === worldMap ? this.lastView : null;
    this.view = { x: last?.x ?? camera.x, y: last?.y ?? camera.y };
    camera.follow(this.view);
    // shown straight away instead of fading in, even if Tab hid it last time
    this.uiAlpha = 1;
    this.uiHidden = false;
    this.stillFor = EDITOR_UI_FADE.showDelay;
    UI.showGroup('editor', true);
    // the status bar goes where the hotbar is (inventory.js)
    if (InventoryScreen.active) InventoryScreen.show(false);
    Hotbar.show(false);
    this.showTab(this.tab);
    // whatever happened while playing (items picked up) isn't a change to undo (edithistory.js)
    EditHistory.rebase(worldMap);
    // the first time, say if there are unsaved changes from before
    if (!this.openedBefore) {
      this.openedBefore = true;
      const copies = EditHistory.copies();
      if (copies.length > 0) showMessage(`Unsaved changes from last time on ${copies.map((copy) => copy.name).join(', ')}. File > Recover unsaved changes`);
    }
  },

  close(player, camera) {
    this.active = false;
    // nothing half done carries over to next time
    this.choosingStart = false;
    EditTools.drag = null;
    EditTools.lastPaint = null;
    EditTools.pasting = false;
    EditTools.picking = false;
    this.menuBar.close();
    this.search.blur();
    this.lastView = { map: worldMap, x: this.view.x, y: this.view.y };
    // so nothing changed is missed by undo or the kept copy
    EditHistory.check(worldMap);
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
  },

  // picks something (from the map, the recent row, the art report...), opens its tab, scrolls it into
  // view, and turns Paint back on if the tool that's on can't use it (edittools.js)
  choose(thing) {
    this.pick({ kind: thing.kind, name: thing.name });
    this.showTab(thing.kind);
    this.palette.reveal(thing.name);
    const tileOnly = this.tool === 'fill' || this.tool === 'rect';
    if (['pick', 'erase', 'select'].includes(this.tool) || (tileOnly && thing.kind !== 'tile')) EditTools.setTool('paint');
  },

  isSelected(kind, name) {
    return this.selected.kind === kind && this.selected.name === name;
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

  // Save as: asks for a name, then exports the current map, downloading its file (exportMap() and
  // cleanMapName() are in mapfile.js, worldMap is in sketch.js)
  askToExport() {
    FormBox.open({
      title: 'Save map as',
      hint: 'Letters, numbers, - and _',
      confirmLabel: 'Save',
      rows: [{ label: 'Name', field: new TextField({ w: 180, value: worldMap.name }) }],
      // it needs a file name (just spaces counts as no name)
      canConfirm: ([name]) => cleanMapName(name) !== '',
      onConfirm: ([name]) => this.exportAs(name),
    });
  },

  // ---------- every frame, while open ----------

  // aim is the mouse's world position or null
  update(map, camera, aim, dt) {
    // while a form box is open it's the only thing that runs. it's ui so it fades too, so put the
    // alpha back straight away, otherwise a box opened while faded (like placing a warp just after
    // moving) would be invisible. the warp graph sits on top of a warp's box and takes over until it
    // closes (warpgraph.js)
    // the sound editor covers everything and takes over until it closes (soundeditor.js), and so does
    // the world map (the warp graph without a box under it)
    const boxOpen = SoundEditor.active || FormBox.active || WarpGraph.active;
    if (boxOpen) {
      this.uiAlpha = 1;
      this.stillFor = EDITOR_UI_FADE.showDelay;
      this.boxWasOpen = true;
      // the box has the typing now
      this.search.blur();
      this.menuBar.close();
      EditTools.drag = null;
      if (SoundEditor.active) SoundEditor.update();
      else if (WarpGraph.active) WarpGraph.update();
      else FormBox.update();
      return;
    }

    // the search box has the typing while it's clicked on, otherwise the editor's keys work
    // (editormenu.js)
    if (this.search.focused) this.search.type();
    else EditorKeys.update();
    // a key that closed the editor (Play here) or opened a box (New map) has taken over, so the rest of
    // this frame is skipped, otherwise it'd carry on with an editor that isn't there
    if (!this.active || FormBox.active || SoundEditor.active) return;

    const dir = Input.direction();

    // moving fades the ui out, and stopping for a moment fades it back in. hidden ui can't be clicked,
    // so clicks go through to the map. Tab hides it until it's pressed again
    this.stillFor = dir.x === 0 && dir.y === 0 ? this.stillFor + dt : 0;
    const showUI = !this.uiHidden && this.stillFor >= EDITOR_UI_FADE.showDelay;
    this.uiAlpha = approach(this.uiAlpha, showUI ? 1 : 0, EDITOR_UI_FADE.speed, dt);
    for (const el of UI.group('editor')) el.interactive = showUI;

    // dividing by the zoom keeps the speed on screen the same
    const speed = EDITOR_PAN_SPEED / camera.zoom;
    const bounds = map.bounds();
    this.view.x = constrain(this.view.x + dir.x * speed * dt, bounds.left, bounds.right);
    this.view.y = constrain(this.view.y + dir.y * speed * dt, bounds.top, bounds.bottom);

    // the tile under the mouse, null if the mouse is off the game
    const over = aim && Input.mouse.inside ? { col: map.colAt(aim.x), row: map.rowAt(aim.y) } : null;
    // the status bar shows it unless the mouse is over the ui
    this.over = UI.hovered ? null : over;

    // Play here: the next click on the map starts playing there
    if (this.choosingStart) {
      if (over && Input.mousePressed('left')) return this.playHere(over);
      if (Input.mousePressed('right')) this.choosingStart = false;
    } else {
      // the left button does what the tool does (edittools.js). mousePressed() ignores clicks on the ui
      // (input.js)
      EditTools.update(map, over, aim);
    }
    // an area being dragged out (atmosphere.js) follows the mouse, and opens its settings when let go
    AtmosphereAreas.update(map, over);

    // right click: the settings for what's there (a warp, then a sound block, then an enemy, then an
    // npc, then a chest, then an atmosphere area). any new settings boxes can hook in here. not while
    // pasting, where it stops pasting (edittools.js)
    if (over && Input.mousePressed('right') && !EditTools.pasting && !this.choosingStart) {
      const warp = map.warpAt(over.col, over.row);
      const sound = map.soundAt(over.col, over.row);
      const enemy = map.spawnsAt('enemy', over.col, over.row)[0];
      const npc = map.spawnsAt('npc', over.col, over.row)[0];
      const chest = map.objectsAt(over.col, over.row).findLast((obj) => obj.inventory);
      if (warp) this.editWarp(map, warp);
      else if (sound) SoundBlocks.edit(sound);
      else if (enemy) this.editEnemy(enemy);
      else if (npc) this.editNpc(npc);
      else if (chest) StorageEditor.open(chest); // storageeditor.js
      else if (AtmosphereAreas.at(map, over.col, over.row)) AtmosphereAreas.edit(map, AtmosphereAreas.at(map, over.col, over.row));
    }

    // undo notices changes once nothing's held: straight after a click, key or box, otherwise now and
    // then (edithistory.js)
    if (!FormBox.active && !SoundEditor.active && Input.buttonsHeld.size === 0 && !AtmosphereAreas.drawing) {
      const nudged = this.boxWasOpen || Input.buttonsReleased.size > 0 || Input.keysPressed.size > 0 || Input.typed.length > 0;
      this.boxWasOpen = false;
      EditHistory.update(map, dt, nudged);
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

  // puts an item on the ground in the middle of the tile, ready to pick up, and saved with the map
  // (map.items, Drops.restock() in inventory.js). not on solid or empty tiles (you couldn't reach it)
  placeItem(map, name, col, row) {
    if (map.isSolid(col, row)) return;
    if (map.items.some((entry) => entry.type === name && entry.col === col && entry.row === row)) return;
    map.items.push({ type: name, col, row });
    Drops.restock(map);
  },

  // puts one in the player's inventory (player is in sketch.js)
  giveItem(name) {
    if (!player.inventory.add(createItem(name))) showMessage('No room, your inventory is full');
  },

  // changes an item's name, rarity, colour and where it's worn (items.js), plus everything about its
  // weapon on the tabs after (weaponeditor.js). the changes happen when you press Save. Export on the
  // item tabs saves them, otherwise they're gone when you reload
  editItem(name) {
    const type = ITEM_TYPES[name];
    const weapon = type.weapon;
    const labelField = new TextField({ w: 180, value: type.label });
    const colourField = new ColourField({ w: 180, value: type.colour });
    const rarityPicker = new Picker({
      w: 180,
      choices: Object.keys(RARITIES),
      value: type.rarity,
      label: (rarity) => RARITIES[rarity].label,
      art: (rarity, x, y, size) => {
        noStroke();
        fill(RARITIES[rarity].colour);
        circle(x + size / 2, y + size / 2, size * 0.8);
      },
    });
    const wearPicker = new Picker({
      w: 180,
      choices: [null, ...Object.keys(WEAR_PLACES)],
      value: type.wear,
      label: (place) => (place ? WEAR_PLACES[place] : "can't be worn"),
      art: (place, x, y, size) => drawWearIcon(place, x + size / 2, y + size / 2, size), // inventory.js
    });
    const itemRows = [
      { label: 'Name', field: labelField, tip: 'What the player sees. Its file name stays the same' },
      { label: 'Rarity', field: rarityPicker, tip: 'Sets its glow, and the colour of its name over the hotbar' },
      { label: 'Colour', field: colourField, tip: 'Its placeholder colour until it has a picture' },
      { label: 'Worn on', field: wearPicker, tip: 'Which equipment slot it goes in. Nothing it does yet, it just shows' },
    ];
    // the Weapon, Hit, Feel and Sound tabs and the preview of the player using it on the first enemy kind
    // (weaponeditor.js)
    const form = weapon && weaponForm(weapon, { attacker: PLAYER, target: Object.values(ENEMY_TYPES)[0] ?? PLAYER });

    FormBox.open({
      title: `Item: ${name}`,
      hint: 'Right click a slider to undo it. Export in the inspector to keep changes',
      confirmLabel: 'Save',
      ...(form ? { tabs: [{ label: 'Item', rows: itemRows }, ...form.tabs], side: form.side, onUpdate: form.update } : { rows: itemRows }),
      canConfirm: () => labelField.value.trim() !== '' && HEX_COLOUR.test(colourField.value) && (!form || form.ok()),
      onConfirm: () => {
        const colour = colourField.value;
        // fill is the p5 colour it gets drawn with (prepareArt() in utils.js)
        Object.assign(type, { label: labelField.value.trim(), rarity: rarityPicker.value, colour, fill: color(colour), wear: wearPicker.value });
        form?.save();
      },
    });
  },

  // with its top left on col, row. items is what starts in a chest (pasting one)
  placeObject(map, name, col, row, items) {
    if (!map.inside(col, row)) return;
    // no copies in the same spot (easy to do by double clicking)
    if (map.objects.some((obj) => obj.type === name && obj.col === col && obj.row === row)) return;
    map.addObject(name, col, row, items);
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
      warp = { name: `warp${number}`, col, row, to: '', toWarp: '', activate: 'step', enemies: true };
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
      hint: 'Click a choice for the full list, or its arrows to step',
      confirmLabel: 'Save',
      rows: [
        { label: 'Name', field: new TextField({ w: 180, value: warp.name }), tip: 'Other warps link to it by this, so renaming breaks links to it' },
        { label: 'Goes to', field: mapPicker, tip: 'The map it takes you to. This map makes it a teleport' },
        { label: 'Arrive at', field: arrivePicker, tip: 'A warp on that map, or its spawn point. Link that one back for a two way door' },
        {
          label: 'Opens by',
          field: new Picker({
            w: 180,
            choices: ['step', 'interact'],
            value: warp.activate,
            label: (how) => (how === 'step' ? 'stepping on it' : 'pressing E'),
          }),
          tip: 'E works from the next tile too, so a door can go under a solid object',
        },
        { label: 'Enemies', field: new Checkbox({ w: 180, value: warp.enemies, label: 'follow you through' }), tip: 'Enemies chasing you come through after you' },
        // last, so its value (undefined) doesn't shift the ones onConfirm gets
        {
          label: 'Links',
          field: new Button({ w: 180, label: 'Show links', style: 'editor', onClick: () => WarpGraph.open(map.name, warp.name) }),
          tip: 'A map of every warp linked to this one',
        },
      ],
      // a name no other warp on this map has, so warps can link to it
      canConfirm: ([name]) => name.trim() !== '' && !map.warps.some((other) => other !== warp && other.name === name.trim()),
      onConfirm: ([name, to, toWarp, activate, enemies]) => {
        Object.assign(warp, { name: name.trim(), to, toWarp: to ? toWarp : '', activate, enemies });
      },
    });
  },

  // an enemy spawn's settings, in four tabs with a picture of it down the side that turns to the mouse
  // and holds and wears what's picked (CharacterPreview in inventory.js):
  //   Gear       what it holds (holdPicker(), saved as its holds), and what it wears in each
  //              EQUIPMENT_SLOTS slot (inventory.js), saved as its wears. only items worn there are
  //              listed. armour is only for show until it does something
  //   Stats      sliders for its health, speed, damage, attack rate, and knockback and stagger taken
  //   Behaviour  its ai (ENEMY_AIS in enemies.js, '' means its kind's own), whether it follows you
  //              through warps ('' is its kind's followsThroughWarps, canFollow() in warps.js), and
  //              sliders for its senses and attack range
  //              the sliders are its ENEMY_SPAWN_STATS (enemies.js), saved as its stats when they
  //              differ from its kind's, which the bar marks. right click or Reset goes back to them
  //   Effects    the sound it carries around, and the particles it bursts when hit and when it dies
  //              (particles.js). the Edit buttons save this box and open the particle editor on the
  //              one picked
  // Export saves them all in the map
  editEnemy(spawn) {
    const type = ENEMY_TYPES[spawn.type];
    const own = type.ai ?? 'still';
    const follows = (yes) => (yes ? 'follows you' : 'stays behind');
    const holdPicker = this.holdPicker(type, spawn.holds);
    // the item the picker means (null for its own weapon or empty hands), and the weapon it fights with
    const held = () => ITEM_TYPES[holdPicker.value] ?? null;
    const weapon = () => (holdPicker.value === '' ? type.weapon : held()?.weapon ?? null);
    const wearPickers = EQUIPMENT_SLOTS.map((slot) => ({ slot, picker: this.wearPicker(slot, spawn.wears?.[slot.key] ?? null) }));
    const aiPicker = new Picker({
      w: 180,
      choices: ['', ...Object.keys(ENEMY_AIS)],
      value: spawn.ai ?? '',
      label: (name) => name || `its own (${own})`,
    });
    const followsPicker = new Picker({
      w: 180,
      choices: ['', true, false],
      value: spawn.follows ?? '',
      label: (yes) => (yes === '' ? `its own (${follows(type.followsThroughWarps)})` : follows(yes)),
    });
    const soundPicker = this.characterSoundPicker(spawn, type);
    const hitPicker = this.particlePicker(spawn.hitParticles, type.hitParticles);
    const deathPicker = this.particlePicker(spawn.deathParticles, type.deathParticles);
    // saves this box, then edits the effect the picker means (its kind's for ''). none, or a missing
    // one, makes a new one. saving it under another name gives it to this enemy
    const editParticles = (picker, key) => {
      const effect = picker.value === '' ? type[key] : picker.value;
      FormBox.confirm();
      ParticleEditor.open(PARTICLE_EFFECTS[effect] ? effect : null, {
        img: type.img,
        onSave: (saved) => {
          if (saved === effect) return;
          spawn[key] = saved;
          spawnCharacters(); // sketch.js
        },
      });
    };
    const editButton = (label, picker, key) => ({ label: '', field: new Button({ w: 180, label, style: 'editor', onClick: () => editParticles(picker, key) }) });
    const anyArmour = Object.values(ITEM_TYPES).some((item) => item.wear);
    // its own ENEMY_SPAWN_STATS (enemies.js), each starting on the spawn's or its kind's, with its
    // kind's marked on the bar once it's moved (right click goes back to it)
    const statSliders = Object.fromEntries(ENEMY_SPAWN_STATS.map((line) => [line.key, rowSlider(line, spawn.stats?.[line.key] ?? type[line.key], type[line.key])])); // formbox.js
    const statRows = (tab) => [
      ...ENEMY_SPAWN_STATS.filter((line) => line.tab === tab).map((line) => ({
        label: line.label, field: statSliders[line.key], tip: `${line.tip}. A ${spawn.type}'s is ${type[line.key]}`,
      })),
      {
        label: '',
        field: new Button({
          w: 180, label: `Reset to a ${spawn.type}'s`, style: 'editor',
          onClick: () => ENEMY_SPAWN_STATS.filter((line) => line.tab === tab).forEach(({ key }) => { statSliders[key].value = type[key]; }),
        }),
        tip: `Puts every slider on this tab back to what a ${spawn.type} has in its file`,
      },
    ];

    FormBox.open({
      title: `Enemy: ${spawn.type}`,
      hint: anyArmour ? 'Right click a slider to go back to its kind\'s' : 'No armour yet: give an item a wear (items.js)',
      confirmLabel: 'Save',
      tabs: [
        {
          label: 'Gear',
          rows: [
            { label: 'Weapon', field: holdPicker, tip: 'What it fights with. With a bow it stands back and shoots when it can see you' },
            ...wearPickers.map(({ slot, picker }) => ({
              label: slot.label, field: picker, tip: `What it wears there. Only things worn on the ${WEAR_PLACES[slot.wear].toLowerCase()} are listed`,
            })),
          ],
        },
        { label: 'Stats', rows: statRows('Stats') },
        {
          label: 'Behaviour',
          rows: [
            { label: 'AI', field: aiPicker, tip: 'smart, careful and reckless go round walls (and harm), direct goes straight at you' },
            { label: 'Warps', field: followsPicker, tip: 'Whether it follows you through warps that let enemies through' },
            ...statRows('Behaviour'),
          ],
        },
        {
          label: 'Effects',
          rows: [
            { label: 'Sound', field: soundPicker, tip: 'A sound it loops wherever it goes, like buzzing' },
            { label: 'Hit', field: hitPicker, tip: 'The particles that burst out when something hits it' },
            editButton('Edit hit particles', hitPicker, 'hitParticles'),
            { label: 'Death', field: deathPicker, tip: 'The particles that burst out when it dies for good' },
            editButton('Edit death particles', deathPicker, 'deathParticles'),
          ],
        },
      ],
      side: (x, y, w, h) => [new CharacterPreview({
        x, y, w, h,
        look: () => ({
          settings: type,
          worn: wearPickers.map(({ picker }) => ITEM_TYPES[picker.value]).filter(Boolean),
          held: held(),
          // its weapon's damage after its Damage multiplier (wieldedHit() in weapons.js)
          caption: [
            `${statSliders.maxHealth.value} health, ${statSliders.speed.value} speed`,
            weaponSummary(weapon() && wieldedHit(weapon(), { damageScale: statSliders.damageScale.value })),
          ],
        }),
      })],
      // the fields are read straight from their variables, since the buttons' values (undefined) are
      // mixed in with theirs
      onConfirm: () => {
        if (holdPicker.value === '') delete spawn.holds;
        else spawn.holds = holdPicker.value;
        const wears = {};
        for (const { slot, picker } of wearPickers) if (picker.value !== null) wears[slot.key] = picker.value;
        if (Object.keys(wears).length > 0) spawn.wears = wears;
        else delete spawn.wears;
        if (aiPicker.value) spawn.ai = aiPicker.value;
        else delete spawn.ai;
        if (followsPicker.value === '') delete spawn.follows;
        else spawn.follows = followsPicker.value;
        if (hitPicker.value === '') delete spawn.hitParticles;
        else spawn.hitParticles = hitPicker.value;
        if (deathPicker.value === '') delete spawn.deathParticles;
        else spawn.deathParticles = deathPicker.value;
        // only the stats that aren't its kind's
        const stats = {};
        for (const { key } of ENEMY_SPAWN_STATS) if (statSliders[key].value !== type[key]) stats[key] = statSliders[key].value;
        if (Object.keys(stats).length > 0) spawn.stats = stats;
        else delete spawn.stats;
        // makes the characters again, so the one on the map picks all of these up
        this.setCharacterSound(spawn, soundPicker.value);
      },
    });
  },

  // a picker for what an enemy spawn holds: '' for its kind's own weapon (like the grunt's claws, which
  // isn't an item), null for empty hands, or the name of an item with a weapon (the Weapons tab's, or
  // any other item given one). value is the spawn's holds (undefined is its own). a missing one stays
  // in the list so opening the box doesn't quietly take it away
  holdPicker(type, value) {
    const weapons = Object.keys(ITEM_TYPES).filter((name) => ITEM_TYPES[name].weapon);
    const missing = typeof value === 'string' && !weapons.includes(value) ? [value] : [];
    return new Picker({
      w: 180,
      choices: ['', null, ...weapons, ...missing],
      value: value === undefined ? '' : value,
      label: (name) => {
        if (name === '') return type.weapon ? 'its own weapon' : 'its own (none)';
        if (name === null) return 'empty hands';
        return ITEM_TYPES[name]?.label ?? `${name} (missing)`;
      },
      art: (name, x, y, size) => {
        if (ITEM_TYPES[name]) drawItemIcon({ type: ITEM_TYPES[name] }, x, y, size); // inventory.js
      },
    });
  },

  // a picker for what's worn in an equipment slot (EQUIPMENT_SLOTS in inventory.js): null for nothing,
  // or the name of an item worn there (its wear, items.js). a missing one stays in the list so opening
  // the box doesn't quietly take it off
  wearPicker(slot, value) {
    const fitting = Object.keys(ITEM_TYPES).filter((name) => ITEM_TYPES[name].wear === slot.wear);
    return new Picker({
      w: 180,
      choices: [null, ...fitting, ...(value !== null && !fitting.includes(value) ? [value] : [])],
      value,
      label: (name) => (name === null ? 'nothing' : ITEM_TYPES[name]?.label ?? `${name} (missing)`),
      art: (name, x, y, size) => {
        if (ITEM_TYPES[name]) drawItemIcon({ type: ITEM_TYPES[name] }, x, y, size); // inventory.js
      },
    });
  },

  // a picker for an enemy spawn's particle effect (PARTICLE_EFFECTS in particles.js): value is the
  // spawn's pick, '' (or undefined) its kind's own, which is `own`, and null none. a missing one stays in
  // the list so opening the box doesn't quietly change it
  particlePicker(value, own) {
    const say = (name) => (name === null ? 'none' : PARTICLE_EFFECTS[name] ? name : `${name} (missing)`);
    return new Picker({
      w: 180,
      choices: ['', ...Object.keys(PARTICLE_EFFECTS), null, ...(value && !PARTICLE_EFFECTS[value] ? [value] : [])],
      value: value === undefined ? '' : value,
      label: (name) => (name === '' ? `its own (${say(own)})` : say(name)),
      art: (name, x, y, size) => drawParticleChoice(name === '' ? own : name, x, y, size), // particleeditor.js
    });
  },

  // a picker for the sound a character loops wherever it goes (soundblocks.js), from SOUNDS. '' is
  // its kind's own from enemies.js or npcs.js. a missing sound stays in the list so opening the box
  // doesn't quietly change it
  characterSoundPicker(spawn, type) {
    return new Picker({
      w: 180,
      choices: ['', ...Object.keys(SOUNDS), ...(spawn.sound && !SOUNDS[spawn.sound] ? [spawn.sound] : [])],
      value: spawn.sound ?? '',
      label: (name) => (!name ? `its own (${type.sound ?? 'none'})` : SOUNDS[name] ? name : `${name} (missing)`),
    });
  },

  // gives a character spawn its own sound ('' goes back to its kind's), and makes the characters
  // again so the one on the map picks it up
  setCharacterSound(spawn, sound) {
    if (sound) spawn.sound = sound;
    else delete spawn.sound;
    spawnCharacters();
  },

  // picks an npc spawn's voice (VOICES in sound.js, '' means its kind's own from npcs.js), and the
  // sound it carries around (like an enemy's), and on its other tabs its look (looks.js). Say plays
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
    // its look's parts and colours (looks.js), starting from its own or its kind's. it only gets its
    // own look if something's changed, so its kind's stays in charge otherwise
    const look = lookFields(spawn.look ?? type.look ?? {});
    const before = JSON.stringify(look.read());
    FormBox.open({
      title: `NPC: ${type.label}`,
      hint: 'Voices are made in the Voices tab',
      confirmLabel: 'Save',
      // a picture of them, like the enemy box's (CharacterPreview in inventory.js), with the look as
      // it's picked
      side: (x, y, w, h) => [new CharacterPreview({ x, y, w, h, look: () => ({ settings: withLook(type, look.read()), caption: [`"${type.dialogue[0]}"`] }) })],
      minRows: 6,
      tabs: [{ label: 'NPC', rows: [
        { label: 'Voice', field: picker, tip: 'What they talk with. Say plays their first line with it' },
        { label: 'Sound', field: this.characterSoundPicker(spawn, type), tip: 'A sound they loop wherever they go, like a jingling cart' },
        // buttons last, so their (undefined) values don't shift the ones onConfirm gets
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
      ] }, ...look.tabs],
      onConfirm: ([voice, sound]) => {
        if (voice) spawn.voice = voice;
        else delete spawn.voice;
        const after = look.read();
        if (JSON.stringify(after) !== before) spawn.look = after;
        this.setCharacterSound(spawn, sound);
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
    showMessage(`${type.label} talks with ${name} now. Save the map (Ctrl + S) to keep it`);
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

    // atmosphere areas under everything (atmosphere.js), sound blocks (soundblocks.js), warps on top of
    // them (warps.js), and the spawn ring where the player's feet go
    AtmosphereAreas.drawAll(map, px);
    for (const block of map.sounds) drawSoundMarker(block, px);
    for (const warp of map.warps) drawWarpMarker(warp, px);
    drawSpawnRing(map.spawn.x, map.spawn.y + feetBelowCentre(PLAYER), px);

    // a tile Check for problems went to (mapcheck.js), flashing
    if (this.flash && millis() < this.flash.until) {
      noFill();
      const on = Math.floor(millis() / 200) % 2 === 0;
      this.outline(this.flash.col * TILE - 4 * px, this.flash.row * TILE - 4 * px, TILE + 8 * px, TILE + 8 * px, on ? EDITOR_COLOURS.picked : '#ffffff', px);
    }
    // the selection, boxes being dragged, what's being pasted and the brush (edittools.js)
    const over = aim && Input.mouse.inside ? { col: map.colAt(aim.x), row: map.rowAt(aim.y) } : null;
    EditTools.draw(map, px, over);

    if (!aim || !Input.mouse.inside || UI.hovered || EditTools.pasting || EditTools.drag) return;
    const col = map.colAt(aim.x);
    const row = map.rowAt(aim.y);
    if (!map.inside(col, row)) return;
    // Play here: where the player would start
    if (this.choosingStart) {
      noFill();
      this.outline(col * TILE, row * TILE, TILE, TILE, map.isSolid(col, row) ? EDITOR_COLOURS.erase : EDITOR_COLOURS.accent, px);
      return;
    }
    const tool = this.tool;
    // the brush is already outlined, and the box tools show their box once dragged
    if (tool === 'select' || tool === 'rect') {
      noFill();
      this.outline(col * TILE, row * TILE, TILE, TILE, '#ffffff', px);
      return;
    }

    // a sound block under the mouse shows how far away it can be heard
    const sound = map.soundAt(col, row);
    if (sound) drawSoundRange(sound, px);
    // and an enemy shows where it'd notice you from
    const enemy = map.spawnsAt('enemy', col, row)[0];
    if (enemy) drawEnemySenses(map, enemy, px);

    // spawn: a preview of its ring, plus the tile outline further down
    if (tool === 'paint' && this.isSelected('trigger', 'spawn')) {
      const feet = standingOnTile(PLAYER, col, row);
      drawSpawnRing(feet.x, feet.y + feetBelowCentre(PLAYER), px);
    }

    // object: a see-through preview over its tiles
    if (tool === 'paint' && this.selected.kind === 'object') {
      const type = OBJECT_TYPES[this.selected.name];
      this.drawGhost(type, col * TILE, row * TILE, type.width * TILE, type.height * TILE, px);
      return;
    }

    // enemy or npc: a see-through preview standing on the tile
    if (tool === 'paint' && isCharacterKind(this.selected.kind)) {
      const type = EDITOR_CATALOGUES[this.selected.kind][this.selected.name];
      const body = this.characterBodyOnTile(type, col, row);
      this.drawGhost(type, body.x, body.y, body.w, body.h, px);
      return;
    }

    // erasing: outline whatever would get removed
    if (tool === 'erase') {
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

    // the tile under the mouse, unless the brush outline (edittools.js) already shows it
    if (tool === 'erase' || (tool === 'paint' && this.selected.kind === 'tile')) return;
    noFill();
    this.outline(col * TILE, row * TILE, TILE, TILE, '#ffffff', px);
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

// a small flat button for the menu bar (Play) and inspector. the optional isOn() lights it up like a toggle,
// and it's checked every frame (like Play here lighting up while it waits for a click). the optional
// shows() says whether it's there at all, also checked every frame, so it can never be left showing
// when it shouldn't (the inspector's buttons). its group being hidden hides it whatever shows() says
class EditorButton extends Button {
  constructor(options) {
    super({ style: 'editor', ...options });
    this.isOn = options.isOn ?? null;
    this.shows = options.shows ?? null;
  }

  // not there: can't be hovered or clicked, and isn't drawn
  gone() {
    return this.shows !== null && !this.shows();
  }

  contains(px, py) {
    return !this.gone() && super.contains(px, py);
  }

  update(hovered) {
    super.update(hovered && !this.gone());
  }

  draw() {
    if (this.gone()) return;
    if (this.isOn) {
      this.toggle = true;
      this.on = this.isOn();
    }
    super.draw();
  }
}

// the strip along the bottom: the tile under the mouse (left), what clicking does (middle), and the
// selection, brush and zoom (right)
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
    setText(11, BOLD, LEFT, CENTER);
    fill(C.text);
    text(where, this.x + 10, middleY);
    fill(C.dimText);
    const right = [];
    const box = EditTools.selection;
    if (box) right.push(`Selected ${box.right - box.left + 1} × ${box.bottom - box.top + 1}`);
    if (Editor.tool === 'paint' || Editor.tool === 'erase') right.push(`Brush ${Editor.brush}`);
    right.push(`Zoom ${Math.round(gameCamera.zoom * 100)}%`);
    const rightText = right.join('   ·   ');
    // cut short on a narrow screen so it doesn't run into the right hand side
    text(fitText(statusHint(), this.w - 190 - textWidth(rightText) - 30), this.x + 190, middleY);
    textAlign(RIGHT, CENTER);
    text(rightText, this.x + this.w - 10, middleY);
  }
}

// the rings round an enemy spawn under the mouse in the editor (drawEnemySenses()), each one of its
// ENEMY_SPAWN_STATS (enemies.js) in px, smallest first
const ENEMY_SENSE_RINGS = [
  { key: 'attackRange', label: 'attacks', colour: '#ff6b6b' },
  { key: 'hearing', label: 'hears you', colour: '#6bb5ff' },
  { key: 'alertRange', label: 'alerts allies', colour: '#ffb347' },
  { key: 'sightRange', label: 'sees you', colour: '#ffd23f' },
  { key: 'chaseRange', label: 'gives up past', colour: '#c9a0ff', dashed: true },
];

// how an enemy spawn notices you, round its feet where sensePlayer() (enemies.js) measures from: a ring
// for each ENEMY_SENSE_RINGS stat (its own, or its kind's), labelled at the top, and the floor it can
// see lit up, since walls block sight (clearLine(), tilemap.js) but not hearing. so you can see where a
// player would get spotted while placing it
function drawEnemySenses(map, spawn, px) {
  const type = ENEMY_TYPES[spawn.type];
  if (!type) return;
  const stat = (key) => spawn.stats?.[key] ?? type[key];
  const centre = standingOnTile(type, spawn.col, spawn.row); // character.js
  const feet = { x: centre.x, y: centre.y + feetBelowCentre(type) };

  // the floor in its sight range, lit where it can see (from its feet to each tile's middle) and
  // darkened where a wall hides it, which is where a player can sneak past
  const sight = stat('sightRange');
  const reach = Math.ceil(sight / TILE);
  noStroke();
  for (let row = spawn.row - reach; row <= spawn.row + reach; row++) {
    for (let col = spawn.col - reach; col <= spawn.col + reach; col++) {
      const x = (col + 0.5) * TILE;
      const y = (row + 0.5) * TILE;
      if (map.isSolid(col, row) || Math.hypot(x - feet.x, y - feet.y) > sight) continue;
      if (map.clearLine(feet.x, feet.y, x, y)) fill(255, 210, 63, 40);
      else fill(0, 0, 40, 110);
      rect(col * TILE, row * TILE, TILE, TILE);
    }
  }

  setText(11 * px, BOLD, CENTER, BOTTOM);
  // where labels went, so rings the same size (sight and chase range often are) don't write over each
  // other
  const labels = [];
  for (const ring of ENEMY_SENSE_RINGS) {
    const radius = stat(ring.key);
    if (!radius) continue;
    noFill();
    stroke(ring.colour);
    strokeWeight(1.5 * px);
    if (ring.dashed) drawingContext.setLineDash([6 * px, 5 * px]);
    circle(feet.x, feet.y, radius * 2);
    drawingContext.setLineDash([]);
    noStroke();
    fill(0, 0, 0, 170);
    const words = `${ring.label} ${Math.round(radius / TILE * 10) / 10} tiles`;
    let bottom = feet.y - radius - 2 * px;
    while (labels.some((other) => Math.abs(other - bottom) < 14 * px)) bottom += 14 * px;
    labels.push(bottom);
    rect(feet.x - textWidth(words) / 2 - 3 * px, bottom - 12 * px, textWidth(words) + 6 * px, 13 * px, 2 * px);
    fill(ring.colour);
    text(words, feet.x, bottom);
  }
}

// the minimap's size, in screen px. it keeps the map's shape inside maxWidth x maxHeight, with each
// tile at most maxTile across so small maps (the hut) stay small
const MINIMAP = { maxWidth: 180, maxHeight: 120, maxTile: 4, margin: 8, redrawEvery: 0.25 };

// the whole map, small, in the bottom left corner (View > Minimap, ticked in Debug.show): every tile in
// its colour, then the warps (purple), the spawn (yellow), enemies (red) and npcs (green), and a box round
// what's on screen. click or drag on it to move the view there. it sizes itself to the map each frame
class EditorMinimap extends UIElement {
  constructor(options) {
    super(options);
    // one pixel per tile, made again every redrawEvery seconds so painting shows up (redraw())
    this.canvas = document.createElement('canvas');
    this.drawnAt = -Infinity;
    this.dragging = false;
  }

  contains(px, py) {
    return Debug.show.minimap && super.contains(px, py);
  }

  update(hovered) {
    this.hovered = hovered;
    const map = worldMap; // sketch.js
    const M = MINIMAP;
    this.scale = Math.min(M.maxTile, M.maxWidth / map.cols, M.maxHeight / map.rows);
    this.w = Math.ceil(map.cols * this.scale);
    this.h = Math.ceil(map.rows * this.scale);
    this.x = EDITOR_LAYOUT.toolStripWidth + M.margin;
    this.y = GAME_H - EDITOR_LAYOUT.statusHeight - M.margin - this.h;

    // moves on the frame it's let go too, so a quick click (or the end of a fast drag) still lands
    if (hovered && Input.buttonsPressed.has('left')) this.dragging = true;
    if (this.dragging) {
      const bounds = map.bounds();
      Editor.view.x = constrain(this.toWorld(Input.mouse.x - this.x, map.left), bounds.left, bounds.right);
      Editor.view.y = constrain(this.toWorld(Input.mouse.y - this.y, map.top), bounds.top, bounds.bottom);
    }
    if (!Input.buttonsHeld.has('left')) this.dragging = false;
  }

  // screen px across the minimap to a world position, and back. first is the map's left or top
  toWorld(px, first) {
    return (px / this.scale + first) * TILE;
  }

  toScreen(world, first) {
    return (world / TILE - first) * this.scale;
  }

  // ponytail: draws every tile again every redrawEvery seconds instead of noticing changes. a 500 x 500
  // map is 250,000 tiles, a few ms; EditHistory's designKey() could say when if it ever shows
  redraw(map) {
    this.canvas.width = map.cols;
    this.canvas.height = map.rows;
    const pen = this.canvas.getContext('2d');
    const pixels = pen.createImageData(map.cols, map.rows);
    // each tile kind's colour as [r, g, b, a] once, from its colour setting (tiles.js). empty tiles stay
    // see-through
    const colours = {};
    map.tiles.forEach((name, i) => {
      if (name === null) return;
      const fill = TILE_TYPES[name]?.fill;
      colours[name] ??= fill ? [red(fill), green(fill), blue(fill), 255] : [255, 0, 255, 255];
      pixels.data.set(colours[name], i * 4);
    });
    pen.putImageData(pixels, 0, 0);
    this.drawnAt = millis();
    this.drawnMap = map;
  }

  draw() {
    if (!Debug.show.minimap) return;
    const map = worldMap;
    if (map !== this.drawnMap || millis() - this.drawnAt > MINIMAP.redrawEvery * 1000) this.redraw(map);
    const C = EDITOR_COLOURS;
    const { x, y, w, h } = this;
    noStroke();
    fill(C.well);
    rect(x - 3, y - 3, w + 6, h + 6, 3);
    // pixel sharp when it's bigger than the map, smooth when it's squashing a big map down
    drawingContext.imageSmoothingEnabled = this.scale < 1;
    drawingContext.drawImage(this.canvas, x, y, w, h);
    drawingContext.imageSmoothingEnabled = false;

    // a dot in the middle of a tile
    const dot = (col, row, colour, size = 3) => {
      fill(colour);
      rect(x + (col - map.left + 0.5) * this.scale - size / 2, y + (row - map.top + 0.5) * this.scale - size / 2, size, size);
    };
    for (const warp of map.warps) dot(warp.col, warp.row, WARP_COLOURS.edge);
    for (const spawn of map.enemySpawns) dot(spawn.col, spawn.row, C.erase);
    for (const spawn of map.npcSpawns) dot(spawn.col, spawn.row, '#7bd88f');
    dot(map.colAt(map.spawn.x), map.rowAt(map.spawn.y + feetBelowCentre(PLAYER)), C.picked, 4);

    // what's on screen, kept inside the minimap
    const view = gameCamera.view(); // sketch.js
    const left = constrain(this.toScreen(view.left, map.left), 0, w);
    const top = constrain(this.toScreen(view.top, map.top), 0, h);
    const right = constrain(this.toScreen(view.right, map.left), 0, w);
    const bottom = constrain(this.toScreen(view.bottom, map.top), 0, h);
    noFill();
    stroke(255);
    strokeWeight(1);
    rect(x + left + 0.5, y + top + 0.5, Math.max(1, right - left - 1), Math.max(1, bottom - top - 1));
    stroke(this.hovered || this.dragging ? C.accent : C.edge);
    rect(x - 2.5, y - 2.5, w + 5, h + 5, 3);
  }
}

// what the status bar says clicking does, from the tool and what's picked
function statusHint() {
  const s = Editor.selected;
  const tile = s.kind === 'tile';
  if (Editor.choosingStart) return 'Click where to start playing   ·   Right click: stop';
  if (EditTools.pasting) return 'Click: paste here   ·   Right click or Esc: stop pasting';
  const hints = {
    paint: `Click: ${s.kind === 'voice' ? `give an NPC ${s.name}` : s.name === 'area' ? 'drag out an area' : `${tile ? 'paint' : 'place'} ${s.name}`}${tile ? '   ·   Shift + drag: rectangle' : ''}`,
    erase: 'Drag: erase   ·   Shift + drag: rectangle',
    fill: tile ? `Click: fill with ${s.name}` : 'Fill needs a tile picked',
    rect: tile ? `Drag: a rectangle of ${s.name}` : 'Rectangle needs a tile picked',
    select: 'Drag: select   ·   Ctrl + C copy   ·   Ctrl + X cut   ·   Del clear',
    pick: 'Click: pick what\'s there',
  };
  return `${hints[Editor.tool]}   ·   Alt + click: pick   ·   Right click: settings`;
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
    // the Erase tool shows itself instead of what's picked
    const s = Editor.tool === 'erase' ? null : Editor.selected;
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
        kind === 'npc' ? ['Name', type.label] : ['Weapon', type.weapon ? `${type.weapon.damage} damage` : 'none'],
        kind === 'enemy' ? ['AI', type.ai ?? 'still'] : ['Voice', type.voice ?? 'silent'],
      ],
      note: `Right click one on the map to pick its ${kind === 'enemy' ? 'weapon, armour, AI, sound and particles' : 'voice and sound'}`,
    };
  }
  if (isItemKind(kind)) {
    // like "Weapon · Rare"
    const category = `${type.category[0].toUpperCase()}${type.category.slice(1)} · ${RARITIES[type.rarity].label}`;
    const weapon = type.weapon;
    const worn = type.wear ? [['Worn on', WEAR_PLACES[type.wear]]] : [];
    if (!weapon) return { title: name, kind: category, rows: worn, note: 'Click the map to place one. Give puts one in your inventory' };
    const shoots = isRanged(weapon); // weapons.js
    return {
      title: name,
      kind: category,
      rows: [['Damage', weapon.damage], [shoots ? 'Range' : 'Reach', `${weapon.reach} px`], ['Cooldown', `${weapon.cooldown} s`], ...worn],
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
  if (kind === 'particle') {
    return {
      title: name,
      kind: 'Particles',
      rows: [['How many', `${type.count} ± ${type.countRandom}`], ['Shape', PARTICLE_SHAPES[type.shape].say], ['Lasts', `${type.lifetime} s`]],
      note: 'Click the map to try it. Right click it here (or Edit) to change it',
    };
  }
  if (kind === 'trigger' && name === 'spawn') {
    return { title: 'spawn', kind: 'Trigger', rows: [], note: "Where the player starts on this map. There's only one, so placing it moves it" };
  }
  if (kind === 'trigger' && name === 'area') {
    return { title: 'area', kind: 'Trigger', rows: [], note: 'Drag over the map for a box with its own atmosphere: fog, colour, weather, sound. Right click inside one to change it' };
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

  // the Weapons tab also has the enemies' own weapons at the end (weaponeditor.js). only ones that
  // match the search box, if it has anything in it
  names(tab = Editor.tab) {
    const names = Object.keys(EDITOR_CATALOGUES[tab]);
    const all = tab === 'weapon' ? [...names, ...enemyWeaponNames()] : names;
    return all.filter((name) => Editor.search.matches(name, EDITOR_CATALOGUES[tab][name]?.label));
  }

  // scrolls the open tab so the square called name shows (after picking it from the map)
  reveal(name) {
    const i = this.names().indexOf(name);
    if (i < 0) return;
    const L = EDITOR_LAYOUT;
    const top = L.padding + Math.floor(i / this.columns()) * L.cellSize;
    const scroll = this.scroll[Editor.tab] ?? 0;
    this.scroll[Editor.tab] = constrain(scroll, top + L.cellSize + L.padding - this.h, top);
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
    // an enemy's own weapon can't be placed or given, so any click opens it
    const enemy = tab === 'weapon' && enemyWithWeapon(this.hoveredName);
    if (enemy) {
      if (Input.buttonsPressed.has('left') || Input.buttonsPressed.has('right')) editEnemyWeapon(enemy);
      return;
    }
    // Shift + click pins it in the recent row instead
    if (Input.buttonsPressed.has('left') && Input.shift) return Editor.togglePin({ kind: tab, name: this.hoveredName });
    if (Input.buttonsPressed.has('left')) Editor.pick({ kind: tab, name: this.hoveredName });
    if (tab === 'tile' && Input.buttonsPressed.has('right')) TileEditor.open(TILE_TYPES[this.hoveredName]);
    if (isItemKind(tab) && Input.buttonsPressed.has('right')) Editor.editItem(this.hoveredName);
    if (isSoundKind(tab) && Input.buttonsPressed.has('right')) SoundEditor.open(this.hoveredName);
    if (tab === 'particle' && Input.buttonsPressed.has('right')) ParticleEditor.open(this.hoveredName);
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
      setText(11, BOLD, CENTER, TOP);
      text(Editor.search.text ? this.otherMatches() : 'Nothing here yet', this.x + 10, this.y + 22, this.w - 20, this.h - 30);
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

    // the hovered square's name in a little box above it (or below it on the top row), on top of
    // everything
    if (this.hoveredName) {
      const cell = this.cell(names.indexOf(this.hoveredName));
      const name = this.hoveredName;
      const y = cell.y - 22 < this.y ? cell.y + size + 4 : cell.y - 22;
      UI.drawOnTop(() => drawTip(name, cell.x + size / 2, y, this.x + 2, this.x + this.w - 2));
    }
  }
}

// while searching and nothing on this tab matches: which tabs have some
PaletteGrid.prototype.otherMatches = function otherMatches() {
  const found = EDITOR_TABS.filter(({ kind }) => kind !== Editor.tab && this.names(kind).length > 0).map(({ kind, label }) => `${label} (${this.names(kind).length})`);
  return found.length > 0 ? `Nothing here matches. Try ${found.join(', ')}` : 'Nothing anywhere matches';
};

// the search box at the top of the palette: click it (or press / or Ctrl + F) and type, and the
// palette only shows what has that in its name. it has the typing while it's clicked on, so the
// editor's keys wait. Enter picks the first match, Escape empties it, and clicking anywhere else lets
// go. the × empties it
class PaletteSearch extends UIElement {
  constructor(options) {
    super(options);
    this.text = '';
    this.focused = false;
  }

  // does a name (or its label) have the search in it? everything does when it's empty
  matches(name, label) {
    if (!this.text) return true;
    const words = this.text.toLowerCase();
    return name.toLowerCase().includes(words) || Boolean(label && String(label).toLowerCase().includes(words));
  }

  focus() {
    this.focused = true;
    Input.typing = true;
  }

  // lets go of the typing, unless a box has taken it
  blur() {
    if (!this.focused) return;
    this.focused = false;
    if (!FormBox.active && !SoundEditor.active) Input.typing = false;
  }

  // the × at the right hand end, when there's something to empty
  overClear() {
    return this.text && this.hovered && Input.mouse.x >= this.x + this.w - 18;
  }

  update(hovered) {
    this.hovered = hovered;
    if (!Input.buttonsPressed.has('left')) return;
    if (this.overClear()) {
      this.text = '';
      return;
    }
    if (hovered) this.focus();
    else this.blur();
  }

  // what's been typed, every frame while it's focused (Editor.update())
  type() {
    for (const key of Input.typed) {
      if (key === 'Escape') {
        this.text = '';
        return this.blur();
      }
      if (key === 'Enter' || key === 'Tab') {
        const first = Editor.palette.names()[0];
        if (first && key === 'Enter') Editor.pick({ kind: Editor.tab, name: first });
        return this.blur();
      }
      if (key === 'Backspace' || key === 'Delete') this.text = this.text.slice(0, -1);
      else if (key.paste !== undefined) this.text = (this.text + key.paste.trim()).slice(0, 24);
      else if (key.length === 1 && this.text.length < 24) this.text += key;
    }
  }

  draw() {
    const C = EDITOR_COLOURS;
    fill(C.well);
    stroke(this.focused ? BUTTON_STYLES.primary.fill : this.hovered ? 140 : C.edge);
    strokeWeight(1);
    rect(this.x, this.y, this.w, this.h, 3);
    noStroke();
    const middleY = this.y + this.h / 2;
    // a little magnifying glass
    stroke(C.dimText);
    strokeWeight(1.5);
    noFill();
    circle(this.x + 11, middleY - 1, 7);
    line(this.x + 13.5, middleY + 1.5, this.x + 16, middleY + 4);
    noStroke();
    setText(11, BOLD, LEFT, CENTER);
    if (this.text) {
      fill(C.text);
      text(fitText(this.text, this.w - 46), this.x + 22, middleY);
      fill(this.overClear() ? 255 : C.dimText);
      setText(14, BOLD, CENTER, CENTER);
      text('×', this.x + this.w - 10, middleY - 1);
    } else {
      fill(C.dimText);
      text(`Search   ${keyName(KEYS.editorSearch[0])}`, this.x + 22, middleY);
    }
    // a blinking line where typing goes
    if (this.focused && millis() % 1000 < 500) {
      setText(11, BOLD, LEFT, CENTER);
      fill(C.text);
      rect(this.x + 23 + textWidth(fitText(this.text, this.w - 46)), middleY - 6, 1.5, 12);
    }
  }
}

// the row under the search box: what was picked lately (Editor.recent), pinned ones first with a dot.
// click one to pick it (its tab opens), Shift + click to pin or unpin it, right click to take it off
const RECENT_STRIP = { size: 22, gap: 4, most: 7 };

class RecentStrip extends UIElement {
  constructor(options) {
    super(options);
    this.under = null;
  }

  // the recent things that still exist, with where each square goes
  squares() {
    const { size, gap } = RECENT_STRIP;
    const room = Math.floor((this.w - EDITOR_LAYOUT.padding * 2 + gap) / (size + gap));
    return Editor.recent
      .filter((thing) => EDITOR_CATALOGUES[thing.kind]?.[thing.name])
      .slice(0, room)
      .map((thing, i) => ({ thing, x: this.x + EDITOR_LAYOUT.padding + i * (size + gap), y: this.y + (this.h - size) / 2, size }));
  }

  update(hovered) {
    this.hovered = hovered;
    const { x, y } = Input.mouse;
    this.under = hovered ? this.squares().find((sq) => x >= sq.x && x < sq.x + sq.size && y >= sq.y && y < sq.y + sq.size) ?? null : null;
    if (!this.under) return;
    const { thing } = this.under;
    if (Input.buttonsPressed.has('left') && Input.shift) return Editor.togglePin(thing);
    if (Input.buttonsPressed.has('left')) Editor.choose(thing);
    if (Input.buttonsPressed.has('right')) {
      Editor.recent = Editor.recent.filter((other) => other !== thing);
      Editor.saveRecent();
    }
  }

  draw() {
    const C = EDITOR_COLOURS;
    const squares = this.squares();
    noStroke();
    if (squares.length === 0) {
      fill(C.dimText);
      setText(10, BOLD, LEFT, CENTER);
      text('Picked lately shows here', this.x + EDITOR_LAYOUT.padding + 2, this.y + this.h / 2);
      return;
    }
    for (const sq of squares) {
      drawPaletteArt(sq.thing.kind, sq.thing.name, sq.x, sq.y, sq.size);
      noFill();
      const picked = Editor.isSelected(sq.thing.kind, sq.thing.name);
      stroke(picked ? C.picked : sq === this.under ? 255 : C.edge);
      strokeWeight(picked ? 2 : 1);
      rect(sq.x, sq.y, sq.size, sq.size);
      if (sq.thing.pinned) {
        noStroke();
        fill(C.accent);
        circle(sq.x + sq.size - 3, sq.y + 3, 6);
      }
    }
    // its name under it while the mouse is on it, drawn on top since it hangs over the palette
    if (this.under) {
      const under = this.under;
      const words = `${under.thing.name}${under.thing.pinned ? ' (pinned)' : ''}`;
      UI.drawOnTop(() => drawTip(words, under.x + under.size / 2, this.y + this.h, this.x + 2, this.x + this.w - 2));
    }
  }
}

// a name in a little dark box, centred on middleX with its top at y, kept between left and right
// (the palette's and recent row's tips)
function drawTip(words, middleX, y, left, right) {
  setText(11, BOLD, CENTER, CENTER);
  const w = textWidth(words) + 12;
  const x = constrain(middleX - w / 2, left, right - w);
  noStroke();
  fill(0, 0, 0, 220);
  rect(x, y, w, 18, 3);
  fill(255);
  text(words, x + w / 2, y + 9);
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
  } else if (kind === 'trigger' && name === 'area') {
    drawAreaArt(x, y, size); // atmosphere.js
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
  } else if (kind === 'particle') {
    drawParticleArt(PARTICLE_EFFECTS[name], middleX, middleY, size); // particles.js
  } else if (kind === 'weapon' && enemyWithWeapon(name)) {
    // an enemy's own weapon, with a badge (weaponeditor.js)
    drawEnemyWeaponArt(enemyWithWeapon(name), x, y, size);
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
