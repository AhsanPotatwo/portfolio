// anything that walks, has health and fights. the player (player.js), enemies (enemy.js) and npcs
// (npc.js) are all built on this, so they all walk, bump into things, get hurt and attack the same way.
//
// every frame a character gets given controls:
//   { move: { x, y }, aim: { x, y } or null, attack: true or false }
//   move    which way to walk, x and y each -1, 0 or 1 (like Input.direction())
//   aim     a world position to face, or null to keep facing the same way
//   attack  swing or shoot its weapon (if it's ready, or within COMBAT.attackBuffer of being ready)
//   charge  optional, attack is being held down, for weapons that draw before shooting (a bow with a
//           chargeTime, updateCharge()). ais leave it out and just keep attacking, which lets go once
//           it's fully drawn
//   roll    optional, dodge roll (startRoll()), only while wearing something that lets it
//           (canRoll()). ais leave it out
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
    // px/s it's being shoved on top of walking, by knockback, lunges and recoil (pushTowards()). it
    // slows to a stop (COMBAT.pushFade) or stops at whatever it hits
    this.pushVelocity = { x: 0, y: 0 };
    // a shove that takes over walking is going (pushTowards(), pushedHard())
    this.pushLocked = false;
    // px walked since the last footstep, and that step's sound (footstep())
    this.stepDistance = FOOTSTEPS.stride * FOOTSTEPS.firstStep;
    this.lastStep = null;

    this.maxHealth = settings.maxHealth;
    this.health = this.maxHealth;
    // counts down after getting hit, and it flashes while this is above 0
    this.hurtTimer = 0;
    // died for good. dead enemies get removed (the player lies there until the death screen's Respawn,
    // deathscreen.js)
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
    // seconds an attack it asked for is still waiting to happen (COMBAT.attackBuffer)
    this.attackBuffer = 0;
    // flips every swing so they go back and forth
    this.backhand = false;
    // its weapon's combo (weapons.js): the hit it's on (from 0), the weapon that's for, and the seconds
    // left to attack again before it starts over
    this.comboStep = 0;
    this.comboWeapon = null;
    this.comboLeft = 0;
    // seconds it's been drawing a shot (updateCharge()) and the weapon it's drawing, or null
    this.charge = null;
    this.chargeWeapon = null;
    // its weapon's drawSound playing while it draws (Sound.play()'s voice), or null
    this.drawVoice = null;
    // the dodge roll that's happening ({ angle, time }, time is seconds since it started), or null.
    // seconds until it can roll again, and seconds a roll it asked for is still waiting (like
    // attackBuffer)
    this.roll = null;
    this.rollCooldown = 0;
    this.rollBuffer = 0;

    // getting hit (hitWith() in weapons.js). frozen: seconds it stands still mid-hit (the hit stop).
    // stagger: seconds it can't walk or attack
    this.frozen = 0;
    this.stagger = 0;
    // seconds it can't be hit again after a hit, blinking (its hitInvincible), and seconds it's drawn
    // squashed (COMBAT.squashTime)
    this.invincible = 0;
    this.squash = 0;
    // where the light trail of lost health on its health bar has drained down to (drawHealthBar())
    this.trailHealth = this.maxHealth;
    // set on the weapon editor's preview characters, which make no damage numbers, and sounds only
    // while they're audible (WeaponPreview, weaponeditor.js)
    this.inPreview = false;
    // the camera (camera.js) that shakes when it hits something or gets hit, or null. only this
    // computer's player has one (sketch.js), and the weapon editor's preview has its own
    this.camera = null;
    // new combat state that shouldn't carry over needs resetting in two places too: Player.placeAt()
    // (respawning, warps) and WeaponPreview.start() (each go of the editor's preview, weaponeditor.js)
  }

  // ---------- every frame ----------

  // controls and world are explained at the top of this file. dt is the seconds since last frame.
  // the order matters:
  //   1. an attack click is remembered (attackBuffer) before anything can skip it
  //   2. frozen (the hit stop, freeze()) skips everything else, timers too, so it all picks up where
  //      it left off, and knockback from the hit starts once the freeze is over
  //   3. staggered or being shoved hard (pushedHard()) means no walking. a stagger also cancels a swing
  //      that's still winding up or a roll, and stops attacking
  //   4. a roll starts if one's been asked for and it can (canRoll()), and moves it along (rollOn())
  //   5. walking, including any shove (walk(), pushVelocity). not while rolling
  //   6. attacking: a bow with a chargeTime draws and lets go (updateCharge()), anything else attacks
  //      straight away if one's been asked for (attack(), which handles combos). not while rolling
  //   7. the swing in progress hits things (MeleeSwing.update() in weapons.js, which calls hitWith())
  //   8. tile damage, then every timer counts down
  // everything combat keeps is per character (nothing pauses the world), so it's multiplayer-safe
  update(controls, dt, world) {
    // remembered first, so a click during a hit stop or just before the weapon's ready still counts
    if (controls.attack) this.attackBuffer = COMBAT.attackBuffer;
    if (controls.roll) this.rollBuffer = COMBAT.attackBuffer;
    if (this.frozen > 0) {
      this.frozen -= dt;
      return;
    }

    const staggered = this.stagger > 0;
    // getting hit while winding up a heavy swing stops it (MeleeSwing in weapons.js), and getting hit
    // once a roll's invincible bit is over stops the roll
    if (staggered && this.swing?.windingUp) this.swing = null;
    if (staggered) this.roll = null;
    if (this.rollBuffer > 0 && this.canRoll(staggered)) this.startRoll(controls.move);
    // before walk(), which keeps the head on the map
    if (this.roll) this.rollOn(dt, world);
    this.walk(staggered || this.roll || this.pushedHard() ? STAND_STILL.move : controls.move, dt, world);
    this.aimAt(controls.aim);
    const weapon = this.currentWeapon();
    if (chargesUp(weapon)) {
      this.updateCharge(controls, weapon, staggered || this.roll !== null, dt, world);
    } else {
      this.stopDrawing();
      if (!staggered && !this.roll && this.attackBuffer > 0) this.attack(world);
    }

    if (this.swing) {
      this.swing.update(dt, this.targets(world), world.map);
      if (this.swing.finished) this.swing = null;
    }

    this.checkTile(world.map, dt);
    // the trail waits for the hurt flash, then drains down. healing tops it straight up
    if (this.hurtTimer === 0) this.trailHealth = Math.max(this.health, this.trailHealth - this.maxHealth * COMBAT.healthDrain * dt);
    this.trailHealth = Math.max(this.trailHealth, this.health);
    for (const timer of ['hurtTimer', 'attackCooldown', 'attackBuffer', 'comboLeft', 'stagger', 'rollCooldown', 'rollBuffer', 'invincible', 'squash']) {
      this[timer] = Math.max(0, this[timer] - dt);
    }
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

    // the tile's speed (sand slows you down), the weapon in hand's carrySpeed (a heavy axe slows you),
    // and slower while drawing a shot (chargeSlow, weapons.js)
    const tile = this.tile;
    const carry = this.currentWeapon()?.carrySpeed ?? 1;
    const speed = this.speed * (tile ? tile.speed : 1) * carry * (this.charge !== null ? this.chargeWeapon.chargeSlow : 1);

    // the velocity it wants plus any push from the tile (pushSpeed is in tiles)
    const push = PUSH_DIRECTIONS[tile?.pushDirection];
    const pushSpeed = push ? tile.pushSpeed * TILE : 0;
    // changes straight away, except on slippery tiles where it only turns slowly from its old
    // velocity, which is what makes it slide (SLIPPERY_GRIP in tiles.js)
    const grip = tile?.slippery ? SLIPPERY_GRIP * (1 - tile.slippery) : Infinity;
    this.velocity.x = approach(this.velocity.x, dx * speed + (push ? push.x * pushSpeed : 0), grip, dt);
    this.velocity.y = approach(this.velocity.y, dy * speed + (push ? push.y * pushSpeed : 0), grip, dt);

    const moved = this.moveBy(world, this.velocity.x * dt, this.velocity.y * dt);
    // bumping into something stops you sliding that way
    if (dt > 0) {
      this.velocity.x = moved.x / dt;
      this.velocity.y = moved.y / dt;
    }
    // steps go by how far walking really moved it, so walking into a wall is silent, and so are
    // sliding and being pushed while standing still
    if (dx || dy) this.footstep(map, Math.hypot(moved.x, moved.y));
    else this.stepDistance = FOOTSTEPS.stride * FOOTSTEPS.firstStep;

    // being shoved (pushTowards()) goes on top, slowing down, and bumping into something stops it
    // that way too
    const shove = this.pushVelocity;
    if (shove.x || shove.y) {
      const want = { x: shove.x * dt, y: shove.y * dt };
      const pushed = this.moveBy(world, want.x, want.y);
      for (const axis of ['x', 'y']) {
        shove[axis] = pushed[axis] === want[axis] ? approach(shove[axis], 0, COMBAT.pushFade, dt) : 0;
      }
      if (Math.hypot(shove.x, shove.y) < 5) shove.x = shove.y = 0;
    }

    // the feet stop at the edge of the map, but the head could still poke off the top, so stop that
    // too. skipped on maps shorter than the character, because there it would push the feet off the
    // bottom
    const edges = map.bounds();
    const headLimit = edges.top + this.h / 2;
    if (edges.bottom - edges.top >= this.h && this.y < headLimit) this.y = headLimit;
  }

  // moves it by dx, dy px as far as it can go, and gives back how far it went. x and then y, so it
  // slides along things it hits at an angle. for each one the map stops the feet at walls
  // (tilemap.js), and then other characters' feet can cut it shorter
  moveBy(world, dx, dy) {
    const feet = this.feetBox();
    const x = this.stopAtOthers(world, feet, 'x', world.map.moveAlongX(feet, dx));
    feet.x += x;
    const y = this.stopAtOthers(world, feet, 'y', world.map.moveAlongY(feet, dy));
    this.x += x;
    this.y += y;
    return { x, y };
  }

  // counts up px walked, and every FOOTSTEPS.stride (config.js) plays a step from the tile it's on
  // (stepSounds and the rest in tiles.js) at its feet. one of the tile's sounds at random, never the
  // last one again if there's a choice. other people's are quieter (othersVolume), and ones too far
  // away to hear don't play at all, so a crowd of enemies doesn't pile up sounds. doppler's off, or
  // your own steps would bend as you walk away from them
  footstep(map, walked) {
    this.stepDistance += walked;
    if (this.stepDistance < FOOTSTEPS.stride) return;
    this.stepDistance %= FOOTSTEPS.stride;
    const tile = this.tile;
    // the editor's weapon preview walks too (weaponeditor.js)
    if (!tile?.stepSounds?.length || this.inPreview) return;
    const choices = tile.stepSounds.length > 1 ? tile.stepSounds.filter((name) => name !== this.lastStep) : tile.stepSounds;
    const name = choices[Math.floor(Math.random() * choices.length)];
    this.lastStep = name;
    const sound = SOUNDS[name]; // sound.js
    const volume = tile.stepVolume * (this.camera ? 1 : FOOTSTEPS.othersVolume);
    const feet = this.feetBox();
    const at = { x: feet.x + feet.w / 2, y: feet.y + feet.h / 2, map };
    const range = tile.stepRange || sound?.range;
    if (!sound || volume <= 0 || Sound.volumeAt(at, range) === 0) return;
    const vary = tile.stepPitchVariety;
    playSound(sound, at, null, { rate: tile.stepPitch * randomBetween(1 - vary, 1 + vary), volume, range, doppler: 0 });
  }

  // shoves it speed px/s towards angle (radians), on top of anything already shoving it. knockback,
  // lunges and recoil all use this. takeOver (knockback and recoil) means it can't walk until the shove
  // has slowed to COMBAT.pushLockEnd, so walking against it doesn't cut it short (pushedHard())
  pushTowards(angle, speed, takeOver = false) {
    this.pushVelocity.x += Math.cos(angle) * speed;
    this.pushVelocity.y += Math.sin(angle) * speed;
    if (takeOver && speed > 0) this.pushLocked = true;
  }

  // is a takeOver shove (pushTowards()) still going strong enough to stop it walking?
  pushedHard() {
    if (this.pushLocked && Math.hypot(this.pushVelocity.x, this.pushVelocity.y) < COMBAT.pushLockEnd) this.pushLocked = false;
    return this.pushLocked;
  }

  // ---------- dodge rolling ----------

  // only while wearing something that lets it (an item with roll, like the quick charm, items.js), and
  // not mid-swing, staggered, being shoved hard or already rolling. a press that can't roll yet is
  // remembered (rollBuffer)
  canRoll(staggered) {
    return this.worn().some((type) => type.roll) && !this.roll && !this.swing && !staggered && this.rollCooldown === 0 && !this.pushedHard();
  }

  // a roll (ROLL in config.js) the way it's walking, or the way it's facing if it's standing still
  startRoll(move) {
    const angle = move.x || move.y ? Math.atan2(move.y, move.x) : this.aimAngle;
    this.roll = { angle, time: 0 };
    this.rollCooldown = ROLL.cooldown;
    this.rollBuffer = 0;
  }

  // moves it along its roll until ROLL.time is up. slower on the same tiles and with the same weapons
  // walking is (walk())
  rollOn(dt, world) {
    const speed = ROLL.speed * (this.tile ? this.tile.speed : 1) * (this.currentWeapon()?.carrySpeed ?? 1);
    this.moveBy(world, Math.cos(this.roll.angle) * speed * dt, Math.sin(this.roll.angle) * speed * dt);
    this.roll.time += dt;
    if (this.roll.time >= ROLL.time) this.roll = null;
  }

  // can attacks hit it? not once it's dead, in the invincible start of a roll (ROLL.invincible), or
  // just after a hit (its hitInvincible). swings and arrows check this (weapons.js), so a swing it rolls
  // through can still catch it after
  hittable() {
    return !this.dead && this.invincible === 0 && !(this.roll && this.roll.time < ROLL.invincible);
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

  // its hitbox, what attacks hit: its width x height, or only ROLL.height as tall while rolling, still
  // standing on its feet. what's drawn doesn't change it (drawBody())
  bodyBox() {
    const h = this.roll ? this.h * ROLL.height : this.h;
    return { x: this.x - this.w / 2, y: this.y + this.h / 2 - h, w: this.w, h };
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

  // swings or shoots towards where it's aiming (its weapon's attack, WEAPON_ATTACKS in weapons.js), if
  // it has a weapon and it's ready. a weapon with a combo does its next hit, or starts over if it
  // waited too long or changed weapon. power is how far drawn a shot was (chargePower() in
  // weapons.js), 1 for full
  attack(world, power = 1) {
    const weapon = this.currentWeapon();
    if (!weapon || this.attackCooldown > 0) return;
    if (weapon !== this.comboWeapon || this.comboLeft <= 0) this.comboStep = 0;
    const hit = wieldedHit(poweredHit(comboHit(weapon, this.comboStep), power), this.settings); // weapons.js
    this.comboWeapon = weapon;
    this.comboStep++;
    this.comboLeft = hit.cooldown + weapon.comboWindow;
    this.attackCooldown = hit.cooldown;
    this.attackBuffer = 0;
    WEAPON_ATTACKS[hit.attack].start(this, hit, world, power);
  }

  // drawing a weapon that charges up (chargesUp() in weapons.js): it starts drawing once it's ready
  // and attack is held, walks slower while drawing (walk()), and shoots when let go, harder the longer
  // it was drawn. the player holds the mouse (controls.charge); ais leave that out and keep attacking,
  // so they let go once it's fully drawn. getting staggered or changing weapon loses the shot. its
  // drawSound plays from the start of the draw until it shoots or loses it
  updateCharge(controls, weapon, staggered, dt, world) {
    if (staggered || (this.charge !== null && this.chargeWeapon !== weapon)) {
      this.stopDrawing();
      return;
    }
    const holding = controls.charge ?? (controls.attack && (this.charge ?? 0) < weapon.chargeTime);
    if (holding && this.charge !== null) {
      this.charge += dt;
    } else if (holding && this.attackCooldown === 0) {
      this.charge = 0;
      this.chargeWeapon = weapon;
      this.drawVoice = weaponSound(this, weapon.drawSound, weapon); // weapons.js
    } else if (!holding && this.charge !== null) {
      this.attack(world, chargePower(weapon, this.charge));
      this.stopDrawing();
    }
  }

  // not drawing a shot any more (charge), and its drawSound is cut off
  stopDrawing() {
    this.charge = null;
    if (this.drawVoice) Sound.stop(this.drawVoice); // sound.js
    this.drawVoice = null;
  }

  // the item types it's wearing (their wear setting, items.js), drawn on its body. the player and
  // enemies replace this with their own
  worn() {
    return [];
  }

  // the item type in its hand (items.js), drawn small beside it, or null. a kind's own weapon (like the
  // grunt's claws) isn't an item, so it doesn't show
  heldItem() {
    return null;
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

  // the hit stop: stands still for `seconds` after hitting or being hit (a weapon's hitStop, weapons.js)
  //
  // multiplayer: this is the pause you feel when you hit something. it only freezes the two characters
  // involved, never the world, so it's fine for everyone else. the trouble is lag: whoever runs the
  // rules decides the hit, so by the time your computer hears about it you've already walked on, and
  // the freeze would snap you back. the usual fix is to guess the hit on your own computer straight
  // away (and freeze there), then correct if the server disagrees. getting hit by an enemy is the same
  // the other way round. either way, keep the freezes short (COMBAT.killHitStop, config.js, is the
  // longest)
  freeze(seconds) {
    this.frozen = Math.max(this.frozen, seconds);
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
    if (this.trailHealth < this.maxHealth) this.drawHealthBar();
    if (this.swing) this.swing.draw();
    // how far the shot it's drawing would fly (weapons.js)
    if (this.charge !== null) drawChargeLine(this, this.chargeWeapon, this.charge);
  }

  // what its picture shows now (CHARACTER_STATES) and how many seconds it's been doing it, for its
  // animation: dead, rolling, hurt, attacking (swinging, or drawing a bow), walking or standing.
  // another swing starts the attack over. only for drawing, so it goes by the page's clock
  artState() {
    const moving = Math.hypot(this.velocity.x, this.velocity.y) > 5;
    const state = this.dead ? 'death' : this.roll ? 'roll' : this.hurtTimer > 0 ? 'hurt' : this.swing || this.charge !== null ? 'attack' : moving ? 'walk' : 'idle';
    const now = millis() / 1000;
    if (state !== this.shown?.state || (state === 'attack' && this.swing !== this.shown.swing)) this.shown = { state, swing: this.swing, since: now };
    return { state, time: now - this.shown.since };
  }

  // the health bar over its head, in healthBarColour, with the health it just lost as a light trail
  // that drains away (trailHealth). UI_ART's healthBar and healthFill (config.js) replace the dark
  // back and the colour
  drawHealthBar() {
    const w = this.w + 8;
    const x = Math.round(this.x - w / 2);
    const y = Math.round(this.y - this.h / 2) - 10;
    noStroke();
    if (!drawArtBox(uiArt('healthBar'), x - 1, y - 1, w + 2, 7)) { // art.js
      fill(0, 0, 0, 160);
      rect(x - 1, y - 1, w + 2, 7, 2);
    }
    fill(255, 255, 255, 200);
    rect(x, y, w * (this.trailHealth / this.maxHealth), 5, 2);
    const left = w * (this.health / this.maxHealth);
    if (!drawArtBox(uiArt('healthFill'), x, y, left, 5)) {
      fill(this.settings.healthBarColour);
      rect(x, y, left, 5, 2);
    }
  }

  // the body, what it's wearing and which way it's facing, in world positions (inside camera.begin/end).
  //
  // ponytail: the placeholder rectangle is its hitbox (bodyBox()), so you see exactly what attacks hit,
  // squashed while rolling. a picture is drawn at its own size instead (drawCharacter()), so with one
  // you can't see the hitbox. a dev mode overlay could show it (DEV_OVERLAYS, debug.js)
  //
  // just hit, it's squashed wide and short on its feet (COMBAT.squash), and while it can't be hit
  // again (invincible) it blinks see-through
  drawBody() {
    const body = this.bodyBox();
    const squash = COMBAT.squash * (this.squash / COMBAT.squashTime);
    const w = body.w * (1 + squash);
    const h = body.h * (1 - squash);
    const { state, time } = this.artState();
    push();
    if (this.invincible > 0 && Math.floor(this.invincible * 12) % 2 === 0) drawingContext.globalAlpha *= 0.35;
    drawCharacter(this.settings, this.x, body.y + body.h - h / 2, { w, h, facing: this.facing, hurt: this.hurtTimer > 0, worn: this.worn(), held: this.heldItem(), state, time });
    pop();
  }
}

// what a character's picture shows (Character.artState()), and the picture setting for each
// (PLAYER, ENEMY_DEFAULTS, NPC_DEFAULTS). any that's null uses image, apart from death
const CHARACTER_STATES = {
  idle: 'image',
  walk: 'walkImage',
  attack: 'attackImage',
  hurt: 'hurtImage',
  roll: 'rollImage',
  death: 'deathImage',
};

// the picture (art.js) for a character doing `state`, or null for none. one with a look (looks.js)
// uses that instead
function characterArt(settings, state) {
  if (settings.hasLook) return null;
  const own = getArt(settings[CHARACTER_STATES[state]], 'character', settings.name);
  return own ?? (state === 'death' ? null : getArt(settings.image, 'character', settings.name));
}

// where each wear place (WEAR_PLACES in items.js) goes on the placeholder body, as the top and bottom
// of a band across it, in parts of its height from the top. accessories go down its side instead
const WORN_BANDS = {
  head: [0, 0.26],
  body: [0.3, 0.62],
  legs: [0.62, 0.86],
  feet: [0.86, 1],
};

// a character's body (its picture, or a placeholder rectangle) with what it's wearing on top. the
// placeholder also gets a dot towards whichever of the 8 directions it's facing, to show which sprite
// it would use. settings is PLAYER or an enemy or npc type, and x, y its middle. Character.drawBody()
// draws it on the map, and the inventory and the editor's enemy and npc boxes draw big ones
// (CharacterPreview, inventory.js).
//   facing  { x, y } each -1 to 1 (Character.facing), normally down
//   hurt    flash its hurtColour
//   worn    item types it's wearing (Character.worn())
//   held    the item type in its hand (Character.heldItem()), or null
//   w, h    its size, normally its width and height (a roll squashes it, Character.drawBody())
//   state   what it's doing, a CHARACTER_STATES name, and time the seconds it's been doing it, which
//           pick its picture and frame (characterArt()). dead with no deathImage draws nothing
//
// pictures go on at their own size with their bottom middle on the body's, squashed like the body
// when w and h are, so art can be any size. worn things with a wornImage go on top the same way, in
// the same frame and direction, so a sheet drawn to match the body's lines up (a paper doll)
function drawCharacter(settings, x, y, { facing = { x: 0, y: 1 }, hurt = false, worn = [], held = null, w = settings.width, h = settings.height, state = 'idle', time = 0 } = {}) {
  // top left, rounded to whole pixels so the edges are sharp
  const left = Math.round(x - w / 2);
  const top = Math.round(y - h / 2);
  const bottom = y + h / 2;
  const stretch = { sx: w / settings.width, sy: h / settings.height };
  const art = characterArt(settings, state);
  if (state === 'death' && !art) return;

  // read once, since a look's picture is worked out by a getter (withLook() in looks.js)
  const img = art ? null : settings.img;
  const pictured = drawArt(art, x, bottom, { time, facing, ...stretch }) || Boolean(img); // art.js
  if (img) {
    const imgW = Math.round(img.width * stretch.sx);
    const imgH = Math.round(img.height * stretch.sy);
    image(img, Math.round(x - imgW / 2), Math.round(bottom) - imgH, imgW, imgH);
  } else if (!pictured) {
    stroke(settings.outline);
    strokeWeight(2);
    fill(hurt ? settings.hurtColour : settings.colour);
    rect(left, top, w, h);
  }

  // worn things: their wornImage over the body, or on the placeholder a band in their colour (or their
  // icon stretched over the band), accessories as gems down the side. a picture with nothing for it
  // shows nothing, since a band would look wrong over real art
  let accessories = 0;
  for (const type of worn) {
    if (drawArt(getArt(type.wornImage, 'item', type.name), x, bottom, { time, facing, ...stretch })) continue;
    if (pictured) continue;
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
  // its held item's icon, small in its right hand (drawItemIcon() in inventory.js)
  if (held) drawItemIcon({ type: held }, left + w - 5, top + Math.round(h * 0.5), 12);

  // the facing dot is only for the placeholder, a picture would show which way it's facing itself
  if (pictured) return;
  noStroke();
  fill(settings.outline);
  circle(Math.round(x + facing.x * w * 0.3), Math.round(y + facing.y * h * 0.3), 8);
}

// ---------- remains ----------

// what's left of an enemy that died for good, playing its deathImage where it fell (Enemy.die(),
// enemy.js), then fading. only for show, like particles: sketch.js sorts them in with the characters,
// moves them on, and forgets them on changing map. after the animation (one that doesn't loop) they
// stay `linger` seconds, then fade over `fade`
const REMAINS = { linger: 4, fade: 1 };

const Remains = {
  // each { art, x, bottom, facing, age }
  list: [],

  add(character) {
    const art = characterArt(character.settings, 'death');
    if (art) this.list.push({ art, x: character.x, bottom: character.y + character.h / 2, facing: { ...character.facing }, age: 0 });
  },

  update(dt) {
    for (const r of this.list) r.age += dt;
    this.list = this.list.filter((r) => r.age < this.lasts(r));
  },

  lasts(r) {
    return (r.art.loop ? 0 : artLength(r.art)) + REMAINS.linger + REMAINS.fade;
  },

  draw(r) {
    push();
    drawingContext.globalAlpha *= Math.min(1, (this.lasts(r) - r.age) / REMAINS.fade);
    drawArt(r.art, r.x, r.bottom, { time: r.age, facing: r.facing });
    pop();
  },

  clear() {
    this.list = [];
  },
};
