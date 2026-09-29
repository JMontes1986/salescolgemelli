import { getSupabaseEnv, getSupabaseServiceRoleKey } from "@/lib/supabase";

export async function serviceRpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { supabaseUrl } = getSupabaseEnv();
  const key = getSupabaseServiceRoleKey();
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    let message = "No se pudo completar la operación.";
    try { const parsed = JSON.parse(text) as { message?: string }; if (parsed.message) message = parsed.message; } catch { /* keep safe message */ }
    throw new Error(message);
  }
  return (text ? JSON.parse(text) : null) as T;
}

export async function serviceSelect<T>(table: string, query: Record<string, string>): Promise<T[]> {
  const { supabaseUrl } = getSupabaseEnv();
  const key = getSupabaseServiceRoleKey();
  const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${table}`);
  Object.entries(query).forEach(([name, value]) => url.searchParams.set(name, value));
  const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
  if (!response.ok) throw new Error("No se pudieron consultar los datos.");
  return response.json() as Promise<T[]>;
}
