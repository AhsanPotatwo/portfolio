// things drawn on top of the game that aren't ui elements: messages and the crosshair now,
// health bars and quest text later

// shown for a moment when the game starts, while the map files load
function drawLoading() {
  background('#2b2b30');
  noStroke();
  fill(255);
  textAlign(CENTER, CENTER);
  textFont('Quicksand');
  textStyle(BOLD);
  textSize(22);
  text('Loading maps…', GAME_W / 2, GAME_H / 2);
}

// shown along the bottom when no map files could be loaded, and the game's on the blank stand-in map
function drawNoMapsMessage() {
  const lines = [
    "Couldn't load any map files.",
    'If the page was opened by double clicking it, run it through a local server instead',
    '(see the README in assets/squimble-quest/maps). The browser console (F12) has details.',
  ];
  noStroke();
  fill(0, 0, 0, 180);
  rect(0, GAME_H - 76, GAME_W, 76);
  fill(255);
  textAlign(CENTER, CENTER);
  textFont('Quicksand');
  textStyle(BOLD);
  textSize(15);
  text(lines[0], GAME_W / 2, GAME_H - 56);
  textStyle(NORMAL);
  textSize(13);
  text(lines[1], GAME_W / 2, GAME_H - 36);
  text(lines[2], GAME_W / 2, GAME_H - 18);
}

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
