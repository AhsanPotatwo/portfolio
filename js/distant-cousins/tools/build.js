// builds distant cousins' tree out of a wikidata export and the paleobiology database.
//   node --max-old-space-size=6000 js/distant-cousins/tools/build.js <folder of raw tsvs>
// the raw folder comes from export.sh (wikidata through the qlever mirror) plus pbdb-taxa.txt from
// paleobiodb.org/data1.2/taxa/list.txt?base_name=Metazoa&taxon_status=accepted&show=app
//
// every animal wikidata knows (2.3 million) goes through here, but only the ones people might have heard of
// are written out: anything with a wikipedia article, a photo, an english name or a fossil date, and every
// ancestor of those. the rest (mostly beetles and wasps with only a latin name) the page asks wikidata for
// when you open their branch, so each node just remembers how many of those it has.
//
// out: js/distant-cousins/tree/<qid>.json   one file per slice of the tree, named after the slice's top node
//      js/distant-cousins/find/<ab>.json    names for the search box, by the first two letters of each word

const fs = require('fs');
const path = require('path');

const RAW = process.argv[2];
const OUT = path.join(__dirname, '..');
const ROOT = 2382443;          // Biota: all life, the last universal common ancestor
const ANIMALS = 729;
const SLICE = 2500;            // about how many nodes go in one tree file

// old catch-all groups that aren't real branches of the tree (paraphyletic or retired). nothing hangs off them:
// their children go to their other parent, or to the group's own parent if they have no other
const RETIRED = new Set([43806 /* Invertebrata */, 10892 /* Protista */, 101274 /* Protozoa */, 97263158 /* Monera */,
  19081 /* Prokaryota */, 151542 /* Metazoa, a second copy of Animalia */, 862296 /* Chromista */, 477950 /* Chromalveolata */,
  23419047 /* Problematica: fossils nobody can place */]);
// branches beside the animal line that the tree points at but doesn't follow. viruses aren't on the tree of
// cells at all, so they're left off
const OTHER_LIFE = new Set([756 /* plants */, 10876 /* bacteria */, 10872 /* archaea */, 764 /* fungi */,
  473809 /* amoebas */, 129012 /* choanoflagellates */, 860203 /* bikonts: algae and most protists */]);

// dates the fossil database gets wrong or doesn't have, for the oldest branches. million years ago
const FIRST_SEEN = {
  2382443: 4200, // LUCA, from molecular clocks (Moody et al. 2024)
  10876: 3500, 10872: 3500, 3322575: 4200,
  19088: 1650,   // eukaryotes, oldest accepted fossils
  756: 1050, 764: 1000,
  729: 635,      // animals: sponge biomarkers. pbdb's 2050 is a disputed find
  15978631: 0.3, // us: Jebel Irhoud. pbdb has a 5 million year old record that can't be right
};

// ---- reading the tsvs ----

const qid = s => +s.slice(s.lastIndexOf('/Q') + 2, -1);
function literal(s) {
  if (s[0] !== '"') return s;
  const end = s.lastIndexOf('"');
  return s.slice(1, end).replace(/\\(.)/g, (m, c) => c === 't' ? '\t' : c === 'n' ? '\n' : c);
}
function each(file, fn) {
  const text = fs.readFileSync(path.join(RAW, file), 'utf8');
  let start = text.indexOf('\n') + 1;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    if (end > start) fn(text.slice(start, end).split('\t'));
    start = end + 1;
  }
}

const parents = new Map();          // qid -> [parent qids]
const name = new Map(), label = new Map(), links = new Map(), wiki = new Map(), image = new Map();
const common = new Map(), alt = new Map(), rank = new Map(), fossil = new Set(), iucn = new Map(), pbdbId = new Map();
const add = (map, k, v) => { const a = map.get(k); a ? a.includes(v) || a.push(v) : map.set(k, [v]); };

