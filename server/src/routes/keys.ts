import { Router } from "express";
import { loadConfig } from "../config/store.js";
import { listKeys, saveKey, deleteKey, getKey } from "../services/keyStore.js";
import { openaiPingWithKey } from "../adapters/text/openaiCompat.js";
import { geminiListModelsWithKey } from "../adapters/text/googleGemini.js";

export const keysRouter = Router();

// GET /api/keys
keysRouter.get("/", async (req, res) => {
  try {
    const keys = await listKeys();
    return res.json({ ok: true, keys: keys.map((key) => ({ name: key.name })) });
  } catch (e: any) {
    return res.status(200).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// POST /api/keys
keysRouter.post("/", async (req, res) => {
  try {
    const name = String(req.body?.name ?? "");
    const key = String(req.body?.key ?? "");
    const saved = await saveKey(name, key);
    return res.json({ ok: true, name: saved.name });
  } catch (e: any) {
    return res.status(200).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// DELETE /api/keys/:name
keysRouter.delete("/:name", async (req, res) => {
  try {
    await deleteKey(String(req.params.name ?? ""));
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(200).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// POST /api/keys/validate
keysRouter.post("/validate", async (req, res) => {
  try {
    const provider = String(req.body?.provider ?? "");
    const keyName = String(req.body?.keyName ?? "");
    if (!provider || !keyName) {
      return res.status(200).json({ ok: false, error: "Provider and keyName are required." });
    }

    const apiKey = await getKey(keyName);
    if (!apiKey) {
      return res.status(200).json({ ok: false, error: "API key not found." });
    }

    if (provider === "openai_compat") {
      const cfg = loadConfig();
      const baseUrl = cfg.text.openaiCompat?.baseUrl || "http://127.0.0.1:1234/v1";
      const requestTimeoutMs = cfg.text.openaiCompat?.requestTimeoutMs ?? 10 * 60_000;
      const listTimeoutMs = Math.min(20_000, requestTimeoutMs);
      const ok = await openaiPingWithKey(baseUrl, apiKey, listTimeoutMs);
      return res.json({ ok });
    }

    if (provider === "google_gemini") {
      const cfg = loadConfig();
      const apiBaseUrl = cfg.text.googleGemini?.apiBaseUrl || "https://generativelanguage.googleapis.com/v1beta";
      const requestTimeoutMs = cfg.text.googleGemini?.requestTimeoutMs ?? 10 * 60_000;
      const listTimeoutMs = Math.min(20_000, requestTimeoutMs);
      const models = await geminiListModelsWithKey(apiBaseUrl, apiKey, listTimeoutMs);
      return res.json({ ok: models.length > 0 });
    }

    return res.status(200).json({ ok: false, error: "Provider not supported." });
  } catch (e: any) {
    return res.status(200).json({ ok: false, error: String(e?.message ?? e) });
  }
});
