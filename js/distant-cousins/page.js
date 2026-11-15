// distant cousins: a board you fill in yourself with the family tree of every animal. it starts with the
// first life on earth. every creature you discover puts out its branches as mystery silhouettes, and the tree
// grows as far as you take it: drag to look around, scroll to zoom, click one you've found to read about it.
// what you've found is remembered, so the tree is still there next time.
//
// the tree lives in js/distant-cousins/tree/, cut into slices of a couple of thousand animals, each file named
// after the animal at the bottom of its slice (tools/build.js makes them from wikidata, the paleobiology
// database and phylopic). a slice also lists its ancestors back to the first life, so one file is enough to put
// any animal in it on the board. the animals the build left out (about 1.8 million, known only by a latin name)
// come straight from wikidata when you ask for them. photos and their credits come from the commons api, the
// few lines about each animal from wikipedia.
(() => {
  const $ = id => document.getElementById(id);
  const TREE = 'js/distant-cousins/tree/', FIND = 'js/distant-cousins/find/';
  const ROOT = 2382443;
  const PAGE = 6;                         // branches that come out at a time
  const motion = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } },
  };

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

  // the animals the build left out, asked of wikidata: children of a node, with how many children each has
  const live = new Map();
  function liveKids(q) {
    if (!live.has(q)) {
      const sparql = `SELECT ?c ?n (COUNT(?g) AS ?k) WHERE { ?c wdt:P171 wd:Q${q} ; wdt:P225 ?n . OPTIONAL { ?g wdt:P171 ?c } } GROUP BY ?c ?n ORDER BY ?n LIMIT 5000`;
      live.set(q, fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql))
        .then(r => { if (!r.ok) throw new Error('wikidata ' + r.status); return r.json(); })
        .then(j => j.results.bindings.map(b => ({ q: +b.c.value.split('/Q').pop(), n: b.n.value, s: +b.k.value })))
        .catch(e => { live.delete(q); throw e; }));
    }
    return live.get(q);
  }

  // ---------- words ----------

  const fmt = n => n.toLocaleString('en-GB');
  const cap = s => s && s[0].toUpperCase() + s.slice(1);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const nameOf = n => n.q === ROOT ? 'The very first life' : n.l || n.n;
  const latinOf = n => n.q === ROOT ? 'LUCA' : n.l ? n.n : '';
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
  const RANKS = { species: 'A species', genus: 'A genus', family: 'A family', order: 'An order', class: 'A class', phylum: 'A phylum', kingdom: 'A kingdom', subspecies: 'A subspecies' };
  function factsOf(n) {
    if (n.q === ROOT) return 'The last universal common ancestor, LUCA for short: the single-celled life that everything alive today comes from.';
    if (n.o) return 'Life went this way too, but this tree follows the animals, so the branch stops here.';
    if (n.live) return n.s ? `Known only by its Latin name. ${fmt(n.s)} ${n.s === 1 ? 'branch grows' : 'branches grow'} from it.` : 'Known only by its Latin name: a creature most people will never hear of. You found it anyway.';
    const what = RANKS[n.r] || (n.k || n.t ? 'A group' : 'An animal');
    let s = n.s > 1 ? `${what} of ${fmt(n.s)} species` : what;
    if (n.x) s += n.z !== undefined ? `, gone since ${ago(n.z)}` : ', now extinct';
    s += '.';
    if (n.a !== undefined) s += ` ${n.s > 1 ? 'Its first fossils are' : 'The first fossils are'} from ${ago(n.a)}.`;
    return s;
  }

  // ---------- pictures and words from wikimedia, silhouettes from phylopic ----------

  const plain = html => { const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent.trim(); };
  const pics = new Map();      // commons file -> promise of { src, page, by, licence }
  const picReady = new Map();  // the same once it's here
  function loadPics(files) {
    const need = [...new Set(files.filter(f => f && !pics.has(f)))];
    for (let i = 0; i < need.length; i += 50) {
      const group = need.slice(i, i + 50);
      const ask = fetch('https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url|extmetadata&iiextmetadatafilter=Artist|LicenseShortName&iiurlwidth=500&titles='
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
  // its own silhouette, or the nearest ancestor's: a lion with none of its own shows a cat
  const silOf = q => { for (let x = q; x !== undefined; x = parentOf.get(x)) { const n = nodes.get(x); if (n?.si) return n.si; } return null; };
  const silUrl = id => `https://images.phylopic.org/images/${id}/thumbnail/192x192.png`;
  // a plain picture, not a css mask: masks need the file sent with cors, and phylopic's cache sometimes forgets
  const silImg = id => `<img class="dc-sil-img" src="${silUrl(id)}" alt="" loading="lazy" draggable="false">`;

  // ---------- what's on the board, remembered between visits ----------

  const found = new Map();     // discovered: qid -> its slice
  const extra = new Map();     // on the board but not discovered yet (missing links you uncovered): qid -> slice
  const open = new Map();      // qid -> how many of its branches are out
  const latin = new Map();     // qid -> the latin-only children wikidata gave it
  const liveKept = new Map();  // latin-only creatures on the board: qid -> [qid, name, branches, parent]
  let fav = store.get('distantCousinsFav', null);
  let total = 553291;

  function save() {
    const keep = [...liveKept.values()].filter(([q]) => found.has(q) || extra.has(q));
    store.set('distantCousinsBoard', { found: [...found], extra: [...extra], open: [...open], latin: [...latin.keys()], live: keep });
  }
  function addLive(c, parent) {
    if (!nodes.has(c.q)) nodes.set(c.q, { q: c.q, n: c.n, s: c.s, live: 1 });
    if (!parentOf.has(c.q)) parentOf.set(c.q, parent);
    liveKept.set(c.q, [c.q, c.n, c.s, parent]);
  }
  async function askLatin(q) {
    if (latin.has(q)) return;
    const n = nodes.get(q);
    const list = await liveKids(q);
    const core = new Set(n.k || []);
    const qs = [];
    for (const c of list) if (!core.has(c.q)) { addLive(c, q); qs.push(c.q); }
    latin.set(q, qs);
  }
  const kidsOf = n => (n.k || []).concat(latin.get(n.q) || []);

  // ---------- the layout ----------
  // top down like a family tree on paper: the first life at the top, each generation a row below. every node on the board hangs from its nearest ancestor that's also on the board; when some are skipped
  // (you searched for something deep in the tree) the line is dotted, with how many are missing on it

  const WIDTH = { found: 168, unfound: 132, more: 116, latin: 132 };
  const GAP = 22, ROW = 92;

  function plan() {
    const vis = new Set([ROOT]);
    for (const q of found.keys()) if (nodes.has(q)) vis.add(q);
    for (const q of extra.keys()) if (nodes.has(q)) vis.add(q);
    for (const q of [ROOT, ...found.keys()]) {
      const n = nodes.get(q);
      if (!n) continue;
      const ks = kidsOf(n), want = open.get(q) ?? PAGE;
      for (let i = 0; i < ks.length && i < want; i++) if (nodes.has(ks[i])) vis.add(ks[i]);
    }
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

  function card(it) {
    const n = nodes.get(it.q);
    if (it.kind === 'more') return `<span class="dc-more-n">+${fmt(it.count)}</span><span>more ${it.count === 1 ? 'branch' : 'branches'}</span>`;
    if (it.kind === 'latin') return `<span class="dc-more-n">+${fmt(it.count)}</span><span>known only by Latin names</span>`;
    const latinName = latinOf(n);
    if (it.kind === 'unfound') {
      const sil = n.q === ROOT ? null : silOf(it.q);
      return `<span class="dc-sil${sil ? '' : ' is-blank'}">${sil ? silImg(sil) : '?'}</span><span class="dc-node-name${n.l || n.q === ROOT ? '' : ' is-latin'}">${esc(nameOf(n))}</span>`;
    }
    const star = fav && fav.q === it.q ? '<svg class="dc-node-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/></svg>' : '';
    const sil = n.q !== ROOT && silOf(it.q);
    const pic = picOf(n) ? '<span class="dc-node-pic"><img alt="" draggable="false"></span>' : `<span class="dc-node-pic is-blank">${sil ? silImg(sil) : ''}</span>`;
    return `${star}${pic}<span class="dc-node-name${n.l || n.q === ROOT ? '' : ' is-latin'}">${esc(nameOf(n))}</span>${latinName ? `<span class="dc-node-sci">${esc(latinName)}</span>` : ''}`;
  }

  function label(it) {
    const n = nodes.get(it.q);
    if (it.kind === 'more') return `Show ${it.count} more branches of ${nameOf(n)}`;
    if (it.kind === 'latin') return `Ask Wikidata for ${it.count} more known only by Latin names`;
    if (it.kind === 'unfound') return `Discover ${nameOf(n)}`;
    return `${nameOf(n)}${latinOf(n) ? ', ' + latinOf(n) : ''}. Show details`;
  }

  function draw(born) {
    items = plan();
    // the elements: new ones, changed ones, gone ones
    for (const [id, el] of els) if (!items.has(id)) { el.remove(); els.delete(id); at.delete(id); }
    for (const it of items.values()) {
      const n = nodes.get(it.q);
      const sig = [it.kind, it.count, fav?.q === it.q, it.kind === 'unfound' && silOf(it.q)].join('|');
      let el = els.get(it.id);
      if (!el) {
        el = document.createElement('button');
        el.type = 'button';
        el.dataset.id = it.id;
        layer.append(el);
        els.set(it.id, el);
        if (born !== false) el.classList.add('is-born');
      }
      if (el.dataset.sig !== sig) {
        el.dataset.sig = sig;
        el.innerHTML = card(it);
        if (it.kind === 'found') el.dataset.pic = picOf(n) || '';
      }
      el.className = `dc-node is-${it.kind}${n?.x ? ' is-extinct' : ''}${n?.o ? ' is-other' : ''}${selected === it.q && it.kind === 'found' ? ' is-picked' : ''}${el.classList.contains('is-born') ? ' is-born' : ''}`;
      el.style.width = WIDTH[it.kind] + 'px';
      el.setAttribute('aria-label', label(it));
    }
    // sizes, then places: each node over the middle of its children, rows as tall as their tallest card
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
    const rowH = [];
    const depthOf = new Map();
    const walk = (it, d) => { depthOf.set(it.id, d); rowH[d] = Math.max(rowH[d] || 0, tall.get(it.id) || 0); for (const k of it.kids) walk(k, d + 1); };
    walk(root, 0);
    const rowY = [0];
    for (let d = 1; d < rowH.length; d++) rowY[d] = rowY[d - 1] + rowH[d - 1] + ROW;
    const place = (it, x) => {
      goal.set(it.id, { x, y: rowY[depthOf.get(it.id)] });
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
      else for (const el of els.values()) el.classList.remove('is-born');
    };
    tweenFrame = requestAnimationFrame(step);
  }

  // cards to their places, then the lines between them: down from the parent, along, and down into the child.
  // thicker the more species a branch holds; dotted where ancestors are missing
  function paint() {
    for (const [id, el] of els) {
      const p = at.get(id);
      if (p) el.style.transform = `translate(${p.x - WIDTH[items.get(id).kind] / 2}px, ${p.y}px)`;
    }
    let solid = '', faint = '', dotted = '', labels = '';
    for (const it of items.values()) {
      if (it.parent === undefined) continue;
      const a = at.get(it.parent), b = at.get(it.id);
      if (!a || !b) continue;
      const x1 = a.x, y1 = a.y + (tall.get(it.parent) || 0), x2 = b.x, y2 = b.y;
      const mid = y2 - ROW / 2, r = Math.min(14, Math.abs(x2 - x1) / 2, (y2 - y1) / 4);
      const dir = Math.sign(x2 - x1);
      const d = Math.abs(x2 - x1) < 1 ? `M${x1} ${y1}V${y2}` : `M${x1} ${y1}V${mid - r}Q${x1} ${mid} ${x1 + dir * r} ${mid}H${x2 - dir * r}Q${x2} ${mid} ${x2} ${mid + r}V${y2}`;
      const n = nodes.get(it.q);
      const w = it.kind === 'more' || it.kind === 'latin' ? 2.5 : Math.min(10, 2.5 + 1.6 * Math.log10((n?.s || 1) + 1));
      const path = `<path d="${d}" stroke-width="${w.toFixed(1)}"/>`;
      if (it.via?.length) {
        dotted += path;
        labels += `<span class="dc-gap" style="left:${x2}px;top:${mid + (y2 - mid) / 2}px" data-gap="${it.id}">${it.via.length} more</span>`;
      } else if (it.kind === 'found') solid += path;
      else faint += path;
    }
    edges.innerHTML = `<g class="dc-edge-faint">${faint}</g><g class="dc-edge-dotted">${dotted}</g><g class="dc-edge-solid">${solid}</g>`;
    gapLayer.innerHTML = labels;
  }
  const gapLayer = document.createElement('div');
  gapLayer.className = 'dc-gaps';
  world.append(gapLayer);

  function loadCardPics() {
    const want = [];
    for (const [id, el] of els) if (el.dataset.pic && !el.querySelector('img')?.src) want.push([el, el.dataset.pic]);
    loadPics(want.map(w => w[1])).then(ps => ps.forEach((p, i) => {
      const img = want[i][0].querySelector('img');
      if (!img) return;
      if (p) { img.src = p.src; img.closest('.dc-node')?.setAttribute('title', [p.by && `Photo: ${p.by.slice(0, 80)}`, p.licence].filter(Boolean).join(', ')); }
      else img.parentElement.classList.add('is-blank', 'is-none');
    }));
  }

  // ---------- looking around: drag, scroll, pinch ----------

  const cam = { x: 0, y: 0, s: 1 };
  function look() {
    world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})`;
    // the fossils in the sand move with the board, so you can feel it moving even far from any card
    board.style.setProperty('--tx', cam.x + 'px');
    board.style.setProperty('--ty', cam.y + 'px');
    board.style.setProperty('--ts', 320 * cam.s + 'px');
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
    const panelOpen = !$('dcPanel').hidden && innerWidth > 760;
    return { left: 24, top: innerWidth > 760 ? 110 : 150, right: r.width - (panelOpen ? 448 : 24), bottom: r.height - 84, w: r.width, h: r.height };
  }
  // a box of the board (world units) into view: left alone if it's already there, slid in if it fits, else zoomed out to fit
  function show(box, opts = {}) {
    const v = view();
    let s = opts.s ?? cam.s;
    const fits = (box.r - box.l) * s <= v.right - v.left && (box.b - box.t) * s <= v.bottom - v.top;
    if (!fits) s = clampS(Math.min((v.right - v.left) / (box.r - box.l), (v.bottom - v.top) / (box.b - box.t)) * .95);
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
    else if (it.kind === 'found') pick(it.q);
    else if (it.kind === 'more') { open.set(it.q, (open.get(it.q) ?? PAGE) + PAGE * 2); save(); draw(); afterGrow(it.q); }
    else if (it.kind === 'latin') latinFor(it.q, el);
  });
  gapLayer.addEventListener('click', e => {
    const g = e.target.closest('[data-gap]');
    if (!g || dragged) return;
    // uncover the next few missing ancestors, from the top: they go on the board as mysteries to discover.
    // a few at a time, or a lion found from the start would hang off a column of seventy
    const it = items.get(isNaN(g.dataset.gap) ? g.dataset.gap : +g.dataset.gap);
    const dug = (it?.via || []).slice(0, 4);
    for (const q of dug) extra.set(q, homeOf.get(q));
    save();
    draw();
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
    afterGrow(q);
  }
  // bring the new branches into view
  function afterGrow(q) {
    const it = items.get(q);
    if (!it) return;
    show(boxOf([q, ...it.kids.map(k => k.id)]));
  }
  async function latinFor(q, el) {
    el.classList.add('is-busy');
    el.querySelector('span:last-child').textContent = 'asking Wikidata...';
    try { await askLatin(q); } catch { el.classList.remove('is-busy'); el.querySelector('span:last-child').textContent = "Wikidata didn't answer. Try again"; return; }
    open.set(q, (open.get(q) ?? PAGE) + PAGE);
    save();
    draw();
    afterGrow(q);
  }

  // put a creature on the board from anywhere (search, famous members, surprise, your favourite) and go to it
  async function bring(q, home) {
    try { await loadSlice(home ?? homeOf.get(q)); } catch (e) { console.warn(e); return; }
    if (!nodes.has(q)) return;
    if (!found.has(q) && q !== ROOT) { found.set(q, homeOf.get(q) ?? null); save(); }
    $('dcHint').hidden = true;
    store.set('distantCousinsHinted', true);
    draw();
    pick(q, { go: true });
  }

  // ---------- the panel: everything about one creature ----------

  const panel = $('dcPanel');
  let current = null;
  function pick(q, opts = {}) {
    const n = nodes.get(q);
    if (!n) return;
    selected = q;
    current = n;
    for (const [id, el] of els) el.classList.toggle('is-picked', id === q && items.get(id)?.kind === 'found');
    const wasHidden = panel.hidden;
    panel.hidden = false;
    renderHere(n, trail(q));
    panel.scrollTop = 0;
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
    board.focus({ preventScroll: true });
  }
  $('dcClose').addEventListener('click', closePanel);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden && document.activeElement !== input) closePanel(); });

  function renderHere(n, path) {
    panel.classList.toggle('is-extinct', !!n.x);
    const tags = [];
    if (n.q === ROOT) tags.push(['About 4.2 billion years ago', 'old']);
    else if (n.x) tags.push(['Extinct', 'gone']);
    else if (!n.o && !n.live) tags.push([n.s > 1 ? 'Still around' : 'Alive today', 'alive']);
    if (n.r) tags.push([cap(n.r), '']);
    $('dcTags').replaceChildren(...tags.map(([t, c]) => Object.assign(document.createElement('span'), { className: 'dc-tag' + (c ? ' dc-tag-' + c : ''), textContent: t })));
    $('dcName').textContent = nameOf(n);
    $('dcName').classList.toggle('is-latin', !n.l && n.q !== ROOT);
    $('dcSci').textContent = n.q === ROOT ? 'LUCA, the last universal common ancestor' : latinOf(n);
    $('dcSci').hidden = !$('dcSci').textContent;
    const kids = kidsOf(n), out = kids.filter(k => found.has(k)).length;
    let facts = factsOf(n);
    const all = kids.length + (latin.has(n.q) || n.live ? 0 : n.t || 0);
    if (all) facts += ` You've discovered ${fmt(out)} of its ${fmt(all)} ${all === 1 ? 'branch' : 'branches'}.`;
    $('dcFacts').textContent = facts;

    // the picture, whole: never cropped
    const img = $('dcHereImg'), credit = $('dcHereCredit'), file = picOf(n), box = $('dcHerePic');
    box.hidden = !file;
    credit.textContent = '';
    const ready = picReady.get(file);
    if (ready) img.src = ready.src; else img.removeAttribute('src');
    if (file) loadPics([file]).then(([p]) => {
      if (current !== n) return;
      if (!p) { box.hidden = true; return; }
      if (img.src !== p.src) img.src = p.src;
      img.alt = n.p ? `${n.p}, one of the ${nameOf(n).toLowerCase()}` : nameOf(n);
      const by = [n.p && n.q !== ROOT ? `Pictured: ${n.p}.` : '', p.by && `Photo: ${p.by.slice(0, 80)}`, p.licence].filter(Boolean).join(' ');
      credit.replaceChildren(Object.assign(document.createElement('a'), { href: p.page, target: '_blank', rel: 'noopener', textContent: by || 'About this picture' }));
    });

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

    // famous members: straight onto the board
    const stars = $('dcStars');
    stars.hidden = !n.m;
    if (n.m) {
      stars.replaceChildren(Object.assign(document.createElement('span'), { className: 'dc-stars-label', textContent: 'Famous members' }),
        ...n.m.map(([q, home, name]) => {
          const b = Object.assign(document.createElement('button'), { type: 'button', className: 'dc-chip' + (found.has(q) ? ' is-met' : ''), textContent: name });
          b.addEventListener('click', () => bring(q, home));
          return b;
        }));
    }

    const isFav = fav && fav.q === n.q;
    $('dcStar').setAttribute('aria-pressed', isFav);
    $('dcStarText').textContent = isFav ? 'Your favourite' : 'Make favourite';
    renderTime(n);
    renderCompare(n, path);
  }

  // ---------- when they lived: a strip of deep time ----------

  const ERAS = [[4600, 538.8, 'Precambrian'], [538.8, 251.9, 'Paleozoic'], [251.9, 66, 'Mesozoic'], [66, 0, 'Cenozoic']];
  const PERIODS = [[66, 23.03, 'Paleogene'], [23.03, 2.58, 'Neogene'], [2.58, 0, 'Quaternary']];
  const rangeOf = n => n && n.a !== undefined ? [n.a, n.x ? n.z : 0] : n && !n.x && !n.o && n.q !== ROOT && !n.live ? [undefined, 0] : null;
  function renderTime(n) {
    const box = $('dcTime');
    const rows = [[n, rangeOf(n), 'here']];
    if (fav && fav.q !== n.q) rows.push([fav, rangeOf(fav), 'fav']);
    const known = rows.filter(r => r[1] && r[1][0] !== undefined);
    if (!known.length) { box.hidden = true; return; }
    box.hidden = false;
    const oldest = Math.max(...known.map(r => r[1][0]));
    const top = oldest > 66 ? Math.min(4600, oldest * 1.12) : Math.max(oldest * 1.25, 0.05);
    const x = ma => (1 - ma / top) * 100;
    const bands = (top > 66 ? ERAS : PERIODS).filter(([, b]) => b < top);
    let html = '<p class="dc-time-head">When they lived</p><div class="dc-time-strip">';
    for (const [a, b, name] of bands) {
      const l = x(Math.min(a, top)), w = x(b) - l;
      html += `<span class="dc-era" style="left:${l}%;width:${w}%"><span>${w > 16 ? name : ''}</span></span>`;
    }
    html += '</div>';
    for (const [who, r, cls] of rows) {
      if (!r) continue;
      const start = r[0] === undefined ? 0 : x(r[0]), end = r[1] === undefined ? start : x(r[1]);
      const name = cls === 'fav' ? fav.name : nameOf(who);
      html += `<div class="dc-time-row dc-time-${cls}"><span class="dc-time-bar${r[0] === undefined ? ' is-now' : ''}" style="left:${start}%;width:${Math.max(end - start, 0.6)}%"></span><span class="dc-time-who">${esc(name)}</span></div>`;
    }
    html += `<div class="dc-time-ends"><span>${ago(top)}</span><span>Now</span></div>`;
    box.innerHTML = html;
  }

  // ---------- your favourite next to this one ----------

  const pickOf = n => ({ name: nameOf(n), a: n.a, h: homeOf.get(n.q) });
  function renderCompare(n, path) {
    const box = $('dcCompare');
    if (!fav || fav.q === n.q) { box.hidden = true; return; }
    const A = fav.path, B = path.map(q => ({ q, ...pickOf(nodes.get(q)) }));
    let i = 0;
    while (i < A.length && i < B.length && A[i].q === B[i].q) i++;
    const meet = B[i - 1];
    const lines = [];
    const favName = fav.name, hereName = nameOf(n);
    if (i === B.length) lines.push(`Your ${esc(favName)} is somewhere inside this branch, ${A.length - i} ${A.length - i === 1 ? 'step' : 'steps'} further down.`);
    else if (i === A.length) lines.push(`This is inside your ${esc(favName)}'s branch, ${B.length - i} ${B.length - i === 1 ? 'step' : 'steps'} further down.`);
    else {
      const steps = (A.length - i) + (B.length - i);
      lines.push(`Cousins ${steps} branches apart. Their family lines meet at <button class="dc-link" type="button" data-q="${meet.q}" data-h="${meet.h ?? ''}">${esc(meet.name)}</button>.`);
      const split = Math.max(A[i].a ?? -1, B[i].a ?? -1);
      if (split > 0) lines.push(`They went their separate ways at least ${ago(split)}.`);
    }
    const ra = rangeOf(fav), rb = rangeOf(n);
    if (ra && rb && ra[0] !== undefined && rb[0] !== undefined) {
      const diff = Math.abs(ra[0] - rb[0]);
      if (diff < Math.max(ra[0], rb[0]) * .03) lines.push('They first show up in the fossils at about the same time.');
      else {
        const [older, younger] = ra[0] > rb[0] ? [favName, hereName] : [hereName, favName];
        lines.push(`${esc(cap(older))} came first, ${span(diff)} before ${esc(younger)}.`);
      }
    }
    if (ra && rb && ra[1] !== undefined && rb[1] !== undefined) {
      if (ra[1] === 0 && rb[1] === 0) lines.push('Both are still alive today, sharing the planet.');
      else if (ra[0] !== undefined && rb[0] !== undefined) {
        const overlap = Math.min(ra[0], rb[0]) - Math.max(ra[1], rb[1]);
        if (overlap > 0) lines.push(`They were alive at the same time, for about ${span(overlap)}.`);
        else lines.push(`They never met: ${span(-overlap)} apart.`);
      }
    }
    box.onclick = e => { const b = e.target.closest('.dc-link'); if (b) bring(+b.dataset.q, b.dataset.h ? +b.dataset.h : undefined); };
    box.innerHTML = `<p class="dc-compare-head"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/></svg>Next to your ${esc(favName)}</p><ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul>`;
    box.hidden = false;
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
    else fav = { q: n.q, h: homeOf.get(n.q), name: nameOf(n), i: picOf(n), a: n.a, z: n.z, x: n.x, o: n.o, path: trail(n.q).map(q => ({ q, ...pickOf(nodes.get(q)) })) };
    store.set('distantCousinsFav', fav);
    renderHere(n, trail(n.q));
    draw(false);
  });
  $('dcFavGo').addEventListener('click', () => {
    if (!fav) return;
    if (found.has(fav.q) || nodes.has(fav.q) && !fav.h) return pick(fav.q, { go: true });
    // one found on wikidata only and not on the board any more: its nearest ancestor that's in the tree
    const at = [...fav.path].reverse().find(s => s.h !== undefined && s.h !== null);
    bring(at && at.q !== fav.q ? at.q : fav.q, at?.h);
  });

  // ---------- the search box ----------

  const input = $('dcFind'), foundList = $('dcFound');
  const tidy = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const findFiles = new Map();
  let split = null, chosen = -1, results = [];
  const findFile = key => {
    if (!findFiles.has(key)) findFiles.set(key, fetch(FIND + key.replace(/^(aux|con|nul|prn)$/, '$1_') + '.json').then(r => r.ok ? r.json() : []).catch(() => { findFiles.delete(key); return []; }));
    return findFiles.get(key);
  };
  async function search() {
    const words = tidy(input.value).split(' ').filter(Boolean);
    const said = input.value;
    // names are filed under every word, so the longest word picks the file ("t rex" looks under "re")
    const key = words.reduce((a, b) => b.length > a.length ? b : a, '');
    if (key.length < 2) return list([]);
    split ??= await fetch(FIND + 'split.json').then(r => r.json()).then(a => new Set(a)).catch(() => new Set());
    const two = key.slice(0, 2);
    if (split.has(two) && key.length < 3) return list([], 'Keep typing...');
    const entries = await findFile(split.has(two) ? key.slice(0, 3) : two);
    if (input.value !== said) return;
    const whole = words.join(' ');
    const hits = [];
    for (const e of entries) {
      let best = 0, term = '';
      for (let t = 3; t < e.length; t++) {
        const p = tidy(e[t]), ws = p.split(' ');
        if (!words.every(w => ws.some(x => x.startsWith(w)))) continue;
        const score = p === whole ? 3 : p.startsWith(whole) ? 2 : 1;
        if (score > best) { best = score; term = e[t]; }
      }
      if (best) hits.push({ e, best, term });
      if (hits.length > 400) break;
    }
    hits.sort((a, b) => b.best - a.best || b.e[2] - a.e[2]);
    list(hits.slice(0, 8), hits.length ? '' : 'Nothing by that name. Try another, or its Latin name');
  }
  function list(hits, note = '') {
    results = hits;
    chosen = -1;
    foundList.replaceChildren(...hits.map(({ e, term }, i) => {
      const li = document.createElement('li');
      li.id = 'dcFound' + i;
      li.setAttribute('role', 'option');
      const main = term === e[3] && e[4] ? cap(e[4]) : cap(term);
      const sub = term === e[3] ? e[4] ? e[3] : '' : e[3];
      li.innerHTML = `<span>${esc(main)}</span>${sub && tidy(sub) !== tidy(main) ? `<i>${esc(sub)}</i>` : ''}${found.has(e[0]) ? '<em>found</em>' : ''}`;
      li.addEventListener('mousedown', ev => { ev.preventDefault(); choose(i); });
      return li;
    }));
    if (note) foundList.append(Object.assign(document.createElement('li'), { className: 'dc-found-note', textContent: note }));
    const isOpen = !!(hits.length || note);
    foundList.hidden = !isOpen;
    input.setAttribute('aria-expanded', isOpen);
    input.removeAttribute('aria-activedescendant');
  }
  function choose(i) {
    const r = results[i];
    if (!r) return;
    input.value = '';
    list([]);
    input.blur();
    bring(r.e[0], r.e[1]);
  }
  let typing;
  input.addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(search, 120); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!results.length) return;
      e.preventDefault();
      chosen = (chosen + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      [...foundList.children].forEach((li, i) => li.setAttribute('aria-selected', i === chosen));
      input.setAttribute('aria-activedescendant', 'dcFound' + chosen);
    } else if (e.key === 'Enter') { e.preventDefault(); choose(chosen < 0 ? 0 : chosen); }
    else if (e.key === 'Escape') list([]);
  });
  input.addEventListener('blur', () => setTimeout(() => list([]), 100));

  // ---------- surprise me, light and dark, start again ----------

  const sayMet = () => { $('dcMet').textContent = `${fmt(found.size + 1)} of ${fmt(total)} creatures discovered`; };
  let index = null;
  const loadIndex = () => index ??= fetch(TREE + 'index.json').then(r => r.json());
  loadIndex().then(i => { total = i.count; sayMet(); }).catch(() => { });
  $('dcSurprise').addEventListener('click', async () => {
    const { slices: all } = await loadIndex();
    // most slices are beetles and moths, so the first few goes only take somebody with a common name
    for (let tries = 0; tries < 8; tries++) {
      const s = all[Math.floor(Math.random() * all.length)];
      await loadSlice(s);
      const pool = [...nodes.values()].filter(n => homeOf.get(n.q) === s && n.i && (tries < 5 ? n.l : n.l || n.w) && !n.p);
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
  });
  sayTheme();
  $('dcAgain').addEventListener('click', () => {
    if (!confirm('Start the tree again from the very first life? Everything you\'ve discovered will be put away (your favourite stays).')) return;
    found.clear(); extra.clear(); open.clear(); latin.clear(); liveKept.clear();
    save();
    closePanel();
    draw();
    home();
  });
  // the start of the tree, near the top of the board
  function home() {
    const v = view();
    const s = innerWidth < 760 ? .8 : 1;
    fly({ x: (v.left + v.right) / 2, y: v.top + 20, s });
  }

  // ---------- off we go ----------

  async function restore() {
    const saved = store.get('distantCousinsBoard', null);
    await loadSlice(ROOT);
    if (saved) {
      for (const [q, name, s, parent] of saved.live || []) addLive({ q, n: name, s }, parent);
      const homes = new Set([...(saved.found || []), ...(saved.extra || [])].map(([, h]) => h).filter(h => h !== null && h !== undefined));
      // a few files at a time, so a big tree doesn't ask for hundreds at once
      const queue = [...homes];
      await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) await loadSlice(queue.shift()).catch(() => { }); }));
      for (const [q, h] of saved.found || []) found.set(q, h);
      for (const [q, h] of saved.extra || []) extra.set(q, h);
      for (const [q, c] of saved.open || []) open.set(q, c);
      await Promise.all((saved.latin || []).map(q => nodes.has(q) ? askLatin(q).catch(() => { }) : null));
    }
    look();
    draw(false);
    if (found.size > 3) fitAll(); else home();
    if (!store.get('distantCousinsHinted', false)) {
      if (matchMedia('(pointer: coarse)').matches) $('dcHint').textContent = 'Tap a mystery creature to discover it, then tap it again to learn about it. Drag to look around, pinch to zoom.';
      $('dcHint').hidden = false;
    }
  }
  restore().catch(e => { console.warn(e); $('dcMet').textContent = "The tree wouldn't load. Check you're online and try again."; });
})();
