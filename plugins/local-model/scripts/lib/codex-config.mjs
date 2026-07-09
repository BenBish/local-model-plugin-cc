// Builds the `codex` CLI args that select a provider/model, without ever
// writing a config file. Always uses `-c model_providers.<id>.base_url=...
// -c model_providers.<id>.wire_api=responses -c model_provider=<id>` —
// verified working end-to-end against a real local Ollama server, for
// `codex exec` (see codex-run.mjs for why `codex exec review` is never
// used).
//
// NOTE: `codex exec` alone also has `--oss --local-provider ollama|lmstudio`
// as a zero-config shortcut, and it works there — but `codex exec review`
// does not accept those flags at all (confirmed: "unexpected argument
// '--oss'"). Using explicit `-c` overrides uniformly for both "oss" mode
// (Ollama/LM Studio, detected by /local:setup) and "custom" mode (arbitrary
// endpoint) avoids that inconsistency entirely, at the cost of hardcoding
// Ollama/LM Studio's well-known default base URLs here.
//
// The custom provider id is always prefixed with `localmodel-`: codex
// rejects `model_providers.<id>.*` overrides when `<id>` collides with a
// *reserved built-in* provider name (confirmed: "ollama" itself is
// reserved — "model_providers contains reserved built-in provider IDs:
// `ollama`. Built-in providers cannot be overridden."). This affects "oss"
// mode directly (localProvider is literally "ollama"/"lmstudio") and could
// affect "custom" mode too if a user's own --provider-id happens to match
// some other reserved name, so the prefix is applied unconditionally
// rather than only where it's currently known to be needed.
//
// `wire_api = "chat"` is deprecated/rejected by current codex versions —
// must be "responses", which local servers' OpenAI-compatible endpoints
// handled fine in testing despite most of them only implementing the older
// Chat Completions shape.
//
// `--ignore-user-config` is always included so this never reads or is
// affected by the user's personal ~/.codex/config.toml.

const KNOWN_LOCAL_PROVIDER_BASE_URLS = {
  ollama: "http://localhost:11434/v1",
  lmstudio: "http://127.0.0.1:1234/v1",
};

/**
 * @param {{mode: "oss"|"custom", localProvider?: string, providerId?: string, providerName?: string, baseURL?: string|null, apiKeyEnvVar?: string|null, defaultModel: string}} pluginConfig
 * @returns {string[]}
 */
export function buildProviderArgs(pluginConfig) {
  const isOss = pluginConfig.mode === "oss";
  const rawId = /** @type {string} */ (isOss ? pluginConfig.localProvider : pluginConfig.providerId);
  const id = `localmodel-${rawId}`;
  const baseURL = isOss
    ? KNOWN_LOCAL_PROVIDER_BASE_URLS[/** @type {"ollama"|"lmstudio"} */ (pluginConfig.localProvider)]
    : pluginConfig.baseURL;
  const name = isOss ? pluginConfig.localProvider : (pluginConfig.providerName ?? rawId);

  const args = ["--ignore-user-config"];
  args.push("-c", `model_providers.${id}.name=${name}`);
  args.push("-c", `model_providers.${id}.base_url=${baseURL}`);
  args.push("-c", `model_providers.${id}.wire_api=responses`);
  if (!isOss && pluginConfig.apiKeyEnvVar) {
    args.push("-c", `model_providers.${id}.env_key=${pluginConfig.apiKeyEnvVar}`);
  }
  args.push("-c", `model_provider=${id}`);
  args.push("-m", pluginConfig.defaultModel);
  return args;
}
