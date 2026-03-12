const { invoke } = window.__TAURI__.core;

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// Field IDs matching config keys
const textFields = ['company', 'userId', 'password', 'labelLeft', 'labelDone'];
const checkFields = ['showProgressBar', 'notifyOnDone', 'launchAtLogin'];
const colorFields = [
  'colorEarly', 'colorMid', 'colorLate', 'colorDone',
  'colorEarlyDark', 'colorMidDark', 'colorLateDark', 'colorDoneDark'
];

// Emoji picker
const emojiPresets = [
  '🎉', '✅', '🔥', '🏠', '👋', '🍺',
  '🚀', '⭐', '💪', '🎯', '✨', '🌈',
  '☕', '🍕', '😎', '💤', '🏃', '🎶',
];

let currentEmoji = '🎉';

function initEmojiPicker() {
  const grid = document.getElementById('emojiPresets');
  grid.innerHTML = '';
  emojiPresets.forEach(emoji => {
    const btn = document.createElement('button');
    btn.textContent = emoji;
    btn.className = emoji === currentEmoji ? 'selected' : '';
    btn.addEventListener('click', () => {
      currentEmoji = emoji;
      updateEmojiDisplay();
      document.getElementById('emojiGrid').classList.add('hidden');
    });
    grid.appendChild(btn);
  });
}

function updateEmojiDisplay() {
  document.getElementById('emojiPreview').textContent = currentEmoji;
  // Update selected state
  document.querySelectorAll('#emojiPresets button').forEach(btn => {
    btn.className = btn.textContent === currentEmoji ? 'selected' : '';
  });
}

document.getElementById('btnEmojiChange').addEventListener('click', () => {
  const grid = document.getElementById('emojiGrid');
  grid.classList.toggle('hidden');
  initEmojiPicker();
});

document.getElementById('btnEmojiOk').addEventListener('click', () => {
  const custom = document.getElementById('emojiCustom').value.trim();
  if (custom) {
    currentEmoji = custom;
    updateEmojiDisplay();
    document.getElementById('emojiCustom').value = '';
    document.getElementById('emojiGrid').classList.add('hidden');
  }
});

// Load config into form
async function loadConfig() {
  const config = await invoke('cmd_get_config');
  textFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = config[id] || '';
  });
  checkFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = !!config[id];
  });
  colorFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = config[id] || '#000000';
  });
  document.getElementById('timeFormat').value = config.timeFormat || 'hm';
  currentEmoji = config.emojiDone || '🎉';
  updateEmojiDisplay();
}

// Collect form into config object
function collectConfig() {
  const config = {};
  textFields.forEach(id => {
    config[id] = document.getElementById(id).value;
  });
  checkFields.forEach(id => {
    config[id] = document.getElementById(id).checked;
  });
  colorFields.forEach(id => {
    config[id] = document.getElementById(id).value;
  });
  config.timeFormat = document.getElementById('timeFormat').value;
  config.emojiDone = currentEmoji;
  config.labelNoData = '--:--';
  return config;
}

// Save config
document.getElementById('btnSave').addEventListener('click', async () => {
  const config = collectConfig();
  await invoke('cmd_save_config', { newConfig: config });
  document.getElementById('btnSave').textContent = 'Saved!';
  setTimeout(() => {
    document.getElementById('btnSave').textContent = 'Save';
  }, 1500);
});

// Refresh
document.getElementById('btnRefresh').addEventListener('click', async () => {
  document.getElementById('btnRefresh').textContent = 'Refreshing...';
  document.getElementById('btnRefresh').disabled = true;
  try {
    await invoke('cmd_refresh');
    await loadStatus();
  } finally {
    document.getElementById('btnRefresh').textContent = 'Refresh Now';
    document.getElementById('btnRefresh').disabled = false;
  }
});

// Debug info
document.getElementById('btnDebug').addEventListener('click', async () => {
  const debug = await invoke('cmd_debug_info');
  await navigator.clipboard.writeText(debug);
  const hint = document.getElementById('debugHint');
  hint.textContent = 'Copied!';
  setTimeout(() => { hint.textContent = 'Paste to Slack for support'; }, 2000);
});

// Init
loadConfig();
