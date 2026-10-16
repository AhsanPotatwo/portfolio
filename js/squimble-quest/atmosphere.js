// atmospheres: how a map feels, on top of how it's built. fog drifting over it, a second sheet over
// that (light rippling underwater, cloud shadows, stars), a colour wash over everything, colour
// drained out, light flickering, dark (or bright) edges, weather (particles falling or floating all
// over the screen), flashes of lightning and a sound looping in the background. a map picks one by
// name ("atmosphere": "underwater" in its file, mapfile.js), so every map in a world shares a look and
// changing it changes all of them.
//
// the game is going to have worlds of different themes (forests, underwater, volcanoes, fire worlds,
// deserts, wastelands, snow, swamps, caves, space, alien planets...), and the files in atmospheres/
// are a starting look for each one to copy and tune: misty-forest, underwater, volcano, inferno,
// desert, wasteland, snowfield, swamp, cave, storm, space, alien and dreamy.
//
// like particle effects, every atmosphere is plain settings (one per ATMOSPHERE_SETTINGS line, which
// is also its row in the editor), kept by name in ATMOSPHERES, from a file each in
// assets/squimble-quest/atmospheres/ (datafiles.js). the map editor's Atmosphere button opens
// AtmosphereEditor (bottom of this file): pick one for the map, change it while the map changes behind
// the box, Save, then Save and export.
//
// it's only for show and never changes the game, so in multiplayer it'd run on each computer like
// sound and particles. it's built to cost about the same on any screen:
//   - fog and the overlay are a small picture of noise (ATMOSPHERE_TEXTURE px square, made once per
//     look and kept), tiled a few times over a small canvas (the screen divided by Pixel size), then
//     stretched over the screen once. so a 4K screen costs the same as a laptop's, and a bigger Pixel
//     size is quicker still (and more pixel art)
//   - the tint, drained colour, edges and flashes are one fill each over the screen, and anything at 0
//     isn't drawn at all, so a map with no atmosphere costs nothing
//   - weather goes through ParticleEmitters (particles.js), so it shares their limit and gets turned
//     down with everything else when there'd be too many
//
// where it hooks into the rest of the game:
//   sketch.js     Atmosphere.update() every frame (the looping sound, flashes), and Atmosphere.draw()
//                 after the things on the map, before damage numbers and the editor's cursor
//   particles.js  ParticleEmitters.update() makes the weather
//   tilemap.js, mapfile.js   map.atmosphere, saved as "atmosphere" in the map file
//   editor.js     the toolbar's Atmosphere button
//   debug.js      untick Atmosphere in the dev menu (H) to see the map plainly while editing
//
// ideas for later:
//   - wobble (underwater, heat haze) moves pixels around, which needs the shader pipeline
//     (shaders.js) to be on for real rather than dev mode only
//   - an atmosphere setting the shaders' sun and darkness, so caves and space are dark and torches
//     matter (see the Shaders ideas in README.md)
//   - areas of a map with their own atmosphere (a foggy hollow in a sunny forest), a trigger that
//     fades between two
//   - more than two sheets, if two ever runs out

// the noise picture fog and the overlay tile, in px square. bigger is more detail and longer to make
const ATMOSPHERE_TEXTURE = 128;

// the patterns a sheet can have: their words in the editor, and the noise they're made from, 0 to 1
// at x, y (0 to 1 across the picture). they all join up at the edges so the picture tiles. whatever
// the numbers come out as, they're spread evenly from 0 to 1 afterwards (atmosphereField()), so
// Cover is how much of the screen is covered for every pattern
const ATMOSPHERE_PATTERNS = {
  clouds: { say: 'soft clouds', value: (x, y) => atmosphereFbm(x, y, 4, 4, 5, 1) },
  wisps: { say: 'long wisps', value: (x, y) => atmosphereFbm(x, y, 2, 8, 4, 2) },
  patches: { say: 'big patches', value: (x, y) => atmosphereFbm(x, y, 2, 2, 3, 3) },
  // the edges of bubbly cells, bent a little by clouds, like light through waves on a sea floor
  ripples: {
    say: 'ripples of light',
    value: (x, y) => -atmosphereCells(x + 0.04 * atmosphereFbm(x, y, 4, 4, 2, 4), y + 0.04 * atmosphereFbm(x, y, 4, 4, 2, 5), 6, 6),
  },
  // long and thin across the screen, for heat shimmer and blowing sand
  streaks: { say: 'streaks', value: (x, y) => atmosphereFbm(x, y, 1, 32, 2, 7) },
  // single pixels, for stars and dust. Cover is how many
  specks: { say: 'specks', value: (x, y) => atmosphereHash(Math.floor(x * ATMOSPHERE_TEXTURE), Math.floor(y * ATMOSPHERE_TEXTURE), 8) },
};

