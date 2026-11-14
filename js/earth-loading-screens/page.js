// earth loading screens: shows TIPS (tips.js) one at a time like a video game's loading screen, in a
// shuffled order, moving on by itself after long enough to read each one. the loading bar creeps up
// as they go by and gets to 99%, then the planet "fails to load" and it starts again, reshuffled.
//
// pictures come straight from Wikimedia Commons. for each one the Commons API gives a thumbnail of the
// right size and who made it and its licence, for the credit under the frame. if the API can't be
// reached the picture is loaded by name instead and the credit just points to its Commons page. a
// picture that won't load at all is skipped, with its name in the console so it can be fixed.
//
// also here: the theme switch (the colours are all in css/earth-loading-screens.css), the globe's word in
// languages from round the world, and the music, on from the start: it
// loads the squimble music maker's composer and band and plays calm
// songs it writes there and then, a new one every few minutes
(() => {
  const $ = id => document.getElementById(id);
  const screen = $('screen'), thumb = $('elThumb'), img = $('elImg'), text = $('elText'), caption = $('elCaption');
  const credit = $('elCredit'), enlarge = $('elEnlarge');
  const statusWords = $('elStatus'), pct = $('elPct'), bar = $('elBar'), fill = $('elFill');
  const back = $('elBack'), pause = $('elPause'), next = $('elNext'), full = $('elFull'), music = $('elMusic');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- themes ----------
  // the line in the page's head has already put the saved one on <html> before anything was drawn
  const themeKeys = document.querySelectorAll('.el-theme');
  function setTheme(name) {
    document.documentElement.dataset.elTheme = name;
    themeKeys.forEach(key => key.setAttribute('aria-pressed', key.dataset.theme === name));
    try { localStorage.setItem('earthLoadingTheme', name); } catch { /* not remembered, that's all */ }
  }
  themeKeys.forEach(key => key.addEventListener('click', () => setTheme(key.dataset.theme)));
  setTheme(document.documentElement.dataset.elTheme || 'white');

  // ---------- tips ----------
  // what the loading bar says it's doing, one per tip
  const STATUS = [
    'Loading Earth', 'Filling the oceans', 'Placing mountains', 'Painting the sky blue', 'Waking up the Sun',
    'Teaching birds to sing', 'Untangling rivers', 'Counting the sheep', 'Planting forests', 'Folding the clouds',
    'Polishing the Moon', 'Sorting the sand', 'Tuning the thunder', 'Hiding the treasure', 'Dusting the deserts',
    'Stacking the rocks', 'Switching on the stars', 'Warming up the volcanoes', 'Salting the sea', 'Spinning the globe',
    'Baking the bread', 'Inviting the neighbours', 'Hanging up the lanterns', 'Tidying the libraries', 'Wrapping the presents',
    'Ringing the bells', 'Feeding the ducks', 'Putting the kettle on', 'Learning every language', 'Writing the postcards',
  ];
  const API = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=960&titles=File:';
  const FILE_PAGE = 'https://commons.wikimedia.org/wiki/File:';

  // the globe's "Loading", round the world: English first, then a new language every few seconds in a
  // shuffled order. [language code, word], the code so each is read and drawn as its own language.
  // add more anywhere in the list
  const LOADING = [
    ['es', 'Cargando'], ['fr', 'Chargement'], ['de', 'Wird geladen'], ['it', 'Caricamento'], ['pt', 'Carregando'],
    ['nl', 'Laden'], ['ca', 'Carregant'], ['eu', 'Kargatzen'], ['cy', 'Yn llwytho'], ['ga', 'Ag lódáil'],
    ['gd', "A' luchdadh"], ['is', 'Hleður'], ['sv', 'Laddar'], ['nb', 'Laster'], ['da', 'Indlæser'],
    ['fi', 'Ladataan'], ['et', 'Laadimine'], ['lv', 'Ielādē'], ['lt', 'Įkeliama'], ['pl', 'Ładowanie'],
    ['cs', 'Načítání'], ['sk', 'Načítava sa'], ['sl', 'Nalaganje'], ['hr', 'Učitavanje'], ['sr', 'Учитавање'],
    ['mk', 'Се вчитува'], ['bg', 'Зареждане'], ['sq', 'Po ngarkohet'], ['hu', 'Betöltés'], ['ro', 'Se încarcă'],
    ['el', 'Φόρτωση'], ['mt', 'Qed jillowdja'], ['ru', 'Загрузка'], ['uk', 'Завантаження'], ['ka', 'იტვირთება'],
    ['hy', 'Բեռնվում է'], ['az', 'Yüklənir'], ['tr', 'Yükleniyor'], ['kk', 'Жүктелуде'], ['mn', 'Ачаалж байна'],
    ['ar', 'جارٍ التحميل'], ['he', 'טוען'], ['fa', 'در حال بارگذاری'], ['ur', 'لوڈ ہو رہا ہے'],
    ['hi', 'लोड हो रहा है'], ['mr', 'लोड होत आहे'], ['ne', 'लोड हुँदैछ'], ['bn', 'লোড হচ্ছে'],
    ['pa', 'ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ'], ['gu', 'લોડ થઈ રહ્યું છે'], ['ta', 'ஏற்றுகிறது'], ['te', 'లోడ్ అవుతోంది'],
    ['kn', 'ಲೋಡ್ ಆಗುತ್ತಿದೆ'], ['ml', 'ലോഡുചെയ്യുന്നു'], ['si', 'පූරණය වෙමින්'], ['th', 'กำลังโหลด'],
    ['lo', 'ກຳລັງໂຫຼດ'], ['km', 'កំពុងផ្ទុក'], ['vi', 'Đang tải'], ['id', 'Memuat'], ['ms', 'Memuatkan'],
    ['tl', 'Naglo-load'], ['zh-Hans', '加载中'], ['zh-Hant', '載入中'], ['ja', '読み込み中'], ['ko', '로딩 중'],
    ['sw', 'Inapakia'], ['am', 'በመጫን ላይ'], ['ha', 'Ana lodawa'], ['zu', 'Iyalayisha'], ['af', 'Laai'],
    ['mi', 'E uta ana'], ['haw', 'Ke hoʻouka nei'], ['eo', 'Ŝargante'],
    // and some nobody speaks at home any more: Latin, Ancient Greek, Old English and Old Norse
    ['la', 'Oneratur'], ['grc', 'Φορτίζεται'], ['ang', 'Hladende'], ['non', 'Hlaðandi'],
  ];
  const ENGLISH_FOR = 8000, EACH_FOR = 4000;

  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const plain = html => new DOMParser().parseFromString(html || '', 'text/html').body.textContent.trim();
  const escape = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // a caption's [[links]] as Wikipedia writes them: [[Page]], [[Page|other words]], and letters straight
  // after the brackets join the link, so [[Shadow]]s links "Shadows" to Shadow
  const linked = t => escape(t).replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]([a-z]*)/g, (_, page, words, tail) =>
    `<a href="https://en.wikipedia.org/wiki/${encodeURIComponent(page.replace(/ /g, '_'))}" target="_blank" rel="noopener">${words || page}${tail}</a>`);
  const unlinked = t => t.replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1');

  // each picture's thumbnail and credit, asked for once
  const pictures = new Map();
  function picture(file) {
    if (!pictures.has(file)) {
      const fallback = { src: 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(file) + '?width=960', page: FILE_PAGE + encodeURIComponent(file) };
      pictures.set(file, fetch(API + encodeURIComponent(file))
        .then(r => r.json())
        .then(j => {
          const info = Object.values(j.query.pages)[0].imageinfo[0], meta = info.extmetadata || {};
          return { src: info.thumburl || info.url, page: info.descriptionurl, by: plain(meta.Artist?.value), licence: plain(meta.LicenseShortName?.value) };
        })
        .catch(() => fallback));
    }
    return pictures.get(file);
  }
  // the picture downloaded and ready to draw, so it never pops in half loaded
  async function ready(tip) {
    const p = await picture(tip.pic);
    const pre = new Image();
    pre.src = p.src;
    await pre.decode();
    p.ratio = pre.naturalWidth / pre.naturalHeight;
    return p;
  }

  let order = shuffle([...TIPS.keys()]);
  let at = -1;          // where in order we are
  let shown = 0;        // how far through this tip's time we are, 0 to 1
  let length = 1;       // this tip's time, in ms
  let paused = false;
  let busy = false;     // between tips, waiting on a picture
  let wanted = null;    // a tip asked for while busy, shown next
  let loops = 0;
  let failures = 0;     // pictures in a row that wouldn't load

  // long enough to read: a few seconds plus a bit for every letter
  const readingTime = tip => 6000 + unlinked(tip.text).length * 55;

  async function show(i, byHand) {
    if (busy) { wanted = i; return; }
    busy = true;
    if (i >= order.length) {
      // the end of the list: "fail" to load, and go round again in a new order
      order = shuffle([...TIPS.keys()]);
      i = 0;
      loops++;
    }
    const way = i < at && i > 0 ? -1 : 1;
    i = Math.max(0, i);
    const tip = TIPS[order[i]];
    let p;
    try {
      [p] = await Promise.all([ready(tip), leave()]);
      failures = 0;
    } catch {
      busy = false;
      // a few in a row is the internet, not the pictures: say so and try again in a bit
      if (++failures >= 4) {
        failures = 0;
        statusWords.textContent = 'Earth could not load. Is the internet on';
        setTimeout(() => show(i, false), 10000);
        return;
      }
      console.warn('Earth loading screens: this picture would not load, so its tip was skipped:', tip.pic);
      return show(i + way, byHand);
    }
    at = i;
    shown = 0;
    length = readingTime(tip);
    thumb.style.setProperty('--ratio', p.ratio);
    img.src = p.src;
    img.alt = unlinked(tip.text);
    text.innerHTML = linked(tip.text);
    enlarge.href = p.page;
    credit.textContent = p.by ? `Picture: ${p.by}${p.licence ? ', ' + p.licence : ''}` : p.licence ? `Picture: ${p.licence}` : '';
    statusWords.textContent = loops && at === 0 ? 'Earth failed to load. Trying again' : STATUS[(at + loops) % STATUS.length];
    // screen readers hear the new caption only when it was asked for, not every few seconds
    caption.setAttribute('aria-live', byHand ? 'polite' : 'off');
    thumb.classList.remove('is-out');
    busy = false;
    // the next picture starts downloading now, so it's ready in time
    const after = order[at + 1];
    if (after !== undefined) ready(TIPS[after]).catch(() => {});
    if (wanted !== null) { const w = wanted; wanted = null; show(w, true); }
  }
  function leave() {
    thumb.classList.add('is-out');
    return new Promise(r => setTimeout(r, reduceMotion.matches || at < 0 ? 0 : 300));
  }

  // the bar: how many tips have gone by, eased like every loading bar that ever lied, quick at first then
  // crawling, a fifth of the way after a few tips, halfway after a few dozen, never past 99
  function draw() {
    const x = (Math.max(at, 0) + shown) / order.length;
    const done = 99 * (1 - (1 - x) ** 4.5);
    fill.style.width = done + '%';
    pct.textContent = Math.floor(done) + '%';
    bar.setAttribute('aria-valuenow', Math.floor(done));
  }
  let last = performance.now();
  function tick(now) {
    // at most a tenth of a second at a time, so time away from the tab doesn't count
    const dt = Math.min(100, now - last);
    last = now;
    if (!paused && !busy && at >= 0) {
      shown = Math.min(1, shown + dt / length);
      if (shown >= 1) show(at + 1, false);
    }
    draw();
    requestAnimationFrame(tick);
  }

  function setPaused(on) {
    paused = on;
    pause.setAttribute('aria-pressed', on);
    pause.setAttribute('aria-label', on ? 'Play' : 'Pause');
    pause.title = on ? 'Play (space)' : 'Pause (space)';
  }
  const step = d => show((wanted ?? at) + d, true);

  // the globe's word: fades out, changes language, fades back in. RTL ones (Arabic, Hebrew...) get dir
  // so the dots still come after them
  const word = $('elWord');
  let languages = [];
  function nextWord() {
    if (!languages.length) languages = shuffle([...LOADING]);
    const [lang, says] = languages.pop();
    word.classList.add('is-out');
    setTimeout(() => {
      word.lang = lang;
      word.dir = /^(ar|he|fa|ur)$/.test(lang) ? 'rtl' : 'ltr';
      word.textContent = says;
      // a long one is drawn a little smaller to fit
      word.style.fontSize = '';
      const room = word.parentElement.clientWidth - word.nextElementSibling.offsetWidth;
      if (word.offsetWidth > room) word.style.fontSize = room / word.offsetWidth + 'em';
      word.classList.remove('is-out');
    }, reduceMotion.matches ? 0 : 400);
    setTimeout(nextWord, EACH_FOR);
  }
  setTimeout(nextWord, ENGLISH_FOR);

  // ---------- music ----------
  // the squimble music maker's composer and band (js/squimble-music-maker, in its load order), loaded
  // once the page is up. songs come from the maker's gentlest moods, a fresh seed each,
  // each time round a little different (vary), and every few minutes the next one takes over at the end
  // of a section, the way the maker's Game tab moves from song to song
  const MAKER = 'js/squimble-music-maker/';
  const CALM = ['calm', 'heavenly', 'nostalgic', 'calm', 'wintry'];
  const SONG_MINUTES = 4;
  let player = null, nextSong = null, loading = null;

  const addScript = src => new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = fail;
    document.body.append(s);
  });
  function calmSong() {
    const mood = CALM[Math.floor(Math.random() * CALM.length)];
    const song = generateSong(mood, MOODS[mood].style, newSeed(makeRng(Math.random(), Date.now())));
    // background music: quieter than the maker plays it
    song.fx = { ...song.fx, volume: 0.42 };
    // written is the song as written, for vary to write again; song and comp are what the player plays
    return { written: song, ...playable(song, composeSong(song)) };
  }
  // a song has started: it varies each time round, and in a few minutes the next takes over
  function startSong(current) {
    player.vary = round => playable(current.written, composeSong(current.written, round)).comp;
    clearTimeout(nextSong);
    nextSong = setTimeout(() => {
      if (!player.playing) return;
      const after = calmSong();
      player.queue(after.song, after.comp, 'section', () => startSong(after));
    }, SONG_MINUTES * 60000);
  }
  // on unless it was turned off last time
  const remember = on => { try { localStorage.setItem('earthLoadingMusic', on ? 'on' : 'off'); } catch { /* not remembered */ } };
  async function toggleMusic() {
    if (music.getAttribute('aria-pressed') === 'true' && loading) {
      player?.stop();
      clearTimeout(nextSong);
      music.setAttribute('aria-pressed', false);
      remember(false);
      return;
    }
    music.setAttribute('aria-pressed', true);
    remember(true);
    if (!player) {
      music.classList.add('is-waiting');
      try {
        loading ??= ['instruments.js', 'synth.js', 'moods.js', 'music.js'].reduce((p, f) => p.then(() => addScript(MAKER + f)), Promise.resolve());
        await loading;
        player ??= new MusicPlayer();
      } catch {
        loading = null;
        music.setAttribute('aria-pressed', false);
        statusWords.textContent = 'The music could not load';
        return;
      } finally {
        music.classList.remove('is-waiting');
      }
      // pressed again (off) while it loaded
      if (music.getAttribute('aria-pressed') !== 'true') return;
    }
    const first = calmSong();
    player.load(first.song, first.comp);
    startSong(first);
    player.play();
  }

  // ---------- keys ----------
  back.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  pause.addEventListener('click', () => setPaused(!paused));
  pause.setAttribute('aria-pressed', false);
  music.addEventListener('click', toggleMusic);

  const toggleFull = () => document.fullscreenElement ? document.exitFullscreen() : screen.requestFullscreen().then(() => screen.focus());
  if (document.fullscreenEnabled) full.addEventListener('click', toggleFull);
  else full.hidden = true;

  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // space on a focused button or link presses that instead
    const onControl = e.target.closest('button, a');
    const key = e.key.toLowerCase();
    if (key === 'arrowright') step(1);
    else if (key === 'arrowleft') step(-1);
    else if (key === ' ' && !onControl) setPaused(!paused);
    else if (key === 'm') toggleMusic();
    else if (key === 'f' && document.fullscreenEnabled) toggleFull();
    else return;
    e.preventDefault();
  });

  // music is on from the start, unless it was turned off last time. browsers hold sound back until the
  // page is first clicked or a key pressed, so it's ready and waiting and starts then
  let musicWas = null;
  try { musicWas = localStorage.getItem('earthLoadingMusic'); } catch { /* on, then */ }
  if (musicWas === 'off') music.setAttribute('aria-pressed', false);
  else toggleMusic();
  const unblock = () => { if (player?.playing && player.ctx.state !== 'running') player.wake(); };
  document.addEventListener('click', unblock);
  document.addEventListener('keydown', unblock);

  show(0, false);
  requestAnimationFrame(tick);
})();
