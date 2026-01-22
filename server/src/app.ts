import express from "express";
import cors from "cors";
import path from "path";
import fs from "node:fs";
import { fileURLToPath } from "url";

import { healthRouter } from "./routes/health.js";
import { configRouter } from "./routes/config.js";
import { comfyuiRouter } from "./routes/comfyui.js";
import { comfyuiPromptRouter } from "./routes/comfyuiPrompt.js";
import { imageRouter } from "./routes/image.js";
import { characterRouter } from "./routes/character.js";
import { cardsRouter } from "./routes/cards.js";
import { fsRouter } from "./routes/fs.js";
import { libraryConfigRouter } from "./routes/libraryConfig.js";
import { libraryRouter } from "./routes/library.js";
import { textRouter } from "./routes/text.js";
import { keysRouter } from "./routes/keys.js";
import { jobsRouter } from "./routes/jobs.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  if (process.env.NODE_ENV !== "production") {
    app.use(cors());
  }

  // Parse JSON BEFORE routers (important for PUT /api/config)
  app.use(express.json({ limit: "25mb" }));

  // --- API routes ---
  app.use("/api/health", healthRouter);
  app.use("/api/config", configRouter);
  app.use("/api/fs", fsRouter);
  app.use("/api/comfyui", comfyuiRouter);
  app.use("/api/comfyui", comfyuiPromptRouter);
  app.use("/api/character", characterRouter);
  app.use("/api/cards", cardsRouter);
  app.use("/api/library", libraryConfigRouter);
  app.use("/api/library", libraryRouter);
  app.use("/api/image", imageRouter);
  app.use("/api/image", jobsRouter);
  app.use("/api/text", textRouter);
  app.use("/api/keys", keysRouter);

  // If an /api route wasn't matched, return a JSON 404 (don't fall into SPA)
  app.use("/api", (req, res) => {
    res.status(404).json({ ok: false, error: "API route not found", path: req.originalUrl });
  });

  // Serve generated images
  const outputDir = path.resolve(process.cwd(), "output");
  app.use("/output", express.static(outputDir));

  // --- Static UI serving (production only / when built dist exists) ---
  const distDir = path.resolve(__dirname, "../../frontend/dist");
  const indexHtml = path.join(distDir, "index.html");

  if (fs.existsSync(indexHtml)) {
    app.use(express.static(distDir));

    // SPA fallback for non-API routes only
    app.get(/^\/(?!api).*/, (req, res) => {
      res.sendFile(indexHtml);
    });
  }

  return app;
}
