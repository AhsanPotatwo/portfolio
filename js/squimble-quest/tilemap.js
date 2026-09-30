// a map made of tiles: which tile is where, drawing them, and stopping things walking into solid ones.
//
// tile positions are a column and row. tile (0, 0) covers the world from (0, 0) to (32, 32),
// tile (1, 0) is the one to its right, and tile (-1, -1) is up and left of (0, 0).
// in other words: column = floor(world x / TILE), row = floor(world y / TILE)
//
// the map only stores tile names ('grass', 'wall'...). what each one looks like and does
// lives in TILE_TYPES (tiles.js, loaded from tiles.json). it also keeps a list of objects on top of
// the tiles (see objects.js), where each enemy and npc starts, and its warps (see warps.js)

// the kinds of character that can be placed on a map: which list on the map they're kept in,
// where they're defined, and what they're called in map files. saving, loading, resizing and the
// editor's erasing all go through this. adding another kind (e.g. animals) would be a new line here,
// its list in the constructor, a tab in the map editor (EDITOR_TABS in editor.js), and a global list
// of them made, updated and drawn in sketch.js like enemies and npcs are
const SPAWN_KINDS = {
  enemy: { list: 'enemySpawns', types: ENEMY_TYPES, file: 'enemies.js', fileKey: 'enemies' },
  npc:   { list: 'npcSpawns',   types: NPC_TYPES,   file: 'npcs.js',    fileKey: 'npcs' },
};

class TileMap {
  // left, top: the column and row of the map's top left tile (can be negative).
  // cols, rows: how many tiles wide and tall. every tile starts as fillWith
  constructor(left, top, cols, rows, fillWith) {
    this.left = left;
    this.top = top;
    this.cols = cols;
    this.rows = rows;
    // one long list, row after row. index() finds a tile's place in it
    this.tiles = new Array(cols * rows).fill(fillWith);

    // set by loadMap() in sketch.js, the map's name in MAPS (maps.js)
    this.name = '';
    // where the player starts, in world positions (the centre of the player)
    this.spawn = { x: 0, y: 0 };

    // things on top of the tiles, each { type, col, row } (see objects.js)
    this.objects = [];
    // every tile on the map covered by a solid object, by its index(), so collision can check it
    // quickly. kept up to date by addObject() and removeObjectsAt()
    this.solidCells = new Set();

    // where enemies and npcs start, each { type, col, row }: a name from enemies.js or npcs.js,
    // and the tile it stands on. the game makes the real characters from these when the map
    // loads (spawnCharacters() in sketch.js)
    this.enemySpawns = [];
    this.npcSpawns = [];

    // warps: tiles that take the player to another map, or somewhere else on this one. each is
    // { name, col, row, to, toWarp, activate, enemies }, all explained at the top of warps.js
    this.warps = [];

    // the enemies and npcs as they were when the player last left this map, { enemies, npcs }, so
    // coming back finds them the same: defeated enemies gone, hurt ones still hurt, everyone where
    // they were (see loadMap() in sketch.js). null until the player first leaves. it's game
    // progress, not part of the map's design: the spawns above never change (the editor still shows
    // every one, and Export still saves them)
    this.characters = null;
  }

  // ---------- reading and changing tiles ----------

  // is this column and row part of the map?
  inside(col, row) {
    return col >= this.left && col < this.left + this.cols &&
           row >= this.top && row < this.top + this.rows;
  }

  // where a tile sits in this.tiles
  index(col, row) {
    return (row - this.top) * this.cols + (col - this.left);
  }

  // the tile type at a column and row (its settings from tiles.js),
  // or null if it's off the map or empty
  get(col, row) {
    if (!this.inside(col, row)) return null;
    return TILE_TYPES[this.tiles[this.index(col, row)]] ?? null;
  }

  // name is a tile's name (TILE_TYPES in tiles.js), or null to empty the tile (nothing there, like
  // off the map)
  set(col, row, name) {
    if (name !== null && !TILE_TYPES[name]) {
      console.warn(`There's no tile called "${name}". Make it with + New tile in the map editor's Tiles tab`);
      return;
    }
    if (this.inside(col, row)) this.tiles[this.index(col, row)] = name;
  }

