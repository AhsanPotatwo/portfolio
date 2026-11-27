# Squimble Quest

Top-down RPG in p5.js (1.11, global mode) and plain JS, played at `squimble-quest.html`. No build step: the page loads every file with `<script>` tags in order and they share globals. `sketch.js` is the game loop and its header lists every file. Most files open with a header explaining how they work, so start there.

Worlds (forest, underwater, volcano, desert, snow, space...) are sets of maps, each with an atmosphere for its fog, colour, weather and sound, so a new world is mostly data, not code.

## Running

Maps load with `fetch`, so serve the portfolio root, e.g. `py -m http.server 8765`, then open `http://localhost:8765/squimble-quest.html`.

## Keys

- **Esc** pause menu (volumes, sound/screen/assist settings, key changes, saved in `sq-settings`)
- **E / I** inventory, **Q** drop, **Shift** roll (with the quick charm), **F** full screen
- **`** or **Ctrl + D** dev mode, then **H** dev menu, **M** next map, **T** teleport, **G** grid, **P** AI routes, **[ ]** shaders
- **B** map editor

Dev mode and the editor come from `PLAYER_ROLE` in config.js (`developer` gets both). **Set it to `'player'` before shipping.**

## How the code is written

- Smallest thing that works, nothing "for later".
- Keep multiplayer possible when it's free: only `sketch.js` reads input, characters take `{ move, aim, attack }`, find players with `nearestPlayer()`, keep per-player state on the player, plain data for game state, randomness through `randomBetween()`. Spots that would need changing are marked `multiplayer:`.
- In-game UI (`ui.js`, `button.js`, `textfield.js`, `formbox.js`), never `prompt()`/`alert()`.
- The game is 960 x 540 game px (`GAME_W`/`GAME_H`) whatever size it's shown. Place UI from those, not fixed numbers.
- Comments: lowercase, British spelling, say why not what, plain keyboard characters. `shortcut:` marks a known corner cut and what to do when it matters.

## Data files

Everything that isn't behaviour is a JSON file in `assets/squimble-quest/<kind>/` with an `index.json` listing names in order (`datafiles.js`, guide in [assets/squimble-quest/README.md](../../assets/squimble-quest/README.md)). Files only hold non-default settings, so every new setting needs a default in its kind's `X_DEFAULTS`. Behaviour stays in code and files name it (an enemy's `ai` is an `ENEMY_AIS` key). Editor Export only downloads what changed.

## Where things live

| System | Files |
|---|---|
| Maps, warps, ids | `maps.js`, `mapfile.js` (format), `tilemap.js`, `warps.js`, `warpgraph.js` |
| Tiles, dual grid, liquids | `tiles.js`, `tileeditor.js`, `dualgrid.js`, `wakes.js` |
| Characters, AI | `character.js`, `player.js`, `enemies.js`, `npc.js`, `pathfinding.js` |
| Combat | `weapons.js`, `weaponeditor.js`, `items.js`, `itemglow.js` |
| Inventory, chests | `inventory.js`, `storageeditor.js`, `interact.js` |
| Art and looks | `art.js`, `looks.js` |
| Sound | `sound.js`, `soundblocks.js`, `soundeditor.js` |
| Effects | `particles.js`, `atmosphere.js`, `shaders.js` |
| UI | `ui.js`, `button.js`, `textfield.js`, `formbox.js`, `hud.js`, `pausemenu.js`, `access.js` |
| Editor | `editor.js`, `editormenu.js`, `edittools.js`, `edithistory.js`, `mapcheck.js` |
| Dev mode | `debug.js` |

## Rules to keep

- Change maps only with `loadMap(name, warpName)`.
- Anything that moves the player without walking calls `Warps.arrived(player, worldMap)` after, or a step warp under them fires.
- The live characters are the globals `enemies` and `npcs`. `map.characters` is only current for maps the player isn't on.
- Design (tiles, objects, spawns, placed items, chest contents, warps) is what Export saves. Progress (characters, drops, chest inventories, player) is memory only.
- The editor always shows the design: opening it respawns characters and restocks items.
- Make placed things only with `addObject()`, `addItem()`, `addSpawn()`, and change them in place, so they keep their `id`.
- A map's name is its file name, and warps link by name. Renaming breaks links (they show red in the editor).
- A new file needs its `<script>` tag in `squimble-quest.html` and a line in sketch.js's list, same order.

## Adding things

- **Tiles, sounds, particles, atmospheres, maps:** make them in the editor and Export, or copy a file and add its name to `index.json`.
- **Items, enemies, NPCs, objects:** copy a file in their folder (headers of `items.js`, `enemies.js`, `npcs.js`, `objects.js` explain the settings).
- **A setting:** a line in that kind's settings list (`TILE_BEHAVIOURS`, `HIT_SETTINGS`, `SOUND_SETTINGS`, `PARTICLE_SETTINGS`, `ATMOSPHERE_SETTINGS`, `ENEMY_SPAWN_STATS`, `GAME_SETTINGS`), which also makes its editor row.
- **An attack type:** a class beside `MeleeSwing`/`Jab`/`Arrow` and a `WEAPON_ATTACKS` line. Hits go through `hitWith()`.
- **An AI:** a function beside `chasePlayer` plus an `ENEMY_AIS` line.
- **Something to press E on:** a line in `INTERACTABLES` (interact.js).
- **An editor command or tool:** `EDITOR_COMMANDS` + `EDITOR_MENUS`, or `EDITOR_TOOLS`.
- **A key:** `KEYS` in config.js, then `Input.wasPressed('action')`.
- **Something on the HUD:** a block in `HUD` (config.js) for where it sits and how it looks, and its draw function in `HUD_PIECES` (hud.js).

## Known issues

- No saving yet: progress resets on reload, so placed items and chests refill.
- Dying is a placeholder and where you respawn is undecided (`Player.respawn()`).
- Placeholder art is coloured shapes; a character's rectangle is its hitbox.
- NPCs can be hurt by tiles but don't die properly.
- Renaming a warp breaks warps to it; nothing stops a warp or spawn ending up on a wall (Map > Check for problems lists them).
- Pixel art gets uneven pixels at non-whole zooms; full screen at 1080p and 4K is exact.
- More in the headers of `pathfinding.js`, `sound.js`, `weapons.js` and `shaders.js`.

## Checks

`node js/squimble-quest/tests/run.js` runs every check (silent when they pass; `run.js sound` runs just those). New checks load game files with `load()` from `tests/load.js`.

For real behaviour, drive it in a browser with playwright: clicks are in 960 x 540 game px from the canvas box, the first click only focuses it, and for frame-by-frame tests call `noLoop()` then set `window.deltaTime = 1000 / 60` before every `draw()`.
