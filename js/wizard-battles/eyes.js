// eyes around the crystal ball follow the cursor (moves the iris with --ex/--ey).
// if there's no mouse for a bit they just look around randomly
(function () {
  'use strict';

  var eyes = Array.prototype.slice.call(document.querySelectorAll('.wb-cb-eye'));
  var cluster = document.querySelector('.wb-crystal-ball-cluster');
  if (!eyes.length || !cluster) return;

  // max iris movement in svg units (eye is 120x78)
  var MAX_X = 17;
  var MAX_Y = 7;
  // px away before they look all the way over
  var FULL_LOOK_DIST = 260;
  var IDLE_AFTER = 4000; // ms
  var EASE = 0.14;

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var pointer = { x: 0, y: 0, at: -Infinity };
  var glance = { x: 0, y: 0, next: 0 };
  var current = eyes.map(function () { return { x: 0, y: 0 }; });
  var running = false;

  function onPointer(e) {
    // ignore touch drags (that's scrolling), taps still count
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

  // the eyes are rotated in css so the direction needs rotating too
  function eyeAngle(el) {
    var t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 0;
    var m = new DOMMatrixReadOnly(t);
    return Math.atan2(m.b, m.a);
  }
  var angles = eyes.map(eyeAngle);

  function pickGlance(now) {
    // 25% chance to look straight ahead
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
    // performance.now() to match the pointer timestamps
    var now = performance.now();
    var idle = now - pointer.at > IDLE_AFTER;
    if (idle && now > glance.next) pickGlance(now);

    for (var i = 0; i < eyes.length; i++) {
      // target, -1 to 1
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

  // only run when it's on screen
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) start();
      else running = false;
    }, { rootMargin: '100px' }).observe(cluster);
  } else {
    start();
  }
})();
