// keyboard and mouse input. keeps track of what's held down and where the mouse is,
// and hands it to the rest of the game in a simple form.
//
// it only listens while the game is focused (clicked on). that way the arrow keys only move the
// player while you're playing, and still scroll the page normally the rest of the time.
//
// properties starting with _ are only meant to be used inside this file

// keys with longer names that count as typing while Input.typing is on (single characters always do)
const TYPING_KEYS = ['Backspace', 'Delete', 'Enter', 'Escape', 'Tab'];

const Input = {
  // true while the game canvas has focus. "click to play" shows when it doesn't (hud.js)
  focused: false,

  // ---------- keyboard ----------
  // e.code of every key currently held down, e.g. 'KeyW'
  held: new Set(),
  // keys that went down since the last frame. only lasts one frame, see update()
  keysPressed: new Set(),
  // true while something is being typed into, like a number box (textfield.js). the keyboard
  // then only types: no key counts for the game (so W doesn't walk), they go in typed instead
  typing: false,
  // what was typed since the last frame while typing is on, as e.key names: '7', 'Backspace',
  // 'Enter', 'Escape', 'Tab'... and { paste: 'the text' } for Ctrl + V. only lasts one frame,
  // like keysPressed
  typed: [],

  // ---------- mouse ----------
  // where the mouse is on screen, in game pixels (0-960 across, 0-540 down) no matter how big the canvas
  // looks on the page. this is a screen position, the camera turns it into a world position.
  // x and y are null until the mouse has moved over the page. inside is true when it's over the game
  mouse: { x: null, y: null, inside: false },
  // mouse buttons held down right now, by name: 'left' or 'right' (see MOUSE_BUTTONS in config.js)
  buttonsHeld: new Set(),
  // buttons that were clicked since the last frame. only lasts one frame, see update()
  buttonsPressed: new Set(),
  // buttons that were let go since the last frame. only lasts one frame
  buttonsReleased: new Set(),
  // how far the mouse wheel turned since the last frame. positive is scrolling down (towards you)
  wheel: 0,
  // while false the wheel scrolls the page like normal. true when something in the game uses the
  // wheel, which stops it scrolling the page while you play. the hotbar turns it on (inventory.js)
  captureWheel: false,

  _el: null,
  // the mouse position the browser gave us, in page pixels. turned into game pixels in update()
  _clientX: null,
  _clientY: null,
  // keys, clicks and wheel turns that have happened but the game hasn't seen yet
  _pendingKeys: new Set(),
  _pendingTyped: [],
  _pendingClicks: new Set(),
  _pendingReleases: new Set(),
  _pendingWheel: 0,
  // mouse buttons whose current click belongs to the ui, so the game ignores them (see claimMouse())
  _claimed: new Set(),

  // call once from setup() with the canvas element
  attach(el) {
    this._el = el;

    // lets the canvas take focus when it's clicked, or tabbed to with the keyboard
    el.setAttribute('tabindex', '0');

    // every key the game uses, so we know which ones to stop the browser handling
    const gameKeys = new Set(Object.values(KEYS).flat());

    el.addEventListener('keydown', (e) => {
      // while typing, a letter, number or symbol (e.key is one character), or one of these keys,
      // is typed rather than used by the game. anything else (F5, F12...) still works like normal
      if (this.typing && !e.ctrlKey && (e.key.length === 1 || TYPING_KEYS.includes(e.key))) {
        // e.g. stops Tab moving focus off the game
        e.preventDefault();
        this._pendingTyped.push(e.key);
        return;
      }

      // with Ctrl held, a Ctrl combination the game uses (e.g. 'Control+KeyD') counts on its own,
      // not as the plain key too, so Ctrl + D doesn't also walk right. otherwise it's just the key
      // (e.g. 'KeyD'). only keys the game uses count (see KEYS in config.js)
      const combo = `Control+${e.code}`;
      const name = e.ctrlKey && gameKeys.has(combo) ? combo : e.code;
      if (!gameKeys.has(name)) return;

      // stops the arrow keys scrolling the page while you play, and the browser doing
      // whatever it normally does with a Ctrl shortcut the game uses
      e.preventDefault();
      this.held.add(name);
      // holding a key down makes the browser repeat keydown over and over.
      // those repeats aren't new presses, so only the first one counts
      if (!e.repeat) this._pendingKeys.add(name);
    });

    // Ctrl + V isn't typed above (Ctrl is held), so the browser pastes, and this catches it.
    // on the document, because that's where it ends up whatever has focus
    document.addEventListener('paste', (e) => {
      if (!this.typing) return;
      e.preventDefault();
      this._pendingTyped.push({ paste: e.clipboardData.getData('text') });
    });

    el.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      this.held.delete(`Control+${e.code}`);
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
      this._pendingClicks.add(button);
    });

    // on the window, because you might let go after dragging the mouse off the game
    window.addEventListener('pointerup', (e) => {
      const button = MOUSE_BUTTONS[e.button];
      // only counts as a release if we saw it go down in the game
      if (!this.buttonsHeld.has(button)) return;
      this.buttonsHeld.delete(button);
      this._pendingReleases.add(button);
    });

    // right click is a game button, so don't open the browser's right click menu
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // passive: false is needed to be allowed to stop the page scrolling
    el.addEventListener('wheel', (e) => {
      if (!this.focused || !this.captureWheel) return;
      e.preventDefault();
      // most browsers measure the wheel in pixels, but some (firefox) in lines. ~16px a line
      this._pendingWheel += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    }, { passive: false });

    el.addEventListener('focus', () => {
      this.focused = true;
    });

    // clicking away while a key is held means we'd never see it let go,
    // so forget everything, otherwise the player would keep walking on their own
    el.addEventListener('blur', () => {
      this.focused = false;
      this.held.clear();
      this.buttonsHeld.clear();
      this._pendingKeys.clear();
      this._pendingTyped = [];
      this._pendingClicks.clear();
      this._pendingReleases.clear();
      this._pendingWheel = 0;
      this._claimed.clear();
    });
  },

  // call once at the very start of every frame, before anything reads the input
  update() {
    // a claimed click is over once its release has been and gone (released last frame).
    // it has to last through the release frame too, or the game would see the release
    for (const button of this.buttonsReleased) this._claimed.delete(button);

    // presses from since the last frame become this frame's presses, and are gone next frame.
    // that's what lets wasPressed() and mousePressed() be true for exactly one frame per press
    this.keysPressed = this._pendingKeys;
    this._pendingKeys = new Set();
    this.typed = this._pendingTyped;
    this._pendingTyped = [];
    this.buttonsPressed = this._pendingClicks;
    this._pendingClicks = new Set();
    this.buttonsReleased = this._pendingReleases;
    this._pendingReleases = new Set();
    this.wheel = this._pendingWheel;
    this._pendingWheel = 0;

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

  // is any key for this action held? true every frame while held, e.g. Input.isDown('up').
  // for things that keep going, like walking
  isDown(action) {
    return KEYS[action].some((code) => this.held.has(code));
  },

  // was a key for this action pressed this frame? true for one frame only per press.
  // for one-off things, like opening a menu or switching something on and off
  wasPressed(action) {
    return KEYS[action].some((code) => this.keysPressed.has(code));
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

  // these three are for gameplay. they ignore clicks that were meant for ui buttons,
  // so the game never has to check whether the mouse was over a button

  // is this button held down right now? true every frame while held.
  // for things that keep going, like a charging bow or a flamethrower
  mouseHeld(button) {
    return this.buttonsHeld.has(button) && !this._claimed.has(button);
  },

  // was this button clicked this frame? true for one frame only per click.
  // for one-off actions, like a single sword swing
  mousePressed(button) {
    return this.buttonsPressed.has(button) && !this._claimed.has(button);
  },

  // was this button let go this frame? true for one frame only.
  // for things that happen on release, like firing a charged bow
  mouseReleased(button) {
    return this.buttonsReleased.has(button) && !this._claimed.has(button);
  },

  // the ui calls this when a click starts on one of its buttons. the game then ignores that click,
  // from press to release. the ui itself reads buttonsPressed etc. directly, so it still sees it
  claimMouse() {
    for (const button of this.buttonsPressed) this._claimed.add(button);
  },

  // the point the player is aiming at: the mouse's screen position (use camera.screenToWorld() to
  // find it in the world), or null if the game isn't being played or the mouse hasn't been seen yet
  aimPoint() {
    if (!this.focused || this.mouse.x === null) return null;
    return { x: this.mouse.x, y: this.mouse.y };
  },
};
