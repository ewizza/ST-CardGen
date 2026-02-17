import fs from "node:fs";
import path from "node:path";
import { ConfigSchema, defaultConfig, type AppConfig } from "./schema.js";
import { saveApiKey } from "../secrets/secretStore.js";

const CONFIG_DIR = path.join(process.cwd(), "data");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const CONFIG_PATH_LOCAL = path.join(CONFIG_DIR, "config.local.json");
const CONFIG_PATH_EXAMPLE = path.join(CONFIG_DIR, "config.example.json");

const KEYTAR_SERVICE = "ccg-character-generator";

function getReadableConfigPath() {
  if (fs.existsSync(CONFIG_PATH_LOCAL)) return CONFIG_PATH_LOCAL;
  if (fs.existsSync(CONFIG_PATH)) return CONFIG_PATH;
  if (fs.existsSync(CONFIG_PATH_EXAMPLE)) return CONFIG_PATH_EXAMPLE;
  return null;
}

function getWritableConfigPath() {
  if (fs.existsSync(CONFIG_PATH_LOCAL)) return CONFIG_PATH_LOCAL;
  if (fs.existsSync(CONFIG_PATH)) return CONFIG_PATH;
  return CONFIG_PATH_LOCAL;
}

function migrateConfig(raw: any) {
  let changed = false;
  const next = { ...raw };
  if (next?.image && typeof next.image === "object") {
    const defaults = defaultConfig().image.baseUrls;
    const existing = next.image.baseUrls && typeof next.image.baseUrls === "object" ? next.image.baseUrls : {};
    const hadAllDefaults =
      typeof existing.sdapi === "string" &&
      typeof existing.comfyui === "string" &&
      typeof existing.koboldcpp === "string" &&
      typeof existing.stability === "string" &&
      typeof existing.huggingface === "string" &&
      typeof existing.google === "string";
    next.image.baseUrls = { ...defaults, ...existing };
    if (!hadAllDefaults) changed = true;

    if (typeof next.image.baseUrl === "string" && next.image.baseUrl.length) {
      const provider = next.image.provider || "comfyui";
      next.image.baseUrls[provider] = next.image.baseUrl;
      delete next.image.baseUrl;
      changed = true;
    }

    if (next.image.comfyui && typeof next.image.comfyui === "object") {
      if (!next.image.comfyui.workflow && typeof next.image.comfyui.workflowName === "string") {
        next.image.comfyui.workflow = next.image.comfyui.workflowName;
        changed = true;
      }
      if (!next.image.comfyui.workflow) {
        next.image.comfyui.workflow = "sd_basic.json";
        changed = true;
      }
      if (next.image.comfyui.loraName === undefined) {
        next.image.comfyui.loraName = null;
        changed = true;
      }
      if (next.image.comfyui.loraStrengthModel === undefined) {
        next.image.comfyui.loraStrengthModel = 1.0;
        changed = true;
      }
      if (next.image.comfyui.loraStrengthClip === undefined) {
        next.image.comfyui.loraStrengthClip = 1.0;
        changed = true;
      }
    }
  }
  if (next?.library && typeof next.library === "object") {
    const libDefaults = defaultConfig().library;
    if (typeof next.library.dir !== "string" || !next.library.dir.trim()) {
      next.library.dir = libDefaults.dir;
      changed = true;
    }

    const legacyDir = next.library.dir || libDefaults.dir;
    if (!Array.isArray(next.library.repositories)) {
      next.library.repositories = [{
        id: "cardgen",
        name: "CardGen",
        dir: legacyDir,
        kind: "managed",
        readOnly: false,
      }];
      changed = true;
    }

    const repos = next.library.repositories as Array<any>;
    let cardgen = repos.find((repo) => repo && repo.id === "cardgen");
    if (!cardgen) {
      cardgen = { id: "cardgen", name: "CardGen", dir: legacyDir, kind: "managed", readOnly: false };
      repos.unshift(cardgen);
      changed = true;
    }
    if (typeof cardgen.dir !== "string" || !cardgen.dir.trim()) {
      cardgen.dir = legacyDir;
      changed = true;
    }
    if (legacyDir && cardgen.dir !== legacyDir) {
      cardgen.dir = legacyDir;
      changed = true;
    }
    if (!next.library.dir || next.library.dir !== cardgen.dir) {
      next.library.dir = cardgen.dir;
      changed = true;
    }

    if (typeof next.library.activeRepoId !== "string" || !next.library.activeRepoId.trim()) {
      next.library.activeRepoId = "cardgen";
      changed = true;
    }
    const activeExists = repos.some((repo) => repo && repo.id === next.library.activeRepoId);
    if (!activeExists) {
      next.library.activeRepoId = repos[0]?.id || "cardgen";
      changed = true;
    }
  }
  if (next?.text && typeof next.text === "object") {
    const textDefaults = defaultConfig().text;
    if (!next.text.koboldcpp || typeof next.text.koboldcpp !== "object") {
      next.text.koboldcpp = { ...textDefaults.koboldcpp };
      changed = true;
    }
    if (!next.text.koboldcpp.defaultParams || typeof next.text.koboldcpp.defaultParams !== "object") {
      next.text.koboldcpp.defaultParams = { ...textDefaults.koboldcpp.defaultParams };
      changed = true;
    } else if (
      next.text.koboldcpp.defaultParams.max_tokens === undefined &&
      textDefaults.koboldcpp.defaultParams?.max_tokens !== undefined
    ) {
      next.text.koboldcpp.defaultParams.max_tokens = textDefaults.koboldcpp.defaultParams.max_tokens;
      changed = true;
    }
    if (
      next.text.koboldcpp.requestTimeoutMs === undefined &&
      textDefaults.koboldcpp.requestTimeoutMs !== undefined
    ) {
      next.text.koboldcpp.requestTimeoutMs = textDefaults.koboldcpp.requestTimeoutMs;
      changed = true;
    }
    if (!next.text.openaiCompat || typeof next.text.openaiCompat !== "object") {
      next.text.openaiCompat = { ...textDefaults.openaiCompat };
      changed = true;
    }
    if (!next.text.openaiCompat.defaultParams || typeof next.text.openaiCompat.defaultParams !== "object") {
      next.text.openaiCompat.defaultParams = { ...textDefaults.openaiCompat.defaultParams };
      changed = true;
    }
    if (
      next.text.openaiCompat.requestTimeoutMs === undefined &&
      textDefaults.openaiCompat.requestTimeoutMs !== undefined
    ) {
      next.text.openaiCompat.requestTimeoutMs = textDefaults.openaiCompat.requestTimeoutMs;
      changed = true;
    }
    if (!next.text.googleGemini || typeof next.text.googleGemini !== "object") {
      next.text.googleGemini = { ...textDefaults.googleGemini };
      changed = true;
    }
    if (!next.text.googleGemini.defaultParams || typeof next.text.googleGemini.defaultParams !== "object") {
      next.text.googleGemini.defaultParams = { ...textDefaults.googleGemini.defaultParams };
      changed = true;
    }
    if (
      next.text.googleGemini.requestTimeoutMs === undefined &&
      textDefaults.googleGemini.requestTimeoutMs !== undefined
    ) {
      next.text.googleGemini.requestTimeoutMs = textDefaults.googleGemini.requestTimeoutMs;
      changed = true;
    }
    if (typeof next.text.baseUrl === "string" && next.text.baseUrl.length) {
      next.text.koboldcpp.baseUrl = next.text.baseUrl;
      delete next.text.baseUrl;
      changed = true;
    }
    if (typeof next.text.model === "string" && next.text.model.length) {
      next.text.koboldcpp.model = next.text.model;
      delete next.text.model;
      changed = true;
    }
  }
  return { cfg: next, changed };
}

