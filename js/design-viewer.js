// popup for the figma designs, opened from the tag on the figma tile.
// without js the tag is just a link to figma
(function () {
  'use strict';

  var dialog = document.getElementById('designViewer');
  var triggers = document.querySelectorAll('[data-design-viewer]');
  if (!dialog || typeof dialog.showModal !== 'function' || !triggers.length) return;

  var SLIDES = [
    {
      src: 'assets/Home%20Page%20UI%20design.webp',
      title: 'Home page',
      alt: 'Figma design of the portfolio home page'
    },
    {
      src: 'assets/Wizard%20Battles%20Page%20Design.webp',
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

    // preload the others
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
  // catches Esc too
  dialog.addEventListener('close', unlock);

  dialog.querySelector('.dv-close').addEventListener('click', close);
  dialog.querySelector('.dv-prev').addEventListener('click', function () {
    show(index - 1);
  });
  dialog.querySelector('.dv-next').addEventListener('click', function () {
    show(index + 1);
  });

  // click outside to close
  stage.addEventListener('click', function (e) {
    if (e.target === stage) close();
  });

  dialog.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
  });

  // swipe to change design, ignore vertical drags since that's scrolling
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
