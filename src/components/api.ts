// Thin fetch wrapper for the Memory Court API. Non-2xx responses carry {error: string};
// we surface that text verbatim so the dashboard never hides a backend failure.

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Unknown error";
}

async function request<T>(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      cache: "no-store",
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(`Network error calling ${path}: ${errMsg(e)}`, 0);
  }

  const raw = await res.text();
  let data: unknown = undefined;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new ApiError(
        res.ok
          ? `Invalid JSON from ${path}: ${raw.slice(0, 200)}`
          : `HTTP ${res.status} from ${path}: ${raw.slice(0, 240)}`,
        res.status,
      );
    }
  }

  if (!res.ok) {
    const maybe = data as { error?: unknown } | undefined;
    const msg =
      maybe && typeof maybe === "object" && typeof maybe.error === "string"
        ? maybe.error
        : `HTTP ${res.status} ${res.statusText}`.trim();
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, "GET", undefined, signal);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, "POST", body);
}
