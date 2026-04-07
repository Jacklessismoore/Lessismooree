import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import {
  getMetrics,
  getCampaignReport,
  getFlowReport,
} from '@/lib/klaviyo';
import { CLIENT_PERFORMANCE_REPORT_SKILL } from '@/lib/skills/client-performance-report';

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

interface KlaviyoMetric {
  id: string;
  attributes?: { name?: string };
}

function findMetricId(metrics: KlaviyoMetric[], name: string): string | null {
  return metrics.find((m) => m.attributes?.name === name)?.id ?? null;
}

async function safe<T>(promise: Promise<T>, label: string, ms = 20_000): Promise<T | { error: string }> {
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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { brandId, period } = (await request.json()) as {
      brandId: string;
      period: '7d' | '30d';
    };

    if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 });
    if (period !== '7d' && period !== '30d') {
      return NextResponse.json({ error: 'period must be 7d or 30d' }, { status: 400 });
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

    // Date range
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (period === '7d' ? 7 : 30));
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
      'opens',
      'opens_unique',
      'clicks',
      'clicks_unique',
      'conversion_uniques',
      'conversions',
      'bounced',
      'unsubscribes',
      'spam_complaints',
      'open_rate',
      'click_rate',
      'click_to_open_rate',
      'conversion_rate',
      'unsubscribe_rate',
      'bounce_rate',
      'spam_complaint_rate',
    ];
    const reportValueStats = ['conversion_value', 'revenue_per_recipient', 'average_order_value'];

    // Pull campaign and flow reports in parallel
    const [campaignReportRes, flowReportRes] = await Promise.all([
      safe(
        getCampaignReport(apiKey, {
          conversionMetricId: placedOrderId,
          statistics: reportStats,
          valueStatistics: reportValueStats,
          timeframe: { start: startISO, end: endISO },
        }),
        'get_campaign_report'
      ),
      safe(
        getFlowReport(apiKey, {
          conversionMetricId: placedOrderId,
          statistics: reportStats,
          valueStatistics: reportValueStats,
          timeframe: { start: startISO, end: endISO },
        }),
        'get_flow_report'
      ),
    ]);

    const periodLabel = period === '7d' ? 'Last 7 days' : 'Last 30 days';

    const payloadJson = `{
  "brand": ${JSON.stringify({ name: brand.name, category: brand.category || 'unknown', voice: brand.voice || 'unknown' })},
  "period_label": ${JSON.stringify(periodLabel)},
  "period": ${JSON.stringify({ start: startISO, end: endISO })},
  "campaign_report": ${stringifyTrimmed(campaignReportRes, 14000)},
  "flow_report": ${stringifyTrimmed(flowReportRes, 14000)}
}`;

    const userPrompt = `Build a Weekly Wrap performance report for ${brand.name} covering ${periodLabel}.

This is a recurring client check-in. The output must be ready to copy-paste into Slack — no markdown headings, no code blocks, just the formatted report exactly as the skill template specifies.

Use the JSON data below. Every number must come from this data — never fabricate figures. If a section is empty or errored, say "No data for this period" in the relevant section.

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
