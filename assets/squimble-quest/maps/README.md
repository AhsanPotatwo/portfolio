# Squimble Quest maps

Every map in the game is one `.json` file in this folder, and `index.json` lists them. The file name is the map's name, so `forest.json` is the map called `forest`. Everything else the game's made of (tiles, sounds, items, enemies, NPCs, objects) has a folder next to this one that works the same way, see the [data README](../README.md).

A map is made of:

- **Tiles**: the ground. Every spot has exactly one tile (grass, wall, water…), or is empty. Tiles are made in the editor's tile editor and kept in [`tiles/`](../tiles/README.md), a file each.
- **Objects**: things placed on top, like furniture and decorations. One object can cover several tiles (a 2 × 1 table), and several can share a tile (a table on a rug). Each kind of object is a file in [`objects/`](../objects/) (the guide's at the top of [`objects.js`](../../../js/squimble-quest/objects.js)).
- **Enemies**: where each enemy starts. They appear there with full health the first time you go to the map. After that, each map remembers its enemies and NPCs as you left them: defeated enemies stay defeated and hurt ones stay hurt, until the page is reloaded. Each kind of enemy is a file in [`enemies/`](../enemies/) (the guide's at the top of [`enemies.js`](../../../js/squimble-quest/enemies.js)). Right click a placed enemy to pick its **AI**, its **Sound**, whether it follows you through **Warps**, and the particles that burst out when it's **Hit** and when it dies (**Death**; blood, unless you pick others or **none**). **Edit hit particles** / **Edit death particles** save the box and open the particle editor on the one picked; saving that under a new name gives the new effect to this enemy. AI: **smart** goes round walls and avoids lava and spikes unless the way round is much longer, **careful** goes a long way round rather than get hurt, **reckless** takes harm whenever it's quicker (but not enough to kill it), **direct** is the old straight line (stuck behind walls), and **still** doesn't move. Left as **its own**, it uses the one in its kind's file. The pathfinders also work round each other: they spread out, come at you from different sides and surround you, and give way when they get in each other's way. Every enemy sees you from 15 tiles unless a wall is in the way (water isn't), hears you within 5 tiles even through walls, and tells others nearby. Once it's after you it keeps track round corners, and only loses you after 8 seconds out of sight and out of range; the pathfinders then walk back to where they started. In dev mode each enemy shows its AI, what it's doing and its planned route (**P** hides them).
- **NPCs**: where each friendly character starts. Walk up to one and press **E** to talk. Each kind of NPC, and what they say, is a file in [`npcs/`](../npcs/) (the guide's at the top of [`npcs.js`](../../../js/squimble-quest/npcs.js)). Right click a placed NPC to pick its **voice** (or pick one in the **Voices** tab and click the NPC); left as **its own**, it uses its kind's voice from its file. See [voices](../sounds/README.md#voices-and-talking).
- **Warps**: tiles that take the player to another map, or somewhere else on the same one. That's how doors, cave entrances, manholes, trapdoors, secret passages and teleporters work. See [Warps](#warps) below, and [`js/squimble-quest/warps.js`](../../../js/squimble-quest/warps.js).

## The maps in this folder

| File | What it is |
|---|---|
| `default.json` | A blank white map (80 × 50 tiles) |
| `example.json` | The testing map: a bit of every tile (hut, pond, lava, spikes), tables and rugs, two training dummies to hit, and a villager to talk to (walk up and press **E**). Press **E** at the hut's door to go inside. The game starts here (`START_MAP` in `maps.js`) |
| `hut.json` | Inside the hut on `example`: a room with a rug, a table and a villager. Walk back out through the gap in the bottom wall |
| `node-test.json` | For trying out the warp graph (**Show links**, see [Warps](#warps)). Warps that teleport around the same map, each on a coloured tile so you can see it without the editor: a family on dirt that branches like a tree, a family on sand that goes round in a loop, a village on grass to the right (20 doors leading to one `square`, some with a back room and a cellar, for testing a warp with lots of links), and two on planks that aren't linked to the others (one leads nowhere, one leads to the spawn point). Press **E** on one to use it |
| `ai-test.json` | Twelve rooms off one hallway for watching the enemy AIs (see [The AI test map](#the-ai-test-map)). Get there with dev mode's **M** |
| `doppler-test.json` | Moving sounds and the doppler effect (see [The sound test map](#the-sound-test-map)). Get there with dev mode's **M** |

The tile grid shows on every map while developer mode is on, and never outside it. **G** hides it (and shows it again), to see the tiles on their own while zooming.

### The AI test map

`ai-test` is a hallway with six rooms above and six below. Each has grunts with different AIs (the label over each one in dev mode says which and what it's doing) and a **planks tile to stand on**. Walking the hallway wakes nobody. In most rooms they see you from the planks; in **House**, **Fork** and **Pillars** the walls hide you, so step out where they can see you first, then go to the planks. Turn dev mode on to see their routes. They'll attack you; run out of the room and once they lose you they walk back. Opening and closing the editor (**B** twice) puts everyone back at the start at once.

Rooms above the hallway, left to right:

| Room | What should happen |
|---|---|
| **House** | **smart** walks round the house. **direct** (the old AI) walks into the wall and stays there |
| **Maze** | Corridors with dead ends. Both find their way through to you in the middle |
| **Fork** | Two equal ways round a block, one crossing lava. **smart** and **careful** take the safe side; **reckless**, which minds lava least, goes the other way, so you're attacked from both sides |
| **Spike, long way round** | A wall with one spike in the gap and openings far off at the ends. **smart** and **reckless** take the spike (whoever's second gives way at the gap), **careful** walks round |
| **Spike, short way round** | The same with openings close by. Now **smart** walks round too; only **reckless** takes the spike |
| **Pillars and tables** | An open room of pillars, two lava tiles and two tables. The pathfinders weave through; **direct** gets caught on a pillar |

Rooms below, left to right:

| Room | What should happen |
|---|---|
| **Lava river** | Too wide to cross without dying, with a bridge at the far right and one place on the left only one tile wide. **smart** and **reckless** cross the thin bit, **careful** uses the bridge, **direct** walks in and burns. Hit **smart** a few times first and it gets scared and uses the bridge. Stand in the lava yourself and they wait at the edge rather than follow you in |
| **Island** | Step on the planks by the door to jump to the island (and on the island's planks to come back). Nobody can reach you, so they wait at the nearest shore with **(no way)** on their labels |
| **Mud** | Poop (half speed) between you and them. **smart** walks round on grass and gets there first, **direct** wades through |
| **Spike gauntlet** | Three spikes (45 hp) in a straight corridor, or a long zigzag. **smart** and **reckless** run the spikes, **careful** zigzags. A **smart** you've hurt zigzags |
| **Crowd** | Six grunts behind a one-tile door, with a wider gap further along. Some take the door, some the gap, and they surround you |
| **Give up** | A long wall with openings only at the ends. You're out of sight but they hear you, and they keep after you all the way round |

## Quick start

1. Open the game, click it, press **`** or **Ctrl + D** (developer mode), then **B** (map editor).
2. Click **New** in the toolbar along the top, type a width and height, and choose what to fill it with. Or just edit the map you're on.
3. Paint tiles and place objects.
4. Click **Export** in the toolbar, type a name, and it downloads as `yourname.json`.
5. Move the file into this folder (`assets/squimble-quest/maps/`).
6. Add its name (without `.json`) to `index.json` in this folder:

   ```json
   ["default", "example", "yourname"]
   ```

7. Reload the game. Press **M** in developer mode until you reach your map.

## Making a map

Open the editor with **`** (or **Ctrl + D**) then **B** (for build). Everything you do changes the map you're on, so you can close the editor (**B**, or **Play** in the toolbar) and walk around it straight away.

It's laid out like a game engine: a **toolbar** along the top (the map's buttons, the Paint and Erase tools, Grid, Dev (the dev menu) and Play, and the map's name and size on the right), a **dock** on the right (the **palette** of things to place, and the **inspector** under it showing what's picked), and a **status bar** along the bottom (the tile under the mouse, what a click does, and the zoom).

| Control | What it does |
|---|---|
| **Tiles** / **Objects** / **Enemies** / **NPCs** / **Triggers** / **Weapons** / **Items** / **Sounds** / **Voices** / **Particles** tabs at the top of the palette | Switch between the ground tiles, objects (furniture, decorations…), enemies, friendly NPCs, triggers (the player's spawn point, and warps), weapons, other items, sound blocks, NPC voices and particle effects. When there are more tabs than fit, **‹ ›** (or the mouse wheel over them) scrolls along. **Lights** is an empty example for now |
| A weapon or item picked | Click the map to put one on the ground (it isn't saved by Export). **Give** in the inspector puts one in your inventory, **Edit** (or right click it in the palette) changes its name, rarity, colour and, for weapons, damage, reach, arc and timings. **Export** in the inspector downloads the file of each item you've changed: put them in `assets/squimble-quest/items/` (replacing the old ones) to keep the changes |
| **New** / **Open** / **Resize** / **Export** (toolbar) | Make a new map, open a map file, change this map's size, or save it as a file |
| Click something in the palette | Choose it, and switch to the **Paint** tool. Hover over one to see its name. The mouse wheel scrolls the palette while the mouse is over it |
| Left click / drag (tile chosen) | Paint that tile, replacing the one there. Tiles with a little badge of two overlapping squares in the corner are dual grid tiles (like grass): their edges round off and blend into the tiles next to them by themselves |
| **New** / **Edit** in the inspector, or right click a tile in the palette (**Tiles** tab) | Make a tile, or see and change everything about one. **Export** (next to them) saves them all. See the [tiles README](../tiles/README.md) |
| Left click (object chosen) | Place the object, its top-left corner on the tile under the mouse. A see-through preview shows where it'll go |
| Left click (enemy or NPC chosen) | Place it, standing on the tile under the mouse |
| Left click (**spawn** chosen, in **Triggers**) | The player spawns on this tile (yellow ring). There's only one, so it moves here |
| Left click (**warp** chosen, in **Triggers**) | Put a warp on this tile (purple square), and open its settings. See [Warps](#warps) |
| Left click (**Sounds** tab) | Put a sound block on this tile that plays the sound you picked, and hear it once. **New** / **Edit** in the inspector (or right click a sound in the palette) opens the [sound editor](../sounds/README.md); **Export** saves the sounds. See [Sound blocks](#sound-blocks) |
| Left click (**Voices** tab) | Give the NPC on this tile the voice you picked, and hear it. **New** / **Edit** in the inspector (or right click a voice in the palette) opens the [sound editor](../sounds/README.md) |
| Left click (**Particles** tab) | Try the effect out here: it bursts from half a tile up, fanned out to the right as if hit from the left. Nothing is placed or saved. **New** / **Edit** in the inspector (or right click one in the palette) opens the particle editor: tabs of sliders (how many, speed, spread, jump height, gravity, air drag, floor grip, bounce, wind, walls, shape, two colours, size, end size, spin, picture, bits, how long they last, fade, opacity, glow, shadow) with a preview beside them that bursts every 1.5 seconds (click it for another). Right click a slider to put it back to normal. Shapes are squares, circles, a whole picture, or bits cut from a picture (**Bits across** sets how many; lots gives single pixels). **Choose picture** picks one from your computer; left as **the thing's own**, an enemy's picture is used. Gravity below 0 floats them up, like smoke. **Start higher** starts them above where they come from. The **Keep going** tab is for tiles and objects that make it nonstop: **Bursts** is how many times a second each one bursts it, and the preview shows one tile making it while that tab's open. Saving under a new name makes a copy. **Export** downloads the changed effects (and new pictures, for `particles/pictures/`) |
| Tiles and objects that make particles nonstop | A tile kind ticks its effects on the tile editor's **Particles** tab (lava bubbles and smokes). An object kind lists them in its file in `objects/`, like the **campfire** (flames, smoke, embers): `"particles": ["campfire-flames", "campfire-smoke"]`, plus optional `particleRate` (2 is twice as often) and `particleX`, `particleY` (px to move where they come from, like up to a chimney). Only ones on screen make any, and if there'd be too many they all turn down evenly, so the game stays smooth. Dev mode's **Particles** readout shows how many there are and how far they're turned down |
| Right click | Change the settings of what's under the mouse: a warp, a sound block, an enemy's AI and particles, or an NPC's voice |
| **Erase** (toolbar), then left click / drag | Delete. Starting on an object, enemy, NPC, warp or sound block removes those; starting on bare ground empties tiles |
| **WASD** | Move around the map. The editor's buttons and panels fade out while you move, so you can see the map, and come back when you stop |
| **−** **=** or mouse wheel | Zoom out and in (**0** resets) |
| **M** | Go to the next map |
| **G** | Show or hide the tile grid |
| **H** | Open or close the dev menu (**Dev** in the toolbar does too): tick what the info panel and the map show, click tools, and see every key |
| **B** | Close the editor |

Empty tiles show the dark background and can't be walked on, like the edge of the map.

While the editor's open, everyone stands still. Opening it brings back every enemy placed on the map, including ones you've defeated, so you always see the whole design (it's also a quick way to reset them while testing). Closing it puts every enemy and NPC back where it was placed, with full health. Defeating an enemy never removes it from the map, so it's still in the file when you export.

### New maps

Click **New** in the toolbar. A box asks for the width and height in tiles: click a number (or press **Tab**) to type into it, then press **Enter** or **Make map** (**Escape** or **Cancel** closes it). The smallest is 1 × 1 and the biggest is 500 × 500. Tile `(0, 0)` is in the middle of the new map, and that's where the player spawns.

**Fill** is what every tile starts as. It starts on `blank` (plain white). Click its right half to go forward through the tiles, or its left half to go back. After the last tile comes **empty**: the map starts with no tiles at all.

**Rooms that aren't rectangles** (L-shapes, crosses, rooms joined by corridors): fill with **empty**, make the map big enough to fit the whole shape, then paint the floor in the shape you want. Everything you don't paint stays empty, and empty tiles work like walls. Remember to put the spawn point (**Triggers** tab) on the floor.

A new map is called `new-map` until you export it with a name of its own.

### Resizing a map

Click **Resize** in the toolbar, and type the new width and height into the box (it works like the **New map** one). The map grows or shrinks around its middle, and any new space is empty, ready to paint.

It can't be made smaller than the area with tiles in it: the box says what the smallest is, and won't go any lower. So a 10 × 10 map made 20 × 20 can go back to 10 × 10, but if you've painted one tile past the old edge on the right and bottom, the smallest is 11 × 11. Objects, enemies and NPCs on any part that's cut off are removed.

### Warps

A warp is a tile that takes the player somewhere else: a door into a house, a cave entrance, a manhole, a secret passage, a teleporter. A warp to another spot on the same map is a teleport, and everything else on the map carries on as it was. Every warp is both a way out and a place to arrive, so a house needs two warps: one on the town map that leads to the one inside, and one inside that leads back out. The hut on `example` is set up this way.

1. Choose **warp** in the **Triggers** tab and click a tile. A warp can go on any tile, including one with an object, enemy or NPC on it. Its marker always shows on top.
2. A box opens with the warp's settings. Right click the warp any time to change them.
   - **Name**: what other warps use to lead here. Each warp on a map needs its own name.
   - **Goes to**: the map it leads to. **nowhere** means it only works as a place to arrive.
   - **Arrive at**: where the player turns up on that map. That's its **spawn point**, or any warp on it.
   - **Opens by**: **stepping on it**, or **pressing E** when close enough. A warp that opens with E works from the tile in front too, so it can go on a wall or under a solid object.
   - **Enemies**: tick **follow you through** to let enemies chasing the player follow them through it. A follower takes about as long as it would to walk to the warp, plus a second to open it if it opens with E (an E warp counts as a door, and kinds of enemy that can't open doors get left behind), then comes out where the player arrived. New warps start with this ticked. Each enemy can also be told not to follow: right click it and set **Warps** to **stays behind**. On a warp to the same map you can watch them walk to it. On a warp to another map they turn up a moment after you.
   - **Show links**: shows every warp linked to this one, then every warp linked to those, and so on, like a family tree (see below).
3. Click the right half of a choice for the next one, or the left half to go back. Then click **Save**.

In the editor, warps that open with E have an **E** on their marker. A warp shows **red** when it leads to a map or warp that doesn't exist. Going through one of those shows a message and the player stays where they are, and the browser console lists them all when the game loads.

Arriving on a warp that opens by stepping on it doesn't send you straight back. It only opens when you step onto it from another tile.

**Show links** opens the warp graph. The warp you're editing is at the top with a yellow edge, and under it is every warp linked to it, whichever way round, on any map. Each box shows a warp's name and its map, and the arrows point the way each warp leads, so a door and its way back out have an arrow at both ends. A dashed arrow is a link that loops back to a warp elsewhere in the graph. A warp with lots of links (like a village square that every door leads to) has them in rows of six, one under the other, so it stays readable however many there are. A warp that leads to a spawn point shows that spawn point as a box, and one leading to a warp that doesn't exist shows a red box. Hover over a box to see where that warp is: a window onto its map, with the warp ringed in yellow. Drag to move around it and use the mouse wheel to zoom. **Close** or **Escape** goes back to the warp's settings. It shows the warp as it was last saved, so **Save** changes first to see them in the graph.

Warps link by name, so you can move a warp around freely. **Renaming a warp breaks every warp that leads to it**, so change those too. Both maps have to be exported for a link to work after a reload.

### The sound test map

`doppler-test` shows off sounds moving around the world and the **doppler effect**: a sound coming towards you is higher, and going away lower, like a car or a siren going past ("neeeoww"). Talk to the **Sound Guide** next to where you start for a tour. Sounds still get quieter the further away they are. Most of the sounds here have a little marker so you can see where they are (**Seen** in a sound block's settings).

| Where | What to listen for |
|---|---|
| **Highway** (top) | A car races past, left to right, every few seconds. Stand on the pavement: it's higher as it comes, drops as it passes you, and fades away lower. It starts again far out of earshot |
| **Avenue** (left) | An ambulance drives up and down. Its siren bends as it passes, and gets slower near the ends of the road (it slows down to turn round), so the bend is smaller there |
| **Roundabout** (right) | A tone goes round in a circle. Stand on the planks in the middle and it never changes pitch, because it never gets closer or further away. Stand outside the circle and it wobbles up and down each time round |
| **Three bays** (bottom) | The same tone going up and down past a wooden spot, with **Doppler** set to 0% (left), 100% (middle) and 300% (right), to compare |
| **Hum path** (left of the start) | A still hum. Run along the path past it: you moving bends it too, just a little (about one note) |
| **Bee garden** (top right) | Two bees going round the flowers, each buzzing higher as it comes round towards you |
| **Chase room** (bottom left) | A grunt carrying a motor sound. Step in, and it whines higher as it chases you and lower as you run away. It does attack! |
| **Camp** (top left) | The campfire and the rain, standing still |

Everything here is changeable in the editor: right click a sound block for its sound and how it moves (**Moving** tab), right click the grunt (or any enemy or NPC) to give it a sound, and open the sounds in the sound editor to change their **Doppler** setting. How strong the doppler effect is everywhere is `SOUND_DOPPLER` in `js/squimble-quest/sound.js`.

### Sound blocks

A sound block is a tile that plays a sound. The **Sounds** tab shows every sound in the game (each square is a picture of the whole sound); pick one and click the map to put a block there. Like warps, sound blocks only show in the editor (a green square with its wave on it), unless they're set to be **Seen** (below), or put an object on the tile.

Right click a sound block to change it:

- **Sound**: which sound it plays. **▶ Play** lets you hear it, and **Edit sound** opens it in the sound editor.
- **Plays by**: **stepping on it**, **pressing E** when close enough (it works from the tile next to it too), or **constantly nearby**: it loops smoothly, with no gaps, for as long as the player is close enough to hear it, for a humming machine, a waterfall or wind. Walking out of range stops it, and walking back starts it again.
- **Moving** tab: the block's sound can move around its tile. **Moves**: **stays still**, **side to side** or **up and down** (slowing down at the ends to turn round), **past** (one way at a steady speed, then starting again from the beginning: give it a distance well past its **Heard from**, so nobody hears it jump back), or **round in a circle**. **Distance** is how long its path is in tiles (a circle's is how far out it goes), and **Speed** is how many tiles a second it goes. The editor draws the path and the sound moving along it. Moving sounds get the doppler effect, so a constantly nearby block going past is a car, a train or a bee. Stepping on it and pressing E still go by its tile, so moving is mostly for constantly nearby blocks.
- **Seen**: shows a little sound marker where its sound is while playing, so players can see it (handy for something moving).

Sounds get quieter as the player walks away, come more out of the left or right speaker depending on which side they're on, and bend higher or lower when they or the player move (the doppler effect; each sound's **Doppler** setting in the sound editor says how much, and 0 turns it off). How far away a sound can be heard is part of the sound (**Heard from** in the sound editor), and hovering over a sound block shows it as a green circle.

A block whose sound has been renamed or deleted is shown in red and makes no sound. Right click it and pick another one.

Enemies and NPCs can carry a sound around too, looping it wherever they go while the player is close enough (a buzzing wasp, a rumbling cart). Right click one on the map and pick its **Sound**; left as **its own**, it uses its kind's `sound` from `enemies.js` or `npcs.js` (none, normally). It stops when the enemy is defeated.

Making and changing the sounds themselves is in the [sounds README](../sounds/README.md). Sounds stop when the editor opens, and the game won't make any sound until it's been clicked (browsers don't allow it before then).

### Changing a map you've already made

Go to it with **M** (or **Open file**), edit it, **Export** it with the same name, and replace the old file in this folder with the new one.

## Playing a map without adding it to the game

Click **Open file** in the editor and choose a `.json` file. You go straight to that map. It stays in the **M** list until you reload the page. This works even when the game isn't running through a local server (see below).

## Choosing the map the game starts on

In `maps.js`, set `START_MAP` to the map's name (its file name without `.json`):

```js
const START_MAP = 'forest';
```

## Where the maps come from

The **M** key goes through every map in this order:

1. The maps in `index.json`, in the order they're listed
2. Any maps made, opened or exported since the page loaded

Opening or exporting a map with the same name as one that's already loaded replaces it until you reload the page. Exporting under a **new** name works like "save as": the map you're on becomes the new one, and the old name goes back to its own file (without your unsaved changes).

Going to a different map and back keeps the changes you made in the editor, but reloading the page loses them, so export them first.

If `START_MAP` doesn't load (e.g. its file is missing), the game starts on the first map that did, and the browser console says so.

## Running the game locally

Browsers don't let a page read files from your computer's folders when it's opened by double-clicking the `.html` file (a `file://` address). To load maps from this folder, run the site through a local server:

- **VS Code:** install the *Live Server* extension, right-click `squimble-quest.html`, and choose *Open with Live Server*.
- **Terminal:** run `npx serve .` in the portfolio folder, then open the address it shows (e.g. `http://localhost:3000/squimble-quest.html`).

On the live site (GitHub Pages) it just works.

Without a server, no map files can load, so the game puts you on a small blank stand-in map with a message along the bottom explaining why. **Open file** in the editor still works then, and the browser console (F12) explains which files didn't load.

## The file format

You can open a map in any text editor. It looks like this:

```json
{
  "format": "squimble-quest-map",
  "version": 2,
  "left": -5,
  "top": -2,
  "spawn": { "x": 16, "y": -5 },
  "legend": {
    "..": null,
    "wa": "wall",
    "gr": "grass",
    "wt": "water"
  },
  "rows": [
    "wa wa wa wa wa wa wa wa wa wa",
    "wa gr gr gr gr gr gr gr gr wa",
    "wa gr gr wt wt gr gr gr gr wa",
    "wa gr gr wt wt gr .. .. gr wa",
    "wa wa wa wa wa wa wa wa wa wa"
  ],
  "objects": [
    { "type": "rug", "col": -3, "row": -1 },
    { "type": "table", "col": 1, "row": -1 }
  ],
  "enemies": [
    { "type": "dummy", "col": 2, "row": 0 },
    { "type": "grunt", "col": 4, "row": 0, "ai": "careful" }
  ],
  "npcs": [
    { "type": "villager", "col": -3, "row": 0 },
    { "type": "villager", "col": 4, "row": 0, "voice": "old-man" }
  ],
  "warps": [
    { "name": "front", "col": 0, "row": 2, "to": "house", "toWarp": "exit", "activate": "interact" }
  ],
  "sounds": [
    { "sound": "coin", "col": 3, "row": 0, "activate": "step" }
  ]
}
```

- **`rows`**: the tiles, one line per row, top row first, with a code for each tile separated by spaces.
- **`legend`**: which code means which tile (the tiles' names, from `tiles/`). `..` is always empty. The editor makes a 2-character code for each tile when it exports, from the tile's name where it can: `gr` for grass, then `wt` for water because `wa` is already wall. There are thousands of possible codes, so they won't run out however many tiles you add.
- **`objects`**: everything placed on the tiles. `type` is the object's name (its file in `objects/`), and `col`, `row` is the tile its top-left corner is on. They're drawn in list order, so later ones go on top.
- **`enemies`**, **`npcs`**: where enemies and NPCs start. `type` is its kind's name (its file in `enemies/` or `npcs/`), and `col`, `row` is the tile it stands on. An enemy's `ai` is only there if one was picked (a name in `ENEMY_AIS` in `enemies.js`); left out, it uses its kind's own. Likewise an NPC's `voice` (a voice's name, from `voices/`), and either's `sound` (a sound it carries around). An enemy's `follows` is only there if picked: `false` stays behind instead of following through warps, `true` follows even if its kind doesn't. So are an enemy's `hitParticles` and `deathParticles` (a name from `particles/`, or `null` for none). Maps without these lists just have none.
- **`warps`**: see [Warps](#warps). `name` is the warp's name, and `col`, `row` is its tile. `to` is the map it leads to (`""` for nowhere), and `toWarp` is the warp to arrive at on that map (`""` for its spawn point). `activate` is `"step"` or `"interact"` (press E). `enemies` is `true` if enemies chasing the player follow them through it (left out means `false`). Maps without this list just have no warps.
- **`sounds`**: see [Sound blocks](#sound-blocks). `sound` is the name of a sound (its file in `sounds/`), `col`, `row` is its tile, and `activate` is `"step"`, `"interact"` (press E) or `"loop"` (constantly nearby). A moving one also has `move` (`"side"`, `"upDown"`, `"past"`, `"pastDown"` or `"circle"`), `distance` and `speed` (tiles, and tiles a second), and one that's seen while playing has `"show": true`. Maps without this list just have no sound blocks.
- **`left`, `top`**: the tile column and row of the map's top-left corner. Tile `(0, 0)` is at the middle of the world, so `-5, -2` puts the middle of a 10 × 5 map there.
- **`spawn`**: where the player starts, in pixels (the centre of the player). Easiest to set with **spawn** in the editor's **Triggers** tab.

Older map files may also have a `"showGrid"` line. It isn't used any more and can be left in or deleted.

You can edit a map by hand: swap codes in `rows`, add a line to `legend`, or add an object to `objects`. Keep the codes separated by spaces. Codes in a hand-made file can be any length (e.g. `"grass": "grass"`), as long as they have no spaces in them.

Maps saved before objects were added (version 1, one character per tile with no spaces) still load. They're saved in the new format the next time they're exported.

## If something goes wrong

- **The map isn't in the M list:** check the file is in this folder, its name is in `index.json` (without `.json`), and the game is running through a local server. The browser console (F12) says which file failed and why.
- **"This warp is broken" when using a warp:** it leads to a map that isn't loaded, or to a warp name that map doesn't have. Right click the warp in the editor to fix it. Check that the map is in `index.json`, and that the warp on the other map wasn't renamed.
- **Some tiles, objects, enemies or NPCs are missing:** the map uses a name the game doesn't know, maybe because its file was renamed (or isn't in its folder's `index.json`), or a code that isn't in the `legend`. The console lists everything it left out. Add it back, or fix the name in the file.
- **"This doesn't look like a Squimble Quest map file":** the file isn't a map, or it's been damaged. It needs a `legend` and `rows` at least.
