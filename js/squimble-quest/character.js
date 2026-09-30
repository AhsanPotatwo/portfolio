// anything that walks about, has health and can fight. the player (player.js), enemies (enemy.js)
// and npcs (npc.js) are all built on this, so they walk, bump into walls, get hurt and attack the same way.
//
// every frame a character is given "controls", the three things that decide what it does:
//
//   { move: { x, y }, aim: { x, y } or null, attack: true or false }
//
//   move    which way to walk, each of x and y -1, 0 or 1 (like Input.direction())
//   aim     a world position to face, or null to keep facing the same way
//   attack  true starts a swing of its weapon (if it's ready)
//
// for the player these come from the keyboard and mouse (sketch.js). for an enemy they come from
// its ai (enemies.js). so anything the player can do, an enemy can be made to do too
//
// settings come from PLAYER (config.js) for the player, ENEMY_TYPES (enemies.js) for enemies,
// and NPC_TYPES (npcs.js) for npcs:
//   width, height, feetWidth, feetHeight, speed, maxHealth, weapon (enemies),
//   colour, outline, hurtColour, hurtFlashTime, healthBarColour, ai (enemies and npcs)
//
// "world" (given to update() and to ais) is everything a character might need to know about:
//   { map, player, enemies, npcs, characters }
// characters is the player, enemies and npcs all in one list (made in sketch.js)

// the controls for a character with no ai (or an ai that's decided to wait): do nothing
const STAND_STILL = { move: { x: 0, y: 0 }, aim: null, attack: false };

// how far below a character's centre the middle of its feet is. settings are any character's
// (PLAYER, or a type from enemies.js or npcs.js)
function feetBelowCentre(settings) {
  return settings.height / 2 - settings.feetHeight / 2;
}

// where a character's centre is when it stands with its feet in the middle of a tile.
// used to place enemies, npcs and the player's spawn point on tiles
function standingOnTile(settings, col, row) {
  return { x: (col + 0.5) * TILE, y: (row + 0.5) * TILE - feetBelowCentre(settings) };
}

class Character {
  constructor(x, y, settings) {
    this.settings = settings;

    // x, y is the centre of the character, in world positions (see camera.js)
    this.x = x;
    this.y = y;
    this.w = settings.width;
    this.h = settings.height;
    this.speed = settings.speed;
    // how fast it's going, in pixels a second. only matters on slippery tiles, where it carries on
    // going the same way (see walk())
    this.velocity = { x: 0, y: 0 };

    this.maxHealth = settings.maxHealth;
    this.health = this.maxHealth;
    // counts down after being hurt, the character flashes while it's above 0
    this.hurtTimer = 0;
    // true once it's died for good. the game removes dead enemies (the player respawns instead)
    this.dead = false;

    // the tile under its feet (its settings from tiles.js), and that tile's column and row.
    // null until the first update
    this.tile = null;
    this.tileCol = null;
    this.tileRow = null;

    // which way it's facing, kept two ways:
    // aimAngle is the exact angle in radians (0 = right, PI/2 = down).
    //   for anything that needs to be precise, like which way a weapon swings or an arrow flies
    this.aimAngle = Math.PI / 2;
    // facing is the nearest of the 8 directions to aimAngle, as x and y from -1 to 1.
    //   for things that only come in 8 versions, like which sprite to draw
    // both start pointing down, towards the screen
    this.facing = { x: 0, y: 1 };

    // the swing happening right now, or null
    this.swing = null;
    // seconds until it can attack again
    this.attackCooldown = 0;
    // swings go back and forth, this flips each time
    this.backhand = false;
  }

  // ---------- every frame ----------

