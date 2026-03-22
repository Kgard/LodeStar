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
        "Synthesize the current session into a .lodestar.md context file. Captures git diffs, decisions, patterns, and rejected approaches.",
      inputSchema: {
        type: "object" as const,
        properties: {
          projectRoot: {
            type: "string",
            description: "Absolute path to the project directory",
          },
          sessionNotes: {
            type: "string",
            description: "Optional freeform notes from the developer",
          },
        },
        required: ["projectRoot"],
      },
    },
    {
      name: "lodestar_load",
      description:
        "Load the .lodestar.md context file for a project. Returns structured session context for warm-starting a new session.",
      inputSchema: {
        type: "object" as const,
        properties: {
          projectRoot: {
            type: "string",
            description: "Absolute path to the project directory",
          },
        },
        required: ["projectRoot"],
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
        required: ["projectRoot"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "lodestar_synthesize": {
      const projectRoot = args?.projectRoot as string;
      const sessionNotes = args?.sessionNotes as string | undefined;

      if (!projectRoot) {
        return {
          content: [
            { type: "text", text: JSON.stringify({ success: false, error: "projectRoot is required" }) },
          ],
        };
      }

      const result = await synthesizeContext({ projectRoot, sessionNotes });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "lodestar_load": {
      const projectRoot = args?.projectRoot as string;

      if (!projectRoot) {
        return {
          content: [
            { type: "text", text: JSON.stringify({ success: false, error: "projectRoot is required" }) },
          ],
        };
      }

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
