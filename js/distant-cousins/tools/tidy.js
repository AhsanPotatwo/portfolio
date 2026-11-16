// tidies what build.js wrote, where its sources contradict each other. run it after every build:
//   node --max-old-space-size=4096 js/distant-cousins/tools/tidy.js
// it changes tree/, find/ and games.json in place and prints what it changed. nothing here needs the raw folder:
// the one thing it asks the internet (irmng, below) is kept in tidy-cache.json beside it, so a rerun is offline.
//
//   alive or extinct: wikidata and pbdb disagree with each other often enough that 3,000 animals were alive in a
//     group "all died out" (a living spider genus pbdb has a fossil namesake of, Liodon the mosasaur with no
//     fossil record of its own "still around today"). irmng (the interim register of marine and nonmarine
//     genera) marks nearly every genus extinct or not, so each disagreement is put to it, matched by family
//     line (it has namesakes too). then: anything irmng says is alive keeps every group above it alive, and
//     anything left under an extinct group is extinct too
//   dates: a few youngest fossils came out older than the oldest
//   weights: grams written as kilograms (a woolly monkey of 6 g), found against their relatives
//   names: wikidata labels that aren't names ("Calvert, 1902", "PERGAS", "Scaptomyza n.sp. 2", a goby called
//     "T-38C Talon"), and latin names that are blank-node links
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..');
const TREE = path.join(OUT, 'tree'), FIND = path.join(OUT, 'find'), GAMES = path.join(OUT, 'games.json');
const CACHE = path.join(__dirname, 'tidy-cache.json');

// ---- the built tree, every slice, edited in place ----
const files = new Map();     // slice file -> its data
const nodes = new Map(), parent = new Map(), ups = [];
for (const f of fs.readdirSync(TREE)) {
  if (f === 'index.json') continue;
  const d = JSON.parse(fs.readFileSync(path.join(TREE, f), 'utf8'));
  files.set(f, d);
  for (const n of d.nodes) { nodes.set(n.q, n); for (const k of n.k || []) parent.set(k, n.q); }
  ups.push(...d.up);
}
const changed = new Set();   // nodes changed, so their slice is written again
const log = {};
const say = (what, n, more = '') => { (log[what] ||= []).push(`${n.l || n.n} [${n.n}]${more}`); changed.add(n.q); };
const nameOfQ = q => nodes.get(q)?.n || ups.find(u => u.q === q)?.n;
const upNames = q => { const s = new Set(); for (let x = parent.get(q); x !== undefined; x = parent.get(x)) s.add(nameOfQ(x)); return s; };
const GENUS_LIKE = new Set(['genus', 'subgenus']);

