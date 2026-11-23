/**
 * Desktop behavior: windows (open, focus, drag, minimize, maximize, close),
 * window menus, desktop icons, taskbar, Start menu search and the clock.
 *
 * All content is already in the HTML from the build. This script only moves,
 * shows and hides it.
 */

type Geom = { left: number; top: number; width: number; height: number };

type Win = {
  id: string;
  el: HTMLElement;
  body: HTMLElement;
  task: HTMLButtonElement;
  maxBtn: HTMLButtonElement;
  maxItem: HTMLButtonElement | null;
  open: boolean;
  minimized: boolean;
  maximized: boolean;
  geom: Geom | null;
};

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));

const desktopEl = $('#desktop')!;
const iconsEl = $('#desktop-icons')!;
const tasksEl = $('#tasks')!;
const startBtn = $<HTMLButtonElement>('#start-button')!;
const startMenu = $('#start-menu')!;
const startSearch = $<HTMLInputElement>('#start-search')!;
const startList = $('#start-list')!;
const startEmpty = $('.sm-empty', startList)!;
const startQuery = $('#start-query')!;

const wins = new Map<string, Win>();
let zTop = 10;
let activeId: string | null = null;
let openCount = 0; // cascades newly opened windows
let taskOrder = 0; // keeps taskbar buttons in the order windows were opened

// ---------------------------------------------------------------- helpers

const desktopSize = () => ({ w: desktopEl.clientWidth, h: desktopEl.clientHeight });

function defaultGeom(): Geom {
  const { w: dw, h: dh } = desktopSize();
  const step = openCount % 6;
  if (dw < 700) {
    const top = 6 + step * 10;
    return { left: 6, top, width: dw - 12, height: Math.max(220, dh - top - 6) };
  }
  const width = Math.min(dw - 24, Math.max(560, Math.round((dw * 2) / 3)));
  const offset = step * 28;
  const top = clamp(12 + offset, 0, dh - 240);
  const left = clamp(Math.round((dw - width) / 2) + offset, 0, dw - width);
  return { left, top, width, height: Math.max(240, dh - top - 12) };
}

function measureGeom(el: HTMLElement): Geom {
  const r = el.getBoundingClientRect();
  const d = desktopEl.getBoundingClientRect();
  return { left: r.left - d.left, top: r.top - d.top, width: r.width, height: r.height };
}

function applyGeom(win: Win) {
  if (!win.geom) return;
  const s = win.el.style;
  s.left = `${win.geom.left}px`;
  s.top = `${win.geom.top}px`;
  s.width = `${win.geom.width}px`;
  s.height = `${win.geom.height}px`;
}

// Keep windows reachable after the viewport shrinks.
function fitToDesktop(win: Win) {
  if (!win.geom) return;
  const { w: dw, h: dh } = desktopSize();
  const g = win.geom;
  g.width = Math.min(g.width, dw - (dw < 700 ? 12 : 0));
  g.height = Math.min(g.height, dh);
  g.left = clamp(g.left, 80 - g.width, dw - 80);
  g.top = clamp(g.top, 0, dh - 30);
  applyGeom(win);
}

function setHash(id: string | null) {
  const want = id ? `#${id}` : '';
  if (want !== location.hash) history.replaceState(null, '', id ? want : location.pathname + location.search);
}

let balloonTimer: number | undefined;
function showBalloon(text: string) {
  const el = $('#balloon')!;
  el.textContent = text;
  el.hidden = false;
  clearTimeout(balloonTimer);
  balloonTimer = window.setTimeout(() => (el.hidden = true), 2500);
}

// ---------------------------------------------------------------- windows

function focusWin(id: string) {
  const win = wins.get(id);
  if (!win || !win.open || win.minimized) return;
  if (activeId !== id) win.el.style.zIndex = String(++zTop);
  activeId = id;
  for (const w of wins.values()) {
    const on = w.id === id;
    w.el.classList.toggle('inactive', !on);
    w.task.classList.toggle('active', on);
    w.task.setAttribute('aria-pressed', String(on));
  }
  setHash(id);
}

function focusTopmost() {
  activeId = null;
  let top: Win | null = null;
  for (const w of wins.values()) {
    if (w.open && !w.minimized && (!top || +w.el.style.zIndex > +top.el.style.zIndex)) top = w;
  }
  if (top) return focusWin(top.id);
  for (const w of wins.values()) {
    w.el.classList.add('inactive');
    w.task.classList.remove('active');
    w.task.setAttribute('aria-pressed', 'false');
  }
  setHash(null);
}

