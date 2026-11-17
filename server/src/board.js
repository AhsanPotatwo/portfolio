// catpi corner's notice board: visitors send notes, mods pin them up, and everyone sees a handful at random.
// the notes live in a D1 database (migrations/). who's a mod is mods.js's job; this is the 'catpi-board' project.
//
//   GET  /board?mine=4,9        up to 24 pinned notes at random, and how the notes you sent are getting on
//   POST /board                 send a note (js/catpi-corner/notes.js says what one is). it waits for a mod
//   GET  /board/mod             for its mods: the notes waiting, on the board, and in the archive
//   POST /board/mod             for its mods: { do: 'pin' | 'archive' | 'bin', id }. pin puts a waiting or
//                               archived note on the board, archive takes it off but keeps it, and bin throws
//                               it away for good
//
// SALT is a secret mixed into the fingerprints of where notes come from, so they can't be turned back into
// addresses
import CatpiNotes from '../../js/catpi-corner/notes.js';
import { whoIs, can, hash, readJson } from './mods.js';

const SHOW = 24;
const PER_DAY = 5;
const MAX_WAITING = 300;
const DAY = 24 * 60 * 60 * 1000;
const LIST = 60;

const notesOut = (rows) => rows.map((r) => ({ id: r.id, made: r.made, by: r.by_mod, note: JSON.parse(r.note) }));

export async function board(req, env, url, cors) {
  const json = (body, status = 200) => Response.json(body, { status, headers: cors });
  const no = (why, status = 400) => json({ error: why }, status);
  if (!env.DB || !env.SALT) return no('the board is not set up yet', 503);

  if (url.pathname === '/board' && req.method === 'GET') {
    const { results } = await env.DB.prepare("SELECT id, note, made FROM notes WHERE status = 'pinned' ORDER BY RANDOM() LIMIT ?").bind(SHOW).all();
    const mine = (url.searchParams.get('mine') || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 20);
    const status = {};
    if (mine.length) {
      const got = await env.DB.prepare('SELECT id, status FROM notes WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(mine)).all();
      for (const r of got.results) status[r.id] = r.status;
    }
    return json({ notes: notesOut(results), mine: status });
  }

  if (url.pathname === '/board' && req.method === 'POST') {
    if (+req.headers.get('Content-Length') > CatpiNotes.MAX.bytes * 2) return no('that note is too big', 413);
    const note = CatpiNotes.clean(await readJson(req, CatpiNotes.MAX.bytes * 2));
    if (!note) return no("that note doesn't look right");
    const who = await hash(env.SALT + (req.headers.get('CF-Connecting-IP') || 'here'));
    const now = Date.now();
    const [sent, waiting] = await env.DB.batch([
      env.DB.prepare('SELECT COUNT(*) AS n FROM notes WHERE who = ? AND made > ?').bind(who, now - DAY),
      env.DB.prepare("SELECT COUNT(*) AS n FROM notes WHERE status = 'waiting'"),
    ]);
    if (sent.results[0].n >= PER_DAY) return no(`that's ${PER_DAY} notes today already. come back tomorrow`, 429);
    if (waiting.results[0].n >= MAX_WAITING) return no('the mods have lots to read right now. try again later', 503);
    const row = await env.DB.prepare('INSERT INTO notes (note, who, made) VALUES (?, ?, ?) RETURNING id').bind(JSON.stringify(note), who, now).first();
    return json({ id: row.id }, 201);
  }

  if (url.pathname === '/board/mod') {
    const me = await whoIs(req, env);
    if (!me) return no("that key isn't a mod key", 401);
    if (!can(me, 'catpi-board')) return no("you're not a mod for the notice board", 403);

    if (req.method === 'GET') {
      const list = (status, order) => env.DB.prepare(`SELECT id, note, made, by_mod FROM notes WHERE status = ? ORDER BY id ${order} LIMIT ?`).bind(status, LIST);
      const [waiting, pinned, archived] = await env.DB.batch([list('waiting', 'ASC'), list('pinned', 'DESC'), list('archived', 'DESC')]);
      return json({ waiting: notesOut(waiting.results), pinned: notesOut(pinned.results), archived: notesOut(archived.results) });
    }
    if (req.method !== 'POST') return no('not allowed', 405);
    const msg = await readJson(req);
    const to = { pin: 'pinned', archive: 'archived', bin: 'binned' }[msg?.do];
    if (!to || !Number.isInteger(msg.id)) return no('nothing to do');
    // a binned note's drawing goes too; only the row stays, for the daily limit
    const done = await env.DB.prepare("UPDATE notes SET status = ?1, by_mod = ?2, note = CASE WHEN ?1 = 'binned' THEN '{}' ELSE note END WHERE id = ?3 AND status != 'binned'")
      .bind(to, me.name, msg.id).run();
    return done.meta.changes ? json({ ok: true }) : no('no note with that number', 404);
  }

  return no('not found', 404);
}
