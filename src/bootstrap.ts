// lodestar bootstrap — skeleton .lodestar.md for existing codebases
// Zero LLM cost. Reads filesystem and git only.
// Intent fields marked [UNKNOWN] until first real synthesis.

import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { simpleGit } from "simple-git";
import { contextToMarkdown, type LodestarContext, type LodestarFeature, type LodestarIntegration, type LodestarPattern, type LodestarDependency } from "./schema.js";

const LODESTAR_FILENAME = ".lodestar.md";
const BOOTSTRAP_WARNING = "⚠️ BOOTSTRAPPED — not yet synthesized. Intent fields marked [UNKNOWN] will be populated after your first coding session. Run lodestar save after making changes.";

interface BootstrapResult {
  success: boolean;
  path: string;
  summary: string;
  warnings?: string[];
}

async function readPackageJson(projectRoot: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(path.join(projectRoot, "package.json"), "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function readDirectoryTree(projectRoot: string, depth: number = 2): Promise<string[]> {
  const entries: string[] = [];

  async function walk(dir: string, currentDepth: number): Promise<void> {
    if (currentDepth > depth) return;
    try {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        if (item.name.startsWith(".") || item.name === "node_modules" || item.name === "dist" || item.name === "bundle" || item.name === "bin") continue;
        const relative = path.relative(projectRoot, path.join(dir, item.name));
        entries.push(relative + (item.isDirectory() ? "/" : ""));
        if (item.isDirectory()) {
          await walk(path.join(dir, item.name), currentDepth + 1);
        }
      }
    } catch {
      // Permission denied or other error
    }
  }

  await walk(projectRoot, 0);
  return entries;
}

async function readReadme(projectRoot: string): Promise<string | null> {
  for (const name of ["README.md", "readme.md", "Readme.md"]) {
    try {
      const content = await fs.readFile(path.join(projectRoot, name), "utf-8");
      // Return first 500 chars — enough for purpose extraction
      return content.slice(0, 500);
    } catch {
      continue;
    }
  }
  return null;
}

