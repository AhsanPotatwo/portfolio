// the site's mods. there are two roles: the owner (whoever has the BOSS_KEY secret, which is me) and mods.
// each mod has their own key and a list of the projects they can moderate; the owner can moderate everything
// and is the only one who can add mods, change what they look after, give them a new key or remove them.
// keys are only ever kept as a fingerprint (the mods table, migrations/).
//
//   GET  /mod     who you are, the projects there are, and (for the owner) every mod
//   POST /mod     for the owner: { do: 'add mod', name, projects }, { do: 'set projects', name, projects },
//                 { do: 'new key', name } or { do: 'remove mod', name }. a new key is sent back once
//
// mods send their key as "Authorization: Bearer <key>". mod.html is the page for all of this

// everything on the site that can be moderated. a new multiplayer thing adds itself here
export const PROJECTS = { 'catpi-board': 'Catpi Corner notice board' };

export const hash = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
  .map((b) => b.toString(16).padStart(2, '0')).join('');
const newKey = () => 'mod-' + btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))))
  .replace(/\+/g, '-').replace(/\//g, '_');
const cleanName = (name) => typeof name === 'string' ? name.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '').trim().slice(0, 20) : '';
const cleanProjects = (list) => Array.isArray(list) ? [...new Set(list.filter((p) => Object.hasOwn(PROJECTS, p)))] : [];

// a small json body, or null if it isn't json or is bigger than max bytes. it's read a bit at a time and given
// up on past max, so a huge body (even one that doesn't say how big it is) is never read in whole
export async function readJson(req, max = 2048) {
  if (!req.body) return null;
  const reader = req.body.getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); return null; }
    parts.push(value);
  }
  try { return JSON.parse(await new Blob(parts).text()); } catch { return null; }
}

// who's asking, from their key: { name, owner, projects } or null. the owner's key has to be a long one, so a
// short or missing BOSS_KEY never lets anyone in as the owner
export async function whoIs(req, env) {
  const key = (req.headers.get('Authorization') || '').match(/^Bearer ([\x21-\x7e]{20,200})$/)?.[1];
  if (!key) return null;
  const h = await hash(key);
  if (typeof env.BOSS_KEY === 'string' && env.BOSS_KEY.length >= 32 && h === await hash(env.BOSS_KEY)) return { name: 'owner', owner: true, projects: Object.keys(PROJECTS) };
  const row = await env.DB.prepare('SELECT name, projects FROM mods WHERE key_hash = ?').bind(h).first();
  return row && { name: row.name, owner: false, projects: cleanProjects(JSON.parse(row.projects)) };
}
export const can = (me, project) => !!me && (me.owner || me.projects.includes(project));

export async function mods(req, env, cors) {
  const json = (body, status = 200) => Response.json(body, { status, headers: cors });
  const no = (why, status = 400) => json({ error: why }, status);
  if (!env.DB) return no('mods are not set up yet', 503);
  const me = await whoIs(req, env);
  if (!me) return no("that key isn't a mod key", 401);

  if (req.method === 'GET') {
    const list = me.owner ? (await env.DB.prepare('SELECT name, made, projects FROM mods ORDER BY made').all()).results.map((m) => ({ ...m, projects: cleanProjects(JSON.parse(m.projects)) })) : null;
    return json({ you: me, projects: PROJECTS, mods: list });
  }
  if (req.method !== 'POST') return no('not allowed', 405);
  if (!me.owner) return no('only the owner can do that', 403);
  const msg = await readJson(req);
  const name = cleanName(msg?.name);
  if (!name || name.toLowerCase() === 'owner') return no('which mod?');

  if (msg.do === 'add mod') {
    const key = newKey();
    try {
      await env.DB.prepare('INSERT INTO mods (name, key_hash, made, projects) VALUES (?, ?, ?, ?)').bind(name, await hash(key), Date.now(), JSON.stringify(cleanProjects(msg.projects))).run();
    } catch { return no('there is already a mod called that', 409); }
    return json({ name, key }, 201);
  }
  const change = async (sql, ...values) => (await env.DB.prepare(sql).bind(...values, name).run()).meta.changes;
  if (msg.do === 'set projects') {
    return await change('UPDATE mods SET projects = ? WHERE name = ?', JSON.stringify(cleanProjects(msg.projects))) ? json({ ok: true }) : no('no mod called that', 404);
  }
  if (msg.do === 'new key') {
    const key = newKey();
    return await change('UPDATE mods SET key_hash = ? WHERE name = ?', await hash(key)) ? json({ name, key }) : no('no mod called that', 404);
  }
  if (msg.do === 'remove mod') {
    return await change('DELETE FROM mods WHERE name = ?') ? json({ ok: true }) : no('no mod called that', 404);
  }
  return no('nothing to do');
}
