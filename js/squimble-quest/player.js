// the player. just a rectangle until there's a sprite
class Player {
  constructor(x, y) {
    // x, y is the centre of the player, in world positions (see camera.js)
    this.x = x;
    this.y = y;
    this.w = PLAYER.width;
    this.h = PLAYER.height;
    this.speed = PLAYER.speed;

    // where to go back to after dying
    this.spawnX = x;
    this.spawnY = y;

    this.health = PLAYER.maxHealth;
    // counts down after being hurt, the player flashes while it's above 0
    this.hurtTimer = 0;

    // the tile under the player's feet (its settings from tiles.js), and its column and row.
    // null until the first update
    this.tile = null;
    this.tileCol = null;
    this.tileRow = null;

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
  // (from Input.aimPoint()), dt is seconds since the last frame, map is the tile map being walked on.
  // the player doesn't read the keyboard or mouse itself, so the same code could be driven by anything
  update(dir, aim, dt, map) {
    this.move(dir, dt, map);
    this.aimAt(aim);
    this.checkTile(map, dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
  }

  // walking. only changes where the player is, not where they face,
  // so you can walk one way while aiming another (like backing away from an enemy)
  move(dir, dt, map) {
    let dx = dir.x;
    let dy = dir.y;

    // going diagonally moves 1 along x and 1 along y at once, which is ~1.41 in total
    // (pythagoras), so diagonals would be faster. scaling both by 1/√2 (~0.707) fixes that
    if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }

    // some tiles slow you down (sand). speed is per second, so multiplying by dt makes it
    // the same speed at any frame rate
    const speed = this.speed * (this.tile ? this.tile.speed : 1);

    // the map works out how far the feet can go before they hit something solid
    const moved = map.moveBox(this.feetBox(), dx * speed * dt, dy * speed * dt);
    this.x += moved.x;
    this.y += moved.y;

    // the feet stop at the edge of the map, but the head sticks up above them and could poke
    // off the top. this stops the player once their head reaches the top edge
    const headLimit = map.bounds().top + this.h / 2;
    if (this.y < headLimit) this.y = headLimit;
  }

  // jump straight to a spot and make it where you respawn. for starting on a map
  placeAt(x, y) {
    this.x = x;
    this.y = y;
    this.spawnX = x;
    this.spawnY = y;
    // forget the last map's tile, so the tile here counts as freshly stepped on
    this.tile = null;
    this.tileCol = null;
    this.tileRow = null;
  }

  // the part of the player that bumps into walls: just the feet, at the bottom of the rectangle.
  // that way the head can overlap a wall above, which looks right from a top down angle,
  // and the player fits through 1 tile gaps (the whole body is nearly 2 tiles tall)
  feetBox() {
    const w = PLAYER.feetWidth;
    const h = PLAYER.feetHeight;
    return {
      x: this.x - w / 2,
      y: this.y + this.h / 2 - h,
      w,
      h,
    };
  }

  // which tile the player is standing on (the one under the middle of their feet),
  // and runs that tile's behaviours from tiles.js
  checkTile(map, dt) {
    const feet = this.feetBox();
    const col = map.colAt(feet.x + feet.w / 2);
    const row = map.rowAt(feet.y + feet.h / 2);

    // stepped onto a different tile
    if (col !== this.tileCol || row !== this.tileRow) {
      this.tileCol = col;
      this.tileRow = row;
      this.tile = map.get(col, row);
      if (this.tile && this.tile.onEnter) this.tile.onEnter(this);
    }

    if (this.tile && this.tile.onStand) this.tile.onStand(this, dt);
  }

  // take damage. anything can call this: tiles now, enemies and traps later
  hurt(amount) {
    this.health -= amount;
    this.hurtTimer = PLAYER.hurtFlashTime;
    if (this.health <= 0) this.respawn();
  }

  // back to the start with full health. a placeholder until there's a proper death screen
  respawn() {
    this.health = PLAYER.maxHealth;
    this.x = this.spawnX;
    this.y = this.spawnY;
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
    fill(this.hurtTimer > 0 ? PLAYER.hurtColour : PLAYER.colour);
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
