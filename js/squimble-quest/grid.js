// one square per tile, just to lay things out against for now
function drawGrid() {
  noStroke();
  fill('#e2e2e2');
  // 1px wide rects rather than line(), lines on whole numbers come out blurry on normal (non retina) screens
  for (let x = 0; x <= GAME_W; x += TILE) rect(x, 0, 1, GAME_H);
  for (let y = 0; y <= GAME_H; y += TILE) rect(0, y, GAME_W, 1);
}
