// all the numbers you might want to tweak, kept in one place

// ---------- screen ----------
// the game is always drawn at 960x540 (16:9). css stretches the canvas to fit the page, so the game
// maths never has to care about the real screen size
const GAME_W = 960;
const GAME_H = 540;

// tile size in px. 960x540 fits 30 x about 17 tiles. the camera scrolls, so the half row doesn't matter
const TILE = 32;

// the most seconds one frame can count as. without this the player would jump forward after the tab
// was in the background for a while
const MAX_DT = 0.05;

// ---------- camera ----------
const CAMERA = {
  // how fast it catches up, higher is snappier. Infinity locks on with no delay
  followSpeed: 8,
  // same thing but for zoom
  zoomSpeed: 10,
  // 1 is normal, 2 is twice as big, 0.5 is half size (so you see twice as much)
  minZoom: 0.25,
  maxZoom: 3,
};

// ---------- player ----------
const PLAYER = {
  // a bit under 32x64 (1 x 2 tiles) so it'll fit through 1 tile gaps later
  width: 28,
  height: 56,
  // px/s. 160 is 5 tiles a second
  speed: 160,
  // only the feet bump into walls (feetBox() in character.js). smaller than a tile both ways so the
  // player fits through 1 tile gaps
  feetWidth: 24,
  feetHeight: 14,
  maxHealth: 100,
  // what's in the inventory at the start, filling from hotbar slot 1 (names are item files, items/). you
  // attack with the item in the picked slot, and empty hands can't attack
  startingItems: ['sword', 'axe'],
  colour: '#4a7bd8',
  outline: '#23407a',
  // quick flash when hurt
  hurtColour: '#e05050',
  hurtFlashTime: 0.15,
  // health bar over their head, only shown once hurt
  healthBarColour: '#4ade80',
  // the particle effect that bursts out when an enemy's swing hits them (particles.js)
  hitParticles: 'blood',
};

// ---------- aiming ----------
// the player always faces the mouse
const AIM = {
  // when the mouse is closer than this many px to the player's middle it stops turning them,
  // otherwise they spin around wildly
  deadzone: 6,
};

const CROSSHAIR = {
  // dot width, px
  size: 8,
  colour: '#23407a',
  // outline so it still shows up on dark ground
  outline: '#ffffff',
  // colour while left click is held, so you can tell clicks are working
  heldColour: '#d84a4a',
};

// ---------- buttons ----------
// button looks (button.js), picked by name like style: 'primary'. each style only needs the settings
// that are different from default. colours can be any css colour
const BUTTON_STYLES = {
  default: {
    fill:          '#2f3542',
    hoverFill:     '#3d4556',
    pressedFill:   '#252a35',
    // toggle buttons while they're on
    onFill:        '#3f8f52',
    border:        '#141820',
    borderWeight:  2,
    // corner radius, 0 for square corners
    radius:        6,
    textColour:    '#ffffff',
    font:          'Quicksand',
    textSize:      16,
    // 'normal', 'bold' or 'italic'
    textStyle:     'bold',
    // how far it sinks while held down
    pressOffset:   2,
    // how see-through it is while disabled
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
  // see-through with an outline, for less important buttons. the text is white so it needs a dark
  // background behind it
  ghost: {
    fill:        'rgba(0, 0, 0, 0.35)',
    hoverFill:   'rgba(255, 255, 255, 0.12)',
    pressedFill: 'rgba(0, 0, 0, 0.5)',
    border:      '#ffffff',
    borderWeight: 1.5,
  },
  // the map editor's small flat toolbar buttons (editor.js, formbox.js)
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
// the keys for each action, as e.code names. those go by where the key is, not the letter printed on
// it, so WASD still works on other keyboard layouts. 'Control+' at the front means Ctrl has to be
// held too, like 'Control+KeyD'
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
  // open and close the inventory (inventory.js). E only does it when there's nobody to talk to and no
  // warp in reach, so I always works
  inventory: ['KeyE', 'KeyI'],
  // drop the held item (inventory.js)
  drop: ['KeyQ'],

  // turns dev mode on and off (debug.js). ` is the key under Esc, and Ctrl + D is for keyboards that
  // don't have one. everything below this only works in dev mode
  devMode:   ['Backquote', 'Control+KeyD'],
  // opens and closes the dev menu
  devMenu:   ['KeyH'],
  zoomIn:    ['Equal', 'NumpadAdd'],
  zoomOut:   ['Minus', 'NumpadSubtract'],
  zoomReset: ['Digit0', 'Numpad0'],
  // shows or hides the tile grid and the (0, 0) lines
  grid:      ['KeyG'],
  // shows or hides the enemy routes (pathfinding.js)
  enemyPaths: ['KeyP'],
  teleport:  ['KeyT'],
  nextMap:   ['KeyM'],
  // B for build (E is already used for talking)
  editor:    ['KeyB'],
};

// browser mouse button numbers to names. I left middle click out because on windows it starts auto
// scroll, which fights with the game
const MOUSE_BUTTONS = {
  0: 'left',
  2: 'right',
};
