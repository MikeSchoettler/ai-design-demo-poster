import { audioState } from './audio.js';

let mediaRecorder = null;
let chunks = [];
let canvas = null;
let stopTimer = null;
let currentMime = '';
let currentExt = 'webm';

const MIME_CANDIDATES = [
  // MP4 with H.264 + AAC — preferred when browser supports (Chromium 126+, Safari)
  'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4;codecs=h264,aac',
  'video/mp4',
  // WebM fallback (always works on Chromium)
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export function initRecorder(canvasEl) {
  canvas = canvasEl;
  // Log first supported mime on init so user can see in dev console
  const pick = pickMime();
  console.log('[recorder] preferred mime:', pick);
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

export function snapPNG() {
  if (!canvas) return;
  canvas.toBlob((blob) => {
    if (blob) download(blob, `ai-demo-poster-${stamp()}.png`);
  }, 'image/png');
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

  // Compose stream: canvas video track + mic audio track (if available)
  const canvasStream = canvas.captureStream(30);
  const tracks = [...canvasStream.getVideoTracks()];
  if (audioState.stream) {
    const audioTracks = audioState.stream.getAudioTracks();
    for (const t of audioTracks) tracks.push(t);
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
    download(blob, `ai-demo-poster-${stamp()}.${currentExt}`);
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

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  // Auto-download attempt via anchor
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.target = '_blank';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Persistent toast with manual fallback link — needed for Yandex Browser which
  // sometimes silently drops blob downloads without any error.
  showDownloadToast(url, name);
  // Keep URL alive so the toast link works
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function showDownloadToast(url, name) {
  let toast = document.getElementById('download-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'download-toast';
    toast.style.cssText = [
      'position:fixed',
      'bottom:20px',
      'left:50%',
      'transform:translateX(-50%)',
      'background:#f2f2f2',
      'color:#000',
      'padding:10px 16px',
      "font-family:'JetBrains Mono', monospace",
      'font-size:12px',
      'letter-spacing:0.06em',
      'z-index:9999',
      'display:flex',
      'gap:14px',
      'align-items:center',
      'max-width:640px',
      'box-shadow:0 8px 24px rgba(0,0,0,0.4)',
    ].join(';');
    document.body.appendChild(toast);
  }
  toast.innerHTML = `
    <span>✓&nbsp;<b>${name}</b></span>
    <a href="${url}" download="${name}" target="_blank" rel="noopener"
       style="background:#000;color:#f2f2f2;padding:6px 12px;text-decoration:none;font-weight:700;letter-spacing:0.1em">
      СКАЧАТЬ
    </a>
    <a href="${url}" target="_blank" rel="noopener"
       style="color:#555;text-decoration:none;font-size:11px">
      ↗ открыть в табе
    </a>
  `;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 45_000);
}
