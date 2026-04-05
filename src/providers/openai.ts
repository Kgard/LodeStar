// OpenAI implementation

import OpenAI from "openai";
import type { LLMProvider } from "./index.js";
import type { ProviderName } from "../config.js";

const DEFAULT_MODEL = "gpt-4o";
const CHARS_PER_TOKEN = 4;

export class OpenAIProvider implements LLMProvider {
  readonly name: ProviderName = "openai";
  readonly defaultModel = DEFAULT_MODEL;
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model || DEFAULT_MODEL;
  }

  async synthesize(prompt: string, input: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 16384,
      messages: [{ role: "user", content: `${prompt}\n\n${input}` }],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI API returned no content");
    }

    return content;
  }

  async countTokens(text: string): Promise<number> {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }
}
