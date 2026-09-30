// small helpers that more than one part of the game can use

// do two boxes ({ x, y, w, h }) overlap? boxes that only touch along an edge don't count
function boxesOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

// the smallest turn from angle b to angle a, in radians, between -PI and PI.
// e.g. from 350° to 10° is a 20° turn, not 340°. used to check if something's within an arc
function angleDifference(a, b) {
  let diff = (a - b) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

// turns a steady 0 → 1 into one that starts slow, speeds up in the middle and slows down at the
// end (called "ease in-out"). for smooth movements with a set length, like the camera's glides
function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// moves current towards target, covering part of the gap each frame, so it slows down as it
// arrives (a smooth ease). speed is how quickly: higher is snappier, Infinity gets there instantly.
// the Math.exp part keeps it the same speed at any frame rate, like dt does for movement
function approach(current, target, speed, dt) {
  if (speed === Infinity) return target;
  return current + (target - current) * (1 - Math.exp(-speed * dt));
}

// turns an angle (in radians) into the nearest of the 8 directions, as x and y that are each
// -1, 0 or 1 (the same shape as Input.direction()). e.g. 0 → right {x:1,y:0}, PI/2 → down {x:0,y:1}.
// angles go clockwise from pointing right, because y goes down the screen in p5
function directionFromAngle(angle) {
  // the 8 directions are 45° (PI/4) apart. dividing by 45° and rounding picks the nearest one,
  // then multiplying back gives that direction's exact angle
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  // cos and sin of that angle are 0, ±0.707 or ±1. rounding turns them into 0 or ±1
  return {
    x: Math.round(Math.cos(snapped)),
    y: Math.round(Math.sin(snapped)),
  };
}

// sets up how text() looks in one go, instead of 4 or 5 lines every time something's written.
// style is NORMAL, BOLD or ITALIC, alignX LEFT / CENTER / RIGHT, alignY TOP / CENTER / BOTTOM.
// quicksand and courier prime are already loaded by the page, so the canvas can use them too.
// e.g. setText(14, BOLD, CENTER, BOTTOM) or setText(13, NORMAL, LEFT, TOP, 'Courier Prime')
function setText(size, style = BOLD, alignX = CENTER, alignY = CENTER, font = 'Quicksand') {
  textFont(font);
  textStyle(style);
  textSize(size);
  textAlign(alignX, alignY);
}
