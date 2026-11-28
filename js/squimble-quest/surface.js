// the surface of liquids (tiles with sink, tiles.js), drawn a picture pixel at a time so it sits with
// the 16 px art. TileMap.drawTiles() (tilemap.js) calls Surface.draw() after the plain tiles and what
// shows under the dual grid pieces' edges, and before the pieces, so the ground's ragged edge lies over
// it like a bank over water. it covers the liquid's tiles and the bits of liquid showing under the
// ground's edges round them (dualUnder() in dualgrid.js), and finds the ground's real edge by drawing
// the pieces into a mask of its own (shore()), so everything at the shore follows the art's pixels
// rather than the tiles' straight edges. on it, in each liquid's own colours (colour and surfaceColour):
//   - the bank's shade: the ground's edge cast a few px down onto the liquid below it, so it's always
//     right up against the ground, round its corners too. seen through the moving surface, its edge
//     wavers a px up and down
//   - foam lapping at the shore: a broken line that comes in to the ground's edge and goes back out,
//     a bit of shore at a time, so it never reads as an outline
//   - glints: a short light dash here and there where a wavelet catches the light, gone in a moment.
//     fewer where it's dim, none in the dark
//   - reflections: lamps, fires and neon mirrored in it, below where they hang, as a wobbling column
//     of dashes that come and go (a glitter path), in their own colour. gone by day, outshone
//   - wakes (wakes.js) and ripples (floor particles with onLiquid and the ripple shape, particles.js)
//   - splashes where particles land in it (ParticleSystem.fallIn(), particles.js): a little ring
//     that opens and breaks up, and for ones that spread through it (blood) a cloud of their colour
//     that grows and crumbles away. seen through the liquid, so none in ones you can't see into.
//     how big and how long are the effect's (its Liquids tab)
//   - a ring round each floating particle where it sits in the surface, lighter while it's jostled,
//     and flickering bright round burning ones
//   - sizzling where particles land in a hot liquid (inHot): a few bright px spitting for a moment
//
// how lit each bit is comes from the lights and sky of the last light map (lightNear(), lighting.js),
// and with no lighting it's daylight. the light map adds what it gives back (lightUp()): the sky's
// light, so liquids stay a touch brighter than the land as it gets dark, and the reflections' light,
// so they shine in the dark. all of it's SURFACE_LIGHT, and Shine on a liquid's tile turns it down.
//
// a map's particles are Particles (particles.js), or its own system if it has one (map.particles,
// like the particle editor's preview)
// nothing's see-through or smoothed: every pixel is one of a few flat colours mixed from the liquid's
// two (palette()), and things fade by breaking up into dashes rather than going see-through. only for
// show, like particles

const SURFACE = {
  // picture px of shade under the ground's edge, a px less here and there, and how dark, as a part of
  // the liquid's colour
  bank: 3,
  bankShade: 0.82,
  // foam laps between these many picture px out from the ground's edge. lapTime is about how many
  // seconds one wave takes, and foam how much of the shore has some at once
  foamNear: 0,
  foamFar: 3,
  lapTime: 3.4,
  foam: 0.4,
  // seconds between glints on each tile (each tile its own, somewhere between) and how long one shows
  glintEvery: [2.5, 7],
  glintFor: 0.8,
  // seconds a splash's ring lasts. at most splashes showing at once (a big fight in a lake), the
  // oldest go first. a cloud's size and time are its effect's (cloudSize, cloudTime)
  ringFor: 0.5,
  splashes: 300,
  // seconds a sizzle spits for, and how many bright px at once
  sizzleFor: 0.4,
  sizzleSpits: 4,
  // more liquid tiles on screen than this (zoomed right out) leaves the surface plain. a picture px is
  // under a screen px by then, and the layer would be big for nothing
  maxTiles: 8000,
};

// how liquids react to light (the top of the file). light here is how much reaches a spot, about 0.4
// for moonlight, 1.5 for a sunny midday and 1 near a lamp (lightNear(), lighting.js)
const SURFACE_LIGHT = {
  // glints start showing at the first light and are all there by the second
  glints: [0.3, 0.9],
  // reflections: the most at once, the closest first. a light's is brightness times (night - day times
  // the daylight there), so a lamp's shows at night, faintly at dusk and not at all by day. tall is
  // picture px down from the mirrored light, from a light on the ground to one high (px up) or
  // higher, and a part of that above. it's streaks across where wave fronts face you, about crests px
  // apart, rolling down roll crests a second, each wide picture px either side (plus half a bar) at
  // most, wobbling up to wobble px at speed, changing flicker times a second, and longer ones broken
  // into dashes about dash px long. light is how much light
  // each streak adds to the light map, and tint how much of the light's colour it's painted in, from
  // the middle (over the surface's whitest) to the ends
  reflect: { most: 24, night: 1.25, day: 0.85, tall: [4, 14], high: 90, above: 0.3, crests: 2.2, roll: 0.8, wide: 2.5, wobble: 1.2, speed: 2.2, flicker: 4, dash: 5, light: 1.4, tint: [0.45, 0.85] },
  // how much of the sky's light it gives back, and of the sun's or moon's on top
  sky: 0.35,
  sun: 0.4,
  // picture px the bank's shade wavers up and down, and how quickly
  waver: 1,
  waverSpeed: 1.1,
};

