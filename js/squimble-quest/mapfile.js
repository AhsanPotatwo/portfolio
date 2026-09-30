// saving and loading maps as files.
// the full guide to making maps is in assets/squimble-quest/maps/README.md
//
// a map file is json, a text format that javascript can read and write easily. the tiles are stored
// as rows of short codes, one code per tile, so you can see the map's shape if you open the file.
// objects (objects.js) are a separate list, because several can share a tile and one can cover many:
//
//   {
//     "format": "squimble-quest-map",
//     "version": 2,
//     "left": -20,                          the column of the map's left edge (tile coordinates)
//     "top": -12,                           the row of the map's top edge
//     "spawn": { "x": 0, "y": 0 },          where the player starts, in world pixels
//     "legend": {                           which code means which tile
//       "..": null,                         .. is always an empty tile
//       "gr": "grass",
//       "wa": "wall"
//     },
//     "rows": [                             the tiles, top row first, codes split by spaces
//       "wa wa wa wa wa",
//       "wa gr gr gr wa",
//       "wa gr .. gr wa"
//     ],
//     "objects": [                          things on top of the tiles, each one's top left tile
//       { "type": "table", "col": -1, "row": -11 }
//     ],
//     "enemies": [                          where enemies start, each one's tile (enemies.js)
//       { "type": "dummy", "col": 3, "row": -3 }
//     ],
//     "npcs": [                             where npcs start, each one's tile (npcs.js)
//       { "type": "villager", "col": -3, "row": -3 }
//     ]
//   }
//
// codes are 2 characters, made from the tile's name where possible (gr for grass, wt for water
// when wa is already wall), which gives thousands of possible codes. the game only cares that
// codes are split by spaces, so a code in a hand made file can be any length.
//
// version 1 files (one character per tile, no spaces, no objects) still load.
//
// the map's name comes from its file name: forest.json is the map called "forest"

const MAP_FORMAT = 'squimble-quest-map';
const MAP_VERSION = 2;

// the code for an empty tile
const EMPTY_CODE = '..';
// characters for making codes, when a tile's name doesn't give a free one
const CODE_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ---------- map → file data ----------

// turns a map into plain data, ready to save as a file
function mapToData(map) {
  // give each kind of tile on the map its own code
  const legend = { [EMPTY_CODE]: null };
  const codeFor = {};
  for (const name of new Set(map.tiles)) {
    if (name === null) continue;
    const code = makeTileCode(name, legend);
    legend[code] = name;
    codeFor[name] = code;
  }

  // one line of codes per row of tiles
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
  // "enemies" and "npcs" lists (see SPAWN_KINDS in tilemap.js)
  for (const info of Object.values(SPAWN_KINDS)) {
    data[info.fileKey] = map[info.list].map((spawn) => ({ type: spawn.type, col: spawn.col, row: spawn.row }));
  }
  return data;
}

// a 2 character code for a tile that isn't already in the legend. tries the first letter of its
// name with each of its other letters (grass → gr, ga, gs...), then its first letter with anything,
// then any 2 characters at all (over 3,800 of those, so it won't run out)
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

