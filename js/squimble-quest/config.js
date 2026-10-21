// all the numbers you might want to tweak, kept in one place

// ---------- screen ----------
// the game is laid out and played at 960 x 540 game px (16:9). that's separate from how sharp it's
// drawn: the canvas draws at the resolution it's shown at (fitResolution() in sketch.js), so it's the
// same game in the page and full screen at 1920 x 1080, just sharper. the game maths never cares about
// the real screen size
const GAME_W = 960;
const GAME_H = 540;

// tile size in px. 960 x 540 fits 30 x about 17 tiles. the camera scrolls, so the half row doesn't
// matter
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

// ---------- combat ----------
// how hits feel, for everyone. each weapon's own numbers (knockback, shake, hit stop...) are its
// settings (weapons.js), changed in the editor's Weapons tab
const COMBAT = {
  // how fast knockback, lunges and recoil slow down, higher stops sooner. something pushed at speed v
  // slides about v / pushFade px
  pushFade: 8,
  // knockback and recoil take over walking until they've slowed to this many px/s
  // (Character.pushedHard())
  pushLockEnd: 40,
  // seconds an attack click is remembered, so clicking just before the weapon's ready (or during a
  // hit stop) still attacks as soon as it can. makes combos easy to keep going
  attackBuffer: 0.2,
  // a killing blow: the swinger's hit stop is at least this many seconds, and the screen shakes this
  // many px more, so finishing something off feels like it (hitWith(), MeleeSwing.strike())
  killHitStop: 0.09,
  killShake: 2,
  // seconds something that's hit gets squashed wide and short for, and how much (0.25 is 25% wider).
  // only how it's drawn, the hitbox stays the same (Character.drawBody())
  squashTime: 0.14,
  squash: 0.25,
  // how much of a health bar the light trail of lost health drains a second, once the hurt flash is
  // over (Character.drawHealthBar())
  healthDrain: 0.6,
};

// the dodge roll (Character.startRoll()), only while wearing an item with roll (the quick charm,
// items.js), whatever's in your hand. it goes where you're walking, or the way you're facing if you're
// standing still. a press during a swing is remembered for COMBAT.attackBuffer and rolls once the
// swing's over
const ROLL = {
  // px/s and seconds, so it goes speed * time px (about 3 tiles). sand and heavy weapons (carrySpeed)
  // make it shorter, like walking
  speed: 380,
  time: 0.28,
  // seconds from the start where nothing can hit it at all, the dodge itself. after that it can be
  // hit, but its hitbox is still small
  invincible: 0.2,
  // how tall its hitbox (bodyBox()) is while rolling, in parts of its standing height. it stays on its
  // feet, so it ducks under things aimed high
  height: 0.5,
  // seconds from the start of one roll to the next
  cooldown: 0.6,
};

// ---------- player ----------
// footsteps (Character.footstep()), for everyone. which sound each step makes is up to the tile it
// lands on (its stepSounds, tiles.js, or the tile editor's Footsteps tab)
const FOOTSTEPS = {
  // px walked between steps. the player walks 170 px/s, so 44 is about 4 steps a second, and slow
  // tiles (sand, dirt) give slower steps by themselves
  stride: 44,
  // how far into a stride you are when you start walking (0 to 1), so the first step comes quickly
  firstStep: 0.6,
  // enemies' and npcs' steps, times as loud as yours. 0 turns them off
  othersVolume: 0.6,
};

