import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 30;

// Parse PDF / DOCX / plain-text uploads from the client form into raw text
// that the existing /api/analyze endpoint can consume.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    let text = '';
    if (name.endsWith('.pdf')) {
      // pdf-parse — dynamic import to keep cold-start lean
      const pdfParse = (await import('pdf-parse')).default;
      const parsed = await pdfParse(buffer);
      text = parsed.text || '';
    } else if (name.endsWith('.docx')) {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      text = result.value || '';
    } else if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.csv')) {
      text = buffer.toString('utf-8');
    } else {
      return NextResponse.json(
        { error: 'Unsupported file type. Use PDF, DOCX, TXT, MD, or CSV.' },
        { status: 400 }
      );
    }

    if (!text.trim()) {
      return NextResponse.json({ error: 'Could not extract any text from the file.' }, { status: 422 });
    }

    return NextResponse.json({ text, fileName: file.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
