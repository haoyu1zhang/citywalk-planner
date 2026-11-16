// fetch wrapper for the public OSM services: User-Agent, timeout, retries, small in-memory cache

export const USER_AGENT =
  process.env.APP_USER_AGENT ?? "citywalk-planner/0.1 (+https://github.com/haoyu1zhang/citywalk-planner)";

interface CacheEntry {
  expires: number;
  value: unknown;
}
const cache = new Map<string, CacheEntry>();
const MAX_ENTRIES = 200;

export class HttpError extends Error {
  constructor(
    message: string,
    readonly kind: "timeout" | "status" | "network" | "parse",
    readonly status?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface FetchJsonOptions {
  method?: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Extra attempts after the first one. Only timeouts, 429 and 5xx retry. */
  retries?: number;
  cacheKey?: string;
  cacheTtlMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchJson(url: string, opts: FetchJsonOptions = {}): Promise<unknown> {
  const { timeoutMs = 8000, retries = 0, cacheKey, cacheTtlMs = 10 * 60_000 } = opts;

  if (cacheKey) {
    const hit = cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.value;
  }

  let lastError: HttpError = new HttpError("request not attempted", "network");
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(400 * attempt);
    try {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        body: opts.body,
        headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...opts.headers },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      if (!res.ok) {
        lastError = new HttpError(`HTTP ${res.status} from ${new URL(url).host}`, "status", res.status);
        if (res.status === 429 || res.status >= 500) continue;
        throw lastError;
      }
      let value: unknown;
      try {
        value = await res.json();
      } catch {
        throw new HttpError(`invalid JSON from ${new URL(url).host}`, "parse");
      }
      if (cacheKey) {
        if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
        cache.set(cacheKey, { expires: Date.now() + cacheTtlMs, value });
      }
      return value;
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.kind === "status" || err.kind === "parse") throw err;
        lastError = err;
      } else if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        lastError = new HttpError(`timeout after ${timeoutMs}ms: ${new URL(url).host}`, "timeout");
      } else {
        lastError = new HttpError(`network error: ${new URL(url).host}`, "network");
      }
    }
  }
  throw lastError;
}

export function clearHttpCache(): void {
  cache.clear();
}
