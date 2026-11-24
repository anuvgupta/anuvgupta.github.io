// The live wallpaper: rolling grassy hills under a sky that follows the time
// of day. Loaded on its own (dynamic import) after the page is up; if it fails
// or WebGL is missing, the page keeps its static wallpaper.
//
// Built from murk3d (github.com/anuvgupta/murk3d): its grass, ground shading,
// wind, sky and painterly clouds, sun glare (the atmosphere pass and bloom),
// dust and motes, and adaptive quality are in ./murk, ported from the game;
// this file stands in for the game's Game.js, wiring them to a fixed view.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Terrain, VIEW } from './terrain.js';
import { AtmospherePass } from './murk/AtmospherePass.js';
import { Environment } from './murk/Environment.js';
import { Wind } from './murk/Wind.js';
import { Grass } from './murk/Grass.js';
import { Motes } from './murk/Motes.js';
import { Dust } from './murk/Dust.js';
import { createNoiseTexture } from './murk/noiseTexture.js';
import { createTerrainMaterial } from './murk/TerrainMaterial.js';
import { createCarpet } from './carpet.js';
import { settings, QUALITY, DEFAULT_QUALITY, PRESET_ORDER, rememberQuality, ADAPT_LADDER, loadAdapt, rememberAdapt } from './murk/settings.js';


// Loading stages: name, weight (share of the load time) — as murk3d's Game.
const STAGES = [
  ['environment', 2],
  ['terrain', 4],
  ['grass', 2],
  ['air', 1],
  ['compile', 6],
  ['frame', 3],
];
const STAGE_TOTAL = STAGES.reduce((a, s) => a + s[1], 0);

// Give the browser a turn: paint the progress bar and handle input. Falls
// back to a timer so loading continues in a background tab (no frames there).
function nextTask() {
  return new Promise((resolve) => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 50);
  });
}

// Frame rate cap: a wallpaper doesn't need every display refresh. The
// adaptive stepper's thresholds are shares of it.
const FPS_CAP = 30;

const hoursNow = () => {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
};
// Whole days since the epoch, local time: each real night keeps its own clouds.
const dayNumber = () => {
  const d = new Date();
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
};

