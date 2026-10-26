// the map editor's menus, tool strip and keys (editor.js has the rest of the editor).
//   EDITOR_COMMANDS  everything the editor can do from a menu or key: what it's called, its key
//                    (a KEYS action in config.js), what it does, and when it's greyed out or ticked
//   EDITOR_MENUS     the menu bar's menus (File, Edit, View, Map, Tools, Help), each a list of commands
//   EditorMenuBar    the bar along the top: the menus, then the map's name, size and a dot while it's
//                    unsaved (edithistory.js). Play and Play here are buttons in the middle (Editor.init())
//   EditorMenuList   the open menu, its own element so it can go on top of everything
//   EditorToolStrip  the strip down the left: the tools (edittools.js), the brush size, undo and redo
// a new command is a line in EDITOR_COMMANDS and its name in a menu. its key (if it has one) goes in
// KEYS, and works by itself while the editor's open and nothing's being typed (EditorKeys.update())

// key is a KEYS action this file checks for. devKey is one dev mode already checks (debug.js), so it's
// only shown. shown is words to show instead (for keys with Shift, which KEYS can't tell apart)
const EDITOR_COMMANDS = {
  newMap: { label: 'New map…', run: () => Editor.newMap() },
  openMap: { label: 'Open map…', key: 'editorOpen', run: () => openMapFile() },
  save: { label: 'Save', key: 'editorSave', run: () => Editor.save() },
  saveAs: { label: 'Save as…', shown: 'Ctrl+Shift+S', run: () => Editor.askToExport() },
  recover: { label: 'Recover unsaved changes…', run: () => openRecoverBox() },

  undo: { label: 'Undo', key: 'editorUndo', run: () => Editor.undo(), enabled: () => EditHistory.canUndo(worldMap) },
  redo: { label: 'Redo', key: 'editorRedo', run: () => Editor.redo(), enabled: () => EditHistory.canRedo(worldMap) },
  cut: { label: 'Cut', key: 'editorCut', run: () => EditTools.cut(worldMap), enabled: () => EditTools.selection !== null },
  copy: { label: 'Copy', key: 'editorCopy', run: () => EditTools.copy(worldMap), enabled: () => EditTools.selection !== null },
  paste: { label: 'Paste', key: 'editorPaste', run: () => EditTools.paste(), enabled: () => EditTools.clipboard !== null },
  delete: { label: 'Clear selection', key: 'editorDelete', run: () => EditTools.clearSelection(worldMap), enabled: () => EditTools.selection !== null },
  selectAll: { label: 'Select all', key: 'editorSelectAll', run: () => EditTools.selectAll(worldMap) },
  deselect: { label: 'Let go', shown: 'Esc', run: () => EditTools.escape(), enabled: () => EditTools.selection !== null || EditTools.pasting },
  search: { label: 'Search the palette', key: 'editorSearch', run: () => Editor.search.focus() },
  prevTab: { label: 'Category above', key: 'editorPrevTab', run: () => Editor.stepTab(-1) },
  nextTab: { label: 'Category below', key: 'editorNextTab', run: () => Editor.stepTab(1) },

  grid: { label: 'Grid', devKey: 'grid', run: () => Debug.flip('grid'), ticked: () => Debug.show.grid },
  atmospherePreview: { label: 'Atmosphere', run: () => Debug.flip('atmosphere'), ticked: () => Debug.show.atmosphere },
  enemyPaths: { label: 'Enemy AI routes', devKey: 'enemyPaths', run: () => Debug.flip('paths'), ticked: () => Debug.show.paths },
  minimap: { label: 'Minimap', run: () => Debug.flip('minimap'), ticked: () => Debug.show.minimap },
  zoomIn: { label: 'Zoom in', devKey: 'zoomIn', run: () => gameCamera.zoomTo(gameCamera.targetZoom * 1.25) },
  zoomOut: { label: 'Zoom out', devKey: 'zoomOut', run: () => gameCamera.zoomTo(gameCamera.targetZoom / 1.25) },
  zoomReset: { label: 'Normal zoom', devKey: 'zoomReset', run: () => gameCamera.zoomTo(1) },
  hideUI: { label: 'Hide the editor', key: 'editorHideUI', run: () => Editor.toggleUI() },
  // dev mode's (debug.js), so greyed out without it
  devMenu: { label: 'Dev menu', devKey: 'devMenu', run: () => Debug.toggleMenu(), ticked: () => Debug.menu.visible, enabled: () => Debug.enabled },
  devPanel: { label: 'Dev info panel', run: () => Debug.flip('editorPanel'), ticked: () => Debug.show.editorPanel, enabled: () => Debug.enabled },

  resize: { label: 'Resize…', run: () => Editor.resizeMap() },
  atmosphere: { label: 'Atmosphere…', run: () => AtmosphereEditor.open(worldMap.atmosphere) },
  worldMap: { label: 'World map', run: () => WarpGraph.openWorld(worldMap.name) },
  findUses: { label: 'Find uses of what\'s picked', run: () => FindUses.open(Editor.selected) },
  checkMap: { label: 'Check for problems', run: () => MapCheck.open() },
  checkAll: { label: 'Check every map', run: () => MapCheck.open(true) },
  artReport: { label: 'Art report', run: () => ArtReport.open() },

  // one for each tool (edittools.js)
  ...Object.fromEntries(EDITOR_TOOLS.map(({ name, label, key }) => [`tool-${name}`, {
    label, key, run: () => EditTools.setTool(name), ticked: () => Editor.tool === name,
  }])),
  brushBigger: { label: 'Bigger brush', key: 'brushBigger', run: () => Editor.setBrush(Editor.brush + 1), enabled: () => Editor.brush < EDIT_TOOLS.maxBrush },
  brushSmaller: { label: 'Smaller brush', key: 'brushSmaller', run: () => Editor.setBrush(Editor.brush - 1), enabled: () => Editor.brush > 1 },

  shortcuts: { label: 'Keys and mouse', run: () => openShortcuts() },
  play: { label: 'Play', run: () => Editor.close(player, gameCamera) },
  playHere: { label: 'Play here', key: 'editorPlayHere', run: () => Editor.startPlayHere() },
};

