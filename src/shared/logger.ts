type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogContext = Record<string, unknown>;

let debugEnabled = false;

function sanitize(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message
    };
  }

  if (Array.isArray(value)) {
    return value.map(sanitize);
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('dataurl') ||
      lowerKey.includes('base64') ||
      lowerKey.includes('binary') ||
      lowerKey.includes('blob') ||
      lowerKey.includes('file')
    ) {
      result[key] = '[redacted]';
      continue;
    }
    result[key] = sanitize(entry);
  }

  return result;
}

function write(level: LogLevel, message: string, context?: LogContext): void {
  if (level === 'debug' && !debugEnabled) {
    return;
  }

  const payload = {
    at: new Date().toISOString(),
    level,
    message,
    context: context ? sanitize(context) : undefined
  };

  const writer = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  writer(`[AI Screenshot Attacher] ${message}`, payload);
}

export const logger = {
  configure(options: { debug: boolean }) {
    debugEnabled = options.debug;
  },
  debug(message: string, context?: LogContext) {
    write('debug', message, context);
  },
  info(message: string, context?: LogContext) {
    write('info', message, context);
  },
  warn(message: string, context?: LogContext) {
    write('warn', message, context);
  },
  error(message: string, context?: LogContext) {
    write('error', message, context);
  }
};
