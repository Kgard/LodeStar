// .lodestar.md types and validation

export interface LodestarMeta {
  project: string;
  date: string;
  model: string;
  sessionDuration?: string;
}

export interface LodestarDecision {
  decision: string;
  rationale: string;
  files?: string[];
}

export interface LodestarPattern {
  pattern: string;
  location: string;
}

export interface LodestarDependency {
  package: string;
  purpose: string;
}

export interface LodestarRejected {
  approach: string;
  reason: string;
}

export interface LodestarOpenQuestion {
  question: string;
  blocking: boolean;
}

export interface LodestarCapability {
  name: string;
  status: "done" | "in-progress" | "planned";
}

export interface LodestarFeature {
  feature: string;
  status: "not-started" | "in-progress" | "complete";
  percentComplete: number;
  notes?: string;
  capabilities?: LodestarCapability[];
}

export interface LodestarIntegration {
  name: string;
  category: "database" | "auth" | "hosting" | "api" | "ci-cd" | "monitoring" | "storage" | "payments" | "other";
  purpose: string;
}

export interface LodestarFuturePhase {
  phase: string;
  description: string;
  items: string[];
}

export interface LodestarDiagram {
  title: string;
  type: "architecture" | "flow" | "sequence" | "dependency";
  mermaid: string;
}

export interface LodestarContext {
  meta: LodestarMeta;
  projectSummary: string;
  userSegments: string[];
  integrations: LodestarIntegration[];
  features: LodestarFeature[];
  futurePhases: LodestarFuturePhase[];
  diagrams: LodestarDiagram[];
  decisions: LodestarDecision[];
  patterns: LodestarPattern[];
  dependencies: LodestarDependency[];
  rejected: LodestarRejected[];
  openQuestions: LodestarOpenQuestion[];
  nextSession: string[];
}

