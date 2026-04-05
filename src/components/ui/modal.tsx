'use client';

import { ReactNode, useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, children, className }: ModalProps) {
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setVisible(true);
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimating(true));
      });
      // Scroll to top when opening
      setTimeout(() => scrollRef.current?.scrollTo(0, 0), 10);
      return () => { document.body.style.overflow = ''; };
    } else {
      setAnimating(false);
      const timer = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop — click to close */}
      <div
        className={cn(
          'fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-200 ease-out',
          animating ? 'opacity-100' : 'opacity-0'
        )}
        onClick={onClose}
      />

      {/* Scroll container */}
      <div ref={scrollRef} className="fixed inset-0 overflow-y-auto pointer-events-none">
        <div className="flex h-full items-center justify-center p-4">
          {/* Content — re-enable pointer events */}
          <div
            onClick={e => e.stopPropagation()}
            className={cn(
              'relative glass-card border border-white/[0.06] rounded-2xl p-6 sm:p-7 max-w-md w-full pointer-events-auto',
              'shadow-[0_24px_80px_rgba(0,0,0,0.6)]',
              'transition-all duration-200 ease-out',
              animating
                ? 'opacity-100 scale-100 translate-y-0'
                : 'opacity-0 scale-[0.97] translate-y-2',
              className
            )}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-[#444] hover:text-white transition-colors duration-200 w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/[0.06]"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', loading }: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="pr-4">
        <h3 className="heading text-sm mb-3 text-white">{title}</h3>
        <p className="text-[#888] text-[13px] leading-relaxed mb-7">{message}</p>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="danger" size="sm" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
