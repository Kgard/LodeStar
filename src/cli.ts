#!/usr/bin/env node

// Lodestar CLI — lodestar start | save | end | init

import path from "node:path";
import fs from "node:fs/promises";
import readline from "node:readline";
import { simpleGit } from "simple-git";
import { synthesizeContext } from "./synthesize.js";
import { load } from "./load.js";
import { addNote, getNotes, clearNotes } from "./notes.js";

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
  const projectRoot = path.resolve(args[0] ?? process.cwd());

  console.error(`Loading session context for ${projectRoot} ...`);
  const result = await load(projectRoot);

  if (!result.success) {
    console.error(`✗ ${result.summary}`);
    process.exit(1);
  }

  if (!result.context) {
    console.error(result.summary);
    return;
  }

  console.error(`✓ ${result.summary}`);
  if (result.warnings) {
    for (const w of result.warnings) {
      console.error(`  ⚠ ${w}`);
    }
  }

  console.log(JSON.stringify(result.context, null, 2));
}

async function runSave(args: string[], forceMode?: "checkpoint" | "full"): Promise<boolean> {
  const isQuick = args.includes("--quick");
  const pathArgs = args.filter((a) => !a.startsWith("--"));
  const projectRoot = path.resolve(pathArgs[0] ?? process.cwd());

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
  const result = await synthesizeContext({ projectRoot, sessionNotes: sessionNotes ?? undefined, mode });

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
  const pathArgs = args.filter((a) => !a.startsWith("--"));
  const projectRoot = path.resolve(pathArgs[0] ?? process.cwd());

  // Step 1: Synthesize with full model (end-of-session)
  const success = await runSave(args, "full");
  if (!success) {
    process.exit(1);
  }

  // Step 2: Commit .lodestar.md
  const git = simpleGit(projectRoot);

  try {
    await git.add(".lodestar.md");
    await git.commit("chore: update session context via lodestar end");
    console.error(`\n✓ Committed .lodestar.md`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("nothing to commit") || message.includes("no changes added")) {
      console.error(`\n✓ .lodestar.md already up to date — nothing to commit`);
    } else {
      console.error(`\n⚠ Could not commit .lodestar.md: ${message}`);
      console.error(`  You can commit it manually: git add .lodestar.md && git commit -m "update session context"`);
    }
  }

  // Clear accumulated notes — session is over
  await clearNotes(projectRoot);

  console.error(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Session ended. Context saved for next time.

To resume: lodestar start
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
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
      const projectRoot = path.resolve(args.filter((a) => !a.startsWith("--"))[0] ?? process.cwd());
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
      const projectRoot = path.resolve(args.filter((a) => !a.startsWith("--"))[0] ?? process.cwd());
      await printSummary(projectRoot);
      break;
    }
    case "bootstrap": {
      const { bootstrap: runBootstrap } = await import("./bootstrap.js");
      const projectRoot = path.resolve(args[0] ?? process.cwd());
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
      const projectRoot = path.resolve(pathArgs[0] ?? process.cwd());
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
