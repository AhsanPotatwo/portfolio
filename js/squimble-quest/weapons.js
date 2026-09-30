// weapons, and the attacks they make. the same code works for anyone who attacks: the player
// (with whatever item they're holding, items.js) and enemies (the weapon setting in enemies.js,
// e.g. the grunt's claws).
//
// ============================== how to make a weapon ==============================
//
// add a defineWeapon() at the bottom of this file. then either make an item for it (items.js), so
// the player can hold it, or give it to an enemy with weapon: 'axe' (enemies.js):
//
//   defineWeapon('axe', { damage: 35, reach: 64, arc: 150, swingTime: 0.25, cooldown: 0.6 });
//
// the settings (anything left out comes from WEAPON_DEFAULTS):
//
//   damage      health taken off each thing it hits
//   reach       how far it reaches, in pixels from the middle of whoever's swinging
//   arc         how wide the swing is, in degrees. 360 hits all the way round
//   swingTime   how long a swing lasts, in seconds. anything in the arc during it gets hit, once
//   cooldown    seconds from the start of one swing until the next one can start
//   colour      the colour of the swoosh
//
// every weapon is a melee swing for now. bows or spells would be a new kind of attack alongside
// MeleeSwing below, e.g. a Projectile class, with the weapon saying which one it makes
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

// every weapon, by name. filled in by defineWeapon() below
const WEAPONS = {};

// defineType() is in utils.js
function defineWeapon(name, settings) {
  defineType(WEAPONS, WEAPON_DEFAULTS, 'weapon', name, settings);
}

// ---------- the weapons ----------

defineWeapon('sword', {
  damage: 20,
  reach: 60,
  arc: 120,
  swingTime: 0.15,
  cooldown: 0.3,
});

// what the grunt (enemies.js) attacks with. weak and slow, so a few of them are a fair fight
defineWeapon('claws', {
  damage: 8,
  reach: 44,
  arc: 90,
  swingTime: 0.2,
  cooldown: 1,
  colour: '#ff8a8a',
});

// slower than the sword, but hits harder, reaches further and swings wider
defineWeapon('axe', {
  damage: 35,
  reach: 68,
  arc: 160,
  swingTime: 0.25,
  cooldown: 0.65,
  colour: '#ffd9a0',
});

// ---------- a melee swing ----------

// one swing of a weapon. it hits anything in an arc in front of whoever's swinging (the owner),
// centred on the angle they were aiming when they swung. each thing can only be hit once per swing.
// made by Character.attack() (character.js), which updates and draws it until it's finished
class MeleeSwing {
  // owner: the character swinging. weapon: its settings from WEAPONS. angle: which way, in radians.
  // backhand: true swings the other way across the arc, so swings go back and forth
  constructor(owner, weapon, angle, backhand) {
    this.owner = owner;
    this.weapon = weapon;
    this.angle = angle;
    this.backhand = backhand;
    // seconds since the swing started
    this.time = 0;
    // everything this swing has already hit
    this.hit = new Set();
    // the see-through swoosh colour, made once here rather than every frame it's drawn
    this.swooshColour = color(weapon.colour);
    this.swooshColour.setAlpha(70);
  }

  get finished() {
    return this.time >= this.weapon.swingTime;
  }

  // targets is everyone this swing is allowed to hurt (the player's swing hurts enemies,
  // an enemy's hurts the player)
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

  // is any of the target's body inside the swing?
  reaches(target) {
    const ox = this.owner.x;
    const oy = this.owner.y;
    const body = target.bodyBox();

    // the nearest point of the target's body to the middle of the swing. if even that's
    // further than the weapon reaches, nothing of it is in range
    const nearX = constrain(ox, body.x, body.x + body.w);
    const nearY = constrain(oy, body.y, body.y + body.h);
    const distance = Math.hypot(nearX - ox, nearY - oy);
    if (distance > this.weapon.reach) return false;
    // right on top of the owner, always a hit
    if (distance < 1) return true;

    // in range. now is it in front, inside the arc? checks the nearest point and the middle of the
    // body, so something big standing a bit to the side still counts if part of it is in the arc
    return this.inArc(nearX, nearY) || this.inArc(body.x + body.w / 2, body.y + body.h / 2);
  }

  // is the direction to this point within the arc?
  inArc(x, y) {
    const toPoint = Math.atan2(y - this.owner.y, x - this.owner.x);
    const halfArc = radians(this.weapon.arc) / 2;
    return Math.abs(angleDifference(toPoint, this.angle)) <= halfArc;
  }

  // a swoosh that sweeps across the arc, with the blade at its leading edge.
  // uses world positions, so it's drawn between camera.begin() and camera.end()
  draw() {
    const ox = this.owner.x;
    const oy = this.owner.y;
    const halfArc = radians(this.weapon.arc) / 2;
    const progress = constrain(this.time / this.weapon.swingTime, 0, 1);

    // where the blade starts, and where it's got to. backhand swings go the other way
    const start = this.backhand ? this.angle + halfArc : this.angle - halfArc;
    const blade = this.backhand ? start - progress * halfArc * 2 : start + progress * halfArc * 2;

    // the swoosh: a see-through slice of a circle from where the swing started to the blade.
    // arc() wants the smaller angle first
    noStroke();
    fill(this.swooshColour);
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