console.log('reading');
each('edges.tsv', ([t, p]) => add(parents, qid(t), qid(p)));
each('toppar.tsv', ([t, p]) => { if (p) add(parents, qid(t), qid(p)); });
each('names.tsv', ([t, n]) => name.has(qid(t)) || name.set(qid(t), literal(n)));
each('labels.tsv', ([t, l]) => label.set(qid(t), literal(l)));
each('links.tsv', ([t, s]) => links.set(qid(t), +literal(s)));
each('enwiki.tsv', ([t, w]) => wiki.set(qid(t), literal(w)));
each('images.tsv', ([t, i]) => image.has(qid(t)) || image.set(qid(t), decodeURIComponent(i.slice(i.indexOf('FilePath/') + 9, -1))));
each('common.tsv', ([t, c]) => add(common, qid(t), literal(c)));
each('alt.tsv', ([t, c]) => add(alt, qid(t), literal(c)));
each('ranks.tsv', ([t, r]) => rank.set(qid(t), qid(r)));
each('fossil.tsv', ([t]) => fossil.add(qid(t)));
each('iucn.tsv', ([t, s]) => iucn.set(qid(t), qid(s)));
each('pbdb.tsv', ([t, id]) => pbdbId.set(qid(t), +literal(id)));
// the branches near the root: everything hanging off the line from life to animals
const otherLife = [];
each('topx.tsv', ([t, p, n, l, s, w, i]) => {
  const q = qid(t);
  if (OTHER_LIFE.has(q) && !otherLife.includes(q)) {
    otherLife.push(q);
    parents.set(q, [qid(p)]);
    if (n) name.set(q, literal(n));
    if (l) label.set(q, literal(l));
    if (s) links.set(q, +s);
    if (w) wiki.set(q, literal(w));
    if (i && !image.has(q)) image.set(q, decodeURIComponent(i.slice(i.indexOf('FilePath/') + 9, -1)));
  }
});
// the root and the line up to animals have their names and pictures in toppar
each('toppar.tsv', ([t, p, n, l, w, i]) => {
  const q = qid(t);
  if (n && !name.has(q)) name.set(q, literal(n));
  if (l && !label.has(q)) label.set(q, literal(l));
  if (w && !wiki.has(q)) wiki.set(q, literal(w));
  if (i && !image.has(q)) image.set(q, decodeURIComponent(i.slice(i.indexOf('FilePath/') + 9, -1)));
});
// pictures that need changing: wikidata's human is a nude drawing, so a family out for a walk instead. two
// groups near us lose theirs (a nude museum model, an odd old portrait) and show their best known member
const SWAP_PICTURE = { 15978631: 'A mixed-race family walking in a park with European flags (P044728-798775).jpg' };
const NO_PICTURE = [605457 /* Hominina */, 242047 /* Homininae */];
for (const [q, f] of Object.entries(SWAP_PICTURE)) image.set(+q, f);
for (const q of NO_PICTURE) image.delete(q);

// silhouettes from phylopic (phylopic.js), for creatures you haven't discovered yet. only the public domain
// ones, so a mystery card never needs a credit line
const silByName = new Map(), silByPbdb = new Map();
if (fs.existsSync(path.join(RAW, 'phylopic.json'))) {
  for (const [uuid, licence, , names, pbdb] of JSON.parse(fs.readFileSync(path.join(RAW, 'phylopic.json'), 'utf8'))) {
    if (!/publicdomain/.test(licence)) continue;
    for (const n of names) if (!silByName.has(n)) silByName.set(n, uuid);
    for (const id of pbdb) if (!silByPbdb.has(id)) silByPbdb.set(id, uuid);
  }
}
const silhouette = q => silByPbdb.get(pbdbId.get(q)) || silByName.get(name.get(q));

const rankName = new Map();
each('rankl.tsv', ([r, l]) => rankName.set(qid(r), literal(l)));

