/**
 * Boots the live wallpaper: shows a loading window with an XP block progress
 * bar over a plain blue desktop while the 3D scene loads, then dissolves the
 * blue away in pixel blocks.
 *
 * The scene itself is a separate chunk (src/wallpaper), loaded with a dynamic
 * import so the rest of the page never waits on it. It can be switched off
 * from the widget (remembered in localStorage), which leaves the plain blue
 * desktop and stops drawing. If WebGL 2 is missing or anything fails, the
 * plain desktop stays.
 */
import { SUNRISE, SUNSET, NOON } from '../wallpaper/sun.js';
import { BOTTOM_Z, nextZ } from './zorder';
import { setUiHour } from './ui-theme';

const root = document.documentElement;
const host = document.getElementById('wallpaper');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- the loader

const STEP_MS = 110; // one block at a time, like the real thing
const BLOCK = 12; // XP's progress blocks: 12px wide, 2px apart
const BLOCK_GAP = 2;
// The plain desktop's gradient, top to bottom (matches --desktop-bg in xp.css).
const DESKTOP_TOP = '#4a72a8';
const DESKTOP_BOTTOM = '#2f5388';

/**
 * The loading dialog: an XP window with a block progress bar. It can be
 * minimized to the taskbar and moved, but not maximized or closed.
 */
class Loader {
  win = document.getElementById('loader-window')!;
  task = document.getElementById('loader-task') as HTMLButtonElement;
  bar = this.win.querySelector<HTMLElement>('.xp-progress')!;
  fill = this.win.querySelector<HTMLElement>('.xp-progress-fill')!;
  target = 0; // fraction the real progress allows
  shown = 0; // blocks drawn so far
  last = 0;
  active = true;
  onFull: (() => void) | null = null;
  raf = 0;

  constructor() {
    this.win.hidden = false;
    this.task.hidden = false;
    // Alone on the desktop it opens in front; with a page window already open it opens behind it, inactive.
    if (document.querySelector('.window[data-page]:not([hidden])')) {
      this.win.style.zIndex = String(BOTTOM_Z);
      this.setActive(false);
    } else {
      this.raise();
    }
    this.win.querySelector('.tb-min')!.addEventListener('click', () => this.setMinimized(true));
    this.task.addEventListener('click', () => {
      if (this.win.hidden) this.setMinimized(false);
      else if (this.active) this.setMinimized(true);
      else this.raise();
    });
    // Clicking the window brings it forward; clicking anything else leaves it inactive.
    document.addEventListener('pointerdown', this.onPointerDown, true);
    this.dragByTitle();
    this.raf = requestAnimationFrame(this.tick);
  }

  // How many blocks fit in the bar at its current width (kept while minimized, when it has none).
  blocks = 20;
  get total() {
    const inner = this.bar.clientWidth - 4; // minus the inner border and padding
    if (inner > 0) this.blocks = Math.max(1, Math.floor((inner + BLOCK_GAP) / (BLOCK + BLOCK_GAP)));
    return this.blocks;
  }

  setProgress(f: number) {
    this.target = Math.max(this.target, Math.min(1, f));
  }

  // Fill the rest of the bar (still one block at a time), then call back.
  finish(cb: () => void) {
    this.target = 1;
    this.onFull = cb;
  }

  close() {
    cancelAnimationFrame(this.raf);
    document.removeEventListener('pointerdown', this.onPointerDown, true);
    this.win.hidden = true;
    this.task.hidden = true;
  }

  tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const total = this.total;
    const want = Math.floor(this.target * total + 1e-6);
    if (this.shown > total) this.draw(total); // the bar got narrower
    if (this.shown < want && now - this.last >= (reducedMotion ? 0 : STEP_MS)) {
      this.last = now;
      this.draw(this.shown + 1);
    }
    if (this.shown >= total && this.onFull && now - this.last >= 250) {
      const cb = this.onFull;
      this.onFull = null;
      cb();
    }
  };

  draw(blocks: number) {
    this.shown = blocks;
    this.fill.style.width = blocks ? `${blocks * (BLOCK + BLOCK_GAP) - BLOCK_GAP}px` : '0';
    this.bar.setAttribute('aria-valuenow', String(Math.round((blocks / this.total) * 100)));
  }

  // Bring the loader to the front; the page windows (run by desktop.ts) show as inactive until one is clicked.
  raise() {
    this.win.style.zIndex = String(nextZ());
    this.setActive(true);
    for (const w of document.querySelectorAll('.window[data-page]')) w.classList.add('inactive');
    for (const t of document.querySelectorAll('.task[data-page]')) {
      t.classList.remove('active');
      t.setAttribute('aria-pressed', 'false');
    }
  }

  setActive(on: boolean) {
    this.active = on;
    this.win.classList.toggle('inactive', !on);
    this.task.classList.toggle('active', on);
    this.task.setAttribute('aria-pressed', String(on));
  }

  setMinimized(min: boolean) {
    this.win.hidden = min;
    if (min) this.setActive(false);
    else this.raise();
  }

  onPointerDown = (e: PointerEvent) => {
    const t = e.target as Node;
    if (this.win.contains(t)) this.raise();
    else if (!this.task.contains(t)) this.setActive(false);
  };

  dragByTitle() {
    const handle = this.win.querySelector<HTMLElement>('.title-bar')!;
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target as Element).closest('button')) return;
      e.preventDefault();
      const desk = this.win.offsetParent!.getBoundingClientRect();
      const r = this.win.getBoundingClientRect();
      const start = { x: e.clientX, y: e.clientY, left: r.left - desk.left, top: r.top - desk.top };
      handle.setPointerCapture(e.pointerId);
      document.documentElement.classList.add('window-dragging');
      const move = (ev: PointerEvent) => {
        const left = start.left + ev.clientX - start.x;
        const top = start.top + ev.clientY - start.y;
        this.win.style.left = `${Math.min(Math.max(left, 80 - r.width), desk.width - 80)}px`;
        this.win.style.top = `${Math.min(Math.max(top, 0), desk.height - 30)}px`;
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
}

/**
 * A plain desktop-blue cover over the scene while it loads. When the scene is
 * ready it breaks into pixel blocks that vanish from the centre outward.
 */
class Cover {
  canvas = document.createElement('canvas');
  ctx = this.canvas.getContext('2d')!;

