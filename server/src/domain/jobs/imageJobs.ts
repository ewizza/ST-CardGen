import crypto from "crypto";

export type ImageJobState = "queued" | "running" | "done" | "error" | "canceled";

export type ComfyJobData = {
  provider: "comfyui";
  baseUrl: string;
  promptId: string;
};

export type ImageJob = {
  id: string;
  createdAt: string;
  updatedAt: string;
  state: ImageJobState;
  progress?: number; // 0..1 (best-effort)
  message?: string;
  error?: string;
  details?: any;
  data: ComfyJobData;
  result?: {
    // populated when done
    imageUrl?: string; // server route URL to fetch
    filename?: string;
    subfolder?: string;
    type?: string;
  };
};

const jobs = new Map<string, ImageJob>();

function nowIso() {
  return new Date().toISOString();
}

export function createComfyJob(baseUrl: string, promptId: string): ImageJob {
  const id = crypto.randomBytes(16).toString("hex");
  const ts = nowIso();
  const job: ImageJob = {
    id,
    createdAt: ts,
    updatedAt: ts,
    state: "queued",
    progress: 0,
    message: "Queued",
    data: { provider: "comfyui", baseUrl, promptId },
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string) {
  return jobs.get(id) ?? null;
}

export function updateJob(id: string, patch: Partial<ImageJob>) {
  const job = jobs.get(id);
  if (!job) return null;
  const updated: ImageJob = { ...job, ...patch, updatedAt: nowIso() };
  jobs.set(id, updated);
  return updated;
}

export function deleteJob(id: string) {
  return jobs.delete(id);
}

// Optional: basic TTL cleanup
export function cleanupOldJobs(maxAgeMs = 1000 * 60 * 60) {
  const cutoff = Date.now() - maxAgeMs;
  for (const [id, job] of jobs.entries()) {
    const t = Date.parse(job.updatedAt || job.createdAt);
    if (!Number.isNaN(t) && t < cutoff) jobs.delete(id);
  }
}
