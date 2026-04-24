import { mountSettingsPanel } from './components/SettingsPanel.js';

interface DictionaryEntry {
  id: number;
  pattern: string;
  replacement: string;
  caseSensitive: boolean;
  createdAt: number;
}

interface AppSettings {
  hotkey: string;
  language: string;
}

interface HistoryEntry {
  id: number;
  original: string;
  corrected: string;
  appName: string | null;
  createdAt: number;
}

interface ModelProgress {
  percent: number;
  bytesWritten: number;
  totalBytes: number;
}

interface PrivacyInfo {
  provider: 'local';
  model?: string;
}

interface VoxFlowBridge {
  onStateChange(callback: (state: string) => void): void;
  onTranscription(callback: (text: string) => void): void;
  onError?(callback: (message: string) => void): void;
  onManualPaste?(callback: (text: string) => void): void;
  onModelProgress?(callback: (p: ModelProgress) => void): void;
  onModelReady?(callback: () => void): void;
  onModelError?(callback: (msg: string) => void): void;
  getPrivacyInfo?(): Promise<PrivacyInfo>;
  dictionary?: {
    list(): Promise<DictionaryEntry[]>;
    add(pattern: string, replacement: string, caseSensitive: boolean): Promise<DictionaryEntry>;
    remove(id: number): Promise<DictionaryEntry[]>;
  };
  settings?: {
    get(): Promise<AppSettings>;
    update(patch: Partial<AppSettings>): Promise<AppSettings>;
  };
  history?: {
    list(limit?: number): Promise<HistoryEntry[]>;
    copy(text: string): Promise<boolean>;
    reinject(text: string): Promise<boolean>;
  };
}

declare global {
  interface Window {
    voxflow?: VoxFlowBridge;
  }
}

const statusEl = document.getElementById('status');
const transcriptionEl = document.getElementById('transcription');
const dotEl = document.querySelector<HTMLElement>('.dot');
const tabs = document.querySelectorAll<HTMLButtonElement>('.tab');
const views = document.querySelectorAll<HTMLElement>('[data-view]');

window.voxflow?.onStateChange((state) => {
  if (dotEl) dotEl.dataset.state = state;
  if (statusEl) {
    const labels: Record<string, string> = {
      idle: 'Hold ⌥ to dictate (or ⌘⌥Z)',
      recording: 'Listening…',
      transcribing: 'Transcribing…',
      injecting: 'Pasting…',
      error: 'Error — see logs',
    };
    statusEl.textContent = labels[state] ?? state;
  }
});

window.voxflow?.onTranscription((text) => {
  if (transcriptionEl) transcriptionEl.textContent = text;
});

window.voxflow?.onError?.((message) => {
  if (statusEl) statusEl.textContent = `Error — ${message}`;
});

window.voxflow?.onManualPaste?.(() => {
  if (statusEl) statusEl.textContent = 'Copied — press ⌘V to paste';
});

function activateTab(name: string): void {
  tabs.forEach((t) => {
    t.setAttribute('aria-selected', t.dataset.tab === name ? 'true' : 'false');
  });
  views.forEach((v) => {
    v.hidden = v.dataset.view !== name;
  });
}

tabs.forEach((t) => {
  t.addEventListener('click', () => {
    const name = t.dataset.tab;
    if (name) {
      activateTab(name);
      if (name === 'history') void renderHistory();
    }
  });
});

const historyListEl = document.getElementById('history-list') as HTMLUListElement | null;
const historyEmptyEl = document.getElementById('history-empty') as HTMLParagraphElement | null;
const historySearchEl = document.getElementById('history-search') as HTMLInputElement | null;

// Keep a single cached copy and re-filter client-side so typing in the search
// box doesn't hammer IPC / SQLite on every keystroke.
let historyCache: HistoryEntry[] = [];

function formatWhen(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(ts).toLocaleDateString();
}

