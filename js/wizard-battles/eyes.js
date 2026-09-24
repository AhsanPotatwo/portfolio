// Makes the eyes floating around the crystal ball ("What is Wizard Battles?")
// follow the cursor. Each eye is an inline SVG using the shared #wbEye
// drawing (see the top of wizard-battles.html), whose iris + pupil group is
// shifted by the --ex/--ey custom properties set here, in the eye's own
// drawing units. The iris is clipped to the white of the eye, so when it
// looks far to one side it tucks under the edge like a real eye.
//
// With no mouse (phones, or the cursor off the page for a while) the eyes
// glance around on their own, all looking the same way.
(function () {
  'use strict';

  var eyes = Array.prototype.slice.call(document.querySelectorAll('.wb-cb-eye'));
  var cluster = document.querySelector('.wb-crystal-ball-cluster');
  if (!eyes.length || !cluster) return;

  // how far the iris can move, in the eye drawing's units (it's 120x78).
  // Wider than tall because the eye is.
  var MAX_X = 17;
  var MAX_Y = 7;
  // how far away (px) the cursor has to be before the eyes look all the way
  // over; closer than this they look proportionally less far
  var FULL_LOOK_DIST = 260;
  // after this long (ms) without the cursor moving, go back to glancing around
  var IDLE_AFTER = 4000;
  // fraction of the remaining distance covered each frame, for smooth motion
  var EASE = 0.14;

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var pointer = { x: 0, y: 0, at: -Infinity };
  var glance = { x: 0, y: 0, next: 0 };
  var current = eyes.map(function () { return { x: 0, y: 0 }; });
  var running = false;

  function onPointer(e) {
    // touch drags scroll the page, so only a real mouse/pen steers the eyes
    // continuously; a tap still makes them look at where it landed
    if (e.pointerType === 'touch' && e.type === 'pointermove') return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.at = performance.now();
  }
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('pointerdown', onPointer, { passive: true });
  document.documentElement.addEventListener('mouseleave', function () {
    pointer.at = -Infinity;
  });

  // Each eye is rotated in the CSS, so a direction on screen has to be
  // turned into the eye's own tilted frame before moving the iris.
  function eyeAngle(el) {
    var t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 0;
    var m = new DOMMatrixReadOnly(t);
    return Math.atan2(m.b, m.a);
  }
  var angles = eyes.map(eyeAngle);

  function pickGlance(now) {
    // sometimes look straight ahead, otherwise a random direction
    if (Math.random() < 0.25) {
      glance.x = 0;
      glance.y = 0;
    } else {
      var a = Math.random() * Math.PI * 2;
      var r = 0.45 + Math.random() * 0.55;
      glance.x = Math.cos(a) * r;
      glance.y = Math.sin(a) * r;
    }
    glance.next = now + 1400 + Math.random() * 2200;
  }

  function frame() {
    if (!running) return;
    // same clock as the pointer timestamps (the time rAF passes in isn't
    // guaranteed to line up with it)
    var now = performance.now();
    var idle = now - pointer.at > IDLE_AFTER;
    if (idle && now > glance.next) pickGlance(now);

    for (var i = 0; i < eyes.length; i++) {
      // where the iris should head to, from -1 to 1 on each axis
      var gx, gy;
      if (idle) {
        gx = reduceMotion ? 0 : glance.x;
        gy = reduceMotion ? 0 : glance.y;
      } else {
        var r = eyes[i].getBoundingClientRect();
        var vx = pointer.x - (r.left + r.width / 2);
        var vy = pointer.y - (r.top + r.height / 2);
        var c = Math.cos(-angles[i]);
        var s = Math.sin(-angles[i]);
        var lx = vx * c - vy * s;
        var ly = vx * s + vy * c;
        var dist = Math.sqrt(lx * lx + ly * ly) || 1;
        var k = Math.min(1, dist / FULL_LOOK_DIST);
        gx = (lx / dist) * k;
        gy = (ly / dist) * k;
      }

      var cur = current[i];
      cur.x += (gx * MAX_X - cur.x) * EASE;
      cur.y += (gy * MAX_Y - cur.y) * EASE;
      eyes[i].style.setProperty('--ex', cur.x.toFixed(2));
      eyes[i].style.setProperty('--ey', cur.y.toFixed(2));
    }
    requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }

  // only animate while the crystal ball is on screen
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) start();
      else running = false;
    }, { rootMargin: '100px' }).observe(cluster);
  } else {
    start();
  }
})();
