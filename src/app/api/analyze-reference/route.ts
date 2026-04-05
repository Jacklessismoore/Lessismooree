import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: Request) {
  try {
    const { imageUrl } = await req.json();
    if (!imageUrl) return NextResponse.json({ error: 'Image URL required' }, { status: 400 });

    // Fetch the image and convert to base64
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      return NextResponse.json({ error: 'Could not fetch image' }, { status: 400 });
    }

    const imageBuffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString('base64');
    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';

    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'URL does not point to an image' }, { status: 400 });
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: contentType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: base64,
            },
          },
          {
            type: 'text',
            text: `You are an email design analyst for a DTC e-commerce email marketing agency. Evaluate this email screenshot for our reference library.

STEP 1: IDENTIFY THE BRAND
Look for: logo at the top, footer brand name, product packaging, domain names in buttons/links. If you can identify the brand, record it. If not, record "Unknown".

STEP 2: CLASSIFY THE EMAIL
Determine the email type: Promotional, Sale/Discount, Educational, Social Proof, Founder Story, Product Launch, Seasonal/Holiday, Winback, Post-Purchase, Welcome, Plain Text, or Informational.
Determine the structure: Single Hero, Hero + Product Grid, Long-Form Editorial, Countdown/Urgency, Infographic, Modular, or Minimal/Text-Forward.

STEP 3: CLASSIFY THE VERTICAL
Map to: Health & Wellness, Beauty & Skincare, Fashion & Apparel, Food & Beverage, Pet / Animal Care, Home & Garden, Kids & Baby, Sports & Fitness, Jewellery & Accessories, Tech & Electronics, Supplements, Wellness & Self-Care, or Other.

STEP 4: EVALUATE
Write 2-3 specific sentences about what makes this email worth referencing. Be specific about design choices, layout, CTA placement, imagery, copy approach. Not generic praise.

STEP 5: GENERATE TAGS
Pick 5-8 tags from: Great Subject Line, Strong CTA, Good Layout, Social Proof, Product Feature, Founder Voice, Urgency, Educational, Minimal Design, Bold Design, Good Mobile, Infographic, Comparison, Review Feature, Launch, Whole Email, premium-feel, lifestyle-imagery, product-grid, countdown-timer, dark-background, clean-typography.

Return ONLY this JSON, no other text:
{
  "title": "Descriptive name like 'Brand Name - Email Type Description'",
  "framework": "One of: Promotional, Educational, Founder Story, Social Proof, Product Launch, Winback",
  "industry": "One of: Pet / Animal Care, Health & Wellness, Fashion & Apparel, Beauty & Skincare, Food & Beverage, Home & Garden, Kids & Baby, Sports & Fitness, Jewellery & Accessories, Tech & Electronics, Supplements, Other",
  "notes": "2-3 sentences evaluating what makes this email a strong reference. Be specific about design, layout, CTA, imagery, and strategic choices.",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}`,
          },
        ],
      }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return NextResponse.json({
        title: parsed.title || '',
        framework: parsed.framework || 'Promotional',
        industry: parsed.industry || 'Other',
        notes: parsed.notes || '',
        tags: parsed.tags || [],
      });
    }

    return NextResponse.json({ error: 'Could not analyse image' }, { status: 400 });
  } catch (e) {
    console.error('Reference analysis error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
