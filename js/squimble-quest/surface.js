// the surface of liquids (tiles with sink, tiles.js), drawn a picture pixel at a time so it sits with
// the 16 px art. TileMap.drawTiles() (tilemap.js) calls Surface.draw() after the plain tiles and
// before the dual grid ones, so the ground's ragged edge lies over it like a bank over water. on it,
// in each liquid's own colours (colour and surfaceColour):
//   - a darker band along its top edges, where you'd see the bank go down into it
//   - foam lapping at the shore: a broken line that comes in from under the ground's edge and goes
//     back, a bit of shore at a time, so it never reads as an outline
//   - glints: a short light dash here and there where a wavelet catches the light, gone in a moment
//   - wakes (wakes.js) and ripples (floor particles with onLiquid and the ripple shape, particles.js)
// nothing's see-through or smoothed: every pixel is one of a few flat colours mixed from the liquid's
// two (palette()), and things fade by breaking up into dashes rather than going see-through. only for
// show, like particles

const SURFACE = {
  // picture px darkened under a bank on a liquid's top edge (the ground's edge covers the first
  // couple), and how dark, as a part of its colour
  bank: 4,
  bankShade: 0.82,
  // foam laps between these many picture px from the shore, the nearest under the ground's edge.
  // lapTime is about how many seconds one wave takes, and foam how much of the shore has some at once
  foamNear: 1,
  foamFar: 4,
  lapTime: 3.4,
  foam: 0.4,
  // seconds between glints on each tile (each tile its own, somewhere between) and how long one shows
  glintEvery: [2.5, 7],
  glintFor: 0.8,
  // more liquid tiles on screen than this (zoomed right out) leaves the surface plain. a picture px is
  // under a screen px by then, and the layer would be big for nothing
  maxTiles: 8000,
};

// the size of a tile in picture px
const SURFACE_ART = TILE / ART_SCALE; // config.js

