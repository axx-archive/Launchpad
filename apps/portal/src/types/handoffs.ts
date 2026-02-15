import type { Department, ProjectType } from "@/types/database";

/** Base handoff payload — shared by all handoff types */
interface HandoffBase {
  source_id: string;
  source_type: "project" | "trend";
  source_department: Department;
  target_department: Department;
  project_name?: string;
  notes?: string;
}

/** Intelligence trend → Strategy research project */
export interface TrendToStrategy extends HandoffBase {
  source_type: "trend";
  source_department: "intelligence";
  target_department: "strategy";
  research_type?: "market_research" | "competitive_analysis" | "funding_landscape";
}

/** Strategy research → Creative pitchapp */
export interface ResearchToCreative extends HandoffBase {
  source_type: "project";
  source_department: "strategy";
  target_department: "creative";
  creative_type?: ProjectType;
  target_audience?: string;
}

/** Creative refinement from any source */
export interface CreativeRefineFromSource extends HandoffBase {
  target_department: "creative";
  creative_type?: ProjectType;
  target_audience?: string;
  timeline_preference?: string;
}

/** Union of all handoff types */
export type HandoffPayload = TrendToStrategy | ResearchToCreative | CreativeRefineFromSource;

/** Handoff receipt returned after successful promotion */
export interface HandoffReceipt {
  source_id: string;
  source_type: "project" | "trend";
  source_department: Department;
  target_id: string;
  target_department: Department;
  relationship: "promoted_to";
  created_at: string;
}

/** Lineage node for display in JourneyTrail */
export interface LineageNode {
  id: string;
  type: "project" | "trend";
  department: Department;
  name: string;
  status: string;
  timestamp: string;
  isCurrent: boolean;
}
