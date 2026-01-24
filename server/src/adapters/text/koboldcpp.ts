import { loadConfig } from "../../config/store.js";

export type TextGenParams = {
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
};

type PostResult =
  | { ok: true; json: any }
  | { ok: false; status: number; statusText: string; text: string };

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

async function postJson(url: string, body: any, timeoutMs: number): Promise<PostResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e: any) {
      if (e?.name === "AbortError") {
        return {
          ok: false,
          status: 0,
          statusText: "TIMEOUT",
          text: `Request timed out after ${timeoutMs}ms`,
        };
      }
      const msg = String(e?.message ?? e);
      return { ok: false, status: 0, statusText: "NETWORK", text: msg };
    }

    const text = await res.text().catch(() => "");
    if (!res.ok) return { ok: false, status: res.status, statusText: res.statusText, text };
    try {
      return { ok: true, json: JSON.parse(text) };
    } catch {
      return { ok: false, status: res.status, statusText: res.statusText, text };
    }
  } finally {
    clearTimeout(timer);
  }
}

function extractChatContent(payload: any): string | null {
  const msg = payload?.choices?.[0]?.message?.content;
  return typeof msg === "string" ? msg : null;
}

function extractCompletionText(payload: any): string | null {
  const text = payload?.choices?.[0]?.text;
  return typeof text === "string" ? text : null;
}

function buildMessages(systemPrompt?: string, userPrompt?: string) {
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt?.trim()) messages.push({ role: "system", content: systemPrompt.trim() });
  if (userPrompt?.trim()) messages.push({ role: "user", content: userPrompt.trim() });
  return messages;
}

export async function koboldGenerateText(
  systemPrompt: string,
  userPrompt: string,
  params?: TextGenParams,
): Promise<string> {
  const cfg = loadConfig();
  const baseUrl = normalizeBaseUrl(cfg.text.koboldcpp?.baseUrl || "http://127.0.0.1:5001");
  const model = cfg.text.koboldcpp?.model;
  const defaults = cfg.text.koboldcpp?.defaultParams ?? {};
  const timeoutMs = cfg.text.koboldcpp?.requestTimeoutMs ?? 10 * 60_000;

  const temperature = params?.temperature ?? defaults.temperature;
  const top_p = params?.top_p ?? defaults.top_p;
  const max_tokens = params?.max_tokens ?? defaults.max_tokens;

  const chatBody: any = {
    messages: buildMessages(systemPrompt, userPrompt),
  };
  if (model) chatBody.model = model;
  if (temperature !== undefined) chatBody.temperature = temperature;
  if (top_p !== undefined) chatBody.top_p = top_p;
  if (max_tokens !== undefined) chatBody.max_tokens = max_tokens;

  const chat = await postJson(`${baseUrl}/v1/chat/completions`, chatBody, timeoutMs);
  if (!chat.ok) {
    const err = chat as { ok: false; status: number; statusText: string; text: string };
    if (err.status === 404 || err.status === 405) {
      const completionBody: any = { prompt: `${systemPrompt}\n\n${userPrompt}`.trim() };
      if (model) completionBody.model = model;
      if (temperature !== undefined) completionBody.temperature = temperature;
      if (top_p !== undefined) completionBody.top_p = top_p;
      if (max_tokens !== undefined) completionBody.max_tokens = max_tokens;
      const completion = await postJson(`${baseUrl}/v1/completions`, completionBody, timeoutMs);
      if (!completion.ok) {
        const err2 = completion as { ok: false; status: number; statusText: string; text: string };
        const snippet = err2.text.slice(0, 500);
        if (err2.status === 0 && err2.statusText === "TIMEOUT") {
          throw new Error(
            `KoboldCPP request timed out after ${Math.round(timeoutMs / 1000)}s. ` +
            "Increase \"Text Completion -> Request timeout\" in Settings, or reduce Max Tokens / use a shorter field preset."
          );
        }
        if (err2.status === 0 && err2.statusText === "NETWORK") {
          throw new Error(`KoboldCPP network error: ${snippet}`.trim());
        }
        throw new Error(`KoboldCPP error: HTTP ${err2.status} ${err2.statusText} ${snippet}`.trim());
      }
      const text = extractCompletionText(completion.json);
      if (!text) throw new Error("KoboldCPP response missing completion text.");
      return text;
    }
  }

  if (!chat.ok) {
    const err = chat as { ok: false; status: number; statusText: string; text: string };
    const snippet = err.text.slice(0, 500);
    if (err.status === 0 && err.statusText === "TIMEOUT") {
      throw new Error(
        `KoboldCPP request timed out after ${Math.round(timeoutMs / 1000)}s. ` +
        "Increase \"Text Completion -> Request timeout\" in Settings, or reduce Max Tokens / use a shorter field preset."
      );
    }
    if (err.status === 0 && err.statusText === "NETWORK") {
      throw new Error(`KoboldCPP network error: ${snippet}`.trim());
    }
    throw new Error(`KoboldCPP error: HTTP ${err.status} ${err.statusText} ${snippet}`.trim());
  }

  const content = extractChatContent(chat.json);
  if (!content) throw new Error("KoboldCPP response missing chat content.");
  return content;
}

export async function koboldListModels(): Promise<string[]> {
  const cfg = loadConfig();
  const baseUrl = normalizeBaseUrl(cfg.text.koboldcpp?.baseUrl || "http://127.0.0.1:5001");
  try {
    const res = await fetch(`${baseUrl}/v1/models`);
    if (!res.ok) return [];
    const json = await res.json();
    const data = Array.isArray(json?.data) ? json.data : [];
    return data.map((m: any) => m?.id).filter((id: any) => typeof id === "string");
  } catch {
    return [];
  }
}

export async function koboldPing(): Promise<boolean> {
  const models = await koboldListModels();
  return models.length > 0;
}
