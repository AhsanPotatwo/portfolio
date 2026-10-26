// pictures for everything: characters, objects, items, weapons' effects and the ui all use this one
// format, loaded and drawn here. everything works without them (drawn shapes and colours), so art can be
// added one thing at a time, and a picture that's missing or broken just leaves the shape (the editor's
// Map > Art report and the console say why).
//
// ============================== how to give something a picture ==============================
//
// a picture setting (like an enemy's "image", or UI_ART.slot in config.js) is either a file, as a path
// from the site's root:
//   "image": "assets/squimble-quest/enemies/grunt.png"
// or a sheet of frames, a grid with a frame per column and a direction per row:
//   "walkImage": { "image": "assets/squimble-quest/enemies/grunt-walk.png", "frames": 6, "fps": 10, "directions": 4 }
//
//   image       the file
//   frames      how many pictures across, played left to right (1)
//   fps         frames a second (8)
//   loop        start again after the last frame (true), or stay on it (false: attacks, dying)
//   directions  how many rows: 1 (the same whichever way it faces), 4 (down, left, right, up) or 8
//               (down, down left, left, up left, up, up right, right, down right)
//   mirror      with 1 direction, drawn flipped when it faces left, so draw it facing right (false)
//   scale       how many game px each picture px is (ART_SCALE in config.js, 1 for 32 px tiles, 2 if
//               the art is drawn at 16 px a tile)
//   edge        for ui boxes: px round the edge that keep their size while the middle stretches, so
//               one picture fits any size of box (a nine slice). 0 stretches the whole picture
//
// pictures are drawn at their own size (times scale), never stretched to a hitbox or a tile, with:
//   characters, objects, worn things, remains  their bottom middle on the feet (or the object's base)
//   swings and jabs (swingImage)               their left middle on the attacker, pointing right, turned
//                                              to the aim (and flipped for backhand swings)
//   arrows (arrowImage)                        their middle on the arrow, pointing right, turned to its
//                                              flight
//   the crosshair, icons                       their middle on the spot
// the one exception is tiles, which have their own textures (tiles.js) and always fill their tile.
//
// every setting that takes a picture is listed in PICTURE_SETTINGS below, and each kind's guide (atop
// enemies.js, items.js, objects.js...) says which it has. tests/catalogue-check.js checks the files
// are there and the sheets make sense.
//
// =============================================================================================

// what a picture setting's sheet settings are when they're left out (see above)
const PICTURE_DEFAULTS = { image: null, frames: 1, fps: 8, loop: true, directions: 1, mirror: false, scale: null, edge: 0 };

// every setting name that holds a picture, in any kind of data (PLAYER and RARITIES too).
// prepareArt() (utils.js) starts loading these when a kind loads, and catalogue-check.js checks them
const PICTURE_SETTINGS = [
  // characters (PLAYER, enemies, npcs): standing still, then what it's doing (characterArt(), character.js)
  'image', 'walkImage', 'attackImage', 'hurtImage', 'rollImage', 'deathImage',
  // npcs' face in the talking box (dialogue.js)
  'portrait',
  // an object with storage while it's open (objects.js), an item worn on a character (items.js)
  'openImage', 'wornImage',
  // a weapon's sweep or thrust, and its arrows (weapons.js)
  'swingImage', 'arrowImage',
];

// what's wrong with a picture setting, as a sentence, or null if nothing is. getArt() warns with it and
// tests/catalogue-check.js fails on it
function pictureProblem(setting) {
  if (setting === null || setting === undefined || typeof setting === 'string') return null;
  if (typeof setting !== 'object' || Array.isArray(setting)) return 'should be a file name or { "image": ... } (art.js)';
  if (typeof setting.image !== 'string') return 'needs an "image", the file';
  const unknown = Object.keys(setting).find((key) => !(key in PICTURE_DEFAULTS));
  if (unknown) return `has a setting "${unknown}" that pictures don't have (art.js)`;
  for (const key of ['frames', 'directions']) {
    if (setting[key] !== undefined && !(Number.isInteger(setting[key]) && setting[key] > 0)) return `has ${key} ${setting[key]}, which should be a whole number above 0`;
  }
  if (setting.directions !== undefined && ![1, 4, 8].includes(setting.directions)) return `has ${setting.directions} directions, which should be 1, 4 or 8`;
  return null;
}

// loaded pictures by setting (as text), so the same picture is only loaded once however many things use
// it. mapcheck.js's Art report looks through it for sheets that don't divide up
const ART_CACHE = new Map();

// the loaded picture for a setting: { img, frames, fps, loop, directions, mirror, scale, edge, kind,
// name } with img a p5 image (1 x 1 until it's loaded, null if it failed), or null for no picture.
// loads it the first time it's asked for. kind and name say whose it is, for the warnings and the Art
// report (the first thing to ask for it)
function getArt(setting, kind = 'picture', name = '') {
  if (!setting) return null;
  const key = typeof setting === 'string' ? setting : JSON.stringify(setting);
  if (ART_CACHE.has(key)) return ART_CACHE.get(key);
  const problem = pictureProblem(setting);
  if (problem) {
    console.warn(`The ${kind} "${name}" has a picture that ${problem}, so it's drawn without it`);
    ART_CACHE.set(key, null);
    return null;
  }
  const art = { ...PICTURE_DEFAULTS, ...(typeof setting === 'string' ? { image: setting } : setting), still: null, kind, name };
  art.scale ??= ART_SCALE; // config.js
  art.img = loadImage(art.image, undefined, () => {
    artProblem(kind, name, art.image, "couldn't load, so it's drawn without it"); // utils.js
    art.img = null;
  });
  ART_CACHE.set(key, art);
  return art;
}

