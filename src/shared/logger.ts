import type { Config } from "./config.ts";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export function createLogger(config: Config): Logger {
  const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

  const log = (level: keyof typeof LEVELS, msg: string, meta?: Record<string, unknown>) => {
    if (LEVELS[level] < threshold) return;
    const entry = {
      level,
      time: new Date().toISOString(),
      msg,
      ...meta,
    };
    // one JSON object per line -> parseable by log shippers
    console[level === "debug" ? "log" : level](JSON.stringify(entry));
  };

  return {
    debug: (m, meta) => log("debug", m, meta),
    info: (m, meta) => log("info", m, meta),
    warn: (m, meta) => log("warn", m, meta),
    error: (m, meta) => log("error", m, meta),
  };
}
