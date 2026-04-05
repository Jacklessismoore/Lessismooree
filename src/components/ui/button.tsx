'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    const base = [
      'inline-flex items-center justify-center font-semibold uppercase tracking-wider',
      'rounded-xl',
      'transition-all duration-300 ease-out',
      'active:scale-[0.97] active:duration-100',
      'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
    ].join(' ');

    const variants = {
      primary: [
        'bg-white text-black',
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
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <div className="w-3.5 h-3.5 border-2 border-current/20 border-t-current rounded-full animate-spin mr-2" />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export { Button };
