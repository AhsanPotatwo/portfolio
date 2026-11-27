// lighting: light and shadow over the world, kept in pixel art. lamps, campfires, neon, torches and
// flashlights in any colour, the sun and moon going round, shadows off walls, buildings, trees and
// characters, glows round lights, and glowing paint (neon tubes, lit windows) that stays bright in the
// dark.
//
// it's an experiment. a map only gets it if its atmosphere ticks Light > Lighting (atmosphere.js), and
// it can be switched off for every map in the pause menu (Screen > Lighting) or with J in dev mode
// (Shift + J shows just the light, to see what it's doing). off, it costs nothing and the game draws
// exactly as it did. it only ever changes how things look: nothing in the game reads it, and if it ever
// throws an error it turns itself off and says so in the console rather than stop the game.
// the test maps are light-city (night, neon, a red, green and blue corner), light-village (the day goes
// round in 3 minutes) and light-cave (no sky at all), joined by warps. their stand-in art is in
// objects/lighting-test/.
//
// ---------- the idea ----------
// the game draws everything as normal. then this works out how much light reaches each spot on screen
// as a picture, the light map, and multiplies the world by it, so black is dark and white leaves it as
// drawn. coloured light tints, and lights add up like real light does: red and blue make purple, red,
// green and blue make white. the light map is in light pixels (LIGHTING.cell, 2 world px, one art pixel
// of the 16 px tiles) lined up with the map's own pixel grid, then scaled up without blending, so every
// edge lands on the art's pixels: no half pixels, no mixels.
//
// light fades smoothly, and lights that overlap add up past full brightness (LIGHTING.headroom) and
// then roll off towards white (lightTone()), so two lamps side by side make one bigger glow instead of
// a flat white patch with a hard edge.
//
// the game's seen from an angle, so up the screen is both further away and higher up. light and
// shadow work on the ground, in world px, and height is separate: a lamp hangs `height` px above its
// spot, a character's shadow is its picture slanted along the ground away from the light, feet on its
// feet, and a building's shadow is its footprint pushed out by its height.
//
// each frame (Lighting.draw(), called by sketch.js after the things on the map, before the atmosphere):
//   1. the light map starts as the sky's light (ambient), plus glowing tiles (lava), and the lights
//      that don't cast shadows (particles, items on the ground, the faint light round the player)
//   2. every standing thing (characters, standing objects) is drawn again, small, into a sheet of
//      silhouettes (the atlas), by its own drawing code, so its shadow and light follow its real shape
//      whatever it looks like now
//   3. the sun or moon: sunlight everywhere, minus the shadows of walls and buildings (their footprint
//      pushed away from the sun by their height, blocking all of it) and of everything standing (its
//      silhouette slanted along the ground, blocking Shadows % of it)
//   4. each light that casts shadows or is a beam, on its own small canvas: its glow, cut to its beam
//      with soft sides, minus the same shadows from where it is (their edges softened a light pixel),
//      then added on
//   5. the tops of walls only get the sky, so the inside of rock never glows
//   6. the things, front to back like sketch.js draws them: each one gets the light that reached its
//      feet (sampled in steps 1 to 4 before its own shadow was laid down), averaged so a thin shadow
//      under it doesn't stripe it, a bit brighter on the side nearer the light, kept just inside its
//      outline so it never lights the ground round it. so a character in a shadow is in shadow head to
//      toe. lights behind something light it less from the front and give it a bright edge instead
//      (rim light). a building's front gets the light along its base, and its roof gets the sky
//   7. the light map rolls off towards white (above) and multiplies the world
// then Lighting.drawGlow() (sketch.js, after the atmosphere so it shows through fog) puts the glowing
// paint over the top in its lit colours (an object's glowImage is the same picture as its image with
// only the glowing pixels, drawn lit: the windows yellow, the neon tubes bright), as bright as its light
// is now, so a night light's windows are dark by day and a neon sign's tubes stutter with its light.
// then the glow: halos round lights, and a light pixel of bloom round glowing paint.
//
// ---------- where light comes from ----------
// lights are kinds, like particle effects: a file each in assets/squimble-quest/lights/ with the
// settings in LIGHT_DEFAULTS. the map editor's Map > Lights box changes them (colour, reach, beam,
// flicker...) while the map shows it, and saves new ones. anything that gives off light names one:
//   objects   "light": "street-lamp" on its file (objects/), from the middle of its base. or a list,
//             each with its own spot: [{ "light": "window", "x": -20, "y": 0, "height": 50 }], x and y
//             in world px from the middle of its base, height overriding the light's own. "aim" too
//   on its own  every light kind can be placed by itself from the editor's Lights tab, as a light-<name>
//             object (made here, lightMarkers()) that's only seen in the editor
//   tiles     "light": "lava-glow". every tile of that kind glows (soft, no shadows, one pass for all)
//   items     "light": "torch" lights whoever holds it, or wears it. a beam (a flashlight) points
//             where they aim
//   particles every particle effect that glows (its Glow setting) lights up round itself
//   drops     items on the ground glow faintly in their rarity's colour, so they're findable in the dark
//   the player  a faint light round them (Light > Your light) so you never lose yourself in the dark
//
// ---------- what casts shadows ----------
// the game can't tell from a picture how tall a thing is or which pixels are its roof, so the files
// say, with "shadow" and "shadowHeight":
//   tiles     shadowHeight: px tall. null (normal) is LIGHTING.wallHeight for solid tiles that block
//             sight (walls), and none for the rest. 0 for a solid tile that's low, like a fence
//   objects   shadow: "sprite" (normal for standing objects) slants its picture along the ground as its
//             shadow, for trees, lamp posts, signs and anything that isn't a box. "box" makes its tiles
//             a solid block shadowHeight px tall (normal: its picture's height above its tiles), for
//             houses, shacks and skyscrapers: its shadow is that block's, from whichever way the light
//             comes. a list of boxes, each { "x", "y", "w", "h", "height" } in tiles from its top left
//             tile, for buildings that aren't one block (an L shaped house, a tower on a shop). "none"
//             for nothing (rugs, puddles). lying down objects are "none" normally
//   characters  always "sprite", from their silhouette
// a building's picture is front wall at the bottom (shadowHeight px of it) and roof above, which is how
// it knows to light the front by what reaches its base and the roof by the sky.
//
// ---------- adding things ----------
//   a light kind      Map > Lights in the editor, or a file in lights/ and its name in lights/index.json
//   a light setting   a line in LIGHT_DEFAULTS and LIGHT_SETTINGS (its row in the Lights box)
//   a flicker         a function in LIGHT_FLICKERS, given seconds and a random 0 to 1 per light
//   a light source    a function in LIGHT_SOURCES, giving back lights (see lightFrom())
//   a map setting     Light tab settings are lines in ATMOSPHERE_SETTINGS (atmosphere.js), read here
//
// ---------- taking it out ----------
// delete this file and its <script> tag (squimble-quest.html) and line atop sketch.js, the three
// Lighting lines in sketch.js, `lighting` in GAME_SETTINGS (config.js) and SETTING_ROWS (pausemenu.js),
// the lighting lines in debug.js, `lights` in EDITOR_COMMANDS and EDITOR_MENUS (editormenu.js), the
// Light tab lines in ATMOSPHERE_SETTINGS (atmosphere.js), `light:` in DATA_KINDS (datafiles.js), and
// lights/. the light and shadow settings in TILE_DEFAULTS, OBJECT_DEFAULTS, ITEM_DEFAULTS, glowImage in
// PICTURE_SETTINGS and the lightMarker line in TileMap.drawObject() can stay (they do nothing) or go
// with the "light", "shadow", "shadowHeight" and "glowImage" lines in the data files. maps with
// light-<name> objects in them would warn about them, so take those out in the editor first.
//
// ---------- ideas for later ----------
//   - lightAt(x, y) for gameplay (monsters that hate light, stealth in shadows). it'd be worked out in
//     plain javascript from the same lights and boxes, never read back from the light map
//   - areas with their own light (a dark cave mouth on a sunny map), lights you switch with E, lights
//     on enemies and npcs (a lantern carrier, glowing eyes: a "light" on their kind, like items)
//   - light through windows (a shaped patch on the floor), reflections of lights in water
//
// shortcut: other characters' shadows from lamps don't darken you, only the sun's do (trees' shade),
// since each thing's light is sampled before lamp shadows are laid down so it never darkens itself.
// shortcut: lights that don't cast shadows (glowing particles, items, the light round you, glowing
// tiles) aren't stopped by walls, they're small enough that it doesn't show. wall tops only get the
// sky, never a lamp, and a roof only gets the sky too

const LIGHTING = {
  // world px in a light pixel, one art pixel of the 16 px tiles. 1 would match the 32 px art
  cell: 2,
  // the most light pixels the light map has. zoomed out further than that, light pixels get bigger
  maxCells: 320000,
  // how much brighter than full lights can add up to before they're rolled off to white (lightTone()).
  // 1 is no room: overlapping lights go flat white
  headroom: 2,
  // up to here (0 to 1) light is as it is, and above it brighter light rolls off slowly towards white
  knee: 0.6,
  // how tall walls are, px, for tiles with no shadowHeight of their own (above)
  wallHeight: 32,
  // light pixels lamp and sun shadows' edges are softened over
  softness: 1,
  // how soft a beam's sides are, as a part of its width
  beamSoftness: 0.35,
  // the thinnest a character's or tree's shadow gets, as a part of its length, when the light's off to
  // its side (a picture seen edge on would have no shadow at all, and canvas can't draw one that flat)
  thinnest: 0.3,
  // how much of a light behind something still lights its front, 0 to 1 (step 6 above)
  behind: 0.35,
  // light pixels towards the sun its light is sampled from, so a character's own shadow (which starts
  // at its feet) doesn't put it in shade
  nudge: 2,
  // the most lights with shadows at once, and beams without (windows, neon), the closest to the middle
  // of the screen, each on its own canvas. the rest light up without shadows, and beams with hard sides
  maxShadowed: 16,
  maxBeams: 24,
  // the most glowing particles that light up round themselves, the closest to the middle
  maxParticleLights: 40,
  // the box a character's silhouette is drawn into, at least, px. bigger art makes it bigger
  characterBox: { w: 96, h: 128 },
  // how dark anywhere gets at the darkest, [r, g, b] 0 to 1, so nothing's ever pure black
  floor: [0.04, 0.04, 0.06],
  // the sun and moon's highest, degrees above the horizon, and the lowest they light from (shadows
  // stop getting longer below it)
  sunHighest: 62,
  moonHighest: 48,
  lowest: 10,
  // the longest a shadow gets, px
  longestShadow: 360,
  // items on the ground, and glowing particles (their radius is their size times this)
  drop: { radius: 44, strength: 0.55, height: 6 },
  particleRadius: 7,
  // the faint light round the player, its colour and brightness (its size is Light > Your light)
  you: { colour: [1, 0.95, 0.86], strength: 0.4, height: 30 },
};

