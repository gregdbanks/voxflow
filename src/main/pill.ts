import { BrowserWindow, screen } from 'electron';
import type { PipelineState } from '../services/pipeline/DictationPipeline.js';

const PILL_WIDTH = 180;
const PILL_HEIGHT = 44;
const BOTTOM_INSET = 80;
const BAR_COUNT = 24;

// Always-on-top floating pill near the bottom of the screen so the user can
// see dictation state without looking at the menu bar (the ● title is easy to
// miss). Doesn't steal focus — that's critical because the transcription
// needs to paste into whatever text field is focused.
export class PillWindow {
  private win: BrowserWindow | null = null;
  private loaded = false;

  constructor() {
    this.win = new BrowserWindow({
      width: PILL_WIDTH,
      height: PILL_HEIGHT,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      type: 'panel',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.win.setAlwaysOnTop(true, 'screen-saver');
    this.position();
    this.win.loadURL(this.html());
    this.win.webContents.once('did-finish-load', () => {
      this.loaded = true;
    });
  }

  private position(): void {
    if (!this.win) return;
    const { workArea } = screen.getPrimaryDisplay();
    const x = workArea.x + Math.round((workArea.width - PILL_WIDTH) / 2);
    const y = workArea.y + workArea.height - PILL_HEIGHT - BOTTOM_INSET;
    this.win.setBounds({ x, y, width: PILL_WIDTH, height: PILL_HEIGHT });
  }

  private html(): string {
    // Minimal: only oscillating waveform bars, nothing else. No label, no
    // state dot, no stop button. Pill is shown only while the pipeline is
    // recording; users cancel by releasing Option, not by clicking.
    const bars = Array.from({ length: BAR_COUNT }, () => '<div class="bar"></div>').join('');
    const body = `<!doctype html>
<html><head><meta charset="UTF-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: transparent; height: 100%; overflow: hidden; user-select: none; -webkit-app-region: no-drag; }
  .pill { display: flex; align-items: center; justify-content: space-between; gap: 2px; background: rgba(20,20,20,0.92); border: 1px solid rgba(255,255,255,0.08); border-radius: 22px; padding: 0 14px; height: 44px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
  .bar { width: 3px; height: 3px; background: #ff3b30; border-radius: 2px; transition: height 90ms ease-out; flex: 0 0 auto; }
</style></head><body>
<div class="pill">${bars}</div>
<script>
  const { ipcRenderer } = require('electron');
  const barEls = document.querySelectorAll('.bar');
  const BAR_COUNT = ${BAR_COUNT};
  const levels = new Array(BAR_COUNT).fill(0);

  ipcRenderer.on('pill:state', (_, state) => {
    // Reset heights when the pill becomes visible/invisible so the next
    // recording doesn't inherit the last session's waveform peaks.
    if (state !== 'recording') {
      levels.fill(0);
      for (const b of barEls) b.style.height = '3px';
    }
  });

  ipcRenderer.on('pill:level', (_, level) => {
    levels.shift();
    levels.push(level);
    // Amplify + sqrt curve so normal speech RMS (~0.02-0.10) clearly moves
    // the bars. Max height 28px (fits in the 44px-high pill with padding).
    for (let i = 0; i < barEls.length; i++) {
      const v = Math.min(1, Math.sqrt(levels[i] * 12));
      const h = Math.max(3, Math.round(v * 28));
      barEls[i].style.height = h + 'px';
    }
  });
</script></body></html>`;
    return 'data:text/html;charset=utf-8,' + encodeURIComponent(body);
  }

  level(level: number): void {
    if (!this.win || this.win.isDestroyed()) return;
    // Don't gate on isVisible() — showInactive() race can cause early level
    // events to be dropped. webContents.send is a no-op if the renderer
    // isn't listening yet, so it's safe.
    this.win.webContents.send('pill:level', level);
  }

  update(state: PipelineState): void {
    if (!this.win || this.win.isDestroyed()) return;
    // Pill now exists only to show live audio levels while recording.
    // Any other state (idle, transcribing, cleaning, injecting, error)
    // hides it — we don't need a floating indicator for post-recording
    // work, and it would just be a dark empty pill anyway.
    const show = state === 'recording';
    if (show) {
      const send = (): void => this.win!.webContents.send('pill:state', state);
      if (this.loaded) send();
      else this.win.webContents.once('did-finish-load', send);
      if (!this.win.isVisible()) this.win.showInactive();
    } else if (this.win.isVisible()) {
      this.win.webContents.send('pill:state', state);
      this.win.hide();
    }
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }
}
