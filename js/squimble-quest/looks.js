// looks: what a character looks like, built from parts (a body, eyes, a mouth, a shirt...) stacked on
// top of each other, each recoloured to the colours picked. this is what the character creator will be
// built on. for now npcs use it (npcs/squimble.json, and right click one in the editor's NPCs tab to
// change it), and anything else with a picture can too (withLook() below).
//
// ============================== how to make a part ==============================
//
// a part is a picture plus a json file in assets/squimble-quest/parts/, named after it, with its name in
// parts/index.json (like every other data folder, datafiles.js). parts/round-eyes.json could be:
//   { "slot": "eyes", "image": "assets/squimble-quest/parts/round-eyes.png", "recolour": { "eyes": "#4f1e03" } }
//
//   slot      which LOOK_SLOTS it goes in (below). a look has one part per slot
//   image     its picture
//   recolour  optional. the exact colours in its picture that change with the picked colours, by name.
//             the first one is the main colour, which you pick, and the rest follow it the way they
//             do in the picture (recolourSwaps() below): a shading that's warmer and darker than the
//             skin stays warmer and darker on any skin. any colour not listed is left alone, so eye
//             whites or a gold buckle never change. leave it out and the part never changes colour
//   colours   optional. which colour group it takes its colours from, normally its slot. parts that
//             should match each other share one: ears, a nose and the body all use "skin", so picking a
//             skin colour does all of them. parts in the same group need the same recolour list (copy
//             it from the body), even if they only use some of its colours
//
// ---------- drawing them ----------
// - draw every part on a picture the same size as the body, lined up with it, and leave everything
//   that isn't that part see-through. that way they always line up and there are no numbers to set.
//   pictures of different sizes still work: each one is lined up by its bottom middle (lookImage()), so
//   a tall hat can be drawn on a taller picture
// - the recolour colours have to be exact, with no soft edges or in-between shades of them, or those
//   pixels won't change. different parts can reuse the same colours, since each part is only
//   recoloured with its own group
// - pictures are drawn at their own size, with their bottom middle on the character's feet
//   (drawCharacter() in character.js), so any size works and the hitbox (width and height in its
//   npc/enemy file, or PLAYER) is separate. to change the art's size, redraw it. nothing in the code
//   needs to change
//
// ---------- slots ----------
// LOOK_SLOTS is every slot, in the order they're drawn, back to front. to add a slot (hair, a hat,
// wings), put its name in the list where it should be layered. something that goes behind the body
// (a cape, back hair) goes before 'body'
//
// ---------- a look ----------
// a look is plain data, so it can go in data files, map files and saves:
//   { "parts": { "body": "squimble-body", "eyes": "squimble-eyes" },
//     "colours": { "skin": { "skin": "#c68a5a" }, "eyes": { "eyes": "#223355" } } }
//   parts    a part's name for each slot it has. slots left out are empty
//   colours  for each colour group, the colours picked by their recolour name. ones left out keep the
//            picture's own, or follow the main one. so { "skin": "#c68a5a", "outline": "#000000" }
//            picks the skin and the outline, and the shading follows the skin
//
// npcs get one from "look" in their file, and each one on a map can have its own (the editor's NPC box,
// saved in the map). to give the player one, which is what the character creator would do:
//   player.settings = withLook(PLAYER, look)
// and enemies the same way as npcs (see giveLooks() and its call at the bottom of npcs.js)
//
// ---------- later ----------
// there's one picture per look, so no walking animation or 8 directions yet. when there are, a part's
// picture could become a strip with a frame for each, and lookImage() would stack them frame by frame
//
// ====================================================================================

// every slot, back to front (see above)
const LOOK_SLOTS = [
  'body',
  'shoes',
  'pants',
  'shirt',
  'belt',
  'necklace',
  'ring',
  'ears',
  'eyes',
  'nose',
  'mouth',
  'glasses',
  'horns',
];

const PART_DEFAULTS = {
  slot: null,
  image: null,
  recolour: null,
  // null means its slot
  colours: null,
};

// filled in from the part files (bottom of this file)
const PART_TYPES = {};

function definePart(name, settings) {
  defineType(PART_TYPES, PART_DEFAULTS, 'part', name, settings); // utils.js
  const part = PART_TYPES[name];
  if (!LOOK_SLOTS.includes(part.slot)) console.warn(`The part "${name}" goes in the slot "${part.slot}", which isn't in LOOK_SLOTS (looks.js), so it can't be worn`);
}

