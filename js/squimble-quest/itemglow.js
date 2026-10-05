// the rarity glow around items: in slots, in the editor palette, on the ground and while being thrown.
// everything draws items through drawGlowingItem(), so changing how it looks only means changing this
// file. it's three layers:
//   halo      a soft pulsing light behind the item (drawGlowHalo())
//   icon      the item itself (drawItemIcon() in inventory.js)
//   sparkles  a few pixel twinkles over it, each fading in and out somewhere new (drawGlowSparkles())
//
// each rarity in RARITIES (items.js) has:
//   colour    the halo and sparkle colour
//   sparkles  how many twinkle at once, 0 for none
//   image     a picture to draw instead of the halo, like "assets/squimble-quest/items/glow-rare.png".
//             it should be a soft blob on a see-through background. it gets stretched to the glow's
//             size and still pulses
//
// ponytail: still glow pictures only. an animated one (sprite sheet) would go in drawGlowHalo()

// shared by every rarity
const ITEM_GLOW = {
  // seconds per pulse, and how much it grows when it pulses (as a fraction of its size)
  pulseTime: 3,
  pulseSize: 0.08,
  // the halo's opacity (0 to 1) going outwards (0 is the middle, 1 the edge). it stays bright out to
  // about the edge of the icon, since the icon covers the middle anyway, then fades off softly
  fade: [[0, 0.7], [0.5, 0.55], [0.75, 0.2], [1, 0]],
  // how many seconds a sparkle lasts
  sparkleTime: 1.4,
  // the closest and furthest a sparkle can be from the middle, as fractions of the glow's size
  sparkleReach: [0.45, 0.95],
  // how many px a sparkle drifts up over its life, for an item on the ground
  sparkleRise: 4,
};

// how many px a ground item's glow reaches out (inventory.js). sparkles are 1px at that size and get
// scaled for other sizes so the slots match
const GLOW_PIXEL_SIZE = 24;

// draws an item centred on x, y with its glow. iconSize is how many px square the item is, and the
// glow reaches glowSize px out. seed makes neighbouring items pulse and sparkle out of step with each
// other. a moving item needs a fixed seed
function drawGlowingItem(item, x, y, iconSize, glowSize, seed = x + y) {
  const rarity = itemRarity(item);
  const time = millis() / 1000;
  const pulse = 1 + Math.sin(time * TWO_PI / ITEM_GLOW.pulseTime + seed) * ITEM_GLOW.pulseSize;
  push();
  drawGlowHalo(rarity, x, y, glowSize * pulse);
  drawItemIcon(item, x - iconSize / 2, y - iconSize / 2, iconSize);
  drawGlowSparkles(rarity, x, y, glowSize, time, seed);
  pop();
}

// the rarity's picture, or a round gradient fading out from its colour
function drawGlowHalo(rarity, x, y, size) {
  if (rarity.img) {
    image(rarity.img, x - size, y - size, size * 2, size * 2);
    return;
  }
  const [r, g, b] = rarity.fill.levels;
  // this uses the canvas directly because p5 doesn't do gradients. p5's camera transform still applies
  const ctx = drawingContext;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
  for (const [at, opacity] of ITEM_GLOW.fade) gradient.addColorStop(at, `rgba(${r}, ${g}, ${b}, ${opacity})`);
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, TWO_PI);
  ctx.fill();
  ctx.restore();
}

// rarity.sparkles little plus shapes around x, y. each one grows and fades over
// ITEM_GLOW.sparkleTime, then pops up again somewhere else
function drawGlowSparkles(rarity, x, y, size, time, seed) {
  const count = rarity.sparkles;
  if (!count) return;
  const { sparkleTime, sparkleReach: [near, far], sparkleRise } = ITEM_GLOW;
  const unit = size / GLOW_PIXEL_SIZE;
  // snapped to whole pixels so they stay crisp pixel art
  const snap = (v) => Math.round(v / unit) * unit;
  const [r, g, b] = rarity.fill.levels;
  noStroke();
  for (let i = 0; i < count; i++) {
    // offset from each other so they take turns instead of all blinking together
    const age = time / sparkleTime + i / count + seed;
    const life = age - Math.floor(age);
    // stays the same for every frame of one sparkle's life, and changes for the next one
    const id = Math.floor(age) * 13 + i * 7 + seed;
    const angle = glowHash(id) * TWO_PI;
    const reach = lerp(near, far, glowHash(id + 0.5)) * size;
    const sx = snap(x + Math.cos(angle) * reach);
    const sy = snap(y + Math.sin(angle) * reach - life * sparkleRise * unit);
    // squared so it's faint most of the time with a quick bright twinkle
    const brightness = Math.sin(life * PI) ** 2;
    const arm = Math.round(brightness * 2) * unit;
    // pale arms in the rarity colour with a white middle
    fill((r + 255) / 2, (g + 255) / 2, (b + 255) / 2, brightness * 255);
    rect(sx - arm, sy, arm * 2 + unit, unit);
    rect(sx, sy - arm, unit, arm * 2 + unit);
    fill(255, brightness * 255);
    rect(sx, sy, unit, unit);
  }
}

// turns any number into a random looking 0 to 1 that's always the same for that number, so a sparkle
// keeps its spot without having to store it anywhere
function glowHash(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}
