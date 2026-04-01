# Lodestar — Claude Code Build Instructions

> Module 00 of the **Kylex** suite (kylex.io)  
> Titania Labs LLC — Confidential  
> Version: Phase 1a

---

## What you are building

Lodestar is an MCP server that solves **flow state continuity** for AI-assisted development. Every AI coding session starts cold — no memory of architectural decisions, established patterns, rejected approaches, or open questions. The code is always saved. The thinking behind it isn't. Lodestar synthesizes the current session into a structured `.lodestar.md` context file committed to the project repo, giving any AI coding tool a warm start grounded in decisions and reasoning — not just diffs.

**This is not a Claude Code feature. It is a codebase feature. It works with Claude Code, Cursor, Windsurf, or any AI coding tool.**

**Phase 1a scope — the only thing being built right now:**
- `lodestar_synthesize()` — reads current session file diffs, synthesizes via LLM, writes `.lodestar.md`
- `lodestar_load()` — reads `.lodestar.md`, returns structured context for session initialization
- `lodestar init` — first-run CLI wizard: provider selection, key validation, config creation, optional SessionStart hook setup
- `lodestar review` — CLI command that opens a browser-based progressive disclosure reader for the current `.lodestar.md`
- **Terminal summary** — distilled 5-line session briefing printed automatically at session start via SessionStart hook (configured during `lodestar init`)

**Sequencing within Phase 1a — build in this order:**
1. `lodestar init` — prerequisite for everything else; includes terminal summary hook setup
2. `lodestar_synthesize` + `lodestar_load` — core MCP tools; must pass 10-session gate before proceeding
3. Terminal summary hook — low effort, high impact; build alongside or immediately after init
4. `lodestar review` — polish item built after synthesize/load are stable

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
| Suite | Kylex (kylex.io) |
| Product | Lodestar — Module 00 |
| Tagline | "Every session remembers where you left off." |
| Revenue model | Free tier: BYOK, single-project, manual CLI — community candy, newsletter capture. Pro tier: $9.99/month — Kylex-hosted synthesis, mid-session checkpoints, session diff, 30-day history, 200 calls/month included. |
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
│   ├── summary.ts                ← terminal summary — distilled context for SessionStart hook
│   ├── diff.ts                   ← lodestar_diff() STUB ONLY — Phase 1b
│   ├── git.ts                    ← Git diff utilities via simple-git
│   ├── history.ts                ← .lodestar.history/ rotation logic
│   ├── config.ts                 ← reads/writes ~/.lodestar.config.json
│   ├── schema.ts                 ← .lodestar.md types and validation
│   └── providers/
│       ├── index.ts              ← LLMProvider interface + factory
│       ├── anthropic.ts          ← Anthropic implementation (default)
│       ├── openai.ts             ← OpenAI implementation
│       ├── ollama.ts             ← Ollama local implementation
│       └── kylex.ts              ← KylexHostedProvider — routes to hosted synthesis proxy (Phase 1b)
│   ├── auth.ts                   ← JWT token validation for Pro tier (Phase 1b)
│   ├── checkpoint.ts             ← lodestar_checkpoint() MCP tool (Phase 1b)
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

### `lodestar_checkpoint`

**Phase 1b — Pro tier only. Requires valid Kylex Pro token.**

```typescript
// Input
{
  projectRoot: string;     // absolute path to project directory
  note?: string;           // optional developer note for this checkpoint
}

// Output
{
  success: boolean;
  context: Partial<LodestarContext>;  // in-memory only — does NOT write .lodestar.md
  summary: string;         // "Checkpoint: X decisions captured, Y files changed so far"
  warnings?: string[];
}
```

**What it does internally:**
1. Runs `git diff HEAD` on `projectRoot` (partial diff — session in progress)
2. Routes to KylexHostedProvider (Haiku 4.5) — validates Pro token first
3. Returns partial `LodestarContext` — in-memory only
4. Does NOT rotate history. Does NOT write `.lodestar.md`.
5. Output is surfaced in `lodestar review` as an "in-progress" overlay above the committed context

