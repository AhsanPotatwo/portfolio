// particle effects: little bits that burst out of something, fly up, fall back onto the floor, lie
// there a while and fade, like the bits when you break a block in minecraft. characters burst their
// hitParticles when a swing hits them (blood, by default) and enemies their deathParticles when they
// die (Character.burstParticles() in character.js).
//
// the game's top down, so each particle has a spot on the floor (x, y in world px) and a height above
// that spot (z). it's drawn z px further up the screen than its spot, with a shadow on the spot, which
// is what makes it look like it's flying up and falling back down. gravity pulls z down, the floor
// bounces it, and walls (solid tiles) bounce it along the floor.
//
// every effect is plain settings (one per PARTICLE_SETTINGS line), kept by name in PARTICLE_EFFECTS,
// from a file each in assets/squimble-quest/particles/ (datafiles.js), like sounds. they're made in
// the particle editor (particleeditor.js: the map editor's Particles tab, or Edit particles in an
// enemy's settings), where each PARTICLE_SETTINGS line is a slider or box. pictures for the picture
// and bits shapes go in particles/pictures/.
//
// to make some appear from code: Particles.burst('blood', x, y, { height, angle, img }) (see burst())
//
// particles are only for show and never change the game, so like sound they'd just run on each
// player's own computer in multiplayer. they're forgotten when you change map (loadMap() in sketch.js)

// every setting an effect has, which is also its row in the particle editor: which tab it's on, the
// words next to it, and its normal value (PARTICLE_DEFAULTS, below). numbers get a slider from min to
// max going up in step (1 if there's no step). colour: true is a colour box, a true/false normal is a
// tick box with `tick` next to it, and choices () => [values] is a picker showing say(value).
// percentages are stored as 0 to 100, as the slider shows them. a new setting is a new line here and
// whatever it does in ParticleSystem
const PARTICLE_SETTINGS = [
  // how many come out each time, plus or minus up to countRandom more
  { tab: 'Amount', key: 'count', label: 'How many', normal: 12, min: 0, max: 200 },
  { tab: 'Amount', key: 'countRandom', label: 'Give or take', normal: 4, min: 0, max: 100 },
  // they start anywhere in a circle this wide round the spot (0 is all from one point)
  { tab: 'Amount', key: 'area', label: 'Start area', normal: 4, min: 0, max: 96, unit: 'px' },

  // how fast they fly out along the floor
  { tab: 'Launch', key: 'speed', label: 'Speed', normal: 90, min: 0, max: 800, step: 5, unit: 'px/s' },
  // each one's speed is up to this much faster or slower
  { tab: 'Launch', key: 'speedRandom', label: 'Speed varies', normal: 60, min: 0, max: 100, unit: '%' },
  // how wide a fan they fly out in, centred on the burst's angle (away from whoever hit it). 360 is
  // all round. bursts with no angle (like dying) always go all round
  { tab: 'Launch', key: 'spread', label: 'Spread', normal: 360, min: 0, max: 360, step: 5, unit: '°' },
  // how high they'd go before falling, with no air drag
  { tab: 'Launch', key: 'jumpHeight', label: 'Jump height', normal: 20, min: 0, max: 400, unit: 'px' },
  { tab: 'Launch', key: 'jumpRandom', label: 'Jump varies', normal: 50, min: 0, max: 100, unit: '%' },

  // pulls them back down. below 0 they float up instead (smoke, bubbles) and never land
  { tab: 'Physics', key: 'gravity', label: 'Gravity', normal: 700, min: -1000, max: 3000, step: 10, unit: 'px/s²' },
  // slows them while flying, and slows them along the floor once they've landed
  { tab: 'Physics', key: 'airDrag', label: 'Air drag', normal: 0.5, min: 0, max: 10, step: 0.1 },
  { tab: 'Physics', key: 'floorFriction', label: 'Floor grip', normal: 10, min: 0, max: 30, step: 0.5 },
  // how much of their speed they keep bouncing off the floor or a wall. 0 sticks where it lands
  { tab: 'Physics', key: 'bounce', label: 'Bounce', normal: 25, min: 0, max: 100, unit: '%' },
  // pushes them sideways while they're in the air, below 0 is to the left
  { tab: 'Physics', key: 'wind', label: 'Wind', normal: 0, min: -800, max: 800, step: 10, unit: 'px/s²' },
  { tab: 'Physics', key: 'hitsWalls', label: 'Walls', normal: true, tick: 'bounce off solid tiles' },

  { tab: 'Look', key: 'shape', label: 'Shape', normal: 'square', choices: () => Object.keys(PARTICLE_SHAPES), say: (shape) => PARTICLE_SHAPES[shape] },
  // each one gets a random colour between these two
  { tab: 'Look', key: 'colour', label: 'Colour', normal: '#ffffff', colour: true },
  { tab: 'Look', key: 'colour2', label: 'Or colour', normal: '#ffffff', colour: true },
  // width in px (a whole picture keeps its shape)
  { tab: 'Look', key: 'size', label: 'Size', normal: 4, min: 1, max: 64, unit: 'px' },
  { tab: 'Look', key: 'sizeRandom', label: 'Size varies', normal: 50, min: 0, max: 100, unit: '%' },
  // how big it is by the end of its life, compared to the start. 0 shrinks away, 200 grows to double
  { tab: 'Look', key: 'endSize', label: 'End size', normal: 100, min: 0, max: 300, step: 5, unit: '%' },
  // each one turns up to this fast, a random way. it stops turning as it slides to a stop
  { tab: 'Look', key: 'spin', label: 'Spin', normal: 0, min: 0, max: 1080, step: 10, unit: '°/s' },

  // a file in particles/pictures/ for the picture and bits shapes. '' uses the picture of whatever
  // it came out of (an enemy's image), or plain colour if that hasn't got one
  { tab: 'Picture', key: 'picture', label: 'Picture', normal: '', choices: () => ['', ...Object.keys(PARTICLE_PICTURES)], say: (file) => (file ? fitName(file) : "the thing's own") },
  // the bits shape cuts the picture into a grid this many bits across and down, and each particle
  // is one random bit. high numbers give single pixels, which is like sampling its colours
  { tab: 'Picture', key: 'bits', label: 'Bits across', normal: 4, min: 1, max: 32 },

  // seconds each one lasts, give or take lifetimeRandom
  { tab: 'Life', key: 'lifetime', label: 'Lasts', normal: 3, min: 0.1, max: 30, step: 0.1, unit: 's' },
  { tab: 'Life', key: 'lifetimeRandom', label: 'Lasts varies', normal: 30, min: 0, max: 100, unit: '%' },
  // it fades out over its last this many seconds
  { tab: 'Life', key: 'fadeTime', label: 'Fade out', normal: 1, min: 0, max: 10, step: 0.1, unit: 's' },
  { tab: 'Life', key: 'opacity', label: 'Opacity', normal: 100, min: 5, max: 100, step: 5, unit: '%' },
  // adds its colour onto what's behind instead of covering it, for sparks and magic
  { tab: 'Life', key: 'glow', label: 'Glow', normal: false, tick: 'light up what is behind' },
  { tab: 'Life', key: 'shadow', label: 'Shadow', normal: true, tick: 'on the floor while flying' },
];

