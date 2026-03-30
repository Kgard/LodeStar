// lodestar init CLI wizard

import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { select, input, confirm, checkbox } from "@inquirer/prompts";
import open from "open";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { synthesizeContext } from "./synthesize.js";
import {
  writeConfig,
  readConfig,
  getConfigPath,
  type LodestarConfig,
  type ProviderName,
} from "./config.js";

const BANNER = `
╔═══════════════════════════════════════════╗
║  Lodestar — Kylex Module 00             ║
║  First-run setup                          ║
╚═══════════════════════════════════════════╝
`;

interface CodingTool {
  name: string;
  configPath: string;
  configKey: string;
}

function getCodingTools(): CodingTool[] {
  const home = os.homedir();
  const platform = process.platform;

  const tools: CodingTool[] = [];

  // Claude Desktop
  if (platform === "darwin") {
    tools.push({
      name: "Claude Desktop",
      configPath: path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
      configKey: "mcpServers",
    });
  } else if (platform === "win32") {
    tools.push({
      name: "Claude Desktop",
      configPath: path.join(home, "AppData", "Roaming", "Claude", "claude_desktop_config.json"),
      configKey: "mcpServers",
    });
  }

  // Claude Code
  tools.push({
    name: "Claude Code",
    configPath: path.join(home, ".claude", "mcp.json"),
    configKey: "mcpServers",
  });

  // Cursor (global)
  tools.push({
    name: "Cursor (global)",
    configPath: path.join(home, ".cursor", "mcp.json"),
    configKey: "mcpServers",
  });

  // Windsurf
  tools.push({
    name: "Windsurf",
    configPath: path.join(home, ".codeium", "windsurf", "mcp_config.json"),
    configKey: "mcpServers",
  });

  return tools;
}

async function detectInstalledTools(): Promise<CodingTool[]> {
  const tools = getCodingTools();
  const installed: CodingTool[] = [];

  for (const tool of tools) {
    try {
      // Check if the config file or its parent directory exists
      const dir = path.dirname(tool.configPath);
      await fs.access(dir);
      installed.push(tool);
    } catch {
      // Tool not installed
    }
  }

  return installed;
}

function getLodestarServerEntry(): Record<string, unknown> {
  // Resolve index.js relative to this file
  // Works in both ESM (import.meta.url) and CJS (__dirname) contexts
  let dir: string;
  try {
    dir = path.dirname(new URL(import.meta.url).pathname);
  } catch {
    dir = __dirname;
  }
  const indexPath = path.resolve(dir, "index.js");
  return {
    command: "node",
    args: [indexPath],
  };
}

