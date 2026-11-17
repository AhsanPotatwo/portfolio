// the revamped wizard battles: the same game as the uni version (the rules are in rules.js, unchanged), acted out
// in a little paper toy theatre. the two wizards are cut-out puppets on rods that slide in a slot in the stage
// floor, every spell and shield is cut from paper too (flat colours, a cream paper edge, a soft shadow on the
// backdrop), and the buttons are a wooden desk of keys under the stage.
//
// how it fits together:
//   the canvas    the theatre. bg and frame are drawn once and kept, the backdrop and the proscenium.
//                 every frame: hanging stars, then puppets and effects (drawn on the actors layer, with their
//                 shadows on another layer underneath), the curtains, then the frame and the health plaques
//   the desk      html keys under the canvas (#duel .wb-desk). renderDesk() sets them from the state
//   a turn        when you finish choosing, rules.js works the whole turn out at once, and playTurn() acts it
//                 out over about three seconds with later(), like the uni version's 180 frame timer
//   screens       #duel[data-screen]: title (curtains shut, playbill), tour (how to play), battle, end
// it all runs on its own clock (now), which only moves while the game is on screen, so a turn left halfway
// carries on where it was.
const WizardDuel = (() => {
  'use strict';
  const root = document.getElementById('duel');
  if (!root || typeof WizardRules === 'undefined') return null;
  const { MOVES, newBattle, csv } = WizardRules;
  const $ = (sel) => root.querySelector(sel);
  const $$ = (sel) => [...root.querySelectorAll(sel)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasSfx = typeof WizardSfx !== 'undefined';
  const sfx = (name, opts) => hasSfx && WizardSfx.play(name, opts);

  // ---------- the canvas and its layers ----------
  const W = 800;
  const H = 430;
  const K = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const canvas = $('.wb-duel-canvas');
  const ctx = canvas.getContext('2d');
  function layer() {
    const c = document.createElement('canvas');
    c.width = W * K;
    c.height = H * K;
    return c;
  }
  canvas.width = W * K;
  canvas.height = H * K;
  const bgLayer = layer();
  const frameLayer = layer();
  const actorLayer = layer();
  const shadowLayer = layer();
  const actx = actorLayer.getContext('2d');
  const sctx = shadowLayer.getContext('2d');

  const C = {
    ink: '#362521', paper: '#f6ead6', parch: '#f1e2c2', parch2: '#e3cc9c', parchEdge: '#c4a774',
    tan: '#b69963', tanEdge: '#7d6338', tanLight: '#d9b77a', gold: '#f6c96b',
    peach: '#ffc9ac', peachDark: '#eea98a',
    wood: '#4d362d', woodDark: '#3a1e16', woodDeep: '#2e1f1a', floor: '#7a5236', plank: '#6b4630',
    curtain: '#b83a40', curtainDark: '#962f36', curtainShine: '#c9474d', valance: '#7a2329',
    sky: '#3a2c48', sky2: '#4f3554', sky3: '#6b4058', hillBack: '#4a3a5e', hillMid: '#2f4038', hillFront: '#3b5240',
  };
  const ELEMENT = {
    Fire: { main: '#c93232', mid: '#ff8a3d', pale: '#ffd25e' },
    Water: { main: '#29a1d4', mid: '#7fd0f0', pale: '#d4f1ff' },
    Earth: { main: '#8a6a44', mid: '#40a027', pale: '#b7e08a' },
    Neutral: { main: '#f6ead6', mid: '#d9b77a', pale: '#fff6e4' },
    Berserk: { main: '#ff4d4d', mid: '#7a1d1d', pale: '#ffb3a8' },
  };

  // ---------- little helpers ----------
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const easeOutBack = (k) => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);
  function bounce(k) {
    if (k < 1 / 2.75) return 7.5625 * k * k;
    if (k < 2 / 2.75) return 7.5625 * (k -= 1.5 / 2.75) * k + 0.75;
    if (k < 2.5 / 2.75) return 7.5625 * (k -= 2.25 / 2.75) * k + 0.9375;
    return 7.5625 * (k -= 2.625 / 2.75) * k + 0.984375;
  }
  const circle = (x, y, r) => { const p = new Path2D(); p.arc(x, y, r, 0, Math.PI * 2); return p; };
  const rrect = (x, y, w, h, r) => { const p = new Path2D(); p.roundRect(x, y, w, h, r); return p; };
  function poly(points, matrix) {
    const p = new Path2D();
    points.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    if (!matrix) return p;
    const out = new Path2D();
    out.addPath(p, matrix);
    return out;
  }
  // a five pointed star, or more points for bursts
  function star(x, y, r, points = 5, inner = 0.45, turn = 0) {
    const pts = [];
    for (let i = 0; i < points * 2; i++) {
      const a = turn + (i * Math.PI) / points - Math.PI / 2;
      const rr = i % 2 ? r * inner : r;
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
    }
    return poly(pts);
  }

  // the clock. later() runs something that many ms from now on the game's clock
  let now = 0;
  const queue = [];
  function later(ms, fn) {
    const at = now + ms;
    let i = queue.length;
    while (i > 0 && queue[i - 1].at > at) i--;
    queue.splice(i, 0, { at, fn });
  }
  const since = (t) => (t == null ? Infinity : now - t);

  // ---------- the game's state ----------
  const FLOOR_Y = 348;
  const SLOT_Y = 376;
  const you = makePuppet({ x: 232, dir: 1, size: 0.86, robe: '#3f6dc0', trim: '#98c1ff', hat: '#355fae', band: C.gold, beard: '#f6ead6', gem: '#98c1ff', tip: -16, brows: 'kind', name: 'You' });
  const foe = makePuppet({ x: 570, dir: -1, size: 0.98, robe: '#b83a40', trim: '#ff6b6b', hat: '#8e2a30', band: '#2e1f1a', beard: '#c2ab95', gem: '#ff6b6b', tip: -30, brows: 'cross', name: 'Enemy' });
  function makePuppet(def) {
    return { def, ev: {}, shield: null, gem: null, hp: { target: 0, fill: 0, ghost: 0, max: 0, at: -1e9, dir: 0 }, tip: { x: def.x, y: 180 } };
  }

  let battle = null;
  let playerID = '';
  let exported = false;
  let screen = 'title';
  let busy = false;
  // what's chosen on the desk so far, like the uni version's atkBtn/atkBtnLow/berserk booleans
  let choice = { type: null, tier: null, berserk: false };
  let tourPage = 0;
  let curtain = { from: 0, to: 0, t0: -1e9, dur: 1 };
  let shake = { at: -1e9, amp: 0 };
  const parts = [];
  const spells = [];
  const bursts = [];
  const tags = [];

  function newGame() {
    battle = newBattle();
    playerID = generateID();
    exported = false;
    for (const p of [you, foe]) {
      const max = p === you ? battle.player.maxHealth : battle.enemy.maxHealth;
      p.ev = {};
      p.shield = null;
      p.gem = null;
      p.hp = { target: max, fill: max, ghost: max, max, at: -1e9, dir: 0 };
    }
    parts.length = spells.length = bursts.length = tags.length = 0;
    choice = { type: null, tier: null, berserk: false };
    busy = false;
  }
  // the same ten letter id as the uni version, shown on the participant ticket
  function generateID() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < 10; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
    const shown = document.getElementById('player-id');
    if (shown) shown.textContent = id;
    return id;
  }

  // ---------- the backdrop, drawn once ----------
  function smoothHills(g, points, colour) {
    g.beginPath();
    g.moveTo(points[0][0], 340);
    g.lineTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      const [px, py] = points[i - 1];
      const [x, y] = points[i];
      g.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
    }
    const [lx, ly] = points[points.length - 1];
    g.lineTo(lx, ly);
    g.lineTo(lx, 340);
    g.closePath();
    g.fillStyle = colour;
    g.fill();
  }
  function drawBackdrop() {
    const g = bgLayer.getContext('2d');
    g.setTransform(K, 0, 0, K, 0, 0);
    // dusk in three cut paper bands
    g.fillStyle = C.sky;
    g.fillRect(0, 0, W, 340);
    for (const [y, colour, waves] of [[190, C.sky2, 5], [236, C.sky3, 7]]) {
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= W; x += 10) g.lineTo(x, y + Math.sin((x / W) * Math.PI * waves) * 6);
      g.lineTo(W, 340);
      g.lineTo(0, 340);
      g.fillStyle = colour;
      g.fill();
    }
    // a paper moon between the two of them
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.fill(circle(404, 125, 36));
    g.fillStyle = C.parch;
    g.fill(circle(400, 120, 36));
    g.fillStyle = C.parch2;
    for (const [x, y, r] of [[388, 108, 7], [414, 130, 9], [392, 136, 4], [418, 104, 4]]) g.fill(circle(x, y, r));
    // tiny pinned stars
    g.fillStyle = 'rgba(246,234,214,.55)';
    for (const [x, y, r] of [[60, 70, 4], [200, 150, 3], [268, 66, 3.5], [520, 150, 3], [600, 56, 4], [760, 140, 3], [470, 196, 2.5], [150, 196, 2.5]]) g.fill(star(x, y, r * 1.6));
    // the far hills, with the enemy's tower on them
    smoothHills(g, [[0, 286], [70, 262], [160, 276], [250, 252], [360, 270], [470, 248], [560, 262], [660, 240], [740, 254], [800, 246]], C.hillBack);
    g.fillStyle = C.hillBack;
    g.fillRect(684, 196, 26, 52);
    g.beginPath();
    g.moveTo(678, 198);
    g.lineTo(697, 162);
    g.lineTo(716, 198);
    g.closePath();
    g.fill();
    g.fillStyle = C.gold;
    g.fill(rrect(693, 212, 8, 12, [4, 4, 0, 0]));
    // a little pennant
    g.strokeStyle = C.hillBack;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(697, 164);
    g.lineTo(697, 150);
    g.stroke();
    g.fillStyle = '#ff6b6b';
    g.fill(poly([[698, 150], [710, 154], [698, 158]]));
    smoothHills(g, [[0, 300], [90, 282], [200, 298], [300, 280], [420, 296], [540, 278], [650, 294], [760, 280], [800, 288]], C.hillMid);
    smoothHills(g, [[0, 318], [130, 306], [260, 316], [400, 304], [530, 316], [660, 306], [800, 314]], C.hillFront);

    // the stage floor, boards running towards the back
    g.beginPath();
    g.moveTo(30, 318);
    g.lineTo(770, 318);
    g.lineTo(800, 392);
    g.lineTo(0, 392);
    g.closePath();
    g.fillStyle = C.floor;
    g.fill();
    g.strokeStyle = C.plank;
    g.lineWidth = 2;
    for (let i = 1; i < 16; i++) {
      const xf = (i * W) / 16;
      g.beginPath();
      g.moveTo(400 + (xf - 400) * 0.925, 318);
      g.lineTo(xf, 392);
      g.stroke();
    }
    g.fillStyle = '#5f3e2c';
    g.fillRect(30, 318, 740, 5);
    // where the footlights land
    g.fillStyle = 'rgba(255,224,138,.07)';
    for (const x of LAMPS) {
      g.beginPath();
      g.ellipse(x, 384, 52, 14, 0, 0, Math.PI * 2);
      g.fill();
    }
    // the slot the puppets' rods run in
    g.strokeStyle = C.woodDeep;
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(100, SLOT_Y);
    g.lineTo(700, SLOT_Y);
    g.stroke();
    g.strokeStyle = '#94694a';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(100, SLOT_Y + 3);
    g.lineTo(700, SLOT_Y + 3);
    g.stroke();
  }
  const LAMPS = [96, 197, 298, 400, 502, 603, 704];

  // the proscenium, pelmet and footlight shells, drawn once
  function drawFrame() {
    const g = frameLayer.getContext('2d');
    g.setTransform(K, 0, 0, K, 0, 0);
    g.fillStyle = C.wood;
    g.fillRect(0, 0, 30, H);
    g.fillRect(770, 0, 30, H);
    g.fillRect(0, 0, W, 38);
    // inlay down the pillars
    g.strokeStyle = C.tanEdge;
    g.lineWidth = 2;
    g.strokeRect(9, 74, 12, 300);
    g.strokeRect(779, 74, 12, 300);
    g.fillStyle = C.gold;
    for (const x of [15, 785]) {
      g.fill(star(x, 62, 8));
      g.fill(circle(x, 224, 3));
    }
    // the pelmet: scallops with a fringe and tassels
    const n = 9;
    const w = 740 / n;
    const pelmet = new Path2D();
    pelmet.moveTo(30, 36);
    pelmet.lineTo(770, 36);
    pelmet.lineTo(770, 50);
    for (let i = n - 1; i >= 0; i--) pelmet.quadraticCurveTo(30 + i * w + w / 2, 74, 30 + i * w, 50);
    pelmet.closePath();
    g.fillStyle = 'rgba(0,0,0,.22)';
    g.save();
    g.translate(0, 4);
    g.fill(pelmet);
    g.restore();
    g.fillStyle = C.valance;
    g.fill(pelmet);
    g.strokeStyle = C.tanLight;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(770, 50);
    for (let i = n - 1; i >= 0; i--) g.quadraticCurveTo(30 + i * w + w / 2, 74, 30 + i * w, 50);
    g.stroke();
    g.fillStyle = C.gold;
    for (let i = 1; i < n; i++) g.fill(poly([[30 + i * w - 4, 50], [30 + i * w + 4, 50], [30 + i * w, 62]]));
    g.fillStyle = C.wood;
    g.fillRect(0, 30, W, 8);
    g.fillStyle = C.woodDeep;
    g.fillRect(0, 36, W, 2);

    // the front of the stage
    g.fillStyle = C.woodDark;
    g.fillRect(0, 392, W, 38);
    g.fillStyle = C.wood;
    g.fillRect(0, 391, W, 4);
    for (const x of LAMPS) {
      const shell = new Path2D();
      shell.moveTo(x - 20, 398);
      shell.quadraticCurveTo(x, 428, x + 20, 398);
      shell.closePath();
      g.fillStyle = C.tanEdge;
      g.save();
      g.translate(0, 3);
      g.fill(shell);
      g.restore();
      g.fillStyle = C.tan;
      g.fill(shell);
    }
  }

  // ---------- drawing on the actors layer (with shadows) ----------
  // runs f on the actors layer and the shadow layer, so transforms stay the same on both
  function both(f) {
    f(actx);
    f(sctx);
  }
  // a cut out shape: a cream paper edge, its colour, and a shadow
  function cut(path, fill, edge = 5, margin = C.paper) {
    for (const g of [actx, sctx]) {
      g.lineJoin = 'round';
      g.lineWidth = edge;
    }
    if (margin) {
      actx.strokeStyle = margin;
      actx.stroke(path);
    }
    sctx.stroke(path);
    sctx.fill(path);
    actx.fillStyle = fill;
    actx.fill(path);
  }

  // ---------- the puppets ----------
  // where a puppet is this frame: its base on the floor, tilt on its rod, from everything that's happened to it
  function pose(p) {
    const d = p.def.dir;
    const phase = p === you ? 0 : 2.1;
    let x = p.def.x;
    let y = FLOOR_Y;
    let rot = 0;
    let arm = 0;
    if (!reduceMotion) {
      y += Math.sin(now / 520 + phase) * 1.6;
      rot += Math.sin(now / 900 + phase) * 0.018;
    }
    // lunging forward to cast
    let t = since(p.ev.lunge);
    if (t < 500) {
      const k = t < 140 ? easeOut(t / 140) : 1 - easeInOut((t - 140) / 360);
      x += d * 26 * k;
      rot += d * 0.07 * k;
      arm = -0.75 * k;
    }
    // a little hop (healing, celebrating)
    t = since(p.ev.hop);
    if (t < 420) y -= Math.sin((Math.PI * t) / 420) * 18;
    // knocked back, wobbling on the rod
    t = since(p.ev.hit);
    if (t < 1000) {
      const e = Math.exp(-t / 230) * (p.ev.hitBig ? 1.5 : 1);
      x -= d * 22 * e;
      rot -= d * 0.2 * e * Math.cos(t / 75);
    }
    // falling over at the end of the show
    t = since(p.ev.fall);
    if (t < Infinity) rot -= d * 1.38 * bounce(clamp01(t / 700));
    return { x, y, rot, arm };
  }

  function drawPuppet(p) {
    const w = p.def;
    const P = pose(p);
    const hurt = since(p.ev.hit) < 650;
    const out = since(p.ev.fall) < Infinity;
    const blink = (now + (p === you ? 0 : 1700)) % 4300 < 130;
    const flash = clamp01(1 - since(p.ev.hit) / 150);
    // the hat's tip swings when they move
    let swing = Math.sin(now / 640 + w.x) * 2;
    const hitT = since(p.ev.hit);
    if (hitT < 1000) swing += 14 * Math.exp(-hitT / 260) * Math.sin(hitT / 60);
    const lungeT = since(p.ev.lunge);
    if (lungeT < 500) swing -= 10 * Math.sin((Math.PI * lungeT) / 500);

    // the arm, staff and gem swing up from the shoulder when casting
    const armM = new DOMMatrix().translate(4, -96).rotate((P.arm * 180) / Math.PI).translate(-4, 96);
    const staff = poly([[51, -2], [57, -3], [43, -170], [37, -169]], armM);
    const sleeve = new Path2D();
    const sleeveRaw = new Path2D();
    sleeveRaw.moveTo(-2, -100);
    sleeveRaw.quadraticCurveTo(32, -104, 48, -70);
    sleeveRaw.lineTo(34, -58);
    sleeveRaw.quadraticCurveTo(22, -78, -4, -80);
    sleeveRaw.closePath();
    sleeve.addPath(sleeveRaw, armM);
    const hand = new Path2D();
    hand.addPath(circle(44, -64, 7.5), armM);
    const castT = since(p.ev.lunge);
    const gemScale = 1 + (castT < 600 ? 0.5 * Math.sin((Math.PI * castT) / 600) : 0);
    const gemM = armM.translate(40, -182).scale(gemScale);
    const gem = poly([[0, -12], [8, 0], [0, 12], [-8, 0]], gemM);
    // where the gem is on the canvas, for spells to come out of
    const tip = armM.transformPoint(new DOMPoint(40, -182));
    const cos = Math.cos(P.rot);
    const sin = Math.sin(P.rot);
    const lx = tip.x * w.size * w.dir;
    const ly = tip.y * w.size;
    p.tip = { x: P.x + lx * cos - ly * sin, y: P.y + lx * sin + ly * cos };

    const robe = new Path2D();
    robe.moveTo(-26, -100);
    robe.quadraticCurveTo(-36, -52, -50, -4);
    robe.quadraticCurveTo(-38, 4, -25, -2);
    robe.quadraticCurveTo(-12, 4, 0, -2);
    robe.quadraticCurveTo(12, 4, 25, -2);
    robe.quadraticCurveTo(38, 4, 50, -4);
    robe.quadraticCurveTo(36, -52, 26, -100);
    robe.closePath();
    const head = circle(6, -122, 21);
    const beard = new Path2D();
    beard.moveTo(-13, -121);
    beard.quadraticCurveTo(-18, -96, -5, -86);
    beard.quadraticCurveTo(2, -78, 10, -66);
    beard.quadraticCurveTo(19, -78, 23, -88);
    beard.quadraticCurveTo(33, -99, 29, -119);
    beard.quadraticCurveTo(9, -104, -13, -121);
    beard.closePath();
    const brim = new Path2D();
    brim.moveTo(-38, -135);
    brim.quadraticCurveTo(6, -153, 50, -135);
    brim.quadraticCurveTo(6, -126, -38, -135);
    brim.closePath();
    const tx = w.tip + swing;
    const cone = new Path2D();
    cone.moveTo(-21, -140);
    cone.bezierCurveTo(-10, -172, -4, -200, tx, -224);
    cone.bezierCurveTo(10, -200, 22, -170, 35, -140);
    cone.closePath();

    const silhouette = [robe, staff, sleeve, hand, head, beard, cone, brim, gem];
    both((g) => {
      g.save();
      g.translate(P.x, P.y);
      // the rod, down into the slot. it stays upright, the puppet tilts on top of it
      g.fillStyle = g === actx ? C.woodDeep : '#000';
      g.fillRect(-2.5, 0, 5, SLOT_Y - P.y);
      g.rotate(P.rot);
      g.scale(w.size * w.dir, w.size);
    });
    // one paper edge round the whole figure, then the shadow, then the colours
    actx.lineJoin = 'round';
    actx.lineWidth = 9;
    actx.strokeStyle = C.paper;
    for (const s of silhouette) actx.stroke(s);
    sctx.lineJoin = 'round';
    sctx.lineWidth = 9;
    for (const s of silhouette) {
      sctx.stroke(s);
      sctx.fill(s);
    }
    const g = actx;
    g.fillStyle = w.robe;
    g.fill(robe);
    g.save();
    g.clip(robe);
    g.fillStyle = w.trim;
    g.fillRect(-60, -14, 120, 20);
    g.fillRect(-4, -100, 8, 90);
    g.fillStyle = w.band;
    g.fill(star(-24, -40, 7));
    g.fill(star(26, -28, 5));
    g.restore();
    g.fillStyle = C.tanEdge;
    g.fill(staff);
    g.fillStyle = w.robe;
    g.fill(sleeve);
    g.fillStyle = w.trim;
    g.save();
    g.clip(sleeve);
    g.fill(poly([[30, -70], [52, -80], [52, -50], [30, -50]], armM));
    g.restore();
    g.fillStyle = C.peach;
    g.fill(hand);
    g.fill(head);
    g.fillStyle = w.beard;
    g.fill(beard);
    // moustache
    g.fill(circle(9, -110, 6));
    g.fill(circle(20, -110, 5.5));
    g.fillStyle = C.peachDark;
    g.fill(circle(22, -118, 6));
    // eyes
    g.strokeStyle = g.fillStyle = C.ink;
    g.lineWidth = 2.6;
    g.lineCap = 'round';
    if (out) {
      for (const ex of [8, 19]) {
        g.beginPath();
        g.moveTo(ex - 3, -130);
        g.lineTo(ex + 3, -124);
        g.moveTo(ex + 3, -130);
        g.lineTo(ex - 3, -124);
        g.stroke();
      }
    } else if (hurt) {
      g.beginPath();
      g.moveTo(5, -130);
      g.lineTo(10, -127);
      g.lineTo(5, -124);
      g.moveTo(22, -130);
      g.lineTo(17, -127);
      g.lineTo(22, -124);
      g.stroke();
    } else if (blink) {
      g.beginPath();
      g.moveTo(5, -127);
      g.lineTo(11, -127);
      g.moveTo(16, -127);
      g.lineTo(22, -127);
      g.stroke();
    } else {
      g.fill(circle(8, -127, 2.8));
      g.fill(circle(19, -127, 2.8));
    }
    // brows: kind arches on you, a scowl on him
    g.beginPath();
    if (w.brows === 'kind') {
      g.moveTo(4, -133);
      g.quadraticCurveTo(8, -136, 12, -134);
      g.moveTo(15, -134);
      g.quadraticCurveTo(19, -136, 23, -133);
    } else {
      g.moveTo(2, -137);
      g.lineTo(12, -131);
      g.moveTo(16, -131);
      g.lineTo(26, -137);
    }
    g.stroke();
    g.fillStyle = w.hat;
    g.fill(cone);
    g.save();
    g.clip(cone);
    g.fillStyle = w.band;
    g.fillRect(-40, -154, 90, 12);
    g.restore();
    g.fillStyle = w.band === C.gold ? C.gold : w.trim;
    g.fill(star(10 + swing * 0.2, -176, 8));
    g.fillStyle = w.hat;
    g.fill(brim);
    g.fillStyle = p.gem || w.gem;
    g.fill(gem);
    // flashes white for a moment when hit
    if (flash > 0) {
      g.globalAlpha = flash * 0.85;
      g.fillStyle = '#fff6e4';
      for (const s of silhouette) g.fill(s);
      g.globalAlpha = 1;
    }
    both((h) => h.restore());
  }

  // ---------- shields ----------
  const SHIELD_R = { 0.1: 24, 0.2: 31, 0.5: 40 };
  function drawShield(p) {
    const s = p.shield;
    if (!s) return;
    const t = now - s.t0;
    const d = p.def.dir;
    const r = SHIELD_R[s.size];
    let x = p.def.x + d * 66 * p.def.size;
    let y = FLOOR_Y - 98 * p.def.size + Math.sin(now / 300) * 2;
    let scale = easeOutBack(clamp01(t / 260));
    if (s.down != null) scale *= 1 - easeInOut(clamp01((now - s.down) / 220));
    if (scale <= 0.01) return;
    let rot = 0;
    if (s.hitAt != null) {
      const h = now - s.hitAt;
      rot = Math.sin(h / 40) * 0.3 * Math.exp(-h / 260);
      x += d * Math.exp(-h / 120) * 8;
    }
    const face = s.colour;
    const drawWhole = (halves) => {
      both((g) => {
        g.save();
        g.translate(x, y);
        g.rotate(rot);
        g.scale(scale, scale);
      });
      if (halves) {
        // a failed shield splits down the middle and falls away
        const k = clamp01((t - 380) / 520);
        actx.globalAlpha = 1 - k;
        for (const side of [-1, 1]) {
          both((g) => {
            g.save();
            g.translate(side * k * 26, k * k * 70);
            g.rotate(side * k * 0.9);
            g.beginPath();
            g.rect(side < 0 ? -r - 8 : 0, -r - 8, r + 8, r * 2 + 16);
            g.clip();
          });
          shieldShape(r, face);
          both((g) => g.restore());
        }
        actx.globalAlpha = 1;
      } else {
        shieldShape(r, face);
        if (!s.ok && t > 220) {
          actx.strokeStyle = C.ink;
          actx.lineWidth = 2.5;
          actx.beginPath();
          actx.moveTo(0, -r);
          actx.lineTo(-4, -r * 0.4);
          actx.lineTo(4, 0);
          actx.lineTo(-3, r * 0.5);
          actx.lineTo(0, r);
          actx.stroke();
        }
      }
      both((g) => g.restore());
    };
    if (!s.ok && t > 380) {
      if (t < 900) drawWhole(true);
      return;
    }
    drawWhole(false);
  }
  function shieldShape(r, face) {
    cut(circle(0, 0, r), C.tan, 5);
    actx.fillStyle = face;
    actx.fill(circle(0, 0, r - 6));
    // the protection rune from the table
    actx.strokeStyle = C.paper;
    actx.lineWidth = 4;
    actx.lineCap = 'round';
    actx.beginPath();
    actx.moveTo(0, -r * 0.5);
    actx.lineTo(0, r * 0.5);
    actx.moveTo(0, -r * 0.02);
    actx.lineTo(-r * 0.36, -r * 0.44);
    actx.moveTo(0, -r * 0.02);
    actx.lineTo(r * 0.36, -r * 0.44);
    actx.stroke();
  }

  // ---------- spells in the air ----------
  function spellPos(s, k) {
    return { x: lerp(s.from.x, s.to.x, k), y: lerp(s.from.y, s.to.y, k) - s.peak * 4 * k * (1 - k) };
  }
  function drawSpell(el, x, y, angle, size, t) {
    const c = ELEMENT[el];
    both((g) => {
      g.save();
      g.translate(x, y);
      g.rotate(angle);
      g.scale(size, size);
    });
    if (el === 'Fire' || el === 'Water') {
      // a teardrop, round end first, flickering
      const f = el === 'Fire' ? 1 + Math.sin(t / 35) * 0.12 : 1;
      const drop = (r, len) => {
        const p = new Path2D();
        p.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
        p.quadraticCurveTo(-len * 0.5, r * 0.9, -len * f, 0);
        p.quadraticCurveTo(-len * 0.5, -r * 0.9, 0, -r);
        p.closePath();
        return p;
      };
      cut(drop(14, 34), c.main, 5);
      actx.fillStyle = c.mid;
      actx.fill(drop(9, 22));
      actx.fillStyle = c.pale;
      actx.fill(el === 'Fire' ? drop(5, 11) : circle(4, -4, 3.5));
    } else if (el === 'Earth') {
      // a tumbling lump of rock with moss on top
      both((g) => g.rotate(t / 90));
      const rock = poly([[-14, -6], [-6, -15], [8, -13], [15, -2], [10, 12], [-4, 15], [-15, 6]]);
      cut(rock, c.main, 5);
      actx.save();
      actx.clip(rock);
      actx.fillStyle = c.mid;
      actx.fill(poly([[-16, -16], [16, -16], [16, -3], [6, -6], [-2, 0], [-10, -3], [-16, 2]]));
      actx.restore();
      actx.fillStyle = '#6e5236';
      actx.fill(circle(4, 6, 3));
    } else if (el === 'Neutral') {
      cut(star(0, 0, 18, 5, 0.45, t / 120), c.main, 5, C.tan);
      actx.fillStyle = c.mid;
      actx.fill(circle(0, 0, 3.5));
    } else {
      // berserk: a big jagged red star with a dark edge
      cut(star(0, 0, 26, 7, 0.5, t / 70), c.main, 6, c.mid);
      actx.fillStyle = c.pale;
      actx.fill(star(0, 0, 11, 7, 0.5, -t / 90));
    }
    both((g) => g.restore());
  }
  function fly(o) {
    spells.push({ t0: now, landed: false, ...o });
  }
  function trail(s, x, y) {
    const c = ELEMENT[s.el];
    if (s.el === 'Fire') part({ x, y, vx: rnd(-20, 20), vy: rnd(-40, -10), size: rnd(4, 7), color: pick([c.main, c.mid, c.pale]), shape: 'square', life: 380, vr: rnd(-6, 6), shrink: true });
    else if (s.el === 'Water') part({ x, y, vx: rnd(-15, 15), vy: rnd(10, 40), g: 300, size: rnd(3, 5), color: pick([c.main, c.mid]), shape: 'circle', life: 420, shrink: true });
    else if (s.el === 'Earth') part({ x, y, vx: rnd(-20, 20), vy: rnd(0, 30), g: 200, size: rnd(3, 5), color: pick([c.main, c.mid, '#6e5236']), shape: 'tri', life: 400, vr: rnd(-8, 8), shrink: true });
    else if (s.el === 'Neutral') { if (Math.random() < 0.5) part({ x, y, vx: rnd(-10, 10), vy: rnd(-10, 10), size: rnd(5, 8), color: pick([c.main, C.gold]), shape: 'star', life: 450, vr: rnd(-3, 3), shrink: true }); }
    else part({ x, y, vx: rnd(-40, 40), vy: rnd(-40, 40), size: rnd(5, 9), color: pick([c.main, c.mid, '#2e0c0f']), shape: 'tri', life: 360, vr: rnd(-10, 10), shrink: true });
  }

  // ---------- confetti, leaves and puffs ----------
  function part(o) {
    parts.push({ x: 0, y: 0, vx: 0, vy: 0, g: 0, rot: rnd(0, 6), vr: 0, size: 6, color: '#fff', shape: 'square', life: 600, age: 0, grow: 0, shrink: false, ...o });
  }
  function drawPart(q) {
    const k = q.age / q.life;
    const a = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
    const s = q.size * (q.shrink ? 1 - k * 0.8 : 1) * (1 + q.grow * k);
    const g = actx;
    g.save();
    g.globalAlpha = a;
    g.translate(q.x, q.y);
    g.rotate(q.rot);
    g.fillStyle = q.color;
    if (q.shape === 'square') g.fillRect(-s / 2, -s / 2, s, s);
    else if (q.shape === 'circle') g.fill(circle(0, 0, s / 2));
    else if (q.shape === 'tri') g.fill(poly([[0, -s * 0.6], [s * 0.55, s * 0.4], [-s * 0.55, s * 0.4]]));
    else if (q.shape === 'star') g.fill(star(0, 0, s));
    else if (q.shape === 'leaf') {
      const leaf = new Path2D();
      leaf.moveTo(0, -s);
      leaf.quadraticCurveTo(s * 0.8, 0, 0, s);
      leaf.quadraticCurveTo(-s * 0.8, 0, 0, -s);
      g.fill(leaf);
    } else if (q.shape === 'plus') {
      g.fillRect(-s / 2, -s / 6, s, s / 3);
      g.fillRect(-s / 6, -s / 2, s / 3, s);
    }
    g.restore();
  }

  // ---------- paper slips with numbers on ----------
  function tag(x, y, text, colour, sub = '') {
    tags.push({ x, y, text, colour, sub, t0: now, tilt: rnd(-0.07, 0.07) });
    sfx('pop', { rate: rnd(0.9, 1.15) });
  }
  function drawTag(tg) {
    const t = now - tg.t0;
    if (t > 1600) return false;
    const pop = t < 200 ? easeOutBack(t / 200) : 1;
    const rise = 30 * easeOut(clamp01(t / 1600));
    const a = t > 1250 ? 1 - (t - 1250) / 350 : 1;
    actx.font = `700 ${tg.sub ? 26 : 22}px "Crimson Pro", Georgia, serif`;
    const tw = actx.measureText(tg.text).width;
    actx.font = '700 11px Quicksand, sans-serif';
    const sw = tg.sub ? actx.measureText(tg.sub).width : 0;
    const w = Math.max(tw, sw) + 24;
    const h = tg.sub ? 50 : 34;
    both((g) => {
      g.save();
      g.globalAlpha = a;
      g.translate(tg.x, tg.y - rise);
      g.rotate(tg.tilt);
      g.scale(pop, pop);
    });
    cut(rrect(-w / 2, -h / 2, w, h, 8), C.paper, 3, C.parchEdge);
    actx.fillStyle = tg.colour;
    actx.textAlign = 'center';
    actx.textBaseline = 'middle';
    actx.font = `700 ${tg.sub ? 26 : 22}px "Crimson Pro", Georgia, serif`;
    actx.fillText(tg.text, 0, tg.sub ? -7 : 1);
    if (tg.sub) {
      actx.font = '700 11px Quicksand, sans-serif';
      actx.fillStyle = '#6a5240';
      actx.fillText(tg.sub, 0, 14);
    }
    both((g) => g.restore());
    return true;
  }

  // ---------- the curtains, plaques and the rest ----------
  function curtainOpen() {
    return lerp(curtain.from, curtain.to, easeInOut(clamp01((now - curtain.t0) / curtain.dur)));
  }
  function curtainTo(to, dur) {
    curtain = { from: curtainOpen(), to, t0: now, dur };
  }
  function drawCurtains(open) {
    const width = lerp(374, 60, open);
    const n = 7;
    const colW = width / n;
    for (const side of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const x = side < 0 ? 30 + i * colW : 770 - (i + 1) * colW;
        const sway = reduceMotion ? 0 : Math.sin(now / 800 + i * 1.3 + side) * 2 * (1 - open * 0.6);
        const bottom = 392 + sway;
        ctx.fillStyle = i % 2 ? C.curtainDark : C.curtain;
        ctx.fill(rrect(x - 0.5, 20, colW + 1, bottom - 20, [0, 0, colW / 2, colW / 2]));
        if (i % 2 === 0) {
          ctx.fillStyle = C.curtainShine;
          ctx.fillRect(x + colW * 0.28, 20, Math.max(1.5, colW * 0.12), bottom - 20 - colW / 2);
        }
      }
      // a gold rope holds them back when they're open
      if (open > 0.6) {
        ctx.globalAlpha = clamp01((open - 0.6) / 0.3);
        ctx.fillStyle = C.gold;
        const rx = side < 0 ? 26 : 774 - width - 8;
        ctx.fill(rrect(rx, 250, width + 12, 9, 4.5));
        ctx.fill(circle(side < 0 ? rx + width + 10 : rx + 2, 254, 7));
        ctx.globalAlpha = 1;
      }
    }
  }
  const HANGING = [[140, 104, 9, 0], [322, 64, 8, 1.5], [478, 84, 9, 3], [668, 100, 10, 4.4]];
  function drawHangingStars() {
    for (const [x, len, r, ph] of HANGING) {
      const a = reduceMotion ? 0 : Math.sin(now / 1400 + ph) * 0.09;
      const sx = x + Math.sin(a) * len;
      const sy = 38 + Math.cos(a) * len;
      ctx.strokeStyle = 'rgba(246,234,214,.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, 38);
      ctx.lineTo(sx, sy - r);
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.fill(star(sx + 3, sy + 4, r * 1.6, 5, 0.45, a * 2));
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = C.paper;
      const s = star(sx, sy, r * 1.6, 5, 0.45, a * 2);
      ctx.stroke(s);
      ctx.fillStyle = C.gold;
      ctx.fill(s);
    }
  }
  function drawLamps() {
    for (const [i, x] of LAMPS.entries()) {
      const flicker = reduceMotion ? 1 : 0.85 + 0.15 * Math.sin(now / 90 + i * 2.3) * Math.sin(now / 37 + i);
      ctx.fillStyle = `rgba(255,224,138,${flicker})`;
      ctx.fill(circle(x, 398, 7));
    }
  }
  // the health meters: parchment plaques hanging from the pelmet
  function drawPlaque(p, cx) {
    const hp = p.hp;
    const jolt = since(p.ev.hit) < 900 ? Math.exp(-since(p.ev.hit) / 250) * Math.sin(since(p.ev.hit) / 70) * 0.06 : 0;
    const swing = (reduceMotion ? 0 : Math.sin(now / 1100 + cx) * 0.012) + jolt;
    ctx.save();
    ctx.translate(cx, 52);
    ctx.rotate(swing);
    ctx.strokeStyle = C.tanLight;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-52, 0);
    ctx.lineTo(-52, 14);
    ctx.moveTo(52, 0);
    ctx.lineTo(52, 14);
    ctx.stroke();
    ctx.fillStyle = C.parchEdge;
    ctx.fill(rrect(-76, 14, 152, 48, 10));
    ctx.fillStyle = C.parch;
    ctx.fill(rrect(-76, 10, 152, 48, 10));
    ctx.fillStyle = C.tanEdge;
    ctx.fill(circle(-52, 15, 2.5));
    ctx.fill(circle(52, 15, 2.5));
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.ink;
    ctx.textAlign = 'left';
    ctx.font = '700 17px "Crimson Pro", Georgia, serif';
    ctx.fillText(p.def.name, -64, 34);
    ctx.textAlign = 'right';
    ctx.font = '700 12.5px Quicksand, sans-serif';
    ctx.fillStyle = '#5a4232';
    ctx.fillText(`${Math.round(hp.target)}/${hp.max}`, 64, 33);
    const bw = 128;
    const frac = (v) => clamp01(v / hp.max) * bw;
    ctx.fillStyle = C.parch2;
    ctx.fill(rrect(-64, 40, bw, 10, 5));
    const low = hp.target / hp.max <= 0.15;
    if (hp.ghost > hp.fill) {
      ctx.fillStyle = hp.dir < 0 ? '#ff9d8f' : '#b7e08a';
      ctx.fill(rrect(-64, 40, Math.max(10, frac(hp.ghost)), 10, 5));
    }
    if (hp.fill > 0) {
      ctx.fillStyle = low ? (reduceMotion || Math.sin(now / 160) > -0.2 ? '#c93232' : '#e05555') : '#4f9a3c';
      ctx.fill(rrect(-64, 40, Math.max(10, frac(hp.fill)), 10, 5));
    }
    // your accuracy penalty, pinned underneath
    if (p === you && battle && battle.accPenalty > 0 && screen === 'battle') {
      ctx.fillStyle = '#e8b8ad';
      ctx.fill(rrect(-70, 62, 140, 22, 6));
      ctx.fillStyle = '#ffe1dc';
      ctx.fill(rrect(-70, 59, 140, 22, 6));
      ctx.fillStyle = '#9c2f36';
      ctx.textAlign = 'center';
      ctx.font = '700 11px Quicksand, sans-serif';
      ctx.fillText(`Next move -${battle.accPenalty}% accuracy`, 0, 74);
    }
    ctx.restore();
  }
  function drawSceneTag() {
    ctx.fillStyle = C.parchEdge;
    ctx.fill(rrect(352, 7, 96, 26, 8));
    ctx.fillStyle = C.parch;
    ctx.fill(rrect(352, 4, 96, 26, 8));
    ctx.fillStyle = C.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'italic 600 17px "Crimson Pro", Georgia, serif';
    // the scene being played out, or the one you're choosing for
    ctx.fillText(`Scene ${busy ? battle.moveNum - 1 : battle.moveNum}`, 400, 17.5);
  }

  // ---------- each frame ----------
  function tick(dt) {
    while (queue.length && queue[0].at <= now) queue.shift().fn();
    const s = dt / 1000;
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.age += dt;
      if (q.age >= q.life) { parts.splice(i, 1); continue; }
      q.vy += q.g * s;
      q.x += q.vx * s;
      q.y += q.vy * s;
      q.rot += q.vr * s;
    }
    for (let i = spells.length - 1; i >= 0; i--) {
      const sp = spells[i];
      const k = (now - sp.t0) / sp.dur;
      if (k >= 1 && !sp.landed) {
        sp.landed = true;
        if (sp.onLand) sp.onLand();
      }
      if (k >= (sp.through ? 1.45 : 1)) { spells.splice(i, 1); continue; }
      const pos = spellPos(sp, k);
      trail(sp, pos.x, pos.y);
    }
    for (const p of [you, foe]) {
      const hp = p.hp;
      const settled = since(hp.at) > 380;
      if (hp.target < hp.fill) hp.fill = Math.max(hp.target, hp.fill - (hp.fill - hp.target) * Math.min(1, dt / 60) - 0.5);
      if (hp.target > hp.fill && settled) hp.fill = Math.min(hp.target, hp.fill + (hp.target - hp.fill) * Math.min(1, dt / 120) + 0.3);
      if (hp.target > hp.ghost) hp.ghost = hp.target;
      if (hp.ghost > hp.target && settled) hp.ghost = Math.max(hp.target, hp.ghost - (hp.ghost - hp.target) * Math.min(1, dt / 140) - 0.3);
    }
  }

  function draw() {
    ctx.setTransform(K, 0, 0, K, 0, 0);
    // the shake moves what's on the stage, never the theatre round it
    let sx = 0;
    let sy = 0;
    const st = since(shake.at);
    if (!reduceMotion && st < 500) {
      const e = shake.amp * Math.exp(-st / 110);
      sx = Math.sin(st / 18) * e;
      sy = Math.cos(st / 23) * e * 0.6;
    }
    ctx.save();
    ctx.translate(sx, sy);
    ctx.drawImage(bgLayer, 0, 0, W, H);
    drawHangingStars();

    actx.setTransform(K, 0, 0, K, 0, 0);
    actx.clearRect(0, 0, W, H);
    sctx.setTransform(K, 0, 0, K, 0, 0);
    sctx.clearRect(0, 0, W, H);
    sctx.setTransform(K, 0, 0, K, 4 * K, 5 * K);
    sctx.fillStyle = sctx.strokeStyle = '#000';
    // nothing on the stage needs drawing while the curtains are shut
    if (curtainOpen() > 0.001) {
      drawPuppet(you);
      drawPuppet(foe);
      drawShield(you);
      drawShield(foe);
      for (const q of parts) drawPart(q);
      for (const sp of spells) {
        const k = (now - sp.t0) / sp.dur;
        const pos = spellPos(sp, k);
        const ahead = spellPos(sp, k + 0.02);
        const fade = sp.through && k > 1 ? 1 - (k - 1) / 0.45 : 1;
        actx.globalAlpha = fade;
        drawSpell(sp.el, pos.x, pos.y, Math.atan2(ahead.y - pos.y, ahead.x - pos.x), sp.size || 1, now - sp.t0);
        actx.globalAlpha = 1;
      }
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        const k = (now - b.t0) / 260;
        if (k >= 1) { bursts.splice(i, 1); continue; }
        const c = ELEMENT[b.el];
        actx.globalAlpha = 1 - k;
        actx.fillStyle = c.mid;
        actx.fill(star(b.x, b.y, lerp(12, 48 * b.size, easeOut(k)), 9, 0.55, b.rot));
        actx.fillStyle = c.pale;
        actx.fill(star(b.x, b.y, lerp(6, 24 * b.size, easeOut(k)), 9, 0.55, -b.rot));
        actx.globalAlpha = 1;
      }
      for (let i = tags.length - 1; i >= 0; i--) if (!drawTag(tags[i])) tags.splice(i, 1);
    }
    ctx.setTransform(1, 0, 0, 1, sx * K, sy * K);
    ctx.globalAlpha = 0.3;
    ctx.drawImage(shadowLayer, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(actorLayer, 0, 0);
    ctx.restore();

    ctx.setTransform(K, 0, 0, K, 0, 0);
    drawCurtains(curtainOpen());
    drawLamps();
    ctx.drawImage(frameLayer, 0, 0, W, H);
    if (battle && (screen === 'battle' || screen === 'tour')) {
      drawPlaque(you, 192);
      drawPlaque(foe, 608);
      if (screen === 'battle') drawSceneTag();
    }
  }

  // ---------- acting out a turn ----------
  const NAMES = { Low: 'Minor', Mid: 'Average', High: 'High' };
  function moveName(move, element) {
    if (move === 'Berserk Strike') return `Berserk Strike, ${element}`;
    const [tier, type] = move.split(' ');
    const name = `${NAMES[tier]} ${type.toLowerCase()}`;
    return element && element !== 'n/a' ? `${name}, ${element}` : name;
  }
  const DEFENCE = { 'Low Defend': 0.1, 'Mid Defend': 0.2, 'High Defend': 0.5 };
  function setHp(p, value) {
    p.hp.dir = Math.sign(value - p.hp.target);
    p.hp.target = value;
    p.hp.at = now;
  }
  function multiplierNote(mult, mine, theirs) {
    if (mult === 2) return `${mine} beats ${theirs}: double`;
    if (mult === 0.5) return `${theirs} beats ${mine}: half`;
    return '';
  }
  function raiseShield(p, size, ok) {
    p.shield = { t0: now, size, ok, down: null, hitAt: null, colour: p === you ? '#98c1ff' : '#ff8f8f' };
    sfx('shield');
    const x = p.def.x + p.def.dir * 66;
    if (ok) later(160, () => tag(x, FLOOR_Y - 160, `${size * 100}% shield`, '#3f6dc0'));
    else later(300, () => { sfx('tear'); tag(x, FLOOR_Y - 160, 'Defense failed!', '#6a5240'); });
  }
  // a spell from caster at target. o: { el, success, damage, mult, note, berserk, onLand(hit) }
  function castAttack(caster, target, o) {
    caster.ev.lunge = now;
    caster.gem = ELEMENT[o.berserk ? 'Berserk' : o.el].main;
    later(900, () => { caster.gem = null; });
    sfx('cast');
    if (o.berserk) sfx('berserk');
    later(140, () => {
      const el = o.berserk ? 'Berserk' : o.el;
      sfx(o.berserk ? 'Fire' : o.el, { rate: o.berserk ? 0.7 : 1 });
      const from = { ...caster.tip };
      const chest = { x: target.def.x, y: FLOOR_Y - 92 * target.def.size };
      if (o.success) {
        fly({ el, from, to: chest, dur: 520, peak: 50, size: 1, onLand: () => landHit(target, el, o) });
      } else if (o.berserk) {
        // a missed berserk strike sputters out over the middle and comes back at you
        const mid = { x: (caster.def.x + target.def.x) / 2, y: 150 };
        fly({ el, from, to: mid, dur: 420, peak: 30, onLand: () => {
          sfx('miss');
          fly({ el, from: mid, to: { x: caster.def.x, y: FLOOR_Y - 92 * caster.def.size }, dur: 380, peak: 30, onLand: () => {
            hitPuppet(caster, el, 1);
            setHp(caster, o.selfHp);
            tag(caster.def.x, FLOOR_Y - 190, '-10', '#b83a40', 'Backfired!');
            o.onLand();
          } });
        } });
      } else {
        // a miss sails over their head and off into the wings
        const past = { x: target.def.x + caster.def.dir * 190, y: FLOOR_Y - 230 };
        fly({ el, from, to: past, dur: 640, peak: 40, through: true });
        later(330, () => {
          sfx('miss');
          tag(target.def.x, FLOOR_Y - 182 * target.def.size, 'Missed', '#6a5240');
          o.onLand();
        });
      }
    });
  }
  function hitPuppet(p, el, size) {
    p.ev.hit = now;
    p.ev.hitBig = size > 1;
    shake = { at: now, amp: 3 + size * 3 };
    sfx('hit');
    sfx('thump');
    const x = p.def.x;
    const y = FLOOR_Y - 92 * p.def.size;
    bursts.push({ x, y, t0: now, el, size, rot: rnd(0, 1) });
    const c = ELEMENT[el];
    for (let i = 0; i < 14 * size; i++) {
      const a = rnd(0, Math.PI * 2);
      const v = rnd(80, 260);
      part({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, g: 520, size: rnd(5, 10), color: pick([c.main, c.mid, c.pale, C.paper]), shape: pick(['tri', 'square', 'tri']), life: rnd(500, 850), vr: rnd(-12, 12) });
    }
  }
  function landHit(target, el, o) {
    const shielded = target.shield && target.shield.ok;
    hitPuppet(target, el, o.berserk ? 1.6 : 1);
    if (shielded) {
      target.shield.hitAt = now;
      sfx('clang');
    }
    setHp(target, o.hpAfter);
    const sub = [o.note, shielded ? `${target.shield.size * 100}% blocked` : ''].filter(Boolean).join(', ');
    tag(target.def.x, FLOOR_Y - 182 * target.def.size, `-${o.damage}`, '#b83a40', sub);
    o.onLand();
  }
  function castHeal(p, ok, amount, hpAfter, done) {
    p.ev.hop = now;
    p.gem = '#8fdc8a';
    later(900, () => { p.gem = null; });
    const x = p.def.x;
    if (ok) {
      sfx('heal');
      for (let i = 0; i < 16; i++) {
        part({ x: x + rnd(-44, 44), y: FLOOR_Y - rnd(10, 150), vx: rnd(-18, 18), vy: rnd(-95, -45), size: rnd(5, 9), color: pick(['#8fdc8a', '#5fae4f', '#d4f5c4', C.gold]), shape: i % 3 ? 'leaf' : 'plus', life: rnd(700, 1100), vr: rnd(-4, 4) });
      }
      later(260, () => {
        setHp(p, hpAfter);
        tag(x, FLOOR_Y - 184 * p.def.size, `+${amount}`, '#3d763a');
        done();
      });
    } else {
      sfx('fizzle');
      for (let i = 0; i < 7; i++) {
        part({ x: x + rnd(-30, 30), y: FLOOR_Y - rnd(60, 140), vx: rnd(-20, 20), vy: rnd(-30, -10), size: rnd(12, 20), color: '#c9bfb4', shape: 'circle', life: 800, grow: 1.2 });
      }
      later(260, () => {
        tag(x, FLOOR_Y - 184 * p.def.size, 'Heal failed', '#6a5240');
        done();
      });
    }
  }

  function playTurn(t, before) {
    busy = true;
    renderDesk();
    const script = $('.wb-script');
    script.querySelector('.wb-script-scene').textContent = `Scene ${t.moveNum}`;
    const youLine = script.querySelector('[data-who="you"]');
    const foeLine = script.querySelector('[data-who="foe"]');
    const write = (line, who, move, el, outcome) => {
      line.innerHTML = `<b>${who}</b> <span>${moveName(move, el)}</span>${outcome ? ` <strong>${outcome}</strong>` : ''}`;
    };
    youLine.textContent = '';
    foeLine.textContent = '';

    // the healths after each half, worked out from the turn so the plaques change when things land
    let youHp = before.you;
    let foeHp = before.foe;
    let at = 150;
    const youDefends = t.moveType === 'Defend';
    const foeDefends = t.enemyType === 'defend';
    if (youDefends) later(at, () => { raiseShield(you, DEFENCE[t.move], t.playerSuccess); write(youLine, 'You', t.move, 'n/a', t.moveOutcome); });
    if (foeDefends) later(at + 220, () => { raiseShield(foe, DEFENCE[t.enemyMove], t.enemySuccess); write(foeLine, 'Enemy', t.enemyMove, 'n/a', t.enemyMoveOutcome); });
    if (youDefends || foeDefends) at += 900;

    // your move
    if (t.moveType === 'Attack') {
      const berserk = t.move === 'Berserk Strike';
      if (t.playerSuccess) foeHp = Math.max(0, foeHp - t.damageEnemy);
      if (berserk && !t.playerSuccess) youHp = Math.max(0, youHp - 10);
      const o = { el: t.moveElement, success: t.playerSuccess, damage: t.damageEnemy, berserk, hpAfter: foeHp, selfHp: youHp,
        note: multiplierNote(t.elementMultiplierPlayer, t.moveElement, t.enemyElement), onLand: () => write(youLine, 'You', t.move, t.moveElement, t.moveOutcome) };
      later(at, () => { write(youLine, 'You', t.move, t.moveElement); castAttack(you, foe, o); });
      at += berserk && !t.playerSuccess ? 1500 : 1200;
    } else if (t.moveType === 'Heal') {
      if (t.playerSuccess) youHp = Math.min(battle.player.maxHealth, youHp + t.healPlayer);
      const hpAfter = youHp;
      later(at, () => { write(youLine, 'You', t.move, 'n/a'); castHeal(you, t.playerSuccess, t.healPlayer, hpAfter, () => write(youLine, 'You', t.move, 'n/a', t.moveOutcome)); });
      at += 1000;
    }

    // the enemy's
    if (t.enemyType === 'attack') {
      if (t.enemySuccess) youHp = Math.max(0, youHp - t.damagePlayer);
      const o = { el: t.enemyElement, success: t.enemySuccess, damage: t.damagePlayer, hpAfter: youHp,
        note: multiplierNote(t.elementMultiplierEnemy, t.enemyElement, t.moveElement), onLand: () => write(foeLine, 'Enemy', t.enemyMove, t.enemyElement, t.enemyMoveOutcome) };
      later(at, () => { write(foeLine, 'Enemy', t.enemyMove, t.enemyElement); castAttack(foe, you, o); });
      at += 1200;
    } else if (t.enemyType === 'heal') {
      if (t.enemySuccess) foeHp = Math.min(battle.enemy.maxHealth, foeHp + t.healEnemy);
      const hpAfter = foeHp;
      later(at, () => { write(foeLine, 'Enemy', t.enemyMove, 'n/a'); castHeal(foe, t.enemySuccess, t.healEnemy, hpAfter, () => write(foeLine, 'Enemy', t.enemyMove, 'n/a', t.enemyMoveOutcome)); });
      at += 1000;
    }

    later(at + 250, () => {
      for (const p of [you, foe]) if (p.shield && p.shield.down == null) p.shield.down = now;
      // the plaques end up exactly where the rules say, whatever happened above
      if (you.hp.target !== battle.player.health) setHp(you, battle.player.health);
      if (foe.hp.target !== battle.enemy.health) setHp(foe, battle.enemy.health);
      const result = battle.result;
      if (result) return finish(result);
      busy = false;
      renderDesk();
    });
  }

  // you choosing a move: the uni version's moveRegister()
  function register(type, move, element) {
    if (busy || screen !== 'battle') return;
    const before = { you: battle.player.health, foe: battle.enemy.health };
    const t = battle.turn(type, move, element);
    choice = { type: null, tier: null, berserk: false };
    playTurn(t, before);
  }

  function finish(result) {
    const loser = result === 'win' ? foe : you;
    const winner = result === 'win' ? you : foe;
    loser.ev.fall = now;
    later(250, () => sfx('fall'));
    for (let i = 0; i < 3; i++) later(500 + i * 420, () => { winner.ev.hop = now; });
    if (result === 'win') {
      later(600, () => {
        for (let i = 0; i < 40; i++) part({ x: rnd(80, 720), y: rnd(40, 80), vx: rnd(-30, 30), vy: rnd(0, 60), g: 90, size: rnd(5, 9), color: pick([C.gold, '#98c1ff', C.paper, '#ff8a3d', '#8fdc8a']), shape: pick(['square', 'star', 'tri']), life: rnd(1600, 2400), vr: rnd(-6, 6) });
      });
    }
    later(1700, () => { curtainTo(0, 1100); sfx('curtain'); });
    later(2700, () => {
      sfx(result);
      const scenes = battle.moveNum - 1;
      $('#duelEndKicker').textContent = 'The curtain falls';
      $('#duelEndTitle').textContent = result === 'win' ? 'You win!' : 'Game over!';
      $('#duelEndLine').textContent = result === 'win'
        ? `The evil wizard is beaten after ${scenes} scene${scenes === 1 ? '' : 's'}.`
        : `The evil wizard wins this time, after ${scenes} scene${scenes === 1 ? '' : 's'}.`;
      busy = false;
      setScreen('end');
    });
    if (!exported) {
      exported = true;
      // the uni version sent every session to its server as a csv. the site has no server, so this only
      // does anything when it's run with the original project's server.js
      fetch('/save-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: `session_${playerID}.csv`, content: csv(battle, playerID) }),
      }).catch(() => {});
    }
  }

  // ---------- how to play ----------
  // the uni version's slides, one note at a time. the theatre dims and a spotlight falls on what the note is
  // about, with an arrow to it. a spot is a circle [x, y, r] or a box [x, y, w, h]
  const YOU_SPOT = [236, 256, 106];
  const FOE_SPOT = [566, 246, 118];
  const TOUR = [
    { title: 'Welcome to Epic Wizard Battle!', text: 'You have only one goal: defeat the evil wizard.', at: [255, 130] },
    { title: 'This is you', text: 'The blue wizard on the left.', at: [420, 140], spots: [YOU_SPOT] },
    { title: 'This is the enemy', text: 'The evil red wizard on the right.', at: [96, 140], spots: [FOE_SPOT] },
    { title: 'Health', text: 'You both have a health meter. Get the enemy\'s to 0 before they do the same to yours.', at: [255, 180], spots: [[108, 56, 168, 66], [524, 56, 168, 66]] },
    { title: 'Three main options', text: 'Each scene you pick Attack, Defend or Heal. The enemy picks at the same time, then both moves play out.', at: [300, 150], spots: [[8, 436, 254, 148]] },
    { title: 'Attacks', text: 'They go from weak to strong. Weak attacks do less damage, strong attacks are less likely to land. If you miss, nothing happens.', at: [255, 110], spots: [[256, 436, 288, 148]], demo: { type: 'Attack' } },
    { title: 'Elements', text: 'An attack can have an element too. If yours beats the enemy\'s it does double damage, if it loses it does half. Neutral always does normal damage.', at: [190, 104], spots: [[540, 436, 254, 152]], demo: { type: 'Attack', tier: 1 } },
    { title: 'Defend', text: 'Cuts the damage you take this scene by a percentage, if it works.', at: [255, 150], spots: [[256, 436, 288, 148]], demo: { type: 'Defend' } },
    { title: 'Heal', text: 'Gives you health back. But a heal that works makes your next move less likely to land, and the bigger the heal, the bigger the penalty.', at: [255, 110], spots: [[256, 436, 288, 148]], demo: { type: 'Heal' } },
    { title: 'Berserk Strike', text: 'If your health drops below 15% you get a desperate move. It does huge damage but it\'s hard to land, and a miss hurts you. It\'s optional.', at: [255, 196], spots: [[286, 50, 228, 102]], demo: { berserk: true } },
    { title: 'Beware', text: 'The evil wizard is stronger and more experienced than you, with 200 health. Can you defeat him?', at: [96, 150], spots: [FOE_SPOT] },
  ];
  const f1 = (n) => n.toFixed(1);
  // the path of a spot, to cut out of the veil
  function spotPath(s, grow = 0) {
    if (s.length === 3) {
      const [x, y] = s;
      const r = s[2] + grow;
      return `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;
    }
    const [x, y, w, h] = [s[0] - grow, s[1] - grow, s[2] + grow * 2, s[3] + grow * 2];
    const r = 16 + grow;
    return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${2 * r - w}a${r} ${r} 0 0 1 ${-r} ${-r}v${2 * r - h}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
  }
  const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // where an arrow from the note box lands on a spot: just outside its edge, on the side facing the note
  function spotEdge(s, box) {
    const cx = s.length === 3 ? s[0] : s[0] + s[2] / 2;
    const cy = s.length === 3 ? s[1] : s[1] + s[3] / 2;
    const nx = clampTo(cx, box.x, box.x + box.w);
    const ny = clampTo(cy, box.y, box.y + box.h);
    if (s.length === 3) {
      const len = Math.hypot(nx - cx, ny - cy) || 1;
      return { x: cx + ((nx - cx) / len) * (s[2] + 10), y: cy + ((ny - cy) / len) * (s[2] + 10) };
    }
    return { x: clampTo(nx, s[0] - 10, s[0] + s[2] + 10), y: clampTo(ny, s[1] - 10, s[1] + s[3] + 10) };
  }
  function showTour(i) {
    tourPage = Math.max(0, Math.min(TOUR.length - 1, i));
    const page = TOUR[tourPage];
    const note = $('#duelNote');
    note.querySelector('.wb-note-title').textContent = page.title;
    note.querySelector('.wb-note-text').textContent = page.text;
    note.querySelector('.wb-note-count').textContent = `${tourPage + 1} of ${TOUR.length}`;
    note.querySelector('[data-act="prev"]').disabled = tourPage === 0;
    note.querySelector('[data-act="next"]').disabled = tourPage === TOUR.length - 1;
    note.style.left = `${page.at[0]}px`;
    note.style.top = `${page.at[1]}px`;
    renderDesk();
    // the veil with the spotlights cut out, and an arrow from the note to each one
    const spots = page.spots || [];
    const box = { x: page.at[0], y: page.at[1], w: note.offsetWidth, h: note.offsetHeight };
    let shafts = '';
    let heads = '';
    for (const spot of spots) {
      const end = spotEdge(spot, box);
      const sx = clampTo(end.x, box.x, box.x + box.w);
      const sy = clampTo(end.y, box.y, box.y + box.h);
      const dx = end.x - sx;
      const dy = end.y - sy;
      const len = Math.hypot(dx, dy) || 1;
      const start = { x: sx + (dx / len) * 8, y: sy + (dy / len) * 8 };
      // a gentle bend, always the same way
      const ctrl = { x: (start.x + end.x) / 2 - (dy / len) * len * 0.18, y: (start.y + end.y) / 2 + (dx / len) * len * 0.18 };
      const a = Math.atan2(end.y - ctrl.y, end.x - ctrl.x);
      // the line stops inside the head so its round end doesn't poke out of the point
      const lx = end.x - Math.cos(a) * 9;
      const ly = end.y - Math.sin(a) * 9;
      shafts += `M${f1(start.x)} ${f1(start.y)}Q${f1(ctrl.x)} ${f1(ctrl.y)} ${f1(lx)} ${f1(ly)}`;
      const hx = (b) => f1(end.x - Math.cos(a + b) * 16);
      const hy = (b) => f1(end.y - Math.sin(a + b) * 16);
      heads += `M${f1(end.x)} ${f1(end.y)}L${hx(0.45)} ${hy(0.45)}L${hx(-0.45)} ${hy(-0.45)}Z`;
    }
    // two veils, the outer one with bigger holes, so the light has a soft stepped edge like a real spotlight
    $('.wb-tour-veil').setAttribute('d', spots.length ? `M0 0H800V600H0Z${spots.map((p) => spotPath(p)).join('')}` : '');
    $('.wb-tour-veil2').setAttribute('d', spots.length ? `M0 0H800V600H0Z${spots.map((p) => spotPath(p, 14)).join('')}` : '');
    $('.wb-tour-under').setAttribute('d', shafts);
    $('.wb-tour-line').setAttribute('d', shafts);
    $('.wb-tour-heads').setAttribute('d', heads);
  }

  // ---------- the desk ----------
  const spellKeys = $$('.wb-spellkey');
  const tierCards = $$('.wb-tiercard');
  const elementKeys = $$('.wb-el');
  const penaltyNote = $('.wb-penalty');
  const hint = $('.wb-desk-hint');

  function renderDesk() {
    root.dataset.screen = screen;
    root.dataset.busy = busy ? '1' : '';
    const demo = screen === 'tour' ? TOUR[tourPage].demo || {} : null;
    const state = demo ? { type: demo.type || null, tier: demo.tier ?? null, berserk: !!demo.berserk } : choice;
    const penalty = screen === 'battle' && battle ? battle.accPenalty : 0;
    const desperate = demo ? state.berserk : screen === 'battle' && battle && battle.desperate && !busy;
    root.dataset.berserk = desperate ? '1' : '';
    $('.wb-berserk-key').setAttribute('aria-pressed', String(state.berserk));
    $('.wb-desk').inert = screen === 'tour' || busy;

    for (const key of spellKeys) key.setAttribute('aria-pressed', String(key.dataset.type === state.type));
    hint.hidden = !!state.type;
    hint.textContent = state.berserk ? 'Berserk Strike! Now pick an element' : 'Pick a move, then how strong';
    tierCards.forEach((card, i) => {
      card.hidden = !state.type;
      if (!state.type) return;
      const m = MOVES[state.type][i];
      // heals ignore the penalty (rules.js), everything else feels it
      const pen = state.type === 'Heal' ? 0 : penalty;
      const chance = Math.max(0, m.chance - pen);
      const effect = state.type === 'Attack' ? `${m.amount} damage` : state.type === 'Defend' ? `${m.amount}% defence` : `+${m.amount} health`;
      card.innerHTML = `<span class="wb-tc-name">${m.tier}</span><span class="wb-tc-effect">${effect}</span>`
        + `<span class="wb-tc-odds"><span class="wb-tc-bar"><i style="width:${chance}%"></i></span>${chance}%${pen ? `<s>${m.chance}%</s>` : ''}</span>`;
      card.setAttribute('aria-label', `${m.tier} ${state.type.toLowerCase()}, ${effect}, ${chance}% accuracy${state.type === 'Heal' ? `, then -${m.penalty}% accuracy next move` : ''}`);
      card.setAttribute('aria-pressed', String(state.type === 'Attack' && state.tier === i));
      card.dataset.tier = i;
    });
    const choosingElement = (state.type === 'Attack' && state.tier != null) || state.berserk;
    for (const key of elementKeys) key.disabled = !choosingElement;
    root.dataset.element = choosingElement ? '1' : '';
    penaltyNote.hidden = true;
  }

  function setScreen(next) {
    screen = next;
    renderDesk();
  }

  function act(name) {
    if (name === 'start') {
      if (!battle) newGame();
      sfx('curtain');
      curtainTo(1, 1200);
      setScreen('battle');
    } else if (name === 'tutorial') {
      if (!battle) newGame();
      sfx('curtain');
      curtainTo(1, 1000);
      setScreen('tour');
      showTour(0);
    } else if (name === 'prev' || name === 'next') {
      sfx('page');
      showTour(tourPage + (name === 'next' ? 1 : -1));
    } else if (name === 'back' || name === 'title') {
      if (busy) return;
      sfx('curtain');
      curtainTo(0, 900);
      choice = { type: null, tier: null, berserk: false };
      if (screen === 'end') newGame();
      setScreen('title');
    } else if (name === 'again') {
      newGame();
      sfx('curtain');
      curtainTo(1, 1200);
      setScreen('battle');
    } else if (name === 'mute') {
      if (!hasSfx) return;
      WizardSfx.mute(!WizardSfx.muted);
      $('.wb-mute').setAttribute('aria-pressed', String(!WizardSfx.muted));
      sfx('key');
    } else if (name === 'berserk') {
      if (busy) return;
      sfx('card', { rate: 0.8 });
      choice = { type: null, tier: null, berserk: true };
      renderDesk();
    }
  }

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    if (btn.dataset.act) return act(btn.dataset.act);
    if (busy || screen !== 'battle') return;
    if (btn.dataset.type) {
      sfx('key');
      if (choice.type !== btn.dataset.type) choice = { type: btn.dataset.type, tier: null, berserk: false };
      renderDesk();
    } else if (btn.classList.contains('wb-tiercard')) {
      const i = Number(btn.dataset.tier);
      if (choice.type === 'Attack') {
        sfx('card');
        choice.tier = i;
        renderDesk();
      } else {
        sfx('card');
        register(choice.type, MOVES[choice.type][i].move, 'n/a');
      }
    } else if (btn.dataset.el) {
      sfx('token');
      if (choice.berserk) register('Attack', 'Berserk Strike', btn.dataset.el);
      else register('Attack', MOVES.Attack[choice.tier].move, btn.dataset.el);
    }
  });
  // what a heal costs, shown while you're over it (the uni version's red penalty message)
  for (const type of ['pointerover', 'focusin']) {
    root.addEventListener(type, (e) => {
      const card = e.target.closest('.wb-tiercard');
      if (!card || choice.type !== 'Heal' || screen !== 'battle') return;
      penaltyNote.textContent = `Penalty: -${MOVES.Heal[card.dataset.tier].penalty}% accuracy next turn`;
      penaltyNote.hidden = false;
    });
  }
  for (const type of ['pointerout', 'focusout']) {
    root.addEventListener(type, (e) => {
      if (e.target.closest('.wb-tiercard')) penaltyNote.hidden = true;
    });
  }
  $('.wb-mute').setAttribute('aria-pressed', String(hasSfx && !WizardSfx.muted));

  // ---------- running ----------
  let running = false;
  let onScreen = true;
  let paused = false;
  let last = 0;
  function frame(ts) {
    if (!running) return;
    const dt = last ? Math.min(50, ts - last) : 16;
    last = ts;
    now += dt;
    tick(dt);
    draw();
    requestAnimationFrame(frame);
  }
  function update() {
    const go = onScreen && !paused && !document.hidden;
    if (go && !running) {
      running = true;
      last = 0;
      requestAnimationFrame(frame);
    } else if (!go) {
      running = false;
    }
  }
  new IntersectionObserver((entries) => {
    onScreen = entries[0].isIntersecting;
    update();
  }, { rootMargin: '80px' }).observe(root);
  document.addEventListener('visibilitychange', update);

  drawBackdrop();
  drawFrame();
  newGame();
  renderDesk();
  // the canvas text uses the page's fonts, so it's drawn again once they're in
  document.fonts.load('700 17px "Crimson Pro"').then(update, update);
  update();

  return {
    pause(p) { paused = p; update(); },
  };
})();