  // controls: what to do this frame (see the top of this file). dt: seconds since the last frame.
  // world: everything it might need to know about (see the top of this file)
  update(controls, dt, world) {
    this.walk(controls.move, dt, world);
    this.aimAt(controls.aim);
    if (controls.attack) this.attack();

    if (this.swing) {
      this.swing.update(dt, this.targets(world));
      if (this.swing.finished) this.swing = null;
    }

    this.checkTile(world.map, dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
  }

  // who this character's attacks can hurt. the player and enemies each say who (see their files)
  targets(world) {
    return [];
  }

  // the controls its ai (from enemies.js or npcs.js) picks for this frame, or STAND_STILL if it
  // hasn't got one. enemies and npcs use this, the player's controls come from the keyboard instead
  think(world, dt) {
    return this.settings.ai ? this.settings.ai(this, world, dt) : STAND_STILL;
  }

  // ---------- moving ----------

  // walking. only changes where it is, not where it faces,
  // so it can walk one way while aiming another (like backing away while fighting).
  // walls (the map) and other characters both stop it
  walk(dir, dt, world) {
    const map = world.map;
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
    const tile = this.tile;
    const speed = this.speed * (tile ? tile.speed : 1);

    // the way it wants to go, plus any push from the tile (conveyor belts). pushSpeed is in tiles
    const push = PUSH_DIRECTIONS[tile?.pushDirection];
    const pushSpeed = push ? tile.pushSpeed * TILE : 0;
    // it goes that way straight away, except on slippery tiles (ice), where it only slowly turns
    // from the way it was going, so it slides (SLIPPERY_GRIP in tiles.js)
    const grip = tile?.slippery ? SLIPPERY_GRIP * (1 - tile.slippery) : Infinity;
    this.velocity.x = approach(this.velocity.x, dx * speed + (push ? push.x * pushSpeed : 0), grip, dt);
    this.velocity.y = approach(this.velocity.y, dy * speed + (push ? push.y * pushSpeed : 0), grip, dt);

    // across first, then down, so walking into a wall or someone at an angle slides along them.
    // each time: the map says how far the feet can go before a wall (tilemap.js), then that's cut
    // short again if another character's feet are in the way
    const feet = this.feetBox();
    const moveX = this.stopAtOthers(world, feet, 'x', map.moveAlongX(feet, this.velocity.x * dt));
    feet.x += moveX;
    const moveY = this.stopAtOthers(world, feet, 'y', map.moveAlongY(feet, this.velocity.y * dt));
    this.x += moveX;
    this.y += moveY;
    // bumping into something stops it sliding that way
    if (dt > 0) {
      this.velocity.x = moveX / dt;
      this.velocity.y = moveY / dt;
    }

    // the feet stop at the edge of the map, but the head sticks up above them and could poke
    // off the top. this stops the character once its head reaches the top edge.
    // skipped on maps shorter than the character, where it would push the feet off the bottom instead
    const edges = map.bounds();
    const headLimit = edges.top + this.h / 2;
    if (edges.bottom - edges.top >= this.h && this.y < headLimit) this.y = headLimit;
  }

  // how far the feet can move along one axis ('x' or 'y') before they'd walk into another
  // character's feet. amount is how far they want to go, and it's cut short to stop flush against
  // whoever's in the way. only the feet bump, like with walls, so heads and bodies can still
  // overlap from this angle (someone standing in front of someone else).
  // every other character that's still alive is in the way. it goes through world.characters
  // directly rather than making a new list of them, because every character does this every frame
  stopAtOthers(world, feet, axis, amount) {
    if (amount === 0) return 0;
    const size = axis === 'x' ? 'w' : 'h';
    for (const other of world.characters) {
      if (other === this || other.dead) continue;
      const theirs = other.feetBox();
      // already overlapping (e.g. one was teleported onto the other): let them walk apart,
      // rather than both being stuck
      if (boxesOverlap(feet, theirs)) continue;
      const moved = { ...feet, [axis]: feet[axis] + amount };
      if (!boxesOverlap(moved, theirs)) continue;
      // stop flush against them: our front edge on their near edge
      amount = amount > 0
        ? theirs[axis] - (feet[axis] + feet[size])
        : (theirs[axis] + theirs[size]) - feet[axis];
    }
    return amount;
  }

  // the part that bumps into walls and other characters: just the feet, at the bottom of the body.
  // that way the head can overlap a wall above, which looks right from a top down angle,
  // and the player fits through 1 tile gaps (the whole body is nearly 2 tiles tall)
  feetBox() {
    const w = this.settings.feetWidth;
    const h = this.settings.feetHeight;
    return {
      x: this.x - w / 2,
      y: this.y + this.h / 2 - h,
      w,
      h,
    };
  }

  // the whole body. what attacks hit
  bodyBox() {
    return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };
  }

  // stands it with its feet in the middle of a tile
  placeFeetOnTile(col, row) {
    const centre = standingOnTile(this.settings, col, row);
    this.x = centre.x;
    this.y = centre.y;
  }

