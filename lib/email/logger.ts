type LogLevel = "info" | "warn" | "error";

type LogEntry = {
  level: LogLevel;
  module: string;
  action: string;
  userId?: string;
  connectionId?: string;
  threadId?: string;
  duration?: number;
  error?: string;
  meta?: Record<string, unknown>;
};

function log(entry: LogEntry) {
  const timestamp = new Date().toISOString();
  const msg = `[${timestamp}] [${entry.level.toUpperCase()}] [email/${entry.module}] ${entry.action}`;

  const data: Record<string, unknown> = {};
  if (entry.userId) data.userId = entry.userId;
  if (entry.connectionId) data.connectionId = entry.connectionId;
  if (entry.threadId) data.threadId = entry.threadId;
  if (entry.duration !== undefined) data.durationMs = entry.duration;
  if (entry.error) data.error = entry.error;
  if (entry.meta) Object.assign(data, entry.meta);

  if (entry.level === "error") {
    console.error(msg, Object.keys(data).length > 0 ? JSON.stringify(data) : "");
  } else if (entry.level === "warn") {
    console.warn(msg, Object.keys(data).length > 0 ? JSON.stringify(data) : "");
  } else {
    console.log(msg, Object.keys(data).length > 0 ? JSON.stringify(data) : "");
  }
}

export const emailLog = {
  info: (module: string, action: string, meta?: Partial<LogEntry>) => log({ level: "info", module, action, ...meta }),
  warn: (module: string, action: string, meta?: Partial<LogEntry>) => log({ level: "warn", module, action, ...meta }),
  error: (module: string, action: string, meta?: Partial<LogEntry>) => log({ level: "error", module, action, ...meta }),

  /** Time an async operation and log it */
  async timed<T>(module: string, action: string, fn: () => Promise<T>, meta?: Partial<LogEntry>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      log({ level: "info", module, action, duration: Date.now() - start, ...meta });
      return result;
    } catch (err) {
      log({ level: "error", module, action, duration: Date.now() - start, error: err instanceof Error ? err.message : String(err), ...meta });
      throw err;
    }
  },
};
