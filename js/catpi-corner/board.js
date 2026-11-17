// catpi corner's notice board, under the stage: notes people leave, a different handful every visit.
//
// leave a note: a square of sticky paper you draw on in crayon, with stickers, words and your own catpis stuck
// on top (notes.js says what a note is). it goes to the server and waits there until a mod pins it up, and you
// see it on the board meanwhile, marked as waiting (the note's number is kept in this browser to ask after it).
//
// mods look after the board on the site's mod page (mod.html). a mod who's signed in there can also open any
// note here and archive it (off the board, kept to put back up from the mod page) or remove it for good.
// every note is drawn by art.js from what's in it.
(() => {
  const C = Crayon, N = CatpiNotes, S = N.SIZE;
  const { INK, WIDTHS, stickerPic, catpiPic, catpiBit, drawNote, noteCanvas, describe, hit } = Art;
  const $ = (s) => document.querySelector(s);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const tap = (rate = 1.3) => Sfx.play('tap', { rate });
  const SERVER = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://127.0.0.1:8787' : 'https://portfolio-server.portfolio-server.workers.dev';
  const store = {
    get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { } },
  };

  // ---------- the board ----------
  const cork = $('#ccCork');
  const boardSay = $('#ccBoardSay');
  const PINS = ['#f2625a', '#4f8fe8', '#ffd84f', '#20b974', '#e45a84', '#9467df'];
  // the notes you've sent that haven't been looked at yet: [{ id, note }]
  let mine = store.get('catpiBoardMine', []).filter((m) => m && Number.isInteger(m.id) && N.clean(m.note));
  let shown = [];
  const keepMine = () => store.set('catpiBoardMine', mine);

  function pinned(n, waiting) {
    const li = document.createElement('li');
    li.className = 'cc-pinned' + (waiting ? ' is-waiting' : '');
    li.style.setProperty('--r', `${rnd(-5, 5).toFixed(1)}deg`);
    li.style.setProperty('--pin', PINS[Math.floor(Math.random() * PINS.length)]);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cc-pinned-look';
    b.setAttribute('aria-label', (waiting ? 'Your note, waiting for a mod. ' : '') + describe(n.note) + ' Look closer.');
    b.append(noteCanvas(n.note, 440, n.id));
    b.addEventListener('click', () => lookAt(n, li));
    li.append(b);
    if (waiting) {
      const tag = document.createElement('span');
      tag.className = 'cc-pinned-wait';
      tag.textContent = 'waiting for a mod';
      li.append(tag);
    }
    return li;
  }
  function show() {
    cork.replaceChildren(...mine.map((n) => pinned(n, true)), ...shown.map((n) => pinned(n, false)));
    cork.classList.toggle('is-empty', !cork.children.length);
  }
  async function fill() {
    boardSay.textContent = '';
    const shuffle = $('#ccShuffle');
    shuffle.disabled = true;
    try {
      const r = await fetch(`${SERVER}/board?mine=${mine.map((m) => m.id).join(',')}`);
      if (!r.ok) throw new Error();
      const data = await r.json();
      // yours that have been pinned up go first this once; binned ones quietly go
      const up = mine.filter((m) => data.mine[m.id] === 'pinned');
      mine = mine.filter((m) => data.mine[m.id] === 'waiting');
      keepMine();
      shown = [...up, ...data.notes.filter((n) => !up.some((u) => u.id === n.id))].filter((n) => (n.note = N.clean(n.note)));
      if (up.length) CornerPage.news(up.length > 1 ? 'Your notes are up on the board!' : 'Your note is up on the board!', true);
      if (!shown.length && !mine.length) boardSay.textContent = 'Nothing pinned up yet. Leave the first note!';
    } catch {
      boardSay.textContent = "The board can't be reached right now. Try again in a bit.";
    }
    shuffle.disabled = false;
    show();
  }
  $('#ccShuffle').addEventListener('click', () => { tap(); fill(); });

  // looking closer at one note
  const look = $('#ccLook');
  // mods signed in on this browser get buttons for the note they're looking at
  const MOD_KEY = 'siteModKey';
  const modKey = store.get(MOD_KEY, null);
  let canMod = false, looking = null;
  function lookAt(n, li) {
    looking = { n, li };
    const pad = $('#ccLookPic');
    const g = pad.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, pad.width, pad.height);
    g.setTransform(pad.width / S, 0, 0, pad.width / S, 0, 0);
    drawNote(g, n.note, n.id);
    $('#ccLookSays').textContent = describe(n.note);
    $('#ccLookMod').hidden = !canMod || !!li?.classList.contains('is-waiting');
    $('#ccLookModSay').textContent = '';
    tap(1.1);
    look.showModal();
  }
  async function modDo(what) {
    if (!looking) return;
    if (what === 'bin' && !confirm("Remove this note for good? It can't be put back.")) return;
    const { n, li } = looking;
    try {
      const r = await fetch(`${SERVER}/board/mod`, { method: 'POST', headers: { Authorization: `Bearer ${modKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ do: what, id: n.id }) });
      if (!r.ok) throw new Error();
      shown = shown.filter((o) => o !== n);
      li?.remove();
      look.close();
      CornerPage.news(what === 'bin' ? 'Note removed.' : 'Note archived. It can go back up from the mod page.', true);
      tap(0.8);
    } catch {
      $('#ccLookModSay').textContent = "That didn't work. Check you're still a mod on the mod page.";
    }
  }
  $('#ccLookArchive').addEventListener('click', () => modDo('archive'));
  $('#ccLookBin').addEventListener('click', () => modDo('bin'));
  $('#ccLookClose').addEventListener('click', () => look.close());
  look.addEventListener('click', (e) => { if (e.target === look) look.close(); });

  // ---------- leaving a note ----------
  const write = $('#ccWrite');
  const pad = $('#ccPad');
  const pg = pad.getContext('2d');
  const writeSay = $('#ccWriteSay');
  const say = (text) => { writeSay.textContent = text; };
  const blank = () => ({ paper: 'butter', bits: [] });
  let note = blank(), undos = [], held = null, crayon = INK, width = 2, line = null, drag = null;
  const INKS = ['pencil', 'cherry', 'tangerine', 'butter', 'leaf', 'fern', 'teal', 'sky', 'puddle', 'navy', 'grape', 'lilac', 'bubblegum', 'raspberry', 'cocoa', 'pebble', 'snow'];
  const inkOf = (name) => (name === 'pencil' ? INK : Catpis.CRAYONS[name]);

  function redraw() {
    pg.setTransform(1, 0, 0, 1, 0, 0);
    pg.clearRect(0, 0, pad.width, pad.height);
    pg.setTransform(pad.width / S, 0, 0, pad.width / S, 0, 0);
    drawNote(pg, note, 3, held);
    for (const b of document.querySelectorAll('#ccHeld button')) b.disabled = !held;
    $('#ccUndo').disabled = !undos.length;
    for (const b of document.querySelectorAll('#ccPapers button')) b.setAttribute('aria-pressed', b.dataset.value === note.paper);
  }
  // before each change, so it can be undone
  const remember = () => { undos.push(JSON.stringify(note)); if (undos.length > 60) undos.shift(); };
  const things = () => note.bits.filter((b) => b.k !== 'line').length;
  const points = () => note.bits.reduce((n, b) => n + (b.k === 'line' ? b.p.length / 2 : 0), 0);

  function stick(bit) {
    if (things() >= N.MAX.things) { say(`That's ${N.MAX.things} things stuck on already. Take one off first.`); return; }
    remember();
    held = { ...bit, x: Math.round(S / 2 + rnd(-70, 70)), y: Math.round(S / 2 + rnd(-70, 70)), r: Math.round(rnd(-12, 12)), z: bit.z || 100 };
    note.bits.push(held);
    say('');
    Sfx.play('pop', { rate: rnd(1, 1.3) });
    redraw();
  }

  const padAt = (e) => {
    const r = pad.getBoundingClientRect();
    return [Math.round(clamp(((e.clientX - r.left) / r.width) * S, 0, S)), Math.round(clamp(((e.clientY - r.top) / r.height) * S, 0, S))];
  };
  const thingAt = (x, y) => [...note.bits].reverse().find((b) => b.k !== 'line' && hit(b, x, y));
  pad.addEventListener('pointerdown', (e) => {
    pad.setPointerCapture(e.pointerId);
    const [x, y] = padAt(e);
    const top = thingAt(x, y);
    if (top) {
      held = top;
      drag = { dx: x - top.x, dy: y - top.y, before: JSON.stringify(note), moved: false };
      tap(1.5);
    } else {
      held = null;
      if (points() >= N.MAX.points || note.bits.length - things() >= N.MAX.lines) { say('This note is full of crayon. Undo some, or send it as it is.'); redraw(); return; }
      remember();
      line = { k: 'line', c: crayon, w: width, p: [x, y] };
      note.bits.push(line);
    }
    redraw();
  });
  pad.addEventListener('pointermove', (e) => {
    const [x, y] = padAt(e);
    if (drag) {
      if (!drag.moved) { undos.push(drag.before); drag.moved = true; }
      held.x = clamp(x - drag.dx, 0, S);
      held.y = clamp(y - drag.dy, 0, S);
      redraw();
    } else if (line) {
      const n = line.p.length;
      if (Math.hypot(x - line.p[n - 2], y - line.p[n - 1]) < 3 || points() >= N.MAX.points) return;
      // a long line carries on as a new one, so no one line gets enormous
      if (n >= 600) { line = { ...line, p: [line.p[n - 2], line.p[n - 1]] }; note.bits.push(line); }
      line.p.push(x, y);
      redraw();
    } else pad.style.cursor = thingAt(x, y) ? 'grab' : '';
  });
  const letGo = () => { line = null; drag = null; };
  pad.addEventListener('pointerup', letGo);
  pad.addEventListener('pointercancel', letGo);

  // the held thing's buttons, and the same from the keyboard on the note
  const HELD = {
    smaller: (b) => { b.z = Math.max(30, Math.round(b.z / 1.2)); },
    bigger: (b) => { b.z = Math.min(300, Math.round(b.z * 1.2)); },
    left: (b) => { b.r = ((b.r - 15 + 540) % 360) - 180; },
    right: (b) => { b.r = ((b.r + 15 + 540) % 360) - 180; },
    front: (b) => { note.bits.splice(note.bits.indexOf(b), 1); note.bits.push(b); },
    off: (b) => { note.bits.splice(note.bits.indexOf(b), 1); held = null; },
  };
  function change(what) {
    if (!held) return;
    remember();
    HELD[what](held);
    tap(what === 'off' ? 0.8 : 1.4);
    redraw();
  }
  for (const b of document.querySelectorAll('#ccHeld button')) b.addEventListener('click', () => change(b.dataset.do));
  pad.addEventListener('keydown', (e) => {
    if (!held) return;
    const step = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[e.key];
    const what = { '+': 'bigger', '=': 'bigger', '-': 'smaller', '[': 'left', ']': 'right', Delete: 'off', Backspace: 'off' }[e.key];
    if (!step && !what) return;
    e.preventDefault();
    if (what) return change(what);
    remember();
    held.x = clamp(held.x + step[0], 0, S);
    held.y = clamp(held.y + step[1], 0, S);
    redraw();
  });
  $('#ccUndo').addEventListener('click', () => {
    if (!undos.length) return;
    note = JSON.parse(undos.pop());
    held = null;
    tap(0.9);
    redraw();
  });
  $('#ccWipe').addEventListener('click', () => {
    if (!note.bits.length) return;
    remember();
    note.bits = [];
    held = null;
    say('Wiped clean. Undo brings it back.');
    tap(0.8);
    redraw();
  });

  // the trays down the side
  function button(cls, label, pic, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    if (pic) { const img = pic instanceof HTMLCanvasElement ? pic : new Image(); if (!(pic instanceof HTMLCanvasElement)) img.src = pic; img.alt = ''; b.append(img); }
    const span = document.createElement('span');
    span.textContent = label;
    b.append(span);
    b.addEventListener('click', onClick);
    return b;
  }
  function trays() {
    $('#ccPapers').replaceChildren(...Object.entries(N.PAPERS).map(([name, colour]) => {
      const b = button('cc-chip cc-paper', name, null, () => { remember(); note.paper = name; tap(); redraw(); });
      b.dataset.value = name;
      b.style.setProperty('--dot', colour);
      return b;
    }));
    $('#ccInks').replaceChildren(...INKS.map((name) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cc-crayon';
      b.style.setProperty('--c', inkOf(name));
      b.title = name[0].toUpperCase() + name.slice(1);
      b.setAttribute('aria-label', b.title);
      b.setAttribute('aria-pressed', inkOf(name) === crayon);
      b.addEventListener('click', () => {
        crayon = inkOf(name);
        for (const o of $('#ccInks').children) o.setAttribute('aria-pressed', o === b);
        tap();
      });
      return b;
    }));
    $('#ccWidths').replaceChildren(...['thin', 'middle', 'thick'].map((label, i) => {
      const b = button('cc-chip cc-width', label, null, () => {
        width = i + 1;
        for (const o of $('#ccWidths').children) o.setAttribute('aria-pressed', o === b);
        tap();
      });
      b.style.setProperty('--w', `${WIDTHS[i + 1] * 0.9}px`);
      b.setAttribute('aria-pressed', i + 1 === width);
      return b;
    }));
    $('#ccStickers').replaceChildren(...N.STICKERS.map((s) => {
      const b = button('cc-sticker', s, stickerPic(s).toDataURL(), () => stick({ k: 'sticker', s }));
      b.title = s[0].toUpperCase() + s.slice(1);
      return b;
    }));
  }
  // your catpis, fresh each time the note opens since they come and go
  function catpiTray() {
    const yours = CornerPage.catpis();
    $('#ccNoCatpis').hidden = yours.length > 0;
    $('#ccMyCatpis').replaceChildren(...yours.map((c) => {
      const bit = catpiBit(c);
      const { c: pic, g } = C.sheet(120, 90, 1);
      g.drawImage(catpiPic(bit), 40, 40, 280, 210, 0, 0, 120, 90);
      return button('cc-catpi-pick', c.name, pic, () => stick({ ...bit, z: 100 }));
    }));
  }
  const wordsIn = $('#ccWords');
  function addWords() {
    const t = N.words(wordsIn.value).slice(0, N.MAX.letters);
    if (!t) { wordsIn.focus(); return; }
    if (note.bits.filter((b) => b.k === 'words').length >= N.MAX.words) { say(`${N.MAX.words} lots of words is the most a note can hold.`); return; }
    stick({ k: 'words', t, c: crayon });
    wordsIn.value = '';
  }
  $('#ccWordsGo').addEventListener('click', addWords);
  wordsIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addWords(); } });

  $('#ccWriteOpen').addEventListener('click', () => {
    catpiTray();
    say('');
    held = null;
    redraw();
    tap(1.1);
    write.showModal();
    $('.cc-write .cc-hatch-main').scrollTop = 0;
  });
  $('#ccWriteCancel').addEventListener('click', () => write.close());
  write.addEventListener('close', () => { held = null; letGo(); });

  $('#ccWriteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const clean = N.clean(note);
    if (!clean) { say(note.bits.length ? "Something on this note won't go. Try taking the last thing off." : 'Put something on your note first.'); return; }
    const go = $('#ccWriteGo');
    go.disabled = true;
    say('Pinning...');
    try {
      const r = await fetch(`${SERVER}/board`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clean) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { say(body.error ? body.error[0].toUpperCase() + body.error.slice(1) + '.' : "That didn't work. Try again in a bit."); return; }
      mine.unshift({ id: body.id, note: clean });
      keepMine();
      note = blank();
      undos = [];
      write.close();
      show();
      boardSay.textContent = '';
      Sfx.play('chime');
      CornerPage.news('Your note is waiting for a mod to pin it up.', true);
      cork.firstElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch {
      say("Couldn't reach the board. Try again in a bit.");
    } finally {
      go.disabled = false;
    }
  });

  // ---------- are you a mod? ----------
  async function checkMod() {
    if (!modKey) return;
    $('#ccModOpen').hidden = false;
    try {
      const r = await fetch(`${SERVER}/mod`, { headers: { Authorization: `Bearer ${modKey}` } });
      const d = r.ok ? await r.json() : null;
      canMod = !!d && (d.you.owner || d.you.projects.includes('catpi-board'));
    } catch { }
  }

  CornerPage.ready.then(() => {
    trays();
    fill();
    checkMod();
  });
})();
