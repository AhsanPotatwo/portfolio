// helpers that get used all over the place: maths, text, catalogues and files

// do two boxes ({ x, y, w, h }) overlap? edges just touching doesn't count
function boxesOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

// the smallest turn from angle b to angle a, in radians from -PI to PI (so 350 degrees to 10 degrees
// is a 20 degree turn, not 340). used for checking if something's inside an arc
function angleDifference(a, b) {
  let diff = (a - b) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

// eases t (0 to 1) in and out, for movements with a fixed length like camera glides
function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// moves current towards target by part of the gap each frame, so it slows down as it gets there.
// higher speed is snappier and Infinity is instant. the Math.exp makes it work the same at any
// frame rate
function approach(current, target, speed, dt) {
  if (speed === Infinity) return target;
  return current + (target - current) * (1 - Math.exp(-speed * dt));
}

// a random number from min up to (but not including) max. all the game's randomness goes through
// here, so in multiplayer it could be swapped for a seeded random that every player shares (README.md)
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// turns an angle (radians, going clockwise from right because y goes down) into the nearest of 8
// directions, with x and y each -1, 0 or 1 like Input.direction(). so 0 gives {x:1,y:0} and PI/2
// gives {x:0,y:1}
function directionFromAngle(angle) {
  // snap to the nearest 45 degrees
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  // cos and sin come out as 0, 0.707 or 1 (or minus those), and rounding turns them into 0 or 1
  return {
    x: Math.round(Math.cos(snapped)),
    y: Math.round(Math.sin(snapped)),
  };
}

// sets all of p5's text settings in one go. style is NORMAL/BOLD/ITALIC, alignX is LEFT/CENTER/RIGHT
// and alignY is TOP/CENTER/BOTTOM. the page loads quicksand and courier prime.
// like setText(14, BOLD, CENTER, BOTTOM) or setText(13, NORMAL, LEFT, TOP, 'Courier Prime')
function setText(size, style = BOLD, alignX = CENTER, alignY = CENTER, font = 'Quicksand') {
  textFont(font);
  textStyle(style);
  textSize(size);
  textAlign(alignX, alignY);
}

// ---------- catalogues ----------
// objects.js, enemies.js, npcs.js and items.js each keep a catalogue of their kinds by name (like
// ENEMY_TYPES.grunt), filled in from their data files (datafiles.js) by defineObject(), defineEnemy()
// and so on, which all use these

// the defaults with `settings` on top, plus its name. if a setting isn't in the defaults it's probably
// a typo (like maxHelth) that would just get ignored, so it warns about it. a setting that's actually
// new needs a default adding. kind is only for the warning
function withDefaults(defaults, kind, name, settings) {
  for (const key of Object.keys(settings)) {
    if (!(key in defaults)) console.warn(`The ${kind} "${name}" has a setting "${key}" that isn't in the ${kind} defaults. A typo, or a new setting that needs its normal value adding there?`);
  }
  return { ...defaults, ...settings, name };
}

// adds `name` to the catalogue `types` (withDefaults())
function defineType(types, defaults, kind, name, settings) {
  types[name] = withDefaults(defaults, kind, name, settings);
}

// a catalogue entry turned back into the settings for its data file: only the ones that aren't the
// default (the file's name is its name, so that's left out). colour always goes in so you can see
// what every one looks like
function typeToData(type, defaults) {
  const entry = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (key === 'colour' || type[key] !== value) entry[key] = type[key];
  }
  return entry;
}

// `words` cut short with … so it fits in maxWidth px, using whatever text settings are on now
function fitText(words, maxWidth) {
  if (textWidth(words) <= maxWidth) return words;
  while (words.length > 0 && textWidth(`${words}…`) > maxWidth) words = words.slice(0, -1);
  return `${words}…`;
}

// loads the pictures and makes the p5 colours once, instead of on every draw. objects, enemies, npcs
// and items run it once their files have loaded (their DataFiles.register() calls), and preload()
// (sketch.js) runs it for the rarities. tiles do their own thing in setTile() (tiles.js). kind is only
// for the warning
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
    // portraits for the npc text box (npcs.js)
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
// the game loads its files from the site's folders. the editors can also open files from your
// computer, and download files for you to put in those folders

// gives a promise of a json file's data from the site. if it fails, the error says why, plus a hint
// about running a local server if the page was opened as file://
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

// opens the browser's file picker (the only way a web page is allowed to read your files), then calls
// onPick(File). accept is something like '.json' or 'image/*'. closing it without choosing does nothing
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

// downloads a Blob, like a picture chosen in tileeditor.js. it's not called downloadFile() because
// p5 already has a global with that name and would replace it
function downloadData(fileName, data) {
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // give the download a second to start before tidying up
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
