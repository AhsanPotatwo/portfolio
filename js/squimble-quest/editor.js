// the map editor. a simple way to build maps: paint tiles, and place objects, enemies and npcs,
// on the map you're on. open it from dev mode: press ` (or Ctrl + D) for dev mode, then B (for build).
//
// while it's open:
//   - everyone stops, and WASD / the arrow keys move the camera around instead. the ui fades out
//     while you move, so you can see the map, and comes back when you stop
//   - pick something from the bar at the bottom. the tabs above it switch between
//     tiles, objects, enemies and npcs (‹ › for more pages once there are lots)
//   - tiles: left click or drag to paint, replacing whatever tile was there
//   - objects: left click to place one, its top left corner on the tile under the mouse
//   - enemies and npcs: left click to place one, standing on the tile under the mouse
//   - right click or drag to erase (or pick Erase in the bar). if you start on an object, enemy
//     or npc it removes those, otherwise it empties tiles. empty tiles are like off the edge of
//     the map: nothing's drawn there and nothing can walk on them
//   - opening the editor brings back every enemy placed on the map, including defeated ones, so
//     you always see the whole design. closing it puts every enemy and npc back where it was
//     placed, with full health. (outside the editor, defeated enemies stay defeated, see sketch.js)
//   - P puts the player's spawn point on the tile under the mouse (marked with a yellow ring)
//   - Map settings (top right) opens a panel for the whole map: Resize map changes its size
//     (never smaller than the area with tiles in it), New map makes a blank map of any size,
//     Open file loads one and Export saves the map as a file. both sizes are typed into a box
//     in the game (SizeBox, at the bottom of this file)
//   - the dev mode keys still work (zoom, teleport, next map), and H lists them all
//
// everything in tiles.js, objects.js, enemies.js and npcs.js shows up in the bar by itself.
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
  'right click erase',
  'WASD        move around',
  'wheel       zoom',
  'P           player spawns here',
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
  // where the squares start and stop across the bar. the rest is the Erase button and arrows
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

// the tabs above the bar, left to right. each one shows everything of its kind.
// a new kind of thing to place needs a tab here and its catalogue in EDITOR_CATALOGUES below
const EDITOR_TABS = [
  { kind: 'tile', label: 'Tiles' },
  // furniture, decorations, chests... everything in objects.js
  { kind: 'object', label: 'Objects' },
  { kind: 'enemy', label: 'Enemies' },
  { kind: 'npc', label: 'NPCs' },
];

