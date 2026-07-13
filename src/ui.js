import { snapPNG, startRecording, isRecording, getRecordingFormat } from './recorder.js';

export const uiState = {
  currentMode: 'flow',
  cameraMode: 'visible',
  invert: false,

  // Content
  template: 'manifesto', // 'manifesto' | 'speaker'
  title: 'AI Дизайн\nДемо',
  subtitle:
    'Разбираем реальные задачи дизайн-функции Фантеха и показываем, как AI помогает их решать.',
  speaker: 'Имя Фамилия, Команда',
  topic: 'Тема выступления',
  logo: 'Фантех',
  exchange: 'Обмен опытом',
  edition: 'SESSION · 01',
  date: '', // auto-filled via nowStamp() when empty (Month YYYY)

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
    <p class="panel-brand"><strong>AI Дизайн Демо</strong> · poster generator</p>
    <p class="panel-brand">v0.4 · 1080×1350</p>

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
      <h3 class="panel-title">Template</h3>
      <div class="toggle-row" id="template-toggle">
        <button class="toggle-btn active" data-tpl="manifesto">Manifesto</button>
        <button class="toggle-btn" data-tpl="speaker">Speaker</button>
      </div>
    </div>

    <div class="panel-section">
      <h3 class="panel-title">Copy</h3>

      <label>Title</label>
      <textarea id="ui-title" rows="2"></textarea>

      <div id="tpl-manifesto-fields">
        <label>Subtitle (о формате)</label>
        <textarea id="ui-subtitle" rows="4"></textarea>
      </div>

      <div id="tpl-speaker-fields">
        <label>Спикер · Имя Фамилия, Команда</label>
        <input type="text" id="ui-speaker" />
        <label>Тема</label>
        <textarea id="ui-topic" rows="2"></textarea>
      </div>
    </div>

    <div class="panel-section">
      <h3 class="panel-title">Крошки в углах</h3>
      <label>Лого (top-left)</label>
      <input type="text" id="ui-logo" />
      <label>"Обмен опытом" тег</label>
      <input type="text" id="ui-exchange" />
      <label>Edition (N°)</label>
      <input type="text" id="ui-edition" />
      <label>Дата (Manifesto: Июль 2026 · Speaker: 13.07.2026)</label>
      <input type="text" id="ui-date" placeholder="auto (Месяц YYYY)" />
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
        1–3 — switch modes
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

  // Template switcher — reveals/hides fields
  const tplToggle = document.getElementById('template-toggle');
  const setTemplate = (tpl) => {
    uiState.template = tpl;
    tplToggle.querySelectorAll('.toggle-btn').forEach((x) =>
      x.classList.toggle('active', x.dataset.tpl === tpl)
    );
    document.getElementById('tpl-manifesto-fields').style.display =
      tpl === 'manifesto' ? '' : 'none';
    document.getElementById('tpl-speaker-fields').style.display =
      tpl === 'speaker' ? '' : 'none';
    // Auto-refresh date placeholder based on template
    const dateInput = document.getElementById('ui-date');
    if (dateInput && !dateInput.value.trim()) {
      dateInput.placeholder = tpl === 'speaker' ? 'дд.мм.гггг' : 'auto (Месяц YYYY)';
    }
  };
  tplToggle.querySelectorAll('.toggle-btn').forEach((b) => {
    b.addEventListener('click', () => setTemplate(b.dataset.tpl));
  });
  setTemplate(uiState.template);

  bindText('ui-title', 'title');
  bindText('ui-subtitle', 'subtitle');
  bindText('ui-speaker', 'speaker');
  bindText('ui-topic', 'topic');
  bindText('ui-logo', 'logo');
  bindText('ui-exchange', 'exchange');
  bindText('ui-edition', 'edition');
  bindText('ui-date', 'date');

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
  if (!el) return;
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