// the size of a tile in picture px
const SURFACE_ART = TILE / ART_SCALE; // config.js

const Surface = {
  // the layer (a picture px a pixel), its pixels, and the liquid tiles it covers this frame
  canvas: null,
  pixels: null,
  palettes: new Map(),
  // where particles landed in a liquid (splash())
  splashes: [],

  // the surface of every liquid tile from firstCol, firstRow to lastCol, lastRow, in screen positions
  // (inside drawTiles()'s resetMatrix()). x(half) and y(half) are where half tile edges land on screen
  draw(map, firstCol, lastCol, firstRow, lastRow, x, y) {
    // the box round the liquid tiles on screen, and a tile more all round for the ground whose edges
    // hang over them
    let col0 = Infinity, col1 = -Infinity, row0 = Infinity, row1 = -Infinity;
    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = firstCol; col <= lastCol; col++) {
        if (!map.get(col, row)?.sink) continue;
        col0 = Math.min(col0, col);
        col1 = Math.max(col1, col);
        row0 = Math.min(row0, row);
        row1 = Math.max(row1, row);
      }
    }
    this.drawn = null;
    if (col0 > col1) return;
    col0 = Math.max(firstCol, col0 - 1);
    col1 = Math.min(lastCol, col1 + 1);
    row0 = Math.max(firstRow, row0 - 1);
    row1 = Math.min(lastRow, row1 + 1);
    const cw = col1 - col0 + 1;
    const ch = row1 - row0 + 1;
    if (cw * ch > SURFACE.maxTiles) return;
    this.begin(cw * SURFACE_ART, ch * SURFACE_ART);
    this.ox = col0 * SURFACE_ART;
    this.oy = row0 * SURFACE_ART;
    this.shore(map, col0, row0, cw, ch);
    const now = millis() / 1000;
    this.light(map, col0, row0, cw, ch);
    this.bank(now);
    for (const way of SURFACE_WAYS) this.foam(way, now);
    for (let row = row0; row <= row1; row++) {
      for (let col = col0; col <= col1; col++) {
        const type = map.get(col, row);
        if (type?.sink) this.glint(col, row, now, type);
      }
    }
    this.reflections(now);
    for (const s of this.splashes) if (s.cloud) this.cloud(s, now - s.born);
    for (const s of this.splashes) {
      this.ring(s, now - s.born);
      if (s.sizzle) this.sizzle(s, now - s.born);
    }
    Wakes.draw({ left: col0 * TILE, right: (col1 + 1) * TILE, top: row0 * TILE, bottom: (row1 + 1) * TILE }, this); // wakes.js
    for (const p of (map.particles ?? Particles).list) {
      if (onSurface(p)) this.ripple(p); // particles.js
      else if (p.floating) this.floating(p);
    }

    this.canvas.getContext('2d').putImageData(this.image, 0, 0);
    const ctx = drawingContext;
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    const left = x(2 * col0);
    const top = y(2 * row0);
    ctx.drawImage(this.canvas, left, top, x(2 * col1 + 2) - left, y(2 * row1 + 2) - top);
    ctx.imageSmoothingEnabled = smooth;
    this.drawn = map;
  },

  // works out where the liquid shows in the box (cw x ch tiles from col0, row0): this.quarters, the
  // liquid in each quarter tile (its own on a liquid tile, or what shows under the ground's edges,
  // dualUnder() in dualgrid.js), and this.water, 1 for every picture px where the liquid shows, which
  // is those quarters less the dual grid pieces' pixels. the pieces are drawn into a mask by their own
  // drawing code (drawDualCorner()), so it's the art's real edge. kept while the tiles stay the same
  shore(map, col0, row0, cw, ch) {
    const key = [col0, row0, cw, ch];
    for (let row = row0 - 1; row <= row0 + ch; row++) {
      for (let col = col0 - 1; col <= col0 + cw; col++) {
        const type = map.get(col, row);
        key.push(type, type?.dualTiles);
      }
    }
    if (this.shoreKey?.length === key.length && this.shoreKey.every((k, i) => k === key[i])) return;
    this.shoreKey = key;
    const half = SURFACE_ART / 2;
    this.qw = cw * 2;
    this.quarters = new Array(cw * 2 * ch * 2).fill(null);
    let edges = false;
    for (let row = row0; row < row0 + ch; row++) {
      for (let col = col0; col < col0 + cw; col++) {
        const type = map.get(col, row);
        if (type?.dualTiles) edges = true;
        for (let q = 0; q < 4; q++) {
          const qx = q % 2;
          const qy = q >> 1;
          let liquid = type?.sink ? type : null;
          if (!liquid && type?.dualTiles) {
            const under = dualUnder(map, col + qx, row + qy); // dualgrid.js
            if (under?.sink) liquid = under;
          }
          this.quarters[((row - row0) * 2 + qy) * this.qw + (col - col0) * 2 + qx] = liquid;
        }
      }
    }
    const { w, h } = this;
    this.water = new Uint8Array(w * h);
    let alpha = null;
    if (edges) {
      // the pieces at a picture px a pixel, from the box's top left
      if (this.mask?.width !== w || this.mask?.height !== h) {
        this.mask?.remove();
        this.mask = lightGraphics(w, h); // lighting.js
      }
      const ax = (h2) => (h2 * half) - this.ox;
      const ay = (h2) => (h2 * half) - this.oy;
      drawingInto(this.mask, () => {
        clear();
        push();
        resetMatrix();
        for (let row = row0; row <= row0 + ch; row++) {
          for (let col = col0; col <= col0 + cw; col++) drawDualCorner(map, col, row, ax, ay, null, 'pieces');
        }
        pop();
      });
      alpha = this.mask.drawingContext.getImageData(0, 0, w, h).data;
    }
    for (let ly = 0; ly < h; ly++) {
      for (let lx = 0; lx < w; lx++) {
        const i = ly * w + lx;
        if (this.quarters[Math.floor(ly / half) * this.qw + Math.floor(lx / half)] && !(alpha && alpha[i * 4 + 3] >= 128)) this.water[i] = 1;
      }
    }
  },

  // how lit the box is (cw x ch tiles from col0, row0) at every tile's corners (lightNear() in
  // lighting.js), by the lights and sky of the last light map on this map (Lighting.frame). none with
  // no lighting, which is daylight (litAt())
  light(map, col0, row0, cw, ch) {
    const f = typeof Lighting === 'undefined' ? null : Lighting.frame;
    this.frame = f?.map === map && f.lights ? f : null;
    if (!this.frame) return;
    this.gw = cw + 1;
    this.grid = new Float32Array((cw + 1) * (ch + 1));
    for (let r = 0; r <= ch; r++) {
      for (let c = 0; c <= cw; c++) this.grid[r * this.gw + c] = Math.max(...lightNear(f, (col0 + c) * TILE, (row0 + r) * TILE));
    }
    // the sky and sun's light alone, which washes out reflections by day
    this.daylight = Math.max(...f.ambient.map((c, i) => c + (f.sky.sun?.[i] ?? 0)));
  },

  // how lit picture px lx, ly in the box is, blended between its tile's corners: 0 at or under the
  // first light of [from, to], 1 at or over the second. 1 with no lighting
  litAt(lx, ly, [from, to]) {
    if (!this.frame) return 1;
    const gx = Math.max(0, Math.min(this.gw - 1.001, lx / SURFACE_ART));
    const gy = Math.max(0, Math.min(this.grid.length / this.gw - 1.001, ly / SURFACE_ART));
    const c = Math.floor(gx);
    const r = Math.floor(gy);
    const fx = gx - c;
    const fy = gy - r;
    const g = this.grid;
    const at = r * this.gw + c;
    const top = g[at] + (g[at + 1] - g[at]) * fx;
    const bottom = g[at + this.gw] + (g[at + this.gw + 1] - g[at + this.gw]) * fx;
    return Math.max(0, Math.min(1, (top + (bottom - top) * fy - from) / (to - from)));
  },

  // reflections (the top of the file) of the last light map's lights. a light hanging z px up is
  // mirrored z px below its spot. each dash is kept (mirrored) for lightUp() to light
  reflections(now) {
    this.mirrored = [];
    const f = this.frame;
    if (!f) return;
    const R = SURFACE_LIGHT.reflect;
    const washed = R.night - R.day * this.daylight;
    if (washed <= 0) return;
    let shown = 0;
    for (const l of f.lights) {
      if (shown >= R.most) break;
      if (l.you) continue;
      const cx = Math.round(l.x / ART_SCALE);
      const cy = Math.round((l.y + l.z) / ART_SCALE);
      const lx = cx - this.ox;
      const ly = cy - this.oy;
      if (lx < 0 || ly < 0 || lx >= this.w || ly >= this.h) continue;
      const type = this.liquidAt(lx, ly);
      const strength = Math.min(1, Math.max(...l.rgb) * washed * (type?.shine ?? 1));
      if (!type || strength < 0.08) continue;
      shown++;
      const seed = (Math.round(l.x) * 7 + Math.round(l.y) * 13) & 0xffff;
      const tall = (R.tall[0] + (R.tall[1] - R.tall[0]) * Math.min(1, l.z / R.high)) * (0.5 + strength / 2);
      const up = Math.ceil(tall * R.above);
      const wide = R.wide + (l.length / 2 / ART_SCALE) * Math.abs(Math.cos(l.angle));
      const flick = Math.floor(now * R.flicker + (seed % 7) / 7);
      const hue = l.rgb.map((c) => (c / Math.max(...l.rgb)) * 255);
      for (let dy = -up; dy <= Math.ceil(tall); dy++) {
        // 0 at the mirrored light, 1 at either end
        const along = dy < 0 ? -dy / (up + 1) : dy / (tall + 1);
        // wave fronts facing you catch it, so streaks across with gaps between, rolling towards you
        if (Math.sin(((cy + dy) / R.crests - now * R.roll) * Math.PI * 2 + seed) < 0) continue;
        if (surfaceHash(cy + dy, flick, seed) > 1 - along * 0.5) continue;
        const half = Math.round(wide * (1 - along * 0.5) * (0.4 + surfaceHash(dy, flick, seed + 1) * 0.8));
        const off = Math.round(Math.sin(now * R.speed + (cy + dy) * 0.9 + seed) * R.wobble * (0.4 + along));
        // the surface's whitest in the light's own colour, more of it towards the ends
        const colour = packColour(mixRgb(this.palette(type).rgb.foam, hue, R.tint[0] + (R.tint[1] - R.tint[0]) * along));
        const rgb = hue.map((c) => (c / 255) * strength * (1 - along * 0.6) * R.light);
        // a long one (a bar's) breaks into dashes, more gaps towards its ends
        for (let from = -half; from <= half; from += R.dash) {
          if (half > R.dash && surfaceHash(Math.floor((from + half) / R.dash), cy + dy, seed + flick) < 0.2 + along * 0.4) continue;
          const length = Math.min(R.dash, half + 1 - from);
          for (let dx = from; dx < from + length; dx++) this.put(cx + off + dx, cy + dy, colour);
          this.mirrored.push({ ax: cx + off + from, ay: cy + dy, length, rgb });
        }
      }
    }
  },

  // step 1 of the light map (Lighting.build() in lighting.js, its ctx in world positions): the light
  // the liquid gives back, added on wherever this frame's surface showed it (the top of the file)
  lightUp(ctx, f) {
    if (this.drawn !== f.map) return;
    this.drawn = null;
    const { w, h, water } = this;
    if (this.glow?.width !== w || this.glow.height !== h) {
      this.glow ??= document.createElement('canvas');
      this.glow.width = w;
      this.glow.height = h;
      this.glowImage = new ImageData(w, h);
      this.glowPixels = new Uint32Array(this.glowImage.data.buffer);
    }
    // [r, g, b] 0 to 255 as the light map stores it (Lighting.stored())
    const stored = (rgb) => rgb.map((c) => Math.min(255, (c / Lighting.headroom) * 255));
    const sky = f.sky.sky.map((c, i) => (c + (f.sky.sun?.[i] ?? 0) * SURFACE_LIGHT.sun) * SURFACE_LIGHT.sky);
    // what each liquid gives back, and packed for the layer
    const given = new Map();
    const gives = (type) => {
      if (!given.has(type)) {
        const rgb = sky.map((c) => c * (type.shine ?? 1));
        given.set(type, { rgb, packed: packColour(stored(rgb)) });
      }
      return given.get(type);
    };
    const px = this.glowPixels;
    const half = SURFACE_ART / 2;
    for (let ly = 0; ly < h; ly++) {
      for (let lx = 0; lx < w; lx++) {
        const i = ly * w + lx;
        px[i] = water[i] ? gives(this.quarters[((ly / half) | 0) * this.qw + ((lx / half) | 0)]).packed : 0;
      }
    }
    for (const m of this.mirrored) {
      const ly = m.ay - this.oy;
      for (let lx = m.ax - this.ox; lx < m.ax - this.ox + m.length; lx++) {
        if (lx < 0 || ly < 0 || lx >= w || ly >= h || !water[ly * w + lx]) continue;
        px[ly * w + lx] = packColour(stored(gives(this.liquidAt(lx, ly)).rgb.map((c, i) => c + m.rgb[i])));
      }
    }
    this.glow.getContext('2d').putImageData(this.glowImage, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.glow, this.ox * ART_SCALE, this.oy * ART_SCALE, w * ART_SCALE, h * ART_SCALE);
    ctx.restore();
  },

  // the bank's shade: down each column, the first few px of liquid below the ground's edge, wavering
  // (SURFACE_LIGHT.waver)
  bank(now) {
    const { w, h, water } = this;
    for (let lx = 0; lx < w; lx++) {
      const waver = Math.round(SURFACE_LIGHT.waver * Math.sin(now * SURFACE_LIGHT.waverSpeed + (lx + this.ox) * 0.4));
      const deep = SURFACE.bank - (surfaceNoise((lx + this.ox) / 3, 5) < 0.4 ? 1 : 0) + waver;
      // px since the ground, Infinity where it isn't known (the box's top)
      let run = Infinity;
      for (let ly = 0; ly < h; ly++) {
        if (!water[ly * w + lx]) {
          run = 0;
          continue;
        }
        if (++run <= deep) this.put(lx + this.ox, ly + this.oy, 'shade');
      }
    }
  },

  // foam along every bit of shore that's the ground's edge looking way (SURFACE_WAYS): along each line
  // of px that way, the liquid's distance out from the ground rolls in and out, two waves of different
  // lengths so it never quite repeats, and there's only foam where a slowly drifting stretch of it is
  // (surfaceNoise()), white in the middle of a stretch and lighter liquid at its ends
  foam(way, now) {
    const { w, h, water } = this;
    const lap = (now / SURFACE.lapTime) * Math.PI * 2;
    const lines = way.dx ? h : w;
    const length = way.dx ? w : h;
    for (let line = 0; line < lines; line++) {
      const along = line + (way.dx ? this.oy : this.ox);
      const there = surfaceNoise(along / 3 + now * 0.3, way.seed);
      if (there > SURFACE.foam) continue;
      const wave = 0.6 * Math.sin(lap + along * 0.23 + way.seed * 1.3) + 0.4 * Math.sin(lap * 0.47 - along * 0.13 + 2.1);
      const out = 1 + SURFACE.foamNear + Math.round(((wave + 1) / 2) * (SURFACE.foamFar - SURFACE.foamNear));
      const tone = there < SURFACE.foam * 0.6 ? 'foam' : 'light';
      let run = Infinity;
      for (let n = 0; n < length; n++) {
        const step = way.dx + way.dy > 0 ? n : length - 1 - n;
        const lx = way.dx ? step : line;
        const ly = way.dx ? line : step;
        if (!water[ly * w + lx]) {
          run = 0;
          continue;
        }
        if (++run === out) this.put(lx + this.ox, ly + this.oy, tone);
      }
    }
  },

  // particle p (particles.js) went into liquid (a tile kind) where it is, the way it does in it
  // (PARTICLE_IN_LIQUID or PARTICLE_IN_HOT, its effect's inLiquid if not given). kept until it's
  // faded, and drawn whenever its bit of liquid's on screen. forgotten on changing map (clear())
  splash(p, liquid, way = p.effect.inLiquid) {
    const now = millis() / 1000;
    this.splashes = this.splashes.filter((s) => now - s.born < s.lasts);
    if (this.splashes.length >= SURFACE.splashes) this.splashes.shift();
    const e = p.effect;
    const cloud = way === 'dissolves' && liquid.clarity > 0 && !e.glow && !p.img && e.cloudSize > 0;
    const sizzle = way === 'sizzles';
    const ring = (particleSize(p) * e.splashRing) / 100; // particles.js
    if (!cloud && !ring && !sizzle) return;
    const s = { x: p.x, y: p.y, born: now, ring, cloud, sizzle, size: particleSize(p), lasts: Math.max(SURFACE.ringFor, SURFACE.sizzleFor, cloud ? e.cloudTime : 0), seed: Math.floor(Math.random() * 1e6) };
    if (cloud) {
      // its colour seen through the liquid, stronger in the middle and for more solid effects
      const base = this.palette(liquid).base;
      const rgb = particleRgb(p);
      const strength = e.opacity / 100;
      s.start = particleSize(p) / ART_SCALE / 2 + 0.5;
      s.spread = e.cloudSize / ART_SCALE;
      s.time = e.cloudTime;
      s.core = packColour(mixRgb(base, rgb, Math.min(1, (0.5 + liquid.clarity * 0.6) * strength)));
      s.edge = packColour(mixRgb(base, rgb, (0.3 + liquid.clarity * 0.4) * strength));
    }
    this.splashes.push(s);
  },

  clear() {
    this.splashes = [];
  },

  // a splash's ring, age seconds in: opening out from a px to about the particle's size, light at
  // first, and breaking up as it goes
  ring(s, age) {
    const t = age / SURFACE.ringFor;
    if (t >= 1 || !s.ring) return;
    const rx = 0.5 + t * (1.5 + s.ring / ART_SCALE);
    const ry = Math.max(0.5, rx * 0.5);
    const cx = s.x / ART_SCALE;
    const cy = s.y / ART_SCALE;
    const n = Math.ceil(Math.PI * 2 * rx * 1.5);
    for (let i = 0; i < n; i++) {
      if (surfaceHash(Math.floor((i / n) * 8), s.seed, 4) < t) continue;
      const angle = (i / n) * Math.PI * 2;
      this.put(Math.round(cx + rx * Math.cos(angle)), Math.round(cy + ry * Math.sin(angle)), t < 0.4 ? 'light' : 'mid');
    }
  },

  // a sizzle, age seconds in: a few bright px spitting round where it went in, somewhere new every
  // frame or so, fewer and darker as it dies down
  sizzle(s, age) {
    const t = age / SURFACE.sizzleFor;
    if (t >= 1) return;
    const reach = 1.5 + s.size / ART_SCALE;
    const frame = Math.floor(age * 30);
    const spits = Math.ceil(SURFACE.sizzleSpits * (1 - t));
    for (let i = 0; i < spits; i++) {
      const angle = surfaceHash(frame, i, s.seed) * Math.PI * 2;
      const out = surfaceHash(i, frame, s.seed) * reach;
      this.put(Math.round(s.x / ART_SCALE + Math.cos(angle) * out), Math.round(s.y / ART_SCALE + Math.sin(angle) * out * 0.6), t < 0.5 ? 'foam' : 'light');
    }
  },

  // a splash's cloud, age seconds in: a blob spreading out quickly then slowing, with a ragged edge.
  // its strong middle thins away first, then it breaks up into short dashes like the rest of the
  // surface (which ones go is fixed, so it never flickers)
  cloud(s, age) {
    const t = age / s.time;
    if (t >= 1) return;
    const rx = s.start + s.spread * (1 - (1 - t) ** 2);
    const ry = rx * 0.75;
    const cx = s.x / ART_SCALE;
    const cy = s.y / ART_SCALE;
    for (let ay = Math.floor(cy - ry); ay <= Math.ceil(cy + ry); ay++) {
      for (let ax = Math.floor(cx - rx); ax <= Math.ceil(cx + rx); ax++) {
        const d = ((ax - cx) / rx) ** 2 + ((ay - cy) / ry) ** 2 + (surfaceHash(ax, ay, s.seed) - 0.5) * 0.3;
        if (d > 1 || surfaceHash(ay, Math.floor(ax / 3), s.seed) < t ** 0.8) continue;
        this.put(ax, ay, d < 0.5 - t ? s.core : s.edge);
      }
    }
  },

  // the ring round a floating particle (ParticleSystem.floatOn()) where it sits in the surface, a
  // picture px out from its edge, at its floor spot so it bobs against it. lighter while jostled
  floating(p) {
    const half = particleSize(p) / 2 / ART_SCALE;
    const rx = (p.effect.stretch / 100) * half + 1;
    const ry = Math.max(1, half * 0.5 + 0.5);
    const cx = p.x / ART_SCALE;
    const cy = p.y / ART_SCALE + half * 0.5;
    // burning, the rim flickers bright
    const tone = p.burning !== undefined ? (surfaceHash(Math.floor(p.burning * 12), Math.floor(p.phase * 1000), 9) < 0.5 ? 'foam' : 'light') : p.jostle > 0.3 ? 'light' : 'mid';
    const n = Math.ceil(Math.PI * 2 * rx * 1.5);
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      this.put(Math.round(cx + rx * Math.cos(angle)), Math.round(cy + ry * Math.sin(angle)), tone);
    }
  },

  // an empty layer w x h picture px, kept from frame to frame while it's the same size
  begin(w, h) {
    if (this.canvas?.width !== w || this.canvas.height !== h) {
      this.canvas ??= document.createElement('canvas');
      this.canvas.width = w;
      this.canvas.height = h;
      this.image = new ImageData(w, h);
      this.pixels = new Uint32Array(this.image.data.buffer);
    }
    this.w = w;
    this.h = h;
    this.pixels.fill(0);
  },

  // colours a picture px (ax, ay, counting from the world's 0, 0) if the liquid shows there (shore()).
  // colour is one of the liquid's (palette()) by name, or a packed one (packColour())
  put(ax, ay, colour) {
    const lx = ax - this.ox;
    const ly = ay - this.oy;
    if (lx < 0 || ly < 0 || lx >= this.w || ly >= this.h || !this.water[ly * this.w + lx]) return;
    this.pixels[ly * this.w + lx] = typeof colour === 'string' ? this.palette(this.liquidAt(lx, ly))[colour] : colour;
  },

  // the liquid in the quarter tile at lx, ly (picture px in the box), or null
  liquidAt(lx, ly) {
    const half = SURFACE_ART / 2;
    return this.quarters[Math.floor(ly / half) * this.qw + Math.floor(lx / half)];
  },

  // a liquid's few flat colours, packed for the layer, and as css (css) for drawing them elsewhere
  // (the ring round waders, drawInLiquid() in character.js)
  palette(type) {
    let palette = this.palettes.get(type);
    if (palette?.from === type.colour + type.surfaceColour) return palette;
    const base = hexToRgb(type.colour); // particles.js
    const top = hexToRgb(type.surfaceColour);
    const tones = { shade: base.map((v) => v * SURFACE.bankShade), mid: mixRgb(base, top, 0.35), light: mixRgb(base, top, 0.7), foam: top };
    palette = { from: type.colour + type.surfaceColour, base, css: {}, rgb: tones };
    for (const [name, rgb] of Object.entries(tones)) {
      palette[name] = packColour(rgb);
      palette.css[name] = `rgb(${rgb.map(Math.round).join(', ')})`;
    }
    this.palettes.set(type, palette);
    return palette;
  },

  // now and then a short dash of light somewhere on a tile, growing and shrinking over glintFor
  // seconds. each tile has its own time between them, and every one's somewhere new on it. fewer the
  // less light's on it (SURFACE_LIGHT.glints) and the less it shines (type, its tile kind)
  glint(col, row, now, type) {
    const [soonest, latest] = SURFACE.glintEvery;
    const every = soonest + (latest - soonest) * surfaceHash(col, row, 1);
    const time = now + surfaceHash(col, row, 2) * every;
    const shown = (time % every) / SURFACE.glintFor;
    if (shown >= 1) return;
    const n = Math.floor(time / every);
    const lit = this.litAt(col * SURFACE_ART - this.ox + SURFACE_ART / 2, row * SURFACE_ART - this.oy + SURFACE_ART / 2, SURFACE_LIGHT.glints);
    if (surfaceHash(col, row, n + 1000) >= lit * (type.shine ?? 1)) return;
    const length = Math.round(Math.sin(shown * Math.PI) * 3);
    if (!length) return;
    // clear of the shore's foam, drifting a px along as it goes
    const gx = col * SURFACE_ART + 4 + Math.floor(surfaceHash(col, row, n) * 6) + Math.floor(shown * 2);
    const gy = row * SURFACE_ART + 5 + Math.floor(surfaceHash(row, col, n) * 7);
    for (let i = 0; i < length; i++) this.put(gx + i - (length >> 1), gy, length > 2 && i === 1 ? 'foam' : 'light');
  },

  // a line from x1, y1 to x2, y2 (world px), width px wide, for wakes (Wakes.drawArm()). over a picture
  // px wide it's solid and light, twice as thick over about two. thinner, it's the darker tone and
  // breaks up: it only shows if seed (0 to 1, fixed for that bit) is under how thick it is
  line(x1, y1, x2, y2, width, seed) {
    const ink = width / ART_SCALE;
    if (ink < 1 && seed > ink) return;
    const colour = ink >= 1 ? 'light' : 'mid';
    const ax1 = Math.round(x1 / ART_SCALE);
    const ay1 = Math.round(y1 / ART_SCALE);
    const ax2 = Math.round(x2 / ART_SCALE);
    const ay2 = Math.round(y2 / ART_SCALE);
    const steps = Math.max(Math.abs(ax2 - ax1), Math.abs(ay2 - ay1));
    // thick ones grow across the line
    const flat = Math.abs(ax2 - ax1) >= Math.abs(ay2 - ay1);
    for (let i = 0; i <= steps; i++) {
      const ax = Math.round(ax1 + ((ax2 - ax1) * i) / (steps || 1));
      const ay = Math.round(ay1 + ((ay2 - ay1) * i) / (steps || 1));
      this.put(ax, ay, colour);
      if (ink >= 1.8) this.put(ax + (flat ? 0 : 1), ay + (flat ? 1 : 0), colour);
    }
  },

  // a ripple particle (onSurface()) as a pixel ring in its colour mixed into the liquid's, by how
  // strong it is (opacity). fading, it breaks into fewer and fewer bits of ring rather than going
  // see-through
  ripple(p) {
    const e = p.effect;
    const fade = particleAlpha(p) / (e.opacity / 100);
    if (fade <= 0) return;
    const half = particleSize(p) / 2 / ART_SCALE;
    const rx = (e.stretch / 100) * half;
    const ry = half;
    const cx = p.x / ART_SCALE;
    const cy = p.y / ART_SCALE;
    if (cx < this.ox || cy < this.oy || cx >= this.ox + this.w || cy >= this.oy + this.h) return;
    const type = this.liquidAt(Math.floor(cx - this.ox), Math.floor(cy - this.oy));
    if (!type) return;
    const colour = packColour(mixRgb(this.palette(type).base, p.rgb, Math.min(1, e.opacity / 100)));
    const seed = Math.floor(p.phase * 1000);
    const n = Math.ceil(Math.PI * 2 * Math.max(rx, ry) * 1.5);
    for (let i = 0; i < n; i++) {
      if (surfaceHash(Math.floor((i / n) * 12), seed, 3) > fade) continue;
      const angle = (i / n) * Math.PI * 2;
      this.put(Math.round(cx + rx * Math.cos(angle)), Math.round(cy + ry * Math.sin(angle)), colour);
    }
  },

  // part of a ring round x, y (world px), rx by ry, from and to radians, a picture px at a time, in
  // the current fill colour on the canvas, in world positions. for the ring round waders
  // (drawInLiquid() in character.js)
  arc(x, y, rx, ry, from, to) {
    const ctx = drawingContext;
    const n = Math.ceil(((to - from) * Math.max(rx, ry) * 1.5) / ART_SCALE);
    const done = new Set();
    for (let i = 0; i <= n; i++) {
      const angle = from + ((to - from) * i) / n;
      const ax = Math.round((x + rx * Math.cos(angle)) / ART_SCALE);
      const ay = Math.round((y + ry * Math.sin(angle)) / ART_SCALE);
      if (done.has(ax * 100000 + ay)) continue;
      done.add(ax * 100000 + ay);
      ctx.fillRect(ax * ART_SCALE, ay * ART_SCALE, ART_SCALE, ART_SCALE);
    }
  },
};

