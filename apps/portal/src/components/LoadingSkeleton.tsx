export function CardSkeleton() {
  return (
    <div className="flex flex-col bg-bg-card border border-border rounded-md overflow-hidden">
      <div className="h-40 skeleton-shimmer" />
      <div className="p-6 flex flex-col gap-3">
        <div className="h-6 w-3/4 rounded skeleton-shimmer" />
        <div className="h-4 w-1/2 rounded skeleton-shimmer" />
        <div className="flex items-center gap-4 pt-4 border-t border-border mt-4">
          <div className="h-5 w-24 rounded skeleton-shimmer" />
          <div className="h-3 w-16 rounded skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 page-enter">
      {Array.from({ length: 3 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ProjectDetailSkeleton() {
  return (
    <div className="flex flex-col lg:flex-row gap-6 page-enter">
      <div className="flex-1 h-[70vh] rounded-lg skeleton-shimmer" />
      <div className="w-full lg:w-[380px] flex flex-col gap-4">
        <div className="h-10 w-48 rounded skeleton-shimmer" />
        <div className="h-6 w-32 rounded skeleton-shimmer" />
        <div className="flex-1 rounded-lg skeleton-shimmer min-h-[300px]" />
      </div>
    </div>
  );
}