const PARTICLE_DEFAULTS = Object.fromEntries(PARTICLE_SETTINGS.map(({ key, normal }) => [key, normal]));

// the shapes and their words in the editor
const PARTICLE_SHAPES = {
  square: 'squares',
  circle: 'circles',
  picture: 'the whole picture',
  bits: 'bits of the picture',
};

// the most there can be at once in each system (the map's, and the editor's preview). past this the
// oldest go first, so lots of hits at once can't slow the game down
const PARTICLE_LIMIT = 2000;
// slower than this (px/s) after bouncing off the floor and it stops bouncing and lies there
const PARTICLE_REST_SPEED = 30;

// filled in from the particle files (bottom of this file)
const PARTICLE_EFFECTS = {};
// the pictures effects use, by file name (p5 images, null if one failed to load). the particle
// editor's Choose picture adds to it
const PARTICLE_PICTURES = {};
const PARTICLE_PICTURE_FOLDER = `${DATA_FOLDER}${DATA_KINDS.particle}pictures/`;

function defineParticles(name, settings) {
  defineType(PARTICLE_EFFECTS, PARTICLE_DEFAULTS, 'particle effect', name, settings); // utils.js
  const effect = PARTICLE_EFFECTS[name];
  if (!PARTICLE_SHAPES[effect.shape]) {
    console.warn(`The particle effect "${name}" has a shape "${effect.shape}" that isn't in PARTICLE_SHAPES (particles.js), so it's squares`);
    effect.shape = 'square';
  }
  if (effect.picture && !(effect.picture in PARTICLE_PICTURES)) {
    PARTICLE_PICTURES[effect.picture] = loadImage(PARTICLE_PICTURE_FOLDER + effect.picture, undefined, () => {
      console.warn(`Couldn't load "${PARTICLE_PICTURE_FOLDER}${effect.picture}" for the particle effect "${name}", so it's plain colour`);
      PARTICLE_PICTURES[effect.picture] = null;
    });
  }
}

