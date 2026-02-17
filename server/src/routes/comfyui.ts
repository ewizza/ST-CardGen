import { Router } from "express";
import { getComfyBaseUrl, getSystemStats, getObjectInfo } from "../adapters/comfyui/client.js";
import { extractCheckpointModels, extractLoras } from "../adapters/comfyui/parse.js";
import { httpGetBuffer, isHttpRequestError } from "../utils/http.js";
import { fail, ok, wrap } from "../lib/api.js";
import { mapHttpRequestError, mapUnknownError } from "../lib/errorMap.js";


export const comfyuiRouter = Router();

// GET /api/comfyui/ping
comfyuiRouter.get("/ping", wrap(async (req, res) => {
  const baseUrl = getComfyBaseUrl();
  try {
    const stats = await getSystemStats(baseUrl);
    return ok(res, { baseUrl, stats });
  } catch (e1: any) {
    try {
      const info = await getObjectInfo(baseUrl);
      return ok(res, { baseUrl, objectInfo: true, keys: Object.keys(info ?? {}) });
    } catch (e2: any) {
      const err = isHttpRequestError(e2) ? e2 : (isHttpRequestError(e1) ? e1 : null);
      if (err) {
        const mapped = mapHttpRequestError(err);
        return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
      }
      const mapped = mapUnknownError(e2 ?? e1);
      return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
    }
  }
}));

// GET /api/comfyui/object-info
comfyuiRouter.get("/object-info", wrap(async (req, res) => {
  const baseUrl = getComfyBaseUrl();
  try {
    const info = await getObjectInfo(baseUrl);
    return ok(res, { baseUrl, info });
  } catch (e: any) {
    if (isHttpRequestError(e)) {
      const mapped = mapHttpRequestError(e);
      return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
    }
    const mapped = mapUnknownError(e);
    return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
  }
}));

// GET /api/comfyui/models
comfyuiRouter.get("/models", wrap(async (req, res) => {
  const baseUrl = getComfyBaseUrl();
  try {
    const info = await getObjectInfo(baseUrl);
    const models = extractCheckpointModels(info);
    return ok(res, { baseUrl, models });
  } catch (e: any) {
    if (isHttpRequestError(e)) {
      const mapped = mapHttpRequestError(e);
      return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
    }
    const mapped = mapUnknownError(e);
    return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
  }
}));

// GET /api/comfyui/loras
comfyuiRouter.get("/loras", wrap(async (req, res) => {
  const baseUrl = getComfyBaseUrl();
  try {
    const info = await getObjectInfo(baseUrl);
    const loras = extractLoras(info);
    return ok(res, { baseUrl, loras });
  } catch (e: any) {
    if (isHttpRequestError(e)) {
      const mapped = mapHttpRequestError(e);
      return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
    }
    const mapped = mapUnknownError(e);
    return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
  }
}));

// GET /api/comfyui/view
comfyuiRouter.get("/view", wrap(async (req, res) => {
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
      const mapped = mapHttpRequestError(e);
      return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
    }
    const mapped = mapUnknownError(e);
    return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
  }
}));
