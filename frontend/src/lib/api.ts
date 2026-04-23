const TOKEN_KEY = "ai-task-platform.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export const UNAUTHORIZED_EVENT = "ai-task-platform:unauthorized";

export function emitUnauthorized(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
  }
}

const BASE = (import.meta.env.VITE_API_URL || "/").replace(/\/$/, "");

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string> | undefined) ?? {}),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // In development (via Vite proxy) or production (via Ingress), 
  // /api routes are handled by the backend.
  const res = await fetch(`${BASE}/api${path}`, { ...options, headers });

  if (res.status === 401) {
    setToken(null);
    emitUnauthorized();
  }

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : null) ?? `Request failed (${res.status})`;
    throw new Error(message);
  }

  return body as T;
}

export type TaskOperation = "uppercase" | "lowercase" | "reverse" | "wordcount";
export type TaskStatus = "pending" | "running" | "success" | "failed";

export interface TaskLog {
  level: string;
  message: string;
  at: string;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  input: string;
  operation: TaskOperation;
  status: TaskStatus;
  result: string | null;
  error: string | null;
  logs: TaskLog[];
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  token: string;
  user: { id: string; email: string };
}
