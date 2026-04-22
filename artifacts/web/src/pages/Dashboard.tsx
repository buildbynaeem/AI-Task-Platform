import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch, type Task, type TaskOperation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, LogOut, Plus, RefreshCw, Sparkles, CheckCircle2, XCircle, Clock, Play } from "lucide-react";

const OPERATIONS: { value: TaskOperation; label: string }[] = [
  { value: "uppercase", label: "Uppercase" },
  { value: "lowercase", label: "Lowercase" },
  { value: "reverse", label: "Reverse" },
  { value: "wordcount", label: "Word count" },
];

function statusBadge(status: Task["status"]) {
  const map: Record<Task["status"], { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode; label: string }> = {
    pending: { variant: "outline", icon: <Clock className="h-3 w-3" />, label: "Pending" },
    running: { variant: "secondary", icon: <Play className="h-3 w-3" />, label: "Running" },
    success: { variant: "default", icon: <CheckCircle2 className="h-3 w-3" />, label: "Success" },
    failed: { variant: "destructive", icon: <XCircle className="h-3 w-3" />, label: "Failed" },
  };
  const m = map[status];
  return (
    <Badge variant={m.variant} className="gap-1" data-testid={`badge-status-${status}`}>
      {m.icon}
      {m.label}
    </Badge>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [input, setInput] = useState("");
  const [operation, setOperation] = useState<TaskOperation>("uppercase");
  const [createError, setCreateError] = useState<string | null>(null);

  const tasksQuery = useQuery<{ tasks: Task[] }>({
    queryKey: ["tasks"],
    queryFn: () => apiFetch<{ tasks: Task[] }>("/tasks"),
    refetchInterval: 2500,
  });

  const tasks = tasksQuery.data?.tasks ?? [];
  const hasActive = tasks.some((t) => t.status === "pending" || t.status === "running");

  const createMutation = useMutation({
    mutationFn: (payload: { title: string; input: string; operation: TaskOperation }) =>
      apiFetch<Task>("/tasks", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setTitle("");
      setInput("");
      setOperation("uppercase");
      setCreateError(null);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err: unknown) => {
      setCreateError(err instanceof Error ? err.message : "Failed to create task");
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (!title.trim() || !input.trim()) {
      setCreateError("Title and input are required");
      return;
    }
    createMutation.mutate({ title: title.trim(), input, operation });
  }

  const counts = {
    total: tasks.length,
    success: tasks.filter((t) => t.status === "success").length,
    failed: tasks.filter((t) => t.status === "failed").length,
    inFlight: tasks.filter((t) => t.status === "pending" || t.status === "running").length,
  };

  return (
    <div className="min-h-screen w-full bg-background">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">AI Task Platform</h1>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => tasksQuery.refetch()}
              disabled={tasksQuery.isFetching}
              data-testid="button-refresh"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${tasksQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={logout} data-testid="button-logout">
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <section className="grid gap-4 sm:grid-cols-4">
          <StatCard label="Total tasks" value={counts.total} />
          <StatCard label="In flight" value={counts.inFlight} hint={hasActive ? "Worker is busy" : "Idle"} />
          <StatCard label="Successful" value={counts.success} accent="success" />
          <StatCard label="Failed" value={counts.failed} accent="destructive" />
        </section>

        <section className="grid gap-8 lg:grid-cols-[420px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" /> New task
              </CardTitle>
              <CardDescription>
                Submit text and a transformation. The Python worker will process it asynchronously.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    placeholder="Friendly name"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    data-testid="input-task-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="operation">Operation</Label>
                  <Select value={operation} onValueChange={(v) => setOperation(v as TaskOperation)}>
                    <SelectTrigger id="operation" data-testid="select-operation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATIONS.map((op) => (
                        <SelectItem key={op.value} value={op.value} data-testid={`option-${op.value}`}>
                          {op.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="input">Input text</Label>
                  <Textarea
                    id="input"
                    placeholder="Paste or type the text you want to process…"
                    rows={5}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    data-testid="input-task-text"
                  />
                </div>
                {createError && (
                  <p className="text-sm text-destructive" data-testid="text-create-error">
                    {createError}
                  </p>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createMutation.isPending}
                  data-testid="button-create-task"
                >
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit task
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your tasks</CardTitle>
              <CardDescription>
                Auto-refreshes every couple of seconds. Most recent first.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {tasksQuery.isLoading && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading tasks…
                </div>
              )}
              {tasksQuery.isError && (
                <p className="text-sm text-destructive">Failed to load tasks: {(tasksQuery.error as Error).message}</p>
              )}
              {!tasksQuery.isLoading && tasks.length === 0 && (
                <div className="text-sm text-muted-foreground border border-dashed rounded-lg px-4 py-8 text-center">
                  No tasks yet — submit your first one on the left.
                </div>
              )}
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number;
  hint?: string;
  accent?: "success" | "destructive";
}) {
  const accentClass =
    accent === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : accent === "destructive"
        ? "text-destructive"
        : "text-foreground";
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-1 text-3xl font-semibold tabular-nums ${accentClass}`}>{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function TaskRow({ task }: { task: Task }) {
  const lastLog = task.logs[task.logs.length - 1];
  return (
    <div
      className="border rounded-lg p-4 space-y-2 hover-elevate"
      data-testid={`task-row-${task.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium truncate" data-testid={`text-task-title-${task.id}`}>{task.title}</p>
          <p className="text-xs text-muted-foreground">
            {task.operation} · {new Date(task.createdAt).toLocaleTimeString()}
          </p>
        </div>
        {statusBadge(task.status)}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Input</p>
          <p className="font-mono text-xs bg-muted rounded px-2 py-1.5 break-words whitespace-pre-wrap">
            {task.input}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Result</p>
          <p
            className="font-mono text-xs bg-muted rounded px-2 py-1.5 break-words whitespace-pre-wrap min-h-[1.75rem]"
            data-testid={`text-task-result-${task.id}`}
          >
            {task.status === "failed"
              ? task.error ?? "(failed)"
              : task.result ?? (task.status === "success" ? "" : "…")}
          </p>
        </div>
      </div>
      {lastLog && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">{lastLog.level}:</span> {lastLog.message}
        </p>
      )}
    </div>
  );
}
