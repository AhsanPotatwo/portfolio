// boxes you can type into, e.g. a map's name or width in the map editor's form box (editor.js).
// both build on UIElement (ui.js), so they have x, y, w, h, visible and group too.
//   TextField    a box for words, like a map's name
//   NumberField  a box for a whole number, like a map's width. a TextField that only takes digits
//   ColourField  a box for a colour like #6fae4f, with a square showing it that opens the
//                browser's colour picker
//
// Ctrl + V pastes into all of them (paste()).
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

  // pasted text (Ctrl + V, { paste } in Input.typed), typed in one character at a time, so only
  // what's allowed gets in
  paste(text) {
    for (const character of text.trim()) this.type(character);
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

// what a whole colour looks like: # then 6 hex digits, e.g. #6fae4f
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

// the browser's own colour picker, made the first time it's needed and kept (hidden) after that
let colourPickerInput = null;

class ColourField extends TextField {
  constructor(options = {}) {
    // only # and the hex digits can be typed
    super({ ...options, maxLength: 7, allowed: /^[#0-9a-fA-F]$/ });
  }

  // the square showing the colour, at the right end of the box
  swatch() {
    const size = this.h - 10;
    return { x: this.x + this.w - size - 5, y: this.y + 5, size };
  }

  // clicking the square opens the browser's colour picker (which does RGB, HSL and hex). the box
  // changes as the colour's dragged about, so anything showing it changes too
  update(hovered) {
    this.hovered = hovered;
    if (!hovered || !Input.buttonsPressed.has('left') || Input.mouse.x < this.swatch().x) return;
    if (!colourPickerInput) {
      colourPickerInput = document.createElement('input');
      colourPickerInput.type = 'color';
      // it has to be on the page for some browsers to open it. the picker pops up next to it,
      // so it sits in the middle, where the form box is
      colourPickerInput.style.cssText = 'position: fixed; left: 50%; top: 40%; width: 0; height: 0; opacity: 0; border: 0; padding: 0;';
      document.body.appendChild(colourPickerInput);
    }
    colourPickerInput.value = HEX_COLOUR.test(this.text) ? this.text.toLowerCase() : '#000000';
    colourPickerInput.oninput = () => {
      this.text = colourPickerInput.value;
      this.selected = false;
    };
    colourPickerInput.click();
  }

  // a pasted colour can be hex with or without the # (#6fae4f, 6FAE4F, #abc) or red, green and blue
  // numbers (rgb(111, 174, 79), 111 174 79). anything else is pasted like normal
  paste(text) {
    const hex = pastedColour(text);
    if (!hex) return super.paste(text);
    this.text = hex;
    this.selected = false;
  }

  draw() {
    super.draw();
    const { x, y, size } = this.swatch();
    // the colour, or a dark square with a line through it until it's a whole colour
    stroke(140);
    strokeWeight(1);
    fill(HEX_COLOUR.test(this.text) ? this.text : color(20, 22, 28));
    rect(x, y, size, size, 3);
    if (!HEX_COLOUR.test(this.text)) line(x + 3, y + size - 3, x + size - 3, y + 3);
  }
}

// a colour pasted as hex or rgb as #rrggbb (see ColourField.paste()), or null if it isn't one
function pastedColour(text) {
  text = text.trim();
  const hex = text.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    // #abc is short for #aabbcc
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join('') : hex[1];
    return `#${digits.toLowerCase()}`;
  }
  // numbers, with nothing but "rgb" or "rgba" as words. a 4th number (see-through-ness) is ignored
  const numbers = text.match(/\d*\.?\d+/g);
  if (/[a-z]/i.test(text.replace(/^rgba?/i, '')) || !numbers || numbers.length < 3 || numbers.length > 4) return null;
  return `#${numbers.slice(0, 3).map((n) => Math.round(Math.min(255, Number(n))).toString(16).padStart(2, '0')).join('')}`;
}