**Error handling:**
- No Pro token → return structured error: `{ success: false, error: "lodestar_checkpoint requires Kylex Pro — kylex.io" }`
- Token expired → same structured error with renewal prompt
- No git repo → return error with clear message
- Never crash the MCP server — always return a structured response

---

**Portability — how `.lodestar.md` works across machines and tools:**

`lodestar_load` reads from the **local filesystem only**. It requires the binary to be installed and the MCP server to be running. This is the primary path for CLI users.

However, because `.lodestar.md` is committed to Git on every synthesis, portability is already solved by the Git layer — no additional infrastructure needed:

| Scenario | Path |
|---|---|
| Different machine, Lodestar CLI installed | `git pull` → `lodestar_load` reads local `.lodestar.md` — zero friction |
| Different machine, no Lodestar CLI | `git pull` → open `.lodestar.md` → copy raw content → paste into chat |
| Claude.ai web app or any web-based AI tool | GitHub repo → `.lodestar.md` → Raw button → copy URL → paste into chat — Claude fetches the content directly |

**The raw URL pattern (document in README):**
```
https://raw.githubusercontent.com/{user}/{repo}/main/.lodestar.md
```
This URL works for any AI tool that can fetch a URL. For private repos, the user needs a GitHub personal access token, but the pattern is identical.

**`lodestar review` implication:** The review reader must display the raw GitHub URL for the current `.lodestar.md` at the bottom of the page — formatted as a copyable link. This is the escape hatch for web app users. It requires the repo's remote URL to be read from `git remote get-url origin` and formatted accordingly. If the repo has no remote, omit this section gracefully.

---

## Terminal summary

The terminal summary is a distilled 5-line briefing printed automatically at session start via a Claude Code `SessionStart` hook. It is the **momentum layer** — fast, frictionless, zero interaction required. The browser reader (`lodestar review`) is the **depth layer** — for active investigation when something needs fuller context.

**Two surfaces, two jobs — do not conflate them:**

| Surface | Trigger | Job | Depth |
|---|---|---|---|
| Terminal summary | Automatic — SessionStart hook | Reorient in 10 seconds | Shallow |
| `lodestar review` | Manual — user runs command | Reconstruct full context | Deep |

**Terminal summary output format:**

```
═══════════════════════════════════════════════
  Lodestar  ·  [project name]  ·  [X days ago]
═══════════════════════════════════════════════
  Where you left off:
  → [nextSession bullet 1]
  → [nextSession bullet 2]
  → [nextSession bullet 3]

  Last rejected: [most recent rejected.approach] — [reason]

  [N] blocking question(s): [first blocking question text]
═══════════════════════════════════════════════
  Full session context → lodestar review
═══════════════════════════════════════════════
```

**Rules:**
- Print to stderr — MCP uses stdout, terminal output must never pollute the MCP wire
- If no `.lodestar.md` exists: print a single quiet line — "No Lodestar context yet. Run lodestar save at the end of this session."
- If context file is older than 7 days: append a subtle note — "Context is X days old"
- Never print the full `.lodestar.md` — the terminal is the 10-second version
- The final line "Full session context → lodestar review" is always shown — signpost to the depth layer
- No interaction, no prompts, no questions — this fires and exits

**Implementation — `src/summary.ts`:**
- Reads `.lodestar.md` from `projectRoot` (shares parse logic with `lodestar_load`)
- Formats distilled output as a plain string
- Called by the SessionStart hook script generated during `lodestar init`

**The hook script generated by `lodestar init` (Claude Code):**
```bash
#!/bin/bash
# Generated by lodestar init — do not edit manually
lodestar summary --project "$CLAUDE_PROJECT_DIR"
exit 0
```

**For Cursor and Windsurf:** No equivalent hook mechanism exists in Phase 1a. These users run `lodestar review` manually at session start. `lodestar start` as an explicit command is a Phase 1b item for non-Claude Code users.

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

