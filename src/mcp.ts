// MCP server — runs via `lodestar mcp` subcommand
// Extracted from index.ts for single-binary distribution.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { synthesizeContext } from "./synthesize.js";
import { load } from "./load.js";
import { diff } from "./diff.js";
import fs from "node:fs/promises";
import path from "node:path";

const LOCK_FILENAME = ".lodestar.synthesizing";

export async function runMcpServer(): Promise<void> {
  const server = new Server(
    { name: "lodestar", version: "0.3.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "lodestar_synthesize",
        description:
          "Synthesize the current coding session into a .lodestar.md context file. This runs the CLI in the background for full-quality synthesis (avoids MCP timeout on large diffs). Returns immediately — the .lodestar.md file will be updated within 1-2 minutes. Call this when the user says 'lodestar save', 'lodestar end', 'save session', 'synthesize', or 'end session'. projectRoot should be the workspace root directory.",
        inputSchema: {
          type: "object" as const,
          properties: {
            projectRoot: {
              type: "string",
              description: "Absolute path to the project directory. Use the workspace root. Defaults to current working directory if omitted.",
            },
            sessionNotes: {
              type: "string",
              description: "Optional freeform notes from the developer about the session. Pass any context the user mentions about what they worked on.",
            },
          },
        },
      },
      {
        name: "lodestar_load",
        description:
          "Load session context from .lodestar.md for this project. Returns decisions, patterns, open questions, and next-session guidance from the previous session. Call this when the user says 'lodestar start', 'lodestar load', 'load context', 'what did we work on last', or at the start of a new session. projectRoot should be the workspace root directory.",
        inputSchema: {
          type: "object" as const,
          properties: {
            projectRoot: {
              type: "string",
              description: "Absolute path to the project directory. Use the workspace root. Defaults to current working directory if omitted.",
            },
          },
        },
      },
      {
        name: "lodestar_status",
        description:
          "Check if a background synthesis is still running and when .lodestar.md was last updated. Call this after lodestar_synthesize to check progress. If synthesis is complete, call lodestar_load to get the updated context.",
        inputSchema: {
          type: "object" as const,
          properties: {
            projectRoot: {
              type: "string",
              description: "Absolute path to the project directory.",
            },
          },
        },
      },
      {
        name: "lodestar_diff",
        description: "Compare current session context against a previous session. Phase 1b — not yet implemented.",
        inputSchema: {
          type: "object" as const,
          properties: {
            projectRoot: {
              type: "string",
              description: "Absolute path to the project directory",
            },
            referenceDoc: {
              type: "string",
              description: "Path to reference document for comparison",
            },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "lodestar_synthesize": {
        const projectRoot = (args?.projectRoot as string) || process.cwd();
        const sessionNotes = args?.sessionNotes as string | undefined;

        const lockPath = path.join(projectRoot, LOCK_FILENAME);
        const startTime = new Date().toISOString();
        await fs.writeFile(lockPath, startTime, "utf-8");

        // Spawn CLI in background — uses `lodestar end` (same binary)
        const { spawn } = await import("node:child_process");
        const cliArgs = ["end", projectRoot];
        if (sessionNotes) {
          cliArgs.push(`--notes=${sessionNotes}`);
        }
        const cmd = `lodestar ${cliArgs.map(a => `"${a}"`).join(" ")}; rm -f "${lockPath}"`;
        const child = spawn("sh", ["-c", cmd], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();

        return {
          content: [{ type: "text", text: JSON.stringify({
            success: true,
            path: `${projectRoot}/.lodestar.md`,
            summary: "Synthesis started in background — full-quality Sonnet synthesis. Call lodestar_status to check progress, then lodestar_load when complete.",
          }, null, 2) }],
        };
      }

      case "lodestar_status": {
        const projectRoot = (args?.projectRoot as string) || process.cwd();
        const lockPath = path.join(projectRoot, LOCK_FILENAME);
        const lodestarPath = path.join(projectRoot, ".lodestar.md");

        let synthesizing = false;
        let startedAt: string | null = null;
        try {
          startedAt = await fs.readFile(lockPath, "utf-8");
          synthesizing = true;
        } catch {
          // No lock file
        }

        let lastUpdated: string | null = null;
        try {
          const stat = await fs.stat(lodestarPath);
          lastUpdated = stat.mtime.toISOString();
        } catch {
          // No .lodestar.md
        }

        let elapsed = "";
        if (synthesizing && startedAt) {
          const seconds = Math.round((Date.now() - new Date(startedAt).getTime()) / 1000);
          elapsed = `${seconds}s elapsed`;
        }

        return {
          content: [{ type: "text", text: JSON.stringify({
            synthesizing,
            ...(elapsed ? { elapsed } : {}),
            lastUpdated,
            message: synthesizing
              ? `Synthesis in progress (${elapsed}). Call lodestar_status again in 30 seconds to check, or call lodestar_load once complete.`
              : lastUpdated
                ? "No synthesis running. Context is ready — call lodestar_load to read it."
                : "No synthesis running and no .lodestar.md found. Call lodestar_synthesize to create one.",
          }, null, 2) }],
        };
      }

      case "lodestar_load": {
        const projectRoot = (args?.projectRoot as string) || process.cwd();
        const result = await load(projectRoot);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "lodestar_diff": {
        const result = await diff();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        return {
          content: [
            { type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) },
          ],
        };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Lodestar MCP server running on stdio");
}
