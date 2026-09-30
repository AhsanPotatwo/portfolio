// squimble quest, a top down rpg.
// new to the project? start with README.md in this folder: how it all fits together, what's
// planned, known issues, and how to keep those notes up to date when you change things.
//
// this file runs the game loop. the other files in this folder hold the pieces it uses,
// and squimble-quest.html loads them in this order before this one:
//   config.js     settings: sizes, speeds, controls, button styles
//   utils.js      small helpers (maths, text settings)
//   input.js      the keyboard and mouse
//   camera.js     which part of the world is on screen, and world ↔ screen positions
//   tiles.js      every kind of tile and what it does (grass, walls, lava...)
//   objects.js    every kind of object that sits on the tiles (furniture, decorations...)
//   enemies.js    every kind of enemy, and its ai
//   npcs.js       every kind of friendly npc, and what they say
//   weapons.js    every weapon, and the swings they make
//   items.js      every kind of item that can be carried (a sword, an axe...)
//   tilemap.js    a map made of tiles: storing, drawing, resizing, and collision with solid tiles
//   maps.js       the list of map files to load, the map the game starts on, and visited maps
//   mapfile.js    saving and loading maps as files
//   world.js      draws the world (the map, plus dev mode lines)
//   character.js  what the player, enemies and npcs share: walking, health, attacking, drawing
//   player.js     the player (needs character.js loaded first)
//   enemy.js      an enemy in the game (needs character.js loaded first)
//   npc.js        an npc in the game (needs character.js loaded first)
//   ui.js         the ui system: UIElement and the UI manager
//   button.js     buttons (needs ui.js loaded first, because Button builds on UIElement)
//   textfield.js  boxes you type words or numbers into (needs ui.js loaded first)
//   hud.js        things drawn over the game that aren't ui elements (crosshair, messages, panels)
//   inventory.js  inventories, and the hotbar (needs button.js loaded first)
//   dialogue.js   talking to npcs: who's in range, and the text box
//   warps.js      warps (doors, caves, teleporters...): going through them, checking where they lead
//   warpgraph.js  the map editor's picture of every warp linked to a warp (needs button.js first)
//   editor.js     the map editor, opened from dev mode (needs button.js and textfield.js first)
//   debug.js      developer mode, hidden testing tools (press ` or Ctrl + D while playing)
//
// the catalogue files (tiles, objects, enemies, npcs, weapons, items) are where new things get
// added, each has a "how to make one" guide at the top

let player;
// not just "camera", because p5 already has a function called camera() for 3D
let gameCamera;
// the tile map the player is on
let worldMap;
// the enemies and npcs on it right now (see spawnCharacters())
let enemies = [];
let npcs = [];
// false until the map files have loaded, the game shows a loading message until then
let mapsReady = false;

// runs before setup(). p5 waits for everything started here (like images) to finish loading
// before it starts the game. load images for buttons and anything else in here too
function preload() {
  prepareArt(TILE_TYPES, 'tile');
  prepareArt(OBJECT_TYPES, 'object');
  prepareArt(ENEMY_TYPES, 'enemy');
  prepareArt(ITEM_TYPES, 'item');
  prepareArt(NPC_TYPES, 'npc');
}

// runs once when the page loads, after preload()
function setup() {
  const canvas = createCanvas(GAME_W, GAME_H);
  canvas.parent('sqCanvas');
  // keeps pixel art sharp instead of blurry when it's drawn scaled
  noSmooth();

  // canvas.elt is the real <canvas> element that p5 made
  Input.attach(canvas.elt);

  player = new Player(0, 0);
  gameCamera = new Camera();
  gameCamera.follow(player);
  // the hotbar along the bottom shows the player's inventory
  Hotbar.init(player.inventory);

  // the map files load in the background (see mapfile.js), then the game starts on START_MAP (maps.js).
  // they're loaded here rather than in preload() because a missing file in preload() would stop
  // the game ever starting, and this way it's just skipped
  loadMapFiles().then(() => {
    // not one map file loaded, so use the blank stand-in map (maps.js) so there's something to play on
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
    // warns in the browser console about warps leading to maps or warps that don't exist (warps.js)
    checkAllWarps();
    mapsReady = true;
  });

  // turns dev mode back on if it was on last time
  Debug.init();
  // makes the map editor's tile bar (hidden until it's opened)
  Editor.init();
  // makes the text box for talking to npcs (hidden until you talk to one)
  Dialogue.init();

  // ui: make buttons and other ui elements here, e.g.
  //   UI.add(new Button({ x: 20, y: 20, w: 120, h: 40, label: 'Play', onClick: () => { ... } }));
  // the guide at the top of button.js has everything else

  // phones/tablets get a message instead of the game (see squimble-quest.css), so don't run it there
  if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) noLoop();
}

