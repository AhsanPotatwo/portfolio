# Squimble Quest

Squimble Quest is a top-down RPG built with p5.js (v1.11, global mode) and plain JavaScript. It's played at `squimble-quest.html`. It has no build step, no modules and no npm. `squimble-quest.html` loads every file in this folder with `<script>` tags, in a set order, and they share globals.

## Keep this README and the comments up to date

This README and the comments in the code are the project's only notes. There's no separate handover document, so whoever picks the project up next (after a break, or for the first time) starts from what's written here. Whenever you change something, leave the notes true:

- **Changed how something works?** Update the comments next to it, and anything in this README or the maps README that describes it.
- **Added a file?** Add it to the file list at the top of `sketch.js`, and to the `<script>` tags in `squimble-quest.html` (the order matters).
- **Changed the map editor or the map file format?** Update the [maps README](../../assets/squimble-quest/maps/README.md). It's the guide to building maps.
- **Made a choice that isn't obvious from the code?** That includes why something is done a certain way, or something you tried that didn't work. Write it in a comment where it matters, or here if it affects the whole game.
- **Finished something under [Ideas for later](#ideas-for-later) or [Known issues](#known-issues-and-loose-ends)?** Take it off. **Found a problem, or left something half done?** Add it.
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
  - `getMap(name)` (maps.js) builds a map the first time it's needed and keeps it in `VISITED_MAPS`. That keeps defeated enemies gone and editor changes in place until the page reloads. `loadMap(name, doorName)` (sketch.js) goes to a map through it.
- **Doors** (`doors.js`): tiles that take the player to another map, or somewhere else on the same one (houses, caves, the next room of a castle).
  - Each map has a `doors` list of `{ name, col, row, to, toDoor, activate }`. Every door is both a way out and a place to arrive, so a house needs one door outside and one inside, each leading to the other.
  - Doors link by **name**, not position: `to` is a map name and `toDoor` a door name on that map (`''` means that map's spawn point). Moving a door never breaks links to it, but renaming it does.
  - `activate` is `step` (opens when stepped onto) or `interact` (press E within `DOOR_REACH`, which is more than a tile, so it works from the tile in front).
  - **Arriving on a step door doesn't bounce you back.** Step doors fire only when the player's tile *changes* onto them. `Doors.arrived()` marks the tile you land on as already stepped on. `loadMap` and `Player.respawn` call it, since you respawn where you arrived.
  - `doorProblem(door)` says what's wrong with where a door leads. It's used when going through a door (in-game message via `showMessage()` in hud.js), for red markers in the editor, and by `checkAllDoors()`, which warns in the console once the maps have loaded.
  - Doors are separate from tiles and objects, because those have nowhere to store where they lead. To make a door, trapdoor or manhole *look* like one, put an object on the same tile. An `interact` door works under a solid object, because E reaches it from the next tile.
- **TileMap** (`tilemap.js`):
  - Holds `tiles` (tile names, `null` for empty), `objects`, `enemySpawns` and `npcSpawns` (each `{ type, col, row }`), `doors`, `spawn` (the player's spawn, in world pixels) and `defeated`.
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
  - **Triggers** are things on the map that make something happen: the player's spawn and doors (`TRIGGER_TYPES`). They're placed by their own code in `Editor.update()`, not from a catalogue file. Placing a door opens its settings box.
  - **Right click** opens the settings of whatever's under the mouse (`editDoor()` for doors, the only thing with settings so far). Anything that gets settings later hooks in at the same spot in `Editor.update()`.
  - **Erase** sits at the left end of the bar on every tab. `Editor.selected` is `null` while it's picked. It's the only way to delete (right click used to erase too).
  - The **Map settings** button in the top right opens a panel with Resize map, New map, Open file and Export.
  - `FormBox` is the in-game box that asks for things: sizes for New map and Resize map, the fill tile for New map, the name for Export, and a door's settings. Give it a title and a list of rows, and it lays itself out. `Picker` is its "choose one of these" field (`tilePicker()` makes one for tiles).
  - While WASD pans the camera, the editor UI and dev panels fade out (`Editor.uiAlpha`, applied in `sketch.js`).
- **Dev mode** (`debug.js`): a compact status panel in the top left. The key lists are `DEV_KEYS` and `EDITOR_KEYS`, and **H** toggles them.

## Ideas for later

Only build these when they're needed.

- **Doors:**
  - objects that are doors (a door, trapdoor or manhole object that opens its door, see the end of the doors notes above)
  - a "back where you came from" target, for interiors that several doors share
  - a fade between maps
  - locked doors
  - an editor key to go through the door under the mouse
  - loading map files by name, instead of listing every one in `MAP_FILES`

## Known issues and loose ends

- **Open file uses the browser's file picker.** That has to stay, since only the browser can read files from the computer.
- **`TileMap.moveBox()` isn't used anywhere.** Characters call `moveAlongX`/`moveAlongY` directly. Its comment says so.
- **Hurt enemies come back at full health.** If an enemy was hurt but not killed, it's back in its starting spot at full health when you leave the area and return. Only defeated enemies are remembered.
- **Dying is a placeholder:** the player jumps back to their spawn with full health.
- **Renaming a door breaks doors leading to it.** Links go by name, so doors on other maps keep the old name. They show red in the editor, and the console lists them when the game loads.
- **Going through a door to the same map resets its characters.** `loadMap` runs `spawnCharacters()`, so living enemies go back to their spots (defeated ones stay gone).
- **Nothing stops a door being placed on a solid tile.** Arriving there leaves the player inside a wall. Put arrival doors on floor.
- **The spawn can end up on an empty tile.** Erasing the tile under it, or making a new map filled with `empty`, leaves the player stuck there. Nothing checks for this.
- **The New map fill picker steps one tile at a time.** Fine for now, but slow once there are lots of tiles.
- **The art is placeholders:** coloured rectangles until sprites exist. Every catalogue already has an `image` setting.

## Checking changes

- `node --check <file>` on each file catches syntax errors.
- For real behaviour, play it in the browser. To automate it, install `playwright-core` in a scratch folder, launch Chrome through it (`executablePath`), serve the site, then click and type into the canvas. The game's globals (`worldMap`, `enemies`, `Editor`, `loadMap`, ...) can be read directly with `page.evaluate`. When doing this:
  - The game is always 960 × 540, so work out click positions from the canvas's bounding box.
  - The first click on the canvas only gives it focus.
  - Use `page.keyboard.down/up` for held keys.
