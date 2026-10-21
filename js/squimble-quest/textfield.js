// boxes you can type in, built on UIElement (ui.js). the editor's form box (formbox.js) uses them:
//   TextField    words, like a map name
//   NumberField  a whole number, like a map width (a TextField that only takes digits). the up and
//                down arrows nudge it, by 10 with Shift
//   ColourField  a colour like #6fae4f, with a little square that opens the ColourPicker
//   ColourPicker the little window you can drag around to pick a colour
// Ctrl + V pastes into any of them (paste()).
//
//   const name = UI.add(new TextField({ x: 20, y: 20, w: 180, h: 32, value: 'forest' }));
//   const width = UI.add(new NumberField({ x: 20, y: 60, w: 80, h: 32, value: 40, min: 1, max: 500 }));
//   name.focus();         // typing goes in
//   name.value            // its text
//   width.value           // its number, kept between min and max
//
// whatever owns the box decides which one has focus (clicking doesn't do it by itself), passes each
// Input.typed key to type(key) in order, and turns Input.typing on while typing. focusing selects all
// the text, so typing replaces it
class TextField extends UIElement {
  constructor(options = {}) {
    super(options);
    this.text = String(options.value ?? '');
    this.maxLength = options.maxLength ?? 20;
    // test for a single character that's allowed to be typed. anything else gets ignored
    this.allowed = options.allowed ?? /^[a-zA-Z0-9 _-]$/;
    // typing goes into this one
    this.focused = false;
    // everything's selected (it was just focused), so typing replaces it
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

  // Ctrl + V ({ paste } in Input.typed). it types it in one character at a time so only allowed
  // ones get in
  paste(text) {
    for (const character of text.trim()) this.type(character);
  }

  // one e.key from Input.typed. allowed characters get added on the end, Backspace/Delete remove one,
  // and anything else is ignored
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
    // dark box with a blue edge while it has focus
    fill(EDITOR_COLOURS.well);
    stroke(this.focused ? BUTTON_STYLES.primary.fill : this.hovered ? 140 : EDITOR_COLOURS.edge);
    strokeWeight(this.focused ? 1.5 : 1);
    rect(this.x, this.y, this.w, this.h, 3);

    const middleX = this.x + this.w / 2;
    const middleY = this.y + this.h / 2;
    setText(13, BOLD, CENTER, CENTER, s.font);
    noStroke();

    // highlight when everything's selected
    const width = textWidth(this.text);
    if (this.selected && this.text) {
      fill(BUTTON_STYLES.primary.fill);
      rect(middleX - width / 2 - 2, middleY - 8, width + 4, 16, 2);
    }
    fill(s.textColour);
    text(this.text, middleX, middleY);

    // blinking cursor, 0.5s on and 0.5s off
    if (this.focused && !this.selected && millis() % 1000 < 500) {
      rect(middleX + width / 2 + 2, middleY - 7, 1.5, 14);
    }
  }
}

class NumberField extends TextField {
  constructor(options = {}) {
    const min = options.min ?? 0;
    const max = options.max ?? Infinity;
    // digits only (and a minus if it can go below 0), and only as many as max has (9 if there's no max)
    const longest = Math.max(String(max === Infinity ? 1e9 : max).length, String(min).length);
    super({ ...options, value: options.value ?? min, allowed: min < 0 ? /^[-0-9]$/ : /^[0-9]$/, maxLength: longest });
    this.min = min;
    this.max = max;
  }

  // kept between min and max. empty (or just a minus) counts as 0, or min if that's above 0
  get value() {
    const number = parseInt(this.text, 10);
    return constrain(Number.isNaN(number) ? 0 : number, this.min, this.max);
  }

  set value(number) {
    this.text = String(number);
  }

  // the up and down arrows nudge it by 1, or 10 with Shift (Input.typed in input.js)
  type(key) {
    const nudge = { ArrowUp: 1, ArrowDown: -1, 'Shift+ArrowUp': 10, 'Shift+ArrowDown': -10 }[key];
    if (!nudge) return super.type(key);
    this.text = String(constrain(this.value + nudge, this.min, this.max));
    this.selected = false;
  }

  // also tidies the text up to the number it counts as (so empty becomes min)
  blur() {
    super.blur();
    this.text = String(this.value);
  }
}

// a # and then 6 hex digits
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

