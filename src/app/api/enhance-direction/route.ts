import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { title, currentDirection, brand } = await request.json();

    const prompt = currentDirection
      ? `Enhance and expand this email campaign direction for the brand "${brand.name}" (${brand.category}).
Brand voice: ${brand.voice || 'Not specified'}

Current direction: "${currentDirection}"
${title ? `Email name: "${title}"` : ''}

Rewrite the direction to be more specific, actionable, and aligned with the brand voice. Include:
- The core angle/hook for the email
- Key messaging points (2-3 max)
- Emotional trigger or value proposition
- Suggested content approach

Keep it concise (3-5 sentences). Output ONLY the enhanced direction text, no labels or headers.`
      : `Generate a campaign email direction for the brand "${brand.name}" (${brand.category}).
Brand voice: ${brand.voice || 'Not specified'}
${title ? `Email name: "${title}"` : ''}

Write a clear, specific direction for this email campaign. Include:
- The core angle/hook
- Key messaging points (2-3 max)
- Emotional trigger or value proposition
- Suggested content approach

Keep it concise (3-5 sentences). Output ONLY the direction text, no labels or headers.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const direction = message.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('');

    return NextResponse.json({ direction });
  } catch (error) {
    console.error('Enhance direction error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Enhancement failed' },
      { status: 500 }
    );
  }
}
