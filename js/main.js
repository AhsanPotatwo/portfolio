(function () {
  'use strict';

  // mobile nav toggle
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

  // highlight whichever nav link matches the section currently on screen
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

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // fade sections in as they scroll into view
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

  // draws the little star field with lines connecting nearby stars, used for both the
  // hero's constellation effect and the fainter one behind the whole page
  function makeParticleField(opts) {
    var canvas = opts.canvas;
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var width = 0, height = 0, dpr = 1;
    var particles = [];
    var fixedLinks = [];
    var fixedKeys = {};
    var constellationStars = {};
    var liveEdges = [];
    var lastLinkTime = -Infinity;
    var lastConstellationTime = -Infinity;
    var mouse = { x: 0, y: 0, active: false };
    var linkDist = opts.linkDist;
    var mouseDist = opts.mouseDist || 0;
    var maxLinks = opts.maxLinks || 1;
    var linkRefresh = opts.linkRefresh || 700;
    var constellationRefresh = opts.constellationRefresh || 7000;
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

    function pickColor() {
      if (!opts.palette) return null;
      var total = 0, i;
      for (i = 0; i < opts.palette.length; i++) total += opts.palette[i].w;
      var r = Math.random() * total;
      for (i = 0; i < opts.palette.length; i++) {
        r -= opts.palette[i].w;
        if (r <= 0) return opts.palette[i].c;
      }
      return opts.palette[opts.palette.length - 1].c;
    }

    function pairKey(a, b) { return a < b ? a + '_' + b : b + '_' + a; }

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
          tSpeed: 0.5 + Math.random() * 0.9,
          color: pickColor()
        });
      }

      liveEdges = [];
      lastLinkTime = -Infinity;
      lastConstellationTime = -Infinity;
      buildConstellations();
    }

    // picks a few stars and chains them together permanently so there's always at
    // least a couple of little constellation shapes visible, not just random lines
    function buildConstellations() {
      fixedLinks = [];
      fixedKeys = {};
      constellationStars = {};
      if (!opts.constellations || particles.length <= 3) return;

      for (var c = 0; c < opts.constellations; c++) {
        var chainHops = 2 + Math.floor(Math.random() * 2);
        var used = {};
        var current = Math.floor(Math.random() * particles.length);
        used[current] = true;
        constellationStars[current] = true;
        for (var step = 0; step < chainHops; step++) {
          var best = -1, bestDist = Infinity;
          for (var k = 0; k < particles.length; k++) {
            if (used[k]) continue;
            var ddx = particles[current].x - particles[k].x;
            var ddy = particles[current].y - particles[k].y;
            var dd = Math.sqrt(ddx * ddx + ddy * ddy);
            if (dd < linkDist && dd < bestDist) { bestDist = dd; best = k; }
          }
          if (best === -1) break;
          var key = pairKey(current, best);
          if (!fixedKeys[key]) {
            fixedKeys[key] = true;
            fixedLinks.push([current, best]);
          }
          used[best] = true;
          constellationStars[best] = true;
          current = best;
        }
      }
    }

    // re-pairs up nearby stars every so often instead of every frame, otherwise the
    // lines flicker around too much and it looks jittery
    function recomputeEdges() {
      var top = new Array(particles.length);
      var i;
      for (i = 0; i < particles.length; i++) top[i] = [];

      for (var a = 0; a < particles.length; a++) {
        if (constellationStars[a]) continue;
        for (var b = a + 1; b < particles.length; b++) {
          if (constellationStars[b]) continue;
          if (fixedKeys[pairKey(a, b)]) continue;
          var dx = particles[a].x - particles[b].x;
          var dy = particles[a].y - particles[b].y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist >= linkDist) continue;

          [[a, b], [b, a]].forEach(function (pair) {
            var list = top[pair[0]];
            if (list.length < maxLinks) {
              list.push({ j: pair[1], d: dist });
              list.sort(function (m, n) { return m.d - n.d; });
            } else if (dist < list[list.length - 1].d) {
              list[list.length - 1] = { j: pair[1], d: dist };
              list.sort(function (m, n) { return m.d - n.d; });
            }
          });
        }
      }

      var drawn = {};
      liveEdges = [];
      for (i = 0; i < top.length; i++) {
        for (var li = 0; li < top[i].length; li++) {
          var key = pairKey(i, top[i][li].j);
          if (drawn[key]) continue;
          drawn[key] = true;
          liveEdges.push([i, top[i][li].j]);
        }
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

      if (ts === undefined || ts - lastConstellationTime > constellationRefresh) {
        buildConstellations();
        lastConstellationTime = ts || 0;
      }

      if (ts === undefined || ts - lastLinkTime > linkRefresh) {
        recomputeEdges();
        lastLinkTime = ts || 0;
      }

      for (i = 0; i < fixedLinks.length; i++) {
        var fa = particles[fixedLinks[i][0]], fb = particles[fixedLinks[i][1]];
        if (!fa || !fb) continue;
        var fdx = fa.x - fb.x, fdy = fa.y - fb.y;
        var fdist = Math.sqrt(fdx * fdx + fdy * fdy);
        if (fdist > linkDist) continue;
        var fNear = nearMouse(fa) || nearMouse(fb);
        ctx.strokeStyle = fNear ? opts.colors.lineNear(0.9) : (opts.colors.constellation || opts.colors.line(0.85));
        ctx.lineWidth = fNear ? 1.4 : 1;
        ctx.beginPath();
        ctx.moveTo(fa.x, fa.y);
        ctx.lineTo(fb.x, fb.y);
        ctx.stroke();
      }

      for (i = 0; i < liveEdges.length; i++) {
        var ea = particles[liveEdges[i][0]], eb = particles[liveEdges[i][1]];
        if (!ea || !eb) continue;
        var edx = ea.x - eb.x, edy = ea.y - eb.y;
        var edist = Math.sqrt(edx * edx + edy * edy);
        if (edist > linkDist) continue;
        var near = nearMouse(ea) || nearMouse(eb);
        if (opts.linkNearMouseOnly && !near) continue;
        var t = Math.max(0, 1 - edist / linkDist);
        ctx.strokeStyle = near ? opts.colors.lineNear(t) : opts.colors.line(t);
        ctx.lineWidth = near ? 1.4 : 1;
        ctx.beginPath();
        ctx.moveTo(ea.x, ea.y);
        ctx.lineTo(eb.x, eb.y);
        ctx.stroke();
      }

      // connect a couple of the closest stars to the cursor
      if (opts.interactive && mouse.active) {
        var mouseLinks = opts.mouseLinks || 2;
        var mCandidates = [];
        for (i = 0; i < particles.length; i++) {
          p = particles[i];
          var mDist0 = Math.hypot(p.x - mouse.x, p.y - mouse.y);
          if (mDist0 < mouseDist) mCandidates.push({ p: p, d: mDist0 });
        }
        mCandidates.sort(function (m, n) { return m.d - n.d; });
        for (i = 0; i < Math.min(mouseLinks, mCandidates.length); i++) {
          p = mCandidates[i].p;
          var mDist = mCandidates[i].d;
          ctx.strokeStyle = opts.colors.lineNear(1 - mDist / mouseDist);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }

      for (i = 0; i < particles.length; i++) {
        p = particles[i];
        var glow = nearMouse(p);
        var isConstellationStar = !!constellationStars[i];
        var twinkle = opts.twinkle ? (0.45 + 0.55 * Math.sin((ts || 0) * 0.0011 * p.tSpeed + p.phase)) : 1;
        if (isConstellationStar) twinkle = Math.max(twinkle, 0.75);
        var baseSize = isConstellationStar ? opts.dotSize * 1.3 : opts.dotSize;
        var radius = (glow ? baseSize + 1.3 : baseSize) * p.size;
        var restColor = p.color || opts.colors.dot;

        ctx.globalAlpha = twinkle;
        if (opts.glow) {
          ctx.shadowBlur = glow ? 10 : (isConstellationStar ? 6 : 5);
          ctx.shadowColor = glow ? opts.colors.dotNear : restColor;
        }
        ctx.fillStyle = glow ? opts.colors.dotNear : restColor;
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

    // don't bother animating a canvas that's scrolled off screen
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
    // constellation effect next to the hero text, only on wider screens
    var heroCanvas = document.getElementById('heroFx');
    if (heroCanvas && window.matchMedia('(min-width:821px)').matches) {
      makeParticleField({
        canvas: heroCanvas,
        sizeEl: heroCanvas.closest('.hero'),
        watchEl: heroCanvas.closest('.hero'),
        fixed: false,
        interactive: true,
        twinkle: true,
        glow: true,
        varySize: true,
        maxLinks: 1,
        mouseLinks: 2,
        constellations: 10,              
        linkRefresh: 650,
        density: 16000,
        maxCount: 55,
        speed: 0.3,
        linkDist: 100,
        mouseDist: 200,
        dotSize: 2,
        palette: [
          { c: 'rgba(198,163,255,.85)', w: 6 },
          { c: 'rgba(168,199,255,.85)', w: 3 },
          { c: 'rgba(255,214,163,.8)', w: 1 }
        ],
        colors: {
          line: function (t) { return 'rgba(157,120,199,' + (0.3 * t) + ')'; },
          lineNear: function (t) { return 'rgba(212,184,255,' + (0.7 * t) + ')'; },
          constellation: 'rgba(200,172,255,.4)',
          dot: 'rgba(198,163,255,.7)',
          dotNear: '#f1e9ff'
        }
      });
    }

    // fainter starfield behind the whole page
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
        maxLinks: 1,
        mouseLinks: 2,
        constellations: 10,
        linkRefresh: 800,
        density: 13000,
        maxCount: 120,
        speed: 0.035,
        linkDist: 72,
        mouseDist: 100,
        dotSize: 1.4,
        palette: [
          { c: 'rgba(226,222,255,.85)', w: 5 },
          { c: 'rgba(190,214,255,.85)', w: 3 },
          { c: 'rgba(255,221,180,.8)', w: 1.4 }
        ],
        colors: {
          line: function (t) { return 'rgba(198,163,255,' + (0.5 * t) + ')'; },
          lineNear: function (t) { return 'rgba(214,193,255,' + (0.6 * t) + ')'; },
          constellation: 'rgba(220,210,255,.4)',
          dot: 'rgba(210,196,255,.75)',
          dotNear: '#f2ebff'
        }
      });
    }
  }

  // types out the little code snippet in the hero card
  var heroCardOuter = document.querySelector('.hero-card');
  var heroCardInner = document.getElementById('heroCard');
  var heroCodeEl = document.getElementById('heroCode');

  if (heroCardOuter && heroCardInner && heroCodeEl && heroCardOuter.offsetParent !== null) {
    // broken into tokens so I can colour keywords/strings differently as it types
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

      // tilt the card toward the cursor a bit
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

  // same tilt trick but smaller, for the about card
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

  // picks a random star from the pool and sends it flying in a random direction
  var shootingStars = Array.prototype.slice.call(document.querySelectorAll('.shooting-star'));
  if (!reduced && shootingStars.length) {
    var starBusy = shootingStars.map(function () { return false; });

    var launchShootingStar = function () {
      if (document.hidden) { scheduleNextStar(); return; }

      // all stars in the pool are mid-flight already, try again in a bit
      var idx = starBusy.indexOf(false);
      if (idx === -1) { scheduleNextStar(); return; }

      var el = shootingStars[idx];
      starBusy[idx] = true;

      var angle = Math.random() * 360;
      var dist = 170 + Math.random() * 260;
      var duration = 0.55 + Math.random() * 0.85;
      var speed = dist / duration;
      var trail = Math.max(35, Math.min(180, speed * 0.11));

      el.style.setProperty('--shoot-angle', angle.toFixed(1) + 'deg');
      el.style.setProperty('--shoot-dist', dist.toFixed(0) + 'px');
      el.style.setProperty('--shoot-duration', duration.toFixed(2) + 's');
      el.style.setProperty('--shoot-trail', trail.toFixed(0) + 'px');
      el.style.top = (4 + Math.random() * 60) + '%';
      el.style.left = (Math.random() * 100) + '%';

      el.classList.remove('is-flying');
      void el.offsetWidth; // reflow so the animation actually restarts
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
      var delay = 3500 + Math.random() * 9000;
      setTimeout(launchShootingStar, delay);
    }

    setTimeout(launchShootingStar, 1500 + Math.random() * 3000);
  }

  // CLI battleships project card: reshuffle which grid cells the radar
  // pings land on every time the hover/focus animation is about to play,
  // so it's not the same handful of cells lighting up each time
  var cliCards = document.querySelectorAll('.project-card-cli');
  if (cliCards.length) {
    var cliCols = 8, cliRows = 3;
    var cliCells = [];
    for (var cr = 0; cr < cliRows; cr++) {
      for (var cc = 0; cc < cliCols; cc++) {
        cliCells.push({
          left: ((cc + 0.5) / cliCols * 100).toFixed(3) + '%',
          top: ((cr + 0.5) / cliRows * 100).toFixed(3) + '%'
        });
      }
    }

    var shuffledCliCells = function () {
      var pool = cliCells.slice();
      for (var i = pool.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
      }
      return pool;
    };

    Array.prototype.forEach.call(cliCards, function (card) {
      var pings = card.querySelectorAll('.cli-ping');

      var randomizePings = function () {
        var pool = shuffledCliCells();
        Array.prototype.forEach.call(pings, function (ping, i) {
          var cell = pool[i % pool.length];
          ping.style.left = cell.left;
          ping.style.top = cell.top;
        });
      };

      randomizePings();
      card.addEventListener('mouseenter', randomizePings);
      card.addEventListener('focus', randomizePings);
    });
  }

  // keep the footer year up to date
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
