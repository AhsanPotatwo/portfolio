// tweakable numbers, in one place

// ---------- screen ----------
// always drawn at 960x540 (16:9); css scales the canvas, so game maths ignores the real screen size
const GAME_W = 960;
const GAME_H = 540;

// tile size in px. 960x540 shows 30 x ~17 tiles; the camera scrolls, so the half row is fine
const TILE = 32;

// max seconds one frame can count as, so the player doesn't jump after the tab was in the background
const MAX_DT = 0.05;

// ---------- camera ----------
const CAMERA = {
  // catch-up rate: higher is snappier. Infinity locks on with no delay
  followSpeed: 8,
  // same, for zoom
  zoomSpeed: 10,
  // 1 normal, 2 twice as big, 0.5 half (see twice as much)
  minZoom: 0.25,
  maxZoom: 3,
};

// ---------- player ----------
const PLAYER = {
  // under 32x64 (1 x 2 tiles), to fit 1 tile gaps later
  width: 28,
  height: 56,
  // px/s. 160 is 5 tiles/s
  speed: 160,
  // only the feet hit walls (feetBox() in player.js). under a tile both ways, to fit 1 tile gaps
  feetWidth: 24,
  feetHeight: 14,
  maxHealth: 100,
  // inventory at start, from hotbar slot 1 (names from items.js). attacks with the picked slot's
  // item; empty hands can't attack
  startingItems: ['sword', 'axe'],
  colour: '#4a7bd8',
  outline: '#23407a',
  // brief flash when hurt
  hurtColour: '#e05050',
  hurtFlashTime: 0.15,
  // overhead bar, shown while hurt
  healthBarColour: '#4ade80',
};

// ---------- aiming ----------
// the player always faces the mouse
const AIM = {
  // px from the player's centre within which the mouse stops turning them (no wild spinning)
  deadzone: 6,
};

const CROSSHAIR = {
  // dot width, px
  size: 8,
  colour: '#23407a',
  // ring so it shows on dark ground
  outline: '#ffffff',
  // while left is held, to show clicks register
  heldColour: '#d84a4a',
};

// ---------- buttons ----------
// boxed button looks (button.js), picked by name, e.g. style: 'primary'. a style only lists what it
// changes from default. colours are any css colour
const BUTTON_STYLES = {
  default: {
    fill:          '#2f3542',
    hoverFill:     '#3d4556',
    pressedFill:   '#252a35',
    // toggle buttons while on
    onFill:        '#3f8f52',
    border:        '#141820',
    borderWeight:  2,
    // corner radius, 0 for square
    radius:        6,
    textColour:    '#ffffff',
    font:          'Quicksand',
    textSize:      16,
    // 'normal', 'bold' or 'italic'
    textStyle:     'bold',
    // how far it sinks while held
    pressOffset:   2,
    // alpha while disabled
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
  // see-through with an outline, for minor buttons. white text, needs a dark background
  ghost: {
    fill:        'rgba(0, 0, 0, 0.35)',
    hoverFill:   'rgba(255, 255, 255, 0.12)',
    pressedFill: 'rgba(0, 0, 0, 0.5)',
    border:      '#ffffff',
    borderWeight: 1.5,
  },
  // map editor's small flat toolbar buttons (editor.js, formbox.js)
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
// keys per action, as e.code names (key position, not letter, so WASD works on any layout).
// 'Control+' prefix means with Ctrl held, e.g. 'Control+KeyD'
const KEYS = {
  up:    ['KeyW', 'ArrowUp'],
  down:  ['KeyS', 'ArrowDown'],
  left:  ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],

  // hotbar slots (inventory.js)
  slot1: ['Digit1', 'Numpad1'],
  slot2: ['Digit2', 'Numpad2'],
  slot3: ['Digit3', 'Numpad3'],
  slot4: ['Digit4', 'Numpad4'],
  slot5: ['Digit5', 'Numpad5'],

  // talk to a nearby npc, and move the conversation on (dialogue.js)
  interact: ['KeyE'],
  // toggle the inventory (inventory.js). E only with nobody to talk to and no warp in reach, so I always works
  inventory: ['KeyE', 'KeyI'],
  // drop the held item (inventory.js)
  drop: ['KeyQ'],

  // dev mode toggle (debug.js). ` is under Esc; Ctrl + D for keyboards without it.
  // the rest only work in dev mode
  devMode:   ['Backquote', 'Control+KeyD'],
  // toggles the dev mode / editor key list
  devKeys:   ['KeyH'],
  zoomIn:    ['Equal', 'NumpadAdd'],
  zoomOut:   ['Minus', 'NumpadSubtract'],
  zoomReset: ['Digit0', 'Numpad0'],
  // toggles the tile grid and the (0, 0) lines
  grid:      ['KeyG'],
  teleport:  ['KeyT'],
  nextMap:   ['KeyM'],
  // B for build (E is for talking)
  editor:    ['KeyB'],
};

// browser button numbers → names. middle is left out: on windows it starts auto scroll, which fights the game
const MOUSE_BUTTONS = {
  0: 'left',
  2: 'right',
};