**KylexHostedProvider — Phase 1b:**

| Provider | Endpoint | Auth | Mid-session model | End-session model |
|---|---|---|---|---|
| `kylex` | `https://api.kylex.io/synthesize` | JWT Bearer token | Haiku 4.5 | Sonnet 4.6 |

Config when Pro token is present:
```json
{
  "provider": "kylex",
  "kylexToken": "eyJ...",
  "kylexTokenExpiry": "2026-04-24T00:00:00Z"
}
```

The `KylexHostedProvider` sends the git diff and call type (`checkpoint` | `synthesize`) to the hosted proxy. The proxy selects the model — the binary never calls Anthropic directly when using the kylex provider. Token is validated locally (JWT expiry check) before any network call is made. If validation fails, fall back to BYOK provider with a warning.

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
║  Lodestar — Kylex Module 00             ║
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

Get early access to Kylex Pro + build-in-public updates:
  kylex.io → enter your email → founding member status locked

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

**Pro gate:** The `--diff` flag requires a valid Kylex Pro token in `~/.lodestar.config.json`.
- If token is present and valid: render the changes panel as documented.
- If token is missing or expired: print a single non-blocking line below the main reader:
  `Session comparison is a Kylex Pro feature — kylex.io`
  Do not crash. Do not hide the main reader content. The changes panel area is simply absent.
- Token validation is a local check against the JWT expiry field — no network call required.

---

### UI design principles

- **No external dependencies** — the served HTML is a self-contained string in `src/reader/template.ts`. No CDN imports, no Google Fonts, no external JS. The reader must work completely offline.
- **System fonts** — use `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`. Do not import fonts.
- **Kylex color palette** — deep navy `#1B2C4A` for headers, nautical teal `#1A6B72` for accents, brass `#C8A84B` for the Lodestar mark and section badges, warm white `#F8F9FA` background.
- **Dark mode aware** — use `prefers-color-scheme: dark` media query. Dark background: `#0D1117`, dark surface: `#161B22`.
- **Readable at a glance** — minimum 16px body text, generous line height (1.6), clear section separation.
- **One interaction per element** — click to expand/collapse. No hover-only states. No tooltips required to understand the UI.
- **Mobile-capable** — the reader may be viewed on a phone. Max-width container (760px), responsive at 375px minimum.
- **Kylex footer** — every reader page includes a subtle footer: `Lodestar · Kylex Module 00 · kylex.io`. This is the community candy brand impression.
- **Portability row** — below the footer, display the raw GitHub URL for the current `.lodestar.md` as a copyable one-line element:
  ```
  📋 Use on another machine or web app: https://raw.githubusercontent.com/{user}/{repo}/main/.lodestar.md  [copy]
  ```
  Derive this URL by running `git remote get-url origin` on the project root and transforming the GitHub SSH or HTTPS remote URL into raw.githubusercontent.com format. If the repo has no GitHub remote, omit this row silently — no error, no placeholder. This is the escape hatch for users on the Claude.ai web app or a machine without Lodestar installed: paste the URL into any AI chat and the model fetches context directly. Include a small copy-to-clipboard button inline.

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
  // CSS variables map to Kylex palette
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

You are building the first module of Kylex — a suite of tools for solo founders and first-time app builders. The `.lodestar.md` file it produces should be something a developer looks at and thinks "this is exactly what I needed to remember" — not a git log summary, not a diff report. A handoff note from a thoughtful colleague who watched the whole session.

**Distribution model: binary-only. No source code is ever released.**

Lodestar is distributed as a compiled binary. Users install it and run it. They cannot inspect, fork, modify, or redistribute the implementation. This is the primary moat — not feature complexity alone, but implementation opacity. The synthesis prompt, schema design, provider abstraction, history rotation, and review UX are all protected.

This has build implications:
- Do not write code assuming it will be read by users or contributors
- Internal variable names, comments, and architecture are private — optimise for clarity to Claude Code during build, not for public consumption
- The binary will be signed and distributed via a controlled channel (GitHub Releases or a dedicated download page) — not npm publish
- The `package.json` `bin` entry is for development convenience only; the shipped artifact is a compiled binary (pkg, nexe, or equivalent)

