import { httpJson } from "@/services/http";

export type LibraryRepo = { id: string; name: string; dir: string; kind: "managed" | "folder"; readOnly: boolean };

export type LibraryConfigResponse = {
  ok: boolean;
  dir: string;
  activeRepoId: string;
  repositories: LibraryRepo[];
  error?: string;
};

export function getLibraryConfig() {
  return httpJson<LibraryConfigResponse>("/api/library/config");
}

export function setLibraryConfig(dir: string) {
  return httpJson<LibraryConfigResponse>("/api/library/config", {
    method: "POST",
    body: JSON.stringify({ dir }),
  });
}

export function saveLibraryConfig(payload: { activeRepoId: string; repositories: LibraryRepo[] }) {
  return httpJson<LibraryConfigResponse>("/api/library/config", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type LibraryItem = {
  id: string;
  name: string;
  fileBase?: string;
  createdAt: string;
  updatedAt: string;
  pngUrl: string | null;
  hasJson?: boolean;
};

export type LibraryListResponse = {
  ok: boolean;
  dir: string;
  repo?: LibraryRepo;
  items: LibraryItem[];
  error?: string;
};

export function listLibrary(repoId?: string) {
  const query = repoId ? `?repo=${encodeURIComponent(repoId)}` : "";
  return httpJson<LibraryListResponse>(`/api/library${query}`);
}

export type LibraryLoadResponse = {
  ok: boolean;
  cardV2?: { spec: string; spec_version: string; data: any };
  avatarPngUrl?: string | null;
  error?: string;
};

export function loadLibraryItem(id: string, repoId?: string) {
  const query = repoId ? `?repo=${encodeURIComponent(repoId)}` : "";
  return httpJson<LibraryLoadResponse>(`/api/library/${encodeURIComponent(id)}${query}`);
}

export type LibrarySaveResponse = {
  ok: boolean;
  id?: string;
  dir?: string;
  error?: string;
};

export type LibrarySaveFormat = "json" | "png";

export function saveToLibrary(card: any, avatarUrl: string | null, format: LibrarySaveFormat, repoId?: string) {
  return httpJson<LibrarySaveResponse>("/api/library/save", {
    method: "POST",
    body: JSON.stringify({ card, avatarUrl, format, repoId }),
  });
}

export function updateLibraryItem(id: string, card: any, avatarUrl: string | null, format: LibrarySaveFormat, repoId?: string) {
  return httpJson<LibrarySaveResponse>(`/api/library/update/${encodeURIComponent(id)}`, {
    method: "POST",
    body: JSON.stringify({ card, avatarUrl, format, repoId }),
  });
}

export type LibraryDeleteResponse = {
  ok: boolean;
  error?: string;
};

export function deleteLibraryItem(id: string, repoId?: string) {
  const query = repoId ? `?repo=${encodeURIComponent(repoId)}` : "";
  return httpJson<LibraryDeleteResponse>(`/api/library/${encodeURIComponent(id)}${query}`, {
    method: "DELETE",
  });
}

export type LibraryTransferResponse = {
  ok: boolean;
  to?: { repoId: string; id: string; dir: string };
  error?: string;
};

export function transferLibraryItem(params: {
  fromRepoId?: string;
  toRepoId?: string;
  id: string;
  mode: "copy" | "move";
  destFormat?: "auto" | "png" | "json";
}) {
  return httpJson<LibraryTransferResponse>("/api/library/transfer", {
    method: "POST",
    body: JSON.stringify(params),
  });
}
