// anything that walks, has health and fights: the base of the player (player.js), enemies (enemy.js)
// and npcs (npc.js), so they all walk, collide, get hurt and attack the same way.
//
// each frame a character gets controls:
//   { move: { x, y }, aim: { x, y } or null, attack: true or false }
//   move    walk direction, x and y each -1/0/1 (like Input.direction())
//   aim     world position to face, or null to keep facing
//   attack  start a weapon swing (if ready)
// from the keyboard and mouse for the player (sketch.js), from the ai for enemies (enemies.js), so
// enemies can do anything the player can.
//
// settings: PLAYER (config.js), ENEMY_TYPES (enemies.js) or NPC_TYPES (npcs.js):
//   width, height, feetWidth, feetHeight, speed, maxHealth, weapon (enemies),
//   colour, outline, hurtColour, hurtFlashTime, healthBarColour, ai (enemies and npcs)
//
// world (for update() and ais): { map, player, enemies, npcs, characters }, characters being all of
// them in one list (made in sketch.js)

// controls for doing nothing (no ai, or it's waiting)
const STAND_STILL = { move: { x: 0, y: 0 }, aim: null, attack: false };

// distance from a character's centre down to its feet's middle. settings: PLAYER or an enemy/npc type
function feetBelowCentre(settings) {
  return settings.height / 2 - settings.feetHeight / 2;
}

// centre of a character standing with its feet mid-tile. places enemies, npcs and the player's spawn
function standingOnTile(settings, col, row) {
  return { x: (col + 0.5) * TILE, y: (row + 0.5) * TILE - feetBelowCentre(settings) };
}

class Character {
  constructor(x, y, settings) {
    this.settings = settings;

    // centre, world positions (camera.js)
    this.x = x;
    this.y = y;
    this.w = settings.width;
    this.h = settings.height;
    this.speed = settings.speed;
    // px/s. only matters on slippery tiles, where it carries on (walk())
    this.velocity = { x: 0, y: 0 };

    this.maxHealth = settings.maxHealth;
    this.health = this.maxHealth;
    // counts down after a hit; flashes while above 0
    this.hurtTimer = 0;
    // died for good. dead enemies are removed (the player respawns instead)
    this.dead = false;

    // the tile under its feet (tiles.js settings) and its column and row. null until the first update
    this.tile = null;
    this.tileCol = null;
    this.tileRow = null;

    // exact facing in radians (0 right, PI/2 down), for precise things like swing direction
    this.aimAngle = Math.PI / 2;
    // nearest of 8 directions to aimAngle, x and y -1..1, for 8-way things like sprites. both start down
    this.facing = { x: 0, y: 1 };

    // the current swing, or null
    this.swing = null;
    // seconds until it can attack again
    this.attackCooldown = 0;
    // flips each swing so they go back and forth
    this.backhand = false;
  }

  // ---------- every frame ----------

  // controls and world: see the top of this file. dt: seconds since last frame
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

  // who its attacks can hurt; the player and enemies override it
  targets(world) {
    return [];
  }

  // its ai's controls this frame (enemies.js / npcs.js), or STAND_STILL without one. not the player
  think(world, dt) {
    return this.settings.ai ? this.settings.ai(this, world, dt) : STAND_STILL;
  }

  // ---------- moving ----------

  // changes position, not facing, so it can walk one way and aim another. walls and other
  // characters stop it
  walk(dir, dt, world) {
    const map = world.map;
    let dx = dir.x;
    let dy = dir.y;

    // diagonals would be ~1.41x faster; scale by 1/√2
    if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }

    // tile speed (sand slows you)
    const tile = this.tile;
    const speed = this.speed * (tile ? tile.speed : 1);

    // intended velocity plus any tile push (pushSpeed is in tiles)
    const push = PUSH_DIRECTIONS[tile?.pushDirection];
    const pushSpeed = push ? tile.pushSpeed * TILE : 0;
    // instant, except on slippery tiles where it only slowly turns from its old velocity, so it
    // slides (SLIPPERY_GRIP in tiles.js)
    const grip = tile?.slippery ? SLIPPERY_GRIP * (1 - tile.slippery) : Infinity;
    this.velocity.x = approach(this.velocity.x, dx * speed + (push ? push.x * pushSpeed : 0), grip, dt);
    this.velocity.y = approach(this.velocity.y, dy * speed + (push ? push.y * pushSpeed : 0), grip, dt);

    // x then y, so angled collisions slide along. each: the map limits the feet at walls
    // (tilemap.js), then other characters' feet cut it shorter
    const feet = this.feetBox();
    const moveX = this.stopAtOthers(world, feet, 'x', map.moveAlongX(feet, this.velocity.x * dt));
    feet.x += moveX;
    const moveY = this.stopAtOthers(world, feet, 'y', map.moveAlongY(feet, this.velocity.y * dt));
    this.x += moveX;
    this.y += moveY;
    // bumping stops sliding that way
    if (dt > 0) {
      this.velocity.x = moveX / dt;
      this.velocity.y = moveY / dt;
    }

