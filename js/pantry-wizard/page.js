// Pantry Wizard project page.
//
//  - The page's two settings, which work like the app's Settings screen:
//    dark mode (fades the page out, swaps theme, fades back in) and text to
//    speech (off by default; confirms itself out loud). Both are remembered,
//    and every switch for the same setting stays in sync.
//  - The screen tour's tabs.
//  - A web recreation of the app's My Pantry, Add item and Edit item
//    screens, using the browser's versions of the phone hardware the app
//    uses (camera / file picker, vibration, speech and location), with a
//    log of each one beside it. Nothing is saved or uploaded: photos are
//    shown from local object URLs and the pantry resets on reload.
(function () {
  'use strict';

  var root = document.documentElement;
  var body = document.body;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // localStorage can be missing or throw (private windows, blocked storage);
  // the page works the same without it, it just won't remember
  function load(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function save(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* not remembered */ }
  }

  // ---------- hardware log ----------
  var logEl = document.getElementById('pwLog');
  var LOG_LABELS = { haptic: 'Haptic', speech: 'Speech', camera: 'Camera', gps: 'GPS', data: 'Data' };
  var LOG_MAX = 8;

  function log(kind, message, api, muted) {
    if (!logEl) return;
    var placeholder = logEl.querySelector('.pw-log-empty');
    if (placeholder) placeholder.remove();

    var li = document.createElement('li');
    if (muted) li.className = 'is-muted';
    var tag = document.createElement('span');
    tag.className = 'pw-log-tag pw-log-' + kind;
    tag.textContent = LOG_LABELS[kind];
    var msg = document.createElement('span');
    msg.className = 'pw-log-msg';
    msg.textContent = message;
    li.appendChild(tag);
    li.appendChild(msg);
    if (api) {
      var code = document.createElement('code');
      code.textContent = api;
      li.appendChild(code);
    }
    logEl.insertBefore(li, logEl.firstChild);
    while (logEl.children.length > LOG_MAX) logEl.removeChild(logEl.lastChild);
  }

  // ---------- text to speech ----------
  var synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  var ttsOn = !!synth && load('pw-tts') === 'on';
  var voice = null;

  function pickVoice() {
    var voices = synth.getVoices();
    voice = voices.filter(function (v) { return v.lang === 'en-GB'; })[0] ||
            voices.filter(function (v) { return /^en/i.test(v.lang); })[0] || null;
  }
  if (synth) {
    pickVoice();
    if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', pickVoice);
    window.addEventListener('pagehide', function () { synth.cancel(); });
  }

  function say(text) {
    if (!synth) return;
    var utterance = new window.SpeechSynthesisUtterance(text);
    if (voice) utterance.voice = voice;
    utterance.lang = voice ? voice.lang : 'en-GB';
    synth.cancel();
    synth.speak(utterance);
  }

  // speaks only when text to speech is on, like the app's TextToSpeechService;
  // either way the log shows what would have been said
  function announce(text) {
    if (ttsOn) {
      say(text);
      log('speech', '“' + text + '”', 'TextToSpeech.SpeakAsync');
    } else {
      log('speech', 'Would say “' + text + '” ' + (synth ? '(text to speech is off)' : '(not supported in this browser)'), null, true);
    }
  }

  // ---------- settings: dark mode and text to speech ----------
  var themeSwitches = document.querySelectorAll('[data-pref="theme"]');
  var ttsSwitches = document.querySelectorAll('[data-pref="tts"]');
  var isLight = root.classList.contains('pw-light');
  var fadeTimer = null;

  function syncSwitches() {
    Array.prototype.forEach.call(themeSwitches, function (s) { s.setAttribute('aria-checked', String(!isLight)); });
    Array.prototype.forEach.call(ttsSwitches, function (s) { s.setAttribute('aria-checked', String(ttsOn)); });
  }

  function setTheme(light) {
    isLight = light;
    save('pw-theme', light ? 'light' : 'dark');
    syncSwitches();
    if (ttsOn) say('Dark mode turned ' + (light ? 'off' : 'on'));

    if (reduced) {
      root.classList.toggle('pw-light', isLight);
      return;
    }
    // fade out, swap the theme, fade back in: 200ms each way, like the app
    body.classList.add('pw-fading');
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(function () {
      root.classList.toggle('pw-light', isLight);
      body.classList.remove('pw-fading');
    }, 200);
  }

  function setTts(on) {
    if (!synth || on === ttsOn) return;
    // turning it off still says so first, then goes quiet
    if (on) {
      ttsOn = true;
      announce('Text to speech turned on');
    } else {
      announce('Text to speech turned off');
      ttsOn = false;
    }
    save('pw-tts', on ? 'on' : 'off');
    syncSwitches();
  }

  Array.prototype.forEach.call(themeSwitches, function (s) {
    s.addEventListener('click', function () { setTheme(!isLight); });
  });
  Array.prototype.forEach.call(ttsSwitches, function (s) {
    if (!synth) s.disabled = true;
    s.addEventListener('click', function () { setTts(!ttsOn); });
  });
  if (!synth) {
    var support = document.getElementById('pwTtsSupport');
    if (support) support.textContent = "Your browser can't speak, but the log shows what the app would say";
  }
  syncSwitches();

  // ---------- screen tour tabs ----------
  var tour = document.querySelector('.pw-tour');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.pw-tab'));

  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var selected = t === tab;
      var panel = document.getElementById(t.getAttribute('aria-controls'));
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
      if (!panel) return;
      if (selected && panel.hidden) {
        panel.hidden = false;
        panel.classList.remove('is-entering');
        void panel.offsetWidth; // restart the entrance animation
        panel.classList.add('is-entering');
      } else if (!selected) {
        panel.hidden = true;
      }
    });
    if (focus) tab.focus();
  }

  if (tour && tabs.length) {
    tour.classList.add('is-ready');
    selectTab(tabs[0], false);
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { selectTab(tab, false); });
      tab.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
        else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') next = tabs[0];
        else if (e.key === 'End') next = tabs[tabs.length - 1];
        if (next) {
          e.preventDefault();
          selectTab(next, true);
        }
      });
    });
  }

  // ---------- the recreated app ----------
  var app = document.getElementById('pwApp');
  if (!app) return;

  var device = document.getElementById('pwDevice');
  var listScreen = document.getElementById('pwScreenList');
  var form = document.getElementById('pwForm');
  var itemsEl = document.getElementById('pwItems');
  var emptyEl = document.getElementById('pwEmpty');
  var formTitle = document.getElementById('pwFormTitle');
  var formImg = document.getElementById('pwFormImg');
  var nameInput = document.getElementById('pwName');
  var qtyInput = document.getElementById('pwQty');
  var typeInput = document.getElementById('pwType');
  var dateInput = document.getElementById('pwDate');
  var fields = {
    name: document.getElementById('pwFieldName'),
    qty: document.getElementById('pwFieldQty'),
    type: document.getElementById('pwFieldType')
  };
  var sheet = document.getElementById('pwSheet');
  var alertBox = document.getElementById('pwAlert');
  var alertTitle = document.getElementById('pwAlertTitle');
  var alertText = document.getElementById('pwAlertText');
  var alertOk = document.getElementById('pwAlertOk');
  var alertCancel = document.getElementById('pwAlertCancel');
  var cameraInput = document.getElementById('pwCameraInput');
  var galleryInput = document.getElementById('pwGalleryInput');
  var locBtn = document.getElementById('pwLocBtn');
  var locStatus = document.getElementById('pwLocStatus');

  var PLACEHOLDER = 'assets/pantry-crystalball.svg';
  var UNKNOWN_LOCATION = 'Unknown location';
  var itemLocation = UNKNOWN_LOCATION;
  var mode = 'add';
  var editing = null;       // the item open in Edit item
  var pendingImage = null;  // a photo chosen on the form, not saved yet
  var nextId = 1;

  // dates as the app shows them: "Sep 26, 2026" for when an item was added,
  // and the phone's short date (UK style here) for its expiry
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function daysFromToday(n) { var d = startOfDay(new Date()); d.setDate(d.getDate() + n); return d; }
  function formatAdded(d) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  function formatShort(d) { return d.toLocaleDateString('en-GB'); }
  function toInputValue(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fromInputValue(value) {
    var parts = value.split('-');
    return parts.length === 3 ? new Date(+parts[0], +parts[1] - 1, +parts[2]) : daysFromToday(0);
  }

  // a few things already in the pantry
  var items = [
    { name: 'Apples', qty: '6', type: 'pieces', img: 'assets/pantry-apple.svg', added: daysFromToday(-3), exp: daysFromToday(16), loc: '📍 Manchester' },
    { name: 'Bread', qty: '800', type: 'g', img: 'assets/pantry-bread.svg', added: daysFromToday(-1), exp: daysFromToday(5), loc: '📍 Manchester' },
    { name: 'Chicken drumsticks', qty: '1', type: 'kg', img: 'assets/pantry-drumstick.svg', added: daysFromToday(-2), exp: daysFromToday(3), loc: '📍 Manchester' },
    { name: 'Kiwis', qty: '5', type: 'pieces', img: 'assets/pantry-kiwi.svg', added: daysFromToday(-6), exp: daysFromToday(10), loc: '📍 Manchester' }
  ].map(function (item) { item.id = nextId++; return item; });

  function describe(item) {
    return item.name + ', ' + item.qty + ' ' + item.type + ', Expiry: ' + formatShort(item.exp);
  }

  // every tap gets a buzz: a real one where the browser can vibrate (Android),
  // and a shake of the phone on screen everywhere
  function buzz(ms, what) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* no motor */ }
    if (device) {
      device.classList.remove('is-buzzing');
      void device.offsetWidth;
      device.classList.add('is-buzzing');
    }
    log('haptic', what + ' · ' + ms + ' ms', 'Vibration.Default.Vibrate');
  }
  if (device) device.addEventListener('animationend', function () { device.classList.remove('is-buzzing'); });

  // the Add item screen buzzes for 50ms, Edit item for 100ms, as in the app
  function formBuzzMs() { return mode === 'edit' ? 100 : 50; }

  function render(highlightId) {
    itemsEl.textContent = '';
    items.forEach(function (item) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pw-item' + (item.id === highlightId ? ' is-new' : '');
      btn.dataset.id = item.id;

      var img = document.createElement('img');
      img.src = item.img || PLACEHOLDER;
      img.alt = '';
      var name = document.createElement('span');
      name.className = 'pw-item-name';
      name.textContent = item.name;
      var qty = document.createElement('span');
      qty.className = 'pw-item-qty';
      qty.textContent = item.qty + ' ' + item.type;
      var date = document.createElement('span');
      date.className = 'pw-item-date';
      date.textContent = formatAdded(item.added);
      var loc = document.createElement('span');
      loc.className = 'pw-item-loc';
      loc.textContent = item.loc;
      loc.title = item.loc;
      var exp = document.createElement('span');
      exp.className = 'pw-item-exp';
      exp.textContent = 'Exp: ' + formatShort(item.exp);

      [img, name, qty, date, loc, exp].forEach(function (el) { btn.appendChild(el); });
      li.appendChild(btn);
      itemsEl.appendChild(li);
    });
    emptyEl.hidden = items.length > 0;
  }

  function showScreen(screen) {
    var showing = screen === 'list' ? listScreen : form;
    var other = screen === 'list' ? form : listScreen;
    other.hidden = true;
    showing.hidden = false;
    showing.scrollTop = 0;
    showing.classList.remove('is-entering');
    void showing.offsetWidth;
    showing.classList.add('is-entering');
    app.dataset.screen = screen;
  }

  function setImage(src) {
    formImg.src = src || PLACEHOLDER;
    formImg.classList.toggle('is-placeholder', !src);
  }

  function syncTypePlaceholder() { typeInput.classList.toggle('is-empty', !typeInput.value); }

  function clearErrors() {
    Object.keys(fields).forEach(function (k) { fields[k].classList.remove('is-error'); });
  }

  function openForm(newMode, item) {
    mode = newMode;
    editing = item || null;
    pendingImage = null;
    app.dataset.mode = mode;
    formTitle.textContent = mode === 'edit' ? 'Edit item' : 'Add item';
    clearErrors();

    nameInput.value = item ? item.name : '';
    qtyInput.value = item ? item.qty : '';
    typeInput.value = item ? item.type : '';
    syncTypePlaceholder();
    // the expiry picker's earliest date is today, and it starts on today
    var today = daysFromToday(0);
    dateInput.min = toInputValue(today);
    dateInput.value = toInputValue(item && item.exp > today ? item.exp : today);
    setImage(item ? item.img : null);

    showScreen('form');

    // Add item looks up where you are as it opens
    if (mode === 'add') {
      if (itemLocation === UNKNOWN_LOCATION) {
        log('gps', 'Location not shared, so this item will be saved as “Unknown location”', null, true);
      } else {
        log('gps', 'This item will be stamped ' + itemLocation, 'Geolocation.GetLocationAsync');
      }
    }
  }

  function backToList(highlightId) {
    render(highlightId);
    showScreen('list');
    var target = highlightId && itemsEl.querySelector('[data-id="' + highlightId + '"]');
    if (target) {
      target.scrollIntoView({ block: 'nearest' });
      target.focus({ preventScroll: true });
    } else {
      document.getElementById('pwAddBtn').focus({ preventScroll: true });
    }
  }

  // ---------- overlays inside the phone (action sheet, alerts) ----------
  var overlayReturn = null;
  var alertDone = null;

  function openOverlay(el, firstFocus) {
    overlayReturn = document.activeElement;
    el.hidden = false;
    firstFocus.focus({ preventScroll: true });
  }
  function closeOverlay(el) {
    el.hidden = true;
    if (overlayReturn && document.body.contains(overlayReturn) && overlayReturn.offsetParent !== null) {
      overlayReturn.focus({ preventScroll: true });
    }
    overlayReturn = null;
  }
  // keeps Tab inside an open overlay, and Esc closes it
  [sheet, alertBox].forEach(function (el) {
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (el === sheet) closeOverlay(sheet);
        else finishAlert(false);
        return;
      }
      if (e.key !== 'Tab') return;
      var buttons = Array.prototype.filter.call(el.querySelectorAll('button'), function (b) { return !b.hidden; });
      var first = buttons[0];
      var last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    el.addEventListener('click', function (e) {
      if (e.target !== el) return;
      if (el === sheet) closeOverlay(sheet);
      else finishAlert(false);
    });
  });

  // DisplayAlert: a title, a message, OK (or a named action) and optionally Cancel
  function showAlert(title, text, okLabel, cancelLabel, danger, done) {
    alertTitle.textContent = title;
    alertText.textContent = text;
    alertOk.textContent = okLabel;
    alertOk.classList.toggle('is-danger', !!danger);
    alertCancel.hidden = !cancelLabel;
    if (cancelLabel) alertCancel.textContent = cancelLabel;
    alertDone = done || null;
    openOverlay(alertBox, alertOk);
  }
  function finishAlert(confirmed) {
    var done = alertDone;
    alertDone = null;
    closeOverlay(alertBox);
    if (done) done(confirmed);
  }
  alertOk.addEventListener('click', function () { finishAlert(true); });
  alertCancel.addEventListener('click', function () { finishAlert(false); });

  // ---------- list screen ----------
  document.getElementById('pwAddBtn').addEventListener('click', function () {
    buzz(50, 'Add button tapped');
    announce('Add item');
    openForm('add');
  });

  itemsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.pw-item');
    if (!btn) return;
    var item = items.filter(function (it) { return it.id === +btn.dataset.id; })[0];
    if (!item) return;
    buzz(50, item.name + ' tapped');
    announce(describe(item));
    openForm('edit', item);
  });

  // ---------- form screen ----------
  var FIELD_PROMPTS = [
    [nameInput, 'Name field focused', 'Item name'],
    [qtyInput, 'Quantity field focused', 'Item quantity'],
    [typeInput, 'Quantity type picker focused', 'Select quantity type'],
    [dateInput, 'Date picker focused', 'Select expiration date']
  ];
  FIELD_PROMPTS.forEach(function (p) {
    p[0].addEventListener('focus', function () {
      buzz(formBuzzMs(), p[1]);
      announce(p[2]);
    });
  });
  // a red field goes back to normal as soon as it's changed
  nameInput.addEventListener('input', function () { fields.name.classList.remove('is-error'); });
  qtyInput.addEventListener('input', function () { fields.qty.classList.remove('is-error'); });
  typeInput.addEventListener('change', function () { fields.type.classList.remove('is-error'); syncTypePlaceholder(); });

  document.getElementById('pwEditImage').addEventListener('click', function () {
    buzz(formBuzzMs(), 'Edit image tapped');
    openOverlay(sheet, document.getElementById('pwTakePhoto'));
  });
  sheet.querySelector('[data-close]').addEventListener('click', function () { closeOverlay(sheet); });
  document.getElementById('pwTakePhoto').addEventListener('click', function () {
    closeOverlay(sheet);
    cameraInput.click();
  });
  document.getElementById('pwChoosePhoto').addEventListener('click', function () {
    closeOverlay(sheet);
    galleryInput.click();
  });

  function usePhoto(input, message, api) {
    var file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      showAlert('Camera Error', "That file isn't an image.", 'OK');
      return;
    }
    pendingImage = URL.createObjectURL(file);
    setImage(pendingImage);
    log('camera', message, api);
  }
  cameraInput.addEventListener('change', function () {
    usePhoto(cameraInput, 'Photo taken and shown on the form', 'MediaPicker.CapturePhotoAsync');
  });
  galleryInput.addEventListener('change', function () {
    usePhoto(galleryInput, 'Image picked from the gallery', 'FilePicker.PickAsync');
  });

  function validate() {
    var ok = true;
    if (!nameInput.value.trim()) { fields.name.classList.add('is-error'); ok = false; }
    if (!qtyInput.value.trim()) { fields.qty.classList.add('is-error'); ok = false; }
    if (!typeInput.value) { fields.type.classList.add('is-error'); ok = false; }
    return ok;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var editingNow = mode === 'edit';
    buzz(formBuzzMs(), editingNow ? 'Save tapped' : 'Submit tapped');

    if (!validate()) {
      if (editingNow) showAlert('Incomplete Form', 'Please fill in all required fields before saving.', 'OK');
      else showAlert('Error', 'Please fill all required fields.', 'OK');
      return;
    }

    var exp = fromInputValue(dateInput.value);
    if (exp < daysFromToday(0)) exp = daysFromToday(0);

    if (editingNow) {
      editing.name = nameInput.value.trim();
      editing.qty = qtyInput.value.trim();
      editing.type = typeInput.value;
      editing.exp = exp;
      if (pendingImage) editing.img = pendingImage;
      announce('Saved ' + describe(editing));
      log('data', 'Updated ' + editing.name, 'PantryDatabase.SaveItemAsync (UPDATE)');
      backToList(editing.id);
    } else {
      var item = {
        id: nextId++,
        name: nameInput.value.trim(),
        qty: qtyInput.value.trim(),
        type: typeInput.value,
        img: pendingImage,
        added: new Date(),
        exp: exp,
        loc: itemLocation
      };
      items.push(item);
      announce('Added ' + describe(item));
      log('data', 'Added ' + item.name + ' to the pantry', 'PantryDatabase.SaveItemAsync (INSERT)');
      backToList(item.id);
    }
  });

  Array.prototype.forEach.call(form.querySelectorAll('[data-cancel]'), function (btn) {
    btn.addEventListener('click', function () {
      buzz(formBuzzMs(), 'Cancel tapped');
      announce('Cancelled.');
      backToList(editing ? editing.id : null);
    });
  });

  document.getElementById('pwDelete').addEventListener('click', function () {
    if (!editing) return;
    var item = editing;
    buzz(100, 'Delete tapped');
    announce('Are you sure you want to delete ' + item.name + '?');
    showAlert('Delete Item', 'Are you sure you want to delete this item?', 'Delete', 'Cancel', true, function (confirmed) {
      if (!confirmed) {
        announce('Deletion cancelled.');
        return;
      }
      items = items.filter(function (it) { return it !== item; });
      log('data', 'Deleted ' + item.name, 'PantryDatabase.DeleteItemAsync');
      announce(item.name + ' deleted.');
      backToList(null);
    });
  });

  // ---------- location ----------
  // The app asks for permission, takes a high-accuracy reading with a 10
  // second timeout, then turns it into a city name with Google's Geocoding
  // API. The web version stops at the coordinates, which is what the app
  // falls back to when the city lookup fails.
  if (locBtn) {
    if (!navigator.geolocation) {
      locBtn.disabled = true;
      locStatus.textContent = "Your browser can't share a location, so items stay “Unknown location”";
    }
    locBtn.addEventListener('click', function () {
      locBtn.disabled = true;
      locStatus.textContent = 'Asking for permission…';
      log('gps', 'Asking for location permission', 'Permissions.RequestAsync<LocationWhenInUse>');
      navigator.geolocation.getCurrentPosition(function (pos) {
        itemLocation = '📍 ' + pos.coords.latitude.toFixed(4) + ', ' + pos.coords.longitude.toFixed(4);
        locStatus.textContent = 'New items get ' + itemLocation + '. The app would also look up the city name with Google.';
        locBtn.lastChild.textContent = 'Location on';
        log('gps', 'Got a fix: ' + itemLocation, 'Geolocation.GetLocationAsync');
      }, function (err) {
        locBtn.disabled = false;
        locStatus.textContent = err.code === err.PERMISSION_DENIED
          ? 'Permission refused, so new items are saved as “Unknown location”, like the app'
          : "Couldn't get a location this time, so new items are saved as “Unknown location”";
        log('gps', err.code === err.PERMISSION_DENIED ? 'Permission refused' : 'No location fix', null, true);
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    });
  }

  app.dataset.mode = mode;
  render(null);
})();
