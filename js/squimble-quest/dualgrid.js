// dual grid tiles: ground (grass, dirt, sand) that blends into its neighbours with rounded edges,
// drawn from a tileset. on when a tile has "dualGrid" in tiles.json. all their drawing is here.
//
// maps and the editor don't know: a map still stores 'grass', only drawing changes. dual grid pieces
// sit on a second grid offset half a tile, each where four tiles meet, chosen by which of the four are
// grass, so edges round off without hand-painted edge tiles.
//   DUAL_TILESET_LAYOUT  which piece is where in a tileset
//   dualTilesetProblem() why a picture can't be a tileset, or null (shown by the tile editor)
//   cutDualTileset()     cuts a tileset into pieces; useTexture() (tiles.js) runs it on every new texture
//   drawDualCorner()     draws the pieces at one corner; only drawTiles() (tilemap.js) calls it

// pieces left to right, top row first. each is 4 bits, which of the corner's tiles are this tile:
// up left, up right, down left, down right. e.g. 0b0011 (bottom two) is a top edge piece.
// tiles/dual-grid/grass_tileset.png uses it, so copy and paint over that for a new one
const DUAL_TILESET_LAYOUT = [
  0b0010, 0b0101, 0b1011, 0b0011,
  0b1001, 0b0111, 0b1111, 0b1110,
  0b0100, 0b1100, 0b1101, 0b1010,
  0b0000, 0b0001, 0b0110, 0b1000,
];

// why a p5 image can't be a tileset (words to show), or null. must be a square of 4 x 4 whole pieces
function dualTilesetProblem(sheet) {
  if (sheet.width === sheet.height && sheet.width % 4 === 0) return null;
  return `it's ${sheet.width} x ${sheet.height}, it has to be a square of 4 x 4 pieces, like 64 x 64`;
}

// cuts a tileset (p5 image) into 16 pieces: pieces[bits] per DUAL_TILESET_LAYOUT. null with a warning
// if dualTilesetProblem() objects. label is only for the warning.
// separate pictures because drawing part of a big one can bleed a line of the next piece at some
// zooms (a faint grid)
function cutDualTileset(sheet, label) {
  const problem = dualTilesetProblem(sheet);
  if (problem) {
    console.warn(`Can't use "${label}" as a dual grid tileset: ${problem}. The tile's using its colour instead`);
    return null;
  }
  const size = sheet.width / 4;
  const pieces = [];
  DUAL_TILESET_LAYOUT.forEach((which, i) => {
    pieces[which] = sheet.get((i % 4) * size, Math.floor(i / 4) * size, size, size);
  });
  return pieces;
}

// a corner's four tiles: up left, up right, down left, down right (bit order). reused rather than
// reallocated, since drawDualCorner() runs thousands of times a frame zoomed out
const dualAround = [null, null, null, null];

// draws the dual grid piece(s) at the top left corner of tile col, row. x(half)/y(half) give where
// half tile edges land on screen (drawTiles() in tilemap.js), so pieces line up with normal tiles.
// screen positions, so only drawTiles() calls it
function drawDualCorner(map, col, row, x, y) {
  // null for empty and off-map tiles
  dualAround[0] = map.get(col - 1, row - 1);
  dualAround[1] = map.get(col, row - 1);
  dualAround[2] = map.get(col - 1, row);
  dualAround[3] = map.get(col, row);

  // lowest layer dual grid tile (layer in tiles.js)
  let lowest = null;
  for (const type of dualAround) {
    if (type?.dualTiles && (!lowest || type.layer < lowest.layer)) lowest = type;
  }
  // none here; normal tiles already drew it all
  if (!lowest) return;
  // the first normal tile here that some dual grid tile here blends onto (blendsWith). one none blend
  // onto only meets them in straight lines, so never shows under their edges
  let under = null;
  for (const type of dualAround) {
    if (!type || type.dualTiles || under) continue;
    for (const dual of dualAround) {
      if (dual?.dualTiles && blendsOnto(type, dual)) under = type;
    }
  }

  // piece edges on screen: left/middle/right, top/middle/bottom
  const xs = [x(2 * col - 1), x(2 * col), x(2 * col + 1)];
  const ys = [y(2 * row - 1), y(2 * row), y(2 * row + 1)];

  // a piece covers a quarter of each of the four tiles, with see-through edges. so first the dual grid
  // tiles' quarters get `under`, as if that ground carries on beneath (normal tiles drew their own
  // quarters). with no normal tile, the lowest piece covers all four
  if (under) {
    fill(under.fill);
    for (let i = 0; i < 4; i++) {
      if (!dualAround[i]?.dualTiles) continue;
      // quarter: 0 left/top, 1 right/bottom
      const across = i % 2;
      const down = Math.floor(i / 2);
      const left = xs[across];
      const top = ys[down];
      const w = xs[across + 1] - left;
      const h = ys[down + 1] - top;
      const img = under.img;
      // the matching quarter of its picture: the piece's up left quarter is a tile's bottom right
      if (img) image(img, left, top, w, h, (1 - across) * img.width / 2, (1 - down) * img.height / 2, img.width / 2, img.height / 2);
      else rect(left, top, w, h);
    }
  }

  // each dual grid tile's piece, lowest layer first. a piece covers its own and higher layers'
  // quarters, so higher ones draw over it with no gap
  let type = lowest;
  while (type) {
    // which quarters this piece covers, and the next layer up. a tile it doesn't blend onto counts as
    // covered, so the piece runs straight up to it, but that quarter is cut so the tile still shows
    let which = 0;
    let cut = 0;
    let next = null;
    for (let i = 0; i < 4; i++) {
      const other = dualAround[i];
      if (!other) continue;
      // 0b1000 >> i is quarter i's bit
      if (other.dualTiles && other.layer >= type.layer) {
        which |= 0b1000 >> i;
        if (other.layer > type.layer && (!next || other.layer < next.layer)) next = other;
      } else if (!blendsOnto(other, type)) {
        which |= 0b1000 >> i;
        cut |= 0b1000 >> i;
      }
    }
    const piece = type.dualTiles[which];
    if (!cut) {
      image(piece, xs[0], ys[0], xs[2] - xs[0], ys[2] - ys[0]);
    } else {
      // only uncut quarters, each from the matching quarter of the piece
      for (let i = 0; i < 4; i++) {
        if (cut & (0b1000 >> i)) continue;
        const across = i % 2;
        const down = Math.floor(i / 2);
        const half = piece.width / 2;
        image(piece, xs[across], ys[down], xs[across + 1] - xs[across], ys[down + 1] - ys[down], across * half, down * half, half, half);
      }
    }
    type = next;
  }
}
