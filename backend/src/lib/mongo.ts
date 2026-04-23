import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "./logger";

let connected = false;

export async function connectMongo(): Promise<void> {
  if (connected) return;
  mongoose.set("strictQuery", true);
  
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    try {
      await mongoose.connect(env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000,
        dbName: env.MONGODB_DB_NAME,
      });
      connected = true;
      logger.info("MongoDB connected");
      return;
    } catch (err) {
      attempts++;
      logger.warn({ attempts, maxAttempts, err }, "Failed to connect to MongoDB, retrying...");
      if (attempts >= maxAttempts) throw err;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

export function isMongoHealthy(): boolean {
  return mongoose.connection.readyState === 1;
}

export { mongoose };
