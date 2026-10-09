// weapons and their attacks. the player uses them through the item they're holding (items.js) and
// enemies through their weapon setting (enemies.js), like the grunt's claws.
//
// ============================== how to make a weapon ==============================
//
// a weapon is part of whatever has it, so it goes in that thing's file as "weapon": an item's (like
// items/axe.json) or an enemy's (like the grunt's claws in enemies/grunt.json):
//   "weapon": { "damage": 35, "reach": 68, "arc": 160, "swingTime": 0.25, "cooldown": 0.65 }
// an item's weapon can be changed in the map editor (Edit, then the Weapon tab), and the inspector's
// Export downloads the item's file.
//
// a bow is the same with "attack": "shoot", and its reach is how far the arrow flies:
//   "weapon": { "attack": "shoot", "damage": 15, "reach": 420, "cooldown": 0.5, "arrowSpeed": 520 }
//
// settings (any that are missing come from WEAPON_DEFAULTS):
//   attack      how it attacks, a WEAPON_ATTACKS name: "swing" (a MeleeSwing) or "shoot" (an Arrow)
//   damage      damage to each thing it hits
//   reach       a swing: how many px from the middle of whoever's swinging. an arrow: how many px it
//               flies before it drops to the ground
//   arc         how wide the swing is in degrees, 360 is all the way round (swings only)
//   swingTime   how many seconds the swing lasts. anything in the arc during it gets hit once (swings
//               only)
//   cooldown    seconds from the start of one attack to the next
//   arrowSpeed  how fast its arrows fly in px/s (shooting only)
//   colour      colour of the swoosh, or an arrow's head and feathers
//
// a new kind of attack (a spell, a thrown spear) would be a class next to MeleeSwing and Arrow, a line
// in WEAPON_ATTACKS, and a branch in Character.attack() (character.js)
//
// ====================================================================================

const WEAPON_DEFAULTS = {
  attack: 'swing',
  damage: 10,
  reach: 56,
  arc: 120,
  swingTime: 0.15,
  cooldown: 0.3,
  arrowSpeed: 500,
  colour: '#ffffff',
};

// each way a weapon can attack (its attack setting), with the words the item editor shows for it
const WEAPON_ATTACKS = {
  swing: 'swing',
  shoot: 'shoot arrows',
};

// a weapon's settings from a file with the defaults filled in, or null for no weapon. owner is who it
// belongs to, for the warnings (withDefaults() in utils.js)
function makeWeapon(settings, owner) {
  if (settings === null || settings === undefined) return null;
  if (typeof settings !== 'object' || Array.isArray(settings)) {
    console.warn(`The weapon on ${owner} should be { } with its settings in (see weapons.js), so it can't attack`);
    return null;
  }
  const { name, ...weapon } = withDefaults(WEAPON_DEFAULTS, 'weapon', owner, settings);
  if (!WEAPON_ATTACKS[weapon.attack]) {
    console.warn(`The weapon on ${owner} has an attack "${weapon.attack}" that isn't in WEAPON_ATTACKS (weapons.js), so it swings`);
    weapon.attack = WEAPON_DEFAULTS.attack;
  }
  return weapon;
}

// ---------- a melee swing ----------

// one swing. it hits anything in an arc centred on where the owner was aiming when they swung, and
// each thing only once. Character.attack() (character.js) makes it, updates it and draws it
class MeleeSwing {
  // owner: whoever's swinging. weapon: its settings (makeWeapon()). angle: in radians. backhand: swing the
  // other way, so swings go back and forth
  constructor(owner, weapon, angle, backhand) {
    this.owner = owner;
    this.weapon = weapon;
    this.angle = angle;
    this.backhand = backhand;
    // seconds since it started
    this.time = 0;
    // everything it's already hit
    this.hit = new Set();
  }

  get finished() {
    return this.time >= this.weapon.swingTime;
  }

