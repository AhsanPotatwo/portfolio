// particle effects: little bits that burst out of something, fly up, fall back onto the floor, lie
// there a while and fade, like the bits when you break a block in minecraft. characters burst their
// hitParticles when a swing hits them (blood, by default) and enemies their deathParticles when they
// die (Character.burstParticles() in character.js). tiles and objects can keep making them forever,
// like lava bubbling or a campfire (ParticleEmitters, near the bottom).
//
// the game's top down, so each particle has a spot on the floor (x, y in world px) and a height above
// that spot (z). it's drawn z px further up the screen than its spot, with a shadow on the spot, which
// is what makes it look like it's flying up and falling back down. gravity pulls z down, the floor
// bounces it, and walls (solid tiles) bounce it along the floor. landing in a liquid it sinks, spreads
// through it or floats on it, bobbing and drifting and shoved aside by waders, and in a hot one (lava)
// it can sizzle away or burn up, making steam or smoke (the Liquids and Floating tabs, fallIn() and
// floatOn(), with what shows on the surface in surface.js).
//
// they're drawn like the rest of the art, a picture px at a time on its grid (pixel, fillPixels()):
// each shape filled in at its size and angle, little stars, hearts and bubbles drawn by hand, and
// steam, smoke and fire as shapes that draw themselves (wisps and flames). untick Pixel for smooth
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
// why, and the comment above ParticleSystem.beginDrawing() for the numbers), flying ones keep a sorted list between frames (sortFlying()), and things that
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
  // fillPixels()
  { tab: 'Look', key: 'pixel', label: 'Pixel', normal: true, tick: "on the art's pixel grid", tip: 'Drawn a picture px at a time like the rest of the art, and pictures turn in quarter turns. Untick for smooth shapes' },
  { tab: 'Look', key: 'shade', label: 'Shading', normal: 0, min: 0, max: 60, step: 5, unit: '%', tip: "Pixel ones 3 px or bigger are this much darker underneath, lit from the top left like the art" },

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
  { tab: 'Life', key: 'fadeStyle', label: 'Fades by', normal: 'clear', choices: () => Object.keys(PARTICLE_FADES), say: (way) => PARTICLE_FADES[way], tip: 'How they fade in and out: going see-through, shrinking away, or (pixel ones) losing px until none are left' },
  { tab: 'Life', key: 'glow', label: 'Glow', normal: false, tick: 'light up what is behind', tip: 'Adds its colour onto what is behind instead of covering it, for sparks and magic' },
  { tab: 'Life', key: 'shadow', label: 'Shadow', normal: true, tick: 'on the floor while flying', tip: 'A little shadow under each one while it is in the air' },

  // liquids are tiles you sink into (tiles.js). drawFloor() clips onLiquid ones to the map's liquid
  // tiles, and the editor's plain floor preview has no map, so shows them all
  { tab: 'Liquids', key: 'onLiquid', label: 'Liquid only', normal: false, tick: 'only shows over liquids', tip: 'On the floor, it only shows over liquids, so ripples stop at the shore. These never sink or float' },
  // ParticleSystem.fallIn() and floatOn(), and what shows on the surface is Surface.splash() and
  // Surface.floating() (surface.js)
  { tab: 'Liquids', key: 'inLiquid', label: 'In liquids', normal: 'sinks', choices: () => Object.keys(PARTICLE_IN_LIQUID), say: (way) => PARTICLE_IN_LIQUID[way], tip: 'Landing in a liquid they go under with a little ring, spread through it as a cloud of their colour (blood), or float on it (leaves, confetti). Floating is on the Floating tab' },
  { tab: 'Liquids', key: 'liquidThen', label: 'Going in', normal: '', choices: particleEffectChoices, say: sayParticleEffect, art: (name, x, y, size) => drawParticleChoice(name, x, y, size), tip: 'Each one bursts this where it goes into a liquid, like bubbles' },
  { tab: 'Liquids', key: 'splashRing', label: 'Splash ring', normal: 100, min: 0, max: 300, step: 5, unit: '%', tip: 'How big the ring is where each one goes in, for its size. 0 for none' },
  { tab: 'Liquids', key: 'cloudSize', label: 'Cloud spreads', normal: 6, min: 0, max: 40, unit: 'px', tip: 'Spreading through it: how far each cloud spreads out. Opacity is how strongly its colour shows through' },
  { tab: 'Liquids', key: 'cloudTime', label: 'Cloud lasts', normal: 2.6, min: 0.2, max: 10, step: 0.1, unit: 's', tip: 'Spreading through it: how long each cloud takes to thin away' },
  // hot liquids are tiles with hot ticked (lava, tiles.js)
  { tab: 'Liquids', key: 'inHot', label: 'In hot liquids', normal: 'same', choices: () => Object.keys(PARTICLE_IN_HOT), say: (way) => PARTICLE_IN_HOT[way], tip: 'Landing in a hot liquid (lava): the same as any other, sizzle away at once (water, blood), or burn up on top, glowing then charring as they shrink (leaves, confetti)' },
  { tab: 'Liquids', key: 'hotThen', label: 'Going in hot', normal: '', choices: particleEffectChoices, say: sayParticleEffect, art: (name, x, y, size) => drawParticleChoice(name, x, y, size), tip: 'Each one bursts this going into a hot liquid, like steam. Burning, it keeps making it until it has burnt up, like smoke' },
  { tab: 'Liquids', key: 'burnTime', label: 'Burns for', normal: 1, min: 0.1, max: 10, step: 0.1, unit: 's', tip: 'Burning up: how long each one takes' },

  { tab: 'Floating', key: 'floatDepth', label: 'Sits in', normal: 30, min: 0, max: 90, step: 5, unit: '%', tip: "Floating: how much of each one is under the surface, so it takes on the liquid's colour" },
  { tab: 'Floating', key: 'floatBob', label: 'Bob', normal: 1, min: 0, max: 8, step: 0.5, unit: 'px', tip: 'Floating: how far they bob up and down. Bigger ones bob slower' },
  { tab: 'Floating', key: 'floatRock', label: 'Rock', normal: 12, min: 0, max: 90, step: 1, unit: '°', tip: 'Floating: how far they tip one way and back as they bob' },
  { tab: 'Floating', key: 'floatDrift', label: 'Drift', normal: 3, min: 0, max: 60, unit: 'px/s', tip: 'Floating: how fast they wander about on the surface' },
  { tab: 'Floating', key: 'floatPush', label: 'Pushed', normal: 100, min: 0, max: 300, step: 5, unit: '%', tip: 'Floating: how much people wading through shove them aside and set them bobbing' },
  { tab: 'Floating', key: 'floatSoak', label: 'Sinks after', normal: 0, min: 0, max: 60, step: 0.5, unit: 's', tip: 'Floating: they soak up the liquid, darken and sink after this long. 0 floats until they fade' },

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
  // a thin ring, for ripples. stretched wide (stretch), it lies flat on the floor like a liquid's surface
  ripple: { say: 'ripples', path: particlePath((path) => {
    path.arc(0, 0, 1, 0, Math.PI * 2);
    path.moveTo(0.86, 0);
    path.arc(0, 0, 0.86, 0, Math.PI * 2);
  }) },
  plus: { say: 'pluses', path: particlePath([[-0.35, -1], [0.35, -1], [0.35, -0.35], [1, -0.35], [1, 0.35], [0.35, 0.35], [0.35, 1], [-0.35, 1], [-0.35, 0.35], [-1, 0.35], [-1, -0.35], [-0.35, -0.35]]) },
  // a thin line, turned to point the way it's flying (update()) instead of spinning
  streak: { say: 'streaks', path: particlePath([[-1, -0.3], [1, -0.3], [1, 0.3], [-1, 0.3]]), along: true },
  // drawn a picture px at a time by their own code instead of a path (fillPixelShape()): runs gives
  // their px and tones their three colours, lightest first. puffs for steam, smoke and dust, and
  // flames licking up for fires
  wisp: { say: 'pixel wisps', pixel: { runs: wispRuns, tones: (rgb) => [1, WISP.body, WISP.shade].map((k) => rgb.map((v) => v * k)) } },
  flame: { say: 'pixel flames', pixel: { runs: flameRuns, tones: flameTones } },
  picture: { say: 'the whole picture' },
  bits: { say: 'bits of the picture' },
};

