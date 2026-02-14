export type ProjectType = "investor_pitch" | "client_proposal" | "research_report" | "website" | "other";

export type ProjectStatus =
  | "requested"
  | "narrative_review"
  | "brand_collection"
  | "in_progress"
  | "review"
  | "revision"
  | "live"
  | "on_hold";

/** Display labels for project statuses */
export const STATUS_LABELS: Record<ProjectStatus, string> = {
  requested: "queued",
  narrative_review: "story review",
  brand_collection: "brand assets",
  in_progress: "in build",
  review: "pitchapp review",
  revision: "revision",
  live: "live",
  on_hold: "hold",
};

export type AutonomyLevel = "manual" | "supervised" | "full_auto";

export interface Project {
  id: string;
  user_id: string;
  company_name: string;
  project_name: string;
  type: ProjectType;
  status: ProjectStatus;
  autonomy_level: AutonomyLevel;
  pitchapp_url: string | null;
  target_audience: string | null;
  materials_link: string | null;
  timeline_preference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Resolved server-side for admin views only */
  submitter_email?: string | null;
}

export interface ScoutMessage {
  id: string;
  project_id: string;
  role: "user" | "assistant";
  content: string;
  edit_brief_md: string | null;
  edit_brief_json: Record<string, unknown> | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  project_id: string | null;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
}

export interface ProjectDocument {
  name: string;
  id: string | null;
  metadata: {
    size: number;
    mimetype: string;
  } | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Pipeline & Automation types
// ---------------------------------------------------------------------------

export type PipelineJobType =
  | "auto-pull"
  | "auto-narrative"
  | "auto-copy"
  | "auto-build"
  | "auto-build-html"
  | "auto-review"
  | "auto-push"
  | "auto-brief"
  | "auto-revise"
  | "health-check";

export type PipelineJobStatus =
  | "pending"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface PipelineJob {
  id: string;
  project_id: string;
  job_type: PipelineJobType;
  status: PipelineJobStatus;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface AutomationLog {
  id: string;
  job_id: string | null;
  project_id: string | null;
  event: string;
  details: Record<string, unknown>;
  cost_usd: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Brand Assets types
// ---------------------------------------------------------------------------

export type BrandAssetCategory = 'logo' | 'hero' | 'team' | 'background' | 'other';

export interface BrandAsset {
  id: string;
  project_id: string;
  category: BrandAssetCategory;
  file_name: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  label: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Table names for type-safe table references */
export type TableName =
  | "projects"
  | "scout_messages"
  | "notifications"
  | "pitchapp_manifests"
  | "pipeline_jobs"
  | "automation_log"
  | "project_narratives"
  | "brand_assets";

// ---------------------------------------------------------------------------
// Narrative types
// ---------------------------------------------------------------------------

export type NarrativeStatus = 'pending_review' | 'approved' | 'rejected' | 'superseded';

export interface NarrativeSection {
  number: number;
  label: string;
  headline: string;
  body: string;
  emotional_beat?: string;
}

export interface ProjectNarrative {
  id: string;
  project_id: string;
  version: number;
  content: string;
  sections: NarrativeSection[] | null;
  status: NarrativeStatus;
  source_job_id: string | null;
  revision_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Re-export manifest types from scout module */
export type {
  PitchAppManifest,
  ManifestSection,
  DesignTokens,
  ManifestMeta,
} from "../lib/scout/types";
