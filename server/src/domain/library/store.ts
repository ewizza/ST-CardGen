import fs from "node:fs";
import path from "node:path";
import sanitizeFilename from "sanitize-filename";

import { buildV2CardFromStorePayload, normalizeImportedCard } from "../cards/v2.js";
import { embedCardIntoPng, extractCardFromPng } from "../cards/png.js";
import { assertRepoWritable, ensureRepoDir, resolveRepo, type LibraryRepo } from "./repos.js";

export type LibraryItem = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  source: "managed" | "filesystem";
  fileBase: string;
  pngPath?: string;
  jsonPath?: string;
};

export type LibrarySaveFormat = "json" | "png";

export type LibraryTransferMode = "copy" | "move";

export type LibraryTransferFormat = "auto" | LibrarySaveFormat;

type LibraryIndexItem = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type LibraryIndex = {
  items: LibraryIndexItem[];
};

type LibraryList = {
  dir: string;
  repo: LibraryRepo;
  items: LibraryItem[];
};

type CachedScan = {
  dir: string;
  at: number;
  items: LibraryItem[];
};

const cacheByDir = new Map<string, CachedScan>();

function getRepo(repoId?: string) {
  const repo = resolveRepo(repoId);
  ensureRepoDir(repo);
  return repo;
}

function indexPath(dir: string) {
  return path.join(dir, "index.json");
}

function readIndex(dir: string): LibraryIndex {
  const p = indexPath(dir);
  if (!fs.existsSync(p)) return { items: [] };
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.items)) return { items: parsed.items };
  } catch {
    // fall through
  }
  return { items: [] };
}

function writeIndex(dir: string, index: LibraryIndex) {
  const p = indexPath(dir);
  fs.writeFileSync(p, JSON.stringify(index, null, 2), "utf-8");
}

function makeId(name: string) {
  const base = sanitizeFilename(name || "character").replace(/\s+/g, "_") || "character";
  return `${base}-${Date.now()}`;
}

function jsonPath(dir: string, fileBase: string) {
  return path.join(dir, `${fileBase}.json`);
}

function pngPath(dir: string, fileBase: string) {
  return path.join(dir, `${fileBase}.png`);
}

export function encodeId(value: string) {
  return Buffer.from(value, "utf-8").toString("base64url");
}

export function decodeId(id: string): string | null {
  try {
    const decoded = Buffer.from(id, "base64url").toString("utf-8");
    return decoded || null;
  } catch {
    return null;
  }
}

function safeBaseName(value: string) {
  const base = path.basename(value);
  if (base !== value) throw new Error("Invalid file identifier");
  return base;
}

function readNameFromJsonFile(filePath: string) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    const card = normalizeImportedCard(parsed);
    return String(card.data?.name ?? "").trim();
  } catch {
    return "";
  }
}

function readNameFromPngFile(filePath: string) {
  try {
    const raw = fs.readFileSync(filePath);
    const json = extractCardFromPng(raw);
    const parsed = JSON.parse(json);
    const card = normalizeImportedCard(parsed);
    return String(card.data?.name ?? "").trim();
  } catch {
    return "";
  }
}

function buildFilesystemItem(dir: string, fileBase: string, pngFile?: string, jsonFile?: string): LibraryItem {
  const pngStat = pngFile ? fs.statSync(pngFile) : null;
  const jsonStat = jsonFile ? fs.statSync(jsonFile) : null;
  const stat = pngStat ?? jsonStat;

  const nameFromJson = jsonFile ? readNameFromJsonFile(jsonFile) : "";
  const nameFromPng = !nameFromJson && pngFile ? readNameFromPngFile(pngFile) : "";
  const displayName = nameFromJson || nameFromPng || fileBase;

  return {
    id: encodeId(fileBase),
    name: displayName,
    createdAt: stat ? stat.ctime.toISOString() : new Date().toISOString(),
    updatedAt: stat ? stat.mtime.toISOString() : new Date().toISOString(),
    source: "filesystem",
    fileBase,
    pngPath: pngFile,
    jsonPath: jsonFile,
  };
}

function scanLibraryDir(dir: string): LibraryItem[] {
  const now = Date.now();
  const cached = cacheByDir.get(dir);
  if (cached && now - cached.at < 5000) return cached.items;

  const items: LibraryItem[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const byBase = new Map<string, { png?: string; json?: string }>();

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (ext !== ".png" && ext !== ".json") continue;
    if (entry.name.toLowerCase() === "index.json") continue;
    const base = path.basename(entry.name, ext);
    const record = byBase.get(base) || {};
    const fullPath = path.join(dir, entry.name);
    if (ext === ".png") record.png = fullPath;
    if (ext === ".json") record.json = fullPath;
    byBase.set(base, record);
  }

  for (const [base, record] of byBase.entries()) {
    items.push(buildFilesystemItem(dir, base, record.png, record.json));
  }

  cacheByDir.set(dir, { dir, at: now, items });
  return items;
}

