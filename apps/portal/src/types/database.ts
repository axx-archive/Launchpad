export type Department = "intelligence" | "strategy" | "creative";

export type PipelineMode = "intelligence" | "strategy" | "creative";

export type ProjectType =
  | "investor_pitch" | "client_proposal" | "research_report" | "website" | "other"
  // Intelligence
  | "trend_monitor" | "white_space_analysis" | "influencer_tracker"
  // Strategy
  | "market_research" | "competitive_analysis" | "funding_landscape";

export type ProjectStatus =
  // Creative (existing)
  | "requested"
  | "narrative_review"
  | "brand_collection"
  | "in_progress"
  | "review"
  | "revision"
  | "live"
  | "on_hold"
  // Strategy
  | "research_queued"
  | "researching"
  | "research_review"
  | "research_complete"
  // Intelligence
  | "monitoring"
  | "paused"
  | "analyzing";

/** Display labels for project statuses */
export const STATUS_LABELS: Record<ProjectStatus, string> = {
  // Creative
  requested: "queued",
  narrative_review: "story review",
  brand_collection: "brand assets",
  in_progress: "in build",
  review: "pitchapp review",
  revision: "revision",
  live: "live",
  on_hold: "hold",
  // Strategy
  research_queued: "research queued",
  researching: "researching",
  research_review: "research review",
  research_complete: "research complete",
  // Intelligence
  monitoring: "monitoring",
  paused: "paused",
  analyzing: "analyzing",
};

export type AutonomyLevel = "manual" | "supervised" | "full_auto";

export interface BrandAnalysis {
  colors: {
    primary: string;
    secondary: string | null;
    accent: string | null;
    background: string | null;
    text: string | null;
  };
  fonts: {
    heading: string | null;
    body: string | null;
  };
  style_direction: string;
  logo_notes: string | null;
  analyzed_at: string;
  asset_count: number;
}

export interface Project {
  id: string;
  user_id: string;
  company_name: string;
  project_name: string;
  type: ProjectType;
  status: ProjectStatus;
  department: Department;
  pipeline_mode: PipelineMode;
  autonomy_level: AutonomyLevel;
  /** UI hint only — access controlled by project_members */
  visibility: 'private' | 'shared';
  pitchapp_url: string | null;
  target_audience: string | null;
  materials_link: string | null;
  timeline_preference: string | null;
  notes: string | null;
  revision_cooldown_until: string | null;
  brand_analysis: BrandAnalysis | null;
  created_at: string;
  updated_at: string;
  /** Resolved server-side for admin views only */
  submitter_email?: string | null;
}

export interface MessageAttachment {
  asset_id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
}

export interface ScoutMessage {
  id: string;
  project_id: string;
  role: "user" | "assistant";
  content: string;
  edit_brief_md: string | null;
  edit_brief_json: Record<string, unknown> | null;
  attachments: MessageAttachment[];
  /** User who sent this message (null for pre-collaboration messages) */
  sender_id: string | null;
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
  // Creative (existing)
  | "auto-pull"
  | "auto-narrative"
  | "auto-copy"
  | "auto-build"
  | "auto-build-html"
  | "auto-review"
  | "auto-push"
  | "auto-brief"
  | "auto-revise"
  | "health-check"
  // Strategy (reuses auto-pull)
  | "auto-research"
  // Intelligence
  | "auto-ingest"
  | "auto-cluster"
  | "auto-score"
  | "auto-snapshot"
  | "auto-analyze-trends"
  | "auto-generate-brief";

export type PipelineJobStatus =
  | "pending"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface ConfidenceScores {
  specificity: number;
  evidence_quality: number;
  emotional_arc: number;
  differentiation: number;
  overall: number;
  explanations?: Partial<Record<keyof Omit<ConfidenceScores, "overall" | "explanations">, string>>;
}

export interface PipelineJobProgress {
  turn: number;
  max_turns: number;
  last_action: string;
  confidence?: ConfidenceScores;
}

export interface PipelineJob {
  id: string;
  project_id: string;
  job_type: PipelineJobType;
  status: PipelineJobStatus;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  progress: PipelineJobProgress | null;
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
  department: Department;
  event: string;
  details: Record<string, unknown>;
  cost_usd: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Brand Assets types
// ---------------------------------------------------------------------------

export type BrandAssetCategory = 'logo' | 'hero' | 'team' | 'background' | 'font' | 'other';

export type BrandAssetSource = 'initial' | 'revision';

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
  source: BrandAssetSource;
  linked_message_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetReference {
  asset_id: string;
  intent: string;
  file_name: string;
}

export interface AnimationSpec {
  /** Category.subcategory from taxonomy (e.g., "text.decode", "scroll.pin") */
  animation_type: string;

