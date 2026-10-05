// saving and loading map files (the guide is assets/squimble-quest/maps/README.md). they're json. the
// tiles are rows of short codes so you can see the map's shape in the file, and objects (objects.js)
// are a list, since they can share tiles and cover more than one:
//
//   {
//     "format": "squimble-quest-map",
//     "version": 2,
//     "left": -20,                          left edge column (tile coords)
//     "top": -12,                           top edge row
//     "spawn": { "x": 0, "y": 0 },          player start, world pixels
//     "legend": {                           code: tile
//       "..": null,                         always empty
//       "gr": "grass",
//       "wa": "wall"
//     },
//     "rows": [                             tiles, top row first, codes split by spaces
//       "wa wa wa wa wa",
//       "wa gr gr gr wa",
//       "wa gr .. gr wa"
//     ],
//     "objects": [                          each one's top left tile
//       { "type": "table", "col": -1, "row": -11 }
//     ],
//     "enemies": [                          start tiles (enemies.js), ai only if picked (ENEMY_AIS)
//       { "type": "dummy", "col": 3, "row": -3 },
//       { "type": "grunt", "col": 6, "row": -3, "ai": "careful" }
//     ],
//     "npcs": [                             start tiles (npcs.js)
//       { "type": "villager", "col": -3, "row": -3 }
//     ],
//     "warps": [                            (warps.js)
//       { "name": "hut", "col": -11, "row": -5, "to": "hut", "toWarp": "exit", "activate": "interact", "enemies": true }
//     ],
//     "sounds": [                           sound blocks (soundblocks.js), only non-default settings
//       { "wave": "pulse", "col": 2, "row": 4, "activate": "step", "pitch": 988, "slideTo": 1976 }
//     ]
//   }
//
// exported codes are 2 characters taken from the tile's name where possible (gr for grass, wt for
// water because wa is already wall), so there are thousands to go round. codes typed by hand can be
// any length, as long as they're split by spaces.
// version 1 files (one character per tile, no spaces, no objects) still load.
// a map's name is its file name, so forest.json is "forest"

const MAP_FORMAT = 'squimble-quest-map';
const MAP_VERSION = 2;

const EMPTY_CODE = '..';
// used for codes when the tile's name doesn't give a free one
const CODE_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ---------- map to file data ----------

function mapToData(map) {
  // a code for each kind of tile the map uses
  const legend = { [EMPTY_CODE]: null };
  const codeFor = {};
  for (const name of new Set(map.tiles)) {
    if (name === null) continue;
    const code = makeTileCode(name, legend);
    legend[code] = name;
    codeFor[name] = code;
  }

  const rows = [];
  for (let r = 0; r < map.rows; r++) {
    const codes = [];
    for (let c = 0; c < map.cols; c++) {
      const name = map.tiles[r * map.cols + c];
      codes.push(name === null ? EMPTY_CODE : codeFor[name]);
    }
    rows.push(codes.join(' '));
  }

  const data = {
    format: MAP_FORMAT,
    version: MAP_VERSION,
    left: map.left,
    top: map.top,
    spawn: { x: map.spawn.x, y: map.spawn.y },
    legend,
    rows,
    objects: map.objects.map((obj) => ({ type: obj.type, col: obj.col, row: obj.row })),
  };
  // "enemies" and "npcs" (SPAWN_KINDS in tilemap.js)
  for (const info of Object.values(SPAWN_KINDS)) {
    // ai only goes in if one was picked (JSON leaves out undefined)
    data[info.fileKey] = map[info.list].map(({ type, col, row, ai }) => ({ type, col, row, ai }));
  }
  data.warps = map.warps.map(({ name, col, row, to, toWarp, activate, enemies }) => ({ name, col, row, to, toWarp, activate, enemies }));
  data.sounds = map.sounds.map(soundBlockToData);
  return data;
}

// a sound block as file data. the wave goes first so mapDataToText() squashes it onto one line, then
// its tile and how it plays, then only the sound settings that aren't the default (sound.js)
function soundBlockToData({ col, row, activate, sound }) {
  const entry = { wave: sound.wave, col, row, activate };
  for (const [key, value] of Object.entries(SOUND_DEFAULTS)) {
    if (key !== 'wave' && sound[key] !== value) entry[key] = sound[key];
  }
  return entry;
}

