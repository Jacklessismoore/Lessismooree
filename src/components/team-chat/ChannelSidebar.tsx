'use client';

import type { TeamChannel, UserProfile } from '@/lib/team-chat-db';
import { Avatar } from './Avatar';

interface ChannelSidebarProps {
  channels: TeamChannel[];
  selectedId: string | null;
  onSelect: (channelId: string) => void;
  onCreateChannel: () => void;
  myProfile: UserProfile | null;
  onEditProfile: () => void;
  onClose?: () => void;
}

export function ChannelSidebar({
  channels,
  selectedId,
  onSelect,
  onCreateChannel,
  myProfile,
  onEditProfile,
  onClose,
}: ChannelSidebarProps) {
  const general = channels.filter((c) => !c.brand_id);
  const clients = channels.filter((c) => c.brand_id);

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a] border-r border-white/[0.04]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
        <span className="text-[10px] uppercase tracking-wider text-[#666] font-semibold">Channels</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onCreateChannel}
            className="w-6 h-6 flex items-center justify-center rounded-md text-[#555] hover:text-white hover:bg-white/[0.06] transition-colors chip-press"
            title="Create channel"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M6 1v10M1 6h10" />
            </svg>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded-md text-[#555] hover:text-white hover:bg-white/[0.06] transition-colors lg:hidden"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1 1l8 8M9 1l-8 8" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Channel lists */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 py-2">
        {general.length > 0 && (
          <div className="mb-3">
            <div className="px-4 py-1">
              <span className="text-[9px] uppercase tracking-wider text-[#444] font-semibold">General</span>
            </div>
            {general.map((ch) => (
              <ChannelItem key={ch.id} channel={ch} selected={ch.id === selectedId} onSelect={onSelect} />
            ))}
          </div>
        )}

        {clients.length > 0 && (
          <div>
            <div className="px-4 py-1">
              <span className="text-[9px] uppercase tracking-wider text-[#444] font-semibold">Clients</span>
            </div>
            {clients.map((ch) => (
              <ChannelItem key={ch.id} channel={ch} selected={ch.id === selectedId} onSelect={onSelect} />
            ))}
          </div>
        )}

        {channels.length === 0 && (
          <div className="px-4 py-6 text-[10px] text-[#444] text-center">
            No channels yet
          </div>
        )}
      </div>

      {/* Profile mini-card */}
      <div className="border-t border-white/[0.04] px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <Avatar profile={myProfile} size={28} />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-white font-medium truncate">
              {myProfile?.display_name || 'Set your name'}
            </div>
          </div>
          <button
            onClick={onEditProfile}
            className="w-6 h-6 flex items-center justify-center rounded-md text-[#444] hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Edit profile"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function ChannelItem({
  channel,
  selected,
  onSelect,
}: {
  channel: TeamChannel;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(channel.id)}
      className={`w-full text-left px-4 py-1.5 flex items-center gap-2 text-[11px] transition-colors
        ${selected ? 'bg-white/[0.06] text-white' : 'text-[#666] hover:text-[#999] hover:bg-white/[0.02]'}`}
    >
      {channel.brand?.color && (
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: channel.brand.color }}
        />
      )}
      <span className="truncate">
        <span className="text-[#444] mr-1">#</span>
        {channel.name}
      </span>
    </button>
  );
}
