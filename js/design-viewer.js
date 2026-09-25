// Popup viewer for this site's Figma page designs, opened from the little
// sign hanging off the Figma tile in the Skills section.
//
// Built on the native <dialog> element (#designViewer in index.html), which
// handles keeping focus inside it, closing on Esc and handing focus back to
// the sign afterwards. The designs are full-page mockups (1440px wide and
// several thousand px tall), so each one is shown at a readable width and
// scrolls vertically rather than being squashed to fit the screen.
//
// Switch designs with the arrow buttons, the left/right arrow keys, or a
// sideways swipe on touch screens. Close with the X, Esc, or by clicking the
// dark space around the image. Without JavaScript (or <dialog> support) the
// sign is still a normal link to the Figma file.
(function () {
  'use strict';

  var dialog = document.getElementById('designViewer');
  var triggers = document.querySelectorAll('[data-design-viewer]');
  if (!dialog || typeof dialog.showModal !== 'function' || !triggers.length) return;

  var SLIDES = [
    {
      src: 'assets/Home%20Page%20UI%20design.png',
      title: 'Home page',
      alt: 'Figma design of the portfolio home page'
    },
    {
      src: 'assets/Wizard%20Battles%20Page%20Design.png',
      title: 'Wizard Battles page',
      alt: 'Figma design of the Wizard Battles project page'
    }
  ];

  var img = document.getElementById('dvImg');
  var stage = document.getElementById('dvStage');
  var titleEl = document.getElementById('dvTitle');
  var indexEl = document.getElementById('dvIndex');
  var totalEl = document.getElementById('dvTotal');
  var index = 0;

  totalEl.textContent = SLIDES.length;

  function show(i) {
    index = (i + SLIDES.length) % SLIDES.length;
    var slide = SLIDES[index];
    titleEl.textContent = slide.title;
    indexEl.textContent = index + 1;
    stage.scrollTop = 0;

    if (img.getAttribute('src') !== slide.src) {
      img.classList.remove('is-loaded');
      img.alt = slide.alt;
      img.src = slide.src;
    }

    // start fetching the other design(s) in the background
    SLIDES.forEach(function (s) {
      if (s !== slide) new Image().src = s.src;
    });
  }

  img.addEventListener('load', function () {
    img.classList.add('is-loaded');
  });

  function open(startAt) {
    document.documentElement.classList.add('dv-lock');
    dialog.showModal();
    show(startAt || 0);
  }

  Array.prototype.forEach.call(triggers, function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      open(0);
    });
  });

  function unlock() {
    document.documentElement.classList.remove('dv-lock');
  }
  function close() {
    dialog.close();
    unlock();
  }
  // Esc closes the dialog natively; this catches that (and any other way
  // it gets closed) so the page can scroll again
  dialog.addEventListener('close', unlock);

  dialog.querySelector('.dv-close').addEventListener('click', close);
  dialog.querySelector('.dv-prev').addEventListener('click', function () {
    show(index - 1);
  });
  dialog.querySelector('.dv-next').addEventListener('click', function () {
    show(index + 1);
  });

  // clicking the empty space around the design closes the viewer
  stage.addEventListener('click', function (e) {
    if (e.target === stage) close();
  });

  dialog.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
  });

  // swipe left/right on touch screens (a mostly-vertical drag is just scrolling)
  var touchStart = null;
  stage.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { touchStart = null; return; }
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  stage.addEventListener('touchend', function (e) {
    if (!touchStart) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - touchStart.x;
    var dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      show(dx < 0 ? index + 1 : index - 1);
    }
  }, { passive: true });
})();
