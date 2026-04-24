import { contextBridge, ipcRenderer } from 'electron';

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
});
