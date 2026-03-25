// MCP server entry point

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { synthesizeContext } from "./synthesize.js";
import { load } from "./load.js";
import { diff } from "./diff.js";

const server = new Server(
  { name: "lodestar", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "lodestar_synthesize",
      description:
        "Synthesize the current coding session into a .lodestar.md context file. Captures decisions, patterns, rejected approaches, and open questions from git diffs. Call this when the user says 'lodestar save', 'lodestar end', 'save session', 'synthesize', or 'end session'. projectRoot should be the workspace root directory.",
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

      const result = await synthesizeContext({ projectRoot, sessionNotes });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Lodestar MCP server running on stdio");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
