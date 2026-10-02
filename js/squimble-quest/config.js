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
  // what's in the inventory at the start, from hotbar slot 1 along (names from items.js). the rest start empty.
  // the player attacks with whatever's in the picked slot (left click), empty hands can't attack
  startingItems: ['sword', 'axe'],
  colour: '#4a7bd8',
  outline: '#23407a',
  // flashes this colour for a moment when hurt
  hurtColour: '#e05050',
  hurtFlashTime: 0.15,
  // the bar over its head that shows while it's hurt
  healthBarColour: '#4ade80',
};

// ---------- aiming ----------
// the player always faces the mouse
const AIM = {
  // how close (in pixels) the mouse can get to the player's centre before it stops changing
  // where they face. stops them spinning wildly when the mouse is right on top of them
  deadzone: 6,
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
  // the map editor's small flat buttons, like a game engine's toolbar (editor.js, formbox.js)
  editor: {
    fill:        '#2b303a',
    hoverFill:   '#373d49',
    pressedFill: '#22262e',
    onFill:      '#3d5f9e',
    border:      '#3a404c',
    borderWeight: 1,
    radius:      3,
    textSize:    12,
    pressOffset: 0,
  },
  editorPrimary: {
    fill:        '#4a7bd8',
    hoverFill:   '#5b8ae3',
    pressedFill: '#3d69bd',
    onFill:      '#4a7bd8',
    border:      '#5b8ae3',
    borderWeight: 1,
    radius:      3,
    textSize:    12,
    pressOffset: 0,
  },
};

// ---------- controls ----------
// each action can have more than one key. these are e.code names, which go by the key's
// position on the keyboard rather than the letter, so WASD still works on other layouts.
// 'Control+' in front means that key with Ctrl held, e.g. 'Control+KeyD' is Ctrl + D
const KEYS = {
  up:    ['KeyW', 'ArrowUp'],
  down:  ['KeyS', 'ArrowDown'],
  left:  ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],

  // pick a hotbar slot (see inventory.js)
  slot1: ['Digit1', 'Numpad1'],
  slot2: ['Digit2', 'Numpad2'],
  slot3: ['Digit3', 'Numpad3'],
  slot4: ['Digit4', 'Numpad4'],
  slot5: ['Digit5', 'Numpad5'],

  // talk to an npc when you're next to them, and move the conversation on (see dialogue.js)
  interact: ['KeyE'],
  // open and close the inventory (inventory.js). E only does it when there's nobody to talk to and
  // no warp in reach, so I always works
  inventory: ['KeyE', 'KeyI'],
  // drop what you're holding on the ground (inventory.js)
  drop: ['KeyQ'],

  // developer mode (see debug.js). ` is the key under Esc, it switches dev mode on and off.
  // not every keyboard has a ` key, so Ctrl + D does the same.
  // the rest do nothing unless dev mode is on
  devMode:   ['Backquote', 'Control+KeyD'],
  // shows or hides the list of dev mode (and map editor) keys
  devKeys:   ['KeyH'],
  zoomIn:    ['Equal', 'NumpadAdd'],
  zoomOut:   ['Minus', 'NumpadSubtract'],
  zoomReset: ['Digit0', 'Numpad0'],
  // shows or hides the tile grid and the lines through (0, 0), to see the tiles on their own
  grid:      ['KeyG'],
  teleport:  ['KeyT'],
  nextMap:   ['KeyM'],
  // B for build. not E, that's for talking to people
  editor:    ['KeyB'],
};

// the browser numbers mouse buttons, this gives them names. the middle button is left out
// because on windows it starts the browser's auto scroll, which would fight with the game
const MOUSE_BUTTONS = {
  0: 'left',
  2: 'right',
};
