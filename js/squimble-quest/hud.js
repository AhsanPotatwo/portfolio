// non-ui overlays: messages (showMessage()), text panels, the crosshair; later health bars and quest
// text. screen positions, so draw after camera.end()

// line spacing in drawPanel()
const PANEL_LINE_HEIGHT = 18;

// see-through dark box of text lines, e.g. dev mode panels (debug.js). x, y top left; panelHeight()
// gives its height for placing things below
function drawPanel(x, y, width, lines, size) {
  noStroke();
  fill(0, 0, 0, 160);
  rect(x, y, width, panelHeight(lines), 6);

  fill(255);
  // monospace, so changing numbers don't jiggle
  setText(size, NORMAL, LEFT, TOP, 'Courier Prime');
  lines.forEach((line, i) => text(line, x + 8, y + 6 + i * PANEL_LINE_HEIGHT));
}

function panelHeight(lines) {
  return lines.length * PANEL_LINE_HEIGHT + 12;
}

// seconds a showMessage() stays
const MESSAGE_TIME = 4;

// { text, until } (until is a millis() time), or null
let hudMessage = null;

// a line along the top for a few seconds, e.g. a broken warp (warps.js). replaces any current one
function showMessage(text) {
  hudMessage = { text, until: millis() + MESSAGE_TIME * 1000 };
}

// every frame (sketch.js)
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

// while map files load at start
function drawLoading() {
  background(WORLD_COLOURS.outside); // world.js
  noStroke();
  fill(255);
  setText(22);
  text('Loading maps…', GAME_W / 2, GAME_H / 2);
}

// along the bottom on the blank stand-in map, when no map files loaded
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

// until the game's clicked, since it gets no input before then (input.js)
function drawClickToPlay() {
  // dim the game
  noStroke();
  fill(0, 0, 0, 120);
  rect(0, 0, GAME_W, GAME_H);

  fill(255);
  setText(32);
  text('Click to play', GAME_W / 2, GAME_H / 2 - 14);

  setText(18, NORMAL);
  text('Move with WASD or the arrow keys, aim with the mouse, click to attack', GAME_W / 2, GAME_H / 2 + 24);
}

// replaces the cursor while playing (hidden in squimble-quest.css). mouse: Input.mouse, held: left
// down, overUI: over a button (becomes a ring, to show it's clickable)
function drawCrosshair(mouse, held, overUI) {
  if (!mouse.inside) return;

  const x = Math.round(mouse.x);
  const y = Math.round(mouse.y);

  if (overUI) {
    // thin white ring on a thicker dark one, visible on any button
    noFill();
    stroke(CROSSHAIR.colour);
    strokeWeight(4);
    circle(x, y, CROSSHAIR.size + 6);
    stroke(CROSSHAIR.outline);
    strokeWeight(2);
    circle(x, y, CROSSHAIR.size + 6);
    return;
  }

  // outlined dot
  stroke(CROSSHAIR.outline);
  strokeWeight(1.5);
  fill(held ? CROSSHAIR.heldColour : CROSSHAIR.colour);
  circle(x, y, CROSSHAIR.size);
}
