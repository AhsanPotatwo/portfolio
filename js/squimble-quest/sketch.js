// squimble quest, a top down rpg. new here? read README.md in this folder first.
//
// this file is the game loop. squimble-quest.html loads the others first, in this order:
//   config.js     settings: sizes, speeds, controls, button styles
//   utils.js      helpers: maths, text, catalogues, loading/downloading files
//   input.js      keyboard and mouse
//   camera.js     what's on screen, world ↔ screen positions
//   tiles.js      tile kinds and what they do, loaded from tiles.json
//   dualgrid.js   dual grid tiles: ground that blends into its neighbours
//   objects.js    object kinds (furniture, decorations...)
//   enemies.js    enemy kinds and their ai
//   npcs.js       npc kinds and what they say
//   weapons.js    weapons and their swings
//   items.js      item kinds, and loading weapons + items from items.json
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
//   editor.js     the map editor, from dev mode (after button.js, textfield.js)
//   tileeditor.js editor's tile box (after editor.js)
//   debug.js      dev mode (` or Ctrl + D)

let player;
// not "camera": p5 has camera() for 3D
let gameCamera;
// the map the player is on
let worldMap;
// its live enemies and npcs (see spawnCharacters())
let enemies = [];
let npcs = [];
// false until tiles and maps load; shows a loading message until then
let mapsReady = false;

// p5 waits for loads started here before setup(). images for buttons go here too
// (tiles and items load in setup(), with the maps)
function preload() {
  prepareArt(OBJECT_TYPES, 'object');
  prepareArt(ENEMY_TYPES, 'enemy');
  prepareArt(NPC_TYPES, 'npc');
}

