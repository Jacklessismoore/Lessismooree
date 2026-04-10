import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import {
  getMetrics,
  getFlows,
  getFlowReport,
  getCampaigns,
  getCampaignReport,
  getLists,
  getSegments,
} from '@/lib/klaviyo';
import { KLAVIYO_AUDIT_SKILL, VERTICAL_BENCHMARKS } from '@/lib/skills/klaviyo-audit';

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// ─── Shared helpers ───

interface KlaviyoMetric {
  id: string;
  attributes?: { name?: string };
}

interface KlaviyoFlow {
  id: string;
  attributes?: {
    name?: string;
    status?: string;
    trigger_type?: string;
    archived?: boolean;
    created?: string;
    updated?: string;
  };
}

interface KlaviyoListOrSegment {
  id: string;
  attributes?: { name?: string };
}

interface ReportRow {
  groupings: Record<string, string>;
  statistics: Record<string, number>;
}

function findMetricId(metrics: KlaviyoMetric[], name: string): string | null {
  return metrics.find((m) => m.attributes?.name === name)?.id ?? null;
}

async function safe<T>(p: Promise<T>, label: string, ms = 25_000): Promise<T | { error: string }> {
  return Promise.race([
    p.catch((e) => ({ error: `${label}: ${e instanceof Error ? e.message : String(e)}` })),
    new Promise<{ error: string }>((resolve) =>
      setTimeout(() => resolve({ error: `${label}: timed out after ${ms}ms` }), ms)
    ),
  ]);
}

function num(v: unknown): number {
  return typeof v === 'number' && isFinite(v) ? v : 0;
}

function round(v: number, d = 2): number {
  const m = Math.pow(10, d);
  return Math.round(v * m) / m;
}

function extractRows(res: unknown): ReportRow[] {
  if (!res || typeof res !== 'object') return [];
  const r = res as { data?: { attributes?: { results?: ReportRow[] } } };
  return r?.data?.attributes?.results || [];
}

function extractList<T>(res: unknown): T[] {
  if (!res || typeof res !== 'object') return [];
  const data = (res as { data?: T[] }).data;
  return Array.isArray(data) ? data : [];
}