// a number for each shape, for keeping its pixel masks (pixelMask())
const PARTICLE_SHAPE_NUMBERS = Object.fromEntries(Object.keys(PARTICLE_SHAPES).map((shape, i) => [shape, i]));

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
// what they do landing in a liquid (ParticleSystem.fallIn())
const PARTICLE_IN_LIQUID = {
  sinks: 'sink out of sight',
  dissolves: 'spread through it',
  floats: 'float on it',
};

// how they fade in and out (fadeIn, fadeTime, drawOne())
const PARTICLE_FADES = {
  clear: 'going see-through',
  shrinks: 'shrinking away',
  crumbles: 'breaking up',
};

// what they do landing in a hot liquid (ParticleSystem.fallIn())
const PARTICLE_IN_HOT = {
  same: 'the same as in liquids',
  sizzles: 'sizzle away',
  burns: 'burn up',
};

// how floating ones move (ParticleSystem.floatOn()). the effect's own settings (floatBob and the rest)
// say how much; these are the same for all
const PARTICLE_FLOAT = {
  // how quickly the water slows them to their drift (an approach() speed), and how much of their
  // speed is kept bouncing off the shore
  drag: 1.5,
  shoreBounce: 0.3,
  // how quickly a wader shoves them at full push, and how far round a wader's ring they're shoved
  // (times its width), squashed up and down the screen like the ring (LIQUID.ringSquash, config.js)
  shove: 6,
  reach: 1.3,
  squash: 0.5,
  // a shove sets them bobbing this many times higher, dying down by this much a second
  jostle: 3,
  settle: 1.5,
  // radians a second a 4 px one bobs; bigger ones bob slower (square root, like a pendulum)
  bobSpeed: 2.6,
  // the last seconds of soaking (floatSoak) they darken over, before going under
  soaking: 1,
  // burning up (inHot), its Going in hot bursts a second, and what it chars to after glowing the hot
  // liquid's surfaceColour
  burnRate: 5,
  char: [40, 32, 30],
};

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

  // landing on the floor where it's a liquid (a tile with sink, tiles.js), or sliding onto one, it goes
  // in rather than lying on top like it's solid, by its effect's inLiquid, or inHot in a hot liquid:
  // a ring where it went in (Surface.splash(), surface.js), then gone (sinking, spreading through it
  // or sizzling away), or floating on it, or burning up on it. the liquid's landParticles and the
  // effect's liquidThen (hotThen in a hot one) burst there, through chain like update()'s. true if
  // it's gone. not ones that are meant to be on liquids (onLiquid, like ripples)
  fallIn(p, map, chain = []) {
    const e = p.effect;
    if (!map || e.onLiquid) return false;
    const liquid = map.get(map.colAt(p.x), map.rowAt(p.y));
    if (!liquid?.liquid) return false;
    const hot = liquid.hot && e.inHot !== 'same';
    const way = hot ? e.inHot : e.inLiquid;
    for (const name of liquid.landParticles ?? []) chain.push([name, p]);
    const then = hot ? e.hotThen : e.liquidThen;
    if (then) chain.push([then, p]);
    Surface.splash(p, liquid, way);
    if (way !== 'floats' && way !== 'burns') {
      p.age = p.life;
      return true;
    }
    // burning, it glows the liquid's surface colour, then chars (drawOne())
    if (way === 'burns') {
      p.burning = 0;
      p.hotRgb = hexToRgb(liquid.surfaceColour);
    }
    // lying flat on the surface, keeping some of how it came in. floatOn() moves it from now on
    p.floating = liquid;
    p.floatRgb = hexToRgb(liquid.colour);
    p.floatAge = 0;
    p.jostle = 0.5;
    p.z = 0;
    p.vz = 0;
    p.vx *= 0.5;
    p.vy *= 0.5;
    p.flip = 0;
    p.flipSpeed = 0;
    p.spin = 0;
    p.restAngle = p.angle;
    return false;
  }

  // a floating one (fallIn()): it wanders about (floatDrift), slowed by the liquid, bobs (floatBob)
  // and rocks (floatRock), each at its own pace, and gets shoved aside by waders (floatPush), which
  // sets it bobbing harder for a bit. it stays on the liquid, bouncing gently off the shore, and
  // soaking (floatSoak) it darkens and goes under. burning (inHot) it shrinks away over burnTime,
  // making its hotThen as it goes (into chain, like update()'s)
  floatOn(p, dt, map, waders, chain = []) {
    const e = p.effect;
    const F = PARTICLE_FLOAT;
    p.floatAge += dt;
    if (p.burning !== undefined) {
      p.burning += dt;
      p.shrink = Math.max(0, 1 - (p.burning / e.burnTime) ** 2);
      if (e.hotThen) for (let i = burstsIn(F.burnRate, dt); i > 0; i--) chain.push([e.hotThen, p]);
      if (p.burning >= e.burnTime) {
        p.age = p.life;
        return;
      }
    } else if (e.floatSoak > 0 && p.floatAge >= e.floatSoak) {
      Surface.splash(p, p.floating); // surface.js
      p.age = p.life;
      return;
    }
    // wandering: a heading that turns slowly back and forth, its own for each one
    const heading = p.phase + Math.sin(p.age * 0.3 + p.phase) * 2;
    const ease = 1 - Math.exp(-F.drag * dt);
    p.vx += (Math.cos(heading) * e.floatDrift - p.vx) * ease;
    p.vy += (Math.sin(heading) * e.floatDrift - p.vy) * ease;
    // shoved out of a wader's way: away from them and along with them, harder the closer it is.
    // one standing still just keeps them out of its ring
    for (const w of waders) {
      const dx = p.x - w.x;
      const dy = (p.y - w.y) / F.squash;
      const d = Math.hypot(dx, dy) || 1;
      const reach = w.r * F.reach;
      if (d >= reach) continue;
      const near = (1 - d / reach) * (e.floatPush / 100);
      const speed = Math.hypot(w.vx, w.vy);
      p.vx += ((dx / d) * speed + w.vx * 0.5) * near * F.shove * dt;
      p.vy += ((dy / d) * speed * F.squash + w.vy * 0.5) * near * F.shove * dt;
      p.jostle = Math.max(p.jostle, near * Math.min(1, speed / 60));
      if (e.floatPush > 0) {
        p.x += (dx / d) * (reach - d) * near * 0.2;
        p.y += (dy / d) * (reach - d) * near * 0.2 * F.squash;
      }
    }
    // moving, but only on the liquid: off the shore it bounces back
    const on = (x, y) => !map || map.get(map.colAt(x), map.rowAt(y))?.liquid;
    const x = p.x + p.vx * dt;
    if (on(x, p.y)) p.x = x;
    else p.vx *= -F.shoreBounce;
    const y = p.y + p.vy * dt;
    if (on(p.x, y)) p.y = y;
    else p.vy *= -F.shoreBounce;
    // bobbing and rocking, quicker for small ones, harder while jostled
    p.jostle *= Math.exp(-F.settle * dt);
    const pace = (F.bobSpeed * p.swaySpeed) / 2.75 / Math.sqrt(Math.max(1, p.size) / 4);
    const wave = p.floatAge * pace + p.phase;
    const bob = e.floatBob * (1 + p.jostle * F.jostle);
    p.z = Math.sin(wave) * bob - bob;
    p.angle = p.restAngle + radians(e.floatRock) * Math.sin(wave + 1.2) * (1 + p.jostle);
  }

  // how much a floating one takes on its liquid's colour now: its floatDepth, then all of it as it
  // soaks through at the end (floatSoak)
  soaked(p) {
    const e = p.effect;
    const depth = e.floatDepth / 100;
    if (!(e.floatSoak > 0)) return depth;
    const t = Math.min(1, Math.max(0, (p.floatAge - (e.floatSoak - PARTICLE_FLOAT.soaking)) / PARTICLE_FLOAT.soaking));
    return depth + (0.85 - depth) * Math.max(0, t);
  }

  // moves them all on by dt seconds. map is a TileMap whose solid tiles they bounce off (if their
  // effect's hitsWalls), or null for no walls. waders are people in liquids, which shove floating ones
  // aside: each { x, y, vx, vy, r }, their feet, speed and ring's half width (waders() in surface.js)
  update(dt, map, waders = []) {
    // [effect name, particle] for each trail and then bursting out of one this frame. they burst
    // after the loop, so new ones don't get moved before they're drawn
    const chain = [];
    for (const p of this.list) {
      const e = p.effect;
      p.age += dt;
      if (e.trail) for (let i = burstsIn(e.trailRate, dt); i > 0; i--) chain.push([e.trail, p]);
      if (p.floating) {
        this.floatOn(p, dt, map, waders, chain);
        continue;
      }
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
          if (this.fallIn(p, map, chain)) continue;
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
      // shortcut: walls are as tall as the sky, so a bit flying over a wall still bounces off it.
      // giving tiles a height would fix it
      // a fast one goes in steps of at most a tile, so it can't skip over a thin wall
      const walls = e.hitsWalls && map && !map.isSolid(map.colAt(p.x), map.rowAt(p.y));
      // sliding along the floor off the shore, it falls in (fallIn())
      const dry = onFloor && map && !map.get(map.colAt(p.x), map.rowAt(p.y))?.liquid;
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
      if (dry) this.fallIn(p, map, chain);
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
  drawFloor(view, map) {
    const batch = this.beginDrawing();
    let onLiquid = false;
    for (const p of this.list) {
      if (p.z > 0 || !this.onScreen(p, view)) continue;
      // ripples are drawn on the liquid's surface instead, a picture px at a time (surface.js)
      if (map && onSurface(p)) continue;
      if (p.effect.onLiquid && map) onLiquid = true;
      else this.drawOne(p, batch);
    }
    this.endDrawing(batch);
    if (!onLiquid) return;
    // the ones that only show over liquids (ripples) go in a second run, clipped to the liquid tiles
    // on screen, so they stop at the shore
    const ctx = drawingContext;
    ctx.save();
    map.clipToLiquid(view); // tilemap.js
    const liquid = this.beginDrawing();
    for (const p of this.list) {
      if (p.z <= 0 && p.effect.onLiquid && !onSurface(p) && this.onScreen(p, view)) this.drawOne(p, liquid);
    }
    this.endDrawing(liquid);
    ctx.restore();
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
        if (p.effect.pixel) {
          if (batch.turned) unturnParticles(batch);
          fillPixelMask(ctx, pixelMask('circle', p.drawHalf / ART_SCALE, p.drawHalf / 2 / ART_SCALE, 0), Math.round(p.x / ART_SCALE), Math.round(p.y / ART_SCALE));
          continue;
        }
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
    let size = particleSize(p);
    // twinkling at random
    const twinkle = e.twinkle ? 1 - (Math.random() * e.twinkle) / 100 : 1;
    let alpha = particleAlpha(p) * twinkle;
    if (alpha <= 0) return;
    // fading by shrinking or breaking up (fadeStyle), it stays as solid as its opacity. wisps and
    // flames have their own way of fading (fillPixelShape())
    p.drawGone = 0;
    if (e.fadeStyle !== 'clear' && !PARTICLE_SHAPES[e.shape].pixel) {
      const solid = e.opacity / 100;
      const left = Math.min(1, alpha / solid);
      if (e.fadeStyle === 'shrinks') size *= left;
      else if (e.pixel) p.drawGone = 1 - left;
      alpha = solid;
    }
    if (size < 0.5) return;
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
      const smooth = ctx.imageSmoothingEnabled;
      if (e.pixel) {
        // on the art's grid, crisp, turned in quarter turns like pixel art turns
        const turns = Math.round(p.angle / (Math.PI / 2)) * (Math.PI / 2);
        turnParticle(batch, { angle: turns }, Math.round(p.x / ART_SCALE) * ART_SCALE, Math.round((p.y - p.z) / ART_SCALE) * ART_SCALE, p.drawHalf, Math.abs(Math.cos(p.flip)) * p.drawHalf);
        ctx.imageSmoothingEnabled = false;
      } else turnParticle(batch, p);
      if (p.bit) {
        const w = img.width / p.bit.n;
        const h = img.height / p.bit.n;
        ctx.drawImage(img.canvas, p.bit.u * w, p.bit.v * h, w, h, -1, -1, 2, 2);
      } else {
        const h = img.height / img.width;
        ctx.drawImage(img.canvas, -1, -h, 2, h * 2);
      }
      ctx.imageSmoothingEnabled = smooth;
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
    // burning, it glows the hot liquid's surface colour, then chars
    if (p.burning !== undefined) {
      const t = Math.min(1, p.burning / e.burnTime);
      const [to, k] = t < 0.5 ? [p.hotRgb, t * 2] : [PARTICLE_FLOAT.char, (t - 0.5) * 2];
      const from = t < 0.5 ? [r, g, b] : p.hotRgb;
      r = from[0] + (to[0] - from[0]) * k;
      g = from[1] + (to[1] - from[1]) * k;
      b = from[2] + (to[2] - from[2]) * k;
    } else if (p.floating) {
      // floating, the part under shows the liquid's colour (ParticleSystem.soaked())
      const k = this.soaked(p);
      r += (p.floatRgb[0] - r) * k;
      g += (p.floatRgb[1] - g) * k;
      b += (p.floatRgb[2] - b) * k;
    }
    p.drawRgb = [r, g, b];
    const key = (e.glow ? PARTICLE_GLOWS : 0) | ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let bucket = this.buckets.get(key);
    if (!bucket) this.buckets.set(key, bucket = []);
    bucket.push(p);
  }
}

// how big a particle is now, growing or shrinking towards endSize, and burning away (shrink, floatOn())
function particleSize(p) {
  return p.size * (1 + (p.effect.endSize / 100 - 1) * (p.age / p.life)) * (p.shrink ?? 1);
}

// how see-through it is now: its opacity, fading in over the first fadeIn seconds and out over the
// last fadeTime (x / 0 is Infinity, so 0 never fades out)
function particleAlpha(p) {
  const e = p.effect;
  const fadeIn = e.fadeIn ? p.age / e.fadeIn : 1;
  return (e.opacity / 100) * Math.min(1, fadeIn, (p.life - p.age) / e.fadeTime);
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
  if (PARTICLE_SHAPES[e.shape].pixel) {
    fillPixelShape(batch, p);
    return;
  }
  if (e.pixel) {
    fillPixels(batch, p);
    return;
  }
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
  const own = PARTICLE_SHAPES[shape].pixel;
  if (own) {
    // its own px, at a sixth of its size a px
    const px = 1 / 3;
    const tones = own.tones(rgb.map((v) => (v === 255 ? 200 : v))).map((c) => `rgb(${c.map(Math.round).join(', ')})`);
    own.runs(2, 2.3, 0, 7, 0, (dx, dy, length, tone) => {
      ctx.fillStyle = tones[tone];
      ctx.fillRect((dx - 0.5) * px, (dy - 0.5) * px, length * px, px);
    });
  } else ctx.fill(PARTICLE_SHAPES[shape].path ?? PARTICLE_SHAPES.square.path, 'evenodd');
  ctx.restore();
}

// a shape's little picture in the particle editor's Shape picker (size px square at x, y)
function drawShapeChoice(shape, x, y, size) {
  if (PARTICLE_SHAPES[shape].path || PARTICLE_SHAPES[shape].pixel) fillParticleShape(shape, x + size / 2, y + size / 2, size * 0.7, [255, 255, 255]);
}

// ---------- pixel shapes ----------
// every shape drawn on the art's grid a picture px at a time (an effect's pixel), like the rest of the
// art: its outline filled in at the size and angle it is now, and kept (pixelMask()), so each size and
// angle is only worked out once. streaks are drawn as a pixel line, so a thin one never breaks up. with
// shade, the px towards the bottom right of a big enough one are darker, lit from the top left like
// the art, and breaking up (fadeStyle) each px goes at its own point in the fade

// the most masks kept before they're all let go, and how many angles a turn is cut into
const PIXEL_MASKS = { most: 6000, turns: 32 };
const pixelMasks = new Map();
let pixelCanvas = null;

// a shape's px at rx by ry picture px round 0, 0, turned by angle: { runs: [dx, dy, length, ...],
// dark: [the same for the shaded px] , all: [dx, dy, dark (0 or 1), ...] each px }. sizes go in halves
// of a px and angles in PIXEL_MASKS.turns, so they can be kept
function pixelMask(shape, rx, ry, angle) {
  const qx = Math.min(255, Math.max(1, Math.round(rx * 2)));
  const qy = Math.min(255, Math.max(1, Math.round(ry * 2)));
  const turns = PIXEL_MASKS.turns;
  const qa = shape === 'circle' ? 0 : ((Math.round((angle / (Math.PI * 2)) * turns) % turns) + turns) % turns;
  const key = ((PARTICLE_SHAPE_NUMBERS[shape] * 256 + qx) * 256 + qy) * turns + qa;
  let mask = pixelMasks.get(key);
  if (mask) return mask;
  if (pixelMasks.size > PIXEL_MASKS.most) pixelMasks.clear();
  mask = makePixelMask(shape, qx / 2, qy / 2, (qa / turns) * Math.PI * 2);
  pixelMasks.set(key, mask);
  return mask;
}

// little stars, hearts and rings (bubbles) drawn by hand, since filling in the outline at 5 px or less
// just makes a blob. used from `from` px across up to 5. a star keeps its five points. # is a px,
// centred on the middle of the picture
const PIXEL_GLYPHS = {
  star: { from: 3.5, rows: ['..#..', '#####', '.###.', '.#.#.'] },
  heart: { from: 3.5, rows: ['##.##', '#####', '.###.', '..#..'] },
  ring: { from: 1.5, rows: ['.##.', '#..#', '#..#', '.##.'] },
};

// works out a pixelMask(). its px are the ones the shape covers at least half of, drawn on a little
// canvas, or for a streak a line from end to end, or a glyph for a small star or heart. never
// nothing: at the least it's one px
function makePixelMask(shape, rx, ry, angle) {
  const on = [];
  const long = Math.max(rx, ry) * 2;
  const short = Math.min(rx, ry) * 2;
  const glyph = PIXEL_GLYPHS[shape] && long <= 5.5 && long >= PIXEL_GLYPHS[shape].from ? PIXEL_GLYPHS[shape].rows : null;
  // 3 px or less, a shape can't show, and filled in it can come out a little plus like a sparkle. so
  // a long thin one (confetti, a leaf on its edge) is a stick turned its way, and the rest a block
  const tiny = long <= 3.5 && !glyph && shape !== 'streak';
  if (glyph) {
    glyph.forEach((row, y) => [...row].forEach((c, x) => c === '#' && on.push([x - 2, y - 2])));
  } else if (tiny && long / short < 1.5) {
    const n = shape === 'square' ? Math.max(1, Math.round(long)) : Math.min(2, Math.max(1, Math.round(long)));
    const from = -Math.floor(n / 2);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) on.push([from + x, from + y]);
  } else if (shape === 'streak' || tiny) {
    // a line along the angle, as thick as the streak is (0.6 of its height), at least a px. a tiny
    // stick is a px thick along its long side
    const along = tiny ? angle + (ry > rx ? Math.PI / 2 : 0) : angle;
    const half = tiny ? (Math.round(long) - 1) / 2 : rx;
    const thick = tiny ? 1 : Math.max(1, Math.round(ry * 0.6));
    const ex = Math.cos(along) * half;
    const ey = Math.sin(along) * half;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(ex), Math.abs(ey)) * 2));
    const seen = new Set();
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(-ex + (2 * ex * i) / steps);
      const y = Math.round(-ey + (2 * ey * i) / steps);
      for (let k = 0; k < thick; k++) {
        const across = k - Math.floor((thick - 1) / 2);
        const px = Math.abs(ex) > Math.abs(ey) ? x : x + across;
        const py = Math.abs(ex) > Math.abs(ey) ? y + across : y;
        if (!seen.has(px * 4096 + py)) {
          seen.add(px * 4096 + py);
          on.push([px, py]);
        }
      }
    }
  } else {
    const reach = Math.ceil(Math.max(rx, ry) * 1.5) + 2;
    const size = reach * 2;
    pixelCanvas ??= document.createElement('canvas');
    if (pixelCanvas.width < size) pixelCanvas.width = pixelCanvas.height = size;
    const ctx = pixelCanvas.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    // an odd number of px across is centred on a px, an even number on the line between two
    ctx.translate(reach + (Math.round(rx * 2) % 2 ? 0.5 : 0), reach + (Math.round(ry * 2) % 2 ? 0.5 : 0));
    ctx.rotate(angle);
    ctx.scale(rx, ry);
    ctx.fillStyle = '#fff';
    ctx.fill(PARTICLE_SHAPES[shape].path ?? PARTICLE_SHAPES.square.path, 'evenodd');
    const data = ctx.getImageData(0, 0, size, size).data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) if (data[(y * size + x) * 4 + 3] >= 128) on.push([x - reach, y - reach]);
    }
  }
  if (!on.length) on.push([0, 0]);
  // lit from the top left: px past the middle towards the bottom right are shaded, on ones 3 px or
  // more across
  const big = Math.max(rx, ry) >= 1.5;
  const r = Math.max(rx, ry);
  const all = [];
  for (const [x, y] of on) all.push(x, y, big && (y + 0.5) / r + ((x + 0.5) / r) * 0.4 > 0.3 ? 1 : 0);
  // in runs along each row, light and dark apart
  const runs = [];
  const dark = [];
  const sorted = on.map((p, i) => [p[0], p[1], all[i * 3 + 2]]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  let run = null;
  for (const [x, y, d] of sorted) {
    if (run && run.y === y && run.d === d && run.x + run.n === x) {
      run.n++;
      continue;
    }
    if (run) (run.d ? dark : runs).push(run.x, run.y, run.n);
    run = { x, y, d, n: 1 };
  }
  (run.d ? dark : runs).push(run.x, run.y, run.n);
  return { runs, dark, all };
}