// go to a map, by its name in MAPS (maps.js). puts the player on the warp called warpName
// (warps.js), or at the map's spawn point without one, and they'll respawn there too. the camera
// jumps straight there on a new map, and glides there on the same one. warps and dev mode's M key
// use this.
//
// every map is kept how it was left, until the page reloads: its tiles and editor changes (see
// getMap() in maps.js), and its enemies and npcs, which are put away on the map when the player
// leaves and brought back out when they return. so a defeated enemy stays gone, a hurt one is still
// hurt, and everyone's where they were. going to the same map (a warp to another spot on it) puts
// the same characters straight back, so it's just a teleport: only the player moves
function loadMap(name, warpName = '') {
  // going anywhere ends a conversation
  if (Dialogue.active) Dialogue.close();
  // worldMap is undefined when the game first starts
  if (worldMap) worldMap.characters = { enemies, npcs };
  const map = getMap(name);
  const sameMap = map === worldMap;
  worldMap = map;

  // a warp that isn't there (warpProblem() in warps.js catches that before a warp gets here)
  // arrives at the spawn point instead
  const warp = warpName ? worldMap.warp(warpName) : null;
  const arrive = warp ? standingOnTile(PLAYER, warp.col, warp.row) : worldMap.spawn;
  player.placeAt(arrive.x, arrive.y);
  // the tile they've arrived on counts as already stepped on, so a warp there doesn't send them
  // straight back (warps.js)
  Warps.arrived(player, worldMap);

  // the first visit makes its characters fresh. the map editor always shows everyone where they
  // were placed (see Editor.open() in editor.js), so it makes them fresh too
  if (worldMap.characters && !Editor.active) {
    ({ enemies, npcs } = worldMap.characters);
  } else {
    spawnCharacters();
  }

  // the camera stops at the edges of the map
  gameCamera.bounds = worldMap.bounds();
  // if the map editor's open, the camera's following its view rather than the player,
  // so move that to where the player arrived too
  if (Editor.active) {
    Editor.view.x = arrive.x;
    Editor.view.y = arrive.y;
  }
  // on a new map, jump there: gliding from a spot on the last map across this one would look
  // wrong. on the same map, the camera glides over to them like it does after dying, since it
  // already follows the player (or the editor's view)
  if (!sameMap) gameCamera.snap();
}

// makes every one of the map's enemies and npcs fresh, where it was placed and with full health,
// including enemies that were defeated. runs the first time a map is visited, and when the map
// editor opens, closes or changes them (so opening the editor is a quick way to reset them)
function spawnCharacters() {
  // the npc you're talking to is about to be replaced, so the conversation ends
  if (Dialogue.active) Dialogue.close();
  enemies = worldMap.enemySpawns.map((spawn) => new Enemy(spawn.type, spawn.col, spawn.row));
  npcs = worldMap.npcSpawns.map((spawn) => new Npc(spawn.type, spawn.col, spawn.row));
}