// ---- names ----
const GENID = /^<http:\/\/www\.wikidata\.org\/\.well-known\/genid\//;
// labels nobody would call an animal: author and year, "sp.", shouting, references, vandalism
const NOT_A_NAME = /\b1[789]\d\d\b|\b20\d\d\b|\bsp\.|\bsp \d|n\.sp|n\.g\.|sp\. nov|[Nn]ew species|\[source|#|^PR-Q|^[A-Z]{2}[a-z]|\d[A-Z]|^[A-Z][A-Z' -]{3,}[A-Z]$/;
const HAND = { 4905447: "Nigel's one-jawed eel", 1886568: '24-spot ladybird', 176338: '16-spot ladybird', 6731049: '13-year periodical cicada' };
const dropped = new Map();   // qid -> the label taken away (so search drops it too)
for (const n of nodes.values()) {
  if (GENID.test(n.n)) {
    // no latin name at all, only an undescribed "sp. 2": that's its name, then
    const was = n.n;
    n.n = n.l || 'Q' + n.q; delete n.l;
    if (n.w === 2) n.w = 1;
    say('latin name was a blank link', n, ` (was ${was.slice(0, 50)}...)`);
    continue;
  }
  if (!n.l) continue;
  if (HAND[n.q]) { if (n.l !== HAND[n.q]) { say('name corrected by hand', n, ` (was ${n.l})`); n.l = HAND[n.q]; } continue; }
  const latinLike = n.l.toLowerCase() === n.n.toLowerCase() && /^[A-Z][a-z]+ [a-z]+/.test(n.n);
  // (stricter about case: "Penghu 1" and "88 butterfly" are names, "Calvert, 1902" isn't)
  if (latinLike || NOT_A_NAME.test(n.l) && !/^\d+[- ]?(spot|year)|^\d+ butterfly|^Penghu \d$|AEECL|VC-10/i.test(n.l)) {
    dropped.set(n.q, n.l);
    say(latinLike ? 'english name was just the latin' : 'label was not a name', n, latinLike ? '' : ` (was ${n.l})`);
    if (n.w === 2) n.w = n.l;
    delete n.l;
  }
}
for (const u of ups) { const n = nodes.get(u.q); if (n && u.l !== n.l) { if (n.l) u.l = n.l; else delete u.l; } if (n && u.n !== n.n) u.n = n.n; }

// ---- dates ----
for (const n of nodes.values()) if (n.a !== undefined && n.z !== undefined && n.z > n.a) {
  say('youngest fossils older than oldest', n, ` (${n.z} > ${n.a})`);
  n.z = n.a;
  if (n.z2 !== undefined) { n.z2 = Math.min(n.z2, n.a2 ?? n.a); if (n.z2 <= n.z) delete n.z2; }
}

// ---- weights: grams as kilograms ----
// only against its own genus: a weight that's a thousand times lighter than the heaviest of its brothers and
// sisters, and the same as it were it in grams. (wider families are no guide: a honey possum really is 9 g)
for (const p of nodes.values()) {
  const ks = (p.k || []).map(k => nodes.get(k)).filter(k => k?.kg && !k.g);
  if (ks.length < 2) continue;
  const top = Math.max(...ks.map(k => k.kg));
  for (const n of ks) if (n.kg < 0.1 && top / n.kg > 300 && Math.abs(Math.log10(n.kg * 1000 / top)) < 0.5) {
    say('weight was in grams', n, ` (${n.kg} kg, the heaviest of its genus ${top} kg)`);
    n.kg = +(n.kg * 1000).toPrecision(2);
  }
}

// ---- alive or extinct ----
(async () => {
  const ask = new Set();
  for (const n of nodes.values()) {
    if (!n.x) continue;
    const living = (n.k || []).filter(k => nodes.get(k) && !nodes.get(k).x);
    if (living.length) { ask.add(n.q); for (const k of living) ask.add(k); }
  }
  const store = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
  store.irmng ||= {}; store.iucn ||= {};
  const cache = store.irmng, keep = () => fs.writeFileSync(CACHE, JSON.stringify(store));
  // wikidata's iucn status of each, and of everything in it: irmng only marks animals known only as fossils
  // extinct, so it has the aurochs and the laughing owl alive. the iucn knows who's gone in the last few
  // hundred years, and who certainly isn't
  const kin = [...new Set([...ask].flatMap(q => [q, ...(nodes.get(q).k || [])]))].filter(q => !(q in store.iucn));
  for (let i = 0; i < kin.length; i += 250) {
    const group = kin.slice(i, i + 250);
    const sparql = `SELECT ?t ?s WHERE { VALUES ?t { ${group.map(q => 'wd:Q' + q).join(' ')} } OPTIONAL { ?t wdt:P141 ?s } }`;
    let answer;
    for (let tries = 0; tries < 4 && !answer; tries++) {
      try { const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql), { headers: { 'user-agent': 'distant-cousins-tidy/1.0' } }); if (r.ok) answer = await r.json(); } catch { }
      if (!answer) await new Promise(ok => setTimeout(ok, 5000 * (tries + 1)));
    }
    if (!answer) { console.log('wikidata not answering, stopping here: run again to carry on'); break; }
    for (const q of group) store.iucn[q] = null;
    for (const b of answer.results.bindings) if (b.s) store.iucn[+b.t.value.split('/Q').pop()] = +b.s.value.split('/Q').pop();
    keep();
    process.stdout.write(`\riucn: ${Math.min(i + 250, kin.length)} of ${kin.length}`);
    await new Promise(ok => setTimeout(ok, 1000));
  }
  console.log();
  const need = [...ask].filter(q => !(q in cache) && !/^Q\d+$/.test(nodes.get(q).n));
  console.log(`irmng: ${ask.size} to settle, ${need.length} not asked before`);
  for (let i = 0; i < need.length; i += 50) {
    const group = need.slice(i, i + 50);
    const url = 'https://www.irmng.org/rest/AphiaRecordsByNames?marine_only=false&' + group.map(q => 'scientificnames%5B%5D=' + encodeURIComponent(nodes.get(q).n)).join('&');
    let answer;
    for (let tries = 0; tries < 4 && !answer; tries++) {
      try { const r = await fetch(url); if (r.ok) answer = await r.json(); else if (r.status === 204) answer = group.map(() => []); } catch { }
      if (!answer) await new Promise(ok => setTimeout(ok, 3000 * (tries + 1)));
    }
    if (!answer) { console.log('irmng not answering, stopping here: run again to carry on'); break; }
    // (each record kept as [family, order, class, phylum, status, extinct])
    group.forEach((q, j) => { cache[q] = (answer[j] || []).filter(r => r.isExtinct === 0 || r.isExtinct === 1).map(r => [r.family, r.order, r.class, r.phylum, r.status, r.isExtinct]); });
    keep();
    process.stdout.write(`\rirmng: ${Math.min(i + 50, need.length)} of ${need.length}`);
    await new Promise(ok => setTimeout(ok, 400));
  }
  console.log();
  // irmng's word on each: the record whose family line is this one's (it has namesakes), accepted ones first.
  // same family or order: a class is too wide, birds have two Pseudasturs, a living hawk and a fossil parrot.
  // only a big group, whose namesakes are few, goes by its class or phylum. 1 extinct, 0 alive, else unknown
  const GONE = 237350;
  const iucn = q => store.iucn[q] ? store.iucn[q] === GONE ? 1 : 0 : undefined;
  const said = new Map();
  for (const q of ask) {
    const n = nodes.get(q), mine = upNames(q), big = !['genus', 'subgenus', 'species', 'subspecies'].includes(n.r);
    if (iucn(q) !== undefined) { said.set(q, iucn(q)); continue; }
    let best = null, score = 0;
    for (const [family, order, cls, phylum, status, x] of cache[q] || []) {
      const s = (mine.has(family) ? 8 : 0) + (mine.has(order) ? 4 : 0) + (mine.has(cls) ? 2 : 0) + (mine.has(phylum) ? 1 : 0) + (status === 'accepted' ? 0.5 : 0);
      if (s >= (big ? 1 : 4) && s > score) { score = s; best = x; }
    }
    if (best === 1) said.set(q, 1);
    // irmng's "not extinct": not for a species (the aurochs, the tasman starling), nor for a genus whose members
    // the iucn knows are all gone, nor one whose last fossils are from the last 12,000 years (the laughing owl's:
    // gone in 1914). any member the iucn has alive settles it
    const theirs = (n.k || []).map(iucn).filter(v => v !== undefined);
    if (theirs.includes(0)) said.set(q, 0);
    else if (best === 0 && !['species', 'subspecies'].includes(n.r) && !(theirs.length && theirs.every(v => v === 1)) && !(n.z <= 0.0125)) said.set(q, 0);
  }
  // nothing known either way, under a group that's gone: one with an english name is someone people have seen
  // alive (the white hawk, whose genus pbdb mixed up with a fossil parrot), one without is a fossil
  // (a real one: not just its genus again, "Argentinosaurus" for Argentinosaurus huinculensis)
  const english = n => !!n.l && n.l.toLowerCase() !== n.n.split(' ')[0].toLowerCase();
  const seenAlive = q => said.get(q) === 0 || !said.has(q) && english(nodes.get(q)) && said.get(parent.get(q)) !== 1;
  const gone = n => { if (!n.x) { n.x = 1; return true; } return false; };
  const alive = n => { if (n.x) { delete n.x; delete n.z; delete n.z2; return true; } return false; };
  // 1. irmng's word
  for (const q of ask) {
    const n = nodes.get(q), v = said.get(q);
    if (v === 1 && gone(n)) say('extinct, says irmng', n);
    if (v === 0 && alive(n)) say('alive, says irmng', n);
  }
  // 2. alive keeps everything above it alive
  for (const q of ask) {
    if (!seenAlive(q) || nodes.get(q).x) continue;
    for (let x = parent.get(q); x !== undefined; x = parent.get(x)) { const p = nodes.get(x); if (p && alive(p)) say(said.get(q) === 0 ? 'alive: irmng has living members' : 'alive: has members with english names', p); }
  }
  // 3. under an extinct group, extinct (top down, so a whole branch goes at once). not below a species: wikidata
  // has the Floreana tortoise, gone, as the species (and the subspecies) the living Galapagos ones belong to
  const down = q => { const p = nodes.get(q); for (const k of p?.k || []) { const c = nodes.get(k); if (!c) continue; if (p.x && p.r !== 'species' && p.r !== 'subspecies' && !seenAlive(k) && gone(c)) say('extinct: its group died out', c); down(k); } };
  down(2382443);
  // a genus is a group while it's alive, one creature (the way people know dinosaurs) once it's gone
  for (const q of changed) { const n = nodes.get(q); if (GENUS_LIKE.has(n.r) && n.k?.length) { if (n.x) delete n.g; else n.g = 1; } }

  // ---- written back ----
  let slicesOut = 0;
  for (const [f, d] of files) if (d.nodes.some(n => changed.has(n.q)) || d.up.some(u => changed.has(u.q))) { fs.writeFileSync(path.join(TREE, f), JSON.stringify(d)); slicesOut++; }
  // search: [qid, slice, fame, group?, latin, names...]
  let findOut = 0;
  for (const f of fs.readdirSync(FIND)) {
    if (f === 'split.json') continue;
    const list = JSON.parse(fs.readFileSync(path.join(FIND, f), 'utf8'));
    let dirty = false;
    for (const e of list) {
      const n = nodes.get(e[0]);
      if (!n || !changed.has(e[0])) continue;
      if (GENID.test(e[4])) { e[4] = n.n; dirty = true; }
      const was = dropped.get(e[0]);
      if (was) for (let i = e.length - 1; i > 4; i--) if (e[i] === was) { e.splice(i, 1); dirty = true; }
      if (HAND[e[0]]) { const i = e.findIndex((t, j) => j > 4 && t !== HAND[e[0]] && t.toLowerCase().replace(/\W/g, '') === HAND[e[0]].toLowerCase().replace(/\W/g, '')); if (i > 4) { e[i] = HAND[e[0]]; dirty = true; } }
      for (let i = e.length - 1; i > 4; i--) if (e.indexOf(e[i]) < i) { e.splice(i, 1); dirty = true; }
      const g = n.g ? 1 : 0;
      if (e[3] !== g) { e[3] = g; dirty = true; }
    }
    if (dirty) { fs.writeFileSync(path.join(FIND, f), JSON.stringify(list)); findOut++; }
  }
  // games: quiz rows are [qid, slice, name, picture, oldest, oldest2, kg, extinct, trail, how to say it]
  const games = JSON.parse(fs.readFileSync(GAMES, 'utf8'));
  for (const row of games.quiz) {
    const n = nodes.get(row[0]);
    if (!n) continue;
    row[2] = n.l || n.n; row[6] = n.kg ?? null; row[7] = n.x ? 1 : 0;
    if (!n.l) row[9] = 2;
  }
  for (const q of Object.keys(games.names)) { const n = nodes.get(+q); if (n && dropped.has(+q)) games.names[q] = n.n; }
  fs.writeFileSync(GAMES, JSON.stringify(games));

  for (const [what, list] of Object.entries(log)) { console.log(`\n${what}: ${list.length}`); console.log('  ' + list.slice(0, Number(process.env.SHOW || 8)).join('\n  ')); }
  console.log(`\nwrote ${slicesOut} tree slices, ${findOut} search files and games.json`);
})();