// draws a pixelMask() at picture px cx, cy in the canvas's colour (world positions), all of it light
function fillPixelMask(ctx, mask, cx, cy) {
  for (const list of [mask.runs, mask.dark]) {
    for (let i = 0; i < list.length; i += 3) ctx.fillRect((cx + list[i]) * ART_SCALE, (cy + list[i + 1]) * ART_SCALE, list[i + 2] * ART_SCALE, ART_SCALE);
  }
}

// a particle on the art's grid (fillParticle()): its shape at its size, stretch, tumble and angle now,
// in its bucket's colour, its shaded px darker (shade), and breaking up px by px (drawGone, drawOne())
function fillPixels(batch, p) {
  const e = p.effect;
  const { ctx } = batch;
  if (batch.turned) unturnParticles(batch);
  const shape = PARTICLE_SHAPES[e.shape].path ? e.shape : 'square';
  const rx = Math.max(0.5, ((e.stretch / 100) * p.drawHalf) / ART_SCALE);
  const ry = Math.max(0.5, (Math.abs(Math.cos(p.flip)) * p.drawHalf) / ART_SCALE);
  const mask = pixelMask(shape, rx, ry, p.angle);
  const cx = Math.round(p.x / ART_SCALE);
  const cy = Math.round((p.y - p.z) / ART_SCALE);
  const light = ctx.fillStyle;
  const shaded = e.shade > 0 && mask.dark.length;
  const shade = shaded ? `rgb(${p.drawRgb.map((v) => Math.round(v * (1 - e.shade / 100))).join(', ')})` : light;
  if (p.drawGone > 0) {
    // each px goes at its own point in the fade, fixed for this particle
    const seed = Math.floor(p.phase * 1000);
    const all = mask.all;
    for (let i = 0; i < all.length; i += 3) {
      if (surfaceHash(all[i], all[i + 1], seed) < p.drawGone) continue; // surface.js
      ctx.fillStyle = all[i + 2] ? shade : light;
      ctx.fillRect((cx + all[i]) * ART_SCALE, (cy + all[i + 1]) * ART_SCALE, ART_SCALE, ART_SCALE);
    }
  } else {
    const runs = mask.runs;
    for (let i = 0; i < runs.length; i += 3) ctx.fillRect((cx + runs[i]) * ART_SCALE, (cy + runs[i + 1]) * ART_SCALE, runs[i + 2] * ART_SCALE, ART_SCALE);
    if (mask.dark.length) {
      ctx.fillStyle = shade;
      const dark = mask.dark;
      for (let i = 0; i < dark.length; i += 3) ctx.fillRect((cx + dark[i]) * ART_SCALE, (cy + dark[i + 1]) * ART_SCALE, dark[i + 2] * ART_SCALE, ART_SCALE);
    }
  }
  ctx.fillStyle = light;
}