  constructor(parent: HTMLElement) {
    this.canvas.className = 'wallpaper-loader';
    this.canvas.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.canvas);
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.round(this.canvas.clientHeight * dpr);
    const g = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    g.addColorStop(0, DESKTOP_TOP);
    g.addColorStop(1, DESKTOP_BOTTOM);
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  };

  // The whole screen pixelates away at once, but faster towards the middle:
  // each block clears at a random moment, and that moment's latest possible
  // time grows with the block's distance from the centre (measured as a
  // slightly rounded rectangle with the screen's proportions). So the centre
  // is gone early while the edges keep thinning out until the end.
  dissolve(ms = reducedMotion ? 0 : 500): Promise<void> {
    window.removeEventListener('resize', this.resize);
    const { canvas, ctx } = this;
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    const cell = Math.max(4, Math.round(7 * dpr));
    const cols = Math.ceil(canvas.width / cell);
    const rows = Math.ceil(canvas.height / cell);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const CENTRE = 0.3; // share of the run the very centre takes to clear; the corners take all of it
    const ROUND = 6; // superellipse exponent: higher is squarer
    const corner = 2 ** (1 / ROUND);
    const turn = Array.from({ length: cols * rows }, (_, i) => {
      const dx = Math.min(1, Math.abs(((i % cols) + 0.5) * cell - cx) / cx);
      const dy = Math.min(1, Math.abs((Math.floor(i / cols) + 0.5) * cell - cy) / cy);
      const d = (dx ** ROUND + dy ** ROUND) ** (1 / ROUND) / corner;
      return Math.random() * (CENTRE + (1 - CENTRE) * d);
    });
    const order = turn.map((_, i) => i).sort((a, b) => turn[a]! - turn[b]!);
    return new Promise((resolve) => {
      const t0 = performance.now();
      let cleared = 0;
      const step = (now: number) => {
        // Blocks clear by turn, not by count, easing out: quick at first,
        // slowing as the last of the edges thin out.
        const t = ms <= 0 ? 1 : Math.min(1, (now - t0) / ms);
        const k = 1 - (1 - t) ** 2;
        for (; cleared < order.length && turn[order[cleared]!]! <= k; cleared++) {
          const c = order[cleared]!;
          ctx.clearRect((c % cols) * cell, Math.floor(c / cols) * cell, cell, cell);
        }
        if (k < 1) requestAnimationFrame(step);
        else {
          canvas.remove();
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }
}

// ---------------------------------------------------------------- the widget

type WallpaperApi = { setTime: (h: number | null) => void; getTime: () => number };

function phaseName(h: number) {
  if (h < SUNRISE - 1 || h >= SUNSET + 1.5) return 'Night';
  if (h < SUNRISE + 1) return 'Sunrise';
  if (h < SUNSET - 1.5) return Math.abs(h - NOON) < 1.5 ? 'Midday' : 'Day';
  return 'Sunset';
}

function formatHours(h: number) {
  const total = Math.round(((h % 24) + 24) % 24 * 60) % (24 * 60);
  const d = new Date(2000, 0, 1, Math.floor(total / 60), total % 60);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const ENABLED_KEY = 'wallpaper.enabled';

function savedEnabled() {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'false';
  } catch {
    return true;
  }
}

/**
 * The options widget. It shows once the scene is running, or straight away
 * when the wallpaper is switched off (so it can be switched back on). The
 * time-of-day controls wait for the scene, which loads on first switch-on.
 */
class Widget {
  el = document.getElementById('wallpaper-widget')!;
  slider = document.getElementById('wp-time') as HTMLInputElement;
  readout = document.getElementById('wp-readout') as HTMLOutputElement;
  live = document.getElementById('wp-live') as HTMLInputElement;
  timeGroup = document.getElementById('wp-time-group') as HTMLFieldSetElement;
  enabled = document.getElementById('wp-enabled') as HTMLInputElement;
  trayIcon = document.getElementById('tray-wallpaper') as HTMLButtonElement;
  api: WallpaperApi | null = null;
  available = false; // there's something to offer (shown in place or as the tray icon)
  inTray = false; // minimized to the system tray

  constructor(onToggle: (on: boolean) => void) {
    // The UI's day and night themes follow the wallpaper's time of day too.
    this.slider.addEventListener('input', () => {
      this.live.checked = false;
      this.api?.setTime(Number(this.slider.value));
      setUiHour(Number(this.slider.value));
      this.show();
    });
    this.live.addEventListener('change', () => {
      const h = this.live.checked ? null : Number(this.slider.value);
      this.api?.setTime(h);
      setUiHour(h);
      this.show();
    });
    setInterval(() => this.live.checked && this.show(), 15_000);
    this.enabled.addEventListener('change', () => {
      try {
        localStorage.setItem(ENABLED_KEY, String(this.enabled.checked));
      } catch {}
      onToggle(this.enabled.checked);
    });
    this.setupCollapse();
    this.setupTray();
  }

  // A sun in the system tray shows and hides it; the X also minimizes it there. Remembered for next time.
  setupTray() {
    try {
      this.inTray = localStorage.getItem('wallpaper.widgetInTray') === 'true';
    } catch {}
    document.getElementById('wp-close')!.addEventListener('click', (e) => {
      e.stopPropagation(); // not a click on the title bar, which collapses it
      this.setInTray(true);
      this.trayIcon.focus();
    });
    this.trayIcon.addEventListener('click', () => this.setInTray(!this.inTray));
  }

  setInTray(inTray: boolean) {
    this.inTray = inTray;
    try {
      localStorage.setItem('wallpaper.widgetInTray', String(inTray));
    } catch {}
    this.place();
  }

  place() {
    this.el.hidden = !this.available || this.inTray;
    this.trayIcon.hidden = !this.available;
    const label = this.inTray ? 'Show wallpaper options' : 'Hide wallpaper options';
    this.trayIcon.setAttribute('aria-label', label);
    this.trayIcon.title = label;
    this.trayIcon.setAttribute('aria-expanded', String(!this.inTray));
  }

  // It can't be switched on, so there's nothing to offer.
  withdraw() {
    this.available = false;
    this.place();
  }

  // Collapsed by default; opening or closing it is remembered for next time. (The earlier
  // 'wallpaper.widget' key was saved as open on every visit, so it isn't read.)
  setupCollapse() {
    const collapse = document.getElementById('wp-collapse') as HTMLButtonElement;
    const body = document.getElementById('wp-body')!;
    const setOpen = (open: boolean) => {
      body.hidden = !open;
      collapse.setAttribute('aria-expanded', String(open));
      collapse.title = open ? 'Hide options' : 'Show options';
      this.el.classList.toggle('collapsed', !open);
    };
    let open = false;
    try {
      open = localStorage.getItem('wallpaper.widgetOpen') === 'true';
    } catch {}
    setOpen(open);
    // The whole title bar toggles it; a click on the arrow button bubbles up to it.
    collapse.parentElement!.addEventListener('click', () => {
      setOpen(body.hidden);
      try {
        localStorage.setItem('wallpaper.widgetOpen', String(!body.hidden));
      } catch {}
    });
  }

  show() {
    if (!this.api) return;
    const h = this.api.getTime();
    if (this.live.checked) this.slider.value = String(h);
    this.readout.textContent = `${formatHours(h)} · ${phaseName(h)}`;
  }

  // Reflects the switch, the scene, and whether it's mid-load (when the switch waits).
  update(on: boolean, loading: boolean) {
    this.enabled.checked = on;
    this.enabled.disabled = loading;
    this.timeGroup.disabled = !on || !this.api;
    this.show();
    this.available = true;
    this.place();
  }
}

// ---------------------------------------------------------------- boot

let on = savedEnabled();
let loading = false;
let widget: Widget;

function setOn(next: boolean) {
  on = next;
  root.classList.toggle('wallpaper-off', !on);
  // With the wallpaper off, a hand-set time no longer shows, so the UI follows the clock.
  setUiHour(on && !widget.live.checked ? Number(widget.slider.value) : null);
  if (on && !widget.api) void load();
  else widget.update(on, loading);
}

// Loads the scene behind the cover and loading window. The widget appears once it's running.
async function load() {
  if (loading) return;
  loading = true;
  if (widget.available) widget.update(on, true);
  const cover = new Cover(host!);
  const loader = new Loader();
  try {
    // The chunk's download counts as the first stretch of the bar.
    loader.setProgress(0.06);
    const mod = await import('../wallpaper/index.js');
    loader.setProgress(0.2);
    widget.api = await mod.startWallpaper(host!, {
      onProgress: (f: number) => loader.setProgress(0.2 + 0.8 * f),
      // Nothing to draw while it's switched off or a window covers the whole desktop.
      isHidden: () => !on || !!document.querySelector('.window.maximized:not([hidden])'),
    });
    await new Promise<void>((resolve) => loader.finish(resolve));
    loader.close();
    loading = false;
    widget.update(on, false);
    await cover.dissolve();
  } catch (err) {
    console.error('Live wallpaper unavailable:', err);
    loader.close();
    loading = false;
    widget.withdraw();
    await cover.dissolve();
  }
}

// Without WebGL 2 there's no live wallpaper to offer: the plain desktop stays and the widget stays hidden.
if (host && hasWebGL2()) {
  widget = new Widget(setOn);
  setOn(on);
}
