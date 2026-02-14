import Nav from "@/components/Nav";
import { ProjectDetailSkeleton } from "@/components/LoadingSkeleton";

export default function TrendDetailLoading() {
  return (
    <>
      <Nav sectionLabel="intelligence &mdash; trend" />
      <main className="min-h-screen pt-24 px-[clamp(24px,5vw,64px)] pb-16">
        <div className="max-w-[1120px] mx-auto">
          <div className="h-4 w-24 rounded skeleton-shimmer mb-6" />
          <div className="mb-8">
            <div className="h-6 w-20 rounded skeleton-shimmer mb-3" />
            <div className="h-9 w-72 rounded skeleton-shimmer mb-2" />
            <div className="h-4 w-96 rounded skeleton-shimmer" />
          </div>
          <ProjectDetailSkeleton />
        </div>
      </main>
    </>
  );
}
