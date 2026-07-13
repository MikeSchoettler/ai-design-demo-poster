// ===== 4 SIZE SYSTEM =====
const SIZE_H1 = 132;   // Hero — Manifesto title
const SIZE_H2 = 84;    // Big — Speaker hero pair (name+team / topic)
const SIZE_BODY = 40;  // Body — Manifesto subtitle, Speaker title, strip values
const SIZE_META = 16;  // Meta — labels, crumbs, footer

// ===== VOICE-REACTIVE STATE (Mode 01 only) =====
// The ONLY smoothing lives on the incoming amplitude signal. There's no
// smoothstep on output and no opacity — reveal happens purely through
// font SIZE growing from 0 to full.
let posterAmpSmoothed = 0;
const AMP_MAX = 0.12;
const AMP_TARGET = AMP_MAX * 0.75; // 100% scale at 75% of MAX loudness

function updateVoiceReveal(ctx) {
  const rawAmp = ctx.audio.amplitude * ctx.ui.audioSensitivity;
  posterAmpSmoothed = posterAmpSmoothed * 0.93 + rawAmp * 0.07;

  const isFlowMode = ctx.ui.currentMode === 'flow';
  let scale = 1;
  if (isFlowMode) {
    const raw = posterAmpSmoothed / AMP_TARGET;
    if (raw <= 1) {
      scale = raw; // linear reveal 0..1
    } else {
      // Aggressive over-shout: growth accelerates past 100 %
      scale = 1 + (raw - 1) * 2.8;
    }
    scale = Math.min(3.6, scale); // hard cap so nothing explodes to infinity
  }
  const overshoot = Math.max(0, scale - 1); // 0 at target, up to ~2.6 when screaming

  const voice = { scale, overshoot, smoothedAmp: posterAmpSmoothed, isFlowMode };
  ctx.voice = voice;
  return voice;
}

// Position jitter applied when text is in over-shout territory — the words
// tremble as if under pressure. Deterministic-ish per frame via Math.random.
function tremor(overshoot) {
  const strength = Math.max(0, overshoot - 0.35);
  if (strength <= 0) return { x: 0, y: 0 };
  const amt = strength * 9;
  return {
    x: (Math.random() - 0.5) * amt,
    y: (Math.random() - 0.5) * amt,
  };
}

