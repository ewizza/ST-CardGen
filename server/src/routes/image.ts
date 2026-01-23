import { Router } from "express";
import { z } from "zod";

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
import { fail, ok, wrap } from "../lib/api.js";
import { mapHttpRequestError, mapUnknownError } from "../lib/errorMap.js";
import { savePngBuffer } from "../lib/imageStore.js";

export const imageRouter = Router();


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

// GET /api/image/comfyui/workflows
imageRouter.get("/comfyui/workflows", wrap(async (req, res) => {
  try {
    const workflows = await listWorkflows();
    return ok(res, { workflows });
  } catch (e: any) {
    if (e instanceof z.ZodError) throw e;
    if (isHttpRequestError(e)) {
      const mapped = mapHttpRequestError(e);
      return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
    }
    const mapped = mapUnknownError(e);
    return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
  }
}));

// GET /api/image/samplers
imageRouter.get("/samplers", wrap(async (req, res) => {
  let provider: string | undefined;
  let baseUrl: string | undefined;
  try {
    const cfg = loadConfig();
    provider = cfg.image.provider;

    if (cfg.image.provider === "google") {
      return ok(res, { provider, baseUrl, samplers: [] });
    }

    if (cfg.image.provider === "comfyui") {
      baseUrl = getComfyBaseUrl();
      const info = await getObjectInfo(baseUrl);
      const samplers = extractSamplers(info);
      return ok(res, { provider, baseUrl, samplers });
    }

    if (cfg.image.provider === "sdapi" || cfg.image.provider === "koboldcpp") {
      baseUrl = normalizeBaseUrl(cfg.image.baseUrls?.[cfg.image.provider] || "");
      const data = await httpGetJson(`${baseUrl}/sdapi/v1/samplers`, { timeoutMs: TIMEOUT_LIST_MS });
      const samplers = parseStringList(data);
      return ok(res, { provider, baseUrl, samplers });
    }

    return ok(res, { provider, samplers: [] });
  } catch (e: any) {
    if (isHttpRequestError(e)) {
      const mapped = mapHttpRequestError(e);
      const details = mapped.details ? { ...mapped.details, provider, baseUrl } : { provider, baseUrl };
      return fail(res, mapped.status, mapped.code, mapped.message, details);
    }
    const mapped = mapUnknownError(e);
    const details = mapped.details ? { ...mapped.details, provider, baseUrl } : { provider, baseUrl };
    return fail(res, mapped.status, mapped.code, mapped.message, details);
  }
}));

// GET /api/image/schedulers
imageRouter.get("/schedulers", wrap(async (req, res) => {
  let provider: string | undefined;
  let baseUrl: string | undefined;
  try {
    const cfg = loadConfig();
    provider = cfg.image.provider;

    if (cfg.image.provider === "google") {
      return ok(res, { provider, baseUrl, schedulers: [] });
    }

    if (cfg.image.provider === "comfyui") {
      baseUrl = getComfyBaseUrl();
      const info = await getObjectInfo(baseUrl);
      const schedulers = extractSchedulers(info);
      return ok(res, { provider, baseUrl, schedulers });
    }

    if (cfg.image.provider === "sdapi" || cfg.image.provider === "koboldcpp") {
      baseUrl = normalizeBaseUrl(cfg.image.baseUrls?.[cfg.image.provider] || "");
      try {
        const data = await httpGetJson(`${baseUrl}/sdapi/v1/schedulers`, { timeoutMs: TIMEOUT_LIST_MS });
        const schedulers = parseStringList(data);
        return ok(res, { provider, baseUrl, schedulers });
      } catch (e: any) {
        if (isHttpRequestError(e) && (e.details.status === 404 || e.details.status === 405)) {
          return ok(res, {
            provider,
            baseUrl,
            schedulers: [],
            warning: "Endpoint not available",
          });
        }
        throw e;
      }
    }

    return ok(res, { provider, schedulers: [] });
  } catch (e: any) {
    if (isHttpRequestError(e)) {
      const mapped = mapHttpRequestError(e);
      const details = mapped.details ? { ...mapped.details, provider, baseUrl } : { provider, baseUrl };
      return fail(res, mapped.status, mapped.code, mapped.message, details);
    }
    const mapped = mapUnknownError(e);
    const details = mapped.details ? { ...mapped.details, provider, baseUrl } : { provider, baseUrl };
    return fail(res, mapped.status, mapped.code, mapped.message, details);
  }
}));

