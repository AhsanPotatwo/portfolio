// catpi corner's little pictures, and the notes on its notice board. everything here is drawn with crayon.js:
// the page's icons (food, balls, the cursor's tools, what catpis say in bubbles), the stickers people put on
// notes, catpis as stickers, and whole notes (notes.js says what one is), the same on the board, in the note
// editor and on the mod page (mod.html), which loads this without the rest of the corner.
const Art = (() => {
  const C = Crayon, N = CatpiNotes, S = N.SIZE;
  const INK = '#3a3034';

  // an icon drawn in a box from -40 to 40
  function icon(p, name) {
    const heart = (fill) => C.shape(p, [[0, 30], [-26, 6], [-30, -10], [-22, -24], [-8, -24], [0, -12], [8, -24], [22, -24], [30, -10], [26, 6]], fill, { shade: '#e5466e', width: 3 });
    switch (name) {
      case 'leaf':
        C.shape(p, [[-30, 26], [-26, -6], [-6, -26], [26, -30], [24, 0], [6, 22]], '#8fd660', { shade: '#5fa83e', width: 3 });
        C.stroke(p, [[-30, 28], [-8, 4], [18, -20]], '#4e8a33', 3);
        break;
      case 'berry':
        // a strawberry: seeds sitting in little dips, a ruff of leaves on top and its stalk
        C.shape(p, [[0, 30], [-22, 6], [-24, -12], [-12, -20], [0, -18], [12, -20], [24, -12], [22, 6]], '#f2554f', { shade: '#c9322f', width: 3 });
        for (const [x, y] of [[-12, -6], [0, -9], [12, -6], [-7, 5], [7, 5], [-1, 16], [-12, 16]]) {
          C.shape(p, C.blob(x, y, 1.6, 2.6, 0.05, 8), '#ffe680', { outline: false });
          C.stroke(p, [[x - 2, y + 3], [x + 2, y + 3]], '#c9322f', 1.2, 0.7);
        }
        C.shape(p, Array.from({ length: 10 }, (_, i) => { const a = Math.PI * (1.05 + (i / 9) * 0.9), r = i % 2 ? 9 : 19; return [Math.cos(a) * r, -17 + Math.sin(a) * r * 0.55]; }).concat([[8, -14], [0, -12], [-8, -14]]), '#6dbb53', { shade: '#4e9a3a', width: 2.5 });
        C.stroke(p, [[0, -20], [2, -30]], '#4e8a33', 3);
        break;
      case 'fish':
        C.shape(p, [[-30, 0], [-12, -16], [12, -14], [22, -4], [36, -16], [34, 14], [22, 4], [12, 14], [-12, 16]], '#8fb8d8', { shade: '#5f8fb8', width: 3 });
        p.fillStyle = INK; p.beginPath(); p.arc(-16, -3, 3.5, 0, 7); p.fill();
        C.stroke(p, [[-4, -10], [0, 0], [-4, 10]], '#5f8fb8', 2.5);
        break;
      case 'cake': {
        // a slice on a plate, its point to the left: the cut side shows sponge, jam and cream, the crust end
        // is in shadow, pink icing on top runs over the edge, and a strawberry sits on a blob of cream
        C.shape(p, C.blob(0, 22, 37, 9, 0.03, 18), '#fff7ea', { shade: '#d6e6ef', width: 2.5 });
        C.shape(p, [[28, -2], [18, -20], [18, 2], [28, 20]], '#e6b86a', { shade: '#c99540', width: 3, sharp: true });
        C.shape(p, [[-31, 0], [28, -2], [28, 20], [-31, 18]], '#ffe3a8', { shade: '#f2c879', width: 3, sharp: true });
        p.save();
        C.trace(p, [[-31, 0], [28, -2], [28, 20], [-31, 18]], true, true);
        p.clip();
        C.shape(p, [[-34, 7], [31, 6], [31, 10], [-34, 11]], '#e5466e', { outline: false, sharp: true });
        C.shape(p, [[-34, 11], [31, 10], [31, 13], [-34, 14]], '#ffffff', { outline: false, sharp: true });
        p.restore();
        C.shape(p, [[-31, 0], [18, -20], [28, -2], [24, 4], [20, 0], [15, 6], [9, 0], [2, 3], [-6, 0], [-12, 5], [-18, 1], [-26, 3]], '#ff9fbf', { shade: '#ef6f9c', width: 2.5 });
        C.shape(p, C.blob(14, -12, 8, 4, 0.08, 10), '#ffffff', { width: 2 });
        C.shape(p, [[14, -28], [7, -20], [10, -14], [18, -14], [21, -20]], '#e5383b', { shade: '#b8252a', width: 2 });
        C.stroke(p, [[11, -28], [14, -31], [17, -28]], '#4e9a3a', 2.5);
        for (const [x, y] of [[12, -21], [16, -18]]) C.shape(p, C.blob(x, y, 1, 1.6, 0.05, 6), '#ffe680', { outline: false });
        break;
      }
      case 'ball':
        C.shape(p, C.blob(0, 0, 30, 30, 0.03), '#ffd84f', { shade: '#f2a516', width: 3 });
        C.stroke(p, [[-28, -8], [-6, -2], [10, 6], [28, 12]], '#e5383b', 7);
        C.stroke(p, [[-14, -22], [-6, -26]], '#ffffff', 4);
        break;
      case 'heart': heart('#ff7f9e'); break;
      case 'note':
        // two quavers joined by a beam: straight stems, a thick beam, heads tipped over
        C.shape(p, [[-10, -22], [23, -31], [23, -23], [-10, -14]], INK, { outline: false, sharp: true });
        C.stroke(p, [[-9, -18], [-9, 20]], INK, 4);
        C.stroke(p, [[22, -27], [22, 12]], INK, 4);
        for (const [x, y] of [[-16, 21], [15, 13]]) {
          p.save(); p.translate(x, y); p.rotate(-0.45);
          C.shape(p, C.blob(0, 0, 9.5, 6.5, 0.05, 14), INK, { outline: false });
          p.restore();
        }
        break;
      case 'star':
        C.shape(p, Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 13 : 30; return [Math.cos(a) * r, Math.sin(a) * r]; }), '#ffd84f', { shade: '#f2a516', width: 3 });
        break;
      case 'sun':
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; C.stroke(p, [[Math.cos(a) * 22, Math.sin(a) * 22], [Math.cos(a) * 34, Math.sin(a) * 34]], '#f2a516', 4); }
        C.shape(p, C.blob(0, 0, 17, 17, 0.05), '#ffd84f', { shade: '#f2a516', width: 3 });
        break;
      case 'moon':
        C.shape(p, [[6, -28], [-14, -20], [-22, 0], [-14, 20], [6, 28], [22, 22], [6, 14], [-2, 0], [6, -14], [22, -22]], '#fff0a8', { shade: '#efcf5a', width: 3 });
        break;
      case 'flower':
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; C.shape(p, C.blob(Math.cos(a) * 16, Math.sin(a) * 16, 12, 12, 0.1, 10), '#c59cf4', { width: 2.5 }); }
        C.shape(p, C.blob(0, 0, 10, 10, 0.1, 10), '#ffd84f', { width: 2.5 });
        break;
      case 'rain':
        for (const [x, y] of [[-14, -10], [12, -18], [2, 12]]) C.shape(p, [[x, y - 14], [x - 8, y + 2], [x, y + 9], [x + 8, y + 2]], '#8fc8f2', { shade: '#4f9fe0', width: 2.5 });
        break;
      case 'question':
        p.font = '700 64px Gaegu, sans-serif'; p.textAlign = 'center'; p.textBaseline = 'middle'; p.fillStyle = INK; p.fillText('?', 0, 4);
        break;
      case 'exclaim':
        p.font = '700 64px Gaegu, sans-serif'; p.textAlign = 'center'; p.textBaseline = 'middle'; p.fillStyle = '#e5383b'; p.fillText('!', 0, 4);
        break;
      case 'dots':
        for (const x of [-18, 0, 18]) { p.fillStyle = INK; p.beginPath(); p.arc(x, 4, 5, 0, 7); p.fill(); }
        break;
      case 'yuck':
        C.stroke(p, [[-28, -6], [-18, -16], [-8, -4], [2, -16], [12, -4], [22, -16], [30, -6]], '#7aa83a', 5);
        C.stroke(p, [[-24, 14], [-12, 4], [0, 16], [12, 4], [24, 14]], '#7aa83a', 5);
        break;
      case 'dizzy':
        C.stroke(p, Array.from({ length: 24 }, (_, i) => { const a = i * 0.55, r = 3 + i * 1.2; return [Math.cos(a) * r, Math.sin(a) * r]; }), INK, 3.5);
        break;
      // the cursor's tools
      case 'hand': {
        // a little open hand, fingers spread: thick round lines for the fingers and thumb on a round palm
        const fingers = [[-17, 4, -20, -22], [-6, 2, -6, -31], [6, 2, 6, -29], [17, 4, 19, -19], [-19, 18, -33, 0]];
        const line = (x1, y1, x2, y2, w, colour) => { p.strokeStyle = colour; p.lineWidth = w; p.lineCap = 'round'; p.beginPath(); p.moveTo(x1, y1); p.lineTo(x2, y2); p.stroke(); };
        // drawn a little smaller and nudged to the middle so the fingertips don't touch the picture's edge
        p.save(); p.translate(4, 0); p.scale(0.84, 0.84);
        const palm = C.blob(0, 15, 23, 20, 0.03, 18);
        for (const [x1, y1, x2, y2] of fingers) line(x1, y1, x2, y2, 17, INK);
        p.strokeStyle = INK; p.lineWidth = 6; C.trace(p, palm); p.stroke();
        for (const [x1, y1, x2, y2] of fingers) line(x1, y1, x2, y2, 11, '#ffdcbf');
        p.fillStyle = '#ffdcbf'; C.trace(p, palm); p.fill();
        C.scribble(p, C.blob(4, 22, 18, 11, 0.04), '#f5b48c', { angle: 0.4, gap: 5, width: 3, alpha: 0.6 });
        line(-8, 20, 4, 14, 2.5, '#d98d66');
        p.restore();
        break;
      }
      case 'can': {
        // a watering can: handle, body, a long spout with a sprinkler on the end
        const line = (pts, w, colour) => { p.strokeStyle = colour; p.lineWidth = w; p.lineCap = p.lineJoin = 'round'; C.trace(p, pts, false); p.stroke(); };
        p.save(); p.translate(-5, 1); p.scale(0.8, 0.8);
        const handle = [[-26, 0], [-24, -24], [-2, -26], [6, -4]];
        const spout = [[8, 16], [24, 0], [33, -14]];
        line(handle, 10, INK);
        line(spout, 12, INK);
        line(handle, 4, '#4f9fe0');
        const body = [[-30, -6], [12, -6], [16, 30], [-34, 30]];
        C.shape(p, body, '#7fc3e8', { shade: '#4f9fe0', angle: 1.4, gap: 6, sharp: true, width: 3.5 });
        line(spout, 6, '#7fc3e8');
        p.save(); p.translate(35, -17); p.rotate(-0.7);
        C.shape(p, C.blob(0, 0, 7, 11, 0.04, 14), '#4f9fe0', { width: 3 });
        for (const y of [-5, 0, 5]) { p.fillStyle = '#d6eefb'; p.beginPath(); p.arc(1, y, 1.6, 0, 7); p.fill(); }
        p.restore();
        p.strokeStyle = '#d6eefb'; p.lineWidth = 3; p.beginPath(); p.moveTo(-22, 2); p.lineTo(-22, 20); p.stroke();
        p.restore();
        break;
      }
      case 'soap':
        // a bar of soap seen a little from above, its top paler than its side, bubbles coming off it
        C.shape(p, [[-30, 4], [-26, -2], [26, -2], [30, 4], [30, 18], [26, 23], [-26, 23], [-30, 18]], '#f59ac0', { shade: '#e5749f', angle: 1.4, gap: 5, width: 3, sharp: true });
        C.shape(p, [[-30, 4], [-22, -10], [30, -10], [34, -4], [30, 4]].map(([x, y]) => [x - 2, y + 2]), '#ffc9e0', { shade: '#f59ac0', angle: 0.2, gap: 5, width: 3, sharp: true });
        C.stroke(p, [[-18, -3], [12, -3]], '#ffffff', 2.5, 0.8);
        for (const [x, y, r] of [[-14, -22, 7], [4, -29, 9], [21, -21, 5]]) {
          C.shape(p, C.blob(x, y, r, r, 0.03, 12), 'rgba(214, 238, 251, .55)', { line: '#7fb2cc', width: 2.2 });
          C.stroke(p, [[x - r * 0.5, y - r * 0.2], [x - r * 0.2, y - r * 0.55]], '#ffffff', 2);
        }
        break;
      case 'cocoon':
        C.shape(p, C.blob(0, 0, 22, 34, 0.06), '#f6e6c4', { shade: '#d9be8a', width: 3 });
        for (const y of [-18, -6, 6, 18]) C.stroke(p, [[-20, y], [20, y + 4]], '#c9a66b', 2.5);
        break;
      default: sticker(p, name);
    }
  }

  // ---------- the board's stickers, drawn in the same box ----------
  // some are the page's own icons under another name
  const FROM_PAGE = { star: 'star', heart: 'heart', flower: 'flower', sun: 'sun', moon: 'moon', music: 'note', leaf: 'leaf', berry: 'berry', fish: 'fish', cake: 'cake' };
  const SKIN = '#ffdcbf';
  function face(p) { C.shape(p, C.blob(0, 0, 32, 32, 0.03), '#ffd84f', { shade: '#f2a516', width: 3 }); }
  const eyes = (p) => { for (const x of [-11, 11]) { p.fillStyle = INK; p.beginPath(); p.arc(x, -8, 4, 0, 7); p.fill(); } };
  const heartAt = (p, x, y, s, fill) => C.shape(p, [[0, 30], [-26, 6], [-30, -10], [-22, -24], [-8, -24], [0, -12], [8, -24], [22, -24], [30, -10], [26, 6]].map(([a, b]) => [x + a * s, y + b * s]), fill, { width: 2 });
  // a fist with its thumb up: four fingers curled and stacked down the front, a thumb with its nail, a sleeve
  // round the wrist. outlines first, then the fills, so the parts read as one hand (the cloud's trick)
  function thumb(p) {
    const fist = C.box(-21, -6, 38, 36, 10, 0.8);
    const up = [[-20, 2], [-22, -22], [-18, -33], [-10, -36], [-4, -30], [-3, -2]];
    const fingers = [-6, 3, 12, 21].map((y, i) => C.box(3, y, i === 3 ? 18 : 23 - i, 9.5, 4.5, 0.4));
    const cuff = C.box(-27, 25, 34, 14, 3, 0.6);
    p.strokeStyle = INK; p.lineWidth = 6; p.lineJoin = 'round';
    for (const b of [cuff, fist, up, ...fingers]) { C.trace(p, b); p.stroke(); }
    p.fillStyle = SKIN;
    for (const b of [fist, up, ...fingers]) { C.trace(p, b); p.fill(); }
    C.scribble(p, fist, '#f5b48c', { angle: 0.5, gap: 5, width: 3, alpha: 0.5 });
    for (const f of fingers) C.pencil(p, f, { color: '#c9825a', width: 2, passes: 1, rough: 0.4 });
    C.stroke(p, [[-18, 4], [-6, 6]], '#c9825a', 2);
    C.shape(p, C.blob(-11, -29, 4, 5, 0.05, 10), '#fff0e4', { line: '#c9825a', width: 1.4 });
    C.shape(p, cuff, '#7fc3e8', { shade: '#4f9fe0', width: 3 });
    C.stroke(p, [[-24, 30], [4, 30]], '#4f9fe0', 2);
  }
  function sticker(p, name) {
    switch (name) {
      case 'plant':
        C.stroke(p, [[0, 6], [-1, -10], [0, -24]], '#4e8a33', 4);
        C.shape(p, [[-1, -10], [-14, -24], [-30, -22], [-20, -8]], '#8fd660', { shade: '#5fa83e', width: 2.5 });
        C.shape(p, [[0, -20], [12, -36], [30, -34], [18, -18]], '#8fd660', { shade: '#5fa83e', width: 2.5 });
        C.shape(p, C.poly([[-19, 10], [19, 10], [14, 37], [-14, 37]]), '#e5874f', { shade: '#b4532e', width: 3, sharp: true });
        C.shape(p, C.box(-24, 2, 48, 11, 3), '#f29a68', { width: 3, sharp: true });
        break;
      case 'lightning':
        C.shape(p, [[8, -37], [-22, 4], [-3, 4], [-12, 37], [23, -9], [4, -9], [16, -37]], '#ffd84f', { shade: '#f2a516', width: 3, sharp: true });
        break;
      case 'thumbs up': thumb(p); break;
      // the same hand turned over, so it's still a right hand
      case 'thumbs down': p.save(); p.rotate(Math.PI); thumb(p); p.restore(); break;
      case 'smile':
        face(p); eyes(p);
        C.stroke(p, [[-14, 7], [-8, 14], [0, 16], [8, 14], [14, 7]], INK, 3.5);
        break;
      case 'sad':
        face(p); eyes(p);
        C.stroke(p, [[-13, 19], [-7, 13], [0, 11], [7, 13], [13, 19]], INK, 3.5);
        C.shape(p, [[-17, -1], [-22, 9], [-17, 14], [-12, 9]], '#8fc8f2', { shade: '#4f9fe0', width: 2 });
        break;
      case 'laugh':
        face(p);
        C.stroke(p, [[-18, -5], [-12, -12], [-6, -5]], INK, 3.5);
        C.stroke(p, [[6, -5], [12, -12], [18, -5]], INK, 3.5);
        C.shape(p, [[-17, 3], [17, 3], [12, 15], [0, 21], [-12, 15]], '#a8323a', { width: 2.5 });
        C.shape(p, C.blob(0, 15, 7, 4, 0.05, 10), '#ff8fab', { outline: false });
        break;
      case 'love':
        face(p);
        heartAt(p, -12, -7, 0.32, '#e5466e');
        heartAt(p, 12, -7, 0.32, '#e5466e');
        C.stroke(p, [[-14, 9], [-8, 16], [0, 18], [8, 16], [14, 9]], INK, 3.5);
        break;
      case 'rainbow':
        ['#f2625a', '#ffa64d', '#ffe47e', '#a8ec44', '#a6d8ff', '#9467df'].forEach((colour, i) => {
          const r = 34 - i * 4.6;
          C.stroke(p, Array.from({ length: 15 }, (_, k) => { const a = Math.PI + (k / 14) * Math.PI; return [Math.cos(a) * r, 14 + Math.sin(a) * r]; }), colour, 5.5, 1);
        });
        for (const x of [-27, 27]) C.shape(p, C.blob(x, 17, 12, 8, 0.08, 12), '#ffffff', { shade: '#cfe3ef', width: 2.5 });
        break;
      case 'cloud': {
        // outlines first, then all the fills, so it reads as one puff
        const puffs = [C.blob(-16, 4, 16, 13, 0.05, 14), C.blob(3, -7, 18, 16, 0.05, 14), C.blob(20, 5, 14, 12, 0.05, 14), C.blob(0, 12, 28, 10, 0.04, 16)];
        p.strokeStyle = INK; p.lineWidth = 6; p.lineJoin = 'round';
        for (const b of puffs) { C.trace(p, b); p.stroke(); }
        p.fillStyle = '#ffffff';
        for (const b of puffs) { C.trace(p, b); p.fill(); }
        C.scribble(p, puffs[3], '#bfd9ea', { gap: 6, alpha: 0.6 });
        break;
      }
      case 'paw':
        C.shape(p, C.blob(0, 13, 18, 15, 0.05, 16), '#ff9fbf', { shade: '#ef6f9c', width: 3 });
        for (const [x, y] of [[-21, -6], [-8, -20], [8, -20], [21, -6]]) C.shape(p, C.blob(x, y, 7, 9, 0.06, 12), '#ff9fbf', { shade: '#ef6f9c', width: 2.5 });
        break;
    }
  }
  const stickerPics = {};
  function stickerPic(name) {
    if (stickerPics[name]) return stickerPics[name];
    const { c, g } = C.sheet(80, 80, 3);
    g.translate(40, 40);
    g.scale(0.92, 0.92);
    C.wobble(name.length * 31 + name.charCodeAt(0));
    icon(g, FROM_PAGE[name] || name);
    return (stickerPics[name] = c);
  }

  // ---------- catpis as stickers ----------
  // what's on a note is only known to be plain words (notes.js), so each part is checked against what a catpi
  // can really wear, and anything else is left plain
  const CW = 360, CH = 250, CATPI_MID = 172;
  const catpiPics = new Map();
  function catpiPic(b) {
    const key = JSON.stringify([b.look, b.hat, b.face, b.back]);
    if (catpiPics.has(key)) return catpiPics.get(key);
    const one = (v, list, d) => (list.includes(v) ? v : d);
    const colour = (v, d) => (Object.hasOwn(Catpis.CRAYONS, v) || /^#[0-9a-f]{6}$/i.test(v) ? v : d);
    const look = {
      body: colour(b.look.body, 'leaf'), accent: colour(b.look.accent, 'fern'), dot: colour(b.look.dot, 'snow'),
      pattern: one(b.look.pattern, Catpis.PATTERNS, 'plain'), eyes: one(b.look.eyes, Catpis.EYES, 'dots'),
      mouth: one(b.look.mouth, Catpis.MOUTHS, 'smile'), cheeks: one(b.look.cheeks, Catpis.CHEEKS, 'none'),
      whiskers: one(b.look.whiskers, Catpis.WHISKERS, 'none'), lines: one(b.look.lines, Object.keys(Catpis.PENCILS), 'pencil'),
    };
    const c = Catpis.restore({ name: '', look, hat: one(b.hat, Catpis.HATS, 'none'), face: one(b.face, Catpis.FACES, 'none'), back: one(b.back, Catpis.BACKS, 'none'), size: 1, seed: 7, place: 'farm' });
    c.dir = -1;
    const { c: pic, g } = C.sheet(CW, CH, 1);
    // a moment when they're on the ground, eyes open
    Catpis.portrait(g, c, CW, CH, Math.PI / 2.4);
    catpiPics.set(key, pic);
    return pic;
  }
  // a catpi from the corner, as a bit for a note
  const catpiBit = (c) => ({
    k: 'catpi', look: Object.fromEntries(['body', 'accent', 'pattern', 'dot', 'eyes', 'mouth', 'cheeks', 'whiskers', 'lines'].map((k) => [k, c.look[k] || (k === 'dot' ? c.look.accent : 'none')])),
    hat: c.hat || 'none', face: c.face || 'none', back: c.back || 'none',
  });

  // ---------- drawing a note ----------
  const WIDTHS = [0, 4, 8, 14];
  const measure = document.createElement('canvas').getContext('2d');
  const FONT = '700 34px Gaegu, "Comic Sans MS", sans-serif';
  // words wrap onto lines no wider than most of the note
  function wordLines(t) {
    measure.font = FONT;
    const lines = [];
    let now = '';
    for (const word of t.split(/\s+/)) {
      const next = now ? now + ' ' + word : word;
      if (now && measure.measureText(next).width > 300) { lines.push(now); now = word; } else now = next;
    }
    lines.push(now);
    return { lines, wide: Math.max(...lines.map((l) => measure.measureText(l).width)) };
  }
  // how far a stuck on thing reaches from its middle, before its size
  function reach(b) {
    if (b.k === 'sticker') return [38, 38];
    if (b.k === 'catpi') return [56, 36];
    const { lines, wide } = wordLines(b.t);
    return [wide / 2 + 6, lines.length * 18 + 4];
  }
  function hit(b, x, y) {
    const a = (-b.r * Math.PI) / 180, z = b.z / 100, dx = x - b.x, dy = y - b.y;
    const lx = (dx * Math.cos(a) - dy * Math.sin(a)) / z, ly = (dx * Math.sin(a) + dy * Math.cos(a)) / z;
    const [w, h] = reach(b);
    return Math.abs(lx) < w && Math.abs(ly) < h;
  }

  function drawBit(g, b) {
    if (b.k === 'line') {
      const pts = [];
      for (let i = 0; i < b.p.length; i += 2) pts.push([b.p[i], b.p[i + 1]]);
      if (pts.length === 1) pts.push([pts[0][0] + 0.5, pts[0][1] + 0.5]);
      const w = WIDTHS[b.w];
      // a crayon line: the colour, then a second waxier pass a hair off it
      C.stroke(g, pts, b.c, w, 0.92);
      C.stroke(g, pts, C.mix(b.c, INK, 0.15), w * 0.55, 0.45);
      return;
    }
    g.save();
    g.translate(b.x, b.y);
    g.rotate((b.r * Math.PI) / 180);
    const z = b.z / 100;
    g.scale(z, z);
    if (b.k === 'sticker') g.drawImage(stickerPic(b.s), -40, -40, 80, 80);
    // the catpi's middle on the spot, with room above for a hat
    else if (b.k === 'catpi') g.drawImage(catpiPic(b), -80, -CATPI_MID * 160 / CW, 160, 160 * CH / CW);
    else {
      const { lines } = wordLines(b.t);
      g.font = FONT;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = b.c;
      lines.forEach((l, i) => g.fillText(l, 0, (i - (lines.length - 1) / 2) * 36 + 2));
    }
    g.restore();
  }
  // a whole note on g, which is already scaled so the note is S across. held gets a dashed box round it
  function drawNote(g, note, seed = 1, held = null) {
    C.wobble(seed);
    const colour = N.PAPERS[note.paper];
    const sheet = C.box(6, 6, S - 12, S - 12, 6, 2.5);
    C.shape(g, sheet, colour, { shade: C.mix(colour, '#ffffff', 0.45), gap: 10, alpha: 0.5, width: 3, sharp: true });
    g.save();
    C.trace(g, sheet, true, true);
    g.clip();
    for (const b of note.bits) drawBit(g, b);
    g.restore();
    C.paper(g, S, S, 0.25);
    if (held) {
      const [w, h] = reach(held), z = held.z / 100;
      g.save();
      g.translate(held.x, held.y);
      g.rotate((held.r * Math.PI) / 180);
      g.setLineDash([7, 6]);
      g.lineWidth = 2;
      g.strokeStyle = INK;
      g.strokeRect(-w * z - 4, -h * z - 4, w * z * 2 + 8, h * z * 2 + 8);
      g.restore();
    }
  }
  // a note drawn into a new canvas, px across
  function noteCanvas(note, px, seed) {
    const { c, g } = C.sheet(S, S, px / S);
    drawNote(g, note, seed);
    c.setAttribute('aria-hidden', 'true');
    return c;
  }
  // what's on a note, in words, for people who can't see it
  function describe(note) {
    const parts = [];
    if (note.bits.some((b) => b.k === 'line')) parts.push('a crayon drawing');
    const stickers = [...new Set(note.bits.filter((b) => b.k === 'sticker').map((b) => b.s))];
    if (stickers.length) parts.push(`${stickers.length > 1 ? stickers.slice(0, -1).join(', ') + ' and ' + stickers.at(-1) : 'a ' + stickers[0]} sticker${stickers.length > 1 ? 's' : ''}`);
    const catpis = note.bits.filter((b) => b.k === 'catpi').length;
    if (catpis) parts.push(catpis > 1 ? `${catpis} catpis` : 'a catpi');
    const words = note.bits.filter((b) => b.k === 'words').map((b) => `"${b.t}"`);
    if (words.length) parts.push(`the words ${words.join(' and ')}`);
    const and = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts.at(-1) : parts[0];
    return `A note on ${note.paper} paper with ${and}.`;
  }

  return { INK, WIDTHS, icon, stickerPic, catpiPic, catpiBit, drawNote, noteCanvas, describe, hit };
})();