class ColourField extends TextField {
  constructor(options = {}) {
    super({ ...options, maxLength: 7, allowed: /^[#0-9a-fA-F]$/ });
  }

  // the colour square at the right hand end
  swatch() {
    const size = this.h - 10;
    return { x: this.x + this.w - size - 5, y: this.y + 5, size };
  }

  // clicking the colour square opens (or closes) the ColourPicker. the text updates live while you drag
  // around in it
  update(hovered) {
    this.hovered = hovered;
    if (hovered && Input.buttonsPressed.has('left') && Input.mouse.x >= this.swatch().x) ColourPicker.toggle(this);
  }

  // takes hex with or without the # (#6fae4f, 6FAE4F, #abc) or rgb numbers (rgb(111, 174, 79) or
  // 111 174 79). anything else just pastes like normal
  paste(text) {
    const hex = pastedColour(text);
    if (!hex) return super.paste(text);
    this.text = hex;
    this.selected = false;
  }

  draw() {
    super.draw();
    const { x, y, size } = this.swatch();
    // the colour, or dark with a line through it until it's a full colour
    stroke(140);
    strokeWeight(1);
    fill(HEX_COLOUR.test(this.text) ? this.text : color(20, 22, 28));
    rect(x, y, size, size, 3);
    if (!HEX_COLOUR.test(this.text)) line(x + 3, y + size - 3, x + size - 3, y + 3);
  }
}

// the little window a ColourField's square opens. at the top, a square for how vivid (across) and
// bright (down) and a rainbow strip for the hue. under them, the sliders of one colour mode at a time,
// picked with the tabs (COLOUR_MODES). along the bottom: the colour it had when it opened next to the
// colour now (click the old half to go back), the last few colours picked (click one to use it), and
// an eyedropper that picks a colour from anywhere on the screen (only in browsers that have one, like
// Chrome and Edge). the mode and recent colours are remembered (localStorage).
// its field's text changes live while you drag, and typing or pasting in the field moves it. the wheel
// over a slider nudges it by 1. drag the title bar to move it, and it opens where you left it next
// time. the ×, Escape, clicking the square again or the box closing closes it. only one is ever open
// (ColourPicker.current), and clicking another field's square switches it to that one
const COLOUR_PICKER = { w: 216, pad: 10, squareHeight: 120, hueHeight: 12, tabHeight: 18, barHeight: 20, footHeight: 22, recent: 6, storageKey: 'sq-colour-picker' };

// the ways the picker's sliders can show a colour. channels are [letter, what all the way shows as,
// unit]. from() turns the picker's [hue 0 to 360, saturation 0 to 1, value 0 to 1] into each channel 0
// to 1, and to() goes back, given the hsv it had (so grey keeps its hue and black its saturation)
const COLOUR_MODES = {
  RGB: {
    channels: [['R', 255, ''], ['G', 255, ''], ['B', 255, '']],
    from: (hsv) => hsvToRgb(...hsv).map((c) => c / 255),
    to: (values, hsv) => rgbToHsvKeeping(values.map((c) => Math.round(c * 255)), hsv),
  },
  // hue, saturation and brightness, how painting programs name HSV
  HSB: {
    channels: [['H', 360, '°'], ['S', 100, '%'], ['B', 100, '%']],
    from: ([h, s, v]) => [h / 360, s, v],
    to: ([h, s, v]) => [h * 360, s, v],
  },
  // hue, saturation and lightness, where 50% lightness is the most colourful and 100% is white
  HSL: {
    channels: [['H', 360, '°'], ['S', 100, '%'], ['L', 100, '%']],
    from: ([h, s, v]) => {
      const l = v * (1 - s / 2);
      return [h / 360, l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l), l];
    },
    to: ([h, s, l], [, oldS]) => {
      const v = l + s * Math.min(l, 1 - l);
      return [h * 360, v === 0 ? oldS : 2 * (1 - l / v), v];
    },
  },
  // ink: cyan, magenta, yellow and black (K)
  CMYK: {
    channels: [['C', 100, '%'], ['M', 100, '%'], ['Y', 100, '%'], ['K', 100, '%']],
    from: (hsv) => {
      const rgb = hsvToRgb(...hsv).map((c) => c / 255);
      const k = 1 - Math.max(...rgb);
      return k === 1 ? [0, 0, 0, 1] : [...rgb.map((c) => (1 - c - k) / (1 - k)), k];
    },
    to: ([c, m, y, k], hsv) => rgbToHsvKeeping([c, m, y].map((n) => Math.round(255 * (1 - n) * (1 - k))), hsv),
  },
};

// the mouse is inside part ({ x, y, w, h }), or within reach px of it
function mouseOver(part, reach = 0) {
  const { x, y } = Input.mouse;
  return Boolean(part) && x >= part.x - reach && x < part.x + part.w + reach && y >= part.y - reach && y < part.y + part.h + reach;
}

class ColourPicker extends FloatingWindow {
  static current = null;
  // its top left when it was last moved or opened, so it opens there again
  static spot = null;
  // { mode, recent }, kept between visits
  static saved = ColourPicker.load();

  static load() {
    try {
      const saved = JSON.parse(localStorage.getItem(COLOUR_PICKER.storageKey)) ?? {};
      return { mode: COLOUR_MODES[saved.mode] ? saved.mode : 'RGB', recent: Array.isArray(saved.recent) ? saved.recent.filter((hex) => HEX_COLOUR.test(hex)) : [] };
    } catch (e) {
      return { mode: 'RGB', recent: [] };
    }
  }

  static save() {
    try { localStorage.setItem(COLOUR_PICKER.storageKey, JSON.stringify(ColourPicker.saved)); } catch (e) {}
  }

  static toggle(owner) {
    const current = UI.elements.includes(ColourPicker.current) ? ColourPicker.current : null;
    if (current?.owner === owner) return ColourPicker.close();
    if (current) return current.follow(owner);
    ColourPicker.current = UI.add(new ColourPicker(owner));
  }

  static close() {
    if (ColourPicker.current) {
      ColourPicker.current.remember();
      UI.remove(ColourPicker.current);
    }
    ColourPicker.current = null;
  }

  constructor(owner) {
    const { w, pad, squareHeight, hueHeight, tabHeight, barHeight, footHeight } = COLOUR_PICKER;
    // read before super(), which puts it in the middle (and moveTo() would remember that)
    const spot = ColourPicker.spot;
    // tall enough for 4 sliders, so it stays the same size whichever mode it's in
    super({ title: 'Colour', w, h: FLOATING_WINDOW.titleHeight + pad + squareHeight + 8 + hueHeight + 8 + tabHeight + 6 + 4 * barHeight + 4 + footHeight + pad });
    // the colour as hue 0 to 360, saturation and value 0 to 1. grey until the field has a colour
    [this.hue, this.sat, this.val] = [0, 0, 0.5];
    // what's being dragged: 'square', 'hue', a slider's number, or null (FloatingWindow does the title)
    this.held = null;
    // the square's picture, and the hue and pixel density it was made for (squareImage())
    this.squareCanvas = null;
    this.squareFor = null;
    this.follow(owner);
    // where it was left, otherwise to the right of the form box (or the left if there's no room)
    const box = FormBox.box;
    const right = box.x + box.w + 8;
    this.moveTo(spot?.x ?? (right + w <= GAME_W ? right : box.x - w - 8), spot?.y ?? owner.y - 40);
  }

  // remembers where it is, so it opens there next time
  moveTo(x, y) {
    super.moveTo(x, y);
    ColourPicker.spot = { x: this.x, y: this.y };
  }

  // the ×
  close() {
    if (ColourPicker.current === this) ColourPicker.close();
    else UI.remove(this);
  }

  follow(owner) {
    this.remember();
    this.owner = owner;
    // its text when the picker came to it, which the old half of the bottom left square puts back
    this.start = owner.text;
    // the last colour it put in the field, so it can tell when it's been typed in
    this.hex = null;
    this.readField();
    this.refresh();
  }

  mode() {
    return COLOUR_MODES[ColourPicker.saved.mode];
  }

  get hsv() {
    return [this.hue, this.sat, this.val];
  }

  // works the sliders out again from the colour. they're kept while you drag one, so the others don't
  // drift or lose what they were at black or white
  refresh() {
    this.values = this.mode().from(this.hsv);
  }

  // picks up the field's colour when it's a full one this didn't put there
  readField() {
    const text = this.owner.text.toLowerCase();
    if (!HEX_COLOUR.test(text) || text === this.hex) return;
    this.hex = text;
    [this.hue, this.sat, this.val] = rgbToHsvKeeping(hexToRgb(text), this.hsv);
    this.refresh();
  }

  // changes the colour and puts it in the field. a slider passes refresh false to keep the others
  set([h, s, v], refresh = true) {
    [this.hue, this.sat, this.val] = [h, s, v];
    if (refresh) this.refresh();
    this.hex = rgbToHex(hsvToRgb(h, s, v));
    this.owner.text = this.hex;
    this.owner.selected = false;
  }

  useHex(hex) {
    this.set(rgbToHsvKeeping(hexToRgb(hex), this.hsv));
  }

  // moves slider i to t (0 to 1)
  slide(i, t) {
    this.values[i] = constrain(t, 0, 1);
    this.set(this.mode().to(this.values, this.hsv), false);
  }

  // the field goes back to what it was, even empty (an empty look colour follows its group's)
  revert() {
    this.owner.text = this.start;
    this.owner.selected = false;
    this.hex = null;
    this.readField();
  }

  // puts its field's colour first in the recent ones, if it was changed
  remember() {
    const hex = this.owner?.text.toLowerCase();
    if (!HEX_COLOUR.test(hex ?? '') || hex === this.start.toLowerCase()) return;
    const saved = ColourPicker.saved;
    saved.recent = [hex, ...saved.recent.filter((c) => c !== hex)].slice(0, COLOUR_PICKER.recent);
    ColourPicker.save();
  }

  // the browser's eyedropper picks a colour from anywhere on the screen. Escape cancels it
  eyedrop() {
    new EyeDropper().open().then(({ sRGBHex }) => {
      const hex = pastedColour(sRGBHex);
      if (hex && ColourPicker.current === this) this.useHex(hex);
    }).catch(() => {});
  }

  // where everything is, as { x, y, w, h }: the square, the hue strip, the mode tabs, the sliders
  // (leaving room for their letter on the left and number on the right), and along the bottom the old
  // and new colour, the recent ones and the eyedropper (null when the browser has none)
  parts() {
    const { pad, squareHeight, hueHeight, tabHeight, barHeight, footHeight } = COLOUR_PICKER;
    const x = this.x + pad;
    const w = this.w - pad * 2;
    const square = { x, y: this.contentTop() + pad, w, h: squareHeight };
    const hue = { x, y: square.y + square.h + 8, w, h: hueHeight };
    const names = Object.keys(COLOUR_MODES);
    const tabW = (w - 2 * (names.length - 1)) / names.length;
    const tabs = names.map((name, i) => ({ name, x: x + i * (tabW + 2), y: hue.y + hue.h + 8, w: tabW, h: tabHeight }));
    const barsTop = tabs[0].y + tabHeight + 6;
    const bars = this.mode().channels.map((_, i) => ({ x: x + 14, y: barsTop + i * barHeight + barHeight / 2 - 4, w: w - 52, h: 8 }));
    const footY = barsTop + 4 * barHeight + 4;
    const old = { x, y: footY, w: 20, h: footHeight };
    const now = { x: x + 20, y: footY, w: 20, h: footHeight };
    const recent = ColourPicker.saved.recent.map((hex, i) => ({ hex, x: x + 48 + i * 20, y: footY + 2, w: 18, h: 18 }));
    const dropper = window.EyeDropper ? { x: x + w - footHeight, y: footY, w: footHeight, h: footHeight } : null;
    return { square, hue, tabs, bars, old, now, recent, dropper };
  }

  update(hovered) {
    if (ColourPicker.current !== this) return;
    // its field got hidden (another tab) or taken away
    if (!this.owner.visible || !UI.elements.includes(this.owner)) return ColourPicker.close();
    if (this.updateWindow(hovered)) return;
    this.readField();
    const { x, y } = Input.mouse;
    const parts = this.parts();
    const { square, hue, bars } = parts;
    const bar = hovered ? bars.findIndex((part) => mouseOver(part, 6)) : -1;
    if (hovered && Input.buttonsPressed.has('left')) {
      const tab = parts.tabs.find((part) => mouseOver(part));
      const recent = parts.recent.find((part) => mouseOver(part));
      if (mouseOver(square)) this.held = 'square';
      else if (mouseOver(hue, 4)) this.held = 'hue';
      else if (bar >= 0) this.held = bar;
      else if (tab) {
        ColourPicker.saved.mode = tab.name;
        ColourPicker.save();
        this.refresh();
      } else if (mouseOver(parts.old)) this.revert();
      else if (recent) this.useHex(recent.hex);
      else if (mouseOver(parts.dropper)) this.eyedrop();
    }
    // the wheel over a slider nudges it by 1 of what it shows, used up so nothing else scrolls
    if (bar >= 0 && Input.wheel !== 0 && this.held === null) {
      const scale = this.mode().channels[bar][1];
      this.slide(bar, (Math.round(this.values[bar] * scale) - Math.sign(Input.wheel)) / scale);
      Input.wheel = 0;
    }
    if (!Input.buttonsHeld.has('left')) this.held = null;
    if (this.held === null) return;

    // how far along a part the mouse is, 0 to 1
    const along = (part) => constrain((x - part.x) / part.w, 0, 1);
    if (this.held === 'square') this.set([this.hue, along(square), 1 - constrain((y - square.y) / square.h, 0, 1)]);
    else if (this.held === 'hue') this.set([along(hue) * 360, this.sat, this.val]);
    else this.slide(this.held, along(bars[this.held]));
  }

  // the square's picture, each pixel worked out on its own. (it used to be gradients stacked up, which
  // some graphics cards draw as two triangles that don't quite match, leaving a faint line from corner to
  // corner.) only made again when the hue or pixel density changes
  squareImage(square) {
    const density = pixelDensity();
    const key = `${this.hue} ${density}`;
    if (this.squareFor === key) return this.squareCanvas;
    const w = Math.round(square.w * density);
    const h = Math.round(square.h * density);
    this.squareCanvas ??= document.createElement('canvas');
    Object.assign(this.squareCanvas, { width: w, height: h });
    const ctx = this.squareCanvas.getContext('2d');
    const image = ctx.createImageData(w, h);
    const pure = hsvToRgb(this.hue, 1, 1);
    for (let j = 0; j < h; j++) {
      const v = 1 - j / (h - 1);
      for (let i = 0; i < w; i++) {
        const s = i / (w - 1);
        const k = (j * w + i) * 4;
        // the same as hsvToRgb(hue, s, v)
        for (let n = 0; n < 3; n++) image.data[k + n] = v * (255 - s * (255 - pure[n]));
        image.data[k + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    this.squareFor = key;
    return this.squareCanvas;
  }

  draw() {
    const C = EDITOR_COLOURS;
    const S = BUTTON_STYLES.editor;
    const { pad } = COLOUR_PICKER;
    const { x, w } = this;
    const lit = (part, reach) => this.hovered && this.held === null && !this.grab && mouseOver(part, reach);
    this.drawWindow();

    // the canvas's own gradients, which p5 doesn't have
    const ctx = drawingContext;
    const paint = (part, style) => {
      ctx.fillStyle = style;
      ctx.fillRect(part.x, part.y, part.w, part.h);
    };
    const across = (part, colours) => {
      const gradient = ctx.createLinearGradient(part.x, 0, part.x + part.w, 0);
      colours.forEach((colour, i) => gradient.addColorStop(i / (colours.length - 1), colour));
      return gradient;
    };
    const parts = this.parts();
    const { square, hue, bars } = parts;
    const mode = this.mode();
    // smoothed (the game draws pixel art without), since an in between pixel density stretches it a hair
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.squareImage(square), square.x, square.y, square.w, square.h);
    ctx.restore();
    paint(hue, across(hue, ['#f00', '#ff0', '#0f0', '#0ff', '#00f', '#f0f', '#f00']));
    // each slider shows the colour you'd get along it, with the others as they are
    bars.forEach((bar, i) => {
      const stops = Array.from({ length: 13 }, (_, n) => {
        const values = [...this.values];
        values[i] = n / 12;
        return rgbToHex(hsvToRgb(...mode.to(values, this.hsv)));
      });
      paint(bar, across(bar, stops));
    });

    // where the colour is on each, dark round light so it shows on anything
    noFill();
    const ring = (shape) => {
      stroke(0);
      strokeWeight(3);
      shape();
      stroke(255);
      strokeWeight(1.5);
      shape();
    };
    ring(() => circle(square.x + this.sat * square.w, square.y + (1 - this.val) * square.h, 10));
    ring(() => rect(hue.x + (this.hue / 360) * hue.w - 2, hue.y - 2, 4, hue.h + 4, 1));
    bars.forEach((bar, i) => ring(() => rect(bar.x + this.values[i] * bar.w - 2, bar.y - 2, 4, bar.h + 4, 1)));

    // the mode tabs, the open one lit up like the form box's
    noStroke();
    setText(11, BOLD, CENTER, CENTER);
    for (const tab of parts.tabs) {
      const on = tab.name === ColourPicker.saved.mode;
      fill(on ? S.onFill : lit(tab) ? S.hoverFill : S.fill);
      rect(tab.x, tab.y, tab.w, tab.h, 3);
      fill(on || lit(tab) ? 255 : C.dimText);
      text(tab.name, tab.x + tab.w / 2, tab.y + tab.h / 2);
    }

    // each slider's letter and number
    setText(11, BOLD, LEFT, CENTER);
    bars.forEach((bar, i) => {
      const [letter, scale, unit] = mode.channels[i];
      fill(lit(bar, 6) ? C.text : C.dimText);
      textAlign(LEFT, CENTER);
      text(letter, x + pad, bar.y + bar.h / 2);
      fill(C.text);
      textAlign(RIGHT, CENTER);
      text(`${Math.round(this.values[i] * scale)}${unit}`, x + w - pad, bar.y + bar.h / 2);
    });

    // a colour square, crossed out when it isn't a full colour (an empty look colour)
    const swatch = (part, hex, hovered) => {
      const ok = HEX_COLOUR.test(hex);
      stroke(hovered ? 255 : C.edge);
      strokeWeight(1);
      fill(ok ? hex : C.well);
      rect(part.x, part.y, part.w, part.h);
      if (!ok) line(part.x + 3, part.y + part.h - 3, part.x + part.w - 3, part.y + 3);
    };
    swatch(parts.now, this.owner.text);
    swatch(parts.old, this.start, lit(parts.old));
    for (const part of parts.recent) swatch(part, part.hex, lit(part));
    if (parts.dropper) {
      const d = parts.dropper;
      noStroke();
      fill(lit(d) ? S.hoverFill : S.fill);
      rect(d.x, d.y, d.w, d.h, 3);
      // a little pipette: the glass, then the bulb
      stroke(lit(d) ? 255 : C.text);
      strokeWeight(2);
      line(d.x + 6, d.y + d.h - 6, d.x + d.w - 9, d.y + 9);
      strokeWeight(4);
      line(d.x + d.w - 9, d.y + 9, d.x + d.w - 7, d.y + 7);
    }

    // what the bottom row does, in a little box above it while the mouse is on one
    const recent = parts.recent.find((part) => lit(part));
    const tip = lit(parts.old) ? 'Back to how it was' : recent ? recent.hex : lit(parts.dropper) ? 'Pick a colour from the screen' : null;
    if (tip) {
      setText(11, BOLD, LEFT, CENTER);
      const tipW = textWidth(tip) + 12;
      const tipX = constrain(Input.mouse.x - tipW / 2, 4, GAME_W - tipW - 4);
      noStroke();
      fill(0, 0, 0, 230);
      rect(tipX, parts.old.y - 24, tipW, 20, 3);
      fill(255);
      text(tip, tipX + 6, parts.old.y - 14);
    }
  }
}

// [r, g, b] 0 to 255 as [hue 0 to 360, saturation 0 to 1, value 0 to 1], and back
function rgbToHsv([r, g, b]) {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, max === 0 ? 0 : d / max, max / 255];
}

function hsvToRgb(h, s, v) {
  const channel = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * v * (1 - s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [channel(5), channel(3), channel(1)];
}

// rgbToHsv(), but keeping hsv's hue for grey (which has none) and its saturation for black
function rgbToHsvKeeping(rgb, [h, s]) {
  const [newH, newS, v] = rgbToHsv(rgb);
  return [newS > 0 ? newH : h, v > 0 ? newS : s, v];
}

// [r, g, b] 0 to 255 as #rrggbb (hexToRgb() in particles.js goes back)
function rgbToHex(rgb) {
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// turns pasted hex or rgb into #rrggbb, or null if it isn't a colour (ColourField.paste())
function pastedColour(text) {
  text = text.trim();
  const hex = text.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    // #abc becomes #aabbcc
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join('') : hex[1];
    return `#${digits.toLowerCase()}`;
  }
  // 3 or 4 numbers, and no words apart from "rgb" or "rgba". a 4th number (alpha) gets ignored
  const numbers = text.match(/\d*\.?\d+/g);
  if (/[a-z]/i.test(text.replace(/^rgba?/i, '')) || !numbers || numbers.length < 3 || numbers.length > 4) return null;
  return `#${numbers.slice(0, 3).map((n) => Math.round(Math.min(255, Number(n))).toString(16).padStart(2, '0')).join('')}`;
}
