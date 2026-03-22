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

export function renderReaderHTML(
  context: LodestarContext | null,
  historyContext: LodestarContext | null
): string {
  if (!context) {
    return `<!DOCTYPE html><html><head><title>Lodestar</title></head><body><h1>No .lodestar.md found</h1><p>Run <code>lodestar save</code> or <code>lodestar end</code> to create one.</p></body></html>`;
  }

  const c = context;
  const decisionCount = c.decisions.length;
  const patternCount = c.patterns.length;
  const depCount = c.dependencies.length;
  const questionCount = c.openQuestions.length;
  const rejectedCount = c.rejected.length;
  const blockingCount = c.openQuestions.filter((q) => q.blocking).length;

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
  --navy: #1B2C4A;
  --teal: #1A6B72;
  --brass: #C8A84B;
  --bg: #F8F9FA;
  --surface: #FFFFFF;
  --text: #1B2C4A;
  --text-muted: #6B7280;
  --border: #E5E7EB;
  --blocking: #DC2626;
  --add: #16A34A;
  --change: #D97706;
  --remove: #9CA3AF;
}
@media (prefers-color-scheme: dark) {
  :root {
    --navy: #E2E8F0;
    --teal: #2DD4BF;
    --brass: #C8A84B;
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
.container { max-width: 760px; margin: 0 auto; }
.header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.25rem;
}
.logo { color: var(--brass); font-weight: 700; font-size: 1.25rem; }
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
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}
.badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem 1.25rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  min-width: 90px;
}
.badge-count { font-size: 1.5rem; font-weight: 700; color: var(--teal); }
.badge-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
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
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 1rem;
  overflow: hidden;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.875rem 1rem;
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
</style>
</head>
<body>
<div class="container">

<div class="header">
  <span class="logo">&#9733; Lodestar</span>
  <span class="project">${escapeHtml(c.meta.project)}</span>
</div>
<div class="meta">Session: ${escapeHtml(c.meta.date)} &middot; ${escapeHtml(c.meta.model)}${c.meta.sessionDuration ? ` &middot; ${escapeHtml(c.meta.sessionDuration)}` : ""}</div>

${diffHtml}

<div class="summary">
  ${escapeHtml(firstNext)}
</div>

<div class="badges">
  <div class="badge"><span class="badge-count">${decisionCount}</span><span class="badge-label">Decisions</span></div>
  <div class="badge"><span class="badge-count">${patternCount}</span><span class="badge-label">Patterns</span></div>
  <div class="badge"><span class="badge-count">${depCount}</span><span class="badge-label">Deps</span></div>
  <div class="badge"><span class="badge-count" ${blockingCount > 0 ? 'style="color:var(--blocking)"' : ""}>${questionCount}</span><span class="badge-label">Questions</span></div>
</div>

<div class="next-preview">
  <div class="next-label">Next session</div>
  ${escapeHtml(firstNext)}
</div>

<!-- Level 2 -->
<div class="section">
  <div class="section-header" onclick="this.parentElement.classList.toggle('open')">
    <span><span class="arrow">&#9656;</span> Decisions</span>
    <span class="section-badge">${decisionCount}</span>
  </div>
  <div class="section-body">
    ${c.decisions.map((d) => `
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
    <span><span class="arrow">&#9656;</span> Next Session Briefing</span>
    <span class="section-badge">${c.nextSession.length}</span>
  </div>
  <div class="section-body">
    <ul class="next-list">
      ${c.nextSession.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}
    </ul>
  </div>
</div>

<!-- Level 3 -->
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

<div class="footer">
  Lodestar &middot; Keelson Module 00 &middot; <a href="https://keelson.io">keelson.io</a>
</div>

</div>
</body>
</html>`;
}
