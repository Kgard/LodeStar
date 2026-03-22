# Lodestar — Claude Code Build Instructions

> Module 00 of the **Keelson** suite (keelson.io)  
> Titania Labs LLC — Confidential  
> Version: Phase 1a

---

## What you are building

Lodestar is an MCP server that solves **session amnesia** in Claude Code. Every Claude Code session starts cold — no memory of architectural decisions, established patterns, rejected approaches, or open questions. Lodestar synthesizes the current session into a structured `.lodestar.md` context file that loads at the next session start, giving Claude Code a warm boot.

**Phase 1a scope — the only thing being built right now:**
- `lodestar_synthesize()` — reads current session file diffs, synthesizes via LLM, writes `.lodestar.md`
- `lodestar_load()` — reads `.lodestar.md`, returns structured context for session initialization
- `lodestar init` — first-run CLI wizard: provider selection, key validation, config creation
- `lodestar review` — CLI command that opens a browser-based progressive disclosure reader for the current `.lodestar.md`

**Sequencing within Phase 1a — build in this order:**
1. `lodestar init` — prerequisite for everything else
2. `lodestar_synthesize` + `lodestar_load` — core MCP tools; must pass 10-session gate before proceeding
3. `lodestar review` — polish item built after synthesize/load are stable

**Not in scope for Phase 1a (do not build):**
- Passive background watching or automatic session-end firing (Phase 2)
- Cross-project diffing (Phase 3)
- `lodestar_diff()` drift detection (Phase 1b — next phase, not this one)
- Any persistent web server or cloud-hosted UI

If a feature idea arises that belongs to a later phase, add it to `## Future Phases` at the bottom of this file and continue. Do not implement it.

---

## Project identity

| Field | Value |
|---|---|
| Suite | Keelson (keelson.io) |
| Product | Lodestar — Module 00 |
| Tagline | "Every session remembers where you left off." |
| Revenue model | Free forever — community candy, newsletter capture |
| Primary user | Solo vibe-coding founders using Claude Code, Cursor, Windsurf, or any AI coding tool |
| Owner | Ken / Titania Labs LLC |

---

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js 20+ / TypeScript | Strict mode on |
| MCP transport | stdio | Same pattern as Pharos MCP |
| AI synthesis | Provider-agnostic via `LLMProvider` interface | Anthropic default; OpenAI and Ollama supported |
| Git integration | `simple-git` | File diff capture |
| Storage | `.lodestar.md` in project root | Version-controlled with the codebase |
| Config | `~/.lodestar.config.json` in user home dir | Provider, model, API key — set by `lodestar init` |
| Package manager | npm | `package.json` in project root |
| CLI entrypoint | `lodestar init` | First-run setup wizard — provider selection + key validation |

---

## Repository structure

```
lodestar/
├── src/
│   ├── index.ts                  ← MCP server entry point
│   ├── init.ts                   ← lodestar init CLI wizard
│   ├── synthesize.ts             ← lodestar_synthesize() implementation
│   ├── load.ts                   ← lodestar_load() implementation
│   ├── review.ts                 ← lodestar review — local HTTP server + browser open
│   ├── diff.ts                   ← lodestar_diff() STUB ONLY — Phase 1b
│   ├── git.ts                    ← Git diff utilities via simple-git
│   ├── history.ts                ← .lodestar.history/ rotation logic
│   ├── config.ts                 ← reads/writes ~/.lodestar.config.json
│   ├── schema.ts                 ← .lodestar.md types and validation
│   └── providers/
│       ├── index.ts              ← LLMProvider interface + factory
│       ├── anthropic.ts          ← Anthropic implementation (default)
│       ├── openai.ts             ← OpenAI implementation
│       └── ollama.ts             ← Ollama local implementation
├── src/reader/
│   └── template.ts               ← Self-contained HTML reader (inline string, no external deps)
├── prompts/
│   └── synthesize.md             ← The synthesis prompt (kept separate for iteration)
├── .lodestar.md                  ← Always current — committed to Git
├── .lodestar.history/            ← Local recovery only — gitignored
│   ├── 2026-03-21-14-30.md
│   ├── 2026-03-20-09-15.md
│   └── 2026-03-19-16-45.md
├── package.json
├── tsconfig.json
├── .gitignore                    ← Must include: .lodestar.history/, .env
├── .env.example                  ← Placeholder only — key stored in ~/.lodestar.config.json
└── CLAUDE.md                     ← This file
```

