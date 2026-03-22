// Anthropic implementation

import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider } from "./index.js";
import type { ProviderName } from "../config.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";

export class AnthropicProvider implements LLMProvider {
  readonly name: ProviderName = "anthropic";
  readonly defaultModel = DEFAULT_MODEL;
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model || DEFAULT_MODEL;
  }

  async synthesize(prompt: string, input: string): Promise<string> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      messages: [{ role: "user", content: `${prompt}\n\n${input}` }],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Anthropic API returned no text content");
    }

    return textBlock.text;
  }

  async countTokens(text: string): Promise<number> {
    const result = await this.client.messages.countTokens({
      model: this.model,
      messages: [{ role: "user", content: text }],
    });
    return result.input_tokens;
  }
}
