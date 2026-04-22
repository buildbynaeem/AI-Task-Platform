import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "./logger";

let connected = false;

export async function connectMongo(): Promise<void> {
  if (connected) return;
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    dbName: env.MONGODB_DB_NAME,
  });
  connected = true;
  logger.info("MongoDB connected");
}

export function isMongoHealthy(): boolean {
  return mongoose.connection.readyState === 1;
}

export { mongoose };
