// scales the game to fit the board, and swaps between the revamp (duel.js) and the uni original. both are laid
// out at a fixed 800x600 and scaled down with css (--wb-scale). the original runs in a frame
// (wizard-battles-classic.html) so its p5 globals can't clash with anything; it's only made when you switch to
// it, and thrown away when you switch back so it starts fresh next time.
(function () {
  'use strict';

  var stage = document.getElementById('gameStage');
  var classic = document.getElementById('classic');
  var duel = document.getElementById('duel');
  if (!stage || !classic || !duel) return;

  function fit() {
    stage.style.setProperty('--wb-scale', Math.min(1, stage.clientWidth / 800));
  }
  fit();
  new ResizeObserver(fit).observe(stage);

  var buttons = document.querySelectorAll('.wb-version [data-version]');
  function show(version) {
    var uni = version === 'uni';
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', String(buttons[i].dataset.version === version));
    }
    duel.hidden = uni;
    classic.hidden = !uni;
    if (typeof WizardDuel !== 'undefined' && WizardDuel) WizardDuel.pause(uni);
    if (uni) {
      var frame = document.createElement('iframe');
      frame.src = 'wizard-battles-classic.html';
      frame.title = 'Wizard Battles, the uni original';
      classic.appendChild(frame);
    } else {
      classic.textContent = '';
    }
  }
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', function () {
      if (this.getAttribute('aria-pressed') !== 'true') show(this.dataset.version);
    });
  }
})();
