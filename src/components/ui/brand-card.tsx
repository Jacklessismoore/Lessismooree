'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Brand } from '@/lib/types';
import { Card } from './card';
import { Button } from './button';

interface BrandCardProps {
  brand: Brand;
  onClick?: () => void;
  showEdit?: boolean;
  showMenu?: boolean;
  onDelete?: () => void;
  animDelay?: number;
  subtitle?: string;
}

export function BrandCard({ brand, onClick, showEdit = true, showMenu = false, onDelete, animDelay = 0, subtitle }: BrandCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <Card
      hoverable
      padding="sm"
      onClick={onClick}
      className="group animate-fade-in"
      style={{ animationDelay: `${animDelay}ms` } as React.CSSProperties}
    >
      <div className="relative">
        {/* 3-dot menu — top right */}
        {showMenu && onDelete && (
          <div className="absolute top-0 right-0" ref={menuRef}>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
              className="w-6 h-6 flex items-center justify-center rounded-md text-[#333] hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="2" r="1" fill="currentColor"/>
                <circle cx="6" cy="6" r="1" fill="currentColor"/>
                <circle cx="6" cy="10" r="1" fill="currentColor"/>
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-32 rounded-lg p-1 shadow-2xl border border-white/10 animate-fade z-50" style={{ background: '#1a1a1a' }}>
                <button
                  onClick={e => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                  className="w-full text-left px-3 py-2 rounded-md text-[10px] text-red-400 hover:bg-red-500/10 transition-colors uppercase tracking-wider font-medium"
                >
                  Remove Client
                </button>
              </div>
            )}
          </div>
        )}

        {/* Centered content */}
        <div className="flex flex-col items-center text-center pt-1">
          <p className="text-[11px] font-semibold text-white uppercase tracking-wider leading-tight">
            {brand.name}
          </p>
          <p className="text-[9px] text-[#555] mt-1">
            {subtitle || brand.category || 'No category'}
          </p>

          {/* Edit button */}
          {showEdit && (
            <Link href={`/clients/${brand.id}`} onClick={e => e.stopPropagation()} className="w-full mt-2">
              <Button size="sm" className="text-[9px] py-1 px-3 min-h-0 w-full">
                Edit
              </Button>
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
