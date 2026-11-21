// distant cousins: a board you fill in yourself with the family tree of every animal. it starts with the
// first life on earth. every creature you discover puts out its branches as mystery silhouettes, and the tree
// grows as far as you take it: drag to look around, scroll to zoom, click one you've found to read about it,
// and put any two side by side. what you've found is remembered, so the tree is still there next time.
// down the board is time, from the first life at the top to today along the bottom, with the ages of the earth
// coloured in behind (the layout, and the ages behind the board). traits.js says what each big group shares.
// sound.js plays the music and the sounds, achievements.js keeps the achievements and games.js has the games:
// they hear what happens here through dc: events (emit) and reach in through window.dcApi.
//
// two kinds of card: creatures (one kind of animal: a lion, a honey bee, Triceratops) with their picture, and
// groups (mammals, cat family, dinosaurs), drawn as signs on the branches with a few of their best known
// members. the tree lives in js/distant-cousins/tree/, cut into slices of a couple of thousand, each file named
// after the node at the bottom of its slice (tools/build.js makes them from wikidata, the paleobiology database,
// phylopic and wikipedia's pictures). a slice also lists its ancestors back to the first life, so one file is
// enough to put anything in it on the board. the ones the build left out (known only by a latin name) come
// straight from wikidata when you ask for them. photos and their credits come from the wikimedia api, the few
// lines about each from wikipedia.
(() => {
  const $ = id => document.getElementById(id);
  const TREE = 'js/distant-cousins/tree/', FIND = 'js/distant-cousins/find/';
  const ROOT = 2382443;
  const PAGE = 6;                         // branches that come out at a time
  const motion = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  };
  // the server (server/src/cousins.js): how many have each creature as their favourite, the daily mystery
  // cousin, and how trees compare. nobody signs in: a random id made up here goes with everything, and the page
  // works just the same when the server isn't there
  const SERVER = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://127.0.0.1:8787' : 'https://portfolio-server.portfolio-server.workers.dev';
  let me = store.get('distantCousinsId', '');
  if (!/^[0-9a-f]{32}$/.test(me)) store.set('distantCousinsId', me = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join(''));
  // its answer as json (with error in it when it said no), or null when it couldn't be reached
  // (or didn't answer in 8 seconds, so nothing waits on it forever)
  async function server(path, body) {
    try {
      const r = await fetch(SERVER + path, { signal: AbortSignal.timeout(8000), ...body && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ who: me, ...body }) } });
      return await r.json();
    } catch { return null; }
  }

  // ---------- the tree ----------

  const nodes = new Map();     // qid -> record (see tools/build.js record() for the keys)
  const parentOf = new Map();  // qid -> parent qid
  const homeOf = new Map();    // qid -> the slice that has its children
  const slices = new Map();    // slice -> promise

  function loadSlice(id) {
    if (id === undefined || id === null) return Promise.resolve();
    if (!slices.has(id)) slices.set(id, fetch(TREE + id + '.json').then(r => {
      if (!r.ok) throw new Error('tree ' + id + ' ' + r.status);
      return r.json();
    }).then(d => {
      let below;
      for (const u of d.up) {
        if (!nodes.has(u.q)) nodes.set(u.q, { ...u, thin: true });
        homeOf.set(u.q, u.f);
        if (below !== undefined) parentOf.set(u.q, below);
        below = u.q;
      }
      if (below !== undefined) parentOf.set(id, below);
      for (const n of d.nodes) {
        const had = nodes.get(n.q);
        if (!had || had.thin) nodes.set(n.q, n);
        if (!homeOf.has(n.q) || !n.f) homeOf.set(n.q, n.f || id);
        for (const k of n.k || []) parentOf.set(k, n.q);
      }
    }).catch(e => { slices.delete(id); throw e; }));
    return slices.get(id);
  }
  const trail = q => { const p = []; for (let x = q; x !== undefined; x = parentOf.get(x)) p.unshift(x); return p; };
  // the first life is one ancestor, not a group, whatever the build says
