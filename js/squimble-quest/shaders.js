// shaders: effects worked out by the graphics card (WebGL 2) over the world, like lighting, shadows,
// sunlight and screen effects. for now they're dev mode only, to try things out: [ and ] go through
// SHADERS (or the dev menu's tool), the info panel says which is on, and this browser remembers it.
//
// ---------- how it works ----------
// the game still draws everything onto its normal 2D canvas, the same as with no shader. once the
// world's drawn (before the ui), Shaders.apply() copies the canvas into a texture on a hidden WebGL
// canvas, runs the shader on every pixel of it, and draws the result back over the 2D canvas. so a
// shader only changes how the world looks, never the ui, and nothing else in the game knows it's
// there. with no shader on it does nothing at all, so it costs nothing. the order each frame:
//   1. sketch.js draws the ground (tiles, objects, the dev grid, particles on the floor)
//   2. Shaders.capture('ground')  only for shaders with casters (below)
//   3. sketch.js draws the things standing on it: characters, their swings, items, arrows, flying
//      particles
//   4. Shaders.capture('things')  only for shaders with casters
//   5. sketch.js draws the rest of the world (damage numbers, dev mode's enemy routes)
//   6. Shaders.apply()  sends the walls, lights and settings, runs the shader, draws it back
//
// ---------- adding a shader ----------
// a line in SHADERS: { name, label, note, glsl }, plus uniforms and casters if it needs them.
//   name      what's remembered in localStorage. keep it the same once it's used
//   label     what the info panel and the message say, and note says a bit more in the message
//   glsl      the shader, in GLSL (the graphics card's language, a bit like C). it has to have a
//             `vec3 effect()` that gives back this pixel's colour, 0 to 1 red, green, blue. it runs
//             once for every pixel on the screen, every frame, all at the same time
//   uniforms  (optional) a function given the time in seconds, giving back its own settings as
//             { u_name: number or [2, 3 or 4 numbers] }, sent every frame. declare each one in the glsl
//             as a float or vec2/3/4 (see the sun's sunUniforms())
//   casters   (optional) true if it needs to know what's standing on the ground (thingAt() and the
//             caster list below). it costs two more copies of the canvas a frame, so only shaders
//             that use it have it
//
// SHADER_COMMON goes on top of every shader and SHADER_MAIN after it, so effect() can use:
//   scene(uv)        the world as drawn, at uv (0 to 1, from the bottom left like WebGL does it)
//   v_uv             this pixel's uv
//   gamePos          this pixel in game px, (0, 0) at the top left to (960, 540), like Input.mouse
//   worldPos         this pixel in world px, so patterns can stay put on the ground as the camera moves
//   toUv(p), toGame(w)  game px to uv, and world px to game px. scene(toUv(toGame(w))) is the colour
//                    drawn at world px w
//   u_time           seconds since the page loaded
//   u_zoom           the camera's zoom. multiply world sizes by it to get game px
//   u_player         the player's middle, in game px. u_health is their health, 0 to 1
//   u_ripple         the last left click: xy in game px, z how many seconds ago
//   lighting(ambient, shadows)  the light reaching this pixel from every light (Shaders.lights()) on
//                    top of ambient. multiply the scene by it. with shadows true, walls block it
//   seen(from, to)   1 if no wall is between two points in game px, 0 if one is
//   wallAt(t), wallAtWorld(w)  whether tile t (counted from the walls texture's corner) or the tile at
//                    world px w is a wall
//   thingAt(w)       (casters only) whether something's standing at world px w (step 3 above)
//   casterBox(i), casterFoot(i)  (casters only) for i up to u_casterCount: the box round each thing
//                    standing on the ground, and the y its feet touch the ground at, in world px
//   hash(p), noise(p), luma(colour)  a random 0 to 1 for p, smooth noise, and how bright a colour is
//
// where the data comes from:
//   lights   Shaders.lights() each frame: the player's torch, the mouse, items on the ground (their
//            rarity's colour) and glowing particles, set in SHADER_LIGHTS. one inside a wall is moved
//            out first (outOfWalls())
//   walls    Shaders.walls(): the tiles that block light (blocksLight(), the same rule as clearLine()
//            in tilemap.js), a byte per tile, round the screen
//   things   what they look like is the difference between the two captures, so anything drawn in
//            step 3 counts, and it'll follow sprites' real shapes when there are some. where each
//            one is and where it stands comes from Shaders.casters(): characters, drops, arrows and
//            flying particles
//
// the game's seen from an angle (like pokemon or undertale), not straight down, so up the screen is
// both further back and higher up. anything about height (shadows, light over walls) has to start
// from where a thing stands (casterFoot()), not where its pixels are. the Sun shader's notes explain
//
// ---------- when something's wrong ----------
// a shader that doesn't compile says why in the console (with the line number in the glsl, counting
// SHADER_COMMON's lines first) and shows a message, and the game carries on without it. Lights only
// shows just the light and shadows, which is the easiest way to see what the lighting is doing. to
// see a value, return it as a colour from effect(), like `return vec3(thingAt(worldPos) ? 1.0 : 0.0);`
//
// ---------- experimental, and plans for later ----------
// everything here is an experiment: dev mode only, nothing in the game depends on it, and any of it
// can change or go. none of this is built, but it's how I'd go about it:
//
// upright buildings (like pokemon houses, drawn standing up instead of as flat tiles). two ways,
// probably both together:
//   - as a thing: draw the house with the characters, sorted by where things stand (so you can walk
//     behind it), which makes it a caster by itself (step 3 above), and add it to Shaders.casters()
//     with its base as its foot. it'd need its own depth (a house is tiles deep, characters are
//     SHADER_SUN.depth), which can go in the caster texture's spare row 1 slots (y, z, w)
//   - as a footprint: mark its tiles as blocking with a height, like walls (a per-tile height
//     setting instead of the one SHADER_SUN.wallHeight, stored in the walls texture instead of 0 or
//     255). then torchlight, line of sight and sun shadows all treat it as a solid block
//
// light and shadow changing the game (monsters spawning in the dark, vampires burning in sunlight).
// gameplay must never read what a shader drew: it's on the graphics card (slow to read back), only
// covers the screen, changes with zoom and screen size, only exists while that shader's on, and a
// multiplayer server couldn't run it. so the game works out light itself and the shader only draws it:
//   - a world clock as game state (time of day), which the Sun shader reads instead of millis()
//   - inSunlight(map, x, y): the same check as wallShadow() in the Sun shader, in javascript, for one
//     point like a vampire's feet, using SHADER_SUN's settings so the picture and the rule agree (a
//     small test can check they match at a few points)
//   - lightLevel(map, x, y): daylight plus nearby lights (lights() already lists them), with
//     clearLine() (tilemap.js) for walls. spawning would check it on the tiles it might use
// walls and buildings would match the picture exactly since they're tiles. shadows from characters
// and items come from the drawn pixels, so for gameplay those would have to be rough boxes
//
// ponytail: one shader at a time. stacking them (lighting then bloom) needs the passes to draw into
// textures in turn (framebuffers), which would go in apply() once a real look is picked
// ponytail: torch shadows are hard edged and a whole tile at a time, since they're worked out on the
// tile grid. softer ones would sample a few spots round each light
// ponytail: lights only come from things already in the game. placed ones would come from the
// editor's Lights tab (empty for now, editor.js) into lights()

