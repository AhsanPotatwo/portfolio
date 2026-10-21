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
// effects can make other effects (the Chain tab): a trail bursts out behind each particle while it
// flies, and then bursts where each one goes. so a firework is three effects: a rocket that goes at
// the top of its jump, trailing sparks and then bursting a ball of its own colour (firework,
// firework-trail, firework-bang). rain going when it lands and bursting rain-splash is the same idea.
// the examples in particles/ (confetti, snow, magic too) are there to copy
//
// particles are only for show and never change the game, so like sound they'd just run on each
// player's own computer in multiplayer. they're forgotten when you change map (loadMap() in sketch.js)
//
// there can be thousands at once (weather, hits, weapons, footsteps...), so drawing is built to make
// as few canvas calls as it can: colour buckets, rectangles, no save/restore (see beginDrawing() for
// why, and the Particles notes in README.md for the numbers), flying ones keep a sorted list between frames (sortFlying()), and things that
// make them nonstop turn down on computers that can't keep up (PARTICLE_EMITTERS)

// every setting an effect has, which is also its row in the particle editor: which tab it's on, the
// words next to it, its normal value (PARTICLE_DEFAULTS, below), and the tip the editor shows while
// the mouse is over it, which is also what it does. numbers get a slider from min to max going up in
// step (1 if there's no step). colour: true is a colour box, a true/false normal is a tick box with
// `tick` next to it, and choices () => [values] is a picker showing say(value) (and art(value, x, y,
// size) if it has one, a little picture in the picker). percentages are
// stored as 0 to 100, as the slider shows them. a new setting is a new line here and whatever it
// does in ParticleSystem
const PARTICLE_SETTINGS = [
  { tab: 'Amount', key: 'count', label: 'How many', normal: 12, min: 0, max: 500, tip: 'How many come out each burst' },
  { tab: 'Amount', key: 'countRandom', label: 'Give or take', normal: 4, min: 0, max: 200, tip: 'Up to this many more or fewer each burst' },
  { tab: 'Amount', key: 'area', label: 'Start area', normal: 4, min: 0, max: 256, unit: 'px', tip: 'They start anywhere in a circle this wide. 0 is all from one point' },

  { tab: 'Launch', key: 'pattern', label: 'Pattern', normal: 'fan', choices: () => Object.keys(PARTICLE_PATTERNS), say: (pattern) => PARTICLE_PATTERNS[pattern], tip: 'A ring spaces them evenly round the spread. A ball throws them up and down at Speed too, for bangs in the air' },
  { tab: 'Launch', key: 'speed', label: 'Speed', normal: 90, min: 0, max: 1500, step: 5, unit: 'px/s', tip: 'How fast they fly out along the floor' },
  { tab: 'Launch', key: 'speedRandom', label: 'Speed varies', normal: 60, min: 0, max: 100, unit: '%', tip: "Each one's speed is up to this much faster or slower" },
  // bursts with no angle (like dying, or tiles and objects) always go all round
  { tab: 'Launch', key: 'spread', label: 'Spread', normal: 360, min: 0, max: 360, step: 5, unit: '°', tip: 'How wide a fan they fly out in, away from whatever hit it. 360 is all round' },
  { tab: 'Launch', key: 'jumpHeight', label: 'Jump height', normal: 20, min: 0, max: 800, unit: 'px', tip: 'How high they go before falling (a bit less with air drag)' },
  { tab: 'Launch', key: 'jumpRandom', label: 'Jump varies', normal: 50, min: 0, max: 100, unit: '%', tip: "Each one's jump is up to this much higher or lower" },
  { tab: 'Launch', key: 'startHeight', label: 'Start higher', normal: 0, min: 0, max: 400, unit: 'px', tip: 'Start this far above where they come from, like flames from the top of a fire' },

  { tab: 'Physics', key: 'gravity', label: 'Gravity', normal: 700, min: -1000, max: 3000, step: 10, unit: 'px/s²', tip: 'Pulls them back down. Below 0 they float up instead (smoke) and never land' },
  { tab: 'Physics', key: 'airDrag', label: 'Air drag', normal: 0.5, min: 0, max: 10, step: 0.1, tip: 'Slows them down while they fly' },
  { tab: 'Physics', key: 'floorFriction', label: 'Floor grip', normal: 10, min: 0, max: 30, step: 0.5, tip: 'Slows them sliding along the floor once they land. 0 slides like ice' },
  { tab: 'Physics', key: 'bounce', label: 'Bounce', normal: 25, min: 0, max: 100, unit: '%', tip: 'How much speed they keep bouncing off the floor or walls. 0 sticks' },
  { tab: 'Physics', key: 'wind', label: 'Wind', normal: 0, min: -800, max: 800, step: 10, unit: 'px/s²', tip: 'Pushes them sideways while flying. Below 0 is to the left' },
  { tab: 'Physics', key: 'sway', label: 'Sway', normal: 0, min: 0, max: 200, unit: 'px/s', tip: 'Drifts side to side up to this fast while in the air, like snow or confetti' },
  // pull and swirl are round the middle of the burst each one came out of
  { tab: 'Physics', key: 'pull', label: 'Pull', normal: 0, min: -2000, max: 2000, step: 10, unit: 'px/s²', tip: 'Pulls them back to where they came out, for magic gathering in. Below 0 pushes them away' },
  { tab: 'Physics', key: 'swirl', label: 'Swirl', normal: 0, min: -720, max: 720, step: 10, unit: '°/s', tip: 'Turns them round where they came out. Below 0 is the other way. With pull it makes a whirlpool' },
  { tab: 'Physics', key: 'hitsWalls', label: 'Walls', normal: true, tick: 'bounce off solid tiles', tip: 'Untick to let them fly through walls' },

  { tab: 'Look', key: 'shape', label: 'Shape', normal: 'square', choices: () => Object.keys(PARTICLE_SHAPES), say: (shape) => PARTICLE_SHAPES[shape].say, art: drawShapeChoice, tip: 'Streaks point the way they fly, for sparks and rain' },
  // a file in particles/pictures/. '' uses the picture of whatever it came out of (an enemy's image)
  { tab: 'Look', key: 'picture', label: 'Picture', normal: '', choices: () => ['', ...Object.keys(PARTICLE_PICTURES)], say: (file) => file || "the thing's own", tip: "For the picture shapes. The thing's own is an enemy's picture, if it has one" },
  { tab: 'Look', key: 'bits', label: 'Bits across', normal: 4, min: 1, max: 32, tip: 'Bits cuts the picture into this many across and down. Lots gives single pixels' },
  { tab: 'Look', key: 'size', label: 'Size', normal: 4, min: 1, max: 128, unit: 'px', tip: 'How wide each one is. A whole picture keeps its shape' },
  { tab: 'Look', key: 'sizeRandom', label: 'Size varies', normal: 50, min: 0, max: 100, unit: '%', tip: 'Each one is up to this much bigger or smaller' },
  { tab: 'Look', key: 'endSize', label: 'End size', normal: 100, min: 0, max: 300, step: 5, unit: '%', tip: 'How big they are by the end. 0 shrinks away, 200 grows to double' },
  { tab: 'Look', key: 'stretch', label: 'Stretch', normal: 100, min: 10, max: 500, step: 5, unit: '%', tip: 'How long each one is for its height. 50 makes squares into confetti strips' },
  { tab: 'Look', key: 'spin', label: 'Spin', normal: 0, min: 0, max: 2160, step: 10, unit: '°/s', tip: 'Each one turns up to this fast, either way, until it slides to a stop' },
  { tab: 'Look', key: 'flip', label: 'Flip', normal: 0, min: 0, max: 1440, step: 10, unit: '°/s', tip: 'Tumbles over and over up to this fast, like confetti or leaves' },
  { tab: 'Look', key: 'randomTurn', label: 'Turned', normal: false, tick: 'start at any angle', tip: 'Each one starts turned a random way instead of straight' },

  { tab: 'Colour', key: 'colourMode', label: 'Colours', normal: 'mix', choices: () => Object.keys(PARTICLE_COLOUR_MODES), say: (mode) => PARTICLE_COLOUR_MODES[mode], tip: "The one it came from is for trails and thens (Chain tab), like a firework's bang matching its rocket" },
  { tab: 'Colour', key: 'colour', label: 'Colour', normal: '#ffffff', colour: true, tip: 'Mixed with colour 2, or one of the four' },
  { tab: 'Colour', key: 'colour2', label: 'Colour 2', normal: '#ffffff', colour: true, tip: 'Mixed with colour, or one of the four' },
  { tab: 'Colour', key: 'colour3', label: 'Colour 3', normal: '#ffffff', colour: true, tip: 'Only for one of the four' },
  { tab: 'Colour', key: 'colour4', label: 'Colour 4', normal: '#ffffff', colour: true, tip: 'Only for one of the four' },
  { tab: 'Colour', key: 'endColour', label: 'End colour', normal: '#ffffff', colour: true, tip: 'What they turn to by the end (with Turns, below)' },
  { tab: 'Colour', key: 'colourChange', label: 'Turns', normal: 0, min: 0, max: 100, step: 5, unit: '%', tip: 'How far they turn to the end colour by the time they go. 0 keeps their own' },
  { tab: 'Colour', key: 'twinkle', label: 'Twinkle', normal: 0, min: 0, max: 100, step: 5, unit: '%', tip: 'Flickers see-through at random, up to this much, for glitter and fireworks' },

  { tab: 'Life', key: 'lifetime', label: 'Lasts', normal: 3, min: 0.1, max: 60, step: 0.1, unit: 's', tip: 'How long each one lasts' },
  { tab: 'Life', key: 'lifetimeRandom', label: 'Lasts varies', normal: 30, min: 0, max: 100, unit: '%', tip: 'Each one lasts up to this much longer or shorter' },
  { tab: 'Life', key: 'fadeIn', label: 'Fade in', normal: 0, min: 0, max: 10, step: 0.1, unit: 's', tip: 'They fade in over their first this many seconds' },
  { tab: 'Life', key: 'fadeTime', label: 'Fade out', normal: 1, min: 0, max: 10, step: 0.1, unit: 's', tip: 'They fade away over their last this many seconds' },
  { tab: 'Life', key: 'opacity', label: 'Opacity', normal: 100, min: 5, max: 100, step: 5, unit: '%', tip: 'How solid they are. Lower is more see-through' },
  { tab: 'Life', key: 'glow', label: 'Glow', normal: false, tick: 'light up what is behind', tip: 'Adds its colour onto what is behind instead of covering it, for sparks and magic' },
  { tab: 'Life', key: 'shadow', label: 'Shadow', normal: true, tick: 'on the floor while flying', tip: 'A little shadow under each one while it is in the air' },

  // other effects, by name ('' for none). they come out of each particle's spot and height
  { tab: 'Chain', key: 'trail', label: 'Trail', normal: '', choices: particleEffectChoices, say: sayParticleEffect, art: (name, x, y, size) => drawParticleChoice(name, x, y, size), tip: 'Each one keeps bursting this behind it while it lasts, like sparks off a rocket' },
  { tab: 'Chain', key: 'trailRate', label: 'Trail rate', normal: 10, min: 0.5, max: 60, step: 0.5, unit: '/s', curve: 'log', tip: 'Trail bursts a second from each one' },
  { tab: 'Chain', key: 'then', label: 'Then', normal: '', choices: particleEffectChoices, say: sayParticleEffect, art: (name, x, y, size) => drawParticleChoice(name, x, y, size), tip: 'Each one bursts this where it goes, like a firework rocket going bang' },
  { tab: 'Chain', key: 'goesAt', label: 'Goes', normal: 'end', choices: () => Object.keys(PARTICLE_GOES_AT), say: (when) => PARTICLE_GOES_AT[when], tip: 'Going at the top of its jump suits rockets, and when it lands suits rain splashing' },

  // ParticleEmitters (below) uses it, times the tile's or object's particleRate. 'log' gives slow
  // rates (one every few seconds) as much room on the slider as fast ones
  { tab: 'Keep going', key: 'rate', label: 'Bursts', normal: 1, min: 0.05, max: 60, step: 0.05, unit: '/s', curve: 'log', tip: 'For tiles and objects that make it nonstop: bursts a second from each one' },
];

