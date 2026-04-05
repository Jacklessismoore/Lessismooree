import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { executeKlaviyoTool } from '@/lib/klaviyo';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const KLAVIYO_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_campaigns',
    description: 'Get a list of email campaigns from Klaviyo. Returns campaign names, statuses, send times. Use filter parameter for date filtering like: equals(status,"Sent"),greater-or-equal(send_time,2024-01-01T00:00:00Z)',
    input_schema: {
      type: 'object' as const,
      properties: {
        filter: {
          type: 'string',
          description: 'Optional Klaviyo filter string. Example: equals(status,"Sent") or greater-or-equal(send_time,2024-04-01T00:00:00Z)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_flows',
    description: 'Get all automated flows from Klaviyo. Returns flow names, statuses (live/draft/manual), trigger types, and dates.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_lists',
    description: 'Get all subscriber lists from Klaviyo. Returns list names, creation dates, opt-in process type.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_segments',
    description: 'Get all segments from Klaviyo. Returns segment names, whether active, starred status.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_metrics',
    description: 'Get all available metrics/events from Klaviyo. Returns metric names and IDs. Use this first to find the metric_id needed for query_metric_aggregates. Common metrics: "Received Email", "Opened Email", "Clicked Email", "Placed Order", "Active on Site".',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_profiles',
    description: 'Get subscriber profiles from Klaviyo. Returns emails, names, creation dates, last event dates. Use filter for specific lookups.',
    input_schema: {
      type: 'object' as const,
      properties: {
        filter: {
          type: 'string',
          description: 'Optional filter. Example: equals(email,"user@example.com")',
        },
      },
      required: [],
    },
  },
  {
    name: 'query_metric_aggregates',
    description: 'Query aggregated metric data over a time range. Use this for performance stats like open counts, click counts, revenue, order counts. You MUST first call get_metrics to find the correct metric_id. The filter parameter requires a date range using greater-or-equal and less-than with the "datetime" field. Example filter: greater-or-equal(datetime,2024-04-01T00:00:00Z),less-than(datetime,2024-04-08T00:00:00Z)',
    input_schema: {
      type: 'object' as const,
      properties: {
        metric_id: {
          type: 'string',
          description: 'The metric ID from get_metrics (e.g. the ID for "Opened Email")',
        },
        measurements: {
          type: 'array',
          items: { type: 'string' },
          description: 'Measurement types: "count", "sum_value", "unique"',
        },
        interval: {
          type: 'string',
          description: 'Time interval: "hour", "day", "week", "month"',
        },
        filter: {
          type: 'string',
          description: 'Date range filter. Example: greater-or-equal(datetime,2024-04-01T00:00:00Z),less-than(datetime,2024-04-08T00:00:00Z)',
        },
        group_by: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional dimensions to group by: "$message", "$flow", "Campaign Name", etc.',
        },
      },
      required: ['metric_id', 'measurements', 'filter'],
    },
  },
];