export function drawPoster(p, ctx) {
  const { W, H, ui } = ctx;
  const fg = ui.invert ? 15 : 240;
  const bg = ui.invert ? 240 : 15;
  const dim = ui.invert ? 90 : 140;
  const M = 42;
  const PAD = 26;
  const contentX0 = M + PAD;
  const contentX1 = W - M - PAD;
  const contentW = contentX1 - contentX0;
  const GUTTER = 32;
  const colHalfW = (contentW - GUTTER) / 2;
  const colA = contentX0;
  const colB2 = colA + colHalfW + GUTTER;

  p.push();

  // Frame + corner ticks
  p.noFill();
  p.stroke(fg, 220);
  p.strokeWeight(1.4);
  p.rect(M, M, W - 2 * M, H - 2 * M);
  const tick = 18;
  [[M, M], [W - M, M], [M, H - M], [W - M, H - M]].forEach(([x, y]) => {
    p.line(x - tick, y, x + tick, y);
    p.line(x, y - tick, x, y + tick);
  });
  p.noStroke();

  // ===== HEADER (крошки) — dynamic layout depending on logo height =====
  const headerY = M + 30;
  const logoImg = ui.logoImage;
  const hasImgLogo =
    logoImg && logoImg.complete && logoImg.naturalWidth > 0 && logoImg.naturalHeight > 0;
  let logoBlockH = SIZE_META;

  if (hasImgLogo) {
    const h = ui.logoSize || 24;
    const w = h * (ui.logoAspect || logoImg.naturalWidth / logoImg.naturalHeight);
    // If light palette, invert the image so dark logos read on white bg
    const dc = p.drawingContext;
    dc.save();
    if (ui.invert) {
      dc.filter = 'invert(1)';
    }
    dc.drawImage(logoImg, colA, headerY, w, h);
    dc.restore();
    logoBlockH = h;
  } else {
    p.textFont('JetBrains Mono');
    p.textStyle(p.BOLD);
    p.textAlign(p.LEFT, p.TOP);
    p.textSize(SIZE_META);
    p.fill(fg);
    p.text(ui.logo || 'Фантех', colA, headerY);
  }

  // ОБМЕН ОПЫТОМ on right (aligned to logo top)
  p.textFont('JetBrains Mono');
  p.textStyle(p.BOLD);
  p.textAlign(p.RIGHT, p.TOP);
  p.textSize(SIZE_META);
  p.fill(fg);
  p.text((ui.exchange || 'ОБМЕН ОПЫТОМ').toUpperCase(), contentX1, headerY);

  // Sub-header row — positioned below the tallest of {logo, right label}
  const subHeaderY = headerY + Math.max(logoBlockH, SIZE_META) + 12;
  p.textStyle(p.NORMAL);
  p.textSize(SIZE_META);
  p.fill(dim);
  p.textAlign(p.LEFT, p.TOP);
  p.text(ui.edition || 'SESSION · 01', colA, subHeaderY);
  p.textAlign(p.RIGHT, p.TOP);
  p.text(ui.date || nowStamp(), contentX1, subHeaderY);

  // Rule below sub-header
  const ruleY = subHeaderY + SIZE_META + 14;
  p.stroke(fg, 90);
  p.strokeWeight(1);
  p.line(colA, ruleY, contentX1, ruleY);
  p.noStroke();

  // Title top — reflows with header
  const titleTop = ruleY + 30;

  const voice = updateVoiceReveal(ctx);
  const template = ui.template || 'manifesto';
  if (template === 'speaker') {
    drawSpeaker(p, ctx, { fg, dim, colA, contentW, M, titleTop, voice });
  } else {
    drawManifesto(p, ctx, { fg, dim, colA, contentW, M, titleTop, voice });
  }

  // ===== INSTRUMENT STRIP =====
  const stripDivY = H - M - PAD - 116;
  const stripTopY = stripDivY + 14;
  const eqY = stripTopY + 34;
  const eqH = 36;

  p.stroke(fg, 100);
  p.strokeWeight(1);
  p.line(colA, stripDivY, contentX1, stripDivY);
  p.noStroke();

  p.textFont('JetBrains Mono');
  p.textStyle(p.BOLD);
  p.textAlign(p.LEFT, p.TOP);
  p.textSize(SIZE_META);
  p.fill(dim);
  p.text('TIMECODE', colA, stripTopY);
  p.text('FRAME', colB2, stripTopY);
  p.textStyle(p.NORMAL);
  p.textSize(24);
  p.fill(fg);
  p.text(timecode(), colA + 118, stripTopY - 4);
  p.text(pad5(p.frameCount), colB2 + 88, stripTopY - 4);

  drawEqualizer(p, ctx, colA, eqY, contentW, eqH, fg);

  const stripBottomY = eqY + eqH + 8;
  p.stroke(fg, 100);
  p.strokeWeight(1);
  p.line(colA, stripBottomY, contentX1, stripBottomY);
  p.noStroke();

  // ===== FOOTER — крошки внизу =====
  const footerY = H - M - PAD;
  p.textFont('JetBrains Mono');
  p.textStyle(p.BOLD);
  p.textAlign(p.LEFT, p.BOTTOM);
  p.textSize(SIZE_META);
  p.fill(fg);
  p.text((ui.exchange || 'ОБМЕН ОПЫТОМ').toUpperCase(), colA, footerY);
  p.textAlign(p.RIGHT, p.BOTTOM);
  p.textStyle(p.NORMAL);
  p.fill(dim);
  p.text('AI · ДИЗАЙН · ДЕМО', contentX1, footerY);

  p.pop();
}

// ---- Manifesto: BIG title, small subtitle in 2/3 width ----
function drawManifesto(p, ctx, opts) {
  const { fg, dim, colA, contentW, titleTop, voice } = opts;
  const { ui, H } = ctx;
  const scale = voice.scale;
  const overshoot = voice.overshoot;

  const titleText = ui.title || 'AI Дизайн\nДемо';
  const titleSize = SIZE_H1 * scale;
  const titleLines = titleText.split('\n').length;
  const titleH = titleLines * titleSize * 0.94;

  if (titleSize > 3) {
    p.textFont('JetBrains Mono');
    p.textStyle(p.BOLD);
    p.fill(fg);
    p.textSize(titleSize);
    p.textLeading(titleSize * 0.94);
    p.textAlign(p.LEFT, p.TOP);
    const t = tremor(overshoot);
    p.text(titleText, colA + t.x, titleTop + t.y);
  }

  // Divider — pushed down by title as it grows past H/2
  const divY = Math.max(H * 0.5, titleTop + titleH + 30);
  p.stroke(fg, 100);
  p.strokeWeight(1);
  p.line(colA, divY, colA + contentW, divY);
  p.noStroke();

  const subLabelY = divY + 30;
  p.textStyle(p.BOLD);
  p.textSize(SIZE_META);
  p.fill(dim);
  p.textAlign(p.LEFT, p.TOP);
  p.text('О ФОРМАТЕ', colA, subLabelY);

  const subSize = SIZE_BODY * scale;
  if (subSize > 3) {
    const subW = Math.floor(contentW * (2 / 3));
    p.textStyle(p.NORMAL);
    p.textSize(subSize);
    p.textLeading(subSize * 1.22);
    p.fill(fg);
    const manifestoDefault =
      'Разбираем реальные задачи дизайн-функции Фантеха и показываем, как AI помогает их решать.';
    const t = tremor(overshoot);
    p.text(ui.subtitle || manifestoDefault, colA + t.x, subLabelY + SIZE_META + 8 + t.y, subW);
  }
}

