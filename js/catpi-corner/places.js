// the places catpis live in, all drawn in crayon (crayon.js) for a stage 720 px tall and W px wide (W changes
// with the screen, so anything across the stage is placed by fractions of W). each place has:
//   sky(g, W)      the sky or wall at the very back, under the moving sky bits
//   back(g, W)     everything behind the catpis, with the sky left clear
//   front(g, W)    things in front of every catpi (the tall grass along the bottom)
//   props(W)       things catpis walk round the back and front of: { x, y (where it stands), w, h, ax, ay
//                  (where x, y is in its own picture), draw(g) } drawn so (0, 0) is where it stands
//   ground(W)      where catpis can walk: { top, bottom, left, right }
//   water(W)       ponds and puddles catpis splash in: [{ x, y, rx, ry }]
//   live(g, W, t, night)   the moving bits (sun, clouds, windmill, steam), drawn every frame over the sky
//   spots(W)       things to click: [{ x, y, r, name }] (page.js decides what they do)
// colours are crayon colours, kept together at the top
const PLACES = (() => {
  const C = Crayon;
  const INK = '#3a3034';
  const K = {
    sky: '#d3ecf8', skyShade: '#aedaf2',
    sun: '#ffd84f', sunShade: '#ffb42e',
    cloud: '#ffffff', cloudShade: '#dce9f2',
    hill: '#c8e7a2', hillShade: '#a5d277', hill2: '#b4dd89',
    grass: '#a3da74', grassShade: '#7fc251', tuft: '#5f9f3b',
    barn: '#e45b43', barnShade: '#c4412d', roof: '#8e3b30', roofShade: '#6f2a22', trim: '#fff7ea',
    wood: '#dba46a', woodShade: '#b97e45', woodDark: '#8a5a31',
    hay: '#f4d25f', hayShade: '#d8ab2d',
    water: '#94d3f3', waterShade: '#5db4e4',
    silo: '#b9c7d6', siloShade: '#93a6ba',
    leaf: '#6dbb53', leafShade: '#4e9a3a', trunk: '#9b6b46',
    petal: ['#ff8fb1', '#ffd84f', '#ffffff', '#c59cf4'],
  };

  // puddle corner's shops, each built its own way (the street draws them, the cafe window looks out at them)
  const SHOPS = [
    { name: 'Bakery', share: 1.12, top: 150, wall: '#f29b8f', shade: '#d9705f', trim: '#fff7ea', door: '#b8452f', roof: 'gable', up: 'sash', way: 'right', awning: ['scallop', '#fff7ea', '#e5383b'], sign: 'board', show: 'bread' },
    { name: 'Yarn', share: 0.86, top: 96, wall: '#a8dcc6', shade: '#78bfa0', trim: '#fff7ea', door: '#3f9a76', roof: 'cornice', up: 'arch', way: 'left', awning: null, sign: 'hanging', show: 'yarn', pipe: true },
    { name: 'Books', share: 1.06, top: 128, wall: '#ffe08a', shade: '#efbf45', trim: '#7a4a2a', door: '#7a4a2a', roof: 'steps', up: 'three', way: 'middle', awning: ['straight', '#fff7ea', '#f08a24'], sign: 'painted', show: 'books' },
    { name: 'Hats', share: 0.98, top: 118, wall: '#cdb7e8', shade: '#a993cf', trim: '#fff7ea', door: '#5b3f9a', roof: 'mansard', up: 'shutters', way: 'right', awning: ['fringe', '#7c5cc4'], sign: 'awning', show: 'hats', pipe: true },
    { name: 'Leaves', share: 1, top: 168, wall: '#9fcdef', shade: '#6aa8d8', trim: '#fff7ea', door: '#2f6a9e', roof: 'garden', up: 'ivy', way: 'left', awning: ['scallop', '#fff7ea', '#4e9a3a'], sign: 'plank', show: 'plants' },
  ];

  // a cloud's puffs, used by every place with a sky
  const cloud = (g, x, y, s) => {
    const pts = [];
    const puffs = [[-40, 6, 30], [-12, -12, 36], [24, -6, 32], [46, 8, 24], [0, 12, 34]];
    // one outline round all the puffs: points round each, kept only where no other puff covers them
    for (const [px, py, r] of puffs) {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const qx = px + Math.cos(a) * r, qy = py + Math.sin(a) * r * 0.8;
        if (puffs.some(([ox, oy, or]) => (ox !== px || oy !== py) && Math.hypot((qx - ox) / or, (qy - oy) / (or * 0.8)) < 0.98)) continue;
        pts.push([qx, qy, Math.atan2(qy - 4, qx)]);
      }
    }
    pts.sort((a, b) => a[2] - b[2]);
    const out = pts.map(([px, py]) => [x + px * s + C.j(1), y + py * s + C.j(1)]);
    C.shape(g, out, K.cloud, { shade: K.cloudShade, alpha: 0.35, angle: 0.2, gap: 9, line: '#7c8a96', width: 2 });
  };

  // a sun with scribbled rays (drawn at 0, 0 so it can turn)
  const sun = (g, r) => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      C.stroke(g, [[Math.cos(a) * (r + 10), Math.sin(a) * (r + 10)], [Math.cos(a) * (r + 26 + (i % 2) * 8), Math.sin(a) * (r + 26 + (i % 2) * 8)]], K.sunShade, 5, 0.9);
    }
    C.shape(g, C.blob(0, 0, r, r, 0.03), K.sun, { shade: K.sunShade, alpha: 0.4, angle: 0.8, gap: 6, line: '#c98a16' });
  };
  const moon = (g, r) => {
    const pts = [];
    for (let i = 0; i <= 18; i++) { const a = -Math.PI / 2 + (i / 18) * Math.PI * 2 * 0.5; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    for (let i = 18; i >= 0; i--) { const a = -Math.PI / 2 + (i / 18) * Math.PI; pts.push([Math.cos(a) * r * 0.45 - 4, Math.sin(a) * r * 0.98]); }
    C.shape(g, pts, '#fff3bf', { shade: '#f1dc8a', alpha: 0.4, line: '#b39a4a' });
  };
  const star = (g, x, y, s) => {
    C.stroke(g, [[x - s, y], [x + s, y]], '#fff3bf', 2.4, 0.9);
    C.stroke(g, [[x, y - s], [x, y + s]], '#fff3bf', 2.4, 0.9);
  };

  // a flower: a few petals round a middle
  const flower = (g, x, y, colour, s = 1) => {
    C.stroke(g, [[x, y], [x + C.j(2), y + 14 * s]], K.tuft, 2);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.fillStyle = colour;
      C.trace(g, C.blob(x + Math.cos(a) * 4.5 * s, y + Math.sin(a) * 4.5 * s, 3.8 * s, 3.8 * s, 0.1, 8));
      g.fill();
    }
    g.fillStyle = '#ffb42e';
    C.trace(g, C.blob(x, y, 2.6 * s, 2.6 * s, 0.1, 8));
    g.fill();
  };
  const edges = (corners, rough = 1.4) => corners.flatMap(([x0, y0], i) => {
    const [x1, y1] = corners[(i + 1) % corners.length];
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 40));
    return Array.from({ length: n }, (_, k) => [x0 + ((x1 - x0) * k) / n + (k ? C.j(rough) : 0), y0 + ((y1 - y0) * k) / n + (k ? C.j(rough) : 0)]);
  });
  const post = (g, x, y, w, h) => C.shape(g, [[x, y + 6], [x + w * 0.5, y], [x + w, y + 6], [x + w, y + h], [x, y + h]].map(([px, py]) => [px + C.j(0.8), py + C.j(0.8)]), K.wood, { shade: K.woodShade, angle: 1.4, gap: 4, sharp: true });
  const tuft = (g, x, y, s = 1, colour = K.tuft) => {
    for (const d of [-6, -2, 3, 7]) C.stroke(g, [[x + d * s, y], [x + d * 1.6 * s + C.j(2), y - (10 + Math.abs(C.j(6))) * s]], colour, 2, 0.8);
  };
  // a lollipop tree, far away or near
  const tree = (g, x, y, s) => {
    C.shape(g, C.poly([[x - 5 * s, y], [x - 4 * s, y - 40 * s], [x + 4 * s, y - 40 * s], [x + 5 * s, y]]), K.trunk, { line: INK, width: 2 });
    C.shape(g, C.blob(x, y - 58 * s, 32 * s, 30 * s, 0.08), K.leaf, { shade: K.leafShade, alpha: 0.45, gap: 6 });
  };

  // sky fill, the same scribble for every outdoor place
  const skyFill = (g, W, h, top = K.sky, shade = K.skyShade) => {
    g.fillStyle = top;
    g.fillRect(0, 0, W, h);
    C.scribble(g, [[0, 0], [W, 0], [W, h], [0, h]], shade, { angle: 0.12, gap: 16, width: 6, alpha: 0.35, over: 0, sharp: true });
  };

  // ---------- the pen, on the farm ----------
  // where the windmill stands, or null on a stage too narrow for it next to the barn (a phone)
  const mill = (W) => (W >= 760 ? W * 0.72 : null);
  const farm = {
    id: 'farm', name: 'The Pen', says: 'the farm',
    ground: (W) => ({ top: 404, bottom: 692, left: 50, right: W - 50 }),
    water: (W) => [{ x: W * 0.8, y: 616, rx: Math.min(130, W * 0.13), ry: 40 }],
    spots: (W) => [...(mill(W) ? [{ x: mill(W), y: 220, r: 70, name: 'windmill' }] : []), { x: W * 0.86, y: 92, r: 60, name: 'sun' }, { x: W * 0.07 + 126, y: 290, r: 46, name: 'barn' }],
    sky(g, W) { skyFill(g, W, 360); },
    back(g, W) {
      // far hills, one behind the other
      // (each hill's bottom goes well below where the grass starts: smoothing bows a long bottom edge up)
      C.shape(g, [[-20, 440], ...Array.from({ length: 9 }, (_, i) => [(i / 8) * (W + 40) - 20, 268 + Math.sin(i * 1.3) * 26 + C.j(4)]), [W + 20, 440]], K.hill2, { shade: K.hillShade, alpha: 0.3, angle: 0.3, gap: 10, line: '#7aa85a', width: 2 });
      C.shape(g, [[-20, 440], ...Array.from({ length: 7 }, (_, i) => [(i / 6) * (W + 40) - 20, 300 + Math.cos(i * 1.7) * 18 + C.j(3)]), [W + 20, 440]], K.hill, { shade: K.hillShade, alpha: 0.35, angle: -0.3, gap: 9, line: '#7aa85a', width: 2 });
      // little trees on the hills
      for (const f of [0.38, 0.45, 0.93]) tree(g, W * f, 300, 0.5);
      // the windmill's tower (its sails turn, live())
      const wx = mill(W) || -999;
      C.shape(g, [[wx - 30, 300], [wx - 18, 202], [wx + 18, 202], [wx + 30, 300]], '#fff7ea', { shade: '#e8d8c0', alpha: 0.55, angle: 1.45, gap: 6, sharp: true });
      for (let y = 222; y < 296; y += 18) C.stroke(g, [[wx - 18 - (y - 202) * 0.12, y], [wx + 18 + (y - 202) * 0.12, y + 1]], '#d8c3a2', 2, 0.8);
      C.shape(g, [[wx - 9, 300], [wx - 9, 282], [wx - 5, 276], [wx + 5, 276], [wx + 9, 282], [wx + 9, 300]], '#9b6b46', { width: 2, sharp: true });
      C.shape(g, C.box(wx - 6, 236, 12, 14, 3), '#7fb5d6', { width: 2 });
      C.shape(g, [[wx - 24, 206], [wx - 22, 192], [wx - 12, 180], [wx, 176], [wx + 12, 180], [wx + 22, 192], [wx + 24, 206]], K.roof, { shade: K.roofShade, angle: 1.4, gap: 5, sharp: true });
      // the grass, from the hills down
      C.shape(g, [[-10, 336], [W * 0.3, 330], [W * 0.7, 338], [W + 10, 332], [W + 10, 730], [-10, 730]], K.grass, { shade: K.grassShade, alpha: 0.35, angle: -0.15, gap: 11, stroke: 5, outline: false, sharp: true });
      // the silo, behind the barn: a round tower with a dome, metal bands that curve round it, a ladder
      const bx = W * 0.07, by = 352;
      const sx = bx + 232, sw = 66, st = by - 160;
      C.shape(g, edges([[sx, st], [sx + sw, st], [sx + sw, by + 4], [sx, by + 4]]), K.silo, { shade: K.siloShade, angle: 1.5, gap: 6, sharp: true });
      C.scribble(g, edges([[sx + sw * 0.66, st], [sx + sw, st], [sx + sw, by], [sx + sw * 0.66, by]]), K.siloShade, { angle: 1.5, gap: 4, width: 4, alpha: 0.7, sharp: true });
      for (let y = st + 26; y < by; y += 28) C.stroke(g, Array.from({ length: 5 }, (_, i) => [sx + 2 + (i / 4) * (sw - 4), y + Math.sin((i / 4) * Math.PI) * 5]), '#7d8fa3', 2.5, 0.8);
      for (const x of [sx + 10, sx + 22]) C.stroke(g, [[x, st + 8], [x, by]], '#6f7f92', 2.5);
      for (let y = st + 18; y < by; y += 14) C.stroke(g, [[sx + 10, y], [sx + 22, y]], '#6f7f92', 2);
      C.shape(g, Array.from({ length: 15 }, (_, i) => { const t = Math.PI + (i / 14) * Math.PI; return [sx + sw / 2 + Math.cos(t) * (sw / 2 + 3), st + 2 + Math.sin(t) * 34]; }), K.siloShade, { shade: '#7d8fa3', angle: 0.5, gap: 5, sharp: true });
      C.stroke(g, [[sx + 14, st - 18], [sx + 22, st - 26]], '#d6e0ea', 3);
      C.shape(g, C.box(sx + sw / 2 - 7, st - 40, 14, 9, 3), '#7d8fa3', { width: 2 });
      // the barn: a gambrel-ish house shape with real corners, and a roof that hangs over its walls
      C.shape(g, edges([[bx, by], [bx, by - 120], [bx + 125, by - 196], [bx + 250, by - 120], [bx + 250, by]]), K.barn, { shade: K.barnShade, angle: 1.5, gap: 7, alpha: 0.5, sharp: true });
      for (let x = bx + 30; x < bx + 240; x += 30) if (x < bx + 66 || x > bx + 184) C.stroke(g, [[x, by - 100], [x, by - 4]], K.barnShade, 2, 0.6);
      C.shape(g, edges([[bx - 14, by - 112], [bx + 125, by - 208], [bx + 264, by - 112], [bx + 252, by - 102], [bx + 125, by - 188], [bx - 2, by - 102]], 1), K.roof, { shade: K.roofShade, sharp: true });
      // the big door with its white cross, and the hay loft
      const door = C.box(bx + 70, by - 104, 110, 104, 2);
      C.shape(g, door, K.barnShade, { shade: '#a83525', alpha: 0.4, angle: 1.5, sharp: true });
      C.stroke(g, [[bx + 72, by - 102], [bx + 178, by - 2]], K.trim, 5);
      C.stroke(g, [[bx + 178, by - 102], [bx + 72, by - 2]], K.trim, 5);
      C.pencil(g, door, { color: K.trim, width: 5, passes: 1 });
      C.shape(g, C.box(bx + 104, by - 160, 42, 36, 2), '#5a2a22', { line: K.trim, width: 4, sharp: true });
      for (let i = 0; i < 4; i++) C.stroke(g, [[bx + 108 + i * 10, by - 128], [bx + 112 + i * 9, by - 140 - (i % 2) * 6]], K.hay, 3);
      // the fence along the back of the pen
      const fy = 372;
      C.shape(g, C.box(-10, fy - 30, W + 20, 9, 3, 1), K.wood, { shade: K.woodShade, angle: 0, gap: 4 });
      C.shape(g, C.box(-10, fy - 6, W + 20, 9, 3, 1), K.wood, { shade: K.woodShade, angle: 0, gap: 4 });
      for (let x = 20; x < W; x += 74) {
        post(g, x, fy - 48, 14, 60);
        for (const y of [fy - 26, fy - 2]) C.shape(g, C.blob(x + 7, y, 1.8, 1.8, 0.1, 6), K.woodDark, { outline: false });
      }
      // the pond, with reeds
      for (const p of this.water(W)) {
        C.shape(g, C.blob(p.x, p.y, p.rx + 10, p.ry + 8, 0.05), '#8bc46a', { outline: false });
        C.shape(g, C.blob(p.x, p.y, p.rx, p.ry, 0.04), K.water, { shade: K.waterShade, angle: 0.05, gap: 8, alpha: 0.4, line: '#3f86b4' });
        for (let i = 0; i < 3; i++) C.stroke(g, [[p.x - p.rx * 0.5 + i * 30, p.y - 6 + i * 8], [p.x - p.rx * 0.5 + i * 30 + 18, p.y - 6 + i * 8]], '#ffffff', 2.5, 0.8);
        for (const d of [-1, -0.8, 0.85, 1]) {
          const rx = p.x + d * p.rx, ry = p.y - 6;
          C.stroke(g, [[rx, ry + 8], [rx + C.j(4), ry - 34 - Math.abs(C.j(10))]], '#4f8a35', 3);
          C.shape(g, C.blob(rx + 1, ry - 34, 4, 9, 0.1, 10), '#8a5a31', { outline: false });
        }
      }
      // grass tufts and flowers all over, more towards the front
      const r = C.seeded(31);
      for (let i = 0; i < W / 9; i++) {
        const x = r() * W, y = 395 + r() ** 0.7 * 320;
        if (this.water(W).some((p) => Math.hypot((x - p.x) / (p.rx + 30), (y - p.y) / (p.ry + 20)) < 1)) continue;
        if (r() < 0.22) flower(g, x, y - 12, K.petal[Math.floor(r() * 4)], 0.8 + (y - 400) / 400);
        else tuft(g, x, y, 0.7 + (y - 400) / 400);
      }
    },
    front(g, W) {
      // tall grass along the bottom edge, and a fence post in each corner
      for (let x = -10; x < W + 10; x += 13) tuft(g, x + C.j(4), 722, 1.8, x % 26 ? K.tuft : K.grassShade);
      post(g, -6, 598, 22, 132);
      post(g, W - 16, 598, 22, 132);
    },
    props: (W) => [
      { x: W * 0.17, y: 478, w: 150, h: 100, ax: 75, ay: 92, draw(g) {
        const front = edges([[-66, -56], [50, -56], [50, -4], [-66, -4]]);
        const top = edges([[-66, -56], [-48, -80], [68, -80], [50, -56]]);
        const side = edges([[50, -56], [68, -80], [68, -28], [50, -4]]);
        C.shape(g, front, K.hay, { shade: K.hayShade, angle: 0.08, gap: 5, alpha: 0.55, sharp: true });
        C.shape(g, top, '#fbe58f', { shade: K.hay, angle: 0.5, gap: 5, alpha: 0.6, sharp: true });
        C.shape(g, side, K.hayShade, { shade: '#c0901e', angle: 1.2, gap: 4, alpha: 0.6, sharp: true });
        for (const x of [-34, 14]) C.stroke(g, [[x, -4], [x, -56], [x + 18, -80]], '#a8781a', 3.5);
        for (const [x, y, dx, dy] of [[-58, -60, -8, -6], [-40, -78, -4, -10], [-6, -80, 2, -10], [30, -80, 6, -9], [62, -74, 9, -6], [66, -46, 10, 2], [-66, -30, -10, 1], [-20, -4, -3, 8], [36, -4, 4, 8]]) C.stroke(g, [[x - dx * 0.4, y - dy * 0.4], [x + dx, y + dy]], '#c9971f', 2.5);
      } },
      // a wooden water trough, seen a little from above
      { x: W * 0.6, y: 446, w: 200, h: 90, ax: 100, ay: 80, draw(g) {
        for (const x of [-70, 58]) C.shape(g, [[x, -20], [x + 12, -20], [x + 14, 0], [x - 2, 0]], K.woodDark, { width: 2, sharp: true });
        C.shape(g, [[-74, -66], [74, -66], [74, -56], [-74, -56]], K.woodShade, { width: 2, sharp: true });
        C.shape(g, [[-74, -57], [74, -57], [78, -46], [-78, -46]], K.water, { shade: K.waterShade, angle: 0, gap: 4, width: 2, sharp: true });
        C.stroke(g, [[-40, -52], [-22, -52]], '#ffffff', 2.5);
        C.stroke(g, [[18, -51], [40, -51]], '#ffffff', 2.5);
        C.shape(g, [[-80, -47], [80, -47], [74, -16], [-74, -16]], K.wood, { shade: K.woodShade, angle: 0.03, gap: 5, sharp: true });
        for (const y of [-37, -26]) C.stroke(g, [[-77, y], [77, y]], K.woodShade, 2.5);
        for (const d of [-1, 1]) {
          post(g, d * 82 - 7, -74, 14, 60);
          for (const y of [-58, -30]) C.shape(g, C.blob(d * 82, y, 2.5, 2.5, 0.1, 6), K.woodDark, { outline: false });
        }
      } },
    ],
    live(g, W, t, night) {
      const sx = W * 0.86, sy = 92;
      g.save();
      g.translate(sx, sy);
      if (night) {
        g.drawImage(art('moon'), -52, -52, 104, 104);
      } else {
        g.rotate(t * 0.05);
        g.drawImage(art('sun'), -90, -90, 180, 180);
      }
      g.restore();
      clouds(g, W, t, 160);
    },
    // the windmill's sails, over its tower, faster after a click (page.js sets spin)
    over(g, W) {
      if (!mill(W)) return;
      farm.turn = (farm.turn || 0) + 0.008 + (farm.spin || 0);
      farm.spin = Math.max(0, (farm.spin || 0) * 0.985);
      g.save();
      g.translate(mill(W), 196);
      g.rotate(farm.turn);
      g.drawImage(art('sails'), -85, -85, 170, 170);
      g.restore();
    },
  };

  // ---------- crumbs café ----------
  // the clock hangs on the wall over the counter, clear of the menu board
  // the lamps over the room: the second only where it won't hang in front of the window
  const lampsAt = (W) => (W >= 900 ? [W * 0.22, W * 0.83] : [W * 0.22]);
  const clockAt = (W) => ({ x: Math.min(W * 0.22, 220) * 0.45, y: 122 });
  const cafe = {
    id: 'cafe', name: 'Crumbs Cafe', says: 'the cafe',
    ground: (W) => ({ top: 480, bottom: 692, left: 40, right: W - 40 }),
    water: () => [],
    spots: (W) => [{ ...clockAt(W), r: 46, name: 'clock' }, { x: Math.min(W * 0.22, 220) * 0.91, y: 274, r: 30, name: 'bell' }],
    sky(g, W) {
      g.fillStyle = '#fdeedd';
      g.fillRect(0, 0, W, 720);
    },
    back(g, W) {
      // striped wallpaper, then wooden panels low down
      for (let x = 0; x < W; x += 56) C.scribble(g, [[x, 0], [x + 24, 0], [x + 24, 380], [x, 380]], '#f6b9b4', { angle: 1.57, gap: 6, width: 4, alpha: 0.55, over: 0 });
      C.shape(g, [[-10, 330], [W + 10, 330], [W + 10, 440], [-10, 440]], '#c98d5a', { shade: '#a8703f', angle: 1.55, gap: 9, alpha: 0.35, width: 2, sharp: true });
      // raised panels, lit along their top and left, in shadow along the bottom and right, between a rail
      // and a skirting board
      for (let px = 14; px < W; px += 86) {
        C.shape(g, box4(px, 346, 58, 74, 0.6), '#d39a66', { sharp: true, width: 1.8, line: '#8a5a31' });
        for (const [a, b, c] of [[[px + 4, 416], [px + 4, 350], '#e8b98a'], [[px + 4, 350], [px + 54, 350], '#e8b98a'], [[px + 54, 351], [px + 54, 416], '#9a6538'], [[px + 54, 416], [px + 5, 416], '#9a6538']]) C.stroke(g, [a, b], c, 2.5, 0.9);
      }
      C.shape(g, box4(-10, 322, W + 20, 12, 0.6), '#8a5a31', { shade: '#6d4523', angle: 0, gap: 4, sharp: true });
      C.shape(g, box4(-10, 428, W + 20, 13, 0.6), '#8a5a31', { shade: '#6d4523', angle: 0, gap: 4, sharp: true });
      // the floor: wide boards running into the room
      C.shape(g, [[-10, 440], [W + 10, 440], [W + 10, 730], [-10, 730]], '#efc08a', { shade: '#d9a066', angle: 0.02, gap: 12, alpha: 0.4, outline: false, sharp: true });
      for (let y = 470; y < 720; y += 44 + (y - 470) * 0.2) C.stroke(g, [[-10, y], [W + 10, y + C.j(3)]], '#b77e47', 2, 0.7);
      for (let i = 0; i < W / 70; i++) { const y = 450 + (i * 97) % 260; C.stroke(g, [[(i * 173) % W, y], [(i * 173) % W + C.j(2), y + 22]], '#b77e47', 2, 0.5); }
      // the window, with the street outside
      const wx = W * 0.56, ww = Math.min(300, W * 0.28);
      C.shape(g, C.box(wx - 12, 58, ww + 24, 226, 6), '#c98d5a', { shade: '#a8703f', angle: 1.5 });
      C.shape(g, C.box(wx, 70, ww, 202, 4), K.sky, { shade: K.skyShade, angle: 0.1, gap: 12, alpha: 0.4, line: '#8a5a31' });
      // across the road, the tops of puddle corner's shops and a tree between two of them
      g.save();
      C.trace(g, C.box(wx, 70, ww, 202, 4));
      g.clip();
      C.stroke(g, [[wx + ww * 0.4, 196], [wx + ww * 0.4 - 1, 280]], K.trunk, 7);
      C.shape(g, C.blob(wx + ww * 0.4, 176, 26, 30, 0.1), K.leaf, { shade: K.leafShade, alpha: 0.4, gap: 5, width: 2 });
      for (const [f, fw, ty, k] of [[-0.02, 0.32, 150, 0], [0.62, 0.22, 128, 3], [0.82, 0.24, 164, 2]]) {
        const sh = SHOPS[k], bx = wx + ww * f, bw = ww * fw;
        if (k === 0) C.shape(g, [[bx - 6, ty + 2], [bx + bw / 2, ty - 26], [bx + bw + 6, ty + 2]], '#8e3b30', { sharp: true, width: 2 });
        if (k === 3) C.shape(g, [[bx - 4, ty + 2], [bx + 6, ty - 18], [bx + bw - 6, ty - 18], [bx + bw + 4, ty + 2]], '#6f6a86', { sharp: true, width: 2 });
        C.shape(g, edges([[bx, 290], [bx, ty], [bx + bw, ty], [bx + bw, 290]], 0.6), sh.wall, { shade: sh.shade, angle: 1.5, gap: 6, alpha: 0.3, sharp: true, width: 2 });
        for (const [px, py] of [[0.2, 18], [0.6, 18], [0.2, 54], [0.6, 54]]) C.shape(g, box4(bx + bw * px, ty + py, bw * 0.22, 22, 0.3), '#d3ecf8', { sharp: true, width: 1.6 });
      }
      g.restore();
      C.stroke(g, [[wx + ww / 2, 72], [wx + ww / 2, 270]], '#8a5a31', 6);
      C.stroke(g, [[wx + 2, 170], [wx + ww - 2, 170]], '#8a5a31', 6);
      // curtains, gathered in at a tie halfway down and falling out again below it, on a rod with knobs
      for (const [x0, d] of [[wx - 26, 1], [wx + ww + 26, -1]]) {
        C.shape(g, C.poly([[x0, 46], [x0 + d * 54, 46], [x0 + d * 44, 104], [x0 + d * 26, 172], [x0 + d * 34, 236], [x0 + d * 52, 300], [x0, 304]], 1), '#9fd8a4', { shade: '#6fbb7a', angle: 1.5, gap: 6 });
        for (const k of [0.3, 0.62]) {
          C.stroke(g, [[x0 + d * 54 * k, 50], [x0 + d * 22 * k + d * 4, 168]], '#6fbb7a', 2, 0.8);
          C.stroke(g, [[x0 + d * 22 * k + d * 4, 178], [x0 + d * 50 * k, 296]], '#6fbb7a', 2, 0.8);
        }
        C.shape(g, C.poly([[x0 - d * 2, 166], [x0 + d * 30, 168], [x0 + d * 30, 178], [x0 - d * 2, 176]], 0.6), '#f6c3cc', { shade: '#e597a6', width: 2 });
      }
      C.stroke(g, [[wx - 52, 44], [wx + ww + 52, 44]], '#8a5a31', 6);
      for (const x of [wx - 54, wx + ww + 54]) C.shape(g, C.blob(x, 44, 7, 7, 0.06, 10), '#8a5a31', { width: 2 });
      // the chalkboard menu
      const mx = Math.max(W * 0.27, 250), mw = Math.min(200, W * 0.2);
      if (W > 640) {
        C.shape(g, C.box(mx, 64, mw, 190, 4), '#3f5a4a', { shade: '#2f4a3b', angle: 0.3, gap: 7, alpha: 0.6, line: '#8a5a31', width: 5 });
        g.save();
        g.fillStyle = '#f6f1e4';
        g.font = '700 26px Gaegu, sans-serif';
        g.textAlign = 'center';
        g.fillText('today', mx + mw / 2, 100);
        g.font = '400 21px Gaegu, sans-serif';
        ['leaf pie', 'fish tarts', 'dewdrop tea', 'crumbs (free)'].forEach((line, i) => g.fillText(line, mx + mw / 2, 136 + i * 28));
        g.restore();
        C.stroke(g, [[mx + mw / 2 - 30, 110], [mx + mw / 2 - 10, 113], [mx + mw / 2 + 12, 109], [mx + mw / 2 + 30, 112]], '#f6f1e4', 2, 0.8);
        C.shape(g, box4(mx + 8, 252, mw - 16, 7, 0.4), '#8a5a31', { sharp: true, width: 2 });
        C.shape(g, box4(mx + mw * 0.66, 246, 16, 6, 0.3), '#fff7ea', { sharp: true, width: 1.4 });
        // a little painting of the hills in a frame, in the gap before the window
        const gap0 = mx + mw, gap1 = wx - 58;
        if (gap1 - gap0 > 130) {
          const px = (gap0 + gap1) / 2;
          C.shape(g, box4(px - 40, 96, 80, 62, 0.5), '#c98d5a', { shade: '#a8703f', angle: 0.8, gap: 4, sharp: true });
          C.shape(g, box4(px - 31, 105, 62, 44, 0.4), K.sky, { sharp: true, width: 1.6 });
          C.shape(g, [[px - 31, 149], [px - 31, 132], [px - 12, 124], [px + 8, 133], [px + 31, 127], [px + 31, 149]], K.hill, { shade: K.hillShade, alpha: 0.4, gap: 4, sharp: true, width: 1.6 });
          C.shape(g, C.blob(px + 16, 116, 6, 6, 0.06, 10), K.sun, { width: 1.4 });
          C.stroke(g, [[px - 14, 92], [px, 80], [px + 14, 92]], INK, 1.5);
        }
      }
      // the counter, with a cake under a glass and the coffee machine
      const cw = Math.min(W * 0.22, 220);
      C.shape(g, edges([[-12, 308], [cw - 4, 308], [cw - 4, 470], [-12, 470]]), '#f6c3cc', { shade: '#e597a6', angle: 1.5, gap: 8, sharp: true });
      C.shape(g, edges([[-12, 456], [cw - 4, 456], [cw - 4, 470], [-12, 470]]), '#e597a6', { width: 2, sharp: true });
      C.shape(g, edges([[-12, 288], [cw + 8, 288], [cw + 8, 309], [-12, 309]]), '#8a5a31', { shade: '#6d4523', angle: 0, sharp: true });
      for (let x = 14; x < cw - 10; x += 34) C.stroke(g, [[x, 320], [x, 456]], '#e597a6', 3, 0.8);
      espresso(g, cw * 0.62, 289, Math.min(1, cw / 220));
      // the bell (ring it)
      const bx2 = cw * 0.91;
      C.shape(g, [[bx2 - 16, 286], [bx2 - 13, 272], [bx2 - 6, 265], [bx2 + 6, 265], [bx2 + 13, 272], [bx2 + 16, 286]], '#ffd84f', { shade: '#efb52d', width: 2, sharp: true });
      C.shape(g, C.box(bx2 - 20, 284, 40, 5, 2), '#8a5a31', { outline: false });
      C.shape(g, C.blob(bx2, 262, 3, 3, 0.1, 8), '#3a3034', { outline: false });
      if (cw > 160) {
        const kx = cw * 0.22;
        C.shape(g, C.poly([[kx - 30, 288], [kx - 30, 262], [kx + 30, 262], [kx + 30, 288]]), '#fff7ea', { shade: '#ffe3a8', gap: 5, sharp: true });
        C.shape(g, C.poly([[kx - 26, 262], [kx - 26, 248], [kx + 26, 248], [kx + 26, 262]]), '#ff8fb1', { shade: '#e5638e', gap: 5, sharp: true });
        // a glass dome over it, on a plate
        C.pencil(g, [...Array.from({ length: 13 }, (_, i) => { const a = Math.PI + (i / 12) * Math.PI; return [kx + Math.cos(a) * 40, 286 + Math.sin(a) * 52]; })], { color: '#7fb2cc', width: 2.5, closed: false });
        C.stroke(g, [[kx - 22, 252], [kx - 26, 266]], '#ffffff', 3);
        C.shape(g, C.box(kx - 46, 284, 92, 5, 2), '#fff7ea', { width: 2 });
        C.shape(g, C.blob(kx, 230, 5, 5, 0.1, 8), '#7fb2cc', { width: 2 });
        C.shape(g, C.blob(kx, 242, 5, 5, 0.1, 8), '#e5383b', { outline: false });
      }
      // the lamps hanging from the ceiling
      for (const x of lampsAt(W)) {
        const f = x / W;
        C.stroke(g, [[W * f, 0], [W * f, 40]], INK, 2);
        C.shape(g, C.blob(W * f, 72, 8, 7, 0.05, 10), '#fff7ea', { width: 1.6 });
        C.shape(g, [[W * f - 27, 70], [W * f - 12, 38], [W * f + 12, 38], [W * f + 27, 70]], '#ffd84f', { shade: '#ffb42e', angle: 1.5, gap: 5, sharp: true });
        C.shape(g, box4(W * f - 5, 32, 10, 7, 0.3), INK, { outline: false });
      }
    },
    front() {},
    props: (W) => {
      const table = (x, y, set) => ({ x, y, w: 200, h: 170, ax: 100, ay: 160, draw(g) {
        C.shape(g, C.box(-8, -112, 16, 108, 3), '#8a5a31', { shade: '#6d4523', angle: 1.5, gap: 4 });
        C.shape(g, C.blob(0, -6, 40, 9, 0.05), '#8a5a31', { outline: false });
        C.shape(g, C.blob(0, -120, 88, 22, 0.03), '#fff7ea', { shade: '#f6c3cc', angle: 0.1, gap: 7, alpha: 0.6 });
        if (set === 'tea') {
          // a teacup on its saucer, steam coming off it, and the crumbs of whatever was eaten
          C.shape(g, C.blob(-25, -127, 16, 4, 0.05, 12), '#fff7ea', { width: 1.6 });
          C.stroke(g, [[-17, -142], [-11, -140], [-17, -134]], INK, 2);
          C.shape(g, [[-34, -146], [-16, -146], [-19, -129], [-31, -129]], '#9fd8a4', { sharp: true, width: 2 });
          C.stroke(g, [[-27, -152], [-23, -160], [-27, -168]], '#b6a99b', 2, 0.7);
          for (const [cx, cy] of [[18, -126], [26, -122], [31, -128], [22, -131]]) C.shape(g, C.blob(cx, cy, 2, 1.5, 0.1, 6), '#d8ab2d', { outline: false });
        } else {
          // a bun on a plate, and a mug on the far side
          C.shape(g, C.blob(-14, -124, 22, 6, 0.05, 14), '#fff7ea', { width: 1.6 });
          C.shape(g, C.blob(-14, -132, 13, 8, 0.06, 14), '#e0a05a', { shade: '#c07a38', alpha: 0.5, gap: 4, width: 1.8 });
          C.stroke(g, [[-20, -136], [-12, -138], [-6, -135]], '#fff7ea', 2);
          C.shape(g, [[22, -150], [38, -150], [38, -128], [22, -128]], '#ffb6d2', { shade: '#e5638e', alpha: 0.3, sharp: true, width: 2 });
          C.stroke(g, [[38, -146], [44, -144], [44, -134], [38, -132]], INK, 2);
        }
      } });
      return [table(W * 0.46, 548, 'tea'), table(W * 0.78, 640, 'bun'), { x: W - 44, y: 470, w: 90, h: 170, ax: 45, ay: 160, draw(g) {
        C.shape(g, C.poly([[-26, -54], [26, -54], [20, -2], [-20, -2]]), '#e4785a', { shade: '#c4553a', gap: 5 });
        for (const [a, l] of [[-0.5, 80], [0, 100], [0.45, 86], [-0.2, 60], [0.25, 66]]) {
          const tx = Math.sin(a) * l, ty = -54 - Math.cos(a) * l;
          C.stroke(g, [[0, -54], [tx * 0.5, ty * 0.6 - 20], [tx, ty]], '#4e9a3a', 3);
          C.shape(g, C.blob(tx, ty, 12, 20, 0.06, 12), K.leaf, { shade: K.leafShade, width: 1.8 });
        }
      } }];
    },
    live(g, W, t, night) {
      // the clock tells the real time
      const { x: cx, y: cy } = clockAt(W);
      g.drawImage(art('clock'), cx - 46, cy - 46, 92, 92);
      const now = new Date();
      const hr = ((now.getHours() % 12) + now.getMinutes() / 60) / 12 * Math.PI * 2;
      const mn = (now.getMinutes() / 60) * Math.PI * 2;
      g.save();
      g.strokeStyle = INK;
      g.lineCap = 'round';
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(hr) * 18, cy - Math.cos(hr) * 18); g.stroke();
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(mn) * 27, cy - Math.cos(mn) * 27); g.stroke();
      g.restore();
      // the window's sky goes dark at night
      if (night) {
        const wx = W * 0.56, ww = Math.min(300, W * 0.28);
        g.fillStyle = 'rgba(40, 46, 110, .5)';
        g.fillRect(wx + 4, 74, ww - 8, 194);
      }
    },
  };

  // crumbs café's espresso machine, standing on the counter at (x, y): cups warming on top, a gauge, two
  // handles sticking out, a cup under one spout with coffee running in, a drip tray and the steam wand
  function espresso(g, x, y, s) {
    const teal = '#7fc8b4', tealShade = '#5aa894', chrome = '#d5dde3', chromeShade = '#9aa8b3';
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    for (const cx of [-15, 9]) C.shape(g, [[cx - 8, -86], [cx + 8, -86], [cx + 6, -97], [cx - 6, -97]], '#fff7ea', { sharp: true, width: 1.8 });
    C.stroke(g, [[38, -60], [47, -55], [48, -24]], INK, 6);
    C.stroke(g, [[38, -60], [47, -55], [48, -24]], chrome, 3);
    C.shape(g, box4(-37, -84, 74, 82, 0.5), teal, { shade: tealShade, angle: 1.5, gap: 5, sharp: true });
    C.shape(g, box4(-34, -88, 68, 5, 0.3), chrome, { sharp: true, width: 1.8 });
    C.shape(g, box4(-25, -42, 50, 38, 0.4), C.mix(tealShade, INK, 0.45), { sharp: true, width: 2 });
    C.shape(g, C.blob(0, -64, 12, 12, 0.02, 16), chrome, { width: 2 });
    C.shape(g, C.blob(0, -64, 8, 8, 0.02, 14), '#fff7ea', { outline: false });
    C.stroke(g, [[0, -64], [5, -69]], '#e5383b', 1.8);
    C.shape(g, C.blob(0, -78, 9, 2.5, 0.05, 10), '#e0b040', { width: 1.2 });
    for (const d of [-1, 1]) {
      C.shape(g, box4(d * 12 - 7, -44, 14, 8, 0.3), chrome, { sharp: true, width: 1.8 });
      C.shape(g, box4(d * 12 - 5, -36, 10, 5, 0.3), chromeShade, { sharp: true, width: 1.4 });
      C.stroke(g, [[d * 16, -34], [d * 33, -29]], INK, 5);
    }
    C.stroke(g, [[-12, -31], [-12, -19]], '#7a4a2a', 2.2);
    C.shape(g, [[-20, -19], [-4, -19], [-6, -6], [-18, -6]], '#fff7ea', { sharp: true, width: 1.8 });
    C.stroke(g, [[-4, -16], [1, -14], [-5, -9]], INK, 1.6);
    C.shape(g, box4(-26, -6, 52, 5, 0.3), chrome, { sharp: true, width: 1.8 });
    for (const fx of [-34, 26]) C.shape(g, box4(fx, -2, 8, 3, 0.2), INK, { outline: false });
    g.restore();
  }

  // ---------- puddle corner, a street ----------
  // a row of shops, each built its own way: its own width and height, roof, windows upstairs, sign, awning (or
  // none), door on its own side and its own things in the window. a narrow stage shows the first three. all
  // straight edged (edges() + sharp), since smoothing makes a building into a bean
  const box4 = (x, y, w, h, rough = 1) => edges([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], rough);
  // words that shrink until they fit
  const label = (g, text, cx, cy, maxW, size, colour = INK) => {
    g.save();
    let s = size;
    do g.font = `700 ${s}px Gaegu, sans-serif`; while (g.measureText(text).width > maxW && --s > 11);
    g.fillStyle = colour;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, cx, cy + 1);
    g.restore();
  };
  const FOOT = 452;
  // the hydrant stands near the end of the street, clear of the plant shop's pots
  const hydrantAt = (W) => W - Math.max(60, W * 0.07);
  const street = {
    id: 'street', name: 'Puddle Corner', says: 'the corner',
    ground: (W) => ({ top: 458, bottom: 678, left: 40, right: W - 40 }),
    water: (W) => [{ x: W * 0.44, y: 608, rx: 74, ry: 22 }, { x: W * 0.16, y: 650, rx: 54, ry: 16 }],
    spots: (W) => [{ x: W * 0.9, y: 80, r: 56, name: 'sun' }, { x: hydrantAt(W), y: 500, r: 34, name: 'hydrant' }],
    sky(g, W) { skyFill(g, W, 300); },
    back(g, W) {
      // things that sit on the pavement (door steps, pots), drawn once it's down
      const later = [];
      shopRow(W).forEach(({ s, x, w }, i) => shop(g, s, x, w, C.seeded(40 + i), later));
      // the pavement, its slabs, and the kerb and road
      C.shape(g, [[-10, 446], [W + 10, 446], [W + 10, 700], [-10, 700]], '#dcd8d2', { shade: '#c4beb6', angle: 0.02, gap: 14, alpha: 0.35, outline: false, sharp: true });
      for (let y = 446; y < 700; y += 64) C.stroke(g, [[-10, y], [W + 10, y + C.j(2)]], '#a9a198', 2, 0.6);
      for (let x = 0, row = 0; row < 4; row++) for (x = (row % 2) * 60; x < W; x += 120) C.stroke(g, [[x, 446 + row * 64], [x + C.j(3), 446 + (row + 1) * 64]], '#a9a198', 2, 0.6);
      // a crack or two across the slabs
      for (const [cx, cy] of [[W * 0.33, 560], [W * 0.71, 630]]) C.stroke(g, [[cx, cy], [cx + 14, cy + 6], [cx + 20, cy + 3], [cx + 34, cy + 10]], '#a9a198', 1.6, 0.7);
      for (const f of later) f();
      C.shape(g, C.box(-10, 690, W + 20, 14, 2), '#b5aea5', { line: '#7d746c', width: 2 });
      C.shape(g, [[-10, 704], [W + 10, 704], [W + 10, 730], [-10, 730]], '#5f5a60', { shade: '#4d484e', angle: 0, gap: 8, outline: false, sharp: true });
      for (let x = 20; x < W; x += 110) C.shape(g, C.box(x, 712, 54, 6, 2), '#ffd84f', { outline: false });
      // a drain in the kerb
      const dx = W * 0.56;
      C.shape(g, box4(dx, 688, 40, 14, 0.5), '#4d484e', { sharp: true, width: 2 });
      for (let k = 1; k < 5; k++) C.stroke(g, [[dx + k * 8, 690], [dx + k * 8, 700]], '#8a8f96', 2);
      // puddles
      for (const p of this.water(W)) C.shape(g, C.blob(p.x, p.y, p.rx, p.ry, 0.08), '#a9d8f2', { shade: '#7fbfe6', angle: 0, gap: 6, alpha: 0.5, line: '#6a9ab8', width: 2 });
      // a few weeds in the cracks
      const r = C.seeded(5);
      for (let i = 0; i < W / 120; i++) tuft(g, r() * W, 450 + r() * 240, 0.6, '#7aa85a');
    },
    front(g, W) {},
    props: (W) => [
      // a bench
      { x: W * 0.3, y: 480, w: 220, h: 110, ax: 110, ay: 100, draw(g) {
        const iron = '#4d5560';
        for (const x of [-80, 74]) C.shape(g, edges([[x, -100], [x + 7, -100], [x + 7, -48], [x, -48]], 0.6), iron, { width: 2, sharp: true });
        for (const y of [-98, -80]) C.shape(g, edges([[-96, y], [96, y], [96, y + 13], [-96, y + 13]]), K.wood, { shade: K.woodShade, angle: 0, gap: 4, sharp: true });
        C.shape(g, edges([[-96, -56], [96, -56], [104, -42], [-88, -42]]), '#d9a066', { shade: K.wood, angle: 0, gap: 4, sharp: true });
        C.shape(g, edges([[-88, -42], [104, -42], [104, -34], [-88, -34]]), K.woodShade, { width: 2, sharp: true });
        for (const x of [-82, 82]) {
          C.stroke(g, [[x, -34], [x - 4, 0]], iron, 6);
          C.stroke(g, [[x + 10, -34], [x + 14, -6]], iron, 5);
        }
      } },
      // the lamppost: a stepped foot, a post with collars and the lamplighter's bar, and the lantern sitting
      // in a cup on top of the post, so it's held up by something
      { x: W * 0.64, y: 470, w: 90, h: 360, ax: 45, ay: 350, draw(g) {
        const iron = '#4d5560', dark = '#353b44';
        C.shape(g, box4(-17, -24, 34, 22, 0.6), iron, { shade: dark, angle: 1.5, gap: 4, sharp: true });
        C.shape(g, box4(-12, -40, 24, 17, 0.6), iron, { shade: dark, angle: 1.5, gap: 4, sharp: true });
        C.shape(g, box4(-5, -268, 10, 230, 0.6), iron, { shade: dark, angle: 1.5, gap: 4, sharp: true });
        for (const y of [-126, -244]) C.shape(g, box4(-8, y, 16, 8, 0.4), iron, { sharp: true, width: 2 });
        C.stroke(g, [[-17, -252], [17, -252]], iron, 4);
        for (const x of [-18, 18]) C.shape(g, C.blob(x, -252, 3.5, 3.5, 0.05, 8), iron, { width: 1.6 });
        C.shape(g, [[-6, -266], [6, -266], [15, -282], [-15, -282]], iron, { sharp: true, width: 2.2 });
        const glass = [[-14, -282], [14, -282], [20, -318], [-20, -318]];
        C.shape(g, glass, '#fff3bf', { shade: '#ffe08a', alpha: 0.5, angle: 1.5, gap: 5, sharp: true, line: dark, width: 2.4 });
        C.shape(g, C.blob(0, -296, 6, 8, 0.05, 10), '#ffd84f', { outline: false });
        for (const [a, b] of [[[-14, -282], [-20, -318]], [[0, -282], [0, -318]], [[14, -282], [20, -318]]]) C.stroke(g, [a, b], dark, 2.6);
        C.shape(g, [[-26, -317], [26, -317], [9, -336], [-9, -336]], iron, { shade: dark, angle: 0.4, gap: 4, sharp: true });
        C.shape(g, C.blob(0, -341, 4.5, 5, 0.05, 10), iron, { width: 2 });
      } },
      // the fire hydrant (click it)
      { x: hydrantAt(W), y: 520, w: 80, h: 100, ax: 40, ay: 94, draw(g) {
        const red = '#e5383b', dark = '#b8252a';
        C.shape(g, box4(-23, -10, 46, 9, 0.5), dark, { sharp: true, width: 2.2 });
        C.shape(g, box4(-16, -60, 32, 50, 0.6), red, { shade: dark, angle: 1.5, gap: 5, sharp: true });
        for (const d of [-1, 1]) {
          C.shape(g, box4(d < 0 ? -25 : 16, -45, 9, 14, 0.4), dark, { sharp: true, width: 2 });
          C.shape(g, C.blob(d * 26, -38, 5, 7, 0.05, 10), red, { width: 2 });
        }
        C.shape(g, C.blob(0, -34, 9, 9, 0.05, 12), dark, { width: 2 });
        C.shape(g, C.blob(0, -34, 3, 3, 0.05, 8), '#ffd84f', { outline: false });
        C.shape(g, box4(-20, -66, 40, 7, 0.4), dark, { sharp: true, width: 2 });
        C.shape(g, Array.from({ length: 9 }, (_, i) => { const a = Math.PI + (i / 8) * Math.PI; return [Math.cos(a) * 16, -66 + Math.sin(a) * 15]; }), red, { shade: dark, gap: 4, sharp: true });
        C.shape(g, box4(-5, -86, 10, 7, 0.3), dark, { sharp: true, width: 2 });
        C.stroke(g, [[-8, -30], [-14, -24], [-22, -28]], '#8a8f96', 1.8);
      } },
      // the bakery's chalkboard out on the pavement (not when the stage is narrow, the bench is there)
      ...(W >= 700 ? [{ x: shopRow(W)[0].x + shopRow(W)[0].w * 0.3, y: 472, w: 80, h: 110, ax: 40, ay: 100, draw(g) {
        C.stroke(g, [[-20, -84], [-33, -2]], K.woodDark, 5);
        C.stroke(g, [[20, -84], [33, -2]], K.woodDark, 5);
        C.shape(g, edges([[-22, -94], [22, -94], [29, -6], [-29, -6]], 0.8), K.wood, { shade: K.woodShade, angle: 1.5, gap: 4, sharp: true });
        C.shape(g, edges([[-16, -86], [16, -86], [22, -14], [-22, -14]], 0.6), '#3f5a4a', { shade: '#2f4a3b', angle: 0.3, gap: 5, alpha: 0.6, sharp: true, width: 1.8 });
        g.save();
        g.fillStyle = '#f6f1e4';
        g.textAlign = 'center';
        g.font = '400 15px Gaegu, sans-serif';
        g.fillText('fresh', 0, -66);
        g.font = '700 19px Gaegu, sans-serif';
        g.fillText('buns', 0, -48);
        g.restore();
        C.pencil(g, C.blob(0, -28, 9, 6, 0.08, 12), { color: '#f6f1e4', width: 1.8, passes: 1 });
        C.stroke(g, [[-4, -31], [-1, -27]], '#f6f1e4', 1.4);
        C.stroke(g, [[2, -31], [5, -27]], '#f6f1e4', 1.4);
        C.stroke(g, [[-6, -94], [6, -94]], '#8a8f96', 3);
      } }] : []),
    ],
    live(g, W, t, night) {
      g.save();
      g.translate(W * 0.9, 80);
      if (night) g.drawImage(art('moon'), -46, -46, 92, 92);
      else { g.rotate(t * 0.05); g.drawImage(art('sun'), -78, -78, 156, 156); }
      g.restore();
      clouds(g, W, t, 70, 2);
    },
    // the lamp shines at night (page.js draws lights over the dark), from its glass
    lights: (W) => [{ x: W * 0.64, y: 172, r: 90, floor: 520 }],
  };

  // which shops fit, and how wide each one is
  function shopRow(W) {
    const list = SHOPS.slice(0, Math.max(3, Math.min(5, Math.round(W / 260))));
    const total = list.reduce((a, s) => a + s.share, 0);
    let x = 0;
    return list.map((s) => { const w = (W * s.share) / total, at = { s, x, w }; x += w; return at; });
  }

  // one shop: its walls and roof, upstairs, then the shop front
  function shop(g, s, x, w, r, later) {
    const top = s.top, mid = x + w / 2;
    const wall = { shade: s.shade, angle: 1.5, gap: 9, alpha: 0.3, sharp: true };
    if (s.roof === 'gable') {
      // the gable end faces the street: the wall goes up to a point under two roof edges, with a chimney
      const slope = (px) => top - (1 - Math.abs(px - mid) / (w / 2)) * 60;
      const cx = x + w * 0.7, ct = slope(cx) - 34;
      C.shape(g, box4(cx, ct, 22, slope(cx) - ct + 14, 0.5), '#c4553a', { shade: '#a8432e', angle: 0, gap: 4, sharp: true });
      for (const y of [ct + 10, ct + 20]) C.stroke(g, [[cx + 2, y], [cx + 20, y]], '#8e3b30', 1.5, 0.7);
      C.shape(g, box4(cx + 5, ct - 14, 12, 10, 0.4), '#e5874f', { sharp: true, width: 2 });
      C.shape(g, box4(cx - 4, ct - 6, 30, 8, 0.4), '#8e3b30', { sharp: true, width: 2 });
      C.shape(g, edges([[x, FOOT], [x, top], [mid, top - 60], [x + w, top], [x + w, FOOT]]), s.wall, wall);
      for (const end of [x - 12, x + w + 12]) C.shape(g, [[mid, top - 70], [end, top + 2], [end, top + 13], [mid, top - 57]], '#8e3b30', { shade: '#6f2a22', angle: 0.5, gap: 4, sharp: true });
      C.shape(g, C.blob(mid, top - 72, 4, 4, 0.05, 8), '#8e3b30', { width: 2 });
      round(g, mid, top - 24, 11, s.trim);
    } else if (s.roof === 'cornice') {
      // a flat roof behind a cornice with little blocks under it, and a chimney stack with pots
      const cx = x + w * 0.66;
      C.shape(g, box4(cx, top - 28, w * 0.18, 30, 0.5), '#c4553a', { shade: '#a8432e', angle: 0, gap: 4, sharp: true });
      for (const k of [0.25, 0.65]) C.shape(g, box4(cx + w * 0.18 * k, top - 40, 10, 13, 0.4), '#e5874f', { sharp: true, width: 2 });
      C.shape(g, box4(x, top, w, FOOT - top), s.wall, wall);
      C.shape(g, box4(x - 6, top - 12, w + 12, 14, 0.6), C.mix(s.shade, INK, 0.12), { sharp: true, width: 2.2 });
      for (let px = x + 6; px < x + w - 8; px += 15) C.shape(g, box4(px, top + 3, 8, 7, 0.3), C.mix(s.shade, '#ffffff', 0.35), { width: 1.4, sharp: true });
    } else if (s.roof === 'steps') {
      // a stepped gable, each step capped with stone, and a round window in the top
      const { at: steps, rise } = STEPS;
      const pts = [[x, FOOT]];
      rise.forEach((h, k) => pts.push([x + w * steps[k], top - h], [x + w * steps[k + 1], top - h]));
      pts.push([x + w, FOOT]);
      C.shape(g, pts, s.wall, wall);
      rise.forEach((h, k) => C.shape(g, box4(x + w * steps[k] - 3, top - h - 6, w * (steps[k + 1] - steps[k]) + 6, 7, 0.3), '#e8d8b8', { sharp: true, width: 1.8 }));
      round(g, mid, top - 30, 13, s.trim);
    } else if (s.roof === 'mansard') {
      // a steep slate roof with dormer windows standing out of it
      const rt = top - 54;
      C.shape(g, box4(x, top, w, FOOT - top), s.wall, wall);
      const tiles = edges([[x - 6, top + 2], [x + 14, rt], [x + w - 14, rt], [x + w + 6, top + 2]]);
      C.shape(g, tiles, '#6f6a86', { shade: '#56516b', angle: 0.1, gap: 7, alpha: 0.35, sharp: true });
      g.save();
      C.trace(g, tiles, true, true);
      g.clip();
      for (let row = 0, y = rt + 11; y < top; y += 11, row++) {
        C.stroke(g, [[x - 10, y], [x + w + 10, y]], '#4d4860', 1.5, 0.7);
        for (let px = x + (row % 2) * 7; px < x + w; px += 14) C.stroke(g, [[px, y], [px, y + 11]], '#4d4860', 1.3, 0.55);
      }
      g.restore();
      C.shape(g, box4(x + 10, rt - 6, w - 20, 8, 0.4), '#4d4860', { sharp: true, width: 2 });
      for (const f of w > 180 ? [0.3, 0.7] : [0.5]) {
        const dx = x + w * f;
        C.shape(g, box4(dx - 18, rt + 4, 36, 42, 0.5), s.wall, { shade: s.shade, angle: 1.5, gap: 6, alpha: 0.3, sharp: true });
        const glass = pane(g, dx - 11, rt + 13, 22, 26, s.trim);
        C.stroke(g, [[dx, rt + 13], [dx, rt + 39]], s.trim, 3);
        C.shape(g, [[dx - 25, rt + 7], [dx, rt - 14], [dx + 25, rt + 7], [dx + 21, rt + 10], [dx, rt - 6], [dx - 21, rt + 10]], '#6f6a86', { shade: '#56516b', sharp: true, width: 2.2 });
        glint(g, glass, r);
      }
    } else if (s.roof === 'garden') {
      // a roof garden: bushes and a sunflower peeping over the parapet
      const sx = x + w * 0.24;
      C.stroke(g, [[sx, top], [sx - 3, top - 40], [sx + 1, top - 62]], '#4e8a33', 3.5);
      C.shape(g, [[sx - 2, top - 36], [sx - 16, top - 44], [sx - 6, top - 30]], K.leaf, { width: 1.6 });
      for (const [fx, h] of [[0.1, 22], [0.4, 36], [0.63, 20], [0.86, 30]]) {
        const bx = x + w * fx;
        for (const [dx, dy, rad, col] of [[-12, -h * 0.25, h * 0.42, '#4e9a3a'], [10, -h * 0.3, h * 0.38, '#5fae4a'], [0, -h * 0.55, h * 0.4, K.leaf]]) {
          C.shape(g, C.blob(bx + dx, top + dy, rad * 1.1, rad, 0.14, 14), col, { shade: K.leafShade, alpha: 0.35, gap: 5, width: 1.8 });
        }
        for (const [dx, dy] of [[-6, -h * 0.5], [8, -h * 0.25]]) C.stroke(g, [[bx + dx - 3, top + dy + 2], [bx + dx + 3, top + dy - 3]], K.leafShade, 1.6, 0.8);
      }
      for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; C.shape(g, C.blob(sx + 1 + Math.cos(a) * 11, top - 64 + Math.sin(a) * 11, 6, 6, 0.1, 8), '#ffd84f', { width: 1.4 }); }
      C.shape(g, C.blob(sx + 1, top - 64, 8, 8, 0.06, 12), '#8a5a31', { width: 1.8 });
      C.shape(g, box4(x, top, w, FOOT - top), s.wall, wall);
      C.shape(g, box4(x - 5, top - 8, w + 10, 11, 0.5), '#e8e2d8', { sharp: true, width: 2.2 });
    }
    if (s.pipe) {
      // a drainpipe down one side, with a hopper at the top and brackets holding it on
      const px = x + w - 9;
      C.shape(g, [[px - 7, top + 2], [px + 7, top + 2], [px + 4, top + 12], [px - 4, top + 12]], '#7d8590', { sharp: true, width: 1.8 });
      C.shape(g, box4(px - 3, top + 12, 6, FOOT - top - 16, 0.4), '#8a919b', { sharp: true, width: 1.8 });
      for (let y = top + 40; y < FOOT - 20; y += 70) C.stroke(g, [[px - 5, y], [px + 5, y]], '#5f6670', 2.5);
    }
    taken = [];
    // a stepped gable has wall up in its steps too: the sky over each step, and its round window, are off limits
    let high = top + 8;
    if (s.roof === 'steps') {
      high = top - 56;
      STEPS.rise.forEach((h, k) => taken.push([x + w * STEPS.at[k] - 2, 0, x + w * STEPS.at[k + 1] + 2, top - h + 6]));
      taken.push([mid - 24, top - 54, mid + 24, top - 6]);
    }
    upstairs(g, s, x, w, top, r);
    if (s.sign === 'hanging' && w > 190) taken.push([x, 176, x + w * 0.3, 250]);
    bricks(g, r, x + 6, high, x + w - (s.pipe ? 18 : 6), 250, s);
    shopFront(g, s, x, w, r, later);
  }

  // a stepped gable: where each step starts and ends across the front, and how high it stands, the same
  // both sides
  const STEPS = { at: [0, 0.13, 0.26, 0.38, 0.62, 0.74, 0.87, 1], rise: [0, 20, 40, 60, 40, 20, 0] };
  // the bits of wall upstairs that windows, shutters, sills and boxes cover, so bricks go round them
  let taken = [];
  const clear = (x0, y0, x1, y1) => !taken.some(([a, b, c, d]) => x0 < c && x1 > a && y0 < d && y1 > b);
  // a few patches of bricks showing where the paint's worn, each somewhere the wall is bare: a big patch if
  // one fits, a small one if not, or a little stack up a corner. a shade darker than the wall so they show
  function bricks(g, r, x0, y0, x1, y1, s) {
    const fill = C.mix(s.wall, s.shade, 0.55), line = C.mix(s.shade, INK, 0.3);
    for (let k = 1 + Math.floor(r() * 2.6); k > 0; k--) {
      for (const rows of [[3, 2, 1], [2, 1], [1, 1, 1]]) {
        const pw = rows[0] * 17 + (rows.length > 1 ? 8 : 0) - 2, ph = rows.length * 9;
        // every place it could go on a 6 px grid, looked at in a random order
        const spots = [];
        for (let bx = x0; bx + pw <= x1; bx += 6) for (let by = y0; by + ph <= y1; by += 6) if (clear(bx - 4, by - 4, bx + pw + 4, by + ph + 4)) spots.push([bx, by]);
        if (!spots.length) continue;
        const spot = spots[Math.floor(r() * spots.length)];
        const [bx, by] = spot;
        taken.push([bx - 10, by - 10, bx + pw + 10, by + ph + 10]);
        rows.forEach((cols, row) => {
          for (let col = 0; col < cols; col++) {
            if (row && r() < 0.15) continue;
            const px = bx + col * 17 + (row % 2) * 8, py = by + row * 9;
            C.shape(g, [[px, py], [px + 15, py], [px + 15, py + 7], [px, py + 7]], fill, { line, width: 1.6, sharp: true });
          }
        });
        break;
      }
    }
  }
  // a window's frame and glass, square or arched, giving back the glass's outline
  function pane(g, x, y, w, h, frame, arch = false) {
    const outline = (x, y, w, h) => (arch
      ? [[x, y + h], ...Array.from({ length: 13 }, (_, i) => { const a = Math.PI + (i / 12) * Math.PI; return [x + w / 2 + (Math.cos(a) * w) / 2, y + w / 2 + (Math.sin(a) * w) / 2]; }), [x + w, y + h]]
      : box4(x, y, w, h, 0.6));
    taken.push([x - 10, y - 10, x + w + 10, y + h + 14]);
    C.shape(g, outline(x - 5, y - 5, w + 10, h + 10), frame, { sharp: true, width: 2.2 });
    const glass = outline(x, y, w, h);
    C.shape(g, glass, '#d3ecf8', { shade: '#aedaf2', alpha: 0.5, angle: 0.5, gap: 6, width: 1.8, sharp: true });
    return glass;
  }
  // a streak of light on the glass, somewhere different on each window, and on some none at all
  const glint = (g, glass, r) => {
    if (r() < 0.3) return;
    const xs = glass.map((p) => p[0]), ys = glass.map((p) => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
    const fx = 0.1 + r() * 0.5, len = 0.18 + r() * 0.2, fy = 0.3 + r() * 0.3;
    C.stroke(g, [[x0 + (x1 - x0) * fx, y0 + (y1 - y0) * fy], [x0 + (x1 - x0) * (fx + len), y0 + (y1 - y0) * (fy - len * 1.4)]], '#ffffff', 2.5, 0.75);
    if (r() < 0.4) C.stroke(g, [[x0 + (x1 - x0) * (fx + 0.08), y0 + (y1 - y0) * (fy + 0.06)], [x0 + (x1 - x0) * (fx + 0.16), y0 + (y1 - y0) * (fy - 0.06)]], '#ffffff', 1.6, 0.6);
  };
  const sill = (g, x, y, w, frame) => C.shape(g, box4(x - 10, y + 4, w + 20, 7, 0.4), frame, { sharp: true, width: 2 });
  // a round window high in a gable
  function round(g, cx, cy, rad, frame) {
    C.shape(g, C.blob(cx, cy, rad + 5, rad + 5, 0.02, 16), frame, { width: 2.2 });
    C.shape(g, C.blob(cx, cy, rad, rad, 0.02, 16), '#d3ecf8', { shade: '#aedaf2', alpha: 0.5, width: 1.8 });
    C.stroke(g, [[cx - rad, cy], [cx + rad, cy]], frame, 2.5);
    C.stroke(g, [[cx, cy - rad], [cx, cy + rad]], frame, 2.5);
  }
  // curtains drawn back in a window, tied in the middle
  function curtains(g, glass, colour) {
    const xs = glass.map((p) => p[0]), ys = glass.map((p) => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys), w = x1 - x0, h = y1 - y0;
    g.save();
    C.trace(g, glass, true, true);
    g.clip();
    for (const d of [1, -1]) {
      const e = d > 0 ? x0 : x1;
      C.shape(g, [[e, y0 - 2], [e + d * w * 0.36, y0 - 2], [e + d * w * 0.12, y0 + h * 0.55], [e + d * w * 0.2, y1 + 2], [e, y1 + 2]], colour, { shade: C.mix(colour, INK, 0.2), angle: 1.5, gap: 5, alpha: 0.35, width: 1.6, sharp: true });
      C.stroke(g, [[e + d * w * 0.03, y0 + h * 0.55], [e + d * w * 0.15, y0 + h * 0.55]], C.mix(colour, INK, 0.4), 2.5);
    }
    g.restore();
  }
  // a box of flowers under a window
  function flowerBox(g, x, y, w, r) {
    taken.push([x - 2, y - 12, x + w + 2, y + 13]);
    for (let px = x + 6; px < x + w - 4; px += 9) {
      C.stroke(g, [[px, y + 2], [px + C.j(2), y - 7]], K.leafShade, 2);
      g.fillStyle = K.petal[Math.floor(r() * 3)] === '#ffffff' ? '#ff8fb1' : K.petal[Math.floor(r() * 2)];
      C.trace(g, C.blob(px, y - 8, 4, 4, 0.1, 8));
      g.fill();
    }
    C.shape(g, box4(x, y, w, 11, 0.4), '#c4553a', { shade: '#a8432e', angle: 0, gap: 4, sharp: true, width: 2 });
  }

  function upstairs(g, s, x, w, top, r) {
    if (s.up === 'sash') {
      // two sash windows with matching curtains, one with a window box
      const ww = w * 0.2, y = top + 22, h = 62;
      [0.17, 0.63].forEach((f, k) => {
        const wx = x + w * f;
        const glass = pane(g, wx, y, ww, h, s.trim);
        curtains(g, glass, '#ffb6d2');
        C.stroke(g, [[wx, y + h * 0.5], [wx + ww, y + h * 0.5]], s.trim, 4);
        C.stroke(g, [[wx + ww / 2, y], [wx + ww / 2, y + h]], s.trim, 2.5);
        glint(g, glass, r);
        sill(g, wx, y + h, ww, s.trim);
        if (k) flowerBox(g, wx - 4, y + h + 11, ww + 8, r);
      });
    } else if (s.up === 'arch') {
      // one tall arched window, curtains tied back, a window box
      const ww = w * 0.4, wx = x + w * 0.3, y = top + 34, h = 236 - y;
      const glass = pane(g, wx, y, ww, h, s.trim, true);
      curtains(g, glass, '#ffe08a');
      C.stroke(g, [[wx + ww / 2, y], [wx + ww / 2, y + h]], s.trim, 3);
      C.stroke(g, [[wx, y + ww / 2], [wx + ww, y + ww / 2]], s.trim, 3);
      glint(g, glass, r);
      sill(g, wx, y + h, ww, s.trim);
      flowerBox(g, wx - 2, y + h + 11, ww + 4, r);
    } else if (s.up === 'three') {
      // three narrow windows under stone lintels, the middle one's blind half down
      const ww = w * 0.16, y = top + 30, h = 76;
      [0.12, 0.42, 0.72].forEach((f, k) => {
        const wx = x + w * f;
        taken.push([wx - 11, y - 18, wx + ww + 11, y - 6]);
        C.shape(g, box4(wx - 9, y - 16, ww + 18, 8, 0.4), '#e8d8b8', { sharp: true, width: 1.8 });
        const glass = pane(g, wx, y, ww, h, s.trim);
        if (k === 1) {
          C.shape(g, box4(wx, y, ww, h * 0.45, 0.3), '#fff7ea', { shade: '#f08a24', angle: 0, gap: 6, alpha: 0.5, sharp: true, width: 1.6 });
          C.shape(g, C.blob(wx + ww / 2, y + h * 0.45 + 5, 3, 3, 0.1, 8), '#f08a24', { width: 1.2 });
        }
        C.stroke(g, [[wx + ww / 2, y + (k === 1 ? h * 0.45 : 0)], [wx + ww / 2, y + h]], s.trim, 2.5);
        C.stroke(g, [[wx, y + h * 0.55], [wx + ww, y + h * 0.55]], s.trim, 2.5);
        glint(g, glass, r);
        sill(g, wx, y + h, ww, '#e8d8b8');
      });
    } else if (s.up === 'shutters') {
      // two windows with their shutters open, one with a box of flowers
      const ww = w * 0.18, y = top + 34, h = 68;
      [0.2, 0.62].forEach((f, k) => {
        const wx = x + w * f;
        for (const d of [-1, 1]) {
          const sx = d < 0 ? wx - 6 - ww * 0.42 : wx + ww + 6;
          taken.push([sx - 3, y - 6, sx + ww * 0.42 + 3, y + h + 6]);
          C.shape(g, box4(sx, y - 3, ww * 0.42, h + 6, 0.4), '#7c5cc4', { shade: '#5b3f9a', angle: 1.5, gap: 4, alpha: 0.3, sharp: true, width: 2 });
          for (let yy = y + 6; yy < y + h - 2; yy += 7) C.stroke(g, [[sx + 3, yy], [sx + ww * 0.42 - 3, yy + 2]], '#5b3f9a', 1.4, 0.8);
        }
        const glass = pane(g, wx, y, ww, h, s.trim);
        C.stroke(g, [[wx + ww / 2, y], [wx + ww / 2, y + h]], s.trim, 2.5);
        C.stroke(g, [[wx, y + h * 0.5], [wx + ww, y + h * 0.5]], s.trim, 2.5);
        glint(g, glass, r);
        sill(g, wx, y + h, ww, s.trim);
        if (!k) flowerBox(g, wx - 4, y + h + 11, ww + 8, r);
      });
    } else if (s.up === 'ivy') {
      // one wide window with pots on its sill, and ivy climbing the wall beside it
      const ww = w * 0.48, wx = x + w * 0.4, y = top + 22, h = 54;
      const glass = pane(g, wx, y, ww, h, s.trim);
      g.save();
      C.trace(g, glass, true, true);
      g.clip();
      for (const f of [0.18, 0.5, 0.82]) {
        const px = wx + ww * f;
        C.shape(g, C.blob(px, y + h - 22, 10, 12, 0.12, 12), K.leaf, { shade: K.leafShade, alpha: 0.4, width: 1.6 });
        C.shape(g, [[px - 8, y + h - 12], [px + 8, y + h - 12], [px + 6, y + h + 2], [px - 6, y + h + 2]], '#e5874f', { sharp: true, width: 1.6 });
      }
      g.restore();
      C.stroke(g, [[wx + ww / 2, y], [wx + ww / 2, y + h]], s.trim, 3);
      glint(g, glass, r);
      sill(g, wx, y + h, ww, s.trim);
      // the ivy: a stem wandering up from the shop sign, leaves either side
      const vx = x + w * 0.14;
      taken.push([vx - 20, top, vx + 20, 260]);
      const stem = Array.from({ length: 9 }, (_, i) => [vx + Math.sin(i * 1.3) * 9, 258 - i * ((258 - top - 10) / 8)]);
      C.stroke(g, stem, '#4e8a33', 2.5);
      stem.forEach(([px, py], i) => { if (i) C.shape(g, [[px, py], [px + (i % 2 ? 13 : -13), py - 5], [px + (i % 2 ? 7 : -7), py + 5]], i % 3 ? K.leaf : '#5fae4a', { width: 1.5 }); });
    }
  }

  // the shop front: windows, door, the awning over them and the sign
  function shopFront(g, s, x, w, r, later) {
    const at = s.way === 'right' ? { win: [[0.07, 0.56]], door: 0.69 }
      : s.way === 'left' ? { win: [[0.38, 0.56]], door: 0.08 }
      : { win: [[0.06, 0.3], [0.64, 0.3]], door: 0.4 };
    const dw = w * (s.way === 'middle' ? 0.2 : 0.23);
    for (const [f, ww] of at.win) shopWindow(g, s, x + w * f, w * ww, r);
    door(g, s, x + w * at.door, dw, later);
    // signs that live on the fascia, over the awning
    const cx = x + w / 2;
    if (s.sign === 'board') {
      const bw = Math.min(w * 0.66, 190);
      C.shape(g, box4(cx - bw / 2, 260, bw, 34, 0.6), '#fff7ea', { shade: '#f3e3c4', alpha: 0.5, angle: 0.1, gap: 6, sharp: true });
      for (const d of [-1, 1]) C.shape(g, C.blob(cx + d * (bw / 2 - 8), 266, 2, 2, 0.1, 6), INK, { outline: false });
      label(g, s.name, cx, 277, bw - 24, 28);
    } else if (s.sign === 'painted') {
      C.shape(g, box4(x + 5, 258, w - 10, 38, 0.6), s.trim, { shade: C.mix(s.trim, INK, 0.3), alpha: 0.35, angle: 0.05, gap: 6, sharp: true });
      label(g, s.name, cx, 277, w * 0.6, 30, '#ffd84f');
    } else if (s.sign === 'hanging') {
      // a band over the shop front with the name on a plaque, and a ball of yarn hung out on a bracket
      C.shape(g, box4(x + 4, 264, w - 8, 30, 0.6), C.mix(s.shade, INK, 0.1), { sharp: true, width: 2.2 });
      const bw = Math.min(w * 0.56, 150);
      C.shape(g, C.blob(cx, 279, bw / 2, 19, 0.02, 20), '#fff7ea', { shade: '#f3e3c4', alpha: 0.4, gap: 6 });
      label(g, s.name, cx, 278, bw - 30, 26);
      if (w > 190) {
        // an iron arm out from the wall with a brace under it, and the ball hung from it on two chains
        const arm = x + w * 0.22, by = 190, bx = x + w * 0.14;
        C.stroke(g, [[x + 4, by - 6], [arm, by - 6]], '#4d5560', 3.5);
        C.stroke(g, [[x + 4, by + 10], [x + 18, by - 6]], '#4d5560', 2.5);
        C.shape(g, C.blob(arm + 1, by - 6, 3, 3, 0.05, 8), '#4d5560', { outline: false });
        for (const d of [-8, 8]) C.stroke(g, [[bx + d * 0.6, by - 6], [bx + d * 0.8, by + 8]], '#8a8f96', 1.5);
        C.shape(g, C.blob(bx, by + 22, 16, 16, 0.04, 18), '#ff8fb1', { shade: '#e5638e', alpha: 0.4, gap: 5 });
        for (const k of [-6, 0, 6]) C.stroke(g, [[bx - 14, by + 22 + k], [bx - 6, by + 12 + k], [bx + 14, by + 18 + k]], '#d4507a', 1.6, 0.9);
        C.stroke(g, [[bx + 10, by + 34], [bx + 18, by + 44], [bx + 14, by + 52]], '#e5638e', 2);
      }
    } else {
      // a plain band; the name is on the awning, or on a plank nailed up crooked
      C.shape(g, box4(x + 4, 266, w - 8, 28, 0.6), C.mix(s.shade, INK, 0.08), { sharp: true, width: 2.2 });
      if (s.sign === 'plank') {
        const bw = Math.min(w * 0.6, 170);
        g.save();
        g.translate(cx + 6, 279);
        g.rotate(-0.035);
        C.shape(g, box4(-bw / 2, -17, bw, 32, 0.5), K.wood, { shade: K.woodShade, angle: 0.04, gap: 5, sharp: true });
        for (const y of [-8, 6]) C.stroke(g, [[-bw / 2 + 10, y], [-bw / 2 + 40, y + 1]], K.woodShade, 1.6, 0.8);
        for (const d of [-1, 1]) C.shape(g, C.blob(d * (bw / 2 - 9), -1, 2.2, 2.2, 0.1, 6), INK, { outline: false });
        label(g, s.name, 0, -1, bw - 34, 27, '#5a3a20');
        g.restore();
      }
    }
    if (s.awning) {
      const [x0, x1] = s.way === 'middle' || s.awning[0] === 'scallop' && s.way === 'right' ? [x + w * 0.03, x + w * 0.97]
        : s.way === 'left' ? [x + w * 0.34, x + w * 0.97] : [x + w * 0.03, x + w * 0.66];
      awning(g, x0, x1, 300, s.awning, s.sign === 'awning' ? s.name : null);
    }
  }

  // the big window, with the shop's things inside and the low wall under it
  function shopWindow(g, s, x, w, r) {
    const y = 318, h = 92;
    C.shape(g, box4(x - 7, y - 7, w + 14, h + 14, 0.6), s.trim, { sharp: true, width: 2.2 });
    const glass = box4(x, y, w, h, 0.5);
    C.shape(g, glass, '#d3ecf8', { shade: '#aedaf2', alpha: 0.4, angle: 0.5, gap: 7, width: 1.8, sharp: true });
    g.save();
    C.trace(g, glass, true, true);
    g.clip();
    display(g, s.show, x, y, w, h, r);
    g.restore();
    const bars = w > 150 ? 2 : 1;
    for (let k = 1; k <= bars; k++) C.stroke(g, [[x + (w * k) / (bars + 1), y], [x + (w * k) / (bars + 1), y + h]], s.trim, 4);
    glint(g, glass, r);
    C.shape(g, box4(x - 7, y + h + 7, w + 14, FOOT - (y + h + 7), 0.5), s.shade, { sharp: true, width: 2.2 });
    C.pencil(g, box4(x + 4, y + h + 14, w - 8, FOOT - (y + h + 14) - 9, 0.4), { color: C.mix(s.shade, INK, 0.35), width: 1.6, passes: 1, sharp: true });
  }

  // a door with a fanlight over it, a window and a panel, and a stone step out on the pavement
  function door(g, s, x, w, later) {
    const r = C.seeded(Math.round(x));
    const y = 312, deep = C.mix(s.door, INK, 0.45);
    C.shape(g, box4(x - 6, y - 6, w + 12, FOOT - y + 6, 0.5), s.trim, { sharp: true, width: 2.2 });
    C.shape(g, box4(x, y, w, 16, 0.4), '#d3ecf8', { shade: '#aedaf2', alpha: 0.5, width: 1.6, sharp: true });
    for (const f of [0.33, 0.66]) C.stroke(g, [[x + w * f, y], [x + w * f, y + 16]], s.trim, 2.5);
    C.shape(g, box4(x, y + 20, w, FOOT - y - 20, 0.5), s.door, { shade: C.mix(s.door, INK, 0.25), alpha: 0.3, angle: 1.5, gap: 6, sharp: true });
    C.shape(g, box4(x + w * 0.18, y + 30, w * 0.64, 40, 0.4), '#d3ecf8', { shade: '#aedaf2', alpha: 0.5, width: 1.6, sharp: true });
    C.pencil(g, box4(x + w * 0.18, y + 84, w * 0.64, 40, 0.4), { color: deep, width: 1.8, passes: 1, sharp: true });
    C.stroke(g, [[x + w * 0.24, y + 52], [x + w * 0.36, y + 36]], '#ffffff', 2, 0.7);
    C.shape(g, C.blob(x + w * 0.82, y + 78, 3.5, 3.5, 0.1, 8), '#ffd84f', { width: 1.5 });
    later.push(() => C.shape(g, box4(x - 12, 446, w + 24, 9, 0.5), '#cfc8bf', { shade: '#b5aea5', angle: 0, gap: 4, sharp: true, width: 2 }));
    if (s.show === 'plants') later.push(() => { for (const px of [x - 20, x + w + 22]) potPlant(g, px, 460, 1); });
  }
  function potPlant(g, px, py, z) {
    for (const [a, l] of [[-0.6, 22], [-0.15, 28], [0.35, 24], [0.75, 18]]) {
      const tx = px + Math.sin(a) * l * z, ty = py - 18 * z - Math.cos(a) * l * z;
      C.stroke(g, [[px, py - 16 * z], [tx, ty]], '#4e8a33', 2);
      C.shape(g, C.blob(tx, ty, 6 * z, 10 * z, 0.08, 10), K.leaf, { shade: K.leafShade, alpha: 0.4, width: 1.5 });
    }
    C.shape(g, [[px - 12 * z, py - 18 * z], [px + 12 * z, py - 18 * z], [px + 9 * z, py], [px - 9 * z, py]], '#e5874f', { shade: '#c4553a', gap: 4, sharp: true, width: 2 });
  }

  // an awning: one piece of striped canvas sloping out from the wall, with its flap along the bottom
  // (scalloped, straight, or a fringe), the shadow it throws on the wall, and maybe the shop's name on it
  function awning(g, x0, x1, y, [kind, a, b], name) {
    const drop = name ? 40 : 32, flap = 11, out = 9;
    const L = x0 - out, R = x1 + out, by = y + drop;
    const n = Math.max(3, Math.round((x1 - x0) / 30)) | 1;
    const bottom = [];
    if (kind === 'scallop') {
      for (let k = n - 1; k >= 0; k--) {
        const cx = L + ((k + 0.5) * (R - L)) / n, half = (R - L) / n / 2;
        for (let i = 0; i <= 6; i++) { const t = (i / 6) * Math.PI; bottom.push([cx + Math.cos(t) * half, by + flap + Math.sin(t) * 7]); }
      }
    } else bottom.push([R, by + flap], [L, by + flap]);
    const outline = [[x0, y], [x1, y], [R, by], ...bottom, [L, by]];
    g.save();
    g.globalAlpha = 0.16;
    g.fillStyle = INK;
    C.trace(g, outline.map(([px, py]) => [px + 3, py + 12]), true, true);
    g.fill();
    g.restore();
    g.save();
    C.trace(g, outline, true, true);
    g.clip();
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      g.fillStyle = kind === 'fringe' ? a : k % 2 ? b : a;
      g.beginPath();
      g.moveTo(x0 + (x1 - x0) * t0, y - 2);
      g.lineTo(x0 + (x1 - x0) * t1, y - 2);
      g.lineTo(L + (R - L) * t1, by);
      g.lineTo(L + (R - L) * t1, by + flap + 10);
      g.lineTo(L + (R - L) * t0, by + flap + 10);
      g.lineTo(L + (R - L) * t0, by);
      g.closePath();
      g.fill();
    }
    C.scribble(g, outline, C.mix(kind === 'fringe' ? a : b, INK, 0.2), { angle: 1.45, gap: 6, alpha: 0.22, sharp: true, width: 3 });
    // the slope's a little darker under the fold, where the canvas turns down
    g.fillStyle = 'rgba(58, 48, 52, .1)';
    g.fillRect(L - 4, by, R - L + 8, flap + 10);
    g.restore();
    C.stroke(g, [[L, by], [R, by]], '#6d5a5f', 1.8, 0.8);
    C.pencil(g, outline, { width: 2.2, sharp: true });
    if (kind === 'fringe') for (let px = L + 4; px < R - 2; px += 6) C.stroke(g, [[px, by + flap + 1], [px + C.j(1), by + flap + 8]], '#ffd84f', 2, 0.95);
    if (name) label(g, name, (x0 + x1) / 2, y + drop * 0.52, (x1 - x0) * 0.7, 30, '#fff7ea');
  }

  // what each shop has in its window
  function display(g, show, x, y, w, h, r) {
    const shelf = (sy) => C.stroke(g, [[x - 4, sy], [x + w + 4, sy]], '#8a5a31', 4);
    if (show === 'bread') {
      // loaves on two shelves, each with its cuts, and a long one stood in the corner
      for (const sy of [y + h * 0.5, y + h - 4]) {
        shelf(sy);
        for (let px = x + 16 + r() * 8; px < x + w - 14; px += 28 + r() * 10) {
          const lw = 10 + r() * 5;
          C.shape(g, C.blob(px, sy - 8, lw, 7.5, 0.06, 14), '#e0a05a', { shade: '#c07a38', alpha: 0.5, gap: 4, width: 1.8 });
          for (const d of [-4, 2]) C.stroke(g, [[px + d - 2, sy - 12], [px + d + 3, sy - 6]], '#9a5a26', 1.5);
        }
      }
      C.shape(g, C.poly([[x + w - 14, y + h - 4], [x + w - 4, y + h - 6], [x + w - 16, y + 8], [x + w - 24, y + 10]], 0.6), '#e9b06a', { shade: '#c07a38', gap: 4, alpha: 0.5, width: 1.8 });
    } else if (show === 'yarn') {
      // balls of yarn on a shelf, more in a basket, one strand hanging down
      const cols = ['#ff8fb1', '#ffd84f', '#7fc3e8', '#c59cf4', '#ff9a5c', '#8fd660'];
      shelf(y + h * 0.42);
      for (let px = x + 14, k = 0; px < x + w - 10; px += 22 + r() * 6, k++) {
        const c = cols[k % cols.length], rad = 8 + r() * 3, cy = y + h * 0.42 - rad;
        C.shape(g, C.blob(px, cy, rad, rad, 0.04, 14), c, { width: 1.6 });
        for (const d of [-0.4, 0.3]) C.stroke(g, [[px - rad * 0.8, cy + d * rad], [px, cy + d * rad - 4], [px + rad * 0.8, cy + d * rad + 2]], C.mix(c, INK, 0.35), 1.3, 0.9);
      }
      C.stroke(g, [[x + w * 0.5, y + h * 0.42], [x + w * 0.52, y + h * 0.55], [x + w * 0.47, y + h * 0.66]], '#c59cf4', 1.8);
      const bx = x + w * 0.2, bw = Math.min(70, w * 0.6);
      for (let k = 0; k < 3; k++) C.shape(g, C.blob(bx + 14 + k * (bw - 28) / 2, y + h - 22, 10, 10, 0.05, 12), cols[(k + 2) % cols.length], { width: 1.6 });
      C.shape(g, [[bx, y + h - 20], [bx + bw, y + h - 20], [bx + bw - 6, y + h + 2], [bx + 6, y + h + 2]], '#d9a066', { shade: '#b97e45', angle: 0.8, gap: 3, alpha: 0.6, sharp: true, width: 1.8 });
      C.stroke(g, [[bx + 3, y + h - 11], [bx + bw - 3, y + h - 11]], '#b97e45', 1.6);
    } else if (show === 'books') {
      // books stood up on the top shelf, one leaning, and piles lying down below
      const cols = ['#e5383b', '#3d78b8', '#3f9a76', '#f08a24', '#7c5cc4', '#8a5a31', '#fff7ea'];
      shelf(y + h * 0.48);
      let px = x + 6;
      while (px < x + w - 12) {
        const bw = 6 + r() * 5, bh = 22 + r() * 12, c = cols[Math.floor(r() * cols.length)];
        C.shape(g, box4(px, y + h * 0.48 - bh, bw, bh, 0.3), c, { sharp: true, width: 1.4 });
        C.stroke(g, [[px + 1, y + h * 0.48 - bh + 6], [px + bw - 1, y + h * 0.48 - bh + 6]], C.mix(c, '#ffffff', 0.5), 1.2);
        px += bw + 1 + (r() < 0.15 ? 10 : 0);
      }
      // the window's floor is a board the piles stand on, each book lying a little off the one under it
      const floor = y + h - 6;
      for (let k = 0, sx = x + 8; sx < x + w - 30; k++, sx += 34 + r() * 14) {
        for (let j = 0, sy = floor; j < 3 + Math.floor(r() * 2); j++) {
          const bw = 24 + r() * 8, bh = 6 + r() * 3;
          C.shape(g, box4(sx + (r() - 0.5) * 5, sy - bh, bw, bh, 0.3), cols[Math.floor(r() * cols.length)], { sharp: true, width: 1.4 });
          sy -= bh;
        }
      }
      C.shape(g, box4(x - 4, floor, w + 8, 10, 0.3), '#8a5a31', { shade: '#6d4523', angle: 0, gap: 3, sharp: true, width: 1.6 });
    } else if (show === 'hats') {
      // hats on stands: a top hat, a sun hat with a ribbon, a beret
      const kinds = ['top', 'sun', 'beret'], count = w > 120 ? 3 : 2;
      for (let k = 0; k < count; k++) {
        const sx = x + (w * (k + 0.5)) / count, sy = y + h * (0.64 + (k % 2) * 0.08);
        C.stroke(g, [[sx, sy], [sx, y + h - 6]], '#8a5a31', 2.5);
        C.shape(g, C.blob(sx, y + h - 5, 11, 4, 0.05, 10), '#8a5a31', { width: 1.4 });
        const kind = kinds[k % 3];
        if (kind === 'top') {
          C.shape(g, box4(sx - 11, sy - 30, 22, 28, 0.4), '#3a3034', { sharp: true, width: 1.6, line: '#1f1a1c' });
          C.shape(g, box4(sx - 11, sy - 10, 22, 5, 0.3), '#e5383b', { outline: false });
          C.shape(g, C.blob(sx, sy - 2, 19, 4, 0.05, 12), '#3a3034', { width: 1.4, line: '#1f1a1c' });
        } else if (kind === 'sun') {
          C.shape(g, C.blob(sx, sy - 2, 24, 6, 0.05, 14), '#f4d25f', { shade: '#d8ab2d', gap: 4, width: 1.6 });
          C.shape(g, C.blob(sx, sy - 9, 12, 9, 0.05, 12), '#f4d25f', { shade: '#d8ab2d', gap: 4, width: 1.6 });
          C.stroke(g, [[sx - 11, sy - 6], [sx + 11, sy - 6]], '#7fc3e8', 3);
          C.stroke(g, [[sx + 10, sy - 6], [sx + 16, sy + 6]], '#7fc3e8', 2.5);
        } else {
          C.shape(g, C.blob(sx + 2, sy - 6, 17, 7, 0.06, 14), '#e5638e', { shade: '#c4466e', gap: 4, width: 1.6 });
          C.stroke(g, [[sx + 2, sy - 13], [sx + 3, sy - 18]], '#c4466e', 3);
        }
      }
    } else if (show === 'plants') {
      // pots along the bottom, and one hung from the top with its leaves trailing
      for (let px = x + 18; px < x + w - 12; px += 34 + r() * 10) potPlant(g, px, y + h - 2, 0.9 + r() * 0.3);
      const hx = x + w * 0.5;
      C.stroke(g, [[hx - 10, y], [hx, y + 22]], '#8a8f96', 1.2);
      C.stroke(g, [[hx + 10, y], [hx, y + 22]], '#8a8f96', 1.2);
      C.shape(g, C.blob(hx, y + 28, 11, 7, 0.06, 12), '#fff7ea', { width: 1.6 });
      for (const d of [-1, 1]) {
        const vine = [[hx + d * 8, y + 28], [hx + d * 14, y + 40], [hx + d * 12, y + 52]];
        C.stroke(g, vine, '#4e8a33', 1.8);
        for (const [vx, vy] of vine.slice(1)) C.shape(g, C.blob(vx, vy, 4, 3, 0.1, 8), K.leaf, { width: 1.2 });
      }
    }
  }
  cafe.lights = (W) => lampsAt(W).map((x) => ({ x, y: 70, r: 90, floor: 560 }));
  farm.lights = (W) => [{ x: W * 0.07 + 125, y: 210, r: 70 }];

  // clouds drifting across, the same few sprites (made once per boil frame)
  function clouds(g, W, t, y0, count = 3) {
    for (let i = 0; i < count; i++) {
      const speed = 6 + i * 3;
      const x = ((t * speed + i * (W / count) + i * 137) % (W + 300)) - 150;
      const s = 0.8 + (i % 2) * 0.35;
      g.drawImage(art('cloud' + (i % 2)), x - 90 * s, y0 + i * 34 - 60 * s, 180 * s, 120 * s);
    }
  }

  // little sprites for the live bits, drawn in crayon once per boil frame
  const sprites = {};
  let frameNow = 0, scaleNow = 2;
  function art(name) {
    const key = name + frameNow;
    if (sprites[key]) return sprites[key];
    const sizes = { sun: 180, moon: 104, sails: 170, clock: 92, cloud0: [180, 120], cloud1: [180, 120] };
    const [w, h] = [].concat(sizes[name], sizes[name]);
    const { c, g } = C.sheet(w, h, scaleNow);
    C.wobble(frameNow * 31 + name.length);
    g.translate(w / 2, h / 2);
    if (name === 'sun') sun(g, 46);
    if (name === 'moon') moon(g, 42);
    if (name.startsWith('cloud')) cloud(g, 0, 6, name === 'cloud0' ? 1.15 : 0.95);
    if (name === 'sails') {
      for (let i = 0; i < 4; i++) {
        g.save();
        g.rotate((i * Math.PI) / 2);
        C.shape(g, [[2, -16], [22, -18], [24, -78], [2, -80]], 'rgba(255, 247, 234, .92)', { shade: '#e8d8c0', angle: 1.5, gap: 6, width: 2, sharp: true });
        for (const y of [-30, -44, -58, -70]) C.stroke(g, [[2, y], [23, y - 0.4]], '#b39a7a', 1.6);
        C.stroke(g, [[13, -17], [13, -79]], '#b39a7a', 1.6);
        C.stroke(g, [[0, -6], [0, -82]], '#8a5a31', 5);
        g.restore();
      }
      C.shape(g, C.blob(0, 0, 9, 9, 0.08, 10), K.roof, { width: 2 });
    }
    if (name === 'clock') {
      C.shape(g, C.blob(0, 0, 40, 40, 0.03), '#fff7ea', { shade: '#f6dcb0', alpha: 0.4, line: '#8a5a31', width: 5 });
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; C.stroke(g, [[Math.sin(a) * 30, -Math.cos(a) * 30], [Math.sin(a) * 35, -Math.cos(a) * 35]], INK, 2); }
      // two ears on top, it's a cat clock
      C.shape(g, C.poly([[-30, -26], [-26, -50], [-12, -38]]), '#8a5a31', { width: 2 });
      C.shape(g, C.poly([[30, -26], [26, -50], [12, -38]]), '#8a5a31', { width: 2 });
    }
    C.paper(g, w, h, 0.5);
    return (sprites[key] = c);
  }
  // page.js says which boil frame is showing and how sharp to draw
  function useFrame(frame, scale) {
    if (scale !== scaleNow) for (const k in sprites) delete sprites[k];
    frameNow = frame;
    scaleNow = scale;
  }

  return { list: [farm, cafe, street], byId: { farm, cafe, street }, useFrame, K, INK };
})();
