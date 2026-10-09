// anything that walks, has health and fights. the player (player.js), enemies (enemy.js) and npcs
// (npc.js) are all built on this, so they all walk, bump into things, get hurt and attack the same way.
//
// every frame a character gets given controls:
//   { move: { x, y }, aim: { x, y } or null, attack: true or false }
//   move    which way to walk, x and y each -1, 0 or 1 (like Input.direction())
//   aim     a world position to face, or null to keep facing the same way
//   attack  swing or shoot its weapon (if it's ready)
// the player's come from the keyboard and mouse (sketch.js) and enemies' come from their ai
// (enemies.js), so enemies can do anything the player can.
//
// the settings come from PLAYER (config.js), ENEMY_TYPES (enemies.js) or NPC_TYPES (npcs.js):
//   width, height, feetWidth, feetHeight, speed, maxHealth, weapon (enemies),
//   colour, outline, hurtColour, hurtFlashTime, healthBarColour, ai (enemies and npcs),
//   hitParticles, deathParticles (optional)
//
// world (for update() and ais) is { map, players, enemies, npcs, characters, arrows }, where characters
// is all of them in one list and arrows the ones in the air (sketch.js makes it, weapons.js has
// Arrow). players is a list so there can be more than one, so
// find them with nearestPlayer() and never assume there's only one

// controls for doing nothing (no ai, or it's waiting for something)
const STAND_STILL = { move: { x: 0, y: 0 }, aim: null, attack: false };

// the player in world.players that's closest to `from` (anything with an x and y), or null if there
// aren't any
function nearestPlayer(world, from) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const player of world.players) {
    const distance = Math.hypot(player.x - from.x, player.y - from.y);
    if (distance < nearestDistance) {
      nearest = player;
      nearestDistance = distance;
    }
  }
  return nearest;
}

// how far it is from a character's middle down to the middle of its feet. settings is PLAYER or an
// enemy or npc type
function feetBelowCentre(settings) {
  return settings.height / 2 - settings.feetHeight / 2;
}

// where a character's middle is when it's standing with its feet in the middle of a tile. used to
// place enemies, npcs and the player's spawn
function standingOnTile(settings, col, row) {
  return { x: (col + 0.5) * TILE, y: (row + 0.5) * TILE - feetBelowCentre(settings) };
}

class Character {
  constructor(x, y, settings) {
    this.settings = settings;

    // its middle, in world positions (camera.js)
    this.x = x;
    this.y = y;
    this.w = settings.width;
    this.h = settings.height;
    this.speed = settings.speed;
    // px/s. only really matters on slippery tiles, where it keeps you sliding (walk())
    this.velocity = { x: 0, y: 0 };

    this.maxHealth = settings.maxHealth;
    this.health = this.maxHealth;
    // counts down after getting hit, and it flashes while this is above 0
    this.hurtTimer = 0;
    // died for good. dead enemies get removed (the player respawns instead)
    this.dead = false;
    // the particle effects (PARTICLE_EFFECTS names, particles.js) that burst out when a swing hits it
    // and when it dies, or null for none. an enemy spawn can pick its own (spawnCharacters(), sketch.js)
    this.hitParticles = settings.hitParticles ?? null;
    this.deathParticles = settings.deathParticles ?? null;

    // the tile under its feet (its tiles.js settings) and that tile's column and row. null until the
    // first update
    this.tile = null;
    this.tileCol = null;
    this.tileRow = null;

    // the exact way it's facing in radians (0 is right, PI/2 is down), for things that need to be
    // precise like which way to swing
    this.aimAngle = Math.PI / 2;
    // the closest of 8 directions to aimAngle, x and y from -1 to 1, for 8 way things like sprites.
    // both start off facing down
    this.facing = { x: 0, y: 1 };

    // the swing that's happening, or null
    this.swing = null;
    // seconds until it can attack again
    this.attackCooldown = 0;
    // flips every swing so they go back and forth
    this.backhand = false;
  }

  // ---------- every frame ----------

