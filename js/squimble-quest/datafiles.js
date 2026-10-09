// the game's data files. every kind of thing (tiles, sounds, items, enemies...) has its own folder in
// assets/squimble-quest/, with a json file for each one named after it (enemies/grunt.json is the
// grunt) and an index.json listing their names in order:
//   ["grunt", "dummy"]
// a file is just the thing's settings, only the ones that aren't normal (each kind's defaults explain
// them), like enemies/grunt.json:
//   { "width": 28, "height": 50, "speed": 95, "ai": "smart" }
// maps work the same way, but their files have their own format (top of mapfile.js).
//
// to add one to the game: put its file in the folder and its name in that folder's index.json. that's
// all, whether it's a file you wrote, one someone sent you, or one the editor exported. the order in
// index.json is the order they load in and show in the editor's palette (and for tiles, which dual
// grid tile goes on top where two meet). `node js/squimble-quest/tests/data-check.js` lists any file
// that's missing from its index.json, or named there but missing.
//
// the editor's Export buttons download every file of their kinds that's new or changed since the page
// loaded (DataFiles.export()), and say which folder each one goes in and which names to add to
// index.json.
//
// to add a new kind of data: a folder name in DATA_KINDS, then DataFiles.register() in the file that
// owns it (see the bottom of enemies.js for a short one), and DataFiles.load() for it gets called when
// the game starts (setup() in sketch.js)

const DATA_FOLDER = 'assets/squimble-quest/';

// each kind's folder in DATA_FOLDER. tests/data-check.js reads this too
const DATA_KINDS = {
  tile:   'tiles/',
  sound:  'sounds/',
  voice:  'voices/',
  item:   'items/',
  object: 'objects/',
  enemy:  'enemies/',
  npc:    'npcs/',
  particle: 'particles/',
  map:    'maps/',
};

const DataFiles = {
  // what each kind does with its files, from register()
  kinds: {},
  // the names in each kind's index.json, plus any the editor has exported since, by kind
  listed: {},
  // the text each thing's file would have had when it loaded (or was last exported), by kind and name,
  // so Export can tell what's changed
  saved: {},

  // how a kind's files get used:
  //   define(name, settings)  adds one to the game from its file. it can give back a promise, like a
  //                           tile waiting for its picture, and loading waits for those
  //   loaded()                optional, runs once they've all been defined (making colours, say)
  //   names()                 optional, every one there is now, in order. needed for Export
  //   toData(name)            optional, one's settings to save, only the ones that aren't normal
  register(kind, handlers) {
    this.kinds[kind] = handlers;
  },

  // loads every file listed in a kind's index.json, all at once, and defines them in the index's order.
  // gives back a promise that finishes when it's done. problems (a missing file, a bad index) are just
  // console warnings and never stop the game, like they always have been
  load(kind) {
    const folder = DATA_FOLDER + DATA_KINDS[kind];
    const { define, loaded, toData } = this.kinds[kind];
    this.listed[kind] = new Set();
    this.saved[kind] = {};
    return fetchJson(`${folder}index.json`) // utils.js
      .then((names) => {
        if (!Array.isArray(names) || names.some((name) => typeof name !== 'string')) {
          throw new Error('it should be a list of names, like ["grunt", "dummy"]');
        }
        const files = names.map((name) => fetchJson(`${folder}${name}.json`).catch((err) => {
          console.warn(`Couldn't load "${folder}${name}.json": ${err.message}.`);
          return null;
        }));
        return Promise.all(files).then((results) => Promise.all(results.map((settings, i) => {
          const name = names[i];
          this.listed[kind].add(name);
          if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
            if (settings) console.warn(`"${folder}${name}.json" should be { } with settings in, so it's been left out.`);
            return null;
          }
          const done = define(name, settings);
          if (toData) this.saved[kind][name] = this.text(toData(name));
          return done;
        })));
      })
      .catch((err) => console.warn(`Couldn't load "${folder}index.json": ${err.message}.`))
      .then(() => loaded?.());
  },

  // a file's text: 2 space indents, so each setting is on its own line
  text(data) {
    return `${JSON.stringify(data, null, 2)}\n`;
  },

  // downloads every file of these kinds that's new or changed since it loaded or was last exported,
  // plus `extras` ([{ name, data, folder }], like a new tile picture, data being a Blob and folder a
  // path inside DATA_FOLDER), then says where they all go. the browser might ask whether the page can
  // download several files the first time
  export(kinds, extras = []) {
    // folder => { files, add (names for its index.json), remove (files it doesn't need any more) }
    const folders = {};
    const folderFor = (folder) => (folders[folder] ??= { files: [], add: [], remove: [] });
    for (const kind of kinds) {
      const { names, toData } = this.kinds[kind];
      const folder = folderFor(DATA_KINDS[kind]);
      const saved = this.saved[kind] ??= {};
      const listed = this.listed[kind] ??= new Set();
      const now = names();
      for (const name of now) {
        const text = this.text(toData(name));
        if (text === saved[name]) continue;
        downloadTextFile(`${name}.json`, text); // utils.js
        saved[name] = text;
        folder.files.push(`${name}.json`);
        if (!listed.has(name)) folder.add.push(name);
        listed.add(name);
      }
      // ones that have gone (a sound that's turned into a voice moves folder)
      for (const name of Object.keys(saved)) {
        if (now.includes(name)) continue;
        delete saved[name];
        listed.delete(name);
        folder.remove.push(name);
      }
    }
    for (const extra of extras) {
      downloadData(extra.name, extra.data); // utils.js
      folderFor(extra.folder).files.push(extra.name);
    }
    this.tellWhere(folders);
  },

  // the message after an export, saying what to do with the files. `folders` is { folder: { files,
  // add, remove } }, where add and remove are names for that folder's index.json. map exports use it
  // too (exportMap() in mapfile.js). the screen gets the steps if they fit, the console always gets
  // them all
  tellWhere(folders) {
    const steps = [];
    for (const [folder, { files, add = [], remove = [] }] of Object.entries(folders)) {
      const quoted = (names) => names.map((name) => `"${name}"`).join(', ');
      const json = (names) => names.map((name) => `${name}.json`).join(', ');
      if (files.length > 0) steps.push(`put ${files.join(', ')} in ${folder}`);
      if (add.length > 0) steps.push(`add ${quoted(add)} to ${folder}index.json`);
      if (remove.length > 0) steps.push(`delete ${folder}${json(remove)} and take ${quoted(remove)} out of ${folder}index.json`);
    }
    if (steps.length === 0) {
      showMessage("Nothing's changed since it loaded or was last exported"); // hud.js
      return;
    }
    console.info(`Exported! In ${DATA_FOLDER}:\n  - ${steps.join('\n  - ')}`);
    const all = steps.join(", then ");
    const short = `Exported! ${all[0].toUpperCase()}${all.slice(1)}`;
    // showMessage() cuts off anything too long for the screen, so a long one points at the console
    // instead (90 letters is about what fits)
    showMessage(short.length <= 90 ? short : 'Exported! The console (F12) says where each file goes');
  },
};