// a 2 character code that isn't in the legend yet. it tries the first letter plus each other letter
// (grass gives gr, ga, gs...), then the first letter plus anything, then any pair at all (over 3,800,
// so it won't run out)
function makeTileCode(name, legend) {
  const letters = name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'x';
  const first = letters[0];
  const options = [];
  for (const c of letters.slice(1)) options.push(first + c);
  for (const c of CODE_CHARACTERS) options.push(first + c);
  for (const a of CODE_CHARACTERS) {
    for (const b of CODE_CHARACTERS) options.push(a + b);
  }
  return options.find((code) => !(code in legend));
}

// ---------- file data to map ----------

// throws an error you can read if the data isn't a map, so the loader can show it
function mapFromData(data) {
  if (!data || !Array.isArray(data.rows) || typeof data.legend !== 'object') {
    throw new Error("this doesn't look like a Squimble Quest map file");
  }

  // splits the rows into codes. version 1 had one character per tile and no spaces
  const oldFormat = (data.version ?? 1) < 2;
  const grid = data.rows.map((line) => (oldFormat ? [...line] : line.trim().split(/\s+/)));

  const rows = grid.length;
  const cols = Math.max(0, ...grid.map((codes) => codes.length));
  if (rows === 0 || cols === 0) throw new Error('the map has no tiles in it');

  const map = new TileMap(data.left ?? 0, data.top ?? 0, cols, rows, null);
  if (data.spawn) map.spawn = { x: data.spawn.x, y: data.spawn.y };
  // older files might have a "showGrid" that isn't used any more (the grid is dev mode only now)

  // anything it doesn't know (like a tile that got renamed in tiles.json) gets left out, with one
  // warning that lists them all
  const unknown = new Set();

  grid.forEach((codes, r) => {
    for (let c = 0; c < cols; c++) {
      // short rows get padded with empty tiles
      const code = codes[c];
      const name = code === undefined ? null : data.legend[code];
      if (name === undefined) {
        unknown.add(`code "${code}" (not in the legend)`);
      } else if (name !== null && !TILE_TYPES[name]) {
        unknown.add(`tile "${name}"`);
      } else {
        map.set(map.left + c, map.top + r, name);
      }
    }
  });

  for (const obj of data.objects ?? []) {
    if (!OBJECT_TYPES[obj.type]) {
      unknown.add(`object "${obj.type}"`);
      continue;
    }
    map.addObject(obj.type, obj.col, obj.row);
  }

  // "enemies" and "npcs". older maps don't have them
  for (const [kind, info] of Object.entries(SPAWN_KINDS)) {
    for (const spawn of data[info.fileKey] ?? []) {
      if (!info.types[spawn.type]) {
        unknown.add(`${kind} "${spawn.type}"`);
        continue;
      }
      map.addSpawn(kind, spawn.type, spawn.col, spawn.row, spawn.ai);
    }
  }

  // "warps", which older maps don't have either. only the name and tile are needed. with no "to" it
  // goes nowhere (you can only arrive there), with no "toWarp" you arrive at the spawn, anything that
  // isn't "interact" counts as step, and enemies only follow with "enemies": true (warps.js)
  for (const warp of data.warps ?? []) {
    if (typeof warp.name !== 'string' || !Number.isInteger(warp.col) || !Number.isInteger(warp.row)) {
      unknown.add(`a warp without a name, col or row`);
      continue;
    }
    map.warps.push({
      name: warp.name,
      col: warp.col,
      row: warp.row,
      to: warp.to ?? '',
      toWarp: warp.toWarp ?? '',
      activate: warp.activate === 'interact' ? 'interact' : 'step',
      enemies: warp.enemies === true,
    });
  }

  // "sounds", which older maps don't have. only the tile is needed: how it plays defaults to step, and
  // any missing sound settings get their default (soundSettings() in sound.js)
  for (const entry of data.sounds ?? []) {
    if (!Number.isInteger(entry.col) || !Number.isInteger(entry.row)) {
      unknown.add('a sound block without a col or row');
      continue;
    }
    map.sounds.push({
      col: entry.col,
      row: entry.row,
      activate: Object.hasOwn(SOUND_BLOCK_ACTIVATE, entry.activate) ? entry.activate : 'step',
      sound: soundSettings(entry),
    });
  }

  if (unknown.size > 0) {
    console.warn(`This map has things the game doesn't know, so they've been left out: ${[...unknown].join(', ')}.`);
  }
  return map;
}