// '-' is a line between groups
const EDITOR_MENUS = [
  ['File', ['newMap', 'openMap', '-', 'save', 'saveAs', '-', 'recover']],
  ['Edit', ['undo', 'redo', '-', 'cut', 'copy', 'paste', 'delete', '-', 'selectAll', 'deselect', '-', 'search', 'prevTab', 'nextTab']],
  ['View', ['grid', 'atmospherePreview', 'enemyPaths', 'minimap', '-', 'zoomIn', 'zoomOut', 'zoomReset', '-', 'hideUI', 'devMenu', 'devPanel']],
  ['Map', ['resize', 'atmosphere', '-', 'worldMap', 'findUses', '-', 'checkMap', 'checkAll', 'artReport']],
  ['Tools', [...EDITOR_TOOLS.map(({ name }) => `tool-${name}`), '-', 'brushBigger', 'brushSmaller']],
  ['Help', ['shortcuts', '-', 'play', 'playHere']],
];

// the words for a command's key, like Ctrl+Z, or '' if it hasn't got one (keyName() in debug.js)
function commandKey(command) {
  if (command.shown) return command.shown;
  const action = command.key ?? command.devKey;
  return action ? keyName(KEYS[action][0]) : '';
}

// sizes in screen px
const EDITOR_MENU = { titlePad: 10, rowHeight: 22, lineHeight: 9, minWidth: 190 };

// the editor's keys, every frame while it's open and nothing's being typed (Editor.update()). Shift
// turns undo into redo and save into save as. Escape closes a menu, stops choosing where to play,
// then works like Let go. commands wait while a mouse button's held, so nothing (like undo) happens
// halfway through a drag
const EditorKeys = {
  update() {
    if (Input.wasPressed('escape')) {
      if (Editor.menuBar.open >= 0) Editor.menuBar.close();
      else if (Editor.choosingStart) Editor.choosingStart = false;
      else EditTools.escape();
    }
    if (Input.buttonsHeld.size > 0) return;
    for (const [name, command] of Object.entries(EDITOR_COMMANDS)) {
      if (!command.key || !Input.wasPressed(command.key)) continue;
      const shifted = Input.wasPressedWithShift(command.key) && { undo: 'redo', save: 'saveAs' }[name];
      const run = EDITOR_COMMANDS[shifted || name];
      if (run.enabled && !run.enabled()) continue;
      // a key works like clicking the command, so an open menu closes
      Editor.menuBar.close();
      run.run();
      // one command a frame, so a key that opens a box doesn't also do something under it
      return;
    }
  },
};

