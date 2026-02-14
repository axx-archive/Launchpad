import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import TrendDetail from "@/components/intelligence/TrendDetail";
import type { TrendCluster, VelocityScore, Entity } from "@/types/intelligence";

export default async function TrendDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/sign-in");
  }

  const admin = isAdmin(user.email);
  const adminClient = createAdminClient();

  // Fetch cluster
  const { data: clusterData, error: clusterError } = await adminClient
    .from("trend_clusters")
    .select("*")
    .eq("id", id)
    .single();

  if (clusterError || !clusterData) {
    notFound();
  }

  const cluster = clusterData as TrendCluster;

  // Fetch velocity history (30 days)
  const { data: velocityData } = await adminClient
    .from("velocity_scores")
    .select("*")
    .eq("cluster_id", id)
    .order("score_date", { ascending: true })
    .limit(30);

  const velocityHistory = (velocityData ?? []) as VelocityScore[];

  // Fetch recent signals (via assignments)
  const { data: assignmentData } = await adminClient
    .from("signal_cluster_assignments")
    .select("confidence, is_primary, signals!inner(id, title, content_snippet, source, source_url, published_at, upvotes, comments, views, likes)")
    .eq("cluster_id", id)
    .order("confidence", { ascending: false })
    .limit(15);

  const recentSignals = (assignmentData ?? []).map((a) => {
    const s = a.signals as unknown as Record<string, unknown>;
    return {
      id: s.id as string,
      title: s.title as string | null,
      content_snippet: s.content_snippet as string | null,
      source: s.source as "reddit" | "youtube" | "x" | "rss",
      source_url: s.source_url as string | null,
      published_at: s.published_at as string | null,
      upvotes: (s.upvotes as number) ?? 0,
      comments: (s.comments as number) ?? 0,
      views: (s.views as number) ?? 0,
      likes: (s.likes as number) ?? 0,
      _cluster_confidence: a.confidence,
      _cluster_is_primary: a.is_primary,
    };
  });

  // Fetch linked projects
  const { data: linkData } = await adminClient
    .from("project_trend_links")
    .select("project_id, link_type, notes, created_at, projects!inner(id, project_name, status)")
    .eq("cluster_id", id)
    .order("created_at", { ascending: false });

  const linkedProjects = (linkData ?? []).map((l) => ({
    project_id: l.project_id,
    link_type: l.link_type,
    notes: l.notes,
    created_at: l.created_at,
    projects: l.projects as unknown as { id: string; project_name: string; status: string },
  }));

  // Fetch related entities
  const { data: entityData } = await adminClient
    .from("entity_signal_links")
    .select("entity_id, entities!inner(id, name, entity_type, signal_count)")
    .in(
      "signal_id",
      recentSignals.map((s) => s.id),
    )
    .limit(50);

  // Deduplicate entities
  const entityMap = new Map<string, Entity & { signal_count: number }>();
  for (const row of entityData ?? []) {
    const e = row.entities as unknown as Entity & { signal_count: number };
    if (e && !entityMap.has(e.id)) {
      entityMap.set(e.id, e);
    }
  }
  const relatedEntities = Array.from(entityMap.values())
    .sort((a, b) => b.signal_count - a.signal_count)
    .slice(0, 20);

  return (
    <TrendDetail
      cluster={cluster}
      velocityHistory={velocityHistory}
      recentSignals={recentSignals}
      linkedProjects={linkedProjects}
      relatedEntities={relatedEntities}
      isAdmin={admin}
    />
  );
}
