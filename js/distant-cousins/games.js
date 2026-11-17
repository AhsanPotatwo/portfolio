// distant cousins' games, picked from the play key:
//   the hunt: you're shown a creature, and starting from the very first life with nothing else on the board you
//     discover your way down the tree to it. four levels: easy (famous animals, the right branch is always in
//     view, wrong turns are marked and hints are free), normal (well known ones, three hints), hard (ones a keen
//     naturalist would know, the right branch may be under "more", one hint, no marks) and expert (latin names
//     only, no picture, no hints, no marks). your own tree is put away while it lasts (page.js enterHunt) and
//     the creature you were hunting goes on it when you find it
//   closer cousins: ten rounds of "which of these two is the closer cousin of this one?", answered from the
//     family lines (a whale is closer to a hippo than to a shark). both quizzes come in the hunt's four levels,
//     each asking about more creatures and closer calls (QUIZ_LEVELS, CLOSER, WHICH)
//   which one?: ten quick questions about two creatures: which has the older fossils, which is heavier, which is still alive
// the creatures come from games.json (tools/build.js): who to hunt at each level, and the best known 1,650 with
// their family lines and facts, so the quizzes need no tree files
(() => {
  const api = window.dcApi;
  const $ = id => document.getElementById(id);
  const { esc, fmt, store } = api;
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const cap = s => s && s[0].toUpperCase() + s.slice(1);
  // a name in the middle of a sentence, with "the": "the lion", "the common ostrich", but "the Bengal tiger"
  // (the first word's capital stays unless it's a plain word, not a place or a person)
  const PLAIN = /^(common|great|greater|lesser|little|giant|northern|southern|eastern|western|red|black|white|grey|gray|brown|golden|blue|green|yellow|spotted|striped|wild|domestic|house|sea|river|snowy|crested)$/i;
  // (proper: the build's say, games.json's tenth field, when there is one. 2: it has only a latin name,
  // Tarbosaurus, which goes as it is)
  const the = (name, proper) => {
    if (!name) return '';
    if (proper === 2) return name;
    const plain = proper === undefined ? !name.includes(' ') || PLAIN.test(name.split(' ')[0]) : !proper;
    return 'the ' + (plain ? name[0].toLowerCase() + name.slice(1) : name);
  };
  let data = null;
  const load = () => data ??= fetch('js/distant-cousins/games.json').then(r => { if (!r.ok) throw new Error('games ' + r.status); return r.json(); });

  // a picture into an <img> once it's here
  function picture(img, file) {
    if (!file) return;
    api.loadPics([file]).then(([p]) => { if (p) img.src = p.src; else img.closest('[data-pic-box]')?.classList.add('is-none'); });
  }

  // ---------- the window with the games in ----------

  const box = $('dcGames'), win = api.dialog(box);
  const LEVELS = {
    easy: { name: 'Easy', who: 'For children: famous animals, and the right way is always in view', hints: Infinity, marks: true, keep: true, picture: true },
    normal: { name: 'Normal', who: 'Well known creatures, three hints, wrong turns marked', hints: 3, marks: true, keep: true, picture: true },
    hard: { name: 'Hard', who: 'For keen naturalists: one hint, no marks, and the way may be hidden under "more"', hints: 1, marks: false, keep: false, picture: true },
    expert: { name: 'Expert', who: 'For scientists: a Latin name, no picture, no hints, no help at all', hints: 0, marks: false, keep: false, picture: false },
  };
  // the quizzes' levels: easy asks about the best known 150 creatures and the answers are far apart (a whale
  // or a mouse), each level after asks about more of them, closer together, so expert is two similar sized
  // gulls, or two cousins that are nearly as close as each other
  const QUIZ_LEVELS = {
    easy: { name: 'Easy', who: 'Famous animals, far apart', pool: 150 },
    normal: { name: 'Normal', who: 'Well known ones', pool: 600 },
    hard: { name: 'Hard', who: 'Closer calls', pool: Infinity },
    expert: { name: 'Expert', who: 'Only just', pool: Infinity },
  };
  const best = store.get('distantCousinsBest', {});
  // (the best scores from before there were levels were normal ones)
  for (const game of ['closer', 'which']) if (best[game] !== undefined) { best[game + '-normal'] ??= best[game]; delete best[game]; store.set('distantCousinsBest', best); }
  // ---------- the games, a card each ----------
  // a new game is one more entry: its name, a line about it, its four levels (easy to expert, keyed as LEVELS
  // is), how to start one, what to say about your best at a level, its colour and the colour behind its
  // picture (css custom properties), and its picture (ART, same id)
  const GAMES = [
    { id: 'hunt', name: 'The hunt', say: 'We pick a creature. Start from the very first life and find your way down the tree to it.',
      levels: LEVELS, tone: ['--leaf', '--leaf-soft'], start: k => startHunt(k),
      best: k => best['hunt-' + k] ? `Won ${fmt(best['hunt-' + k])} ${best['hunt-' + k] === 1 ? 'time' : 'times'}` : '' },
    { id: 'closer', name: 'Closer cousins', say: 'Which of two creatures is the closer relative of a third? Ten rounds, and some answers are surprising.',
      levels: QUIZ_LEVELS, tone: ['--g-rose', '--rose'], start: k => startQuiz('closer', k),
      best: k => best['closer-' + k] !== undefined ? `Your best: ${best['closer-' + k]}/10` : '' },
    { id: 'which', name: 'Which one?', say: 'Ten quick questions about two creatures: which has the older fossils, which is heavier, which is still around.',
      levels: QUIZ_LEVELS, tone: ['--g-sky', '--sky'], start: k => startQuiz('which', k),
      best: k => best['which-' + k] !== undefined ? `Your best: ${best['which-' + k]}/10` : '' },
  ];
  const KEYS = ['easy', 'normal', 'hard', 'expert'];
  // little line drawings in the board's style: cards with faces, a game colour (f-sec), the page's card colour
  // (f-card), dotted trails. the bits with class "move" fidget when you point at the game
  const face = (x, y) => `<circle class="f-ink" cx="${x - 4}" cy="${y}" r="1.8"/><circle class="f-ink" cx="${x + 4}" cy="${y}" r="1.8"/><path d="M${x - 3} ${y + 5}q3 2.5 6 0"/>`;
  const ART = {
    // the tree from the first life down, mystery cards on the wrong branches, a magnifying glass on the right one
    hunt: `<path d="M100 25v11M60 52v-9a6 6 0 0 1 6-6h68a6 6 0 0 1 6 6v9M100 37v15"/>
      <circle class="f-card" cx="100" cy="16" r="9"/>
      <rect class="f-card" x="47" y="52" width="26" height="20" rx="6"/><text x="60" y="67">?</text>
      <rect class="f-card" x="87" y="52" width="26" height="20" rx="6"/><text x="100" y="67">?</text>
      <rect class="f-sec" x="127" y="52" width="26" height="20" rx="6"/>
      <path class="trail" d="M140 72v8"/>
      <g class="move"><circle class="f-glass" cx="140" cy="92" r="13"/><path d="M149.5 101l11 9"/>
      <path class="f-star" d="M140 85.5l2 4.1 4.5.6-3.3 3.1.8 4.5-4-2.2-4 2.2.8-4.5-3.3-3.1 4.5-.6z"/></g>`,
    // a creature and two others: one close (a short solid branch, a heart on it), one far (a long dotted one)
    closer: `<path class="line-sec" d="M90 38C82 52 62 50 52 66"/>
      <path class="trail" d="M110 38C120 54 140 50 150 66"/>
      <rect class="f-card" x="82" y="10" width="36" height="28" rx="9"/>${face(100, 22)}
      <rect class="f-sec" x="32" y="66" width="38" height="30" rx="9"/>${face(51, 79)}
      <rect class="f-card" x="132" y="66" width="38" height="30" rx="9"/>${face(151, 79)}
      <path class="f-heart move" d="M69 52.5c-2.6-2.6-6.5.2-4.4 3.2L69 60.5l4.4-4.8c2.1-3-1.8-5.8-4.4-3.2z"/>`,
    // two on a see-saw, the heavier one down, a question over them
    which: `<path class="f-soft2" d="M100 76L88 97h24z"/>
      <path d="M34 86L166 67"/>
      <g transform="rotate(-8 46 68)"><rect class="f-sec" x="26" y="53" width="40" height="30" rx="9"/>${face(46, 66)}</g>
      <g transform="rotate(-8 154 51)"><rect class="f-card" x="136" y="38" width="36" height="26" rx="9"/>${face(154, 49)}</g>
      <g class="move"><circle class="f-star" cx="100" cy="28" r="15"/><text x="100" y="35">?</text></g>`,
  };
  const picked = store.get('distantCousinsGameLevels', {});
  function renderMenu() {
    $('dcGamesBody').innerHTML = `<p class="dc-trees-say">Pick a game, slide to how hard you'd like it, and play. Your own tree is kept safe while you do.</p>
      <div class="dc-games">${GAMES.map(g => {
        const at = Math.max(0, KEYS.indexOf(picked[g.id] || 'normal'));
        return `<section class="dc-game" data-game="${g.id}" style="--sec:var(${g.tone[0]});--soft:var(${g.tone[1]})">
          <div class="dc-game-art" aria-hidden="true"><svg viewBox="0 0 200 112">${ART[g.id] || ''}</svg></div>
          <h3>${esc(g.name)}</h3>
          <p class="dc-game-say">${esc(g.say)}</p>
          <div class="dc-level-pick">
            <input type="range" min="0" max="3" step="1" value="${at}" data-level-of="${g.id}" aria-label="How hard: ${esc(g.name)}">
            <span class="dc-stops" aria-hidden="true">${KEYS.map((k, i) => `<i data-stop="${i}"></i>`).join('')}</span>
            ${THUMB}
            <div class="dc-ticks" aria-hidden="true">${KEYS.map((k, i) => `<span data-tick="${i}">${g.levels[k].name}</span>`).join('')}</div>
          </div>
          <div class="dc-game-level">${KEYS.map((k, i) => {
            const l = g.levels[k], b = g.best(k);
            return `<p data-say="${i}"><b>${esc(l.name)}</b><span>${esc(l.who)}</span>${b ? `<span class="dc-game-best">${esc(b)}</span>` : ''}</p>`;
          }).join('')}</div>
          <button class="dc-key dc-game-play" type="button" data-play="${g.id}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg><span>Play</span></button>
        </section>`;
      }).join('')}</div>`;
    for (const input of $('dcGamesBody').querySelectorAll('[data-level-of]')) sayLevel(input, true);
  }
  // the slider's own thumb is see-through (it still does the dragging and the keys): this one is drawn over it
  // and glides to each stop (css transitions --at). it has a face that gets more worried the harder it gets
  const THUMB = `<span class="dc-thumb" aria-hidden="true"><svg viewBox="0 0 20 20"><circle cx="7" cy="8.5" r="1.5"/><circle cx="13" cy="8.5" r="1.5"/><path class="dc-thumb-mouth" d="M6.5 12.5Q8 14.5 10 14.5Q12 14.5 13.5 12.5"/></svg></span>`;
  // the slider's level, in words under it, and remembered for next time. all four levels' words are there
  // at once, on top of each other, so the card is always as tall as the longest and never jumps
  function sayLevel(input, quiet) {
    const g = GAMES.find(x => x.id === input.dataset.levelOf), at = +input.value, k = KEYS[at], l = g.levels[k];
    const card = input.closest('.dc-game');
    card.style.setProperty('--at', at / 3);
    if (!quiet && card.dataset.level !== k) {
      // (a squash as it sets off)
      const thumb = card.querySelector('.dc-thumb');
      thumb.classList.remove('is-off');
      void thumb.offsetWidth;
      thumb.classList.add('is-off');
    }
    card.dataset.level = k;
    input.setAttribute('aria-valuetext', `${l.name}: ${l.who}`);
    for (const t of card.querySelectorAll('[data-tick]')) t.classList.toggle('is-on', +t.dataset.tick === at);
    for (const s of card.querySelectorAll('[data-stop]')) s.classList.toggle('is-past', +s.dataset.stop <= at);
    for (const p of card.querySelectorAll('[data-say]')) p.classList.toggle('is-on', +p.dataset.say === at);
    card.querySelector('[data-play]').setAttribute('aria-label', `Play ${g.name}, ${l.name.toLowerCase()}`);
    picked[g.id] = k;
    store.set('distantCousinsGameLevels', picked);
  }
  $('dcGamesOpen').addEventListener('click', () => { renderMenu(); win.show(); });
  box.addEventListener('input', e => { if (e.target.dataset.levelOf) sayLevel(e.target); });
  box.addEventListener('click', e => {
    // (a level's name under the slider moves it there too)
    const tick = e.target.closest('[data-tick]');
    if (tick) {
      const input = tick.closest('.dc-level-pick').querySelector('input');
      input.value = tick.dataset.tick;
      sayLevel(input);
      input.focus();
      return;
    }
    const b = e.target.closest('[data-play]');
    const g = b && GAMES.find(x => x.id === b.dataset.play);
    if (g) { win.close(); g.start(b.closest('.dc-game').dataset.level); }
  });

  // ---------- the hunt ----------

  const bar = $('dcHunt');
  let h = null;          // the hunt in progress
  async function startHunt(level) {
    let g;
    try { g = await load(); } catch (e) { console.warn(e); return; }
    // (your own tree all there before it's put away)
    await api.ready;
    // not one of the last twenty hunted
    const recent = store.get('distantCousinsHunted', []);
    const pool = g.hunt[level].filter(([q]) => !recent.includes(q));
    let target = null;
    for (let tries = 0; tries < 6 && !target; tries++) {
      const [q, slice] = pick(pool.length ? pool : g.hunt[level]);
      try { await api.loadSlice(slice); } catch { continue; }
      if (api.nodes.has(q)) target = q;
    }
    if (!target) return;
    store.set('distantCousinsHunted', [target, ...recent].slice(0, 20));
    const path = api.trail(target);
    const n = api.nodes.get(target);
    // (proper: whether its name starts with a name of its own, from games.json where it's there)
    const proper = g.quiz.find(e => e[0] === target)?.[9];
    h = { level, L: LEVELS[level], target, path, on: new Set(path), wrong: 0, hintsUsed: 0, hinted: null, reveal: new Set(), started: Date.now(), n, proper };
    api.enterHunt({
      keep: q => h.L.keep && h.on.has(q) || h.reveal.has(q),
      mark: it => {
        if (it.kind === 'unfound' && it.q === h.hinted) return ' is-hinted';
        if (it.kind !== 'found' || !h.L.marks || it.q === api.ROOT) return '';
        return h.on.has(it.q) ? ' is-trail' : ' is-astray';
      },
      found: q => found(q),
    });
    renderBar();
    bar.hidden = false;
  }
  // the next card on the way there: the first on the path not found yet
  const nextOnPath = () => h.path.find(q => q !== api.ROOT && !api.found.has(q));
  function renderBar(note = '') {
    const n = h.n, L = h.L;
    const name = L.picture ? api.nameOf(n) : n.n;
    const left = L.hints === Infinity ? 'Hints: as many as you like' : `Hints left: ${L.hints - h.hintsUsed}`;
    bar.innerHTML = `
      ${L.picture && api.picOf(n) ? `<span class="dc-hunt-pic" data-pic-box><img alt="" id="dcHuntImg"></span>` : ''}
      <span class="dc-hunt-words">
        <span class="dc-hunt-kicker">${L.name} hunt</span>
        <b class="${L.picture && n.l ? '' : 'is-latin'}">Find ${L.picture && n.l ? esc(the(name, h.proper)) : esc(name)}</b>
        <span class="dc-hunt-say" aria-live="polite">${esc(note || `Wrong turns: ${h.wrong}${L.hints ? ' · ' + left : ''}`)}</span>
      </span>
      <span class="dc-hunt-keys">
        ${L.hints && h.hintsUsed < L.hints ? '<button class="dc-key" type="button" data-hint>Hint</button>' : ''}
        <button class="dc-key" type="button" data-quit>Give up</button>
      </span>`;
    if (L.picture) picture($('dcHuntImg'), api.picOf(n));
  }
  bar.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !h) return;
    if (b.hasAttribute('data-hint')) hint();
    else if (b.hasAttribute('data-quit')) giveUp();
  });
  function hint() {
    const next = nextOnPath();
    if (next === undefined) return;
    h.hintsUsed++;
    h.hinted = next;
    // (it may be hidden under "more": a hint brings it out)
    h.reveal.add(next);
    api.draw(false);
    const it = api.items.get(next);
    if (it) api.show(api.boxOf([next]));
    renderBar(`Look for ${api.nameOf(api.nodes.get(next))}`);
    dcSound.play('sparkle');
  }
  function found(q) {
    if (!h) return;
    if (h.hinted === q) h.hinted = null;
    if (q === h.target) return victory(q);
    if (!h.on.has(q)) {
      h.wrong++;
      renderBar(h.L.marks ? `${api.nameOf(api.nodes.get(q))} isn't on the way. Try another branch` : '');
    } else renderBar(h.L.marks ? 'On the right track' : '');
  }
  function victory(q) {
    const secs = Math.round((Date.now() - h.started) / 1000);
    const perfect = h.wrong === 0 && h.hintsUsed === 0;
    const stars = perfect ? 3 : h.wrong + h.hintsUsed <= 3 ? 2 : 1;
    best['hunt-' + h.level] = (best['hunt-' + h.level] || 0) + 1;
    store.set('distantCousinsBest', best);
    api.emit('hunt-won', { level: h.level, perfect });
    const level = h.level, n = h.n;
    bar.innerHTML = `
      <span class="dc-hunt-words">
        <span class="dc-hunt-kicker">${h.L.name} hunt won</span>
        <b>You found ${n.l ? esc(the(api.nameOf(n), h.proper)) : esc(n.n)}!</b>
        <span class="dc-hunt-say"><span class="dc-stars" aria-label="${stars} stars out of 3">${[1, 2, 3].map(i => `<svg viewBox="0 0 24 24" class="${i <= stars ? 'is-on' : ''}" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/></svg>`).join('')}</span>
        ${fmt(h.path.length - 1)} steps down, ${h.wrong} wrong ${h.wrong === 1 ? 'turn' : 'turns'}, ${h.hintsUsed} ${h.hintsUsed === 1 ? 'hint' : 'hints'}, ${secs < 120 ? secs + ' seconds' : Math.round(secs / 60) + ' minutes'}</span>
      </span>
      <span class="dc-hunt-keys">
        <button class="dc-key dc-vs-key" type="button" data-again="${level}">Hunt again</button>
        <button class="dc-key" type="button" data-home>Back to my tree</button>
      </span>`;
    api.cheer(`You found ${n.l ? the(api.nameOf(n), h.proper) : n.n}!`, 'It\'s been added to your own tree');
    h.done = q;
  }
  bar.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !h?.done) return;
    const won = h.done;
    if (b.dataset.again) { const level = b.dataset.again; finish(won); startHunt(level); }
    else if (b.hasAttribute('data-home')) finish(won);
  });
  function giveUp() {
    const n = h.n;
    const path = h.path.slice(1).map(q => esc(api.nameOf(api.nodes.get(q)))).join(' &rsaquo; ');
    bar.innerHTML = `
      <span class="dc-hunt-words">
        <span class="dc-hunt-kicker">The way to ${esc(api.nameOf(n))}</span>
        <span class="dc-hunt-path">${path}</span>
      </span>
      <span class="dc-hunt-keys">
        <button class="dc-key dc-vs-key" type="button" data-retry="${h.level}">Try another</button>
        <button class="dc-key" type="button" data-leave>Back to my tree</button>
      </span>`;
    h.done = undefined;
    h.gaveUp = true;
  }
  bar.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !h?.gaveUp) return;
    if (b.dataset.retry) { const level = b.dataset.retry; finish(); startHunt(level); }
    else if (b.hasAttribute('data-leave')) finish();
  });
  function finish(won) {
    h = null;
    bar.hidden = true;
    api.leaveHunt(won);
  }

  // ---------- the quizzes ----------

  const qbox = $('dcQuiz'), qwin = api.dialog(qbox, () => { quiz = null; });
  let quiz = null;
  const ROUNDS = 10;
  async function startQuiz(game, level = 'normal') {
    let g;
    try { g = await load(); } catch (e) { console.warn(e); return; }
    quiz = { game, level, g, pool: g.quiz.slice(0, QUIZ_LEVELS[level].pool), round: 0, score: 0, asked: new Set() };
    $('dcQuizTitle').textContent = `${game === 'closer' ? 'Closer cousins' : 'Which one?'} · ${QUIZ_LEVELS[level].name}`;
    qwin.show();
    nextRound();
  }
  // [q, slice, name, picture, a, a2, kg, extinct, family line]
  const shared = (a, b) => { let i = 0; while (i < a[8].length && i < b[8].length && a[8][i] === b[8][i]) i++; return i; };
  // how many steps the further of two goes down from where their lines meet: 1 for a mammoth and an elephant
  const apart = (a, b) => Math.max(a[8].length, b[8].length) - shared(a, b);
  const nm = q => quiz.g.names[q] || '';
  const fresh = e => !quiz.asked.has(e[0]);

  // closer cousins, by level: how much closer the right one is (steps between where the two lines meet), and
  // how near the wrong one is too (dy: how many family lines they share, 6 is the four-limbed animals). easy:
  // a mouse, a human or a bee. expert: three mammals, or three birds, one a step closer
  const CLOSER = {
    easy: { gap: [3, 99], dy: 3, left: 1 },
    normal: { gap: [2, 4], dy: 3, left: 2 },
    hard: { gap: [1, 2], dy: 6, left: 1 },
    expert: { gap: [1, 2], dy: 7, left: 1 },
  };
  function closerRound() {
    const pool = quiz.pool, L = CLOSER[quiz.level];
    for (let tries = 0; tries < 3000; tries++) {
      const t = pick(pool), x = pick(pool), y = pick(pool);
      if (t === x || t === y || x === y || !fresh(t)) continue;
      const dx = shared(t, x), dy = shared(t, y);
      if (dx - dy < L.gap[0] || dx - dy > L.gap[1] || dy < L.dy || t[8].length - dx < L.left) continue;
      // (two groups the tree calls by the same name would make a muddle of the answer)
      if (nm(t[8][dx - 1]) === nm(t[8][dy - 1])) continue;
      return { t, options: Math.random() < 0.5 ? [x, y] : [y, x], right: x, meetX: t[8][dx - 1], meetY: t[8][dy - 1] };
    }
    return null;
  }
  // which one, by level: how far apart the two are. heavier: how many times heavier (expert: a tenth or so,
  // often only grams); older fossils: how much older the older one's youngest reading is than the other's
  // oldest (it's always certain); still alive: how close cousins the two are (expert: a mammoth or an elephant)
  const WHICH = {
    easy: { heavy: [8, Infinity], first: [4, Infinity], alive: [3, 99] },
    normal: { heavy: [2, 8], first: [1.6, Infinity], alive: [0, 99] },
    hard: { heavy: [1.35, 2], first: [1.25, 1.6], alive: [0, 4] },
    expert: { heavy: [1.12, 1.35], first: [1, 1.25], alive: [0, 2] },
  };
  const within = (v, [lo, hi]) => v >= lo && v < hi;
  function whichRound() {
    const pool = quiz.pool, L = WHICH[quiz.level];
    const kinds = ['first', 'heavy', 'alive'];
    for (let tries = 0; tries < 6000; tries++) {
      const kind = pick(kinds), a = pick(pool), b = pick(pool);
      if (a === b || !fresh(a) || !fresh(b)) continue;
      if (kind === 'first') {
        // only when the fossils are sure: one's youngest reading older than the other's oldest
        if (a[4] === null || b[4] === null) continue;
        const [o, y] = a[4] >= b[4] ? [a, b] : [b, a];
        const young = y[5] ?? y[4];
        if (!(o[4] > young + 0.01) || !within(o[4] / young, L.first) || api.ago(o[4]) === api.ago(young)) continue;
        // (which has the older fossils, not which came first: a species' oldest fossil is only the oldest
        // found yet, and close calls between two are down to luck in what's been dug up)
        return { kind, ask: 'Which has the older fossils?', options: [a, b], right: o, why: `${cap(the(o[2], o[9]))}'s oldest fossils are at least ${api.ago(o[4]).replace(' ago', ' old')}. ${cap(the(y[2], y[9]))}'s are ${api.ago(young).replace(' ago', ' old')} at most.` };
      }
      if (kind === 'heavy') {
        if (!a[6] || !b[6] || !within(Math.max(a[6], b[6]) / Math.min(a[6], b[6]), L.heavy)) continue;
        const [big, small] = a[6] > b[6] ? [a, b] : [b, a];
        return { kind, ask: 'Which is heavier?', options: [a, b], right: big, why: `On average, ${the(big[2], big[9])} ${big[7] ? 'weighed' : 'weighs'} about ${api.weight(big[6])} when grown up, ${the(small[2], small[9])} about ${api.weight(small[6])}.` };
      }
      if (kind === 'alive') {
        if (a[7] === b[7] || !within(apart(a, b), L.alive)) continue;
        const [alive, gone] = a[7] ? [b, a] : [a, b];
        return { kind, ask: 'Which is still alive today?', options: [a, b], right: alive, why: `${cap(the(gone[2], gone[9]))} has died out. ${cap(the(alive[2], alive[9]))} is still around.` };
      }
    }
    return null;
  }

  function nextRound() {
    if (!quiz) return;
    if (quiz.round >= ROUNDS) return endQuiz();
    quiz.round++;
    const r = quiz.game === 'closer' ? closerRound() : whichRound();
    if (!r) return endQuiz();
    quiz.now = r;
    for (const o of [r.t, ...r.options]) if (o) quiz.asked.add(o[0]);
    const card = (e, i) => `<button class="dc-quiz-pick" type="button" data-pick="${i}">
      <span class="dc-quiz-pic" data-pic-box><img alt="" data-quiz-pic="${esc(e[3] || '')}"></span>
      <b>${esc(e[2])}</b></button>`;
    $('dcQuizBody').innerHTML = `
      <p class="dc-quiz-count">Question ${quiz.round} of ${ROUNDS} &middot; ${quiz.score} right</p>
      ${quiz.game === 'closer' ? `
        <div class="dc-quiz-target"><span class="dc-quiz-pic" data-pic-box><img alt="" data-quiz-pic="${esc(r.t[3] || '')}"></span>
          <h3>Which is the closer cousin of ${esc(the(r.t[2], r.t[9]))}?</h3></div>`
        : `<h3 class="dc-quiz-ask">${r.ask}</h3>`}
      <div class="dc-quiz-picks">${r.options.map(card).join('<span class="dc-vs-and" aria-hidden="true">or</span>')}</div>
      <p class="dc-quiz-why" aria-live="polite"></p>
      <div class="dc-quiz-next" hidden><button class="dc-key dc-vs-key" type="button" data-next>${quiz.round >= ROUNDS ? 'See how you did' : 'Next'}</button></div>`;
    for (const img of $('dcQuizBody').querySelectorAll('img[data-quiz-pic]')) picture(img, img.dataset.quizPic);
    // (the key that was pressed has gone: focus stays in the window, so escape and tab still work)
    $('dcQuizBody').querySelector('.dc-quiz-pick')?.focus({ preventScroll: true });
  }
  function answer(i) {
    const r = quiz.now;
    if (r.answered) return;
    r.answered = true;
    const chose = r.options[i], right = chose === r.right;
    if (right) quiz.score++;
    dcSound.play(right ? 'found' : 'ouch');
    $('dcQuizBody').querySelectorAll('.dc-quiz-pick').forEach((b, j) => {
      b.disabled = true;
      b.classList.add(r.options[j] === r.right ? 'is-right' : j === i ? 'is-wrong' : 'is-other');
    });
    let why = r.why;
    if (quiz.game === 'closer') {
      const x = r.right, y = r.options.find(o => o !== x);
      why = `${cap(the(r.t[2], r.t[9]))} and ${the(x[2], x[9])} meet at ${nm(r.meetX)}. ${cap(the(y[2], y[9]))} only joins them further back, at ${nm(r.meetY)}.`;
    }
    $('dcQuizBody').querySelector('.dc-quiz-why').textContent = `${right ? 'Right!' : 'Not quite.'} ${why}`;
    $('dcQuizBody').querySelector('.dc-quiz-count').textContent = `Question ${quiz.round} of ${ROUNDS} · ${quiz.score} right`;
    const next = $('dcQuizBody').querySelector('.dc-quiz-next');
    next.hidden = false;
    next.querySelector('button').focus({ preventScroll: true });
  }
  function endQuiz() {
    const { game, level, score } = quiz, key = game + '-' + level;
    if (!(best[key] >= score)) { best[key] = score; store.set('distantCousinsBest', best); }
    api.emit('quiz-done', { game, level, score });
    const words = score === 10 ? 'Perfect! Every single one.' : score >= 8 ? 'Brilliant: you really know your cousins.' : score >= 5 ? 'Not bad at all. The tree is full of surprises.' : 'Evolution is full of surprises. Try another round?';
    $('dcQuizBody').innerHTML = `
      <div class="dc-quiz-end">
        <p class="dc-quiz-score"><b>${score}</b> out of ${ROUNDS}</p>
        <p>${words}</p>
        <p class="dc-game-best">Your best at ${QUIZ_LEVELS[level].name.toLowerCase()}: ${best[key]}/10</p>
        <div class="dc-actions"><button class="dc-key dc-vs-key" type="button" data-again>Play again</button><button class="dc-key" type="button" data-games>Other games</button></div>
      </div>`;
    if (score >= 8) dcSound.play('hooray');
    $('dcQuizBody').querySelector('[data-again]').focus({ preventScroll: true });
    quiz.over = true;
  }
  qbox.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !quiz) return;
    if (b.dataset.pick !== undefined) answer(+b.dataset.pick);
    else if (b.hasAttribute('data-next')) nextRound();
    else if (b.hasAttribute('data-again')) startQuiz(quiz.game, quiz.level);
    else if (b.hasAttribute('data-games')) { qwin.close(); renderMenu(); win.show(); }
  });
})();
