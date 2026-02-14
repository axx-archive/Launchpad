import Nav from "@/components/Nav";
import { ProjectDetailSkeleton } from "@/components/LoadingSkeleton";

export default function Loading() {
  return (
    <>
      <Nav sectionLabel="strategy &mdash; research" />
      <main className="min-h-screen pt-24 px-[clamp(24px,5vw,64px)] pb-16">
        <div className="max-w-[1120px] mx-auto">
          <div className="mb-8">
            <div className="h-4 w-32 rounded skeleton-shimmer mb-6" />
            <div className="h-10 w-80 rounded skeleton-shimmer mb-3" />
            <div className="h-5 w-48 rounded skeleton-shimmer" />
          </div>
          <ProjectDetailSkeleton />
        </div>
      </main>
    </>
  );
}
