// lodestar_synthesize() implementation
//
// IDEMPOTENCY: This function may be called multiple times for the same session
// (e.g. post-commit hook + SessionEnd hook both fire). This is by design —
// each run reads the current git diff, synthesizes, rotates history, and writes.
// The second run overwrites the first; history rotation preserves the earlier
// result in .lodestar.history/. No dedup or locking needed — last write wins.

import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { captureGitSnapshot, isGitError, type DiffMode } from "./git.js";
import { readConfig } from "./config.js";
import { getProvider } from "./providers/index.js";
import { rotateHistory } from "./history.js";
import { contextToMarkdown, parseMarkdown, type LodestarContext } from "./schema.js";
import { loadPromptTemplate } from "./prompt.js";
import { verifyOpenQuestions } from "./verify-questions.js";
import { splitDiffByFile, truncateByPriority } from "./diff-priority.js";
import { mergeContexts } from "./merge.js";

const LODESTAR_FILENAME = ".lodestar.md";
const TOKEN_BUDGET_FULL = 6000;
const TOKEN_BUDGET_CHECKPOINT = 3000;

export type SynthesisMode = "checkpoint" | "full";

export interface SynthesizeInput {
  projectRoot: string;
  sessionNotes?: string;
  mode?: SynthesisMode;
  diffMode?: DiffMode;
}

export interface SynthesizeResult {
  success: boolean;
  path: string;
  summary: string;
  warnings?: string[];
}

