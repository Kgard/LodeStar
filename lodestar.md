# Lodestar — Claude Code Build Instructions

> Module 00 of the **Keelson** suite (keelson.io)  
> Titania Labs LLC — Confidential  
> Version: Phase 1a

---

## What you are building

Lodestar is an MCP server that solves **session amnesia** in Claude Code. Every Claude Code session starts cold — no memory of architectural decisions, established patterns, rejected approaches, or open questions. Lodestar synthesizes the current session into a structured `.lodestar.md` context file that loads at the next session start, giving Claude Code a warm boot.

**Phase 1a scope — the only thing being built right now:**
- `lodestar_synthesize()` — reads current session file diffs, synthesizes via Claude API, writes `.lodestar.md`
- `lodestar_load()` — reads `.lodestar.md`, returns structured context for session initialization

**Not in scope for Phase 1a (do not build):**
- Passive background watching or automatic session-end firing (Phase 2)
- Cross-project diffing (Phase 3)
- Any UI, dashboard, or web interface
- `lodestar_diff()` drift detection (Phase 1b — next phase, not this one)

If a feature idea arises that belongs to a later phase, add it to `## Future Phases` at the bottom of this file and continue. Do not implement it.

---

## Project identity

| Field | Value |
|---|---|
| Suite | Keelson (keelson.io) |
| Product | Lodestar — Module 00 |
| Tagline | "Every session remembers where you left off." |
| Revenue model | Free forever — community candy, newsletter capture |
| Primary user | Solo vibe-coding founders using Claude Code |
| Owner | Ken / Titania Labs LLC |

---

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js 20+ / TypeScript | Strict mode on |
| MCP transport | stdio | Same pattern as Pharos MCP |
| AI synthesis | Anthropic API — `claude-sonnet-4-6` | Use SDK, not raw fetch |
| Git integration | `simple-git` | File diff capture |
| Storage | `.lodestar.md` in project root | Version-controlled with the codebase |
| Package manager | npm | `package.json` in project root |
| Config | `mcp.json` in Claude Desktop | stdio transport entry |

---

## Repository structure

```
lodestar/
├── src/
│   ├── index.ts          ← MCP server entry point
│   ├── synthesize.ts     ← lodestar_synthesize() implementation
│   ├── load.ts           ← lodestar_load() implementation
│   ├── diff.ts           ← lodestar_diff() STUB ONLY — Phase 1b
│   ├── git.ts            ← Git diff utilities via simple-git
│   ├── claude.ts         ← Anthropic API client and synthesis prompt
│   └── schema.ts         ← .lodestar.md types and validation
├── prompts/
│   └── synthesize.md     ← The synthesis prompt (kept separate for iteration)
├── .lodestar.md          ← Auto-generated context file (gitignored or committed per project preference)
├── package.json
├── tsconfig.json
├── .env.example          ← ANTHROPIC_API_KEY placeholder
└── CLAUDE.md             ← This file
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
5. Serialises to `.lodestar.md` in `projectRoot`
6. Returns success + path + summary

**Error handling:**
- Not a git repo → return error with clear message, do not crash
- No changes detected → return warning, write minimal context file
- Claude API failure → return error with raw message, do not write partial file
- Invalid projectRoot → return error immediately

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

## The synthesis prompt

The synthesis prompt lives in `prompts/synthesize.md`. It is the most important piece of the entire system — the quality of `.lodestar.md` depends entirely on this prompt. Keep it separate from code so it can be iterated without a build step.

**Prompt principles:**
- Ask Claude to be a thoughtful senior developer documenting a handoff, not a diff summariser
- Explicitly instruct: extract *decisions and rationale*, not just *what changed*
- Explicitly instruct: flag *rejected approaches* — these are as valuable as accepted ones
- Keep output structured to match the `LodestarContext` schema exactly
- Include a `nextSession` section: "If you were opening this project cold tomorrow, what are the three things you'd want to know first?"
- Output must be valid Markdown that also parses back into `LodestarContext`

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

The server uses stdio transport. Entry point is `src/index.ts`.

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

**Claude Desktop `mcp.json` entry:**
```json
{
  "mcpServers": {
    "lodestar": {
      "command": "node",
      "args": ["/absolute/path/to/lodestar/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "your-key-here"
      }
    }
  }
}
```

---

## Environment

```bash
# .env (never commit — listed in .gitignore)
ANTHROPIC_API_KEY=sk-ant-...

# .env.example (commit this)
ANTHROPIC_API_KEY=your-anthropic-api-key-here
```

Load with `dotenv` in development. In production Claude Desktop injects via the `env` block in `mcp.json`.

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

## Build and run

```bash
# Install
npm install

# Build
npm run build        # tsc → dist/

# Dev (watch)
npm run dev          # tsc --watch

# Test a synthesis manually
node dist/index.js   # then send MCP messages via stdin

# Useful test: run against this project
# Call lodestar_synthesize with projectRoot = absolute path to this directory
```

---

## Phase gates

**Do not move to Phase 1b until:**
- [ ] `lodestar_synthesize` writes a valid `.lodestar.md` in 10 consecutive personal sessions
- [ ] `lodestar_load` returns clean context that requires no manual editing before use
- [ ] Session ramp time reduced by >50% (measured subjectively by Ken)
- [ ] No Claude API errors in normal operation
- [ ] Both tools registered and callable from Claude Desktop

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

## Open questions — resolve before build

- [ ] Should `.lodestar.md` be gitignored by default or committed? (Recommendation: committed — version control of decisions is a feature, not a side effect)
- [ ] What is the maximum diff size before truncation for the Claude API call? Define a token budget.
- [ ] If `.lodestar.md` already exists, does `lodestar_synthesize` append or replace? (Recommendation: replace, but keep the last 3 versions in `.lodestar.history/` for recovery)

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
