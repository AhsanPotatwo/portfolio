// a box with a whole number in it that you can type into, e.g. a map's width in the map editor's
// size box (editor.js). builds on UIElement (ui.js), so it has x, y, w, h, visible and group too.
//
//   const field = UI.add(new NumberField({ x: 20, y: 20, w: 80, h: 32, value: 40, min: 1, max: 500 }));
//   field.focus();        // typing goes into it now
//   field.value           // the number in it, kept between min and max
//
// whatever has it decides when it's focused (clicking it doesn't do that by itself) and hands it
// each key from Input.typed with type(key), in order. it should also turn Input.typing on while
// it's being typed into, so keys type instead of controlling the game.
// focusing it selects the whole number, so typing replaces it, like most text boxes
class NumberField extends UIElement {
  constructor(options = {}) {
    super(options);
    this.min = options.min ?? 0;
    this.max = options.max ?? Infinity;
    // what's typed so far. can be empty, or past min or max while typing, value sorts that out
    this.text = String(options.value ?? this.min);
    // whether typing goes into it
    this.focused = false;
    // true straight after focusing, when the number's all selected and typing replaces it
    this.selected = false;
  }

  // the number in it, kept between min and max. an empty box counts as min
  get value() {
    const number = parseInt(this.text, 10);
    return constrain(Number.isNaN(number) ? this.min : number, this.min, this.max);
  }

  set value(number) {
    this.text = String(number);
  }

  focus() {
    this.focused = true;
    this.selected = true;
  }

  // stops typing into it, and tidies what's in it into the number it counts as (e.g. empty → min)
  blur() {
    this.focused = false;
    this.selected = false;
    this.text = String(this.value);
  }

  // one key typed into it (an e.key name from Input.typed). numbers go on the end, Backspace and
  // Delete take them away, anything else is ignored
  type(key) {
    if (/^[0-9]$/.test(key)) {
      if (this.selected) this.text = '';
      // enough digits for max, and no more (no max allows up to 9)
      if (this.text.length < String(this.max === Infinity ? 1e9 : this.max).length) this.text += key;
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

    // selected: a blue highlight behind the number, like a text box with everything selected
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
