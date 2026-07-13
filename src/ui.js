import { snapPNG, startRecording, isRecording, getRecordingFormat } from './recorder.js';

export const uiState = {
  currentMode: 'flow',
  cameraMode: 'visible', // off | sensor | visible
  invert: false,
  title: 'AI DESIGN\nDEMO',
  edition: 'SESSION · 01',
  topicsText:
    '01 · Claude Code — setup + design tasks\n02 · Phygital creative animation\n03 · Photo processing — fisheye + anim\n04 · Tracker × Клешня Бро\n05 · Prototyping — classic vs AI\n06 · Resizes — automation tools',
  showTopics: true,
  audioSensitivity: 1.2,
};

const MODES = [
  { key: 'flow', label: '01 · Flow × camera' },
  { key: 'face', label: '02 · Face mesh + lasers' },
  { key: 'hand', label: '03 · Hand skeleton × particles' },
];

const MODE_LABELS = Object.fromEntries(MODES.map((m) => [m.key, m.label]));

export function getModeLabel(key) {
  return MODE_LABELS[key] || key;
}

export function setupUI() {
  const panel = document.getElementById('panel');
  panel.innerHTML = `
    <p class="panel-brand"><strong>AI Design Demo</strong> · poster generator</p>
    <p class="panel-brand">v0.3 · 1080×1350</p>

    <div class="panel-section">
      <h3 class="panel-title">Mode</h3>
      <div class="mode-grid" id="mode-grid"></div>
    </div>

    <div class="panel-section">
      <h3 class="panel-title">Camera</h3>
      <div class="toggle-row" id="camera-toggle">
        <button class="toggle-btn" data-cam="off">Off</button>
        <button class="toggle-btn" data-cam="sensor">Sensor</button>
        <button class="toggle-btn" data-cam="visible">Visible</button>
      </div>
      <p class="status" id="camera-status">Requesting…</p>
    </div>

    <div class="panel-section">
      <h3 class="panel-title">Palette</h3>
      <div class="toggle-row" id="palette-toggle">
        <button class="toggle-btn active" data-pal="dark">Dark</button>
        <button class="toggle-btn" data-pal="light">Light</button>
      </div>
    </div>

    <div class="panel-section">
      <h3 class="panel-title">Copy</h3>
      <label>Title</label>
      <textarea id="ui-title" rows="2"></textarea>
      <label>Edition</label>
      <input type="text" id="ui-edition" />
      <label>Agenda list (1 per line)</label>
      <textarea id="ui-topics" rows="6"></textarea>
      <div class="toggle-row">
        <button class="toggle-btn active" id="topics-btn">Agenda visible</button>
      </div>
      <p class="hint">Layout auto-cycles 3-col / 2-col / 1-col every 10 s</p>
    </div>

    <div class="panel-section">
      <h3 class="panel-title">Audio reactivity</h3>
      <div class="range-row"><label style="margin:0">Sensitivity</label><span id="sens-val">1.2×</span></div>
      <input type="range" id="ui-sens" min="0.2" max="5" step="0.1" />
      <p class="status" id="audio-status">Requesting…</p>
    </div>

    <div class="panel-section">
      <h3 class="panel-title">Export</h3>
      <div class="export-row">
        <button class="export-btn" id="snap-btn">Snap PNG</button>
      </div>
      <div class="export-row">
        <button class="export-btn secondary" id="rec-6">Rec 6s</button>
        <button class="export-btn secondary" id="rec-10">Rec 10s</button>
      </div>
      <p class="hint" id="format-hint">Format: —</p>
      <p class="hint">
        Space — snap PNG<br />
        R — record 8s<br />
        1–3 — switch modes<br />
        Audio: mic track embedded when mic OK<br />
        Convert (if needed):<br />
        <code style="color:#888">ffmpeg -i in.webm -c:v libx264 out.mp4</code>
      </p>
    </div>
  `;

  const modeGrid = document.getElementById('mode-grid');
  MODES.forEach((m) => {
    const b = document.createElement('button');
    b.className = 'mode-btn' + (m.key === uiState.currentMode ? ' active' : '');
    b.textContent = m.label;
    b.dataset.mode = m.key;
    b.addEventListener('click', () => setMode(m.key));
    modeGrid.appendChild(b);
  });

  function setMode(key) {
    uiState.currentMode = key;
    modeGrid.querySelectorAll('.mode-btn').forEach((x) => {
      x.classList.toggle('active', x.dataset.mode === key);
    });
    const hud = document.getElementById('hud-mode');
    if (hud) hud.textContent = MODE_LABELS[key].toUpperCase();
  }
  uiState._setMode = setMode;

  const camToggle = document.getElementById('camera-toggle');
  const setCam = (val) => {
    uiState.cameraMode = val;
    camToggle.querySelectorAll('.toggle-btn').forEach((x) =>
      x.classList.toggle('active', x.dataset.cam === val)
    );
  };
  setCam(uiState.cameraMode);
  camToggle.querySelectorAll('.toggle-btn').forEach((b) => {
    b.addEventListener('click', () => setCam(b.dataset.cam));
  });

  const palToggle = document.getElementById('palette-toggle');
  palToggle.querySelectorAll('.toggle-btn').forEach((b) => {
    b.addEventListener('click', () => {
      uiState.invert = b.dataset.pal === 'light';
      palToggle.querySelectorAll('.toggle-btn').forEach((x) =>
        x.classList.toggle('active', x === b)
      );
    });
  });

  bindText('ui-title', 'title');
  bindText('ui-edition', 'edition');
  bindText('ui-topics', 'topicsText');

  const topicsBtn = document.getElementById('topics-btn');
  topicsBtn.addEventListener('click', () => {
    uiState.showTopics = !uiState.showTopics;
    topicsBtn.classList.toggle('active', uiState.showTopics);
    topicsBtn.textContent = uiState.showTopics ? 'Agenda visible' : 'Agenda hidden';
  });

  const sens = document.getElementById('ui-sens');
  const sensVal = document.getElementById('sens-val');
  sens.value = uiState.audioSensitivity;
  sens.addEventListener('input', (e) => {
    uiState.audioSensitivity = parseFloat(e.target.value);
    sensVal.textContent = `${uiState.audioSensitivity.toFixed(1)}×`;
  });

  document.getElementById('snap-btn').addEventListener('click', snapPNG);
  const fmt = getRecordingFormat();
  const fmtHint = document.getElementById('format-hint');
  if (fmtHint) fmtHint.textContent = `Format: ${fmt.label}`;
  const recLabel = fmt.ext.toUpperCase();
  document.getElementById('rec-6').textContent = `Rec 6s ${recLabel}`;
  document.getElementById('rec-10').textContent = `Rec 10s ${recLabel}`;
  document.getElementById('rec-6').addEventListener('click', () => tryRecord(6000, 'rec-6', `Rec 6s ${recLabel}`));
  document.getElementById('rec-10').addEventListener('click', () => tryRecord(10000, 'rec-10', `Rec 10s ${recLabel}`));

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); snapPNG(); }
    if (e.code === 'KeyR') { e.preventDefault(); tryRecord(8000, 'rec-6', `Rec 6s ${getRecordingFormat().ext.toUpperCase()}`); }
    const num = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
    if (num >= 0 && MODES[num]) setMode(MODES[num].key);
  });

  document.getElementById('hud-mode').textContent = MODE_LABELS[uiState.currentMode].toUpperCase();
}

function bindText(id, key) {
  const el = document.getElementById(id);
  el.value = uiState[key];
  el.addEventListener('input', (e) => (uiState[key] = e.target.value));
}

function tryRecord(ms, btnId, restoreLabel) {
  if (isRecording()) return;
  const btn = document.getElementById(btnId);
  btn.classList.add('recording');
  btn.textContent = `● Rec ${ms / 1000}s`;
  const finish = () => {
    btn.classList.remove('recording');
    btn.textContent = restoreLabel;
  };
  startRecording(ms, finish);
  setTimeout(finish, ms + 400);
}

export function setStatus(id, text, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.classList.remove('ok', 'err');
  if (cls) el.classList.add(cls);
}