// pbdb: first and last appearance for a name, in million years ago
const pbdbByName = new Map(), pbdbByNo = new Map();
{
  const text = fs.readFileSync(path.join(RAW, 'pbdb-taxa.txt'), 'utf8').split('\n');
  const head = JSON.parse('[' + text[0] + ']');
  const col = k => head.indexOf(k);
  // the younger end of each range: the older end is the start of whatever age the rock is from, often millions
  // of years before the animal (pbdb puts the first lion at 5.3, the start of the Pliocene)
  const [cOrig, cTax, cName, cExt, cFea, cLla] = ['orig_no', 'taxon_no', 'taxon_name', 'is_extant', 'firstapp_min_ma', 'lastapp_min_ma'].map(col);
  for (let i = 1; i < text.length; i++) {
    if (!text[i]) continue;
    const r = JSON.parse('[' + text[i] + ']');
    const rec = { first: r[cFea] === '' ? null : +r[cFea], last: r[cLla] === '' ? null : +r[cLla], extant: r[cExt] === 'extant' ? true : r[cExt] === 'extinct' ? false : null };
    pbdbByName.set(r[cName], rec);
    pbdbByNo.set(+r[cOrig], rec);
    pbdbByNo.set(+r[cTax], rec);
  }
}

// ---- one parent each ----
// wikidata often gives a taxon two or three parents (an old one and a newer, finer clade). take the deepest,
// which is nearly always the most up to date placement

console.log('placing', parents.size, 'taxa');
const depth = new Map([[ROOT, 0]]);
{
  const busy = new Set();
  for (const start of parents.keys()) {
    if (depth.has(start)) continue;
    const stack = [start];
    while (stack.length) {
      const q = stack[stack.length - 1];
      if (depth.has(q)) { stack.pop(); continue; }
      busy.add(q);
      const ps = (parents.get(q) || []).filter(p => !busy.has(p) || depth.has(p));
      const todo = ps.find(p => !depth.has(p) && parents.has(p));
      if (todo !== undefined) { stack.push(todo); continue; }
      let best = -1;
      for (const p of ps) if (depth.get(p) >= 0) best = Math.max(best, depth.get(p));
      depth.set(q, best < 0 ? -1 : best + 1);
      busy.delete(q);
      stack.pop();
    }
  }
}
// now pick: deepest real parent, else the retired group's own parent
const parent = new Map();
for (const [q, ps] of parents) {
  if (q === ROOT) continue;
  let pick, pickDepth = -2;
  for (const p of ps) {
    if (RETIRED.has(p)) continue;
    const d = depth.get(p);
    if (d !== undefined && d >= 0 && d > pickDepth) { pick = p; pickDepth = d; }
  }
  if (pick === undefined) for (const p of ps) {
    let up = p, seen = 0;
    while (RETIRED.has(up) && seen++ < 5) up = (parents.get(up) || []).find(x => !RETIRED.has(x)) ?? (parents.get(up) || [])[0];
    if (up !== undefined && depth.get(up) >= 0) { pick = up; break; }
  }
  if (pick !== undefined && !RETIRED.has(q)) parent.set(q, pick);
}
// walk up from everything so loops (a parent of its own parent) get cut where they start
const kids = new Map();
const reaches = new Map([[ROOT, true]]);
for (const q of parent.keys()) {
  const trail = [];
  let x = q;
  while (!reaches.has(x)) {
    if (trail.includes(x)) { reaches.set(x, false); break; }
    trail.push(x);
    const p = parent.get(x);
    if (p === undefined) { reaches.set(x, false); break; }
    x = p;
  }
  const ok = reaches.get(x);
  for (const t of trail) reaches.set(t, ok);
}
for (const [q, p] of parent) if (reaches.get(q)) add(kids, p, q);
console.log('on the tree', [...reaches.values()].filter(Boolean).length);

// ---- names ----

const SPECIES = 7432, SUBSPECIES = 68947;
const LOW = new Set([SPECIES, SUBSPECIES, 34740 /* genus */, 3238261 /* subgenus */, 279749 /* form */, 767728 /* variety */]);
const cap = s => s && s[0].toUpperCase() + s.slice(1);
const same = (a, b) => a.toLowerCase().replace(/[^a-z]/g, '') === b.toLowerCase().replace(/[^a-z]/g, '');
// the friendly name: wikidata writes common names in lower case ("lion", "mammal"), so a lower case label is
// one. failing that a listed common name, then a label that isn't just the latin again with bits on
// ("Dawsonia Nicholson (1873)", "Odonthornithes")
const latinish = (l, n) => l.startsWith(n) || /^[A-Z][a-z]+( [a-z]+)?$/.test(l) && l.length >= n.length - 1 && l.slice(0, 4).toLowerCase() === n.slice(0, 4).toLowerCase();
const friendlyOf = new Map();
const friendly = q => { if (!friendlyOf.has(q)) friendlyOf.set(q, friendlyName(q)); return friendlyOf.get(q); };
function friendlyName(q) {
  const n = name.get(q) || '', l = label.get(q);
  if (l && !n) return cap(l);
  if (l && /^[a-z]/.test(l) && !same(l, n)) return cap(l);
  const c = (common.get(q) || []).find(c => !same(c, n) && !latinish(c, n));
  if (c) return cap(c);
  return l && !same(l, n) && !latinish(l, n) && !/^[A-Z][a-z]+ [a-z]+$/.test(l) ? l : '';
}

