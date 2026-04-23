interface DictionaryEntry {
  id: number;
  pattern: string;
  replacement: string;
  caseSensitive: boolean;
  createdAt: number;
}

interface DictionaryBridge {
  list(): Promise<DictionaryEntry[]>;
  add(pattern: string, replacement: string, caseSensitive: boolean): Promise<DictionaryEntry>;
  remove(id: number): Promise<DictionaryEntry[]>;
}

export interface MountOptions {
  container: HTMLElement;
  dictionary: DictionaryBridge | undefined;
}

export function mountSettingsPanel({ container, dictionary }: MountOptions): void {
  container.innerHTML = `
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
  `;

  const form = container.querySelector<HTMLFormElement>('.dict-form')!;
  const list = container.querySelector<HTMLUListElement>('.dict-list')!;
  const empty = container.querySelector<HTMLParagraphElement>('.dict-empty')!;

  if (!dictionary) {
    container.innerHTML = '<p class="dict-unavailable">Dictionary bridge unavailable.</p>';
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
