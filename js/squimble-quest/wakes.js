// wakes: the V that opens out behind whoever wades through a liquid (a tile with sink, tiles.js),
// like a boat's. Character.inLiquid() (character.js) calls Wakes.follow() every frame someone's in
// one, and sketch.js ages them (Wakes.update()) and draws them on the surface, under everyone and the
// floor particles (Wakes.draw()).
//
// how it works: walking along, they drop a point every WAKE.spacing px, saying which way and how fast
// they were going. each point is a bit of wave rolling out sideways, so it drifts away from the path
// as it gets older, quicker the faster they were going. joined up, the points make two arms that come
// off the sides of the ring round them (drawInLiquid() in character.js) and open into a V behind,
// which bends round with the path when they turn. real wakes do that too: kelvin worked out that a
// boat's wake always opens at the same angle (about 19.5 degrees each side) however fast it goes,
// which is WAKE.angle. older points are thinner, so the arms taper off to nothing at the tail, and
// they swell a little every step (WAKE.stepPulse), since wading shoves the water a step at a time.
// like the wakes in sealubbers (thin soft lines along the path) and old wizard101 (a V off the front)
//
// turning: walking turns on the spot, but the wake comes off a source that follows the feet a little
// way behind (WAKE.round), like water pushed by the whole body, so its path rounds every corner off.
// each point remembers how sharply that path was bending there. the arm on the inside of a bend is
// drawn in and thinned the further it would reach into the bend, so it curves gently round rather
// than looping back over the path or folding in an elbow. it also fades with how far they've turned
// since it was made (WAKE.turnFade), so running round in circles leaves a curve trailing behind them,
// never rings. turning on the spot (tighter than the ring, WAKE.spin) pushes no water, so it makes no
// new wake and doesn't count towards that fade: turning round they walk back through the wake they
// had, and spinning round leaves it to fade like they'd stopped. that's all fixed when a point's
// dropped, and the arms only ever change smoothly as they age, so nothing jumps or vanishes from
// frame to frame (tests/wakes-check.js measures it).
//
// every arm is drawn solid on one see-through layer (Wakes.layerFor()), then the layer's laid over
// the surface at WAKE.opacity. so where an arm crosses itself or another wake (an enemy wading past)
// they just join up, rather than doubling up into blobs. they're only shown over the liquid's tiles,
// so they stop at the shore.
//
// a liquid's wake (tiles.js) makes its wakes stronger or fainter (thick lava's are faint), or 0 for
// none, and its surfaceColour is their colour. the rest is WAKE, the same for every liquid. only for
// show like particles: they never change the game, they're forgotten on changing map (loadMap() in
// sketch.js), and in multiplayer they'd be on each computer

// shared by every liquid
const WAKE = {
  // px walked between the points that make the arms. smaller is smoother but more of them to draw.
  // and how many times each arm's evened out to round off corners (Wakes.drawArm())
  spacing: 6,
  smoothing: 3,
  // seconds each point lasts, so how far back the arms reach
  life: 1.1,
  // degrees each arm opens out from the path. kelvin's is 19.5, a bit more reads better this small
  angle: 22,
  // the arms open this much as far up and down the screen as they do across it, since the surface is
  // seen at the game's angle, like the ring round them (LIQUID.ringSquash, config.js)
  squash: 0.6,
  // px/s that's a full strength wake, about the player's wading speed. slower is fainter, and faster
  // (rolling) is stronger up to maxStrength. under minSpeed there's none
  fullSpeed: 100,
  maxStrength: 1.3,
  minSpeed: 8,
  // how quickly the wake comes and goes as they start and stop (an approach() speed, utils.js), and
  // about how many px behind the feet its source follows, rounding off corners (Wakes.follow()).
  // more is rounder, but the arms come off further behind on a turn
  ease: 8,
  round: 20,
  // px wide at the head at full strength, thinning to nothing at the tail. taper over 1 keeps them
  // wide for longer, under 1 thins them sooner. opacity (0 to 1) is all of them, laid over the surface
  width: 3,
  taper: 0.7,
  opacity: 0.5,
  // how sharply the path's bending is evened out over this many px (Wakes.follow()), and a point's
  // dropped whenever the heading's turned this much (radians) since the last, so curves stay smooth.
  // inside is about how far into a bend the arm on its inside can go, as a part of the bend's
  // radius (drawArm())
  bendOver: 50,
  turnStep: 0.2,
  inside: 0.7,
  // turning tighter than the ring's width (a part of it, rx) is turning on the spot: by the first it
  // makes no new wake and doesn't count towards turnFade, and by the second it's back to normal
  // (Wakes.follow())
  spin: [0.35, 0.8],
  // radians turned since a bit of wake was made before it starts fading, and by when it's gone, so
  // circling only leaves a curve behind, not rings round them. zigzags cancel out, so only turning
  // round and round counts
  turnFade: [0.5, 1.8],
  // seconds a new point takes to be evened out with its neighbours (drawArm()), so the arm doesn't
  // shift as new points come
  settle: 0.15,
  // how much each step swells them (0 for not at all), one swell every FOOTSTEPS.stride px (config.js)
  stepPulse: 0.35,
  // moving further than this many px in one frame is a warp or respawn, so it starts a new wake
  // rather than drawing one across the map
  jump: TILE * 2,
  // seconds nobody's followed a wake before it's let go to fade, so a hit's freeze doesn't break it
  letGo: 0.3,
};

