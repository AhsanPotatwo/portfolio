# Tile art

Art for the tiles in [`js/squimble-quest/tiles.js`](../../../js/squimble-quest/tiles.js). The guide at the top of that file has the full steps and every setting.

| Folder | What goes in it | How a tile uses it |
|---|---|---|
| `normal/` | One picture per tile, drawn on every tile of that kind (planks, a tiled floor, a wall). 16 × 16 pixel art works well | `defineTile('planks', { colour: '#b98a55', image: 'planks.png' })` |
| `dual-grid/` | Tilesets for ground that blends into the tiles next to it with rounded edges (grass, dirt, sand, stone, gravel). A square picture of 4 × 4 pieces, e.g. 64 × 64 with 16 × 16 pieces | `defineTile('grass', { colour: '#6fae4f', tileset: 'grass_tileset.png' })` |

**Making a dual grid tileset:** copy `dual-grid/grass_tileset.png` and paint over it, keeping every piece where it is. Leave the parts that aren't this ground see-through: the tile next to it shows through there. The layout is `DUAL_TILESET_LAYOUT` in [`dualgrid.js`](../../../js/squimble-quest/dualgrid.js).

Nothing else needs changing. New tiles show up in the map editor by themselves, and dual grid ones get a little badge there. If a file can't be found, or a tileset isn't 4 × 4 pieces, the tile is drawn in its colour and the browser console says why.
