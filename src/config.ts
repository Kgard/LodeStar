// reads/writes ~/.lodestar.config.json

import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

const CONFIG_FILENAME = ".lodestar.config.json";
const CONFIG_PATH = path.join(os.homedir(), CONFIG_FILENAME);

export type ProviderName = "anthropic" | "openai" | "ollama";

export interface LodestarConfig {
  provider: ProviderName;
  model: string;
  apiKey?: string;
  ollamaHost?: string;
}

export interface ConfigResult {
  config: LodestarConfig | null;
  error?: string;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export async function readConfig(): Promise<ConfigResult> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as LodestarConfig;

    if (!parsed.provider || !parsed.model) {
      return {
        config: null,
        error: `Invalid config at ${CONFIG_PATH}: missing provider or model. Run "lodestar init" to reconfigure.`,
      };
    }

    if (parsed.provider !== "ollama" && !parsed.apiKey) {
      return {
        config: null,
        error: `No API key found in ${CONFIG_PATH} for provider "${parsed.provider}". Run "lodestar init" to reconfigure.`,
      };
    }

    return { config: parsed };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        config: null,
        error: `No config found. Run "lodestar init" to set up your provider and API key.`,
      };
    }
    const message = e instanceof Error ? e.message : String(e);
    return { config: null, error: `Failed to read config: ${message}` };
  }
}

export async function writeConfig(config: LodestarConfig): Promise<void> {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
