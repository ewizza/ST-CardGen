import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";

import { generateText } from "../adapters/text/provider.js";
import { loadConfig } from "../config/store.js";
import { buildCharacterGenPrompt, buildFillMissingPrompt, buildImagePrompt, buildRegeneratePrompt } from "../domain/character/prompt.js";
import { parseCharacterResponse, tryParseJson } from "../domain/character/parse.js";
import { fail, ok, wrap } from "../lib/api.js";

export const characterRouter = Router();

const GenerateSchema = z.object({
  idea: z.string().min(1),
  name: z.string().optional(),
  pov: z.enum(["first", "second", "third"]).default("third"),
  lorebook: z.string().optional(),
});

const FillMissingSchema = z.object({
  card: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    personality: z.string().optional(),
    scenario: z.string().optional(),
    first_mes: z.string().optional(),
    mes_example: z.union([z.string(), z.array(z.string())]).optional(),
    tags: z.union([z.array(z.string()), z.string()]).optional(),
    creator_notes: z.string().optional(),
    image_prompt: z.string().optional(),
    negative_prompt: z.string().optional(),
    pov: z.enum(["first", "second", "third"]).optional(),
  }),
  lorebook: z.string().optional(),
  idea: z.string().optional(),
  pov: z.enum(["first", "second", "third"]).default("third"),
});

const PatchSchema = z.object({
  description: z.string().optional(),
  personality: z.string().optional(),
  scenario: z.string().optional(),
  first_mes: z.string().optional(),
  mes_example: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (value == null) return "";
      return Array.isArray(value) ? value.join("\n\n") : value;
    }),
  tags: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .transform((value) => {
      if (value == null) return [];
      if (Array.isArray(value)) {
        return value.map((tag) => tag.trim()).filter(Boolean);
      }
      return value.split(",").map((tag) => tag.trim()).filter(Boolean);
    }),
  creator_notes: z.string().optional(),
}).strip();

const ImagePromptSchema = z.object({
  image_prompt: z.string(),
  negative_prompt: z.string().optional().default(""),
}).strict();

const RegenerateSchema = z.object({
  idea: z.string().min(1),
  requestedName: z.string().optional(),
  pov: z.enum(["first", "second", "third"]).default("third"),
  lorebook: z.string().optional(),
  maxTokens: z.number().int().min(32).max(4096).optional(),
  card: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    personality: z.string().optional(),
    scenario: z.string().optional(),
    first_mes: z.string().optional(),
    mes_example: z.union([z.string(), z.array(z.string())]).optional(),
    tags: z.union([z.array(z.string()), z.string()]).optional(),
    creator_notes: z.string().optional(),
    image_prompt: z.string().optional(),
    negative_prompt: z.string().optional(),
  }),
  keep: z.object({
    name: z.boolean(),
    description: z.boolean(),
    personality: z.boolean(),
    scenario: z.boolean(),
    first_mes: z.boolean(),
    mes_example: z.boolean(),
    tags: z.boolean(),
    creator_notes: z.boolean(),
    image_prompt: z.boolean(),
    negative_prompt: z.boolean(),
  }),
});

const RegeneratePatchSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  personality: z.string().optional(),
  scenario: z.string().optional(),
  first_mes: z.string().optional(),
  mes_example: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (value == null) return "";
      return Array.isArray(value) ? value.join("\n\n") : value;
    }),
  tags: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .transform((value) => {
      if (value == null) return [];
      if (Array.isArray(value)) {
        return value.map((tag) => tag.trim()).filter(Boolean);
      }
      return value.split(",").map((tag) => tag.trim()).filter(Boolean);
    }),
  creator_notes: z.string().optional(),
  image_prompt: z.string().optional(),
  negative_prompt: z.string().optional(),
}).strip();

function isMissingValue(value: any) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function pickMissingKeys(card: Record<string, any>) {
  const candidates = [
    "description",
    "personality",
    "scenario",
    "first_mes",
    "mes_example",
    "tags",
    "creator_notes",
  ];
  return candidates.filter((key) => isMissingValue(card[key]));
}