class Wallpaper {
  constructor(container) {
    this.container = container;
    // No canvas MSAA: the scene is drawn into the composer's own multisampled
    // target and only a full-screen quad reaches the canvas. Low power keeps
    // laptops with two GPUs on the integrated one.
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
    this.fullRatio = Math.min(window.devicePixelRatio, settings.pixelRatio);
    this.baseRatio = this.fullRatio;
    renderer.setPixelRatio(this.baseRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.55;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    // Adaptive quality: after a few slow seconds, step the cost down (and remember).
    this.adapt = { level: 0, slow: 0, fast: 0, settleUntil: 4, trial: null, backoff: 60, nextTry: 0 };
    this.perf = { frames: 0, time: 0, fps: 0 };

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(VIEW.fov, 1, 0.1, 20000);
    this.elapsed = 0;
    this.manualHours = null; // null: follow the real clock
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.isHidden = () => false;
    this._bufferSize = new THREE.Vector2();
    this._onResize = () => this.onResize();
    window.addEventListener('resize', this._onResize);
  }

  async init(onProgress = () => {}) {
    const scene = this.scene;
    let done = 0;
    onProgress(0);
    const mark = async (name) => {
      const i = STAGES.findIndex((st) => st[0] === name);
      done += i >= 0 ? STAGES[i][1] : 0;
      onProgress(Math.min(1, done / STAGE_TOTAL));
      await nextTask();
    };

    this.environment = new Environment(scene, this.renderer);
    this.environment.dayCount = dayNumber();
    this.environment.setTime(hoursNow());
    await mark('environment');

    this.noiseTexture = createNoiseTexture();
    this.terrain = new Terrain();
    this.groundMaterial = createTerrainMaterial({ noise: this.noiseTexture, heightMap: this.terrain.heightTexture });
    const ground = new THREE.Mesh(this.terrain.buildGeometry(), this.groundMaterial);
    ground.name = 'terrain';
    ground.matrixAutoUpdate = false;
    scene.add(ground);
    this.placeCamera();
    this.wind = new Wind();
    this.wind.buildMap(this.terrain);
    await mark('terrain');

    this.sunInfo = { direction: this.environment.lightDir, color: new THREE.Color() };
    this.grass = new Grass({ terrain: this.terrain, noise: this.noiseTexture, wind: this.wind, sun: this.sunInfo, settings });
    scene.add(this.grass.group);
    scene.add(createCarpet({ geometry: ground.geometry, terrain: this.terrain, noise: this.noiseTexture, wind: this.wind, sun: this.sunInfo }));
    await mark('grass');

    this.motes = new Motes({ wind: this.wind, sun: this.sunInfo });
    scene.add(this.motes.points);
    this.dust = new Dust({ wind: this.wind, sun: this.sunInfo });
    scene.add(this.dust.points);
    this.setupPostProcessing();
    this.onResize();
    // Start where the last visit's frame rate settled.
    const saved = loadAdapt();
    if (saved && saved.preset === QUALITY && saved.level > 0) this.applyAdaptLevel(Math.min(saved.level, ADAPT_LADDER.length - 1));
    await mark('air');

    this.updateWorld(0);
    if (this.renderer.compileAsync) await this.renderer.compileAsync(scene, this.camera);
    await mark('compile');

    // The first frames link the post-processing shaders and upload the rest.
    this.composer.render();
    await nextTask();
    this.composer.render();
    await mark('frame');
  }

  placeCamera() {
    const y = this.terrain.heightAt(VIEW.x, VIEW.z) + VIEW.eye;
    this.camera.position.set(VIEW.x, y, VIEW.z);
    this.camera.lookAt(VIEW.x - 100, y + Math.tan(VIEW.pitch) * 100, VIEW.z);
    this.camera.updateMatrixWorld();
  }

  setupPostProcessing() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const size = new THREE.Vector2(w, h);
    const dpr = this.renderer.getPixelRatio();
    // The atmosphere pass reads scene depth, so the composer's buffers carry one.
    const target = new THREE.WebGLRenderTarget(size.x * dpr, size.y * dpr, {
      type: THREE.HalfFloatType,
      // 4x MSAA: grass blades are thinner than a pixel at 1x resolution and
      // stair-stepped into grain; tile-based GPUs resolve this cheaply, far
      // cheaper than rendering at a higher resolution.
      samples: 4,
      depthTexture: new THREE.DepthTexture(size.x * dpr, size.y * dpr, THREE.UnsignedIntType),
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.atmosphere = new AtmospherePass(this.camera);
    this.atmosphere.setSize(size.x * dpr, size.y * dpr);
    this.composer.addPass(this.atmosphere);
    if (settings.bloom) {
      // High threshold: only the sun and bright cloud edges bloom.
      this.composer.addPass(new UnrealBloomPass(size, 0.25, 0.6, 4.0));
    }
    this.composer.addPass(new OutputPass());
  }

  // Everything that animates. (murk3d's Game.updateWorld, for this scene.)
  updateWorld(dt) {
    const env = this.environment;
    env.setTime(this.manualHours ?? hoursNow());
    env.update(dt, this.camera.position, this.wind);
    this.renderer.toneMappingExposure = env.exposure;
    this.groundMaterial.userData.lush.value = 1 - env.nightFactor;
    this.groundMaterial.userData.haze.value.copy(env.atmosphere.fogColor);
    if (this.atmosphere) this.atmosphere.update(env.atmosphere, this.wind, this.noiseTexture, this.elapsed);
    this.sunInfo.color.copy(env.sun.color).multiplyScalar(env.sun.intensity);
    this.wind.update(dt);
    this.grass.update(this.camera);
    this.renderer.getDrawingBufferSize(this._bufferSize);
    this.motes.setViewport(this._bufferSize.y, this.camera.fov);
    this.motes.update(dt, this.camera.position, this.terrain, env.nightFactor, env.lightLevel);
    this.dust.setViewport(this._bufferSize.y, this.camera.fov);
    this.dust.update(dt, this.camera.position, env.lightLevel);
  }

  start() {
    let last = performance.now();
    let sinceStill = Infinity;
    const frame = (now) => {
      this.raf = requestAnimationFrame(frame);
      // (The slack lets a 60 Hz display land on every other refresh.)
      if (now - last < 1000 / FPS_CAP - 4) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // Nothing to draw while a window covers the whole desktop.
      if (this.isHidden()) return;
      if (this.reducedMotion.matches) {
        // Reduced motion: the scene holds still (no wind, drift or twinkle),
        // redrawn now and then so the sky still follows the hour.
        sinceStill += dt;
        if (sinceStill < 2 && !this.dirty) return;
        sinceStill = 0;
        this.dirty = false;
        this.updateWorld(0);
        this.composer.render();
        return;
      }
      this.elapsed += dt;
      this.updateWorld(dt);
      this.composer.render();
      this.updatePerf(dt);
    };
    this.raf = requestAnimationFrame(frame);
  }

  setTime(hours) {
    this.manualHours = hours;
    this.dirty = true;
  }

  // Adaptive quality: a ladder of live settings, stepped down while the
  // frame rate stays low and back up when there is headroom. The level is
  // remembered (with the preset it applies to), so the next visit starts
  // where this one settled instead of stuttering through the first seconds.
  // With the frame rate capped, "headroom" means holding the cap:
  //   down  ~3 s under 80% of FPS_CAP
  //   up    ~12 s at the cap; kept only if it holds 90% for the next 6 s,
  //         otherwise it reverts and waits longer before trying again
  // Past the bottom rung the next visit starts on a lighter preset; at the
  // top rung on a lighter preset with room to spare, on a heavier one, but
  // never above DEFAULT_QUALITY (heavier presets only by ?quality=).
  // (murk3d's Game.applyAdaptLevel / adaptQuality, without the game's toasts.)
  applyAdaptLevel(level) {
    const L = ADAPT_LADDER[level];
    this.adapt.level = level;
    this.baseRatio = Math.max(0.6, this.fullRatio * L.res);
    this.applyResolution();
    if (this.composer) for (const pass of this.composer.passes) if (pass.strength !== undefined) pass.enabled = settings.bloom && L.bloom;
    rememberAdapt(QUALITY, level);
  }

  adaptQuality(fps) {
    const a = this.adapt;
    if (this.elapsed < a.settleUntil) {
      // Just stepped up: hold it only if it stays smooth.
      if (a.trial !== null && fps < FPS_CAP * 0.9) {
        this.applyAdaptLevel(a.trial);
        a.trial = null;
        a.settleUntil = this.elapsed + 4;
        a.nextTry = this.elapsed + a.backoff;
        a.backoff = Math.min(a.backoff * 2, 480);
      }
      return;
    }
    a.trial = null;
    if (fps < FPS_CAP * 0.8) {
      a.fast = 0;
      if (++a.slow < 6) return; // ~3 s of slow frames
      a.slow = 0;
      a.settleUntil = this.elapsed + 4;
      if (a.level < ADAPT_LADDER.length - 1) {
        this.applyAdaptLevel(a.level + 1);
      } else {
        const i = PRESET_ORDER.indexOf(QUALITY);
        if (i >= 0 && i < PRESET_ORDER.length - 1 && !a.presetNoted) {
          a.presetNoted = true;
          rememberQuality(PRESET_ORDER[i + 1]);
          rememberAdapt(PRESET_ORDER[i + 1], 0);
        }
      }
      return;
    }
    a.slow = Math.max(0, a.slow - 1);
    if (fps < FPS_CAP * 0.97 || this.elapsed < a.nextTry) {
      a.fast = 0;
      return;
    }
    if (a.level > 0) {
      if (++a.fast < 24) return; // ~12 s of headroom
      a.fast = 0;
      a.trial = a.level;
      a.settleUntil = this.elapsed + 6;
      this.applyAdaptLevel(a.level - 1);
      return;
    }
    // Top rung of a lighter preset and still plenty of room.
    const i = PRESET_ORDER.indexOf(QUALITY);
    if (i > PRESET_ORDER.indexOf(DEFAULT_QUALITY) && !a.presetNoted && ++a.fast >= 60) {
      a.presetNoted = true;
      rememberQuality(PRESET_ORDER[i - 1]);
      rememberAdapt(PRESET_ORDER[i - 1], 1);
    }
  }

  updatePerf(dt) {
    const p = this.perf;
    p.frames++;
    p.time += dt;
    if (p.time < 0.5) return;
    p.fps = p.frames / p.time;
    p.frames = 0;
    p.time = 0;
    this.adaptQuality(p.fps);
  }

  applyResolution() {
    this.renderer.setPixelRatio(this.baseRatio);
    if (this.composer) this.composer.setPixelRatio(this.baseRatio);
    this.onResize();
  }

  onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
      const dpr = this.renderer.getPixelRatio();
      this.composer.renderTarget1.depthTexture.image.width = w * dpr;
      this.composer.renderTarget1.depthTexture.image.height = h * dpr;
      this.atmosphere.setSize(w * dpr, h * dpr);
    }
    this.dirty = true;
  }
}

// Builds the world into `container`, reporting progress (0..1) as it goes, and
// starts it running. Resolves with controls once the first frame is drawn.
export async function startWallpaper(container, { onProgress, isHidden } = {}) {
  const wp = new Wallpaper(container);
  if (isHidden) wp.isHidden = isHidden;
  await wp.init(onProgress);
  wp.start();
  return {
    // Hours 0..24, or null to follow the real clock.
    setTime: (h) => wp.setTime(h),
    getTime: () => wp.manualHours ?? hoursNow(),
  };
}
