// Bundle CLI and MCP server into single CJS files for pkg

import * as esbuild from "esbuild";
import fs from "node:fs";

const DIST = "dist";
const BUNDLE = "bundle";

fs.mkdirSync(BUNDLE, { recursive: true });

// Read the prompt and create a virtual module that returns it
const promptContent = fs.readFileSync("prompts/synthesize.md", "utf-8");

// Plugin: intercept the prompt.js import and inline the content
const inlinePromptPlugin = {
  name: "inline-prompt",
  setup(build) {
    build.onResolve({ filter: /\/prompt\.js$/ }, (args) => ({
      path: "inline-prompt",
      namespace: "inline-prompt",
    }));
    build.onLoad({ filter: /.*/, namespace: "inline-prompt" }, () => ({
      contents: `
        let cached = ${JSON.stringify(promptContent)};
        module.exports.loadPromptTemplate = async function() { return cached; };
      `,
      loader: "js",
    }));
  },
};

const sharedOptions = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  plugins: [inlinePromptPlugin],
  minify: true,
  sourcemap: false,
};

// Bundle CLI
await esbuild.build({
  ...sharedOptions,
  entryPoints: [`${DIST}/cli.js`],
  outfile: `${BUNDLE}/cli.cjs`,
});

// Bundle MCP server
await esbuild.build({
  ...sharedOptions,
  entryPoints: [`${DIST}/index.js`],
  outfile: `${BUNDLE}/index.cjs`,
});

// Verify bundles work
console.log("✓ Bundled cli.cjs and index.cjs");

const cliSize = (fs.statSync(`${BUNDLE}/cli.cjs`).size / 1024).toFixed(0);
const mcpSize = (fs.statSync(`${BUNDLE}/index.cjs`).size / 1024).toFixed(0);
console.log(`  cli.cjs: ${cliSize} KB`);
console.log(`  index.cjs: ${mcpSize} KB`);