const PARTICLE_DEFAULTS = Object.fromEntries(PARTICLE_SETTINGS.map(({ key, normal }) => [key, normal]));

// the shapes: their words in the editor, and their outline 2 px across round 0, 0 (drawOne() scales
// it to size). the picture ones have no path. a new shape is a new line here
const PARTICLE_SHAPES = {
  square: { say: 'squares', path: particlePath([[-1, -1], [1, -1], [1, 1], [-1, 1]]) },
  circle: { say: 'circles', path: particlePath((path) => path.arc(0, 0, 1, 0, Math.PI * 2)) },
  triangle: { say: 'triangles', path: particlePath(particleStar(3, 1, 1)) },
  diamond: { say: 'diamonds', path: particlePath([[0, -1], [0.65, 0], [0, 1], [-0.65, 0]]) },
  star: { say: 'stars', path: particlePath(particleStar(5, 1, 0.45)) },
  heart: { say: 'hearts', path: particlePath((path) => {
    path.moveTo(0, 1);
    path.bezierCurveTo(-1.6, -0.1, -0.8, -1.3, 0, -0.5);
    path.bezierCurveTo(0.8, -1.3, 1.6, -0.1, 0, 1);
  }) },
  // filled evenodd (drawOne()), so the inner circle is a hole
  ring: { say: 'rings', path: particlePath((path) => {
    path.arc(0, 0, 1, 0, Math.PI * 2);
    path.moveTo(0.55, 0);
    path.arc(0, 0, 0.55, 0, Math.PI * 2);
  }) },
  plus: { say: 'pluses', path: particlePath([[-0.35, -1], [0.35, -1], [0.35, -0.35], [1, -0.35], [1, 0.35], [0.35, 0.35], [0.35, 1], [-0.35, 1], [-0.35, 0.35], [-1, 0.35], [-1, -0.35], [-0.35, -0.35]]) },
  // a thin line, turned to point the way it's flying (update()) instead of spinning
  streak: { say: 'streaks', path: particlePath([[-1, -0.3], [1, -0.3], [1, 0.3], [-1, 0.3]]), along: true },
  picture: { say: 'the whole picture' },
  bits: { say: 'bits of the picture' },
};

