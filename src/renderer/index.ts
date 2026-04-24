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
    if (name) activateTab(name);
  });
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
