// keyboard input. keeps a list of the keys being held down right now,
// and turns them into a direction for the player.
//
// it only listens while the game is focused (clicked on). that way the arrow keys only move the
// player while you're playing, and still scroll the page normally the rest of the time
const Input = {
  // e.code of every key currently held down, e.g. 'KeyW'
  held: new Set(),
  // true while the game canvas has focus, ui.js shows "click to play" when it doesn't
  focused: false,

  // call once from setup() with the canvas element
  attach(el) {
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

    el.addEventListener('focus', () => {
      this.focused = true;
    });

    // clicking away while a key is held means we'd never see it let go,
    // so forget everything, otherwise the player would keep walking on their own
    el.addEventListener('blur', () => {
      this.focused = false;
      this.held.clear();
    });
  },

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
};