// what gives off light. radius in world px, colour 0 to 1 red, green, blue, strength how bright it is
// in the middle, and flicker how much it wavers (0 is steady)
const SHADER_LIGHTS = {
  player:   { radius: 230, colour: [1, 0.78, 0.5], strength: 1.3, flicker: 0.06 },
  mouse:    { radius: 170, colour: [0.55, 0.72, 1], strength: 1.1, flicker: 0 },
  // drops and particles use their own colour
  drop:     { radius: 70, strength: 0.9, flicker: 0 },
  particle: { radius: 40, strength: 0.6, flicker: 0 },
};
// the most lights a shader gets, the closest to the middle of the screen. MAX_LIGHTS in
// SHADER_COMMON has to match
const MAX_SHADER_LIGHTS = 32;
// the most things that cast shadows at once (Shaders.casters()), the closest to the middle of the
// screen. a burst of particles is a lot of them
const MAX_SHADER_CASTERS = 128;
// the localStorage key for which one's on
const SHADER_STORAGE_KEY = 'sq-dev-shader';

// the Sun shader: a sun off screen that rises on the left, goes over the top of the screen (behind
// everyone, since the top is further back) and sets on the right. so shadows start long along the
// ground to the right, get short and fall in front of things (down the screen) at midday, and end long
// to the left. then it starts again (it's dim at both ends, so the jump back isn't sudden). how the
// shadows are worked out is above the Sun shader in SHADERS
const SHADER_SUN = {
  // seconds from sunrise to sunset
  dayLength: 30,
  // degrees above the horizon at midday. lower makes midday shadows longer
  highest: 55,
  // how tall walls count as, in world px (their tiles are drawn flat, so the art doesn't say). a
  // shadow is as long as the height when the sun's at 45 degrees. things' heights come from their
  // outline on the screen instead
  wallHeight: 32,
  // how deep things are front to back, in world px. a thing's shadow is its outline laid on the
  // ground, so with the sun straight to the side it'd be a line without this
  depth: 8,
  // the most px of shadow for each px of height. the sun's on the horizon at sunrise, which would
  // make them endless
  longest: 3,
  // world px for each shadow pixel. 1 matches the art (a tile is 32 x 32 art pixels), 2 or 4 make
  // them chunkier. whole numbers keep them lined up with the tiles
  pixel: 1,
  // what shadow multiplies the colour by: darker, and a bit blue like light from the sky
  shade: [0.5, 0.55, 0.72],
  // the sunlight's colour low in the sky and at midday
  low: [1, 0.66, 0.45],
  midday: [1, 0.98, 0.94],
};

// the Sun shader's settings for this moment (`uniforms` in SHADERS). where it is in the day goes 0
// (sunrise) to 1 (sunset)
function sunUniforms(time) {
  const S = SHADER_SUN;
  const day = (time / S.dayLength) % 1;
  // 0 on the horizon, 1 at midday
  const up = Math.sin(Math.PI * day);
  // round from the left (PI) over the top (PI / 2) to the right (0). y is down the screen, so the top
  // is -y. shadows point the other way, away from the sun
  const around = Math.PI * (1 - day);
  const height = radians(S.highest * up);
  // dim and shadowless right at the ends, so the jump from sunset back to sunrise is hidden
  const strength = Math.min(1, up * 4);
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  return {
    u_sunDir: [-Math.cos(around), Math.sin(around)],
    u_sunStretch: Math.min(S.longest, 1 / Math.tan(Math.max(height, 0.01))),
    u_sunColour: mix(S.low, S.midday, Math.sqrt(up)).map((v) => v * (0.45 + 0.55 * strength)),
    u_shade: mix([1, 1, 1], S.shade, strength),
    u_wallHeight: S.wallHeight,
    u_depth: S.depth,
    u_shadowPixel: S.pixel,
  };
}

