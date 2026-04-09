import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { buildBriefPrompt, buildStrategyPrompt, GENERATION_SYSTEM_PROMPT } from '@/lib/prompts';
import { BriefType, Brand, CreateFormData, BrandComment } from '@/lib/types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { type, formData, brand } = (await request.json()) as {
      type: BriefType;
      formData: CreateFormData;
      brand: Brand;
    };

    // Map variant types to base types for prompt generation
    const baseTypeMap: Record<string, BriefType> = {
      campaign_plain_text: 'plain_text',
      campaign_sms: 'sms',
      flow_plain_text: 'plain_text',
      flow_sms: 'sms',
    };
    const baseType = baseTypeMap[type] || type;

    // Fetch reference emails if selected
    let referenceContext = '';
    if (formData.selectedReferences?.length) {
      const { data: refs } = await supabase
        .from('email_references')
        .select('title, framework, industry, tags, notes')
        .in('id', formData.selectedReferences);

      if (refs && refs.length > 0) {
        referenceContext = '\n\nREFERENCE EMAILS (use these as style/structure inspiration):\n' +
          refs.map((r: { title: string; framework: string; industry: string; tags: string[]; notes: string }, i: number) =>
            `${i + 1}. "${r.title}"${r.framework ? ` (${r.framework})` : ''}${r.industry ? ` — ${r.industry}` : ''}${r.notes ? `\n   Notes: ${r.notes}` : ''}${r.tags?.length ? `\n   Strengths: ${r.tags.join(', ')}` : ''}`
          ).join('\n');
      }
    }

    // Pull recent brand comments (client call notes / meeting notes) so they
    // can shape the generated output. Cap at 20 most recent to keep the
    // prompt a sane size.
    let brandComments: BrandComment[] = [];
    try {
      const { data: commentsData } = await supabase
        .from('brand_comments')
        .select('*')
        .eq('brand_id', brand.id)
        .order('created_at', { ascending: false })
        .limit(20);
      brandComments = commentsData || [];
    } catch {
      // Non-critical — generation still works without comments
    }

    // Build prompt based on type
    const isStrategy = type === 'strategy';
    const prompt = isStrategy
      ? buildStrategyPrompt(formData, brand, brandComments)
      : buildBriefPrompt(baseType as BriefType, formData, brand, brandComments) + referenceContext;

    // Call Claude with agency knowledge system prompt
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8096,
      system: GENERATION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const output = message.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('\n');

    let calendarItems: { date: string; name: string; type: string }[] = [];

    // For strategies, parse calendar JSON and create DB records
    if (isStrategy) {
      const calendarMatch = output.match(/<calendar>\s*([\s\S]*?)\s*<\/calendar>/);
      if (calendarMatch) {
        try {
          calendarItems = JSON.parse(calendarMatch[1]);
        } catch {
          console.error('Failed to parse calendar JSON from response');
        }
      }

      if (calendarItems.length > 0) {
        // Get manager name
        let managerName = 'Unassigned';
        if (brand.manager_id) {
          const { data: manager } = await supabase
            .from('managers')
            .select('name')
            .eq('id', brand.manager_id)
            .single();
          if (manager) managerName = manager.name;
        }

        // Create strategy record
        const { data: strategy, error: stratError } = await supabase
          .from('strategies')
          .insert({
            brand_id: brand.id,
            name: formData.title || `${formData.month} ${formData.year} Strategy`,
            content: output,
            status: 'active',
          })
          .select()
          .single();

        if (stratError) throw stratError;

        // Create calendar items — unassigned (date=null) so they go to queue
        const itemsToInsert = calendarItems.map(item => ({
          strategy_id: strategy.id,
          brand_id: brand.id,
          date: null,
          suggested_date: item.date,
          name: item.name,
          type: item.type || 'designed',
          status: 'not_started' as const,
          manager_name: managerName,
        }));

        const { error: calError } = await supabase
          .from('calendar_items')
          .insert(itemsToInsert);

        if (calError) throw calError;
      }
    }

    // Save to brief history
    const { data: briefRecord, error: briefError } = await supabase
      .from('brief_history')
      .insert({
        brand_id: brand.id,
        type,
        form_data: formData,
        output,
      })
      .select('id')
      .single();

    if (briefError) console.error('Brief history insert error:', briefError);

    // For non-strategy briefs, also create a calendar item in the queue (linked to brief)
    if (!isStrategy && briefRecord) {
      let managerName = 'Unassigned';
      if (brand.manager_id) {
        const { data: manager } = await supabase
          .from('managers')
          .select('name')
          .eq('id', brand.manager_id)
          .single();
        if (manager) managerName = manager.name;
      }

      // Map brief type to descriptive email type
      const typeMap: Record<string, string> = {
        campaign: 'Campaign',
        campaign_plain_text: 'Campaign Plain Text',
        campaign_sms: 'Campaign SMS',
        flow: 'Flow',
        flow_plain_text: 'Flow Plain Text',
        flow_sms: 'Flow SMS',
        plain_text: 'Plain Text',
        sms: 'SMS',
        ab_test: 'A/B Test',
      };
      const emailType = typeMap[type] || 'designed';

      const { error: calErr } = await supabase.from('calendar_items').insert({
        brand_id: brand.id,
        brief_history_id: briefRecord.id,
        date: null,
        suggested_date: formData.sendDate || null,
        name: formData.title || 'Untitled Brief',
        type: emailType,
        status: 'not_started',
        manager_name: managerName,
        brief_content: output,
      });

      if (calErr) console.error('Calendar item insert error:', calErr);
    }

    return NextResponse.json({ output, calendarItems, briefId: briefRecord?.id || null });
  } catch (error) {
    console.error('Generate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}
