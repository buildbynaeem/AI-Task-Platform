import { Schema, model, Types, type InferSchemaType, type Model } from "mongoose";

export const TASK_OPERATIONS = ["uppercase", "lowercase", "reverse", "wordcount"] as const;
export type TaskOperation = (typeof TASK_OPERATIONS)[number];

export const TASK_STATUSES = ["pending", "running", "success", "failed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

const logEntrySchema = new Schema(
  {
    at: { type: Date, default: () => new Date() },
    level: { type: String, enum: ["info", "warn", "error"], default: "info" },
    message: { type: String, required: true },
  },
  { _id: false },
);

const taskSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    input: { type: String, required: true },
    operation: { type: String, enum: TASK_OPERATIONS, required: true },
    status: { type: String, enum: TASK_STATUSES, default: "pending", index: true },
    result: { type: String, default: null },
    error: { type: String, default: null },
    logs: { type: [logEntrySchema], default: [] },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type TaskDoc = InferSchemaType<typeof taskSchema> & { _id: unknown };
export const Task: Model<TaskDoc> = model<TaskDoc>("Task", taskSchema);