export function loadConfig(): AppConfig {
  try {
    const configPath = getReadableConfigPath();
    if (!configPath) return defaultConfig();
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    const { cfg, changed } = migrateConfig(parsed);
    const next = ConfigSchema.parse(cfg);
    if (changed) saveConfig(next);
    return next;
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(cfg: AppConfig) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const target = getWritableConfigPath();
  fs.writeFileSync(target, JSON.stringify(cfg, null, 2), "utf-8");
}

export async function migrateSecrets() {
  const configPath = getReadableConfigPath();
  if (!configPath || configPath === CONFIG_PATH_EXAMPLE) return;
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    const apiKey = parsed?.text?.openaiCompat?.apiKey;
    if (typeof apiKey === "string" && apiKey.trim()) {
      const name = "openaiCompat-default";
      await saveApiKey({
        envVar: "OPENAI_API_KEY",
        service: KEYTAR_SERVICE,
        account: name,
        value: apiKey,
        preferKeytar: true,
        writeToConfig: (value) => {
          parsed.secrets = parsed.secrets || {};
          parsed.secrets.apiKeys = parsed.secrets.apiKeys || {};
          parsed.secrets.apiKeys[name] = value;
        },
      });
      if (!parsed.text) parsed.text = {};
      if (!parsed.text.openaiCompat) parsed.text.openaiCompat = {};
      parsed.text.openaiCompat.apiKeyRef = name;
      delete parsed.text.openaiCompat.apiKey;
    }

    const stabilityKey = parsed?.image?.stability?.apiKey;
    if (typeof stabilityKey === "string" && stabilityKey.trim()) {
      const existingRef = parsed?.image?.stability?.apiKeyRef;
      const name = typeof existingRef === "string" && existingRef.trim()
        ? existingRef.trim()
        : "stability-default";
      await saveApiKey({
        envVar: "STABILITY_API_KEY",
        service: KEYTAR_SERVICE,
        account: name,
        value: stabilityKey,
        preferKeytar: true,
        writeToConfig: (value) => {
          parsed.secrets = parsed.secrets || {};
          parsed.secrets.apiKeys = parsed.secrets.apiKeys || {};
          parsed.secrets.apiKeys[name] = value;
        },
      });
      if (!parsed.image) parsed.image = {};
      if (!parsed.image.stability) parsed.image.stability = {};
      parsed.image.stability.apiKeyRef = name;
      delete parsed.image.stability.apiKey;
    }
    fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), "utf-8");
  } catch (e) {
    console.warn("Failed to migrate API keys to keychain.");
  }
}

export function getApiKeyFromConfig(name: string): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  try {
    const cfg = loadConfig();
    const value = cfg.secrets?.apiKeys?.[trimmed];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function listApiKeysFromConfig(): string[] {
  try {
    const cfg = loadConfig();
    return Object.keys(cfg.secrets?.apiKeys ?? {}).filter((key) => key.trim());
  } catch {
    return [];
  }
}

export function setApiKeyInConfig(name: string, value: string) {
  const trimmed = name?.trim();
  const secret = value?.trim();
  if (!trimmed || !secret) return;
  const cfg = loadConfig();
  cfg.secrets = cfg.secrets || { apiKeys: {} };
  cfg.secrets.apiKeys = cfg.secrets.apiKeys || {};
  cfg.secrets.apiKeys[trimmed] = secret;
  saveConfig(cfg);
}

export function deleteApiKeyFromConfig(name: string) {
  const trimmed = name?.trim();
  if (!trimmed) return;
  const cfg = loadConfig();
  if (!cfg.secrets?.apiKeys?.[trimmed]) return;
  delete cfg.secrets.apiKeys[trimmed];
  saveConfig(cfg);
}
