// the camera: which part of the world is on screen.
// two kinds of position:
//   world:  where things are, e.g. the player at (-900, 400). (0, 0) is the world's middle
//   screen: canvas pixels, (0, 0) top left to (960, 540). the mouse, crosshair and ui use these
// x, y is the world point at the screen's middle
class Camera {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    this.zoom = 1;

    // eased towards each frame in update(). target is anything with x, y (the player, a point like
    // { x: 100, y: 50 }), null to stay put
    this.target = null;
    this.targetZoom = 1;

    // copies of config, changeable on the fly (e.g. a slow cutscene pan)
    this.followSpeed = CAMERA.followSpeed;
    this.zoomSpeed = CAMERA.zoomSpeed;

    // area the view stays inside, so you never see past the world's edge. set to the map's edges by
    // loadMap() (sketch.js) and the editor's resize. null: anywhere
    this.bounds = null;

    // a timed glide in progress (focusOn(), release()) or null. it moves the camera instead of following
    this.glide = null;
    // target and zoom before focusOn(), for release()
    this.beforeFocus = null;
  }

  // ---------- telling the camera what to do ----------

  // keep following something moving, e.g. camera.follow(player)
  follow(target) {
    // takes over from a glide
    this.endGlide();
    this.target = target;
  }

  // glide to a fixed point and stay, e.g. camera.lookAt(300, -120)
  lookAt(x, y) {
    this.target = { x, y };
  }

  // smooth zoom, e.g. camera.zoomTo(2)
  zoomTo(zoom) {
    this.targetZoom = constrain(zoom, CAMERA.minZoom, CAMERA.maxZoom);
  }

  // glide to a point and zoom over duration seconds, then stay until release(). eases in and out (no
  // jolt), unlike following, which starts at full speed. for dialogue.js and cutscenes:
  // camera.focusOn(300, -120, 1.5, 0.8)
  focusOn(x, y, zoom, duration) {
    // only remembered the first time, so refocusing mid-conversation still returns to the player
    if (!this.beforeFocus) this.beforeFocus = { target: this.target, zoom: this.targetZoom };
    this.startGlide({ x, y }, constrain(zoom, CAMERA.minZoom, CAMERA.maxZoom), duration, false);
  }

  // glide back to the target and zoom from before focusOn() over duration seconds, then follow as normal
  release(duration) {
    if (!this.beforeFocus) return;
    this.startGlide(this.beforeFocus.target, this.beforeFocus.zoom, duration, true);
  }

  // to: anything with x, y (a moving one is tracked during the glide). finish: follow normally after
  startGlide(to, zoom, duration, finish) {
    this.glide = {
      fromX: this.x, fromY: this.y, fromZoom: this.zoom,
      to, toZoom: zoom,
      time: 0, duration, finish,
    };
  }

  // stops a glide now. after a focusOn(), goes back to following the old target (no glide), so it's
  // never left looking at the wrong thing
  endGlide() {
    if (this.beforeFocus) {
      this.target = this.beforeFocus.target;
      this.targetZoom = this.beforeFocus.zoom;
    }
    this.glide = null;
    this.beforeFocus = null;
  }

  // jump to the target and zoom with no easing (game start, map changes)
  snap() {
    this.endGlide();
    if (this.target) {
      this.x = this.target.x;
      this.y = this.target.y;
    }
    this.zoom = this.targetZoom;
    this.keepInBounds();
  }

  // ---------- every frame ----------

  update(dt) {
    if (this.glide) {
      this.updateGlide(dt);
      this.keepInBounds();
      return;
    }

    this.zoom = approach(this.zoom, this.targetZoom, this.zoomSpeed, dt);

    if (this.target) {
      this.x = approach(this.x, this.target.x, this.followSpeed, dt);
      this.y = approach(this.y, this.target.y, this.followSpeed, dt);
    }

    this.keepInBounds();
  }

  updateGlide(dt) {
    const g = this.glide;
    g.time = Math.min(g.time + dt, g.duration);
    // progress 0 to 1, eased (utils.js)
    const t = easeInOut(g.duration > 0 ? g.time / g.duration : 1);

    this.x = lerp(g.fromX, g.to.x, t);
    this.y = lerp(g.fromY, g.to.y, t);
    this.zoom = lerp(g.fromZoom, g.toZoom, t);

    // a finished release() hands back to following; a finished focusOn() holds until release()
    if (g.time >= g.duration && g.finish) {
      this.target = g.to;
      this.zoom = g.toZoom;
      this.targetZoom = g.toZoom;
      this.glide = null;
      this.beforeFocus = null;
    }
  }

  // no seeing past the world's edge: near one the camera stops and the player walks off-centre
  keepInBounds() {
    if (!this.bounds) return;
    const half = this.halfView();
    this.x = this.clampAxis(this.x, half.w, this.bounds.left, this.bounds.right);
    this.y = this.clampAxis(this.y, half.h, this.bounds.top, this.bounds.bottom);
  }

  // keeps the view (half each side) within min..max. if the world's smaller than the view on this
  // axis (zoomed right out), centres it instead
  clampAxis(value, half, min, max) {
    if (max - min <= half * 2) return (min + max) / 2;
    return constrain(value, min + half, max - half);
  }

  // ---------- drawing ----------

  // between begin() and end(), draw in world positions; after end(), screen positions (ui).
  // p5 applies these bottom first: shift the camera's point to (0, 0), scale by zoom, move (0, 0) to
  // the screen's middle
  begin() {
    push();
    translate(GAME_W / 2, GAME_H / 2);
    scale(this.zoom);
    translate(-this.pixelSnap(this.x), -this.pixelSnap(this.y));
  }

  end() {
    pop();
  }

  // rounds to a whole screen pixel (hence the zoom), since drawing the world half a pixel over blurs
  // every edge
  pixelSnap(value) {
    return Math.round(value * this.zoom) / this.zoom;
  }

  // exactly where begin() puts a world position on screen. unlike worldToScreen(), uses the
  // pixel-snapped position, so screen drawing lines up with camera drawing (tiles, tilemap.js)
  drawnPosition(wx, wy) {
    return {
      x: (wx - this.pixelSnap(this.x)) * this.zoom + GAME_W / 2,
      y: (wy - this.pixelSnap(this.y)) * this.zoom + GAME_H / 2,
    };
  }

  // ---------- converting positions ----------

  // e.g. what the mouse points at
  screenToWorld(sx, sy) {
    return {
      x: (sx - GAME_W / 2) / this.zoom + this.x,
      y: (sy - GAME_H / 2) / this.zoom + this.y,
    };
  }

  // e.g. ui above an enemy
  worldToScreen(wx, wy) {
    return {
      x: (wx - this.x) * this.zoom + GAME_W / 2,
      y: (wy - this.y) * this.zoom + GAME_H / 2,
    };
  }

  // half the screen size in world pixels (smaller when zoomed in)
  halfView() {
    return {
      w: GAME_W / 2 / this.zoom,
      h: GAME_H / 2 / this.zoom,
    };
  }

  // the visible world area, for drawing only what's seen (world.js)
  view() {
    const half = this.halfView();
    return {
      left: this.x - half.w,
      right: this.x + half.w,
      top: this.y - half.h,
      bottom: this.y + half.h,
    };
  }
}
