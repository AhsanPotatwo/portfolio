// small helpers that more than one part of the game can use: maths, text, the catalogues, and files

// do two boxes ({ x, y, w, h }) overlap? boxes that only touch along an edge don't count
function boxesOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

// the smallest turn from angle b to angle a, in radians, between -PI and PI.
// e.g. from 350° to 10° is a 20° turn, not 340°. used to check if something's within an arc
function angleDifference(a, b) {
  let diff = (a - b) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

// turns a steady 0 → 1 into one that starts slow, speeds up in the middle and slows down at the
// end (called "ease in-out"). for smooth movements with a set length, like the camera's glides
function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// moves current towards target, covering part of the gap each frame, so it slows down as it
// arrives (a smooth ease). speed is how quickly: higher is snappier, Infinity gets there instantly.
// the Math.exp part keeps it the same speed at any frame rate, like dt does for movement
function approach(current, target, speed, dt) {
  if (speed === Infinity) return target;
  return current + (target - current) * (1 - Math.exp(-speed * dt));
}

// a random number from min up to (not quite) max. everything random in the game goes through here,
// so it's one place to change, e.g. to a seeded random that every player in a multiplayer game
// would get the same answers from (see README.md)
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// turns an angle (in radians) into the nearest of the 8 directions, as x and y that are each
// -1, 0 or 1 (the same shape as Input.direction()). e.g. 0 → right {x:1,y:0}, PI/2 → down {x:0,y:1}.
// angles go clockwise from pointing right, because y goes down the screen in p5
function directionFromAngle(angle) {
  // the 8 directions are 45° (PI/4) apart. dividing by 45° and rounding picks the nearest one,
  // then multiplying back gives that direction's exact angle
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  // cos and sin of that angle are 0, ±0.707 or ±1. rounding turns them into 0 or ±1
  return {
    x: Math.round(Math.cos(snapped)),
    y: Math.round(Math.sin(snapped)),
  };
}

// sets up how text() looks in one go, instead of 4 or 5 lines every time something's written.
// style is NORMAL, BOLD or ITALIC, alignX LEFT / CENTER / RIGHT, alignY TOP / CENTER / BOTTOM.
// quicksand and courier prime are already loaded by the page, so the canvas can use them too.
// e.g. setText(14, BOLD, CENTER, BOTTOM) or setText(13, NORMAL, LEFT, TOP, 'Courier Prime')
function setText(size, style = BOLD, alignX = CENTER, alignY = CENTER, font = 'Quicksand') {
  textFont(font);
  textStyle(style);
  textSize(size);
  textAlign(alignX, alignY);
}

// ---------- catalogues ----------
// objects.js, enemies.js, npcs.js, weapons.js and items.js each keep a catalogue: every kind of that
// thing by name, e.g. ENEMY_TYPES.grunt. their defineObject(), defineEnemy()... all use these

// adds a kind of thing to a catalogue (types): its settings on top of the catalogue's defaults, and
// its name. kind is what the catalogue calls one, for the warning. a setting that isn't in the
// defaults is almost always a typo (maxHelth), which would otherwise be quietly ignored, so it gets
// a warning. a real new setting needs its normal value adding to the defaults
function defineType(types, defaults, kind, name, settings) {
  for (const key of Object.keys(settings)) {
    if (!(key in defaults)) console.warn(`The ${kind} "${name}" has a setting "${key}" that isn't in the ${kind} defaults. A typo, or a new setting that needs its normal value adding there?`);
  }
  types[name] = { ...defaults, ...settings, name };
}

// run from preload() in sketch.js, before the game starts, for objects, enemies, items and npcs
// (tiles load theirs in setTile() in tiles.js):
//   prepareArt(OBJECT_TYPES, 'object')
// loads their images, and turns colours into p5 colours once now rather than every time
// something's drawn (thousands of times a second). kind is only used in the warning
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
    // npcs can have a portrait for the text box too (npcs.js)
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
// the game's files (tiles.json, maps) load from its own folders. the map and tile editors can also
// open files from the computer, and download files for you to put in those folders

// loads a json file from the site, e.g. fetchJson('assets/squimble-quest/tiles/tiles.json'). gives
// back a promise of its data. if it can't load, the error says why, plus the usual reason when the
// page was opened straight from its file rather than through a local server
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

// asks for a file from the computer with the browser's own file picker (the only way a web page can
// read one), then gives it (a File) to onPick. accept says which kinds, e.g. '.json' or 'image/*'.
// nothing happens if the picker's closed without choosing one
function pickFile(accept, onPick) {
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = accept;
  picker.addEventListener('change', () => {
    if (picker.files[0]) onPick(picker.files[0]);
  });
  picker.click();
}

// makes the browser download some text as a file
function downloadTextFile(fileName, text) {
  downloadData(fileName, new Blob([text], { type: 'application/json' }));
}

// makes the browser download a file. data is a Blob, the browser's name for a file's contents, e.g. a
// picture chosen in the tile editor (tileeditor.js). not called downloadFile(): p5 already has one,
// and in global mode p5's would replace it
function downloadData(fileName, data) {
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // give the download a moment to start before tidying up
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
