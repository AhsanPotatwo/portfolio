// distant cousins' progress window: what's on the tree you're on and how you explore. the tree part is worked
// out from the board (page.js), the exploring part from what achievements.js counts (distantCousinsStats) and a
// log kept here of when you find things (distantCousinsLog: finds per day, and per hour of the day). then how
// you compare with everybody, from the server (server/src/cousins.js): how big your tree is next to everyone's,
// what everyone else finds most, the most loved creatures, and today's daily cousin. a summary of the tree
// (its size and its mix of kinds, nothing else) goes to the server once the board's loaded and whenever the
// window opens
(() => {
  const api = window.dcApi;
  const $ = id => document.getElementById(id);
  const { store, fmt, esc } = api;

  // the kinds of creature, in the order the server keeps them. each creature is the first kind it belongs to
  // (birds before reptiles: in the tree, birds are reptiles), and anything that isn't any of them is the last
  const KINDS = [
    ['Mammals', 7377], ['Birds', 5113], ['Reptiles', 10811], ['Amphibians', 10908], ['Ray-finned fish', 127282],
    ['Insects', 1390], ['Spiders', 1357], ['Crustaceans', 25364], ['Molluscs', 25326], ['Everything else', null],
  ];
  // when their oldest fossils are from
  const ERAS = [['Before the Cambrian', 538.8], ['Paleozoic', 251.9], ['Mesozoic', 66], ['Cenozoic', 0], ['No fossils known', -1]];
  const PARTS = [['in the mornings', 5, 12], ['in the afternoons', 12, 17], ['in the evenings', 17, 22], ['at night', 22, 29]];

  // ---------- the log of finds ----------
  const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const log = store.get('distantCousinsLog', null) || { since: Date.now(), days: {}, hours: Array(24).fill(0) };
  document.addEventListener('dc:find', e => {
    // (a hunt's board isn't yours)
    if (e.detail?.hunting || api.hunting) return;
    const now = new Date(), k = dayKey(now);
    log.days[k] = (log.days[k] || 0) + 1;
    log.hours[now.getHours()]++;
    const days = Object.keys(log.days).sort();
    while (days.length > 120) delete log.days[days.shift()];
    store.set('distantCousinsLog', log);
  });

  // ---------- the tree you're on ----------
  function tally() {
    const t = { creatures: [], groups: 0, extinct: 0, mix: KINDS.map(() => 0), eras: ERAS.map(() => 0), under: new Map() };
    for (const q of api.found.keys()) {
      const n = api.nodes.get(q);
      if (!n || n.o) continue;
      if (api.isGroup(n)) { t.groups++; continue; }
      const line = api.trail(q);
      t.creatures.push({ n, line });
      if (n.x) t.extinct++;
      t.mix[KINDS.findIndex(([, g]) => g === null || line.includes(g))]++;
      t.eras[n.a === undefined ? ERAS.length - 1 : ERAS.findIndex(([, from]) => n.a >= from)]++;
      for (const g of line.slice(1, -1)) t.under.set(g, (t.under.get(g) || 0) + 1);
    }
    return t;
  }
  // what goes to the server: only how big the tree is and its mix
  const summary = t => ({ tree: api.trees.now, creatures: t.creatures.length, groups: t.groups, extinct: t.extinct, mix: t.mix });
  async function sendTree(t) {
    if (api.hunting || !t.creatures.length) return null;
    const r = await api.server('/cousins/tree', summary(t));
    return r && !r.error ? r : null;
  }
  api.ready.then(() => sendTree(tally()));

  // ---------- the window ----------
  const box = $('dcProg'), body = $('dcProgBody'), win = api.dialog(box);
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const ICONS = {
    kinds: '<path d="M12 12.5c-3 0-5.5 2.6-5.5 4.8 0 1.7 1.3 2.7 2.9 2.7 1 0 1.7-.5 2.6-.5s1.6.5 2.6.5c1.6 0 2.9-1 2.9-2.7 0-2.2-2.5-4.8-5.5-4.8z"/><ellipse cx="5.2" cy="10.4" rx="1.7" ry="2.1"/><ellipse cx="9.3" cy="6.2" rx="1.7" ry="2.2"/><ellipse cx="14.7" cy="6.2" rx="1.7" ry="2.2"/><ellipse cx="18.8" cy="10.4" rx="1.7" ry="2.1"/>',
    time: '<path d="M10.375 12a1.625 1.625 0 0 1 3.25 0a3.25 3.25 0 0 1-6.5 0a4.875 4.875 0 0 1 9.75 0a6.5 6.5 0 0 1-13 0a8.125 8.125 0 0 1 16.25 0"/>',
    records: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/>',
    you: '<path d="M6.5 21V4M6.5 4.5h11l-2.5 4 2.5 4h-11"/>',
    all: '<circle cx="12" cy="5.5" r="2.5"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/><path d="M12 8v3.5M5.5 16v-1.5a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3V16"/>',
  };
  const head = (sec, icon, words) => `<h3 class="dc-ach-head" data-sec="${sec}"><span class="dc-ach-badge" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONS[icon]}</svg></span>${words}</h3>`;
  // one bar split into parts, with what each part is under it
  const stack = (parts, cls) => {
    const all = parts.reduce((s, p) => s + p[1], 0) || 1;
    return `<span class="dc-prog-stack ${cls}">${parts.map(([, n], i) => n ? `<i data-part="${i}" style="flex:${n}"></i>` : '').join('')}</span>
      <ul class="dc-prog-legend ${cls}">${parts.map(([name, n], i) => n ? `<li data-part="${i}"><i></i>${esc(name)} <b>${fmt(n)}</b> <small>${pct(n, all)}%</small></li>` : '').join('')}</ul>`;
  };
  const go = (n, words) => `<button class="dc-prog-go" type="button" data-go="${n.q}"><span class="dc-prog-go-pic" data-pic-box>${api.picOf(n) ? `<img data-file="${esc(api.picOf(n))}" alt="">` : ''}</span><span><b>${esc(api.nameOf(n))}</b><small>${words}</small></span></button>`;

  function render() {
    const t = tally(), c = t.creatures, total = c.length;
    let html = `<div class="dc-prog-tiles">
      <p><b>${fmt(total)}</b><span>creatures found</span><small>of ${fmt(api.total)}${total ? `, ${total / api.total < 0.0001 ? 'a tiny bit' : +(total / api.total * 100).toFixed(2) + '%'}` : ''}</small></p>
      <p><b>${fmt(t.groups)}</b><span>groups found</span></p>
      <p><b>${fmt(t.extinct)}</b><span>that died out</span></p>
      <p><b>${fmt(c.reduce((m, x) => Math.max(m, x.line.length - 1), 0))}</b><span>steps down your longest line</span></p>
    </div>`;
    html += `<p class="dc-trees-say">${api.trees.list.length > 1 ? `This is <b>${esc(api.trees.list.find(x => x.id === api.trees.now)?.name || '')}</b>, the tree on the board now. ` : ''}${total ? 'Here\'s what\'s on it, and how you explore.' : 'There\'s nothing on this tree yet. Discover a few creatures and come back to see what you like finding most.'}</p>`;

    if (total) {
      // what you find most, with everyone's share ticked on each bar once the server says
      const order = KINDS.map((k, i) => i).filter(i => t.mix[i]).sort((a, b) => t.mix[b] - t.mix[a]);
      const top = order[0], most = t.mix[top];
      // your favourite corner: the furthest down group holding at least a quarter of your finds (three at least),
      // with an everyday name
      let corner = null;
      for (const [g, n] of t.under) {
        const node = api.nodes.get(g);
        if (!node?.l || n < Math.max(3, total * 0.25)) continue;
        const depth = api.trail(g).length;
        if (!corner || depth > corner.depth || depth === corner.depth && n > corner.n) corner = { node, n, depth };
      }
      html += `${head(1, 'kinds', 'What you find most')}
        <p class="dc-prog-say">${KINDS[top][1] ? `Mostly <b>${KINDS[top][0].toLowerCase()}</b>: ${pct(most, total)}% of your finds.` : 'Mostly the less famous corners of the tree.'}${corner ? ` Your favourite corner is the <button class="dc-link" type="button" data-go="${corner.node.q}">${esc(api.nameOf(corner.node).toLowerCase())}</button>, with ${fmt(corner.n)} of your ${fmt(total)} creatures.` : ''} <span data-everyone-kind></span></p>
        <ul class="dc-prog-kinds">${order.map(i => `<li data-kind="${i}"><span>${esc(KINDS[i][0])}</span><span class="dc-prog-bar"><i style="width:${(t.mix[i] / most * 100).toFixed(1)}%"></i><em data-tick="${i}" hidden></em></span><b>${fmt(t.mix[i])}</b></li>`).join('')}</ul>
        <p class="dc-prog-note" data-tick-note hidden><em></em> what everyone else's trees are like</p>`;

      // then and now: alive or gone, and how old their families are
      const records = [];
      const best = (score, words) => { let b = null; for (const x of c) { const s = score(x); if (s !== undefined && s !== null && (!b || s > b.s)) b = { x, s }; } return b; };
      const old = best(x => x.n.a), heavy = best(x => x.n.kg), light = best(x => x.n.kg && -x.n.kg), deep = best(x => x.line.length);
      const lately = best(x => x.n.x && x.n.z !== undefined ? -x.n.z : undefined);
      if (old) records.push(go(old.x.n, `The oldest fossils: ${esc(api.ago(old.s).replace(' ago', ' old'))}`));
      if (heavy) records.push(go(heavy.x.n, `The heaviest: about ${esc(api.weight(heavy.s))}`));
      if (light && light.x !== heavy?.x) records.push(go(light.x.n, `The lightest: about ${esc(api.weight(-light.s))}`));
      if (lately) records.push(go(lately.x.n, `The last to die out: ${esc(lately.s > -0.0125 ? 'within the last 12,000 years' : api.ago(-lately.s))}`));
      if (deep) records.push(go(deep.x.n, `The furthest from the first life: ${fmt(deep.s - 1)} steps`));
      // (where every line on the tree comes together)
      let meet = c[0].line.length;
      for (const x of c) { let i = 0; while (i < meet && x.line[i] === c[0].line[i]) i++; meet = i; }
      const all = total > 1 && meet > 1 ? api.nodes.get(c[0].line[meet - 1]) : null;
      html += `${head(3, 'time', 'Then and now')}
        <p class="dc-sub">Still around, or gone</p>${stack([['Alive today', total - t.extinct], ['Died out', t.extinct]], 'is-alive')}
        <p class="dc-sub">When their oldest fossils are from</p>${stack(ERAS.map(([name], i) => [name, t.eras[i]]), 'is-eras')}
        ${all ? `<p class="dc-prog-say">Everything on this tree is in one group: the <button class="dc-link" type="button" data-go="${all.q}">${esc(api.nameOf(all).toLowerCase())}</button>.</p>` : ''}
        ${records.length ? `${head(5, 'records', 'Records on your tree')}<div class="dc-prog-records">${records.join('')}</div>` : ''}`;
    }

    // how you explore
    const stats = store.get('distantCousinsStats', {}), got = Object.keys(store.get('distantCousinsAchievements', {})).length;
    const tiles = [['opened', 'read about'], ['searches', 'searches'], ['surprises', 'surprises'], ['compared', 'side by sides'], ['gaps', 'missing links uncovered'], ['huntsWon', 'hunts won'], ['mysteriesSolved', 'mysteries solved']];
    const parts = PARTS.map(([name, from, to]) => [name, log.hours.reduce((s, n, h) => s + (h >= from % 24 && h < to || h + 24 >= from && h + 24 < to ? n : 0), 0)]);
    const logged = parts.reduce((s, p) => s + p[1], 0), busiest = parts.reduce((a, b) => b[1] > a[1] ? b : a);
    const fortnight = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); return [d, log.days[dayKey(d)] || 0]; });
    const peak = Math.max(1, ...fortnight.map(f => f[1])), week = fortnight.slice(7).reduce((s, f) => s + f[1], 0);
    html += `${head(0, 'you', 'How you explore')}
      <div class="dc-prog-tiles is-small">${tiles.map(([k, words]) => `<p><b>${fmt(stats[k] || 0)}</b><span>${words}</span></p>`).join('')}<p><b>${fmt(got)}</b><span>achievements</span></p></div>
      ${logged ? `<p class="dc-prog-say">You explore most <b>${busiest[0]}</b>, and found ${fmt(week)} ${week === 1 ? 'creature or group' : 'creatures and groups'} in the last week.</p>
      <div class="dc-prog-days" aria-label="Finds on each of the last 14 days">${fortnight.map(([d, n]) => `<span class="${n ? '' : 'is-none'}" title="${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}: ${fmt(n)}"><i style="--h:${(n / peak).toFixed(3)}"></i><small>${d.toLocaleDateString('en-GB', { weekday: 'narrow' })}</small></span>`).join('')}</div>
      <p class="dc-prog-note">Finds counted since ${new Date(log.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.</p>`
      : '<p class="dc-prog-say">Your finds from now on are counted here: what times of day you explore, and how many each day.</p>'}`;

    html += `${head(2, 'all', 'You and everyone else')}<div data-everyone><p class="dc-prog-say">Asking the server...</p></div>`;
    body.innerHTML = html;
    api.fillPics(body);
    everyone(t);
  }

  // the server's part: filled in when it answers, or a note when it can't be reached
  async function everyone(t) {
    const [tree, loved, daily] = await Promise.all([sendTree(t), api.server('/cousins/favs'), api.server('/cousins/daily?who=' + api.me)]);
    const el = body.querySelector('[data-everyone]');
    if (!el || box.hidden) return;
    if (!Array.isArray(loved) && !daily) { el.innerHTML = '<p class="dc-prog-say">The server can\'t be reached right now, so this part will have to wait. Everything above is worked out right here.</p>'; return; }
    let html = '';
    if (tree) {
      const others = tree.trees - 1;
      html += `<p class="dc-prog-say">${others > 0 && tree.smaller ? `This tree is bigger than <b>${pct(tree.smaller, others)}%</b> of the ${fmt(others)} other ${others === 1 ? 'tree' : 'trees'} explorers have grown here.` : others > 0 ? `None of the ${fmt(others)} other ${others === 1 ? 'tree' : 'trees'} explorers have grown here ${others === 1 ? 'is' : 'are'} smaller, for now. Keep exploring!` : 'This is the first tree to be counted. Everyone else\'s will be compared with it.'}</p>`;
      // everyone's share of each kind, as a tick on your bars
      const most = Math.max(...t.mix), total = t.creatures.length;
      for (const tick of body.querySelectorAll('[data-tick]')) {
        const share = tree.mix[+tick.dataset.tick] * total;
        tick.style.left = Math.min(100, share / most * 100).toFixed(1) + '%';
        tick.hidden = !(others > 0);
      }
      const theirs = tree.mix.slice(0, -1).reduce((b, s, i) => s > tree.mix[b] ? i : b, 0);
      body.querySelector('[data-tick-note]')?.toggleAttribute('hidden', !(others > 0));
      const say = body.querySelector('[data-everyone-kind]');
      if (say && others > 0) say.textContent = t.mix.indexOf(Math.max(...t.mix)) === theirs ? `Everyone else finds ${KINDS[theirs][0].toLowerCase()} most too.` : `Everyone else finds ${KINDS[theirs][0].toLowerCase()} most.`;
    }
    if (daily && !daily.error) {
      const you = daily.you;
      html += `<div class="dc-prog-daily"><p><b>Daily cousin No. ${fmt(daily.number)}</b><span>${fmt(daily.players)} played today and ${fmt(daily.solved)} got it.${you?.won ? ` You placed ${ordinal(you.rank)}.` : you?.done ? ' It beat you this time.' : ''}</span></p>
        ${you?.done ? '<button class="dc-key" type="button" data-daily>See the results</button>' : '<button class="dc-key dc-vs-key" type="button" data-daily>Play today\'s</button>'}</div>`;
    }
    // the most loved: drawn from their own tree files, so nothing's taken on trust
    if (Array.isArray(loved) && loved.length) {
      await Promise.all(loved.map(l => l.h === null ? null : api.loadSlice(l.h).catch(() => { })));
      const shown = loved.filter(l => api.nodes.has(l.q)).slice(0, 8);
      if (shown.length) html += `<p class="dc-sub">The most loved creatures</p><div class="dc-prog-loved">${shown.map(l => go(api.nodes.get(l.q), `${fmt(l.n)} ${l.n === 1 ? 'favourite' : 'favourites'}${api.fav?.q === l.q ? ', yours too' : ''}`)).join('')}</div>`;
    }
    if (!body.contains(el)) return;
    el.innerHTML = html;
    api.fillPics(el);
  }
  const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

  $('dcProgOpen').addEventListener('click', async () => { await api.ready; render(); win.show(); dcSound.play('tap'); });
  body.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.go) { win.close(); api.bring(+b.dataset.go); }
    else if (b.hasAttribute('data-daily')) { win.close(); api.startDaily?.(); }
  });
})();
