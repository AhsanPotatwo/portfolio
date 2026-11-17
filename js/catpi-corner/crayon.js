// catpi corner's drawing kit: everything on the stage is drawn with these, so it all looks like it was done
// with crayons and a pencil on the same sheet of paper. a shape is a list of points ([[x, y], ...]) that's
// a little wobbly, filled flat, then gone over with crayon scribbles, then outlined in pencil twice (two
// passes never land in the same place, which is what makes a line look drawn). paper() rubs a bit of the
// wax off afterwards so the paper's tooth shows through.
//
// the places are drawn three times with different wobbles and flicked between (page.js), the way hand
// drawn cartoons "boil", so every random choice goes through rng() and the same seed draws the same
// picture with only the wobble changed.
const Crayon = (() => {
  // a small seeded random (mulberry32): rng() is 0 to 1
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // the wobble for the current drawing (wobble() picks the boil frame)
  let jiggle = seeded(1);
  const wobble = (frame) => { jiggle = seeded(9001 + frame * 7919); };
  const j = (amount) => (jiggle() * 2 - 1) * amount;

  // shapes
  const blob = (cx, cy, rx, ry, rough = 0.06, n = 22) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 1 + j(rough);
      pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
    }
    return pts;
  };
  // a box with each side bent a little, corners rounded by r
  const box = (x, y, w, h, r = 3, rough = 1.6) => {
    const pts = [];
    const side = (x0, y0, x1, y1) => {
      const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 40));
      for (let i = 0; i < n; i++) pts.push([x0 + ((x1 - x0) * i) / n + j(rough), y0 + ((y1 - y0) * i) / n + j(rough)]);
    };
    side(x + r, y, x + w - r, y);
    side(x + w, y + r, x + w, y + h - r);
    side(x + w - r, y + h, x + r, y + h);
    side(x, y + h - r, x, y + r);
    return pts;
  };
  // any list of corners, each nudged
  const poly = (corners, rough = 1.5) => corners.map(([x, y]) => [x + j(rough), y + j(rough)]);

  // a closed, smoothed path through the points (each corner rounded through its neighbours' middles), or
  // straight from point to point when sharp (big things like the ground, which smoothing turns into ovals)
  function trace(g, pts, closed = true, sharp = false) {
    g.beginPath();
    if (sharp) {
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      if (closed) g.closePath();
      return;
    }
    if (!closed) {
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const [x, y] = pts[i], [nx, ny] = pts[i + 1];
        g.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
      }
      const last = pts[pts.length - 1];
      g.lineTo(last[0], last[1]);
      return;
    }
    const n = pts.length;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const start = mid(pts[n - 1], pts[0]);
    g.moveTo(start[0], start[1]);
    for (let i = 0; i < n; i++) {
      const p = pts[i], m = mid(p, pts[(i + 1) % n]);
      g.quadraticCurveTo(p[0], p[1], m[0], m[1]);
    }
    g.closePath();
  }

  // a pencil line along points: two passes, each a little off the other and the shape
  function pencil(g, pts, { color = '#3a3034', width = 2.4, closed = true, passes = 2, rough = 1.2, sharp = false } = {}) {
    g.save();
    g.strokeStyle = color;
    g.lineCap = g.lineJoin = 'round';
    for (let p = 0; p < passes; p++) {
      g.lineWidth = width * (p ? 0.7 : 1);
      g.globalAlpha = p ? 0.55 : 0.95;
      trace(g, pts.map(([x, y]) => [x + j(rough), y + j(rough)]), closed, sharp);
      g.stroke();
    }
    g.restore();
  }

  // crayon scribbles over a shape: back and forth strokes at an angle, a little past the edges like a
  // kid's colouring, clipped so only a hair goes over
  function scribble(g, pts, color, { angle = -0.5, gap = 7, width = 4, alpha = 0.5, over = 2, sharp = false } = {}) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    g.save();
    trace(g, pts.map(([x, y]) => [x + j(over), y + j(over)]), true, sharp);
    g.clip();
    g.strokeStyle = color;
    g.globalAlpha = alpha;
    g.lineWidth = width;
    g.lineCap = g.lineJoin = 'round';
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + 10;
    const c = Math.cos(angle), s = Math.sin(angle);
    g.beginPath();
    let up = true;
    for (let t = -R; t <= R; t += gap * (0.75 + jiggle() * 0.5)) {
      const a = up ? -R : R, b = up ? R : -R;
      const px = cx + c * a - s * t + j(3), py = cy + s * a + c * t + j(3);
      const qx = cx + c * b - s * t + j(3), qy = cy + s * b + c * t + j(3);
      if (t === -R) g.moveTo(px, py); else g.lineTo(px, py);
      g.lineTo(qx, qy);
      up = !up;
    }
    g.stroke();
    g.restore();
  }

  // the usual way to draw a thing: flat colour, crayon over it, pencil round it
  function shape(g, pts, fill, { shade = null, line = '#3a3034', width = 2.4, angle = -0.5, gap = 7, alpha = 0.45, outline = true, sharp = false, stroke = 4 } = {}) {
    g.fillStyle = fill;
    trace(g, pts, true, sharp);
    g.fill();
    if (shade) scribble(g, pts, shade, { angle, gap, alpha, sharp, width: stroke });
    if (outline) pencil(g, pts, { color: line, width, sharp });
  }

  // a short pencil stroke between points (grass, cracks, wood grain)
  function stroke(g, pts, color = '#3a3034', width = 2, alpha = 0.9) {
    g.save();
    g.strokeStyle = color;
    g.lineWidth = width;
    g.globalAlpha = alpha;
    g.lineCap = g.lineJoin = 'round';
    trace(g, pts.map(([x, y]) => [x + j(0.8), y + j(0.8)]), false);
    g.stroke();
    g.restore();
  }

  // the paper's tooth, a tile of specks rubbed out of whatever's under it. made once
  let toothTile = null;
  function tooth() {
    if (toothTile) return toothTile;
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const g = c.getContext('2d');
    const r = seeded(77);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(0,0,0,${0.1 + r() * 0.35})`;
      const w = 0.6 + r() * 1.8;
      g.fillRect(r() * 160, r() * 160, w * (1 + r() * 2), w);
    }
    toothTile = c;
    return c;
  }
  function paper(g, w, h, strength = 1) {
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = strength;
    g.fillStyle = g.createPattern(tooth(), 'repeat');
    g.fillRect(0, 0, w, h);
    g.restore();
  }

  // a canvas to draw on, w by h in stage px at this many device px each
  function sheet(w, h, scale = 1, read = false) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * scale));
    c.height = Math.max(1, Math.round(h * scale));
    const g = c.getContext('2d', { willReadFrequently: read });
    g.scale(scale, scale);
    return { c, g };
  }

  // colour sums: mix('#ff0000', '#0000ff', 0.5)
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const mix = (a, b, t) => {
    const A = hex(a), B = hex(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };

  return { seeded, wobble, j, blob, box, poly, trace, pencil, scribble, shape, stroke, paper, sheet, mix, hex, tooth };
})();