// the colour group a part takes its colours from
function partColours(part) {
  return part.colours ?? part.slot;
}

// every colour group the parts use, and its recolour colours (from the first part in it), like
// { skin: { skin: '#fff8c8', shading: '#e8c083', outline: '#4f1e03' }, eyes: { eyes: '#4f1e03' } }
function lookColourGroups() {
  const groups = {};
  for (const part of Object.values(PART_TYPES)) {
    if (part.recolour) groups[partColours(part)] ??= part.recolour;
  }
  return groups;
}

// ---------- picking one ----------

// form box tabs (formbox.js) for picking a look, starting from look: a Look tab with a picker for every
// slot that has parts, and a Colours tab with a colour box for every colour in every group. a group's
// main colour starts as the one in the picture, and the rest start empty, which means they follow it.
// gives back { tabs, read }, where read() is the look as it's picked now. the editor's NPC box uses it
// (Editor.editNpc()), and the character creator could too
function lookFields(look) {
  const capital = (words) => words[0].toUpperCase() + words.slice(1);
  const slots = LOOK_SLOTS.filter((slot) => Object.values(PART_TYPES).some((part) => part.slot === slot));
  const pickers = slots.map((slot) => {
    const names = Object.keys(PART_TYPES).filter((name) => PART_TYPES[name].slot === slot);
    const value = look.parts?.[slot] ?? null;
    return new Picker({
      w: 180,
      // a missing part stays in the list so opening the box doesn't quietly take it off
      choices: [null, ...names, ...(value !== null && !names.includes(value) ? [value] : [])],
      value,
      label: (name) => (name === null ? 'none' : PART_TYPES[name] ? name : `${name} (missing)`),
    });
  });
  const colours = Object.entries(lookColourGroups()).flatMap(([group, recolour]) => Object.keys(recolour).map((name, i) => ({
    group,
    name,
    label: i === 0 ? capital(group) : `${capital(group)} ${name}`,
    tip: i === 0 ? `The ${group} colour. The rest of the ${group} colours follow it unless you pick them` : `Leave empty to follow the ${group} colour`,
    field: new ColourField({ w: 180, value: look.colours?.[group]?.[name] ?? (i === 0 ? recolour[name] : '') }), // textfield.js
  })));

  const read = () => {
    const parts = { ...look.parts };
    slots.forEach((slot, i) => {
      if (pickers[i].value === null) delete parts[slot];
      else parts[slot] = pickers[i].value;
    });
    // copied so the look it started from isn't changed
    const picked = Object.fromEntries(Object.entries(look.colours ?? {}).map(([group, names]) => [group, { ...names }]));
    for (const { group, name, field } of colours) {
      picked[group] ??= {};
      if (HEX_COLOUR.test(field.value)) picked[group][name] = field.value.toLowerCase();
      else delete picked[group][name];
      if (Object.keys(picked[group]).length === 0) delete picked[group];
    }
    return { parts, colours: picked };
  };

  return {
    tabs: [
      { label: 'Look', rows: slots.map((slot, i) => ({ label: capital(slot), field: pickers[i] })) },
      { label: 'Colours', rows: colours.map(({ label, tip, field }) => ({ label, field, tip })) },
    ],
    read,
  };
}

// ---------- colours ----------

// a colour as [hue 0 to 360, saturation 0 to 1, lightness 0 to 1]. hex is #rrggbb
function hexToHsl(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, d / (1 - Math.abs(2 * l - 1)), l];
}

