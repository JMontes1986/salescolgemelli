import { createHash } from "node:crypto";
import { getSupabaseEnv, getSupabaseServiceRoleKey } from "@/lib/supabase";

const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 5 * 60;
const DEFAULT_RATE_LIMIT_MAX_ATTEMPTS = 600;
const SUPABASE_RATE_LIMIT_TIMEOUT_MS = 1500;

type MemoryAttempt = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  limited: boolean;
  retryAfter: number;
};

type SupabaseRateLimitResponse = {
  limited?: unknown;
  retryAfter?: unknown;
  retry_after?: unknown;
};

const memoryAttempts = new Map<string, MemoryAttempt>();

function getRateLimitWindowSeconds() {
  const value = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS);
  return Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : DEFAULT_RATE_LIMIT_WINDOW_SECONDS;
}

function getRateLimitMaxAttempts() {
  const value = Number(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS);
  return Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : DEFAULT_RATE_LIMIT_MAX_ATTEMPTS;
}

function hashRateLimitKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

function consumeMemoryAttempt(key: string): RateLimitResult {
  const now = Date.now();
  const windowSeconds = getRateLimitWindowSeconds();
  const maxAttempts = getRateLimitMaxAttempts();
  const currentAttempt = memoryAttempts.get(key);

  if (!currentAttempt || currentAttempt.resetAt <= now) {
    memoryAttempts.set(key, {
      count: 1,
      resetAt: now + windowSeconds * 1000,
    });
    return { limited: false, retryAfter: 0 };
  }

  if (currentAttempt.count >= maxAttempts) {
    return {
      limited: true,
      retryAfter: Math.max(1, Math.ceil((currentAttempt.resetAt - now) / 1000)),
    };
  }

  currentAttempt.count += 1;
  memoryAttempts.set(key, currentAttempt);
  return { limited: false, retryAfter: 0 };
}

async function callSupabaseRateLimitRpc<T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { supabaseUrl } = getSupabaseEnv();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_RATE_LIMIT_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${functionName}`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      },
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Supabase rate limit RPC returned ${response.status}.`);
  }

  return (await response.json()) as T;
}

export async function consumeLoginRateLimit(key: string): Promise<RateLimitResult> {
  const hashedKey = hashRateLimitKey(key);

  try {
    const result = await callSupabaseRateLimitRpc<SupabaseRateLimitResponse>(
      "consume_login_rate_limit",
      {
        p_key: hashedKey,
        p_max_attempts: getRateLimitMaxAttempts(),
        p_window_seconds: getRateLimitWindowSeconds(),
      },
    );
    const retryAfter = Number(result.retryAfter ?? result.retry_after ?? 0);

    return {
      limited: result.limited === true,
      retryAfter: Number.isFinite(retryAfter) ? Math.max(0, retryAfter) : 0,
    };
  } catch (error) {
    console.warn("Login rate limit fell back to local memory.", error);
    return consumeMemoryAttempt(hashedKey);
  }
}

export async function resetLoginRateLimit(key: string) {
  const hashedKey = hashRateLimitKey(key);
  memoryAttempts.delete(hashedKey);

  try {
    await callSupabaseRateLimitRpc<unknown>("reset_login_rate_limit", {
      p_key: hashedKey,
    });
  } catch (error) {
    console.warn("Login rate limit reset failed in Supabase.", error);
  }
}
