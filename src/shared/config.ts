export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type WhisperModelId = 'tiny.en' | 'base.en' | 'small.en' | 'medium.en' | 'large-v3-turbo' | 'large-v3';

export interface AppConfig {
  logLevel: LogLevel;
  hotkey: string;
  whisperModel: WhisperModelId;
}

const DEFAULTS: AppConfig = {
  logLevel: 'info',
  hotkey: 'Command+Alt+Z',
  whisperModel: 'large-v3-turbo',
};

const VALID_LOG_LEVELS: ReadonlyArray<LogLevel> = ['debug', 'info', 'warn', 'error'];
const VALID_MODELS: ReadonlyArray<WhisperModelId> = [
  'tiny.en',
  'base.en',
  'small.en',
  'medium.en',
  'large-v3-turbo',
  'large-v3',
];

function parseLogLevel(value: string | undefined): LogLevel {
  if (value && (VALID_LOG_LEVELS as ReadonlyArray<string>).includes(value)) {
    return value as LogLevel;
  }
  return DEFAULTS.logLevel;
}

function parseModel(value: string | undefined): WhisperModelId {
  if (value && (VALID_MODELS as ReadonlyArray<string>).includes(value)) {
    return value as WhisperModelId;
  }
  return DEFAULTS.whisperModel;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    logLevel: parseLogLevel(env.LOG_LEVEL),
    hotkey: env.VOXFLOW_HOTKEY || DEFAULTS.hotkey,
    whisperModel: parseModel(env.VOXFLOW_WHISPER_MODEL),
  };
}
