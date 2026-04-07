import { ReactNode, CSSProperties } from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  children: ReactNode;
  className?: string;
  hoverable?: boolean;
  padding?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  style?: CSSProperties;
}

export function Card({ children, className, hoverable, padding = 'md', onClick, style }: CardProps) {
  const paddings = { sm: 'p-4', md: 'p-5', lg: 'p-6' };

  return (
    <div
      onClick={onClick}
      style={style}
      className={cn(
        'glass-card rounded-2xl transition-all duration-300 ease-out',
        paddings[padding],
        hoverable && [
          'cursor-pointer card-lift card-sheen',
          'hover:border-white/10 hover:bg-white/[0.04]',
          'active:scale-[0.99] active:duration-100',
        ].join(' '),
        className
      )}
    >
      {children}
    </div>
  );
}
