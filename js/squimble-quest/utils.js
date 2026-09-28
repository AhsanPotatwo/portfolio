// small maths helpers that more than one part of the game can use

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
