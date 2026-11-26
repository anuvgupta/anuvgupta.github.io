/**
 * The profile picture's shimmer (the Start button's logo, the Start menu picture and the About picture).
 *
 * Every 12 seconds light sweeps across the picture, drawn on a small canvas of chunky pixels and scaled up
 * without smoothing: a soft main band with a bright core, a faint second reflection trailing it, brightness
 * that drifts along the band and through the pass, and that depends on the surface underneath (the glossy
 * title bar and the green prompt catch more light than the black screen), plus a few star-shaped glints that
 * flash as the band crosses them. Three passes go left to right, then one right to left. With reduced motion
 * there is no shimmer.
 */

const PERIOD = 12; // seconds between passes
const PASS = 2.1; // seconds a pass takes
const LEVELS = 10; // brightness steps, so the light itself looks a little pixelated
const FPS = 30;

// The picture is a 14×12 pixel-art terminal window: a two-row title bar over a black screen with a green ">_".
const ART_W = 14;
const ART_H = 12;
const PROMPT = new Set(['2,4', '3,5', '4,6', '3,7', '2,8', '6,8', '7,8', '8,8', '9,8']);

/** How much light each part of the picture catches. */
function surface(ix: number, iy: number) {
  if (iy === 0) return 1.2; // the title bar's top edge
  if (iy === 1) return 1;
  if (PROMPT.has(`${ix},${iy}`)) return 1.05;
  return 0.75;
}

// Points that can glint, in art pixels: the title bar's right end, the prompt's tip and the cursor's end.
const GLINTS = [
  { x: 12.5, y: 0.6 },
  { x: 4.5, y: 6.5 },
  { x: 9.5, y: 8.5 },
  { x: 1.5, y: 1 },
];

function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 1D noise in [0, 1]. */
function noise(x: number, seed: number) {
  const i = Math.floor(x);
  const f = x - i;
  const k = f * f * (3 - 2 * f);
  return hash(i + seed * 57) * (1 - k) + hash(i + 1 + seed * 57) * k;
}

const easeInOut = (p: number) => 0.5 - 0.5 * Math.cos(Math.PI * p);

interface Shine {
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  img: ImageData;
  cols: number;
  rows: number;
  /** Screen pixels per shine pixel. */
  px: number;
}

function setup(host: HTMLElement, px: number): Shine | null {
  const w = host.clientWidth;
  const h = host.clientHeight;
  if (!w || !h) return null;
  const cols = Math.ceil(w / px);
  const rows = Math.ceil(h / px);
  const canvas = document.createElement('canvas');
  canvas.className = 'picture-shine';
  canvas.width = cols;
  canvas.height = rows;
  canvas.style.width = `${cols * px}px`;
  canvas.style.height = `${rows * px}px`;
  host.append(canvas);
  const ctx = canvas.getContext('2d')!;
  return { host, canvas, ctx, img: ctx.createImageData(cols, rows), cols, rows, px };
}

/**
 * Draws pass number `n` (every fourth runs right to left) at progress `p` (0–1). Positions are in picture units:
 * x across 0–1, y down 0–1.
 */