---

## The `.lodestar.md` schema

This is the canonical output format. Every field is required. Do not add fields without updating this schema definition.

```typescript
interface LodestarContext {
  meta: {
    project: string;       // directory name
    date: string;          // ISO 8601
    model: string;         // claude-sonnet-4-6
    sessionDuration?: string;
  };
  decisions: Array<{
    decision: string;      // what was decided
    rationale: string;     // why
    files?: string[];      // affected files
  }>;
  patterns: Array<{
    pattern: string;       // naming/structural convention
    location: string;      // where it's used in codebase
  }>;
  dependencies: Array<{
    package: string;       // npm package name
    purpose: string;       // why it was added this session
  }>;
  rejected: Array<{
    approach: string;      // what was tried
    reason: string;        // why it was rejected
  }>;
  openQuestions: Array<{
    question: string;
    blocking: boolean;
  }>;
  nextSession: string[];   // bullet list: what to load first, where to pick up
}
```

The `.lodestar.md` file renders this as structured Markdown with clear section headers — human-readable first, machine-parseable second.

---

## MCP tool contracts

### `lodestar_synthesize`

```typescript
// Input
{
  projectRoot: string;     // absolute path to project directory
  sessionNotes?: string;   // optional freeform notes from developer
}

// Output
{
  success: boolean;
  path: string;            // absolute path to written .lodestar.md
  summary: string;         // one-sentence summary of what was synthesized
  warnings?: string[];     // e.g. "No package.json changes detected"
}
```

**What it does internally:**
1. Runs `git diff HEAD` and `git status` via `simple-git` on `projectRoot`
2. Reads `package.json` for dependency changes (compares against git)
3. Passes diff + metadata to Claude API with the synthesis prompt
4. Parses Claude's response into `LodestarContext`
5. **Rotates history** — moves existing `.lodestar.md` to `.lodestar.history/YYYY-MM-DD-HH-MM.md`, prunes to 3 files max
6. Writes new `.lodestar.md` atomically (write to temp file, then rename)
7. Returns success + path + summary

**History rotation rules:**
- Before every write, if `.lodestar.md` exists: move it to `.lodestar.history/` with ISO timestamp filename
- Keep maximum 3 files in `.lodestar.history/` — delete oldest when limit exceeded
- `.lodestar.history/` is gitignored — local recovery only
- `.lodestar.md` itself is committed — version control of decisions is a feature
- History rotation lives in `src/history.ts` — keep it separate from synthesis logic

**Error handling:**
- Not a git repo → return error with clear message, do not crash
- No changes detected → return warning, write minimal context file
- Claude API failure → return error with raw message, do not write partial file, do not rotate history
- Invalid projectRoot → return error immediately
- History rotation failure → log warning to stderr, do not block the write

---

### `lodestar_load`

```typescript
// Input
{
  projectRoot: string;     // absolute path to project directory
}

// Output
{
  success: boolean;
  context: LodestarContext | null;
  summary: string;         // "Loaded context from [date]. X decisions, Y open questions."
  path: string;
  warnings?: string[];     // e.g. "Context file is 7 days old"
}
```

**What it does internally:**
1. Looks for `.lodestar.md` in `projectRoot`
2. Parses the Markdown back into `LodestarContext`
3. Returns structured context + human-readable summary

**Error handling:**
- File not found → return `success: true, context: null` with guidance message ("Run lodestar_synthesize to create context for this project")
- Parse failure → return warning with raw file content so Claude can still read it
- Do not throw — always return a usable response

