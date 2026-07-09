import os from "node:os";
import path from "node:path";

const APP_NAME = "local-model-plugin-cc";

function xdgConfigHome() {
  if (process.env.XDG_CONFIG_HOME) return process.env.XDG_CONFIG_HOME;
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support");
  }
  return path.join(os.homedir(), ".config");
}

function xdgStateHome() {
  if (process.env.XDG_STATE_HOME) return process.env.XDG_STATE_HOME;
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support");
  }
  return path.join(os.homedir(), ".local", "state");
}

export function configDir() {
  return path.join(xdgConfigHome(), APP_NAME);
}

export function stateDir() {
  return path.join(xdgStateHome(), APP_NAME);
}

export function jobsDir() {
  return path.join(stateDir(), "jobs");
}

export function logsDir() {
  return path.join(stateDir(), "logs");
}

export function pluginConfigPath() {
  return path.join(configDir(), "config.json");
}
