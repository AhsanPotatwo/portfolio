// builds distant cousins' tree out of a wikidata export and the paleobiology database.
//   node --max-old-space-size=6000 js/distant-cousins/tools/build.js <folder of raw tsvs>
// the raw folder comes from export.sh (wikidata through the qlever mirror) plus pbdb-taxa.txt from
// paleobiodb.org/data1.2/taxa/list.txt?base_name=Metazoa&taxon_status=accepted&show=app, phylopic.json from
// phylopic.js and media.json from media.js (the pictures in each wikipedia article, see "pictures" below).
//
// every animal wikidata knows (2.3 million) goes through here, but only the ones people might have heard of
// are written out: anything with a wikipedia article, a photo, an english name or a fossil date, and every
// ancestor of those. the rest (mostly beetles and wasps with only a latin name) the page asks wikidata for
// when you open their branch, so each node just remembers how many of those it has.
//
// out: js/distant-cousins/tree/<qid>.json   one file per slice of the tree, named after the slice's top node
//      js/distant-cousins/find/<ab>.json    names for the search box, by the first two letters of each word
//      <raw>/media-wanted.txt               articles whose pictures media.js should fetch before the next build

const fs = require('fs');
const path = require('path');

const RAW = process.argv[2];
const OUT = path.join(__dirname, '..');
const ROOT = 2382443;          // Biota: all life, the last universal common ancestor
const ANIMALS = 729;
const EUKARYOTES = 19088;
const SLICE = 2500;            // about how many nodes go in one tree file
const has = f => fs.existsSync(path.join(RAW, f));

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
const names = new Map();            // every latin name given: the one that fits the rank is picked below
each('names.tsv', ([t, n]) => add(names, qid(t), literal(n)));
each('labels.tsv', ([t, l]) => label.set(qid(t), literal(l)));
each('links.tsv', ([t, s]) => links.set(qid(t), +literal(s)));
each('enwiki.tsv', ([t, w]) => wiki.set(qid(t), literal(w)));
each('images.tsv', ([t, i]) => image.has(qid(t)) || image.set(qid(t), decodeURIComponent(i.slice(i.indexOf('FilePath/') + 9, -1))));
each('common.tsv', ([t, c]) => add(common, qid(t), literal(c)));
each('alt.tsv', ([t, c]) => add(alt, qid(t), literal(c)));
each('ranks.tsv', ([t, r]) => rank.set(qid(t), qid(r)));
// a species' name is two words, a subspecies' three, anything else one. the western honey bee has a second,
// one word "latin name" (Spoderman) that somebody slipped in, which this leaves out
// when that's its only one (the honey bee's), the english label, if it's the latin name, is used instead
for (const [q, ns] of names) {
  const words = { 7432: 2, 68947: 3 }[rank.get(q)] || 1;
  const fits = n => n && n.split(' ').length === words && /^[A-Z][a-z-]+( [a-z-]+)*$/.test(n);
  name.set(q, ns.find(fits) || (fits(label.get(q)) ? label.get(q) : ns[0]));
}
names.clear();
each('fossil.tsv', ([t]) => fossil.add(qid(t)));
each('iucn.tsv', ([t, s]) => iucn.set(qid(t), qid(s)));
each('pbdb.tsv', ([t, id]) => pbdbId.set(qid(t), +literal(id)));
// synonyms, misspellings, footprints, eggs and the like (export.sh's junk list) go the way of the retired groups
if (has('junk.tsv')) each('junk.tsv', ([t]) => RETIRED.add(qid(t)));
// ids in the databases phylopic links its silhouettes to
const otherIds = new Map();
for (const [file, at] of [['gbif.tsv', 'gbif.org/species/'], ['ncbi.tsv', 'ncbi.nlm.nih.gov/taxid/'], ['ott.tsv', 'opentreeoflife.org/taxonomy/']])
  if (has(file)) each(file, ([t, id]) => add(otherIds, qid(t), at + literal(id)));
