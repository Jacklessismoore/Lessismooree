import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 30;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Fetches a Fathom call notes URL (or any URL) and uses Claude to pull out
// the key takeaways, turning them into a clean comment body that can be
// saved to brand_comments.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { url } = (await request.json()) as { url?: string };
    if (!url || !url.trim()) {
      return NextResponse.json({ error: 'URL required' }, { status: 400 });
    }

    // Fetch the page content
    let pageText = '';
    let pageTitle = '';
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LIMWorkbench/1.0)' },
      });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      if (titleMatch) pageTitle = titleMatch[1].trim();
      // Strip html tags for a rough text dump
      pageText = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 15000);
    } catch (err) {
      return NextResponse.json(
        {
          error: `Could not load the URL. Fathom pages are often private and require login — you may need to paste the transcript manually instead. (${err instanceof Error ? err.message : 'fetch failed'})`,
        },
        { status: 400 }
      );
    }

    if (!pageText || pageText.length < 100) {
      return NextResponse.json(
        {
          error: 'The page returned no readable content. Fathom pages are often private — you may need to paste the transcript manually.',
        },
        { status: 400 }
      );
    }

    // Ask Claude to extract the key takeaways as a clean comment body
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1500,
      system: `You are a senior account manager at an email marketing agency. Your job is to extract the key takeaways from a call transcript or meeting notes page and turn them into a concise, scannable comment that will be saved against the client's profile.

The comment should be written from the AM's point of view — not a summary of "Claude's analysis". It should read like a quick note an AM would drop after a call.

Focus on:
- What the client wants (campaigns, flows, products, launches, events)
- Constraints they mentioned (no discounts, avoid certain claims, specific timing)
- Decisions made on the call
- Action items
- Brand voice or tone guidance they gave
- Anything about upcoming months or seasonal pushes

Keep it under 400 words. Use short paragraphs or bullet points. No fluff, no preamble like "Based on the transcript..." — just the takeaways. No em dashes.`,
      messages: [
        {
          role: 'user',
          content: `Extract the key takeaways from this call page into a client comment.

URL: ${url}
Page title: ${pageTitle || 'Unknown'}

Content:
${pageText}`,
        },
      ],
    });

    const extracted = response.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('')
      .trim();

    if (!extracted) {
      return NextResponse.json({ error: 'No takeaways extracted' }, { status: 500 });
    }

    return NextResponse.json({ content: extracted, sourceTitle: pageTitle });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
