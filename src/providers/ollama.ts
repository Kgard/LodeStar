// Ollama local implementation

import type { LLMProvider } from "./index.js";
import type { ProviderName } from "../config.js";

const DEFAULT_MODEL = "llama3.2";
const CHARS_PER_TOKEN = 4;

interface OllamaChatResponse {
  message?: { content?: string };
}

export class OllamaProvider implements LLMProvider {
  readonly name: ProviderName = "ollama";
  readonly defaultModel = DEFAULT_MODEL;
  private model: string;
  private host: string;

  constructor(model?: string, host?: string) {
    this.model = model || DEFAULT_MODEL;
    this.host = host || "http://localhost:11434";
  }

  async synthesize(prompt: string, input: string): Promise<string> {
    const url = `${this.host}/api/chat`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: `${prompt}\n\n${input}` }],
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama API error: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as OllamaChatResponse;
    const content = data.message?.content;
    if (!content) {
      throw new Error("Ollama returned no content");
    }

    return content;
  }

  async countTokens(text: string): Promise<number> {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }
}
