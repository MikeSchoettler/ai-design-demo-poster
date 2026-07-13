import { drawCameraCover } from '../camera.js';

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
const FINGERTIPS = [4, 8, 12, 16, 20];
const KNUCKLES = [2, 5, 9, 13, 17];
const PALM_LANDMARKS = [0, 5, 9, 13, 17];

function palmCenterPt(pts) {
  let sx = 0, sy = 0;
  for (const i of PALM_LANDMARKS) {
    sx += pts[i].x;
    sy += pts[i].y;
  }
  return { x: sx / PALM_LANDMARKS.length, y: sy / PALM_LANDMARKS.length };
}

export function init(p, ctx) {
  const N = 9000;
  ctx.hand = {
    particles: Array.from({ length: N }, () => ({
      x: Math.random() * ctx.W,
      y: Math.random() * ctx.H,
      vx: 0,
      vy: 0,
      alive: false,
      age: 0,
    })),
    t: 0,
  };
}

export function draw(p, ctx) {
  const s = ctx.hand;
  const fg = ctx.ui.invert ? 15 : 240;
  const bg = ctx.ui.invert ? 240 : 15;

  p.background(bg);

  // Camera underlay ONLY in Visible mode (pre-processed grayscale)
  if (ctx.ui.cameraMode === 'visible') {
    drawCameraCover(p, ctx, { alpha: 0.45 });
  }

  // Trail fade
  p.noStroke();
  p.fill(bg, 55);
  p.rect(0, 0, ctx.W, ctx.H);

  s.t += 0.007;
  const t = s.t;
  const amp = ctx.audio.amplitude * ctx.ui.audioSensitivity;
  const hands = ctx.camera.handLandmarks;

  // ALL detected hands = emitters
  const emitters = [];
  if (hands && hands.length > 0) {
    for (const h of hands) {
      const pts = h.map((lm) => ({ x: (1 - lm.x) * ctx.W, y: lm.y * ctx.H }));
      const palm = palmCenterPt(pts);
      emitters.push({ h, pts, palm });
    }
  }

  // ===== Age particles =====
  const MAX_AGE = 320;
  for (let i = 0; i < s.particles.length; i++) {
    const q = s.particles[i];
    if (!q.alive) continue;
    q.age++;
    if (q.age > MAX_AGE) q.alive = false;
  }

  // ===== Spawn from all emitter palm centers =====
  if (emitters.length > 0) {
    const totalBudget = 130;
    const perHand = Math.max(1, Math.floor(totalBudget / emitters.length));
    for (const em of emitters) {
      const E = em.palm;
      let spawned = 0;
      for (let i = 0; i < s.particles.length; i++) {
        const q = s.particles[i];
        if (q.alive) continue;
        if (spawned >= perHand) break;
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 24;
        q.x = E.x + Math.cos(angle) * dist;
        q.y = E.y + Math.sin(angle) * dist;
        const spd = 2 + Math.random() * 5 + amp * 3;
        q.vx = Math.cos(angle) * spd;
        q.vy = Math.sin(angle) * spd;
        q.alive = true;
        q.age = 0;
        spawned++;
      }
    }
  }

  // Fingertip repellers on all hands
  const repels = [];
  const REPEL_R = 190;
  if (hands) {
    for (const h of hands) {
      for (const idx of FINGERTIPS) {
        const tip = h[idx];
        repels.push({
          x: (1 - tip.x) * ctx.W,
          y: tip.y * ctx.H,
          r: REPEL_R,
          strength: 6.5,
        });
      }
    }
  }

  // Update + draw alive particles
  const maxSpeed = 14;
  p.noStroke();
  let aliveCount = 0;
  for (let i = 0; i < s.particles.length; i++) {
    const q = s.particles[i];
    if (!q.alive) continue;
    aliveCount++;

    const nx = p.noise(q.x * 0.0016, q.y * 0.0016, t) * Math.PI * 4;
    q.vx += Math.cos(nx) * 0.11;
    q.vy += Math.sin(nx) * 0.11;

    for (let k = 0; k < repels.length; k++) {
      const R = repels[k];
      const dx = q.x - R.x;
      const dy = q.y - R.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 1;
      if (d < R.r) {
        const falloff = 1 - d / R.r;
        const f = R.strength * falloff * falloff;
        q.vx += (dx / d) * f;
        q.vy += (dy / d) * f;
      }
    }

    const spd = Math.sqrt(q.vx * q.vx + q.vy * q.vy);
    if (spd > maxSpeed) {
      q.vx = (q.vx / spd) * maxSpeed;
      q.vy = (q.vy / spd) * maxSpeed;
    }

    q.vx *= 0.948;
    q.vy *= 0.948;
    q.x += q.vx;
    q.y += q.vy;

    if (q.x < -30 || q.x > ctx.W + 30 || q.y < -30 || q.y > ctx.H + 30) {
      q.alive = false;
      continue;
    }

    const lifeRatio = 1 - q.age / MAX_AGE;
    const rad = 1.0 + Math.min(5, spd) * 0.42 + amp * 3;
    p.fill(fg, 90 + lifeRatio * 165);
    p.circle(q.x, q.y, rad);
  }

  // ===== Skeletons + role indicators =====
  if (emitters.length === 0) {
    p.fill(fg, 200);
    p.textFont('Roboto Mono');
    p.textSize(14);
    p.textAlign(p.CENTER, p.CENTER);
    p.text('◌ SHOW HANDS · BOTH PALMS EMIT PARTICLES', ctx.W / 2, ctx.H - 260);
    return;
  }

  // Draw skeleton + push rings for each hand
  for (const em of emitters) {
    const pts = em.pts;
    p.stroke(fg, 220);
    p.strokeWeight(3.2);
    for (const [a, b] of HAND_CONNECTIONS) {
      p.line(pts[a].x, pts[a].y, pts[b].x, pts[b].y);
    }
    p.stroke(fg);
    p.strokeWeight(1.2);
    for (const [a, b] of HAND_CONNECTIONS) {
      p.line(pts[a].x, pts[a].y, pts[b].x, pts[b].y);
    }
    p.noStroke();
    p.fill(fg);
    for (const idx of KNUCKLES) p.circle(pts[idx].x, pts[idx].y, 12);

    for (const idx of FINGERTIPS) {
      const q = pts[idx];
      p.noFill();
      p.stroke(fg, 90);
      p.strokeWeight(1);
      p.circle(q.x, q.y, REPEL_R * 2);
      p.stroke(fg, 160);
      p.strokeWeight(1.5);
      p.circle(q.x, q.y, 90 + Math.sin(t * 3 + idx) * 12);
      p.noStroke();
      p.fill(fg);
      p.circle(q.x, q.y, 16);
    }
  }

  // Emit visuals — solid palm center + expanding rings for BOTH hands
  for (const em of emitters) {
    const palm = em.palm;
    p.noStroke();
    p.fill(fg);
    p.circle(palm.x, palm.y, 44);
    p.noFill();
    for (let i = 0; i < 4; i++) {
      const phase = (t * 0.6 + i * 0.25) % 1;
      p.stroke(fg, (1 - phase) * 200);
      p.strokeWeight(1.5);
      p.circle(palm.x, palm.y, 70 + phase * 220);
    }
    p.noStroke();
    p.fill(fg);
    p.textFont('Roboto Mono');
    p.textStyle(p.BOLD);
    p.textSize(14);
    p.textAlign(p.CENTER, p.TOP);
    p.text('EMIT ▶', palm.x, palm.y + 68);
  }

  // Alive count HUD
  p.textFont('Roboto Mono');
  p.textStyle(p.NORMAL);
  p.textSize(11);
  p.textAlign(p.LEFT, p.TOP);
  p.fill(fg, 120);
  p.text(`◐ ${aliveCount} alive`, 60, ctx.H - 220);
}

export function cleanup() {}
