import { loadConfig } from "../../config/store.js";
import { getKey } from "../../services/keyStore.js";
import type { Message } from "./openaiCompat.js";
import type { TextGenParams } from "./koboldcpp.js";

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
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

async function getApiKeyFromConfig() {
  const cfg = loadConfig();
  const keyName = cfg.text.googleGemini?.apiKeyRef;
  if (!keyName) return null;
  const apiKey = await getKey(keyName);
  if (!apiKey) throw new Error(`API key not found for "${keyName}".`);
  return apiKey;
}

export async function geminiListModelsWithKey(apiBaseUrl: string, apiKey?: string | null, timeoutMs = 20_000): Promise<string[]> {
  if (!apiKey) throw new Error("No Google Gemini API key configured.");
  const normalized = normalizeBaseUrl(apiBaseUrl);
  const r = await fetchTextWithTimeout(`${normalized}/models`, {
    headers: { "x-goog-api-key": apiKey },
  }, timeoutMs);
  if (!r.ok) {
    if (r.status === 0 && r.statusText === "TIMEOUT") throw new Error(formatTimeout("Gemini", timeoutMs, "model list"));
    if (r.status === 0 && r.statusText === "NETWORK") throw new Error(`Gemini network error: ${truncate(r.text)}`.trim());
    throw new Error(`HTTP ${r.status} ${r.statusText} ${truncate(r.text)}`.trim());
  }
  const data = JSON.parse(r.text);
  const models = Array.isArray(data?.models) ? data.models : [];
  const ids = models.map((model: any) => {
    if (typeof model?.baseModelId === "string" && model.baseModelId.trim()) return model.baseModelId.trim();
    if (typeof model?.name === "string") {
      const name = model.name.trim();
      return name.startsWith("models/") ? name.slice("models/".length) : name;
    }
    return null;
  }).filter((id: any) => typeof id === "string" && id.length > 0);
  return Array.from(new Set(ids));
}

export async function geminiListModels(): Promise<string[]> {
  const cfg = loadConfig();
  const apiBaseUrl = cfg.text.googleGemini?.apiBaseUrl || "https://generativelanguage.googleapis.com/v1beta";
  const apiKey = await getApiKeyFromConfig();
  const requestTimeoutMs = cfg.text.googleGemini?.requestTimeoutMs ?? 10 * 60_000;
  const listTimeoutMs = Math.min(20_000, requestTimeoutMs);
  return geminiListModelsWithKey(apiBaseUrl, apiKey, listTimeoutMs);
}

export async function geminiChatComplete(messages: Message[], params?: TextGenParams) {
  const cfg = loadConfig();
  const openaiBaseUrl = normalizeBaseUrl(cfg.text.googleGemini?.openaiBaseUrl || "https://generativelanguage.googleapis.com/v1beta/openai/");
  const apiKey = await getApiKeyFromConfig();
  const requestTimeoutMs = cfg.text.googleGemini?.requestTimeoutMs ?? 10 * 60_000;

  let chosenModel = cfg.text.googleGemini?.model;
  if (!chosenModel) {
    try {
      const models = await geminiListModels();
      chosenModel = models.find((m) => m.startsWith("gemini")) || models[0];
    } catch {
      chosenModel = undefined;
    }
  }
  if (!chosenModel) chosenModel = "gemini-3-flash-preview";

  const defaults = cfg.text.googleGemini?.defaultParams ?? {};
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

  const r = await fetchTextWithTimeout(`${openaiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  }, requestTimeoutMs);
  if (!r.ok) {
    if (r.status === 0 && r.statusText === "TIMEOUT") throw new Error(formatTimeout("Gemini", requestTimeoutMs, "request"));
    if (r.status === 0 && r.statusText === "NETWORK") throw new Error(`Gemini network error: ${truncate(r.text)}`.trim());
    throw new Error(`HTTP ${r.status} ${r.statusText} ${truncate(r.text)}`.trim());
  }
  const json = JSON.parse(r.text);
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Gemini response missing content.");
  return content;
}

export async function geminiPing(): Promise<boolean> {
  const models = await geminiListModels();
  return models.length > 0;
}
