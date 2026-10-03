// a tile map: what's where, drawing, and collision with solid tiles.
// tile (col, row) covers world (col * TILE, row * TILE) to the next tile: col = floor(x / TILE),
// row = floor(y / TILE). (0, 0) spans 0..32, (-1, -1) is up and left of it.
// it stores tile names only ('grass'); looks and behaviour are in TILE_TYPES (tiles.js). it also holds
// objects (objects.js), enemy/npc start points and warps (warps.js)

// placeable character kinds: their map list, catalogue, defining file and map file key. saving,
// loading, resizing and editor erasing go through this. a new kind (e.g. animals) needs a line here,
// its list in the constructor, an editor tab (EDITOR_TABS in editor.js), and a global list made,
// updated and drawn in sketch.js like enemies and npcs
const SPAWN_KINDS = {
  enemy: { list: 'enemySpawns', types: ENEMY_TYPES, file: 'enemies.js', fileKey: 'enemies' },
  npc:   { list: 'npcSpawns',   types: NPC_TYPES,   file: 'npcs.js',    fileKey: 'npcs' },
};

class TileMap {
  // left, top: top left tile's column and row (can be negative). cols, rows: size. all tiles fillWith
  constructor(left, top, cols, rows, fillWith) {
    this.left = left;
    this.top = top;
    this.cols = cols;
    this.rows = rows;
    // row after row; index() finds a tile
    this.tiles = new Array(cols * rows).fill(fillWith);

    // its MAPS name (maps.js), set by getMap()
    this.name = '';
    // player start (their centre), world positions
    this.spawn = { x: 0, y: 0 };

    // each { type, col, row } (objects.js)
    this.objects = [];
    // index() of every tile under a solid object, for fast collision. kept by addObject() and
    // removeObjectsAt()
    this.solidCells = new Set();

    // start points, each { type, col, row }: an enemies.js/npcs.js name and its tile, plus an
    // enemy's ai if picked in the editor (ENEMY_AIS). the real characters are made from these
    // (spawnCharacters() in sketch.js)
    this.enemySpawns = [];
    this.npcSpawns = [];

    // each { name, col, row, to, toWarp, activate, enemies } (explained at the top of warps.js)
    this.warps = [];

    // { enemies, npcs } as last left (loadMap() in sketch.js), so revisits find them unchanged. null
    // until first left. progress, not design: the spawn lists never change, so the editor shows and
    // Export saves all of them
    this.characters = null;
    // items on the ground, each { item, x, y, ready, from, flight } (Drops in inventory.js). progress
    // too: Export doesn't save them, even editor-placed ones
    this.drops = [];
  }

  // ---------- reading and changing tiles ----------

  inside(col, row) {
    return col >= this.left && col < this.left + this.cols &&
           row >= this.top && row < this.top + this.rows;
  }

  // position in this.tiles
  index(col, row) {
    return (row - this.top) * this.cols + (col - this.left);
  }

  // the tile type (tiles.js settings), or null if off the map or empty
  get(col, row) {
    if (!this.inside(col, row)) return null;
    return TILE_TYPES[this.tiles[this.index(col, row)]] ?? null;
  }

  // name: a TILE_TYPES name, or null to empty it
  set(col, row, name) {
    if (name !== null && !TILE_TYPES[name]) {
      console.warn(`There's no tile called "${name}". Make it with New in the map editor's inspector (Tiles tab)`);
      return;
    }
    if (this.inside(col, row)) this.tiles[this.index(col, row)] = name;
  }

