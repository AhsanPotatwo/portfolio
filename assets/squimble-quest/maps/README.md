# Squimble Quest maps

Every map in the game is one `.json` file in this folder. The file name is the map's name, so `forest.json` is the map called `forest`.

A map is made of:

- **Tiles**: the ground. Every spot has exactly one tile (grass, wall, water…), or is empty. Tiles are defined in [`js/squimble-quest/tiles.js`](../../../js/squimble-quest/tiles.js).
- **Objects**: things placed on top, like furniture and decorations. One object can cover several tiles (a 2 × 1 table), and several can share a tile (a table on a rug). Objects are defined in [`js/squimble-quest/objects.js`](../../../js/squimble-quest/objects.js).
- **Enemies**: where each enemy starts. They appear there with full health the first time you go to the map. After that, each map remembers its enemies and NPCs as you left them: defeated enemies stay defeated and hurt ones stay hurt, until the page is reloaded. Enemies are defined in [`js/squimble-quest/enemies.js`](../../../js/squimble-quest/enemies.js).
- **NPCs**: where each friendly character starts. Walk up to one and press **E** to talk. NPCs, and what they say, are defined in [`js/squimble-quest/npcs.js`](../../../js/squimble-quest/npcs.js).
- **Warps**: tiles that take the player to another map, or somewhere else on the same one. That's how doors, cave entrances, manholes, trapdoors, secret passages and teleporters work. See [Warps](#warps) below, and [`js/squimble-quest/warps.js`](../../../js/squimble-quest/warps.js).

## The maps in this folder

