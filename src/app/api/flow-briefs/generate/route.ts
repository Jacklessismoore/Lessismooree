import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { FLOW_BRIEF_BUILDER_SKILL } from '@/lib/skills/flow-brief-builder';

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

interface GeneratedEmail {
  position: number;
  label: string;
  send_delay: string;
  goal: string;
  subject: string;
  preview_text: string;
  body_outline: string[];
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const {
      brandId,
      flowType,
      flowName,
      emailCount,
      triggerDescription,
      sourceNotes,
    } = body as {
      brandId: string;
      flowType: string;
      flowName: string;
      emailCount: number;
      triggerDescription: string;
      sourceNotes?: string;
    };

    if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 });
    if (!flowName) return NextResponse.json({ error: 'flowName required' }, { status: 400 });
    if (!emailCount || emailCount < 1 || emailCount > 12) {
      return NextResponse.json({ error: 'emailCount must be between 1 and 12' }, { status: 400 });
    }

    const { data: brand } = await supabase
      .from('brands')
      .select('name, category, voice, rules, avoid, audiences, products')
      .eq('id', brandId)
      .single();

    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    const payload = {
      brand: {
        name: brand.name,
        category: brand.category || 'unknown',
        voice: brand.voice || 'not specified',
        rules: brand.rules || 'none',
        avoid: brand.avoid || 'none',
        audiences: brand.audiences || [],
        products: (brand.products || []).slice(0, 30),
      },
      flow_type: flowType || 'custom',
      flow_name: flowName,
      email_count: emailCount,
      trigger_description: triggerDescription || '',
      source_notes: (sourceNotes || '').slice(0, 12000),
    };

    const userPrompt = `Build the flow brief for this request. Return ONLY the JSON inside <json>...</json> tags.

=== INPUT ===
\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\`
`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 6000,
      system: FLOW_BRIEF_BUILDER_SKILL,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const fullText = response.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('');

    const match = fullText.match(/<json>([\s\S]*?)<\/json>/) || fullText.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json(
        { error: `AI returned no JSON. First 500: ${fullText.slice(0, 500)}` },
        { status: 500 }
      );
    }

    let parsed: {
      trigger_description?: string;
      emails?: GeneratedEmail[];
    };
    try {
      parsed = JSON.parse((match[1] || match[0]).trim());
    } catch {
      return NextResponse.json(
        { error: `AI returned malformed JSON. First 500: ${fullText.slice(0, 500)}` },
        { status: 500 }
      );
    }

    if (!Array.isArray(parsed.emails) || parsed.emails.length === 0) {
      return NextResponse.json({ error: 'AI returned no emails' }, { status: 500 });
    }

    return NextResponse.json({
      trigger_description: parsed.trigger_description || triggerDescription || '',
      emails: parsed.emails,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