**Tier model:**
- **Lodestar Free** — Phase 1a binary: `lodestar init`, `lodestar_synthesize`, `lodestar_load`, `lodestar review` (current session only). Manual CLI only. Free forever. 3-file history rotation.
- **Lodestar Pro** ($9.99/month) — everything in Free plus the review upgrade bundle:
  1. **Session history timeline** — scroll through 30 days of sessions, see how the project evolved. Free users see "3 of N sessions available" with greyed-out older entries.
  2. **Session diff panel** — compare any two sessions, see what changed (decisions added/resolved, deps, patterns).
  3. **Team sharing** — shareable URL for the review page (not just local file).
  4. **AI session summary** — "Here's what changed across your last 5 sessions in one paragraph."
  Plus: hosted synthesis (no BYOK), mid-session checkpoints, 200 calls/month.

The free tier is community candy that builds the newsletter audience. The pro tier is where revenue lives. Phase 1a builds the free tier. Phase 1b+ builds the pro tier.

**Pro upgrade trigger strategy:** The review page is the conversion surface. Free users see full current-session content but hit the wall on history depth. The timeline shows greyed-out sessions they can't access — not hidden, just aged out. The upgrade prompt appears naturally when they want to go back further than 3 sessions.

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
  **Provider-agnostic.** Lodestar is community candy for the full vibe-coding audience — Claude Code, Cursor, Windsurf, and any AI coding tool. Locking to Anthropic would exclude users who don't have an Anthropic API key, costing newsletter signups and Kylex audience growth. The `LLMProvider` interface abstracts the synthesis call. Anthropic ships as the default and recommended provider. OpenAI and Ollama ship as alternatives. The synthesis prompt is identical across all providers.

- [x] **How does the user configure their API key?**  
  **Via `lodestar init` wizard — not via `.env` or manual file editing.** The key is stored in `~/.lodestar.config.json` in the user's home directory. It is never stored in a project repo, never passed via `mcp.json env` block, and never handled via `.env` files in production. The init wizard validates the key before saving and opens the provider's console in the browser if the user doesn't have one yet.

- [x] **Open source or binary-only distribution?**  
  **Binary-only. No source code is ever released.** The implementation moat is opacity — the synthesis prompt, schema design, provider abstraction, history rotation logic, and review UX are all protected. Users can observe the output format (`.lodestar.md` is committed to their repo and readable) but cannot inspect or fork the tool that produces it. This makes even Phase 1a defensible against cloning. The binary is compiled via `pkg` or equivalent and distributed via GitHub Releases or a dedicated download page — not npm publish.

- [x] **Does Lodestar need a EULA?**  
  **Yes — required before any binary ships.** The EULA must cover: (1) no reverse engineering or decompilation, (2) no redistribution or resale, (3) single-user licence per installation, (4) anonymous telemetry disclosure, (5) auto-update behaviour disclosure. Without a EULA, the binary is legally unprotected. A standard closed-source EULA is sufficient — this is not legally complex. Write it before the first public release.

- [x] **Can Lodestar collect usage telemetry?**  
  **Yes — anonymous telemetry is permitted and valuable.** Binary distribution makes telemetry possible in a way open source does not. Instrument: sessions per user per week, provider used, synthesis success/failure rate, which review sections are expanded, Phase 1b adoption rate. All telemetry is anonymous (no PII, no project content, no file names). Disclosed in the EULA and surfaced during `lodestar init`. Users can opt out. Data informs Phase 1b build priorities and pricing decisions.

