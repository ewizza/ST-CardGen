import { httpJson } from "@/services/http";

export const comfySubmitPrompt = (prompt: any) =>
  httpJson<{ ok: boolean; result?: any; error?: string }>("/api/comfyui/prompt", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });

export const comfyHistory = (promptId: string) =>
  httpJson<{ ok: boolean; history?: any; error?: string }>(`/api/comfyui/history/${promptId}`);

export function comfyViewUrl(filename: string, type = "output", subfolder = "") {
  const params = new URLSearchParams({ filename, type, subfolder });
  return `/api/comfyui/view?${params.toString()}`;
}
