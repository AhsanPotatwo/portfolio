// weapons and their attacks. the player uses them through the item they're holding (items.js) and
// enemies through their weapon setting (enemies.js), like the grunt's claws.
//
// ============================== how to make a weapon ==============================
//
// a weapon is part of whatever has it, so it goes in that thing's file as "weapon": an item's (like
// items/axe.json) or an enemy's (like the grunt's claws in enemies/grunt.json):
//   "weapon": { "damage": 35, "reach": 68, "arc": 160, "swingTime": 0.25, "cooldown": 0.65 }
// every weapon can be changed in the map editor's Weapons tab (weaponeditor.js): Edit or right click
// an item's for its Weapon, Hit, Feel and Sound tabs, or click an enemy's own (the ones with a badge). the
// inspector's Export downloads the changed item and enemy files.
//
// a bow is the same with "attack": "shoot", and its reach is how far the arrow flies. with a
// chargeTime you hold attack to draw it and let go to shoot, harder the longer it's drawn:
//   "weapon": { "attack": "shoot", "damage": 25, "reach": 420, "arrowSpeed": 620, "chargeTime": 0.8 }
//
// a spear is "attack": "jab": a straight thrust out to its reach that stops at the first thing it hits
// (Jab), so it reaches far but hits one at a time:
//   "weapon": { "attack": "jab", "damage": 22, "reach": 110, "swingTime": 0.16, "cooldown": 0.5 }
//
// settings (any that are missing come from WEAPON_DEFAULTS):
//   attack      how it attacks, a WEAPON_ATTACKS name: "swing" (a MeleeSwing), "jab" (a Jab) or
//               "shoot" (an Arrow)
//   damage      damage to each thing it hits
//   reach       a swing or jab: how many px from the middle of whoever's attacking. an arrow: how many
//               px it flies before it drops to the ground
//   arc         how wide the swing is in degrees, 360 is all the way round (swings only)
//   swingTime   how many seconds the swing lasts. anything in the arc during it gets hit once. a jab's
//               point gets all the way out in the first JAB.extend of it and is held there for the rest
//   cooldown    seconds from the start of one attack to the next
//   arrowSpeed  how fast its arrows fly in px/s (shooting only)
//   colour      colour of the swoosh, or an arrow's head and feathers
//   windup      seconds a swing is held back before it sweeps, the weapon raised and glowing, so heavy
//               hits feel heavy and you can see them coming (swings and jabs)
//   knockback   px/s it shoves whatever it hits away (slowing at COMBAT.pushFade, config.js, so it
//               slides about knockback / 8 px). it can't walk against it until it's slowed down
//               (Character.pushedHard())
//   stagger     seconds whatever it hits can't walk or attack afterwards
//   lunge       px/s the attacker steps forwards with each attack, so swings carry you in
//   recoil      px/s the attacker is shoved back when a swing lands (once per swing, however many it
//               hits), like the sword's last stab bouncing you off. it takes over walking like
//               knockback does
//   shake       px the screen shakes when the player lands a hit or gets hit with it. so an enemy's
//               weapon sets how hard you get shaken
//   shakeTime   seconds the shake takes to settle
//   hitStop     seconds both sides freeze when it lands, which is most of what makes a hit feel heavy
//               (arrows don't freeze whoever shot them)
//   combo       a list of hits, each the settings that are different from the ones above, or null
//               for every attack the same. attacking again soon enough does the next hit, and after
//               the last it starts over. the last is usually the big one, with a longer cooldown:
//                 "combo": [{}, {}, { "damage": 30, "knockback": 560, "cooldown": 0.6 }]
//   comboWindow seconds after an attack's cooldown that attacking still carries on the combo
//   chargeTime  shooting only: seconds of holding attack to fully draw it, then letting go shoots
//               (Character.updateCharge()). 0 shoots straight away on click. getting staggered while
//               drawing loses the shot
//   minPower    how strong a shot let go straight away is, from 0 to 1 of a full draw. damage, reach
//               (how far it flies), arrowSpeed and knockback all scale with it (chargePower())
//   chargeSlow  how fast you walk while drawing, 1 is normal speed
//   carrySpeed  how fast you walk while holding it, 1 is normal speed (a heavy axe slows you down)
//   attackSound the sound (a sound file's name, sounds/) when it swings, jabs or shoots, or null for none
//   drawSound   shooting with a chargeTime only: the sound while it's drawn back, or null. it's cut off
//               when it shoots or the shot's lost (Character.stopDrawing()), so a long hold that
//               outlasts the sound just goes quiet
//   hitSound    the sound when it hits something, or null
//   killSound   the sound when it kills something, or null for its hitSound
//   soundVolume how loud all its sounds are, 1 is as loud as the sound files
//   soundPitch  how high all its sounds are, 1 is the sound files' own pitch, 2 an octave up
//   soundWobble how much higher or lower each play is at random, 0.06 is up to 6% either way, so the
//               same sound over and over doesn't get samey. 0 is exactly the same every time
//   soundWeight how much deeper heavier hits sound (more knockback, like a combo's big last hit), 0 for
//               all the same. a weak bow shot twangs higher by this much too (heaviness())
//   hitHeard    how loud your own hits are at least, 0 to 1, however far away they land, so you hear a
//               bow shot land across the map. only for this computer's player (weaponSound())
//
// the editor's Sound tab changes these, and the preview plays them while it's open. the sounds
// themselves change in the map editor's Sounds tab
//
// every setting from damage to hitStop (and windup) can be different for each hit of a combo (HIT_SETTINGS in
// weaponeditor.js). the rest are for the whole weapon
//
// a new kind of attack (a spell, a thrown spear) would be a class next to MeleeSwing, Jab and Arrow, a
// line in WEAPON_ATTACKS, and a branch in Character.attack() (character.js). a melee one can extend
// MeleeSwing and replace hitTargets() and draw(), like Jab does
//
// where each setting does its thing, to change how one works:
//   Character.attack()    (character.js) the next combo hit (comboHit()), a charged shot's power
//                         (poweredHit()), the wielder's damageScale and attackSpeed (wieldedHit()),
//                         cooldown, comboWindow, and lunge for shots
//   Character.updateCharge()  chargeTime and minPower. Character.walk(): carrySpeed and chargeSlow
//   MeleeSwing            windup, swingTime, arc and reach (not through walls, clearTo()), lunge when
//                         the sweep starts, recoil on the first thing it hits, the swinger's hit stop
//   Jab                   a MeleeSwing whose reach is a straight line that stops at the first hit
//                         (hitTargets()), and JAB for its point's width and how fast it goes out
//   Arrow                arrowSpeed, reach (how far it flies, dropping at the end)
//   hitWith()             everything that happens to what's hit: knockback (times its knockbackTaken),
//                         stagger (times its staggerTaken), hit stop, damage, screen shake, and the
//                         squash, damage number and sound (COMBAT in config.js has their settings)
//   drawing               MeleeSwing.draw() (bolder the more knockback), drawChargeLine()
//
// ====================================================================================

