# Lodestar
![lodestar_demo_v3](https://github.com/user-attachments/assets/8636600a-2841-4cb1-962a-c0d7c0b79b43)


**Every AI coding tool remembers what you built. None of them remember why. Until now.**

The code is always saved. The thinking behind it wasn't. Lodestar commits your reasoning to your repo — decisions, dead ends, and direction — so every session starts where the last one left off.

Works with Claude Code, Cursor, Windsurf, or whatever you use next.

> [Lodestar by Kylex](https://kylex.io) · Free forever · kylex LLC

---

## Three commands

```bash
lodestar start       # Load context from your last session
lodestar save        # Mid-session checkpoint
lodestar end         # Done for the day — save and commit
```

That's it. No paths needed if you're in your project directory. Works from the terminal or just tell your AI — "lodestar start", "lodestar save", "lodestar end".

---

## What gets captured

Lodestar doesn't produce a git log summary. It captures the thinking behind your code:

- **Decisions & rationale** — what was decided and *why*, not just what changed
- **Dead ends** — what was tried and abandoned, so the next session doesn't retry it
- **Patterns** — conventions established in the codebase
- **Open questions** — blockers and unresolved issues
- **Direction** — where to pick up next, written at peak clarity

This context is committed to your repo and portable across tools and machines.

---

## Terminal summary

When Claude Code starts, Lodestar prints a 5-line briefing automatically — no commands needed:

```
═══════════════════════════════════════════════
  Lodestar  ·  my-app  ·  yesterday
═══════════════════════════════════════════════
  Where you left off:
  → Wire up auth middleware in src/server/api/trpc.ts
  → Add users table to Drizzle schema
  → Run tRPC + Drizzle integration test

  Last rejected: Prisma ORM — 2-3s cold starts on Vercel

═══════════════════════════════════════════════
  Full session context → lodestar review
═══════════════════════════════════════════════
```

10 seconds to reorient. Zero interaction required.

---

## Project dashboard

Run `lodestar review` for the full picture — build status, architecture diagrams, decisions, and more:

```bash
lodestar review              # Open dashboard in browser
lodestar review --diff       # Show changes vs last session (Pro)
```

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

```bash
git clone https://github.com/Kgard/LodeStar.git
cd LodeStar
npm install
npm run build
npm link
```

### Verify

```bash
lodestar help
```

---

## Setup

```bash
lodestar init
```

The wizard will:

1. Ask which AI provider you use (Anthropic, OpenAI, or Ollama)
2. Walk you through API key setup
3. Validate your key
4. Auto-configure Claude Code, Cursor, and Windsurf
5. Offer to install git hooks (auto-updates on commit)
6. Offer to enable the terminal summary (SessionStart hook for Claude Code)
7. Bootstrap your existing project if it has code

That's it. No `.env` files, no manual config.

---

## All commands

| Command | What it does | Cost |
|---|---|---|
| `lodestar start` | Load previous session context | Free |
| `lodestar save` | Mid-session checkpoint (synthesis) | ~$0.003 |
| `lodestar end` | Synthesize + commit — end session | ~$0.01 |
| `lodestar review` | Open project dashboard in browser | Free |
| `lodestar summary` | Print 5-line terminal briefing | Free |
| `lodestar bootstrap` | Capture existing project structure | Free |
| `lodestar hooks` | Install git hooks | Free |
| `lodestar init` | First-time setup | Free |

`[path]` is not required if you are in the project directory.

Aliases: `lodestar load` = `start`, `lodestar synthesize` / `sync` = `save`.

---

## How it works

### Save / End

1. Captures uncommitted changes and committed changes since last synthesis
2. Detects package.json changes and project brief (CLAUDE.md) changes separately
3. Sends to your configured AI provider with a synthesis prompt
4. AI extracts decisions, patterns, dead ends, and open questions
5. Writes context to your project root (with history rotation)
6. (`lodestar end` only) Commits the context file

### Start

1. Reads saved context from your project
2. If no context exists, auto-bootstraps from your project structure (free, no LLM)
3. Returns decisions, patterns, and where to pick up

### Git hooks

```bash
lodestar hooks              # Install
lodestar hooks --remove     # Remove
```

- **post-commit** — lightweight feature status update (no LLM, free)
- **pre-push** — commits context file if it has changes (no LLM, free)

LLM is only called when you explicitly run `save` or `end`.

---

## Supported providers

| Provider | Default model | API key | Cost per synthesis |
|---|---|---|---|
| Anthropic | `claude-sonnet-4-6` | Required | ~$0.003 (save) / ~$0.01 (end) |
| OpenAI | `gpt-4o` | Required | ~$0.003 (save) / ~$0.01 (end) |
| Ollama | `llama3.2` | Not needed | Free (runs locally) |

Model routing: `save` uses a faster model (Haiku/gpt-4o-mini), `end` uses a stronger model (Sonnet/gpt-4o) for deeper rationale extraction.

---

## Works with

| Tool | Setup | Session start |
|---|---|---|
| Claude Code | Auto-configured by `lodestar init` | Terminal summary fires automatically |
| Cursor | Auto-configured + `.cursorrules` generated | Say "lodestar start" in chat |
| Windsurf | Auto-configured by `lodestar init` | Say "lodestar start" in chat |
| Any MCP-compatible tool | Add server entry to MCP config | Call `lodestar_load` tool |

---

## Lodestar Pro

Everything in Free, plus:

- **30-day session history timeline**
- **Session diff — compare any two sessions**
- **Team sharing — shareable review URL**
- **AI summary across sessions**
- **Hosted synthesis — no API key needed**
- **Mid-session checkpoints**

$9.99/month · [Join early access at kylex.io](https://kylex.io)

---

## FAQ

**Do I need to install Lodestar in every project?**
No. Install once, use on any git project.

**What does it cost?**
Lodestar is free. The AI API call costs ~$0.003-0.01 per synthesis using your own key. Ollama is completely free.

**Does it work with my AI coding tool?**
If your tool supports MCP servers, yes. `lodestar init` auto-configures Claude Code, Cursor, and Windsurf.

**Do I need to pass a path every time?**
No. Run from your project directory — no arguments needed.

**What if I don't have an API key?**
Use Ollama — free, local, no key needed.

**What about large diffs?**
Lodestar prioritizes architecture and config files over templates and CSS. High-priority files are always included. Low-priority files are dropped first if the budget is exceeded.

---

## License

Proprietary — kylex LLC

---

*Keep the flow state. Even when the session ends.*
*[kylex.io](https://kylex.io)*
