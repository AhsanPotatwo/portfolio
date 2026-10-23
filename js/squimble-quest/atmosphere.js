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
// a map can also have areas: a box or oval of tiles with an atmosphere of its own on top of the map's
// (a foggy graveyard, heat over lava, steam off a hot spring). see "areas" further down.
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
//   sketch.js     Atmosphere.update() every frame (looping sounds, flashes, how far into each area you
//                 are), and Atmosphere.draw() after the things on the map, before damage numbers and
//                 the editor's cursor
//   particles.js  ParticleEmitters.update() makes the weather, the map's and each area's
//   tilemap.js, mapfile.js   map.atmosphere and map.areas, saved as "atmosphere" and "areas"
//   editor.js     Map > Atmosphere in the menu bar, the Triggers tab's area (dragged out on the map,
//                 AtmosphereAreas), right clicking inside an area, and drawing their outlines
//   debug.js      untick Atmosphere in the dev menu (H) to see the map plainly while editing
//
// ideas for later:
//   - wobble (underwater, heat haze) moves pixels around, which needs the shader pipeline
//     (shaders.js) to be on for real rather than dev mode only
//   - an atmosphere setting the shaders' sun and darkness, so caves and space are dark and torches
//     matter (see the Shaders ideas in README.md)
//   - areas that move (a storm cloud drifting over), or shapes you paint tile by tile
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

// draws atmosphere `a` over the screen box x, y, w, h (game px), whatever the camera's doing.
//   view   what's in the middle of the screen, { x, y, zoom } (a Camera works), so sheets move with
//          the map. it's drawn at the middle of the box, or at view.screenX, screenY if they're given
//          (an area only draws over its part of the screen, but the camera's middle is still the
//          screen's)
//   flash  how bright a flash is now (0 to 1)
//   area   null for the whole box. for an area (Atmosphere.drawArea()): { mask, x, y, w, h,
//          strength }, the picture of its soft edged shape and where that goes on the screen, and how
//          strong it is (0 to 1). fog, the overlay, tint and drained colour are cut to its shape, and
//          the edges and flashes are left to drawAtmosphereScreen()
function drawAtmosphere(a, x, y, w, h, view, flash = 0, area = null) {
  const ctx = drawingContext;
  ctx.save();
  // straight to game px, whatever transform it's inside (the camera's)
  const density = pixelDensity();
  ctx.setTransform(density, 0, 0, density, 0, 0);
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const time = millis() / 1000;
  for (const sheet of ['fog', 'overlay']) {
    if (a[`${sheet}Amount`] > 0) drawAtmosphereSheet(ctx, a, sheet, x, y, w, h, view, time, area);
  }
  // a colour over the whole box, or for an area, a small picture of the colour cut to its shape and
  // stretched over it
  const strength = area ? area.strength : 1;
  const wash = (colour, amount, op) => {
    const alpha = Math.min(1, amount) * strength;
    if (alpha <= 0) return;
    ctx.globalCompositeOperation = op;
    ctx.globalAlpha = alpha;
    if (!area) {
      ctx.fillStyle = colour;
      ctx.fillRect(x, y, w, h);
      return;
    }
    const pixel = ATMOSPHERE_AREA.washPixel;
    const bw = Math.ceil(w / pixel);
    const bh = Math.ceil(h / pixel);
    const buffer = atmosphereBuffer('wash', bw, bh);
    const b = buffer.getContext('2d');
    b.globalCompositeOperation = 'source-over';
    b.globalAlpha = 1;
    b.fillStyle = colour;
    b.clearRect(0, 0, bw, bh);
    b.fillRect(0, 0, bw, bh);
    cutToArea(b, area, x, y, pixel);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buffer, 0, 0, bw, bh, x, y, bw * pixel, bh * pixel);
  };
  wash(a.tintColour, (a.tintAmount / 100) * (1 + (a.flicker / 100) * atmosphereWobble(time * a.flickerSpeed)), a.tintMode);
  // grey through the saturation blend keeps everything's lightness and takes its colour
  wash('#808080', a.drain / 100, 'saturation');
  ctx.restore();
  if (!area) drawAtmosphereScreen(a, x, y, w, h, 1, flash);
}

