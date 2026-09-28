// squimble quest, a top down rpg.
// this file runs the game loop. the other files in this folder hold the pieces it uses,
// and squimble-quest.html loads them in this order before this one:
//   config.js   settings: sizes, speeds, controls, the size of the world
//   utils.js    small maths helpers
//   input.js    the keyboard and mouse
//   camera.js   which part of the world is on screen, and world ↔ screen positions
//   tiles.js    every kind of tile and what it does (grass, walls, lava...)
//   tilemap.js  a map made of tiles: storing, drawing, and collision with solid tiles
//   maps.js     the list of map files to load, and the map the game starts on
//   mapfile.js  saving and loading maps as files
//   world.js    draws the world (the map, plus dev mode lines)
//   player.js   the player
//   ui.js       the ui system: UIElement and the UI manager
//   button.js   buttons (needs ui.js loaded first, because Button builds on UIElement)
//   hud.js      things drawn over the game that aren't ui elements (crosshair, messages)
//   editor.js   the map editor, opened from dev mode (needs button.js loaded first)
//   debug.js    developer mode, hidden testing tools (press ` while playing)

let player;
// not just "camera", because p5 already has a function called camera() for 3D
let gameCamera;
// the tile map the player is on
let worldMap;
// false until the map files have loaded, the game shows a loading message until then
let mapsReady = false;

// runs before setup(). p5 waits for everything started here (like images) to finish loading
// before it starts the game. load images for buttons and anything else in here too
function preload() {
  prepareTiles();
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

  // the map files load in the background (see mapfile.js), then the game starts on START_MAP (maps.js).
  // they're loaded here rather than in preload() because a missing file in preload() would stop
  // the game ever starting, and this way it's just skipped
  loadMapFiles().then(() => {
    // not one map file loaded, so use the blank stand-in map (maps.js) so there's something to play on
    if (Object.keys(MAPS).length === 0) {
      console.warn('No map files could be loaded, so the game is on a blank stand-in map.');
      MAPS[FALLBACK_MAP] = buildFallbackMap;
    }

    let first = START_MAP;
    if (!MAPS[first]) {
      first = Object.keys(MAPS)[0];
      console.warn(`START_MAP is "${START_MAP}", but that map didn't load. Starting on "${first}" instead.`);
    }
    loadMap(first);
    mapsReady = true;
  });

  // turns dev mode back on if it was on last time
  Debug.init();
  // makes the map editor's tile bar (hidden until it's opened)
  Editor.init();

  // ui: make buttons and other ui elements here, e.g.
  //   UI.add(new Button({ x: 20, y: 20, w: 120, h: 40, label: 'Play', onClick: () => { ... } }));
  // the guide at the top of button.js has everything else

  // phones/tablets get a message instead of the game (see squimble-quest.css), so don't run it there
  if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) noLoop();
}

// go to a map, by its name in MAPS (maps.js). builds it fresh, puts the player at its spawn point
// (where they'll respawn too), and moves the camera straight there. dev mode's M key uses this
function loadMap(name) {
  worldMap = MAPS[name]();
  worldMap.name = name;

  player.placeAt(worldMap.spawn.x, worldMap.spawn.y);

  // the camera stops at the edges of the map
  gameCamera.bounds = worldMap.bounds();
  // jump there, rather than gliding across from wherever it was
  gameCamera.snap();
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
  // while the map editor's open it takes over: WASD moves the camera, and the player stands still
  if (Editor.active) {
    Editor.update(worldMap, gameCamera, aim, dt);
  } else {
    player.update(Input.direction(), aim, dt, worldMap);
  }
  gameCamera.update(dt);

  // 3. draw: back to front, so later things go on top of earlier ones.
  // the world, drawn through the camera in world positions
  gameCamera.begin();
  drawWorld(gameCamera, worldMap, Debug.enabled);
  player.draw();
  if (Editor.active) Editor.drawCursor(worldMap, gameCamera, aim);
  gameCamera.end();

  // ui on top, in screen positions
  Debug.draw(player, gameCamera, worldMap, aim);
  if (Editor.active) Editor.drawHelp();
  UI.draw();
  if (worldMap.name === FALLBACK_MAP) drawNoMapsMessage();
  if (Input.focused) {
    drawCrosshair(Input.mouse, Input.mouseHeld('left'), UI.hovered !== null);
  } else {
    drawClickToPlay();
  }
}
