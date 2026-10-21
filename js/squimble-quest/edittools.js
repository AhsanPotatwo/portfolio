// the map editor's tools (the strip down the left and the Tools menu, editormenu.js), and copying and
// pasting bits of map.
//   Paint      click to place what's picked, or drag to paint tiles with the brush. Shift + drag paints
//              a rectangle of tiles
//   Erase      drag over the map with the brush. starting on an object, character, item, warp or sound
//              block removes those, otherwise it empties tiles (so one drag can't take a table and the
//              floor under it). Shift + drag erases a rectangle the same way
//   Fill       click to fill the patch of the same tile (joined up, down, left or right) with the
//              picked tile. empty patches fill too
//   Rectangle  drag a box to fill with the picked tile
//   Select     drag a box (one tile is fine). Ctrl + C copies what's in it, Ctrl + X cuts it, Delete
//              clears it, Ctrl + A selects the whole map and Escape lets go
//   Pick       click something on the map to pick it in the palette. Alt + click does it with any tool
// the brush (, and .) is how many tiles across Paint and Erase are, 1 to EDIT_TOOLS.maxBrush.
// pasting (Ctrl + V): the copy follows the mouse with its top left on the mouse's tile, and every
// click stamps it, until Escape, right click or another tool. empty tiles in a copy don't paste over
// anything, so it stamps like a sticker. it brings tiles, objects (any that overlap the box),
// characters with their settings, warps, sound blocks and areas that fit inside. pasted warps get a
// name of their own, and warps and sound blocks replace any already on their tile (one per tile). the
// copy lasts until the page reloads, and can go onto another map

const EDIT_TOOLS = { maxBrush: 5 };

// the tools in the order they're shown, each with its name, the KEYS action that picks it (config.js)
// and what it does (the strip's tips)
const EDITOR_TOOLS = [
  { name: 'paint', label: 'Paint', key: 'toolPaint', tip: "Click to place what's picked, or drag to paint tiles. Shift + drag for a rectangle" },
  { name: 'erase', label: 'Erase', key: 'toolErase', tip: 'Drag to remove things, or empty tiles if you start on a bare one. Shift + drag for a rectangle' },
  { name: 'fill', label: 'Fill', key: 'toolFill', tip: 'Click to fill a patch of the same tile with the picked tile' },
  { name: 'rect', label: 'Rectangle', key: 'toolRect', tip: 'Drag a box to fill with the picked tile' },
  { name: 'select', label: 'Select', key: 'toolSelect', tip: 'Drag a box, then copy (Ctrl + C), cut (Ctrl + X) or clear it (Delete)' },
  { name: 'pick', label: 'Pick', key: 'toolPick', tip: 'Click something on the map to pick it. Alt + click does it with any tool' },
];

