import path from "node:path";
import { pluginConfigPath } from "./paths.mjs";
import { ensureDir, atomicWriteJson, readJsonSafe } from "./fs-utils.mjs";

/**
 * Plugin config shape (written by /local:setup):
 * {
 *   mode: "oss" | "custom",
 *   localProvider: "ollama" | "lmstudio" | null,   // set iff mode === "oss"
 *   providerId, providerName,
 *   baseURL: string | null,                        // set iff mode === "custom"
 *   apiKeyEnvVar: string | null,
 *   models: [{ id, name }], defaultModel, configuredAt
 * }
 * apiKeyEnvVar is a name, never a literal secret — see codex-config.mjs.
 */
export function readPluginConfig() {
  return readJsonSafe(pluginConfigPath(), null);
}

export function writePluginConfig(config) {
  ensureDir(path.dirname(pluginConfigPath()));
  atomicWriteJson(pluginConfigPath(), config);
  return pluginConfigPath();
}
