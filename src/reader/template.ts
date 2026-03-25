// Self-contained HTML reader for .lodestar.md
// All CSS and JS inline — no external dependencies, works offline

import type { LodestarContext } from "../schema.js";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderDiffPanel(
  current: LodestarContext,
  previous: LodestarContext
): string {
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];

  // Decisions
  const prevDecisions = new Set(previous.decisions.map((d) => d.decision));
  const currDecisions = new Set(current.decisions.map((d) => d.decision));
  let newDecisions = 0;
  for (const d of current.decisions) {
    if (!prevDecisions.has(d.decision)) newDecisions++;
  }
  let removedDecisions = 0;
  for (const d of previous.decisions) {
    if (!currDecisions.has(d.decision)) removedDecisions++;
  }
  if (newDecisions > 0) added.push(`${newDecisions} new decision${newDecisions !== 1 ? "s" : ""}`);
  if (removedDecisions > 0) removed.push(`${removedDecisions} decision${removedDecisions !== 1 ? "s" : ""} resolved`);

  // Dependencies
  const prevDeps = new Set(previous.dependencies.map((d) => d.package));
  const newDeps = current.dependencies.filter((d) => !prevDeps.has(d.package));
  if (newDeps.length > 0) {
    added.push(`${newDeps.length} new dep${newDeps.length !== 1 ? "s" : ""} (${newDeps.map((d) => d.package).join(", ")})`);
  }

  // Open questions
  const prevQs = new Set(previous.openQuestions.map((q) => q.question));
  const currQs = new Set(current.openQuestions.map((q) => q.question));
  let newQs = 0;
  for (const q of current.openQuestions) {
    if (!prevQs.has(q.question)) newQs++;
  }
  let resolvedQs = 0;
  for (const q of previous.openQuestions) {
    if (!currQs.has(q.question)) resolvedQs++;
  }
  if (newQs > 0) added.push(`${newQs} new question${newQs !== 1 ? "s" : ""}`);
  if (resolvedQs > 0) removed.push(`${resolvedQs} question${resolvedQs !== 1 ? "s" : ""} resolved`);

  // Patterns
  const prevPatterns = new Set(previous.patterns.map((p) => p.pattern));
  const newPatterns = current.patterns.filter((p) => !prevPatterns.has(p.pattern));
  if (newPatterns.length > 0) added.push(`${newPatterns.length} new pattern${newPatterns.length !== 1 ? "s" : ""}`);

  if (added.length === 0 && changed.length === 0 && removed.length === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push(`<div class="diff-panel">`);
  lines.push(`<div class="diff-header">CHANGES SINCE LAST SESSION &middot; ${escapeHtml(previous.meta.date)}</div>`);
  for (const a of added) lines.push(`<div class="diff-add">+ ${escapeHtml(a)}</div>`);
  for (const c of changed) lines.push(`<div class="diff-change">~ ${escapeHtml(c)}</div>`);
  for (const r of removed) lines.push(`<div class="diff-remove">&minus; ${escapeHtml(r)}</div>`);
  lines.push(`</div>`);

  return lines.join("\n");
}

function extractHtmlBody(html: string): string {
  // Extract the <style> blocks and body content, drop doctype/html/head wrapper
  const styles: string[] = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleRegex.exec(html)) !== null) {
    styles.push(`<style>${m[1]}</style>`);
  }

  // Extract body content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : html;

  // Extract any scripts
  const scripts: string[] = [];
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = scriptRegex.exec(bodyContent)) !== null) {
    scripts.push(m[0]);
  }
  const bodyWithoutScripts = bodyContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

  // Also grab font links from head
  const fontLinks: string[] = [];
  const linkRegex = /<link[^>]*href="[^"]*fonts[^"]*"[^>]*>/gi;
  while ((m = linkRegex.exec(html)) !== null) {
    fontLinks.push(m[0]);
  }

  return fontLinks.join("\n") + "\n" + styles.join("\n") + "\n" + bodyWithoutScripts + "\n" + scripts.join("\n");
}

function treeToMermaid(tree: string): string | null {
  const lines = tree.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return null;

  const nodes: Array<{ id: string; label: string; parent: string | null; depth: number }> = [];
  let nodeId = 0;

  for (const line of lines) {
    // Count depth by position of the name (after tree chars)
    const cleaned = line.replace(/[│├└──\s]/g, "").replace(/←.*$/, "").trim();
    if (!cleaned) continue;

    const depth = Math.floor((line.search(/[^\s│]/) || 0) / 4);
    const label = cleaned.replace(/[/]/g, "");
    const id = `n${nodeId++}`;

    // Find parent — last node with depth - 1
    let parent: string | null = null;
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (nodes[i].depth === depth - 1) {
        parent = nodes[i].id;
        break;
      }
    }

    nodes.push({ id, label, parent, depth });
  }

  if (nodes.length < 2) return null;

  const mermaidLines = ["graph TD"];
  for (const node of nodes) {
    if (node.parent) {
      mermaidLines.push(`    ${node.parent}[${nodes.find((n) => n.id === node.parent)?.label}] --> ${node.id}[${node.label}]`);
    }
  }

  // Dedupe edges
  const seen = new Set<string>();
  const deduped = [mermaidLines[0]];
  for (let i = 1; i < mermaidLines.length; i++) {
    if (!seen.has(mermaidLines[i])) {
      seen.add(mermaidLines[i]);
      deduped.push(mermaidLines[i]);
    }
  }

  return deduped.join("\n");
}

