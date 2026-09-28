// things drawn on top of the game that aren't ui elements: messages and the crosshair now,
// health bars and quest text later

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
// mouse is Input.mouse, held is whether the left button is down,
// overUI is whether the mouse is over a button (it turns into a ring, so you can tell it's clickable)
function drawCrosshair(mouse, held, overUI) {
  // off the edge of the game, nothing to draw
  if (!mouse.inside) return;

  const x = Math.round(mouse.x);
  const y = Math.round(mouse.y);

  if (overUI) {
    // a white ring with a dark edge, so it shows up on light and dark buttons
    noFill();
    stroke(CROSSHAIR.colour);
    strokeWeight(4);
    circle(x, y, CROSSHAIR.size + 6);
    stroke(CROSSHAIR.outline);
    strokeWeight(2);
    circle(x, y, CROSSHAIR.size + 6);
    return;
  }

  // a small dot with a thin outline
  stroke(CROSSHAIR.outline);
  strokeWeight(1.5);
  fill(held ? CROSSHAIR.heldColour : CROSSHAIR.colour);
  circle(x, y, CROSSHAIR.size);
}
