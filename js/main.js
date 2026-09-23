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
  var makeParticleField = window.PortfolioFX && window.PortfolioFX.makeParticleField;

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

  if (!reduced) {
    // constellation effect next to the hero text, only on wider screens
    var heroCanvas = document.getElementById('heroFx');
    if (heroCanvas && window.matchMedia('(min-width:821px)').matches && makeParticleField) {
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

    // fainter starfield behind the whole page, shared with other pages via particles.js
    if (window.PortfolioFX) window.PortfolioFX.initBackgroundStarfield();
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

  // shooting stars drifting across the background, shared with other pages via particles.js
  if (window.PortfolioFX) window.PortfolioFX.initShootingStars();

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
