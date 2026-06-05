type SupabaseRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  prefer?: string;
};

function getSupabaseEnv() {
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

export async function supabaseRequest<T>(path: string, options: SupabaseRequestOptions = {}): Promise<T> {
  const { supabaseAnonKey } = getSupabaseEnv();

  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
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

  return response.json() as Promise<T>;
}

export async function selectRows<T>(table: string, query: SupabaseRequestOptions['query'] = {}): Promise<T[]> {
  return supabaseRequest<T[]>(table, { query: { select: '*', ...query } });
}

export async function selectSingle<T>(table: string, query: SupabaseRequestOptions['query'] = {}): Promise<T | null> {
  const rows = await selectRows<T>(table, { ...query, limit: 1 });
  return rows[0] ?? null;
}

export async function insertRow<T>(table: string, row: unknown): Promise<T> {
  const rows = await supabaseRequest<T[]>(table, {
    method: 'POST',
    body: row,
    prefer: 'return=representation',
  });
  return rows[0];
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
