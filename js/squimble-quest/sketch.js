// squimble quest, a top down rpg. if you're new to the code, read README.md in this folder first.
//
// this file is the game loop. squimble-quest.html loads all the other files before it, in this order:
//   config.js     settings: sizes, speeds, controls, button styles
//   utils.js      helpers: maths, text, catalogues, loading/downloading files
//   input.js      keyboard and mouse
//   camera.js     what's on screen, and turning world positions into screen ones and back
//   tiles.js      tile kinds and what they do, loaded from tiles.json
//   dualgrid.js   dual grid tiles: ground that blends into its neighbours
//   objects.js    object kinds (furniture, decorations...)
//   pathfinding.js enemy routes round walls and harm, and dev mode's view of them
//   enemies.js    enemy kinds and their ai (after pathfinding.js)
//   npcs.js       npc kinds and what they say
//   weapons.js    weapons and their swings
//   items.js      item kinds, and loading weapons + items from items.json
//   itemglow.js   the rarity glow and sparkles drawn around items
//   tilemap.js    a tile map: storing, drawing, resizing, collision
//   maps.js       map file list, start map, visited maps
//   mapfile.js    saving and loading map files
//   world.js      draws the world (map + dev mode lines)
//   character.js  shared by player/enemies/npcs: walking, health, attacking, drawing
//   player.js     the player (after character.js)
//   enemy.js      an enemy (after character.js)
//   npc.js        an npc (after character.js)
//   ui.js         UIElement and the UI manager
//   button.js     buttons (after ui.js)
//   textfield.js  text and number boxes (after ui.js)
//   formbox.js    the editors' ask-for-things box, Picker and Checkbox
//   hud.js        non-ui overlays (crosshair, messages, panels)
//   inventory.js  inventories, hotbar, inventory screen, items on the ground (after button.js)
//   dialogue.js   talking to npcs: who's in range, the text box
//   warps.js      warps (doors, caves, teleporters...): using them, checking targets
//   warpgraph.js  editor's diagram of linked warps (after button.js)
//   sound.js      the sound library and synthesiser: working sounds out, playing them, drawing them
//   soundblocks.js sound blocks: tiles that play a sound, and their settings box (after sound.js)
//   editor.js     the map editor, from dev mode (after button.js, textfield.js)
//   tileeditor.js editor's tile box (after editor.js)
//   soundeditor.js the sound editor, a full screen synthesiser (after editor.js)
//   debug.js      dev mode (` or Ctrl + D)

let player;
// not called "camera" because p5 already has camera() for 3D
let gameCamera;
// the map the player is on
let worldMap;
// the enemies and npcs that are alive on it right now (see spawnCharacters())
let enemies = [];
let npcs = [];
// false until the tiles and maps have loaded, and a loading message shows until then
let mapsReady = false;

// p5 waits for anything loaded in here before it runs setup(), so pictures for buttons go here too.
// tiles and items load in setup() instead, along with the maps
function preload() {
  prepareArt(OBJECT_TYPES, 'object');
  prepareArt(ENEMY_TYPES, 'enemy');
  prepareArt(NPC_TYPES, 'npc');
  // the rarity glow pictures and colours (itemglow.js)
  prepareArt(RARITIES, 'rarity');
}

function setup() {
  const canvas = createCanvas(GAME_W, GAME_H);
  canvas.parent('sqCanvas');
  // keeps pixel art sharp when it's scaled up
  noSmooth();

  // canvas.elt is the actual <canvas> element
  Input.attach(canvas.elt);

  player = new Player(0, 0);
  gameCamera = new Camera();
  gameCamera.follow(player);
  Hotbar.init(player.inventory);
  // E or I opens it (it's hidden until then)
  InventoryScreen.init(player.inventory);

  // tiles (tiles.js) and sounds (sound.js) have to load before maps (mapfile.js), since loading a map
  // checks its tiles and sounds exist. items (items.js) load at the same time. then it starts on
  // START_MAP (maps.js). this isn't in preload() because there a missing file would stop the game
  // starting, but here it just gets skipped
  Promise.all([Promise.all([loadTileFile(), loadSoundFile()]).then(loadMapFiles), loadItemFile()]).then(() => {
    player.giveStartingItems();
    // the editor starts with the first tile picked, which exists now
    Editor.checkSelected();
    // no map files loaded, so use the blank stand-in map (maps.js)
    if (Object.keys(MAPS).length === 0) {
      console.warn('No map files could be loaded, so the game is on a blank stand-in map.');
      addMap(FALLBACK_MAP, buildFallbackMap);
    }

    let first = START_MAP;
    if (!MAPS[first]) {
      first = Object.keys(MAPS)[0];
      console.warn(`START_MAP is "${START_MAP}", but that map didn't load. Starting on "${first}" instead.`);
    }
    loadMap(first);
    // console warnings for broken warp links (warps.js)
    checkAllWarps();
    mapsReady = true;
  });

  // turns dev mode back on if it was on last time
  Debug.init();
  Editor.init();
  Dialogue.init();

  // to add ui: UI.add(new Button({ x: 20, y: 20, w: 120, h: 40, label: 'Play', onClick: () => { ... } }));
  // see the guide in button.js

  // phones and tablets get a message instead (squimble-quest.css), so don't run the game
  if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) noLoop();
}

