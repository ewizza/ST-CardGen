import fs from "node:fs";
import path from "node:path";

import { loadConfig } from "../../config/store.js";
import { defaultConfig } from "../../config/schema.js";

export type LibraryRepo = {
  id: string;
  name: string;
  dir: string;
  kind: "managed" | "folder";
  readOnly: boolean;
};

function isSafeAbsolute(p: string) {
  if (p.includes("\0")) return false;
  return path.isAbsolute(p);
}

export function getLibraryRepos(): { activeRepoId: string; repositories: LibraryRepo[] } {
  const cfg = loadConfig();
  const repositories = Array.isArray(cfg.library?.repositories)
    ? (cfg.library.repositories as LibraryRepo[])
    : [];
  const activeRepoId = cfg.library?.activeRepoId || "cardgen";
  return { activeRepoId, repositories };
}

export function resolveRepo(repoId?: string): LibraryRepo {
  const { activeRepoId, repositories } = getLibraryRepos();
  const fallback = defaultConfig().library.repositories[0];
  const byId = (id?: string) => repositories.find((repo) => repo.id === id);
  return byId(repoId) || byId(activeRepoId) || repositories[0] || fallback;
}

export function ensureRepoDir(repo: LibraryRepo) {
  if (!isSafeAbsolute(repo.dir)) {
    throw new Error("Library repo path must be an absolute path");
  }
  if (!fs.existsSync(repo.dir)) fs.mkdirSync(repo.dir, { recursive: true });
}

export function assertRepoWritable(repo: LibraryRepo) {
  if (repo.readOnly) throw new Error("Repository is read-only");
}
