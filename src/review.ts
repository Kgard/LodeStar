// lodestar review — serves session context in the browser

import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import fs from "node:fs/promises";
import { exec } from "node:child_process";
import { parseMarkdown, type LodestarContext } from "./schema.js";
import { captureGitSnapshot, isGitError } from "./git.js";
import { synthesizeContext } from "./synthesize.js";
import { renderReaderHTML } from "./reader/template.js";

const LODESTAR_FILENAME = ".lodestar.md";
const HISTORY_DIR = ".lodestar.history";
const BRIEF_HTML = "brief.html";
const PRD_FILENAMES = ["CLAUDE.md", "lodestar.md", "PRD.md", "BRIEF.md", "README.md"];
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

async function readPrd(projectRoot: string): Promise<{ filename: string; content: string } | null> {
  for (const name of PRD_FILENAMES) {
    try {
      const content = await fs.readFile(path.join(projectRoot, name), "utf-8");
      return { filename: name, content };
    } catch {
      continue;
    }
  }
  return null;
}

async function readBriefHtml(projectRoot: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(projectRoot, BRIEF_HTML), "utf-8");
  } catch {
    return null;
  }
}

async function killExistingServer(port: number): Promise<void> {
  return new Promise((resolve) => {
    exec(`lsof -ti :${port}`, (err, stdout) => {
      const pids = (stdout ?? "").trim().split("\n").filter(Boolean);
      if (pids.length === 0) { resolve(); return; }
      for (const pid of pids) {
        if (pid !== String(process.pid)) {
          try { process.kill(Number(pid), "SIGTERM"); } catch { /* already dead */ }
        }
      }
      // Give the old process a moment to release the port
      setTimeout(resolve, 300);
    });
  });
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

  // Auto-save if there are changes since last synthesis
  const gitResult = await captureGitSnapshot(resolved);
  if (!isGitError(gitResult)) {
    const hasUncommitted = gitResult.diff !== "(no uncommitted changes)" &&
      !gitResult.diff.split("\n").every((l) => l.includes(".lodestar.md") || !l.trim());
    const hasCommitted = gitResult.committedDiff !== "(no committed changes since last synthesis)";
    if (hasUncommitted || hasCommitted) {
      console.error("Changes detected — saving before review...");
      const saveResult = await synthesizeContext({ projectRoot: resolved, mode: "checkpoint" });
      if (saveResult.success) {
        console.error(`✓ ${saveResult.summary}`);
      }
    }
  }

  const showDiff = options.showDiff;

  async function generateHtml(): Promise<string> {
    const context = await readContext(resolved);
    const historyContext = showDiff
      ? await readLatestHistory(resolved)
      : null;
    const prd = await readPrd(resolved);
    const briefHtml = await readBriefHtml(resolved);
    return renderReaderHTML(context, historyContext, prd, briefHtml, resolved);
  }

  // Serve via HTTP — regenerates HTML on each request for fresh data
  let idleTimer: ReturnType<typeof setTimeout>;

  const server = http.createServer(async (req, res) => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      console.error("Lodestar reader: idle timeout, shutting down.");
      server.close();
      process.exit(0);
    }, IDLE_TIMEOUT_MS);

    if (req.url === "/check") {
      try {
        const stat = await fs.stat(path.join(resolved, LODESTAR_FILENAME));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ mtime: stat.mtimeMs }));
      } catch {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ mtime: 0 }));
      }
      return;
    }

    if (req.url === "/brief") {
      const brief = await readBriefHtml(resolved);
      if (brief) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(brief);
        return;
      }
    }

    const html = await generateHtml();
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });

  let port: number;
  if (await tryPort(PREFERRED_PORT)) {
    port = PREFERRED_PORT;
  } else {
    // Kill stale lodestar review server and reclaim the port
    await killExistingServer(PREFERRED_PORT);
    port = (await tryPort(PREFERRED_PORT)) ? PREFERRED_PORT : 0;
  }

  server.listen(port, "127.0.0.1", () => {
    const actualPort = (server.address() as AddressInfo).port;
    const url = `http://127.0.0.1:${actualPort}`;
    console.error(`Lodestar reader at ${url} — press Ctrl+C to close`);
    exec(`open "${url}"`);
  });

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
