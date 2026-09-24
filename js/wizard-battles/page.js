// Makes the wizard battles game (js/wizard-battles/sketch.js, untouched from
// the original project) scale to fit any screen width.
//
// The sketch draws on a fixed 800x600 canvas and creates its buttons with
// p5's createButton(), which appends them to <body> and pins them with
// absolute left/top values worked out from the canvas's position. Because
// #canvas-wrapper is position:relative (see wizard-battles.css), that
// position comes out as 0,0, so every button's left/top is really an offset
// *within the canvas*. Once setup() has run, the buttons are moved inside
// #canvas-wrapper, so canvas and buttons form one 800x600 unit. That unit
// is then shrunk with a CSS transform to fit the width available, like
// zooming out on the whole game. Nothing can drift out of line, and the
// page never has to scroll sideways.
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

  // p5 (global mode) looks up window.setup when the page finishes loading,
  // so wrapping it here, after sketch.js has defined it, still takes effect.
  var sketchSetup = window.setup;
  if (typeof sketchSetup !== 'function') return;

  window.setup = function () {
    sketchSetup.apply(this, arguments);
    // every button the sketch made is a direct child of <body>; nothing
    // else on this page puts a <button> there
    var buttons = document.querySelectorAll('body > button');
    for (var i = 0; i < buttons.length; i++) {
      wrapper.appendChild(buttons[i]);
    }
  };
})();