// ---------- pixel wisps ----------
// the wisp shape (PARTICLE_SHAPES): steam and smoke the way the art would draw it, a picture px at a
// time on the art's grid. each puff is a lumpy cloud of a few round lobes (its own, from its seed),
// each lit from the top (a cap in the particle's colour over a body a touch darker, and a shade under
// it), so it bulges like a pixel art cloud. the lobes churn slowly round it as it goes. it fades the way steam thins out:
// the lobes drift apart and shrink away, each at its own pace, until the last is gone, rather than
// going see-through. its opacity is how see-through every px is

const WISP = {
  // how much darker each lobe's body and shade are than its cap, and where (down each lobe, -1 to 1,
  // leaning to the top left) the body and the shade start
  body: 0.93,
  shade: 0.82,
  cap: -0.35,
  light: 0.3,
  // the lobes round the middle one, at least and at most, how big they are next to it, how far out
  // (times the puff's size) and how wide a fan above it they sit in (radians), since it's rising
  lobes: [2, 4],
  size: [0.55, 0.85],
  out: [0.35, 0.6],
  fan: 2.4,
  // radians a second the lobes churn round, and how far apart they drift as it fades (times out)
  churn: 0.5,
  drift: 0.8,
  // how much sooner than the middle each lobe can shrink away, at most (0 to 1)
  stagger: 0.6,
};