function resolveFileBaseCandidates(dir: string, id: string, useIndex: boolean) {
  if (useIndex) {
    const index = readIndex(dir);
    if (index.items.find((item) => item.id === id)) {
      return [id];
    }
  }

  const decoded = decodeId(id);
  if (decoded) {
    const safe = safeBaseName(decoded);
    return [safe, id];
  }

  return [safeBaseName(id)];
}

function resolvePaths(dir: string, id: string, useIndex: boolean) {
  const candidates = resolveFileBaseCandidates(dir, id, useIndex);
  for (const base of candidates) {
    const jp = jsonPath(dir, base);
    const pp = pngPath(dir, base);
    const hasJson = fs.existsSync(jp);
    const hasPng = fs.existsSync(pp);
    if (hasJson || hasPng) return { fileBase: base, jsonPath: hasJson ? jp : undefined, pngPath: hasPng ? pp : undefined };
  }
  return { fileBase: candidates[0], jsonPath: undefined, pngPath: undefined };
}

function writeCardFiles(
  dir: string,
  fileBase: string,
  card: Record<string, any>,
  format: LibrarySaveFormat,
  avatarPng?: Buffer | null,
) {
  const jp = jsonPath(dir, fileBase);
  const pp = pngPath(dir, fileBase);
  if (format === "json") {
    fs.writeFileSync(jp, JSON.stringify(card, null, 2), "utf-8");
    if (fs.existsSync(pp)) fs.unlinkSync(pp);
    return;
  }

  if (!avatarPng) throw new Error("Avatar image required for PNG save");
  const embedded = embedCardIntoPng(avatarPng, JSON.stringify(card));
  fs.writeFileSync(pp, embedded);
  if (fs.existsSync(jp)) fs.unlinkSync(jp);
}

function outputIdForRepo(repo: LibraryRepo, fileBase: string) {
  return repo.kind === "folder" ? encodeId(fileBase) : fileBase;
}

export function listLibraryItems(repoId?: string): LibraryList {
  const repo = getRepo(repoId);
  const dir = repo.dir;
  const scanned = scanLibraryDir(dir);

  if (repo.kind !== "managed") {
    return { dir, repo, items: scanned };
  }

  const index = readIndex(dir);
  const scannedByBase = new Map(scanned.map((item) => [item.fileBase, item]));

  const items: LibraryItem[] = [];

  for (const managed of index.items) {
    const match = scannedByBase.get(managed.id);
    items.push({
      id: managed.id,
      name: managed.name,
      createdAt: managed.createdAt,
      updatedAt: managed.updatedAt,
      source: "managed",
      fileBase: managed.id,
      pngPath: match?.pngPath ?? (fs.existsSync(pngPath(dir, managed.id)) ? pngPath(dir, managed.id) : undefined),
      jsonPath: match?.jsonPath ?? (fs.existsSync(jsonPath(dir, managed.id)) ? jsonPath(dir, managed.id) : undefined),
    });
    if (match) scannedByBase.delete(managed.id);
  }

  items.push(...scannedByBase.values());
  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return { dir, repo, items };
}

export function loadLibraryCard(repoId: string | undefined, id: string) {
  const repo = getRepo(repoId);
  const dir = repo.dir;
  const resolved = resolvePaths(dir, id, repo.kind === "managed");

  let cardJson: string | null = null;
  if (resolved.jsonPath) {
    cardJson = fs.readFileSync(resolved.jsonPath, "utf-8");
  } else if (resolved.pngPath) {
    cardJson = extractCardFromPng(fs.readFileSync(resolved.pngPath));
  }

  if (!cardJson) throw new Error("Card not found");
  const parsed = JSON.parse(cardJson);
  const cardV2 = normalizeImportedCard(parsed);
  const hasPng = Boolean(resolved.pngPath);
  return { dir, repo, cardV2, hasPng };
}

export function loadLibraryPng(repoId: string | undefined, id: string) {
  const repo = getRepo(repoId);
  const dir = repo.dir;
  const resolved = resolvePaths(dir, id, repo.kind === "managed");
  if (!resolved.pngPath) throw new Error("Image not found");
  return fs.readFileSync(resolved.pngPath);
}

