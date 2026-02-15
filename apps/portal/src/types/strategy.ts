// ---------------------------------------------------------------------------
// Strategy department types
// ---------------------------------------------------------------------------

export type ResearchType = "market" | "competitive" | "trend" | "custom";

export type ResearchStatus = "draft" | "approved" | "superseded";

export interface ProjectResearch {
  id: string;
  project_id: string;
  version: number;
  content: string;
  research_type: ResearchType;
  trend_cluster_ids: string[];
  quality_scores: Record<string, number> | null;
  is_polished: boolean;
  status: ResearchStatus;
  source_job_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  revision_notes: string | null;
  created_at: string;
  updated_at: string;
}
