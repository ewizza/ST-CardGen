import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = (() => {
  const cwd = process.cwd();
  const base = path.basename(cwd).toLowerCase() === "server"
    ? cwd
    : path.resolve(cwd, "server");
  return path.join(base, "output");
})();

export function getOutputDirPath() {
  return OUTPUT_DIR;
}

export async function ensureOutputDir(): Promise<string> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  return OUTPUT_DIR;
}

export function isPngBuffer(buf: Buffer) {
  if (!buf || buf.length < 8) return false;
  return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}

function timestamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export async function savePngBuffer(
  buffer: Buffer,
  opts?: { prefix?: string },
): Promise<{ filename: string; urlPath: string; absPath: string }> {
  const dir = await ensureOutputDir();
  const prefix = opts?.prefix || "img";
  const rand = crypto.randomBytes(4).toString("hex");
  const filename = `${prefix}_${timestamp()}_${rand}.png`;
  const absPath = path.join(dir, filename);
  await fs.writeFile(absPath, buffer);
  return { filename, urlPath: `/output/${filename}`, absPath };
}