// where each tab's things are defined, by kind
const EDITOR_CATALOGUES = { tile: TILE_TYPES, object: OBJECT_TYPES, enemy: ENEMY_TYPES, npc: NPC_TYPES };

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
  // what's picked in the bar: { kind, name } (kind is one of the EDITOR_TABS), or null for Erase
  selected: null,
  // which tab is showing (a kind from EDITOR_TABS), and for each tab, which page it's on and how
  // many pages it has. each tab remembers its own page, so switching back finds it where you left it
  tab: 'tile',
  pages: {},
  pageCounts: {},
  // what the camera looks at while editing. WASD moves this, the camera follows it
  view: { x: 0, y: 0 },
  // where the mouse was last frame while dragging, so fast drags can fill in the gap
  lastPaint: null,
  // whether the current erase drag is removing objects and enemies (true) or emptying tiles (false)
  erasingThings: false,
  // how see-through the ui is, 1 solid to 0 gone. it fades out while WASD moves the camera
  // (sketch.js draws the ui with it). stillFor is how long since the camera last moved, in seconds
  uiAlpha: 1,
  stillFor: 0,

  // the editor's ui elements that it changes later, made once in init()
  swatches: [],
  eraseButton: null,
  prevButton: null,
  nextButton: null,
  settingsButton: null,

  // call once from setup(). makes the bar, the tabs, the Map settings button and its panel, and
  // the size box (all hidden until they're needed)
  init() {
    const barY = GAME_H - EDITOR_BAR.height;
    const perPage = Math.floor((EDITOR_BAR.swatchesRight - EDITOR_BAR.swatchesLeft) / EDITOR_BAR.slotWidth);

    // what goes in each tab, and how many pages each one needs (at least 1, even if it's empty)
    const names = {};
    for (const { kind } of EDITOR_TABS) names[kind] = Object.keys(EDITOR_CATALOGUES[kind]);
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

    // one square per tile, object, enemy and npc. each knows its tab and page, only the open ones are shown
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

    // Map settings, top right. a toggle, so it looks switched on while its panel is open
    const s = EDITOR_SETTINGS;
    this.settingsButton = add(new Button({
      x: GAME_W - 8 - s.buttonWidth, y: 8, w: s.buttonWidth, h: s.buttonHeight, label: 'Map settings',
      style: { textSize: 13, onFill: EDITOR_COLOURS.accent },
      toggle: true,
      onClick: (button) => this.showSettings(button.on),
    }));

    // the panel it opens, in its own group so it can be shown and hidden on its own. each button
    // closes the panel, then does its thing. worldMap is the game's (sketch.js)
    const actions = [
      { label: 'Resize map', onClick: () => this.resizeMap() },
      { label: 'New map', onClick: () => this.newMap() },
      { label: 'Open file', onClick: () => openMapFile() },
      { label: 'Export', style: 'primary', onClick: () => exportMap(worldMap) },
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
    SizeBox.init();
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
    // every enemy placed on the map comes back, defeated or not, so you see the whole design
    // (and it's a quick way to reset them while testing). worldMap is the game's (sketch.js)
    worldMap.defeated.clear();
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
    if (SizeBox.active) SizeBox.close();
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
  },

  // is this the one picked in the bar?
  isSelected(kind, name) {
    return this.selected !== null && this.selected.kind === kind && this.selected.name === name;
  },

  // ---------- new map and resizing ----------

  // asks for a size, then makes a blank map that size and goes to it. it's filled with the tile
  // picked in the bar, or starts empty if Erase is picked (handy for rooms that aren't rectangles:
  // start empty, then paint the floor in whatever shape you like)
  newMap() {
    let fillWith = 'blank';
    if (this.selected === null) fillWith = null;
    else if (this.selected.kind === 'tile') fillWith = this.selected.name;

    SizeBox.open({
      title: 'New map',
      hint: fillWith ? `Filled with ${fillWith}` : 'Starts empty (Erase is picked)',
      confirmLabel: 'Make map',
      cols: 40,
      rows: 24,
      onConfirm: (cols, rows) => {
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

    SizeBox.open({
      title: 'Resize map',
      hint: `Smallest it can be: ${minCols} x ${minRows}`,
      confirmLabel: 'Resize',
      cols: map.cols,
      rows: map.rows,
      // the boxes won't go below these, so asking for less gives the smallest it can be
      minCols,
      minRows,
      onConfirm: (cols, rows) => {
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

  // ---------- every frame, while open ----------

  // aim is the mouse's world position, or null
  update(map, camera, aim, dt) {
    // while the size box is open, it's all that happens
    if (SizeBox.active) {
      SizeBox.update();
      return;
    }

    // Erase is a toggle, which flips itself when clicked, so set it to match what's really picked
    this.eraseButton.on = this.selected === null;

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

    // P: the player will start with their feet in the middle of the tile under the mouse.
    // not on solid or empty tiles, they'd be stuck
    if (Input.wasPressed('setSpawn') && over && !map.isSolid(over.col, over.row)) {
      map.setSpawnTile(over.col, over.row);
      // the player only copies the map's spawn point when the map loads (player.js), so they
      // respawn here now too, not just the next time the map loads. player is the game's (sketch.js)
      player.spawnX = map.spawn.x;
      player.spawnY = map.spawn.y;
    }

    // objects, enemies and npcs: one per click. mousePressed() ignores clicks that landed on the
    // editor's ui, like the bar or the Map settings panel (see input.js)
    if (over && Input.mousePressed('left') && this.selected) {
      const { kind, name } = this.selected;
      if (kind === 'object') this.placeObject(map, name, over.col, over.row);
      if (isCharacterKind(kind)) this.placeCharacter(map, kind, name, over.col, over.row);
    }

    // tiles and erasing: keep going while the button's held
    const erasing = Input.mouseHeld('right') || (this.selected === null && Input.mouseHeld('left'));
    const painting = !erasing && this.selected?.kind === 'tile' && Input.mouseHeld('left');

    if (over && (painting || erasing)) {
      // an erase drag that starts on an object, enemy or npc only removes those, otherwise it only
      // empties tiles. stops one drag removing a table and then the floor it was standing on
      if (!this.lastPaint) this.erasingThings = erasing && this.thingsAt(map, over.col, over.row);

      let removedCharacter = false;
      this.forEachTileOnLine(map, this.lastPaint ?? aim, aim, (col, row) => {
        if (painting) {
          map.set(col, row, this.selected.name);
        } else if (this.erasingThings) {
          map.removeObjectsAt(col, row);
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

  // is there an object, enemy or npc on this tile?
  thingsAt(map, col, row) {
    if (map.objectsAt(col, row).length > 0) return true;
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

  // marks the spawn point, and shows what a click would do under the mouse.
  // uses world positions, so draw it before camera.end()
  drawCursor(map, camera, aim) {
    // same trick as the grid: divide by zoom so lines stay the same thickness on screen
    const px = 1 / camera.zoom;

    // the spawn point: a yellow ring (on a dark one) where the player's feet will be
    const spawnFeetY = map.spawn.y + feetBelowCentre(PLAYER);
    noFill();
    stroke(0, 0, 0, 160);
    strokeWeight(4 * px);
    circle(map.spawn.x, spawnFeetY, 20);
    stroke('#ffd23f');
    strokeWeight(2 * px);
    circle(map.spawn.x, spawnFeetY, 20);

    if (!aim || !Input.mouse.inside || UI.hovered) return;
    const col = map.colAt(aim.x);
    const row = map.rowAt(aim.y);
    if (!map.inside(col, row)) return;

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

// one tile, object, enemy or npc in the bar. a Button, so clicking works the same, but it draws
// the thing itself instead of a box
class PaletteSwatch extends Button {
  constructor(options) {
    super(options);
    // its kind (from EDITOR_TABS), its name, and which page of the bar it's on
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
      // objects and characters sit on a dark square, shrunk to fit but keeping their shape,
      // so a 2 x 1 table looks twice as wide as it is tall
      const type = EDITOR_CATALOGUES[this.kind][this.name];
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
    setText(11);
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

// ---------- the size box ----------
// asks for a map's width and height (New map and Resize map) in the game, rather than in the
// browser's own prompt(). click a number to type into it, Tab swaps between them, Enter or the
// right button says yes, Escape or Cancel closes it

// the box's size, in the middle of the screen
const SIZE_BOX = { width: 300, height: 230 };

const SizeBox = {
  active: false,
  // what open() was given
  options: null,
  // the width and height number boxes, and the button that says yes
  fields: [],
  confirmButton: null,

  // call once, from Editor.init(), so it's on top of the editor's ui
  init() {
    const w = SIZE_BOX.width;
    const h = SIZE_BOX.height;
    const x = (GAME_W - w) / 2;
    const y = (GAME_H - h) / 2;
    const add = (element) => UI.add(Object.assign(element, { group: 'size-box' }));

    // covers the whole screen, so nothing behind it can be clicked while it's open
    add(new SizeBoxBackdrop({ x: 0, y: 0, w: GAME_W, h: GAME_H, box: { x, y, w, h } }));
    this.fields = [0, 1].map((i) => add(new NumberField({
      x: x + 100, y: y + 52 + i * 44, w: 90, h: 32, min: 1, max: EDITOR_MAX_MAP_SIZE,
    })));
    add(new Button({ x: x + 20, y: y + h - 56, w: 124, h: 38, label: 'Cancel', onClick: () => this.close() }));
    this.confirmButton = add(new Button({
      x: x + w - 144, y: y + h - 56, w: 124, h: 38, style: 'primary', onClick: () => this.confirm(),
    }));

    UI.showGroup('size-box', false);
  },

  // options: { title, hint, confirmLabel, cols, rows, minCols, minRows, onConfirm(cols, rows) }.
  // cols and rows are what the boxes start with. they can't go below minCols and minRows (1 if
  // left out) or above EDITOR_MAX_MAP_SIZE
  open(options) {
    this.options = options;
    this.active = true;
    // the keyboard types into the boxes now, rather than moving the camera and so on (input.js)
    Input.typing = true;

    const [width, height] = this.fields;
    width.min = options.minCols ?? 1;
    height.min = options.minRows ?? 1;
    width.value = options.cols;
    height.value = options.rows;
    this.confirmButton.label = options.confirmLabel;

    UI.showGroup('size-box', true);
    this.focus(width);
  },

  close() {
    this.active = false;
    Input.typing = false;
    for (const field of this.fields) field.blur();
    UI.showGroup('size-box', false);
  },

  confirm() {
    const [width, height] = this.fields;
    const cols = width.value;
    const rows = height.value;
    // closed first, since saying yes can go to a new map
    this.close();
    this.options.onConfirm(cols, rows);
  },

  // types into this box from now on
  focus(field) {
    for (const other of this.fields) {
      if (other !== field && other.focused) other.blur();
    }
    field.focus();
  },

  // run every frame while it's open, from Editor.update(). keys are gone through in the order they
  // were typed, so a quick "20 Tab 12" still puts 20 in one box and 12 in the other
  update() {
    if (Input.buttonsPressed.has('left')) {
      const clicked = this.fields.find((field) => field.hovered);
      if (clicked) this.focus(clicked);
    }
    for (const key of Input.typed) {
      if (key === 'Enter') return this.confirm();
      if (key === 'Escape') return this.close();
      if (key === 'Tab') this.focus(this.fields.find((field) => !field.focused));
      else this.fields.find((field) => field.focused).type(key);
    }
  },
};

// the size box's background: dims everything behind it, then draws the box and its writing.
// the number boxes and buttons are separate ui elements on top (see SizeBox.init())
class SizeBoxBackdrop extends UIElement {
  constructor(options) {
    super(options);
    // where the box itself is: { x, y, w, h }
    this.box = options.box;
  }

  draw() {
    const { x, y, w, h } = this.box;
    const options = SizeBox.options;

    noStroke();
    fill(0, 0, 0, 110);
    rect(0, 0, GAME_W, GAME_H);

    fill(EDITOR_COLOURS.bar);
    stroke(EDITOR_COLOURS.edge);
    strokeWeight(1.5);
    rect(x, y, w, h, 8);

    noStroke();
    fill(255);
    setText(18, BOLD, LEFT, CENTER);
    text(options.title, x + 20, y + 28);

    // lined up with the middle of each number box
    fill(220);
    setText(14, BOLD, LEFT, CENTER);
    text('Width', x + 20, y + 68);
    text('Height', x + 20, y + 112);
    fill(255, 255, 255, 150);
    setText(13, NORMAL, LEFT, CENTER);
    text('tiles', x + 202, y + 68);
    text('tiles', x + 202, y + 112);
    text(options.hint, x + 20, y + 148);
  }
}
