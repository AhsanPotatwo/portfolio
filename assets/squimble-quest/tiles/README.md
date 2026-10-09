# Tiles

Every tile in the game is its own file in this folder, named after it (`lava.json` is lava), and `index.json` lists them. The game loads them when it starts, and the map editor shows every one. How the data folders work is in the [data README](../README.md).

| File or folder | What it is |
|---|---|
| `grass.json`, `lava.json`… | One tile each: its colour, texture and settings |
| `index.json` | The names of the tiles the game loads, in palette order |
| `normal/` | Textures for normal tiles: one picture, drawn on every tile of that kind (planks, a tiled floor, a wall). 16 × 16 pixel art works well |
| `dual-grid/` | Tilesets for dual grid tiles: ground that rounds off and blends into the tiles next to it (grass, dirt, sand, stone, gravel). A square picture of 4 × 4 pieces, e.g. 64 × 64 with 16 × 16 pieces |

## Making or changing a tile

1. Open the map editor: **`** (or **Ctrl + D**) for dev mode, then **B**.
2. On the palette's **Tiles** tab, click **New** in the inspector, or **right click** a tile in the palette (or pick it and click **Edit**) to change it. Changes to a tile that's already on the map show on the map as you make them; drag the box by its title bar to see behind it. **Save** keeps them, **Cancel** (or **×**, or **Escape**) puts the tile back.
3. Set it up. The pictures on the right show the texture file and how the tile looks on the map as you go. Rest the mouse on a setting to see what it does. A choice with **‹ ›** steps with the arrows, or click its middle to see every option in a list. The tabs along the top switch between groups of settings:
   - **Look**
     - **Kind**: **normal**, or **dual grid**.
     - **Colour**: what it looks like without a texture, e.g. `#6fae4f`. Click the square at the end of the box for a colour picker, or paste one in with **Ctrl + V** (hex like `#6fae4f`, or rgb like `rgb(111, 174, 79)`).
     - **Texture**: click **Choose picture** to pick one from your computer, or set it back to **none, just colour**. A texture always covers the colour.
   - **Behaviours**
     - **Solid**: nothing can walk onto it.
     - **See over**: for solid tiles you can see across, like water. Enemies can spot you over it; other solid tiles (walls, roofs) block their view.
     - **Speed**: how fast you walk on it, 100% is normal.
     - **Damage**: how much it hurts a second while standing on it (like lava), and each time you step onto one (like spikes).
   - **Effects**
     - **Heal**: how much health it gives back a second while standing on it (like a healing spring).
     - **Slippery**: how much you slide about, 0% is normal and 90% is ice. You keep going the way you were until you bump into something.
     - **Push** and **Push by**: pushes anything on it that way, this many tiles a second (conveyor belts, river currents, wind). Walking is 5 tiles a second.
     - **Particles**: click it for a list of every particle effect and tick the ones every tile of this kind keeps making, like lava's **lava-bubbles** and **lava-smoke** (click outside the list or press **Escape** to close it). Each one bursts from a random spot on the tile as often as its own **Keep going** setting says (made in the particle editor, on the map editor's **Particles** tab).
     - **How often**: faster or slower than that for this tile, 100% is normal and 0% stops them.

     Only tiles on screen make particles, so big maps don't slow down. If a lot are on screen at once (zoomed right out over lava), they all make fewer instead of the game slowing down.

   - **Dual grid**
     - **Blends**: which dual grid tiles (like grass) round off onto this tile. **every dual grid tile** includes ones made later. **only the ticked ones** lets you untick the ones that look wrong in **Ticked** (click it for the list): they stop in a straight line at this tile's edge instead. Good for planks, walls and roofs; leave it on for natural ground like dirt.

   Every Behaviours and Effects setting works on enemies and NPCs too.
4. Click **Save**. It's in the game straight away, so you can paint with it and walk on it.
5. Click **Export** in the inspector. It downloads the file of every tile you've made or changed (like `ice.json`), and the picture too if you chose a new one. The message on screen says where each goes:
   - drag the tile files into this folder in VS Code, replacing any old ones
   - for a new tile, add its name to `index.json`, like `"ice"`
   - drag the picture into `normal/` or `dual-grid/`
6. Reload the page. The tile's in the game for good.

If you saved a picture straight into `normal/` or `dual-grid/` before choosing it, only the tile's file needs dragging in.

## Making a dual grid tileset

Copy `dual-grid/grass_tileset.png` and paint over it, keeping every piece where it is. Leave the parts that aren't this ground see-through: the tile next to it shows through there. The layout is `DUAL_TILESET_LAYOUT` in [`dualgrid.js`](../../../js/squimble-quest/dualgrid.js). The tile editor won't save a picture that isn't 4 × 4 pieces as a dual grid tile, and says why.

## Changing tile files by hand

Each tile's file only needs the settings that are different from normal (`TILE_DEFAULTS` in [`tiles.js`](../../../js/squimble-quest/tiles.js), whose guide explains each one). `lava.json` is:

```json
{
  "colour": "#e4572e",
  "speed": 0.7,
  "damagePerSecond": 25
}
```

Do these by hand, since the tile editor doesn't:

- **Reorder tiles**: the order in `index.json` is the order in the editor's palette. Where two dual grid tiles meet, the one further down goes on top, so put the ones underneath first (dirt before grass).
- **Rename or delete a tile**: rename or delete its file and its name in `index.json`. Maps store tile names, so this loses the tile from every map that uses it. The browser console lists what went missing.

If a texture can't be found, the tile is drawn in its colour and the browser console says why.
