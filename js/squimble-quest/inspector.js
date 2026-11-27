// the texture inspector: point at the map and see what's drawn there. turn it on with U in dev mode or
// the editor, or the dev menu's Textures tick (DEV_OVERLAYS in debug.js). it shows the tile under the
// mouse and its picture, and for dual grid tiles (dualgrid.js) the corner nearest the mouse: the four
// tiles round it, which piece each quarter is drawn from, which whole variant, and where those are in
// the tileset. it gets that from drawDualCorner() itself, so it's always what the game really drew

// sizes in screen px. view is how big the enlarged piece or picture is drawn, sheet the most the
// tileset is drawn across (it's scaled by whole numbers so its pixels stay square)
const INSPECTOR = { w: 286, pad: 10, line: 16, view: 96, sheet: 128 };
// each piece drawn at the corner gets one, on its line, its outline in the tileset, and its quarters
const INSPECTOR_COLOURS = ['#ffd23f', '#7ec8ff', '#ff6b6b', '#7bd88f'];
const QUARTER_NAMES = ['up left', 'up right', 'down left', 'down right'];

const TextureInspector = {
  // the tile under the mouse and the corner nearest it, or null off the map. aim is in world px
  look(map, aim) {
    if (!aim) return null;
    const col = map.colAt(aim.x);
    const row = map.rowAt(aim.y);
    const tile = map.get(col, row);
    // the corner nearest the mouse: corner col, row is the top left of tile col, row
    const corner = { col: Math.round(aim.x / TILE), row: Math.round(aim.y / TILE) };
    const found = [];
    drawDualCorner(map, corner.col, corner.row, null, null, found); // dualgrid.js
    // quarters drawn from the same piece go together, so each piece gets one line and one outline
    corner.found = [];
    for (const f of found) {
      const same = corner.found.find((g) => g.type === f.type && g.bits === f.bits && g.variant === f.variant);
      if (same) same.quarters.push(...f.quarters);
      else corner.found.push({ ...f, quarters: [...f.quarters] });
    }
    corner.around = [map.get(corner.col - 1, corner.row - 1), map.get(corner.col, corner.row - 1), map.get(corner.col - 1, corner.row), map.get(corner.col, corner.row)];
    return { col, row, tile, corner };
  },

  // outlines on the map, in world positions (inside camera.begin/end): the tile, and the corner's
  // piece, which hangs half a tile over each of its four tiles, with its quarters
  drawOnMap(map, aim) {
    const seen = this.look(map, aim);
    if (!seen) return;
    noFill();
    strokeWeight(1 / gameCamera.zoom);
    stroke(255, 255, 255, 160);
    rect(seen.col * TILE, seen.row * TILE, TILE, TILE);
    const { col, row, found } = seen.corner;
    if (found.length === 0) return;
    stroke(INSPECTOR_COLOURS[0]);
    rect((col - 0.5) * TILE, (row - 0.5) * TILE, TILE, TILE);
    line(col * TILE, (row - 0.5) * TILE, col * TILE, (row + 0.5) * TILE);
    line((col - 0.5) * TILE, row * TILE, (col + 0.5) * TILE, row * TILE);
  },

  // the panel, in screen positions, in the top right (left of the editor's dock while it's open)
  draw(map, aim) {
    const seen = this.look(map, aim);
    if (!seen) return;
    const { w, pad, line: lineH, view } = INSPECTOR;
    const C = EDITOR_COLOURS; // editor.js
    const x = GAME_W - (Editor.active ? EDITOR_LAYOUT.dockWidth : 0) - 8 - w;
    const top = (Editor.active ? EDITOR_LAYOUT.toolbarHeight : 0) + 8;

    // the words, as [text, colour, swatch], then the pictures under them
    const lines = [];
    const add = (words, colour = C.text, swatch = null) => lines.push([words, colour, swatch]);
    const { tile, corner } = seen;
    add(`Tile (${seen.col}, ${seen.row})  ${tile ? tile.name : 'empty'}`);
    if (tile && !tile.dualTiles) add(tile.img ? `  ${this.pictureName(tile, seen.col, seen.row)}` : `  no picture, its colour ${tile.colour}`, C.dimText);
    if (tile?.dualTiles) add(`  dual grid, ${tile.texture}`, C.dimText);
    if (corner.found.length > 0) {
      add(`Corner (${corner.col}, ${corner.row})`);
      corner.around.forEach((t, i) => {
        const cut = t && !t.dualTiles && corner.found.some((f) => !blendsOnto(t, f.type)) ? ', hides its quarter' : '';
        add(`  ${QUARTER_NAMES[i]}  ${t ? t.name : 'off the map'}${cut}`, C.dimText);
      });
      // each piece, then which quarters it's for (when it isn't all of them) and which variant
      corner.found.forEach((f, n) => {
        add(`${f.type.name}  ${f.bits.toString(2).padStart(4, '0')}  ${DUAL_PIECE_NAMES[f.bits]}`, C.text, INSPECTOR_COLOURS[n % 4]);
        const notes = [];
        if (f.quarters.length < 4) notes.push(`for ${f.quarters.map((q) => QUARTER_NAMES[q]).join(', ')}`);
        if (f.variant !== null && f.type.dualTiles.whole.length > 1) notes.push(`variant ${f.variant + 1} of ${f.type.dualTiles.whole.length}`);
        if (notes.length) add(`    ${notes.join(', ')}`, C.dimText);
      });
    }
    const sheet = corner.found[0]?.type.textureImg ?? null;
    const scale = sheet ? Math.max(1, Math.floor(INSPECTOR.sheet / sheet.width)) : 0;
    const pictureH = tile?.img || corner.found.length > 0 ? Math.max(view, sheet ? sheet.height * scale : 0) + pad : 0;
    const h = pad * 2 + lines.length * lineH + pictureH;

    noStroke();
    fill(C.bar);
    rect(x, top, w, h, 4);
    lines.forEach(([words, colour, swatch], i) => {
      const y = top + pad + i * lineH + lineH / 2;
      let left = x + pad;
      if (swatch) {
        fill(swatch);
        rect(left, y - 4, 8, 8);
        left += 12;
      }
      fill(colour);
      setText(11, BOLD, LEFT, CENTER);
      text(fitText(words, x + w - pad - left), left, y);
    });

    const picTop = top + pad + lines.length * lineH + pad;
    if (corner.found.length > 0) this.drawCorner(corner, x + pad, picTop, sheet, scale);
    else if (tile?.img) {
      this.drawChecker(x + pad, picTop, view);
      image(tileImageAt(tile, seen.col, seen.row), x + pad, picTop, view, view);
    }
  },

  // a normal tile's picture as words: its texture, or which variant or frame it's on here (tiles.js)
  pictureName(tile, col, row) {
    const img = tileImageAt(tile, col, row);
    if (tile.frameImgs.length > 0) return `${tile.texture}, animated (${tile.frameImgs.length + 1} frames)`;
    const i = tile.variantImgs.indexOf(img);
    return i < 0 ? `${tile.texture}${tile.variantImgs.length ? `, variant 1 of ${tile.variantImgs.length + 1}` : ''}` : `${tile.variants[i]}, variant ${i + 2} of ${tile.variantImgs.length + 1}`;
  },

  // see-through shows as a checker, so you can tell it from a dark colour
  drawChecker(x, y, size) {
    noStroke();
    const step = size / 8;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      fill((r + c) % 2 ? '#3a404c' : '#2a2f39');
      rect(x + c * step, y + r * step, step, step);
    }
  },

  // the corner enlarged, each quarter from the piece it's really drawn from and cut quarters crossed
  // out, and next to it the tileset with each piece used outlined in its colour. where two dual grid
  // tiles meet (grass over sand) the tileset is the lower one's
  drawCorner(corner, x, y, sheet, scale) {
    const { view } = INSPECTOR;
    this.drawChecker(x, y, view);
    const half = view / 2;
    for (const f of corner.found) {
      const piece = f.variant !== null ? f.type.dualTiles.whole[f.variant] : f.type.dualTiles[f.bits];
      const size = piece.width / 2;
      for (const q of f.quarters) {
        const across = q % 2;
        const down = Math.floor(q / 2);
        image(piece, x + across * half, y + down * half, half, half, across * size, down * size, size, size);
      }
    }
    // quarters nothing was drawn in, because a wall hides them: crossed out
    stroke(EDITOR_COLOURS.dimText);
    strokeWeight(1);
    for (let q = 0; q < 4; q++) {
      if (corner.found.some((f) => f.quarters.includes(q))) continue;
      const qx = x + (q % 2) * half;
      const qy = y + Math.floor(q / 2) * half;
      line(qx, qy, qx + half, qy + half);
      line(qx + half, qy, qx, qy + half);
    }
    stroke(255, 255, 255, 60);
    line(x + half, y, x + half, y + view);
    line(x, y + half, x + view, y + half);

    if (!sheet) return;
    const sx = x + view + INSPECTOR.pad;
    noStroke();
    fill('#2a2f39');
    rect(sx, y, sheet.width * scale, sheet.height * scale);
    image(sheet, sx, y, sheet.width * scale, sheet.height * scale);
    const size = (sheet.width / 4) * scale;
    noFill();
    strokeWeight(2);
    corner.found.forEach((f, n) => {
      if (f.type.textureImg !== sheet) return;
      const spots = f.type.dualTiles;
      const i = DUAL_TILESET_LAYOUT.indexOf(f.bits);
      const [c, r] = f.variant !== null ? spots.wholeSpots[f.variant] : [i % 4, Math.floor(i / 4)];
      stroke(INSPECTOR_COLOURS[n % 4]);
      rect(sx + c * size + 1, y + r * size + 1, size - 2, size - 2);
    });
  },
};
