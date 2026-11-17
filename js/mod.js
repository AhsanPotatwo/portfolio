// the site's mod page (mod.html). sign in with a mod key and see a tab for each project you look after: for
// now that's catpi corner's notice board. the owner (the server's BOSS_KEY) also gets a Mods tab, to make keys
// for people, choose which projects each mod looks after, give someone a new key, or remove them.
// the server side is server/src/mods.js, and each project's own routes (server/src/board.js).
(() => {
  const $ = (s) => document.querySelector(s);
  const SERVER = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://127.0.0.1:8787' : 'https://portfolio-server.portfolio-server.workers.dev';
  const KEY = 'siteModKey';
  const store = {
    get: () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
    set: (v) => { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch { } },
  };
  let key = store.get();
  let me = null, projects = {}, tab = null;
  const say = (text) => { $('#modSay').textContent = text; };
  const sentence = (e) => (e.status ? e.message[0].toUpperCase() + e.message.slice(1) + '.' : "Couldn't reach the server. Try again in a bit.");

  async function call(path, body) {
    const r = await fetch(SERVER + path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || 'something went wrong'), { status: r.status });
    return data;
  }
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (label, cls, onClick) => { const b = el('button', `mod-btn ${cls || ''}`, label); b.type = 'button'; b.addEventListener('click', onClick); return b; };
  const ago = (ms) => {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const m = (Date.now() - ms) / 60000;
    return m < 60 ? rtf.format(-Math.round(m), 'minute') : m < 2880 ? rtf.format(-Math.round(m / 60), 'hour') : rtf.format(-Math.round(m / 1440), 'day');
  };
  const day = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  // ---------- signing in ----------
  async function signIn() {
    say('Signing in...');
    try {
      const d = await call('/mod');
      me = d.you;
      projects = d.projects;
      say('');
      $('#modSignIn').hidden = true;
      $('#modIn').hidden = false;
      $('#modLede').hidden = true;
      $('#modYou').textContent = me.owner ? "Signed in as the owner. You look after everything, and choose who else does." : `Signed in as ${me.name}.`;
      tabs(d);
    } catch (e) {
      if (e.status === 401) { key = null; store.set(null); say("That key doesn't work. It might have been changed or removed."); }
      else say(sentence(e));
    }
  }
  $('#modSignIn').addEventListener('submit', (e) => {
    e.preventDefault();
    key = $('#modKey').value.trim();
    $('#modKey').value = '';
    if (!key) return;
    store.set(key);
    signIn();
  });
  $('#modOut').addEventListener('click', () => {
    key = null; me = null;
    store.set(null);
    $('#modIn').hidden = true;
    $('#modSignIn').hidden = false;
    $('#modLede').hidden = false;
    say('Signed out.');
  });

  // ---------- tabs: a project each, and the mods for the owner ----------
  const PANELS = { 'catpi-board': catpiBoard };
  function tabs(d) {
    const list = me.projects.map((id) => ({ id, name: projects[id] }));
    if (me.owner) list.push({ id: 'mods', name: 'Mods' });
    const row = $('#modTabs');
    row.replaceChildren(...list.map((t) => {
      const b = el('button', 'mod-tab', t.name);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.id = t.id;
      b.addEventListener('click', () => open(t.id));
      return b;
    }));
    if (!list.length) { $('#modPanel').replaceChildren(el('p', 'mod-hint', "You're a mod, but you haven't been given anything to look after yet.")); return; }
    open(list.some((t) => t.id === tab) ? tab : list[0].id, d);
  }
  function open(id, d) {
    tab = id;
    for (const b of $('#modTabs').children) b.setAttribute('aria-selected', b.dataset.id === id);
    const panel = $('#modPanel');
    panel.replaceChildren(el('p', 'mod-hint', 'Loading...'));
    if (id === 'mods') modsPanel(panel, d);
    else if (PANELS[id]) PANELS[id](panel);
    else panel.replaceChildren(el('p', 'mod-hint', 'Nothing to look after here yet.'));
  }

  // ---------- catpi corner's notice board ----------
  const ready = Promise.all([document.fonts.load('700 34px Gaegu'), Catpis.load()]);
  async function catpiBoard(panel) {
    let d;
    try { [d] = await Promise.all([call('/board/mod'), ready]); } catch (e) { panel.replaceChildren(el('p', 'mod-say', sentence(e))); return; }
    if (tab !== 'catpi-board') return;
    const act = async (n, what, card) => {
      if (what === 'bin' && !confirm(`Remove note ${n.id} for good? It can't be put back.`)) return;
      for (const b of card.querySelectorAll('button')) b.disabled = true;
      try { await call('/board/mod', { do: what, id: n.id }); catpiBoard(panel); }
      catch (e) { say(sentence(e)); for (const b of card.querySelectorAll('button')) b.disabled = false; }
    };
    const card = (n, buttons, line) => {
      const li = el('li', 'mod-note');
      const pic = Art.noteCanvas(n.note, 440, n.id);
      pic.removeAttribute('aria-hidden');
      pic.setAttribute('role', 'img');
      pic.setAttribute('aria-label', Art.describe(n.note));
      const row = el('div', 'mod-row-btns');
      for (const [label, what, cls] of buttons) row.append(btn(label, cls, () => act(n, what, li)));
      li.append(pic, el('p', 'mod-hint', `Note ${n.id}, sent ${ago(n.made)}${line && n.by ? `. ${line} ${n.by === 'owner' ? 'the owner' : n.by}` : ''}`), row);
      return li;
    };
    const group = (title, notes, empty, buttons, line) => {
      const box = el('div', 'mod-group');
      box.append(el('h2', 'mod-h', `${title}${notes.length ? ` (${notes.length})` : ''}`));
      if (!notes.length) box.append(el('p', 'mod-hint', empty));
      else { const ul = el('ul', 'mod-notes'); ul.append(...notes.map((n) => card(n, buttons, line))); box.append(ul); }
      return box;
    };
    panel.replaceChildren(
      el('p', 'mod-hint', 'Notes wait here until someone pins them up. Archived notes are off the board but kept, so they can go back up. Removed notes are gone for good.'),
      group('Waiting', d.waiting, 'Nothing waiting. All read.', [['Pin it up', 'pin', 'is-go'], ['Archive', 'archive'], ['Remove', 'bin', 'is-bye']]),
      group('On the board', d.pinned, 'Nothing on the board yet.', [['Archive', 'archive'], ['Remove', 'bin', 'is-bye']], 'Pinned by'),
      group('Archive', d.archived, 'Nothing archived.', [['Put it back up', 'pin', 'is-go'], ['Remove', 'bin', 'is-bye']], 'Archived by'),
    );
  }

  // ---------- the mods, for the owner ----------
  function ticks(chosen, onChange) {
    const box = el('div', 'mod-ticks');
    for (const [id, name] of Object.entries(projects)) {
      const label = el('label', 'mod-tick');
      const input = el('input');
      input.type = 'checkbox';
      input.value = id;
      input.checked = chosen.includes(id);
      if (onChange) input.addEventListener('change', () => onChange([...box.querySelectorAll('input:checked')].map((i) => i.value), label));
      label.append(input, el('span', null, name));
      box.append(label);
    }
    return box;
  }
  // a new key, shown once
  function showKey(where, name, k) {
    const box = el('div', 'mod-newkey');
    box.append(el('p', null, `Send this key to ${name}. They sign in on this page (mod.html) with it. It's only shown this once: if they lose it, give them a new one.`));
    const row = el('div', 'mod-row');
    const code = el('input');
    code.readOnly = true;
    code.value = k;
    code.setAttribute('aria-label', `${name}'s key`);
    const copy = btn('Copy', 'is-go', async () => {
      try { await navigator.clipboard.writeText(k); copy.textContent = 'Copied'; } catch { code.select(); }
      setTimeout(() => { copy.textContent = 'Copy'; }, 1600);
    });
    row.append(code, copy);
    box.append(row);
    where.querySelector('.mod-newkey')?.remove();
    where.append(box);
  }
  async function modsPanel(panel, d) {
    if (!d || !d.mods) {
      try { d = await call('/mod'); } catch (e) { panel.replaceChildren(el('p', 'mod-say', sentence(e))); return; }
    }
    if (tab !== 'mods') return;
    const list = el('ul', 'mod-list');
    for (const m of d.mods) {
      const li = el('li', 'mod-card mod-person');
      const head = el('div', 'mod-person-head');
      const who = el('div');
      who.append(el('strong', null, m.name), el('span', 'mod-hint', `mod since ${day(m.made)}`));
      const row = el('div', 'mod-row-btns');
      row.append(
        btn('New key', '', async () => {
          if (!confirm(`Give ${m.name} a new key? Their old one stops working.`)) return;
          try { const r = await call('/mod', { do: 'new key', name: m.name }); showKey(li, m.name, r.key); } catch (e) { say(sentence(e)); }
        }),
        btn('Remove', 'is-bye', async () => {
          if (!confirm(`Remove ${m.name} as a mod? Their key stops working straight away.`)) return;
          try { await call('/mod', { do: 'remove mod', name: m.name }); li.remove(); if (!list.children.length) modsPanel(panel); } catch (e) { say(sentence(e)); }
        }),
      );
      head.append(who, row);
      li.append(head, el('p', 'mod-small', 'Looks after:'), ticks(m.projects, async (chosen, label) => {
        try { await call('/mod', { do: 'set projects', name: m.name, projects: chosen }); label.classList.add('is-saved'); setTimeout(() => label.classList.remove('is-saved'), 1200); }
        catch (e) { say(sentence(e)); }
      }));
      list.append(li);
    }
    const add = el('form', 'mod-card mod-add');
    const name = el('input');
    name.maxLength = 20;
    name.autocomplete = 'off';
    name.placeholder = 'Their name';
    name.id = 'modNewName';
    const label = el('label', null, 'Make someone a mod');
    label.htmlFor = 'modNewName';
    const pick = ticks(Object.keys(projects).slice(0, 1));
    const row = el('div', 'mod-row');
    const go = el('button', 'mod-btn is-go', 'Make their key');
    go.type = 'submit';
    row.append(name, go);
    add.append(label, row, el('p', 'mod-small', 'They can look after:'), pick);
    add.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!name.value.trim()) { name.focus(); return; }
      try {
        const r = await call('/mod', { do: 'add mod', name: name.value, projects: [...pick.querySelectorAll('input:checked')].map((i) => i.value) });
        say('');
        await modsPanel(panel);
        showKey($('#modPanel .mod-add'), r.name, r.key);
      } catch (err) { say(sentence(err)); }
    });
    panel.replaceChildren(
      el('p', 'mod-hint', "Each mod has their own key and only sees the projects ticked for them. You're the owner: you see everything, and you're the only one who sees this tab."),
      d.mods.length ? list : el('p', 'mod-hint', 'No mods yet.'),
      add,
    );
  }

  if (key) signIn();
  else $('#modKey').focus();
})();
