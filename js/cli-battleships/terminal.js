// The playable terminal on the CLI Battleships page.
//
// It's a tiny pretend shell (help, ls, cat, clear, history...) that can
// "run" JavaScript ports of the three versions of the game. Each port keeps
// its original's prompts, messages, board layout and turn order, so playing
// the Python, C and Rust versions here feels like running the real thing:
//
//   python3 PYTHON_battleships.py
//   gcc C_battleships.c -o battleships && ./battleships
//   cargo run            (or rustc RUST_battleships.rs && ./RUST_battleships)
//
// The games are generator functions. Whenever one needs input it yields an
// ask(...) request; the terminal shows that prompt, waits for the player to
// press Enter, and passes the typed line back in with next(). That keeps
// each port reading top to bottom like the original program.
(function () {
  'use strict';

  var body = document.getElementById('cbTermBody');
  var out = document.getElementById('cbTermOut');
  var promptEl = document.getElementById('cbTermPrompt');
  var input = document.getElementById('cbTermInput');
  var stopBtn = document.getElementById('cbTermStop');
  if (!body || !out || !promptEl || !input) return;

  var reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var REPO = 'https://github.com/AhsanPotatwo/CLI-Battlehips';
  var FILES = ['C_battleships.c', 'PYTHON_battleships.py', 'README.md', 'RUST_battleships.rs'];

  // ---------- output ----------

  // one line of output. `parts` is a string or a list of [text, className]
  // pairs, so user input is only ever inserted as text, never as HTML
  function print(parts, cls) {
    var line = document.createElement('div');
    if (cls) line.className = cls;
    if (typeof parts === 'string') {
      line.textContent = parts;
    } else {
      parts.forEach(function (p) {
        if (typeof p === 'string') { line.appendChild(document.createTextNode(p)); return; }
        var span = document.createElement('span');
        span.textContent = p[0];
        if (p[1]) span.className = p[1];
        line.appendChild(span);
      });
    }
    out.appendChild(line);
    // keep the log from growing forever over a long session
    while (out.childNodes.length > 1500) out.removeChild(out.firstChild);
    scrollToEnd();
  }

  function scrollToEnd() {
    body.scrollTop = body.scrollHeight;
  }

  var SHELL_PROMPT = [['guest@ahsan', 't-user'], ':', ['~/cli-battleships', 't-dir'], '$ '];

  function setPrompt(parts) {
    promptEl.textContent = '';
    (typeof parts === 'string' ? [parts] : parts).forEach(function (p) {
      if (typeof p === 'string') { promptEl.appendChild(document.createTextNode(p)); return; }
      var span = document.createElement('span');
      span.textContent = p[0];
      span.className = p[1];
      promptEl.appendChild(span);
    });
    scrollToEnd();
  }

  // draws a board the way the original prints it: a header row of column
  // numbers, then each row number followed by its cells. C and Rust print a
  // space after every cell, Python joins them with spaces.
  function printGrid(grid, reveal, trailingSpace) {
    var n = grid.length;
    var head = [];
    for (var i = 0; i < n; i++) head.push(String(i));
    print([['  ' + head.join(' ') + (trailingSpace ? ' ' : ''), 'c-axis']]);
    for (var r = 0; r < n; r++) {
      var parts = [[r + ' ', 'c-axis']];
      for (var c = 0; c < n; c++) {
        var cell = grid[r][c];
        if (cell === 'S' && !reveal) cell = '~';
        var cls = cell === 'S' ? 'c-ship' : cell === 'X' ? 'c-hit' : cell === 'O' ? 'c-miss' : 'c-water';
        parts.push([cell, cls]);
        if (c < n - 1 || trailingSpace) parts.push(' ');
      }
      print(parts);
    }
  }

  // ---------- helpers shared by the games ----------

  function ask(prompt, inline) {
    return { prompt: prompt, inline: inline !== false };
  }

  function randInt(n) { return Math.floor(Math.random() * n); }

  function makeGrid(n) {
    var g = [];
    for (var i = 0; i < n; i++) {
      var row = [];
      for (var j = 0; j < n; j++) row.push('~');
      g.push(row);
    }
    return g;
  }

  function key(x, y) { return x + ',' + y; }

  // ---------- Python version ----------
  // A BattleshipGame "object" holding both grids, both ship lists and the
  // set of the computer's guesses, as in the original class.
  function* pythonGame() {
    // Python's int() accepts surrounding spaces and a sign, nothing else
    function pyInt(s) {
      return /^\s*[+-]?\d+\s*$/.test(s) ? parseInt(s, 10) : null;
    }

    var GRID_SIZE, NUM_SHIPS, v;
    while (true) {
      v = pyInt(yield ask('Enter the size of the board (e.g., 8 for an 8x8 grid, Max 10x10): '));
      if (v === null) { print([['Invalid input. Please enter a valid number.', 't-err']]); continue; }
      if (11 > v && v > 0) { GRID_SIZE = v; break; }
      print([['Please enter a valid number.', 't-err']]);
    }
    var maxShips = GRID_SIZE * GRID_SIZE;
    while (true) {
      v = pyInt(yield ask('Enter the number of ships (maximum ' + maxShips + '): '));
      if (v === null) { print([['Invalid input. Please enter a valid number.', 't-err']]); continue; }
      if (v >= 1 && v <= maxShips) { NUM_SHIPS = v; break; }
      print([['Please enter a number between 1 and ' + maxShips + '.', 't-err']]);
    }

    var game = {
      playerGrid: makeGrid(GRID_SIZE),
      computerGrid: makeGrid(GRID_SIZE),
      computerShips: [],
      playerShips: [],
      computerGuesses: {}
    };

    function placeShips(grid, ships) {
      while (ships.length < NUM_SHIPS) {
        var x = randInt(GRID_SIZE), y = randInt(GRID_SIZE);
        if (ships.indexOf(key(x, y)) === -1) {
          ships.push(key(x, y));
          grid[x][y] = 'S';
        }
      }
    }

    function makeGuess(grid, ships, x, y) {
      var i = ships.indexOf(key(x, y));
      if (i !== -1) {
        grid[x][y] = 'X';
        ships.splice(i, 1);
        print([['Hit!', 't-ok']]);
        return true;
      }
      // (the original would also turn an earlier hit back into an O here)
      if (grid[x][y] !== 'X') grid[x][y] = 'O';
      print('Miss.');
      return false;
    }

    function checkWinner() {
      if (!game.playerShips.length) return 'Computer';
      if (!game.computerShips.length) return 'Player';
      return null;
    }

    print('Welcome to Ahsan\'s Battleships!');
    placeShips(game.computerGrid, game.computerShips);
    placeShips(game.playerGrid, game.playerShips);

    while (true) {
      print('');
      print([['Your Grid:', 't-head']]);
      printGrid(game.playerGrid, true, false);
      print('');
      print('');
      print([['Computer\'s Grid:', 't-head']]);
      printGrid(game.computerGrid, false, false);
      print('');

      print('Your turn!');
      var x, y;
      while (true) {
        var parts = String(yield ask('Enter your guess (row and column, e.g., 2 3): ')).trim().split(/\s+/);
        if (parts.length !== 2 || pyInt(parts[0]) === null || pyInt(parts[1]) === null) {
          print([['Invalid input. Please enter two numbers separated by a space.', 't-err']]);
          continue;
        }
        x = pyInt(parts[0]); y = pyInt(parts[1]);
        if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) break;
        print([['Invalid input. Please enter values between 0 and ' + (GRID_SIZE - 1) + '.', 't-err']]);
      }
      makeGuess(game.computerGrid, game.computerShips, x, y);

      var winner = checkWinner();
      if (winner) { print([[winner + ' wins!', winner === 'Player' ? 't-ok' : 't-err']]); return; }

      print('Computer\'s turn!');
      while (true) {
        var cx = randInt(GRID_SIZE), cy = randInt(GRID_SIZE);
        if (!game.computerGuesses[key(cx, cy)]) {
          game.computerGuesses[key(cx, cy)] = true;
          print('Computer guesses: ' + cx + ', ' + cy);
          makeGuess(game.playerGrid, game.playerShips, cx, cy);
          break;
        }
      }

      winner = checkWinner();
      if (winner) { print([[winner + ' wins!', winner === 'Player' ? 't-ok' : 't-err']]); return; }
    }
  }

  // ---------- C version ----------
  // Two fixed char grids and two ship counters, changed in place by plain
  // functions, as in the original.
  function* cGame() {
    // scanf("%d") takes the number at the start of the input and ignores
    // whatever follows it
    function getValidIntInput(prompt, min, max) {
      return (function* () {
        while (true) {
          var m = /^\s*([+-]?\d+)/.exec(yield ask(prompt));
          var v = m ? parseInt(m[1], 10) : NaN;
          if (m && v >= min && v <= max) return v;
          print([['Invalid input. Please enter a number between ' + min + ' and ' + max + '.', 't-err']]);
        }
      })();
    }

    var gridSize = yield* getValidIntInput('Enter the size of the board (1-10): ', 1, 10);
    var numShips = yield* getValidIntInput('Enter the number of ships: ', 1, gridSize * gridSize);

    var playerGrid = makeGrid(gridSize);
    var computerGrid = makeGrid(gridSize);

    function placeShips(grid) {
      var placed = 0;
      while (placed < numShips) {
        var x = randInt(gridSize), y = randInt(gridSize);
        if (grid[x][y] === '~') { grid[x][y] = 'S'; placed++; }
      }
    }
    placeShips(playerGrid);
    placeShips(computerGrid);

    var playerShipsLeft = numShips;
    var computerShipsLeft = numShips;

    print('');
    print('Welcome to Ahsan\'s Battleships!');

    while (playerShipsLeft > 0 && computerShipsLeft > 0) {
      print('');
      print([['Your Grid:', 't-head']]);
      printGrid(playerGrid, true, true);
      print('');
      print([['Computer\'s Grid:', 't-head']]);
      printGrid(computerGrid, false, true);

      print('');
      print('Your turn!');
      while (true) {
        var m = /^\s*([+-]?\d+)\s+([+-]?\d+)/.exec(yield ask('Enter your guess (row and column, e.g., 2 3): '));
        var x = m ? parseInt(m[1], 10) : -1;
        var y = m ? parseInt(m[2], 10) : -1;
        if (!m || x < 0 || x >= gridSize || y < 0 || y >= gridSize) {
          print([['Invalid input. Please enter two numbers within the grid range.', 't-err']]);
          continue;
        }
        if (computerGrid[x][y] === 'S') {
          computerGrid[x][y] = 'X';
          computerShipsLeft--;
          print([['Hit!', 't-ok']]);
          break;
        }
        if (computerGrid[x][y] === '~') {
          computerGrid[x][y] = 'O';
          print('Miss.');
          break;
        }
        print([['You already guessed that spot. Try again.', 't-warn']]);
      }

      if (computerShipsLeft === 0) {
        print('');
        print([['Congratulations! You sunk all the enemy ships. You win!', 't-ok']]);
        return;
      }

      print('');
      print('Computer\'s turn!');
      while (true) {
        var cx = randInt(gridSize), cy = randInt(gridSize);
        if (playerGrid[cx][cy] === 'S') {
          playerGrid[cx][cy] = 'X';
          playerShipsLeft--;
          print([['The computer hit one of your ships at (' + cx + ', ' + cy + ')!', 't-err']]);
          break;
        }
        if (playerGrid[cx][cy] === '~') {
          playerGrid[cx][cy] = 'O';
          print('The computer missed at (' + cx + ', ' + cy + ').');
          break;
        }
      }

      if (playerShipsLeft === 0) {
        print('');
        print([['Oh no! The computer sunk all your ships. You lose.', 't-err']]);
        return;
      }
    }
  }

  // ---------- Rust version ----------
  // Prompts are printed on their own line and read on the next, and the
  // state is rebuilt each round: the original does this by recursion, here
  // each round just replaces the previous values.
  function* rustGame() {
    // str::parse::<usize>() accepts digits with an optional leading +
    function parseUsize(s) {
      return /^\+?\d+$/.test(s) ? parseInt(s, 10) : null;
    }

    print('Welcome to Battleships!');

    var gridSize, numShips, v;
    while (true) {
      print('Enter the size of the board (1 to 10):');
      v = parseUsize(String(yield ask('', false)).trim());
      if (v !== null && v > 0 && v <= 10) { gridSize = v; break; }
      print([['Invalid input. Try again.', 't-err']]);
    }
    var maxShips = gridSize * gridSize;
    while (true) {
      print('Enter the number of ships (1 to ' + maxShips + '):');
      v = parseUsize(String(yield ask('', false)).trim());
      if (v !== null && v > 0 && v <= maxShips) { numShips = v; break; }
      print([['Invalid input. Try again.', 't-err']]);
    }

    function placeShips() {
      var ships = {};
      var count = 0;
      while (count < numShips) {
        var k = key(randInt(gridSize), randInt(gridSize));
        if (!ships[k]) { ships[k] = true; count++; }
      }
      return ships;
    }
    var playerShips = placeShips();
    var computerShips = placeShips();

    var playerGrid = makeGrid(gridSize);
    Object.keys(playerShips).forEach(function (k) {
      var p = k.split(',');
      playerGrid[+p[0]][+p[1]] = 'S';
    });
    var computerGrid = makeGrid(gridSize);
    var computerGuesses = {};

    function processGuess(grid, ships, x, y, owner, hitCls) {
      if (ships[key(x, y)]) {
        print([[owner + ' ship is hit at (' + x + ', ' + y + ')!', hitCls]]);
        grid[x][y] = 'X';
        delete ships[key(x, y)];
      } else {
        print(owner + ' misses at (' + x + ', ' + y + ').');
        if (grid[x][y] !== 'X') grid[x][y] = 'O';
      }
    }

    while (true) {
      if (!Object.keys(computerShips).length) {
        print('');
        print([['Congratulations! You win!', 't-ok']]);
        return;
      }
      if (!Object.keys(playerShips).length) {
        print('');
        print([['The computer wins! Better luck next time.', 't-err']]);
        return;
      }

      print('');
      print([['Player\'s Grid:', 't-head']]);
      printGrid(playerGrid, true, true);
      print('');
      print([['Computer\'s Grid:', 't-head']]);
      printGrid(computerGrid, false, true);

      print('Your turn! Enter your guess (row and column, e.g., 2 3):');
      var x, y;
      while (true) {
        var parts = String(yield ask('', false)).trim().split(/\s+/);
        if (parts.length === 2) {
          x = parseUsize(parts[0]); y = parseUsize(parts[1]);
          if (x !== null && y !== null && x < gridSize && y < gridSize) break;
        }
        print([['Invalid coordinates. Try again.', 't-err']]);
      }
      processGuess(computerGrid, computerShips, x, y, 'Computer\'s', 't-ok');

      var cx, cy;
      do { cx = randInt(gridSize); cy = randInt(gridSize); } while (computerGuesses[key(cx, cy)]);
      processGuess(playerGrid, playerShips, cx, cy, 'Your', 't-err');
      computerGuesses[key(cx, cy)] = true;
    }
  }

  // ---------- running programs ----------

  var program = null;     // the running game's generator, if any
  var programLang = null; // 'python' | 'c' | 'rust'
  var pending = null;     // what it's currently asking for
  var compiled = {};      // binaries "built" this session, name -> game

  function startProgram(gen, lang) {
    program = gen;
    programLang = lang;
    if (stopBtn) stopBtn.hidden = false;
    step(undefined);
  }

  function step(value) {
    var r;
    try {
      r = program.next(value);
    } catch (err) {
      print([['error: ' + err.message, 't-err']]);
      r = { done: true };
    }
    if (r.done) {
      endProgram();
    } else {
      pending = r.value;
      setPrompt(pending.inline ? pending.prompt : '');
    }
  }

  function endProgram() {
    program = null;
    programLang = null;
    pending = null;
    if (stopBtn) stopBtn.hidden = true;
    setPrompt(SHELL_PROMPT);
  }

  // Ctrl+C / the Stop button
  function interrupt() {
    if (program) {
      print((pending && pending.inline ? pending.prompt : '') + input.value + '^C');
      if (programLang === 'python') {
        print([['Traceback (most recent call last):', 't-err']]);
        print([['KeyboardInterrupt', 't-err']]);
      }
      if (program.return) program.return();
      endProgram();
    } else {
      print(SHELL_PROMPT.concat([[input.value + '^C', 't-cmd']]));
    }
    input.value = '';
  }

  // ---------- the shell ----------

  var GAMES = { python: pythonGame, c: cGame, rust: rustGame };

  function help() {
    print([['Run a version of the game:', 't-head']]);
    print([['  python3 PYTHON_battleships.py', 't-ok'], ['                     Python', 't-dim']]);
    print([['  gcc C_battleships.c -o battleships && ./battleships', 't-ok'], ['  C', 't-dim']]);
    print([['  cargo run', 't-ok'], ['                                        Rust', 't-dim']]);
    print('');
    print([['Other commands:', 't-head']]);
    print([['  ls, cat <file>, clear, history, whoami, pwd, echo, date', 't-ok']]);
    print('');
    print([['While a game is running, press Ctrl+C (or Stop) to quit it.', 't-dim']]);
    print([['Up/Down browse earlier commands; Tab completes file names.', 't-dim']]);
  }

  var README = [
    '# CLI-Battlehips',
    'A simple game of battleships on a command line interface coded on Python, C and Rust'
  ];

  // runs one command; returns false if it failed (so `a && b` stops)
  function runOne(line) {
    var argv = line.trim().split(/\s+/);
    var cmd = argv[0];
    if (!cmd) return true;

    switch (cmd) {
      case 'help':
      case '?':
        help();
        return true;

      case 'ls':
      case 'dir':
        var shown = FILES.slice();
        Object.keys(compiled).forEach(function (b) { if (shown.indexOf(b) === -1) shown.push(b); });
        print(shown.map(function (f, i) {
          return [f + (i < shown.length - 1 ? '  ' : ''), compiled[f] ? 't-ok' : ''];
        }));
        return true;

      case 'cat':
        if (!argv[1]) { print([['cat: missing file operand', 't-err']]); return false; }
        if (/^readme\.md$/i.test(argv[1])) { README.forEach(function (l) { print(l); }); return true; }
        if (FILES.indexOf(argv[1]) !== -1) {
          print([['The full source is on GitHub: ', 't-dim'], [REPO, 't-ok']]);
          return true;
        }
        print([['cat: ' + argv[1] + ': No such file or directory', 't-err']]);
        return false;

      case 'clear':
      case 'cls':
        out.textContent = '';
        return true;

      case 'history':
        history.forEach(function (h, i) { print([[String(i + 1).padStart(4, ' ') + '  ', 't-dim'], h]); });
        return true;

      case 'whoami': print('guest'); return true;
      case 'pwd': print('/home/guest/cli-battleships'); return true;
      case 'date': print(new Date().toString()); return true;
      case 'echo': print(argv.slice(1).join(' ')); return true;

      case 'sudo':
        print([['guest is not in the sudoers file. This incident will be reported.', 't-err']]);
        return false;

      case 'exit':
      case 'logout':
        print([['There\'s nowhere to exit to, this terminal lives on a web page. Try ', 't-dim'], ['help', 't-ok'], ['.', 't-dim']]);
        return true;

      case 'python':
      case 'python3':
      case 'py':
        if (!argv[1]) {
          print([['Run the game with: ', 't-dim'], ['python3 PYTHON_battleships.py', 't-ok']]);
          return true;
        }
        if (/^python_battleships\.pyd?$/i.test(argv[1])) { startProgram(pythonGame(), 'python'); return true; }
        print([[cmd + ': can\'t open file \'' + argv[1] + '\': [Errno 2] No such file or directory', 't-err']]);
        return false;

      case 'gcc':
      case 'cc':
      case 'clang':
        if (argv.indexOf('C_battleships.c') === -1) {
          print([[cmd + ': fatal error: no input files', 't-err']]);
          return false;
        }
        var o = argv.indexOf('-o');
        compiled[o !== -1 && argv[o + 1] ? argv[o + 1] : 'a.out'] = 'c';
        return true;

      case 'rustc':
        if (argv.indexOf('RUST_battleships.rs') === -1) {
          print([['error: no input filename given', 't-err']]);
          return false;
        }
        var ro = argv.indexOf('-o');
        compiled[ro !== -1 && argv[ro + 1] ? argv[ro + 1] : 'RUST_battleships'] = 'rust';
        return true;

      case 'cargo':
        if (argv[1] !== 'run') {
          print([['Try ', 't-dim'], ['cargo run', 't-ok']]);
          return argv[1] === undefined;
        }
        print([['   Compiling', 't-ok'], ' cli-battleships v0.1.0 (/home/guest/cli-battleships)']);
        print([['    Finished', 't-ok'], ' `dev` profile [unoptimized + debuginfo] target(s) in 0.42s']);
        print([['     Running', 't-ok'], ' `target/debug/battleships`']);
        startProgram(rustGame(), 'rust');
        return true;
    }

    // ./something: run a binary built earlier this session
    if (cmd.indexOf('./') === 0) {
      var name = cmd.slice(2);
      if (compiled[name]) { startProgram(GAMES[compiled[name]](), compiled[name]); return true; }
      if (FILES.indexOf(name) !== -1) {
        print([['bash: ' + cmd + ': Permission denied', 't-err']]);
      } else {
        print([['bash: ' + cmd + ': No such file or directory', 't-err']]);
        if (/battleships|a\.out/i.test(name)) {
          print([['(compile it first, e.g. ', 't-dim'], ['gcc C_battleships.c -o battleships', 't-ok'], [')', 't-dim']]);
        }
      }
      return false;
    }

    // shortcut: play python | c | rust
    if (cmd === 'play') {
      var lang = (argv[1] || '').toLowerCase();
      if (lang === 'py') lang = 'python';
      if (lang === 'rs') lang = 'rust';
      if (GAMES[lang]) { startProgram(GAMES[lang](), lang); return true; }
      print([['usage: play python | c | rust', 't-dim']]);
      return false;
    }

    print([['bash: ' + cmd + ': command not found', 't-err']]);
    if (history.length <= 2) print([['Type ', 't-dim'], ['help', 't-ok'], [' to see what you can do.', 't-dim']]);
    return false;
  }

  // supports `a && b`, stopping at the first failure or once a game starts
  function runLine(line) {
    var cmds = line.split('&&');
    for (var i = 0; i < cmds.length; i++) {
      if (!runOne(cmds[i])) return;
      if (program) return;
    }
  }

  // ---------- input handling ----------

  var history = [];
  var historyPos = 0;

  function submit() {
    var value = input.value;
    input.value = '';

    if (program) {
      // echo what was typed after the prompt, like a real terminal
      print(pending.inline ? [pending.prompt, [value, 't-cmd']] : [[value, 't-cmd']]);
      step(value);
      return;
    }

    print(SHELL_PROMPT.concat([[value, 't-cmd']]));
    if (value.trim()) {
      if (history[history.length - 1] !== value) history.push(value);
      historyPos = history.length;
      runLine(value);
    }
    scrollToEnd();
  }

  // completes the last word against commands and file names
  function complete() {
    var value = input.value;
    var m = /(\S*)$/.exec(value);
    var word = m[1];
    if (!word) return;
    var pool = value.indexOf(' ') === -1
      ? ['help', 'ls', 'cat', 'clear', 'history', 'python3', 'gcc', 'rustc', 'cargo', 'play', 'whoami']
      : FILES.concat(['run']);
    var prefix = word.indexOf('./') === 0 ? './' : '';
    var stem = word.slice(prefix.length);
    if (prefix) pool = Object.keys(compiled);
    var hits = pool.filter(function (p) { return p.toLowerCase().indexOf(stem.toLowerCase()) === 0; });
    if (hits.length === 1) {
      input.value = value.slice(0, value.length - word.length) + prefix + hits[0] + ' ';
    } else if (hits.length > 1) {
      print(SHELL_PROMPT.concat([[value, 't-cmd']]));
      print(hits.join('  '));
    }
  }

  function hasSelection() {
    if (input.selectionStart !== input.selectionEnd) return true;
    var sel = window.getSelection && window.getSelection();
    return !!(sel && String(sel).length);
  }

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.ctrlKey && (e.key === 'c' || e.key === 'C') && !hasSelection()) {
      // Ctrl+C with nothing selected interrupts; with a selection it copies
      e.preventDefault();
      interrupt();
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      out.textContent = '';
    } else if (e.key === 'Tab' && !program) {
      e.preventDefault();
      complete();
    } else if (e.key === 'ArrowUp' && !program && history.length) {
      e.preventDefault();
      historyPos = Math.max(0, historyPos - 1);
      input.value = history[historyPos];
    } else if (e.key === 'ArrowDown' && !program && history.length) {
      e.preventDefault();
      historyPos = Math.min(history.length, historyPos + 1);
      input.value = history[historyPos] || '';
    }
  });

  // clicking anywhere in the terminal focuses the input, unless the click
  // was the end of selecting some text to copy
  body.addEventListener('click', function () {
    var sel = window.getSelection && window.getSelection();
    if (sel && String(sel).length) return;
    input.focus({ preventScroll: true });
  });

  if (stopBtn) {
    stopBtn.addEventListener('click', function () {
      interrupt();
      input.focus({ preventScroll: true });
    });
  }

  // the "Run a version" buttons type their command into the terminal
  var typing = null;
  Array.prototype.forEach.call(document.querySelectorAll('[data-cmd]'), function (btn) {
    btn.addEventListener('click', function () {
      var cmd = btn.getAttribute('data-cmd');
      if (typing) clearInterval(typing);
      if (program) interrupt();
      input.value = '';
      input.focus({ preventScroll: true });

      var termTop = body.getBoundingClientRect().top;
      if (termTop < 0 || termTop > window.innerHeight * 0.6) {
        body.closest('.cb-term').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      }

      if (reduced) { input.value = cmd; submit(); return; }
      var i = 0;
      typing = setInterval(function () {
        input.value = cmd.slice(0, ++i);
        if (i >= cmd.length) {
          clearInterval(typing);
          typing = null;
          setTimeout(submit, 180);
        }
      }, 22);
    });
  });

  // ---------- boot ----------
  print([['CLI Battleships', 't-head'], [' - browser demo', 't-dim']]);
  print([['JavaScript ports of the Python, C and Rust versions, following each one\'s own prompts.', 't-dim']]);
  print('');
  print([['Type ', 't-dim'], ['help', 't-ok'], [' to see the commands, or start a game with one of:', 't-dim']]);
  print([['  python3 PYTHON_battleships.py', 't-ok']]);
  print([['  gcc C_battleships.c -o battleships && ./battleships', 't-ok']]);
  print([['  cargo run', 't-ok']]);
  print('');
  setPrompt(SHELL_PROMPT);
})();