// goes to map `name` (MAPS, maps.js), arriving on warp `warpName` (warps.js), or on the map's spawn
// if there isn't one. dying always respawns you at the spawn (Player.respawn(), player.js). the camera
// jumps to a new map but glides on the same one. warps and dev mode's M use this.
//
// maps stay how you left them until you reload: the tiles and any editor changes (getMap(), maps.js),
// and the characters, which get stored on the map when you leave and put back when you return
// (defeated ones stay gone, hurt ones stay hurt). going to the same map (a warp somewhere else on it)
// keeps the same characters, so it's just a teleport
function loadMap(name, warpName = '') {
  if (Dialogue.active) Dialogue.close();
  // worldMap is undefined the very first time
  if (worldMap) worldMap.characters = { enemies, npcs };
  const map = getMap(name);
  const sameMap = map === worldMap;
  worldMap = map;

  // a warp that doesn't exist (warpProblem() in warps.js normally catches it first) arrives at the
  // spawn instead
  const warp = warpName ? worldMap.warp(warpName) : null;
  const arrive = warp ? standingOnTile(PLAYER, warp.col, warp.row) : worldMap.spawn;
  player.placeAt(arrive.x, arrive.y);
  // the tile you arrive on counts as stepped on, so its warp doesn't send you straight back (warps.js)
  Warps.arrived(player, worldMap);

  // fresh characters on the first visit, and always in the editor (it shows the design, Editor.open())
  if (worldMap.characters && !Editor.active) {
    ({ enemies, npcs } = worldMap.characters);
  } else {
    spawnCharacters();
  }

  gameCamera.bounds = worldMap.bounds();
  // in the editor the camera follows the editor's view, so move that too
  if (Editor.active) {
    Editor.view.x = arrive.x;
    Editor.view.y = arrive.y;
  }
  // gliding over from the last map would look wrong. on the same map it glides, like after dying
  if (!sameMap) gameCamera.snap();
}

// makes every enemy and npc again from the spawn lists, at full health, including defeated ones. runs
// the first time you visit a map, and when the editor opens, closes or changes them (so it's a quick
// way to reset enemies)
function spawnCharacters() {
  // the npc you're talking to is about to be replaced
  if (Dialogue.active) Dialogue.close();
  enemies = worldMap.enemySpawns.map((spawn) => new Enemy(spawn.type, spawn.col, spawn.row, spawn.ai));
  npcs = worldMap.npcSpawns.map((spawn) => new Npc(spawn.type, spawn.col, spawn.row, spawn.voice));
  // the sound each one loops wherever it goes: its own if its spawn picked one, otherwise its kind's
  // (soundblocks.js plays them)
  enemies.forEach((enemy, i) => { enemy.sound = worldMap.enemySpawns[i].sound ?? enemy.type.sound; });
  npcs.forEach((npc, i) => { npc.sound = worldMap.npcSpawns[i].sound ?? npc.type.sound; });
}

