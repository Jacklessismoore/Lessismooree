import { EmailStatus } from '@/lib/types';
import { getStatusColor, getStatusLabel } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: EmailStatus;
  size?: 'sm' | 'md';
  className?: string;
}

export function StatusBadge({ status, size = 'md', className }: StatusBadgeProps) {
  const color = getStatusColor(status);
  const label = getStatusLabel(status);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full uppercase tracking-wider font-medium transition-all duration-200',
        size === 'sm' ? 'px-2.5 py-1 text-[9px]' : 'px-3 py-1.5 text-[10px]',
        className
      )}
      style={{
        backgroundColor: `${color}15`,
        color,
        boxShadow: `0 0 12px ${color}08`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
