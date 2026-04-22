import { Router, type IRouter } from "express";
import { User } from "../models/User";
import { hashPassword, signToken, verifyPassword } from "../lib/auth";

const router: IRouter = Router();

router.post("/register", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "email and password are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "password must be at least 8 characters" });
  }
  const normalized = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalized });
  if (existing) {
    return res.status(409).json({ error: "email already registered" });
  }
  const passwordHash = await hashPassword(password);
  const user = await User.create({ email: normalized, passwordHash });
  const token = signToken({ sub: String(user._id), email: normalized });
  return res.status(201).json({
    token,
    user: { id: String(user._id), email: normalized },
  });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "email and password are required" });
  }
  const normalized = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalized });
  if (!user) {
    return res.status(401).json({ error: "invalid credentials" });
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "invalid credentials" });
  }
  const token = signToken({ sub: String(user._id), email: normalized });
  return res.json({
    token,
    user: { id: String(user._id), email: normalized },
  });
});

export default router;