// the ways the ground's edge can look at the liquid, for foam (Surface.foam()): looking down (ground
// above), up, right and left, each its own run of foam (seed)
const SURFACE_WAYS = [
  { dx: 0, dy: 1, seed: 0 },
  { dx: 0, dy: -1, seed: 31 },
  { dx: 1, dy: 0, seed: 62 },
  { dx: -1, dy: 0, seed: 93 },
];

// people in liquids, as ParticleSystem.update() wants them for shoving floating particles: their feet,
// speed and the half width of the ring round them (drawInLiquid() in character.js)
function waders(characters) {
  return characters.filter((c) => c.sink > 0.05 && !c.dead).map((c) => ({ x: c.x, y: c.y + c.h / 2, vx: c.velocity.x, vy: c.velocity.y, r: (c.w * LIQUID.ringWidth) / 2 }));
}

// floor particles the surface draws itself (Surface.ripple()), which Particles.drawFloor() leaves out
function onSurface(p) {
  return p.z <= 0 && p.effect.onLiquid && p.effect.shape === 'ripple';
}

// [r, g, b] a part t of the way from a to b
function mixRgb(a, b, t) {
  return a.map((v, i) => v + (b[i] - v) * t);
}

// [r, g, b] as one of the layer's pixels (every browser's little endian, so it's a, b, g, r)
function packColour([r, g, b]) {
  return ((255 << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
}

// the same number from 0 to 1 for the same three whole numbers, so things can be random but stay put
function surfaceHash(a, b, c) {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 0 to 1, changing smoothly with x, a different run of it for each seed
function surfaceNoise(x, seed) {
  const i = Math.floor(x);
  const f = x - i;
  const a = surfaceHash(i, seed, 7);
  return a + (surfaceHash(i + 1, seed, 7) - a) * f * f * (3 - 2 * f);
}