const CODE_SECTIONS = new Set([
  "tech stack", "repository structure", "the `.lodestar.md` schema",
  "mcp tool contracts", "llm provider abstraction", "mcp server setup",
  "configuration", "typescript config", "coding conventions",
  "build and run", "`lodestar init`", "`lodestar review`",
  "`lodestar bootstrap`", "the synthesis prompt",
]);

function splitByCategory(md: string): { code: string; product: string } {
  // Split on ## headers, categorize each section
  const sections = md.split(/(?=^## )/m);
  const codeParts: string[] = [];
  const productParts: string[] = [];

  for (const section of sections) {
    const headerMatch = section.match(/^## (.+)$/m);
    if (!headerMatch) {
      // Content before first h2 — goes to product (intro)
      productParts.push(section);
      continue;
    }

    const title = headerMatch[1].trim().toLowerCase();
    // Check if any code section key is contained in the title
    const isCode = [...CODE_SECTIONS].some((key) => title.includes(key.toLowerCase()));
    if (isCode) {
      codeParts.push(section);
    } else {
      productParts.push(section);
    }
  }

  return {
    code: codeParts.join("\n"),
    product: productParts.join("\n"),
  };
}

function markdownToHtml(md: string): string {
  // Extract code blocks BEFORE escaping to preserve special chars
  const codeBlocks: string[] = [];
  let processed = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
    let replacement: string;
    if (lang === "mermaid") {
      replacement = `<pre class="mermaid">${code}</pre>`;
    } else if (code.includes("├──") || code.includes("└──")) {
      const mermaidCode = treeToMermaid(code);
      replacement = mermaidCode
        ? `<div class="mermaid-diagram"><pre class="mermaid">${mermaidCode}</pre></div>`
        : `<pre class="prd-pre"><code>${escapeHtml(code)}</code></pre>`;
    } else if (code.includes("╔") || code.includes("═") || code.includes("║") || code.includes("┌") || code.includes("━")) {
      replacement = `<div class="prd-wireframe"><pre>${escapeHtml(code)}</pre></div>`;
    } else {
      replacement = `<pre class="prd-pre"><code>${escapeHtml(code)}</code></pre>`;
    }
    const placeholder = `<!--CODEBLOCK_${codeBlocks.length}-->`;
    codeBlocks.push(replacement);
    return placeholder;
  });

  // Now escape the rest
  let html = escapeHtml(processed);

  // Restore code blocks — but push them to end of their section
  // First, do all other formatting, then reorder within sections
  for (let i = 0; i < codeBlocks.length; i++) {
    html = html.replace(`&lt;!--CODEBLOCK_${i}--&gt;`, `<!--CODEBLOCK_${i}-->`);
  }

  // Headers
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3 class="prd-h3">$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2 class="prd-h2">$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1 class="prd-h1">$1</h1>');
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="prd-code">$1</code>');
  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="prd-hr">');
  // Tables (basic)
  html = html.replace(/^\|(.+)\|$/gm, (match) => {
    const cells = match.split('|').filter(Boolean).map((c) => c.trim());
    if (cells.every((c) => /^-+$/.test(c))) return '';
    const tag = 'td';
    return '<tr>' + cells.map((c) => `<${tag} class="prd-td">${c}</${tag}>`).join('') + '</tr>';
  });
  // Wrap consecutive tr in table
  html = html.replace(/(<tr>[\s\S]*?<\/tr>\n?)+/g, '<table class="prd-table">$&</table>');
  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li class="prd-ol-item">$1</li>');
  html = html.replace(/(<li class="prd-ol-item">[\s\S]*?<\/li>\n?)+/g, '<ol class="prd-ol">$&</ol>');
  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, '<ul class="prd-ul">$&</ul>');
  // Blockquotes
  html = html.replace(/^&gt;\s?(.+)$/gm, '<blockquote class="prd-quote">$1</blockquote>');
  // Paragraphs (double newline)
  html = html.replace(/\n\n/g, '</p><p class="prd-p">');
  html = '<p class="prd-p">' + html + '</p>';
  // Clean up empty paragraphs
  html = html.replace(/<p class="prd-p">\s*<\/p>/g, '');

  // Reorder: within each section (between h2 tags), move code blocks after prose
  html = html.replace(
    /(<h2 class="prd-h2">[\s\S]*?)(?=<h2 class="prd-h2">|$)/g,
    (section) => {
      const blocks: string[] = [];
      // Extract code block placeholders
      const withoutBlocks = section.replace(/<!--CODEBLOCK_(\d+)-->/g, (_m, idx) => {
        blocks.push(codeBlocks[parseInt(idx, 10)]);
        return "";
      });
      // Append blocks at end of section
      return withoutBlocks + blocks.join("\n");
    }
  );

  // Restore any remaining code blocks not inside h2 sections (e.g. before first h2)
  for (let i = 0; i < codeBlocks.length; i++) {
    html = html.replace(`<!--CODEBLOCK_${i}-->`, codeBlocks[i]);
  }

  return html;
}

