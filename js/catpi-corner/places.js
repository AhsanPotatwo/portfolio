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
      C.shape(g, [[-20, 330], ...Array.from({ length: 9 }, (_, i) => [(i / 8) * (W + 40) - 20, 268 + Math.sin(i * 1.3) * 26 + C.j(4)]), [W + 20, 330]], K.hill2, { shade: K.hillShade, alpha: 0.3, angle: 0.3, gap: 10, line: '#7aa85a', width: 2 });
      C.shape(g, [[-20, 340], ...Array.from({ length: 7 }, (_, i) => [(i / 6) * (W + 40) - 20, 300 + Math.cos(i * 1.7) * 18 + C.j(3)]), [W + 20, 340]], K.hill, { shade: K.hillShade, alpha: 0.35, angle: -0.3, gap: 9, line: '#7aa85a', width: 2 });
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
      // the barn and silo
      const bx = W * 0.07, by = 352;
      C.shape(g, C.box(bx + 232, by - 170, 66, 170, 4), K.silo, { shade: K.siloShade, angle: 1.45, gap: 6 });
      C.shape(g, Array.from({ length: 13 }, (_, i) => { const a = Math.PI + (i / 12) * Math.PI; return [bx + 265 + Math.cos(a) * 35, by - 170 + Math.sin(a) * 26]; }), K.siloShade, { shade: '#7d8fa3', angle: 0.4, gap: 5, sharp: true });
      for (let y = by - 140; y < by; y += 34) C.stroke(g, [[bx + 234, y], [bx + 296, y + 2]], '#7d8fa3', 2, 0.6);
      C.shape(g, C.poly([[bx, by], [bx, by - 120], [bx + 125, by - 196], [bx + 250, by - 120], [bx + 250, by]]), K.barn, { shade: K.barnShade, angle: 1.5, gap: 7, alpha: 0.5 });
      C.shape(g, C.poly([[bx - 14, by - 112], [bx + 125, by - 206], [bx + 264, by - 112], [bx + 250, by - 104], [bx + 125, by - 188], [bx, by - 104]]), K.roof, { shade: K.roofShade });
      // the big door with its white cross, and the hay loft
      const door = C.box(bx + 70, by - 104, 110, 104, 2);
      C.shape(g, door, K.barnShade, { shade: '#a83525', alpha: 0.4, angle: 1.5 });
      C.stroke(g, [[bx + 72, by - 102], [bx + 178, by - 2]], K.trim, 5);
      C.stroke(g, [[bx + 178, by - 102], [bx + 72, by - 2]], K.trim, 5);
      C.pencil(g, door, { color: K.trim, width: 5, passes: 1 });
      C.shape(g, C.box(bx + 104, by - 160, 42, 36, 2), '#5a2a22', { line: K.trim, width: 4 });
      for (let i = 0; i < 4; i++) C.stroke(g, [[bx + 108 + i * 10, by - 128], [bx + 112 + i * 9, by - 140 - (i % 2) * 6]], K.hay, 3);
      // the fence along the back of the pen
      const fy = 372;
      C.shape(g, C.box(-10, fy - 30, W + 20, 9, 3, 1), K.wood, { shade: K.woodShade, angle: 0, gap: 4 });
      C.shape(g, C.box(-10, fy - 6, W + 20, 9, 3, 1), K.wood, { shade: K.woodShade, angle: 0, gap: 4 });
      for (let x = 20; x < W; x += 74) C.shape(g, C.box(x, fy - 46, 14, 58, 3), K.wood, { shade: K.woodShade, angle: 1.4, gap: 4 });
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
      C.shape(g, C.box(-6, 600, 22, 130, 3), K.wood, { shade: K.woodShade, angle: 1.4, gap: 4 });
      C.shape(g, C.box(W - 16, 600, 22, 130, 3), K.wood, { shade: K.woodShade, angle: 1.4, gap: 4 });
    },
    props: (W) => [
      { x: W * 0.17, y: 478, w: 150, h: 100, ax: 75, ay: 92, draw(g) {
        C.shape(g, C.box(-64, -78, 128, 74, 14), K.hay, { shade: K.hayShade, angle: 0.1, gap: 5, alpha: 0.55 });
        for (const x of [-30, 28]) C.stroke(g, [[x, -76], [x + 2, -6]], '#a8781a', 4);
        for (let i = 0; i < 9; i++) C.stroke(g, [[-58 + i * 14, -80], [-62 + i * 14 + C.j(4), -88 - Math.abs(C.j(5))]], K.hayShade, 2.5);
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
          C.shape(g, C.box(d * 82 - 7, -72, 14, 58, 3), K.wood, { shade: K.woodShade, angle: 1.5, gap: 4 });
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
  const cafe = {
    id: 'cafe', name: 'Crumbs Cafe', says: 'the cafe',
    ground: (W) => ({ top: 452, bottom: 692, left: Math.min(W * 0.24, 230), right: W - 40 }),
    water: () => [],
    spots: (W) => [{ x: W * 0.43, y: 112, r: 46, name: 'clock' }, { x: Math.min(W * 0.22, 220) * 0.52, y: 274, r: 30, name: 'bell' }],
    sky(g, W) {
      g.fillStyle = '#fdeedd';
      g.fillRect(0, 0, W, 720);
    },
    back(g, W) {
      // striped wallpaper, then wooden panels low down
      for (let x = 0; x < W; x += 56) C.scribble(g, [[x, 0], [x + 24, 0], [x + 24, 380], [x, 380]], '#f6b9b4', { angle: 1.57, gap: 6, width: 4, alpha: 0.55, over: 0 });
      C.shape(g, [[-10, 330], [W + 10, 330], [W + 10, 440], [-10, 440]], '#c98d5a', { shade: '#a8703f', angle: 1.55, gap: 9, alpha: 0.35, width: 2, sharp: true });
      for (let x = 30; x < W; x += 90) C.pencil(g, C.box(x, 346, 64, 76, 4), { color: '#8a5a31', width: 2, passes: 1 });
      // the floor: wide boards running into the room
      C.shape(g, [[-10, 440], [W + 10, 440], [W + 10, 730], [-10, 730]], '#efc08a', { shade: '#d9a066', angle: 0.02, gap: 12, alpha: 0.4, outline: false, sharp: true });
      for (let y = 470; y < 720; y += 44 + (y - 470) * 0.2) C.stroke(g, [[-10, y], [W + 10, y + C.j(3)]], '#b77e47', 2, 0.7);
      for (let i = 0; i < W / 70; i++) { const y = 450 + (i * 97) % 260; C.stroke(g, [[(i * 173) % W, y], [(i * 173) % W + C.j(2), y + 22]], '#b77e47', 2, 0.5); }
      // the window, with the street outside
      const wx = W * 0.56, ww = Math.min(300, W * 0.28);
      C.shape(g, C.box(wx - 12, 58, ww + 24, 226, 6), '#c98d5a', { shade: '#a8703f', angle: 1.5 });
      C.shape(g, C.box(wx, 70, ww, 202, 4), K.sky, { shade: K.skyShade, angle: 0.1, gap: 12, alpha: 0.4, line: '#8a5a31' });
      C.shape(g, C.poly([[wx, 272], [wx, 190], [wx + ww * 0.3, 190], [wx + ww * 0.3, 160], [wx + ww * 0.55, 160], [wx + ww * 0.55, 205], [wx + ww, 205], [wx + ww, 272]]), '#cdb7e8', { shade: '#a993cf', angle: 1.5, gap: 6, line: '#7a6a99', width: 2, sharp: true });
      for (let i = 0; i < 4; i++) C.shape(g, C.box(wx + 14 + i * ww * 0.24, 214 + (i % 2) * 12, 16, 20, 2), '#fff3bf', { outline: false });
      C.stroke(g, [[wx + ww / 2, 72], [wx + ww / 2, 270]], '#8a5a31', 6);
      C.stroke(g, [[wx + 2, 170], [wx + ww - 2, 170]], '#8a5a31', 6);
      // curtains
      for (const [x0, d] of [[wx - 22, 1], [wx + ww + 22, -1]]) C.shape(g, C.poly([[x0, 48], [x0 + d * 46, 48], [x0 + d * 30, 160], [x0 + d * 40, 290], [x0, 300]]), '#9fd8a4', { shade: '#6fbb7a', angle: 1.5, gap: 6 });
      C.shape(g, C.box(wx - 40, 40, ww + 80, 14, 6), '#8a5a31', { outline: false });
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
      }
      // the counter, with a cake under a glass and the coffee machine
      const cw = Math.min(W * 0.22, 220);
      C.shape(g, C.box(-12, 288, cw + 12, 22, 4), '#8a5a31', { shade: '#6d4523', angle: 0 });
      C.shape(g, C.box(-12, 308, cw, 160, 4), '#f6c3cc', { shade: '#e597a6', angle: 1.5, gap: 8 });
      for (let x = 14; x < cw - 10; x += 34) C.stroke(g, [[x, 320], [x, 456]], '#e597a6', 3, 0.8);
      const mx2 = cw * 0.8;
      // the coffee machine: a body, its top, a dial, the spout, and a cup waiting under it
      C.shape(g, C.box(mx2 - 30, 206, 60, 70, 6), '#e4785a', { shade: '#c4553a', angle: 1.5, gap: 6 });
      C.shape(g, C.box(mx2 - 34, 198, 68, 12, 4), '#8a5a31', {});
      C.shape(g, C.box(mx2 - 30, 276, 60, 10, 3), '#5f5a60', {});
      C.shape(g, C.blob(mx2 + 14, 224, 8, 8, 0.08, 10), '#fff7ea', { width: 2 });
      C.stroke(g, [[mx2 + 14, 224], [mx2 + 18, 219]], INK, 2);
      C.shape(g, C.box(mx2 - 14, 240, 14, 10, 2), '#5f5a60', { width: 2 });
      C.shape(g, [[mx2 - 18, 260], [mx2 + 4, 260], [mx2 + 1, 276], [mx2 - 15, 276]], '#fff7ea', { width: 2, sharp: true });
      C.stroke(g, [[mx2 + 4, 264], [mx2 + 9, 266], [mx2 + 3, 272]], INK, 2);
      // the bell (ring it)
      const bx2 = cw * 0.52;
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
      for (const f of [0.22, 0.83]) {
        C.stroke(g, [[W * f, 0], [W * f, 40]], INK, 2);
        C.shape(g, C.poly([[W * f - 26, 70], [W * f - 12, 40], [W * f + 12, 40], [W * f + 26, 70]]), '#ffd84f', { shade: '#ffb42e', angle: 1.5, gap: 5 });
      }
    },
    front(g, W) {
      // the counter's end, in front of everything
      const cw = Math.min(W * 0.22, 220);
      C.shape(g, C.box(-12, 470, cw * 0.55, 260, 4), '#f6c3cc', { shade: '#e597a6', angle: 1.5, gap: 8 });
      C.shape(g, C.box(-12, 458, cw * 0.55 + 10, 18, 4), '#8a5a31', { outline: false });
    },
    props: (W) => {
      const table = (x, y) => ({ x, y, w: 200, h: 170, ax: 100, ay: 160, draw(g) {
        C.shape(g, C.box(-8, -112, 16, 108, 3), '#8a5a31', { shade: '#6d4523', angle: 1.5, gap: 4 });
        C.shape(g, C.blob(0, -6, 40, 9, 0.05), '#8a5a31', { outline: false });
        C.shape(g, C.blob(0, -120, 88, 22, 0.03), '#fff7ea', { shade: '#f6c3cc', angle: 0.1, gap: 7, alpha: 0.6 });
        // a teacup and a crumb or two
        C.shape(g, C.poly([[-34, -146], [-16, -146], [-19, -128], [-31, -128]]), '#9fd8a4', {});
        C.stroke(g, [[-38, -127], [-12, -127]], INK, 2);
        C.stroke(g, [[-28, -152], [-24, -160], [-28, -168]], '#b6a99b', 2, 0.7);
        C.shape(g, C.poly([[16, -132], [40, -136], [32, -124]]), '#f4d25f', { shade: '#d8ab2d', width: 1.8 });
      } });
      return [table(W * 0.46, 548), table(W * 0.78, 640), { x: W - 44, y: 470, w: 90, h: 170, ax: 45, ay: 160, draw(g) {
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
      const cx = W * 0.43, cy = 112;
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
        g.fillStyle = 'rgba(40, 46, 110, .55)';
        g.fillRect(wx + 4, 74, ww - 8, 90);
      }
    },
  };

  // ---------- puddle corner, a street ----------
  const shops = [
    { colour: '#f29b8f', shade: '#d9705f', awning: ['#ffffff', '#e5383b'], name: 'Bakery' },
    { colour: '#a8dcc6', shade: '#78bfa0', awning: ['#ffffff', '#3f9a76'], name: 'Yarn' },
    { colour: '#ffe08a', shade: '#efbf45', awning: ['#ffffff', '#f08a24'], name: 'Books' },
    { colour: '#cdb7e8', shade: '#a993cf', awning: ['#ffffff', '#7c5cc4'], name: 'Hats' },
    { colour: '#9fcdef', shade: '#6aa8d8', awning: ['#ffffff', '#3d78b8'], name: 'Leaves' },
  ];
  const street = {
    id: 'street', name: 'Puddle Corner', says: 'the corner',
    ground: (W) => ({ top: 458, bottom: 678, left: 40, right: W - 40 }),
    water: (W) => [{ x: W * 0.44, y: 608, rx: 74, ry: 22 }, { x: W * 0.16, y: 650, rx: 54, ry: 16 }],
    spots: (W) => [{ x: W * 0.9, y: 80, r: 56, name: 'sun' }, { x: W * 0.86, y: 500, r: 34, name: 'hydrant' }],
    sky(g, W) { skyFill(g, W, 300); },
    back(g, W) {
      // a row of shops, each its own height
      const n = Math.max(3, Math.min(5, Math.round(W / 260)));
      const sw = W / n;
      for (let i = 0; i < n; i++) {
        const s = shops[i % shops.length];
        const x = i * sw, top = 96 + ((i * 53) % 70);
        C.shape(g, C.box(x - 2, top, sw + 4, 450 - top, 3), s.colour, { shade: s.shade, angle: 1.5, gap: 9, alpha: 0.35 });
        // the roof edge, and windows upstairs
        C.shape(g, C.box(x - 6, top - 12, sw + 12, 16, 4), '#7d6e74', { outline: false });
        for (let k = 0; k < 2; k++) {
          const wx = x + sw * (0.18 + k * 0.42), wy = top + 30;
          C.shape(g, C.box(wx, wy, sw * 0.22, 64, 3), '#d3ecf8', { shade: '#aedaf2', alpha: 0.4, line: INK });
          C.stroke(g, [[wx + sw * 0.11, wy + 2], [wx + sw * 0.11, wy + 62]], INK, 2);
          C.shape(g, C.box(wx - 4, wy + 64, sw * 0.22 + 8, 8, 2), '#fff7ea', { outline: false });
        }
        // the awning, striped, and the shop's sign
        const ay = 262;
        const stripes = 7;
        for (let k = 0; k < stripes; k++) {
          const ax = x + 10 + ((sw - 20) * k) / stripes, aw = (sw - 20) / stripes;
          C.shape(g, C.poly([[ax, ay], [ax + aw, ay], [ax + aw + 3, ay + 46], [ax - 3, ay + 46]], 1), s.awning[k % 2], { width: 1.6, line: '#6d5a5f', sharp: true });
          C.shape(g, C.blob(ax + aw / 2, ay + 46, aw / 2 + 1, 7, 0.05, 10), s.awning[k % 2], { width: 1.6, line: '#6d5a5f' });
        }
        C.shape(g, C.box(x + sw * 0.2, ay - 46, sw * 0.6, 36, 6), '#fff7ea', { line: INK });
        g.save();
        g.fillStyle = INK;
        g.font = `700 ${Math.min(30, sw * 0.13)}px Gaegu, sans-serif`;
        g.textAlign = 'center';
        g.fillText(s.name, x + sw / 2, ay - 19);
        g.restore();
        // the shop window and door
        C.shape(g, C.box(x + sw * 0.1, 330, sw * 0.46, 92, 3), '#d3ecf8', { shade: '#aedaf2', alpha: 0.45 });
        C.stroke(g, [[x + sw * 0.14, 340], [x + sw * 0.24, 330 + 30]], '#ffffff', 3, 0.8);
        C.shape(g, C.box(x + sw * 0.64, 318, sw * 0.24, 132, 3), s.shade, { shade: '#5a4a50', alpha: 0.25, angle: 1.5 });
        C.shape(g, C.blob(x + sw * 0.84, 388, 4, 4, 0.1, 8), '#ffd84f', { width: 1.5 });
      }
      // the pavement, its slabs, and the kerb and road
      C.shape(g, [[-10, 446], [W + 10, 446], [W + 10, 700], [-10, 700]], '#dcd8d2', { shade: '#c4beb6', angle: 0.02, gap: 14, alpha: 0.35, outline: false, sharp: true });
      for (let y = 446; y < 700; y += 64) C.stroke(g, [[-10, y], [W + 10, y + C.j(2)]], '#a9a198', 2, 0.6);
      for (let x = 0, row = 0; row < 4; row++) for (x = (row % 2) * 60; x < W; x += 120) C.stroke(g, [[x, 446 + row * 64], [x + C.j(3), 446 + (row + 1) * 64]], '#a9a198', 2, 0.6);
      C.shape(g, C.box(-10, 690, W + 20, 14, 2), '#b5aea5', { line: '#7d746c', width: 2 });
      C.shape(g, [[-10, 704], [W + 10, 704], [W + 10, 730], [-10, 730]], '#5f5a60', { shade: '#4d484e', angle: 0, gap: 8, outline: false, sharp: true });
      for (let x = 20; x < W; x += 110) C.shape(g, C.box(x, 712, 54, 6, 2), '#ffd84f', { outline: false });
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
        for (const x of [-80, 72]) C.shape(g, C.box(x, -46, 10, 46, 2), '#5f5a60', { outline: false });
        C.shape(g, C.box(-96, -56, 192, 14, 4), K.wood, { shade: K.woodShade, angle: 0, gap: 4 });
        C.shape(g, C.box(-96, -92, 192, 12, 4), K.wood, { shade: K.woodShade, angle: 0, gap: 4 });
        C.shape(g, C.box(-96, -74, 192, 12, 4), K.wood, { shade: K.woodShade, angle: 0, gap: 4 });
      } },
      // the lamppost
      { x: W * 0.64, y: 470, w: 90, h: 330, ax: 45, ay: 320, draw(g) {
        C.shape(g, C.box(-6, -270, 12, 266, 3), '#4d5560', { shade: '#353b44', angle: 1.5 });
        C.shape(g, C.box(-16, -14, 32, 14, 3), '#4d5560', {});
        C.shape(g, C.poly([[-22, -276], [22, -276], [16, -310], [-16, -310]]), '#fff3bf', { line: '#353b44', width: 3 });
        C.shape(g, C.poly([[-28, -310], [28, -310], [0, -322]]), '#4d5560', {});
      } },
      // the fire hydrant (click it)
      { x: W * 0.86, y: 520, w: 80, h: 90, ax: 40, ay: 84, draw(g) {
        C.shape(g, C.box(-18, -62, 36, 60, 6), '#e5383b', { shade: '#b8252a', angle: 1.5, gap: 5 });
        C.shape(g, C.blob(0, -62, 20, 12, 0.05), '#e5383b', { shade: '#b8252a' });
        C.shape(g, C.box(-28, -46, 56, 12, 4), '#b8252a', {});
        C.shape(g, C.box(-22, -8, 44, 8, 2), '#b8252a', {});
      } },
    ],
    live(g, W, t, night) {
      g.save();
      g.translate(W * 0.9, 80);
      if (night) g.drawImage(art('moon'), -46, -46, 92, 92);
      else { g.rotate(t * 0.05); g.drawImage(art('sun'), -78, -78, 156, 156); }
      g.restore();
      clouds(g, W, t, 70, 2);
    },
    // the lamp shines at night (page.js draws lights over the dark)
    lights: (W) => [{ x: W * 0.64, y: 166, r: 90, floor: 520 }],
  };
  cafe.lights = (W) => [{ x: W * 0.22, y: 70, r: 90, floor: 560 }, { x: W * 0.83, y: 70, r: 90, floor: 560 }];
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
