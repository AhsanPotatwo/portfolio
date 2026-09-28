// maps. just one test map for now, built in code, with a bit of every tile to try out.
// the map maker will replace building maps by hand like this.
//
// positions are in tiles (column, row), not pixels. tile (0, 0) is where the player starts,
// negative columns are to the left and negative rows are up. turn on dev mode (`) to see
// the lines through (0, 0) and which tile you're standing on

function buildTestMap() {
  // the same size as WORLD in config.js: 80 x 50 tiles, with (0, 0) in the middle
  const map = new TileMap(
    WORLD.left / TILE,
    WORLD.top / TILE,
    (WORLD.right - WORLD.left) / TILE,
    (WORLD.bottom - WORLD.top) / TILE,
    'grass'
  );

  // walls round the edge. 2 thick along the top, because the player's head sticks up above
  // their feet (the only part that bumps into things) and would poke out past the top of the world
  map.outline(map.left, map.top, map.cols, map.rows, 'wall');
  map.fill(map.left, map.top, map.cols, 2, 'wall');

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