export function renderReaderHTML(
  context: LodestarContext | null,
  historyContext: LodestarContext | null,
  prd: { filename: string; content: string } | null = null,
  briefHtml: string | null = null
): string {
  if (!context) {
    return `<!DOCTYPE html><html><head><title>Lodestar</title></head><body><h1>No .lodestar.md found</h1><p>Run <code>lodestar save</code> or <code>lodestar end</code> to create one.</p></body></html>`;
  }

  const c = context;
  const featureCount = (c.features ?? []).length;
  const completedFeatures = (c.features ?? []).filter((f) => f.status === "complete").length;
  const overallPercent = featureCount > 0
    ? Math.round((c.features ?? []).reduce((sum, f) => sum + f.percentComplete, 0) / featureCount)
    : 0;
  const decisionCount = c.decisions.length;
  const patternCount = c.patterns.length;
  const depCount = c.dependencies.length;
  const questionCount = c.openQuestions.length;
  const rejectedCount = c.rejected.length;
  const blockingCount = c.openQuestions.filter((q) => q.blocking).length;

  const doneCount = (c.features ?? []).filter(f => f.status === "complete").length;
  const progressCount = (c.features ?? []).filter(f => f.status === "in-progress").length;
  const notStartedCount = (c.features ?? []).filter(f => f.status === "not-started").length;
  const avgComplete = featureCount > 0 ? Math.round((c.features ?? []).reduce((sum, f) => sum + f.percentComplete, 0) / featureCount) : 0;
  const remaining = 100 - avgComplete;

  const diffHtml = historyContext ? renderDiffPanel(c, historyContext) : "";

  const firstNext = c.nextSession[0] ?? "No next-session guidance recorded.";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lodestar &middot; ${escapeHtml(c.meta.project)}</title>
<style>
:root {
  --navy: #0C447C;
  --teal: #185FA5;
  --brass: #185FA5;
  --bg: #FFFFFF;
  --surface: #FFFFFF;
  --text: #0C447C;
  --text-muted: #6B7280;
  --border: #DCE4ED;
  --blocking: #DC2626;
  --add: #16A34A;
  --change: #D97706;
  --remove: #9CA3AF;
}
@media (prefers-color-scheme: dark) {
  :root {
    --navy: #E2E8F0;
    --teal: #5B9BD5;
    --brass: #5B9BD5;
    --bg: #0D1117;
    --surface: #161B22;
    --text: #E2E8F0;
    --text-muted: #8B949E;
    --border: #30363D;
    --blocking: #F87171;
    --add: #4ADE80;
    --change: #FBBF24;
    --remove: #6B7280;
  }
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg);
  color: var(--text);
  font-size: 16px;
  line-height: 1.6;
  padding: 2rem 1rem;
}
.container { max-width: 1024px; margin: 0 auto; }
.header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.25rem;
}
.logo { display: flex; align-items: center; }
.logo svg { height: 84px; width: auto; }
.project { font-size: 1.25rem; font-weight: 600; color: var(--navy); }
.meta { color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1.5rem; }
.summary {
  font-size: 1.1rem;
  color: var(--text);
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--surface);
  border-radius: 8px;
  border: 1px solid var(--border);
}
.badges {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  align-items: baseline;
}
.badge {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
}
.badge-count { font-size: 1.5rem; font-weight: 700; color: var(--teal); }
.badge-label { font-size: 0.8rem; color: var(--text-muted); text-transform: none; letter-spacing: 0; font-weight: 400; }
.next-preview {
  padding: 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--brass);
  border-radius: 8px;
  margin-bottom: 2rem;
  font-size: 0.95rem;
}
.next-label { font-size: 0.75rem; color: var(--brass); text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em; margin-bottom: 0.25rem; }
.section {
  background: var(--surface);
  border: none;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  margin-bottom: 0;
  overflow: hidden;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 1rem;
  height: 36px;
  cursor: pointer;
  user-select: none;
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--teal);
}
.section-header:hover { background: var(--bg); }
.section-badge {
  background: var(--teal);
  color: white;
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  border-radius: 10px;
  font-weight: 600;
}
.section-body { padding: 0 1rem 1rem; display: none; }
.section.open .section-body { display: block; }
.section-header .arrow { transition: transform 0.2s; }
.section.open .section-header .arrow { transform: rotate(90deg); }
.decision { margin-bottom: 1rem; }
.decision-title { font-weight: 600; font-size: 0.95rem; margin-bottom: 0.25rem; }
.decision-rationale { color: var(--text-muted); font-size: 0.9rem; }
.decision-files { font-size: 0.8rem; color: var(--teal); margin-top: 0.25rem; }
.item { padding: 0.5rem 0; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
.item:last-child { border-bottom: none; }
.item-label { font-weight: 600; }
.item-detail { color: var(--text-muted); }
.blocking-tag {
  display: inline-block;
  background: var(--blocking);
  color: white;
  font-size: 0.65rem;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  text-transform: uppercase;
  font-weight: 700;
  margin-left: 0.5rem;
}
.nonblocking-tag {
  display: inline-block;
  color: var(--text-muted);
  font-size: 0.65rem;
  padding: 0.1rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  text-transform: uppercase;
  margin-left: 0.5rem;
}
.next-list { list-style: none; }
.next-list li { padding: 0.4rem 0; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
.next-list li:last-child { border-bottom: none; }
.next-list li::before { content: "→ "; color: var(--brass); font-weight: 600; }
.diff-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1.5rem;
}
.diff-header { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 600; margin-bottom: 0.5rem; }
.diff-add { color: var(--add); font-size: 0.9rem; padding: 0.15rem 0; }
.diff-change { color: var(--change); font-size: 0.9rem; padding: 0.15rem 0; }
.diff-remove { color: var(--remove); font-size: 0.9rem; padding: 0.15rem 0; }
.footer {
  text-align: center;
  padding: 2rem 0 1rem;
  color: var(--text-muted);
  font-size: 0.75rem;
}
.footer a { color: var(--brass); text-decoration: none; }
.footer a:hover { text-decoration: underline; }
.brief-section {
  background: var(--surface);
  border: none;
  border-radius: 0;
  padding: 1rem 0;
  margin-bottom: 1.5rem;
}
.brief-header {
  display: flex;
  flex-direction: column;
  margin-bottom: 0.75rem;
}
.brief-title { font-size: 0.9rem; text-transform: none; letter-spacing: 0; color: var(--teal); font-weight: 600; }
.brief-overall { font-size: 0.8rem; font-weight: 500; color: var(--text-muted); margin-top: 0.2rem; }
.feature-grid {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.feature-row {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 0 24px;
  padding: 18px 0;
  font-size: 0.9rem;
  align-items: start;
}
.feature-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
  overflow: hidden;
  max-width: 120px;
}
.feature-status {
  font-size: 0.585rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  white-space: nowrap;
  text-align: center;
}
.status-complete { background: var(--add); color: white; }
.status-in-progress { background: transparent; color: var(--teal); border: 1px solid var(--teal); font-weight: 500; }
.status-not-started { background: var(--border); color: var(--text-muted); }
.feature-progress {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  width: 100%;
}
.feature-bar-wrap {
  flex: 1;
  height: 5px;
  background: var(--border);
  border-radius: 3px;
  overflow: hidden;
}
.feature-bar {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}
.feature-pct { font-size: 0.7rem; color: var(--text-muted); white-space: nowrap; }
.feature-name { font-weight: 500; }
.feature-notes { color: var(--text-muted); font-size: 0.8rem; }
.integrations-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.integration-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.85rem;
}
.integration-name { font-weight: 600; color: var(--text); }
.integration-cat {
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--teal);
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
}
.integration-purpose { color: var(--text-muted); font-size: 0.8rem; }
.summary-layout {
  display: grid;
  grid-template-columns: 1fr 250px;
  gap: 1.5rem;
  align-items: start;
}
.summary-main { min-width: 0; }
.summary-sidebar {
  position: sticky;
  top: 1rem;
}
.sidebar-section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
}
.sidebar-title {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--teal);
  font-weight: 600;
  margin-bottom: 0.5rem;
}
.sidebar-text {
  font-size: 0.82rem;
  line-height: 1.6;
  color: var(--text);
  margin-bottom: 0.5rem;
}
.sidebar-tag {
  display: inline-block;
  font-size: 0.68rem;
  padding: 0.15rem 0.5rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text-muted);
  margin: 0.15rem 0.2rem 0.15rem 0;
}
.sidebar-integration {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0;
  font-size: 0.8rem;
}
.sidebar-integration-name { font-weight: 600; color: var(--text); }
.sidebar-integration-cat {
  font-size: 0.55rem;
  text-transform: uppercase;
  color: var(--teal);
  background: var(--bg);
  border: 1px solid var(--border);
  padding: 0.05rem 0.3rem;
  border-radius: 3px;
}
@media (max-width: 700px) {
  .summary-layout { grid-template-columns: 1fr; }
  .summary-sidebar { position: static; }
}
.tabs {
  display: flex;
  gap: 0;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid var(--border);
}
.tab {
  padding: 0.75rem 1.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  user-select: none;
  transition: color 0.15s, border-color 0.15s;
}
.tab:hover { color: var(--text); }
.tab.active { color: var(--teal); border-bottom-color: var(--teal); }
.tab-content { display: none; }
.tab-content.active { display: block; }
.prd-h1 {
  font-size: 1.75rem; font-weight: 700; color: var(--navy);
  margin: 2.5rem 0 1rem; line-height: 1.2;
}
.prd-h2 {
  font-size: 1.25rem; font-weight: 600; color: var(--navy);
  margin: 2rem 0 0.75rem; padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--border); line-height: 1.3;
}
.prd-h3 {
  font-size: 1.25rem; font-weight: 600; color: var(--text);
  margin: 1.5rem 0 0.5rem; line-height: 1.3;
}
h4 {
  font-size: 1rem; font-weight: 600; color: var(--text);
  margin: 1.25rem 0 0.4rem;
}
h5 { font-size: 0.875rem; font-weight: 600; color: var(--text-muted); margin: 1rem 0 0.3rem; }
h6 { font-size: 0.875rem; font-weight: 500; color: var(--text-muted); margin: 0.75rem 0 0.25rem; }
.prd-p { margin: 0.5rem 0; line-height: 1.75; font-size: 0.875rem; color: var(--text); }
.prd-ul { padding-left: 1.25rem; margin: 0.5rem 0; }
.prd-ul li { margin: 0.3rem 0; font-size: 0.875rem; line-height: 1.6; }
.prd-ol { padding-left: 1.25rem; margin: 0.5rem 0; list-style: decimal; }
.prd-ol li { margin: 0.3rem 0; font-size: 0.875rem; line-height: 1.6; }
.prd-code { background: var(--bg); border: 1px solid var(--border); padding: 0.1rem 0.35rem; border-radius: 4px; font-size: 0.82em; font-family: 'SF Mono', 'Fira Code', monospace; }
.prd-pre {
  background: var(--surface); border: 1px solid var(--border);
  padding: 0.875rem 1rem; border-radius: 8px; overflow-x: auto;
  margin: 0.75rem 0; font-size: 0.8rem; line-height: 1.5;
}
.prd-pre code { background: none; border: none; padding: 0; font-family: 'SF Mono', 'Fira Code', monospace; }
.prd-hr { border: none; border-top: 1px solid var(--border); margin: 1.5rem 0; }
.prd-quote {
  border-left: 3px solid var(--brass); padding: 0.5rem 1rem;
  margin: 0.75rem 0; color: var(--text-muted); font-size: 0.85rem;
  background: var(--surface); border-radius: 0 8px 8px 0;
}
.prd-table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; font-size: 0.85rem; }
.prd-td { padding: 0.5rem 0.75rem; border: 1px solid var(--border); }
.prd-table tr:first-child .prd-td {
  font-weight: 600; background: var(--teal); color: white;
  font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em;
}
.prd-source {
  font-size: 0.7rem; color: var(--text-muted); margin-bottom: 1rem;
  text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;
}
.diagram-container { margin-bottom: 1rem; }
.diagram-title { font-size: 0.85rem; font-weight: 600; color: var(--teal); margin-bottom: 0.5rem; }
.diagram-type-tag {
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  background: var(--bg);
  border: 1px solid var(--border);
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  margin-left: 0.5rem;
}
.mermaid-diagram {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem;
  overflow-x: auto;
  text-align: center;
  cursor: pointer;
  transition: box-shadow 0.2s;
}
.mermaid-diagram:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.diagram-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.7);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.diagram-overlay-content {
  background: var(--surface);
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  overflow: auto;
}
.diagram-overlay-content svg { max-width: 100%; max-height: 100%; height: auto; }
.mermaid-fallback {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.8rem;
  white-space: pre;
  text-align: left;
  color: var(--text-muted);
}
.roadmap-phase { margin-bottom: 0.75rem; }
.roadmap-phase-title { font-weight: 600; font-size: 0.9rem; color: var(--teal); margin-bottom: 0.25rem; }
.roadmap-phase-desc { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.25rem; }
.roadmap-items { list-style: none; padding: 0; }
.roadmap-items li { font-size: 0.85rem; padding: 0.2rem 0; color: var(--text); }
.roadmap-items li::before { content: "○ "; color: var(--brass); }
.prd-future-note {
  padding: 0.6rem 1rem;
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: 8px;
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 1.5rem;
  text-align: center;
}
.prd-content {
  background: var(--surface);
  padding: 0;
}
.subtabs {
  display: flex;
  justify-content: center;
  gap: 0;
  margin-bottom: 1rem;
}
.subtab {
  padding: 0.5rem 1.25rem;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
  transition: color 0.15s;
}
.subtab:hover { color: var(--text); }
.subtab.active { color: var(--teal); font-weight: 600; }
.subtab-content { display: none; }
.subtab-content.active { display: block; }
.prd-wireframe {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem;
  margin: 0.75rem 0;
  overflow-x: auto;
}
.pro-placeholder {
  border: 1px dashed var(--border);
  border-radius: 8px;
  padding: 1.25rem;
  margin-bottom: 0.75rem;
  position: relative;
  opacity: 0.6;
}
.pro-placeholder-content {
  filter: blur(2px);
  pointer-events: none;
  user-select: none;
}
.pro-badge {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--teal);
  background: var(--bg);
  border: 1px solid var(--teal);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}
