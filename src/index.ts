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
        "Synthesize the current coding session into a .lodestar.md context file. Captures decisions, patterns, rejected approaches, and open questions from git diffs. Call this at the end of a session. projectRoot defaults to the current working directory if not provided.",
      inputSchema: {
        type: "object" as const,
        properties: {
          projectRoot: {
            type: "string",
            description: "Absolute path to the project directory. Defaults to current working directory if omitted.",
          },
          sessionNotes: {
            type: "string",
            description: "Optional freeform notes from the developer about the session",
          },
        },
      },
    },
    {
      name: "lodestar_load",
      description:
        "Load session context from .lodestar.md for this project. Returns decisions, patterns, open questions, and next-session guidance from the previous session. Call this at the start of a session to warm-start. projectRoot defaults to the current working directory if not provided.",
      inputSchema: {
        type: "object" as const,
        properties: {
          projectRoot: {
            type: "string",
            description: "Absolute path to the project directory. Defaults to current working directory if omitted.",
          },
        },
      },
    },
    {
      name: "lodestar_diff",
      description: "Phase 1b — not yet implemented.",
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
