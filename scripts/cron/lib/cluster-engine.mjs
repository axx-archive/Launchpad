/**
 * LLM Clustering Engine — Intelligence department trend clustering.
 *
 * Incremental clustering: takes unclustered signals and assigns them to
 * existing trend clusters or proposes new ones, using Claude Haiku for
 * cost-efficient batch classification.
 *
 * Algorithm:
 * 1. Load active cluster summaries (~2K tokens for 50 clusters)
 * 2. Load unclustered signals (max 200, ordered by ingestion time)
 * 3. Batch 10-20 signals per LLM call
 * 4. Post-process: create new clusters, insert assignments, mark clustered
 * 5. Extract entities from signal text
 * 6. Update denormalized counts on trend_clusters
 *
 * Model: Claude Haiku 4.5 (primary), configurable via env
 * Cost: ~$0.004 per 200-signal batch
 */

import { dbGet, dbPost, dbPatch, dbRpc, logAutomation } from "./supabase.mjs";
import { estimateCostCents, logCost, checkDepartmentBudget } from "./cost-tracker.mjs";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BATCH_SIZE = 15;  // Signals per LLM call (10-20 range)
const MAX_SIGNALS_PER_RUN = 200;
const MODEL = process.env.INTELLIGENCE_CLUSTERING_MODEL || "claude-haiku-4-5-20251001";

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run incremental clustering on unclustered signals.
 *
 * @param {Object} options
 * @param {string|null} options.jobId - Pipeline job ID (for cost tracking)
 * @returns {Promise<{clusters_created: number, assignments_made: number, entities_extracted: number, errors: string[]}>}
 */