function draw() {
  if (!mapsReady) {
    drawLoading();
    return;
  }

  // how long the last frame took in seconds, capped (MAX_DT in config.js)
  const dt = Math.min(deltaTime / 1000, MAX_DT);

  // 1. input
  Input.update();
  // before anything else uses the mouse, so clicking on the ui doesn't also count as a click in the game
  UI.update();

  // the mouse in world positions
  const aimScreen = Input.aimPoint();
  const aim = aimScreen ? gameCamera.screenToWorld(aimScreen.x, aimScreen.y) : null;

  // 2. update: dev tools first (they can move the player and zoom), and the camera last
  Debug.update(player, gameCamera, worldMap, aim, dt);
  // in the editor WASD moves the camera and everyone stands still
  if (Editor.active) {
    Editor.update(worldMap, gameCamera, aim, dt);
  } else {
    // what characters know about the world (top of character.js). characters is made once here
    // instead of once per character
    const world = { map: worldMap, players: [player], enemies, npcs, characters: [player, ...enemies, ...npcs] };

    // the number keys and wheel pick the held item, Q drops it, and the open inventory drags items
    // around (inventory.js). not while talking though, since the dialogue box hides the hotbar
    if (!Dialogue.active) {
      Hotbar.update();
      if (Input.wasPressed('drop')) Drops.drop(worldMap, player, player.inventory.selected);
    }
    if (InventoryScreen.active) InventoryScreen.update(worldMap, player);

    // mousePressed() ignores clicks on the ui. with the inventory open you stand still and the mouse
    // moves items. while talking you can't attack, but walking away ends the conversation (dialogue.js)
    player.update(InventoryScreen.active ? STAND_STILL : {
      move: Input.direction(),
      aim,
      attack: !Dialogue.active && Input.mousePressed('left'),
    }, dt, world);
    // picks up items that are close enough (inventory.js)
    Drops.update(worldMap, player, dt);

    for (const enemy of enemies) enemy.update(dt, world);
    // the map keeps this list when you leave, so defeated ones stay gone (loadMap())
    enemies = enemies.filter((enemy) => !enemy.dead);
    for (const npc of npcs) npc.update(dt, world);
    // enemies following you to another map come out when it's time (warps.js)
    Warps.update(dt);
    // loop sound blocks start when you come close enough to hear them, and so do the sounds
    // characters carry around (soundblocks.js)
    SoundBlocks.update(worldMap);
    SoundBlocks.updateCharacters([...enemies, ...npcs], worldMap);

    // while talking, E moves the conversation on and nothing else is in reach.
    // otherwise E talks to the npc in range (it shows an E), or if there isn't one uses an E warp in
    // reach (warps.js), or if there isn't one plays an E sound block in reach (soundblocks.js), or if
    // there's none of those either opens or closes the inventory (I always does). nothing's in reach
    // while the inventory is open
    const talkTo = InventoryScreen.active || Dialogue.active ? null : Dialogue.npcInRange(player, npcs);
    for (const npc of npcs) npc.canTalk = npc === talkTo;
    Warps.reachable = talkTo || InventoryScreen.active || Dialogue.active ? null : Warps.inReach(player, worldMap);
    SoundBlocks.reachable = talkTo || Warps.reachable || InventoryScreen.active || Dialogue.active ? null : SoundBlocks.inReach(player, worldMap);
    if (Dialogue.active) {
      Dialogue.update(player, dt);
      SoundBlocks.checkStep(player, worldMap);
      Warps.checkStep(player, worldMap);
    } else if (talkTo && Input.wasPressed('interact')) {
      talkTo.canTalk = false;
      Dialogue.open(talkTo, player, gameCamera);
    } else if (Warps.reachable && Input.wasPressed('interact')) {
      Warps.use(Warps.reachable, player);
    } else if (SoundBlocks.reachable && Input.wasPressed('interact')) {
      SoundBlocks.play(SoundBlocks.reachable, worldMap);
    } else {
      if (Input.wasPressed('inventory')) InventoryScreen.show(!InventoryScreen.active);
      // step triggers go after the E warp, which might have changed the map, so they never look at
      // the new map in the same frame. sound blocks go before warps, since Warps.checkStep() is what
      // remembers the tile you're on
      SoundBlocks.checkStep(player, worldMap);
      Warps.checkStep(player, worldMap);
    }
  }
  gameCamera.update(dt);
  // sounds get quieter the further they are from the player's feet, and higher or lower as they and
  // the player move (the doppler effect, sound.js). this runs in the editor too, so finished sounds
  // (like the sound editor's previews) still get tidied up
  Sound.update({ x: player.x, y: player.y + feetBelowCentre(PLAYER), map: worldMap }, dt);

  // 3. draw, from back to front. the warp graph and the sound editor cover the whole screen
  // (warpgraph.js, soundeditor.js), so skip drawing the world under them. a big map with lots of warps
  // is slow and would slow them down
  if (!WarpGraph.active && !SoundEditor.active) {
    gameCamera.begin();
    drawWorld(gameCamera, worldMap, Debug.enabled && Debug.showGrid);
    // sort by feet so whatever's lower on screen is in front. drops sort by their shadow (even while
    // they're being thrown). they show in the editor too, since you can place them there
    const things = [
      ...[player, ...enemies, ...npcs].map((c) => ({ y: c.y + c.h / 2, draw: () => c.draw() })),
      ...worldMap.drops.map((d) => ({ y: Drops.where(d).y, draw: () => Drops.draw(d) })),
    ];
    things.sort((a, b) => a.y - b.y);
    for (const thing of things) thing.draw();
    // dev mode: each enemy's ai and its route (pathfinding.js)
    if (Debug.enabled && Debug.showPaths) drawEnemyPlans(enemies, gameCamera);
    // sound blocks set to be seen (soundblocks.js). the editor draws every block its own way
    if (!Editor.active) SoundBlocks.draw(worldMap);
    if (!Editor.active && !Dialogue.active) {
      Warps.drawPrompt();
      SoundBlocks.drawPrompt();
    }
    if (Editor.active) Editor.drawCursor(worldMap, gameCamera, aim);
    gameCamera.end();
  }

  // the ui, in screen positions. the editor fades it out while you move (editor.js), and globalAlpha
  // lasts until pop()
  push();
  if (Editor.active) drawingContext.globalAlpha = Editor.uiAlpha;
  Debug.draw(player, gameCamera, worldMap, aim);
  if (!Editor.active && !Dialogue.active && !InventoryScreen.active) Hotbar.drawLabel();
  UI.draw();
  InventoryScreen.drawDragged();
  pop();
  drawMessage();
  if (worldMap.name === FALLBACK_MAP) drawNoMapsMessage();
  if (Input.focused) {
    drawCrosshair(Input.mouse, Input.mouseHeld('left'), UI.hovered !== null);
  } else {
    drawClickToPlay();
  }
}
