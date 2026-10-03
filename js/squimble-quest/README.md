# Squimble Quest

Top-down RPG in p5.js (v1.11, global mode) and plain JavaScript, played at `squimble-quest.html`. No build step, modules or npm: the page loads every file here with `<script>` tags in a set order, sharing globals.

## Keep the notes true

This README and the code comments are the only notes. When you change something:

- **Changed how something works?** Update the comments beside it, and this README or the maps README where they describe it.
- **Added a file?** Add it to the list atop `sketch.js` and the `<script>` tags in `squimble-quest.html` (order matters).
- **Changed the map editor or map format?** Update the [maps README](../../assets/squimble-quest/maps/README.md) (the map-building guide).
- **Made a non-obvious choice** (a why, or something tried that failed)? Comment it where it matters, or note it here if it's game-wide.
- **Finished an [idea](#ideas-for-later) or [known issue](#known-issues-and-loose-ends)?** Remove it. **Found a problem or left something half done?** Add it.
- **Found a stale note?** Fix or delete it. A wrong note is worse than none.

## Start here

- **`sketch.js`**: the game loop; its header lists every file. Read it first.
- **[maps README](../../assets/squimble-quest/maps/README.md)**: map editor guide and map file format.
- **Catalogue files** (`tiles.js`, `objects.js`, `enemies.js`, `npcs.js`, `weapons.js`, `items.js`) each open with a "how to make one" guide. Tiles, weapons and items are data files the editor can change and export (see Tiles and Inventory below).

**Running:** maps load with `fetch`, so serve it locally (see "Running the game locally" in the maps README), e.g. `py -m http.server 8765` from the portfolio root, then `http://localhost:8765/squimble-quest.html`. From `file://` it falls back to a blank stand-in map.

**Dev mode:** **`** or **Ctrl + D**. Then **H** lists keys, **B** map editor, **M** next map, **T** teleport to mouse, **- = 0** zoom out/in/reset, **G** toggle tile grid.

## How the code is written

- **Keep it simple.** Build the smallest thing that works. No features, settings or layers "for later".
- **Keep multiplayer possible** (only a maybe, see [Ideas](#ideas-for-later); don't build for it). Prefer the multiplayer-safe way when it costs nothing:
  - only `sketch.js` reads keyboard and mouse; everything else gets `{ move, aim, attack }` controls or is told what happened
  - AIs and triggers find players with `nearestPlayer(world, from)` (character.js) from the `world.players` list, never assuming one player
  - per-player state lives on the player (e.g. `player.warpTile` for step warps), not in a shared global
  - game state is plain numbers, strings and lists, no p5 colours or images (tiles keep `fill`/`img` apart from their settings; `MeleeSwing` makes its colour in `draw()`)
  - gameplay never pauses the world: talking to an NPC doesn't (the dev-only editor does)
  - randomness goes through one shared function, not scattered `Math.random()`
- **In-game UI** (`ui.js`, `button.js`, `textfield.js`), never `prompt()`/`alert()`.
- **Comment style:** lowercase, British spelling (`colour`), concise: say *why*, or what isn't obvious from the code; don't restate it. Explain jargon. Constants and object properties get a short note on purpose or units unless the name says it all. Name the file of another file's global, e.g. `// worldMap is the game's (sketch.js)`.
- **Catalogue pattern:** `defineObject/Enemy/Npc/Weapon/Item(name, settings)` all go through `defineType()` (utils.js), which fills defaults and warns on settings missing from them (usually typos), so a genuinely new setting needs a default. The editor picks new entries up automatically. Tiles are data in `tiles.json`, filled from `TILE_DEFAULTS` (unknown keys dropped). Weapons and items are data in `assets/squimble-quest/items/items.json` but load through `defineWeapon()`/`defineItem()` (`loadItemFile()`), so unknown keys warn. Both files are written back one entry per line, non-default settings only (`typeToData()`, `jsonLine()` in utils.js).

## How it fits together

- **Maps** (`maps.js`, `mapfile.js`, `tilemap.js`):
  - One JSON file per map in `assets/squimble-quest/maps/`, listed in `MAP_FILES`. Format at the top of `mapfile.js`.
  - `MAPS[name]` builds a map fresh. Always add maps with `addMap()`, which also drops any visited copy.
  - `getMap(name)` builds on first need and keeps it in `VISITED_MAPS`, so editor changes last until reload. `loadMap(name, warpName)` (sketch.js) goes to a map through it.
- **Warps** (`warps.js`, whose header has the full spec): tiles that move the player to another map or elsewhere on this one (doors, caves, manholes, trapdoors, passages, teleporters). A same-map warp is a teleport: only the player moves and the camera glides (another map snaps it).
  - Warps only move the player. Other E-interactables (signs, chests, levers) should be their own trigger kind, copying `Warps.inReach()`.
  - Each map's `warps`: `{ name, col, row, to, toWarp, activate, enemies }`. Every warp is both exit and arrival, so a house needs two, each leading to the other.
  - Links go by **name**: `to` a map name, `toWarp` a warp name there (`''` = that map's spawn). Moving a warp is safe; renaming breaks links to it.
  - `activate`: `step` (on stepping onto it) or `interact` (E within `WARP_REACH`, over a tile, so it works from the tile in front).
  - **Enemies can follow** with `enemies: true`: on use, each enemy with an ai and the player in `sightRange` gets `enemy.following = { warp, time }` (straight-line walk time, plus `WARP_ENEMY_OPEN_TIME` for E warps). Same map: it really walks (`Enemy.followThroughWarp()`). Other map: maps the player isn't on stand still, so it moves into `Warps.followers` and `Warps.update()` counts down. Either way `Warps.comeOut()` places it on the arrival tile when due, even if a wall blocked it. Enemies never use warps on their own.
  - **Arriving on a step warp doesn't bounce you back:** step warps fire only when the player's tile *changes* onto them, and `Warps.arrived()` marks the landing tile as stepped on (`loadMap` and `Player.respawn` call it).
  - Warps track the player's tile themselves (`feetTile()`), not `player.tileCol`/`tileRow`, which lag a frame after a mid-frame death and respawn; that used to send players back out the warp they arrived by.
  - `warpProblem(warp)` explains a broken target. Used when warping (`showMessage()`, hud.js), for red editor markers, and by `checkAllWarps()` (console warnings once maps load).
  - **Warp graph** (`warpgraph.js`): **Show links** in a warp's settings draws every linked warp, both directions, as a family tree with arrows. `warpFamily()` builds it from every map's warps. Children go in rows of up to `maxPerRow` (6) stacked downwards so big hubs stay readable; every row but the last splits around the parent's line so lines never pass behind boxes, and leaf children come first to pack neatly. Non-tree links (loops) are dashed. It opens at `startZoom` on the source warp, draws only what's on screen, drops text when zoomed far out, and `sketch.js` skips drawing the world under it, so 100+ warps stay smooth (`node-test`'s `square`, 20 doors, is the test). Hovering a box shows a window onto that warp's map, drawn by `drawWorld()` through a spare camera and clipped; since cameras centre on the screen, it's offset by the window's distance from centre. It sits over the settings box (still open beneath), takes over its updates until closed, and uses the wheel, so dev mode's wheel zoom is off while a box is open.
  - Warps are separate from tiles and objects (those can't store a target). To make one *look* like a door, put an object on its tile. An `interact` warp works under a solid object since E reaches from the next tile.
- **TileMap** (`tilemap.js`):
  - Holds `tiles` (names, `null` empty), `objects`, `enemySpawns`, `npcSpawns` (each `{ type, col, row }`), `warps`, `spawn` (world pixels) and `characters`.
  - Empty and off-map tiles are solid.
  - `resize()` and `usedArea()` handle resizing. `SPAWN_KINDS` maps enemies/NPCs to their lists and file keys.
  - Tiles draw on screen pixels with every edge rounded and shared by neighbours, so no faint grid at any zoom (see above `drawTiles()`).
- **Tiles** (`tiles.js`, `tileeditor.js`):
  - One line per tile in `assets/squimble-quest/tiles/tiles.json`: name, colour, dual grid, texture, behaviour (`solid`, `speed`, `damagePerSecond`, `damagePerStep`, `healPerSecond`, `slippery`, `pushDirection`, `pushSpeed`) and `blendsWith` (which dual grid tiles round onto it). File order = editor bar order = dual grid layer order.
  - `loadTileFile()` fetches it before the maps (`sketch.js`), since map loading checks tiles exist, and waits for textures so nothing flashes plain colour. A missing/broken file only warns; with no tiles there's just `blank`, for the stand-in map.
  - `setTile(settings, picture)` adds or changes a tile, and is the only way into `TILE_TYPES`. `tilesToData()`/`tilesDataToText()` write the file back; exporting unchanged gives an identical file.
  - Textures: `assets/squimble-quest/tiles/normal/` (one picture per tile) and `dual-grid/` (tilesets). `texture` is the file name; `texturePath()` adds the folder from `dualGrid`.
  - **Tile editor** (`tileeditor.js`): a tabbed `FormBox` with a side column (`TilePreview`, **Choose picture**). **Look** is built by hand; other tabs come from `TILE_BEHAVIOURS` (one line per setting naming its tab), so a new setting or tab is one line. Tabs over `TILE_EDITOR_ROWS` rows continue in a numbered tab. Editing a placed tile previews live (`onUpdate` calls `setTile()` whenever the box would save); closing unsaved restores a copy taken on open (`onCancel`). **Save** calls `setTile()` with the chosen picture, so it works before the picture is in the folder. **Export tiles** downloads `tiles.json` plus any picture chosen since load (`TileEditor.newPictures`), since the game only loads textures from its folders. No rename or delete: maps store names.
  - Tiles are data, so no per-tile code (the old `onEnter`/`onStand`); damage and speed cover it. New behaviour (e.g. a teleporting tile) = a `TILE_DEFAULTS` setting, handled in `walk()` or `checkTile()` (`character.js`), plus a `TILE_BEHAVIOURS` line.
- **Dual grid tiles** (`dualgrid.js`, on via `dualGrid`): ground like grass that blends into neighbours with rounded edges. Maps and the editor just see `'grass'`; only drawing changes (the editor badges them, `drawDualBadge()`). `drawTiles()` draws normal tiles, then `drawDualCorner()` at every corner of a second grid offset half a tile, each piece chosen by which of the four meeting tiles are grass (`DUAL_TILESET_LAYOUT`). See-through edges show a normal tile from that corner beneath. A tile whose `blendsWith` excludes a dual grid tile counts as covered in that piece's bits, so the piece runs straight to it, and that quarter isn't drawn (`cut`), leaving the tile visible. Where two dual grid tiles meet, the later in `tiles.json` goes on top (`layer`), so list lowest first (dirt before grass); new tiles append, so they're on top. Tilesets are cut into 16 pictures whenever a tile gets one (`useTexture()` in `tiles.js`, `cutDualTileset()`), since drawing part of a big image can bleed a line of the neighbouring piece at some zooms. `dualTilesetProblem()` explains a bad tileset to the tile editor.
- **Maps remember their characters.** Leaving a map stores its live `enemies` and `npcs` on `map.characters`; returning restores them, so defeated stay gone, hurt stay hurt, everyone stays put until reload.
  - The spawn lists (`enemySpawns`, `npcSpawns`) are the design and never change on death, so Export saves all of them.
  - `spawnCharacters()` makes everyone fresh from the spawn lists: on a map's first visit and whenever the editor opens, closes or changes characters (opening the editor is a quick enemy reset).
  - This replaced a `defeated` set of spawns, and fixed hurt enemies healing when you left and returned.
- **Characters** (`character.js`):
  - Player, enemies and NPCs all take `{ move, aim, attack }`: from keyboard/mouse for the player, from `ai(entity, world, dt)` otherwise.
  - Tile settings apply to everyone: `speed`, `slippery` and push in `walk()`, damage and healing in `checkTile()`. `velocity` only persists on slippery tiles; elsewhere it's replaced each frame.
  - Dying respawns at the current map's `spawn`, never where you arrived. (It used to be the arrival warp, so entering a building and leaving moved your respawn to its door.) Reading `worldMap.spawn` directly means moving the spawn in the editor applies at once. Undecided, see [Known issues](#known-issues-and-loose-ends).
- **Inventory** (`inventory.js`):
  - One row of slots: the first `HOTBAR_SIZE` are the hotbar (the only pickable ones), the next `BAG_SIZE` the bag. `add()` fills the first empty slot, hotbar first.
  - **E or I** opens `InventoryScreen` (E only with no NPC or E warp in reach, so I always works). The game runs on but the player stands still and nothing's in reach. Drag onto a slot to swap, outside the box to drop. The editor closes it.
  - **Q** drops the held item, thrown about `DROP_DISTANCE` towards the aim with some spread (`DROP_SPREAD`). It tries a few random spots, keeping the first `DROP_GAP` clear of other items, and moves with map collision so it stops at walls. Each map keeps its own in `map.drops` (progress, like `map.characters`).
  - A drop can't be picked up until the player has left `PICKUP_RANGE`, so it isn't grabbed straight back and "inventory full" shows once per approach, not every frame.
  - Each item has a `category` (`ITEM_CATEGORIES`, items.js; only decides its editor tab) and a `rarity` (`RARITIES`), whose colour is its glow on the ground, in slots and the palette (`drawItemGlow()`), and the held item's name above the hotbar. Both are placeholders; a new line adds one. Rarity is per item type for now.
  - Weapons and items load from `items.json` alongside tiles, so there are none until then: `PLAYER.startingItems` are given after (`giveStartingItems()`), and the editor's item tabs read `ITEMS_BY_CATEGORY`, which fills as they load. If the file fails, there are none (console warning) and nobody can attack.
- **UI** (`ui.js`, `button.js`, `textfield.js`, `formbox.js`):
  - Everything extends `UIElement`. Groups show, hide and remove together. A click on UI is claimed, so gameplay never sees it.
  - `Input.typing = true` routes keys to `Input.typed` instead of the game. The box's owner picks the focused `TextField`/`NumberField` and calls `field.type(key)` per key; Ctrl + V arrives as `{ paste: text }` → `field.paste(text)`. `ColourField` accepts pasted hex or rgb, and its swatch opens the browser's colour picker (`<input type="color">`).
- **Editor** (`editor.js`):
  - Game-engine layout: `EditorToolbar` on top (New, Open, Resize, Export, Paint, Erase, Grid, Keys, Play), `EditorDock` on the right (palette tabs, `PaletteGrid`, inspector), `EditorStatusBar` at the bottom. Sizes in `EDITOR_LAYOUT`, colours in `EDITOR_COLOURS`, buttons use the compact `editor`/`editorPrimary` `BUTTON_STYLES`.
  - Palette tabs are for placeable things only; whole-map actions are in the toolbar. `EditorTabStrip` draws tabs at natural width and scrolls (wheel, or **‹ ›** when they overflow), so `EDITOR_TABS` can grow. **Sounds** and **Lights** are empty examples.
  - **Weapons** and **Items** get a tab per `ITEM_CATEGORIES` entry. Clicking the map drops one (`Drops.place()`; progress, not saved by Export). **Give** adds one to the inventory; **Edit** (or right click in the palette) changes name, rarity, colour and weapon numbers immediately. **Export** on those tabs downloads `items.json` with everything (`itemsToText()`) for `assets/squimble-quest/items/`. Adding, renaming or deleting is by hand in `items.json`.
  - **Triggers** (spawn and warps, `TRIGGER_TYPES`) make things happen; placed by their own code in `Editor.update()`, not a catalogue. Placing a warp opens its settings.
  - **Right click** opens settings for what's under the mouse (`editWarp()`, the only one so far); future settings hook in at the same spot in `Editor.update()`.
  - **Erase** is a toolbar tool: `Editor.selected` is `null` while active, and **Paint** returns to `Editor.lastPicked`. It's the only way to delete (right click used to erase too).
  - `FormBox` (formbox.js, with `Picker` and `Checkbox`) is the in-game ask box: New/Resize sizes, New's fill, Export's name, warp and tile settings. Give it a title and `rows` (or `tabs` of rows) and it lays out; `side` adds a column beside the rows (the tile editor's pictures). `Picker` is choose-one (`tilePicker()` in editor.js makes a tile one). Any UI element with a `value` can be a row field. It's a window: dragging the title moves the whole `form-box` group, **×** cancels. `onUpdate` runs every frame while open, `onCancel` on closing unconfirmed.
  - `PaletteGrid` is one element that draws and hit-tests every square, reading catalogues each frame, so new tiles appear automatically. It scrolls (clipped) and consumes `Input.wheel` while hovered, so the camera doesn't zoom. **Right click** a tile square for the tile editor. The inspector's **New** and **Export** show only on Tiles, **Edit** while a tile is picked.
  - While WASD pans, the editor UI and dev panels fade (`Editor.uiAlpha`, applied in `sketch.js`).
- **Dev mode** (`debug.js`): compact status panel top left. Key lists are `DEV_KEYS` and `EDITOR_KEYS`, toggled with **H**.

## Where to add things

Each file's header has the details.

| To add | Do this |
|---|---|
| An object, enemy or NPC | A `defineX()` line at the bottom of its catalogue file. New settings need a default in its `X_DEFAULTS`. |
| A weapon or item | A line in `assets/squimble-quest/items/items.json` (guides atop `weapons.js`, `items.js`). New settings need a default in `WEAPON_DEFAULTS` / `ITEM_DEFAULTS`, which also exports them. |
| An enemy or NPC behaviour | An `ai(entity, world, dt)` returning `{ move, aim, attack }`, beside `chasePlayer` in enemies.js. |
| A tile | In game: editor, Tiles tab, **New** in the inspector, then **Export**. |
| A tile setting | Default in `TILE_DEFAULTS` (tiles.js), behaviour in `walk()` or `checkTile()` (character.js), a `TILE_BEHAVIOURS` line (tileeditor.js) for its editor row and tab. |
| A map | Export into `assets/squimble-quest/maps/` and add it to `MAP_FILES` (maps.js). |
| A key | Its action in `KEYS` (config.js), then `Input.isDown/wasPressed('action')`. Dev tools also go in `DEV_KEYS` (debug.js). |
| A placeable kind in the editor | A line in `EDITOR_TABS` (editor.js) and placing it in `Editor.update()`. A new character kind also needs `SPAWN_KINDS` (tilemap.js). |
| A box that asks for things | `FormBox.open({ title, rows, onConfirm })` (formbox.js); `tabs` instead of `rows` for many settings. |
| A new UI element kind | A class extending `UIElement` (guide atop ui.js). Buttons: guide in button.js. |
| Loading or saving a file | `fetchJson()`, `pickFile()`, `downloadTextFile()`, `downloadData()` in utils.js. |
| A new file | Its `<script>` tag in `squimble-quest.html` (order matters) and a line in sketch.js's file list. |

## Rules to keep when changing things

Not obvious from any one file; breaking them causes hard-to-trace bugs.

- **Change maps only with `loadMap(name, warpName)`.** It stores the old map's characters, restores or makes the new one's, places the player, calls `Warps.arrived()`, and sets up the camera. Setting `worldMap` directly skips all that.
- **Anything moving the player without walking must call `Warps.arrived(player, worldMap)` after** (teleports, cutscenes, being carried or pushed), or a step warp under them fires. `loadMap` and `Player.respawn` already do. Dev mode's **T** deliberately doesn't, to test warps.
- **The live characters are the globals `enemies` and `npcs`.** `map.characters` is current only for maps the player *isn't* on (written on leaving). Other maps: read `map.characters`. Current map: the globals.
- **One map, one name.** `getMap()` names a map when building it; only Export renames it (the old name reverts to its file). Never let two `VISITED_MAPS` names point at one map. Warps, dev mode's **M** and Export all use `map.name`.
- **Design and progress are separate.** Tiles, objects, spawn lists, warps and `spawn` are design (what Export saves). Progress (`map.characters`, `map.drops`, player health and inventory) is memory only; a save system would store it beside the map files, not in them.
- **The editor always shows the design.** Opening, closing or changing characters runs `spawnCharacters()`, resetting the current map's enemies and NPCs. Keep it so, or the editor would show a half-played map as the design.
- **A map's name is its file name,** and warps target maps by name. Renaming a map file breaks every warp to it (red in the editor, listed in the console).

## Ideas for later

Only build these when needed.

- **Warps:** objects that are warps (a door/trapdoor/manhole object opening its warp, see the end of the Warps notes); a "back where you came from" target for shared interiors; a fade between maps; locked doors; an editor key to go through the warp under the mouse; loading map files by name instead of listing them in `MAP_FILES`.
- **Items:**
  - stacking (arrows, potions), needing a count per item
  - editor-placed items aren't saved in the map file; that needs a list in the file like `spawns`, and a decision on whether picked-up ones return
  - making new weapons and items in the editor, like the tile editor's **New** (now by hand in `items.json`)
  - enemy-only weapons (the grunt's `claws`) can only be changed in `items.json`, since the editor edits weapons through their item
  - Speedy Shoes do nothing yet
- **Multiplayer, maybe.** Not decided. The idea: a small social game for friends, up to about a classroom (20–40), playtesting and hanging out, never hundreds. If it happens:
  - **Helps already:** every character runs on `{ move, aim, attack }`, so another player is a `Player` with networked controls. `world.players` is a list, AIs use `nearestPlayer()`, enemies hit every player, step warp tracking is per player, and nothing in gameplay pauses the world. Maps and tiles are data a server can load. Progress is separate from design. The only randomness (drop spots) goes through `randomBetween()` in utils.js.
  - **In the way:** one running map is assumed (globals `player`, `worldMap`, `enemies`, `npcs`, and `loadMap()` swapping the whole world). Players on different maps need each occupied map running, so maps become "rooms" each holding their own characters and players; that also decides how `Warps.followers` (enemies in transit between maps) and `Player.respawn()` (reads the global `worldMap`) work. A drop's `ready` flag is shared, so one player walking away readies it for everyone, including the one who dropped it (it needs to remember who dropped it). `setTile()` still calls p5 (`color()`, `loadImage()`), so rules and drawing need separating for a server. Dialogue, the hotbar, `Warps.reachable` and the editor are the local player's UI, which is fine as each client has its own.
  - **Needs a small server** at that size (Node + WebSockets, cheap to host), not a player's browser hosting: the host's upload or a throttled hidden tab would stall everyone, and school networks often block browser-to-browser connections. The server runs the rules without p5, so rules and drawing need separating first. Each player only needs updates for their map.
  - **Social layer:** names over heads, chat (filtered if younger players might join), emotes, hangout maps sized for a crowd.

## Known issues and loose ends

- **Open file uses the browser's file picker,** which must stay (only the browser can read local files). Failures show via `showMessage()`, with the reason in the console.
- **NPCs can be hurt by tiles.** At 0 health an NPC is marked `dead` but keeps standing: still talkable, others walk through it. Nothing places NPCs on damage tiles yet. When NPCs can die properly, handle it in `Npc` (npc.js), like `Enemy.die()`.
- **Dying is a placeholder:** the player jumps to a spawn with full health.
- **Respawn location is undecided.** Currently the spawn of the map you died on (die in the hut, respawn in the hut). Options: always the game's start, the last warp you came in by (the old way), or checkpoints. It's all in `Player.respawn()` (player.js), marked `ponytail:` with notes on each option, so only that function changes.
- **Map progress lasts until reload.** No saving yet.
- **Renaming a warp breaks warps to it.** They keep the old name, show red in the editor, and the console lists them on load.
- **Nothing stops a warp on a solid tile;** arriving there traps the player in a wall. Put arrival warps on floor.
- **The spawn can end up on an empty tile** (erasing under it, or a New map filled with `empty`), trapping the player. Nothing checks.
- **New map's fill picker steps one tile at a time.** Fine now, slow with many tiles.
- **Placeholder art:** coloured rectangles until sprites exist. Every catalogue already has an `image` setting (`texture` for tiles). Grass has a test dual grid tileset (`assets/squimble-quest/tiles/dual-grid/grass_tileset.png`).
- **Normal tiles are one picture each,** stretched over every tile of that kind. Variations (random pictures so floors don't look repeated) or animation would build on `useTexture()` in `tiles.js`.
- **The tile editor can't rename, delete or reorder tiles.** Do it in `tiles.json` by hand; renaming or deleting loses the tile from every map using it.
- **Pixel art at in-between zooms:** art is unblurred (`noSmooth()` in `sketch.js`), so at e.g. 1.35 some art pixels are a screen pixel wider. Normal for non-integer pixel art scaling; there are no gaps or lines between tiles.

## Checking changes

- `node --check <file>` catches syntax errors.
- Real behaviour: play it in the browser. To automate, install `playwright-core` in a scratch folder, launch Chrome through it (`executablePath`), serve the site, then click and type into the canvas. Globals (`worldMap`, `enemies`, `Editor`, `loadMap`, ...) are readable via `page.evaluate`. Notes:
  - the game is always 960 × 540; compute clicks from the canvas's bounding box
  - the first canvas click only focuses it
  - use `page.keyboard.down/up` for held keys
- For behaviour-preserving refactors, compare before and after: in `page.evaluate`, call `noLoop()`, then call `draw()` yourself with `window.deltaTime = 1000 / 60` and `Input.held` set to the keys you want, recording positions, health and a canvas pixel hash at checkpoints. Pin `window.frameRate = () => 60` first or the dev panel's fps makes frames differ. `mapsReady`, `worldMap` and other `let` globals aren't on `window`; read them by name.