// its size on screen in game px (one frame, times its scale), or null until it's loaded
function artDrawnSize(art) {
  if (!artLoaded(art)) return null;
  const { w, h } = frameSize(art);
  return { w: w * art.scale, h: h * art.scale };
}

// has it loaded? (p5 gives back a 1 x 1 picture until then)
function artLoaded(art) {
  return Boolean(art?.img && art.img.width > 1);
}

// one frame's size in picture px
function frameSize(art) {
  return { w: art.img.width / art.frames, h: art.img.height / art.directions };
}

// which frame `seconds` in, and which row for a { x, y } facing (Character.facing)
function artFrame(art, seconds) {
  const frame = Math.floor(Math.max(0, seconds) * art.fps);
  return art.loop ? frame % art.frames : Math.min(art.frames - 1, frame);
}

function artRow(art, facing) {
  if (art.directions === 1 || !facing) return 0;
  if (art.directions === 4) {
    // diagonals use left and right
    if (facing.x !== 0) return facing.x < 0 ? 1 : 2;
    return facing.y < 0 ? 3 : 0;
  }
  // 8: clockwise from down
  const eighth = Math.round(Math.atan2(facing.y, facing.x) / (Math.PI / 4));
  return (((eighth - 2) % 8) + 8) % 8;
}

// how long a sheet that doesn't loop takes to play, in seconds (0 for a single picture)
function artLength(art) {
  return art && art.frames > 1 ? art.frames / art.fps : 0;
}

// draws a picture at x, y. gives back false if there's no picture or it failed, so the caller can draw
// its shape instead (one that's still loading counts as drawn, so shapes don't flash up first).
//   anchor  where x, y is on the picture: 'bottom' (bottom middle), 'centre', 'start' (left middle) or
//           'end' (right middle, an arrow's tip)
//   time    seconds into its animation
//   facing  { x, y } for the row (artRow())
//   angle   radians to turn it by, round x, y
//   sx, sy  stretch, 1 is its own size (a hit squashes a character, Character.drawBody())
//   flipY   drawn upside down, for backhand swings
function drawArt(art, x, y, { anchor = 'bottom', time = 0, facing = null, angle = 0, sx = 1, sy = 1, flipY = false } = {}) {
  if (!art?.img) return false;
  if (!artLoaded(art)) return true;
  const { w: fw, h: fh } = frameSize(art);
  const w = fw * art.scale * sx;
  const h = fh * art.scale * sy;
  const left = anchor === 'start' ? 0 : anchor === 'end' ? -w : -w / 2;
  const top = anchor === 'bottom' ? -h : -h / 2;
  const flipX = art.mirror && art.directions === 1 && facing?.x < 0;
  push();
  translate(Math.round(x), Math.round(y));
  if (angle) rotate(angle);
  if (flipX || flipY) scale(flipX ? -1 : 1, flipY ? -1 : 1);
  image(art.img, Math.round(left), Math.round(top), Math.round(w), Math.round(h), artFrame(art, time) * fw, artRow(art, facing) * fh, fw, fh);
  pop();
  return true;
}

// the first frame (facing down) as its own p5 image, for things that show a still: icons, the editor's
// palette, particles cut from a picture. the whole picture for a single one. null until it's loaded
function artStill(art) {
  if (!artLoaded(art)) return art?.img ?? null;
  if (art.frames === 1 && art.directions === 1) return art.img;
  if (!art.still) {
    const { w, h } = frameSize(art);
    art.still = art.img.get(0, 0, w, h);
  }
  return art.still;
}

// a picture stretched over a box (ui: slots, panels, buttons), keeping its edge px round the outside
// their own size (times its scale) so the corners don't stretch. gives back false if there's no
// picture, like drawArt()
function drawArtBox(art, x, y, w, h, time = 0) {
  if (!art?.img) return false;
  if (!artLoaded(art)) return true;
  const { w: fw, h: fh } = frameSize(art);
  const sx = artFrame(art, time) * fw;
  const e = Math.min(art.edge, fw / 2, fh / 2);
  if (e <= 0) {
    image(art.img, x, y, w, h, sx, 0, fw, fh);
    return true;
  }
  // the edge in game px, never more than half the box
  const d = Math.min(e * art.scale, w / 2, h / 2);
  const xs = [x, x + d, x + w - d, x + w];
  const ys = [y, y + d, y + h - d, y + h];
  const us = [sx, sx + e, sx + fw - e, sx + fw];
  const vs = [0, e, fh - e, fh];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const dw = xs[i + 1] - xs[i];
      const dh = ys[j + 1] - ys[j];
      if (dw > 0 && dh > 0) image(art.img, xs[i], ys[j], dw, dh, us[i], vs[j], us[i + 1] - us[i], vs[j + 1] - vs[j]);
    }
  }
  return true;
}

// a UI_ART picture (config.js) by name, like uiArt('slot'), or null. wearIcons are uiArt('wearIcons', 'head')
function uiArt(name, part) {
  const setting = part === undefined ? UI_ART[name] : UI_ART[name]?.[part];
  return getArt(setting, 'ui', part === undefined ? name : `${name}.${part}`);
}

// starts loading every UI_ART and button style picture, from preload() (sketch.js), so the ui doesn't
// draw shapes for a moment first
function loadUiArt() {
  for (const [name, setting] of Object.entries(UI_ART)) {
    if (setting && typeof setting === 'object' && !('image' in setting)) {
      for (const part of Object.keys(setting)) uiArt(name, part);
    } else {
      uiArt(name);
    }
  }
  for (const [name, style] of Object.entries(BUTTON_STYLES)) {
    for (const key of ['art', 'hoverArt', 'pressedArt']) getArt(style[key], 'button style', `${name} ${key}`);
  }
}
