import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import {
  getAccountDetails,
  getMetrics,
  getFlows,
  getSegments,
  getCampaignReport,
  getFlowReport,
  queryMetricAggregates,
} from '@/lib/klaviyo';
import { KLAVIYO_ACCOUNT_ANALYSER_SKILL } from '@/lib/skills/klaviyo-account-analyser';

// Vercel Hobby plan max.
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Pull a metric ID by name from the metrics list. Klaviyo metric data shape:
// { data: [{ id, attributes: { name, integration: { name } } }] }
interface KlaviyoMetric {
  id: string;
  attributes?: { name?: string };
}
function findMetricId(metrics: KlaviyoMetric[], name: string): string | null {
  return metrics.find((m) => m.attributes?.name === name)?.id ?? null;
}

// Wraps a promise with a timeout. On timeout returns { error }
async function safe<T>(promise: Promise<T>, label: string, ms = 15_000): Promise<T | { error: string }> {
  return Promise.race([
    promise.catch((e) => ({ error: `${label}: ${e instanceof Error ? e.message : String(e)}` })),
    new Promise<{ error: string }>((resolve) =>
      setTimeout(() => resolve({ error: `${label}: timed out after ${ms}ms` }), ms)
    ),
  ]);
}

// Stringify + truncate a section so the prompt stays small. Klaviyo data can be huge.
function stringifyTrimmed(value: unknown, maxLen = 6000): string {
  if (value === undefined || value === null) return 'null';
  const json = JSON.stringify(value);
  if (json.length <= maxLen) return json;
  return json.slice(0, maxLen) + '... (truncated)';
}

function extractBlock(text: string, tag: string): string | null {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].trim() : null;
}

// Convert ISO date strings into a Klaviyo datetime filter clause.
function dateRangeFilter(startISO: string, endISO: string): string {
  const start = new Date(startISO).toISOString();
  // bump end by one day so the range is inclusive
  const endDate = new Date(endISO);
  endDate.setDate(endDate.getDate() + 1);
  const end = endDate.toISOString();
  return `greater-or-equal(datetime,${start}),less-than(datetime,${end})`;
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

    const apiKey = brand.klaviyo_api_key;

    // ─── PHASE 1: account details + metrics (need these before anything else) ───
    const [accountRes, metricsRes] = await Promise.all([
      safe(getAccountDetails(apiKey), 'get_account_details'),
      safe(getMetrics(apiKey), 'get_metrics'),
    ]);

    const metrics = (metricsRes as { data?: KlaviyoMetric[] })?.data || [];
    const placedOrderId = findMetricId(metrics, 'Placed Order');
    const openedEmailId = findMetricId(metrics, 'Opened Email');
    const bouncedId = findMetricId(metrics, 'Bounced Email');
    const spamId = findMetricId(metrics, 'Marked Email as Spam');
    const receivedId = findMetricId(metrics, 'Received Email');
    const subscribedId = findMetricId(metrics, 'Subscribed to List');

    if (!placedOrderId) {
      return NextResponse.json(
        { error: 'Could not find "Placed Order" metric in this Klaviyo account. Confirm the brand has e-commerce tracking set up.' },
        { status: 500 }
      );
    }

    // ─── PHASE 2: parallel data fetch — essentials only to fit the timeout ───
    const dateFilter = dateRangeFilter(startDate, endDate);
    const reportStats = [
      'open_rate',
      'click_rate',
      'click_to_open_rate',
      'bounce_rate',
      'unsubscribe_rate',
      'recipients',
      'delivered',
      'conversion_rate',
      'conversions',
    ];
    const reportValueStats = ['conversion_value', 'revenue_per_recipient', 'average_order_value'];

    const [
      flowsRes,
      segmentsRes,
      campaignReportRes,
      flowReportRes,
      revenueByFlowRes,
      revenueTotalRes,
    ] = await Promise.all([
      safe(getFlows(apiKey), 'get_flows'),
      safe(getSegments(apiKey), 'get_segments'),
      safe(
        getCampaignReport(apiKey, {
          conversionMetricId: placedOrderId,
          statistics: reportStats,
          valueStatistics: reportValueStats,
          timeframe: { start: new Date(startDate).toISOString(), end: new Date(endDate).toISOString() },
        }),
        'get_campaign_report'
      ),
      safe(
        getFlowReport(apiKey, {
          conversionMetricId: placedOrderId,
          statistics: reportStats,
          valueStatistics: reportValueStats,
          timeframe: { start: new Date(startDate).toISOString(), end: new Date(endDate).toISOString() },
        }),
        'get_flow_report'
      ),
      safe(
        queryMetricAggregates(apiKey, {
          metric_id: placedOrderId,
          measurements: ['sum_value', 'count'],
          interval: 'month',
          filter: dateFilter,
          group_by: ['$attributed_flow'],
        }),
        'revenue_by_flow'
      ),
      safe(
        queryMetricAggregates(apiKey, {
          metric_id: placedOrderId,
          measurements: ['sum_value', 'count', 'unique'],
          interval: 'month',
          filter: dateFilter,
        }),
        'revenue_total'
      ),
    ]);
    // unused metric IDs swallowed to avoid lint warnings
    void openedEmailId;
    void bouncedId;
    void spamId;
    void receivedId;
    void subscribedId;

    // ─── PHASE 3: bundle into a structured JSON payload for Claude ───
    // Each section is trimmed individually so we keep useful data from every
    // section instead of one giant blob that gets cut off mid-section.
    const payloadJson = `{
  "brand": ${JSON.stringify({ name: brand.name, category: brand.category || 'unknown', voice: brand.voice || 'unknown' })},
  "period": ${JSON.stringify({ start: startDate, end: endDate })},
  "account": ${stringifyTrimmed(accountRes, 1500)},
  "flows": ${stringifyTrimmed(flowsRes, 8000)},
  "segments": ${stringifyTrimmed(segmentsRes, 5000)},
  "campaign_report": ${stringifyTrimmed(campaignReportRes, 12000)},
  "flow_report": ${stringifyTrimmed(flowReportRes, 12000)},
  "revenue_by_flow": ${stringifyTrimmed(revenueByFlowRes, 4000)},
  "revenue_total": ${stringifyTrimmed(revenueTotalRes, 2000)}
}`;

    // ─── PHASE 4: ONE Claude call to analyse + format ───
    const userPrompt = `Build a performance report for ${brand.name}.

Period: ${startDate} to ${endDate}
Brand category: ${brand.category || 'unknown'}
Brand voice: ${brand.voice || 'unknown'}

What the AM wants:
${prompt || '(no specific request — produce a Full Account Sweep)'}

The Klaviyo data has already been pulled and is included below as JSON. SKIP the Data Collection Playbook section of your skill — you do not have access to tools, the data is already here. Go straight to the analysis framework using this data.

If a section of the JSON contains an "error" field, that data could not be pulled — note it in the report and work with what is available.

Return ONLY the markdown report inside <markdown>...</markdown> tags. Nothing outside the tags.

\`\`\`json
${payloadJson}
\`\`\`
`;

    // Use Haiku 4.5 for the analysis call. Much faster than Sonnet and the
    // analysis work fits comfortably in its capabilities given the structured
    // payload we hand it.
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 6000,
      system: KLAVIYO_ACCOUNT_ANALYSER_SKILL,
      messages: [{ role: 'user', content: userPrompt }],
    });

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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