// the parts of an atmosphere that are about the screen rather than the ground: the edges and flashes,
// over the box x, y, w, h (game px), strength (0 to 1) times as strong. an area's go by how far into
// it you are
function drawAtmosphereScreen(a, x, y, w, h, strength, flash) {
  const edges = (a.edgeAmount / 100) * strength;
  // a quick dip near the start makes a flash a double strike, like lightning
  // dimmer or none with the pause menu's Flashes turned down (config.js)
  const bright = ATMOSPHERE_FLASH.bright * (flash > 0.8 && flash < 0.88 ? 0.3 : flash) * GAME_SETTINGS.flashes;
  if (edges <= 0 && bright <= 0) return;
  const ctx = drawingContext;
  ctx.save();
  const density = pixelDensity();
  ctx.setTransform(density, 0, 0, density, 0, 0);
  if (edges > 0) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = Math.min(1, edges);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(atmosphereEdgePicture(a.edgeColour, a.edgeSize), x, y, w, h);
  }
  if (bright > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, bright);
    ctx.fillStyle = a.flashColour;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

// one sheet (fog or the overlay): its layers tiled onto a small canvas, then that stretched over the
// box in one go. each layer is smaller, nearer (more parallax) and, with churn, faster and going
// another way, which gives it depth and makes it swirl. an area's is cut to its shape first
function drawAtmosphereSheet(ctx, a, sheet, x, y, w, h, view, time, area) {
  const s = (key) => a[sheet + key];
  const pixel = a.pixel;
  const bw = Math.ceil(w / pixel);
  const bh = Math.ceil(h / pixel);
  const buffer = atmosphereBuffer(sheet, bw, bh);
  const b = buffer.getContext('2d');
  b.globalCompositeOperation = 'source-over';
  b.clearRect(0, 0, bw, bh);
  const pattern = b.createPattern(atmosphereTexture(s('Pattern'), s('Colour'), s('Cover'), s('Softness'), a.bands), 'repeat');
  b.fillStyle = pattern;
  const churn = s('Churn') / 100;
  // a camera's shake moves the map, so it moves the fog on it too
  const cx = view.x + (view.shakeX ?? 0);
  const cy = view.y + (view.shakeY ?? 0);
  // where the middle of the view is on the small canvas
  const middleX = (view.screenX ?? x + w / 2) - x;
  const middleY = (view.screenY ?? y + h / 2) - y;
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
    let ox = (middleX + (Math.cos(angle) * speed * time - cx * depth) * view.zoom) / pixel;
    let oy = (middleY + (Math.sin(angle) * speed * time - cy * depth) * view.zoom) / pixel;
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
  if (area) cutToArea(b, area, x, y, pixel);
  ctx.globalCompositeOperation = ATMOSPHERE_BLENDS[s('Blend')].op;
  ctx.globalAlpha = (s('Amount') / 100) * (area ? area.strength : 1);
  ctx.imageSmoothingEnabled = a.smooth;
  ctx.drawImage(buffer, 0, 0, bw, bh, x, y, bw * pixel, bh * pixel);
}

// keeps only the part of what's on b (a small canvas over the screen box at x, y, `pixel` game px
// each) that's inside the area's shape, fading out at its soft edge
function cutToArea(b, area, x, y, pixel) {
  b.globalCompositeOperation = 'destination-in';
  b.globalAlpha = 1;
  b.imageSmoothingEnabled = true;
  b.drawImage(area.mask, (area.x - x) / pixel, (area.y - y) / pixel, area.w / pixel, area.h / pixel);
  b.globalCompositeOperation = 'source-over';
}

