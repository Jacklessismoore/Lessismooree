'use client';

import { ButtonHTMLAttributes, forwardRef, MouseEvent, useRef } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, onClick, ...props }, ref) => {
    const innerRef = useRef<HTMLButtonElement | null>(null);

    const setRefs = (el: HTMLButtonElement | null) => {
      innerRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    };

    // Spawn a ripple at the click location, clean it up after the animation.
    const spawnRipple = (e: MouseEvent<HTMLButtonElement>) => {
      const btn = innerRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ripple = document.createElement('span');
      ripple.className = 'ripple-child';
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 650);
    };

    const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
      if (disabled || loading) return;
      spawnRipple(e);
      onClick?.(e);
    };

    const base = [
      'inline-flex items-center justify-center font-semibold uppercase tracking-wider',
      'rounded-xl btn-polish focus-ring ripple-origin',
      'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:transform-none',
    ].join(' ');

    const variants = {
      primary: [
        'bg-white text-black btn-sheen',
        'hover:bg-gray-100 hover:shadow-[0_0_28px_rgba(255,255,255,0.12)]',
        'shadow-[0_0_16px_rgba(255,255,255,0.06)]',
      ].join(' '),
      secondary: [
        'bg-white/[0.03] border border-white/[0.08] text-[#999]',
        'hover:text-white hover:border-white/20 hover:bg-white/[0.06]',
        'hover:shadow-[0_2px_16px_rgba(255,255,255,0.04)]',
      ].join(' '),
      danger: [
        'bg-red-600/90 text-white',
        'hover:bg-red-500 hover:shadow-[0_0_20px_rgba(239,68,68,0.2)]',
        'shadow-[0_0_12px_rgba(239,68,68,0.1)]',
      ].join(' '),
      ghost: [
        'bg-transparent text-[#666]',
        'hover:text-white hover:bg-white/[0.04]',
      ].join(' '),
    };

    const sizes = {
      sm: 'px-3.5 py-2 text-[10px] min-h-[32px]',
      md: 'px-5 py-2.5 text-xs min-h-[40px]',
      lg: 'px-7 py-3.5 text-xs min-h-[46px]',
    };

    return (
      <button
        ref={setRefs}
        onClick={handleClick}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <div className="relative z-10 w-3.5 h-3.5 border-2 border-current/20 border-t-current rounded-full spinner-smooth mr-2" />
        )}
        <span className="relative z-10 inline-flex items-center">{children}</span>
      </button>
    );
  }
);

Button.displayName = 'Button';
export { Button };