// runs every frame, around 60 times a second
function draw() {
  if (!mapsReady) {
    drawLoading();
    return;
  }

  // deltaTime is how long the last frame took in milliseconds (p5 gives us this).
  // turned into seconds and capped, see MAX_DT in config.js
  const dt = Math.min(deltaTime / 1000, MAX_DT);

  // 1. input: catch up on what the keyboard and mouse did since the last frame
  Input.update();
  // before anything else uses the mouse, so a click on a button isn't also a click in the game
  UI.update();

  // the mouse is a position on screen, but the player aims at a place in the world
  const aimScreen = Input.aimPoint();
  const aim = aimScreen ? gameCamera.screenToWorld(aimScreen.x, aimScreen.y) : null;

  // 2. update: dev tools first (they can move the player or zoom), then move everything,
  // then the camera last so it follows where the player is now
  Debug.update(player, gameCamera, worldMap, aim, dt);
  // while the map editor's open it takes over: WASD moves the camera, and everyone stands still
  if (Editor.active) {
    Editor.update(worldMap, gameCamera, aim, dt);
  } else if (Dialogue.active) {
    // talking to someone pauses the game. E moves the conversation on
    Dialogue.update(dt);
  } else {
    // everything the player, enemies and npcs might need to know about (see the top of character.js).
    // characters is everyone in one list, made once here rather than by each of them every frame
    const world = { map: worldMap, player, enemies, npcs, characters: [player, ...enemies, ...npcs] };

    // number keys and the mouse wheel change what the player's holding
    Hotbar.update();

    // the keyboard and mouse decide what the player does (see the top of character.js).
    // mousePressed() ignores clicks on buttons, so clicking the ui never swings the sword
    player.update({
      move: Input.direction(),
      aim,
      attack: Input.mousePressed('left'),
    }, dt, world);

    // each enemy's and npc's ai decides what it does
    for (const enemy of enemies) enemy.update(dt, world);
    // defeated enemies are gone. this list is what the map keeps when the player leaves, so they
    // stay gone (see loadMap())
    enemies = enemies.filter((enemy) => !enemy.dead);
    for (const npc of npcs) npc.update(dt, world);
    // enemies following the player to another map come out once they've got there (warps.js)
    Warps.update(dt);

    // the npc close enough to talk to (if any) shows an E over its head, and E starts talking.
    // otherwise, a warp that opens with E (if one's in reach) does the same (warps.js)
    const talkTo = Dialogue.npcInRange(player, npcs);
    for (const npc of npcs) npc.canTalk = npc === talkTo;
    Warps.reachable = talkTo ? null : Warps.inReach(player, worldMap);
    if (talkTo && Input.wasPressed('interact')) {
      talkTo.canTalk = false;
      Dialogue.open(talkTo, player, gameCamera);
    } else if (Warps.reachable && Input.wasPressed('interact')) {
      Warps.use(Warps.reachable);
    } else {
      // a warp that opens when it's stepped onto. after the E warp, which might have just gone to
      // another map, so this doesn't look at the new map in the same frame
      Warps.checkStep(player, worldMap);
    }
  }
  gameCamera.update(dt);

  // 3. draw: back to front, so later things go on top of earlier ones.
  // the world, drawn through the camera in world positions
  gameCamera.begin();
  drawWorld(gameCamera, worldMap, Debug.enabled);
  // whoever's standing further down the screen is in front, so sort by where their feet are
  const characters = [player, ...enemies, ...npcs].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
  for (const character of characters) character.draw();
  if (!Editor.active && !Dialogue.active) Warps.drawPrompt();
  if (Editor.active) Editor.drawCursor(worldMap, gameCamera, aim);
  gameCamera.end();

  // ui on top, in screen positions. the map editor fades it out while you move around (editor.js).
  // globalAlpha fades everything drawn after it, and pop() puts it back
  push();
  if (Editor.active) drawingContext.globalAlpha = Editor.uiAlpha;
  Debug.draw(player, gameCamera, worldMap, aim);
  if (!Editor.active && !Dialogue.active) Hotbar.drawLabel();
  UI.draw();
  pop();
  drawMessage();
  if (worldMap.name === FALLBACK_MAP) drawNoMapsMessage();
  if (Input.focused) {
    drawCrosshair(Input.mouse, Input.mouseHeld('left'), UI.hovered !== null);
  } else {
    drawClickToPlay();
  }
}
