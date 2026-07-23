"use client";

import { useCallback, useEffect, useState } from "react";
import type { ModulePermission, User } from "@/lib/types";

type AuthSnapshot = {
  currentUser: User | null;
  isMounted: boolean;
};

const authListeners = new Set<(snapshot: AuthSnapshot) => void>();
let authSnapshot: AuthSnapshot = {
  currentUser: null,
  isMounted: false,
};
let authLoadPromise: Promise<void> | null = null;

function emitAuthSnapshot(snapshot: AuthSnapshot) {
  authSnapshot = snapshot;
  authListeners.forEach((listener) => listener(authSnapshot));
}

async function loadSharedAuth() {
  if (authLoadPromise) {
    return authLoadPromise;
  }

  authLoadPromise = (async () => {
    try {
      window.localStorage.removeItem("supabase_auth_session");

      const response = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        emitAuthSnapshot({ currentUser: null, isMounted: true });
        return;
      }

      const body = (await response.json()) as { user?: User };
      emitAuthSnapshot({ currentUser: body.user ?? null, isMounted: true });
    } catch {
      emitAuthSnapshot({ currentUser: null, isMounted: true });
    } finally {
      authLoadPromise = null;
    }
  })();

  return authLoadPromise;
}

export function useAuth() {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>(authSnapshot);

  const login = useCallback((user: User) => {
    emitAuthSnapshot({ currentUser: user, isMounted: true });
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
      emitAuthSnapshot({ currentUser: null, isMounted: true });
    }
  }, []);

  const loadAuth = useCallback(async () => {
    await loadSharedAuth();
  }, []);

  useEffect(() => {
    authListeners.add(setSnapshot);
    loadAuth();

    return () => {
      authListeners.delete(setSnapshot);
    };
  }, [loadAuth]);

  const hasPermission = (requiredPermission: ModulePermission) => {
    const { currentUser, isMounted } = snapshot;
    if (!isMounted || !currentUser) return false;
    return currentUser.permissions?.includes(requiredPermission) ?? false;
  };

  const permissions = snapshot.isMounted && snapshot.currentUser ? snapshot.currentUser.permissions : [];

  return {
    currentUser: snapshot.currentUser,
    login,
    logout,
    isMounted: snapshot.isMounted,
    hasPermission,
    permissions,
  };
}