// adult weight in kg: the biggest figure given (the others are usually newborns or eggs)
const KG = { 41803: 1e-3, 11570: 1, 191118: 1000, 100995: 0.4536, 48013: 0.02835, 3241121: 1e-6 };
const mass = new Map();
if (has('mass.tsv')) each('mass.tsv', ([t, v, u]) => {
  const per = KG[qid(u || '/Q0>')], kg = +literal(v) * per;
  if (per && kg > 0 && !(mass.get(qid(t)) >= kg)) mass.set(qid(t), kg);
});
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
// groups near us lose theirs (a nude museum model, an odd old portrait)
const SWAP_PICTURE = { 15978631: 'A mixed-race family walking in a park with European flags (P044728-798775).jpg' };
const NO_PICTURE = [605457 /* Hominina */, 242047 /* Homininae */];
for (const [q, f] of Object.entries(SWAP_PICTURE)) image.set(+q, f);
for (const q of NO_PICTURE) image.delete(q);

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
for (const [q, p] of [...parent]) if (reaches.get(q)) add(kids, p, q); else parent.delete(q);
console.log('on the tree', parent.size + 1);

// ---- names ----

const SPECIES = 7432, SUBSPECIES = 68947, GENUS = 34740, SUBGENUS = 3238261;
const KINGDOM = 36732, PHYLUM = 38348, CLASS = 37517, ORDER = 36602, FAMILY = 35409;
const LOW = new Set([SPECIES, SUBSPECIES, GENUS, SUBGENUS, 279749 /* form */, 767728 /* variety */]);
const ONE_KIND = new Set([SPECIES, SUBSPECIES, 279749, 767728]);
const cap = s => s && s[0].toUpperCase() + s.slice(1);
const same = (a, b) => a.toLowerCase().replace(/[^a-z]/g, '') === b.toLowerCase().replace(/[^a-z]/g, '');
// the friendly name: wikidata writes common names in lower case ("lion", "mammal"), so a lower case label is
// one. failing that a listed common name, then a label that isn't just the latin again with bits on
// ("Dawsonia Nicholson (1873)", "Odonthornithes"). groups also try their other english labels, where the
// everyday names often are ("molluscs", "cat family"), and read in the plural: the card is all of them
const latinish = (l, n) => l.startsWith(n) || /^[A-Z][a-z]+( [a-z]+)?$/.test(l) && l.length >= n.length - 1 && l.slice(0, 4).toLowerCase() === n.slice(0, 4).toLowerCase();
const RANK_WORD = /\b(sub|super|infra|parv)?(kingdom|phylum|class|order|family|genus|tribe|clade|species|taxon|group)\b/i;
// names somebody slipped in that the rules below can't catch (Homo erectus as "Caveman")
const JOKES = /^(caveman|cavemen)$/i;
const plural = w => /(s|fish|sheep|deer|people|fauna)$/i.test(w) ? w : /(ch|sh|x)$/.test(w) ? w + 'es' : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : w + 's';
const friendlyOf = new Map();
const friendly = q => { if (!friendlyOf.has(q)) friendlyOf.set(q, friendlyName(q)); return friendlyOf.get(q); };
function friendlyName(q) {
  const n = name.get(q) || '', l = label.get(q);
  if (l && !n) return cap(l);
  // (a fossil genus is one creature, Iguanodon not "Iguanodonts")
  const isGroup = (kids.get(q) || []).length && !ONE_KIND.has(rank.get(q)) && !(rank.get(q) === GENUS && extinct.has(q));
  // short and plain: no lists ("Cuckoo, Carpenter, Digger, Bumble, and Honey Bees"), no ranks, no brackets
  const plain = s => s && !same(s, n) && !latinish(s, n) && !/[,()\d]/.test(s) && s.split(' ').length <= 4
    && !RANK_WORD.test(rank.get(q) === FAMILY ? s.replace(/ family$/i, '') : s);
  if (isGroup) {
    const pool = [l && /^[a-z]/.test(l) ? l : '', ...(common.get(q) || []), ...(alt.get(q) || []).filter(a => /^[a-z]/.test(a))].filter(plain);
    const pick = rank.get(q) === FAMILY && pool.find(s => / family$/i.test(s)) || pool.find(s => /[^s]s$/.test(s)) || pool[0];
    if (pick) return cap(/^[a-z]+$/i.test(pick) ? plural(pick) : pick);
  } else {
    // a label none of its other english names back up is somebody's joke (the silkworm was "Don Hugo")
    const others = [wiki.get(q), ...(common.get(q) || []), ...(alt.get(q) || [])].filter(Boolean);
    const trusted = l && (others.length < 2 || others.some(o => same(o, l)));
    if (l && trusted && /^[a-z]/.test(l) && !same(l, n)) return cap(l);
    // and of its common names, one its other labels back up first (the silkworm's first is "Don Hugo" too)
    const cs = (common.get(q) || []).filter(c => !same(c, n) && !latinish(c, n) && !JOKES.test(c));
    const c = cs.find(c => (alt.get(q) || []).some(a => same(a, c))) || cs[0];
    if (c) return cap(c);
    if (l && !trusted) return '';
  }
  return l && !same(l, n) && !latinish(l, n) && !/^[A-Z][a-z]+ [a-z]+$/.test(l) ? l : '';
}
// the first few names by hand: they're what everyone meets first, and wikidata's are clumsy ("Arthropod
// animals", "Octopodes") or missing (the true jellyfish only go by Scyphozoa)
const NAMES = { [EUKARYOTES]: 'Eukaryotes', [ANIMALS]: 'Animals', 1360: 'Arthropods', 19159: 'Four-limbed animals',
  128257: 'Cephalopods', 30587689: 'Spiders', 59256: 'Brittle stars', 83483: 'Sea urchins', 209924: 'Calcareous sponges',
  25309: 'Cockroaches and termites', 28319: 'Butterflies and moths', 127282: 'Ray-finned fishes', 147256: 'Sea anemones',
  272388: 'Jellyfish', 1650384: 'Ammonites', 18960: 'Sponges', 839350: 'Earthworms and leeches', 276412: 'Seed shrimps',
  972302: 'Land snails and slugs', 733595: 'Sea slugs', 26371: 'True bugs', 167810: 'Grasshoppers and crickets',
  1045208: 'Springtails', 5194: 'Water bears', 25371: 'Sharks and rays', 132674: 'Corals and anemones', 40152: 'Octopuses' };