| File | What it is |
|---|---|
| `default.json` | A blank white map (80 × 50 tiles) |
| `example.json` | The testing map: a bit of every tile (hut, pond, lava, spikes), tables and rugs, two training dummies to hit, and a villager to talk to (walk up and press **E**). Press **E** at the hut's door to go inside. The game starts here (`START_MAP` in `maps.js`) |
| `hut.json` | Inside the hut on `example`: a room with a rug, a table and a villager. Walk back out through the gap in the bottom wall |
| `node-test.json` | For trying out the warp graph (**Show links**, see [Warps](#warps)). Warps that teleport around the same map, each on a coloured tile so you can see it without the editor: a family on dirt that branches like a tree, a family on sand that goes round in a loop, and two on planks that aren't linked to the others (one leads nowhere, one leads to the spawn point). Press **E** on one to use it |

The tile grid shows on every map while developer mode is on, and never outside it.

## Quick start

1. Open the game, click it, press **`** or **Ctrl + D** (developer mode), then **B** (map editor).
2. Click **Map settings** (top right), then **New map**, type a width and height, and choose what to fill it with. Or just edit the map you're on.
3. Paint tiles and place objects.
4. Click **Map settings**, then **Export**, type a name, and it downloads as `yourname.json`.
5. Move the file into this folder (`assets/squimble-quest/maps/`).
6. Add its file name to `MAP_FILES` in [`js/squimble-quest/maps.js`](../../../js/squimble-quest/maps.js):

   ```js
   const MAP_FILES = [
     'default.json',
     'example.json',
     'yourname.json',
   ];
   ```

7. Reload the game. Press **M** in developer mode until you reach your map.

## Making a map

Open the editor with **`** (or **Ctrl + D**) then **B** (for build). Everything you do changes the map you're on, so you can close the editor (**B**) and walk around it straight away.

| Control | What it does |
|---|---|
| **Tiles** / **Objects** / **Enemies** / **NPCs** / **Triggers** tabs above the bar | Switch between the ground tiles, objects (furniture, decorations…), enemies, friendly NPCs and triggers (the player's spawn point, and warps) |
| **Map settings** (top right) | Opens a panel with the map's name and size, and the **Resize map**, **New map**, **Open file** and **Export** buttons. Click it again (or move with **WASD**) to close it |
| Click something in the bottom bar | Choose it (**‹ ›** for more pages) |
| Left click / drag (tile chosen) | Paint that tile, replacing the one there |
| Left click (object chosen) | Place the object, its top-left corner on the tile under the mouse. A see-through preview shows where it'll go |
| Left click (enemy or NPC chosen) | Place it, standing on the tile under the mouse |
| Left click (**spawn** chosen, in **Triggers**) | The player spawns on this tile (yellow ring). There's only one, so it moves here |
| Left click (**warp** chosen, in **Triggers**) | Put a warp on this tile (purple square), and open its settings. See [Warps](#warps) |
| Right click | Change the settings of what's under the mouse. Only warps have settings so far |
| **Erase**, then left click / drag | Delete. Starting on an object, enemy, NPC or warp removes those; starting on bare ground empties tiles |
| **WASD** | Move around the map. The editor's buttons and panels fade out while you move, so you can see the map, and come back when you stop |
| **−** **=** or mouse wheel | Zoom out and in (**0** resets) |
| **M** | Go to the next map |
| **H** | Show or hide the list of keys (top left) |
| **B** | Close the editor |

Empty tiles show the dark background and can't be walked on, like the edge of the map.

While the editor's open, everyone stands still. Opening it brings back every enemy placed on the map, including ones you've defeated, so you always see the whole design (it's also a quick way to reset them while testing). Closing it puts every enemy and NPC back where it was placed, with full health. Defeating an enemy never removes it from the map, so it's still in the file when you export.

### New maps

Click **Map settings**, then **New map**. A box asks for the width and height in tiles: click a number (or press **Tab**) to type into it, then press **Enter** or **Make map** (**Escape** or **Cancel** closes it). The smallest is 1 × 1 and the biggest is 500 × 500. Tile `(0, 0)` is in the middle of the new map, and that's where the player spawns.

**Fill** is what every tile starts as. It starts on `blank` (plain white). Click its right half to go forward through the tiles, or its left half to go back. After the last tile comes **empty**: the map starts with no tiles at all.

**Rooms that aren't rectangles** (L-shapes, crosses, rooms joined by corridors): fill with **empty**, make the map big enough to fit the whole shape, then paint the floor in the shape you want. Everything you don't paint stays empty, and empty tiles work like walls. Remember to put the spawn point (**Triggers** tab) on the floor.

A new map is called `new-map` until you export it with a name of its own.

### Resizing a map

Click **Map settings**, then **Resize map**, and type the new width and height into the box (it works like the **New map** one). The map grows or shrinks around its middle, and any new space is empty, ready to paint.

It can't be made smaller than the area with tiles in it: the box says what the smallest is, and won't go any lower. So a 10 × 10 map made 20 × 20 can go back to 10 × 10, but if you've painted one tile past the old edge on the right and bottom, the smallest is 11 × 11. Objects, enemies and NPCs on any part that's cut off are removed.

### Warps

A warp is a tile that takes the player somewhere else: a door into a house, a cave entrance, a manhole, a secret passage, a teleporter. A warp to another spot on the same map is a teleport, and everything else on the map carries on as it was. Every warp is both a way out and a place to arrive, so a house needs two warps: one on the town map that leads to the one inside, and one inside that leads back out. The hut on `example` is set up this way.

1. Choose **warp** in the **Triggers** tab and click a tile. A warp can go on any tile, including one with an object, enemy or NPC on it. Its marker always shows on top.
2. A box opens with the warp's settings. Right click the warp any time to change them.
   - **Name**: what other warps use to lead here. Each warp on a map needs its own name.
   - **Goes to**: the map it leads to. **nowhere** means it only works as a place to arrive.
   - **Arrive at**: where the player turns up on that map. That's its **spawn point**, or any warp on it.
   - **Opens by**: **stepping on it**, or **pressing E** when close enough. A warp that opens with E works from the tile in front too, so it can go on a wall or under a solid object.
   - **Show links**: shows every warp linked to this one, then every warp linked to those, and so on, like a family tree (see below).
3. Click the right half of a choice for the next one, or the left half to go back. Then click **Save**.

In the editor, warps that open with E have an **E** on their marker. A warp shows **red** when it leads to a map or warp that doesn't exist. Going through one of those shows a message and the player stays where they are, and the browser console lists them all when the game loads.

Arriving on a warp that opens by stepping on it doesn't send you straight back. It only opens when you step onto it from another tile.

**Show links** opens the warp graph. The warp you're editing is at the top with a yellow edge, and under it is every warp linked to it, whichever way round, on any map. Each box shows a warp's name and its map, and the arrows point the way each warp leads, so a door and its way back out have an arrow at both ends. A warp that leads to a spawn point shows that spawn point as a box, and one leading to a warp that doesn't exist shows a red box. Hover over a box to see where that warp is: a window onto its map, with the warp ringed in yellow. Drag to move around it and use the mouse wheel to zoom. **Close** or **Escape** goes back to the warp's settings. It shows the warp as it was last saved, so **Save** changes first to see them in the graph.

Warps link by name, so you can move a warp around freely. **Renaming a warp breaks every warp that leads to it**, so change those too. Both maps have to be exported for a link to work after a reload.

### Changing a map you've already made

Go to it with **M** (or **Open file**), edit it, **Export** it with the same name, and replace the old file in this folder with the new one.

## Playing a map without adding it to the game

Click **Open file** in the editor and choose a `.json` file. You go straight to that map. It stays in the **M** list until you reload the page. This works even when the game isn't running through a local server (see below).

## Choosing the map the game starts on

In `maps.js`, set `START_MAP` to the map's name (its file name without `.json`):

```js
const START_MAP = 'forest';
```

## Where the maps come from

The **M** key goes through every map in this order:

1. The files in `MAP_FILES`, in the order they're listed
2. Any maps made, opened or exported since the page loaded

Opening or exporting a map with the same name as one that's already loaded replaces it until you reload the page. Exporting under a **new** name works like "save as": the map you're on becomes the new one, and the old name goes back to its own file (without your unsaved changes).

Going to a different map and back keeps the changes you made in the editor, but reloading the page loses them, so export them first.

If `START_MAP` doesn't load (e.g. its file is missing), the game starts on the first map that did, and the browser console says so.

## Running the game locally

Browsers don't let a page read files from your computer's folders when it's opened by double-clicking the `.html` file (a `file://` address). To load maps from this folder, run the site through a local server:

- **VS Code:** install the *Live Server* extension, right-click `squimble-quest.html`, and choose *Open with Live Server*.
- **Terminal:** run `npx serve .` in the portfolio folder, then open the address it shows (e.g. `http://localhost:3000/squimble-quest.html`).

On the live site (GitHub Pages) it just works.

Without a server, no map files can load, so the game puts you on a small blank stand-in map with a message along the bottom explaining why. **Open file** in the editor still works then, and the browser console (F12) explains which files didn't load.

## The file format

You can open a map in any text editor. It looks like this:

```json
{
  "format": "squimble-quest-map",
  "version": 2,
  "left": -5,
  "top": -2,
  "spawn": { "x": 16, "y": -5 },
  "legend": {
    "..": null,
    "wa": "wall",
    "gr": "grass",
    "wt": "water"
  },
  "rows": [
    "wa wa wa wa wa wa wa wa wa wa",
    "wa gr gr gr gr gr gr gr gr wa",
    "wa gr gr wt wt gr gr gr gr wa",
    "wa gr gr wt wt gr .. .. gr wa",
    "wa wa wa wa wa wa wa wa wa wa"
  ],
  "objects": [
    { "type": "rug", "col": -3, "row": -1 },
    { "type": "table", "col": 1, "row": -1 }
  ],
  "enemies": [
    { "type": "dummy", "col": 2, "row": 0 }
  ],
  "npcs": [
    { "type": "villager", "col": -3, "row": 0 }
  ],
  "warps": [
    { "name": "front", "col": 0, "row": 2, "to": "house", "toWarp": "exit", "activate": "interact" }
  ]
}
```

- **`rows`**: the tiles, one line per row, top row first, with a code for each tile separated by spaces.
- **`legend`**: which code means which tile (the names in `tiles.js`). `..` is always empty. The editor makes a 2-character code for each tile when it exports, from the tile's name where it can: `gr` for grass, then `wt` for water because `wa` is already wall. There are thousands of possible codes, so they won't run out however many tiles you add.
- **`objects`**: everything placed on the tiles. `type` is the object's name in `objects.js`, and `col`, `row` is the tile its top-left corner is on. They're drawn in list order, so later ones go on top.
- **`enemies`**, **`npcs`**: where enemies and NPCs start. `type` is the name in `enemies.js` or `npcs.js`, and `col`, `row` is the tile it stands on. Maps without these lists just have none.
- **`warps`**: see [Warps](#warps). `name` is the warp's name, and `col`, `row` is its tile. `to` is the map it leads to (`""` for nowhere), and `toWarp` is the warp to arrive at on that map (`""` for its spawn point). `activate` is `"step"` or `"interact"` (press E). Maps without this list just have no warps.
- **`left`, `top`**: the tile column and row of the map's top-left corner. Tile `(0, 0)` is at the middle of the world, so `-5, -2` puts the middle of a 10 × 5 map there.
- **`spawn`**: where the player starts, in pixels (the centre of the player). Easiest to set with **spawn** in the editor's **Triggers** tab.

Older map files may also have a `"showGrid"` line. It isn't used any more and can be left in or deleted.

You can edit a map by hand: swap codes in `rows`, add a line to `legend`, or add an object to `objects`. Keep the codes separated by spaces. Codes in a hand-made file can be any length (e.g. `"grass": "grass"`), as long as they have no spaces in them.

Maps saved before objects were added (version 1, one character per tile with no spaces) still load. They're saved in the new format the next time they're exported.

## If something goes wrong

- **The map isn't in the M list:** check the file is in this folder, its name is in `MAP_FILES` with `.json` on the end, and the game is running through a local server. The browser console (F12) says which file failed and why.
- **"This warp is broken" when using a warp:** it leads to a map that isn't loaded, or to a warp name that map doesn't have. Right click the warp in the editor to fix it. Check that the map is in `MAP_FILES`, and that the warp on the other map wasn't renamed.
- **Some tiles, objects, enemies or NPCs are missing:** the map uses a name the game doesn't know, maybe because it was renamed in `tiles.js`, `objects.js`, `enemies.js` or `npcs.js`, or a code that isn't in the `legend`. The console lists everything it left out. Add it back, or fix the name in the file.
- **"This doesn't look like a Squimble Quest map file":** the file isn't a map, or it's been damaged. It needs a `legend` and `rows` at least.
