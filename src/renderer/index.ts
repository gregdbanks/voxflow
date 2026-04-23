interface VoxFlowBridge {
  onStateChange(callback: (state: string) => void): void;
  onTranscription(callback: (text: string) => void): void;
}

declare global {
  interface Window {
    voxflow?: VoxFlowBridge;
  }
}

const statusEl = document.getElementById('status');
const transcriptionEl = document.getElementById('transcription');
const dotEl = document.querySelector<HTMLElement>('.dot');

window.voxflow?.onStateChange((state) => {
  if (dotEl) dotEl.dataset.state = state;
  if (statusEl) {
    const labels: Record<string, string> = {
      idle: 'Press ⌘⇧Space to dictate',
      recording: 'Listening…',
      transcribing: 'Transcribing…',
      error: 'Error — see logs',
    };
    statusEl.textContent = labels[state] ?? state;
  }
});

window.voxflow?.onTranscription((text) => {
  if (transcriptionEl) transcriptionEl.textContent = text;
});

export {};
