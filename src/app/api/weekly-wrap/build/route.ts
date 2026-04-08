import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import {
  getMetrics,
  getCampaignReport,
  getFlowReport,
  getCampaigns,
  getFlows,
} from '@/lib/klaviyo';
import { CLIENT_PERFORMANCE_REPORT_SKILL } from '@/lib/skills/client-performance-report';

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

type Period = '7d' | '14d' | '30d' | '90d';

const PERIOD_CONFIG: Record<Period, { days: number; key: string; label: string }> = {
  '7d': { days: 7, key: 'last_7_days', label: 'Last 7 days' },
  '14d': { days: 14, key: 'last_30_days', label: 'Last 14 days' }, // Klaviyo has no last_14_days; we'll filter client-side via date
  '30d': { days: 30, key: 'last_30_days', label: 'Last 30 days' },
  '90d': { days: 90, key: 'last_90_days', label: 'Last 90 days' },
};

interface KlaviyoMetric {
  id: string;
  attributes?: { name?: string };
}

interface KlaviyoCampaign {
  id: string;
  attributes?: {
    name?: string;
    status?: string;
    send_time?: string | null;
    archived?: boolean;
  };
}

interface KlaviyoFlow {
  id: string;
  attributes?: {
    name?: string;
    status?: string;
    archived?: boolean;
    trigger_type?: string;
  };
}

function findMetricId(metrics: KlaviyoMetric[], name: string): string | null {
  return metrics.find((m) => m.attributes?.name === name)?.id ?? null;
}

async function safe<T>(promise: Promise<T>, label: string, ms = 25_000): Promise<T | { error: string }> {
  return Promise.race([
    promise.catch((e) => ({ error: `${label}: ${e instanceof Error ? e.message : String(e)}` })),
    new Promise<{ error: string }>((resolve) =>
      setTimeout(() => resolve({ error: `${label}: timed out after ${ms}ms` }), ms)
    ),
  ]);
}

function stringifyTrimmed(value: unknown, maxLen = 8000): string {
  if (value === undefined || value === null) return 'null';
  const json = JSON.stringify(value);
  if (json.length <= maxLen) return json;
  return json.slice(0, maxLen) + '... (truncated)';
}

function extractBlock(text: string, tag: string): string | null {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].trim() : null;
}

// Build a compact id -> name lookup table from a Klaviyo collection response
function buildCampaignLookup(res: unknown): Record<string, { name: string; sent_at: string | null; status: string }> {
  const out: Record<string, { name: string; sent_at: string | null; status: string }> = {};
  if (!res || typeof res !== 'object') return out;
  const data = (res as { data?: KlaviyoCampaign[] }).data;
  if (!Array.isArray(data)) return out;
  for (const c of data) {
    if (!c?.id) continue;
    out[c.id] = {
      name: c.attributes?.name || '(untitled campaign)',
      sent_at: c.attributes?.send_time || null,
      status: c.attributes?.status || 'unknown',
    };
  }
  return out;
}

