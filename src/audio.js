export const audioState = {
  status: 'idle',
  ctx: null,
  analyser: null,
  timeData: null,
  freqData: null,
  amplitude: 0,
  freqBinCount: 0,
  stream: null, // raw MediaStream so recorder can add mic audio track
};

export async function setupAudio() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioState.stream = stream;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    audioState.ctx = ctx;

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);

    audioState.analyser = analyser;
    audioState.timeData = new Uint8Array(analyser.fftSize);
    audioState.freqData = new Uint8Array(analyser.frequencyBinCount);
    audioState.freqBinCount = analyser.frequencyBinCount;
    audioState.status = 'ready';

    if (ctx.state === 'suspended') {
      const resume = () => {
        ctx.resume();
        document.removeEventListener('click', resume);
        document.removeEventListener('keydown', resume);
      };
      document.addEventListener('click', resume);
      document.addEventListener('keydown', resume);
    }

    tick();
  } catch (e) {
    console.warn('Mic denied:', e);
    audioState.status = 'denied';
  }
}

function tick() {
  requestAnimationFrame(tick);
  const { analyser, timeData, freqData } = audioState;
  if (!analyser) return;
  analyser.getByteTimeDomainData(timeData);
  analyser.getByteFrequencyData(freqData);
  let sum = 0;
  for (let i = 0; i < timeData.length; i++) {
    const v = (timeData[i] - 128) / 128;
    sum += v * v;
  }
  audioState.amplitude = Math.sqrt(sum / timeData.length);
}
