import { drawCameraCover, sampleCameraLuminance } from '../camera.js';

export function init(p, ctx) {
  const N = 3600;
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
    ampPeak: 0,
  };
}

export function draw(p, ctx) {
  const s = ctx.flow;
  const fg = ctx.ui.invert ? 15 : 240;
  const bg = ctx.ui.invert ? 240 : 15;
  const cameraVisible = ctx.ui.cameraMode === 'visible' && ctx.camera.frameReady;
  const cameraSensing = ctx.ui.cameraMode !== 'off' && ctx.camera.frameReady;

  p.background(bg);

  if (cameraVisible) {
    drawCameraCover(p, ctx, { alpha: 0.24 });
  }

  // Trail fade
  p.noStroke();
  p.fill(bg, 28);
  p.rect(0, 0, ctx.W, ctx.H);

  s.t += 0.005;
  const rawAmp = ctx.audio.amplitude * ctx.ui.audioSensitivity;
  s.ampSmoothed = s.ampSmoothed * 0.78 + rawAmp * 0.22;
  const amp = s.ampSmoothed;
  s.ampPeak = Math.max(s.ampPeak * 0.985, amp);

  // Voice scale from poster (0 at silence, 1 at 75% loudness, up to ~1.18 over-shout)
  const scale = (ctx.voice && ctx.voice.scale) || 0;

  // Central "text zone" — where the poster's title / subtitle / speaker block sits.
  // Particles are pushed OUT of this rectangle when text starts to appear.
  const tzX = ctx.W * 0.08;
  const tzY = ctx.H * 0.14;
  const tzW = ctx.W * 0.84;
  const tzH = ctx.H * 0.6;
  const tzCx = tzX + tzW / 2;
  const tzCy = tzY + tzH / 2;

  // ==== Particle update — Perlin + camera silhouette repel + text-zone repel + vibrate ====
  const speedMult = 1 + amp * 5;
  const eps = 0.02;
  for (const q of s.particles) {
    q.px = q.x;
    q.py = q.y;

    const n = p.noise(q.x * 0.0018, q.y * 0.0018, s.t);
    const a = n * Math.PI * 4;
    const spd = 1.4 * speedMult;
    let dx = Math.cos(a) * spd;
    let dy = Math.sin(a) * spd;

    // Camera silhouette repulsion — bright pixels (person's face/body) push particles away
    if (cameraSensing) {
      const u = q.x / ctx.W;
      const v = q.y / ctx.H;
      const lum = sampleCameraLuminance(u, v);
      if (lum > 0.4) {
        const lx = sampleCameraLuminance(u + eps, v) - sampleCameraLuminance(u - eps, v);
        const ly = sampleCameraLuminance(u, v + eps) - sampleCameraLuminance(u, v - eps);
        const push = (lum - 0.4) * 32;
        dx -= lx * push;
        dy -= ly * push;
      }
    }

    // Text-zone repel — particles feel the typography and scatter
    if (scale > 0.05) {
      const inZone = q.x > tzX && q.x < tzX + tzW && q.y > tzY && q.y < tzY + tzH;
      if (inZone) {
        const rx = q.x - tzCx;
        const ry = q.y - tzCy;
        const rd = Math.sqrt(rx * rx + ry * ry) + 1;
        const push = scale * 3.5;
        dx += (rx / rd) * push;
        dy += (ry / rd) * push;
      }
    }

    // Vibration — jitter proportional to voice intensity
    if (scale > 0.1) {
      const vib = scale * 3;
      dx += (Math.random() - 0.5) * vib;
      dy += (Math.random() - 0.5) * vib;
    }

    q.x += dx;
    q.y += dy;

    // Draw the trail — thicker + brighter as voice rises
    p.strokeWeight(0.4 + amp * 3 + scale * 1.4);
    p.stroke(fg, 55 + amp * 180 + scale * 55);
    p.line(q.px, q.py, q.x, q.y);

    q.life -= 1;
    if (q.life <= 0 || q.x < 0 || q.x > ctx.W || q.y < 0 || q.y > ctx.H) {
      q.x = Math.random() * ctx.W;
      q.y = Math.random() * ctx.H;
      q.life = 140 + Math.random() * 240;
    }
  }

  // ==== Electric arcs — random particle pairs zap when voice is loud enough ====
  if (scale > 0.4) {
    const numArcs = Math.floor((scale - 0.4) * 40);
    p.noFill();
    p.stroke(fg, 210);
    p.strokeWeight(1);
    for (let i = 0; i < numArcs; i++) {
      const a = s.particles[Math.floor(Math.random() * s.particles.length)];
      const b = s.particles[Math.floor(Math.random() * s.particles.length)];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 12 || d > 90) continue;
      drawJaggedArc(p, a.x, a.y, b.x, b.y);
    }
  }

  // ==== Silence prompt — moved lower so it doesn't collide with the centered mode-hint ====
  if (amp < 0.025) {
    p.textFont('JetBrains Mono');
    p.textStyle(p.BOLD);
    p.textSize(16);
    p.textAlign(p.CENTER, p.CENTER);
    const pulse = 0.4 + Math.sin(s.t * 7) * 0.35;
    p.noStroke();
    p.fill(fg, pulse * 160);
    p.text('◌ КРИКНИ «ФАНТЕХ»', ctx.W / 2, ctx.H * 0.86);
  }

  // ==== VOL meter — vertical bar on the right ====
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
  const peakY = meterY + meterH - Math.min(1, s.ampPeak * 3) * meterH;
  p.fill(fg);
  p.rect(meterX - 3, peakY - 1, barW + 6, 2);
  const thY = meterY + meterH - Math.min(1, 0.025 * 3) * meterH;
  p.fill(fg, 100);
  p.rect(meterX - 2, thY - 0.5, barW + 4, 1);
  p.fill(fg, 140);
  p.textFont('JetBrains Mono');
  p.textStyle(p.NORMAL);
  p.textSize(9);
  p.textAlign(p.CENTER, p.TOP);
  p.text('VOL', meterX + barW / 2, meterY + meterH + 8);
}

function drawJaggedArc(p, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.sqrt(dx * dx + dy * dy) + 1;
  const nx = -dy / d;
  const ny = dx / d;
  const segs = 4;
  p.beginShape();
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const j = s === 0 || s === segs ? 0 : (Math.random() - 0.5) * 9;
    p.vertex(x1 + dx * t + nx * j, y1 + dy * t + ny * j);
  }
  p.endShape();
}

export function cleanup() {}
