import { contextBridge, ipcRenderer } from 'electron';

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
  whisperModel: string;
}

contextBridge.exposeInMainWorld('voxflow', {
  onStateChange: (callback: (state: string) => void) => {
    ipcRenderer.on('voxflow:state', (_event, state: string) => callback(state));
  },
  onTranscription: (callback: (text: string) => void) => {
    ipcRenderer.on('voxflow:transcription', (_event, text: string) => callback(text));
  },
  onError: (callback: (message: string) => void) => {
    ipcRenderer.on('voxflow:error', (_event, message: string) => callback(message));
  },
  onManualPaste: (callback: (text: string) => void) => {
    ipcRenderer.on('voxflow:manual-paste', (_event, text: string) => callback(text));
  },
  onModelProgress: (callback: (p: { percent: number; bytesWritten: number; totalBytes: number }) => void) => {
    ipcRenderer.on('voxflow:model-progress', (_event, p) => callback(p));
  },
  onModelReady: (callback: () => void) => {
    ipcRenderer.on('voxflow:model-ready', () => callback());
  },
  onModelError: (callback: (msg: string) => void) => {
    ipcRenderer.on('voxflow:model-error', (_event, payload: { message: string }) => callback(payload.message));
  },
  getPrivacyInfo: () => ipcRenderer.invoke('voxflow:privacy-info'),

  dictionary: {
    list: (): Promise<DictionaryEntry[]> => ipcRenderer.invoke('voxflow:dictionary:list'),
    add: (pattern: string, replacement: string, caseSensitive: boolean): Promise<DictionaryEntry> =>
      ipcRenderer.invoke('voxflow:dictionary:add', { pattern, replacement, caseSensitive }),
    remove: (id: number): Promise<DictionaryEntry[]> => ipcRenderer.invoke('voxflow:dictionary:remove', id),
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('voxflow:settings:get'),
    update: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke('voxflow:settings:update', patch),
  },
  history: {
    list: (limit?: number): Promise<unknown[]> =>
      ipcRenderer.invoke('voxflow:history:list', limit ?? 25),
    copy: (text: string): Promise<boolean> => ipcRenderer.invoke('voxflow:history:copy', text),
    reinject: (text: string): Promise<boolean> =>
      ipcRenderer.invoke('voxflow:history:reinject', text),
  },
});
