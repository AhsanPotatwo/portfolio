# Squimble Quest data

Everything the game is made of lives here, one JSON file per thing named after it (`enemies/grunt.json` is the grunt). Each folder's `index.json` lists the names to load, in palette order. A file only holds settings that differ from the defaults.

| Folder | One file per | Guide |
|---|---|---|
| `tiles/` | kind of ground (pictures in `normal/` and `dual-grid/`) | [tiles README](tiles/README.md) |
| `sounds/`, `voices/` | sound, or NPC voice (audio files in `sounds/files/`) | [sounds README](sounds/README.md) |
| `items/` | item, with its weapon inside | top of `items.js`, `weapons.js` |
| `objects/` | kind of object (tables, chests...) | top of `objects.js` |
| `enemies/` | kind of enemy, with its own weapon | top of `enemies.js` |
| `npcs/` | kind of NPC and what they say | top of `npcs.js` |
| `parts/` | piece of a character's look | top of `looks.js` |
| `particles/` | particle effect (pictures in `particles/pictures/`) | top of `particles.js` |
| `atmospheres/` | map look: fog, colour, weather, sound, light (Light tab) | top of `atmosphere.js` |
| `lights/` | kind of light (lamp, neon, torch...), named by objects, tiles and items, or placed on its own as `light-<name>` | editor Map > Lights, top of `lighting.js` |
| `maps/` | map | [maps README](maps/README.md) |

## Adding something

1. Put its file in the folder (exported from the editor, or a copy of a close one).
2. Add its name to that `index.json`, without `.json`.
3. Reload.

The editor's **Export** buttons download only what's new or changed and say which names to add. Enemies, NPCs and objects can't be made in the editor yet, so copy a file.

## Adding art

Everything is drawn as shapes until it has a picture. A picture setting is a path from the site root, or a sheet:

```json
"walkImage": { "image": "assets/squimble-quest/enemies/grunt-walk.png", "frames": 6, "fps": 10, "directions": 4 }
```

Sheet settings: `frames` (across, 1), `fps` (8), `loop` (true), `directions` (rows: 1, 4 or 8), `mirror` (flip facing left), `scale` (game px per picture px, default `ART_SCALE`), `edge` (UI box border that doesn't stretch).

Pictures draw at their own size, bottom middle on the feet, never stretched to the hitbox.

| Thing | Settings | Where |
|---|---|---|
| Player, enemy, NPC | `image`, `walkImage`, `attackImage`, `hurtImage`, `rollImage`, `deathImage` (NPCs also `portrait`) | `PLAYER` in config.js, or its file |
| Item | `image`, `wornImage` | `items/` |
| Weapon | `swingImage`, `arrowImage` (pointing right) | the item's `weapon` |
| Object | `image`, `openImage`, `"standing": true` for tall things, `glowImage` for the parts that glow in the dark | `objects/` |
| Tile | `texture`, `variants`, `frames` | tile editor |
| Particles | `picture` | particle editor |
| UI, buttons, font | `UI_ART`, `BUTTON_STYLES`, `GAME_FONT` | config.js |

Missing state pictures fall back to `image`. Full details at the top of `art.js`.

## Checking

`node js/squimble-quest/tests/run.js`. `data-check.js` finds files missing from an index (and the other way round), and `catalogue-check.js` finds typo'd settings, missing names and missing pictures.

A new kind of data is a folder in `DATA_KINDS` plus a `DataFiles.register()` call (`datafiles.js`).
