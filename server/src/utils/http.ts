import { z } from "zod";

export type HttpErrorDetails = {
  kind: "timeout" | "http" | "parse" | "network";
  url: string;
  method: string;
  timeoutMs?: number;
  status?: number;
  statusText?: string;
  bodySnippet?: string;
  cause?: string;
};

export class HttpRequestError extends Error {
  details: HttpErrorDetails;

  constructor(message: string, details: HttpErrorDetails) {
    super(message);
    this.name = "HttpRequestError";
    this.details = details;
  }
}

export function isHttpRequestError(e: any): e is HttpRequestError {
  return !!e && typeof e === "object" && e.name === "HttpRequestError" && e.details && typeof e.details.url === "string";
}

function truncate(text: string, maxChars: number) {
  if (!text) return "";
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

async function readTextSafe(res: Response, maxChars: number) {
  try {
    const text = await res.text();
    return truncate(text, maxChars);
  } catch {
    return "";
  }
}

type RequestOptions = {
  timeoutMs?: number;
  maxBodyChars?: number;
  headers?: Record<string, string>;
};

async function request(url: string, init: RequestInit, opts?: RequestOptions): Promise<Response> {
  const timeoutMs = opts?.timeoutMs ?? 10_000;
  const method = (init.method || "GET").toUpperCase();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...init,
      headers: opts?.headers ?? (init.headers as any),
      signal: controller.signal,
    });
    return res;
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (e?.name === "AbortError") {
      throw new HttpRequestError(`Request timed out after ${timeoutMs}ms`, {
        kind: "timeout",
        url,
        method,
        timeoutMs,
      });
    }
    throw new HttpRequestError(`Network error: ${msg}`, {
      kind: "network",
      url,
      method,
      timeoutMs,
      cause: msg,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function httpGetJson<T = any>(url: string, opts?: RequestOptions): Promise<T> {
  const maxBodyChars = opts?.maxBodyChars ?? 1200;
  const res = await request(url, { method: "GET" }, opts);

  if (!res.ok) {
    const snippet = await readTextSafe(res, maxBodyChars);
    throw new HttpRequestError(`HTTP ${res.status} ${res.statusText}`.trim(), {
      kind: "http",
      url,
      method: "GET",
      timeoutMs: opts?.timeoutMs,
      status: res.status,
      statusText: res.statusText,
      bodySnippet: snippet || undefined,
    });
  }

  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    throw new HttpRequestError("Failed to parse JSON response", {
      kind: "parse",
      url,
      method: "GET",
      timeoutMs: opts?.timeoutMs,
      status: res.status,
      statusText: res.statusText,
      cause: msg,
      bodySnippet: truncate(text, maxBodyChars) || undefined,
    });
  }
}

export async function httpPostJson<T = any>(url: string, body: any, opts?: RequestOptions): Promise<T> {
  const maxBodyChars = opts?.maxBodyChars ?? 1200;
  const res = await request(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    opts,
  );

  if (!res.ok) {
    const snippet = await readTextSafe(res, maxBodyChars);
    throw new HttpRequestError(`HTTP ${res.status} ${res.statusText}`.trim(), {
      kind: "http",
      url,
      method: "POST",
      timeoutMs: opts?.timeoutMs,
      status: res.status,
      statusText: res.statusText,
      bodySnippet: snippet || undefined,
    });
  }

  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    throw new HttpRequestError("Failed to parse JSON response", {
      kind: "parse",
      url,
      method: "POST",
      timeoutMs: opts?.timeoutMs,
      status: res.status,
      statusText: res.statusText,
      cause: msg,
      bodySnippet: truncate(text, maxBodyChars) || undefined,
    });
  }
}

export async function httpGetBuffer(
  url: string,
  opts?: RequestOptions,
): Promise<{ buffer: Buffer; contentType: string }> {
  const maxBodyChars = opts?.maxBodyChars ?? 1200;
  const res = await request(url, { method: "GET" }, opts);

  if (!res.ok) {
    const snippet = await readTextSafe(res, maxBodyChars);
    throw new HttpRequestError(`HTTP ${res.status} ${res.statusText}`.trim(), {
      kind: "http",
      url,
      method: "GET",
      timeoutMs: opts?.timeoutMs,
      status: res.status,
      statusText: res.statusText,
      bodySnippet: snippet || undefined,
    });
  }

  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const ab = await res.arrayBuffer();
  return { buffer: Buffer.from(ab), contentType };
}

export async function httpPostEmpty(url: string, opts?: RequestOptions): Promise<void> {
  const maxBodyChars = opts?.maxBodyChars ?? 1200;
  const res = await request(url, { method: "POST" }, opts);

  if (!res.ok) {
    const snippet = await readTextSafe(res, maxBodyChars);
    throw new HttpRequestError(`HTTP ${res.status} ${res.statusText}`.trim(), {
      kind: "http",
      url,
      method: "POST",
      timeoutMs: opts?.timeoutMs,
      status: res.status,
      statusText: res.statusText,
      bodySnippet: snippet || undefined,
    });
  }
}

export async function httpPostJsonVoid(url: string, body: any, opts?: RequestOptions): Promise<void> {
  const maxBodyChars = opts?.maxBodyChars ?? 1200;
  const res = await request(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    opts,
  );

  if (!res.ok) {
    const snippet = await readTextSafe(res, maxBodyChars);
    throw new HttpRequestError(`HTTP ${res.status} ${res.statusText}`.trim(), {
      kind: "http",
      url,
      method: "POST",
      timeoutMs: opts?.timeoutMs,
      status: res.status,
      statusText: res.statusText,
      bodySnippet: snippet || undefined,
    });
  }
}
