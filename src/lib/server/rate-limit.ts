import { createHash } from "node:crypto";

const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 5 * 60;
const DEFAULT_RATE_LIMIT_MAX_ATTEMPTS = 600;
const UPSTASH_REQUEST_TIMEOUT_MS = 1500;

type MemoryAttempt = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  limited: boolean;
  retryAfter: number;
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

function getUpstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  return { url, token };
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

async function runUpstashCommand<T>(command: Array<string | number>): Promise<T> {
  const config = getUpstashConfig();

  if (!config) {
    throw new Error("Upstash Redis REST is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTASH_REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(`${config.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([command]),
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Upstash Redis returned ${response.status}.`);
  }

  const payload = (await response.json()) as Array<{ result?: T; error?: string }>;
  const [firstResult] = payload;

  if (!firstResult || firstResult.error) {
    throw new Error(firstResult?.error || "Upstash Redis returned an empty response.");
  }

  return firstResult.result as T;
}

export async function consumeLoginRateLimit(key: string): Promise<RateLimitResult> {
  const config = getUpstashConfig();

  if (!config) {
    return consumeMemoryAttempt(key);
  }

  const windowSeconds = getRateLimitWindowSeconds();
  const maxAttempts = getRateLimitMaxAttempts();
  const redisKey = `rate-limit:login:${hashRateLimitKey(key)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTASH_REQUEST_TIMEOUT_MS);
    let response: Response;

    try {
      response = await fetch(`${config.url}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", redisKey],
          ["EXPIRE", redisKey, windowSeconds],
          ["TTL", redisKey],
        ]),
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`Upstash Redis returned ${response.status}.`);
    }

    const payload = (await response.json()) as Array<{ result?: unknown; error?: string }>;
    const count = Number(payload[0]?.result ?? 0);
    const ttl = Number(payload[2]?.result ?? windowSeconds);

    if (payload.some((item) => item.error)) {
      throw new Error("Upstash Redis pipeline failed.");
    }

    return {
      limited: count > maxAttempts,
      retryAfter: count > maxAttempts ? Math.max(1, ttl) : 0,
    };
  } catch (error) {
    console.warn("Login rate limit fell back to local memory.", error);
    return consumeMemoryAttempt(key);
  }
}

export async function resetLoginRateLimit(key: string) {
  const config = getUpstashConfig();

  memoryAttempts.delete(key);

  if (!config) {
    return;
  }

  try {
    await runUpstashCommand<number>(["DEL", `rate-limit:login:${hashRateLimitKey(key)}`]);
  } catch (error) {
    console.warn("Login rate limit reset failed in Upstash Redis.", error);
  }
}
