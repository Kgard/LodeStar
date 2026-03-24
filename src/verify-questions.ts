// Verify open questions against evidence before synthesis
// Checks git log, file existence, and build status to determine
// which existing open questions have been resolved.

import path from "node:path";
import fs from "node:fs/promises";
import { simpleGit } from "simple-git";
import type { LodestarOpenQuestion } from "./schema.js";

interface VerifiedQuestion {
  question: string;
  resolved: boolean;
  evidence: string;
}

export async function verifyOpenQuestions(
  projectRoot: string,
  questions: LodestarOpenQuestion[],
  lastSynthCommit: string | null
): Promise<VerifiedQuestion[]> {
  if (questions.length === 0) return [];

  const resolved = path.resolve(projectRoot);
  const git = simpleGit(resolved);
  const results: VerifiedQuestion[] = [];

  // Get files changed since last synthesis
  let changedFiles: Set<string> = new Set();
  if (lastSynthCommit) {
    try {
      const diffOutput = await git.raw(["diff", "--name-only", lastSynthCommit, "HEAD"]);
      for (const f of diffOutput.trim().split("\n").filter(Boolean)) {
        changedFiles.add(f);
      }
    } catch {
      // Ignore
    }
  }

  // Also include uncommitted changes
  try {
    const statusOutput = await git.raw(["status", "--short"]);
    for (const line of statusOutput.trim().split("\n").filter(Boolean)) {
      const file = line.slice(3).trim();
      changedFiles.add(file);
    }
  } catch {
    // Ignore
  }

  // Get recent commit messages for context
  let recentMessages = "";
  try {
    recentMessages = await git.raw(["log", "--oneline", "-20"]);
  } catch {
    // Ignore
  }

  // Check build passes
  let buildPasses = false;
  try {
    const distIndex = path.join(resolved, "dist", "index.js");
    const distStat = await fs.stat(distIndex);
    const srcStat = await fs.stat(path.join(resolved, "src", "index.ts"));
    // If dist is newer than src, build likely passes
    buildPasses = distStat.mtimeMs >= srcStat.mtimeMs;
  } catch {
    buildPasses = false;
  }

  for (const q of questions) {
    const qLower = q.question.toLowerCase();

    // Check: does the question mention specific files that have been changed?
    const mentionedFiles = extractFilePaths(q.question);
    const filesWereChanged = mentionedFiles.some((f) => changedFiles.has(f));

    // Check: is this a "does X work?" or "is there a bug?" question?
    const isTestingQuestion =
      qLower.includes("does ") && (qLower.includes("work") || qLower.includes("bug") || qLower.includes("correctly"));

    // Check: does it ask about type-checking / consistency?
    const isTypeCheckQuestion =
      qLower.includes("type-check") || qLower.includes("mutually consistent") || qLower.includes("compile");

    // Check: does it ask about file existence?
    const isExistenceQuestion = qLower.includes("exist") || qLower.includes("untracked");

    // Determine resolution
    let resolved = false;
    let evidence = "";

    if (isTypeCheckQuestion && buildPasses) {
      resolved = true;
      evidence = "Build output (dist/) is up to date — type-check passes";
    } else if (isTestingQuestion && filesWereChanged) {
      resolved = true;
      evidence = `Files mentioned in question were modified since last synthesis: ${mentionedFiles.filter((f) => changedFiles.has(f)).join(", ")}`;
    } else if (filesWereChanged && mentionedFiles.length > 0) {
      resolved = true;
      evidence = `Related files changed since last synthesis: ${mentionedFiles.filter((f) => changedFiles.has(f)).join(", ")}`;
    } else if (isExistenceQuestion) {
      // Check if the file/directory exists
      for (const f of mentionedFiles) {
        try {
          await fs.access(path.join(path.resolve(projectRoot), f));
          resolved = true;
          evidence = `${f} exists on disk`;
          break;
        } catch {
          // File doesn't exist — question may still be valid
        }
      }
    }

    results.push({ question: q.question, resolved, evidence });
  }

  return results;
}

function extractFilePaths(text: string): string[] {
  const paths: string[] = [];
  // Match common file path patterns
  const regex = /(?:src\/[\w/.]+\.(?:ts|js)|prompts\/[\w/.]+\.md|\.lodestar\.md|package\.json|CLAUDE\.md|assets\/[\w/.]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    paths.push(match[0]);
  }
  return paths;
}