// POST /api/image/connect
imageRouter.post("/connect", wrap(async (req, res) => {
  const body = z.object({
    provider: z.enum(["sdapi", "comfyui", "koboldcpp", "stability", "huggingface", "google"]),
  }).parse(req.body);

  const provider = body.provider;
  const cfg = loadConfig();
  const checkedAt = new Date().toISOString();
  let baseUrl: string | undefined;
  let samplers: string[] = [];
  let schedulers: string[] = [];
  let warning: string | undefined;
  let error: string | undefined;
  let details: any;
  let okFlag = false;

  if (provider === "stability") {
    baseUrl = normalizeBaseUrl(cfg.image.stability?.baseUrl || cfg.image.baseUrls?.stability || "");
  } else if (provider === "huggingface") {
    baseUrl = normalizeBaseUrl(cfg.image.baseUrls?.huggingface || "https://router.huggingface.co");
  } else if (provider === "google") {
    baseUrl = normalizeBaseUrl(cfg.image.google?.baseUrl || cfg.image.baseUrls?.google || "");
  } else {
    baseUrl = normalizeBaseUrl(cfg.image.baseUrls?.[provider] || "");
  }

  const persist = () => {
    cfg.image.providerInfo = cfg.image.providerInfo || {};
    cfg.image.providerInfo[provider] = {
      ok: okFlag,
      checkedAt,
      baseUrl,
      samplers,
      schedulers,
      warning,
      error,
      details,
    };
    saveConfig(cfg);
  };

  const failWith = (status: number, code: string, message: string, extraDetails?: any) => {
    error = message;
    okFlag = false;
    persist();
    const payload = extraDetails ?? { provider, baseUrl, checkedAt, samplers, schedulers, warning, details };
    return fail(res, status, code, message, payload);
  };

  if (provider === "comfyui") {
    try {
      const info = await getObjectInfo(baseUrl);
      samplers = extractSamplers(info);
      schedulers = extractSchedulers(info);
      const workflows = await listWorkflows();
      details = { hasObjectInfo: true, workflows };
      okFlag = true;
      persist();
      return ok(res, { provider, baseUrl, samplers, schedulers, warning, error, checkedAt, details });
    } catch (e: any) {
      if (isHttpRequestError(e)) {
        const mapped = mapHttpRequestError(e);
        const mappedDetails = mapped.details ? { ...mapped.details, provider, baseUrl, checkedAt } : { provider, baseUrl, checkedAt };
        return failWith(mapped.status, mapped.code, mapped.message, mappedDetails);
      }
      const mapped = mapUnknownError(e);
      return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
    }
  }

  if (provider === "stability") {
    okFlag = true;
    warning = "Connectivity check not implemented for Stability.";
    persist();
    return ok(res, { provider, baseUrl, samplers, schedulers, warning, error, checkedAt });
  }

  if (provider === "huggingface") {
    const apiKeyRef = cfg.image.huggingface?.apiKeyRef;
    if (!apiKeyRef) {
      return failWith(400, "VALIDATION_ERROR", "No Hugging Face API key selected.");
    }
    const apiKey = await getKey(apiKeyRef);
    if (!apiKey) {
      return failWith(404, "NOT_FOUND", "Selected API key not found.");
    }
    try {
      details = await httpGetJson("https://huggingface.co/api/whoami-v2", {
        timeoutMs: 10000,
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      okFlag = true;
      persist();
      return ok(res, { provider, baseUrl, samplers, schedulers, warning, error, checkedAt, details });
    } catch (e: any) {
      if (isHttpRequestError(e)) {
        const mapped = mapHttpRequestError(e);
        return failWith(mapped.status, mapped.code, mapped.message, mapped.details);
      }
      const mapped = mapUnknownError(e);
      return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
    }
  }

  if (provider === "google") {
    const apiKeyRef = cfg.image.google?.apiKeyRef;
    if (!apiKeyRef) {
      return failWith(400, "VALIDATION_ERROR", "No API key selected.");
    }
    const apiKey = await getKey(apiKeyRef);
    if (!apiKey) {
      return failWith(404, "NOT_FOUND", "Selected API key not found.");
    }
    okFlag = true;
    warning = "Google provider does not expose samplers/schedulers.";
    persist();
    return ok(res, { provider, baseUrl, samplers, schedulers, warning, error, checkedAt });
  }

  try {
    const data = await httpGetJson(`${baseUrl}/sdapi/v1/samplers`, { timeoutMs: TIMEOUT_CONNECT_MS });
    samplers = parseStringList(data);
    okFlag = true;
  } catch (e: any) {
    if (isHttpRequestError(e)) {
      const mapped = mapHttpRequestError(e);
      return failWith(mapped.status, mapped.code, mapped.message, mapped.details);
    }
    const mapped = mapUnknownError(e);
    return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
  }

  try {
    const data = await httpGetJson(`${baseUrl}/sdapi/v1/schedulers`, { timeoutMs: TIMEOUT_CONNECT_MS });
    schedulers = parseStringList(data);
  } catch (e: any) {
    if (isHttpRequestError(e) && (e.details.status === 404 || e.details.status === 405)) {
      warning = "Endpoint not available";
    } else if (isHttpRequestError(e)) {
      const mapped = mapHttpRequestError(e);
      return failWith(mapped.status, mapped.code, mapped.message, mapped.details);
    } else {
      const mapped = mapUnknownError(e);
      return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
    }
  }

  persist();
  return ok(res, { provider, baseUrl, samplers, schedulers, warning, error, checkedAt, details });
}));

// POST /api/image/generate
imageRouter.post("/generate", wrap(async (req, res) => {
  try {
    const body = GenerateSchema.parse(req.body);
    const cfg = loadConfig();
    const provider = cfg.image.provider;

    if (provider === "google") {
      const cfgGoogle = cfg.image.google;
      if (!cfgGoogle) {
        return fail(res, 400, "VALIDATION_ERROR", "Google configuration not found.");
      }
      const apiKeyRef = cfgGoogle?.apiKeyRef;
      if (!apiKeyRef) {
        return fail(res, 400, "VALIDATION_ERROR", "No API key selected.");
      }
      const apiKey = await getKey(apiKeyRef);
      if (!apiKey) {
        return fail(res, 404, "NOT_FOUND", "Selected API key not found.");
      }
      try {
        const { buffer } = await generateGoogleImage({
          prompt: body.prompt,
          negativePrompt: body.negativePrompt || undefined,
          cfgGoogle,
          apiKey,
        });
        const saved = await savePngBuffer(buffer, { prefix: "google" });
        return ok(res, { provider, imageUrl: saved.urlPath });
      } catch (e: any) {
        if (isHttpRequestError(e)) {
          const mapped = mapHttpRequestError(e);
          return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
        }
        const mapped = mapUnknownError(e);
        return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
      }
    }

    if (provider === "huggingface") {
      const apiKeyRef = cfg.image.huggingface?.apiKeyRef;
      if (!apiKeyRef) {
        return fail(res, 400, "VALIDATION_ERROR", "No Hugging Face API key selected.");
      }
      const apiKey = await getKey(apiKeyRef);
      if (!apiKey) {
        return fail(res, 404, "NOT_FOUND", "Selected API key not found.");
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
        return ok(res, {
          provider,
          imageUrl: `/output/${encodeURIComponent(result.fileName)}`,
          meta: { provider, model, hfProvider },
        });
      } catch (e: any) {
        if (isHttpRequestError(e)) {
          const mapped = mapHttpRequestError(e);
          return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
        }
        const mapped = mapUnknownError(e);
        return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
      }
    }

    if (provider === "stability") {
      const apiKeyRef = cfg.image.stability?.apiKeyRef;
      if (!apiKeyRef) {
        return fail(res, 400, "VALIDATION_ERROR", "No API key selected for Stability.");
      }
      const apiKey = await getKey(apiKeyRef);
      if (!apiKey) {
        return fail(res, 404, "NOT_FOUND", "Selected API key not found.");
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
        return ok(res, {
          provider,
          seed: body.seed,
          imageUrl: `/output/${encodeURIComponent(result.filename)}`,
        });
      } catch (e: any) {
        if (isHttpRequestError(e)) {
          const mapped = mapHttpRequestError(e);
          return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
        }
        const mapped = mapUnknownError(e);
        return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
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
          const mapped = mapHttpRequestError(e);
          const details = mapped.details ? { ...mapped.details, baseUrl } : { baseUrl };
          return fail(res, mapped.status, mapped.code, mapped.message, details);
        }
        const mapped = mapUnknownError(e);
        const details = mapped.details ? { ...mapped.details, baseUrl } : { baseUrl };
        return fail(res, mapped.status, mapped.code, mapped.message, details);
      }
      const firstImage = Array.isArray(out?.images) ? out.images[0] : null;
      if (!firstImage || typeof firstImage !== "string") {
        return fail(res, 502, "PROVIDER_BAD_RESPONSE", "SDAPI did not return any images", { out });
      }
      const buf = decodeBase64Image(firstImage);
      const saved = await savePngBuffer(buf, { prefix: provider });
      return ok(res, {
        provider,
        seed,
        imageUrl: saved.urlPath,
        imageBase64: firstImage,
      });
    }

    if (provider !== "comfyui") {
      return fail(res, 400, "VALIDATION_ERROR", `Provider '${provider}' not implemented yet.`);
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
        const mapped = mapHttpRequestError(e);
        return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
      }
      const mapped = mapUnknownError(e);
      return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
    }
    const promptId = submit?.prompt_id;
    if (!promptId) return fail(res, 502, "PROVIDER_BAD_RESPONSE", "ComfyUI did not return prompt_id", { submit });

    const job = createComfyJob(baseUrl, promptId);
    updateJob(job.id, { state: "running", message: "Submitted to ComfyUI", progress: 0.1 });
    return ok(res, { provider: "comfyui", jobId: job.id, promptId });
  } catch (e: any) {
    if (isHttpRequestError(e)) {
      const mapped = mapHttpRequestError(e);
      return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
    }
    const mapped = mapUnknownError(e);
    return fail(res, mapped.status, mapped.code, mapped.message, mapped.details);
  }
}));