// the menu bar along the top. clicking a menu's name opens it (EditorMenuList), and while one's open
// moving across the names opens theirs. clicking a command runs it, and clicking anywhere else (or
// Escape) closes it
class EditorMenuBar extends UIElement {
  constructor(options) {
    super(options);
    // each menu's { label, names, x, w } along the bar
    setText(12, BOLD, CENTER, CENTER, BUTTON_STYLES.default.font);
    let x = 4;
    this.menus = EDITOR_MENUS.map(([label, names]) => {
      const menu = { label, names, x, w: Math.ceil(textWidth(label)) + EDITOR_MENU.titlePad * 2 };
      x += menu.w;
      return menu;
    });
    // the open menu's number, or -1, and the row the mouse is over in it
    this.open = -1;
    this.under = null;
    // the EditorMenuList that shows the open menu (Editor.init() adds it)
    this.list = null;
  }

  close() {
    this.open = -1;
    this.under = null;
  }

  // the open menu's rows, each { name, command, x, y, w, h } or a line ({ line: true, ... })
  rows() {
    if (this.open < 0) return [];
    const menu = this.menus[this.open];
    setText(12, BOLD, LEFT, CENTER);
    const widest = Math.max(...menu.names.filter((name) => name !== '-').map((name) => {
      const command = EDITOR_COMMANDS[name];
      return textWidth(command.label) + textWidth(commandKey(command)) + 70;
    }));
    const w = Math.max(EDITOR_MENU.minWidth, Math.ceil(widest));
    const x = Math.min(menu.x, GAME_W - w - 4);
    let y = this.y + this.h;
    return menu.names.map((name) => {
      const h = name === '-' ? EDITOR_MENU.lineHeight : EDITOR_MENU.rowHeight;
      const row = name === '-' ? { line: true, x, y, w, h } : { name, command: EDITOR_COMMANDS[name], x, y, w, h };
      y += h;
      return row;
    });
  }

  // the menu name the mouse is on, or -1
  titleUnder() {
    const { x, y } = Input.mouse;
    if (y < this.y || y >= this.y + this.h) return -1;
    return this.menus.findIndex((menu) => x >= menu.x && x < menu.x + menu.w);
  }

  update(hovered) {
    this.hovered = hovered;
    // the open menu's list does the work while one's open
    if (this.open < 0 && hovered && Input.buttonsPressed.has('left') && this.titleUnder() >= 0) this.openMenu(this.titleUnder());
  }

  // while a menu's open, from its EditorMenuList, which covers the whole screen (hovered is whether
  // the mouse is on the game)
  updateOpen(hovered) {
    // the click that opened it isn't also a click in it
    if (this.openedOn === frameCount) return;
    const { x, y } = Input.mouse;
    const title = hovered ? this.titleUnder() : -1;
    const pressed = Input.buttonsPressed.has('left');
    if (title >= 0 && title !== this.open && !pressed) this.open = title;
    const rows = this.rows();
    const over = rows.find((row) => x >= row.x && x < row.x + row.w && y >= row.y && y < row.y + row.h);
    const usable = (row) => row && !row.line && (!row.command.enabled || row.command.enabled());
    this.under = usable(over) ? over : null;
    // used up so the map behind doesn't zoom
    Input.wheel = 0;
    if (!pressed && !Input.buttonsPressed.has('right')) return;
    if (title === this.open) return this.close();
    if (title >= 0) return this.openMenu(title);
    // a line or a greyed out command keeps it open, anywhere else closes it
    if (over && !this.under) return;
    const run = this.under?.command.run;
    this.close();
    run?.();
  }