---

## LLM provider abstraction

Lodestar is provider-agnostic. The synthesis step does not care which LLM generates the output — it cares that the output matches the `.lodestar.md` schema. All provider logic lives behind a single interface in `src/providers/`.

**The `LLMProvider` interface:**

```typescript
// src/providers/index.ts
interface LLMProvider {
  synthesize(prompt: string, input: string): Promise<string>;
  countTokens(text: string): Promise<number>;
  readonly name: string;        // "anthropic" | "openai" | "ollama"
  readonly defaultModel: string;
}

// Factory — reads ~/.lodestar.config.json and returns the correct provider
function getProvider(config: LodestarConfig): LLMProvider;
```

**Supported providers — Phase 1a:**

| Provider | Models | API key required | Notes |
|---|---|---|---|
| `anthropic` | `claude-sonnet-4-6` (default) | Yes — from Anthropic console | Recommended. Best structured output quality. |
| `openai` | `gpt-4o` (default) | Yes — from OpenAI platform | Full support. Prompt tested against GPT-4o. |
| `ollama` | `llama3.2`, `mistral`, etc. | No — local only | No API cost. Output quality varies by model. Requires Ollama running locally. |

**User config file — `~/.lodestar.config.json`:**

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-6",
  "apiKey": "sk-ant-...",
  "ollamaHost": "http://localhost:11434"
}
```

- Stored in the user's home directory — never in the project repo
- Written by `lodestar init` — never edited manually by the user
- `apiKey` is omitted for the `ollama` provider
- `ollamaHost` is only present when provider is `ollama`

**Important:** The synthesis prompt in `prompts/synthesize.md` is identical across all providers. Do not write provider-specific prompts. If a provider produces inconsistent output, fix the prompt — not by branching per provider.

---

## `lodestar init` — setup wizard

`lodestar init` is a CLI command (not an MCP tool) that runs once on first install. It handles provider selection, API key acquisition, key validation, and config file creation. It is the only way users should configure Lodestar — do not document manual config editing.

**Invocation:**
```bash
npx lodestar init
# or after global install:
lodestar init
```

**Full wizard flow:**

```
╔═══════════════════════════════════════════╗
║  Lodestar — Keelson Module 00             ║
║  First-run setup                          ║
╚═══════════════════════════════════════════╝

Which AI provider do you use for coding?

  1  Anthropic (Claude) — recommended
  2  OpenAI (GPT-4o, o3)
  3  Ollama (local — no API key needed)

> _
```

**If user selects Anthropic (1):**
```
Do you have an Anthropic API key?

  1  Yes — I'll paste it now
  2  No — open the Anthropic console for me

> 2

Opening https://console.anthropic.com/keys ...
(browser opens)

Once you've created a key, paste it here:
> sk-ant-...

Validating key... ✓
✓ Config saved to ~/.lodestar.config.json

```

**If user selects OpenAI (2):**
```
Do you have an OpenAI API key?

  1  Yes — I'll paste it now
  2  No — open the OpenAI platform for me

> 2

Opening https://platform.openai.com/api-keys ...
(browser opens)

Once you've created a key, paste it here:
> sk-...

Validating key... ✓
✓ Config saved to ~/.lodestar.config.json

```

**If user selects Ollama (3):**
```
Ollama runs locally — no API key needed.

Is Ollama already installed?

  1  Yes — it's running on localhost:11434
  2  No — open the Ollama install page for me

> 2

Opening https://ollama.ai/download ...
(browser opens)

Once installed, run: ollama pull llama3.2
Then press Enter to continue...
>

Checking Ollama connection... ✓
✓ Config saved to ~/.lodestar.config.json

