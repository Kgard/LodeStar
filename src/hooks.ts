// Git hook installation and management

import path from "node:path";
import fs from "node:fs/promises";
import { simpleGit } from "simple-git";

const POST_COMMIT_HOOK = `#!/bin/sh
# Lodestar post-commit hook — lightweight feature status update
# Installed by lodestar init. Remove this file to disable.
lodestar save --quick 2>/dev/null &
`;

const PRE_PUSH_HOOK = `#!/bin/sh
# Lodestar pre-push hook — commit .lodestar.md if it has changes
# Installed by lodestar init. Remove this file to disable.
if git diff --name-only | grep -q ".lodestar.md"; then
  git add .lodestar.md
  git commit -m "chore: update session context" --no-verify 2>/dev/null
fi
`;

async function isGitRepo(projectRoot: string): Promise<boolean> {
  try {
    const git = simpleGit(projectRoot);
    await git.revparse(["--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

async function getHooksDir(projectRoot: string): Promise<string> {
  const git = simpleGit(projectRoot);
  try {
    const hooksPath = await git.raw(["config", "--get", "core.hooksPath"]);
    if (hooksPath.trim()) return path.resolve(projectRoot, hooksPath.trim());
  } catch {
    // No custom hooks path configured
  }
  return path.join(projectRoot, ".git", "hooks");
}

async function installHook(
  hooksDir: string,
  hookName: string,
  hookContent: string
): Promise<{ installed: boolean; message: string }> {
  const hookPath = path.join(hooksDir, hookName);

  // Check if hook already exists
  try {
    const existing = await fs.readFile(hookPath, "utf-8");
    if (existing.includes("Lodestar")) {
      // Already installed — update it
      await fs.writeFile(hookPath, hookContent, { mode: 0o755 });
      return { installed: true, message: `Updated existing ${hookName} hook` };
    }
    // Hook exists but isn't ours — append
    const merged = existing.trimEnd() + "\n\n" + hookContent.split("\n").slice(1).join("\n");
    await fs.writeFile(hookPath, merged, { mode: 0o755 });
    return { installed: true, message: `Appended Lodestar to existing ${hookName} hook` };
  } catch {
    // Hook doesn't exist — create it
    await fs.mkdir(hooksDir, { recursive: true });
    await fs.writeFile(hookPath, hookContent, { mode: 0o755 });
    return { installed: true, message: `Installed ${hookName} hook` };
  }
}

export async function installHooks(
  projectRoot: string
): Promise<Array<{ hook: string; installed: boolean; message: string }>> {
  const resolved = path.resolve(projectRoot);
  const results: Array<{ hook: string; installed: boolean; message: string }> = [];

  if (!(await isGitRepo(resolved))) {
    return [{ hook: "all", installed: false, message: "Not a git repository" }];
  }

  const hooksDir = await getHooksDir(resolved);

  const postCommit = await installHook(hooksDir, "post-commit", POST_COMMIT_HOOK);
  results.push({ hook: "post-commit", ...postCommit });

  const prePush = await installHook(hooksDir, "pre-push", PRE_PUSH_HOOK);
  results.push({ hook: "pre-push", ...prePush });

  return results;
}

export async function removeHooks(
  projectRoot: string
): Promise<void> {
  const resolved = path.resolve(projectRoot);
  if (!(await isGitRepo(resolved))) return;

  const hooksDir = await getHooksDir(resolved);

  for (const hookName of ["post-commit", "pre-push"]) {
    const hookPath = path.join(hooksDir, hookName);
    try {
      const content = await fs.readFile(hookPath, "utf-8");
      if (content.includes("Lodestar")) {
        // Remove Lodestar lines, keep the rest
        const lines = content.split("\n");
        const cleaned = lines.filter((l) => !l.includes("Lodestar") && !l.includes("lodestar")).join("\n").trim();
        if (cleaned === "#!/bin/sh" || cleaned === "") {
          await fs.unlink(hookPath);
        } else {
          await fs.writeFile(hookPath, cleaned + "\n", { mode: 0o755 });
        }
      }
    } catch {
      // Hook doesn't exist
    }
  }
}
