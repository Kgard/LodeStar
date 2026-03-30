// Merge layer — reconciles LLM synthesis output with existing .lodestar.md
// Core principle: synthesis can add and update, only the user can delete.

import type { LodestarContext, LodestarDecision, LodestarRejected, LodestarDiagram } from "./schema.js";

/**
 * Merge new LLM output with existing context.
 * Called between LLM response parsing and file write.
 */
export function mergeContexts(
  existing: LodestarContext,
  incoming: LodestarContext
): LodestarContext {
  return {
    // Meta: always take incoming (latest synthesis date/model)
    meta: incoming.meta,

    // Carry forward: take incoming if meaningfully changed, else keep existing
    projectSummary: incoming.projectSummary || existing.projectSummary,
    userSegments: incoming.userSegments.length > 0 ? incoming.userSegments : existing.userSegments,
    integrations: incoming.integrations.length > 0 ? incoming.integrations : existing.integrations,
    futurePhases: mergeFuturePhases(existing.futurePhases, incoming.futurePhases),

    // Accumulate: union existing + incoming, never drop
    decisions: mergeDecisions(existing.decisions, incoming.decisions),
    diagrams: mergeDiagrams(existing.diagrams, incoming.diagrams),
    patterns: mergePatterns(existing.patterns, incoming.patterns),
    dependencies: mergeDependencies(existing.dependencies, incoming.dependencies),
    rejected: mergeRejected(existing.rejected, incoming.rejected),

    // Update in place: match by name, update status, never drop
    features: mergeFeatures(existing.features, incoming.features),

    // LLM has full control: take incoming
    openQuestions: incoming.openQuestions,
    nextSession: incoming.nextSession,
  };
}

/**
 * Decisions: accumulate. Match by normalized title.
 * - If decision exists in both: update rationale/status/files from incoming, preserve group/session/supersededBy from existing if incoming lacks them
 * - If decision exists only in existing: keep it (LLM forgetting != deletion)
 * - If decision exists only in incoming: add it with current session date
 */
function mergeDecisions(
  existing: LodestarDecision[],
  incoming: LodestarDecision[]
): LodestarDecision[] {
  const result: LodestarDecision[] = [];
  const matched = new Set<number>();

  for (const prev of existing) {
    const incomingIdx = incoming.findIndex((d) => normalizeTitle(d.decision) === normalizeTitle(prev.decision));

    if (incomingIdx !== -1) {
      // Exists in both — merge fields
      const inc = incoming[incomingIdx];
      matched.add(incomingIdx);
      result.push({
        decision: inc.decision,
        rationale: inc.rationale || prev.rationale,
        status: inc.status ?? prev.status,
        group: inc.group ?? prev.group,
        session: prev.session, // preserve original session date
        supersededBy: inc.supersededBy ?? prev.supersededBy,
        files: inc.files ?? prev.files,
      });
    } else {
      // Only in existing — keep it
      result.push(prev);
    }
  }

  // Add new decisions from incoming that weren't in existing
  for (let i = 0; i < incoming.length; i++) {
    if (!matched.has(i)) {
      const inc = incoming[i];
      result.push({
        ...inc,
        session: inc.session ?? new Date().toISOString().slice(0, 10),
      });
    }
  }

  return result;
}

/**
 * Diagrams: append-only. Match by title.
 * - If diagram exists in both: take incoming version (LLM may have updated it)
 * - If diagram exists only in existing: keep it (user-authored or from prior synthesis)
 * - If diagram exists only in incoming: add it
 */
function mergeDiagrams(
  existing: LodestarDiagram[],
  incoming: LodestarDiagram[]
): LodestarDiagram[] {
  const result: LodestarDiagram[] = [];
  const matched = new Set<number>();

  for (const prev of existing) {
    const incomingIdx = incoming.findIndex((d) => normalizeTitle(d.title) === normalizeTitle(prev.title));

    if (incomingIdx !== -1) {
      matched.add(incomingIdx);
      result.push(incoming[incomingIdx]);
    } else {
      result.push(prev);
    }
  }

  for (let i = 0; i < incoming.length; i++) {
    if (!matched.has(i)) {
      result.push(incoming[i]);
    }
  }

  return result;
}

/**
 * Features: update in place. Match by feature name.
 * - If feature exists in both: take incoming status/percent, union capabilities
 * - If feature exists only in existing: keep it
 * - If feature exists only in incoming: add it
 */
