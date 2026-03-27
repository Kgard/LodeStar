// Terminal summary — distilled 5-line session briefing
// Fired by SessionStart hook. Prints to stderr and exits.

import path from "node:path";
import fs from "node:fs/promises";
import { parseMarkdown } from "./schema.js";

const LODESTAR_FILENAME = ".lodestar.md";

export async function printSummary(projectRoot: string): Promise<void> {
  const resolved = path.resolve(projectRoot);
  const filePath = path.join(resolved, LODESTAR_FILENAME);
  const projectName = path.basename(resolved);

  // Read context
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch {
    console.error("  No Lodestar context yet. Run lodestar save at the end of this session.");
    return;
  }

  let context;
  try {
    context = parseMarkdown(raw);
  } catch {
    console.error("  Lodestar context found but could not be parsed.");
    return;
  }

  // Calculate age
  let ageNote = "";
  if (context.meta.date) {
    const contextDate = new Date(context.meta.date);
    const now = new Date();
    const daysDiff = Math.max(0, Math.floor(
      (now.getTime() - contextDate.getTime()) / (1000 * 60 * 60 * 24)
    ));
    if (daysDiff === 0) {
      ageNote = "today";
    } else if (daysDiff === 1) {
      ageNote = "yesterday";
    } else if (daysDiff <= 7) {
      ageNote = `${daysDiff} days ago`;
    } else {
      ageNote = `${daysDiff} days ago ⚠`;
    }
  }

  // Next session bullets
  const nextItems = context.nextSession.slice(0, 3);

  // Most recent rejected approach
  const lastRejected = context.rejected.length > 0
    ? context.rejected[context.rejected.length - 1]
    : null;

  // Blocking questions
  const blocking = context.openQuestions.filter((q) => q.blocking);

  // Print
  const divider = "═══════════════════════════════════════════════";

  console.error("");
  console.error(`  ${divider}`);
  console.error(`  Lodestar  ·  ${projectName}  ·  ${ageNote}`);
  console.error(`  ${divider}`);

  if (nextItems.length > 0) {
    console.error("  Where you left off:");
    for (const item of nextItems) {
      console.error(`  → ${item}`);
    }
  } else {
    // Fall back to decisions summary
    const decisionCount = context.decisions.length;
    const patternCount = context.patterns.length;
    console.error(`  ${decisionCount} decision${decisionCount !== 1 ? "s" : ""}, ${patternCount} pattern${patternCount !== 1 ? "s" : ""} established`);
  }

  console.error("");

  if (lastRejected && lastRejected.approach !== "No rejected approaches recorded.") {
    console.error(`  Last rejected: ${lastRejected.approach} — ${lastRejected.reason}`);
    console.error("");
  }

  if (blocking.length > 0) {
    console.error(`  ${blocking.length} blocking question${blocking.length !== 1 ? "s" : ""}: ${blocking[0].question}`);
    console.error("");
  }

  console.error(`  ${divider}`);
  console.error("  Full session context → lodestar review");
  console.error(`  ${divider}`);
  console.error("");
}
