import { FilesetResolver, FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';
import { uiState } from './ui.js';

export const cameraState = {
  status: 'idle',
  detail: '',
  video: null,
  faceLandmarker: null,
  handLandmarker: null,
  faceLandmarks: null,
  handLandmarks: null,
  lastVideoTime: -1,
  videoW: 0,
  videoH: 0,
  // Sampling buffer (small, color) — for sampleCameraLuminance etc.
  frameCanvas: null,
  frameCtx: null,
  frameW: 160,
  frameH: 200,
  frameReady: false,
  cachedImageData: null,
  // Display buffer (mid-res, PRE-GRAYSCALED, invert-aware) — for drawCameraCover.
  // We convert per-pixel in JS so we don't depend on canvas 2D `filter`, which is
  // spotty/broken across older Safari and some Chromium builds.
  displayCanvas: null,
  displayCtx: null,
  displayW: 320,
  displayH: 400,
  displayReady: false,
  _grayImageData: null,
  stream: null,
};

const LOCAL_WASM = '/mediapipe';
const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm';
const LOCAL_FACE = '/models/face_landmarker.task';
const CDN_FACE =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const LOCAL_HAND = '/models/hand_landmarker.task';
const CDN_HAND =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export async function setupCamera() {
  const video = document.createElement('video');
  video.style.display = 'none';
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  document.body.appendChild(video);
  cameraState.video = video;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 960, height: 720, facingMode: 'user' },
      audio: false,
    });
    cameraState.stream = stream;
    video.srcObject = stream;
    await new Promise((r) => video.addEventListener('loadeddata', r, { once: true }));

    // Explicit play() — Safari sometimes ignores autoplay attribute on programmatically
    // created video elements even with muted+playsInline. Await so the frame pump is live.
    try {
      await video.play();
    } catch (e) {
      console.warn('[camera] video.play() failed, will retry on user interaction:', e);
      const kick = () => {
        video.play().catch(() => {});
      };
      document.addEventListener('click', kick, { once: true });
      document.addEventListener('keydown', kick, { once: true });
    }
    // If tab was backgrounded and video paused, resume when visible again.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && video.srcObject && video.paused) {
        video.play().catch(() => {});
      }
    });

    cameraState.videoW = video.videoWidth;
    cameraState.videoH = video.videoHeight;
    cameraState.status = 'camera-ready';

    // Sampling buffer (color, 160x200 — cheap, used for luminance sampling)
    cameraState.frameCanvas = document.createElement('canvas');
    cameraState.frameCanvas.width = cameraState.frameW;
    cameraState.frameCanvas.height = cameraState.frameH;
    cameraState.frameCtx = cameraState.frameCanvas.getContext('2d', {
      willReadFrequently: true,
    });
    cameraState.frameReady = true;

    // Display buffer (mid-res, mono, invert-aware). Independent from sampling.
    cameraState.displayCanvas = document.createElement('canvas');
    cameraState.displayCanvas.width = cameraState.displayW;
    cameraState.displayCanvas.height = cameraState.displayH;
    cameraState.displayCtx = cameraState.displayCanvas.getContext('2d', {
      willReadFrequently: true,
    });
    cameraState._grayImageData = cameraState.displayCtx.createImageData(
      cameraState.displayW,
      cameraState.displayH
    );
  } catch (e) {
    console.warn('Camera denied:', e);
    cameraState.status = 'denied';
    cameraState.detail = e.message;
    return;
  }

  const wasmPath = await pickAvailable(LOCAL_WASM + '/vision_wasm_internal.js', LOCAL_WASM, CDN_WASM);
  console.log('[mediapipe] wasm from', wasmPath);

  try {
    const vision = await FilesetResolver.forVisionTasks(wasmPath);
    const facePath = await pickAvailable(LOCAL_FACE, LOCAL_FACE, CDN_FACE);
    const handPath = await pickAvailable(LOCAL_HAND, LOCAL_HAND, CDN_HAND);
    cameraState.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: facePath, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: 0.4,
      minFacePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });
    cameraState.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: handPath, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });
    cameraState.status = 'ready';
    cameraState.detail = 'GPU · local models';
  } catch (e) {
    console.error('[mediapipe] init failed', e);
    cameraState.status = 'mediapipe-error';
    cameraState.detail = e.message;
  }

  loop();
}