// long file names cut short for the editor
function fitName(name) {
  return name.length > 18 ? `${name.slice(0, 17)}…` : name;
}

// "#rrggbb" as [r, g, b]
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

// a list of flying, bouncing, fading particles. the map has one (Particles), and the particle editor's
// preview has its own
class ParticleSystem {
  constructor() {
    // each one is { effect, x, y, z, vx, vy, vz, size, colour, angle, spin, age, life, img, bit }:
    // its effect's settings, its floor spot and height (px), their speeds (px/s), its size at the start,
    // its colour as 'rgb(...)', which way it's turned and how fast it's turning (radians, radians/s),
    // seconds alive and how many it gets, and its picture (a p5 image or null) and which bit of it
    // ({ u, v, n }: the bit's column and row out of n, or null for the whole picture)
    this.list = [];
  }

  // particles from an effect (a PARTICLE_EFFECTS name, or its settings) bursting out from above the
  // floor spot x, y (world px). an effect that doesn't exist does nothing. options:
  //   height  px above the floor they start at (0 is on the floor)
  //   angle   radians the fan points (spread), like away from whoever hit it. leave it out for all round
  //   img     a p5 image the picture and bits shapes use if the effect hasn't got its own picture
  burst(effect, x, y, { height = 0, angle, img = null } = {}) {
    const e = typeof effect === 'string' ? PARTICLE_EFFECTS[effect] : effect;
    if (!e) return;
    const picture = e.shape === 'picture' || e.shape === 'bits' ? (e.picture ? PARTICLE_PICTURES[e.picture] : img) : null;
    const from = hexToRgb(e.colour);
    const to = hexToRgb(e.colour2);
    const count = Math.round(e.count + randomBetween(-e.countRandom, e.countRandom)); // utils.js
    // a percentage either way, never below 0
    const vary = (value, percent) => Math.max(0, value * (1 + randomBetween(-percent, percent) / 100));
    for (let i = 0; i < count; i++) {
      // a random spot in the start area. the square root spreads them evenly instead of bunching them
      // in the middle
      const startAngle = randomBetween(0, Math.PI * 2);
      const out = Math.sqrt(randomBetween(0, 1)) * e.area / 2;
      const heading = angle === undefined
        ? randomBetween(0, Math.PI * 2)
        : angle + radians(randomBetween(-e.spread, e.spread) / 2);
      const speed = vary(e.speed, e.speedRandom);
      // the speed up that reaches jumpHeight under this gravity (v² = 2gh). floaty ones with gravity
      // at or below 0 use its size the same way, so jump height still makes them go up faster
      const jump = Math.sqrt(2 * Math.max(1, Math.abs(e.gravity)) * vary(e.jumpHeight, e.jumpRandom));
      const t = randomBetween(0, 1);
      const mix = from.map((c, j) => Math.round(c + (to[j] - c) * t));
      this.list.push({
        effect: e,
        x: x + Math.cos(startAngle) * out,
        y: y + Math.sin(startAngle) * out,
        z: height,
        vx: Math.cos(heading) * speed,
        vy: Math.sin(heading) * speed,
        vz: jump,
        size: Math.max(1, vary(e.size, e.sizeRandom)),
        colour: `rgb(${mix.join(', ')})`,
        angle: 0,
        spin: radians(randomBetween(-e.spin, e.spin)),
        age: 0,
        life: Math.max(0.05, vary(e.lifetime, e.lifetimeRandom)),
        img: picture,
        bit: e.shape === 'bits' ? { u: Math.floor(randomBetween(0, e.bits)), v: Math.floor(randomBetween(0, e.bits)), n: e.bits } : null,
      });
    }
    if (this.list.length > PARTICLE_LIMIT) this.list.splice(0, this.list.length - PARTICLE_LIMIT);
  }

  clear() {
    this.list = [];
  }

