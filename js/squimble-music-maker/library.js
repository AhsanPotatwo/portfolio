// ================================== squimble music maker: the library ==================================
//
// where saved songs are kept, made so a song is hard to lose:
//   - a save keeps the song's settings and the notes it played (packed, with a fingerprint). the
//     composer still writes notes from the settings, but if they ever come out different the page
//     plays the saved ones (maker.js, frozen)
//   - saving over a song keeps the one before in its history (versions)
//   - the bin: a binned song is only gone once it's deleted from there
//   - a backup is one file of everything. restoring only adds: a song in both keeps the saves of each
//   - a song file is one song and its notes, to send to someone (songFile). restoring it adds it
//   - kept in indexeddb, with every song's latest settings copied into local storage in case the
//     database won't open. the old local storage library (by name) is moved over once
// no page in here: maker.js draws it ("library and backups"). tests/library-check.js runs it in node

const LIBRARY = {
  db: 'squimble-music',
  mirror: 'squimble-music-library-2',
  old: 'squimble-music-library',
  moved: 'squimble-music-library-moved',
  // earlier saves kept per song. settings are a few kilobytes, so this is still small
  versions: 40,
};

// ---------- notes, packed ----------

// json with numbers to four places (a ten thousandth of a beat is nothing), so the same notes always
// pack and fingerprint the same. the page's links use it too
const notesJson = (thing) => JSON.stringify(thing, (key, value) => (typeof value === 'number' ? +value.toFixed(4) : value));
// a fingerprint (cyrb53): two sets of notes sharing one is a one in billions chance
function notesPrint(notes) {
  const text = notesJson(notes);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const squeezeBytes = async (bytes, way) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(way)).arrayBuffer());
// deflated where the browser can (a few tens of kilobytes a song), plain json where it can't
async function packNotes(notes) {
  const text = notesJson(notes);
  if (typeof CompressionStream === 'undefined') return text;
  try {
    return await squeezeBytes(new TextEncoder().encode(text), new CompressionStream('deflate-raw'));
  } catch {
    return text;
  }
}
// back to notes, or null if they aren't notes the player can play (a broken file): the song then plays
// as the composer writes it
async function unpackNotes(packed) {
  try {
    const text = typeof packed === 'string' ? packed : new TextDecoder().decode(await squeezeBytes(packed, new DecompressionStream('deflate-raw')));
    const notes = JSON.parse(text);
    const fine = Array.isArray(notes) && notes.every((note) => note && typeof note.layer === 'string' && ['t', 'dur', 'midi', 'vel'].every((key) => Number.isFinite(note[key])));
    return fine ? notes : null;
  } catch {
    return null;
  }
}
// bytes to base64 and back (in chunks: spreading a big array into one call overflows the stack)
const bytesToText = (bytes) => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};
const textToBytes = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
// an entry as json can carry it: packed notes as 'b64:...' text, and back
const portable = (entry) => (entry.notes && typeof entry.notes !== 'string' ? { ...entry, notes: `b64:${bytesToText(entry.notes)}` } : entry);
function fromPortable(raw) {
  if (!raw || typeof raw.notes !== 'string' || !raw.notes.startsWith('b64:')) return raw;
  try {
    return { ...raw, notes: textToBytes(raw.notes.slice(4)) };
  } catch {
    return { ...raw, notes: undefined };
  }
}

// ---------- merging ----------

// one song's saves from two places (this browser and a backup, or the database and its copy): every save
// either has, newest first. a save is known by when it was made, so the same save twice is kept once.
// only the newest keeps its notes; the bin is whatever the place with the newest save says
function mergeEntries(a, b) {
  const saves = [];
  for (const entry of [a, b]) {
    saves.push({ from: entry, name: entry.name, song: entry.song, saved: entry.saved, notes: entry.notes, print: entry.print });
    for (const one of entry.versions || []) saves.push({ from: entry, name: one.name, song: one.song, saved: one.saved });
  }
  saves.sort((x, y) => y.saved - x.saved || (y.notes ? 1 : 0) - (x.notes ? 1 : 0));
  const kept = saves.filter((one, i) => i === saves.findIndex((other) => other.saved === one.saved));
  const [top, ...rest] = kept;
  return {
    id: a.id,
    name: top.name,
    created: Math.min(a.created || a.saved, b.created || b.saved),
    saved: top.saved,
    song: top.song,
    ...(top.notes ? { notes: top.notes, print: top.print } : {}),
    versions: rest.slice(0, LIBRARY.versions).map(({ name, song, saved }) => ({ name, song, saved })),
    ...(top.from.binned ? { binned: top.from.binned } : {}),
  };
}
// a song entry from outside (a file, local storage), or null if it isn't one
function cleanEntry(raw) {
  if (!raw || typeof raw !== 'object' || !raw.song || typeof raw.song !== 'object' || typeof raw.id !== 'string') return null;
  const time = (value) => (Number.isFinite(value) && value > 0 ? value : Date.now());
  return {
    id: raw.id.slice(0, 40),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 40) : 'Untitled',
    created: time(raw.created ?? raw.saved),
    saved: time(raw.saved),
    song: raw.song,
    ...(raw.notes && typeof raw.print === 'string' ? { notes: raw.notes, print: raw.print } : {}),
    versions: (Array.isArray(raw.versions) ? raw.versions : []).filter((one) => one && one.song && typeof one.song === 'object').slice(0, LIBRARY.versions)
      .map((one) => ({ name: typeof one.name === 'string' ? one.name.slice(0, 40) : 'Untitled', song: one.song, saved: time(one.saved) })),
    ...(Number.isFinite(raw.binned) ? { binned: raw.binned } : {}),
  };
}
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ---------- the library ----------