  // controls and world are explained at the top of this file. dt is the seconds since last frame
  update(controls, dt, world) {
    this.walk(controls.move, dt, world);
    this.aimAt(controls.aim);
    if (controls.attack) this.attack(world);

    if (this.swing) {
      this.swing.update(dt, this.targets(world));
      if (this.swing.finished) this.swing = null;
    }

    this.checkTile(world.map, dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
  }

  // who its attacks can hurt. the player and enemies replace this with their own
  targets(world) {
    return [];
  }

  // the controls from its ai this frame (enemies.js / npcs.js), or STAND_STILL if it doesn't have
  // one. not used for the player
  think(world, dt) {
    return this.ai ? this.ai(this, world, dt) : STAND_STILL;
  }

  // ---------- moving ----------

  // changes where it is but not which way it's facing, so it can walk one way and aim another. walls
  // and other characters stop it
  walk(dir, dt, world) {
    const map = world.map;
    let dx = dir.x;
    let dy = dir.y;

    // going diagonally would be about 1.41x faster, so scale it down by 1/sqrt(2)
    if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }

    // the tile's speed (sand slows you down)
    const tile = this.tile;
    const speed = this.speed * (tile ? tile.speed : 1);

    // the velocity it wants plus any push from the tile (pushSpeed is in tiles)
    const push = PUSH_DIRECTIONS[tile?.pushDirection];
    const pushSpeed = push ? tile.pushSpeed * TILE : 0;
    // changes straight away, except on slippery tiles where it only turns slowly from its old
    // velocity, which is what makes it slide (SLIPPERY_GRIP in tiles.js)
    const grip = tile?.slippery ? SLIPPERY_GRIP * (1 - tile.slippery) : Infinity;
    this.velocity.x = approach(this.velocity.x, dx * speed + (push ? push.x * pushSpeed : 0), grip, dt);
    this.velocity.y = approach(this.velocity.y, dy * speed + (push ? push.y * pushSpeed : 0), grip, dt);

    // x and then y, so it slides along things it hits at an angle. for each one the map stops the feet
    // at walls (tilemap.js), and then other characters' feet can cut it shorter
    const feet = this.feetBox();
    const moveX = this.stopAtOthers(world, feet, 'x', map.moveAlongX(feet, this.velocity.x * dt));
    feet.x += moveX;
    const moveY = this.stopAtOthers(world, feet, 'y', map.moveAlongY(feet, this.velocity.y * dt));
    this.x += moveX;
    this.y += moveY;
    // bumping into something stops you sliding that way
    if (dt > 0) {
      this.velocity.x = moveX / dt;
      this.velocity.y = moveY / dt;
    }

    // the feet stop at the edge of the map, but the head could still poke off the top, so stop that
    // too. skipped on maps shorter than the character, because there it would push the feet off the
    // bottom
    const edges = map.bounds();
    const headLimit = edges.top + this.h / 2;
    if (edges.bottom - edges.top >= this.h && this.y < headLimit) this.y = headLimit;
  }

  // cuts down amount (movement along 'x' or 'y') so the feet stop right up against any living
  // character's feet. only feet bump, so bodies can overlap (one standing in front of another). it
  // loops world.characters directly since every character does this every frame. nobody pushes
  // anyone, so enemies blocking each other stay stuck until one moves. the pathfinders notice that and
  // give way (checkStuck() in pathfinding.js)
  stopAtOthers(world, feet, axis, amount) {
    if (amount === 0) return 0;
    const size = axis === 'x' ? 'w' : 'h';
    for (const other of world.characters) {
      if (other === this || other.dead) continue;
      const theirs = other.feetBox();
      // already overlapping (like if one got teleported onto the other): let them walk apart instead of
      // both getting stuck
      if (boxesOverlap(feet, theirs)) continue;
      const moved = { ...feet, [axis]: feet[axis] + amount };
      if (!boxesOverlap(moved, theirs)) continue;
      // put our front edge on their near edge
      amount = amount > 0
        ? theirs[axis] - (feet[axis] + feet[size])
        : (theirs[axis] + theirs[size]) - feet[axis];
    }
    return amount;
  }

  // the part that bumps into things, which is just the feet at the bottom of the body. that way the
  // head can overlap a wall above it (which looks right for top down) and the player, who's about 2
  // tiles tall, fits through 1 tile gaps
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

