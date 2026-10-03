// the map list. each map is a file in assets/squimble-quest/maps/ (guide: README.md there). in short:
// Export from the editor (dev mode, B), put the file in that folder, add it to MAP_FILES

// path from the site root
const MAP_FOLDER = 'assets/squimble-quest/maps/';

// loaded with the game. file name = map name ('forest.json' is 'forest'). dev mode's M goes in this order
const MAP_FILES = [
  'default.json',
  'example.json',
  'hut.json',
  'node-test.json',
  // rooms testing the enemy ais (pathfinding.js), guide in the maps README
  'ai-test.json',
];

const START_MAP = 'example';

// name → function building the map fresh from its file. filled from MAP_FILES (loadMapFiles() in
// mapfile.js) and by editor Open/Export. add with addMap()
const MAPS = {};

// every map built since page load, by name (getMap()). revisits find it as left: editor changes, and
// its characters (loadMap() in sketch.js). reload starts fresh
const VISITED_MAPS = {};

// the map called name, built from MAPS once then reused so it keeps changes. null if none. used by
// loadMap() (sketch.js) and warps (warps.js) to look into their target
function getMap(name) {
  if (!MAPS[name]) return null;
  if (!VISITED_MAPS[name]) {
    VISITED_MAPS[name] = MAPS[name]();
    VISITED_MAPS[name].name = name;
  }
  return VISITED_MAPS[name];
}

// adds or replaces a map. forgets the visited copy so the next visit builds the new version
function addMap(name, build) {
  MAPS[name] = build;
  delete VISITED_MAPS[name];
}

// a cols x rows map of fillWith (tile name, or null for empty), tile (0, 0) in the middle with the
// spawn on it. for the editor's New map
function makeBlankMap(cols, rows, fillWith) {
  // "0 -" because "-" gives -0 for tiny maps
  const map = new TileMap(0 - Math.floor(cols / 2), 0 - Math.floor(rows / 2), cols, rows, fillWith);
  map.setSpawnTile(0, 0);
  return map;
}

// ---------- if no map files load ----------

const FALLBACK_MAP = 'no-maps-loaded';

// small blank map so the game still runs, e.g. without a local server ("Running the game locally" in
// the maps README). shows a message while on it
function buildFallbackMap() {
  return makeBlankMap(30, 18, 'blank');
}