// ---- who gets written out ----

const first = new Map(), last = new Map(), extinct = new Set();
// cap is the oldest its nearest dated ancestor could be. a date older than that is a different animal with
// the same name (pbdb has a few: living birds whose names a trilobite had first), so it's thrown away
function ages(q, animal, cap) {
  // pbdb only has animals, so outside them a matching name is someone else (Archaea is also a fossil spider)
  // only genera and below share names; a match wikidata links by id is the right one
  let rec = animal && pbdbByNo.get(pbdbId.get(q));
  if (!rec && animal) {
    rec = pbdbByName.get(name.get(q));
    if (rec && rec.first !== null && LOW.has(rank.get(q)) && rec.first > cap * 1.02 + 0.5) rec = null;
  }
  if (rec) {
    if (rec.first !== null) first.set(q, rec.first);
    if (rec.extant === false) { extinct.add(q); if (rec.last !== null) last.set(q, rec.last); }
  } else if (fossil.has(q) || iucn.get(q) === 237350) extinct.add(q);
  if (rec && rec.extant === true) extinct.delete(q);
  if (FIRST_SEEN[q]) first.set(q, FIRST_SEEN[q]);
  return first.has(q) ? first.get(q) : cap;
}

const core = new Set();
const order = [];                  // root first, so reversed it's children before parents
{
  const stack = [[ROOT, false, 4200]];
  while (stack.length) {
    const [q, animal, cap] = stack.pop();
    order.push(q);
    const under = ages(q, animal || q === ANIMALS, cap);
    for (const k of kids.get(q) || []) stack.push([k, animal || q === ANIMALS, under]);
  }
}
// a group whose members all moved under newer groups is left empty: not a tip of the tree, just an old name
const empty = q => !(kids.get(q) || []).length && !LOW.has(rank.get(q)) && !first.has(q) && !otherLife.includes(q);
for (const q of order) {
  if ((wiki.has(q) || image.has(q) || friendly(q) || first.has(q) || otherLife.includes(q)) && !empty(q)) {
    for (let x = q; x !== undefined && !core.has(x); x = parent.get(x)) core.add(x);
  }
}
core.add(ROOT);
console.log('written out', core.size, 'of', order.length);

