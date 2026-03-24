// Session notes accumulator
// Notes persist across saves within a session and reset on lodestar end.

import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

const NOTES_DIR = path.join(os.tmpdir(), "lodestar-notes");

function notesFile(projectRoot: string): string {
  const safe = path.resolve(projectRoot).replace(/[/\\]/g, "_");
  return path.join(NOTES_DIR, `${safe}.txt`);
}

export async function addNote(projectRoot: string, note: string): Promise<void> {
  if (!note.trim()) return;
  await fs.mkdir(NOTES_DIR, { recursive: true });
  const file = notesFile(projectRoot);
  try {
    const existing = await fs.readFile(file, "utf-8");
    await fs.writeFile(file, existing.trimEnd() + "\n" + note.trim(), "utf-8");
  } catch {
    await fs.writeFile(file, note.trim(), "utf-8");
  }
}

export async function getNotes(projectRoot: string): Promise<string | null> {
  try {
    const content = await fs.readFile(notesFile(projectRoot), "utf-8");
    return content.trim() || null;
  } catch {
    return null;
  }
}

export async function clearNotes(projectRoot: string): Promise<void> {
  try {
    await fs.unlink(notesFile(projectRoot));
  } catch {
    // Already gone
  }
}