for (const [q, l] of Object.entries(NAMES)) friendlyOf.set(+q, l);

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

const order = [];                  // root first, so reversed it's children before parents
const walkDown = () => {
  order.length = 0;
  const stack = [ROOT];
  while (stack.length) { const q = stack.pop(); order.push(q); for (const k of kids.get(q) || []) stack.push(k); }
};
{
  const stack = [[ROOT, false, 4200]];
  while (stack.length) {
    const [q, animal, cap] = stack.pop();
    order.push(q);
    const under = ages(q, animal || q === ANIMALS, cap);
    for (const k of kids.get(q) || []) stack.push([k, animal || q === ANIMALS, under]);
  }
}
const core = new Set();
// a group whose members all moved under newer groups is left empty: not a tip of the tree, just an old name
const empty = q => !(kids.get(q) || []).length && !LOW.has(rank.get(q)) && !first.has(q) && !otherLife.includes(q);
for (const q of order) {
  if ((wiki.has(q) || image.has(q) || friendly(q) || first.has(q) || otherLife.includes(q)) && !empty(q)) {
    for (let x = q; x !== undefined && !core.has(x); x = parent.get(x)) core.add(x);
  }
}
core.add(ROOT);
console.log('written out', core.size, 'of', order.length);

// ---- fewer, better known branches ----
// wikidata has every clade anyone has named, which put the lion 79 steps from the first life (Neokaryotes,
// Podiata, Zatheria...). the board keeps the classic ranks (kingdom, phylum, class, order, family, genus,
// species) and the clades famous enough to have an everyday name (dinosaurs, vertebrates, bees). the rest are
// folded away, and what hung from them hangs from the next group up. the lion is now 11 steps down
const CLASSIC = new Set([KINGDOM, PHYLUM, CLASS, ORDER, FAMILY, GENUS, ...ONE_KIND]);
const FAMOUS = 90;                 // this many wikipedias have a page on it
const KEEP = new Set([ROOT, EUKARYOTES, ANIMALS]);
const toAnimals = new Set();
for (let x = ANIMALS; x !== undefined; x = parent.get(x)) toAnimals.add(x);
function keeps(q) {
  if (KEEP.has(q) || otherLife.includes(q)) return true;
  if (toAnimals.has(q)) return false;
  if (CLASSIC.has(rank.get(q))) return true;
  if (!(kids.get(q) || []).some(k => core.has(k))) return true;   // the tip of a branch
  return (links.get(q) || 0) >= FAMOUS && !!friendly(q);
}
const gone = new Set([...core].filter(q => !keeps(q)));
const folded = new Map();          // a group -> the groups folded into it (page.js asks wikidata for their latin-only members too)
const absorbed = new Map();        // a lone member -> the groups above it that became it, nearest first
{
  const upTo = q => { let p = parent.get(q); while (gone.has(p)) p = parent.get(p); return p; };
  const moves = [];
  for (const q of parent.keys()) {
    if (gone.has(q)) add(folded, upTo(q), q);
    else if (gone.has(parent.get(q))) moves.push([q, upTo(q)]);
  }
  for (const [q, p] of moves) parent.set(q, p);
  for (const q of gone) parent.delete(q);
  kids.clear();
  for (const [q, p] of parent) add(kids, p, q);
}
walkDown();
// a group with one member is that member: a genus of one species is just the species, and the species takes
// the genus's article, picture and name if it has none (Gigantopithecus is famous, G. blacki isn't). a species
// with one subspecies listed keeps itself instead. bottom up, so a whole chain of one-member groups goes at once
{
  const pass = (k, q) => {
    for (const x of [q, ...(folded.get(q) || [])]) add(folded, k, x);
    folded.delete(q);
    gone.add(q); core.delete(q);
  };
  for (let i = order.length - 1; i >= 0; i--) {
    const q = order[i];
    if (KEEP.has(q) || otherLife.includes(q) || !core.has(q)) continue;
    const ks = kids.get(q) || [];
    if (ks.length !== 1 || !core.has(ks[0])) continue;
    const k = ks[0];
    if (ONE_KIND.has(rank.get(q)) && rank.get(k) === SUBSPECIES) {
      for (const g of kids.get(k) || []) { parent.set(g, q); add(kids, q, g); }
      kids.set(q, (kids.get(q) || []).filter(x => x !== k));
      kids.delete(k); parent.delete(k);
      pass(q, k);
      continue;
    }
    const p = parent.get(q);
    kids.set(p, kids.get(p).map(x => x === q ? k : x));
    parent.set(k, p);
    kids.delete(q); parent.delete(q);
    add(absorbed, k, q);
    for (const a of absorbed.get(q) || []) add(absorbed, k, a);
    absorbed.delete(q);
    pass(k, q);
    if (!wiki.has(k) && wiki.has(q)) wiki.set(k, wiki.get(q));
    if (!image.has(k) && image.has(q)) image.set(k, image.get(q));
    links.set(k, Math.max(links.get(k) || 0, links.get(q) || 0));
    if (first.has(q) && !(first.get(k) >= first.get(q))) first.set(k, first.get(q));
    // its name: the genus's everyday one, else the genus itself when that's the one with the article
    if (!friendly(k) && rank.get(q) === GENUS) friendlyOf.set(k, friendly(q) || (wiki.get(k) === wiki.get(q) ? name.get(q) : ''));
  }
}
walkDown();
console.log('folded away', gone.size, 'leaving', core.size);

