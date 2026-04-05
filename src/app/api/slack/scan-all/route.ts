import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// This endpoint scans ALL brands with Slack channels
// Can be called by Vercel Cron or any scheduler
export async function GET(request: Request) {
  // Optional: verify cron secret for security
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get all brands with Slack channels
  const { data: brands, error } = await supabase
    .from('brands')
    .select('id, name, slack_channel_id, manager_id, manager:managers(name)')
    .neq('slack_channel_id', '')
    .not('slack_channel_id', 'is', null);

  if (error || !brands || brands.length === 0) {
    return NextResponse.json({ message: 'No brands with Slack channels', scanned: 0 });
  }

  // Get manager names for team member detection
  const { data: managers } = await supabase.from('managers').select('name');
  const teamMembers = (managers || []).map((m: { name: string }) => m.name);

  let totalNew = 0;
  const results: { brand: string; actionable: number; error?: string }[] = [];

  for (const brand of brands) {
    try {
      // Call the scan endpoint internally
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

      const res = await fetch(`${baseUrl}/api/slack/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: brand.id,
          channelId: brand.slack_channel_id,
          brandName: brand.name,
          teamMembers,
        }),
      });

      const data = await res.json();
      const actionable = data.actionable || 0;
      totalNew += actionable;
      results.push({ brand: brand.name, actionable });
    } catch (e) {
      results.push({ brand: brand.name, actionable: 0, error: String(e) });
    }
  }

  return NextResponse.json({
    scanned: brands.length,
    totalNew,
    totalNewItems: totalNew,
    results,
    timestamp: new Date().toISOString(),
  });
}

// Also support POST for client-side calls
export async function POST(request: Request) {
  return GET(request);
}
