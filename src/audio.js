export const audioState = {
  status: 'idle',   // 'idle' | 'requesting' | 'ready' | 'denied'
  detail: '',
  ctx: null,
  analyser: null,
  timeData: null,
  freqData: null,
  amplitude: 0,
  freqBinCount: 0,
  stream: null,
};

export async function initAudio() {
  if (audioState.status === 'ready') return { ok: true };
  audioState.status = 'requesting';
  try {
    // Disable DSP so music / shouts survive into the recording.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
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
    return { ok: true };
  } catch (e) {
    console.warn('[audio] init failed:', e);
    audioState.status = 'denied';
    audioState.detail = e.message;
    return { ok: false, reason: readableMicError(e), error: e };
  }
}

function readableMicError(e) {
  if (!e || !e.name) return 'Ошибка доступа к микрофону';
  switch (e.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Микрофон запрещён — открой замочек слева от адреса и разреши';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'Микрофон не найден';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Микрофон занят другим приложением';
    default:
      return `${e.name}: ${e.message}`;
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
