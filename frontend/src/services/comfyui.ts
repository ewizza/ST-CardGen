import { httpJson } from "@/services/http";

export const comfyPing = () => httpJson<any>("/api/comfyui/ping");
export const comfyObjectInfo = () => httpJson<any>("/api/comfyui/object-info");
export const comfyModels = () => httpJson<{ ok: boolean; models: string[] }>("/api/comfyui/models");
export const comfyLoras  = () => httpJson<{ ok: boolean; loras: string[] }>("/api/comfyui/loras");

