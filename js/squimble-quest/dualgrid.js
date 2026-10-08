// dual grid tiles: ground (grass, dirt, sand) that blends into its neighbours with rounded edges,
// drawn from a tileset. a tile uses this when it has "dualGrid" in its file. all the drawing for
// them is in this file.
//
// maps and the editor don't know anything about it: a map still just stores 'grass', only the drawing
// is different. the pieces sit on a second grid that's offset by half a tile, so each one is where
// four tiles meet, and which piece goes there depends on which of those four are grass. that way the
// edges round off without needing hand painted edge tiles.
//   DUAL_TILESET_LAYOUT  which piece is where in a tileset picture
//   dualTilesetProblem() why a picture can't be used as a tileset, or null (the tile editor shows it)
//   cutDualTileset()     cuts a tileset into its pieces. useTexture() (tiles.js) runs it on every new texture
//   drawDualCorner()     draws the pieces at one corner. only drawTiles() (tilemap.js) calls it

// the pieces left to right, top row first. each is 4 bits saying which of the corner's tiles are this
// tile: up left, up right, down left, down right. so 0b0011 (the bottom two) is a top edge piece.
// tiles/dual-grid/grass_tileset.png uses this layout, so for a new one copy that and paint over it
const DUAL_TILESET_LAYOUT = [
  0b0010, 0b0101, 0b1011, 0b0011,
  0b1001, 0b0111, 0b1111, 0b1110,
  0b0100, 0b1100, 0b1101, 0b1010,
  0b0000, 0b0001, 0b0110, 0b1000,
];

// why a p5 image can't be a tileset (as words to show), or null if it's fine. it has to be a square
// of 4 x 4 whole pieces
function dualTilesetProblem(sheet) {
  if (sheet.width === sheet.height && sheet.width % 4 === 0) return null;
  return `it's ${sheet.width} x ${sheet.height}, it has to be a square of 4 x 4 pieces, like 64 x 64`;
}

// cuts a tileset (a p5 image) into its 16 pieces, as pieces[bits] following DUAL_TILESET_LAYOUT.
// gives null with a warning if dualTilesetProblem() doesn't like it. label is only for the warning.
// I cut them into separate pictures because drawing part of one big picture can bleed in a line from
// the next piece at some zooms (it looks like a faint grid)
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

// the four tiles around a corner: up left, up right, down left, down right (same order as the bits).
// this array gets reused instead of making a new one each time, because drawDualCorner() runs
// thousands of times a frame when zoomed out
const dualAround = [null, null, null, null];

// draws the dual grid piece (or pieces) at the top left corner of tile col, row. x(half) and y(half)
// say where each half tile edge lands on screen (from drawTiles() in tilemap.js), so the pieces line
// up exactly with the normal tiles. it works in screen positions, so only drawTiles() should call it
function drawDualCorner(map, col, row, x, y) {
  // null for empty and off-map tiles
  dualAround[0] = map.get(col - 1, row - 1);
  dualAround[1] = map.get(col, row - 1);
  dualAround[2] = map.get(col - 1, row);
  dualAround[3] = map.get(col, row);

  // the dual grid tile with the lowest layer here (layer is in tiles.js)
  let lowest = null;
  for (const type of dualAround) {
    if (type?.dualTiles && (!lowest || type.layer < lowest.layer)) lowest = type;
  }
  // no dual grid tiles here, the normal tiles have already drawn everything
  if (!lowest) return;
  // the first normal tile here that one of the dual grid tiles blends onto (blendsWith). if none of
  // them blend onto a tile they only meet it in straight lines, so it never shows under their edges
  let under = null;
  for (const type of dualAround) {
    if (!type || type.dualTiles || under) continue;
    for (const dual of dualAround) {
      if (dual?.dualTiles && blendsOnto(type, dual)) under = type;
    }
  }

  // the piece's edges on screen: left/middle/right and top/middle/bottom
  const xs = [x(2 * col - 1), x(2 * col), x(2 * col + 1)];
  const ys = [y(2 * row - 1), y(2 * row), y(2 * row + 1)];

  // a piece covers a quarter of each of the four tiles and has see-through edges. so first the dual
  // grid tiles' quarters get filled with `under`, like that ground carries on underneath them (the
  // normal tiles already drew their own quarters). if there's no normal tile, the lowest piece covers
  // all four
  if (under) {
    fill(under.fill);
    for (let i = 0; i < 4; i++) {
      if (!dualAround[i]?.dualTiles) continue;
      // which quarter: 0 is left/top, 1 is right/bottom
      const across = i % 2;
      const down = Math.floor(i / 2);
      const left = xs[across];
      const top = ys[down];
      const w = xs[across + 1] - left;
      const h = ys[down + 1] - top;
      const img = under.img;
      // the matching quarter of its picture. the piece's up left quarter is a tile's bottom right
      if (img) image(img, left, top, w, h, (1 - across) * img.width / 2, (1 - down) * img.height / 2, img.width / 2, img.height / 2);
      else rect(left, top, w, h);
    }
  }

  // then each dual grid tile's piece, lowest layer first. a piece covers its own quarters and the
  // ones belonging to higher layers, so the higher ones draw over it without any gaps
  let type = lowest;
  while (type) {
    // which quarters this piece covers, and the next layer up. a tile it doesn't blend onto counts
    // as covered so the piece runs straight up to it, but that quarter gets cut so the tile still shows
    let which = 0;
    let cut = 0;
    let next = null;
    for (let i = 0; i < 4; i++) {
      const other = dualAround[i];
      if (!other) continue;
      // 0b1000 >> i is the bit for quarter i
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
      // only the quarters that aren't cut, each from the matching quarter of the piece
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
