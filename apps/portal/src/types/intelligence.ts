// ---------------------------------------------------------------------------
// Intelligence department types — matches flat table names from roadmap
// ---------------------------------------------------------------------------

export type SignalSource = "reddit" | "youtube" | "x" | "rss";

export type ClusterLifecycle =
  | "emerging"
  | "peaking"
  | "cooling"
  | "evergreen"
  | "dormant";

export type BriefType = "daily_digest" | "trend_deep_dive" | "alert";

export type ClusterAssignmentMethod = "llm" | "manual" | "merge";

export type EntityType = "person" | "brand" | "product" | "event" | "place";

// ---------------------------------------------------------------------------
// Core tables
// ---------------------------------------------------------------------------

export interface TrendCluster {
  id: string;
  name: string;
  summary: string | null;
  category: string | null;
  tags: string[];
  lifecycle: ClusterLifecycle;
  velocity_score: number;
  velocity_percentile: number;
  signal_count: number;
  first_seen_at: string;
  last_signal_at: string | null;
  merged_into_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Signal {
  id: string;
  source: SignalSource;
  source_id: string;
  title: string | null;
  content_snippet: string | null;
  author: string | null;
  subreddit: string | null;
  channel_id: string | null;
  upvotes: number;
  comments: number;
  views: number;
  likes: number;
  engagement_delta: Record<string, number> | null;
  pull_count: number;
  is_clustered: boolean;
  content_hash: string | null;
  published_at: string | null;
  source_url: string | null;
  ingested_at: string;
  created_at: string;
  updated_at: string;
}

export interface SignalClusterAssignment {
  id: string;
  signal_id: string;
  cluster_id: string;
  confidence: number;
  is_primary: boolean;
  assigned_by: ClusterAssignmentMethod;
  created_at: string;
}

export interface Entity {
  id: string;
  name: string;
  entity_type: EntityType;
  normalized_name: string;
  signal_count: number;
  created_at: string;
  updated_at: string;
}

export interface EntitySignalLink {
  id: string;
  entity_id: string;
  signal_id: string;
  mention_context: string | null;
  created_at: string;
}

export interface VelocityScore {
  id: string;
  cluster_id: string;
  score_date: string;
  engagement_z: number;
  signal_freq_z: number;
  velocity: number;
  percentile: number;
  signal_count: number;
  lifecycle: ClusterLifecycle;
  created_at: string;
}

export interface IntelligenceBrief {
  id: string;
  brief_type: BriefType;
  title: string;
  content: string;
  cluster_ids: string[];
  source_job_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiQuotaTracking {
  id: string;
  api_source: string;
  period_start: string;
  period_end: string;
  units_used: number;
  units_limit: number;
  created_at: string;
  updated_at: string;
}
