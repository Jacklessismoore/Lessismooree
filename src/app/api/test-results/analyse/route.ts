import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { getMetrics, getFlowReport, getFlows } from '@/lib/klaviyo';
import { TEST_RESULTS_ANALYST_SKILL } from '@/lib/skills/test-results-analyst';

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

type Period = '7d' | '14d' | '30d' | '90d' | 'custom';

const PERIOD_CONFIG: Record<Exclude<Period, 'custom'>, { key: string; label: string }> = {
  '7d': { key: 'last_7_days', label: 'Last 7 days' },
  '14d': { key: 'last_30_days', label: 'Last 14 days' },
  '30d': { key: 'last_30_days', label: 'Last 30 days' },
  '90d': { key: 'last_90_days', label: 'Last 90 days' },
};

interface KlaviyoMetric {
  id: string;
  attributes?: { name?: string };
}

interface KlaviyoFlow {
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

function extractReportRows(res: unknown): ReportRow[] {
  if (!res || typeof res !== 'object') return [];
  const r = res as { data?: { attributes?: { results?: ReportRow[] } } };
  return r?.data?.attributes?.results || [];
}

function num(v: unknown): number {
  return typeof v === 'number' && isFinite(v) ? v : 0;
}

function round(v: number, d = 2): number {
  const m = Math.pow(10, d);
  return Math.round(v * m) / m;
}

function extractBlock(text: string, tag: string): string | null {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].trim() : null;
}

interface VariationData {
  name: string;
  recipients: number;
  delivered: number;
  open_rate_pct: number;
  click_rate_pct: number;
  conversion_rate_pct: number;
  conversions: number;
  revenue: number;
  rpr: number;
}

interface TestData {
  flow_id: string;
  flow_name: string;
  flow_message_id: string;
  flow_message_label: string;
  variations: VariationData[];
  server_suggested_winner: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { brandId, period, customStart, customEnd, flowIds } = (await request.json()) as {
      brandId: string;
      period: Period;
      customStart?: string;
      customEnd?: string;
      flowIds: string[];
    };

