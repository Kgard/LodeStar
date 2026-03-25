// lodestar_load() implementation

import path from "node:path";
import fs from "node:fs/promises";
import { parseMarkdown, type LodestarContext } from "./schema.js";

const LODESTAR_FILENAME = ".lodestar.md";

export interface LoadResult {
  success: boolean;
  context: LodestarContext | null;
  summary: string;
  path: string;
  warnings?: string[];
}

export async function load(projectRoot: string): Promise<LoadResult> {
  const resolved = path.resolve(projectRoot);
  const filePath = path.join(resolved, LODESTAR_FILENAME);

  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch {
    return {
      success: true,
      context: null,
      summary:
        "No .lodestar.md found. Run 'lodestar save' to create context for this project, or 'lodestar bootstrap' to capture your existing project structure.",
      path: filePath,
    };
  }

  const warnings: string[] = [];

  let context: LodestarContext;
  try {
    context = parseMarkdown(raw);
  } catch {
    return {
      success: true,
      context: null,
      summary:
        "Found .lodestar.md but failed to parse it. Raw content returned in warnings.",
      path: filePath,
      warnings: [`Parse failure. Raw content:\n${raw}`],
    };
  }

  // Check age
  if (context.meta.date) {
    const contextDate = new Date(context.meta.date);
    const now = new Date();
    const daysDiff = Math.floor(
      (now.getTime() - contextDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysDiff > 7) {
      warnings.push(`Context file is ${daysDiff} days old`);
    }
  }

  const decisionCount = context.decisions.length;
  const questionCount = context.openQuestions.length;

  // Detect bootstrapped or empty context
  const isBootstrapped = context.meta.model === "bootstrap (no LLM)";
  const isEmpty = decisionCount === 0 && context.patterns.length === 0 && context.features.length === 0;
  const hasUnknowns = context.dependencies.some((d) => d.purpose.includes("[UNKNOWN]"));

  if (isBootstrapped || isEmpty || hasUnknowns) {
    warnings.push(
      "This context was bootstrapped from your project structure — decisions and rationale are not yet captured. Run 'lodestar save' or 'lodestar end' after your next coding session to populate them."
    );
  }

  const summary = `Loaded context from ${context.meta.date}. ${decisionCount} decision${decisionCount !== 1 ? "s" : ""}, ${questionCount} open question${questionCount !== 1 ? "s" : ""}.`;

  return {
    success: true,
    context,
    summary,
    path: filePath,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
