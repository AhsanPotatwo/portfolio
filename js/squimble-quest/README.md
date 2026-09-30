# Squimble Quest

Squimble Quest is a top-down RPG built with p5.js (v1.11, global mode) and plain JavaScript. It's played at `squimble-quest.html`. It has no build step, no modules and no npm. `squimble-quest.html` loads every file in this folder with `<script>` tags, in a set order, and they share globals.

## Keep this README and the comments up to date

This README and the comments in the code are the project's only notes. There's no separate handover document, so whoever picks the project up next (after a break, or for the first time) starts from what's written here. Whenever you change something, leave the notes true:

- **Changed how something works?** Update the comments next to it, and anything in this README or the maps README that describes it.
- **Added a file?** Add it to the file list at the top of `sketch.js`, and to the `<script>` tags in `squimble-quest.html` (the order matters).
- **Changed the map editor or the map file format?** Update the [maps README](../../assets/squimble-quest/maps/README.md). It's the guide to building maps.
- **Made a choice that isn't obvious from the code?** That includes why something is done a certain way, or something you tried that didn't work. Write it in a comment where it matters, or here if it affects the whole game.
- **Finished something under [Planned](#planned-doors-between-areas) or [Known issues](#known-issues-and-loose-ends)?** Take it off. **Found a problem, or left something half done?** Add it.
- **Found a note that's no longer true?** Fix it or delete it. A wrong note is worse than no note.

## Start here

- **`sketch.js`** has the game loop, and its header lists every file and what it does. Read that first.
- **[`assets/squimble-quest/maps/README.md`](../../assets/squimble-quest/maps/README.md)** is the map editor guide and the map file format.
- **The catalogue files** (`tiles.js`, `objects.js`, `enemies.js`, `npcs.js`, `weapons.js`, `items.js`) each start with a "how to make one" guide.

**Running it:** map files are loaded with `fetch`, so the page needs a local server (see "Running the game locally" in the maps README). For example, run `py -m http.server 8765` from the portfolio root, then open `http://localhost:8765/squimble-quest.html`. Opened straight from the file (`file://`), the game falls back to a blank stand-in map.

**Dev mode:** press **`** or **Ctrl + D**. Then:
- **H** lists the keys
- **B** opens the map editor
- **M** goes to the next map
- **T** teleports to the mouse
- **-**, **=** and **0** zoom out, zoom in and reset the zoom

## How the code is written

- **Keep things simple.** Build the smallest thing that works. Don't add features, settings or layers "for later".
- **UI goes inside the game.** Use the game's own UI (`ui.js`, `button.js`, `textfield.js`) rather than the browser's `prompt()` and `alert()` boxes.
- **Comments follow one style**, and they're a big part of the codebase:
  - lowercase, in plain everyday words a beginner could follow, explaining *why*
  - British spelling (`colour`)
  - no jargon without explaining it
  - every constant and object property gets a comment saying what it's for
  - when one file uses another file's global, the comment names that file, e.g. `// worldMap is the game's (sketch.js)`
- **The catalogue pattern:** things are defined with `defineTile/Object/Enemy/Npc/Weapon/Item(name, settings)`, which fills in defaults. The map editor picks up new ones by itself.

## How it fits together

- **Maps** (`maps.js`, `mapfile.js`, `tilemap.js`):
  - Each map is one JSON file in `assets/squimble-quest/maps/`, listed in `MAP_FILES`. The file format is at the top of `mapfile.js`.
  - `MAPS[name]` is a function that builds the map fresh. Always add maps with `addMap()`, which also forgets any visited copy.
  - `loadMap(name)` (sketch.js) reuses the copy in `VISITED_MAPS` if the map has been visited. That keeps defeated enemies gone and editor changes in place until the page reloads.
- **TileMap** (`tilemap.js`):
  - Holds `tiles` (tile names, `null` for empty), `objects`, `enemySpawns` and `npcSpawns` (each `{ type, col, row }`), `spawn` (the player's spawn, in world pixels) and `defeated`.
  - Empty and off-map tiles count as solid.
  - `resize()` and `usedArea()` do the map resizing.
  - `SPAWN_KINDS` connects enemies and NPCs to their lists and their names in map files.
- **Enemies:** when one dies, its spawn goes into `map.defeated`. Its spawn stays in the list, so Export always saves it. `spawnCharacters()` skips defeated ones. Opening the editor clears `defeated`, so the editor shows the whole design, and it's a quick way to reset enemies while testing.
- **Characters** (`character.js`):
  - The player, enemies and NPCs all take the same controls, `{ move, aim, attack }`. For the player they come from the keyboard and mouse. For enemies and NPCs they come from an `ai(entity, world, dt)` function.
  - Tiles' `onEnter` and `onStand` behaviours run for all characters.
  - `player.spawnX`/`spawnY` is where the player respawns. `loadMap` sets it, and so does placing the spawn in the editor.
- **UI** (`ui.js`, `button.js`, `textfield.js`):
  - Every element extends `UIElement`.
  - Groups let elements be shown, hidden and removed together.
  - A click that lands on UI is claimed, so gameplay never sees it.
  - `Input.typing = true` sends keys to `Input.typed` instead of the game. `TextField` and `NumberField` work with it: whatever owns the box decides which one is focused and calls `field.type(key)` for each key.
- **Editor** (`editor.js`):
  - The bottom bar has browser-style tabs for things to place: Tiles, Objects, Enemies, NPCs and Triggers. The tabs are only for things you place on the map; settings for the whole map go in the Map settings panel.
  - **Triggers** are things on the map that make something happen. So far there's only the player's spawn (`TRIGGER_TYPES`). They're placed by their own code in `Editor.update()`, not from a catalogue file.
  - **Erase** sits at the left end of the bar on every tab. `Editor.selected` is `null` while it's picked.
  - The **Map settings** button in the top right opens a panel with Resize map, New map, Open file and Export.
  - `FormBox` is the in-game box that asks for things: sizes for New map and Resize map, the fill tile for New map (`TilePicker`), and the name for Export. Give it a title and a list of rows, and it lays itself out.
  - While WASD pans the camera, the editor UI and dev panels fade out (`Editor.uiAlpha`, applied in `sketch.js`).
- **Dev mode** (`debug.js`): a compact status panel in the top left. The key lists are `DEV_KEYS` and `EDITOR_KEYS`, and **H** toggles them.

## Planned: doors between areas

This design is agreed, but nothing is built yet. The goal is towns with houses, buildings with many rooms, and areas with several entrances, all made in the editor.

- **Each place is its own map file.** Rooms on the same floor of a building can share one map.
- **Two new lists in the map file:**
  - `entrances`: `{ name, col, row }`, named arrival points. The current `spawn` becomes the default entrance.
  - `exits`: `{ col, row, to, entrance, trigger }`, tiles that send the player to map `to`, entrance `entrance`. `trigger` is `walk` (step on it) or `interact` (press E).
- **Link by name, not position,** so maps can be edited separately without breaking each other.
- `loadMap(name, entrance)` puts the player at that entrance.
- **Only fire an exit when the player steps onto it,** the way tile `onEnter` works (`checkTile` in `character.js`).
- **Watch out:** `player.placeAt()` resets the player's current tile on purpose, so the tile they arrive on counts as freshly stepped on. An entrance on an exit tile would send the player straight back. Put entrances next to exits, not on them, or make exits ignore the tile the player arrived on.
- **Exits need their own list, not a door tile type,** because a tile has nowhere to store where it leads.
- **Editor:**
  - exits and entrances go in the Triggers tab, with the target typed into a `FormBox`
  - markers drawn on the map, like the spawn ring
  - a check after `loadMapFiles()` that warns about exits pointing at missing maps or entrances
  - a key to go through the exit under the mouse
- **Later, only when needed:**
  - an exit target meaning "back where you came from", for shared interiors
  - a fade between maps
  - locked doors
  - loading map files by name, instead of listing every one in `MAP_FILES`

## Known issues and loose ends

- **Open file uses the browser's file picker.** That has to stay, since only the browser can read files from the computer.
- **`TileMap.moveBox()` isn't used anywhere.** Characters call `moveAlongX`/`moveAlongY` directly. Its comment says so.
- **Hurt enemies come back at full health.** If an enemy was hurt but not killed, it's back in its starting spot at full health when you leave the area and return. Only defeated enemies are remembered.
- **Dying is a placeholder:** the player jumps back to their spawn with full health.
- **The spawn can end up on an empty tile.** Erasing the tile under it, or making a new map filled with `empty`, leaves the player stuck there. Nothing checks for this.
- **The New map fill picker steps one tile at a time.** Fine for now, but slow once there are lots of tiles.
- **The art is placeholders:** coloured rectangles until sprites exist. Every catalogue already has an `image` setting.

## Checking changes

- `node --check <file>` on each file catches syntax errors.
- For real behaviour, play it in the browser. To automate it, install `playwright-core` in a scratch folder, launch Chrome through it (`executablePath`), serve the site, then click and type into the canvas. The game's globals (`worldMap`, `enemies`, `Editor`, `loadMap`, ...) can be read directly with `page.evaluate`. When doing this:
  - The game is always 960 × 540, so work out click positions from the canvas's bounding box.
  - The first click on the canvas only gives it focus.
  - Use `page.keyboard.down/up` for held keys.