// a shape's outline from a list of [x, y] corners or a function drawing on a Path2D
function particlePath(points) {
  const path = new Path2D();
  if (typeof points === 'function') points(path);
  else points.forEach(([x, y]) => path.lineTo(x, y)); // the first lineTo starts it
  path.closePath();
  return path;
}

// the corners of a star with `points` points, pointing up, alternating outer and inner radius (a
// triangle is a 3 point star whose inner radius is its outer)
function particleStar(points, outer, inner) {
  return Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }).filter((_, i) => inner !== outer || i % 2 === 0);
}

// how a burst spreads out (burst()), and its words in the editor
const PARTICLE_PATTERNS = {
  fan: 'a random fan',
  ring: 'an even ring',
  ball: 'a ball, up and down too',
};

// how each particle gets its colour (particleColour()), and its words in the editor
const PARTICLE_COLOUR_MODES = {
  mix: 'mixed between the first two',
  pick: 'one of the four',
  rainbow: 'any bright colour',
  parent: 'the one it came from',
};

// when a particle goes (and bursts its effect's then), and its words in the editor. it always goes
// when it runs out, so these just make it go sooner
const PARTICLE_GOES_AT = {
  end: 'when it runs out',
  peak: 'at the top of its jump',
  lands: 'when it lands',
};

// the most there can be at once in each system (the map's, and the editor's preview). past this the
// oldest go first, so lots of hits at once can't slow the game down. drawing 6000 small ones holds
// 40 to 60 fps drawn at 2x on a GTX 1070 (about 2.5 times what it managed before the drawing was
// rebuilt, see beginDrawing()), and things that keep making them turn down on slower computers
// (PARTICLE_EMITTERS), so this is a ceiling for big moments rather than what's normally there
const PARTICLE_LIMIT = 8000;
// how many times over effects can make effects (a trail's trail's trail...), so one that makes
// itself can't go on forever
const PARTICLE_CHAIN_DEPTH = 4;
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
      artProblem('particle effect', name, PARTICLE_PICTURE_FOLDER + effect.picture, "couldn't load, so it's plain colour"); // utils.js
      PARTICLE_PICTURES[effect.picture] = null;
    });
  }
}

// "#rrggbb" as [r, g, b]
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

