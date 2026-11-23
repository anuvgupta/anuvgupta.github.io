/**
 * Boots the live wallpaper: shows an old-style block progress bar on a grey
 * screen while the 3D scene loads, then dissolves it away in pixel blocks.
 *
 * The scene itself is a separate chunk (src/wallpaper), loaded with a dynamic
 * import so the rest of the page never waits on it. If WebGL 2 is missing or
 * anything fails, the page falls back to the static wallpaper.
 */
import { SUNRISE, SUNSET, NOON } from '../wallpaper/sun.js';

const root = document.documentElement;
const host = document.getElementById('wallpaper');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function fallback() {
  root.classList.add('wallpaper-fallback');
}

function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- the loader

const BLOCKS = 16;
const STEP_MS = 150; // one block at a time, slowly
const COLORS = {
  ground: '#808080',
  outline: '#000000',
  block: '#1b2f9e',
  blockTop: '#3550c8',
};

class Loader {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  target = 0; // blocks the real progress allows
  shown = 0; // blocks drawn so far
  last = 0;
  done = false;
  onFull: (() => void) | null = null;
  raf = 0;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'wallpaper-loader';
    this.canvas.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', this.resize);
    this.raf = requestAnimationFrame(this.tick);
  }

  resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.round(this.canvas.clientHeight * dpr);
    this.draw();
  };

  setProgress(f: number) {
    this.target = Math.max(this.target, Math.min(BLOCKS, Math.floor(f * BLOCKS + 1e-6)));
  }

  // Fill the rest of the bar (still one block at a time), then call back.
  finish(cb: () => void) {
    this.target = BLOCKS;
    this.onFull = cb;
  }

  tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    if (this.shown < this.target && now - this.last >= (reducedMotion ? 0 : STEP_MS)) {
      this.shown++;
      this.last = now;
      this.draw();
    }
    if (this.shown >= BLOCKS && this.onFull && now - this.last >= 250) {
      const cb = this.onFull;
      this.onFull = null;
      cb();
    }
  };

  // The bar is drawn on a coarse pixel grid: every "pixel" is `u` device
  // pixels square, so the outline and the blocks' rounded corners step.
  draw() {
    const { ctx, canvas } = this;
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    const blockW = 5;
    const blockH = 8;
    const gap = 2;
    const pad = 2;
    const innerW = BLOCKS * blockW + (BLOCKS - 1) * gap;
    const barW = innerW + pad * 2 + 2; // + outline
    const barH = blockH + pad * 2 + 2;
    const cssU = canvas.clientWidth < barW * 3 + 32 ? 2 : 3;
    const u = Math.max(1, Math.round(cssU * dpr));
    const x0 = Math.round((canvas.width - barW * u) / 2 / u) * u;
    const y0 = Math.round((canvas.height * 0.56 - (barH * u) / 2) / u) * u;
    const px = (x: number, y: number, w: number, h: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(x0 + x * u, y0 + y * u, w * u, h * u);
    };
    // Outline: a 1-pixel black frame with its corners knocked off.
    px(1, 0, barW - 2, 1, COLORS.outline);
    px(1, barH - 1, barW - 2, 1, COLORS.outline);
    px(0, 1, 1, barH - 2, COLORS.outline);
    px(barW - 1, 1, 1, barH - 2, COLORS.outline);
    // Blocks: small rounded rectangles (corners knocked off), clearly apart.
    for (let i = 0; i < this.shown; i++) {
      const bx = 1 + pad + i * (blockW + gap);
      const by = 1 + pad;
      px(bx + 1, by, blockW - 2, 1, COLORS.blockTop);
      px(bx, by + 1, blockW, blockH - 2, COLORS.block);
      px(bx + 1, by + blockH - 1, blockW - 2, 1, COLORS.block);
      px(bx + 1, by + 1, blockW - 2, 1, COLORS.blockTop);
    }
  }

  // Pixelate away: the whole screen breaks into blocks that vanish in a
  // scattered order, revealing what is behind.
  dissolve(ms = reducedMotion ? 0 : 750): Promise<void> {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    const { canvas, ctx } = this;
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    const cell = Math.max(8, Math.round(14 * dpr));
    const cols = Math.ceil(canvas.width / cell);
    const rows = Math.ceil(canvas.height / cell);
    const order = Array.from({ length: cols * rows }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    return new Promise((resolve) => {
      const t0 = performance.now();
      let cleared = 0;
      const step = (now: number) => {
        const k = ms <= 0 ? 1 : Math.min(1, (now - t0) / ms);
        const want = Math.floor(order.length * k);
        for (; cleared < want; cleared++) {
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

function setupWidget(api: WallpaperApi) {
  const widget = document.getElementById('wallpaper-widget');
  if (!widget) return;
  const slider = document.getElementById('wp-time') as HTMLInputElement;
  const readout = document.getElementById('wp-readout') as HTMLOutputElement;
  const live = document.getElementById('wp-live') as HTMLInputElement;
  const collapse = document.getElementById('wp-collapse') as HTMLButtonElement;
  const body = document.getElementById('wp-body')!;

  const show = () => {
    const h = api.getTime();
    if (live.checked) slider.value = String(h);
    readout.textContent = `${formatHours(h)} · ${phaseName(h)}`;
  };
  slider.addEventListener('input', () => {
    live.checked = false;
    api.setTime(Number(slider.value));
    show();
  });
  live.addEventListener('change', () => {
    api.setTime(live.checked ? null : Number(slider.value));
    show();
  });
  setInterval(() => live.checked && show(), 15_000);

  // Collapsed or open, remembered for next time.
  const setOpen = (open: boolean) => {
    body.hidden = !open;
    collapse.setAttribute('aria-expanded', String(open));
    collapse.title = open ? 'Hide options' : 'Show options';
    widget.classList.toggle('collapsed', !open);
    try {
      localStorage.setItem('wallpaper.widget', open ? 'open' : 'closed');
    } catch {}
  };
  let open = true;
  try {
    open = localStorage.getItem('wallpaper.widget') !== 'closed';
  } catch {}
  setOpen(open);
  collapse.addEventListener('click', () => setOpen(body.hidden));

  show();
  widget.hidden = false;
}

// ---------------------------------------------------------------- boot

async function boot() {
  if (!host) return fallback();
  if (!hasWebGL2()) return fallback();
  const loader = new Loader(host);
  try {
    // The chunk's download counts as the first stretch of the bar.
    loader.setProgress(0.06);
    const mod = await import('../wallpaper/index.js');
    loader.setProgress(0.2);
    const api: WallpaperApi = await mod.startWallpaper(host, {
      onProgress: (f: number) => loader.setProgress(0.2 + 0.8 * f),
      isHidden: () => !!document.querySelector('.window.maximized:not([hidden])'),
    });
    await new Promise<void>((resolve) => loader.finish(resolve));
    root.classList.add('wallpaper-live');
    setupWidget(api);
    await loader.dissolve();
  } catch (err) {
    console.error('Live wallpaper unavailable:', err);
    fallback();
    await loader.dissolve();
  }
}

boot();
