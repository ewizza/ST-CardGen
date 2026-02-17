import { Router } from "express";
import { ConfigSchema, type AppConfig } from "../config/schema.js";
import { loadConfig, saveConfig } from "../config/store.js";
import { ok, wrap } from "../lib/api.js";

export const configRouter = Router();

function redactConfig(cfg: AppConfig): AppConfig {
  const next = structuredClone(cfg);
  if ("secrets" in next) {
    delete (next as { secrets?: any }).secrets;
  }
  if (next.text?.openaiCompat && "apiKey" in next.text.openaiCompat) {
    delete (next.text.openaiCompat as { apiKey?: string }).apiKey;
  }
  if (next.image?.stability && "apiKey" in next.image.stability) {
    delete (next.image.stability as { apiKey?: string }).apiKey;
  }
  return next;
}

configRouter.get("/", wrap((req, res) => {
  const cfg = loadConfig();
  return ok(res, redactConfig(cfg));
}));

configRouter.put("/", wrap((req, res) => {
  const existing = loadConfig();
  const parsed = ConfigSchema.parse(req.body);
  // Preserve secrets from latest on disk so /api/keys can’t be clobbered by a stale config save.
  parsed.secrets = existing.secrets;
  saveConfig(parsed);
  return ok(res, redactConfig(parsed));
}));