// how a sheet goes onto the map: its words in the editor, and the canvas blend
const ATMOSPHERE_BLENDS = {
  cover: { say: 'covers it (fog)', op: 'source-over' },
  glow: { say: 'lights it up (glow)', op: 'lighter' },
  shade: { say: 'shades it (shadow)', op: 'multiply' },
};

// how the tint goes over everything: the canvas blend, and its words in the editor
const ATMOSPHERE_TINTS = {
  multiply: 'shades (multiply)',
  'soft-light': 'soft light',
  overlay: 'punchier (overlay)',
  screen: 'brightens (screen)',
  color: 'recolours',
  'source-over': 'paints over',
};

const ATMOSPHERE_FLASH = {
  // how much of a flash fades a second (a flash starts at 1)
  fade: 2.5,
  // how bright a flash is at most, 0 to 1
  bright: 0.7,
};

// the two sheets' settings, which are the same apart from their normal values. sheet is 'fog' or
// 'overlay', which starts each key (fogColour, overlaySpeed...), and the tabs are its label and
// "label moves"
function atmosphereSheetSettings(sheet, label, normal) {
  const tab = label;
  const moves = `${label} moves`;
  return [
    { tab, key: `${sheet}Colour`, label: 'Colour', normal: normal.colour, colour: true, tip: 'The colour of it' },
    { tab, key: `${sheet}Amount`, label: 'Amount', normal: 0, min: 0, max: 100, unit: '%', tip: 'How strong it is. 0 turns it off' },
    { tab, key: `${sheet}Pattern`, label: 'Pattern', normal: normal.pattern, options: ATMOSPHERE_PATTERNS, tip: 'Ripples suit light underwater, specks suit stars and dust, big patches suit cloud shadows' },
    { tab, key: `${sheet}Blend`, label: 'Blend', normal: normal.blend, options: ATMOSPHERE_BLENDS, tip: 'Covers is fog. Glow adds light (ripples, nebulas). Shade darkens, for cloud shadows' },
    { tab, key: `${sheet}Size`, label: 'Size', normal: normal.size, min: 16, max: 2048, curve: 'log', unit: 'px', tip: 'How big the pattern is on the map before it repeats' },
    { tab, key: `${sheet}Cover`, label: 'Cover', normal: normal.cover, min: 0, max: 100, unit: '%', tip: 'How much of the screen it covers. Thicker fog, or more stars' },
    { tab, key: `${sheet}Softness`, label: 'Softness', normal: normal.softness, min: 0, max: 100, unit: '%', tip: 'How soft its edges are. 0 is hard edged' },
    { tab: moves, key: `${sheet}Speed`, label: 'Speed', normal: normal.speed, min: 0, max: 400, curve: 'square', unit: 'px/s', tip: 'How fast it drifts across the map' },
    { tab: moves, key: `${sheet}Direction`, label: 'Direction', normal: normal.direction, min: 0, max: 355, step: 5, unit: '°', tip: 'Which way it drifts. 0 is right, 90 down, 180 left, 270 up' },
    { tab: moves, key: `${sheet}Layers`, label: 'Layers', normal: normal.layers, min: 1, max: 3, tip: 'Copies of it on top of each other, each smaller and nearer, which gives it depth. 1 is quickest' },
    { tab: moves, key: `${sheet}Churn`, label: 'Churn', normal: normal.churn, min: 0, max: 100, unit: '%', tip: 'How differently the layers move, so it swirls into itself instead of sliding' },
    { tab: moves, key: `${sheet}Parallax`, label: 'Parallax', normal: 100, min: 0, max: 200, step: 5, unit: '%', tip: "How much it moves with the map. 100 sits on the ground, 0 stays on the screen, over 100 is nearer than the ground" },
    { tab: moves, key: `${sheet}Breathe`, label: 'Breathe', normal: normal.breathe, min: 0, max: 100, unit: '%', tip: 'Slowly thickens and thins, each layer at its own time' },
  ];
}

