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
- **The catalogue files** (`tiles.js`, `objects.js`, `enemies.js`, `npcs.js`, `weapons.js`, `items.js`) each start with a "how to make one" guide. Tiles are made in the map editor instead of in code, see the tiles notes below.

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
- **Keep multiplayer possible.** It isn't planned, only a maybe (see [Ideas for later](#ideas-for-later)), so don't build anything for it. But when adding a feature, think about whether it would still work with more than one player, and prefer the way that would when it costs nothing extra:
  - only `sketch.js` reads the keyboard and mouse. Everything else gets `{ move, aim, attack }` controls or is told what happened
  - AIs and triggers find "the nearest player" through one small helper, rather than reading `world.player` all over
  - game state is plain numbers, strings and lists: no p5 colours or images in it (like tiles keep `fill` and `img` apart from their settings)
  - nothing in the gameplay depends on the whole world pausing (dialogue and the editor do now, see the note)
  - any randomness goes through one shared function, not `Math.random()` scattered about
- **UI goes inside the game.** Use the game's own UI (`ui.js`, `button.js`, `textfield.js`) rather than the browser's `prompt()` and `alert()` boxes.
- **Comments follow one style**, and they're a big part of the codebase:
  - lowercase, in plain everyday words a beginner could follow, explaining *why*
  - British spelling (`colour`)
  - no jargon without explaining it
  - every constant and object property gets a comment saying what it's for
  - when one file uses another file's global, the comment names that file, e.g. `// worldMap is the game's (sketch.js)`
- **The catalogue pattern:** things are defined with `defineObject/Enemy/Npc/Weapon/Item(name, settings)`, which all go through `defineType()` (utils.js) to fill in defaults. A setting that isn't in the defaults gets a console warning, since it's usually a typo, so a genuinely new setting needs its normal value adding to the defaults. The map editor picks up new ones by itself. Tiles are the exception: they're data in `tiles.json`, filled in with `TILE_DEFAULTS` the same way (unknown keys there are dropped).

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
  - **Arriving on a step warp doesn't bounce you back.** Step warps fire only when the player's tile *changes* onto them. `Warps.arrived()` marks the tile you land on as already stepped on. `loadMap` and `Player.respawn` call it, since the spawn point could be on a step warp.
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
- **Tiles** (`tiles.js`, `tileeditor.js`):
  - Every tile is one line in `assets/squimble-quest/tiles/tiles.json`: its name, colour, whether it's dual grid, its texture file, and what it does (solid, speed, `damagePerSecond`, `damagePerStep`, `healPerSecond`, `slippery`, `pushDirection`, `pushSpeed`), and `blendsWith`, which dual grid tiles round off onto it. The order is the editor bar's order, and the dual grid layer order.
  - `loadTileFile()` loads it with `fetch` before the maps (`sketch.js`), because loading a map checks its tiles exist. It waits for the textures too, so nothing flashes plain colour at the start. Like map files, a missing or broken file is a console warning and never stops the game: with no tiles at all there's just `blank`, for the stand-in map.
  - `setTile(settings, picture)` adds or changes a tile, and is the only way tiles get into `TILE_TYPES`. `tilesToData()` and `tilesDataToText()` turn them back into the file, and exporting without changing anything gives exactly the same file.
  - Textures live in `assets/squimble-quest/tiles/`: `normal/` for one picture per tile, `dual-grid/` for dual grid tilesets. `texture` is just the file name, and `texturePath()` adds the folder from `dualGrid`.
  - **The tile editor** (`tileeditor.js`) is a tabbed `FormBox` with a side column (`TilePreview` and **Choose picture**). The **Look** tab is built by hand; every other tab comes from `TILE_BEHAVIOURS`, one line per setting naming its tab, so a new setting or a whole new tab is one line there. A tab with more than `TILE_EDITOR_ROWS` rows carries on in a numbered tab. Changing a tile that's already on the map shows on the map as you go (`onUpdate` calls `setTile()` whenever the box's settings change and would save), and closing without saving puts the tile back from a copy taken when the box opened (`onCancel`). **Save** calls `setTile()` with the chosen picture, so a tile works straight away even before its picture is in the folder. **Export tiles** downloads `tiles.json`, plus any picture chosen since the page loaded (`TileEditor.newPictures`), because the game can only load textures from its own folders. It can't rename or delete tiles: maps store tile names, so either would lose the tile from every map using it.
  - Tiles are data, not code, so they can't run their own code the way `onEnter`/`onStand` used to. Damage and speed cover what tiles did. Something new (e.g. a tile that teleports you) would need a new setting in `TILE_DEFAULTS`, handled in `walk()` or `checkTile()` (`character.js`) and given a line in `TILE_BEHAVIOURS`.
- **Dual grid tiles** (`dualgrid.js`, switched on by `dualGrid` in `tiles.json`): ground like grass that blends into its neighbours with rounded edges. Maps and the editor don't know about it: a tile is still just `'grass'`, only drawing changes (the editor marks them with a badge, `drawDualBadge()`). `drawTiles()` draws the normal tiles first, then calls `drawDualCorner()` for every corner on a second grid half a tile across and down, where each piece picks from the tileset by which of the four tiles meeting there are grass (`DUAL_TILESET_LAYOUT`). The see-through edges show a normal tile from the same corner underneath. A tile whose `blendsWith` leaves a dual grid tile out counts as covered in that piece's 1s and 0s, so the piece runs straight up to it, and that quarter of the piece isn't drawn (`cut`), leaving the tile showing. When two dual grid tiles meet, the one further down `tiles.json` goes on top (`layer`), so order them lowest first (e.g. dirt before grass). New tiles go on the end, so they're on top. The tileset is cut into 16 separate pictures whenever a tile gets it (`useTexture()` in `tiles.js`, `cutDualTileset()`), because drawing part of one big picture can pick up a line of the piece next to it at some zooms. `dualTilesetProblem()` says why a picture can't be a tileset, for the tile editor.
- **Every map remembers its characters.** When the player leaves a map, `loadMap` keeps its live `enemies` and `npcs` on `map.characters`, and hands them back when the player returns. So defeated enemies stay gone, hurt ones stay hurt, and everyone stays where they were, until the page reloads.
  - The spawn lists (`enemySpawns`, `npcSpawns`) are the design and never change when an enemy dies, so Export always saves every one.
  - `spawnCharacters()` makes everyone fresh from the spawn lists. It runs on a map's first visit and whenever the editor opens, closes or changes characters. Opening the editor is a quick way to reset enemies while testing.
  - This used to be a `defeated` set of spawns. Keeping the characters themselves replaced it, and also fixed hurt enemies healing when you left and came back.
- **Characters** (`character.js`):
  - The player, enemies and NPCs all take the same controls, `{ move, aim, attack }`. For the player they come from the keyboard and mouse. For enemies and NPCs they come from an `ai(entity, world, dt)` function.
  - Tiles' settings work for all characters: `speed`, `slippery` and the push in `walk()`, damage and healing in `checkTile()`. `velocity` is only kept for slippery tiles; everywhere else it's replaced every frame.
  - Dying respawns the player at the current map's `spawn`, never where they arrived. This used to be where they arrived (the warp they came in by), so going into a building and back out moved your respawn to its door. Reading `worldMap.spawn` directly also means moving the spawn in the editor takes effect straight away. How respawning should work isn't decided yet, see [Known issues](#known-issues-and-loose-ends).
- **Inventory** (`inventory.js`):
  - The player's inventory is one row of slots: the first `HOTBAR_SIZE` are the hotbar, the next `BAG_SIZE` the bag. Only hotbar slots can be picked (held). `add()` fills the first empty slot, hotbar first.
  - **E or I** opens the inventory screen (`InventoryScreen`). E only does it when there's no NPC to talk to or E warp in reach, so I always works. The game carries on while it's open, but the player stands still and nothing's in reach. Drag an item onto a slot to swap, or outside the box to drop it. The map editor closes it.
  - **Q** drops the held item. Dropped items are thrown about `DROP_DISTANCE` roughly the way the player's aiming, with a small random spread (`DROP_SPREAD`). A drop tries a few random spots and keeps the first `DROP_GAP` clear of other items, so they don't pile up. They're moved with the map's collision so they stop at walls. Each map keeps its own in `map.drops` (progress, like `map.characters`).
  - A dropped item can't be picked up until the player has been out of `PICKUP_RANGE` of it. That stops it being picked straight back up, and makes "inventory full" show once per walk up to it rather than every frame.
  - Each item has a `category` (`ITEM_CATEGORIES` in items.js), which only decides its editor tab, and a `rarity` (`RARITIES`), whose colour is its glow on the ground, in slots and in the palette (`drawItemGlow()`), and the held item's name above the hotbar. Both lists are placeholders: a new line in either is all a new category or rarity needs. Rarity is per item type for now, not per item.
- **UI** (`ui.js`, `button.js`, `textfield.js`, `formbox.js`):
  - Every element extends `UIElement`.
  - Groups let elements be shown, hidden and removed together.
  - A click that lands on UI is claimed, so gameplay never sees it.
  - `Input.typing = true` sends keys to `Input.typed` instead of the game. `TextField` and `NumberField` work with it: whatever owns the box decides which one is focused and calls `field.type(key)` for each key. Ctrl + V arrives as `{ paste: text }` in `Input.typed` and goes to `field.paste(text)`. `ColourField` takes pasted hex or rgb and has a square that opens the browser's own colour picker (`<input type="color">`).
- **Editor** (`editor.js`):
  - It's laid out like a game engine: `EditorToolbar` along the top (New, Open, Resize, Export, the Paint and Erase tools, Grid, Keys and Play), `EditorDock` on the right (the palette's tabs, `PaletteGrid`, and the inspector) and `EditorStatusBar` along the bottom. Sizes are in `EDITOR_LAYOUT`, colours in `EDITOR_COLOURS`, and its buttons use the compact `editor` / `editorPrimary` styles in `BUTTON_STYLES`.
  - The palette's tabs are only for things you place on the map; whole-map actions are in the toolbar. `EditorTabStrip` draws them at their natural width and scrolls (wheel, or the **‹ ›** that appear when they don't fit), so `EDITOR_TABS` can grow. **Sounds** and **Lights** are empty example tabs.
  - **Weapons** and **Items** get one tab per `ITEM_CATEGORIES` entry. Clicking the map puts the item on the ground as a drop (`Drops.place()`), so like any drop it's progress, not saved by Export. **Give** adds one to the inventory, and **Edit** (or right click in the palette) changes its name, rarity, colour and weapon numbers in memory, until reload.
  - **Triggers** are things on the map that make something happen: the player's spawn and warps (`TRIGGER_TYPES`). They're placed by their own code in `Editor.update()`, not from a catalogue file. Placing a warp opens its settings box.
  - **Right click** opens the settings of whatever's under the mouse (`editWarp()` for warps, the only thing with settings so far). Anything that gets settings later hooks in at the same spot in `Editor.update()`.
  - **Erase** is a tool in the toolbar. `Editor.selected` is `null` while it's picked, and **Paint** goes back to `Editor.lastPicked`. It's the only way to delete (right click used to erase too).
  - `FormBox` (formbox.js, with its `Picker` and `Checkbox` fields) is the in-game box that asks for things: sizes for New map and Resize map, the fill tile for New map, the name for Export, a warp's settings and a tile's. Give it a title and a list of rows (or `tabs`, each with its own rows), and it lays itself out. `side` adds a column of extra elements beside the rows (the tile editor's pictures). `Picker` is its "choose one of these" field (`tilePicker()` in editor.js makes one for tiles). A row's field can be any UI element with a `value`. It's a window: dragging the title bar moves every element in the `form-box` group, and the **×** closes it like Cancel. `onUpdate` runs every frame while it's open and `onCancel` when it closes without saying yes.
  - `PaletteGrid` is one UI element that draws and hit-tests every square itself, reading the catalogues each frame, so a new tile shows up by itself. It scrolls (clipped to the palette) and uses up `Input.wheel` while hovered, so the camera doesn't zoom too. **Right click** on a tile's square opens the tile editor. The inspector's **New** and **Export** only show on the Tiles tab, **Edit** while a tile is picked.
  - While WASD pans the camera, the editor UI and dev panels fade out (`Editor.uiAlpha`, applied in `sketch.js`).
- **Dev mode** (`debug.js`): a compact status panel in the top left. The key lists are `DEV_KEYS` and `EDITOR_KEYS`, and **H** toggles them.

## Where to add things

The quickest route for common additions. Each file's own header has the details.

| To add | Do this |
|---|---|
| An object, enemy, NPC, weapon or item | A `defineX()` line at the bottom of its catalogue file. New settings need a default in its `X_DEFAULTS`. |
| An enemy or NPC behaviour | An `ai(entity, world, dt)` function returning `{ move, aim, attack }`, next to `chasePlayer` in enemies.js. |
| A tile | In the game: map editor, Tiles tab, **New** in the inspector, then **Export**. |
| A tile setting | Its default in `TILE_DEFAULTS` (tiles.js), what it does in `walk()` or `checkTile()` (character.js), and one line in `TILE_BEHAVIOURS` (tileeditor.js), which gives it an editor row and tab. |
| A map | Export it from the editor into `assets/squimble-quest/maps/`, and add the file to `MAP_FILES` (maps.js). |
| A key | Its action in `KEYS` (config.js), then `Input.isDown/wasPressed('action')`. A dev tool also goes in `DEV_KEYS` (debug.js). |
| A kind of thing to place in the editor | A line in `EDITOR_TABS` (editor.js), and placing it in `Editor.update()`. A new kind of character also needs `SPAWN_KINDS` (tilemap.js). |
| A box that asks for things | `FormBox.open({ title, rows, onConfirm })` (formbox.js). Use `tabs` instead of `rows` for lots of settings. |
| A new kind of UI element | A class extending `UIElement`, see the guide at the top of ui.js. Buttons: the guide in button.js. |
| Loading or saving a file | `fetchJson()`, `pickFile()`, `downloadTextFile()` and `downloadData()` in utils.js. |
| A new file | Its `<script>` tag in `squimble-quest.html` (order matters) and a line in the list at the top of sketch.js. |

## Rules to keep when changing things

These aren't obvious from any one file, and breaking them causes bugs that are hard to trace.

- **Change maps only with `loadMap(name, warpName)`.** It puts the old map's characters away, gets the new map's out (or makes them on a first visit), places the player, tells warps they've arrived, and sets up the camera. Setting `worldMap` any other way skips all of that.
- **Anything that moves the player without walking must call `Warps.arrived(player, worldMap)` afterwards.** That's teleports, cutscenes, being carried or pushed. Otherwise a step warp on the tile they land on fires. `loadMap` and `Player.respawn` already do. Dev mode's **T** deliberately doesn't, so you can teleport onto a warp to test it.
- **The live characters are the globals `enemies` and `npcs`.** `map.characters` is only up to date for maps the player *isn't* on (it's written when they leave). Anything that looks at another map's characters reads `map.characters`. Anything about the current map uses the globals.
- **One map, one name.** `getMap()` names a map when it builds it, and only Export gives it a new name (the old name goes back to its file). Never let two names in `VISITED_MAPS` point at the same map. Warps, dev mode's **M** and Export all go by `map.name`.
- **Design and progress are kept apart.** Tiles, objects, spawn lists, warps and `spawn` are the design, and they're what Export saves. Progress (`map.characters`, `map.drops`, the player's health and inventory) only lives in memory. A save system would need to store progress on its own, next to the map files rather than inside them.
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
- **Items:**
  - stacking (arrows, potions), which would need a count on each item
  - items placed in the editor aren't saved in the map file. That would need a list of them in the map file, like `spawns`, and a decision on whether picked-up ones come back
  - item edits made in the editor are lost on reload. Copy the numbers into `items.js` / `weapons.js` by hand for now
  - Speedy Shoes do nothing yet
  - items as data files, like `tiles.json`. They're code in `items.js` for now, like weapons and enemies, because nothing makes them in the game. Files would only be worth it with an in-game item editor. Their art already goes in its own folder (`image: 'assets/squimble-quest/items/axe.png'`).
- **Multiplayer, maybe.** Only a possibility, not a decision. The idea is a small social game: a group of friends, up to about a classroom (20–40 players), playtesting and hanging out together, never hundreds. If it ever happens:
  - **What already helps:** every character runs on `{ move, aim, attack }` controls, so another player is just a `Player` whose controls come over the network. Maps and tiles are data files a server can load too. Progress is already kept apart from the design. The only randomness (where dropped items land) goes through `randomBetween()` in utils.js.
  - **What's in the way:** the game assumes one player and one running map (the globals `player`, `worldMap`, `enemies`, `npcs`, and `loadMap()` swapping the world). With players on different maps, each map with players on it would have to keep running, so maps become "rooms". Also single-player: the warp step tracking (`Warps.lastCol`), enemies following through warps, `chasePlayer` and enemy `targets()` only knowing `world.player`, dialogue and the editor pausing everything, and some rules code needing p5 (`color()` in `MeleeSwing` and `setTile()`).
  - **At that size it needs a small server** (Node and WebSockets, cheap to host), not one player's browser hosting: a host's upload and a hidden tab slowing down would stall everyone, and school networks often block browser-to-browser connections. The server would run the game's rules without p5, so rules and drawing would need separating first. Each player only needs updates about the map they're on.
  - **Social parts on top:** names over heads, chat (and filtering it, if younger players might join), emotes, and hangout maps sized for a crowd.

## Known issues and loose ends

- **Open file uses the browser's file picker.** That has to stay, since only the browser can read files from the computer. If a file won't open, the game says so with `showMessage()`, and the reason goes in the browser console.
- **NPCs can be hurt by tiles.** Damage tiles hurt everyone, and an NPC that runs out of health is marked `dead` but keeps standing there: it can still be talked to, and others walk through it. Nothing places NPCs on damage tiles yet. When NPCs can die properly, handle it in `Npc` (npc.js), like `Enemy.die()`.
- **Dying is a placeholder:** the player jumps back to a spawn point with full health.
- **Respawning: where you come back isn't decided yet.** For now it's the spawn point of the map you died on, so dying in the hut puts you in the hut. Other options are always the game's start, the warp you last came in by (how it used to work), or checkpoints. Everything about it is in `Player.respawn()` (player.js), marked `ponytail:`, with notes on how to do each option, so changing it only means changing that one function.
- **Map progress only lasts until the page reloads.** Defeated enemies and everything else come back on a reload, because there's no saving yet.
- **Renaming a warp breaks warps leading to it.** Links go by name, so warps on other maps keep the old name. They show red in the editor, and the console lists them when the game loads.
- **Nothing stops a warp being placed on a solid tile.** Arriving there leaves the player inside a wall. Put arrival warps on floor.
- **The spawn can end up on an empty tile.** Erasing the tile under it, or making a new map filled with `empty`, leaves the player stuck there. Nothing checks for this.
- **The New map fill picker steps one tile at a time.** Fine for now, but slow once there are lots of tiles.
- **The art is placeholders:** coloured rectangles until sprites exist. Every catalogue already has an `image` setting (`texture` for tiles). Grass has a test dual grid tileset (`assets/squimble-quest/tiles/dual-grid/grass_tileset.png`).
- **Normal tiles are one picture each.** A normal tile's texture is stretched over every tile of that kind. Variations (a few pictures picked at random so a big floor doesn't look repeated) or animated tiles would build on `useTexture()` in `tiles.js`.
- **The tile editor can't rename, delete or reorder tiles.** Do those in `tiles.json` by hand. Renaming or deleting a tile loses it from every map that uses it.
- **Pixel art at in-between zooms:** art is drawn without blurring (`noSmooth()` in `sketch.js`), so at a zoom like 1.35 some art pixels come out a screen pixel wider than others. That's normal for pixel art that isn't at a whole-number size, and there are no gaps or lines between tiles.

## Checking changes

- `node --check <file>` on each file catches syntax errors.
- For real behaviour, play it in the browser. To automate it, install `playwright-core` in a scratch folder, launch Chrome through it (`executablePath`), serve the site, then click and type into the canvas. The game's globals (`worldMap`, `enemies`, `Editor`, `loadMap`, ...) can be read directly with `page.evaluate`. When doing this:
  - The game is always 960 × 540, so work out click positions from the canvas's bounding box.
  - The first click on the canvas only gives it focus.
  - Use `page.keyboard.down/up` for held keys.
- For a refactor that shouldn't change anything, compare before and after: in `page.evaluate`, call `noLoop()`, then call `draw()` yourself with `window.deltaTime = 1000 / 60` and `Input.held` set to the keys you want, and record positions, health and a hash of the canvas pixels at checkpoints. Pin `window.frameRate = () => 60` first, or the dev panel's fps makes frames differ. `mapsReady`, `worldMap` and the other `let` globals aren't on `window`, so read them by name.
