/**
 * Desktop behavior: windows (open, focus, drag, minimize, maximize, close),
 * window menus, desktop icons, taskbar, Start menu search and the clock.
 *
 * All content is already in the HTML from the build. This script only moves,
 * shows and hides it.
 */

import { isFront, nextZ } from './zorder';

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
  /** Sized by its content: the script places it but never sets its width or height. */
  fit: boolean;
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
let activeId: string | null = null;
let taskOrder = 0; // keeps taskbar buttons in the order windows were opened

// ---------------------------------------------------------------- helpers

const desktopSize = () => ({ w: desktopEl.clientWidth, h: desktopEl.clientHeight });

const CASCADE = 28; // how far a new window sits from the one already open

// The page window in front (open, not minimized), to place a new one beside. The wallpaper loader and
// widget aren't page windows, so they never count.
function frontWin(except: Win): Win | null {
  let top: Win | null = null;
  for (const w of wins.values()) {
    if (w === except || !w.open || w.minimized) continue;
    if (!top || +w.el.style.zIndex > +top.el.style.zIndex) top = w;
  }
  return top;
}

// A new window opens centred on the desktop, or, with another page window open, down and to the right
// of the front one; up and to the left if that would run off the desktop.
function defaultGeom(win: Win): Geom {
  const { w: dw, h: dh } = desktopSize();
  let width: number;
  let height: number;
  if (win.fit) {
    ({ width, height } = win.el.getBoundingClientRect());
  } else if (dw < 700) {
    width = dw - 12;
    height = Math.max(220, dh - 12);
  } else {
    width = Math.min(dw - 24, Math.max(560, Math.round((dw * 2) / 3)));
    height = Math.min(dh - 24, Math.max(240, Math.round(dh * 0.86)));
  }
  const ref = frontWin(win);
  if (!ref || ref.maximized) {
    const left = clamp(Math.round((dw - width) / 2), 0, dw - width);
    const top = clamp(Math.round((dh - height) / 2), 0, dh - height);
    return { left, top, width, height };
  }
  const r = measureGeom(ref.el);
  const fits = (dir: number) =>
    r.left + dir * CASCADE >= 0 && r.top + dir * CASCADE >= 0 &&
    r.left + dir * CASCADE + width <= dw && r.top + dir * CASCADE + height <= dh;
  const dir = fits(1) ? 1 : -1;
  const left = clamp(Math.round(r.left + dir * CASCADE), 0, dw - width);
  const top = clamp(Math.round(r.top + dir * CASCADE), 0, dh - (win.fit ? height : 240));
  // A tall window shortens to stay on the desktop rather than giving up its offset.
  if (!win.fit) height = Math.min(height, Math.max(240, dh - top - (dw < 700 ? 6 : 12)));
  return { left, top, width, height };
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
  if (win.fit) return;
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
  if (activeId !== id || !isFront(win.el)) win.el.style.zIndex = String(nextZ());
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
    win.el.hidden = false;
    win.geom = defaultGeom(win);
    applyGeom(win);
    // On a portrait (phone-shaped) screen, windows open maximized; ones that can't maximize stay as they are.
    if (innerHeight > innerWidth) setMaximized(win, true);
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
  if (maximized && win.maxBtn.disabled) return;
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

/** The address a page is reached at, from wherever the site was opened. */
const pageUrl = (id: string) => `${location.origin}${location.pathname}#${id}`;

async function copyLink(id: string) {
  const url = pageUrl(id);
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
    document.documentElement.classList.add('window-dragging');

    const move = (ev: PointerEvent) => {
      const { w: dw, h: dh } = desktopSize();
      g.left = clamp(start.left + ev.clientX - start.x, 80 - g.width, dw - 80);
      g.top = clamp(start.top + ev.clientY - start.y, 0, dh - 30);
      applyGeom(win);
    };
    const end = () => {
      document.documentElement.classList.remove('window-dragging');
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
    fit: el.classList.contains('window-fit'),
    geom: null,
  };
  wins.set(id, win);

  // The address bar's folder path selects all on focus, like Explorer's.
  const address = $<HTMLInputElement>('.address-input', el);
  address?.addEventListener('focus', () => address.select());

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
    } else if (activeId === id && isFront(win.el)) {
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

const icons = $$<HTMLAnchorElement>('.desktop-icon', iconsEl);
const selected = () => icons.filter((el) => el.classList.contains('selected'));
let anchorIcon: HTMLElement | null = null; // where a Shift-click range starts

function selectIcons(sel: Iterable<HTMLElement>) {
  const set = new Set(sel);
  for (const el of icons) el.classList.toggle('selected', set.has(el) && !el.hidden);
}

// Delete (or Backspace, a Mac's delete key) removes the selected icons while the desktop has focus. Nothing is
// saved: reloading the page brings them back.
let desktopFocused = false;
document.addEventListener('pointerdown', (e) => {
  const t = e.target as Node;
  desktopFocused = t === desktopEl || iconsEl.contains(t);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  const active = document.activeElement;
  const onDesktop = active && active !== document.body ? iconsEl.contains(active) : desktopFocused;
  const doomed = selected();
  if (!onDesktop || !doomed.length) return;
  e.preventDefault();
  for (const el of doomed) {
    el.hidden = true;
    el.classList.remove('selected');
  }
  anchorIcon = null;
});

/** Opens every selected icon's window, in desktop order, so the last one ends up in front. */
function openSelected() {
  for (const el of selected()) openPage(el.dataset.page!);
}

for (const btn of icons) {
  const id = btn.dataset.page!;
  let pointerType = 'mouse';
  let collapse = 0; // a plain click inside a multi-selection narrows it to this icon, unless it was a double-click
  btn.addEventListener('pointerdown', (e) => {
    pointerType = e.pointerType || 'mouse';
    clearTimeout(collapse);
    if (e.button !== 0) return;
    const was = selected();
    if (e.shiftKey) {
      // Adds every icon from the last one clicked (or the first icon) through this one to the selection.
      const from = icons.indexOf((anchorIcon ?? icons[0]) as HTMLAnchorElement);
      const [a, b] = [from, icons.indexOf(btn)].sort((x, y) => x - y);
      selectIcons([...was, ...icons.slice(a, b + 1)]);
    } else if (e.ctrlKey || e.metaKey) {
      btn.classList.toggle('selected');
      anchorIcon = btn;
    } else if (!was.includes(btn)) {
      selectIcons([btn]);
      anchorIcon = btn;
    }
  });
  // Mouse: double-click opens (every selected icon). Touch and pen: a single tap opens. (The icons are links to
  // #page so they work without the script; with it, the click never follows the link.)
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (pointerType !== 'mouse') return openPage(id);
    if (e.detail === 1 && !e.shiftKey && !e.ctrlKey && !e.metaKey && selected().length > 1) {
      collapse = window.setTimeout(() => {
        selectIcons([btn]);
        anchorIcon = btn;
      }, 500);
    }
  });
  btn.addEventListener('dblclick', () => {
    clearTimeout(collapse);
    if (btn.classList.contains('selected')) openSelected();
    else openPage(id);
  });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      openSelected();
    }
  });
  // Tabbing to an icon selects just it; a click (focus that isn't focus-visible) already handled the selection.
  btn.addEventListener('focus', () => {
    if (btn.matches(':focus-visible') && !btn.classList.contains('selected')) {
      selectIcons([btn]);
      anchorIcon = btn;
    }
  });
}

