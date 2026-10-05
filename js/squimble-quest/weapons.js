// weapons and their attacks. the player uses them through the item they're holding (items.js) and
// enemies through their weapon setting (enemies.js), like the grunt's claws.
//
// ============================== how to make a weapon ==============================
//
// weapons live in assets/squimble-quest/items/items.json along with the items (loadItemFile() in
// items.js). add a line to "weapons", then either add an item for it in the same file or give it to
// an enemy (weapon: 'axe'):
//   { "name": "axe", "damage": 35, "reach": 64, "arc": 150, "swingTime": 0.25, "cooldown": 0.6 }
// an item's weapon can be changed in the map editor (Edit, then the Weapon tab), and Export downloads
// items.json.
//
// settings (any that are missing come from WEAPON_DEFAULTS):
//   damage      damage to each thing it hits
//   reach       how many px from the middle of whoever's swinging
//   arc         how wide the swing is in degrees, 360 is all the way round
//   swingTime   how many seconds the swing lasts. anything in the arc during it gets hit once
//   cooldown    seconds from the start of one swing to the next
//   colour      colour of the swoosh
//
// it's all melee for now. bows or spells would be a new attack class next to MeleeSwing (something
// like Projectile), and the weapon would say which one it uses
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

// filled in from items.json (loadItemFile() in items.js)
const WEAPONS = {};

// defineType() is in utils.js
function defineWeapon(name, settings) {
  defineType(WEAPONS, WEAPON_DEFAULTS, 'weapon', name, settings);
}

// ---------- a melee swing ----------

// one swing. it hits anything in an arc centred on where the owner was aiming when they swung, and
// each thing only once. Character.attack() (character.js) makes it, updates it and draws it
class MeleeSwing {
  // owner: whoever's swinging. weapon: its WEAPONS settings. angle: in radians. backhand: swing the
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