- [x] **How do users get updates?**  
  **Auto-update check on launch via GitHub Releases API — no backend required.** On every `lodestar` command invocation, make a lightweight HTTP GET to `https://api.github.com/repos/kylex-labs/lodestar/releases/latest`. Compare the `tag_name` field against the current binary version. If newer, print a non-blocking notice: `Update available: v0.2.1 → run lodestar update`. The `lodestar update` command downloads the appropriate platform binary from the GitHub Release assets and replaces itself. **Rationale:** GitHub Releases API is zero-infrastructure, zero-cost, and trusted. No kylex.io backend required for Phase 1a. Upgrade to a dedicated endpoint in Phase 1b when telemetry infrastructure exists.

- [x] **Mid-session vs. end-of-session model routing?**
  **Haiku 4.5 for mid-session checkpoints. Sonnet 4.6 for end-of-session synthesis.**
  Mid-session checkpoint calls require only file inventory and in-progress decision capture — no deep rationale extraction. Haiku 4.5 handles this reliably at 1/3 the cost of Sonnet. End-of-session synthesis requires rationale extraction ("why", not "what") and rejected approach detection (deleted code → tried and abandoned). Both require multi-step inference across the full diff that Haiku degrades on significantly — weighted MCDA score: Haiku 5.9/10 vs. Sonnet 9.1/10 on synthesis quality, with rationale (30% weight) and rejected approach detection (20% weight) as the highest-gap subtasks.

  Migration to all-Haiku for end-of-session synthesis is explicitly gated on:
  - A well-engineered `prompts/synthesize.md` that passes the rationale test across 10 consecutive sessions
  - Every `decisions[].rationale` field answers *why*, not *what*
  - At least one `rejected[]` entry detected per session where code was deleted

  Do not migrate on cost grounds alone. Prompt engineering is the variable to optimise first.

  All-Sonnet was rejected: unnecessary cost — mid-session calls do not require deep reasoning.
  All-Haiku was rejected for launch: produces technically valid `.lodestar.md` that reads as a git log summary — shallow decisions, missing rationale. That is the exact failure mode Lodestar is designed to prevent.

- [x] **Is `lodestar review --diff` a free or Pro feature?**
  **Pro only.** The session comparison panel (changes since last session) is the highest-value carrot for Pro conversion — a user who has accumulated 5+ sessions of history and sees "3 new decisions, 1 question resolved, 2 deps added since last week" has the clearest upgrade prompt. Gating it in the free tier removes the primary upgrade trigger. The free tier delivers full synthesis output and all 3 disclosure levels in the reader — no content is withheld. Only the cross-session comparison capability is gated.

  Free tier `lodestar review` must show a subtle, non-punitive prompt when `--diff` is passed without a Pro token:
  ```
  Session comparison is a Kylex Pro feature.
  kylex.io → upgrade to see what changed since last session.
  ```
  Do not show an error. Do not crash. Redirect gracefully.

- [x] **What is the Pro tier gating strategy?**
  **Capability gating — not content blur, not content depth gating.**
  The `.lodestar.md` file is a committed text file on the user's local machine. Any blur or visibility restriction applied in the reader UI is trivially bypassed with `cat .lodestar.md`. Content-based gating on local files is not enforceable and breeds resentment without generating upgrades.

  The Pro gate is: features that require server-side infrastructure — hosted synthesis (no BYOK needed), mid-session checkpoint calls, session diff panel, extended 30-day history, 200-call monthly quota. Free users have complete access to all synthesis output content. Pro users get workflow automation that is genuinely impossible to self-host without the Kylex backend.

  Content blur was rejected: bypassed by reading the local file directly. Not enforceable.
  Content depth gating was rejected: punishes free users before they are sold on the value. AHA moment must come before the upgrade prompt.

- [x] **`diffMode` parameter on `lodestar_synthesize` — the interface contract for hook and MCP lifecycle triggers.**
  `captureGitSnapshot()` accepts `diffMode: 'working-tree' | 'last-commit'`. Default is `'working-tree'` so all existing manual MCP tool calls are unchanged. Hook invocations pass `'last-commit'` explicitly. This is the same contract Phase 1b MCP lifecycle triggers will use: when `lodestar_synthesize` fires on MCP disconnect, it should pass `'last-commit'` if the user committed during the session, or `'working-tree'` if they didn't. The hook always knows which to use; the MCP disconnect handler will need to check `isWorkingTreeClean()` to decide.

