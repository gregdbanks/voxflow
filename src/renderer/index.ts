import { mountSettingsPanel } from './components/SettingsPanel.js';

interface DictionaryEntry {
  id: number;
  pattern: string;
  replacement: string;
  caseSensitive: boolean;
  createdAt: number;
}

interface AppSettings {
  cleanupEnabled: boolean;
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

interface VoxFlowBridge {
  onStateChange(callback: (state: string) => void): void;
  onTranscription(callback: (text: string) => void): void;
  onError?(callback: (message: string) => void): void;
  onManualPaste?(callback: (text: string) => void): void;
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
      idle: 'Press ⌘⇧Space to dictate',
      recording: 'Listening…',
      transcribing: 'Transcribing…',
      cleaning: 'Cleaning up…',
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

function formatWhen(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(ts).toLocaleDateString();
}

async function renderHistory(): Promise<void> {
  if (!historyListEl || !window.voxflow?.history) return;
  const entries = await window.voxflow.history.list(25);
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

// Refresh history when a new transcription lands so the list is always fresh.
window.voxflow?.onStateChange((state) => {
  if (state === 'idle') void renderHistory();
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
