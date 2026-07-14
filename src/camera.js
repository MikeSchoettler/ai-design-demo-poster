import { uiState } from './ui.js';

export const cameraState = {
  status: 'idle',           // 'idle' | 'requesting' | 'camera-ready' | 'ready' | 'denied' | 'mediapipe-error'
  detail: '',
  video: null,
  faceLandmarker: null,
  handLandmarker: null,
  faceLandmarkerStatus: 'idle',  // 'idle' | 'loading' | 'ready' | 'error'
  handLandmarkerStatus: 'idle',
  faceMeshMeta: null,             // populated by ensureFaceLandmarker() — mesh topology constants
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

let mediapipeLib = null;
let visionResolver = null;
let _visionPending = null;
let _facePending = null;
let _handPending = null;

// Lazy: pull @mediapipe/tasks-vision + WASM only when the user actually
// switches to a mode that needs it. Skips ~22 MB on cold boot.
async function loadVision() {
  if (visionResolver) return { vision: visionResolver, lib: mediapipeLib };
  if (_visionPending) return _visionPending;
  _visionPending = (async () => {
    mediapipeLib = await import('@mediapipe/tasks-vision');
    try {
      visionResolver = await mediapipeLib.FilesetResolver.forVisionTasks(LOCAL_WASM);
      console.log('[mediapipe] wasm loaded from local');
    } catch (e) {
      console.warn('[mediapipe] local WASM failed, retrying from CDN:', e);
      visionResolver = await mediapipeLib.FilesetResolver.forVisionTasks(CDN_WASM);
      console.log('[mediapipe] wasm loaded from CDN');
    }
    return { vision: visionResolver, lib: mediapipeLib };
  })();
  return _visionPending;
}

export async function initCamera() {
  if (cameraState.status === 'camera-ready' || cameraState.status === 'ready') {
    return { ok: true };
  }
  cameraState.status = 'requesting';

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
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('camera loadeddata timeout (5s)')), 5000);
      video.addEventListener('loadeddata', () => { clearTimeout(timeout); resolve(); }, { once: true });
    });

    try {
      await video.play();
    } catch (e) {
      console.warn('[camera] video.play() failed, retry on next gesture:', e);
      const kick = () => { video.play().catch(() => {}); };
      document.addEventListener('click', kick, { once: true });
      document.addEventListener('keydown', kick, { once: true });
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && video.srcObject && video.paused) {
        video.play().catch(() => {});
      }
    });

    cameraState.videoW = video.videoWidth;
    cameraState.videoH = video.videoHeight;
    cameraState.status = 'camera-ready';

    cameraState.frameCanvas = document.createElement('canvas');
    cameraState.frameCanvas.width = cameraState.frameW;
    cameraState.frameCanvas.height = cameraState.frameH;
    cameraState.frameCtx = cameraState.frameCanvas.getContext('2d', { willReadFrequently: true });
    cameraState.frameReady = true;

    cameraState.displayCanvas = document.createElement('canvas');
    cameraState.displayCanvas.width = cameraState.displayW;
    cameraState.displayCanvas.height = cameraState.displayH;
    cameraState.displayCtx = cameraState.displayCanvas.getContext('2d', { willReadFrequently: true });
    cameraState._grayImageData = cameraState.displayCtx.createImageData(
      cameraState.displayW,
      cameraState.displayH
    );

    loop();
    return { ok: true };
  } catch (e) {
    console.warn('[camera] init failed:', e);
    cameraState.status = 'denied';
    cameraState.detail = e.message;
    return { ok: false, reason: readableCameraError(e), error: e };
  }
}

function readableCameraError(e) {
  if (!e || !e.name) return 'Ошибка доступа к камере';
  switch (e.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Доступ к камере запрещён — открой замочек слева от адреса и разреши';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'Камера не найдена — подключи и перезагрузи страницу';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Камеру занял другой процесс (Zoom/Photo Booth) — закрой их';
    case 'OverconstrainedError':
      return 'Камера не поддерживает 960×720';
    default:
      return `${e.name}: ${e.message}`;
  }
}

