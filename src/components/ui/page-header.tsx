import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6 sm:mb-10 animate-section',
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="heading text-xl sm:text-2xl text-gradient">{title}</h1>
        {subtitle && (
          <p
            className="text-[#555] text-[12px] sm:text-sm mt-1.5 animate-fade break-words"
            style={{ animationDelay: '120ms' }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div
          className="flex items-center gap-2 animate-fade flex-wrap sm:flex-nowrap sm:flex-shrink-0"
          style={{ animationDelay: '180ms' }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