// the px of a wisp, about rx by ry picture px round 0, 0, in rows of runs: draw(dx, dy, length,
// tone) for each run, tone 0 for the cap, 1 the body and 2 the shade. gone (0 to 1) is how far it's faded, seed which wisp it is, and time (seconds)
// how far its lobes have churned
function wispRuns(rx, ry, gone, seed, time, draw) {
  const pick = (k, [low, high]) => low + (high - low) * surfaceHash(seed, k, 21); // surface.js
  // one too small for its middle lobe to be round has no room for more, and they could line up into a
  // little plus
  const count = Math.min(rx, ry) * 0.75 < 1.5 ? 0 : Math.round(pick(1, WISP.lobes));
  // the middle one, then the rest round it. each { x, y, r } as parts of rx, ry, shrinking away as it
  // fades from its own start (the middle last)
  const lobes = [{ x: 0, y: 0, size: 0.75, start: 1 }];
  for (let k = 0; k < count; k++) {
    const turn = (k % 2 ? 1 : -1) * time * WISP.churn;
    const angle = -Math.PI / 2 + (surfaceHash(seed, k, 22) - 0.5) * WISP.fan + turn;
    const out = pick(10 + k, WISP.out) * (1 + gone * WISP.drift);
    lobes.push({ x: Math.cos(angle) * out, y: Math.sin(angle) * out, size: pick(20 + k, WISP.size) * 0.7, start: 1 - WISP.stagger * surfaceHash(seed, k, 23) });
  }
  // how big each is now: whole, then shrinking to nothing between gone = 0 and its start
  for (const lobe of lobes) lobe.r = lobe.size * Math.max(0, 1 - gone / lobe.start) ** 0.6;
  const w = Math.ceil(rx * 1.6);
  const h = Math.ceil(ry * 1.6);
  for (let dy = -h; dy <= h; dy++) {
    let start = null;
    let shaded = 0;
    for (let dx = -w; dx <= w + 1; dx++) {
      let on = false;
      let dark = 0;
      if (dx <= w) {
        // the lobe it's furthest inside, if any
        let best = 1;
        for (const lobe of lobes) {
          if (lobe.r <= 0) continue;
          // under 3 px across it's a 2 px square, then one px, or it'd be a little plus like a sparkle
          const across = lobe.r * Math.min(rx, ry);
          if (across < 1.5) {
            const block = across >= 1 ? 2 : 1;
            const bx = Math.round(lobe.x * rx - (block - 1) / 2);
            const by = Math.round(lobe.y * ry - (block - 1) / 2);
            if (!on && dx >= bx && dx < bx + block && dy >= by && dy < by + block) {
              on = true;
              dark = dy > by ? 2 : 1;
            }
            continue;
          }
          const lx = (dx - lobe.x * rx) / (lobe.r * rx);
          const ly = (dy - lobe.y * ry) / (lobe.r * ry);
          const d = lx * lx + ly * ly;
          if (d <= best) {
            best = d;
            on = true;
            const down = ly + lx * 0.4;
            dark = down > WISP.light ? 2 : down > WISP.cap ? 1 : 0;
          }
        }
      }
      if (start !== null && (!on || dark !== shaded)) {
        draw(start, dy, dx - start, shaded);
        start = null;
      }
      if (on && start === null) {
        start = dx;
        shaded = dark;
      }
    }
  }
}

