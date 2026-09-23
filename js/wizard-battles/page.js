// This page lets the whole document scroll sideways so the game's buttons
// (pinned to raw page coordinates by sketch.js, untouched from the original
// project) never drift out of sync with the canvas — see the notes in
// wizard-battles.css. The one downside: if someone scrolls the game area
// sideways and then keeps scrolling down, the rest of the page stays
// shifted off to the side. Snap the horizontal scroll back to 0 once the
// game section is out of view so that doesn't linger.
(function () {
  'use strict';

  var game = document.getElementById('game');
  if (!game || !('IntersectionObserver' in window)) return;

  new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting && window.scrollX > 0) {
        window.scrollTo({ left: 0, behavior: 'smooth' });
      }
    });
  }, { threshold: 0 }).observe(game);
})();