function draw(s: Shine, n: number, p: number) {
  const { cols, rows, px, img } = s;
  const w = s.host.clientWidth;
  const h = s.host.clientHeight;
  const d = img.data;
  const rtl = n % 4 === 3;
  const seed = n % 997; // a different look each pass
  // The band's centre runs from well off one side to well off the other, easing in and out.
  const travel = -0.55 + 2.1 * easeInOut(p);
  const centre = rtl ? 1 - travel : travel;
  const back = rtl ? 1 : -1; // the trailing reflection sits behind the band
  const lean = 0.14; // leans like "/": the band is further right at the top
  const sparkle = Math.floor(p * 18); // the grain in the core re-rolls about 18 times a pass

  for (let gy = 0; gy < rows; gy++) {
    const y = ((gy + 0.5) * px) / h;
    // Brightness drifts along the band and through the pass, so it's never one even stripe.
    const along = 0.55 + 0.6 * noise(y * 3.2 + p * 2.5, seed);
    for (let gx = 0; gx < cols; gx++) {
      const x = ((gx + 0.5) * px) / w;
      const u = x - lean * (0.5 - y) - centre; // distance across the band
      const core = Math.exp(-((u / 0.055) ** 2));
      const halo = Math.exp(-((u / 0.17) ** 2));
      const trail = Math.exp(-(((u - back * 0.25) / 0.035) ** 2));
      let a = (core * 0.85 + halo * 0.13) * along + trail * 0.28 * (0.6 + 0.4 * noise(y * 5 + 9, seed));
      const ix = Math.min(ART_W - 1, Math.floor(x * ART_W));
      const iy = Math.min(ART_H - 1, Math.floor(y * ART_H));
      a *= surface(ix, iy);
      // A little glitter in the bright part.
      if (core > 0.5 && hash(gx * 13.1 + gy * 7.7 + sparkle * 3.3 + seed) > 0.95) a += 0.18 * core;
      const i = (gy * cols + gx) * 4;
      const q = Math.round(Math.min(1, a) * LEVELS) / LEVELS;
      // Warm white in the core, cooler at the edges.
      d[i] = 255;
      d[i + 1] = 250 - 6 * (1 - core);
      d[i + 2] = 232 + 23 * (1 - core);
      d[i + 3] = q * 255;
    }
  }

  // Glints: a star flashes at a shiny point as the band's core crosses it. Each pass picks its own.
  for (let g = 0; g < GLINTS.length; g++) {
    if (hash(seed * 7 + g) < 0.45) continue;
    const gl = GLINTS[g];
    const x = gl.x / ART_W;
    const y = gl.y / ART_H;
    const u = x - lean * (0.5 - y) - centre;
    const life = Math.exp(-((u / 0.06) ** 2)); // 0–1 as the core passes
    if (life < 0.08) continue;
    const cx = Math.floor((x * w) / px);
    const cy = Math.floor((y * h) / px);
    const arm = Math.round(life * Math.max(2, cols / 9));
    const plot = (gx: number, gy: number, v: number) => {
      if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return;
      const i = (gy * cols + gx) * 4;
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = Math.max(d[i + 3], Math.round(Math.min(1, v) * LEVELS) / LEVELS * 255);
    };
    plot(cx, cy, life);
    for (let k = 1; k <= arm; k++) {
      const v = life * (1 - k / (arm + 1)) * 0.9;
      plot(cx + k, cy, v);
      plot(cx - k, cy, v);
      plot(cx, cy + k, v);
      plot(cx, cy - k, v);
    }
    if (life > 0.6) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) plot(cx + dx, cy + dy, life * 0.4);
  }

  s.ctx.putImageData(img, 0, 0);
}

function clear(s: Shine) {
  s.ctx.clearRect(0, 0, s.cols, s.rows);
}

const still = matchMedia('(prefers-reduced-motion: reduce)');
// The Start logo's shine pixels match its art pixels (1.5 screen pixels); the framed pictures use 2.
const shines = [...document.querySelectorAll<HTMLElement>('.start-logo, .user-tile')]
  .map((host) => setup(host, host.classList.contains('start-logo') ? 1.5 : 2))
  .filter((s): s is Shine => !!s);
// The About picture isn't laid out until its window opens, so it's set up then.
const pending = [...document.querySelectorAll<HTMLElement>('.user-tile')].filter(
  (host) => !shines.some((s) => s.host === host),
);

let last = 0;
let lit = false;
const frame = (now: number) => {
  requestAnimationFrame(frame);
  if (now - last < 1000 / FPS) return;
  last = now;
  for (let i = pending.length - 1; i >= 0; i--) {
    const s = setup(pending[i], 2);
    if (s) {
      shines.push(s);
      pending.splice(i, 1);
    }
  }
  const t = now / 1000;
  const into = t % PERIOD;
  const on = !still.matches && into < PASS;
  if (!on) {
    if (lit) shines.forEach(clear);
    lit = false;
    return;
  }
  lit = true;
  const n = Math.floor(t / PERIOD);
  for (const s of shines) if (s.host.offsetParent) draw(s, n, into / PASS);
};
requestAnimationFrame(frame);
