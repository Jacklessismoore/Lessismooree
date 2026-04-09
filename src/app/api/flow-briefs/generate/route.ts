import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { FLOW_BRIEF_BUILDER_SKILL } from '@/lib/skills/flow-brief-builder';
import { buildBriefPrompt, GENERATION_SYSTEM_PROMPT } from '@/lib/prompts';
import { Brand, CreateFormData } from '@/lib/types';

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

interface PlannedEmail {
  position: number;
  label: string;
  send_delay: string;
  goal: string;
  subject: string;
  preview_text: string;
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
      purpose,
      summary,
      sourceNotes,
    } = body as {
      brandId: string;
      flowType: string;
      flowName: string;
      emailCount: number;
      triggerDescription: string;
      purpose?: string;
      summary?: string;
      sourceNotes?: string;
    };

    if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 });
    if (!flowName) return NextResponse.json({ error: 'flowName required' }, { status: 400 });
    if (!emailCount || emailCount < 1 || emailCount > 12) {
      return NextResponse.json({ error: 'emailCount must be between 1 and 12' }, { status: 400 });
    }

    // Pull the full brand record so buildBriefPrompt has what it needs
    const { data: brand } = await supabase
      .from('brands')
      .select('*')
      .eq('id', brandId)
      .single();

    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    // ─── STEP 1: Plan the flow (sequence-level) ───
    // Ask the flow-planner skill to return the sequence: position, label,
    // delay, goal, subject, preview — but NOT the full body copy. That
    // happens in step 2, per-email, using the campaign brief generator.
    const planInput = {
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
      purpose: purpose || '',
      summary: summary || '',
      source_notes: (sourceNotes || '').slice(0, 10000),
    };

    const planPrompt = `Plan the flow sequence. Return ONLY the JSON inside <json>...</json> tags.

=== INPUT ===
\`\`\`json
${JSON.stringify(planInput, null, 2)}
\`\`\`
`;

    const planResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      system: FLOW_BRIEF_BUILDER_SKILL,
      messages: [{ role: 'user', content: planPrompt }],
    });

    const planText = planResponse.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('');

    const planMatch = planText.match(/<json>([\s\S]*?)<\/json>/) || planText.match(/\{[\s\S]*\}/);
    if (!planMatch) {
      return NextResponse.json(
        { error: `AI did not return a sequence plan. First 500: ${planText.slice(0, 500)}` },
        { status: 500 }
      );
    }

    let plan: { trigger_description?: string; emails?: PlannedEmail[] };
    try {
      plan = JSON.parse((planMatch[1] || planMatch[0]).trim());
    } catch {
      return NextResponse.json(
        { error: `Flow plan JSON malformed. First 500: ${planText.slice(0, 500)}` },
        { status: 500 }
      );
    }

    if (!Array.isArray(plan.emails) || plan.emails.length === 0) {
      return NextResponse.json({ error: 'AI returned no emails in the flow plan' }, { status: 500 });
    }

    // ─── STEP 2: For each planned email, generate the full campaign brief ───
    // Run them in parallel against the existing buildBriefPrompt + generation
    // system prompt so the output is identical in shape to a Campaign Brief.
    const typedBrand = brand as unknown as Brand;

    const briefPromises = plan.emails.map(async (email) => {
      // Compose the per-email form data as if it were a campaign brief
      const formData: CreateFormData = {
        title: `${flowName} — ${email.label}`,
        brief: [
          `Flow: ${flowName}`,
          `Position: ${email.label} (email ${email.position} of ${plan.emails!.length})`,
          `Trigger: ${plan.trigger_description || triggerDescription}`,
          `Send delay: ${email.send_delay}`,
          `Goal: ${email.goal}`,
          summary ? `Flow summary: ${summary}` : '',
          purpose ? `Flow purpose: ${purpose}` : '',
          `Direction: Write this email so it sounds like email ${email.position} in a ${flowType || 'custom'} sequence. Carry the voice of the brand. The angle is "${email.goal}".`,
          email.subject ? `Proposed subject: ${email.subject}` : '',
          email.preview_text ? `Proposed preview: ${email.preview_text}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        framework: 'Auto',
      };

      // Use the existing campaign brief prompt shape so the output format
      // matches what the rest of the app already renders.
      const prompt = buildBriefPrompt('campaign', formData, typedBrand);

      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 3500,
        system: GENERATION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      const markdown = msg.content
        .filter((b) => b.type === 'text')
        .map((b) => ('text' in b ? b.text : ''))
        .join('\n');

      return {
        ...email,
        brief_markdown: markdown,
      };
    });

    const enrichedEmails = await Promise.all(briefPromises);

    return NextResponse.json({
      trigger_description: plan.trigger_description || triggerDescription || '',
      emails: enrichedEmails,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
