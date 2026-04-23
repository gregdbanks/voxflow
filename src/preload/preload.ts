import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('voxflow', {
  onStateChange: (callback: (state: string) => void) => {
    ipcRenderer.on('voxflow:state', (_event, state: string) => callback(state));
  },
  onTranscription: (callback: (text: string) => void) => {
    ipcRenderer.on('voxflow:transcription', (_event, text: string) => callback(text));
  },
});
