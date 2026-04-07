import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUserRole, roleAllowedForAbTests } from '@/lib/roles';

// POST /api/ab-tests → save a batch of tests in one go (used on export).
// Body: { brandId, flowId, flowName, hypothesis?, tests: [{ flow_message_id, flow_message_label, original_subject, original_preview, variant_subject, variant_preview, hypothesis }] }
export async function POST(request: NextRequest) {
  try {
    const role = await getCurrentUserRole();
    if (!roleAllowedForAbTests(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { brandId, flowId, flowName, hypothesis, tests } = body as {
      brandId: string;
      flowId: string;
      flowName: string;
      hypothesis?: string;
      tests: Array<{
        flow_message_id: string;
        flow_message_label: string | null;
        original_subject: string | null;
        original_preview: string | null;
        variant_subject: string;
        variant_preview: string | null;
        hypothesis: string | null;
      }>;
    };

    if (!brandId || !flowId || !tests?.length) {
      return NextResponse.json({ error: 'brandId, flowId, and tests required' }, { status: 400 });
    }

    const supabase = await createClient();
    const batchId = randomUUID();

    const rows = tests.map((t) => ({
      batch_id: batchId,
      brand_id: brandId,
      flow_id: flowId,
      flow_name: flowName,
      flow_message_id: t.flow_message_id,
      flow_message_label: t.flow_message_label,
      original_subject: t.original_subject,
      original_preview: t.original_preview,
      variant_subject: t.variant_subject,
      variant_preview: t.variant_preview,
      hypothesis: t.hypothesis || hypothesis || null,
      status: 'exported',
    }));

    const { error } = await supabase.from('ab_tests').insert(rows);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ batch_id: batchId, saved: rows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/ab-tests?batchId=... → deletes every row in the batch
export async function DELETE(request: NextRequest) {
  try {
    const role = await getCurrentUserRole();
    if (!roleAllowedForAbTests(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');
    if (!batchId) {
      return NextResponse.json({ error: 'batchId required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { error, count } = await supabase
      .from('ab_tests')
      .delete({ count: 'exact' })
      .eq('batch_id', batchId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deleted: count ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET /api/ab-tests?brandId=... → returns batches grouped by batch_id with their tests.
export async function GET(request: NextRequest) {
  try {
    const role = await getCurrentUserRole();
    if (!roleAllowedForAbTests(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId');
    if (!brandId) {
      return NextResponse.json({ error: 'brandId required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('ab_tests')
      .select('*')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by batch_id
    const batches = new Map<string, typeof data>();
    for (const row of data || []) {
      const key = row.batch_id || `single-${row.id}`;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key)!.push(row);
    }

    const grouped = Array.from(batches.entries()).map(([batch_id, tests]) => ({
      batch_id,
      created_at: tests![0].created_at,
      hypothesis: tests![0].hypothesis,
      num_tests: tests!.length,
      tests,
    }));

    return NextResponse.json({ batches: grouped });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