// Dragging on the empty desktop draws a selection rectangle; it selects the icons it touches (with Shift, Ctrl or
// Cmd held, in addition to what was already selected). A plain click on the empty desktop clears the selection.
desktopEl.addEventListener('pointerdown', (e) => {
  if (e.target !== desktopEl && e.target !== iconsEl) return;
  const additive = e.shiftKey || e.ctrlKey || e.metaKey;
  if (!additive) selectIcons([]);
  if (e.pointerType === 'touch' || e.button !== 0) return;
  e.preventDefault(); // no text selection while dragging
  (document.activeElement as HTMLElement | null)?.blur();
  const before = new Set(selected());
  const box = desktopEl.getBoundingClientRect();
  const x0 = e.clientX;
  const y0 = e.clientY;
  const marquee = document.createElement('div');
  marquee.className = 'marquee';
  marquee.hidden = true;
  iconsEl.after(marquee);
  desktopEl.setPointerCapture(e.pointerId);

  const move = (ev: PointerEvent) => {
    const x1 = clamp(ev.clientX, box.left, box.right);
    const y1 = clamp(ev.clientY, box.top, box.bottom);
    const r = { left: Math.min(x0, x1), top: Math.min(y0, y1), right: Math.max(x0, x1), bottom: Math.max(y0, y1) };
    marquee.hidden = false;
    Object.assign(marquee.style, {
      left: `${r.left - box.left}px`,
      top: `${r.top - box.top}px`,
      width: `${r.right - r.left}px`,
      height: `${r.bottom - r.top}px`,
    });
    // An icon is touched when the rectangle overlaps its picture or its label, not the empty space around them.
    const hit = (el: Element) => {
      const q = el.getBoundingClientRect();
      return q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top;
    };
    selectIcons(
      icons.filter((el) => {
        const inside = hit($('.icon-img', el)!) || hit($('.icon-label', el)!);
        return inside || (additive && before.has(el));
      }),
    );
  };
  const end = () => {
    marquee.remove();
    desktopEl.removeEventListener('pointermove', move);
    desktopEl.removeEventListener('pointerup', end);
    desktopEl.removeEventListener('pointercancel', end);
  };
  desktopEl.addEventListener('pointermove', move);
  desktopEl.addEventListener('pointerup', end);
  desktopEl.addEventListener('pointercancel', end);
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
  focusWin(initial.id);
}
if (wins.has(hashId)) openPage(hashId);
