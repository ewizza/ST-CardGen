import { httpJson } from "@/services/http";

export type GenerateImageRequest = {
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  aspectRatio?: string;
  outputFormat?: "png" | "webp" | "jpeg";
};

export type GenerateImageResponse = {
  ok: boolean;
  error?: string;
  provider?: string;

  promptId?: string;
  seed?: number;
  jobId?: string;

  // server returns this when it finds an image
  imageUrl?: string;
  imageBase64?: string;

  // optional debug payloads you may return server-side
  image?: any;
};

export function generateImage(req: GenerateImageRequest) {
  return httpJson<GenerateImageResponse>("/api/image/generate", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export type ListSamplersResponse = {
  ok: boolean;
  provider?: string;
  baseUrl?: string;
  samplers?: string[];
  warning?: string;
  error?: string;
};

export type ListSchedulersResponse = {
  ok: boolean;
  provider?: string;
  baseUrl?: string;
  schedulers?: string[];
  warning?: string;
  error?: string;
};

export type ConnectImageProviderResponse = {
  ok: boolean;
  provider: string;
  baseUrl: string;
  checkedAt?: string;
  samplers?: string[];
  schedulers?: string[];
  details?: { workflows?: Array<{ name: string; title: string; hasLora: boolean }> };
  warning?: string;
  error?: string;
};

export type ListComfyWorkflowsResponse = {
  ok: boolean;
  workflows?: Array<{ name: string; title: string; hasLora: boolean }>;
  error?: string;
};

export function listSamplers() {
  return httpJson<ListSamplersResponse>("/api/image/samplers");
}

export function listSchedulers() {
  return httpJson<ListSchedulersResponse>("/api/image/schedulers");
}

export function connectImageProvider(provider: "comfyui" | "sdapi" | "koboldcpp" | "stability" | "huggingface" | "google") {
  return httpJson<ConnectImageProviderResponse>("/api/image/connect", {
    method: "POST",
    body: JSON.stringify({ provider }),
  });
}

export function listComfyWorkflows() {
  return httpJson<ListComfyWorkflowsResponse>("/api/image/comfyui/workflows");
}

export type ImageJobState = "queued" | "running" | "done" | "error" | "canceled";

export type ImageJob = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  state: ImageJobState;
  progress?: number; // 0..1
  message?: string;
  error?: string;
  details?: any;
  result?: {
    imageUrl?: string;
    filename?: string;
    subfolder?: string;
    type?: string;
  };
};

export type GetImageJobResponse = {
  ok: boolean;
  jobId?: string;
  error?: string;
  job?: ImageJob;
};

export function getImageJob(jobId: string) {
  return httpJson<GetImageJobResponse>(`/api/image/job/${encodeURIComponent(jobId)}`);
}

export type CancelImageJobResponse = {
  ok: boolean;
  error?: string;
  job?: ImageJob;
};

export function cancelImageJob(jobId: string) {
  return httpJson<CancelImageJobResponse>(`/api/image/job/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForImageJob(
  jobId: string,
  opts?: {
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    onUpdate?: (job: ImageJob) => void;
  },
): Promise<ImageJob> {
  const intervalMs = opts?.intervalMs ?? 900;
  const timeoutMs = opts?.timeoutMs ?? 10 * 60 * 1000; // 10 minutes
  const started = Date.now();

  while (true) {
    if (opts?.signal?.aborted) throw new Error("Canceled");

    const res = await getImageJob(jobId);
    if (!res.ok || !res.job) throw new Error(res.error ?? "Job poll failed.");

    opts?.onUpdate?.(res.job);

    if (res.job.state === "done") return res.job;
    if (res.job.state === "error") throw new Error(res.job.error ?? "Job failed.");
    if (res.job.state === "canceled") throw new Error("Canceled");

    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for image job.");

    await sleep(intervalMs);
  }
}