function setup() {
  const canvas = createCanvas(GAME_W, GAME_H);
  canvas.parent('sqCanvas');
  // sharp pixel art when scaled
  noSmooth();

  // canvas.elt is the real <canvas>
  Input.attach(canvas.elt);

  player = new Player(0, 0);
  gameCamera = new Camera();
  gameCamera.follow(player);
  Hotbar.init(player.inventory);
  // E or I opens it (hidden until then)
  InventoryScreen.init(player.inventory);

  // tiles (tiles.js) before maps (mapfile.js), since loading a map checks its tiles exist; items
  // (items.js) alongside. then start on START_MAP (maps.js). not in preload(), where a missing file
  // would stop the game starting; here it's just skipped
  Promise.all([loadTileFile().then(loadMapFiles), loadItemFile()]).then(() => {
    player.giveStartingItems();
    // the editor starts on the first tile, which exists now
    Editor.checkSelected();
    // no map files loaded: use the blank stand-in (maps.js)
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

  // dev mode back on if it was last time
  Debug.init();
  Editor.init();
  Dialogue.init();

  // to add ui: UI.add(new Button({ x: 20, y: 20, w: 120, h: 40, label: 'Play', onClick: () => { ... } }));
  // see the guide in button.js

  // phones/tablets get a message instead (squimble-quest.css), so don't run
  if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) noLoop();
}

// go to map `name` (MAPS, maps.js), onto warp `warpName` (warps.js) or the map's spawn without one.
// dying always respawns at the spawn (Player.respawn(), player.js). camera jumps on a new map,
// glides on the same one. used by warps and dev mode's M.
//
// maps stay as left until reload: tiles and editor changes (getMap(), maps.js), and characters,
// stored on the map on leaving and restored on return (defeated stay gone, hurt stay hurt). the
// same map (a warp elsewhere on it) keeps the same characters, so it's just a teleport
function loadMap(name, warpName = '') {
  if (Dialogue.active) Dialogue.close();
  // undefined on first start
  if (worldMap) worldMap.characters = { enemies, npcs };
  const map = getMap(name);
  const sameMap = map === worldMap;
  worldMap = map;

  // a missing warp (warpProblem() in warps.js normally catches it first) arrives at the spawn
  const warp = warpName ? worldMap.warp(warpName) : null;
  const arrive = warp ? standingOnTile(PLAYER, warp.col, warp.row) : worldMap.spawn;
  player.placeAt(arrive.x, arrive.y);
  // the arrival tile counts as stepped on, so its warp doesn't fire straight back (warps.js)
  Warps.arrived(player, worldMap);

  // fresh characters on first visit, and always in the editor (it shows the design, Editor.open())
  if (worldMap.characters && !Editor.active) {
    ({ enemies, npcs } = worldMap.characters);
  } else {
    spawnCharacters();
  }

  gameCamera.bounds = worldMap.bounds();
  // in the editor the camera follows its view, so move that too
  if (Editor.active) {
    Editor.view.x = arrive.x;
    Editor.view.y = arrive.y;
  }
  // gliding across from the last map would look wrong; same map glides like after dying
  if (!sameMap) gameCamera.snap();
}

// remakes every enemy and npc from the spawn lists at full health, defeated ones included. runs on a
// map's first visit and when the editor opens, closes or changes them (a quick enemy reset)
function spawnCharacters() {
  // the npc being talked to is replaced
  if (Dialogue.active) Dialogue.close();
  enemies = worldMap.enemySpawns.map((spawn) => new Enemy(spawn.type, spawn.col, spawn.row));
  npcs = worldMap.npcSpawns.map((spawn) => new Npc(spawn.type, spawn.col, spawn.row));
}

function draw() {
  if (!mapsReady) {
    drawLoading();
    return;
  }

  // last frame in seconds, capped (MAX_DT in config.js)
  const dt = Math.min(deltaTime / 1000, MAX_DT);

  // 1. input
  Input.update();
  // before anything else uses the mouse, so a ui click isn't also a game click
  UI.update();

  // mouse in world coords
  const aimScreen = Input.aimPoint();
  const aim = aimScreen ? gameCamera.screenToWorld(aimScreen.x, aimScreen.y) : null;

  // 2. update: dev tools first (they move the player/zoom), camera last
  Debug.update(player, gameCamera, worldMap, aim, dt);
  // editor: WASD moves the camera, everyone stands still
  if (Editor.active) {
    Editor.update(worldMap, gameCamera, aim, dt);
  } else if (Dialogue.active) {
    // talking pauses the game; E moves it on
    Dialogue.update(dt);
  } else {
    // what characters can see (top of character.js). characters built once here, not per character
    const world = { map: worldMap, player, enemies, npcs, characters: [player, ...enemies, ...npcs] };

    // number keys/wheel pick the held item, Q drops it, the open inventory drags items (inventory.js)
    Hotbar.update();
    if (Input.wasPressed('drop')) Drops.drop(worldMap, player, player.inventory.selected);
    if (InventoryScreen.active) InventoryScreen.update(worldMap, player);

    // mousePressed() ignores ui clicks. inventory open: stand still, the mouse moves items
    player.update(InventoryScreen.active ? STAND_STILL : {
      move: Input.direction(),
      aim,
      attack: Input.mousePressed('left'),
    }, dt, world);
    // picks up nearby items (inventory.js)
    Drops.update(worldMap, player, dt);

    for (const enemy of enemies) enemy.update(dt, world);
    // the map keeps this list on leaving, so defeated stay gone (loadMap())
    enemies = enemies.filter((enemy) => !enemy.dead);
    for (const npc of npcs) npc.update(dt, world);
    // enemies following to another map come out when due (warps.js)
    Warps.update(dt);

    // E: talk to the npc in range (shows an E), else use an E warp in reach (warps.js), else toggle
    // the inventory (I always does). nothing's in reach while it's open
    const talkTo = InventoryScreen.active ? null : Dialogue.npcInRange(player, npcs);
    for (const npc of npcs) npc.canTalk = npc === talkTo;
    Warps.reachable = talkTo || InventoryScreen.active ? null : Warps.inReach(player, worldMap);
    if (talkTo && Input.wasPressed('interact')) {
      talkTo.canTalk = false;
      Dialogue.open(talkTo, player, gameCamera);
    } else if (Warps.reachable && Input.wasPressed('interact')) {
      Warps.use(Warps.reachable);
    } else {
      if (Input.wasPressed('inventory')) InventoryScreen.show(!InventoryScreen.active);
      // step warps after the E warp, which may have changed map, so this never sees the new map
      // in the same frame
      Warps.checkStep(player, worldMap);
    }
  }
  gameCamera.update(dt);

  // 3. draw, back to front. the warp graph covers the screen (warpgraph.js), so skip the world under
  // it: a big map with many warps is slow and would slow the graph
  if (!WarpGraph.active) {
    gameCamera.begin();
    drawWorld(gameCamera, worldMap, Debug.enabled && Debug.showGrid);
    // sort by feet so lower on screen is in front. drops sort by their shadow (mid throw too).
    // shown in the editor as well, since it places them
    const things = [
      ...[player, ...enemies, ...npcs].map((c) => ({ y: c.y + c.h / 2, draw: () => c.draw() })),
      ...worldMap.drops.map((d) => ({ y: Drops.where(d).y, draw: () => Drops.draw(d) })),
    ];
    things.sort((a, b) => a.y - b.y);
    for (const thing of things) thing.draw();
    if (!Editor.active && !Dialogue.active) Warps.drawPrompt();
    if (Editor.active) Editor.drawCursor(worldMap, gameCamera, aim);
    gameCamera.end();
  }

  // ui in screen coords. the editor fades it while moving (editor.js); globalAlpha lasts until pop()
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