const Wakes = {
  // every wake that's still showing, and the one each character's making now
  list: [],
  following: new Map(),

  // called every frame `owner` (a Character) is in `liquid` (its tile). drops a point when they've
  // walked far enough or turned enough. deep (0 to 1) is how far in they are of that liquid's sink, so
  // it's faint near the shore where they're barely in. gives back how much wake they're making now
  // (0 to about 1, spinning round on the spot counts): none standing still, where ripples suit better
  follow(owner, liquid, deep, dt) {
    if (!liquid.wake) return 0;
    const x = owner.x;
    const y = owner.y + owner.h / 2;
    let wake = this.following.get(owner);
    if (wake && (wake.liquid !== liquid || Math.hypot(x - wake.x, y - wake.y) > WAKE.jump)) wake = null;
    if (!wake) {
      // the ring it comes off (drawInLiquid())
      const rx = (owner.w * LIQUID.ringWidth) / 2;
      wake = { owner, liquid, colour: hexToRgb(liquid.surfaceColour), rx, ry: rx * LIQUID.ringSquash, x, y, source: { x, y, moving: false }, angle: Math.PI / 2, dir: { x: 0, y: 1 }, bend: 0, turned: 0, travelling: 1, speed: 0, strength: 0, travelled: 0, idle: 0, points: [] }; // particles.js
      this.list.push(wake);
      this.following.set(owner, wake);
    }
    wake.idle = 0;
    const moved = Math.hypot(x - wake.x, y - wake.y);
    wake.x = x;
    wake.y = y;
    wake.travelled += moved;
    wake.speed = dt > 0 ? moved / dt : 0;
    // the source: where the wake comes off, following the feet a little way behind (WAKE.round px).
    // walking turns on the spot, so the feet's path is all corners, but water's pushed by the whole
    // body, which rounds off any turn sharper than it's wide. the arms come off the source's smooth
    // path, so they never fold over at a corner, and its heading turns smoothly by itself
    const s = wake.source;
    const pull = 1 - Math.exp(-moved / WAKE.round);
    const sx = s.x + (x - s.x) * pull;
    const sy = s.y + (y - s.y) * pull;
    const step = Math.hypot(sx - s.x, sy - s.y);
    if (step > 0.01) {
      const angle = Math.atan2(sy - s.y, sx - s.x);
      // how sharply the source's path is bending (radians turned a px, + towards side 1), evened out
      // over WAKE.bendOver px. it changes a little every frame, never all at once, and each point keeps
      // what it was when it was dropped, so what it does to the arms (drawArm()) never flickers
      if (s.moving) {
        const turn = turnBetween(wake.angle, angle);
        wake.bend += (turn / step - wake.bend) * (1 - Math.exp(-step / WAKE.bendOver));
        // how much this frame's turn was going round a bend rather than turning on the spot (turning
        // round, or spinning round and round), which pushes no water anywhere (WAKE.spin)
        wake.travelling = spun(wake, turn / step);
        // and how far it's turned all told going round bends (radians, + towards side 1), for fading
        // what's behind a turn. turning on the spot doesn't count, so turning round walks back
        // through the wake they had, and spinning leaves it to fade like they'd stopped
        wake.turned += turn * wake.travelling;
      }
      wake.angle = angle;
      wake.dir = { x: Math.cos(angle), y: Math.sin(angle) };
      s.moving = true;
    }
    s.x = sx;
    s.y = sy;
    // going up gently with speed, so slow waders still show and a roll isn't too much
    // and none turning on the spot
    const want = wake.speed < WAKE.minSpeed ? 0 : Math.min(WAKE.maxStrength, Math.sqrt(wake.speed / WAKE.fullSpeed)) * deep;
    wake.strength = approach(wake.strength, want * wake.travelling, WAKE.ease, dt);
    // a point every WAKE.spacing px along the source's path, and more often turning, so a curve's
    // made of enough of them
    const last = wake.points[0];
    if (!last) {
      if (s.moving) wake.points.unshift(this.point(wake, sx, sy));
    } else {
      const along = Math.hypot(sx - last.x, sy - last.y);
      const turned = Math.abs(turnBetween(last.angle, wake.angle));
      if (along >= WAKE.spacing || (along > 0.5 && turned > WAKE.turnStep)) wake.points.unshift(this.point(wake, sx, sy));
    }
    return want;
  },

  // a point on the path at x, y, how the wake is now. its speed is capped like its strength, so a roll
  // doesn't fling the arms out
  point(wake, x, y) {
    return { x, y, angle: wake.angle, dir: wake.dir, bend: wake.bend, turned: wake.turned, speed: Math.min(wake.speed, WAKE.fullSpeed * WAKE.maxStrength), strength: wake.strength * wake.travelling, pulse: 1 + WAKE.stepPulse * Math.cos((wake.travelled / FOOTSTEPS.stride) * Math.PI * 2), age: 0 };
  },

  // ages every point, and lets go of wakes nobody's making any more (out of the liquid, died, the map
  // changed under them) so they fade out where they are
  update(dt) {
    for (const wake of this.list) {
      wake.idle += dt;
      if (wake.idle > WAKE.letGo && this.following.get(wake.owner) === wake) this.following.delete(wake.owner);
      for (const p of wake.points) p.age += dt;
      while (wake.points.length && wake.points[wake.points.length - 1].age > WAKE.life) wake.points.pop();
    }
    this.list = this.list.filter((wake) => wake.points.length || this.following.get(wake.owner) === wake);
  },

  clear() {
    this.list = [];
    this.following.clear();
  },

  // every wake on screen, in world positions (inside camera.begin/end), clipped to the map's liquid
  // tiles. view is the camera's (camera.view())
  draw(view, map) {
    if (!this.list.length) return;
    const ctx = drawingContext;
    const layer = this.layerFor(ctx.canvas);
    layer.setTransform(1, 0, 0, 1, 0, 0);
    layer.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    layer.setTransform(ctx.getTransform());
    layer.lineCap = 'round';
    let drawn = false;
    for (const wake of this.list) {
      // the head is at their feet now, while they're still making it, so the arms start at the ring
      const points = this.following.get(wake.owner) === wake ? [this.point(wake, wake.x, wake.y), ...wake.points] : wake.points;
      if (points.length < 2 || !this.onScreen(points, view)) continue;
      const [r, g, b] = wake.colour;
      layer.strokeStyle = `rgb(${r}, ${g}, ${b})`;
      this.drawArm(layer, wake, points, 1);
      this.drawArm(layer, wake, points, -1);
      drawn = true;
    }
    if (!drawn) return;
    // all of them over the surface at once, see-through
    ctx.save();
    map.clipToLiquid(view); // tilemap.js
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha *= WAKE.opacity;
    ctx.drawImage(layer.canvas, 0, 0);
    ctx.restore();
  },

  // the see-through layer they're drawn solid on first, the canvas's size. drawn solid, where an arm
  // crosses itself or another wake it just joins up, rather than doubling up or leaving a gap
  layerFor(canvas) {
    if (this.layer?.canvas.width !== canvas.width || this.layer.canvas.height !== canvas.height) {
      const made = document.createElement('canvas');
      made.width = canvas.width;
      made.height = canvas.height;
      this.layer = made.getContext('2d');
    }
    return this.layer;
  },

  // close enough to the screen that some of it could show. the arms reach out from the points, so with
  // a tile to spare
  onScreen(points, view) {
    return points.some((p) => p.x > view.left - TILE && p.x < view.right + TILE && p.y > view.top - TILE && p.y < view.bottom + TILE);
  },

  // one arm, side 1 or -1, from the head (points[0]) back to the tail, on the layer (layerFor()). each
  // point is pushed out sideways from the path: first to the edge of the ring, then further the older
  // it is. it thins to nothing at the tail, which is its fade. everything about a point but its age
  // was fixed when it was dropped, so the arm only ever changes smoothly
  drawArm(layer, wake, points, side) {
    const spread = Math.tan((WAKE.angle * Math.PI) / 180);
    const middle = points.map((p) => {
      const nx = -p.dir.y * side;
      const ny = p.dir.x * side;
      // how far the ring's edge is that way (it's an ellipse, rx across and ry up and down)
      const ring = 1 / Math.hypot(nx / wake.rx, ny / wake.ry);
      const out = p.speed * p.age * spread;
      // on the inside of a bend there's only so much room (the bend's radius) before the arm reaches
      // over the path. reach is how much of that it wants, and the further in it reaches the thinner
      // it gets, so in a tight circle the inside arm all but goes rather than bunching up in the
      // middle, and the outside one spirals out like ripples
      const reach = p.bend * side > 0 ? (ring + out) * Math.abs(p.bend) : 0;
      // and it's drawn in towards the path, never quite as far as the bend's middle, so it can't
      // fold over itself in an elbow
      const inward = 1 / (1 + reach / WAKE.inside);
      // fading with age, and with how far they've turned since (WAKE.turnFade), so going round in a
      // circle it trails behind them part of the way round rather than drawing rings
      const [keep, gone] = WAKE.turnFade;
      const fade = Math.min(1 - p.age / WAKE.life, Math.max(0, Math.min(1, (gone - Math.abs(wake.turned - p.turned)) / (gone - keep))));
      return {
        x: p.x + nx * (ring + out) * inward,
        y: p.y + ny * (ring + out * WAKE.squash) * inward,
        width: WAKE.width * wake.liquid.wake * p.strength * p.pulse * fade ** WAKE.taper * Math.max(0, 1 - reach) ** 2,
        // how much it's evened out (below), less at both ends, so when a new point comes or the
        // oldest goes the ones next to it don't shift
        even: Math.min(1, fade * 3, p.age / WAKE.settle),
      };
    });
    // evened out with its neighbours a few times, so it curves rather than going round in corners
    for (let pass = 0; pass < WAKE.smoothing; pass++) {
      const was = middle.map((m) => ({ x: m.x, y: m.y }));
      for (let i = 1; i < middle.length - 1; i++) {
        middle[i].x = was[i].x + ((was[i - 1].x + was[i + 1].x) / 4 - was[i].x / 2) * middle[i].even;
        middle[i].y = was[i].y + ((was[i - 1].y + was[i + 1].y) / 4 - was[i].y / 2) * middle[i].even;
      }
    }
    // a bit at a time, each as wide as its ends. it's solid, so where they overlap doesn't show
    for (let i = 0; i < middle.length - 1; i++) {
      const width = (middle[i].width + middle[i + 1].width) / 2;
      if (width < 0.1) continue;
      layer.lineWidth = width;
      layer.beginPath();
      layer.moveTo(middle[i].x, middle[i].y);
      layer.lineTo(middle[i + 1].x, middle[i + 1].y);
      layer.stroke();
    }
  },
};

// how much going round a bend (radians a px) is walking along rather than spinning on the spot
// (WAKE.spin): 1 on bends wider than its ring, down to 0 curling round tighter
function spun(wake, bend) {
  const radius = 1 / Math.max(Math.abs(bend), 1e-9);
  const [none, all] = WAKE.spin;
  return Math.min(1, Math.max(0, (radius / wake.rx - none) / (all - none)));
}

// how far a heading has to turn to get from one angle to another (radians), the short way round,
// from -PI to PI
function turnBetween(from, to) {
  const d = to - from;
  return Math.atan2(Math.sin(d), Math.cos(d));
}