const EditTools = {
  // a box being dragged out, { kind: 'select', 'paint' or 'erase', from, to, things } (things: an erase
  // box that removes things rather than tiles), or null
  drag: null,
  // the selected box as { left, top, right, bottom } tiles, or null
  selection: null,
  // what Ctrl + C copied (copy()), or null, and whether it's following the mouse to be stamped
  clipboard: null,
  pasting: false,
  // where the mouse was last frame while painting or erasing, so fast drags don't leave gaps, and
  // whether this erase drag removes things (true) or empties tiles (false)
  lastPaint: null,
  erasingThings: false,
  // true from an Alt + click until the button's let go, so the rest of that click doesn't paint
  picking: false,

  // swaps tool (Editor.tool), dropping anything half done
  setTool(name) {
    Editor.tool = name;
    this.drag = null;
    this.pasting = false;
  },

  // every frame while nothing covers the map (Editor.update()). over is the tile under the mouse, or
  // null when it's off the game. the right button is Editor.update()'s, apart from cancelling a paste
  update(map, over, aim) {
    const pressed = over && Input.mousePressed('left');
    // a click counts as held for its first frame too, so a quick one that's let go within a frame
    // still paints
    const held = Input.mouseHeld('left') || Boolean(pressed);
    if (this.pasting) {
      if (pressed) this.stamp(map, over);
      if (over && Input.mousePressed('right')) this.pasting = false;
      return;
    }
    if (this.picking) {
      this.picking = held;
      return;
    }
    if (pressed && Input.alt) {
      this.pickAt(map, over);
      this.picking = true;
      return;
    }
    if (this.drag) {
      if (over) this.drag.to = over;
      if (!held) this.finishDrag(map);
      return;
    }

    const tool = Editor.tool;
    const picked = Editor.selected;
    const tile = picked.kind === 'tile' && TILE_TYPES[picked.name];
    if (pressed) {
      if (tool === 'pick') return this.pickAt(map, over);
      if (tool === 'select') {
        this.drag = { kind: 'select', from: over, to: over };
        return;
      }
      if (tool === 'fill') return tile ? this.fill(map, over.col, over.row, picked.name) : showMessage('Fill paints tiles, so pick a tile first');
      if (tool === 'rect' || (Input.shift && (tool === 'erase' || (tool === 'paint' && tile)))) {
        if (tool !== 'erase' && !tile) return showMessage('Rectangles paint tiles, so pick a tile first');
        this.drag = { kind: tool === 'erase' ? 'erase' : 'paint', from: over, to: over, things: tool === 'erase' && Editor.thingsAt(map, over.col, over.row) };
        return;
      }
      // one per click, using the picked tab's place() (EDITOR_TABS in editor.js)
      if (tool === 'paint' && !tile) {
        EDITOR_TABS.find((t) => t.kind === picked.kind).place?.(map, picked.name, over.col, over.row);
        return;
      }
    }

    // painting and erasing keep going while the mouse is held
    const painting = tool === 'paint' && tile && held;
    const erasing = tool === 'erase' && held;
    if (!over || !(painting || erasing)) {
      this.lastPaint = null;
      return;
    }
    // a drag that starts on a thing only removes things, otherwise it only empties tiles
    if (!this.lastPaint) this.erasingThings = erasing && this.brushTiles(over.col, over.row).some(([c, r]) => Editor.thingsAt(map, c, r));
    let removedCharacter = false;
    Editor.forEachTileOnLine(map, this.lastPaint ?? aim, aim, (col, row) => {
      for (const [c, r] of this.brushTiles(col, row)) {
        if (painting) map.set(c, r, picked.name);
        else if (this.erasingThings) removedCharacter = this.removeThingsAt(map, c, r) || removedCharacter;
        else map.set(c, r, null);
      }
    });
    // removed characters disappear straight away
    if (removedCharacter) spawnCharacters();
    this.lastPaint = aim;
  },

  // the tiles the brush covers with its middle on col, row
  brushTiles(col, row) {
    const size = Editor.brush;
    const start = -Math.floor((size - 1) / 2);
    const tiles = [];
    for (let r = start; r < start + size; r++) {
      for (let c = start; c < start + size; c++) tiles.push([col + c, row + r]);
    }
    return tiles;
  },

  // removes every object covering the tile, and the characters, items, warp and sound block on it.
  // gives back whether a character went (they need making again)
  removeThingsAt(map, col, row) {
    map.removeObjectsAt(col, row);
    map.removeWarpAt(col, row);
    map.removeSoundAt(col, row);
    const items = Editor.dropsAt(map, col, row);
    map.drops = map.drops.filter((drop) => !items.includes(drop));
    let removedCharacter = false;
    for (const kind of Object.keys(SPAWN_KINDS)) {
      if (map.removeSpawnsAt(kind, col, row)) removedCharacter = true;
    }
    return removedCharacter;
  },

  // fills the patch of tiles joined to col, row that are the same as it (empty counts) with `name`
  fill(map, col, row, name) {
    if (!map.inside(col, row)) return;
    const from = map.tiles[map.index(col, row)];
    if (from === name) return;
    const todo = [[col, row]];
    while (todo.length > 0) {
      const [c, r] = todo.pop();
      if (!map.inside(c, r) || map.tiles[map.index(c, r)] !== from) continue;
      map.tiles[map.index(c, r)] = name;
      todo.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
    }
  },

  // a box from one tile to another, either way round, as { left, top, right, bottom }
  boxBetween(from, to) {
    return { left: Math.min(from.col, to.col), top: Math.min(from.row, to.row), right: Math.max(from.col, to.col), bottom: Math.max(from.row, to.row) };
  },

  // the box cut down to the map, or null if none of it's on the map
  onMap(map, box) {
    const left = Math.max(box.left, map.left);
    const top = Math.max(box.top, map.top);
    const right = Math.min(box.right, map.left + map.cols - 1);
    const bottom = Math.min(box.bottom, map.top + map.rows - 1);
    return left <= right && top <= bottom ? { left, top, right, bottom } : null;
  },

  // runs action(col, row) for every tile in a box
  eachTile(box, action) {
    for (let row = box.top; row <= box.bottom; row++) {
      for (let col = box.left; col <= box.right; col++) action(col, row);
    }
  },

  // the mouse was let go after dragging out a box
  finishDrag(map) {
    const { kind, from, to, things } = this.drag;
    this.drag = null;
    const box = this.onMap(map, this.boxBetween(from, to));
    if (kind === 'select') {
      this.selection = box;
      return;
    }
    if (!box) return;
    if (kind === 'paint') {
      this.eachTile(box, (col, row) => map.set(col, row, Editor.selected.name));
    } else if (things) {
      let removedCharacter = false;
      this.eachTile(box, (col, row) => { removedCharacter = this.removeThingsAt(map, col, row) || removedCharacter; });
      if (removedCharacter) spawnCharacters();
    } else {
      this.eachTile(box, (col, row) => map.set(col, row, null));
    }
  },

  // picks whatever's on the tile in the palette, top first: a character, an object, an item on the
  // ground, a warp, a sound block, then the tile. an empty tile turns Erase on. tools that can't use
  // what was picked go back to Paint
  pickAt(map, { col, row }) {
    const enemy = map.spawnsAt('enemy', col, row)[0];
    const npc = map.spawnsAt('npc', col, row)[0];
    const obj = map.objectsAt(col, row).at(-1);
    const drop = Editor.dropsAt(map, col, row)[0];
    const sound = map.soundAt(col, row);
    const tile = map.get(col, row);
    let thing = null;
    if (enemy) thing = { kind: 'enemy', name: enemy.type };
    else if (npc) thing = { kind: 'npc', name: npc.type };
    else if (obj) thing = { kind: 'object', name: obj.type };
    else if (drop) thing = { kind: drop.item.type.category, name: drop.item.type.name };
    else if (map.warpAt(col, row)) thing = { kind: 'trigger', name: 'warp' };
    else if (sound) thing = { kind: 'sound', name: sound.sound };
    else if (tile) thing = { kind: 'tile', name: tile.name };
    if (!thing || !EDITOR_CATALOGUES[thing.kind]?.[thing.name]) {
      if (map.inside(col, row) && !tile) this.setTool('erase');
      return;
    }
    Editor.pick(thing);
    Editor.showTab(thing.kind);
    Editor.palette.reveal(thing.name);
    const tileOnly = Editor.tool === 'fill' || Editor.tool === 'rect';
    if (['pick', 'erase', 'select'].includes(Editor.tool) || (tileOnly && thing.kind !== 'tile')) this.setTool('paint');
  },

  // ---------- copy and paste ----------

  // copies everything in the selection (see the top of this file for what comes along)
  copy(map) {
    const box = this.selection && this.onMap(map, this.selection);
    if (!box) return showMessage('Select something first (the Select tool, or Ctrl + A for all of it)');
    const inBox = ({ col, row }) => col >= box.left && col <= box.right && row >= box.top && row <= box.bottom;
    const moved = (thing) => ({ ...JSON.parse(JSON.stringify(thing)), col: thing.col - box.left, row: thing.row - box.top });
    const tiles = [];
    this.eachTile(box, (col, row) => tiles.push(map.tiles[map.index(col, row)]));
    const overlaps = (obj) => {
      const type = OBJECT_TYPES[obj.type];
      return obj.col <= box.right && obj.col + type.width - 1 >= box.left && obj.row <= box.bottom && obj.row + type.height - 1 >= box.top;
    };
    this.clipboard = {
      cols: box.right - box.left + 1,
      rows: box.bottom - box.top + 1,
      tiles,
      objects: map.objects.filter(overlaps).map(({ type, col, row }) => moved({ type, col, row })),
      enemySpawns: map.enemySpawns.filter(inBox).map(moved),
      npcSpawns: map.npcSpawns.filter(inBox).map(moved),
      warps: map.warps.filter(inBox).map(moved),
      sounds: map.sounds.filter(inBox).map(moved),
      areas: map.areas.filter((area) => inBox(area) && area.col + area.cols - 1 <= box.right && area.row + area.rows - 1 <= box.bottom).map(moved),
    };
    showMessage(`Copied ${this.clipboard.cols} × ${this.clipboard.rows} tiles. Ctrl + V to paste`);
  },

  cut(map) {
    this.copy(map);
    if (this.clipboard && this.selection) this.clearSelection(map);
  },

  // empties the selected tiles and removes everything copy() would take
  clearSelection(map) {
    const box = this.selection && this.onMap(map, this.selection);
    if (!box) return;
    const inBox = ({ col, row }) => col >= box.left && col <= box.right && row >= box.top && row <= box.bottom;
    let removedCharacter = false;
    this.eachTile(box, (col, row) => {
      map.set(col, row, null);
      removedCharacter = this.removeThingsAt(map, col, row) || removedCharacter;
    });
    map.areas = map.areas.filter((area) => !(inBox(area) && area.col + area.cols - 1 <= box.right && area.row + area.rows - 1 <= box.bottom));
    if (removedCharacter) spawnCharacters();
  },

  paste() {
    if (!this.clipboard) return showMessage('Nothing copied yet. Select something and press Ctrl + C');
    this.drag = null;
    this.pasting = true;
  },

  // puts the copy on the map with its top left at col, row
  stamp(map, { col, row }) {
    const copy = this.clipboard;
    copy.tiles.forEach((name, i) => {
      const tile = resolveTileName(name); // a tile renamed since it was copied (tiles.js)
      if (tile !== null && TILE_TYPES[tile]) map.set(col + (i % copy.cols), row + Math.floor(i / copy.cols), tile);
    });
    for (const obj of copy.objects) {
      if (OBJECT_TYPES[obj.type]) Editor.placeObject(map, obj.type, col + obj.col, row + obj.row);
    }
    for (const [kind, info] of Object.entries(SPAWN_KINDS)) {
      for (const spawn of copy[info.list]) {
        const at = { col: col + spawn.col, row: row + spawn.row };
        if (!info.types[spawn.type] || map.isSolid(at.col, at.row) || map.spawnsAt(kind, at.col, at.row).some((other) => other.type === spawn.type)) continue;
        map.addSpawn(kind, spawn.type, at.col, at.row, JSON.parse(JSON.stringify(spawn)));
      }
    }
    for (const warp of copy.warps) {
      const at = { col: col + warp.col, row: row + warp.row };
      if (!map.inside(at.col, at.row)) continue;
      map.removeWarpAt(at.col, at.row);
      // warp names are unique on a map, so a copy gets a number on the end
      let name = warp.name;
      for (let n = 2; map.warp(name); n++) name = `${warp.name}-${n}`;
      map.warps.push({ ...warp, ...at, name });
    }
    for (const block of copy.sounds) {
      const at = { col: col + block.col, row: row + block.row };
      if (!map.inside(at.col, at.row)) continue;
      map.removeSoundAt(at.col, at.row);
      map.sounds.push({ ...JSON.parse(JSON.stringify(block)), ...at });
    }
    for (const area of copy.areas) map.areas.push({ ...area, col: col + area.col, row: row + area.row });
    spawnCharacters();
  },

  selectAll(map) {
    this.selection = { left: map.left, top: map.top, right: map.left + map.cols - 1, bottom: map.top + map.rows - 1 };
  },

  // Escape: stops pasting, or a box being dragged, or lets go of the selection. gives back whether
  // there was anything to stop
  escape() {
    if (this.pasting || this.drag) {
      this.pasting = false;
      this.drag = null;
      return true;
    }
    if (this.selection) {
      this.selection = null;
      return true;
    }
    return false;
  },

  // ---------- drawing ----------

  // world positions, from Editor.drawCursor(). the selection, a box being dragged, the copy being
  // pasted, and the brush or tile the tool would change. over is the tile under the mouse or null
  draw(map, px, over) {
    if (this.selection) this.drawBox(this.selection, '#ffffff', px, true);
    if (this.drag) {
      const colour = this.drag.kind === 'erase' ? EDITOR_COLOURS.erase : this.drag.kind === 'select' ? '#ffffff' : EDITOR_COLOURS.picked;
      this.drawBox(this.boxBetween(this.drag.from, this.drag.to), colour, px, this.drag.kind === 'select');
      return;
    }
    if (!over || UI.hovered) return;
    if (this.pasting) return this.drawCopy(over, px);
    const tool = Editor.tool;
    if (tool === 'paint' && Editor.selected.kind === 'tile' || tool === 'erase') {
      const tiles = this.brushTiles(over.col, over.row);
      const [left, top] = tiles[0];
      const [right, bottom] = tiles.at(-1);
      noFill();
      Editor.outline(left * TILE, top * TILE, (right - left + 1) * TILE, (bottom - top + 1) * TILE, tool === 'erase' ? EDITOR_COLOURS.erase : '#ffffff', px);
    }
  },

  // a box of tiles with a dark and a light edge. dashed ones crawl along, like a selection does in
  // a paint program, and show their size
  drawBox(box, colour, px, dashed) {
    const x = box.left * TILE;
    const y = box.top * TILE;
    const w = (box.right - box.left + 1) * TILE;
    const h = (box.bottom - box.top + 1) * TILE;
    noStroke();
    fill(255, 255, 255, 18);
    rect(x, y, w, h);
    noFill();
    stroke(0, 0, 0, 170);
    strokeWeight(3 * px);
    rect(x, y, w, h);
    stroke(colour);
    strokeWeight(1.5 * px);
    if (dashed) {
      drawingContext.setLineDash([5 * px, 4 * px]);
      drawingContext.lineDashOffset = -(millis() / 60) * px;
    }
    rect(x, y, w, h);
    drawingContext.setLineDash([]);
    // its size, in the top left
    const size = `${box.right - box.left + 1} × ${box.bottom - box.top + 1}`;
    noStroke();
    setText(11 * px, BOLD, LEFT, BOTTOM);
    fill(0, 0, 0, 170);
    rect(x, y - 15 * px, textWidth(size) + 8 * px, 14 * px, 2 * px);
    fill(255);
    text(size, x + 4 * px, y - 2 * px);
  },

  // the copy, faded, with its top left on the mouse's tile
  drawCopy(over, px) {
    const copy = this.clipboard;
    push();
    drawingContext.globalAlpha *= 0.6;
    copy.tiles.forEach((name, i) => {
      const type = TILE_TYPES[resolveTileName(name)];
      if (type) drawTypeArt(type, (over.col + (i % copy.cols)) * TILE, (over.row + Math.floor(i / copy.cols)) * TILE, TILE, TILE);
    });
    for (const obj of copy.objects) {
      const type = OBJECT_TYPES[obj.type];
      if (type) drawTypeArt(type, (over.col + obj.col) * TILE + 3, (over.row + obj.row) * TILE + 3, type.width * TILE - 6, type.height * TILE - 6, 5);
    }
    for (const [kind, info] of Object.entries(SPAWN_KINDS)) {
      for (const spawn of copy[info.list]) {
        const type = info.types[spawn.type];
        if (!type) continue;
        const body = Editor.characterBodyOnTile(type, over.col + spawn.col, over.row + spawn.row);
        drawTypeArt(type, body.x, body.y, body.w, body.h, 3);
      }
    }
    pop();
    noFill();
    this.drawBox({ left: over.col, top: over.row, right: over.col + copy.cols - 1, bottom: over.row + copy.rows - 1 }, EDITOR_COLOURS.picked, px, false);
  },
};
