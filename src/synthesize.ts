// lodestar_synthesize() implementation

import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { captureGitSnapshot, isGitError } from "./git.js";
import { readConfig } from "./config.js";
import { getProvider } from "./providers/index.js";
import { rotateHistory } from "./history.js";
import { contextToMarkdown, parseMarkdown, type LodestarContext } from "./schema.js";

const LODESTAR_FILENAME = ".lodestar.md";
const TOKEN_BUDGET = 6000;

export interface SynthesizeInput {
  projectRoot: string;
  sessionNotes?: string;
}

export interface SynthesizeResult {
  success: boolean;
  path: string;
  summary: string;
  warnings?: string[];
}

async function loadPromptTemplate(): Promise<string> {
  const promptPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "../prompts/synthesize.md"
  );
  return fs.readFile(promptPath, "utf-8");
}

function buildInput(parts: {
  gitDiff: string;
  committedDiff: string;
  commitLog: string;
  gitStatus: string;
  packageChanges: string | null;
  sessionNotes: string | null;
  projectName: string;
  existingContext: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`**Project:** ${parts.projectName}`);
  lines.push("");
  lines.push("**Uncommitted changes (git diff HEAD):**");
  lines.push("```");
  lines.push(parts.gitDiff);
  lines.push("```");
  lines.push("");
  lines.push("**Committed changes since last synthesis:**");
  lines.push("```");
  lines.push(parts.committedDiff);
  lines.push("```");
  lines.push("");
  lines.push("**Commit log since last synthesis:**");
  lines.push("```");
  lines.push(parts.commitLog);
  lines.push("```");
  lines.push("");
  lines.push("**Git status:**");
  lines.push("```");
  lines.push(parts.gitStatus);
  lines.push("```");
  lines.push("");
  lines.push("**Package changes:**");
  lines.push("```");
  lines.push(parts.packageChanges ?? "No changes");
  lines.push("```");
  lines.push("");
  lines.push("**Developer session notes:**");
  lines.push(parts.sessionNotes ?? "None provided");
  lines.push("");
  lines.push("**Existing context from previous session:**");
  lines.push(parts.existingContext ?? "No existing context");
  return lines.join("\n");
}

async function truncateDiff(
  provider: ReturnType<typeof getProvider>,
  diff: string,
  budget: number
): Promise<{ text: string; wasTruncated: boolean }> {
  const tokens = await provider.countTokens(diff);
  if (tokens <= budget) {
    return { text: diff, wasTruncated: false };
  }

  const lines = diff.split("\n");
  let lo = 0;
  let hi = lines.length;
  let best = 0;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = lines.slice(0, mid).join("\n");
    const t = await provider.countTokens(candidate);
    if (t <= budget) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const truncated = lines.slice(0, best).join("\n");
  return { text: truncated + "\n\n(truncated — exceeded token budget)", wasTruncated: true };
}

async function truncateToTokenBudget(
  provider: ReturnType<typeof getProvider>,
  gitDiff: string,
  committedDiff: string,
  commitLog: string,
  gitStatus: string,
  packageChanges: string | null,
  sessionNotes: string | null,
  existingContext: string | null
): Promise<{ truncatedDiff: string; truncatedCommittedDiff: string; wasTruncated: boolean }> {
  const overhead = [commitLog, gitStatus, packageChanges ?? "", sessionNotes ?? "", existingContext ?? ""].join("\n");
  const overheadTokens = await provider.countTokens(overhead);
  const totalBudget = TOKEN_BUDGET - overheadTokens;

  if (totalBudget <= 0) {
    return {
      truncatedDiff: "(diff omitted — other inputs exceed token budget)",
      truncatedCommittedDiff: "(diff omitted)",
      wasTruncated: true,
    };
  }

  // Split budget: 60% to committed diff (session history), 40% to uncommitted
  const committedBudget = Math.floor(totalBudget * 0.6);
  const uncommittedBudget = totalBudget - committedBudget;

  const committed = await truncateDiff(provider, committedDiff, committedBudget);
  const uncommitted = await truncateDiff(provider, gitDiff, uncommittedBudget);

  return {
    truncatedDiff: uncommitted.text,
    truncatedCommittedDiff: committed.text,
    wasTruncated: committed.wasTruncated || uncommitted.wasTruncated,
  };
}

function parseResponse(raw: string): LodestarContext {
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) {
    throw new Error("Response did not contain a JSON block");
  }
  return JSON.parse(jsonMatch[1]) as LodestarContext;
}

async function atomicWrite(
  filePath: string,
  content: string
): Promise<void> {
  const tmpPath = path.join(
    os.tmpdir(),
    `lodestar-${Date.now()}-${Math.random().toString(36).slice(2)}.md`
  );
  await fs.writeFile(tmpPath, content, "utf-8");
  await fs.rename(tmpPath, filePath);
}

export async function synthesizeContext(
  input: SynthesizeInput
): Promise<SynthesizeResult> {
  const resolved = path.resolve(input.projectRoot);
  const filePath = path.join(resolved, LODESTAR_FILENAME);
  const projectName = path.basename(resolved);
  const warnings: string[] = [];

  // Read config
  const configResult = await readConfig();
  if (!configResult.config) {
    return { success: false, path: filePath, summary: configResult.error! };
  }

  const provider = getProvider(configResult.config);

  // Capture git state
  const gitResult = await captureGitSnapshot(resolved);
  if (isGitError(gitResult)) {
    return { success: false, path: filePath, summary: gitResult.error };
  }

  if (!gitResult.packageChanges) {
    warnings.push("No package.json changes detected");
  }

  // Read existing context if present
  let existingContext: string | null = null;
  try {
    existingContext = await fs.readFile(filePath, "utf-8");
  } catch {
    // No existing context
  }

  // Truncate diffs to token budget
  const { truncatedDiff, truncatedCommittedDiff, wasTruncated } = await truncateToTokenBudget(
    provider,
    gitResult.diff,
    gitResult.committedDiff,
    gitResult.commitLog,
    gitResult.status,
    gitResult.packageChanges,
    input.sessionNotes ?? null,
    existingContext
  );

  if (wasTruncated) {
    warnings.push("Git diff was truncated to fit within the 6,000 token budget");
  }

  // Load prompt and build input
  let promptTemplate: string;
  try {
    promptTemplate = await loadPromptTemplate();
  } catch {
    return { success: false, path: filePath, summary: "Failed to load synthesis prompt template" };
  }

  const inputText = buildInput({
    gitDiff: truncatedDiff,
    committedDiff: truncatedCommittedDiff,
    commitLog: gitResult.commitLog,
    gitStatus: gitResult.status,
    packageChanges: gitResult.packageChanges,
    sessionNotes: input.sessionNotes ?? null,
    projectName,
    existingContext,
  });

  // Call LLM
  let raw: string;
  try {
    raw = await provider.synthesize(promptTemplate, inputText);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, path: filePath, summary: `${provider.name} API error: ${message}` };
  }

  // Parse response
  let context: LodestarContext;
  try {
    context = parseResponse(raw);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, path: filePath, summary: `Failed to parse LLM response: ${message}` };
  }

  // Rotate history before overwriting (failure doesn't block write)
  await rotateHistory(resolved, filePath);

  // Write new context atomically
  const markdown = contextToMarkdown(context);
  await atomicWrite(filePath, markdown);

  const decisionCount = context.decisions.length;
  const summary = `Synthesized ${decisionCount} decision${decisionCount !== 1 ? "s" : ""} for ${projectName}`;

  return {
    success: true,
    path: filePath,
    summary,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
