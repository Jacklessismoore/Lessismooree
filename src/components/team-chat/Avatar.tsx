'use client';

import { cn } from '@/lib/utils';
import type { UserProfile } from '@/lib/team-chat-db';

const PALETTE = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6',
  '#EC4899', '#6366F1', '#14B8A6', '#F97316', '#06B6D4',
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function getInitials(name?: string, email?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return '??';
}

interface AvatarProps {
  profile?: UserProfile | null;
  email?: string;
  size?: number;
  className?: string;
}

export function Avatar({ profile, email, size = 32, className }: AvatarProps) {
  const seed = profile?.user_id || email || 'x';
  const color = PALETTE[hashStr(seed) % PALETTE.length];
  const initials = getInitials(profile?.display_name, email);

  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={profile.display_name || 'Avatar'}
        width={size}
        height={size}
        className={cn('rounded-full object-cover flex-shrink-0', className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center flex-shrink-0 font-semibold text-white',
        className
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        fontSize: size * 0.38,
        lineHeight: 1,
      }}
    >
      {initials}
    </div>
  );
}