const isGroup = n => !!n && !!n.g && n.q !== ROOT;

  // the ones the build left out, asked of wikidata: children of a node (and of the little-known groups the
  // build folded into it), with how many children each has
  const live = new Map();
  function liveKids(n) {
    if (!live.has(n.q)) {
      const under = [n.q, ...(n.v || [])].map(x => 'wd:Q' + x).join(' ');
      const sparql = `SELECT ?c ?n (COUNT(?g) AS ?k) WHERE { VALUES ?p { ${under} } ?c wdt:P171 ?p ; wdt:P225 ?n . OPTIONAL { ?g wdt:P171 ?c } } GROUP BY ?c ?n ORDER BY ?n LIMIT 5000`;
      live.set(n.q, fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql))
        .then(r => { if (!r.ok) throw new Error('wikidata ' + r.status); return r.json(); })
        .then(j => j.results.bindings.map(b => ({ q: +b.c.value.split('/Q').pop(), n: b.n.value, s: +b.k.value })))
        .catch(e => { live.delete(n.q); throw e; }));
    }
    return live.get(n.q);
  }

  // ---------- words ----------

  const fmt = n => n.toLocaleString('en-GB');
  const cap = s => s && s[0].toUpperCase() + s.slice(1);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const nameOf = n => n.q === ROOT ? 'The very first life' : n.l || n.n;
  // (a few have no latin name, only the everyday one twice: "Catalan donkey")
  const latinOf = n => n.q === ROOT ? 'LUCA' : n.l && n.l !== n.n ? n.n : '';
  // million years ago, as words
  function ago(ma) {
    if (ma === 0) return 'today';
    if (ma >= 1000) return `${+(ma / 1000).toFixed(1)} billion years ago`;
    if (ma >= 1) return `${fmt(+ma.toFixed(ma < 10 ? 1 : 0))} million years ago`;
    const years = ma * 1e6;
    return `${fmt(years >= 10000 ? Math.round(years / 1000) * 1000 : Math.round(years / 100) * 100)} years ago`;
  }
  function span(ma) {
    if (ma >= 1000) return `${+(ma / 1000).toFixed(1)} billion years`;
    if (ma >= 1) return `${fmt(+ma.toFixed(ma < 10 ? 1 : 0))} million years`;
    return `${fmt(Math.max(100, Math.round(ma * 1e6 / 100) * 100))} years`;
  }
  const weight = kg => kg >= 1000 ? `${fmt(+(kg / 1000).toPrecision(2))} tonnes` : kg >= 1 ? `${fmt(+kg.toPrecision(2))} kg` : `${fmt(+(kg * 1000).toPrecision(2))} g`;
  // a big count, as about how many: wikidata's counts are of every name anyone's given, so not exact
  const roughly = n => n < 100 ? fmt(n) : fmt(+n.toPrecision(2));
  // fossil dates are a stretch of rock, not a year: a is the young end of the oldest fossil's, a2 the old end
  // (z and z2 the same for the youngest). a narrow stretch reads as "about", a wide one says so
  // (the holocene, the last 11,700 years: 0.012 once the build's rounded it)
  const HOLOCENE = 0.0125;
  // two ages as a stretch, the unit said once: "between 129,000 and 12,000 years old"
  function between(hi, lo) {
    const a = ago(hi).replace(' ago', ''), b = ago(lo).replace(' ago', '');
    const unit = b.replace(/^[\d.,]+ /, '');
    return `between ${a.endsWith(' ' + unit) ? a.slice(0, -unit.length - 1) : a} and ${b} old`;
  }
  const tight = (lo, hi) => !hi || hi <= lo * 1.25 + 0.002;
  function oldestFossils(n) {
    if (n.a === undefined || n.q === ROOT) return '';
    return tight(n.a, n.a2) ? ` ${n.g ? 'The oldest fossils of any of them are' : 'Its oldest fossils are'} about ${ago(n.a).replace(' ago', ' old')}.`
      : ` ${n.g ? 'The oldest fossils of any of them are' : 'Its oldest fossils are'} at least ${ago(n.a).replace(' ago', ' old')}.`;
  }
  // when it died out, as far as the fossils say: "about 66 million years ago", "within the last 12,000
  // years", or the stretch its youngest fossils are from
  function diedOut(n) {
    if (n.z === undefined) return '';
    if ((n.z2 ?? n.z) <= HOLOCENE) return 'within the last 12,000 years';
    if (tight(n.z, n.z2)) return `about ${ago(n.z)}`;
    return null;
  }
  // the nearest group above with an everyday name: "one of the big cats"
  function kindOf(n) {
    for (let x = parentOf.get(n.q); x !== undefined; x = parentOf.get(x)) {
      const p = nodes.get(x);
      if (p && p.l && x !== ROOT) return / family$/i.test(p.l) ? `A member of the ${p.l.toLowerCase()}` : `One of the ${p.l.toLowerCase()}`;
    }
    return 'A creature';
  }
  function factsOf(n) {
    if (n.q === ROOT) return 'The last universal common ancestor, LUCA for short: a tiny single cell that everything alive today comes from, from bacteria to blue whales.';
    if (n.o) return 'Life went this way too, but this tree follows the animals, so the branch stops here.';
    if (n.live) return n.s ? `Known only by its Latin name. ${fmt(n.s)} ${n.s === 1 ? 'branch grows' : 'branches grow'} from it.` : 'Known only by its Latin name: a creature hardly anyone has heard of. You found it anyway.';
    const died = diedOut(n);
    const youngest = died === null ? ` Its youngest fossils are ${between(n.z2, n.z)}.` : '';
    let s;
    if (isGroup(n)) {
      s = n.s > 1 ? `About ${roughly(n.s)} kinds of animal have been named in this group, living and extinct` : 'A group of animals';
      s += n.x ? (died ? `. All of them died out ${died}.` : '. All of them have died out.') : '.';
      s += oldestFossils(n) + youngest.replace('Its', 'The');
    } else {
      s = `${kindOf(n)}${n.x ? (died ? `, which died out ${died}.` : ', now extinct.') : ', still around today.'}`;
      s += oldestFossils(n) + youngest;
      if (n.kg) s += ` A grown-up ${n.x ? 'weighed' : 'weighs'} about ${weight(n.kg)}.`;
    }
    return s;
  }

  // ---------- pictures and words from wikimedia, silhouettes from phylopic ----------

  const TRAITS = window.dcTraits || {};
  const plain = html => { const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent.trim(); };
  const pics = new Map();      // file -> promise of { src, page, by, licence }
  const picReady = new Map();  // the same once it's here
  // asked of english wikipedia rather than commons: it knows commons' pictures and its own free ones too
  function loadPics(files) {
    const need = [...new Set(files.filter(f => f && !pics.has(f)))];
    for (let i = 0; i < need.length; i += 50) {
      const group = need.slice(i, i + 50);
      const ask = fetch('https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url|extmetadata&iiextmetadatafilter=Artist|LicenseShortName&iiurlwidth=500&titles='
        + group.map(f => encodeURIComponent('File:' + f)).join('|'))
        .then(r => r.json()).then(j => {
          const named = new Map((j.query.normalized || []).map(x => [x.to, x.from]));
          const found = new Map();
          for (const p of Object.values(j.query.pages || {})) {
            const info = p.imageinfo && p.imageinfo[0];
            if (!info) continue;
            const meta = info.extmetadata || {};
            found.set((named.get(p.title) || p.title).slice(5), { src: info.thumburl || info.url, page: info.descriptionurl, by: plain(meta.Artist?.value), licence: plain(meta.LicenseShortName?.value) });
          }
          for (const [f, p] of found) picReady.set(f, p);
          return found;
        }).catch(() => new Map());
      for (const f of group) pics.set(f, ask.then(found => found.get(f) || null));
    }
    return Promise.all(files.map(f => f ? pics.get(f) : null));
  }
  const reads = new Map();
  function loadRead(title) {
    if (!reads.has(title)) reads.set(title, fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_')))
      .then(r => r.ok ? r.json() : null).then(j => j && j.extract ? { text: j.extract, url: j.content_urls?.desktop?.page } : null).catch(() => null));
    return reads.get(title);
  }
  const wikiTitle = n => n.q === ROOT ? 'Last universal common ancestor' : n.w === 1 ? n.n : n.w === 2 ? n.l : n.w;
  const picOf = n => n.q === ROOT ? 'Tree of life by Haeckel.jpg' : n.i;
  const silUrl = id => `https://images.phylopic.org/images/${id}/thumbnail/192x192.png`;
  // a plain picture, not a css mask: masks need the file sent with cors, and phylopic's cache sometimes forgets
  const silImg = id => `<img class="dc-sil-img" src="${silUrl(id)}" alt="" loading="lazy" draggable="false">`;
  const silCredit = n => n.si ? `Silhouette: ${n.sb ? n.sb + ', ' : ''}PhyloPic` : '';
  // pictures that arrive later go into every <img data-file> waiting for them
  function fillPics(root) {
    const imgs = [...root.querySelectorAll('img[data-file]:not([src])')];
    loadPics(imgs.map(i => i.dataset.file)).then(ps => ps.forEach((p, i) => {
      if (p) imgs[i].src = p.src;
      else imgs[i].closest('[data-pic-box]')?.classList.add('is-none');
    }));
  }

  // ---------- what's on the board, remembered between visits ----------

  const found = new Map();     // discovered: qid -> its slice
  const extra = new Map();     // on the board but not discovered yet (missing links you uncovered): qid -> slice
  const open = new Map();      // qid -> how many of its branches are out
  const latin = new Map();     // qid -> the latin-only children wikidata gave it
  const liveKept = new Map();  // latin-only creatures on the board: qid -> [qid, name, branches, parent]
  let fav = store.get('distantCousinsFav', null);
  let total = 433622;

  // what happens on the board, for achievements.js and games.js to hear: find, open, compare, favourite,
  // surprise, gap, latin, more, search, theme, ready
  const emit = (type, detail = {}) => document.dispatchEvent(new CustomEvent('dc:' + type, { detail }));
  // a hunt (games.js) in progress: it has a board of its own, which is never saved. it can keep the right
  // branch in view (keep), mark cards on or off the trail (mark), and hears each find (found)
  let hunt = null;
  // ---------- your trees, like saves in a game ----------
  // each one's board is kept under its own key (the first under the one there was before there were more,
  // distantCousinsBoard), and distantCousinsTrees lists them: { now: the one on the board, list: [{ id, name,
  // made }] }. achievements and the favourite belong to you, not to a tree
  const boardKey = id => id === 'first' ? 'distantCousinsBoard' : 'distantCousinsBoard-' + id;
  const trees = store.get('distantCousinsTrees', null) || { now: 'first', list: [{ id: 'first', name: 'My first tree', made: Date.now() }] };
  if (!trees.list.some(t => t.id === trees.now)) trees.now = trees.list[0]?.id ?? 'first';
  if (!trees.list.length) trees.list.push({ id: 'first', name: 'My first tree', made: Date.now() });
  const treeNow = () => trees.list.find(t => t.id === trees.now);
  // a save only ever adds to what's saved: it's merged with the board already there, so nothing found is lost
  // to a tree file or wikidata not answering this time (it wasn't put back on the board, but it's still
  // saved), or to another tab writing over this one. and nothing's written until the board's loaded (loaded).
  // only deleting a tree takes finds away
  let loaded = false, warned = false;
  function save() {
    if (hunt || !loaded) return;
    const keep = [...liveKept.values()].filter(([q]) => found.has(q) || extra.has(q));
    const board = { found: [...found], extra: [...extra], open: [...open], latin: [...latin.keys()], live: keep };
    const before = store.get(boardKey(trees.now), null);
    if (before) for (const k of Object.keys(board)) {
      const have = new Set(board[k].map(e => Array.isArray(e) ? e[0] : e));
      for (const e of before[k] || []) if (!have.has(Array.isArray(e) ? e[0] : e)) board[k].push(e);
    }
    // (another tab may have taken this tree off the list: it goes back on, never lost)
    const fresh = store.get('distantCousinsTrees', null);
    if (fresh && !fresh.list.some(t => t.id === trees.now)) { fresh.list.push(treeNow()); store.set('distantCousinsTrees', fresh); }
    if (!store.set(boardKey(trees.now), board) && !warned) {
      warned = true;
      $('dcMet').textContent = "Your browser won't let this page save any more, so new finds won't be remembered. Deleting a tree you don't need makes room.";
    }
  }
  function addLive(c, parent) {
    if (!nodes.has(c.q)) nodes.set(c.q, { q: c.q, n: c.n, s: c.s, live: 1, ...(c.s ? { g: 1 } : {}) });
    if (!parentOf.has(c.q)) parentOf.set(c.q, parent);
    liveKept.set(c.q, [c.q, c.n, c.s, parent]);
  }
  async function askLatin(q) {
    if (latin.has(q)) return;
    const n = nodes.get(q);
    const list = await liveKids(n);
    const skip = new Set([...(n.k || []), ...(n.v || [])]);
    const qs = [];
    for (const c of list) if (!skip.has(c.q)) { addLive(c, q); qs.push(c.q); }
    latin.set(q, qs);
  }
  const kidsOf = n => (n.k || []).concat(latin.get(n.q) || []);

  // ---------- the layout ----------
  // an evolution tree: across is who's related to whom, and down is time. every node on the board hangs from its
  // nearest ancestor that's also on the board; when some are skipped (you searched for something deep in the
  // tree) the line is dotted, with how many are missing on it. lines part just under the group they come from
  // and run down side by side, so the higher up two lines join, the longer ago they went their own ways

  const WIDTH = { found: 168, unfound: 132, more: 116, latin: 132 };
  const GAP = 22;

  // ---------- time runs down the board ----------
  // the first life at the top, today along the bottom. a group's sign sits where its oldest fossils are, a
  // creature's card where it died out, or along the bottom if it's still around. time is squeezed the further
  // back it goes (the last 66 million years get as much room as the 4 billion before them: lg), and stretched
  // wherever cards need the room, for the whole board at once, so the colours of the ages behind stay true.
  // the clock is that stretched time: lg values (ls, oldest first) and where each is down the board (ys)
  const PX = 220, SPLIT = 20, MIN = 46;
  const lg = ma => Math.log1p(Math.max(0, ma));
  let clock = { ls: [lg(4200)], ys: [0] };
  function yOf(ma) {
    const l = lg(ma), { ls, ys } = clock, last = ls.length - 1;
    if (l >= ls[0]) return ys[0] - (l - ls[0]) * PX;
    for (let i = 1; i <= last; i++) if (l >= ls[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (ls[i - 1] - l) / (ls[i - 1] - ls[i]);
    return ys[last] + (ls[last] - l) * PX;
  }
  function maAt(y) {
    const { ls, ys } = clock, last = ls.length - 1;
    let l;
    if (y <= ys[0]) l = ls[0] + (ys[0] - y) / PX;
    else if (y >= ys[last]) l = ls[last] - (y - ys[last]) / PX;
    else for (let i = 1; i <= last; i++) if (y <= ys[i]) { l = ls[i - 1] - (ls[i - 1] - ls[i]) * (y - ys[i - 1]) / (ys[i] - ys[i - 1] || 1); break; }
    return Math.max(0, Math.expm1(l));
  }
  // where each card goes down the board (id -> y): its own time, but always far enough below its parent
  function timeline(root) {
    const lOf = new Map();
    const walk = (it, lp) => {
      const n = nodes.get(it.q);
      let l;
      if (it.q === ROOT) l = lg(n.a ?? 4200);
      else {
        const below = lp * 0.985;
        let own;
        // (a creature's own branches, its breeds and kinds, go just under it, below today if it's still around)
        if (it.kind === 'found' || it.kind === 'unfound') own = isGroup(n) || n.o ? n.a : n.x ? n.z ?? n.a : 0;
        l = own === undefined ? (it.kind === 'found' || it.kind === 'unfound' ? lp * 0.92 : below) : Math.min(lg(own), below);
      }
      lOf.set(it.id, l);
      for (const k of it.kids) walk(k, l);
    };
    walk(root, 0);
    // stretch the time between each card and its parent until the card fits under it, nearest pairs first
    // (stretching only ever adds room, so a pair that fits keeps fitting)
    const ls = [...new Set(lOf.values())].sort((a, b) => b - a);
    const index = new Map(ls.map((l, i) => [l, i]));
    const gap = ls.slice(1).map((l, i) => (ls[i] - l) * PX);
    const pairs = [];
    for (const it of items.values()) if (it.parent !== undefined && lOf.has(it.id)) pairs.push([index.get(lOf.get(it.parent)), index.get(lOf.get(it.id)), (tall.get(it.parent) || 0) + MIN]);
    pairs.sort((a, b) => (a[1] - a[0]) - (b[1] - b[0]));
    for (const [i, j, need] of pairs) {
      let s = 0;
      for (let k = i; k < j; k++) s += gap[k];
      if (s > 0 && s < need) for (let k = i; k < j; k++) gap[k] *= need / s;
    }
    const ys = [0];
    for (const g of gap) ys.push(ys[ys.length - 1] + g);
    clock = { ls, ys };
    const out = new Map();
    const put = (it, least) => {
      const y = Math.max(ys[index.get(lOf.get(it.id))], least);
      out.set(it.id, y);
      for (const k of it.kids) put(k, y + (tall.get(it.id) || 0) + MIN);
    };
    put(root, -Infinity);
    return out;
  }

  function plan() {
    const vis = new Set([ROOT]);
    for (const q of found.keys()) if (nodes.has(q)) vis.add(q);
    for (const q of extra.keys()) if (nodes.has(q)) vis.add(q);
    for (const q of [ROOT, ...found.keys()]) {
      const n = nodes.get(q);
      if (!n) continue;
      const ks = kidsOf(n), want = open.get(q) ?? PAGE;
      for (let i = 0; i < ks.length; i++) if (nodes.has(ks[i]) && (i < want || hunt?.keep?.(ks[i]))) vis.add(ks[i]);
    }
    // where two lines on the board meet in a group that isn't on it (a t. rex and a chicken you searched for,
    // meeting at the theropods), that group goes on as a mystery, so you can see where they part
    const via = new Map();
    for (const q of vis) {
      let below = q;
      for (let p = parentOf.get(q); p !== undefined && !vis.has(p); below = p, p = parentOf.get(p)) {
        if (!via.has(p)) via.set(p, new Set());
        via.get(p).add(below);
      }
    }
    for (const [p, ways] of via) if (ways.size > 1 && nodes.has(p)) vis.add(p);
    const items = new Map();   // id -> { id, q, kind, kids: [], via, parent }
    for (const q of vis) items.set(q, { id: q, q, kind: found.has(q) || q === ROOT ? 'found' : 'unfound', kids: [] });
    for (const q of vis) {
      if (q === ROOT) continue;
      const via = [];
      let p = parentOf.get(q);
      while (p !== undefined && !vis.has(p)) { via.push(p); p = parentOf.get(p); }
      if (p === undefined) { items.delete(q); continue; }
      const it = items.get(q);
      it.via = via.reverse();          // from the top down
      it.parent = p;
      items.get(p).kids.push(it);
    }
    // children in the tree's own order (best known first), then the "more" keys
    for (const it of [...items.values()]) {
      if (it.kind !== 'found') continue;
      const n = nodes.get(it.q);
      const order = kidsOf(n);
      const at = k => { const i = order.indexOf(k.via?.length ? k.via[0] : k.q); return i < 0 ? 1e9 : i; };
      it.kids.sort((a, b) => at(a) - at(b));
      const hidden = order.filter(k => !vis.has(k)).length;
      if (hidden) it.kids.push({ id: 'more:' + it.q, q: it.q, kind: 'more', count: hidden, kids: [], parent: it.q });
      if (n.t && !latin.has(it.q) && !n.live) it.kids.push({ id: 'latin:' + it.q, q: it.q, kind: 'latin', count: n.t, kids: [], parent: it.q });
      if (n.live && n.s && !latin.has(it.q)) it.kids.push({ id: 'latin:' + it.q, q: it.q, kind: 'latin', count: n.s, kids: [], parent: it.q });
      for (const k of it.kids) if (!items.has(k.id)) items.set(k.id, k);
    }
    return items;
  }

  // ---------- drawing the board ----------

  const board = $('dcBoard'), world = $('dcWorld'), layer = $('dcNodes'), edges = $('dcEdges');
  const els = new Map();      // id -> element
  const at = new Map();       // id -> { x, y } where it's drawn now (x is its middle)
  const goal = new Map();     // id -> where it's going
  const tall = new Map();     // id -> height
  let items = new Map(), selected = null;

  const STAR = '<svg class="dc-node-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/></svg>';
  function card(it) {
    const n = nodes.get(it.q);
    if (it.kind === 'more') return `<span class="dc-more-n">+${fmt(it.count)}</span><span>more ${it.count === 1 ? 'branch' : 'branches'}</span>`;
    if (it.kind === 'latin') return `<span class="dc-more-n">+${fmt(it.count)}</span><span>more with only Latin names</span>`;
    const name = `<span class="dc-node-name${n.l || n.q === ROOT ? '' : ' is-latin'}">${esc(nameOf(n))}</span>`;
    const star = fav && fav.q === it.q ? STAR : '';
    // a group: a sign on the branch saying what's in it, and (once found) a few of its best known members
    if (isGroup(n)) {
      // (short enough for the smallest card: "About 2 million kinds", "36 kinds")
      const size = n.s >= 1e6 ? `About ${+(n.s / 1e6).toPrecision(2)} million kinds` : n.s >= 100 ? `About ${roughly(n.s)} kinds` : n.s > 1 ? `${n.s} kinds` : 'Group';
      const tag = `<span class="dc-group-tag">${size}</span>`;
      if (it.kind === 'unfound') return tag + name;
      const faces = (n.m || []).filter(m => m[3]).slice(0, 3);
      return `${star}${tag}${name}${faces.length ? `<span class="dc-faces">${faces.map(m => `<span class="dc-face" data-pic-box><img data-file="${esc(m[3])}" alt="" draggable="false"></span>`).join('')}</span>` : ''}`;
    }
    if (it.kind === 'unfound') return `<span class="dc-sil${n.si ? '' : ' is-blank'}">${n.si ? silImg(n.si) : '?'}</span>${name}`;
    const latinName = latinOf(n);
    const pic = picOf(n) ? `<span class="dc-node-pic" data-pic-box><img data-file="${esc(picOf(n))}" alt="" draggable="false">${n.si ? silImg(n.si) : ''}</span>` : `<span class="dc-node-pic is-blank">${n.si ? silImg(n.si) : ''}</span>`;
    return `${star}${pic}${name}${latinName ? `<span class="dc-node-sci">${esc(latinName)}</span>` : ''}`;
  }

  function label(it) {
    const n = nodes.get(it.q);
    if (it.kind === 'more') return `Show ${it.count} more branches of ${nameOf(n)}`;
    if (it.kind === 'latin') return `Ask Wikidata for ${it.count} more known only by Latin names`;
    if (it.kind === 'unfound') return `Discover ${isGroup(n) ? 'the group ' : ''}${nameOf(n)}`;
    return `${isGroup(n) ? 'Group: ' : ''}${nameOf(n)}${latinOf(n) ? ', ' + latinOf(n) : ''}. Show details`;
  }

  let lastBorn = 0;            // how many cards the last draw brought out
  function draw(born) {
    items = plan();
    lastBorn = 0;
    // the elements: new ones, changed ones, gone ones
    for (const [id, el] of els) if (!items.has(id)) { el.remove(); els.delete(id); at.delete(id); }
    for (const it of items.values()) {
      const n = nodes.get(it.q);
      const sig = [it.kind, it.count, fav?.q === it.q].join('|');
      let el = els.get(it.id);
      if (!el) {
        el = document.createElement('button');
        el.type = 'button';
        el.dataset.id = it.id;
        layer.append(el);
        els.set(it.id, el);
        // new branches pop out one after another (--i staggers them, and the sound's plucks with them)
        if (born !== false) { el.classList.add('is-born'); el.style.setProperty('--i', lastBorn++); }
      }
      if (el.dataset.sig !== sig) {
        el.dataset.sig = sig;
        el.innerHTML = card(it);
        el.title = it.kind === 'unfound' && !isGroup(n) ? silCredit(n) : '';
      }
      const kindClass = it.kind === 'found' || it.kind === 'unfound' ? (isGroup(n) ? ' is-group' : ' is-creature') : '';
      el.className = `dc-node is-${it.kind}${kindClass}${n?.x ? ' is-extinct' : ''}${n?.o ? ' is-other' : ''}${selected === it.q && it.kind === 'found' ? ' is-picked' : ''}${hunt?.mark?.(it) || ''}${['is-born', 'is-revealed', 'is-hung'].filter(c => el.classList.contains(c)).map(c => ' ' + c).join('')}`;
      el.style.width = WIDTH[it.kind] + 'px';
      el.setAttribute('aria-label', label(it));
    }
    // sizes, then places: each node over the middle of its children, and down the board at its time
    for (const [id, el] of els) tall.set(id, el.offsetHeight);
    const span = new Map();
    const measure = it => {
      let w = 0;
      for (const k of it.kids) w += measure(k) + GAP;
      w = Math.max(WIDTH[it.kind], w - GAP);
      span.set(it.id, w);
      return w;
    };
    const root = items.get(ROOT);
    measure(root);
    const yAt = timeline(root);
    const place = (it, x) => {
      goal.set(it.id, { x, y: yAt.get(it.id) });
      const inner = it.kids.reduce((s, k) => s + span.get(k.id) + GAP, -GAP);
      let left = x - inner / 2;
      for (const k of it.kids) { place(k, left + span.get(k.id) / 2); left += span.get(k.id) + GAP; }
    };
    place(root, 0);
    // newcomers start where their parent is and grow out of it
    for (const it of items.values()) if (!at.has(it.id)) {
      const from = at.get(it.parent) || goal.get(it.parent) || goal.get(it.id);
      at.set(it.id, { ...(motion() ? from : goal.get(it.id)) });
    }
    tween();
    paintAges();
    loadCardPics();
    sayMet();
    renderFav();
  }

  // everything slides to its new place together
  let tweenFrame = 0;
  function tween() {
    cancelAnimationFrame(tweenFrame);
    const start = new Map([...at].map(([id, p]) => [id, { ...p }]));
    const t0 = performance.now(), dur = motion() ? 380 : 0;
    const step = now => {
      const k = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - k, 3);
      for (const [id, g] of goal) {
        const s = start.get(id) || g;
        at.set(id, { x: s.x + (g.x - s.x) * e, y: s.y + (g.y - s.y) * e });
      }
      paint();
      if (k < 1) tweenFrame = requestAnimationFrame(step);
    };
    tweenFrame = requestAnimationFrame(step);
  }

  // cards to their places, then the lines between them: a step down from the parent, along to above the child,
  // and down to it. thicker the more species a branch holds; dotted where ancestors are missing; and the line of
  // the one you've clicked, from it all the way up to the first life, picked out
  function paint() {
    for (const [id, el] of els) {
      const p = at.get(id);
      if (!p) continue;
      el.style.transform = `translate(${p.x - WIDTH[items.get(id).kind] / 2}px, ${p.y}px)`;
      // popping, flipping and swinging happen about the card's own top middle, wherever it is
      el.style.transformOrigin = `${p.x}px ${p.y}px`;
    }
    const line = new Set();
    for (let id = selected; id !== undefined && items.has(id); id = items.get(id).parent) line.add(id);
    let solid = '', faint = '', dotted = '', lit = '', labels = '';
    for (const it of items.values()) {
      if (it.parent === undefined) continue;
      const a = at.get(it.parent), b = at.get(it.id);
      if (!a || !b) continue;
      const x1 = a.x, y1 = a.y + (tall.get(it.parent) || 0), x2 = b.x, y2 = Math.max(b.y, y1 + 1);
      const fork = Math.min(y1 + SPLIT, (y1 + y2) / 2), r = Math.min(14, Math.abs(x2 - x1) / 2, (y2 - fork) / 2, fork - y1);
      const dir = Math.sign(x2 - x1);
      const d = Math.abs(x2 - x1) < 1 ? `M${x1} ${y1}V${y2}` : `M${x1} ${y1}V${fork - r}Q${x1} ${fork} ${x1 + dir * r} ${fork}H${x2 - dir * r}Q${x2} ${fork} ${x2} ${fork + r}V${y2}`;
      const n = nodes.get(it.q);
      const w = it.kind === 'more' || it.kind === 'latin' ? 2.5 : Math.min(10, 2.5 + 1.6 * Math.log10((n?.s || 1) + 1));
      const path = `<path d="${d}" stroke-width="${w.toFixed(1)}"/>`;
      if (line.has(it.id)) lit += path;
      if (it.via?.length) {
        dotted += path;
        labels += `<span class="dc-gap" style="left:${x2}px;top:${(fork + y2) / 2}px" data-gap="${it.id}">${it.via.length} more</span>`;
      } else if (it.kind === 'found') solid += path;
      else faint += path;
    }
    edges.innerHTML = `<g class="dc-edge-faint">${faint}</g><g class="dc-edge-dotted">${dotted}</g><g class="dc-edge-solid">${solid}</g><g class="dc-edge-lit">${lit}</g>`;
    gapLayer.innerHTML = labels;
  }
  const gapLayer = document.createElement('div');
  gapLayer.className = 'dc-gaps';
  world.append(gapLayer);
  const burstLayer = document.createElement('div');
  burstLayer.className = 'dc-bursts';
  world.append(burstLayer);
  // a card's done popping, flipping or swinging
  layer.addEventListener('animationend', e => { if (e.target.matches('.dc-node')) e.target.classList.remove('is-born', 'is-revealed', 'is-hung'); });

  // ---------- the moment of finding something ----------

  // a puff of little shapes out of a point: leaves for the living, stone chips for the long gone, stars for
  // a favourite, confetti for a milestone. into box (the board's world, or the stage over it), at x, y in its
  // units. thrown up and out at random (not an even ring), then they fall: how far, how long, and how high
  // they get thrown (chips are heavy and barely go up) depends on what they are
  const THROW = { leaf: [40, 40, 1.3, 0.5, 1], stone: [70, 50, 0.85, 0.3, 0.45], star: [30, 30, 1, 0.3, 1], confetti: [90, 80, 1.9, 0.6, 1] };
  function burst(box, x, y, kind, count = 14, reach = 90) {
    if (!motion()) return;
    const [fall, fallMore, time, timeMore, up] = THROW[kind];
    const r = Math.random;
    const b = document.createElement('div');
    b.className = 'dc-burst is-' + kind;
    b.style.cssText = `left:${x}px;top:${y}px`;
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (r() - 0.5) * 2.6, far = reach * (0.5 + r() * 0.7);
      const s = document.createElement('i');
      s.style.cssText = `--dx:${(Math.cos(a) * far).toFixed(0)}px;--dy:${(Math.sin(a) * far * up).toFixed(0)}px;--fall:${(fall + r() * fallMore).toFixed(0)}px;--t:${(time + r() * timeMore).toFixed(2)}s;--r:${Math.floor(r() * 360)}deg;--d:${Math.floor(r() * 90)}ms`;
      b.append(s);
    }
    box.append(b);
    setTimeout(() => b.remove(), 2700);
  }
  // a card you've just found: a creature's turns over to show who it is, a group's sign swings on its
  // branch, and the sound says which (and plucks a note for each branch coming out of it)
  function celebrate(q, born) {
    const n = nodes.get(q), el = els.get(q), g = goal.get(q);
    if (!n || !el) return;
    if (isGroup(n)) {
      el.classList.add('is-hung');
      dcSound.play(born ? 'sprout' : 'tap', { count: born });
      return;
    }
    el.classList.add('is-revealed');
    if (g) {
      burst(burstLayer, g.x, g.y + (tall.get(q) || 0) / 2, n.x ? 'stone' : 'leaf');
      // zoomed out, the puff shrinks less than the board does, so it's still there to see
      burstLayer.lastChild?.style.setProperty('scale', Math.min(2.2, 1 / Math.sqrt(cam.s)).toFixed(2));
    }
    dcSound.play('found', { extinct: !!n.x });
    if (born) dcSound.play('sprout', { count: born, after: 0.4 });
  }

  // the card's picture: once it's here the silhouette under it goes, and the photo's credit goes on the card
  function loadCardPics() {
    const imgs = [...layer.querySelectorAll('img[data-file]:not([src])')];
    loadPics(imgs.map(i => i.dataset.file)).then(ps => ps.forEach((p, i) => {
      const img = imgs[i], box = img.closest('[data-pic-box]');
      if (p) {
        img.src = p.src;
        if (box?.classList.contains('dc-node-pic')) box.closest('.dc-node')?.setAttribute('title', [p.by && `Picture: ${p.by.slice(0, 80)}`, p.licence].filter(Boolean).join(', '));
      } else box?.classList.add('is-none');
    }));
  }

  // ---------- the ages behind the board ----------
  // the ages of the earth, each one named on the left where it starts (the name stays in view while you're in
  // it), and the five great extinctions marked across the board. the strip down the left edge is all of time at
  // once, each age a colour (css --age-0 to --age-16): drag along it to travel through time, and everything that
  // came after the moment you're at fades away. (the board itself stays plain sand: coloured, it lost its feel)
  const AGES = [
    [4600, 'Hadean', 'The young Earth, where the first cells began'],
    [4000, 'Archean', 'Only single cells, and no oxygen in the air yet'],
    [2500, 'Proterozoic', 'Oxygen fills the air, and cells with a nucleus appear'],
    [635, 'Ediacaran', 'The first animals: soft, strange and on the sea floor'],
    [538.8, 'Cambrian', 'Animals everywhere in the sea, with eyes, shells and legs'],
    [485.4, 'Ordovician', 'Seas full of life, and the first little plants on land'],
    [443.8, 'Silurian', 'Fish with jaws, and the first creepy-crawlies on land'],
    [419.2, 'Devonian', 'The age of fishes, the first forests and the first legs'],
    [358.9, 'Carboniferous', 'Swampy forests, giant insects, and eggs laid on land'],
    [298.9, 'Permian', 'One great supercontinent, until most life died out'],
    [251.9, 'Triassic', 'The first dinosaurs, and the first mammals'],
    [201.4, 'Jurassic', 'Giant dinosaurs, and the first birds'],
    [145, 'Cretaceous', 'The first flowers, until an asteroid hit'],
    [66, 'Paleogene', 'The big dinosaurs are gone, and mammals take over'],
    [23.03, 'Neogene', 'Grasslands spread, and apes walk on two legs'],
    [2.58, 'Pleistocene', 'Ice ages, mammoths, and the first people like us'],
    [0.0117, 'Today', ''],
  ];
  const DYINGS = [
    [443.8, 'An ice age', 'most kinds of sea life die out'],
    [372, 'The Late Devonian extinction', 'reefs and many fish die out'],
    [251.9, 'The Great Dying', 'the worst of all, when most kinds of life die out'],
    [201.4, 'The end-Triassic extinction', 'which leaves the world to the dinosaurs'],
    [66, 'The asteroid', 'the dinosaurs die out, all but the birds'],
  ];
  // "4.6 to 4 billion years ago", "2.6 million to 11,700 years ago"
  function fromTo(hi, lo) {
    const a = ago(hi).replace(' ago', ''), b = ago(lo), unit = b.replace(/^[\d.,]+ /, '').replace(' ago', '');
    return `${a.endsWith(' ' + unit) ? a.slice(0, -unit.length - 1) : a} to ${b}`;
  }
  const ageAt = ma => AGES.findIndex((a, i) => ma >= (AGES[i + 1]?.[0] ?? -1));
  const agesBox = document.createElement('div');
  agesBox.className = 'dc-ages';
  agesBox.setAttribute('aria-hidden', 'true');
  // (each age's line about it is kept for travelling through time: on the board it got in the way of the cards)
  agesBox.innerHTML = AGES.map(([ma, name], i) => `<p class="dc-age"><b>${name}</b><span>${i + 1 < AGES.length ? fromTo(ma, AGES[i + 1][0]) : 'The last 12,000 years'}</span></p>`).join('')
    + DYINGS.map(([ma, name, say]) => `<p class="dc-dying"><span><b>${name}</b>, ${ago(ma)}<i>: ${say}</i></span></p>`).join('');
  board.insertBefore(agesBox, world);
  const ageEls = [...agesBox.querySelectorAll('.dc-age')], dyingEls = [...agesBox.querySelectorAll('.dc-dying')];
  const ageTall = [];
  // travelling through time: the line you're at, and the veil over everything after it
  const later = Object.assign(document.createElement('div'), { className: 'dc-later' });
  const nowLine = Object.assign(document.createElement('div'), { className: 'dc-now', innerHTML: '<span></span>' });
  board.append(later, nowLine);
  later.setAttribute('aria-hidden', 'true');
  nowLine.setAttribute('aria-hidden', 'true');
  const ruler = $('dcRuler'), rulerView = ruler.querySelector('.dc-ruler-view');
  let timeAt = null;           // where you've travelled to, down the board, while you're travelling
  // all of time down the board, for the strip: from the earth's start to just under today's cards
  const allTime = () => [yOf(4600), yOf(0) + 170];

  function paintAges() {
    const v = view(), sy = y => cam.y + y * cam.s;
    const starts = AGES.map(([ma]) => sy(yOf(ma)));
    // each age's name where it starts, held in view while you're in it, until the next one pushes it out
    ageEls.forEach((el, i) => {
      const top = starts[i], bottom = starts[i + 1] ?? Infinity;
      const h = ageTall[i] ||= el.offsetHeight;
      const y = Math.min(Math.max(top + 10, v.top), bottom - h - 10);
      el.style.transform = `translateY(${y.toFixed(0)}px)`;
      // (and gone once the next one starts pushing it up, rather than peeking out from under the header)
      el.classList.toggle('is-off', bottom - top < h + 24 || y < v.top - 8 || y > v.h);
    });
    // (one too near the one above it says nothing: zoomed right out they'd pile up)
    let above = -Infinity;
    dyingEls.forEach((el, i) => {
      const y = sy(yOf(DYINGS[i][0])), crowded = y - above < 48 || cam.s < 0.3;
      el.style.transform = `translateY(${y.toFixed(0)}px)`;
      el.classList.toggle('is-off', y < 0 || y > v.h);
      el.classList.toggle('is-quiet', crowded);
      if (!crowded) above = y;
    });
    // the strip: the ages as bands, and a window round the part you can see
    const [y0, y1] = allTime(), f = y => ((y - y0) / (y1 - y0) * 100).toFixed(2) + '%';
    ruler.style.backgroundImage = `linear-gradient(${AGES.map(([ma], i) => `var(--age-${i}) ${f(yOf(ma))} ${f(i + 1 < AGES.length ? yOf(AGES[i + 1][0]) : y1)}`).join(',')})`;
    const wTop = Math.max(0, Math.min(1, ((v.top - cam.y) / cam.s - y0) / (y1 - y0)));
    const wBottom = Math.max(0, Math.min(1, ((v.bottom - cam.y) / cam.s - y0) / (y1 - y0)));
    rulerView.style.top = (wTop * 100).toFixed(2) + '%';
    rulerView.style.height = (Math.max(0.01, wBottom - wTop) * 100).toFixed(2) + '%';
    if (timeAt !== null) {
      const y = sy(timeAt), ma = maAt(timeAt), age = AGES[Math.max(0, ageAt(ma))];
      later.style.top = nowLine.style.top = y.toFixed(0) + 'px';
      const when = ma < 0.0117 ? 'Today' : `${ago(ma).replace(/^\w/, c => c.toUpperCase())} · ${age[1]}`;
      const pill = nowLine.firstChild;
      if (pill.dataset.when !== when) {
        pill.dataset.when = when;
        pill.replaceChildren(when, ...(ma >= 0.0117 && age[2] ? [Object.assign(document.createElement('small'), { textContent: age[2] })] : []));
      }
      ruler.setAttribute('aria-valuetext', ma >= 0.0117 && age[2] ? `${when}. ${age[2]}` : when);
    }
  }
  // travel to the moment at this height on the strip: the board slides so that moment is level with your finger
  let travelAge = -1, fadeTimer = 0;
  function travel(clientY) {
    const r = ruler.getBoundingClientRect(), b = board.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    const [y0, y1] = allTime();
    timeAt = y0 + k * (y1 - y0);
    cancelAnimationFrame(camFrame);
    cam.y = r.top + k * r.height - b.top - timeAt * cam.s;
    clearTimeout(fadeTimer);
    later.classList.add('is-on');
    nowLine.classList.add('is-on');
    look();
    const age = ageAt(maAt(timeAt));
    if (age !== travelAge && travelAge !== -1) dcSound.play('tap');
    travelAge = age;
  }
  function arrive() {
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => { later.classList.remove('is-on'); nowLine.classList.remove('is-on'); }, 900);
    if (timeAt !== null) emit('travel', { ma: maAt(timeAt) });
    travelAge = -1;
  }
  ruler.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    ruler.setPointerCapture(e.pointerId);
    ruler.classList.add('is-held');
    travel(e.clientY);
  });
  ruler.addEventListener('pointermove', e => { if (ruler.hasPointerCapture(e.pointerId)) travel(e.clientY); });
  const letGo = e => { if (!ruler.classList.contains('is-held')) return; ruler.classList.remove('is-held'); arrive(); };
  ruler.addEventListener('pointerup', letGo);
  ruler.addEventListener('pointercancel', letGo);
  ruler.addEventListener('keydown', e => {
    const step = { ArrowUp: -1, ArrowDown: 1, PageUp: -6, PageDown: 6, Home: -100, End: 100 }[e.key];
    if (!step) return;
    e.preventDefault();
    const r = ruler.getBoundingClientRect(), [y0, y1] = allTime();
    const k = timeAt === null ? ((view().top + view().bottom) / 2 - cam.y) / cam.s : timeAt;
    travel(r.top + Math.min(1, Math.max(0, (k - y0) / (y1 - y0) + step * 0.015)) * r.height);
    arrive();
  });

  // ---------- looking around: drag, scroll, pinch ----------

  const cam = { x: 0, y: 0, s: 1 };
  function look() {
    world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})`;
    // the fossils in the sand move with the board, so you can feel it moving even far from any card
    board.style.setProperty('--tx', cam.x + 'px');
    board.style.setProperty('--ty', cam.y + 'px');
    board.style.setProperty('--ts', 320 * cam.s + 'px');
    paintAges();
  }
  const clampS = s => Math.min(2.2, Math.max(0.06, s));
  function zoomAt(px, py, s) {
    s = clampS(s);
    cam.x = px - (px - cam.x) * (s / cam.s);
    cam.y = py - (py - cam.y) * (s / cam.s);
    cam.s = s;
    look();
  }
  let camFrame = 0;
  function fly(to) {
    cancelAnimationFrame(camFrame);
    if (!motion()) { Object.assign(cam, to); return look(); }
    const from = { ...cam }, t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / 520), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      cam.x = from.x + (to.x - from.x) * e; cam.y = from.y + (to.y - from.y) * e; cam.s = from.s + (to.s - from.s) * e;
      look();
      if (k < 1) camFrame = requestAnimationFrame(step);
    };
    camFrame = requestAnimationFrame(step);
  }
  // the part of the board you can see past the logo, the keys and the panel
  function view() {
    const r = board.getBoundingClientRect();
    const panelOpen = !$('dcPanel').hidden && innerWidth > 760, phone = innerWidth <= 760;
    // (on a phone the first visit's hint sits over the top of the board, so the board starts under it, and the
    // keys along the bottom take more room)
    const hint = $('dcHint');
    const top = phone && !hint.hidden ? Math.max(150, hint.offsetTop + hint.offsetHeight + 12) : phone ? 150 : 110;
    return { left: 48, top, right: r.width - (panelOpen ? 448 : phone ? 64 : 24), bottom: r.height - (phone ? 92 : 84), w: r.width, h: r.height };
  }
  // a box of the board (world units) into view: left alone if it's already there, slid in if it fits, else zoomed
  // out to fit. least: never zoomed out further than that, so the cards stay readable (it's lined up with the
  // top of the box instead, and the middle of it across)
  function show(box, opts = {}) {
    const v = view();
    let s = opts.s ?? cam.s;
    const fits = (box.r - box.l) * s <= v.right - v.left && (box.b - box.t) * s <= v.bottom - v.top;
    if (!fits) s = clampS(Math.min((v.right - v.left) / (box.r - box.l), (v.bottom - v.top) / (box.b - box.t)) * .95);
    if (opts.least && s < opts.least) opts = { ...opts, s: (s = opts.least), top: true, center: true };
    const sx = box.l * s + cam.x, sy = box.t * s + cam.y, ex = box.r * s + cam.x, ey = box.b * s + cam.y;
    if (!opts.center && s === cam.s && sx >= v.left && ex <= v.right && sy >= v.top && ey <= v.bottom) return;
    const x = (v.left + v.right) / 2 - (box.l + box.r) / 2 * s;
    const y = opts.top ? v.top + 10 - box.t * s : (v.top + v.bottom) / 2 - (box.t + box.b) / 2 * s;
    fly({ x, y, s });
  }
  const boxOf = ids => {
    const b = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
    for (const id of ids) {
      const g = goal.get(id), it = items.get(id);
      if (!g || !it) continue;
      b.l = Math.min(b.l, g.x - WIDTH[it.kind] / 2); b.r = Math.max(b.r, g.x + WIDTH[it.kind] / 2);
      b.t = Math.min(b.t, g.y); b.b = Math.max(b.b, g.y + (tall.get(id) || 0));
    }
    return b;
  };
  const fitAll = () => show(boxOf([...items.keys()]), { center: true, s: 1 });

  // dragging (a mouse, or one finger) moves the board; two fingers pinch. a press that hardly moves is a click
  const pointers = new Map();
  let dragged = false, pinch = null;
  board.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    cancelAnimationFrame(camFrame);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: cam.s };
    }
  });
  addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 6) { dragged = true; board.classList.add('is-dragging'); }
    if (pointers.size === 1 && dragged) { cam.x += dx; cam.y += dy; look(); }
    else if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const r = board.getBoundingClientRect();
      cam.x += dx / 2; cam.y += dy / 2;
      zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d);
    }
  });
  const lift = e => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) { board.classList.remove('is-dragging'); setTimeout(() => { dragged = false; }); }
  };
  addEventListener('pointerup', lift);
  addEventListener('pointercancel', lift);
  board.addEventListener('wheel', e => {
    e.preventDefault();
    const r = board.getBoundingClientRect();
    const d = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    zoomAt(e.clientX - r.left, e.clientY - r.top, cam.s * Math.exp(-d * 0.0015));
  }, { passive: false });
  const zoomBy = f => { const r = board.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, cam.s * f); };
  board.addEventListener('keydown', e => {
    const moves = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] };
    if (moves[e.key] && e.target === board) { e.preventDefault(); cam.x += moves[e.key][0]; cam.y += moves[e.key][1]; look(); }
    else if (e.key === '+' || e.key === '=') zoomBy(1.25);
    else if (e.key === '-' || e.key === '_') zoomBy(0.8);
    else if (e.key === '0') fitAll();
  });
  // tabbing to a creature off the edge: the browser would scroll the board itself, so undo that and slide to it
  layer.addEventListener('focusin', e => {
    const el = e.target.closest('.dc-node');
    board.scrollLeft = board.scrollTop = 0;
    if (el && el.matches(':focus-visible')) { const id = isNaN(el.dataset.id) ? el.dataset.id : +el.dataset.id; show(boxOf([id])); }
  });
  $('dcIn').addEventListener('click', () => zoomBy(1.3));
  $('dcOut').addEventListener('click', () => zoomBy(1 / 1.3));
  $('dcFit').addEventListener('click', fitAll);

  // ---------- clicking things on the board ----------

  layer.addEventListener('click', e => {
    const el = e.target.closest('.dc-node');
    if (!el || dragged) return;
    const it = items.get(isNaN(el.dataset.id) ? el.dataset.id : +el.dataset.id);
    if (!it) return;
    if (it.kind === 'unfound') discover(it.q, el);
    else if (it.kind === 'found') { pick(it.q); dcSound.play('tap'); emit('open', { q: it.q }); }
    else if (it.kind === 'more') { open.set(it.q, (open.get(it.q) ?? PAGE) + PAGE * 2); save(); draw(); dcSound.play('sprout', { count: lastBorn }); afterGrow(it.q); emit('more', { q: it.q }); }
    else if (it.kind === 'latin') latinFor(it.q, el);
  });
  gapLayer.addEventListener('click', e => {
    const g = e.target.closest('[data-gap]');
    if (!g || dragged) return;
    // uncover the next few missing ancestors, from the top: they go on the board as mysteries to discover.
    // a few at a time, so a long gap doesn't drop a whole column at once
    const it = items.get(isNaN(g.dataset.gap) ? g.dataset.gap : +g.dataset.gap);
    const dug = (it?.via || []).slice(0, 4);
    for (const q of dug) extra.set(q, homeOf.get(q));
    save();
    draw();
    dcSound.play('sparkle');
    emit('gap');
    show(boxOf([it.parent, ...dug, it.id]));
  });

  async function discover(q, el) {
    el?.classList.add('is-busy');
    try {
      await loadSlice(homeOf.get(q));
      const n = nodes.get(q);
      found.set(q, homeOf.get(q) ?? null);
      extra.delete(q);
      if (n.live && n.s) await askLatin(q).catch(() => { });
    } catch (e) {
      console.warn(e);
      el?.classList.remove('is-busy');
      return;
    }
    $('dcHint').hidden = true;
    store.set('distantCousinsHinted', true);
    save();
    draw();
    celebrate(q, lastBorn);
    afterGrow(q);
    emit('find', { q, hunting: !!hunt });
    hunt?.found?.(q);
  }
  // bring the new branches into view
  function afterGrow(q) {
    const it = items.get(q);
    if (!it) return;
    // (a group with lots of branches would zoom the board out until nothing could be read: past a point the
    // middle ones are shown, and the rest are a drag away)
    show(boxOf([q, ...it.kids.map(k => k.id)]), { least: innerWidth <= 760 ? 0.6 : 0.5 });
  }
  async function latinFor(q, el) {
    el.classList.add('is-busy');
    el.querySelector('span:last-child').textContent = 'asking Wikidata...';
    try { await askLatin(q); } catch { el.classList.remove('is-busy'); el.querySelector('span:last-child').textContent = "Wikidata didn't answer. Try again"; return; }
    open.set(q, (open.get(q) ?? PAGE) + PAGE);
    save();
    draw();
    dcSound.play('sprout', { count: lastBorn });
    afterGrow(q);
    emit('latin', { q });
  }

  // put a creature on the board from anywhere (search, members, the family line, surprise, your favourite) and go to it
  // (name: to find it by if the slice it was in has gone, as a favourite saved before the tree was rebuilt can be)
  async function bring(q, home, name) {
    // (no jumping straight there in the middle of a hunt)
    if (hunt) return;
    try { await loadSlice(home ?? homeOf.get(q)); } catch (e) {
      const again = name && await homeFor(q, name);
      try { if (again === undefined) throw e; await loadSlice(again); } catch (e2) { console.warn(e2); return; }
    }
    if (!nodes.has(q)) return;
    const fresh = !found.has(q) && q !== ROOT;
    if (fresh) { found.set(q, homeOf.get(q) ?? null); save(); }
    $('dcHint').hidden = true;
    store.set('distantCousinsHinted', true);
    draw();
    pick(q, { go: true });
    // a new find is celebrated once the board's flown to it
    if (fresh) { setTimeout(() => celebrate(q, 0), motion() ? 480 : 0); emit('find', { q }); }
    else dcSound.play('tap');
  }

  // ---------- the panel: everything about one creature or group ----------

  const panel = $('dcPanel');
  let current = null;
  const recent = [];           // the last few looked at, offered when comparing
  function pick(q, opts = {}) {
    const n = nodes.get(q);
    if (!n) return;
    selected = q;
    current = n;
    if (q !== ROOT) { const i = recent.indexOf(q); if (i >= 0) recent.splice(i, 1); recent.unshift(q); recent.length = Math.min(recent.length, 6); }
    for (const [id, el] of els) el.classList.toggle('is-picked', id === q && items.get(id)?.kind === 'found');
    paint();
    const wasHidden = panel.hidden;
    panel.hidden = false;
    renderHere(n);
    panel.scrollTop = 0;
    panelScrolled();
    if (wasHidden || opts.go) $('dcName').focus({ preventScroll: true });
    requestAnimationFrame(() => {
      const it = items.get(q);
      if (it) show(boxOf([q]), { center: !!opts.go, s: opts.go ? Math.max(cam.s, .9) : cam.s });
    });
  }
  function closePanel() {
    panel.hidden = true;
    selected = null;
    for (const el of els.values()) el.classList.remove('is-picked');
    paint();
    board.focus({ preventScroll: true });
  }
  $('dcClose').addEventListener('click', closePanel);
  // the bar at the top of the panel: see-through over the picture, solid once you scroll, and with the name in it
  // once the big one has gone by
  const panelScrolled = () => {
    panel.classList.toggle('is-scrolled', panel.scrollTop > 8);
    panel.classList.toggle('is-titled', panel.scrollTop > $('dcName').offsetTop + $('dcName').offsetHeight - 40);
  };
  panel.addEventListener('scroll', panelScrolled, { passive: true });
  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || document.activeElement === input || document.querySelector('.dc-vs:not([hidden])')) return;
    if (!panel.hidden) closePanel();
  });

  // ---------- windows over everything: side by side, achievements, games ----------
  // a window over the whole page (a .dc-vs with its card inside): opens with focus on its close key, keeps
  // the tab key inside, and shuts on escape, its close key or a click outside, giving focus back
  function dialog(el, onClose) {
    let back = null;
    const d = {
      get open() { return !el.hidden; },
      show() {
        if (el.hidden) back = document.activeElement;
        el.hidden = false;
        document.body.classList.add('dc-vs-open');
        el.querySelector('.dc-close')?.focus({ preventScroll: true });
      },
      close() {
        if (el.hidden) return;
        el.hidden = true;
        if (!document.querySelector('.dc-vs:not([hidden])')) document.body.classList.remove('dc-vs-open');
        onClose?.();
        back?.focus?.({ preventScroll: true });
      },
    };
    el.querySelector('.dc-close')?.addEventListener('click', d.close);
    el.addEventListener('click', e => { if (e.target === el) d.close(); });
    el.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !e.defaultPrevented) { e.stopPropagation(); d.close(); }
      if (e.key !== 'Tab') return;
      const f = [...el.querySelectorAll('button, input, a[href]')].filter(x => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    return d;
  }

  // a picture with its credit, never cropped
  function showPicture(n, file, img, box, credit, whose) {
    box.hidden = !file;
    credit.textContent = '';
    const ready = picReady.get(file);
    if (ready) img.src = ready.src; else img.removeAttribute('src');
    if (!file) return;
    loadPics([file]).then(([p]) => {
      if (whose() !== n) return;
      if (!p) { box.hidden = true; return; }
      if (img.src !== p.src) img.src = p.src;
      img.alt = n.p ? `${n.p}, the best known ${nameOf(n)}` : nameOf(n);
      const by = [n.p && n.q !== ROOT ? `Pictured: ${n.p}.` : '', p.by && `Picture: ${p.by.slice(0, 80)}`, p.licence].filter(Boolean).join(' ');
      credit.replaceChildren(Object.assign(document.createElement('a'), { href: p.page, target: '_blank', rel: 'noopener', textContent: by || 'About this picture' }));
    });
  }

  function renderHere(n) {
    const group = isGroup(n);
    panel.classList.toggle('is-extinct', !!n.x);
    panel.classList.toggle('is-group', group);
    const tags = [];
    if (group) tags.push(['Group', 'group']);
    if (n.q === ROOT) tags.push(['About 4.2 billion years ago', 'old']);
    else if (n.x) tags.push(['Extinct', 'gone']);
    else if (!n.o && !n.live) tags.push(['Alive today', 'alive']);
    if (n.r && n.r !== 'species' && n.r !== 'clade') tags.push([cap(n.r), '']);
    $('dcTags').replaceChildren(...tags.map(([t, c]) => Object.assign(document.createElement('span'), { className: 'dc-tag' + (c ? ' dc-tag-' + c : ''), textContent: t })));
    $('dcName').textContent = $('dcMini').textContent = nameOf(n);
    $('dcName').classList.toggle('is-latin', !n.l && n.q !== ROOT);
    $('dcSci').textContent = n.q === ROOT ? 'LUCA, the last universal common ancestor' : latinOf(n);
    $('dcSci').hidden = !$('dcSci').textContent;
    const kids = kidsOf(n), out = kids.filter(k => found.has(k)).length;
    let facts = factsOf(n);
    const all = kids.length + (latin.has(n.q) || n.live ? 0 : n.t || 0);
    if (all && group) facts += ` You've found ${fmt(out)} of its ${fmt(all)} ${all === 1 ? 'branch' : 'branches'}.`;
    $('dcFacts').textContent = facts;
    // what makes a group a group (traits.js): its own, or for a creature its nearest group's that has one
    const owner = group ? (TRAITS[n.q] ? n : null) : trail(n.q).reverse().map(q => nodes.get(q)).find(p => p && TRAITS[p.q] && p.q !== n.q);
    $('dcShare').hidden = !owner;
    if (owner) {
      const its = owner.l ? nameOf(owner).toLowerCase() : nameOf(owner);
      $('dcShareHead').textContent = group ? 'What they all share' : / family$/.test(its) ? `Like everyone in the ${its}` : `Like all ${its}`;
      $('dcShareText').textContent = TRAITS[owner.q];
    }

    // a creature's picture. a group shows a few of its best known members instead, each one a way in
    const members = group ? (n.m || []) : [];
    const own = members.filter(m => m[3]).length >= 2 ? null : picOf(n);
    showPicture(n, own, $('dcHereImg'), $('dcHerePic'), $('dcHereCredit'), () => current);
    const box = $('dcMembers');
    box.hidden = !members.length;
    box.innerHTML = members.length ? `<p class="dc-sub">Best known members</p><div class="dc-member-grid">${members.map(([q, , name, file]) =>
      `<button class="dc-member${found.has(q) ? ' is-met' : ''}" type="button" data-q="${q}"><span class="dc-member-pic${file ? '' : ' is-none'}" data-pic-box>${file ? `<img data-file="${esc(file)}" alt="">` : ''}</span><span class="dc-member-name">${esc(name)}</span></button>`).join('')}</div>` : '';
    fillPics(box);

    // a few lines from wikipedia
    const read = $('dcRead'), wiki = $('dcWiki'), title = wikiTitle(n);
    read.textContent = ''; wiki.hidden = true;
    if (title) loadRead(title).then(r => {
      if (current !== n || !r) return;
      const cut = r.text.length > 520 ? r.text.slice(0, r.text.lastIndexOf('. ', 520) + 1 || 520) : r.text;
      read.textContent = cut;
      wiki.href = r.url || 'https://en.wikipedia.org/wiki/' + encodeURIComponent(title);
      wiki.hidden = false;
    });

    renderLine(n);
    renderTime($('dcTime'), [n]);
    const isFav = fav && fav.q === n.q;
    $('dcStar').setAttribute('aria-pressed', isFav);
    $('dcStarText').textContent = isFav ? 'Your favourite' : 'Make favourite';
    $('dcVsOpen').hidden = n.q === ROOT || !!n.o;
    // how many explorers have it as their favourite, once the server says
    $('dcLoved').hidden = true;
    const ask = ++lovedAsk;
    if (n.q !== ROOT && !n.o) server('/cousins/favs?q=' + n.q).then(r => { if (ask === lovedAsk && current === n) sayLoved(n, r?.n); });
  }
  // (only the newest answer counts: one asked just before you starred it would be one short)
  let lovedAsk = 0;
  function sayLoved(n, count) {
    const el = $('dcLoved'), mine = fav?.q === n.q;
    el.hidden = !Number.isInteger(count);
    if (el.hidden) return;
    const others = count - (mine ? 1 : 0);
    el.lastChild.textContent = !count ? "Nobody's favourite yet"
      : !others ? 'Your favourite, and nobody else\'s yet'
      : `The favourite of ${fmt(count)} ${count === 1 ? 'explorer' : 'explorers'}${mine ? ', you included' : ''}`;
  }
  $('dcMembers').addEventListener('click', e => {
    const b = e.target.closest('[data-q]');
    const m = b && (current?.m || []).find(m => m[0] === +b.dataset.q);
    if (m) bring(m[0], m[1]);
  });

  // its family line, from the first life down: every group it belongs to, each one a button
  function renderLine(n) {
    const box = $('dcLine');
    const path = trail(n.q).slice(0, -1);
    box.hidden = !path.length;
    box.innerHTML = `<p class="dc-sub">Family line</p><ol>${path.map(q => `<li><button class="dc-step" type="button" data-q="${q}">${esc(nameOf(nodes.get(q)))}</button></li>`).join('')}<li><span class="dc-step is-here">${esc(nameOf(n))}</span></li></ol>`;
  }
  $('dcLine').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) bring(+b.dataset.q); });

  // ---------- when they lived: a strip of deep time ----------

  const ERAS = [[4600, 538.8, 'Precambrian'], [538.8, 251.9, 'Paleozoic'], [251.9, 66, 'Mesozoic'], [66, 0, 'Cenozoic']];
  const PERIODS = [[66, 23.03, 'Paleogene'], [23.03, 2.58, 'Neogene'], [2.58, 0, 'Quaternary']];
  const rangeOf = n => n && n.a !== undefined ? [n.a, n.x ? n.z : 0] : n && !n.x && !n.o && n.q !== ROOT && !n.live ? [undefined, 0] : null;
  function renderTime(box, who) {
    const rows = who.map((n, i) => [n, rangeOf(n), i ? 'b' : 'a']);
    const known = rows.filter(r => r[1] && r[1][0] !== undefined);
    if (!known.length) { box.hidden = true; return; }
    box.hidden = false;
    const oldest = Math.max(...known.map(r => r[1][0]));
    const top = oldest > 66 ? Math.min(4600, oldest * 1.12) : Math.max(oldest * 1.25, 0.05);
    const x = ma => (1 - ma / top) * 100;
    const bands = (top > 66 ? ERAS : PERIODS).filter(([, b]) => b < top);
    let html = `<p class="dc-sub">${who.length > 1 || isGroup(who[0]) ? 'When they lived' : 'When it lived'}</p><div class="dc-time-strip">`;
    for (const [a, b, name] of bands) {
      const l = x(Math.min(a, top)), w = x(b) - l;
      html += `<span class="dc-era" style="left:${l}%;width:${w}%"><span>${w > 16 ? name : ''}</span></span>`;
    }
    html += '</div>';
    for (const [n, r, cls] of rows) {
      if (!r) continue;
      const start = r[0] === undefined ? 0 : x(r[0]), end = r[1] === undefined ? start : x(r[1]);
      html += `<div class="dc-time-row dc-time-${cls}"><span class="dc-time-bar${r[0] === undefined ? ' is-now' : ''}" style="left:${start}%;width:${Math.max(end - start, 0.6)}%"></span><span class="dc-time-who">${esc(nameOf(n))}</span></div>`;
    }
    html += `<div class="dc-time-ends"><span>${ago(top)}</span><span>Now</span></div>`;
    box.innerHTML = html;
  }

  // ---------- side by side: any two, how they're related, when they lived, how big ----------

  const vs = $('dcVs'), vsBody = $('dcVsBody');
  let vsA = null, vsB = null;
  const vsWindow = dialog(vs);
  // a few everyone knows, to compare with when nothing else comes to mind
  const IDEAS = [[15978631, 'Human'], [13098211, 'Tyrannosaurus rex'], [42196, 'Blue whale'], [57818409, 'House cat'], [30034, 'Honey bee'], [651361, 'Common octopus']];
  function openVs(a, b) {
    vsA = a; vsB = b && b.q !== a.q ? b : null;
    renderVs();
    vsWindow.show();
    if (vsB) { dcSound.play('meet'); emit('compare', { a: vsA.q, b: vsB.q }); }
  }
  const closeVs = () => vsWindow.close();
  $('dcVsOpen').addEventListener('click', () => {
    if (!current) return;
    const other = fav && fav.q !== current.q && nodes.get(fav.q);
    openVs(current, other || null);
  });

  function side(n, which) {
    const died = n.x && diedOut(n);
    const status = n.x ? (died ? `Died out ${died}` : 'Extinct') : 'Alive today';
    // a group shows four of its members, so it doesn't look like any one of them
    const members = isGroup(n) ? (n.m || []).filter(m => m[3]).slice(0, 4) : [];
    const file = picOf(n);
    const pic = members.length >= 2 ? `<span class="dc-vs-pic is-collage">${members.map(m => `<span data-pic-box><img data-file="${esc(m[3])}" alt="${esc(m[2])}"></span>`).join('')}</span>`
      : `<span class="dc-vs-pic" data-pic-box>${file ? `<img data-file="${esc(file)}" alt="${esc(nameOf(n))}">` : n.si ? silImg(n.si) : ''}</span>`;
    // (the picture's a photo pinned to the page, a bit askew)
    return `<div class="dc-vs-side${n.x ? ' is-extinct' : ''}">
      <span class="dc-vs-photo">${pic}</span>
      <h3 class="dc-vs-name${n.l ? '' : ' is-latin'}">${esc(nameOf(n))}</h3>
      ${latinOf(n) ? `<p class="dc-vs-sci">${esc(latinOf(n))}</p>` : ''}
      <p class="dc-vs-stats"><span class="dc-tag ${n.x ? 'dc-tag-gone' : 'dc-tag-alive'}">${status}</span>${isGroup(n) ? '<span class="dc-tag dc-tag-group">Group</span>' : ''}${n.kg ? `<span class="dc-tag">About ${weight(n.kg)}</span>` : ''}</p>
      <p class="dc-vs-keys"><button class="dc-link" type="button" data-go="${which}">Show on the tree</button>${which === 'b' ? ' &middot; <button class="dc-link" type="button" data-change>Pick another</button>' : ''}</p>
    </div>`;
  }

  function chooser() {
    const pool = [];
    // (one name inside another is the same animal twice over, near enough: "Cat" and "House cat", "Tyrannosaurus"
    // and "Tyrannosaurus rex")
    const words = s => tidy(s).split(' ');
    const alike = (a, b) => { const [x, y] = [words(a), words(b)].sort((p, q) => p.length - q.length); return x.every(w => y.includes(w)); };
    const addIdea = (q, name, home) => { if (q !== vsA.q && !pool.some(p => p[0] === q || alike(p[1], name)) && !alike(nameOf(vsA), name)) pool.push([q, name, home]); };
    if (fav) addIdea(fav.q, fav.name, fav.h);
    for (const q of recent) { const n = nodes.get(q); if (n && !n.o) addIdea(q, nameOf(n), homeOf.get(q)); }
    for (const [q, name] of IDEAS) addIdea(q, nodes.get(q) ? nameOf(nodes.get(q)) : name);
    return `<div class="dc-vs-side dc-vs-pick">
      <h3 class="dc-vs-ask">Compare with...</h3>
      <div class="dc-find dc-vs-find">
        <svg class="dc-find-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20"/></svg>
        <input id="dcVsFind" type="search" autocomplete="off" spellcheck="false" placeholder="Any creature" role="combobox" aria-expanded="false" aria-controls="dcVsFound" aria-autocomplete="list" aria-label="Compare with">
        <ul class="dc-found" id="dcVsFound" role="listbox" aria-label="Creatures to compare with" hidden></ul>
      </div>
      <p class="dc-sub">Or try</p>
      <div class="dc-vs-ideas">${pool.slice(0, 8).map(([q, name, home]) => `<button class="dc-chip" type="button" data-idea="${q}" data-h="${home ?? ''}">${esc(name)}</button>`).join('')}</div>
    </div>`;
  }

  async function setB(q, home, name) {
    if (home === undefined || home === null) home = await homeFor(q, name);
    try { await loadSlice(home); } catch (e) {
      const again = name && await homeFor(q, name);
      try { if (again === undefined) throw e; await loadSlice(again); } catch (e2) { console.warn(e2); return; }
    }
    if (!nodes.has(q)) return;
    vsB = nodes.get(q);
    renderVs();
    dcSound.play('meet');
    emit('compare', { a: vsA.q, b: vsB.q });
    $('dcVsClose').focus({ preventScroll: true });
  }

  function renderVs() {
    const a = vsA, b = vsB;
    let html = `<div class="dc-vs-pair">${side(a, 'a')}<span class="dc-vs-and" aria-hidden="true">vs</span>${b ? side(b, 'b') : chooser()}</div>`;
    if (b) {
      const facts = vsFacts(a, b);
      if (facts.length) html += `<ul class="dc-vs-facts">${facts.map(([kind, words], i) => `<li class="dc-vs-fact is-${kind}" style="--i:${i}"><span class="dc-vs-fact-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${FACT_ICONS[kind]}</svg></span><span>${words}</span></li>`).join('')}</ul>`;
      html += `<section class="dc-vs-box dc-vs-family">${family(a, b)}</section><section class="dc-vs-box"><div class="dc-time dc-vs-time" id="dcVsTime"></div></section>`;
    }
    vsBody.innerHTML = html;
    if (b) renderTime($('dcVsTime'), [a, b]);
    fillPics(vsBody);
    if (!b) finder($('dcVsFind'), $('dcVsFound'), e => setB(e[0], e[1]));
  }
  vsBody.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.idea) setB(+t.dataset.idea, t.dataset.h ? +t.dataset.h : undefined, t.textContent);
    else if (t.hasAttribute('data-change')) { vsB = null; renderVs(); $('dcVsFind').focus(); }
    else if (t.dataset.go) { const n = t.dataset.go === 'a' ? vsA : vsB; closeVs(); bring(n.q, homeOf.get(n.q)); }
    else if (t.dataset.q) { closeVs(); bring(+t.dataset.q); }
  });

  // the two family lines, from the group they share down to each of them. long lines lose their middle
  function family(a, b) {
    const A = trail(a.q), B = trail(b.q);
    let i = 0;
    while (i < A.length && i < B.length && A[i] === B[i]) i++;
    const meet = nodes.get(A[i - 1]);
    // (--i: each step comes in after the one above it, down from where they meet)
    const step = (q, i) => `<li style="--i:${i}"><button class="dc-step" type="button" data-q="${q}">${esc(nameOf(nodes.get(q)))}</button></li>`;
    const line = (qs, n) => {
      const mid = qs.slice(0, -1);
      const shown = mid.length > 5 ? [...mid.slice(0, 2), null, ...mid.slice(-2)] : mid;
      return `<ol class="dc-vs-line">${shown.map((q, i) => q === null ? `<li class="dc-vs-skip" style="--i:${i}">${mid.length - 4} more</li>` : step(q, i)).join('')}<li style="--i:${shown.length}"><span class="dc-step is-here">${esc(nameOf(n))}</span></li></ol>`;
    };
    const head = '<p class="dc-sub">How they\'re related</p>';
    if (i === B.length || i === A.length) {
      const [inner, outer, rest] = i === B.length ? [a, b, A.slice(i)] : [b, a, B.slice(i)];
      return `${head}<p class="dc-vs-meet">${esc(nameOf(inner))} is one of the ${esc(nameOf(outer).toLowerCase())}${rest.length > 1 ? `, ${rest.length} ${rest.length === 1 ? 'step' : 'steps'} down` : ''}.</p>
        <div class="dc-vs-tree is-one"><span class="dc-vs-top">${esc(nameOf(outer))}</span>${line(rest, inner)}</div>`;
    }
    // (the oldest fossil of either branch: they'd already split by then)
    const split = Math.max(nodes.get(A[i])?.a ?? -1, nodes.get(B[i])?.a ?? -1);
    // (and what everyone in the group where they meet has, if traits.js knows: what the two have in common)
    return `${head}<p class="dc-vs-meet">Their family lines meet at <button class="dc-link" type="button" data-q="${meet.q}">${esc(nameOf(meet))}</button>${split > HOLOCENE ? `, and had gone their separate ways at least ${ago(split)}` : ''}.</p>
      ${TRAITS[meet.q] && meet.q !== ROOT ? `<p class="dc-vs-share"><b>What they have in common:</b> ${esc(TRAITS[meet.q])}</p>` : ''}
      <div class="dc-vs-tree"><span class="dc-vs-top">${esc(nameOf(meet))}</span>
        <svg class="dc-vs-fork" viewBox="0 0 200 28" preserveAspectRatio="none" aria-hidden="true"><path d="M100 0V10Q100 14 96 14H54Q50 14 50 18V28M100 10Q100 14 104 14H146Q150 14 150 18V28"/></svg>
        <div class="dc-vs-lines">${line(A.slice(i), a)}${line(B.slice(i), b)}</div>
      </div>`;
  }

  // what each fact is about, as a little drawing: which came first, alive together, never met, both alive, heavier
  const FACT_ICONS = {
    first: '<path d="M7 3.5h10M7 20.5h10M8.5 3.5v2.8c0 2.4 3.5 3.6 3.5 5.7s-3.5 3.3-3.5 5.7v2.8M15.5 3.5v2.8c0 2.4-3.5 3.6-3.5 5.7s3.5 3.3 3.5 5.7v2.8"/>',
    together: '<circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/>',
    apart: '<circle cx="6" cy="12" r="3.5"/><circle cx="18" cy="12" r="3.5"/><path d="M10.5 12h.01M13.5 12h.01"/>',
    alive: '<path d="M12 21V11M12 11c-4 0-6-3-6-6 3 0 6 2 6 6zM12 14c3 0 5.5-2 5.5-5-3 0-5.5 2-5.5 5z"/>',
    heavy: '<circle cx="12" cy="6.5" r="2.5"/><path d="M7.5 10h9l2.5 10h-14z"/>',
  };
  // the facts, each [kind, words]
  function vsFacts(a, b) {
    const lines = [];
    const add = (kind, words) => lines.push([kind, words]);
    const A = esc(nameOf(a)), B = esc(nameOf(b));
    // only what the fossils can actually tell: each date is a stretch of rock (young end, old end), so one
    // came first only if its oldest fossils are older even taking the youngest reading of them, and so on
    const when = n => {
      const r = rangeOf(n);
      if (!r || r[0] === undefined) return null;
      const alive = !n.x;
      return { from: r[0], from2: n.a2 ?? r[0], to: alive ? 0 : n.z, to2: alive ? 0 : n.z2 ?? n.z };
    };
    const wa = when(a), wb = when(b);
    if (wa && wb) {
      const [old, young, O, Y] = wa.from >= wb.from ? [wa, wb, A, B] : [wb, wa, B, A];
      const surely = old.from - young.from2;
      if (surely > Math.max(0.005, old.from * 0.02)) add('first', `<b>${O}</b> came first, at least ${span(surely)} before ${Y}.`);
      else add('first', 'Their oldest fossils are from around the same time, so the fossils can\'t say which came first.');
      // (alive is what the tree says, not a youngest fossil of "0": the last woolly mammoths are from 4,000
      // years ago, which rounds to today)
      if (!a.x && !b.x) add('alive', 'Both are <b>alive today</b>, sharing the planet.');
      else if (old.to !== undefined && young.from2 !== undefined) {
        // apart: the older one's youngest fossils are older than the younger one's oldest, read either way
        const gap = old.to - young.from2;
        const together = Math.min(old.from, young.from) - Math.max(old.to2 ?? 0, young.to2 ?? 0);
        if (gap > 0) add('apart', `As far as the fossils tell, they <b>never met</b>: at least ${span(gap)} apart.`);
        else if (together > 0) add('together', `They were <b>alive at the same time</b>, for at least ${span(together)}.`);
      }
    } else if (!a.x && !b.x && !a.o && !b.o && !a.live && !b.live) add('alive', 'Both are <b>alive today</b>, sharing the planet.');
    if (a.kg && b.kg) {
      const [big, small] = a.kg >= b.kg ? [a, b] : [b, a];
      const times = big.kg / small.kg;
      add('heavy', times < 1.3 ? 'They <b>weigh about the same</b>.' : `<b>${esc(nameOf(big))}</b> ${big.x ? 'was' : 'is'} about ${times < 10 ? +times.toFixed(1) : fmt(Math.round(times))} times heavier.`);
    }
    return lines;
  }

  // ---------- the favourite in the corner ----------

  function renderFav() {
    const box = $('dcFav');
    box.hidden = !fav;
    if (!fav) return;
    $('dcFavName').textContent = fav.name;
    const img = $('dcFavImg');
    if (fav.i) loadPics([fav.i]).then(([p]) => { if (p && img.src !== p.src) img.src = p.src; });
    else img.removeAttribute('src');
  }
  $('dcStar').addEventListener('click', () => {
    const n = current;
    if (!n) return;
    if (fav && fav.q === n.q) fav = null;
    else fav = { q: n.q, h: homeOf.get(n.q), name: nameOf(n), i: picOf(n) || (n.m || []).find(m => m[3])?.[3], path: trail(n.q).map(q => ({ q, h: homeOf.get(q) })) };
    store.set('distantCousinsFav', fav);
    renderHere(n);
    draw(false);
    const ask = ++lovedAsk;
    sendFav().then(r => { if (ask === lovedAsk && current === n && r) sayLoved(n, r.n); });
    if (fav) {
      emit('favourite', { q: n.q });
      dcSound.play('star');
      const r = $('dcStar').getBoundingClientRect(), s = $('dcStage').getBoundingClientRect();
      burst($('dcStage'), r.left - s.left + 24, r.top - s.top + r.height / 2, 'star', 9, 50);
    }
  });
  // your favourite, to the server (and once more on the next visit if it couldn't be reached)
  async function sendFav() {
    const q = fav?.q ?? null;
    const r = await server('/cousins/favs', { q, h: fav?.h ?? null });
    if (r && !r.error) store.set('distantCousinsFavSent', q);
    return r && !r.error ? r : null;
  }
  $('dcFavGo').addEventListener('click', () => {
    if (!fav) return;
    if (found.has(fav.q) || nodes.has(fav.q) && !fav.h) return pick(fav.q, { go: true });
    // one found on wikidata only and not on the board any more: its nearest ancestor that's in the tree
    const at = [...(fav.path || [])].reverse().find(s => s.h !== undefined && s.h !== null);
    if (at && at.q !== fav.q) bring(at.q, at.h);
    else bring(fav.q, fav.h, fav.name);
  });

  // ---------- searching: the box in the corner, and the one for comparing ----------

  const tidy = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // a word in the singular, near enough: butterflies, wolves, foxes, geese
  const IRREGULAR = { geese: 'goose', mice: 'mouse', lice: 'louse', oxen: 'ox', teeth: 'tooth', feet: 'foot', people: 'person' };
  const stem = w => IRREGULAR[w] || (w.length < 4 ? w : w.replace(/ies$/, 'y').replace(/([lr])ves$/, '$1f').replace(/(ch|sh|x|ss)es$/, '$1').replace(/([^su])s$/, '$1'));
  const findFiles = new Map();
  let split = null;
  const findFile = key => {
    if (!findFiles.has(key)) findFiles.set(key, fetch(FIND + key.replace(/^(aux|con|nul|prn)$/, '$1_') + '.json').then(r => r.ok ? r.json() : []).catch(() => { findFiles.delete(key); return []; }));
    return findFiles.get(key);
  };
  // the entries filed under the longest word typed ("t rex" looks under "re"), or a note why there are none yet
  async function entriesFor(words) {
    const key = words.reduce((a, b) => b.length > a.length ? b : a, '');
    if (key.length < 2) return null;
    split ??= await fetch(FIND + 'split.json').then(r => r.json()).then(a => new Set(a)).catch(() => new Set());
    const two = key.slice(0, 2);
    if (split.has(two) && key.length < 3) return 'Keep typing...';
    return findFile(split.has(two) ? key.slice(0, 3) : two);
  }
  // the slice a creature lives in, looked up by its name in the search files
  async function homeFor(q, name) {
    if (homeOf.has(q)) return homeOf.get(q);
    const words = tidy(name || '').split(' ').filter(Boolean);
    const entries = await entriesFor(words);
    return Array.isArray(entries) ? entries.find(e => e[0] === q)?.[1] : undefined;
  }
  // a search box and its list of results: names are [qid, slice, fame, group?, latin name, other names...]
  function finder(input, listEl, choose) {
    let chosen = -1, results = [], typing;
    async function search() {
      const said = input.value;
      const words = tidy(said).split(' ').filter(Boolean);
      const entries = await entriesFor(words);
      if (input.value !== said) return;
      if (entries === null) return list([]);
      if (typeof entries === 'string') return list([], entries);
      // words matched in the singular ("butterfly" finds butterflies, "goose" geese). best first: the name
      // itself, a name starting with it, one with every word whole, any with the words' starts; and between
      // the middle ones the better known wins ("moth" is the butterflies and moths before the moth flies)
      const ws0 = words.map(stem), whole = ws0.join(' ');
      const hits = [];
      for (const e of entries) {
        let best = 0, term = '';
        for (let t = 4; t < e.length; t++) {
          const ws = tidy(e[t]).split(' ').map(stem), p = ws.join(' ');
          if (!ws0.every(w => ws.some(x => x.startsWith(w)))) continue;
          // (the name exactly: a creature before a group, "cat" is the cat, then the cat family)
          const score = p === whole ? (e[3] ? 10000 : 11000) : p.startsWith(whole) ? 350 : ws0.every(w => ws.includes(w)) ? 300 : 1;
          if (score > best) { best = score; term = e[t]; }
        }
        if (best) hits.push({ e, best: best + (best > 1 && best < 1000 ? e[2] : 0), term });
        if (hits.length > 400) break;
      }
      hits.sort((a, b) => b.best - a.best || b.e[2] - a.e[2]);
      list(hits.slice(0, 8), hits.length ? '' : 'Nothing by that name. Try another, or its Latin name');
    }
    function list(hits, note = '') {
      results = hits;
      chosen = -1;
      listEl.replaceChildren(...hits.map(({ e, term }, i) => {
        const li = document.createElement('li');
        li.id = listEl.id + i;
        li.setAttribute('role', 'option');
        // the name the board calls it (the second name, see build.js), so a match on another of its names
        // doesn't read as something else: "cat" finds the Cat and the Cat family, not two Cats
        const main = cap(e[5] || e[4]);
        const sub = e[5] ? e[4] : '';
        li.innerHTML = `<span>${esc(main)}</span>${sub && tidy(sub) !== tidy(main) ? `<i>${esc(sub)}</i>` : ''}${e[3] ? '<b class="dc-found-kind">group</b>' : ''}${found.has(e[0]) ? '<em>found</em>' : ''}`;
        li.addEventListener('mousedown', ev => { ev.preventDefault(); pickResult(i); });
        return li;
      }));
      if (note) listEl.append(Object.assign(document.createElement('li'), { className: 'dc-found-note', textContent: note }));
      const isOpen = !!(hits.length || note);
      listEl.hidden = !isOpen;
      input.setAttribute('aria-expanded', isOpen);
      input.removeAttribute('aria-activedescendant');
    }
    function pickResult(i) {
      const r = results[i];
      if (!r) return;
      input.value = '';
      list([]);
      choose(r.e);
    }
    input.addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(search, 120); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!results.length) return;
        e.preventDefault();
        chosen = (chosen + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
        [...listEl.children].forEach((li, i) => li.setAttribute('aria-selected', i === chosen));
        input.setAttribute('aria-activedescendant', listEl.id + chosen);
      } else if (e.key === 'Enter') { e.preventDefault(); pickResult(chosen < 0 ? 0 : chosen); }
      else if (e.key === 'Escape' && !listEl.hidden) { e.stopPropagation(); list([]); }
    });
    input.addEventListener('blur', () => setTimeout(() => list([]), 100));
  }
  const input = $('dcFind');
  finder(input, $('dcFound'), e => { input.blur(); bring(e[0], e[1]); emit('search', { q: e[0] }); });

  // ---------- surprise me, light and dark, start again ----------

  // the count under the logo hops up with each find (not a hunt's: that's a board of its own)
  let metBefore = null;
  const sayMet = () => {
    if (hunt) return;
    const met = [...found.keys()].filter(q => nodes.has(q) && !isGroup(nodes.get(q))).length;
    const el = $('dcMet');
    // (with more than one tree, which one this is)
    el.textContent = `${trees.list.length > 1 ? treeNow().name + ': ' : ''}${fmt(met)} of ${fmt(total)} creatures found`;
    if (metBefore !== null && met > metBefore) {
      el.classList.remove('is-up');
      void el.offsetWidth;
      el.classList.add('is-up');
    }
    metBefore = met;
  };
  // a cheer under the logo, with a fanfare and confetti (an achievement, a hunt won). one at a time: any
  // that come together wait their turn
  const cheers = [];
  let cheering = false;
  function cheer(title, words = '') {
    cheers.push([title, words]);
    if (!cheering) nextCheer();
  }
  function nextCheer() {
    const c = $('dcCheer');
    const next = cheers.shift();
    if (!next) { cheering = false; c.hidden = true; return; }
    cheering = true;
    c.replaceChildren(Object.assign(document.createElement('b'), { textContent: next[0] }), ...(next[1] ? [Object.assign(document.createElement('span'), { textContent: next[1] })] : []));
    c.hidden = false;
    c.style.animation = 'none';
    void c.offsetWidth;
    c.style.animation = '';
    dcSound.play('hooray');
    const s = $('dcStage').getBoundingClientRect(), r = c.getBoundingClientRect();
    burst($('dcStage'), r.left - s.left + r.width / 2, r.top - s.top + r.height / 2, 'confetti', 28, 160);
    setTimeout(nextCheer, cheers.length ? 2800 : 4500);
  }
  let index = null;
  const loadIndex = () => index ??= fetch(TREE + 'index.json').then(r => r.json());
  loadIndex().then(i => { total = i.count; sayMet(); }).catch(() => { });
  $('dcSurprise').addEventListener('click', async e => {
    const dice = e.currentTarget;
    dice.classList.remove('is-rolling');
    void dice.offsetWidth;
    dice.classList.add('is-rolling');
    dcSound.play('shuffle');
    emit('surprise');
    const { slices: all } = await loadIndex();
    // most slices are beetles and moths, so the first few goes only take somebody with a common name
    for (let tries = 0; tries < 8; tries++) {
      const s = all[Math.floor(Math.random() * all.length)];
      await loadSlice(s);
      const pool = [...nodes.values()].filter(n => homeOf.get(n.q) === s && n.i && !n.g && (tries < 5 ? n.l : n.l || n.w) && !n.p);
      const fresh = pool.filter(n => !found.has(n.q));
      const from = fresh.length ? fresh : pool;
      if (from.length) return bring(from[Math.floor(Math.random() * from.length)].q, s);
    }
  });
  const theme = $('dcTheme');
  const sayTheme = () => {
    const dark = document.documentElement.dataset.dcTheme === 'dark';
    theme.setAttribute('aria-pressed', dark);
    theme.title = dark ? 'Light mode' : 'Dark mode';
  };
  theme.addEventListener('click', () => {
    const next = document.documentElement.dataset.dcTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.dcTheme = next;
    try { localStorage.setItem('distantCousinsTheme', next); } catch { }
    sayTheme();
    dcSound.theme();
    emit('theme', { dark: next === 'dark' });
  });
  sayTheme();

  // ---------- music and sounds (sound.js) ----------
  // on from the start unless turned off last time. browsers hold sound back until the page is first
  // clicked or a key pressed, so it's ready and waiting and starts then
  const soundKey = $('dcSound');
  async function setSound(want) {
    soundKey.setAttribute('aria-pressed', want);
    soundKey.title = want ? 'Turn the sound off (M)' : 'Turn the sound on (M)';
    store.set('distantCousinsSound', want);
    soundKey.classList.toggle('is-waiting', want);
    const ok = await dcSound.set(want);
    soundKey.classList.remove('is-waiting');
    if (!ok) { soundKey.setAttribute('aria-pressed', false); soundKey.title = "The music couldn't load. Try again"; }
  }
  soundKey.addEventListener('click', () => setSound(soundKey.getAttribute('aria-pressed') !== 'true'));
  board.addEventListener('keydown', e => { if (e.key === 'm' || e.key === 'M') setSound(soundKey.getAttribute('aria-pressed') !== 'true'); });
  addEventListener('pointerup', () => dcSound.wake());
  addEventListener('keydown', () => dcSound.wake());
  setSound(store.get('distantCousinsSound', true));
  // the trees window: each tree with how much is on it, open one, rename it, delete one you're not on, or
  // start a new one (the one you were on stays just as it is)
  const treesBox = $('dcTrees'), treesWin = dialog(treesBox);
  const countOf = id => { const b = store.get(boardKey(id), null); return b ? (b.found || []).length : 0; };
  const day = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  function renderTrees(say = '') {
    // (another tab may have added one)
    const fresh = store.get('distantCousinsTrees', null);
    if (fresh) for (const t of fresh.list) if (!trees.list.some(x => x.id === t.id)) trees.list.push(t);
    $('dcTreesBody').innerHTML = `
      <p class="dc-trees-say">Each tree is kept on its own, like saves in a game: start a new one and this one stays just as it is. Your achievements and favourite go with you to every tree.</p>
      <ul class="dc-trees">${trees.list.map(t => {
        const here = t.id === trees.now, n = here ? found.size : countOf(t.id);
        return `<li class="dc-tree${here ? ' is-here' : ''}" data-tree="${esc(t.id)}">
          <span class="dc-tree-words"><b class="dc-tree-name">${esc(t.name)}</b>
            <span>${here ? 'On the board now · ' : ''}${fmt(n)} ${n === 1 ? 'find' : 'finds'} · started ${day(t.made)}</span></span>
          <span class="dc-tree-keys">
            ${here ? '' : `<button class="dc-key dc-vs-key" type="button" data-open>Open</button>`}
            <button class="dc-key" type="button" data-rename>Rename</button>
            ${here ? '' : `<button class="dc-key dc-tree-bin" type="button" data-delete aria-label="Delete ${esc(t.name)}">Delete</button>`}
          </span></li>`;
      }).join('')}</ul>
      <button class="dc-key dc-vs-key dc-tree-new" type="button" data-new>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Start a new tree</span></button>
      <p class="dc-trees-note" aria-live="polite">${esc(say)}</p>`;
  }
  const storeTrees = () => store.set('distantCousinsTrees', trees);
  async function openTree(id) {
    await ready;
    if (hunt) return;
    save();
    trees.now = id;
    storeTrees();
    loaded = false;
    ready = new Promise(ok => { readyNow = ok; });
    for (const m of [found, extra, open, latin, liveKept]) m.clear();
    closePanel();
    treesWin.close();
    metBefore = null;
    draw(false);
    await loadBoard(store.get(boardKey(id), null)).catch(e => console.warn(e));
    loaded = true;
    readyNow();
    draw(false);
    if (found.size > 3) fitAll(); else home();
    dcSound.play('sparkle');
    emit('tree', { id });
  }
  $('dcTreesOpen').addEventListener('click', async () => {
    await ready;
    renderTrees();
    treesWin.show();
  });
  treesBox.addEventListener('click', e => {
    const b = e.target.closest('button');
    const li = b?.closest('[data-tree]');
    const t = li && trees.list.find(x => x.id === li.dataset.tree);
    if (!b) return;
    if (b.hasAttribute('data-new')) {
      const id = Date.now().toString(36);
      let n = trees.list.length + 1;
      while (trees.list.some(x => x.name === `Tree ${n}`)) n++;
      trees.list.push({ id, name: `Tree ${n}`, made: Date.now() });
      openTree(id).then(() => emit('tree-new'));
    } else if (b.hasAttribute('data-open') && t) openTree(t.id);
    else if (b.hasAttribute('data-delete') && t && t.id !== trees.now) {
      const n = countOf(t.id);
      if (!confirm(`Delete "${t.name}"? ${n ? `Its ${fmt(n)} ${n === 1 ? 'find' : 'finds'} will be gone for good.` : 'It has nothing on it yet.'}`)) return;
      trees.list = trees.list.filter(x => x !== t);
      storeTrees();
      try { localStorage.removeItem(boardKey(t.id)); } catch { }
      renderTrees(`"${t.name}" has been deleted.`);
      treesBox.querySelector('.dc-tree-new').focus({ preventScroll: true });
    } else if (b.hasAttribute('data-rename') && t) {
      const name = li.querySelector('.dc-tree-name');
      const field = Object.assign(document.createElement('input'), { value: t.name, maxLength: 40, className: 'dc-tree-field', ariaLabel: 'Name of the tree' });
      name.replaceWith(field);
      field.focus();
      field.select();
      // (put back in place, not the whole list drawn again: a click on another tree's key is what took the
      // focus away, and it has to land)
      let over = false;
      const done = (keep, refocus) => {
        if (over) return;
        over = true;
        const v = field.value.trim();
        if (keep && v) { t.name = v; storeTrees(); sayMet(); }
        field.replaceWith(Object.assign(document.createElement('b'), { className: 'dc-tree-name', textContent: t.name }));
        if (refocus) b.focus({ preventScroll: true });
      };
      field.addEventListener('keydown', ev => {
        // (and the enter mustn't press the rename key it hands the focus back to)
        if (ev.key === 'Enter') { ev.preventDefault(); done(true, true); }
        if (ev.key === 'Escape') { ev.preventDefault(); done(false, true); }
      });
      field.addEventListener('blur', () => done(true));
    }
  });
  // the start of the tree, near the top of the board
  function home() {
    const v = view();
    const s = innerWidth < 760 ? .8 : 1;
    fly({ x: (v.left + v.right) / 2, y: v.top + 20, s });
  }

  // ---------- for achievements.js and games.js ----------
  // a hunt plays on an empty board: yours is put away while it lasts and comes back after, with the creature
  // you were hunting added to it if you found it
  let stash = null;
  // (the saved board is on before anything can be put away: a hunt started while it was still loading would
  // put away half of it)
  let readyNow;
  let ready = new Promise(ok => { readyNow = ok; });
  function enterHunt(h) {
    if (!hunt) stash = [found, extra, open, latin, liveKept].map(m => new Map(m));
    for (const m of [found, extra, open]) m.clear();
    hunt = h;
    closePanel();
    document.body.classList.add('dc-hunting');
    draw(false);
    home();
  }
  function leaveHunt(won) {
    if (!hunt) return;
    hunt = null;
    document.body.classList.remove('dc-hunting');
    [found, extra, open, latin, liveKept].forEach((m, i) => { m.clear(); for (const [k, v] of stash[i]) m.set(k, v); });
    stash = null;
    if (won !== undefined && nodes.has(won)) found.set(won, homeOf.get(won) ?? null);
    save();
    closePanel();
    metBefore = null;
    draw(false);
    if (won !== undefined && nodes.has(won)) pick(won, { go: true }); else if (found.size > 3) fitAll(); else home();
  }
  window.dcApi = {
    ROOT, nodes, parentOf, homeOf, found, trail, kidsOf, isGroup, nameOf, latinOf, picOf, loadSlice, loadPics, fillPics,
    fmt, esc, ago, span, weight, roughly, motion, store, emit, cheer, burst, dialog, draw, els, goal, get items() { return items; },
    get hunting() { return hunt; }, enterHunt, leaveHunt, show, boxOf, pick, get selected() { return selected; }, get ready() { return ready; },
    finder, bring, silUrl, traits: TRAITS, server, me, get trees() { return trees; }, get total() { return total; }, get fav() { return fav; },
  };

  // ---------- off we go ----------

  // puts a saved board on (adding to what's there: a find made while it loads stays)
  async function loadBoard(saved) {
    if (!saved) return;
    for (const [q, name, s, parent] of saved.live || []) addLive({ q, n: name, s }, parent);
    const homes = new Set([...(saved.found || []), ...(saved.extra || [])].map(([, h]) => h).filter(h => h !== null && h !== undefined));
    // a few files at a time, so a big tree doesn't ask for hundreds at once
    const queue = [...homes];
    await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) await loadSlice(queue.shift()).catch(() => { }); }));
    // a board saved before the tree was tidied up can name groups that aren't on it any more: those stay off
    for (const [q, h] of saved.found || []) if (nodes.has(q)) found.set(q, h);
    for (const [q, h] of saved.extra || []) if (nodes.has(q)) extra.set(q, h);
    for (const [q, c] of saved.open || []) open.set(q, c);
    await Promise.all((saved.latin || []).map(q => nodes.has(q) ? askLatin(q).catch(() => { }) : null));
  }
  async function restore() {
    await loadSlice(ROOT);
    if (!store.get('distantCousinsTrees', null)) store.set('distantCousinsTrees', trees);
    await loadBoard(store.get(boardKey(trees.now), null));
    loaded = true;
    // (the hint first: on a phone the board starts under it)
    if (!store.get('distantCousinsHinted', false)) {
      if (matchMedia('(pointer: coarse)').matches) $('dcHint').textContent = 'Tap a mystery card to find out who it is, then tap it again to read all about it. Time runs down the board, from the first life to today. Drag to look around, pinch to zoom.';
      $('dcHint').hidden = false;
    }
    look();
    draw(false);
    if (found.size > 3) fitAll(); else home();
    emit('ready');
    readyNow();
    if ((fav?.q ?? null) !== store.get('distantCousinsFavSent', null)) sendFav();
  }
  restore().catch(e => { console.warn(e); $('dcMet').textContent = "The tree wouldn't load. Check you're online and try again."; });
})();
