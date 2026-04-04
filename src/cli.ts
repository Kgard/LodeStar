#!/usr/bin/env node

// Lodestar CLI — lodestar start | save | end | init

import path from "node:path";
import fs from "node:fs/promises";
import readline from "node:readline";
import { simpleGit } from "simple-git";
import { synthesizeContext } from "./synthesize.js";
import { load } from "./load.js";
import { addNote, getNotes, clearNotes } from "./notes.js";
import { readConfig } from "./config.js";
import { fireVersionCheck } from "./version.js";
import type { SimpleGit } from "simple-git";

async function resolveProject(pathArg: string | undefined): Promise<string> {
  if (pathArg) return path.resolve(pathArg);

  // Check if CWD has a .lodestar.md
  const cwd = process.cwd();
  try {
    await fs.access(path.join(cwd, ".lodestar.md"));
    return cwd;
  } catch {
    // No .lodestar.md in CWD — fall back to last onboarded project
    const result = await readConfig();
    if (result.config?.lastProject) {
      return result.config.lastProject;
    }
    return cwd;
  }
}

async function commitAndPush(git: SimpleGit, message: string): Promise<void> {
  try {
    await git.add(".lodestar.md");
    await git.commit(message);
    console.error(`\n✓ Committed .lodestar.md`);

    try {
      await git.push();
      console.error(`✓ Pushed to remote`);
    } catch (pushErr) {
      const pushMsg = pushErr instanceof Error ? pushErr.message : String(pushErr);
      console.error(`⚠ Could not push: ${pushMsg}`);
      console.error(`  You can push manually: git push`);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("nothing to commit") || message.includes("no changes added")) {
      console.error(`\n✓ .lodestar.md already up to date — nothing to commit`);
    } else {
      console.error(`\n⚠ Could not commit .lodestar.md: ${message}`);
      console.error(`  You can commit it manually: git add .lodestar.md && git commit -m "update session context"`);
    }
  }
}