function filterPatchToMissing(patch: Record<string, any>, missing: string[]) {
  const allow = new Set(missing);
  const filtered: Record<string, any> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (allow.has(key)) filtered[key] = value;
  }
  return filtered;
}

function filterPatchToTargets(patch: Record<string, any>, targets: string[]) {
  const allow = new Set(targets);
  const filtered: Record<string, any> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (allow.has(key)) filtered[key] = value;
  }
  return filtered;
}

const makeNonce = () => crypto.randomUUID();

function normalizeString(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeValue(value: any): any {
  if (typeof value === "string") return normalizeString(value);
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }
  if (value && typeof value === "object") {
    const normalized: Record<string, any> = {};
    for (const [key, child] of Object.entries(value)) {
      normalized[key] = normalizeValue(child);
    }
    return normalized;
  }
  return value;
}

function equalNormalized(a: any, b: any) {
  return JSON.stringify(normalizeValue(a)) === JSON.stringify(normalizeValue(b));
}

function defaultNegativePrompt(contentRating: "sfw" | "nsfw_allowed") {
  const base = "lowres, blurry, jpeg artifacts, bad anatomy, extra limbs, extra fingers, missing fingers, bad hands, bad face, deformed, mutated, out of frame, watermark, signature, text, logo";
  if (contentRating === "sfw") {
    return `${base}, nudity, explicit sexual content`;
  }
  return base;
}

// POST /api/character/generate
characterRouter.post("/generate", wrap(async (req, res) => {
  const rawLimit = 8000;
  let raw: string | null = null;
  try {
    const body = GenerateSchema.parse(req.body);
    const cfg = loadConfig();
    const contentRating = cfg.generation?.contentRating ?? "nsfw_allowed";
    const fieldDetail = cfg.generation?.fieldDetail;
    const prompt = buildCharacterGenPrompt(
      {
        idea: body.idea,
        name: body.name,
        pov: body.pov,
        lorebook: body.lorebook,
      },
      { contentRating, fieldDetail }
    );

    raw = await generateText("", prompt);
    const character = parseCharacterResponse(raw);
    if (!character.negative_prompt?.trim()) {
      character.negative_prompt = defaultNegativePrompt(contentRating);
    }
    return ok(res, { character });
  } catch (e: any) {
    if (e instanceof z.ZodError) throw e;
    const message = String(e?.message ?? e);
    const details = raw ? { raw: raw.slice(0, rawLimit) } : undefined;
    return fail(res, 502, "PROVIDER_ERROR", message, details);
  }
}));

// POST /api/character/fill-missing
characterRouter.post("/fill-missing", wrap(async (req, res) => {
  try {
    const body = FillMissingSchema.parse(req.body);
    const missingKeys = pickMissingKeys(body.card);
    if (!missingKeys.length) {
      return ok(res, { patch: {} });
    }

    const cfg = loadConfig();
    const fieldDetail = cfg.generation?.fieldDetail;
    const prompt = buildFillMissingPrompt(
      {
        card: body.card,
        missingKeys,
        pov: body.pov,
        idea: body.idea,
        lorebook: body.lorebook,
      },
      { fieldDetail }
    );

    const raw = await generateText("", prompt);
    const parsed = tryParseJson(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fail(res, 502, "PROVIDER_BAD_RESPONSE", "Invalid JSON from LLM", { raw: raw.slice(0, 8000) });
    }

    const validated = PatchSchema.safeParse(parsed);
    if (!validated.success) {
      return fail(res, 502, "PROVIDER_BAD_RESPONSE", "LLM JSON did not match patch schema", {
        issues: validated.error.issues,
        raw: raw.slice(0, 8000),
      });
    }

    const filtered = filterPatchToMissing(validated.data, missingKeys);
    return ok(res, { patch: filtered });
  } catch (e: any) {
    if (e instanceof z.ZodError) throw e;
    return fail(res, 502, "PROVIDER_ERROR", String(e?.message ?? e));
  }
}));

