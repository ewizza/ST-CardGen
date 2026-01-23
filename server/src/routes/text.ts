import { Router } from "express";
import { listModels, pingProvider } from "../adapters/text/provider.js";
import { loadConfig } from "../config/store.js";
import { fail, ok, wrap } from "../lib/api.js";
import { mapUnknownError } from "../lib/errorMap.js";

export const textRouter = Router();

// GET /api/text/models
textRouter.get("/models", wrap(async (req, res) => {
  try {
    const models = await listModels();
    return ok(res, { models });
  } catch (e: any) {
    const mapped = mapUnknownError(e);
    return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
  }
}));

// GET /api/text/ping
textRouter.get("/ping", wrap(async (req, res) => {
  try {
    const cfg = loadConfig();
    const isOk = await pingProvider();
    if (!isOk) return fail(res, 502, "PROVIDER_ERROR", "Provider ping failed");
    return ok(res, { provider: cfg.text.provider });
  } catch (e: any) {
    const mapped = mapUnknownError(e);
    return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
  }
}));