function askNote(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question("  Notes? (Enter to skip): ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

const USAGE = `
Lodestar — Kylex Module 00
"Every session remembers where you left off."

Commands:
  lodestar start [path]            Load context from your last session
  lodestar save [path]             Save a mid-session checkpoint
  lodestar end [path]              End session — synthesize + commit
  lodestar review [path] [--diff]  Open session context in the browser
  lodestar bootstrap [path]        Capture existing project structure (no LLM, free)
  lodestar summary [path]          Print 5-line session briefing (for hooks/scripts)
  lodestar hooks [path]            Install git hooks (auto-save on commit, full sync on push)
  lodestar hooks --remove [path]   Remove git hooks

  lodestar update                   Update to the latest version
  lodestar init                    First-time setup (provider + API key)
  lodestar help                    Show this message

  [path] is not required if you are in the project directory.

Examples:
  lodestar start                   Start coding — load previous context
  lodestar save                    Quick checkpoint mid-session
  lodestar end                     Done for the day — save and commit
`;

async function runInit(): Promise<void> {
  const { runInit: init } = await import("./init.js");
  await init();
}

async function isFirstRun(projectRoot: string): Promise<boolean> {
  try {
    await fs.access(path.join(projectRoot, ".lodestar.md"));
    return false;
  } catch {
    return true;
  }
}

async function runStart(args: string[]): Promise<void> {
  const projectRoot = await resolveProject(args[0]);

  const result = await load(projectRoot);

  if (!result.success) {
    console.error(`✗ ${result.summary}`);
    process.exit(1);
  }

  if (!result.context) {
    console.error(result.summary);
    return;
  }

  const c = result.context;

  // Print the terminal summary first
  const { printSummary } = await import("./summary.js");
  await printSummary(projectRoot);

  // Print formatted context below
  if (c.features.length > 0) {
    console.error("  Build Status:");
    for (const f of c.features) {
      const icon = f.status === "complete" ? "✓" : f.status === "in-progress" ? "○" : "·";
      console.error(`    ${icon} ${f.feature} — ${f.percentComplete}%`);
      if (f.capabilities && f.capabilities.length > 0) {
        for (const cap of f.capabilities) {
          const capIcon = cap.status === "done" ? "✓" : cap.status === "in-progress" ? "○" : "·";
          console.error(`      ${capIcon} ${cap.name}`);
        }
      }
    }
    console.error("");
  }

  if (c.decisions.length > 0) {
    console.error(`  Last Session Decisions (${c.decisions.length}):`);
    for (const d of c.decisions) {
      console.error(`    • ${d.decision}`);
    }
    console.error("");
    console.error("  Full decision history → lodestar review");
    console.error("");
  }

  if (c.openQuestions.length > 0) {
    console.error(`  Open Questions (${c.openQuestions.length}):`);
    for (const q of c.openQuestions) {
      console.error(`    ${q.blocking ? "⚠" : "•"} ${q.question}`);
    }
    console.error("");
  }

  if (result.warnings) {
    for (const w of result.warnings) {
      console.error(`  ⚠ ${w}`);
    }
  }
}

async function runSave(args: string[], forceMode?: "checkpoint" | "full"): Promise<boolean> {
  const isQuick = args.includes("--quick");
  const diffModeFlag = args.find((a) => a.startsWith("--diff-mode="));
  const diffMode = diffModeFlag?.split("=")[1] === "last-commit" ? "last-commit" as const : undefined;
  const pathArgs = args.filter((a) => !a.startsWith("--"));
  const projectRoot = await resolveProject(pathArgs[0]);

  if (isQuick) {
    // Quick mode: update feature status from recent commit, no LLM call
    const { quickUpdate } = await import("./quick-update.js");
    const result = await quickUpdate(projectRoot);
    if (result.updated) {
      console.error(`✓ Quick update: ${result.summary}`);
    }
    return result.updated;
  }

  // Collect notes — from flag or prompt
  const notesFlag = args.find((a) => a.startsWith("--notes="));
  let note = notesFlag ? notesFlag.split("=").slice(1).join("=") : "";
  if (!note && process.stdin.isTTY) {
    note = await askNote();
  }
  if (note) {
    await addNote(projectRoot, note);
  }

  const sessionNotes = await getNotes(projectRoot);

  if (await isFirstRun(projectRoot)) {
    console.error(`First synthesis for ${projectRoot} — capturing current project state ...`);
  } else {
    console.error(`Saving session checkpoint for ${projectRoot} ...`);
  }

  const mode = forceMode ?? "checkpoint";
  const result = await synthesizeContext({ projectRoot, sessionNotes: sessionNotes ?? undefined, mode, diffMode });

  if (!result.success) {
    console.error(`✗ ${result.summary}`);
    return false;
  }

  console.error(`✓ ${result.summary}`);
  console.error(`  Written to ${result.path}`);
  if (result.warnings) {
    for (const w of result.warnings) {
      console.error(`  ⚠ ${w}`);
    }
  }
  return true;
}

async function runEnd(args: string[]): Promise<void> {
  const projectFlag = args.find((a) => a.startsWith("--project="));
  const projectIdx = args.indexOf("--project");
  const pathArgs = args.filter((a) => !a.startsWith("--"));

  let explicitPath: string | undefined;
  if (projectFlag) {
    explicitPath = projectFlag.split("=")[1];
  } else if (projectIdx !== -1 && args[projectIdx + 1]) {
    explicitPath = args[projectIdx + 1];
  } else {
    explicitPath = pathArgs[0];
  }
  const projectRoot = await resolveProject(explicitPath);
  const git = simpleGit(projectRoot);

  // Step 1: Commit all uncommitted work (excluding .lodestar.md) + push
  // Closes history gaps for users who forget to commit during a session
  try {
    await git.raw(["reset", "HEAD", "--", ".lodestar.md"]);
  } catch { /* not staged */ }
  try {
    const status = await git.raw(["status", "--porcelain"]);
    // Check for any changes beyond .lodestar.md
    const hasWork = status.split("\n").some((l) => l.trim() && !l.includes(".lodestar.md"));
    if (hasWork) {
      await git.add("-A");
      try { await git.raw(["reset", "HEAD", "--", ".lodestar.md"]); } catch { /* */ }
      const timestamp = new Date().toISOString().replace(/\.\d+Z$/, "Z");
      await git.commit(`chore: lodestar auto-commit work ${timestamp}`, undefined, { "--no-verify": null });
      console.error(`\n✓ Committed uncommitted work`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("nothing to commit")) {
      console.error(`⚠ Could not commit work: ${msg}`);
    }
  }

  // Push #1 — best effort
  try {
    await git.push();
    console.error(`✓ Pushed to remote`);
  } catch (pushErr) {
    const pushMsg = pushErr instanceof Error ? pushErr.message : String(pushErr);
    console.error(`⚠ Could not push: ${pushMsg}`);
  }

  // Step 2: Synthesize with full model + last-commit diff mode
  // Working tree is clean after commit #1, so --diff-mode=last-commit reads HEAD~1..HEAD
  const synthArgs = [...args, "--diff-mode=last-commit"];
  const success = await runSave(synthArgs, "full");
  if (!success) {
    process.exit(1);
  }

  // Step 3: Commit + push the newly synthesized .lodestar.md
  await commitAndPush(git, "chore: lodestar context update");

  // Clear accumulated notes — session is over
  await clearNotes(projectRoot);

  console.error(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Session ended. Context saved for next time.

To resume: lodestar start
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  // Non-blocking telemetry ping — fire and forget
  fireVersionCheck(command ?? "help");

  switch (command) {
    case "update": {
      const { runUpdate } = await import("./update.js");
      await runUpdate();
      break;
    }
    case "init":
      await runInit();
      break;
    case "start":
    case "load":
      await runStart(args);
      break;
    case "save":
    case "synthesize":
    case "sync":
      if (!(await runSave(args))) {
        process.exit(1);
      }
      break;
    case "end":
      await runEnd(args);
      break;
    case "hooks": {
      const { installHooks, removeHooks } = await import("./hooks.js");
      const projectRoot = await resolveProject(args.filter((a) => !a.startsWith("--"))[0]);
      if (args.includes("--remove")) {
        await removeHooks(projectRoot);
        console.error("✓ Lodestar git hooks removed");
      } else {
        const results = await installHooks(projectRoot);
        for (const r of results) {
          console.error(`${r.installed ? "✓" : "✗"} ${r.message}`);
        }
      }
      break;
    }
    case "summary": {
      const { printSummary } = await import("./summary.js");
      const summaryProjIdx = args.indexOf("--project");
      const summaryPathArg = summaryProjIdx !== -1 && args[summaryProjIdx + 1]
        ? args[summaryProjIdx + 1]
        : args.filter((a) => !a.startsWith("--"))[0];
      const projectRoot = await resolveProject(summaryPathArg);
      await printSummary(projectRoot);
      break;
    }
    case "bootstrap": {
      const { bootstrap: runBootstrap } = await import("./bootstrap.js");
      const projectRoot = await resolveProject(args[0]);
      console.error(`Bootstrapping ${projectRoot} ...`);
      const result = await runBootstrap(projectRoot);
      if (!result.success) {
        console.error(`✗ ${result.summary}`);
        process.exit(1);
      }
      console.error(`✓ ${result.summary}`);
      console.error(`  Written to ${result.path}`);
      if (result.warnings) {
        for (const w of result.warnings) {
          console.error(`  ⚠ ${w}`);
        }
      }
      console.error(`\n  This is a skeleton — decisions and rationale will be`);
      console.error(`  populated after your first coding session with lodestar save.`);
      break;
    }
    case "review": {
      const { runReview } = await import("./review.js");
      const showDiff = args.includes("--diff");
      const pathArgs = args.filter((a) => !a.startsWith("--"));
      const projectRoot = await resolveProject(pathArgs[0]);
      await runReview({ projectRoot, showDiff });
      break;
    }
    case "help":
    case "--help":
    case "-h":
    case undefined:
      console.error(USAGE);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error(USAGE);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error("Error:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
