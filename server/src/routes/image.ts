import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";

import { loadConfig, saveConfig } from "../config/store.js";
import { getComfyBaseUrl, getObjectInfo } from "../adapters/comfyui/client.js";
import { applyBindings, roundTo64, type BindingsMap } from "../adapters/comfyui/bindings.js";
import { extractSamplers, extractSchedulers } from "../adapters/comfyui/parse.js";
import { listWorkflows, loadBindingsForWorkflow, loadWorkflow } from "../domain/comfyui/workflows.js";
import { createComfyJob, updateJob } from "../domain/jobs/imageJobs.js";
import { stabilityGenerate } from "../providers/stability.js";
import { huggingfaceTextToImage } from "../providers/huggingface.js";
import { generateGoogleImage } from "../providers/google.js";
import { getKey } from "../services/keyStore.js";
import { httpGetJson, httpPostJson, isHttpRequestError } from "../utils/http.js";

export const imageRouter = Router();

type StoredResult = { buffer: Buffer; mime: string; createdAt: number };
const RESULT_TTL_MS = 5 * 60 * 1000;
const results = new Map<string, StoredResult>();

function cleanupResults() {
  const now = Date.now();
  for (const [id, r] of results.entries()) {
    if (now - r.createdAt > RESULT_TTL_MS) results.delete(id);
  }
}

function putResult(buffer: Buffer, mime = "image/png") {
  cleanupResults();
  const id = crypto.randomUUID();
  results.set(id, { buffer, mime, createdAt: Date.now() });
  return id;
}

function decodeBase64Image(b64: string): Buffer {
  const idx = b64.indexOf("base64,");
  const raw = idx >= 0 ? b64.slice(idx + "base64,".length) : b64;
  return Buffer.from(raw, "base64");
}

const GenerateSchema = z.object({
  prompt: z.string().min(1),
  negativePrompt: z.string().optional().default(""),
  seed: z.number().int().optional(), // if omitted, we randomize
  aspectRatio: z.string().optional(),
  outputFormat: z.enum(["png", "webp", "jpeg"]).optional(),
});

const TIMEOUT_CONNECT_MS = 8000;
const TIMEOUT_LIST_MS = 8000;
const TIMEOUT_SDAPI_TXT2IMG_MS = 120000;
const TIMEOUT_COMFY_PROMPT_MS = 15000;
const TIMEOUT_COMFY_HISTORY_MS = 8000;

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function parseStringList(payload: any): string[] {
  if (!Array.isArray(payload)) return [];
  const seen = new Set<string>();
  for (const item of payload) {
    let value: string | null = null;
    if (typeof item === "string") value = item;
    else if (item?.name) value = String(item.name);
    else if (item?.label) value = String(item.label);
    else if (item?.value !== undefined) value = String(item.value);
    const normalized = value?.trim();
    if (!normalized) continue;
    if (!seen.has(normalized)) seen.add(normalized);
  }
  return Array.from(seen);
}

function extractFirstImage(historyPayload: any) {
  // history usually keyed by prompt_id
  const firstKey = Object.keys(historyPayload ?? {})[0];
  const entry = firstKey ? historyPayload[firstKey] : null;
  const outputs = entry?.outputs ?? {};

  for (const nodeId of Object.keys(outputs)) {
    const images = outputs[nodeId]?.images;
    if (Array.isArray(images) && images.length) return images[0];
  }
  return null;
}

function applyLoraSettings(workflow: Record<string, any>, cfg: any) {
  const name = cfg?.image?.comfyui?.loraName;
  const strengthModel = cfg?.image?.comfyui?.loraStrengthModel;
  const strengthClip = cfg?.image?.comfyui?.loraStrengthClip;

  for (const node of Object.values(workflow)) {
    const record: any = node;
    if (record?.class_type !== "LoraLoader" || !record.inputs) continue;
    if (name) record.inputs.lora_name = name;
    if (typeof strengthModel === "number") record.inputs.strength_model = strengthModel;
    if (typeof strengthClip === "number") record.inputs.strength_clip = strengthClip;
  }
  return workflow;
}

// GET /api/image/result/:id
imageRouter.get("/result/:id", (req, res) => {
  const id = String(req.params.id || "");
  const r = results.get(id);
  if (!r) return res.status(404).end();

  res.setHeader("Content-Type", r.mime);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(r.buffer);
});