function buildFlowLookup(res: unknown): Record<string, { name: string; trigger: string; status: string }> {
  const out: Record<string, { name: string; trigger: string; status: string }> = {};
  if (!res || typeof res !== 'object') return out;
  const data = (res as { data?: KlaviyoFlow[] }).data;
  if (!Array.isArray(data)) return out;
  for (const f of data) {
    if (!f?.id) continue;
    out[f.id] = {
      name: f.attributes?.name || '(untitled flow)',
      trigger: f.attributes?.trigger_type || 'unknown',
      status: f.attributes?.status || 'unknown',
    };
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { brandId, period } = (await request.json()) as {
      brandId: string;
      period: Period;
    };

    if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 });
    if (!PERIOD_CONFIG[period]) {
      return NextResponse.json(
        { error: `period must be one of: ${Object.keys(PERIOD_CONFIG).join(', ')}` },
        { status: 400 }
      );
    }

    const { data: brand } = await supabase
      .from('brands')
      .select('id, name, klaviyo_api_key, category, voice')
      .eq('id', brandId)
      .single();

    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    if (!brand.klaviyo_api_key) {
      return NextResponse.json(
        { error: 'This brand has no Klaviyo API key configured.' },
        { status: 400 }
      );
    }

    const apiKey = brand.klaviyo_api_key;
    const periodConfig = PERIOD_CONFIG[period];
    const timeframeKey = periodConfig.key;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - periodConfig.days);
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    // Get Placed Order metric ID
    const metricsRes = await safe(getMetrics(apiKey), 'get_metrics');
    const metrics = (metricsRes as { data?: KlaviyoMetric[] })?.data || [];
    const placedOrderId = findMetricId(metrics, 'Placed Order');

    if (!placedOrderId) {
      return NextResponse.json(
        { error: 'Could not find "Placed Order" metric in this Klaviyo account.' },
        { status: 500 }
      );
    }

    const reportStats = [
      'recipients',
      'delivered',
      'open_rate',
      'click_rate',
      'click_to_open_rate',
      'conversion_rate',
      'conversions',
      'conversion_value',
      'revenue_per_recipient',
      'average_order_value',
      'bounce_rate',
      'unsubscribe_rate',
    ];

    // Pull reports + name lookups in parallel.
    // Campaigns: filter to ones sent within the period so we get a clean lookup table.
    // Flows: get all live + recent so we can resolve flow_id -> name.
    const campaignSendFilter = `and(equals(messages.channel,"email"),greater-or-equal(send_time,${startISO}))`;
    const [campaignReportRes, flowReportRes, campaignsListRes, flowsListRes] = await Promise.all([
      safe(
        getCampaignReport(apiKey, {
          conversionMetricId: placedOrderId,
          statistics: reportStats,
          timeframe: { key: timeframeKey },
          filter: 'equals(send_channel,"email")',
        }),
        'get_campaign_report'
      ),
      safe(
        getFlowReport(apiKey, {
          conversionMetricId: placedOrderId,
          statistics: reportStats,
          timeframe: { key: timeframeKey },
        }),
        'get_flow_report'
      ),
      safe(getCampaigns(apiKey, campaignSendFilter), 'get_campaigns_list'),
      safe(getFlows(apiKey), 'get_flows_list'),
    ]);

    // Surface any retrieval failures so the user can see them in the UI
    const campaignErr = (campaignReportRes as { error?: string })?.error;
    const flowErr = (flowReportRes as { error?: string })?.error;
    if (campaignErr && flowErr) {
      return NextResponse.json(
        {
          error: `Klaviyo data fetch failed. campaign: ${campaignErr}. flow: ${flowErr}`,
        },
        { status: 502 }
      );
    }

    // Build name lookups so the AI can resolve campaign_id / flow_id to real names.
    const campaignLookup = buildCampaignLookup(campaignsListRes);
    const flowLookup = buildFlowLookup(flowsListRes);

    const periodLabel = periodConfig.label;

    const payloadJson = `{
  "brand": ${JSON.stringify({ name: brand.name, category: brand.category || 'unknown', voice: brand.voice || 'unknown' })},
  "period_label": ${JSON.stringify(periodLabel)},
  "period": ${JSON.stringify({ start: startISO, end: endISO })},
  "campaign_name_lookup": ${stringifyTrimmed(campaignLookup, 6000)},
  "flow_name_lookup": ${stringifyTrimmed(flowLookup, 4000)},
  "campaign_report": ${stringifyTrimmed(campaignReportRes, 14000)},
  "flow_report": ${stringifyTrimmed(flowReportRes, 14000)}
}`;

    const userPrompt = `Build a Weekly Wrap performance report for ${brand.name} covering ${periodLabel}.

This is a recurring client check-in. The output must be ready to copy-paste into Slack — no markdown headings, no code blocks, just the formatted report exactly as the skill template specifies.

=== HARD RULES (NON-NEGOTIABLE) ===
1. NEVER output a raw campaign_id, campaign_message_id, or flow_id in the report. The client must never see strings like "01KKF04FCCK6WC3KN7FR1A122Z" or "ABCD1234".
2. ALWAYS resolve IDs to human names using campaign_name_lookup and flow_name_lookup before writing the report. Look up campaign_id in campaign_name_lookup to get the campaign name. Look up flow_id in flow_name_lookup to get the flow name.
3. If an ID has no entry in the lookup table, refer to it generically (e.g. "a campaign sent on March 14") using send_time from the report data — NEVER output the ID itself.
4. Every metric in the report must be calculated from the JSON data. Do NOT invent revenue figures, click rates, or recipient counts.
5. If a metric is missing or zero across all campaigns, say so honestly. Do not pad with fake numbers.
6. Be conservative — if a calculation requires summing across many rows and you are not confident, present the metric you DO have rather than a guessed total.
7. Format rates to 1 decimal place. Format currency with $ and commas (e.g. $12,340).
8. No em dashes. No raw IDs. No fabricated data.

Return ONLY the report inside <report>...</report> tags.

=== KLAVIYO DATA ===
\`\`\`json
${payloadJson}
\`\`\`
`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 6000,
      system: CLIENT_PERFORMANCE_REPORT_SKILL,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const fullText = response.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('');

    const report = extractBlock(fullText, 'report');
    if (!report) {
      return NextResponse.json(
        { error: 'AI did not return a <report> block', raw: fullText.slice(0, 1500) },
        { status: 500 }
      );
    }

    return NextResponse.json({
      brand: { id: brand.id, name: brand.name },
      period,
      periodLabel,
      report,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
