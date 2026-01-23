import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { ensureOutputDir } from "../lib/imageStore.js";

export type StabilityGenerateOptions = {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  seed?: number;
  outputFormat?: "png" | "webp" | "jpeg";
  apiKey: string;
  baseUrl?: string;
};

type StabilityGenerateResult = { filename: string };

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function getFileExt(outputFormat?: string) {
  if (outputFormat === "jpeg") return "jpeg";
  if (outputFormat === "webp") return "webp";
  return "png";
}

export async function stabilityGenerate(opts: StabilityGenerateOptions): Promise<StabilityGenerateResult> {
  const baseUrl = normalizeBaseUrl(opts.baseUrl || "https://api.stability.ai");
  const url = `${baseUrl}/v2beta/stable-image/generate/core`;

  const form = new FormData();
  form.append("prompt", opts.prompt);
  if (opts.negativePrompt) form.append("negative_prompt", opts.negativePrompt);
  if (opts.aspectRatio) form.append("aspect_ratio", opts.aspectRatio);
  if (typeof opts.seed === "number") form.append("seed", String(opts.seed));
  if (opts.outputFormat) form.append("output_format", opts.outputFormat);

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.apiKey}`,
      Accept: "image/*",
    },
    body: form,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const detail = text ? ` - ${text}` : "";
    throw new Error(`Stability API error: HTTP ${resp.status} ${resp.statusText}${detail}`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const outputDir = await ensureOutputDir();
  const stamp = Date.now();
  const rand = crypto.randomBytes(6).toString("hex");
  const ext = getFileExt(opts.outputFormat);
  const filename = `${stamp}_${rand}.${ext}`;
  const fullPath = path.join(outputDir, filename);
  fs.writeFileSync(fullPath, buffer);

  return { filename };
}
