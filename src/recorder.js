import { audioState } from './audio.js';

let mediaRecorder = null;
let chunks = [];
let canvas = null;
let stopTimer = null;
let currentMime = '';
let currentExt = 'webm';

const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
// Telegram in-app browser doesn't grant Web Share API — detect and skip
const IS_TELEGRAM = /Telegram/i.test(navigator.userAgent);
// After first share() failure remember it — don't retry, go straight to modal
let shareKnownBroken = IS_TELEGRAM;

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

// Dispatch — desktop → anchor download; touch → try Web Share, else preview
// modal. The preview modal always works (Telegram WebView etc.) because it
// lets user long-press the media to save through the system menu.
async function handleFile(blob, name, needsFreshClick) {
  if (!IS_TOUCH) {
    downloadAnchor(blob, name);
    return;
  }
  // Video path — activation is expired after 8s recording, skip auto-share.
  if (needsFreshClick) {
    showPreviewModal(blob, name);
    return;
  }
  // PNG / fresh path — try share if we haven't already discovered it's broken
  if (!shareKnownBroken && navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], name, { type: blob.type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        return;
      }
      shareKnownBroken = true;
    } catch (e) {
      if (e.name === 'AbortError') return;
      shareKnownBroken = true;
      console.warn('[recorder] share broken, switching to modal:', e);
    }
  }
  showPreviewModal(blob, name);
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

// Preview modal — universal fallback that works in every WebView / in-app
// browser (Telegram, Instagram, etc.) because it just displays the media and
// lets the user long-press to invoke the native "Save to Photos" menu.
function showPreviewModal(blob, name) {
  const existing = document.getElementById('preview-modal');
  if (existing) existing.remove();

  const isVideo = /\.(mp4|webm|mov)$/i.test(name);
  const url = URL.createObjectURL(blob);

  const modal = document.createElement('div');
  modal.id = 'preview-modal';
  modal.style.cssText = [
    'position:fixed',
    'inset:0',
    'background:rgba(0,0,0,0.92)',
    '-webkit-backdrop-filter:blur(10px)',
    'backdrop-filter:blur(10px)',
    'z-index:1000',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'padding:20px 16px',
    'box-sizing:border-box',
    'overflow:auto',
  ].join(';');

  const previewHtml = isVideo
    ? `<video src="${url}" controls playsinline preload="auto" style="max-width:100%;max-height:52vh;background:#000;border:1px solid #222"></video>`
    : `<img src="${url}" alt="${name}" style="max-width:100%;max-height:52vh;object-fit:contain;border:1px solid #222">`;

  const hintText = isVideo
    ? 'Долгое нажатие на видео → «Сохранить видео» / «Добавить в Фото»'
    : 'Долгое нажатие на фото → «Добавить в Фото» / «Сохранить в изображения»';

  modal.innerHTML = `
    ${previewHtml}
    <div style="margin-top:18px;color:#f2f2f2;font-family:'JetBrains Mono',monospace;font-size:11px;text-align:center;max-width:440px;letter-spacing:0.06em;line-height:1.6">
      <div style="color:#7a7a7a;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:6px">✓ ${isVideo ? 'ВИДЕО ГОТОВО' : 'ФОТО ГОТОВО'}</div>
      <code style="color:#f2f2f2;font-size:10px">${name}</code>
      <div style="margin-top:14px;color:#b0b0b0">${hintText}</div>
    </div>
    <div style="display:flex;gap:8px;margin-top:20px;flex-wrap:wrap;justify-content:center">
      <button id="preview-share" style="padding:14px 22px;background:#f2f2f2;color:#000;border:none;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer">💾 Поделиться</button>
      <button id="preview-close" style="padding:14px 22px;background:transparent;color:#f2f2f2;border:1px solid #444;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer">Закрыть</button>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => {
    URL.revokeObjectURL(url);
    modal.remove();
  };

  document.getElementById('preview-close').addEventListener('click', close);

  document.getElementById('preview-share').addEventListener('click', async () => {
    // Fresh user activation on this tap — retry share even if we thought it was broken
    if (navigator.share && navigator.canShare) {
      try {
        const file = new File([blob], name, { type: blob.type });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: name });
          close();
          return;
        }
      } catch (e) {
        if (e.name === 'AbortError') return;
        console.warn('[recorder] modal share failed:', e);
      }
    }
    // Share unavailable — best we can do is remind user to long-press the preview
    const hint = document.createElement('div');
    hint.textContent = 'В этом браузере Web Share недоступен. Удерживай палец на превью — появится системное меню сохранения.';
    hint.style.cssText = 'color:#ff6a6a;font-family:JetBrains Mono,monospace;font-size:11px;margin-top:14px;text-align:center;max-width:440px;line-height:1.6';
    modal.appendChild(hint);
  });
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
