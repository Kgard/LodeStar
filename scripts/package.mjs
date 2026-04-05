// Package bundled CJS into a native binary using pkg
// Single binary: `lodestar` handles both CLI and MCP server (`lodestar mcp`)

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
    const binPath = `${dir}/lodestar${target.suffix}`;
    execSync(
      `npx @yao-pkg/pkg ${BUNDLE}/cli.cjs --target ${target.pkg} --output ${binPath} --compress GZip`,
      { stdio: "inherit" }
    );

    const hash = crypto.createHash("sha256").update(fs.readFileSync(binPath)).digest("hex");
    checksums.push(`${hash}  ${target.name}/lodestar${target.suffix}`);

    succeeded.push(target.name);
  } catch (err) {
    console.error(`  ✗ ${target.name} failed — skipping (${err.message.split("\n")[0]})`);
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