export function saveLibraryCard(
  repoId: string | undefined,
  payload: Record<string, any>,
  format: LibrarySaveFormat,
  avatarPng?: Buffer | null,
) {
  const repo = getRepo(repoId);
  assertRepoWritable(repo);

  const card = buildV2CardFromStorePayload(payload);
  const id = makeId(String(payload?.name ?? ""));
  const now = new Date().toISOString();

  writeCardFiles(repo.dir, id, card, format, avatarPng);

  if (repo.kind === "managed") {
    const index = readIndex(repo.dir);
    index.items.unshift({
      id,
      name: String(payload?.name ?? "Untitled"),
      createdAt: now,
      updatedAt: now,
    });
    writeIndex(repo.dir, index);
  }

  cacheByDir.delete(repo.dir);
  return { dir: repo.dir, id: outputIdForRepo(repo, id), repo };
}

export function updateLibraryCard(
  repoId: string | undefined,
  idOrEncoded: string,
  payload: Record<string, any>,
  format: LibrarySaveFormat,
  avatarPng?: Buffer | null,
) {
  const repo = getRepo(repoId);
  assertRepoWritable(repo);

  const resolved = resolvePaths(repo.dir, idOrEncoded, repo.kind === "managed");
  if (!resolved.jsonPath && !resolved.pngPath) throw new Error("Card not found");

  const card = buildV2CardFromStorePayload(payload);
  const fileBase = resolved.fileBase;
  const now = new Date().toISOString();

  writeCardFiles(repo.dir, fileBase, card, format, avatarPng);

  if (repo.kind === "managed") {
    const index = readIndex(repo.dir);
    const existing = index.items.find((item) => item.id === fileBase);
    if (existing) {
      existing.name = String(payload?.name ?? "Untitled");
      existing.updatedAt = now;
    } else {
      index.items.unshift({
        id: fileBase,
        name: String(payload?.name ?? "Untitled"),
        createdAt: now,
        updatedAt: now,
      });
    }
    writeIndex(repo.dir, index);
  }

  cacheByDir.delete(repo.dir);
  return { dir: repo.dir, id: outputIdForRepo(repo, fileBase), repo };
}

export function deleteLibraryItem(repoId: string | undefined, idOrEncoded: string) {
  const repo = getRepo(repoId);
  assertRepoWritable(repo);
  const resolvedDir = path.resolve(repo.dir);

  const resolved = resolvePaths(repo.dir, idOrEncoded, repo.kind === "managed");
  if (!resolved.jsonPath && !resolved.pngPath) throw new Error("Card not found");

  const validatePath = (filePath?: string) => {
    if (!filePath) return;
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(resolvedDir + path.sep) && resolvedPath !== resolvedDir) {
      throw new Error("Invalid file path");
    }
  };

  validatePath(resolved.pngPath);
  validatePath(resolved.jsonPath);

  if (resolved.pngPath && fs.existsSync(resolved.pngPath)) fs.unlinkSync(resolved.pngPath);
  if (resolved.jsonPath && fs.existsSync(resolved.jsonPath)) fs.unlinkSync(resolved.jsonPath);

  if (repo.kind === "managed") {
    const nextIndex = readIndex(repo.dir);
    const nextItems = nextIndex.items.filter((item) => item.id !== resolved.fileBase);
    if (nextItems.length !== nextIndex.items.length) {
      writeIndex(repo.dir, { items: nextItems });
    }
  }

  cacheByDir.delete(repo.dir);
}

export function transferLibraryItem(args: {
  fromRepoId?: string;
  toRepoId?: string;
  id: string;
  mode: LibraryTransferMode;
  destFormat?: LibraryTransferFormat;
}) {
  const fromRepo = getRepo(args.fromRepoId);
  const toRepo = getRepo(args.toRepoId);
  assertRepoWritable(toRepo);
  if (args.mode === "move") assertRepoWritable(fromRepo);

  const { cardV2, hasPng } = loadLibraryCard(fromRepo.id, args.id);
  const payload = cardV2.data ?? {};
  const requestedFormat = args.destFormat ?? "auto";
  const format: LibrarySaveFormat = requestedFormat === "auto" ? (hasPng ? "png" : "json") : requestedFormat;
  let avatarPng: Buffer | null = null;
  if (format === "png") {
    if (!hasPng) throw new Error("Source item has no PNG to copy");
    avatarPng = loadLibraryPng(fromRepo.id, args.id);
  }

  const saved = saveLibraryCard(toRepo.id, payload, format, avatarPng);

  if (args.mode === "move") {
    deleteLibraryItem(fromRepo.id, args.id);
  }

  return { ok: true, to: { repoId: saved.repo.id, id: saved.id, dir: saved.dir } };
}