// draws a triangle bigger than the screen, so every pixel gets the effect. it needs no data from the
// game: gl_VertexID (0, 1, 2) makes the corners
const SHADER_VERTEX = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// the top of every shader (see the guide at the top of this file)
const SHADER_COMMON = `#version 300 es
precision highp float;
#define MAX_LIGHTS 32
uniform sampler2D u_scene;
uniform vec2 u_game;
uniform vec2 u_camera;
uniform float u_time;
uniform float u_zoom;
uniform vec2 u_player;
uniform float u_health;
uniform vec3 u_ripple;
// each light's x, y and radius in game px, and strength. then its colour
uniform vec4 u_lights[MAX_LIGHTS];
uniform vec3 u_lightColours[MAX_LIGHTS];
uniform int u_lightCount;
// the walls: a pixel per tile, 1 where it blocks light. its top left corner in game px, its size in
// tiles, and a tile's size in game px
uniform sampler2D u_walls;
uniform vec2 u_wallsCorner;
uniform vec2 u_wallsSize;
uniform float u_tile;
// casters only: the canvas just before and just after the things standing on the ground were drawn
// (Shaders.capture())
uniform sampler2D u_ground;
uniform sampler2D u_things;
// casters only: the things standing on the ground (Shaders.casters()), one column each. row 0 is the
// box round it (left, top, right, bottom, world px), row 1 x is its foot (where it touches the ground)
uniform sampler2D u_casters;
uniform int u_casterCount;
in vec2 v_uv;
out vec4 outColour;
vec2 gamePos;
vec2 worldPos;

vec3 scene(vec2 uv) { return texture(u_scene, uv).rgb; }
vec2 toUv(vec2 p) { return vec2(p.x, u_game.y - p.y) / u_game; }
// the other way to worldPos. u_camera is pixel snapped like the drawing (Camera.begin()), so world px
// land exactly where they were drawn
vec2 toGame(vec2 w) { return (w - u_camera) * u_zoom + u_game / 2.0; }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// whether tile t (counted from the walls texture's corner) blocks light. outside it nothing does
float wallAt(vec2 t) {
  if (any(lessThan(t, vec2(0))) || any(greaterThanEqual(t, u_wallsSize))) return 0.0;
  return texelFetch(u_walls, ivec2(t), 0).r;
}
bool wallAtWorld(vec2 w) { return wallAt(floor((toGame(w) - u_wallsCorner) / u_tile)) > 0.5; }

// casters only. something's standing at world px w if the canvas there changed a lot while the things
// were being drawn. a little change is something see-through, like a drop's shadow or the faint edge
// of an item's glow, which shouldn't throw a shadow of its own. off screen nothing is, since there's
// no canvas there
bool thingAt(vec2 w) {
  vec2 uv = toUv(toGame(w));
  if (any(lessThan(uv, vec2(0))) || any(greaterThan(uv, vec2(1)))) return false;
  return distance(texture(u_things, uv).rgb, texture(u_ground, uv).rgb) > 0.2;
}
// casters only. caster i's box (left, top, right, bottom) and the y its feet touch the ground at, in
// world px. go through them with for (int i = 0; i < u_casterCount; i++)
vec4 casterBox(int i) { return texelFetch(u_casters, ivec2(i, 0), 0); }
float casterFoot(int i) { return texelFetch(u_casters, ivec2(i, 1), 0).x; }

// whether a line from a to b (in tiles) gets to b's tile without going through a wall. it goes through
// every tile the line crosses, in order (a "DDA" grid walk). I tried stepping a third of a tile at a
// time first, but it missed corners and made the shadow edges jagged
float clearTo(vec2 a, vec2 b) {
  vec2 tile = floor(a);
  vec2 end = floor(b);
  vec2 dir = sign(b - a);
  // how far along the line (0 to 1) one tile across or down is, and where the next edge across and
  // down are
  vec2 across = 1.0 / max(abs(b - a), 1e-6);
  vec2 edge = mix(a - tile, tile + 1.0 - a, step(0.0, dir)) * across;
  for (int i = 0; i < 256; i++) {
    if (tile == end || min(edge.x, edge.y) >= 1.0) return 1.0;
    // going exactly through a corner: a wall on either side blocks it, or a thin line of light gets
    // between two walls that only touch at a corner
    if (abs(edge.x - edge.y) < 1e-4 && max(wallAt(tile + vec2(dir.x, 0)), wallAt(tile + vec2(0, dir.y))) > 0.5) return 0.0;
    if (edge.x < edge.y) {
      edge.x += across.x;
      tile.x += dir.x;
    } else {
      edge.y += across.y;
      tile.y += dir.y;
    }
    if (tile != end && wallAt(tile) > 0.5) return 0.0;
  }
  return 1.0;
}

// a point just inside the wall tile, on the side facing a (dir is which side, across then down),
// away from its corners. or one far away if that side faces another wall, so it never counts
vec2 sideFacing(vec2 a, vec2 tile, vec2 dir, bool down) {
  vec2 next = down ? vec2(0, dir.y) : vec2(dir.x, 0);
  if (next == vec2(0) || wallAt(tile + next) > 0.5) return vec2(-1e5);
  // a thousandth of a tile in from that side
  vec2 inside = clamp(a, tile + 0.05, tile + 0.95);
  return down ? vec2(inside.x, tile.y + 0.5 + 0.499 * dir.y) : vec2(tile.x + 0.5 + 0.499 * dir.x, inside.y);
}

// 1 if no wall is between the two points (game px). a pixel on a wall is lit all over or not at all,
// by whether from can see a side of that wall tile that faces it and isn't against another wall.
// before, each wall pixel had its own line, which let light in through a wall's other sides, so the
// walls of a thick block got lit and dark wedges in them
float seen(vec2 from, vec2 to) {
  vec2 a = (from - u_wallsCorner) / u_tile;
  vec2 b = (to - u_wallsCorner) / u_tile;
  vec2 tile = floor(b);
  if (wallAt(tile) < 0.5 || floor(a) == tile) return clearTo(a, b);
  // which way a is from the tile, across and down (0 if it's level with it)
  vec2 dir = sign(a - clamp(a, tile, tile + 1.0));
  vec2 across = sideFacing(a, tile, dir, false);
  vec2 down = sideFacing(a, tile, dir, true);
  float lit = across.x > -1e4 ? clearTo(a, across) : 0.0;
  if (down.x > -1e4) lit = max(lit, clearTo(a, down));
  return lit;
}

vec3 lighting(vec3 ambient, bool shadows) {
  vec3 light = ambient;
  for (int i = 0; i < u_lightCount; i++) {
    vec4 l = u_lights[i];
    float d = distance(gamePos, l.xy);
    if (d >= l.z) continue;
    // fades out smoothly to nothing at the radius
    float fade = 1.0 - d / l.z;
    fade *= fade;
    if (shadows) fade *= seen(l.xy, gamePos);
    light += u_lightColours[i] * l.w * fade;
  }
  return light;
}
`;

// the end of every shader, after its effect()
const SHADER_MAIN = `
void main() {
  gamePos = vec2(v_uv.x, 1.0 - v_uv.y) * u_game;
  worldPos = (gamePos - u_game / 2.0) / u_zoom + u_camera;
  outColour = vec4(clamp(effect(), 0.0, 1.0), 1.0);
}`;

