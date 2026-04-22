import { Router, type IRouter, type Response } from "express";
import { Task, TASK_OPERATIONS, type TaskOperation } from "../models/Task";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { taskQueue } from "../lib/queue";

const router: IRouter = Router();

router.use(requireAuth);

router.post("/", async (req: AuthRequest, res: Response) => {
  const { title, input, operation } = req.body ?? {};
  if (typeof title !== "string" || typeof input !== "string" || typeof operation !== "string") {
    return res.status(400).json({ error: "title, input, and operation are required strings" });
  }
  if (!TASK_OPERATIONS.includes(operation as TaskOperation)) {
    return res.status(400).json({
      error: `operation must be one of: ${TASK_OPERATIONS.join(", ")}`,
    });
  }
  const userId = req.user!.sub;
  const task = await Task.create({
    userId,
    title: title.trim(),
    input,
    operation,
    status: "pending",
    logs: [{ level: "info", message: "Task accepted by API and enqueued" }],
  });

  await taskQueue.add(
    "process-task",
    {
      taskId: String(task._id),
      operation,
      input,
    },
    { jobId: String(task._id) },
  );

  return res.status(201).json(serializeTask(task.toObject()));
});

router.get("/", async (req: AuthRequest, res: Response) => {
  const userId = req.user!.sub;
  const tasks = await Task.find({ userId }).sort({ createdAt: -1 }).limit(100).lean();
  return res.json({ tasks: tasks.map((t) => serializeTask(t as Record<string, unknown>)) });
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  const userId = req.user!.sub;
  const task = await Task.findOne({ _id: req.params.id, userId }).lean();
  if (!task) return res.status(404).json({ error: "task not found" });
  return res.json(serializeTask(task as Record<string, unknown>));
});

function serializeTask(task: Record<string, unknown>): Record<string, unknown> {
  const { _id, __v, ...rest } = task as { _id: unknown; __v?: unknown } & Record<string, unknown>;
  void __v;
  return { id: String(_id), ...rest };
}

export default router;