function buildInput(parts: {
  gitDiff: string;
  committedDiff: string;
  commitLog: string;
  gitStatus: string;
  packageChanges: string | null;
  briefDiff: string | null;
  sessionNotes: string | null;
  projectName: string;
  existingContext: string | null;
  diffMode?: DiffMode;
}): string {
  const isLastCommit = parts.diffMode === "last-commit";
  const lines: string[] = [];
  lines.push(`**Project:** ${parts.projectName}`);
  lines.push("");
  lines.push(isLastCommit
    ? "**Changes in last commit (git diff HEAD~1..HEAD):**"
    : "**Uncommitted changes (git diff HEAD):**");
  lines.push("```");
  lines.push(parts.gitDiff);
  lines.push("```");
  if (!isLastCommit) {
    lines.push("");
    lines.push("**Committed changes since last synthesis:**");
    lines.push("```");
    lines.push(parts.committedDiff);
    lines.push("```");
  }
  if (parts.briefDiff) {
    lines.push("");
    lines.push("**Project brief changes (CLAUDE.md / PRD.md):**");
    lines.push("```");
    lines.push(parts.briefDiff);
    lines.push("```");
  }
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
  lines.push(`**Today's date:** ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push("**Developer session notes:**");
  lines.push(parts.sessionNotes ?? "None provided");
  lines.push("");
  lines.push("**Existing context from previous session:**");
  lines.push(parts.existingContext ?? "No existing context");
  return lines.join("\n");
}

interface TruncationResult {
  truncatedDiff: string;
  truncatedCommittedDiff: string;
  wasTruncated: boolean;
  excludedFiles: string[];
}

function slimExistingContext(context: string): string {
  // For checkpoint mode: keep only sections the LLM needs to merge with
  // Strip patterns, rejected, dependencies, project summary to save tokens
  const lines = context.split("\n");
  const keepSections = new Set(["Decisions", "Diagrams", "Project Brief Status", "Future Phases"]);
  const result: string[] = [];
  let inKeptSection = false;
  let currentSection = "";

  for (const line of lines) {
    const sectionMatch = line.match(/^## (.+)/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      inKeptSection = keepSections.has(currentSection);
    }
    // Always keep meta header
    if (line.startsWith("> ") || line.startsWith("# ")) {
      result.push(line);
      continue;
    }
    if (inKeptSection) {
      result.push(line);
    }
  }
  return result.join("\n");
}

async function truncateToTokenBudget(
  provider: ReturnType<typeof getProvider>,
  gitDiff: string,
  committedDiff: string,
  commitLog: string,
  gitStatus: string,
  packageChanges: string | null,
  sessionNotes: string | null,
  existingContext: string | null,
  mode: SynthesisMode = "full"
): Promise<TruncationResult> {
  const tokenBudget = mode === "checkpoint" ? TOKEN_BUDGET_CHECKPOINT : TOKEN_BUDGET_FULL;
  const contextForBudget = mode === "checkpoint" && existingContext
    ? slimExistingContext(existingContext)
    : existingContext;
  const overhead = [commitLog, gitStatus, packageChanges ?? "", sessionNotes ?? "", contextForBudget ?? ""].join("\n");
  const overheadTokens = await provider.countTokens(overhead);
  const totalBudget = tokenBudget - overheadTokens;

  if (totalBudget <= 0) {
    return {
      truncatedDiff: "(diff omitted — other inputs exceed token budget)",
      truncatedCommittedDiff: "(diff omitted)",
      wasTruncated: true,
      excludedFiles: [],
    };
  }

  // Split budget: 60% to committed diff (session history), 40% to uncommitted
  const committedBudget = Math.floor(totalBudget * 0.6);
  const uncommittedBudget = totalBudget - committedBudget;

  // Split diffs by file and sort by priority
  const committedFiles = splitDiffByFile(committedDiff);
  const uncommittedFiles = splitDiffByFile(gitDiff);

  // Estimate tokens synchronously (provider.countTokens is async but we need sync for truncateByPriority)
  const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

  const committed = truncateByPriority(committedFiles, committedBudget, estimateTokens);
  const uncommitted = truncateByPriority(uncommittedFiles, uncommittedBudget, estimateTokens);

  const allExcluded = [...committed.excluded, ...uncommitted.excluded];

  return {
    truncatedDiff: uncommitted.included,
    truncatedCommittedDiff: committed.included,
    wasTruncated: committed.wasTruncated || uncommitted.wasTruncated,
    excludedFiles: allExcluded,
  };
}

function fixJsonNewlines(text: string): string {
  // Fix unescaped newlines inside JSON string values
  // Walk through the string, tracking whether we're inside a JSON string
  let result = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      result += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    if (inString && ch === "\n") {
      result += "\\n";
      continue;
    }

    if (inString && ch === "\r") {
      continue;
    }

    result += ch;
  }

  return result;
}

function parseResponse(raw: string): LodestarContext {
  // Extract JSON content — try fence first, then brace matching
  let jsonText: string | null = null;

  const fenceMatch = raw.match(/```json\s*\n([\s\S]*)```/);
  if (fenceMatch) {
    // Take everything between the first ```json and the LAST ```
    const inner = fenceMatch[1];
    const lastFence = inner.lastIndexOf("```");
    jsonText = lastFence !== -1 ? inner.slice(0, lastFence) : inner;
  }

  if (!jsonText) {
    const braceStart = raw.indexOf("{");
    const braceEnd = raw.lastIndexOf("}");
    if (braceStart !== -1 && braceEnd > braceStart) {
      jsonText = raw.slice(braceStart, braceEnd + 1);
    }
  }

  if (!jsonText) {
    throw new Error("Response did not contain a JSON block");
  }

  // Try parsing as-is first
  try {
    return JSON.parse(jsonText) as LodestarContext;
  } catch {
    // Fix unescaped newlines in string values and retry
  }

  try {
    return JSON.parse(fixJsonNewlines(jsonText)) as LodestarContext;
  } catch {
    throw new Error("Response contained invalid JSON");
  }
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

  const mode = input.mode ?? "full";
  const provider = getProvider(configResult.config, mode);

  // Capture git state
  const diffMode = input.diffMode ?? "working-tree";
  const gitResult = await captureGitSnapshot(resolved, diffMode);
  if (isGitError(gitResult)) {
    return { success: false, path: filePath, summary: gitResult.error };
  }

  if (!gitResult.packageChanges) {
    warnings.push("No package.json changes detected");
  }

  // Check if there are any meaningful changes to synthesize
  // Ignore .lodestar.md itself — it's our output, not a source change
  const diffWithoutLodestar = gitResult.diff
    .split("\n")
    .filter((l) => !l.includes(".lodestar.md"))
    .join("\n")
    .trim();
  const hasUncommitted = diffWithoutLodestar !== "" && diffWithoutLodestar !== "(no uncommitted changes)";
  const hasCommitted = gitResult.committedDiff !== "(no committed changes since last synthesis)";
  const hasChanges = hasUncommitted || hasCommitted;

  if (!hasChanges) {
    // No changes — skip LLM call, return existing context or minimal file
    try {
      await fs.access(filePath);
      return {
        success: true,
        path: filePath,
        summary: `No changes detected for ${projectName} — existing context is current`,
        warnings: ["No uncommitted or committed changes since last synthesis. Skipped LLM call."],
      };
    } catch {
      // No existing context and no changes — write a minimal file
      const minimal: LodestarContext = {
        meta: { project: projectName, date: new Date().toISOString().slice(0, 10), model: "none" },
        projectSummary: "",
        userSegments: [],
        integrations: [],
        features: [],
        futurePhases: [],
        diagrams: [],
        decisions: [],
        patterns: [],
        dependencies: [],
        rejected: [],
        openQuestions: [],
        nextSession: ["Run lodestar save after making changes to generate context."],
      };
      const markdown = contextToMarkdown(minimal);
      await atomicWrite(filePath, markdown);
      return {
        success: true,
        path: filePath,
        summary: `No changes detected — wrote minimal context for ${projectName}`,
        warnings: ["No changes found. Created a placeholder .lodestar.md."],
      };
    }
  }

  // Read existing context if present
  let existingContext: string | null = null;
  let existingParsed: LodestarContext | null = null;
  let resolvedQuestionsNote = "";
  try {
    existingContext = await fs.readFile(filePath, "utf-8");

    // Verify open questions against evidence
    existingParsed = parseMarkdown(existingContext);
    if (existingParsed.openQuestions.length > 0) {
      // Find last synthesis commit for evidence checking
      const { simpleGit } = await import("simple-git");
      const git = simpleGit(resolved);
      let lastCommit: string | null = null;
      try {
        const log = await git.log({ file: LODESTAR_FILENAME, maxCount: 1 });
        lastCommit = log.latest?.hash ?? null;
      } catch {
        // Ignore
      }

      const verified = await verifyOpenQuestions(resolved, existingParsed.openQuestions, lastCommit);
      const resolvedOnes = verified.filter((v) => v.resolved);
      if (resolvedOnes.length > 0) {
        resolvedQuestionsNote = "\n\n**Verified resolved (DROP these from open questions):**\n" +
          resolvedOnes.map((v) => `- "${v.question}" → RESOLVED: ${v.evidence}`).join("\n");
      }
    }
  } catch {
    // No existing context
  }

  // Truncate diffs to token budget
  const { truncatedDiff, truncatedCommittedDiff, wasTruncated, excludedFiles } = await truncateToTokenBudget(
    provider,
    gitResult.diff,
    gitResult.committedDiff,
    gitResult.commitLog,
    gitResult.status,
    gitResult.packageChanges,
    input.sessionNotes ?? null,
    existingContext,
    mode
  );

  if (wasTruncated) {
    const excludeNote = excludedFiles.length > 0
      ? ` Excluded: ${excludedFiles.slice(0, 5).join(", ")}${excludedFiles.length > 5 ? ` +${excludedFiles.length - 5} more` : ""}`
      : "";
    warnings.push(`Diff truncated by file priority.${excludeNote}`);
  }

  // Load prompt and build input
  let promptTemplate: string;
  try {
    promptTemplate = await loadPromptTemplate();
  } catch {
    return { success: false, path: filePath, summary: "Failed to load synthesis prompt template" };
  }

  const contextWithVerification = existingContext
    ? existingContext + resolvedQuestionsNote
    : null;

  const inputText = buildInput({
    gitDiff: truncatedDiff,
    committedDiff: truncatedCommittedDiff,
    commitLog: gitResult.commitLog,
    gitStatus: gitResult.status,
    packageChanges: gitResult.packageChanges,
    briefDiff: gitResult.briefDiff,
    sessionNotes: input.sessionNotes ?? null,
    projectName,
    existingContext: contextWithVerification,
    diffMode,
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
    console.error("[lodestar] Raw LLM response (first 500 chars):", raw.slice(0, 500));
    console.error("[lodestar] Raw LLM response (last 200 chars):", raw.slice(-200));
    return { success: false, path: filePath, summary: `Failed to parse LLM response: ${message}` };
  }

  // Override LLM date with actual date — LLMs often hallucinate dates
  context.meta.date = new Date().toISOString().slice(0, 10);
  context.meta.project = projectName;

  // Merge with existing context to preserve accumulated data
  if (existingParsed) {
    context = mergeContexts(existingParsed, context);
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
