// Git diff utilities via simple-git

import path from "node:path";
import fs from "node:fs/promises";
import { simpleGit, type SimpleGit } from "simple-git";

export interface GitSnapshot {
  diff: string;
  status: string;
  packageChanges: string | null;
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

async function getPackageChanges(git: SimpleGit): Promise<string | null> {
  try {
    const diff = await git.diff(["HEAD", "--", "package.json"]);
    return diff.trim() || null;
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
    const diff = await git.diff(["HEAD"]);
    const status = await git.raw(["status", "--short"]);
    const packageChanges = await getPackageChanges(git);

    return {
      diff: diff || "(no uncommitted changes)",
      status: status.trim() || "(working tree clean)",
      packageChanges,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { error: `Git error: ${message}` };
  }
}
