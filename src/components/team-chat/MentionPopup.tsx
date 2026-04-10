'use client';

import { useEffect, useRef, useState } from 'react';
import type { UserProfile } from '@/lib/team-chat-db';
import { Avatar } from './Avatar';

interface MentionPopupProps {
  query: string;
  profiles: UserProfile[];
  onSelect: (profile: UserProfile) => void;
  onDismiss: () => void;
}

export function MentionPopup({ query, profiles, onSelect, onDismiss }: MentionPopupProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = profiles.filter((p) =>
    p.display_name.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 5);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[activeIndex]) onSelect(filtered[activeIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [filtered, activeIndex, onSelect, onDismiss]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 mb-1 w-64 max-h-[200px] overflow-y-auto
        bg-[#1a1a1a] border border-white/[0.08] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)]
        py-1 z-50 animate-fade"
    >
      {filtered.map((p, i) => (
        <button
          key={p.id}
          type="button"
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors
            ${i === activeIndex ? 'bg-white/[0.06] text-white' : 'text-[#888] hover:bg-white/[0.03] hover:text-white'}`}
          onMouseEnter={() => setActiveIndex(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(p);
          }}
        >
          <Avatar profile={p} size={24} />
          <span className="text-[11px] font-medium truncate">{p.display_name}</span>
        </button>
      ))}
    </div>
  );
}
