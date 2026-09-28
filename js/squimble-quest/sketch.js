// squimble quest, a top down rpg.
// this file runs the game loop. the other files in this folder hold the pieces it uses,
// and squimble-quest.html loads them in this order before this one:
//   config.js   settings: sizes, speeds, controls, the size of the world
//   utils.js    small maths helpers
//   input.js    the keyboard and mouse
//   camera.js   which part of the world is on screen, and world ↔ screen positions
//   world.js    the floor and grid
//   player.js   the player
//   ui.js       the ui system: UIElement and the UI manager
//   button.js   buttons (needs ui.js loaded first, because Button builds on UIElement)
//   hud.js      things drawn over the game that aren't ui elements (crosshair, messages)
//   debug.js    developer mode, hidden testing tools (press ` while playing)

let player;
// not just "camera", because p5 already has a function called camera() for 3D
let gameCamera;

// runs once when the page loads
function setup() {
  const canvas = createCanvas(GAME_W, GAME_H);
  canvas.parent('sqCanvas');
  // keeps pixel art sharp instead of blurry when it's drawn scaled
  noSmooth();

  // canvas.elt is the real <canvas> element that p5 made
  Input.attach(canvas.elt);

  // start in the middle of the world
  player = new Player(0, 0);

  gameCamera = new Camera();
  gameCamera.follow(player);
  // start already on the player, rather than gliding over to them
  gameCamera.snap();

  // makes the dev buttons, and turns dev mode back on if it was on last time
  Debug.init(player, gameCamera);

  // phones/tablets get a message instead of the game (see squimble-quest.css), so don't run it there
  if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) noLoop();
}

// runs every frame, around 60 times a second
function draw() {
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
  Debug.update(player, gameCamera, aim, dt);
  player.update(Input.direction(), aim, dt);
  gameCamera.update(dt);

  // 3. draw: back to front, so later things go on top of earlier ones.
  // the world, drawn through the camera in world positions
  gameCamera.begin();
  drawWorld(gameCamera, Debug.enabled && Debug.showAxes);
  player.draw();
  gameCamera.end();

  // ui on top, in screen positions
  Debug.draw(player, gameCamera, aim);
  UI.draw(Debug.enabled && Debug.showHitboxes);
  if (Input.focused) {
    drawCrosshair(Input.mouse, Input.mouseHeld('left'), UI.hovered !== null);
  } else {
    drawClickToPlay();
  }
}
