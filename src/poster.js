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

  // ===== HEADER =====
  const headerY = M + 30;
  p.textFont('JetBrains Mono');
  p.textStyle(p.BOLD);
  p.textAlign(p.LEFT, p.TOP);
  p.textSize(17);
  p.fill(fg);
  p.text('◐  ' + ui.edition, colA, headerY);
  p.text(nowStamp(), colB2, headerY);

  p.textStyle(p.NORMAL);
  p.textSize(13);
  p.fill(dim);
  p.text('N° ' + pad3(Math.floor(p.frameCount / 6) % 999), colA, headerY + 26);
  p.text('LIVE · GEN · ' + serial(), colB2, headerY + 26);

  // Rule under header
  p.stroke(fg, 90);
  p.strokeWeight(1);
  p.line(colA, headerY + 54, contentX1, headerY + 54);
  p.noStroke();

  // ===== TITLE =====
  p.textFont('Space Grotesk');
  p.textStyle(p.BOLD);
  p.fill(fg);
  const titleSize = 158;
  p.textSize(titleSize);
  p.textLeading(titleSize * 0.92);
  p.textAlign(p.LEFT, p.TOP);
  p.text(ui.title, colA, M + 108);

  // Rule under title area
  const divY = H * 0.5;
  p.stroke(fg, 100);
  p.strokeWeight(1);
  p.line(colA, divY, contentX1, divY);
  p.noStroke();

  // ===== AGENDA — variable layout (cycles every ~10s) =====
  if (ui.showTopics) {
    drawAgenda(p, ctx, {
      x0: colA,
      x1: contentX1,
      yTop: divY + 30,
      contentW,
      GUTTER,
      fg,
      dim,
    });
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

  // TIMECODE / FRAME row
  p.textFont('JetBrains Mono');
  p.textStyle(p.BOLD);
  p.textAlign(p.LEFT, p.TOP);
  p.textSize(12);
  p.fill(dim);
  p.text('TIMECODE', colA, stripTopY);
  p.text('FRAME', colB2, stripTopY);
  p.textStyle(p.NORMAL);
  p.textSize(19);
  p.fill(fg);
  p.text(timecode(), colA + 92, stripTopY - 3);
  p.text(pad5(p.frameCount), colB2 + 66, stripTopY - 3);

  // EQ bars
  drawEqualizer(p, ctx, colA, eqY, contentW, eqH, fg);

  // Rule below strip
  const stripBottomY = eqY + eqH + 8;
  p.stroke(fg, 100);
  p.strokeWeight(1);
  p.line(colA, stripBottomY, contentX1, stripBottomY);
  p.noStroke();

  // ===== FOOTER =====
  const footerY = H - M - PAD;
  p.textFont('JetBrains Mono');
  p.textStyle(p.BOLD);
  p.textAlign(p.LEFT, p.BOTTOM);
  p.textSize(15);
  p.fill(fg);
  p.text('OPEN CALL · DESIGN CHAPTER', colA, footerY);
  p.textStyle(p.NORMAL);
  p.fill(dim);
  p.text('AI · DESIGN · DEMO', colB2, footerY);

  p.pop();
}

// ---- AGENDA variants (auto-cycle every 300 frames = ~10s @ 30fps) ----
// Font size stays constant across variants — only column count + position shifts.
const AGENDA_SIZE = 17;
const AGENDA_LEADING = 26;
const AGENDA_LABEL_SIZE = 12;

function drawAgenda(p, ctx, opts) {
  const { x0, x1, yTop, contentW, GUTTER, fg, dim } = opts;
  const variant = Math.floor(p.frameCount / 300) % 2;

  const items = (ctx.ui.topicsText || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const cfg = {
    0: { cols: 2, xShift: 24 },
    1: { cols: 1, xShift: 68 },
  }[variant];

  p.textFont('JetBrains Mono');
  p.textAlign(p.LEFT, p.TOP);

  const label = `AGENDA · v${variant + 1} · ${cfg.cols}-COL`;
  p.textStyle(p.BOLD);
  p.textSize(AGENDA_LABEL_SIZE);
  p.fill(dim);
  p.text(label, x0 + cfg.xShift, yTop);

  const cols = cfg.cols;
  const usableW = contentW - cfg.xShift;
  const colW = (usableW - GUTTER * (cols - 1)) / cols;
  const itemsPerCol = Math.ceil(items.length / cols);
  const contentTop = yTop + AGENDA_LABEL_SIZE + 14;

  p.textStyle(p.NORMAL);
  p.textSize(AGENDA_SIZE);
  p.textLeading(AGENDA_LEADING);
  p.fill(fg);

  for (let c = 0; c < cols; c++) {
    const items_col = items.slice(c * itemsPerCol, (c + 1) * itemsPerCol);
    const colX = x0 + cfg.xShift + c * (colW + GUTTER);
    const colText = items_col.join('\n');
    p.text(colText, colX, contentTop, colW);
  }
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
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}·${pad(d.getMonth() + 1)}·${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function timecode() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ms = String(Math.floor(d.getMilliseconds() / 10)).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`;
}

function pad3(n) {
  return String(n).padStart(3, '0');
}
function pad5(n) {
  return String(n).padStart(5, '0');
}

const SERIAL = Math.floor(Math.random() * 900 + 100).toString(36).toUpperCase();
function serial() {
  return SERIAL;
}