function openPage(id: string) {
  const win = wins.get(id);
  if (!win) return;
  closeStartMenu();
  if (!win.open) {
    win.open = true;
    win.geom = defaultGeom();
    openCount++;
    applyGeom(win);
    win.el.hidden = false;
    win.task.hidden = false;
    win.task.style.order = String(++taskOrder);
    win.body.scrollTop = 0;
  } else if (win.minimized) {
    setMinimized(win, false);
  }
  focusWin(id);
}

function setMinimized(win: Win, minimized: boolean) {
  win.minimized = minimized;
  win.el.hidden = minimized;
  if (minimized) {
    closeMenus();
    if (activeId === win.id) focusTopmost();
  }
}

function setMaximized(win: Win, maximized: boolean) {
  win.maximized = maximized;
  win.el.classList.toggle('maximized', maximized);
  const label = maximized ? 'Restore' : 'Maximize';
  win.maxBtn.setAttribute('aria-label', label);
  win.maxBtn.title = label;
  if (win.maxItem) win.maxItem.textContent = label;
}

function closeWin(win: Win) {
  closeMenus();
  win.open = false;
  win.minimized = false;
  setMaximized(win, false);
  win.el.hidden = true;
  win.task.hidden = true;
  if (activeId === win.id) focusTopmost();
}

function selectAll(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

async function copyLink(id: string) {
  const url = `${location.origin}${location.pathname}#${id}`;
  try {
    await navigator.clipboard.writeText(url);
    showBalloon('Link copied');
  } catch {
    showBalloon(url);
  }
}

function runAction(win: Win, action: string) {
  closeMenus();
  switch (action) {
    case 'minimize':
      return setMinimized(win, true);
    case 'maximize':
      return setMaximized(win, !win.maximized);
    case 'close':
      return closeWin(win);
    case 'select-all':
      return selectAll(win.body);
    case 'copy-link':
      return copyLink(win.id);
  }
}

function makeDraggable(win: Win, handle: HTMLElement) {
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || (e.target as Element).closest('button') || win.maximized) return;
    e.preventDefault();
    win.geom ??= measureGeom(win.el);
    const g = win.geom;
    const start = { x: e.clientX, y: e.clientY, left: g.left, top: g.top };
    handle.setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const { w: dw, h: dh } = desktopSize();
      g.left = clamp(start.left + ev.clientX - start.x, 80 - g.width, dw - 80);
      g.top = clamp(start.top + ev.clientY - start.y, 0, dh - 30);
      applyGeom(win);
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  });
}

for (const el of $$('.window[data-page]', desktopEl)) {
  const id = el.dataset.page!;
  const win: Win = {
    id,
    el,
    body: $('.window-body', el)!,
    task: $<HTMLButtonElement>(`.task[data-page="${id}"]`, tasksEl)!,
    maxBtn: $<HTMLButtonElement>('.tb-max', el)!,
    maxItem: $<HTMLButtonElement>('.max-item', el),
    open: !el.hidden,
    minimized: false,
    maximized: false,
    geom: null,
  };
  wins.set(id, win);

  el.addEventListener('pointerdown', () => focusWin(id), true);
  el.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLElement>('[data-action]');
    if (btn) runAction(win, btn.dataset.action!);
  });

  const titleBar = $('.title-bar', el)!;
  makeDraggable(win, titleBar);
  titleBar.addEventListener('dblclick', (e) => {
    if (!(e.target as Element).closest('button')) setMaximized(win, !win.maximized);
  });

  win.task.addEventListener('click', () => {
    if (win.minimized) {
      setMinimized(win, false);
      focusWin(id);
    } else if (activeId === id) {
      setMinimized(win, true);
    } else {
      focusWin(id);
    }
  });
}

// ---------------------------------------------------------------- window menus

let openMenu: HTMLElement | null = null;

function closeMenus() {
  if (!openMenu) return;
  openMenu.classList.remove('open');
  $('.menu-btn', openMenu)!.setAttribute('aria-expanded', 'false');
  openMenu = null;
}

function showMenu(menu: HTMLElement) {
  if (openMenu === menu) return;
  closeMenus();
  menu.classList.add('open');
  $('.menu-btn', menu)!.setAttribute('aria-expanded', 'true');
  openMenu = menu;
}

for (const menu of $$('.menu', desktopEl)) {
  const btn = $('.menu-btn', menu)!;
  btn.addEventListener('click', () => (openMenu === menu ? closeMenus() : showMenu(menu)));
  // Like XP: once a menu is open, hovering a sibling menu switches to it.
  btn.addEventListener('pointerenter', () => {
    if (openMenu && openMenu !== menu && openMenu.parentElement === menu.parentElement) showMenu(menu);
  });
}

