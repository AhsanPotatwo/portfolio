/* Ahsan portfolio — small progressive-enhancement layer */
(function () {
  'use strict';

  /* ---- mobile menu ---- */
  var toggle = document.getElementById('navToggle');
  var nav = document.getElementById('primaryNav');

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });

    nav.addEventListener('click', function (e) {
      if (e.target.closest('.nav-link')) {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---- highlight the section you're reading ---- */
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav-link'));
  var sections = links
    .map(function (link) { return document.querySelector(link.getAttribute('href')); })
    .filter(Boolean);

  if ('IntersectionObserver' in window && sections.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (link) {
          link.classList.toggle('is-active', link.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

    sections.forEach(function (section) { spy.observe(section); });
  }

  /* ---- reveal on scroll, re-triggering every time a section enters/leaves view ---- */
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced && 'IntersectionObserver' in window) {
    var targets = document.querySelectorAll('.about-panel, .skill-groups, .timeline-col, .project-grid, .contact-inner, .skills .section-title, .projects .section-title');
    var revealer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        entry.target.classList.toggle('is-visible', entry.isIntersecting);
      });
    }, { threshold: 0.08 });

    var cascadeSelector = '.about-panel, .skill-groups, .timeline-col';

    targets.forEach(function (el) {
      el.classList.add('reveal');
      if (el.matches(cascadeSelector)) el.classList.add('reveal-cascade');
      revealer.observe(el);
    });
  }

  /* ---- shared particle-field engine: a small network of drifting nodes connected by faint
     lines. Used two ways below: a denser, mouse-reactive version confined to the hero (the
     "constellation" effect), and a very sparse, non-interactive, fixed-to-viewport version
     that runs behind the whole site so it never feels empty. Both stay off entirely under
     prefers-reduced-motion, pause while their canvas isn't visible/the tab isn't active, and
     are aria-hidden + pointer-events:none so they never reach assistive tech or intercept
     clicks — decoration only. */
  function makeParticleField(opts) {
    var canvas = opts.canvas;
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var width = 0, height = 0, dpr = 1;
    var particles = [];
    var mouse = { x: 0, y: 0, active: false };
    var linkDist = opts.linkDist;
    var mouseDist = opts.mouseDist || 0;
    var running = false;
    var rafId = null;

    function getSize() {
      return opts.fixed
        ? { w: window.innerWidth, h: window.innerHeight }
        : { w: opts.sizeEl.clientWidth, h: opts.sizeEl.clientHeight };
    }

    function nearMouse(p) {
      return opts.interactive && mouse.active && Math.hypot(p.x - mouse.x, p.y - mouse.y) < mouseDist;
    }

    function resize() {
      var size = getSize();
      dpr = window.devicePixelRatio || 1;
      width = size.w;
      height = size.h;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var count = Math.min(opts.maxCount, Math.round((width * height) / opts.density));
      particles = [];
      for (var i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * opts.speed,
          vy: (Math.random() - 0.5) * opts.speed,
          size: opts.varySize ? 0.55 + Math.random() * 1.1 : 1,
          phase: Math.random() * Math.PI * 2,
          tSpeed: 0.5 + Math.random() * 0.9
        });
      }
    }

    function draw(ts) {
      ctx.clearRect(0, 0, width, height);

      var i, p;
      for (i = 0; i < particles.length; i++) {
        p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;
      }

      for (var a = 0; a < particles.length; a++) {
        for (var b = a + 1; b < particles.length; b++) {
          var dx = particles[a].x - particles[b].x;
          var dy = particles[a].y - particles[b].y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < linkDist) {
            var near = nearMouse(particles[a]) || nearMouse(particles[b]);
            if (opts.linkNearMouseOnly && !near) continue;
            var t = 1 - dist / linkDist;
            ctx.strokeStyle = near ? opts.colors.lineNear(t) : opts.colors.line(t);
            ctx.lineWidth = near ? 1.4 : 1;
            ctx.beginPath();
            ctx.moveTo(particles[a].x, particles[a].y);
            ctx.lineTo(particles[b].x, particles[b].y);
            ctx.stroke();
          }
        }
      }

      if (opts.interactive && mouse.active) {
        for (i = 0; i < particles.length; i++) {
          p = particles[i];
          var mDist = Math.hypot(p.x - mouse.x, p.y - mouse.y);
          if (mDist < mouseDist) {
            ctx.strokeStyle = opts.colors.lineNear(1 - mDist / mouseDist);
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }
      }

      for (i = 0; i < particles.length; i++) {
        p = particles[i];
        var glow = nearMouse(p);
        var twinkle = opts.twinkle ? (0.45 + 0.55 * Math.sin((ts || 0) * 0.0011 * p.tSpeed + p.phase)) : 1;
        var radius = (glow ? opts.dotSize + 1.3 : opts.dotSize) * p.size;

        ctx.globalAlpha = twinkle;
        if (opts.glow) {
          ctx.shadowBlur = glow ? 10 : 5;
          ctx.shadowColor = glow ? opts.colors.dotNear : opts.colors.dot;
        }
        ctx.fillStyle = glow ? opts.colors.dotNear : opts.colors.dot;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
        if (opts.glow) ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      if (running) rafId = requestAnimationFrame(draw);
    }

    function start() {
      if (running) return;
      running = true;
      rafId = requestAnimationFrame(draw);
    }

    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
    }

    resize();
    window.addEventListener('resize', resize);

    if (opts.interactive) {
      if (opts.fixed) {
        /* the whole-viewport canvas has no single element to bind to — track the cursor
           across the window, and treat leaving the document as leaving the field */
        window.addEventListener('mousemove', function (e) {
          mouse.x = e.clientX;
          mouse.y = e.clientY;
          mouse.active = true;
        });
        document.documentElement.addEventListener('mouseleave', function () { mouse.active = false; });
      } else {
        opts.sizeEl.addEventListener('mousemove', function (e) {
          var rect = opts.sizeEl.getBoundingClientRect();
          mouse.x = e.clientX - rect.left;
          mouse.y = e.clientY - rect.top;
          mouse.active = true;
        });
        opts.sizeEl.addEventListener('mouseleave', function () { mouse.active = false; });
      }
    }

    /* track whether this canvas is actually on screen (always true for the fixed,
       whole-site version, which has no watchEl) so a tab regaining focus doesn't
       resume animating a section that's currently scrolled out of view */
    var isOnScreen = !opts.watchEl;

    if (opts.watchEl && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          isOnScreen = entry.isIntersecting;
          if (isOnScreen && !document.hidden) start(); else stop();
        });
      }, { threshold: 0 }).observe(opts.watchEl);
    } else {
      start();
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else if (isOnScreen) start();
    });
  }

  if (!reduced) {
    /* denser, mouse-reactive network confined to the hero's empty space (desktop only,
       matching the CSS breakpoint that hides the canvas where there's no spare room) */
    var heroCanvas = document.getElementById('heroFx');
    if (heroCanvas && window.matchMedia('(min-width:821px)').matches) {
      makeParticleField({
        canvas: heroCanvas,
        sizeEl: heroCanvas.closest('.hero'),
        watchEl: heroCanvas.closest('.hero'),
        fixed: false,
        interactive: true,
        density: 11000,
        maxCount: 110,
        speed: 0.4,
        linkDist: 155,
        mouseDist: 210,
        dotSize: 2.4,
        colors: {
          line: function (t) { return 'rgba(157,120,199,' + (0.38 * t) + ')'; },
          lineNear: function (t) { return 'rgba(212,184,255,' + (0.8 * t) + ')'; },
          dot: 'rgba(198,163,255,.8)',
          dotNear: '#f1e9ff'
        }
      });
    }

    /* a quiet starfield fixed behind the whole site: stars sit mostly still and twinkle in
       place (real stars don't drift much), and stay unconnected until the cursor comes
       near — then nearby stars link up into little constellations, like your mouse is
       tracing shapes in the sky. Kept faint enough to read as ambience, not foreground. */
    var bgCanvas = document.getElementById('bgFx');
    if (bgCanvas) {
      makeParticleField({
        canvas: bgCanvas,
        sizeEl: null,
        watchEl: null,
        fixed: true,
        interactive: true,
        twinkle: true,
        glow: true,
        varySize: true,
        linkNearMouseOnly: true,
        density: 13000,
        maxCount: 150,
        speed: 0.035,
        linkDist: 150,
        mouseDist: 190,
        dotSize: 1.4,
        colors: {
          line: function (t) { return 'rgba(198,163,255,' + (0.5 * t) + ')'; },
          lineNear: function (t) { return 'rgba(214,193,255,' + (0.6 * t) + ')'; },
          dot: 'rgba(210,196,255,.75)',
          dotNear: '#f2ebff'
        }
      });
    }
  }

  /* ---- hero code card: types out a little "developer object" snippet once, then lets the
     card gently tilt toward the cursor in 3D for a subtle premium feel. Skipped whenever
     the CSS has hidden the card (narrow viewport) or the user prefers reduced motion. ---- */
  var heroCardOuter = document.querySelector('.hero-card');
  var heroCardInner = document.getElementById('heroCard');
  var heroCodeEl = document.getElementById('heroCode');

  if (heroCardOuter && heroCardInner && heroCodeEl && heroCardOuter.offsetParent !== null) {
    var codeTokens = [
      { t: 'const ', c: 'hc-key' },
      { t: 'developer', c: '' },
      { t: ' = {\n  ', c: '' },
      { t: 'name', c: 'hc-prop' },
      { t: ': ', c: '' },
      { t: "'Ahsan'", c: 'hc-str' },
      { t: ',\n  ', c: '' },
      { t: 'role', c: 'hc-prop' },
      { t: ': ', c: '' },
      { t: "'Full Stack Developer'", c: 'hc-str' },
      { t: ',\n  ', c: '' },
      { t: 'stack', c: 'hc-prop' },
      { t: ': [', c: '' },
      { t: "'JavaScript'", c: 'hc-str' },
      { t: ', ', c: '' },
      { t: "'PHP'", c: 'hc-str' },
      { t: ', ', c: '' },
      { t: "'.NET'", c: 'hc-str' },
      { t: ', ', c: '' },
      { t: "'React'", c: 'hc-str' },
      { t: '],\n  ', c: '' },
      { t: 'status', c: 'hc-prop' },
      { t: ': ', c: '' },
      { t: "'open_to_work'", c: 'hc-str' },
      { t: '\n};', c: '' }
    ];
    var codeLength = codeTokens.reduce(function (n, tok) { return n + tok.t.length; }, 0);

    var escapeHtml = function (str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    var renderCode = function (count) {
      var used = 0, html = '';
      for (var i = 0; i < codeTokens.length; i++) {
        var tok = codeTokens[i];
        if (used + tok.t.length <= count) {
          html += tok.c ? '<span class="' + tok.c + '">' + escapeHtml(tok.t) + '</span>' : escapeHtml(tok.t);
          used += tok.t.length;
        } else {
          var slice = tok.t.slice(0, count - used);
          if (slice) html += tok.c ? '<span class="' + tok.c + '">' + escapeHtml(slice) + '</span>' : escapeHtml(slice);
          break;
        }
      }
      return html + '<span class="hero-card-caret">&nbsp;</span>';
    };

    if (reduced) {
      heroCodeEl.innerHTML = renderCode(codeLength);
    } else {
      var typed = 0;
      var typeTimer = setInterval(function () {
        typed++;
        heroCodeEl.innerHTML = renderCode(typed);
        if (typed >= codeLength) clearInterval(typeTimer);
      }, 22);

      var tiltHost = heroCardOuter.closest('.hero');
      if (tiltHost) {
        tiltHost.addEventListener('mousemove', function (e) {
          var rect = heroCardInner.getBoundingClientRect();
          var relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          var relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
          var maxTilt = 8;
          var rotateY = (relX - 0.5) * maxTilt * 2;
          var rotateX = -(relY - 0.5) * maxTilt * 2;
          heroCardInner.style.transform = 'perspective(900px) rotateX(' + rotateX.toFixed(2) + 'deg) rotateY(' + rotateY.toFixed(2) + 'deg)';
        });
        tiltHost.addEventListener('mouseleave', function () {
          heroCardInner.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)';
        });
      }
    }
  }

  /* ---- about card tilt: a smaller, quieter echo of the hero card's cursor tilt, so the
     About section picks up a touch of the same interactivity instead of feeling static
     next to it. Skipped under reduced-motion. ---- */
  var aboutCard = document.getElementById('aboutCard');
  if (aboutCard && !reduced) {
    aboutCard.addEventListener('mousemove', function (e) {
      var rect = aboutCard.getBoundingClientRect();
      var relX = (e.clientX - rect.left) / rect.width;
      var relY = (e.clientY - rect.top) / rect.height;
      var maxTilt = 3.5;
      var rotateY = (relX - 0.5) * maxTilt * 2;
      var rotateX = -(relY - 0.5) * maxTilt * 2;
      aboutCard.style.transform = 'perspective(1200px) rotateX(' + rotateX.toFixed(2) + 'deg) rotateY(' + rotateY.toFixed(2) + 'deg)';
    });
    aboutCard.addEventListener('mouseleave', function () {
      aboutCard.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg)';
    });
  }

  /* ---- shooting stars: launched one at a time from a small pool, each flight fully
     randomized (start point, angle, distance, speed) instead of looping a fixed CSS
     animation — that was why they kept reappearing on the same paths. The trail length is
     derived from that flight's actual speed (distance / duration) so a fast comet earns a
     longer tail and a slow one stays short, rather than every trail fading in at the same
     fixed length regardless of how fast it's moving. Skipped entirely under reduced-motion,
     matching every other ambient animation on the site. ---- */
  var shootingStars = Array.prototype.slice.call(document.querySelectorAll('.shooting-star'));
  if (!reduced && shootingStars.length) {
    var starBusy = shootingStars.map(function () { return false; });

    var launchShootingStar = function () {
      if (document.hidden) { scheduleNextStar(); return; }

      var idx = starBusy.indexOf(false);
      if (idx === -1) { scheduleNextStar(); return; } /* pool fully busy — try again shortly */

      var el = shootingStars[idx];
      starBusy[idx] = true;

      var angle = Math.random() * 360;
      var dist = 170 + Math.random() * 260;      /* 170–430px travelled */
      var duration = 0.55 + Math.random() * 0.85; /* 0.55–1.4s flight time */
      var speed = dist / duration;                /* px/s — faster comets get longer trails */
      var trail = Math.max(35, Math.min(180, speed * 0.11));

      el.style.setProperty('--shoot-angle', angle.toFixed(1) + 'deg');
      el.style.setProperty('--shoot-dist', dist.toFixed(0) + 'px');
      el.style.setProperty('--shoot-duration', duration.toFixed(2) + 's');
      el.style.setProperty('--shoot-trail', trail.toFixed(0) + 'px');
      el.style.top = (4 + Math.random() * 60) + '%';
      el.style.left = (Math.random() * 100) + '%';

      el.classList.remove('is-flying');
      void el.offsetWidth; /* force reflow so the animation restarts from its first frame */
      el.classList.add('is-flying');

      var onDone = function (e) {
        if (e.target !== el) return;
        el.classList.remove('is-flying');
        starBusy[idx] = false;
        el.removeEventListener('animationend', onDone);
      };
      el.addEventListener('animationend', onDone);

      scheduleNextStar();
    };

    function scheduleNextStar() {
      var delay = 3500 + Math.random() * 9000; /* 3.5–12.5s between launches */
      setTimeout(launchShootingStar, delay);
    }

    setTimeout(launchShootingStar, 1500 + Math.random() * 3000);
  }

  /* ---- footer year ---- */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
