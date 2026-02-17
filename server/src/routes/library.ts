import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import {
  listLibraryItems,
  loadLibraryCard,
  loadLibraryPng,
  saveLibraryCard,
  updateLibraryCard,
  deleteLibraryItem,
  transferLibraryItem,
} from "../domain/library/store.js";
import { fail, ok, wrap } from "../lib/api.js";

export const libraryRouter = Router();

const SaveSchema = z.object({
  card: z.record(z.any()),
  avatarUrl: z.string().nullable().optional(),
  format: z.enum(["json", "png"]).optional(),
  repoId: z.string().optional(),
});

const TransferSchema = z.object({
  fromRepoId: z.string().optional(),
  toRepoId: z.string().optional(),
  id: z.string().min(1),
  mode: z.enum(["copy", "move"]),
  destFormat: z.enum(["auto", "png", "json"]).optional(),
});

function getAbsoluteUrl(req: any, pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = `${req.protocol}://${req.get("host")}`;
  return new URL(pathOrUrl, base).toString();
}

function parseDataUrl(dataUrl: string): Buffer | null {
  const match = dataUrl.match(/^data:image\/png;base64,(.+)$/i);
  if (!match) return null;
  return Buffer.from(match[1], "base64");
}

async function fetchAvatarBuffer(req: any, avatarUrl: string): Promise<Buffer> {
  const dataUrlBuffer = parseDataUrl(avatarUrl);
  if (dataUrlBuffer) return dataUrlBuffer;

  const url = getAbsoluteUrl(req, avatarUrl);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Avatar fetch failed: HTTP ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

function getRepoIdFromQuery(req: any) {
  return typeof req.query?.repo === "string" ? req.query.repo : undefined;
}

// GET /api/library
libraryRouter.get("/", wrap((req, res) => {
  const repoId = getRepoIdFromQuery(req);
  const { dir, items, repo } = listLibraryItems(repoId);
  const withUrls = items.map((item) => ({
    id: item.id,
    name: item.name,
    fileBase: item.fileBase,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    pngUrl: item.pngPath ? `/api/library/image/${item.id}?repo=${encodeURIComponent(repo.id)}` : null,
    hasJson: Boolean(item.jsonPath),
  }));
  return ok(res, { dir, repo, items: withUrls });
}));

// POST /api/library/save
libraryRouter.post("/save", wrap(async (req, res) => {
  try {
    const body = SaveSchema.parse(req.body);
    let avatarPng: Buffer | null = null;
    const format = body.format ?? (body.avatarUrl ? "png" : "json");
    if (format === "png") {
      if (!body.avatarUrl) return fail(res, 400, "VALIDATION_ERROR", "No avatar image to save as PNG.");
      avatarPng = await fetchAvatarBuffer(req, body.avatarUrl);
    }

    const { dir, id, repo } = saveLibraryCard(body.repoId, body.card, format, avatarPng);
    return ok(res, { id, dir, repo });
  } catch (e: any) {
    return fail(res, 500, "INTERNAL", String(e?.message ?? e));
  }
}));

// POST /api/library/update/:id
libraryRouter.post("/update/:id", wrap(async (req, res) => {
  try {
    const body = SaveSchema.parse(req.body);
    let avatarPng: Buffer | null = null;
    const format = body.format ?? (body.avatarUrl ? "png" : "json");
    if (format === "png") {
      if (!body.avatarUrl) return fail(res, 400, "VALIDATION_ERROR", "No avatar image to save as PNG.");
      avatarPng = await fetchAvatarBuffer(req, body.avatarUrl);
    }

    const { dir, id, repo } = updateLibraryCard(body.repoId, req.params.id, body.card, format, avatarPng);
    return ok(res, { id, dir, repo });
  } catch (e: any) {
    const message = String(e?.message ?? e);
    if (message === "Card not found") {
      return fail(res, 404, "NOT_FOUND", message);
    }
    return fail(res, 500, "INTERNAL", message);
  }
}));

// DELETE /api/library/:id
libraryRouter.delete("/:id", wrap((req, res) => {
  try {
    const repoId = getRepoIdFromQuery(req);
    deleteLibraryItem(repoId, req.params.id);
    return ok(res);
  } catch (e: any) {
    const message = String(e?.message ?? e);
    if (message === "Card not found") {
      return fail(res, 404, "NOT_FOUND", message);
    }
    if (message === "Invalid file path") {
      return fail(res, 400, "VALIDATION_ERROR", message);
    }
    return fail(res, 500, "INTERNAL", message);
  }
}));

// GET /api/library/:id
libraryRouter.get("/:id", wrap((req, res) => {
  try {
    const repoId = getRepoIdFromQuery(req);
    const { cardV2, hasPng, repo } = loadLibraryCard(repoId, req.params.id);
    return ok(res, {
      cardV2,
      avatarPngUrl: hasPng ? `/api/library/image/${req.params.id}?repo=${encodeURIComponent(repo.id)}` : null,
    });
  } catch (e: any) {
    const message = String(e?.message ?? e);
    if (message === "Card not found") {
      return fail(res, 404, "NOT_FOUND", message);
    }
    return fail(res, 500, "INTERNAL", message);
  }
}));

// GET /api/library/image/:id
libraryRouter.get("/image/:id", (req: any, res: any) => {
  try {
    const repoId = getRepoIdFromQuery(req);
    const png = loadLibraryPng(repoId, req.params.id);
    res.setHeader("Content-Type", "image/png");
    return res.send(png);
  } catch (e: any) {
    return fail(res, 404, "NOT_FOUND", String(e?.message ?? e));
  }
});

// POST /api/library/transfer
libraryRouter.post("/transfer", wrap((req, res) => {
  try {
    const body = TransferSchema.parse(req.body);
    const result = transferLibraryItem(body);
    return ok(res, result);
  } catch (e: any) {
    const message = String(e?.message ?? e);
    if (message === "Card not found" || message === "Image not found") {
      return fail(res, 404, "NOT_FOUND", message);
    }
    return fail(res, 400, "VALIDATION_ERROR", message);
  }
}));