const Surface = {
  // the layer (a picture px a pixel), its pixels, and the liquid tiles it covers this frame
  canvas: null,
  pixels: null,
  palettes: new Map(),

  // the surface of every liquid tile from firstCol, firstRow to lastCol, lastRow, in screen positions
  // (inside drawTiles()'s resetMatrix()). x(half) and y(half) are where half tile edges land on screen
  draw(map, firstCol, lastCol, firstRow, lastRow, x, y) {
    // just the box round the liquid tiles on screen
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
    if (col0 > col1) return;
    const cw = col1 - col0 + 1;
    const ch = row1 - row0 + 1;
    if (cw * ch > SURFACE.maxTiles) return;
    this.begin(cw * SURFACE_ART, ch * SURFACE_ART);
    this.ox = col0 * SURFACE_ART;
    this.oy = row0 * SURFACE_ART;
    this.cw = cw;
    this.cells = [];
    for (let row = row0; row <= row1; row++) {
      for (let col = col0; col <= col1; col++) {
        const type = map.get(col, row);
        this.cells.push(type?.sink ? type : null);
      }
    }
    const now = millis() / 1000;
    const land = (col, row) => !map.get(col, row)?.sink;
    for (let row = row0; row <= row1; row++) {
      for (let col = col0; col <= col1; col++) {
        if (!this.cells[(row - row0) * cw + col - col0]) continue;
        if (land(col, row - 1)) this.bank(col, row);
        this.glint(col, row, now);
        SURFACE_SIDES.forEach((side, i) => land(col + side.dx, row + side.dy) && this.foam(col, row, side, i, now));
      }
    }
    Wakes.draw({ left: col0 * TILE, right: (col1 + 1) * TILE, top: row0 * TILE, bottom: (row1 + 1) * TILE }, this); // wakes.js
    for (const p of Particles.list) if (onSurface(p)) this.ripple(p); // particles.js

    this.canvas.getContext('2d').putImageData(this.image, 0, 0);
    const ctx = drawingContext;
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    const left = x(2 * col0);
    const top = y(2 * row0);
    ctx.drawImage(this.canvas, left, top, x(2 * col1 + 2) - left, y(2 * row1 + 2) - top);
    ctx.imageSmoothingEnabled = smooth;
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

  // colours a picture px (ax, ay, counting from the world's 0, 0) if it's on a liquid tile. colour is
  // one of the liquid's (palette()) by name, or a packed one (packColour())
  put(ax, ay, colour) {
    const lx = ax - this.ox;
    const ly = ay - this.oy;
    if (lx < 0 || ly < 0 || lx >= this.w || ly >= this.h) return;
    const type = this.cells[Math.floor(ly / SURFACE_ART) * this.cw + Math.floor(lx / SURFACE_ART)];
    if (type) this.pixels[ly * this.w + lx] = typeof colour === 'string' ? this.palette(type)[colour] : colour;
  },

  // a liquid's few flat colours, packed for the layer, and as css (css) for drawing them elsewhere
  // (the ring round waders, drawInLiquid() in character.js)
  palette(type) {
    let palette = this.palettes.get(type);
    if (palette?.from === type.colour + type.surfaceColour) return palette;
    const base = hexToRgb(type.colour); // particles.js
    const top = hexToRgb(type.surfaceColour);
    const tones = { shade: base.map((v) => v * SURFACE.bankShade), mid: mixRgb(base, top, 0.35), light: mixRgb(base, top, 0.7), foam: top };
    palette = { from: type.colour + type.surfaceColour, base, css: {} };
    for (const [name, rgb] of Object.entries(tones)) {
      palette[name] = packColour(rgb);
      palette.css[name] = `rgb(${rgb.map(Math.round).join(', ')})`;
    }
    this.palettes.set(type, palette);
    return palette;
  },

  // the band under the bank along a tile's top edge, a px deeper here and there so its bottom isn't
  // ruled straight
  bank(col, row) {
    for (let a = 0; a < SURFACE_ART; a++) {
      const ax = col * SURFACE_ART + a;
      const deep = SURFACE.bank - (surfaceNoise(ax / 3, 5) < 0.4 ? 1 : 0);
      for (let d = 0; d < deep; d++) this.put(ax, row * SURFACE_ART + d, 'shade');
    }
  },

  // foam along a tile's edge on `side` (SURFACE_SIDES, number i). each px along the shore has its own
  // distance out that rolls in and out, two waves of different lengths so it never quite repeats, and
  // foam only where a slowly drifting stretch of it is (surfaceNoise()), white in the middle of a
  // stretch and lighter water at its ends
  foam(col, row, side, i, now) {
    const lap = (now / SURFACE.lapTime) * Math.PI * 2;
    for (let a = 0; a < SURFACE_ART; a++) {
      const along = (side.dx ? row : col) * SURFACE_ART + a;
      const there = surfaceNoise(along / 3 + now * 0.3, i * 31);
      if (there > SURFACE.foam) continue;
      const wave = 0.6 * Math.sin(lap + along * 0.23 + i * 1.3) + 0.4 * Math.sin(lap * 0.47 - along * 0.13 + 2.1);
      const d = SURFACE.foamNear + Math.round(((wave + 1) / 2) * (SURFACE.foamFar - SURFACE.foamNear));
      // the middle of a stretch is a crest, its ends the wave's lighter water
      this.put(...side.at(col, row, a, d), there < SURFACE.foam * 0.6 ? 'foam' : 'light');
    }
  },

  // now and then a short dash of light somewhere on a tile, growing and shrinking over glintFor
  // seconds. each tile has its own time between them, and every one's somewhere new on it
  glint(col, row, now) {
    const [soonest, latest] = SURFACE.glintEvery;
    const every = soonest + (latest - soonest) * surfaceHash(col, row, 1);
    const time = now + surfaceHash(col, row, 2) * every;
    const shown = (time % every) / SURFACE.glintFor;
    if (shown >= 1) return;
    const n = Math.floor(time / every);
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
    const type = this.cells[Math.floor((cy - this.oy) / SURFACE_ART) * this.cw + Math.floor((cx - this.ox) / SURFACE_ART)];
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

// the four sides of a tile: which way the neighbour is, and where a px is that's a along that edge
// and d in from it (picture px, from the world's 0, 0)
const SURFACE_SIDES = [
  { dx: 0, dy: -1, at: (col, row, a, d) => [col * SURFACE_ART + a, row * SURFACE_ART + d] },
  { dx: 0, dy: 1, at: (col, row, a, d) => [col * SURFACE_ART + a, (row + 1) * SURFACE_ART - 1 - d] },
  { dx: -1, dy: 0, at: (col, row, a, d) => [col * SURFACE_ART + d, row * SURFACE_ART + a] },
  { dx: 1, dy: 0, at: (col, row, a, d) => [(col + 1) * SURFACE_ART - 1 - d, row * SURFACE_ART + a] },
];

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
