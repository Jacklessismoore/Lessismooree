'use client';

import { useState, useRef, useCallback, KeyboardEvent, ChangeEvent } from 'react';
import type { UserProfile } from '@/lib/team-chat-db';
import { MentionPopup } from './MentionPopup';

interface MessageInputProps {
  onSend: (content: string) => void;
  profiles: UserProfile[];
  disabled?: boolean;
  /** If set, the input starts in edit mode with this content */
  editContent?: string;
  onCancelEdit?: () => void;
}

export function MessageInput({ onSend, profiles, disabled, editContent, onCancelEdit }: MessageInputProps) {
  const [value, setValue] = useState(editContent ?? '');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = 6 * 20; // ~6 rows
    el.style.height = Math.min(el.scrollHeight, maxH) + 'px';
  }, []);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setValue(v);
    resize();

    // Detect @mention
    const pos = e.target.selectionStart ?? v.length;
    const before = v.slice(0, pos);
    const atIdx = before.lastIndexOf('@');
    if (atIdx >= 0) {
      const afterAt = before.slice(atIdx + 1);
      // Only trigger if no space after @ (simple heuristic)
      if (!afterAt.includes('\n') && afterAt.length < 30) {
        setMentionQuery(afterAt);
        setMentionStart(atIdx);
        return;
      }
    }
    setMentionQuery(null);
  };

  const handleMentionSelect = (profile: UserProfile) => {
    const before = value.slice(0, mentionStart);
    const afterPos = mentionStart + 1 + (mentionQuery?.length ?? 0);
    const after = value.slice(afterPos);
    const mention = `@[${profile.display_name}](${profile.user_id})`;
    const newVal = before + mention + ' ' + after;
    setValue(newVal);
    setMentionQuery(null);
    setTimeout(() => {
      textareaRef.current?.focus();
      resize();
    }, 0);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // If mention popup is open, don't handle Enter/arrows here
    if (mentionQuery !== null) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape' && onCancelEdit) {
      e.preventDefault();
      onCancelEdit();
    }
  };

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    if (!editContent) {
      setValue('');
      setTimeout(resize, 0);
    }
  };

  return (
    <div className="relative">
      {mentionQuery !== null && (
        <MentionPopup
          query={mentionQuery}
          profiles={profiles}
          onSelect={handleMentionSelect}
          onDismiss={() => setMentionQuery(null)}
        />
      )}

      {editContent && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-amber-400/[0.08] border border-amber-400/20 rounded-t-xl text-[10px] text-amber-400">
          <span>Editing message</span>
          <button onClick={onCancelEdit} className="hover:text-white transition-colors">Cancel</button>
        </div>
      )}

      <div className={`flex items-end gap-2 bg-white/[0.03] border border-white/[0.06] px-3 py-2 ${editContent ? 'rounded-b-xl' : 'rounded-xl'}`}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent text-[11px] text-white placeholder:text-[#444] resize-none outline-none
            scrollbar-thin scrollbar-thumb-white/10 leading-[20px]"
          style={{ minHeight: 20, maxHeight: 120 }}
        />
        <button
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="flex-shrink-0 w-7 h-7 rounded-lg bg-amber-400 text-black flex items-center justify-center
            hover:bg-amber-300 disabled:opacity-30 disabled:hover:bg-amber-400 transition-all chip-press"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
