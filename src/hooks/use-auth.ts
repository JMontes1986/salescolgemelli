"use client";

import { useCallback, useEffect, useState } from "react";
import type { ModulePermission, User } from "@/lib/types";

export function useAuth() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const login = useCallback((user: User) => {
    setCurrentUser(user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      // The UI should still return to the access page if the network drops.
    } finally {
      setCurrentUser(null);
    }
  }, []);

  const loadAuth = useCallback(async () => {
    try {
      window.localStorage.removeItem("supabase_auth_session");

      const response = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        setCurrentUser(null);
        return;
      }

      const body = (await response.json()) as { user?: User };
      setCurrentUser(body.user ?? null);
    } catch {
      setCurrentUser(null);
    } finally {
      setIsMounted(true);
    }
  }, []);

  useEffect(() => {
    loadAuth();
  }, [loadAuth]);

  const hasPermission = (requiredPermission: ModulePermission) => {
    if (!isMounted || !currentUser) return false;
    return currentUser.permissions?.includes(requiredPermission) ?? false;
  };

  const permissions = isMounted && currentUser ? currentUser.permissions : [];

  return {
    currentUser,
    login,
    logout,
    isMounted,
    hasPermission,
    permissions,
  };
}
