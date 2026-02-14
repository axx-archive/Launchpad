"use client";

import { useState, useEffect } from "react";
import TerminalChrome from "@/components/TerminalChrome";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Stage = "knockouts" | "rubric" | "comparison" | "submitted";

interface KnockoutQuestion {
  key: string;
  question: string;
}

const KNOCKOUT_QUESTIONS: KnockoutQuestion[] = [
  { key: "culturally_relevant", question: "is this culturally relevant to our client base?" },
  { key: "brand_alignment", question: "does this have brand alignment potential?" },
  { key: "commercial_application", question: "is there a commercial application?" },
  { key: "timing_viable", question: "is the timing window still viable?" },
];

interface ScoringDimension {
  key: string;
  label: string;
  description: string;
}

const SCORING_DIMENSIONS: ScoringDimension[] = [
  { key: "relevance", label: "cultural relevance", description: "how relevant is this trend to our audience?" },
  { key: "audience_fit", label: "brand fit", description: "does this align with client brand identities?" },
  { key: "content_potential", label: "commercial potential", description: "can this be monetized or converted to a deliverable?" },
  { key: "timing", label: "timing", description: "is the window of opportunity still open?" },
  { key: "momentum", label: "signal strength", description: "how strong and consistent is the underlying signal?" },
];

