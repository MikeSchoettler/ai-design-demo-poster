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
  p.textFont('Roboto Mono');
  p.textStyle(p.BOLD);
  p.textAlign(p.LEFT, p.TOP);
  p.textSize(17);
  p.fill(fg);
  p.text(ui.logo || 'Фантех', colA, headerY);

  p.textAlign(p.RIGHT, p.TOP);
  p.text((ui.exchange || 'ОБМЕН ОПЫТОМ').toUpperCase(), contentX1, headerY);

  // Sub-header row: edition / date
  p.textStyle(p.NORMAL);
  p.textSize(13);
  p.fill(dim);
  p.textAlign(p.LEFT, p.TOP);
  p.text(ui.edition || 'SESSION · 01', colA, headerY + 26);
  p.textAlign(p.RIGHT, p.TOP);
  p.text(ui.date || nowStamp(), contentX1, headerY + 26);

  p.stroke(fg, 90);
  p.strokeWeight(1);
  p.line(colA, headerY + 54, contentX1, headerY + 54);
  p.noStroke();

  // ===== TITLE =====
  p.textFont('Roboto Mono');
  p.textStyle(p.BOLD);
  p.fill(fg);
  const titleSize = 148;
  p.textSize(titleSize);
  p.textLeading(titleSize * 0.92);
  p.textAlign(p.LEFT, p.TOP);
  p.text(ui.title || 'AI Дизайн\nДемо', colA, M + 108);

  // ===== SUBTITLE / SPEAKER BLOCK =====
  const divY = H * 0.5;
  p.stroke(fg, 100);
  p.strokeWeight(1);
  p.line(colA, divY, contentX1, divY);
  p.noStroke();

  const subTop = divY + 30;
  p.textFont('Roboto Mono');
  p.textAlign(p.LEFT, p.TOP);

  if ((ui.template || 'manifesto') === 'speaker') {
    // Speaker template: name + team, then topic
    p.textStyle(p.BOLD);
    p.textSize(13);
    p.fill(dim);
    p.text('СПИКЕР', colA, subTop);

    p.textStyle(p.NORMAL);
    p.textSize(24);
    p.textLeading(32);
    p.fill(fg);
    const speakerLine = [ui.speaker || 'Имя Фамилия', ui.team || 'Команда']
      .filter(Boolean)
      .join(', ');
    p.text(speakerLine, colA, subTop + 22, contentW);

    p.textStyle(p.BOLD);
    p.textSize(13);
    p.fill(dim);
    p.text('ТЕМА', colA, subTop + 88);

    p.textStyle(p.NORMAL);
    p.textSize(24);
    p.textLeading(32);
    p.fill(fg);
    p.text(ui.topic || 'Тема выступления', colA, subTop + 110, contentW);
  } else {
    // Manifesto template: multi-line description
    p.textStyle(p.BOLD);
    p.textSize(13);
    p.fill(dim);
    p.text('О ФОРМАТЕ', colA, subTop);

    p.textStyle(p.NORMAL);
    p.textSize(24);
    p.textLeading(34);
    p.fill(fg);
    const manifestoDefault =
      'Разбираем реальные задачи дизайн-функции Фантеха и показываем, как AI помогает их решать.';
    p.text(ui.subtitle || manifestoDefault, colA, subTop + 22, contentW);
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

  p.textFont('Roboto Mono');
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

  drawEqualizer(p, ctx, colA, eqY, contentW, eqH, fg);

  const stripBottomY = eqY + eqH + 8;
  p.stroke(fg, 100);
  p.strokeWeight(1);
  p.line(colA, stripBottomY, contentX1, stripBottomY);
  p.noStroke();

  // ===== FOOTER — крошки внизу =====
  const footerY = H - M - PAD;
  p.textFont('Roboto Mono');
  p.textStyle(p.BOLD);
  p.textAlign(p.LEFT, p.BOTTOM);
  p.textSize(15);
  p.fill(fg);
  p.text((ui.exchange || 'ОБМЕН ОПЫТОМ').toUpperCase(), colA, footerY);
  p.textAlign(p.RIGHT, p.BOTTOM);
  p.textStyle(p.NORMAL);
  p.fill(dim);
  p.text('AI · ДИЗАЙН · ДЕМО', contentX1, footerY);

  p.pop();
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