async function getRecentCommits(projectRoot: string): Promise<string[]> {
  try {
    const git = simpleGit(projectRoot);
    const log = await git.raw(["log", "--oneline", "-10"]);
    return log.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

async function detectConfigFiles(projectRoot: string): Promise<string[]> {
  const configNames = [
    "tsconfig.json", "jsconfig.json", "docker-compose.yml", "docker-compose.yaml",
    "Dockerfile", ".env.example", "vercel.json", "netlify.toml", "fly.toml",
    "wrangler.toml", "drizzle.config.ts", "prisma/schema.prisma",
    "supabase/config.toml", "firebase.json", ".github/workflows",
    "Cargo.toml", "pyproject.toml", "go.mod",
  ];
  const found: string[] = [];
  for (const name of configNames) {
    try {
      await fs.access(path.join(projectRoot, name));
      found.push(name);
    } catch {
      continue;
    }
  }
  return found;
}

function extractDependencies(pkg: Record<string, unknown>): LodestarDependency[] {
  const deps: LodestarDependency[] = [];
  const allDeps = {
    ...(pkg.dependencies as Record<string, string> ?? {}),
  };
  for (const [name, _version] of Object.entries(allDeps)) {
    if (name.startsWith("@types/")) continue;
    deps.push({ package: name, purpose: "[UNKNOWN — from package.json]" });
  }
  return deps;
}

function inferIntegrations(pkg: Record<string, unknown> | null, configFiles: string[]): LodestarIntegration[] {
  const integrations: LodestarIntegration[] = [];
  const seen = new Set<string>();

  const add = (name: string, category: LodestarIntegration["category"], purpose: string): void => {
    if (seen.has(name)) return;
    seen.add(name);
    integrations.push({ name, category, purpose });
  };

  // From config files
  if (configFiles.includes("supabase/config.toml")) add("Supabase", "database", "Detected from supabase/config.toml");
  if (configFiles.includes("firebase.json")) add("Firebase", "hosting", "Detected from firebase.json");
  if (configFiles.includes("vercel.json")) add("Vercel", "hosting", "Detected from vercel.json");
  if (configFiles.includes("netlify.toml")) add("Netlify", "hosting", "Detected from netlify.toml");
  if (configFiles.includes("fly.toml")) add("Fly.io", "hosting", "Detected from fly.toml");
  if (configFiles.includes("wrangler.toml")) add("Cloudflare Workers", "hosting", "Detected from wrangler.toml");
  if (configFiles.includes("docker-compose.yml") || configFiles.includes("docker-compose.yaml")) add("Docker", "other", "Detected from docker-compose");
  if (configFiles.includes("prisma/schema.prisma")) add("Prisma", "database", "Detected from prisma/schema.prisma");
  if (configFiles.includes("drizzle.config.ts")) add("Drizzle", "database", "Detected from drizzle.config.ts");
  if (configFiles.includes(".github/workflows")) add("GitHub Actions", "ci-cd", "Detected from .github/workflows");

  // From package.json
  if (pkg) {
    const allDeps = Object.keys(pkg.dependencies as Record<string, string> ?? {});
    if (allDeps.includes("stripe")) add("Stripe", "payments", "Detected from package.json");
    if (allDeps.includes("@supabase/supabase-js")) add("Supabase", "database", "Detected from package.json");
    if (allDeps.includes("@aws-sdk/client-s3")) add("AWS S3", "storage", "Detected from package.json");
    if (allDeps.includes("@sentry/node")) add("Sentry", "monitoring", "Detected from package.json");
    if (allDeps.includes("next-auth") || allDeps.includes("@auth/core")) add("Auth.js", "auth", "Detected from package.json");
    if (allDeps.includes("@clerk/nextjs")) add("Clerk", "auth", "Detected from package.json");
  }

  return integrations;
}

function inferPatterns(tree: string[]): LodestarPattern[] {
  const patterns: LodestarPattern[] = [];

  const dirs = tree.filter((t) => t.endsWith("/"));
  if (dirs.some((d) => d.startsWith("src/"))) {
    patterns.push({ pattern: "Source code under src/", location: "src/" });
  }
  if (dirs.some((d) => d.includes("routes/") || d.includes("api/"))) {
    patterns.push({ pattern: "Route-based file organization", location: dirs.find((d) => d.includes("routes/") || d.includes("api/")) ?? "src/" });
  }
  if (dirs.some((d) => d.includes("components/"))) {
    patterns.push({ pattern: "Component-based UI architecture", location: dirs.find((d) => d.includes("components/")) ?? "src/" });
  }
  if (dirs.some((d) => d.includes("tests/") || d.includes("__tests__/"))) {
    patterns.push({ pattern: "Dedicated test directory", location: dirs.find((d) => d.includes("tests/") || d.includes("__tests__/")) ?? "tests/" });
  }

  return patterns.slice(0, 5);
}

function extractProjectSummary(readme: string | null, pkg: Record<string, unknown> | null): string {
  if (pkg?.description && typeof pkg.description === "string" && pkg.description.length > 10) {
    return pkg.description;
  }
  if (readme) {
    // Try first paragraph after title
    const lines = readme.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
    if (lines.length > 0) {
      return lines[0].trim().slice(0, 200);
    }
  }
  return "[UNKNOWN — add a project description to package.json or README.md]";
}

export async function bootstrap(projectRoot: string): Promise<BootstrapResult> {
  const resolved = path.resolve(projectRoot);
  const filePath = path.join(resolved, LODESTAR_FILENAME);
  const projectName = path.basename(resolved);
  const warnings: string[] = [];

  // Check if .lodestar.md already exists
  try {
    await fs.access(filePath);
    return {
      success: false,
      path: filePath,
      summary: ".lodestar.md already exists. Use lodestar save to update it.",
    };
  } catch {
    // Good — no existing file
  }

  // Gather evidence
  const pkg = await readPackageJson(resolved);
  const tree = await readDirectoryTree(resolved);
  const readme = await readReadme(resolved);
  const commits = await getRecentCommits(resolved);
  const configFiles = await detectConfigFiles(resolved);

  if (tree.length === 0 && !pkg && commits.length === 0) {
    return {
      success: false,
      path: filePath,
      summary: "Empty project — nothing to bootstrap. Start coding and run lodestar save.",
    };
  }

  // Build context from evidence
  const context: LodestarContext = {
    meta: {
      project: projectName,
      date: new Date().toISOString().slice(0, 10),
      model: "bootstrap (no LLM)",
    },
    projectSummary: extractProjectSummary(readme, pkg),
    userSegments: [],
    integrations: inferIntegrations(pkg, configFiles),
    features: [],
    futurePhases: [],
    diagrams: [],
    decisions: [],
    patterns: inferPatterns(tree),
    dependencies: pkg ? extractDependencies(pkg) : [],
    rejected: [],
    openQuestions: [],
    nextSession: [
      BOOTSTRAP_WARNING,
      "Run lodestar save after your next coding session to populate decisions, rationale, and open questions.",
    ],
  };

  if (context.integrations.length === 0) {
    warnings.push("No integrations detected from config files or dependencies");
  }

  // Write context
  const markdown = contextToMarkdown(context);
  const tmpPath = path.join(
    os.tmpdir(),
    `lodestar-bootstrap-${Date.now()}-${Math.random().toString(36).slice(2)}.md`
  );
  await fs.writeFile(tmpPath, markdown, "utf-8");
  await fs.rename(tmpPath, filePath);

  const depCount = context.dependencies.length;
  const intCount = context.integrations.length;
  const patternCount = context.patterns.length;

  return {
    success: true,
    path: filePath,
    summary: `Bootstrapped ${projectName}: ${depCount} deps, ${intCount} integrations, ${patternCount} patterns. No LLM call.`,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
