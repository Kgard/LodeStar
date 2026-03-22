// lodestar review — local HTTP server + browser open

import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import fs from "node:fs/promises";
import open from "open";
import { parseMarkdown, type LodestarContext } from "./schema.js";
import { renderReaderHTML } from "./reader/template.js";

const LODESTAR_FILENAME = ".lodestar.md";
const HISTORY_DIR = ".lodestar.history";
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

async function readContext(projectRoot: string): Promise<LodestarContext | null> {
  try {
    const raw = await fs.readFile(path.join(projectRoot, LODESTAR_FILENAME), "utf-8");
    return parseMarkdown(raw);
  } catch {
    return null;
  }
}

async function readLatestHistory(projectRoot: string): Promise<LodestarContext | null> {
  const historyDir = path.join(projectRoot, HISTORY_DIR);
  try {
    const entries = await fs.readdir(historyDir);
    const mdFiles = entries.filter((f) => f.endsWith(".md")).sort();
    if (mdFiles.length === 0) return null;
    const latest = mdFiles[mdFiles.length - 1];
    const raw = await fs.readFile(path.join(historyDir, latest), "utf-8");
    return parseMarkdown(raw);
  } catch {
    return null;
  }
}

export async function runReview(options: {
  projectRoot: string;
  showDiff: boolean;
}): Promise<void> {
  const resolved = path.resolve(options.projectRoot);

  const context = await readContext(resolved);
  const historyContext = options.showDiff
    ? await readLatestHistory(resolved)
    : null;

  const html = renderReaderHTML(context, historyContext);

  let idleTimer: ReturnType<typeof setTimeout>;

  const server = http.createServer((_req, res) => {
    // Reset idle timer on every request
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      console.error("Lodestar reader: idle timeout, shutting down.");
      server.close();
      process.exit(0);
    }, IDLE_TIMEOUT_MS);

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });

  server.listen(0, "127.0.0.1", async () => {
    const { port } = server.address() as AddressInfo;
    console.error(`Lodestar reader open at http://localhost:${port} — press Ctrl+C to close`);
    await open(`http://localhost:${port}`);
  });

  // Start idle timer
  idleTimer = setTimeout(() => {
    console.error("Lodestar reader: idle timeout, shutting down.");
    server.close();
    process.exit(0);
  }, IDLE_TIMEOUT_MS);

  process.on("SIGINT", () => {
    clearTimeout(idleTimer);
    server.close();
    process.exit(0);
  });
}