// ---------- areas ----------
// an area is a box or oval of tiles on a map with an atmosphere of its own, on top of the map's: a
// foggy graveyard, heat over a lava pool, steam over a hot spring, a sunlit glade in a dark wood.
// its fog, overlay, tint and drained colour sit on the ground inside it (seen from outside too), and
// fade out over its last few tiles. its weather only falls inside it (particles.js), its sound comes
// from it (louder the nearer you are, using the sound's own Heard from), and its edges and flashes
// fill the screen by how far into it you are, so walking in feels like walking in.
// each map's areas are map.areas, each { atmosphere, col, row, cols, rows, shape, fade, strength }:
//   atmosphere  an ATMOSPHERES name. one that doesn't exist does nothing and shows red in the editor
//   col, row    its top left tile, and cols, rows how many tiles across and down
//   shape       'box' or 'oval' (ATMOSPHERE_AREA_SHAPES)
//   fade        tiles in from its edge it takes to fade in fully. 0 is a hard edge
//   strength    0 to 100, how strong all of it is
// they're made in the map editor (Triggers tab, area: drag over the map) and changed by right
// clicking inside one (AtmosphereAreas.edit(), below). saved as "areas" in the map file (mapfile.js)

const ATMOSPHERE_AREA = {
  // game px each pixel of an area's tint and drained colour picture covers. they're smooth colour,
  // so this can be coarse
  washPixel: 4,
  // the picture of an area's shape is this many px a tile, up to most px across
  maskPerTile: 8,
  maskMost: 256,
  // what a new area starts as
  fade: 2,
  strength: 100,
};

// an area's shapes and their words in the editor
const ATMOSPHERE_AREA_SHAPES = {
  box: 'a box',
  oval: 'an oval',
};

// an area's edges in world px
function areaBox(area) {
  return { left: area.col * TILE, top: area.row * TILE, right: (area.col + area.cols) * TILE, bottom: (area.row + area.rows) * TILE };
}

// 0 to 1, how far into the area the world spot x, y is: 0 outside, easing up to 1 by fade tiles in
// from its edge. its look, weather and sound all go by this
function areaAmount(area, x, y) {
  const halfW = (area.cols * TILE) / 2;
  const halfH = (area.rows * TILE) / 2;
  const dx = x - (area.col * TILE + halfW);
  const dy = y - (area.row * TILE + halfH);
  // px in from the edge. an oval's is measured as if it were a circle the size of its narrower side,
  // close enough for a soft edge
  const inside = area.shape === 'oval'
    ? (1 - Math.hypot(dx / halfW, dy / halfH)) * Math.min(halfW, halfH)
    : Math.min(halfW - Math.abs(dx), halfH - Math.abs(dy));
  if (inside <= 0) return 0;
  const fade = area.fade * TILE;
  if (inside >= fade) return 1;
  const t = inside / fade;
  return t * t * (3 - 2 * t);
}

// the spot in or on the edge of the area nearest the world spot x, y, put into `out` ({ x, y }), for
// where its sound comes from
function areaNearest(area, x, y, out) {
  const halfW = (area.cols * TILE) / 2;
  const halfH = (area.rows * TILE) / 2;
  const cx = area.col * TILE + halfW;
  const cy = area.row * TILE + halfH;
  let u = (x - cx) / halfW;
  let v = (y - cy) / halfH;
  if (area.shape === 'oval') {
    const r = Math.hypot(u, v);
    if (r > 1) {
      u /= r;
      v /= r;
    }
  } else {
    u = constrain(u, -1, 1);
    v = constrain(v, -1, 1);
  }
  out.x = cx + u * halfW;
  out.y = cy + v * halfH;
  return out;
}

// the picture of an area's shape: white, fading to see-through at its edge by areaAmount(), made once
// for each shape, size and fade and kept
const AtmosphereMasks = new Map();

function areaMask(area) {
  const key = `${area.shape} ${area.cols} ${area.rows} ${area.fade}`;
  let canvas = AtmosphereMasks.get(key);
  if (canvas) return canvas;
  const { maskPerTile, maskMost } = ATMOSPHERE_AREA;
  const w = Math.min(maskMost, area.cols * maskPerTile);
  const h = Math.min(maskMost, area.rows * maskPerTile);
  canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(w, h);
  // the same area at tile 0, 0, so each pixel's middle is a spot in it
  const local = { ...area, col: 0, row: 0 };
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      pixels.data[i] = 255;
      pixels.data[i + 1] = 255;
      pixels.data[i + 2] = 255;
      pixels.data[i + 3] = Math.round(255 * areaAmount(local, ((px + 0.5) / w) * area.cols * TILE, ((py + 0.5) / h) * area.rows * TILE));
    }
  }
  ctx.putImageData(pixels, 0, 0);
  if (AtmosphereMasks.size >= 32) AtmosphereMasks.clear();
  AtmosphereMasks.set(key, canvas);
  return canvas;
}

