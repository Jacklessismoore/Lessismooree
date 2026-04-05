import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { website, instagram, brandName } = await request.json();

    if (!website && !instagram) {
      return NextResponse.json({ error: 'Provide at least a website URL or Instagram handle' }, { status: 400 });
    }

    // Build context for Claude to analyze
    let context = `Analyze this DTC e-commerce brand and generate their email marketing profile.\n\nBrand Name: ${brandName || 'Unknown'}\n`;

    if (website) {
      context += `\nWebsite URL: ${website}`;
      context += `\nBased on the website URL, infer the brand's positioning, product category, target audience, and tone from the domain name, any known brand information, and typical patterns for this type of business.`;
    }

    if (instagram) {
      const handle = instagram.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
      context += `\nInstagram: @${handle}`;
      context += `\nBased on the Instagram handle, infer the brand's visual style, community engagement approach, and content themes.`;
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `You are a senior email marketing strategist analyzing DTC e-commerce brands. Based on the brand name, website URL, and/or Instagram handle provided, generate a comprehensive email marketing profile. Use your knowledge of the brand if you recognize it, otherwise make educated inferences based on the brand name, URL patterns, and industry norms. Return ONLY valid JSON with no other text.`,
      messages: [{
        role: 'user',
        content: `${context}\n\nReturn ONLY this JSON format:\n{"voice":"detailed description of brand voice and tone for email marketing - be specific about personality, formality, humor, how they address customers","rules":"email copy rules and constraints - dos and don'ts, words to avoid, tone boundaries","audiences":["audience segment 1","audience segment 2","audience segment 3"],"products":["main product/collection 1","main product/collection 2","main product/collection 3"]}`,
      }],
    });

    const text = message.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('');

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    const result = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Brand analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
