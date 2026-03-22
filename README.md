# Lodestar

**Every session remembers where you left off.**

Lodestar solves session amnesia in AI coding tools. Every time you start a new session in Claude Code, Cursor, Windsurf, or any AI coding tool, your assistant starts cold — no memory of what was decided, what patterns were established, what was tried and rejected, or where you left off.

Lodestar synthesizes your coding session into a structured `.lodestar.md` file that lives in your project. The next time you (or your AI) open the project, that context is right there — decisions, patterns, dependencies, rejected approaches, and exactly where to pick up.

> Module 00 of the [Keelson](https://keelson.io) suite by Titania Labs LLC
> Free forever.

---

## What it does

**At the end of a session:**
```
lodestar synthesize
```
Lodestar reads your git diff, analyzes what changed, and uses AI to extract the *decisions and rationale* — not just what changed, but *why*. It writes a `.lodestar.md` file in your project root.

**At the start of a session:**
```
lodestar load
```
Returns the structured context from your last session. Your AI assistant can read this to warm-start instead of starting cold.

Your AI can also call these directly — Lodestar runs as an MCP server, so Claude Code, Cursor, and Windsurf can invoke `lodestar_synthesize` and `lodestar_load` as tools. Just tell your AI:

> "lodestar load"

or

> "lodestar synthesize"

No path or arguments needed — it defaults to the current project.

---

## What `.lodestar.md` looks like

Lodestar doesn't produce a git log summary. It produces a handoff note — the kind a thoughtful colleague would write after watching your entire session:

```markdown
# Lodestar Context

> Project: my-app
> Date: 2026-03-21
> Model: claude-sonnet-4-6

## Decisions

### Switched from REST to tRPC for the API layer

**Rationale:** Type safety end-to-end without code generation. The app is small
enough that tRPC's simplicity outweighs REST's ecosystem advantages.
**Files:** src/server/api/, src/client/trpc.ts

### Added Drizzle ORM instead of Prisma

**Rationale:** Prisma's cold start time was adding 2-3s to serverless function
invocations. Drizzle has no binary dependency and starts instantly.
**Files:** src/db/schema.ts, drizzle.config.ts

## Patterns

- **All API routes use tRPC routers** — src/server/api/routers/
- **Database schema defined in single file** — src/db/schema.ts

## Dependencies

- **drizzle-orm** — SQL toolkit, replaced Prisma for faster cold starts
- **@trpc/server** — End-to-end typesafe API layer

## Rejected Approaches

### Prisma ORM

**Reason:** Binary dependency caused 2-3s cold starts on Vercel serverless.
Tried @prisma/accelerate but it added complexity without solving the root issue.

## Open Questions

- [BLOCKING] Should we use Drizzle's push or migrate workflow for production?
- [non-blocking] Consider adding tRPC panel for API debugging in dev

## Next Session

- Wire up the auth middleware in src/server/api/trpc.ts — it's stubbed but not connected
- The Drizzle schema in src/db/schema.ts needs the users table added
- Run the tRPC + Drizzle integration test before adding more routes
```

This file is committed to your repo. Your decisions become part of your project history.

---

## Requirements

- **Node.js 20+**
- **Git** — your project must be a git repository
- **An AI provider account** (one of):
  - [Anthropic](https://console.anthropic.com) (recommended)
  - [OpenAI](https://platform.openai.com)
  - [Ollama](https://ollama.ai) (free, local, no API key needed)

---

## Installation

### From source (recommended for now)

```bash
git clone https://github.com/Kgard/LodeStar.git
cd LodeStar
npm install
npm run build
npm link
```

This makes the `lodestar` command available globally on your machine.

### Verify installation

```bash
lodestar help
```

---

## Setup

Run the setup wizard once:

```bash
lodestar init
```

The wizard will:

1. **Ask which AI provider you use** — Anthropic (recommended), OpenAI, or Ollama
2. **Walk you through API key setup** — opens your provider's console in the browser if you need a key
3. **Validate your key** — makes a test API call to confirm it works
4. **Auto-configure your coding tools** — detects Claude Desktop, Claude Code, Cursor, and Windsurf on your machine and adds Lodestar's MCP server entry to their config files automatically
5. **Offer to synthesize your first project** — if you have an active project, Lodestar will run synthesis right away so you can see it in action

That's it. No `.env` files to manage, no manual config editing. Your API key is stored in `~/.lodestar.config.json` — never in your project repo.

### Re-running setup

```bash
lodestar init
```

If you already have a config, Lodestar will detect it and give you two options:

- **Keep current config** — skips API key setup, goes straight to tool integration and first-project synthesis
- **Switch provider or update API key** — if you pick the same provider, your existing key is reused automatically; only asks for a new key if you're switching providers

---

## Usage

### From the command line

Lodestar works from any git project directory. `[path]` is not required if you are in the project directory.

```bash
# Navigate to your project
cd ~/my-project

# At the end of a session — synthesize what happened
lodestar synthesize

# At the start of a session — load previous context
lodestar load
```

You can also specify a path from anywhere:

```bash
lodestar synthesize ~/my-project
lodestar load ~/my-project
```

`lodestar sync` is an alias for `lodestar synthesize`.

### From your AI coding tool

If you ran `lodestar init` and selected your coding tools, the MCP server is already configured. Just tell your AI in natural language:

**Starting a session:**
> "lodestar load"

> "Load the lodestar context"

> "What did we work on last session?"

**Ending a session:**
> "lodestar synthesize"

> "Synthesize this session with lodestar"

> "Save the session context"

No path or arguments needed — the MCP tools default to the current working directory. Your AI calls `lodestar_load` or `lodestar_synthesize` behind the scenes.

**First time on a project?** Lodestar detects when there's no existing `.lodestar.md` and gives a friendlier message:

```
First synthesis for /Users/you/my-app — capturing current project state ...
✓ Synthesized 8 decisions for my-app
```

### Manual MCP configuration

If `lodestar init` didn't auto-configure your tool, or you're using a different tool, add this to your MCP config:

```json
{
  "mcpServers": {
    "lodestar": {
      "command": "node",
      "args": ["/path/to/LodeStar/dist/index.js"]
    }
  }
}
```

Replace `/path/to/LodeStar` with the actual path where you cloned the repo.

| Tool | Config file |
|---|---|
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Code | `~/.claude/mcp.json` |
| Cursor | `~/.cursor/mcp.json` or `.cursor/mcp.json` in project |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |

---

## How it works

### Synthesize

1. Captures `git diff HEAD` and `git status` from your project
2. Detects `package.json` changes (new/removed dependencies)
3. Sends the diff + metadata to your configured AI provider with a carefully crafted synthesis prompt
4. The AI extracts decisions, patterns, dependencies, rejected approaches, and open questions
5. If a `.lodestar.md` already exists, it's moved to `.lodestar.history/` before being replaced
6. The new `.lodestar.md` is written atomically to your project root

### Load

1. Reads `.lodestar.md` from your project root
2. Parses it back into structured context
3. Returns the context with a human-readable summary

### History

Every time you synthesize, the previous `.lodestar.md` is saved to `.lodestar.history/` with a timestamp:

```
.lodestar.history/
  2026-03-21-14-30.md
  2026-03-20-09-15.md
  2026-03-19-16-45.md
```

Only the last 3 files are kept. Older files are pruned automatically. The history directory is gitignored — it's for local recovery only. The current `.lodestar.md` is committed to git.

### Token budget

The combined input to the AI is capped at 6,000 tokens. If your git diff is too large, Lodestar truncates it (most recent changes first) and surfaces a warning. It never silently drops context.

---

## Supported providers

| Provider | Default model | API key | Cost per synthesis |
|---|---|---|---|
| Anthropic | `claude-sonnet-4-6` | Required | ~$0.01–0.05 |
| OpenAI | `gpt-4o` | Required | ~$0.01–0.05 |
| Ollama | `llama3.2` | Not needed | Free (runs locally) |

The synthesis prompt is identical across all providers. Anthropic is recommended for best structured output quality.

All costs are paid by you using your own API key. Lodestar has no server, no telemetry, and no usage fees.

---

## Project structure

```
your-project/
  .lodestar.md              ← Committed — your session context
  .lodestar.history/        ← Gitignored — local recovery only
```

Lodestar itself is installed separately. It doesn't add any code to your project — just the context file.

---

## FAQ

**Do I need to install Lodestar in every project?**
No. Install it once, run it against any git project.

**Does `.lodestar.md` go in `.gitignore`?**
No — commit it. Version control of your decisions is a feature. The `.lodestar.history/` directory is gitignored automatically.

**What if I don't have an API key?**
Use Ollama. It runs locally, it's free, and Lodestar supports it out of the box. Run `lodestar init` and select Ollama.

**What does it cost?**
Lodestar is free. The AI API call costs ~$0.01–0.05 per synthesis using your own key. Ollama is completely free.

**Does it work with [my AI coding tool]?**
If your tool supports MCP servers via stdio transport, yes. `lodestar init` auto-configures Claude Desktop, Claude Code, Cursor, and Windsurf. For other tools, add the MCP server entry manually.

**What if my diff is huge?**
Lodestar caps input at 6,000 tokens and truncates the diff with a warning. It prioritizes the most recent changes.

**Do I need to pass a path every time?**
No. If you're in your project directory, just run `lodestar synthesize` or `lodestar load` — no arguments needed. Same when talking to your AI: just say "lodestar load".

**What happens the first time I run it on a project?**
Lodestar detects there's no existing `.lodestar.md` and captures the current state of the project. The `lodestar init` wizard also offers to synthesize your first project right after setup.

**What if I enter a wrong path during setup?**
Lodestar will tell you the path doesn't exist and let you try again — it won't kick you out of the wizard.

---

## Roadmap

- **Phase 1a** (current) — `lodestar synthesize` + `lodestar load`
- **Phase 1b** — `lodestar diff` — drift detection against a reference brief
- **Phase 2** — Automatic session-end synthesis (no manual command needed)
- **Phase 3** — Cross-project pattern analysis

---

## License

Proprietary — Titania Labs LLC

---

*Lodestar is Module 00 of the [Keelson](https://keelson.io) suite. Free forever.*