const PLAYER = {
  // its hitbox, what attacks hit (bodyBox() in character.js). the rectangle you see is drawn this
  // size, but a sprite can be any size. a bit under 32x64 (1 x 2 tiles)
  width: 28,
  height: 56,
  // px/s. 170 is about 5 tiles a second
  speed: 170,
  // only the feet bump into walls (feetBox() in character.js). smaller than a tile both ways so the
  // player fits through 1 tile gaps
  feetWidth: 24,
  feetHeight: 14,
  maxHealth: 100,
  // what's in the inventory at the start, filling from hotbar slot 1 (names are item files, items/). you
  // attack with the item in the picked slot, and empty hands can't attack
  startingItems: ['sword', 'axe', 'bow', 'spear'],
  colour: '#4a7bd8',
  outline: '#23407a',
  // quick flash when hurt
  hurtColour: '#e05050',
  hurtFlashTime: 0.15,
  // seconds after a weapon hits them that nothing else can (they blink), so a crowd can't hit them
  // over and over in one go. any character can have this, enemies don't by default (hitWith())
  hitInvincible: 0.6,
  // the sound (sounds/) when a weapon hits them, on top of the weapon's hit sound (hitWith()). only
  // this computer's player hears their own
  hurtSound: 'hurt',
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
  // dodge roll, while wearing the quick charm (ROLL)
  roll:  ['ShiftLeft', 'ShiftRight'],

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
  // full screen on and off (toggleFullscreen() in sketch.js). holding Escape leaves it too
  fullscreen: ['KeyF'],
  // opens the pause menu in the game (pausemenu.js), and in the editor drops the selection or what's
  // being pasted (edittools.js). boxes that are being typed in get it as typing instead
  escape: ['Escape'],

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
  // the shader before and after this one (shaders.js)
  shaderPrev: ['BracketLeft'],
  shaderNext: ['BracketRight'],

  // the map editor's own keys (EDITOR_COMMANDS in editormenu.js, which says what each does). they only
  // do anything while it's open. Shift with undo redoes, and Shift with save saves as
  editorUndo:      ['Control+KeyZ'],
  editorRedo:      ['Control+KeyY'],
  editorCut:       ['Control+KeyX'],
  editorCopy:      ['Control+KeyC'],
  editorPaste:     ['Control+KeyV'],
  editorSelectAll: ['Control+KeyA'],
  editorDelete:    ['Delete', 'Backspace'],
  editorSave:      ['Control+KeyS'],
  editorOpen:      ['Control+KeyO'],
  editorSearch:    ['Slash', 'Control+KeyF'],
  editorHideUI:    ['Tab'],
  editorPlayHere:  ['Space'],
  toolPaint:       ['KeyN'],
  toolErase:       ['KeyX'],
  toolFill:        ['KeyL'],
  toolRect:        ['KeyR'],
  toolSelect:      ['KeyV'],
  toolPick:        ['KeyK'],
  brushSmaller:    ['Comma'],
  brushBigger:     ['Period'],
};

// the pause menu's settings (pausemenu.js, which keeps them in localStorage). they're here so the files
// that use them (camera.js, weapons.js) work without the menu, like in the tests. sound volumes are in
// Sound.volumes (sound.js) for the same reason
// the pause menu's settings (pausemenu.js, whose SETTING_ROWS puts each on a tab), kept in the browser.
// a new one is a line here, a row there, and whatever reads it. fractions show as % on the menu
const GAME_SETTINGS = {
  // ---------- seeing ----------
  // the camera shakes on big hits (Camera.shake())
  screenShake: true,
  // numbers pop out of whatever gets hit (DamageNumbers in weapons.js)
  damageNumbers: true,
  // a COLOUR_BLIND_TYPES name and how strong, 0 to 1 (colourblind.js)
  colourBlind: 'off',
  colourBlindStrength: 1,
  // how bright lightning and the red hurt glow get, 0 to 1 (drawAtmosphereScreen() in atmosphere.js,
  // drawHurtFlash() in hud.js). 0 is none, for players that flashing light bothers
  flashes: 1,
  // how big the crosshair is, 1 to 3 (drawCrosshair() in hud.js)
  crosshairSize: 1,
  // ---------- hearing ----------
  // words in the corner for sounds, with an arrow to where they are (Captions in access.js)
  captions: false,
  // the same sound in both ears, for one sided hearing or one earphone (Sound.panAt() in sound.js)
  monoSound: false,
  // ---------- assist ----------
  // pauses when you switch window or tab, so nothing gets you while you're away (pausemenu.js)
  pauseWhenAway: true,
};

// browser mouse button numbers to names. I left middle click out because on windows it starts auto
// scroll, which fights with the game
const MOUSE_BUTTONS = {
  0: 'left',
  2: 'right',
};