  // the whole body, which is what attacks hit
  bodyBox() {
    return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };
  }

  placeFeetOnTile(col, row) {
    const centre = standingOnTile(this.settings, col, row);
    this.x = centre.x;
    this.y = centre.y;
  }

  // keeps track of the tile under the middle of the feet and applies its damage or healing
  // (damagePerStep, damagePerSecond, healPerSecond in tiles.js). it's the same for everyone, so lava
  // hurts enemies too
  checkTile(map, dt) {
    const feet = this.feetBox();
    const col = map.colAt(feet.x + feet.w / 2);
    const row = map.rowAt(feet.y + feet.h / 2);

    // just stepped onto a new tile
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

  // face towards a point. null keeps facing the same way
  aimAt(point) {
    if (!point) return;

    const dx = point.x - this.x;
    const dy = point.y - this.y;

    // too close, the angle would flick all over the place
    if (Math.hypot(dx, dy) < AIM.deadzone) return;

    this.aimAngle = Math.atan2(dy, dx);
    this.facing = directionFromAngle(this.aimAngle);
  }

  // the weapon it's using right now (its settings, makeWeapon() in weapons.js), or null. an enemy's is
  // in its file, and the player replaces this to use whatever item it's holding (player.js)
  currentWeapon() {
    return this.settings.weapon ?? null;
  }

  // swings or shoots towards where it's aiming (its weapon's attack, weapons.js), if it has a weapon
  // and it's ready. arrows go in world.arrows, since they keep flying after the attack's over
  attack(world) {
    const weapon = this.currentWeapon();
    if (!weapon || this.attackCooldown > 0) return;
    this.attackCooldown = weapon.cooldown;
    if (weapon.attack === 'shoot') {
      world.arrows.push(new Arrow(this, weapon, this.aimAngle));
      return;
    }
    this.swing = new MeleeSwing(this, weapon, this.aimAngle, this.backhand);
    this.backhand = !this.backhand;
  }

  // the item types it's wearing (their wear setting, items.js), drawn on its body. the player and
  // enemies replace this with their own
  worn() {
    return [];
  }

  // ---------- health ----------

  // anything can call this: weapons, tiles, traps...
  hurt(amount) {
    if (this.dead) return;
    this.health -= amount;
    this.hurtTimer = this.settings.hurtFlashTime;
    if (this.health <= 0) {
      this.health = 0;
      this.die();
    }
  }

  // heals up to max health. anything can call this: tiles, potions...
  heal(amount) {
    if (this.dead) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  // runs at 0 health. the player and enemies replace this with their own
  die() {
    this.dead = true;
  }

  // a particle effect (a PARTICLE_EFFECTS name or null, particles.js) bursting out of the middle of
  // its body, fanned out towards angle (radians), or all round if that's left out. the picture and
  // bits shapes use its picture if the effect hasn't got one
  burstParticles(effect, angle) {
    if (!effect) return;
    const down = feetBelowCentre(this.settings);
    Particles.burst(effect, this.x, this.y + down, { height: down, angle, img: this.settings.img });
  }

  // ---------- drawing ----------

  // world positions (inside camera.begin/end). npcs have their own (npc.js)
  draw() {
    this.drawBody();
    // health bar once it's been hurt
    if (this.health < this.maxHealth) this.drawHealthBar();
    if (this.swing) this.swing.draw();
  }

  // the health bar over its head, in healthBarColour
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

  // the body, what it's wearing and which way it's facing, in world positions (inside camera.begin/end)
  drawBody() {
    drawCharacter(this.settings, this.x, this.y, { facing: this.facing, hurt: this.hurtTimer > 0, worn: this.worn() });
  }
}

// where each wear place (WEAR_PLACES in items.js) goes on the placeholder body, as the top and bottom
// of a band across it, in parts of its height from the top. accessories go down its side instead
const WORN_BANDS = {
  head: [0, 0.26],
  body: [0.3, 0.62],
  legs: [0.62, 0.86],
  feet: [0.86, 1],
};

// a character's body (its picture, or a placeholder rectangle) with what it's wearing on top and a dot
// towards whichever of the 8 directions it's facing, to show which sprite it would use. settings is
// PLAYER or an enemy or npc type, and x, y its middle. Character.drawBody() draws it on the map, and
// the inventory and the editor's enemy and npc boxes draw big ones (CharacterPreview, inventory.js).
//   facing  { x, y } each -1 to 1 (Character.facing), normally down
//   hurt    flash its hurtColour
//   worn    item types it's wearing (Character.worn())
function drawCharacter(settings, x, y, { facing = { x: 0, y: 1 }, hurt = false, worn = [] } = {}) {
  const w = settings.width;
  const h = settings.height;
  // top left, rounded to whole pixels so the edges are sharp
  const left = Math.round(x - w / 2);
  const top = Math.round(y - h / 2);

  if (settings.img) {
    image(settings.img, left, top, w, h);
  } else {
    stroke(settings.outline);
    strokeWeight(2);
    fill(hurt ? settings.hurtColour : settings.colour);
    rect(left, top, w, h);
  }

  // ponytail: worn things are bands in their colour (or their picture stretched over the band) until
  // there are sprites for them, which would be drawn over the body's sprite here instead
  let accessories = 0;
  for (const type of worn) {
    stroke(0, 0, 0, 90);
    strokeWeight(1);
    fill(type.fill);
    const band = WORN_BANDS[type.wear];
    if (band) {
      const bandTop = top + Math.round(band[0] * h);
      const bandH = Math.round((band[1] - band[0]) * h);
      if (type.img) image(type.img, left - 1, bandTop, w + 2, bandH);
      else rect(left - 1, bandTop, w + 2, bandH, 2);
    } else {
      // accessories: little gems down its right side, from the waist
      circle(left + w, top + Math.round(h * 0.45) + accessories * 7, 6);
      accessories++;
    }
  }

  noStroke();
  fill(settings.outline);
  circle(Math.round(x + facing.x * w * 0.3), Math.round(y + facing.y * h * 0.3), 8);
}
