// ===== 4 SIZE SYSTEM =====
const SIZE_H1 = 132;   // Hero — Manifesto title
const SIZE_H2 = 84;    // Big — Speaker hero pair (name+team / topic)
const SIZE_BODY = 40;  // Body — Manifesto subtitle, Speaker title, strip values
const SIZE_META = 16;  // Meta — labels, crumbs, footer

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

  // ===== HEADER (крошки) =====
  const headerY = M + 30;
  p.textFont('JetBrains Mono');
  p.textStyle(p.BOLD);
  p.textAlign(p.LEFT, p.TOP);
  p.textSize(SIZE_META);
  p.fill(fg);
  p.text(ui.logo || 'Фантех', colA, headerY);

  p.textAlign(p.RIGHT, p.TOP);
  p.text((ui.exchange || 'ОБМЕН ОПЫТОМ').toUpperCase(), contentX1, headerY);

  // Sub-header row: edition / date
  p.textStyle(p.NORMAL);
  p.textSize(SIZE_META);
  p.fill(dim);
  p.textAlign(p.LEFT, p.TOP);
  p.text(ui.edition || 'SESSION · 01', colA, headerY + 26);
  p.textAlign(p.RIGHT, p.TOP);
  p.text(ui.date || nowStamp(), contentX1, headerY + 26);

  p.stroke(fg, 90);
  p.strokeWeight(1);
  p.line(colA, headerY + 56, contentX1, headerY + 56);
  p.noStroke();

  const template = ui.template || 'manifesto';
  if (template === 'speaker') {
    drawSpeaker(p, ctx, { fg, dim, colA, contentW, M });
  } else {
    drawManifesto(p, ctx, { fg, dim, colA, contentW, M });
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
  const { fg, dim, colA, contentW, M } = opts;
  const { ui, H } = ctx;

  p.textFont('JetBrains Mono');
  p.textStyle(p.BOLD);
  p.fill(fg);
  p.textSize(SIZE_H1);
  p.textLeading(SIZE_H1 * 0.94);
  p.textAlign(p.LEFT, p.TOP);
  p.text(ui.title || 'AI Дизайн\nДемо', colA, M + 108);

  const divY = H * 0.5;
  p.stroke(fg, 100);
  p.strokeWeight(1);
  p.line(colA, divY, colA + contentW, divY);
  p.noStroke();

  const subTop = divY + 30;
  p.textStyle(p.BOLD);
  p.textSize(SIZE_META);
  p.fill(dim);
  p.textAlign(p.LEFT, p.TOP);
  p.text('О ФОРМАТЕ', colA, subTop);

  // Subtitle in 2/3 width
  const subW = Math.floor(contentW * (2 / 3));
  p.textStyle(p.NORMAL);
  p.textSize(SIZE_BODY);
  p.textLeading(SIZE_BODY * 1.22);
  p.fill(fg);
  const manifestoDefault =
    'Разбираем реальные задачи дизайн-функции Фантеха и показываем, как AI помогает их решать.';
  p.text(ui.subtitle || manifestoDefault, colA, subTop + 30, subW);
}

// ---- Speaker: small title at top, HUGE speaker + topic block BOTTOM-anchored ----
function drawSpeaker(p, ctx, opts) {
  const { fg, dim, colA, contentW, M } = opts;
  const { ui, H } = ctx;

  // Small title (~3× smaller than manifesto)
  p.textFont('JetBrains Mono');
  p.textStyle(p.BOLD);
  p.fill(fg);
  p.textSize(SIZE_BODY);
  p.textLeading(SIZE_BODY * 1.05);
  p.textAlign(p.LEFT, p.TOP);
  const collapsedTitle = (ui.title || 'AI Дизайн Демо').replace(/\n/g, ' ');
  p.text(collapsedTitle, colA, M + 108);

  const divY = M + 108 + SIZE_BODY + 24;
  p.stroke(fg, 100);
  p.strokeWeight(1);
  p.line(colA, divY, colA + contentW, divY);
  p.noStroke();

  // Bottom-anchored speaker + topic block — grows upward from just above the strip.
  // Layout order from bottom to top: Speaker line, СПИКЕР label, Topic line, ТЕМА label.
  const PAD = 26;
  const stripTop = H - M - PAD - 116;
  const gapAboveStrip = 30;
  const labelGap = 8;
  const blockGap = 28;

  const speakerLine = ui.speaker || 'Имя Фамилия, Команда';
  const topicLine = ui.topic || 'Тема выступления';

  const speakerH = estimateWrappedHeight(speakerLine, contentW, SIZE_H2, SIZE_H2 * 0.98);
  const topicH = estimateWrappedHeight(topicLine, contentW, SIZE_H2, SIZE_H2 * 0.98);

  const speakerY = stripTop - gapAboveStrip - speakerH;
  const speakerLabelY = speakerY - SIZE_META - labelGap;
  const topicY = speakerLabelY - blockGap - topicH;
  const topicLabelY = topicY - SIZE_META - labelGap;

  // Topic
  p.textStyle(p.BOLD);
  p.textSize(SIZE_META);
  p.fill(dim);
  p.textAlign(p.LEFT, p.TOP);
  p.text('ТЕМА', colA, topicLabelY);

  p.textStyle(p.BOLD);
  p.textSize(SIZE_H2);
  p.textLeading(SIZE_H2 * 0.98);
  p.fill(fg);
  p.text(topicLine, colA, topicY, contentW);

  // Speaker
  p.textStyle(p.BOLD);
  p.textSize(SIZE_META);
  p.fill(dim);
  p.text('СПИКЕР', colA, speakerLabelY);

  p.textStyle(p.BOLD);
  p.textSize(SIZE_H2);
  p.textLeading(SIZE_H2 * 0.98);
  p.fill(fg);
  p.text(speakerLine, colA, speakerY, contentW);
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
