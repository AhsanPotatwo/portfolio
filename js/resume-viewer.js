// resume popup. without js the button just downloads the pdf
(function () {
  'use strict';

  var dialog = document.getElementById('resumeViewer');
  var triggers = document.querySelectorAll('[data-resume-viewer]');
  if (!dialog || typeof dialog.showModal !== 'function' || !triggers.length) return;

  var PDF = 'assets/AhsanResume.pdf';
  var frame = document.getElementById('rvFrame');
  var fallback = document.getElementById('rvFallback');
  var stage = document.getElementById('rvStage');

  // most phones can't show a pdf in an iframe. if pdfViewerEnabled isn't there, guess from screen size
  var canShowPdf = typeof navigator.pdfViewerEnabled === 'boolean'
    ? navigator.pdfViewerEnabled
    : !window.matchMedia('(pointer: coarse) and (max-width: 820px)').matches;

  function open() {
    if (canShowPdf) {
      // hide the sidebar and fit to width. only loads the first time it's opened
      if (!frame.getAttribute('src')) frame.src = PDF + '#navpanes=0&view=FitH';
    } else {
      frame.hidden = true;
      fallback.hidden = false;
    }
    document.documentElement.classList.add('dv-lock');
    dialog.showModal();
  }

  Array.prototype.forEach.call(triggers, function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      open();
    });
  });

  function unlock() {
    document.documentElement.classList.remove('dv-lock');
  }
  dialog.addEventListener('close', unlock);
  dialog.querySelector('.dv-close').addEventListener('click', function () {
    dialog.close();
  });

  // click outside to close
  stage.addEventListener('click', function (e) {
    if (e.target === stage) dialog.close();
  });
})();
