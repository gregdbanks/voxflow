import { BrowserWindow, screen } from 'electron';
import type { PipelineState } from '../services/pipeline/DictationPipeline.js';

const PILL_WIDTH = 220;
const PILL_HEIGHT = 48;
const BOTTOM_INSET = 80;

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
    const body = `<!doctype html>
<html><head><meta charset="UTF-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: transparent; height: 100%; overflow: hidden; user-select: none; font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #fff; }
  .pill { display: flex; align-items: center; gap: 10px; background: rgba(20,20,20,0.92); border: 1px solid rgba(255,255,255,0.08); border-radius: 24px; padding: 0 18px; height: 48px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #888; flex: 0 0 auto; }
  .dot.recording { background: #ff3b30; animation: pulse 1s ease-in-out infinite; }
  .dot.transcribing, .dot.cleaning, .dot.injecting { background: #fbbc04; }
  .dot.error { background: #ff3b30; }
  @keyframes pulse { 0%,100% { opacity: 1; transform: scale(1);} 50% { opacity: .35; transform: scale(.7);} }
  .label { font-size: 13px; font-weight: 500; letter-spacing: .2px; white-space: nowrap; }
  .bars { display: none; align-items: center; gap: 3px; height: 24px; margin-left: auto; }
  .bars.show { display: flex; }
  .bar { width: 3px; height: 4px; background: #ff3b30; border-radius: 2px; transition: height 80ms ease-out; }
  .stop { margin-left: 6px; width: 22px; height: 22px; border-radius: 50%; border: 0; background: rgba(255,255,255,0.1); color: #fff; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; line-height: 1; }
  .stop:hover { background: rgba(255,59,48,0.8); }
</style></head><body>
<div class="pill">
  <div class="dot" id="dot"></div>
  <div class="label" id="label">Listening…</div>
  <div class="bars" id="bars">
    <div class="bar"></div><div class="bar"></div><div class="bar"></div>
    <div class="bar"></div><div class="bar"></div>
  </div>
  <button class="stop" id="stop" title="Cancel">✕</button>
</div>
<script>
  const { ipcRenderer } = require('electron');
  const dot = document.getElementById('dot');
  const label = document.getElementById('label');
  const bars = document.getElementById('bars');
  const barEls = bars.querySelectorAll('.bar');
  const LABELS = { recording: 'Listening…', transcribing: 'Transcribing…', cleaning: 'Cleaning up…', injecting: 'Pasting…', error: 'Error' };

  // Keep per-bar recent-peak history so the middle bars feel more alive.
  const levels = [0, 0, 0, 0, 0];

  document.getElementById('stop').addEventListener('click', () => {
    ipcRenderer.invoke('voxflow:stop');
  });

  ipcRenderer.on('pill:state', (_, state) => {
    dot.className = 'dot ' + state;
    label.textContent = LABELS[state] || '';
    if (state === 'recording') {
      bars.classList.add('show');
    } else {
      bars.classList.remove('show');
      for (const b of barEls) b.style.height = '4px';
    }
  });

  let levelCount = 0;
  let peak = 0;
  ipcRenderer.on('pill:level', (_, level) => {
    levelCount++;
    peak = Math.max(peak, level);
    // Shift levels left; newest on the right. 5 bars = a mini live waveform.
    levels.shift();
    levels.push(level);
    // Aggressive scaling: normal speech RMS hovers around 0.02-0.10, so we
    // multiply by 8 (was 4) and square-root for a softer ceiling.
    for (let i = 0; i < barEls.length; i++) {
      const v = Math.min(1, Math.sqrt(levels[i] * 8));
      const h = Math.max(4, Math.round(v * 24));
      barEls[i].style.height = h + 'px';
    }
    // Debug readout in the label so we can see if levels are actually
    // arriving when the bars look static.
    label.textContent = 'Listening… ' + levelCount + ' · peak ' + peak.toFixed(3);
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
    const show = state !== 'idle';
    if (show) {
      const send = (): void => this.win!.webContents.send('pill:state', state);
      if (this.loaded) send();
      else this.win.webContents.once('did-finish-load', send);
      if (!this.win.isVisible()) this.win.showInactive();
    } else if (this.win.isVisible()) {
      this.win.hide();
    }
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }
}