// every setting's normal value, which a file can leave out. the order here is the order files list
// them in when exported (typeToData() in utils.js), so new ones go next to their friends
const WEAPON_DEFAULTS = {
  attack: 'swing',
  damage: 10,
  reach: 56,
  arc: 120,
  swingTime: 0.15,
  cooldown: 0.3,
  arrowSpeed: 500,
  colour: '#ffffff',
  windup: 0,
  knockback: 120,
  stagger: 0.1,
  lunge: 0,
  recoil: 0,
  shake: 3,
  shakeTime: 0.3,
  hitStop: 0.02,
  combo: null,
  comboWindow: 0.3,
  chargeTime: 0,
  minPower: 0.3,
  chargeSlow: 0.5,
  carrySpeed: 1,
  attackSound: 'swing',
  drawSound: null,
  hitSound: 'thwack',
  killSound: 'kill',
  soundVolume: 1,
  soundPitch: 1,
  soundWobble: 0.06,
  soundWeight: 1,
  hitHeard: 0.5,
};

// each way a weapon can attack (its attack setting), with the words the item editor shows for it
const WEAPON_ATTACKS = {
  swing: 'swing',
  jab: 'jab (one target)',
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
  if (weapon.combo !== null && (!Array.isArray(weapon.combo) || weapon.combo.length === 0)) {
    console.warn(`The weapon on ${owner} has a combo that isn't a list of hits [{ }, { }] (weapons.js), so it has no combo`);
    weapon.combo = null;
  }
  // warns about typos in each hit (utils.js)
  weapon.combo?.forEach((hit) => withDefaults(WEAPON_DEFAULTS, 'weapon', `${owner}'s combo`, hit));
  return weapon;
}

