# Tiles

Every tile in the game is its own file in this folder, named after it (`lava.json` is lava), and `index.json` lists them. The game loads them when it starts, and the map editor shows every one. How the data folders work is in the [data README](../README.md).

| File or folder | What it is |
|---|---|
| `grass.json`, `lava.json`… | One tile each: its colour, texture and settings |
| `index.json` | The names of the tiles the game loads, in palette order |
| `normal/` | Textures for normal tiles: one picture, drawn on every tile of that kind (planks, a tiled floor, a wall), plus any variants and animation frames. 16 × 16 pixel art works well |
| `dual-grid/` | Tilesets for dual grid tiles: ground that rounds off and blends into the tiles next to it (grass, dirt, sand, stone, gravel). A square picture of 4 × 4 pieces, e.g. 64 × 64 with 16 × 16 pieces |

## Making or changing a tile

1. Open the map editor: **`** (or **Ctrl + D**) for dev mode, then **B**.
2. On the palette's **Tiles** tab, click **New** in the inspector, or **right click** a tile in the palette (or pick it and click **Edit**) to change it. Changes to a tile that's already on the map show on the map as you make them; drag the box by its title bar to see behind it. **Save** keeps them, **Cancel** (or **×**, or **Escape**) puts the tile back.
3. Set it up. The pictures on the right show the texture file and how the tile looks on the map as you go. Rest the mouse on a setting to see what it does. A choice with **‹ ›** steps with the arrows, or click its middle to see every option in a list. The tabs along the top switch between groups of settings:
   - **Look**
     - **Name**: what maps call it. Changing it renames the tile when you save, and maps keep working (the tile remembers its old name, so map files that still say it get this tile).
     - **Kind**: **normal**, or **dual grid**.
     - **Colour**: what it looks like without a texture, e.g. `#6fae4f`. Click the square at the end of the box for a colour picker, or paste one in with **Ctrl + V** (hex like `#6fae4f`, or rgb like `rgb(111, 174, 79)`).
     - **Texture**: click **Choose picture** to pick one from your computer, or set it back to **none, just colour**. A texture always covers the colour.
     - **Variants** (normal tiles with a texture): more pictures. Each tile on the map shows the texture or one of these, picked by where it is so it never changes, so a field of grass doesn't look like the same square over and over. Click **+** to add a picture from your computer, and click one to take it off.
     - **Frames** (normal tiles with a texture): pictures it goes through after the texture, so it moves (water, lava, flowers in the wind). Every tile of the kind moves together. A tile with frames doesn't use its variants.
     - **Frame time**: how long each frame shows, in milliseconds.
     Variants and frames should be the same size as the texture (the editor's **Map > Art report** lists any that aren't).
   - **Behaviours**
     - **Solid**: nothing can walk onto it.
     - **See over**: for solid tiles you can see across, like deep water or a chasm. Enemies can spot you over it; other solid tiles (walls, roofs) block their view.
     - **Speed**: how fast you walk on it, 100% is normal.
     - **Damage**: how much it hurts a second while standing on it (like lava), and each time you step onto one (like spikes).
   - **Effects**
     - **Heal**: how much health it gives back a second while standing on it (like a healing spring).
     - **Slippery**: how much you slide about, 0% is normal and 90% is ice. You keep going the way you were until you bump into something.
     - **Push** and **Push by**: pushes anything on it that way, this many tiles a second (conveyor belts, river currents, wind). Walking is 5 tiles a second.
     - **Particles**: click it for a list of every particle effect and tick the ones every tile of this kind keeps making, like lava's **lava-bubbles** and **lava-smoke** (click outside the list or press **Escape** to close it). Each one bursts from a random spot on the tile as often as its own **Keep going** setting says (made in the particle editor, on the map editor's **Particles** tab).
     - **How often**: faster or slower than that for this tile, 100% is normal and 0% stops them.

     Only tiles on screen make particles, so big maps don't slow down. If a lot are on screen at once (zoomed right out over lava), they all make fewer instead of the game slowing down.

   - **Sounds**
     - **Sounds**: click it and tick the sounds every tile of this kind keeps playing, like lava's **lava-bubbling** and **lava-rumble** (made in the sound editor, on the map editor's **Sounds** tab). They loop while you're close enough to hear them, getting louder as you walk up.
     - **Volume**: louder or quieter than the sound normally is, 100% is normal.
     - **Heard from**: how many tiles away you can hear them. 0 uses each sound's own **Heard from**.
     - **At most**: each sound only plays from this many of the closest tiles, however many there are, so a lake of lava doesn't play hundreds of loops. More sounds fuller in the middle of a big patch, fewer is calmer.
     - **Pitch varies**: each of those tiles plays a little higher or lower, up to this much, so they don't sound like copies of each other.

     Tile sounds only play in the game, not while the editor's open.

   - **Footsteps**
     - **Steps**: click it and tick the sounds walking on this tile makes, like grass's **grass-step** and dirt's **dirt-step**. Each step plays one of them at random and never the same one twice in a row, so ticking a few slightly different takes sounds more natural.
     - **Volume**: louder or quieter than the sound normally is, 100% is normal.
     - **Pitch**: over 100% is higher and snappier, under is lower and heavier. One step sound can do for a few tiles this way, like dirt-step at 70% for mud.
     - **Pitch varies**: each step is a little higher or lower at random, up to this much, so no two sound exactly alike.
     - **Heard from**: how many tiles away you hear enemies' and NPCs' steps. 0 uses each sound's own **Heard from**.

     Everyone makes footsteps, but other people's are quieter than yours. How far apart steps are, how quickly the first one comes, and how quiet other people's are, are `FOOTSTEPS` in [`config.js`](../../../js/squimble-quest/config.js). Slow tiles give slower steps by themselves, and sliding, being pushed or walking into a wall makes none.

   - **Liquid** (water, lava, mud, slime: anything you wade into)
     - **Sink in**: over 0% makes it a liquid. Whoever walks in sinks this much of their height (40% is about the waist), with a ring round them where they meet the surface. Near the shore it's shallower, like a beach: nobody sinks until all of them is in, and they reach the full depth a little way from every edge, so they never look sunk into the ground beside it. Leave it solid off, and add **Speed** and **Damage** for wading slowly or getting burnt.
     - **See through**: how much of the part under the surface shows, wobbling as if the surface bends it. 0% hides it (lava, mud), 100% is clear. It only shows over tiles of the liquid, never through the shore.
     - **Surface**: the colour of the ring round whoever's in it, and of their wake.
     - **Glow**: for liquids that give off light, like lava. The ring glows and so does whoever's in it, from the surface up.
     - **Wake**: how strong the V that opens out behind whoever wades through it is. 100% is normal, lower is fainter (lava's is 50%, since it's thick), 0% is none. Everyone makes one, enemies too, stronger the faster they go, and it stops at the shore.
     - **Splash**: particle effects when someone steps in, like water's **water-splash**.
     - **Ripples**: particle effects round whoever's standing in it every so often (walking, the wake takes over, with one ripple just after stopping), like **water-ripple**. Ripple shaped particles stretched wide (**Stretch** over 200%) lie flat on the surface, and ticking **Liquid only** (the particle editor's **Life** tab) stops them at the shore.
     - **Splash sound** (**Liquid 2**): one of these plays when someone steps in. Wading is the **Footsteps** tab, like water's **wade** (lava uses it at 55% pitch).

     How quickly everyone sinks, how far from the shore it gets to full depth, how much the surface bobs and wobbles and how often ripples come are `LIQUID` in [`config.js`](../../../js/squimble-quest/config.js), the same for every liquid. How the wakes look (how wide they open, how long they last, how thick and see-through they are) is `WAKE` at the top of [`wakes.js`](../../../js/squimble-quest/wakes.js).

   - **Dual grid**
     - **Blends**: which dual grid tiles (like grass) round off onto this tile. **every dual grid tile** includes ones made later. **only the ticked ones** lets you untick the ones that look wrong in **Ticked** (click it for the list): they stop in a straight line at this tile's edge instead. Good for planks, walls and roofs; leave it on for natural ground like dirt.

   Every Behaviours, Effects and Liquid setting works on enemies and NPCs too.
4. Click **Save**. It's in the game straight away, so you can paint with it and walk on it.
5. Click **Export** in the inspector. It downloads the file of every tile you've made or changed (like `ice.json`), and the pictures too if you chose new ones (texture, variants, frames). The message on screen says where each goes:
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

**Renaming** is the **Name** box (above). **Deleting**: open the tile and click **Delete tile** under the pictures. It says which maps use it and asks what to put in its place (another tile, or empty). Maps that use it get the replacement, now and whenever they load, since the replacement remembers the deleted name. Either way, **Export** afterwards says which old file to delete and what to change in `index.json`.

Do this by hand, since the tile editor doesn't:

- **Reorder tiles**: the order in `index.json` is the order in the editor's palette. Where two dual grid tiles meet, the one further down goes on top, so put the ones underneath first (dirt before grass).

If a texture can't be found, the tile is drawn in its colour and the browser console says why.