// ---------------------------------------------------------------- desktop icons

const icons = $$<HTMLButtonElement>('.desktop-icon', iconsEl);

function selectIcon(btn: HTMLElement | null) {
  for (const el of icons) el.classList.toggle('selected', el === btn);
}

for (const btn of icons) {
  const id = btn.dataset.page!;
  let pointerType = 'mouse';
  btn.addEventListener('pointerdown', (e) => {
    pointerType = e.pointerType || 'mouse';
    selectIcon(btn);
  });
  // Mouse: double-click opens. Touch and pen: a single tap opens.
  btn.addEventListener('click', () => {
    if (pointerType !== 'mouse') openPage(id);
  });
  btn.addEventListener('dblclick', () => openPage(id));
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      openPage(id);
    }
  });
  btn.addEventListener('focus', () => selectIcon(btn));
}

desktopEl.addEventListener('pointerdown', (e) => {
  if (e.target === desktopEl || e.target === iconsEl) selectIcon(null);
});

// ---------------------------------------------------------------- Start menu

const startItems = $$('li[data-search]', startList);
const visibleStartButtons = () =>
  startItems.filter((li) => !li.hidden).map((li) => $<HTMLButtonElement>('.sm-item', li)!);

function filterStart(query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  let shown = 0;
  for (const li of startItems) {
    const hay = li.dataset.search ?? '';
    li.hidden = !terms.every((t) => hay.includes(t));
    if (!li.hidden) shown++;
  }
  startQuery.textContent = query.trim();
  startEmpty.hidden = shown > 0;
}

function openStartMenu() {
  closeMenus();
  startSearch.value = '';
  filterStart('');
  startMenu.hidden = false;
  startBtn.classList.add('pressed');
  startBtn.setAttribute('aria-expanded', 'true');
  // Skip auto-focus on touch so the on-screen keyboard doesn't pop up.
  if (matchMedia('(pointer: fine)').matches) startSearch.focus();
}

function closeStartMenu() {
  if (startMenu.hidden) return;
  startMenu.hidden = true;
  startBtn.classList.remove('pressed');
  startBtn.setAttribute('aria-expanded', 'false');
}

startBtn.addEventListener('click', () => (startMenu.hidden ? openStartMenu() : closeStartMenu()));
startSearch.addEventListener('input', () => filterStart(startSearch.value));
startSearch.addEventListener('keydown', (e) => {
  const first = visibleStartButtons()[0];
  if (e.key === 'Enter' && first) {
    e.preventDefault();
    first.click();
  } else if (e.key === 'ArrowDown' && first) {
    e.preventDefault();
    first.focus();
  }
});
startList.addEventListener('click', (e) => {
  const item = (e.target as Element).closest<HTMLElement>('.sm-item');
  if (item) openPage(item.dataset.page!);
});
startList.addEventListener('keydown', (e) => {
  const items = visibleStartButtons();
  const i = items.indexOf(document.activeElement as HTMLButtonElement);
  if (e.key === 'ArrowDown' && i < items.length - 1) {
    e.preventDefault();
    items[i + 1]!.focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    (i > 0 ? items[i - 1]! : startSearch).focus();
  }
});

// ---------------------------------------------------------------- global

document.addEventListener('pointerdown', (e) => {
  const target = e.target as Node;
  if (openMenu && !openMenu.contains(target)) closeMenus();
  if (!startMenu.hidden && !startMenu.contains(target) && !startBtn.contains(target)) closeStartMenu();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (openMenu) closeMenus();
  else if (!startMenu.hidden) {
    closeStartMenu();
    startBtn.focus();
  }
});

window.addEventListener('resize', () => {
  for (const w of wins.values()) fitToDesktop(w);
});

window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (wins.has(id)) openPage(id);
});

// Taskbar clock
const clockEl = $<HTMLTimeElement>('#clock')!;
function tick() {
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  clockEl.dateTime = now.toISOString();
  clockEl.title = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
tick();
setInterval(tick, 10_000);

// ---------------------------------------------------------------- boot

// The build renders the openOnLoad window already open. A #page link opens that page instead.
const hashId = location.hash.slice(1);
const initial = [...wins.values()].find((w) => w.open);
if (initial && wins.has(hashId) && hashId !== initial.id) {
  closeWin(initial);
}
if (initial?.open) {
  initial.geom = measureGeom(initial.el);
  applyGeom(initial);
  openCount++;
  focusWin(initial.id);
}
if (wins.has(hashId)) openPage(hashId);