async function addToToolConfig(tool: CodingTool): Promise<{ success: boolean; message: string }> {
  const entry = getLodestarServerEntry();

  let existing: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(tool.configPath, "utf-8");
    existing = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // File doesn't exist or is invalid — start fresh
  }

  const servers = (existing[tool.configKey] ?? {}) as Record<string, unknown>;

  if (servers["lodestar"]) {
    servers["lodestar"] = entry;
    existing[tool.configKey] = servers;
    await fs.mkdir(path.dirname(tool.configPath), { recursive: true });
    await fs.writeFile(tool.configPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
    return { success: true, message: `Updated existing Lodestar entry in ${tool.name}` };
  }

  servers["lodestar"] = entry;
  existing[tool.configKey] = servers;
  await fs.mkdir(path.dirname(tool.configPath), { recursive: true });
  await fs.writeFile(tool.configPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
  return { success: true, message: `Added Lodestar to ${tool.name}` };
}

const CURSOR_RULES = `# Lodestar — Session Context

This project uses Lodestar for session context management. A .lodestar.md file in the project root contains decisions, patterns, and open questions from previous coding sessions.

## At the start of every session
Call lodestar_load with projectRoot set to the workspace root. Read the returned context to understand what was decided previously.

## At the end of every session
Call lodestar_synthesize with projectRoot set to the workspace root. Include any notes the user mentions in sessionNotes.

## Key commands
- "lodestar start" / "load context" → call lodestar_load
- "lodestar save" / "save session" → call lodestar_synthesize
- "lodestar end" / "end session" → call lodestar_synthesize

## Rules
- Always use the workspace root as projectRoot
- Don't modify .lodestar.md directly — only Lodestar writes to it
`;

async function writeCursorRules(projectRoot: string): Promise<void> {
  const rulesPath = path.join(projectRoot, ".cursorrules");
  try {
    await fs.access(rulesPath);
    // File exists — check if it already has Lodestar
    const existing = await fs.readFile(rulesPath, "utf-8");
    if (existing.includes("Lodestar")) return;
    // Append
    await fs.writeFile(rulesPath, existing.trimEnd() + "\n\n" + CURSOR_RULES, "utf-8");
  } catch {
    // Doesn't exist — create
    await fs.writeFile(rulesPath, CURSOR_RULES, "utf-8");
  }
}

async function setupToolIntegration(): Promise<void> {
  const installed = await detectInstalledTools();

  if (installed.length === 0) {
    console.error("\nNo supported coding tools detected. You can manually add Lodestar later.");
    console.error(`Server path: ${getLodestarServerEntry().args}\n`);
    return;
  }

  const selected = await checkbox({
    message: "Which coding tools should Lodestar connect to?",
    choices: installed.map((tool) => ({
      name: tool.name,
      value: tool,
      checked: true,
    })),
  });

  if (selected.length === 0) {
    console.error("\nSkipped tool integration. You can add Lodestar manually later.\n");
    return;
  }

  console.error("");
  let cursorSelected = false;
  for (const tool of selected) {
    try {
      const result = await addToToolConfig(tool);
      console.error(`✓ ${result.message}`);
      if (tool.name.toLowerCase().includes("cursor")) {
        cursorSelected = true;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`✗ Failed to configure ${tool.name}: ${message}`);
    }
  }

  // Write .cursorrules if Cursor was selected
  if (cursorSelected) {
    try {
      await writeCursorRules(process.cwd());
      console.error(`✓ Added .cursorrules for Cursor AI context`);
    } catch {
      // Non-blocking
    }
  }
  console.error("");
}

async function validateAnthropicKey(apiKey: string): Promise<boolean> {
  try {
    const client = new Anthropic({ apiKey });
    await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    });
    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("authentication") || message.includes("401")) {
      return false;
    }
    return true;
  }
}

async function validateOpenAIKey(apiKey: string): Promise<boolean> {
  try {
    const client = new OpenAI({ apiKey });
    await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    });
    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("Incorrect API key") || message.includes("401")) {
      return false;
    }
    return true;
  }
}

async function validateGoogleKey(apiKey: string): Promise<boolean> {
  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });
    await model.generateContent("hi");
    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("API_KEY_INVALID") || message.includes("401") || message.includes("403")) {
      return false;
    }
    return true;
  }
}

async function validateAzure(apiKey: string, endpoint: string): Promise<boolean> {
  try {
    const { AzureOpenAI } = await import("openai");
    const client = new AzureOpenAI({
      apiKey,
      endpoint,
      apiVersion: "2024-12-01-preview",
    });
    await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    });
    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("401") || message.includes("403") || message.includes("Unauthorized")) {
      return false;
    }
    return true;
  }
}

async function setupAzure(): Promise<{ apiKey: string; endpoint: string }> {
  const endpoint = await input({
    message: "Azure OpenAI endpoint URL (e.g. https://your-resource.openai.azure.com):",
  });

  const apiKey = await input({
    message: "Azure OpenAI API key:",
  });

  console.error("Validating connection...");
  const valid = await validateAzure(apiKey.trim(), endpoint.trim());

  if (!valid) {
    console.error("✗ Could not authenticate. Check your endpoint and key.\n");
  } else {
    console.error("✓ Connected\n");
  }

  return { apiKey: apiKey.trim(), endpoint: endpoint.trim() };
}

async function validateOllama(host: string): Promise<boolean> {
  try {
    const response = await fetch(`${host}/api/tags`);
    return response.ok;
  } catch {
    return false;
  }
}

