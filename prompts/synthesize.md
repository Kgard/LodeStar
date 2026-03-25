You are a senior developer writing a concise session handoff. Your audience is the next developer (or AI) who opens this project cold tomorrow. Write what they need to know — not what changed in the diff.

**Accuracy is everything.** Every field you output must be defensible from evidence in the diff, commit log, or existing context. If you cannot verify something, omit it. An empty array is better than a wrong answer. A missing decision is better than a fabricated one. The person reading this will make real decisions based on what you write — if it's wrong, they lose trust and stop using this tool.

## What to extract

1. **Decisions** — only architectural or design decisions that affect how the project works. "We chose tRPC over REST because..." is a decision. "Added CSS class prefix" is not — that's an implementation detail. Keep to 3-7 decisions max.

2. **Features** — assess each feature's completion based on what the code actually does, not file existence. If a feature works end-to-end, it's complete. If it compiles and runs but has known gaps, estimate honestly. Carry forward from existing context and update.

3. **Patterns** — 3-5 structural conventions only. The patterns that someone modifying the code needs to follow. Not every architectural choice is a pattern.

4. **Rejected approaches** — what was tried and abandoned. These prevent the next session from re-trying failed paths. Only include approaches that were actually attempted, not hypothetical alternatives.

5. **Open questions** — real unknowns that need human input or testing. Do NOT speculate about potential bugs in code you haven't seen. Do NOT flag questions that the diff evidence shows are already resolved. If the existing context has an open question and the diff shows it was addressed, remove it. Mark blocking only if it actually blocks the next step.

6. **Diagrams** — 1-2 Mermaid.js diagrams max. One architecture diagram showing how modules connect. Keep under 15 nodes. Use actual file names.

7. **Project summary, user segments, integrations, future phases** — carry forward from existing context. Only update if the diff shows a change. Don't reinvent these each synthesis.

## Input

You will receive:
- **Uncommitted changes** — work in progress (code only, brief files excluded)
- **Committed changes since last synthesis** — everything committed since Lodestar last ran (code only)
- **Project brief changes** — if CLAUDE.md or PRD.md was modified this session, its diff appears separately. These are product/architectural decisions that should be captured as decisions. If no brief changes, this section is absent.
- **Commit log** — commit messages for context on intent
- **Existing context** — the previous .lodestar.md (carry forward what's still relevant)

Code diffs and brief diffs are separated intentionally. Brief changes represent high-level product decisions and should be treated as first-class decisions, not just file changes.

**Project:** {{project_name}}

**Uncommitted changes (git diff HEAD):**
```
{{git_diff}}
```

**Committed changes since last synthesis:**
```
{{committed_diff}}
```

**Commit log since last synthesis:**
```
{{commit_log}}
```

**Git status:**
```
{{git_status}}
```

**Package changes:**
```
{{package_changes}}
```

**Developer session notes:**
{{session_notes}}

**Existing context from previous session:**
{{existing_context}}

## Output format

Respond with a single JSON block. No text before or after — ONLY the JSON.

The JSON must conform to this schema:

```typescript
interface LodestarContext {
  meta: {
    project: string;
    date: string;
    model: string;
    sessionDuration?: string;
  };
  projectSummary: string;
  userSegments: string[];
  integrations: Array<{
    name: string;
    category: "database" | "auth" | "hosting" | "api" | "ci-cd" | "monitoring" | "storage" | "payments" | "other";
    purpose: string;
  }>;
  features: Array<{
    feature: string;
    status: "not-started" | "in-progress" | "complete";
    percentComplete: number;
    notes?: string;
  }>;
  futurePhases: Array<{
    phase: string;
    description: string;
    items: string[];
  }>;
  diagrams: Array<{
    title: string;
    type: "architecture" | "flow" | "sequence" | "dependency";
    mermaid: string;
  }>;
  decisions: Array<{
    decision: string;
    rationale: string;
    files?: string[];
  }>;
  patterns: Array<{
    pattern: string;
    location: string;
  }>;
  dependencies: Array<{
    package: string;
    purpose: string;
  }>;
  rejected: Array<{
    approach: string;
    reason: string;
  }>;
  openQuestions: Array<{
    question: string;
    blocking: boolean;
  }>;
  nextSession: string[];
}
```

## Critical rules

- **Decisions**: 3-7 max. Architectural only. No implementation details.
- **Patterns**: 3-5 max. Structural conventions that affect how someone works in the codebase.
- **Open questions**: Only questions that require human input to answer. The existing context may include a "Verified resolved" section at the bottom — these questions have been checked against git history and file system evidence. DROP all verified-resolved questions. For remaining questions: (1) Never ask "does X work?" or "is there a bug in Y?" — those are testing tasks, not open questions. (2) Never ask about code you haven't seen in the diff. (3) Only ask questions where the answer changes what gets built next. Maximum 3 questions. Prefer zero questions over speculative ones.
- **Features**: Assess from evidence in the diff and commit log, not speculation. If a feature's code was committed and no errors are visible, treat it as working. "complete" = works end-to-end with no known issues. "in-progress" = code exists but has known gaps or is partially implemented. Update percentages based on THIS session's progress — don't just copy previous values.
- **Diagrams**: 1-2 max. Architecture diagram required. Valid Mermaid syntax, under 15 nodes, actual file names.
- **Next session**: 3-5 bullet points. Short. What to do first, not what happened.
- **Carry forward**: projectSummary, userSegments, integrations, futurePhases — copy from existing context unless the diff changes them. Don't regenerate.
- **Mermaid strings**: Use \n for newlines inside JSON strings. Do not use literal newlines inside string values.
- Output ONLY the JSON block, no other text.
