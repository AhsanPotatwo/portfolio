# Tiles

One file per tile (`lava.json` is lava), listed in `index.json` in palette order. Textures go in `normal/` (one picture per tile, plus variants and animation frames, 16 x 16 works well) and `dual-grid/` (4 x 4 piece tilesets, plus rows of variants, for ground that blends into its neighbours, like grass).

## Making or changing one

1. In the editor (**B**), Tiles tab: **New**, or right click a tile.
2. Change its settings. Each one has a tip on hover. The tabs are Look, Behaviours (solid, speed, damage), Effects (heal, slippery, push, particles), Sounds, Footsteps, Liquid and Dual grid.
3. **Save** to use it straight away, then **Export**: drop the downloaded files in this folder (pictures in `normal/` or `dual-grid/`) and add new names to `index.json`.

Renaming keeps maps working (the old name is remembered in `oldNames`). **Delete tile** asks what to replace it with.

## Notes

- A liquid is any tile with **Sink in** over 0. Shared liquid feel is `LIQUID` in config.js, wakes are `WAKE` in wakes.js.
- Where two dual grid tiles meet, the one lower in `index.json` goes on top, so list dirt before grass. Reordering is by hand.
- For a new dual grid tileset, copy `dual-grid/grass_tileset.png` and paint over it, keeping the pieces in place (`DUAL_TILESET_LAYOUT` in dualgrid.js). Pieces are a quarter of its width (64 wide is 16 px pieces). Rows of whole pieces under the 4 x 4 are variants the middle of the ground picks between by where it is, so put flowers and stones there, each inside one quarter of its piece; leave a spot see-through to skip it. The editor's Help > Making tiles explains it all, with a picture of which piece goes where, and View > Texture inspector (U) shows what's drawn on the map.
- Files only hold settings that differ from `TILE_DEFAULTS` (tiles.js), e.g. lava is `{ "colour": "#e4572e", "speed": 0.7, "damagePerSecond": 25 }`.
- A missing texture falls back to the colour, and the console says why.
