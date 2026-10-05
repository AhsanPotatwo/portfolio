// things drawn over the game that aren't ui elements: messages (showMessage()), text panels and the
// crosshair. later on health bars and quest text would go here too. they're in screen positions, so
// draw them after camera.end()

// the space between lines in drawPanel()
const PANEL_LINE_HEIGHT = 18;

// a see-through dark box with lines of text in it, like the dev mode panels (debug.js). x, y is the
// top left, and panelHeight() tells you how tall it is so you can put things under it
function drawPanel(x, y, width, lines, size) {
  noStroke();
  fill(0, 0, 0, 160);
  rect(x, y, width, panelHeight(lines), 6);

  fill(255);
  // monospace so numbers that keep changing don't jiggle about
  setText(size, NORMAL, LEFT, TOP, 'Courier Prime');
  lines.forEach((line, i) => text(line, x + 8, y + 6 + i * PANEL_LINE_HEIGHT));
}

function panelHeight(lines) {
  return lines.length * PANEL_LINE_HEIGHT + 12;
}

// how many seconds a showMessage() stays up
const MESSAGE_TIME = 4;

// { text, until } (until is a millis() time) or null
let hudMessage = null;

// shows a line along the top for a few seconds, like when a warp's broken (warps.js). it replaces any
// message that's already showing
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

// shown while the map files load at the start
function drawLoading() {
  background(WORLD_COLOURS.outside); // world.js
  noStroke();
  fill(255);
  setText(22);
  text('Loading maps…', GAME_W / 2, GAME_H / 2);
}

// shown along the bottom on the blank stand-in map, when none of the map files loaded
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

// shown until the game gets clicked, since it doesn't get any input before then (input.js)
function drawClickToPlay() {
  // darken the game
  noStroke();
  fill(0, 0, 0, 120);
  rect(0, 0, GAME_W, GAME_H);

  fill(255);
  setText(32);
  text('Click to play', GAME_W / 2, GAME_H / 2 - 14);

  setText(18, NORMAL);
  text('Move with WASD or the arrow keys, aim with the mouse, click to attack', GAME_W / 2, GAME_H / 2 + 24);
}

// takes the place of the mouse cursor while playing (the real one is hidden in squimble-quest.css).
// mouse is Input.mouse, held is whether left click is down, and overUI is whether it's over a button
// (then it turns into a ring to show you can click it)
function drawCrosshair(mouse, held, overUI) {
  if (!mouse.inside) return;

  const x = Math.round(mouse.x);
  const y = Math.round(mouse.y);

  if (overUI) {
    // a thin white ring on a thicker dark one, so it shows up on any button
    noFill();
    stroke(CROSSHAIR.colour);
    strokeWeight(4);
    circle(x, y, CROSSHAIR.size + 6);
    stroke(CROSSHAIR.outline);
    strokeWeight(2);
    circle(x, y, CROSSHAIR.size + 6);
    return;
  }

  // a dot with an outline
  stroke(CROSSHAIR.outline);
  strokeWeight(1.5);
  fill(held ? CROSSHAIR.heldColour : CROSSHAIR.colour);
  circle(x, y, CROSSHAIR.size);
}
