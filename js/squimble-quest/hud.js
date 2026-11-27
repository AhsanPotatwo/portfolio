// things drawn over the game that aren't ui elements: the hud, messages (showMessage()) and the
// crosshair (dev mode's panels are in debug.js). they're in screen positions, so draw them after
// camera.end()

// ---------- the hud ----------
// pieces that stay on screen while playing, each a block in HUD (config.js) saying where it sits and
// how it looks, and a function here that draws it. to move or restyle one, change its block. to add
// one (stamina, quest text, a minimap), add a block to HUD and its function to HUD_PIECES, and it's
// placed and hidden like the rest

// draws each piece in its box. piece is its HUD block, p the player
const HUD_PIECES = {
  health: drawHealthPiece,
};

// every piece that's shown, from sketch.js while playing
function drawHud(p) {
  for (const [name, piece] of Object.entries(HUD)) {
    if (piece.show) HUD_PIECES[name](hudBox(piece), piece, p);
  }
}

// where a HUD block sits on screen, { x, y, w, h }, from its anchor (config.js)
function hudBox({ anchor, x, y, w, h }) {
  const across = anchor.includes('left') ? x : anchor.includes('right') ? GAME_W - w - x : (GAME_W - w) / 2 + x;
  const down = anchor.includes('top') ? y : anchor.includes('bottom') ? GAME_H - h - y : (GAME_H - h) / 2 + y;
  return { x: Math.round(across), y: Math.round(down), w, h };
}

// the player's health: a frame, the empty bar, the health just lost draining away (trailHealth,
// character.js), the health, and the numbers. UI_ART's playerHealth, playerHealthBack and
// playerHealthFill replace the drawn ones
function drawHealthPiece({ x, y, w, h }, piece, p) {
  const f = piece.frame;
  if (!drawArtBox(uiArt('playerHealth'), x - f, y - f, w + f * 2, h + f * 2)) drawFlatBox(x - f, y - f, w + f * 2, h + f * 2); // ui.js
  noStroke();
  if (!drawArtBox(uiArt('playerHealthBack'), x, y, w, h)) {
    fill(UI_BOX.well);
    rect(x, y, w, h);
  }
  const share = (health) => Math.round(w * Math.max(0, health / p.maxHealth));
  fill(piece.trailColour);
  rect(x, y, share(p.trailHealth), h);
  const left = share(p.health);
  if (!drawArtBox(uiArt('playerHealthFill'), x, y, left, h)) {
    fill(p.health <= p.maxHealth * piece.low ? piece.lowColour : piece.colour);
    rect(x, y, left, h);
  }
  if (piece.textSize > 0) {
    setText(piece.textSize);
    // outlined so it reads over the bar and the empty part. round joins, or sharp corners (the 1, 7
    // and 5) get spikes
    push();
    stroke(UI_BOX.edge);
    strokeWeight(3);
    strokeJoin(ROUND);
    fill(255);
    text(`${Math.ceil(p.health)} / ${p.maxHealth}`, x + w / 2, y + h / 2);
    pop();
  }
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
  // fitText() is in utils.js
  const shown = fitText(hudMessage.text, GAME_W - 64);
  const w = textWidth(shown) + 32;
  noStroke();
  // UI_ART.message (config.js, art.js), or the drawn box (ui.js)
  if (!drawArtBox(uiArt('message'), (GAME_W - w) / 2, 48, w, 34)) drawFlatBox((GAME_W - w) / 2, 48, w, 34);
  fill(255);
  text(shown, GAME_W / 2, 65);
}

// a red glow round the edges of the screen that fades fast after the player's hit, through the start of
// their hitInvincible (config.js). the middle stays clear so you can still see the fight
function drawHurtFlash(player) {
  const left = player.invincible / (player.settings.hitInvincible || 1);
  if (left <= 0) return;
  const glow = drawingContext.createRadialGradient(GAME_W / 2, GAME_H / 2, GAME_H * 0.3, GAME_W / 2, GAME_H / 2, GAME_W * 0.6);
  glow.addColorStop(0, 'rgba(200, 20, 20, 0)');
  // dimmer or none with the pause menu's Flashes turned down
  glow.addColorStop(1, `rgba(200, 20, 20, ${0.45 * left ** 3 * GAME_SETTINGS.flashes})`);
  drawingContext.fillStyle = glow;
  drawingContext.fillRect(0, 0, GAME_W, GAME_H);
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

// shown until the game gets clicked, since it doesn't get any input before then (input.js), and again
// after leaving full screen (setup() in sketch.js)
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
  setText(14, NORMAL);
  text('Plays in full screen', GAME_W / 2, GAME_H / 2 + 54);
}

// takes the place of the mouse cursor while playing (the real one is hidden in squimble-quest.css).
// mouse is Input.mouse, held is whether left click is down, and overUI is whether it's over a button
// (then it turns into a ring to show you can click it)
function drawCrosshair(mouse, held, overUI) {
  if (!mouse.inside) return;

  const x = Math.round(mouse.x);
  const y = Math.round(mouse.y);
  // bigger with the pause menu's Crosshair turned up
  const scale = GAME_SETTINGS.crosshairSize;
  const size = CROSSHAIR.size * scale;

  // UI_ART's crosshair pictures (config.js, art.js), middle on the mouse. over the ui without its own
  // picture it's the drawn ring
  const art = overUI ? uiArt('crosshairOverUI') : uiArt('crosshair');
  if (drawArt(art, x, y, { anchor: 'centre', sx: scale, sy: scale, time: millis() / 1000 })) return;

  if (overUI) {
    // a thin white ring on a thicker dark one, so it shows up on any button
    noFill();
    stroke(CROSSHAIR.colour);
    strokeWeight(4 * scale);
    circle(x, y, size + 6 * scale);
    stroke(CROSSHAIR.outline);
    strokeWeight(2 * scale);
    circle(x, y, size + 6 * scale);
    return;
  }

  // a dot with an outline
  stroke(CROSSHAIR.outline);
  strokeWeight(1.5 * scale);
  fill(held ? CROSSHAIR.heldColour : CROSSHAIR.colour);
  circle(x, y, size);
}