---

## GTM & distribution model — locked

Binary-only distribution via two parallel tracks. Both deliver the same compiled binary. Neither track gates the GitHub download behind email.

**Track 1 — GitHub Releases (virality track)**
- Public repo with README, docs, changelog, issue tracker — no source code
- Binary assets attached to each GitHub Release (macOS arm64, macOS x64, Linux x64, Windows x64)
- No email gate — frictionless developer access
- SHA256 checksums included on every release
- This track drives GitHub stars, community discussion, and word of mouth

**Track 2 — kylex.io (email capture track)**
- Landing page with email input form
- Single opt-in (not double opt-in — developer audience, lower friction)
- GDPR checkbox on form: one line stating what they're signing up for
- On submit: Beehiiv API call → immediate welcome email with download link
- Welcome email delivers binary download link in the first line — no delay, no confirmation loop
- This track drives newsletter subscribers and founding member signups

**Email provider: Beehiiv**
- Newsletter-native, clean analytics, referral program built in
- $0 up to 2,500 subscribers
- API available for triggered welcome emails on signup
- Do not use Mailchimp, ConvertKit, or any other provider

**Version check: GitHub Releases API**
- GET `https://api.github.com/repos/kylex-labs/lodestar/releases/latest`
- Compare `tag_name` against current binary version constant
- Non-blocking notice on update available — never interrupt the user's flow
- No kylex.io backend required for Phase 1a
- Zero infrastructure, zero cost

**Announcement sequence (at launch — not a build concern, for context):**
1. Show HN: "Lodestar: CLI tool that synthesizes your Claude Code session into a portable .md for warm cold-starts"
2. r/ClaudeCode and r/cursor — demo GIF or `lodestar review` screenshot
3. Indie Hackers launch post — build-in-public angle
4. Newsletter issue #1 to seed list

**What the binary does NOT do:**
- Never show a paywall or upsell gate in Phase 1a
- Never require an account or login to use
- Never phone home with session content, file names, or project data (telemetry is anonymous counters only — see telemetry decision above)

---

## `lodestar bootstrap` — existing codebase onboarding

**Trigger:** User runs `lodestar bootstrap` on a project that has existing code but no `.lodestar.md`.

**What it does:**
Reads structural metadata from the filesystem to generate a skeleton `.lodestar.md` — without synthesizing intent, rationale, or decisions (those require a real session to exist). All unknown intent fields are explicitly marked `[UNKNOWN — fill in or run lodestar_synthesize after next session]`.

**What it reads (zero hallucination risk):**
- `package.json` / `Cargo.toml` / `pyproject.toml` — stack, dependencies, scripts
- Directory tree (2 levels deep) — architecture pattern inference
- `README.md` — if present, mine for stated purpose
- Config files: `.env.example`, `tsconfig.json`, `docker-compose.yml` — deployment context
- First 10 git commits (if repo exists) — chronological build order
- Any `.md` files in root — docs, changelogs

**What it does NOT read:** source files, implementation logic, function bodies, anything requiring code comprehension.

**Hard constraint:** Bootstrap must NEVER infer intent, rationale, or architectural decisions. It only reports what objectively exists. If something is unknown, it writes `[UNKNOWN]` — not a guess.

**Output header:** The generated `.lodestar.md` must include a prominent warning:
```
# .lodestar.md — BOOTSTRAPPED (not synthesized)
# ⚠️ Intent fields marked [UNKNOWN] require human input.
# Run `lodestar_synthesize` after your next session to populate them.
```

**Implementation notes:**
- `lodestar bootstrap` is a CLI command, not an MCP tool
- Lives in `src/bootstrap.ts`
- Never overwrites an existing `.lodestar.md` without confirmation prompt
- Shares the history rotation logic from `src/history.ts` if overwriting

---

## Future phases (do not build now)

