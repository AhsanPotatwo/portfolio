// keyboard and mouse: what's held and where the mouse is, in a simple form.
// only listens while the canvas is focused, so arrow keys scroll the page otherwise.
// _ properties are private to this file

// longer key names that count as typing while Input.typing (single characters always do)
const TYPING_KEYS = ['Backspace', 'Delete', 'Enter', 'Escape', 'Tab'];

const Input = {
  // canvas has focus. "click to play" shows when not (hud.js)
  focused: false,

  // ---------- keyboard ----------
  // e.code of every held key, e.g. 'KeyW'
  held: new Set(),
  // keys that went down since last frame (one frame only, see update())
  keysPressed: new Set(),
  // something's being typed into (textfield.js): keys go to typed, none count for the game
  typing: false,
  // typed since last frame while typing, as e.key names ('7', 'Backspace', 'Enter', 'Escape',
  // 'Tab'...) and { paste: 'text' } for Ctrl + V. one frame only
  typed: [],

  // ---------- mouse ----------
  // screen position in game pixels (0-960, 0-540) whatever the canvas's page size; the camera makes
  // it a world position. x/y null until the mouse moves over the page. inside: over the game
  mouse: { x: null, y: null, inside: false },
  // held buttons by name, 'left'/'right' (MOUSE_BUTTONS in config.js)
  buttonsHeld: new Set(),
  // clicked since last frame (one frame only)
  buttonsPressed: new Set(),
  // released since last frame (one frame only)
  buttonsReleased: new Set(),
  // wheel turn since last frame. positive is scrolling down
  wheel: 0,
  // true stops the wheel scrolling the page. the hotbar turns it on (inventory.js)
  captureWheel: false,

  _el: null,
  // browser mouse position in page pixels, converted in update()
  _clientX: null,
  _clientY: null,
  // input the game hasn't seen yet
  _pendingKeys: new Set(),
  _pendingTyped: [],
  _pendingClicks: new Set(),
  _pendingReleases: new Set(),
  _pendingWheel: 0,
  // buttons whose current click belongs to the ui, ignored by the game (claimMouse())
  _claimed: new Set(),

  // once from setup() with the canvas element
  attach(el) {
    this._el = el;

    // focusable by click or tab
    el.setAttribute('tabindex', '0');

    // every game key, whose browser default gets stopped
    const gameKeys = new Set(Object.values(KEYS).flat());

    el.addEventListener('keydown', (e) => {
      // while typing, characters and TYPING_KEYS are typed instead of used; others (F5, F12...) work
      if (this.typing && !e.ctrlKey && (e.key.length === 1 || TYPING_KEYS.includes(e.key))) {
        // e.g. stops Tab moving focus
        e.preventDefault();
        this._pendingTyped.push(e.key);
        return;
      }

      // with Ctrl held, a used combo (e.g. 'Control+KeyD') counts instead of the plain key, so
      // Ctrl + D doesn't also walk right. only KEYS (config.js) count
      const combo = `Control+${e.code}`;
      const name = e.ctrlKey && gameKeys.has(combo) ? combo : e.code;
      if (!gameKeys.has(name)) return;

      // no page scrolling or browser Ctrl shortcuts for game keys
      e.preventDefault();
      this.held.add(name);
      // ignore key repeat
      if (!e.repeat) this._pendingKeys.add(name);
    });

    // Ctrl + V isn't typed above, so the browser pastes and this catches it. on document, where it
    // lands whatever has focus
    document.addEventListener('paste', (e) => {
      if (!this.typing) return;
      e.preventDefault();
      this._pendingTyped.push({ paste: e.clipboardData.getData('text') });
    });

    el.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      this.held.delete(`Control+${e.code}`);
    });

    // on window, so aiming works when the mouse slips off the canvas
    window.addEventListener('pointermove', (e) => {
      this._clientX = e.clientX;
      this._clientY = e.clientY;
    });

    el.addEventListener('pointerdown', (e) => {
      // focus arrives after this, so the "click to play" click isn't an attack
      if (!this.focused) return;
      const button = MOUSE_BUTTONS[e.button];
      if (!button) return;
      this.buttonsHeld.add(button);
      this._pendingClicks.add(button);
    });

    // on window, in case it's released off the canvas
    window.addEventListener('pointerup', (e) => {
      const button = MOUSE_BUTTONS[e.button];
      // only if it went down in the game
      if (!this.buttonsHeld.has(button)) return;
      this.buttonsHeld.delete(button);
      this._pendingReleases.add(button);
    });

    // right click is a game button: no browser menu
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // passive: false allows preventDefault
    el.addEventListener('wheel', (e) => {
      if (!this.focused || !this.captureWheel) return;
      e.preventDefault();
      // pixels, or lines in some browsers (firefox), ~16px a line
      this._pendingWheel += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    }, { passive: false });

    el.addEventListener('focus', () => {
      this.focused = true;
    });

    // we won't see keys released after blur, so forget everything or the player keeps walking
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

  // once at the start of every frame, before anything reads input
  update() {
    // a claim ends after its release frame (it has to cover that frame, or the game sees the release)
    for (const button of this.buttonsReleased) this._claimed.delete(button);

    // pending input becomes this frame's, gone next frame: one frame per press
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

    // page → game pixels via the canvas's css size. every frame, since page scrolling moves the canvas
    const rect = this._el.getBoundingClientRect();
    this.mouse.x = (this._clientX - rect.left) * (GAME_W / rect.width);
    this.mouse.y = (this._clientY - rect.top) * (GAME_H / rect.height);
    this.mouse.inside = this.mouse.x >= 0 && this.mouse.x < GAME_W &&
                        this.mouse.y >= 0 && this.mouse.y < GAME_H;
  },

  // ---------- keyboard ----------

  // any key for the action held, e.g. Input.isDown('up'). for ongoing things like walking
  isDown(action) {
    return KEYS[action].some((code) => this.held.has(code));
  },

  // action pressed this frame (one frame per press). for one-off things like toggles
  wasPressed(action) {
    return KEYS[action].some((code) => this.keysPressed.has(code));
  },

  // { x, y } each -1/0/1 (y down). opposite keys cancel
  direction() {
    return {
      x: (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0),
      y: (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0),
    };
  },

  // ---------- mouse ----------

  // these three are for gameplay and ignore clicks claimed by the ui

  // held now. for ongoing things (charging a bow)
  mouseHeld(button) {
    return this.buttonsHeld.has(button) && !this._claimed.has(button);
  },

  // clicked this frame (one frame per click). for one-offs (a sword swing)
  mousePressed(button) {
    return this.buttonsPressed.has(button) && !this._claimed.has(button);
  },

  // released this frame. for release actions (firing a charged bow)
  mouseReleased(button) {
    return this.buttonsReleased.has(button) && !this._claimed.has(button);
  },

  // the ui calls this when a click starts on it; the game ignores that click until release. the ui
  // reads buttonsPressed etc. directly
  claimMouse() {
    for (const button of this.buttonsPressed) this._claimed.add(button);
  },

  // mouse screen position (camera.screenToWorld() for world), or null if unfocused or unseen
  aimPoint() {
    if (!this.focused || this.mouse.x === null) return null;
    return { x: this.mouse.x, y: this.mouse.y };
  },
};
