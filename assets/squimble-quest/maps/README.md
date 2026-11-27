# Maps

One `.json` file per map, listed in `index.json`. The file name is the map's name. Other data (tiles, sounds, items, enemies...) works the same way, see the [data README](../README.md).

| File | What it is |
|---|---|
| `default.json` | Blank 80 x 50 map |
| `example.json` | Test map with a bit of everything, the hut, and a graveyard area. The game starts here (`START_MAP` in `maps.js`) |
| `hut.json` | Inside the hut on `example` |
| `node-test.json` | Lots of linked warps for testing the warp graph |
| `ai-test.json` | 12 rooms for watching the enemy AIs (smart, careful, reckless, direct). Stand on the planks in each room |
| `doppler-test.json` | Moving sounds and the doppler effect. Talk to the Sound Guide for a tour |

## Running locally

Maps load with `fetch`, so the game needs a local server (`npx serve .` or VS Code's Live Server). From `file://` you get a blank stand-in map, but **Open file** in the editor still works.

## Making a map

1. In the game press **B** for the editor (needs a role that can build, `PLAYER_ROLE` in config.js).
2. **File > New map**, or just edit the one you're on.
3. Paint tiles and place things from the palette on the right.
4. **Ctrl + S** downloads `name.json`. Put it in this folder and add the name to `index.json`.
5. Reload, then **M** in dev mode goes through the maps.

**Help > Keys and mouse** in the editor lists every key. The main ones: **N** paint, **X** erase, **L** fill, **R** rectangle, **V** select, **K** pick, **Ctrl + Z/Y** undo/redo, **Space** play from the mouse, **Tab** hide the editor. Right click anything on the map for its settings.

Unsaved changes are kept in the browser (yellow dot by the map's name), and **File > Recover unsaved changes** brings them back after a reload. **Map > Check for problems** finds broken warps, things in walls and missing names.

## Warps

A warp is a tile that takes the player somewhere: a door, cave, manhole or teleporter. Every warp is both an exit and an arrival point, so a house needs two, one leading to the other (like the hut on `example`).

- **Name**: what other warps use to point here. Unique per map.
- **Goes to** / **Arrive at**: the map, and the warp (or spawn point) there.
- **Opens by**: stepping on it, or pressing E nearby (works from the next tile, so it can sit on a wall).
- **Enemies**: let chasing enemies follow you through.

Warps link by **name**, so moving one is fine but renaming breaks links to it (they show red). **Show links** draws every connected warp as a tree, and **Map > World map** shows every map.

## Sound blocks and areas

- **Sound blocks** (Sounds tab): a tile that plays a sound on step, on E, or looping while you're near. The Moving tab makes the sound travel (side to side, past, in a circle) for doppler.
- **Areas** (Triggers tab, **area**, drag): a box or oval with its own atmosphere on top of the map's, e.g. fog over the graveyard.
- **Map > Atmosphere** sets the map's fog, colour, weather and sound. The starters in `atmospheres/` cover each kind of world.

## Lights

Lighting is on for a map when its atmosphere ticks **Light > Lighting**. **Help > Lights and buildings** in the editor walks through all of this.

- **Lights tab**: lights on their own (`light-<name>`, only seen in the editor) and objects that give off light. **Edit** (or right click one in the palette) changes that kind of light everywhere, **New** makes one, **Export** downloads the files for `lights/`.
- **Right click a light on the map** to change just that one: colour, brightness, reach, where it sits and how high, a bar instead of a point (**Length** and **Lies at**), a beam, flicker and halo. It's saved in the map. **Save as** also makes it a kind of its own.
- **Your own buildings**: Objects tab > **New** (or right click an object) opens the object box: a picture from your computer, a glow picture for its windows, its size and shadow, and each of its lights (Add a light, then where it is, how wide and how bright). **Save and export** downloads its file and pictures for `objects/`.
- The boxes have a preview: a little world lit like the map, with night, dusk, day or cave, **just the light**, and someone to drag about to see their shadow.

## File format

```json
{
  "format": "squimble-quest-map",
  "version": 2,
  "left": -5, "top": -2,
  "spawn": { "x": 16, "y": -5 },
  "atmosphere": "misty-forest",
  "legend": { "..": null, "wa": "wall", "gr": "grass" },
  "rows": ["wa wa wa", "wa gr wa", "wa wa wa"],
  "objects": [{ "type": "chest", "col": 3, "row": -1, "items": ["potion", null], "id": "h5w1zp" }],
  "items": [{ "type": "sword", "col": 0, "row": 1, "id": "m29xbe" }],
  "enemies": [{ "type": "grunt", "col": 4, "row": 0, "ai": "careful", "id": "a3pv7k" }],
  "npcs": [{ "type": "villager", "col": -3, "row": 0, "voice": "old-man", "id": "r1y8sj" }],
  "warps": [{ "name": "front", "col": 0, "row": 2, "to": "house", "toWarp": "exit", "activate": "interact" }],
  "areas": [{ "atmosphere": "graveyard", "col": 1, "row": -1, "cols": 4, "rows": 3, "shape": "box", "fade": 1, "strength": 100 }],
  "sounds": [{ "sound": "coin", "col": 3, "row": 0, "activate": "step" }]
}
```

- `rows` are tile codes separated by spaces, mapped to tile names by `legend` (`..` is empty).
- `left`/`top` is the top-left tile; tile (0, 0) is the middle of the world. `spawn` is in pixels.
- Lists that are missing are just empty. Spawn settings like `ai`, `voice`, `holds`, `wears` and `stats` are only there when they differ from the kind's.
- `id`s are made by the editor so a save game can name things. Leave them out when adding by hand and the game makes them.
- The full format is at the top of `js/squimble-quest/mapfile.js`.

## If something goes wrong

- **Map isn't in the M list:** is it in this folder, in `index.json` and running through a server? The console (F12) says what failed.
- **"This warp is broken":** it points at a map or warp name that doesn't exist. Right click it to fix.
- **Things missing from a map:** it uses a name the game doesn't know (renamed file, or not in its `index.json`). The console lists them.
