// weapons and their attacks, shared by the player (the held item, items.js) and enemies (their
// weapon setting, enemies.js, e.g. the grunt's claws).
//
// ============================== how to make a weapon ==============================
//
// weapons are in assets/squimble-quest/items/items.json with the items (loadItemFile() in items.js).
// add a line to "weapons", then an item for it in the same file, or give it to an enemy (weapon: 'axe'):
//   { "name": "axe", "damage": 35, "reach": 64, "arc": 150, "swingTime": 0.25, "cooldown": 0.6 }
// an item's weapon can be edited in the map editor (Edit, Weapon tab); Export downloads items.json.
//
// settings (missing ones from WEAPON_DEFAULTS):
//   damage      per thing hit
//   reach       px from the swinger's middle
//   arc         swing width in degrees, 360 is all round
//   swingTime   seconds; anything in the arc meanwhile is hit once
//   cooldown    seconds from one swing's start to the next
//   colour      swoosh colour
//
// all melee for now. bows/spells would be a new attack class beside MeleeSwing (e.g. Projectile),
// chosen by the weapon
//
// ====================================================================================

const WEAPON_DEFAULTS = {
  damage: 10,
  reach: 56,
  arc: 120,
  swingTime: 0.15,
  cooldown: 0.3,
  colour: '#ffffff',
};

// filled from items.json (loadItemFile() in items.js)
const WEAPONS = {};

// defineType() is in utils.js
function defineWeapon(name, settings) {
  defineType(WEAPONS, WEAPON_DEFAULTS, 'weapon', name, settings);
}

// ---------- a melee swing ----------

// one swing: hits anything in an arc centred on the owner's aim when swung, each thing once.
// made, updated and drawn by Character.attack() (character.js)
class MeleeSwing {
  // owner: the swinger. weapon: WEAPONS settings. angle: radians. backhand: swing the other way, so
  // swings alternate
  constructor(owner, weapon, angle, backhand) {
    this.owner = owner;
    this.weapon = weapon;
    this.angle = angle;
    this.backhand = backhand;
    // seconds since it started
    this.time = 0;
    // already hit
    this.hit = new Set();
  }

  get finished() {
    return this.time >= this.weapon.swingTime;
  }

  // targets: who it may hurt (player's swing: enemies; enemy's: the player)
  update(dt, targets) {
    this.time += dt;
    for (const target of targets) {
      if (target.dead || this.hit.has(target)) continue;
      if (this.reaches(target)) {
        this.hit.add(target);
        target.hurt(this.weapon.damage);
      }
    }
  }

  // is any of the target's body in the swing?
  reaches(target) {
    const ox = this.owner.x;
    const oy = this.owner.y;
    const body = target.bodyBox();

    // the body's nearest point; out of reach means none of it is
    const nearX = constrain(ox, body.x, body.x + body.w);
    const nearY = constrain(oy, body.y, body.y + body.h);
    const distance = Math.hypot(nearX - ox, nearY - oy);
    if (distance > this.weapon.reach) return false;
    // on top of the owner always hits
    if (distance < 1) return true;

    // in the arc? checks the nearest point and the middle, so a big body partly in the arc counts
    return this.inArc(nearX, nearY) || this.inArc(body.x + body.w / 2, body.y + body.h / 2);
  }

  inArc(x, y) {
    const toPoint = Math.atan2(y - this.owner.y, x - this.owner.x);
    const halfArc = radians(this.weapon.arc) / 2;
    return Math.abs(angleDifference(toPoint, this.angle)) <= halfArc;
  }

  // a swoosh sweeping the arc, blade at its leading edge. world positions (inside camera.begin/end)
  draw() {
    const ox = this.owner.x;
    const oy = this.owner.y;
    const halfArc = radians(this.weapon.arc) / 2;
    const progress = constrain(this.time / this.weapon.swingTime, 0, 1);

    // blade start and current angle; backhand goes the other way
    const start = this.backhand ? this.angle + halfArc : this.angle - halfArc;
    const blade = this.backhand ? start - progress * halfArc * 2 : start + progress * halfArc * 2;

    // see-through pie from start to blade. arc() wants the smaller angle first. the p5 colour is made
    // here, not kept on the swing, so the swing stays plain data a server without p5 could run
    const swoosh = color(this.weapon.colour);
    swoosh.setAlpha(70);
    noStroke();
    fill(swoosh);
    arc(ox, oy, this.weapon.reach * 2, this.weapon.reach * 2, Math.min(start, blade), Math.max(start, blade), PIE);

    // the blade
    stroke(this.weapon.colour);
    strokeWeight(3);
    line(
      ox + Math.cos(blade) * this.weapon.reach * 0.3, oy + Math.sin(blade) * this.weapon.reach * 0.3,
      ox + Math.cos(blade) * this.weapon.reach, oy + Math.sin(blade) * this.weapon.reach
    );
  }
}
