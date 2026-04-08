import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMetrics, getFlowReport } from '@/lib/klaviyo';

export const maxDuration = 60;

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

    const { data: brand } = await supabase
      .from('brands')
      .select('id, name, klaviyo_api_key')
      .eq('id', brandId)
      .single();

    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    if (!brand.klaviyo_api_key) {
      return NextResponse.json({ error: 'This brand has no Klaviyo API key configured.' }, { status: 400 });
    }

    const apiKey = brand.klaviyo_api_key;

    // Resolve timeframe
    let timeframe: { key?: string; start?: string; end?: string };
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
    } else {
      const cfg = PERIOD_CONFIG[period];
      if (!cfg) return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
      timeframe = { key: cfg.key };
    }

    // Find Placed Order metric
    const metricsRes = await getMetrics(apiKey);
    const metrics = (metricsRes as { data?: KlaviyoMetric[] })?.data || [];
    const placedOrderId = findMetricId(metrics, 'Placed Order');
    if (!placedOrderId) {
      return NextResponse.json({ error: 'Placed Order metric not found' }, { status: 500 });
    }

    // Pull flow report with native name groupings so we get real names directly.
    const reportRes = await getFlowReport(apiKey, {
      conversionMetricId: placedOrderId,
      statistics: ['recipients', 'delivered', 'open_rate', 'click_rate', 'conversion_rate', 'conversions', 'conversion_value'],
      timeframe,
      groupBy: [
        'send_channel',
        'flow_id',
        'flow_name',
        'flow_message_id',
        'variation',
        'variation_name',
      ],
    });

    const rows = extractReportRows(reportRes);

    // Group rows by (flow_id + flow_message_id). Any group with > 1 distinct
    // variation is an A/B test. Capture the flow_name from the row.
    const groups: Record<
      string,
      { flow_id: string; flow_name: string; flow_message_id: string; variations: Set<string>; recipients: number }
    > = {};
    for (const row of rows) {
      const g = row.groupings || {};
      const fId = g.flow_id;
      const mId = g.flow_message_id;
      const variation = g.variation_name || g.variation;
      if (!fId || !mId || !variation) continue;
      const key = `${fId}:${mId}`;
      if (!groups[key]) {
        groups[key] = {
          flow_id: fId,
          flow_name: g.flow_name || `(flow ${fId.slice(0, 8)})`,
          flow_message_id: mId,
          variations: new Set(),
          recipients: 0,
        };
      }
      groups[key].variations.add(variation);
      groups[key].recipients += Number(row.statistics?.recipients || 0);
    }

    // Aggregate to one entry per flow (rolling up multiple tested messages)
    const byFlow: Record<
      string,
      { flow_id: string; flow_name: string; trigger: string; status: string; test_count: number; variation_count: number; recipients: number }
    > = {};
    for (const g of Object.values(groups)) {
      if (g.variations.size < 2) continue; // not an A/B test
      if (!byFlow[g.flow_id]) {
        byFlow[g.flow_id] = {
          flow_id: g.flow_id,
          flow_name: g.flow_name,
          trigger: 'unknown',
          status: 'unknown',
          test_count: 0,
          variation_count: 0,
          recipients: 0,
        };
      }
      byFlow[g.flow_id].test_count += 1;
      byFlow[g.flow_id].variation_count += g.variations.size;
      byFlow[g.flow_id].recipients += g.recipients;
    }

    const flows = Object.values(byFlow).sort((a, b) => b.recipients - a.recipients);

    return NextResponse.json({ flows, total: flows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