// every setting an atmosphere has, which is also its row in the editor, like PARTICLE_SETTINGS
// (particles.js, whose comment explains the parts). options: { value: say or { say } } is a picker of
// a fixed list, and particles: true picks any number of particle effects. percentages are stored as
// 0 to 100, as the slider shows them. a new setting is a line here and whatever it does in
// drawAtmosphere() or Atmosphere
const ATMOSPHERE_SETTINGS = [
  { tab: 'Main', key: 'sound', label: 'Sound', normal: '', choices: atmosphereSoundChoices, say: sayAtmosphereSound, tip: 'A sound that loops everywhere on the map, like wind or a low hum. Silent in the editor' },
  { tab: 'Main', key: 'soundVolume', label: 'Volume', normal: 60, min: 0, max: 100, unit: '%', tip: 'How loud the looping sound is' },
  { tab: 'Main', key: 'pixel', label: 'Pixel size', normal: 3, min: 1, max: 16, unit: 'px', tip: 'How chunky fog and the overlay are. Bigger is more pixel art, and quicker to draw on slow computers' },
  { tab: 'Main', key: 'smooth', label: 'Smooth', normal: true, tick: 'blend the pixels together', tip: 'Untick for hard pixel edges that match pixel art' },
  { tab: 'Main', key: 'bands', label: 'Bands', normal: 0, min: 0, max: 8, tip: 'Steps fog and the overlay into this many flat shades, for a cel shaded look. 0 is smooth' },

  { tab: 'Colour', key: 'tintColour', label: 'Tint', normal: '#ffffff', colour: true, tip: 'A colour over everything: blue underwater, orange in a volcano' },
  { tab: 'Colour', key: 'tintAmount', label: 'Tint amount', normal: 0, min: 0, max: 100, unit: '%', tip: 'How strong the tint is. 0 turns it off' },
  { tab: 'Colour', key: 'tintMode', label: 'Tint mode', normal: 'multiply', options: ATMOSPHERE_TINTS, tip: 'Shades darkens towards the tint, brightens lightens, recolours keeps light and dark but swaps the colours' },
  { tab: 'Colour', key: 'drain', label: 'Drained', normal: 0, min: 0, max: 100, unit: '%', tip: 'Takes the colour out of everything, for wastelands and old memories' },
  { tab: 'Colour', key: 'flicker', label: 'Flicker', normal: 0, min: 0, max: 100, unit: '%', tip: 'Makes the tint flicker stronger and weaker, like firelight' },
  { tab: 'Colour', key: 'flickerSpeed', label: 'Flicker rate', normal: 2, min: 0.1, max: 20, step: 0.1, curve: 'log', unit: '/s', tip: 'How fast it flickers. Slow is a glow breathing, fast is flames' },
  { tab: 'Colour', key: 'edgeColour', label: 'Edge colour', normal: '#000000', colour: true, tip: 'The colour round the edges of the screen. White is dreamy' },
  { tab: 'Colour', key: 'edgeAmount', label: 'Edges', normal: 0, min: 0, max: 100, unit: '%', tip: 'How strong the edges are. 0 turns them off' },
  { tab: 'Colour', key: 'edgeSize', label: 'Edge size', normal: 50, min: 0, max: 100, unit: '%', tip: 'How far in from the edges it reaches' },

  ...atmosphereSheetSettings('fog', 'Fog', { colour: '#dfe6ee', pattern: 'clouds', blend: 'cover', size: 320, cover: 50, softness: 60, speed: 10, direction: 0, layers: 2, churn: 40, breathe: 30 }),
  ...atmosphereSheetSettings('overlay', 'Overlay', { colour: '#ffffff', pattern: 'ripples', blend: 'glow', size: 160, cover: 30, softness: 40, speed: 6, direction: 45, layers: 1, churn: 50, breathe: 0 }),

  { tab: 'Weather', key: 'weather', label: 'Particles', normal: null, particles: true, tip: 'Particle effects (particles.js) falling or floating all over the screen: rain, snow, ash, bubbles...' },
  { tab: 'Weather', key: 'weatherAmount', label: 'Amount', normal: 100, min: 0, max: 500, step: 5, unit: '%', tip: "At 100 it's as if every tile on screen made them at their Keep going rate" },
  { tab: 'Weather', key: 'flashes', label: 'Flashes', normal: 0, min: 0, max: 30, step: 0.5, unit: '/min', tip: 'Flashes of light a minute, on average, like lightning' },
  { tab: 'Weather', key: 'flashColour', label: 'Flash colour', normal: '#ffffff', colour: true, tip: 'The colour of the flashes' },
  { tab: 'Weather', key: 'flashSound', label: 'Flash sound', normal: '', choices: atmosphereSoundChoices, say: sayAtmosphereSound, tip: 'A sound each flash plays, like thunder. Silent in the editor' },
];

