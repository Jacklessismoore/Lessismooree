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

type Period = '7d' | '14d' | '30d' | '90d' | 'custom';

const PERIOD_CONFIG: Record<Exclude<Period, 'custom'>, { days: number; key: string; label: string }> = {
  '7d': { days: 7, key: 'last_7_days', label: 'Last 7 days' },
  '14d': { days: 14, key: 'last_30_days', label: 'Last 14 days' },
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
    // Klaviyo's revision returns camelCase; older revisions returned snake_case.
    // Read both defensively.
    send_time?: string | null;
    sendTime?: string | null;
    scheduled_at?: string | null;
    scheduledAt?: string | null;
    archived?: boolean;
  };
  relationships?: {
    'campaign-messages'?: { data?: Array<{ type: string; id: string }> };
    campaign_messages?: { data?: Array<{ type: string; id: string }> };
  };
}

interface KlaviyoIncluded {
  type: string;
  id: string;
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

// Build TWO lookup tables from a Klaviyo /campaigns response:
// 1. campaign_id -> { name, sent_at, status }
// 2. campaign_message_id -> { name, sent_at, status }   (the report rows are
//    keyed by campaign_message_id, so we need this as a fallback)
// Reads both camelCase and snake_case attribute names defensively, and walks
// the JSON:API relationships to map message ids to their parent campaign.
function buildCampaignLookup(res: unknown): {
  byCampaignId: Record<string, { name: string; sent_at: string | null; status: string }>;
  byMessageId: Record<string, { name: string; sent_at: string | null; status: string }>;
} {
  const byCampaignId: Record<string, { name: string; sent_at: string | null; status: string }> = {};
  const byMessageId: Record<string, { name: string; sent_at: string | null; status: string }> = {};
  if (!res || typeof res !== 'object') return { byCampaignId, byMessageId };
  const data = (res as { data?: KlaviyoCampaign[] }).data;
  if (!Array.isArray(data)) return { byCampaignId, byMessageId };
  for (const c of data) {
    if (!c?.id) continue;
    const attrs = c.attributes || {};
    const sentAt = attrs.send_time || attrs.sendTime || attrs.scheduled_at || attrs.scheduledAt || null;
    const entry = {
      name: attrs.name || '(untitled campaign)',
      sent_at: sentAt,
      status: attrs.status || 'unknown',
    };
    byCampaignId[c.id] = entry;

    // Walk relationships to find every campaign_message_id under this campaign
    const rel = c.relationships || {};
    const msgRefs =
      rel['campaign-messages']?.data ||
      rel.campaign_messages?.data ||
      [];
    for (const ref of msgRefs) {
      if (ref?.id) byMessageId[ref.id] = entry;
    }
  }
  return { byCampaignId, byMessageId };
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

// ─── Server-side aggregation ───
// Klaviyo report responses look like:
// { data: { type, attributes: { results: [{ groupings: {...}, statistics: {...} }] } } }
// We extract the rows, sum the totals, and pre-compute named items for the AI.

interface ReportRow {
  groupings: Record<string, string>;
  statistics: Record<string, number>;
}

function extractReportRows(res: unknown): ReportRow[] {
  if (!res || typeof res !== 'object') return [];
  const r = res as { data?: { attributes?: { results?: ReportRow[] } } };
  const rows = r?.data?.attributes?.results;
  return Array.isArray(rows) ? rows : [];
}

function num(v: unknown): number {
  if (typeof v === 'number' && isFinite(v)) return v;
  return 0;
}

function round(v: number, decimals = 2): number {
  const m = Math.pow(10, decimals);
  return Math.round(v * m) / m;
}

interface NamedItem {
  name: string;
  recipients: number;
  delivered: number;
  open_rate_pct: number;
  click_rate_pct: number;
  conversion_rate_pct: number;
  conversions: number;
  revenue: number;
  rpr: number;
  aov: number;
  bounce_rate_pct: number;
  unsub_rate_pct: number;
  sent_at?: string | null;
}

function aggregateCampaignReport(
  res: unknown,
  byCampaignId: Record<string, { name: string; sent_at: string | null; status: string }>,
  byMessageId: Record<string, { name: string; sent_at: string | null; status: string }>
): { totals: Record<string, number>; items: NamedItem[]; row_count: number } {
  const rows = extractReportRows(res);
  const items: NamedItem[] = [];
  let totalRecipients = 0;
  let totalDelivered = 0;
  let totalConversions = 0;
  let totalRevenue = 0;
  let weightedOpenRateNum = 0;
  let weightedClickRateNum = 0;
  let weightedConversionRateNum = 0;
  let openRateDenom = 0;

  for (const row of rows) {
    const stats = row.statistics || {};
    const groupings = row.groupings || {};
    const cId = groupings.campaign_id;
    const mId = groupings.campaign_message_id;
    // Try campaign_id first, then fall back to campaign_message_id which is
    // what the report actually groups by.
    const meta = (cId && byCampaignId[cId]) || (mId && byMessageId[mId]) || undefined;
    const recipients = num(stats.recipients);
    const delivered = num(stats.delivered);
    const conversions = num(stats.conversions);
    const revenue = num(stats.conversion_value);

    totalRecipients += recipients;
    totalDelivered += delivered;
    totalConversions += conversions;
    totalRevenue += revenue;
    weightedOpenRateNum += num(stats.open_rate) * delivered;
    weightedClickRateNum += num(stats.click_rate) * delivered;
    weightedConversionRateNum += num(stats.conversion_rate) * delivered;
    openRateDenom += delivered;

    items.push({
      name: meta?.name || '(name unavailable)',
      sent_at: meta?.sent_at || null,
      recipients,
      delivered,
      open_rate_pct: round(num(stats.open_rate) * 100, 1),
      click_rate_pct: round(num(stats.click_rate) * 100, 2),
      conversion_rate_pct: round(num(stats.conversion_rate) * 100, 2),
      conversions,
      revenue: round(revenue, 2),
      rpr: round(num(stats.revenue_per_recipient), 2),
      aov: round(num(stats.average_order_value), 2),
      bounce_rate_pct: round(num(stats.bounce_rate) * 100, 2),
      unsub_rate_pct: round(num(stats.unsubscribe_rate) * 100, 2),
    });
  }

  // Sort items: revenue desc, then by send time desc
  items.sort((a, b) => b.revenue - a.revenue || (b.sent_at || '').localeCompare(a.sent_at || ''));

  return {
    row_count: rows.length,
    items,
    totals: {
      campaigns_counted: rows.length,
      total_recipients: totalRecipients,
      total_delivered: totalDelivered,
      total_conversions: totalConversions,
      total_revenue: round(totalRevenue, 2),
      avg_open_rate_pct: openRateDenom > 0 ? round((weightedOpenRateNum / openRateDenom) * 100, 1) : 0,
      avg_click_rate_pct: openRateDenom > 0 ? round((weightedClickRateNum / openRateDenom) * 100, 2) : 0,
      avg_conversion_rate_pct:
        openRateDenom > 0 ? round((weightedConversionRateNum / openRateDenom) * 100, 2) : 0,
      revenue_per_recipient: totalRecipients > 0 ? round(totalRevenue / totalRecipients, 2) : 0,
      avg_order_value: totalConversions > 0 ? round(totalRevenue / totalConversions, 2) : 0,
    },
  };
}

function aggregateFlowReport(
  res: unknown,
  lookup: Record<string, { name: string; trigger: string; status: string }>
): { totals: Record<string, number>; items: NamedItem[]; row_count: number } {
  const rows = extractReportRows(res);
  const items: NamedItem[] = [];
  let totalRecipients = 0;
  let totalDelivered = 0;
  let totalConversions = 0;
  let totalRevenue = 0;
  let weightedOpenRateNum = 0;
  let weightedClickRateNum = 0;
  let weightedConversionRateNum = 0;
  let openRateDenom = 0;

  // Aggregate by flow_id (a flow may have multiple message rows)
  const byFlow: Record<string, { name: string; recipients: number; delivered: number; conversions: number; revenue: number; openNum: number; clickNum: number; convNum: number; openDenom: number; }> = {};

  for (const row of rows) {
    const stats = row.statistics || {};
    const groupings = row.groupings || {};
    const fId = groupings.flow_id;
    const meta = fId ? lookup[fId] : undefined;
    const recipients = num(stats.recipients);
    const delivered = num(stats.delivered);
    const conversions = num(stats.conversions);
    const revenue = num(stats.conversion_value);

    totalRecipients += recipients;
    totalDelivered += delivered;
    totalConversions += conversions;
    totalRevenue += revenue;
    weightedOpenRateNum += num(stats.open_rate) * delivered;
    weightedClickRateNum += num(stats.click_rate) * delivered;
    weightedConversionRateNum += num(stats.conversion_rate) * delivered;
    openRateDenom += delivered;

    if (fId) {
      if (!byFlow[fId]) {
        byFlow[fId] = {
          name: meta?.name || `(unknown flow ${fId.slice(0, 8)})`,
          recipients: 0,
          delivered: 0,
          conversions: 0,
          revenue: 0,
          openNum: 0,
          clickNum: 0,
          convNum: 0,
          openDenom: 0,
        };
      }
      const agg = byFlow[fId];
      agg.recipients += recipients;
      agg.delivered += delivered;
      agg.conversions += conversions;
      agg.revenue += revenue;
      agg.openNum += num(stats.open_rate) * delivered;
      agg.clickNum += num(stats.click_rate) * delivered;
      agg.convNum += num(stats.conversion_rate) * delivered;
      agg.openDenom += delivered;
    }
  }

  for (const agg of Object.values(byFlow)) {
    items.push({
      name: agg.name,
      recipients: agg.recipients,
      delivered: agg.delivered,
      open_rate_pct: agg.openDenom > 0 ? round((agg.openNum / agg.openDenom) * 100, 1) : 0,
      click_rate_pct: agg.openDenom > 0 ? round((agg.clickNum / agg.openDenom) * 100, 2) : 0,
      conversion_rate_pct: agg.openDenom > 0 ? round((agg.convNum / agg.openDenom) * 100, 2) : 0,
      conversions: agg.conversions,
      revenue: round(agg.revenue, 2),
      rpr: agg.recipients > 0 ? round(agg.revenue / agg.recipients, 2) : 0,
      aov: agg.conversions > 0 ? round(agg.revenue / agg.conversions, 2) : 0,
      bounce_rate_pct: 0,
      unsub_rate_pct: 0,
    });
  }

  items.sort((a, b) => b.revenue - a.revenue);

  return {
    row_count: rows.length,
    items,
    totals: {
      flows_counted: Object.keys(byFlow).length,
      total_recipients: totalRecipients,
      total_delivered: totalDelivered,
      total_conversions: totalConversions,
      total_revenue: round(totalRevenue, 2),
      avg_open_rate_pct: openRateDenom > 0 ? round((weightedOpenRateNum / openRateDenom) * 100, 1) : 0,
      avg_click_rate_pct: openRateDenom > 0 ? round((weightedClickRateNum / openRateDenom) * 100, 2) : 0,
      avg_conversion_rate_pct:
        openRateDenom > 0 ? round((weightedConversionRateNum / openRateDenom) * 100, 2) : 0,
      revenue_per_recipient: totalRecipients > 0 ? round(totalRevenue / totalRecipients, 2) : 0,
      avg_order_value: totalConversions > 0 ? round(totalRevenue / totalConversions, 2) : 0,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { brandId, period, customStart, customEnd } = (await request.json()) as {
      brandId: string;
      period: Period;
      customStart?: string;
      customEnd?: string;
    };

    if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 });
    if (period !== 'custom' && !PERIOD_CONFIG[period]) {
      return NextResponse.json(
        { error: `period must be one of: ${Object.keys(PERIOD_CONFIG).join(', ')}, custom` },
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

    // Resolve the date range for the report
    let timeframe: { key?: string; start?: string; end?: string };
    let periodLabel: string;
    let startISO: string;
    let endISO: string;

    if (period === 'custom') {
      if (!customStart || !customEnd) {
        return NextResponse.json(
          { error: 'customStart and customEnd required for custom period' },
          { status: 400 }
        );
      }
      const s = new Date(customStart);
      const e = new Date(customEnd);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) {
        return NextResponse.json({ error: 'Invalid custom date format' }, { status: 400 });
      }
      if (e < s) {
        return NextResponse.json({ error: 'customEnd must be after customStart' }, { status: 400 });
      }
      // End of selected end-day, inclusive
      e.setHours(23, 59, 59, 999);
      startISO = s.toISOString();
      endISO = e.toISOString();
      timeframe = { start: startISO, end: endISO };
      const fmt = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
      periodLabel = `${fmt(s)} – ${fmt(e)}`;
    } else {
      const periodConfig = PERIOD_CONFIG[period];
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - periodConfig.days);
      startISO = start.toISOString();
      endISO = end.toISOString();
      timeframe = { key: periodConfig.key };
      periodLabel = periodConfig.label;
    }

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
    // Campaigns: only the messages.channel filter is required by Klaviyo.
    // The /campaigns endpoint does NOT support filtering by send_time, so we
    // pull all email campaigns and let the report's timeframe do the work.
    // We only need the lookup for name resolution.
    const campaignsFilter = 'equals(messages.channel,"email")';
    const [campaignReportRes, flowReportRes, campaignsListRes, flowsListRes] = await Promise.all([
      safe(
        getCampaignReport(apiKey, {
          conversionMetricId: placedOrderId,
          statistics: reportStats,
          timeframe,
          filter: 'equals(send_channel,"email")',
        }),
        'get_campaign_report'
      ),
      safe(
        getFlowReport(apiKey, {
          conversionMetricId: placedOrderId,
          statistics: reportStats,
          timeframe,
        }),
        'get_flow_report'
      ),
      safe(getCampaigns(apiKey, campaignsFilter, { includeMessages: true }), 'get_campaigns_list'),
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

    // Build name lookups so we can resolve campaign_id / message_id / flow_id to real names.
    const { byCampaignId, byMessageId } = buildCampaignLookup(campaignsListRes);
    const flowLookup = buildFlowLookup(flowsListRes);

    // ─── SERVER-SIDE AGGREGATION ───
    // We compute totals + per-item rows ourselves so the AI never has to sum
    // across many rows (which is where it makes mistakes). It only needs to
    // pick the narrative.
    const campaignAgg = aggregateCampaignReport(campaignReportRes, byCampaignId, byMessageId);
    const flowAgg = aggregateFlowReport(flowReportRes, flowLookup);

    const combinedRevenue = round(campaignAgg.totals.total_revenue + flowAgg.totals.total_revenue, 2);
    const flowRevenuePctOfTotal =
      combinedRevenue > 0 ? round((flowAgg.totals.total_revenue / combinedRevenue) * 100, 1) : 0;
    const campaignRevenuePctOfTotal =
      combinedRevenue > 0 ? round((campaignAgg.totals.total_revenue / combinedRevenue) * 100, 1) : 0;

    const computedSummary = {
      combined_revenue: combinedRevenue,
      campaign_revenue: campaignAgg.totals.total_revenue,
      flow_revenue: flowAgg.totals.total_revenue,
      campaign_revenue_pct_of_total: campaignRevenuePctOfTotal,
      flow_revenue_pct_of_total: flowRevenuePctOfTotal,
      campaign_totals: campaignAgg.totals,
      flow_totals: flowAgg.totals,
      top_5_campaigns_by_revenue: campaignAgg.items.slice(0, 5),
      top_5_flows_by_revenue: flowAgg.items.slice(0, 5),
      worst_3_campaigns_by_revenue: campaignAgg.items.slice(-3).reverse(),
    };

    const payloadJson = `{
  "brand": ${JSON.stringify({ name: brand.name, category: brand.category || 'unknown', voice: brand.voice || 'unknown' })},
  "period_label": ${JSON.stringify(periodLabel)},
  "period": ${JSON.stringify({ start: startISO, end: endISO })},
  "computed_summary": ${stringifyTrimmed(computedSummary, 12000)},
  "all_campaigns": ${stringifyTrimmed(campaignAgg.items, 8000)},
  "all_flows": ${stringifyTrimmed(flowAgg.items, 6000)}
}`;

    const userPrompt = `Build a Weekly Wrap performance report for ${brand.name} covering ${periodLabel}.

This is a recurring client check-in. The output must be ready to copy-paste into Slack — no markdown headings, no code blocks, just the formatted report exactly as the skill template specifies.

=== HOW TO USE THE DATA ===
The JSON below contains a "computed_summary" object that has ALREADY been calculated server-side from raw Klaviyo data. USE THESE NUMBERS DIRECTLY. Do NOT recalculate, re-sum, or estimate — they are correct.

Key fields in computed_summary:
- combined_revenue: TOTAL Klaviyo-attributed revenue (campaigns + flows). Use this in the Overview.
- campaign_revenue / flow_revenue: split between campaigns and flows.
- flow_revenue_pct_of_total: e.g. "Flows contributed 45.2% of revenue"
- campaign_totals: contains campaigns_counted, total_recipients, avg_open_rate_pct, avg_click_rate_pct, avg_conversion_rate_pct, revenue_per_recipient
- flow_totals: same shape, for flows
- top_5_campaigns_by_revenue: array of named campaign objects, already sorted desc by revenue. Each has name, revenue, recipients, open_rate_pct, click_rate_pct, conversion_rate_pct, sent_at.
- top_5_flows_by_revenue: same shape for flows
- worst_3_campaigns_by_revenue: bottom 3 campaigns for the "What Didn't Work" section

The "all_campaigns" and "all_flows" arrays are the full lists if you need to find anything specific. Each item already has its real name.

=== HARD RULES (NON-NEGOTIABLE) ===
1. ALWAYS use the human "name" field from the items. NEVER print campaign_id, flow_id, or any other ID-looking string.
2. Use the totals and rates from computed_summary directly. Do NOT recompute. The math is already correct.
3. Format currency with $ and commas (e.g. $12,340). No cents.
4. Format open rates to 1 decimal place. Format click and conversion rates to 2 decimal places.
5. If computed_summary.combined_revenue is 0, say "No revenue attributed in this period" — don't fabricate a number.
6. If top_5_campaigns_by_revenue is empty, say "No campaigns sent in this period".
7. If top_5_flows_by_revenue is empty, say "No flow revenue tracked in this period".
8. No em dashes. No raw IDs. No fabricated data. No invented insights — every claim must reference a real number from the data.

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
