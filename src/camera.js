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
  frameCanvas: null,
  frameCtx: null,
  frameW: 160,
  frameH: 200,
  frameReady: false,
  cachedImageData: null,
  cachedFrameStamp: -1,
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
    video.srcObject = stream;
    await new Promise((r) => video.addEventListener('loadeddata', r, { once: true }));
    cameraState.videoW = video.videoWidth;
    cameraState.videoH = video.videoHeight;
    cameraState.status = 'camera-ready';

    // Shared low-res pixel buffer for camera-reactive modes
    cameraState.frameCanvas = document.createElement('canvas');
    cameraState.frameCanvas.width = cameraState.frameW;
    cameraState.frameCanvas.height = cameraState.frameH;
    cameraState.frameCtx = cameraState.frameCanvas.getContext('2d', {
      willReadFrequently: true,
    });
    cameraState.frameReady = true;
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
    console.log('[mediapipe] face model from', facePath);
    console.log('[mediapipe] hand model from', handPath);

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

function loop() {
  requestAnimationFrame(loop);
  const cs = cameraState;
  const { video } = cs;
  if (!video || video.readyState < 2) return;

  // GLOBAL off gate — no processing at all
  if (uiState.cameraMode === 'off') {
    cs.faceLandmarks = null;
    cs.handLandmarks = null;
    return;
  }

  // Refresh shared frame buffer with COVER-fit (center-crop to preserve aspect)
  if (cs.frameReady) {
    const g = cs.frameCtx;
    const srcAspect = video.videoWidth / video.videoHeight;
    const dstAspect = cs.frameW / cs.frameH;
    let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
    if (srcAspect > dstAspect) {
      sw = video.videoHeight * dstAspect;
      sx = (video.videoWidth - sw) / 2;
    } else {
      sh = video.videoWidth / dstAspect;
      sy = (video.videoHeight - sh) / 2;
    }
    g.save();
    g.translate(cs.frameW, 0);
    g.scale(-1, 1); // mirror
    g.drawImage(video, sx, sy, sw, sh, 0, 0, cs.frameW, cs.frameH);
    g.restore();
    cs.cachedImageData = g.getImageData(0, 0, cs.frameW, cs.frameH);
    cs.cachedFrameStamp = performance.now();
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
    // MediaPipe occasionally throws during rapid state changes — ignore
  }
}

export function sampleCameraLuminance(u, v) {
  const cs = cameraState;
  const img = cs.cachedImageData;
  if (!img) return 0.5;
  const w = img.width;
  const h = img.height;
  const x = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
  const y = Math.min(h - 1, Math.max(0, Math.floor(v * h)));
  const i = (y * w + x) * 4;
  const d = img.data;
  return (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
}

export function sampleCameraBlue(u, v) {
  const cs = cameraState;
  const img = cs.cachedImageData;
  if (!img) return 0.5;
  const w = img.width;
  const h = img.height;
  const x = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
  const y = Math.min(h - 1, Math.max(0, Math.floor(v * h)));
  const i = (y * w + x) * 4;
  const d = img.data;
  // Normalized blueness — how much blue dominates vs red/green (0..1)
  // Pure blue pixel → high value. Grayscale / warm color → low.
  const r = d[i];
  const g = d[i + 1];
  const b = d[i + 2];
  const maxRG = Math.max(r, g);
  return Math.max(0, Math.min(1, (b - maxRG * 0.75) / 255));
}

export function getCameraImageData() {
  return cameraState.cachedImageData;
}

export function drawCameraCover(p, ctx, opts = {}) {
  const {
    alpha = 0.55,
    filter = 'grayscale(1) contrast(1.35) brightness(0.55)',
    mirror = true,
  } = opts;
  const v = cameraState.video;
  if (!v || v.readyState < 2) return false;
  const srcAspect = v.videoWidth / v.videoHeight;
  const dstAspect = ctx.W / ctx.H;
  let sx = 0, sy = 0, sw = v.videoWidth, sh = v.videoHeight;
  if (srcAspect > dstAspect) {
    sw = v.videoHeight * dstAspect;
    sx = (v.videoWidth - sw) / 2;
  } else {
    sh = v.videoWidth / dstAspect;
    sy = (v.videoHeight - sh) / 2;
  }
  const dc = p.drawingContext;
  dc.save();
  dc.filter = filter;
  dc.globalAlpha = alpha;
  if (mirror) {
    dc.translate(ctx.W, 0);
    dc.scale(-1, 1);
  }
  dc.drawImage(v, sx, sy, sw, sh, 0, 0, ctx.W, ctx.H);
  dc.restore();
  return true;
}