class SongLibrary {
  constructor() {
    this.songs = new Map();
    this.db = null;
    this.ready = false;
    // other tabs with the page open hear about every change and read it again (onchange)
    this.channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('squimble-music-library');
    this.onchange = null;
    if (this.channel) this.channel.onmessage = () => this.reload().then(() => this.onchange?.());
  }

  // the database, or null if the browser won't give one (some private windows). an old safari could
  // leave opening hanging, so it gives up after a few seconds
  openDb() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 4000);
      try {
        const request = indexedDB.open(LIBRARY.db, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('songs', { keyPath: 'id' });
        request.onsuccess = () => { clearTimeout(timer); resolve(request.result); };
        request.onerror = () => { clearTimeout(timer); resolve(null); };
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }
  async start() {
    this.db = await this.openDb();
    await this.reload();
    // anything only the local storage copy has (the database was cleared, or wouldn't take a write)
    const mirror = this.readMirror();
    for (const raw of Object.values(mirror)) {
      const entry = cleanEntry(raw);
      if (!entry) continue;
      const here = this.songs.get(entry.id);
      if (!here) await this.put(entry);
      else if (entry.saved > here.saved) await this.put(mergeEntries(here, entry));
    }
    // the old library (one local storage key, by name), moved over once. the id comes from the name, so
    // two tabs opening at once move each song to the same place
    try {
      if (!localStorage.getItem(LIBRARY.moved)) {
        const old = JSON.parse(localStorage.getItem(LIBRARY.old) || '{}');
        for (const [name, one] of Object.entries(old && typeof old === 'object' ? old : {})) {
          if (!one || typeof one.song !== 'object' || !one.song) continue;
          const saved = Number.isFinite(one.saved) ? one.saved : Date.now();
          const id = `old-${notesPrint(name)}`;
          if (!this.songs.has(id)) await this.put({ id, name: name.slice(0, 40), created: saved, saved, song: one.song, versions: [] });
        }
        localStorage.setItem(LIBRARY.moved, '1');
      }
    } catch { /* storage off: nothing to move */ }
    this.ready = true;
    return this;
  }
  async reload() {
    if (!this.db) {
      this.songs = new Map(Object.values(this.readMirror()).map(cleanEntry).filter(Boolean).map((entry) => [entry.id, entry]));
      return;
    }
    try {
      const all = await new Promise((resolve, reject) => {
        const request = this.db.transaction('songs').objectStore('songs').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      this.songs = new Map(all.map((entry) => [entry.id, entry]));
    } catch { /* keep what's in memory */ }
  }

  readMirror() {
    try {
      const data = JSON.parse(localStorage.getItem(LIBRARY.mirror) || '{}');
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch {
      return {};
    }
  }
  // one song's latest settings into the copy (read, changed and written straight back, so two tabs
  // can't write over each other's songs). without a database it's the only copy, so it keeps history too
  writeMirror(entry, gone = false) {
    try {
      const mirror = this.readMirror();
      if (gone) delete mirror[entry.id];
      else {
        const { notes, print, versions, ...rest } = entry;
        mirror[entry.id] = this.db ? rest : { ...rest, versions: versions.slice(0, 10) };
      }
      localStorage.setItem(LIBRARY.mirror, JSON.stringify(mirror));
      return true;
    } catch {
      return false;
    }
  }
  // true if it's kept somewhere
  async put(entry) {
    this.songs.set(entry.id, entry);
    let kept = this.writeMirror(entry);
    if (this.db) {
      try {
        const tx = this.db.transaction('songs', 'readwrite');
        tx.objectStore('songs').put(entry);
        await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error); });
        kept = true;
      } catch { /* the copy has it, if it had room */ }
    }
    this.channel?.postMessage('changed');
    return kept;
  }

  get(id) { return this.songs.get(id); }
  // newest first: the shelf, or the bin
  list(binned = false) { return [...this.songs.values()].filter((entry) => !!entry.binned === binned).sort((a, b) => b.saved - a.saved); }
  // a name no other song has: the name, then "name 2", "name 3"...
  freeName(name, id) {
    const taken = (one) => [...this.songs.values()].some((entry) => entry.id !== id && entry.name.toLowerCase() === one.toLowerCase());
    if (!taken(name)) return name;
    const base = name.replace(/ \d+$/, '').slice(0, 36);
    let n = 2;
    while (taken(`${base} ${n}`)) n++;
    return `${base} ${n}`;
  }
  // saves a song over the one with this id (its last save goes in the history) or as a new one, with
  // the notes it plays now. the entry, or null if nothing would keep it
  async save(song, notes, id) {
    const here = id && this.songs.get(id);
    const name = this.freeName(song.name, here ? id : null);
    const now = Math.max(Date.now(), (here?.saved || 0) + 1);
    const saved = { ...song, name };
    const entry = {
      id: here ? id : newId(),
      name,
      created: here?.created || now,
      saved: now,
      song: saved,
      notes: await packNotes(notes),
      print: notesPrint(notes),
      versions: here ? [{ name: here.name, song: here.song, saved: here.saved }, ...here.versions].slice(0, LIBRARY.versions) : [],
    };
    if (!(await this.put(entry))) {
      this.songs.delete(entry.id);
      if (here) this.songs.set(id, here);
      return null;
    }
    // ask the browser not to clear it when space runs low (it may say no, or ask the person)
    const asked = globalThis.navigator?.storage?.persist?.();
    if (asked) asked.catch(() => {});
    return entry;
  }
  // notes for a song saved without them (before the library kept them)
  async addNotes(id, notes) {
    const entry = this.songs.get(id);
    if (!entry || entry.notes) return;
    await this.put({ ...entry, notes: await packNotes(notes), print: notesPrint(notes) });
  }
  notes(entry) { return entry.notes ? unpackNotes(entry.notes) : Promise.resolve(null); }
  async bin(id) { const entry = this.songs.get(id); if (entry) await this.put({ ...entry, binned: Date.now() }); }
  async unbin(id) {
    const entry = this.songs.get(id);
    if (!entry) return;
    const { binned, ...rest } = entry;
    await this.put({ ...rest, name: this.freeName(entry.name, id) });
  }
  // gone for good: only from the bin
  async destroy(id) {
    const entry = this.songs.get(id);
    if (!entry?.binned) return;
    this.songs.delete(id);
    this.writeMirror(entry, true);
    if (this.db) {
      try {
        const tx = this.db.transaction('songs', 'readwrite');
        tx.objectStore('songs').delete(id);
        await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error); });
      } catch { /* it'll still be in the bin */ }
    }
    this.channel?.postMessage('changed');
  }

  // ---------- backups and song files ----------

  // everything, as a file's json: songs, history, bin and notes
  backup() {
    return { squimble: 'music library', made: Date.now(), songs: [...this.songs.values()].map(portable) };
  }
  // one song as a file to share: its latest save and the notes it plays, no history or bin. it keeps the
  // song's id, so a newer file of the same song restores as a newer save of it, not a second song
  songFile(entry) {
    const { id, name, created, saved, song, notes, print } = portable(entry);
    return { squimble: 'music song', made: Date.now(), id, name, created, saved, song, ...(notes ? { notes, print } : {}) };
  }
  // adds a backup, a song file or a bare song's settings (the old song files) to the library, never
  // taking anything away: { added, merged, same, ids } (ids: every song it added or found)
  async restore(data) {
    const counts = { added: 0, merged: 0, same: 0, ids: [] };
    let entries = [];
    if (data?.squimble === 'music library' && Array.isArray(data.songs)) entries = data.songs;
    else if (data?.squimble === 'music song') entries = [data];
    else if (data && typeof data === 'object' && Array.isArray(data.layers) && Array.isArray(data.sections)) {
      const name = typeof data.name === 'string' && data.name.trim() ? data.name.slice(0, 40) : 'Untitled';
      entries = [{ id: newId(), name, saved: Date.now(), song: data }];
    } else throw new Error('not a backup or a song');
    for (const raw of entries) {
      const entry = cleanEntry(fromPortable(raw));
      if (!entry) continue;
      const here = this.songs.get(entry.id);
      counts.ids.push(entry.id);
      if (!here) {
        await this.put({ ...entry, name: this.freeName(entry.name, entry.id) });
        counts.added++;
      } else {
        const both = mergeEntries(here, entry);
        if (both.saved === here.saved && both.versions.length === here.versions.length) counts.same++;
        else {
          await this.put(both);
          counts.merged++;
        }
      }
    }
    return counts;
  }
}
