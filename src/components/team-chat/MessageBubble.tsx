'use client';

import { useState, useRef, useEffect } from 'react';
import type { TeamMessage, UserProfile } from '@/lib/team-chat-db';
import { Avatar } from './Avatar';

interface MessageBubbleProps {
  message: TeamMessage;
  profile?: UserProfile | null;
  isOwn: boolean;
  onEdit: (message: TeamMessage) => void;
  onDelete: (messageId: string) => void;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;

  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function renderContent(content: string): React.ReactNode[] {
  // Parse @[Name](id) mentions
  const parts: React.ReactNode[] = [];
  const regex = /@\[([^\]]+)\]\([^)]+\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={match.index} className="text-amber-300 font-medium">
        @{match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts;
}

export function MessageBubble({ message, profile, isOwn, onEdit, onDelete }: MessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  return (
    <div className="group flex items-start gap-2.5 px-4 py-1 hover:bg-white/[0.015] transition-colors relative">
      <Avatar profile={profile} size={32} className="mt-0.5" />

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold text-white truncate">
            {profile?.display_name || message.user_id.slice(0, 8)}
          </span>
          <span className="text-[9px] text-[#555] flex-shrink-0">
            {formatRelativeTime(message.created_at)}
          </span>
        </div>

        <div className="text-[11px] text-[#ccc] leading-relaxed whitespace-pre-wrap break-words">
          {renderContent(message.content)}
          {message.edited_at && (
            <span className="text-[9px] text-[#444] ml-1.5">(edited)</span>
          )}
        </div>
      </div>

      {isOwn && (
        <div className="absolute top-1 right-3 opacity-0 group-hover:opacity-100 transition-opacity" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="w-6 h-6 flex items-center justify-center rounded-md text-[#555] hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="3" cy="8" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="13" cy="8" r="1.5" />
            </svg>
          </button>

          {showMenu && (
            <div className="absolute top-full right-0 mt-1 w-28 bg-[#1a1a1a] border border-white/[0.08] rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.5)] py-1 z-50">
              <button
                onClick={() => { setShowMenu(false); onEdit(message); }}
                className="w-full text-left px-3 py-1.5 text-[10px] text-[#888] hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => { setShowMenu(false); onDelete(message.id); }}
                className="w-full text-left px-3 py-1.5 text-[10px] text-red-400 hover:text-red-300 hover:bg-white/[0.06] transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
