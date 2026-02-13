export type ProjectType = "investor_pitch" | "research_report" | "website" | "other";

export type ProjectStatus =
  | "requested"
  | "in_progress"
  | "review"
  | "revision"
  | "live"
  | "on_hold";

/** Display labels for project statuses */
export const STATUS_LABELS: Record<ProjectStatus, string> = {
  requested: "queued",
  in_progress: "in build",
  review: "review",
  revision: "revision",
  live: "live",
  on_hold: "hold",
};

export interface Project {
  id: string;
  user_id: string;
  company_name: string;
  project_name: string;
  type: ProjectType;
  status: ProjectStatus;
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

/** Table names for type-safe table references */
export type TableName = "projects" | "scout_messages" | "notifications" | "pitchapp_manifests";

/** Re-export manifest types from scout module */
export type {
  PitchAppManifest,
  ManifestSection,
  DesignTokens,
  ManifestMeta,
} from "../lib/scout/types";