// Best-effort repair for a JSON blob that got cut off mid-response.
// Walks the string, tracks string/brace/bracket depth, trims any trailing
// incomplete value, and closes any open containers. Returns null if the
// input doesn't even start with a valid JSON opener.
function repairTruncatedJson(raw: string): string | null {
  let s = raw.trim();
  if (!s.startsWith('{') && !s.startsWith('[')) return null;

  // Strip trailing code fence if present
  s = s.replace(/```\s*$/, '').trim();

  const stack: Array<'{' | '['> = [];
  let inString = false;
  let escape = false;
  let lastCompleteIdx = -1;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{' || ch === '[') {
      stack.push(ch as '{' | '[');
    } else if (ch === '}' || ch === ']') {
      const want = ch === '}' ? '{' : '[';
      if (stack[stack.length - 1] === want) {
        stack.pop();
        if (stack.length === 0) lastCompleteIdx = i;
      }
    }
  }

  // If we ended cleanly, just return as-is
  if (stack.length === 0 && !inString) return s;

  // Truncate at the last known-good comma or colon-start of a value, then
  // close all open containers.
  let truncAt = s.length;
  // Walk back to find a safe cut point (last comma outside a string)
  let inStr = false;
  let esc = false;
  let lastSafeComma = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\' && inStr) {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === ',') lastSafeComma = i;
  }
  if (lastSafeComma > 0) truncAt = lastSafeComma;

  let repaired = s.slice(0, truncAt).trimEnd();

  // Rebuild the stack up to this point
  const stack2: Array<'{' | '['> = [];
  let inStr2 = false;
  let esc2 = false;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (esc2) {
      esc2 = false;
      continue;
    }
    if (ch === '\\' && inStr2) {
      esc2 = true;
      continue;
    }
    if (ch === '"') {
      inStr2 = !inStr2;
      continue;
    }
    if (inStr2) continue;
    if (ch === '{' || ch === '[') stack2.push(ch as '{' | '[');
    else if (ch === '}') {
      if (stack2[stack2.length - 1] === '{') stack2.pop();
    } else if (ch === ']') {
      if (stack2[stack2.length - 1] === '[') stack2.pop();
    }
  }

  // Close anything still open
  while (stack2.length > 0) {
    const open = stack2.pop();
    repaired += open === '{' ? '}' : ']';
  }

  return repaired;
}

// ─── Flow presence classification ───
// Match a flow name/trigger to one of the canonical flow types so we can
// check what the account is missing.

type FlowSlot =
  | 'welcome'
  | 'abandoned_cart'
  | 'browse_abandonment'
  | 'post_purchase'
  | 'winback'
  | 'sunset'
  | 'vip'
  | 'back_in_stock'
  | 'price_drop'
  | 'review_request'
  | 'birthday';

const SLOT_LABELS: Record<FlowSlot, string> = {
  welcome: 'Welcome',
  abandoned_cart: 'Abandoned Cart',
  browse_abandonment: 'Browse Abandonment',
  post_purchase: 'Post-Purchase',
  winback: 'Winback',
  sunset: 'Sunset / Re-engagement',
  vip: 'VIP / Repeat Buyer',
  back_in_stock: 'Back in Stock',
  price_drop: 'Price Drop',
  review_request: 'Review Request',
  birthday: 'Birthday / Anniversary',
};

const MUST_HAVE: FlowSlot[] = ['welcome', 'abandoned_cart', 'browse_abandonment', 'post_purchase'];
const SHOULD_HAVE: FlowSlot[] = ['winback', 'sunset', 'vip', 'back_in_stock', 'review_request'];

function classifyFlow(name: string, trigger: string): FlowSlot | null {
  const n = name.toLowerCase();
  const t = trigger.toLowerCase();
  if (/welcome|signup|new sub|subscribe/.test(n)) return 'welcome';
  if (/abandon.*cart|cart.*abandon|checkout/.test(n)) return 'abandoned_cart';
  if (/browse|viewed|product.*abandon/.test(n)) return 'browse_abandonment';
  if (/post.?purchase|thank.?you|order.?confirm|delivered|shipped/.test(n)) return 'post_purchase';
  if (/winback|win.?back|lapsed/.test(n)) return 'winback';
  if (/sunset|re.?engage|unengaged/.test(n)) return 'sunset';
  if (/vip|loyal|repeat|tier|reward/.test(n)) return 'vip';
  if (/back.?in.?stock|restock/.test(n)) return 'back_in_stock';
  if (/price.?drop/.test(n)) return 'price_drop';
  if (/review|rating|feedback/.test(n)) return 'review_request';
  if (/birthday|anniversary/.test(n)) return 'birthday';
  if (t.includes('date')) return 'birthday';
  return null;
}

// ─── Dimension scorers ───
// Each returns { score: 1|2|3, data_missing, summary } and collects whatever
// extra computed data the AI will reference.

interface DimensionResult {
  score: 1 | 2 | 3;
  data_missing?: boolean;
  [key: string]: unknown;
}

function scoreFlowArchitecture(flows: KlaviyoFlow[]): DimensionResult {
  // Only evaluate LIVE flows. Paused / draft / manual are deliberately
  // excluded — the AM knows why they're in that state and they shouldn't
  // drag the score down.
  const live = flows.filter((f) => f.attributes?.status === 'live' && !f.attributes?.archived);

  const present: Record<FlowSlot, string[]> = {} as Record<FlowSlot, string[]>;
  for (const f of live) {
    const slot = classifyFlow(f.attributes?.name || '', f.attributes?.trigger_type || '');
    if (!slot) continue;
    if (!present[slot]) present[slot] = [];
    present[slot].push(f.attributes?.name || '(unnamed)');
  }

  const missingMustHave = MUST_HAVE.filter((slot) => !present[slot]).map((s) => SLOT_LABELS[s]);
  const missingShouldHave = SHOULD_HAVE.filter((slot) => !present[slot]).map((s) => SLOT_LABELS[s]);
  const mustHaveCount = MUST_HAVE.length - missingMustHave.length;
  const shouldHaveCount = SHOULD_HAVE.length - missingShouldHave.length;

  // Stale flows: live flows that haven't been updated in 180+ days
  const now = Date.now();
  const stale = live.filter((f) => {
    const updated = f.attributes?.updated;
    if (!updated) return false;
    const age = now - new Date(updated).getTime();
    return age > 180 * 24 * 60 * 60 * 1000;
  }).map((f) => f.attributes?.name);

  let score: 1 | 2 | 3;
  if (mustHaveCount === 4 && shouldHaveCount >= 3) score = 3;
  else if (mustHaveCount === 4) score = 2;
  else score = 1;

  return {
    score,
    scoring_scope: 'Live flows only. Paused, draft, and manual flows are excluded from scoring.',
    total_live_flows: live.length,
    must_have_present: MUST_HAVE.filter((s) => present[s]).map((s) => SLOT_LABELS[s]),
    must_have_missing: missingMustHave,
    should_have_present: SHOULD_HAVE.filter((s) => present[s]).map((s) => SLOT_LABELS[s]),
    should_have_missing: missingShouldHave,
    stale_flow_names: stale,
  };
}

function aggregateReportRows(rows: ReportRow[]): {
  recipients: number;
  delivered: number;
  weighted_open: number;
  weighted_click: number;
  weighted_cto: number;
  weighted_conv: number;
  bounce: number;
  unsub: number;
  spam: number;
  revenue: number;
  denom: number;
  row_count: number;
} {
  let recipients = 0,
    delivered = 0,
    openNum = 0,
    clickNum = 0,
    ctoNum = 0,
    convNum = 0,
    bounceNum = 0,
    unsubNum = 0,
    spamNum = 0,
    revenue = 0,
    denom = 0;
  for (const r of rows) {
    const s = r.statistics || {};
    const rec = num(s.recipients);
    const del = num(s.delivered);
    recipients += rec;
    delivered += del;
    revenue += num(s.conversion_value);
    openNum += num(s.open_rate) * del;
    clickNum += num(s.click_rate) * del;
    ctoNum += num(s.click_to_open_rate) * del;
    convNum += num(s.conversion_rate) * del;
    bounceNum += num(s.bounce_rate) * del;
    unsubNum += num(s.unsubscribe_rate) * del;
    spamNum += num(s.spam_complaint_rate) * del;
    denom += del;
  }
  return {
    recipients,
    delivered,
    weighted_open: denom > 0 ? openNum / denom : 0,
    weighted_click: denom > 0 ? clickNum / denom : 0,
    weighted_cto: denom > 0 ? ctoNum / denom : 0,
    weighted_conv: denom > 0 ? convNum / denom : 0,
    bounce: denom > 0 ? bounceNum / denom : 0,
    unsub: denom > 0 ? unsubNum / denom : 0,
    spam: denom > 0 ? spamNum / denom : 0,
    revenue,
    denom,
    row_count: rows.length,
  };
}

function scoreFlowPerformance(rows: ReportRow[]): DimensionResult {
  if (rows.length === 0) return { score: 1, data_missing: true };
  const agg = aggregateReportRows(rows);
  const openPct = round(agg.weighted_open * 100, 1);
  const clickPct = round(agg.weighted_click * 100, 2);

  // Revenue concentration check
  const byFlow: Record<string, number> = {};
  for (const r of rows) {
    const fId = r.groupings?.flow_id;
    if (!fId) continue;
    byFlow[fId] = (byFlow[fId] || 0) + num(r.statistics?.conversion_value);
  }
  const flowRevenues = Object.values(byFlow).sort((a, b) => b - a);
  const totalRev = flowRevenues.reduce((a, b) => a + b, 0);
  const topFlowShare = totalRev > 0 ? (flowRevenues[0] || 0) / totalRev : 0;

  let score: 1 | 2 | 3;
  if (openPct >= 40 && clickPct >= 6 && topFlowShare < 0.6) score = 3;
  else if (openPct < 30 || clickPct < 3 || topFlowShare >= 0.6) score = 1;
  else score = 2;

  return {
    score,
    avg_open_rate_pct: openPct,
    avg_click_rate_pct: clickPct,
    avg_conversion_rate_pct: round(agg.weighted_conv * 100, 2),
    total_flow_revenue: round(agg.revenue, 2),
    top_flow_revenue_share_pct: round(topFlowShare * 100, 1),
    flow_row_count: agg.row_count,
  };
}

function scoreCampaignPerformance(rows: ReportRow[], vertical: string): DimensionResult {
  if (rows.length === 0) return { score: 1, data_missing: true };
  const agg = aggregateReportRows(rows);
  const openPct = round(agg.weighted_open * 100, 1);
  const clickPct = round(agg.weighted_click * 100, 2);
  const ctoPct = round(agg.weighted_cto * 100, 2);

  const bench = VERTICAL_BENCHMARKS[vertical] || VERTICAL_BENCHMARKS['General DTC E-Commerce'];
  const openMid = (bench.openMin + bench.openMax) / 2;
  const clickMid = (bench.clickMin + bench.clickMax) / 2;

  let score: 1 | 2 | 3;
  if (openPct >= openMid && clickPct >= clickMid && ctoPct > 9) score = 3;
  else if (openPct < bench.openMin || clickPct < bench.clickMin) score = 1;
  else score = 2;

  return {
    score,
    avg_open_rate_pct: openPct,
    avg_click_rate_pct: clickPct,
    avg_click_to_open_rate_pct: ctoPct,
    total_campaign_revenue: round(agg.revenue, 2),
    campaigns_counted: rows.length,
    vertical_benchmark: `${bench.openMin}-${bench.openMax}% open, ${bench.clickMin}-${bench.clickMax}% click`,
  };
}

function scoreDeliverability(campaignAgg: ReturnType<typeof aggregateReportRows>): DimensionResult {
  if (campaignAgg.denom === 0) return { score: 1, data_missing: true };
  const bouncePct = round(campaignAgg.bounce * 100, 3);
  const spamPct = round(campaignAgg.spam * 100, 3);
  const deliveryPct = round((campaignAgg.delivered / Math.max(campaignAgg.recipients, 1)) * 100, 2);

  let score: 1 | 2 | 3;
  if (bouncePct < 0.5 && spamPct < 0.05 && deliveryPct >= 98) score = 3;
  else if (bouncePct > 1 || spamPct > 0.08 || deliveryPct < 96) score = 1;
  else score = 2;

  return {
    score,
    bounce_rate_pct: bouncePct,
    spam_complaint_rate_pct: spamPct,
    delivery_rate_pct: deliveryPct,
    thresholds: 'Bounce < 1%, Spam < 0.08%, Delivery > 97%',
  };
}

function scoreListHealth(lists: KlaviyoListOrSegment[], segments: KlaviyoListOrSegment[]): DimensionResult {
  const allSegmentNames = segments.map((s) => (s.attributes?.name || '').toLowerCase());

  const hasEngaged = allSegmentNames.some((n) => /engaged|active|opened|clicked/.test(n));
  const hasSunset = allSegmentNames.some((n) => /sunset|suppress|unengaged|dead/.test(n));
  const hasVip = allSegmentNames.some((n) => /vip|repeat|loyal|high.?value|tier/.test(n));
  const hasPurchase = allSegmentNames.some((n) => /buyer|customer|purchased|first.?time|one.?time/.test(n));

  const keyPresent = [hasEngaged, hasSunset, hasVip, hasPurchase].filter(Boolean).length;

  let score: 1 | 2 | 3;
  if (hasEngaged && hasSunset && keyPresent >= 3) score = 3;
  else if (hasEngaged && keyPresent >= 2) score = 2;
  else score = 1;

  return {
    score,
    has_engaged_segment: hasEngaged,
    has_sunset_segment: hasSunset,
    has_vip_segment: hasVip,
    has_purchase_segment: hasPurchase,
    total_lists: lists.length,
    total_segments: segments.length,
    key_segments_present: keyPresent,
  };
}

function scoreRevenueAttribution(
  flowAgg: ReturnType<typeof aggregateReportRows>,
  campaignAgg: ReturnType<typeof aggregateReportRows>
): DimensionResult {
  const total = flowAgg.revenue + campaignAgg.revenue;
  if (total === 0) return { score: 1, data_missing: true };
  const flowSharePct = round((flowAgg.revenue / total) * 100, 1);
  const campaignSharePct = round((campaignAgg.revenue / total) * 100, 1);

  let score: 1 | 2 | 3;
  if (flowSharePct >= 40 && flowSharePct <= 60) score = 3;
  else if (flowSharePct < 30 || campaignSharePct < 25) score = 1;
  else score = 2;

  return {
    score,
    total_email_revenue: round(total, 2),
    flow_revenue: round(flowAgg.revenue, 2),
    campaign_revenue: round(campaignAgg.revenue, 2),
    flow_revenue_share_pct: flowSharePct,
    campaign_revenue_share_pct: campaignSharePct,
    healthy_split: '40-60% / 40-60%',
  };
}

// Detect A/B tests by looking for (flow_id, flow_message_id) or
// (campaign_id, campaign_message_id) groupings that have 2+ distinct
// variation_name values. This is the same pattern the test-results tool uses
// and it's the only reliable way to identify actual tests from report data.
function scoreAbTesting(
  flowVariationRows: ReportRow[],
  campaignVariationRows: ReportRow[]
): DimensionResult {
  // Flow tests — group by (flow_id, flow_message_id) and count distinct variations
  const flowTestGroups: Record<string, Set<string>> = {};
  for (const r of flowVariationRows) {
    const g = r.groupings || {};
    const fId = g.flow_id;
    const mId = g.flow_message_id;
    const v = g.variation_name || g.variation;
    if (!fId || !mId || !v) continue;
    const key = `${fId}:${mId}`;
    if (!flowTestGroups[key]) flowTestGroups[key] = new Set();
    flowTestGroups[key].add(v);
  }
  const flowTestsFound = Object.entries(flowTestGroups).filter(
    ([, variations]) => variations.size >= 2
  );
  const uniqueFlowsWithTests = new Set(
    flowTestsFound.map(([key]) => key.split(':')[0])
  );

  // Campaign tests — group by campaign_id and count distinct variations
  const campaignTestGroups: Record<string, Set<string>> = {};
  for (const r of campaignVariationRows) {
    const g = r.groupings || {};
    const cId = g.campaign_id || g.campaign_message_id;
    const v = g.variation_name || g.variation;
    if (!cId || !v) continue;
    if (!campaignTestGroups[cId]) campaignTestGroups[cId] = new Set();
    campaignTestGroups[cId].add(v);
  }
  const campaignTestsFound = Object.entries(campaignTestGroups).filter(
    ([, variations]) => variations.size >= 2
  );

  const flowTestCount = flowTestsFound.length;
  const campaignTestCount = campaignTestsFound.length;

  let score: 1 | 2 | 3;
  if (flowTestCount >= 2 && campaignTestCount >= 1) score = 3;
  else if (flowTestCount > 0 || campaignTestCount > 0) score = 2;
  else score = 1;

  return {
    score,
    flow_message_tests_detected: flowTestCount,
    flow_count_with_tests: uniqueFlowsWithTests.size,
    campaign_tests_detected: campaignTestCount,
    note:
      flowTestCount + campaignTestCount === 0
        ? 'No A/B test variations detected in the last 90 days of report data.'
        : `Detected ${flowTestCount} flow-message test${flowTestCount === 1 ? '' : 's'} across ${uniqueFlowsWithTests.size} flow${uniqueFlowsWithTests.size === 1 ? '' : 's'}, and ${campaignTestCount} campaign test${campaignTestCount === 1 ? '' : 's'}.`,
  };
}

function scoreContentStrategy(
  recentCampaignsRes: unknown,
  campaignRows: ReportRow[]
): DimensionResult {
  const campaigns = extractList<{
    id: string;
    attributes?: {
      name?: string;
      status?: string;
      send_time?: string | null;
      sendTime?: string | null;
      scheduled_at?: string | null;
      scheduledAt?: string | null;
    };
  }>(recentCampaignsRes);

  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;

  // Primary source: if the campaign report returned rows for the period,
  // every row represents a sent email campaign. Use that as the true count.
  const campaignIdsWithStats = new Set<string>();
  for (const r of campaignRows) {
    const cId = r.groupings?.campaign_id;
    if (cId) campaignIdsWithStats.add(cId);
  }
  const sentFromReport = campaignIdsWithStats.size;

  // Fallback source: filter the /campaigns list to Sent campaigns in window
  // (handles both camelCase and snake_case timestamps)
  const sentFromList = campaigns.filter((c) => {
    const attrs = c.attributes || {};
    if (attrs.status && attrs.status.toLowerCase() !== 'sent') return false;
    const t = attrs.send_time || attrs.sendTime || attrs.scheduled_at || attrs.scheduledAt;
    if (!t) return false;
    return new Date(t).getTime() > cutoff;
  });

  // Take the larger of the two — the report sometimes lags by a day and the
  // list sometimes misses status; both are directional.
  const count90d = Math.max(sentFromReport, sentFromList.length);
  const perWeek = round(count90d / (90 / 7), 1);

  // Subject-line-like uniqueness: match campaigns by name using whichever
  // source we used
  const candidateNames = (sentFromList.length > 0 ? sentFromList : campaigns)
    .map((c) => (c.attributes?.name || '').toLowerCase().trim())
    .filter(Boolean);
  const uniqueRatio =
    candidateNames.length > 0 ? new Set(candidateNames).size / candidateNames.length : 1;

  let score: 1 | 2 | 3;
  if (perWeek >= 2 && perWeek <= 4 && uniqueRatio > 0.85) score = 3;
  else if (perWeek >= 1 && perWeek <= 5) score = 2;
  else if (count90d === 0) score = 1;
  else score = 2;

  return {
    score,
    campaigns_sent_last_90d: count90d,
    avg_campaigns_per_week: perWeek,
    name_uniqueness_ratio: round(uniqueRatio, 2),
    campaigns_from_report: sentFromReport,
    campaigns_from_list: sentFromList.length,
  };
}

// ─── Main handler ───

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { brandId, vertical } = (await request.json()) as {
      brandId: string;
      vertical: string;
    };

    if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 });
    if (!vertical) return NextResponse.json({ error: 'vertical required' }, { status: 400 });

    const { data: brand } = await supabase
      .from('brands')
      .select('id, name, klaviyo_api_key, category')
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
    const timeframe = { key: 'last_90_days' };

    const metricsRes = await safe(getMetrics(apiKey), 'metrics');
    const metrics = extractList<KlaviyoMetric>((metricsRes as unknown) as { data?: KlaviyoMetric[] });
    const placedOrderId = findMetricId(metrics, 'Placed Order');
    if (!placedOrderId) {
      return NextResponse.json({ error: 'Placed Order metric not found.' }, { status: 500 });
    }

    // Pull everything in parallel
    const reportStats = [
      'recipients',
      'delivered',
      'open_rate',
      'click_rate',
      'click_to_open_rate',
      'conversion_rate',
      'conversions',
      'conversion_value',
      'bounce_rate',
      'unsubscribe_rate',
      'spam_complaint_rate',
    ];

    const [
      flowsRes,
      flowReportRes,
      campaignReportRes,
      flowVariationRes,
      campaignVariationRes,
      listsRes,
      segmentsRes,
      campaignsListRes,
    ] = await Promise.all([
      safe(getFlows(apiKey), 'flows'),
      // Overall flow report — grouped by flow_id + flow_message_id so
      // we get per-message rows (every row in a flow-values-report is an
      // already-scoped metric bucket)
      safe(
        getFlowReport(apiKey, {
          conversionMetricId: placedOrderId,
          statistics: reportStats,
          timeframe,
          groupBy: ['flow_id', 'flow_message_id'],
        }),
        'flow_report'
      ),
      // Overall campaign report — grouped by campaign_id + campaign_message_id
      safe(
        getCampaignReport(apiKey, {
          conversionMetricId: placedOrderId,
          statistics: reportStats,
          timeframe,
          filter: 'equals(send_channel,"email")',
          groupBy: ['campaign_id', 'campaign_message_id'],
        }),
        'campaign_report'
      ),
      // Dedicated variation-grouped flow report — for A/B test detection
      safe(
        getFlowReport(apiKey, {
          conversionMetricId: placedOrderId,
          statistics: ['recipients'],
          timeframe,
          groupBy: ['flow_id', 'flow_message_id', 'variation', 'variation_name'],
        }),
        'flow_variation_report'
      ),
      // Dedicated variation-grouped campaign report — for A/B test detection
      safe(
        getCampaignReport(apiKey, {
          conversionMetricId: placedOrderId,
          statistics: ['recipients'],
          timeframe,
          filter: 'equals(send_channel,"email")',
          groupBy: ['campaign_id', 'campaign_message_id', 'variation', 'variation_name'],
        }),
        'campaign_variation_report'
      ),
      safe(getLists(apiKey), 'lists'),
      safe(getSegments(apiKey), 'segments'),
      safe(getCampaigns(apiKey, 'equals(messages.channel,"email")'), 'campaigns_list'),
    ]);

    // If the main reports errored, surface the errors so we can actually debug
    const apiErrors: string[] = [];
    for (const [label, r] of [
      ['flows', flowsRes],
      ['flow_report', flowReportRes],
      ['campaign_report', campaignReportRes],
      ['flow_variation_report', flowVariationRes],
      ['campaign_variation_report', campaignVariationRes],
      ['lists', listsRes],
      ['segments', segmentsRes],
      ['campaigns_list', campaignsListRes],
    ] as const) {
      const err = (r as { error?: string })?.error;
      if (err) apiErrors.push(`${label}: ${err}`);
    }
    // Only bail if the CRITICAL reports all failed
    if (
      (flowReportRes as { error?: string })?.error &&
      (campaignReportRes as { error?: string })?.error
    ) {
      return NextResponse.json(
        {
          error: `Klaviyo fetch failed on main reports: ${apiErrors.join(' | ')}`,
        },
        { status: 502 }
      );
    }

    // Extract
    const flows = extractList<KlaviyoFlow>(flowsRes);
    const rawFlowRows = extractRows(flowReportRes);
    const rawCampaignRows = extractRows(campaignReportRes);
    const rawFlowVariationRows = extractRows(flowVariationRes);
    const rawCampaignVariationRows = extractRows(campaignVariationRes);
    const lists = extractList<KlaviyoListOrSegment>(listsRes);
    const segments = extractList<KlaviyoListOrSegment>(segmentsRes);

    // ─── Filter out paused / draft / manual from all scoring ───
    // Build a set of LIVE flow IDs so we only score live flows' performance.
    const liveFlowIds = new Set(
      flows
        .filter((f) => f.attributes?.status === 'live' && !f.attributes?.archived)
        .map((f) => f.id)
    );

    // Build a set of SENT campaign IDs. The /campaigns list gives us status.
    const campaignsList = extractList<{ id: string; attributes?: { status?: string } }>(
      campaignsListRes
    );
    const sentCampaignIds = new Set(
      campaignsList
        .filter((c) => (c.attributes?.status || '').toLowerCase() === 'sent')
        .map((c) => c.id)
    );

    // If we couldn't build the sent set (e.g. list call failed), fall back to
    // including every campaign row that has recipients — they were sent by
    // definition.
    const campaignFilter = sentCampaignIds.size > 0
      ? (row: ReportRow) => {
          const cId = row.groupings?.campaign_id;
          return !!cId && sentCampaignIds.has(cId);
        }
      : (row: ReportRow) => num(row.statistics?.recipients) > 0;

    const flowFilter = (row: ReportRow) => {
      const fId = row.groupings?.flow_id;
      return !!fId && liveFlowIds.has(fId);
    };

    const flowRows = rawFlowRows.filter(flowFilter);
    const campaignRows = rawCampaignRows.filter(campaignFilter);
    const flowVariationRows = rawFlowVariationRows.filter(flowFilter);
    const campaignVariationRows = rawCampaignVariationRows.filter(campaignFilter);

    const flowAgg = aggregateReportRows(flowRows);
    const campaignAgg = aggregateReportRows(campaignRows);

    // Score each dimension
    const dim1 = scoreFlowArchitecture(flows);
    const dim2 = scoreFlowPerformance(flowRows);
    const dim3 = scoreCampaignPerformance(campaignRows, vertical);
    const dim4 = scoreDeliverability(campaignAgg);
    const dim5 = scoreListHealth(lists, segments);
    const dim6 = scoreRevenueAttribution(flowAgg, campaignAgg);
    const dim7 = scoreAbTesting(flowVariationRows, campaignVariationRows);
    const dim8 = scoreContentStrategy(campaignsListRes, campaignRows);

    const scores = {
      flow_architecture: dim1.score,
      flow_performance: dim2.score,
      campaign_performance: dim3.score,
      deliverability_health: dim4.score,
      list_health: dim5.score,
      revenue_attribution: dim6.score,
      ab_testing: dim7.score,
      content_strategy: dim8.score,
    };

    // Strip server-side 1/2/3 scores from the dimension objects — the AI
    // re-scores out of 100 using the raw metrics.
    const stripScore = <T extends DimensionResult>(d: T) => {
      const copy = { ...d } as Record<string, unknown>;
      delete copy.score;
      return copy;
    };

    const computed = {
      vertical,
      benchmarks: VERTICAL_BENCHMARKS[vertical] || VERTICAL_BENCHMARKS['General DTC E-Commerce'],
      flow_architecture: stripScore(dim1),
      flow_performance: stripScore(dim2),
      campaign_performance: stripScore(dim3),
      deliverability_health: stripScore(dim4),
      list_health: stripScore(dim5),
      revenue_attribution: stripScore(dim6),
      ab_testing: stripScore(dim7),
      content_strategy: stripScore(dim8),
      api_errors: apiErrors.length > 0 ? apiErrors : undefined,
    };

    // Keep scores around purely for debugging — not sent to AI
    void scores;

    const payloadJson = JSON.stringify(
      {
        brand: { name: brand.name, category: brand.category || 'unknown', vertical },
        period_label: 'Last 90 days',
        computed,
      },
      null,
      2
    );

    const userPrompt = `Audit the Klaviyo account for ${brand.name} (vertical: ${vertical}, covering the last 90 days).

The server pulled the data — it's all in the "computed" object below. YOU are the evaluator: score each of the 8 dimensions 0-100 using the methodology in your system prompt, then write findings and an action plan.

Return the audit as a JSON object wrapped in <json>...</json> tags.

=== DATA ===
\`\`\`json
${payloadJson}
\`\`\`
`;

    // Stream SSE to the client so the Vercel function stays alive past 60s.
    // Text chunks arrive as `data: {"chunk":"..."}`, then a final
    // `data: {"done":true, "result":{...}}` event carries the parsed audit.
    const aiStream = anthropic.messages.stream({
      model: 'claude-sonnet-4-5',
      max_tokens: 16000,
      system: KLAVIYO_AUDIT_SKILL,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const send = (obj: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        };

        try {
          let fullText = '';
          for await (const event of aiStream) {
            if (
              event.type === 'content_block_delta' &&
              'delta' in event &&
              (event.delta as { type: string; text?: string }).type === 'text_delta'
            ) {
              const chunk = (event.delta as { text: string }).text;
              fullText += chunk;
              send({ chunk });
            }
          }

          const finalMsg = await aiStream.finalMessage();
          const stopReason = finalMsg.stop_reason;

    // Extract JSON. Robust to:
    //   1. <json>...</json> wrapper
    //   2. Raw JSON with preamble/trailing text
    //   3. Output that got truncated before the closing </json> tag
    type ParsedAudit = {
      overall_score?: number;
      overall_summary?: string;
      top_3_priorities?: string[];
      dimensions?: Record<string, {
        score?: number;
        one_liner?: string;
        what_was_found?: string;
        what_is_working?: string;
        what_needs_fixing?: string;
        recommended_actions?: string[];
      }>;
      action_plan?: Array<{ action: string; owner: string; priority: string; effort: string }>;
    };

    const extractJson = (text: string): ParsedAudit | null => {
      // Try the closed <json> tag first
      const tagged = text.match(/<json>([\s\S]*?)<\/json>/);
      if (tagged) {
        try {
          return JSON.parse(tagged[1].trim()) as ParsedAudit;
        } catch {
          // fall through
        }
      }
      // Try open <json> tag (closing tag missing from truncation)
      const openTag = text.match(/<json>([\s\S]*)$/);
      if (openTag) {
        const body = openTag[1].trim();
        try {
          return JSON.parse(body) as ParsedAudit;
        } catch {
          // Try to repair: walk until braces balance
          const repaired = repairTruncatedJson(body);
          if (repaired) {
            try {
              return JSON.parse(repaired) as ParsedAudit;
            } catch {
              // fall through
            }
          }
        }
      }
      // Last resort: greedy brace match
      const first = text.indexOf('{');
      const last = text.lastIndexOf('}');
      if (first >= 0 && last > first) {
        let body = text.slice(first, last + 1);
        // Strip markdown code fences that sometimes sneak in
        body = body.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        // Fix trailing commas before } or ]
        body = body.replace(/,\s*([}\]])/g, '$1');
        try {
          return JSON.parse(body) as ParsedAudit;
        } catch {
          const repaired = repairTruncatedJson(body);
          if (repaired) {
            try {
              return JSON.parse(repaired) as ParsedAudit;
            } catch {
              // fall through
            }
          }
        }
      }
      // Absolute last resort for truncated output: try to repair the whole text
      const anyJson = text.slice(text.indexOf('{'));
      if (anyJson.startsWith('{')) {
        // Strip markdown fences + trailing commas
        const cleaned = anyJson.replace(/```json\s*/g, '').replace(/```\s*/g, '').replace(/,\s*([}\]])/g, '$1');
        const repaired = repairTruncatedJson(cleaned);
        if (repaired) {
          try {
            return JSON.parse(repaired) as ParsedAudit;
          } catch {
            // truly unrecoverable
          }
        }
      }
      return null;
    };

          const parsed = extractJson(fullText);

          if (!parsed || !parsed.overall_summary) {
            const tail = fullText.slice(-800);
            send({
              error: `AI returned no usable audit (stop_reason: ${stopReason || 'unknown'}). Last 800 chars: ${tail || '(empty)'}`,
            });
          } else {
            send({
              done: true,
              result: {
                brand: { id: brand.id, name: brand.name },
                vertical,
                period_label: 'Last 90 days',
                computed,
                audit: parsed,
              },
            });
          }
        } catch (streamErr) {
          send({ error: streamErr instanceof Error ? streamErr.message : 'Stream failed' });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
