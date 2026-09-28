// scales the game to fit the screen without touching sketch.js.
// the sketch is a fixed 800x600 and puts its buttons on <body>, so after setup()
// they get moved into #canvas-wrapper and the whole thing is scaled with css
(function () {
  'use strict';

  var stage = document.getElementById('gameStage');
  var wrapper = document.getElementById('canvas-wrapper');
  if (!stage || !wrapper) return;

  var GAME_W = 800;

  function fit() {
    var scale = Math.min(1, stage.clientWidth / GAME_W);
    wrapper.style.setProperty('--wb-scale', scale);
  }

  fit();
  if ('ResizeObserver' in window) {
    new ResizeObserver(fit).observe(stage);
  } else {
    window.addEventListener('resize', fit);
  }

  // p5 doesn't call setup until the page loads so wrapping it here still works
  var sketchSetup = window.setup;
  if (typeof sketchSetup !== 'function') return;

  window.setup = function () {
    sketchSetup.apply(this, arguments);
    // only the sketch puts buttons directly on body
    var buttons = document.querySelectorAll('body > button');
    for (var i = 0; i < buttons.length; i++) {
      wrapper.appendChild(buttons[i]);
    }
  };
})();