  // the smallest rectangle holding every tile that isn't empty: { left, top, right, bottom }, the
  // first and last column and row. null if every tile is empty. the map editor won't resize a map
  // smaller than this
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

  // makes the map cols x rows, with its top left tile at left, top. every tile stays where it is in
  // the world, new space is empty, and tiles, objects, enemies, npcs and warps on any part that's gone are dropped
  resize(left, top, cols, rows) {
    const tiles = new Array(cols * rows).fill(null);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // this.inside() and this.index() still go by the old size here
        if (this.inside(left + c, top + r)) tiles[r * cols + c] = this.tiles[this.index(left + c, top + r)];
      }
    }
    Object.assign(this, { left, top, cols, rows, tiles });

    // now inside() goes by the new size
    this.objects = this.objects.filter((obj) => this.inside(obj.col, obj.row));
    for (const info of Object.values(SPAWN_KINDS)) {
      this[info.list] = this[info.list].filter((spawn) => this.inside(spawn.col, spawn.row));
    }
    this.warps = this.warps.filter((warp) => this.inside(warp.col, warp.row));
    // index() gives different numbers now the size has changed, so solidCells has to be redone
    this.updateSolidCells();
  }

  // off the map and empty tiles count as solid, so nothing can walk out of the world or into a hole.
  // so do tiles with a solid object on them. (get() only finds a tile when it's on the map, so
  // index() is safe to use after it)
  isSolid(col, row) {
    const type = this.get(col, row);
    return !type || type.solid || this.solidCells.has(this.index(col, row));
  }

  // puts the player's spawn point on a tile: their feet in the middle of it.
  // spawn is the player's centre, which is above their feet (standingOnTile() is in character.js)
  setSpawnTile(col, row) {
    this.spawn = standingOnTile(PLAYER, col, row);
  }

  // ---------- objects ----------

  // places an object (a name from objects.js) with its top left corner on col, row
  addObject(type, col, row) {
    if (!OBJECT_TYPES[type]) {
      console.warn(`There's no object called "${type}", add it in objects.js`);
      return;
    }
    const obj = { type, col, row };
    this.objects.push(obj);
    // only this object's tiles need adding, rather than going through every object again
    this.markSolid(obj);
  }

  // does this object cover this tile?
  covers(obj, col, row) {
    const type = OBJECT_TYPES[obj.type];
    return col >= obj.col && col < obj.col + type.width &&
           row >= obj.row && row < obj.row + type.height;
  }

  // every object covering this tile
  objectsAt(col, row) {
    return this.objects.filter((obj) => this.covers(obj, col, row));
  }

  // removes every object covering this tile. gives back true if there were any
  removeObjectsAt(col, row) {
    const before = this.objects.length;
    this.objects = this.objects.filter((obj) => !this.covers(obj, col, row));
    if (this.objects.length === before) return false;
    this.updateSolidCells();
    return true;
  }

  // ---------- where characters start ----------
  // kind is 'enemy' or 'npc' (see SPAWN_KINDS at the top of this file)

  // a character (a name from enemies.js or npcs.js) will start standing on col, row.
  // e.g. map.addSpawn('npc', 'villager', 3, -2)
  addSpawn(kind, type, col, row) {
    const info = SPAWN_KINDS[kind];
    if (!info.types[type]) {
      console.warn(`There's no ${kind} called "${type}", add it in ${info.file}`);
      return;
    }
    this[info.list].push({ type, col, row });
  }

  spawnsAt(kind, col, row) {
    return this[SPAWN_KINDS[kind].list].filter((spawn) => spawn.col === col && spawn.row === row);
  }

  // removes every spawn of this kind on this tile. gives back true if there were any
  removeSpawnsAt(kind, col, row) {
    const list = SPAWN_KINDS[kind].list;
    const before = this[list].length;
    this[list] = this[list].filter((spawn) => spawn.col !== col || spawn.row !== row);
    return this[list].length !== before;
  }

  // ---------- warps ----------
  // there's at most one warp on a tile, and each warp on a map has its own name (see warps.js).
  // they're added by pushing onto this.warps

  // the warp on this tile, or null
  warpAt(col, row) {
    return this.warps.find((warp) => warp.col === col && warp.row === row) ?? null;
  }

  // the warp with this name, or null
  warp(name) {
    return this.warps.find((warp) => warp.name === name) ?? null;
  }

  // removes the warp on this tile. gives back true if there was one
  removeWarpAt(col, row) {
    const warp = this.warpAt(col, row);
    this.warps = this.warps.filter((other) => other !== warp);
    return warp !== null;
  }

  // ---------- solid objects ----------

  // works out solidCells from scratch. after removing objects, a tile might still be covered by
  // another solid object, so it's simplest to go through them all again
  updateSolidCells() {
    this.solidCells.clear();
    for (const obj of this.objects) this.markSolid(obj);
  }

  // adds the tiles a solid object covers to solidCells. any part hanging off the edge of the map
  // is skipped: off the map is solid anyway, and index() only works for tiles on the map
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

  // which column / row a world position is in
  colAt(x) {
    return Math.floor(x / TILE);
  }

  rowAt(y) {
    return Math.floor(y / TILE);
  }

  // the edges of the whole map, in world positions
  bounds() {
    return {
      left: this.left * TILE,
      top: this.top * TILE,
      right: (this.left + this.cols) * TILE,
      bottom: (this.top + this.rows) * TILE,
    };
  }

  // ---------- collision ----------
  // a "box" is { x, y, w, h }: top left corner and size, in world positions

  // how far a box can move sideways (dx) before it's stopped flush against a solid tile. characters
  // move across with this then down with moveAlongY(), which is what lets them slide along a wall
  // when walking into it at an angle, instead of sticking to it (walk() in character.js). only checks the column its leading edge ends up in,
  // so it relies on nothing moving more than a tile in one frame (MAX_DT in config.js keeps it small)
  moveAlongX(box, dx) {
    if (dx === 0) return 0;

    // the rows the box covers, top to bottom
    const firstRow = this.rowAt(box.y);
    const lastRow = this.lastCovered(box.y + box.h);
    // the column the front edge would move into
    const col = dx > 0 ? this.lastCovered(box.x + box.w + dx) : this.colAt(box.x + dx);

    for (let row = firstRow; row <= lastRow; row++) {
      if (this.isSolid(col, row)) {
        // stop flush against it: our right edge on its left side, or our left edge on its right side
        return dx > 0 ? col * TILE - (box.x + box.w) : (col + 1) * TILE - box.x;
      }
    }
    return dx;
  }

  // same as moveAlongX, turned on its side
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

  // the last column (or row) something reaches, given where its far edge is.
  // an edge sitting exactly on a tile boundary (e.g. x = 64) hasn't gone into the next tile yet,
  // which is why this isn't just colAt()
  lastCovered(edge) {
    return Math.ceil(edge / TILE) - 1;
  }

  // ---------- drawing ----------

  // uses world positions, so it goes between camera.begin() and camera.end().
  // only draws what's on screen, so a huge map costs the same as a small one
  draw(camera) {
    this.drawTiles(camera);
    this.drawObjects(camera);
  }

  // tiles are drawn straight onto screen pixels, rather than through the camera's zoom like
  // everything else. at a zoom like 1.35 (e.g. talking to someone) tile edges would land partway
  // through a pixel, and the browser softens those edge pixels by blending them with what's behind,
  // which shows up as a faint grid across the ground. so instead each tile edge is worked out on
  // screen and rounded to a whole pixel, and neighbouring tiles share exactly the same edge:
  // no gaps, no overlap, nothing softened, at any zoom.
  //
  // tiles without an image are drawn in runs: a row of neighbouring tiles of the same colour is
  // one rect instead of one each. it looks exactly the same (they'd share edges anyway), but a big
  // field of grass is a handful of rects rather than thousands, which matters when zoomed out.
  //
  // dual grid tiles (dualGrid in tiles.json) are skipped in the first go, then drawn over the top on
  // the second grid, half a tile across and down (drawDualCorner() in dualgrid.js). one without its
  // pieces (no texture, or it didn't load) has no dualTiles, so it's drawn in the first go in its colour
  drawTiles(camera) {
    const view = camera.view();
    const firstCol = Math.max(this.left, this.colAt(view.left));
    const lastCol = Math.min(this.left + this.cols - 1, this.colAt(view.right));
    const firstRow = Math.max(this.top, this.rowAt(view.top));
    const lastRow = Math.min(this.top + this.rows - 1, this.rowAt(view.bottom));

    // the real screen can have more than one pixel per game pixel (pixelDensity() is 2 on most high
    // resolution screens), so edges are rounded to those real pixels
    const density = pixelDensity();
    const toPixel = (value) => Math.round(value * density) / density;

    // where every half tile's edge lands on screen, from half a tile before the first column to half
    // a tile after the last (the dual grid pieces there hang half off). x(2 * col) is a column's left
    // edge and x(2 * col + 1) its middle, which is where dual grid pieces start and end. everything
    // uses these same rounded edges, so the two grids line up exactly with no gaps or overlap
    const xs = [];
    for (let half = 2 * firstCol - 1; half <= 2 * lastCol + 3; half++) xs.push(toPixel(camera.drawnPosition(half * TILE / 2, 0).x));
    const ys = [];
    for (let half = 2 * firstRow - 1; half <= 2 * lastRow + 3; half++) ys.push(toPixel(camera.drawnPosition(0, half * TILE / 2).y));
    // an edge by its half tile number. xs[0] is half number 2 * firstCol - 1, so taking that away
    // gives its place in xs
    const x = (half) => xs[half - 2 * firstCol + 1];
    const y = (half) => ys[half - 2 * firstRow + 1];

    // draw in screen positions for this part: resetMatrix() undoes the camera's move and zoom,
    // and pop() puts them back for everything drawn after
    push();
    resetMatrix();
    noStroke();
    for (let row = firstRow; row <= lastRow; row++) {
      const top = y(2 * row);
      const h = y(2 * row + 2) - top;
      // the tile type at a column on this row. the columns are already limited to the map, so this
      // skips get()'s is-it-on-the-map check. undefined for an empty tile
      const rowStart = this.index(this.left, row) - this.left;
      const typeAt = (col) => TILE_TYPES[this.tiles[rowStart + col]];

      for (let col = firstCol; col <= lastCol; col++) {
        const type = typeAt(col);
        // empty, nothing to draw (the background shows through). dual grid tiles come after
        if (!type || type.dualTiles) continue;
        const left = x(2 * col);
        if (type.img) {
          image(type.img, left, top, x(2 * col + 2) - left, h);
          continue;
        }
        // carry on along the row while the next tile is the same, then draw them all as one rect
        let end = col;
        while (end < lastCol && typeAt(end + 1) === type) end++;
        fill(type.fill);
        rect(left, top, x(2 * end + 2) - left, h);
        col = end;
      }
    }

    // every corner where four tiles meet, including the far edges of the last column and row (dualgrid.js)
    for (let row = firstRow; row <= lastRow + 1; row++) {
      for (let col = firstCol; col <= lastCol + 1; col++) {
        drawDualCorner(this, col, row, x, y);
      }
    }
    pop();
  }

  // in the order they were placed, so later ones are drawn on top
  drawObjects(camera) {
    const view = camera.view();
    for (const obj of this.objects) {
      const type = OBJECT_TYPES[obj.type];
      const x = obj.col * TILE;
      const y = obj.row * TILE;
      const w = type.width * TILE;
      const h = type.height * TILE;
      // off screen, skip it
      if (x > view.right || x + w < view.left || y > view.bottom || y + h < view.top) continue;

      if (type.img) {
        image(type.img, x, y, w, h);
      } else {
        // placeholder: a rounded box a little smaller than its tiles, so it looks like it's
        // sitting on them rather than being part of the floor
        fill(type.fill);
        stroke(0, 0, 0, 90);
        strokeWeight(2);
        rect(x + 3, y + 3, w - 6, h - 6, 5);
        noStroke();
      }
    }
  }
}
