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

// ---------- aiming ----------
// the player always faces the mouse
const AIM = {
  // how close (in pixels) the mouse can get to the player's centre before it stops changing
  // where they face. stops them spinning wildly when the mouse is right on top of them
  deadzone: 6,
  // the line pointing from the player towards the mouse, where a weapon will go later
  lineLength: 40,
  lineColour: '#d84a4a',
};

const CROSSHAIR = {
  // width of the dot in pixels
  size: 8,
  colour: '#23407a',
  // thin ring around the dot so it still shows up on dark ground
  outline: '#ffffff',
  // colour while the left button is held, so you can see clicks are being picked up
  heldColour: '#d84a4a',
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

// the browser numbers mouse buttons, this gives them names. the middle button is left out
// because on windows it starts the browser's auto scroll, which would fight with the game
const MOUSE_BUTTONS = {
  0: 'left',
  2: 'right',
};
