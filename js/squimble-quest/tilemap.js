// a map made of tiles: which tile is where, drawing them, and stopping things walking into solid ones.
//
// tile positions are a column and row. tile (0, 0) covers the world from (0, 0) to (32, 32),
// tile (1, 0) is the one to its right, and tile (-1, -1) is up and left of (0, 0).
// in other words: column = floor(world x / TILE), row = floor(world y / TILE)
//
// the map only stores tile names ('grass', 'wall'...). what each one looks like and does
// lives in tiles.js
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

  // the tile type at a column and row (its settings from tiles.js), or null if it's off the map
  get(col, row) {
    if (!this.inside(col, row)) return null;
    return TILE_TYPES[this.tiles[this.index(col, row)]];
  }

  set(col, row, name) {
    if (!TILE_TYPES[name]) {
      console.warn(`There's no tile called "${name}", add it in tiles.js`);
      return;
    }
    if (this.inside(col, row)) this.tiles[this.index(col, row)] = name;
  }

  // fill a rectangle of tiles, w wide and h tall, starting at col, row
  fill(col, row, w, h, name) {
    for (let r = row; r < row + h; r++) {
      for (let c = col; c < col + w; c++) this.set(c, r, name);
    }
  }

  // just the edge of a rectangle, e.g. the walls of a room
  outline(col, row, w, h, name) {
    this.fill(col, row, w, 1, name);          // top
    this.fill(col, row + h - 1, w, 1, name);  // bottom
    this.fill(col, row, 1, h, name);          // left
    this.fill(col + w - 1, row, 1, h, name);  // right
  }

  // off the map counts as solid, so nothing can walk out of the world
  isSolid(col, row) {
    const type = this.get(col, row);
    return !type || type.solid;
  }

  // ---------- world positions ↔ tiles ----------

  // which column / row a world position is in
  colAt(x) {
    return Math.floor(x / TILE);
  }

  rowAt(y) {
    return Math.floor(y / TILE);
  }

  // the tile type at a world position, or null if it's off the map
  typeAt(x, y) {
    return this.get(this.colAt(x), this.rowAt(y));
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

  // tries to move a box by dx, dy, stopping it against solid tiles.
  // gives back how far it really moved, { x, y }. anything that moves (player, enemies later) uses this
  moveBox(box, dx, dy) {
    // x first, then y from wherever x ended up. doing them one at a time is what lets you
    // slide along a wall when walking into it at an angle, instead of sticking to it
    const x = this.moveAlongX(box, dx);
    const y = this.moveAlongY({ ...box, x: box.x + x }, dy);
    return { x, y };
  }

  // how far the box can move sideways. only checks the column its leading edge ends up in,
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
  // only draws the tiles on screen, so a huge map costs the same as a small one
  draw(camera) {
    const view = camera.view();
    const firstCol = Math.max(this.left, this.colAt(view.left));
    const lastCol = Math.min(this.left + this.cols - 1, this.colAt(view.right));
    const firstRow = Math.max(this.top, this.rowAt(view.top));
    const lastRow = Math.min(this.top + this.rows - 1, this.rowAt(view.bottom));

    noStroke();
    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = firstCol; col <= lastCol; col++) {
        const type = this.get(col, row);
        const x = col * TILE;
        const y = row * TILE;
        if (type.img) {
          image(type.img, x, y, TILE, TILE);
        } else {
          fill(type.fill);
          rect(x, y, TILE, TILE);
        }
      }
    }
  }
}