// the settings for hit number `step` (from 0) of a weapon's combo, or the weapon itself if it hasn't
// got one. Character.attack() (character.js) keeps count
function comboHit(weapon, step) {
  return weapon.combo ? { ...weapon, ...weapon.combo[step % weapon.combo.length] } : weapon;
}

// does it draw before shooting (a bow with a chargeTime)?
function chargesUp(weapon) {
  return weapon?.attack === 'shoot' && weapon.chargeTime > 0;
}

// how strong a shot drawn for `seconds` is: its minPower straight away, up to 1 at its chargeTime
function chargePower(weapon, seconds) {
  return weapon.minPower + (1 - weapon.minPower) * Math.min(1, seconds / weapon.chargeTime);
}

// a hit's settings (comboHit()) for a shot at `power` (chargePower())
function poweredHit(hit, power) {
  if (power >= 1) return hit;
  return { ...hit, damage: Math.round(hit.damage * power), reach: hit.reach * power, arrowSpeed: hit.arrowSpeed * power, knockback: hit.knockback * power };
}

// a hit's settings for whoever's using it: an enemy's damageScale and attackSpeed (enemies.js). the
// player has neither, so it's the same hit
function wieldedHit(hit, settings) {
  const damage = settings.damageScale ?? 1;
  const rate = settings.attackSpeed ?? 1;
  return damage === 1 && rate === 1 ? hit : { ...hit, damage: hit.damage * damage, cooldown: hit.cooldown / rate };
}

// a shot being drawn: a line from the shooter along their aim, as far as it'd fly if let go now, in its
// colour. dotted while drawing, solid once fully drawn. enemies show it too, so you can see an archer
// getting ready. world positions (inside camera.begin/end)
function drawChargeLine(owner, weapon, seconds) {
  const full = seconds >= weapon.chargeTime;
  const length = weapon.reach * chargePower(weapon, seconds);
  const lineColour = color(weapon.colour);
  lineColour.setAlpha(full ? 200 : 110);
  push();
  stroke(lineColour);
  strokeWeight(full ? 2 : 1.5);
  if (!full) drawingContext.setLineDash([4, 6]);
  line(owner.x, owner.y, owner.x + Math.cos(owner.aimAngle) * length, owner.y + Math.sin(owner.aimAngle) * length);
  pop();
}

// everything a hit does, for swings and arrows alike: damage, the target's particles flying the way it
// was hit (angle, radians), knockback the same way, stagger, the hit stop on the target, and the
// screen shake if either side has a camera (only this computer's player does, Character.camera, so
// it's multiplayer-safe). weapon is the hit's settings (comboHit()). the damage goes last, so a player
// it kills respawns without the knockback (Player.placeAt()). then the bits that are just for show:
// the squash, the target's hitInvincible blink (PLAYER in config.js), a damage number, the sound, and a
// bigger shake for a kill
function hitWith(attacker, target, weapon, angle) {
  target.burstParticles(target.hitParticles, angle); // particles.js
  // an enemy can take more or less of these (knockbackTaken and staggerTaken, enemies.js). the dummy
  // takes no knockback
  target.pushTowards(angle, weapon.knockback * (target.settings.knockbackTaken ?? 1), true);
  target.stagger = Math.max(target.stagger, weapon.stagger * (target.settings.staggerTaken ?? 1));
  target.freeze(weapon.hitStop);
  // before the damage, which can respawn the player somewhere else
  if (!target.inPreview) DamageNumbers.add(target, weapon.damage, Boolean(target.camera));
  target.hurt(weapon.damage);
  target.squash = COMBAT.squashTime;
  target.invincible = target.settings.hitInvincible ?? 0;
  // the dummy refills instead of dying (ENEMY_DEATHS in enemies.js), so it's never a kill
  const kill = target.dead;
  (attacker.camera ?? target.camera)?.shake(weapon.shake + (kill ? COMBAT.killShake : 0), weapon.shakeTime);
  // heard across the map if this computer's player landed it (hitHeard)
  const heard = attacker.camera ? weapon.hitHeard : 0;
  weaponSound(target, (kill && weapon.killSound) || weapon.hitSound, weapon, heaviness(weapon), heard);
  // the player's own ouch (PLAYER in config.js)
  if (target.camera) weaponSound(target, target.settings.hurtSound);
}