.pro-upgrade-link {
  display: block;
  text-align: center;
  font-size: 0.8rem;
  color: var(--teal);
  margin-top: 0.75rem;
  text-decoration: none;
}
.pro-upgrade-link:hover { text-decoration: underline; }
.prd-wireframe pre {
  font-family: 'SF Mono', 'Fira Code', 'Menlo', monospace;
  font-size: 0.72rem;
  line-height: 1.4;
  color: var(--text);
  white-space: pre;
  margin: 0;
}
</style>
</head>
<body>
<div class="container">

<div class="header">
  <span class="logo"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 72" width="130" height="36"><path d="M28,8 L29.9,41.1 L43,44 L29.9,46.9 L28,58 L26.1,46.9 L15,44 L26.1,41.1 Z" fill="#185FA5"/><text x="55" y="50" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif" font-size="32" font-weight="500" letter-spacing="0.5" fill="#0C447C">Lodestar</text></svg></span>
</div>

<div class="tabs">
  <div class="tab active" onclick="switchTab('summary')">Project Summary</div>
  <div class="tab" onclick="switchTab('history')">Project History</div>
  <div class="tab" onclick="switchTab('requirements')">Project Requirements</div>
</div>

<div id="tab-summary" class="tab-content active">

${diffHtml}

<div class="summary-layout">
<div class="summary-main">