export async function ensureFaceLandmarker() {
  if (cameraState.faceLandmarker) return { ok: true };
  if (_facePending) return _facePending;
  if (cameraState.status !== 'camera-ready' && cameraState.status !== 'ready') {
    return { ok: false, reason: 'Камера не запущена' };
  }
  cameraState.faceLandmarkerStatus = 'loading';
  _facePending = (async () => {
    try {
      const { vision, lib } = await loadVision();
      const path = await pickModelPath(LOCAL_FACE, CDN_FACE);
      cameraState.faceLandmarker = await lib.FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: path, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: 0.4,
        minFacePresenceConfidence: 0.4,
        minTrackingConfidence: 0.4,
      });
      // Cache mesh topology constants so faceMesh.js doesn't need to statically
      // import @mediapipe/tasks-vision (which would prevent code-splitting).
      cameraState.faceMeshMeta = {
        tesselation: lib.FaceLandmarker.FACE_LANDMARKS_TESSELATION,
        faceOval: lib.FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
        lips: lib.FaceLandmarker.FACE_LANDMARKS_LIPS,
        leftEye: lib.FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
        rightEye: lib.FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
        leftEyebrow: lib.FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
        rightEyebrow: lib.FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
        leftIris: lib.FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
        rightIris: lib.FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
      };
      cameraState.faceLandmarkerStatus = 'ready';
      cameraState.status = 'ready';
      console.log('[mediapipe] face landmarker ready');
      return { ok: true };
    } catch (e) {
      console.error('[mediapipe] face landmarker init failed:', e);
      cameraState.faceLandmarkerStatus = 'error';
      cameraState.detail = e.message;
      return { ok: false, reason: e.message };
    } finally {
      _facePending = null;
    }
  })();
  return _facePending;
}

export async function ensureHandLandmarker() {
  if (cameraState.handLandmarker) return { ok: true };
  if (_handPending) return _handPending;
  if (cameraState.status !== 'camera-ready' && cameraState.status !== 'ready') {
    return { ok: false, reason: 'Камера не запущена' };
  }
  cameraState.handLandmarkerStatus = 'loading';
  _handPending = (async () => {
    try {
      const { vision, lib } = await loadVision();
      const path = await pickModelPath(LOCAL_HAND, CDN_HAND);
      cameraState.handLandmarker = await lib.HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: path, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.4,
        minHandPresenceConfidence: 0.4,
        minTrackingConfidence: 0.4,
      });
      cameraState.handLandmarkerStatus = 'ready';
      if (cameraState.status === 'camera-ready') cameraState.status = 'ready';
      console.log('[mediapipe] hand landmarker ready');
      return { ok: true };
    } catch (e) {
      console.error('[mediapipe] hand landmarker init failed:', e);
      cameraState.handLandmarkerStatus = 'error';
      cameraState.detail = e.message;
      return { ok: false, reason: e.message };
    } finally {
      _handPending = null;
    }
  })();
  return _handPending;
}

async function pickModelPath(local, cdn) {
  try {
    const res = await fetch(local, { method: 'HEAD' });
    if (res.ok) return local;
  } catch {}
  return cdn;
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

  if (cs.displayCtx && uiState.cameraMode === 'visible') {
    const g = cs.displayCtx;
    const c = computeCoverCrop(video.videoWidth, video.videoHeight, cs.displayW, cs.displayH);
    g.save();
    g.translate(cs.displayW, 0);
    g.scale(-1, 1);
    g.drawImage(video, c.sx, c.sy, c.sw, c.sh, 0, 0, cs.displayW, cs.displayH);
    g.restore();

    const img = g.getImageData(0, 0, cs.displayW, cs.displayH);
    const data = img.data;
    const invert = uiState.invert;
    for (let i = 0; i < data.length; i += 4) {
      let gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (invert) gray = 255 - gray;
      data[i] = data[i + 1] = data[i + 2] = gray;
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
