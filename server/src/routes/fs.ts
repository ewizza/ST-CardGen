import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { fail, ok, wrap } from "../lib/api.js";

export const fsRouter = Router();

function isSafeAbsolute(p: string) {
  if (p.includes("\0")) return false;
  return path.isAbsolute(p);
}

function getWindowsRoots() {
  const roots: string[] = [];
  for (let i = 65; i <= 90; i += 1) {
    const letter = String.fromCharCode(i);
    const root = `${letter}:\\`;
    if (fs.existsSync(root)) roots.push(root);
  }
  return roots;
}

// GET /api/fs/roots
fsRouter.get("/roots", wrap((req, res) => {
  const roots = process.platform === "win32" ? getWindowsRoots() : ["/"];
  return ok(res, { roots });
}));

// GET /api/fs/list?path=<absPath>
fsRouter.get("/list", wrap(async (req, res) => {
  try {
    const target = String(req.query.path || "");
    if (!target || !isSafeAbsolute(target)) {
      return fail(res, 400, "VALIDATION_ERROR", "Path must be an absolute path");
    }

    const entries = await fs.promises.readdir(target, { withFileTypes: true });
    const dirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        path: path.join(target, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const parent = (() => {
      if (process.platform !== "win32") return path.dirname(target);
      const normalized = path.normalize(target);
      if (/^[A-Za-z]:\\?$/.test(normalized)) return null;
      return path.dirname(normalized);
    })();

    return ok(res, { path: target, parent, dirs });
  } catch (e: any) {
    return fail(res, 500, "INTERNAL", String(e?.message ?? e));
  }
}));
