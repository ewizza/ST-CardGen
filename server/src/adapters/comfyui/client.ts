import { loadConfig } from "../../config/store.js";
import { httpGetJson } from "../../utils/http.js";

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

export function getComfyBaseUrl() {
  const cfg = loadConfig();
  return normalizeBaseUrl(cfg.image.baseUrls?.comfyui || "http://127.0.0.1:8188");
}

export async function getSystemStats(baseUrl: string) {
  return httpGetJson(`${baseUrl}/system_stats`, { timeoutMs: 8000 });
}

export async function getObjectInfo(baseUrl: string) {
  return httpGetJson(`${baseUrl}/object_info`, { timeoutMs: 8000 });
}
