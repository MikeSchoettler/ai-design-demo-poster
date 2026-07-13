import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { drawCameraCover, cameraState } from '../camera.js';

const NUM_COLUMNS = 26;
const NUM_PARTICLES = 22000;

export function init(p, ctx) {
  ctx.face = {
    t: 0,
    mouthPulse: 0,
    headPrev: null,
    headVel: { x: 0, y: 0 },
    laserDir: { x: 1, y: 0 },
    columnIntensityPhase: Math.random() * 100,
    particles: Array.from({ length: NUM_PARTICLES }, () => ({
      col: Math.floor(Math.random() * NUM_COLUMNS),
      // triangular distribution ~ gaussian centered at 0 → spine density in center
      xJit: (Math.random() + Math.random() + Math.random() - 1.5) * 0.75,
      y: Math.random() * ctx.H,
      vy: 0.5 + Math.random() * 1.8,
      size: 1.2 + Math.random() * 1.6,
    })),
  };
}

export function draw(p, ctx) {
  const fg = ctx.ui.invert ? 15 : 240;
  const bg = ctx.ui.invert ? 240 : 15;
  p.background(bg);

  ctx.face.t += 0.008;
  const t = ctx.face.t;
  const amp = ctx.audio.amplitude * ctx.ui.audioSensitivity;
  const face = ctx.camera.faceLandmarks?.[0];

  // ==== Compute face bbox / oval BEFORE drawing so we can mask ====
  let faceOval = null;
  let project = null;
  let scale = 0;
  let midX = 0, midY = 0, minY = 0, maxY = 0.3;

  if (face) {
    let minX = 1, maxX = 0;
    minY = 1; maxY = 0;
    for (const lm of face) {
      if (lm.x < minX) minX = lm.x;
      if (lm.x > maxX) maxX = lm.x;
      if (lm.y < minY) minY = lm.y;
      if (lm.y > maxY) maxY = lm.y;
    }
    const fw = maxX - minX || 0.3;
    const target = ctx.W * 0.5; // slightly smaller
    scale = target / fw;
    const cx = ctx.W / 2;
    const cyPos = ctx.H * 0.58; // moved UP (was 0.66)
    midX = (minX + maxX) / 2;
    midY = (minY + maxY) / 2;
    project = (lm) => ({
      x: cx - (lm.x - midX) * scale,
      y: cyPos + (lm.y - midY) * scale,
    });
    const faceRx = (target / 2) * 1.1;
    const faceRy = faceRx * 1.28;
    faceOval = { cx, cy: cyPos, rx: faceRx, ry: faceRy };
  }

  // ==== VISIBLE mode: dim full-canvas camera under everything (no oval clip) ====
  if (ctx.ui.cameraMode === 'visible') {
    drawCameraCover(p, ctx, { alpha: 0.28 });
  }

  // ==== Vertical light columns (main graphic — skips face oval) ====
  drawLightColumns(p, ctx, faceOval, amp, fg);

  if (!face) {
    p.fill(fg, 220);
    p.noStroke();
    p.textFont('JetBrains Mono');
    p.textSize(14);
    p.textAlign(p.CENTER, p.CENTER);
    p.text('◌ NO FACE — LEAN INTO FRAME', ctx.W / 2, ctx.H * 0.6 + 260);
    return;
  }

  // Mouth openness (13/14)
  const upperLip = face[13];
  const lowerLip = face[14];
  const mouthDist = Math.abs(lowerLip.y - upperLip.y);
  const mouthNorm = mouthDist / (maxY - minY || 0.3);
  const targetPulse = mouthNorm > 0.06 ? Math.min(1, (mouthNorm - 0.06) * 15) : 0;
  ctx.face.mouthPulse = ctx.face.mouthPulse * 0.75 + targetPulse * 0.25;
  const pulse = ctx.face.mouthPulse;

  // Head velocity for laser direction
  const irisL = face[468] || face[33];
  const irisR = face[473] || face[263];
  const bothEyesN = {
    x: (irisL.x + irisR.x) / 2,
    y: (irisL.y + irisR.y) / 2,
  };
  if (ctx.face.headPrev) {
    const dvx = bothEyesN.x - ctx.face.headPrev.x;
    const dvy = bothEyesN.y - ctx.face.headPrev.y;
    ctx.face.headVel.x = ctx.face.headVel.x * 0.82 + dvx * 0.18;
    ctx.face.headVel.y = ctx.face.headVel.y * 0.82 + dvy * 0.18;
  }
  ctx.face.headPrev = { x: bothEyesN.x, y: bothEyesN.y };

  // ==== Face tesselation ====
  p.stroke(fg, 140);
  p.strokeWeight(0.55 + amp * 1.8);
  p.noFill();
  const tess = FaceLandmarker.FACE_LANDMARKS_TESSELATION;
  for (const c of tess) {
    const a = project(face[c.start]);
    const b = project(face[c.end]);
    p.line(a.x, a.y, b.x, b.y);
  }

  const emph = [
    FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
    FaceLandmarker.FACE_LANDMARKS_LIPS,
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
    FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
    FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
  ];
  p.stroke(fg);
  p.strokeWeight(2.2 + amp * 4 + pulse * 4);
  for (const group of emph) {
    if (!group) continue;
    for (const c of group) {
      const a = project(face[c.start]);
      const b = project(face[c.end]);
      p.line(a.x, a.y, b.x, b.y);
    }
  }

  p.noStroke();
  p.fill(fg);
  for (const lm of face) {
    const q = project(lm);
    p.circle(q.x, q.y, 2.2);
  }

  // ==== Eye lasers — with 10° divergence ====
  if (pulse > 0.02) {
    const L = project(irisL);
    const R = project(irisR);
    const eyeAxis = { x: R.x - L.x, y: R.y - L.y };
    const eyeMag = Math.hypot(eyeAxis.x, eyeAxis.y) || 1;
    const eyeN = { x: eyeAxis.x / eyeMag, y: eyeAxis.y / eyeMag };
    const perp = { x: -eyeN.y, y: eyeN.x };

    // Head velocity in screen coords
    const velScreenX = -ctx.face.headVel.x * scale * 60;
    const velScreenY = ctx.face.headVel.y * scale * 60;
    const velMag = Math.hypot(velScreenX, velScreenY);
    if (velMag > 4) {
      const dot = perp.x * velScreenX + perp.y * velScreenY;
      const chosen = dot >= 0 ? perp : { x: -perp.x, y: -perp.y };
      ctx.face.laserDir.x = ctx.face.laserDir.x * 0.6 + chosen.x * 0.4;
      ctx.face.laserDir.y = ctx.face.laserDir.y * 0.6 + chosen.y * 0.4;
      const m = Math.hypot(ctx.face.laserDir.x, ctx.face.laserDir.y) || 1;
      ctx.face.laserDir.x /= m;
      ctx.face.laserDir.y /= m;
    }

    // 10° divergence: rotate L laser by -5°, R laser by +5° from base
    const SPREAD = (5 * Math.PI) / 180;
    const dirL = rotate(ctx.face.laserDir, -SPREAD);
    const dirR = rotate(ctx.face.laserDir, +SPREAD);

    if (pulse > 0.55) {
      p.noStroke();
      p.fill(fg, (pulse - 0.55) * 90);
      p.rect(0, 0, ctx.W, ctx.H);
    }

    drawLaser(p, ctx, L, dirL, pulse, fg);
    drawLaser(p, ctx, R, dirR, pulse, fg);

    p.fill(fg);
    p.noStroke();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + t * 2;
      const r = 26 + Math.sin(t * 4 + i) * 18 + pulse * 40;
      p.circle(L.x + Math.cos(a) * r, L.y + Math.sin(a) * r, 3 + pulse * 4);
      p.circle(R.x + Math.cos(a) * r, R.y + Math.sin(a) * r, 3 + pulse * 4);
    }
    p.fill(fg);
    p.circle(L.x, L.y, 18 + pulse * 26);
    p.circle(R.x, R.y, 18 + pulse * 26);
  }
}

