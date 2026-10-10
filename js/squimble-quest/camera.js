// the camera: decides which part of the world is on screen.
// there are two kinds of position:
//   world:  where things actually are, like the player at (-900, 400). (0, 0) is the middle of the world
//   screen: canvas pixels, from (0, 0) at the top left to (GAME_W, GAME_H). the mouse, crosshair and ui
//           use these
// the camera's x, y is the world point that shows in the middle of the screen
class Camera {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    this.zoom = 1;

    // eased towards every frame in update(). target can be anything with an x and y (the player, or a
    // point like { x: 100, y: 50 }), or null to stay where it is
    this.target = null;
    this.targetZoom = 1;

    // copied from the config so they can be changed on the fly (like a slow pan for a cutscene)
    this.followSpeed = CAMERA.followSpeed;
    this.zoomSpeed = CAMERA.zoomSpeed;

    // the area the view stays inside, so you never see past the edge of the world. loadMap()
    // (sketch.js) and the editor's resize set it to the map's edges. null means it can go anywhere
    this.bounds = null;

    // a timed glide that's happening (focusOn(), release()), or null. while there's one it moves the
    // camera instead of the normal following
    this.glide = null;
    // the target and zoom from before focusOn(), so release() can go back to them
    this.beforeFocus = null;

    // screen shake (shake()): the px it started at, its seconds long and left, how many px it's shaking
    // by now, and this frame's jolt, which only moves the drawing (begin(), drawnPosition()), never the
    // camera itself
    this.shakeSize = 0;
    this.shakeTime = 0;
    this.shakeLeft = 0;
    this.shaking = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }

  // shakes the screen by px, settling to nothing over `time` seconds, quickly at first. a bigger shake
  // takes over a smaller one instead of adding up, so lots of little hits don't turn into an
  // earthquake. weapons shake it with their shake and shakeTime (hitWith() in weapons.js)
  shake(px, time) {
    if (px <= this.shaking || time <= 0) return;
    this.shakeSize = px;
    this.shakeTime = time;
    this.shakeLeft = time;
  }

  // ---------- telling the camera what to do ----------

  // keep following something that moves, like camera.follow(player)
  follow(target) {
    // this takes over from any glide
    this.endGlide();
    this.target = target;
  }

  // glide over to a fixed point and stay there, like camera.lookAt(300, -120)
  lookAt(x, y) {
    this.target = { x, y };
  }

  // smoothly zoom, like camera.zoomTo(2)
  zoomTo(zoom) {
    this.targetZoom = constrain(zoom, CAMERA.minZoom, CAMERA.maxZoom);
  }

  // glide to a point and zoom over `duration` seconds, then stay there until release(). it eases in
  // and out so there's no jolt, unlike following, which starts at full speed. for dialogue.js and
  // cutscenes: camera.focusOn(300, -120, 1.5, 0.8)
  focusOn(x, y, zoom, duration) {
    // only saved the first time, so focusing again mid conversation still goes back to the player
    if (!this.beforeFocus) this.beforeFocus = { target: this.target, zoom: this.targetZoom };
    this.startGlide({ x, y }, constrain(zoom, CAMERA.minZoom, CAMERA.maxZoom), duration, false);
  }

  // glide back to the target and zoom from before focusOn() over `duration` seconds, then carry on
  // following like normal
  release(duration) {
    if (!this.beforeFocus) return;
    this.startGlide(this.beforeFocus.target, this.beforeFocus.zoom, duration, true);
  }

  // to: anything with an x and y (if it moves, the glide keeps up with it). finish: go back to normal
  // following afterwards
  startGlide(to, zoom, duration, finish) {
    this.glide = {
      fromX: this.x, fromY: this.y, fromZoom: this.zoom,
      to, toZoom: zoom,
      time: 0, duration, finish,
    };
  }

  // stops a glide straight away. if it was a focusOn() it goes back to following the old target
  // (without gliding), so it never gets left looking at the wrong thing
  endGlide() {
    if (this.beforeFocus) {
      this.target = this.beforeFocus.target;
      this.targetZoom = this.beforeFocus.zoom;
    }
    this.glide = null;
    this.beforeFocus = null;
  }

  // jump straight to the target and zoom with no easing (starting the game, changing maps)
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
    } else {
      this.zoom = approach(this.zoom, this.targetZoom, this.zoomSpeed, dt);
      if (this.target) {
        this.x = approach(this.x, this.target.x, this.followSpeed, dt);
        this.y = approach(this.y, this.target.y, this.followSpeed, dt);
      }
    }
    this.keepInBounds();
    this.updateShake(dt);
  }

  // a new random jolt every frame, kept inside the bounds so a shake by the edge of the map doesn't
  // show past it. it's only for show, so it uses Math.random() rather than randomBetween() (utils.js)
  updateShake(dt) {
    this.shakeLeft = Math.max(0, this.shakeLeft - dt);
    this.shaking = this.shakeLeft > 0 ? this.shakeSize * (this.shakeLeft / this.shakeTime) ** 2 : 0;
    const jolt = () => (Math.random() * 2 - 1) * this.shaking;
    this.shakeX = jolt();
    this.shakeY = jolt();
    if (!this.bounds || !this.shaking) return;
    const half = this.halfView();
    this.shakeX = this.clampAxis(this.x + this.shakeX, half.w, this.bounds.left, this.bounds.right) - this.x;
    this.shakeY = this.clampAxis(this.y + this.shakeY, half.h, this.bounds.top, this.bounds.bottom) - this.y;
  }

  updateGlide(dt) {
    const g = this.glide;
    g.time = Math.min(g.time + dt, g.duration);
    // how far through it is, 0 to 1, eased (utils.js)
    const t = easeInOut(g.duration > 0 ? g.time / g.duration : 1);

    this.x = lerp(g.fromX, g.to.x, t);
    this.y = lerp(g.fromY, g.to.y, t);
    this.zoom = lerp(g.fromZoom, g.toZoom, t);

    // when a release() finishes it hands back to normal following. a finished focusOn() just stays
    // put until release() is called
    if (g.time >= g.duration && g.finish) {
      this.target = g.to;
      this.zoom = g.toZoom;
      this.targetZoom = g.toZoom;
      this.glide = null;
      this.beforeFocus = null;
    }
  }

  // stops you seeing past the edge of the world. near an edge the camera stops and the player walks
  // off-centre instead
  keepInBounds() {
    if (!this.bounds) return;
    const half = this.halfView();
    this.x = this.clampAxis(this.x, half.w, this.bounds.left, this.bounds.right);
    this.y = this.clampAxis(this.y, half.h, this.bounds.top, this.bounds.bottom);
  }

  // keeps the view (`half` either side of value) between min and max. if the world is smaller than
  // the view on this axis (zoomed right out), it just centres it instead
  clampAxis(value, half, min, max) {
    if (max - min <= half * 2) return (min + max) / 2;
    return constrain(value, min + half, max - half);
  }

  // ---------- drawing ----------

  // between begin() and end() you draw in world positions, and after end() it's screen positions
  // again (for ui). p5 applies these from the bottom up: move the camera's point to (0, 0), scale by
  // the zoom, then move (0, 0) to the middle of the screen
  begin() {
    push();
    translate(GAME_W / 2, GAME_H / 2);
    scale(this.zoom);
    translate(-this.pixelSnap(this.x + this.shakeX), -this.pixelSnap(this.y + this.shakeY));
  }

  end() {
    pop();
  }

  // rounds to a whole pixel on the real screen (that's why the zoom and pixelDensity() are in there,
  // see fitResolution() in sketch.js), because drawing the world half a pixel off blurs every edge. on
  // a sharper screen that means smaller steps, so the camera glides smoother
  pixelSnap(value) {
    const px = this.zoom * pixelDensity();
    return Math.round(value * px) / px;
  }

  // exactly where begin() puts a world position on the screen. unlike worldToScreen() this uses the
  // pixel snapped position, so things drawn in screen positions line up with things drawn through the
  // camera (the tiles in tilemap.js need this)
  drawnPosition(wx, wy) {
    return {
      x: (wx - this.pixelSnap(this.x + this.shakeX)) * this.zoom + GAME_W / 2,
      y: (wy - this.pixelSnap(this.y + this.shakeY)) * this.zoom + GAME_H / 2,
    };
  }

  // ---------- converting positions ----------

  // like working out what the mouse is pointing at
  screenToWorld(sx, sy) {
    return {
      x: (sx - GAME_W / 2) / this.zoom + this.x,
      y: (sy - GAME_H / 2) / this.zoom + this.y,
    };
  }

  // like putting some ui above an enemy
  worldToScreen(wx, wy) {
    return {
      x: (wx - this.x) * this.zoom + GAME_W / 2,
      y: (wy - this.y) * this.zoom + GAME_H / 2,
    };
  }

  // half the screen's size in world pixels (it gets smaller when zoomed in)
  halfView() {
    return {
      w: GAME_W / 2 / this.zoom,
      h: GAME_H / 2 / this.zoom,
    };
  }

  // the part of the world you can see, so drawing can skip anything off screen (world.js)
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