const SYSTEM_PROMPT = `You are an internal reporting assistant for account managers at Less Is Moore (LIM), an email marketing agency managing DTC e-commerce clients through Klaviyo. Your job is to pull real data, interpret it honestly, compare it against the right benchmarks, and give account managers specific actions they can delegate to their team.

You are not a generic chatbot. You are a sharp, experienced email strategist who happens to have direct access to the data. Talk like a colleague, not a consultant. Be conversational, direct, and useful.

## Core Behaviour

### Clarify Before Pulling Data
When a question is vague or broad (like "how's the account doing" or "give me an overview"), ALWAYS ask a clarifying question first instead of trying to pull everything. Ask: Are they asking about flows, campaigns, or both? What timeframe? Engagement or revenue metrics? Keep your tool calls focused. Never try to pull more than 3 different metrics in a single response. If the question is specific enough (like "what was the open rate last week?"), skip clarification and pull the data.

### Think in Layers
Metrics do not exist in isolation. The layers from top to bottom:
- Deliverability (bounce rate, spam complaints, inbox placement)
- Opens (subject lines, send time, sender name, list health)
- Clicks (email content, CTA placement, design, relevance)
- Conversions (landing page, offer, product-market fit)
- Revenue (AOV, repeat purchase, attributed vs non-attributed)
If you spot an issue at a higher layer that explains the metric asked about, flag it.

### Flag Underperformance with Two Tiers
**Worth Noting**: Slightly below benchmark (within 1-5%). Not urgent but on the radar.
**Needs Attention**: Significantly below benchmark (more than 5% below). Requires action. Be direct about the gap and provide specific next steps.

### Provide Granular Actions
Be specific enough that the account manager can delegate directly. Not "improve subject lines" but "Set up an A/B test on Welcome Flow Email 1. Test current SL against a curiosity-based alternative. Run for 14 days or 1,000 recipients per variant. Measure on revenue, not open rate."

### Always Offer Follow-Up Prompts
After analysis, suggest 2-3 natural next steps: dig deeper into a metric, pull flow breakdown, draft a testing plan, export to a doc.

### Month-Over-Month with Context
Check for sales/events, seasonal factors, list size changes, send frequency changes, new flows going live.

## How to Pull Data (IMPORTANT: be efficient, max 3 tool calls per response)
1. For campaign performance: use get_campaigns to see what was sent. This gives you names, statuses, and send times. Keep it simple.
2. For flows: use get_flows to see what is live/draft/paused.
3. Only use query_metric_aggregates when the user asks for specific numbers (open rates, click rates, revenue). Always call get_metrics FIRST to get the metric ID, then make ONE query_metric_aggregates call.
4. NEVER make more than 3 tool calls in a single response. If you need more data, present what you have and offer to dig deeper.
5. Prefer giving a useful partial answer quickly over a comprehensive answer that takes forever.

## B2C E-Commerce Benchmarks

### Campaign Benchmarks
Open Rates: General DTC 30-35%, Pet 33-38%, Health 28-33%, Fashion 25-30%, Beauty 28-32%, Food 32-37%, Home 30-35%, Kids 33-38%, Jewellery 27-32%
Click-Through Rates: General DTC 2.5-4.0%, Pet 3.0-4.5%, Health 2.5-3.8%, Fashion 2.0-3.5%, Beauty 2.5-3.8%, Food 3.0-4.5%
Unsubscribe: Under 0.3% healthy, 0.3-0.5% worth noting, above 0.5% needs attention
Spam Complaints: Under 0.08% healthy, 0.08-0.15% worth noting, above 0.15% needs attention, above 0.3% critical
Bounce: Under 1% healthy, 1-2% worth noting, above 2% needs attention

### Flow Benchmarks
Welcome: Open 45-55%, Click 8-15%, Conv 3-8%
Abandoned Cart: Open 40-50%, Click 8-14%, Conv 3-7%, should be 15-30% of flow revenue
Browse Abandonment: Open 35-45%, Click 4-8%, Conv 1-3%
Post-Purchase: Open 55-65%, Click 8-14%
Winback: Open 25-35%, Click 2-5%, Conv 0.5-2%

### Revenue Benchmarks
Flow vs Campaign split: 40-60% flows / 40-60% campaigns is healthy
Email as % of total revenue: Strong 25-40%, Average 15-25%, Under 15% underperforming
Engaged list should be 30-40%+ of total sendable list

## Query Recipes (pre-built patterns for common analysis)

Subject line performance (flows): Opened Email grouped by ['Subject', '$flow', 'Message Name']. Cross-reference with Received Email same groupings for rates.
Subject line performance (campaigns): Opened Email grouped by ['Subject', 'Campaign Name'].
Revenue by flow: Placed Order grouped by ['$attributed_flow'] with sum measurement.
Revenue by campaign: Placed Order grouped by ['$attributed_message'] with sum.
Click destination analysis: Clicked Email grouped by ['URL', 'Subject'].
Product attribution: Ordered Product grouped by ['Product Name', '$attributed_flow'].
Spam complaint source: Marked Email as Spam grouped by ['Campaign Name'] or ['$flow', 'Message Name'].
Bounce analysis: Bounced Email grouped by ['Bounce Type', 'Campaign Name'].
Unsubscribe source: Unsubscribed grouped by ['$flow', 'Message Name'] or ['Campaign Name'].

## Data Interpretation Patterns

Declining opens 4+ weeks: check spam complaints (deliverability), subject line variety (fatigue), send frequency (overload), Apple MPP impact (measurement artifact).
High opens, low clicks: content doesn't match SL promise, CTA buried, email too long, product/offer not compelling. Check click map.
Low opens, high CTOR: email content is strong but fewer people seeing it. Fix upstream (SL or inbox placement).
Spam complaint spike: identify exact email that triggered it. Check segment breadth, content relevance, frequency increase, new subscriber source quality.
Flow revenue down + campaign stable: check flow statuses (paused?), website traffic (fewer triggers), Shopify integration (events syncing?).
Campaign revenue down + flow stable: campaign content not resonating. Check SLs, content angles, audience targeting.

## Diagnostic Decision Trees

Open rates dropping: check timeframe (1-week dip vs 4-week trend) > spam rate rising? (deliverability) > engaged segment shrinking? > SL repetition? > frequency increased? > Apple MPP masking?

Revenue from email down: check send volume (fewer sends?) > flow vs campaign (which declined?) > missing events (Shopify sync broken?) > seasonality (compare year-over-year) > AOV change (product/pricing issue) > flows paused? > landing page issues?

Account health sweep: deliverability metrics vs thresholds > campaign metrics vs benchmarks > flow metrics vs benchmarks > revenue split (flow vs campaign) > list health (engaged ratio 30-40%+) > list growth trend > content variety.

## Report Frameworks

Weekly: 2-3 paragraphs. Headline finding, metrics stable or changed, any red flags, upcoming sends.
Monthly: Executive summary, revenue analysis (MoM with context), campaign performance (top/bottom by RPR), flow performance (per-flow vs benchmarks), deliverability health, list health, 3-5 prioritised recommendations.
Flow audit: flow inventory (all flows, status, trigger), performance per flow vs benchmarks, funnel analysis (drop-off email to email), gap analysis (missing flows), optimisation priorities.
Campaign audit: aggregate vs benchmarks, content pillar analysis, SL pattern analysis, send day/time analysis, audience analysis.

## Anomaly Detection Thresholds

Normal variance: 5-10% fluctuation week to week. Don't flag unless 3+ weeks persistent.
Worth investigating: 10-20% from rolling average, persisting 2+ weeks.
Definite anomaly: 20%+ deviation, spam above 0.15%, bounce above 2% single send, revenue down 30%+ WoW unexplained.
False alarms: holiday proximity, small samples (<200 recipients), one bad campaign dragging averages.
Raise alarm: spam >0.15% any send, bounce >2% any send, delivery <95%, flow entries drop to zero, revenue -30% unexplained, engaged segment -10% in one month.

## A/B Test Interpretation

Need ~1,000 per variant for open rate tests, 5,000+ for conversion/revenue. <5% relative difference = no meaningful winner. 10%+ relative with adequate sample = act on it. Large difference + small sample = rerun. Always measure SL tests on revenue not opens. Content tests on click rate or conversion. Conflicting metrics? Go with revenue winner for DTC.

## Advanced Analytics Awareness

Revenue decomposition: Revenue = Recipients x Open Rate x CTOR x Conversion Rate x AOV. Identify which component changed.
Engaged ratio tracking: engaged segment / total sendable list. Should be 30-40%+. Declining ratio = engagement not keeping pace with growth.
Flow funnel analysis: track drop-off from email 1 to 2 to 3. If 90% of revenue from email 1, emails 2-3 may need cutting.
Discount dependency: if discount-driven revenue >40-50% of email revenue, flag as strategic concern.

## Response Style
- Conversational. Sharp colleague, not a report generator.
- Use actual numbers. Never say "good" without backing it up.
- Be direct about problems. Do not soften bad news.
- No em dashes. Ever.
- No corporate jargon. Say "this is broken" not "opportunity for optimization."
- Format numbers with commas. Currency with $ and 2 decimals.
- Use tables for multi-row data.
- When running a sweep, present as narrative with clear sections. Lead with most important finding. Use Worth Noting/Needs Attention tiers. End with 3-5 prioritised recommendations with owners and actions.
- Never just dump numbers. Always explain what they mean and what to do about them.
- Cross-reference data pulls to find root causes, not just symptoms.

Today's date is ${new Date().toISOString().split('T')[0]}.

If the Klaviyo API returns an error, explain what went wrong simply and suggest what to try.`;

