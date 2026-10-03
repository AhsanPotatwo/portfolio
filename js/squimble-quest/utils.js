// shared helpers: maths, text, catalogues, files

// do boxes ({ x, y, w, h }) overlap? touching edges don't count
function boxesOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

// smallest turn from angle b to a, radians, -PI..PI (350° → 10° is 20°). for arc checks
function angleDifference(a, b) {
  let diff = (a - b) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

// ease in-out of t (0 → 1), for fixed-length movements like camera glides
function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// moves current towards target by part of the gap each frame, slowing as it arrives. higher speed is
// snappier, Infinity is instant. Math.exp makes it frame rate independent
function approach(current, target, speed, dt) {
  if (speed === Infinity) return target;
  return current + (target - current) * (1 - Math.exp(-speed * dt));
}

// random from min to just under max. all game randomness goes through here, so it could become a
// seeded random shared by every player in multiplayer (see README.md)
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// angle (radians, clockwise from right since y goes down) → nearest of 8 directions, x and y each
// -1/0/1 like Input.direction(). e.g. 0 → {x:1,y:0}, PI/2 → {x:0,y:1}
function directionFromAngle(angle) {
  // snap to the nearest 45°
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  // cos/sin are 0, ±0.707 or ±1; rounding gives 0 or ±1
  return {
    x: Math.round(Math.cos(snapped)),
    y: Math.round(Math.sin(snapped)),
  };
}

// sets all text() settings in one call. style NORMAL/BOLD/ITALIC, alignX LEFT/CENTER/RIGHT, alignY
// TOP/CENTER/BOTTOM. quicksand and courier prime are loaded by the page.
// e.g. setText(14, BOLD, CENTER, BOTTOM) or setText(13, NORMAL, LEFT, TOP, 'Courier Prime')
function setText(size, style = BOLD, alignX = CENTER, alignY = CENTER, font = 'Quicksand') {
  textFont(font);
  textStyle(style);
  textSize(size);
  textAlign(alignX, alignY);
}

// ---------- catalogues ----------
// objects.js, enemies.js, npcs.js, weapons.js and items.js each keep a catalogue of kinds by name
// (e.g. ENEMY_TYPES.grunt), filled by defineObject(), defineEnemy()... through these

// adds `name` to catalogue `types`: defaults + settings + name. a setting not in the defaults is
// usually a typo (maxHelth) that'd be silently ignored, so it warns; a real new setting needs a
// default. kind is only for the warning
function defineType(types, defaults, kind, name, settings) {
  for (const key of Object.keys(settings)) {
    if (!(key in defaults)) console.warn(`The ${kind} "${name}" has a setting "${key}" that isn't in the ${kind} defaults. A typo, or a new setting that needs its normal value adding there?`);
  }
  types[name] = { ...defaults, ...settings, name };
}

// a catalogue entry as file data (tiles.json, items.json): name plus non-default settings. colour
// always goes in, so every line shows its look
function typeToData(type, defaults) {
  const entry = { name: type.name };
  for (const [key, value] of Object.entries(defaults)) {
    if (key === 'colour' || type[key] !== value) entry[key] = type[key];
  }
  return entry;
}

// one json list entry on one indented line. indent 1 then collapsing line breaks leaves spaces
// after colons and commas
function jsonLine(entry) {
  return `    ${JSON.stringify(entry, null, 1).replace(/\n\s*/g, ' ')}`;
}

// loads images and makes p5 colours once (not every draw). run from preload() (sketch.js) for
// objects, enemies, npcs, and after items.json loads for items (items.js). tiles use setTile()
// (tiles.js). kind is only for the warning
function prepareArt(types, kind) {
  for (const type of Object.values(types)) {
    type.fill = color(type.colour);
    type.img = null;
    if (type.image) {
      type.img = loadImage(type.image, undefined, () => {
        console.warn(`Couldn't load "${type.image}" for the ${type.name} ${kind}, using its colour instead`);
        type.img = null;
      });
    }
    // npc text box portraits (npcs.js)
    type.portraitImg = null;
    if (type.portrait) {
      type.portraitImg = loadImage(type.portrait, undefined, () => {
        console.warn(`Couldn't load "${type.portrait}" for the ${type.name} ${kind}'s portrait, using a placeholder instead`);
        type.portraitImg = null;
      });
    }
  }
}

// ---------- files ----------
// game files load from the site's folders; the editors can also open files from the computer and
// download files to put in those folders

// promise of a site json file's data. the error says why it failed, plus the local server hint when
// opened as file://
function fetchJson(path) {
  return fetch(path)
    .then((response) => {
      if (!response.ok) throw new Error(`the file wasn't found (${response.status})`);
      return response.json();
    })
    .catch((err) => {
      const hint = location.protocol === 'file:'
        ? '. Files only load when the site is run through a local server, see the README in assets/squimble-quest/maps'
        : '';
      throw new Error(err.message + hint);
    });
}

// browser file picker (the only way a page can read a file), then onPick(File). accept e.g. '.json'
// or 'image/*'. closing without choosing does nothing
function pickFile(accept, onPick) {
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = accept;
  picker.addEventListener('change', () => {
    if (picker.files[0]) onPick(picker.files[0]);
  });
  picker.click();
}

function downloadTextFile(fileName, text) {
  downloadData(fileName, new Blob([text], { type: 'application/json' }));
}

// downloads a Blob, e.g. a picture chosen in tileeditor.js. not downloadFile(): p5's global would
// replace it
function downloadData(fileName, data) {
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // let the download start before tidying up
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