// GET /api/image/comfyui/workflows
imageRouter.get("/comfyui/workflows", async (req, res) => {
  try {
    const workflows = await listWorkflows();
    return res.json({ ok: true, workflows });
  } catch (e: any) {
    if (isHttpRequestError(e)) {
      return res.status(200).json({ ok: false, error: e.message, details: e.details });
    }
    return res.status(200).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// GET /api/image/samplers
imageRouter.get("/samplers", async (req, res) => {
  let provider: string | undefined;
  let baseUrl: string | undefined;
  try {
    const cfg = loadConfig();
    provider = cfg.image.provider;

    if (cfg.image.provider === "google") {
      return res.json({ ok: true, provider, baseUrl, samplers: [] });
    }

    if (cfg.image.provider === "comfyui") {
      baseUrl = getComfyBaseUrl();
      const info = await getObjectInfo(baseUrl);
      const samplers = extractSamplers(info);
      return res.json({ ok: true, provider, baseUrl, samplers });
    }

    if (cfg.image.provider === "sdapi" || cfg.image.provider === "koboldcpp") {
      baseUrl = normalizeBaseUrl(cfg.image.baseUrls?.[cfg.image.provider] || "");
      const data = await httpGetJson(`${baseUrl}/sdapi/v1/samplers`, { timeoutMs: TIMEOUT_LIST_MS });
      const samplers = parseStringList(data);
      return res.json({ ok: true, provider, baseUrl, samplers });
    }

    return res.json({ ok: true, provider, samplers: [] });
  } catch (e: any) {
    if (isHttpRequestError(e)) {
      return res.status(200).json({ ok: false, error: e.message, details: e.details, provider, baseUrl });
    }
    return res.status(200).json({ ok: false, error: String(e?.message ?? e), provider, baseUrl });
  }
});

// GET /api/image/schedulers
imageRouter.get("/schedulers", async (req, res) => {
  let provider: string | undefined;
  let baseUrl: string | undefined;
  try {
    const cfg = loadConfig();
    provider = cfg.image.provider;

    if (cfg.image.provider === "google") {
      return res.json({ ok: true, provider, baseUrl, schedulers: [] });
    }

    if (cfg.image.provider === "comfyui") {
      baseUrl = getComfyBaseUrl();
      const info = await getObjectInfo(baseUrl);
      const schedulers = extractSchedulers(info);
      return res.json({ ok: true, provider, baseUrl, schedulers });
    }

    if (cfg.image.provider === "sdapi" || cfg.image.provider === "koboldcpp") {
      baseUrl = normalizeBaseUrl(cfg.image.baseUrls?.[cfg.image.provider] || "");
      try {
        const data = await httpGetJson(`${baseUrl}/sdapi/v1/schedulers`, { timeoutMs: TIMEOUT_LIST_MS });
        const schedulers = parseStringList(data);
        return res.json({ ok: true, provider, baseUrl, schedulers });
      } catch (e: any) {
        if (isHttpRequestError(e) && (e.details.status === 404 || e.details.status === 405)) {
          return res.json({
            ok: true,
            provider,
            baseUrl,
            schedulers: [],
            warning: "Endpoint not available",
          });
        }
        throw e;
      }
    }

    return res.json({ ok: true, provider, schedulers: [] });
  } catch (e: any) {
    if (isHttpRequestError(e)) {
      return res.status(200).json({ ok: false, error: e.message, details: e.details, provider, baseUrl });
    }
    return res.status(200).json({ ok: false, error: String(e?.message ?? e), provider, baseUrl });
  }
});

// POST /api/image/connect
imageRouter.post("/connect", async (req, res) => {
  let provider: "sdapi" | "comfyui" | "koboldcpp" | "stability" | "huggingface" | "google" | undefined;
  let baseUrl: string | undefined;
  try {
    const body = z.object({
      provider: z.enum(["sdapi", "comfyui", "koboldcpp", "stability", "huggingface", "google"]),
    }).parse(req.body);
    provider = body.provider;

    const cfg = loadConfig();
    if (provider === "stability") {
      baseUrl = normalizeBaseUrl(cfg.image.stability?.baseUrl || cfg.image.baseUrls?.stability || "");
    } else if (provider === "huggingface") {
      baseUrl = normalizeBaseUrl(cfg.image.baseUrls?.huggingface || "https://router.huggingface.co");
    } else if (provider === "google") {
      baseUrl = normalizeBaseUrl(cfg.image.google?.baseUrl || cfg.image.baseUrls?.google || "");
    } else {
      baseUrl = normalizeBaseUrl(cfg.image.baseUrls?.[provider] || "");
    }

    let samplers: string[] = [];
    let schedulers: string[] = [];
    let warning: string | undefined;
    let error: string | undefined;
    let details: any;
    let ok = false;
    const checkedAt = new Date().toISOString();

    if (provider === "comfyui") {
      const info = await getObjectInfo(baseUrl);
      samplers = extractSamplers(info);
      schedulers = extractSchedulers(info);
      const workflows = await listWorkflows();
      details = { hasObjectInfo: true, workflows };
      ok = true;
      cfg.image.providerInfo = cfg.image.providerInfo || {};
      cfg.image.providerInfo[provider] = {
        ok,
        checkedAt,
        baseUrl,
        samplers,
        schedulers,
        warning,
        error,
        details,
      };
      saveConfig(cfg);
      return res.json({
        ok,
        provider,
        baseUrl,
        samplers,
        schedulers,
        warning,
        error,
        checkedAt,
        details,
      });
    } else if (provider === "stability") {
      ok = true;
      warning = "Connectivity check not implemented for Stability.";
      cfg.image.providerInfo = cfg.image.providerInfo || {};
      cfg.image.providerInfo[provider] = {
        ok,
        checkedAt,
        baseUrl,
        samplers,
        schedulers,
        warning,
        error,
        details,
      };
      saveConfig(cfg);
      return res.json({ ok, provider, baseUrl, samplers, schedulers, warning, error, checkedAt });
    } else if (provider === "huggingface") {
      const apiKeyRef = cfg.image.huggingface?.apiKeyRef;
      if (!apiKeyRef) {
        ok = false;
        error = "No Hugging Face API key selected.";
      } else {
        const apiKey = await getKey(apiKeyRef);
        if (!apiKey) {
          ok = false;
          error = "Selected API key not found.";
        } else {
          try {
            details = await httpGetJson("https://huggingface.co/api/whoami-v2", {
              timeoutMs: 10000,
              headers: { Authorization: `Bearer ${apiKey}` },
            });
            ok = true;
          } catch (e: any) {
            ok = false;
            error = String(e?.message ?? e);
            if (isHttpRequestError(e)) details = e.details;
          }
        }
      }
      cfg.image.providerInfo = cfg.image.providerInfo || {};
      cfg.image.providerInfo[provider] = {
        ok,
        checkedAt,
        baseUrl,
        samplers,
        schedulers,
        warning,
        error,
        details,
      };
      saveConfig(cfg);
      return res.json({ ok, provider, baseUrl, samplers, schedulers, warning, error, checkedAt, details });
    } else if (provider === "google") {
      const apiKeyRef = cfg.image.google?.apiKeyRef;
      if (!apiKeyRef) {
        ok = false;
        error = "No API key selected.";
      } else {
        const apiKey = await getKey(apiKeyRef);
        if (!apiKey) {
          ok = false;
          error = "Selected API key not found.";
        } else {
          ok = true;
          warning = "Google provider does not expose samplers/schedulers.";
        }
      }
      cfg.image.providerInfo = cfg.image.providerInfo || {};
      cfg.image.providerInfo[provider] = {
        ok,
        checkedAt,
        baseUrl,
        samplers,
        schedulers,
        warning,
        error,
        details,
      };
      saveConfig(cfg);
      return res.json({ ok, provider, baseUrl, samplers, schedulers, warning, error, checkedAt });
    } else {
      try {
        const data = await httpGetJson(`${baseUrl}/sdapi/v1/samplers`, { timeoutMs: TIMEOUT_CONNECT_MS });
        samplers = parseStringList(data);
        ok = true;
      } catch (e: any) {
        ok = false;
        error = String(e?.message ?? e);
        if (isHttpRequestError(e)) details = e.details;
      }

      try {
        const data = await httpGetJson(`${baseUrl}/sdapi/v1/schedulers`, { timeoutMs: TIMEOUT_CONNECT_MS });
        schedulers = parseStringList(data);
      } catch (e: any) {
        if (isHttpRequestError(e) && (e.details.status === 404 || e.details.status === 405)) {
          warning = "Endpoint not available";
        } else {
          error = error || String(e?.message ?? e);
          if (isHttpRequestError(e)) details = details || e.details;
        }
      }
    }
    cfg.image.providerInfo = cfg.image.providerInfo || {};
    cfg.image.providerInfo[provider] = {
      ok,
      checkedAt,
      baseUrl,
      samplers,
      schedulers,
      warning,
      error,
      details,
    };
    saveConfig(cfg);

    return res.json({ ok, provider, baseUrl, samplers, schedulers, warning, error, checkedAt, details });
  } catch (e: any) {
    if (isHttpRequestError(e)) {
      return res.status(200).json({ ok: false, error: e.message, details: e.details, provider, baseUrl });
    }
    return res.status(200).json({ ok: false, error: String(e?.message ?? e), provider, baseUrl });
  }
});

// POST /api/image/generate
imageRouter.post("/generate", async (req, res) => {
  try {
    const body = GenerateSchema.parse(req.body);
    const cfg = loadConfig();
    const provider = cfg.image.provider;

    if (provider === "google") {
      const cfgGoogle = cfg.image.google;
      if (!cfgGoogle) {
        return res.status(200).json({ ok: false, provider, error: "Google configuration not found." });
      }
      const apiKeyRef = cfgGoogle?.apiKeyRef;
      if (!apiKeyRef) {
        return res.status(200).json({ ok: false, provider, error: "No API key selected." });
      }
      const apiKey = await getKey(apiKeyRef);
      if (!apiKey) {
        return res.status(200).json({ ok: false, provider, error: "Selected API key not found." });
      }
      try {
        const { buffer, mime } = await generateGoogleImage({
          prompt: body.prompt,
          negativePrompt: body.negativePrompt || undefined,
          cfgGoogle,
          apiKey,
        });
        const id = putResult(buffer, mime);
        return res.json({
          ok: true,
          provider,
          imageUrl: `/api/image/result/${encodeURIComponent(id)}`,
        });
      } catch (e: any) {
        if (isHttpRequestError(e)) {
          return res.status(200).json({ ok: false, provider, error: e.message, details: e.details });
        }
        return res.status(200).json({
          ok: false,
          provider,
          error: String(e?.message ?? e),
        });
      }
    }

    if (provider === "huggingface") {
      const apiKeyRef = cfg.image.huggingface?.apiKeyRef;
      if (!apiKeyRef) {
        return res.status(400).json({ ok: false, provider, error: "No Hugging Face API key selected." });
      }
      const apiKey = await getKey(apiKeyRef);
      if (!apiKey) {
        return res.status(400).json({ ok: false, provider, error: "Selected API key not found." });
      }
      const model = cfg.image.huggingface?.model || "black-forest-labs/FLUX.1-schnell";
      const hfProvider = cfg.image.huggingface?.provider || "hf-inference";
      try {
        const result = await huggingfaceTextToImage({
          accessToken: apiKey,
          prompt: body.prompt,
          negativePrompt: body.negativePrompt || undefined,
          model,
          provider: hfProvider,
          width: cfg.image.width,
          height: cfg.image.height,
          steps: cfg.image.steps,
          cfgScale: cfg.image.cfgScale,
        });
        return res.json({
          ok: true,
          provider,
          imageUrl: `/output/${encodeURIComponent(result.fileName)}`,
          meta: { provider, model, hfProvider },
        });
      } catch (e: any) {
        if (isHttpRequestError(e)) {
          return res.status(200).json({ ok: false, provider, error: e.message, details: e.details });
        }
        return res.status(200).json({
          ok: false,
          provider,
          error: String(e?.message ?? e),
        });
      }
    }

    if (provider === "stability") {
      const apiKeyRef = cfg.image.stability?.apiKeyRef;
      if (!apiKeyRef) {
        return res.status(200).json({ ok: false, provider, error: "No API key selected for Stability." });
      }
      const apiKey = await getKey(apiKeyRef);
      if (!apiKey) {
        return res.status(200).json({ ok: false, provider, error: "Selected API key not found." });
      }
      try {
        const result = await stabilityGenerate({
          prompt: body.prompt,
          negativePrompt: body.negativePrompt || "",
          seed: body.seed,
          aspectRatio: body.aspectRatio || cfg.image.stability?.aspectRatio,
          outputFormat: body.outputFormat || cfg.image.stability?.outputFormat,
          apiKey,
          baseUrl: cfg.image.stability?.baseUrl || cfg.image.baseUrls?.stability,
        });
        return res.json({
          ok: true,
          provider,
          seed: body.seed,
          imageUrl: `/output/${encodeURIComponent(result.filename)}`,
        });
      } catch (e: any) {
        if (isHttpRequestError(e)) {
          return res.status(200).json({ ok: false, provider, error: e.message, details: e.details });
        }
        return res.status(200).json({
          ok: false,
          provider,
          error: String(e?.message ?? e),
        });
      }
    }

    if (provider === "sdapi" || provider === "koboldcpp") {
      const baseUrl = normalizeBaseUrl(cfg.image.baseUrls?.[provider] || "");
      const seed = body.seed ?? -1;
      const payload: Record<string, any> = {
        prompt: body.prompt,
        negative_prompt: body.negativePrompt || "",
        seed,
        steps: cfg.image.steps,
        cfg_scale: cfg.image.cfgScale,
        width: cfg.image.width,
        height: cfg.image.height,
      };
      if (cfg.image.sampler) payload.sampler_name = cfg.image.sampler;
      if (cfg.image.scheduler) payload.scheduler = cfg.image.scheduler;

      let out: any;
      try {
        out = await httpPostJson(`${baseUrl}/sdapi/v1/txt2img`, payload, {
          timeoutMs: TIMEOUT_SDAPI_TXT2IMG_MS,
          maxBodyChars: 2000,
        });
      } catch (e: any) {
        if (isHttpRequestError(e)) {
          return res.status(200).json({ ok: false, provider, error: e.message, details: e.details, baseUrl });
        }
        return res.status(200).json({ ok: false, provider, error: String(e?.message ?? e), baseUrl });
      }
      const firstImage = Array.isArray(out?.images) ? out.images[0] : null;
      if (!firstImage || typeof firstImage !== "string") {
        return res.status(200).json({ ok: false, provider, error: "SDAPI did not return any images", out });
      }
      const buf = decodeBase64Image(firstImage);
      const id = putResult(buf, "image/png");
      return res.json({
        ok: true,
        provider,
        seed,
        imageUrl: `/api/image/result/${encodeURIComponent(id)}?_fmt=png`,
        imageBase64: firstImage,
      });
    }

    if (provider !== "comfyui") {
      return res.status(200).json({ ok: false, provider, error: `Provider '${provider}' not implemented yet.` });
    }

    const baseUrl = getComfyBaseUrl();
    const workflowName = cfg.image.comfyui.workflow || "sd_basic.json";
    const workflow = await loadWorkflow(workflowName);
    const bindings = await loadBindingsForWorkflow(workflowName) as BindingsMap;

    const seed = (body.seed ?? Math.floor(Math.random() * 2_000_000_000));

    const patched = applyBindings(workflow, bindings, {
      prompt: body.prompt,
      negativePrompt: body.negativePrompt || "",
      seed,
      steps: cfg.image.steps,
      cfgScale: cfg.image.cfgScale,
      sampler: cfg.image.sampler || "euler",
      scheduler: cfg.image.scheduler || "simple",
      width: roundTo64(cfg.image.width),
      height: roundTo64(cfg.image.height),
      model: cfg.image.comfyui.model || workflow["4"]?.inputs?.ckpt_name
    });
    applyLoraSettings(patched, cfg);

    // Submit
    let submit: any;
    try {
      submit = await httpPostJson(`${baseUrl}/prompt`, { prompt: patched }, { timeoutMs: TIMEOUT_COMFY_PROMPT_MS });
    } catch (e: any) {
      if (isHttpRequestError(e)) {
        return res.status(200).json({ ok: false, error: e.message, details: e.details });
      }
      return res.status(200).json({ ok: false, error: String(e?.message ?? e) });
    }
    const promptId = submit?.prompt_id;
    if (!promptId) return res.status(200).json({ ok: false, error: "ComfyUI did not return prompt_id", submit });

    const job = createComfyJob(baseUrl, promptId);
    updateJob(job.id, { state: "running", message: "Submitted to ComfyUI", progress: 0.1 });
    return res.json({ ok: true, provider: "comfyui", jobId: job.id, promptId });
  } catch (e: any) {
    if (isHttpRequestError(e)) {
      return res.status(200).json({ ok: false, error: e.message, details: e.details });
    }
    return res.status(200).json({ ok: false, error: String(e?.message ?? e) });
  }
});
