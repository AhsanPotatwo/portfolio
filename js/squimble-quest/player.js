// the player. just a rectangle until there's a sprite
class Player {
  constructor(x, y) {
    // x, y is the centre of the player
    this.x = x;
    this.y = y;
    this.w = PLAYER.width;
    this.h = PLAYER.height;
    this.speed = PLAYER.speed;

    // which way the player is facing, as x and y from -1 to 1 (same as Input.direction()).
    // it stays the same when they stop, so they keep facing the way they last walked.
    // starts facing down, towards the screen. will be used for sprites and attacks later
    this.facing = { x: 0, y: 1 };
  }

  // move the player. dir is where to go (from Input.direction()), dt is seconds since the last frame.
  // the player doesn't read the keyboard itself, so the same code could be driven by anything
  update(dir, dt) {
    let dx = dir.x;
    let dy = dir.y;
    const moving = dx !== 0 || dy !== 0;

    if (moving) {
      this.facing = { x: dx, y: dy };

      // going diagonally moves 1 along x and 1 along y at once, which is ~1.41 in total
      // (pythagoras), so diagonals would be faster. scaling both by 1/√2 (~0.707) fixes that
      if (dx !== 0 && dy !== 0) {
        dx *= Math.SQRT1_2;
        dy *= Math.SQRT1_2;
      }

      // speed is per second, so multiplying by dt makes it the same speed at any frame rate
      this.x += dx * this.speed * dt;
      this.y += dy * this.speed * dt;
    }

    // keep the whole rectangle on screen. will be replaced by map walls later
    this.x = constrain(this.x, this.w / 2, GAME_W - this.w / 2);
    this.y = constrain(this.y, this.h / 2, GAME_H - this.h / 2);
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

    // small dot towards the way the player is facing, so you can see all 8 directions
    noStroke();
    fill(PLAYER.outline);
    const dotX = this.x + this.facing.x * this.w * 0.3;
    const dotY = this.y + this.facing.y * this.h * 0.3;
    circle(Math.round(dotX), Math.round(dotY), 8);
  }
}