```

**Shared completion for all providers:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Lodestar is ready.

Add it to your AI coding tool:

Claude Desktop — add to mcp.json:
{
  "mcpServers": {
    "lodestar": {
      "command": "node",
      "args": ["/path/to/lodestar/dist/index.js"]
    }
  }
}

Cursor / Windsurf — add to .cursor/mcp.json or .codeium/mcp.json:
(same format as above)

At the end of any session, run:
  lodestar_synthesize({ projectRoot: "/path/to/your/project" })

At the start of any session, run:
  lodestar_load({ projectRoot: "/path/to/your/project" })

Sign up for Keelson updates: keelson.io
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Key validation logic (all providers):**
- Anthropic: make a minimal API call (`messages.create` with 1 token max) — if it returns without auth error, key is valid
- OpenAI: same — minimal `chat.completions.create` call
- Ollama: HTTP GET to `{ollamaHost}/api/tags` — if it returns 200, connection is valid
- On validation failure: show the specific error, offer to re-enter the key, do not exit
- Never log the API key to stderr or stdout

**Implementation notes:**
- Use `open` npm package to open URLs in the default browser cross-platform
- Use `readline` or `@inquirer/prompts` for interactive CLI input
- `lodestar init` is a separate binary entrypoint — not part of the MCP server
- Add `"bin": { "lodestar": "./dist/init.js" }` to `package.json`
- Re-running `lodestar init` overwrites existing config after confirmation prompt

---

## The synthesis prompt

The synthesis prompt lives in `prompts/synthesize.md`. It is the most important piece of the entire system — the quality of `.lodestar.md` depends entirely on this prompt. Keep it separate from code so it can be iterated without a build step.

**Prompt principles:**
- Ask the model to be a thoughtful senior developer documenting a handoff, not a diff summariser
- Explicitly instruct: extract *decisions and rationale*, not just *what changed*
- Explicitly instruct: flag *rejected approaches* — these are as valuable as accepted ones
- Keep output structured to match the `LodestarContext` schema exactly
- Include a `nextSession` section: "If you were opening this project cold tomorrow, what are the three things you'd want to know first?"
- Output must be valid Markdown that also parses back into `LodestarContext`
- The prompt is identical for all providers — do not branch per provider

**Prompt template inputs:**
```
{{git_diff}}         ← output of git diff HEAD
{{git_status}}       ← output of git status
{{package_changes}}  ← new/removed/updated packages
{{session_notes}}    ← optional developer notes
{{project_name}}     ← directory name
{{existing_context}} ← contents of existing .lodestar.md if present
```

---

## MCP server setup

The server uses stdio transport. Entry point is `src/index.ts`. The API key is **not** passed via `mcp.json` — it is read from `~/.lodestar.config.json` at runtime, set by `lodestar init`.

```typescript
// src/index.ts — structure only, implement fully
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server(
  { name: "lodestar", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// Register tools: lodestar_synthesize, lodestar_load
// lodestar_diff: register as STUB returning { error: "Phase 1b — not yet implemented" }

const transport = new StdioServerTransport();
await server.connect(transport);
```

**MCP config — same format for all supported AI coding tools:**

```json
{
  "mcpServers": {
    "lodestar": {
      "command": "node",
      "args": ["/absolute/path/to/lodestar/dist/index.js"]
    }
  }
}
```

| Tool | Config file location |
|---|---|
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) |
| Cursor | `.cursor/mcp.json` in project root, or global `~/.cursor/mcp.json` |
| Windsurf | `.codeium/windsurf/mcp_config.json` |

`lodestar init` outputs the correct snippet for the user's tool at setup completion. Do not require the user to find this file themselves.

---

## Configuration

API keys and provider settings live in `~/.lodestar.config.json` — set by `lodestar init`, never edited manually.

```json
// ~/.lodestar.config.json — example for each provider

// Anthropic
{ "provider": "anthropic", "model": "claude-sonnet-4-6", "apiKey": "sk-ant-..." }

// OpenAI
{ "provider": "openai", "model": "gpt-4o", "apiKey": "sk-..." }

// Ollama (no key)
{ "provider": "ollama", "model": "llama3.2", "ollamaHost": "http://localhost:11434" }
```

**Rules:**
- Config file is in user home — never in a project repo, never committed
- `.env` files are not used in production — `lodestar init` replaces them
- For development/testing only, a local `.env` with `ANTHROPIC_API_KEY` may be used as a fallback
- `src/config.ts` handles reading the config file with graceful errors if it doesn't exist yet (guides user to run `lodestar init`)

---

## TypeScript config

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Coding conventions

**Always:**
- TypeScript strict mode — no `any`, no implicit `undefined`
- Every function has an explicit return type
- Every error path returns a structured error response — never throw to the MCP layer
- All file paths are resolved to absolute before use (`path.resolve()`)
- Log meaningful messages to `stderr` (MCP uses stdout — never `console.log`)
- Use `async/await` throughout — no callbacks, no `.then()` chains

**Never:**
- No `console.log` — use `console.error` for debug output (stdout is MCP wire)
- No global state — tools are stateless; all context passed as arguments
- No partial writes — write `.lodestar.md` atomically (write to temp, rename)
- No silent failures — every catch block either returns an error response or rethrows intentionally

**Naming:**
- Files: `kebab-case.ts`
- Functions/variables: `camelCase`
- Types/interfaces: `PascalCase`
- Constants: `SCREAMING_SNAKE_CASE`
- MCP tool names: `lodestar_snake_case`

---

## `lodestar review` — web reader

`lodestar review` opens a browser-based progressive disclosure reader for the current project's `.lodestar.md`. It is the primary human-facing surface of Lodestar — the thing a user looks at to understand what happened in the last session before starting a new one. It is also the community candy screenshot: the thing people share.

**Invocation:**
```bash
lodestar review                              # reads .lodestar.md in current directory
lodestar review --project /path/to/project  # explicit project path
lodestar review --diff                      # shows changes vs. previous session
```

---

### Server lifecycle

`lodestar review` is a short-lived local HTTP server. It does not run persistently.

```
1. Find a random available port (prefer 7357, fallback to any open port)
2. Spin up a Node.js http server on localhost:{port}
3. Open http://localhost:{port} in the default browser via `open` package
4. Serve the self-contained HTML reader page (single response, no file watching)
5. Print to terminal: "Lodestar reader open at http://localhost:{port} — press Ctrl+C to close"
6. Auto-shutdown after 10 minutes idle (no browser requests)
7. Shutdown cleanly on Ctrl+C
```

**Rules:**
- Single-use server — not a dev server, not a file watcher
- No WebSocket, no SSE, no live reload
- The HTML page is fully self-contained — served as a single string from `src/reader/template.ts`
- No external CDN calls from the served page — everything inline
- Works offline

---

### Progressive disclosure — three levels

The reader presents the `.lodestar.md` context at three levels of depth. The user controls what they expand. The goal: **understand the session in 5 seconds at Level 1, reconstruct full context in 2 minutes at Level 3.**

```
╔══════════════════════════════════════════════════════════╗
║  LEVEL 1 — Always visible (zero cognitive load)          ║
╠══════════════════════════════════════════════════════════╣
║  ⭐ Lodestar  •  [project name]                          ║
║  Session: [date]  •  [model]                             ║
║                                                          ║
║  [One-sentence session summary]                          ║
║                                                          ║
║  ┌──────────┬──────────┬──────────┬──────────┐          ║
║  │ 4        │ 2        │ 3        │ 1        │          ║
║  │ Decisions│ Patterns │ Deps     │ Questions│          ║
║  └──────────┴──────────┴──────────┴──────────┘          ║
║                                                          ║
║  Next session: [first bullet from nextSession[]]  ▼      ║
╚══════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════╗
║  LEVEL 2 — Expand on click (moderate interest)           ║
╠══════════════════════════════════════════════════════════╣
║  ▼ DECISIONS                                             ║
║    • [decision title] — [rationale]          [files ▶]  ║
║    • [decision title] — [rationale]          [files ▶]  ║
║                                                          ║
║  ▼ OPEN QUESTIONS                                        ║
║    • [question]                         [blocking: yes]  ║
║    • [question]                         [blocking: no]   ║
║                                                          ║
║  ▼ NEXT SESSION BRIEFING                                 ║
║    • [bullet 1]                                          ║
║    • [bullet 2]                                          ║
║    • [bullet 3]                                          ║
╚══════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════╗
║  LEVEL 3 — Deep drill (active investigation)             ║
╠══════════════════════════════════════════════════════════╣
║  ▼ PATTERNS                                              ║
║    • [pattern] → [file location]                         ║
║                                                          ║
║  ▼ DEPENDENCIES                                          ║
║    • [package] — added for: [purpose]                    ║
║                                                          ║
║  ▼ REJECTED APPROACHES                                   ║
║    • [approach] — rejected because: [reason]             ║
╚══════════════════════════════════════════════════════════╝
```

**Disclosure rules:**
- Level 1 is always visible — never collapsible
- Level 2 sections are collapsed by default, expand on click
- Level 3 sections are collapsed by default, nested inside Level 2 where relevant
- State persists within the session (expand once, stays expanded on scroll)
- Each section header shows a count badge when collapsed: `DECISIONS (4)`
- Blocking open questions get a visual warning indicator — they cannot be missed
- The `nextSession` bullets are always at Level 1 — they are the most important single piece of context

---

### Diff view — `--diff` flag

When `--diff` is passed and a `.lodestar.history/` file exists, the reader shows a **changes panel** above the main content:

```
╔══════════════════════════════════════════════════════════╗
║  CHANGES SINCE LAST SESSION  •  2 days ago               ║
╠══════════════════════════════════════════════════════════╣
║  + 2 new decisions                                       ║
║  + 1 new dependency (simple-git)                         ║
║  ~ 1 decision updated (auth approach changed)            ║
║  - 1 open question resolved (DB schema — no longer open) ║
╚══════════════════════════════════════════════════════════╝
```

**Diff rules:**
- Compare current `.lodestar.md` against most recent `.lodestar.history/` file
- Additions shown in green `+`
- Modifications shown in amber `~`
- Removals shown in muted red `-`
- Diff panel is Level 1 visibility — always shown when `--diff` is passed
- No diff panel if no history file exists — show a subtle note: "No previous session to compare"

---

### UI design principles

- **No external dependencies** — the served HTML is a self-contained string in `src/reader/template.ts`. No CDN imports, no Google Fonts, no external JS. The reader must work completely offline.
- **System fonts** — use `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`. Do not import fonts.
- **Keelson color palette** — deep navy `#1B2C4A` for headers, nautical teal `#1A6B72` for accents, brass `#C8A84B` for the Lodestar mark and section badges, warm white `#F8F9FA` background.
- **Dark mode aware** — use `prefers-color-scheme: dark` media query. Dark background: `#0D1117`, dark surface: `#161B22`.
- **Readable at a glance** — minimum 16px body text, generous line height (1.6), clear section separation.
- **One interaction per element** — click to expand/collapse. No hover-only states. No tooltips required to understand the UI.
- **Mobile-capable** — the reader may be viewed on a phone. Max-width container (760px), responsive at 375px minimum.
- **Keelson footer** — every reader page includes a subtle footer: `Lodestar · Keelson Module 00 · keelson.io`. This is the community candy brand impression.

---

### Implementation notes

```typescript
// src/review.ts — structure only

import http from 'http';
import { AddressInfo } from 'net';
import open from 'open';
import { readLodestarContext } from './load.js';
import { readHistoryContext } from './history.js';
import { renderReaderHTML } from './reader/template.js';

export async function runReview(options: {
  projectRoot: string;
  showDiff: boolean;
}): Promise<void> {
  const context = await readLodestarContext(options.projectRoot);
  const historyContext = options.showDiff
    ? await readHistoryContext(options.projectRoot, 1)  // most recent history file
    : null;

  const html = renderReaderHTML(context, historyContext);

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  // Find available port, prefer 7357
  server.listen(0, '127.0.0.1', async () => {
    const { port } = server.address() as AddressInfo;
    console.error(`Lodestar reader open at http://localhost:${port} — press Ctrl+C to close`);
    await open(`http://localhost:${port}`);
  });

  // Auto-shutdown after 10 minutes idle
  const timeout = setTimeout(() => {
    console.error('Lodestar reader: idle timeout, shutting down.');
    server.close();
    process.exit(0);
  }, 10 * 60 * 1000);

  process.on('SIGINT', () => {
    clearTimeout(timeout);
    server.close();
    process.exit(0);
  });
}
```

```typescript
// src/reader/template.ts — structure only
// Returns a complete, self-contained HTML string
// All CSS and JS is inline — no external imports

