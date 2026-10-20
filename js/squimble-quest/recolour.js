// recolouring a character's picture: swapping its skin colour, with its shading and outline following
// along. the picture is drawn with a few exact colours that mean something (skin, shading, outline),
// listed in its type's recolour setting, like the squimble npc's (npcs/squimble.json):
//   "recolour": { "skin": "#fff8c8", "shading": "#e8c083", "outline": "#4f1e03" }
// skin is the one you pick, and every other colour in the list follows it the way it does in the
// picture: turned round the colour wheel by the same amount, the same amount more or less vivid, and the
// same share as bright. so a shading that's warmer than the skin stays warmer on any skin, and to change
// how shading follows skin you just redraw the shading, nothing here. any of them can be picked by hand
// instead of following. pixels in any other colour (eyes, the inside of the mouth) are left alone.
//
// ponytail: this is the skin test. what uses it is marked "skin test" (npcs.js, npc.js, sketch.js,
// editor.js) so it can come out once there's a proper character customiser, which can keep this file.
// the picks only last until reload, map files don't save them

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

// what each of the picture's colours (recolour's) becomes, as { '#fff8c8': '#c68a5a', ... }. picked
// is { skin, shading, outline... }, each a #rrggbb or left out to follow skin (left out skin keeps the
// picture's own)
function recolourSwaps(recolour, picked) {
  const base = hexToHsl(recolour.skin);
  const skin = hexToHsl(picked.skin ?? recolour.skin);
  const swaps = {};
  for (const [part, hex] of Object.entries(recolour)) {
    const [h, s, l] = hexToHsl(hex);
    // base[2] is 0 for black skin, which can't be a share of anything, so it just stays as drawn
    swaps[hex] = picked[part] ?? (base[2] === 0 ? hex : hslToHex(skin[0] + h - base[0], skin[1] + s - base[1], (skin[2] * l) / base[2]));
  }
  return swaps;
}

// recoloured copies of pictures, by type name and picks, so it's only worked out once each
const RECOLOURED = new Map();

// type's picture recoloured with picked (recolourSwaps()). the picture as it is until it's loaded
function recolouredImage(type, picked) {
  // loadImage() gives back a 1 x 1 picture until it's loaded
  if (!type.img || type.img.width <= 1) return type.img;
  const key = `${type.name} ${JSON.stringify(picked)}`;
  if (RECOLOURED.has(key)) return RECOLOURED.get(key);
  // ponytail: dragging round the colour picker makes a new one every frame, so the whole lot goes
  // every 200 rather than keeping track of which are still used
  if (RECOLOURED.size > 200) RECOLOURED.clear();

  const swaps = {};
  for (const [from, to] of Object.entries(recolourSwaps(type.recolour, picked))) {
    swaps[parseInt(from.slice(1), 16)] = [1, 3, 5].map((i) => parseInt(to.slice(i, i + 2), 16));
  }
  // get() with nothing in the brackets copies the whole picture
  const img = type.img.get();
  img.loadPixels();
  const p = img.pixels;
  for (let i = 0; i < p.length; i += 4) {
    const to = p[i + 3] > 0 && swaps[(p[i] << 16) | (p[i + 1] << 8) | p[i + 2]];
    if (to) [p[i], p[i + 1], p[i + 2]] = to;
  }
  img.updatePixels();
  RECOLOURED.set(key, img);
  return img;
}

// type's settings with its picture recoloured, for Character and drawCharacter() (character.js).
// the same settings back if it can't be recoloured or nothing's picked
function recolouredSettings(type, picked) {
  if (!type.recolour || !picked) return type;
  // a getter, so it picks the recoloured one up once the picture's loaded
  return Object.defineProperty({ ...type }, 'img', { get: () => recolouredImage(type, picked) });
}
