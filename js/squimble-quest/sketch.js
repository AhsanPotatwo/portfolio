// squimble quest, a top down rpg.
// the game always draws at 960x540 (16:9) and css scales the canvas to fit the frame,
// so all the game maths can use these numbers and ignore the real screen size
const GAME_W = 960;
const GAME_H = 540;

// size of one map tile. 960x540 shows 30 x ~17 tiles, the camera will scroll so the half row is fine
const TILE = 32;

function setup() {
  const canvas = createCanvas(GAME_W, GAME_H);
  canvas.parent('sqCanvas');
  // keeps pixel art sharp instead of blurry when it's drawn scaled
  noSmooth();

  // phones/tablets get a message instead of the game (see squimble-quest.css), so don't run it there
  if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) noLoop();
}

function draw() {
  background('#ffffff');
}