const ATMOSPHERE_DEFAULTS = Object.fromEntries(ATMOSPHERE_SETTINGS.map(({ key, normal }) => [key, normal]));

// filled in from the atmosphere files (bottom of this file)
const ATMOSPHERES = {};

function defineAtmosphere(name, settings) {
  defineType(ATMOSPHERES, ATMOSPHERE_DEFAULTS, 'atmosphere', name, settings); // utils.js
  const atmosphere = ATMOSPHERES[name];
  // a pattern, blend or tint that isn't on its list would quietly draw wrong, so it goes back to normal
  for (const line of ATMOSPHERE_SETTINGS) {
    if (!line.options || Object.hasOwn(line.options, atmosphere[line.key])) continue;
    console.warn(`The atmosphere "${name}" has a ${line.key} "${atmosphere[line.key]}" that isn't one of ${Object.keys(line.options).join(', ')} (atmosphere.js), so it's ${line.normal}`);
    atmosphere[line.key] = line.normal;
  }
}

// the Sound and Flash sound pickers: none, then every sound in the library (sound.js)
function atmosphereSoundChoices() {
  return ['', ...Object.keys(SOUNDS)];
}

function sayAtmosphereSound(name) {
  return name || 'none';
}

// ---------- the noise pictures ----------

// a random number from 0 to 1 that's always the same for the same whole numbers a, b and seed
function atmosphereHash(a, b, seed) {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// smooth noise at x, y (0 to 1 across the picture) from a grid of random numbers cols x rows, which
// wraps round so it joins up at the edges
function atmosphereNoise(x, y, cols, rows, seed) {
  const u = x * cols;
  const v = y * rows;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const at = (a, b) => atmosphereHash(((a % cols) + cols) % cols, ((b % rows) + rows) % rows, seed);
  // eased between the grid's numbers, so there are no creases along the grid lines
  const fu = (u - i) * (u - i) * (3 - 2 * (u - i));
  const fv = (v - j) * (v - j) * (3 - 2 * (v - j));
  const top = at(i, j) + (at(i + 1, j) - at(i, j)) * fu;
  const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fu;
  return top + (bottom - top) * fv;
}

// noise in layers (octaves), each twice as fine and half as strong as the last, which is what makes
// it look like clouds rather than blobs. cols and rows are the coarsest layer's grid, different for
// stretched patterns
function atmosphereFbm(x, y, cols, rows, octaves, seed) {
  let sum = 0;
  let strength = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    sum += strength * atmosphereNoise(x, y, cols << o, rows << o, seed * 16 + o);
    total += strength;
    strength /= 2;
  }
  return sum / total;
}

// how far x, y is from the edge between the two nearest of a random point in each cell of a cols x rows
// grid (Voronoi cells, also wrapping round). 0 on an edge, more inside a cell
function atmosphereCells(x, y, cols, rows) {
  const u = x * cols;
  const v = y * rows;
  const i = Math.floor(u);
  const j = Math.floor(v);
  let nearest = Infinity;
  let second = Infinity;
  for (let b = j - 1; b <= j + 1; b++) {
    for (let a = i - 1; a <= i + 1; a++) {
      const wa = ((a % cols) + cols) % cols;
      const wb = ((b % rows) + rows) % rows;
      const d = Math.hypot(a + atmosphereHash(wa, wb, 11) - u, b + atmosphereHash(wa, wb, 12) - v);
      if (d < nearest) {
        second = nearest;
        nearest = d;
      } else if (d < second) second = d;
    }
  }
  return second - nearest;
}

// each pattern's numbers for every pixel of the picture, spread evenly from 0 to 1 by putting them in
// order (so 0.7 means 70% of the picture is below it). made the first time a pattern's used, then kept
const ATMOSPHERE_FIELDS = {};

