# AI Design Demo — Poster Generator

Localhost / Vercel tool that combines generative graphics, camera-based CV
(MediaPipe face + hands), microphone FFT, and typography to output 1080×1350
posters and short MP4/WebM loops for the AI Design Demo announce.

## Modes

1. **Flow × camera** — Perlin flow field, particles pulled by camera luminance
2. **Face mesh + lasers** — MediaPipe 478-point mesh with vertical light columns
   background; open mouth → laser beams from eyes, direction follows head motion
3. **Hand skeleton × particles** — both palms emit particle streams, fingertips push

## Run locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5273. Allow camera + mic when prompted.

## Deploy

Pushes to `main` auto-deploy to Vercel. The `postinstall` script downloads
MediaPipe WASM + face/hand `.task` models into `public/mediapipe` and
`public/models` during install.

## Shortcuts

- `Space` — snap PNG
- `R` — record 8 s
- `1`–`3` — switch modes

## Export

- PNG downloads instantly.
- Video records at 30 fps with **audio track from the mic embedded**. Format
  picker tries `video/mp4` (H.264 + AAC) first, falls back to `video/webm`
  (VP9 + Opus). Panel shows which was chosen.
- Convert WebM → MP4 externally if needed:
  ```bash
  ffmpeg -i in.webm -c:v libx264 -c:a copy out.mp4
  ```

## Stack

- Vite (dev + build)
- p5.js (canvas primitives)
- @mediapipe/tasks-vision (face + hand landmarker, GPU)
- Web Audio API + AnalyserNode
- MediaRecorder + canvas.captureStream

No backend — all runs client-side in the browser.
