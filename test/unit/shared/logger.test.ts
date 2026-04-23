import { describe, it, expect, vi } from 'vitest';
import { createLogger } from '../../../src/shared/logger.js';
import type { LogLevel } from '../../../src/shared/config.js';

type SinkCall = [LogLevel, string, unknown[]];

function captureSink() {
  const calls: SinkCall[] = [];
  return {
    calls,
    sink: (level: LogLevel, message: string, args: unknown[]) => {
      calls.push([level, message, args]);
    },
  };
}

describe('createLogger', () => {
  it('filters messages below the configured level', () => {
    const { calls, sink } = captureSink();
    const logger = createLogger({ level: 'warn', sink });

    logger.debug('hidden');
    logger.info('hidden');
    logger.warn('visible-warn');
    logger.error('visible-error');

    expect(calls.map(([level, msg]) => `${level}:${msg}`)).toEqual([
      'warn:visible-warn',
      'error:visible-error',
    ]);
  });

  it('passes through extra args', () => {
    const { calls, sink } = captureSink();
    const logger = createLogger({ level: 'debug', sink });
    logger.info('hello', 1, { a: 2 });
    expect(calls[0]?.[2]).toEqual([1, { a: 2 }]);
  });

  it('logs everything at debug level', () => {
    const { calls, sink } = captureSink();
    const logger = createLogger({ level: 'debug', sink });

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(calls).toHaveLength(4);
  });

  it('uses default sink when none provided', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const logger = createLogger({ level: 'info' });
      logger.info('hi');
      logger.error('boom');
      expect(spy).toHaveBeenCalled();
      expect(errSpy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      errSpy.mockRestore();
    }
  });
});
