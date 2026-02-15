import type { ProjectStatus, Department } from "@/types/database";

/** Valid status transitions per department */
const TRANSITION_MAP: Record<Department, Record<string, ProjectStatus[]>> = {
  creative: {
    requested: ["narrative_review", "on_hold"],
    narrative_review: ["brand_collection", "in_progress", "requested", "on_hold"],
    brand_collection: ["in_progress", "on_hold"],
    in_progress: ["review", "on_hold"],
    review: ["live", "revision", "on_hold"],
    revision: ["in_progress", "on_hold"],
    live: ["revision", "on_hold"],
    on_hold: ["requested", "narrative_review", "brand_collection", "in_progress", "review"],
  },
  strategy: {
    research_queued: ["researching", "on_hold"],
    researching: ["research_review", "on_hold"],
    research_review: ["research_complete", "researching", "on_hold"],
    research_complete: ["on_hold"],
    on_hold: ["research_queued", "researching", "research_review"],
  },
  intelligence: {
    monitoring: ["analyzing", "paused"],
    analyzing: ["monitoring", "paused"],
    paused: ["monitoring", "analyzing"],
  },
};

export interface TransitionResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate whether a status transition is allowed for a given department.
 */
export function validateTransition(
  department: Department,
  currentStatus: ProjectStatus,
  newStatus: ProjectStatus,
): TransitionResult {
  const deptMap = TRANSITION_MAP[department];
  if (!deptMap) {
    return { valid: false, error: `unknown department: ${department}` };
  }

  const allowed = deptMap[currentStatus];
  if (!allowed) {
    return { valid: false, error: `status "${currentStatus}" has no transitions defined for ${department}` };
  }

  if (!allowed.includes(newStatus)) {
    return {
      valid: false,
      error: `cannot transition from "${currentStatus}" to "${newStatus}" in ${department}. allowed: ${allowed.join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Get all valid next statuses for a project in its current state.
 */
export function getValidNextStatuses(
  department: Department,
  currentStatus: ProjectStatus,
): ProjectStatus[] {
  const deptMap = TRANSITION_MAP[department];
  if (!deptMap) return [];
  return deptMap[currentStatus] ?? [];
}

/**
 * Get the initial status for a new project in a given department.
 */
export function getInitialStatus(department: Department): ProjectStatus {
  switch (department) {
    case "creative": return "requested";
    case "strategy": return "research_queued";
    case "intelligence": return "monitoring";
  }
}
