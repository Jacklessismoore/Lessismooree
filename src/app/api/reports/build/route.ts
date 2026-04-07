import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { executeKlaviyoTool } from '@/lib/klaviyo';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Reuse the same Klaviyo tool definitions as the existing klaviyo-chat route.
const KLAVIYO_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_campaigns',
    description:
      'Get email campaigns from Klaviyo. Returns campaign names, statuses, send times. Use filter for date filtering. Example: equals(status,"Sent"),greater-or-equal(send_time,2024-01-01T00:00:00Z)',
    input_schema: {
      type: 'object' as const,
      properties: { filter: { type: 'string' } },
      required: [],
    },
  },
  {
    name: 'get_flows',
    description: 'Get all automated flows from Klaviyo. Returns names, statuses, trigger types.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_metrics',
    description:
      'Get all available metrics from Klaviyo. Returns metric names + IDs. ALWAYS call this first to find the metric_id needed for query_metric_aggregates. Common metrics: "Received Email", "Opened Email", "Clicked Email", "Placed Order".',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'query_metric_aggregates',
    description:
      'Query aggregated metric data over a time range. You MUST call get_metrics first to find the metric_id. Filter requires datetime range. Example: greater-or-equal(datetime,2024-04-01T00:00:00Z),less-than(datetime,2024-04-08T00:00:00Z)',
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

const REPORT_SYSTEM_PROMPT = `You are a Klaviyo performance report builder for Less Is Moore (LIM), an email marketing agency. An account manager has asked for a report. Pull the data from Klaviyo using the available tools and produce a clean, structured report ready for the client.

## Hard rules

1. ALWAYS pull real data using the tools. Never make up numbers.
2. For metric queries, ALWAYS call get_metrics first to find the metric_id.
3. Format all percentages to one decimal place. Format revenue as currency with two decimals.
4. Be honest about what the data shows. Do not spin bad performance.
5. Never use em dashes. Use commas, full stops, or restructure the sentence.
6. The report is for the client. Talk like a strategist, not a chatbot.

## Output format

Return a markdown document with this structure. Use these EXACT delimiters so the app can render and export it.

<markdown>
# {Brand} Performance Report
**Period:** {Start} to {End}

## Summary
A 2-3 sentence headline of the period. What happened, what worked, what to watch.

## Key metrics
| Metric | Value | Notes |
| ------ | ----- | ----- |
| Emails sent | ... | ... |
| Open rate | ... | ... |
| Click rate | ... | ... |
| Revenue | ... | ... |

## Campaign performance
(Table or short list of top campaigns with key stats. Skip if not requested.)

## Flow performance
(Table or short list of top flows with key stats. Skip if not requested.)

## Insights
- Bullet 1
- Bullet 2
- Bullet 3

## Recommendations
- Action 1
- Action 2
</markdown>

Skip any section that the user did not ask for. Add sections if they asked for something not listed above. Always include the # header, **Period** line, and Summary section.

If the user's prompt is too vague to know what to include, default to a full report covering campaigns, flows, opens, clicks, and revenue for the period.
`;

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

What the AM wants:
${prompt || '(no specific request — produce a full performance report)'}

Pull real data from Klaviyo and return the markdown document inside <markdown>...</markdown> tags.`;

    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }];

    // Agentic loop
    for (let iter = 0; iter < 12; iter += 1) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 8000,
        system: REPORT_SYSTEM_PROMPT,
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