// what a light kind's file can say (assets/squimble-quest/lights/). LIGHT_SETTINGS (bottom of the file)
// is each one's row in the Lights box
const LIGHT_DEFAULTS = {
  colour: '#ffd7a0',
  // px it reaches along the ground
  radius: 160,
  // how bright in the middle. above 1 makes the bright middle bigger and whiter
  strength: 1,
  // px above the ground it hangs (a campfire's flames are low, a street lamp's high up). shadows get
  // shorter under a high light, and its halo is drawn up there
  height: 24,
  // degrees wide, 360 all round. less is a beam (flashlights, headlights), pointing at aim
  cone: 360,
  // degrees it points, for beams on objects: 0 right, 90 down, 180 left, 270 up. held ones point where
  // their holder aims
  aim: 90,
  // degrees a second it turns, for a lighthouse or a police light
  spin: 0,
  // px it's spread sideways, for long lights like a neon tube or a row of windows. 0 is a point
  width: 0,
  shadows: true,
  // only on when it's dark (street lamps, windows, neon), fading in at dusk and out at dawn
  night: false,
  // a LIGHT_FLICKERS name, how much it dims at most (0 to 1), and how fast (1 is normal)
  flicker: 'none',
  flickerAmount: 0.2,
  flickerSpeed: 1,
  // the halo round it (drawGlow()): how bright, 0 to 1 or more, and how big, px
  glow: 0.35,
  glowSize: 12,
};

// how a light's brightness wavers, from 0 (out) to 1 (full), given seconds, a random 0 to 1 for this
// light (so no two flicker together), and how much (flickerAmount). each one copies a real reason, not
// a wave: flames are restless noise, neon tubes stutter now and then, a failing lamp drops out
const LIGHT_FLICKERS = {
  none: () => 1,
  fire: (t, seed, amount) => 1 - amount * (0.6 * lightNoise(t * 7, seed) + 0.4 * lightNoise(t * 19, seed + 3)),
  candle: (t, seed, amount) => 1 - amount * (0.75 * lightNoise(t * 3, seed) + 0.25 * lightNoise(t * 13, seed + 5)),
  // most of the time steady. about once every few seconds a quick stutter of dropouts
  neon: (t, seed, amount) => {
    const window = Math.floor(t / 2.6);
    if (lightHash(window, seed) > 0.4) return 1;
    const start = window * 2.6 + lightHash(window, seed + 1) * 1.8;
    if (t < start || t > start + 0.4) return 1;
    return lightHash(Math.floor((t - start) / 0.05), seed + 2) < 0.55 ? 1 - amount : 1;
  },
  // goes out for a while now and then, crackling as it goes and comes back
  failing: (t, seed, amount) => {
    const window = Math.floor(t / 3.4);
    if (lightHash(window, seed) > 0.45) return 1;
    const start = window * 3.4 + lightHash(window, seed + 1) * 1.4;
    const length = 0.3 + lightHash(window, seed + 2) * 1.6;
    if (t < start || t > start + length) return 1;
    const edge = Math.min(t - start, start + length - t) < 0.12;
    return edge && lightHash(Math.floor(t / 0.03), seed + 3) < 0.5 ? 1 : 1 - amount;
  },
};

