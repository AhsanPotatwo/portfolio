// the camera decides which part of the world is on screen.
//
// there are two kinds of position in the game:
//   world:  where things really are, e.g. the player at (-900, 400). (0, 0) is the middle of the world
//   screen: pixels on the canvas, from (0, 0) top left to (960, 540) bottom right.
//           the mouse, crosshair and anything else ui uses these
// the camera turns one into the other.
//
// x, y is the world point shown in the middle of the screen
class Camera {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    this.zoom = 1;

    // where the camera is heading. it eases towards these a bit each frame in update().
    // target is anything with an x and y: the player, an enemy, or a plain point like { x: 100, y: 50 }.
    // null means stay put
    this.target = null;
    this.targetZoom = 1;

    // copied from config so they can be changed on the fly, e.g. a slow pan for a cutscene
    this.followSpeed = CAMERA.followSpeed;
    this.zoomSpeed = CAMERA.zoomSpeed;

    // the area the camera has to stay inside, so you never see past the edge of the world.
    // null lets it go anywhere
    this.bounds = WORLD;
  }

  // ---------- telling the camera what to do ----------

  // keep following something that moves, e.g. camera.follow(player)
  follow(target) {
    this.target = target;
  }

  // glide over to a fixed point and stay there, e.g. for a cutscene: camera.lookAt(300, -120)
  lookAt(x, y) {
    this.target = { x, y };
  }

  // change the zoom smoothly, e.g. camera.zoomTo(2) to see everything twice as big
  zoomTo(zoom) {
    this.targetZoom = constrain(zoom, CAMERA.minZoom, CAMERA.maxZoom);
  }

  // jump straight to the target and zoom without easing. for when the game starts,
  // or the player teleports, when gliding across the map would look wrong
  snap() {
    if (this.target) {
      this.x = this.target.x;
      this.y = this.target.y;
    }
    this.zoom = this.targetZoom;
    this.keepInBounds();
  }

  // ---------- every frame ----------

  update(dt) {
    this.zoom = approach(this.zoom, this.targetZoom, this.zoomSpeed, dt);

    if (this.target) {
      this.x = approach(this.x, this.target.x, this.followSpeed, dt);
      this.y = approach(this.y, this.target.y, this.followSpeed, dt);
    }

    this.keepInBounds();
  }

  // stops the camera showing past the edge of the world. near an edge the camera stops moving,
  // and the player walks away from the middle of the screen towards the edge instead
  keepInBounds() {
    if (!this.bounds) return;
    const half = this.halfView();
    this.x = this.clampAxis(this.x, half.w, this.bounds.left, this.bounds.right);
    this.y = this.clampAxis(this.y, half.h, this.bounds.top, this.bounds.bottom);
  }

  // keeps the camera far enough from min and max that the screen (half on each side) stays between them.
  // if the world is smaller than the screen on this axis (zoomed right out) that can't happen,
  // so it sits in the middle of the world instead
  clampAxis(value, half, min, max) {
    if (max - min <= half * 2) return (min + max) / 2;
    return constrain(value, min + half, max - half);
  }

  // ---------- drawing ----------

  // anything drawn between begin() and end() uses world positions, and ends up in the right place
  // on screen. anything drawn after end() uses screen positions again (for ui).
  //
  // p5 applies these to every point drawn, bottom one first:
  //   1. shift the world so the camera's point is at (0, 0)
  //   2. scale everything around that point by the zoom
  //   3. move (0, 0) to the middle of the screen
  // so the camera's point ends up in the middle of the screen, at the right size
  begin() {
    push();
    translate(GAME_W / 2, GAME_H / 2);
    scale(this.zoom);
    translate(-this.pixelSnap(this.x), -this.pixelSnap(this.y));
  }

  end() {
    pop();
  }

  // the camera glides between pixels, and drawing the whole world half a pixel over makes every
  // edge blurry. this rounds its position to the nearest whole pixel on screen (not in the world,
  // hence the zoom) so everything stays sharp
  pixelSnap(value) {
    return Math.round(value * this.zoom) / this.zoom;
  }

  // ---------- converting positions ----------

  // a point on screen → where that is in the world. e.g. what the mouse is pointing at
  screenToWorld(sx, sy) {
    return {
      x: (sx - GAME_W / 2) / this.zoom + this.x,
      y: (sy - GAME_H / 2) / this.zoom + this.y,
    };
  }

  // a point in the world → where it is on screen. e.g. for a name tag or health bar
  // drawn as ui above an enemy
  worldToScreen(wx, wy) {
    return {
      x: (wx - this.x) * this.zoom + GAME_W / 2,
      y: (wy - this.y) * this.zoom + GAME_H / 2,
    };
  }

  // half the width and height of the screen, measured in world pixels.
  // zoomed in, the screen covers less of the world, so these get smaller
  halfView() {
    return {
      w: GAME_W / 2 / this.zoom,
      h: GAME_H / 2 / this.zoom,
    };
  }

  // the part of the world that's on screen right now, in world positions.
  // used to only draw what can be seen (see world.js)
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
