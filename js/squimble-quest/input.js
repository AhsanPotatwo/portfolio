// keyboard and mouse input. keeps track of what's held down and where the mouse is,
// and hands it to the rest of the game in a simple form.
//
// it only listens while the game is focused (clicked on). that way the arrow keys only move the
// player while you're playing, and still scroll the page normally the rest of the time.
//
// properties starting with _ are only meant to be used inside this file
const Input = {
  // true while the game canvas has focus, ui.js shows "click to play" when it doesn't
  focused: false,

  // ---------- keyboard ----------
  // e.code of every key currently held down, e.g. 'KeyW'
  held: new Set(),

  // ---------- mouse ----------
  // where the mouse is, in game pixels (0-960 across, 0-540 down) no matter how big the canvas
  // looks on screen. x and y are null until the mouse has moved over the page.
  // inside is true when the mouse is over the game
  mouse: { x: null, y: null, inside: false },
  // mouse buttons held down right now, by name: 'left' or 'right' (see MOUSE_BUTTONS in config.js)
  buttonsHeld: new Set(),
  // buttons that were clicked since the last frame. only lasts one frame, see update()
  buttonsPressed: new Set(),

  _el: null,
  // the mouse position the browser gave us, in page pixels. turned into game pixels in update()
  _clientX: null,
  _clientY: null,
  // clicks that have happened but that the game hasn't seen yet
  _pendingPresses: new Set(),

  // call once from setup() with the canvas element
  attach(el) {
    this._el = el;

    // lets the canvas take focus when it's clicked, or tabbed to with the keyboard
    el.setAttribute('tabindex', '0');

    // every key the game uses, so we know which ones to stop the browser handling
    const gameKeys = Object.values(KEYS).flat();

    el.addEventListener('keydown', (e) => {
      if (!gameKeys.includes(e.code)) return;
      // stops the arrow keys scrolling the page while you play
      e.preventDefault();
      this.held.add(e.code);
    });

    el.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
    });

    // tracked on the whole window rather than just the canvas, so aiming keeps working
    // if the mouse slips off the edge of the game while you're playing
    window.addEventListener('pointermove', (e) => {
      this._clientX = e.clientX;
      this._clientY = e.clientY;
    });

    el.addEventListener('pointerdown', (e) => {
      // the click that starts the game (gets rid of "click to play") shouldn't also count as
      // an attack. the canvas only gets focus just after this runs, so that first click is skipped
      if (!this.focused) return;
      const button = MOUSE_BUTTONS[e.button];
      if (!button) return;
      this.buttonsHeld.add(button);
      this._pendingPresses.add(button);
    });

    // on the window, because you might let go after dragging the mouse off the game
    window.addEventListener('pointerup', (e) => {
      this.buttonsHeld.delete(MOUSE_BUTTONS[e.button]);
    });

    // right click is a game button, so don't open the browser's right click menu
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    el.addEventListener('focus', () => {
      this.focused = true;
    });

    // clicking away while a key is held means we'd never see it let go,
    // so forget everything, otherwise the player would keep walking on their own
    el.addEventListener('blur', () => {
      this.focused = false;
      this.held.clear();
      this.buttonsHeld.clear();
      this._pendingPresses.clear();
    });
  },

  // call once at the very start of every frame, before anything reads the input
  update() {
    // clicks from since the last frame become this frame's clicks, and are gone next frame.
    // that's what lets mousePressed() be true for exactly one frame per click
    this.buttonsPressed = this._pendingPresses;
    this._pendingPresses = new Set();

    if (this._clientX === null) return;

    // the browser gives page pixels, but the game wants game pixels. css scales the canvas,
    // so we find where it is and how big it looks, then scale the position to match.
    // done every frame because the canvas moves when the page scrolls, even if the mouse doesn't
    const rect = this._el.getBoundingClientRect();
    this.mouse.x = (this._clientX - rect.left) * (GAME_W / rect.width);
    this.mouse.y = (this._clientY - rect.top) * (GAME_H / rect.height);
    this.mouse.inside = this.mouse.x >= 0 && this.mouse.x < GAME_W &&
                        this.mouse.y >= 0 && this.mouse.y < GAME_H;
  },

  // ---------- keyboard ----------

  // is any key for this action held? e.g. Input.isDown('up')
  isDown(action) {
    return KEYS[action].some((code) => this.held.has(code));
  },

  // which way the keys point, as x and y that are each -1, 0 or 1.
  // x: -1 left, 1 right. y: -1 up, 1 down (y goes down the screen in p5).
  // holding opposite keys (left + right) cancels out to 0
  direction() {
    return {
      x: (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0),
      y: (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0),
    };
  },

  // ---------- mouse ----------

  // is this button held down right now? true every frame while held.
  // for things that keep going, like a charging bow or a flamethrower
  mouseHeld(button) {
    return this.buttonsHeld.has(button);
  },

  // was this button clicked this frame? true for one frame only per click.
  // for one-off actions, like a single sword swing
  mousePressed(button) {
    return this.buttonsPressed.has(button);
  },

  // the point the player is aiming at: the mouse's game position,
  // or null if the game isn't being played or the mouse hasn't been seen yet
  aimPoint() {
    if (!this.focused || this.mouse.x === null) return null;
    return { x: this.mouse.x, y: this.mouse.y };
  },
};