// counts, pictures and fossil dates, children before parents
const species = new Map(), fame = new Map(), pic = new Map(), tail = new Map(), stars = new Map(), sil = new Map();
for (let i = order.length - 1; i >= 0; i--) {
  const q = order[i];
  const ks = kids.get(q) || [];
  const r = rank.get(q);
  let n = r === SPECIES || (!ks.length && r !== SUBSPECIES) ? 1 : 0;
  let f = links.get(q) || 0, best = image.has(q) ? [f, q] : null, fa = first.get(q), oldest;
  let t = 0;
  for (const k of ks) {
    n += species.get(k) || 0;
    f = Math.max(f, fame.get(k) || 0);
    const b = pic.get(k);
    if (b && (!best || b[0] > best[0])) best = b;
    // a group is at least as old as anything in it (pbdb sometimes has a group younger than its members,
    // when its idea of the group is smaller than wikidata's)
    if (first.has(k) && (oldest === undefined || first.get(k) > oldest)) oldest = first.get(k);
    if (!core.has(k)) t++;
  }
  // the best known animals somewhere inside, so you can jump from Mammal straight to the lion
  if (core.has(q) && ks.length) {
    const pool = new Set();
    for (const k of ks) {
      if (!core.has(k)) continue;
      if (friendly(k)) pool.add(k);
      for (const s of stars.get(k) || []) pool.add(s);
    }
    const best = [...pool].sort((a, b) => (links.get(b) || 0) - (links.get(a) || 0)).slice(0, 6);
    if (best.length) stars.set(q, best);
  }
  // the silhouette a group shows: its own, else its best known member's (the kangaroo order shows a kangaroo)
  let bestSil = silhouette(q) ? [links.get(q) || 0, silhouette(q)] : null;
  if (!bestSil) for (const k of ks) { const s = sil.get(k); if (s && (!bestSil || s[0] > bestSil[0])) bestSil = s; }
  if (bestSil) sil.set(q, bestSil);
  species.set(q, n); fame.set(q, f); tail.set(q, t);
  if (best) pic.set(q, best);
  if (!FIRST_SEEN[q] && oldest !== undefined && (fa === undefined || oldest > fa)) first.set(q, oldest);
  // a group is gone if everything in it is gone
  if (ks.length && ks.every(k => extinct.has(k))) extinct.add(q);
}
// and nothing older than the dates set by hand above it (pbdb has sponges before animals, from a disputed find)
for (const q of order) {
  const p = parent.get(q);
  if (first.has(q) && first.has(p) && first.get(q) > first.get(p)) first.set(q, first.get(p));
}
// children in the order they're shown: the famous branches first
for (const ks of kids.values()) ks.sort((a, b) => (fame.get(b) || 0) - (fame.get(a) || 0) || (name.get(a) || '').localeCompare(name.get(b) || ''));

// ---- slicing the tree into files ----

const sliceOf = new Map();
{
  const open = new Map();            // nodes still waiting for a slice under each node
  for (let i = order.length - 1; i >= 0; i--) {
    const q = order[i];
    if (!core.has(q)) continue;
    const ks = (kids.get(q) || []).filter(k => core.has(k));
    let size = 1;
    const sizes = ks.map(k => [k, open.get(k)]).sort((a, b) => b[1] - a[1]);
    for (const [, s] of sizes) size += s;
    // too big: the biggest branches become their own slices
    for (const [k, s] of sizes) { if (size <= SLICE) break; sliceOf.set(k, k); size -= s; }
    open.set(q, size);
  }
  sliceOf.set(ROOT, ROOT);
  for (const q of order) if (core.has(q) && !sliceOf.has(q)) sliceOf.set(q, sliceOf.get(parent.get(q)));
}

const round = x => x === undefined ? undefined : x >= 10 ? Math.round(x * 10) / 10 : Math.round(x * 1000) / 1000;
const ranks = [...new Set([...core].map(q => rank.get(q)).filter(Boolean))];
// one node as the page reads it. keys left out when empty
function record(q) {
  const o = { q, n: name.get(q) || label.get(q) || 'Q' + q };
  const f = friendly(q);
  if (f) o.l = f;
  const r = rank.get(q);
  if (r && rankName.has(r)) o.r = rankName.get(r);
  if (image.has(q)) o.i = image.get(q);
  else if (pic.has(q)) { const b = pic.get(q)[1]; o.i = image.get(b); o.p = friendly(b) || name.get(b); }
  const w = wiki.get(q);
  if (w) o.w = w === o.n ? 1 : w === o.l ? 2 : w;
  if (first.has(q)) o.a = round(first.get(q));
  if (extinct.has(q)) { o.x = 1; if (last.has(q)) o.z = round(last.get(q)); }
  const s = species.get(q);
  if (s > 1 || (kids.get(q) || []).length) o.s = s;
  const ks = (kids.get(q) || []).filter(k => core.has(k));
  if (ks.length) o.k = ks;
  if (tail.get(q)) o.t = tail.get(q);
  // famous members, [qid, slice, name], only where there's a choice of branches to skip past
  if (ks.length > 1 && stars.has(q)) o.m = stars.get(q).map(s => [s, sliceOf.get(s), friendly(s)]);
  if (otherLife.includes(q)) o.o = 1;
  // its silhouette, or its best known member's. a species with neither uses its nearest ancestor's (page.js)
  if (sil.has(q)) o.si = sil.get(q)[1];
  if (sliceOf.get(q) === q && q !== ROOT) o.f = q;
  return o;
}