function atmosphereField(pattern) {
  if (ATMOSPHERE_FIELDS[pattern]) return ATMOSPHERE_FIELDS[pattern];
  const size = ATMOSPHERE_TEXTURE;
  const values = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) values[y * size + x] = ATMOSPHERE_PATTERNS[pattern].value(x / size, y / size);
  }
  const order = Array.from(values.keys()).sort((a, b) => values[a] - values[b]);
  const field = new Float32Array(values.length);
  order.forEach((index, rank) => { field[index] = rank / (order.length - 1); });
  return (ATMOSPHERE_FIELDS[pattern] = field);
}

// how solid a pixel of a sheet is (0 to 1) from its place in the field (0 to 1), its Cover and
// Softness (0 to 100) and the atmosphere's Bands. cover is how much of the field is solid, with
// softness fading in either side
function coverAlpha(value, cover, softness, bands) {
  const soft = 0.01 + (softness / 100) * 0.5;
  // from where it starts fading in, so 0 cover is none and 100 is all of it
  const from = (1 - cover / 100) * (1 + soft) - soft;
  const t = Math.min(1, Math.max(0, (value - from) / soft));
  const alpha = t * t * (3 - 2 * t);
  return bands > 0 ? Math.round(alpha * bands) / bands : alpha;
}

// the pictures sheets tile, in their colour, by everything that changes them. made when a look's first
// seen (dragging a slider makes a new one each step, which is quick at this size)
const AtmosphereTextures = new Map();

function atmosphereTexture(pattern, colour, cover, softness, bands) {
  const key = `${pattern} ${colour} ${cover} ${softness} ${bands}`;
  let canvas = AtmosphereTextures.get(key);
  if (canvas) return canvas;
  const size = ATMOSPHERE_TEXTURE;
  const field = atmosphereField(pattern);
  canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(size, size);
  const [r, g, b] = hexToRgb(colour); // particles.js
  for (let i = 0; i < field.length; i++) {
    pixels.data[i * 4] = r;
    pixels.data[i * 4 + 1] = g;
    pixels.data[i * 4 + 2] = b;
    pixels.data[i * 4 + 3] = Math.round(255 * coverAlpha(field[i], cover, softness, bands));
  }
  ctx.putImageData(pixels, 0, 0);
  // ponytail: keeps the last 16, plenty for a map and the editor's sliders. count by size if
  // ATMOSPHERE_TEXTURE ever gets big
  if (AtmosphereTextures.size >= 16) AtmosphereTextures.delete(AtmosphereTextures.keys().next().value);
  AtmosphereTextures.set(key, canvas);
  return canvas;
}

// small canvases the sheets get drawn on before they're stretched over the screen, by sheet and size
// (the map and the editor's preview need different sizes)
const AtmosphereBuffers = new Map();

function atmosphereBuffer(sheet, w, h) {
  const key = `${sheet} ${w} ${h}`;
  let canvas = AtmosphereBuffers.get(key);
  if (!canvas) {
    // dragging Pixel size makes a new size each step
    if (AtmosphereBuffers.size >= 8) AtmosphereBuffers.clear();
    canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    AtmosphereBuffers.set(key, canvas);
  }
  return canvas;
}

// the edges: a picture going from see-through in the middle to colour at the edges, stretched over
// the screen, by colour and size
const AtmosphereEdges = new Map();