// ---- silhouettes, from phylopic (phylopic.js) ----
// for creatures you haven't discovered yet. matched by the ids phylopic links each one to, else by full latin
// name (two words: a genus name alone is often a plant's or a fossil's too). public domain first, then the
// ones that only ask for a credit, which goes on the card
const silById = new Map(), silByName = new Map();
if (has('phylopic.json')) {
  const rows = JSON.parse(fs.readFileSync(path.join(RAW, 'phylopic.json'), 'utf8'));
  const free = l => /publicdomain/.test(l) ? 2 : /licenses\/by(-sa)?\//.test(l) ? 1 : 0;
  rows.sort((a, b) => free(b[1]) - free(a[1]));
  for (const [uuid, licence, by, names, ids] of rows) {
    if (!free(licence)) continue;
    const sil = { uuid, by: free(licence) === 2 ? '' : `${by}, CC ${/by-sa/.test(licence) ? 'BY-SA' : 'BY'} ${/4\.0/.test(licence) ? '4.0' : '3.0'}` };
    for (const id of ids) if (!silById.has(id)) silById.set(id, sil);
    for (const n of names) if (n.includes(' ') && !silByName.has(n)) silByName.set(n, sil);
  }
}
function ownSil(q) {
  const p = pbdbId.get(q);
  if (p && silById.has('paleobiodb.org/txn/' + p)) return silById.get('paleobiodb.org/txn/' + p);
  for (const id of otherIds.get(q) || []) if (silById.has(id)) return silById.get(id);
  for (const a of absorbed.get(q) || []) for (const id of otherIds.get(a) || []) if (silById.has(id)) return silById.get(id);
  return silByName.get(name.get(q));
}

