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
- **G** shows or hides the tile grid

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
  - `getMap(name)` (maps.js) builds a map the first time it's needed and keeps it in `VISITED_MAPS`. That keeps editor changes in place until the page reloads. `loadMap(name, warpName)` (sketch.js) goes to a map through it.
- **Warps** (`warps.js`): tiles that take the player to another map, or somewhere else on the same one. Doors, cave entrances, manholes, trapdoors, secret passages and teleporters are all warps. "Warp" is the usual game name for this, and doesn't tie it to doors. A warp to the same map is a teleport: only the player moves, and the camera glides after them (a warp to another map jumps the camera there instead).
  - Warps only move the player. Something you press E at that does anything else (a sign, a chest, a lever) should be its own kind of trigger, and can copy how `Warps.inReach()` works.
  - Each map has a `warps` list of `{ name, col, row, to, toWarp, activate, enemies }`. Every warp is both a way out and a place to arrive, so a house needs one warp outside and one inside, each leading to the other.
  - Warps link by **name**, not position: `to` is a map name and `toWarp` a warp name on that map (`''` means that map's spawn point). Moving a warp never breaks links to it, but renaming it does.
  - `activate` is `step` (opens when stepped onto) or `interact` (press E within `WARP_REACH`, which is more than a tile, so it works from the tile in front).
  - **Enemies can follow** through a warp with `enemies: true`. When the player goes through, every enemy with an ai and the player inside its `sightRange` gets `enemy.following = { warp, time }`, where time is a straight-line walk to the warp plus `WARP_ENEMY_OPEN_TIME` for an E warp. On a same-map warp the enemy really walks there (`Enemy.followThroughWarp()`); on another map it can't, because maps the player isn't on stand still, so it's taken off the map into `Warps.followers` and counted down by `Warps.update()`. Either way `Warps.comeOut()` puts it on the arrival tile when time's up, even if a wall stopped it walking there. Enemies never go through warps on their own, only after the player.
  - **Arriving on a step warp doesn't bounce you back.** Step warps fire only when the player's tile *changes* onto them. `Warps.arrived()` marks the tile you land on as already stepped on. `loadMap` and `Player.respawn` call it, since you respawn where you arrived.
  - Warps keep track of the player's tile themselves (`feetTile()`), rather than reading `player.tileCol`/`tileRow`. Those are a frame late when the player dies and respawns in the middle of a frame, and that used to send them back out through the warp they'd arrived by.
  - `warpProblem(warp)` says what's wrong with where a warp leads. It's used when going through a warp (in-game message via `showMessage()` in hud.js), for red markers in the editor, and by `checkAllWarps()`, which warns in the console once the maps have loaded.
  - **The warp graph** (`warpgraph.js`): **Show links** in a warp's settings box draws every warp linked to it, both ways round, laid out like a family tree with arrows showing where each leads. `warpFamily()` works it out from every map's warps. A warp's children go in rows of up to `maxPerRow` (6), stacked downwards, so a hub with dozens of links stays readable instead of one huge row. Every row but the last is split either side of the line down from the parent, so lines never pass behind a box, and children without branches come first so they pack neatly. Links that aren't part of the tree (loops) are dashed. It starts at a readable zoom (`startZoom`) on the warp it was opened from, only draws what's on screen, drops the writing when zoomed right out, and the world isn't drawn under it (`sketch.js`), so it stays smooth with 100+ warps. `node-test`'s `square` (20 doors) is the test for this. Hovering over a box shows a window onto that warp's map, drawn by the game's own `drawWorld()` through a spare camera and clipped to the window. The camera always draws around the middle of the screen, so it's pointed off to the side by however far the window is from the middle. It sits over the settings box (which is still open underneath) and takes over its updates until it closes, and it uses the wheel, so dev mode's wheel zoom is off while a box is open.
  - Warps are separate from tiles and objects, because those have nowhere to store where they lead. To make a warp *look* like a door, trapdoor or manhole, put an object on the same tile. An `interact` warp works under a solid object, because E reaches it from the next tile.
- **TileMap** (`tilemap.js`):
  - Holds `tiles` (tile names, `null` for empty), `objects`, `enemySpawns` and `npcSpawns` (each `{ type, col, row }`), `warps`, `spawn` (the player's spawn, in world pixels) and `characters`.
  - Empty and off-map tiles count as solid.
  - `resize()` and `usedArea()` do the map resizing.
  - `SPAWN_KINDS` connects enemies and NPCs to their lists and their names in map files.
  - Tiles are drawn straight onto screen pixels, with every edge rounded to a whole pixel and shared by the tiles either side, so there's never a faint grid at any zoom. See the comment above `drawTiles()`.
- **Tile art** lives in `assets/squimble-quest/tiles/`: `normal/` for one picture per tile, `dual-grid/` for dual grid tilesets. A tile's `image` or `tileset` is just the file name, and `defineTile()` adds the folder. That folder's README and the guide at the top of `tiles.js` say how to add one.
- **Dual grid tiles** (`dualgrid.js`, switched on by `tileset` in `tiles.js`): ground like grass that blends into its neighbours with rounded edges. Maps and the editor don't know about it: a tile is still just `'grass'`, only drawing changes (the editor marks them with a badge, `drawDualBadge()`). `drawTiles()` draws the normal tiles first, then calls `drawDualCorner()` for every corner on a second grid half a tile across and down, where each piece picks from the tileset by which of the four tiles meeting there are grass (`DUAL_TILESET_LAYOUT`). The see-through edges show a normal tile from the same corner underneath. When two dual grid tiles meet, the one defined further down `tiles.js` goes on top (`layer`), so order them lowest first (e.g. dirt before grass). The tileset is cut into 16 separate pictures when it loads (`cutDualTileset()`), because drawing part of one big picture can pick up a line of the piece next to it at some zooms. `loadDualTileset(type)` works any time, not only in `preload()`, so changing a tile's tileset from the editor later is: set `type.tileset`, call it.
- **Every map remembers its characters.** When the player leaves a map, `loadMap` keeps its live `enemies` and `npcs` on `map.characters`, and hands them back when the player returns. So defeated enemies stay gone, hurt ones stay hurt, and everyone stays where they were, until the page reloads.
  - The spawn lists (`enemySpawns`, `npcSpawns`) are the design and never change when an enemy dies, so Export always saves every one.
  - `spawnCharacters()` makes everyone fresh from the spawn lists. It runs on a map's first visit and whenever the editor opens, closes or changes characters. Opening the editor is a quick way to reset enemies while testing.
  - This used to be a `defeated` set of spawns. Keeping the characters themselves replaced it, and also fixed hurt enemies healing when you left and came back.
- **Characters** (`character.js`):
  - The player, enemies and NPCs all take the same controls, `{ move, aim, attack }`. For the player they come from the keyboard and mouse. For enemies and NPCs they come from an `ai(entity, world, dt)` function.
  - Tiles' `onEnter` and `onStand` behaviours run for all characters.
  - `player.spawnX`/`spawnY` is where the player respawns. `loadMap` sets it to where they arrived (the warp they came in by, or the map's spawn), and so does placing the spawn in the editor.
- **UI** (`ui.js`, `button.js`, `textfield.js`):
  - Every element extends `UIElement`.
  - Groups let elements be shown, hidden and removed together.
  - A click that lands on UI is claimed, so gameplay never sees it.
  - `Input.typing = true` sends keys to `Input.typed` instead of the game. `TextField` and `NumberField` work with it: whatever owns the box decides which one is focused and calls `field.type(key)` for each key.
- **Editor** (`editor.js`):
  - The bottom bar has browser-style tabs for things to place: Tiles, Objects, Enemies, NPCs and Triggers. The tabs are only for things you place on the map; settings for the whole map go in the Map settings panel.
  - **Triggers** are things on the map that make something happen: the player's spawn and warps (`TRIGGER_TYPES`). They're placed by their own code in `Editor.update()`, not from a catalogue file. Placing a warp opens its settings box.
  - **Right click** opens the settings of whatever's under the mouse (`editWarp()` for warps, the only thing with settings so far). Anything that gets settings later hooks in at the same spot in `Editor.update()`.
  - **Erase** sits at the left end of the bar on every tab. `Editor.selected` is `null` while it's picked. It's the only way to delete (right click used to erase too).
  - The **Map settings** button in the top right opens a panel with Resize map, New map, Open file and Export.
  - `FormBox` is the in-game box that asks for things: sizes for New map and Resize map, the fill tile for New map, the name for Export, and a warp's settings. Give it a title and a list of rows, and it lays itself out. `Picker` is its "choose one of these" field (`tilePicker()` makes one for tiles).
  - While WASD pans the camera, the editor UI and dev panels fade out (`Editor.uiAlpha`, applied in `sketch.js`).
- **Dev mode** (`debug.js`): a compact status panel in the top left. The key lists are `DEV_KEYS` and `EDITOR_KEYS`, and **H** toggles them.

## Rules to keep when changing things

These aren't obvious from any one file, and breaking them causes bugs that are hard to trace.

- **Change maps only with `loadMap(name, warpName)`.** It puts the old map's characters away, gets the new map's out (or makes them on a first visit), places the player, tells warps they've arrived, and sets up the camera. Setting `worldMap` any other way skips all of that.
- **Anything that moves the player without walking must call `Warps.arrived(player, worldMap)` afterwards.** That's teleports, cutscenes, being carried or pushed. Otherwise a step warp on the tile they land on fires. `loadMap` and `Player.respawn` already do. Dev mode's **T** deliberately doesn't, so you can teleport onto a warp to test it.
- **The live characters are the globals `enemies` and `npcs`.** `map.characters` is only up to date for maps the player *isn't* on (it's written when they leave). Anything that looks at another map's characters reads `map.characters`. Anything about the current map uses the globals.
- **One map, one name.** `getMap()` names a map when it builds it, and only Export gives it a new name (the old name goes back to its file). Never let two names in `VISITED_MAPS` point at the same map. Warps, dev mode's **M** and Export all go by `map.name`.
- **Design and progress are kept apart.** Tiles, objects, spawn lists, warps and `spawn` are the design, and they're what Export saves. Progress (`map.characters`, the player's health and inventory) only lives in memory. A save system would need to store progress on its own, next to the map files rather than inside them.
- **The editor always shows the design.** Opening it, closing it, or changing characters runs `spawnCharacters()`, which resets the current map's enemies and NPCs to their spawns. Keep it that way, or the editor would show a half-played map as if it were the design.
- **A map's name is its file name,** and warps lead to maps by name. Renaming a map file breaks every warp that leads to it (they show red, and the console lists them).

## Ideas for later

Only build these when they're needed.

- **Warps:**
  - objects that are warps (a door, trapdoor or manhole object that opens its warp, see the end of the warps notes above)
  - a "back where you came from" target, for interiors that several warps share
  - a fade between maps
  - locked doors
  - an editor key to go through the warp under the mouse
  - loading map files by name, instead of listing every one in `MAP_FILES`

## Known issues and loose ends

- **Open file uses the browser's file picker.** That has to stay, since only the browser can read files from the computer. If a file won't open, the game says so with `showMessage()`, and the reason goes in the browser console.
- **`TileMap.moveBox()` isn't used anywhere.** Characters call `moveAlongX`/`moveAlongY` directly. Its comment says so.
- **Dying is a placeholder:** the player jumps back to their spawn with full health.
- **Map progress only lasts until the page reloads.** Defeated enemies and everything else come back on a reload, because there's no saving yet.
- **Renaming a warp breaks warps leading to it.** Links go by name, so warps on other maps keep the old name. They show red in the editor, and the console lists them when the game loads.
- **Nothing stops a warp being placed on a solid tile.** Arriving there leaves the player inside a wall. Put arrival warps on floor.
- **The spawn can end up on an empty tile.** Erasing the tile under it, or making a new map filled with `empty`, leaves the player stuck there. Nothing checks for this.
- **The New map fill picker steps one tile at a time.** Fine for now, but slow once there are lots of tiles.
- **The art is placeholders:** coloured rectangles until sprites exist. Every catalogue already has an `image` setting. Grass has a test dual grid tileset (`assets/squimble-quest/tiles/dual-grid/grass_tileset.png`).
- **Pixel art at in-between zooms:** art is drawn without blurring (`noSmooth()` in `sketch.js`), so at a zoom like 1.35 some art pixels come out a screen pixel wider than others. That's normal for pixel art that isn't at a whole-number size, and there are no gaps or lines between tiles.

## Checking changes

- `node --check <file>` on each file catches syntax errors.
- For real behaviour, play it in the browser. To automate it, install `playwright-core` in a scratch folder, launch Chrome through it (`executablePath`), serve the site, then click and type into the canvas. The game's globals (`worldMap`, `enemies`, `Editor`, `loadMap`, ...) can be read directly with `page.evaluate`. When doing this:
  - The game is always 960 × 540, so work out click positions from the canvas's bounding box.
  - The first click on the canvas only gives it focus.
  - Use `page.keyboard.down/up` for held keys.
