import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  try {
    const { briefContent, brand, emailName, isPlainText } = await req.json();

    const systemPrompt = `You are a subject line and preview text specialist for DTC e-commerce email marketing. You generate subject lines and preview text ONLY. No other content.

SUBJECT LINE FRAMEWORK:
- 2-5 words in length
- Title Case, Like This
- Builds curiosity without being clickbait
- 1-2 emojis at the end (optional, brand-dependent)
- No em dashes
- No benefit stacking (one idea per subject line)

PREVIEW TEXT FRAMEWORK:
- One full sentence long
- Regular capitalization (not title case)
- Adds support or context to the subject line (not a repeat)
- Can end with ... to build intrigue

EXAMPLES:
Subject Lines: "A Taste of Sunshine", "Myth. Busted.", "They're Finally Here", "It's Literally This Easy", "We're Going CocoNUTS", "Vacation Time?", "They're Baaaaaack"
Preview Texts: "This wasn't supposed to be made, but now it's a bestseller...", "If you want the cold hard facts, we got them...", "No one is talking about this but it will make you more money..."

Return ONLY a JSON object with this exact format:
{"subjectLine": "Your Subject Line", "previewText": "Your preview text that adds context..."}`;

    const userPrompt = `Generate a subject line and preview text for this email.

Brand: ${brand.name} | ${brand.category || ''} | Voice: ${brand.voice || 'Not specified'}
Email Name: ${emailName}
${isPlainText ? 'Format: Plain text / founder email' : 'Format: Designed email'}

Brief content summary:
${briefContent.slice(0, 2000)}

Return ONLY the JSON object. No other text.`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return NextResponse.json(parsed);
    }

    return NextResponse.json({ subjectLine: '', previewText: '' });
  } catch (error) {
    console.error('SL/PT suggestion error:', error);
    return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 });
  }
}
