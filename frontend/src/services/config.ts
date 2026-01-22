import { httpJson } from "@/services/http";

export type ImageProvider = "comfyui" | "sdapi" | "koboldcpp" | "stability" | "huggingface" | "google";

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

export type FieldDetailProfile = "short" | "detailed" | "verbose";

export type FieldOverrideMode = "inherit" | FieldDetailProfile;

export type FieldKey =
  | "description"
  | "personality"
  | "scenario"
  | "first_mes"
  | "mes_example"
  | "creator_notes"
  | "tags";

export type AppConfig = {
  text: {
    provider: "koboldcpp" | "openai_compat" | "google_gemini";
    koboldcpp: {
      baseUrl: string;
      model?: string;
      requestTimeoutMs?: number;
      defaultParams?: { temperature?: number; top_p?: number; max_tokens?: number };
    };
    openaiCompat: {
      baseUrl: string;
      apiKeyRef?: string;
      model?: string;
      requestTimeoutMs?: number;
      defaultParams?: { temperature?: number; top_p?: number; max_tokens?: number };
    };
    googleGemini: {
      openaiBaseUrl: string;
      apiBaseUrl: string;
      apiKeyRef?: string;
      model?: string;
      requestTimeoutMs?: number;
      defaultParams?: { temperature?: number; top_p?: number; max_tokens?: number };
    };
  };
  image: {
    provider: ImageProvider;
    baseUrls: { sdapi: string; comfyui: string; koboldcpp: string; stability: string; huggingface: string; google: string };
    providerInfo?: { sdapi?: ImageProviderInfo; comfyui?: ImageProviderInfo; koboldcpp?: ImageProviderInfo; stability?: ImageProviderInfo; huggingface?: ImageProviderInfo; google?: ImageProviderInfo };
    width: number; height: number; steps: number; cfgScale: number;
    sampler?: string; scheduler?: string;
    sdapi?: { apiKeyRef?: string };
    koboldcpp?: { apiKeyRef?: string };
    stability?: { baseUrl?: string; apiKeyRef?: string; aspectRatio?: string; outputFormat?: "png" | "webp" | "jpeg" };
    huggingface?: { apiKeyRef?: string; model: string; provider: string };
    google?: {
      baseUrl?: string;
      apiKeyRef?: string;
      mode: "imagen" | "nano";
      imagen: {
        model: string;
        numberOfImages: number;
        imageSize: "1K" | "2K";
        aspectRatio: string;
        personGeneration: "dont_allow" | "allow_adult" | "allow_all";
      };
      nano: {
        model: "gemini-2.5-flash-image" | "gemini-3-pro-image-preview";
        aspectRatio: string;
        imageSize?: "1K" | "2K" | "4K";
      };
    };
    comfyui: {
      apiKeyRef?: string;
      model?: string;
      lora?: string;
      loraStrength: number;
      clipStrength: number;
      workflowName?: string;
      workflow: string;
      loraName: string | null;
      loraStrengthModel: number;
      loraStrengthClip: number;
    };
  };
  library: {
    dir: string;
    activeRepoId: string;
    repositories: Array<{ id: string; name: string; dir: string; kind: "managed" | "folder"; readOnly: boolean }>;
  };
  generation: {
    contentRating: "sfw" | "nsfw_allowed";
    fieldDetail?: {
      profile: FieldDetailProfile;
      overrides: Partial<Record<FieldKey, FieldOverrideMode>>;
    };
  };
};

export const getConfig = () => httpJson<AppConfig>("/api/config");
export const putConfig = (cfg: AppConfig) =>
  httpJson<AppConfig>("/api/config", { method: "PUT", body: JSON.stringify(cfg) });