// the map's atmosphere and its areas', while playing and editing
const Atmosphere = {
  // while AtmosphereEditor's box is open, { target, settings }: the map or area it's changing, and
  // the settings it shows there instead of its own. otherwise null
  preview: null,
  // how bright the map's flash is now, 0 to 1
  flash: 0,
  // each area's { flash, at, inside }: its flash, where its sound comes from ({ x, y, map }, moved
  // every frame, which Sound reads), and how far into it you are (0 to 1, from update())
  areaStates: new WeakMap(),

  // the atmosphere on map now, or null
  current(map) {
    return this.preview?.target === map ? this.preview.settings : ATMOSPHERES[map.atmosphere] ?? null;
  },

  // an area's, or null
  ofArea(area) {
    return this.preview?.target === area ? this.preview.settings : ATMOSPHERES[area.atmosphere] ?? null;
  },

  // unticked in the dev menu or the editor's View menu (debug.js), which hides everything here, weather
  // too
  hidden() {
    return Debug.showing() && !Debug.show.atmosphere;
  },

  // the map's atmosphere, or null while it's hidden. the weather reads this too (particles.js)
  showing(map) {
    return this.hidden() ? null : this.current(map);
  },

  // the map's areas that have an atmosphere, each as { area, a }, or none while hidden
  showingAreas(map) {
    if (this.hidden()) return [];
    return map.areas.map((area) => ({ area, a: this.ofArea(area) })).filter(({ a }) => a);
  },

  areaState(area) {
    let state = this.areaStates.get(area);
    if (!state) this.areaStates.set(area, state = { flash: 0, at: { x: 0, y: 0, map: null }, inside: 0 });
    return state;
  },

  // every frame (sketch.js): flashes, and looping sounds, which start whenever they aren't playing.
  // the map's plays from a spot on the map with no distance to fade over, so it's the same everywhere
  // on it, and Sound.update() stops it for being on another map once you leave (sound.js). an area's
  // plays from the spot in it nearest you. you is where you are, { x, y }: the player's feet, or the
  // middle of the screen in the editor
  update(map, dt, you) {
    this.flash = Math.max(0, this.flash - dt * ATMOSPHERE_FLASH.fade);
    const a = this.showing(map);
    if (a) {
      if (this.flashes(a, dt, 1)) this.flash = 1;
      // 0 volume would be stopped and started every frame
      if (!Editor.active && SOUNDS[a.sound] && a.soundVolume > 0) {
        const key = `atmosphere ${a.sound}`;
        if (!Sound.isPlaying(key)) playSound(a.sound, { x: 0, y: 0, map }, key, { loop: true, volume: a.soundVolume / 100, range: Infinity, doppler: 0 });
      }
    }
    for (const { area, a: own } of this.showingAreas(map)) {
      const state = this.areaState(area);
      state.flash = Math.max(0, state.flash - dt * ATMOSPHERE_FLASH.fade);
      state.inside = areaAmount(area, you.x, you.y) * (area.strength / 100);
      if (state.inside > 0 && this.flashes(own, dt, state.inside)) state.flash = 1;
      const sound = SOUNDS[own.sound];
      if (Editor.active || !sound || own.soundVolume <= 0) continue;
      areaNearest(area, you.x, you.y, state.at);
      state.at.map = map;
      if (!Sound.isPlaying(state) && Sound.volumeAt(state.at, sound.range) > 0) {
        playSound(own.sound, state.at, state, { loop: true, volume: (own.soundVolume / 100) * (area.strength / 100), doppler: 0 });
      }
    }
  },

  // whether a starts a flash this frame (its flashes a minute, on average), playing its sound volume
  // times as loud. nothing plays in the editor (Editor.open())
  flashes(a, dt, volume) {
    if (a.flashes <= 0 || randomBetween(0, 1) >= (a.flashes / 60) * dt) return false; // utils.js
    if (a.flashSound && !Editor.active) playSound(a.flashSound, null, null, { volume });
    return true;
  },

  // over the world (sketch.js), camera is the game's. areas go on top of the map's own
  draw(camera, map) {
    const a = this.showing(map);
    if (a) drawAtmosphere(a, 0, 0, GAME_W, GAME_H, camera, this.flash);
    const areas = this.showingAreas(map);
    if (areas.length === 0) return;
    // what's in the middle of the screen, for areas, which only draw over their part of it
    const view = { x: camera.x, y: camera.y, zoom: camera.zoom, shakeX: camera.shakeX, shakeY: camera.shakeY, screenX: GAME_W / 2, screenY: GAME_H / 2 };
    for (const { area, a: own } of areas) this.drawArea(area, own, camera, view);
  },

  // an area's look over its part of the screen, if any of it's on screen, then its edges and flash by
  // how far into it you are
  drawArea(area, a, camera, view) {
    const box = areaBox(area);
    const topLeft = camera.drawnPosition(box.left, box.top);
    const bottomRight = camera.drawnPosition(box.right, box.bottom);
    const x = Math.max(0, Math.floor(topLeft.x));
    const y = Math.max(0, Math.floor(topLeft.y));
    const w = Math.min(GAME_W, Math.ceil(bottomRight.x)) - x;
    const h = Math.min(GAME_H, Math.ceil(bottomRight.y)) - y;
    const state = this.areaState(area);
    if (w > 0 && h > 0) {
      const mask = { mask: areaMask(area), x: topLeft.x, y: topLeft.y, w: bottomRight.x - topLeft.x, h: bottomRight.y - topLeft.y, strength: area.strength / 100 };
      drawAtmosphere(a, x, y, w, h, view, 0, mask);
    }
    if (state.inside > 0) drawAtmosphereScreen(a, 0, 0, GAME_W, GAME_H, state.inside, state.flash * state.inside);
  },
};

