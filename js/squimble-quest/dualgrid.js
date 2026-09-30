// dual grid tiles: ground like grass, dirt or sand that blends into the tiles next to it with rounded
// edges, drawn from a tileset instead of one picture per tile. a tile is one when it has "dualGrid"
// in tiles.json (made in the tile editor, tileeditor.js). everything about drawing them is here.
//
// maps and the editor don't know about any of this: you still paint 'grass' onto tiles, and a map
// still stores 'grass'. only the drawing changes. a normal tile is drawn as one square on its own. a
// dual grid tile is drawn on a second grid, half a tile across and down from the normal one, so every
// piece sits where four tiles meet and shows which of those four are grass. that's how the edges and
// corners round themselves off without anyone painting edge tiles by hand.
//
// what's here, and what to use if the editor (or anything else) wants to do more with tilesets later:
//   DUAL_TILESET_LAYOUT  which piece is where in a tileset picture
//   dualTilesetProblem() what's wrong with a picture as a tileset, if anything (the tile editor shows it)
//   cutDualTileset()     cuts a tileset picture into its pieces. useTexture() (tiles.js) runs it
//                        whenever a dual grid tile gets a texture, from its file or the tile editor
//   drawDualCorner()     draws the pieces where four tiles meet. only drawTiles() (tilemap.js) calls it

// which piece is where in a tileset, left to right, top row first. each number says which of the four
// tiles meeting at that piece are this tile, as four 1s and 0s: up left, up right, down left, down
// right. e.g. 0b0011 is the bottom two, so it's the piece along a top edge. tiles/dual-grid/grass_tileset.png
// is laid out like this, so copying it and painting over it is the easy way to make a new one
const DUAL_TILESET_LAYOUT = [
  0b0010, 0b0101, 0b1011, 0b0011,
  0b1001, 0b0111, 0b1111, 0b1110,
  0b0100, 0b1100, 0b1101, 0b1010,
  0b0000, 0b0001, 0b0110, 0b1000,
];

// what's wrong with a picture (a p5 image) as a tileset, as words to show, or null if it's fine.
// it has to be a square that splits into 4 x 4 whole pieces
function dualTilesetProblem(sheet) {
  if (sheet.width === sheet.height && sheet.width % 4 === 0) return null;
  return `it's ${sheet.width} x ${sheet.height}, it has to be a square of 4 x 4 pieces, like 64 x 64`;
}

// cuts a tileset picture (a p5 image) into its 16 pieces: pieces[which] is the piece for which of the
// four tiles, the numbers in DUAL_TILESET_LAYOUT. label is only for the warning. gives back null, with
// a warning, if dualTilesetProblem() finds something wrong with it.
//
// cut into separate pictures rather than drawing part of the big one, because drawing part of a
// picture can pick up a line of the piece next to it at some zooms, which shows as a faint grid
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

// the four tiles meeting at a corner: up left, up right, down left, down right (the same order as the
// 1s and 0s in DUAL_TILESET_LAYOUT). one list, filled in again for each corner, rather than a new one
// each time: drawDualCorner() runs for every corner on screen, thousands of times a frame zoomed out
const dualAround = [null, null, null, null];

// draws the dual grid piece(s) on the corner at the top left of tile col, row of map. x(half) and
// y(half) are where half tile edges land on screen (see drawTiles() in tilemap.js), so the pieces
// line up exactly with the normal tiles. uses screen positions, so only drawTiles() calls it
function drawDualCorner(map, col, row, x, y) {
  // get() gives null for empty tiles and ones off the map
  dualAround[0] = map.get(col - 1, row - 1);
  dualAround[1] = map.get(col, row - 1);
  dualAround[2] = map.get(col - 1, row);
  dualAround[3] = map.get(col, row);

  // the first normal tile here, and the dual grid tile on the lowest layer (see layer in tiles.js)
  let under = null;
  let lowest = null;
  for (const type of dualAround) {
    if (!type) continue;
    if (!type.dualTiles) under ??= type;
    else if (!lowest || type.layer < lowest.layer) lowest = type;
  }
  // no dual grid tiles on this corner, the normal tiles have already drawn it all
  if (!lowest) return;

  // the piece's left, middle and right edges on screen, and its top, middle and bottom
  const xs = [x(2 * col - 1), x(2 * col), x(2 * col + 1)];
  const ys = [y(2 * row - 1), y(2 * row), y(2 * row + 1)];

  // each piece fills a quarter of each of the four tiles. the pieces have see-through edges, so first
  // the dual grid tiles' quarters get a normal tile from this corner, as if that ground carries on
  // underneath. (the normal tiles drew their own quarters already.) with no normal tile here, the
  // lowest dual grid piece covers all four quarters, so nothing's needed
  if (under) {
    fill(under.fill);
    for (let i = 0; i < 4; i++) {
      if (!dualAround[i]?.dualTiles) continue;
      // which quarter: 0 left or top, 1 right or bottom
      const across = i % 2;
      const down = Math.floor(i / 2);
      const left = xs[across];
      const top = ys[down];
      const w = xs[across + 1] - left;
      const h = ys[down + 1] - top;
      const img = under.img;
      // the matching quarter of its picture: this piece's up left quarter is the bottom right of a tile
      if (img) image(img, left, top, w, h, (1 - across) * img.width / 2, (1 - down) * img.height / 2, img.width / 2, img.height / 2);
      else rect(left, top, w, h);
    }
  }

  // then each dual grid tile here draws its piece, lowest layer first. a piece covers its own tiles'
  // corners and any higher layer's too, so the higher one is drawn over it rather than next to it,
  // and there's never a gap between them
  let type = lowest;
  while (type) {
    // which of the four this piece covers, and the next layer up to draw after it
    let which = 0;
    let next = null;
    for (let i = 0; i < 4; i++) {
      const other = dualAround[i];
      if (!other?.dualTiles || other.layer < type.layer) continue;
      which |= 0b1000 >> i;
      if (other.layer > type.layer && (!next || other.layer < next.layer)) next = other;
    }
    image(type.dualTiles[which], xs[0], ys[0], xs[2] - xs[0], ys[2] - ys[0]);
    type = next;
  }
}
