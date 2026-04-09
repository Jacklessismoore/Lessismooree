import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

// Delete a user entirely: removes their row from user_roles AND deletes the
// auth user. Only admins and account_managers can call this. Requires the
// service role key server-side because auth user deletion is privileged.
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate the caller via the normal server client
    const supabase = await createServerClient();
    const {
      data: { user: caller },
    } = await supabase.auth.getUser();
    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Load the caller's role — must be admin or account_manager
    const { data: callerRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .maybeSingle();

    const role = callerRole?.role;
    if (role !== 'admin' && role !== 'account_manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 3. Get the target user id
    const { userId } = (await request.json()) as { userId?: string };
    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    // 4. Don't let callers delete themselves (footgun)
    if (userId === caller.id) {
      return NextResponse.json(
        { error: "You can't delete yourself" },
        { status: 400 }
      );
    }

    // 5. Use service role to delete from auth.users (and cascade user_roles)
    const admin = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Delete the user_roles row first (in case there's no FK cascade)
    await admin.from('user_roles').delete().eq('user_id', userId);

    // Delete the auth user itself
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      return NextResponse.json(
        { error: `Auth delete failed: ${deleteError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
