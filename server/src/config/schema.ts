import path from "node:path";
import { z } from "zod";

const defaultLibraryDir = path.resolve(process.cwd(), "data", "library");

export const ConfigSchema = z.object({
  text: z.object({
    provider: z.enum(["koboldcpp", "openai_compat", "google_gemini"]).default("koboldcpp"),
    koboldcpp: z.object({
      baseUrl: z.string().default("http://127.0.0.1:5001"),
      model: z.string().optional(),
      requestTimeoutMs: z.number().int().min(1000).max(60 * 60 * 1000).default(10 * 60 * 1000),
      defaultParams: z.object({
        temperature: z.number().optional(),
        top_p: z.number().optional(),
        max_tokens: z.number().int().min(128).max(8196).optional(),
      }).default({ max_tokens: 896 }),
    }).default({}),
    openaiCompat: z.object({
      baseUrl: z.string().default("http://127.0.0.1:1234/v1"),
      apiKeyRef: z.string().optional(),
      model: z.string().optional(),
      requestTimeoutMs: z.number().int().min(1000).max(60 * 60 * 1000).default(10 * 60 * 1000),
      defaultParams: z.object({
        temperature: z.number().optional(),
        top_p: z.number().optional(),
        max_tokens: z.number().int().optional(),
      }).default({}),
    }).default({}),
    googleGemini: z.object({
      openaiBaseUrl: z.string().default("https://generativelanguage.googleapis.com/v1beta/openai/"),
      apiBaseUrl: z.string().default("https://generativelanguage.googleapis.com/v1beta"),
      apiKeyRef: z.string().optional(),
      model: z.string().optional(),
      requestTimeoutMs: z.number().int().min(1000).max(60 * 60 * 1000).default(10 * 60 * 1000),
      defaultParams: z.object({
        temperature: z.number().optional(),
        top_p: z.number().optional(),
        max_tokens: z.number().int().optional(),
      }).default({}),
    }).default({}),
  }).default({}),

  image: z.object({
    provider: z.enum(["comfyui", "sdapi", "koboldcpp", "stability", "huggingface", "google"]).default("comfyui"),
    baseUrls: z.object({
      sdapi: z.string().default("http://127.0.0.1:7860"),
      comfyui: z.string().default("http://127.0.0.1:8188"),
      koboldcpp: z.string().default("http://127.0.0.1:5001"),
      stability: z.string().default("https://api.stability.ai"),
      huggingface: z.string().default("https://router.huggingface.co"),
      google: z.string().default("https://generativelanguage.googleapis.com"),
    }).default({}),

    // common
    width: z.number().int().min(64).max(4096).default(1024),
    height: z.number().int().min(64).max(4096).default(1024),
    steps: z.number().int().min(1).max(200).default(30),
    cfgScale: z.number().min(0).max(30).default(7),

    sampler: z.string().optional(),
    scheduler: z.string().optional(),
    negativePrompt: z.object({
      useDefault: z.boolean().default(true),
      defaultText: z.string().default(""),
    }).default({}),

    providerInfo: z.object({
      sdapi: z.object({
        ok: z.boolean(),
        checkedAt: z.string(),
        baseUrl: z.string(),
        details: z.any().optional(),
        samplers: z.array(z.string()).optional(),
        schedulers: z.array(z.string()).optional(),
        warning: z.string().optional(),
        error: z.string().optional(),
      }).optional(),
      comfyui: z.object({
        ok: z.boolean(),
        checkedAt: z.string(),
        baseUrl: z.string(),
        details: z.any().optional(),
        samplers: z.array(z.string()).optional(),
        schedulers: z.array(z.string()).optional(),
        warning: z.string().optional(),
        error: z.string().optional(),
      }).optional(),
      koboldcpp: z.object({
        ok: z.boolean(),
        checkedAt: z.string(),
        baseUrl: z.string(),
        details: z.any().optional(),
        samplers: z.array(z.string()).optional(),
        schedulers: z.array(z.string()).optional(),
        warning: z.string().optional(),
        error: z.string().optional(),
      }).optional(),
      stability: z.object({
        ok: z.boolean(),
        checkedAt: z.string(),
        baseUrl: z.string(),
        details: z.any().optional(),
        samplers: z.array(z.string()).optional(),
        schedulers: z.array(z.string()).optional(),
        warning: z.string().optional(),
        error: z.string().optional(),
      }).optional(),
      huggingface: z.object({
        ok: z.boolean(),
        checkedAt: z.string(),
        baseUrl: z.string(),
        details: z.any().optional(),
        samplers: z.array(z.string()).optional(),
        schedulers: z.array(z.string()).optional(),
        warning: z.string().optional(),
        error: z.string().optional(),
      }).optional(),
      google: z.object({
        ok: z.boolean(),
        checkedAt: z.string(),
        baseUrl: z.string(),
        details: z.any().optional(),
        samplers: z.array(z.string()).optional(),
        schedulers: z.array(z.string()).optional(),
        warning: z.string().optional(),
        error: z.string().optional(),
      }).optional(),
    }).default({}),

    sdapi: z.object({
      apiKeyRef: z.string().optional(),
    }).default({}),

    // comfyui-specific (phase 1)
    comfyui: z.object({
      apiKeyRef: z.string().optional(),
      model: z.string().optional(),
      lora: z.string().optional(),
      loraStrength: z.number().min(0).max(2).default(0.8),
      clipStrength: z.number().min(0).max(2).default(1.0),
      workflowName: z.string().optional(), // legacy
      workflow: z.string().default("sd_basic.json"),
      loraName: z.string().nullable().default(null),
      loraStrengthModel: z.number().min(0).max(2).default(1.0),
      loraStrengthClip: z.number().min(0).max(2).default(1.0),
    }).default({}),

    koboldcpp: z.object({
      apiKeyRef: z.string().optional(),
    }).default({}),

    stability: z.object({
      baseUrl: z.string().default("https://api.stability.ai"),
      apiKeyRef: z.string().optional(),
      aspectRatio: z.string().default("1:1"),
      outputFormat: z.enum(["png", "webp", "jpeg"]).default("png"),
    }).default({}),

    huggingface: z.object({
      apiKeyRef: z.string().optional(),
      model: z.string().default("black-forest-labs/FLUX.1-schnell"),
      provider: z.string().default("hf-inference"),
    }).default({}),

    google: z.object({
      baseUrl: z.string().optional(),
      apiKeyRef: z.string().optional(),
      mode: z.enum(["imagen", "nano"]).default("imagen"),
      imagen: z.object({
        model: z.string().default("imagen-4.0-generate-001"),
        numberOfImages: z.number().int().min(1).max(4).default(1),
        imageSize: z.enum(["1K", "2K"]).default("1K"),
        aspectRatio: z.string().default("1:1"),
        personGeneration: z.enum(["dont_allow", "allow_adult", "allow_all"]).default("allow_adult"),
      }).default({}),
      nano: z.object({
        model: z.enum(["gemini-2.5-flash-image", "gemini-3-pro-image-preview"]).default("gemini-2.5-flash-image"),
        aspectRatio: z.string().default("1:1"),
        imageSize: z.enum(["1K", "2K", "4K"]).optional(),
      }).default({}),
    }).default({}),
  }).default({})
  ,
  library: z.object({
    dir: z.string().default(defaultLibraryDir),
    activeRepoId: z.string().default("cardgen"),
    repositories: z.array(z.object({
      id: z.string(),
      name: z.string(),
      dir: z.string(),
      kind: z.enum(["managed", "folder"]).default("managed"),
      readOnly: z.boolean().default(false),
    })).default([{ id: "cardgen", name: "CardGen", dir: defaultLibraryDir, kind: "managed", readOnly: false }]),
  }).default({})
  ,
  generation: z.object({
    contentRating: z.enum(["sfw", "nsfw_allowed"]).default("nsfw_allowed"),
    structuredJson: z.object({
      enabled: z.boolean().default(true),
      temperature: z.number().min(0).max(2).default(0.3),
      top_p: z.number().min(0).max(1).default(0.9),
    }).default({}),
    fieldDetail: z.object({
      profile: z.enum(["short", "detailed", "verbose"]).default("detailed"),
      overrides: z.object({
        description: z.enum(["inherit", "short", "detailed", "verbose"]).optional(),
        personality: z.enum(["inherit", "short", "detailed", "verbose"]).optional(),
        scenario: z.enum(["inherit", "short", "detailed", "verbose"]).optional(),
        first_mes: z.enum(["inherit", "short", "detailed", "verbose"]).optional(),
        mes_example: z.enum(["inherit", "short", "detailed", "verbose"]).optional(),
        creator_notes: z.enum(["inherit", "short", "detailed", "verbose"]).optional(),
        tags: z.enum(["inherit", "short", "detailed", "verbose"]).optional(),
      }).default({}),
    }).default({}),
  }).default({}),

  secrets: z.object({
    apiKeys: z.record(z.string()).default({}),
  }).default({ apiKeys: {} }),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function defaultConfig(): AppConfig {
  return ConfigSchema.parse({});
}

export type ImageProvider = "sdapi" | "comfyui" | "koboldcpp" | "stability" | "huggingface" | "google";

export type ImageProviderInfo = {
  ok: boolean;
  checkedAt: string;
  baseUrl: string;
  details?: any;
  samplers?: string[];
  schedulers?: string[];
  warning?: string;
  error?: string;
};
