// the list of maps. every map is a file in assets/squimble-quest/maps/, the full guide is in the
// README.md there. in short:
//   1. make a map in the editor (dev mode ` then B), click Export, it downloads as a .json file
//   2. put the file in assets/squimble-quest/maps/
//   3. add its file name to MAP_FILES below

// where map files live, from the site's main folder
const MAP_FOLDER = 'assets/squimble-quest/maps/';

// the map files that load with the game. the file name is the map's name: 'forest.json' is the
// map called 'forest'. dev mode's M key goes through them in this order
const MAP_FILES = [
  'default.json',
  'example.json',
];

// the map the game starts on, by name
const START_MAP = 'example';

// every map, by name. filled in from MAP_FILES when the game starts (see loadMapFiles() in
// mapfile.js), plus any map opened or exported in the editor. each one is a function that
// builds the map, so it starts fresh every time you go to it (see loadMap() in sketch.js)
const MAPS = {};

// a new map, cols tiles wide and rows tall, every tile fillWith (a tile name, or null for empty).
// tile (0, 0) is in its middle, which is where the player spawns. the map editor's New map uses this
function makeBlankMap(cols, rows, fillWith) {
  // "0 -" rather than just "-", which would give -0 for tiny maps
  const map = new TileMap(0 - Math.floor(cols / 2), 0 - Math.floor(rows / 2), cols, rows, fillWith);
  map.setSpawnTile(0, 0);
  return map;
}

// ---------- if no map files load ----------

// the name of the stand-in map below, used when not a single map file could be loaded
const FALLBACK_MAP = 'no-maps-loaded';

// a small blank map so the game can still run, e.g. when the page is opened without a local server
// (see "Running the game locally" in the README). there's a message on screen while you're on it
function buildFallbackMap() {
  return makeBlankMap(30, 18, 'blank');
}
