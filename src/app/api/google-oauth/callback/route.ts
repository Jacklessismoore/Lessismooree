import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Google redirects here after the user consents. We exchange the auth code
// for an access + refresh token, identify the Google account, and store the
// whole bundle on the user_calendar_settings row for the logged-in Supabase
// user.
export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Google OAuth credentials not configured' },
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const errorParam = url.searchParams.get('error');
  if (errorParam) {
    return NextResponse.redirect(`${url.origin}/my-calendar?google_error=${errorParam}`);
  }
  if (!code) {
    return NextResponse.redirect(`${url.origin}/my-calendar?google_error=no_code`);
  }

  const redirectUri = `${url.origin}/api/google-oauth/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) {
    const detail = await tokenRes.text();
    return NextResponse.redirect(
      `${url.origin}/my-calendar?google_error=${encodeURIComponent('token_exchange_failed: ' + detail.slice(0, 200))}`
    );
  }
  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    id_token?: string;
  };

  // Identify the Google account
  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const userInfo = (userInfoRes.ok ? await userInfoRes.json() : {}) as { email?: string };

  // Persist tokens on the user's settings row
  const sb = await createClient();
  if (!sb) {
    return NextResponse.redirect(`${url.origin}/my-calendar?google_error=no_supabase`);
  }
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${url.origin}/login?google_error=not_logged_in`);
  }

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  const updates: Record<string, unknown> = {
    user_id: user.id,
    google_access_token: tokenData.access_token,
    google_token_expires_at: expiresAt,
    google_account_email: userInfo.email ?? null,
    google_calendar_id: 'primary',
    updated_at: new Date().toISOString(),
  };
  if (tokenData.refresh_token) {
    updates.google_refresh_token = tokenData.refresh_token;
  }

  const { error: upsertErr } = await sb
    .from('user_calendar_settings')
    .upsert(updates, { onConflict: 'user_id' });
  if (upsertErr) {
    return NextResponse.redirect(
      `${url.origin}/my-calendar?google_error=${encodeURIComponent(upsertErr.message)}`
    );
  }

  return NextResponse.redirect(`${url.origin}/my-calendar?google_connected=1`);
}
