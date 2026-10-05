// draws the world: the tile map, plus the dev mode lines
const WORLD_COLOURS = {
  outside: '#2b2b30',          // past the edge of the map, you see it when zoomed right out
  grid:    'rgba(0, 0, 0, 0.12)', // see-through so it works on any tile
  axis:    'rgba(0, 0, 0, 0.45)', // the x = 0 and y = 0 lines, only in dev mode
};

// world positions (inside camera.begin/end). devLines turns on the tile grid and the x = 0 / y = 0
// lines (dev mode)
function drawWorld(camera, map, devLines) {
  // this ignores the camera and fills the whole canvas
  background(WORLD_COLOURS.outside);

  map.draw(camera);

  if (devLines) {
    drawGrid(camera, map);
    drawAxes(camera, map);
  }
}

// the lines are drawn as thin rects because they come out sharper than line(). the camera scales
// everything by the zoom, so px (1 / zoom world pixels) is always 1 pixel on screen

function drawGrid(camera, map) {
  const edges = map.bounds();
  const width = edges.right - edges.left;
  const height = edges.bottom - edges.top;
  const px = 1 / camera.zoom;

  // only the lines that are on screen, starting from the tile edge just off screen
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