    // feet stop at the map edge, but the head could poke off the top, so stop at that too. skipped
    // on maps shorter than the character, where it'd push the feet off the bottom
    const edges = map.bounds();
    const headLimit = edges.top + this.h / 2;
    if (edges.bottom - edges.top >= this.h && this.y < headLimit) this.y = headLimit;
  }

  // cuts amount (movement on 'x' or 'y') so the feet stop flush against any living character's feet.
  // only feet collide, so bodies can overlap (one standing in front of another). loops
  // world.characters directly: every character does this every frame
  stopAtOthers(world, feet, axis, amount) {
    if (amount === 0) return 0;
    const size = axis === 'x' ? 'w' : 'h';
    for (const other of world.characters) {
      if (other === this || other.dead) continue;
      const theirs = other.feetBox();
      // already overlapping (e.g. teleported onto them): let them walk apart rather than both stick
      if (boxesOverlap(feet, theirs)) continue;
      const moved = { ...feet, [axis]: feet[axis] + amount };
      if (!boxesOverlap(moved, theirs)) continue;
      // our front edge on their near edge
      amount = amount > 0
        ? theirs[axis] - (feet[axis] + feet[size])
        : (theirs[axis] + theirs[size]) - feet[axis];
    }
    return amount;
  }

  // the colliding part: just the feet at the body's bottom, so the head can overlap a wall above
  // (right for top down) and the ~2 tile tall player fits 1 tile gaps
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

  // the whole body; what attacks hit
  bodyBox() {
    return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };
  }

  placeFeetOnTile(col, row) {
    const centre = standingOnTile(this.settings, col, row);
    this.x = centre.x;
    this.y = centre.y;
  }

  // tracks the tile under the feet' middle and applies its damage/healing (damagePerStep,
  // damagePerSecond, healPerSecond in tiles.js). same for everyone, so lava hurts enemies too
  checkTile(map, dt) {
    const feet = this.feetBox();
    const col = map.colAt(feet.x + feet.w / 2);
    const row = map.rowAt(feet.y + feet.h / 2);

    // stepped onto a new tile
    if (col !== this.tileCol || row !== this.tileRow) {
      this.tileCol = col;
      this.tileRow = row;
      this.tile = map.get(col, row);
      if (this.tile?.damagePerStep) this.hurt(this.tile.damagePerStep);
    }

    if (this.tile?.damagePerSecond) this.hurt(this.tile.damagePerSecond * dt);
    if (this.tile?.healPerSecond) this.heal(this.tile.healPerSecond * dt);
  }

  // ---------- aiming and attacking ----------

  // face a point; null keeps facing
  aimAt(point) {
    if (!point) return;

    const dx = point.x - this.x;
    const dy = point.y - this.y;

    // too close: the angle would flick about
    if (Math.hypot(dx, dy) < AIM.deadzone) return;

    this.aimAngle = Math.atan2(dy, dx);
    this.facing = directionFromAngle(this.aimAngle);
  }

  // its weapon now (WEAPONS settings, weapons.js), or null. enemies' is fixed in settings; the player
  // overrides this to use the held item (player.js)
  currentWeapon() {
    return this.settings.weapon ? WEAPONS[this.settings.weapon] : null;
  }

  // swing towards the aim, if armed and ready
  attack() {
    const weapon = this.currentWeapon();
    if (!weapon || this.attackCooldown > 0) return;
    this.swing = new MeleeSwing(this, weapon, this.aimAngle, this.backhand);
    this.backhand = !this.backhand;
    this.attackCooldown = weapon.cooldown;
  }

  // ---------- health ----------

  // anything can call it: weapons, tiles, traps...
  hurt(amount) {
    if (this.dead) return;
    this.health -= amount;
    this.hurtTimer = this.settings.hurtFlashTime;
    if (this.health <= 0) {
      this.health = 0;
      this.die();
    }
  }

  // up to max. anything can call it: tiles, potions...
  heal(amount) {
    if (this.dead) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  // at 0 health; the player and enemies override it
  die() {
    this.dead = true;
  }

  // ---------- drawing ----------

  // world positions (inside camera.begin/end). npcs override it (npc.js)
  draw() {
    this.drawBody();
    // health bar once hurt
    if (this.health < this.maxHealth) this.drawHealthBar();
    if (this.swing) this.swing.draw();
  }

  // overhead health bar in healthBarColour
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

  // body and facing, world positions (inside camera.begin/end)
  drawBody() {
    const s = this.settings;
    // top left, rounded to whole pixels for sharp edges
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

    // dot towards the 8-way facing, showing which sprite would be used
    noStroke();
    fill(s.outline);
    const dotX = this.x + this.facing.x * this.w * 0.3;
    const dotY = this.y + this.facing.y * this.h * 0.3;
    circle(Math.round(dotX), Math.round(dotY), 8);
  }
}
