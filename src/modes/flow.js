import { sampleCameraLuminance, drawCameraCover } from '../camera.js';

export function init(p, ctx) {
  const N = 6500;
  ctx.flow = {
    particles: Array.from({ length: N }, () => ({
      x: Math.random() * ctx.W,
      y: Math.random() * ctx.H,
      px: 0,
      py: 0,
      life: Math.random() * 260,
    })),
    t: 0,
  };
}

export function draw(p, ctx) {
  const s = ctx.flow;
  const fg = ctx.ui.invert ? 15 : 240;
  const bg = ctx.ui.invert ? 240 : 15;

  // Base fill
  p.noStroke();
  p.fill(bg);
  p.rect(0, 0, ctx.W, ctx.H);

  const cameraSensing = ctx.ui.cameraMode !== 'off' && ctx.camera.frameReady;
  const cameraVisible = ctx.ui.cameraMode === 'visible' && ctx.camera.frameReady;

  // Camera underlay — ONLY in Visible mode (grayscale pre-processed in camera.js)
  if (cameraVisible) {
    drawCameraCover(p, ctx, { alpha: 0.55 });
  }

  // Trail fade
  p.fill(bg, 22);
  p.rect(0, 0, ctx.W, ctx.H);

  s.t += 0.005;
  const amp = ctx.audio.amplitude * ctx.ui.audioSensitivity;
  const eps = 0.02;

  for (const q of s.particles) {
    q.px = q.x;
    q.py = q.y;

    // Baseline Perlin flow — same density/speed with or without camera.
    const n = p.noise(q.x * 0.0018, q.y * 0.0018, s.t);
    const a = n * Math.PI * 4;
    const spd = 1.7 + amp * 8;
    let dxFlow = Math.cos(a) * spd;
    let dyFlow = Math.sin(a) * spd;

    // Luminance-driven attraction — particles gather on the emphasis side
    // (bright side in normal palette, dark side when inverted). Mild pull that
    // reads clearly but doesn't crush the flow.
    let emphasis = 0.55;
    if (cameraSensing) {
      const u = q.x / ctx.W;
      const v = q.y / ctx.H;
      const lum = sampleCameraLuminance(u, v);
      emphasis = ctx.ui.invert ? 1 - lum : lum;

      if (emphasis > 0.3) {
        const lx = sampleCameraLuminance(u + eps, v) - sampleCameraLuminance(u - eps, v);
        const ly = sampleCameraLuminance(u, v + eps) - sampleCameraLuminance(u, v - eps);
        const sign = ctx.ui.invert ? -1 : 1;
        const pull = Math.min(0.85, (emphasis - 0.3) * 1.8);
        dxFlow += lx * pull * sign * 55;
        dyFlow += ly * pull * sign * 55;
      }
    }

    q.x += dxFlow;
    q.y += dyFlow;

    p.strokeWeight(0.4 + emphasis * 3.4);
    p.stroke(fg, 45 + emphasis * 220);
    p.line(q.px, q.py, q.x, q.y);

    q.life -= 1;
    if (q.life <= 0 || q.x < -20 || q.x > ctx.W + 20 || q.y < -20 || q.y > ctx.H + 20) {
      q.x = Math.random() * ctx.W;
      q.y = Math.random() * ctx.H;
      q.life = 140 + Math.random() * 240;
    }
  }
}

export function cleanup() {}