  // targets: who it's allowed to hurt (enemies for the player's swing, the player for an enemy's)
  update(dt, targets) {
    this.time += dt;
    for (const target of targets) {
      if (target.dead || this.hit.has(target)) continue;
      if (this.reaches(target)) {
        this.hit.add(target);
        target.hurt(this.weapon.damage);
        // its blood (or whatever) flies away from whoever hit it (particles.js)
        target.burstParticles(target.hitParticles, Math.atan2(target.y - this.owner.y, target.x - this.owner.x));
      }
    }
  }

  // is any part of the target's body inside the swing?
  reaches(target) {
    const ox = this.owner.x;
    const oy = this.owner.y;
    const body = target.bodyBox();

    // the closest point of their body. if that's out of reach then all of it is
    const nearX = constrain(ox, body.x, body.x + body.w);
    const nearY = constrain(oy, body.y, body.y + body.h);
    const distance = Math.hypot(nearX - ox, nearY - oy);
    if (distance > this.weapon.reach) return false;
    // right on top of the owner always hits
    if (distance < 1) return true;

    // is it in the arc? checks the closest point and the middle, so a big body that's only partly
    // in the arc still counts
    return this.inArc(nearX, nearY) || this.inArc(body.x + body.w / 2, body.y + body.h / 2);
  }

  inArc(x, y) {
    const toPoint = Math.atan2(y - this.owner.y, x - this.owner.x);
    const halfArc = radians(this.weapon.arc) / 2;
    return Math.abs(angleDifference(toPoint, this.angle)) <= halfArc;
  }

  // a swoosh that sweeps across the arc with the blade at its front edge. world positions (inside
  // camera.begin/end)
  draw() {
    const ox = this.owner.x;
    const oy = this.owner.y;
    const halfArc = radians(this.weapon.arc) / 2;
    const progress = constrain(this.time / this.weapon.swingTime, 0, 1);

    // where the blade starts and where it is now. backhand swings go the other way
    const start = this.backhand ? this.angle + halfArc : this.angle - halfArc;
    const blade = this.backhand ? start - progress * halfArc * 2 : start + progress * halfArc * 2;

    // a see-through pie slice from the start to the blade. arc() wants the smaller angle first. the
    // p5 colour gets made here instead of being stored on the swing, so the swing stays as plain data
    // that a server without p5 could run
    const swoosh = color(this.weapon.colour);
    swoosh.setAlpha(70);
    noStroke();
    fill(swoosh);
    arc(ox, oy, this.weapon.reach * 2, this.weapon.reach * 2, Math.min(start, blade), Math.max(start, blade), PIE);

    // the blade itself
    stroke(this.weapon.colour);
    strokeWeight(3);
    line(
      ox + Math.cos(blade) * this.weapon.reach * 0.3, oy + Math.sin(blade) * this.weapon.reach * 0.3,
      ox + Math.cos(blade) * this.weapon.reach, oy + Math.sin(blade) * this.weapon.reach
    );
  }
}

// ---------- an arrow ----------

// in px: how long an arrow looks and the most it moves between hit checks (less than a body's width,
// so a fast arrow on a slow frame can't skip through someone). stickTime is how many seconds it stays
// stuck in a wall or the ground before it's gone, fading out over the last third. shaft is its wood
const ARROW = { length: 18, checkEvery: 8, stickTime: 1.5, shaft: '#8b5a2b' };