  // opens a menu, putting its list last so it's drawn and clicked on top of everything
  openMenu(index) {
    this.open = index;
    this.openedOn = frameCount;
    UI.remove(this.list);
    UI.add(this.list);
  }

  draw() {
    const C = EDITOR_COLOURS;
    noStroke();
    fill(C.header);
    rect(this.x, this.y, GAME_W, this.h);
    fill(C.edge);
    rect(this.x, this.y + this.h - 1, GAME_W, 1);
    const middleY = this.y + this.h / 2;
    const { x, y } = Input.mouse;
    setText(12, BOLD, CENTER, CENTER);
    this.menus.forEach((menu, i) => {
      const hot = i === this.open || (this.hovered && this.open < 0 && y < this.y + this.h && x >= menu.x && x < menu.x + menu.w);
      if (hot) {
        fill(i === this.open ? C.bar : C.tabHover);
        rect(menu.x, this.y + 3, menu.w, this.h - 6, 3);
      }
      fill(hot ? 255 : C.text);
      text(menu.label, menu.x + menu.w / 2, middleY);
    });

    // the map's name and size on the right, and a dot while it has changes that aren't saved
    const size = `${worldMap.cols} × ${worldMap.rows}`;
    setText(12, BOLD, RIGHT, CENTER);
    fill(C.dimText);
    text(size, GAME_W - 10, middleY);
    const nameRight = GAME_W - 18 - textWidth(size);
    fill(C.text);
    text(worldMap.name, nameRight, middleY);
    if (EditHistory.isUnsaved(worldMap)) {
      fill(C.picked);
      circle(nameRight - textWidth(worldMap.name) - 9, middleY, 7);
    }
  }

  drawMenu() {
    const C = EDITOR_COLOURS;
    const rows = this.rows();
    const top = rows[0].y;
    const bottom = rows.at(-1).y + rows.at(-1).h;
    const { x, w } = rows[0];
    noStroke();
    fill(0, 0, 0, 90);
    rect(x + 3, top + 3, w, bottom - top + 4, 4);
    fill(C.bar);
    stroke(C.edge);
    strokeWeight(1);
    rect(x, top, w, bottom - top + 4, 0, 0, 4, 4);
    for (const row of rows) {
      noStroke();
      if (row.line) {
        fill(C.edge);
        rect(row.x + 8, row.y + row.h / 2, row.w - 16, 1);
        continue;
      }
      const { command } = row;
      const enabled = !command.enabled || command.enabled();
      if (row === this.under) {
        fill(C.accent);
        rect(row.x + 3, row.y + 1, row.w - 6, row.h - 2, 3);
      }
      const middleY = row.y + row.h / 2;
      // a tick for things that are on
      if (command.ticked?.()) {
        stroke(row === this.under ? 255 : C.accent);
        strokeWeight(2);
        line(row.x + 9, middleY, row.x + 12, middleY + 3);
        line(row.x + 12, middleY + 3, row.x + 17, middleY - 3);
        noStroke();
      }
      fill(!enabled ? 95 : row === this.under ? 255 : C.text);
      setText(12, BOLD, LEFT, CENTER);
      text(command.label, row.x + 24, middleY);
      fill(row === this.under ? 230 : C.dimText);
      setText(11, BOLD, RIGHT, CENTER);
      text(commandKey(command), row.x + row.w - 10, middleY);
    }
  }
}

// the open menu of an EditorMenuBar (its bar). while one's open it covers the whole screen, so the
// click that closes it doesn't reach the map
class EditorMenuList extends UIElement {
  constructor(options) {
    super(options);
    this.bar = options.bar;
  }

  contains() {
    return this.bar.open >= 0;
  }

  update(hovered) {
    this.hovered = hovered;
    if (this.bar.open >= 0) this.bar.updateOpen(hovered);
  }

  draw() {
    if (this.bar.open >= 0) this.bar.drawMenu();
  }
}

// the strip of tools down the left: one button for each tool (edittools.js), the brush size (click
// for bigger, right click for smaller, or the wheel), then undo and redo. resting the mouse on one
// says what it is and its key
class EditorToolStrip extends UIElement {
  constructor(options) {
    super(options);
    // the button the mouse is over, and how long it's been there (for the tip)
    this.under = null;
    this.restFor = 0;
  }

