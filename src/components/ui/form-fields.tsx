'use client';

import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, forwardRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Label
export function Label({ children, className, ...props }: { children: ReactNode; className?: string } & React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn('label-text block mb-1.5', className)} {...props}>
      {children}
    </label>
  );
}

const inputBase = [
  'w-full bg-white/[0.03] border border-white/[0.06] rounded-xl input-polish',
  'px-4 py-3 text-sm text-white',
  'placeholder:text-[#444]',
].join(' ');

// Input
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string }>(
  ({ className, label, ...props }, ref) => (
    <div>
      {label && <Label>{label}</Label>}
      <input
        ref={ref}
        className={cn(inputBase, className)}
        {...props}
      />
    </div>
  )
);
Input.displayName = 'Input';

// Textarea
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }>(
  ({ className, label, ...props }, ref) => (
    <div>
      {label && <Label>{label}</Label>}
      <textarea
        ref={ref}
        className={cn(inputBase, 'resize-y min-h-[100px]', className)}
        {...props}
      />
    </div>
  )
);
Textarea.displayName = 'Textarea';

// Select
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { label?: string; options: { value: string; label: string }[] }>(
  ({ className, label, options, ...props }, ref) => (
    <div>
      {label && <Label>{label}</Label>}
      <select
        ref={ref}
        className={cn(
          inputBase,
          'appearance-none cursor-pointer',
          'bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M6%208L1%203h10z%22/%3E%3C/svg%3E")] bg-no-repeat bg-[right_14px_center]',
          className
        )}
        {...props}
      >
        <option value="">Select...</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
);
Select.displayName = 'Select';
