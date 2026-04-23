export type PromptContext =
  | 'code'
  | 'chat'
  | 'docs'
  | 'email'
  | 'default';

export interface PromptBuildRequest {
  text: string;
  activeApp?: string;
  activeWindowTitle?: string;
}

export interface BuiltPrompt {
  context: PromptContext;
  system: string;
  user: string;
}

const CODE_APPS = [
  'code', 'visual studio code', 'vscode',
  'terminal', 'iterm', 'iterm2', 'warp',
  'xcode', 'jetbrains', 'intellij idea', 'pycharm', 'webstorm', 'goland',
  'sublime text', 'zed', 'cursor',
];

const CHAT_APPS = [
  'slack', 'messages', 'discord', 'telegram', 'whatsapp', 'signal',
];

const DOCS_APPS = [
  'microsoft word', 'word', 'pages', 'google docs', 'docs', 'notion', 'obsidian',
];

const EMAIL_APPS = [
  'mail', 'outlook', 'superhuman', 'missive', 'airmail', 'spark',
];

export function detectContext(appName: string | undefined): PromptContext {
  if (!appName) return 'default';
  const needle = appName.toLowerCase();
  if (CODE_APPS.some((app) => needle.includes(app))) return 'code';
  if (CHAT_APPS.some((app) => needle.includes(app))) return 'chat';
  if (DOCS_APPS.some((app) => needle.includes(app))) return 'docs';
  if (EMAIL_APPS.some((app) => needle.includes(app))) return 'email';
  return 'default';
}

const CONTEXT_STYLE: Record<PromptContext, string> = {
  code: 'The user is editing code or working in a terminal. Preserve technical terms, identifiers, CamelCase, and punctuation exactly as spoken. Do not paraphrase — prefer the shortest correct form. If the user says "arrow function", keep it as "arrow function". Never wrap output in code fences.',
  chat: 'The user is writing a casual chat message. Keep contractions, a conversational tone, and short sentences. Remove filler words but keep the personality.',
  docs: 'The user is writing long-form prose in a document. Produce polished, grammatically correct prose with full sentences. Add paragraph breaks only where the structure clearly calls for them.',
  email: 'The user is composing an email. Use a professional, concise tone. Preserve salutations and sign-offs if present.',
  default: 'Produce a clean, natural version of what the user said.',
};

const BASE_SYSTEM = [
  "You are VoxFlow's transcription cleanup assistant.",
  'Your job is to lightly clean up a raw voice-dictated transcription so it reads like the user meant to write it:',
  '- Remove disfluencies like "um", "uh", "like", "you know", stutters, and false starts.',
  '- Fix obvious grammar and add standard punctuation + capitalization.',
  '- Preserve the user\'s meaning and word choice. Do NOT paraphrase, summarize, translate, or add information that isn\'t there.',
  '- Output ONLY the cleaned text. No preface, no explanation, no quotation marks around the result.',
].join('\n');

export function buildPrompt(request: PromptBuildRequest): BuiltPrompt {
  const context = detectContext(request.activeApp);
  const contextStyle = CONTEXT_STYLE[context];
  const system = `${BASE_SYSTEM}\n\n${contextStyle}`;
  const titleHint = request.activeWindowTitle ? ` (window title: "${request.activeWindowTitle}")` : '';
  const user = `Active application: ${request.activeApp ?? 'unknown'}${titleHint}\n\nRaw transcription:\n"""\n${request.text}\n"""\n\nReturn the cleaned transcription only.`;
  return { context, system, user };
}
