import { audioState } from './audio.js';

let mediaRecorder = null;
let chunks = [];
let canvas = null;
let stopTimer = null;
let currentMime = '';
let currentExt = 'webm';

const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

const MIME_CANDIDATES = [
  // MP4 first — iOS Safari 14.3+ and Chromium 126+ can record it natively.
  // Web Share on iOS accepts MP4 into Photos; WebM is not accepted.
  'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4;codecs=h264,aac',
  'video/mp4',
  // WebM fallback for other Chromium browsers
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export function initRecorder(canvasEl) {
  canvas = canvasEl;
  console.log('[recorder] preferred mime:', pickMime(), '· touch:', IS_TOUCH);
}

function pickMime() {
  for (const c of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
}

export function getRecordingFormat() {
  const m = pickMime();
  if (!m) return { ext: '—', label: 'unsupported' };
  const isMp4 = m.startsWith('video/mp4');
  return {
    ext: isMp4 ? 'mp4' : 'webm',
    label: isMp4 ? 'MP4 · H.264+AAC' : 'WebM · VP9+Opus',
  };
}

// Sync data-URL → Blob so navigator.share can be called immediately from a
// user gesture (iOS Safari requirement — activation expires after ~5s and
// canvas.toBlob's async callback can eat the window).
function dataURLToBlob(dataURL) {
  const [prefix, b64] = dataURL.split(',');
  const mime = prefix.match(/:(.*?);/)[1];
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function snapPNG() {
  if (!canvas) return;
  // Sync conversion → share/download runs within the same click's activation.
  const dataURL = canvas.toDataURL('image/png');
  const blob = dataURLToBlob(dataURL);
  handleFile(blob, `ai-demo-poster-${stamp()}.png`, /*needsFreshClick*/ false);
}

export function startRecording(durationMs = 8000, onDone) {
  if (!canvas || mediaRecorder) return;

  const mime = pickMime();
  if (!mime) {
    console.warn('[recorder] no supported mime type');
    return;
  }
  currentMime = mime;
  currentExt = mime.startsWith('video/mp4') ? 'mp4' : 'webm';

  const canvasStream = canvas.captureStream(30);
  const tracks = [...canvasStream.getVideoTracks()];
  if (audioState.stream) {
    for (const t of audioState.stream.getAudioTracks()) tracks.push(t);
  }
  const combinedStream = new MediaStream(tracks);

  const options = {
    mimeType: mime,
    videoBitsPerSecond: 10_000_000,
    audioBitsPerSecond: 256_000,
  };

  try {
    mediaRecorder = new MediaRecorder(combinedStream, options);
  } catch (e) {
    console.error('[recorder] MediaRecorder init failed:', e, 'mime:', mime);
    return;
  }

  chunks = [];
  mediaRecorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  mediaRecorder.onstop = () => {
    const type = currentExt === 'mp4' ? 'video/mp4' : 'video/webm';
    const blob = new Blob(chunks, { type });
    // After 8s recording, the original click activation is long expired.
    // On touch devices, share() only works from a fresh click → show a
    // manual "Save to gallery" button. On desktop, straight download.
    handleFile(blob, `ai-demo-poster-${stamp()}.${currentExt}`, /*needsFreshClick*/ true);
    mediaRecorder = null;
    stopTimer = null;
    onDone?.();
  };
  mediaRecorder.start();
  stopTimer = setTimeout(() => {
    if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
  }, durationMs);
}

export function isRecording() {
  return mediaRecorder?.state === 'recording';
}

// Unified dispatch: on desktop → download; on touch → try share now if
// activation is still valid, else show a "Save" button so the user taps
// with fresh activation.
async function handleFile(blob, name, needsFreshClick) {
  if (!IS_TOUCH) {
    downloadAnchor(blob, name);
    return;
  }
  if (needsFreshClick) {
    showSaveButton(blob, name);
    return;
  }
  // Try immediate share while activation is fresh
  if (navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], name, { type: blob.type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        return;
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.warn('[recorder] share failed, showing save button:', e);
    }
  }
  // Share unavailable / failed → save button as fallback
  showSaveButton(blob, name);
}

function downloadAnchor(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function showSaveButton(blob, name) {
  const existing = document.getElementById('save-btn-modal');
  if (existing) existing.remove();

  const btn = document.createElement('button');
  btn.id = 'save-btn-modal';
  btn.style.cssText = [
    'position:fixed',
    'bottom:80px',
    'left:50%',
    'transform:translateX(-50%)',
    'padding:16px 26px',
    'background:#f2f2f2',
    'color:#000',
    'border:none',
    "font-family:'JetBrains Mono', monospace",
    'font-weight:700',
    'letter-spacing:0.1em',
    'font-size:13px',
    'z-index:500',
    'cursor:pointer',
    'box-shadow:0 8px 30px rgba(0,0,0,0.5)',
    'text-transform:uppercase',
    'animation:pulse 1.2s infinite',
  ].join(';');
  const kind = name.endsWith('.png') ? 'фото' : 'видео';
  btn.textContent = `💾 Сохранить ${kind}`;
  document.body.appendChild(btn);

  const doShare = async () => {
    try {
      const file = new File([blob], name, { type: blob.type });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        btn.remove();
        return;
      }
      // No share — open blob in new tab so user can long-press → Save to Photos
      window.open(URL.createObjectURL(blob), '_blank');
      btn.remove();
    } catch (e) {
      if (e.name === 'AbortError') {
        btn.remove();
        return;
      }
      console.warn('[recorder] save button share failed:', e);
      window.open(URL.createObjectURL(blob), '_blank');
      btn.remove();
    }
  };

  btn.addEventListener('click', doShare);

  // Auto-cleanup after a minute if user ignores it
  setTimeout(() => {
    if (btn.parentNode) btn.remove();
  }, 60_000);
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
