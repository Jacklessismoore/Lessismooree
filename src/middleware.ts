import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || url === 'your_supabase_url_here') {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Allow login page without auth
  if (request.nextUrl.pathname === '/login') {
    if (user) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Allow API routes and static assets (icons must be public for iOS share
  // sheets, link preview crawlers, og:image fetchers, etc.)
  const path = request.nextUrl.pathname;
  if (
    path.startsWith('/api/') ||
    path.startsWith('/_next/') ||
    path === '/favicon.ico' ||
    path === '/icon.svg' ||
    path === '/icon.png' ||
    path === '/apple-icon.png' ||
    path === '/robots.txt' ||
    path === '/sitemap.xml' ||
    path === '/manifest.json' ||
    path === '/manifest.webmanifest'
  ) {
    return supabaseResponse;
  }

  // Redirect unauthenticated users to login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Skip middleware for static assets, icons, and Next internals
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|icon.png|apple-icon.png|robots.txt|sitemap.xml|manifest.json).*)',
  ],
};