// how deep a hit sounds: lower the more knockback it has, so a combo's big last hit thuds, by the
// weapon's soundWeight. 1 for a weight of 0. power is how far a shot was drawn (chargePower()), and a
// weak one twangs higher. never below 0.1, where a big weight would stop it playing
function heaviness(weapon, power = 1) {
  return Math.max(0.1, 1 + weapon.soundWeight * (0.1 - Math.min(weapon.knockback / 1000, 0.4) + 0.3 * (1 - power)));
}

// plays the sound called `name` (a sound file, or null for none) from where `who` is, with the weapon's
// soundVolume, soundPitch and soundWobble (weapon null for none of them), at `rate` times its speed
// (heaviness()), and never quieter than minVolume (0 to 1) however far away. the weapon editor's
// preview characters only play while its Sound tab is open (WeaponPreview's audible), at full volume.
// gives back the voice (for Sound.stop()), or null if nothing played
function weaponSound(who, name, weapon = null, rate = 1, minVolume = 0) {
  if (!name || (who.inPreview && !who.audible)) return null;
  const wobble = weapon?.soundWobble ?? 0;
  // worldMap is the game's (sketch.js)
  return playSound(name, who.inPreview ? null : { x: who.x, y: who.y, map: worldMap }, null, { // sound.js
    rate: rate * (weapon?.soundPitch ?? 1) * randomBetween(1 - wobble, 1 + wobble),
    volume: weapon?.soundVolume ?? 1,
    minVolume,
  });
}

// ---------- damage numbers ----------

// how each hit's damage pops up from what it hit (DamageNumbers). in px, px/s and seconds: it jumps up
// at rise, falls back with gravity and fades out over time. size is how big a number is, up to bigSize
// for a hit of big or more damage. the player's are in playerColour, so you can tell they're yours
const DAMAGE_NUMBER = { time: 0.75, rise: 150, gravity: 380, spread: 40, size: 12, bigSize: 22, big: 30, colour: '#ffffff', playerColour: '#ff6b6b', outline: '#1a1a1a' };

