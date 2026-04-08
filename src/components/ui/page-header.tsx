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
    <div className={cn('flex items-start justify-between mb-10 animate-section', className)}>
      <div>
        <h1 className="heading text-2xl text-gradient">{title}</h1>
        {subtitle && (
          <p
            className="text-[#555] text-sm mt-1.5 animate-fade"
            style={{ animationDelay: '120ms' }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div
          className="flex items-center gap-2 animate-fade"
          style={{ animationDelay: '180ms' }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