// every shader, in the order [ and ] go through them. name is what's remembered, label and note show
// in the info panel and messages. the first one is none
const SHADERS = [
  { name: 'none', label: 'None', note: '', glsl: '' },

  {
    name: 'torchlight', label: 'Torchlight', note: 'night, lights from the player, mouse, items and particles',
    glsl: `
vec3 effect() {
  return scene(v_uv) * lighting(vec3(0.12, 0.14, 0.26), false);
}`,
  },

  {
    name: 'shadows', label: 'Torchlight + shadows', note: 'walls block the light',
    glsl: `
vec3 effect() {
  return scene(v_uv) * lighting(vec3(0.07, 0.08, 0.16), true);
}`,
  },

  {
    name: 'daynight', label: 'Day and night', note: 'a 40 second day, lights come on at dusk',
    glsl: `
vec3 effect() {
  // 1 at midday, 0 at midnight
  float sun = 0.5 + 0.5 * cos(u_time * 6.2832 / 40.0);
  float day = smoothstep(0.25, 0.65, sun);
  vec3 ambient = mix(vec3(0.1, 0.12, 0.26), vec3(1.0, 0.98, 0.93), day);
  // orange round sunrise and sunset
  ambient += vec3(0.35, 0.1, -0.08) * max(0.0, 1.0 - abs(sun - 0.4) * 5.0);
  vec3 lamps = lighting(vec3(0), true) * (1.0 - day);
  return scene(v_uv) * (ambient + lamps);
}`,
  },

  {
    // SHADER_SUN has its settings and sunUniforms() where the sun is.
    //
    // the game's seen from an angle (like pokemon or undertale), not straight down: up the screen is
    // both further back on the ground and higher in the air. so a character's rectangle is its body
    // standing up on its feet, and a pixel near its head is high up, not further north. the shadows
    // follow that:
    //   walls     a wall's tile is where it stands, so its shadow starts at the tile and goes away
    //             from the sun along the ground, as long as wallHeight times u_sunStretch
    //   things    each one in Shaders.casters() says where its feet touch the ground (foot). a pixel
    //             of its outline (thingAt()) foot - y px up is that high, and its shadow lands that far
    //             times u_sunStretch from the feet, away from the sun. so the shadow starts at the feet,
    //             falls in front of them (down the screen) with the sun behind (up the screen) and lies
    //             along the ground to the side with the sun to the side. u_depth is how deep things are
    //             front to back, so a shadow has some thickness even then
    //   on things a thing is shaded by a wall if the wall's shadow reaches where it stands (foot) and
    //             is taller than that bit of it, so a tall one can stick its head out of a low shadow
    // a thing's own outline isn't shaded by things, or each one would shade itself, and wall tops are
    // always in the sun.
    //
    // ponytail: objects (furniture) are drawn with the ground, before capture('ground'), so they
    // don't cast. they'd need drawing between the captures, or a height setting and a texture like
    // the walls'
    // ponytail: things only cast while they're on screen (thingAt() reads the canvas), so a long
    // shadow can pop in at the edge. walls reach past it (walls())
    // ponytail: one foot per thing, so a long arrow pointing up the screen counts its back end as
    // higher than its tip
    // ponytail: every pixel looks up to wallHeight * longest px back for walls, about 100 steps at
    // sunrise, and through every caster near it. if it's slow on a real screen, work it out once per
    // art pixel into a small texture first
    name: 'sun', label: 'Sun', note: 'rises on the left, sets on the right, walls and things cast pixel shadows from where they stand',
    casters: true,
    uniforms: sunUniforms,
    glsl: `
// which way shadows point (world px, length 1), and px of shadow per px of height
uniform vec2 u_sunDir;
uniform float u_sunStretch;
// the sunlight's colour, and what shadow multiplies it by
uniform vec3 u_sunColour;
uniform vec3 u_shade;
// SHADER_SUN's wall height, thing depth and shadow pixel size, in world px
uniform float u_wallHeight;
uniform float u_depth;
uniform float u_shadowPixel;

// the middle of the shadow pixel that world px w is in
vec2 snapped(vec2 w) { return (floor(w / u_shadowPixel) + 0.5) * u_shadowPixel; }

// whether a wall's shadow covers something standing at ground point g that's h px up. it looks back
// towards the sun: the sun's line rises 1 px for every u_sunStretch px back, so a wall that far back
// is tall enough to block it until (wallHeight - h) * stretch
bool wallShadow(vec2 g, float h) {
  float reach = (u_wallHeight - h) * u_sunStretch;
  for (float d = u_shadowPixel; d <= reach; d += u_shadowPixel) {
    if (wallAtWorld(snapped(g - u_sunDir * d))) return true;
  }
  return false;
}

// whether caster i's shadow covers ground point g. it goes through each height the caster has pixels
// at: the shadow of that height lands u_sunStretch times as far from the feet, so this works out
// which pixel of its outline would land on g, and checks it's there
bool casterShadow(int i, vec2 g) {
  vec4 box = casterBox(i);
  float foot = casterFoot(i);
  vec2 k = u_sunDir * u_sunStretch;
  float low = max(0.0, foot - box.w);
  float high = foot - box.y;
  if (high < low) return false;
  // first a quick check that g's anywhere near where its shadow could be
  vec2 a = k * low;
  vec2 b = k * high;
  if (g.x < box.x + min(a.x, b.x) - 1.0 || g.x > box.z + max(a.x, b.x) + 1.0) return false;
  if (g.y < foot - u_depth + min(a.y, b.y) - 1.0 || g.y > foot + max(a.y, b.y) + 1.0) return false;
  for (float h = low; h <= high; h += u_shadowPixel) {
    // how far behind the feet the shadow of height h would have to start to reach g
    float back = foot + k.y * h - g.y;
    if (back < 0.0 || back > u_depth) continue;
    vec2 pixel = vec2(g.x - k.x * h, foot - h);
    if (pixel.x >= box.x && pixel.x <= box.z && thingAt(snapped(pixel))) return true;
  }
  return false;
}

vec3 effect() {
  vec3 c = scene(v_uv) * u_sunColour;
  // worked out for the middle of this screen pixel's art pixel, so the whole art pixel comes out the
  // same and the shadows are as blocky as the art at any zoom or screen size
  vec2 p = snapped(worldPos);
  // the tops of walls are always in the sun
  if (wallAtWorld(p)) return c;
  if (thingAt(p)) {
    // part of a thing: where it stands and how high up this bit is, from the caster it's in
    for (int i = 0; i < u_casterCount; i++) {
      vec4 box = casterBox(i);
      float foot = casterFoot(i);
      if (p.x < box.x || p.x > box.z || p.y < box.y || p.y > box.w) continue;
      return wallShadow(vec2(p.x, foot - 0.5), max(0.0, foot - p.y)) ? c * u_shade : c;
    }
  }
  if (wallShadow(p, 0.0)) return c * u_shade;
  for (int i = 0; i < u_casterCount; i++) {
    if (casterShadow(i, p)) return c * u_shade;
  }
  return c;
}`,
  },

  {
    name: 'sight', label: 'Line of sight', note: "fog of war: grey where the player can't see",
    glsl: `
vec3 effect() {
  vec3 c = scene(v_uv);
  float near = 1.0 - smoothstep(320.0, 440.0, distance(gamePos, u_player) / u_zoom);
  float see = seen(u_player, gamePos) * near;
  vec3 hidden = vec3(luma(c)) * vec3(0.22, 0.24, 0.32);
  return mix(hidden, c, see);
}`,
  },

  {
    name: 'lightsonly', label: 'Lights only', note: 'just the light and shadows, for checking them',
    glsl: `
vec3 effect() {
  return lighting(vec3(0.03), true);
}`,
  },

  {
    name: 'bloom', label: 'Bloom', note: 'bright things glow',
    glsl: `
vec3 bright(vec2 uv) {
  vec3 c = scene(uv);
  return c * smoothstep(0.5, 0.9, luma(c));
}
vec3 effect() {
  // samples in a spiral round the pixel (the golden angle spreads them evenly), closer ones count more
  vec3 glow = vec3(0);
  float total = 0.0;
  for (int i = 0; i < 32; i++) {
    float f = float(i) / 32.0;
    float a = float(i) * 2.39996;
    vec2 offset = vec2(cos(a), sin(a)) * sqrt(f) * 18.0 * u_zoom / u_game;
    float w = 1.0 - f;
    glow += bright(v_uv + offset) * w;
    total += w;
  }
  return scene(v_uv) + glow / total * 1.5;
}`,
  },

  {
    name: 'cinematic', label: 'Cinematic', note: 'colour grade, vignette, grain, bars',
    glsl: `
vec3 effect() {
  vec3 c = scene(v_uv);
  float l = luma(c);
  // teal shadows and warm highlights, then more colour and contrast
  c *= mix(vec3(0.8, 0.97, 1.1), vec3(1.12, 0.98, 0.82), smoothstep(0.15, 0.75, l));
  c = mix(vec3(luma(c)), c, 1.2);
  c = (c - 0.5) * 1.12 + 0.5;
  vec2 d = v_uv - 0.5;
  c *= 1.0 - dot(d, d) * 1.2;
  c += (hash(gl_FragCoord.xy + fract(u_time) * 97.0) - 0.5) * 0.07;
  if (abs(v_uv.y - 0.5) > 0.43) c = vec3(0);
  return c;
}`,
  },

  {
    name: 'crt', label: 'Old TV', note: 'curved glass, scanlines, colour fringes',
    glsl: `
vec3 effect() {
  vec2 d = v_uv - 0.5;
  vec2 uv = 0.5 + d * (1.0 + dot(d, d) * 0.3);
  if (any(lessThan(uv, vec2(0))) || any(greaterThan(uv, vec2(1)))) return vec3(0);
  float split = 1.5 / u_game.x;
  vec3 c = vec3(scene(uv + vec2(split, 0)).r, scene(uv).g, scene(uv - vec2(split, 0)).b);
  c *= 0.72 + 0.28 * sin(uv.y * u_game.y * 3.1416);
  c *= 0.97 + 0.03 * sin(u_time * 55.0);
  vec2 e = uv - 0.5;
  c *= 1.0 - dot(e, e) * 1.4;
  return c * 1.3;
}`,
  },

  {
    name: 'gameboy', label: 'Game Boy', note: '4 greens with dithering',
    glsl: `
vec3 effect() {
  // 2 game px dots, coloured by the scene in their middle
  vec2 cell = floor(gamePos / 2.0);
  vec3 c = scene(toUv(cell * 2.0 + 1.0));
  // a 4 x 4 bayer pattern nudges each dot up or down a little, so in between shades come out as a mix
  float bayer[16] = float[](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  int i = int(mod(cell.x, 4.0)) + int(mod(cell.y, 4.0)) * 4;
  float l = clamp(luma(c) * 1.15 + (bayer[i] / 16.0 - 0.5) * 0.3, 0.0, 0.999);
  vec3 greens[4] = vec3[](vec3(0.06, 0.22, 0.06), vec3(0.19, 0.38, 0.19), vec3(0.55, 0.67, 0.06), vec3(0.61, 0.74, 0.06));
  return greens[int(l * 4.0)];
}`,
  },

  {
    name: 'ink', label: 'Ink outlines', note: 'cartoon: flat colours, dark edges',
    glsl: `
vec3 effect() {
  // how fast the brightness changes round this pixel (a sobel filter). edges are where it jumps
  vec2 px = 1.0 / u_game;
  float tl = luma(scene(v_uv + px * vec2(-1, 1))), t = luma(scene(v_uv + px * vec2(0, 1))), tr = luma(scene(v_uv + px * vec2(1, 1)));
  float l = luma(scene(v_uv + px * vec2(-1, 0))), r = luma(scene(v_uv + px * vec2(1, 0)));
  float bl = luma(scene(v_uv + px * vec2(-1, -1))), b = luma(scene(v_uv + px * vec2(0, -1))), br = luma(scene(v_uv + px * vec2(1, -1)));
  float gx = tr + 2.0 * r + br - tl - 2.0 * l - bl;
  float gy = tl + 2.0 * t + tr - bl - 2.0 * b - br;
  float edge = smoothstep(0.2, 0.5, length(vec2(gx, gy)));
  vec3 c = floor(scene(v_uv) * 5.0 + 0.5) / 5.0;
  return mix(c, vec3(0.06, 0.04, 0.1), edge);
}`,
  },

  {
    name: 'underwater', label: 'Underwater', note: 'wobble and caustics, stuck to the ground',
    glsl: `
vec3 effect() {
  vec2 wobble = vec2(sin(gamePos.y * 0.04 + u_time * 1.7), cos(gamePos.x * 0.035 + u_time * 1.3)) * 2.5 * u_zoom;
  vec3 c = scene(toUv(gamePos + wobble));
  // caustics: the bright wobbly lines light makes through waves, where two moving noises are about
  // the same
  vec2 p = worldPos * 0.02;
  float n = noise(p + vec2(u_time * 0.3, u_time * 0.2)) - noise(p * 1.3 - u_time * 0.25 + 4.0);
  float caustic = pow(1.0 - min(1.0, abs(n) * 4.0), 6.0);
  c = c * vec3(0.5, 0.78, 1.0) + caustic * vec3(0.22, 0.32, 0.36);
  return mix(c, vec3(0.04, 0.18, 0.32), 0.2);
}`,
  },

  {
    name: 'rain', label: 'Rain storm', note: 'falling rain and lightning every 9 seconds',
    glsl: `
vec3 effect() {
  vec3 c = scene(v_uv) * vec3(0.55, 0.6, 0.72);
  // streaks: columns 3 px wide, slanted by the wind, each with its own speed, length and gap. only
  // some columns have rain in them at a time
  vec2 p = vec2(gamePos.x + gamePos.y * 0.3, gamePos.y);
  float column = floor(p.x / 3.0);
  float r = hash(vec2(column, 7.3));
  float stream = (p.y - u_time * (650.0 + r * 350.0)) / (90.0 + r * 120.0) + r * 10.0;
  float drop = step(0.75, hash(vec2(column, floor(stream))));
  c += drop * smoothstep(0.86, 1.0, fract(stream)) * 0.35 * vec3(0.75, 0.82, 1.0);
  // lightning: a bright flash, then a weaker second one
  float t = mod(u_time, 9.0);
  float flash = exp(-t * 14.0) + 0.6 * exp(-max(0.0, t - 0.22) * 12.0) * step(0.22, t);
  return mix(c, scene(v_uv) * 1.5 + 0.15, flash);
}`,
  },

  {
    name: 'health', label: 'Low health', note: 'greyer and a heartbeat as health drops. get hit to see it',
    glsl: `
vec3 effect() {
  float hurt = 1.0 - u_health;
  float beat = pow(0.5 + 0.5 * sin(u_time * mix(3.0, 10.0, hurt)), 6.0);
  vec2 d = v_uv - 0.5;
  // red and blue pulled apart, more as it beats
  vec2 split = d * hurt * (0.01 + beat * 0.01);
  vec3 c = vec3(scene(v_uv + split).r, scene(v_uv).g, scene(v_uv - split).b);
  c = mix(c, vec3(luma(c)), hurt * 0.85);
  float edge = smoothstep(0.25, 0.75, length(d * vec2(1.6, 1.0)));
  return mix(c, vec3(0.55, 0.0, 0.04), edge * hurt * (0.55 + 0.45 * beat));
}`,
  },

  {
    name: 'shockwave', label: 'Shockwave', note: 'a ripple from wherever you click',
    glsl: `
vec3 effect() {
  float age = u_ripple.z;
  vec2 d = gamePos - u_ripple.xy;
  float dist = length(d);
  float ring = 1.0 - smoothstep(0.0, 16.0 * u_zoom, abs(dist - age * 520.0 * u_zoom));
  float strength = ring * (1.0 - smoothstep(0.0, 0.7, age));
  vec2 push = dist > 0.0 ? d / dist * strength * 12.0 * u_zoom : vec2(0);
  return scene(toUv(gamePos - push)) + strength * 0.12;
}`,
  },

  {
    name: 'nightvision', label: 'Night vision', note: 'goggles: green, grainy, two round lenses',
    glsl: `
vec3 effect() {
  float l = luma(scene(v_uv)) * 1.4 + 0.04;
  l += (hash(gl_FragCoord.xy + fract(u_time * 7.0) * 91.0) - 0.5) * 0.2;
  l *= 0.9 + 0.1 * sin(gamePos.y * 1.6 + u_time * 9.0);
  vec2 p = (gamePos - u_game / 2.0) / u_game.y;
  float lens = min(length(p - vec2(-0.24, 0)), length(p - vec2(0.24, 0)));
  l *= 1.0 - smoothstep(0.4, 0.43, lens);
  return vec3(0.15, 1.0, 0.25) * l;
}`,
  },
];

