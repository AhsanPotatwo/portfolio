# Squimble Quest maps

Every map in the game is one `.json` file in this folder, and `index.json` lists them. The file name is the map's name, so `forest.json` is the map called `forest`. Everything else the game's made of (tiles, sounds, items, enemies, NPCs, objects) has a folder next to this one that works the same way, see the [data README](../README.md).

A map is made of:

- **Tiles**: the ground. Every spot has exactly one tile (grass, wall, water…), or is empty. Tiles are made in the editor's tile editor and kept in [`tiles/`](../tiles/README.md), a file each.
- **Objects**: things placed on top, like furniture and decorations. One object can cover several tiles (a 2 × 1 table), and several can share a tile (a table on a rug). Each kind of object is a file in [`objects/`](../objects/) (the guide's at the top of [`objects.js`](../../../js/squimble-quest/objects.js)).
- **Enemies**: where each enemy starts. They appear there with full health the first time you go to the map. After that, each map remembers its enemies and NPCs as you left them: defeated enemies stay defeated and hurt ones stay hurt, until the page is reloaded. Each kind of enemy is a file in [`enemies/`](../enemies/) (the guide's at the top of [`enemies.js`](../../../js/squimble-quest/enemies.js)). Right click a placed enemy for its settings, in three tabs beside a picture of it that wears what you pick: **Gear** (its **Weapon**: its own, like the grunt's claws, empty hands, or any weapon item such as a sword or bow; then what it wears on its head, body, legs and feet, and three accessories, where only items worn there are listed and armour is just for show for now). An enemy with a bow stands back and shoots whenever it can see you within most of the bow's range, and walks closer when a wall is in the way, **Behaviour** (its **AI**, and whether it follows you through **Warps**) and **Effects** (its **Sound**, and the particles that burst out when it's **Hit** and when it dies, **Death**; blood, unless you pick others or **none**). **Edit hit particles** / **Edit death particles** save the box and open the particle editor on the one picked; saving that under a new name gives the new effect to this enemy. AI: **smart** goes round walls and avoids lava and spikes unless the way round is much longer, **careful** goes a long way round rather than get hurt, **reckless** takes harm whenever it's quicker (but not enough to kill it), **direct** is the old straight line (stuck behind walls), and **still** doesn't move. Left as **its own**, it uses the one in its kind's file. The pathfinders also work round each other: they spread out, come at you from different sides and surround you, and give way when they get in each other's way. Every enemy sees you from 15 tiles unless a wall is in the way (water isn't), hears you within 5 tiles even through walls, and tells others nearby. Once it's after you it keeps track round corners, and only loses you after 8 seconds out of sight and out of range; the pathfinders then walk back to where they started. In dev mode each enemy shows its AI, what it's doing and its planned route (**P** hides them).
- **NPCs**: where each friendly character starts. Walk up to one and press **E** to talk. Each kind of NPC, and what they say, is a file in [`npcs/`](../npcs/) (the guide's at the top of [`npcs.js`](../../../js/squimble-quest/npcs.js)). Right click a placed NPC to pick its **voice** (or pick one in the **Voices** tab and click the NPC); left as **its own**, it uses its kind's voice from its file. Its **Look** and **Colours** tabs change what it looks like: a part for each slot (body, eyes, mouth...) and their colours. A colour box left empty follows the main colour above it. See [voices](../sounds/README.md#voices-and-talking).
- **Warps**: tiles that take the player to another map, or somewhere else on the same one. That's how doors, cave entrances, manholes, trapdoors, secret passages and teleporters work. See [Warps](#warps) below, and [`js/squimble-quest/warps.js`](../../../js/squimble-quest/warps.js).

## The maps in this folder

| File | What it is |
|---|---|
| `default.json` | A blank white map (80 × 50 tiles) |
| `example.json` | The testing map: a bit of every tile (hut, pond, lava, spikes), tables and rugs, two training dummies to hit, and a villager to talk to (walk up and press **E**). Press **E** at the hut's door to go inside. Follow the road east through the gap in the wall to a test graveyard with its own foggy, eerie atmosphere area (see [Atmosphere areas](#atmosphere-areas)); the lava pool and the pond have areas too (heat haze and embers, steam). The game starts here (`START_MAP` in `maps.js`) |
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

1. Open the game, click it, then press **B** (map editor). It only works while your role can build (`PLAYER_ROLE` in `config.js`, see [Who can build](#who-can-build)).
2. Click **File > New map** in the menu bar along the top, type a width and height, and choose what to fill it with. Or just edit the map you're on.
3. Paint tiles and place objects.
4. Press **Ctrl + S** (or **File > Save**), type a name, and it downloads as `yourname.json`.
5. Move the file into this folder (`assets/squimble-quest/maps/`).
6. Add its name (without `.json`) to `index.json` in this folder:

   ```json
   ["default", "example", "yourname"]
   ```

7. Reload the game. Press **M** in developer mode until you reach your map.

## Who can build

The editor and dev mode are locked by role (`ROLES` and `PLAYER_ROLE` in `js/squimble-quest/config.js`): a **developer** gets both, a **builder** just the editor (**B**), and a **player** neither. It's `developer` while the game's being made; set `PLAYER_ROLE` to `player` before shipping and both are gone from the game, keys, menus and all. In a multiplayer game the server would hand out roles, so some people could build.

## Making a map

Open the editor with **B** (for build), with or without dev mode. Everything you do changes the map you're on, so you can close the editor (**B**, or **▶ Play** at the top) and walk around it straight away, or press **Space** to start playing from wherever the mouse is.

It's laid out like a game engine:

- a **menu bar** along the top: **File** (new, open, save, recover), **Edit** (undo, redo, cut, copy, paste, select all, search), **View** (grid, atmosphere, AI routes, minimap, zoom, hide the editor, and in dev mode the dev menu and dev info panel), **Map** (resize, atmosphere, world map, find uses, check for problems on this map or every map, art report), **Tools** and **Help** (every key). Each menu line shows its key. **▶ Play** and **Play here** are in the middle, and the map's name and size on the right, with a yellow dot while it has changes that aren't saved
- a **tool strip** down the left: **Paint**, **Erase**, **Fill**, **Rectangle**, **Select** and **Pick**, the **brush** size, and **undo** and **redo**. Rest the mouse on one to see what it does and its key
- a **dock** on the right: the **palette** of things to place, with a **search** box and a row of what you picked lately above it, and the **inspector** under it showing what's picked
- a **status bar** along the bottom: the tile under the mouse, what a click does, the selection's size, the brush and the zoom
- a **minimap** in the bottom left: the whole map in its tile colours, with warps (purple), the spawn (yellow), enemies (red) and NPCs (green), and a white box round what's on screen. Click or drag on it to move there. **View > Minimap** hides it

Dev mode's info panel doesn't show in the editor, since the bars already say the map, mouse tile and zoom. **View > Dev info panel** brings it back while dev mode is on.

| Control | What it does |
|---|---|
| **Tiles** / **Objects** / **Enemies** / **NPCs** / **Triggers** / **Weapons** / **Armour** / **Items** / **Sounds** / **Voices** / **Particles** tabs at the top of the palette | Switch between the ground tiles, objects (furniture, decorations…), enemies, friendly NPCs, triggers (the player's spawn point, and warps), weapons, things you wear, other items, sound blocks, NPC voices and particle effects. When there are more tabs than fit, **‹ ›** (or the mouse wheel over them) scrolls along. **Lights** is an empty example for now |
| A weapon or item picked | Click the map to put one on the ground (it isn't saved with the map). **Give** in the inspector puts one in your inventory, **Edit** (or right click it in the palette) changes its name, rarity, colour, where it's worn (**Worn on**, for the equipment slots) and everything about its weapon: **Weapon** (swing or shoot, how many hits its combo has, the time to carry on the combo, for bows how long to hold to fully draw, how strong a quick tap is and how fast you walk while drawing, how fast you walk while holding it, and its colour), **Hit** (damage, reach, arc, windup before a swing, timings, arrow speed) and **Feel** (knockback, stagger, lunge, recoil, screen shake and how long it lasts, hit stop). Each combo hit has its own Hit and Feel numbers: pick which with **Hit** at the top. The box on the right keeps doing the whole combo on a dummy over a faint tile grid, shaking like the screen would, so you can tune it as you drag (click it to start over). Rest the mouse on a row to see what it does. The enemies' own weapons (like the grunt's claws) are at the end of the Weapons tab with a little enemy badge: click one to change it the same way. **Export** in the inspector downloads the file of each item or enemy you've changed: put them in `assets/squimble-quest/items/` or `enemies/` (replacing the old ones) to keep the changes |
| **File > New map** / **Open map** (**Ctrl + O**) / **Map > Resize** | Make a new map, open a map file, or change this map's size |
| **File > Save** (**Ctrl + S**) / **Save as** (**Ctrl + Shift + S**) | Download the map's file to put in this folder. Save uses its name (or asks, for a map that's never been saved); Save as always asks. See [Saving and unsaved changes](#saving-and-unsaved-changes) |
| **Map > Atmosphere** | The map's fog, colour, weather and background sound. See [Atmospheres](#atmospheres) |
| Click something in the palette | Choose it. Hover over one to see its name. The mouse wheel scrolls the palette while the mouse is over it. It also goes in the row above the palette |
| **Search** box above the palette (**/** or **Ctrl + F**) | Type part of a name to only show matching ones. **Enter** picks the first, **Escape** empties it. If nothing on this tab matches it says which tabs have some. While it has the typing, the editor's keys wait |
| The row above the palette | What you picked lately. Click one to pick it again (its tab opens), **Shift + click** pins it to the front (a blue dot), right click takes it off. **Shift + click** a palette square pins it too |
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
| Right click | Change the settings of what's under the mouse: a warp, a sound block, an enemy (its weapon and armour; its **Stats**: health, speed, damage, attack rate, and how much knockback and stagger it takes; its **Behaviour**: AI, following through warps, and how far it sees, hears, chases and alerts allies, how long it remembers you and how close it gets to attack; its sound and particles; beside a picture of it). The sliders start on its kind's numbers: once you move one, a yellow tick marks the kind's and the number turns yellow, and right click or **Reset** puts them back, or an NPC's voice. Rest the mouse on a row in any of these boxes to see what it does |
| **Erase** (**X**), then left click / drag | Delete. Starting on an object, enemy, NPC, warp or sound block removes those; starting on bare ground empties tiles. **Shift + drag** erases a rectangle the same way |
| **Paint** (**N**) | Click to place what's picked, or drag to paint tiles. **Shift + drag** paints a rectangle of the picked tile |
| **Brush** (**,** and **.**, or click / right click / wheel on it) | How many tiles across Paint and Erase are, 1 to 5 |
| **Fill** (**L**), then click | Fills the patch of the same tile (joined up, down, left or right) with the picked tile. Empty patches fill too |
| **Rectangle** (**R**), then drag | Fills a box with the picked tile |
| **Select** (**V**), then drag | Selects a box. **Ctrl + C** copies what's in it (tiles, objects, enemies and NPCs with their settings, warps, sound blocks and areas), **Ctrl + X** cuts it, **Delete** clears it. **Ctrl + A** selects the whole map, **Escape** lets go |
| **Ctrl + V** | The copy follows the mouse (its top left on the mouse's tile), and each click stamps it, until **Escape** or right click. Empty tiles in the copy don't paste over anything, so it stamps like a sticker. Pasted warps get a name of their own. It works on other maps too |
| **Pick** (**K**), or **Alt + click** with any tool | Picks what's under the mouse in the palette: an enemy or NPC, then an object, an item, a warp, a sound block, then the tile. An empty tile turns on Erase |
| **Ctrl + Z** / **Ctrl + Y** (or **Ctrl + Shift + Z**) | Undo and redo anything on the map: painting (a whole drag is one undo), erasing, filling, pasting, placing, and the settings boxes (one undo each). Each map has its own, until you reload. Tiles', sounds' and items' own settings aren't undone this way (their boxes have Cancel) |
| **Space**, or **Play here** then click the map | Close the editor and start playing on that tile. Opening the editor again goes back to where you were |
| **Tab** | Hide the editor to see the map on its own. **Tab** again brings it back |
| **Map > Check for problems** | A list of things that'd go wrong in the game: the spawn or a warp players arrive at on a solid or empty tile, warps that go nowhere real, enemies or NPCs standing in walls, sounds, voices, items, particles and atmospheres that don't exist. Click one to go there (it flashes). It checks again as you fix things. Drag it by its title |
| **Map > Check every map** | The same list for every map, each line ending with its map. Clicking one goes to that map and flashes the tile |
| **Map > Find uses of what's picked** | Everywhere the thing picked in the palette is used: tiles counted on each map, every enemy, NPC, object, sound block, warp or area that names it (an enemy holding the sword, an NPC talking with a voice), and other things' settings (the lava tile's particles, an item's hit sound). Click one to go there. With a trigger picked it lists every spawn, warp or area on every map. Check before renaming or deleting something |
| **Map > World map** | Every map as a box, with arrows for the warps between them, starting from the map you're on. Maps nothing links to sit off to the right. Hover over one to see its spawn, click one to go there. Works like the warp graph (drag, wheel, **Escape**) |
| Rest the mouse on an **enemy** | Rings round it for how far it attacks, hears you (through walls), alerts allies, sees you and gives up the chase, each labelled in tiles, using its own settings if it has them. The floor it can see is lit and the floor walls hide from it is darkened, so you can see where a player can sneak past |
| **Map > Art report** | Pictures that didn't load or are the wrong size: tiles that aren't square, variants and frames a different size to their texture, dual grid tilesets that can't be cut up, objects whose picture is a different shape to their tiles. Click one to pick it in the palette. Handy after adding a batch of sprites |
| **Help > Keys and mouse** | Every key and mouse action in one list |
| **WASD** | Move around the map. The editor's buttons and panels fade out while you move, so you can see the map, and come back when you stop |
| **−** **=** or mouse wheel | Zoom out and in (**0** resets) |
| **G** / **P** | Show or hide the tile grid / the enemy AI routes |
| **M** | Go to the next map (dev mode) |
| **H** | Open or close the dev menu (dev mode; **View > Dev menu** does too): tick what the info panel and the map show, and click tools |
| **B** | Close the editor |

Empty tiles show the dark background and can't be walked on, like the edge of the map.

While the editor's open, everyone stands still. Opening it brings back every enemy placed on the map, including ones you've defeated, so you always see the whole design (it's also a quick way to reset them while testing). Closing it puts every enemy and NPC back where it was placed, with full health. Defeating an enemy never removes it from the map, so it's still in the file when you save.

### Saving and unsaved changes

**Ctrl + S** (**File > Save**) downloads the map's file (`name.json`): put it in this folder, replacing the old one, and add the name to `index.json` if it's new. **Save as** (**Ctrl + Shift + S**) asks for a name first, and saving under a new name works like "save as" anywhere (see [Changing a map that's already in the game](#changing-a-map-youve-already-made)).

While a map has changes since it loaded or was last saved, a yellow dot shows by its name at the top right, and a copy is kept in your browser, so reloading the page or closing it doesn't lose them. After a reload, opening the editor says which maps have unsaved changes: **File > Recover unsaved changes** lists them, and each can be brought back (you go to it, still unsaved until you save it), thrown away, or left for later. Changing a map without bringing its changes back first replaces the old copy. Undoing back to how it was saved throws the copy away.

### New maps

Click **File > New map**. A box asks for the width and height in tiles: click a number (or press **Tab**) to type into it, then press **Enter** or **Make map** (**Escape** or **Cancel** closes it). The smallest is 1 × 1 and the biggest is 500 × 500. Tile `(0, 0)` is in the middle of the new map, and that's where the player spawns.

**Fill** is what every tile starts as. It starts on `blank` (plain white). Click it to pick from a list of every tile (with their pictures), or use its **‹ ›** arrows to step through them. The last one is **empty**: the map starts with no tiles at all.

**Rooms that aren't rectangles** (L-shapes, crosses, rooms joined by corridors): fill with **empty**, make the map big enough to fit the whole shape, then paint the floor in the shape you want. Everything you don't paint stays empty, and empty tiles work like walls. Remember to put the spawn point (**Triggers** tab) on the floor.

A new map is called `new-map` until you save it with a name of its own.

### Resizing a map

Click **Map > Resize**, and type the new width and height into the box (it works like the **New map** one). The map grows or shrinks around its middle, and any new space is empty, ready to paint.

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
3. Click a choice to pick from a list of all of them, or its **‹ ›** arrows for the next or last one. Then click **Save**.

In the editor, warps that open with E have an **E** on their marker. A warp shows **red** when it leads to a map or warp that doesn't exist. Going through one of those shows a message and the player stays where they are, and the browser console lists them all when the game loads.

Arriving on a warp that opens by stepping on it doesn't send you straight back. It only opens when you step onto it from another tile.

**Show links** opens the warp graph. The warp you're editing is at the top with a yellow edge, and under it is every warp linked to it, whichever way round, on any map. Each box shows a warp's name and its map, and the arrows point the way each warp leads, so a door and its way back out have an arrow at both ends. A dashed arrow is a link that loops back to a warp elsewhere in the graph. A warp with lots of links (like a village square that every door leads to) has them in rows of six, one under the other, so it stays readable however many there are. A warp that leads to a spawn point shows that spawn point as a box, and one leading to a warp that doesn't exist shows a red box. Hover over a box to see where that warp is: a window onto its map, with the warp ringed in yellow. Drag to move around it and use the mouse wheel to zoom. Click a box to go to that warp in the editor (the settings box closes without saving). **Close** or **Escape** goes back to the warp's settings. It shows the warp as it was last saved, so **Save** changes first to see them in the graph.

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

### Atmospheres

An atmosphere is how a map *feels*: fog drifting over it, light rippling on a sea floor, cloud shadows or stars, a colour over everything, colour drained out, flickering firelight, dark or bright edges, weather (rain, snow, ash, embers, bubbles, sand, spores, fireflies, falling leaves, floating dust), flashes of lightning and a sound looping in the background. The game will have worlds of different themes, and a world's maps can all share one atmosphere, so changing it changes all of them.

Click **Map > Atmosphere**. The box changes the map behind it as you drag, and the picture on its right shows it over a made-up bit of map, for when the box is in the way. Drag the box by its title to see more.

- **Main**: **Atmosphere** is the one this map uses (**none** for none). Picking another starts on that one, and its little picture shows what it looks like. **Save as** is the name it's saved under: a new name makes a copy and leaves the old one, and leaving it empty takes the atmosphere off this map. **Sound** loops everywhere on the map (silent in the editor), at **Volume**. **Pixel size** is how chunky fog and the overlay are: bigger is more pixel art and quicker on slow computers, and unticking **Smooth** gives them hard pixel edges. **Bands** steps them into flat shades, for a cel shaded look.
- **Colour**: a **Tint** over everything (blue underwater, orange in a volcano), how strong, and how it mixes (**Tint mode**: shades, brightens, recolours...). **Drained** takes the colour out of everything. **Flicker** makes the tint flicker like firelight, at **Flicker rate**. **Edges** darken (or with a light **Edge colour**, brighten) the edges of the screen.
- **Fog** and **Overlay**: two sheets, the same apart from where they start. **Amount** turns one on. **Pattern**: soft clouds, long wisps, big patches, ripples of light (underwater), streaks (heat shimmer, blowing sand) or specks (stars, dust). **Blend**: covers (fog), glow (adds light) or shade (cloud shadows). **Size** is how big the pattern is, **Cover** how much of the screen it covers, **Softness** how soft its edges are.
- **Fog moves** and **Overlay moves**: **Speed** and **Direction** it drifts. **Layers** stacks smaller, nearer copies for depth, and **Churn** makes them move differently so it swirls. **Parallax** is how much it moves with the map: 100 sits on the ground, 0 stays on the screen, over 100 is nearer than the ground. **Breathe** slowly thickens and thins it.
- **Weather**: **Particles** to fall or float all over the screen (any particle effect: make your own on the **Particles** tab), and how many (**Amount**: at 100% it's as if every tile on screen made them at their **Keep going** rate). **Flashes** a minute, their colour, and a sound for each (like thunder).

Rest the mouse on any row to see what it does, and right click a slider to put it back. **Save** keeps it and gives this map that atmosphere. **Save and export** also downloads the atmosphere files that are new or changed, for `assets/squimble-quest/atmospheres/` (the message says which names to add to its `index.json`). **Export** the map too, so it remembers which atmosphere it uses.

The ones in `atmospheres/` are a start for each kind of world, to use or copy: **misty-forest**, **underwater**, **volcano**, **inferno**, **desert**, **wasteland**, **snowfield**, **swamp**, **cave**, **storm**, **space**, **alien** and **dreamy**.

To see the map without its atmosphere while you build, untick **View > Atmosphere** (or **Atmosphere** in the dev menu, **H**). It hides areas too. A map whose atmosphere has been renamed or deleted just has none (the console says so); pick another.

### Atmosphere areas

An area is a box or oval of tiles with an atmosphere of its own, on top of the map's: a foggy graveyard in a sunny field, heat haze and embers round a lava pool, steam off a hot spring, a glowing swamp patch, a dark corner of a forest, a sunlit clearing, a toxic pit, a haunted house's garden. Any atmosphere works, including the whole-world ones (a **swamp** area, a **storm** area over one hill).

- **Making one:** **Triggers** tab, pick **area** (the dashed box), then drag over the map. Its settings open when you let go.
- **Changing one:** right click anywhere inside it. Changes show on the map as you make them, and **Cancel** puts it back.
  - **Area** tab: **Atmosphere** (which one), **Shape** (a box, or an oval that fits in it, for round pools and clearings), **Fade** (how many tiles in from its edge it takes to fade in fully; 0 is a hard edge), **Strength** (how strong all of it is, so one atmosphere can be thick in one place and faint in another). **Edit atmosphere** opens the atmosphere itself (the same box as the toolbar's, and every map and area using it changes) or makes a new one with **Save as**. **Delete area** takes it off the map.
  - **Where** tab: its left column, top row, width and height in tiles (type a minus sign for negative numbers).
- **What it does:** its fog, overlay, tint and drained colour sit on the ground inside it, so you see the graveyard's fog from outside. Its weather only falls inside it, thinning out over the fade. Its sound comes from the nearest part of it, getting louder as you walk in (from as far as the sound's own **Heard from**). Its screen **Edges** and **Flashes** grow as you walk in, so stepping into the graveyard darkens the edges of the screen.
- In the editor, areas show as dashed outlines with their atmosphere's name (red if it isn't loaded); the dotted line inside shows where the fade ends. While editing, the edges and flashes go by the middle of the screen rather than the player.
- Overlapping areas all draw, the last made on top, and right click opens the last made. Areas are saved in the map file (save the map).

The atmospheres made for areas are **graveyard**, **lava-heat** and **hot-spring**, with the particles **ghost-lights** and **steam**, and the objects **gravestone**, **crypt** and **dead-tree** for the test graveyard.

### Changing a map you've already made

Go to it with **M** (or **File > Open map**), edit it, save it (**Ctrl + S**, same name), and replace the old file in this folder with the new one.

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

Opening or saving a map with the same name as one that's already loaded replaces it until you reload the page. Saving under a **new** name (**Save as**) works like "save as": the map you're on becomes the new one, and the old name goes back to its own file (without your unsaved changes).

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
  "atmosphere": "misty-forest",
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
  "areas": [
    { "atmosphere": "graveyard", "col": 1, "row": -1, "cols": 4, "rows": 3, "shape": "box", "fade": 1, "strength": 100 }
  ],
  "sounds": [
    { "sound": "coin", "col": 3, "row": 0, "activate": "step" }
  ]
}
```

- **`rows`**: the tiles, one line per row, top row first, with a code for each tile separated by spaces.
- **`legend`**: which code means which tile (the tiles' names, from `tiles/`). `..` is always empty. The editor makes a 2-character code for each tile when it exports, from the tile's name where it can: `gr` for grass, then `wt` for water because `wa` is already wall. There are thousands of possible codes, so they won't run out however many tiles you add.
- **`objects`**: everything placed on the tiles. `type` is the object's name (its file in `objects/`), and `col`, `row` is the tile its top-left corner is on. They're drawn in list order, so later ones go on top.
- **`enemies`**, **`npcs`**: where enemies and NPCs start. `type` is its kind's name (its file in `enemies/` or `npcs/`), and `col`, `row` is the tile it stands on. An enemy's `ai` is only there if one was picked (a name in `ENEMY_AIS` in `enemies.js`); left out, it uses its kind's own. Likewise an NPC's `voice` (a voice's name, from `voices/`) and `look` (what it looks like, picked on its box's Look and Colours tabs, format atop `looks.js`), and either's `sound` (a sound it carries around). An enemy's `follows` is only there if picked: `false` stays behind instead of following through warps, `true` follows even if its kind doesn't. So are an enemy's `hitParticles` and `deathParticles` (a name from `particles/`, or `null` for none), and its `wears`: what it wears, like `{ "head": "iron-helmet", "accessory1": "ring" }` (slots `head`, `body`, `legs`, `feet`, `accessory1` to `accessory3`, each an item name from `items/`), its `holds`: an item it holds instead of its kind's own weapon, like `"bow"` (`null` is empty hands), and its `stats`: its own numbers where they differ from its kind's, like `{ "maxHealth": 150, "damageScale": 2 }` (the keys are `ENEMY_SPAWN_STATS` in `enemies.js`). Maps without these lists just have none.
- **`warps`**: see [Warps](#warps). `name` is the warp's name, and `col`, `row` is its tile. `to` is the map it leads to (`""` for nowhere), and `toWarp` is the warp to arrive at on that map (`""` for its spawn point). `activate` is `"step"` or `"interact"` (press E). `enemies` is `true` if enemies chasing the player follow them through it (left out means `false`). Maps without this list just have no warps.
- **`sounds`**: see [Sound blocks](#sound-blocks). `sound` is the name of a sound (its file in `sounds/`), `col`, `row` is its tile, and `activate` is `"step"`, `"interact"` (press E) or `"loop"` (constantly nearby). A moving one also has `move` (`"side"`, `"upDown"`, `"past"`, `"pastDown"` or `"circle"`), `distance` and `speed` (tiles, and tiles a second), and one that's seen while playing has `"show": true`. Maps without this list just have no sound blocks.
- **`left`, `top`**: the tile column and row of the map's top-left corner. Tile `(0, 0)` is at the middle of the world, so `-5, -2` puts the middle of a 10 × 5 map there.
- **`spawn`**: where the player starts, in pixels (the centre of the player). Easiest to set with **spawn** in the editor's **Triggers** tab.
- **`atmosphere`**: the name of its atmosphere (its file in `atmospheres/`), only there if it has one. See [Atmospheres](#atmospheres).
- **`areas`**: see [Atmosphere areas](#atmosphere-areas). `atmosphere` is an atmosphere's name, `col`, `row` its top-left tile and `cols`, `rows` its size in tiles, `shape` is `"box"` or `"oval"`, `fade` is tiles (0 is a hard edge) and `strength` 0 to 100. Maps without this list just have no areas.

Older map files may also have a `"showGrid"` line. It isn't used any more and can be left in or deleted.

You can edit a map by hand: swap codes in `rows`, add a line to `legend`, or add an object to `objects`. Keep the codes separated by spaces. Codes in a hand-made file can be any length (e.g. `"grass": "grass"`), as long as they have no spaces in them.

Maps saved before objects were added (version 1, one character per tile with no spaces) still load. They're saved in the new format the next time they're exported.

## If something goes wrong

- **The map isn't in the M list:** check the file is in this folder, its name is in `index.json` (without `.json`), and the game is running through a local server. The browser console (F12) says which file failed and why.
- **"This warp is broken" when using a warp:** it leads to a map that isn't loaded, or to a warp name that map doesn't have. Right click the warp in the editor to fix it. Check that the map is in `index.json`, and that the warp on the other map wasn't renamed.
- **Some tiles, objects, enemies or NPCs are missing:** the map uses a name the game doesn't know, maybe because its file was renamed (or isn't in its folder's `index.json`), or a code that isn't in the `legend`. The console lists everything it left out. Add it back, or fix the name in the file.
- **"This doesn't look like a Squimble Quest map file":** the file isn't a map, or it's been damaged. It needs a `legend` and `rows` at least.
