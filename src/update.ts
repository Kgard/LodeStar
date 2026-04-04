// lodestar update — self-updating binary
// Downloads latest release from GitHub, replaces current binary in place.

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { getCurrentVersion } from "./version.js";

const REPO = "Kgard/lodestar-releases";
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

function getTargetName(): string | null {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === "darwin" && arch === "arm64") return "macos-arm64";
  if (platform === "darwin" && arch === "x64") return "macos-x64";
  if (platform === "linux" && arch === "x64") return "linux-x64";
  if (platform === "win32" && arch === "x64") return "windows-x64";
  return null;
}

function findBinaryPath(): string | null {
  // Find where the running binary lives
  const argv0 = process.argv[0];

  // If running via node (dev mode / npm link), resolve the symlink
  try {
    const lodestarPath = execSync("which lodestar", { encoding: "utf-8" }).trim();
    if (lodestarPath) {
      // Resolve symlinks to find the actual file
      const resolved = fs.realpath(lodestarPath);
      return lodestarPath;
    }
  } catch {
    // which failed
  }

  // If running as a compiled binary, argv[0] is the binary itself
  if (!argv0.includes("node")) {
    return argv0;
  }

  return null;
}

export async function runUpdate(): Promise<void> {
  const currentVersion = getCurrentVersion();
  const target = getTargetName();

  if (!target) {
    console.error(`✗ Unsupported platform: ${os.platform()} ${os.arch()}`);
    process.exit(1);
  }

  console.error(`Current version: v${currentVersion}`);
  console.error(`Platform: ${target}`);
  console.error(`Checking for updates...\n`);

  // Fetch latest release
  let latestTag: string;
  let assetUrl: string | null = null;

  try {
    const res = await fetch(RELEASES_URL, {
      headers: { "Accept": "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
    const release = await res.json() as {
      tag_name: string;
      assets: Array<{ name: string; browser_download_url: string }>;
    };

    latestTag = release.tag_name;
    const assetName = `lodestar-${target}.tar.gz`;
    const asset = release.assets.find((a) => a.name === assetName);
    if (asset) assetUrl = asset.browser_download_url;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`✗ Could not check for updates: ${msg}`);
    process.exit(1);
  }

  const latestVersion = latestTag.replace(/^v/, "");
  if (latestVersion === currentVersion) {
    console.error(`✓ Already on the latest version (v${currentVersion})`);
    return;
  }

  if (!assetUrl) {
    console.error(`✗ No release asset found for ${target}`);
    console.error(`  Download manually: https://github.com/${REPO}/releases/latest`);
    process.exit(1);
  }

  console.error(`New version available: v${currentVersion} → v${latestVersion}`);
  console.error(`Downloading ${target}...\n`);

  // Download to temp directory
  const tmpDir = path.join(os.tmpdir(), `lodestar-update-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  const tarPath = path.join(tmpDir, `lodestar-${target}.tar.gz`);

  try {
    const res = await fetch(assetUrl);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(tarPath, buffer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`✗ Download failed: ${msg}`);
    await fs.rm(tmpDir, { recursive: true, force: true });
    process.exit(1);
  }

  // Extract
  try {
    execSync(`tar -xzf "${tarPath}" -C "${tmpDir}"`, { stdio: "ignore" });
  } catch {
    console.error(`✗ Failed to extract archive`);
    await fs.rm(tmpDir, { recursive: true, force: true });
    process.exit(1);
  }

  // Find where to install
  const binaryPath = findBinaryPath();
  const suffix = os.platform() === "win32" ? ".exe" : "";
  const newBinary = path.join(tmpDir, `lodestar${suffix}`);
  const newMcp = path.join(tmpDir, `lodestar-mcp${suffix}`);

  // Verify extracted files exist
  try {
    await fs.access(newBinary);
  } catch {
    console.error(`✗ Extracted archive missing lodestar binary`);
    await fs.rm(tmpDir, { recursive: true, force: true });
    process.exit(1);
  }

  if (binaryPath) {
    // Replace in place
    const binaryDir = path.dirname(binaryPath);
    const installedMcp = path.join(binaryDir, `lodestar-mcp${suffix}`);

    try {
      await fs.copyFile(newBinary, binaryPath);
      await fs.chmod(binaryPath, 0o755);
      console.error(`✓ Updated lodestar → ${binaryPath}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`✗ Could not replace binary: ${msg}`);
      console.error(`  Try: sudo lodestar update`);
      await fs.rm(tmpDir, { recursive: true, force: true });
      process.exit(1);
    }

    // Also update MCP binary if it exists alongside
    try {
      await fs.access(newMcp);
      await fs.copyFile(newMcp, installedMcp);
      await fs.chmod(installedMcp, 0o755);
      console.error(`✓ Updated lodestar-mcp → ${installedMcp}`);
    } catch {
      // MCP binary not found or not installed alongside — skip
    }
  } else {
    // Can't detect install location — copy to /usr/local/bin
    const fallbackDir = "/usr/local/bin";
    const fallbackPath = path.join(fallbackDir, `lodestar${suffix}`);
    const fallbackMcp = path.join(fallbackDir, `lodestar-mcp${suffix}`);

    try {
      await fs.copyFile(newBinary, fallbackPath);
      await fs.chmod(fallbackPath, 0o755);
      console.error(`✓ Installed lodestar → ${fallbackPath}`);

      try {
        await fs.access(newMcp);
        await fs.copyFile(newMcp, fallbackMcp);
        await fs.chmod(fallbackMcp, 0o755);
        console.error(`✓ Installed lodestar-mcp → ${fallbackMcp}`);
      } catch { /* no MCP binary */ }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`✗ Could not install to ${fallbackDir}: ${msg}`);
      console.error(`  Try: sudo lodestar update`);
      console.error(`  Or copy manually from: ${tmpDir}`);
      process.exit(1);
    }
  }

  // Cleanup
  await fs.rm(tmpDir, { recursive: true, force: true });

  console.error(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.error(`✓ Updated to v${latestVersion}`);
  console.error(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}
