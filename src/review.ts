// lodestar review — serves session context in the browser

import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { exec } from "node:child_process";
import { parseMarkdown, type LodestarContext } from "./schema.js";
import { renderReaderHTML } from "./reader/template.js";

const LODESTAR_FILENAME = ".lodestar.md";
const HISTORY_DIR = ".lodestar.history";
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const PREFERRED_PORT = 7357;

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

async function tryPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const test = http.createServer();
    test.once("error", () => resolve(false));
    test.listen(port, "127.0.0.1", () => {
      test.close(() => resolve(true));
    });
  });
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

  // Write HTML to a temp file as primary approach — most reliable with Safari
  const tmpFile = path.join(os.tmpdir(), `lodestar-review-${Date.now()}.html`);
  await fs.writeFile(tmpFile, html, "utf-8");

  console.error(`Lodestar reader saved to ${tmpFile}`);
  console.error("Opening in browser...");

  exec(`open "${tmpFile}"`);

  // Also start a server for refresh/bookmarking
  let idleTimer: ReturnType<typeof setTimeout>;

  const server = http.createServer((_req, res) => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      console.error("Lodestar reader: idle timeout, shutting down.");
      server.close();
      process.exit(0);
    }, IDLE_TIMEOUT_MS);

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });

  const port = (await tryPort(PREFERRED_PORT)) ? PREFERRED_PORT : 0;

  server.listen(port, "127.0.0.1", () => {
    const actualPort = (server.address() as AddressInfo).port;
    console.error(`Also serving at http://127.0.0.1:${actualPort} — press Ctrl+C to close`);
  });

  idleTimer = setTimeout(() => {
    console.error("Lodestar reader: idle timeout, shutting down.");
    server.close();
    process.exit(0);
  }, IDLE_TIMEOUT_MS);

  process.on("SIGINT", () => {
    clearTimeout(idleTimer);
    server.close();
    // Clean up temp file
    fs.unlink(tmpFile).catch(() => {});
    process.exit(0);
  });
}
