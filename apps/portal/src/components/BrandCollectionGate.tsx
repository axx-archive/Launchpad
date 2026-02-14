"use client";

import { useState } from "react";
import TerminalChrome from "@/components/TerminalChrome";
import BrandAssetsPanel from "@/components/BrandAssetsPanel";
import { toast } from "@/components/Toast";

interface BrandCollectionGateProps {
  projectId: string;
}

export default function BrandCollectionGate({
  projectId,
}: BrandCollectionGateProps) {
  const [loading, setLoading] = useState(false);

  async function handleStartBuild(skipAssets: boolean) {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/start-build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipAssets }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "something went wrong");
      }

      toast(
        skipAssets ? "build started (without assets)" : "build started",
        "success"
      );
      window.location.reload();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "something went wrong",
        "error"
      );
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <TerminalChrome title="brand assets">
        <p className="text-text-muted text-[12px] mb-1">
          your story is locked in. now arm it with your look.
        </p>
        <p className="text-text-muted/70 text-[11px] mb-5">
          upload logos, imagery, and brand guides — or skip and build without them.
        </p>

        <BrandAssetsPanel projectId={projectId} />

        <div className="space-y-2 mt-6">
          <button
            onClick={() => handleStartBuild(false)}
            disabled={loading}
            className="w-full text-left px-4 py-3 rounded-[3px] text-[12px] tracking-[0.5px] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed btn-primary"
          >
            {loading ? "starting build..." : "$ start the build — assets included"}
          </button>

          <button
            onClick={() => handleStartBuild(true)}
            disabled={loading}
            className="w-full text-left px-4 py-3 rounded-[3px] border border-white/8 text-text-muted text-[12px] tracking-[0.5px] hover:border-white/15 hover:text-text transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "starting build..." : "$ skip for now — build without assets"}
          </button>
        </div>
      </TerminalChrome>
    </div>
  );
}
