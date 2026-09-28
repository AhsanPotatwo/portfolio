// saving and loading maps as files.
// the full guide to making maps is in assets/squimble-quest/maps/README.md
//
// a map file is json, a text format that javascript can read and write easily. the tiles are stored as
// rows of letters, one letter per tile, so you can see the map's shape if you open the file:
//
//   {
//     "format": "squimble-quest-map",
//     "version": 1,
//     "left": -20,                          the column of the map's left edge (tile coordinates)
//     "top": -12,                           the row of the map's top edge
//     "spawn": { "x": 0, "y": 0 },          where the player starts, in world pixels
//     "showGrid": false,                    draw the tile grid all the time
//     "legend": {                           which letter means which tile
//       ".": null,                          . is always an empty tile
//       "g": "grass",
//       "w": "wall"
//     },
//     "rows": [                             the tiles, top row first
//       "wwwwwwwwww",
//       "wggggggggw",
//       "wgg..ggggw"
//     ]
//   }
//
// the map's name comes from its file name: forest.json is the map called "forest"

const MAP_FORMAT = 'squimble-quest-map';
const MAP_VERSION = 1;

// letters handed out to tiles in the legend when a map is saved, if a tile's own first letter is taken
const LEGEND_LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@%&*+=~^';

// ---------- map ↔ file data ----------

// turns a map into plain data, ready to save as a file
function mapToData(map) {
  // give each kind of tile on the map its own letter. tries the first letter of its name first
  // (g for grass), so the file is easy to read
  const legend = { '.': null };
  const letterFor = {};
  for (const name of new Set(map.tiles)) {
    if (name === null) continue;
    const options = name[0].toLowerCase() + name[0].toUpperCase() + LEGEND_LETTERS;
    const letter = [...options].find((l) => !(l in legend));
    legend[letter] = name;
    letterFor[name] = letter;
  }

  // one line of letters per row of tiles
  const rows = [];
  for (let r = 0; r < map.rows; r++) {
    let line = '';
    for (let c = 0; c < map.cols; c++) {
      const name = map.tiles[r * map.cols + c];
      line += name === null ? '.' : letterFor[name];
    }
    rows.push(line);
  }

  return {
    format: MAP_FORMAT,
    version: MAP_VERSION,
    left: map.left,
    top: map.top,
    spawn: { x: map.spawn.x, y: map.spawn.y },
    showGrid: map.showGrid,
    legend,
    rows,
  };
}

// turns data from a map file back into a map. throws an error with a readable message
// if the data isn't a map, so whoever's loading it can show that message
function mapFromData(data) {
  if (!data || !Array.isArray(data.rows) || typeof data.legend !== 'object') {
    throw new Error("this doesn't look like a Squimble Quest map file");
  }
  const rows = data.rows.length;
  const cols = Math.max(0, ...data.rows.map((line) => line.length));
  if (rows === 0 || cols === 0) throw new Error('the map has no tiles in it');

  const map = new TileMap(data.left ?? 0, data.top ?? 0, cols, rows, null);
  if (data.spawn) map.spawn = { x: data.spawn.x, y: data.spawn.y };
  map.showGrid = !!data.showGrid;

  // tile names the game doesn't know about (e.g. a tile that was renamed or removed from tiles.js).
  // those tiles are left empty, and there's one warning per name rather than one per tile
  const unknown = new Set();

  data.rows.forEach((line, r) => {
    for (let c = 0; c < cols; c++) {
      const letter = line[c] ?? '.';
      const name = data.legend[letter] ?? null;
      if (name !== null && !TILE_TYPES[name]) {
        unknown.add(name);
        continue;
      }
      map.set(map.left + c, map.top + r, name);
    }
  });

  if (unknown.size > 0) {
    console.warn(`This map uses tiles that aren't in tiles.js: ${[...unknown].join(', ')}. They've been left empty.`);
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
  // built fresh from the file's data every time you go to it
  MAPS[name] = () => mapFromData(data);
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

// saves a map as a file (the browser downloads it). asks for a name first, which becomes the
// file name. the map also takes that name for the rest of this visit, so dev mode's M key
// brings back the saved version rather than rebuilding the original
function exportMap(map) {
  const typed = prompt('Name this map (letters, numbers, - and _):', map.name);
  // cancelled
  if (typed === null) return;
  const name = cleanMapName(typed);
  if (!name) {
    alert('That name has no letters or numbers in it, so the map wasn\'t saved.');
    return;
  }

  const data = mapToData(map);
  registerMap(name, data);
  map.name = name;

  // json with 2 space indents, which puts each row of tiles on its own line
  downloadTextFile(`${name}.json`, JSON.stringify(data, null, 2));
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
