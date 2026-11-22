// distant cousins through the server: favourites are counted per creature and change when you change yours, the
// most loved list adds them up, trees that don't add up are turned away and good ones are compared, and the
// daily mystery cousin answers guesses from the family line, gives hints that never give it away, counts each
// creature once, places winners, and won't take guesses once you're done. one place can only make 20 new
// players a day
// node tests/cousins-test.js                 (against wrangler dev, with SALT in .dev.vars)
// node tests/cousins-test.js https://... <salt>
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';

const base = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const salt = process.argv[3] || readFileSync(new URL('.dev.vars', import.meta.url), 'utf8').match(/^SALT=(.*)$/m)[1].trim();
const games = JSON.parse(readFileSync(new URL('../../js/distant-cousins/games.json', import.meta.url), 'utf8'));
const ROOT = 2382443;
const place = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const from = place();
const newId = () => randomBytes(16).toString('hex');

const call = async (path, { body, ip = from } = {}) => {
  const headers = { 'CF-Connecting-IP': ip };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

// ---------- favourites ----------
const LION = 140, TIGER = 19939;
const a = newId(), b = newId();
const before = (await call(`/cousins/favs?q=${LION}`)).body.n;
assert.equal((await call('/cousins/favs', { body: { who: a, q: LION, h: 25306 } })).body.n, before + 1);
assert.equal((await call('/cousins/favs', { body: { who: b, q: LION, h: 25306 } })).body.n, before + 2);
assert.equal((await call('/cousins/favs', { body: { who: a, q: LION, h: 25306 } })).body.n, before + 2, 'the same player twice counts once');
assert.equal((await call('/cousins/favs', { body: { who: b, q: TIGER, h: 25306 } })).status, 200);
assert.equal((await call(`/cousins/favs?q=${LION}`)).body.n, before + 1, 'changing your favourite takes it off the old one');
assert.equal((await call('/cousins/favs', { body: { who: a, q: null } })).body.n, 0);
assert.equal((await call(`/cousins/favs?q=${LION}`)).body.n, before);
const loved = (await call('/cousins/favs')).body;
assert(Array.isArray(loved) && loved.some((l) => l.q === TIGER && l.h === 25306 && l.n >= 1));
assert.equal((await call('/cousins/favs', { body: { who: a, q: 'lion' } })).status, 400);
assert.equal((await call('/cousins/favs', { body: { who: 'me', q: LION } })).status, 400);
assert.equal((await call('/cousins/favs?q=-1')).status, 400);

// ---------- trees ----------
const tree = { who: a, tree: 'first', creatures: 40, groups: 12, extinct: 5, mix: [10, 8, 4, 2, 3, 6, 1, 1, 2, 3] };
let r = await call('/cousins/tree', { body: tree });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert(r.body.trees >= 1 && r.body.mix.length === 10 && r.body.smaller <= r.body.trees);
const bigger = await call('/cousins/tree', { body: { ...tree, creatures: 4000 } });
assert(bigger.body.smaller >= r.body.smaller, 'a bigger tree is bigger than at least as many');
const bad = async (change) => assert.equal((await call('/cousins/tree', { body: { ...tree, ...change } })).status, 400);
await bad({ mix: [40, 40, 0, 0, 0, 0, 0, 0, 0, 0] });
await bad({ mix: [1, 2, 3] });
await bad({ extinct: 41 });
await bad({ tree: '<b>' });
await bad({ creatures: 1.5 });

// ---------- the daily mystery cousin ----------
// the same pick the server makes
const day = new Date().toISOString().slice(0, 10);
const pool = games.quiz.slice(0, 600);
const e = pool[parseInt(createHash('sha256').update(`${salt}:daily:${day}`).digest('hex').slice(0, 8), 16) % pool.length];
const line = [...e[8], e[0]];
// a guess that shares only the first few steps: any other creature in the pool whose line parts early
const other = pool.find((o) => o[0] !== e[0] && o[8][3] !== line[3]);
const otherLine = [...other[8], other[0]];
let same = 0;
while (otherLine[same] === line[same]) same++;

const p = newId();
r = await call(`/cousins/daily?who=${p}`);
assert.equal(r.status, 200);
assert.equal(r.body.day, day);
assert(r.body.number >= 1 && r.body.hints === 3 && r.body.spread.length === 11);
assert.equal(r.body.you.guesses, 0);
assert.equal(r.body.answer, undefined, 'the answer stays a secret');

r = await call('/cousins/daily', { body: { who: p, do: 'guess', line: otherLine } });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.deepEqual([r.body.at, r.body.right, r.body.guesses], [same - 1, false, 1]);
assert.equal(r.body.answer, undefined);
assert.equal((await call('/cousins/daily', { body: { who: p, do: 'guess', line: otherLine } })).status, 409, 'guessed already');
assert.equal((await call('/cousins/daily', { body: { who: p, do: 'guess', line: [5, 6] } })).status, 400, 'a line starts at the first life');

r = await call('/cousins/daily', { body: { who: p, do: 'hint' } });
assert.deepEqual([r.body.at, r.body.q, r.body.hints], [same, line[same], 1]);
// hints run out before the mystery one is named
for (let i = 0; i < 2; i++) await call('/cousins/daily', { body: { who: p, do: 'hint' } });
assert.equal((await call('/cousins/daily', { body: { who: p, do: 'hint' } })).status, 409);

r = await call('/cousins/daily', { body: { who: p, do: 'guess', line } });
assert.equal(r.body.right, true);
assert.equal(r.body.answer.q, e[0]);
assert(r.body.rank >= 1);
assert.equal((await call('/cousins/daily', { body: { who: p, do: 'guess', line: [ROOT, 729] } })).status, 409, 'done for the day');
r = await call(`/cousins/daily?who=${p}`);
assert(r.body.you.won && r.body.you.guesses === 2 && r.body.you.hints === 3 && r.body.answer.q === e[0]);
assert(r.body.solved >= 1 && r.body.spread[1] >= 1);
assert(r.body.top.some((t) => t.you && /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(t.name)));

// giving up shows the answer, and a breed or kind under the mystery one counts as getting it
const q = newId();
r = await call('/cousins/daily', { body: { who: q, do: 'give up' } });
assert.equal(r.body.answer.q, e[0]);
const kid = newId();
r = await call('/cousins/daily', { body: { who: kid, do: 'guess', line: [...line, 999999999] } });
assert.equal(r.body.right, true);

// ---------- new players from one place ----------
const crowd = place();
for (let i = 0; i < 20; i++) assert.equal((await call('/cousins/favs', { body: { who: newId(), q: TIGER, h: 25306 }, ip: crowd })).status, 200);
assert.equal((await call('/cousins/favs', { body: { who: newId(), q: TIGER, h: 25306 }, ip: crowd })).status, 429);
// (someone already playing from there carries on)
assert.equal((await call('/cousins/favs', { body: { who: a, q: TIGER, h: 25306 }, ip: crowd })).status, 200);

console.log('cousins ok');
