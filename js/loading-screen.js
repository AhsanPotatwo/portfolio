// loading screens: an html overlay laid over whatever's loading (a game's canvas, a panel...), styled
// in css/loading-screen.css. any page can use it, with as many as it likes at once:
//
//   const loading = LoadingScreen.show(element, { theme: 'squimble', text: 'Loading maps…' });
//   loading.progress(0.5);       // 0 to 1, the theme shows it however it likes (a bar, a ring...)
//   loading.text('Nearly there'); // changes the words
//   loading.hide();               // fades out, then it's gone
//
// a theme is its markup here plus its styles in the css, under .ls-<name>. to add or redo one (from a
// figma design, say), only those two change. what a theme's markup can use:
//   data-ls-text         this element shows the text
//   --progress           0 to 1 on the overlay, for the css, e.g. width: calc(var(--progress) * 100%)
//   --u                  one design px: the overlay is --ls-design-w (960 by default) of them wide, so a
//                        design drawn at that width scales to any size, e.g. font-size: calc(22 * var(--u))
const LoadingScreen = {
  THEMES: {
    // temporary, until there's a real design. a night forest like the squimble quest page
    squimble: `
      <i class="ls-firefly" style="--x:14%; --y:22%; --d:0s"></i>
      <i class="ls-firefly" style="--x:80%; --y:30%; --d:-1.4s"></i>
      <i class="ls-firefly" style="--x:28%; --y:74%; --d:-2.6s"></i>
      <i class="ls-firefly" style="--x:68%; --y:80%; --d:-0.7s"></i>
      <i class="ls-firefly" style="--x:90%; --y:62%; --d:-3.3s"></i>
      <div class="ls-title">Squimble <span>Quest</span></div>
      <div class="ls-bar"><div class="ls-bar-fill"></div></div>
      <p class="ls-text" data-ls-text></p>`,
  },

  // puts a loading screen over parent (which needs to be positioned, e.g. position: relative) and
  // returns its controls
  show(parent, { theme = 'squimble', text = 'Loading…', progress = 0 } = {}) {
    const el = document.createElement('div');
    el.className = `loading-screen ls-${theme}`;
    el.setAttribute('role', 'status');
    el.innerHTML = this.THEMES[theme] ?? '<p class="ls-text" data-ls-text></p>';
    parent.append(el);
    const words = el.querySelector('[data-ls-text]');

    const screen = {
      el,
      progress(amount) { el.style.setProperty('--progress', Math.min(Math.max(amount, 0), 1)); },
      text(value) { if (words) words.textContent = value; },
      // waits for the theme's fade out (a transition on .ls-hidden, if it has one) before taking it away
      hide() {
        el.classList.add('ls-hidden');
        Promise.all(el.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => a.finished))
          .catch(() => {})
          .then(() => el.remove());
      },
    };
    screen.progress(progress);
    screen.text(text);
    return screen;
  },
};
