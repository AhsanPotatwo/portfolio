// highlights the side rail link for the section on screen
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

// the toy board in the hero: lays the 8x8 squares over the ships, then a click drops a peg in a square,
// red on a ship and white on the water. clicking a peg pulls it out again
(function () {
  'use strict';

  var board = document.getElementById('cbBoard');
  if (!board) return;

  // which squares the ships cover, from their --c/--r/--w/--h in the html
  var onShip = {};
  Array.prototype.forEach.call(board.querySelectorAll('.cb-hull'), function (hull) {
    var s = hull.style;
    var c = +s.getPropertyValue('--c'), r = +s.getPropertyValue('--r');
    var w = +s.getPropertyValue('--w') || 1, h = +s.getPropertyValue('--h') || 1;
    for (var i = 0; i < w; i++) {
      for (var j = 0; j < h; j++) onShip[(r + j) + ',' + (c + i)] = true;
    }
  });

  function peg(cell) { return onShip[cell.dataset.at] ? 'is-hit' : 'is-miss'; }

  // a game already under way
  var fired = ['2,3', '2,4', '4,2', '5,5', '7,1', '1,7', '6,3', '8,8'];
  for (var r = 1; r <= 8; r++) {
    for (var c = 1; c <= 8; c++) {
      var cell = document.createElement('i');
      cell.dataset.at = r + ',' + c;
      cell.style.gridArea = r + ' / ' + c;
      if (fired.indexOf(cell.dataset.at) > -1) cell.className = peg(cell);
      board.appendChild(cell);
    }
  }

  board.addEventListener('click', function (e) {
    var cell = e.target.closest('i');
    if (!cell) return;
    cell.className = cell.className ? '' : peg(cell);
  });
})();
