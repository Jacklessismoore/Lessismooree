import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUserRole, roleAllowedForAbTests } from '@/lib/roles';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(request: NextRequest) {
  try {
    const role = await getCurrentUserRole();
    if (!roleAllowedForAbTests(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { brandId, flowSummary } = await request.json();
    if (!brandId) {
      return NextResponse.json({ error: 'brandId required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: brand } = await supabase
      .from('brands')
      .select('name, category, voice, rules')
      .eq('id', brandId)
      .single();

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    const prompt = `You are suggesting a testing theme for a Klaviyo flow A/B test round.

Brand: ${brand.name}
Category: ${brand.category || 'unknown'}
Voice: ${brand.voice || 'unknown'}
Rules: ${brand.rules || 'none'}

Flow summary:
${flowSummary || '(not provided)'}

Produce ONE short sentence (max 20 words) describing a single focused test theme for this round. No preamble, no quotes, no em dashes. Just the sentence.`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 120,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('')
      .trim();

    return NextResponse.json({ theme: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
