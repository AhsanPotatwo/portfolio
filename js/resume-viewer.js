// Popup for reading the resume without leaving the page, opened from the
// "My resume" button in the hero. Same idea (and look) as the design viewer
// in design-viewer.js: a native <dialog> (#resumeViewer in index.html) that
// keeps focus inside it, closes on Esc and hands focus back afterwards.
//
// The PDF is shown in an <iframe>, loaded the first time the viewer opens so
// it doesn't slow down the page. Browsers that can't display PDFs inside a
// page (most phones) get "Open" and "Download" buttons instead. Without
// JavaScript (or <dialog> support) the button just downloads the PDF.
(function () {
  'use strict';

  var dialog = document.getElementById('resumeViewer');
  var triggers = document.querySelectorAll('[data-resume-viewer]');
  if (!dialog || typeof dialog.showModal !== 'function' || !triggers.length) return;

  var PDF = 'assets/AhsanResume.pdf';
  var frame = document.getElementById('rvFrame');
  var fallback = document.getElementById('rvFallback');
  var stage = document.getElementById('rvStage');

  // navigator.pdfViewerEnabled is false where the browser has no built-in
  // PDF viewer (e.g. Chrome on Android); older browsers that don't report it
  // are assumed to have one unless they're on a phone-sized touch screen
  var canShowPdf = typeof navigator.pdfViewerEnabled === 'boolean'
    ? navigator.pdfViewerEnabled
    : !window.matchMedia('(pointer: coarse) and (max-width: 820px)').matches;

  function open() {
    if (canShowPdf) {
      // open with the thumbnail sidebar closed and the page fitted to the
      // frame's width (Chrome, Edge and Firefox read these; others ignore them)
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

  // clicking the dark space around the resume closes the viewer
  stage.addEventListener('click', function (e) {
    if (e.target === stage) dialog.close();
  });
})();