// POST /api/character/image-prompt
characterRouter.post("/image-prompt", wrap(async (req, res) => {
  try {
    const body = z.object({
      card: z.object({
        name: z.string().optional(),
        description: z.string().optional(),
        personality: z.string().optional(),
        scenario: z.string().optional(),
        tags: z.union([z.array(z.string()), z.string()]).optional(),
        creator_notes: z.string().optional(),
      }),
      styleHints: z.string().optional(),
    }).parse(req.body);

    const cfg = loadConfig();
    const contentRating = cfg.generation?.contentRating ?? "nsfw_allowed";
    const prompt = buildImagePrompt({
      card: body.card,
      styleHints: body.styleHints,
      contentRating,
    });

    const raw = await generateText("", prompt);
    const parsed = tryParseJson(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fail(res, 502, "PROVIDER_BAD_RESPONSE", "Invalid JSON from LLM", { raw: raw.slice(0, 8000) });
    }

    const validated = ImagePromptSchema.safeParse(parsed);
    if (!validated.success) {
      return fail(res, 502, "PROVIDER_BAD_RESPONSE", "LLM JSON did not match image prompt schema", {
        issues: validated.error.issues,
        raw: raw.slice(0, 8000),
      });
    }

    const payload = validated.data;
    if (!payload.negative_prompt?.trim()) {
      payload.negative_prompt = defaultNegativePrompt(contentRating);
    }
    return ok(res, { ...payload });
  } catch (e: any) {
    if (e instanceof z.ZodError) throw e;
    return fail(res, 502, "PROVIDER_ERROR", String(e?.message ?? e));
  }
}));

// POST /api/character/regenerate
characterRouter.post("/regenerate", wrap(async (req, res) => {
  try {
    const body = RegenerateSchema.parse(req.body);
    const targets = Object.entries(body.keep)
      .filter(([, keep]) => !keep)
      .map(([key]) => key);

    if (!targets.length) {
      return ok(res, { patch: {} });
    }

    let lastFiltered: Record<string, any> = {};
    const maxTokens = body.maxTokens;
    const regenParams = maxTokens ? { max_tokens: maxTokens } : undefined;
    const cfg = loadConfig();
    const fieldDetail = cfg.generation?.fieldDetail;
    for (let attempt = 0; attempt < 3; attempt++) {
      const prompt = buildRegeneratePrompt(
        {
          idea: body.idea,
          requestedName: body.requestedName,
          pov: body.pov,
          lorebook: body.lorebook,
          card: body.card,
          targets,
          regenNonce: makeNonce(),
        },
        { fieldDetail }
      );

      const raw = await generateText("", prompt, regenParams);
      const parsed = tryParseJson(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return fail(res, 502, "PROVIDER_BAD_RESPONSE", "Invalid JSON from LLM", { raw: raw.slice(0, 8000) });
      }

      const validated = RegeneratePatchSchema.safeParse(parsed);
      if (!validated.success) {
        return fail(res, 502, "PROVIDER_BAD_RESPONSE", "LLM JSON did not match patch schema", {
          issues: validated.error.issues,
          raw: raw.slice(0, 8000),
        });
      }

      const filtered = filterPatchToTargets(validated.data, targets);
      lastFiltered = filtered;
      const anyDifferent = targets.some((key) => {
        const existingValue = (body.card as Record<string, any>)[key];
        const regenerated = filtered[key];
        if (existingValue === undefined || existingValue === null) {
          return !isMissingValue(regenerated);
        }
        return !equalNormalized(existingValue, regenerated);
      });

      if (anyDifferent) {
        return ok(res, { patch: filtered });
      }
    }

    return ok(res, { patch: lastFiltered });
  } catch (e: any) {
    if (e instanceof z.ZodError) throw e;
    return fail(res, 502, "PROVIDER_ERROR", String(e?.message ?? e));
  }
}));
