/**
 * The Projects window's backdrop: a pixel-art night sky. The sky gradient and nebulas are painted once per size,
 * dithered to a few levels like pixel art; only the stars are redrawn, about 12 times a second, while the window
 * is on screen. With reduced motion the sky is drawn once and holds still.
 */

const PX = 3; // screen pixels per art pixel
const FPS = 12;

// Black at the top, through very dark purple, to very dark navy at the bottom.
const SKY: [number, [number, number, number]][] = [
  [0, [2, 1, 6]],
  [0.5, [17, 7, 32]],
  [1, [6, 10, 32]],
];

// Faint nebula clouds: color, how strongly it tints the sky at its densest, and where its noise field sits.
const NEBULAS: { rgb: [number, number, number]; strength: number; offset: number; scale: number }[] = [
  { rgb: [92, 40, 140], strength: 0.42, offset: 0, scale: 0.012 },
  { rgb: [38, 62, 140], strength: 0.36, offset: 71.3, scale: 0.009 },
  { rgb: [128, 44, 110], strength: 0.26, offset: 183.7, scale: 0.016 },
];

const STAR_COLORS = ['#ffffff', '#ffffff', '#ffffff', '#fff1d0', '#d8e6ff', '#e6d8ff'];

// 4×4 ordered-dither thresholds.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** A repeatable pseudo-random number in [0, 1) for integer coordinates. */
function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, seed: number) {
  let sum = 0;
  let amp = 0.5;
  for (let i = 0; i < 4; i++) {
    sum += amp * valueNoise(x, y, seed + i * 17);
    x *= 2.03;
    y *= 2.03;
    amp *= 0.5;
  }
  return sum / 0.9375;
}

function skyAt(t: number): [number, number, number] {
  for (let i = 1; i < SKY.length; i++) {
    const [t1, c1] = SKY[i];
    const [t0, c0] = SKY[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
    }
  }
  return SKY[SKY.length - 1][1];
}

interface Star {
  x: number;
  y: number;
  size: 0 | 1 | 2; // a dot, a small cross, or a cross with long arms
  color: string;
  base: number; // alpha at rest
  twinkle: number; // how far the alpha dips
  speed: number;
  phase: number;
}

function paintSky(w: number, h: number) {
  const sky = document.createElement('canvas');
  sky.width = w;
  sky.height = h;
  const ctx = sky.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dither = BAYER[(y & 3) * 4 + (x & 3)];
      // The gradient leans a little to the right, and is banded into steps with dithering between them.
      let [r, g, b] = skyAt(Math.min(1, Math.max(0, y / h + (x / w - 0.5) * 0.12)));
      for (const n of NEBULAS) {
        const v = fbm(x * n.scale + n.offset, y * n.scale * 1.4 + n.offset, 7);
        const density = Math.min(1, Math.max(0, (v - 0.5) / 0.32));
        const level = Math.floor(density * density * 4 + dither) / 4; // four dithered levels, like a limited palette
        const k = level * n.strength;
        r += (n.rgb[0] - r) * k;
        g += (n.rgb[1] - g) * k;
        b += (n.rgb[2] - b) * k;
      }
      const i = (y * w + x) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return sky;
}

/** Stars come from a fixed hash of each art pixel, so resizing reveals more sky without reshuffling it. */
function placeStars(w: number, h: number): Star[] {
  const stars: Star[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const r = hash(x, y, 1);
      if (r > 1 / 230) continue;
      const kind = hash(x, y, 2);
      const size = kind < 0.8 ? 0 : kind < 0.96 ? 1 : 2;
      stars.push({
        x,
        y,
        size,
        color: STAR_COLORS[Math.floor(hash(x, y, 3) * STAR_COLORS.length)],
        base: size === 0 ? 0.35 + hash(x, y, 4) * 0.55 : 0.85,
        twinkle: hash(x, y, 5) < 0.35 ? 0 : 0.25 + hash(x, y, 6) * 0.45,
        speed: 0.5 + hash(x, y, 7) * 1.6,
        phase: hash(x, y, 8) * Math.PI * 2,
      });
    }
  }
  return stars;
}

function drawStars(ctx: CanvasRenderingContext2D, stars: Star[], time: number) {
  for (const s of stars) {
    const a = s.base * (1 - s.twinkle * (0.5 + 0.5 * Math.sin(time * s.speed + s.phase)));
    ctx.fillStyle = s.color;
    ctx.globalAlpha = a;
    ctx.fillRect(s.x, s.y, 1, 1);
    if (s.size === 0) continue;
    ctx.globalAlpha = a * 0.45;
    ctx.fillRect(s.x - 1, s.y, 1, 1);
    ctx.fillRect(s.x + 1, s.y, 1, 1);
    ctx.fillRect(s.x, s.y - 1, 1, 1);
    ctx.fillRect(s.x, s.y + 1, 1, 1);
    if (s.size === 1) continue;
    ctx.globalAlpha = a * 0.18;
    ctx.fillRect(s.x - 2, s.y, 1, 1);
    ctx.fillRect(s.x + 2, s.y, 1, 1);
    ctx.fillRect(s.x, s.y - 2, 1, 1);
    ctx.fillRect(s.x, s.y + 2, 1, 1);
  }
  ctx.globalAlpha = 1;
}

function start(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  const host = canvas.parentElement;
  if (!ctx || !host) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let sky: HTMLCanvasElement | null = null;
  let stars: Star[] = [];
  let last = 0;

  const draw = (time: number) => {
    if (!sky) return;
    ctx.drawImage(sky, 0, 0);
    drawStars(ctx, stars, still.matches ? 0 : time);
  };

  const resize = () => {
    const w = Math.ceil(host.clientWidth / PX);
    const h = Math.ceil(host.clientHeight / PX);
    if (!w || !h || (w === canvas.width && h === canvas.height && sky)) return;
    canvas.width = w;
    canvas.height = h;
    sky = paintSky(w, h);
    stars = placeStars(w, h);
    draw(performance.now() / 1000);
  };

  new ResizeObserver(resize).observe(host);
  still.addEventListener('change', () => draw(performance.now() / 1000));

  const frame = (now: number) => {
    requestAnimationFrame(frame);
    // Twinkle only while the window is showing (a closed or minimized window has no offsetParent).
    if (still.matches || now - last < 1000 / FPS || !canvas.offsetParent) return;
    last = now;
    draw(now / 1000);
  };
  requestAnimationFrame(frame);
}

for (const canvas of document.querySelectorAll<HTMLCanvasElement>('canvas.starfield')) start(canvas);
