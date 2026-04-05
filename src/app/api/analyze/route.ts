import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { ANALYSIS_SYSTEM_PROMPT } from '@/lib/prompts';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { documentText, mode } = (await request.json()) as { documentText: string; mode?: string };

    if (!documentText || documentText.trim().length === 0) {
      return NextResponse.json({ error: 'No document text provided' }, { status: 400 });
    }

    // Truncate to prevent excessive token usage
    const truncated = documentText.slice(0, 15000);

    // Onboarding notes mode — summarise the document into structured notes
    if (mode === 'onboarding_notes') {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: `You are a senior email marketing strategist onboarding a new DTC e-commerce client. Summarise the provided document into structured onboarding notes that will help the team write better email copy and strategies. Include: brand overview, key differentiators, target customer profile, product highlights, tone/voice observations, any restrictions or compliance notes, and strategic opportunities for email marketing. Be concise but thorough. Output as clean text with section headers.`,
        messages: [{ role: 'user', content: `Create onboarding notes from this document:\n\n${truncated}` }],
      });

      const notes = message.content
        .filter(block => block.type === 'text')
        .map(block => (block as { type: 'text'; text: string }).text)
        .join('');

      return NextResponse.json({ notes });
    }

    // Default mode — extract brand info as JSON
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: ANALYSIS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Extract brand info from:\n\n${truncated}` }],
    });

    const text = message.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('');

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    const result = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      voice: result.voice || '',
      rules: result.rules || '',
      audiences: Array.isArray(result.audiences) ? result.audiences : [],
      products: Array.isArray(result.products) ? result.products : [],
    });
  } catch (error) {
    console.error('Analyze error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
