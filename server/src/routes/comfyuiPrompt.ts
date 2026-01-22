import { Router } from "express";
import { z } from "zod";
import { getComfyBaseUrl } from "../adapters/comfyui/client.js";
import { httpGetJson, httpPostJson, httpGetBuffer, isHttpRequestError } from "../utils/http.js";

export const comfyuiPromptRouter = Router();

const PromptRequestSchema = z.object({
  // This is the exact ComfyUI workflow/prompt object you would send to /prompt
  prompt: z.record(z.any()),
  client_id: z.string().optional(),
});

// POST /api/comfyui/prompt
comfyuiPromptRouter.post("/prompt", async (req, res) => {
  const baseUrl = getComfyBaseUrl();
  try {
    const parsed = PromptRequestSchema.parse(req.body);
    const result = await httpPostJson(`${baseUrl}/prompt`, parsed, { timeoutMs: 15000 });
    // result usually contains { prompt_id: "..." }
    res.json({ ok: true, baseUrl, result });
  } catch (e: any) {
    if (isHttpRequestError(e)) {
      return res.status(200).json({ ok: false, error: e.message, details: e.details });
    }
    res.status(200).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// GET /api/comfyui/history/:promptId
comfyuiPromptRouter.get("/history/:promptId", async (req, res) => {
  const baseUrl = getComfyBaseUrl();
  try {
    const promptId = req.params.promptId;
    const hist = await httpGetJson(`${baseUrl}/history/${encodeURIComponent(promptId)}`, { timeoutMs: 8000 });
    res.json({ ok: true, baseUrl, history: hist });
  } catch (e: any) {
    if (isHttpRequestError(e)) {
      return res.status(200).json({ ok: false, error: e.message, details: e.details });
    }
    res.status(200).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// GET /api/comfyui/view?filename=...&type=output&subfolder=...
comfyuiPromptRouter.get("/view", async (req, res) => {
  const baseUrl = getComfyBaseUrl();

  const filename = String(req.query.filename ?? "");
  const type = String(req.query.type ?? "output");
  const subfolder = String(req.query.subfolder ?? "");

  if (!filename) {
    return res.status(400).json({ ok: false, error: "Missing filename" });
  }

  const params = new URLSearchParams();
  params.set("filename", filename);
  if (type) params.set("type", type);
  if (subfolder) params.set("subfolder", subfolder);

  try {
    const { buffer, contentType } = await httpGetBuffer(`${baseUrl}/view?${params.toString()}`, { timeoutMs: 15000 });
    res.setHeader("Content-Type", contentType);
    return res.send(buffer);
  } catch (e: any) {
    if (isHttpRequestError(e)) {
      return res.status(200).json({ ok: false, error: e.message, details: e.details });
    }
    res.status(200).json({ ok: false, error: String(e?.message ?? e) });
  }
});