// ---- pictures ----
// wikidata's picture is often a bone: a jaw for Gigantopithecus, a skull for half the dinosaurs. media.js saves
// every picture in each article with its caption, and the best one for the card is picked from those and
// wikidata's: for an extinct animal a life restoration, else anything that isn't bones, a map or a chart. for
// the living, wikidata's photo unless it's one of those. only pictures that are about the animal count: wikidata's,
// the article's first, or one whose name or caption says who it is (not the orangutan in the Gigantopithecus article)
const media = has('media.json') ? JSON.parse(fs.readFileSync(path.join(RAW, 'media.json'), 'utf8')) : {};
const NEVER = /\b(maps?|range|ranges|area|distribution|localit(y|ies)|sites?|cladograms?|phylogen\w*|diagram\w*|charts?|lineages?|history|schematic|graphs?|size|scale|stamps?|coins?|logos?|flags?|arms|banknote|outcrop|formation|quarry|excavation|dig|book|cover|title page|signature|plaque|sign|plates?|label|labels|microscop\w*|sem|histolog\w*|section|x-ray|ct scan|comparison|evolution|timeline|figure|fig|g\d{3}[a-z]?|journal|pone|peerj|zookeys|spread\w*|migrat\w*|dispersal|expansion|routes?|genetic|genome|dna|subgroups?|populations?|bite|force|mechanics|muscles?|musculature|anatomy|tails|nests?|eggs?|ootheca|growth|ontogeny|stages)\b|\.(pdf|djvu|tiff?|ogv|webm|ogg|mp3)$/i;
const BONES = /\b(skulls?|skeletons?|skeletal|fossils?|fossilized|bones?|jaws?|mandibles?|maxilla|teeth|tooth|molars?|holotype|paratype|neotype|specimens?|casts?|vertebrae?|vertebral|cervicals?|dorsals?|caudals?|femur|humerus|tibia|fibula|pes|manus|claws?|ungual|phalan\w*|pelvis|ilium|ischium|pubis|scapula|coracoid|sacrum|dentary|premaxilla|braincase|osteoderms?|quadrate|limbs?|cran(ium|ia)|endocast|footprints?|trackways?|tracks|burrows?|eggs?|coprolites?|scutes?|exoskeleton|moult|shells?|preserved|mount|mounted|slab|imprint|impression)\b/i;
const LIFE = /\b(restorations?|restored|reconstruct\w*|life|dioramas?|busts?|replicas?|artist'?s?|paleoart|palaeoart|illustrations?|illustrated|models?|sculptures?|statues?|depictions?|depicted|depicting|rendering|render|drawings?|painting|interpretation)\b/i;
const pictureWanted = new Map();  // article -> how many wikipedias have the creature
function picture(q, creature) {
  if (SWAP_PICTURE[q]) return SWAP_PICTURE[q];
  const who = [q, ...(absorbed.get(q) || [])];
  // a species without an article of its own is usually in its genus's (T. rex in Tyrannosaurus's), and an
  // extinct one's own is often a stub with a bone in it while the genus's has the restorations
  const p = parent.get(q);
  // (not a genus with living members: its pictures are of those, a living tapir for an extinct one)
  if ((!wiki.has(q) || extinct.has(q) && extinct.has(p)) && ONE_KIND.has(rank.get(q)) && rank.get(p) === GENUS) who.push(p);
  const words = [...new Set(who.flatMap(x => [name.get(x), name.get(x)?.split(' ')[0], friendly(x)]).filter(w => w && w.length > 3).map(w => w.toLowerCase()))];
  // "T. rex" too
  for (const x of who) { const [g, s] = (name.get(x) || '').split(' '); if (s) words.push(`${g[0]}. ${s}`.toLowerCase()); }
  const cands = [];
  // the genus's own picture is of some other species in it (a living tapir for an extinct one), so a borrowed
  // one has to name who it shows like any other
  for (const x of who) if (image.has(x)) cands.push({ file: image.get(x), text: '', own: x === p && !absorbed.get(q)?.includes(p) ? 0 : 2 });
  // the articles worth looking through: extinct creatures, and ones with no picture or a poor one. for the
  // living a drawing counts as poor too: lots of them have a flat "202501 Blue whale.svg", and a photo's better
  const poor = !cands.length || cands.every(c => NEVER.test(c.file) || BONES.test(c.file) || !extinct.has(q) && /\.svg$/i.test(c.file));
  for (const x of who) {
    const w = wiki.get(x);
    if (!w) continue;
    if (!media[w]) { if (creature && (poor || extinct.has(q))) pictureWanted.set(w, Math.max(pictureWanted.get(w) || 0, links.get(x) || 0)); continue; }
    for (const [file, caption, lead] of media[w]) cands.push({ file, text: caption, own: lead ? 1 : 0 });
  }
  let best = null, bestScore = -1;
  cands.forEach((c, i) => {
    const text = (c.file.replace(/\.[a-z]+$/i, '') + ' ' + c.text).replace(/_/g, ' ');
    if (NEVER.test(text) || NEVER.test(c.file)) return;
    const low = text.toLowerCase();
    if (!c.own && !words.some(w => low.includes(w))) return;
    // bones first: a "skull model" or a "skeleton reconstruction" is still bones. a drawing (png, svg) with no
    // words to go on is likely a restoration, but less surely than one that says so
    const bones = BONES.test(text), life = !bones && LIFE.test(text), drawn = !bones && /\.(svg|png)$/i.test(c.file);
    const score = (extinct.has(q) ? (life ? 30 : drawn ? 25 : bones ? 10 : 20) : (bones ? 10 : life || drawn ? 20 : 30)) + c.own - i / 1000;
    if (score > bestScore) { best = c.file; bestScore = score; }
  });
  return best;
}

// ---- counts, pictures and dates, children before parents ----

const species = new Map(), fame = new Map(), pic = new Map(), tail = new Map(), stars = new Map(), sil = new Map();
const creature = new Set(), chosen = new Map();
for (let i = order.length - 1; i >= 0; i--) {
  const q = order[i];
  const ks = kids.get(q) || [];
  const r = rank.get(q);
  let n = r === SPECIES || (!ks.length && r !== SUBSPECIES) ? 1 : 0;
  let f = links.get(q) || 0, fa = first.get(q), oldest;
  let t = 0;
  for (const k of ks) {
    n += species.get(k) || 0;
    f = Math.max(f, fame.get(k) || 0);
    // a group is at least as old as anything in it (pbdb sometimes has a group younger than its members,
    // when its idea of the group is smaller than wikidata's)
    if (first.has(k) && (oldest === undefined || first.get(k) > oldest)) oldest = first.get(k);
    if (!core.has(k)) t++;
  }
  // a group is gone if everything in it is gone
  if (ks.length && ks.every(k => extinct.has(k))) extinct.add(q);
  // one kind of animal, or a group of them. a fossil genus counts as one: that's how people know dinosaurs
  if (!otherLife.includes(q) && (!ks.length || ONE_KIND.has(r) || (r === GENUS || r === SUBGENUS) && extinct.has(q))) creature.add(q);
  if (core.has(q)) {
    const own = q === ROOT ? null : picture(q, creature.has(q));
    if (own) chosen.set(q, own);
    let best = own ? [f, q] : null;
    for (const k of ks) { const b = pic.get(k); if (b && (!best || b[0] > best[0])) best = b; }
    if (best) pic.set(q, best);
  }
  // the best known creatures somewhere inside, so you can jump from Mammals straight to the lion. one from
  // each branch in turn, best known branch first, so Animals shows a bee and an octopus and not six mammals
  if (core.has(q) && ks.length) {
    const lists = ks.filter(k => core.has(k)).map(k => [...(friendly(k) && creature.has(k) ? [k] : []), ...(stars.get(k) || [])]).filter(l => l.length);
    lists.sort((a, b) => (links.get(b[0]) || 0) - (links.get(a[0]) || 0));
    const best = [];
    for (let round = 0; best.length < 6 && lists.some(l => l.length > round); round++)
      for (const l of lists) if (best.length < 6 && l[round] !== undefined && !best.includes(l[round])) best.push(l[round]);
    if (best.length) stars.set(q, best);
  }
  // a group's silhouette is its best known member's, used only by creatures close by that have none
  const own = core.has(q) ? ownSil(q) : null;
  let bestSil = own ? [links.get(q) || 0, own] : null;
  if (!bestSil) for (const k of ks) { const s = sil.get(k); if (s && (!bestSil || s[0] > bestSil[0])) bestSil = s; }
  if (bestSil) sil.set(q, bestSil);
  species.set(q, n); fame.set(q, f); tail.set(q, t);
  if (!FIRST_SEEN[q] && oldest !== undefined && (fa === undefined || oldest > fa)) first.set(q, oldest);
}
// and nothing older than the dates set by hand above it (pbdb has sponges before animals, from a disputed find)
for (const q of order) {
  const p = parent.get(q);
  if (first.has(q) && first.has(p) && first.get(q) > first.get(p)) first.set(q, first.get(p));
}
// children in the order they're shown: the famous branches first
for (const ks of kids.values()) ks.sort((a, b) => (fame.get(b) || 0) - (fame.get(a) || 0) || (name.get(a) || '').localeCompare(name.get(b) || ''));
// a creature with no silhouette of its own borrows a close relative's: its genus's or family's best known
// member. any further up and it would be a different shape altogether (a lizard for a snake), so it stays a question
function silFor(q) {
  if (!creature.has(q)) return null;
  const own = ownSil(q);
  if (own) return own;
  for (let x = parent.get(q), d = 0; x !== undefined && d < 2; x = parent.get(x), d++) {
    if (sil.has(x)) return sil.get(x)[1];
    if (!LOW.has(rank.get(x)) && rank.get(x) !== FAMILY) break;
  }
  return null;
}

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
    // too big: the biggest branches become their own slices. not the little ones, or a family of a thousand
    // small genera would be a thousand tiny files; it stays one big one instead
    for (const [k, s] of sizes) { if (size <= SLICE || s < 40) break; sliceOf.set(k, k); size -= s; }
    open.set(q, size);
  }
  sliceOf.set(ROOT, ROOT);
  for (const q of order) if (core.has(q) && !sliceOf.has(q)) sliceOf.set(q, sliceOf.get(parent.get(q)));
}

