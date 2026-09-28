// the world. just a floor with a grid for now, plus the edge of the world.
// the tile map will go here later
const WORLD_COLOURS = {
  outside: '#2b2b30', // past the edge of the world, only seen when zoomed right out
  floor:   '#ffffff',
  grid:    '#e2e2e2',
  axis:    '#8a8a8a', // the x = 0 and y = 0 lines, dev mode only
  edge:    '#23407a',
};

// uses world positions, so call it between camera.begin() and camera.end().
// showAxes draws lines through x = 0 and y = 0 (dev mode turns them on)
function drawWorld(camera, showAxes) {
  const w = WORLD;
  const width = w.right - w.left;
  const height = w.bottom - w.top;

  // lines are drawn as thin rects (1px rects stay sharper than line()). everything between
  // camera.begin() and end() gets scaled by the zoom, so a 1px rect would go thick when zoomed in
  // and fade away when zoomed out. 1 / zoom world pixels always comes out as 1 pixel on screen
  const px = 1 / camera.zoom;

  // background() ignores the camera and fills the whole canvas
  background(WORLD_COLOURS.outside);

  noStroke();
  fill(WORLD_COLOURS.floor);
  rect(w.left, w.top, width, height);

  // grid lines, only the ones on screen. doesn't matter much yet, but a big map would
  // slow right down if it drew every tile in the world every frame.
  // floor(... / TILE) * TILE rounds down to the nearest tile edge, so the first line is just off screen
  const view = camera.view();
  const firstX = Math.max(w.left, Math.floor(view.left / TILE) * TILE);
  const lastX = Math.min(w.right, view.right);
  const firstY = Math.max(w.top, Math.floor(view.top / TILE) * TILE);
  const lastY = Math.min(w.bottom, view.bottom);

  fill(WORLD_COLOURS.grid);
  for (let x = firstX; x <= lastX; x += TILE) rect(x, w.top, px, height);
  for (let y = firstY; y <= lastY; y += TILE) rect(w.left, y, width, px);

  // the x = 0 and y = 0 lines, 2px wide and centred on 0
  if (showAxes) {
    fill(WORLD_COLOURS.axis);
    rect(-px, w.top, px * 2, height);
    rect(w.left, -px, width, px * 2);
  }

  // the edge of the world
  noFill();
  stroke(WORLD_COLOURS.edge);
  strokeWeight(px * 3);
  rect(w.left, w.top, width, height);
}
