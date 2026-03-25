// LLMProvider interface + factory

import type { LodestarConfig, ProviderName } from "../config.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { OllamaProvider } from "./ollama.js";

export interface LLMProvider {
  synthesize(prompt: string, input: string): Promise<string>;
  countTokens(text: string): Promise<number>;
  readonly name: ProviderName;
  readonly defaultModel: string;
}

// Model routing: checkpoint (mid-session) vs full (end-of-session)
const CHECKPOINT_MODELS: Record<ProviderName, string> = {
  anthropic: "claude-haiku-4-5-20251001",
  openai: "gpt-4o-mini",
  ollama: "llama3.2",
};

const FULL_MODELS: Record<ProviderName, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  ollama: "llama3.2",
};

export function getProvider(config: LodestarConfig, mode: "checkpoint" | "full" = "full"): LLMProvider {
  const modelOverride = mode === "checkpoint"
    ? CHECKPOINT_MODELS[config.provider]
    : FULL_MODELS[config.provider];

  switch (config.provider) {
    case "anthropic":
      return new AnthropicProvider(config.apiKey!, modelOverride);
    case "openai":
      return new OpenAIProvider(config.apiKey!, modelOverride);
    case "ollama":
      return new OllamaProvider(
        modelOverride,
        config.ollamaHost ?? "http://localhost:11434"
      );
  }
}
