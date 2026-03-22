// Package bundled CJS files into native binaries using pkg

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

const BUNDLE = "bundle";
const BIN = "bin";

fs.mkdirSync(BIN, { recursive: true });

// Determine current platform target
const arch = os.arch(); // arm64, x64
const platform = os.platform(); // darwin, linux, win32

const platformMap = { darwin: "macos", linux: "linux", win32: "win" };
const pkgPlatform = platformMap[platform] || platform;
const target = `node20-${pkgPlatform}-${arch}`;

console.log(`Packaging for ${target} ...`);

// Package CLI binary
console.log("  CLI binary...");
execSync(
  `npx @yao-pkg/pkg ${BUNDLE}/cli.cjs --target ${target} --output ${BIN}/lodestar --compress GZip`,
  { stdio: "inherit" }
);

// Package MCP server binary
console.log("  MCP server binary...");
execSync(
  `npx @yao-pkg/pkg ${BUNDLE}/index.cjs --target ${target} --output ${BIN}/lodestar-mcp --compress GZip`,
  { stdio: "inherit" }
);

console.log("\n✓ Binaries written to bin/");

const files = fs.readdirSync(BIN);
for (const file of files) {
  const stat = fs.statSync(`${BIN}/${file}`);
  const sizeMB = (stat.size / 1024 / 1024).toFixed(1);
  console.log(`  ${file} (${sizeMB} MB)`);
}
