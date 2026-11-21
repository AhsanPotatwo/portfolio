// catpi corner's page: the stage everything happens on, the tools you play with, and the bits of paper
// round it (a catpi's card, the hatch dialog, the news line).
//
// the stage is one canvas, 720 stage px tall and as wide as the screen makes it (W). each place is drawn in
// crayon once into layers (sky, back, front, and each prop on its own) three times over with different
// wobbles, and the frames are flicked between a few times a second so the drawing "boils" like a hand drawn
// cartoon. the world on top (catpis, food, balls, water, sparkles) is drawn every frame, sorted by how far
// back it stands. it only runs while the stage is on screen.
//
// the catpis themselves live in catpis.js; this hands them the world (w below) every frame: where they can
// walk, the food and balls, what to do when they splash, and how to make a sound or post the news.
(() => {
  const C = Crayon;
  const H = 720;
  const $ = (s) => document.querySelector(s);
  const stage = $('#ccStage');
  const g = stage.getContext('2d');
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  let W = 1200, k = 1, cssW = 1, cssH = 1;
  let place = 'farm';
  let tool = 'hand', food = 'leaf';
  let night = (() => { const h = new Date().getHours(); return h >= 20 || h < 7; })();
  let catpis = [];
  const foods = [], balls = [], bits = [], drops = [], puddles = [];
  const pointer = { x: 0, y: 0, inside: false, down: false, touch: false, place, vx: 0 };
  let t = 0, visible = true, ready = false;

  // ---------- the world, as the catpis see it ----------
  const w = {
    get place() { return place; },
    get catpis() { return catpis; },
    get night() { return night; },
    get watching() { return document.visibilityState === 'visible'; },
    get pointer() { return pointer.inside ? { ...pointer, place } : null; },
    foods, balls,
    ground: (id) => PLACES.byId[id].ground(W),
    water: (id) => PLACES.byId[id].water(W),
    sound(name, opts, who) { if (!who || who.place === place) Sfx.play(name, opts); },
    voice(c, about) { if (c.place === place) Sfx.say(c, about); },
    news,
    puff(kind, at) { if (at.place === place || at.place === undefined) puff(kind, at); },
    splash(c, n) { puff('splash', c); w.sound('splash', {}, c); },
    eat(f) { foods.splice(foods.indexOf(f), 1); },
    kick(ball, c) {
      const dir = Math.sign(ball.x - c.x) || c.dir;
      ball.vx = dir * rnd(260, 520);
      ball.vy = rnd(-140, 140);
      ball.vz = rnd(380, 640);
      c.sqv -= 4;
      Sfx.play('boing', { rate: rnd(0.9, 1.2) });
      if (Math.random() < 0.3) news(pick([`${c.name} headed the ball.`, `Nice one, ${c.name}.`, `${c.name} is very good at this.`]));
    },
  };

  // ---------- drawing the places ----------
  // each place's layers, made for the current size. only the place on show is kept
  let layers = null;
  const FRAMES = 3;
  // room round each prop's picture
  const PAD = 50;
  // with reduced motion the drawing holds still (the catpis still move, they're the point)
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  function buildLayers() {
    const P = PLACES.byId[place];
    const made = { id: place, W, k, sky: null, frames: [], props: P.props(W) };
    layers = made;
    PLACES.useFrame(0, k);
    C.wobble(0);
    const sky = C.sheet(W, H, k);
    P.sky(sky.g, W);
    made.sky = sky.c;
    const one = (f) => {
      if (layers !== made) return;
      C.wobble(f + 1);
      const back = C.sheet(W, H, k);
      P.back.call(P, back.g, W);
      C.paper(back.g, W, H, 0.6);
      const front = C.sheet(W, H, k);
      P.front.call(P, front.g, W);
      C.paper(front.g, W, H, 0.5);
      const props = made.props.map((p) => {
        const s = C.sheet(p.w + PAD * 2, p.h + PAD * 2, k);
        s.g.translate(p.ax + PAD, p.ay + PAD);
        p.draw(s.g);
        C.paper(s.g, p.w + PAD * 2, p.h + PAD * 2, 0.5);
        return s.c;
      });
      made.frames[f] = { back: back.c, front: front.c, props };
    };
    one(0);
    // the other two wobbles a moment later, so switching place is quick
    setTimeout(() => one(1), 60);
    setTimeout(() => one(2), 140);
  }

  function size() {
    const r = stage.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const oldW = W;
    cssW = r.width; cssH = r.height;
    W = Math.round((H * cssW) / cssH);
    Catpis.fit(W);
    k = (cssH / H) * dpr;
    stage.width = Math.round(cssW * dpr);
    stage.height = Math.round(cssH * dpr);
    // everyone keeps their place across the stage
    if (oldW !== W) for (const thing of [...catpis, ...foods, ...balls]) thing.x *= W / oldW;
    layers = null;
  }

  // ---------- little pictures: food, balls, bubbles' icons, the cursor ----------
  const pics = {};
  function pic(name, s = 40) {
    if (pics[name]) return pics[name];
    const { c, g: p } = C.sheet(s * 2, s * 2, 2);
    p.translate(s, s);
    p.scale(s / 40, s / 40);
    C.wobble(name.length * 13);
    Art.icon(p, name);
    C.paper(p, 80, 80, 0.3);
    return (pics[name] = c);
  }
  const FOOD_FOR = { leaf: 'leaf', berry: 'berry', fish: 'fish', cake: 'cake' };

  // ---------- particles ----------
  function puff(kind, at) {
    const x = at.x, top = at.y - (at.z || 0) - (at.art ? Catpis.scaleOf(at, w.ground(at.place)) * Catpis.ART.h : 20);
    const add = (o) => bits.push({ place, life: 1, age: 0, rot: rnd(-0.4, 0.4), ...o });
    if (kind === 'heart') add({ kind, x: x + rnd(-30, 30), y: top + 10, vx: rnd(-20, 20), vy: -60, life: 1.4, s: rnd(14, 20) });
    if (kind === 'z') add({ kind, x: x + (at.dir > 0 ? 50 : -50), y: top + 20, vx: at.dir > 0 ? 18 : -18, vy: -26, life: 2.4, s: rnd(20, 28) });
    if (kind === 'crumb') for (let i = 0; i < 4; i++) add({ kind, x: x + rnd(-14, 14), y: at.y - 10, vx: rnd(-80, 80), vy: rnd(-160, -60), g: 500, floor: at.y, life: 0.8, s: rnd(3, 5), c: pick(['#c98d5a', '#8fd660', '#f2554f', '#ffe3a8']) });
    if (kind === 'drop') add({ kind, x: x + rnd(-60, 60), y: top + rnd(10, 60), vx: rnd(-200, 200), vy: rnd(-200, -60), g: 900, life: 0.6, s: rnd(4, 7) });
    if (kind === 'splash') for (let i = 0; i < 12; i++) add({ kind: 'drop', x: x + rnd(-40, 40), y: at.y - 6, vx: rnd(-220, 220), vy: rnd(-420, -160), g: 1300, life: 0.7, s: rnd(4, 8) });
    if (kind === 'bubble') add({ kind, x: x + rnd(-50, 50), y: top + rnd(0, 60), vx: rnd(-20, 20), vy: rnd(-50, -25), life: rnd(2, 4), s: rnd(6, 14) });
    if (kind === 'sparkle') for (let i = 0; i < 8; i++) add({ kind, x: x + rnd(-70, 70), y: top + rnd(0, 80), vx: 0, vy: -20, life: rnd(0.8, 1.4), s: rnd(8, 14) });
    if (kind === 'stars') add({ kind, follow: at, x, y: top, life: 1.6, s: 10 });
    if (kind === 'hay') for (let i = 0; i < 14; i++) add({ kind, x: x + rnd(-20, 20), y: at.y, vx: rnd(-160, 160), vy: rnd(-260, -60), g: 280, life: rnd(1.2, 2), s: rnd(8, 14), c: pick(['#f4d25f', '#d8ab2d']) });
    if (kind === 'confetti') for (let i = 0; i < 26; i++) add({ kind, x, y: at.y - 40, vx: rnd(-260, 260), vy: rnd(-520, -200), g: 700, life: rnd(1.2, 2), s: rnd(5, 9), c: pick(Object.values(Catpis.CRAYONS)) });
    if (kind === 'note') add({ kind, x: x + rnd(-30, 30), y: top, vx: rnd(-20, 20), vy: -50, life: 1.4, s: 16 });
  }
  function drawBits(dt) {
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.age += dt;
      if (b.age > b.life || b.place !== place) { bits.splice(i, 1); continue; }
      b.vy += (b.g || 0) * dt;
      b.x += (b.vx || 0) * dt; b.y += (b.vy || 0) * dt;
      if (b.floor && b.y > b.floor) { b.y = b.floor; b.vy *= -0.3; b.vx *= 0.6; }
      const fade = Math.min(1, (b.life - b.age) / 0.4);
      g.save();
      g.globalAlpha = fade;
      g.translate(b.x, b.y);
      g.rotate(b.rot);
      const s = b.s;
      if (b.kind === 'heart') g.drawImage(pic('heart'), -s, -s, s * 2, s * 2);
      if (b.kind === 'note') g.drawImage(pic('note'), -s, -s, s * 2, s * 2);
      if (b.kind === 'z') { g.fillStyle = '#4b5a9e'; g.font = `700 ${s}px Gaegu, sans-serif`; g.fillText('z', 0, 0); }
      if (b.kind === 'crumb' || b.kind === 'confetti' || b.kind === 'hay') { g.fillStyle = b.c; g.rotate(b.age * 6); g.fillRect(-s / 2, -s / 4, s, s / (b.kind === 'hay' ? 4 : 2)); }
      if (b.kind === 'drop') { g.fillStyle = '#5fb0ea'; g.beginPath(); g.ellipse(0, 0, s * 0.6, s, Math.atan2(b.vy, b.vx) - Math.PI / 2, 0, 7); g.fill(); }
      if (b.kind === 'bubble') { g.strokeStyle = '#7fb2cc'; g.lineWidth = 2; g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(Math.sin(b.age * 3) * 6, 0, s, 0, 7); g.fill(); g.stroke(); }
      if (b.kind === 'sparkle') { g.strokeStyle = '#f2a516'; g.lineWidth = 3; g.lineCap = 'round'; const q = s * (1 - b.age / b.life); g.beginPath(); g.moveTo(-q, 0); g.lineTo(q, 0); g.moveTo(0, -q); g.lineTo(0, q); g.stroke(); }
      if (b.kind === 'stars') {
        const c = b.follow, top = c.y - c.z - Catpis.scaleOf(c, w.ground(c.place)) * Catpis.ART.h;
        g.restore(); g.save(); g.globalAlpha = fade;
        for (let j = 0; j < 3; j++) { const a = b.age * 5 + (j * Math.PI * 2) / 3; g.drawImage(pic('star'), c.x + Math.cos(a) * 40 - 9, top + Math.sin(a) * 10 - 9, 18, 18); }
      }
      g.restore();
    }
  }

  // ---------- food, balls and water ----------
  function dropFood(x, y, kind) {
    const ground = w.ground(place);
    const gy = clamp(y + 30, ground.top, ground.bottom);
    if (foods.filter((f) => f.place === place).length >= 8) foods.splice(foods.findIndex((f) => f.place === place), 1);
    foods.push({ kind, place, x: clamp(x, ground.left, ground.right), y: gy, z: Math.max(40, gy - y), vz: 0, left: 3, taken: null });
  }
  function newBall(x, y) {
    const ground = w.ground(place);
    const mine = balls.filter((b) => b.place === place);
    if (mine.length >= 3) balls.splice(balls.indexOf(mine[0]), 1);
    const gy = clamp(y + 40, ground.top, ground.bottom);
    const b = { place, x: clamp(x, ground.left, ground.right), y: gy, z: Math.max(30, gy - y), vx: 0, vy: 0, vz: 0, spin: 0, held: true };
    balls.push(b);
    return b;
  }
  function physics(dt) {
    for (const f of foods) {
      if (f.z > 0 || f.vz > 0) {
        f.vz -= 1600 * dt; f.z += f.vz * dt;
        if (f.z <= 0) { f.z = 0; if (f.vz < -200) { f.vz *= -0.3; if (f.place === place) Sfx.play('plop', { rate: rnd(0.9, 1.2) }); } else f.vz = 0; }
      }
    }
    for (const b of balls) {
      if (b.held) continue;
      const ground = w.ground(b.place);
      b.vz -= 1500 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.spin += (b.vx * dt) / 22;
      if (b.z <= 0) {
        b.z = 0;
        if (b.vz < -120) { if (b.place === place) Sfx.play('boing', { volume: Math.min(1, -b.vz / 700), rate: rnd(0.95, 1.1) }); b.vz *= -0.62; b.squash = 1; }
        else b.vz = 0;
        b.vx *= Math.pow(0.35, dt); b.vy *= Math.pow(0.35, dt);
      }
      if (b.x < ground.left || b.x > ground.right) { b.x = clamp(b.x, ground.left, ground.right); b.vx *= -0.7; }
      if (b.y < ground.top || b.y > ground.bottom) { b.y = clamp(b.y, ground.top, ground.bottom); b.vy *= -0.7; }
      b.squash = Math.max(0, (b.squash || 0) - dt * 5);
    }
    // the watering can's drops: they hit a catpi on the way down, or the ground
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.vy += 1400 * dt; d.y += d.vy * dt; d.x += d.vx * dt;
      const hit = catpis.find((c) => c.place === place && !c.held && inside(c, d.x, d.y) && Math.abs(c.y - d.floor) < 60);
      if (hit) { Catpis.splash(hit, w, { x: d.x, y: d.floor }); drops.splice(i, 1); continue; }
      if (d.y >= d.floor) {
        drops.splice(i, 1);
        if (Math.random() < 0.3) bits.push({ place, kind: 'drop', x: d.x, y: d.y, vx: rnd(-90, 90), vy: rnd(-160, -60), g: 900, life: 0.4, age: 0, s: 3, rot: 0 });
        const near = puddles.find((p) => p.place === place && Math.hypot(p.x - d.x, (p.y - d.floor) * 2) < p.r);
        if (near) { near.r = Math.min(110, near.r + 0.25); near.life = 1; } else if (puddles.length < 30) puddles.push({ place, x: d.x, y: d.floor, r: 14, life: 1 });
      }
    }
    for (let i = puddles.length - 1; i >= 0; i--) if ((puddles[i].life -= dt / 30) <= 0) puddles.splice(i, 1);
  }
  const inside = (c, x, y) => { const b = Catpis.bounds(c, w.ground(c.place)); return x > b.x + b.w * 0.06 && x < b.x + b.w * 0.94 && y > b.y + b.h * 0.08 && y < b.y + b.h; };
  function pour(x, y, spray = false) {
    const ground = w.ground(place);
    const spout = spray ? { x, y } : { x: x + 34, y: y - 18 };
    for (let i = 0; i < 2; i++) drops.push({ x: spout.x + rnd(-8, 8), y: spout.y, vx: spray ? rnd(-260, 260) : rnd(10, 60), vy: spray ? rnd(-700, -380) : rnd(0, 80), floor: clamp(y + (spray ? rnd(-30, 160) : 120) + rnd(-10, 10), ground.top, ground.bottom) });
  }

  // ---------- drawing a frame ----------
  function frame(dt) {
    const P = PLACES.byId[place];
    if (!layers || layers.id !== place) buildLayers();
    const boil = still.matches ? 0 : Math.floor(t * 5) % FRAMES;
    const f = layers.frames[boil] || layers.frames[0];
    PLACES.useFrame(boil, k);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, stage.width, stage.height);
    const s = stage.height / H;
    g.setTransform(s, 0, 0, s, 0, 0);
    g.drawImage(layers.sky, 0, 0, W, H);
    if (night && place !== 'cafe') {
      g.fillStyle = 'rgba(28, 34, 92, .55)';
      g.fillRect(0, 0, W, 360);
      for (let i = 0; i < 40; i++) { const x = (i * 197.3) % W, y = (i * 61.7) % 260; g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + i); g.fillStyle = '#fff3bf'; g.fillRect(x, y, 3, 3); }
      g.globalAlpha = 1;
    }
    P.live(g, W, t, night);
    g.drawImage(f.back, 0, 0, W, H);
    if (P.over) P.over(g, W, t, night);
    // puddles the watering can left
    for (const p of puddles) if (p.place === place) { g.globalAlpha = 0.45 * Math.min(1, p.life * 3); g.fillStyle = '#7fbfe6'; g.beginPath(); g.ellipse(p.x, p.y, p.r, p.r * 0.32, 0, 0, 7); g.fill(); }
    g.globalAlpha = 1;

    // everything that stands somewhere, back to front
    const here = catpis.filter((c) => c.place === place);
    const things = [
      ...layers.props.map((p, i) => ({ y: p.y, draw: () => g.drawImage(f.props[i], p.x - p.ax - PAD, p.y - p.ay - PAD, p.w + PAD * 2, p.h + PAD * 2) })),
      ...here.map((c) => ({ y: c.y + (c.held ? 1000 : 0), draw: () => drawCatpi(c) })),
      ...foods.filter((x) => x.place === place).map((x) => ({ y: x.y, draw: () => drawFood(x) })),
      ...balls.filter((b) => b.place === place).map((b) => ({ y: b.y + (b.held ? 1000 : 0), draw: () => drawBall(b) })),
    ].sort((a, b) => a.y - b.y);
    for (const x of things) x.draw();
    for (const d of drops) { g.fillStyle = '#5fb0ea'; g.beginPath(); g.ellipse(d.x, d.y, 3, 6, 0, 0, 7); g.fill(); }
    g.drawImage(f.front, 0, 0, W, H);

    // night falls over all of it, and the lamps shine through
    if (night) {
      g.save();
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = '#7d86c4';
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'lighter';
      g.restore();
      // a warm glow round each lamp, and a cone of light down to the ground under the ones that hang
      for (const l of (P.lights ? P.lights(W) : [])) {
        g.fillStyle = 'rgba(255, 216, 128, .2)';
        if (l.floor) { g.beginPath(); g.moveTo(l.x - 14, l.y); g.lineTo(l.x + 14, l.y); g.lineTo(l.x + l.r * 1.3, l.floor); g.lineTo(l.x - l.r * 1.3, l.floor); g.closePath(); g.fill(); }
        g.fillStyle = 'rgba(255, 216, 128, .28)';
        g.beginPath(); g.arc(l.x, l.y, l.r * 0.42, 0, 7); g.fill();
      }
    }
    drawBits(dt);
    for (const c of here) if (c.bubble) drawBubble(c);
    drawCursor();
  }

  function drawCatpi(c) {
    const ground = w.ground(c.place);
    Catpis.shadow(g, c, ground);
    if (c.act.type === 'hatch') {
      // still in its cocoon, wriggling more and more
      const a = c.act.t / c.act.len;
      const s = 64 * Catpis.depth(c, ground);
      g.save();
      g.translate(c.x, c.y);
      g.rotate(Math.sin(c.act.t * (8 + a * 20)) * 0.12 * a);
      g.drawImage(pic('cocoon'), -s, -s * 2, s * 2, s * 2);
      g.restore();
      return;
    }
    Catpis.draw(g, c, ground, t);
  }
  function drawFood(f) {
    const s = 24 * (0.85 + 0.25 * (f.y - 400) / 300) * (0.5 + f.left / 6);
    g.fillStyle = 'rgba(58,48,52,.2)';
    g.beginPath(); g.ellipse(f.x, f.y, s, s * 0.25, 0, 0, 7); g.fill();
    g.drawImage(pic(FOOD_FOR[f.kind]), f.x - s, f.y - f.z - s * 1.7, s * 2, s * 2);
  }
  function drawBall(b) {
    const ground = w.ground(b.place);
    const s = 22 * (0.8 + 0.35 * (b.y - ground.top) / (ground.bottom - ground.top));
    g.fillStyle = 'rgba(58,48,52,.2)';
    g.beginPath(); g.ellipse(b.x, b.y, s * Math.max(0.4, 1 - b.z / 300), s * 0.25, 0, 0, 7); g.fill();
    g.save();
    g.translate(b.x, b.y - b.z - s);
    g.scale(1 + (b.squash || 0) * 0.25, 1 - (b.squash || 0) * 0.25);
    g.rotate(b.spin);
    g.drawImage(pic('ball'), -s, -s, s * 2, s * 2);
    g.restore();
  }
  // a speech bubble over a catpi with a little picture in it
  function drawBubble(c) {
    const b = Catpis.bounds(c, w.ground(c.place));
    const pop = Math.min(1, (1.6 - c.bubble.t) * 8) * Math.min(1, c.bubble.t * 4);
    const x = c.x + (c.turn > 0 ? 1 : -1) * b.w * 0.18, y = b.y - 26;
    g.save();
    g.translate(x, y);
    g.scale(pop, pop);
    g.fillStyle = '#fffdf6';
    g.strokeStyle = PLACES.INK;
    g.lineWidth = 2.5;
    g.beginPath();
    g.ellipse(0, -8, 30, 26, 0, 0, 7);
    g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-8, 15); g.lineTo(-14 * (c.turn > 0 ? -1 : 1), 30); g.lineTo(6, 16); g.fill(); g.stroke();
    g.fillStyle = '#fffdf6'; g.fillRect(-9, 10, 16, 6);
    g.drawImage(pic(c.bubble.icon), -18, -26, 36, 36);
    g.restore();
  }
  const CURSOR = { hand: 'hand', food: null, water: 'can', soap: 'soap', ball: 'ball' };
  function drawCursor() {
    if (!pointer.inside || pointer.touch) return;
    const name = CURSOR[tool] || FOOD_FOR[food];
    const s = 22;
    g.save();
    g.translate(pointer.x, pointer.y);
    if (tool === 'water') g.rotate(pointer.down ? 0.55 : 0.1);
    if (tool === 'hand') g.rotate(Math.sin(t * 12) * (petting > 0 ? 0.2 : 0));
    g.drawImage(pic(name), -s, -s, s * 2, s * 2);
    g.restore();
  }

  // ---------- your pointer ----------
  let press = null, petting = 0;
  const lastPet = new Map();
  function at(e) {
    const r = stage.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  const catpiAt = (x, y) => catpis.filter((c) => c.place === place && c.act.type !== 'hatch' && inside(c, x, y)).sort((a, b) => b.y - a.y)[0];
  const ballAt = (x, y) => balls.find((b) => b.place === place && Math.hypot(b.x - x, b.y - b.z - 22 - y) < 34);
  const spotAt = (x, y) => PLACES.byId[place].spots(W).find((s) => Math.hypot(s.x - x, s.y - y) < s.r);

  stage.addEventListener('pointerdown', (e) => {
    if (!ready) return;
    stage.setPointerCapture(e.pointerId);
    const p = at(e);
    Object.assign(pointer, p, { down: true, inside: true, touch: e.pointerType === 'touch' });
    press = { ...p, at: performance.now(), moved: false, catpi: null, ball: null };
    if (tool === 'hand') {
      press.ball = ballAt(p.x, p.y);
      press.catpi = press.ball ? null : catpiAt(p.x, p.y);
      if (press.ball) press.ball.held = true;
    } else if (tool === 'food') {
      dropFood(p.x, p.y, food);
      Sfx.play('tap', { rate: rnd(0.9, 1.1) });
    } else if (tool === 'ball') {
      press.ball = newBall(p.x, p.y);
    } else if (tool === 'water') {
      Sfx.hold('pour', true);
    }
  });
  stage.addEventListener('pointermove', (e) => {
    const p = at(e);
    pointer.vx = (p.x - pointer.x) / Math.max(1, e.timeStamp - (pointer.ts || e.timeStamp - 16)) * 1000;
    pointer.ts = e.timeStamp;
    const dx = p.x - pointer.x, dy = p.y - pointer.y;
    Object.assign(pointer, p, { inside: true, touch: e.pointerType === 'touch' });
    if (!ready) return;
    if (press && !press.moved && Math.hypot(p.x - press.x, p.y - press.y) > 8) {
      press.moved = true;
      if (press.catpi && tool === 'hand') { Catpis.grab(press.catpi, w); news(`You picked up ${press.catpi.name}.`, true); }
    }
    if (tool === 'hand' && press && press.moved && press.catpi) carry(press.catpi, p);
    if (press && press.ball) carryBall(press.ball, p);
    // stroking over a catpi pets it (with a mouse, no need to press)
    if (tool === 'hand' && (!press || !press.catpi && !press.ball) && Math.hypot(dx, dy) > 1.5) {
      const c = catpiAt(p.x, p.y);
      if (c) {
        const was = lastPet.get(c) || 0;
        lastPet.set(c, was + Math.hypot(dx, dy));
        if (was > 50) { Catpis.pet(c, w); petting = 0.5; }
      }
    }
    if (tool === 'soap' && press) {
      const c = catpiAt(p.x, p.y);
      if (c && Math.hypot(dx, dy) > 2) { Catpis.scrub(c, w, p.x, p.y); if (Math.random() < 0.3) puff('bubble', c); }
    }
  });
  const up = (e) => {
    if (!press) return;
    const p = at(e);
    Sfx.hold('pour', false);
    if (tool === 'hand') {
      if (press.catpi && press.moved) { Catpis.drop(press.catpi, w); }
      else if (press.catpi) { Catpis.boop(press.catpi, w); showCard(press.catpi); }
      else if (press.ball) throwBall(press.ball, press.moved);
      else { const spot = spotAt(p.x, p.y); if (spot) poke(spot); }
    }
    if (tool === 'ball' && press.ball) throwBall(press.ball, press.moved);
    press = null;
    pointer.down = false;
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('pointerleave', () => { pointer.inside = false; });

  function carry(c, p) {
    const ground = w.ground(place);
    const lift = 40;
    c.x += (clamp(p.x, ground.left - 40, ground.right + 40) - c.x) * 0.5;
    c.y = clamp(p.y + 60, ground.top, ground.bottom);
    const box = Catpis.bounds({ ...c, z: 0 }, ground);
    c.z = Math.max(0, c.y - (p.y + box.h * 0.35)) + lift;
    const screen = clamp(pointer.vx / 2500, -0.45, 0.45);
    c.leanTo = screen * (c.turn > 0 ? 1 : -1);
  }
  function carryBall(b, p) {
    const ground = w.ground(place);
    b.x = clamp(p.x, ground.left, ground.right);
    b.y = clamp(p.y + 40, ground.top, ground.bottom);
    b.z = Math.max(10, b.y - p.y - 22);
  }
  function throwBall(b, moved) {
    b.held = false;
    b.vx = moved ? clamp(pointer.vx, -900, 900) : 0;
    b.vy = moved ? rnd(-60, 60) : 0;
    b.vz = moved ? 260 : 0;
    Sfx.play('tap');
  }

  // things to find by clicking the scenery
  function poke(spot) {
    if (spot.name === 'sun' || spot.name === 'clock') { setNight(!night); return; }
    if (spot.name === 'windmill') { PLACES.byId.farm.spin = 0.35; Sfx.play('whoosh'); news('Whee. The windmill is going very fast now.', true); }
    if (spot.name === 'barn') { puff('hay', { x: spot.x, y: spot.y, place }); Sfx.play('whoosh', { rate: 1.6 }); news('Hay everywhere. Someone was napping up there.', true); }
    if (spot.name === 'bell') {
      Sfx.play('bell');
      news('Ding! Order up.', true);
      for (const c of catpis.filter((c) => c.place === 'cafe' && !Catpis.busy(c))) {
        const ground = w.ground('cafe');
        Catpis.walkTo(c, ground.left + rnd(20, 160), clamp(c.y, ground.top, ground.top + 120), null, true);
        setTimeout(() => Catpis.say(c, w, pick(['cake', 'fish', 'heart', 'leaf'])), rnd(200, 900));
      }
    }
    if (spot.name === 'hydrant') {
      Sfx.play('splash', { rate: 0.8 });
      Sfx.hold('pour', true);
      news('Whoosh! The hydrant is spraying everywhere.', true);
      let n = 0;
      const id = setInterval(() => { pour(spot.x, spot.y - 50, true); if (++n > 60) { clearInterval(id); Sfx.hold('pour', false); } }, 40);
    }
  }

  // ---------- night and day ----------
  function setNight(on) {
    night = on;
    Sfx.play(on ? 'chime' : 'tap', { rate: on ? 0.75 : 1.3 });
    $('#ccSky').setAttribute('aria-pressed', on);
    $('#ccSky').title = on ? 'Make it day' : 'Make it night';
    document.documentElement.classList.toggle('cc-night', on);
    news(on ? 'Night time. Shh, some of them are sleepy.' : 'Good morning, everyone.', true);
  }

  // ---------- the news line ----------
  let lastNews = 0;
  const newsList = $('#ccNews');
  // the catpis' own news waits its turn; anything you did always shows
  function news(text, yours = false) {
    const now = performance.now();
    if (!yours && now - lastNews < 2200) return;
    lastNews = now;
    const li = document.createElement('li');
    li.textContent = text;
    newsList.prepend(li);
    while (newsList.children.length > 3) newsList.lastElementChild.remove();
  }

  // ---------- places ----------
  const tabs = [...document.querySelectorAll('.cc-tabs .cc-tab')];
  function go(id) {
    if (id === place) return;
    place = id;
    pointer.place = id;
    layers = null;
    for (const tab of tabs) tab.setAttribute('aria-selected', tab.dataset.place === id);
    Sfx.play('swish');
    Sfx.hold('purr', false);
    stage.classList.remove('is-turning');
    void stage.offsetWidth;
    stage.classList.add('is-turning');
    hideCard();
    stage.setAttribute('aria-label', `${PLACES.byId[id].name}. ${countIn(id)}`);
  }
  for (const tab of tabs) tab.addEventListener('click', () => go(tab.dataset.place));
  const countIn = (id) => { const n = catpis.filter((c) => c.place === id).length; return n === 1 ? '1 catpi here' : `${n} catpis here`; };
  function counts() {
    for (const tab of tabs) {
      const here = catpis.filter((c) => c.place === tab.dataset.place);
      tab.querySelector('.cc-tab-count').textContent = here.length;
      tab.title = here.length ? here.map((c) => c.name).join(', ') : 'Nobody here right now';
    }
  }

  // ---------- tools ----------
  const toolButtons = [...document.querySelectorAll('.cc-tool')];
  function setTool(name) {
    tool = name;
    for (const b of toolButtons) b.setAttribute('aria-pressed', b.dataset.tool === name);
    $('#ccFoods').hidden = name !== 'food';
    stage.dataset.tool = name;
    Sfx.play('tap', { rate: 1.2 });
  }
  for (const b of toolButtons) b.addEventListener('click', () => setTool(b.dataset.tool));
  const TOOL_PIC = { hand: 'hand', water: 'can', soap: 'soap', ball: 'ball' };
  function toolPics() {
    for (const b of toolButtons) b.querySelector('img').src = pic(b.dataset.tool === 'food' ? FOOD_FOR[food] : TOOL_PIC[b.dataset.tool]).toDataURL();
    for (const b of document.querySelectorAll('.cc-food')) b.querySelector('img').src = pic(FOOD_FOR[b.dataset.food]).toDataURL();
  }
  for (const b of document.querySelectorAll('.cc-food')) b.addEventListener('click', () => {
    food = b.dataset.food;
    for (const o of document.querySelectorAll('.cc-food')) o.setAttribute('aria-pressed', o === b);
    toolPics();
    Sfx.play('tap', { rate: 1.4 });
  });
  $('#ccSky').addEventListener('click', () => setNight(!night));
  // lights off: dark paper round the stage (the head of the page sets it before drawing, this keeps it)
  const lights = $('#ccLights');
  const showLights = () => {
    const dark = document.documentElement.dataset.ccTheme === 'dark';
    lights.setAttribute('aria-pressed', dark);
    lights.querySelector('span').textContent = dark ? 'Lights on' : 'Lights off';
  };
  lights.addEventListener('click', () => {
    const dark = document.documentElement.dataset.ccTheme !== 'dark';
    document.documentElement.dataset.ccTheme = dark ? 'dark' : 'light';
    try { localStorage.setItem('catpiCornerTheme', dark ? 'dark' : 'light'); } catch { }
    showLights();
    Sfx.play('tap', { rate: dark ? 0.8 : 1.2 });
  });
  showLights();
  const soundKey = $('#ccSound');
  soundKey.setAttribute('aria-pressed', !Sfx.muted);
  soundKey.addEventListener('click', () => { Sfx.mute(!Sfx.muted); soundKey.setAttribute('aria-pressed', !Sfx.muted); if (!Sfx.muted) Sfx.play('chime'); });
  // number keys pick tools
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, dialog')) return;
    const keys = { 1: 'hand', 2: 'food', 3: 'water', 4: 'soap', 5: 'ball' };
    if (keys[e.key]) setTool(keys[e.key]);
  });

  // ---------- a catpi's card ----------
  const card = $('#ccCard');
  let carded = null;
  const cardPic = $('#ccCardPic').getContext('2d');
  function showCard(c) {
    carded = c;
    card.hidden = false;
    // on the other side of the stage from them, so it never covers who you clicked
    card.classList.toggle('is-right', c.x < W * 0.5);
    $('#ccCardName').textContent = c.name;
    $('#ccCardTrait').textContent = Catpis.TRAITS[c.trait];
    $('#ccCardLikes').textContent = `Loves ${plural(c.likes)}` + (c.dislikes ? `. Not keen on ${plural(c.dislikes)}.` : '. Eats anything.');
    refreshCard();
  }
  const plural = (f) => ({ leaf: 'leaves', berry: 'berries', fish: 'fish', cake: 'cake' })[f];
  function hideCard() { card.hidden = true; carded = null; }
  function refreshCard() {
    if (!carded) return;
    $('#ccCardDoing').textContent = Catpis.doing(carded);
    for (const k of ['tummy', 'joy', 'clean', 'energy']) card.querySelector(`[data-bar="${k}"]`).style.setProperty('--v', Math.round(carded[k]) + '%');
  }
  $('#ccCardClose').addEventListener('click', hideCard);
  $('#ccCardEdit').addEventListener('click', () => openHatch(carded));

  // ---------- the hatch dialog: make a new catpi, or change one ----------
  const dialog = $('#ccHatch');
  const preview = $('#ccHatchPic').getContext('2d');
  let draft = null, editing = null;
  const tap = () => Sfx.play('tap', { rate: rnd(1, 1.5) });
  // which choices live on the look (painted into the picture) rather than on the catpi
  const LOOK = ['body', 'accent', 'dot', 'pattern', 'eyes', 'mouth', 'cheeks', 'whiskers', 'lines'];
  const choose = (key, value) => { if (LOOK.includes(key)) draft.look[key] = value; else draft[key] = value; redraft(); tap(); };
  const chosen = (key) => (LOOK.includes(key) ? draft.look[key] : draft[key]);
  // a row of crayons, then one more you mix yourself with the colour picker
  function crayonRow(el, key) {
    el.innerHTML = '';
    for (const [name, colour] of Object.entries(Catpis.CRAYONS)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cc-crayon';
      b.style.setProperty('--c', colour);
      b.title = name[0].toUpperCase() + name.slice(1);
      b.setAttribute('aria-label', b.title);
      b.dataset.value = name;
      b.addEventListener('click', () => choose(key, name));
      el.append(b);
    }
    const mix = document.createElement('button');
    mix.type = 'button';
    mix.className = 'cc-crayon cc-crayon-mix';
    mix.title = 'Mix your own';
    mix.setAttribute('aria-label', 'Mix your own colour');
    mix.setAttribute('aria-expanded', false);
    el.append(mix);
    el.after(mixer(key, mix));
  }

  // the mixing palette under a crayon row: a pad for how light and how strong, a rainbow slider for which
  // colour, and the colour's code for anyone who knows the one they want
  const hsv2hex = (h, s, v) => '#' + [5, 3, 1].map((n) => { const k = (n + h / 60) % 6; return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)))).toString(16).padStart(2, '0'); }).join('');
  function hex2hsv(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    const h = !d ? 0 : max === r ? 60 * (((g - b) / d + 6) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    return [h, max ? d / max : 0, max];
  }
  // painting the catpi takes a while, so a drag repaints at most once a frame
  let queued = false;
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; redraft(); }); } };
  function mixer(key, mix) {
    const box = document.createElement('div');
    box.className = 'cc-mixer';
    box.hidden = true;
    box.innerHTML = `<div class="cc-mixer-pad" tabindex="0" role="slider" aria-label="How light and how strong"><i></i></div>
      <div class="cc-mixer-side">
        <input class="cc-range cc-range-hue" type="range" min="0" max="359" aria-label="Which colour">
        <label class="cc-mixer-code"><span class="cc-mixer-swatch"></span><input type="text" maxlength="7" spellcheck="false" aria-label="Colour code"></label>
        <button class="cc-small" type="button">Done</button>
      </div>`;
    const pad = box.querySelector('.cc-mixer-pad'), hue = box.querySelector('.cc-range-hue'), code = box.querySelector('input[type=text]');
    let h = 0, s = 0, v = 0;
    const show = (typed) => {
      const hex = hsv2hex(h, s, v);
      box.style.setProperty('--h', h);
      box.style.setProperty('--c', hex);
      pad.firstChild.style.cssText = `left:${s * 100}%; top:${(1 - v) * 100}%`;
      pad.setAttribute('aria-valuetext', `${Math.round(s * 100)}% strong, ${Math.round(v * 100)}% light`);
      hue.value = h;
      if (!typed) code.value = hex;
      return hex;
    };
    const set = (typed) => { draft.look[key] = show(typed); later(); };
    box.open = () => {
      for (const other of document.querySelectorAll('.cc-mixer')) if (other !== box) other.close();
      const now = draft.look[key];
      [h, s, v] = hex2hsv(now?.[0] === '#' ? now : Catpis.CRAYONS[now] || '#a8ec44');
      box.hidden = false;
      mix.setAttribute('aria-expanded', true);
      set();
      box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    box.close = () => { box.hidden = true; mix.setAttribute('aria-expanded', false); };
    mix.addEventListener('click', () => { if (box.hidden) box.open(); else box.close(); tap(); });
    const drag = (e) => {
      const r = pad.getBoundingClientRect();
      s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      set();
    };
    pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); drag(e); });
    pad.addEventListener('pointermove', (e) => { if (pad.hasPointerCapture(e.pointerId)) drag(e); });
    pad.addEventListener('pointerup', tap);
    pad.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: [-0.05, 0], ArrowRight: [0.05, 0], ArrowUp: [0, 0.05], ArrowDown: [0, -0.05] }[e.key];
      if (!step) return;
      e.preventDefault();
      s = Math.min(1, Math.max(0, s + step[0]));
      v = Math.min(1, Math.max(0, v + step[1]));
      set();
    });
    hue.addEventListener('input', () => { h = +hue.value; set(); });
    code.addEventListener('input', () => {
      const typed = code.value.trim().replace(/^#?/, '#');
      if (/^#[0-9a-f]{6}$/i.test(typed)) { [h, s, v] = hex2hsv(typed.toLowerCase()); set(true); }
    });
    box.querySelector('.cc-small').addEventListener('click', () => { box.close(); mix.focus(); });
    return box;
  }
  function chipRow(el, list, key, words = (x) => x) {
    el.innerHTML = '';
    for (const value of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cc-chip';
      b.textContent = words(value);
      b.dataset.value = value;
      b.addEventListener('click', () => choose(key, value));
      el.append(b);
    }
  }
  // the pencils show their colour on a little dot
  function pencilRow(el) {
    chipRow(el, Object.keys(Catpis.PENCILS), 'lines');
    for (const b of el.children) b.style.setProperty('--dot', Catpis.PENCILS[b.dataset.value]);
    el.classList.add('cc-pencils');
  }
  const ROWS = {
    '#ccBody': 'body', '#ccAccent': 'accent', '#ccDot': 'dot',
    '#ccPattern': 'pattern', '#ccEyes': 'eyes', '#ccMouth': 'mouth', '#ccCheeks': 'cheeks', '#ccWhiskers': 'whiskers', '#ccLines': 'lines',
    '#ccHat': 'hat', '#ccFace': 'face', '#ccBack': 'back', '#ccTrait': 'trait', '#ccLikes': 'likes',
  };
  crayonRow($('#ccBody'), 'body');
  crayonRow($('#ccAccent'), 'accent');
  crayonRow($('#ccDot'), 'dot');
  chipRow($('#ccPattern'), Catpis.PATTERNS, 'pattern');
  chipRow($('#ccEyes'), Catpis.EYES, 'eyes');
  chipRow($('#ccMouth'), Catpis.MOUTHS, 'mouth');
  chipRow($('#ccCheeks'), Catpis.CHEEKS, 'cheeks', (x) => (x === 'none' ? 'plain' : x));
  chipRow($('#ccWhiskers'), Catpis.WHISKERS, 'whiskers', (x) => (x === 'none' ? 'no whiskers' : x));
  pencilRow($('#ccLines'));
  chipRow($('#ccHat'), Catpis.HATS, 'hat', (h) => (h === 'none' ? 'nothing' : h));
  chipRow($('#ccFace'), Catpis.FACES, 'face', (h) => (h === 'none' ? 'nothing' : h));
  chipRow($('#ccBack'), Catpis.BACKS, 'back', (h) => (h === 'none' ? 'nothing' : h));
  chipRow($('#ccTrait'), Object.keys(Catpis.TRAITS), 'trait');
  chipRow($('#ccLikes'), Catpis.FOODS, 'likes', plural);

  // the dialogs' pages (hatching and leaving a note): one tab each, arrow keys move along them like the
  // browser's own tabs, and closing goes back to the first page. on a phone the tabs don't all fit: they slide
  // sideways, and fade at the edge while there are more
  for (const strip of document.querySelectorAll('.cc-hatch-tabs')) {
    const pageTabs = [...strip.children], box = strip.closest('dialog'), main = box.querySelector('.cc-hatch-main');
    const more = () => strip.classList.toggle('is-more', pageTabs.at(-1).getBoundingClientRect().right > strip.getBoundingClientRect().right + 1);
    const turnTo = (tab) => {
      for (const t of pageTabs) {
        const on = t === tab;
        t.setAttribute('aria-selected', on);
        t.tabIndex = on ? 0 : -1;
        $('#' + t.getAttribute('aria-controls')).hidden = !on;
      }
      main.scrollTop = 0;
      tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      more();
    };
    pageTabs.forEach((tab, i) => {
      tab.addEventListener('click', () => { turnTo(tab); tap(); });
      tab.addEventListener('keydown', (e) => {
        const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
        if (!step) return;
        e.preventDefault();
        const next = pageTabs[(i + step + pageTabs.length) % pageTabs.length];
        turnTo(next);
        next.focus();
      });
    });
    strip.addEventListener('scroll', more, { passive: true });
    // also runs when the dialog opens, since the strip goes from no size to its size
    new ResizeObserver(more).observe(strip);
    box.addEventListener('close', () => turnTo(pageTabs[0]));
  }

  // the two sliders: how far along they are, for their crayon fill (css --p) and the size thumb's catpi (--k)
  const sliders = [$('#ccSize'), $('#ccVoice')];
  const slid = (el) => {
    const k = (el.value - el.min) / (el.max - el.min);
    el.style.setProperty('--p', `${k * 100}%`);
    el.style.setProperty('--k', k);
  };

  function openHatch(c = null) {
    editing = c;
    const look = c ? { ...c.look } : Catpis.randomLook();
    const unused = Catpis.NAMES.filter((n) => !catpis.some((o) => o.name === n));
    const more = { ...look, face: c ? c.face : pick(['none', 'none', ...Catpis.FACES]), back: c ? c.back : pick(['none', 'none', ...Catpis.BACKS]) };
    draft = Catpis.make([c ? c.name : pick(unused.length ? unused : Catpis.NAMES), look.body, look.accent, look.pattern, look.dot, c ? c.trait : pick(Object.keys(Catpis.TRAITS)), c ? c.hat : pick(Catpis.HATS), c ? c.likes : pick(Catpis.FOODS), place, c ? c.size : rnd(0.8, 1.1), more], c ? { seed: c.seed, pitch: c.pitch } : {});
    draft.dir = 1;
    $('#ccHatchName').value = draft.name;
    $('#ccSize').value = draft.size;
    $('#ccVoice').value = draft.pitch;
    sliders.forEach(slid);
    for (const m of document.querySelectorAll('.cc-mixer')) m.close();
    $('#ccHatchTitle').textContent = c ? `Change ${c.name}` : 'Hatch a catpi';
    $('#ccHatchGo').textContent = c ? 'Save' : 'Hatch';
    $('#ccBye').hidden = !c;
    redraft();
    hideCard();
    dialog.showModal();
  }
  function redraft() {
    Catpis.repaint(draft);
    for (const [id, key] of Object.entries(ROWS)) {
      const value = chosen(key);
      for (const b of $(id).children) {
        if (b.classList.contains('cc-crayon-mix')) {
          const mixed = typeof value === 'string' && value[0] === '#';
          b.setAttribute('aria-pressed', mixed);
          if (!mixed) b.parentElement.nextElementSibling.close();
          b.style.setProperty('--c', mixed ? value : 'transparent');
        } else b.setAttribute('aria-pressed', b.dataset.value === value);
      }
    }
    $('#ccDotRow').hidden = ['plain', 'rainbow'].includes(draft.look.pattern);
    $('#ccTraitSays').textContent = Catpis.TRAITS[draft.trait];
  }
  $('#ccHatchName').addEventListener('input', (e) => { draft.name = e.target.value.trim().slice(0, 20) || draft.name; });
  $('#ccDice').addEventListener('click', () => { draft.name = pick(Catpis.NAMES); $('#ccHatchName').value = draft.name; Sfx.play('tap', { rate: 1.5 }); });
  $('#ccSize').addEventListener('input', (e) => { draft.size = +e.target.value; slid(e.target); });
  $('#ccVoice').addEventListener('input', (e) => { draft.pitch = +e.target.value; slid(e.target); });
  $('#ccVoice').addEventListener('change', () => Sfx.say(draft, pick(['mew', 'trill', 'chirp'])));
  $('#ccHear').addEventListener('click', () => Sfx.say(draft, pick(['mew', 'trill', 'chirp'])));
  $('#ccSurprise').addEventListener('click', () => {
    Object.assign(draft.look, Catpis.randomLook());
    draft.hat = pick(Catpis.HATS);
    draft.face = pick(['none', 'none', ...Catpis.FACES]);
    draft.back = pick(['none', 'none', ...Catpis.BACKS]);
    redraft();
    Sfx.play('pop');
  });
  $('#ccHatchCancel').addEventListener('click', () => dialog.close());
  $('#ccBye').addEventListener('click', () => {
    if (!editing || !confirm(`Say goodbye to ${editing.name}? They'll go and live somewhere else.`)) return;
    catpis.splice(catpis.indexOf(editing), 1);
    news(`${editing.name} waved goodbye.`, true);
    dialog.close();
    store();
  });
  $('#ccHatchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#ccHatchName').value.trim().slice(0, 20) || draft.name;
    if (editing) {
      Object.assign(editing, { name, look: { ...draft.look }, hat: draft.hat, face: draft.face, back: draft.back, trait: draft.trait, likes: draft.likes, size: draft.size, pitch: draft.pitch });
      // hungry ones eat anything; anyone else keeps disliking something that isn't their favourite
      editing.dislikes = editing.trait === 'hungry' ? null : editing.dislikes && editing.dislikes !== editing.likes ? editing.dislikes : pick(Catpis.FOODS.filter((f) => f !== editing.likes));
      Catpis.repaint(editing);
      showCard(editing);
    } else {
      const c = Catpis.make([name, draft.look.body, draft.look.accent, draft.look.pattern, draft.look.dot, draft.trait, draft.hat, draft.likes, place, draft.size, { ...draft.look, face: draft.face, back: draft.back }], { pitch: draft.pitch });
      const ground = w.ground(place);
      c.x = rnd(ground.left + 80, ground.right - 80);
      c.y = rnd(ground.top + 40, ground.bottom - 30);
      Catpis.act(c, 'hatch', { len: 1.8 });
      catpis.push(c);
      setTimeout(() => {
        c.sqv = -9; c.vz = 420; c.z = 0.01; c.eyes = 'happy';
        puff('confetti', c);
        Sfx.play('hatch');
        Catpis.say(c, w, 'heart');
        news(`Say hello to ${c.name}!`, true);
        setTimeout(() => (c.eyes = 'open'), 900);
      }, 1800);
    }
    dialog.close();
    store();
  });
  $('#ccNew').addEventListener('click', () => openHatch());

  // ---------- keeping them ----------
  const KEY = 'catpiCorner';
  function store() {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, place, catpis: catpis.map(Catpis.save) })); } catch { }
  }
  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && saved.v === 1 && saved.catpis.length) { place = saved.place || 'farm'; return saved.catpis.map(Catpis.restore); }
    } catch { }
    return Catpis.starters();
  }
  $('#ccReset').addEventListener('click', () => {
    if (!confirm('Start the corner again with the first twelve catpis? Any you hatched will go.')) return;
    try { localStorage.removeItem(KEY); } catch { }
    location.reload();
  });

  // ---------- going ----------
  let last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (!visible || !ready) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    t += dt;
    petting = Math.max(0, petting - dt);
    Sfx.hold('purr', petting > 0);
    for (const [c, d] of lastPet) lastPet.set(c, Math.max(0, d - dt * 120));
    if (tool === 'water' && pointer.down && pointer.inside) pour(pointer.x, pointer.y);
    // a held press on a catpi with a finger pets it
    if (press && press.catpi && !press.moved && pointer.touch && performance.now() - press.at > 450) { Catpis.pet(press.catpi, w); petting = 0.3; }
    for (const c of catpis) Catpis.update(c, dt, w);
    physics(dt);
    if (press && press.catpi && press.moved) carry(press.catpi, pointer);
    frame(dt);
    if (carded && Math.floor(t * 4) !== Math.floor((t - dt) * 4)) refreshCard();
    if (carded) { cardPic.clearRect(0, 0, 220, 150); Catpis.portrait(cardPic, carded, 220, 150, t); }
    if (dialog.open && draft) { preview.clearRect(0, 0, 360, 240); Catpis.portrait(preview, draft, 360, 240, t); }
    // finished sounds come off squimble's list (its own update() needs the game's listener)
    if (Sound.voices.length > 40) Sound.voices = Sound.voices.filter((v) => !v.ended);
  }

  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(stage);
  new ResizeObserver(() => size()).observe(stage);
  window.addEventListener('pagehide', store);
  setInterval(() => { if (ready) { store(); counts(); } }, 4000);

  // the notice board (board.js) borrows your catpis and the news line, once the drawing's loaded
  window.CornerPage = { news, catpis: () => catpis };
  CornerPage.ready = (async () => {
    await Promise.all([document.fonts.load('700 30px Gaegu'), document.fonts.load('400 20px Gaegu'), Catpis.load()]);
    size();
    catpis = restore();
    for (const c of catpis) {
      const ground = w.ground(c.place);
      c.x = rnd(ground.left + 60, ground.right - 60);
      c.y = rnd(ground.top + 20, ground.bottom - 20);
    }
    for (const tab of tabs) tab.setAttribute('aria-selected', tab.dataset.place === place);
    document.documentElement.classList.toggle('cc-night', night);
    $('#ccSky').setAttribute('aria-pressed', night);
    counts();
    toolPics();
    ready = true;
    stage.classList.add('is-ready');
    news(night ? 'It is night in the corner. Shh.' : pick(['Everyone is out and about.', 'A lovely day in the corner.', 'The catpis are up and wiggling.']));
    requestAnimationFrame(loop);
  })();
})();
