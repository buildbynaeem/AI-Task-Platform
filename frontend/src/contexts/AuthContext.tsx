import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  apiFetch,
  getToken,
  setToken,
  UNAUTHORIZED_EVENT,
  type AuthResponse,
} from "@/lib/api";

interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface JwtPayload {
  sub: string;
  email: string;
  exp?: number;
}

function decodeJwt(token: string): JwtPayload | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (token) {
      const decoded = decodeJwt(token);
      const expired = decoded?.exp ? decoded.exp * 1000 < Date.now() : false;
      if (decoded && !expired) {
        setUser({ id: decoded.sub, email: decoded.email });
      } else {
        setToken(null);
      }
    }
    setLoading(false);
  }, []);

  const handleAuthResponse = useCallback((res: AuthResponse) => {
    setToken(res.token);
    setUser(res.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await apiFetch<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      handleAuthResponse(res);
    },
    [handleAuthResponse],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      const res = await apiFetch<AuthResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      handleAuthResponse(res);
    },
    [handleAuthResponse],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  // React to 401s emitted from anywhere in the app (e.g. an expired JWT
  // detected by `apiFetch`) by clearing user state so the router can redirect
  // back to /auth instead of polling failing requests forever.
  useEffect(() => {
    const handler = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, handler);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
