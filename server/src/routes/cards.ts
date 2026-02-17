import { Router } from "express";
import { z } from "zod";
import multer from "multer";

import { buildV2CardFromStorePayload, filenameFromCard, normalizeImportedCard } from "../domain/cards/v2.js";
import { embedCardIntoPng, extractCardFromPng } from "../domain/cards/png.js";
import { fail, wrap } from "../lib/api.js";

export const cardsRouter = Router();

const upload = multer({ storage: multer.memoryStorage() });

const CardSchema = z.record(z.any());
const ExportJsonSchema = z.object({ card: CardSchema });
const ExportPngSchema = z.object({
  card: CardSchema,
  avatarUrl: z.string().min(1),
});
const ExportAvatarSchema = z.object({
  avatarUrl: z.string().min(1),
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

// POST /api/cards/export/json
cardsRouter.post("/export/json", wrap((req, res) => {
  const body = ExportJsonSchema.parse(req.body);
  const card = buildV2CardFromStorePayload(body.card);
  const filename = `${filenameFromCard(card)}.json`;
  const payload = JSON.stringify(card, null, 2);

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(payload);
}));

// POST /api/cards/export/png
cardsRouter.post("/export/png", wrap(async (req, res) => {
  const body = ExportPngSchema.parse(req.body);
  const card = buildV2CardFromStorePayload(body.card);
  const filename = `${filenameFromCard(card)}.png`;
  const avatar = await fetchAvatarBuffer(req, body.avatarUrl);
  const cardJson = JSON.stringify(card);
  const output = embedCardIntoPng(avatar, cardJson);

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(output);
}));

// POST /api/cards/export/avatar
cardsRouter.post("/export/avatar", wrap(async (req, res) => {
  const body = ExportAvatarSchema.parse(req.body);
  const avatar = await fetchAvatarBuffer(req, body.avatarUrl);
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", `attachment; filename="avatar.png"`);
  return res.send(avatar);
}));

// POST /api/cards/import
cardsRouter.post("/import", upload.single("file"), wrap((req, res) => {
  const file = req.file;
  if (!file) return fail(res, 400, "VALIDATION_ERROR", "No file uploaded");

  const name = file.originalname.toLowerCase();
  if (name.endsWith(".json")) {
    const text = file.buffer.toString("utf-8");
    const parsed = JSON.parse(text);
    const cardV2 = normalizeImportedCard(parsed);
    return res.json({ ok: true, cardV2 });
  }

  if (name.endsWith(".png")) {
    const json = extractCardFromPng(file.buffer);
    const parsed = JSON.parse(json);
    const cardV2 = normalizeImportedCard(parsed);
    const avatarDataUrl = `data:image/png;base64,${file.buffer.toString("base64")}`;
    return res.json({ ok: true, cardV2, avatarDataUrl });
  }

  return fail(res, 400, "VALIDATION_ERROR", "Unsupported file type");
}));
