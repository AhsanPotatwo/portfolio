// distant cousins' server side (js/distant-cousins/): everyone's favourites, how trees compare, and the daily
// mystery cousin with its results. nobody signs in: each browser makes up a random id (distantCousinsId) and
// sends it along, and only a fingerprint of it is kept (migrations/0003_cousins.sql). nothing anyone types is
// ever stored or shown to anyone else, so there's nothing to moderate: players on the results are given a
// made up name from their fingerprint.
//
//   GET  /cousins/favs?q=140     how many explorers have it as their favourite: { n }
//   GET  /cousins/favs           the most loved: [{ q, h, n }] (h: the tree file it's in, for the page to draw it)
//   POST /cousins/favs           { who, q, h } your favourite, or { who, q: null } none. sends back { n }
//   POST /cousins/tree           { who, tree, creatures, groups, extinct, mix } one of your trees, and how it
//                                compares: { trees, smaller, mix } (mix: everyone's average share of each kind)
//   GET  /cousins/daily?who=     today's mystery cousin: how everyone's getting on, the best ten, and you
//   POST /cousins/daily          { who, do: 'guess', line } | { who, do: 'hint' } | { who, do: 'give up' }
//
// the daily one is picked here, from the SALT secret and the date, so it can't be read out of the page. a guess
// is the guessed creature's family line, from the first life down to it, and the answer is how far down that's
// the same as the mystery one's line. that's only what the guess itself would tell you, so a made up line gives
// nothing more away
import games from '../../js/distant-cousins/games.json';
import { hash, readJson } from './mods.js';

const ROOT = 2382443;
const DAY = 24 * 60 * 60 * 1000;
const NEW_PER_DAY = 20;                     // new players from one place in a day
const TREES_EACH = 20;
const KINDS = 10;                           // the kinds a tree's mix is counted in (progress.js KINDS)
const HINTS = 3;
const MAX_GUESSES = 200;
const LOVED = 12;
// who the daily one can be: the best known 600, mystery cousin's normal level (games.js MYSTERY_LEVELS)
const POOL = games.quiz.slice(0, 600);
const FIRST_DAY = Date.UTC(2026, 10, 19);   // daily number 1

// made up names for the results, from a player's fingerprint
const ADJ = ['Curious', 'Sleepy', 'Brave', 'Gentle', 'Speedy', 'Clever', 'Fuzzy', 'Jolly', 'Quiet', 'Daring', 'Lucky', 'Patient',
  'Sunny', 'Wandering', 'Bouncy', 'Cosy', 'Merry', 'Nimble', 'Plucky', 'Wise', 'Dreamy', 'Bold', 'Cheerful', 'Mighty'];
const ANIMALS = ['Axolotl', 'Pangolin', 'Wombat', 'Narwhal', 'Okapi', 'Capybara', 'Platypus', 'Quokka', 'Tapir', 'Gecko', 'Puffin',
  'Lemur', 'Otter', 'Hedgehog', 'Tortoise', 'Kiwi', 'Manatee', 'Meerkat', 'Newt', 'Ibis', 'Dormouse', 'Seahorse', 'Bilby', 'Moth'];
const nickname = (who) => `${ADJ[parseInt(who.slice(0, 4), 16) % ADJ.length]} ${ANIMALS[parseInt(who.slice(4, 8), 16) % ANIMALS.length]}`;

const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const today = () => new Date().toISOString().slice(0, 10);
async function mystery(env, day) {
  const e = POOL[parseInt((await hash(`${env.SALT}:daily:${day}`)).slice(0, 8), 16) % POOL.length];
  return { q: e[0], h: e[1], name: e[2], line: [...e[8], e[0]] };
}
const answerOf = (m) => ({ q: m.q, h: m.h, name: m.name });

