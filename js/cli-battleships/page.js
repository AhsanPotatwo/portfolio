// Highlights the side rail's link for whichever section of the CLI
// Battleships page is currently in the middle of the screen, the same way
// the home page's nav follows its sections (see main.js).
(function () {
  'use strict';

  var links = Array.prototype.slice.call(document.querySelectorAll('.cb-toc a'));
  if (!links.length || !('IntersectionObserver' in window)) return;

  var sections = links
    .map(function (link) { return document.getElementById(link.getAttribute('href').slice(1)); })
    .filter(Boolean);

  function mark(id) {
    links.forEach(function (link) {
      var current = link.getAttribute('href') === '#' + id;
      link.classList.toggle('is-current', current);
      if (current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  var spy = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) mark(entry.target.id);
    });
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

  sections.forEach(function (section) { spy.observe(section); });
  mark(sections[0].id);
})();
