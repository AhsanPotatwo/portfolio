// things drawn on top of the game that aren't ui elements: messages (including showMessage()), text
// panels and the crosshair now, health bars and quest text later. all of it uses screen positions, so draw it after camera.end()

// the gap between lines in drawPanel()
const PANEL_LINE_HEIGHT = 18;

// a see-through dark box with lines of text in it, e.g. the dev mode panels (debug.js).
// x, y is the box's top left corner. panelHeight() below says how tall it is, so anything placed
// under it can work out where it ends
function drawPanel(x, y, width, lines, size) {
  noStroke();
  fill(0, 0, 0, 160);
  rect(x, y, width, panelHeight(lines), 6);

  fill(255);
  // courier prime is monospace, so numbers that change don't make the text jiggle about
  setText(size, NORMAL, LEFT, TOP, 'Courier Prime');
  lines.forEach((line, i) => text(line, x + 8, y + 6 + i * PANEL_LINE_HEIGHT));
}

// how tall drawPanel() makes a box for these lines
function panelHeight(lines) {
  return lines.length * PANEL_LINE_HEIGHT + 12;
}

// how long a message from showMessage() stays on screen, in seconds
const MESSAGE_TIME = 4;

// the message showing along the top right now: { text, until }, until being the millis() it goes
// away at. null when there isn't one
let hudMessage = null;

// shows a line of writing along the top of the screen for a few seconds, e.g. when a warp leads
// somewhere that doesn't exist (warps.js). a new one replaces whatever was showing
function showMessage(text) {
  hudMessage = { text, until: millis() + MESSAGE_TIME * 1000 };
}

// draws the message from showMessage(), if there is one. run every frame (sketch.js)
function drawMessage() {
  if (!hudMessage || millis() > hudMessage.until) return;
  setText(15);
  const w = textWidth(hudMessage.text) + 32;
  noStroke();
  fill(0, 0, 0, 190);
  rect((GAME_W - w) / 2, 48, w, 34, 6);
  fill(255);
  text(hudMessage.text, GAME_W / 2, 65);
}

// shown for a moment when the game starts, while the map files load
function drawLoading() {
  background('#2b2b30');
  noStroke();
  fill(255);
  setText(22);
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
  setText(15);
  text(lines[0], GAME_W / 2, GAME_H - 56);
  setText(13, NORMAL);
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
  setText(32);
  text('Click to play', GAME_W / 2, GAME_H / 2 - 14);

  setText(18, NORMAL);
  text('Move with WASD or the arrow keys, aim with the mouse, click to attack', GAME_W / 2, GAME_H / 2 + 24);
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
    // a thin white ring on a thicker dark one, so it shows up on light and dark buttons
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
