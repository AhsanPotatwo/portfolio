// squimble quest, a top down rpg.
// this file runs the game loop. the other files in this folder hold the pieces it uses,
// and squimble-quest.html loads them in this order before this one:
//   config.js   settings: sizes, speeds, controls
//   utils.js    small maths helpers
//   input.js    the keyboard and mouse
//   grid.js     the tile grid background
//   player.js   the player
//   ui.js       things drawn on top of the game (crosshair, messages)

let player;

// runs once when the page loads
function setup() {
  const canvas = createCanvas(GAME_W, GAME_H);
  canvas.parent('sqCanvas');
  // keeps pixel art sharp instead of blurry when it's drawn scaled
  noSmooth();

  // canvas.elt is the real <canvas> element that p5 made
  Input.attach(canvas.elt);

  // start in the middle of the screen
  player = new Player(GAME_W / 2, GAME_H / 2);

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

  // 2. update: move everything
  player.update(Input.direction(), Input.aimPoint(), dt);

  // 3. draw: back to front, so later things go on top of earlier ones
  background('#ffffff');
  drawGrid();
  player.draw();

  if (Input.focused) {
    drawCrosshair(Input.mouse, Input.mouseHeld('left'));
  } else {
    drawClickToPlay();
  }
}
