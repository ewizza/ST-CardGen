import { httpJson } from "@/services/http";

export type KeyListResponse = {
  ok: boolean;
  keys?: Array<{ name: string }>;
  error?: string;
};

export type KeySaveResponse = {
  ok: boolean;
  name?: string;
  storedIn?: "keytar" | "config";
  warning?: string;
  error?: string;
};

export type KeyDeleteResponse = {
  ok: boolean;
  error?: string;
};

export type KeyValidateResponse = {
  ok: boolean;
  error?: string;
};

export function listKeys() {
  return httpJson<KeyListResponse>("/api/keys");
}

export function saveKey(name: string, apiKey: string, storeSecurely: boolean) {
  return httpJson<KeySaveResponse>("/api/keys", {
    method: "POST",
    body: JSON.stringify({ name, apiKey, storeSecurely }),
  });
}

export function deleteKey(name: string) {
  return httpJson<KeyDeleteResponse>(`/api/keys/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

export function validateKey(provider: string, keyName: string) {
  return httpJson<KeyValidateResponse>("/api/keys/validate", {
    method: "POST",
    body: JSON.stringify({ provider, keyName }),
  });
}