export function renderReaderHTML(
  context: LodestarContext | null,
  historyContext: LodestarContext | null
): string {
  // Returns full HTML document as a string
  // CSS variables map to Keelson palette
  // JS handles accordion expand/collapse — vanilla only, no framework
  // Diff panel rendered only when historyContext is not null
}
```

---

### `bin` update — add review to CLI

```json
{
  "bin": {
    "lodestar": "./dist/init.js",
    "lodestar-review": "./dist/review.js"
  }
}
```

Or handle as a subcommand within the main `lodestar` binary using argv parsing — `lodestar review` dispatches to `runReview()`. Prefer the single binary approach: cleaner for the user.

---

## Build and run

```bash
# Install
npm install

# First-time setup (users run this once)
lodestar init

# Build
npm run build        # tsc → dist/

# Dev (watch)
npm run dev          # tsc --watch

# Test MCP server manually
node dist/index.js   # send MCP messages via stdin

# Open the web reader for a project
lodestar review
lodestar review --project /path/to/project
lodestar review --diff   # shows changes vs. previous session
```

**Required npm packages:**
```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "latest",
    "openai": "latest",
    "@modelcontextprotocol/sdk": "latest",
    "simple-git": "latest",
    "open": "latest",
    "@inquirer/prompts": "latest"
  },
  "devDependencies": {
    "typescript": "latest",
    "@types/node": "latest"
  },
  "bin": {
    "lodestar": "./dist/init.js"
  }
}
```

Note: `http` is a Node.js built-in — no extra package needed for the review server. Port detection uses `server.listen(0)` (OS assigns a free port) with a preference fallback to 7357 handled in `review.ts`.

---

## Phase gates

**Do not build `lodestar review` until:**
- [ ] `lodestar_synthesize` produces clean `.lodestar.md` in 10 consecutive personal sessions
- [ ] `lodestar_load` returns clean context with no manual editing required

**Do not move to Phase 1b until all of the above plus:**
- [ ] `lodestar review` opens cleanly and renders all three disclosure levels correctly
- [ ] Session ramp time reduced by >50% (measured subjectively by Ken)
- [ ] No provider API errors in normal operation
- [ ] MCP tools registered and callable from Claude Desktop
- [ ] `lodestar review --diff` renders a meaningful changes panel when history exists

**Phase 1b adds (do not implement now):**
- `lodestar_diff({ projectRoot, referenceDoc })` — compares current `.lodestar.md` against a brief or prior context file; returns contradiction list

---

## Product boundaries — critical

Lodestar's scope is **session state only**. It must not drift into adjacent product territory:

| This belongs to Lodestar | This belongs elsewhere |
|---|---|
| What was decided in this session | What the product is supposed to be (→ Vela) |
| What patterns are established in this codebase | Historical design decisions across archived projects (→ Pharos) |
| What dependencies were added this session | Security analysis of the codebase (→ Kite) |
| What was rejected and why | Design-to-code handoffs (→ Shuffle) |

If a feature request touches Vela's domain (product intent, brief generation), Pharos's domain (archive search, historical retrieval), or Kite's domain (security scanning) — **stop and flag it**. Do not implement it as a Lodestar feature.

---

## Context for cold starts

You are building the first module of Keelson — a suite of tools for solo founders and first-time app builders. Lodestar is free forever. Its job is to build trust and audience for the suite, not to generate revenue itself. The `.lodestar.md` file it produces should be something a developer looks at and thinks "this is exactly what I needed to remember" — not a git log summary, not a diff report. A handoff note from a thoughtful colleague who watched the whole session.

The synthesis prompt is the core product. Get that right before optimising anything else.

---

## Decisions — locked

These were open questions. They are now decided. Do not reopen them.

- [x] **`.lodestar.md` committed or gitignored?**  
  **Committed.** Version control of decisions is a feature, not a side effect. Every project that uses Lodestar should have its decision history in Git. Add `.lodestar.history/` to `.gitignore` — that directory is local recovery only.

- [x] **Replace or append on re-synthesis?**  
  **Replace with shallow history rotation.** `.lodestar.md` is always overwritten with the current session's context — one clean file, always current, easy to load. Before overwriting, the previous file is moved to `.lodestar.history/YYYY-MM-DD-HH-MM.md`. Maximum 3 history files kept; oldest pruned automatically. History is gitignored. This gives clean cold-start loading, a recovery path if synthesis produces noise, and no accumulated log pollution.  
  Append was rejected: appended files degrade into session logs that require parsing to determine current truth. Merge was rejected: Phase 2 complexity, wrong phase.

- [x] **Maximum diff size / token budget for the LLM call?**  
  Cap the combined input (git diff + status + package changes + session notes) at **6,000 tokens** before sending to the provider. If the diff exceeds this, truncate `git diff` to the most recently modified files first, then log a warning in the synthesis output noting truncation. Do not silently truncate — always surface it. For Anthropic and OpenAI, use the SDK's token counting utility. For Ollama, estimate at 4 characters per token as a fallback.

- [x] **Provider-agnostic or Anthropic-only?**  
  **Provider-agnostic.** Lodestar is community candy for the full vibe-coding audience — Claude Code, Cursor, Windsurf, and any AI coding tool. Locking to Anthropic would exclude users who don't have an Anthropic API key, costing newsletter signups and Keelson audience growth. The `LLMProvider` interface abstracts the synthesis call. Anthropic ships as the default and recommended provider. OpenAI and Ollama ship as alternatives. The synthesis prompt is identical across all providers.

- [x] **How does the user configure their API key?**  
  **Via `lodestar init` wizard — not via `.env` or manual file editing.** The key is stored in `~/.lodestar.config.json` in the user's home directory. It is never stored in a project repo, never passed via `mcp.json env` block, and never handled via `.env` files in production. The init wizard validates the key before saving and opens the provider's console in the browser if the user doesn't have one yet.

- [x] **Does Lodestar cost Ken anything when users run synthesis?**  
  **No.** Lodestar runs entirely on the user's machine using their own API key. Ken pays nothing per synthesis. The user's API cost per synthesis is approximately $0.01–0.05 — negligible alongside the cost of a full AI coding session. For Ollama users, the cost is zero. This model scales to any number of users at zero marginal cost to Titania Labs.

---

## Future phases (do not build now)

**Phase 1b:**
- `lodestar_diff()` — drift detection against a reference brief or prior context

**Phase 2:**
- Passive background agent — watches session automatically, fires at session end
- No explicit `lodestar_synthesize` command required

**Phase 3:**
- Cross-project pattern diffing — compare `.lodestar.md` files across multiple projects
- Surface recurring patterns, repeated mistakes, architectural inconsistencies

**Keelson suite integration (paid tier):**
- Accept Vela brief output as drift reference
- Surface Kite scan history in session context
- Cross-module awareness for paid Keelson members

---

*Lodestar — Keelson Module 00 — Titania Labs LLC*  
*keelson.io — Free forever*