// back to #rrggbb, keeping saturation and lightness between 0 and 1 and the hue going round
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.min(1, Math.max(0, s));
  l = Math.min(1, Math.max(0, l));
  const a = s * Math.min(l, 1 - l);
  const channel = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `#${[channel(0), channel(8), channel(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// what each of a part's recolour colours becomes, as { '#fff8c8': '#c68a5a', ... }. picked is its
// colour group's picks ({ skin: '#c68a5a' }, a look's colours). the first recolour colour is the main
// one, and each of the others follows it: turned round the colour wheel by the same amount, the same
// amount more or less vivid, and the same share as bright, as in the picture. a picked one is used as
// it is
function recolourSwaps(recolour, picked) {
  const [[mainName, mainHex]] = Object.entries(recolour);
  const base = hexToHsl(mainHex);
  const main = hexToHsl(picked[mainName] ?? mainHex);
  const swaps = {};
  for (const [name, hex] of Object.entries(recolour)) {
    const [h, s, l] = hexToHsl(hex);
    // base[2] is 0 for a black main colour, which can't be a share of anything, so it stays as drawn
    swaps[hex] = picked[name] ?? (base[2] === 0 ? hex : hslToHex(main[0] + h - base[0], main[1] + s - base[1], (main[2] * l) / base[2]));
  }
  return swaps;
}

// ---------- pictures ----------

// made pictures, by what they were made from, so each is only worked out once
const RECOLOURED = new Map();
const LOOK_IMAGES = new Map();

// ponytail: dragging round the colour picker makes a new picture every frame, so a cache gets emptied
// every 200 rather than keeping track of which are still used
function cached(cache, key, make) {
  if (!cache.has(key)) {
    if (cache.size > 200) cache.clear();
    cache.set(key, make());
  }
  return cache.get(key);
}

// a part's picture recoloured with its colour group's picks (recolourSwaps())
function recolouredImage(part, picked) {
  if (!part.recolour) return part.img;
  return cached(RECOLOURED, `${part.name} ${JSON.stringify(picked)}`, () => {
    const swaps = {};
    for (const [from, to] of Object.entries(recolourSwaps(part.recolour, picked))) {
      swaps[parseInt(from.slice(1), 16)] = [1, 3, 5].map((i) => parseInt(to.slice(i, i + 2), 16));
    }
    // get() with nothing in the brackets copies the whole picture
    const img = part.img.get();
    img.loadPixels();
    const p = img.pixels;
    for (let i = 0; i < p.length; i += 4) {
      const to = p[i + 3] > 0 && swaps[(p[i] << 16) | (p[i + 1] << 8) | p[i + 2]];
      if (to) [p[i], p[i + 1], p[i + 2]] = to;
    }
    img.updatePixels();
    return img;
  });
}

// a look's parts recoloured and stacked into one picture, in LOOK_SLOTS order, each lined up by its
// bottom middle. null until they've all loaded, or if it has no parts (so it's drawn as the
// placeholder). a part that's missing or whose picture couldn't load is left out
function lookImage(look) {
  const parts = LOOK_SLOTS.map((slot) => PART_TYPES[look.parts?.[slot]]).filter((part) => part?.img);
  // loadImage() gives back a 1 x 1 picture until it's loaded
  if (parts.length === 0 || parts.some((part) => part.img.width <= 1)) return null;
  return cached(LOOK_IMAGES, JSON.stringify(look), () => {
    const layers = parts.map((part) => recolouredImage(part, look.colours?.[partColours(part)] ?? {}));
    const w = Math.max(...layers.map((img) => img.width));
    const h = Math.max(...layers.map((img) => img.height));
    const g = createGraphics(w, h);
    g.pixelDensity(1);
    for (const img of layers) g.image(img, Math.floor((w - img.width) / 2), h - img.height);
    const img = g.get();
    g.remove();
    return img;
  });
}

// settings (PLAYER, or an npc or enemy type) with its picture made from look, for a Character or
// drawCharacter() (character.js). the same settings back if there's no look. the picture's a getter,
// so it turns up once the parts have loaded. hasLook makes it win over the kind's own picture settings
// (characterArt() in character.js). a look is one still picture for now: animating it would make each
// part a sheet of frames (art.js), stacked frame by frame
function withLook(settings, look) {
  if (!look) return settings;
  return Object.defineProperty({ ...settings, hasLook: true }, 'img', { get: () => lookImage(look), configurable: true });
}

// gives every type with a "look" setting its picture from it, so the editor's palette and previews
// show it too. a kind's loaded() runs it after prepareArt() (utils.js), like npcs.js does
function giveLooks(types) {
  for (const type of Object.values(types)) {
    if (!type.look) continue;
    type.hasLook = true;
    Object.defineProperty(type, 'img', { get: () => lookImage(type.look), configurable: true });
  }
}

// ---------- the part files ----------

DataFiles.register('part', {
  define: definePart,
  // the pictures start loading now, and lookImage() waits for them
  loaded: () => {
    for (const part of Object.values(PART_TYPES)) {
      part.img = part.image ? loadImage(part.image, undefined, () => {
        artProblem('part', part.name, part.image, "couldn't load, so it's left out"); // utils.js
        part.img = null;
      }) : null;
    }
  },
});
