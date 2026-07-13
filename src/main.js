import p5 from 'p5';
import { setupCamera, cameraState } from './camera.js';
import { setupAudio, audioState } from './audio.js';
import { initRecorder } from './recorder.js';
import { setupUI, uiState, setStatus } from './ui.js';
import { drawPoster } from './poster.js';

import * as flowMode from './modes/flow.js';
import * as faceMode from './modes/faceMesh.js';
import * as handMode from './modes/handParticles.js';

const MODES = {
  flow: flowMode,
  face: faceMode,
  hand: handMode,
};

const W = 1080;
const H = 1350;

const sketch = (p) => {
  let currentKey = null;
  let current = null;
  const ctx = { W, H, camera: cameraState, audio: audioState, ui: uiState };

  p.setup = () => {
    const c = p.createCanvas(W, H);
    c.parent('canvas-wrap');
    p.pixelDensity(1);
    p.frameRate(30);
    p.textFont('JetBrains Mono');
    // Pre-init ALL modes at boot so switching is instant — no allocation of
    // 20k+ particles per switch (which stalled Safari for ~200ms each time).
    // Each mode keeps its state in its own ctx namespace so they coexist.
    for (const key of Object.keys(MODES)) {
      if (MODES[key].init) MODES[key].init(p, ctx);
    }
    currentKey = uiState.currentMode;
    current = MODES[currentKey];
  };

  function switchTo(key) {
    currentKey = key;
    current = MODES[key];
  }

  let fpsSmoothed = 30;
  let lastTs = performance.now();

  p.draw = () => {
    if (uiState.currentMode !== currentKey) switchTo(uiState.currentMode);
    const now = performance.now();
    const dt = now - lastTs;
    lastTs = now;
    fpsSmoothed = fpsSmoothed * 0.9 + (1000 / Math.max(1, dt)) * 0.1;

    current.draw(p, ctx);
    drawPoster(p, ctx);

    if (p.frameCount % 15 === 0) {
      const fpsEl = document.getElementById('hud-fps');
      if (fpsEl) fpsEl.textContent = `${Math.round(fpsSmoothed)} fps`;
    }
  };
};

async function boot() {
  setupUI();

  new p5(sketch);
  await new Promise((r) => requestAnimationFrame(r));
  const canvasEl = document.querySelector('#canvas-wrap canvas');
  initRecorder(canvasEl);

  const cameraPromise = setupCamera().then(() => {
    const hud = document.getElementById('hud-cam');
    if (cameraState.status === 'denied') {
      setStatus('camera-status', 'Camera denied · needs modes 01–04', 'err');
      if (hud) hud.textContent = 'cam: denied';
    } else if (cameraState.status === 'ready') {
      setStatus('camera-status', 'Ready · MediaPipe on GPU · local models', 'ok');
      if (hud) hud.textContent = 'cam: ok';
    } else if (cameraState.status === 'mediapipe-error') {
      setStatus('camera-status', 'Camera OK but MediaPipe failed — modes 02/03 disabled', 'err');
      if (hud) hud.textContent = 'cam: partial';
    } else {
      setStatus('camera-status', 'Camera OK · loading MediaPipe…');
      if (hud) hud.textContent = 'cam: ok';
    }
  });

  const audioPromise = setupAudio().then(() => {
    const hud = document.getElementById('hud-mic');
    if (audioState.status === 'denied') {
      setStatus('audio-status', 'Mic denied · needs mode 04', 'err');
      if (hud) hud.textContent = 'mic: denied';
    } else {
      setStatus('audio-status', 'Ready · 1024-bin FFT / 8-band split', 'ok');
      if (hud) hud.textContent = 'mic: ok';
    }
  });

  await Promise.all([cameraPromise, audioPromise]);
}

boot();