async function getApiKey(
  providerLabel: string,
  consoleUrl: string,
  validateFn: (key: string) => Promise<boolean>
): Promise<string> {
  const hasKey = await select({
    message: `Do you have ${providerLabel} API key?`,
    choices: [
      { name: "Yes — I'll paste it now", value: "yes" },
      { name: `No — open the ${providerLabel} console for me`, value: "no" },
    ],
  });

  if (hasKey === "no") {
    console.error(`\nOpening ${consoleUrl} ...`);
    await open(consoleUrl);
    console.error("Once you've created a key, paste it below.\n");
  }

  while (true) {
    const apiKey = await input({
      message: "Paste your API key:",
    });

    if (!apiKey.trim()) {
      console.error("Key cannot be empty. Try again.");
      continue;
    }

    console.error("Validating key...");
    const valid = await validateFn(apiKey.trim());

    if (valid) {
      console.error("✓ Key validated\n");
      return apiKey.trim();
    }

    console.error("✗ Key validation failed. Please check and try again.\n");
  }
}

async function setupOllama(): Promise<{ model: string; host: string }> {
  console.error("\nOllama runs locally — no API key needed.\n");

  const installed = await select({
    message: "Is Ollama already installed?",
    choices: [
      { name: "Yes — it's running on localhost:11434", value: "yes" },
      { name: "No — open the Ollama install page for me", value: "no" },
    ],
  });

  let host = "http://localhost:11434";

  if (installed === "no") {
    console.error("\nOpening https://ollama.ai/download ...");
    await open("https://ollama.ai/download");
    console.error("Once installed, run: ollama pull llama3.2\n");
    await input({ message: "Press Enter to continue..." });
  }

  console.error("Checking Ollama connection...");
  const valid = await validateOllama(host);

  if (!valid) {
    console.error("✗ Could not connect to Ollama at " + host);
    host = await input({
      message: "Enter your Ollama host (or press Enter for default):",
      default: host,
    });

    const retry = await validateOllama(host);
    if (!retry) {
      console.error("✗ Still cannot connect. Saving config anyway — make sure Ollama is running before using Lodestar.\n");
    } else {
      console.error("✓ Connected\n");
    }
  } else {
    console.error("✓ Connected\n");
  }

  const model = await input({
    message: "Which model? (default: llama3.2)",
    default: "llama3.2",
  });

  return { model, host };
}

async function resolveProjectPath(): Promise<string | null> {
  while (true) {
    const projectPath = await input({
      message: "Path to your project (or press Enter for current directory):",
      default: process.cwd(),
    });

    const resolved = path.resolve(projectPath);

    try {
      const stat = await fs.stat(resolved);
      if (!stat.isDirectory()) {
        console.error(`✗ ${resolved} is not a directory.\n`);
        const retry = await confirm({ message: "Try a different path?", default: true });
        if (!retry) return null;
        continue;
      }
    } catch {
      console.error(`✗ ${resolved} does not exist.\n`);
      const retry = await confirm({ message: "Try a different path?", default: true });
      if (!retry) return null;
      continue;
    }

    return resolved;
  }
}

async function hasExistingCode(projectRoot: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(projectRoot);
    return entries.some((e) => e === "package.json" || e === "Cargo.toml" || e === "pyproject.toml" || e === "go.mod" || e === "src");
  } catch {
    return false;
  }
}

async function hasLodestarContext(projectRoot: string): Promise<boolean> {
  try {
    await fs.access(path.join(projectRoot, ".lodestar.md"));
    return true;
  } catch {
    return false;
  }
}

