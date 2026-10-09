// a tile map: what's where, drawing it, and bumping into solid tiles.
// tile (col, row) covers the world from (col * TILE, row * TILE) up to the next tile, so
// col = floor(x / TILE) and row = floor(y / TILE). tile (0, 0) goes from 0 to 32, and (-1, -1) is up
// and to the left of it.
// it only stores tile names ('grass'), and what they look like and do is in TILE_TYPES (tiles.js). it
// also holds the objects (objects.js), where enemies and npcs start, and the warps (warps.js)

// the kinds of character you can place: which list they're in on the map, their catalogue, the file
// they're defined in, and their key in map files. saving, loading, resizing and erasing in the editor
// all go through this. a new kind (animals, say) needs a line here, its list in the constructor, an
// editor tab (EDITOR_TABS in editor.js), and a global list that sketch.js makes, updates and draws
// like enemies and npcs
const SPAWN_KINDS = {
  enemy: { list: 'enemySpawns', types: ENEMY_TYPES, fileKey: 'enemies' },
  npc:   { list: 'npcSpawns',   types: NPC_TYPES,   fileKey: 'npcs' },
};

class TileMap {
  // left, top: the column and row of the top left tile (can be negative). cols, rows: the size.
  // every tile starts as fillWith
  constructor(left, top, cols, rows, fillWith) {
    this.left = left;
    this.top = top;
    this.cols = cols;
    this.rows = rows;
    // one row after another. index() finds where a tile is
    this.tiles = new Array(cols * rows).fill(fillWith);

    // its name in MAPS (maps.js), set by getMap()
    this.name = '';
    // where the player starts (their middle), in world positions
    this.spawn = { x: 0, y: 0 };

    // each { type, col, row } (objects.js)
    this.objects = [];
    // the index() of every tile under a solid object, so collision checks are quick. addObject() and
    // removeObjectsAt() keep it up to date
    this.solidCells = new Set();

    // where characters start, each { type, col, row }: a name from enemies.js or npcs.js and its
    // tile, plus an enemy's ai if one was picked in the editor (ENEMY_AIS). the actual characters
    // get made from these (spawnCharacters() in sketch.js)
    this.enemySpawns = [];
    this.npcSpawns = [];

    // each one is { name, col, row, to, toWarp, activate, enemies } (explained at the top of warps.js)
    this.warps = [];
    // sound blocks, each { sound, col, row, activate } (explained at the top of soundblocks.js)
    this.sounds = [];

    // { enemies, npcs } as they were when you last left (loadMap() in sketch.js), so coming back finds
    // them the same. null until you leave it the first time. this is progress, not design: the spawn
    // lists never change, so the editor shows all of them and Export saves all of them
    this.characters = null;
    // items on the ground, each { item, x, y, ready, from, flight } (Drops in inventory.js). this is
    // progress too, so Export doesn't save them, even ones placed in the editor
    this.drops = [];
  }

  // ---------- reading and changing tiles ----------

  inside(col, row) {
    return col >= this.left && col < this.left + this.cols &&
           row >= this.top && row < this.top + this.rows;
  }

  // where the tile is in this.tiles
  index(col, row) {
    return (row - this.top) * this.cols + (col - this.left);
  }

  // the tile type (its tiles.js settings), or null if it's empty or off the map
  get(col, row) {
    if (!this.inside(col, row)) return null;
    return TILE_TYPES[this.tiles[this.index(col, row)]] ?? null;
  }

  // name: a TILE_TYPES name, or null to make it empty
  set(col, row, name) {
    if (name !== null && !TILE_TYPES[name]) {
      console.warn(`There's no tile called "${name}". Make it with New in the map editor's inspector (Tiles tab)`);
      return;
    }
    if (this.inside(col, row)) this.tiles[this.index(col, row)] = name;
  }

  // the box around all the tiles that aren't empty, as { left, top, right, bottom } (first and last
  // col and row), or null if they're all empty. the editor won't resize a map smaller than this
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