const Shaders = {
  // which SHADERS entry is on
  current: 0,
  // the hidden WebGL canvas, its context and the textures, made the first time one's used. gl is
  // false if the browser can't do WebGL 2. ground and things are the captures (capture())
  canvas: null,
  gl: null,
  sceneTexture: null,
  wallsTexture: null,
  groundTexture: null,
  thingsTexture: null,
  // the things standing on the ground, for casters shaders (casters())
  castersTexture: null,
  // compiled programs by SHADERS name, false for ones that didn't compile
  programs: {},
  // the last left click in world px, and when (seconds)
  ripple: { x: 0, y: 0, time: -100 },

  // called once from setup()
  init() {
    try {
      const name = localStorage.getItem(SHADER_STORAGE_KEY);
      this.current = Math.max(0, SHADERS.findIndex((shader) => shader.name === name));
    } catch (e) {}
  },

  // step 1 is the next one, -1 the one before
  next(step) {
    this.current = (this.current + step + SHADERS.length) % SHADERS.length;
    const shader = SHADERS[this.current];
    try { localStorage.setItem(SHADER_STORAGE_KEY, shader.name); } catch (e) {}
    showMessage(`Shader: ${shader.label}${shader.note ? `  (${shader.note})` : ''}`); // hud.js
  },

  // copies the canvas as it is now, for shaders with casters. sketch.js calls it with 'ground' just
  // before the things standing on the ground are drawn and 'things' just after, so thingAt() can tell
  // what changed. it does nothing for any other shader
  capture(which) {
    if (!Debug.enabled || !SHADERS[this.current].casters) return;
    const gl = this.setUp();
    if (!gl) return;
    // units 2 and 3, next to the scene's 0 and the walls' 1 (apply())
    gl.activeTexture(which === 'ground' ? gl.TEXTURE2 : gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, which === 'ground' ? this.groundTexture : this.thingsTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, drawingContext.canvas);
  },

  // every frame, after the world's drawn and gameCamera.end() (sketch.js). aim is the mouse in world
  // px, or null
  apply(camera, map, player, aim) {
    if (!Debug.enabled || this.current === 0) return;
    const shader = SHADERS[this.current];
    const gl = this.setUp();
    const program = gl && this.program(shader);
    if (!program) return;
    const time = millis() / 1000;
    if (aim && Input.mousePressed('left')) this.ripple = { x: aim.x, y: aim.y, time };

    // the same size as the real canvas, which is bigger than 960 x 540 on sharp screens
    const main = drawingContext.canvas;
    if (this.canvas.width !== main.width || this.canvas.height !== main.height) {
      this.canvas.width = main.width;
      this.canvas.height = main.height;
    }
    gl.viewport(0, 0, main.width, main.height);
    gl.useProgram(program);

    // the canvas comes in upside down for WebGL, so it's flipped. the walls aren't, so row 0 is the
    // top row like texelFetch() expects
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, main);
    const walls = this.walls(camera, map);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.wallsTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, walls.cols, walls.rows, 0, gl.RED, gl.UNSIGNED_BYTE, walls.data);
    // a column per caster (casterBox() and casterFoot() read it), as exact numbers (floats) rather
    // than 0 to 255 like a picture
    const casters = shader.casters ? this.casters(camera, map, player) : [];
    const width = Math.max(1, casters.length);
    const casterData = new Float32Array(width * 2 * 4);
    casters.forEach((c, i) => {
      casterData.set([c.left, c.top, c.right, c.bottom], i * 4);
      casterData[(width + i) * 4] = c.foot;
    });
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.castersTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, 2, 0, gl.RGBA, gl.FLOAT, casterData);

    const lights = this.lights(camera, map, player, aim, time);
    const lightData = new Float32Array(MAX_SHADER_LIGHTS * 4);
    const colourData = new Float32Array(MAX_SHADER_LIGHTS * 3);
    lights.forEach((l, i) => {
      lightData.set([l.x, l.y, l.radius, l.strength], i * 4);
      colourData.set(l.colour, i * 3);
    });
    const at = (name) => gl.getUniformLocation(program, name);
    // Line of sight looks from here, so it can't see through a wall the player's against either
    const playerOut = this.outOfWalls(map, player.x, player.y);
    const playerAt = camera.drawnPosition(playerOut.x, playerOut.y);
    const rippleAt = camera.drawnPosition(this.ripple.x, this.ripple.y);
    gl.uniform1i(at('u_scene'), 0);
    gl.uniform1i(at('u_walls'), 1);
    gl.uniform1i(at('u_ground'), 2);
    gl.uniform1i(at('u_things'), 3);
    gl.uniform1i(at('u_casters'), 4);
    gl.uniform1i(at('u_casterCount'), casters.length);
    gl.uniform2f(at('u_game'), GAME_W, GAME_H);
    // pixel snapped like Camera.begin(), so worldPos is exactly where things were drawn
    gl.uniform2f(at('u_camera'), camera.pixelSnap(camera.x + camera.shakeX), camera.pixelSnap(camera.y + camera.shakeY));
    gl.uniform1f(at('u_time'), time);
    gl.uniform1f(at('u_zoom'), camera.zoom);
    gl.uniform2f(at('u_player'), playerAt.x, playerAt.y);
    gl.uniform1f(at('u_health'), constrain(player.health / player.maxHealth, 0, 1));
    gl.uniform3f(at('u_ripple'), rippleAt.x, rippleAt.y, time - this.ripple.time);
    gl.uniform4fv(at('u_lights'), lightData);
    gl.uniform3fv(at('u_lightColours'), colourData);
    gl.uniform1i(at('u_lightCount'), lights.length);
    gl.uniform2f(at('u_wallsCorner'), walls.corner.x, walls.corner.y);
    gl.uniform2f(at('u_wallsSize'), walls.cols, walls.rows);
    gl.uniform1f(at('u_tile'), TILE * camera.zoom);
    // the shader's own settings (uniforms in SHADERS): a number is a float, a list of 2 to 4 a vec
    for (const [name, value] of Object.entries(shader.uniforms?.(time) ?? {})) {
      const values = [value].flat();
      gl[`uniform${values.length}fv`](at(name), values);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 'copy' swaps the canvas for the result instead of drawing it on top
    const ctx = drawingContext;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(this.canvas, 0, 0);
    ctx.restore();
  },

  // makes the WebGL canvas and textures the first time. gives back the context, or false if the
  // browser can't
  setUp() {
    if (this.gl !== null) return this.gl;
    this.canvas = document.createElement('canvas');
    // preserveDrawingBuffer keeps the result around until drawImage() copies it
    const gl = this.canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
    this.gl = gl || false;
    if (!gl) {
      showMessage("This browser can't do WebGL 2, so there are no shaders");
      return false;
    }
    const texture = (filter) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.sceneTexture = texture(gl.LINEAR);
    this.wallsTexture = texture(gl.NEAREST);
    this.groundTexture = texture(gl.NEAREST);
    this.thingsTexture = texture(gl.NEAREST);
    this.castersTexture = texture(gl.NEAREST);
    // rows of the walls texture are any number of bytes long, not a multiple of 4
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    return gl;
  },

  // compiles a shader the first time it's used. a broken one says why in the console and stays off
  program(shader) {
    if (shader.name in this.programs) return this.programs[shader.name];
    const gl = this.gl;
    const compile = (type, source) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    try {
      const program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER, SHADER_VERTEX));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, SHADER_COMMON + shader.glsl + SHADER_MAIN));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      this.programs[shader.name] = program;
    } catch (e) {
      console.warn(`The shader "${shader.name}" didn't compile:\n${e.message}`);
      showMessage(`The shader "${shader.label}" didn't compile, the console says why`);
      this.programs[shader.name] = false;
    }
    return this.programs[shader.name];
  },

  // the tiles round the screen that block light, a byte each (255 if it blocks), plus where the top
  // left one's corner is drawn. it reaches past the screen as far as the biggest light or the longest
  // sun shadow, since a wall just off screen still throws shadows onto it
  walls(camera, map) {
    const view = camera.view();
    const furthest = Math.max(...Object.values(SHADER_LIGHTS).map((l) => l.radius), SHADER_SUN.wallHeight * SHADER_SUN.longest);
    const reach = Math.ceil(furthest / TILE) + 1;
    const left = map.colAt(view.left) - reach;
    const top = map.rowAt(view.top) - reach;
    const cols = map.colAt(view.right) + reach - left + 1;
    const rows = map.rowAt(view.bottom) + reach - top + 1;
    const data = new Uint8Array(cols * rows);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (this.blocksLight(map, left + col, top + row)) data[row * cols + col] = 255;
      }
    }
    return { cols, rows, data, corner: camera.drawnPosition(left * TILE, top * TILE) };
  },

  // the things standing on the ground, for casters shaders: each { left, top, right, bottom, foot },
  // the box round what's drawn of it and the y its feet touch the ground at, in world px. what it
  // looks like comes from the canvas (thingAt()), so this only says where each one is and where it
  // stands. a new kind of thing that should cast goes here. only ones near the screen, the
  // MAX_SHADER_CASTERS closest to its middle. enemies, npcs and arrows are the game's (sketch.js)
  casters(camera, map, player) {
    const view = camera.view();
    // a long shadow reaches this far onto the screen from something off it
    const margin = SHADER_SUN.wallHeight * SHADER_SUN.longest;
    const list = [];
    const add = (left, top, right, bottom, foot) => {
      if (right < view.left - margin || left > view.right + margin || bottom < view.top - margin || top > view.bottom + margin) return;
      list.push({ left, top, right, bottom, foot });
    };
    for (const c of [player, ...enemies, ...npcs]) {
      // its feet are the bottom of its body (Character.bodyBox()). a hit squashes it a quarter wider
      const foot = c.y + c.h / 2;
      const half = c.w * 0.65;
      // a swing reaches round its middle, so the box grows to hold it. it's still held from the feet
      const reach = c.swing ? c.swing.weapon.reach : 0;
      add(c.x - Math.max(half, reach), Math.min(foot - c.h, c.y - reach), c.x + Math.max(half, reach), Math.max(foot, c.y + reach), foot);
    }
    for (const drop of map.drops) {
      // the item floats above its landing spot, glow and all (Drops.draw() in inventory.js)
      const spot = Drops.where(drop);
      const top = spot.y - 16 - spot.height - 3 - GLOW_PIXEL_SIZE;
      add(spot.x - GLOW_PIXEL_SIZE, top, spot.x + GLOW_PIXEL_SIZE, spot.y + 3, spot.y);
    }
    for (const arrow of arrows) {
      // drawn round its tip, height px above its floor spot (Arrow.draw() in weapons.js)
      const r = ARROW.length + 4;
      add(arrow.x - r, arrow.y - arrow.height - r, arrow.x + r, arrow.y - arrow.height + r, arrow.y);
    }
    for (const p of Particles.list) {
      // ones on the floor are drawn with the ground, so they don't cast. flying ones are drawn z px
      // above their floor spot (Particles.drawOne() in particles.js), growing up to their endSize
      if (p.z <= 0) continue;
      const half = p.size * Math.max(1, p.effect.endSize / 100) / 2 + 1;
      add(p.x - half, p.y - p.z - half, p.x + half, p.y - p.z + half, p.y);
    }
    const middle = (c) => ((c.left + c.right) / 2 - camera.x) ** 2 + (c.foot - camera.y) ** 2;
    return list.sort((a, b) => middle(a) - middle(b)).slice(0, MAX_SHADER_CASTERS);
  },

  // like clearLine() (tilemap.js), except empty and off-map tiles don't, so the dark outside the map
  // doesn't throw shadows
  blocksLight(map, col, row) {
    const type = map.get(col, row);
    return Boolean(type && type.solid && !type.seeThrough);
  },

  // a light inside a wall shines out of every open side of it, so through the wall. the player's
  // middle is above their feet, so it's in the wall when they walk up against one, and the mouse can
  // be over one. this moves the point (world px) just outside the wall's nearest open side. in the
  // middle of a block, with no open side, it stays put and the walls round it keep the light in
  outOfWalls(map, x, y) {
    const col = map.colAt(x);
    const row = map.rowAt(y);
    if (!this.blocksLight(map, col, row)) return { x, y };
    const left = col * TILE;
    const top = row * TILE;
    // each side: how far away it is, and the point just past it
    const sides = [
      [-1, 0, x - left, { x: left - 0.5, y }],
      [1, 0, left + TILE - x, { x: left + TILE + 0.5, y }],
      [0, -1, y - top, { x, y: top - 0.5 }],
      [0, 1, top + TILE - y, { x, y: top + TILE + 0.5 }],
    ].filter(([dc, dr]) => !this.blocksLight(map, col + dc, row + dr));
    if (sides.length === 0) return { x, y };
    return sides.reduce((a, b) => (b[2] < a[2] ? b : a))[3];
  },

  // every light that reaches the screen, in game px, closest to the middle first, up to
  // MAX_SHADER_LIGHTS. each { x, y, radius, strength, colour }
  lights(camera, map, player, aim, time) {
    const list = [];
    const add = (settings, x, y, colour = settings.colour) => {
      const out = this.outOfWalls(map, x, y);
      const at = camera.drawnPosition(out.x, out.y);
      const radius = settings.radius * camera.zoom;
      if (at.x < -radius || at.x > GAME_W + radius || at.y < -radius || at.y > GAME_H + radius) return;
      // two waves that don't line up, so it wavers without a clear rhythm
      const flicker = 1 + settings.flicker * (Math.sin(time * 11) + Math.sin(time * 17.3));
      list.push({ x: at.x, y: at.y, radius, strength: settings.strength * flicker, colour });
    };
    add(SHADER_LIGHTS.player, player.x, player.y);
    if (aim && Input.focused) add(SHADER_LIGHTS.mouse, aim.x, aim.y);
    for (const drop of map.drops) {
      const spot = Drops.where(drop); // inventory.js
      const [r, g, b] = itemRarity(drop.item).fill.levels; // items.js
      add(SHADER_LIGHTS.drop, spot.x, spot.y - spot.height, [r / 255, g / 255, b / 255]);
    }
    for (const p of Particles.list) {
      if (!p.effect.glow) continue;
      // p.colour is 'rgb(r, g, b)' (particles.js)
      const [r, g, b] = p.colour.match(/\d+/g).map(Number);
      add(SHADER_LIGHTS.particle, p.x, p.y - p.z, [r / 255, g / 255, b / 255]);
    }
    const middle = (l) => (l.x - GAME_W / 2) ** 2 + (l.y - GAME_H / 2) ** 2;
    return list.sort((a, b) => middle(a) - middle(b)).slice(0, MAX_SHADER_LIGHTS);
  },
};
