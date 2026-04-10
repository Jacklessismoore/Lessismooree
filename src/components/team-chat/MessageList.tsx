'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { TeamMessage, UserProfile } from '@/lib/team-chat-db';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: TeamMessage[];
  profiles: Map<string, UserProfile>;
  currentUserId: string;
  onEdit: (message: TeamMessage) => void;
  onDelete: (messageId: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  loadingMore: boolean;
}

function formatDateDivider(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (msgDay.getTime() === today.getTime()) return 'Today';
  if (msgDay.getTime() === yesterday.getTime()) return 'Yesterday';

  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function groupByDate(messages: TeamMessage[]): { date: string; messages: TeamMessage[] }[] {
  const groups: { date: string; messages: TeamMessage[] }[] = [];
  let currentDate = '';

  for (const msg of messages) {
    const d = new Date(msg.created_at);
    const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (dateKey !== currentDate) {
      currentDate = dateKey;
      groups.push({ date: msg.created_at, messages: [msg] });
    } else {
      groups[groups.length - 1].messages.push(msg);
    }
  }

  return groups;
}

export function MessageList({
  messages,
  profiles,
  currentUserId,
  onEdit,
  onDelete,
  onLoadMore,
  hasMore,
  loadingMore,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const prevMessageCount = useRef(messages.length);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Detect if user has scrolled up
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 120;
    shouldAutoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  };

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > prevMessageCount.current && shouldAutoScroll.current) {
      scrollToBottom();
    }
    prevMessageCount.current = messages.length;
  }, [messages.length, scrollToBottom]);

  // Scroll to bottom on first load
  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, []);

  const groups = groupByDate(messages);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10"
    >
      {hasMore && (
        <div className="flex justify-center py-3">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="text-[10px] text-[#555] hover:text-[#888] transition-colors chip-press px-3 py-1.5 rounded-lg border border-white/[0.05]"
          >
            {loadingMore ? 'Loading...' : 'Load earlier messages'}
          </button>
        </div>
      )}

      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-[#444] text-[11px]">
          <p>No messages yet</p>
          <p className="text-[10px] mt-1">Be the first to say something.</p>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.date}>
          <div className="flex items-center gap-3 px-4 py-2 my-1">
            <div className="flex-1 h-px bg-white/[0.04]" />
            <span className="text-[9px] uppercase tracking-wider text-[#444] font-medium flex-shrink-0">
              {formatDateDivider(group.date)}
            </span>
            <div className="flex-1 h-px bg-white/[0.04]" />
          </div>

          {group.messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              profile={profiles.get(msg.user_id) ?? msg.profile}
              isOwn={msg.user_id === currentUserId}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      ))}

      <div ref={bottomRef} />
    </div>
  );
}
