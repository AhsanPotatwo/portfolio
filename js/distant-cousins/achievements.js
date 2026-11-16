// distant cousins' achievements: things to aim for while you explore, from your very first find to ones only a
// keen naturalist will get. page.js says what happens on the board (dc:find, dc:compare... events) and games.js
// what happens in the games; after each, everything not yet earned is checked again. what's earned is kept in
// local storage (distantCousinsAchievements: id -> when), with the counts some of them need
// (distantCousinsStats). the achievements key opens the list of them all, earned or not, with how far along
// you are. a hunt's board is its own, so finds during a hunt only count towards the hunting ones
(() => {
  const api = window.dcApi;
  const $ = id => document.getElementById(id);
  const { store, fmt, esc } = api;
  const got = store.get('distantCousinsAchievements', {});
  const stats = store.get('distantCousinsStats', {});
  const bump = (k, by = 1) => { stats[k] = (stats[k] || 0) + by; store.set('distantCousinsStats', stats); };

  // groups of the tree some of them ask for (wikidata ids)
  const MAMMALS = 7377, BIRDS = 5113, REPTILES = 10811, AMPHIBIANS = 10908, FISHES = 127282, INSECTS = 1390,
    SPIDERS = 1357, MOLLUSCS = 25326, CRUSTACEANS = 25364, DINOSAURS = 430, HUMAN = 15978631;
  const BACKBONES = [MAMMALS, BIRDS, REPTILES, AMPHIBIANS, FISHES];
  const BIG_CATS = [140, 19939, 34706, 35694, 30197];
  const APES = [HUMAN, 4126704, 19537, 36611, 41050];

  // everything about your tree the checks need, worked out once per check
  function tally() {
    const t = { creatures: 0, groups: 0, extinct: 0, dinos: 0, recent: 0, ancient: 0, heavy: 0, tonne: 0, tiny: 0, deepest: 0, within: new Set(), full: 0 };
    for (const q of api.found.keys()) {
      const n = api.nodes.get(q);
      if (!n) continue;
      if (api.isGroup(n)) {
        t.groups++;
        if ((n.k || []).length >= 10 && n.k.every(k => api.found.has(k))) t.full++;
        continue;
      }
      t.creatures++;
      const line = api.trail(q);
      t.deepest = Math.max(t.deepest, line.length - 1);
      for (const g of [...BACKBONES, INSECTS, SPIDERS, MOLLUSCS, CRUSTACEANS]) if (line.includes(g)) t.within.add(g);
      if (n.x) {
        t.extinct++;
        if (line.includes(DINOSAURS) && !line.includes(BIRDS)) t.dinos++;
        if (n.z !== undefined && (n.z2 ?? n.z) <= 0.0125) t.recent++;
      }
      if (n.a >= 251.9) t.ancient++;
      if (n.kg >= 10000) t.heavy++;
      if (n.kg >= 1000) t.tonne++;
      if (n.kg && n.kg < 0.001) t.tiny++;
    }
    return t;
  }
  const has = q => api.found.has(q);
  const all = (qs, t) => [qs.filter(has).length, qs.length];
  const count = (k, need) => (t) => [Math.min(t[k], need), need];
  const stat = (k, need) => () => [Math.min(stats[k] || 0, need), need];

  // [id, section, name, how to get it, progress (t) => [have, need]]
  const LIST = [
    ['hello', 'First steps', 'Hello there', 'Discover your first creature', count('creatures', 1)],
    ['signpost', 'First steps', 'Signpost', 'Discover your first group', count('groups', 1)],
    ['reader', 'First steps', 'Bookworm', 'Read about 10 creatures or groups', stat('opened', 10)],
    ['star', 'First steps', 'Star of the show', 'Pick a favourite', stat('favourites', 1)],
    ['compare', 'First steps', 'Side by side', 'Compare two creatures', stat('compared', 1)],
    ['lucky', 'First steps', 'Lucky dip', 'Use Surprise me', stat('surprises', 1)],
    ['seeker', 'First steps', 'Seeker', 'Find a creature with the search box', stat('searches', 1)],
    ['gap', 'First steps', 'Missing link', 'Uncover the ancestors hiding on a dotted line', stat('gaps', 1)],
    ['latin', 'First steps', 'Latin scholar', 'Bring out the creatures known only by Latin names', stat('latin', 1)],
    ['night', 'First steps', 'Night shift', 'Explore the tree at night', stat('night', 1)],
    ['sapling', 'First steps', 'Fresh start', 'Plant a second tree', stat('treesStarted', 1)],

    ['c10', 'Collecting', 'Taking root', 'Discover 10 creatures', count('creatures', 10)],
    ['c25', 'Collecting', 'Collector', 'Discover 25 creatures', count('creatures', 25)],
    ['c50', 'Collecting', 'Naturalist', 'Discover 50 creatures', count('creatures', 50)],
    ['c100', 'Collecting', 'Field biologist', 'Discover 100 creatures', count('creatures', 100)],
    ['c250', 'Collecting', 'Expedition leader', 'Discover 250 creatures', count('creatures', 250)],
    ['c500', 'Collecting', 'Walking encyclopedia', 'Discover 500 creatures', count('creatures', 500)],
    ['c1000', 'Collecting', 'Tree of life', 'Discover 1,000 creatures', count('creatures', 1000)],
    ['c2500', 'Collecting', 'Darwin would be proud', 'Discover 2,500 creatures', count('creatures', 2500)],
    ['g10', 'Collecting', 'Signposts', 'Discover 10 groups', count('groups', 10)],
    ['g50', 'Collecting', 'Map maker', 'Discover 50 groups', count('groups', 50)],
    ['g150', 'Collecting', 'Cartographer of life', 'Discover 150 groups', count('groups', 150)],

    ['mammal', 'All sorts', 'Furry friend', 'Discover a mammal', t => [+t.within.has(MAMMALS), 1]],
    ['bird', 'All sorts', 'Birdwatcher', 'Discover a bird', t => [+t.within.has(BIRDS), 1]],
    ['reptile', 'All sorts', 'Cold blooded', 'Discover a reptile', t => [+t.within.has(REPTILES), 1]],
    ['amphibian', 'All sorts', 'Ribbit', 'Discover an amphibian', t => [+t.within.has(AMPHIBIANS), 1]],
    ['fish', 'All sorts', 'Something fishy', 'Discover a ray-finned fish', t => [+t.within.has(FISHES), 1]],
    ['insect', 'All sorts', 'Creepy crawly', 'Discover an insect', t => [+t.within.has(INSECTS), 1]],
    ['spider', 'All sorts', 'Eight legs', 'Discover a spider', t => [+t.within.has(SPIDERS), 1]],
    ['mollusc', 'All sorts', 'Shell suit', 'Discover a mollusc', t => [+t.within.has(MOLLUSCS), 1]],
    ['crustacean', 'All sorts', 'Pinch', 'Discover a crustacean', t => [+t.within.has(CRUSTACEANS), 1]],
    ['backbones', 'All sorts', 'Backbone collection', 'Discover a mammal, a bird, a reptile, an amphibian and a fish', t => [BACKBONES.filter(g => t.within.has(g)).length, 5]],
    ['sizes', 'All sorts', 'Great and small', 'Discover a creature over a tonne and one under a gram', t => [+!!t.tonne + +!!t.tiny, 2]],

    ['fossil', 'Deep time', 'Fossil hunter', 'Discover a creature that has died out', count('extinct', 1)],
    ['extinct10', 'Deep time', 'Into the past', 'Discover 10 creatures that have died out', count('extinct', 10)],
    ['extinct50', 'Deep time', 'Palaeontologist', 'Discover 50 creatures that have died out', count('extinct', 50)],
    ['dino', 'Deep time', 'Dinosaur hunter', 'Discover 5 dinosaurs that have died out (birds don\'t count)', count('dinos', 5)],
    ['ancient', 'Deep time', 'Older than dinosaurs', 'Discover a creature whose oldest fossils are over 252 million years old', count('ancient', 1)],
    ['recent', 'Deep time', 'Only just missed them', 'Discover a creature that died out within the last 12,000 years', count('recent', 1)],
    ['iceage', 'Deep time', 'Ice age', 'Discover the mammoths and the Neanderthals', t => all([36715, 40171])],

    ['mirror', 'Family', 'Mirror, mirror', 'Find us: humans', t => [+has(HUMAN), 1]],
    ['apes', 'Family', 'Great apes', 'Find humans, chimpanzees, bonobos, gorillas and orangutans', t => all(APES)],
    ['cats', 'Family', 'Big cats', 'Find the lion, tiger, leopard, jaguar and snow leopard', t => all(BIG_CATS)],
    ['cousin', 'Family', 'Hello, cousin', 'Compare humans with another creature', stat('humanCompared', 1)],
    ['close', 'Family', 'Close family', 'Compare two creatures whose family lines meet in a genus', stat('closeCompared', 1)],
    ['far', 'Family', 'Long lost cousins', 'Compare two creatures that went their separate ways over 500 million years ago', stat('farCompared', 1)],
    ['goliath', 'Family', 'David and Goliath', 'Compare two creatures, one a million times heavier than the other', stat('goliath', 1)],
    ['heavy', 'Family', 'Heavyweight', 'Discover a creature that weighs over 10 tonnes', count('heavy', 1)],
    ['deep', 'Family', 'Deep diver', 'Discover a creature 20 steps from the first life', t => [Math.min(t.deepest, 20), 20]],
    ['every', 'Family', 'Every last branch', 'Bring out every branch of a group with at least 30 of them', stat('everyBranch', 1)],
    ['complete', 'Family', 'Completionist', 'Discover every branch of a group with at least 10 branches', count('full', 1)],

    ['hunt', 'Games', 'On the hunt', 'Win a hunt', stat('huntsWon', 1)],
    ['huntEasy', 'Games', 'Little explorer', 'Win an easy hunt', stat('hunt-easy', 1)],
    ['huntNormal', 'Games', 'Tracker', 'Win a normal hunt', stat('hunt-normal', 1)],
    ['huntHard', 'Games', 'Naturalist\'s eye', 'Win a hard hunt', stat('hunt-hard', 1)],
    ['huntExpert', 'Games', 'Professor', 'Win an expert hunt', stat('hunt-expert', 1)],
    ['straight', 'Games', 'Straight there', 'Win a hunt without a single wrong turn or hint', stat('perfectHunts', 1)],
    ['hunt10', 'Games', 'Bloodhound', 'Win 10 hunts', stat('huntsWon', 10)],
    ['closer8', 'Games', 'Family resemblance', 'Score 8 or more in Closer cousins', stat('closerBest8', 1)],
    ['closer10', 'Games', 'Perfect pedigree', 'Score 10 out of 10 in Closer cousins', stat('closerBest10', 1)],
    ['which8', 'Games', 'Quick thinker', 'Score 8 or more in Which one?', stat('whichBest8', 1)],
    ['which10', 'Games', 'Know-it-all', 'Score 10 out of 10 in Which one?', stat('whichBest10', 1)],
    ['quizHard', 'Games', 'Sharp eye', 'Score 8 or more in a hard or expert quiz', stat('quizHard8', 1)],
    ['quizExpert', 'Games', 'Peer reviewed', 'Score 8 or more in an expert quiz', stat('quizExpert8', 1)],
  ];
  LIST.push(['thirty', 'Games', 'Overachiever', 'Earn 30 other achievements', () => [Math.min(Object.keys(got).filter(id => id !== 'thirty').length, 30), 30]]);
  const SECTIONS = ['First steps', 'Collecting', 'All sorts', 'Deep time', 'Family', 'Games'];

  // anything newly earned: kept, cheered (unless quietly, the first time the list is checked)
  function check(quietly = false) {
    const t = api.hunting ? null : tally();
    const fresh = [];
    for (let pass = 0; pass < 2; pass++) {
      for (const [id, , name, , progress] of LIST) {
        if (got[id]) continue;
        // (a hunt's board isn't yours: only what doesn't need your tree is checked)
        if (!t && progress.length) continue;
        const [have, need] = progress(t);
        if (have >= need) { got[id] = Date.now(); fresh.push(name); }
      }
    }
    if (!fresh.length) return;
    store.set('distantCousinsAchievements', got);
    sayCount();
    if (quietly) {
      if (fresh.length > 1) setTimeout(() => api.cheer(`${fresh.length} achievements earned`, 'From the tree you\'ve grown so far. See them all in Achievements'), 1200);
      else setTimeout(() => api.cheer(`Achievement: ${fresh[0]}`, 'From the tree you\'ve grown so far'), 1200);
      return;
    }
    // (after the find's own sound)
    setTimeout(() => fresh.forEach(name => api.cheer(`Achievement: ${name}`, LIST.find(a => a[2] === name)[3])), 700);
  }

  // what the board and the games say happened
  const on = (type, fn) => document.addEventListener('dc:' + type, e => { fn(e.detail || {}); check(); });
  on('find', () => { });
  on('open', () => bump('opened'));
  on('favourite', () => bump('favourites'));
  on('surprise', () => bump('surprises'));
  on('search', () => bump('searches'));
  on('gap', () => bump('gaps'));
  on('latin', () => bump('latin'));
  on('theme', d => { if (d.dark) bump('night'); });
  on('tree-new', () => bump('treesStarted'));
  on('more', d => { const n = api.nodes.get(d.q); if (n && (n.k || []).length >= 30 && !api.items.has('more:' + d.q)) bump('everyBranch'); });
  on('compare', ({ a, b }) => {
    bump('compared');
    if (a === HUMAN || b === HUMAN) bump('humanCompared');
    const A = api.trail(a), B = api.trail(b);
    let i = 0;
    while (i < A.length && i < B.length && A[i] === B[i]) i++;
    const meet = api.nodes.get(A[i - 1]);
    if (meet && meet.r === 'genus' && i < A.length && i < B.length) bump('closeCompared');
    const split = Math.max(api.nodes.get(A[i])?.a ?? -1, api.nodes.get(B[i])?.a ?? -1);
    if (split >= 500) bump('farCompared');
    const ka = api.nodes.get(a)?.kg, kb = api.nodes.get(b)?.kg;
    if (ka && kb && Math.max(ka, kb) / Math.min(ka, kb) >= 1e6) bump('goliath');
  });
  on('hunt-won', ({ level, perfect }) => { bump('huntsWon'); bump('hunt-' + level); if (perfect) bump('perfectHunts'); });
  on('quiz-done', ({ game, level, score }) => {
    if (score >= 8) bump(game + 'Best8');
    if (score >= 10) bump(game + 'Best10');
    if (score >= 8 && (level === 'hard' || level === 'expert')) bump('quizHard8');
    if (score >= 8 && level === 'expert') bump('quizExpert8');
  });
  // what you'd already done before there were achievements is earned quietly, once the tree's loaded
  document.addEventListener('dc:ready', () => {
    // (already exploring at night counts too)
    if (document.documentElement.dataset.dcTheme === 'dark' && !stats.night) bump('night');
    check(!Object.keys(got).length);
  });

  // ---------- the list of them all ----------

  const box = $('dcAch'), body = $('dcAchBody');
  const win = api.dialog(box);
  // a little line drawing for each section
  const ICONS = {
    'First steps': '<path d="M6 21V4M6 4.5h11l-2.5 4 2.5 4H6"/>',
    'Collecting': '<path d="M12 21V11M12 11c-4 0-6-3-6-6 3 0 6 2 6 6zM12 14c3 0 5.5-2 5.5-5-3 0-5.5 2-5.5 5z"/>',
    'All sorts': '<circle cx="7" cy="8" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="17" cy="8" r="2"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5c0 2-2 2-4 2s-4 0-4-2z"/>',
    'Deep time': '<path d="M5 19l4-4M15 5c2 0 4 2 4 4l-8 8c-2 0-4-2-4-4z"/><circle cx="16" cy="8" r=".8"/>',
    'Family': '<circle cx="12" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M12 7v5M6 17v-2h12v2M12 12v3"/>',
    'Games': '<path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.4l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
  };
  function sayCount() {
    const n = Object.keys(got).length;
    $('dcAchCount').textContent = `${n}/${LIST.length}`;
  }
  function render() {
    const t = api.hunting ? null : tally();
    const earned = LIST.filter(a => got[a[0]]).length;
    let html = `<div class="dc-ach-sum"><p><b>${earned}</b> of ${LIST.length} earned</p><span class="dc-ach-bar"><i style="width:${(earned / LIST.length * 100).toFixed(1)}%"></i></span></div>`;
    for (const section of SECTIONS) {
      html += `<h3 class="dc-ach-head"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[section]}</svg>${section}</h3><ul class="dc-ach-list">`;
      for (const [id, s, name, how, progress] of LIST) {
        if (s !== section) continue;
        const done = !!got[id];
        const [have, need] = done || !t && progress.length ? [1, 1] : progress(t);
        const bar = !done && need > 1 && (t || !progress.length) ? `<span class="dc-ach-progress"><span class="dc-ach-bar"><i style="width:${(have / need * 100).toFixed(1)}%"></i></span>${fmt(have)}/${fmt(need)}</span>` : '';
        html += `<li class="dc-ach${done ? ' is-done' : ''}"><span class="dc-ach-badge" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONS[section]}</svg></span>
          <span class="dc-ach-words"><b>${esc(name)}</b><span>${esc(how)}</span>${bar}</span>
          <span class="dc-sr">${done ? 'Earned' : 'Not earned yet'}</span></li>`;
      }
      html += '</ul>';
    }
    body.innerHTML = html;
  }
  $('dcAchOpen').addEventListener('click', () => { render(); win.show(); });
  sayCount();
})();
