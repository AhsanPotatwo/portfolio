# Squimble Quest's data

Everything the game is made of lives in these folders, **one file per thing**, named after it. `enemies/grunt.json` is the grunt, `items/axe.json` is the axe.

| Folder | One file per… | Guide |
|---|---|---|
| `tiles/` | kind of ground (grass, lava…). Pictures go in `tiles/normal/` and `tiles/dual-grid/` | [tiles README](tiles/README.md) |
| `sounds/` | sound, for sound blocks and anything that makes a noise. Audio files go in `sounds/files/` | [sounds README](sounds/README.md) |
| `voices/` | voice that NPCs talk with (made like sounds) | [sounds README](sounds/README.md) |
| `items/` | item. A weapon's numbers are inside its item's file | the top of [`items.js`](../../js/squimble-quest/items.js) and [`weapons.js`](../../js/squimble-quest/weapons.js) |
| `objects/` | kind of object (tables, rugs…) | the top of [`objects.js`](../../js/squimble-quest/objects.js) |
| `enemies/` | kind of enemy. Its weapon (the grunt's claws) is inside it | the top of [`enemies.js`](../../js/squimble-quest/enemies.js) |
| `npcs/` | kind of NPC, with what they say | the top of [`npcs.js`](../../js/squimble-quest/npcs.js) |
| `particles/` | particle effect (blood when something's hit, sparks, smoke…). Pictures go in `particles/pictures/` | the top of [`particles.js`](../../js/squimble-quest/particles.js) |
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

## Exporting from the editor

The **Export** buttons in the map editor download a file for **everything that's new or changed** since the page loaded: tiles on the Tiles tab, sounds, voices and particles on theirs, and items on the Weapons and Items tabs. New pictures and audio files come too. The message at the top of the screen says where each file goes and which names to add to `index.json`. If there's a lot, the browser console (**F12**) lists it all instead. Exporting again only downloads what's changed since the last time.

Enemies, NPCs and objects can't be made in the editor yet. Make those by copying a file.

## Checking it's all there

```
node js/squimble-quest/tests/data-check.js
```

It lists any file that isn't in its `index.json` (the game won't load those), any name in `index.json` without a file, and any file that isn't `{ }` with settings in. No output means it's all fine. A setting with a typo in it gets a warning in the browser console when the game loads.

## Adding a new kind of data

A folder in `DATA_KINDS` and a `DataFiles.register()` call. See the top of [`datafiles.js`](../../js/squimble-quest/datafiles.js).
