import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { getMetrics, getFlowReport } from '@/lib/klaviyo';
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
  if (match) return match[1].trim();
  // Fallback: strip any stray opening/closing tags and return the body if it
  // looks like a markdown report.
  const cleaned = text
    .replace(new RegExp(`<${tag}>`, 'g'), '')
    .replace(new RegExp(`</${tag}>`, 'g'), '')
    .trim();
  if (cleaned.length > 200 && /^#/m.test(cleaned)) return cleaned;
  return null;
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

    // Pull the variation-grouped report with native flow_name + flow_message_name
    // groupings so we get real names directly without a separate lookup.
    const reportRes = await getFlowReport(apiKey, {
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
      groupBy: [
        'send_channel',
        'flow_id',
        'flow_name',
        'flow_message_id',
        'flow_message_name',
        'variation',
        'variation_name',
      ],
    });

    const rows = extractReportRows(reportRes);
    const selectedFlowIdSet = new Set(flowIds);

    // Build test data: one entry per (flow_id, flow_message_id) with multiple variations.
    const testMap: Record<string, TestData> = {};
    for (const row of rows) {
      const g = row.groupings || {};
      if (!selectedFlowIdSet.has(g.flow_id)) continue;
      const fId = g.flow_id;
      const mId = g.flow_message_id;
      const variation = g.variation_name || g.variation;
      if (!fId || !mId || !variation) continue;

      const key = `${fId}:${mId}`;
      if (!testMap[key]) {
        testMap[key] = {
          flow_id: fId,
          flow_name: g.flow_name || `(flow ${fId.slice(0, 8)})`,
          flow_message_id: mId,
          flow_message_label: g.flow_message_name || `Message ${mId.slice(0, 8)}`,
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

    // Filter to real tests (>=2 variations), pick a winner, and classify each one.
    interface ClassifiedTest extends TestData {
      classification: 'clear_winner' | 'no_revenue' | 'insufficient_sample' | 'too_close';
      lift_pct: number | null;
      winner_revenue: number;
      runner_up_revenue: number;
    }
    const tests: ClassifiedTest[] = [];
    for (const t of Object.values(testMap)) {
      if (t.variations.length < 2) continue;
      const sortedByRevenue = [...t.variations].sort((a, b) => b.revenue - a.revenue);
      const top = sortedByRevenue[0];
      const second = sortedByRevenue[1];
      const totalRecipients = t.variations.reduce((s, v) => s + v.recipients, 0);
      const totalRevenue = t.variations.reduce((s, v) => s + v.revenue, 0);

      let winner: string | null = null;
      let liftPct: number | null = null;
      let classification: ClassifiedTest['classification'];

      if (totalRevenue === 0) {
        classification = 'no_revenue';
      } else if (totalRecipients < 500) {
        classification = 'insufficient_sample';
        // still suggest the leader as a hint
        if (top.revenue > second.revenue) winner = top.name;
      } else if (top.revenue === 0 || second.revenue === 0) {
        winner = top.name;
        liftPct = top.revenue > 0 ? 100 : 0;
        classification = 'clear_winner';
      } else {
        const lift = ((top.revenue - second.revenue) / second.revenue) * 100;
        if (lift >= 20) {
          winner = top.name;
          liftPct = round(lift, 1);
          classification = 'clear_winner';
        } else {
          classification = 'too_close';
        }
      }

      tests.push({
        ...t,
        server_suggested_winner: winner,
        lift_pct: liftPct,
        winner_revenue: top.revenue,
        runner_up_revenue: second.revenue,
        classification,
      });
    }

    if (tests.length === 0) {
      return NextResponse.json(
        { error: 'No A/B tests found for the selected flows in this period.' },
        { status: 404 }
      );
    }

    // ─── Server-side computed summary — NO hallucination possible ───
    const clearWinners = tests.filter((t) => t.classification === 'clear_winner');
    const noRevenue = tests.filter((t) => t.classification === 'no_revenue');
    const insufficientSample = tests.filter((t) => t.classification === 'insufficient_sample');
    const tooClose = tests.filter((t) => t.classification === 'too_close');

    const strongestLift = clearWinners
      .filter((t) => t.lift_pct != null)
      .sort((a, b) => (b.lift_pct || 0) - (a.lift_pct || 0))[0] || null;

    const totalRevenueAcrossTests = tests.reduce(
      (s, t) => s + t.variations.reduce((sv, v) => sv + v.revenue, 0),
      0
    );

    const uniqueFlows = new Set(tests.map((t) => t.flow_name));

    const computedSummary = {
      total_tests: tests.length,
      flows_tested: uniqueFlows.size,
      clear_winners: clearWinners.length,
      too_close_to_call: tooClose.length,
      no_revenue: noRevenue.length,
      insufficient_sample: insufficientSample.length,
      total_revenue_across_all_variations: round(totalRevenueAcrossTests, 2),
      strongest_lift_test: strongestLift
        ? {
            flow_name: strongestLift.flow_name,
            flow_message_label: strongestLift.flow_message_label,
            winner_variation: strongestLift.server_suggested_winner,
            lift_pct: strongestLift.lift_pct,
            winner_revenue: strongestLift.winner_revenue,
            runner_up_revenue: strongestLift.runner_up_revenue,
          }
        : null,
    };

    const payloadJson = JSON.stringify(
      {
        brand: { name: brand.name, category: brand.category || 'unknown', voice: brand.voice || 'unknown' },
        period_label: periodLabel,
        computed_summary: computedSummary,
        tests,
      },
      null,
      2
    );

    const userPrompt = `Write the A/B test results report for ${brand.name} covering ${periodLabel}.

=== CRITICAL: USE THE COMPUTED SUMMARY VERBATIM ===
The "computed_summary" object below has already been calculated server-side from the raw test data. For the Summary section of your report, you MUST use ONLY the numbers from computed_summary. DO NOT invent or estimate. The numbers there are:
- total_tests: how many tests ran
- clear_winners: tests with a decisive winner
- too_close_to_call: tests where the lift was <20%
- no_revenue: tests where neither variation generated revenue
- insufficient_sample: tests with <500 total recipients
- strongest_lift_test: the single best-performing test with its flow name, variation name, lift %, and the exact revenue numbers

For example, if computed_summary.strongest_lift_test.flow_name is "LIM | Welcome Flow" and .lift_pct is 33.9, your Summary MUST say "LIM | Welcome Flow" and "+33.9% lift" — never invent a different flow name or a different percentage.

=== FOR EACH TEST IN tests[] ===
Output a section per test. For the variation table, put the EXACT variation name from test.variations[i].name in the Variation column — nothing more, nothing less. Never concatenate dates, flow names, or test numbers into that cell.

Use the classification field to decide the Winner/Recommendation:
- clear_winner: Winner = server_suggested_winner, Lift = lift_pct%, Recommendation = "Pick winner now"
- too_close: Winner = "Inconclusive — too close to call", Recommendation = "Continue testing"
- no_revenue: Winner = "Inconclusive — no revenue", Recommendation = "Pause test and review flow messaging"
- insufficient_sample: Winner = "Inconclusive — insufficient sample", Recommendation = "Keep running until 500+ recipients per variation"

=== HARD RULES ===
1. NEVER fabricate numbers. Every figure must come from computed_summary or tests[].
2. NEVER invent a flow name. Use test.flow_name exactly.
3. NEVER put anything except the raw variation name in the Variation column.
4. NEVER claim a flow is a winner unless its classification in tests[] is "clear_winner".
5. Return ONLY the markdown inside <report>...</report> tags.

=== DATA ===
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
        {
          error: `AI returned no usable report. First 500 chars: ${fullText.slice(0, 500) || '(empty)'}`,
        },
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