function mergeFeatures(
  existing: LodestarContext["features"],
  incoming: LodestarContext["features"]
): LodestarContext["features"] {
  const result: LodestarContext["features"] = [];
  const matched = new Set<number>();

  for (const prev of existing) {
    const incomingIdx = incoming.findIndex((f) => normalizeTitle(f.feature) === normalizeTitle(prev.feature));

    if (incomingIdx !== -1) {
      const inc = incoming[incomingIdx];
      matched.add(incomingIdx);

      // Union capabilities
      const prevCaps = prev.capabilities ?? [];
      const incCaps = inc.capabilities ?? [];
      const capMap = new Map(prevCaps.map((c) => [c.name.toLowerCase(), c]));
      for (const cap of incCaps) {
        capMap.set(cap.name.toLowerCase(), cap); // incoming wins on status
      }

      result.push({
        feature: inc.feature,
        status: inc.status,
        percentComplete: inc.percentComplete,
        notes: inc.notes ?? prev.notes,
        capabilities: Array.from(capMap.values()),
      });
    } else {
      result.push(prev);
    }
  }

  for (let i = 0; i < incoming.length; i++) {
    if (!matched.has(i)) {
      result.push(incoming[i]);
    }
  }

  return result;
}

/**
 * Patterns: union by normalized pattern text.
 */
function mergePatterns(
  existing: LodestarContext["patterns"],
  incoming: LodestarContext["patterns"]
): LodestarContext["patterns"] {
  const seen = new Set<string>();
  const result: LodestarContext["patterns"] = [];

  for (const p of existing) {
    const key = p.pattern.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(p);
    }
  }

  for (const p of incoming) {
    const key = p.pattern.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(p);
    }
  }

  return result;
}

/**
 * Dependencies: union by package name.
 * If both have same package, take incoming purpose (may be updated).
 */
function mergeDependencies(
  existing: LodestarContext["dependencies"],
  incoming: LodestarContext["dependencies"]
): LodestarContext["dependencies"] {
  const map = new Map(existing.map((d) => [d.package.toLowerCase(), d]));
  for (const d of incoming) {
    map.set(d.package.toLowerCase(), d); // incoming wins on purpose
  }
  return Array.from(map.values());
}

/**
 * Rejected approaches: union by normalized approach text.
 * If both have same approach, take incoming (may have updated type/reason).
 */
function mergeRejected(
  existing: LodestarRejected[],
  incoming: LodestarRejected[]
): LodestarRejected[] {
  const result: LodestarRejected[] = [];
  const matched = new Set<number>();

  for (const prev of existing) {
    const incomingIdx = incoming.findIndex((r) => normalizeTitle(r.approach) === normalizeTitle(prev.approach));

    if (incomingIdx !== -1) {
      matched.add(incomingIdx);
      const inc = incoming[incomingIdx];
      result.push({
        approach: inc.approach,
        reason: inc.reason || prev.reason,
        type: inc.type ?? prev.type,
      });
    } else {
      result.push(prev);
    }
  }

  for (let i = 0; i < incoming.length; i++) {
    if (!matched.has(i)) {
      result.push(incoming[i]);
    }
  }

  return result;
}

/**
 * Future phases: union by phase name, merge items within each phase.
 */
function mergeFuturePhases(
  existing: LodestarContext["futurePhases"],
  incoming: LodestarContext["futurePhases"]
): LodestarContext["futurePhases"] {
  const result: LodestarContext["futurePhases"] = [];
  const matched = new Set<number>();

  for (const prev of existing) {
    const incomingIdx = incoming.findIndex((p) => normalizeTitle(p.phase) === normalizeTitle(prev.phase));

    if (incomingIdx !== -1) {
      matched.add(incomingIdx);
      const inc = incoming[incomingIdx];
      // Union items
      const itemSet = new Set(prev.items.map((i) => i.toLowerCase()));
      const mergedItems = [...prev.items];
      for (const item of inc.items) {
        if (!itemSet.has(item.toLowerCase())) {
          mergedItems.push(item);
        }
      }
      result.push({
        phase: inc.phase,
        description: inc.description || prev.description,
        items: mergedItems,
      });
    } else {
      result.push(prev);
    }
  }

  for (let i = 0; i < incoming.length; i++) {
    if (!matched.has(i)) {
      result.push(incoming[i]);
    }
  }

  return result;
}

/**
 * Normalize a title for matching — lowercase, trim, collapse whitespace.
 */
function normalizeTitle(title: string): string {
  return title.toLowerCase().trim().replace(/\s+/g, " ");
}
