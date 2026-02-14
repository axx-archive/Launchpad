import Nav from "@/components/Nav";
import { DashboardSkeleton } from "@/components/LoadingSkeleton";

export default function IntelligenceLoading() {
  return (
    <>
      <Nav sectionLabel="intelligence &mdash; signal radar" />
      <main className="min-h-screen pt-24 px-[clamp(24px,5vw,64px)] pb-16">
        <div className="max-w-[1120px] mx-auto">
          <div className="mb-12">
            <div className="h-8 w-40 rounded skeleton-shimmer mb-7" />
            <div className="h-4 w-56 rounded skeleton-shimmer" />
          </div>
          <DashboardSkeleton />
        </div>
      </main>
    </>
  );
}
