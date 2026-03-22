// .lodestar.history/ rotation logic

import path from "node:path";
import fs from "node:fs/promises";

const HISTORY_DIR = ".lodestar.history";
const MAX_HISTORY = 3;

export async function rotateHistory(
  projectRoot: string,
  filePath: string
): Promise<void> {
  const historyDir = path.join(projectRoot, HISTORY_DIR);

  // Check if current file exists
  try {
    await fs.access(filePath);
  } catch {
    return;
  }

  try {
    await fs.mkdir(historyDir, { recursive: true });

    const now = new Date();
    const stamp = now
      .toISOString()
      .replace(/T/, "-")
      .replace(/:/g, "-")
      .slice(0, 16); // YYYY-MM-DD-HH-MM
    const historyPath = path.join(historyDir, `${stamp}.md`);
    await fs.copyFile(filePath, historyPath);

    // Prune old files, keep last MAX_HISTORY
    const entries = await fs.readdir(historyDir);
    const mdFiles = entries.filter((f) => f.endsWith(".md")).sort();
    if (mdFiles.length > MAX_HISTORY) {
      const toDelete = mdFiles.slice(0, mdFiles.length - MAX_HISTORY);
      for (const file of toDelete) {
        await fs.unlink(path.join(historyDir, file));
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[lodestar] History rotation warning: ${message}`);
  }
}
