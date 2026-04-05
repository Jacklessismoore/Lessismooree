import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

    // Check if it's a direct image URL
    if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url)) {
      return NextResponse.json({
        title: url.split('/').pop()?.split('?')[0] || 'Image',
        ogImage: url,
        url,
      });
    }

    // Try to fetch the page
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      // Common blocking — suggest screenshot instead
      if (res.status === 403 || res.status === 429) {
        return NextResponse.json({
          error: 'This site blocks automated access. Take a screenshot of the email, upload it to Google Drive (set to public), and paste the image link instead.',
          blocked: true,
        }, { status: 200 }); // Return 200 so frontend can show the message nicely
      }
      return NextResponse.json({ error: `Failed to fetch (${res.status}). Try pasting a direct image URL instead.` }, { status: 200 });
    }

    const html = await res.text();

    // Extract og:image for thumbnail
    const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/) ||
                         html.match(/<meta[^>]*content="([^"]*)"[^>]*property="og:image"/);
    const ogImage = ogImageMatch?.[1] || null;

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch?.[1]?.trim()?.replace(/\s*[|\-–—].*$/, '') || '';

    return NextResponse.json({
      title,
      ogImage,
      url,
    });
  } catch (e) {
    return NextResponse.json({
      error: 'Could not reach this URL. Try pasting a direct image link instead.',
    }, { status: 200 });
  }
}
