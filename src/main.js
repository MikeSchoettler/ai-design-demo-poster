import p5 from 'p5';
import { cameraState, initCamera } from './camera.js';
import { audioState, initAudio } from './audio.js';
import { initRecorder } from './recorder.js';
import { setupUI, uiState, setStatus } from './ui.js';
import { drawPoster } from './poster.js';

import * as flowMode from './modes/flow.js';
import * as faceMode from './modes/faceMesh.js';
import * as handMode from './modes/handParticles.js';

const MODES = { flow: flowMode, face: faceMode, hand: handMode };
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
    for (const key of Object.keys(MODES)) {
      if (MODES[key].init) MODES[key].init(p, ctx);
    }
    currentKey = uiState.currentMode;
    current = MODES[currentKey];
  };

  let fpsSmoothed = 30;
  let lastTs = performance.now();

  p.draw = () => {
    if (uiState.currentMode !== currentKey) {
      currentKey = uiState.currentMode;
      current = MODES[currentKey];
    }
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

// Boot UI + sketch immediately so Flow renders without waiting on anything.
setupUI();
new p5(sketch);
requestAnimationFrame(() => {
  const canvasEl = document.querySelector('#canvas-wrap canvas');
  initRecorder(canvasEl);
});

// ================= Start overlay — permission requests only on user gesture =================
const overlay = document.getElementById('start-overlay');
const startFull = document.getElementById('start-full');
const startFlow = document.getElementById('start-flow');
const statusEl = document.getElementById('start-status');
const hintEl = document.getElementById('start-hint');

function setStartStatus(text, cls) {
  if (!statusEl) return;
  statusEl.textContent = text || '';
  statusEl.classList.remove('err', 'ok');
  if (cls) statusEl.classList.add(cls);
}

function closeOverlay() {
  if (!overlay) return;
  overlay.classList.add('fading');
  setTimeout(() => overlay.setAttribute('hidden', ''), 320);
}

function updateHud() {
  const camHud = document.getElementById('hud-cam');
  const micHud = document.getElementById('hud-mic');
  if (camHud) {
    const s = cameraState.status;
    camHud.textContent = `cam: ${s === 'ready' || s === 'camera-ready' ? 'ok' : s === 'denied' ? 'denied' : '—'}`;
  }
  if (micHud) {
    micHud.textContent = `mic: ${audioState.status === 'ready' ? 'ok' : audioState.status === 'denied' ? 'denied' : '—'}`;
  }
}

// Serialize permission prompts — Yandex Browser (and other Chromium forks) show
// only one dialog at a time; a parallel second request can silently drop.
async function startFullFlow() {
  startFull.disabled = true;
  startFlow.disabled = true;

  setStartStatus('1 / 2 · запрашиваю микрофон…');
  const mic = await initAudio();
  if (mic.ok) {
    setStatus('audio-status', 'Ready · 1024-bin FFT / 8-band split', 'ok');
  } else {
    setStatus('audio-status', mic.reason || 'Mic denied', 'err');
  }

  setStartStatus('2 / 2 · запрашиваю камеру…');
  const cam = await initCamera();
  if (cam.ok) {
    setStatus(
      'camera-status',
      'Ready · Flow работает. Face/Hand модели грузятся по требованию.',
      'ok'
    );
  } else {
    setStatus('camera-status', cam.reason || 'Camera denied', 'err');
  }

  updateHud();

  if (!mic.ok && !cam.ok) {
    setStartStatus(cam.reason || mic.reason || 'Разрешения не получены', 'err');
    if (hintEl) hintEl.hidden = false;
    startFull.disabled = false;
    startFlow.disabled = false;
    return;
  }
  if (!cam.ok) {
    setStartStatus('Камера отключена — Flow-режим работает', 'ok');
    setTimeout(closeOverlay, 900);
    return;
  }
  if (!mic.ok) {
    setStartStatus('Микрофон отключён — визуал без реакции на голос', 'ok');
    setTimeout(closeOverlay, 900);
    return;
  }

  setStartStatus('Готово', 'ok');
  setTimeout(closeOverlay, 250);
}

function startFlowOnly() {
  setStatus('camera-status', 'Пропущено пользователем', 'err');
  setStatus('audio-status', 'Пропущено пользователем', 'err');
  updateHud();
  closeOverlay();
}

startFull?.addEventListener('click', () => {
  startFullFlow().catch((e) => {
    console.error('[boot] startFullFlow crashed:', e);
    setStartStatus(String(e.message || e), 'err');
    startFull.disabled = false;
    startFlow.disabled = false;
  });
});
startFlow?.addEventListener('click', startFlowOnly);