${featureCount > 0 ? `
<div class="brief-section">
  <div class="brief-header">
    <span class="brief-title">Project Brief Status</span>
    <span class="brief-overall">${overallPercent}% Complete</span>
  </div>
  <div class="feature-grid">
  ${(c.features ?? []).map((f) => {
    const barColor = f.status === "complete" ? "var(--add)" : f.status === "in-progress" ? "var(--add)" : "var(--border)";
    const statusClass = f.status === "complete" ? "status-complete" : f.status === "in-progress" ? "status-in-progress" : "status-not-started";
    const statusLabel = f.status === "complete" ? "Done" : f.status === "in-progress" ? "In Progress" : "Not Started";
    return `
    <div class="feature-row">
      <div class="feature-left">
        <span class="feature-status ${statusClass}">${statusLabel}</span>
        <div class="feature-progress">
          <div class="feature-bar-wrap"><div class="feature-bar" style="width:${f.percentComplete}%;background:${barColor}"></div></div>
          <span class="feature-pct">${f.percentComplete}%</span>
        </div>
      </div>
      <span class="feature-name">${escapeHtml(f.feature)}${f.notes ? `<br><span class="feature-notes">${escapeHtml(f.notes)}</span>` : ""}</span>
    </div>`;
  }).join("")}
  </div>
</div>
` : ""}

