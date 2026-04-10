'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { TeamMessage } from '@/lib/team-chat-db';

type MessagePayload = TeamMessage | Record<string, unknown>;

export function useRealtimeMessages(
  channelId: string | null,
  onInsert?: (message: MessagePayload) => void,
  onUpdate?: (message: MessagePayload) => void,
  onDelete?: (message: MessagePayload) => void
) {
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  const onDeleteRef = useRef(onDelete);

  // Keep refs current without re-subscribing
  useEffect(() => {
    onInsertRef.current = onInsert;
  }, [onInsert]);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    onDeleteRef.current = onDelete;
  }, [onDelete]);

  useEffect(() => {
    if (!channelId) return;

    const sb = createClient();
    if (!sb) return;

    const channel = sb
      .channel(`team-chat-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
          if (payload.eventType === 'INSERT') {
            onInsertRef.current?.(payload.new as MessagePayload);
          }
          if (payload.eventType === 'UPDATE') {
            onUpdateRef.current?.(payload.new as MessagePayload);
          }
          if (payload.eventType === 'DELETE') {
            onDeleteRef.current?.(payload.old as MessagePayload);
          }
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [channelId]);
}
