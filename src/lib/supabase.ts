type SupabaseRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  prefer?: string;
  accessToken?: string;
};

const AUTH_SESSION_KEY = "supabase_auth_session";
const SESSION_EXPIRY_MARGIN_SECONDS = 60;

type StoredSupabaseSession = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
};

let refreshStoredSessionPromise: Promise<string | null> | null = null;

export function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase no está configurado. Define NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en Netlify o en .env.local.'
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}

function buildUrl(path: string, query?: SupabaseRequestOptions['query']) {
  const { supabaseUrl } = getSupabaseEnv();
  const url = new URL(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${path}`);

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

function getExpiresAt(session: StoredSupabaseSession): number | undefined {
  if (session.expires_at) {
    return session.expires_at;
  }

  if (session.expires_in) {
    return Math.floor(Date.now() / 1000) + session.expires_in;
  }

  return undefined;
}

function normalizeStoredSession(session: StoredSupabaseSession): StoredSupabaseSession {
  return {
    ...session,
    expires_at: getExpiresAt(session),
  };
}

function readStoredSession(): StoredSupabaseSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storedSession = window.localStorage.getItem(AUTH_SESSION_KEY);

    if (!storedSession) {
      return null;
    }

    return normalizeStoredSession(JSON.parse(storedSession) as StoredSupabaseSession);
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredSupabaseSession) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(normalizeStoredSession(session)));
}

function clearStoredSession() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(AUTH_SESSION_KEY);
}

function sessionExpiresSoon(session: StoredSupabaseSession) {
  if (!session.expires_at) {
    return false;
  }

  return session.expires_at <= Math.floor(Date.now() / 1000) + SESSION_EXPIRY_MARGIN_SECONDS;
}

function buildAuthUrl(path: string, query?: SupabaseRequestOptions['query']) {
  const { supabaseUrl } = getSupabaseEnv();
  const url = new URL(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/${path}`);

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

async function refreshStoredSession(): Promise<string | null> {
  const storedSession = readStoredSession();

  if (!storedSession?.refresh_token) {
    clearStoredSession();
    return null;
  }

  if (!refreshStoredSessionPromise) {
    refreshStoredSessionPromise = (async () => {
      try {
        const refreshedSession = await supabaseAuthRequest<StoredSupabaseSession>('token', {
          method: 'POST',
          query: { grant_type: 'refresh_token' },
          body: {
            refresh_token: storedSession.refresh_token,
          },
        });

        if (!refreshedSession.access_token || !refreshedSession.refresh_token) {
          clearStoredSession();
          return null;
        }

        writeStoredSession(refreshedSession);
        return refreshedSession.access_token;
      } catch (error) {
        clearStoredSession();
        throw error;
      } finally {
        refreshStoredSessionPromise = null;
      }
    })();
  }

  return refreshStoredSessionPromise;
}

async function getStoredAccessToken() {
  const storedSession = readStoredSession();

  if (!storedSession?.access_token) {
    return null;
  }

  if (sessionExpiresSoon(storedSession)) {
    return refreshStoredSession();
  }

  return storedSession.access_token;
}

async function getRetryAccessToken(previousAccessToken: string | null) {
  const storedSession = readStoredSession();

  if (storedSession?.access_token && storedSession.access_token !== previousAccessToken) {
    return storedSession.access_token;
  }

  return refreshStoredSession();
}

async function parseSupabaseError(response: Response) {
  const message = await response.text();

  try {
    return {
      message,
      parsed: JSON.parse(message) as { code?: string; message?: string },
    };
  } catch {
    return { message, parsed: null };
  }
}

function isExpiredJwtError(status: number, parsedError: { code?: string; message?: string } | null) {
  if (status !== 401) {
    return false;
  }

  const message = parsedError?.message?.toLowerCase() ?? '';
  return parsedError?.code === 'PGRST303' || message.includes('jwt expired');
}

export async function supabaseRequest<T>(path: string, options: SupabaseRequestOptions = {}): Promise<T> {
  const { supabaseAnonKey } = getSupabaseEnv();
  const accessToken = options.accessToken ?? await getStoredAccessToken();

  const requestUrl = buildUrl(path, options.query);
  const headers: Record<string, string> = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${accessToken ?? supabaseAnonKey}`,
    'Content-Type': 'application/json',
    ...(options.prefer ? { Prefer: options.prefer } : {}),
  };
  const requestInit: RequestInit = {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  };

  let response = await fetch(requestUrl, requestInit);

  if (!response.ok) {
    const { message, parsed } = await parseSupabaseError(response);

    if (!options.accessToken && isExpiredJwtError(response.status, parsed)) {
      const retryAccessToken = await getRetryAccessToken(accessToken);

      if (retryAccessToken) {
        response = await fetch(requestUrl, {
          ...requestInit,
          headers: {
            ...headers,
            Authorization: `Bearer ${retryAccessToken}`,
          },
        });

        if (response.ok) {
          if (response.status === 204) {
            return undefined as T;
          }

          const retryResponseBody = await response.text();
          return retryResponseBody ? JSON.parse(retryResponseBody) as T : undefined as T;
        }
      }
    }

    throw new Error(`Supabase request failed (${response.status}): ${message}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const responseBody = await response.text();
  if (!responseBody) {
    return undefined as T;
  }

  return JSON.parse(responseBody) as T;
}

export async function supabaseAuthRequest<T>(
  path: string,
  options: SupabaseRequestOptions & { accessToken?: string } = {}
): Promise<T> {
  const { supabaseAnonKey } = getSupabaseEnv();

  const response = await fetch(buildAuthUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${options.accessToken ?? supabaseAnonKey}`,
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase Auth request failed (${response.status}): ${message}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function selectRows<T>(table: string, query: SupabaseRequestOptions['query'] = {}): Promise<T[]> {
  return supabaseRequest<T[]>(table, { query: { select: '*', ...query } });
}

export async function selectSingle<T>(table: string, query: SupabaseRequestOptions['query'] = {}): Promise<T | null> {
  const rows = await selectRows<T>(table, { ...query, limit: 1 });
  return rows[0] ?? null;
}

export async function insertRow<T>(table: string, row: unknown, accessToken?: string): Promise<T> {
  const rows = await supabaseRequest<T[]>(table, {
    method: 'POST',
    body: row,
    prefer: 'return=representation',
    accessToken,
  });
  return rows[0];
}

export async function insertRowMinimal(table: string, row: unknown, accessToken?: string): Promise<void> {
  await supabaseRequest<void>(table, {
    method: 'POST',
    body: row,
    prefer: 'return=minimal',
    accessToken,
  });
}

export async function upsertRow<T>(table: string, row: unknown, onConflict = 'id'): Promise<T> {
  const rows = await supabaseRequest<T[]>(table, {
    method: 'POST',
    query: { on_conflict: onConflict },
    body: row,
    prefer: 'resolution=merge-duplicates,return=representation',
  });
  return rows[0];
}

export async function callRpc<T>(functionName: string, body: unknown): Promise<T> {
  return supabaseRequest<T>(`rpc/${functionName}`, {
    method: 'POST',
    body,
  });
}

export async function updateRows<T>(table: string, query: SupabaseRequestOptions['query'], patch: unknown): Promise<T[]> {
  return supabaseRequest<T[]>(table, {
    method: 'PATCH',
    query: { select: '*', ...query },
    body: patch,
    prefer: 'return=representation',
  });
}

export async function updateById<T>(table: string, id: string, patch: unknown): Promise<T | null> {
  const rows = await updateRows<T>(table, { id: `eq.${id}` }, patch);
  return rows[0] ?? null;
}
