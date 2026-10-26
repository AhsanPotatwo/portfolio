# Squimble Quest's data

Everything the game is made of lives in these folders, **one file per thing**, named after it. `enemies/grunt.json` is the grunt, `items/axe.json` is the axe.

| Folder | One file per… | Guide |
|---|---|---|
| `tiles/` | kind of ground (grass, lava…). Pictures go in `tiles/normal/` and `tiles/dual-grid/` | [tiles README](tiles/README.md) |
| `sounds/` | sound, for sound blocks and anything that makes a noise. Audio files go in `sounds/files/` | [sounds README](sounds/README.md) |
| `voices/` | voice that NPCs talk with (made like sounds) | [sounds README](sounds/README.md) |
| `items/` | item. A weapon's numbers are inside its item's file | the top of [`items.js`](../../js/squimble-quest/items.js) and [`weapons.js`](../../js/squimble-quest/weapons.js) |
| `objects/` | kind of object (tables, rugs, chests…) | the top of [`objects.js`](../../js/squimble-quest/objects.js) |
| `enemies/` | kind of enemy. Its weapon (the grunt's claws) is inside it | the top of [`enemies.js`](../../js/squimble-quest/enemies.js) |
| `npcs/` | kind of NPC, with what they say | the top of [`npcs.js`](../../js/squimble-quest/npcs.js) |
| `parts/` | part a character's look is built from (a body, eyes, a mouth, a shirt…), with its picture beside it | the top of [`looks.js`](../../js/squimble-quest/looks.js) |
| `particles/` | particle effect (blood when something's hit, sparks, smoke…). Pictures go in `particles/pictures/` | the top of [`particles.js`](../../js/squimble-quest/particles.js) |
| `atmospheres/` | look and feel a map can have: fog, colour, weather, background sound (underwater, volcano, space…) | [maps README](maps/README.md#atmospheres) and the top of [`atmosphere.js`](../../js/squimble-quest/atmosphere.js) |
| `maps/` | map | [maps README](maps/README.md) |

Each folder also has an **`index.json`**: the list of names the game loads, in order. The order is the order they show in the editor's palette.

```json
["grunt", "dummy"]
```

A file only has the settings that aren't normal. `enemies/grunt.json` starts like this:

```json
{
  "width": 28,
  "height": 50,
  "speed": 95,
  "ai": "smart"
}
```

## Adding something to the game

1. Put its file in the right folder. It might be one you exported from the editor, one someone sent you, or one you made by copying a file that's close and changing it. The file's name is the thing's name, so `slime.json` is the slime.
2. Add its name to that folder's `index.json`, without `.json`: `["grunt", "dummy", "slime"]`.
3. Reload the page.

Replacing a file that's already in the folder (a changed tile, say) is just step 1.

## Adding art

Everything is drawn with shapes and colours until it has a picture, so art can go in one thing at a time. A picture setting is a path from the site's root:

```json
"image": "assets/squimble-quest/enemies/grunt.png"
```

or a **sheet**: a grid of frames, one per column, played left to right, and one row per direction it faces:

```json
"walkImage": { "image": "assets/squimble-quest/enemies/grunt-walk.png", "frames": 6, "fps": 10, "directions": 4 }
```

| Sheet setting | What it does | Normally |
|---|---|---|
| `frames` | pictures across | 1 |
| `fps` | frames a second | 8 |
| `loop` | start again after the last frame, or `false` to stay on it (attacks, dying, a chest lid) | `true` |
| `directions` | rows: `1`, `4` (down, left, right, up) or `8` (down, down left, left, up left, up, up right, right, down right) | 1 |
| `mirror` | with 1 direction, flip it when facing left (draw it facing right) | `false` |
| `scale` | game px per picture px, instead of `ART_SCALE` in config.js (1 for 32 px tiles, 2 for 16 px art) | `ART_SCALE` |
| `edge` | for UI boxes: px round the edge that keep their size while the middle stretches | 0 |

Pictures are drawn **at their own size**, never stretched to a hitbox, so a character or tree can be bigger than it is to the game. Characters, objects and worn things stand with their bottom middle on the feet or the object's base.

| Thing | Picture settings | Where |
|---|---|---|
| Player | `image` (standing), `walkImage`, `attackImage`, `hurtImage`, `rollImage`, `deathImage` | `PLAYER` in `js/squimble-quest/config.js` |
| Enemy | the same, and `deathImage` plays where it fell, then fades | its file in `enemies/` |
| NPC | `image`, `walkImage`, `attackImage`, `hurtImage`, `rollImage`, `portrait` (the talking box; a sheet plays while it's open) | its file in `npcs/` |
| Item | `image` (its icon, everywhere), `wornImage` (on whoever wears it, drawn like their body sheet so it lines up) | its file in `items/` |
| Weapon | `swingImage` (a swing or jab, drawn pointing right from the attacker), `arrowImage` (an arrow, pointing right, tip at the front) | inside its item's `weapon` |
| Object | `image`, `openImage` (a chest while it's open), and `"standing": true` for tall things characters can walk behind (trees, wardrobes) | its file in `objects/` |
| Tile | `texture`, `variants`, `frames`, dual grid tilesets | tile editor, [tiles README](tiles/README.md) |
| Particles | `picture` | particle editor, `particles/pictures/` |
| Rarity glow | `image` | `RARITIES` in `items.js` |
| UI | slots, the picked slot, empty equipment slot icons, panels, the talking box, messages, the E key, the crosshair, health bars, the death screen | `UI_ART` in `config.js` |
| Buttons | `art`, `hoverArt`, `pressedArt` on a style | `BUTTON_STYLES` in `config.js` |
| Font | its family name (add an `@font-face` in `css/squimble-quest.css` for a font file) | `GAME_FONT` in `config.js` |

Any state picture that's left out uses `image`, so a character works with just one. The full details are at the top of [`art.js`](../../js/squimble-quest/art.js). After adding art, run the checks (below): `catalogue-check.js` fails on a picture whose file isn't there or a sheet setting that doesn't make sense, and the editor's **Map > Art report** lists sheets that don't split evenly into their frames.

## Exporting from the editor

The **Export** buttons in the map editor download a file for **everything that's new or changed** since the page loaded: tiles on the Tiles tab, sounds, voices and particles on theirs, atmospheres from the toolbar's Atmosphere box (**Save and export**), items on the Weapons, Armour and Items tabs, and enemies whose own weapon you changed on the Weapons tab. New pictures and audio files come too. The message at the top of the screen says where each file goes and which names to add to `index.json`. If there's a lot, the browser console (**F12**) lists it all instead. Exporting again only downloads what's changed since the last time.

Enemies, NPCs and objects can't be made in the editor yet. Make those by copying a file.

## Checking it's all there

```
node js/squimble-quest/tests/run.js
```

That runs every check. `data-check.js` lists any file that isn't in its `index.json` (the game won't load those), any name in `index.json` without a file, and any file that isn't `{ }` with settings in. `catalogue-check.js` catches typo'd settings, names of sounds, particles or items that don't exist, and pictures that aren't there.

## Adding a new kind of data

A folder in `DATA_KINDS` and a `DataFiles.register()` call. See the top of [`datafiles.js`](../../js/squimble-quest/datafiles.js).
