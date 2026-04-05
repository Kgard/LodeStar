// Terminal summary — distilled 5-line session briefing
// Fired by SessionStart hook. Prints to stderr and exits.

import path from "node:path";
import fs from "node:fs/promises";
import { parseMarkdown, type LodestarContext } from "./schema.js";
import { getCurrentVersion } from "./version.js";

const LODESTAR_FILENAME = ".lodestar.md";

function calculateAge(dateStr: string): string {
  const contextDate = new Date(dateStr);
  if (isNaN(contextDate.getTime())) return "";
  const now = new Date();
  const daysDiff = Math.max(0, Math.floor(
    (now.getTime() - contextDate.getTime()) / (1000 * 60 * 60 * 24)
  ));
  if (daysDiff === 0) return "today";
  if (daysDiff === 1) return "yesterday";
  if (daysDiff <= 7) return `${daysDiff} days ago`;
  return `${daysDiff} days ago ⚠`;
}

function buildFeatureLine(context: LodestarContext): string | null {
  const features = context.features ?? [];
  if (features.length === 0) return null;
  const complete = features.filter(f => f.status === "complete").length;
  const inProgress = features.filter(f => f.status === "in-progress").length;
  const parts: string[] = [];
  if (complete > 0) parts.push(`${complete} done`);
  if (inProgress > 0) parts.push(`${inProgress} in progress`);
  if (parts.length === 0) return null;
  return `${features.length} features: ${parts.join(", ")}`;
}

function buildOutstandingLine(context: LodestarContext): string | null {
  const outstanding = context.decisions.filter(d => d.status === "outstanding");
  if (outstanding.length === 0) return null;
  return `${outstanding.length} outstanding decision${outstanding.length !== 1 ? "s" : ""} need${outstanding.length === 1 ? "s" : ""} resolution`;
}

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

  let context: LodestarContext;
  try {
    context = parseMarkdown(raw);
  } catch {
    console.error("  Lodestar context found but could not be parsed.");
    return;
  }

  const ageNote = context.meta.date ? calculateAge(context.meta.date) : "";
  const divider = "═══════════════════════════════════════════════";

  console.error("");
  console.error(`  ${divider}`);
  console.error(`  Lodestar by kylex.io  v${getCurrentVersion()}  ·  ${projectName}${ageNote ? `  ·  ${ageNote}` : ""}`);
  console.error(`  ${divider}`);

  // Next session bullets — primary content
  const nextItems = context.nextSession.filter(s => s.trim().length > 0).slice(0, 3);

  if (nextItems.length > 0) {
    console.error("  Where you left off:");
    for (const item of nextItems) {
      console.error(`  → ${item}`);
    }
  } else {
    // Fallback chain: features → decisions count → generic
    const featureLine = buildFeatureLine(context);
    if (featureLine) {
      console.error(`  ${featureLine}`);
    } else if (context.decisions.length > 0) {
      const active = context.decisions.filter(d => !d.status || d.status === "active").length;
      console.error(`  ${active} active decision${active !== 1 ? "s" : ""} established`);
    } else {
      console.error("  Context captured. No next-session guidance yet.");
    }
  }

  console.error("");

  // Outstanding decisions — surface unresolved items
  const outstandingLine = buildOutstandingLine(context);
  if (outstandingLine) {
    console.error(`  ⚠ ${outstandingLine}`);
    console.error("");
  }

  // Last rejected approach — skip if empty/placeholder
  const lastRejected = context.rejected.length > 0
    ? context.rejected[context.rejected.length - 1]
    : null;
  if (lastRejected && lastRejected.approach.trim().length > 0 && lastRejected.approach !== "No rejected approaches recorded.") {
    const reason = lastRejected.reason.trim();
    const reasonText = reason.length > 80 ? reason.slice(0, 77) + "..." : reason;
    console.error(`  Last rejected: ${lastRejected.approach}${reasonText ? ` — ${reasonText}` : ""}`);
    console.error("");
  }

  // Blocking questions
  const blocking = (context.openQuestions ?? []).filter(q => q.blocking);
  if (blocking.length > 0) {
    const questionText = blocking[0].question.trim();
    if (questionText.length > 0) {
      console.error(`  ${blocking.length} blocking question${blocking.length !== 1 ? "s" : ""}: ${questionText}`);
      console.error("");
    }
  }

  console.error(`  ${divider}`);
  console.error("  Full session context → lodestar review");
  console.error(`  ${divider}`);
  console.error("");
}
