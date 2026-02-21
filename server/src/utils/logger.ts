import pino from 'pino';

/**
 * Create a logger instance
 */
export function createLogger(name: string, options: pino.LoggerOptions = {}): pino.Logger {
  const isDev = process.env.NODE_ENV !== 'production';

  return pino({
    name,
    level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    transport: isDev
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
    ...options,
  });
}

/**
 * Default logger instance
 */
export const logger = createLogger('hourglass');
