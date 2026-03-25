// Git diff utilities via simple-git

import path from "node:path";
import fs from "node:fs/promises";
import { simpleGit, type SimpleGit } from "simple-git";

const LODESTAR_FILENAME = ".lodestar.md";
const BRIEF_FILES = ["CLAUDE.md", "PRD.md", "BRIEF.md", "lodestar.md"];

export interface GitSnapshot {
  diff: string;
  committedDiff: string;
  commitLog: string;
  status: string;
  packageChanges: string | null;
  briefDiff: string | null;
}

export interface GitError {
  error: string;
}

export type GitResult = GitSnapshot | GitError;

function isGitError(result: GitResult): result is GitError {
  return "error" in result;
}

export { isGitError };

async function isGitRepo(git: SimpleGit): Promise<boolean> {
  try {
    await git.revparse(["--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

async function getPackageChanges(
  git: SimpleGit,
  sinceCommit: string | null
): Promise<string | null> {
  try {
    if (sinceCommit) {
      const diff = await git.diff([sinceCommit, "HEAD", "--", "package.json"]);
      if (diff.trim()) return diff.trim();
    }
    const diff = await git.diff(["HEAD", "--", "package.json"]);
    return diff.trim() || null;
  } catch {
    return null;
  }
}

async function findLastSynthesisCommit(
  git: SimpleGit,
  projectRoot: string
): Promise<string | null> {
  const lodestarPath = path.join(projectRoot, LODESTAR_FILENAME);

  try {
    await fs.access(lodestarPath);
  } catch {
    return null;
  }

  try {
    // Find the commit that last touched .lodestar.md
    const log = await git.log({
      file: LODESTAR_FILENAME,
      maxCount: 1,
    });
    return log.latest?.hash ?? null;
  } catch {
    return null;
  }
}

export async function captureGitSnapshot(
  projectRoot: string
): Promise<GitResult> {
  const resolved = path.resolve(projectRoot);

  try {
    await fs.access(resolved);
  } catch {
    return { error: `Invalid project root: ${resolved} does not exist` };
  }

  const git = simpleGit(resolved);

  if (!(await isGitRepo(git))) {
    return { error: `Not a git repository: ${resolved}` };
  }

  try {
    // Uncommitted changes
    const diff = await git.diff(["HEAD"]);
    const status = await git.raw(["status", "--short"]);

    // Find what's changed since last synthesis
    const lastSynthCommit = await findLastSynthesisCommit(git, resolved);

    let committedDiff = "";
    let commitLog = "";

    if (lastSynthCommit) {
      // Diff between last synthesis commit and current HEAD
      try {
        committedDiff = await git.diff([lastSynthCommit, "HEAD"]);
      } catch {
        committedDiff = "";
      }

      // Commit messages since last synthesis
      try {
        commitLog = await git.raw([
          "log",
          "--oneline",
          `${lastSynthCommit}..HEAD`,
        ]);
      } catch {
        commitLog = "";
      }
    } else {
      // No prior synthesis — capture recent commits as context
      try {
        commitLog = await git.raw(["log", "--oneline", "-20"]);
      } catch {
        commitLog = "";
      }
    }

    const packageChanges = await getPackageChanges(git, lastSynthCommit);

    // Separate brief diff from work diff
    // Brief files get their own channel — don't compete with code for token budget
    let briefDiff: string | null = null;
    const briefExcludes = BRIEF_FILES.map((f) => `:(exclude)${f}`);

    // Extract brief-only diffs (uncommitted + committed)
    const briefParts: string[] = [];
    for (const bf of BRIEF_FILES) {
      try {
        const uncommittedBrief = await git.diff(["HEAD", "--", bf]);
        if (uncommittedBrief.trim()) briefParts.push(uncommittedBrief.trim());
      } catch { /* no changes */ }

      if (lastSynthCommit) {
        try {
          const committedBrief = await git.diff([lastSynthCommit, "HEAD", "--", bf]);
          if (committedBrief.trim()) briefParts.push(committedBrief.trim());
        } catch { /* no changes */ }
      }
    }
    if (briefParts.length > 0) {
      briefDiff = briefParts.join("\n");
    }

    // Get work-only diffs (exclude brief files)
    let workDiff = diff;
    let workCommittedDiff = committedDiff;
    try {
      workDiff = await git.diff(["HEAD", "--", ".", ...briefExcludes]);
    } catch { /* fall back to full diff */ }
    if (lastSynthCommit) {
      try {
        workCommittedDiff = await git.diff([lastSynthCommit, "HEAD", "--", ".", ...briefExcludes]);
      } catch { /* fall back to full diff */ }
    }

    return {
      diff: workDiff || "(no uncommitted changes)",
      committedDiff: workCommittedDiff.trim() || "(no committed changes since last synthesis)",
      commitLog: commitLog.trim() || "(no commits)",
      status: status.trim() || "(working tree clean)",
      packageChanges,
      briefDiff,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { error: `Git error: ${message}` };
  }
}