const round = x => x === undefined ? undefined : x >= 10 ? Math.round(x * 10) / 10 : Math.round(x * 1000) / 1000;
const roundKg = kg => +kg.toPrecision(kg < 1 ? 2 : 3);
// one node as the page reads it. keys left out when empty
function record(q) {
  const o = { q, n: name.get(q) || label.get(q) || 'Q' + q };
  const f = friendly(q);
  if (f) o.l = f;
  if (!creature.has(q)) o.g = 1;
  const r = rank.get(q);
  if (r && rankName.has(r)) o.r = rankName.get(r);
  // a creature's own picture, or (a fossil genus) its best known species'. a group shows its members instead,
  // and its own picture only if it has one
  if (chosen.has(q)) o.i = chosen.get(q);
  else if (creature.has(q) && pic.has(q)) { const b = pic.get(q)[1]; o.i = chosen.get(b); o.p = friendly(b) || name.get(b); }
  const w = wiki.get(q);
  if (w) o.w = w === o.n ? 1 : w === o.l ? 2 : w;
  if (first.has(q)) o.a = round(first.get(q));
  if (extinct.has(q)) { o.x = 1; if (last.has(q)) o.z = round(last.get(q)); }
  if (mass.has(q)) o.kg = roundKg(mass.get(q));
  const s = species.get(q);
  if (s > 1 || (kids.get(q) || []).length) o.s = s;
  const ks = (kids.get(q) || []).filter(k => core.has(k));
  if (ks.length) o.k = ks;
  if (tail.get(q)) {
    o.t = tail.get(q);
    // the groups folded into this one, whose latin-only members are this one's now
    if (folded.has(q)) o.v = folded.get(q);
  }
  // famous members, [qid, slice, name, picture]
  if (!creature.has(q) && stars.has(q)) o.m = stars.get(q).map(s => {
    const p = chosen.get(s) || (pic.has(s) ? chosen.get(pic.get(s)[1]) : undefined);
    return p ? [s, sliceOf.get(s), friendly(s), p] : [s, sliceOf.get(s), friendly(s)];
  });
  if (otherLife.includes(q)) o.o = 1;
  const si = silFor(q);
  if (si) { o.si = si.uuid; if (si.by) o.sb = si.by; }
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
    const fr = friendly(x); if (fr) u.l = fr;
    if (first.has(x)) u.a = round(first.get(x));
    if (!creature.has(x)) u.g = 1;
    up.unshift(u);
  }
  const nodes = qs.map(record);
  // the tops of the slices above this one, so their cards can show without opening them
  for (const q of qs) for (const k of kids.get(q) || []) if (core.has(k) && sliceOf.get(k) !== top) nodes.push(record(k));
  const json = JSON.stringify({ up, nodes });
  biggest = Math.max(biggest, json.length);
  fs.writeFileSync(path.join(treeDir, top + '.json'), json);
}
// every slice by name (the surprise key picks one), and how many creatures there are to meet
const creatures = [...core].filter(q => creature.has(q)).length;
fs.writeFileSync(path.join(treeDir, 'index.json'), JSON.stringify({ count: creatures, groups: core.size - creatures, species: species.get(ANIMALS), slices: [...slices.keys()] }));
console.log(slices.size, 'tree files, biggest', Math.round(biggest / 1024), 'KB,', creatures, 'creatures in', core.size - creatures, 'groups');

