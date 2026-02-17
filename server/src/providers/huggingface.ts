import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { InferenceClient } from "@huggingface/inference";
import { ensureOutputDir } from "../lib/imageStore.js";

export type HuggingFaceTextToImageArgs = {
  accessToken: string;
  prompt: string;
  negativePrompt?: string;
  model: string;
  provider?: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
};

export type HuggingFaceTextToImageResult = { fileName: string };

function bufferFromDataUrl(dataUrl: string): Buffer | null {
  if (!dataUrl.startsWith("data:")) return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;
  return Buffer.from(match[2], "base64");
}

async function toBuffer(payload: any): Promise<Buffer> {
  if (!payload) throw new Error("Empty image payload from Hugging Face.");
  if (Buffer.isBuffer(payload)) return payload;
  if (payload instanceof ArrayBuffer) return Buffer.from(payload);
  if (ArrayBuffer.isView(payload)) {
    return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
  }
  if (typeof payload === "string") {
    const b = bufferFromDataUrl(payload);
    if (b) return b;
  }
  if (typeof payload.arrayBuffer === "function") {
    const ab = await payload.arrayBuffer();
    return Buffer.from(ab);
  }
  if (payload?.data && ArrayBuffer.isView(payload.data)) {
    return Buffer.from(payload.data.buffer, payload.data.byteOffset, payload.data.byteLength);
  }
  throw new Error("Unsupported image payload type from Hugging Face.");
}

export async function huggingfaceTextToImage(args: HuggingFaceTextToImageArgs): Promise<HuggingFaceTextToImageResult> {
  try {
    const client = new InferenceClient(args.accessToken);
    const output = await client.textToImage({
      provider: (args.provider ?? "hf-inference") as any,
      model: args.model,
      inputs: args.prompt,
      parameters: {
        width: args.width,
        height: args.height,
        num_inference_steps: args.steps,
        guidance_scale: args.cfgScale,
        negative_prompt: args.negativePrompt ?? undefined,
      },
    });

    const buffer = await toBuffer(output);
    const dir = await ensureOutputDir();
    const stamp = Date.now();
    const rand = crypto.randomBytes(6).toString("hex");
    const fileName = `hf_${stamp}_${rand}.png`;
    fs.writeFileSync(path.join(dir, fileName), buffer);
    return { fileName };
  } catch (e: any) {
    const provider = args.provider ?? "hf-inference";
    const model = args.model || "unknown";
    const message = String(e?.message ?? e);
    throw new Error(`Hugging Face error (provider=${provider}, model=${model}): ${message}`);
  }
}
