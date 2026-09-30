// the list of maps. every map is a file in assets/squimble-quest/maps/, the full guide is in the
// README.md there. in short:
//   1. make a map in the editor (dev mode: ` or Ctrl + D, then B), click Export, it downloads as a .json file
//   2. put the file in assets/squimble-quest/maps/
//   3. add its file name to MAP_FILES below

// where map files live, from the site's main folder
const MAP_FOLDER = 'assets/squimble-quest/maps/';

// the map files that load with the game. the file name is the map's name: 'forest.json' is the
// map called 'forest'. dev mode's M key goes through them in this order
const MAP_FILES = [
  'default.json',
  'example.json',
  'hut.json',
];

// the map the game starts on, by name
const START_MAP = 'example';

// every map, by name. filled in from MAP_FILES when the game starts (see loadMapFiles() in
// mapfile.js), plus any map opened or exported in the editor. each one is a function that
// builds the map fresh from its file. add maps with addMap() below
const MAPS = {};

// every map that's been built since the page loaded, by name (see getMap() below). the first visit
// builds the map from MAPS, then going back finds it how it was left: changes made in the map
// editor are still there, and so are its enemies and npcs as they were (see loadMap() in
// sketch.js). reloading the page starts every map fresh from its file again
const VISITED_MAPS = {};

// the map called name: built from MAPS the first time it's needed, then the same one every time
// after, so it keeps its changes. null if there's no map called that. loadMap() (sketch.js) uses
// it to go to a map, and warps (warps.js) use it to look inside the map they lead to
function getMap(name) {
  if (!MAPS[name]) return null;
  if (!VISITED_MAPS[name]) {
    VISITED_MAPS[name] = MAPS[name]();
    VISITED_MAPS[name].name = name;
  }
  return VISITED_MAPS[name];
}

// puts a map in MAPS, or replaces the one with that name. build is a function that makes the map.
// forgets the visited copy, so the next visit builds it fresh with the new version
function addMap(name, build) {
  MAPS[name] = build;
  delete VISITED_MAPS[name];
}

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
