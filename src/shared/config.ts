export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type TranscriptionProvider = 'local' | 'groq' | 'none';
export type WhisperModelId = 'tiny.en' | 'base.en' | 'small.en' | 'medium.en' | 'large-v3-turbo' | 'large-v3';

export interface AppConfig {
  logLevel: LogLevel;
  groqApiKey: string | undefined;
  awsRegion: string;
  awsAccessKeyId: string | undefined;
  awsSecretAccessKey: string | undefined;
  hotkey: string;
  transcriptionProvider: TranscriptionProvider;
  whisperModel: WhisperModelId;
}

const DEFAULTS: AppConfig = {
  logLevel: 'info',
  groqApiKey: undefined,
  awsRegion: 'us-east-1',
  awsAccessKeyId: undefined,
  awsSecretAccessKey: undefined,
  hotkey: 'Command+Alt+Z',
  // Privacy-first default — audio never leaves the machine unless the user
  // explicitly opts into `groq` in the Settings tab.
  transcriptionProvider: 'local',
  whisperModel: 'large-v3-turbo',
};

const VALID_LOG_LEVELS: ReadonlyArray<LogLevel> = ['debug', 'info', 'warn', 'error'];
const VALID_PROVIDERS: ReadonlyArray<TranscriptionProvider> = ['local', 'groq', 'none'];
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

function parseProvider(value: string | undefined): TranscriptionProvider {
  if (value && (VALID_PROVIDERS as ReadonlyArray<string>).includes(value)) {
    return value as TranscriptionProvider;
  }
  return DEFAULTS.transcriptionProvider;
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
    groqApiKey: env.GROQ_API_KEY || undefined,
    awsRegion: env.AWS_REGION || DEFAULTS.awsRegion,
    awsAccessKeyId: env.AWS_ACCESS_KEY_ID || undefined,
    awsSecretAccessKey: env.AWS_SECRET_ACCESS_KEY || undefined,
    hotkey: env.VOXFLOW_HOTKEY || DEFAULTS.hotkey,
    transcriptionProvider: parseProvider(env.VOXFLOW_TRANSCRIPTION_PROVIDER),
    whisperModel: parseModel(env.VOXFLOW_WHISPER_MODEL),
  };
}