// one arrow from a "shoot" weapon. it flies from the owner's middle towards where they were aiming,
// hits the first target it touches, and stops at walls (tiles that block sight, so it flies over water
// like enemies see over it). it drops as it nears its reach and lands there. top down like particles
// (particles.js): x, y is its spot on the floor and height is how far above that it is, so it's drawn
// height px up the screen with its shadow on the floor. Character.attack() (character.js) makes it,
// and sketch.js keeps every arrow in the air in its arrows list, updates them and draws them
//
// ponytail: it's a coloured line until there's a sprite. a sprite would be drawn in draw(), rotated by
// angle, probably from an arrowImage weapon setting loaded like an item's image (prepareArt(), utils.js)
class Arrow {
  // owner: whoever shot it. weapon: its settings (makeWeapon()). angle: which way, in radians
  constructor(owner, weapon, angle) {
    this.owner = owner;
    this.weapon = weapon;
    this.angle = angle;
    const down = feetBelowCentre(owner.settings); // character.js
    this.x = owner.x;
    this.y = owner.y + down;
    this.startHeight = down;
    this.height = down;
    // px flown so far
    this.travelled = 0;
    // seconds it's been stuck in something, or null while it's flying
    this.stuck = null;
  }

  // false once it's gone. world is what characters know (top of character.js)
  update(dt, world) {
    if (this.stuck !== null) {
      this.stuck += dt;
      return this.stuck < ARROW.stickTime;
    }
    const map = world.map;
    let left = Math.min(this.weapon.arrowSpeed * dt, this.weapon.reach - this.travelled);
    while (left > 0) {
      const step = Math.min(left, ARROW.checkEvery);
      left -= step;
      const x = this.x + Math.cos(this.angle) * step;
      const y = this.y + Math.sin(this.angle) * step;
      // empty and off-map tiles stop it too, same as clearLine() in tilemap.js
      const tile = map.get(map.colAt(x), map.rowAt(y));
      if (!tile || (tile.solid && !tile.seeThrough)) {
        this.stuck = 0;
        return true;
      }
      this.x = x;
      this.y = y;
      this.travelled += step;
      // level for most of the way, then down onto the floor right at its reach
      this.height = this.startHeight * (1 - (this.travelled / this.weapon.reach) ** 4);
      const target = this.owner.targets(world).find((t) => !t.dead && this.touches(t));
      if (target) {
        target.hurt(this.weapon.damage);
        // its blood (or whatever) flies on the way the arrow was going (particles.js)
        target.burstParticles(target.hitParticles, this.angle);
        return false;
      }
    }
    if (this.travelled >= this.weapon.reach) this.stuck = 0;
    return true;
  }

  // is its tip inside the target's body? the tip is height px up the screen from its floor spot,
  // which is where it's drawn
  touches(target) {
    const body = target.bodyBox();
    const tipY = this.y - this.height;
    return this.x >= body.x && this.x < body.x + body.w && tipY >= body.y && tipY < body.y + body.h;
  }

  // world positions (inside camera.begin/end). its shadow is a line on the floor under it
  draw() {
    const dx = Math.cos(this.angle) * ARROW.length;
    const dy = Math.sin(this.angle) * ARROW.length;
    const tipX = this.x;
    const tipY = this.y - this.height;
    push();
    if (this.stuck !== null) drawingContext.globalAlpha *= Math.min(1, 3 * (1 - this.stuck / ARROW.stickTime));
    if (this.height > 1) {
      stroke(0, 0, 0, 60);
      strokeWeight(2);
      line(this.x - dx, this.y - dy, this.x, this.y);
    }
    stroke(ARROW.shaft);
    strokeWeight(2);
    line(tipX - dx, tipY - dy, tipX, tipY);
    // the head, a little triangle pointing forwards
    noStroke();
    fill(this.weapon.colour);
    const along = (amount, side) => [
      tipX + Math.cos(this.angle) * amount - Math.sin(this.angle) * side,
      tipY + Math.sin(this.angle) * amount + Math.cos(this.angle) * side,
    ];
    triangle(...along(2, 0), ...along(-4, -3), ...along(-4, 3));
    // two feathers at the back
    stroke(this.weapon.colour);
    strokeWeight(1.5);
    line(...along(-ARROW.length, 0), ...along(-ARROW.length - 3, -3));
    line(...along(-ARROW.length, 0), ...along(-ARROW.length - 3, 3));
    pop();
  }
}
