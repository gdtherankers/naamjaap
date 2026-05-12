import { useState, useEffect, useCallback, createContext, useContext } from "react";
import type { AuthUser } from "@workspace/api-client-react";

export type { AuthUser };

export interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  kickedOut: boolean;
  login: () => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuthState(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [kickedOut, setKickedOut] = useState(false);

  const checkAuth = useCallback(async (isInitial: boolean) => {
    try {
      const res = await fetch("/api/auth/user", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { user: AuthUser | null };
      const newUser = data.user ?? null;

      if (!isInitial) {
        setUser((prev) => {
          if (prev != null && newUser == null) {
            setKickedOut(true);
          }
          return newUser;
        });
      } else {
        setUser(newUser);
      }
    } catch {
      setUser(null);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    checkAuth(true);
    const interval = setInterval(() => checkAuth(false), 30_000);
    return () => clearInterval(interval);
  }, [checkAuth]);

  const login = useCallback(() => {
    const base = import.meta.env.BASE_URL?.replace(/\/+$/, "") || "";
    window.location.href = `/api/login?returnTo=${encodeURIComponent(base || "/")}`;
  }, []);

  const logout = useCallback(() => {
    window.location.href = "/api/logout";
  }, []);

  return { user, isLoading, isAuthenticated: !!user, kickedOut, login, logout };
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
