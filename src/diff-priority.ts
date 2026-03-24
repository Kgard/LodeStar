// File priority for diff truncation
// Higher priority files are included first when budget is tight.

export type Priority = 1 | 2 | 3 | 4;

const PRIORITY_RULES: Array<{ test: (file: string) => boolean; priority: Priority }> = [
  // Priority 1 — always include: config, schema, types, entry points, briefs
  { test: (f) => f === "package.json", priority: 1 },
  { test: (f) => f === "tsconfig.json", priority: 1 },
  { test: (f) => f === "CLAUDE.md", priority: 1 },
  { test: (f) => f.endsWith("schema.ts") || f.endsWith("schema.js"), priority: 1 },
  { test: (f) => f.endsWith("types.ts") || f.endsWith("types.js"), priority: 1 },
  { test: (f) => f.endsWith("index.ts") || f.endsWith("index.js"), priority: 1 },
  { test: (f) => f.endsWith("config.ts") || f.endsWith("config.js"), priority: 1 },
  { test: (f) => f === "Cargo.toml" || f === "pyproject.toml" || f === "go.mod", priority: 1 },
  { test: (f) => f.endsWith(".prisma") || f.endsWith("drizzle.config.ts"), priority: 1 },

  // Priority 2 — high: core logic, API, providers, database, middleware
  { test: (f) => f.includes("providers/") || f.includes("provider"), priority: 2 },
  { test: (f) => f.includes("routes/") || f.includes("api/"), priority: 2 },
  { test: (f) => f.includes("middleware"), priority: 2 },
  { test: (f) => f.includes("db/") || f.includes("database/"), priority: 2 },
  { test: (f) => f.includes("auth/") || f.includes("auth."), priority: 2 },
  { test: (f) => f.endsWith(".ts") && !f.includes("test") && !f.includes("spec"), priority: 2 },
  { test: (f) => f.endsWith(".js") && !f.includes("test") && !f.includes("spec"), priority: 2 },
  { test: (f) => f.endsWith(".py") || f.endsWith(".rs") || f.endsWith(".go"), priority: 2 },

  // Priority 3 — medium: tests, utilities, scripts
  { test: (f) => f.includes("test") || f.includes("spec") || f.includes("__tests__"), priority: 3 },
  { test: (f) => f.includes("scripts/") || f.includes("utils/") || f.includes("helpers/"), priority: 3 },
  { test: (f) => f.endsWith(".md"), priority: 3 },
  { test: (f) => f.endsWith(".json") && f !== "package.json", priority: 3 },

  // Priority 4 — low: templates, HTML, CSS, generated, lock files
  { test: (f) => f.endsWith(".css") || f.endsWith(".scss") || f.endsWith(".less"), priority: 4 },
  { test: (f) => f.endsWith(".html") || f.endsWith(".svg"), priority: 4 },
  { test: (f) => f.includes("template") || f.includes("Template"), priority: 4 },
  { test: (f) => f.endsWith(".lock") || f === "package-lock.json" || f === "yarn.lock", priority: 4 },
  { test: (f) => f.includes("dist/") || f.includes("build/") || f.includes("bundle/"), priority: 4 },
  { test: (f) => f.endsWith(".map") || f.endsWith(".d.ts"), priority: 4 },
  { test: (f) => f.endsWith(".snap") || f.endsWith(".fixture"), priority: 4 },
];

export function getFilePriority(filePath: string): Priority {
  for (const rule of PRIORITY_RULES) {
    if (rule.test(filePath)) return rule.priority;
  }
  return 3; // Default to medium
}

interface FileDiff {
  file: string;
  diff: string;
  priority: Priority;
}

export function splitDiffByFile(diff: string): FileDiff[] {
  if (!diff || diff === "(no uncommitted changes)" || diff === "(no committed changes since last synthesis)") {
    return [];
  }

  const files: FileDiff[] = [];
  const chunks = diff.split(/^diff --git /m).filter(Boolean);

  for (const chunk of chunks) {
    // Extract filename from "a/path/to/file b/path/to/file"
    const headerMatch = chunk.match(/^a\/(.+?) b\//);
    const file = headerMatch ? headerMatch[1] : "unknown";
    const fullChunk = "diff --git " + chunk;
    files.push({
      file,
      diff: fullChunk,
      priority: getFilePriority(file),
    });
  }

  // Sort by priority (1 first), then by file name for stability
  files.sort((a, b) => a.priority - b.priority || a.file.localeCompare(b.file));

  return files;
}

export function truncateByPriority(
  files: FileDiff[],
  tokenBudget: number,
  countTokens: (text: string) => number
): { included: string; excluded: string[]; wasTruncated: boolean } {
  const included: string[] = [];
  const excluded: string[] = [];
  let tokensUsed = 0;

  for (const file of files) {
    const tokens = countTokens(file.diff);
    if (tokensUsed + tokens <= tokenBudget) {
      included.push(file.diff);
      tokensUsed += tokens;
    } else {
      excluded.push(`${file.file} (priority ${file.priority})`);
    }
  }

  return {
    included: included.join("\n") || "(no changes fit within token budget)",
    excluded,
    wasTruncated: excluded.length > 0,
  };
}