// ---------- the editor's boxes ----------

// the box the map editor's Atmosphere button opens (editor.js), and an area's Edit atmosphere. it
// changes a copy (the draft), which the map or area shows while it's open (Atmosphere.preview), so
// Cancel leaves everything alone. Save puts it in ATMOSPHERES under its name and gives the map or area
// that atmosphere, and saving under a new name makes a copy. like particles there's no rename or
// delete, since maps name their atmospheres. do it by hand (the file and index.json)
const AtmosphereEditor = {
  // name: the ATMOSPHERES name to start on, or '' for none. target: the map (worldMap, sketch.js) or
  // one of its areas that it's for
  open(name, target = worldMap) {
    const forMap = target === worldMap;
    const draft = { ...ATMOSPHERE_DEFAULTS, ...ATMOSPHERES[name] };
    delete draft.name;
    Atmosphere.preview = { target, settings: draft };
    const usePicker = new Picker({ w: 180, choices: ['', ...Object.keys(ATMOSPHERES)], value: name, label: sayAtmosphereSound, art: drawAtmosphereChoice });
    const nameField = new TextField({ w: 180, value: name });
    // set by Save and export, which saves like Save does and then exports
    let exporting = false;
    const fields = {};
    const what = forMap ? 'this map' : 'this area';
    const tabs = [{
      label: 'Main',
      rows: [
        { label: 'Atmosphere', field: usePicker, tip: `Which one ${what} uses. Picking another starts on that one` },
        { label: 'Save as', field: nameField, tip: `Saving under a new name makes a copy. Left empty, ${what} has no atmosphere` },
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
      tip: 'Saves, then downloads the files of new or changed atmospheres for atmospheres/. Save the map too (Ctrl + S), so it remembers which one it uses',
    });

    FormBox.open({
      title: forMap ? `Atmosphere of ${worldMap.name}` : 'Atmosphere of an area',
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
          this.open(usePicker.value, target);
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
        target.atmosphere = saved;
        if (exporting) DataFiles.export(['atmosphere']);
      },
    });
  },
};

// the colours of areas in the editor
const AREA_COLOURS = {
  edge: '#7fd6c2',
  fill: 'rgba(127, 214, 194, 0.07)',
  // its atmosphere isn't loaded
  broken: '#ff6b6b',
};

