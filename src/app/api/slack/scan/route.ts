import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const SLACK_TOKEN = process.env.SLACK_TOKEN;

async function slackAPI(endpoint: string, params: Record<string, string> = {}) {
  const url = new URL(`https://slack.com/api/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${SLACK_TOKEN}` },
  });
  return res.json();
}

// Build a fresh user cache per request
async function buildUserCache(userIds: string[]): Promise<Record<string, { name: string; avatar: string | null }>> {
  const cache: Record<string, { name: string; avatar: string | null }> = {};

  // Fetch all users in parallel (batch of 5 to avoid rate limits)
  const unique = [...new Set(userIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 5) {
    const batch = unique.slice(i, i + 5);
    await Promise.all(batch.map(async (userId) => {
      try {
        const res = await slackAPI('users.info', { user: userId });
        if (res.ok && res.user) {
          const u = res.user;
          cache[userId] = {
            name: u.real_name || u.profile?.real_name || u.profile?.display_name || u.name || userId,
            avatar: u.profile?.image_48 || u.profile?.image_72 || null,
          };
        } else {
          cache[userId] = { name: userId, avatar: null };
        }
      } catch {
        cache[userId] = { name: userId, avatar: null };
      }
    }));
  }

  return cache;
}

// Replace <@U123ABC> mentions in message text with actual names
function resolveMessageMentions(text: string, userCache: Record<string, { name: string; avatar: string | null }>): string {
  return text.replace(/<@([A-Z0-9]+)>/g, (_, userId) => {
    const user = userCache[userId];
    return user ? `@${user.name}` : `@${userId}`;
  });
}

async function classifyMessages(
  messages: { text: string; user_name: string; ts: string }[],
  brandName: string,
  teamMembers: string[]
): Promise<{ ts: string; action_type: string; summary: string }[]> {
  if (messages.length === 0) return [];

  const anthropic = new Anthropic();

  const messageList = messages
    .map((m, i) => `[${i}] ${m.user_name}: ${m.text}`)
    .join('\n');

  const teamList = teamMembers.length > 0
    ? `\n\nKnown team members (agency side, NOT clients): ${teamMembers.join(', ')}`
    : '';

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2000,
    system: `You are an inbox triage assistant for Less Is Moore, an email marketing agency. You classify Slack messages from client channels to help account managers prioritise their work.

Your job is to determine what action each message requires and how urgent it is.${teamList}

## Action types (pick the most appropriate one):

**urgent** — Use when:
- Client has a time-sensitive request (launch date, sale going live, something broken)
- Client mentions a deadline that's today or tomorrow
- Client is frustrated, escalating, or something has gone wrong
- Words like "ASAP", "urgent", "emergency", "broken", "wrong", "immediately"

**needs_reply** — Use when:
- Client asked a direct question that needs answering
- Client made a request that needs acknowledgment or discussion
- Client is waiting for a response on something
- Any message that would be rude to leave on read

**needs_brief** — Use when:
- Client explicitly asks for an email, campaign, SMS, or content to be created
- Client says things like "can we send", "we need an email for", "can you draft", "let's do a campaign"
- Client shares a promotion/sale/event that needs email content created

**feedback** — Use when:
- Client approved something ("looks good", "approved", "go ahead", "love it")
- Client gave revision notes ("can we change", "tweak the", "update the")
- Client is responding to work that was shared with them

**fyi** — Use when:
- General chit-chat, greetings, "thanks", "ok"
- Team members chatting with each other (not client messages)
- Automated messages, bot messages
- Messages that don't require any action

## Rules:
- Messages from team members to each other are almost always "fyi"
- When in doubt between "needs_reply" and "fyi", choose "needs_reply" (better to over-triage than miss something)
- When in doubt between "urgent" and "needs_reply", check for time pressure language
- Keep summaries under 80 characters and focused on WHAT NEEDS TO BE DONE`,
    messages: [
      {
        role: 'user',
        content: `Classify each message from the "${brandName}" client Slack channel.

Return ONLY a JSON array. Each object: {"index": number, "action_type": string, "summary": string}. No explanation text.

Messages:
${messageList}`,
      },
    ],
  });

  try {
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const results = JSON.parse(jsonMatch[0]);
    return results.map((r: { index: number; action_type: string; summary: string }) => ({
      ts: messages[r.index]?.ts || '',
      action_type: r.action_type || 'fyi',
      summary: r.summary || '',
    }));
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  try {
    if (!SLACK_TOKEN) {
      return NextResponse.json({ error: 'Slack token not configured' }, { status: 500 });
    }

    const { brandId, channelId, brandName, teamMembers } = await request.json();
    if (!channelId) {
      return NextResponse.json({ error: 'No Slack channel ID provided' }, { status: 400 });
    }

    // Get recent messages (last 48 hours for better coverage)
    const oldest = String(Math.floor(Date.now() / 1000) - 172800);
    const historyRes = await slackAPI('conversations.history', {
      channel: channelId,
      oldest,
      limit: '50',
    });

    if (!historyRes.ok) {
      return NextResponse.json(
        { error: `Slack API error: ${historyRes.error}` },
        { status: 400 }
      );
    }

    const rawMessages = historyRes.messages || [];
    if (rawMessages.length === 0) {
      return NextResponse.json({ items: [], message: 'No recent messages' });
    }

    // Collect all user IDs from messages + thread replies
    const allUserIds: string[] = rawMessages.map((m: { user: string }) => m.user).filter(Boolean);

    // Fetch thread replies for messages that have threads
    const threadRepliesMap: Record<string, { user_id: string; text: string; ts: string }[]> = {};
    const threadedMessages = rawMessages.filter((m: { reply_count?: number; ts: string }) => m.reply_count && m.reply_count > 0);

    for (const tm of threadedMessages.slice(0, 10)) {
      try {
        const threadRes = await slackAPI('conversations.replies', {
          channel: channelId,
          ts: tm.ts,
          limit: '10',
        });
        if (threadRes.ok && threadRes.messages) {
          const replies = threadRes.messages.slice(1);
          for (const r of replies) {
            if (r.user) allUserIds.push(r.user);
          }
          threadRepliesMap[tm.ts] = replies
            .filter((r: { subtype?: string }) => !r.subtype)
            .map((r: { text: string; user: string; ts: string }) => ({
              user_id: r.user,
              text: r.text,
              ts: r.ts,
            }));
        }
      } catch {
        // Ignore thread fetch errors
      }
    }

    // Also collect user IDs from <@U123> mentions in message text
    for (const m of rawMessages) {
      const mentions = (m.text || '').match(/<@([A-Z0-9]+)>/g);
      if (mentions) {
        for (const mention of mentions) {
          const uid = mention.replace(/<@|>/g, '');
          allUserIds.push(uid);
        }
      }
    }

    // Build user cache with ALL user IDs at once
    const userCache = await buildUserCache(allUserIds);

    // Format messages with resolved names and mentions
    const messages = rawMessages
      .filter((m: { subtype?: string }) => !m.subtype)
      .map((m: { text: string; user: string; ts: string; thread_ts?: string; reply_count?: number }) => {
        const user = userCache[m.user] || { name: m.user || 'Unknown', avatar: null };
        const rawReplies = threadRepliesMap[m.ts] || [];
        const threadReplies = rawReplies.map(r => ({
          user_name: userCache[r.user_id]?.name || r.user_id || 'Unknown',
          text: resolveMessageMentions(r.text, userCache),
          ts: r.ts,
        }));
        return {
          text: resolveMessageMentions(m.text, userCache),
          user_name: user.name,
          user_avatar: user.avatar,
          ts: m.ts,
          thread_ts: m.thread_ts || null,
          user_id: m.user,
          thread_replies: threadReplies,
          reply_count: m.reply_count || 0,
        };
      });

    // Classify with AI
    const classifications = await classifyMessages(
      messages.map((m: { text: string; user_name: string; ts: string }) => ({
        text: m.text,
        user_name: m.user_name,
        ts: m.ts,
      })),
      brandName || 'client',
      teamMembers || []
    );

    // Build inbox items (skip fyi messages, skip thread replies — they're included in parent)
    const classMap = new Map(classifications.map((c) => [c.ts, c]));
    const items = messages
      .filter((m: { ts: string; thread_ts: string | null }) => {
        // Skip messages that are replies in a thread (thread_ts !== ts means it's a reply)
        if (m.thread_ts && m.thread_ts !== m.ts) return false;
        return true;
      })
      .map((m: { text: string; user_name: string; user_avatar: string | null; ts: string; thread_ts: string | null; thread_replies: { user_name: string; text: string; ts: string }[]; reply_count: number }) => {
        const classification = classMap.get(m.ts);
        if (!classification || classification.action_type === 'fyi') return null;

        // Build full message text including thread context
        // Each reply is separated by \n[Name]: so the client can split correctly
        let fullText = m.text;
        if (m.thread_replies && m.thread_replies.length > 0) {
          const threadText = m.thread_replies.map(r => `[${r.user_name}]: ${r.text}`).join('\n\n');
          fullText = m.text + '\n---THREAD---\n' + threadText;
        }

        return {
          brand_id: brandId,
          slack_channel_id: channelId,
          slack_message_ts: m.ts,
          slack_thread_ts: m.thread_ts,
          slack_user_name: m.user_name,
          slack_user_avatar: m.user_avatar,
          message_text: fullText,
          action_type: classification.action_type,
          action_summary: classification.summary,
          is_resolved: false,
        };
      })
      .filter(Boolean);

    // Save to Supabase — only insert NEW items, skip existing ones (resolved or not)
    if (items.length > 0) {
      const { createClient } = await import('@/lib/supabase/server');
      const supabase = await createClient();

      // Check which messages already exist in the DB
      const messageTsValues = items.map((i: { slack_message_ts: string }) => i.slack_message_ts);
      const { data: existing } = await supabase
        .from('inbox_items')
        .select('slack_message_ts')
        .eq('slack_channel_id', channelId)
        .in('slack_message_ts', messageTsValues);

      const existingTs = new Set((existing || []).map((e: { slack_message_ts: string }) => e.slack_message_ts));

      // Only insert items that don't already exist
      const newItems = items.filter((i: { slack_message_ts: string }) => !existingTs.has(i.slack_message_ts));

      for (const item of newItems) {
        await supabase.from('inbox_items').insert(item);
      }

      items.length = 0; // Reset for count
      items.push(...newItems);
    }

    return NextResponse.json({
      items,
      total_messages: rawMessages.length,
      actionable: items.length,
    });
  } catch (error) {
    console.error('Slack scan error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to scan Slack' },
      { status: 500 }
    );
  }
}
