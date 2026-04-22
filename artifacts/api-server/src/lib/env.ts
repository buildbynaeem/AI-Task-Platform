function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export const env = {
  PORT: process.env["PORT"] ?? "8080",
  MONGODB_URI: required("MONGODB_URI"),
  JWT_SECRET: required("JWT_SECRET"),
  REDIS_URL: process.env["REDIS_URL"] ?? "redis://127.0.0.1:6379",
  QUEUE_NAME: process.env["BULL_QUEUE_NAME"] ?? "task-queue",
  NODE_ENV: process.env["NODE_ENV"] ?? "development",
};