// a random 0 to 1 for whole number i, the same every time
function lightHash(i, seed) {
  const s = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// smooth random 0 to 1 along t
function lightNoise(t, seed) {
  const i = Math.floor(t);
  const f = t - i;
  const a = lightHash(i, seed);
  return a + (lightHash(i + 1, seed) - a) * f * f * (3 - 2 * f);
}

// how bright a light is t of the way out to its radius (0 to 1). a bright middle that falls away
// softly and reaches nothing at its edge, so there's no line where it stops
function lightFade(t) {
  return t >= 1 ? 0 : (1 - t * t) ** 2;
}

// how bright light that's added up to `light` (0 up to LIGHTING.headroom) looks: as it is up to the
// knee, then rolling off towards full white without ever hitting it hard
function lightTone(light) {
  const knee = LIGHTING.knee;
  if (light <= knee) return light;
  return knee + (1 - knee) * (1 - Math.exp(-(light - knee) / (1 - knee)));
}

// the sky through the day: at each hour, the light everywhere (sky) and the sun's colour, 0 to 1. in
// between they blend
const LIGHT_SKY = [
  { hour: 0, sky: [0.08, 0.1, 0.2], sun: [1, 0.55, 0.35] },
  { hour: 5, sky: [0.12, 0.12, 0.25], sun: [1, 0.55, 0.35] },
  { hour: 6.2, sky: [0.42, 0.32, 0.38], sun: [1, 0.58, 0.36] },
  { hour: 7.5, sky: [0.46, 0.46, 0.53], sun: [1, 0.84, 0.64] },
  { hour: 12, sky: [0.48, 0.52, 0.6], sun: [1, 0.96, 0.88] },
  { hour: 16.5, sky: [0.46, 0.44, 0.5], sun: [1, 0.84, 0.6] },
  { hour: 17.8, sky: [0.4, 0.28, 0.36], sun: [1, 0.5, 0.3] },
  { hour: 19.3, sky: [0.12, 0.12, 0.27], sun: [1, 0.5, 0.3] },
  { hour: 24, sky: [0.08, 0.1, 0.2], sun: [1, 0.55, 0.35] },
];
const MOON_COLOUR = [0.32, 0.4, 0.58];

// filled in from the light files
const LIGHT_TYPES = {};

function defineLight(name, settings) {
  defineType(LIGHT_TYPES, LIGHT_DEFAULTS, 'light', name, settings); // utils.js
  checkLight(LIGHT_TYPES[name]);
}

// a flicker that isn't one goes back to none, and works out its colour as numbers
function checkLight(type) {
  if (!LIGHT_FLICKERS[type.flicker]) {
    console.warn(`The light "${type.name}" has a flicker "${type.flicker}" that isn't one of ${Object.keys(LIGHT_FLICKERS).join(', ')} (lighting.js), so it's none`);
    type.flicker = 'none';
  }
  type.rgb = hexToRgb(type.colour).map((c) => c / 255); // particles.js
}

DataFiles.register('light', {
  define: defineLight,
  // every light kind can be placed on its own (lightMarkers()). it has to be before the maps load,
  // since they drop objects that don't exist (mapfile.js), and lights load before maps
  loaded: () => Object.keys(LIGHT_TYPES).forEach(lightMarker),
  names: () => Object.keys(LIGHT_TYPES),
  toData: (name) => typeToData(LIGHT_TYPES[name], LIGHT_DEFAULTS), // utils.js
});

// ---------- lights on their own ----------
// so any light kind can be put anywhere without an object file for it, each one has an object
// "light-<name>" made here: a tile's worth of its colour in the editor, nothing in the game
// (TileMap.drawObject()), lighting from the middle of its tile. they're placed, moved and erased like
// any object and saved in maps the same way. they aren't object files, so objects can't be exported
// with them in (objects don't export anyway)

function lightMarker(name) {
  const key = `light-${name}`;
  // a real object file with that name wins
  if (OBJECT_TYPES[key] && !OBJECT_TYPES[key].lightMarker) return;
  OBJECT_TYPES[key] = { ...OBJECT_DEFAULTS, name: key, colour: LIGHT_TYPES[name].colour, fill: LIGHT_TYPES[name].colour, light: name, lightMarker: true };
}

// the editor's Lights tab (editor.js): every object that gives off light, own ones first. the tab's
// list is kept in place since the editor holds on to it (EDITOR_CATALOGUES)
function fillLightsTab() {
  const tab = EDITOR_TABS.find(({ kind }) => kind === 'light'); // editor.js
  if (!tab) return;
  tab.place ??= (map, name, col, row) => Editor.placeObject(map, name, col, row);
  const lit = Object.entries(OBJECT_TYPES).filter(([, type]) => type.light).sort(([, a], [, b]) => Boolean(b.lightMarker) - Boolean(a.lightMarker));
  const names = lit.map(([name]) => name);
  if (Object.keys(tab.types).join() === names.join()) return;
  for (const name of Object.keys(tab.types)) delete tab.types[name];
  for (const [name, type] of lit) tab.types[name] = type;
}

// an object's, tile's or item's "light" setting as a list of { light, x, y, height, aim }, or none
function lightSpots(setting) {
  if (!setting) return [];
  const list = Array.isArray(setting) ? setting : [setting];
  return list.map((spot) => (typeof spot === 'string' ? { light: spot } : spot)).filter((spot) => LIGHT_TYPES[spot.light]);
}

// a light to draw this frame, from kind `type` (or settings like it) at ground spot x, y. options:
// height, aim (radians), owner (the thing it's on, which doesn't block it or shadow it), shadows,
// seed. brightness has its flicker in
function lightFrom(type, x, y, { height = type.height, aim = radians(type.aim), owner = null, shadows = type.shadows, seed = null } = {}) {
  const random = seed ?? lightHash(Math.round(x) * 0.37 + Math.round(y) * 0.11, 9);
  const flicker = LIGHT_FLICKERS[type.flicker](Lighting.time * type.flickerSpeed, random * 100, type.flickerAmount);
  const on = flicker * (type.night ? Lighting.darkness : 1);
  const level = type.strength * on;
  return {
    x, y, z: height,
    rgb: type.rgb.map((c) => c * level),
    flicker: on,
    radius: type.radius,
    width: type.width,
    cone: type.cone >= 360 ? null : radians(type.cone),
    aim: aim + radians(type.spin * Lighting.time),
    shadows,
    owner,
    glow: type.glow * on,
    glowSize: type.glowSize,
  };
}

// where lights come from, each giving back a list of lightFrom()s on the map in the view (its world
// box, with margin). sketch.js's globals are fine here since it's only for show
const LIGHT_SOURCES = {
  objects: (map) => map.objects.flatMap((obj) => {
    const type = OBJECT_TYPES[obj.type];
    const spots = lightSpots(type?.light);
    if (spots.length === 0) return [];
    const x = (obj.col + type.width / 2) * TILE;
    // a light on its own shines from the middle of its tile
    const y = (obj.row + type.height) * TILE - (type.lightMarker ? TILE / 2 : 0);
    return spots.map((spot) => {
      const light = LIGHT_TYPES[spot.light];
      return lightFrom(light, x + (spot.x ?? 0), y + (spot.y ?? 0), { height: spot.height ?? light.height, aim: radians(spot.aim ?? light.aim), owner: obj, seed: lightHash(obj.col * 7 + obj.row * 13 + (spot.x ?? 0), 4) });
    });
  }),
  // what characters hold and wear. a beam points where they aim, starting a little in front
  held: () => [player, ...enemies, ...npcs].flatMap((c) => {
    if (c.dead) return [];
    const items = [c.heldItem(), ...c.worn()].filter(Boolean);
    return items.flatMap((item) => lightSpots(item.light).map((spot) => {
      const light = LIGHT_TYPES[spot.light];
      const feet = c.y + c.h / 2;
      const ahead = light.cone < 360 ? 10 : 0;
      return lightFrom(light, c.x + Math.cos(c.aimAngle) * ahead, feet + Math.sin(c.aimAngle) * ahead, { height: spot.height ?? light.height, aim: c.aimAngle, owner: c, seed: c === player ? 0.5 : null });
    }));
  }),
  // in the dark only, like night lights
  drops: (map) => map.drops.map((drop) => {
    const spot = Drops.where(drop); // inventory.js
    const colour = hexToRgb(RARITIES[drop.item.type.rarity]?.colour ?? '#ffffff').map((c) => c / 255); // items.js
    return { ...lightFrom({ ...LIGHT_DEFAULTS, ...LIGHTING.drop, rgb: colour, shadows: false, glow: 0, night: true }, spot.x, spot.y), z: spot.height + LIGHTING.drop.height };
  }),
  particles: (map, view) => {
    const middle = { x: (view.left + view.right) / 2, y: (view.top + view.bottom) / 2 };
    const glowing = Particles.list.filter((p) => p.effect.glow && p.x > view.left && p.x < view.right && p.y > view.top && p.y < view.bottom);
    if (glowing.length > LIGHTING.maxParticleLights) {
      glowing.sort((a, b) => Math.hypot(a.x - middle.x, a.y - middle.y) - Math.hypot(b.x - middle.x, b.y - middle.y));
      glowing.length = LIGHTING.maxParticleLights;
    }
    return glowing.map((p) => {
      // fades as it dies, like the particle does
      const left = 1 - p.age / p.life;
      const rgb = particleRgb(p).map((c) => (c / 255) * left); // particles.js
      return { x: p.x, y: p.y, z: p.z, rgb, flicker: 1, radius: Math.max(16, p.size * LIGHTING.particleRadius), width: 0, cone: null, aim: 0, shadows: false, owner: null, glow: 0, glowSize: 0 };
    });
  },
};

// ---------- shadows: what blocks light ----------

// a tile's shadow height in px (top of the file), 0 for none
function tileShadowHeight(type) {
  if (!type) return 0;
  if (type.shadowHeight !== null && type.shadowHeight !== undefined) return type.shadowHeight;
  return type.solid && !type.seeThrough ? LIGHTING.wallHeight : 0;
}

// the solid blocks in a world box: walls (rows of tiles the same height joined into one box each, then
// boxes the same width stacked into one, so a wall is a box or two rather than hundreds) and objects
// that are "box" or a list of boxes. each { x0, y0, x1, y1, h, owner, tile }, world px. worked out
// every frame, so the editor's changes show straight away
function shadowBoxes(map, area) {
  const boxes = [];
  const firstCol = Math.max(map.left, Math.floor(area.left / TILE));
  const lastCol = Math.min(map.left + map.cols - 1, Math.floor(area.right / TILE));
  const firstRow = Math.max(map.top, Math.floor(area.top / TILE));
  const lastRow = Math.min(map.top + map.rows - 1, Math.floor(area.bottom / TILE));
  // the run boxes still open from the row above, by "start,end,height", to stack the next row onto
  let open = new Map();
  for (let row = firstRow; row <= lastRow; row++) {
    const now = new Map();
    for (let col = firstCol; col <= lastCol; col++) {
      const h = tileShadowHeight(map.get(col, row));
      if (h <= 0) continue;
      let end = col;
      while (end < lastCol && tileShadowHeight(map.get(end + 1, row)) === h) end++;
      const key = `${col},${end},${h}`;
      const above = open.get(key);
      if (above) {
        above.y1 = (row + 1) * TILE;
        now.set(key, above);
      } else {
        const box = { x0: col * TILE, y0: row * TILE, x1: (end + 1) * TILE, y1: (row + 1) * TILE, h, owner: null, tile: true };
        boxes.push(box);
        now.set(key, box);
      }
      col = end;
    }
    open = now;
  }
  for (const obj of map.objects) {
    const type = OBJECT_TYPES[obj.type];
    if (!type) continue;
    for (const box of objectBoxes(obj, type)) {
      if (box.x1 < area.left || box.x0 > area.right || box.y1 < area.top || box.y0 > area.bottom) continue;
      boxes.push(box);
    }
  }
  return boxes;
}

// an object's blocks, from its shadow setting (top of the file)
function objectBoxes(obj, type) {
  const shadow = objectShadow(type);
  if (Array.isArray(shadow)) {
    return shadow.map((b) => ({ x0: (obj.col + b.x) * TILE, y0: (obj.row + b.y) * TILE, x1: (obj.col + b.x + b.w) * TILE, y1: (obj.row + b.y + b.h) * TILE, h: b.height ?? objectHeight(type), owner: obj, tile: false }));
  }
  if (shadow !== 'box') return [];
  return [{ x0: obj.col * TILE, y0: obj.row * TILE, x1: (obj.col + type.width) * TILE, y1: (obj.row + type.height) * TILE, h: objectHeight(type), owner: obj, tile: false }];
}

function objectShadow(type) {
  return type.shadow ?? (type.standing ? 'sprite' : 'none');
}

// how tall a box object is: its shadowHeight, or its picture's height above its tiles, or a tile
function objectHeight(type) {
  if (type.shadowHeight !== null && type.shadowHeight !== undefined) return type.shadowHeight;
  const size = artDrawnSize(getArt(type.image, 'object', type.name)); // art.js
  return size ? Math.max(4, size.h - type.height * TILE) : TILE;
}

// the shadow of a box from a light, as a list of points round it on the ground (convex, including the
// box's own footprint). from a point light at x, y, z (z above the box: the top's corners are pushed
// out from the light until they hit the ground; below it, the shadow runs out past reach). from the
// sun, `away` is how far a px of height pushes it, { x, y }
function boxShadow(box, light, away) {
  const corners = [[box.x0, box.y0], [box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1]];
  const pushed = corners.map(([x, y]) => {
    if (away) {
      const k = Math.min(box.h, LIGHTING.longestShadow / Math.max(0.01, Math.hypot(away.x, away.y)));
      return [x + away.x * k, y + away.y * k];
    }
    const dx = x - light.x;
    const dy = y - light.y;
    const far = (light.radius * 1.6 + Math.hypot(dx, dy)) / Math.max(1, Math.hypot(dx, dy));
    const k = light.z > box.h + 1 ? Math.min(far, light.z / (light.z - box.h)) : far;
    return [light.x + dx * k, light.y + dy * k];
  });
  return convexHull([...corners, ...pushed]);
}

// the points round the outside of some points, in order (monotone chain)
function convexHull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// how a standing thing's silhouette is laid down as its shadow: each px of its height goes `along`
// ({ x, y } per px) away from the light, as a list of { x, y, alpha }. edge on to a light it'd be a
// line, so it's kept LIGHTING.thinnest of its length deep. as the light crosses the line of its feet
// the shadow fades from falling in front of it to falling behind, rather than jumping across
function shadowSlants(along) {
  const thin = LIGHTING.thinnest * Math.hypot(along.x, along.y);
  if (Math.abs(along.y) >= thin) return [{ ...along, alpha: 1 }];
  const front = (1 + along.y / thin) / 2;
  return [{ x: along.x, y: thin, alpha: front }, { x: along.x, y: -thin, alpha: 1 - front }].filter((s) => s.alpha > 0);
}

// ---------- the sun and moon ----------

// the hour's sky light, and the sun or moon: { sky, sun, elevation (degrees), angle (radians, the way
// along the ground towards it) }, sun null when neither's up. a is the atmosphere
function skyAt(a, hour) {
  const h = ((hour % 24) + 24) % 24;
  const next = LIGHT_SKY.findIndex((k) => k.hour >= h);
  const to = LIGHT_SKY[Math.max(1, next)];
  const from = LIGHT_SKY[Math.max(1, next) - 1];
  const t = (h - from.hour) / (to.hour - from.hour || 1);
  const mix = (key) => from[key].map((c, i) => c + (to[key][i] - c) * t);
  const reach = a.lightSun / 100;
  const sky = mix('sky').map((c) => c * reach);
  // up is 0 at the horizon and 1 at midday (or midnight for the moon)
  const day = h >= 6 && h <= 18;
  const up = Math.sin(Math.PI * (((day ? h : h + 24 - 18) % 24) - (day ? 6 : 0)) / 12);
  if (up <= 0 || reach <= 0) return { sky, sun: null };
  const colour = day ? mix('sun') : MOON_COLOUR;
  // it rises a quarter turn round from where it is at midday and sets a quarter turn the other way
  const through = day ? (h - 6) / 12 : ((h + 6) % 24) / 12;
  const angle = radians(a.lightSunFrom + 90 - through * 180);
  const highest = day ? LIGHTING.sunHighest : LIGHTING.moonHighest;
  return {
    sky,
    sun: colour.map((c) => c * reach * up ** 0.5 * (day ? 1 : 0.6)),
    elevation: Math.max(LIGHTING.lowest, highest * up),
    angle,
  };
}

// ---------- canvases ----------

// a plain canvas that only ever grows, so changing size (zooming) doesn't keep remaking it
function lightCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  return { canvas, ctx: canvas.getContext('2d') };
}

