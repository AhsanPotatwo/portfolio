// things drawn on top of the game: messages and the crosshair now, menus and health bars later

// shown until the game is clicked, because it can't hear the keyboard or mouse before then (see input.js)
function drawClickToPlay() {
  // dim the game underneath
  noStroke();
  fill(0, 0, 0, 120);
  rect(0, 0, GAME_W, GAME_H);

  fill(255);
  textAlign(CENTER, CENTER);
  // quicksand is already loaded by the page, so the canvas can use it too
  textFont('Quicksand');
  textStyle(BOLD);
  textSize(32);
  text('Click to play', GAME_W / 2, GAME_H / 2 - 14);

  textStyle(NORMAL);
  textSize(18);
  text('Move with WASD or the arrow keys, aim with the mouse', GAME_W / 2, GAME_H / 2 + 24);
}

// marks where the mouse is. it replaces the normal cursor while you play (hidden in squimble-quest.css).
// mouse is Input.mouse, held is whether the left button is down
function drawCrosshair(mouse, held) {
  // off the edge of the game, nothing to draw
  if (!mouse.inside) return;

  // a small dot with a thin outline
  stroke(CROSSHAIR.outline);
  strokeWeight(1.5);
  fill(held ? CROSSHAIR.heldColour : CROSSHAIR.colour);
  circle(Math.round(mouse.x), Math.round(mouse.y), CROSSHAIR.size);
}