// the damage numbers flying, for everyone's hits. hitWith() adds them, sketch.js moves and draws them
// on top of everything and forgets them on changing map
const DamageNumbers = {
  // each { x, y, vx, vy, age, text, size, colour }, x and y in world px
  list: [],

  // amount is the hit's damage, mine is whether it hit this computer's player
  add(target, amount, mine) {
    const shown = Math.round(amount);
    // turned off in the pause menu (GAME_SETTINGS in config.js)
    if (shown <= 0 || !GAME_SETTINGS.damageNumbers) return;
    const size = DAMAGE_NUMBER.size + (DAMAGE_NUMBER.bigSize - DAMAGE_NUMBER.size) * Math.min(1, shown / DAMAGE_NUMBER.big);
    this.list.push({
      x: target.x, y: target.y - target.h / 2,
      vx: randomBetween(-DAMAGE_NUMBER.spread, DAMAGE_NUMBER.spread), vy: -DAMAGE_NUMBER.rise,
      age: 0, text: String(shown), size, colour: mine ? DAMAGE_NUMBER.playerColour : DAMAGE_NUMBER.colour,
    });
  },

  update(dt) {
    for (const n of this.list) {
      n.age += dt;
      n.vy += DAMAGE_NUMBER.gravity * dt;
      n.x += n.vx * dt;
      n.y += n.vy * dt;
    }
    this.list = this.list.filter((n) => n.age < DAMAGE_NUMBER.time);
  },

  // world positions (inside camera.begin/end). each pops in bigger, then shrinks back and fades
  draw() {
    for (const n of this.list) {
      const t = n.age / DAMAGE_NUMBER.time;
      const pop = 1 + 0.5 * Math.max(0, 1 - t * 8);
      const alpha = 255 * Math.min(1, 3 * (1 - t));
      setText(n.size * pop); // utils.js
      const outline = color(DAMAGE_NUMBER.outline);
      const c = color(n.colour);
      outline.setAlpha(alpha);
      c.setAlpha(alpha);
      stroke(outline);
      strokeWeight(3);
      fill(c);
      text(n.text, n.x, n.y);
    }
  },

  clear() {
    this.list = [];
  },
};

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
    // seconds since it started sweeping, below 0 while it's still winding up (its windup)
    this.time = -weapon.windup;
    // everything it's already hit
    this.hit = new Set();
  }

  get finished() {
    return this.time >= this.weapon.swingTime;
  }

  // still winding up, so it hasn't hit anything yet. a stagger cancels it then (Character.update())
  get windingUp() {
    return this.time < 0;
  }

  // targets: who it's allowed to hurt (enemies for the player's swing, the player for an enemy's).
  // map: whose walls it can't hit through (tilemap.js)
  update(dt, targets, map) {
    const before = this.time;
    this.time += dt;
    if (this.windingUp) return;
    // the lunge and the whoosh go with the sweep, not the windup
    if (before <= 0) {
      this.owner.pushTowards(this.angle, this.weapon.lunge);
      weaponSound(this.owner, this.weapon.attackSound, this.weapon, heaviness(this.weapon));
    }
    this.hitTargets(targets, map);
  }

  // hits everything in the arc it hasn't hit yet, but not through walls. a Jab does its own
  hitTargets(targets, map) {
    for (const target of targets) {
      if (!target.hittable() || this.hit.has(target)) continue;
      // knocked away from whoever hit it
      if (this.reaches(target) && this.clearTo(target, map)) this.strike(target, Math.atan2(target.y - this.owner.y, target.x - this.owner.x));
    }
  }

  // hits one target, knocking it towards angle (radians). the swinger stops for the hit too, which is
  // what makes it feel like it connected (longer for a kill, COMBAT.killHitStop), and bounces back off
  // the first thing it hits
  strike(target, angle) {
    this.hit.add(target);
    hitWith(this.owner, target, this.weapon, angle);
    this.owner.freeze(target.dead ? Math.max(this.weapon.hitStop, COMBAT.killHitStop) : this.weapon.hitStop);
    if (this.hit.size === 1) this.owner.pushTowards(angle + Math.PI, this.weapon.recoil, true);
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

  // no wall between the owner's feet and the target's: the same walls that stop arrows (clearLine() in
  // tilemap.js), so not water. feet, not middles, since a head pokes up over the wall behind it
  clearTo(target, map) {
    const feet = (c) => c.y + feetBelowCentre(c.settings); // character.js
    return map.clearLine(this.owner.x, feet(this.owner), target.x, feet(target));
  }

  inArc(x, y) {
    const toPoint = Math.atan2(y - this.owner.y, x - this.owner.x);
    const halfArc = radians(this.weapon.arc) / 2;
    return Math.abs(angleDifference(toPoint, this.angle)) <= halfArc;
  }

  // a swoosh that sweeps across the arc with the blade at its front edge. while winding up it's just
  // the blade, drawn back past the start of the arc and brightening. world positions (inside
  // camera.begin/end)
  //
  // ponytail: the swoosh is the swing's real reach and arc (what reaches() hits), there to see its range
  // until weapons have sprites. nothing reads it, so a weapon sprite can replace this, or go on top with
  // the swoosh moved behind a dev mode overlay (DEV_OVERLAYS, debug.js)
  draw() {
    const ox = this.owner.x;
    const oy = this.owner.y;
    const halfArc = radians(this.weapon.arc) / 2;
    const progress = constrain(this.time / this.weapon.swingTime, 0, 1);

    // where the blade starts and where it is now. backhand swings go the other way
    const way = this.backhand ? -1 : 1;
    const start = this.angle - way * halfArc;
    const blade = start + way * progress * halfArc * 2;

    if (this.windingUp) {
      // 0 to 1 through the windup
      const raised = 1 + this.time / this.weapon.windup;
      const back = start - way * radians(30) * raised;
      const glint = color(this.weapon.colour);
      glint.setAlpha(60 + 195 * raised);
      stroke(glint);
      strokeWeight(3 + 2 * raised);
      line(ox + Math.cos(back) * this.weapon.reach * 0.3, oy + Math.sin(back) * this.weapon.reach * 0.3, ox + Math.cos(back) * this.weapon.reach, oy + Math.sin(back) * this.weapon.reach);
      return;
    }

    // a see-through pie slice from the start to the blade. arc() wants the smaller angle first. the
    // p5 colour gets made here instead of being stored on the swing, so the swing stays as plain data
    // that a server without p5 could run
    // harder hits (more knockback, like a combo's last) are bolder
    const heavy = Math.min(this.weapon.knockback / 500, 1.5);
    const swoosh = color(this.weapon.colour);
    swoosh.setAlpha(50 + 50 * heavy);
    noStroke();
    fill(swoosh);
    arc(ox, oy, this.weapon.reach * 2, this.weapon.reach * 2, Math.min(start, blade), Math.max(start, blade), PIE);

    // the blade itself
    stroke(this.weapon.colour);
    strokeWeight(2 + 2 * heavy);
    line(
      ox + Math.cos(blade) * this.weapon.reach * 0.3, oy + Math.sin(blade) * this.weapon.reach * 0.3,
      ox + Math.cos(blade) * this.weapon.reach, oy + Math.sin(blade) * this.weapon.reach
    );
  }
}

