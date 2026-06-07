"use client";

import { useCallback, useEffect, useState } from "react";
import type { ModulePermission, User } from "@/lib/types";
import {
  getAuthenticatedUser,
  refreshAuthenticatedSession,
  signOutAuthenticatedUser,
  type SupabaseAuthSession,
} from "@/lib/services/user-service";

const AUTH_SESSION_KEY = "supabase_auth_session";

type StoredSession = SupabaseAuthSession & {
  expires_at: number;
};

function getExpiresAt(session: SupabaseAuthSession): number {
  if (session.expires_at) {
    return session.expires_at;
  }

  return Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600);
}

function normalizeSession(session: SupabaseAuthSession): StoredSession {
  return {
    ...session,
    expires_at: getExpiresAt(session),
  };
}

function readStoredSession(): StoredSession | null {
  const storedValue = localStorage.getItem(AUTH_SESSION_KEY);

  if (!storedValue) {
    return null;
  }

  return JSON.parse(storedValue) as StoredSession;
}

function writeStoredSession(session: SupabaseAuthSession) {
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(normalizeSession(session)));
}

function clearStoredSession() {
  localStorage.removeItem(AUTH_SESSION_KEY);
}

function sessionExpiresSoon(session: StoredSession) {
  return session.expires_at <= Math.floor(Date.now() / 1000) + 60;
}

export function useAuth() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const login = useCallback((user: User, authSession: SupabaseAuthSession) => {
    const normalizedSession = normalizeSession(authSession);

    try {
      writeStoredSession(normalizedSession);
    } catch (error) {
      console.warn("Could not persist Supabase auth session.", error);
    }

    setSession(normalizedSession);
    setCurrentUser(user);
  }, []);

  const logout = useCallback(async () => {
    const activeSession = session ?? readStoredSession();

    try {
      if (activeSession?.access_token) {
        await signOutAuthenticatedUser(activeSession.access_token);
      }
    } catch (error) {
      console.warn("Could not sign out from Supabase Auth.", error);
    } finally {
      clearStoredSession();
      setSession(null);
      setCurrentUser(null);
    }
  }, [session]);

  const loadAuth = useCallback(async () => {
    try {
      let storedSession = readStoredSession();

      if (!storedSession) {
        setCurrentUser(null);
        return;
      }

      if (sessionExpiresSoon(storedSession)) {
        const refreshedAuth = await refreshAuthenticatedSession(storedSession.refresh_token);

        if (!refreshedAuth) {
          clearStoredSession();
          setCurrentUser(null);
          return;
        }

        storedSession = normalizeSession(refreshedAuth.session);
        writeStoredSession(storedSession);
        setSession(storedSession);
        setCurrentUser(refreshedAuth.user);
        return;
      }

      const user = await getAuthenticatedUser(storedSession.access_token);

      if (!user) {
        clearStoredSession();
        setCurrentUser(null);
        return;
      }

      setSession(storedSession);
      setCurrentUser(user);
    } catch (error) {
      console.warn("Could not load Supabase auth session.", error);
      clearStoredSession();
      setSession(null);
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
    session,
    login,
    logout,
    isMounted,
    hasPermission,
    permissions,
  };
}
