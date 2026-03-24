// Quick update — lightweight .lodestar.md update without LLM call
// Triggered by post-commit hook. Updates feature completion and timestamp.

import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { simpleGit } from "simple-git";
import { parseMarkdown, contextToMarkdown, type LodestarContext } from "./schema.js";

const LODESTAR_FILENAME = ".lodestar.md";

interface QuickUpdateResult {
  updated: boolean;
  summary: string;
}

export async function quickUpdate(projectRoot: string): Promise<QuickUpdateResult> {
  const resolved = path.resolve(projectRoot);
  const filePath = path.join(resolved, LODESTAR_FILENAME);

  // Read existing context
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch {
    return { updated: false, summary: "No .lodestar.md found — run lodestar save first" };
  }

  let context: LodestarContext;
  try {
    context = parseMarkdown(raw);
  } catch {
    return { updated: false, summary: "Failed to parse .lodestar.md" };
  }

  // Get the latest commit message
  const git = simpleGit(resolved);
  let lastCommitMsg = "";
  try {
    lastCommitMsg = await git.raw(["log", "-1", "--format=%s"]);
    lastCommitMsg = lastCommitMsg.trim();
  } catch {
    return { updated: false, summary: "Not a git repo or no commits" };
  }

  // Get files changed in last commit
  let changedFiles: string[] = [];
  try {
    const diffOutput = await git.raw(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]);
    changedFiles = diffOutput.trim().split("\n").filter(Boolean);
  } catch {
    changedFiles = [];
  }

  // Update date
  context.meta.date = new Date().toISOString().slice(0, 10);

  // Match changed files to features and bump completion
  let updatedFeatures = 0;
  for (const feature of context.features) {
    // Check if commit message mentions the feature
    const featureLower = feature.feature.toLowerCase();
    const commitLower = lastCommitMsg.toLowerCase();

    const keywords = featureLower.split(/[\s—\-]+/).filter((w) => w.length > 3);
    const matches = keywords.some((kw) => commitLower.includes(kw));

    if (matches && feature.status !== "complete") {
      // Bump completion by 5-10% per relevant commit
      const bump = Math.min(5, 100 - feature.percentComplete);
      if (bump > 0) {
        feature.percentComplete += bump;
        feature.notes = `Updated via commit: ${lastCommitMsg.slice(0, 60)}`;
        updatedFeatures++;
      }

      // If at 100%, mark complete
      if (feature.percentComplete >= 100) {
        feature.percentComplete = 100;
        feature.status = "complete";
      }
    }
  }

  if (updatedFeatures === 0) {
    return { updated: false, summary: "No feature updates from this commit" };
  }

  // Write updated context atomically
  const markdown = contextToMarkdown(context);
  const tmpPath = path.join(
    os.tmpdir(),
    `lodestar-quick-${Date.now()}-${Math.random().toString(36).slice(2)}.md`
  );
  await fs.writeFile(tmpPath, markdown, "utf-8");
  await fs.rename(tmpPath, filePath);

  return {
    updated: true,
    summary: `Updated ${updatedFeatures} feature${updatedFeatures !== 1 ? "s" : ""} from commit: ${lastCommitMsg.slice(0, 50)}`,
  };
}