// ---------- pixel flames ----------
// the flame shape (PARTICLE_SHAPES): a teardrop of fire, round at the bottom and licking up to a tip
// that flickers side to side, its own pace for each one. a pale hot core, the particle's colour round
// it, and a deeper, redder edge. fading, it burns down: shorter and narrower until it's gone

const FLAME = {
  // how tall it is next to how wide (times its height), and how far the tip licks side to side (times
  // its width) and how quickly
  tall: 2.2,
  lick: 0.5,
  lickSpeed: 9,
  // where the core and the colour give way, out from the middle (0 to 1), and how far the core's
  // colour goes towards the white heat of a fire's middle
  core: 0.4,
  body: 0.75,
  pale: 0.6,
  heat: [255, 244, 196],
};

// a flame's three colours from its own: the pale core, it, and the redder edge
function flameTones(rgb) {
  return [rgb.map((v, i) => v + (FLAME.heat[i] - v) * FLAME.pale), rgb, [rgb[0] * 0.85, rgb[1] * 0.45, rgb[2] * 0.35]];
}

// the px of a flame about rx wide round 0, 0 (ry is its bottom's height), in rows of runs like
// wispRuns(): tone 0 the core, 1 the body, 2 the edge
function flameRuns(rx, ry, gone, seed, time, draw) {
  const left = 1 - gone;
  const w = rx * left;
  const bottom = ry * left;
  const top = ry * FLAME.tall * left;
  if (w < 0.75 || top < 1) {
    if (left > 0.15) draw(0, 0, 1, 0);
    return;
  }
  // too small to be round, it's a little stack: core over colour
  if (w < 1.5) {
    draw(0, -1, 1, 0);
    draw(0, 0, 1, 1);
    return;
  }
  const flicker = time * FLAME.lickSpeed + seed;
  for (let dy = -Math.ceil(top); dy <= Math.ceil(bottom); dy++) {
    // half its width on this row, and how far it's licked over: none at the bottom, most at the tip
    const up = dy < 0 ? -dy / top : 0;
    const half = dy >= 0 ? w * Math.sqrt(Math.max(0, 1 - (dy / bottom) ** 2)) : w * Math.max(0, 1 - up) ** 0.8;
    if (half < 0.5) continue;
    const off = Math.sin(flicker + dy * 0.6) * w * FLAME.lick * up;
    let start = null;
    let shaded = 0;
    const from = Math.floor(off - half);
    const to = Math.ceil(off + half);
    for (let dx = from; dx <= to + 1; dx++) {
      const across = Math.abs(dx + 0.5 - off) / half;
      const on = dx <= to && across <= 1;
      // the core's lower down, and the tip's all edge
      const d = Math.max(across, up * 1.1);
      const tone = d < FLAME.core ? 0 : d < FLAME.body ? 1 : 2;
      if (start !== null && (!on || tone !== shaded)) {
        draw(start, dy, dx - start, shaded);
        start = null;
      }
      if (on && start === null) {
        start = dx;
        shaded = tone;
      }
    }
  }
}

