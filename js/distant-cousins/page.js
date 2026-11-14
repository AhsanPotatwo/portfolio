// distant cousins: the family tree of every animal, from the first life on earth up, one branch at a time.
//
// the tree lives in js/distant-cousins/tree/, cut into slices of a couple of thousand animals, each file named
// after the animal at the bottom of its slice (tools/build.js makes them from wikidata and the paleobiology
// database). a slice also lists its ancestors back to the first life, so one file is enough to show any animal
// in it with its whole trunk. the animals the build left out (about 1.8 million, known only by a latin name)
// come straight from wikidata when you open their branch. photos and their credits come from the commons api,
// the few lines about each animal from wikipedia.
(() => {
  const $ = id => document.getElementById(id);
  const TREE = 'js/distant-cousins/tree/', FIND = 'js/distant-cousins/find/';
  const ROOT = 2382443;
  const SHOWN = 12;                       // branches shown before "show all"
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
        .then(j => j.results.bindings.map(b => ({ q: +b.c.value.split('/Q').pop(), n: b.n.value, s: +b.k.value, live: 1 })))
        .catch(e => { live.delete(q); throw e; }));
    }
    return live.get(q);
  }

  // ---------- words ----------

  const fmt = n => n.toLocaleString('en-GB');
  const cap = s => s && s[0].toUpperCase() + s.slice(1);
  const nameOf = n => n.q === ROOT ? 'The very first life' : n.l || n.n;
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
    if (n.live) return n.s ? `Known only by its Latin name. ${fmt(n.s)} ${n.s === 1 ? 'branch grows' : 'branches grow'} from it.` : 'Known only by its Latin name: a species most people will never hear of. You found it anyway.';
    const what = RANKS[n.r] || (n.k || n.t ? 'A group' : 'An animal');
    let s = n.s > 1 ? `${what} of ${fmt(n.s)} species` : what;
    if (n.x) s += n.z !== undefined ? `, gone since ${ago(n.z)}` : ', now extinct';
    s += '.';
    if (n.a !== undefined) s += ` ${n.s > 1 ? 'Its first fossils are' : 'The first fossils are'} from ${ago(n.a)}.`;
    return s;
  }

  // ---------- pictures and words from wikimedia ----------

  const plain = html => { const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent.trim(); };
  const pics = new Map();      // commons file -> promise of { src, page, by, licence }
  const picReady = new Map();  // the same once it's here, so a picture already seen goes in straight away
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

  // ---------- what you've met, and your favourite ----------

  const met = new Set(store.get('distantCousinsMet', []));
  let total = 553291;
  let fav = store.get('distantCousinsFav', null);
  const sayMet = () => { $('dcMet').textContent = `You've met ${fmt(met.size)} of ${fmt(total)}`; };

  // ---------- going somewhere ----------

  const canopy = $('dcCanopy'), kidsList = $('dcKids'), branches = $('dcBranches');
  const here = $('dcHere');
  let current = null, showAll = false, goToken = 0;
  const motion = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;

  async function go(q, home, how = {}) {
    const token = ++goToken;
    try {
      if (!nodes.has(q) || nodes.get(q).thin || home !== undefined && !slices.has(home)) await loadSlice(home ?? homeOf.get(q) ?? q);
      const h = homeOf.get(q);
      if (h !== undefined) await loadSlice(h);
    } catch (e) {
      console.warn(e);
      if (token === goToken) $('dcFacts').textContent = "That branch wouldn't load. Check you're online and try again.";
      return;
    }
    if (token !== goToken) return;
    const n = nodes.get(q);
    if (!n) return;
    const from = how.from;
    showAll = false;
    const draw = () => { current = n; render(n); };
    // the card you clicked grows into the big one. only one thing can have the name at a time, so it moves
    // from the card's picture to the big picture as the page changes
    const herePic = $('dcHerePic');
    if (from && document.startViewTransition && motion()) {
      from.style.viewTransitionName = 'dc-grow';
      const t = document.startViewTransition(() => { from.style.viewTransitionName = ''; herePic.style.viewTransitionName = 'dc-grow'; draw(); });
      t.finished.finally(() => { herePic.style.viewTransitionName = ''; });
    } else draw();
    if (!how.quiet) {
      const hash = '#' + q + (homeOf.has(q) ? '-' + homeOf.get(q) : '');
      if (location.hash !== hash) history[how.replace ? 'replaceState' : 'pushState'](null, '', hash);
    }
    if (!met.has(q)) { met.add(q); store.set('distantCousinsMet', [...met]); here.classList.add('is-new'); } else here.classList.remove('is-new');
    sayMet();
    if (how.scroll !== false) requestAnimationFrame(() => {
      const top = here.getBoundingClientRect().top + scrollY - innerHeight * .42;
      if (Math.abs(top - scrollY) > 40) scrollTo({ top: Math.max(0, top), behavior: motion() ? 'smooth' : 'auto' });
    });
  }

  function render(n) {
    const path = trail(n.q);
    renderHere(n, path);
    renderKids(n);
    renderTail(n);
    renderTrunk(path);
    renderFav();
  }

  // ---------- the animal you're on ----------

  function renderHere(n, path) {
    here.classList.toggle('is-extinct', !!n.x);
    here.classList.toggle('is-other', !!n.o);
    const tags = [];
    if (n.q === ROOT) tags.push(['About 4.2 billion years ago', 'old']);
    else if (n.x) tags.push(['Extinct', 'gone']);
    else if (!n.o && !n.live) tags.push([n.s > 1 ? 'Still around' : 'Alive today', 'alive']);
    if (n.r) tags.push([cap(n.r), '']);
    $('dcTags').replaceChildren(...tags.map(([t, c]) => Object.assign(document.createElement('span'), { className: 'dc-tag' + (c ? ' dc-tag-' + c : ''), textContent: t })), Object.assign(document.createElement('span'), { className: 'dc-tag dc-tag-new', textContent: 'New!' }));
    $('dcName').textContent = nameOf(n);
    $('dcSci').textContent = n.q === ROOT ? 'Biota, all life' : n.l ? n.n : '';
    $('dcSci').hidden = !$('dcSci').textContent;
    $('dcFacts').textContent = factsOf(n);

    // the picture: its own, or the best known animal inside it
    const img = $('dcHereImg'), credit = $('dcHereCredit'), file = picOf(n);
    $('dcHerePic').hidden = !file;
    credit.textContent = '';
    const ready = picReady.get(file);
    if (ready) img.src = ready.src; else img.removeAttribute('src');
    if (file) loadPics([file]).then(([p]) => {
      if (current !== n) return;
      if (!p) { $('dcHerePic').hidden = true; return; }
      if (img.src !== p.src) img.src = p.src;
      img.alt = n.p ? `${n.p}, one of the ${nameOf(n).toLowerCase()}` : nameOf(n);
      const by = [n.p && n.q !== ROOT ? `Pictured: ${n.p}.` : '', p.by && `Photo: ${p.by.slice(0, 80)}`, p.licence].filter(Boolean).join(' ');
      const a = Object.assign(document.createElement('a'), { href: p.page, target: '_blank', rel: 'noopener', textContent: by || 'About this picture' });
      credit.replaceChildren(a);
    });

    // a few lines from wikipedia
    const read = $('dcRead'), wiki = $('dcWiki'), title = wikiTitle(n);
    read.textContent = ''; wiki.hidden = true;
    if (title) loadRead(title).then(r => {
      if (current !== n || !r) return;
      const cut = r.text.length > 420 ? r.text.slice(0, r.text.lastIndexOf('. ', 420) + 1 || 420) : r.text;
      read.textContent = cut;
      wiki.href = r.url || 'https://en.wikipedia.org/wiki/' + encodeURIComponent(title);
      wiki.hidden = false;
    });

    // famous members, to skip the long climb
    const stars = $('dcStars');
    stars.hidden = !n.m;
    if (n.m) {
      stars.replaceChildren(Object.assign(document.createElement('span'), { className: 'dc-stars-label', textContent: 'Famous members' }),
        ...n.m.map(([q, home, name]) => {
          const b = Object.assign(document.createElement('button'), { type: 'button', className: 'dc-chip', textContent: name });
          b.addEventListener('click', () => go(q, home));
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
  const rangeOf = n => n && n.a !== undefined ? [n.a, n.x ? n.z : 0] : n && !n.x && !n.o && n.q !== ROOT ? [undefined, 0] : null;
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
    const bands = (top > 66 ? ERAS : PERIODS).filter(([a, b]) => b < top);
    let html = '<div class="dc-time-strip">';
    for (const [a, b, label] of bands) {
      const l = x(Math.min(a, top)), w = x(b) - l;
      html += `<span class="dc-era" style="left:${l}%;width:${w}%"><span>${w > 12 ? label : ''}</span></span>`;
    }
    html += '</div>';
    for (const [who, r, cls] of rows) {
      if (!r) continue;
      const start = r[0] === undefined ? 0 : x(r[0]), end = r[1] === undefined ? start : x(r[1]);
      const label = cls === 'fav' ? fav.name : nameOf(who);
      html += `<div class="dc-time-row dc-time-${cls}"><span class="dc-time-bar${r[0] === undefined ? ' is-now' : ''}" style="left:${start}%;width:${Math.max(end - start, 0.6)}%"></span><span class="dc-time-who">${esc(label)}</span></div>`;
    }
    html += `<div class="dc-time-ends"><span>${ago(top)}</span><span>Now</span></div>`;
    box.innerHTML = html;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // ---------- your favourite next to this one ----------

  function renderCompare(n, path) {
    const box = $('dcCompare');
    if (!fav || fav.q === n.q) { box.hidden = true; return; }
    const A = fav.path, B = path.map(q => ({ q, ...pick(nodes.get(q)) }));
    let i = 0;
    while (i < A.length && i < B.length && A[i].q === B[i].q) i++;
    const meet = B[i - 1];
    const lines = [];
    const favName = fav.name, hereName = nameOf(n);
    if (i === B.length) lines.push(`Your ${esc(favName)} is somewhere inside this branch, ${A.length - i} ${A.length - i === 1 ? 'step' : 'steps'} further up.`);
    else if (i === A.length) lines.push(`This is inside your ${esc(favName)}'s branch, ${B.length - i} ${B.length - i === 1 ? 'step' : 'steps'} further up.`);
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
    box.onclick = e => { const b = e.target.closest('.dc-link'); if (b) go(+b.dataset.q, b.dataset.h ? +b.dataset.h : undefined); };
    box.innerHTML = `<p class="dc-compare-head"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/></svg>Next to your ${esc(favName)}</p><ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul>`;
    box.hidden = false;
  }
  // what a trunk step needs for comparing
  const pick = n => ({ name: nameOf(n), a: n.a, h: homeOf.get(n.q) });

  // ---------- the branches above it ----------

  function card(n) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dc-card' + (n.x ? ' is-extinct' : '') + (n.o ? ' is-other' : '') + (met.has(n.q) ? ' is-met' : '');
    b.dataset.q = n.q;
    const meta = [];
    if (n.s > 1) meta.push(`${fmt(n.s)} species`);
    if (n.x) meta.push('extinct');
    b.innerHTML = `<span class="dc-card-pic"></span><span class="dc-card-name${n.l || n.q === ROOT ? '' : ' is-latin'}">${esc(nameOf(n))}</span>${n.l ? `<span class="dc-card-sci">${esc(n.n)}</span>` : ''}${meta.length ? `<span class="dc-card-meta">${meta.join(' · ')}</span>` : ''}`;
    b.addEventListener('click', () => go(n.q, homeOf.get(n.q), { from: b.querySelector('.dc-card-pic') }));
    li.append(b);
    return li;
  }

  function renderKids(n) {
    const kids = (n.k || []).map(q => nodes.get(q)).filter(Boolean);
    const list = showAll ? kids : kids.slice(0, SHOWN);
    kidsList.replaceChildren(...list.map(card));
    canopy.classList.toggle('is-bare', !kids.length);
    const more = $('dcMore');
    more.hidden = kids.length <= SHOWN || showAll;
    more.textContent = `Show all ${fmt(kids.length)} branches`;
    // photos, a batch at a time
    loadPics(list.map(picOf)).then(ps => {
      if (current !== n) return;
      ps.forEach((p, i) => {
        const box = kidsList.children[i]?.querySelector('.dc-card-pic');
        if (!box || !p) return;
        const img = new Image();
        img.alt = '';
        img.loading = 'lazy';
        img.src = p.src;
        img.title = [list[i].p && `Pictured: ${list[i].p}`, p.by && `Photo: ${p.by.slice(0, 80)}`, p.licence].filter(Boolean).join('. ');
        box.append(img);
      });
    });
    requestAnimationFrame(drawBranches);
  }

  // a line from the stem under the canopy to each card, thicker the more species it holds. behind the
  // cards, so the far ones pass behind the near ones like branches behind leaves
  function drawBranches() {
    const box = canopy.getBoundingClientRect();
    const sx = box.width / 2, sy = box.height;
    branches.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    let paths = '';
    for (const li of kidsList.children) {
      const b = li.firstChild, r = b.getBoundingClientRect();
      const n = nodes.get(+b.dataset.q);
      const cx = r.left - box.left + r.width / 2, cy = r.bottom - box.top - 6;
      const w = Math.min(16, 3 + 2.2 * Math.log10((n?.s || 1) + 1));
      paths += `<path d="M${sx} ${sy}C${sx} ${sy - (sy - cy) * .55} ${cx} ${cy + (sy - cy) * .45} ${cx} ${cy}" stroke-width="${w.toFixed(1)}"/>`;
    }
    branches.innerHTML = paths;
  }
  new ResizeObserver(() => current && drawBranches()).observe(canopy);
  $('dcMore').addEventListener('click', () => { showAll = true; renderKids(current); });

  // ---------- the ones only wikidata has ----------

  function renderTail(n) {
    const tail = $('dcTail'), open = $('dcTailOpen'), list = $('dcTailList');
    list.replaceChildren();
    const count = n.live ? n.s : n.t;
    tail.hidden = !count;
    if (!count) return;
    open.hidden = false;
    open.disabled = false;
    open.textContent = n.live ? `Show its ${fmt(count)} ${count === 1 ? 'branch' : 'branches'}` : `And ${fmt(count)} more known only by their Latin names`;
    open.onclick = async () => {
      open.disabled = true;
      open.textContent = 'Asking Wikidata...';
      let found;
      try { found = await liveKids(n.q); } catch { open.disabled = false; open.textContent = "Wikidata didn't answer. Try again"; return; }
      if (current !== n) return;
      const known = new Set(n.k || []);
      const shown = found.filter(c => !known.has(c.q));
      open.hidden = true;
      list.replaceChildren(...shown.map(c => {
        const li = document.createElement('li');
        const b = Object.assign(document.createElement('button'), { type: 'button', className: 'dc-chip dc-chip-latin' + (met.has(c.q) ? ' is-met' : '') });
        b.innerHTML = `<i>${esc(c.n)}</i>${c.s ? `<span>${fmt(c.s)}</span>` : ''}`;
        b.addEventListener('click', () => {
          if (!nodes.has(c.q)) nodes.set(c.q, c);
          parentOf.set(c.q, n.q);
          go(c.q, undefined, { quiet: true });
        });
        li.append(b);
        return li;
      }));
      if (!shown.length) list.replaceChildren(Object.assign(document.createElement('li'), { className: 'dc-tail-none', textContent: 'Wikidata has moved them all somewhere else since this tree was made.' }));
    };
    if (n.live) open.onclick();
  }

  // ---------- the trunk under it, down to the first life ----------

  let trunkOpen = false;
  function renderTrunk(path) {
    const trunk = $('dcTrunk');
    const below = path.slice(0, -1).reverse();      // parent first, the first life last
    const step = q => {
      const n = nodes.get(q);
      const li = document.createElement('li');
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'dc-step' });
      b.innerHTML = `<span>${esc(nameOf(n))}</span>${n.l && n.q !== ROOT ? `<i>${esc(n.n)}</i>` : ''}`;
      b.addEventListener('click', () => go(q, homeOf.get(q)));
      li.append(b);
      return li;
    };
    const items = [];
    if (below.length <= 8 || trunkOpen) below.forEach(q => items.push(step(q)));
    else {
      below.slice(0, 4).forEach(q => items.push(step(q)));
      const li = document.createElement('li');
      li.className = 'dc-trunk-fold';
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: `${below.length - 6} more ancestors` });
      b.addEventListener('click', () => { trunkOpen = true; renderTrunk(path); });
      li.append(b);
      items.push(li);
      below.slice(-2).forEach(q => items.push(step(q)));
    }
    trunk.replaceChildren(...items);
    trunk.hidden = !below.length;
  }

  // ---------- the favourite in the corner ----------

  function renderFav() {
    const box = $('dcFav');
    box.hidden = !fav;
    if (!fav) return;
    $('dcFavName').textContent = fav.name;
    const img = $('dcFavImg');
    if (fav.i) loadPics([fav.i]).then(([p]) => { if (p) img.src = p.src; });
    else img.removeAttribute('src');
    let near = '';
    if (current && current.q !== fav.q) {
      const path = trail(current.q);
      let i = 0;
      while (i < fav.path.length && i < path.length && fav.path[i].q === path[i]) i++;
      const steps = (fav.path.length - i) + (path.length - i);
      near = steps ? `${steps} ${steps === 1 ? 'branch' : 'branches'} from here` : '';
    } else if (current) near = "You're looking at it";
    $('dcFavNear').textContent = near;
  }

  $('dcStar').addEventListener('click', () => {
    const n = current;
    if (!n) return;
    if (fav && fav.q === n.q) fav = null;
    else fav = { q: n.q, h: homeOf.get(n.q), name: nameOf(n), i: picOf(n), a: n.a, z: n.z, x: n.x, o: n.o, path: trail(n.q).map(q => ({ q, ...pick(nodes.get(q)) })) };
    store.set('distantCousinsFav', fav);
    render(n);
  });
  $('dcFavGo').addEventListener('click', () => {
    if (!fav) return;
    // one found on wikidata only: go to the nearest one that's in the tree
    const at = [...fav.path].reverse().find(s => s.h !== undefined || s.q === ROOT);
    go(fav.q === at?.q ? fav.q : at.q, at?.h);
  });

  // ---------- the search box ----------

  const input = $('dcFind'), found = $('dcFound');
  const tidy = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const findFiles = new Map();
  let split = null, picked = -1, results = [];
  const findFile = key => {
    if (!findFiles.has(key)) findFiles.set(key, fetch(FIND + key.replace(/^(aux|con|nul|prn)$/, '$1_') + '.json').then(r => r.ok ? r.json() : []).catch(() => { findFiles.delete(key); return []; }));
    return findFiles.get(key);
  };
  async function search() {
    const words = tidy(input.value).split(' ').filter(Boolean);
    const said = input.value;
    // names are filed under every word, so the longest word picks the file ("t rex" looks under "re")
    const key = words.reduce((a, b) => b.length > a.length ? b : a, '');
    if (key.length < 2) return show([]);
    split ??= await fetch(FIND + 'split.json').then(r => r.json()).then(a => new Set(a)).catch(() => new Set());
    const two = key.slice(0, 2);
    if (split.has(two) && key.length < 3) return show([], 'Keep typing...');
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
    show(hits.slice(0, 8), hits.length ? '' : 'No animals by that name. Try another, or its Latin name');
  }
  function show(list, note = '') {
    results = list;
    picked = -1;
    found.replaceChildren(...list.map(({ e, term }, i) => {
      const li = document.createElement('li');
      li.id = 'dcFound' + i;
      li.setAttribute('role', 'option');
      const main = term === e[3] && e[4] ? cap(e[4]) : cap(term);
      const sub = term === e[3] ? e[4] ? e[3] : '' : e[3];
      li.innerHTML = `<span>${esc(main)}</span>${sub && tidy(sub) !== tidy(main) ? `<i>${esc(sub)}</i>` : ''}`;
      li.addEventListener('mousedown', ev => { ev.preventDefault(); choose(i); });
      return li;
    }));
    if (note) found.append(Object.assign(document.createElement('li'), { className: 'dc-found-note', textContent: note }));
    const open = !!(list.length || note);
    found.hidden = !open;
    input.setAttribute('aria-expanded', open);
    input.removeAttribute('aria-activedescendant');
  }
  function choose(i) {
    const r = results[i];
    if (!r) return;
    input.value = '';
    show([]);
    input.blur();
    go(r.e[0], r.e[1]);
  }
  let typing;
  input.addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(search, 120); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!results.length) return;
      e.preventDefault();
      picked = (picked + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      [...found.children].forEach((li, i) => li.setAttribute('aria-selected', i === picked));
      input.setAttribute('aria-activedescendant', 'dcFound' + picked);
    } else if (e.key === 'Enter') { e.preventDefault(); choose(picked < 0 ? 0 : picked); }
    else if (e.key === 'Escape') show([]);
  });
  input.addEventListener('blur', () => setTimeout(() => show([]), 100));

  // ---------- surprise me, back to the start ----------

  let index = null;
  const loadIndex = () => index ??= fetch(TREE + 'index.json').then(r => r.json());
  loadIndex().then(i => { total = i.count; sayMet(); }).catch(() => { });
  $('dcSurprise').addEventListener('click', async () => {
    const { slices: all } = await loadIndex();
    // most slices are beetles and moths, so the first few goes only take somebody with a common name
    for (let tries = 0; tries < 8; tries++) {
      const s = all[Math.floor(Math.random() * all.length)];
      await loadSlice(s);
      // somebody with a photo and something written about them, never met before if possible
      const pool = [...nodes.values()].filter(n => homeOf.get(n.q) === s && n.i && (tries < 5 ? n.l : n.l || n.w) && !n.p);
      const fresh = pool.filter(n => !met.has(n.q));
      const from = fresh.length ? fresh : pool;
      if (from.length) return go(from[Math.floor(Math.random() * from.length)].q, s);
    }
  });
  $('dcStart').addEventListener('click', () => go(ROOT, ROOT));

  // ---------- off we go ----------

  const fromHash = () => {
    const m = /^#(\d+)(?:-(\d+))?$/.exec(location.hash);
    return m ? [+m[1], m[2] ? +m[2] : undefined] : [ROOT, ROOT];
  };
  addEventListener('popstate', () => { const [q, h] = fromHash(); go(q, h, { quiet: true, scroll: false }); });
  sayMet();
  const [q, h] = fromHash();
  go(q, h, { replace: true, scroll: !!location.hash });
})();
