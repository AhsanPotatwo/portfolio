// particle effects: little bits that burst out of something, fly up, fall back onto the floor, lie
// there a while and fade, like the bits when you break a block in minecraft. characters burst their
// hitParticles when a swing hits them (blood, by default) and enemies their deathParticles when they
// die (Character.burstParticles() in character.js). tiles and objects can keep making them forever,
// like lava bubbling or a campfire (ParticleEmitters, near the bottom).
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
// to make a tile or object keep making some: "particles": ["lava-bubbles"] in its file (or tick them
// on the tile editor's Particles tab), and the effect's Keep going rate says how often
//
// particles are only for show and never change the game, so like sound they'd just run on each
// player's own computer in multiplayer. they're forgotten when you change map (loadMap() in sketch.js)

// every setting an effect has, which is also its row in the particle editor: which tab it's on, the
// words next to it, its normal value (PARTICLE_DEFAULTS, below), and the tip the editor shows while
// the mouse is over it, which is also what it does. numbers get a slider from min to max going up in
// step (1 if there's no step). colour: true is a colour box, a true/false normal is a tick box with
// `tick` next to it, and choices () => [values] is a picker showing say(value). percentages are
// stored as 0 to 100, as the slider shows them. a new setting is a new line here and whatever it
// does in ParticleSystem
const PARTICLE_SETTINGS = [
  { tab: 'Amount', key: 'count', label: 'How many', normal: 12, min: 0, max: 200, tip: 'How many come out each burst' },
  { tab: 'Amount', key: 'countRandom', label: 'Give or take', normal: 4, min: 0, max: 100, tip: 'Up to this many more or fewer each burst' },
  { tab: 'Amount', key: 'area', label: 'Start area', normal: 4, min: 0, max: 96, unit: 'px', tip: 'They start anywhere in a circle this wide. 0 is all from one point' },

  { tab: 'Launch', key: 'speed', label: 'Speed', normal: 90, min: 0, max: 800, step: 5, unit: 'px/s', tip: 'How fast they fly out along the floor' },
  { tab: 'Launch', key: 'speedRandom', label: 'Speed varies', normal: 60, min: 0, max: 100, unit: '%', tip: "Each one's speed is up to this much faster or slower" },
  // bursts with no angle (like dying, or tiles and objects) always go all round
  { tab: 'Launch', key: 'spread', label: 'Spread', normal: 360, min: 0, max: 360, step: 5, unit: '°', tip: 'How wide a fan they fly out in, away from whatever hit it. 360 is all round' },
  { tab: 'Launch', key: 'jumpHeight', label: 'Jump height', normal: 20, min: 0, max: 400, unit: 'px', tip: 'How high they go before falling (a bit less with air drag)' },
  { tab: 'Launch', key: 'jumpRandom', label: 'Jump varies', normal: 50, min: 0, max: 100, unit: '%', tip: "Each one's jump is up to this much higher or lower" },
  { tab: 'Launch', key: 'startHeight', label: 'Start higher', normal: 0, min: 0, max: 200, unit: 'px', tip: 'Start this far above where they come from, like flames from the top of a fire' },

  { tab: 'Physics', key: 'gravity', label: 'Gravity', normal: 700, min: -1000, max: 3000, step: 10, unit: 'px/s²', tip: 'Pulls them back down. Below 0 they float up instead (smoke) and never land' },
  { tab: 'Physics', key: 'airDrag', label: 'Air drag', normal: 0.5, min: 0, max: 10, step: 0.1, tip: 'Slows them down while they fly' },
  { tab: 'Physics', key: 'floorFriction', label: 'Floor grip', normal: 10, min: 0, max: 30, step: 0.5, tip: 'Slows them sliding along the floor once they land. 0 slides like ice' },
  { tab: 'Physics', key: 'bounce', label: 'Bounce', normal: 25, min: 0, max: 100, unit: '%', tip: 'How much speed they keep bouncing off the floor or walls. 0 sticks' },
  { tab: 'Physics', key: 'wind', label: 'Wind', normal: 0, min: -800, max: 800, step: 10, unit: 'px/s²', tip: 'Pushes them sideways while flying. Below 0 is to the left' },
  { tab: 'Physics', key: 'hitsWalls', label: 'Walls', normal: true, tick: 'bounce off solid tiles', tip: 'Untick to let them fly through walls' },

  { tab: 'Look', key: 'shape', label: 'Shape', normal: 'square', choices: () => Object.keys(PARTICLE_SHAPES), say: (shape) => PARTICLE_SHAPES[shape], tip: 'Pictures are on the Picture tab' },
  { tab: 'Look', key: 'colour', label: 'Colour', normal: '#ffffff', colour: true, tip: 'Each one gets a random colour between this and the next one' },
  { tab: 'Look', key: 'colour2', label: 'Or colour', normal: '#ffffff', colour: true, tip: 'Each one gets a random colour between this and the one above' },
  { tab: 'Look', key: 'size', label: 'Size', normal: 4, min: 1, max: 64, unit: 'px', tip: 'How wide each one is. A whole picture keeps its shape' },
  { tab: 'Look', key: 'sizeRandom', label: 'Size varies', normal: 50, min: 0, max: 100, unit: '%', tip: 'Each one is up to this much bigger or smaller' },
  { tab: 'Look', key: 'endSize', label: 'End size', normal: 100, min: 0, max: 300, step: 5, unit: '%', tip: 'How big they are by the end. 0 shrinks away, 200 grows to double' },
  { tab: 'Look', key: 'spin', label: 'Spin', normal: 0, min: 0, max: 1080, step: 10, unit: '°/s', tip: 'Each one turns up to this fast, either way, until it slides to a stop' },

  // a file in particles/pictures/. '' uses the picture of whatever it came out of (an enemy's image)
  { tab: 'Picture', key: 'picture', label: 'Picture', normal: '', choices: () => ['', ...Object.keys(PARTICLE_PICTURES)], say: (file) => file || "the thing's own", tip: "For the picture shapes. The thing's own is an enemy's picture, if it has one" },
  { tab: 'Picture', key: 'bits', label: 'Bits across', normal: 4, min: 1, max: 32, tip: 'Bits cuts the picture into this many across and down. Lots gives single pixels' },

  { tab: 'Life', key: 'lifetime', label: 'Lasts', normal: 3, min: 0.1, max: 30, step: 0.1, unit: 's', tip: 'How long each one lasts' },
  { tab: 'Life', key: 'lifetimeRandom', label: 'Lasts varies', normal: 30, min: 0, max: 100, unit: '%', tip: 'Each one lasts up to this much longer or shorter' },
  { tab: 'Life', key: 'fadeTime', label: 'Fade out', normal: 1, min: 0, max: 10, step: 0.1, unit: 's', tip: 'They fade away over their last this many seconds' },
  { tab: 'Life', key: 'opacity', label: 'Opacity', normal: 100, min: 5, max: 100, step: 5, unit: '%', tip: 'How solid they are. Lower is more see-through' },
  { tab: 'Life', key: 'glow', label: 'Glow', normal: false, tick: 'light up what is behind', tip: 'Adds its colour onto what is behind instead of covering it, for sparks and magic' },
  { tab: 'Life', key: 'shadow', label: 'Shadow', normal: true, tick: 'on the floor while flying', tip: 'A little shadow under each one while it is in the air' },

  // ParticleEmitters (below) uses it, times the tile's or object's particleRate. 'log' gives slow
  // rates (one every few seconds) as much room on the slider as fast ones
  { tab: 'Keep going', key: 'rate', label: 'Bursts', normal: 1, min: 0.05, max: 60, step: 0.05, unit: '/s', curve: 'log', tip: 'For tiles and objects that make it nonstop: bursts a second from each one' },
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
// slower than this (px/s) after bouncing off the floor and it stops bouncing and lies there. sliding
// slower than STOP_SPEED along the floor it stops dead, so lying ones cost nearly nothing
const PARTICLE_REST_SPEED = 30;
const PARTICLE_STOP_SPEED = 1;
// how far past the edge of the screen (world px) particles still get drawn, so big ones don't pop
// out of sight while they're still partly on screen
const PARTICLE_DRAW_MARGIN = 64;

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
        z: height + e.startHeight,
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
      p.angle += p.spin * dt;
      // stopped dead on the floor: nothing left to move
      if (onFloor && Math.abs(p.vx) < PARTICLE_STOP_SPEED && Math.abs(p.vy) < PARTICLE_STOP_SPEED) {
        p.vx = 0;
        p.vy = 0;
        continue;
      }
      // x and then y, so it bounces off the side of a wall it hits at an angle. empty and off-map
      // tiles are solid, so they stay on the map. one that's inside something solid (a campfire's
      // flames start inside the solid campfire) ignores walls, or it'd bounce about in there forever.
      // ponytail: walls are as tall as the sky, so a bit flying over a wall still bounces off it.
      // giving tiles a height would fix it
      const walls = e.hitsWalls && map && !map.isSolid(map.colAt(p.x), map.rowAt(p.y));
      const bounce = -e.bounce / 100;
      const x = p.x + p.vx * dt;
      if (walls && map.isSolid(map.colAt(x), map.rowAt(p.y))) p.vx *= bounce;
      else p.x = x;
      const y = p.y + p.vy * dt;
      if (walls && map.isSolid(map.colAt(p.x), map.rowAt(y))) p.vy *= bounce;
      else p.y = y;
    }
    this.list = this.list.filter((p) => p.age < p.life);
  }

  // the ones lying on the floor, in world positions (inside camera.begin/end). they go under
  // everything else, and flying() ones get sorted in with the characters (sketch.js). view is the
  // camera's (camera.view()) so ones off the screen get skipped, or leave it out for all of them
  drawFloor(view) {
    for (const p of this.list) {
      if (p.z <= 0 && this.onScreen(p, view)) this.drawOne(p);
    }
  }

  flying(view) {
    return this.list.filter((p) => p.z > 0 && this.onScreen(p, view));
  }

  onScreen(p, view) {
    const m = PARTICLE_DRAW_MARGIN;
    return !view || (p.x > view.left - m && p.x < view.right + m && p.y - p.z > view.top - m && p.y - p.z < view.bottom + m);
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

// ---------- things that keep making particles ----------
// tiles and objects whose particles setting is a list of effect names (tiles.js, objects.js) keep
// bursting each of them, the effect's rate times a second times their own particleRate: tiles from a
// random spot on the tile, objects from the middle of the tiles they cover (moved by particleX,
// particleY px). only on the map you're on. it's built to stay cheap even on a map covered in lava:
//   - only ones on screen (or within PARTICLE_EMITTERS.margin of it) make any, so a big map costs the
//     same as a small one. the tiles only get looked through at all if some kind of tile makes them
//   - nothing is kept per tile: each frame each one bursts rate x dt times on average (burstsIn()),
//     so a thousand lava tiles is just one loop
//   - between them they keep at most PARTICLE_EMITTERS.share of PARTICLE_LIMIT alive. if the ones on
//     screen would make more (zoomed right out over lava), every one turns down evenly (turnedDown)
//     rather than the first ones looked at getting it all. that leaves room for hits, so blood always
//     shows
//   - particles that have stopped on the floor skip moving, and ones off screen aren't drawn (above)
const PARTICLE_EMITTERS = {
  // the part of PARTICLE_LIMIT they can fill
  share: 0.6,
  // world px past the screen's edge that still count as on screen, so smoke drifting in from just
  // off the edge is already going
  margin: 64,
};

const ParticleEmitters = {
  // how much they're turned down (1 is not at all, 0.5 is half as many), worked out from the frame
  // before. the dev panel shows it (debug.js)
  turnedDown: 1,

  // every frame from sketch.js. view is the camera's (camera.view())
  update(dt, map, view) {
    const m = PARTICLE_EMITTERS.margin;
    const left = view.left - m;
    const right = view.right + m;
    const top = view.top - m;
    const bottom = view.bottom + m;
    // how many particles the ones on screen would keep alive at full rate (bursts a second x
    // particles a burst x seconds each)
    let wanted = 0;
    // names: effects. rate: the tile's or object's particleRate. x, y, w, h: the area they start in
    const emit = (names, rate, x, y, w, h) => {
      for (const name of names) {
        const e = PARTICLE_EFFECTS[name];
        if (!e) continue;
        wanted += e.rate * rate * e.count * e.lifetime;
        const bursts = burstsIn(e.rate * rate * this.turnedDown, dt);
        for (let i = 0; i < bursts; i++) Particles.burst(e, x + randomBetween(0, w), y + randomBetween(0, h));
      }
    };

    if (Object.values(TILE_TYPES).some((type) => type.particles)) {
      // the tiles on screen, like drawTiles() (tilemap.js)
      const firstCol = Math.max(map.left, map.colAt(left));
      const lastCol = Math.min(map.left + map.cols - 1, map.colAt(right));
      const firstRow = Math.max(map.top, map.rowAt(top));
      const lastRow = Math.min(map.top + map.rows - 1, map.rowAt(bottom));
      for (let row = firstRow; row <= lastRow; row++) {
        for (let col = firstCol; col <= lastCol; col++) {
          const tile = map.get(col, row);
          if (tile?.particles) emit(tile.particles, tile.particleRate, col * TILE, row * TILE, TILE, TILE);
        }
      }
    }
    for (const obj of map.objects) {
      const type = OBJECT_TYPES[obj.type];
      if (!type?.particles) continue;
      const x = (obj.col + type.width / 2) * TILE + type.particleX;
      const y = (obj.row + type.height / 2) * TILE + type.particleY;
      if (x > left && x < right && y > top && y < bottom) emit(type.particles, type.particleRate, x, y, 0, 0);
    }

    const room = PARTICLE_LIMIT * PARTICLE_EMITTERS.share;
    this.turnedDown = wanted > room ? room / wanted : 1;
  },
};

// how many bursts to make this frame for something bursting `rate` times a second: the whole ones,
// plus a chance of one more for the bit left over, so on average it's exactly rate x dt
function burstsIn(rate, dt) {
  const expected = rate * dt;
  const whole = Math.floor(expected);
  return whole + (randomBetween(0, 1) < expected - whole ? 1 : 0);
}

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