  // bounding { left, top, right, bottom } (first/last col and row) of non-empty tiles, or null if
  // all empty. the editor won't resize smaller than this
  usedArea() {
    let area = null;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.tiles[r * this.cols + c] === null) continue;
        const col = this.left + c;
        const row = this.top + r;
        if (!area) area = { left: col, top: row, right: col, bottom: row };
        area.left = Math.min(area.left, col);
        area.right = Math.max(area.right, col);
        area.top = Math.min(area.top, row);
        area.bottom = Math.max(area.bottom, row);
      }
    }
    return area;
  }

  // to cols x rows with top left tile at left, top. tiles keep their world position, new space is
  // empty, and anything on removed parts is dropped
  resize(left, top, cols, rows) {
    const tiles = new Array(cols * rows).fill(null);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // inside() and index() still use the old size here
        if (this.inside(left + c, top + r)) tiles[r * cols + c] = this.tiles[this.index(left + c, top + r)];
      }
    }
    Object.assign(this, { left, top, cols, rows, tiles });

    // now the new size
    this.objects = this.objects.filter((obj) => this.inside(obj.col, obj.row));
    for (const info of Object.values(SPAWN_KINDS)) {
      this[info.list] = this[info.list].filter((spawn) => this.inside(spawn.col, spawn.row));
    }
    this.warps = this.warps.filter((warp) => this.inside(warp.col, warp.row));
    // index() numbers changed
    this.updateSolidCells();
  }

  // off-map, empty and solid-object tiles are solid too, so nothing leaves the world or falls in a
  // hole. (get() only returns a tile on the map, so index() is safe after it)
  isSolid(col, row) {
    const type = this.get(col, row);
    return !type || type.solid || this.solidCells.has(this.index(col, row));
  }

  // can you see from one world point to the other? solid tiles block, unless seeThrough (water), and
  // so do empty and off-map ones. objects don't: furniture is low. samples every quarter tile, so it
  // can slip between two walls touching at a corner. enemies' sight (sensePlayer() in enemies.js)
  clearLine(x1, y1, x2, y2) {
    const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (TILE / 4));
    for (let i = 1; i < steps; i++) {
      const type = this.get(this.colAt(x1 + (x2 - x1) * (i / steps)), this.rowAt(y1 + (y2 - y1) * (i / steps)));
      if (!type || (type.solid && !type.seeThrough)) return false;
    }
    return true;
  }

  // spawn with the player's feet mid-tile (spawn is their centre, above the feet; standingOnTile()
  // in character.js)
  setSpawnTile(col, row) {
    this.spawn = standingOnTile(PLAYER, col, row);
  }

  // ---------- objects ----------

  // an objects.js name, top left on col, row
  addObject(type, col, row) {
    if (!OBJECT_TYPES[type]) {
      console.warn(`There's no object called "${type}", add it in objects.js`);
      return;
    }
    const obj = { type, col, row };
    this.objects.push(obj);
    // just this one's tiles, not a full redo
    this.markSolid(obj);
  }

  covers(obj, col, row) {
    const type = OBJECT_TYPES[obj.type];
    return col >= obj.col && col < obj.col + type.width &&
           row >= obj.row && row < obj.row + type.height;
  }

  objectsAt(col, row) {
    return this.objects.filter((obj) => this.covers(obj, col, row));
  }

  // true if any were removed
  removeObjectsAt(col, row) {
    const before = this.objects.length;
    this.objects = this.objects.filter((obj) => !this.covers(obj, col, row));
    if (this.objects.length === before) return false;
    this.updateSolidCells();
    return true;
  }

  // ---------- where characters start ----------
  // kind is 'enemy' or 'npc' (SPAWN_KINDS)

  // type: an enemies.js/npcs.js name. e.g. map.addSpawn('npc', 'villager', 3, -2). ai: optional
  // ENEMY_AIS name (enemies.js) instead of the kind's own, enemies only
  addSpawn(kind, type, col, row, ai) {
    const info = SPAWN_KINDS[kind];
    if (!info.types[type]) {
      console.warn(`There's no ${kind} called "${type}", add it in ${info.file}`);
      return;
    }
    if (ai !== undefined && (kind !== 'enemy' || !(ai in ENEMY_AIS))) {
      console.warn(`There's no enemy ai called "${ai}", so this ${type} uses its own. They're in ENEMY_AIS (enemies.js)`);
      ai = undefined;
    }
    this[info.list].push(ai === undefined ? { type, col, row } : { type, col, row, ai });
  }

  spawnsAt(kind, col, row) {
    return this[SPAWN_KINDS[kind].list].filter((spawn) => spawn.col === col && spawn.row === row);
  }

  // true if any were removed
  removeSpawnsAt(kind, col, row) {
    const list = SPAWN_KINDS[kind].list;
    const before = this[list].length;
    this[list] = this[list].filter((spawn) => spawn.col !== col || spawn.row !== row);
    return this[list].length !== before;
  }

  // ---------- warps ----------
  // at most one per tile, names unique per map (warps.js). added by pushing onto this.warps

  // or null
  warpAt(col, row) {
    return this.warps.find((warp) => warp.col === col && warp.row === row) ?? null;
  }

  // or null
  warp(name) {
    return this.warps.find((warp) => warp.name === name) ?? null;
  }

  // true if there was one
  removeWarpAt(col, row) {
    const warp = this.warpAt(col, row);
    this.warps = this.warps.filter((other) => other !== warp);
    return warp !== null;
  }

  // ---------- solid objects ----------

  // rebuilds solidCells. after a removal another solid object may still cover a tile, so redo all
  updateSolidCells() {
    this.solidCells.clear();
    for (const obj of this.objects) this.markSolid(obj);
  }

  // adds a solid object's tiles to solidCells, skipping off-map parts (solid anyway, and index()
  // only works on the map)
  markSolid(obj) {
    const type = OBJECT_TYPES[obj.type];
    if (!type.solid) return;
    for (let r = obj.row; r < obj.row + type.height; r++) {
      for (let c = obj.col; c < obj.col + type.width; c++) {
        if (this.inside(c, r)) this.solidCells.add(this.index(c, r));
      }
    }
  }

  // ---------- world positions ↔ tiles ----------

  colAt(x) {
    return Math.floor(x / TILE);
  }

  rowAt(y) {
    return Math.floor(y / TILE);
  }

  // map edges, world positions
  bounds() {
    return {
      left: this.left * TILE,
      top: this.top * TILE,
      right: (this.left + this.cols) * TILE,
      bottom: (this.top + this.rows) * TILE,
    };
  }

  // ---------- collision ----------
  // a box is { x, y, w, h }: top left and size, world positions

  // how far a box can move dx before stopping flush at a solid tile. characters move x with this then
  // y with moveAlongY(), so angled walls slide (walk() in character.js). only checks the column the
  // leading edge ends in, so nothing may move over a tile per frame (MAX_DT in config.js)
  moveAlongX(box, dx) {
    if (dx === 0) return 0;

    // rows covered
    const firstRow = this.rowAt(box.y);
    const lastRow = this.lastCovered(box.y + box.h);
    // column the front edge moves into
    const col = dx > 0 ? this.lastCovered(box.x + box.w + dx) : this.colAt(box.x + dx);

    for (let row = firstRow; row <= lastRow; row++) {
      if (this.isSolid(col, row)) {
        // flush against it
        return dx > 0 ? col * TILE - (box.x + box.w) : (col + 1) * TILE - box.x;
      }
    }
    return dx;
  }

  // moveAlongX on its side
  moveAlongY(box, dy) {
    if (dy === 0) return 0;

    const firstCol = this.colAt(box.x);
    const lastCol = this.lastCovered(box.x + box.w);
    const row = dy > 0 ? this.lastCovered(box.y + box.h + dy) : this.rowAt(box.y + dy);

    for (let col = firstCol; col <= lastCol; col++) {
      if (this.isSolid(col, row)) {
        return dy > 0 ? row * TILE - (box.y + box.h) : (row + 1) * TILE - box.y;
      }
    }
    return dy;
  }

  // last column/row reached by a far edge. an edge exactly on a boundary (x = 64) hasn't entered the
  // next tile, hence not colAt()
  lastCovered(edge) {
    return Math.ceil(edge / TILE) - 1;
  }

  // ---------- drawing ----------

  // world positions (inside camera.begin/end). only what's on screen, so map size doesn't matter
  draw(camera) {
    this.drawTiles(camera);
    this.drawObjects(camera);
  }

  // tiles are drawn on screen pixels, not through the camera's zoom: at zooms like 1.35 (dialogue)
  // edges would land mid-pixel and the browser blends them, showing a faint grid. so each edge is
  // computed on screen, rounded to a whole pixel, and shared by neighbours: no gaps, overlap or
  // softening at any zoom.
  //
  // imageless tiles draw in runs: same-colour neighbours on a row are one rect (identical look), so a
  // grass field is a handful of rects, not thousands, which matters zoomed out.
  //
  // dual grid tiles are skipped in the first pass, then drawn on the half-offset grid
  // (drawDualCorner() in dualgrid.js). one without dualTiles (no texture or not loaded) draws in the
  // first pass in its colour
  drawTiles(camera) {
    const view = camera.view();
    const firstCol = Math.max(this.left, this.colAt(view.left));
    const lastCol = Math.min(this.left + this.cols - 1, this.colAt(view.right));
    const firstRow = Math.max(this.top, this.rowAt(view.top));
    const lastRow = Math.min(this.top + this.rows - 1, this.rowAt(view.bottom));

    // round to real device pixels (pixelDensity() is 2 on most high res screens)
    const density = pixelDensity();
    const toPixel = (value) => Math.round(value * density) / density;

    // screen position of every half tile edge, from half a tile before the first column to half after
    // the last (dual pieces hang half off). x(2 * col) is a column's left edge, x(2 * col + 1) its
    // middle, where dual pieces start and end. both grids use these, so they line up exactly
    const xs = [];
    for (let half = 2 * firstCol - 1; half <= 2 * lastCol + 3; half++) xs.push(toPixel(camera.drawnPosition(half * TILE / 2, 0).x));
    const ys = [];
    for (let half = 2 * firstRow - 1; half <= 2 * lastRow + 3; half++) ys.push(toPixel(camera.drawnPosition(0, half * TILE / 2).y));
    // edge by half tile number (xs[0] is half 2 * firstCol - 1)
    const x = (half) => xs[half - 2 * firstCol + 1];
    const y = (half) => ys[half - 2 * firstRow + 1];

    // screen positions: resetMatrix() drops the camera transform until pop()
    push();
    resetMatrix();
    noStroke();
    for (let row = firstRow; row <= lastRow; row++) {
      const top = y(2 * row);
      const h = y(2 * row + 2) - top;
      // tile type at a column on this row, skipping get()'s bounds check (columns are already
      // clamped). undefined for empty
      const rowStart = this.index(this.left, row) - this.left;
      const typeAt = (col) => TILE_TYPES[this.tiles[rowStart + col]];

      for (let col = firstCol; col <= lastCol; col++) {
        const type = typeAt(col);
        // empty shows the background; dual grid comes later
        if (!type || type.dualTiles) continue;
        const left = x(2 * col);
        if (type.img) {
          image(type.img, left, top, x(2 * col + 2) - left, h);
          continue;
        }
        // extend the run while the next tile matches, then one rect
        let end = col;
        while (end < lastCol && typeAt(end + 1) === type) end++;
        fill(type.fill);
        rect(left, top, x(2 * end + 2) - left, h);
        col = end;
      }
    }

    // every corner where four tiles meet, including the far edges (dualgrid.js)
    for (let row = firstRow; row <= lastRow + 1; row++) {
      for (let col = firstCol; col <= lastCol + 1; col++) {
        drawDualCorner(this, col, row, x, y);
      }
    }
    pop();
  }

  // placement order, later on top
  drawObjects(camera) {
    const view = camera.view();
    for (const obj of this.objects) {
      const type = OBJECT_TYPES[obj.type];
      const x = obj.col * TILE;
      const y = obj.row * TILE;
      const w = type.width * TILE;
      const h = type.height * TILE;
      // off screen
      if (x > view.right || x + w < view.left || y > view.bottom || y + h < view.top) continue;

      if (type.img) {
        image(type.img, x, y, w, h);
      } else {
        // placeholder: a rounded box inset from its tiles, so it sits on the floor rather than in it
        fill(type.fill);
        stroke(0, 0, 0, 90);
        strokeWeight(2);
        rect(x + 3, y + 3, w - 6, h - 6, 5);
        noStroke();
      }
    }
  }
}
