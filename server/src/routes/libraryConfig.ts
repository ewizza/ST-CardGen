import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import { loadConfig, saveConfig } from "../config/store.js";

export const libraryConfigRouter = Router();

function isSafeAbsolute(p: string) {
  if (p.includes("\0")) return false;
  return path.isAbsolute(p);
}

libraryConfigRouter.get("/config", (req, res) => {
  const cfg = loadConfig();
  return res.json({
    ok: true,
    dir: cfg.library.dir,
    activeRepoId: cfg.library.activeRepoId,
    repositories: cfg.library.repositories,
  });
});

libraryConfigRouter.post("/config", (req, res) => {
  try {
    const cfg = loadConfig();
    if (typeof req.body?.dir === "string") {
      const body = z.object({ dir: z.string().min(1) }).parse(req.body);
      if (!isSafeAbsolute(body.dir)) {
        return res.status(200).json({ ok: false, error: "Path must be an absolute path" });
      }
      if (!fs.existsSync(body.dir)) fs.mkdirSync(body.dir, { recursive: true });

      cfg.library.dir = body.dir;
      const repos = cfg.library.repositories;
      const cardgen = repos.find((repo) => repo.id === "cardgen");
      if (cardgen) cardgen.dir = body.dir;
      saveConfig(cfg);

      return res.json({ ok: true, dir: body.dir, activeRepoId: cfg.library.activeRepoId, repositories: cfg.library.repositories });
    }

    const body = z.object({
      activeRepoId: z.string().min(1),
      repositories: z.array(z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        dir: z.string().min(1),
        kind: z.enum(["managed", "folder"]),
        readOnly: z.boolean(),
      })),
    }).parse(req.body);

    for (const repo of body.repositories) {
      if (!isSafeAbsolute(repo.dir)) {
        return res.status(200).json({ ok: false, error: "Path must be an absolute path" });
      }
      if (!fs.existsSync(repo.dir)) fs.mkdirSync(repo.dir, { recursive: true });
    }

    cfg.library.repositories = body.repositories;
    cfg.library.activeRepoId = body.activeRepoId;
    const cardgen = body.repositories.find((repo) => repo.id === "cardgen");
    if (cardgen) cfg.library.dir = cardgen.dir;
    saveConfig(cfg);

    return res.json({
      ok: true,
      dir: cfg.library.dir,
      activeRepoId: cfg.library.activeRepoId,
      repositories: cfg.library.repositories,
    });
  } catch (e: any) {
    return res.status(200).json({ ok: false, error: String(e?.message ?? e) });
  }
});
