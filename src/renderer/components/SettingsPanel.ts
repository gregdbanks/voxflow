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

export function mountSettingsPanel({ container, dictionary, settings }: MountOptions): void {
  container.innerHTML = `
    <section class="settings-section">
      <h3 class="settings-subheading">AI Cleanup</h3>
      <label class="toggle-row">
        <input type="checkbox" id="cleanup-toggle" />
        <span class="toggle-text">
          <span class="toggle-title">Clean transcriptions with Claude Haiku</span>
          <span class="toggle-hint">Removes fillers, fixes grammar, and adapts to the active app.</span>
        </span>
      </label>
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

  const cleanupToggle = container.querySelector<HTMLInputElement>('#cleanup-toggle')!;
  const form = container.querySelector<HTMLFormElement>('.dict-form')!;
  const list = container.querySelector<HTMLUListElement>('.dict-list')!;
  const empty = container.querySelector<HTMLParagraphElement>('.dict-empty')!;

  if (settings) {
    void settings.get().then((s) => {
      cleanupToggle.checked = s.cleanupEnabled;
    });
    cleanupToggle.addEventListener('change', () => {
      void settings.update({ cleanupEnabled: cleanupToggle.checked });
    });
  } else {
    cleanupToggle.disabled = true;
  }

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