function paintHistory(entries: HistoryEntry[]): void {
  if (!historyListEl) return;
  historyListEl.innerHTML = '';
  if (entries.length === 0) {
    if (historyEmptyEl) historyEmptyEl.hidden = false;
    return;
  }
  if (historyEmptyEl) historyEmptyEl.hidden = true;
  for (const entry of entries) {
    const li = document.createElement('li');
    li.className = 'history-item';
    const text = document.createElement('p');
    text.className = 'history-text';
    text.textContent = entry.corrected;
    const meta = document.createElement('div');
    meta.className = 'history-meta';
    const when = document.createElement('span');
    when.textContent = formatWhen(entry.createdAt) + (entry.appName ? ` · ${entry.appName}` : '');
    const actions = document.createElement('div');
    actions.className = 'history-actions';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', async () => {
      await window.voxflow?.history?.copy(entry.corrected);
      copyBtn.textContent = 'Copied';
      setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
    });
    const pasteBtn = document.createElement('button');
    pasteBtn.type = 'button';
    pasteBtn.textContent = 'Paste';
    pasteBtn.addEventListener('click', () => {
      void window.voxflow?.history?.reinject(entry.corrected);
    });
    actions.append(copyBtn, pasteBtn);
    meta.append(when, actions);
    li.append(text, meta);
    historyListEl.append(li);
  }
}

function applySearch(): void {
  const q = (historySearchEl?.value ?? '').trim().toLowerCase();
  if (!q) {
    paintHistory(historyCache);
    return;
  }
  paintHistory(historyCache.filter((e) => e.corrected.toLowerCase().includes(q)));
}

async function renderHistory(): Promise<void> {
  if (!historyListEl || !window.voxflow?.history) return;
  historyCache = (await window.voxflow.history.list(1000)) as HistoryEntry[];
  applySearch();
}

historySearchEl?.addEventListener('input', applySearch);

// Refresh history when a new transcription lands so the list is always fresh.
window.voxflow?.onStateChange((state) => {
  if (state === 'idle') void renderHistory();
});

// Privacy badge — VoxFlow is fully local, so this badge is a persistent
// confirmation that nothing is leaving the machine. No cloud state exists
// because there's no cloud path in the app.
const privacyBadgeEl = document.getElementById('privacy-badge');
const privacyLabelEl = document.querySelector<HTMLElement>('.privacy-label');

function paintPrivacy(info: PrivacyInfo): void {
  if (!privacyBadgeEl || !privacyLabelEl) return;
  privacyBadgeEl.classList.add('privacy-local');
  privacyLabelEl.textContent = `Local · audio never leaves this machine${info.model ? ` (${info.model})` : ''}`;
  privacyBadgeEl.title = 'Audio is transcribed on-device by whisper.cpp. No network calls.';
}

void window.voxflow?.getPrivacyInfo?.().then(paintPrivacy);

// First-launch model download — show progress in a dedicated panel, hide
// status line until the model is ready. The pipeline will still accept a
// hotkey but transcription is gated until the "model-ready" event fires.
const modelDownloadEl = document.getElementById('model-download');
const modelDownloadPercentEl = document.getElementById('model-download-percent');
const modelDownloadFillEl = document.getElementById('model-download-fill');
window.voxflow?.onModelProgress?.((p) => {
  if (!modelDownloadEl) return;
  modelDownloadEl.hidden = false;
  if (modelDownloadPercentEl) modelDownloadPercentEl.textContent = `${p.percent}%`;
  if (modelDownloadFillEl) modelDownloadFillEl.style.width = `${p.percent}%`;
});
window.voxflow?.onModelReady?.(() => {
  if (modelDownloadEl) modelDownloadEl.hidden = true;
});
window.voxflow?.onModelError?.((msg) => {
  if (statusEl) statusEl.textContent = `Model download failed: ${msg}`;
});

const settingsMount = document.getElementById('settings-dictionary');
if (settingsMount) {
  mountSettingsPanel({
    container: settingsMount,
    dictionary: window.voxflow?.dictionary,
    settings: window.voxflow?.settings,
  });
}

export {};
