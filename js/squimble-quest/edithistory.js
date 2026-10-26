// the map editor's undo and redo, and keeping maps safe until they're saved (editor.js).
//
// undo works by noticing rather than being told. after anything that might have changed the map (a
// mouse button let go, a key, a box closing...) check() compares the map's design (designOf()) with
// how it was, and if it's different the old one goes on the undo list. so a whole drag of painting is
// one undo, a settings box is one undo when it closes, and nothing else has to remember to tell it.
// each map keeps its own lists until the page reloads. it covers the map: tiles, size, objects,
// characters, warps, sound blocks, areas, the spawn, its atmosphere, items placed on the ground and what
// starts in chests.
// it doesn't cover tiles', sounds' or items' own settings, which have their own boxes and Cancel
//
// saving: at the same times the map's file text (mapToData() in mapfile.js) is compared with how it
// was when it loaded or was last saved. while they're different the map is unsaved (a dot by its name
// in the menu bar), and a copy is kept in this browser (localStorage, MAP_DRAFT_PREFIX + its name), so
// reloading or closing the page doesn't lose it. Save and Save as (File menu, editormenu.js) download
// the file like Export always did, and throw the copy away. after a reload, File > Recover unsaved
// changes lists the copies to bring back or throw away

// the most undos each map keeps, and the most seconds between checks while nothing seems to happen
// (in case something changed the map without a click or key, like the eyedropper)
const EDIT_HISTORY = { limit: 200, checkEvery: 2 };
const MAP_DRAFT_PREFIX = 'sq-map-draft:';

const EditHistory = {
  // each map's { undo, redo, design, key, savedText, unsaved }: the designs before each change and
  // after each undo, the design now and its text (designKey()), the file text it was loaded or saved
  // with, and whether it's different now
  maps: new WeakMap(),
  sinceCheck: 0,
  // names of unsaved maps whose copy couldn't be kept (storage full or blocked), so closing the page
  // warns (sketch.js)
  notKept: new Set(),

  // a map's lists, started the first time the editor sees it. savedText is what counts as saved
  of(map) {
    return this.maps.get(map) ?? this.start(map, mapFileText(map));
  },

  start(map, savedText) {
    const design = designOf(map);
    const text = mapFileText(map);
    const history = { undo: [], redo: [], design, key: designKey(design), savedText, unsaved: text !== savedText };
    this.maps.set(map, history);
    // never throws a copy away here: one from last time stays until this map changes or is saved
    if (history.unsaved) this.keepCopy(map.name, text);
    return history;
  },

  // every frame the editor's open with nothing else going on (Editor.update()). it checks straight
  // after a click, key or box closing, and every few seconds otherwise
  update(map, dt, nudged) {
    this.sinceCheck += dt;
    if (!nudged && this.sinceCheck < EDIT_HISTORY.checkEvery) return;
    this.check(map);
  },

  // if the map's design has changed, the old one goes on the undo list and redo is forgotten
  check(map) {
    this.sinceCheck = 0;
    const history = this.of(map);
    const design = designOf(map);
    const key = designKey(design);
    if (key === history.key) return;
    history.undo.push(history.design);
    if (history.undo.length > EDIT_HISTORY.limit) history.undo.shift();
    history.redo = [];
    history.design = design;
    history.key = key;
    this.updateSaved(map, history);
  },

  canUndo(map) {
    return this.of(map).undo.length > 0;
  },

  canRedo(map) {
    return this.of(map).redo.length > 0;
  },

  // goes back one change (or forward one, with redo). gives back whether there was one
  undo(map) {
    return this.step(map, 'undo', 'redo');
  },

  redo(map) {
    return this.step(map, 'redo', 'undo');
  },

  step(map, from, to) {
    // a change that hasn't been noticed yet counts first
    this.check(map);
    const history = this.of(map);
    if (history[from].length === 0) return false;
    history[to].push(history.design);
    restoreDesign(map, history[from].pop());
    history.design = designOf(map);
    history.key = designKey(history.design);
    this.updateSaved(map, history);
    return true;
  },

  // after a play test, so whatever happened in the game (items picked up) doesn't count as a change
  rebase(map) {
    const history = this.of(map);
    history.design = designOf(map);
    history.key = designKey(history.design);
  },

  // the map was just exported, so this is saved now
  markSaved(map) {
    const history = this.of(map);
    history.savedText = mapFileText(map);
    this.updateSaved(map, history);
  },

  isUnsaved(map) {
    return this.of(map).unsaved;
  },

  updateSaved(map, history) {
    const text = mapFileText(map);
    history.unsaved = text !== history.savedText;
    this.keepCopy(map.name, history.unsaved ? text : null);
  },

  // keeps a copy of a map's file text in this browser, or throws it away (text null)
  keepCopy(name, text) {
    try {
      if (text === null) localStorage.removeItem(MAP_DRAFT_PREFIX + name);
      else localStorage.setItem(MAP_DRAFT_PREFIX + name, JSON.stringify({ time: Date.now(), text }));
      this.notKept.delete(name);
    } catch (e) {
      if (text !== null) this.notKept.add(name);
    }
  },

  // every copy kept from before, as [{ name, time, text }], newest first. ones that are the same as
  // their map's file now (it was saved and put in place) are thrown away quietly
  copies() {
    const found = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key.startsWith(MAP_DRAFT_PREFIX)) continue;
        const { time, text } = JSON.parse(localStorage.getItem(key));
        found.push({ name: key.slice(MAP_DRAFT_PREFIX.length), time, text });
      }
    } catch (e) {
      return [];
    }
    return found.filter((copy) => {
      const map = MAPS[copy.name] && getMap(copy.name); // maps.js
      // a map that's changed since the page loaded keeps its own copy up to date, so that one's live
      if (map && this.maps.has(map) && (this.isUnsaved(map) || this.of(map).undo.length > 0)) return false;
      if (map && mapFileText(map) === copy.text) {
        this.keepCopy(copy.name, null);
        return false;
      }
      return true;
    }).sort((a, b) => b.time - a.time);
  },

  // brings a kept copy back and goes to it. it's still unsaved, until it's saved
  recover(name) {
    const copy = this.copies().find((other) => other.name === name);
    if (!copy) return;
    // what the map's file says, which is what counts as saved (none for a map that was never saved)
    const fileText = MAPS[name] ? mapFileText(getMap(name)) : null;
    if (!registerMap(name, JSON.parse(copy.text))) return showMessage(`Couldn't bring back ${name}, the console says why`); // mapfile.js
    loadMap(name); // sketch.js
    this.start(worldMap, fileText);
    showMessage(`Brought back ${name}. Save it (Ctrl + S) to keep it for good`);
  },

  // throws a kept copy away, and the changes with it
  discard(name) {
    this.keepCopy(name, null);
  },
};