export async function runClustering({ jobId = null } = {}) {
  const result = {
    clusters_created: 0,
    assignments_made: 0,
    entities_extracted: 0,
    signals_processed: 0,
    batches_run: 0,
    errors: [],
  };

  // Check department budget
  const budget = await checkDepartmentBudget("intelligence");
  if (!budget.allowed) {
    result.errors.push(`Intelligence department budget exhausted: ${budget.used_cents}c / ${budget.cap_cents}c`);
    return result;
  }

  // 1. Load active clusters
  const clusters = await loadActiveClusters();

  // 2. Load unclustered signals
  const signals = await loadUnclusteredSignals();
  if (signals.length === 0) {
    return result;
  }

  // 3. Process in batches
  const batches = chunkArray(signals, BATCH_SIZE);

  for (const batch of batches) {
    // Re-check budget before each batch
    const batchBudget = await checkDepartmentBudget("intelligence");
    if (!batchBudget.allowed) {
      result.errors.push("Budget exhausted mid-run, stopping");
      break;
    }

    try {
      const batchResult = await processBatch(batch, clusters, jobId);

      result.assignments_made += batchResult.assignments_made;
      result.clusters_created += batchResult.clusters_created;
      result.entities_extracted += batchResult.entities_extracted;
      result.signals_processed += batch.length;
      result.batches_run++;

      // Add newly created clusters to our working set for subsequent batches
      for (const newCluster of batchResult.new_clusters) {
        clusters.push(newCluster);
      }
    } catch (err) {
      result.errors.push(`Batch failed: ${err.message}`);
    }
  }

  // 4. Update denormalized signal_count on all affected clusters
  try {
    await updateClusterSignalCounts();
  } catch (err) {
    result.errors.push(`Signal count update failed: ${err.message}`);
  }

  await logAutomation("clustering-complete", {
    ...result,
    department: "intelligence",
  }, null);

  return result;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadActiveClusters() {
  try {
    const clusters = await dbGet(
      "trend_clusters",
      "select=id,name,summary,category,tags,signal_count&is_active=eq.true&order=signal_count.desc&limit=100"
    );
    return clusters;
  } catch (err) {
    throw new Error(`Failed to load active clusters: ${err.message}`);
  }
}

async function loadUnclusteredSignals() {
  try {
    const signals = await dbGet(
      "signals",
      `select=id,title,content_snippet,source,author,subreddit,channel_id,published_at&is_clustered=eq.false&order=ingested_at.asc&limit=${MAX_SIGNALS_PER_RUN}`
    );
    return signals;
  } catch (err) {
    throw new Error(`Failed to load unclustered signals: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Batch processing
// ---------------------------------------------------------------------------

async function processBatch(signals, existingClusters, jobId) {
  const batchResult = {
    assignments_made: 0,
    clusters_created: 0,
    entities_extracted: 0,
    new_clusters: [],
  };

  // Build LLM prompt
  const prompt = buildClusteringPrompt(signals, existingClusters);

  // Call LLM
  let llmResponse;
  try {
    llmResponse = await callClusteringLLM(prompt, jobId);
  } catch (err) {
    throw new Error(`LLM call failed: ${err.message}`);
  }

  // Parse response
  let assignments;
  try {
    assignments = parseClusteringResponse(llmResponse);
  } catch (err) {
    throw new Error(`Failed to parse LLM response: ${err.message}`);
  }

  // Process assignments
  const newClusterMap = new Map(); // temp_id → real cluster

  for (const assignment of assignments) {
    try {
      let clusterId = assignment.cluster_id;

      // Handle new cluster creation
      if (clusterId === "NEW" && assignment.new_cluster) {
        const tempKey = assignment.new_cluster.name;

        if (newClusterMap.has(tempKey)) {
          // Reuse already-created cluster from this batch
          clusterId = newClusterMap.get(tempKey).id;
        } else {
          // Create new cluster
          const newCluster = await createCluster(assignment.new_cluster);
          newClusterMap.set(tempKey, newCluster);
          batchResult.new_clusters.push(newCluster);
          batchResult.clusters_created++;
          clusterId = newCluster.id;
        }
      }

      if (!clusterId || clusterId === "NEW") continue;

      // Insert assignment
      await insertAssignment({
        signal_id: assignment.signal_id,
        cluster_id: clusterId,
        confidence: assignment.confidence || 0.8,
        is_primary: assignment.is_primary !== false,
      });
      batchResult.assignments_made++;

    } catch (err) {
      // Log but don't fail the whole batch for one assignment
      console.error(JSON.stringify({
        error: "assignment-failed",
        signal_id: assignment.signal_id,
        message: err.message,
      }));
    }
  }

  // Only mark signals as clustered if at least one assignment was made.
  // If LLM returned garbage or all assignments failed, leave signals unclustered
  // so they get retried in the next batch.
  if (batchResult.assignments_made > 0) {
    // Only mark signals that actually got assigned (not the whole batch)
    const assignedSignalIds = new Set(
      assignments
        .filter(a => a.signal_id && a.cluster_id && a.cluster_id !== "NEW")
        .map(a => a.signal_id)
    );
    // Also include signals assigned to newly created clusters
    for (const [, cluster] of newClusterMap) {
      for (const a of assignments) {
        if (a.new_cluster?.name && a.signal_id) {
          assignedSignalIds.add(a.signal_id);
        }
      }
    }
    const signalIds = signals
      .map(s => s.id)
      .filter(id => assignedSignalIds.has(id));
    if (signalIds.length > 0) {
      await markSignalsClustered(signalIds);
    }
  }

  // Extract entities from signals
  try {
    const entityCount = await extractEntities(signals, jobId);
    batchResult.entities_extracted = entityCount;
  } catch (err) {
    // Entity extraction is non-critical
    console.error(JSON.stringify({
      error: "entity-extraction-failed",
      message: err.message,
    }));
  }

  return batchResult;
}

// ---------------------------------------------------------------------------
// LLM interaction
// ---------------------------------------------------------------------------

function buildClusteringPrompt(signals, existingClusters) {
  // Format clusters for context (~40 tokens per cluster)
  const clusterContext = existingClusters.length > 0
    ? existingClusters.map(c =>
        `- ID: ${c.id} | "${c.name}" (${c.category || "general"}) — ${(c.summary || "").slice(0, 100)} [${c.signal_count} signals]`
      ).join("\n")
    : "(No existing clusters yet — all signals will need new clusters)";

  // Format signals (~80 tokens per signal)
  const signalList = signals.map(s =>
    `- Signal ${s.id}: [${s.source}] "${s.title || "(no title)"}" — ${(s.content_snippet || "").slice(0, 200)}${s.subreddit ? ` (r/${s.subreddit})` : ""}${s.channel_id ? ` (YouTube)` : ""}`
  ).join("\n");

  return `You are a cultural trend analyst. Your job is to assign new signals to existing trend clusters, or propose new clusters when signals don't fit existing ones.

## Existing Trend Clusters
${clusterContext}

## New Signals to Classify
${signalList}

## Instructions
For each signal, determine:
1. Does it fit an existing cluster? → Assign it with a confidence score (0.0-1.0)
2. Does it represent a new trend? → Propose a new cluster

A signal can be assigned to multiple clusters if relevant (mark only one as is_primary: true).
Only create a new cluster if the signal genuinely represents a distinct trend not covered by existing clusters.
Merge similar new cluster proposals — don't create near-duplicates.

## Output Format
Return ONLY valid JSON (no markdown, no explanation):
{
  "assignments": [
    {
      "signal_id": "<uuid>",
      "cluster_id": "<existing-uuid>",
      "confidence": 0.85,
      "is_primary": true
    },
    {
      "signal_id": "<uuid>",
      "cluster_id": "NEW",
      "new_cluster": {
        "name": "Short Trend Name",
        "summary": "2-3 sentence description of this cultural trend.",
        "category": "entertainment|music|tech|sports|fashion|culture|marketing|business|science|politics|general",
        "tags": ["tag1", "tag2", "tag3"]
      },
      "confidence": 0.9,
      "is_primary": true
    }
  ]
}`;
}

async function callClusteringLLM(prompt, jobId) {
  // Load Anthropic SDK
  let Anthropic;
  try {
    Anthropic = (await import("@anthropic-ai/sdk")).default;
  } catch {
    throw new Error("@anthropic-ai/sdk not installed. Run: npm install @anthropic-ai/sdk");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  // Track cost — logCost already writes to automation_log via logAutomation("cost-incurred")
  // so we only call logCost (not both) to avoid double-counting in budget checks.
  if (response.usage) {
    const costCents = estimateCostCents(response.usage, MODEL);
    if (costCents > 0) {
      await logAutomation("cost-incurred", {
        job_id: jobId,
        job_type: "auto-cluster",
        cost_cents: costCents,
        model: MODEL,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        department: "intelligence",
      }, null);
    }
  }

  // Extract text content
  const textBlock = response.content.find(b => b.type === "text");
  if (!textBlock) throw new Error("No text in LLM response");

  return textBlock.text;
}

function parseClusteringResponse(text) {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Invalid JSON from LLM: ${err.message}. Raw: ${cleaned.slice(0, 200)}`);
  }

  if (!parsed.assignments || !Array.isArray(parsed.assignments)) {
    throw new Error("LLM response missing 'assignments' array");
  }

  return parsed.assignments;
}

// ---------------------------------------------------------------------------
// Entity extraction
// ---------------------------------------------------------------------------

async function extractEntities(signals, jobId) {
  if (signals.length === 0) return 0;

  // Build a lightweight prompt for entity extraction
  const signalText = signals.map(s =>
    `[${s.id}] ${s.title || ""} ${(s.content_snippet || "").slice(0, 150)}`
  ).join("\n");

  const prompt = `Extract named entities (people, brands, products, events, places) from these signals. Return ONLY valid JSON:

${signalText}

Output format:
{
  "entities": [
    {
      "name": "Entity Name",
      "type": "person|brand|product|event|place",
      "signal_ids": ["<uuid>", "<uuid>"],
      "context": "Brief mention context"
    }
  ]
}`;

  let Anthropic;
  try {
    Anthropic = (await import("@anthropic-ai/sdk")).default;
  } catch {
    return 0;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return 0;

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  // Track cost
  if (response.usage) {
    const costCents = estimateCostCents(response.usage, MODEL);
    if (costCents > 0) {
      await logAutomation("cost-incurred", {
        job_type: "entity-extraction",
        cost_cents: costCents,
        model: MODEL,
        department: "intelligence",
      }, null);
    }
  }

  const textBlock = response.content.find(b => b.type === "text");
  if (!textBlock) return 0;

  let parsed;
  try {
    let cleaned = textBlock.text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }
    parsed = JSON.parse(cleaned);
  } catch {
    return 0;
  }

  if (!parsed.entities || !Array.isArray(parsed.entities)) return 0;

  let count = 0;
  for (const entity of parsed.entities) {
    try {
      await upsertEntity(entity);
      count++;
    } catch {
      // Non-critical — skip failed entities
    }
  }

  return count;
}

async function upsertEntity(entity) {
  const normalizedName = (entity.name || "").toLowerCase().trim();
  if (!normalizedName) return;

  const entityType = entity.type || "brand";

  // Validate entity_type to prevent injection
  const validTypes = ["person", "brand", "product", "event", "place"];
  if (!validTypes.includes(entityType)) return;

  // Check if entity already exists
  // Use encodeURIComponent for the name to handle special characters in PostgREST queries
  const existing = await dbGet(
    "entities",
    `select=id,signal_count&normalized_name=eq.${encodeURIComponent(normalizedName)}&entity_type=eq.${entityType}&limit=1`
  );

  let entityId;
  if (existing.length > 0) {
    entityId = existing[0].id;
    // Increment signal_count
    await dbPatch("entities", `id=eq.${entityId}`, {
      signal_count: (existing[0].signal_count || 0) + (entity.signal_ids?.length || 1),
      updated_at: new Date().toISOString(),
    });
  } else {
    // Create new entity
    const created = await dbPost("entities", {
      name: entity.name,
      entity_type: entityType,
      normalized_name: normalizedName,
      signal_count: entity.signal_ids?.length || 1,
    });
    entityId = created[0]?.id;
  }

  if (!entityId || !entity.signal_ids) return;

  // Link entity to signals
  for (const signalId of entity.signal_ids) {
    try {
      await dbPost("entity_signal_links", {
        entity_id: entityId,
        signal_id: signalId,
        mention_context: (entity.context || "").slice(0, 500),
      });
    } catch {
      // Ignore duplicate link errors (unique constraint)
    }
  }
}

// ---------------------------------------------------------------------------
// Database operations
// ---------------------------------------------------------------------------

async function createCluster(spec) {
  const rows = await dbPost("trend_clusters", {
    name: spec.name,
    summary: spec.summary || "",
    category: spec.category || "general",
    tags: spec.tags || [],
    lifecycle: "emerging",
    velocity_score: 0,
    velocity_percentile: 0,
    signal_count: 0,
    first_seen_at: new Date().toISOString(),
    is_active: true,
  });

  if (!rows[0]?.id) throw new Error("Cluster creation returned no ID");
  return rows[0];
}

async function insertAssignment({ signal_id, cluster_id, confidence, is_primary }) {
  await dbPost("signal_cluster_assignments", {
    signal_id,
    cluster_id,
    confidence,
    is_primary,
    assigned_by: "llm",
  });

  // Update last_signal_at on the cluster
  await dbPatch("trend_clusters", `id=eq.${cluster_id}`, {
    last_signal_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

async function markSignalsClustered(signalIds) {
  if (signalIds.length === 0) return;

  // Batch update — Supabase REST accepts comma-separated IDs
  const idFilter = signalIds.map(id => `"${id}"`).join(",");
  await dbPatch("signals", `id=in.(${idFilter})`, {
    is_clustered: true,
    updated_at: new Date().toISOString(),
  });
}

async function updateClusterSignalCounts() {
  // Use a raw SQL approach via RPC would be ideal, but we can do it with
  // a targeted approach: get assignment counts and update clusters.
  // This is simpler and works within the REST API constraints.

  const activeClusters = await dbGet(
    "trend_clusters",
    "select=id&is_active=eq.true"
  );

  for (const cluster of activeClusters) {
    try {
      const assignments = await dbGet(
        "signal_cluster_assignments",
        `select=id&cluster_id=eq.${cluster.id}`
      );
      await dbPatch("trend_clusters", `id=eq.${cluster.id}`, {
        signal_count: assignments.length,
        updated_at: new Date().toISOString(),
      });
    } catch {
      // Non-critical — continue with next cluster
    }
  }
}

// ---------------------------------------------------------------------------
// Cluster maintenance (called by velocity-calculator daily)
// ---------------------------------------------------------------------------

/**
 * Run daily cluster maintenance:
 * - Deactivate dormant clusters (no signals in 30 days)
 * - Detect and propose merges (>60% signal overlap)
 * - Refresh names for clusters with many new signals
 *
 * @returns {Promise<{deactivated: number, merged: number, renamed: number}>}
 */
export async function runClusterMaintenance() {
  const result = { deactivated: 0, merged: 0, renamed: 0, errors: [] };

  // 1. Deactivate dormant clusters (30 days no signals)
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const dormant = await dbGet(
      "trend_clusters",
      `select=id&is_active=eq.true&lifecycle=eq.dormant&last_signal_at=lt.${thirtyDaysAgo}`
    );

    for (const cluster of dormant) {
      await dbPatch("trend_clusters", `id=eq.${cluster.id}`, {
        is_active: false,
        updated_at: new Date().toISOString(),
      });
      result.deactivated++;
    }
  } catch (err) {
    result.errors.push(`Deactivation failed: ${err.message}`);
  }

  // 2. Merge detection — clusters with >60% signal overlap
  // This is expensive, so only check pairs of clusters in the same category
  try {
    const merged = await detectAndMergeClusters();
    result.merged = merged;
  } catch (err) {
    result.errors.push(`Merge detection failed: ${err.message}`);
  }

  // 3. Name refinement for clusters with many new signals
  // (Skip in v1 — will be added when we have signal_count_at_last_rename tracking)

  await logAutomation("cluster-maintenance-complete", {
    ...result,
    department: "intelligence",
  }, null);

  return result;
}

async function detectAndMergeClusters() {
  let mergeCount = 0;

  // Get active clusters grouped by category
  const clusters = await dbGet(
    "trend_clusters",
    "select=id,name,category,signal_count&is_active=eq.true&order=signal_count.desc"
  );

  // Group by category
  const byCategory = {};
  for (const c of clusters) {
    const cat = c.category || "general";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(c);
  }

  // Check pairs within each category (only check larger cluster absorbing smaller)
  for (const [, categoryClusters] of Object.entries(byCategory)) {
    if (categoryClusters.length < 2) continue;

    for (let i = 0; i < categoryClusters.length; i++) {
      for (let j = i + 1; j < categoryClusters.length; j++) {
        const larger = categoryClusters[i];
        const smaller = categoryClusters[j];

        // Skip if either is too small to measure overlap
        if (smaller.signal_count < 3) continue;

        try {
          const overlap = await calculateSignalOverlap(larger.id, smaller.id);
          if (overlap > 0.6) {
            // Merge smaller into larger
            await mergeClusters(larger.id, smaller.id);
            mergeCount++;
          }
        } catch {
          // Skip this pair on error
        }
      }
    }
  }

  return mergeCount;
}

async function calculateSignalOverlap(clusterA, clusterB) {
  // Get signal IDs for both clusters
  const [signalsA, signalsB] = await Promise.all([
    dbGet("signal_cluster_assignments", `select=signal_id&cluster_id=eq.${clusterA}`),
    dbGet("signal_cluster_assignments", `select=signal_id&cluster_id=eq.${clusterB}`),
  ]);

  if (signalsA.length === 0 || signalsB.length === 0) return 0;

  const setA = new Set(signalsA.map(s => s.signal_id));
  const setB = new Set(signalsB.map(s => s.signal_id));

  let overlapCount = 0;
  for (const id of setB) {
    if (setA.has(id)) overlapCount++;
  }

  // Overlap relative to the smaller cluster
  return overlapCount / Math.min(setA.size, setB.size);
}

async function mergeClusters(keepId, mergeId) {
  // Reassign all signals from mergeId to keepId
  const assignments = await dbGet(
    "signal_cluster_assignments",
    `select=id,signal_id&cluster_id=eq.${mergeId}`
  );

  for (const assignment of assignments) {
    try {
      // Try to insert into keep cluster (may already exist → unique constraint)
      await dbPost("signal_cluster_assignments", {
        signal_id: assignment.signal_id,
        cluster_id: keepId,
        confidence: 0.7,
        is_primary: false,
        assigned_by: "merge",
      });
    } catch {
      // Already assigned to this cluster — fine
    }
  }

  // Mark merged cluster
  await dbPatch("trend_clusters", `id=eq.${mergeId}`, {
    is_active: false,
    merged_into_id: keepId,
    updated_at: new Date().toISOString(),
  });

  await logAutomation("cluster-merged", {
    keep_cluster_id: keepId,
    merged_cluster_id: mergeId,
    reassigned_signals: assignments.length,
    department: "intelligence",
  }, null);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