  /** Low | Medium | High — informs routing and effort estimation */
  complexity: "low" | "medium" | "high";

  /** Which element(s) the animation targets */
  target: {
    /** CSS selector or semantic description */
    selector: string;
    /** What type of element: "headline", "background", "card", "section", etc. */
    element_type: string;
  };

  /** Timing preferences expressed by the user (optional) */
  timing?: {
    /** "on_scroll" | "on_load" | "on_hover" | "on_click" | "continuous" */
    trigger: string;
    /** User-expressed speed preference: "fast", "slow", "dramatic", "subtle" */
    feel?: string;
  };

  /** For animations that need assets (videos, SVGs, images) */
  asset_requirements?: {
    /** What kind of asset is needed */
    type: "video" | "image" | "svg" | "none";
    /** Whether the user has already provided it or it needs to be sourced */
    status: "provided" | "needs_sourcing" | "not_needed";
  };

  /** Reference to a known pattern from the codebase (for the builder) */
  pattern_reference?: {
    /** App that has this pattern */
    source_app: string;
    /** Function or section to reference */
    reference: string;
  };

  /** Mobile behavior specification */
  mobile_behavior?: "same" | "simplified" | "disabled" | "alternative";

  /** Accessibility note — how this respects prefers-reduced-motion */
  reduced_motion_behavior?: string;
}

export interface EditChange {
  section_id: string;
  change_type: string;
  description: string;
  priority?: string;
  asset_references?: AssetReference[];
  /** Present only when change_type === "animation" */
  animation_spec?: AnimationSpec;
}

// ---------------------------------------------------------------------------
// Collaboration types
// ---------------------------------------------------------------------------

export type MemberRole = 'owner' | 'editor' | 'viewer';

export type InvitationStatus = 'pending' | 'accepted' | 'revoked';

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: MemberRole;
  invited_by: string | null;
  created_at: string;
}

export interface ProjectInvitation {
  id: string;
  project_id: string;
  email: string;
  role: Exclude<MemberRole, 'owner'>;
  invited_by: string;
  token: string;
  status: InvitationStatus;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

/** Unified collaborator for UI — combines active members + pending invitations */
export interface Collaborator {
  user_id: string | null;
  email: string;
  role: MemberRole;
  status: 'active' | 'pending';
}

/** Extended Project type for dashboard shared view */
export interface ProjectWithRole extends Project {
  userRole: Exclude<MemberRole, 'owner'>;
  ownerEmail: string;
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
  | "brand_assets"
  | "user_profiles"
  | "project_members"
  | "project_invitations"
  // Intelligence
  | "trend_clusters"
  | "signals"
  | "signal_cluster_assignments"
  | "entities"
  | "entity_signal_links"
  | "velocity_scores"
  | "intelligence_briefs"
  | "api_quota_tracking"
  // Strategy
  | "project_research"
  // Cross-department
  | "cross_department_refs"
  | "project_trend_links";

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

/** Reuses ConfidenceScores from pipeline types for consistency */
export type NarrativeConfidence = ConfidenceScores;

export interface ProjectNarrative {
  id: string;
  project_id: string;
  version: number;
  content: string;
  sections: NarrativeSection[] | null;
  confidence: NarrativeConfidence | null;
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