  // each button as { kind, name, x, y, w, h }
  buttons() {
    const size = this.w - 6;
    let y = this.y + 4;
    const buttons = [];
    const add = (kind, name, h = size) => {
      buttons.push({ kind, name, x: this.x + 3, y, w: size, h });
      y += h + 3;
    };
    for (const tool of EDITOR_TOOLS) add('tool', tool.name);
    y += 6;
    add('brush', 'brush', size + 6);
    y += 6;
    add('command', 'undo');
    add('command', 'redo');
    return buttons;
  }

  update(hovered) {
    this.hovered = hovered;
    const { x, y } = Input.mouse;
    const under = hovered ? this.buttons().find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) ?? null : null;
    this.restFor = under && under.name === this.under?.name ? this.restFor + deltaTime / 1000 : 0;
    this.under = under;
    if (hovered) Input.wheel = this.under?.kind === 'brush' ? this.brushWheel() : 0;
    if (!under) return;
    const left = Input.buttonsPressed.has('left');
    const right = Input.buttonsPressed.has('right');
    if (under.kind === 'tool' && left) EditTools.setTool(under.name);
    if (under.kind === 'brush' && (left || right)) Editor.setBrush(Editor.brush + (left ? 1 : -1));
    const command = EDITOR_COMMANDS[under.name];
    if (under.kind === 'command' && left && command.enabled()) command.run();
  }

  // the wheel over the brush changes its size. gives back 0, the wheel used up
  brushWheel() {
    if (Input.wheel !== 0) Editor.setBrush(Editor.brush - Math.sign(Input.wheel));
    return 0;
  }

  draw() {
    const C = EDITOR_COLOURS;
    noStroke();
    fill(C.header);
    rect(this.x, this.y, this.w, this.h);
    fill(C.edge);
    rect(this.x + this.w - 1, this.y, 1, this.h);
    for (const button of this.buttons()) {
      const on = button.kind === 'tool' && Editor.tool === button.name;
      const enabled = button.kind !== 'command' || EDITOR_COMMANDS[button.name].enabled();
      const hot = button === this.under || button.name === this.under?.name;
      noStroke();
      fill(on ? BUTTON_STYLES.editor.onFill : hot && enabled ? C.tabHover : C.header);
      rect(button.x, button.y, button.w, button.h, 3);
      drawToolIcon(button, on || (hot && enabled) ? 255 : enabled ? C.text : 90);
    }
    // on top, since it hangs out over the map and the dock
    const under = this.under;
    if (under && this.restFor > 0.35) UI.drawOnTop(() => this.drawTip(under));
  }

  // the name, key and what it does, in a box to the right of the button
  drawTip(button) {
    const tool = EDITOR_TOOLS.find((t) => t.name === button.name);
    const command = EDITOR_COMMANDS[button.name];
    const title = tool ? tool.label : button.kind === 'brush' ? `Brush: ${Editor.brush} × ${Editor.brush} tiles` : command.label;
    const key = tool ? keyName(KEYS[tool.key][0]) : button.kind === 'brush' ? `${keyName(KEYS.brushSmaller[0])} ${keyName(KEYS.brushBigger[0])}` : commandKey(command);
    const words = tool ? tool.tip : button.kind === 'brush' ? 'How many tiles across Paint and Erase are. Click for bigger, right click for smaller, or the wheel' : '';
    const w = 230;
    const x = this.x + this.w + 6;
    setText(11, BOLD, LEFT, TOP);
    const lines = words ? Math.ceil(textWidth(words) / (w - 16)) + 1 : 0;
    const h = 24 + lines * 14;
    const y = constrain(button.y, this.y, GAME_H - h - 4);
    noStroke();
    fill(0, 0, 0, 235);
    rect(x, y, w, h, 4);
    fill(255);
    setText(12, BOLD, LEFT, CENTER);
    text(title, x + 8, y + 12);
    fill(EDITOR_COLOURS.dimText);
    setText(11, BOLD, RIGHT, CENTER);
    text(key, x + w - 8, y + 12);
    if (words) {
      fill(220);
      setText(11, BOLD, LEFT, TOP);
      text(words, x + 8, y + 22, w - 16, h - 24);
    }
  }
}