<div class="badges">
  <div class="badge"><span class="badge-count">${decisionCount}</span><span class="badge-label">Decisions</span></div>
  <div class="badge"><span class="badge-count">${patternCount}</span><span class="badge-label">Patterns</span></div>
  <div class="badge"><span class="badge-count">${depCount}</span><span class="badge-label">Deps</span></div>
  <div class="badge"><span class="badge-count" ${blockingCount > 0 ? 'style="color:var(--blocking)"' : ""}>${questionCount}</span><span class="badge-label">Questions</span></div>
</div>

<!-- Pro feature placeholders -->
<div style="margin-bottom:1.5rem">
  <div class="pro-placeholder">
    <span class="pro-badge">Pro</span>
    <div style="font-size:0.8rem;font-weight:600;color:var(--teal);margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.05em">Session History Timeline</div>
    <div class="pro-placeholder-content">
      <div style="display:flex;gap:0.5rem;align-items:center">
        <div style="height:6px;flex:1;background:var(--border);border-radius:3px"></div>
        <div style="height:6px;flex:1;background:var(--border);border-radius:3px"></div>
        <div style="height:6px;flex:1;background:var(--teal);border-radius:3px"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.65rem;color:var(--text-muted);margin-top:0.25rem">
        <span>Mar 10</span><span>Mar 17</span><span>Today</span>
      </div>
    </div>
    <a href="https://kylex.io" class="pro-upgrade-link">Upgrade to Pro — 30 days of session history</a>
  </div>

  <div style="display:flex;flex-direction:column;gap:0.75rem">
    <div class="pro-placeholder">
      <span class="pro-badge">Pro</span>
      <div style="font-size:0.75rem;font-weight:600;color:var(--teal);margin-bottom:0.3rem;text-transform:uppercase;letter-spacing:0.05em">Session Diff</div>
      <div class="pro-placeholder-content">
        <div style="font-size:0.65rem;color:var(--text-muted)">+ 2 decisions<br>- 1 question resolved</div>
      </div>
    </div>
    <div class="pro-placeholder">
      <span class="pro-badge">Pro</span>
      <div style="font-size:0.75rem;font-weight:600;color:var(--teal);margin-bottom:0.3rem;text-transform:uppercase;letter-spacing:0.05em">Linked Projects</div>
      <div class="pro-placeholder-content">
        <div style="font-size:0.65rem;color:var(--text-muted)">View all related projects in one workspace dashboard</div>
      </div>
    </div>
    <div class="pro-placeholder">
      <span class="pro-badge">Pro</span>
      <div style="font-size:0.75rem;font-weight:600;color:var(--teal);margin-bottom:0.3rem;text-transform:uppercase;letter-spacing:0.05em">Team Sharing</div>
      <div class="pro-placeholder-content">
        <div style="font-size:0.65rem;color:var(--text-muted)">Share a link to this project dashboard</div>
      </div>
    </div>
    <div class="pro-placeholder">
      <span class="pro-badge">Pro</span>
      <div style="font-size:0.75rem;font-weight:600;color:var(--teal);margin-bottom:0.3rem;text-transform:uppercase;letter-spacing:0.05em">AI Summary</div>
      <div class="pro-placeholder-content">
        <div style="font-size:0.65rem;color:var(--text-muted)">What changed across your last 5 sessions</div>
      </div>
    </div>
  </div>