// a bright colour h of the way round the colour wheel (0 to 1, red first) as [r, g, b]
function hueToRgb(h) {
  return [0, 8, 4].map((n) => {
    const k = (n + h * 12) % 12;
    return Math.round(255 * (0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  });
}

// a new particle's colour as [r, g, b], by its effect's colourMode. parent is the [r, g, b] of the
// particle it came out of (or null), and t (0 to 1, random unless given) picks which colour
function particleColour(e, parent, t = Math.random()) {
  if (e.colourMode === 'parent' && parent) return parent;
  if (e.colourMode === 'rainbow') return hueToRgb(t);
  if (e.colourMode === 'pick') return hexToRgb(e[['colour', 'colour2', 'colour3', 'colour4'][Math.floor(t * 4) % 4]]);
  const from = hexToRgb(e.colour);
  const to = hexToRgb(e.colour2);
  return from.map((c, j) => Math.round(c + (to[j] - c) * t));
}

// a particle's colour now as [r, g, b], partway to its end colour by its effect's colourChange. the
// shaders light up glowing ones with it (shaders.js)
function particleRgb(p) {
  const t = (p.effect.colourChange / 100) * (p.age / p.life);
  return t ? p.rgb.map((c, j) => Math.round(c + (p.end[j] - c) * t)) : p.rgb;
}

// the Trail and Then pickers: '' and every effect
function particleEffectChoices() {
  return ['', ...Object.keys(PARTICLE_EFFECTS)];
}

function sayParticleEffect(name) {
  return name || 'nothing';
}

// a list of flying, bouncing, fading particles. the map has one (Particles), and the particle editor's
// preview has its own
class ParticleSystem {
  constructor() {
    // each one is { effect, x, y, z, vx, vy, vz, ox, oy, size, rgb, end, angle, spin, flip,
    // flipSpeed, phase, swaySpeed, age, life, depth, img, bit }: its effect's settings, its floor spot
    // and height (px), their speeds (px/s), the middle of its burst (for pull and swirl), its
    // size at the start, its colour at the start as [r, g, b] and the [r, g, b] it
    // turns to, which way it's turned and how fast it's turning (radians, radians/s), the same for
    // tumbling over, where it is in its sway and how fast it sways (radians, radians/s), seconds alive
    // and how many it gets, how many effects made it (0 if it came straight from burst()), and its
    // picture (a p5 image or null) and which bit of it ({ u, v, n }: the bit's column and row out of
    // n, or null for the whole picture)
    this.list = [];
    // the flying ones in the order they were last drawn (sortFlying()), and a number that goes up
    // every time it sorts, to mark which ones it's using
    this.order = [];
    this.stamp = 0;
    // the particles being drawn, by colour, and those with shadows (beginDrawing()). kept and emptied
    // each time rather than made new
    this.buckets = new Map();
    this.shadows = [];
  }

  // particles from an effect (a PARTICLE_EFFECTS name, or its settings) bursting out from above the
  // floor spot x, y (world px). an effect that doesn't exist does nothing. options:
  //   height  px above the floor they start at (0 is on the floor)
  //   angle   radians the fan points (spread), like away from whoever hit it. leave it out for all round
  //   img     a p5 image the picture and bits shapes use if the effect hasn't got its own picture
  //   rgb     [r, g, b] for the parent colour mode (the particle a trail or then came out of)
  //   depth   how many effects made this one (update() counts it up, up to PARTICLE_CHAIN_DEPTH)
  burst(effect, x, y, { height = 0, angle, img = null, rgb = null, depth = 0 } = {}) {
    const e = typeof effect === 'string' ? PARTICLE_EFFECTS[effect] : effect;
    if (!e) return;
    const picture = e.shape === 'picture' || e.shape === 'bits' ? (e.picture ? PARTICLE_PICTURES[e.picture] : img) : null;
    const end = hexToRgb(e.endColour);
    const count = Math.round(e.count + randomBetween(-e.countRandom, e.countRandom)); // utils.js
    // a percentage either way, never below 0
    const vary = (value, percent) => Math.max(0, value * (1 + randomBetween(-percent, percent) / 100));
    // the middle of the fan, and how wide it is. bursts with no angle go all round
    const middle = angle ?? randomBetween(0, Math.PI * 2);
    const fan = radians(angle === undefined ? 360 : e.spread);
    for (let i = 0; i < count; i++) {
      // a random spot in the start area. the square root spreads them evenly instead of bunching them
      // in the middle
      const startAngle = randomBetween(0, Math.PI * 2);
      const out = Math.sqrt(randomBetween(0, 1)) * e.area / 2;
      const heading = middle + fan * (e.pattern === 'ring' ? (i + 0.5) / count - 0.5 : randomBetween(-0.5, 0.5));
      const speed = vary(e.speed, e.speedRandom);
      // a ball's up and down part of its way out (-1 to 1). picking it evenly spreads them evenly over
      // the ball, and the rest of the speed goes along the floor
      const up = e.pattern === 'ball' ? randomBetween(-1, 1) : 0;
      const flat = Math.sqrt(1 - up * up);
      // the speed up that reaches jumpHeight under this gravity (v² = 2gh). floaty ones with gravity
      // at or below 0 use its size the same way, so jump height still makes them go up faster
      const jump = Math.sqrt(2 * Math.max(1, Math.abs(e.gravity)) * vary(e.jumpHeight, e.jumpRandom));
      const colour = particleColour(e, rgb);
      const px = x + Math.cos(startAngle) * out;
      const py = y + Math.sin(startAngle) * out;
      this.list.push({
        effect: e,
        x: px,
        y: py,
        z: height + e.startHeight,
        vx: Math.cos(heading) * speed * flat,
        vy: Math.sin(heading) * speed * flat,
        vz: jump + up * speed,
        ox: x,
        oy: y,
        size: Math.max(1, vary(e.size, e.sizeRandom)),
        rgb: colour,
        end,
        angle: e.randomTurn ? randomBetween(0, Math.PI * 2) : 0,
        spin: radians(randomBetween(-e.spin, e.spin)),
        flip: e.randomTurn && e.flip ? randomBetween(0, Math.PI * 2) : 0,
        flipSpeed: radians(randomBetween(-e.flip, e.flip)),
        phase: randomBetween(0, Math.PI * 2),
        swaySpeed: randomBetween(1.5, 4),
        age: 0,
        life: Math.max(0.05, vary(e.lifetime, e.lifetimeRandom)),
        depth,
        img: picture,
        bit: e.shape === 'bits' ? { u: Math.floor(randomBetween(0, e.bits)), v: Math.floor(randomBetween(0, e.bits)), n: e.bits } : null,
      });
    }
    // update() keeps it to PARTICLE_LIMIT once a frame, since cutting the front off the list here on
    // every burst (lots of them a frame at the limit) moved the whole list each time. this only
    // catches lots of bursts with no updates between
    if (this.list.length > PARTICLE_LIMIT * 2) this.list.splice(0, this.list.length - PARTICLE_LIMIT);
  }

  clear() {
    this.list = [];
    this.order = [];
  }

  // moves them all on by dt seconds. map is a TileMap whose solid tiles they bounce off (if their
  // effect's hitsWalls), or null for no walls
  update(dt, map) {
    // [effect name, particle] for each trail and then bursting out of one this frame. they burst
    // after the loop, so new ones don't get moved before they're drawn
    const chain = [];
    for (const p of this.list) {
      const e = p.effect;
      p.age += dt;
      if (e.trail) for (let i = burstsIn(e.trailRate, dt); i > 0; i--) chain.push([e.trail, p]);
      // lying on the floor (or sliding along it). floaty ones never are
      const onFloor = p.z <= 0 && p.vz <= 0 && e.gravity >= 0;
      // drag in the air and grip on the floor both take off part of the speed each second. Math.exp
      // makes it the same at any frame rate (like approach() in utils.js)
      const slow = Math.exp(-(onFloor ? e.floorFriction : e.airDrag) * dt);
      p.vx = p.vx * slow + (onFloor ? 0 : e.wind * dt);
      p.vy *= slow;
      if (onFloor) {
        p.spin *= slow;
        p.flipSpeed *= slow;
      } else {
        const rising = p.vz > 0;
        p.vz -= e.gravity * dt;
        p.z += p.vz * dt;
        // going early (goesAt) by running its life out, so it bursts its then like any other
        if (rising && p.vz <= 0 && e.goesAt === 'peak') p.age = p.life;
        // hit the floor: bounce back up with some of its speed, or lie there if that's too slow
        if (p.z < 0 && e.gravity >= 0) {
          p.z = 0;
          p.vz = -p.vz * e.bounce / 100;
          if (p.vz < PARTICLE_REST_SPEED) p.vz = 0;
          if (e.goesAt === 'lands') p.age = p.life;
        }
      }
      // pulled toward the middle of its burst (pushed away below 0), along the floor
      const dx = p.x - p.ox;
      const dy = p.y - p.oy;
      if (e.pull) {
        const d = Math.hypot(dx, dy) || 1;
        p.vx -= (dx / d) * e.pull * dt;
        p.vy -= (dy / d) * e.pull * dt;
      }
      if (PARTICLE_SHAPES[e.shape].along && (p.vx || p.vy || p.vz)) p.angle = Math.atan2(p.vy - p.vz, p.vx);
      else p.angle += p.spin * dt;
      p.flip += p.flipSpeed * dt;
      // stopped dead on the floor: nothing left to move
      if (onFloor && Math.abs(p.vx) < PARTICLE_STOP_SPEED && Math.abs(p.vy) < PARTICLE_STOP_SPEED) {
        p.vx = 0;
        p.vy = 0;
        continue;
      }
      // how far it goes this frame: its speed, plus swaying side to side in the air and swirling round
      // the middle of its burst (which go straight onto where it is, not its speed)
      let moveX = p.vx * dt;
      let moveY = p.vy * dt;
      if (e.sway && !onFloor) moveX += Math.cos(p.phase + p.age * p.swaySpeed) * e.sway * dt;
      if (e.swirl) {
        const turn = radians(e.swirl) * dt;
        moveX += dx * (Math.cos(turn) - 1) - dy * Math.sin(turn);
        moveY += dx * Math.sin(turn) + dy * (Math.cos(turn) - 1);
      }
      // x and then y, so it bounces off the side of a wall it hits at an angle. empty and off-map
      // tiles are solid, so they stay on the map. one that's inside something solid (a campfire's
      // flames start inside the solid campfire) ignores walls, or it'd bounce about in there forever.
      // ponytail: walls are as tall as the sky, so a bit flying over a wall still bounces off it.
      // giving tiles a height would fix it
      // a fast one goes in steps of at most a tile, so it can't skip over a thin wall
      const walls = e.hitsWalls && map && !map.isSolid(map.colAt(p.x), map.rowAt(p.y));
      const bounce = -e.bounce / 100;
      const steps = walls ? Math.ceil(Math.max(Math.abs(moveX), Math.abs(moveY)) / TILE) : 1;
      for (let s = 0; s < steps; s++) {
        const x = p.x + moveX / steps;
        if (walls && map.isSolid(map.colAt(x), map.rowAt(p.y))) {
          p.vx *= bounce;
          moveX = 0;
        } else p.x = x;
        const y = p.y + moveY / steps;
        if (walls && map.isSolid(map.colAt(p.x), map.rowAt(y))) {
          p.vy *= bounce;
          moveY = 0;
        } else p.y = y;
      }
    }
    // the ones still going shuffle down the list in place, rather than filter() making a new list of
    // thousands every frame for the garbage collector to clear up (a stutter every so often)
    let kept = 0;
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      if (p.age < p.life) this.list[kept++] = p;
      else if (p.effect.then) chain.push([p.effect.then, p]);
    }
    this.list.length = kept;
    // past the limit the oldest go first (they're at the front)
    if (kept > PARTICLE_LIMIT) this.list.splice(0, kept - PARTICLE_LIMIT);
    for (const [name, p] of chain) {
      if (p.depth < PARTICLE_CHAIN_DEPTH) this.burst(name, p.x, p.y, { height: Math.max(0, p.z), img: p.img, rgb: particleRgb(p), depth: p.depth + 1 });
    }
  }

  // the ones lying on the floor, in world positions (inside camera.begin/end). they go under
  // everything else, and flying ones get sorted in with the characters (drawFlyingWith()). view is
  // the camera's (camera.view()) so ones off the screen get skipped, or leave it out for all of them
  drawFloor(view) {
    const batch = this.beginDrawing();
    for (const p of this.list) {
      if (p.z <= 0 && this.onScreen(p, view)) this.drawOne(p, batch);
    }
    this.endDrawing(batch);
  }

  // the flying ones on screen, sorted in with `things` (each { y, draw() }, already sorted by y) so
  // whatever's lower on screen is in front, then drawn (sketch.js). they're drawn in runs between the
  // things, rather than each being a thing of its own to sort, which cost a little object for every
  // particle every frame
  drawFlyingWith(things, view) {
    const flying = this.sortFlying(view);
    let from = 0;
    for (const thing of things) {
      // a particle level with a thing goes behind it, like the sort this replaced
      let to = from;
      while (to < flying.length && flying[to].y < thing.y) to++;
      this.drawRange(flying, from, to);
      thing.draw();
      from = to;
    }
    this.drawRange(flying, from, flying.length);
  }

  // the flying ones on screen sorted by their floor spot (y). the order is kept from frame to frame
  // (this.order): last frame's that are still flying on screen, in last frame's order, then new ones
  // on the end. particles barely move in a frame, so it's nearly sorted already, which the browser's
  // sort gets through in about one pass
  sortFlying(view) {
    const stamp = ++this.stamp;
    for (const p of this.list) {
      if (p.z > 0 && this.onScreen(p, view)) p.stamp = stamp;
    }
    const order = this.order;
    let kept = 0;
    for (const p of order) {
      // marked as kept, so the loop below doesn't add it again
      if (p.stamp === stamp) {
        order[kept++] = p;
        p.stamp = -stamp;
      }
    }
    order.length = kept;
    for (const p of this.list) {
      if (p.stamp === stamp) order.push(p);
    }
    return order.sort(byFloorSpot);
  }

  onScreen(p, view) {
    const m = PARTICLE_DRAW_MARGIN;
    return !view || (p.x > view.left - m && p.x < view.right + m && p.y - p.z > view.top - m && p.y - p.z < view.bottom + m);
  }

  // all of them, floor ones first (the editor's preview)
  drawAll() {
    this.drawFloor();
    this.drawRange(this.list.filter((p) => p.z > 0));
  }

  // list[from] to list[to - 1]
  drawRange(list, from = 0, to = list.length) {
    if (from >= to) return;
    const batch = this.beginDrawing();
    for (let i = from; i < to; i++) this.drawOne(list[i], batch);
    this.endDrawing(batch);
  }

  // drawing is most of what particles cost, and the canvas costs about the same for every call
  // whatever it draws, so it's built to make as few calls as it can (measured in Chrome with 3000 on
  // screen, drawn at 2x, on a GTX 1070):
  //   - setting the colour is the dearest call (the canvas reads the colour's text every time), so a
  //     run of particles is sorted into buckets of one colour (rounded to steps of 8 out of 255, which
  //     you can't see on something a few pixels across) and each bucket sets it once
  //   - rectangles are by far the cheapest thing to fill, and the most common shapes are squares and
  //     streaks, so those are fillRect()s. circles (and shadows) and the fancier shapes (stars, hearts,
  //     rings...) are filled as real shapes, which the graphics card finds harder, so lots of circles
  //     cost more than lots of squares. I tried drawing small circles as pixel art circles made of
  //     rectangles, which was quicker but looked bad
  //   - only particles that are turned get a transform of their own. the rest draw straight in world
  //     positions under the camera's
  //   - nothing per particle uses save() and restore()
  // which of two particles in the same run is on top can change, which doesn't show
  beginDrawing() {
    const ctx = drawingContext;
    const m = ctx.getTransform();
    for (const bucket of this.buckets.values()) bucket.length = 0;
    // a colour that's been seen before keeps its bucket, but lots of them (rainbow confetti) would
    // pile up
    if (this.buckets.size > 512) this.buckets.clear();
    this.shadows.length = 0;
    return { ctx, m, alpha: ctx.globalAlpha, blend: ctx.globalCompositeOperation, scale: Math.hypot(m.a, m.b), turned: false };
  }

  // fills the shadows, then each colour's bucket, then puts the canvas back how it was
  endDrawing(batch) {
    const { ctx } = batch;
    if (this.shadows.length > 0) {
      ctx.fillStyle = '#000';
      for (const p of this.shadows) {
        ctx.globalAlpha = batch.alpha * p.drawShadow;
        // an oval on its floor spot, half as tall as it's wide
        turnParticle(batch, null, p.x, p.y, p.drawHalf, p.drawHalf / 2);
        ctx.fill(PARTICLE_SHAPES.circle.path);
      }
    }
    for (const [key, bucket] of this.buckets) {
      if (bucket.length === 0) continue;
      ctx.globalCompositeOperation = key & PARTICLE_GLOWS ? 'lighter' : batch.blend;
      ctx.fillStyle = particleColourText(key);
      for (const p of bucket) {
        ctx.globalAlpha = batch.alpha * p.drawAlpha;
        fillParticle(batch, p);
      }
    }
    if (batch.turned) ctx.setTransform(batch.m);
    ctx.globalAlpha = batch.alpha;
    ctx.globalCompositeOperation = batch.blend;
  }

  // works out how one particle looks now and puts it in its colour's bucket (and its shadow with the
  // shadows), between beginDrawing() and endDrawing(), in world positions. ones with a picture are
  // drawn straight away, since they don't have a colour
  drawOne(p, batch) {
    const e = p.effect;
    const t = p.age / p.life;
    const size = p.size * (1 + (e.endSize / 100 - 1) * t);
    if (size < 0.5) return;
    // fading in over the first fadeIn seconds and out over the last fadeTime (x / 0 is Infinity, so
    // 0 never fades out), and twinkling at random
    const fadeIn = e.fadeIn ? p.age / e.fadeIn : 1;
    const twinkle = e.twinkle ? 1 - (Math.random() * e.twinkle) / 100 : 1;
    const alpha = (e.opacity / 100) * Math.min(1, fadeIn, (p.life - p.age) / e.fadeTime) * twinkle;
    if (alpha <= 0) return;
    p.drawAlpha = alpha;
    p.drawHalf = size / 2;
    // a shadow on its floor spot, fainter the higher it is
    p.drawShadow = e.shadow && p.z > 0 ? alpha * 0.3 * (1 - p.z / 200) : 0;
    if (p.drawShadow > 0) this.shadows.push(p);

    // a p5 image is 1 x 1 until it's loaded
    const img = p.img && p.img.width > 1 ? p.img : null;
    if (img) {
      const { ctx } = batch;
      ctx.globalAlpha = batch.alpha * alpha;
      ctx.globalCompositeOperation = e.glow ? 'lighter' : batch.blend;
      turnParticle(batch, p);
      if (p.bit) {
        const w = img.width / p.bit.n;
        const h = img.height / p.bit.n;
        ctx.drawImage(img.canvas, p.bit.u * w, p.bit.v * h, w, h, -1, -1, 2, 2);
      } else {
        const h = img.height / img.width;
        ctx.drawImage(img.canvas, -1, -h, 2, h * 2);
      }
      ctx.globalAlpha = batch.alpha;
      ctx.globalCompositeOperation = batch.blend;
      return;
    }
    let [r, g, b] = p.rgb;
    if (e.colourChange) {
      const turn = (e.colourChange / 100) * t;
      r += (p.end[0] - r) * turn;
      g += (p.end[1] - g) * turn;
      b += (p.end[2] - b) * turn;
    }
    const key = (e.glow ? PARTICLE_GLOWS : 0) | ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let bucket = this.buckets.get(key);
    if (!bucket) this.buckets.set(key, bucket = []);
    bucket.push(p);
  }
}

// the bit of a colour bucket's key that says it glows (ParticleSystem.drawOne())
const PARTICLE_GLOWS = 1 << 15;
// a bucket's colour as the canvas wants it, by key, so it's only made once
const PARTICLE_COLOUR_TEXT = new Map();

function particleColourText(key) {
  let text = PARTICLE_COLOUR_TEXT.get(key);
  if (!text) {
    // the middle of each step of 8
    const level = (shift) => (((key >> shift) & 31) << 3) + 4;
    text = `rgb(${level(10)}, ${level(5)}, ${level(0)})`;
    PARTICLE_COLOUR_TEXT.set(key, text);
  }
  return text;
}

// one particle in the colour and see-throughness already set
function fillParticle(batch, p) {
  const e = p.effect;
  const { ctx } = batch;
  // a picture that hasn't loaded (or failed to) is a square
  const shape = PARTICLE_SHAPES[e.shape].path ? e.shape : 'square';
  // stretched long, and squashed flat as it tumbles over (flip)
  const rx = (e.stretch / 100) * p.drawHalf;
  const ry = Math.abs(Math.cos(p.flip)) * p.drawHalf;
  // whole pixels, so they stay sharp like the rest of the art
  const x = Math.round(p.x);
  const y = Math.round(p.y - p.z);
  if (shape === 'square' && !p.angle) {
    if (batch.turned) unturnParticles(batch);
    ctx.fillRect(x - rx, y - ry, rx * 2, ry * 2);
  } else {
    turnParticle(batch, p, x, y, rx, ry);
    if (shape === 'square') ctx.fillRect(-1, -1, 2, 2);
    else if (shape === 'streak') ctx.fillRect(-1, -0.3, 2, 0.6);
    else ctx.fill(PARTICLE_SHAPES[shape].path, 'evenodd');
  }
}

// sets the canvas's transform to the camera's (batch.m), moved to x, y, turned by p's angle (none for
// null) and scaled by rx, ry (the sums are those matrices multiplied out), so it draws from -1 to 1.
// given only p, it works those out the way fillParticle() does, for pictures
function turnParticle(batch, p, x, y, rx, ry) {
  if (x === undefined) {
    rx = (p.effect.stretch / 100) * p.drawHalf;
    ry = Math.cos(p.flip) * p.drawHalf;
    x = Math.round(p.x);
    y = Math.round(p.y - p.z);
  }
  const { m } = batch;
  const angle = p ? p.angle : 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const a = cos * rx;
  const b = sin * rx;
  const c = -sin * ry;
  const d = cos * ry;
  batch.ctx.setTransform(m.a * a + m.c * b, m.b * a + m.d * b, m.a * c + m.c * d, m.b * c + m.d * d, m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f);
  batch.turned = true;
}

// back to the camera's transform, for particles drawn in world positions
function unturnParticles(batch) {
  batch.ctx.setTransform(batch.m);
  batch.turned = false;
}

// sorts particles by their floor spot (ParticleSystem.sortFlying())
function byFloorSpot(a, b) {
  return a.y - b.y;
}

// the map's particles. sketch.js updates and draws them
const Particles = new ParticleSystem();

// ---------- things that keep making particles ----------
// tiles and objects whose particles setting is a list of effect names (tiles.js, objects.js) keep
// bursting each of them (and so does the map's weather, from all over the screen, atmosphere.js), the effect's rate times a second times their own particleRate: tiles from a
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
//   - on a computer that can't keep up (frames slower than slowFrame) they turn down further, bit by
//     bit, and back up once frames are quicker than fastFrame (quality). hits, deaths and anything
//     else bursting from code are never turned down, so the game's own feedback always shows
const PARTICLE_EMITTERS = {
  // the part of PARTICLE_LIMIT they can fill
  share: 0.6,
  // seconds a frame: slower than slowFrame (50 fps) turns them down, quicker than fastFrame (57 fps)
  // turns them back up, never below lowest of what they'd make. down is quicker than up, so it
  // doesn't swing back and forth
  slowFrame: 1 / 50,
  fastFrame: 1 / 57,
  lowest: 0.2,
  // how much quality changes a second each way
  down: 0.8,
  up: 0.2,
  // world px past the screen's edge that still count as on screen, so smoke drifting in from just
  // off the edge is already going
  margin: 64,
};

const ParticleEmitters = {
  // how much they're turned down (1 is not at all, 0.5 is half as many), worked out from the frame
  // before. the dev panel shows it (debug.js)
  turnedDown: 1,
  // 0 to 1, how far they're turned down for a computer that can't keep up, and the frame time it
  // goes by (smoothed over about a quarter of a second, so one slow frame doesn't count)
  quality: 1,
  frameTime: 1 / 60,

  // every frame from sketch.js. view is the camera's (camera.view())
  update(dt, map, view) {
    const P = PARTICLE_EMITTERS;
    this.frameTime += (dt - this.frameTime) * Math.min(1, dt * 4);
    if (this.frameTime > P.slowFrame) this.quality = Math.max(P.lowest, this.quality - P.down * dt);
    else if (this.frameTime < P.fastFrame) this.quality = Math.min(1, this.quality + P.up * dt);
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

    // the map's weather (atmosphere.js): as if every tile on screen made it, times its amount. they
    // start anywhere on screen and further down by however high they start, so rain and snow falling
    // from up there reach the bottom of the screen too
    const air = Atmosphere.showing(map);
    if (air?.weather) {
      const tiles = ((right - left) * (bottom - top)) / (TILE * TILE);
      for (const name of air.weather) {
        const e = PARTICLE_EFFECTS[name];
        if (e) emit([name], (tiles * air.weatherAmount) / 100, left, top, right - left, bottom - top + e.startHeight + e.jumpHeight);
      }
    }
    // and each area's, only from the part of it on screen (and below, like the map's), thinning out
    // over its soft edge (areaAmount() in atmosphere.js)
    for (const { area, a } of Atmosphere.showingAreas(map)) {
      if (!a.weather) continue;
      const box = areaBox(area);
      const x0 = Math.max(left, box.left);
      const x1 = Math.min(right, box.right);
      const y0 = Math.max(top, box.top);
      for (const name of a.weather) {
        const e = PARTICLE_EFFECTS[name];
        const y1 = Math.min(bottom + (e?.startHeight ?? 0) + (e?.jumpHeight ?? 0), box.bottom);
        if (!e || x1 <= x0 || y1 <= y0) continue;
        const rate = (((x1 - x0) * (y1 - y0)) / (TILE * TILE)) * (a.weatherAmount / 100) * (area.strength / 100);
        wanted += e.rate * rate * e.count * e.lifetime;
        for (let i = burstsIn(e.rate * rate * this.turnedDown, dt); i > 0; i--) {
          const x = randomBetween(x0, x1);
          const y = randomBetween(y0, y1);
          if (randomBetween(0, 1) < areaAmount(area, x, y)) Particles.burst(e, x, y);
        }
      }
    }

    const room = PARTICLE_LIMIT * PARTICLE_EMITTERS.share;
    this.turnedDown = (wanted > room ? room / wanted : 1) * this.quality;
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
  const bit = Math.max(2, Math.min(size / 6, effect.size));
  spots.forEach(([dx, dy], i) => fillParticleShape(effect.shape, x + dx * size, y + dy * size, bit, particleColour(effect, null, i / spots.length)));
}

// one particle shape size px across round x, y in rgb ([r, g, b]). the picture ones are squares
function fillParticleShape(shape, x, y, size, rgb) {
  const ctx = drawingContext;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 2, size / 2);
  ctx.fillStyle = `rgb(${rgb.join(', ')})`;
  ctx.fill(PARTICLE_SHAPES[shape].path ?? PARTICLE_SHAPES.square.path, 'evenodd');
  ctx.restore();
}

// a shape's little picture in the particle editor's Shape picker (size px square at x, y)
function drawShapeChoice(shape, x, y, size) {
  if (PARTICLE_SHAPES[shape].path) fillParticleShape(shape, x + size / 2, y + size / 2, size * 0.7, [255, 255, 255]);
}

// every effect loads once at the start (datafiles.js). blood (when a character's hit) and blood-burst
// (when an enemy dies) are used, and sparks, smoke and dust are there to try and copy
DataFiles.register('particle', {
  define: defineParticles,
  names: () => Object.keys(PARTICLE_EFFECTS),
  toData: (name) => typeToData(PARTICLE_EFFECTS[name], PARTICLE_DEFAULTS), // utils.js
});
