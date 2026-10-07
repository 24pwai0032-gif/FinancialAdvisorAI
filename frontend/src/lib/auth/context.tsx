"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ApiError, AuthStatus, User } from "./types";

type LoginResult = { ok: true } | { ok: false; error: ApiError };

type AuthContextValue = {
  user: User | null;
  status: AuthStatus;
  login: (email: string, password: string, captchaToken?: string) => Promise<LoginResult>;
  /** Continue with Google — exchanges a Google ID token for an app session. */
  signInWithGoogle: (idToken: string) => Promise<LoginResult>;
  /** Establish the in-memory session from an access token (verify-email auto-login). */
  completeSession: (accessToken: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Authenticated fetch to the BFF proxy; injects the in-memory access token. */
  authedFetch: (path: string, init?: RequestInit) => Promise<Response>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  // Access token lives in memory only (never localStorage/cookie) — an XSS that
  // runs can't pull it from storage, and it's gone on refresh (re-minted from
  // the httpOnly refresh cookie via /api/auth/refresh).
  const accessToken = useRef<string | null>(null);

  const fetchMe = useCallback(async (): Promise<User | null> => {
    if (!accessToken.current) return null;
    const res = await fetch("/api/backend/auth/me", {
      headers: { authorization: `Bearer ${accessToken.current}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as User;
  }, []);

  const tryRefresh = useCallback(async (): Promise<boolean> => {
    const res = await fetch("/api/auth/refresh", { method: "POST" });
    if (!res.ok || res.status === 204) return false; // 204 = no session cookie
    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) return false;
    accessToken.current = data.access_token;
    return true;
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await fetchMe();
    setUser(me);
    setStatus(me ? "authenticated" : "unauthenticated");
  }, [fetchMe]);

  // Boot: restore an in-memory session from the refresh cookie.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await tryRefresh();
      if (cancelled) return;
      if (!ok) {
        setStatus("unauthenticated");
        return;
      }
      const me = await fetchMe();
      if (cancelled) return;
      setUser(me);
      setStatus(me ? "authenticated" : "unauthenticated");
    })();
    return () => {
      cancelled = true;
    };
  }, [tryRefresh, fetchMe]);

  // Set the in-memory access token and hydrate the user — shared by password
  // login, Google sign-in, and verify-email auto-login.
  const finishAuth = useCallback(
    async (token: string): Promise<boolean> => {
      accessToken.current = token;
      const me = await fetchMe();
      setUser(me);
      setStatus(me ? "authenticated" : "unauthenticated");
      return !!me;
    },
    [fetchMe],
  );

  const login = useCallback<AuthContextValue["login"]>(
    async (email, password, captchaToken) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, captcha_token: captchaToken }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data as ApiError };
      await finishAuth((data as { access_token: string }).access_token);
      return { ok: true };
    },
    [finishAuth],
  );

  const signInWithGoogle = useCallback<AuthContextValue["signInWithGoogle"]>(
    async (idToken) => {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id_token: idToken }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data as ApiError };
      await finishAuth((data as { access_token: string }).access_token);
      return { ok: true };
    },
    [finishAuth],
  );

  const completeSession = useCallback<AuthContextValue["completeSession"]>(
    (token) => finishAuth(token),
    [finishAuth],
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    accessToken.current = null;
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const authedFetch = useCallback<AuthContextValue["authedFetch"]>(
    async (path, init = {}) => {
      const withAuth = (): RequestInit => ({
        ...init,
        headers: {
          ...(init.headers ?? {}),
          ...(accessToken.current
            ? { authorization: `Bearer ${accessToken.current}` }
            : {}),
        },
      });
      let res = await fetch(`/api/backend${path}`, withAuth());
      // One transparent refresh-and-retry on 401.
      if (res.status === 401 && (await tryRefresh())) {
        res = await fetch(`/api/backend${path}`, withAuth());
      }
      return res;
    },
    [tryRefresh],
  );

  return (
    <AuthContext.Provider
      value={{ user, status, login, signInWithGoogle, completeSession, logout, refreshUser, authedFetch }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