function rotate(v, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

// ==== Vertical light columns of particles — skips face oval ====
function drawLightColumns(p, ctx, faceOval, amp, fg) {
  const s = ctx.face;
  const numCols = NUM_COLUMNS;
  const colW = ctx.W / numCols;
  const t = s.t;

  // Per-column intensity — fast-drifting Perlin for active shifting
  const intensities = new Array(numCols);
  for (let i = 0; i < numCols; i++) {
    const n = p.noise(i * 0.42 + s.columnIntensityPhase, t * 0.85);
    let intensity = Math.pow(n, 1.5) * 1.35;
    intensity += amp * 0.5;
    intensities[i] = Math.min(1.2, intensity);
  }

  p.noStroke();
  const H = ctx.H;
  const rxSq = faceOval ? faceOval.rx * faceOval.rx : 0;
  const rySq = faceOval ? faceOval.ry * faceOval.ry : 0;

  for (let i = 0; i < s.particles.length; i++) {
    const q = s.particles[i];
    q.y += q.vy;
    if (q.y > H + 10) q.y -= H + 20;

    const intensity = intensities[q.col];
    if (intensity < 0.05) continue;

    const cx = q.col * colW + colW / 2;
    const x = cx + q.xJit * colW * 0.9;

    if (faceOval) {
      const dx = x - faceOval.cx;
      const dy = q.y - faceOval.cy;
      if ((dx * dx) / rxSq + (dy * dy) / rySq < 1.0) continue;
    }

    // Spine falloff: dots close to column center are brightest
    const spineFalloff = 1 - Math.min(1, Math.abs(q.xJit) * 1.2);
    const alpha = intensity * spineFalloff;
    if (alpha < 0.05) continue;

    // Boosted alpha rendering + size scales with brightness for glow feel
    const finalAlpha = Math.min(255, alpha * 340);
    const finalSize = q.size * (0.55 + intensity * 1.3);
    p.fill(fg, finalAlpha);
    p.circle(x, q.y, finalSize);
  }

  // Central spines — start earlier (0.45 not 0.72), way brighter
  for (let i = 0; i < numCols; i++) {
    const intensity = intensities[i];
    if (intensity < 0.45) continue;
    const cx = i * colW + colW / 2;
    const strength = (intensity - 0.45) / 0.75;
    p.stroke(fg, 80 + strength * 220);
    p.strokeWeight(0.9 + strength * 3.5);

    if (faceOval) {
      const dxNorm = (cx - faceOval.cx) / faceOval.rx;
      if (Math.abs(dxNorm) < 1) {
        const ovalY = Math.sqrt(1 - dxNorm * dxNorm) * faceOval.ry;
        const yTop = faceOval.cy - ovalY;
        const yBot = faceOval.cy + ovalY;
        p.line(cx, 0, cx, yTop);
        p.line(cx, yBot, cx, H);
      } else {
        p.line(cx, 0, cx, H);
      }
    } else {
      p.line(cx, 0, cx, H);
    }

    // Inner hot core
    if (intensity > 0.75) {
      p.stroke(255);
      p.strokeWeight(1);
      if (faceOval) {
        const dxNorm = (cx - faceOval.cx) / faceOval.rx;
        if (Math.abs(dxNorm) < 1) {
          const ovalY = Math.sqrt(1 - dxNorm * dxNorm) * faceOval.ry;
          p.line(cx, 0, cx, faceOval.cy - ovalY);
          p.line(cx, faceOval.cy + ovalY, cx, H);
        } else {
          p.line(cx, 0, cx, H);
        }
      } else {
        p.line(cx, 0, cx, H);
      }
    }
  }
  p.noStroke();
}

function drawLaser(p, ctx, from, dir, pulse, fg) {
  const dx = dir.x;
  const dy = dir.y;
  let tMax = 4000;
  if (dx > 1e-4) tMax = Math.min(tMax, (ctx.W + 80 - from.x) / dx);
  if (dx < -1e-4) tMax = Math.min(tMax, (-80 - from.x) / dx);
  if (dy > 1e-4) tMax = Math.min(tMax, (ctx.H + 80 - from.y) / dy);
  if (dy < -1e-4) tMax = Math.min(tMax, (-80 - from.y) / dy);
  const endX = from.x + dx * tMax;
  const endY = from.y + dy * tMax;
  const perpX = -dy;
  const perpY = dx;
  const beamCore = 4 + pulse * 8;
  const beamHalo = 40 + pulse * 90;
  const dc = p.drawingContext;
  dc.save();
  const grad = dc.createLinearGradient(from.x, from.y, endX, endY);
  grad.addColorStop(0, `rgba(255,255,255,${0.55 * pulse})`);
  grad.addColorStop(0.4, `rgba(255,255,255,${0.28 * pulse})`);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  dc.fillStyle = grad;
  dc.beginPath();
  dc.moveTo(from.x + perpX * beamHalo * 0.4, from.y + perpY * beamHalo * 0.4);
  dc.lineTo(endX + perpX * beamHalo, endY + perpY * beamHalo);
  dc.lineTo(endX - perpX * beamHalo, endY - perpY * beamHalo);
  dc.lineTo(from.x - perpX * beamHalo * 0.4, from.y - perpY * beamHalo * 0.4);
  dc.closePath();
  dc.fill();
  dc.restore();
  p.stroke(fg);
  p.strokeWeight(beamCore);
  p.line(from.x, from.y, endX, endY);
  p.stroke(255);
  p.strokeWeight(Math.max(1, beamCore * 0.3));
  p.line(from.x, from.y, endX, endY);
  p.noStroke();
  p.fill(fg);
  const sparks = 18;
  for (let i = 0; i < sparks; i++) {
    const tt = i / sparks + Math.random() * 0.04;
    const sx = from.x + (endX - from.x) * tt + (Math.random() - 0.5) * 12;
    const sy = from.y + (endY - from.y) * tt + (Math.random() - 0.5) * 12;
    p.circle(sx, sy, 2 + Math.random() * 3);
  }
}

export function cleanup() {}
