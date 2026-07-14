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
  if (!canvas) {
    console.warn('[recorder] snapPNG: canvas not ready yet');
    return;
  }
  let dataURL;
  try {
    dataURL = canvas.toDataURL('image/png');
  } catch (e) {
    console.error('[recorder] toDataURL failed:', e);
    alert(
      e.name === 'SecurityError'
        ? 'Не могу сохранить PNG: canvas был засвечен внешним ресурсом. Перезагрузи страницу.'
        : `Не могу сохранить PNG: ${e.message}`
    );
    return;
  }
  const blob = dataURLToBlob(dataURL);
  handleFile(blob, `ai-demo-poster-${stamp()}.png`, /*needsFreshClick*/ false);
}

export function startRecording(durationMs = 8000, onDone) {
  if (!canvas) {
    console.warn('[recorder] startRecording: canvas not ready yet');
    onDone?.();
    return;
  }
  if (mediaRecorder) {
    console.warn('[recorder] already recording, ignoring');
    return;
  }

  const mime = pickMime();
  if (!mime) {
    console.warn('[recorder] no supported mime type');
    alert('Браузер не поддерживает MediaRecorder — попробуй Chrome/Safari');
    onDone?.();
    return;
  }
  currentMime = mime;
  currentExt = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  console.log('[recorder] starting', durationMs + 'ms', '·', mime);

  let combinedStream;
  try {
    const canvasStream = canvas.captureStream(30);
    const tracks = [...canvasStream.getVideoTracks()];
    if (audioState.stream) {
      for (const t of audioState.stream.getAudioTracks()) tracks.push(t);
    }
    combinedStream = new MediaStream(tracks);
  } catch (e) {
    console.error('[recorder] captureStream failed:', e);
    alert(`Не могу захватить canvas: ${e.message}`);
    onDone?.();
    return;
  }

  const options = {
    mimeType: mime,
    videoBitsPerSecond: 10_000_000,
    audioBitsPerSecond: 256_000,
  };

  try {
    mediaRecorder = new MediaRecorder(combinedStream, options);
  } catch (e) {
    console.error('[recorder] MediaRecorder init failed:', e, 'mime:', mime);
    alert(`MediaRecorder не запустился: ${e.message}`);
    onDone?.();
    return;
  }

  chunks = [];
  mediaRecorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  mediaRecorder.onerror = (e) => {
    console.error('[recorder] error event:', e);
  };
  mediaRecorder.onstop = () => {
    const type = currentExt === 'mp4' ? 'video/mp4' : 'video/webm';
    const blob = new Blob(chunks, { type });
    const sizeKb = Math.round(blob.size / 1024);
    console.log('[recorder] stopped', sizeKb + ' KB', '·', currentExt);
    if (blob.size < 2048) {
      alert(
        `Запись получилась пустая (${sizeKb} KB) — вероятно, кодек ${currentExt.toUpperCase()} ` +
        `в этом браузере не работает. Попробуй ещё раз или открой в Chrome/Safari.`
      );
      mediaRecorder = null;
      stopTimer = null;
      onDone?.();
      return;
    }
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

let _gifBusy = false;
export function isGifBusy() {
  return _gifBusy;
}

// Two-phase GIF: (1) capture into offscreen ImageData buffer, (2) encode via
// dynamic-imported gifenc. Ресайз до 540×675 держит RAM в разумных ~50 MB
// даже на длинных записях. Оба этапа yield-ят каждые несколько кадров, чтобы
// canvas продолжал рендериться.
export async function startGifRecording(durationMs = 4000, opts = {}, onProgress, onDone) {
  if (!canvas) {
    console.warn('[recorder] startGifRecording: canvas not ready yet');
    onDone?.();
    return;
  }
  if (_gifBusy) {
    console.warn('[recorder] gif already in progress');
    return;
  }
  _gifBusy = true;

  const fps = opts.fps ?? 15;
  const scale = opts.scale ?? 0.5;
  const maxColors = opts.maxColors ?? 128;
  const targetW = Math.round(canvas.width * scale);
  const targetH = Math.round(canvas.height * scale);
  const totalFrames = Math.max(1, Math.round((durationMs / 1000) * fps));
  const frameInterval = 1000 / fps;

  console.log(
    `[recorder] gif: ${totalFrames}f · ${targetW}×${targetH} · ${fps}fps · ${maxColors}c · ~${durationMs}ms`
  );

  const off = document.createElement('canvas');
  off.width = targetW;
  off.height = targetH;
  const octx = off.getContext('2d', { willReadFrequently: true });

  try {
    // ==== Capture phase ====
    const frames = new Array(totalFrames);
    const start = performance.now();
    for (let i = 0; i < totalFrames; i++) {
      const targetTs = start + i * frameInterval;
      const wait = targetTs - performance.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      octx.drawImage(canvas, 0, 0, targetW, targetH);
      frames[i] = octx.getImageData(0, 0, targetW, targetH).data;
      onProgress?.({ phase: 'capture', pct: (i + 1) / totalFrames });
    }

    // ==== Encode phase ====
    // gifenc's own applyPalette internally rounds input to RGB565 (5-6-5 bit)
    // before matching → for grayscale camera footage that collapses to ~32
    // grey levels and produces heavy posterization. We skip it and run
    // Floyd–Steinberg dithering ourselves against the true 8-bit input.
    const { GIFEncoder, quantize, applyPalette, nearestColorIndex } = await import('gifenc');
    const enc = GIFEncoder();
    const delay = Math.round(1000 / fps);
    const useDither = opts.dither !== false;
    for (let i = 0; i < frames.length; i++) {
      const rgba = frames[i];
      const palette = quantize(rgba, maxColors);
      const idx = useDither
        ? ditherFloydSteinberg(rgba, targetW, targetH, palette, nearestColorIndex)
        : applyPalette(rgba, palette);
      enc.writeFrame(idx, targetW, targetH, { palette, delay });
      frames[i] = null; // drop reference so GC can reclaim
      onProgress?.({ phase: 'encode', pct: (i + 1) / frames.length });
      if (i % 2 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    enc.finish();
    const bytes = enc.bytes();
    const blob = new Blob([bytes], { type: 'image/gif' });
    console.log(`[recorder] gif done · ${Math.round(blob.size / 1024)} KB`);
    handleFile(blob, `ai-demo-poster-${stamp()}.gif`, /*needsFreshClick*/ true);
  } catch (e) {
    console.error('[recorder] gif failed:', e);
    alert(`GIF не собрался: ${e.message}`);
  } finally {
    _gifBusy = false;
    onDone?.();
  }
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

// Floyd–Steinberg error-diffusion dithering, matching each pixel to the
// nearest color in `palette` (true 8-bit RGB distance via gifenc's
// nearestColorIndex helper). Errors distribute right (7/16), bottom-left
// (3/16), bottom (5/16), bottom-right (1/16). Returns Uint8Array of indices.
function ditherFloydSteinberg(rgba, w, h, palette, nearestColorIndex) {
  const src = new Int16Array(rgba.length);
  for (let i = 0; i < rgba.length; i++) src[i] = rgba[i];
  const out = new Uint8Array(w * h);
  const probe = [0, 0, 0];
  const rowStride = w * 4;
  for (let y = 0; y < h; y++) {
    const rowStart = y * rowStride;
    for (let x = 0; x < w; x++) {
      const i = rowStart + x * 4;
      let r = src[i];
      let g = src[i + 1];
      let b = src[i + 2];
      if (r < 0) r = 0; else if (r > 255) r = 255;
      if (g < 0) g = 0; else if (g > 255) g = 255;
      if (b < 0) b = 0; else if (b > 255) b = 255;
      probe[0] = r; probe[1] = g; probe[2] = b;
      const idx = nearestColorIndex(palette, probe);
      const pal = palette[idx];
      out[y * w + x] = idx;
      const er = r - pal[0];
      const eg = g - pal[1];
      const eb = b - pal[2];
      const hasRight = x + 1 < w;
      const hasBelow = y + 1 < h;
      if (hasRight) {
        const j = i + 4;
        src[j]     += (er * 7) >> 4;
        src[j + 1] += (eg * 7) >> 4;
        src[j + 2] += (eb * 7) >> 4;
      }
      if (hasBelow) {
        const jB = i + rowStride;
        if (x > 0) {
          const jBL = jB - 4;
          src[jBL]     += (er * 3) >> 4;
          src[jBL + 1] += (eg * 3) >> 4;
          src[jBL + 2] += (eb * 3) >> 4;
        }
        src[jB]     += (er * 5) >> 4;
        src[jB + 1] += (eg * 5) >> 4;
        src[jB + 2] += (eb * 5) >> 4;
        if (hasRight) {
          const jBR = jB + 4;
          src[jBR]     += er >> 4;
          src[jBR + 1] += eg >> 4;
          src[jBR + 2] += eb >> 4;
        }
      }
    }
  }
  return out;
}
