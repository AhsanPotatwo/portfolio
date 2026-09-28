// all the numbers you might want to tweak live here, so they're in one place
// instead of being scattered through the code

// ---------- screen ----------
// the game always draws at 960x540 (16:9) and css scales the canvas to fit the frame,
// so all the game maths can use these numbers and ignore the real screen size
const GAME_W = 960;
const GAME_H = 540;

// size of one map tile. 960x540 shows 30 x ~17 tiles, the camera will scroll so the half row is fine
const TILE = 32;

// longest a single frame is allowed to count as (in seconds). if the tab is in the background
// the browser pauses the game, and without this the player would jump a long way when you come back
const MAX_DT = 0.05;

// ---------- player ----------
const PLAYER = {
  // a bit under 1 tile wide and 2 tiles tall, a normal person in a top down game.
  // slightly smaller than 32x64 so they can fit through a 1 tile gap later
  width: 28,
  height: 56,
  // pixels per second. 160 is 5 tiles a second, a brisk walk
  speed: 160,
  colour: '#4a7bd8',
  outline: '#23407a',
};

// ---------- controls ----------
// each action can have more than one key. these are e.code names, which go by the key's
// position on the keyboard rather than the letter, so WASD still works on other layouts
const KEYS = {
  up:    ['KeyW', 'ArrowUp'],
  down:  ['KeyS', 'ArrowDown'],
  left:  ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};
