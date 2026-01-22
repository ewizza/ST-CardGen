import { Router } from "express";
import { getComfyBaseUrl, getSystemStats, getObjectInfo } from "../adapters/comfyui/client.js";
import { extractCheckpointModels, extractLoras } from "../adapters/comfyui/parse.js";
import { httpGetBuffer, isHttpRequestError } from "../utils/http.js";


export const comfyuiRouter = Router();

// GET /api/comfyui/ping
comfyuiRouter.get("/ping", async (req, res) => {
  const baseUrl = getComfyBaseUrl();
  try {
    const stats = await getSystemStats(baseUrl);
    res.json({ ok: true, baseUrl, stats });
  } catch (e1: any) {
    try {
      const info = await getObjectInfo(baseUrl);
      res.json({ ok: true, baseUrl, objectInfo: true, keys: Object.keys(info ?? {}) });
    } catch (e2: any) {
      res.status(200).json({
        ok: false,
        baseUrl,
        error: String(e2?.message ?? e2 ?? e1?.message ?? e1),
      });
    }
  }
});

// GET /api/comfyui/object-info
comfyuiRouter.get("/object-info", async (req, res) => {
  const baseUrl = getComfyBaseUrl();
  try {
    const info = await getObjectInfo(baseUrl);
    res.json({ ok: true, baseUrl, info });
  } catch (e: any) {
    res.status(200).json({ ok: false, baseUrl, error: String(e?.message ?? e) });
  }
});

// GET /api/comfyui/models
comfyuiRouter.get("/models", async (req, res) => {
  const baseUrl = getComfyBaseUrl();
  try {
    const info = await getObjectInfo(baseUrl);
    const models = extractCheckpointModels(info);
    res.json({ ok: true, baseUrl, models });
  } catch (e: any) {
    res.status(200).json({ ok: false, baseUrl, error: String(e?.message ?? e), models: [] });
  }
});

// GET /api/comfyui/loras
comfyuiRouter.get("/loras", async (req, res) => {
  const baseUrl = getComfyBaseUrl();
  try {
    const info = await getObjectInfo(baseUrl);
    const loras = extractLoras(info);
    res.json({ ok: true, baseUrl, loras });
  } catch (e: any) {
    res.status(200).json({ ok: false, baseUrl, error: String(e?.message ?? e), loras: [] });
  }
});

// GET /api/comfyui/view
comfyuiRouter.get("/view", async (req, res) => {
  const baseUrl = getComfyBaseUrl();
  try {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) {
        for (const v of value) params.append(key, String(v));
      } else if (value != null) {
        params.set(key, String(value));
      }
    }

    const query = params.toString();
    const url = query ? `${baseUrl}/view?${query}` : `${baseUrl}/view`;
    const { buffer, contentType } = await httpGetBuffer(url, { timeoutMs: 15000 });
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(buffer.length));
    return res.send(buffer);
  } catch (e: any) {
    if (isHttpRequestError(e)) {
      return res.status(200).json({ ok: false, baseUrl, error: e.message, details: e.details });
    }
    return res.status(200).json({ ok: false, baseUrl, error: String(e?.message ?? e) });
  }
});
