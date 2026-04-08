'use client';

import { ReactNode, CSSProperties, useRef, MouseEvent } from 'react';
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
  const ref = useRef<HTMLDivElement>(null);

  // Track cursor position relative to the card so the ::before radial
  // spotlight follows it. Only runs on hoverable cards.
  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!hoverable || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    ref.current.style.setProperty('--mx', `${x}%`);
    ref.current.style.setProperty('--my', `${y}%`);
  };

  return (
    <div
      ref={ref}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      style={style}
      className={cn(
        'glass-card rounded-2xl transition-all duration-300 ease-out',
        paddings[padding],
        hoverable && [
          'cursor-pointer card-lift card-sheen spotlight',
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
