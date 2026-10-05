// keyboard and mouse: keeps track of what's held and where the mouse is, in a simple form.
// it only listens while the canvas has focus, otherwise the arrow keys couldn't scroll the page.
// properties starting with _ are only meant to be used inside this file

// longer key names that count as typing while Input.typing is on (single characters always do)
const TYPING_KEYS = ['Backspace', 'Delete', 'Enter', 'Escape', 'Tab'];

const Input = {
  // the canvas has focus. "click to play" shows when it doesn't (hud.js)
  focused: false,

  // ---------- keyboard ----------
  // e.code of every key being held, like 'KeyW'
  held: new Set(),
  // keys that went down since last frame (only lasts one frame, see update())
  keysPressed: new Set(),
  // something's being typed into (textfield.js). keys go into typed instead and none of them count
  // for the game
  typing: false,
  // what was typed since last frame while typing, as e.key names ('7', 'Backspace', 'Enter',
  // 'Escape', 'Tab'...) plus { paste: 'text' } for Ctrl + V. only lasts one frame
  typed: [],

  // ---------- mouse ----------
  // screen position in game pixels (0-960, 0-540), whatever size the canvas is on the page. the camera
  // turns it into a world position. x/y are null until the mouse moves over the page. inside means
  // it's over the game
  mouse: { x: null, y: null, inside: false },
  // held buttons by name, 'left'/'right' (MOUSE_BUTTONS in config.js)
  buttonsHeld: new Set(),
  // clicked since last frame (only lasts one frame)
  buttonsPressed: new Set(),
  // let go since last frame (only lasts one frame)
  buttonsReleased: new Set(),
  // how far the wheel turned since last frame. positive is scrolling down
  wheel: 0,
  // true stops the wheel scrolling the page. the hotbar turns it on (inventory.js)
  captureWheel: false,

  _el: null,
  // the browser's mouse position in page pixels, turned into game pixels in update()
  _clientX: null,
  _clientY: null,
  // input that's happened but the game hasn't seen yet
  _pendingKeys: new Set(),
  _pendingTyped: [],
  _pendingClicks: new Set(),
  _pendingReleases: new Set(),
  _pendingWheel: 0,
  // buttons whose current click belongs to the ui, so the game ignores them (claimMouse())
  _claimed: new Set(),

  // called once from setup() with the canvas element
  attach(el) {
    this._el = el;

    // so it can get focus by clicking or tabbing to it
    el.setAttribute('tabindex', '0');

    // every key the game uses. their normal browser behaviour gets blocked
    const gameKeys = new Set(Object.values(KEYS).flat());

    el.addEventListener('keydown', (e) => {
      // while typing, characters and TYPING_KEYS get typed instead of used. other keys (F5, F12...)
      // still work like normal
      if (this.typing && !e.ctrlKey && (e.key.length === 1 || TYPING_KEYS.includes(e.key))) {
        // stops things like Tab moving focus off the canvas
        e.preventDefault();
        this._pendingTyped.push(e.key);
        return;
      }

      // with Ctrl held, a combo the game uses (like 'Control+KeyD') counts instead of the plain key,
      // so Ctrl + D doesn't also walk right. only combos in KEYS (config.js) count
      const combo = `Control+${e.code}`;
      const name = e.ctrlKey && gameKeys.has(combo) ? combo : e.code;
      if (!gameKeys.has(name)) return;

      // game keys don't scroll the page or trigger browser Ctrl shortcuts
      e.preventDefault();
      this.held.add(name);
      // ignore the repeats you get from holding a key down
      if (!e.repeat) this._pendingKeys.add(name);
    });

    // Ctrl + V isn't caught as typing above, so the browser does its paste and this picks it up. it's
    // on document because that's where it lands whatever has focus
    document.addEventListener('paste', (e) => {
      if (!this.typing) return;
      e.preventDefault();
      this._pendingTyped.push({ paste: e.clipboardData.getData('text') });
    });

    el.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      this.held.delete(`Control+${e.code}`);
    });

    // on window, so aiming still works if the mouse slips off the canvas
    window.addEventListener('pointermove', (e) => {
      this._clientX = e.clientX;
      this._clientY = e.clientY;
    });

    el.addEventListener('pointerdown', (e) => {
      // focus arrives after this event, so the click that starts the game isn't also an attack
      if (!this.focused) return;
      const button = MOUSE_BUTTONS[e.button];
      if (!button) return;
      this.buttonsHeld.add(button);
      this._pendingClicks.add(button);
    });

    // on window in case it's let go off the canvas
    window.addEventListener('pointerup', (e) => {
      const button = MOUSE_BUTTONS[e.button];
      // only counts if it went down in the game
      if (!this.buttonsHeld.has(button)) return;
      this.buttonsHeld.delete(button);
      this._pendingReleases.add(button);
    });

    // right click is a game button, so no browser menu
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // passive: false is needed for preventDefault to work here
    el.addEventListener('wheel', (e) => {
      if (!this.focused || !this.captureWheel) return;
      e.preventDefault();
      // usually pixels, but some browsers (firefox) give lines, which are about 16px each
      this._pendingWheel += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    }, { passive: false });

    el.addEventListener('focus', () => {
      this.focused = true;
    });

    // after losing focus we won't hear about keys being let go, so forget everything or the player
    // would keep walking forever
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

  // once at the start of every frame, before anything reads the input
  update() {
    // a claim ends after the frame its button is let go. it has to last through that frame, or the
    // game would see the release
    for (const button of this.buttonsReleased) this._claimed.delete(button);

    // the pending input becomes this frame's and is gone next frame, so each press only counts once
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

    // page pixels to game pixels, using the canvas's size on the page. done every frame because
    // scrolling the page moves the canvas
    const rect = this._el.getBoundingClientRect();
    this.mouse.x = (this._clientX - rect.left) * (GAME_W / rect.width);
    this.mouse.y = (this._clientY - rect.top) * (GAME_H / rect.height);
    this.mouse.inside = this.mouse.x >= 0 && this.mouse.x < GAME_W &&
                        this.mouse.y >= 0 && this.mouse.y < GAME_H;
  },

  // ---------- keyboard ----------

  // is any key for this action held, like Input.isDown('up'). for things that keep going, like walking
  isDown(action) {
    return KEYS[action].some((code) => this.held.has(code));
  },

  // was the action pressed this frame (once per press). for one-off things like toggles
  wasPressed(action) {
    return KEYS[action].some((code) => this.keysPressed.has(code));
  },

  // { x, y } each -1, 0 or 1 (y goes down). opposite keys cancel out
  direction() {
    return {
      x: (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0),
      y: (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0),
    };
  },

  // ---------- mouse ----------

  // these three are for gameplay, and ignore any click the ui has claimed

  // held right now. for things that keep going (charging a bow)
  mouseHeld(button) {
    return this.buttonsHeld.has(button) && !this._claimed.has(button);
  },

  // clicked this frame (once per click). for one-off things (a sword swing)
  mousePressed(button) {
    return this.buttonsPressed.has(button) && !this._claimed.has(button);
  },

  // let go this frame. for things that happen on release (firing a charged bow)
  mouseReleased(button) {
    return this.buttonsReleased.has(button) && !this._claimed.has(button);
  },

  // the ui calls this when a click starts on it, and the game then ignores that click until it's let
  // go. the ui itself reads buttonsPressed etc. directly
  claimMouse() {
    for (const button of this.buttonsPressed) this._claimed.add(button);
  },

  // the mouse's screen position (camera.screenToWorld() turns it into a world one), or null if the
  // game isn't focused or the mouse hasn't been seen yet
  aimPoint() {
    if (!this.focused || this.mouse.x === null) return null;
    return { x: this.mouse.x, y: this.mouse.y };
  },
};