export function contextToMarkdown(ctx: LodestarContext): string {
  const lines: string[] = [];

  lines.push("# Lodestar Context");
  lines.push("");
  lines.push(`> Project: ${ctx.meta.project}`);
  lines.push(`> Date: ${ctx.meta.date}`);
  lines.push(`> Model: ${ctx.meta.model}`);
  if (ctx.meta.sessionDuration) {
    lines.push(`> Session Duration: ${ctx.meta.sessionDuration}`);
  }
  lines.push("");

  lines.push("## Project Summary");
  lines.push("");
  lines.push(ctx.projectSummary || "No project summary available.");
  lines.push("");
  if (ctx.userSegments && ctx.userSegments.length > 0) {
    lines.push("**User Segments:**");
    for (const seg of ctx.userSegments) {
      lines.push(`- ${seg}`);
    }
    lines.push("");
  }

  lines.push("## Integrations");
  lines.push("");
  if (!ctx.integrations || ctx.integrations.length === 0) {
    lines.push("No integrations detected.");
  }
  for (const i of ctx.integrations ?? []) {
    lines.push(`- **${i.name}** [${i.category}] — ${i.purpose}`);
  }
  lines.push("");

  lines.push("## Project Brief Status");
  lines.push("");
  if (!ctx.features || ctx.features.length === 0) {
    lines.push("No features tracked.");
  }
  for (const f of ctx.features ?? []) {
    const bar = f.percentComplete;
    const icon = f.status === "complete" ? "[x]" : f.status === "in-progress" ? "[-]" : "[ ]";
    lines.push(`- ${icon} **${f.feature}** — ${bar}%${f.notes ? ` — ${f.notes}` : ""}`);
    if (f.capabilities && f.capabilities.length > 0) {
      for (const cap of f.capabilities) {
        const capIcon = cap.status === "done" ? "✓" : cap.status === "in-progress" ? "○" : "·";
        lines.push(`  - ${capIcon} ${cap.name}`);
      }
    }
  }
  lines.push("");

  lines.push("## Future Phases");
  lines.push("");
  if (!ctx.futurePhases || ctx.futurePhases.length === 0) {
    lines.push("No future phases defined.");
  }
  for (const p of ctx.futurePhases ?? []) {
    lines.push(`### ${p.phase}`);
    lines.push("");
    lines.push(p.description);
    for (const item of p.items) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  lines.push("## Diagrams");
  lines.push("");
  if (!ctx.diagrams || ctx.diagrams.length === 0) {
    lines.push("No diagrams.");
  }
  for (const d of ctx.diagrams ?? []) {
    lines.push(`### ${d.title} [${d.type}]`);
    lines.push("");
    lines.push("```mermaid");
    lines.push(d.mermaid);
    lines.push("```");
    lines.push("");
  }

  lines.push("## Decisions");
  lines.push("");
  if (ctx.decisions.length === 0) {
    lines.push("No decisions recorded.");
  }
  for (const d of ctx.decisions) {
    lines.push(`### ${d.decision}`);
    lines.push("");
    lines.push(`**Rationale:** ${d.rationale}`);
    if (d.files && d.files.length > 0) {
      lines.push(`**Files:** ${d.files.join(", ")}`);
    }
    lines.push("");
  }

  lines.push("## Patterns");
  lines.push("");
  if (ctx.patterns.length === 0) {
    lines.push("No patterns recorded.");
  }
  for (const p of ctx.patterns) {
    lines.push(`- **${p.pattern}** — ${p.location}`);
  }
  lines.push("");

  lines.push("## Dependencies");
  lines.push("");
  if (ctx.dependencies.length === 0) {
    lines.push("No dependency changes recorded.");
  }
  for (const dep of ctx.dependencies) {
    lines.push(`- **${dep.package}** — ${dep.purpose}`);
  }
  lines.push("");

  lines.push("## Rejected Approaches");
  lines.push("");
  if (ctx.rejected.length === 0) {
    lines.push("No rejected approaches recorded.");
  }
  for (const r of ctx.rejected) {
    lines.push(`### ${r.approach}`);
    lines.push("");
    lines.push(`**Reason:** ${r.reason}`);
    lines.push("");
  }

  lines.push("## Open Questions");
  lines.push("");
  if (ctx.openQuestions.length === 0) {
    lines.push("No open questions.");
  }
  for (const q of ctx.openQuestions) {
    const marker = q.blocking ? "BLOCKING" : "non-blocking";
    lines.push(`- [${marker}] ${q.question}`);
  }
  lines.push("");

  lines.push("## Next Session");
  lines.push("");
  if (ctx.nextSession.length === 0) {
    lines.push("No next-session notes.");
  }
  for (const item of ctx.nextSession) {
    lines.push(`- ${item}`);
  }
  lines.push("");

  return lines.join("\n");
}

export function parseMarkdown(content: string): LodestarContext {
  const ctx: LodestarContext = {
    meta: { project: "", date: "", model: "" },
    projectSummary: "",
    userSegments: [],
    integrations: [],
    features: [],
    futurePhases: [],
    diagrams: [],
    decisions: [],
    patterns: [],
    dependencies: [],
    rejected: [],
    openQuestions: [],
    nextSession: [],
  };

  const metaMatch = (key: string): string => {
    const re = new RegExp(`^> ${key}:\\s*(.+)$`, "m");
    const m = content.match(re);
    return m ? m[1].trim() : "";
  };

  ctx.meta.project = metaMatch("Project");
  ctx.meta.date = metaMatch("Date");
  ctx.meta.model = metaMatch("Model");
  const duration = metaMatch("Session Duration");
  if (duration) {
    ctx.meta.sessionDuration = duration;
  }

  const sectionContent = (heading: string): string => {
    const re = new RegExp(
      `^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |\\Z)`,
      "m"
    );
    const m = content.match(re);
    return m ? m[1].trim() : "";
  };

  // Project Summary
  const summaryBlock = sectionContent("Project Summary");
  const summaryLines = summaryBlock.split("\n");
  const summaryText: string[] = [];
  const segments: string[] = [];
  let inSegments = false;
  for (const line of summaryLines) {
    if (line.startsWith("**User Segments:**")) {
      inSegments = true;
      continue;
    }
    if (inSegments && line.startsWith("- ")) {
      segments.push(line.slice(2).trim());
    } else if (!inSegments && line.trim()) {
      summaryText.push(line.trim());
    }
  }
  ctx.projectSummary = summaryText.join(" ");
  ctx.userSegments = segments;

  // Project Brief Status / Features
  // Integrations
  const integrationsBlock = sectionContent("Integrations");
  const integrationLines = integrationsBlock
    .split("\n")
    .filter((l) => l.startsWith("- "));
  for (const line of integrationLines) {
    const m = line.match(/^- \*\*(.+?)\*\*\s*\[(.+?)\]\s*—\s*(.+)$/);
    if (m) {
      ctx.integrations.push({
        name: m[1],
        category: m[2] as LodestarIntegration["category"],
        purpose: m[3].trim(),
      });
    }
  }

  const featuresBlock = sectionContent("Project Brief Status") || sectionContent("Project Brief");
  const allFeatureLines = featuresBlock.split("\n");
  let currentFeature: LodestarFeature | null = null;
  for (const line of allFeatureLines) {
    const featureMatch = line.match(/^- \[(x| |-)\]\s*\*\*(.+?)\*\*\s*—\s*(\d+)%(?:\s*—\s*(.+))?$/);
    if (featureMatch) {
      if (currentFeature) ctx.features.push(currentFeature);
      const statusChar = featureMatch[1];
      const status =
        statusChar === "x"
          ? "complete"
          : statusChar === "-"
            ? "in-progress"
            : "not-started";
      currentFeature = {
        feature: featureMatch[2],
        status: status as "not-started" | "in-progress" | "complete",
        percentComplete: parseInt(featureMatch[3], 10),
        ...(featureMatch[4] ? { notes: featureMatch[4].trim() } : {}),
        capabilities: [],
      };
      continue;
    }
    const capMatch = line.match(/^\s+- ([✓○·])\s+(.+)$/);
    if (capMatch && currentFeature) {
      const capStatus = capMatch[1] === "✓" ? "done" : capMatch[1] === "○" ? "in-progress" : "planned";
      currentFeature.capabilities!.push({
        name: capMatch[2],
        status: capStatus as "done" | "in-progress" | "planned",
      });
    }
  }
  if (currentFeature) ctx.features.push(currentFeature);

  // Future Phases
  const futureBlock = sectionContent("Future Phases");
  const futureChunks = futureBlock.split(/^### /m).filter(Boolean);
  for (const chunk of futureChunks) {
    const titleEnd = chunk.indexOf("\n");
    const title = titleEnd === -1 ? chunk.trim() : chunk.slice(0, titleEnd).trim();
    const body = titleEnd === -1 ? "" : chunk.slice(titleEnd);
    const bodyLines = body.split("\n").filter((l) => l.trim());
    const items: string[] = [];
    const descLines: string[] = [];
    for (const line of bodyLines) {
      if (line.startsWith("- ")) {
        items.push(line.slice(2).trim());
      } else {
        descLines.push(line.trim());
      }
    }
    ctx.futurePhases.push({
      phase: title,
      description: descLines.join(" "),
      items,
    });
  }

  // Diagrams
  const diagramsBlock = sectionContent("Diagrams");
  const diagramChunks = diagramsBlock.split(/^### /m).filter(Boolean);
  for (const chunk of diagramChunks) {
    const titleEnd = chunk.indexOf("\n");
    const titleLine = titleEnd === -1 ? chunk.trim() : chunk.slice(0, titleEnd).trim();
    const body = titleEnd === -1 ? "" : chunk.slice(titleEnd);
    const titleMatch = titleLine.match(/^(.+?)\s*\[(\w+)\]\s*$/);
    const title = titleMatch ? titleMatch[1].trim() : titleLine;
    const type = (titleMatch ? titleMatch[2] : "architecture") as LodestarDiagram["type"];
    const mermaidMatch = body.match(/```mermaid\s*\n([\s\S]*?)```/);
    if (mermaidMatch) {
      ctx.diagrams.push({
        title,
        type,
        mermaid: mermaidMatch[1].trim(),
      });
    }
  }

  // Decisions
  const decisionsBlock = sectionContent("Decisions");
  const decisionChunks = decisionsBlock.split(/^### /m).filter(Boolean);
  for (const chunk of decisionChunks) {
    const titleEnd = chunk.indexOf("\n");
    const title = titleEnd === -1 ? chunk.trim() : chunk.slice(0, titleEnd).trim();
    const body = titleEnd === -1 ? "" : chunk.slice(titleEnd);
    const rationaleMatch = body.match(/\*\*Rationale:\*\*\s*(.+)/);
    const filesMatch = body.match(/\*\*Files:\*\*\s*(.+)/);
    ctx.decisions.push({
      decision: title,
      rationale: rationaleMatch ? rationaleMatch[1].trim() : "",
      ...(filesMatch
        ? { files: filesMatch[1].split(",").map((f) => f.trim()) }
        : {}),
    });
  }

  // Patterns
  const patternsBlock = sectionContent("Patterns");
  const patternLines = patternsBlock
    .split("\n")
    .filter((l) => l.startsWith("- "));
  for (const line of patternLines) {
    const m = line.match(/^- \*\*(.+?)\*\* — (.+)$/);
    if (m) {
      ctx.patterns.push({ pattern: m[1], location: m[2] });
    }
  }

  // Dependencies
  const depsBlock = sectionContent("Dependencies");
  const depLines = depsBlock.split("\n").filter((l) => l.startsWith("- "));
  for (const line of depLines) {
    const m = line.match(/^- \*\*(.+?)\*\* — (.+)$/);
    if (m) {
      ctx.dependencies.push({ package: m[1], purpose: m[2] });
    }
  }

  // Rejected Approaches
  const rejectedBlock = sectionContent("Rejected Approaches");
  const rejectedChunks = rejectedBlock.split(/^### /m).filter(Boolean);
  for (const chunk of rejectedChunks) {
    const titleEnd = chunk.indexOf("\n");
    const title = titleEnd === -1 ? chunk.trim() : chunk.slice(0, titleEnd).trim();
    const body = titleEnd === -1 ? "" : chunk.slice(titleEnd);
    const reasonMatch = body.match(/\*\*Reason:\*\*\s*(.+)/);
    ctx.rejected.push({
      approach: title,
      reason: reasonMatch ? reasonMatch[1].trim() : "",
    });
  }

  // Open Questions
  const questionsBlock = sectionContent("Open Questions");
  const questionLines = questionsBlock
    .split("\n")
    .filter((l) => l.startsWith("- "));
  for (const line of questionLines) {
    const m = line.match(/^- \[(BLOCKING|non-blocking)\]\s*(.+)$/);
    if (m) {
      ctx.openQuestions.push({
        question: m[2],
        blocking: m[1] === "BLOCKING",
      });
    }
  }

  // Next Session
  const nextBlock = sectionContent("Next Session");
  const nextLines = nextBlock.split("\n").filter((l) => l.startsWith("- "));
  for (const line of nextLines) {
    ctx.nextSession.push(line.slice(2).trim());
  }

  return ctx;
}