  // changes the size to cols x rows, with the top left tile at left, top. tiles stay where they are in
  // the world, any new space is empty, and anything on the parts that got cut off is thrown away
  resize(left, top, cols, rows) {
    const tiles = new Array(cols * rows).fill(null);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // inside() and index() are still using the old size at this point
        if (this.inside(left + c, top + r)) tiles[r * cols + c] = this.tiles[this.index(left + c, top + r)];
      }
    }
    Object.assign(this, { left, top, cols, rows, tiles });

    // now it's the new size
    this.objects = this.objects.filter((obj) => this.inside(obj.col, obj.row));
    for (const info of Object.values(SPAWN_KINDS)) {
      this[info.list] = this[info.list].filter((spawn) => this.inside(spawn.col, spawn.row));
    }
    this.warps = this.warps.filter((warp) => this.inside(warp.col, warp.row));
    this.sounds = this.sounds.filter((block) => this.inside(block.col, block.row));
    // the index() numbers have all changed
    this.updateSolidCells();
  }

  // off-map tiles, empty tiles and tiles under solid objects are solid too, so nothing can leave the
  // world or fall in a hole. (get() only gives back a tile if it's on the map, so index() is safe after)
  isSolid(col, row) {
    const type = this.get(col, row);
    return !type || type.solid || this.solidCells.has(this.index(col, row));
  }

  // can you see from one world point to the other? solid tiles block it unless they're seeThrough
  // (water), and so do empty and off-map ones. objects don't because furniture is low. it checks every
  // quarter of a tile, so it can sneak between two walls touching at a corner. used for enemies'
  // sight (sensePlayer() in enemies.js)
  clearLine(x1, y1, x2, y2) {
    const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (TILE / 4));
    for (let i = 1; i < steps; i++) {
      const type = this.get(this.colAt(x1 + (x2 - x1) * (i / steps)), this.rowAt(y1 + (y2 - y1) * (i / steps)));
      if (!type || (type.solid && !type.seeThrough)) return false;
    }
    return true;
  }

  // puts the spawn so the player's feet are in the middle of the tile. the spawn is their middle,
  // which is above their feet (standingOnTile() in character.js)
  setSpawnTile(col, row) {
    this.spawn = standingOnTile(PLAYER, col, row);
  }

  // ---------- objects ----------

  // type is a name from objects.js, with its top left on col, row
  addObject(type, col, row) {
    if (!OBJECT_TYPES[type]) {
      console.warn(`There's no object called "${type}", add its file to ${DATA_FOLDER}${DATA_KINDS.object}`);
      return;
    }
    const obj = { type, col, row };
    this.objects.push(obj);
    // only marks this object's tiles instead of redoing all of them
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

  // gives true if any got removed
  removeObjectsAt(col, row) {
    const before = this.objects.length;
    this.objects = this.objects.filter((obj) => !this.covers(obj, col, row));
    if (this.objects.length === before) return false;
    this.updateSolidCells();
    return true;
  }

  // ---------- where characters start ----------
  // kind is 'enemy' or 'npc' (SPAWN_KINDS)

  // type is a name from enemies.js or npcs.js, like map.addSpawn('npc', 'villager', 3, -2). extras
  // are optional, used instead of what the kind has in its file: ai, an ENEMY_AIS name (enemies.js,
  // enemies only), voice, a voice's name (VOICES in sound.js, npcs only), and sound, a sound it loops
  // wherever it goes (SOUNDS, either kind). a voice or sound that isn't there is kept, so exporting
  // doesn't lose it, but it's silent. enemies can also have hitParticles and deathParticles, particle
  // effect names (particles.js) or null for none, and wears, item names by EQUIPMENT_SLOTS key
  // (inventory.js) like { head: 'iron-helmet' }
  addSpawn(kind, type, col, row, { ai, voice, sound, follows, hitParticles, deathParticles, wears } = {}) {
    const info = SPAWN_KINDS[kind];
    if (!info.types[type]) {
      console.warn(`There's no ${kind} called "${type}", add its file to ${DATA_FOLDER}${DATA_KINDS[kind]}`);
      return;
    }
    if (ai !== undefined && (kind !== 'enemy' || !(ai in ENEMY_AIS))) {
      console.warn(`There's no enemy ai called "${ai}", so this ${type} uses its own. They're in ENEMY_AIS (enemies.js)`);
      ai = undefined;
    }
    if (voice !== undefined && (kind !== 'npc' || typeof voice !== 'string')) voice = undefined;
    if (voice !== undefined && !VOICES[voice]) console.warn(`An npc uses the voice "${voice}", which isn't in ${SOUND_FILE}, so it's silent`);
    if (typeof sound !== 'string') sound = undefined;
    if (kind !== 'enemy' || typeof follows !== 'boolean') follows = undefined;
    if (sound !== undefined && !SOUNDS[sound]) console.warn(`A ${type} uses the sound "${sound}", which isn't in ${SOUND_FILE}, so it's silent`);
    const spawn = { type, col, row };
    if (ai !== undefined) spawn.ai = ai;
    if (voice !== undefined) spawn.voice = voice;
    if (sound !== undefined) spawn.sound = sound;
    if (follows !== undefined) spawn.follows = follows;
    // these load at the same time as the maps' kinds, so a missing one only shows as missing in the
    // editor, and bursts nothing
    const particles = (name) => (kind === 'enemy' && (name === null || typeof name === 'string') ? name : undefined);
    if (particles(hitParticles) !== undefined) spawn.hitParticles = hitParticles;
    if (particles(deathParticles) !== undefined) spawn.deathParticles = deathParticles;
    // a missing item is kept like a missing sound, so exporting doesn't lose it, but it doesn't show
    if (kind === 'enemy' && wears && typeof wears === 'object') {
      const kept = {};
      for (const [key, name] of Object.entries(wears)) {
        if (!EQUIPMENT_SLOTS.some((slot) => slot.key === key) || typeof name !== 'string') {
          console.warn(`A ${type} wears ${JSON.stringify(name)} on "${key}", which isn't an item name on an EQUIPMENT_SLOTS key (inventory.js), so it's left off`);
          continue;
        }
        if (!ITEM_TYPES[name]) console.warn(`A ${type} wears "${name}", which isn't in ${DATA_FOLDER}${DATA_KINDS.item}, so it doesn't show`);
        kept[key] = name;
      }
      if (Object.keys(kept).length > 0) spawn.wears = kept;
    }
    this[info.list].push(spawn);
  }

  spawnsAt(kind, col, row) {
    return this[SPAWN_KINDS[kind].list].filter((spawn) => spawn.col === col && spawn.row === row);
  }

  // gives true if any got removed
  removeSpawnsAt(kind, col, row) {
    const list = SPAWN_KINDS[kind].list;
    const before = this[list].length;
    this[list] = this[list].filter((spawn) => spawn.col !== col || spawn.row !== row);
    return this[list].length !== before;
  }

  // ---------- warps ----------
  // at most one per tile, and no two on a map with the same name (warps.js). to add one just push it
  // onto this.warps

  // or null
  warpAt(col, row) {
    return this.warps.find((warp) => warp.col === col && warp.row === row) ?? null;
  }

  // or null
  warp(name) {
    return this.warps.find((warp) => warp.name === name) ?? null;
  }

  // gives true if there was one
  removeWarpAt(col, row) {
    const warp = this.warpAt(col, row);
    this.warps = this.warps.filter((other) => other !== warp);
    return warp !== null;
  }

  // ---------- sound blocks ----------
  // at most one per tile (soundblocks.js). to add one just push it onto this.sounds, keeping the keys
  // in the order { sound, col, row, activate } like mapfile.js makes them, so a placed block and a
  // loaded one look exactly the same

  // or null
  soundAt(col, row) {
    return this.sounds.find((block) => block.col === col && block.row === row) ?? null;
  }

  // takes away the block on this tile, if there is one. it doesn't stop a loop the block was playing,
  // which is fine because blocks only get erased in the editor, and that stops every sound when it
  // opens. if blocks ever get removed while playing (a machine you can break, say), stop its voice too:
  // the voice's key is the block (Sound.voices and Sound.stop() in sound.js)
  removeSoundAt(col, row) {
    this.sounds = this.sounds.filter((block) => block.col !== col || block.row !== row);
  }

  // ---------- solid objects ----------

  // rebuilds solidCells from scratch. after removing one, another solid object might still cover the
  // same tile, so it's easier to just redo them all
  updateSolidCells() {
    this.solidCells.clear();
    for (const obj of this.objects) this.markSolid(obj);
  }

  // adds a solid object's tiles to solidCells. skips any bits that are off the map (they're solid
  // anyway, and index() only works on the map)
  markSolid(obj) {
    const type = OBJECT_TYPES[obj.type];
    if (!type.solid) return;
    for (let r = obj.row; r < obj.row + type.height; r++) {
      for (let c = obj.col; c < obj.col + type.width; c++) {
        if (this.inside(c, r)) this.solidCells.add(this.index(c, r));
      }
    }
  }

  // ---------- world positions to tiles and back ----------

  colAt(x) {
    return Math.floor(x / TILE);
  }

  rowAt(y) {
    return Math.floor(y / TILE);
  }

  // the map's edges, in world positions
  bounds() {
    return {
      left: this.left * TILE,
      top: this.top * TILE,
      right: (this.left + this.cols) * TILE,
      bottom: (this.top + this.rows) * TILE,
    };
  }

  // ---------- collision ----------
  // a box is { x, y, w, h }: its top left and size, in world positions

  // how far a box can move dx before it stops right up against a solid tile. characters move along x
  // with this and then y with moveAlongY(), which is what lets them slide along walls (walk() in
  // character.js). it only checks the column the front edge ends up in, so nothing can move more than
  // a tile in one frame (MAX_DT in config.js)
  moveAlongX(box, dx) {
    if (dx === 0) return 0;

    // the rows it covers
    const firstRow = this.rowAt(box.y);
    const lastRow = this.lastCovered(box.y + box.h);
    // the column the front edge moves into
    const col = dx > 0 ? this.lastCovered(box.x + box.w + dx) : this.colAt(box.x + dx);

    for (let row = firstRow; row <= lastRow; row++) {
      if (this.isSolid(col, row)) {
        // right up against it
        return dx > 0 ? col * TILE - (box.x + box.w) : (col + 1) * TILE - box.x;
      }
    }
    return dx;
  }

  // same as moveAlongX but for y
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

  // the last column or row that a far edge reaches into. an edge sitting exactly on a boundary (x = 64)
  // hasn't actually gone into the next tile yet, which is why this isn't just colAt()
  lastCovered(edge) {
    return Math.ceil(edge / TILE) - 1;
  }

  // ---------- drawing ----------

  // world positions (inside camera.begin/end). only draws what's on screen, so it doesn't matter how
  // big the map is
  draw(camera) {
    this.drawTiles(camera);
    this.drawObjects(camera);
  }

  // tiles get drawn in screen pixels instead of going through the camera's zoom. at zooms like 1.35
  // (when talking to someone) the edges would land halfway through a pixel and the browser blends
  // them, which shows a faint grid. so I work out every edge on screen, round it to a whole pixel, and
  // neighbours share the same edge. that means no gaps, overlaps or blurring at any zoom.
  //
  // tiles without a picture get drawn in runs: neighbours on a row with the same colour become one
  // rect (it looks exactly the same), so a field of grass is a handful of rects instead of thousands.
  // that matters when zoomed out.
  //
  // dual grid tiles get skipped in the first pass and drawn afterwards on the half-offset grid
  // (drawDualCorner() in dualgrid.js). one with no dualTiles (no texture, or it hasn't loaded) is
  // drawn in the first pass in its colour instead
  drawTiles(camera) {
    const view = camera.view();
    const firstCol = Math.max(this.left, this.colAt(view.left));
    const lastCol = Math.min(this.left + this.cols - 1, this.colAt(view.right));
    const firstRow = Math.max(this.top, this.rowAt(view.top));
    const lastRow = Math.min(this.top + this.rows - 1, this.rowAt(view.bottom));

    // round to actual device pixels (pixelDensity() is 2 on most high res screens)
    const density = pixelDensity();
    const toPixel = (value) => Math.round(value * density) / density;

    // the screen position of every half tile edge, from half a tile before the first column to half a
    // tile after the last (dual grid pieces hang half off the edge). x(2 * col) is a column's left
    // edge and x(2 * col + 1) is its middle, which is where dual grid pieces start and end. both grids
    // use these numbers so they line up exactly
    const xs = [];
    for (let half = 2 * firstCol - 1; half <= 2 * lastCol + 3; half++) xs.push(toPixel(camera.drawnPosition(half * TILE / 2, 0).x));
    const ys = [];
    for (let half = 2 * firstRow - 1; half <= 2 * lastRow + 3; half++) ys.push(toPixel(camera.drawnPosition(0, half * TILE / 2).y));
    // looks up an edge by its half tile number (xs[0] is half number 2 * firstCol - 1)
    const x = (half) => xs[half - 2 * firstCol + 1];
    const y = (half) => ys[half - 2 * firstRow + 1];

    // screen positions now, since resetMatrix() gets rid of the camera transform until pop()
    push();
    resetMatrix();
    noStroke();
    for (let row = firstRow; row <= lastRow; row++) {
      const top = y(2 * row);
      const h = y(2 * row + 2) - top;
      // the tile type at a column on this row. skips get()'s bounds check because the columns are
      // already clamped to the map. undefined for empty
      const rowStart = this.index(this.left, row) - this.left;
      const typeAt = (col) => TILE_TYPES[this.tiles[rowStart + col]];

      for (let col = firstCol; col <= lastCol; col++) {
        const type = typeAt(col);
        // empty tiles show the background, and dual grid tiles come later
        if (!type || type.dualTiles) continue;
        const left = x(2 * col);
        if (type.img) {
          image(type.img, left, top, x(2 * col + 2) - left, h);
          continue;
        }
        // keep going while the next tile matches, then draw them all as one rect
        let end = col;
        while (end < lastCol && typeAt(end + 1) === type) end++;
        fill(type.fill);
        rect(left, top, x(2 * end + 2) - left, h);
        col = end;
      }
    }

    // every corner where four tiles meet, including along the far edges (dualgrid.js)
    for (let row = firstRow; row <= lastRow + 1; row++) {
      for (let col = firstCol; col <= lastCol + 1; col++) {
        drawDualCorner(this, col, row, x, y);
      }
    }
    pop();
  }

  // in the order they were placed, so later ones go on top
  drawObjects(camera) {
    const view = camera.view();
    for (const obj of this.objects) {
      const type = OBJECT_TYPES[obj.type];
      const x = obj.col * TILE;
      const y = obj.row * TILE;
      const w = type.width * TILE;
      const h = type.height * TILE;
      // skip it if it's off screen
      if (x > view.right || x + w < view.left || y > view.bottom || y + h < view.top) continue;

      if (type.img) {
        image(type.img, x, y, w, h);
      } else {
        // placeholder: a rounded box a bit smaller than its tiles, so it looks like it's sitting on the
        // floor instead of being part of it
        fill(type.fill);
        stroke(0, 0, 0, 90);
        strokeWeight(2);
        rect(x + 3, y + 3, w - 6, h - 6, 5);
        noStroke();
      }
    }
  }
}
