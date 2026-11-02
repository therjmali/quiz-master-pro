import { Skeleton } from '@project/components/ui/skeleton';

/** Dashboard skeleton loader */
export function DashboardSkeleton() {
  return (
    <div className="animate-fade-in space-y-3.5 pb-4" role="status" aria-label="Loading dashboard">
      {/* Header */}
      <div className="flex items-center justify-between pt-2 px-1">
        <div>
          <Skeleton className="h-3 w-14 mb-2" />
          <Skeleton className="h-7 w-40" />
        </div>
        <Skeleton className="w-11 h-11 rounded-2xl" />
      </div>
      {/* Activity card */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-4">
          <Skeleton className="w-[84px] h-[84px] rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="w-24 h-11 rounded-2xl" />
        </div>
      </div>
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="stat-card flex items-center gap-3.5">
            <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-5 w-12" />
              <Skeleton className="h-2 w-16" />
            </div>
          </div>
        ))}
      </div>
      {/* Recent quizzes */}
      <div>
        <div className="flex items-center justify-between px-1 mb-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-12" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3.5 bg-card border border-border rounded-2xl p-3.5">
              <Skeleton className="w-11 h-11 rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-2.5 w-1/2" />
                <Skeleton className="h-1 w-full rounded-full" />
              </div>
              <Skeleton className="w-[52px] h-[52px] rounded-full flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Loading...</span>
    </div>
  );
}

/** Library skeleton loader */
export function LibrarySkeleton() {
  return (
    <div className="animate-fade-in pb-4" role="status" aria-label="Loading library">
      {/* Header */}
      <div className="flex items-center justify-between pt-2 px-1 mb-4">
        <div>
          <Skeleton className="h-2.5 w-12 mb-1.5" />
          <Skeleton className="h-6 w-28" />
        </div>
        <Skeleton className="w-16 h-9 rounded-xl" />
      </div>
      {/* Tab switcher */}
      <Skeleton className="h-11 w-full rounded-2xl mb-4" />
      {/* Search */}
      <Skeleton className="h-12 w-full rounded-2xl mb-3" />
      {/* Cards */}
      <div className="space-y-2.5">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="w-12 h-12 rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <div className="flex gap-2">
                  <Skeleton className="h-3 w-12 rounded" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-1 w-full rounded-full" />
              </div>
              <Skeleton className="w-14 h-8 rounded-xl flex-shrink-0" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading...</span>
    </div>
  );
}

/** Generic content skeleton */
export function ContentSkeleton() {
  return (
    <div className="space-y-4 py-4" role="status" aria-label="Loading content">
      <Skeleton className="h-6 w-32" />
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="glass-card p-5">
            <div className="space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading...</span>
    </div>
  );
}