// ---------- a jab ----------

// in px unless said: width is how wide a jab's point is (it hits a body this close to its tip), and
// checkEvery the most the point moves between hit checks (less than a body's width, so it can't skip
// through someone). extend is the part of its swingTime the point takes to get all the way out, then
// it's held there for the rest
const JAB = { width: 10, checkEvery: 6, extend: 0.5 };

// one jab from a "jab" weapon, like the spear: its point goes straight out from the owner's middle
// towards where they aimed, out to its reach, and stops at the first body it touches, hitting whatever's
// touching the point right then. so it hits one thing (or a few stood right on top of each other) and
// never anything behind that, and it has to be aimed, which is the price of its long reach. something
// walking onto the held point still gets hit. windup, lunge, recoil, hit stop and a stagger cancelling it
// work like a swing's (MeleeSwing), and arc does nothing. Character.attack() (character.js) makes it
class Jab extends MeleeSwing {
  constructor(owner, weapon, angle) {
    super(owner, weapon, angle, false);
    // px from the owner's middle out to the point
    this.tip = 0;
    // px out to the wall it stopped at
    this.wall = Infinity;
  }

  // moves the point out, checking every JAB.checkEvery px and at least once a frame, and stops at the
  // first thing it touches, or at a wall (where it stays), and never hits anyone behind one (clearTo())
  hitTargets(targets, map) {
    if (this.hit.size > 0) return;
    const out = Math.min(this.wall, this.weapon.reach * Math.min(1, this.time / (this.weapon.swingTime * JAB.extend)));
    const r = JAB.width / 2;
    const down = feetBelowCentre(this.owner.settings); // character.js
    do {
      const next = Math.min(out, this.tip + JAB.checkEvery);
      const x = this.owner.x + Math.cos(this.angle) * next;
      const y = this.owner.y + Math.sin(this.angle) * next;
      // the floor under the point, along from the owner's feet like an arrow's
      if (!map.clearLine(this.owner.x, this.owner.y + down, x, y + down)) {
        this.wall = this.tip;
        return;
      }
      this.tip = next;
      const touching = (b) => x > b.x - r && x < b.x + b.w + r && y > b.y - r && y < b.y + b.h + r;
      const struck = targets.filter((target) => target.hittable() && touching(target.bodyBox()) && this.clearTo(target, map));
      if (struck.length > 0) {
        // knocked the way it was jabbed
        for (const target of struck) this.strike(target, this.angle);
        return;
      }
    } while (this.tip < out);
  }

