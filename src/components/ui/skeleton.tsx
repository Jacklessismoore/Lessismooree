import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
}

// A single shimmering placeholder block — uses the .skeleton class from
// globals.css. Compose these to approximate the final layout of the
// thing that's loading.
export function Skeleton({ className, width, height }: SkeletonProps) {
  return (
    <div
      className={cn('skeleton', className)}
      style={{
        width: width ?? '100%',
        height: height ?? '1rem',
      }}
    />
  );
}

// Pre-composed skeleton for a report card — title, a few lines, a table.
export function ReportSkeleton() {
  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <Skeleton width="40%" height="1.25rem" />
      <div className="space-y-2 pt-2">
        <Skeleton height="0.75rem" />
        <Skeleton width="90%" height="0.75rem" />
        <Skeleton width="78%" height="0.75rem" />
      </div>
      <div className="pt-4 space-y-1.5">
        <Skeleton height="2rem" />
        <Skeleton height="2rem" />
        <Skeleton height="2rem" />
        <Skeleton height="2rem" />
      </div>
    </div>
  );
}

// Row-list skeleton for flow selectors etc.
export function RowListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height="3rem" />
      ))}
    </div>
  );
}
