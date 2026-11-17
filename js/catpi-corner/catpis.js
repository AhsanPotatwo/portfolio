// the catpis: how each one looks, who they are, and how they get about. half caterpillar, half cat.
//
// looks: every catpi is the same drawing (assets/catpi-corner), split once into its pencil lines
// (catpi-lines.png) and its colour regions (catpi-parts.png: red is the body, blue the ear bumps and tail).
// paint() fills the regions with the catpi's two crayons, adds its pattern and some crayon shading on the
// body only, rubs the paper through a little, and lays the lines over the top. faces and hats are drawn
// live over that (face(), hat()), so they can blink, smile, chew and wobble.
//
// moving: a catpi stands where its feet are (x, y on the ground, z off it). it hops, or crawls with a ripple
// running along its body from tail to head (the picture drawn in strips, each nudged up or down), and
// squashes and stretches on a spring as it goes (sq). it turns round by flattening like a card flipping.
//
// living: each one is always doing one thing (act), picked by want() from how it's feeling (tummy, joy,
// clean, energy, all 0 to 100), its trait, and what's around (food, balls, puddles, other catpis, you).
// page.js owns the world and hands it to update() every frame as w.
const Catpis = (() => {
  const C = Crayon;
  const ART = { w: 720, h: 435, eyes: [[146, 127, 16], [324, 125, 16]], mouth: [232, 186], cheeks: [[86, 182], [404, 176]] };
  // a grown catpi's width on the stage at the middle of the ground. smaller on a narrow stage (a phone), so
  // there's still room to run about (page.js sets it with fit())
  const FULL = 185;
  let WIDTH = FULL;
  const fit = (stageWidth) => { WIDTH = FULL * Math.max(0.62, Math.min(1, stageWidth / 1250)); };
  const GRAVITY = 1900;

  // the crayon box, in rainbow order: what catpis can be coloured with (the hatch dialog shows these names on
  // hover). any other colour works too, as a hex string, from the dialog's colour picker
  const CRAYONS = {
    cherry: '#f2625a', brick: '#b8503f', coral: '#ff8a70', tangerine: '#ffa64d', marmalade: '#e5772f',
    caramel: '#d4914e', peach: '#ffcda8', butter: '#ffe47e', lemon: '#fff27a', mustard: '#efb52d',
    olive: '#b5b04a', leaf: '#a8ec44', moss: '#7fa24a', fern: '#20b974', sage: '#b4d1a8', mint: '#c6f2c4',
    teal: '#45c9b3', ice: '#e2f5ff', sky: '#a6d8ff', puddle: '#4f8fe8', ocean: '#2f78c4', navy: '#3c4b8f',
    midnight: '#2b2d52', lilac: '#e1c8ff', grape: '#9467df', plum: '#8a3f86', candyfloss: '#f7c4f2',
    bubblegum: '#ffb6d2', raspberry: '#e45a84', cocoa: '#a77452', cream: '#fff3da', snow: '#ffffff',
    pebble: '#bcb6c6', soot: '#5f5a69', charcoal: '#403c48',
  };
  const PATTERNS = ['plain', 'spots', 'polka dots', 'speckles', 'freckles', 'stripes', 'tiger', 'patches', 'belly', 'socks', 'two-tone', 'sunset', 'rainbow', 'hearts', 'stars', 'bandit'];
  // the face, drawn over the friend's own eyes and mouth without changing them
  const EYES = ['dots', 'shiny', 'big', 'starry', 'lashes', 'sleepy'];
  const MOUTHS = ['smile', 'fang', 'fangs', 'blep'];
  const CHEEKS = ['none', 'rosy', 'hearts', 'swirls'];
  const WHISKERS = ['none', 'short', 'long'];
  // the pencil the lines are drawn in
  const PENCILS = { pencil: '#181416', cocoa: '#5a3a2a', navy: '#25305e', plum: '#55264f', forest: '#22422a', berry: '#7e2441' };
  // things to wear, one of each
  const HATS = ['none', 'bow', 'flower', 'sprout', 'antennae', 'party hat', 'crown', 'top hat', 'beanie', 'chef hat', 'halo'];
  const FACES = ['none', 'round glasses', 'sunglasses', 'heart glasses', 'monocle'];
  const BACKS = ['none', 'angel wings', 'butterfly wings', 'backpack'];
  const FOODS = ['leaf', 'berry', 'fish', 'cake'];
  const TRAITS = {
    sleepy: 'Naps anywhere. Mostly in the hay.',
    playful: 'Will chase a ball until the sun goes down.',
    hungry: 'Always thinking about the next snack.',
    cuddly: 'Loves a good pat. Then another one.',
    splashy: 'Jumps in every puddle on purpose.',
    chatty: 'Has a lot to say about leaves.',
    shy: 'Takes a little while to warm up to you.',
    bouncy: "Doesn't walk anywhere. Only hops.",
  };
  const NAMES = ['Pickle', 'Plum', 'Clementine', 'Radish', 'Mochi', 'Puddle', 'Butterbean', 'Fig', 'Pebble', 'Juniper', 'Bramble', 'Custard',
    'Noodle', 'Biscuit', 'Maple', 'Sprout', 'Turnip', 'Pudding', 'Bean', 'Crumpet', 'Kiwi', 'Pip', 'Tofu', 'Waffle', 'Nutmeg', 'Clover',
    'Pumpkin', 'Dumpling', 'Mango', 'Wiggles', 'Toffee', 'Sesame', 'Parsnip', 'Gumdrop', 'Peanut', 'Moss', 'Fennel', 'Bun', 'Olive', 'Truffle'];

  // the starting twelve, three places' worth
  const FIRST = [
    ['Pickle', 'leaf', 'fern', 'plain', null, 'chatty', 'none', 'leaf', 'farm', 1],
    ['Plum', 'lilac', 'grape', 'spots', 'grape', 'sleepy', 'none', 'berry', 'farm', 0.95, { eyes: 'sleepy', lines: 'plum' }],
    ['Clementine', 'tangerine', 'fern', 'tiger', 'marmalade', 'playful', 'none', 'fish', 'farm', 0.9, { whiskers: 'long', mouth: 'fang' }],
    ['Radish', 'cherry', 'leaf', 'socks', 'cream', 'hungry', 'none', 'cake', 'farm', 1.05, { mouth: 'blep' }],
    ['Puddle', 'sky', 'puddle', 'freckles', 'puddle', 'splashy', 'sprout', 'fish', 'farm', 0.85, { eyes: 'shiny', lines: 'navy' }],
    ['Juniper', 'teal', 'puddle', 'stripes', 'fern', 'bouncy', 'antennae', 'berry', 'farm', 0.8, { eyes: 'starry', back: 'butterfly wings' }],
    ['Mochi', 'bubblegum', 'raspberry', 'belly', 'cream', 'cuddly', 'bow', 'cake', 'cafe', 0.92, { eyes: 'lashes', cheeks: 'rosy' }],
    ['Butterbean', 'butter', 'mustard', 'patches', 'peach', 'chatty', 'flower', 'leaf', 'cafe', 1, { cheeks: 'hearts' }],
    ['Custard', 'cream', 'mustard', 'speckles', 'caramel', 'hungry', 'chef hat', 'cake', 'cafe', 1.1, { lines: 'cocoa' }],
    ['Fig', 'peach', 'cocoa', 'two-tone', 'cocoa', 'shy', 'none', 'berry', 'street', 0.9, { cheeks: 'rosy', back: 'backpack' }],
    ['Pebble', 'pebble', 'soot', 'bandit', 'soot', 'sleepy', 'none', 'fish', 'street', 1.08, { face: 'round glasses', whiskers: 'short' }],
    ['Bramble', 'soot', 'raspberry', 'stars', 'butter', 'playful', 'none', 'berry', 'street', 0.95, { eyes: 'big', mouth: 'fangs' }],
  ];

  let lines = null, parts = null, bodyMask = null;
  const loadImage = (src) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
  async function load() {
    [lines, parts] = await Promise.all([loadImage('assets/catpi-corner/catpi-lines.png'), loadImage('assets/catpi-corner/catpi-parts.png')]);
    // the body on its own, for keeping patterns and shading off the ears and tail
    const { c, g } = C.sheet(ART.w, ART.h, 1, true);
    g.drawImage(parts, 0, 0);
    const d = g.getImageData(0, 0, ART.w, ART.h);
    for (let i = 0; i < d.data.length; i += 4) if (d.data[i] < 128) d.data[i + 3] = 0;
    g.putImageData(d, 0, 0);
    bodyMask = c;
  }

  // ---------- looks ----------

  const ink = (name) => CRAYONS[name] || name;
  // a catpi's picture: { c (the canvas), eyeCover: [colour, colour] (what's round each eye, for blinking) }
  function paint(look, seed = 1) {
    const body = ink(look.body), accent = ink(look.accent), dot = ink(look.dot || look.accent);
    const { c, g } = C.sheet(ART.w, ART.h, 1, true);
    g.drawImage(parts, 0, 0);
    const d = g.getImageData(0, 0, ART.w, ART.h);
    const [br, bg, bb] = C.hex(body), [ar, ag, ab] = C.hex(accent);
    for (let i = 0; i < d.data.length; i += 4) {
      if (!d.data[i + 3]) continue;
      if (d.data[i] > 128) d.data.set([br, bg, bb], i); else d.data.set([ar, ag, ab], i);
    }
    g.putImageData(d, 0, 0);
    // the pattern and shading go on a sheet of their own, trimmed to the body
    const over = C.sheet(ART.w, ART.h), o = over.g;
    C.wobble(seed);
    const r = C.seeded(seed);
    const dab = (x, y, rx, ry = rx, colour = dot) => C.shape(o, C.blob(x, y, rx, ry, 0.12, 14), colour, { shade: C.mix(colour, '#000000', 0.12), gap: 5, alpha: 0.4, outline: false });
    const p = look.pattern;
    if (p === 'spots') for (let i = 0; i < 9; i++) dab(70 + r() * 600, 70 + r() * 300, 14 + r() * 16);
    if (p === 'patches') { dab(330, 120, 54, 46); dab(560, 150, 90, 70); dab(470, 330, 70, 50); dab(110, 330, 60, 44); }
    if (p === 'freckles') for (const [cx, cy] of [[96, 196], [396, 190], [590, 120]]) for (let i = 0; i < 6; i++) C.shape(o, C.blob(cx + (r() - 0.5) * 60, cy + (r() - 0.5) * 34, 6 + r() * 3, 6 + r() * 3, 0.1, 8), dot, { outline: false });
    if (p === 'belly') dab(380, 375, 290, 70, dot);
    if (p === 'socks') C.shape(o, [[0, 372], [720, 362], [720, 440], [0, 440]], dot, { shade: C.mix(dot, '#000000', 0.12), gap: 5, alpha: 0.4, outline: false, sharp: true });
    if (p === 'two-tone') C.shape(o, [[480, -10], [470, 120], [500, 240], [470, 330], [490, 450], [740, 450], [740, -10]], dot, { shade: C.mix(dot, '#000000', 0.1), gap: 6, alpha: 0.4, outline: false, sharp: true });
    if (p === 'stripes') {
      for (let x = 470; x < 700; x += 52) C.stroke(o, [[x, 60], [x + 14, 120], [x + 4, 170]], dot, 20, 0.9);
      for (const x of [210, 240, 270]) C.stroke(o, [[x, 34], [x + 2, 72]], dot, 12, 0.9);
    }
    if (p === 'polka dots') for (let y = 70, row = 0; y < 430; y += 58, row++) for (let x = 40 + (row % 2) * 34; x < 720; x += 68) {
      if (Math.hypot(x - 235, (y - 140) * 1.6) < 150) continue;
      C.shape(o, C.blob(x, y, 13, 13, 0.08, 10), dot, { outline: false });
    }
    if (p === 'speckles') for (let i = 0; i < 46; i++) {
      const x = r() * 720, y = 40 + r() * 390;
      if (Math.hypot(x - 235, (y - 140) * 1.6) < 140) continue;
      C.shape(o, C.blob(x, y, 5 + r() * 5, 4 + r() * 4, 0.2, 8), dot, { outline: false });
    }
    if (p === 'tiger') {
      for (let x = 430; x < 720; x += 58) {
        C.stroke(o, [[x, 50], [x + 18, 110], [x + 2, 170], [x + 16, 220]], dot, 22, 0.95);
        C.stroke(o, [[x + 10, 440], [x - 6, 380], [x + 8, 330]], dot, 18, 0.95);
      }
      for (const x of [200, 235, 270]) C.stroke(o, [[x, 30], [x + 4, 60], [x - 2, 82]], dot, 13, 0.95);
      for (const [x, d] of [[60, -1], [410, 1]]) for (const y of [196, 226]) C.stroke(o, [[x, y], [x + d * 36, y + 6]], dot, 11, 0.95);
    }
    if (p === 'sunset') {
      // fading into the pattern colour towards the tail, with crayon over it
      const fade = o.createLinearGradient(260, 0, 700, 0);
      fade.addColorStop(0, C.mix(dot, '#ffffff', 0) + '00');
      fade.addColorStop(1, dot);
      o.fillStyle = fade;
      o.fillRect(0, 0, 720, 440);
      C.scribble(o, [[420, -10], [740, -10], [740, 450], [420, 450]], C.mix(dot, '#000000', 0.12), { angle: 1.45, gap: 8, width: 6, alpha: 0.3, sharp: true });
    }
    if (p === 'rainbow') ['#ff9a9a', '#ffc58a', '#fff09a', '#b8f0a0', '#a6d8ff', '#cdb4ff'].forEach((colour, i) =>
      C.shape(o, [[-10, 40 + i * 66], [740, 30 + i * 66], [740, 98 + i * 66], [-10, 108 + i * 66]], colour, { shade: C.mix(colour, '#000000', 0.1), gap: 6, alpha: 0.35, outline: false, sharp: true }));
    const scatter = (draw) => {
      for (const [x, y, s] of [[90, 330, 1], [300, 300, 0.8], [440, 370, 1.1], [560, 160, 1.2], [640, 300, 0.9], [520, 260, 0.7], [180, 400, 0.8], [660, 100, 0.8], [400, 50, 0.8]]) draw(x, y, 30 * s);
    };
    if (p === 'hearts') scatter((x, y, s) => C.shape(o, [[x, y + s], [x - s, y], [x - s, y - s * 0.6], [x - s * 0.5, y - s], [x, y - s * 0.55], [x + s * 0.5, y - s], [x + s, y - s * 0.6], [x + s, y]], dot, { outline: false }));
    if (p === 'stars') scatter((x, y, s) => C.shape(o, Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? s * 0.45 : s * 1.1; return [x + Math.cos(a) * rr, y + Math.sin(a) * rr]; }), dot, { outline: false, sharp: true }));
    if (p === 'bandit') {
      // a mask across the eyes, like a racoon's, with the eyes themselves left clear
      C.shape(o, [[60, 104], [120, 92], [235, 106], [350, 90], [420, 102], [430, 140], [380, 160], [235, 150], [100, 162], [52, 140]], dot, { shade: C.mix(dot, '#000000', 0.15), gap: 6, alpha: 0.4, outline: false });
      o.globalCompositeOperation = 'destination-out';
      for (const [x, y] of ART.eyes) { o.beginPath(); o.arc(x, y, 27, 0, 7); o.fill(); }
      o.globalCompositeOperation = 'source-over';
    }
    // crayon shading: darker low down and round the back, lighter on top
    C.scribble(o, C.blob(370, 440, 400, 70, 0.04), C.mix(body, '#3a2030', 0.22), { angle: 0.15, gap: 9, width: 6, alpha: 0.28 });
    C.scribble(o, C.blob(700, 260, 70, 160, 0.04), C.mix(body, '#3a2030', 0.2), { angle: 1.2, gap: 9, width: 6, alpha: 0.22 });
    C.scribble(o, C.blob(250, 50, 190, 26, 0.04), C.mix(body, '#ffffff', 0.45), { angle: 0.1, gap: 10, width: 5, alpha: 0.4 });
    o.globalCompositeOperation = 'destination-in';
    o.drawImage(bodyMask, 0, 0);
    g.drawImage(over.c, 0, 0);
    C.paper(g, ART.w, ART.h, 0.35);
    // what colour each eye sits in, read before the lines go on
    const at = (x, y) => { const px = g.getImageData(x, y, 1, 1).data; return `rgb(${px[0]},${px[1]},${px[2]})`; };
    const eyeCover = ART.eyes.map(([x, y, rr]) => at(x, y - rr - 9));
    // the lines, in the catpi's pencil
    const pencil = PENCILS[look.lines] || PENCILS.pencil;
    if (pencil === PENCILS.pencil) g.drawImage(lines, 0, 0);
    else {
      const tint = C.sheet(ART.w, ART.h);
      tint.g.drawImage(lines, 0, 0);
      tint.g.globalCompositeOperation = 'source-in';
      tint.g.fillStyle = pencil;
      tint.g.fillRect(0, 0, ART.w, ART.h);
      g.drawImage(tint.c, 0, 0);
    }
    features(g, look, eyeCover, pencil, dot);
    return { c, eyeCover, body, eyeR: look.eyes === 'big' ? 24 : 16 };
  }

  function features(g, look, eyeCover, pencil, dot) {
    g.save();
    g.lineCap = g.lineJoin = 'round';
    const eyes = look.eyes || 'dots';
    ART.eyes.forEach(([x, y, r], i) => {
      const out = i ? 1 : -1;
      if (eyes === 'big') { g.fillStyle = pencil; g.beginPath(); g.arc(x, y, 22, 0, 7); g.fill(); }
      if (eyes === 'shiny' || eyes === 'big') {
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(x - 6, y - 6, eyes === 'big' ? 7 : 5, 0, 7); g.fill();
        g.beginPath(); g.arc(x + 6, y + 6, eyes === 'big' ? 3.5 : 2.5, 0, 7); g.fill();
      }
      if (eyes === 'starry') {
        g.fillStyle = '#ffffff';
        g.beginPath();
        for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4, rr = k % 2 ? 2.2 : 7; g.lineTo(x - 4 + Math.cos(a) * rr, y - 4 + Math.sin(a) * rr); }
        g.fill();
      }
      if (eyes === 'lashes') {
        g.strokeStyle = pencil; g.lineWidth = 5;
        for (const a of [-0.3, 0.05, 0.4]) {
          const ang = -Math.PI / 2 + out * (0.6 + a);
          g.beginPath(); g.moveTo(x + Math.cos(ang) * (r + 1), y + Math.sin(ang) * (r + 1)); g.lineTo(x + Math.cos(ang) * (r + 13), y + Math.sin(ang) * (r + 13)); g.stroke();
        }
      }
      if (eyes === 'sleepy') {
        // a lid over the top half
        g.fillStyle = eyeCover[i];
        g.beginPath(); g.arc(x, y + 1, r + 3, Math.PI, 0); g.fill();
        g.strokeStyle = pencil; g.lineWidth = 6;
        g.beginPath(); g.moveTo(x - r - 3, y + 1); g.lineTo(x + r + 3, y + 1); g.stroke();
      }
    });
    // cheeks, just outside each end of the smile
    const cheeks = look.cheeks || 'none';
    for (const [x, y] of [[96, 196], [392, 186]]) {
      if (cheeks === 'rosy') { g.fillStyle = 'rgba(255, 120, 150, .5)'; g.beginPath(); g.ellipse(x, y, 30, 15, 0, 0, 7); g.fill(); }
      if (cheeks === 'hearts') {
        g.fillStyle = 'rgba(255, 100, 140, .75)';
        g.beginPath(); g.moveTo(x, y + 13); g.bezierCurveTo(x - 22, y, x - 14, y - 16, x, y - 6); g.bezierCurveTo(x + 14, y - 16, x + 22, y, x, y + 13); g.fill();
      }
      if (cheeks === 'swirls') {
        g.strokeStyle = 'rgba(255, 110, 140, .8)'; g.lineWidth = 4;
        g.beginPath(); for (let k = 0; k < 26; k++) { const a = k * 0.5, rr = 2 + k * 0.6; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8); } g.stroke();
      }
    }
    // whiskers, out from each cheek
    const whiskers = look.whiskers || 'none';
    if (whiskers !== 'none') {
      const len = whiskers === 'long' ? 70 : 42;
      g.strokeStyle = pencil; g.lineWidth = 4;
      for (const [x, y, d] of [[70, 182, -1], [418, 172, 1]]) for (const tilt of [-0.25, 0, 0.25]) {
        g.beginPath(); g.moveTo(x, y + tilt * 30); g.quadraticCurveTo(x + d * len * 0.5, y + tilt * 30 + tilt * len * 0.3 - 4, x + d * len, y + tilt * 30 + tilt * len * 0.7); g.stroke();
      }
    }
    // the mouth: a fang or two under the smile, or the tip of a tongue
    const mouth = look.mouth || 'smile';
    const fang = (x, y) => {
      g.fillStyle = '#ffffff'; g.strokeStyle = pencil; g.lineWidth = 4;
      g.beginPath(); g.moveTo(x - 9, y); g.lineTo(x + 9, y - 1); g.lineTo(x + 1, y + 17); g.closePath(); g.fill(); g.stroke();
    };
    if (mouth === 'fang' || mouth === 'fangs') fang(286, 188);
    if (mouth === 'fangs') fang(176, 190);
    if (mouth === 'blep') {
      g.fillStyle = '#ff8fa3'; g.strokeStyle = pencil; g.lineWidth = 5;
      g.beginPath(); g.moveTo(218, 182); g.lineTo(218, 196); g.quadraticCurveTo(232, 214, 246, 196); g.lineTo(246, 181); g.fill(); g.stroke();
      g.strokeStyle = '#e5638e'; g.lineWidth = 3; g.beginPath(); g.moveTo(232, 188); g.lineTo(232, 199); g.stroke();
    }
    g.restore();
  }

  // things to wear. each is drawn once at the drawing's own scale (720 px wide, lines as thick as the
  // friend's) and pinned to a point on the outline of the head, measured from catpi-lines.png: the head dips
  // to about y 38 between the ears, the ears peak near y 10, and the two bumps either side near y 6 to 11.
  //   x, y     where it's pinned on the drawing
  //   w, h     its picture's size, and ax, ay where the pin is in that picture
  //   rot      how it's tilted; swing: whether it wobbles about when the catpi moves
  const INK = '#3a3034';
  const HAT = {
    bow: { x: 440, y: 20, w: 210, h: 140, ax: 105, ay: 64, rot: 0.18, swing: true, s: 1.5 },
    flower: { x: 62, y: 16, w: 150, h: 150, ax: 75, ay: 75, rot: -0.15, swing: true, s: 1.5 },
    sprout: { x: 240, y: 40, w: 220, h: 190, ax: 110, ay: 170, rot: -0.04, swing: true, s: 1.35 },
    'party hat': { x: 240, y: 44, w: 180, h: 240, ax: 90, ay: 210, rot: -0.14, swing: true, s: 1.3 },
    crown: { x: 240, y: 44, w: 200, h: 150, ax: 100, ay: 130, rot: -0.08, swing: true, s: 1.2 },
    'top hat': { x: 240, y: 42, w: 200, h: 220, ax: 100, ay: 200, rot: -0.12, swing: true, s: 1.1 },
    beanie: { x: 240, y: 56, w: 280, h: 200, ax: 140, ay: 170, rot: -0.04, swing: true, s: 1.15 },
    'chef hat': { x: 240, y: 44, w: 220, h: 230, ax: 110, ay: 210, rot: -0.08, swing: true, s: 1.15 },
    antennae: { x: 240, y: 40, w: 300, h: 230, ax: 150, ay: 200, rot: 0, swing: true, s: 1 },
    halo: { x: 240, y: -46, w: 240, h: 100, ax: 120, ay: 50, rot: -0.1, swing: true, s: 1 },
    monocle: { x: 324, y: 125, w: 140, h: 200, ax: 60, ay: 60, rot: 0 },
    'angel wings': { x: 570, y: 74, w: 260, h: 230, ax: 70, ay: 200, rot: 0.1, swing: true, s: 1.35, behind: true },
    'butterfly wings': { x: 545, y: 74, w: 300, h: 260, ax: 50, ay: 220, rot: 0.05, swing: true, s: 1.35, behind: true },
    backpack: { x: 548, y: 100, w: 220, h: 220, ax: 110, ay: 110, rot: 0.22, swing: true, s: 1.9 },
    'round glasses': { x: 235, y: 126, w: 380, h: 140, ax: 190, ay: 70, rot: 0 },
    sunglasses: { x: 235, y: 126, w: 380, h: 140, ax: 190, ay: 70, rot: 0 },
    'heart glasses': { x: 235, y: 126, w: 380, h: 140, ax: 190, ay: 70, rot: 0 },
  };
  function paintHat(kind, look, seed) {
    const at = HAT[kind];
    if (!at) return null;
    const s = at.s || 1;
    const { c, g } = C.sheet(at.w * s, at.h * s);
    C.wobble(seed + 3);
    const r = C.seeded(seed + 11);
    g.translate(at.ax * s, at.ay * s);
    g.scale(s, s);
    // outlines as thick as the drawing's own, however big the hat is
    const line = { line: INK, width: 7.5 / s };
    if (kind === 'bow') {
      // two ribbon tails, the loops either side, then the knot over the top, sat on the outline
      C.shape(g, [[-8, 6], [-34, 56], [-20, 50], [-12, 62], [6, 10]], '#f2557d', { shade: '#cf3a62', ...line });
      C.shape(g, [[8, 6], [30, 52], [40, 42], [50, 50], [14, 2]], '#f2557d', { shade: '#cf3a62', ...line });
      for (const d of [-1, 1]) {
        C.shape(g, [[0, 0], [d * 30, -38], [d * 72, -46], [d * 90, -18], [d * 76, 20], [d * 34, 24]], '#ff7a9c', { shade: '#e0456c', angle: d * 0.6, gap: 8, ...line });
        C.stroke(g, [[d * 18, -6], [d * 52, -22]], '#cf3a62', 5);
        C.stroke(g, [[d * 18, 8], [d * 50, 12]], '#cf3a62', 5);
      }
      C.shape(g, C.blob(0, 2, 20, 23, 0.08, 12), '#ff8fab', { shade: '#e0456c', ...line });
    }
    if (kind === 'flower') {
      const petal = ['#ffffff', '#ffd6e4', '#fff1a6', '#e6d4ff'][Math.floor(r() * 4)];
      C.shape(g, [[10, 20], [44, 30], [60, 54], [30, 50]], '#8fd660', { shade: '#5fa83e', width: 6 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        C.shape(g, C.blob(Math.cos(a) * 31, Math.sin(a) * 31, 25, 25, 0.08, 14), petal, { shade: C.mix(petal, '#e0456c', 0.25), gap: 7, width: 6 });
      }
      C.shape(g, C.blob(0, 0, 21, 21, 0.06, 14), '#ffc53d', { shade: '#f2a516', width: 6 });
    }
    if (kind === 'sprout') {
      C.stroke(g, [[0, 8], [6, -40], [2, -78]], '#4e9a3a', 11);
      C.shape(g, [[0, -70], [-34, -112], [-86, -120], [-62, -82], [-30, -66]], '#8fd660', { shade: '#5fa83e', angle: 0.6, width: 6 });
      C.shape(g, [[4, -74], [42, -130], [92, -138], [72, -94], [34, -72]], '#9be06a', { shade: '#5fa83e', angle: -0.6, width: 6 });
      C.stroke(g, [[-8, -76], [-64, -106]], '#5fa83e', 4);
      C.stroke(g, [[10, -80], [74, -124]], '#5fa83e', 4);
    }
    if (kind === 'party hat') {
      // a cone whose bottom follows the curve of the head, polka dots, a frill round the bottom and a pompom
      // on the very tip
      const colour = ['#ff8fab', '#7fc3e8', '#ffd84f', '#b98ff0', '#7fd6a4'][Math.floor(r() * 5)];
      const cone = [[-54, 2], [-28, 9], [0, 11], [28, 8], [54, 0], [8, -156]];
      C.shape(g, cone, colour, { shade: C.mix(colour, '#000000', 0.18), angle: 1.2, gap: 8, sharp: true, ...line });
      for (const [x, y, s] of [[-24, -16, 10], [22, -24, 9], [0, -58, 9], [16, -92, 7], [-6, -116, 6], [-30, -40, 7]]) C.shape(g, C.blob(x, y, s, s, 0.1, 10), '#fffaf0', { outline: false });
      for (let x = -48; x <= 48; x += 16) C.shape(g, C.blob(x, 6 - Math.abs(x) * 0.06, 11, 10, 0.1, 10), '#fffaf0', { width: 4 });
      C.shape(g, C.blob(8, -160, 19, 18, 0.12, 14), '#ffc53d', { shade: '#f2a516', width: 6 });
    }
    const bright = ['#ff8fab', '#7fc3e8', '#ffd84f', '#b98ff0', '#7fd6a4', '#ffa64d'][Math.floor(r() * 6)];
    const accentInk = ink(look.accent), dotInk = ink(look.dot || look.accent);
    if (kind === 'crown') {
      C.shape(g, [[-58, 8], [-62, -52], [-32, -22], [0, -66], [32, -22], [62, -52], [58, 8]], '#ffd84f', { shade: '#e8a92a', angle: 1.3, gap: 7, sharp: true, ...line });
      C.shape(g, [[-58, -10], [58, -10], [58, 8], [-58, 8]], '#f2c03a', { shade: '#d8962a', sharp: true, ...line });
      for (const [x, col] of [[-32, '#e5383b'], [0, '#4f8fe8'], [32, '#20b974']]) C.shape(g, C.blob(x, -1, 7, 7, 0.08, 10), col, { width: 3 });
      for (const [x, y] of [[-62, -56], [0, -70], [62, -56]]) C.shape(g, C.blob(x, y, 8, 8, 0.08, 10), '#fff3bf', { width: 3 });
    }
    if (kind === 'top hat') {
      C.shape(g, [[-40, -6], [-44, -124], [44, -124], [40, -6]], '#3d3a45', { shade: '#58545f', angle: 1.5, gap: 7, sharp: true, ...line });
      C.shape(g, [[-41, -38], [41, -38], [41, -18], [-41, -18]], bright, { shade: C.mix(bright, '#000000', 0.15), sharp: true, ...line });
      C.shape(g, C.blob(0, -3, 74, 13, 0.03, 24), '#3d3a45', { shade: '#58545f', ...line });
      C.stroke(g, [[-30, -110], [-30, -50]], '#7a7584', 5, 0.8);
    }
    if (kind === 'beanie') {
      const dome = Array.from({ length: 15 }, (_, i) => { const a = Math.PI + (i / 14) * Math.PI; return [Math.cos(a) * 104, -6 + Math.sin(a) * 100]; });
      C.shape(g, dome, bright, { shade: C.mix(bright, '#000000', 0.15), angle: 1.5, gap: 7, ...line });
      C.shape(g, C.box(-112, -14, 224, 34, 14, 1), C.mix(bright, '#ffffff', 0.25), { shade: C.mix(bright, '#000000', 0.1), angle: 1.57, gap: 9, ...line });
      for (let x = -96; x <= 96; x += 16) C.stroke(g, [[x, -10], [x, 16]], C.mix(bright, '#000000', 0.25), 3);
      C.shape(g, C.blob(0, -112, 24, 22, 0.12, 14), '#fff7ea', { shade: '#e8d8c0', ...line });
    }
    if (kind === 'chef hat') {
      for (const [x, y, rr] of [[-42, -96, 36], [42, -96, 36], [0, -118, 42]]) C.shape(g, C.blob(x, y, rr, rr * 0.9, 0.06, 18), '#ffffff', { shade: '#e6e9ef', gap: 8, ...line });
      C.shape(g, [[-52, 8], [-56, -72], [56, -72], [52, 8]], '#ffffff', { shade: '#e6e9ef', angle: 1.5, gap: 8, sharp: true, ...line });
      for (const x of [-26, 0, 26]) C.stroke(g, [[x, -66], [x, 2]], '#cfd5df', 4);
    }
    if (kind === 'antennae') {
      // a caterpillar's feelers, with a bobble on each
      for (const d of [-1, 1]) {
        C.stroke(g, [[d * 32, 6], [d * 44, -60], [d * 82, -128]], INK, 9);
        C.shape(g, C.blob(d * 86, -138, 19, 19, 0.08, 14), accentInk, { shade: C.mix(accentInk, '#000000', 0.2), ...line });
      }
    }
    if (kind === 'halo') {
      g.lineWidth = 24; g.strokeStyle = INK;
      g.beginPath(); g.ellipse(0, 0, 76, 20, 0, 0, 7); g.stroke();
      g.lineWidth = 13; g.strokeStyle = '#ffe066';
      g.beginPath(); g.ellipse(0, 0, 76, 20, 0, 0, 7); g.stroke();
      C.stroke(g, [[-50, -14], [-20, -20]], '#fffbe0', 5);
    }
    if (kind === 'monocle') {
      g.fillStyle = 'rgba(255, 255, 255, .22)';
      g.beginPath(); g.arc(0, 0, 40, 0, 7); g.fill();
      C.pencil(g, C.blob(0, 0, 40, 40, 0.02, 24), { color: '#c99a2e', width: 9 });
      C.pencil(g, C.blob(0, 0, 45, 45, 0.02, 24), { color: INK, width: 3 });
      C.stroke(g, [[-22, -16], [-10, -28]], '#ffffff', 6, 0.9);
      C.stroke(g, [[30, 30], [44, 70], [36, 110], [50, 132]], '#c99a2e', 4);
    }
    if (kind === 'angel wings') {
      for (const [dx, dy, col] of [[-34, 18, '#e3ecf6'], [0, 0, '#ffffff']]) {
        const wing = [[dx, dy], [dx + 18, dy - 84], [dx + 64, dy - 150], [dx + 118, dy - 168], [dx + 138, dy - 132], [dx + 122, dy - 96], [dx + 132, dy - 70], [dx + 110, dy - 42], [dx + 112, dy - 20], [dx + 60, dy - 4]];
        C.shape(g, wing, col, { shade: '#cfdcea', angle: 0.9, gap: 8, ...line });
        for (const [a, b] of [[[dx + 40, dy - 30], [dx + 100, dy - 34]], [[dx + 34, dy - 66], [dx + 110, dy - 80]], [[dx + 40, dy - 104], [dx + 112, dy - 128]]]) C.stroke(g, [a, b], '#b8c8da', 4);
      }
    }
    if (kind === 'butterfly wings') {
      const wingInk = dotInk === ink(look.body) ? bright : dotInk;
      // the hind wing rises behind the front one, both up off the back
      C.shape(g, [[10, 0], [70, -50], [150, -90], [196, -66], [186, -20], [120, 10]], C.mix(wingInk, '#ffffff', 0.3), { shade: wingInk, angle: 0.4, gap: 8, ...line });
      C.shape(g, [[0, 0], [10, -90], [60, -170], [140, -190], [176, -140], [150, -70], [70, -20]], wingInk, { shade: C.mix(wingInk, '#000000', 0.15), angle: 0.8, gap: 8, ...line });
      for (const [x, y, rr] of [[110, -130, 18], [70, -80, 12], [146, -96, 9], [160, -50, 10]]) C.shape(g, C.blob(x, y, rr, rr, 0.1, 12), '#fff7ea', { width: 4 });
    }
    if (kind === 'backpack') {
      C.stroke(g, [[-30, -40], [-60, 40], [-56, 90]], C.mix(bright, '#000000', 0.3), 8);
      C.shape(g, C.box(-52, -50, 104, 100, 26, 1.5), bright, { shade: C.mix(bright, '#000000', 0.15), angle: 1.4, gap: 7, ...line });
      C.shape(g, [[-52, -20], [-40, -50], [40, -50], [52, -20], [0, -6]], C.mix(bright, '#000000', 0.12), { sharp: true, ...line });
      C.shape(g, C.box(-28, 8, 56, 32, 10, 1), C.mix(bright, '#ffffff', 0.3), { ...line });
      C.shape(g, C.blob(0, -12, 7, 7, 0.08, 10), '#ffd84f', { width: 3 });
    }
    if (kind.endsWith('glasses')) {
      // centred on the eyes (89 px either side), so they look straight out
      for (const d of [-1, 1]) {
        const x = d * 89;
        if (kind === 'round glasses') {
          g.fillStyle = 'rgba(255, 255, 255, .22)';
          g.beginPath(); g.arc(x, 0, 44, 0, 7); g.fill();
          C.pencil(g, C.blob(x, 0, 44, 44, 0.02, 24), { color: INK, width: 8 });
          C.stroke(g, [[x - 26, -18], [x - 12, -30]], '#ffffff', 6, 0.9);
        }
        if (kind === 'sunglasses') {
          C.shape(g, C.box(x - 52, -32, 104, 66, 22, 1), '#2b2733', { shade: '#45404f', angle: 0.4, gap: 6, ...line });
          C.stroke(g, [[x - 34, -16], [x - 14, -24]], '#ffffff', 6, 0.75);
        }
        if (kind === 'heart glasses') {
          const heart = [[0, 40], [-34, 8], [-42, -14], [-30, -32], [-12, -32], [0, -16], [12, -32], [30, -32], [42, -14], [34, 8]].map(([px, py]) => [x + px * 1.15, py * 1.05]);
          g.globalAlpha = 0.88;
          C.shape(g, heart, '#ff6f91', { shade: '#e0456c', line: '#a8324f', width: 7 });
          g.globalAlpha = 1;
          C.stroke(g, [[x - 30, -14], [x - 18, -24]], '#ffffff', 6, 0.8);
        }
        C.stroke(g, [[d * 133, -8], [d * 176, -18]], INK, 7);
      }
      C.stroke(g, [[-46, -8], [0, -22], [46, -8]], INK, 7);
    }
    return { ...at, c, ax: at.ax * s, ay: at.ay * s };
  }

  // ---------- who they are ----------

  let lastId = 0;
  function make([name, body, accent, pattern, dot, trait, hat, likes, place, size, more = {}], extra = {}) {
    const seed = ++lastId * 101 + name.length * 7;
    const r = C.seeded(seed);
    const c = {
      id: extra.id || 'c' + Date.now().toString(36) + lastId,
      name, look: { body, accent, pattern, dot, eyes: more.eyes || 'dots', mouth: more.mouth || 'smile', cheeks: more.cheeks || 'none', whiskers: more.whiskers || 'none', lines: more.lines || 'pencil' },
      trait, hat, face: more.face || 'none', back: more.back || 'none', likes, size, place,
      pitch: extra.pitch || Math.round(300 + r() * 90 - (size - 1) * 300),
      dislikes: trait === 'hungry' ? null : FOODS.filter((f) => f !== likes)[Math.floor(r() * 3)],
      tummy: 60 + r() * 30, joy: 60 + r() * 20, clean: 70 + r() * 30, energy: 50 + r() * 50,
      seed, ...extra,
    };
    return dress(c);
  }
  // everything that changes moment to moment, and the pictures. a catpi from storage comes through here too
  function dress(c) {
    const art = paint(c.look, c.seed);
    Object.assign(c, {
      art, wearArt: wearing(c),
      x: 0, y: 0, z: 0, vz: 0, dir: Math.random() < 0.5 ? -1 : 1, turn: 1, lean: 0, leanTo: 0,
      sq: 0, sqv: 0, wave: 0, phase: 0, spin: 0, hatSwing: 0, hatV: 0,
      act: { type: 'idle', t: 1 + Math.random() * 2 }, hop: null,
      eyes: 'open', mouth: 'smile', blush: 0, blinkAt: 1 + Math.random() * 4, blinkT: 0,
      wet: 0, soap: [], bubble: null, said: 0, held: false, tick: Math.random() * 10,
    });
    c.turn = c.dir;
    return c;
  }
  // the colour and pattern changed in the hatch dialog
  function repaint(c) { c.art = paint(c.look, c.seed); c.wearArt = wearing(c); }
  // the pictures of whatever's on its head, face and back
  const wearing = (c) => ({ head: paintHat(c.hat, c.look, c.seed), face: paintHat(c.face || 'none', c.look, c.seed + 1), back: paintHat(c.back || 'none', c.look, c.seed + 2) });

  const save = (c) => ({ id: c.id, name: c.name, look: c.look, trait: c.trait, hat: c.hat, face: c.face, back: c.back, likes: c.likes, dislikes: c.dislikes, size: c.size, place: c.place === 'road' ? c.dest : c.place, pitch: c.pitch, seed: c.seed, tummy: c.tummy, joy: c.joy, clean: c.clean, energy: c.energy });
  function restore(data) {
    // saved before the glasses came in three kinds, and before voices came down to animal noises
    // and before glasses moved to the face, so a hat and glasses can be worn together
    if (data.hat === 'glasses') data.hat = 'round glasses';
    if (FACES.includes(data.hat)) { data.face = data.hat; data.hat = 'none'; }
    data.face = data.face || 'none';
    data.back = data.back || 'none';
    if (data.pitch > 470) data.pitch = Math.round(data.pitch * 0.5);
    lastId = Math.max(lastId, data.seed || 0);
    return dress({ ...data });
  }
  const starters = () => FIRST.map((row) => make(row));
  function randomLook(r = Math.random) {
    const names = Object.keys(CRAYONS);
    const pick = (list) => list[Math.floor(r() * list.length)];
    return {
      body: pick(names), accent: pick(names), pattern: pick(PATTERNS), dot: pick(names),
      eyes: r() < 0.4 ? 'dots' : pick(EYES), mouth: r() < 0.5 ? 'smile' : pick(MOUTHS), cheeks: pick(CHEEKS),
      whiskers: r() < 0.5 ? 'none' : pick(WHISKERS), lines: r() < 0.6 ? 'pencil' : pick(Object.keys(PENCILS)),
    };
  }

  // ---------- drawing ----------

  // how big a catpi is at this depth (further back is smaller)
  const depth = (c, ground) => 0.78 + 0.32 * Math.max(0, Math.min(1, (c.y - ground.top) / (ground.bottom - ground.top)));
  const scaleOf = (c, ground) => (WIDTH * c.size * depth(c, ground)) / ART.w;
  const ripple = (c, x) => Math.sin(c.phase + (x / 72) * 0.75) * c.wave;

  // the box round a catpi on the stage, for clicking it
  function bounds(c, ground) {
    const s = scaleOf(c, ground);
    const w = ART.w * s, h = ART.h * s;
    return { x: c.x - w / 2, y: c.y - c.z - h, w, h };
  }

  function shadow(g, c, ground) {
    const s = scaleOf(c, ground) * ART.w;
    const fade = Math.max(0.25, 1 - c.z / 260);
    g.save();
    g.globalAlpha = 0.22 * fade;
    g.fillStyle = '#3a3034';
    g.beginPath();
    g.ellipse(c.x, c.y - 2, s * 0.46 * fade, s * 0.07 * fade, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function draw(g, c, ground, t) {
    const s = scaleOf(c, ground);
    const breathe = 1 + Math.sin(t * 2.3 + c.seed) * (c.act.type === 'nap' ? 0.035 : 0.016);
    const flat = c.act.type === 'nap' ? 0.9 : 1;
    let sx = 1 + c.sq * 0.45, sy = (1 - c.sq) * breathe * flat;
    if (c.act.type === 'stretch') { const k = Math.sin(Math.min(1, c.act.k) * Math.PI); sx *= 1 + k * 0.22; sy *= 1 - k * 0.14; }
    if (c.held) { sx *= 0.9; sy *= 1.12; }
    g.save();
    g.translate(c.x, c.y - c.z);
    // facing: the drawing faces left, turn runs -1 (left) to 1 (right) and flattens it on the way round
    const flip = -c.turn;
    g.scale(s * Math.sign(flip || 1) * Math.max(0.12, Math.abs(flip)), s);
    g.rotate(-c.lean + c.spin);
    g.scale(sx, sy);
    g.translate(-ART.w / 2, -ART.h);
    const pic = c.art.c;
    if (c.wearArt.back && c.wearArt.back.behind) piece(g, c, c.wearArt.back);
    if (c.wave > 0.4) {
      for (let i = 0; i < 10; i++) {
        const x = i * 72;
        g.drawImage(pic, x, 0, 73, ART.h, x, ripple(c, x + 36), 73, ART.h);
      }
    } else {
      g.drawImage(pic, 0, 0);
    }
    face(g, c, t);
    dressing(g, c, t);
    g.restore();
  }

  // eyes, mouth and cheeks over the drawing
  function face(g, c) {
    g.lineCap = g.lineJoin = 'round';
    ART.eyes.forEach(([x, y, r], i) => {
      y += ripple(c, x);
      if (c.eyes === 'open') return;
      if (c.eyes === 'wide') {
        g.fillStyle = '#fffaf0';
        g.beginPath(); g.arc(x, y, r + 6, 0, Math.PI * 2); g.fill();
        g.lineWidth = 6; g.strokeStyle = '#181416'; g.stroke();
        g.fillStyle = '#181416';
        g.beginPath(); g.arc(x, y + 2, r * 0.55, 0, Math.PI * 2); g.fill();
        return;
      }
      g.fillStyle = c.art.eyeCover[i];
      g.beginPath(); g.arc(x, y, c.art.eyeR + 5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#181416';
      g.lineWidth = 8;
      g.beginPath();
      if (c.eyes === 'happy') { g.moveTo(x - 17, y + 6); g.quadraticCurveTo(x, y - 18, x + 17, y + 6); }
      else if (c.eyes === 'closed') { g.moveTo(x - 17, y - 2); g.quadraticCurveTo(x, y + 14, x + 17, y - 2); }
      else if (c.eyes === 'squeeze') { const d = i ? -1 : 1; g.moveTo(x - 14 * d, y - 12); g.lineTo(x + 12 * d, y); g.lineTo(x - 14 * d, y + 12); }
      else if (c.eyes === 'dizzy') { g.moveTo(x - 12, y - 12); g.lineTo(x + 12, y + 12); g.moveTo(x + 12, y - 12); g.lineTo(x - 12, y + 12); }
      else { g.moveTo(x - 16, y + 1); g.lineTo(x + 16, y + 1); }
      g.stroke();
    });
    if (c.blush > 0.05) {
      g.save();
      g.globalAlpha = Math.min(0.7, c.blush);
      g.fillStyle = '#ff7f9e';
      for (const [x, y] of ART.cheeks) { g.beginPath(); g.ellipse(x, y + ripple(c, x), 30, 14, 0, 0, Math.PI * 2); g.fill(); }
      g.restore();
    }
    if (c.mouth === 'open' || c.mouth === 'munch' && Math.sin(c.tick * 18) > 0) {
      const [x, y0] = ART.mouth, y = y0 + ripple(c, x);
      const open = c.mouth === 'open' ? 1 : 0.7;
      g.fillStyle = '#5a2430';
      g.beginPath(); g.ellipse(x, y + 10 * open, 26, 22 * open, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ff8fa3';
      g.beginPath(); g.ellipse(x, y + 20 * open, 15, 9 * open, 0, 0, Math.PI * 2); g.fill();
      g.lineWidth = 6; g.strokeStyle = '#181416';
      g.beginPath(); g.ellipse(x, y + 10 * open, 26, 22 * open, 0, 0, Math.PI * 2); g.stroke();
    }
  }

  // soap suds, drips, and its hat
  function dressing(g, c, t) {
    if (c.wet > 0.05) {
      g.save();
      g.globalAlpha = Math.min(0.8, c.wet);
      g.strokeStyle = '#4f9fe0';
      g.lineWidth = 7;
      g.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const x = 100 + i * 100, y = 140 + ((i * 67) % 120) + ripple(c, 100 + i * 100);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 2, y + 34); g.stroke();
        g.fillStyle = '#4f9fe0';
        g.beginPath(); g.arc(x + 2, y + 44, 7, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }
    for (const b of c.soap) {
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#9cc3d6';
      g.lineWidth = 4;
      g.beginPath(); g.arc(b.x, b.y + ripple(c, b.x), b.r, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    const { head, face: specs, back } = c.wearArt;
    if (back && !back.behind) piece(g, c, back);
    if (specs) piece(g, c, specs);
    if (head) piece(g, c, head);
  }
  function piece(g, c, h) {
    g.save();
    g.translate(h.x, h.y + ripple(c, h.x));
    g.rotate(h.rot + (h.swing ? c.hatSwing * 0.6 : 0));
    g.drawImage(h.c, -h.ax, -h.ay);
    g.restore();
  }

  // a catpi on its own, for its card and the hatch dialog: bobbing, blinking, centred in w by h
  function portrait(g, c, w, h, t) {
    g.save();
    const s = Math.min(w / (ART.w + 160), h / (ART.h + 230)) * (0.62 + 0.36 * (c.size - 0.7) / 0.45);
    const hop = Math.abs(Math.sin(t * 2.4)) * 10;
    g.translate(w / 2, h - 8 - hop);
    g.scale(s * (c.dir > 0 ? -1 : 1), s);
    const k = Math.sin(t * 4.8);
    g.scale(1 + Math.max(0, -k) * 0.04, 1 - Math.max(0, -k) * 0.05);
    g.translate(-ART.w / 2, -ART.h);
    if (c.wearArt.back && c.wearArt.back.behind) piece(g, c, c.wearArt.back);
    g.drawImage(c.art.c, 0, 0);
    const blinking = (t % 3.4) < 0.14;
    const was = c.eyes;
    if (blinking) c.eyes = 'blink';
    face(g, c, t);
    c.eyes = was;
    dressing(g, c, t);
    g.restore();
  }

  // ---------- living ----------

  const rnd = (a, b) => a + Math.random() * (b - a);
  const chance = (p) => Math.random() < p;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const near = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * 1.6);
  const busy = (c) => ['held', 'fall', 'pet', 'eat', 'chat', 'shake', 'leave', 'dizzy', 'hatch', 'spin'].includes(c.act.type);

  // start doing something. reset anything the last thing left on the face
  function act(c, type, more = {}) {
    if (c.act.type === 'nap' && type !== 'nap') c.eyes = 'open';
    c.act = { type, t: 0, ...more };
    c.spin = 0;
    c.hop = null;
    if (type !== 'chat' && type !== 'eat') c.mouth = 'smile';
  }
  function say(c, w, icon, words) {
    c.bubble = { icon, t: 1.6 };
    if (words !== false) w.voice(c, icon);
  }
  function face2(c, x) { if (Math.abs(x - c.x) > 4) c.dir = x > c.x ? 1 : -1; }
  function bounce(c, amount = 1) { c.sqv -= 5 * amount; }

  // what to do next, when it's done what it was doing
  function want(c, w) {
    const ground = w.ground(c.place);
    const here = w.catpis.filter((o) => o !== c && o.place === c.place);
    const weights = [];
    const add = (p, f) => { if (p > 0) weights.push([p, f]); };
    const sleepy = c.trait === 'sleepy' ? 2 : 1;
    add((c.energy < 30 ? 6 : 0.4) * sleepy * (w.night ? 3 : 1), () => act(c, 'nap', { t: 0, len: rnd(8, 18) * sleepy }));
    add(3, () => walkTo(c, clamp(c.x + rnd(-260, 260), ground.left, ground.right), clamp(c.y + rnd(-90, 90), ground.top, ground.bottom)));
    add(2, () => act(c, 'idle', { len: rnd(1.2, 3.5) }));
    add(0.5, () => act(c, 'stretch', { len: 1.8 }));
    if (c.joy > 70) add(c.trait === 'bouncy' ? 2 : 0.6, () => happyHop(c, w));
    // a chat or a game of tag with someone free nearby
    const friend = here.filter((o) => !busy(o) && o.act.type !== 'nap' && near(o, c) < 420)[0];
    if (friend) add(c.trait === 'chatty' ? 3 : 1, () => startChat(c, friend, w));
    if (friend && c.trait === 'playful' || friend && c.trait === 'bouncy') add(1, () => { act(c, 'tag', { other: friend, len: rnd(4, 7) }); act(friend, 'flee', { from: c, len: c.act.len }); w.news(`${c.name} is playing tag with ${friend.name}.`); });
    // puddles
    const pool = w.water(c.place)[0];
    if (pool && (c.trait === 'splashy' || c.clean < 35)) add(c.trait === 'splashy' ? 2 : 1, () => walkTo(c, pool.x + rnd(-0.5, 0.5) * pool.rx, pool.y + rnd(-0.3, 0.3) * pool.ry, 'splash'));
    // off somewhere else for a while
    if (here.length >= 3) add(0.05, () => leave(c, w));
    let total = weights.reduce((s, [p]) => s + p, 0), roll = Math.random() * total;
    for (const [p, f] of weights) if ((roll -= p) <= 0) return f();
  }

  function walkTo(c, x, y, then = null, fast = false) {
    act(c, 'walk', { x, y, then, fast, gait: fast || c.trait === 'bouncy' || chance(0.6) ? 'hop' : 'crawl' });
  }
  function happyHop(c, w) {
    act(c, 'spin', { len: 0.9 });
    c.vz = 560; c.z = 0.01; bounce(c, 1.2);
    c.eyes = 'happy';
    say(c, w, chance(0.5) ? 'note' : 'star', 'wee!');
    w.sound('hop', { rate: 1.3 }, c);
  }
  function startChat(c, other, w) {
    const topics = [['leaf', 'heart'], ['fish', 'question'], ['ball', 'exclaim'], ['sun', 'note'], ['cake', 'heart'], ['moon', 'dots'], ['flower', 'star'], ['rain', 'question'], ['heart', 'heart']];
    const lines = topics[Math.floor(Math.random() * topics.length)];
    act(c, 'chat', { other, lines, step: 0, lead: true, len: 4.4 });
    act(other, 'chat', { other: c, lines, step: 0, lead: false, len: 4.4 });
    w.news(pick([`${c.name} and ${other.name} are having a chat.`, `${c.name} is telling ${other.name} something important.`, `${other.name} is listening to ${c.name}.`]));
  }
  function leave(c, w) {
    const ground = w.ground(c.place);
    // somewhere quieter, usually
    const count = (id) => w.catpis.filter((o) => o.place === id || o.dest === id && o.place === 'road').length + Math.random() * 2;
    const to = PLACES.list.filter((p) => p.id !== c.place).sort((a, b) => count(a.id) - count(b.id))[0];
    const side = c.x < (ground.left + ground.right) / 2 ? -1 : 1;
    act(c, 'leave', { to: to.id, x: side < 0 ? ground.left - 160 : ground.right + 160, y: c.y });
  }
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  // ---------- every frame ----------
  function update(c, dt, w) {
    c.tick += dt;
    // the road between places: arrive once the trip's over
    if (c.place === 'road') {
      if ((c.arrive -= dt) <= 0) {
        c.place = c.dest;
        const ground = w.ground(c.place);
        const side = chance(0.5) ? -1 : 1;
        c.x = side < 0 ? ground.left - 140 : ground.right + 140;
        c.y = rnd(ground.top + 20, ground.bottom - 20);
        c.z = 0;
        walkTo(c, side < 0 ? ground.left + rnd(60, 200) : ground.right - rnd(60, 200), c.y);
        w.news(`${c.name} just got to ${PLACES.byId[c.place].says}.`);
      }
      return;
    }
    const ground = w.ground(c.place);
    // feelings drift
    const awake = c.act.type !== 'nap';
    c.tummy = clamp(c.tummy - dt * (c.trait === 'hungry' ? 0.3 : 0.16), 0, 100);
    c.energy = clamp(c.energy + dt * (awake ? -0.12 : 3), 0, 100);
    c.clean = clamp(c.clean - dt * 0.04, 0, 100);
    if (c.clean < 90) c.sparkled = false;
    c.joy = clamp(c.joy + dt * (c.joy > 55 ? -0.06 : 0.02), 0, 100);
    c.wet = Math.max(0, c.wet - dt * 0.08);
    c.blush = Math.max(0, c.blush - dt * 0.5);

    // the squash spring, the lean, the hat
    c.sqv += (-190 * c.sq - 11 * c.sqv) * dt;
    c.sq = clamp(c.sq + c.sqv * dt, -0.35, 0.45);
    c.lean += (c.leanTo - c.lean) * Math.min(1, dt * 10);
    c.leanTo *= Math.pow(0.02, dt);
    c.hatV += (-120 * c.hatSwing - 6 * c.hatV) * dt - c.sqv * dt * 1.5;
    c.hatSwing = clamp(c.hatSwing + c.hatV * dt, -0.5, 0.5);
    c.turn += (c.dir - c.turn) * Math.min(1, dt * 9);
    c.wave = Math.max(0, c.wave - dt * 20);
    if (c.bubble && (c.bubble.t -= dt) <= 0) c.bubble = null;

    // falling, after a hop or being dropped
    if (!c.hop && !c.held && (c.z > 0 || c.vz > 0)) {
      c.vz -= GRAVITY * dt;
      c.z += c.vz * dt;
      if (c.z <= 0) {
        const hard = -c.vz;
        c.z = 0; c.vz = 0;
        c.sqv += Math.min(9, hard / 110);
        if (hard > 300) w.sound('land', { volume: Math.min(1, hard / 1200) }, c);
        if (c.act.type === 'spin') c.spin = 0;
      }
    }

    // blinking, unless the face is busy
    if (c.eyes === 'open' || c.eyes === 'blink') {
      c.blinkAt -= dt;
      if (c.blinkAt <= 0) { c.eyes = 'blink'; c.blinkT = 0.13; c.blinkAt = rnd(2, 5.5); }
      if (c.eyes === 'blink' && (c.blinkT -= dt) <= 0) c.eyes = 'open';
    }

    // look at the pointer when it's close and still and there's nothing else on
    const you = w.pointer;
    if (you && you.place === c.place && c.act.type === 'idle' && Math.hypot(you.x - c.x, you.y - c.y) < 260) face2(c, you.x);

    // food and balls pull them off whatever they were doing, if they care enough
    const was = c.act;
    if (!busy(c) && was.type !== 'nap' && c.place === w.place) {
      const food = w.foods.filter((f) => f.place === c.place && f.z <= 0 && !f.taken).sort((p, q) => near(p, c) - near(q, c))[0];
      const peckish = c.tummy < 80 || c.trait === 'hungry' || food && food.kind === c.likes;
      if (food && peckish && was.chasing !== 'food' && !(food.snubbed || []).includes(c.id) && near(food, c) < 900) {
        act(c, 'walk', { x: food.x, y: food.y, then: 'eat', food, gait: 'hop', fast: c.tummy < 40 });
        c.act.chasing = 'food';
      } else if (was.chasing !== 'ball' && was.chasing !== 'food') {
        const ball = w.balls.filter((b) => b.place === c.place).sort((p, q) => near(p, c) - near(q, c))[0];
        const keen = c.trait === 'playful' ? 0.9 : c.trait === 'bouncy' ? 0.6 : c.energy > 40 ? 0.25 : 0;
        if (ball && near(ball, c) < 700 && (Math.hypot(ball.vx, ball.vy) > 60 || was.type === 'idle') && Math.random() < keen * dt * 3) {
          act(c, 'walk', { ball, gait: 'hop', fast: true, chasing: 'ball' });
        }
      }
    }

    // ---------- what it's doing ----------
    const a = c.act;
    a.t += dt;
    switch (a.type) {
      case 'idle':
        if (a.t > (a.len || 2)) want(c, w);
        else if (chance(dt * 0.4)) c.dir *= -1;
        break;
      case 'walk':
      case 'tag':
      case 'flee':
      case 'leave': {
        let tx = a.x, ty = a.y;
        if (a.food) { if (a.food.taken && a.food.taken !== c || !w.foods.includes(a.food)) { act(c, 'idle', { len: 1 }); say(c, w, 'question', false); break; } tx = a.food.x + (c.x < a.food.x ? -1 : 1) * WIDTH * 0.24 * c.size * depth(c, ground); ty = a.food.y; }
        if (a.ball) {
          if (!w.balls.includes(a.ball) || a.t > 8) { act(c, 'idle', { len: 1 }); break; }
          tx = a.ball.x; ty = a.ball.y;
          if (near(a.ball, c) < WIDTH * 0.42 * c.size && a.ball.z < 50) { w.kick(a.ball, c); act(c, 'idle', { len: rnd(0.4, 1) }); c.eyes = 'happy'; setTimeout(() => { if (c.eyes === 'happy') c.eyes = 'open'; }, 600); break; }
        }
        if (a.type === 'tag') { if (a.t > a.len) { act(c, 'idle', { len: 1.5 }); c.eyes = 'happy'; say(c, w, 'heart'); setTimeout(() => (c.eyes = 'open'), 1500); break; } tx = a.other.x; ty = a.other.y; }
        if (a.type === 'flee') {
          if (a.t > a.len || a.from !== 'water' && a.from.act.type !== 'tag') { act(c, 'idle', { len: 1 }); c.eyes = 'open'; break; }
          if (!a.x || near(c, { x: a.x, y: a.y }) < 40) {
            const from = a.from === 'water' ? a.at : a.from;
            a.x = clamp(c.x + Math.sign(c.x - from.x || 1) * rnd(160, 300), ground.left, ground.right);
            a.y = clamp(c.y + rnd(-100, 100), ground.top, ground.bottom);
          }
          tx = a.x; ty = a.y;
        }
        const fast = a.fast || a.type === 'tag' || a.type === 'flee' || a.chasing === 'ball';
        if (step(c, tx, ty, dt, fast ? 'run' : c.trait === 'bouncy' ? 'hop' : a.gait, w)) {
          if (a.type === 'leave') { c.place = 'road'; c.dest = a.to; c.arrive = rnd(4, 9); w.news(`${c.name} wandered off to ${PLACES.byId[a.to].says}.`); break; }
          if (a.then === 'eat' && a.food) {
            if (a.food.taken) { act(c, 'idle', { len: 1 }); break; }
            a.food.taken = c;
            face2(c, a.food.x);
            if (a.food.kind === c.dislikes) { say(c, w, 'yuck', 'blegh'); c.eyes = 'squeeze'; setTimeout(() => (c.eyes = 'open'), 900); a.food.taken = null; a.food.snubbed = (a.food.snubbed || []).concat(c.id); act(c, 'idle', { len: 2 }); c.tummy = Math.min(c.tummy, 79); break; }
            act(c, 'eat', { food: a.food, len: 2.4, bites: 0 });
            c.mouth = 'munch';
            break;
          }
          if (a.then === 'splash') { w.splash(c, 1); c.clean = Math.min(100, c.clean + 40); c.wet = 1; if (c.trait === 'splashy') { c.joy += 15; happyHop(c, w); } else act(c, 'shake', { len: 0.9 }); break; }
          if (a.type === 'flee') { a.x = 0; break; }
          if (a.type === 'tag') break;
          act(c, 'idle', { len: rnd(1, 3) });
        }
        break;
      }
      case 'nap':
        c.eyes = 'closed';
        if (chance(dt * 0.7)) w.puff('z', c);
        if (a.t > a.len || c.energy > 98 && a.t > 4) { act(c, 'stretch', { len: 1.8 }); }
        break;
      case 'stretch':
        a.k = a.t / a.len;
        c.mouth = a.k > 0.2 && a.k < 0.75 ? 'open' : 'smile';
        c.eyes = a.k > 0.2 && a.k < 0.75 ? 'squeeze' : 'open';
        if (a.t > a.len) { c.eyes = 'open'; act(c, 'idle', { len: 1 }); }
        break;
      case 'spin':
        c.spin = c.z > 0 ? -Math.min(1, a.t / 0.55) * Math.PI * 2 * (c.dir > 0 ? -1 : 1) : 0;
        if (a.t > a.len && c.z <= 0) { c.spin = 0; c.eyes = 'open'; act(c, 'idle', { len: 1 }); }
        break;
      case 'chat': {
        const o = a.other;
        if (o.act.type !== 'chat' || o.act.other !== c) { act(c, 'idle', { len: 1 }); break; }
        // get close enough to talk, then take turns
        const gap = WIDTH * 0.95 * (c.size + o.size) / 2;
        if (a.lead && Math.abs(c.x - o.x) > gap * 1.15 || a.lead && Math.abs(c.y - o.y) > 40) {
          step(c, o.x + (c.x < o.x ? -gap : gap), o.y, dt, 'hop', w);
          a.t = 0;
          break;
        }
        face2(c, o.x);
        const turn = Math.floor(a.t / 1.1);
        if (turn !== a.step) {
          a.step = turn;
          if (turn < 4 && (turn % 2 === 0) === a.lead) { say(c, w, turn < 2 ? a.lines[0] : a.lines[1]); c.mouth = 'open'; bounce(c, 0.5); setTimeout(() => (c.mouth = 'smile'), 300); }
        }
        if (a.t > a.len) { c.eyes = 'happy'; c.blush = 1; setTimeout(() => (c.eyes = 'open'), 900); act(c, 'idle', { len: rnd(1, 2) }); c.joy += 6; }
        break;
      }
      case 'eat': {
        const f = a.food;
        if (!w.foods.includes(f)) { act(c, 'idle', { len: 1 }); break; }
        const bite = Math.floor(a.t / 0.8);
        if (bite > a.bites) { a.bites = bite; f.left -= 1; bounce(c, 0.4); w.sound('munch', {}, c); w.puff('crumb', f); }
        if (a.t > a.len || f.left <= 0) {
          w.eat(f);
          c.tummy = Math.min(100, c.tummy + (f.kind === c.likes ? 45 : 32));
          c.joy = Math.min(100, c.joy + (f.kind === c.likes ? 18 : 8));
          c.mouth = 'smile';
          if (f.kind === c.likes) { happyHop(c, w); say(c, w, 'heart', 'mmm!'); w.news(`${c.name} loved that ${f.kind}.`); }
          else { act(c, 'idle', { len: 1.5 }); c.eyes = 'happy'; setTimeout(() => (c.eyes = 'open'), 900); }
        }
        break;
      }
      case 'pet':
        c.eyes = 'happy';
        c.blush = 1;
        if (a.t > a.len) { act(c, 'idle', { len: 1.2 }); c.eyes = 'open'; if (c.joy > 85 && chance(0.5)) happyHop(c, w); }
        break;
      case 'held':
        break;
      case 'fall':
        if (c.z <= 0) {
          if (a.from > 220) { act(c, 'dizzy', { len: 1.6 }); c.eyes = 'dizzy'; w.puff('stars', c); say(c, w, 'dizzy', 'wuh'); }
          else { act(c, 'idle', { len: 1 }); c.eyes = 'open'; }
        }
        break;
      case 'dizzy':
        c.lean = Math.sin(a.t * 9) * 0.12;
        if (a.t > a.len) { c.eyes = 'open'; c.lean = 0; act(c, 'idle', { len: 1 }); }
        break;
      case 'shake':
        c.lean = Math.sin(a.t * 40) * 0.18;
        c.eyes = 'squeeze';
        if (chance(dt * 30)) w.puff('drop', c);
        if (a.t > a.len) { c.wet = Math.max(0, c.wet - 0.7); c.lean = 0; c.eyes = 'open'; act(c, 'idle', { len: 1 }); }
        break;
      case 'hatch':
        if (a.t > a.len) { act(c, 'idle', { len: 1 }); }
        break;
    }
    // soap suds slowly slide off and pop
    if (c.soap.length && chance(dt * 0.4)) c.soap.shift();
    c.x = clamp(c.x, ground.left - 200, ground.right + 200);
  }

  // one step of getting somewhere. hop: a hop at a time; crawl: a ripple at a time; run: big quick hops.
  // true once it's there
  function step(c, tx, ty, dt, gait, w) {
    const dx = tx - c.x, dy = ty - c.y, far = Math.hypot(dx, dy);
    if (far < 8 && !c.hop) return true;
    face2(c, tx);
    const ground = w.ground(c.place);
    const s = depth(c, ground) * c.size * (WIDTH / FULL);
    if (gait === 'crawl') {
      const v = 46 * s;
      const k = Math.min(1, (v * dt) / far);
      c.x += dx * k; c.y += dy * k;
      c.wave = Math.min(9, c.wave + dt * 60);
      c.phase += dt * 9;
      c.leanTo = Math.sin(c.phase) * 0.03;
      return far < 8;
    }
    if (!c.hop) {
      const run = gait === 'run';
      const len = Math.min(far, (run ? 92 : 58) * s);
      const height = (run ? 46 : c.trait === 'bouncy' ? 60 : 30) * s;
      c.hop = { t: 0, dur: run ? 0.3 : 0.42, wait: run ? 0.04 : rnd(0.05, 0.22), fx: c.x, fy: c.y, tx: c.x + (dx / far) * len, ty: c.y + (dy / far) * len, h: height, up: false };
      c.sqv += 3;
    }
    const h = c.hop;
    h.t += dt;
    if (h.t < h.wait) return false;
    const p = Math.min(1, (h.t - h.wait) / h.dur);
    if (!h.up) { h.up = true; c.sqv -= 6; if (c.place === w.place && chance(0.15)) w.sound('hop', { rate: rnd(0.9, 1.25) / c.size, volume: 0.5 }, c); }
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    c.x = h.fx + (h.tx - h.fx) * e;
    c.y = h.fy + (h.ty - h.fy) * e;
    c.z = 4 * h.h * p * (1 - p);
    c.leanTo = (0.5 - p) * 0.35;
    if (p >= 1) { c.z = 0; c.hop = null; c.sqv += 5; return Math.hypot(tx - c.x, ty - c.y) < 8; }
    return false;
  }


  // ---------- what the player does to them (page.js) ----------
  function boop(c, w) {
    face2(c, w.pointer ? w.pointer.x : c.x);
    if (c.act.type === 'nap') {
      act(c, 'idle', { len: 1.2 });
      c.eyes = 'wide';
      c.vz = 380; c.z = 0.01;
      say(c, w, 'exclaim', 'eep!');
      setTimeout(() => (c.eyes = 'open'), 700);
      w.news(`You woke ${c.name} up.`);
      return;
    }
    if (busy(c) && c.act.type !== 'pet') return;
    act(c, 'idle', { len: 1.5 });
    c.vz = 300; c.z = 0.01;
    bounce(c, 0.8);
    c.eyes = c.trait === 'shy' && c.joy < 60 ? 'wide' : 'happy';
    c.joy = Math.min(100, c.joy + 3);
    say(c, w, c.trait === 'shy' && c.joy < 60 ? 'dots' : pick(['heart', 'note', 'star']));
    setTimeout(() => (c.eyes = 'open'), 700);
  }
  function pet(c, w) {
    if (c.act.type === 'nap') { c.joy = Math.min(100, c.joy + 0.5); c.blush = 1; return; }
    if (['held', 'fall', 'eat', 'leave'].includes(c.act.type)) return;
    if (c.act.type !== 'pet') { act(c, 'pet', { len: 1 }); w.news(pick([`${c.name} is getting a pat.`, `${c.name} is purring.`, `${c.name} likes that.`])); }
    c.act.len = c.act.t + 0.9;
    c.joy = Math.min(100, c.joy + (c.trait === 'cuddly' ? 1.2 : 0.7));
    if (chance(0.12)) w.puff('heart', c);
  }
  function grab(c, w) {
    act(c, 'held');
    c.held = true;
    c.eyes = c.trait === 'cuddly' ? 'happy' : 'wide';
    say(c, w, c.trait === 'cuddly' ? 'heart' : 'exclaim', c.trait === 'cuddly' ? 'mrrp' : 'eep!');
    bounce(c, 1);
  }
  function drop(c, w) {
    c.held = false;
    act(c, 'fall', { from: c.z });
    c.vz = 0;
    if (c.z < 2) { c.z = 0; act(c, 'idle', { len: 1 }); c.eyes = 'open'; }
  }
  function splash(c, w, at) {
    c.wet = Math.min(1, c.wet + 0.05);
    if (c.soap.length) { c.soap.pop(); if (Math.random() < 0.5) w.puff('bubble', c); }
    if (c.soap.length === 0 && c.clean < 100 && c.wet > 0.3) {
      c.clean = Math.min(100, c.clean + 1.5);
      // the sparkle once per bath, not every drop after
      if (c.clean >= 100 && !c.sparkled) {
        c.sparkled = true; w.puff('sparkle', c); w.sound('clean', {}, c); w.news(`${c.name} is sparkling clean.`); }
    }
    if (busy(c) && c.act.type !== 'pet') return;
    if (c.trait === 'splashy') { if (c.act.type !== 'spin' && chance(0.05)) { happyHop(c, w); } return; }
    if (c.act.type === 'nap') { boop(c, w); return; }
    if (c.wet > 0.5 && c.act.type !== 'flee') {
      if (chance(0.5)) act(c, 'shake', { len: 0.8 });
      else { act(c, 'flee', { from: 'water', at, len: 3 }); say(c, w, 'rain', 'eep'); }
    }
  }
  function scrub(c, w, x, y) {
    // where on the drawing the pointer is, so the suds go where you scrubbed
    if (c.soap.length > 40) return;
    const ground = w.ground(c.place);
    const b = bounds(c, ground);
    let px = ((x - b.x) / b.w) * ART.w, py = ((y - b.y) / b.h) * ART.h;
    if (c.turn > 0) px = ART.w - px;
    c.soap.push({ x: clamp(px, 40, 680), y: clamp(py, 30, 380), r: rnd(14, 30) });
    c.clean = Math.min(100, c.clean + 0.3);
    if (c.act.type !== 'pet' && !busy(c)) { act(c, 'pet', { len: 0.8 }); }
    if (c.act.type === 'pet') c.act.len = c.act.t + 0.6;
    c.eyes = 'happy';
    if (chance(0.15)) w.sound('pop', { rate: rnd(0.8, 1.4) }, c);
  }

  // how it's feeling, in words, for its card
  function doing(c) {
    const a = c.act.type;
    if (c.place === 'road') return `On the way to ${PLACES.byId[c.dest].says}`;
    if (a === 'nap') return 'Having a nap';
    if (a === 'eat') return 'Munching';
    if (a === 'chat') return `Chatting with ${c.act.other.name}`;
    if (a === 'tag') return `Chasing ${c.act.other.name}`;
    if (a === 'flee') return c.act.from === 'water' ? 'Running from the water' : 'Running away, giggling';
    if (a === 'held') return 'Being carried';
    if (a === 'pet') return 'Getting a pat';
    if (a === 'leave') return `Off to ${PLACES.byId[c.act.to].says}`;
    if (a === 'dizzy') return 'A bit dizzy';
    if (a === 'walk' && c.act.chasing === 'food') return 'Going for a snack';
    if (a === 'walk' && c.act.chasing === 'ball') return 'After the ball';
    if (c.tummy < 25) return 'Peckish';
    if (c.energy < 25) return 'Sleepy';
    if (c.clean < 25) return 'Could do with a bath';
    return pick(['Pottering about', 'Having a look round', 'Just wiggling', 'Thinking about leaves']);
  }

  return {
    ART, fit, CRAYONS, PATTERNS, HATS, FACES, BACKS, EYES, MOUTHS, CHEEKS, WHISKERS, PENCILS, FOODS, TRAITS, NAMES,
    load, paint, starters, make, restore, save, repaint, randomLook, ink,
    draw, shadow, portrait, bounds, depth, scaleOf, update, act, say, walkTo, boop, pet, grab, drop, splash, scrub, doing, happyHop, busy,
  };
})();
