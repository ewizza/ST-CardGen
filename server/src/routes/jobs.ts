import express from "express";
import { getJob, updateJob } from "../domain/jobs/imageJobs.js";
import { httpGetJson, httpPostEmpty, httpPostJsonVoid, isHttpRequestError } from "../utils/http.js";
import { fail, ok, wrap } from "../lib/api.js";

export const jobsRouter = express.Router();

function extractPromptId(item: any): string | null {
  // Common ComfyUI queue shape: [number, prompt_id, prompt, extra, outputs]
  if (Array.isArray(item) && item.length >= 2 && typeof item[1] === "string") return item[1];
  if (item && typeof item === "object") {
    if (typeof item.prompt_id === "string") return item.prompt_id;
    if (typeof item.promptId === "string") return item.promptId;
    if (typeof item.id === "string") return item.id;
  }
  return null;
}

/**
 * GET /api/image/job/:jobId
 * Polls comfyui history to see if the job has produced an image.
 */
jobsRouter.get("/job/:jobId", wrap(async (req, res) => {
  const jobId = String(req.params.jobId || "");
  const job = getJob(jobId);
  if (!job) return fail(res, 404, "NOT_FOUND", "Job not found", { jobId });

  if (job.state === "error" || job.state === "done" || job.state === "canceled") {
    return ok(res, { job });
  }

  const { baseUrl, promptId } = job.data;

  try {
    // Best-effort: queue state/position (queued vs running)
    try {
      const q = await httpGetJson<any>(`${baseUrl}/queue`, { timeoutMs: 5000 });
      const running: any[] = Array.isArray(q?.queue_running) ? q.queue_running : [];
      const pending: any[] = Array.isArray(q?.queue_pending) ? q.queue_pending : [];

      const runningIdx = running.findIndex((it) => extractPromptId(it) === promptId);
      const pendingIdx = pending.findIndex((it) => extractPromptId(it) === promptId);

      if (runningIdx >= 0) {
        updateJob(jobId, { state: "running", progress: Math.max(job.progress ?? 0.2, 0.2), message: "Running" });
      } else if (pendingIdx >= 0) {
        updateJob(jobId, {
          state: "queued",
          progress: Math.min(job.progress ?? 0.1, 0.15),
          message: `Queued (position ${pendingIdx + 1})`,
        });
      }
    } catch {
      // ignore queue check failures
    }

    // Poll history
    const hist = await httpGetJson<any>(`${baseUrl}/history/${encodeURIComponent(promptId)}`, { timeoutMs: 8000 });

    const entry = hist?.[promptId];
    const outputs = entry?.outputs ?? {};
    let found: { filename: string; subfolder: string; type: string } | null = null;

    for (const nodeId of Object.keys(outputs)) {
      const images = outputs?.[nodeId]?.images;
      if (Array.isArray(images) && images.length > 0) {
        const img = images[0];
        if (img?.filename) {
          found = {
            filename: String(img.filename),
            subfolder: String(img.subfolder ?? ""),
            type: String(img.type ?? "output"),
          };
          break;
        }
      }
    }

    if (found) {
      // Build a server-local URL so the frontend doesn't hit Comfy directly.
      const params = new URLSearchParams({
        filename: found.filename,
        subfolder: found.subfolder,
        type: found.type,
        baseUrl,
      });

      updateJob(jobId, {
        state: "done",
        progress: 1,
        message: "Complete",
        result: { ...found, imageUrl: `/api/comfyui/view?${params.toString()}` },
      });

      const done = getJob(jobId)!;
      return ok(res, { job: done });
    }

    // Not done yet
    updateJob(jobId, { state: "running", progress: Math.min((job.progress ?? 0.1) + 0.05, 0.95), message: "Running" });
    const updated = getJob(jobId)!;
    return ok(res, { job: updated });
  } catch (e: any) {
    if (isHttpRequestError(e)) {
      updateJob(jobId, { state: "error", error: e.message, details: e.details, message: "Error polling history" });
      const updated = getJob(jobId)!;
      return ok(res, { job: updated });
    }
    updateJob(jobId, { state: "error", error: String(e?.message ?? e), message: "Error polling history" });
    const updated = getJob(jobId)!;
    return ok(res, { job: updated });
  }
}));

jobsRouter.post("/job/:jobId/cancel", wrap(async (req, res) => {
  const jobId = String(req.params.jobId || "");
  const job = getJob(jobId);
  if (!job) return fail(res, 404, "NOT_FOUND", "Job not found", { jobId });

  if (job.state === "done" || job.state === "error" || job.state === "canceled") {
    return ok(res, { job });
  }

  const { baseUrl, promptId } = job.data;

  try {
    // Best-effort: remove from pending queue by promptId
    await httpPostJsonVoid(`${baseUrl}/queue`, { delete: [promptId] }, { timeoutMs: 8000 });

    // If currently running, best-effort interrupt (may affect whichever job is executing)
    await httpPostEmpty(`${baseUrl}/interrupt`, { timeoutMs: 8000 }).catch(() => {});

    updateJob(jobId, { state: "canceled", progress: 0, message: "Canceled" });
    return ok(res, { job: getJob(jobId) });
  } catch (e: any) {
    if (isHttpRequestError(e)) {
      updateJob(jobId, { state: "error", error: e.message, details: e.details, message: "Cancel failed" });
      return ok(res, { job: getJob(jobId) });
    }
    updateJob(jobId, { state: "error", error: String(e?.message ?? e), message: "Cancel failed" });
    return ok(res, { job: getJob(jobId) });
  }
}));