const AtmosphereAreas = {
  // the area being dragged out on the map (Triggers tab, area): { from, to } tiles, or null
  drawing: null,

  // starts dragging one out from a tile (its place() in TRIGGER_TYPES, editor.js)
  start(col, row) {
    this.drawing = { from: { col, row }, to: { col, row } };
  },

  // while dragging, every frame from Editor.update(): follows the mouse's tile (over, null off the
  // map), and once the mouse is let go makes the area and opens its settings
  update(map, over) {
    if (!this.drawing) return;
    if (over) this.drawing.to = over;
    if (Input.mouseHeld('left')) return;
    const { from, to } = this.drawing;
    this.drawing = null;
    const area = {
      // the last one made's, so a few of the same go quickly
      atmosphere: map.areas.at(-1)?.atmosphere ?? Object.keys(ATMOSPHERES)[0] ?? '',
      col: Math.min(from.col, to.col),
      row: Math.min(from.row, to.row),
      cols: Math.abs(to.col - from.col) + 1,
      rows: Math.abs(to.row - from.row) + 1,
      shape: 'box',
      fade: ATMOSPHERE_AREA.fade,
      strength: ATMOSPHERE_AREA.strength,
    };
    map.areas.push(area);
    this.edit(map, area);
  },

  // the area to open with a right click on a tile: the last one made that covers it
  at(map, col, row) {
    return map.areas.findLast((area) => col >= area.col && col < area.col + area.cols && row >= area.row && row < area.row + area.rows) ?? null;
  },

  // an area's settings. changes show on the map as you make them, and Cancel puts it back
  edit(map, area) {
    const before = { ...area };
    const atmospherePicker = new Picker({ w: 180, choices: [...new Set(['', ...Object.keys(ATMOSPHERES), area.atmosphere])], value: area.atmosphere, label: (name) => (!name ? 'none' : ATMOSPHERES[name] ? name : `${name} (missing)`), art: drawAtmosphereChoice });
    const shapePicker = new Picker({ w: 180, choices: Object.keys(ATMOSPHERE_AREA_SHAPES), value: area.shape, label: (shape) => ATMOSPHERE_AREA_SHAPES[shape] });
    const fadeSlider = rowSlider({ min: 0, max: 20, step: 0.5, unit: 'tiles' }, area.fade, ATMOSPHERE_AREA.fade); // formbox.js
    const strengthSlider = rowSlider({ min: 0, max: 100, unit: '%' }, area.strength, ATMOSPHERE_AREA.strength);
    const number = (value, min) => new NumberField({ w: 90, value, min, max: EDITOR_MAX_MAP_SIZE }); // editor.js
    const place = { col: number(area.col, -EDITOR_MAX_MAP_SIZE), row: number(area.row, -EDITOR_MAX_MAP_SIZE), cols: number(area.cols, 1), rows: number(area.rows, 1) };
    let removed = false;
    const button = (label, onClick) => new Button({ w: 180, label, style: 'editor', onClick });
    FormBox.open({
      title: 'Atmosphere area',
      hint: 'Changes show on the map as you make them',
      confirmLabel: 'Save',
      tabs: [
        {
          label: 'Area',
          rows: [
            { label: 'Atmosphere', field: atmospherePicker, tip: 'Its fog, colour, weather and sound, on top of the map\'s. Any atmosphere works, like the whole map ones' },
            { label: 'Shape', field: shapePicker, tip: 'A box, or an oval that fits in it (round pools, clearings)' },
            { label: 'Fade', field: fadeSlider, tip: 'How many tiles in from its edge it takes to fade in fully. 0 is a hard edge' },
            { label: 'Strength', field: strengthSlider, tip: 'How strong all of it is, so one atmosphere can be faint in one place and thick in another' },
            {
              label: '',
              field: button('Edit atmosphere', () => {
                // saves this box first, so the area keeps the atmosphere picked here
                FormBox.confirm();
                AtmosphereEditor.open(area.atmosphere, area);
              }),
              tip: 'Change the atmosphere itself (every area and map using it changes), or make a new one for this area',
            },
            {
              label: '',
              field: button('Delete area', () => {
                removed = true;
                map.areas = map.areas.filter((other) => other !== area);
                FormBox.close();
              }),
              tip: 'Takes the area off the map',
            },
          ],
        },
        {
          label: 'Where',
          rows: [
            { label: 'Left', field: place.col, after: 'tile', tip: 'The column of its left edge' },
            { label: 'Top', field: place.row, after: 'tile', tip: 'The row of its top edge' },
            { label: 'Width', field: place.cols, after: 'tiles', tip: 'How many tiles across' },
            { label: 'Height', field: place.rows, after: 'tiles', tip: 'How many tiles down' },
          ],
        },
      ],
      onUpdate: () => Object.assign(area, {
        atmosphere: atmospherePicker.value,
        shape: shapePicker.value,
        fade: fadeSlider.value,
        strength: strengthSlider.value,
        col: place.col.value,
        row: place.row.value,
        cols: place.cols.value,
        rows: place.rows.value,
      }),
      onCancel: () => {
        if (!removed) Object.assign(area, before);
      },
      // it's already changed (onUpdate)
      onConfirm: () => {},
    });
  },

  // every area on the map, in world positions (Editor.drawCursor()), plus the one being dragged out.
  // px is one screen pixel
  drawAll(map, px) {
    for (const area of map.areas) drawAreaMarker(area, px);
    if (!this.drawing) return;
    const { from, to } = this.drawing;
    const col = Math.min(from.col, to.col);
    const row = Math.min(from.row, to.row);
    drawAreaMarker({ atmosphere: '', col, row, cols: Math.abs(to.col - from.col) + 1, rows: Math.abs(to.row - from.row) + 1, shape: 'box', fade: 0 }, px);
  },
};

