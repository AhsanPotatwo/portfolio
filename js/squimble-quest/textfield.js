// typing boxes, extending UIElement (ui.js), e.g. in the editor's form box (formbox.js):
//   TextField    words, like a map name
//   NumberField  a whole number, like a map width (digits-only TextField)
//   ColourField  a colour like #6fae4f, with a swatch that opens the browser's colour picker
// Ctrl + V pastes into all (paste()).
//
//   const name = UI.add(new TextField({ x: 20, y: 20, w: 180, h: 32, value: 'forest' }));
//   const width = UI.add(new NumberField({ x: 20, y: 60, w: 80, h: 32, value: 40, min: 1, max: 500 }));
//   name.focus();         // typing goes in
//   name.value            // its text
//   width.value           // its number, clamped to min..max
//
// the owner decides focus (clicking doesn't focus), passes each Input.typed key to type(key) in
// order, and turns Input.typing on while typing. focusing selects all, so typing replaces it
class TextField extends UIElement {
  constructor(options = {}) {
    super(options);
    this.text = String(options.value ?? '');
    this.maxLength = options.maxLength ?? 20;
    // test for one typable character; others are ignored
    this.allowed = options.allowed ?? /^[a-zA-Z0-9 _-]$/;
    // typing goes into it
    this.focused = false;
    // all selected (just focused): typing replaces it
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

  // Ctrl + V ({ paste } in Input.typed), typed a character at a time so only allowed ones get in
  paste(text) {
    for (const character of text.trim()) this.type(character);
  }

  // one Input.typed e.key: allowed characters append, Backspace/Delete remove, others ignored
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
    // dark box, blue edge while focused
    fill(EDITOR_COLOURS.well);
    stroke(this.focused ? BUTTON_STYLES.primary.fill : this.hovered ? 140 : EDITOR_COLOURS.edge);
    strokeWeight(this.focused ? 1.5 : 1);
    rect(this.x, this.y, this.w, this.h, 3);

    const middleX = this.x + this.w / 2;
    const middleY = this.y + this.h / 2;
    setText(13, BOLD, CENTER, CENTER, s.font);
    noStroke();

    // selection highlight
    const width = textWidth(this.text);
    if (this.selected && this.text) {
      fill(BUTTON_STYLES.primary.fill);
      rect(middleX - width / 2 - 2, middleY - 8, width + 4, 16, 2);
    }
    fill(s.textColour);
    text(this.text, middleX, middleY);

    // blinking caret, 0.5s on/off
    if (this.focused && !this.selected && millis() % 1000 < 500) {
      rect(middleX + width / 2 + 2, middleY - 7, 1.5, 14);
    }
  }
}

class NumberField extends TextField {
  constructor(options = {}) {
    const min = options.min ?? 0;
    const max = options.max ?? Infinity;
    // digits only, as many as max has (no max: 9)
    super({ ...options, value: options.value ?? min, allowed: /^[0-9]$/, maxLength: String(max === Infinity ? 1e9 : max).length });
    this.min = min;
    this.max = max;
  }

  // clamped to min..max; empty counts as min
  get value() {
    const number = parseInt(this.text, 10);
    return constrain(Number.isNaN(number) ? this.min : number, this.min, this.max);
  }

  set value(number) {
    this.text = String(number);
  }

  // also tidies the text to the number it counts as (empty → min)
  blur() {
    super.blur();
    this.text = String(this.value);
  }
}

// # then 6 hex digits
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

// the browser's colour picker input, made on first use and kept hidden
let colourPickerInput = null;

class ColourField extends TextField {
  constructor(options = {}) {
    super({ ...options, maxLength: 7, allowed: /^[#0-9a-fA-F]$/ });
  }

  // the colour square at the right end
  swatch() {
    const size = this.h - 10;
    return { x: this.x + this.w - size - 5, y: this.y + 5, size };
  }

  // clicking the swatch opens the browser picker (RGB, HSL, hex); the text updates live while dragging
  update(hovered) {
    this.hovered = hovered;
    if (!hovered || !Input.buttonsPressed.has('left') || Input.mouse.x < this.swatch().x) return;
    if (!colourPickerInput) {
      colourPickerInput = document.createElement('input');
      colourPickerInput.type = 'color';
      // some browsers need it on the page. the picker opens beside it, so centre it near the form box
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

  // accepts hex with or without # (#6fae4f, 6FAE4F, #abc) or rgb numbers (rgb(111, 174, 79),
  // 111 174 79); anything else pastes normally
  paste(text) {
    const hex = pastedColour(text);
    if (!hex) return super.paste(text);
    this.text = hex;
    this.selected = false;
  }

  draw() {
    super.draw();
    const { x, y, size } = this.swatch();
    // the colour, or dark and crossed out until it's a whole colour
    stroke(140);
    strokeWeight(1);
    fill(HEX_COLOUR.test(this.text) ? this.text : color(20, 22, 28));
    rect(x, y, size, size, 3);
    if (!HEX_COLOUR.test(this.text)) line(x + 3, y + size - 3, x + size - 3, y + 3);
  }
}

// pasted hex or rgb → #rrggbb, or null (ColourField.paste())
function pastedColour(text) {
  text = text.trim();
  const hex = text.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    // #abc → #aabbcc
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join('') : hex[1];
    return `#${digits.toLowerCase()}`;
  }
  // 3 or 4 numbers, no words but "rgb"/"rgba". a 4th (alpha) is ignored
  const numbers = text.match(/\d*\.?\d+/g);
  if (/[a-z]/i.test(text.replace(/^rgba?/i, '')) || !numbers || numbers.length < 3 || numbers.length > 4) return null;
  return `#${numbers.slice(0, 3).map((n) => Math.round(Math.min(255, Number(n))).toString(16).padStart(2, '0')).join('')}`;
}