**Phase 1b — Pro tier infrastructure (next phase):**
- Cursor/Windsurf VS Code extension — activate()/deactivate() hooks for automatic session start/end, onWillSaveTextDocument for real-time quick updates. Matches Claude Code's SessionStart/SessionEnd automatic flow.
- kylex.io Pro landing page — pricing, checkout, founding member CTA
- Stripe integration — $9.99/month subscription, webhook handling
- Auth layer — JWT token issued on Stripe payment_succeeded webhook
- Hosted synthesis proxy — thin Node.js API: validates token, routes to Anthropic (Haiku mid / Sonnet end), returns result. Stateless — no user data stored server-side.
- KylexHostedProvider — new `src/providers/kylex.ts` implementing `LLMProvider` interface
- lodestar init Pro flow — detect existing token, skip BYOK if Pro subscriber
- Usage counter — Upstash Redis, call tracking per user per billing month, 200-call soft cap
- lodestar_checkpoint() — new MCP tool, Haiku synthesis on partial diff, no .lodestar.md write, Pro only
- lodestar review --diff — moves from free to Pro, token-gated
- 30-day history rotation — replaces 3-file free tier limit for Pro subscribers
- lodestar_diff() — Phase 1b drift detection stub becomes live tool

**Phase 1b known issue — double-fire on synthesis:**
When both post-commit (git hook) and SessionEnd (Claude Code hook / MCP disconnect) fire in the same session, `lodestar_synthesize` runs twice. The second run overwrites the first. This is acceptable — the final state is always the most current diff — but it is not a bug. `src/synthesize.ts` is designed to be idempotent: re-running synthesis on the same diff produces a valid `.lodestar.md` with no corruption or duplication. History rotation still fires (the first synthesis result gets moved to `.lodestar.history/`), so no context is lost. Do not add dedup logic or locking to prevent double-fire — the simplicity of "last write wins" is intentional.

**Phase 1b infrastructure gate (do not start Phase 1b until):**
- [ ] Phase 1a gate fully passed (10-session synthesis gate, lodestar review stable)
- [ ] EULA written and attached to binary
- [ ] kylex.io domain registered and landing page live

**Phase 2 — Pro growth:**
- Background agent — passive session watcher; fires lodestar_synthesize automatically at session end; no explicit command needed
- Multi-project dashboard — cross-project pattern view on kylex.io Pro portal
- Project linking — associate related projects (e.g. frontend + backend + landing page) into a workspace, view all linked project status in one dashboard
- Shareable .lodestar.md URL — cloud-hosted permalink, no GitHub required
- Haiku prompt engineering — target: all-Haiku synthesis passing the rationale test across 10 sessions. Migration gate: every `decisions[].rationale` answers *why*, at least one `rejected[]` detected per session with deleted code.
- Telemetry dashboard — anonymised usage data (sessions/week, provider split, section expansion rates) informing Phase 3 priorities

**Phase 3 — Kylex suite integration:**
- Kite integrated scan — security scan triggered automatically before end-of-session synthesis
- Gangway (Shuffle) integration — design-to-code handoff aware of Lodestar session context
- Pharos cross-reference — session decisions searchable in historical project archive
- Full Kylex suite context for Pro members

**Product boundary reminder:** Lodestar's scope is session state only. Phase 2 and 3 features that touch Pharos (archive search), Gangway (design handoff), or Kite (security scanning) are integration points — not Lodestar features. Do not implement adjacent product logic inside Lodestar. Flag and stop.

**Binary compilation (required before public launch — still pending):**
- Use `pkg` (Vercel) or `nexe` to compile the Node.js app to a standalone binary
- Target: macOS arm64, macOS x64, Linux x64, Windows x64
- Signed binary for macOS (Apple Developer ID) and Windows (code signing cert)
- Distributed via GitHub Releases with SHA256 checksums
- `lodestar update` command for self-updating binary

---

*Lodestar — Kylex Module 00 — Titania Labs LLC*
*kylex.io — Binary distribution, closed source*
