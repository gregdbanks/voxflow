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

interface DictionaryBridge {
  list(): Promise<DictionaryEntry[]>;
  add(pattern: string, replacement: string, caseSensitive: boolean): Promise<DictionaryEntry>;
  remove(id: number): Promise<DictionaryEntry[]>;
}

interface SettingsBridge {
  get(): Promise<AppSettings>;
  update(patch: Partial<AppSettings>): Promise<AppSettings>;
}

export interface MountOptions {
  container: HTMLElement;
  dictionary: DictionaryBridge | undefined;
  settings: SettingsBridge | undefined;
}

// Model options rendered in the picker, in ascending size order. Each row
// surfaces the tradeoff (file size + rough latency) so a user on an older
// Mac can pick intelligently without reading the README.
interface ModelOption {
  id: string;
  label: string;
  size: string;
  blurb: string;
}

const MODEL_OPTIONS: readonly ModelOption[] = [
  { id: 'tiny.en', label: 'Tiny (English)', size: '75 MB', blurb: 'Fastest. Usable for short notes; sloppy on names.' },
  { id: 'base.en', label: 'Base (English)', size: '142 MB', blurb: 'Light. Decent quality on clear speech.' },
  { id: 'small.en', label: 'Small (English)', size: '466 MB', blurb: 'Sweet spot for older Macs. Near-instant.' },
  { id: 'medium.en', label: 'Medium (English)', size: '1.5 GB', blurb: 'Higher accuracy; meaningful tax on 8 GB Macs.' },
  { id: 'large-v3-turbo', label: 'Large v3 Turbo', size: '1.5 GB', blurb: 'Default. Best accuracy-to-speed on M-Pro/Max. Multilingual.' },
  { id: 'large-v3', label: 'Large v3', size: '3 GB', blurb: 'Maximum accuracy. Slow without a Neural Engine.' },
];

export function mountSettingsPanel({ container, dictionary, settings }: MountOptions): void {
  container.innerHTML = `
    <section class="settings-section">
      <h3 class="settings-subheading">Transcription Model</h3>
      <p class="settings-hint">Controls which Whisper model VoxFlow loads. Smaller = faster + less RAM. Changes apply immediately; new models download on demand.</p>
      <select id="model-select" class="model-select" disabled aria-label="Whisper model">
        ${MODEL_OPTIONS.map(
          (m) => `<option value="${m.id}">${m.label} — ${m.size}</option>`,
        ).join('')}
      </select>
      <p id="model-blurb" class="settings-hint model-blurb"></p>
      <p id="model-status" class="settings-hint model-status" hidden></p>
    </section>
    <section class="settings-section">
      <h3 class="settings-subheading">Personal Dictionary</h3>
      <form class="dict-form" autocomplete="off">
        <div class="dict-form-row">
          <input type="text" name="pattern" placeholder="pattern (e.g. voxflow)" required />
          <span class="dict-arrow">→</span>
          <input type="text" name="replacement" placeholder="replacement (e.g. VoxFlow)" required />
        </div>
        <label class="dict-case">
          <input type="checkbox" name="caseSensitive" />
          Case sensitive
        </label>
        <button type="submit" class="dict-add">Add</button>
      </form>
      <ul class="dict-list" aria-live="polite"></ul>
      <p class="dict-empty" hidden>No dictionary entries yet.</p>
    </section>
  `;

  const modelSelect = container.querySelector<HTMLSelectElement>('#model-select')!;
  const modelBlurb = container.querySelector<HTMLElement>('#model-blurb')!;
  const modelStatus = container.querySelector<HTMLElement>('#model-status')!;
  const form = container.querySelector<HTMLFormElement>('.dict-form')!;
  const list = container.querySelector<HTMLUListElement>('.dict-list')!;
  const empty = container.querySelector<HTMLParagraphElement>('.dict-empty')!;

  const updateBlurb = (): void => {
    const pick = MODEL_OPTIONS.find((m) => m.id === modelSelect.value);
    modelBlurb.textContent = pick?.blurb ?? '';
  };

  if (settings) {
    void settings.get().then((s) => {
      modelSelect.value = s.whisperModel;
      modelSelect.disabled = false;
      updateBlurb();
    });
    modelSelect.addEventListener('change', async () => {
      const chosen = modelSelect.value;
      modelStatus.hidden = false;
      modelStatus.textContent = `Switching to ${chosen}…`;
      updateBlurb();
      await settings.update({ whisperModel: chosen });
    });
  } else {
    modelBlurb.textContent = 'Settings bridge unavailable.';
  }

  // Model-download progress + readiness events come from main over IPC —
  // listeners are wired in renderer/index.ts; they write into #model-status
  // via the shared DOM nodes below. We mirror the signal here so the
  // picker surfaces the current state without a tab switch.
  const bridge = (window as unknown as {
    voxflow?: {
      onModelProgress?: (cb: (p: { percent: number; bytesWritten: number; totalBytes: number }) => void) => void;
      onModelReady?: (cb: (payload: { model: string }) => void) => void;
      onModelError?: (cb: (msg: string) => void) => void;
    };
  }).voxflow;
  bridge?.onModelProgress?.((p) => {
    modelStatus.hidden = false;
    modelStatus.textContent = `Downloading ${modelSelect.value}… ${p.percent}%`;
  });
  bridge?.onModelReady?.((payload) => {
    modelStatus.hidden = false;
    modelStatus.textContent = `${payload.model} ready.`;
    setTimeout(() => { modelStatus.hidden = true; }, 1500);
  });
  bridge?.onModelError?.((message) => {
    modelStatus.hidden = false;
    modelStatus.textContent = `Model error: ${message}`;
  });

  if (!dictionary) {
    form.innerHTML = '<p class="dict-unavailable">Dictionary bridge unavailable.</p>';
    return;
  }

  async function refresh(): Promise<void> {
    const entries = await dictionary!.list();
    render(entries);
  }

  function render(entries: DictionaryEntry[]): void {
    list.innerHTML = '';
    empty.hidden = entries.length > 0;
    for (const entry of entries) {
      const li = document.createElement('li');
      li.className = 'dict-entry';
      li.innerHTML = `
        <span class="dict-pattern">${escape(entry.pattern)}</span>
        <span class="dict-arrow">→</span>
        <span class="dict-replacement">${escape(entry.replacement)}</span>
        ${entry.caseSensitive ? '<span class="dict-flag">Aa</span>' : ''}
        <button type="button" class="dict-remove" aria-label="Remove">×</button>
      `;
      const removeBtn = li.querySelector<HTMLButtonElement>('.dict-remove')!;
      removeBtn.addEventListener('click', async () => {
        const after = await dictionary!.remove(entry.id);
        render(after);
      });
      list.appendChild(li);
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const pattern = String(formData.get('pattern') ?? '').trim();
    const replacement = String(formData.get('replacement') ?? '');
    const caseSensitive = formData.get('caseSensitive') === 'on';
    if (!pattern) return;
    await dictionary.add(pattern, replacement, caseSensitive);
    form.reset();
    await refresh();
  });

  void refresh();
}

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
