# Tiles

Every tile in the game is one line in `tiles.json`, in this folder. The game loads it when it starts, and the map editor shows every tile in it.

| File or folder | What it is |
|---|---|
| `tiles.json` | Every tile: its name, colour, texture and settings |
| `normal/` | Textures for normal tiles: one picture, drawn on every tile of that kind (planks, a tiled floor, a wall). 16 × 16 pixel art works well |
| `dual-grid/` | Tilesets for dual grid tiles: ground that rounds off and blends into the tiles next to it (grass, dirt, sand, stone, gravel). A square picture of 4 × 4 pieces, e.g. 64 × 64 with 16 × 16 pieces |

## Making or changing a tile

1. Open the map editor: **`** (or **Ctrl + D**) for dev mode, then **B**.
2. On the **Tiles** tab, click **+ New tile**, or **right click** a tile in the bar to change it.
3. Set it up. The pictures on the right show the texture file and how the tile looks on the map as you go.
   - **Kind**: **normal**, or **dual grid**.
   - **Colour**: what it looks like without a texture, e.g. `#6fae4f`.
   - **Texture**: click **Choose picture** to pick one from your computer, or set it back to **none, just colour**. A texture always covers the colour.
   - **Solid**: nothing can walk onto it.
   - **Speed**: how fast you walk on it, 100% is normal.
   - **Damage**: how much it hurts a second while standing on it (like lava), and each time you step onto one (like spikes). Both hurt enemies and NPCs too.
4. Click **Save**. It's in the game straight away, so you can paint with it and walk on it.
5. Click **Export tiles**. It downloads `tiles.json`, and the picture too if you chose a new one. The message on screen says where each goes:
   - drag `tiles.json` into this folder in VS Code, replacing the old one
   - drag the picture into `normal/` or `dual-grid/`
6. Reload the page. The tile's in the game for good.

If you saved a picture straight into `normal/` or `dual-grid/` before choosing it, only `tiles.json` needs dragging in.

## Making a dual grid tileset

Copy `dual-grid/grass_tileset.png` and paint over it, keeping every piece where it is. Leave the parts that aren't this ground see-through: the tile next to it shows through there. The layout is `DUAL_TILESET_LAYOUT` in [`dualgrid.js`](../../../js/squimble-quest/dualgrid.js). The tile editor won't save a picture that isn't 4 × 4 pieces as a dual grid tile, and says why.

## Changing tiles.json by hand

Each tile only needs the settings that are different from normal (`TILE_DEFAULTS` in [`tiles.js`](../../../js/squimble-quest/tiles.js), whose guide explains each one):

```json
{ "name": "lava", "colour": "#e4572e", "speed": 0.7, "damagePerSecond": 25 }
```

Do these by hand, since the tile editor doesn't:

- **Reorder tiles**: the order is the order in the editor's bar. Where two dual grid tiles meet, the one further down goes on top, so put the ones underneath first (dirt before grass).
- **Rename or delete a tile**: maps store tile names, so this loses the tile from every map that uses it. The browser console lists what went missing.

If a texture can't be found, the tile is drawn in its colour and the browser console says why.