</div>

${(c.diagrams ?? []).length > 0 ? `
<div class="section open">
  <div class="section-header" onclick="this.parentElement.classList.toggle('open')">
    <span><span class="arrow">&#9656;</span> Architecture & Flows</span>
    <span class="section-badge">${(c.diagrams ?? []).length}</span>
  </div>
  <div class="section-body">
    ${(c.diagrams ?? []).map((d, i) => `
    <div class="diagram-container">
      <div class="diagram-title">${escapeHtml(d.title)}<span class="diagram-type-tag">${escapeHtml(d.type)}</span></div>
      <div class="mermaid-diagram" onclick="enlargeDiagram(this)">
        <pre class="mermaid" id="mermaid-${i}">${d.mermaid}</pre>
        <noscript><pre class="mermaid-fallback">${escapeHtml(d.mermaid)}</pre></noscript>
      </div>
    </div>`).join("")}
  </div>
</div>
` : ""}


</div><!-- end summary-main -->

<div class="summary-sidebar">
${c.projectSummary ? `
  <div class="sidebar-section">
    <div class="sidebar-title">Project Overview</div>
    <div class="sidebar-text">${escapeHtml(c.projectSummary)}</div>
    ${(c.userSegments ?? []).length > 0 ? `
    <div style="margin-top:0.5rem">
      ${(c.userSegments ?? []).map((s) => `<span class="sidebar-tag">${escapeHtml(s)}</span>`).join("")}
    </div>` : ""}
  </div>
` : ""}
${(c.integrations ?? []).length > 0 ? `
  <div class="sidebar-section">
    <div class="sidebar-title">Integrations</div>
    ${(c.integrations ?? []).map((i) => `
    <div class="sidebar-integration">
      <span class="sidebar-integration-name">${escapeHtml(i.name)}</span>
      <span class="sidebar-integration-cat">${escapeHtml(i.category)}</span>
    </div>`).join("")}
  </div>
` : ""}
  <div class="sidebar-section">
    <div class="sidebar-title">Session</div>
    <div style="font-size:0.8rem;color:var(--text-muted);line-height:1.6">
      ${escapeHtml(c.meta.date)}<br>
      ${escapeHtml(c.meta.model)}${c.meta.sessionDuration ? `<br>${escapeHtml(c.meta.sessionDuration)}` : ""}
    </div>
  </div>
</div><!-- end summary-sidebar -->

</div><!-- end summary-layout -->
</div><!-- end tab-summary -->

<div id="tab-history" class="tab-content">

<div class="section open">
  <div class="section-header" onclick="this.parentElement.classList.toggle('open')">
    <span><span class="arrow">&#9656;</span> Decisions</span>
    <span class="section-badge">${decisionCount}</span>
  </div>
  <div class="section-body">
    ${c.decisions.length === 0 ? '<div class="item">No decisions recorded.</div>' : c.decisions.map((d) => `
    <div class="decision">
      <div class="decision-title">${escapeHtml(d.decision)}</div>
      <div class="decision-rationale">${escapeHtml(d.rationale)}</div>
      ${d.files && d.files.length > 0 ? `<div class="decision-files">${d.files.map((f) => escapeHtml(f)).join(", ")}</div>` : ""}
    </div>`).join("")}
  </div>
</div>

<div class="section">
  <div class="section-header" onclick="this.parentElement.classList.toggle('open')">
    <span><span class="arrow">&#9656;</span> Open Questions</span>
    <span class="section-badge">${questionCount}</span>
  </div>
  <div class="section-body">
    ${c.openQuestions.length === 0 ? '<div class="item">No open questions.</div>' : c.openQuestions.map((q) => `
    <div class="item">
      ${escapeHtml(q.question)}
      ${q.blocking ? '<span class="blocking-tag">blocking</span>' : '<span class="nonblocking-tag">non-blocking</span>'}
    </div>`).join("")}
  </div>
</div>

<div class="section">
  <div class="section-header" onclick="this.parentElement.classList.toggle('open')">
    <span><span class="arrow">&#9656;</span> Patterns</span>
    <span class="section-badge">${patternCount}</span>
  </div>
  <div class="section-body">
    ${c.patterns.length === 0 ? '<div class="item">No patterns recorded.</div>' : c.patterns.map((p) => `
    <div class="item">
      <span class="item-label">${escapeHtml(p.pattern)}</span>
      <span class="item-detail"> &rarr; ${escapeHtml(p.location)}</span>
    </div>`).join("")}
  </div>
</div>

<div class="section">
  <div class="section-header" onclick="this.parentElement.classList.toggle('open')">
    <span><span class="arrow">&#9656;</span> Dependencies</span>
    <span class="section-badge">${depCount}</span>
  </div>
  <div class="section-body">
    ${c.dependencies.length === 0 ? '<div class="item">No dependency changes.</div>' : c.dependencies.map((d) => `
    <div class="item">
      <span class="item-label">${escapeHtml(d.package)}</span>
      <span class="item-detail"> &mdash; ${escapeHtml(d.purpose)}</span>
    </div>`).join("")}
  </div>
</div>