// an area's outline (dashed, box or oval) in the editor, with a fainter one where it's fully faded
// in, and its atmosphere's name. red if that isn't loaded
function drawAreaMarker(area, px) {
  const box = areaBox(area);
  const colour = area.atmosphere && !ATMOSPHERES[area.atmosphere] ? AREA_COLOURS.broken : AREA_COLOURS.edge;
  const ctx = drawingContext;
  const outline = (inset) => {
    const w = box.right - box.left - inset * 2;
    const h = box.bottom - box.top - inset * 2;
    if (w <= 0 || h <= 0) return;
    if (area.shape === 'oval') ellipse(box.left + inset + w / 2, box.top + inset + h / 2, w, h);
    else rect(box.left + inset, box.top + inset, w, h);
  };
  push();
  fill(AREA_COLOURS.fill);
  stroke(colour);
  strokeWeight(2 * px);
  ctx.setLineDash([6 * px, 4 * px]);
  outline(0);
  if (area.fade > 0) {
    noFill();
    strokeWeight(px);
    ctx.setLineDash([2 * px, 4 * px]);
    outline(area.fade * TILE);
  }
  ctx.setLineDash([]);
  // its name, with a dark outline so it shows up on anything (like a warp's)
  fill(255);
  stroke(0, 0, 0, 200);
  strokeWeight(3 * px);
  setText(10, BOLD, LEFT, BOTTOM);
  text(area.atmosphere ? (ATMOSPHERES[area.atmosphere] ? area.atmosphere : `${area.atmosphere} (missing)`) : 'area', box.left + 2, box.top - 2);
  pop();
}

// the area's picture in the editor's palette (Triggers tab): a dashed box with fog in it
function drawAreaArt(x, y, size) {
  const inset = size * 0.18;
  push();
  fill(AREA_COLOURS.fill);
  stroke(AREA_COLOURS.edge);
  strokeWeight(1.5);
  drawingContext.setLineDash([4, 3]);
  rect(x + inset, y + inset, size - inset * 2, size - inset * 2, 3);
  drawingContext.setLineDash([]);
  noStroke();
  fill(255, 255, 255, 70);
  ellipse(x + size * 0.42, y + size * 0.55, size * 0.4, size * 0.2);
  ellipse(x + size * 0.58, y + size * 0.45, size * 0.36, size * 0.18);
  pop();
}

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
