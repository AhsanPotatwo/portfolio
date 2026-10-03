// the rarity glow around items, in slots, the editor palette, on the ground and mid-throw. everything
// draws an item through drawGlowingItem(), so changing the look only touches this file. three layers:
//   halo      soft pulsing light behind the item (drawGlowHalo())
//   icon      the item itself (drawItemIcon() in inventory.js)
//   sparkles  a few pixel twinkles over it, each fading in and out in a new spot (drawGlowSparkles())
//
// per rarity, in RARITIES (items.js):
//   colour    halo and sparkle tint
//   sparkles  how many twinkle at a time; 0 for none
//   image     a picture drawn instead of the halo, e.g. "assets/squimble-quest/items/glow-rare.png". a
//             soft blob on transparency, stretched to the glow's size; it still pulses
//
// ponytail: still glow pictures only. an animated one (sprite sheet) would go in drawGlowHalo()

// shared by every rarity
const ITEM_GLOW = {
  // seconds per pulse, and how much it grows then (fraction of its size)
  pulseTime: 3,
  pulseSize: 0.08,
  // halo opacity (0 to 1) by distance out (0 middle, 1 edge). bright to about the icon's edge, since
  // the icon hides the middle, then a soft fade
  fade: [[0, 0.7], [0.5, 0.55], [0.75, 0.2], [1, 0]],
  // seconds a sparkle lasts
  sparkleTime: 1.4,
  // sparkle distance from the middle, least and most, as fractions of the glow's size
  sparkleReach: [0.45, 0.95],
  // px a sparkle drifts up over its life, for a ground item
  sparkleRise: 4,
};

// px a ground item's glow reaches out (inventory.js). sparkles are 1 px there, scaled for other sizes
// so slots match
const GLOW_PIXEL_SIZE = 24;

// item centred on x, y with its glow. iconSize px square; glow reaches glowSize px out. seed staggers
// neighbours so they don't pulse and sparkle in step; give a moving item a fixed one
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

// the rarity's picture, or a radial gradient fading out from its colour
function drawGlowHalo(rarity, x, y, size) {
  if (rarity.img) {
    image(rarity.img, x - size, y - size, size * 2, size * 2);
    return;
  }
  const [r, g, b] = rarity.fill.levels;
  // canvas directly: p5 has no gradients. p5's camera transform still applies
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

// rarity.sparkles little plus shapes around x, y, each growing and fading over ITEM_GLOW.sparkleTime
// then reappearing somewhere else
function drawGlowSparkles(rarity, x, y, size, time, seed) {
  const count = rarity.sparkles;
  if (!count) return;
  const { sparkleTime, sparkleReach: [near, far], sparkleRise } = ITEM_GLOW;
  const unit = size / GLOW_PIXEL_SIZE;
  // whole pixels, so they stay crisp pixel art
  const snap = (v) => Math.round(v / unit) * unit;
  const [r, g, b] = rarity.fill.levels;
  noStroke();
  for (let i = 0; i < count; i++) {
    // offset so they take turns rather than blink together
    const age = time / sparkleTime + i / count + seed;
    const life = age - Math.floor(age);
    // same each frame of one sparkle's life, different for the next
    const id = Math.floor(age) * 13 + i * 7 + seed;
    const angle = glowHash(id) * TWO_PI;
    const reach = lerp(near, far, glowHash(id + 0.5)) * size;
    const sx = snap(x + Math.cos(angle) * reach);
    const sy = snap(y + Math.sin(angle) * reach - life * sparkleRise * unit);
    // squared so it's mostly faint with a brief bright twinkle
    const brightness = Math.sin(life * PI) ** 2;
    const arm = Math.round(brightness * 2) * unit;
    // pale arms in the rarity colour, white middle
    fill((r + 255) / 2, (g + 255) / 2, (b + 255) / 2, brightness * 255);
    rect(sx - arm, sy, arm * 2 + unit, unit);
    rect(sx, sy - arm, unit, arm * 2 + unit);
    fill(255, brightness * 255);
    rect(sx, sy, unit, unit);
  }
}

// a steady random-looking 0 to 1 for any number, so a sparkle keeps its spot without storing it
function glowHash(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}