console.log('writing');
const treeDir = path.join(OUT, 'tree'), findDir = path.join(OUT, 'find');
for (const d of [treeDir, findDir]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
const slices = new Map();
for (const q of order) if (core.has(q)) add(slices, sliceOf.get(q), q);
let biggest = 0;
for (const [top, qs] of slices) {
  // the trunk under the slice: every ancestor from LUCA up, with what the comparison needs
  const up = [];
  for (let x = parent.get(top); x !== undefined; x = parent.get(x)) {
    const u = { q: x, n: name.get(x), f: sliceOf.get(x) };
    if (sil.has(x)) u.si = sil.get(x)[1];
    const fr = friendly(x); if (fr) u.l = fr;
    if (first.has(x)) u.a = round(first.get(x));
    up.unshift(u);
  }
  const nodes = qs.map(record);
  // the tops of the slices above this one, so their cards can show without opening them
  for (const q of qs) for (const k of kids.get(q) || []) if (core.has(k) && sliceOf.get(k) !== top) nodes.push(record(k));
  const json = JSON.stringify({ up, nodes });
  biggest = Math.max(biggest, json.length);
  fs.writeFileSync(path.join(treeDir, top + '.json'), json);
}
// every slice by name (the surprise key picks one), and how many animals there are to meet
fs.writeFileSync(path.join(treeDir, 'index.json'), JSON.stringify({ count: core.size, species: species.get(ANIMALS), slices: [...slices.keys()] }));
console.log(slices.size, 'tree files, biggest', Math.round(biggest / 1024), 'KB');

// ---- the search box ----
// every name a node goes by, filed under the first two letters of each word in it
const plain = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const find = new Map();
for (const q of core) {
  const names = [name.get(q), label.get(q), friendly(q), ...(common.get(q) || []), ...(alt.get(q) || [])].filter(Boolean);
  const seen = new Set(), terms = [];
  for (const n of names) { const p = plain(n); if (p && !/^q\d+$/.test(p) && !seen.has(p)) { seen.add(p); terms.push(n); } }
  if (!terms.length) continue;
  // latin-only names under their first two letters, named ones under every word ("elephant" finds African bush elephant)
  terms.length = Math.min(terms.length, 8);
  const keys = new Set();
  if (terms.length === 1) keys.add(plain(terms[0]).slice(0, 2));
  else for (const t of terms) for (const w of plain(t).split(' ')) if (w.length >= 2) keys.add(w.slice(0, 2));
  // [qid, slice, fame, names...]: the first name is the latin one, then what it's called
  const entry = [q, sliceOf.get(q), links.get(q) || 0, ...terms];
  for (const k of keys) add(find, k, entry);
}
// busy pairs of letters ("ca", "pa") would be a megabyte each, so those go by three letters instead, and
// split.json tells the page which ones wait for the third letter
let findBytes = 0, files = 0;
const split = [];
const write = (k, entries) => {
  entries.sort((a, b) => b[2] - a[2]);
  const json = JSON.stringify(entries);
  findBytes += json.length; files++;
  // windows won't have a file called aux, con, nul or prn (whatever comes after the dot), so those get an
  // underscore. page.js does the same when it asks for one
  fs.writeFileSync(path.join(findDir, k.replace(/^(aux|con|nul|prn)$/, '$1_') + '.json'), json);
};
for (const [k, entries] of find) {
  if (JSON.stringify(entries).length < 200000) { write(k, entries); continue; }
  split.push(k);
  const three = new Map();
  for (const e of entries) {
    const keys = new Set();
    for (const t of e.slice(3)) for (const w of plain(t).split(' ')) if (w.startsWith(k) && w.length >= 3) keys.add(w.slice(0, 3));
    for (const k3 of keys) add(three, k3, e);
  }
  for (const [k3, es] of three) write(k3, es);
}
fs.writeFileSync(path.join(findDir, 'split.json'), JSON.stringify(split.sort()));
console.log(files, 'search files,', Math.round(findBytes / 1048576), 'MB,', split.length, 'split by three letters');
