import type { LogLevel } from './config.js';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface LoggerOptions {
  level: LogLevel;
  sink?: (level: LogLevel, message: string, args: unknown[]) => void;
}

function defaultSink(level: LogLevel, message: string, args: unknown[]): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (level === 'error') {
    console.error(line, ...args);
  } else if (level === 'warn') {
    console.warn(line, ...args);
  } else {
    console.log(line, ...args);
  }
}

export function createLogger(options: LoggerOptions): Logger {
  const sink = options.sink ?? defaultSink;
  const threshold = LEVEL_PRIORITY[options.level];

  function shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= threshold;
  }

  return {
    debug(message, ...args) {
      if (shouldLog('debug')) sink('debug', message, args);
    },
    info(message, ...args) {
      if (shouldLog('info')) sink('info', message, args);
    },
    warn(message, ...args) {
      if (shouldLog('warn')) sink('warn', message, args);
    },
    error(message, ...args) {
      if (shouldLog('error')) sink('error', message, args);
    },
  };
}
