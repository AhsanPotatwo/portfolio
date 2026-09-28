// the maps, built in code for now. the map maker will replace building maps by hand like this.
//
// positions are in tiles (column, row), not pixels. tile (0, 0) is in the middle, negative columns
// are to the left and negative rows are up. turn on dev mode (`) to see the tile grid, the lines
// through (0, 0), and which tile you're standing on.
//
// to add a map: write a function that builds and returns a TileMap (like the ones below),
// then add it to MAPS. dev mode's M key goes through them in the order they're listed

// every map, by name. each one is a function that builds it, so the map starts fresh
// every time you go to it. loadMap() in sketch.js is what switches between them
const MAPS = {
  default: buildDefaultMap,
  test: buildTestMap,
};

// the map the game starts on
const START_MAP = 'default';

// a map the size of WORLD in config.js (80 x 50 tiles, with (0, 0) in the middle), every tile fillWith
function makeWorldSizedMap(fillWith) {
  return new TileMap(
    WORLD.left / TILE,
    WORLD.top / TILE,
    (WORLD.right - WORLD.left) / TILE,
    (WORLD.bottom - WORLD.top) / TILE,
    fillWith
  );
}

// ---------- default ----------
// plain white floor with the grid always showing, nothing else. a blank space to try things out in
function buildDefaultMap() {
  const map = makeWorldSizedMap('blank');
  map.showGrid = true;
  return map;
}

// ---------- test ----------
// a bit of every tile, to check they all work
function buildTestMap() {
  const map = makeWorldSizedMap('grass');

  // walls round the edge
  map.outline(map.left, map.top, map.cols, map.rows, 'wall');

  // a dirt path through the middle, where the player starts
  map.fill(-30, -1, 61, 3, 'dirt');

  // a beach with a pond in it. sand slows you down, water is solid
  map.fill(8, -15, 16, 11, 'sand');
  map.fill(12, -12, 8, 5, 'water');

  // a small house: plank floor, wall around it, and a door gap at the bottom
  map.fill(-16, -13, 9, 7, 'planks');
  map.outline(-16, -13, 9, 7, 'wall');
  map.set(-12, -7, 'planks');

  // danger: lava hurts while you stand in it, spikes hurt once per tile you step on
  map.fill(4, 6, 5, 3, 'lava');
  map.fill(-7, 6, 4, 1, 'spikes');

  // two walls with a 1 tile gap between them, to check the player fits through
  map.fill(-30, 6, 1, 10, 'wall');
  map.fill(-28, 6, 1, 10, 'wall');

  return map;
}
