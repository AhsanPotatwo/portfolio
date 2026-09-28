// the player. just a rectangle until there's a sprite
class Player {
  constructor(x, y) {
    // x, y is the centre of the player
    this.x = x;
    this.y = y;
    this.w = PLAYER.width;
    this.h = PLAYER.height;
    this.speed = PLAYER.speed;

    // the player always faces the mouse, kept two ways:
    // aimAngle is the exact angle to the mouse in radians (0 = right, PI/2 = down).
    //   for anything that needs to be precise, like which way a weapon points or an arrow flies
    this.aimAngle = Math.PI / 2;
    // facing is the nearest of the 8 directions to aimAngle, as x and y from -1 to 1.
    //   for things that only come in 8 versions, like which sprite to draw
    // both start pointing down, towards the screen
    this.facing = { x: 0, y: 1 };
  }

  // run every frame. dir is where to walk (from Input.direction()), aim is the point to face
  // (from Input.aimPoint()), dt is seconds since the last frame.
  // the player doesn't read the keyboard or mouse itself, so the same code could be driven by anything
  update(dir, aim, dt) {
    this.move(dir, dt);
    this.aimAt(aim);
  }

  // walking. only changes where the player is, not where they face,
  // so you can walk one way while aiming another (like backing away from an enemy)
  move(dir, dt) {
    let dx = dir.x;
    let dy = dir.y;

    // going diagonally moves 1 along x and 1 along y at once, which is ~1.41 in total
    // (pythagoras), so diagonals would be faster. scaling both by 1/√2 (~0.707) fixes that
    if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }

    // speed is per second, so multiplying by dt makes it the same speed at any frame rate
    this.x += dx * this.speed * dt;
    this.y += dy * this.speed * dt;

    // keep the whole rectangle on screen. will be replaced by map walls later
    this.x = constrain(this.x, this.w / 2, GAME_W - this.w / 2);
    this.y = constrain(this.y, this.h / 2, GAME_H - this.h / 2);
  }

  // turn to face a point. if there's no point (not playing yet), keep facing the same way
  aimAt(point) {
    if (!point) return;

    // how far the point is from the player's centre, along x and along y
    const dx = point.x - this.x;
    const dy = point.y - this.y;

    // mouse right on top of the player, the angle would flick about wildly, so ignore it
    if (Math.hypot(dx, dy) < AIM.deadzone) return;

    // atan2 turns "this far across, this far down" into an angle
    this.aimAngle = Math.atan2(dy, dx);
    this.facing = directionFromAngle(this.aimAngle);
  }

  draw() {
    // x, y is the centre, rect() wants the top left corner.
    // rounded to whole pixels so the edges stay sharp instead of going blurry mid-pixel
    const left = Math.round(this.x - this.w / 2);
    const top = Math.round(this.y - this.h / 2);

    stroke(PLAYER.outline);
    strokeWeight(2);
    fill(PLAYER.colour);
    rect(left, top, this.w, this.h);

    // dot towards the 8-way facing direction, shows which sprite would be used
    noStroke();
    fill(PLAYER.outline);
    const dotX = this.x + this.facing.x * this.w * 0.3;
    const dotY = this.y + this.facing.y * this.h * 0.3;
    circle(Math.round(dotX), Math.round(dotY), 8);

    // line along the exact aim angle, where a weapon will be held.
    // cos and sin of the angle give how far across and down one pixel along it is
    stroke(AIM.lineColour);
    strokeWeight(3);
    line(
      this.x, this.y,
      this.x + Math.cos(this.aimAngle) * AIM.lineLength,
      this.y + Math.sin(this.aimAngle) * AIM.lineLength
    );
  }
}
