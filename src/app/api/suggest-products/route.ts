import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { direction, title, productList } = await request.json();

    if (!productList || productList.length === 0) {
      return NextResponse.json({ suggested: [] });
    }

    const productNames = productList.map((p: { title: string }) => p.title).join('\n- ');

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Given this email campaign:
Title: ${title || 'Not specified'}
Direction: ${direction || 'Not specified'}

And these available products:
- ${productNames}

Select the 3-6 most relevant products for this email campaign. Return ONLY a JSON array of product names exactly as listed above. Example: ["Product A","Product B","Product C"]`,
      }],
    });

    const text = message.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('');

    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return NextResponse.json({ suggested: [] });

    const suggested = JSON.parse(match[0]);
    return NextResponse.json({ suggested });
  } catch (error) {
    console.error('Suggest products error:', error);
    return NextResponse.json({ suggested: [] });
  }
}
