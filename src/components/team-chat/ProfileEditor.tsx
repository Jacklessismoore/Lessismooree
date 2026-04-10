'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Avatar } from './Avatar';
import type { UserProfile } from '@/lib/team-chat-db';

interface ProfileEditorProps {
  profile: UserProfile | null;
  onSave: (displayName: string, avatarUrl: string | null) => Promise<void>;
  onClose: () => void;
  open: boolean;
}

export function ProfileEditor({ profile, onSave, onClose, open }: ProfileEditorProps) {
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '');
  const [loading, setLoading] = useState(false);

  const previewProfile: UserProfile = {
    id: profile?.id ?? '',
    user_id: profile?.user_id ?? '',
    display_name: displayName || 'Preview',
    avatar_url: avatarUrl || null,
    created_at: '',
    updated_at: '',
  };

  const handleSave = async () => {
    if (!displayName.trim()) return;
    setLoading(true);
    try {
      await onSave(displayName.trim(), avatarUrl.trim() || null);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <h3 className="text-sm font-semibold text-white mb-5">Edit Profile</h3>

      <div className="flex items-center gap-4 mb-5">
        <Avatar profile={previewProfile} size={48} />
        <div className="text-[11px] text-[#888]">
          Preview
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-[#666] font-semibold block mb-1.5">
            Display Name
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-[11px] text-white
              placeholder:text-[#444] outline-none focus:border-white/[0.12] transition-colors"
          />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-[#666] font-semibold block mb-1.5">
            Avatar URL
          </label>
          <input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://example.com/avatar.jpg"
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-[11px] text-white
              placeholder:text-[#444] outline-none focus:border-white/[0.12] transition-colors"
          />
          <p className="text-[9px] text-[#444] mt-1">Leave empty to use initials</p>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} loading={loading} disabled={!displayName.trim()}>
          Save
        </Button>
      </div>
    </Modal>
  );
}
