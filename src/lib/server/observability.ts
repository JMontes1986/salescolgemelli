type ApiLogContext = {
  route: string;
  method?: string;
  requestId?: string | null;
  status?: number;
  ms?: number;
  message?: string;
  error?: unknown;
  meta?: Record<string, unknown>;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function emit(level: "info" | "warn" | "error", context: ApiLogContext) {
  const payload = {
    level,
    route: context.route,
    method: context.method,
    requestId: context.requestId,
    status: context.status,
    ms: context.ms,
    message: context.message,
    error: context.error ? getErrorMessage(context.error) : undefined,
    ...context.meta,
  };

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export function getRequestId(request: Request) {
  return request.headers.get("x-vercel-id") ?? request.headers.get("x-request-id");
}

export function logApiStart(context: ApiLogContext) {
  emit("info", { ...context, message: context.message ?? "api_start" });
}

export function logApiDone(context: ApiLogContext) {
  const level = typeof context.status === "number" && context.status >= 500 ? "error" : "info";
  emit(level, { ...context, message: context.message ?? "api_done" });
}

export function logApiError(context: ApiLogContext) {
  emit("error", { ...context, message: context.message ?? "api_error" });
}