// a particle with a shape that draws itself (PARTICLE_SHAPES' pixel, fillParticle()), in the colour it's
// in now (drawRgb, drawOne()), on the art's grid. it fades its own way, as solid as its opacity
function fillPixelShape(batch, p) {
  const e = p.effect;
  const own = PARTICLE_SHAPES[e.shape].pixel;
  const { ctx } = batch;
  if (batch.turned) unturnParticles(batch);
  const solid = e.opacity / 100;
  const gone = 1 - Math.min(1, p.drawAlpha / solid);
  const rx = Math.max(1, ((e.stretch / 100) * p.drawHalf) / ART_SCALE); // config.js
  const ry = Math.max(1, (p.drawHalf / ART_SCALE) * 1.1);
  const cx = Math.round(p.x / ART_SCALE);
  const cy = Math.round((p.y - p.z) / ART_SCALE);
  const light = ctx.fillStyle;
  const tones = own.tones(p.drawRgb).map((c) => `rgb(${c.map((v) => Math.round(Math.min(255, v))).join(', ')})`);
  ctx.globalAlpha = batch.alpha * solid;
  own.runs(rx, ry, gone, Math.floor(p.phase * 1000), p.age, (dx, dy, length, tone) => {
    ctx.fillStyle = tones[tone];
    ctx.fillRect((cx + dx) * ART_SCALE, (cy + dy) * ART_SCALE, length * ART_SCALE, ART_SCALE);
  });
  ctx.fillStyle = light;
}

// every effect loads once at the start (datafiles.js). blood (when a character's hit) and blood-burst
// (when an enemy dies) are used, and sparks, smoke and dust are there to try and copy
DataFiles.register('particle', {
  define: defineParticles,
  names: () => Object.keys(PARTICLE_EFFECTS),
  toData: (name) => typeToData(PARTICLE_EFFECTS[name], PARTICLE_DEFAULTS), // utils.js
});