interface ScoreHistoryItem {
  id: string;
  cluster_id: string;
  knockouts: Record<string, boolean>;
  dimensions: Record<string, number>;
  final_score: number | null;
  notes: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ScoringFlowProps {
  clusterId: string;
  clusterName: string;
  /** AI-derived velocity percentile for comparison */
  aiConfidence: number;
  onClose: () => void;
  onComplete: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScoringFlow({
  clusterId,
  clusterName,
  aiConfidence,
  onClose,
  onComplete,
}: ScoringFlowProps) {
  const [stage, setStage] = useState<Stage>("knockouts");

  // Knockout state
  const [knockouts, setKnockouts] = useState<Record<string, boolean | null>>({});
  const [knockoutOverride, setKnockoutOverride] = useState(false);

  // Rubric state
  const [scores, setScores] = useState<Record<string, number>>({});
  const [dimensionNotes, setDimensionNotes] = useState<Record<string, string>>({});

  // Comparison state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [existingScore, setExistingScore] = useState<ScoreHistoryItem | null>(null);

  // Fetch existing score on mount
  useEffect(() => {
    async function fetchExisting() {
      try {
        const res = await fetch(`/api/intelligence/trends/${clusterId}/score`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.latest) {
          setExistingScore(data.latest as ScoreHistoryItem);
        }
      } catch {
        // Non-critical
      }
    }
    fetchExisting();
  }, [clusterId]);

  // Computed values
  const allKnockoutsAnswered = KNOCKOUT_QUESTIONS.every((q) => knockouts[q.key] !== undefined && knockouts[q.key] !== null);
  const hasKnockoutFailure = KNOCKOUT_QUESTIONS.some((q) => knockouts[q.key] === false);
  const canProceedKnockout = allKnockoutsAnswered && (!hasKnockoutFailure || knockoutOverride);

  const allDimensionsScored = SCORING_DIMENSIONS.every((d) => scores[d.key] !== undefined && scores[d.key] > 0);
  const totalScore = Object.values(scores).reduce((sum, s) => sum + s, 0);
  const maxScore = SCORING_DIMENSIONS.length * 5;
  const normalizedScore = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError("");

    const knockoutPayload: Record<string, boolean> = {};
    for (const q of KNOCKOUT_QUESTIONS) {
      if (knockouts[q.key] !== null && knockouts[q.key] !== undefined) {
        knockoutPayload[q.key] = knockouts[q.key] as boolean;
      }
    }

    const notesArr: string[] = [];
    for (const d of SCORING_DIMENSIONS) {
      if (dimensionNotes[d.key]?.trim()) {
        notesArr.push(`${d.label}: ${dimensionNotes[d.key].trim()}`);
      }
    }

    try {
      const res = await fetch(`/api/intelligence/trends/${clusterId}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          knockouts: knockoutPayload,
          dimensions: scores,
          final_score: normalizedScore,
          notes: notesArr.length > 0 ? notesArr.join("; ") : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.error ?? "failed to submit score.");
        setSubmitting(false);
        return;
      }

      setStage("submitted");
      onComplete();
    } catch {
      setSubmitError("network error. check your connection.");
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={submitting ? undefined : onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-[540px] max-h-[85vh] overflow-y-auto">
        <TerminalChrome title={`score trend — ${stage}`}>
          <div className="px-2 py-2">
            {/* Progress indicator */}
            <div className="flex items-center gap-2 mb-5">
              {(["knockouts", "rubric", "comparison"] as const).map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  {i > 0 && <span className="text-text-muted/20">&rarr;</span>}
                  <span className={`font-mono text-[10px] tracking-[1px] px-2 py-0.5 rounded-[2px] ${
                    stage === s
                      ? "text-[#4D8EFF] bg-[#4D8EFF]/10 border border-[#4D8EFF]/20"
                      : stage === "submitted" || (["rubric", "comparison"].indexOf(stage) > ["rubric", "comparison"].indexOf(s))
                      ? "text-success/60 bg-success/8 border border-success/12"
                      : "text-text-muted/40 border border-white/[0.06]"
                  }`}>
                    {i + 1}. {s}
                  </span>
                </div>
              ))}
            </div>

            {/* Trend name */}
            <p className="font-mono text-[10px] text-text-muted/50 mb-1">scoring:</p>
            <p className="text-[14px] text-text mb-5 truncate">{clusterName}</p>

            {/* ---- Stage 1: Knockouts ---- */}
            {stage === "knockouts" && (
              <div className="space-y-4">
                <p className="font-mono text-[10px] tracking-[2px] uppercase text-[#4D8EFF]/60 mb-3">
                  knockout questions
                </p>

                {KNOCKOUT_QUESTIONS.map((q) => {
                  const answer = knockouts[q.key];
                  return (
                    <div key={q.key} className="space-y-1.5">
                      <p className="text-[12px] text-text-muted">{q.question}</p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setKnockouts((prev) => ({ ...prev, [q.key]: true }))}
                          className={`font-mono text-[11px] px-3 py-1 rounded-[3px] border transition-all cursor-pointer ${
                            answer === true
                              ? "text-success border-success/30 bg-success/10"
                              : "text-text-muted/60 border-white/[0.08] hover:border-white/[0.15]"
                          }`}
                        >
                          yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setKnockouts((prev) => ({ ...prev, [q.key]: false }))}
                          className={`font-mono text-[11px] px-3 py-1 rounded-[3px] border transition-all cursor-pointer ${
                            answer === false
                              ? "text-[#ef4444] border-[#ef4444]/30 bg-[#ef4444]/10"
                              : "text-text-muted/60 border-white/[0.08] hover:border-white/[0.15]"
                          }`}
                        >
                          no
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Knockout failure */}
                {allKnockoutsAnswered && hasKnockoutFailure && !knockoutOverride && (
                  <div className="border border-[#ef4444]/15 rounded-[3px] px-3 py-2.5 space-y-2 mt-3">
                    <p className="font-mono text-[11px] text-[#ef4444]/80">
                      trend filtered out — one or more knockout answers are negative.
                    </p>
                    <button
                      type="button"
                      onClick={() => setKnockoutOverride(true)}
                      className="font-mono text-[10px] text-text-muted/50 hover:text-text-muted transition-colors cursor-pointer"
                    >
                      override and continue anyway &rarr;
                    </button>
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={onClose}
                    className="font-mono text-[12px] text-text-muted/70 hover:text-text-muted transition-colors cursor-pointer"
                  >
                    cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setStage("rubric")}
                    disabled={!canProceedKnockout}
                    className="font-mono text-[12px] text-[#4D8EFF] border border-[#4D8EFF]/20 px-4 py-2 rounded-[3px] hover:border-[#4D8EFF]/50 hover:bg-[#4D8EFF]/5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-default"
                  >
                    next: rubric scoring &rarr;
                  </button>
                </div>
              </div>
            )}

            {/* ---- Stage 2: Rubric Scoring ---- */}
            {stage === "rubric" && (
              <div className="space-y-5">
                <p className="font-mono text-[10px] tracking-[2px] uppercase text-[#4D8EFF]/60 mb-3">
                  dimension scoring (1-5)
                </p>

                {SCORING_DIMENSIONS.map((dim) => {
                  const score = scores[dim.key] ?? 0;
                  return (
                    <div key={dim.key} className="space-y-1.5">
                      <div className="flex items-baseline justify-between">
                        <p className="text-[12px] text-text">{dim.label}</p>
                        <span className="font-mono text-[10px] text-text-muted/40">{dim.description}</span>
                      </div>
                      {/* Dot selector */}
                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 4, 5].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setScores((prev) => ({ ...prev, [dim.key]: val }))}
                            className={`w-7 h-7 rounded-full border transition-all cursor-pointer flex items-center justify-center font-mono text-[11px] ${
                              score >= val
                                ? "border-[#4D8EFF]/40 bg-[#4D8EFF]/20 text-[#4D8EFF]"
                                : "border-white/[0.08] text-text-muted/30 hover:border-white/[0.15]"
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                        <span className="font-mono text-[10px] text-text-muted/30 ml-2">
                          {score > 0 ? `${score}/5` : "—"}
                        </span>
                      </div>
                      {/* Optional note */}
                      <input
                        type="text"
                        value={dimensionNotes[dim.key] ?? ""}
                        onChange={(e) => setDimensionNotes((prev) => ({ ...prev, [dim.key]: e.target.value }))}
                        placeholder="optional note..."
                        className="w-full bg-transparent border-0 border-b border-white/[0.04] font-mono text-[10px] text-text-muted/60 py-1 outline-none focus:border-[#4D8EFF]/20 placeholder:text-text-muted/20 transition-colors"
                      />
                    </div>
                  );
                })}

                {/* Running total */}
                <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                  <span className="font-mono text-[11px] text-text-muted/50">
                    total: <span className="text-[#4D8EFF]">{totalScore}</span> / {maxScore}
                  </span>
                  <span className="font-mono text-[11px] text-text-muted/50">
                    normalized: <span className="text-[#4D8EFF]">{normalizedScore.toFixed(0)}</span>%
                  </span>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setStage("knockouts")}
                    className="font-mono text-[12px] text-text-muted/70 hover:text-text-muted transition-colors cursor-pointer"
                  >
                    &larr; back
                  </button>
                  <button
                    type="button"
                    onClick={() => setStage("comparison")}
                    disabled={!allDimensionsScored}
                    className="font-mono text-[12px] text-[#4D8EFF] border border-[#4D8EFF]/20 px-4 py-2 rounded-[3px] hover:border-[#4D8EFF]/50 hover:bg-[#4D8EFF]/5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-default"
                  >
                    next: compare &rarr;
                  </button>
                </div>
              </div>
            )}

            {/* ---- Stage 3: AI Comparison ---- */}
            {stage === "comparison" && (
              <div className="space-y-5">
                <p className="font-mono text-[10px] tracking-[2px] uppercase text-[#4D8EFF]/60 mb-3">
                  human vs ai comparison
                </p>

                {/* Side by side */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="text-center">
                    <p className="font-mono text-[9px] tracking-[2px] uppercase text-text-muted/50 mb-2">your score</p>
                    <p className="font-mono text-[28px] text-[#4D8EFF]">{normalizedScore.toFixed(0)}</p>
                    <p className="font-mono text-[10px] text-text-muted/40">/ 100</p>
                  </div>
                  <div className="text-center">
                    <p className="font-mono text-[9px] tracking-[2px] uppercase text-text-muted/50 mb-2">ai confidence</p>
                    <p className="font-mono text-[28px] text-text-muted/70">{Math.round(aiConfidence)}</p>
                    <p className="font-mono text-[10px] text-text-muted/40">/ 100 (velocity pctl)</p>
                  </div>
                </div>

                {/* Delta indicator */}
                {(() => {
                  const delta = Math.abs(normalizedScore - aiConfidence);
                  const isDisagreement = delta > 15;
                  return (
                    <div className={`px-3 py-2 rounded-[3px] border ${
                      isDisagreement
                        ? "border-[#ef4444]/15 bg-[#ef4444]/[0.03]"
                        : "border-success/15 bg-success/[0.03]"
                    }`}>
                      <p className={`font-mono text-[11px] ${isDisagreement ? "text-[#ef4444]/70" : "text-success/70"}`}>
                        {isDisagreement
                          ? `significant disagreement — delta: ${delta.toFixed(0)} points`
                          : `scores aligned — delta: ${delta.toFixed(0)} points`}
                      </p>
                    </div>
                  );
                })()}

                {/* Dimension breakdown */}
                <div className="space-y-2">
                  <p className="font-mono text-[10px] text-text-muted/50 tracking-[1px]">dimension breakdown</p>
                  {SCORING_DIMENSIONS.map((dim) => {
                    const humanScore = scores[dim.key] ?? 0;
                    // Approximate AI score from velocity percentile distributed across dimensions
                    const aiDimScore = Math.min(5, Math.max(1, Math.round(aiConfidence / 20)));
                    const dimDelta = Math.abs(humanScore - aiDimScore);

                    return (
                      <div key={dim.key} className="flex items-center gap-3">
                        <span className="font-mono text-[10px] text-text-muted/50 w-[120px] truncate">{dim.label}</span>
                        <div className="flex items-center gap-2 flex-1">
                          <span className="font-mono text-[11px] text-[#4D8EFF] w-4 text-center">{humanScore}</span>
                          <div className="flex-1 h-1 bg-white/[0.04] rounded-full relative">
                            <div
                              className="absolute h-full bg-[#4D8EFF]/40 rounded-full"
                              style={{ width: `${(humanScore / 5) * 100}%` }}
                            />
                          </div>
                          <span className="text-text-muted/20">vs</span>
                          <div className="flex-1 h-1 bg-white/[0.04] rounded-full relative">
                            <div
                              className="absolute h-full bg-text-muted/30 rounded-full"
                              style={{ width: `${(aiDimScore / 5) * 100}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] text-text-muted/50 w-4 text-center">{aiDimScore}</span>
                        </div>
                        {dimDelta > 1 && (
                          <span className="font-mono text-[9px] text-[#ef4444]/60">&#x26A0;</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Previous score reference */}
                {existingScore && (
                  <div className="border border-white/[0.06] rounded-[3px] px-3 py-2">
                    <p className="font-mono text-[10px] text-text-muted/40 mb-1">
                      previous score: <span className="text-text-muted/60">{existingScore.final_score?.toFixed(0) ?? "—"}</span> / 100
                    </p>
                    <p className="font-mono text-[9px] text-text-muted/30">
                      scored {new Date(existingScore.created_at).toLocaleDateString()}
                    </p>
                  </div>
                )}

                {/* Error */}
                {submitError && (
                  <p className="font-mono text-[11px] text-[#ef4444]" role="alert">{submitError}</p>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setStage("rubric")}
                    disabled={submitting}
                    className="font-mono text-[12px] text-text-muted/70 hover:text-text-muted transition-colors cursor-pointer"
                  >
                    &larr; back
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="font-mono text-[12px] text-[#4D8EFF] border border-[#4D8EFF]/20 px-4 py-2 rounded-[3px] hover:border-[#4D8EFF]/50 hover:bg-[#4D8EFF]/5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-default"
                  >
                    {submitting ? "submitting..." : "confirm & save score"}
                  </button>
                </div>
              </div>
            )}

            {/* ---- Submitted ---- */}
            {stage === "submitted" && (
              <div className="text-center py-8 space-y-4">
                <span className="font-mono text-[24px] text-success">&#x2713;</span>
                <p className="text-[14px] text-text">score recorded</p>
                <p className="font-mono text-[11px] text-text-muted/50">
                  final score: {normalizedScore.toFixed(0)} / 100
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="font-mono text-[12px] text-[#4D8EFF] hover:text-[#4D8EFF]/80 transition-colors cursor-pointer"
                >
                  close
                </button>
              </div>
            )}
          </div>
        </TerminalChrome>
      </div>
    </div>
  );
}
