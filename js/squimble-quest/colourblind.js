// colour blind filters, picked on the pause menu's Screen tab (pausemenu.js). the filter goes over the
// whole canvas once it's drawn: the world, any shader from shaders.js, and the ui. so every shader
// still works under it and nothing in the game knows it's there.
//
// how: the browser runs it on the graphics card as an SVG colour matrix set as the canvas's CSS
// filter, so the game draws nothing extra and with it off there's no filter at all. the matrix
// "daltonizes", which is what fortnite, valorant, overwatch and unreal's colour blind setting do:
//   1. work out how each colour looks with that colour blindness (simulate, Machado et al. 2009)
//   2. what's lost is the difference between the real colour and that
//   3. move what's lost into colours that can still be told apart (shift), and add it back on
// greys stay grey, and colours that would look the same come out different. all three steps are
// matrices, so they multiply into one (colourBlindMatrix()). strength fades it in from none, like
// fortnite's slider: some people like a lighter touch.
//
// ponytail: protanopia, deuteranopia and tritanopia only, the three games usually offer. no
// achromatopsia (seeing no colour), which a filter can't help: the game itself would need shapes and
// patterns as well as colours

// the lost colour of red green colour blindness goes into green and blue, and of blue yellow into red
// and green (Fidaner et al.'s daltonize)
const SHIFT_TO_GREEN_BLUE = [0, 0, 0, 0.7, 1, 0, 0.7, 0, 1];
const SHIFT_TO_RED_GREEN = [1, 0, 0.7, 0, 1, 0.7, 0, 0, 0];

// the types, in the pause menu's order. simulate is a 3 x 3 matrix (row by row) for linear rgb, the
// full strength ones from Machado et al.
const COLOUR_BLIND_TYPES = {
  off: { label: 'Off' },
  protanopia: {
    label: 'Protanopia',
    simulate: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
    shift: SHIFT_TO_GREEN_BLUE,
  },
  deuteranopia: {
    label: 'Deuteranopia',
    simulate: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.011820, 0.042940, 0.968881],
    shift: SHIFT_TO_GREEN_BLUE,
  },
  tritanopia: {
    label: 'Tritanopia',
    simulate: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.303900],
    shift: SHIFT_TO_RED_GREEN,
  },
};

// 3 x 3 matrices, row by row
function multiply3(a, b) {
  return a.map((_, i) => {
    const row = Math.floor(i / 3);
    const col = i % 3;
    return a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col];
  });
}

const IDENTITY3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// the one matrix for a type at a strength (0 to 1): colour + strength * shift * (colour - simulated)
function colourBlindMatrix(type, strength) {
  const t = COLOUR_BLIND_TYPES[type];
  if (!t?.simulate) return IDENTITY3;
  const lost = IDENTITY3.map((v, i) => v - t.simulate[i]);
  return multiply3(t.shift, lost).map((v, i) => IDENTITY3[i] + v * strength);
}

const ColourBlind = {
  // the <feColorMatrix>, made the first time it's needed
  matrix: null,

  // puts the filter on the canvas for GAME_SETTINGS.colourBlind and colourBlindStrength (config.js),
  // or takes it off. the pause menu calls it after loading and on every change
  apply() {
    const canvas = drawingContext.canvas;
    const type = GAME_SETTINGS.colourBlind;
    const strength = GAME_SETTINGS.colourBlindStrength;
    if (!COLOUR_BLIND_TYPES[type]?.simulate || strength <= 0) {
      canvas.style.filter = '';
      return;
    }
    if (!this.matrix) {
      const svg = 'http://www.w3.org/2000/svg';
      const holder = document.createElementNS(svg, 'svg');
      holder.setAttribute('aria-hidden', 'true');
      holder.style.cssText = 'position:absolute;width:0;height:0';
      const filter = document.createElementNS(svg, 'filter');
      filter.id = 'sq-colour-blind';
      // linear rgb, which the simulate matrices are for (and SVG's default anyway)
      filter.setAttribute('color-interpolation-filters', 'linearRGB');
      this.matrix = document.createElementNS(svg, 'feColorMatrix');
      this.matrix.setAttribute('type', 'matrix');
      filter.append(this.matrix);
      holder.append(filter);
      document.body.append(holder);
    }
    const m = colourBlindMatrix(type, strength).map((v) => v.toFixed(6));
    // SVG's is 4 rows of 5: red, green, blue, alpha, then a number added on. alpha stays as it is
    this.matrix.setAttribute('values', `${m[0]} ${m[1]} ${m[2]} 0 0 ${m[3]} ${m[4]} ${m[5]} 0 0 ${m[6]} ${m[7]} ${m[8]} 0 0 0 0 0 1 0`);
    canvas.style.filter = 'url(#sq-colour-blind)';
  },
};
