import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUserRole, roleAllowedForAbTests } from '@/lib/roles';
import { SINGLE_EMAIL_VARIANT_PROMPT } from '@/lib/skills/flow-ab-test-generator';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

interface IncomingEmail {
  position: number;
  messageId: string;
  messageLabel: string | null;
  subject: string;
  previewText: string;
}

function extractJson(text: string): string | null {
  const tag = text.match(/<json>([\s\S]*?)<\/json>/);
  if (tag) return tag[1].trim();
  // fallback: take any {...} block
  const brace = text.match(/\{[\s\S]*\}/);
  return brace ? brace[0] : null;
}

export async function POST(request: NextRequest) {
  try {
    const role = await getCurrentUserRole();
    if (!roleAllowedForAbTests(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const {
      brandId,
      flowName,
      flowTriggerType,
      email,
      siblingEmails,
      hypothesis,
    } = body as {
      brandId: string;
      flowName: string;
      flowTriggerType: string;
      email: IncomingEmail;
      siblingEmails: IncomingEmail[];
      hypothesis?: string;
    };

    if (!brandId || !email?.messageId || !email?.subject) {
      return NextResponse.json(
        { error: 'brandId, flowName, and email with subject required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: brand } = await supabase
      .from('brands')
      .select('name, category, voice, rules, website')
      .eq('id', brandId)
      .single();

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    const siblingContext = (siblingEmails || [])
      .filter((e) => e.messageId !== email.messageId)
      .map(
        (e) =>
          `  Email ${e.position}: "${e.subject}" / "${e.previewText || '(empty preview)'}"`
      )
      .join('\n');

    const userPrompt = `BRAND CONTEXT
Name: ${brand.name}
Category: ${brand.category || 'unknown'}
Voice: ${brand.voice || 'unknown'}
Rules: ${brand.rules || 'none'}
Website: ${brand.website || 'unknown'}

FLOW: ${flowName} (trigger: ${flowTriggerType})

OTHER EMAILS IN THIS FLOW (for context, do not test these):
${siblingContext || '  (none)'}

THE EMAIL TO TEST (Variant A / Control):
  Position: Email ${email.position}
  Label: ${email.messageLabel || '(no label)'}
  Subject: ${email.subject}
  Preview text: ${email.previewText || '(empty)'}

${
  hypothesis
    ? `\n=== LOCKED VARIABLE (NON-NEGOTIABLE) ===
You MUST test exactly this variable and nothing else: "${hypothesis}"

This is part of a coordinated flow-wide test. Every email in this flow is testing the SAME variable. Do NOT pick a different variable even if you think another angle would perform better. Do NOT reinterpret, rename, or substitute. The "variable_tested" field in your JSON response MUST be exactly "${hypothesis}" (character for character).

Your job is to rewrite the subject + preview so they meaningfully test "${hypothesis}" against the control, while staying on-brand.\n`
    : ''
}
Produce Variant B for THIS email only. Return JSON in <json>...</json> tags.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      system: SINGLE_EMAIL_VARIANT_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const fullText = response.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('');

    const jsonStr = extractJson(fullText);
    if (!jsonStr) {
      return NextResponse.json(
        { error: 'AI did not return parseable JSON', raw: fullText.slice(0, 500) },
        { status: 500 }
      );
    }

    let parsed: {
      variant_subject?: string;
      variant_preview?: string;
      variable_tested?: string;
      hypothesis?: string;
    };
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        { error: 'AI JSON malformed', raw: jsonStr.slice(0, 500) },
        { status: 500 }
      );
    }

    if (!parsed.variant_subject) {
      return NextResponse.json({ error: 'No variant_subject in AI response' }, { status: 500 });
    }

    // If the caller locked a theme, force the variable_tested to match it
    // regardless of what the model returned.
    const finalVariable = hypothesis ? hypothesis : (parsed.variable_tested || null);

    return NextResponse.json({
      variant_subject: parsed.variant_subject,
      variant_preview: parsed.variant_preview || '',
      variable_tested: finalVariable,
      hypothesis: parsed.hypothesis || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
