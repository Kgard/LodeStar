#!/usr/bin/env node

// Lodestar CLI — lodestar init | synthesize | load

import path from "node:path";
import fs from "node:fs/promises";
import { synthesizeContext } from "./synthesize.js";
import { load } from "./load.js";

const USAGE = `
Lodestar — Keelson Module 00

Usage:
  lodestar init                    Set up provider and API key
  lodestar synthesize [path]       Save session context to .lodestar.md
  lodestar load [path]             Load session context from .lodestar.md
  lodestar help                    Show this message

  [path] is not required if you are in the project directory.

Examples:
  lodestar synthesize              Synthesize current directory
  lodestar synthesize ~/my-project Synthesize a specific project
  lodestar load                    Load context for current directory
`;

async function runInit(): Promise<void> {
  // Dynamic import to avoid loading heavy deps (inquirer, open, SDKs) for other commands
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

async function runSynthesize(args: string[]): Promise<void> {
  const projectRoot = path.resolve(args[0] ?? process.cwd());

  if (await isFirstRun(projectRoot)) {
    console.error(`First synthesis for ${projectRoot} — capturing current project state ...`);
  } else {
    console.error(`Synthesizing session context for ${projectRoot} ...`);
  }

  const result = await synthesizeContext({ projectRoot });

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
}

async function runLoad(args: string[]): Promise<void> {
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

  // Print the context to stdout so it can be piped
  console.log(JSON.stringify(result.context, null, 2));
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "init":
      await runInit();
      break;
    case "synthesize":
    case "sync":
      await runSynthesize(args);
      break;
    case "load":
      await runLoad(args);
      break;
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
