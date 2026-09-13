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

  /* ---- hero constellation effect: fills the empty space beside the hero text on desktop
     with a network of drifting nodes that connect with faint lines, and glow/link to the
     cursor when it's nearby. Skipped entirely on mobile (matches the CSS breakpoint that
     hides the canvas, since there's no spare space there) and under reduced-motion. ---- */
  var heroCanvas = document.getElementById('heroFx');
  if (heroCanvas && !reduced && window.matchMedia('(min-width:821px)').matches) {
    var ctx = heroCanvas.getContext('2d');
    var heroSection = heroCanvas.closest('.hero');
    var fxWidth = 0, fxHeight = 0, dpr = 1;
    var particles = [];
    var mouse = { x: 0, y: 0, active: false };
    var linkDist = 140;
    var mouseDist = 180;
    var running = false;
    var rafId = null;

    function nearMouse(p) {
      return mouse.active && Math.hypot(p.x - mouse.x, p.y - mouse.y) < mouseDist;
    }

    function resizeFx() {
      dpr = window.devicePixelRatio || 1;
      fxWidth = heroSection.clientWidth;
      fxHeight = heroSection.clientHeight;
      heroCanvas.width = fxWidth * dpr;
      heroCanvas.height = fxHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var count = Math.min(70, Math.round((fxWidth * fxHeight) / 18000));
      particles = [];
      for (var i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * fxWidth,
          y: Math.random() * fxHeight,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35
        });
      }
    }

    function drawFx() {
      ctx.clearRect(0, 0, fxWidth, fxHeight);

      var i, p;
      for (i = 0; i < particles.length; i++) {
        p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > fxWidth) p.vx *= -1;
        if (p.y < 0 || p.y > fxHeight) p.vy *= -1;
      }

      for (var a = 0; a < particles.length; a++) {
        for (var b = a + 1; b < particles.length; b++) {
          var dx = particles[a].x - particles[b].x;
          var dy = particles[a].y - particles[b].y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < linkDist) {
            var near = nearMouse(particles[a]) || nearMouse(particles[b]);
            var t = 1 - dist / linkDist;
            ctx.strokeStyle = near ? 'rgba(198,163,255,' + (0.55 * t) + ')' : 'rgba(115,83,139,' + (0.22 * t) + ')';
            ctx.lineWidth = near ? 1.4 : 1;
            ctx.beginPath();
            ctx.moveTo(particles[a].x, particles[a].y);
            ctx.lineTo(particles[b].x, particles[b].y);
            ctx.stroke();
          }
        }
      }

      if (mouse.active) {
        for (i = 0; i < particles.length; i++) {
          p = particles[i];
          var mDist = Math.hypot(p.x - mouse.x, p.y - mouse.y);
          if (mDist < mouseDist) {
            ctx.strokeStyle = 'rgba(198,163,255,' + (0.5 * (1 - mDist / mouseDist)) + ')';
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
        ctx.fillStyle = glow ? '#e4d6ff' : 'rgba(179,136,255,.55)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, glow ? 2.6 : 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      if (running) rafId = requestAnimationFrame(drawFx);
    }

    function startFx() {
      if (running) return;
      running = true;
      rafId = requestAnimationFrame(drawFx);
    }

    function stopFx() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
    }

    resizeFx();

    window.addEventListener('resize', resizeFx);

    heroSection.addEventListener('mousemove', function (e) {
      var rect = heroSection.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    });
    heroSection.addEventListener('mouseleave', function () {
      mouse.active = false;
    });

    /* only animate while the hero is actually on screen */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) startFx();
          else stopFx();
        });
      }, { threshold: 0 }).observe(heroSection);
    } else {
      startFx();
    }
  }

  /* ---- hero code card: types out a little "developer object" snippet once, then lets the
     card gently tilt toward the cursor in 3D for a subtle premium feel. Skipped whenever
     the CSS has hidden the card (narrow viewport) or the user prefers reduced motion. ---- */
  var heroCardOuter = document.querySelector('.hero-card');
  var heroCardInner = document.getElementById('heroCard');
  var heroCodeEl = document.getElementById('heroCode');

  if (heroCardOuter && heroCardInner && heroCodeEl && getComputedStyle(heroCardOuter).display !== 'none') {
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

  /* ---- footer year ---- */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
