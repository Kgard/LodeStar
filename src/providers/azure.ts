// Azure OpenAI implementation
// Uses the openai SDK with Azure-specific configuration

import { AzureOpenAI } from "openai";
import type { LLMProvider } from "./index.js";
import type { ProviderName } from "../config.js";

const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_API_VERSION = "2024-12-01-preview";
const CHARS_PER_TOKEN = 4;

export class AzureProvider implements LLMProvider {
  readonly name: ProviderName = "azure";
  readonly defaultModel = DEFAULT_MODEL;
  private client: AzureOpenAI;
  private model: string;

  constructor(apiKey: string, endpoint: string, model?: string, apiVersion?: string) {
    this.client = new AzureOpenAI({
      apiKey,
      endpoint,
      apiVersion: apiVersion ?? DEFAULT_API_VERSION,
    });
    this.model = model || DEFAULT_MODEL;
  }

  async synthesize(prompt: string, input: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 8192,
      messages: [{ role: "user", content: `${prompt}\n\n${input}` }],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Azure OpenAI API returned no content");
    }

    return content;
  }

  async countTokens(text: string): Promise<number> {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }
}
