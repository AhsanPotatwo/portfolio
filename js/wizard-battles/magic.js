// The Wizard Battles page's "spell" effects, layered over the page:
//
//  - Wand trail: moving the mouse leaves a short trail of twinkling
//    four-pointed sparkles that drift, spin and fade.
//  - Spell burst: clicking or tapping anywhere throws out a ring of
//    sparkles and a quick expanding rune ring from that point.
//  - Materialise: sections fade in out of a soft blur as they're scrolled
//    to, once each.
//
// The sparkles are drawn on the fixed #wbSparkles canvas, which ignores the
// pointer so it never gets in the way of clicking anything. Everything here
// is skipped for people who've asked for reduced motion.
(function () {
  'use strict';

  var reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  // ---------- materialise on scroll ----------
  var revealTargets = document.querySelectorAll(
    '.wb-intro-text, .wb-intro-art, .wb-panel .wb-art, .wb-panel .wb-copy, .wb-cta-card'
  );
  if ('IntersectionObserver' in window && revealTargets.length) {
    var revealer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealer.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    Array.prototype.forEach.call(revealTargets, function (el) {
      el.classList.add('wb-reveal');
      revealer.observe(el);
    });
  }

  // ---------- sparkles ----------
  var canvas = document.getElementById('wbSparkles');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');

  var COLORS = ['191,146,255', '233,220,255', '115,90,255', '255,214,150'];
  var MAX_SPARKS = 160;
  // one trail sparkle per this many px the cursor travels
  var TRAIL_SPACING = 16;

  var width = 0, height = 0, dpr = 1;
  var sparks = [];
  var rings = [];
  var running = false;
  var last = 0;
  var lastTrail = null;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  function rand(min, max) { return min + Math.random() * (max - min); }

  function addSpark(x, y, vx, vy, size, life) {
    if (sparks.length >= MAX_SPARKS) sparks.shift();
    sparks.push({
      x: x, y: y, vx: vx, vy: vy,
      size: size,
      rot: rand(0, Math.PI),
      spin: rand(-3, 3),
      life: 0,
      lifespan: life,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]
    });
    start();
  }

  // a four-pointed star, like the ✦ used elsewhere on the page
  function drawStar(s, alpha) {
    var r = s.size;
    var w = r * 0.28;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.shadowColor = 'rgba(' + s.color + ',' + alpha.toFixed(3) + ')';
    ctx.shadowBlur = r * 2.2;
    ctx.fillStyle = 'rgba(' + s.color + ',' + alpha.toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(w, -w, r, 0);
    ctx.quadraticCurveTo(w, w, 0, r);
    ctx.quadraticCurveTo(-w, w, -r, 0);
    ctx.quadraticCurveTo(-w, -w, 0, -r);
    ctx.fill();
    ctx.restore();
  }

  function frame() {
    if (!running) return;
    var now = performance.now();
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    ctx.clearRect(0, 0, width, height);

    for (var i = sparks.length - 1; i >= 0; i--) {
      var s = sparks[i];
      s.life += dt;
      if (s.life >= s.lifespan) { sparks.splice(i, 1); continue; }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.96;
      s.vy = s.vy * 0.96 + 18 * dt;   // a little gravity, so they settle
      s.rot += s.spin * dt;
      var t = s.life / s.lifespan;
      // quick pop in, then shrink and fade out
      var alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      var scale = t < 0.15 ? 0.6 + t / 0.15 * 0.4 : 1 - (t - 0.15) * 0.7;
      var size = s.size;
      s.size = size * scale;
      drawStar(s, Math.max(0, alpha) * 0.9);
      s.size = size;
    }

    for (var j = rings.length - 1; j >= 0; j--) {
      var r = rings[j];
      r.life += dt;
      if (r.life >= r.lifespan) { rings.splice(j, 1); continue; }
      var p = r.life / r.lifespan;
      var ease = 1 - Math.pow(1 - p, 3);
      var radius = 6 + ease * r.maxR;
      ctx.strokeStyle = 'rgba(191,146,255,' + ((1 - p) * 0.55).toFixed(3) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      // a dashed inner ring turning the other way, like a tiny spell circle
      ctx.save();
      ctx.setLineDash([3, 6]);
      ctx.lineDashOffset = -p * 40;
      ctx.strokeStyle = 'rgba(233,220,255,' + ((1 - p) * 0.4).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (sparks.length || rings.length) {
      requestAnimationFrame(frame);
    } else {
      running = false;
    }
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  // wand trail: mouse/pen only (on touch screens a finger drag is scrolling)
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    var x = e.clientX, y = e.clientY;
    if (!lastTrail) { lastTrail = { x: x, y: y }; return; }
    var dx = x - lastTrail.x, dy = y - lastTrail.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < TRAIL_SPACING) return;
    // spread along the path so fast movements still leave an even trail
    var steps = Math.min(4, Math.floor(dist / TRAIL_SPACING));
    for (var i = 1; i <= steps; i++) {
      var f = i / steps;
      addSpark(
        lastTrail.x + dx * f + rand(-4, 4),
        lastTrail.y + dy * f + rand(-4, 4),
        rand(-12, 12), rand(-20, 4),
        rand(2.5, 5.5),
        rand(0.55, 0.95)
      );
    }
    lastTrail = { x: x, y: y };
  }, { passive: true });

  document.documentElement.addEventListener('mouseleave', function () {
    lastTrail = null;
  });

  // spell burst on click/tap
  window.addEventListener('pointerdown', function (e) {
    var x = e.clientX, y = e.clientY;
    var count = 14;
    for (var i = 0; i < count; i++) {
      var a = (i / count) * Math.PI * 2 + rand(-0.15, 0.15);
      var speed = rand(90, 170);
      addSpark(x, y, Math.cos(a) * speed, Math.sin(a) * speed, rand(3, 6.5), rand(0.6, 1));
    }
    rings.push({ x: x, y: y, life: 0, lifespan: 0.6, maxR: 46 });
    start();
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      sparks.length = 0;
      rings.length = 0;
      ctx.clearRect(0, 0, width, height);
    }
  });
})();
