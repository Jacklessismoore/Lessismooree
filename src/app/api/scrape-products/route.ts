import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  vendor: string;
  product_type: string;
  images: { src: string }[];
  variants: { price: string }[];
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { websiteUrl, brandId } = await request.json();

    if (!websiteUrl || !brandId) {
      return NextResponse.json({ error: 'Website URL and brand ID required' }, { status: 400 });
    }

    // Clean the URL to get the base domain
    let baseUrl = websiteUrl.trim().replace(/\/+$/, '');
    if (!baseUrl.startsWith('http')) baseUrl = `https://${baseUrl}`;

    // Fetch products from Shopify's public JSON endpoint
    const allProducts: ShopifyProduct[] = [];
    let page = 1;
    const maxPages = 5; // Safety limit

    while (page <= maxPages) {
      const url = `${baseUrl}/products.json?limit=250&page=${page}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'LIM-Email-Workbench/1.0' },
      });

      if (!res.ok) {
        if (page === 1) {
          return NextResponse.json(
            { error: `Could not reach ${baseUrl}/products.json — is this a Shopify store?` },
            { status: 400 }
          );
        }
        break;
      }

      const data = await res.json();
      const products: ShopifyProduct[] = data.products || [];

      if (products.length === 0) break;

      allProducts.push(...products);

      // If less than 250, we've reached the last page
      if (products.length < 250) break;
      page++;
    }

    if (allProducts.length === 0) {
      return NextResponse.json({ error: 'No products found' }, { status: 404 });
    }

    // Strip HTML tags from description
    const stripHtml = (html: string) => html?.replace(/<[^>]*>/g, '').trim() || '';

    // Map to our format
    const mapped = allProducts.map(p => ({
      brand_id: brandId,
      title: p.title,
      handle: p.handle,
      product_url: `${baseUrl}/products/${p.handle}`,
      image_url: p.images?.[0]?.src || '',
      price: p.variants?.[0]?.price || '',
      description: stripHtml(p.body_html || '').slice(0, 500),
      product_type: p.product_type || '',
      vendor: p.vendor || '',
    }));

    // Only save to DB if we have a real brand ID (not 'temp' for new clients)
    if (brandId && brandId !== 'temp') {
      await supabase.from('brand_products').delete().eq('brand_id', brandId);

      // Insert in batches of 50
      for (let i = 0; i < mapped.length; i += 50) {
        const batch = mapped.slice(i, i + 50);
        const { error } = await supabase.from('brand_products').insert(batch);
        if (error) throw error;
      }
    }

    return NextResponse.json({
      count: mapped.length,
      products: mapped.slice(0, 20), // Return first 20 for preview
    });
  } catch (error) {
    console.error('Scrape products error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scraping failed' },
      { status: 500 }
    );
  }
}
