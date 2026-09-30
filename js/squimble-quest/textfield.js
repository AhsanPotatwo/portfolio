// boxes you can type into, e.g. a map's name or width in the map editor's form box (editor.js).
// both build on UIElement (ui.js), so they have x, y, w, h, visible and group too.
//   TextField    a box for words, like a map's name
//   NumberField  a box for a whole number, like a map's width. a TextField that only takes digits
//
//   const name = UI.add(new TextField({ x: 20, y: 20, w: 180, h: 32, value: 'forest' }));
//   const width = UI.add(new NumberField({ x: 20, y: 60, w: 80, h: 32, value: 40, min: 1, max: 500 }));
//   name.focus();         // typing goes into it now
//   name.value            // the words in it
//   width.value           // the number in it, kept between min and max
//
// whatever has it decides when it's focused (clicking it doesn't do that by itself) and hands it
// each key from Input.typed with type(key), in order. it should also turn Input.typing on while
// it's being typed into, so keys type instead of controlling the game.
// focusing it selects everything in it, so typing replaces it, like most text boxes
class TextField extends UIElement {
  constructor(options = {}) {
    super(options);
    // what's typed so far
    this.text = String(options.value ?? '');
    // the most characters it takes
    this.maxLength = options.maxLength ?? 20;
    // which characters can be typed, as a test for one character. anything else is ignored
    this.allowed = options.allowed ?? /^[a-zA-Z0-9 _-]$/;
    // whether typing goes into it
    this.focused = false;
    // true straight after focusing, when everything's selected and typing replaces it
    this.selected = false;
  }

  get value() {
    return this.text;
  }

  set value(text) {
    this.text = String(text);
  }

  focus() {
    this.focused = true;
    this.selected = true;
  }

  blur() {
    this.focused = false;
    this.selected = false;
  }

  // one key typed into it (an e.key name from Input.typed). allowed characters go on the end,
  // Backspace and Delete take them away, anything else is ignored
  type(key) {
    if (key.length === 1 && this.allowed.test(key)) {
      if (this.selected) this.text = '';
      if (this.text.length < this.maxLength) this.text += key;
      this.selected = false;
    } else if (key === 'Backspace' || key === 'Delete') {
      this.text = this.selected ? '' : this.text.slice(0, -1);
      this.selected = false;
    }
  }

  draw() {
    const s = BUTTON_STYLES.default;
    // a dark box, with a blue edge while it's being typed into
    fill(20, 22, 28);
    stroke(this.focused ? BUTTON_STYLES.primary.fill : this.hovered ? 140 : 80);
    strokeWeight(this.focused ? 2 : 1.5);
    rect(this.x, this.y, this.w, this.h, 5);

    const middleX = this.x + this.w / 2;
    const middleY = this.y + this.h / 2;
    setText(16, BOLD, CENTER, CENTER, s.font);
    noStroke();

    // selected: a blue highlight behind the text, like a text box with everything selected
    const width = textWidth(this.text);
    if (this.selected && this.text) {
      fill(BUTTON_STYLES.primary.fill);
      rect(middleX - width / 2 - 2, middleY - 10, width + 4, 20, 2);
    }
    fill(s.textColour);
    text(this.text, middleX, middleY);

    // the blinking line where typing goes, half a second on, half off
    if (this.focused && !this.selected && millis() % 1000 < 500) {
      rect(middleX + width / 2 + 2, middleY - 9, 1.5, 18);
    }
  }
}

class NumberField extends TextField {
  constructor(options = {}) {
    const min = options.min ?? 0;
    const max = options.max ?? Infinity;
    // only digits, and only enough of them for max (no max allows up to 9)
    super({ ...options, value: options.value ?? min, allowed: /^[0-9]$/, maxLength: String(max === Infinity ? 1e9 : max).length });
    this.min = min;
    this.max = max;
  }

  // the number in it, kept between min and max. an empty box counts as min
  get value() {
    const number = parseInt(this.text, 10);
    return constrain(Number.isNaN(number) ? this.min : number, this.min, this.max);
  }

  set value(number) {
    this.text = String(number);
  }

  // stops typing into it, and tidies what's in it into the number it counts as (e.g. empty → min)
  blur() {
    super.blur();
    this.text = String(this.value);
  }
}
