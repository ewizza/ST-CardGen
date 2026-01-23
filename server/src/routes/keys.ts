import { Router } from "express";
import { loadConfig } from "../config/store.js";
import { listKeys, saveKey, deleteKey, getKey } from "../services/keyStore.js";
import { openaiPingWithKey } from "../adapters/text/openaiCompat.js";
import { geminiListModelsWithKey } from "../adapters/text/googleGemini.js";
import { fail, ok, wrap } from "../lib/api.js";

export const keysRouter = Router();

// GET /api/keys
keysRouter.get("/", wrap(async (req, res) => {
  const keys = await listKeys();
  return ok(res, { keys: keys.map((key) => ({ name: key.name })) });
}));

// POST /api/keys
keysRouter.post("/", wrap(async (req, res) => {
  try {
    const name = String(req.body?.name ?? "");
    const key = String(req.body?.key ?? "");
    const saved = await saveKey(name, key);
    return ok(res, { name: saved.name });
  } catch (e: any) {
    const message = String(e?.message ?? e);
    return fail(res, 400, "VALIDATION_ERROR", message);
  }
}));

// DELETE /api/keys/:name
keysRouter.delete("/:name", wrap(async (req, res) => {
  await deleteKey(String(req.params.name ?? ""));
  return ok(res);
}));

// POST /api/keys/validate
keysRouter.post("/validate", wrap(async (req, res) => {
  const provider = String(req.body?.provider ?? "");
  const keyName = String(req.body?.keyName ?? "");
  if (!provider || !keyName) {
    return fail(res, 400, "VALIDATION_ERROR", "Provider and keyName are required.");
  }

  const apiKey = await getKey(keyName);
  if (!apiKey) {
    return fail(res, 404, "NOT_FOUND", "API key not found.");
  }

  if (provider === "openai_compat") {
    const cfg = loadConfig();
    const baseUrl = cfg.text.openaiCompat?.baseUrl || "http://127.0.0.1:1234/v1";
    const requestTimeoutMs = cfg.text.openaiCompat?.requestTimeoutMs ?? 10 * 60_000;
    const listTimeoutMs = Math.min(20_000, requestTimeoutMs);
    try {
      const isOk = await openaiPingWithKey(baseUrl, apiKey, listTimeoutMs);
      if (!isOk) return fail(res, 401, "AUTH_INVALID", "Provider rejected credentials");
      return ok(res);
    } catch (e: any) {
      return fail(res, 502, "PROVIDER_ERROR", String(e?.message ?? e));
    }
  }

  if (provider === "google_gemini") {
    const cfg = loadConfig();
    const apiBaseUrl = cfg.text.googleGemini?.apiBaseUrl || "https://generativelanguage.googleapis.com/v1beta";
    const requestTimeoutMs = cfg.text.googleGemini?.requestTimeoutMs ?? 10 * 60_000;
    const listTimeoutMs = Math.min(20_000, requestTimeoutMs);
    try {
      const models = await geminiListModelsWithKey(apiBaseUrl, apiKey, listTimeoutMs);
      if (!models.length) return fail(res, 401, "AUTH_INVALID", "Provider rejected credentials");
      return ok(res);
    } catch (e: any) {
      return fail(res, 502, "PROVIDER_ERROR", String(e?.message ?? e));
    }
  }

  return fail(res, 400, "VALIDATION_ERROR", "Provider not supported.");
}));
