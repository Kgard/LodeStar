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

export function getProvider(config: LodestarConfig): LLMProvider {
  switch (config.provider) {
    case "anthropic":
      return new AnthropicProvider(config.apiKey!, config.model);
    case "openai":
      return new OpenAIProvider(config.apiKey!, config.model);
    case "ollama":
      return new OllamaProvider(
        config.model,
        config.ollamaHost ?? "http://localhost:11434"
      );
  }
}
