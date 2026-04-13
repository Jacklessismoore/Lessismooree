import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { KLAVIYO_AUDIT_SKILL } from '@/lib/skills/klaviyo-audit';

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// ─── JSON repair (same as run/route.ts) ───
function repairTruncatedJson(raw: string): string | null {
  let s = raw.trim();
  if (!s.startsWith('{') && !s.startsWith('[')) return null;
  s = s.replace(/```\s*$/, '').trim();
  const stack: Array<'{' | '['> = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch as '{' | '[');
    else if (ch === '}' || ch === ']') {
      const want = ch === '}' ? '{' : '[';
      if (stack[stack.length - 1] === want) stack.pop();
    }
  }
  if (stack.length === 0 && !inString) return s;
  let inStr = false; let esc = false; let lastSafeComma = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === ',') lastSafeComma = i;
  }
  let truncAt = lastSafeComma > 0 ? lastSafeComma : s.length;
  let repaired = s.slice(0, truncAt).trimEnd();
  const stack2: Array<'{' | '['> = [];
  let inStr2 = false; let esc2 = false;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (esc2) { esc2 = false; continue; }
    if (ch === '\\' && inStr2) { esc2 = true; continue; }
    if (ch === '"') { inStr2 = !inStr2; continue; }
    if (inStr2) continue;
    if (ch === '{' || ch === '[') stack2.push(ch as '{' | '[');
    else if (ch === '}') { if (stack2[stack2.length - 1] === '{') stack2.pop(); }
    else if (ch === ']') { if (stack2[stack2.length - 1] === '[') stack2.pop(); }
  }
  while (stack2.length > 0) {
    const open = stack2.pop();
    repaired += open === '{' ? '}' : ']';
  }
  return repaired;
}

type ParsedAudit = {
  overall_score?: number;
  overall_summary?: string;
  top_3_priorities?: string[];
  dimensions?: Record<string, unknown>;
  action_plan?: Array<{ action: string; owner: string; priority: string; effort: string }>;
};

function extractJson(text: string): ParsedAudit | null {
  const tagged = text.match(/<json>([\s\S]*?)<\/json>/);
  if (tagged) {
    try { return JSON.parse(tagged[1].trim()); } catch { /* fall through */ }
  }
  const openTag = text.match(/<json>([\s\S]*)$/);
  if (openTag) {
    const body = openTag[1].trim();
    try { return JSON.parse(body); } catch {
      const repaired = repairTruncatedJson(body);
      if (repaired) { try { return JSON.parse(repaired); } catch { /* fall through */ } }
    }
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    let body = text.slice(first, last + 1)
      .replace(/```json\s*/g, '').replace(/```\s*/g, '')
      .replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(body); } catch {
      const repaired = repairTruncatedJson(body);
      if (repaired) { try { return JSON.parse(repaired); } catch { /* fall through */ } }
    }
  }
  const anyJson = text.slice(text.indexOf('{'));
  if (anyJson.startsWith('{')) {
    const cleaned = anyJson.replace(/```json\s*/g, '').replace(/```\s*/g, '').replace(/,\s*([}\]])/g, '$1');
    const repaired = repairTruncatedJson(cleaned);
    if (repaired) { try { return JSON.parse(repaired); } catch { /* fall through */ } }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { brandName, vertical, computed } = (await request.json()) as {
      brandName: string;
      vertical: string;
      computed: Record<string, unknown>;
    };

    const payloadJson = JSON.stringify(
      { brand: { name: brandName, vertical }, period_label: 'Last 90 days', computed },
      null, 2
    );

    const userPrompt = `Audit the Klaviyo account for ${brandName} (vertical: ${vertical}, covering the last 90 days).

The server pulled the data — it's all in the "computed" object below. YOU are the evaluator: score each of the 8 dimensions 0-100 using the methodology in your system prompt, then write findings and an action plan.

Return the audit as a JSON object wrapped in <json>...</json> tags.

=== DATA ===
\`\`\`json
${payloadJson}
\`\`\`
`;

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const send = (obj: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        };

        // Heartbeat every 5s to keep Vercel alive
        const heartbeat = setInterval(() => {
          try { controller.enqueue(encoder.encode(`: heartbeat\n\n`)); } catch { /* closed */ }
        }, 5000);

        try {
          send({ status: 'Running AI analysis...' });

          const aiStream = anthropic.messages.stream({
            model: 'claude-sonnet-4-5',
            max_tokens: 16000,
            system: KLAVIYO_AUDIT_SKILL,
            messages: [{ role: 'user', content: userPrompt }],
          });

          aiStream.on('text', (text) => {
            send({ chunk: text });
          });

          const finalMsg = await aiStream.finalMessage();
          const fullText = finalMsg.content
            .filter((b) => b.type === 'text')
            .map((b) => ('text' in b ? b.text : ''))
            .join('');
          const stopReason = finalMsg.stop_reason;

          const parsed = extractJson(fullText);
          if (!parsed || !parsed.overall_summary) {
            send({ error: `AI returned no usable audit (stop_reason: ${stopReason}). Tail: ${fullText.slice(-500)}` });
          } else {
            send({ done: true, audit: parsed });
          }
        } catch (err) {
          send({ error: err instanceof Error ? err.message : 'AI analysis failed' });
        } finally {
          clearInterval(heartbeat);
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