  // drawn the same way as a swing's swoosh (MeleeSwing.draw()): a see-through band from the owner's
  // middle out to the point, as wide as the point hits (JAB.width), with the blade along it from 0.3 of
  // the way out to the point, both bolder for harder hits. while winding up it's the blade brightening,
  // pulled back. world positions (inside camera.begin/end)
  //
  // ponytail: like the swing's swoosh, the band is the jab's real reach and width (what hitTargets()
  // checks), there to see its range until weapons have sprites. a spear sprite would be drawn along it
  // here, or on top with the band moved behind a dev mode overlay (DEV_OVERLAYS, debug.js)
  draw() {
    const { x, y } = this.owner;
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    // a point px out along the jab and side px off to one side of it
    const along = (px, side = 0) => [x + cos * px - sin * side, y + sin * px + cos * side];
    const reach = this.weapon.reach;
    if (this.windingUp) {
      // 0 to 1 through the windup, the same blade a swing raises, pulled back instead of round
      const raised = 1 + this.time / this.weapon.windup;
      const back = reach * 0.3 * raised;
      const glint = color(this.weapon.colour);
      glint.setAlpha(60 + 195 * raised);
      stroke(glint);
      strokeWeight(3 + 2 * raised);
      line(...along(reach * 0.3 - back), ...along(reach * 0.6 - back));
      return;
    }
    // harder hits (more knockback) are bolder, like a swing
    const heavy = Math.min(this.weapon.knockback / 500, 1.5);
    const band = color(this.weapon.colour);
    band.setAlpha(50 + 50 * heavy);
    noStroke();
    fill(band);
    const half = JAB.width / 2;
    quad(...along(0, -half), ...along(this.tip, -half), ...along(this.tip, half), ...along(0, half));
    stroke(this.weapon.colour);
    strokeWeight(2 + 2 * heavy);
    line(...along(this.tip * 0.3), ...along(this.tip));
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
      const target = this.owner.targets(world).find((t) => t.hittable() && this.touches(t));
      if (target) {
        // knocked on the way the arrow was going
        hitWith(this.owner, target, this.weapon, this.angle);
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
    if (this.height > 1) drawArrowShadow(this);
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

// ---------- an arrow's shadow (temporary) ----------
//
// ponytail: a stand-in until there's a proper shadow system. to take it out, delete this section and
// its one call in Arrow.draw().
//
// it's a dash on the floor under the middle of the arrow. the arrow is drawn height px up the screen
// from the floor, so a shadow the same shape as the arrow lines up end to end with it when it flies up
// or down the screen, and looks like one long arrow. so the dash keeps its full length across the
// screen but is squashed up and down (upDown), which also flattens it for diagonal shots
const ARROW_SHADOW = {
  // 0 to 255
  alpha: 60,
  // px thick
  width: 3,
  // how much of its up and down length it keeps. 1 is the same shape as the arrow
  upDown: 0.25,
};

function drawArrowShadow(arrow) {
  const cos = Math.cos(arrow.angle);
  const sin = Math.sin(arrow.angle);
  const half = ARROW.length / 2;
  // under the middle of the arrow, not its tip
  const x = arrow.x - cos * half;
  const y = arrow.y - sin * half;
  const dx = cos * half;
  const dy = sin * half * ARROW_SHADOW.upDown;
  stroke(0, 0, 0, ARROW_SHADOW.alpha);
  strokeWeight(ARROW_SHADOW.width);
  line(x - dx, y - dy, x + dx, y + dy);
}

// a weapon in a few words, like "15 damage, shoots 420 px", for the editor (editor.js)
function weaponSummary(weapon) {
  if (!weapon) return 'no weapon';
  return `${Math.round(weapon.damage)} damage, ${weapon.attack === 'shoot' ? 'shoots' : 'reaches'} ${weapon.reach} px`;
}
