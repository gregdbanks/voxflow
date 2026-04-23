import { describe, it, expect } from 'vitest';
import { buildPrompt, detectContext } from '../../../../src/services/llm/PromptBuilder.js';

describe('detectContext', () => {
  it.each([
    ['Code', 'code'],
    ['Visual Studio Code', 'code'],
    ['Cursor', 'code'],
    ['Warp', 'code'],
    ['Terminal', 'code'],
    ['iTerm2', 'code'],
    ['Slack', 'chat'],
    ['Messages', 'chat'],
    ['Discord', 'chat'],
    ['Microsoft Word', 'docs'],
    ['Pages', 'docs'],
    ['Notion', 'docs'],
    ['Mail', 'email'],
    ['Outlook', 'email'],
    ['Superhuman', 'email'],
    ['Finder', 'default'],
    [undefined, 'default'],
  ] as const)('maps %s to %s', (app, expected) => {
    expect(detectContext(app)).toBe(expected);
  });
});

describe('buildPrompt', () => {
  it('returns the code system prompt for IDE contexts', () => {
    const prompt = buildPrompt({ text: 'hello', activeApp: 'Visual Studio Code' });
    expect(prompt.context).toBe('code');
    expect(prompt.system).toContain('technical terms');
  });

  it('returns a casual system prompt for chat apps', () => {
    const prompt = buildPrompt({ text: 'lets grab lunch', activeApp: 'Slack' });
    expect(prompt.context).toBe('chat');
    expect(prompt.system).toContain('contractions');
  });

  it('returns a formal prose prompt for document apps', () => {
    const prompt = buildPrompt({ text: 'In this chapter we discuss.', activeApp: 'Pages' });
    expect(prompt.context).toBe('docs');
    expect(prompt.system).toContain('polished');
  });

  it('returns a professional tone prompt for email apps', () => {
    const prompt = buildPrompt({ text: 'Hi team', activeApp: 'Outlook' });
    expect(prompt.context).toBe('email');
    expect(prompt.system).toContain('professional');
  });

  it('falls back to default cleanup when the app is unknown', () => {
    const prompt = buildPrompt({ text: 'uh I was thinking', activeApp: 'FooBar' });
    expect(prompt.context).toBe('default');
    expect(prompt.user).toContain('uh I was thinking');
  });

  it('includes the window title hint when provided', () => {
    const prompt = buildPrompt({
      text: 'write a function',
      activeApp: 'Code',
      activeWindowTitle: 'pipeline.ts',
    });
    expect(prompt.user).toContain('pipeline.ts');
  });
});