// ---------- a map's design ----------

// a copy of everything on a map that's design (and items on the ground), safe to keep while the map
// changes. chests keep the same inventory, so undoing an erased chest brings back what was in it
function designOf(map) {
  const plain = (list) => JSON.parse(JSON.stringify(list));
  return {
    left: map.left,
    top: map.top,
    cols: map.cols,
    rows: map.rows,
    tiles: map.tiles.slice(),
    spawn: { x: map.spawn.x, y: map.spawn.y },
    atmosphere: map.atmosphere,
    areas: plain(map.areas),
    objects: map.objects.map((obj) => ({ ...obj })),
    enemySpawns: plain(map.enemySpawns),
    npcSpawns: plain(map.npcSpawns),
    warps: plain(map.warps),
    sounds: plain(map.sounds),
    // the same entries, not copies, since the drops on the ground know theirs by which one it is
    // (placed, inventory.js). nothing changes an entry, only adds or removes it
    items: map.items.slice(),
    drops: map.drops.slice(),
  };
}

// a design as text, to tell whether anything's changed. items on the ground count by their tile, so
// one being thrown doesn't count as a change every frame
function designKey(design) {
  return JSON.stringify({
    ...design,
    objects: design.objects.map(({ type, col, row, items }) => [type, col, row, items]),
    drops: design.drops.map((drop) => [drop.item.type.name, Math.floor(drop.x / TILE), Math.floor(drop.y / TILE)]),
  });
}

// puts a design back on the map (copying it again, so the one on the undo list stays as it was)
function restoreDesign(map, design) {
  const copy = designOf(design);
  copy.tiles = copy.tiles.map(resolveTileName); // a tile renamed since (tiles.js)
  Object.assign(map, copy);
  map.updateSolidCells();
  gameCamera.bounds = map.bounds(); // sketch.js
  Editor.view.x = constrain(Editor.view.x, map.bounds().left, map.bounds().right);
  Editor.view.y = constrain(Editor.view.y, map.bounds().top, map.bounds().bottom);
  spawnCharacters();
}

// the text of a map's file (mapfile.js), which is what Save would download
function mapFileText(map) {
  return JSON.stringify(mapToData(map));
}

// ---------- recovering ----------

// File > Recover unsaved changes: a box with a row for each kept copy (EditHistory.copies()), each
// picking whether to bring it back, throw it away or leave it for now
function openRecoverBox() {
  const copies = EditHistory.copies();
  if (copies.length === 0) return showMessage('There are no unsaved changes from before to bring back');
  const choices = copies.map((copy) => new Picker({
    w: 180,
    choices: ['recover', 'later', 'discard'],
    value: 'recover',
    label: (choice) => ({ recover: 'bring back', later: 'leave for now', discard: 'throw away' })[choice],
  }));
  const ago = (time) => {
    const minutes = Math.round((Date.now() - time) / 60000);
    return minutes < 60 ? `${minutes} min ago` : minutes < 60 * 48 ? `${Math.round(minutes / 60)} hours ago` : `${Math.round(minutes / 1440)} days ago`;
  };
  FormBox.open({
    title: 'Recover unsaved changes',
    hint: 'Bringing one back goes to it. Only one can be brought back at a time',
    confirmLabel: 'Done',
    rows: copies.slice(0, 8).map((copy, i) => ({ label: copy.name, field: choices[i], tip: `Changed ${ago(copy.time)}${MAPS[copy.name] ? '' : ', never saved'}` })),
    onConfirm: () => {
      copies.slice(0, 8).forEach((copy, i) => {
        if (choices[i].value === 'discard') EditHistory.discard(copy.name);
      });
      const first = copies.slice(0, 8).find((copy, i) => choices[i].value === 'recover');
      if (first) EditHistory.recover(first.name);
    },
  });
}