// ---- Speaker: small title at top, HUGE speaker + topic block BOTTOM-anchored ----
function drawSpeaker(p, ctx, opts) {
  const { fg, dim, colA, contentW, M, titleTop, voice } = opts;
  const { ui, H } = ctx;
  const scale = voice.scale;
  const overshoot = voice.overshoot;

  const titleSz = SIZE_BODY * scale;
  if (titleSz > 3) {
    p.textFont('JetBrains Mono');
    p.textStyle(p.BOLD);
    p.fill(fg);
    p.textSize(titleSz);
    p.textLeading(titleSz * 1.05);
    p.textAlign(p.LEFT, p.TOP);
    const collapsedTitle = (ui.title || 'AI Дизайн Демо').replace(/\n/g, ' ');
    const t = tremor(overshoot);
    p.text(collapsedTitle, colA + t.x, titleTop + t.y);
  }

  // Divider follows the small title as it grows
  const divY = titleTop + titleSz + 24;
  p.stroke(fg, 100);
  p.strokeWeight(1);
  p.line(colA, divY, colA + contentW, divY);
  p.noStroke();

  const PAD = 26;
  const stripTop = H - M - PAD - 116;
  const gapAboveStrip = 30;
  const labelGap = 8;
  const blockGap = 28;

  const speakerLine = ui.speaker || 'Имя Фамилия, Команда';
  const topicLine = ui.topic || 'Тема выступления';

  // Use SCALED hero size for height calc — blocks push each other apart as they grow
  const heroSize = SIZE_H2 * scale;
  const heroForLayout = Math.max(SIZE_H2, heroSize); // never shrink layout below base
  const speakerH = estimateWrappedHeight(speakerLine, contentW, heroForLayout, heroForLayout * 0.98);
  const topicH = estimateWrappedHeight(topicLine, contentW, heroForLayout, heroForLayout * 0.98);

  const speakerY = stripTop - gapAboveStrip - speakerH;
  const speakerLabelY = speakerY - SIZE_META - labelGap;
  const topicY = speakerLabelY - blockGap - topicH;
  const topicLabelY = topicY - SIZE_META - labelGap;

  p.textStyle(p.BOLD);
  p.textSize(SIZE_META);
  p.fill(dim);
  p.textAlign(p.LEFT, p.TOP);
  p.text('ТЕМА', colA, topicLabelY);
  p.text('СПИКЕР', colA, speakerLabelY);

  if (heroSize > 3) {
    p.textStyle(p.BOLD);
    p.textSize(heroSize);
    p.textLeading(heroSize * 0.98);
    p.fill(fg);
    const t1 = tremor(overshoot);
    p.text(topicLine, colA + t1.x, topicY + t1.y, contentW);
    const t2 = tremor(overshoot);
    p.text(speakerLine, colA + t2.x, speakerY + t2.y, contentW);
  }
}

function estimateWrappedHeight(str, w, size, leading) {
  const perChar = size * 0.6;
  const charsPerLine = Math.max(1, Math.floor(w / perChar));
  const words = String(str).split(/\s+/);
  let lines = 1;
  let cur = 0;
  for (const wd of words) {
    const len = wd.length + (cur > 0 ? 1 : 0);
    if (cur + len > charsPerLine) {
      lines++;
      cur = wd.length;
    } else {
      cur += len;
    }
  }
  return lines * leading;
}

function drawEqualizer(p, ctx, x, y, w, h, fg) {
  const freq = ctx.audio.freqData;
  const bars = 60;
  const gap = 3;
  const barW = (w - gap * (bars - 1)) / bars;

  p.stroke(fg, 60);
  p.strokeWeight(1);
  p.line(x, y + h, x + w, y + h);
  p.noStroke();

  p.fill(fg);
  for (let i = 0; i < bars; i++) {
    let v;
    if (freq) {
      const idx = Math.floor(Math.pow(i / bars, 1.6) * (freq.length * 0.5));
      v = freq[Math.min(freq.length - 1, idx)] / 255;
    } else {
      const t = p.frameCount * 0.05;
      v = 0.12 + 0.14 * Math.abs(Math.sin(t + i * 0.35));
    }
    const bh = Math.max(2, v * h);
    p.rect(x + i * (barW + gap), y + h - bh, barW, bh);
  }
}

function nowStamp() {
  const d = new Date();
  const months = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
  ];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function timecode() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ms = String(Math.floor(d.getMilliseconds() / 10)).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`;
}

function pad5(n) {
  return String(n).padStart(5, '0');
}
