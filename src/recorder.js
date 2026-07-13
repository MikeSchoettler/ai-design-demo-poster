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
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
