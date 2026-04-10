import { createClient } from '@/lib/supabase/client';

// ─── Types ───

export interface UserProfile {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamChannel {
  id: string;
  name: string;
  description: string;
  brand_id: string | null;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  member_count?: number;
  brand?: { name: string; color: string } | null;
}

export interface TeamChannelMember {
  id: string;
  channel_id: string;
  user_id: string;
  joined_at: string;
  profile?: UserProfile;
}

export interface TeamMessage {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  edited_at: string | null;
  created_at: string;
  profile?: UserProfile;
}

// ─── Helpers ───

function supabase() {
  const client = createClient();
  if (!client) {
    throw new Error(
      'Supabase is not configured. Please add valid NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local'
    );
  }
  return client;
}

// ─── User Profiles ───

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase()
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertUserProfile(
  userId: string,
  displayName: string,
  avatarUrl?: string | null
): Promise<UserProfile> {
  const { data, error } = await supabase()
    .from('user_profiles')
    .upsert(
      {
        user_id: userId,
        display_name: displayName,
        avatar_url: avatarUrl ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getAllProfiles(): Promise<UserProfile[]> {
  const { data, error } = await supabase()
    .from('user_profiles')
    .select('*')
    .order('display_name');
  if (error) throw error;
  return data ?? [];
}

// ─── Channels ───

export async function getChannels(): Promise<TeamChannel[]> {
  const { data, error } = await supabase()
    .from('team_channels')
    .select('*, brand:brands(name, color)')
    .order('is_default', { ascending: false })
    .order('name');
  if (error) throw error;
  return (data ?? []) as TeamChannel[];
}

export async function createChannel(
  name: string,
  description: string,
  brandId?: string | null,
  createdBy?: string | null
): Promise<TeamChannel> {
  const { data, error } = await supabase()
    .from('team_channels')
    .insert({
      name,
      description,
      brand_id: brandId ?? null,
      created_by: createdBy ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  // Auto-add creator as member
  if (createdBy) {
    await supabase()
      .from('team_channel_members')
      .upsert(
        { channel_id: data.id, user_id: createdBy },
        { onConflict: 'channel_id,user_id' }
      );
  }

  return data;
}

// ─── Channel Members ───

export async function getChannelMembers(channelId: string): Promise<TeamChannelMember[]> {
  const { data, error } = await supabase()
    .from('team_channel_members')
    .select('*')
    .eq('channel_id', channelId)
    .order('joined_at');
  if (error) throw error;
  return data ?? [];
}

export async function joinChannel(channelId: string, userId: string): Promise<void> {
  const { error } = await supabase()
    .from('team_channel_members')
    .upsert(
      { channel_id: channelId, user_id: userId },
      { onConflict: 'channel_id,user_id' }
    );
  if (error) throw error;
}

export async function leaveChannel(channelId: string, userId: string): Promise<void> {
  const { error } = await supabase()
    .from('team_channel_members')
    .delete()
    .eq('channel_id', channelId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function addChannelMember(channelId: string, userId: string): Promise<void> {
  const { error } = await supabase()
    .from('team_channel_members')
    .upsert(
      { channel_id: channelId, user_id: userId },
      { onConflict: 'channel_id,user_id' }
    );
  if (error) throw error;
}

export async function autoJoinAllChannels(userId: string): Promise<void> {
  const { data: channels, error: chErr } = await supabase()
    .from('team_channels')
    .select('id');
  if (chErr) throw chErr;

  if (!channels || channels.length === 0) return;

  const rows = channels.map((ch: { id: string }) => ({
    channel_id: ch.id,
    user_id: userId,
  }));

  const { error } = await supabase()
    .from('team_channel_members')
    .upsert(rows, { onConflict: 'channel_id,user_id' });
  if (error) throw error;
}

// ─── Messages ───

export async function getChannelMessages(
  channelId: string,
  cursor?: string,
  limit: number = 50
): Promise<TeamMessage[]> {
  let query = supabase()
    .from('team_messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Reverse so messages display in ascending order
  return (data ?? []).reverse();
}

export async function sendMessage(
  channelId: string,
  userId: string,
  content: string
): Promise<TeamMessage> {
  const { data, error } = await supabase()
    .from('team_messages')
    .insert({ channel_id: channelId, user_id: userId, content })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function editMessage(messageId: string, content: string): Promise<TeamMessage> {
  const { data, error } = await supabase()
    .from('team_messages')
    .update({ content, edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await supabase()
    .from('team_messages')
    .delete()
    .eq('id', messageId);
  if (error) throw error;
}
