import { getApiKeyFromConfig as getApiKeyFromConfigValue, loadConfig } from "../../config/store.js";
import { readApiKey } from "../../secrets/secretStore.js";
import type { TextGenParams } from "./koboldcpp.js";

export type Message = { role: "system" | "user" | "assistant"; content: string };

function normalizeBaseUrl(url: string) {
  const trimmed = url.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) return trimmed;
  return `${trimmed}/v1`;
}

function truncate(text: string, max = 500) {
  return text.length > max ? text.slice(0, max) : text;
}

type FetchTextResult =
  | { ok: true; status: number; statusText: string; text: string }
  | { ok: false; status: number; statusText: "TIMEOUT" | "NETWORK" | string; text: string };

async function fetchTextWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<FetchTextResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: controller.signal });
    } catch (e: any) {
      if (e?.name === "AbortError") {
        return { ok: false, status: 0, statusText: "TIMEOUT", text: `Request timed out after ${timeoutMs}ms` };
      }
      return { ok: false, status: 0, statusText: "NETWORK", text: String(e?.message ?? e) };
    }
    const text = await res.text().catch(() => "");
    if (!res.ok) return { ok: false, status: res.status, statusText: res.statusText, text };
    return { ok: true, status: res.status, statusText: res.statusText, text };
  } finally {
    clearTimeout(timer);
  }
}

function formatTimeout(providerLabel: string, timeoutMs: number, purpose: string) {
  const sec = Math.round(timeoutMs / 1000);
  return `${providerLabel} ${purpose} timed out after ${sec}s. ` +
    "Increase \"Text Completion -> Request timeout\" in Settings, or reduce Max Tokens / use a shorter field preset.";
}

async function getJson(url: string, apiKey: string | null | undefined, timeoutMs: number) {
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const r = await fetchTextWithTimeout(url, { headers }, timeoutMs);

  if (!r.ok) {
    if (r.status === 0 && r.statusText === "TIMEOUT") throw new Error(formatTimeout("OpenAI-compatible", timeoutMs, "request"));
    if (r.status === 0 && r.statusText === "NETWORK") throw new Error(`OpenAI-compatible network error: ${truncate(r.text)}`.trim());
    throw new Error(`HTTP ${r.status} ${r.statusText} ${truncate(r.text)}`.trim());
  }
  return JSON.parse(r.text);
}

async function postJson(url: string, body: any, apiKey: string | null | undefined, timeoutMs: number) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const r = await fetchTextWithTimeout(
    url,
    { method: "POST", headers, body: JSON.stringify(body) },
    timeoutMs
  );

  if (!r.ok) {
    if (r.status === 0 && r.statusText === "TIMEOUT") throw new Error(formatTimeout("OpenAI-compatible", timeoutMs, "request"));
    if (r.status === 0 && r.statusText === "NETWORK") throw new Error(`OpenAI-compatible network error: ${truncate(r.text)}`.trim());
    throw new Error(`HTTP ${r.status} ${r.statusText} ${truncate(r.text)}`.trim());
  }
  return JSON.parse(r.text);
}

export async function openaiListModelsWithKey(baseUrl: string, apiKey?: string | null, timeoutMs = 20_000): Promise<string[]> {
  const normalized = normalizeBaseUrl(baseUrl);
  const data = await getJson(`${normalized}/models`, apiKey ?? undefined, timeoutMs);
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.map((item: any) => item?.id).filter((id: any) => typeof id === "string");
}

async function getApiKeyFromConfig() {
  const cfg = loadConfig();
  const keyName = cfg.text.openaiCompat?.apiKeyRef;
  const result = await readApiKey({
    envVar: "OPENAI_API_KEY",
    service: "ccg-character-generator",
    account: keyName ?? "",
    readFromConfig: () => (keyName ? getApiKeyFromConfigValue(keyName) : null),
  });
  return result.value ?? null;
}

export async function openaiListModels(): Promise<string[]> {
  const cfg = loadConfig();
  const baseUrl = normalizeBaseUrl(cfg.text.openaiCompat?.baseUrl || "http://127.0.0.1:1234/v1");
  const apiKey = await getApiKeyFromConfig();
  const requestTimeoutMs = cfg.text.openaiCompat?.requestTimeoutMs ?? 10 * 60_000;
  const listTimeoutMs = Math.min(20_000, requestTimeoutMs);
  return openaiListModelsWithKey(baseUrl, apiKey, listTimeoutMs);
}

export async function openaiChatComplete(messages: Message[], params?: TextGenParams) {
  const cfg = loadConfig();
  const baseUrl = normalizeBaseUrl(cfg.text.openaiCompat?.baseUrl || "http://127.0.0.1:1234/v1");
  const apiKey = await getApiKeyFromConfig();
  const model = cfg.text.openaiCompat?.model;
  const requestTimeoutMs = cfg.text.openaiCompat?.requestTimeoutMs ?? 10 * 60_000;
  const listTimeoutMs = Math.min(20_000, requestTimeoutMs);

  let chosenModel = model;
  if (!chosenModel) {
    const models = await openaiListModelsWithKey(baseUrl, apiKey, listTimeoutMs);
    chosenModel = models[0];
  }
  if (!chosenModel) throw new Error("No model available from OpenAI-compatible server.");

  const defaults = cfg.text.openaiCompat?.defaultParams ?? {};
  const body: Record<string, any> = {
    model: chosenModel,
    messages,
  };
  const temperature = params?.temperature ?? defaults.temperature;
  const top_p = params?.top_p ?? defaults.top_p;
  const max_tokens = params?.max_tokens ?? defaults.max_tokens;
  if (temperature !== undefined) body.temperature = temperature;
  if (top_p !== undefined) body.top_p = top_p;
  if (max_tokens !== undefined) body.max_tokens = max_tokens;

  const json = await postJson(`${baseUrl}/chat/completions`, body, apiKey, requestTimeoutMs);
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("OpenAI-compatible response missing content.");
  return content;
}

export async function openaiPing(): Promise<boolean> {
  const cfg = loadConfig();
  const baseUrl = normalizeBaseUrl(cfg.text.openaiCompat?.baseUrl || "http://127.0.0.1:1234/v1");
  const apiKey = await getApiKeyFromConfig();
  const requestTimeoutMs = cfg.text.openaiCompat?.requestTimeoutMs ?? 10 * 60_000;
  const listTimeoutMs = Math.min(20_000, requestTimeoutMs);
  const models = await openaiListModelsWithKey(baseUrl, apiKey, listTimeoutMs);
  return models.length > 0;
}

export async function openaiPingWithKey(baseUrl: string, apiKey?: string | null, timeoutMs = 20_000): Promise<boolean> {
  const models = await openaiListModelsWithKey(baseUrl, apiKey ?? undefined, timeoutMs);
  return models.length > 0;
}
