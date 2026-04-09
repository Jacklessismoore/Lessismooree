import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Redirects the user to Google's OAuth consent screen. On success, Google
// will redirect back to /api/google-oauth/callback with an auth code.
export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID not configured on the server' },
      { status: 500 }
    );
  }

  // Build the redirect URI from the request so it works in dev + prod
  const url = new URL(req.url);
  const redirectUri = `${url.origin}/api/google-oauth/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events email',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