function fitCanvas(c, w, h) {
  if (c.canvas.width >= w && c.canvas.height >= h) return;
  c.canvas.width = Math.max(c.canvas.width, Math.ceil(w));
  c.canvas.height = Math.max(c.canvas.height, Math.ceil(h));
}

// a p5 graphics that things can be drawn into with their own drawing code (drawingInto())
function lightGraphics(w, h) {
  const g = createGraphics(w, h);
  g.pixelDensity(1);
  return g;
}

// runs draw() with p5's drawing (and the global drawingContext) going into graphics g instead of the
// game's canvas, then puts it back. this is how a thing's silhouette comes from its own draw code
function drawingInto(g, draw) {
  const game = p5.instance;
  const renderer = game._renderer;
  const ctx = window.drawingContext;
  game._renderer = g._renderer;
  window.drawingContext = g.drawingContext;
  try {
    draw();
  } finally {
    game._renderer = renderer;
    window.drawingContext = ctx;
  }
}

function rgbText([r, g, b], alpha = 1) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return `rgba(${c(r)}, ${c(g)}, ${c(b)}, ${alpha})`;
}

// the svg filter that rolls the light map off towards white (lightTone()), the same for red, green and
// blue so colours don't split apart. made once, its id
function toneFilter(headroom) {
  const id = 'sqLightTone';
  if (!document.getElementById(id)) {
    const values = Array.from({ length: 33 }, (_, i) => lightTone((i / 32) * headroom).toFixed(4)).join(' ');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    svg.innerHTML = `<filter id="${id}" color-interpolation-filters="sRGB"><feComponentTransfer>${['R', 'G', 'B'].map((c) => `<feFunc${c} type="table" tableValues="${values}"/>`).join('')}</feComponentTransfer></filter>`;
    document.body.appendChild(svg);
  }
  return `url(#${id})`;
}

// ---------- the light map ----------

