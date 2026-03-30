// Package bundled CJS files into native binaries using pkg
//
// Cross-compilation note: pkg needs to execute the target binary during
// fabrication. On Apple Silicon, building macos-x64 requires Rosetta and
// may fail locally. Use GitHub Actions for full cross-platform builds.

import { execSync } from "node:child_process";
import fs from "node:fs";
import crypto from "node:crypto";

const BUNDLE = "bundle";
const BIN = "bin";

const TARGETS = [
  { name: "macos-arm64", pkg: "node20-macos-arm64", suffix: "" },
  { name: "macos-x64", pkg: "node20-macos-x64", suffix: "" },
  { name: "linux-x64", pkg: "node20-linux-x64", suffix: "" },
  { name: "windows-x64", pkg: "node20-win-x64", suffix: ".exe" },
];

// Allow filtering: npm run package -- --target=macos-arm64
const filterArg = process.argv.find((a) => a.startsWith("--target="));
const filterTarget = filterArg ? filterArg.split("=")[1] : null;
const targets = filterTarget
  ? TARGETS.filter((t) => t.name === filterTarget)
  : TARGETS;

if (targets.length === 0) {
  console.error(`Unknown target: ${filterTarget}`);
  console.error(`Available: ${TARGETS.map((t) => t.name).join(", ")}`);
  process.exit(1);
}

fs.mkdirSync(BIN, { recursive: true });

const checksums = [];
const succeeded = [];
const failed = [];

for (const target of targets) {
  const dir = `${BIN}/${target.name}`;
  fs.mkdirSync(dir, { recursive: true });

  console.log(`\nPackaging ${target.name} ...`);

  try {
    // CLI
    const cliBin = `${dir}/lodestar${target.suffix}`;
    console.log("  CLI binary...");
    execSync(
      `npx @yao-pkg/pkg ${BUNDLE}/cli.cjs --target ${target.pkg} --output ${cliBin} --compress GZip`,
      { stdio: "inherit" }
    );

    // MCP server
    const mcpBin = `${dir}/lodestar-mcp${target.suffix}`;
    console.log("  MCP server binary...");
    execSync(
      `npx @yao-pkg/pkg ${BUNDLE}/index.cjs --target ${target.pkg} --output ${mcpBin} --compress GZip`,
      { stdio: "inherit" }
    );

    // Checksums
    for (const file of [cliBin, mcpBin]) {
      const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
      const name = file.replace(`${BIN}/`, "");
      checksums.push(`${hash}  ${name}`);
    }

    succeeded.push(target.name);
  } catch (err) {
    console.error(`  ✗ ${target.name} failed — skipping (${err.message.split("\n")[0]})`);
    // Clean up partial output
    fs.rmSync(dir, { recursive: true, force: true });
    failed.push(target.name);
  }
}

// Write checksums file
if (checksums.length > 0) {
  fs.writeFileSync(`${BIN}/SHA256SUMS`, checksums.join("\n") + "\n");
}

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

if (succeeded.length > 0) {
  console.log(`✓ Built: ${succeeded.join(", ")}\n`);
  for (const name of succeeded) {
    const dir = `${BIN}/${name}`;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const sizeMB = (fs.statSync(`${dir}/${file}`).size / 1024 / 1024).toFixed(1);
      console.log(`  ${name}/${file} (${sizeMB} MB)`);
    }
  }
  console.log(`\n✓ SHA256SUMS written to bin/SHA256SUMS`);
}

if (failed.length > 0) {
  console.log(`\n✗ Failed: ${failed.join(", ")}`);
  console.log(`  Use GitHub Actions to cross-compile these targets.`);
}
