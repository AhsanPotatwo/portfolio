// shaders: effects worked out by the graphics card (WebGL) over the world, like lighting, shadows and
// screen effects. for now they're dev mode only, to try things out: [ and ] go through SHADERS (or the
// dev menu's tool), the info panel says which is on, and this browser remembers it.
//
// how it works: the game still draws everything onto its normal 2D canvas. once the world's drawn
// (before the ui), Shaders.apply() copies the canvas into a texture on a hidden WebGL canvas, runs the
// shader on every pixel of it, and draws the result back over the 2D canvas. so a shader only changes
// how the world looks, never the ui, and nothing else in the game knows it's there. with no shader on
// it does nothing at all, so it costs nothing.
//
// to add one: a line in SHADERS whose glsl (the graphics card's language, a bit like C) has a
// `vec3 effect()` giving back this pixel's colour. SHADER_COMMON goes on top of it, so it can use:
//   scene(uv)        the world as drawn, at uv (0 to 1, from the bottom left like WebGL does it)
//   v_uv             this pixel's uv
//   gamePos          this pixel in game px, (0, 0) at the top left to (960, 540), like Input.mouse
//   worldPos         this pixel in world px, so patterns can stay put on the ground as the camera moves
//   toUv(p)          game px to uv, for scene(toUv(gamePos + wobble))
//   u_time           seconds since the page loaded
//   u_zoom           the camera's zoom. multiply world sizes by it to get game px
//   u_player         the player's middle, in game px. u_health is their health, 0 to 1
//   u_ripple         the last left click: xy in game px, z how many seconds ago
//   lighting(ambient, shadows)  the light reaching this pixel from every light (Shaders.lights()) on
//                    top of ambient. multiply the scene by it. with shadows true, walls block it
//   seen(from, to)   1 if no wall is between two points in game px, 0 if one is
//   hash(p), noise(p), luma(colour)  a random 0 to 1 for p, smooth noise, and how bright a colour is
//
// the lights come from the game each frame (Shaders.lights()): the player's torch, the mouse, items on
// the ground (their rarity's colour) and glowing particles, set in SHADER_LIGHTS. walls are the tiles
// that block sight, the same rule as clearLine() (tilemap.js), sent as a texture with a pixel per tile.
//
// ponytail: one shader at a time. stacking them (lighting then bloom) needs the passes to draw into
// textures in turn (framebuffers), which would go in apply() once a real look is picked
// ponytail: shadows are hard edged and a whole tile at a time, since they're worked out on the tile
// grid. softer ones would sample a few spots round each light
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
// the localStorage key for which one's on
const SHADER_STORAGE_KEY = 'sq-dev-shader';

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
in vec2 v_uv;
out vec4 outColour;
vec2 gamePos;
vec2 worldPos;

vec3 scene(vec2 uv) { return texture(u_scene, uv).rgb; }
vec2 toUv(vec2 p) { return vec2(p.x, u_game.y - p.y) / u_game; }
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

// goes through every tile the line crosses, in order (a "DDA" grid walk). I tried stepping a third of
// a tile at a time first, but it missed corners and made the shadow edges jagged. the tile it ends in
// doesn't count, so a wall facing a light gets lit itself while the tiles behind it don't
float seen(vec2 from, vec2 to) {
  vec2 a = (from - u_wallsCorner) / u_tile;
  vec2 b = (to - u_wallsCorner) / u_tile;
  vec2 tile = floor(a);
  vec2 end = floor(b);
  vec2 dir = sign(b - a);
  // how far along the line (0 to 1) one tile across or down is, and where the next edge across and
  // down are
  vec2 across = 1.0 / max(abs(b - a), 1e-6);
  vec2 edge = mix(a - tile, tile + 1.0 - a, step(0.0, dir)) * across;
  for (int i = 0; i < 256; i++) {
    float t;
    if (edge.x < edge.y) {
      t = edge.x;
      edge.x += across.x;
      tile.x += dir.x;
    } else {
      t = edge.y;
      edge.y += across.y;
      tile.y += dir.y;
    }
    if (t >= 1.0 || tile == end) return 1.0;
    if (wallAt(tile) > 0.5) return 0.0;
  }
  return 1.0;
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
  // the hidden WebGL canvas, its context and the two textures, made the first time one's used. gl is
  // false if the browser can't do WebGL 2
  canvas: null,
  gl: null,
  sceneTexture: null,
  wallsTexture: null,
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

    const lights = this.lights(camera, map, player, aim, time);
    const lightData = new Float32Array(MAX_SHADER_LIGHTS * 4);
    const colourData = new Float32Array(MAX_SHADER_LIGHTS * 3);
    lights.forEach((l, i) => {
      lightData.set([l.x, l.y, l.radius, l.strength], i * 4);
      colourData.set(l.colour, i * 3);
    });
    const at = (name) => gl.getUniformLocation(program, name);
    const playerAt = camera.drawnPosition(player.x, player.y);
    const rippleAt = camera.drawnPosition(this.ripple.x, this.ripple.y);
    gl.uniform1i(at('u_scene'), 0);
    gl.uniform1i(at('u_walls'), 1);
    gl.uniform2f(at('u_game'), GAME_W, GAME_H);
    gl.uniform2f(at('u_camera'), camera.x + camera.shakeX, camera.y + camera.shakeY);
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
  // left one's corner is drawn. it reaches a light's radius past the screen, since a light just off
  // screen still throws shadows onto it
  walls(camera, map) {
    const view = camera.view();
    const reach = Math.ceil(Math.max(...Object.values(SHADER_LIGHTS).map((l) => l.radius)) / TILE) + 1;
    const left = map.colAt(view.left) - reach;
    const top = map.rowAt(view.top) - reach;
    const cols = map.colAt(view.right) + reach - left + 1;
    const rows = map.rowAt(view.bottom) + reach - top + 1;
    const data = new Uint8Array(cols * rows);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // like clearLine() (tilemap.js), except empty and off-map tiles don't, so the dark outside the
        // map doesn't throw shadows
        const type = map.get(left + col, top + row);
        if (type && type.solid && !type.seeThrough) data[row * cols + col] = 255;
      }
    }
    return { cols, rows, data, corner: camera.drawnPosition(left * TILE, top * TILE) };
  },

  // every light that reaches the screen, in game px, closest to the middle first, up to
  // MAX_SHADER_LIGHTS. each { x, y, radius, strength, colour }
  lights(camera, map, player, aim, time) {
    const list = [];
    const add = (settings, x, y, colour = settings.colour) => {
      const at = camera.drawnPosition(x, y);
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