const Lighting = {
  // seconds of game time, for flickers and spinning (paused with the game)
  time: 0,
  // the hour on maps whose day goes round (Light > Day length)
  hour: null,
  // how dark the sky is now, 0 (day) to 1 (night or underground), for lights that are only on at night
  darkness: 0,
  // the light map is stored divided by this, to leave room for lights adding up (LIGHTING.headroom).
  // 1 in browsers that can't filter a canvas, which then just go white where lights overlap
  headroom: 1,
  // plain canvases (lightCanvas()): the light map and the rolled off one, the glow, the glowing paint,
  // the sun, one light, a shadow mask, the strips each thing's light is sampled into, a thing on its
  // own, a strip averaged, and the silhouettes shrunk a little (core)
  canvases: null,
  // the silhouettes and glowing paint of this frame's things (p5 graphics, drawingInto())
  atlas: null,
  glowAtlas: null,
  // what this frame drew, for dev mode's info panel
  stats: { lights: 0, shadowed: 0, things: 0, ms: 0 },
  // true shows just the light map (Shift + J in dev mode), the easiest way to see what it's doing
  onlyLight: false,
  // set if something went wrong, which turns it off until the page reloads rather than break the game
  broken: false,

  // the map's atmosphere with its Light tab, if lighting's on for it now, or null
  settings(map) {
    if (this.broken || !GAME_SETTINGS.lighting || !map) return null;
    const a = Atmosphere.current(map); // atmosphere.js
    return a?.lightOn ? a : null;
  },

  // every frame the game isn't paused (sketch.js)
  update(dt, map) {
    this.time += dt;
    const a = this.settings(map);
    if (a && a.lightDayLength > 0) this.hour = ((this.hour ?? a.lightTime) + (dt * 24) / (a.lightDayLength * 60)) % 24;
    // new and renamed light kinds show up in the Lights tab
    if (Editor.active) fillLightsTab();
  },

  // the hour it is on map now
  hourOn(a) {
    return a.lightDayLength > 0 ? this.hour ?? a.lightTime : a.lightTime;
  },

  // J in dev mode, and the pause menu's tick (pausemenu.js)
  toggle() {
    GAME_SETTINGS.lighting = !GAME_SETTINGS.lighting;
    PauseMenu.save();
    showMessage(`Lighting ${GAME_SETTINGS.lighting ? 'on' : 'off'}`); // hud.js
  },

  // the world, in world positions (inside camera.begin/end), after its things are drawn (sketch.js)
  draw(camera, map) {
    this.frame = null;
    const a = this.settings(map);
    if (!a) return;
    const started = performance.now();
    try {
      this.frame = this.build(camera, map, a);
      const f = this.frame;
      const ctx = drawingContext;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalCompositeOperation = this.onlyLight ? 'source-over' : 'multiply';
      ctx.drawImage(this.canvases.final.canvas, 0, 0, f.cols, f.rows, f.ox, f.oy, f.cols * f.cell, f.rows * f.cell);
      ctx.restore();
    } catch (err) {
      // never let an experiment stop the game
      console.warn(`Lighting stopped working, so it's off until the page reloads: ${err.stack ?? err}`);
      this.broken = true;
      this.frame = null;
    }
    this.stats.ms = performance.now() - started;
  },

  // the glowing paint, then the halos, after the atmosphere (sketch.js)
  drawGlow() {
    const f = this.frame;
    if (!f) return;
    const ctx = drawingContext;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.canvases.emit.canvas, 0, 0, f.cols, f.rows, f.ox, f.oy, f.cols * f.cell, f.rows * f.cell);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, f.settings.lightGlow / 100);
    ctx.drawImage(this.canvases.glow.canvas, 0, 0, f.cols, f.rows, f.ox, f.oy, f.cols * f.cell, f.rows * f.cell);
    ctx.restore();
  },

  // an [r, g, b] of light as it's stored in the light map (headroom above)
  stored(rgb, alpha = 1) {
    return rgbText(rgb.map((c) => c / this.headroom), alpha);
  },

  // works out the light map (steps at the top of the file) and gives back the frame:
  // { settings, cell, ox, oy, cols, rows, view, sun }
  build(camera, map, a) {
    if (!this.canvases) {
      this.canvases = Object.fromEntries(['light', 'final', 'glow', 'emit', 'sun', 'one', 'mask', 'strips', 'thing', 'average', 'core'].map((name) => [name, lightCanvas()]));
      this.atlas = lightGraphics(1024, 512);
      this.glowAtlas = lightGraphics(1024, 512);
      this.headroom = 'filter' in CanvasRenderingContext2D.prototype ? LIGHTING.headroom : 1;
    }
    const view = camera.view();
    // bigger light pixels when zoomed out a lot, in steps of 2 so they stay on the art's pixel grid.
    // a number, though the picker gives back its words' key
    let cell = Number(a.lightPixel) || LIGHTING.cell;
    while (((view.right - view.left) / cell) * ((view.bottom - view.top) / cell) > LIGHTING.maxCells) cell *= 2;
    const ox = Math.floor(view.left / cell) * cell - cell;
    const oy = Math.floor(view.top / cell) * cell - cell;
    const cols = Math.ceil((view.right - ox) / cell) + 2;
    const rows = Math.ceil((view.bottom - oy) / cell) + 2;
    const f = { settings: a, cell, ox, oy, cols, rows, view, sun: null };
    const sky = skyAt(a, this.hourOn(a));
    this.darkness = Math.max(0, Math.min(1, (0.42 - Math.max(...sky.sky)) / 0.2));
    const { light, final, glow, emit } = this.canvases;
    for (const c of [light, final, glow, emit]) fitCanvas(c, cols, rows);
    const world = (ctx) => ctx.setTransform(1 / cell, 0, 0, 1 / cell, -ox / cell, -oy / cell);

    // what's around: the lights that reach the view, shadow boxes, and the things standing up
    const reach = { left: view.left - 400, right: view.right + 400, top: view.top - 400, bottom: view.bottom + 400 };
    const lights = Object.values(LIGHT_SOURCES).flatMap((source) => source(map, view)).filter((l) => l.x + l.radius + l.width > view.left && l.x - l.radius - l.width < view.right && l.y + l.radius > view.top && l.y - l.radius < view.bottom + l.z);
    // the light round you, only in the dark
    if (a.lightPlayer > 0 && this.darkness > 0 && !player.dead && !Editor.active) {
      lights.push({ x: player.x, y: player.y + player.h / 2, z: LIGHTING.you.height, rgb: LIGHTING.you.colour.map((c) => c * LIGHTING.you.strength * this.darkness), flicker: 1, radius: a.lightPlayer, width: 0, cone: null, aim: 0, shadows: false, owner: player, glow: 0, glowSize: 0 });
    }
    // lights with shadows and beams get their own canvas, the closest ones to the middle first
    const middle = { x: camera.x, y: camera.y };
    const closest = (p, q) => Math.hypot(p.x - middle.x, p.y - middle.y) - Math.hypot(q.x - middle.x, q.y - middle.y);
    const own = [
      ...lights.filter((l) => l.shadows).sort(closest).slice(0, LIGHTING.maxShadowed),
      ...lights.filter((l) => !l.shadows && l.cone !== null).sort(closest).slice(0, LIGHTING.maxBeams),
    ];
    const plain = lights.filter((l) => !own.includes(l));
    const boxes = shadowBoxes(map, reach);
    const things = this.things(map, reach, cell);
    this.stats = { lights: lights.length, shadowed: own.length, things: things.length, ms: this.stats.ms };
    this.drawSilhouettes(things, cell);

    // 1. the sky, glowing tiles and lights without shadows
    const flash = Atmosphere.flash * ATMOSPHERE_FLASH.bright * GAME_SETTINGS.flashes; // atmosphere.js
    const flashRgb = hexToRgb(a.flashColour).map((c) => (c / 255) * flash);
    const ambient = hexToRgb(a.lightAmbient).map((c, i) => c / 255 + sky.sky[i] + flashRgb[i] * 0.6);
    const lc = light.ctx;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'source-over';
    lc.globalAlpha = 1;
    lc.filter = 'none';
    lc.fillStyle = this.stored(ambient);
    lc.fillRect(0, 0, cols, rows);
    lc.globalCompositeOperation = 'lighter';
    this.drawTileGlow(lc, map, f);
    world(lc);
    for (const l of plain) this.drawLight(lc, l, false);
    // the glow's halos for lights not on a thing (the rest go on with their thing, step 6)
    const gc = glow.ctx;
    for (const c of [glow.ctx, emit.ctx]) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      c.clearRect(0, 0, cols, rows);
    }
    world(gc);
    gc.globalCompositeOperation = 'lighter';
    const thingOwners = new Set(things.map((t) => t.owner));
    for (const l of lights) if (!thingOwners.has(l.owner)) this.drawHalo(gc, l);

    // every thing's light starts as what's reached its feet so far
    const strips = this.canvases.strips;
    fitCanvas(strips, Math.max(1, ...things.map((t) => t.cols)), Math.max(1, things.length));
    const sc = strips.ctx;
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.globalCompositeOperation = 'source-over';
    sc.globalAlpha = 1;
    sc.clearRect(0, 0, strips.canvas.width, strips.canvas.height);
    things.forEach((t, i) => this.sample(sc, light.canvas, ox, oy, cell, t, i, 0, 0, 1));

    // 3. the sun or moon (with lightning added to it)
    const shade = a.lightShadows / 100;
    if (sky.sun || flash > 0) {
      const sun = sky.sun ?? [0, 0, 0];
      const angle = sky.sun ? sky.angle : radians(a.lightSunFrom);
      const elevation = sky.sun ? sky.elevation : 70;
      const colour = sun.map((c, i) => c + flashRgb[i] * 0.4);
      this.drawSun(f, colour, angle, elevation, boxes, things, shade, world);
    }

    // 4. lights with shadows and beams, each on its own canvas
    for (const l of own) this.drawOwnLight(f, l, boxes, things, shade);

    // 5. wall tops get the sky and nothing else
    const top = this.stored(ambient.map((c, i) => c + (sky.sun?.[i] ?? 0)));
    world(lc);
    lc.globalCompositeOperation = 'source-over';
    lc.fillStyle = top;
    for (const box of boxes) if (box.tile) lc.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);

    // 6. the things, back to front
    this.drawThings(f, things, lights, world, ambient, sky);

    // the darkest it gets, then rolled off towards white
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalAlpha = 1;
    lc.globalCompositeOperation = 'lighten';
    lc.fillStyle = this.stored(LIGHTING.floor);
    lc.fillRect(0, 0, cols, rows);
    const fc = final.ctx;
    fc.setTransform(1, 0, 0, 1, 0, 0);
    fc.globalCompositeOperation = 'copy';
    fc.filter = this.headroom > 1 ? toneFilter(this.headroom) : 'none';
    fc.drawImage(light.canvas, 0, 0, cols, rows, 0, 0, cols, rows);
    fc.filter = 'none';
    fc.globalCompositeOperation = 'source-over';
    return f;
  },

  // the standing things the light map treats one by one (step 6), front to back like sketch.js sorts
  // them. each { owner, foot: { x, y }, height, box (world px, on the light grid), cols, rows, shadow
  // ('sprite', 'box' or 'none'), roofAt, drawBody(), drawGlow(), flicker }
  things(map, area, cell) {
    const list = [];
    const snap = (v) => Math.floor(v / cell) * cell;
    const add = (owner, footX, footY, w, h, below, extra) => {
      const left = snap(footX - w / 2);
      const top = snap(footY - h);
      const box = { x: left, y: top, w: snap(footX + w / 2) + cell - left, h: snap(footY + below) + cell - top };
      if (box.x > area.right || box.x + box.w < area.left || box.y > area.bottom || box.y + box.h < area.top) return;
      list.push({ owner, foot: { x: footX, y: footY }, box, cols: box.w / cell, rows: box.h / cell, ...extra });
    };
    for (const c of [player, ...enemies, ...npcs]) {
      const size = artDrawnSize(characterArt(c.settings, 'idle')); // character.js, art.js
      const w = Math.max(LIGHTING.characterBox.w, (size?.w ?? 0) + 24);
      const h = Math.max(LIGHTING.characterBox.h, (size?.h ?? 0) + 24);
      add(c, c.x, c.y + c.h / 2, w, h, 6, { height: size?.h ?? c.h, shadow: 'sprite', drawBody: () => c.drawBody(), drawGlow: null, flicker: 1 });
    }
    const huge = { left: -Infinity, right: Infinity, top: -Infinity, bottom: Infinity };
    for (const obj of map.standingObjects()) {
      const type = OBJECT_TYPES[obj.type];
      const size = artDrawnSize(getArt(type.image, 'object', type.name));
      const w = Math.max(type.width * TILE, size?.w ?? 0) + 4;
      const h = Math.max(type.height * TILE, size?.h ?? 0) + 4;
      const shadow = objectShadow(type);
      const glowArt = type.glowImage ? getArt(type.glowImage, 'object', type.name) : null;
      const x = (obj.col + type.width / 2) * TILE;
      const y = (obj.row + type.height) * TILE;
      add(obj, x, y, w, h, 2, {
        height: size?.h ?? type.height * TILE,
        shadow: shadow === 'none' ? 'none' : shadow === 'sprite' ? 'sprite' : 'box',
        roofAt: shadow === 'sprite' || shadow === 'none' ? null : y - objectHeight(type),
        drawBody: () => map.drawObject(obj, huge),
        drawGlow: glowArt ? () => drawArt(glowArt, x, y, { time: millis() / 1000 }) : null,
        flicker: lightSpots(type.light).length ? LIGHT_SOURCES.objects({ objects: [obj] })[0].flicker : 1,
      });
    }
    // the same order sketch.js draws them in
    list.sort((p, q) => p.foot.y - q.foot.y);
    return list;
  },

  // step 2: every thing drawn small into the atlas by its own code, a box each, packed in rows. then a
  // copy shrunk a little (core: each pixel's coverage to the power of 8, so only the ones the thing
  // covers all of are left) that its light goes on, so light never spills onto the ground round it
  drawSilhouettes(things, cell) {
    let x = 0;
    let y = 0;
    let rowH = 0;
    const W = this.atlas.width;
    const H = this.atlas.height;
    for (const t of things) {
      if (x + t.cols > W) {
        x = 0;
        y += rowH + 1;
        rowH = 0;
      }
      // out of room (hundreds of things on screen): the rest get no silhouette
      if (y + t.rows > H || t.cols > W) {
        t.slot = null;
        continue;
      }
      t.slot = { x, y };
      x += t.cols + 1;
      rowH = Math.max(rowH, t.rows);
    }
    for (const g of [this.atlas, this.glowAtlas]) {
      const ctx = g.drawingContext;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
    }
    const into = (g, t, draw) => {
      const ctx = g.drawingContext;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.rect(t.slot.x, t.slot.y, t.cols, t.rows);
      ctx.clip();
      ctx.setTransform(1 / cell, 0, 0, 1 / cell, t.slot.x - t.box.x / cell, t.slot.y - t.box.y / cell);
      draw();
      ctx.restore();
    };
    drawingInto(this.atlas, () => {
      for (const t of things) if (t.slot) into(this.atlas, t, () => { push(); t.drawBody(); pop(); });
    });
    drawingInto(this.glowAtlas, () => {
      for (const t of things) if (t.slot && t.drawGlow) into(this.glowAtlas, t, () => { push(); t.drawGlow(); pop(); });
    });
    const core = this.canvases.core;
    fitCanvas(core, W, H);
    const cc = core.ctx;
    cc.setTransform(1, 0, 0, 1, 0, 0);
    cc.globalAlpha = 1;
    cc.globalCompositeOperation = 'copy';
    cc.drawImage(this.atlas.canvas, 0, 0);
    cc.globalCompositeOperation = 'destination-in';
    for (let i = 0; i < 3; i++) cc.drawImage(core.canvas, 0, 0);
    cc.globalCompositeOperation = 'source-over';
  },

  // adds what canvas src (light pixels, its top left at world ox, oy) has along thing t's feet onto
  // its strip, row i. nudge (light px) moves where it looks, and amount is how much of it counts
  sample(sc, src, ox, oy, cell, t, i, nudgeX, nudgeY, amount) {
    if (amount <= 0) return;
    const sx = (t.box.x - ox) / cell + nudgeX;
    const row = t.shadow === 'box' ? t.foot.y : t.foot.y - cell;
    const sy = Math.floor((row - oy) / cell) + nudgeY;
    sc.globalCompositeOperation = 'lighter';
    sc.globalAlpha = Math.min(1, amount);
    sc.drawImage(src, sx, sy, t.cols, 1, 0, i, t.cols, 1);
    sc.globalAlpha = 1;
  },

  // a light's glow onto ctx (in world positions), coloured, spread by its width, fading smoothly to
  // nothing at its reach. a beam's sides fade softly when it's on its own canvas (own), and are cut
  // hard when it isn't (other lights are on that canvas)
  drawLight(ctx, l, own) {
    const r = l.radius;
    ctx.save();
    if (l.cone !== null && !own) {
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.arc(l.x, l.y, r + l.width, l.aim - l.cone / 2, l.aim + l.cone / 2);
      ctx.closePath();
      ctx.clip();
    }
    ctx.translate(l.x, l.y);
    if (l.width > 0) ctx.scale((r + l.width / 2) / r, 1);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    for (let k = 0; k <= 12; k++) gradient.addColorStop(k / 12, this.stored(l.rgb.map((c) => c * lightFade(k / 12))));
    ctx.fillStyle = gradient;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
    if (l.cone !== null && own) this.cutBeam(ctx, l);
  },

  // keeps only a beam's wedge of what's on ctx, its sides fading over LIGHTING.beamSoftness of its
  // width. needs a conic gradient (Chrome, Edge, Firefox, Safari 16.4 on), or the sides are cut hard
  cutBeam(ctx, l) {
    const reach = l.radius + l.width;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    if (ctx.createConicGradient) {
      // the gradient goes round from straight behind the beam, so the beam's middle is halfway
      const turn = Math.PI * 2;
      const soft = Math.max(radians(6), l.cone * LIGHTING.beamSoftness) / turn;
      const half = l.cone / 2 / turn;
      const mask = ctx.createConicGradient(l.aim - Math.PI, l.x, l.y);
      mask.addColorStop(0, 'rgba(0, 0, 0, 0)');
      mask.addColorStop(Math.max(0, 0.5 - half - soft / 2), 'rgba(0, 0, 0, 0)');
      mask.addColorStop(Math.max(0, 0.5 - half + soft / 2), '#000');
      mask.addColorStop(Math.min(1, 0.5 + half - soft / 2), '#000');
      mask.addColorStop(Math.min(1, 0.5 + half + soft / 2), 'rgba(0, 0, 0, 0)');
      mask.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = mask;
      ctx.fillRect(l.x - reach, l.y - reach, reach * 2, reach * 2);
    } else {
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.arc(l.x, l.y, reach, l.aim - l.cone / 2, l.aim + l.cone / 2);
      ctx.closePath();
      ctx.fillStyle = '#000';
      ctx.fill();
    }
    ctx.restore();
  },

  // the halo round a light, up where it hangs, fading out smoothly
  drawHalo(ctx, l) {
    if (l.glow <= 0 || l.glowSize <= 0) return;
    const y = l.y - l.z;
    const gradient = ctx.createRadialGradient(l.x, y, 0, l.x, y, l.glowSize);
    const brightest = Math.max(...l.rgb, 0.001);
    for (let k = 0; k <= 6; k++) gradient.addColorStop(k / 6, rgbText(l.rgb.map((c) => (c / brightest) * l.glow * lightFade(k / 6))));
    ctx.fillStyle = gradient;
    ctx.fillRect(l.x - l.glowSize, y - l.glowSize, l.glowSize * 2, l.glowSize * 2);
  },

  // the glowing tiles (their "light"), as one soft pass: a light pixel per tile, blurred by their reach
  drawTileGlow(lc, map, f) {
    const { view } = f;
    const margin = 4;
    const firstCol = Math.max(map.left, Math.floor(view.left / TILE) - margin);
    const lastCol = Math.min(map.left + map.cols - 1, Math.floor(view.right / TILE) + margin);
    const firstRow = Math.max(map.top, Math.floor(view.top / TILE) - margin);
    const lastRow = Math.min(map.top + map.rows - 1, Math.floor(view.bottom / TILE) + margin);
    let tiny = null;
    let reach = 0;
    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = firstCol; col <= lastCol; col++) {
        const type = map.get(col, row);
        const spot = type?.light && lightSpots(type.light)[0];
        if (!spot) continue;
        if (!tiny) {
          tiny = this.canvases.mask;
          fitCanvas(tiny, lastCol - firstCol + 1, lastRow - firstRow + 1);
          tiny.ctx.setTransform(1, 0, 0, 1, 0, 0);
          tiny.ctx.globalCompositeOperation = 'source-over';
          tiny.ctx.globalAlpha = 1;
          tiny.ctx.clearRect(0, 0, tiny.canvas.width, tiny.canvas.height);
        }
        const l = LIGHT_TYPES[spot.light];
        const level = l.strength * LIGHT_FLICKERS[l.flicker](this.time * l.flickerSpeed, (col * 0.13 + row * 0.07) % 1 * 100, l.flickerAmount);
        reach = Math.max(reach, l.radius);
        tiny.ctx.fillStyle = this.stored(l.rgb.map((c) => c * level));
        tiny.ctx.fillRect(col - firstCol, row - firstRow, 1, 1);
      }
    }
    if (!tiny) return;
    lc.save();
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.imageSmoothingEnabled = true;
    // blur is in light pixels on the light map, so a tile's glow reaches about its radius
    lc.filter = `blur(${Math.max(1, reach / f.cell / 2.5)}px)`;
    const s = TILE / f.cell;
    lc.drawImage(tiny.canvas, 0, 0, lastCol - firstCol + 1, lastRow - firstRow + 1, (firstCol * TILE - f.ox) / f.cell, (firstRow * TILE - f.oy) / f.cell, (lastCol - firstCol + 1) * s, (lastRow - firstRow + 1) * s);
    lc.restore();
  },

  // the shadows of boxes from light l (or the sun, `away`) filled on ctx in world positions, giving
  // back whether there were any. boxes the light is inside or on don't count, or it'd be all shadow
  fillBoxShadows(ctx, boxes, l, away) {
    ctx.fillStyle = '#000';
    ctx.beginPath();
    let any = false;
    for (const box of boxes) {
      if (!away) {
        if (box.owner && box.owner === l.owner) continue;
        if (l.x >= box.x0 && l.x <= box.x1 && l.y >= box.y0 && l.y <= box.y1) continue;
        const nx = Math.max(box.x0, Math.min(l.x, box.x1));
        const ny = Math.max(box.y0, Math.min(l.y, box.y1));
        if (Math.hypot(nx - l.x, ny - l.y) > l.radius + l.width) continue;
      }
      const points = boxShadow(box, l, away);
      ctx.moveTo(points[0][0], points[0][1]);
      for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
      ctx.closePath();
      any = true;
    }
    if (any) ctx.fill();
    return any;
  },

  // lays thing t's silhouette down on ctx (in world positions) as its shadow: its feet stay put and
  // each px of height goes `along` ({ x, y } per px) away from the light (shadowSlants()). the
  // picture's slanted, not turned, which would leave a wedge of no shadow by the feet
  layShadow(ctx, t, along, cell) {
    if (!t.slot || t.shadow !== 'sprite') return false;
    if (Math.hypot(along.x, along.y) < 0.01) return false;
    const { y: fy } = t.foot;
    const bx = t.box.x;
    const up = fy - t.box.y;
    // only what's above its feet. a silhouette px (i, j) is world (bx + i cell, by + j cell), v = up - j
    // cell up from its feet, and it goes to the ground at (bx + i cell + ax v, fy + ay v)
    const above = Math.min(t.rows, Math.ceil(up / cell));
    for (const { x: ax, y: ay, alpha } of shadowSlants(along)) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.transform(cell, 0, -ax * cell, -ay * cell, bx + ax * up, fy + ay * up);
      ctx.drawImage(this.atlas.canvas, t.slot.x, t.slot.y, t.cols, above, 0, 0, t.cols, above);
      ctx.restore();
    }
    return true;
  },

  // takes the shadows drawn on mask (size light px square, from the top left) out of canvas c, by
  // `amount` (1 blocks all the light), edges softened, then clears the mask and puts its world
  // transform back (x0, y0)
  cutShadows(c, mask, size, amount, x0, y0, cell) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'destination-out';
    c.globalAlpha = amount;
    if (LIGHTING.softness > 0) c.filter = `blur(${LIGHTING.softness}px)`;
    c.drawImage(mask.canvas, 0, 0, size.w, size.h, 0, 0, size.w, size.h);
    c.filter = 'none';
    c.globalAlpha = 1;
    mask.ctx.setTransform(1, 0, 0, 1, 0, 0);
    mask.ctx.clearRect(0, 0, size.w, size.h);
    mask.ctx.setTransform(1 / cell, 0, 0, 1 / cell, -x0 / cell, -y0 / cell);
  },

  // step 3: sunlight over the light map, minus the shadows, sampled by the things on the way
  drawSun(f, colour, angle, elevation, boxes, things, shade, world) {
    const sun = this.canvases.sun;
    const mask = this.canvases.mask;
    for (const c of [sun, mask]) fitCanvas(c, f.cols, f.rows);
    const c = sun.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = this.stored(colour);
    c.fillRect(0, 0, f.cols, f.rows);
    // a px of height pushes a shadow this far along the ground, away from the sun
    const per = 1 / Math.tan(radians(elevation));
    const away = { x: -Math.cos(angle) * per, y: -Math.sin(angle) * per };
    const size = { w: f.cols, h: f.rows };
    const m = mask.ctx;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.globalCompositeOperation = 'source-over';
    m.globalAlpha = 1;
    m.clearRect(0, 0, f.cols, f.rows);
    world(m);
    // walls and buildings block all of it, standing things Shadows % of it
    if (this.fillBoxShadows(m, boxes, null, away)) this.cutShadows(c, mask, size, 1, f.ox, f.oy, f.cell);
    if (shade > 0) {
      let any = false;
      for (const t of things) {
        const k = Math.min(1, LIGHTING.longestShadow / (per * t.height));
        any = this.layShadow(m, t, { x: away.x * k, y: away.y * k }, f.cell) || any;
      }
      if (any) this.cutShadows(c, mask, size, shade, f.ox, f.oy, f.cell);
    }
    // sampled a little towards the sun, past the thing's own shadow
    const toward = { x: Math.cos(angle), y: Math.sin(angle) };
    const sc = this.canvases.strips.ctx;
    things.forEach((t, i) => {
      const n = t.shadow === 'box' ? 0 : LIGHTING.nudge;
      this.sample(sc, sun.canvas, f.ox, f.oy, f.cell, t, i, Math.round(toward.x * n), Math.round(toward.y * n), this.facing(t, toward.x, toward.y, Math.sin(radians(elevation))));
    });
    const lc = this.canvases.light.ctx;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'lighter';
    lc.drawImage(sun.canvas, 0, 0, f.cols, f.rows, 0, 0, f.cols, f.rows);
    f.sun = { colour, toward, elevation };
  },

  // how much of a light lights thing t's front (step 6): all of it from in front or overhead, less
  // from behind. dx, dy the way to the light along the ground, up how far overhead it is (0 to 1).
  // buildings work theirs out from their own shadow, so get all of it
  facing(t, dx, dy, up) {
    if (t.shadow === 'box') return 1;
    const length = Math.hypot(dx, dy) || 1;
    const front = Math.max(up, (dy / length + 1) / 2);
    return LIGHTING.behind + (1 - LIGHTING.behind) * front;
  },

  // step 4: one light on its own canvas the size of its reach: its glow cut to its beam, minus walls
  // and buildings (all the light), then the things near it sample it, then their own shadows go down
  // (Shadows % of the light)
  drawOwnLight(f, l, boxes, things, shade) {
    const { cell } = f;
    const one = this.canvases.one;
    const mask = this.canvases.mask;
    const reach = l.radius + l.width / 2;
    const x0 = Math.floor((l.x - reach) / cell) * cell;
    const y0 = Math.floor((l.y - reach) / cell) * cell;
    const size = Math.ceil((reach * 2) / cell) + 2;
    for (const c of [one, mask]) {
      fitCanvas(c, size, size);
      c.ctx.setTransform(1, 0, 0, 1, 0, 0);
      c.ctx.globalCompositeOperation = 'source-over';
      c.ctx.globalAlpha = 1;
      c.ctx.clearRect(0, 0, size, size);
      c.ctx.setTransform(1 / cell, 0, 0, 1 / cell, -x0 / cell, -y0 / cell);
    }
    const c = one.ctx;
    c.globalCompositeOperation = 'lighter';
    this.drawLight(c, l, true);
    const near = things.filter((t) => Math.hypot(t.foot.x - l.x, t.foot.y - l.y) < reach + t.box.w / 2);
    const square = { w: size, h: size };
    if (l.shadows && this.fillBoxShadows(mask.ctx, boxes, l, null)) this.cutShadows(c, mask, square, 1, x0, y0, cell);
    const sc = this.canvases.strips.ctx;
    for (const t of near) {
      // a building's own lights (windows, signs) shine out of it, not onto its wall
      if (t.shadow === 'box' && t.owner === l.owner) continue;
      const dx = l.x - t.foot.x;
      const dy = l.y - t.foot.y;
      const up = l.owner === t.owner ? 1 : Math.sin(Math.atan2(l.z, Math.hypot(dx, dy)));
      this.sample(sc, one.canvas, x0, y0, cell, t, things.indexOf(t), 0, 0, this.facing(t, dx, dy, up));
    }
    if (l.shadows && shade > 0) {
      let any = false;
      for (const t of near) {
        if (t.owner === l.owner || t.shadow !== 'sprite') continue;
        const ground = Math.hypot(t.foot.x - l.x, t.foot.y - l.y);
        if (ground < 3) continue;
        // a px of height goes this far: further the further away it is, and the lower the light
        const length = l.z > t.height + 1 ? Math.min(ground / (l.z - t.height), LIGHTING.longestShadow / t.height) : LIGHTING.longestShadow / t.height;
        any = this.layShadow(mask.ctx, t, { x: ((t.foot.x - l.x) / ground) * length, y: ((t.foot.y - l.y) / ground) * length }, cell) || any;
      }
      if (any) this.cutShadows(c, mask, square, shade, x0, y0, cell);
    }
    const lc = this.canvases.light.ctx;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'lighter';
    lc.drawImage(one.canvas, 0, 0, size, size, (x0 - f.ox) / cell, (y0 - f.oy) / cell, size, size);
  },

  // step 6: each thing's light over its silhouette, then its rim light, glowing paint and halos
  drawThings(f, things, lights, world, ambient, sky) {
    const { cell } = f;
    const a = f.settings;
    const lc = this.canvases.light.ctx;
    const gc = this.canvases.glow.ctx;
    const ec = this.canvases.emit.ctx;
    const thing = this.canvases.thing;
    const average = this.canvases.average;
    const strips = this.canvases.strips.canvas;
    const core = this.canvases.core.canvas;
    fitCanvas(thing, Math.max(1, ...things.map((t) => t.cols)), Math.max(1, ...things.map((t) => t.rows)));
    fitCanvas(average, 64, 1);
    const tc = thing.ctx;
    const ac = average.ctx;
    // the sky on roofs
    const roof = this.stored(ambient.map((c, i) => c + (sky.sun?.[i] ?? 0) * 0.85));
    things.forEach((t, i) => {
      if (!t.slot || (t.shadow === 'none' && !t.drawGlow)) return;
      const at = { x: (t.box.x - f.ox) / cell, y: (t.box.y - f.oy) / cell };
      if (t.shadow !== 'none') {
        // its feet's light, averaged into a few pixels so a thin shadow crossing its feet doesn't stripe
        // it: two for a character or tree (the sides nearer and further from a light), one every six
        // light pixels along a building's front. then stretched over it smoothly
        const n = t.shadow === 'box' ? Math.max(2, Math.min(64, Math.round(t.cols / 6))) : 2;
        ac.setTransform(1, 0, 0, 1, 0, 0);
        ac.globalCompositeOperation = 'copy';
        ac.imageSmoothingEnabled = true;
        ac.imageSmoothingQuality = 'high';
        ac.drawImage(strips, 0, i, t.cols, 1, 0, 0, n, 1);
        tc.setTransform(1, 0, 0, 1, 0, 0);
        tc.globalAlpha = 1;
        tc.imageSmoothingEnabled = true;
        tc.globalCompositeOperation = 'copy';
        tc.drawImage(average.canvas, 0, 0, n, 1, 0, 0, t.cols, t.rows);
        tc.imageSmoothingEnabled = false;
        // a building's front is its bottom shadowHeight px, and above that is roof
        if (t.roofAt !== null && t.roofAt !== undefined) {
          tc.globalCompositeOperation = 'source-over';
          tc.fillStyle = roof;
          tc.fillRect(0, 0, t.cols, Math.max(0, Math.round((t.roofAt - t.box.y) / cell)));
        }
        tc.globalCompositeOperation = 'destination-in';
        tc.drawImage(core, t.slot.x, t.slot.y, t.cols, t.rows, 0, 0, t.cols, t.rows);
        lc.setTransform(1, 0, 0, 1, 0, 0);
        lc.globalCompositeOperation = 'source-over';
        lc.drawImage(thing.canvas, 0, 0, t.cols, t.rows, at.x, at.y, t.cols, t.rows);
        if (a.lightRim > 0 && t.shadow === 'sprite') this.drawRim(t, lights, f);
        // whatever glowed behind it is hidden by it
        for (const c of [gc, ec]) {
          c.setTransform(1, 0, 0, 1, 0, 0);
          c.globalCompositeOperation = 'destination-out';
          c.drawImage(this.atlas.canvas, t.slot.x, t.slot.y, t.cols, t.rows, at.x, at.y, t.cols, t.rows);
        }
      }
      // a health bar stays readable in the dark (Character.drawHealthBar())
      if (t.owner instanceof Character && t.owner.trailHealth < t.owner.maxHealth && !t.owner.dead) {
        const c = t.owner;
        world(lc);
        lc.globalCompositeOperation = 'source-over';
        lc.fillStyle = '#fff';
        lc.fillRect(Math.round(c.x - (c.w + 8) / 2) - 1, Math.round(c.y - c.h / 2 + c.sink * c.h) - 11, c.w + 10, 7);
      }
      // glowing paint goes over it in its lit colours, as bright as its light is now (off by day for
      // night lights), and blooms a light pixel out round itself in the glow
      if (t.drawGlow && t.flicker > 0.01) {
        const glowAtlas = this.glowAtlas.canvas;
        ec.setTransform(1, 0, 0, 1, 0, 0);
        ec.globalCompositeOperation = 'source-over';
        ec.globalAlpha = t.flicker;
        ec.drawImage(glowAtlas, t.slot.x, t.slot.y, t.cols, t.rows, at.x, at.y, t.cols, t.rows);
        ec.globalAlpha = 1;
        gc.setTransform(1, 0, 0, 1, 0, 0);
        gc.globalCompositeOperation = 'lighter';
        gc.globalAlpha = 0.3 * t.flicker;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) gc.drawImage(glowAtlas, t.slot.x, t.slot.y, t.cols, t.rows, at.x + dx, at.y + dy, t.cols, t.rows);
        // only round it, not over it, which would wash its colours out to white
        gc.globalAlpha = 1;
        gc.globalCompositeOperation = 'destination-out';
        gc.drawImage(glowAtlas, t.slot.x, t.slot.y, t.cols, t.rows, at.x, at.y, t.cols, t.rows);
      }
      // its own lights' halos go in front of it
      world(gc);
      gc.globalCompositeOperation = 'lighter';
      for (const l of lights) if (l.owner === t.owner) this.drawHalo(gc, l);
    });
  },

  // a bright edge on the side of a character, tree or post facing the strongest light behind or beside
  // it (its front's darker from it, facing()), one light pixel wide, inside its outline
  drawRim(t, lights, f) {
    const { cell } = f;
    let best = null;
    let bestAmount = 0.08;
    for (const l of lights) {
      if (l.owner === t.owner) continue;
      const dx = l.x - t.foot.x;
      const dy = l.y - t.foot.y;
      const ground = Math.hypot(dx, dy);
      const reach = l.radius + l.width / 2;
      if (ground >= reach) continue;
      if (l.cone !== null) {
        const off = Math.abs(((Math.atan2(-dy, -dx) - l.aim + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (off > l.cone / 2) continue;
      }
      const behind = 1 - this.facing(t, dx, dy, Math.sin(Math.atan2(l.z, ground)));
      const amount = Math.max(...l.rgb) * lightFade(ground / reach) * behind;
      if (amount > bestAmount) {
        best = l;
        bestAmount = amount;
      }
    }
    const sun = f.sun;
    if (sun && f.settings.lightShadows > 0) {
      const amount = Math.max(...sun.colour) * (1 - this.facing(t, sun.toward.x, sun.toward.y, Math.sin(radians(sun.elevation)))) * 0.6;
      if (amount > bestAmount) {
        best = { x: t.foot.x + sun.toward.x * 1000, y: t.foot.y + sun.toward.y * 1000, z: 1000 * Math.tan(radians(sun.elevation)), rgb: sun.colour };
        bestAmount = amount;
      }
    }
    if (!best) return;
    // which way the light is on screen from the thing's middle, to the nearest of 8
    const mx = t.foot.x;
    const my = t.foot.y - t.height / 2;
    const angle = Math.atan2(best.y - best.z - my, best.x - mx);
    const sx = Math.round(Math.cos(angle));
    const sy = Math.round(Math.sin(angle));
    const tc = this.canvases.thing.ctx;
    const core = this.canvases.core.canvas;
    tc.setTransform(1, 0, 0, 1, 0, 0);
    tc.globalAlpha = 1;
    tc.globalCompositeOperation = 'copy';
    tc.drawImage(core, t.slot.x, t.slot.y, t.cols, t.rows, 0, 0, t.cols, t.rows);
    tc.globalCompositeOperation = 'destination-out';
    tc.drawImage(core, t.slot.x, t.slot.y, t.cols, t.rows, -sx, -sy, t.cols, t.rows);
    tc.globalCompositeOperation = 'source-in';
    const brightest = Math.max(...best.rgb, 0.001);
    tc.fillStyle = this.stored(best.rgb.map((c) => (c / brightest) * Math.min(1, bestAmount * 1.6)), Math.min(1, f.settings.lightRim / 100));
    tc.fillRect(0, 0, t.cols, t.rows);
    const lc = this.canvases.light.ctx;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'lighter';
    lc.drawImage(this.canvases.thing.canvas, 0, 0, t.cols, t.rows, (t.box.x - f.ox) / cell, (t.box.y - f.oy) / cell, t.cols, t.rows);
  },
};

// ---------- the Lights box ----------

// every light setting's row in the Lights box (LightEditor), like ATMOSPHERE_SETTINGS (atmosphere.js
// explains the parts). options is a picker of a fixed list
const LIGHT_SETTINGS = [
  { tab: 'Light', key: 'colour', label: 'Colour', colour: true, tip: 'Its colour. Lights add up like real ones: red and blue make purple, red, green and blue make white' },
  { tab: 'Light', key: 'strength', label: 'Brightness', min: 0, max: 3, step: 0.05, tip: 'How bright its middle is. Above 1 its middle gets bigger and whiter' },
  { tab: 'Light', key: 'radius', label: 'Reach', min: 16, max: 600, step: 2, unit: 'px', tip: 'How far along the ground it reaches' },
  { tab: 'Light', key: 'height', label: 'Height', min: 0, max: 200, unit: 'px', tip: 'How high it hangs. Shadows are shorter under a high light, and long and stretched from a low one' },
  { tab: 'Light', key: 'width', label: 'Spread', min: 0, max: 300, step: 2, unit: 'px', tip: 'Stretches it sideways, for long lights like a neon tube or a row of windows. 0 is a point' },
  { tab: 'Light', key: 'shadows', label: 'Shadows', tick: 'casts shadows', tip: 'Walls, buildings and anything standing block it. Untick for small glows that would cost too much' },
  { tab: 'Light', key: 'night', label: 'Night', tick: 'only on in the dark', tip: 'Fades in at dusk and out at dawn, like street lamps and windows' },
  { tab: 'Beam', key: 'cone', label: 'Beam width', min: 5, max: 360, step: 5, unit: '°', tip: 'How wide a beam it is. 360 shines all round' },
  { tab: 'Beam', key: 'aim', label: 'Points', min: 0, max: 355, step: 5, unit: '°', tip: 'Which way a beam points. 0 is right, 90 down, 180 left, 270 up. Held ones point where their holder aims' },
  { tab: 'Beam', key: 'spin', label: 'Spin', min: -360, max: 360, step: 5, unit: '°/s', tip: 'Turns it round, like a lighthouse or a police light' },
  { tab: 'Flicker', key: 'flicker', label: 'Flicker', options: { none: 'steady', fire: 'fire', candle: 'candle', neon: 'neon stutter', failing: 'failing lamp' }, tip: 'Fire is restless, candles slow, neon stutters now and then, a failing lamp goes out for a while' },
  { tab: 'Flicker', key: 'flickerAmount', label: 'Dims by', min: 0, max: 1, step: 0.05, tip: 'How much darker it gets when it flickers. 1 goes right out' },
  { tab: 'Flicker', key: 'flickerSpeed', label: 'Speed', min: 0.1, max: 5, step: 0.1, tip: 'How fast it flickers. 1 is normal' },
  { tab: 'Flicker', key: 'glow', label: 'Halo', min: 0, max: 2, step: 0.05, tip: 'How bright the glow round it is, where it hangs' },
  { tab: 'Flicker', key: 'glowSize', label: 'Halo size', min: 0, max: 60, unit: 'px', tip: 'How big the glow round it is' },
];

// the box from the map editor's Map > Lights (editormenu.js): pick a light kind and change it while
// the map shows it, then Save, or Save as a new name for a new kind, which can be placed straight away
// from the Lights tab. Cancel puts it back how it was. like atmospheres there's no rename or delete,
// since objects and maps name lights. do it by hand (the file and index.json)
const LightEditor = {
  open(name = Object.keys(LIGHT_TYPES)[0]) {
    const type = LIGHT_TYPES[name];
    if (!type) return;
    // the kind itself changes while the box is open, so everything using it shows it. this is how it
    // was, for Cancel
    const before = { ...type };
    const draft = { ...type };
    const picker = new Picker({ w: 180, choices: Object.keys(LIGHT_TYPES), value: name, label: (n) => n, art: (n, x, y, size) => drawLightChoice(n, x, y, size) });
    const nameField = new TextField({ w: 180, value: name });
    let exporting = false;
    const fields = {};
    const tabs = [{
      label: 'Light',
      rows: [
        { label: 'Light', field: picker, tip: 'Which one to change. Picking another starts on that one' },
        { label: 'Save as', field: nameField, tip: 'Saving under a new name makes a new light, placed from the Lights tab as light-<name>' },
      ],
    }];
    for (const line of LIGHT_SETTINGS) {
      fields[line.key] = atmosphereRowField(line, draft[line.key]); // atmosphere.js
      let tab = tabs.find(({ label }) => label === line.tab);
      if (!tab) tabs.push(tab = { label: line.tab, rows: [] });
      tab.rows.push({ label: line.label, field: fields[line.key], tip: line.tip });
    }
    tabs[0].rows.push({
      label: '',
      field: new Button({ w: 180, label: 'Save and export', style: 'editor', onClick: () => { exporting = true; FormBox.confirm(); } }),
      tip: 'Saves, then downloads the files of new or changed lights for lights/',
    });
    const putBack = () => {
      Object.assign(type, before);
      if (OBJECT_TYPES[`light-${name}`]?.lightMarker) Object.assign(OBJECT_TYPES[`light-${name}`], { colour: type.colour, fill: type.colour });
    };
    FormBox.open({
      title: 'Lights',
      hint: 'Right click a slider to put it back to normal',
      confirmLabel: 'Save',
      tabs,
      // the light changes on the map as you drag
      onUpdate: () => {
        if (picker.value !== name) {
          putBack();
          FormBox.close();
          this.open(picker.value);
          return;
        }
        for (const line of LIGHT_SETTINGS) {
          const value = fields[line.key].value;
          if (!line.colour || HEX_COLOUR.test(value)) draft[line.key] = value; // textfield.js
        }
        Object.assign(type, draft);
        checkLight(type);
        const marker = OBJECT_TYPES[`light-${name}`];
        if (marker?.lightMarker) Object.assign(marker, { colour: type.colour, fill: type.colour });
      },
      canConfirm: () => LIGHT_SETTINGS.every((line) => !line.colour || HEX_COLOUR.test(fields[line.key].value)) && cleanMapName(nameField.value) !== '',
      onCancel: putBack,
      onConfirm: () => {
        const saved = cleanMapName(nameField.value); // mapfile.js
        const settings = { ...draft, name: saved };
        delete settings.rgb;
        if (saved !== name) putBack();
        defineLight(saved, Object.fromEntries(Object.keys(LIGHT_DEFAULTS).map((key) => [key, settings[key]])));
        lightMarker(saved);
        fillLightsTab();
        if (exporting) DataFiles.export(['light']);
      },
    });
  },
};

// a light kind's little picture in the picker: a dark square with its glow in the middle
function drawLightChoice(name, x, y, size) {
  const type = LIGHT_TYPES[name];
  if (!type) return;
  noStroke();
  fill('#15131c');
  rect(x, y, size, size);
  const ctx = drawingContext;
  const gradient = ctx.createRadialGradient(x + size / 2, y + size / 2, 0, x + size / 2, y + size / 2, size / 2);
  for (let k = 0; k <= 4; k++) gradient.addColorStop(k / 4, rgbText(type.rgb.map((c) => c * Math.min(1, type.strength) * lightFade(k / 4))));
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, size, size);
}
