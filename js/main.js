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

  // fade [data-reveal] blocks in the first time they scroll into view (project pages). once only,
  // so scrolling back up doesn't make everything fade out and in again
  if (!reduced && 'IntersectionObserver' in window) {
    var revealer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealer.unobserve(entry.target);
      });
    }, { threshold: 0.08 });

    document.querySelectorAll('[data-reveal]').forEach(function (el) {
      el.classList.add('reveal');
      revealer.observe(el);
    });
  }

  // background starfield (particles.js, project pages only)
  if (!reduced && window.PortfolioFX) window.PortfolioFX.initBackgroundStarfield();

  // pause the idle loops (twinkling hero stars, project cards) while they're off screen
  if ('IntersectionObserver' in window) {
    var loopWatcher = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        entry.target.classList.toggle('loops-paused', !entry.isIntersecting);
      });
    });
    document.querySelectorAll('.hero, .projects').forEach(function (section) {
      loopWatcher.observe(section);
    });
  }

  // the scrollbar under the project strip on phones: the thumb is as long as the share of the strip
  // in view and slides along with it. (translateX % is of the thumb's own width, hence the 1 / share)
  var strip = document.querySelector('.project-grid');
  var stripThumb = document.querySelector('.swipe-bar i');
  if (strip && stripThumb) {
    var moveThumb = function () {
      var travel = strip.scrollWidth - strip.clientWidth;
      if (travel <= 0) return;
      var share = strip.clientWidth / strip.scrollWidth;
      stripThumb.style.width = (share * 100) + '%';
      stripThumb.style.transform = 'translateX(' + (strip.scrollLeft / travel * (1 / share - 1) * 100) + '%)';
    };
    strip.addEventListener('scroll', moveThumb, { passive: true });
    window.addEventListener('resize', moveThumb);
    moveThumb();
  }

  // copy the email address. if the clipboard is blocked (old browser, page opened from file://),
  // select the address instead so it's one Ctrl+C away
  var copyEmail = document.querySelector('.copy-email');
  var copyStatus = document.getElementById('copyEmailStatus');
  if (copyEmail && copyStatus) {
    var copyLabel = copyEmail.querySelector('.copy-email-label');
    var copyReset = null;

    var selectAddress = function () {
      var range = document.createRange();
      range.selectNodeContents(copyEmail.querySelector('.copy-email-address'));
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      copyStatus.textContent = 'Address selected. Press Ctrl+C (or Cmd+C) to copy it.';
    };

    var showCopied = function () {
      copyLabel.textContent = 'Copied';
      copyStatus.textContent = 'Email address copied. Speak soon!';
      copyEmail.classList.add('is-copied');
      // restart the burst even on a quick second click
      copyEmail.classList.remove('is-bursting');
      void copyEmail.offsetWidth;
      copyEmail.classList.add('is-bursting');
      clearTimeout(copyReset);
      copyReset = setTimeout(function () {
        copyLabel.textContent = 'Copy';
        copyEmail.classList.remove('is-copied', 'is-bursting');
        copyStatus.textContent = '';
      }, 2600);
    };

    copyEmail.addEventListener('click', function () {
      var address = copyEmail.getAttribute('data-copy');
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(address).then(showCopied, selectAddress);
      } else {
        selectAddress();
      }
    });
  }

  // shooting stars (particles.js)
  if (window.PortfolioFX) window.PortfolioFX.initShootingStars();

  // keep the footer year up to date
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
