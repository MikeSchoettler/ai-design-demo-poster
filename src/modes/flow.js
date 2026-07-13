import { drawCameraCover } from '../camera.js';

export function init(p, ctx) {
  const N = 3500;
  ctx.flow = {
    particles: Array.from({ length: N }, () => ({
      x: Math.random() * ctx.W,
      y: Math.random() * ctx.H,
      px: 0,
      py: 0,
      life: Math.random() * 260,
    })),
    t: 0,
    ampSmoothed: 0,
    ampPeak: 0, // for the meter
  };
}

export function draw(p, ctx) {
  const s = ctx.flow;
  const fg = ctx.ui.invert ? 15 : 240;
  const bg = ctx.ui.invert ? 240 : 15;
  const cameraVisible = ctx.ui.cameraMode === 'visible' && ctx.camera.frameReady;

  p.background(bg);

  if (cameraVisible) {
    drawCameraCover(p, ctx, { alpha: 0.24 });
  }

  // Trail fade
  p.noStroke();
  p.fill(bg, 24);
  p.rect(0, 0, ctx.W, ctx.H);

  s.t += 0.005;
  const rawAmp = ctx.audio.amplitude * ctx.ui.audioSensitivity;
  s.ampSmoothed = s.ampSmoothed * 0.78 + rawAmp * 0.22;
  const amp = s.ampSmoothed;
  s.ampPeak = Math.max(s.ampPeak * 0.985, amp);

  // ==== Perlin flow — speed and stroke scale with amp ====
  const speedMult = 1 + amp * 9;
  for (const q of s.particles) {
    q.px = q.x;
    q.py = q.y;
    const n = p.noise(q.x * 0.0018, q.y * 0.0018, s.t);
    const a = n * Math.PI * 4;
    const spd = 1.5 * speedMult;
    q.x += Math.cos(a) * spd;
    q.y += Math.sin(a) * spd;
    p.strokeWeight(0.4 + amp * 3.5);
    p.stroke(fg, 40 + amp * 200);
    p.line(q.px, q.py, q.x, q.y);
    q.life -= 1;
    if (q.life <= 0 || q.x < 0 || q.x > ctx.W || q.y < 0 || q.y > ctx.H) {
      q.x = Math.random() * ctx.W;
      q.y = Math.random() * ctx.H;
      q.life = 140 + Math.random() * 240;
    }
  }

  // ==== VOICE-REACTIVE HERO TYPOGRAPHY ====
  // Content depends on active template so it matches the "important info".
  const isSpeaker = (ctx.ui.template || 'manifesto') === 'speaker';
  const heroText = isSpeaker
    ? (ctx.ui.topic || 'Тема выступления')
    : (ctx.ui.subtitle ||
       'Разбираем реальные задачи дизайн-функции Фантеха и показываем, как AI помогает их решать.');

  const THRESHOLD = 0.04;
  const MAX_SIZE = 76;
  const rampAmp = Math.max(0, amp - THRESHOLD);
  const size = Math.min(1, rampAmp * 6) * MAX_SIZE;
  const alpha = Math.min(1, rampAmp * 7) * 245;

  if (size > 6) {
    p.push();
    p.textFont('JetBrains Mono');
    p.textStyle(p.BOLD);
    p.textSize(size);
    p.textLeading(size * 1.08);
    p.textAlign(p.CENTER, p.CENTER);
    p.noStroke();
    p.fill(fg, alpha);
    // Anchor in the middle band between title and instrument strip
    const boxX = ctx.W * 0.08;
    const boxW = ctx.W * 0.84;
    const boxY = ctx.H * 0.28;
    const boxH = ctx.H * 0.5;
    p.text(heroText, boxX, boxY, boxW, boxH);
    p.pop();
  }

  // Silence prompt — pulsing dot + text in the middle when amp is low
  if (amp < THRESHOLD) {
    p.textFont('JetBrains Mono');
    p.textStyle(p.BOLD);
    p.textSize(16);
    p.textAlign(p.CENTER, p.CENTER);
    const pulse = 0.4 + Math.sin(s.t * 7) * 0.35;
    p.noStroke();
    p.fill(fg, pulse * 160);
    p.text('◌ КРИКНИ «ФАНТЕХ»', ctx.W / 2, ctx.H / 2);
  }

  // ==== Amp meter — thin vertical bar on the right ====
  const meterX = ctx.W - 68;
  const meterY = ctx.H * 0.32;
  const meterH = ctx.H * 0.4;
  const barW = 6;
  p.noStroke();
  p.fill(fg, 40);
  p.rect(meterX, meterY, barW, meterH);
  const fillH = Math.min(1, amp * 3) * meterH;
  p.fill(fg, 220);
  p.rect(meterX, meterY + meterH - fillH, barW, fillH);
  // Peak tick
  const peakY = meterY + meterH - Math.min(1, s.ampPeak * 3) * meterH;
  p.fill(fg);
  p.rect(meterX - 3, peakY - 1, barW + 6, 2);
  // Threshold marker
  const thY = meterY + meterH - Math.min(1, THRESHOLD * 3) * meterH;
  p.fill(fg, 100);
  p.rect(meterX - 2, thY - 0.5, barW + 4, 1);
  p.fill(fg, 140);
  p.textFont('JetBrains Mono');
  p.textStyle(p.NORMAL);
  p.textSize(9);
  p.textAlign(p.CENTER, p.TOP);
  p.text('VOL', meterX + barW / 2, meterY + meterH + 8);
}

export function cleanup() {}