// ---- the search box ----
// every name a node goes by, filed under the first two letters of each word in it
const plainWords = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const find = new Map();
for (const q of core) {
  const who = [q, ...(absorbed.get(q) || [])];
  const names = [name.get(q), label.get(q), friendly(q), ...who.flatMap(x => [...(common.get(x) || []), ...(x === q ? [] : [name.get(x), label.get(x)]), ...(alt.get(x) || [])])].filter(Boolean);
  const seen = new Set(), terms = [];
  for (const n of names) { const p = plainWords(n); if (p && !/^q\d+$/.test(p) && !seen.has(p)) { seen.add(p); terms.push(n); } }
  if (!terms.length) continue;
  // latin-only names under their first two letters, named ones under every word ("elephant" finds African bush elephant)
  terms.length = Math.min(terms.length, 8);
  const keys = new Set();
  if (terms.length === 1) keys.add(plainWords(terms[0]).slice(0, 2));
  else for (const t of terms) for (const w of plainWords(t).split(' ')) if (w.length >= 2) keys.add(w.slice(0, 2));
  // [qid, slice, fame, group?, names...]: the first name is the latin one, then what it's called
  const entry = [q, sliceOf.get(q), links.get(q) || 0, creature.has(q) ? 0 : 1, ...terms];
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
    for (const t of e.slice(4)) for (const w of plainWords(t).split(' ')) if (w.startsWith(k) && w.length >= 3) keys.add(w.slice(0, 3));
    for (const k3 of keys) add(three, k3, e);
  }
  for (const [k3, es] of three) write(k3, es);
}
fs.writeFileSync(path.join(findDir, 'split.json'), JSON.stringify(split.sort()));
console.log(files, 'search files,', Math.round(findBytes / 1048576), 'MB,', split.length, 'split by three letters');

// the articles whose pictures haven't been fetched yet: media.js gets them, then build again
fs.writeFileSync(path.join(RAW, 'media-wanted.txt'), [...pictureWanted].sort((a, b) => b[1] - a[1]).map(([t, n]) => t + '\t' + n).join('\n'));
console.log(pictureWanted.size, 'articles still to look through for pictures (media-wanted.txt)');