async function pickAvailable(probeUrl, preferred, fallback) {
  try {
    const res = await fetch(probeUrl, { method: 'HEAD' });
    if (res.ok) return preferred;
  } catch {}
  return fallback;
}

function computeCoverCrop(srcW, srcH, dstW, dstH) {
  const srcA = srcW / srcH;
  const dstA = dstW / dstH;
  let sx = 0, sy = 0, sw = srcW, sh = srcH;
  if (srcA > dstA) {
    sw = srcH * dstA;
    sx = (srcW - sw) / 2;
  } else {
    sh = srcW / dstA;
    sy = (srcH - sh) / 2;
  }
  return { sx, sy, sw, sh };
}

function loop() {
  requestAnimationFrame(loop);
  const cs = cameraState;
  const { video } = cs;
  if (!video || video.readyState < 2) return;

  if (uiState.cameraMode === 'off') {
    cs.faceLandmarks = null;
    cs.handLandmarks = null;
    cs.displayReady = false;
    return;
  }

  // --- Sampling frame (160x200, color, mirrored) ---
  if (cs.frameReady) {
    const g = cs.frameCtx;
    const c = computeCoverCrop(video.videoWidth, video.videoHeight, cs.frameW, cs.frameH);
    g.save();
    g.translate(cs.frameW, 0);
    g.scale(-1, 1);
    g.drawImage(video, c.sx, c.sy, c.sw, c.sh, 0, 0, cs.frameW, cs.frameH);
    g.restore();
    cs.cachedImageData = g.getImageData(0, 0, cs.frameW, cs.frameH);
  }

  // --- Display frame (320x400, grayscale, invert-aware, mirrored) ---
  if (cs.displayCtx && uiState.cameraMode === 'visible') {
    const g = cs.displayCtx;
    const c = computeCoverCrop(video.videoWidth, video.videoHeight, cs.displayW, cs.displayH);
    g.save();
    g.translate(cs.displayW, 0);
    g.scale(-1, 1);
    g.drawImage(video, c.sx, c.sy, c.sw, c.sh, 0, 0, cs.displayW, cs.displayH);
    g.restore();

    // Convert to grayscale in JS — reliable across every browser, no dc.filter needed
    const img = g.getImageData(0, 0, cs.displayW, cs.displayH);
    const data = img.data;
    const invert = uiState.invert;
    for (let i = 0; i < data.length; i += 4) {
      let gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (invert) gray = 255 - gray;
      data[i] = data[i + 1] = data[i + 2] = gray;
      // alpha stays 255
    }
    g.putImageData(img, 0, 0);
    cs.displayReady = true;
  } else {
    cs.displayReady = false;
  }

  const t = video.currentTime;
  if (t === cs.lastVideoTime) return;
  cs.lastVideoTime = t;

  const mode = uiState.currentMode;
  const now = performance.now();
  try {
    if (mode === 'face' && cs.faceLandmarker) {
      cs.faceLandmarks = cs.faceLandmarker.detectForVideo(video, now).faceLandmarks;
    } else {
      cs.faceLandmarks = null;
    }
    if (mode === 'hand' && cs.handLandmarker) {
      cs.handLandmarks = cs.handLandmarker.detectForVideo(video, now).landmarks;
    } else {
      cs.handLandmarks = null;
    }
  } catch (e) {
    // MediaPipe occasionally throws on rapid state changes — ignore
  }
}

export function sampleCameraLuminance(u, v) {
  const img = cameraState.cachedImageData;
  if (!img) return 0.5;
  const w = img.width;
  const h = img.height;
  const x = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
  const y = Math.min(h - 1, Math.max(0, Math.floor(v * h)));
  const i = (y * w + x) * 4;
  const d = img.data;
  return (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
}

export function getCameraImageData() {
  return cameraState.cachedImageData;
}

// Draw the pre-processed grayscale display buffer, cover-fit onto the target canvas.
// No `dc.filter`, no `dc.scale(-1, 1)` (image is already mirrored in buffer).
export function drawCameraCover(p, ctx, opts = {}) {
  const { alpha = 0.55 } = opts;
  const cs = cameraState;
  if (!cs.displayReady || !cs.displayCanvas) return false;
  const dc = p.drawingContext;
  dc.save();
  dc.globalAlpha = alpha;
  dc.drawImage(cs.displayCanvas, 0, 0, ctx.W, ctx.H);
  dc.restore();
  return true;
}
