// what every check shares: loading game files into node the way the page does, and reading data files.
//
// load(files, fakes) runs the files (names in js/squimble-quest/, in the order squimble-quest.html
// would) in one shared sandbox, like the page's globals, and gives the sandbox back. fakes are in it
// first: the bits of p5, the browser or other game files a check doesn't load (TILE, playSound...),
// which the files then read as globals. const, let and class at the top of a file don't end up on the
// sandbox by themselves (functions do), so every one is copied onto it, and a check can just do
//   const { Character, PLAYER } = load(['config.js', 'utils.js', 'weapons.js', 'character.js']);
// a copied let is what it was once the files had run. to change one the files read later (like
// makerRandom in sound-check.js), set it inside with vm.runInContext(code, sandbox).
//
// loadFighting() is load() for checks of characters and weapons, and FLAT_FLOOR a map to fight on.
// asset(path) reads a json file from assets/squimble-quest/, and assetFolder(folder) the files of a
// DATA_KINDS folder (datafiles.js) as [name, settings] pairs in index.json order
const fs = require('fs');
const vm = require('vm');

const ASSETS = `${__dirname}/../../../assets/squimble-quest/`;

// the sandbox is fakes itself, so changing a fake afterwards (sandbox.worldMap = ...) changes it for
// the game too
function load(files, fakes = {}) {
  fakes.console ??= console;
  const sandbox = vm.createContext(fakes);
  const code = files.map((file) => fs.readFileSync(`${__dirname}/../${file}`, 'utf8')).join('\n');
  const names = [...code.matchAll(/^(?:const|let|class) ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  vm.runInContext(`${code}\n${names.map((name) => `this.${name} = ${name};`).join('\n')}`, sandbox, { filename: files.join(' + ') });
  return sandbox;
}

// characters and weapons on their own (character.js, weapons.js), for checks of fighting and moving.
// tiles have nothing pushing (PUSH_DIRECTIONS) and sounds play nowhere unless fakes says otherwise
function loadFighting(fakes = {}, more = []) {
  return load(['config.js', 'utils.js', 'weapons.js', 'character.js', ...more], { PUSH_DIRECTIONS: {}, SLIPPERY_GRIP: 10, playSound: () => null, worldMap: null, ...fakes });
}

// a flat endless floor with nothing in the way, like PREVIEW_FLOOR (weaponeditor.js), for a
// character's world.map
const FLAT_FLOOR = { get: () => ({ speed: 1 }), colAt: () => 0, rowAt: () => 0, moveAlongX: (b, dx) => dx, moveAlongY: (b, dy) => dy, clearLine: () => true, bounds: () => ({ top: -Infinity, bottom: Infinity }) };

function asset(path) {
  return JSON.parse(fs.readFileSync(`${ASSETS}${path}`, 'utf8'));
}

function assetFolder(folder) {
  return asset(`${folder}/index.json`).map((name) => [name, asset(`${folder}/${name}.json`)]);
}

// a png's pixels, as { w, h, alpha(x, y) }, for checks of the art itself. 8 bit colour, colour with
// see-through, or a palette (what most pixel art programs save), not interlaced
function readPng(path) {
  const zlib = require('zlib');
  const file = fs.readFileSync(path);
  let at = 8;
  let w, h, type, depth, interlace, trns;
  const data = [];
  while (at < file.length) {
    const len = file.readUInt32BE(at);
    const kind = file.toString('ascii', at + 4, at + 8);
    const body = file.subarray(at + 8, at + 8 + len);
    at += 12 + len;
    if (kind === 'IHDR') [w, h, depth, type, interlace] = [body.readUInt32BE(0), body.readUInt32BE(4), body[8], body[9], body[12]];
    if (kind === 'tRNS') trns = body;
    if (kind === 'IDAT') data.push(body);
  }
  const channels = { 2: 3, 3: 1, 6: 4 }[type];
  if (depth !== 8 || !channels || interlace) throw new Error(`${path}: save it as an 8 bit, non-interlaced png (rgb, rgba or a palette) for the checks to read it`);
  const raw = zlib.inflateSync(Buffer.concat(data));
  const row = w * channels;
  const px = Buffer.alloc(row * h);
  // undo each row's filter (the png spec's none, sub, up, average, paeth)
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (row + 1)];
    for (let x = 0; x < row; x++) {
      const a = x >= channels ? px[y * row + x - channels] : 0;
      const b = y > 0 ? px[(y - 1) * row + x] : 0;
      const c = x >= channels && y > 0 ? px[(y - 1) * row + x - channels] : 0;
      const p = a + b - c;
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      px[y * row + x] = raw[y * (row + 1) + 1 + x] + [0, a, b, (a + b) >> 1, paeth][filter];
    }
  }
  const alpha = (x, y) => {
    const i = (y * w + x) * channels;
    if (type === 6) return px[i + 3];
    if (type === 3) return trns && px[i] < trns.length ? trns[px[i]] : 255;
    return 255;
  };
  return { w, h, alpha };
}

module.exports = { load, loadFighting, FLAT_FLOOR, asset, assetFolder, ASSETS, readPng };
