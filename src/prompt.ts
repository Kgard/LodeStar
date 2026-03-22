// Synthesis prompt loader
// In dev: reads from filesystem
// When bundled: esbuild inlines the content

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

let cachedPrompt: string | null = null;

export async function loadPromptTemplate(): Promise<string> {
  if (cachedPrompt) return cachedPrompt;

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const promptPath = path.resolve(__dirname, "../prompts/synthesize.md");
  cachedPrompt = await fs.readFile(promptPath, "utf-8");
  return cachedPrompt;
}
