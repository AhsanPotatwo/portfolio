# Squimble Quest maps

Every map in the game is one `.json` file in this folder. The file name is the map's name, so `forest.json` is the map called `forest`.

## The maps in this folder

| File | What it is |
|---|---|
| `default.json` | A blank white map (80 × 50 tiles) with the grid showing. The game starts here, and it's the blank canvas for making new maps |
| `example.json` | The testing map: a bit of every tile (hut, pond, lava, spikes) to check they all work |
| `testonthegrass.json` | Your map |

## Quick start

1. Open the game, click it, press **`** (developer mode), then **E** (map editor).
2. Paint your map.
3. Click **Export map**, give it a name, and it downloads as `yourname.json`.
4. Move the file into this folder (`assets/squimble-quest/maps/`).
5. Add its file name to `MAP_FILES` in [`js/squimble-quest/maps.js`](../../../js/squimble-quest/maps.js):

   ```js
   const MAP_FILES = [
     'default.json',
     'example.json',
     'yourname.json',
   ];
   ```

6. Reload the game. Press **M** in developer mode until you reach your map.

## Making a map

Open the editor with **`** then **E**. Everything you do changes the map you're standing on, so you can close the editor (**E**) and walk around it straight away.

| Control | What it does |
|---|---|
| Click a tile in the bottom bar | Choose it (**‹ ›** for more pages) |
| Left click / drag | Paint that tile |
| Right click / drag, or **Erase** | Delete tiles. Empty tiles can't be walked on |
| **P** | The player spawns on the tile under the mouse (yellow ring) |
| **WASD** | Move around the map |
| **−** **=** or mouse wheel | Zoom out and in (**0** resets) |
| **M** | Go to the next map |
| **E** | Close the editor |

**Starting a new map:** go to the `default` map (the blank white one) with **M**. It's a blank canvas 80 tiles wide and 50 tall. Paint over it, then export it under a **new name**, so `default.json` stays blank for next time.

**Changing a map you've already made:** go to it with **M** (or **Open map file**), edit it, **Export map** with the same name, and replace the old file in this folder with the new one.

## Playing a map without adding it to the game

Click **Open map file** in the editor and choose a `.json` file. You go straight to that map. It stays in the **M** list until you reload the page. This works even when the game isn't running through a local server (see below).

## Choosing the map the game starts on

In `maps.js`, set `START_MAP` to the map's name (its file name without `.json`):

```js
const START_MAP = 'forest';
```

## Where the maps come from

The **M** key goes through every map in this order:

1. The files in `MAP_FILES`, in the order they're listed
2. Any maps opened or exported since the page loaded

Opening or exporting a map with the same name as one that's already loaded replaces it until you reload the page.

Changes you make in the editor are lost when you go to a different map or reload, unless you export them first.

If `START_MAP` doesn't load (e.g. its file is missing), the game starts on the first map that did, and the browser console says so.

## Running the game locally

Browsers don't let a page read files from your computer's folders when it's opened by double-clicking the `.html` file (a `file://` address). To load maps from this folder, run the site through a local server:

- **VS Code:** install the *Live Server* extension, right-click `squimble-quest.html`, and choose *Open with Live Server*.
- **Terminal:** run `npx serve .` in the portfolio folder, then open the address it shows (e.g. `http://localhost:3000/squimble-quest.html`).

On the live site (GitHub Pages) it just works.

Without a server, no map files can load, so the game puts you on a small blank stand-in map with a message along the bottom explaining why. **Open map file** in the editor still works then, and the browser console (F12) explains which files didn't load.

## The file format

You can open a map in any text editor. It looks like this:

```json
{
  "format": "squimble-quest-map",
  "version": 1,
  "left": -20,
  "top": -12,
  "spawn": { "x": 0, "y": 0 },
  "showGrid": false,
  "legend": {
    ".": null,
    "w": "wall",
    "g": "grass",
    "W": "water"
  },
  "rows": [
    "wwwwwwwwww",
    "wggggggggw",
    "wggWWggggw",
    "wggWWg..gw",
    "wwwwwwwwww"
  ]
}
```

- **`rows`**: the map, one line per row of tiles, top row first. Each character is one tile.
- **`legend`**: which character means which tile (the names in `tiles.js`). `.` is always empty. The editor picks the characters when it exports, using the tile's first letter where it can.
- **`left`, `top`**: the tile column and row of the map's top-left corner. Tile `(0, 0)` is at the middle of the world, so `-20, -12` puts the middle of a 40 × 24 map there.
- **`spawn`**: where the player starts, in pixels (the centre of the player). Easiest to set with **P** in the editor.
- **`showGrid`**: `true` shows the tile grid all the time, like the default map.

You can edit a map by hand, for example by swapping letters in `rows` or adding a line to `legend`. Just keep every row the same length.

## If something goes wrong

- **The map isn't in the M list:** check the file is in this folder, its name is in `MAP_FILES` with `.json` on the end, and the game is running through a local server. The browser console (F12) says which file failed and why.
- **Some tiles are missing (empty):** the map uses a tile name that isn't in `tiles.js`, maybe because it was renamed. The console lists which. Add the tile back, or fix the name in the file's `legend`.
- **"This doesn't look like a Squimble Quest map file":** the file isn't a map, or it's been damaged. It needs a `legend` and `rows` at least.