    if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 });
    if (!Array.isArray(flowIds) || flowIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one flow to analyse' }, { status: 400 });
    }

    const { data: brand } = await supabase
      .from('brands')
      .select('id, name, klaviyo_api_key, category, voice')
      .eq('id', brandId)
      .single();

    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    if (!brand.klaviyo_api_key) {
      return NextResponse.json({ error: 'This brand has no Klaviyo API key configured.' }, { status: 400 });
    }

    const apiKey = brand.klaviyo_api_key;

    // Resolve timeframe + label
    let timeframe: { key?: string; start?: string; end?: string };
    let periodLabel: string;
    if (period === 'custom') {
      if (!customStart || !customEnd) {
        return NextResponse.json({ error: 'customStart + customEnd required' }, { status: 400 });
      }
      const s = new Date(customStart);
      const e = new Date(customEnd);
      if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) {
        return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
      }
      e.setHours(23, 59, 59, 999);
      timeframe = { start: s.toISOString(), end: e.toISOString() };
      const fmt = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
      periodLabel = `${fmt(s)} – ${fmt(e)}`;
    } else {
      const cfg = PERIOD_CONFIG[period];
      if (!cfg) return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
      timeframe = { key: cfg.key };
      periodLabel = cfg.label;
    }

    const metricsRes = await getMetrics(apiKey);
    const metrics = (metricsRes as { data?: KlaviyoMetric[] })?.data || [];
    const placedOrderId = findMetricId(metrics, 'Placed Order');
    if (!placedOrderId) {
      return NextResponse.json({ error: 'Placed Order metric not found' }, { status: 500 });
    }

    // Pull the variation-grouped report + flow names
    const [reportRes, flowsRes] = await Promise.all([
      getFlowReport(apiKey, {
        conversionMetricId: placedOrderId,
        statistics: [
          'recipients',
          'delivered',
          'open_rate',
          'click_rate',
          'conversion_rate',
          'conversions',
          'conversion_value',
          'revenue_per_recipient',
        ],
        timeframe,
        groupBy: ['send_channel', 'flow_id', 'flow_message_id', 'variation'],
      }),
      getFlows(apiKey),
    ]);

    const rows = extractReportRows(reportRes);
    const flowData = (flowsRes as { data?: KlaviyoFlow[] })?.data || [];
    const flowNameById: Record<string, string> = {};
    for (const f of flowData) {
      if (f?.id) flowNameById[f.id] = f.attributes?.name || '(untitled flow)';
    }

    const selectedFlowIdSet = new Set(flowIds);

    // Build test data: one entry per (flow_id, flow_message_id) with multiple variations.
    const testMap: Record<string, TestData> = {};
    for (const row of rows) {
      const g = row.groupings || {};
      if (!selectedFlowIdSet.has(g.flow_id)) continue;
      const fId = g.flow_id;
      const mId = g.flow_message_id;
      const variation = g.variation;
      if (!fId || !mId || !variation) continue;

      const key = `${fId}:${mId}`;
      if (!testMap[key]) {
        testMap[key] = {
          flow_id: fId,
          flow_name: flowNameById[fId] || `(unknown flow ${fId.slice(0, 8)})`,
          flow_message_id: mId,
          flow_message_label: `Message ${mId.slice(0, 8)}`,
          variations: [],
          server_suggested_winner: null,
        };
      }

      const stats = row.statistics || {};
      testMap[key].variations.push({
        name: variation,
        recipients: num(stats.recipients),
        delivered: num(stats.delivered),
        open_rate_pct: round(num(stats.open_rate) * 100, 1),
        click_rate_pct: round(num(stats.click_rate) * 100, 2),
        conversion_rate_pct: round(num(stats.conversion_rate) * 100, 2),
        conversions: num(stats.conversions),
        revenue: round(num(stats.conversion_value), 2),
        rpr: round(num(stats.revenue_per_recipient), 2),
      });
    }

    // Filter to real tests (>=2 variations) and pick a suggested winner per test
    const tests: TestData[] = [];
    for (const t of Object.values(testMap)) {
      if (t.variations.length < 2) continue;
      // Winner = highest revenue; fall back to highest conversion rate if all zero
      const sortedByRevenue = [...t.variations].sort((a, b) => b.revenue - a.revenue);
      let winner: string | null = null;
      if (sortedByRevenue[0].revenue > 0 && sortedByRevenue[0].revenue > sortedByRevenue[1].revenue) {
        winner = sortedByRevenue[0].name;
      } else {
        // Tiebreak by conversion rate
        const sortedByConv = [...t.variations].sort((a, b) => b.conversion_rate_pct - a.conversion_rate_pct);
        if (sortedByConv[0].conversion_rate_pct > sortedByConv[1].conversion_rate_pct) {
          winner = sortedByConv[0].name;
        }
      }
      t.server_suggested_winner = winner;
      tests.push(t);
    }

    if (tests.length === 0) {
      return NextResponse.json(
        { error: 'No A/B tests found for the selected flows in this period.' },
        { status: 404 }
      );
    }

    // Build payload for AI
    const payloadJson = JSON.stringify(
      {
        brand: { name: brand.name, category: brand.category || 'unknown', voice: brand.voice || 'unknown' },
        period_label: periodLabel,
        tests,
      },
      null,
      2
    );

    const userPrompt = `Analyse these A/B test results for ${brand.name} covering ${periodLabel}.

=== HARD RULES ===
1. Every number comes from the JSON below. Do NOT fabricate.
2. Use the exact variation names from the data. Never invent names.
3. No raw IDs in the output. Use flow names only.
4. Use server_suggested_winner as a hint but verify it against the numbers.
5. Be honest about inconclusive tests.
6. Return ONLY the markdown inside <report>...</report> tags.

=== TEST DATA ===
\`\`\`json
${payloadJson}
\`\`\`
`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 6000,
      system: TEST_RESULTS_ANALYST_SKILL,
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
      periodLabel,
      report,
      tests, // return the raw structured data so the DOCX exporter can re-render it
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
