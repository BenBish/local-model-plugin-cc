import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Write JSON atomically: write to a sibling temp file then rename, so a
 * crash or concurrent read never observes a partially-written job/config
 * file.
 */
export function atomicWriteJson(destPath, value) {
  ensureDir(path.dirname(destPath));
  const tmpPath = path.join(
    path.dirname(destPath),
    `.${path.basename(destPath)}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`,
  );
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, destPath);
}

export function readJsonSafe(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}