// turns data from a map file back into a map. throws an error with a readable message
// if the data isn't a map, so whoever's loading it can show that message
function mapFromData(data) {
  if (!data || !Array.isArray(data.rows) || typeof data.legend !== 'object') {
    throw new Error("this doesn't look like a Squimble Quest map file");
  }

  // each row split into its codes. version 1 files had one character per tile and no spaces
  const oldFormat = (data.version ?? 1) < 2;
  const grid = data.rows.map((line) => (oldFormat ? [...line] : line.trim().split(/\s+/)));

  const rows = grid.length;
  const cols = Math.max(0, ...grid.map((codes) => codes.length));
  if (rows === 0 || cols === 0) throw new Error('the map has no tiles in it');

  const map = new TileMap(data.left ?? 0, data.top ?? 0, cols, rows, null);
  if (data.spawn) map.spawn = { x: data.spawn.x, y: data.spawn.y };
  // older files might also have "showGrid", which isn't used any more (the grid is dev mode only)

  // anything the game doesn't recognise (e.g. a tile that was renamed in tiles.js) is left out,
  // with one warning listing them all rather than one per tile
  const unknown = new Set();

  grid.forEach((codes, r) => {
    for (let c = 0; c < cols; c++) {
      // a short row is filled with empty tiles
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

  // the "enemies" and "npcs" lists. maps from before they were added don't have them, which is fine
  for (const [kind, info] of Object.entries(SPAWN_KINDS)) {
    for (const spawn of data[info.fileKey] ?? []) {
      if (!info.types[spawn.type]) {
        unknown.add(`${kind} "${spawn.type}"`);
        continue;
      }
      map.addSpawn(kind, spawn.type, spawn.col, spawn.row);
    }
  }

  if (unknown.size > 0) {
    console.warn(`This map has things the game doesn't know, so they've been left out: ${[...unknown].join(', ')}.`);
  }
  return map;
}

// adds a map to MAPS (maps.js) from file data, so loadMap() and dev mode's M key can use it.
// a map with the same name as an existing one replaces it. gives back true if it worked
function registerMap(name, data) {
  try {
    // build it once now, just to check the data is ok
    mapFromData(data);
  } catch (err) {
    console.warn(`Couldn't use the map "${name}": ${err.message}`);
    return false;
  }
  // built from the file's data the first time you go to it (maps.js)
  addMap(name, () => mapFromData(data));
  return true;
}

// ---------- the maps folder ----------

// loads every map listed in MAP_FILES (maps.js). run once when the game starts.
// gives back a promise, which finishes once every file has loaded or failed. a file that
// can't be loaded is skipped with a warning in the browser console, it never stops the game
function loadMapFiles() {
  // all the files download at the same time. each gives back its data, or null if it failed
  const loads = MAP_FILES.map((file) => {
    return fetch(MAP_FOLDER + file)
      .then((response) => {
        if (!response.ok) throw new Error(`the file wasn't found (${response.status})`);
        return response.json();
      })
      .catch((err) => {
        const hint = location.protocol === 'file:'
          ? ' Map files only load when the site is run through a local server, see the README in the maps folder.'
          : '';
        console.warn(`Couldn't load the map file "${file}": ${err.message}.${hint}`);
        return null;
      });
  });

  // added to MAPS once they've all arrived, in MAP_FILES order rather than whichever finished
  // downloading first, so dev mode's M key always goes through them in the same order
  return Promise.all(loads).then((results) => {
    results.forEach((data, i) => {
      if (data) registerMap(mapNameFromFile(MAP_FILES[i]), data);
    });
  });
}

// ---------- export and open (the buttons in the map editor) ----------

// saves a map as a file (the browser downloads it). typedName becomes the file name, tidied up by
// cleanMapName() (the map editor's Export asks for it in the game). the map also takes that name
// for the rest of this visit, so dev mode's M key comes back to this map as it is now, rather
// than rebuilding the original
function exportMap(map, typedName) {
  const name = cleanMapName(typedName);
  // the editor doesn't let a name like that through, this is just in case
  if (!name) return;

  const data = mapToData(map);
  registerMap(name, data);
  // registerMap() forgets any visited map with this name, and this one is it now
  VISITED_MAPS[name] = map;
  map.name = name;

  downloadTextFile(`${name}.json`, mapDataToText(data));
}

// asks for a map file from the computer, then goes straight to that map
function openMapFile() {
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = '.json,application/json';
  picker.addEventListener('change', () => {
    const file = picker.files[0];
    if (!file) return;
    file.text()
      .then((text) => {
        const name = mapNameFromFile(file.name);
        if (!registerMap(name, JSON.parse(text))) throw new Error('see the browser console for why');
        loadMap(name); // in sketch.js
      })
      .catch((err) => alert(`Couldn't open ${file.name}: ${err.message}`));
  });
  picker.click();
}

// ---------- small helpers ----------

// the text that goes in a map file. json with 2 space indents puts each row of tiles on its own
// line, then each object and enemy is squashed onto one line, so long lists of them stay easy to read
function mapDataToText(data) {
  return JSON.stringify(data, null, 2).replace(
    /\{\s+"type": ("[^"]*"),\s+"col": (-?\d+),\s+"row": (-?\d+)\s+\}/g,
    '{ "type": $1, "col": $2, "row": $3 }'
  ) + '\n';
}

// "My Forest!" → "my-forest". keeps names safe to use as file names
function cleanMapName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
}

// "forest.json" → "forest"
function mapNameFromFile(fileName) {
  return cleanMapName(fileName.replace(/\.json$/i, ''));
}

// makes the browser download some text as a file
function downloadTextFile(fileName, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // give the download a moment to start before tidying up
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
