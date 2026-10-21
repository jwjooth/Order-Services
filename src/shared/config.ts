export type AppEnv = "development" | "production" | "test";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Config {
  env: AppEnv;
  host: string;
  port: number;
  databaseUrl: string;
  databaseSsl: boolean;
  logLevel: LogLevel;
}

const ENVS: AppEnv[] = ["development", "production", "test"];
const LOG_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var: ${name}`);
  return value;
}

export function loadConfig(): Config {
  const env = process.env.NODE_ENV ?? "development";
  if (!ENVS.includes(env as AppEnv)) {
    throw new Error(`invalid NODE_ENV: ${env}`);
  }

  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid PORT: ${process.env.PORT}`);
  }

  const logLevel = process.env.LOG_LEVEL ?? "info";
  if (!LOG_LEVELS.includes(logLevel as LogLevel)) {
    throw new Error(`invalid LOG_LEVEL: ${logLevel}`);
  }

  return {
    env: env as AppEnv,
    host: process.env.HOST ?? "0.0.0.0",
    port,
    databaseUrl: required("DATABASE_URL"),
    databaseSsl: process.env.DATABASE_SSL === "true",
    logLevel: logLevel as LogLevel,
  };
}