  // moves them all on by dt seconds. map is a TileMap whose solid tiles they bounce off (if their
  // effect's hitsWalls), or null for no walls
  update(dt, map) {
    for (const p of this.list) {
      const e = p.effect;
      p.age += dt;
      // lying on the floor (or sliding along it). floaty ones never are
      const onFloor = p.z <= 0 && p.vz <= 0 && e.gravity >= 0;
      // drag in the air and grip on the floor both take off part of the speed each second. Math.exp
      // makes it the same at any frame rate (like approach() in utils.js)
      const slow = Math.exp(-(onFloor ? e.floorFriction : e.airDrag) * dt);
      p.vx = p.vx * slow + (onFloor ? 0 : e.wind * dt);
      p.vy *= slow;
      if (onFloor) {
        p.spin *= slow;
      } else {
        p.vz -= e.gravity * dt;
        p.z += p.vz * dt;
        // hit the floor: bounce back up with some of its speed, or lie there if that's too slow
        if (p.z < 0 && e.gravity >= 0) {
          p.z = 0;
          p.vz = -p.vz * e.bounce / 100;
          if (p.vz < PARTICLE_REST_SPEED) p.vz = 0;
        }
      }
      // x and then y, so it bounces off the side of a wall it hits at an angle. empty and off-map
      // tiles are solid, so they stay on the map.
      // ponytail: walls are as tall as the sky, so a bit flying over a wall still bounces off it.
      // giving tiles a height would fix it
      const walls = e.hitsWalls && map;
      const bounce = -e.bounce / 100;
      const x = p.x + p.vx * dt;
      if (walls && map.isSolid(map.colAt(x), map.rowAt(p.y))) p.vx *= bounce;
      else p.x = x;
      const y = p.y + p.vy * dt;
      if (walls && map.isSolid(map.colAt(p.x), map.rowAt(y))) p.vy *= bounce;
      else p.y = y;
      p.angle += p.spin * dt;
    }
    this.list = this.list.filter((p) => p.age < p.life);
  }

  // the ones lying on the floor, in world positions (inside camera.begin/end). they go under
  // everything else, and flying() ones get sorted in with the characters (sketch.js)
  drawFloor() {
    for (const p of this.list) {
      if (p.z <= 0) this.drawOne(p);
    }
  }

  flying() {
    return this.list.filter((p) => p.z > 0);
  }

  // all of them, floor ones first (the editor's preview)
  drawAll() {
    this.drawFloor();
    for (const p of this.flying()) this.drawOne(p);
  }

  // straight onto the canvas instead of through p5's push() and pop(), since there can be thousands
  drawOne(p) {
    const e = p.effect;
    const size = p.size * (1 + (e.endSize / 100 - 1) * (p.age / p.life));
    if (size < 0.5) return;
    // fading out over the last fadeTime seconds (x / 0 is Infinity, so 0 never fades)
    const alpha = (e.opacity / 100) * Math.min(1, (p.life - p.age) / e.fadeTime);
    const half = size / 2;
    const ctx = drawingContext;
    ctx.save();
    ctx.globalAlpha *= alpha;
    // a shadow on its floor spot, fainter the higher it is
    if (e.shadow && p.z > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${0.3 * Math.max(0, 1 - p.z / 200)})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, half, half / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (e.glow) ctx.globalCompositeOperation = 'lighter';
    // whole pixels, so they stay sharp like the rest of the art
    ctx.translate(Math.round(p.x), Math.round(p.y - p.z));
    if (p.angle) ctx.rotate(p.angle);
    // a p5 image is 1 x 1 until it's loaded
    const img = p.img && p.img.width > 1 ? p.img : null;
    if (img && p.bit) {
      const w = img.width / p.bit.n;
      const h = img.height / p.bit.n;
      image(img, -half, -half, size, size, p.bit.u * w, p.bit.v * h, w, h);
    } else if (img) {
      const h = size * (img.height / img.width);
      image(img, -half, -h / 2, size, h);
    } else {
      ctx.fillStyle = p.colour;
      if (e.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, half, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-half, -half, size, size);
      }
    }
    ctx.restore();
  }
}

// the map's particles. sketch.js updates and draws them
const Particles = new ParticleSystem();

// a little fountain of an effect's bits for the editor's palette, always the same, size px square
// round the middle x, y
function drawParticleArt(effect, x, y, size) {
  const spots = [[0, -0.28], [-0.22, -0.12], [0.24, -0.16], [-0.3, 0.12], [0.08, 0.04], [0.3, 0.14], [-0.08, 0.24], [0.16, 0.3]];
  const from = hexToRgb(effect.colour);
  const to = hexToRgb(effect.colour2);
  const bit = Math.max(2, Math.min(size / 6, effect.size));
  noStroke();
  spots.forEach(([dx, dy], i) => {
    const t = i / (spots.length - 1);
    fill(...from.map((c, j) => c + (to[j] - c) * t));
    if (effect.shape === 'circle') circle(x + dx * size, y + dy * size, bit);
    else rect(x + dx * size - bit / 2, y + dy * size - bit / 2, bit, bit);
  });
}

// every effect loads once at the start (datafiles.js). blood (when a character's hit) and blood-burst
// (when an enemy dies) are used, and sparks, smoke and dust are there to try and copy
DataFiles.register('particle', {
  define: defineParticles,
  names: () => Object.keys(PARTICLE_EFFECTS),
  toData: (name) => typeToData(PARTICLE_EFFECTS[name], PARTICLE_DEFAULTS), // utils.js
});
