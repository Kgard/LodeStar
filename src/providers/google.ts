// Google Gemini implementation

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMProvider } from "./index.js";
import type { ProviderName } from "../config.js";

const DEFAULT_MODEL = "gemini-2.5-pro";
const CHARS_PER_TOKEN = 4;

export class GoogleProvider implements LLMProvider {
  readonly name: ProviderName = "google";
  readonly defaultModel = DEFAULT_MODEL;
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model || DEFAULT_MODEL;
  }

  async synthesize(prompt: string, input: string): Promise<string> {
    const model = this.client.getGenerativeModel({ model: this.model });
    const result = await model.generateContent(`${prompt}\n\n${input}`);
    const content = result.response.text();
    if (!content) {
      throw new Error("Google Gemini API returned no content");
    }
    return content;
  }

  async countTokens(text: string): Promise<number> {
    try {
      const model = this.client.getGenerativeModel({ model: this.model });
      const result = await model.countTokens(text);
      return result.totalTokens;
    } catch {
      return Math.ceil(text.length / CHARS_PER_TOKEN);
    }
  }
}
