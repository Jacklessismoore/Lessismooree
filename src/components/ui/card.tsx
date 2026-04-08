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

  // Track cursor position relative to the card:
  //   1. Radial spotlight ::before follows --mx / --my
  //   2. Card tilts subtly towards the cursor (max ~3deg)
  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!hoverable || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width; // 0 → 1
    const yRatio = (e.clientY - rect.top) / rect.height;
    const xPct = xRatio * 100;
    const yPct = yRatio * 100;
    // Max tilt 3 degrees, centred
    const tiltY = (xRatio - 0.5) * 6; // horizontal cursor -> rotateY
    const tiltX = (0.5 - yRatio) * 6; // vertical cursor -> rotateX (inverted)
    ref.current.style.setProperty('--mx', `${xPct}%`);
    ref.current.style.setProperty('--my', `${yPct}%`);
    ref.current.style.setProperty('--tilt-x', `${tiltX.toFixed(2)}deg`);
    ref.current.style.setProperty('--tilt-y', `${tiltY.toFixed(2)}deg`);
  };

  const handleMouseLeave = () => {
    if (!hoverable || !ref.current) return;
    ref.current.style.setProperty('--tilt-x', '0deg');
    ref.current.style.setProperty('--tilt-y', '0deg');
  };

  return (
    <div
      ref={ref}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={style}
      className={cn(
        'glass-card rounded-2xl transition-all duration-300 ease-out',
        paddings[padding],
        hoverable && [
          'cursor-pointer card-lift card-sheen spotlight card-tilt conic-border glow-trail',
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