<div class="section">
  <div class="section-header" onclick="this.parentElement.classList.toggle('open')">
    <span><span class="arrow">&#9656;</span> Rejected Approaches</span>
    <span class="section-badge">${rejectedCount}</span>
  </div>
  <div class="section-body">
    ${c.rejected.length === 0 ? '<div class="item">No rejected approaches recorded.</div>' : c.rejected.map((r) => `
    <div class="decision">
      <div class="decision-title">${escapeHtml(r.approach)}</div>
      <div class="decision-rationale">${escapeHtml(r.reason)}</div>
    </div>`).join("")}
  </div>
</div>

${(c.futurePhases ?? []).length > 0 ? `
<div class="section">
  <div class="section-header" onclick="this.parentElement.classList.toggle('open')">
    <span><span class="arrow">&#9656;</span> Future Phases</span>
    <span class="section-badge">${(c.futurePhases ?? []).length}</span>
  </div>
  <div class="section-body">
    ${(c.futurePhases ?? []).map((p) => `
    <div class="roadmap-phase">
      <div class="roadmap-phase-title">${escapeHtml(p.phase)}</div>
      ${p.description ? `<div class="roadmap-phase-desc">${escapeHtml(p.description)}</div>` : ""}
      ${p.items.length > 0 ? `<ul class="roadmap-items">${p.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : ""}
    </div>`).join("")}
  </div>
</div>
` : ""}

</div><!-- end tab-history -->

<div id="tab-requirements" class="tab-content">
${prd ? (() => {
  const split = splitByCategory(prd.content);
  return `
  <div class="subtabs">
    <div class="subtab active" onclick="switchSubtab('product')">Product &amp; Business</div>
    <div class="subtab" onclick="switchSubtab('code')">Code &amp; Architecture</div>
  </div>
  <div id="subtab-product" class="subtab-content active">
    <div class="prd-content"><div style="text-align:right;font-size:0.7rem;color:var(--text-muted);margin-bottom:0.75rem">Last updated: ${escapeHtml(c.meta.date)}</div>${markdownToHtml(split.product)}</div>
  </div>
  <div id="subtab-code" class="subtab-content">
    <div class="prd-content"><div style="text-align:right;font-size:0.7rem;color:var(--text-muted);margin-bottom:0.75rem">Last updated: ${escapeHtml(c.meta.date)}</div>${markdownToHtml(split.code)}</div>
  </div>
  <div class="prd-future-note">
    Editing coming soon — changes will sync back to ${escapeHtml(prd.filename)}
  </div>`;
})() : `
  <div style="padding:2rem;text-align:center;color:var(--text-muted)">
    <p>No project requirements document found.</p>
    <p style="font-size:0.85rem;margin-top:0.5rem">Create a <strong>brief.html</strong>, <strong>CLAUDE.md</strong>, or <strong>PRD.md</strong> in your project root.</p>
  </div>
`}
</div><!-- end tab-requirements -->

<div class="footer">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 72" width="14" height="28" style="vertical-align:middle;margin-right:4px"><path d="M28,8 L29.9,41.1 L43,44 L29.9,46.9 L28,58 L26.1,46.9 L15,44 L26.1,41.1 Z" fill="#185FA5" opacity="0.4"/></svg>
  Lodestar &middot; Kylex Module 00 &middot; <a href="https://kylex.io">kylex.io</a>
</div>

</div>
<script>
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector('.tab[onclick*="' + name + '"]').classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
}
function enlargeDiagram(el) {
  var svg = el.querySelector('svg');
  if (!svg) return;
  var overlay = document.createElement('div');
  overlay.className = 'diagram-overlay';
  overlay.onclick = function() { overlay.remove(); };
  var content = document.createElement('div');
  content.className = 'diagram-overlay-content';
  content.innerHTML = svg.outerHTML;
  var enlarged = content.querySelector('svg');
  if (enlarged) {
    enlarged.style.width = '100%';
    enlarged.style.maxWidth = '90vw';
    enlarged.style.height = 'auto';
    enlarged.removeAttribute('width');
    enlarged.removeAttribute('height');
  }
  overlay.appendChild(content);
  document.body.appendChild(overlay);
}
function switchSubtab(name) {
  document.querySelectorAll('.subtab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.subtab-content').forEach(t => t.classList.remove('active'));
  document.querySelector('.subtab[onclick*="' + name + '"]').classList.add('active');
  document.getElementById('subtab-' + name).classList.add('active');
}
</script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>
document.addEventListener('DOMContentLoaded', function() {
  if (typeof mermaid !== 'undefined') {
    var isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? 'dark' : 'default',
      themeVariables: isDark ? {
        primaryColor: '#1A6B72',
        primaryBorderColor: '#30363D',
        primaryTextColor: '#E2E8F0',
        lineColor: '#8B949E',
        secondaryColor: '#161B22',
        tertiaryColor: '#0D1117'
      } : {
        primaryColor: '#1A6B72',
        primaryBorderColor: '#E5E7EB',
        primaryTextColor: '#1B2C4A',
        lineColor: '#6B7280'
      },
      securityLevel: 'loose'
    });
    mermaid.run({ nodes: document.querySelectorAll('.mermaid') });
  }
});
</script>
</body>
</html>`;
}
