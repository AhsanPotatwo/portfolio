// things drawn on top of the game: messages now, menus and health bars later

// shown until the game is clicked, because it can't hear the keyboard before then (see input.js)
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
  text('Move with WASD or the arrow keys', GAME_W / 2, GAME_H / 2 + 24);
}
