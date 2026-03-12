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
const textFields = ['company', 'userId', 'password', 'labelLeft', 'labelDone', 'emojiDone'];
const checkFields = ['showProgressBar', 'notifyOnDone', 'launchAtLogin'];

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
  document.getElementById('timeFormat').value = config.timeFormat || 'hm';
  document.getElementById('labelLeft').value = config.labelLeft || 'left';
}

// Save config
document.getElementById('btnSave').addEventListener('click', async () => {
  const config = {};
  textFields.forEach(id => {
    config[id] = document.getElementById(id).value;
  });
  checkFields.forEach(id => {
    config[id] = document.getElementById(id).checked;
  });
  config.timeFormat = document.getElementById('timeFormat').value;
  // Keep color defaults (not editable in Windows version yet)
  config.labelNoData = '--:--';
  config.colorEarly = '#34C759';
  config.colorMid = '#FF9500';
  config.colorLate = '#FF3B30';
  config.colorDone = '#34C759';
  config.colorEarlyDark = '#30D158';
  config.colorMidDark = '#FFD60A';
  config.colorLateDark = '#FF453A';
  config.colorDoneDark = '#30D158';

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

// Status display
async function loadStatus() {
  const status = await invoke('cmd_get_status');
  const box = document.getElementById('statusBox');
  if (!status) {
    box.textContent = 'No check-in data for today';
    return;
  }
  const out = status.leave || status.leaveEst;
  let lines = [`In: ${status.come}  Out: ${out}`];
  if (status.leaveMinutes) {
    const h = Math.floor(status.leaveMinutes / 60);
    const m = status.leaveMinutes % 60;
    lines.push(`Leave: ${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm' : ''}`);
  }
  if (status.isDone) {
    if (status.overtime && status.overtime > 0) {
      lines.push(`Overtime: +${Math.floor(status.overtime / 60)}h${status.overtime % 60}m`);
    } else {
      lines.push('Done!');
    }
  } else {
    const h = Math.floor(status.remain / 60);
    const m = status.remain % 60;
    lines.push(`Remaining: ${h}h${m}m (${status.pct}%)`);
    if (status.pct >= 0) {
      const filled = Math.floor(status.pct / 10);
      const empty = 10 - filled;
      lines.push('█'.repeat(filled) + '░'.repeat(empty) + `  ${status.pct}%`);
    }
  }
  box.textContent = lines.join('\n');
}

// Init
loadConfig();
loadStatus();