// adds a map to MAPS (maps.js) from file data, or replaces it. gives true if it worked
function registerMap(name, data) {
  // build it once now to check it's ok
  let checked;
  try {
    checked = mapFromData(data);
  } catch (err) {
    console.warn(`Couldn't use the map "${name}": ${err.message}`);
    return false;
  }
  // the first build reuses the map that was just checked (so no building it twice or repeating the
  // warnings), and after that it builds a fresh one each time
  addMap(name, () => {
    const map = checked ?? mapFromData(data);
    checked = null;
    return map;
  });
  return true;
}

// ---------- the maps folder ----------

// loads every map in MAP_FILES (maps.js), once at the start. the promise finishes when they've all
// loaded or failed. any that fail get skipped with a console warning
function loadMapFiles() {
  // downloads them all at once (fetchJson() in utils.js), null for any that fail
  const loads = MAP_FILES.map((file) => fetchJson(MAP_FOLDER + file).catch((err) => {
    console.warn(`Couldn't load the map file "${file}": ${err.message}.`);
    return null;
  }));

  // added in MAP_FILES order rather than whichever finished first, so dev mode's M order never changes
  return Promise.all(loads).then((results) => {
    results.forEach((data, i) => {
      if (data) registerMap(mapNameFromFile(MAP_FILES[i]), data);
    });
  });
}

// ---------- export and open (map editor buttons) ----------

// downloads the map as cleanMapName(typedName).json. the map takes that name until you reload, so M
// comes back to it as it is now. a new name works like "save as": this map becomes the new one, and
// the old name gets rebuilt from its own file next time
function exportMap(map, typedName) {
  const name = cleanMapName(typedName);
  // the editor already stops this from happening, this is just in case
  if (!name) return;

  const data = mapToData(map);
  registerMap(name, data);
  // forget the old name too, otherwise both names would point at this map (maps.js)
  if (map.name !== name && VISITED_MAPS[map.name] === map) delete VISITED_MAPS[map.name];
  VISITED_MAPS[name] = map;
  map.name = name;

  downloadTextFile(`${name}.json`, mapDataToText(data));
}

// lets you pick a map file (pickFile() in utils.js) and goes to it
function openMapFile() {
  pickFile('.json,application/json', (file) => {
    file.text()
      .then((text) => {
        const name = mapNameFromFile(file.name);
        if (!registerMap(name, JSON.parse(text))) throw new Error('see the browser console for why');
        loadMap(name); // in sketch.js
      })
      // shown in game (hud.js), and in the console too in case it's long
      .catch((err) => {
        showMessage(`Couldn't open ${file.name}`);
        console.warn(`Couldn't open ${file.name}: ${err.message}`);
      });
  });
}

// ---------- small helpers ----------

// the text of a map file: json with 2 space indents (one tile row per line), with each object, enemy,
// npc, warp and sound block squashed onto one line so long lists are still easy to read
function mapDataToText(data) {
  return JSON.stringify(data, null, 2)
    // an object, character, warp or sound block is a { } starting with "type", "name" or "wave" with
    // only plain values in it
    .replace(/\{\s+("(?:type|name|wave)":[^{}[\]]*?)\s+\}/g, (match, inside) => `{ ${inside.replace(/,\s+/g, ', ')} }`)
    + '\n';
}

// turns "My Forest!" into "my-forest", so it's safe to use as a file name
function cleanMapName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

// turns "forest.json" into "forest"
function mapNameFromFile(fileName) {
  return cleanMapName(fileName.replace(/\.json$/i, ''));
}