async function isGitInstalled(): Promise<boolean> {
  try {
    const { execSync } = await import("node:child_process");
    execSync("git --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function installGitViaBrew(): Promise<boolean> {
  try {
    const { execSync } = await import("node:child_process");
    // Check if brew is available
    execSync("brew --version", { stdio: "ignore" });
    console.error("Installing git via Homebrew...\n");
    execSync("brew install git", { stdio: "inherit" });
    console.error("\n✓ Git installed\n");
    return true;
  } catch {
    return false;
  }
}

function getGitVersion(): string | null {
  try {
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const output = execSync("git --version", { encoding: "utf-8" }).trim();
    // "git version 2.39.0" → "2.39.0"
    const match = output.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : output;
  } catch {
    return null;
  }
}

async function ensureGitInstalled(): Promise<boolean> {
  if (await isGitInstalled()) return true;

  console.error("\n  Git is required for Lodestar to track changes between sessions.\n");

  const platform = process.platform;

  if (platform === "darwin") {
    const action = await select({
      message: "Git is not installed. How would you like to install it?",
      choices: [
        { name: "Install via Homebrew (recommended)", value: "brew" },
        { name: "Install via Xcode Command Line Tools", value: "xcode" },
        { name: "I'll install it myself", value: "manual" },
      ],
    });

    if (action === "brew") {
      const success = await installGitViaBrew();
      if (!success) {
        console.error("✗ Homebrew not found or install failed.\n");
        console.error("  Install Homebrew first: https://brew.sh\n");
        console.error("  Then re-run: lodestar init\n");
        return false;
      }
      const version = getGitVersion();
      console.error(`✓ Git installed${version ? ` (v${version})` : ""}\n`);
      const cont = await confirm({ message: "Continue with Lodestar setup?", default: true });
      return cont;
    } else if (action === "xcode") {
      console.error("\nRunning: xcode-select --install\n");
      try {
        const { execSync } = await import("node:child_process");
        execSync("xcode-select --install", { stdio: "inherit" });
      } catch {
        // The command opens a system dialog — "error" is expected
      }
      // Wait and check if it worked
      console.error("\nChecking for git...");
      // Give the user a moment
      await input({ message: "Press Enter once the Xcode install completes..." });
      if (await isGitInstalled()) {
        const version = getGitVersion();
        console.error(`✓ Git installed${version ? ` (v${version})` : ""}\n`);
        const cont = await confirm({ message: "Continue with Lodestar setup?", default: true });
        return cont;
      }
      console.error("✗ Git still not found. Re-run lodestar init after installation completes.\n");
      return false;
    } else {
      console.error("\n  Install git from https://git-scm.com/download");
      console.error("  Then re-run: lodestar init\n");
      return false;
    }
  } else if (platform === "linux") {
    console.error("  Install git with your package manager:");
    console.error("    Ubuntu/Debian: sudo apt install git");
    console.error("    Fedora: sudo dnf install git");
    console.error("    Arch: sudo pacman -S git\n");
    console.error("  Then re-run: lodestar init\n");
    return false;
  } else {
    console.error("  Install git from https://git-scm.com/download");
    console.error("  Then re-run: lodestar init\n");
    return false;
  }
}

async function isGitRepo(projectRoot: string): Promise<boolean> {
  try {
    const { simpleGit } = await import("simple-git");
    const git = simpleGit(projectRoot);
    return await git.checkIsRepo();
  } catch {
    return false;
  }
}

async function ensureGitRepo(projectRoot: string): Promise<boolean> {
  if (await isGitRepo(projectRoot)) return true;

  console.error(`\n  This directory is not a git repository.`);
  console.error(`  Lodestar uses git to track changes between sessions.\n`);

  const shouldInit = await confirm({
    message: "Initialize a git repository here?",
    default: true,
  });

  if (!shouldInit) {
    console.error("\n⚠ Lodestar requires git. You can run 'git init' later and re-run 'lodestar init'.\n");
    return false;
  }

  try {
    const { simpleGit } = await import("simple-git");
    const git = simpleGit(projectRoot);
    await git.init();
    console.error("✓ Git repository initialized\n");
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`✗ Could not initialize git: ${msg}\n`);
    return false;
  }
}

// Tracks the project path chosen during init for use in hooks and completion message
let onboardedProjectPath: string | null = null;

async function onboardProject(): Promise<void> {
  const projectType = await select({
    message: "What kind of project?",
    choices: [
      { name: "New project — I'm starting fresh", value: "new" },
      { name: "Existing project — I have code already", value: "existing" },
    ],
  });

  const resolved = await resolveProjectPath();
  if (!resolved) return;

  // Ensure git is set up
  const gitReady = await ensureGitRepo(resolved);
  if (!gitReady) return;

  onboardedProjectPath = resolved;

  if (projectType === "existing") {
    const hasContext = await hasLodestarContext(resolved);
    const hasCode = await hasExistingCode(resolved);

    if (hasContext) {
      console.error(`\nFound existing .lodestar.md — running synthesis to refresh...`);
      const result = await synthesizeContext({ projectRoot: resolved });
      if (!result.success) {
        console.error(`✗ ${result.summary}\n`);
        return;
      }
      console.error(`✓ ${result.summary}`);
      console.error(`  Written to ${result.path}`);
    } else if (hasCode) {
      console.error(`\n  This project has existing code but no .lodestar.md.\n`);

      const mode = await select({
        message: "How should Lodestar analyze your project?",
        choices: [
          { name: "Quick scan — capture project structure (no AI cost)", value: "bootstrap" },
          { name: "Full analysis — AI reads your code and generates a project brief", value: "synthesize" },
        ],
      });

      if (mode === "bootstrap") {
        const { bootstrap } = await import("./bootstrap.js");
        const result = await bootstrap(resolved);
        if (!result.success) {
          console.error(`✗ ${result.summary}\n`);
          return;
        }
        console.error(`✓ ${result.summary}`);
        console.error(`  Written to ${result.path}`);
      } else {
        console.error(`\nSynthesizing ${resolved} ...`);
        const result = await synthesizeContext({ projectRoot: resolved });
        if (!result.success) {
          console.error(`✗ ${result.summary}\n`);
          return;
        }
        console.error(`✓ ${result.summary}`);
        console.error(`  Written to ${result.path}`);
      }
    } else {
      console.error(`\nNo existing code detected — treating as a new project.`);
      console.error(`Lodestar will capture context after your first coding session.\n`);
    }
  } else {
    console.error(`\nLodestar will capture context after your first coding session.\n`);
  }

  console.error("");
}

export async function runInit(): Promise<void> {
  console.error(BANNER);

  // Step 0: Ensure git is installed
  const gitInstalled = await ensureGitInstalled();
  if (!gitInstalled) return;

  // Step 1: Check for existing config
  const existing = await readConfig();
  let needsApiSetup = true;

  if (existing.config) {
    console.error(`Existing config found: ${existing.config.provider} (${existing.config.model})\n`);

    const action = await select({
      message: "What would you like to do?",
      choices: [
        { name: "Keep current config", value: "keep" },
        { name: "Switch provider or update API key", value: "reconfigure" },
      ],
    });

    if (action === "keep") {
      console.error(`\n✓ Keeping existing config\n`);
      needsApiSetup = false;
    }
  }

  // Step 2: API onboarding (if needed)
  if (needsApiSetup) {
    const provider = await select<ProviderName>({
      message: "Which AI provider do you use for coding?",
      choices: [
        { name: "Anthropic (Claude) — recommended", value: "anthropic" },
        { name: "OpenAI (GPT-4o, o3)", value: "openai" },
        { name: "Google (Gemini 2.5 Pro)", value: "google" },
        { name: "Azure OpenAI", value: "azure" },
        { name: "Ollama (local — no API key needed)", value: "ollama" },
      ],
    });

    let config: LodestarConfig;

    // Reuse existing API key if same provider selected
    const reuseKey =
      existing.config &&
      existing.config.provider === provider &&
      existing.config.apiKey;

    switch (provider) {
      case "anthropic": {
        let apiKey: string;
        if (reuseKey) {
          console.error("\n✓ Reusing existing Anthropic API key\n");
          apiKey = existing.config!.apiKey!;
        } else {
          apiKey = await getApiKey(
            "an Anthropic",
            "https://console.anthropic.com/settings/keys",
            validateAnthropicKey
          );
        }
        config = { provider: "anthropic", model: "claude-sonnet-4-6", apiKey };
        break;
      }
      case "openai": {
        let apiKey: string;
        if (reuseKey) {
          console.error("\n✓ Reusing existing OpenAI API key\n");
          apiKey = existing.config!.apiKey!;
        } else {
          apiKey = await getApiKey(
            "an OpenAI",
            "https://platform.openai.com/api-keys",
            validateOpenAIKey
          );
        }
        config = { provider: "openai", model: "gpt-4o", apiKey };
        break;
      }
      case "google": {
        let apiKey: string;
        if (reuseKey) {
          console.error("\n✓ Reusing existing Google API key\n");
          apiKey = existing.config!.apiKey!;
        } else {
          apiKey = await getApiKey(
            "a Google AI",
            "https://aistudio.google.com/apikey",
            validateGoogleKey
          );
        }
        config = { provider: "google", model: "gemini-2.5-pro", apiKey };
        break;
      }
      case "azure": {
        const azure = await setupAzure();
        config = {
          provider: "azure",
          model: "gpt-4o",
          apiKey: azure.apiKey,
          azureEndpoint: azure.endpoint,
          azureApiVersion: "2024-12-01-preview",
        };
        break;
      }
      case "ollama": {
        const { model, host } = await setupOllama();
        config = { provider: "ollama", model, ollamaHost: host };
        break;
      }
    }

    await writeConfig(config);
    console.error(`✓ Config saved to ${getConfigPath()}\n`);
  }

  // Step 3: New or existing project?
  await onboardProject();

  // Step 4: Configure coding tools
  await setupToolIntegration();

  // Step 5: Auto-install all hooks
  console.error("Installing hooks...\n");

  // Git hooks — install in the project directory
  const hookRoot = onboardedProjectPath ?? process.cwd();
  let gitHooksInstalled = false;
  try {
    const { installHooks } = await import("./hooks.js");
    const results = await installHooks(hookRoot);
    for (const r of results) {
      console.error(`${r.installed ? "✓" : "✗"} ${r.message}`);
    }
    gitHooksInstalled = results.some((r) => r.installed);
  } catch {
    console.error("⚠ Could not install git hooks — you can add them later with lodestar hooks");
  }

  // Claude Code session hooks — auto-install in the project directory
  let sessionHooksInstalled = false;
  const claudeSettingsDir = path.join(hookRoot, ".claude");
  const claudeSettingsPath = path.join(claudeSettingsDir, "settings.json");
  try {
    await fs.mkdir(claudeSettingsDir, { recursive: true });

    let settings: Record<string, unknown> = {};
    try {
      const raw = await fs.readFile(claudeSettingsPath, "utf-8");
      settings = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // New file
    }

    const hooks = (settings.hooks ?? {}) as Record<string, unknown>;

    const sessionStart = (hooks.SessionStart ?? []) as Array<Record<string, unknown>>;
    const startInstalled = sessionStart.some((h) =>
      typeof h.command === "string" && h.command.includes("lodestar")
    );
    if (!startInstalled) {
      sessionStart.push({
        command: "lodestar summary --project .",
        event: "SessionStart",
      });
      hooks.SessionStart = sessionStart;
    }

    const sessionEnd = (hooks.SessionEnd ?? []) as Array<Record<string, unknown>>;
    const endInstalled = sessionEnd.some((h) =>
      typeof h.command === "string" && h.command.includes("lodestar")
    );
    if (!endInstalled) {
      sessionEnd.push({
        command: "lodestar end --project .",
        event: "SessionEnd",
      });
      hooks.SessionEnd = sessionEnd;
    }

    settings.hooks = hooks;
    await fs.writeFile(claudeSettingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");

    if (!startInstalled || !endInstalled) {
      console.error("✓ Claude Code session hooks installed (auto-load + auto-save)");
      sessionHooksInstalled = true;
    } else {
      console.error("✓ Claude Code session hooks already installed");
      sessionHooksInstalled = true;
    }
  } catch {
    // Claude Code not available — not an error
  }

  // Step 6: Completion message
  const projectDisplay = onboardedProjectPath ?? process.cwd();
  const hasClaudeDesktop = (await detectInstalledTools()).some((t) => t.name === "Claude Desktop");

  console.error("");
  if (sessionHooksInstalled) {
    console.error(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Lodestar is ready. Sessions are managed automatically.

  Project: ${projectDisplay}

  lodestar review      Open the project dashboard
  lodestar save        Manual checkpoint (optional)
${hasClaudeDesktop ? `
  ⚠ Restart Claude Desktop to activate the MCP connection.
    After restarting, you can ask Claude to "load lodestar context"
    or "synthesize this session" and it will use the MCP tools.
` : ""}${gitHooksInstalled ? "  Git hooks active — auto-updates on commit, full sync on push.\n" : ""}
Sign up for Kylex updates: kylex.io
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  } else {
    // No session hooks — user needs to know about manual commands
    console.error(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Lodestar is ready.

  Project: ${projectDisplay}

Your tool doesn't support session hooks yet, so manage
sessions manually:

  lodestar start       Load context at the start of a session
  lodestar end         Save + commit at the end of a session
  lodestar review      Open the project dashboard
${hasClaudeDesktop ? `
  ⚠ Restart Claude Desktop to activate the MCP connection.
    After restarting, you can ask Claude to "load lodestar context"
    or "synthesize this session" and it will use the MCP tools.
` : ""}${gitHooksInstalled ? "  Git hooks active — auto-updates on commit, full sync on push.\n" : ""}
Sign up for Kylex updates: kylex.io
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }
}
