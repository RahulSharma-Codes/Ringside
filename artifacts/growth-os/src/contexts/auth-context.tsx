import React, { createContext, useContext, useMemo } from "react";

export type AppRole = "Admin" | "Deal Lead" | "Member" | "IC Voter";

export interface AuthUser {
  userId: string;
  companyId: string;
  email: string;
  role: AppRole;
  displayName?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** True if role is Admin or Deal Lead */
  canEditDeal: boolean;
  /** True if role is Admin */
  isAdmin: boolean;
  /** True if role is IC Voter, Admin, or Deal Lead */
  canVote: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  canEditDeal: false,
  isAdmin: false,
  canVote: false,
});

const AUTH_TOKEN_KEY = "ig_os_auth_token";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1];
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded + "==".slice(0, (4 - (padded.length % 4)) % 4));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const user = useMemo<AuthUser | null>(() => {
    if (typeof window === "undefined") return null;
    const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return null;
    const payload = decodeJwtPayload(token);
    if (!payload) return null;
    const exp = typeof payload.exp === "number" ? payload.exp : 0;
    if (exp && exp * 1000 < Date.now()) return null;
    const role = (payload.role as AppRole) ?? "Member";
    return {
      userId: String(payload.userId ?? ""),
      companyId: String(payload.companyId ?? ""),
      email: String(payload.email ?? ""),
      role,
      displayName: typeof payload.displayName === "string" ? payload.displayName : undefined,
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    canEditDeal: user?.role === "Admin" || user?.role === "Deal Lead",
    isAdmin: user?.role === "Admin",
    canVote: user?.role === "Admin" || user?.role === "Deal Lead" || user?.role === "IC Voter",
  }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
