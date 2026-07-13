import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, cp } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const MODELS = [
  {
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    path: 'public/models/face_landmarker.task',
  },
  {
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    path: 'public/models/hand_landmarker.task',
  },
];

await mkdir('public/models', { recursive: true });
await mkdir('public/mediapipe', { recursive: true });

try {
  await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/mediapipe', { recursive: true });
  console.log('✓ copied WASM from node_modules/@mediapipe/tasks-vision/wasm → public/mediapipe/');
} catch (e) {
  console.warn('⚠ could not copy wasm:', e.message);
}

for (const m of MODELS) {
  if (existsSync(m.path)) {
    console.log(`✓ ${m.path} — cached`);
    continue;
  }
  try {
    console.log(`↓ ${m.url}`);
    const res = await fetch(m.url);
    if (!res.ok) {
      console.warn(`  ⚠ HTTP ${res.status} — model will fall back to CDN at runtime`);
      continue;
    }
    await pipeline(Readable.fromWeb(res.body), createWriteStream(m.path));
    console.log(`  ✓ saved ${m.path}`);
  } catch (e) {
    console.warn(`  ⚠ ${e.message} — will fall back to CDN at runtime`);
  }
}
