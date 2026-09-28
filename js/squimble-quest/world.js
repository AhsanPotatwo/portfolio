// draws the world: the tile map, plus lines to help while developing
const WORLD_COLOURS = {
  outside: '#2b2b30',          // past the edge of the map, only seen when zoomed right out
  grid:    'rgba(0, 0, 0, 0.12)', // lines between tiles. see-through so it works on any tile
  axis:    'rgba(0, 0, 0, 0.45)', // the x = 0 and y = 0 lines, dev mode only
};

// uses world positions, so call it between camera.begin() and camera.end().
// devLines draws the tile grid and lines through x = 0 and y = 0 (dev mode turns them on)
function drawWorld(camera, map, devLines) {
  // background() ignores the camera and fills the whole canvas
  background(WORLD_COLOURS.outside);

  map.draw(camera);

  if (devLines) {
    drawGrid(camera, map);
    drawAxes(camera, map);
  }
}

// lines are drawn as thin rects (1px rects stay sharper than line()). everything between
// camera.begin() and end() gets scaled by the zoom, so a 1px rect would go thick when zoomed in
// and fade away when zoomed out. px (1 / zoom world pixels) always comes out as 1 pixel on screen

function drawGrid(camera, map) {
  const edges = map.bounds();
  const width = edges.right - edges.left;
  const height = edges.bottom - edges.top;
  const px = 1 / camera.zoom;

  // grid lines, only the ones on screen.
  // floor(... / TILE) * TILE rounds down to the nearest tile edge, so the first line is just off screen
  const view = camera.view();
  const firstX = Math.max(edges.left, Math.floor(view.left / TILE) * TILE);
  const lastX = Math.min(edges.right, view.right);
  const firstY = Math.max(edges.top, Math.floor(view.top / TILE) * TILE);
  const lastY = Math.min(edges.bottom, view.bottom);

  noStroke();
  fill(WORLD_COLOURS.grid);
  for (let x = firstX; x <= lastX; x += TILE) rect(x, edges.top, px, height);
  for (let y = firstY; y <= lastY; y += TILE) rect(edges.left, y, width, px);
}

// the x = 0 and y = 0 lines, 2px wide and centred on 0
function drawAxes(camera, map) {
  const edges = map.bounds();
  const width = edges.right - edges.left;
  const height = edges.bottom - edges.top;
  const px = 1 / camera.zoom;

  noStroke();
  fill(WORLD_COLOURS.axis);
  rect(-px, edges.top, px * 2, height);
  rect(edges.left, -px, width, px * 2);
}
