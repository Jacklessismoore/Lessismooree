'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar } from './Avatar';
import type { TeamChannelMember, UserProfile } from '@/lib/team-chat-db';

interface MembersPanelProps {
  members: TeamChannelMember[];
  profiles: Map<string, UserProfile>;
  channelId: string;
  onClose: () => void;
  onAddMember: (userId: string) => Promise<void>;
  allProfiles: UserProfile[];
}

export function MembersPanel({
  members,
  profiles,
  channelId,
  onClose,
  onAddMember,
  allProfiles,
}: MembersPanelProps) {
  const [addUserId, setAddUserId] = useState('');
  const [loading, setLoading] = useState(false);

  const memberUserIds = new Set(members.map((m) => m.user_id));
  const nonMembers = allProfiles.filter((p) => !memberUserIds.has(p.user_id));

  const handleAdd = async () => {
    if (!addUserId) return;
    setLoading(true);
    try {
      await onAddMember(addUserId);
      setAddUserId('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a] border-l border-white/[0.04] w-[260px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
        <span className="text-[10px] uppercase tracking-wider text-[#666] font-semibold">
          Members ({members.length})
        </span>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-md text-[#555] hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1 1l8 8M9 1l-8 8" />
          </svg>
        </button>
      </div>

      {/* Member list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 py-2">
        {members.map((m) => {
          const profile = profiles.get(m.user_id) ?? m.profile;
          return (
            <div key={m.id} className="flex items-center gap-2.5 px-4 py-1.5">
              <Avatar profile={profile} size={24} />
              <span className="text-[11px] text-[#888] truncate">
                {profile?.display_name || m.user_id.slice(0, 8)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Add member */}
      {nonMembers.length > 0 && (
        <div className="border-t border-white/[0.04] px-3 py-3 space-y-2">
          <label className="text-[9px] uppercase tracking-wider text-[#444] font-semibold">
            Add Member
          </label>
          <div className="flex gap-2">
            <select
              value={addUserId}
              onChange={(e) => setAddUserId(e.target.value)}
              className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-lg px-2 py-1.5 text-[10px] text-white
                outline-none focus:border-white/[0.12] transition-colors appearance-none min-w-0"
            >
              <option value="" className="bg-[#1a1a1a]">Select user...</option>
              {nonMembers.map((p) => (
                <option key={p.user_id} value={p.user_id} className="bg-[#1a1a1a]">
                  {p.display_name}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={handleAdd} loading={loading} disabled={!addUserId} className="!min-h-[28px] !py-1 !px-2.5 !text-[9px]">
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
