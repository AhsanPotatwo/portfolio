// the notice board and the site's mods through the server: a note waits until a mod pins it, bad notes and
// strangers are turned away, only the owner manages mods and what they look after, notes can be archived and
// put back, binned ones are gone for good, and one place can't send more than 5 notes a day
// node tests/board-test.js                         (against wrangler dev, with the keys in .dev.vars)
// node tests/board-test.js https://... <boss key>  (against the live server)
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import CatpiNotes from '../../js/catpi-corner/notes.js';

const base = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const boss = process.argv[3] || readFileSync(new URL('.dev.vars', import.meta.url), 'utf8').match(/^BOSS_KEY=(.*)$/m)[1].trim();
// a made up address, so every run starts with a fresh daily limit (wrangler dev passes it through)
const from = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

const call = async (path, { key, body, ip = from } = {}) => {
  const headers = { 'CF-Connecting-IP': ip };
  if (key) headers.Authorization = `Bearer ${key}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

// the check itself, without the server
const note = { paper: 'mint', bits: [
  { k: 'line', c: '#F2625A', w: 2, p: [10, 10, 200, 220, 390, 40] },
  { k: 'sticker', s: 'star', x: 100, y: 120, r: -10, z: 100 },
  { k: 'words', t: '  hello\u0007 catpis ', c: '#3a3034', x: 200, y: 300, r: 4, z: 120 },
  { k: 'catpi', look: { body: 'leaf', accent: '#2f78c4', pattern: 'polka dots', dot: 'snow', eyes: 'big', mouth: 'smile', cheeks: 'none', whiskers: 'none', lines: 'pencil' }, hat: 'party hat', face: 'none', back: 'none', x: 300, y: 300, r: 0, z: 90 },
] };
const clean = CatpiNotes.clean(note);
assert.equal(clean.bits[0].c, '#f2625a');
assert.equal(clean.bits[2].t, 'hello catpis');
const bad = (change) => assert.equal(CatpiNotes.clean({ ...structuredClone(note), ...change(structuredClone(note)) }), null);
bad(() => ({ paper: 'tartan' }));
bad(() => ({ bits: [] }));
bad((n) => ({ bits: [{ ...n.bits[0], p: [1, 2, 3] }] }));
bad((n) => ({ bits: [{ ...n.bits[0], p: [1, 2, 3, 401] }] }));
bad((n) => ({ bits: [{ ...n.bits[0], c: 'red' }] }));
bad((n) => ({ bits: [{ ...n.bits[1], s: 'skull' }] }));
bad((n) => ({ bits: [{ ...n.bits[1], z: 1000 }] }));
bad((n) => ({ bits: [{ ...n.bits[2], t: 'x'.repeat(61) }] }));
bad((n) => ({ bits: [{ ...n.bits[3], hat: '<img src=x>' }] }));
bad((n) => ({ bits: [{ ...n.bits[3], look: { ...n.bits[3].look, body: undefined } }] }));
bad(() => ({ bits: Array.from({ length: 50 }, () => ({ k: 'line', c: '#000000', w: 1, p: Array.from({ length: 200 }, () => 5) })) }));
bad(() => ({ bits: Array.from({ length: 17 }, () => note.bits[1]) }));
bad(() => ({ bits: Array.from({ length: 7 }, () => note.bits[2]) }));
assert.equal(CatpiNotes.clean({ ...note, extra: 'dropped' }).extra, undefined);

// the server
let r = await call('/board');
assert.equal(r.status, 200);
assert(Array.isArray(r.body.notes));

assert.equal((await call('/board', { body: '{not json' })).status, 400);
assert.equal((await call('/board', { body: { ...note, paper: 'tartan' } })).status, 400);
r = await call('/board', { body: note });
assert.equal(r.status, 201, JSON.stringify(r.body));
const id = r.body.id;

// waiting, so not on the board yet
r = await call(`/board?mine=${id},nonsense,99999999`);
assert.deepEqual(r.body.mine, { [id]: 'waiting' });
assert(!r.body.notes.some((n) => n.id === id));

// strangers can't moderate
assert.equal((await call('/board/mod')).status, 401);
assert.equal((await call('/board/mod', { key: 'mod-not-a-real-key-at-all' })).status, 401);
assert.equal((await call('/board/mod', { body: { do: 'pin', id } })).status, 401);
assert.equal((await call('/mod', { key: 'mod-not-a-real-key-at-all' })).status, 401);

// the owner sees it waiting, cleaned, and makes two mods: one for the board, one for nothing yet
r = await call('/mod', { key: boss });
assert.equal(r.status, 200);
assert.equal(r.body.you.owner, true);
assert.equal(r.body.projects['catpi-board'], 'Catpi Corner notice board');
r = await call('/board/mod', { key: boss });
assert.deepEqual(r.body.waiting.find((n) => n.id === id).note, clean);
const name = 'Tester ' + from, other = 'Other ' + from;
r = await call('/mod', { key: boss, body: { do: 'add mod', name, projects: ['catpi-board', 'made-up'] } });
assert.equal(r.status, 201);
let key = r.body.key;
r = await call('/mod', { key: boss, body: { do: 'add mod', name: other, projects: [] } });
const otherKey = r.body.key;
assert.equal((await call('/mod', { key: boss, body: { do: 'add mod', name } })).status, 409);
r = await call('/mod', { key: boss });
assert.deepEqual(r.body.mods.find((m) => m.name === name).projects, ['catpi-board']);

// a mod without the board can't touch it, until the owner gives it to them
assert.equal((await call('/board/mod', { key: otherKey })).status, 403);
assert.equal((await call('/mod', { key: boss, body: { do: 'set projects', name: other, projects: ['catpi-board'] } })).status, 200);
assert.equal((await call('/board/mod', { key: otherKey })).status, 200);

// the board's mod pins it, archives it, puts it back, but can't manage mods or see who they are
r = await call('/mod', { key });
assert.deepEqual(r.body.you, { name, owner: false, projects: ['catpi-board'] });
assert.equal(r.body.mods, null);
assert.equal((await call('/mod', { key, body: { do: 'add mod', name: 'Sneaky' } })).status, 403);
assert.equal((await call('/board/mod', { key, body: { do: 'pin', id: 99999999 } })).status, 404);
assert.equal((await call('/board/mod', { key, body: { do: 'shred', id } })).status, 400);
assert.equal((await call('/board/mod', { key, body: { do: 'pin', id } })).status, 200);
assert.equal((await call(`/board?mine=${id}`)).body.mine[id], 'pinned');
assert.equal((await call('/board/mod', { key, body: { do: 'archive', id } })).status, 200);
r = await call('/board/mod', { key });
assert(r.body.archived.some((n) => n.id === id && n.by === name));
assert(!r.body.pinned.some((n) => n.id === id));
assert.equal((await call('/board/mod', { key, body: { do: 'pin', id } })).status, 200);

// a new key for the mod: the old one stops working
r = await call('/mod', { key: boss, body: { do: 'new key', name } });
assert.equal((await call('/mod', { key })).status, 401);
key = r.body.key;
assert.equal((await call('/mod', { key })).status, 200);

// the owner removes both mods, and their keys stop working
for (const n of [name, other]) assert.equal((await call('/mod', { key: boss, body: { do: 'remove mod', name: n } })).status, 200);
assert.equal((await call('/board/mod', { key })).status, 401);
assert.equal((await call('/mod', { key: otherKey })).status, 401);

// the owner bins it, tidying up. binned is for good
assert.equal((await call('/board/mod', { key: boss, body: { do: 'bin', id } })).status, 200);
assert.equal((await call(`/board?mine=${id}`)).body.mine[id], 'binned');
assert.equal((await call('/board/mod', { key: boss, body: { do: 'pin', id } })).status, 404);

// things people might try
// a huge body that doesn't say how big it is is cut off, not read in whole
const huge = (size) => new ReadableStream({ start(c) { for (let i = 0; i < size / 1000; i++) c.enqueue(new TextEncoder().encode('x'.repeat(1000))); c.close(); } });
// (the server answers or hangs up before it's all sent, either is fine)
const refused = (path, size, headers) => fetch(base + path, { method: 'POST', body: huge(size), duplex: 'half', headers }).then((x) => x.status, () => 'hung up');
assert([400, 'hung up'].includes(await refused('/board', 2_000_000, { 'CF-Connecting-IP': from })));
assert([400, 'hung up'].includes(await refused('/mod', 200_000, { Authorization: `Bearer ${boss}` })));
// nobody can be made a mod called owner, in any case, or with hidden characters
for (const n of ['owner', 'Owner', ' OWNER ', 'own​er']) assert.equal((await call('/mod', { key: boss, body: { do: 'add mod', name: n } })).status, 400, n);
// sql in a name is only ever a name
const sneaky = "x'); DROP TABLE mods;--";
r = await call('/mod', { key: boss, body: { do: 'add mod', name: sneaky } });
assert.equal(r.status, 201);
assert((await call('/mod', { key: boss })).body.mods.some((m) => m.name === sneaky.slice(0, 20)));
assert.equal((await call('/mod', { key: boss, body: { do: 'remove mod', name: sneaky } })).status, 200);
// keys that are close to the owner's, or odd, get nowhere
for (const k of [boss.slice(0, -1), boss.slice(1), boss.toUpperCase(), boss + 'x', 'x'.repeat(5000)]) assert.equal((await call('/mod', { key: k })).status, 401);
// odd notes
assert.equal((await call('/board', { body: { paper: '__proto__', bits: note.bits } })).status, 400);
assert.equal((await call('/board', { body: { ...note, bits: [{ k: 'constructor', x: 1, y: 1, r: 0, z: 100 }] } })).status, 400);
assert.equal(CatpiNotes.clean({ paper: 'mint', bits: [{ k: 'words', t: 'hi‮ereht', c: '#000000', x: 1, y: 1, r: 0, z: 100 }] }).bits[0].t, 'hiereht');

// five a day from one place (one's been sent already)
for (let i = 0; i < 4; i++) {
  r = await call('/board', { body: note });
  assert.equal(r.status, 201);
  await call('/board/mod', { key: boss, body: { do: 'bin', id: r.body.id } });
}
assert.equal((await call('/board', { body: note })).status, 429);
r = await call('/board', { body: note, ip: from + '1' });
assert.equal(r.status, 201);
await call('/board/mod', { key: boss, body: { do: 'bin', id: r.body.id } });

console.log('board ok');
