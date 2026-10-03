// saving and loading map files (guide: assets/squimble-quest/maps/README.md). json; tiles as rows of
// short codes so the shape is visible; objects (objects.js) as a list, since they can share and span tiles:
//
//   {
//     "format": "squimble-quest-map",
//     "version": 2,
//     "left": -20,                          left edge column (tile coords)
//     "top": -12,                           top edge row
//     "spawn": { "x": 0, "y": 0 },          player start, world pixels
//     "legend": {                           code → tile
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
//     ]
//   }
//
// exported codes are 2 characters from the tile's name where possible (gr grass, wt water since wa is
// wall), thousands possible. hand made codes can be any length, just space separated.
// version 1 files (one character per tile, no spaces, no objects) still load.
// map name = file name: forest.json is "forest"

const MAP_FORMAT = 'squimble-quest-map';
const MAP_VERSION = 2;

const EMPTY_CODE = '..';
// for codes when the tile's name gives no free one
const CODE_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ---------- map → file data ----------

function mapToData(map) {
  // a code per tile kind used
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
    // ai only when picked (undefined is left out)
    data[info.fileKey] = map[info.list].map(({ type, col, row, ai }) => ({ type, col, row, ai }));
  }
  data.warps = map.warps.map(({ name, col, row, to, toWarp, activate, enemies }) => ({ name, col, row, to, toWarp, activate, enemies }));
  return data;
}

// a 2 character code not in the legend: first letter + each other letter (grass → gr, ga, gs...),
// then first letter + anything, then any pair (3,800+, won't run out)
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

// ---------- file data → map ----------

// throws a readable error if the data isn't a map, for the loader to show
function mapFromData(data) {
  if (!data || !Array.isArray(data.rows) || typeof data.legend !== 'object') {
    throw new Error("this doesn't look like a Squimble Quest map file");
  }

  // rows split into codes. version 1: one character per tile, no spaces
  const oldFormat = (data.version ?? 1) < 2;
  const grid = data.rows.map((line) => (oldFormat ? [...line] : line.trim().split(/\s+/)));

  const rows = grid.length;
  const cols = Math.max(0, ...grid.map((codes) => codes.length));
  if (rows === 0 || cols === 0) throw new Error('the map has no tiles in it');

  const map = new TileMap(data.left ?? 0, data.top ?? 0, cols, rows, null);
  if (data.spawn) map.spawn = { x: data.spawn.x, y: data.spawn.y };
  // older files may have an unused "showGrid" (the grid is dev mode only now)

  // unknown things (e.g. a tile renamed in tiles.json) are left out, with one warning listing them
  const unknown = new Set();

  grid.forEach((codes, r) => {
    for (let c = 0; c < cols; c++) {
      // short rows pad with empty
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

  // "enemies" and "npcs"; older maps lack them
  for (const [kind, info] of Object.entries(SPAWN_KINDS)) {
    for (const spawn of data[info.fileKey] ?? []) {
      if (!info.types[spawn.type]) {
        unknown.add(`${kind} "${spawn.type}"`);
        continue;
      }
      map.addSpawn(kind, spawn.type, spawn.col, spawn.row, spawn.ai);
    }
  }

  // "warps", also missing from older maps. only name and tile are required: no "to" goes nowhere
  // (arrival only), no "toWarp" arrives at the spawn, anything but "interact" is step, enemies follow
  // only with "enemies": true (warps.js)
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

  if (unknown.size > 0) {
    console.warn(`This map has things the game doesn't know, so they've been left out: ${[...unknown].join(', ')}.`);
  }
  return map;
}

// adds (or replaces) a map in MAPS (maps.js) from file data. true if it worked
function registerMap(name, data) {
  // built once now to check it
  let checked;
  try {
    checked = mapFromData(data);
  } catch (err) {
    console.warn(`Couldn't use the map "${name}": ${err.message}`);
    return false;
  }
  // the first build reuses the checked map (no rebuild or repeat warnings); later ones build fresh
  addMap(name, () => {
    const map = checked ?? mapFromData(data);
    checked = null;
    return map;
  });
  return true;
}

// ---------- the maps folder ----------

// loads every MAP_FILES map (maps.js), once at start. promise resolves when all loaded or failed;
// failures are skipped with a console warning
function loadMapFiles() {
  // parallel downloads (fetchJson() in utils.js), null on failure
  const loads = MAP_FILES.map((file) => fetchJson(MAP_FOLDER + file).catch((err) => {
    console.warn(`Couldn't load the map file "${file}": ${err.message}.`);
    return null;
  }));

  // registered in MAP_FILES order, not finish order, so dev mode's M order is stable
  return Promise.all(loads).then((results) => {
    results.forEach((data, i) => {
      if (data) registerMap(mapNameFromFile(MAP_FILES[i]), data);
    });
  });
}

// ---------- export and open (map editor buttons) ----------

// downloads the map as cleanMapName(typedName).json. the map takes that name for this visit, so M
// returns to it as it is now. a new name is "save as": this map becomes the new one, and the old
// name rebuilds from its own file next time
function exportMap(map, typedName) {
  const name = cleanMapName(typedName);
  // the editor already blocks this; just in case
  if (!name) return;

  const data = mapToData(map);
  registerMap(name, data);
  // forget the old name too, or both names would point at this map (maps.js)
  if (map.name !== name && VISITED_MAPS[map.name] === map) delete VISITED_MAPS[map.name];
  VISITED_MAPS[name] = map;
  map.name = name;

  downloadTextFile(`${name}.json`, mapDataToText(data));
}

// picks a map file (pickFile() in utils.js) and goes to it
function openMapFile() {
  pickFile('.json,application/json', (file) => {
    file.text()
      .then((text) => {
        const name = mapNameFromFile(file.name);
        if (!registerMap(name, JSON.parse(text))) throw new Error('see the browser console for why');
        loadMap(name); // in sketch.js
      })
      // in game (hud.js), and the console in case it's long
      .catch((err) => {
        showMessage(`Couldn't open ${file.name}`);
        console.warn(`Couldn't open ${file.name}: ${err.message}`);
      });
  });
}

// ---------- small helpers ----------

// map file text: 2 space json (a tile row per line), with each object, enemy, npc and warp squashed
// onto one line so long lists stay readable
function mapDataToText(data) {
  return JSON.stringify(data, null, 2)
    // an object, character or warp: a { } starting with "type" or "name" holding only plain values
    .replace(/\{\s+("(?:type|name)":[^{}[\]]*?)\s+\}/g, (match, inside) => `{ ${inside.replace(/,\s+/g, ', ')} }`)
    + '\n';
}

// "My Forest!" → "my-forest", safe as a file name
function cleanMapName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

// "forest.json" → "forest"
function mapNameFromFile(fileName) {
  return cleanMapName(fileName.replace(/\.json$/i, ''));
}

