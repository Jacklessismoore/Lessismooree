import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getLiveFlowsWithMessages } from '@/lib/klaviyo';
import { getCurrentUserRole, roleAllowedForAbTests } from '@/lib/roles';

export async function POST(request: NextRequest) {
  try {
    const role = await getCurrentUserRole();
    if (!roleAllowedForAbTests(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { brandId } = await request.json();
    if (!brandId) {
      return NextResponse.json({ error: 'brandId required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: brand, error: brandErr } = await supabase
      .from('brands')
      .select('id, name, klaviyo_api_key')
      .eq('id', brandId)
      .single();

    if (brandErr || !brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }
    if (!brand.klaviyo_api_key) {
      return NextResponse.json(
        { error: 'This brand has no Klaviyo API key configured. Add one on the client page first.' },
        { status: 400 }
      );
    }

    const flows = await getLiveFlowsWithMessages(brand.klaviyo_api_key);
    return NextResponse.json({ brand: { id: brand.id, name: brand.name }, flows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
