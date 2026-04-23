export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AppConfig {
  logLevel: LogLevel;
  groqApiKey: string | undefined;
  awsRegion: string;
  awsAccessKeyId: string | undefined;
  awsSecretAccessKey: string | undefined;
  hotkey: string;
}

const DEFAULTS: AppConfig = {
  logLevel: 'info',
  groqApiKey: undefined,
  awsRegion: 'us-east-1',
  awsAccessKeyId: undefined,
  awsSecretAccessKey: undefined,
  hotkey: 'CommandOrControl+Shift+Space',
};

const VALID_LOG_LEVELS: ReadonlyArray<LogLevel> = ['debug', 'info', 'warn', 'error'];

function parseLogLevel(value: string | undefined): LogLevel {
  if (value && (VALID_LOG_LEVELS as ReadonlyArray<string>).includes(value)) {
    return value as LogLevel;
  }
  return DEFAULTS.logLevel;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    logLevel: parseLogLevel(env.LOG_LEVEL),
    groqApiKey: env.GROQ_API_KEY || undefined,
    awsRegion: env.AWS_REGION || DEFAULTS.awsRegion,
    awsAccessKeyId: env.AWS_ACCESS_KEY_ID || undefined,
    awsSecretAccessKey: env.AWS_SECRET_ACCESS_KEY || undefined,
    hotkey: env.VOXFLOW_HOTKEY || DEFAULTS.hotkey,
  };
}
