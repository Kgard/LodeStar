// Git hook installation and management

import path from "node:path";
import fs from "node:fs/promises";
import { simpleGit } from "simple-git";

const POST_CHECKOUT_HOOK = `#!/bin/sh
# Lodestar post-checkout hook — load context on branch switch / repo open
# Installed by lodestar init. Remove this file to disable.
# Only fire on branch checkout (flag=1), not file checkout (flag=0)
if [ "$3" = "1" ]; then
  lodestar summary 2>/dev/null
fi
`;

// Session-close hook: post-commit
// Implements the full double-commit sequence with recursion guard.
// Key decisions:
//   - LODESTAR_HOOK_RUNNING env var prevents infinite recursion
//   - Commit #1 resets .lodestar.md from staging so it's never mixed with work commits
//   - lodestar save --diff-mode=last-commit reads only the just-committed diff
//   - Commit #2 stages and commits the synthesized .lodestar.md
//   - Push failures exit 0 — a failed push never blocks the user
//   - Commit messages use ISO timestamps and chore: lodestar prefix for filterability
const POST_COMMIT_HOOK = `#!/bin/sh
# Lodestar session-close hook (post-commit)
# Installed by lodestar init. Remove this file to disable.
#
# Sequence: commit #1 (work) → push #1 → synthesize → commit #2 (context) → push #2
# Every failure is non-blocking. All exits are 0.

# Recursion guard — prevent infinite loop when this hook commits .lodestar.md
[ "$LODESTAR_HOOK_RUNNING" = "1" ] && exit 0
export LODESTAR_HOOK_RUNNING=1

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# --- Step 1: Commit any remaining uncommitted work ---
# Captures history gaps for users who forget to commit during a session.
# Exclude .lodestar.md — it belongs in commit #2, not mixed with work.
git reset HEAD -- .lodestar.md 2>/dev/null
if ! git diff --quiet 2>/dev/null || [ -n "$(git ls-files --others --exclude-standard 2>/dev/null)" ]; then
  git add -A 2>/dev/null
  git reset HEAD -- .lodestar.md 2>/dev/null
  git commit --no-verify -m "chore: lodestar auto-commit work $TIMESTAMP" 2>/dev/null || true
fi

# Push #1 — best effort, never block
git push 2>/dev/null || true

# --- Step 2: Synthesize from last commit ---
# Working tree is clean after commit #1, so --diff-mode=last-commit reads HEAD~1..HEAD
lodestar save --diff-mode=last-commit 2>/dev/null

# --- Step 3: Commit + push the synthesized .lodestar.md ---
if ! git diff --quiet -- .lodestar.md 2>/dev/null; then
  git add .lodestar.md
  git commit --no-verify -m "chore: lodestar context update $TIMESTAMP" 2>/dev/null || true
fi

# Push #2 — best effort
git push 2>/dev/null || true

exit 0
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
    if (existing.includes("Lodestar") || existing.includes("lodestar")) {
      // Already installed — update it
      await fs.writeFile(hookPath, hookContent, { mode: 0o755 });
      return { installed: true, message: `Updated existing ${hookName} hook` };
    }
    // Hook exists but isn't ours — append safely
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

  const postCheckout = await installHook(hooksDir, "post-checkout", POST_CHECKOUT_HOOK);
  results.push({ hook: "post-checkout", ...postCheckout });

  const postCommit = await installHook(hooksDir, "post-commit", POST_COMMIT_HOOK);
  results.push({ hook: "post-commit", ...postCommit });

  // Remove legacy pre-push hook if present — post-commit now handles commit + push
  const prePushPath = path.join(hooksDir, "pre-push");
  try {
    const prePushContent = await fs.readFile(prePushPath, "utf-8");
    if (prePushContent.includes("Lodestar") || prePushContent.includes("lodestar")) {
      // Check if it's lodestar-only or has other content
      const lines = prePushContent.split("\n");
      const cleaned = lines.filter((l) => !l.includes("Lodestar") && !l.includes("lodestar")).join("\n").trim();
      if (cleaned === "#!/bin/sh" || cleaned === "") {
        await fs.unlink(prePushPath);
        results.push({ hook: "pre-push", installed: true, message: "Removed legacy pre-push hook (now handled by post-commit)" });
      } else {
        // Has non-lodestar content — remove only our lines
        await fs.writeFile(prePushPath, cleaned + "\n", { mode: 0o755 });
        results.push({ hook: "pre-push", installed: true, message: "Removed Lodestar lines from pre-push hook" });
      }
    }
  } catch {
    // No pre-push hook — nothing to clean up
  }

  return results;
}

export async function removeHooks(
  projectRoot: string
): Promise<void> {
  const resolved = path.resolve(projectRoot);
  if (!(await isGitRepo(resolved))) return;

  const hooksDir = await getHooksDir(resolved);

  for (const hookName of ["post-checkout", "post-commit", "pre-push"]) {
    const hookPath = path.join(hooksDir, hookName);
    try {
      const content = await fs.readFile(hookPath, "utf-8");
      if (content.includes("Lodestar") || content.includes("lodestar")) {
        // Remove Lodestar lines, keep the rest
        const lines = content.split("\n");
        const cleaned = lines.filter((l) => !l.includes("Lodestar") && !l.includes("lodestar") && !l.includes("LODESTAR")).join("\n").trim();
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
