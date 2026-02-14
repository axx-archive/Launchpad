import Nav from "@/components/Nav";
import { DashboardSkeleton } from "@/components/LoadingSkeleton";

export default function Loading() {
  return (
    <>
      <Nav sectionLabel="mission control" />
      <main className="min-h-screen pt-24 px-[clamp(24px,5vw,64px)] pb-16">
        <div className="max-w-[1120px] mx-auto">
          <div className="mb-12">
            <p className="font-mono text-[11px] font-normal tracking-[4px] lowercase text-accent mb-7">
              dashboard
            </p>
            <div className="h-10 w-64 rounded skeleton-shimmer mb-3" />
            <div className="h-4 w-40 rounded skeleton-shimmer" />
          </div>
          <DashboardSkeleton />
        </div>
      </main>
    </>
  );
}
