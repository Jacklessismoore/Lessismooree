import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { executeKlaviyoTool } from '@/lib/klaviyo';
import { KLAVIYO_ACCOUNT_ANALYSER_SKILL } from '@/lib/skills/klaviyo-account-analyser';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Tool catalog wired to the klaviyo-account-analyser skill. Tool names match
// what the skill references; executeKlaviyoTool dispatches them.
const KLAVIYO_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_account_details',
    description:
      'Get the Klaviyo account details including account name and timezone. ALWAYS call this first so you have the timezone for downstream date queries.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_metrics',
    description:
      'Get all available metrics in the account. Returns metric IDs you will need for query_metric_aggregates. Common metrics: Received Email, Opened Email, Clicked Email, Bounced Email, Marked Email as Spam, Unsubscribed, Placed Order, Started Checkout, Added to Cart, Viewed Product, Subscribed to List.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_flows',
    description: 'Get all automated flows. Returns names, statuses (live/draft/manual/paused), trigger types, dates.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_lists',
    description: 'Get all lists with profile counts.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_segments',
    description:
      'Get all segments with their definitions, active status, and updated dates. Use this to find engaged / suppress / VIP segments.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_campaigns',
    description:
      'Get a flat list of campaigns with statuses and send times. Use get_campaign_report instead when you need performance data.',
    input_schema: {
      type: 'object' as const,
      properties: { filter: { type: 'string' } },
      required: [],
    },
  },
  {
    name: 'get_campaign_report',
    description:
      'Run a Klaviyo Reporting API campaign-values report. Returns aggregated campaign performance for the timeframe (open_rate, click_rate, conversion_rate, revenue, etc). ALWAYS call get_metrics first to get the conversionMetricId for Placed Order.',
    input_schema: {
      type: 'object' as const,
      properties: {
        conversionMetricId: { type: 'string' },
        statistics: { type: 'array', items: { type: 'string' } },
        valueStatistics: { type: 'array', items: { type: 'string' } },
        timeframe: {
          type: 'object',
          description:
            'Either { "key": "last_30_days" | "last_3_months" | "last_12_months" | "yesterday" | etc } or { "start": "ISO", "end": "ISO" }',
        },
        filter: { type: 'string' },
        groupBy: { type: 'array', items: { type: 'string' } },
      },
      required: ['conversionMetricId', 'statistics'],
    },
  },
  {
    name: 'get_flow_report',
    description:
      'Run a Klaviyo Reporting API flow-values report. Same shape as get_campaign_report but for flows. ALWAYS call get_metrics first for the conversionMetricId.',
    input_schema: {
      type: 'object' as const,
      properties: {
        conversionMetricId: { type: 'string' },
        statistics: { type: 'array', items: { type: 'string' } },
        valueStatistics: { type: 'array', items: { type: 'string' } },
        timeframe: { type: 'object' },
        filter: { type: 'string' },
        groupBy: { type: 'array', items: { type: 'string' } },
      },
      required: ['conversionMetricId', 'statistics'],
    },
  },
  {
    name: 'query_metric_aggregates',
    description:
      'Query aggregated metric data over a time range. You MUST call get_metrics first to find the metric_id. Filter requires a datetime range, e.g. greater-or-equal(datetime,2024-04-01T00:00:00Z),less-than(datetime,2024-04-08T00:00:00Z). Use group_by to break down by $attributed_flow, $attributed_message, Campaign Name, Subject, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        metric_id: { type: 'string' },
        measurements: { type: 'array', items: { type: 'string' } },
        interval: { type: 'string' },
        filter: { type: 'string' },
        group_by: { type: 'array', items: { type: 'string' } },
      },
      required: ['metric_id', 'measurements', 'filter'],
    },
  },
];

interface KlaviyoToolResult {
  data?: unknown;
  error?: string;
}

async function timeoutPromise<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

function extractBlock(text: string, tag: string): string | null {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].trim() : null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { brandId, prompt, startDate, endDate } = (await request.json()) as {
      brandId: string;
      prompt: string;
      startDate: string;
      endDate: string;
    };

    if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 });

    const { data: brand } = await supabase
      .from('brands')
      .select('id, name, klaviyo_api_key, category, voice')
      .eq('id', brandId)
      .single();

    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    if (!brand.klaviyo_api_key) {
      return NextResponse.json(
        { error: 'This brand has no Klaviyo API key configured. Add one on the client page first.' },
        { status: 400 }
      );
    }

    const klaviyoApiKey = brand.klaviyo_api_key;

    const userPrompt = `Build a performance report for ${brand.name}.

Period: ${startDate} to ${endDate}
Brand category: ${brand.category || 'unknown'}
Brand voice: ${brand.voice || 'unknown'}

What the AM wants:
${prompt || '(no specific request — run a Full Account Sweep using the playbook)'}

Follow the data collection playbook in your skill instructions. Pull real data from Klaviyo via the available tools. When done, return the markdown report inside <markdown>...</markdown> tags. Nothing outside the tags.`;

    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }];

    // Agentic loop. The full sweep can require ~20 tool calls so allow more iterations.
    for (let iter = 0; iter < 30; iter += 1) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 8000,
        system: KLAVIYO_ACCOUNT_ANALYSER_SKILL,
        tools: KLAVIYO_TOOLS,
        messages,
      });

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ContentBlock & { type: 'tool_use' } => b.type === 'tool_use'
      );

      if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
        const fullText = response.content
          .filter((b) => b.type === 'text')
          .map((b) => ('text' in b ? b.text : ''))
          .join('');
        const markdown = extractBlock(fullText, 'markdown');
        if (!markdown) {
          return NextResponse.json(
            { error: 'AI did not return a <markdown> block', raw: fullText.slice(0, 1500) },
            { status: 500 }
          );
        }
        return NextResponse.json({
          brand: { id: brand.id, name: brand.name },
          markdown,
          startDate,
          endDate,
          prompt,
        });
      }

      // Run tools
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        try {
          const result = (await timeoutPromise(
            executeKlaviyoTool(klaviyoApiKey, block.name, block.input as Record<string, unknown>),
            25_000
          )) as KlaviyoToolResult | null;
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result ?? { error: 'Request timed out' }).slice(0, 80_000),
          });
        } catch (err) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          });
        }
      }

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
    }

    return NextResponse.json({ error: 'Exceeded tool-use loop limit' }, { status: 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