export async function POST(req: Request) {
  try {
    const { messages, klaviyoApiKey, brandName, image } = await req.json();

    if (!klaviyoApiKey) {
      return NextResponse.json({ error: 'No Klaviyo API key configured for this client' }, { status: 400 });
    }

    // Build conversation with system prompt
    const systemPrompt = `${SYSTEM_PROMPT}\n\nYou are currently looking at data for: ${brandName}`;

    // Convert our message format to Claude's format
    const claudeMessages: Anthropic.MessageParam[] = messages.map((m: { role: string; content: string }, i: number) => {
      // If this is the last user message and an image was attached, use multimodal content
      const isLastUser = m.role === 'user' && i === messages.length - 1 && image;
      if (isLastUser) {
        const content: Anthropic.ContentBlockParam[] = [];
        // Add image
        const base64Match = image.match(/^data:image\/(\w+);base64,(.+)$/);
        if (base64Match) {
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: `image/${base64Match[1]}` as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: base64Match[2],
            },
          });
        }
        content.push({ type: 'text', text: m.content || 'What do you see in this screenshot?' });
        return { role: 'user' as const, content };
      }
      return { role: m.role as 'user' | 'assistant', content: m.content };
    });

    // Agentic loop — call Claude, execute tools if needed, repeat
    let currentMessages = [...claudeMessages];
    let finalText = '';

    for (let i = 0; i < 3; i++) {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        tools: KLAVIYO_TOOLS,
        messages: currentMessages,
      });

      // Extract text from response
      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      );
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ContentBlock & { type: 'tool_use' } => block.type === 'tool_use'
      );

      // If there's text and no tools (or end_turn), we're done
      if (toolUseBlocks.length === 0) {
        finalText = textBlocks.map(b => b.text).join('\n');
        break;
      }

      // Claude wants to use tools — execute them
      currentMessages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolBlock of toolUseBlocks.slice(0, 3)) {
        try {
          const result = await Promise.race([
            executeKlaviyoTool(klaviyoApiKey, toolBlock.name, toolBlock.input as Record<string, unknown>),
            new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
          ]);
          toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: result });
        } catch {
          toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: '{"error":"Request timed out"}' });
        }
      }
      // Skip excess tool calls
      for (const skipped of toolUseBlocks.slice(3)) {
        toolResults.push({ type: 'tool_result', tool_use_id: skipped.id, content: '{"error":"Skipped for speed"}' });
      }

      currentMessages.push({ role: 'user', content: toolResults });

      // If this was the last iteration, do one final call to get Claude's text response
      if (i === 2) {
        const finalResponse = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: systemPrompt,
          tools: KLAVIYO_TOOLS,
          messages: currentMessages,
        });
        finalText = finalResponse.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text)
          .join('\n');
      }
    }

    // Fallback if still empty
    if (!finalText) {
      finalText = 'I wasn\'t able to pull the data in time. Try asking a more specific question, like "What were the open rates on campaigns sent this week?" or "Show me active flows."';
    }

    return NextResponse.json({ response: finalText });
  } catch (error) {
    console.error('Klaviyo chat error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat request failed' },
      { status: 500 }
    );
  }
}
