# Squimble Quest maps

Every map in the game is one `.json` file in this folder. The file name is the map's name, so `forest.json` is the map called `forest`.

A map is made of:

- **Tiles**: the ground. Every spot has exactly one tile (grass, wall, water…), or is empty. Tiles are defined in [`js/squimble-quest/tiles.js`](../../../js/squimble-quest/tiles.js).
- **Objects**: things placed on top, like furniture and decorations. One object can cover several tiles (a 2 × 1 table), and several can share a tile (a table on a rug). Objects are defined in [`js/squimble-quest/objects.js`](../../../js/squimble-quest/objects.js).
- **Enemies**: where each enemy starts. They appear there with full health whenever the map loads. Enemies are defined in [`js/squimble-quest/enemies.js`](../../../js/squimble-quest/enemies.js).

## The maps in this folder

| File | What it is |
|---|---|
| `default.json` | A blank white map (80 × 50 tiles). The game starts here |
| `example.json` | The testing map: a bit of every tile (hut, pond, lava, spikes), tables and rugs, and two training dummies to hit |

The tile grid shows on every map while developer mode is on, and never outside it.

## Quick start

1. Open the game, click it, press **`** (developer mode), then **E** (map editor).
2. Click **New map** and type a size, e.g. `40x24`. Or just edit the map you're on.
3. Paint tiles and place objects.
4. Click **Export**, give it a name, and it downloads as `yourname.json`.
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

Open the editor with **`** then **E**. Everything you do changes the map you're on, so you can close the editor (**E**) and walk around it straight away.

| Control | What it does |
|---|---|
| **Tiles** / **Objects** / **Enemies** tabs above the bar | Switch between the ground tiles, objects (furniture, decorations…) and enemies |
| Click something in the bottom bar | Choose it (**‹ ›** for more pages) |
| Left click / drag (tile chosen) | Paint that tile, replacing the one there |
| Left click (object chosen) | Place the object, its top-left corner on the tile under the mouse. A see-through preview shows where it'll go |
| Left click (enemy chosen) | Place the enemy, standing on the tile under the mouse |
| Right click / drag, or **Erase** | Delete. Starting on an object or enemy removes those; starting on bare ground empties tiles |
| **P** | The player spawns on the tile under the mouse (yellow ring) |
| **WASD** | Move around the map |
| **−** **=** or mouse wheel | Zoom out and in (**0** resets) |
| **M** | Go to the next map |
| **E** | Close the editor |

Empty tiles show the dark background and can't be walked on, like the edge of the map.

While the editor's open, the player and enemies stand still. Closing it puts every enemy back where it was placed, with full health.

### New maps

Click **New map** and type the size in tiles as width x height: `40x24`, `40 x 24` and `40,24` all work. The smallest is `1x1` and the biggest is `500x500`. Tile `(0, 0)` is in the middle of the new map, and that's where the player spawns.

The new map is filled with whatever is chosen in the bar:

- **A tile**: every tile starts as that, e.g. all grass.
- **Erase**: the map starts completely empty.

**Rooms that aren't rectangles** (L-shapes, crosses, rooms joined by corridors): choose **Erase**, make a new map big enough to fit the whole shape, then paint the floor in the shape you want. Everything you don't paint stays empty, and empty tiles work like walls. Remember to put the spawn point (**P**) on the floor.

A new map is called `new-map` until you export it with a name of its own.

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

Opening or exporting a map with the same name as one that's already loaded replaces it until you reload the page.

Changes you make in the editor are lost when you go to a different map or reload, unless you export them first.

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
  ]
}
```

- **`rows`**: the tiles, one line per row, top row first, with a code for each tile separated by spaces.
- **`legend`**: which code means which tile (the names in `tiles.js`). `..` is always empty. The editor makes a 2-character code for each tile when it exports, from the tile's name where it can: `gr` for grass, then `wt` for water because `wa` is already wall. There are thousands of possible codes, so they won't run out however many tiles you add.
- **`objects`**: everything placed on the tiles. `type` is the object's name in `objects.js`, and `col`, `row` is the tile its top-left corner is on. They're drawn in list order, so later ones go on top.
- **`enemies`**: where enemies start. `type` is the enemy's name in `enemies.js`, and `col`, `row` is the tile it stands on. Maps without this list just have no enemies.
- **`left`, `top`**: the tile column and row of the map's top-left corner. Tile `(0, 0)` is at the middle of the world, so `-5, -2` puts the middle of a 10 × 5 map there.
- **`spawn`**: where the player starts, in pixels (the centre of the player). Easiest to set with **P** in the editor.

Older map files may also have a `"showGrid"` line. It isn't used any more and can be left in or deleted.

You can edit a map by hand: swap codes in `rows`, add a line to `legend`, or add an object to `objects`. Keep the codes separated by spaces. Codes in a hand-made file can be any length (e.g. `"grass": "grass"`), as long as they have no spaces in them.

Maps saved before objects were added (version 1, one character per tile with no spaces) still load. They're saved in the new format the next time they're exported.

## If something goes wrong

- **The map isn't in the M list:** check the file is in this folder, its name is in `MAP_FILES` with `.json` on the end, and the game is running through a local server. The browser console (F12) says which file failed and why.
- **Some tiles, objects or enemies are missing:** the map uses a name the game doesn't know, maybe because it was renamed in `tiles.js`, `objects.js` or `enemies.js`, or a code that isn't in the `legend`. The console lists everything it left out. Add it back, or fix the name in the file.
- **"This doesn't look like a Squimble Quest map file":** the file isn't a map, or it's been damaged. It needs a `legend` and `rows` at least.
