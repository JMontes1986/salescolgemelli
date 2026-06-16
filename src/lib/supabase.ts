type SupabaseRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  prefer?: string;
  accessToken?: string;
};

export function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase no está configurado. Define NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en Netlify o en .env.local.",
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}

function buildUrl(path: string, query?: SupabaseRequestOptions["query"]) {
  const { supabaseUrl } = getSupabaseEnv();
  const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`);

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

function buildAuthUrl(path: string, query?: SupabaseRequestOptions["query"]) {
  const { supabaseUrl } = getSupabaseEnv();
  const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/${path}`);

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
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

function buildInternalRestUrl(
  path: string,
  query?: SupabaseRequestOptions["query"],
) {
  const url = new URL(`/api/supabase/rest/${path}`, window.location.origin);

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

export async function supabaseRequest<T>(
  path: string,
  options: SupabaseRequestOptions = {},
): Promise<T> {
  const { supabaseAnonKey } = getSupabaseEnv();
  const shouldUseInternalProxy =
    typeof window !== "undefined" && !options.accessToken;

  const requestUrl = shouldUseInternalProxy
    ? buildInternalRestUrl(path, options.query)
    : buildUrl(path, options.query);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.prefer ? { Prefer: options.prefer } : {}),
    ...(shouldUseInternalProxy
      ? {}
      : {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${options.accessToken ?? supabaseAnonKey}`,
        }),
  };
  const requestInit: RequestInit = {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
    credentials: shouldUseInternalProxy ? "include" : "same-origin",
  };

  const response = await fetch(requestUrl, requestInit);

  if (!response.ok) {
    const { message } = await parseSupabaseError(response);

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
  options: SupabaseRequestOptions & { accessToken?: string } = {},
): Promise<T> {
  const { supabaseAnonKey } = getSupabaseEnv();

  const response = await fetch(buildAuthUrl(path, options.query), {
    method: options.method ?? "GET",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${options.accessToken ?? supabaseAnonKey}`,
      "Content-Type": "application/json",
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Supabase Auth request failed (${response.status}): ${message}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function selectRows<T>(
  table: string,
  query: SupabaseRequestOptions["query"] = {},
  accessToken?: string,
): Promise<T[]> {
  return supabaseRequest<T[]>(table, {
    query: { select: "*", ...query },
    accessToken,
  });
}

export async function selectSingle<T>(
  table: string,
  query: SupabaseRequestOptions["query"] = {},
  accessToken?: string,
): Promise<T | null> {
  const rows = await selectRows<T>(table, { ...query, limit: 1 }, accessToken);
  return rows[0] ?? null;
}

export async function insertRow<T>(
  table: string,
  row: unknown,
  accessToken?: string,
): Promise<T> {
  const rows = await supabaseRequest<T[]>(table, {
    method: "POST",
    body: row,
    prefer: "return=representation",
    accessToken,
  });
  return rows[0];
}

export async function insertRowMinimal(
  table: string,
  row: unknown,
  accessToken?: string,
): Promise<void> {
  await supabaseRequest<void>(table, {
    method: "POST",
    body: row,
    prefer: "return=minimal",
    accessToken,
  });
}

export async function upsertRow<T>(
  table: string,
  row: unknown,
  onConflict = "id",
  accessToken?: string,
): Promise<T> {
  const rows = await supabaseRequest<T[]>(table, {
    method: "POST",
    query: { on_conflict: onConflict },
    body: row,
    prefer: "resolution=merge-duplicates,return=representation",
    accessToken,
  });
  return rows[0];
}

export async function callRpc<T>(
  functionName: string,
  body: unknown,
): Promise<T> {
  return supabaseRequest<T>(`rpc/${functionName}`, {
    method: "POST",
    body,
  });
}

export async function updateRows<T>(
  table: string,
  query: SupabaseRequestOptions["query"],
  patch: unknown,
  accessToken?: string,
): Promise<T[]> {
  return supabaseRequest<T[]>(table, {
    method: "PATCH",
    query: { select: "*", ...query },
    body: patch,
    prefer: "return=representation",
    accessToken,
  });
}

export async function updateById<T>(
  table: string,
  id: string,
  patch: unknown,
  accessToken?: string,
): Promise<T | null> {
  const rows = await updateRows<T>(
    table,
    { id: `eq.${id}` },
    patch,
    accessToken,
  );
  return rows[0] ?? null;
}
