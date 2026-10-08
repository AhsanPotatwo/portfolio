// the maps. each map is a file in assets/squimble-quest/maps/ (the README.md in there is the guide),
// and maps/index.json lists them (datafiles.js). the short version: Export from the editor (dev mode,
// then B), put the file in that folder, and add its name to index.json. the file name is the map's
// name ('forest.json' is 'forest'), and dev mode's M goes through them in the index's order

const START_MAP = 'example';

// map names, each with a function that builds a fresh copy of that map from its file. filled in from
// maps/index.json (mapfile.js) and by the editor's Open and Export. add to it with addMap()
const MAPS = {};

// every map that's been built since the page loaded, by name (getMap()). going back to one finds it
// how you left it, with any editor changes and its characters (loadMap() in sketch.js). reloading the
// page starts them all fresh
const VISITED_MAPS = {};

// the map called name. it's built from MAPS the first time and then reused, so it keeps any changes.
// null if there's no map with that name. loadMap() (sketch.js) uses it, and so do warps (warps.js) to
// look at where they lead
function getMap(name) {
  if (!MAPS[name]) return null;
  if (!VISITED_MAPS[name]) {
    VISITED_MAPS[name] = MAPS[name]();
    VISITED_MAPS[name].name = name;
  }
  return VISITED_MAPS[name];
}

// adds a map or replaces one. it forgets the visited copy, so next time you go there it builds the
// new version
function addMap(name, build) {
  MAPS[name] = build;
  delete VISITED_MAPS[name];
}

// a cols x rows map filled with fillWith (a tile name, or null for empty), with tile (0, 0) in the
// middle and the spawn on it. for the editor's New map
function makeBlankMap(cols, rows, fillWith) {
  // "0 -" because just "-" gives -0 for tiny maps
  const map = new TileMap(0 - Math.floor(cols / 2), 0 - Math.floor(rows / 2), cols, rows, fillWith);
  map.setSpawnTile(0, 0);
  return map;
}

// ---------- if no map files load ----------

const FALLBACK_MAP = 'no-maps-loaded';

// a small blank map so the game still runs, like when there's no local server ("Running the game
// locally" in the maps README). a message shows while you're on it
function buildFallbackMap() {
  return makeBlankMap(30, 18, 'blank');
}
