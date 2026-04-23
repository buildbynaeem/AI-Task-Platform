import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Sparkles } from "lucide-react";

export default function AuthPage() {
  const { login, register } = useAuth();
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password);
      }
      setLocation("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-card overflow-hidden border shadow-sm mx-auto mb-2">
            <img src="/logo.webp" alt="Logo" className="h-full w-full object-cover" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">AI Task Platform</h1>
          <p className="text-sm text-muted-foreground">
            Queue text-processing jobs, watch them run, see the results.
          </p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Sign in or create a new account to get started.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={mode} onValueChange={(v) => setMode(v as "login" | "register")}>
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="login" data-testid="tab-login">Sign in</TabsTrigger>
                <TabsTrigger value="register" data-testid="tab-register">Create account</TabsTrigger>
              </TabsList>
              <TabsContent value={mode} forceMount>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      data-testid="input-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder={mode === "register" ? "Min 6 characters" : "••••••••"}
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      data-testid="input-password"
                    />
                  </div>
                  {error && (
                    <p className="text-sm text-destructive" data-testid="text-auth-error">
                      {error}
                    </p>
                  )}
                  <Button type="submit" className="w-full" disabled={submitting} data-testid="button-submit-auth">
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {mode === "login" ? "Sign in" : "Create account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
