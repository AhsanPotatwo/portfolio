// Background for the Wizard Battles page, replacing the home page's star
// field: tiny glowing motes of "magic dust" that slowly rise and sway, like
// embers drifting off a spell, each fading in and out over its life. Motes
// near the mouse drift away from it and glow a little brighter, as if
// stirred by a wand. Kept sparse and dim on purpose so it sits behind the
// page rather than competing with it. Drawn on the fixed #wbMotes canvas.
(function () {
  'use strict';

  var canvas = document.getElementById('wbMotes');
  if (!canvas || !canvas.getContext) return;

  var reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ctx = canvas.getContext('2d');

  // mostly orchid/violet, some magenta, and the odd warm gold one like
  // candlelight (the page's palette, see the top of wizard-battles.css)
  var COLORS = [
    { rgb: '233,168,255', w: 5 },
    { rgb: '167,120,255', w: 3 },
    { rgb: '230,90,240', w: 1.5 },
    { rgb: '255,214,150', w: 1.4 }
  ];
  // one mote per this many square px of screen, capped
  var DENSITY = 22000;
  var MAX_MOTES = 70;

  var width = 0, height = 0, dpr = 1;
  var motes = [];
  var running = false;
  var last = 0;
  // how close (px) the mouse has to be to stir a mote
  var STIR_RADIUS = 130;
  var mouse = { x: 0, y: 0, active: false };

  function pickColor() {
    var total = 0, i;
    for (i = 0; i < COLORS.length; i++) total += COLORS[i].w;
    var r = Math.random() * total;
    for (i = 0; i < COLORS.length; i++) {
      r -= COLORS[i].w;
      if (r <= 0) return COLORS[i].rgb;
    }
    return COLORS[0].rgb;
  }

  // anywhere on screen when first filling it, otherwise just below the bottom
  function makeMote(anywhere) {
    return {
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : height + 10,
      r: 0.6 + Math.random() * 1.6,
      rise: 6 + Math.random() * 14,          // px per second upwards
      swayAmp: 6 + Math.random() * 18,        // px either side
      swaySpeed: 0.2 + Math.random() * 0.5,   // radians per second
      phase: Math.random() * Math.PI * 2,
      life: 0,
      lifespan: 9 + Math.random() * 12,       // seconds
      peak: 0.25 + Math.random() * 0.45,      // brightest alpha it reaches
      color: pickColor(),
      baseX: 0,
      ox: 0, oy: 0      // how far the mouse has pushed it
    };
  }

  function resize() {
    var oldWidth = width;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // phones change the height as the address bar shows/hides while
    // scrolling; keep the existing motes then rather than reshuffling them
    if (motes.length && width === oldWidth) {
      if (reduced) draw(0);
      return;
    }

    var count = Math.min(MAX_MOTES, Math.round((width * height) / DENSITY));
    motes = [];
    for (var i = 0; i < count; i++) {
      var m = makeMote(true);
      m.baseX = m.x;
      // start part way through their lives so they don't all fade in at once
      m.life = Math.random() * m.lifespan;
      motes.push(m);
    }
  }

  function draw(dt) {
    ctx.clearRect(0, 0, width, height);
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      m.life += dt;
      m.y -= m.rise * dt;
      m.phase += m.swaySpeed * dt;
      m.x = m.baseX + Math.sin(m.phase) * m.swayAmp;

      // pushed gently away from the mouse; the push eases back off after
      var stir = 0;
      if (mouse.active) {
        var dx = m.x + m.ox - mouse.x;
        var dy = m.y + m.oy - mouse.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < STIR_RADIUS && d > 0.1) {
          stir = 1 - d / STIR_RADIUS;
          m.ox += (dx / d) * stir * 90 * dt;
          m.oy += (dy / d) * stir * 90 * dt;
        }
      }
      m.ox *= 0.985;
      m.oy *= 0.985;
      var drawX = m.x + m.ox;
      var drawY = m.y + m.oy;

      // fade in over the first fifth of its life, out over the last two fifths
      var t = m.life / m.lifespan;
      var a = t < 0.2 ? t / 0.2 : t > 0.6 ? Math.max(0, (1 - t) / 0.4) : 1;
      a *= Math.min(1, m.peak + stir * 0.5);

      if (m.life >= m.lifespan || m.y < -10) {
        motes[i] = makeMote(false);
        motes[i].baseX = motes[i].x;
        // respawn somewhere on screen rather than always at the bottom, so
        // the top half of the page doesn't end up empty
        motes[i].y = Math.random() * height;
        continue;
      }
      if (a <= 0.01) continue;

      // soft halo, then a brighter core
      var glow = ctx.createRadialGradient(drawX, drawY, 0, drawX, drawY, m.r * 5);
      glow.addColorStop(0, 'rgba(' + m.color + ',' + (a * 0.5).toFixed(3) + ')');
      glow.addColorStop(1, 'rgba(' + m.color + ',0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(drawX, drawY, m.r * 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(' + m.color + ',' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(drawX, drawY, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function frame() {
    if (!running) return;
    var now = performance.now();
    // capped so coming back to the tab doesn't make everything jump
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    draw(dt);
    requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduced) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
  function stop() { running = false; }

  resize();
  window.addEventListener('resize', resize);

  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', function () {
    mouse.active = false;
  });

  if (reduced) {
    // no drifting: just a still scattering of dust
    draw(0);
  } else {
    start();
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });
  }
})();
