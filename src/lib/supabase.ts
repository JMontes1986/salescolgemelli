type SupabaseRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  prefer?: string;
  accessToken?: string;
};

const AUTH_SESSION_KEY = "supabase_auth_session";

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

function getStoredAccessToken() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storedSession = window.localStorage.getItem(AUTH_SESSION_KEY);

    if (!storedSession) {
      return null;
    }

    const parsedSession = JSON.parse(storedSession) as { access_token?: string };
    return parsedSession.access_token ?? null;
  } catch {
    return null;
  }
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

export async function supabaseRequest<T>(path: string, options: SupabaseRequestOptions = {}): Promise<T> {
  const { supabaseAnonKey } = getSupabaseEnv();
  const accessToken = options.accessToken ?? getStoredAccessToken();

  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken ?? supabaseAnonKey}`,
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  });

  if (!response.ok) {
    const message = await response.text();
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
