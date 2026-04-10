'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

import { useAuth } from '@/lib/auth-context';
import { useApp } from '@/lib/app-context';
import {
  getChannels,
  getChannelMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  createChannel,
  getAllProfiles,
  getUserProfile,
  upsertUserProfile,
  getChannelMembers,
  addChannelMember,
  autoJoinAllChannels,
  type TeamChannel,
  type TeamMessage,
  type UserProfile,
  type TeamChannelMember,
} from '@/lib/team-chat-db';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';

import { ChannelSidebar } from '@/components/team-chat/ChannelSidebar';
import { MessageList } from '@/components/team-chat/MessageList';
import { MessageInput } from '@/components/team-chat/MessageInput';
import { CreateChannelModal } from '@/components/team-chat/CreateChannelModal';
import { ProfileEditor } from '@/components/team-chat/ProfileEditor';
import { MembersPanel } from '@/components/team-chat/MembersPanel';

const PAGE_SIZE = 50;

export default function TeamChatPage() {
  const { user } = useAuth();
  const { brands } = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Core state ──
  const [channels, setChannels] = useState<TeamChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [myProfile, setMyProfile] = useState<UserProfile | null>(null);
  const [members, setMembers] = useState<TeamChannelMember[]>([]);

  // ── Pagination ──
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // ── UI toggles ──
  const [showMobileChannels, setShowMobileChannels] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);

  // ── Edit state ──
  const [editingMessage, setEditingMessage] = useState<TeamMessage | null>(null);

  // ── Loading flags ──
  const [initialLoading, setInitialLoading] = useState(true);

  const allProfilesRef = useRef<UserProfile[]>([]);

  // ── Init: load channels, profiles, ensure own profile exists ──
  useEffect(() => {
    if (!user) return;

    const init = async () => {
      try {
        let chans: TeamChannel[] = [];
        try {
          chans = await getChannels();
        } catch (e) {
          console.error('getChannels failed:', e);
          toast.error('Failed to load channels');
          return;
        }
        setChannels(chans);

        let allProfs: UserProfile[] = [];
        try {
          allProfs = await getAllProfiles();
        } catch (e) {
          console.error('getAllProfiles failed:', e);
          // Non-critical — continue with empty profiles
        }

        const profMap = new Map<string, UserProfile>();
        allProfs.forEach((p) => profMap.set(p.user_id, p));
        setProfiles(profMap);
        allProfilesRef.current = allProfs;

        // Ensure own profile
        let me = profMap.get(user.id) ?? null;
        if (!me) {
          try {
            const email = user.email ?? '';
            const name = email.split('@')[0] || 'User';
            me = await upsertUserProfile(user.id, name);
            profMap.set(user.id, me);
            setProfiles(new Map(profMap));
            allProfilesRef.current = [...allProfs, me];
          } catch (e) {
            console.error('upsertUserProfile failed:', e);
          }
        }
        setMyProfile(me);

        // Auto-join all channels
        try {
          await autoJoinAllChannels(user.id);
        } catch (e) {
          console.error('autoJoinAllChannels failed:', e);
          // Non-critical — user may already be in channels
        }

        // Select channel from URL or first
        const urlChannel = searchParams.get('channel');
        const targetId = urlChannel && chans.find((c) => c.id === urlChannel)
          ? urlChannel
          : chans[0]?.id ?? null;
        setSelectedChannelId(targetId);
      } catch (err) {
        console.error('Team chat init error:', err);
        toast.error('Failed to load team chat');
      } finally {
        setInitialLoading(false);
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Load messages when channel changes ──
  useEffect(() => {
    if (!selectedChannelId) return;

    let cancelled = false;
    const load = async () => {
      try {
        const msgs = await getChannelMessages(selectedChannelId, undefined, PAGE_SIZE);
        if (cancelled) return;
        setMessages(msgs);
        setHasMore(msgs.length === PAGE_SIZE);

        const mems = await getChannelMembers(selectedChannelId);
        if (cancelled) return;
        setMembers(mems);
      } catch (err) {
        console.error('Failed to load messages:', err);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [selectedChannelId]);

  // ── Update URL when channel changes ──
  useEffect(() => {
    if (selectedChannelId) {
      const current = searchParams.get('channel');
      if (current !== selectedChannelId) {
        router.replace(`/team-chat?channel=${selectedChannelId}`, { scroll: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannelId]);

  // ── Realtime subscription ──
  const handleRealtimeInsert = useCallback(
    (payload: TeamMessage | Record<string, unknown>) => {
      const msg = payload as TeamMessage;
      // Don't duplicate if we already have it (e.g. optimistic)
      setMessages((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev;
        // Enrich with profile from our map
        const profile = profiles.get(msg.user_id as string);
        return [...prev, { ...msg, profile: profile ?? undefined }];
      });
    },
    [profiles]
  );

  const handleRealtimeUpdate = useCallback(
    (payload: TeamMessage | Record<string, unknown>) => {
      const msg = payload as TeamMessage;
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m))
      );
    },
    []
  );

  const handleRealtimeDelete = useCallback(
    (payload: TeamMessage | Record<string, unknown>) => {
      const old = payload as { id?: string };
      if (old.id) {
        setMessages((prev) => prev.filter((m) => m.id !== old.id));
      }
    },
    []
  );

  useRealtimeMessages(
    selectedChannelId,
    handleRealtimeInsert,
    handleRealtimeUpdate,
    handleRealtimeDelete
  );

  // ── Actions ──
  const handleSend = async (content: string) => {
    if (!user || !selectedChannelId) return;

    if (editingMessage) {
      try {
        const updated = await editMessage(editingMessage.id, content);
        setMessages((prev) =>
          prev.map((m) => (m.id === updated.id ? updated : m))
        );
        setEditingMessage(null);
        toast.success('Message edited');
      } catch {
        toast.error('Failed to edit message');
      }
      return;
    }

    try {
      const msg = await sendMessage(selectedChannelId, user.id, content);
      // Optimistic add (realtime will dedupe)
      setMessages((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    } catch {
      toast.error('Failed to send message');
    }
  };

  const handleDelete = async (messageId: string) => {
    try {
      await deleteMessage(messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      toast.success('Message deleted');
    } catch {
      toast.error('Failed to delete message');
    }
  };

  const handleEdit = (message: TeamMessage) => {
    setEditingMessage(message);
  };

  const handleLoadMore = async () => {
    if (!selectedChannelId || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const cursor = messages[0].created_at;
      const older = await getChannelMessages(selectedChannelId, cursor, PAGE_SIZE);
      setMessages((prev) => [...older, ...prev]);
      setHasMore(older.length === PAGE_SIZE);
    } catch {
      toast.error('Failed to load earlier messages');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleCreateChannel = async (name: string, description: string, brandId?: string) => {
    if (!user) return;
    try {
      const ch = await createChannel(name, description, brandId, user.id);
      setChannels((prev) => [...prev, ch]);
      setSelectedChannelId(ch.id);
      toast.success('Channel created');
    } catch {
      toast.error('Failed to create channel');
    }
  };

  const handleSaveProfile = async (displayName: string, avatarUrl: string | null) => {
    if (!user) return;
    try {
      const updated = await upsertUserProfile(user.id, displayName, avatarUrl);
      setMyProfile(updated);
      setProfiles((prev) => {
        const next = new Map(prev);
        next.set(user.id, updated);
        return next;
      });
      toast.success('Profile updated');
    } catch {
      toast.error('Failed to update profile');
    }
  };

  const handleAddMember = async (userId: string) => {
    if (!selectedChannelId) return;
    try {
      await addChannelMember(selectedChannelId, userId);
      const mems = await getChannelMembers(selectedChannelId);
      setMembers(mems);
      toast.success('Member added');
    } catch {
      toast.error('Failed to add member');
    }
  };

  const handleSelectChannel = (channelId: string) => {
    setSelectedChannelId(channelId);
    setShowMobileChannels(false);
    setEditingMessage(null);
  };

  const selectedChannel = channels.find((c) => c.id === selectedChannelId);

  // ── Loading ──
  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden animate-fade">
      {/* Mobile sidebar overlay */}
      {showMobileChannels && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowMobileChannels(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[280px] z-50">
            <ChannelSidebar
              channels={channels}
              selectedId={selectedChannelId}
              onSelect={handleSelectChannel}
              onCreateChannel={() => { setShowMobileChannels(false); setShowCreateChannel(true); }}
              myProfile={myProfile}
              onEditProfile={() => { setShowMobileChannels(false); setShowProfileEditor(true); }}
              onClose={() => setShowMobileChannels(false)}
            />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:block w-[260px] flex-shrink-0">
        <ChannelSidebar
          channels={channels}
          selectedId={selectedChannelId}
          onSelect={handleSelectChannel}
          onCreateChannel={() => setShowCreateChannel(true)}
          myProfile={myProfile}
          onEditProfile={() => setShowProfileEditor(true)}
        />
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Channel header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04] flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile hamburger */}
            <button
              onClick={() => setShowMobileChannels(true)}
              className="lg:hidden w-7 h-7 flex items-center justify-center rounded-md text-[#666] hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <rect y="2" width="16" height="1.5" rx="0.75" />
                <rect y="7.25" width="16" height="1.5" rx="0.75" />
                <rect y="12.5" width="16" height="1.5" rx="0.75" />
              </svg>
            </button>

            <div className="min-w-0">
              <h2 className="text-[12px] font-semibold text-white truncate">
                {selectedChannel ? `# ${selectedChannel.name}` : 'Team Chat'}
              </h2>
              {selectedChannel?.description && (
                <p className="text-[9px] text-[#555] truncate">{selectedChannel.description}</p>
              )}
            </div>
          </div>

          <button
            onClick={() => setShowMembers(!showMembers)}
            className="w-7 h-7 flex items-center justify-center rounded-md text-[#555] hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Members"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </button>
        </div>

        {/* Messages + input */}
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 flex flex-col min-w-0">
            <MessageList
              messages={messages}
              profiles={profiles}
              currentUserId={user?.id ?? ''}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onLoadMore={handleLoadMore}
              hasMore={hasMore}
              loadingMore={loadingMore}
            />

            <div className="px-3 py-2 flex-shrink-0">
              {editingMessage ? (
                <MessageInput
                  key={`edit-${editingMessage.id}`}
                  onSend={handleSend}
                  profiles={allProfilesRef.current}
                  editContent={editingMessage.content}
                  onCancelEdit={() => setEditingMessage(null)}
                />
              ) : (
                <MessageInput
                  onSend={handleSend}
                  profiles={allProfilesRef.current}
                  disabled={!selectedChannelId}
                />
              )}
            </div>
          </div>

          {/* Members panel */}
          {showMembers && selectedChannelId && (
            <div className="hidden md:block flex-shrink-0">
              <MembersPanel
                members={members}
                profiles={profiles}
                channelId={selectedChannelId}
                onClose={() => setShowMembers(false)}
                onAddMember={handleAddMember}
                allProfiles={allProfilesRef.current}
              />
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <CreateChannelModal
        open={showCreateChannel}
        onClose={() => setShowCreateChannel(false)}
        onCreated={handleCreateChannel}
        brands={brands}
      />

      <ProfileEditor
        open={showProfileEditor}
        profile={myProfile}
        onSave={handleSaveProfile}
        onClose={() => setShowProfileEditor(false)}
      />

      {/* Mobile members modal */}
      {showMembers && selectedChannelId && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowMembers(false)} />
          <div className="absolute right-0 top-0 bottom-0 z-50">
            <MembersPanel
              members={members}
              profiles={profiles}
              channelId={selectedChannelId}
              onClose={() => setShowMembers(false)}
              onAddMember={handleAddMember}
              allProfiles={allProfilesRef.current}
            />
          </div>
        </div>
      )}
    </div>
  );
}