  // which tile it's standing on (the one under the middle of its feet), and the damage or healing it
  // does (damagePerStep, damagePerSecond and healPerSecond in tiles.js). it's the same for everyone,
  // so lava hurts enemies too
  checkTile(map, dt) {
    const feet = this.feetBox();
    const col = map.colAt(feet.x + feet.w / 2);
    const row = map.rowAt(feet.y + feet.h / 2);

    // stepped onto a different tile
    if (col !== this.tileCol || row !== this.tileRow) {
      this.tileCol = col;
      this.tileRow = row;
      this.tile = map.get(col, row);
      if (this.tile?.damagePerStep) this.hurt(this.tile.damagePerStep);
    }

    // dt is seconds since the last frame, so this adds up to damagePerSecond each second
    if (this.tile?.damagePerSecond) this.hurt(this.tile.damagePerSecond * dt);
    if (this.tile?.healPerSecond) this.heal(this.tile.healPerSecond * dt);
  }

  // ---------- aiming and attacking ----------

  // turn to face a point. if there's no point, keep facing the same way
  aimAt(point) {
    if (!point) return;

    // how far the point is from the centre, along x and along y
    const dx = point.x - this.x;
    const dy = point.y - this.y;

    // point right on top of it, the angle would flick about wildly, so ignore it
    if (Math.hypot(dx, dy) < AIM.deadzone) return;

    // atan2 turns "this far across, this far down" into an angle
    this.aimAngle = Math.atan2(dy, dx);
    this.facing = directionFromAngle(this.aimAngle);
  }

  // the weapon it would attack with right now (its settings from WEAPONS in weapons.js), or null
  // if it can't attack. enemies have a set weapon in their settings. the player changes this to
  // use whatever it's holding (player.js)
  currentWeapon() {
    return this.settings.weapon ? WEAPONS[this.settings.weapon] : null;
  }

  // swing its weapon the way it's aiming, if it has one and it's ready
  attack() {
    const weapon = this.currentWeapon();
    if (!weapon || this.attackCooldown > 0) return;
    this.swing = new MeleeSwing(this, weapon, this.aimAngle, this.backhand);
    this.backhand = !this.backhand;
    this.attackCooldown = weapon.cooldown;
  }

  // ---------- health ----------

  // take damage. anything can call this: weapons, tiles, traps...
  hurt(amount) {
    if (this.dead) return;
    this.health -= amount;
    this.hurtTimer = this.settings.hurtFlashTime;
    if (this.health <= 0) {
      this.health = 0;
      this.die();
    }
  }

  // get health back, up to its most. anything can call this: tiles, potions...
  heal(amount) {
    if (this.dead) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  // what happens at 0 health. the player and enemies each change this (see their files)
  die() {
    this.dead = true;
  }

  // ---------- drawing ----------

  // uses world positions, so it's drawn between camera.begin() and camera.end().
  // the player and enemies draw like this, npcs change it (npc.js)
  draw() {
    this.drawBody();
    // once it's been hurt, a health bar over its head
    if (this.health < this.maxHealth) this.drawHealthBar();
    if (this.swing) this.swing.draw();
  }

  // a bar over its head showing how much health it has left, in its settings' healthBarColour.
  // the player and enemies draw it once they've been hurt
  drawHealthBar() {
    const w = this.w + 8;
    const x = Math.round(this.x - w / 2);
    const y = Math.round(this.y - this.h / 2) - 10;
    noStroke();
    fill(0, 0, 0, 160);
    rect(x - 1, y - 1, w + 2, 7, 2);
    fill(this.settings.healthBarColour);
    rect(x, y, w * (this.health / this.maxHealth), 5, 2);
  }

  // the body, and which way it's facing. uses world positions, so it's drawn between
  // camera.begin() and camera.end()
  drawBody() {
    const s = this.settings;
    // x, y is the centre, rect() wants the top left corner.
    // rounded to whole pixels so the edges stay sharp instead of going blurry mid-pixel
    const left = Math.round(this.x - this.w / 2);
    const top = Math.round(this.y - this.h / 2);

    if (s.img) {
      image(s.img, left, top, this.w, this.h);
    } else {
      stroke(s.outline);
      strokeWeight(2);
      fill(this.hurtTimer > 0 ? s.hurtColour : s.colour);
      rect(left, top, this.w, this.h);
    }

    // dot towards the 8-way facing direction, shows which sprite would be used
    noStroke();
    fill(s.outline);
    const dotX = this.x + this.facing.x * this.w * 0.3;
    const dotY = this.y + this.facing.y * this.h * 0.3;
    circle(Math.round(dotX), Math.round(dotY), 8);
  }
}