// a tool strip button's picture, drawn in colour c
function drawToolIcon(button, c) {
  const cx = button.x + button.w / 2;
  const cy = button.y + button.h / 2;
  const s = button.w * 0.3;
  stroke(c);
  strokeWeight(1.8);
  noFill();
  switch (button.name) {
    case 'paint':
      // a pencil
      line(cx - s, cy + s, cx + s * 0.7, cy - s * 0.7);
      line(cx - s, cy + s, cx - s * 0.6, cy + s * 0.2);
      line(cx - s, cy + s, cx - s * 0.2, cy + s * 0.6);
      break;
    case 'erase':
      // an eraser, tilted
      quad(cx - s, cy + s * 0.2, cx, cy - s * 0.8, cx + s, cy + s * 0.2 - s * 0.2, cx, cy + s);
      line(cx - s * 0.5, cy - s * 0.3, cx + s * 0.5, cy + s * 0.6);
      break;
    case 'fill':
      // a bucket pouring
      quad(cx - s, cy - s * 0.3, cx + s * 0.3, cy - s, cx + s, cy + s * 0.3, cx - s * 0.3, cy + s);
      noStroke();
      fill(c);
      circle(cx + s * 1.05, cy + s * 0.9, s * 0.6);
      break;
    case 'rect':
      rect(cx - s, cy - s * 0.75, s * 2, s * 1.5);
      break;
    case 'select':
      drawingContext.setLineDash([3, 2.5]);
      rect(cx - s, cy - s * 0.75, s * 2, s * 1.5);
      drawingContext.setLineDash([]);
      break;
    case 'pick':
      // an eyedropper
      strokeWeight(2);
      line(cx - s, cy + s, cx + s * 0.4, cy - s * 0.4);
      strokeWeight(4);
      line(cx + s * 0.4, cy - s * 0.4, cx + s * 0.8, cy - s * 0.8);
      break;
    case 'brush':
      // a square the size of the brush (up to the biggest), and its number
      noStroke();
      fill(c);
      setText(13, BOLD, CENTER, CENTER);
      text(Editor.brush, cx, cy + 1);
      noFill();
      stroke(c);
      strokeWeight(1);
      rect(button.x + 4, button.y + 4, button.w - 8, button.h - 8, 2);
      break;
    case 'undo':
    case 'redo': {
      // a curved arrow
      const way = button.name === 'undo' ? -1 : 1;
      arc(cx, cy + s * 0.3, s * 1.8, s * 1.6, way < 0 ? PI + 0.3 : -PI * 0.1, way < 0 ? TWO_PI + 0.1 : PI - 0.3);
      noStroke();
      fill(c);
      const tipX = cx + way * s * 0.9;
      triangle(tipX - way * s * 0.1, cy - s * 0.5, tipX + way * s * 0.45, cy + s * 0.3, tipX - way * s * 0.55, cy + s * 0.4);
      break;
    }
    default:
  }
}

// Help > Keys and mouse: every command with a key, and what the mouse does, in a list window
function openShortcuts() {
  const mouse = [
    ['Left click / drag', 'use the tool'],
    ['Right click', 'settings for what\'s there'],
    ['Alt + click', 'pick what\'s under the mouse'],
    ['Shift + drag', 'rectangle (Paint, Erase)'],
    ['Shift + click a square', 'pin it to the recent row'],
    ['Wheel', 'zoom (scrolls lists)'],
    ['WASD / arrows', 'move around'],
  ];
  const lines = [
    ...mouse.map(([what, does]) => ({ text: does, note: what })),
    ...Object.values(EDITOR_COMMANDS).filter((command) => commandKey(command)).map((command) => ({ text: command.label.replace('…', ''), note: commandKey(command) })),
  ];
  UI.add(new ListWindow({ title: 'Keys and mouse', w: 340, h: 380, lines: () => lines, group: 'editor' }));
}