export async function cousins(req, env, url, cors) {
  const json = (body, status = 200) => Response.json(body, { status, headers: cors });
  const no = (why, status = 400) => json({ error: why }, status);
  if (!env.DB || !env.SALT) return no('not set up yet', 503);
  const DB = env.DB;
  const path = url.pathname, post = req.method === 'POST';
  if (!post && req.method !== 'GET') return no('not allowed', 405);
  const msg = post ? await readJson(req) : null;
  if (post && !msg) return no("that doesn't look right");

  // the fingerprint of the id the page sent, or null if it isn't one
  const id = post ? msg.who : url.searchParams.get('who');
  const who = typeof id === 'string' && /^[0-9a-f]{32}$/.test(id) ? await hash(`${env.SALT}:cousin:${id}`) : null;
  // anything that writes needs a player, and one place can only make so many new ones in a day
  const join = async () => {
    if (!who) return false;
    if (await DB.prepare('SELECT 1 FROM dc_players WHERE who = ?').bind(who).first()) return true;
    const ip = await hash(env.SALT + (req.headers.get('CF-Connecting-IP') || 'here'));
    const now = Date.now();
    const { n } = await DB.prepare('SELECT COUNT(*) AS n FROM dc_players WHERE ip = ? AND made > ?').bind(ip, now - DAY).first();
    if (n >= NEW_PER_DAY) return false;
    await DB.prepare('INSERT OR IGNORE INTO dc_players (who, ip, made) VALUES (?, ?, ?)').bind(who, ip, now).run();
    return true;
  };
  const busy = () => no(who ? 'lots of new explorers from here today. try again tomorrow' : 'who are you?', who ? 429 : 400);
  const lovedBy = async (q) => (await DB.prepare('SELECT COUNT(*) AS n FROM dc_players WHERE fav = ?').bind(q).first()).n;

  // ---------- favourites ----------
  if (path === '/cousins/favs' && !post) {
    const q = Number(url.searchParams.get('q'));
    if (url.searchParams.has('q')) return int(q, 1, 2 ** 31) ? json({ n: await lovedBy(q) }) : no('which creature?');
    // (counted by creature and file together, and each creature drawn from the file most people sent, so one
    // made up file can't spoil it)
    const { results } = await DB.prepare('SELECT fav AS q, fav_home AS h, COUNT(*) AS n FROM dc_players WHERE fav IS NOT NULL GROUP BY fav, fav_home ORDER BY n DESC LIMIT 60').all();
    const by = new Map();
    for (const r of results) {
      const had = by.get(r.q);
      if (had) had.n += r.n; else by.set(r.q, { ...r });
    }
    return json([...by.values()].sort((a, b) => b.n - a.n || a.q - b.q).slice(0, LOVED));
  }
  if (path === '/cousins/favs') {
    const q = msg.q ?? null, h = msg.h ?? null;
    if (q !== null && (!int(q, 1, 2 ** 31) || (h !== null && !int(h, 0, 2 ** 31)))) return no('which creature?');
    if (!await join()) return busy();
    await DB.prepare('UPDATE dc_players SET fav = ?, fav_home = ? WHERE who = ?').bind(q, q === null ? null : h, who).run();
    return json({ n: q === null ? 0 : await lovedBy(q) });
  }

  // ---------- trees ----------
  if (path === '/cousins/tree' && post) {
    const { tree, creatures, groups, extinct, mix } = msg;
    if (typeof tree !== 'string' || !/^[a-z0-9]{1,16}$/.test(tree) || !int(creatures, 0, 1e6) || !int(groups, 0, 1e6) || !int(extinct, 0, creatures)
      || !Array.isArray(mix) || mix.length !== KINDS || !mix.every((k) => int(k, 0, creatures)) || mix.reduce((a, b) => a + b, 0) > creatures) return no("that tree doesn't add up");
    if (!await join()) return busy();
    const had = await DB.prepare('SELECT COUNT(*) AS n, SUM(tree = ?) AS mine FROM dc_trees WHERE who = ?').bind(tree, who).first();
    if (!had.mine && had.n >= TREES_EACH) return no(`only ${TREES_EACH} trees each are counted`, 429);
    await DB.prepare(`INSERT INTO dc_trees (who, tree, creatures, group_count, extinct, mix, made) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ON CONFLICT (who, tree) DO UPDATE SET creatures = ?3, group_count = ?4, extinct = ?5, mix = ?6, made = ?7`)
      .bind(who, tree, creatures, groups, extinct, JSON.stringify(mix), Date.now()).run();
    const shares = Array.from({ length: KINDS }, (_, i) => `AVG(json_extract(mix, '$[${i}]') * 1.0 / creatures) AS k${i}`).join(', ');
    const r = await DB.prepare(`SELECT COUNT(*) AS trees, SUM(creatures < ?) AS smaller, ${shares} FROM dc_trees WHERE creatures > 0`).bind(creatures).first();
    return json({ trees: r.trees, smaller: r.smaller || 0, mix: Array.from({ length: KINDS }, (_, i) => +(r['k' + i] || 0).toFixed(4)) });
  }

  // ---------- the daily mystery cousin ----------
  if (path === '/cousins/daily') {
    const day = today(), m = await mystery(env, day);
    const mine = () => who ? DB.prepare('SELECT * FROM dc_daily WHERE day = ? AND who = ?').bind(day, who).first() : null;
    // where a winner places: fewest guesses, then fewest hints, then quickest
    const rank = async (r) => 1 + (await DB.prepare(`SELECT COUNT(*) AS n FROM dc_daily WHERE day = ?1 AND won = 1
      AND (guesses < ?2 OR (guesses = ?2 AND (hints < ?3 OR (hints = ?3 AND done - started < ?4))))`).bind(day, r.guesses, r.hints, r.done - r.started).first()).n;

    if (!post) {
      const [count, spread, top] = await DB.batch([
        DB.prepare('SELECT COUNT(*) AS players, COALESCE(SUM(won), 0) AS solved FROM dc_daily WHERE day = ? AND (guesses > 0 OR hints > 0)').bind(day),
        DB.prepare('SELECT MIN(guesses, 11) AS g, COUNT(*) AS n FROM dc_daily WHERE day = ? AND won = 1 GROUP BY 1').bind(day),
        DB.prepare('SELECT who, guesses, hints, done - started AS ms FROM dc_daily WHERE day = ? AND won = 1 ORDER BY guesses, hints, ms LIMIT 10').bind(day),
      ]);
      const r = await mine();
      const bars = Array(11).fill(0);
      for (const s of spread.results) bars[s.g - 1] = s.n;
      return json({
        day, number: Math.floor((Date.parse(day) - FIRST_DAY) / DAY) + 1, ends: Date.parse(day) + DAY - Date.now(), hints: HINTS,
        ...count.results[0], spread: bars,
        top: top.results.map((t) => ({ name: nickname(t.who), guesses: t.guesses, hints: t.hints, secs: Math.round(t.ms / 1000), you: t.who === who })),
        you: who && {
          name: nickname(who), guesses: r?.guesses || 0, hints: r?.hints || 0, deep: r?.deep || 0, done: !!r?.done, won: !!r?.won,
          rank: r?.won ? await rank(r) : null,
        },
        answer: r?.done ? answerOf(m) : undefined,
      });
    }

    if (!['guess', 'hint', 'give up'].includes(msg.do)) return no('nothing to do');
    if (!await join()) return busy();
    await DB.prepare('INSERT OR IGNORE INTO dc_daily (day, who, started) VALUES (?, ?, ?)').bind(day, who, Date.now()).run();
    const r = await mine();
    if (r.done) return json({ error: "you've done today's already", answer: answerOf(m) }, 409);
    const save = (sets, ...values) => DB.prepare(`UPDATE dc_daily SET ${sets} WHERE day = ? AND who = ?`).bind(...values, day, who).run();

    if (msg.do === 'guess') {
      const line = msg.line;
      if (!Array.isArray(line) || line.length < 2 || line.length > 120 || line[0] !== ROOT || !line.every((q) => int(q, 1, 2 ** 31))) return no("that guess doesn't look right");
      const q = line.at(-1), seen = JSON.parse(r.seen);
      if (seen.includes(q)) return no("you've guessed that one already", 409);
      if (seen.length >= MAX_GUESSES) return no("that's a lot of guesses. maybe tomorrow's?", 429);
      let i = 0;
      while (i < line.length && i < m.line.length && line[i] === m.line[i]) i++;
      // (the mystery one itself, or one of its own kinds: a breed of it)
      const right = i === m.line.length, now = Date.now();
      seen.push(q);
      await save('guesses = guesses + 1, deep = MAX(deep, ?), seen = ?, done = ?, won = ?', i - 1, JSON.stringify(seen), right ? now : null, +right);
      const out = { at: i - 1, right, guesses: r.guesses + 1 };
      if (right) Object.assign(out, { answer: answerOf(m), rank: await rank({ guesses: r.guesses + 1, hints: r.hints, started: r.started, done: now }) });
      return json(out);
    }
    if (msg.do === 'hint') {
      // the next group down its line, but never the mystery one itself
      const next = r.deep + 1;
      if (r.hints >= HINTS) return no("that's all the hints for today", 409);
      if (next >= m.line.length - 1) return no("there's no more to give away: you're nearly there", 409);
      await save('hints = hints + 1, deep = ?', next);
      return json({ at: next, q: m.line[next], name: games.names[m.line[next]] || null, hints: r.hints + 1 });
    }
    await save('done = ?', Date.now());
    return json({ answer: answerOf(m) });
  }

  return no('not found', 404);
}
