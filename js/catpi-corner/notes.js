// the notes on catpi corner's notice board, and the one check every note goes through. the page uses it before
// sending a note and before drawing one, and the server (server/src/board.js) uses it on everything it's sent,
// so a note that gets onto the board is always one of these, however it was made.
//
// a note is a square of paper 400 across, with things on it drawn in order, so later ones go on top:
//   { paper: 'butter', bits: [
//       { k: 'line', c: '#f2625a', w: 1, p: [x, y, x, y, ...] },      a crayon line, w is 1 to 3 (thin to thick)
//       { k: 'sticker', s: 'star', x, y, r, z },                      r is a turn in degrees, z a size, 30 to 300
//       { k: 'words', t: 'hello!', c: '#3a3034', x, y, r, z },
//       { k: 'catpi', look: { body, accent, ... }, hat, face, back, x, y, r, z } ] }
// a catpi's look is only checked for being short and plain here; the page checks each part against what catpis
// can wear before painting one (board.js)
const CatpiNotes = (() => {
  const SIZE = 400;
  const PAPERS = { butter: '#ffe98a', bubblegum: '#ffc4dc', sky: '#c4e4ff', mint: '#cff3c9', peach: '#ffd8b8', lilac: '#e6d6ff', snow: '#fffdf6' };
  const STICKERS = ['star', 'heart', 'flower', 'plant', 'lightning', 'thumbs up', 'thumbs down', 'smile', 'sad', 'laugh', 'love', 'sun', 'moon', 'rainbow', 'cloud', 'music', 'paw', 'leaf', 'berry', 'fish', 'cake'];
  const LOOK = ['body', 'accent', 'pattern', 'dot', 'eyes', 'mouth', 'cheeks', 'whiskers', 'lines'];
  // how much one note can hold. a busy drawing is still only a few kb
  const MAX = { lines: 150, points: 4000, things: 16, words: 6, letters: 60, bytes: 24000 };

  const HEX = /^#[0-9a-f]{6}$/i;
  const PLAIN = /^[a-z][a-z -]{0,19}$/;
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  // plain text on one line: no control characters, line breaks or invisible ones (like the ones that flip text
  // backwards). it's only ever drawn on a canvas
  const words = (t) => (typeof t === 'string' ? t.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '').trim() : '');

  // one bit of a note, cleaned down to just the parts above, or null if anything about it is wrong
  function bit(b) {
    if (!b || typeof b !== 'object') return null;
    if (b.k === 'line') {
      if (!HEX.test(b.c) || !int(b.w, 1, 3) || !Array.isArray(b.p) || b.p.length < 2 || b.p.length % 2) return null;
      return b.p.every((v) => int(v, 0, SIZE)) ? { k: 'line', c: b.c.toLowerCase(), w: b.w, p: b.p.slice() } : null;
    }
    if (!int(b.x, 0, SIZE) || !int(b.y, 0, SIZE) || !int(b.r, -180, 180) || !int(b.z, 30, 300)) return null;
    const at = { x: b.x, y: b.y, r: b.r, z: b.z };
    if (b.k === 'sticker') return STICKERS.includes(b.s) ? { k: 'sticker', s: b.s, ...at } : null;
    if (b.k === 'words') {
      const t = words(b.t);
      return t && t.length <= MAX.letters && HEX.test(b.c) ? { k: 'words', t, c: b.c.toLowerCase(), ...at } : null;
    }
    if (b.k === 'catpi') {
      const look = {};
      for (const key of LOOK) {
        const v = b.look && b.look[key];
        if (typeof v !== 'string' || !(PLAIN.test(v) || HEX.test(v))) return null;
        look[key] = v;
      }
      if (![b.hat, b.face, b.back].every((v) => typeof v === 'string' && PLAIN.test(v))) return null;
      return { k: 'catpi', look, hat: b.hat, face: b.face, back: b.back, ...at };
    }
    return null;
  }

  // the whole note, or null
  function clean(note) {
    if (!note || typeof note !== 'object' || !own(PAPERS, note.paper) || !Array.isArray(note.bits)) return null;
    if (!note.bits.length || note.bits.length > MAX.lines + MAX.things) return null;
    const bits = note.bits.map(bit);
    if (bits.includes(null)) return null;
    const count = (k) => bits.filter((b) => b.k === k).length;
    if (count('line') > MAX.lines || bits.length - count('line') > MAX.things || count('words') > MAX.words) return null;
    if (bits.reduce((n, b) => n + (b.k === 'line' ? b.p.length / 2 : 0), 0) > MAX.points) return null;
    const out = { paper: note.paper, bits };
    return JSON.stringify(out).length > MAX.bytes ? null : out;
  }

  return { SIZE, PAPERS, STICKERS, MAX, clean, words };
})();

if (typeof module !== 'undefined') module.exports = CatpiNotes;