function atmosphereEdgePicture(colour, size) {
  const key = `${colour} ${size}`;
  let canvas = AtmosphereEdges.get(key);
  if (canvas) return canvas;
  canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 90;
  const ctx = canvas.getContext('2d');
  // drawn in a 1 x 1 square stretched to the picture, so it's an oval that fits the screen
  ctx.scale(canvas.width, canvas.height);
  const outer = 0.75;
  const gradient = ctx.createRadialGradient(0.5, 0.5, outer * (1 - size / 100), 0.5, 0.5, outer);
  const [r, g, b] = hexToRgb(colour);
  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
  gradient.addColorStop(1, `rgb(${r}, ${g}, ${b})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1, 1);
  if (AtmosphereEdges.size >= 8) AtmosphereEdges.clear();
  AtmosphereEdges.set(key, canvas);
  return canvas;
}

// -1 to 1, wobbling smoothly but never quite repeating (three waves that don't line up), for flicker
function atmosphereWobble(t) {
  return (Math.sin(t) + 0.6 * Math.sin(t * 2.3 + 1) + 0.3 * Math.sin(t * 5.1 + 2)) / 1.9;
}

// ---------- drawing ----------

// draws atmosphere `a` over the screen box x, y, w, h (game px), whatever the camera's doing. view is
// what's in the middle of the box, { x, y, zoom } (a Camera works), so sheets move with the map.
// flash is how bright a flash is now (0 to 1)
function drawAtmosphere(a, x, y, w, h, view, flash = 0) {
  const ctx = drawingContext;
  const density = pixelDensity();
  ctx.save();
  // straight to game px, whatever transform it's inside (the camera's)
  ctx.setTransform(density, 0, 0, density, 0, 0);
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const time = millis() / 1000;
  for (const sheet of ['fog', 'overlay']) {
    if (a[`${sheet}Amount`] > 0) drawAtmosphereSheet(ctx, a, sheet, x, y, w, h, view, time);
  }
  // a colour over the whole box
  const wash = (colour, alpha, op) => {
    if (alpha <= 0) return;
    ctx.globalCompositeOperation = op;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.fillStyle = colour;
    ctx.fillRect(x, y, w, h);
  };
  wash(a.tintColour, (a.tintAmount / 100) * (1 + (a.flicker / 100) * atmosphereWobble(time * a.flickerSpeed)), a.tintMode);
  // grey through the saturation blend keeps everything's lightness and takes its colour
  wash('#808080', a.drain / 100, 'saturation');
  if (a.edgeAmount > 0) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a.edgeAmount / 100;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(atmosphereEdgePicture(a.edgeColour, a.edgeSize), x, y, w, h);
  }
  // a quick dip near the start makes it a double strike, like lightning
  wash(a.flashColour, ATMOSPHERE_FLASH.bright * (flash > 0.8 && flash < 0.88 ? 0.3 : flash), 'lighter');
  ctx.restore();
}

// one sheet (fog or the overlay): its layers tiled onto a small canvas, then that stretched over the
// box in one go. each layer is smaller, nearer (more parallax) and, with churn, faster and going
// another way, which gives it depth and makes it swirl
function drawAtmosphereSheet(ctx, a, sheet, x, y, w, h, view, time) {
  const s = (key) => a[sheet + key];
  const pixel = a.pixel;
  const bw = Math.ceil(w / pixel);
  const bh = Math.ceil(h / pixel);
  const buffer = atmosphereBuffer(sheet, bw, bh);
  const b = buffer.getContext('2d');
  b.clearRect(0, 0, bw, bh);
  const pattern = b.createPattern(atmosphereTexture(s('Pattern'), s('Colour'), s('Cover'), s('Softness'), a.bands), 'repeat');
  b.fillStyle = pattern;
  const churn = s('Churn') / 100;
  // a camera's shake moves the map, so it moves the fog on it too
  const cx = view.x + (view.shakeX ?? 0);
  const cy = view.y + (view.shakeY ?? 0);
  for (let i = 0; i < s('Layers'); i++) {
    const size = s('Size') / (1 + i * 0.6);
    const speed = s('Speed') * (1 + i * churn);
    const angle = radians(s('Direction') + i * churn * 50);
    const depth = (s('Parallax') / 100) * (1 + i * 0.15);
    // picture px to small canvas px, and how far apart its repeats are there
    const scale = (size * view.zoom) / ATMOSPHERE_TEXTURE / pixel;
    const repeat = ATMOSPHERE_TEXTURE * scale;
    // where a corner of the picture is on the small canvas: drifted along, and moved against the
    // camera by its parallax. only how far into a repeat it is matters, which keeps the numbers small
    let ox = (w / 2 + (Math.cos(angle) * speed * time - cx * depth) * view.zoom) / pixel;
    let oy = (h / 2 + (Math.sin(angle) * speed * time - cy * depth) * view.zoom) / pixel;
    ox = ((ox % repeat) + repeat) % repeat;
    oy = ((oy % repeat) + repeat) % repeat;
    // whole pixels when they're shown hard edged, so it steps like pixel art instead of shimmering
    if (!a.smooth) {
      ox = Math.round(ox);
      oy = Math.round(oy);
    }
    pattern.setTransform(new DOMMatrix([scale, 0, 0, scale, ox, oy]));
    b.globalAlpha = (i === 0 ? 1 : 0.6) * (1 - (s('Breathe') / 100) * (0.5 + 0.5 * Math.sin(time * 0.5 + i * 2.1)));
    b.fillRect(0, 0, bw, bh);
  }
  ctx.globalCompositeOperation = ATMOSPHERE_BLENDS[s('Blend')].op;
  ctx.globalAlpha = s('Amount') / 100;
  ctx.imageSmoothingEnabled = a.smooth;
  ctx.drawImage(buffer, 0, 0, bw, bh, x, y, bw * pixel, bh * pixel);
}

// the map's atmosphere while playing and editing
const Atmosphere = {
  // the settings AtmosphereEditor is changing, shown instead of the map's own while its box is open
  preview: null,
  // how bright a flash is now, 0 to 1
  flash: 0,

  // the atmosphere on map now, or null
  current(map) {
    return this.preview ?? ATMOSPHERES[map.atmosphere] ?? null;
  },

  // the same, or null while it's hidden from the dev menu (debug.js). the weather reads this too
  // (particles.js), so hiding it stops that as well
  showing(map) {
    return Debug.enabled && !Debug.show.atmosphere ? null : this.current(map);
  },

  // every frame (sketch.js): flashes, and the looping sound, which starts whenever it isn't playing.
  // it plays from a spot on the map with no distance to fade over, so it's the same everywhere on
  // it, and Sound.update() stops it for being on another map once you leave (sound.js)
  update(map, dt) {
    this.flash = Math.max(0, this.flash - dt * ATMOSPHERE_FLASH.fade);
    const a = this.showing(map);
    if (!a) return;
    if (a.flashes > 0 && randomBetween(0, 1) < (a.flashes / 60) * dt) { // utils.js
      this.flash = 1;
      if (a.flashSound && !Editor.active) playSound(a.flashSound);
    }
    // nothing plays in the editor (Editor.open()). 0 volume would be stopped and started every frame
    if (Editor.active || !SOUNDS[a.sound] || a.soundVolume <= 0) return;
    const key = `atmosphere ${a.sound}`;
    if (!Sound.isPlaying(key)) playSound(a.sound, { x: 0, y: 0, map }, key, { loop: true, volume: a.soundVolume / 100, range: Infinity, doppler: 0 });
  },

  // over the world (sketch.js), camera is the game's
  draw(camera, map) {
    const a = this.showing(map);
    if (a) drawAtmosphere(a, 0, 0, GAME_W, GAME_H, camera, this.flash);
  },
};

// ---------- the editor's box ----------

// the box the map editor's Atmosphere button opens (editor.js). it changes a copy (the draft), which
// the map shows while it's open (Atmosphere.preview), so Cancel leaves everything alone. Save puts it
// in ATMOSPHERES under its name and gives this map that atmosphere, and saving under a new name makes
// a copy. like particles there's no rename or delete, since maps name their atmosphere. do it by hand
// (the file and index.json)
const AtmosphereEditor = {
  // name: the ATMOSPHERES name to start on, or '' for none. worldMap is the game's (sketch.js)
  open(name) {
    const draft = { ...ATMOSPHERE_DEFAULTS, ...ATMOSPHERES[name] };
    delete draft.name;
    Atmosphere.preview = draft;
    const usePicker = new Picker({ w: 180, choices: ['', ...Object.keys(ATMOSPHERES)], value: name, label: sayAtmosphereSound, art: drawAtmosphereChoice });
    const nameField = new TextField({ w: 180, value: name });
    // set by Save and export, which saves like Save does and then exports
    let exporting = false;
    const fields = {};
    const tabs = [{
      label: 'Main',
      rows: [
        { label: 'Atmosphere', field: usePicker, tip: 'Which one this map uses. Picking another starts on that one' },
        { label: 'Save as', field: nameField, tip: 'Saving under a new name makes a copy. Left empty, the map has no atmosphere' },
      ],
    }];
    for (const line of ATMOSPHERE_SETTINGS) {
      fields[line.key] = atmosphereRowField(line, draft[line.key]);
      let tab = tabs.find(({ label }) => label === line.tab);
      if (!tab) tabs.push(tab = { label: line.tab, rows: [] });
      tab.rows.push({ label: line.label, field: fields[line.key], tip: line.tip });
    }
    tabs[0].rows.push({
      label: '',
      field: new Button({ w: 180, label: 'Save and export', style: 'editor', onClick: () => { exporting = true; FormBox.confirm(); } }),
      tip: 'Saves, then downloads the files of new or changed atmospheres for atmospheres/. Export the map too, so it remembers which one it uses',
    });

    FormBox.open({
      title: `Atmosphere of ${worldMap.name}`,
      hint: 'Right click a slider to put it back to normal',
      confirmLabel: 'Save',
      tabs,
      side: (x, y, w, h) => [new AtmospherePreview({ x, y, w, h, atmosphere: draft })],
      // copies the fields into the draft every frame, so the map changes as you drag. a colour that's
      // halfway through being typed waits until it's finished. picking another atmosphere opens the
      // box again on that one (here rather than in the picker's onChange, since the ui is mid update
      // there)
      onUpdate: () => {
        if (usePicker.value !== name) {
          FormBox.close();
          this.open(usePicker.value);
          return;
        }
        for (const line of ATMOSPHERE_SETTINGS) {
          const value = fields[line.key].value;
          if (!line.colour || HEX_COLOUR.test(value)) draft[line.key] = value; // textfield.js
        }
      },
      canConfirm: () => ATMOSPHERE_SETTINGS.every((line) => !line.colour || HEX_COLOUR.test(fields[line.key].value)),
      onCancel: () => { Atmosphere.preview = null; },
      onConfirm: () => {
        Atmosphere.preview = null;
        const saved = cleanMapName(nameField.value); // mapfile.js
        if (saved) ATMOSPHERES[saved] = { ...draft, name: saved };
        worldMap.atmosphere = saved;
        if (exporting) DataFiles.export(['atmosphere']);
      },
    });
  },
};

// the field for an ATMOSPHERE_SETTINGS line, starting on value. most are the same as particles'
// (particleeditor.js)
function atmosphereRowField(line, value) {
  if (line.particles) return particleMultiPicker(value);
  if (line.options) {
    const say = (key) => line.options[key].say ?? line.options[key];
    return new Picker({ w: 180, choices: Object.keys(line.options), value, label: say });
  }
  return particleField(line, value);
}

// an atmosphere's little picture in the picker: itself over a patch of grass
function drawAtmosphereChoice(name, x, y, size) {
  const a = ATMOSPHERES[name];
  if (!a) return;
  noStroke();
  fill('#4f7a3a');
  rect(x, y, size, size);
  drawAtmosphere(a, x, y, size, size, { x: 0, y: 0, zoom: 0.2 });
}

// the side of the atmosphere box: a made up bit of map with the draft over it, for when the box is
// covering the part of the map you're looking at. weather and sound only happen on the real map
class AtmospherePreview extends UIElement {
  constructor(options) {
    super(options);
    this.atmosphere = options.atmosphere;
  }

  draw() {
    const { x, y, w, h } = this;
    const mid = x + w / 2;
    noStroke();
    // grass, a path up the middle, a wall along the top and someone standing on the path
    fill('#4f7a3a');
    rect(x, y, w, h);
    fill('#9a7b4f');
    rect(mid - 20, y, 40, h);
    fill('#6b6f78');
    rect(x, y + 30, w, 32);
    fill('#3f4249');
    rect(x, y + 62, w, 8);
    fill('#e0c060');
    rect(mid - 7, y + h * 0.55, 14, 25);
    fill('#4a7a9a');
    rect(x + 20, y + h * 0.75, 24, 24);
    drawAtmosphere(this.atmosphere, x, y, w, h, { x: 0, y: 0, zoom: 1 }, Atmosphere.flash);
    noFill();
    stroke(EDITOR_COLOURS.edge); // editor.js
    strokeWeight(1);
    rect(x, y, w, h, 3);
    noStroke();
    fill(255, 255, 255, 200);
    setText(11, BOLD, CENTER, BOTTOM);
    text('Weather plays on the map', mid, y + h - 4);
  }
}

// every atmosphere loads once at the start, before the maps that name them (datafiles.js). the
// patterns they use get worked out then too (up to about 30 ms each), rather than in the middle of
// playing
DataFiles.register('atmosphere', {
  define: defineAtmosphere,
  loaded: () => Object.values(ATMOSPHERES).forEach((a) => [a.fogPattern, a.overlayPattern].forEach(atmosphereField)),
  names: () => Object.keys(ATMOSPHERES),
  toData: (name) => typeToData(ATMOSPHERES[name], ATMOSPHERE_DEFAULTS), // utils.js
});
