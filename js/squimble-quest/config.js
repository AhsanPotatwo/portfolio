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

// ---------- world ----------
// how big the maps in maps.js are, as edges in world pixels. (0, 0) is the middle of the world.
// 80 x 50 tiles (2560 x 1600 pixels), a few screens each way so the camera has room to move
const WORLD = {
  left:   -40 * TILE,
  right:   40 * TILE,
  top:    -25 * TILE,
  bottom:  25 * TILE,
};

// ---------- camera ----------
const CAMERA = {
  // how quickly the camera catches up with what it's following. higher is snappier,
  // lower is floatier. Infinity locks it straight onto the target with no delay
  followSpeed: 8,
  // same idea, for how quickly it reaches a new zoom
  zoomSpeed: 10,
  // 1 is normal size, 2 is everything twice as big, 0.5 is half size (see twice as much)
  minZoom: 0.25,
  maxZoom: 3,
};

// ---------- player ----------
const PLAYER = {
  // a bit under 1 tile wide and 2 tiles tall, a normal person in a top down game.
  // slightly smaller than 32x64 so they can fit through a 1 tile gap later
  width: 28,
  height: 56,
  // pixels per second. 160 is 5 tiles a second, a brisk walk
  speed: 160,
  // only the feet bump into walls, like most top down games (see feetBox() in player.js).
  // under a tile tall and wide, so the player fits through 1 tile gaps both ways
  feetWidth: 24,
  feetHeight: 14,
  maxHealth: 100,
  colour: '#4a7bd8',
  outline: '#23407a',
  // flashes this colour for a moment when hurt
  hurtColour: '#e05050',
  hurtFlashTime: 0.15,
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

// ---------- buttons ----------
// looks for buttons drawn as boxes (see button.js). a button picks one by name, e.g. style: 'primary',
// and any style only needs the settings it changes, everything else comes from default.
// colours can be anything css understands: '#ff0000', 'red', 'rgba(255, 0, 0, 0.5)'
const BUTTON_STYLES = {
  default: {
    fill:          '#2f3542',
    hoverFill:     '#3d4556',
    pressedFill:   '#252a35',
    // toggle buttons use this while they're switched on
    onFill:        '#3f8f52',
    border:        '#141820',
    borderWeight:  2,
    // rounded corners, 0 for square
    radius:        6,
    textColour:    '#ffffff',
    font:          'Quicksand',
    textSize:      16,
    // 'normal', 'bold' or 'italic'
    textStyle:     'bold',
    // how far the button sinks while held down, gives a little "press"
    pressOffset:   2,
    // how see-through it is while disabled (0 invisible, 1 solid)
    disabledAlpha: 0.4,
  },
  primary: {
    fill:        '#4a7bd8',
    hoverFill:   '#5b8ae3',
    pressedFill: '#3d69bd',
    border:      '#23407a',
  },
  danger: {
    fill:        '#c94545',
    hoverFill:   '#d65858',
    pressedFill: '#a93838',
    border:      '#5e1c1c',
  },
  // see-through with an outline, for less important buttons. white text, so it needs a dark background
  ghost: {
    fill:        'rgba(0, 0, 0, 0.35)',
    hoverFill:   'rgba(255, 255, 255, 0.12)',
    pressedFill: 'rgba(0, 0, 0, 0.5)',
    border:      '#ffffff',
    borderWeight: 1.5,
  },
};

// ---------- controls ----------
// each action can have more than one key. these are e.code names, which go by the key's
// position on the keyboard rather than the letter, so WASD still works on other layouts
const KEYS = {
  up:    ['KeyW', 'ArrowUp'],
  down:  ['KeyS', 'ArrowDown'],
  left:  ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],

  // developer mode (see debug.js). ` is the key under Esc, it switches dev mode on and off.
  // the rest do nothing unless dev mode is on
  devMode:   ['Backquote'],
  zoomIn:    ['Equal', 'NumpadAdd'],
  zoomOut:   ['Minus', 'NumpadSubtract'],
  zoomReset: ['Digit0', 'Numpad0'],
  teleport:  ['KeyT'],
  nextMap:   ['KeyM'],
};

// the browser numbers mouse buttons, this gives them names. the middle button is left out
// because on windows it starts the browser's auto scroll, which would fight with the game
const MOUSE_BUTTONS = {
  0: 'left',
  2: 'right',
};
